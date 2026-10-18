/* ------------------------------------------------------------------
   LearnGeo 0007 — who posted it, on the Stream.

   NOT APPLIED YET. Additive only: two nullable columns and two
   triggers. No existing row is rewritten, so posts made before this
   runs keep a null author and the client shows them as "Teacher".

   With co-teachers (migrations/0010) a class can have more than one
   teacher posting to the same Stream, so each post carries the name of
   the one who wrote it.

   The author is stamped by the database, never taken from the client.
   Whatever an insert sends in author_id or author_name is overwritten
   with the signed-in account and its profile name, so a teacher cannot
   post as somebody else. The name is a snapshot taken at posting time;
   renaming yourself later does not rewrite what you already said.

   Numbered 0007 because 0006 is taken by the Geo Kart branch.
-------------------------------------------------------------------*/

/* No foreign key on author_id, on purpose. `on delete set null` is
   carried out as an UPDATE, which the keep-author trigger below would
   undo, and deleting the teacher's account would then fail. The id is a
   snapshot like the name; the post still goes when its class does. */
alter table public.announcements
  add column if not exists author_id uuid;
alter table public.announcements
  add column if not exists author_name text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'announcements_author_name_len') then
    alter table public.announcements
      add constraint announcements_author_name_len
      check (author_name is null or char_length(author_name) <= 60);
  end if;
end $$;

/* Definer, because the poster's profiles row is read here and the
   profiles SELECT policy is not something this file should lean on.
   When there is no signed-in account (the SQL editor, the service
   role) the row is left exactly as sent. */
create or replace function private.stamp_announcement_author()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    return new;
  end if;
  new.author_id := uid;
  new.author_name := left(coalesce(
    (select nullif(btrim(pr.save::jsonb -> 'profile' ->> 'displayName'), '')
       from public.profiles pr where pr.id = uid),
    (select nullif(btrim(pr.display_name), '')
       from public.profiles pr where pr.id = uid),
    'Teacher'), 60);
  return new;
end
$fn$;

drop trigger if exists announcements_author_stamp on public.announcements;
create trigger announcements_author_stamp
  before insert on public.announcements
  for each row execute function private.stamp_announcement_author();

/* Pinning is an UPDATE, and it must not hand the post to whoever
   pinned it. */
create or replace function private.keep_announcement_author()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  new.author_id   := old.author_id;
  new.author_name := old.author_name;
  return new;
end
$fn$;

drop trigger if exists announcements_author_keep on public.announcements;
create trigger announcements_author_keep
  before update on public.announcements
  for each row execute function private.keep_announcement_author();
