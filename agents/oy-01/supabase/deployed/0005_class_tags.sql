/* ------------------------------------------------------------------
   LearnGeo 0005 — class tags.

   A class can have a four-letter tag and a glyph, the way a Discord
   server has one, and a student can choose to wear the tag of a class
   they are in. Wearing one is the student's choice. The tag itself
   belongs to the class, and only that class's teacher writes it.

   NOT APPLIED YET. Written and tested on 2026-09-25 against the live
   database inside a transaction that was rolled back on purpose.
   Nothing in this file has run for real. The test log is in
   agents/oy-01/NOTES.md.

   Three rules this file has to hold:
     1. only the class's teacher sets the tag
     2. a student may only wear the tag of a class they are in
     3. when they stop being in it, the tag comes off

   Rule 1 is already true: the classes UPDATE policy is teacher-only, so
   the two new columns inherit it. Rule 2 lives in the profiles UPDATE
   policy, because a policy is the one place a client cannot go around.

   Rule 3 needs more than the foreign key. `on delete set null` covers a
   class that is deleted; it does nothing for a student who leaves or is
   removed, which is the common case. Hence the trigger on class_members.

   And rule 3 is not tidiness, it is the whole reason this file is
   careful. The rule 2 check is a WITH CHECK, and a WITH CHECK is
   evaluated against the entire new row on EVERY update, not only on the
   update that sets the tag. A student left wearing the tag of a class
   they are no longer in would fail that check on their next save — and
   their save is their profile row. They would stop syncing altogether
   because of four cosmetic letters. So the tag is taken off when they
   leave, and taken off again on the way past if one is ever found stale.

   Two more rules arrived after the first draft, both because reading a
   tag turned out to be harder than writing one:

     4. the worn tag is mirrored onto class_members, because the roster
        is the only thing a teacher or a classmate can actually read
     5. the four letters resolve outside the class that issued them,
        because a tag that only works at home is a class badge, not a
        tag

   Rule 4 is done by the database, never by the client: a student cannot
   write class_members and that is deliberate. Rule 5 is one function
   that answers about one class id you already hold. There is no way to
   list classes and their tags, by design.
-------------------------------------------------------------------*/

/* ============================ the columns ========================= */

alter table public.classes       add column if not exists tag          text;
alter table public.classes       add column if not exists tag_glyph    text;
alter table public.profiles      add column if not exists tag_class_id uuid;

/* The mirror (rule 4). Nullable with no default, for the same reason
   level and xp are nullable in 0002: a default here would announce that
   everyone is wearing something in a class where nobody has chosen. */
alter table public.class_members add column if not exists tag_class_id uuid;

/* Exactly four letters, A-Z, no digits and no spaces. The normalising
   trigger below upper-cases first, so a teacher typing "math" is not an
   error, but "MATHS" and "M4TH" are.

   tag_glyph is a glyph NAME, never markup and never a URL: it is drawn
   next to children's names, so the column will not hold anything that
   could be markup in the first place. The character class is wider than
   any list of icons, so adding an icon never needs a migration, and the
   40 is oy-03's own slice length in writeClassTag(). Case is left exactly
   as sent: the glyph vocabulary belongs to the files that draw it, and
   folding it here would break a lookup that is spelled with capitals. */
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'classes_tag_shape') then
    alter table public.classes
      add constraint classes_tag_shape check (tag is null or tag ~ '^[A-Z]{4}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'classes_tag_glyph_shape') then
    alter table public.classes
      add constraint classes_tag_glyph_shape
      check (tag_glyph is null or tag_glyph ~ '^[A-Za-z0-9_-]{1,40}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_tag_class_id_fkey') then
    alter table public.profiles
      add constraint profiles_tag_class_id_fkey
      foreign key (tag_class_id) references public.classes(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'class_members_tag_class_id_fkey') then
    alter table public.class_members
      add constraint class_members_tag_class_id_fkey
      foreign key (tag_class_id) references public.classes(id) on delete set null;
  end if;
end $$;

/* Both `on delete set null` actions have to find the wearers of a deleted
   class, and class_tag() below looks up wearers too. Partial, because
   almost nobody is wearing anything. */
create index if not exists profiles_tag_class_id_idx
  on public.profiles (tag_class_id) where tag_class_id is not null;
create index if not exists class_members_tag_class_id_idx
  on public.class_members (tag_class_id) where tag_class_id is not null;

/* ========================== normalising =========================== */

/* Stored upper case, as agreed. Doing it here rather than rejecting
   lower case means the teacher's UI can send what was typed. An empty
   box comes back as null, not '', so clearing the tag works without a
   special case and without tripping the shape check. The glyph is only
   trimmed. */
create or replace function private.normalize_class_tag()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  new.tag       := nullif(btrim(upper(new.tag)), '');
  new.tag_glyph := nullif(btrim(new.tag_glyph), '');
  return new;
end
$fn$;

drop trigger if exists classes_tag_normalize on public.classes;
create trigger classes_tag_normalize
  before insert or update of tag, tag_glyph on public.classes
  for each row execute function private.normalize_class_tag();

/* ===================== the save clock, defended ==================== */

/* profiles.updated_at is not decoration. cloud.js adopt() compares it
   against the syncedAt this device recorded, and if the server looks
   newer it takes the CLOUD save and drops the device's copy — there is
   no merge on that path. So anything that bumps updated_at without
   changing the save can cost a student the progress they made offline.

   Choosing a tag would do exactly that, and so would clearing one. A
   tag-only change therefore leaves the clock where it was. Every other
   update still bumps it, including one that changes the save and the tag
   together.

   This is a profiles-only copy of private.touch_updated_at() on purpose.
   That function is shared with assignments, announcements and
   live_sessions, and a reference to new.tag_class_id inside it would
   fail at runtime on all three. */
create or replace function private.touch_profile_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  if tg_op = 'UPDATE'
     and new.tag_class_id is distinct from old.tag_class_id
     and new.save         is not distinct from old.save
     and new.display_name is not distinct from old.display_name
     and new.role         is not distinct from old.role then
    new.updated_at := old.updated_at;
    return new;
  end if;
  new.updated_at := now();
  return new;
end
$fn$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch
  before insert or update on public.profiles
  for each row execute function private.touch_profile_updated_at();

/* ======================= taking the tag off ======================== */

/* Leaving a class, or being removed from one, takes its tag off. Runs as
   definer because the row being changed belongs to the student and the
   teacher is usually the one doing the removing. Only ever writes null,
   so it cannot hand anybody a tag. Clearing the profile is enough: the
   mirror below follows it onto every roster the student is still on. */
create or replace function private.drop_tag_on_leave()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  update public.profiles
     set tag_class_id = null
   where id = old.student_id and tag_class_id = old.class_id;
  return old;
end
$fn$;

drop trigger if exists class_members_tag_cleanup on public.class_members;
create trigger class_members_tag_cleanup
  after delete on public.class_members
  for each row execute function private.drop_tag_on_leave();

/* The belt to that brace. If a stale tag ever survives — a path nobody
   thought of, a row restored from a backup — this takes it off quietly
   on the student's next write instead of letting the policy below lock
   them out of their own save.

   Three guards keep it honest: it only ever writes null, it only acts
   when the tag is NOT the thing being changed (so a student trying to
   wear a tag they are not entitled to still gets an error rather than a
   silent no-op), and it only acts on the signed-in student's own row, so
   a definer function writing somebody else's profile never trips it. */
create or replace function private.clear_stale_tag()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if new.tag_class_id is not null
     and new.tag_class_id is not distinct from old.tag_class_id
     and new.id = (select auth.uid())
     and not private.is_class_member(new.tag_class_id)
     and not private.is_class_teacher(new.tag_class_id) then
    new.tag_class_id := null;
  end if;
  return new;
end
$fn$;

/* Named to sort before profiles_touch, so the touch function sees the
   cleared value and knows this was a tag-only change. */
drop trigger if exists profiles_tag_selfheal on public.profiles;
create trigger profiles_tag_selfheal
  before update on public.profiles
  for each row execute function private.clear_stale_tag();

/* ============================ the mirror =========================== */

/* Rule 4. profiles.tag_class_id stays the student's single source of
   truth — one tag at a time — and the database copies it onto every
   roster row that student is on. The client never writes this column and
   has no policy that would let it.

   No `update of tag_class_id` on this trigger, deliberately. That clause
   fires on the columns named in the UPDATE, not on what the row ended up
   holding, so a save that the self-heal trigger quietly cleaned would
   leave the mirror pointing at a class the student is no longer in. The
   WHEN clause below is read after the BEFORE triggers have run, so it
   catches that case. */
create or replace function private.mirror_worn_tag()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  update public.class_members
     set tag_class_id = new.tag_class_id
   where student_id = new.id
     and tag_class_id is distinct from new.tag_class_id;
  return null;
end
$fn$;

drop trigger if exists profiles_tag_mirror on public.profiles;
create trigger profiles_tag_mirror
  after update on public.profiles
  for each row when (new.tag_class_id is distinct from old.tag_class_id)
  execute function private.mirror_worn_tag();

/* Joining a class carries the tag you are already wearing onto that
   class's roster. Definer, because this reads a profiles row that the
   joiner's own policy would not always let it read. */
create or replace function private.fill_member_tag()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  new.tag_class_id := (select p.tag_class_id from public.profiles p where p.id = new.student_id);
  return new;
end
$fn$;

drop trigger if exists class_members_tag_fill on public.class_members;
create trigger class_members_tag_fill
  before insert on public.class_members
  for each row execute function private.fill_member_tag();

/* ============================ the rule ============================= */

/* The only change to these two policies is the tag clause. A policy
   cannot restrict which COLUMNS an update touches, so the rule is
   written as a condition on the value instead: whatever else the row
   says, tag_class_id has to be null or a class this account is in.

   The teacher case is an addition to the brief: a teacher is not in
   class_members of their own class, so without it the one person who
   owns the tag would be the one person who cannot wear it. It only ever
   admits a class you already own. Delete that one line to go back to
   members only. */
drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check (
    (select auth.uid()) = id
    and (tag_class_id is null
         or private.is_class_member(tag_class_id)
         or private.is_class_teacher(tag_class_id))
  );

/* Same clause on insert, because a PostgREST upsert is an insert with a
   fallback and both policies get a say. */
drop policy if exists "profiles: create own" on public.profiles;
create policy "profiles: create own" on public.profiles
  for insert to authenticated
  with check (
    (select auth.uid()) = id
    and (tag_class_id is null
         or private.is_class_member(tag_class_id)
         or private.is_class_teacher(tag_class_id))
  );

/* ========================= tags that travel ======================== */

/* Rule 5. The roster now carries a class id; this turns one class id
   into four letters and a glyph. Nothing else. Not the name, not the
   code, not the teacher, not the roster, not the feature switches.

   WHAT THIS EXPOSES, stated at the decision rather than in a note
   somewhere: it tells a signed-in caller that a class id they already
   hold is wearing the letters MATH with a globe on it. A class id is
   not a class code — a code lets you JOIN, this lets you read four
   letters — and the caller has to have got the id from a roster row
   they were already allowed to read.

   It is narrower than "any signed-in user may ask about any class id",
   which is what the ruling allowed, and narrower still works: you get an
   answer only if you could already read that class, or if somebody you
   can actually SEE is wearing it. Sharing a class is the whole of
   "see" — it is exactly the set of people whose names can appear beside
   a tag on your screen, on a roster, a leaderboard or a live game. A tag
   worn into another class therefore resolves for that class's students,
   which is the point of rule 5, and a class you have no contact with
   stays four letters you cannot read.

   Not enumerable: it answers about one id you already hold, and there is
   no call that lists classes. That is the property to preserve if anyone
   ever widens this. */
drop function if exists public.class_tags(uuid);
create or replace function public.class_tag(p_class uuid)
returns table (id uuid, tag text, tag_glyph text)
language sql
stable
security definer
set search_path = ''
as $fn$
  select c.id, c.tag, c.tag_glyph
    from public.classes c
   where c.id = p_class
     and (
       private.is_class_member(p_class)
       or private.is_class_teacher(p_class)
       or (c.tag is not null and exists (
             select 1
               from public.class_members w
              where w.tag_class_id = c.id
                and (w.class_id in (select m.class_id
                                      from public.class_members m
                                     where m.student_id = (select auth.uid()))
                  or w.class_id in (select k.id
                                      from public.classes k
                                     where k.teacher_id = (select auth.uid())))
          ))
     );
$fn$;

revoke all on function public.class_tag(uuid) from public;
grant execute on function public.class_tag(uuid) to authenticated;
