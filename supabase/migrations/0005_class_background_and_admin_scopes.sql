/* ------------------------------------------------------------------
   LearnGeo — the class look, and two admin codes instead of one.

   NOT YET APPLIED. Owen holds the Supabase connection; this file is the
   change, not a record of one. Everything the client does degrades
   honestly until it runs: a class shows the default colour, and the one
   existing admin code keeps opening the gems panel exactly as it does
   today. Nothing breaks by leaving this unapplied, and nothing in the
   client needs changing when it is applied.

   Read part 2 before running it. It touches admin_pins, which has no
   migration in this repo because it was deployed straight to the
   project, so the column names below are an assumption that wants
   checking against the real table first.
-------------------------------------------------------------------*/

/* ================================================================
   PART 1 — the class look

   Teachers run more than one class now, and the background is how a
   teacher tells period 3 from period 5 at a glance. Students see it
   too, which is why it lives on the class rather than in each
   teacher's own save.

   The key is stored, never the colours. assets/css/class-bg.css owns
   what each one looks like, so the palette can be restyled without
   touching a single row.
   ================================================================ */

alter table public.classes
  add column if not exists background text not null default 'default';

/* Keep the column to keys the client knows. An unknown key is not a
   broken class — the client falls back to the default — but there is no
   reason to let one in. */
alter table public.classes
  drop constraint if exists classes_background_known;
alter table public.classes
  add constraint classes_background_known
  check (background in ('default','slate','forest','sunset','plum','ocean','sand','ink'));

/* A student reads this column on the class they joined, which the
   existing classes_read policy already allows. Nothing new to grant. */

/* ================================================================
   PART 2 — two admin codes, with different reach

   admin_pins has no migration in this repo — it was deployed straight to
   the project — so its shape was read off a failed run on 2026-10-01:

     id uuid, label text not null, pin_hash text, active boolean,
     created_at timestamptz

   label is the column that matters here. It cannot be empty, so every
   insert has to name the code it is adding.

   Why two codes. The gems panel hands out diamonds and the verified
   seal, and everything it changes is one browser's own save. UltraAdmin
   reaches god mode, every class on the account, and the switch that
   wipes the device. Those are different risks, so they get different
   codes: handing someone the smaller job should not hand them the
   larger power.

   Four digits are still four digits. This is a lock on a drawer.
   ================================================================ */

create extension if not exists pgcrypto;

/* Which panel a code opens. ultra covers gems as well — the hierarchy
   itself lives in the client, in admin-pin.js, so it is written down in
   exactly one place; this column only says which code is which. */
alter table public.admin_pins
  add column if not exists scope text not null default 'gems';

alter table public.admin_pins
  drop constraint if exists admin_pins_scope_known;
alter table public.admin_pins
  add constraint admin_pins_scope_known
  check (scope in ('gems','ultra'));

/* One code per scope, which is what makes the upserts below replace a
   code rather than pile up another one.

   This would fail if the table already held two rows, since both would
   default to 'gems'. It did not fail on the 2026-10-01 run — the error
   came later, from the insert — so there is at most one existing row. */
create unique index if not exists admin_pins_one_per_scope
  on public.admin_pins (scope);

/* The two codes aj asked for, 2026-09-30: 4135 opens the gems panel,
   1357 opens UltraAdmin. Written as an upsert on scope so re-running
   this changes the code rather than adding a second one.

   crypt() with gen_salt('bf') is the same bcrypt the existing rows use.
   The digits appear here in plain text because a migration has to carry
   them once to hash them; they are not stored this way, and this file
   is in a public repo, so change both codes from the dashboard after
   running it if that matters. */
insert into public.admin_pins (label, pin_hash, scope)
values ('Gems panel', crypt('4135', gen_salt('bf')), 'gems')
on conflict (scope) do update
  set pin_hash = excluded.pin_hash,
      label = excluded.label;

insert into public.admin_pins (label, pin_hash, scope)
values ('UltraAdmin', crypt('1357', gen_salt('bf')), 'ultra')
on conflict (scope) do update
  set pin_hash = excluded.pin_hash,
      label = excluded.label;

/* Note what the first of those does to a project that already has a
   code. Any existing row took scope 'gems' from the default above, so
   the upsert lands on it and replaces its hash: the old code stops
   working and 4135 takes over. That is the intent, but it is worth
   knowing before running it rather than after. */

/* A SECOND function, under a new name, rather than changing the old one.

   This is what makes the file safe to run at any time. The old
   verify_admin_pin still answers yes or no and is left exactly as it
   is, so the page that is live right now keeps working. The new one
   answers which panel the code opens, and the new page asks for it
   first and falls back to the old name if it is not there.

   Change the old one instead and you get a broken admin panel on the
   live site until the new page ships, because the old page tests the
   answer against true and a scope is not true.

   SECURITY DEFINER with the search path pinned, like the rest: the
   table has RLS on with no policies, so the publishable key can ask
   about a code but can never list them.

   Pinned to extensions and public rather than to nothing. crypt() comes
   from pgcrypto, which Supabase installs into the extensions schema, and
   an empty search path hides it — the first attempt at this failed with
   "function crypt(text, text) does not exist" on 2026-10-01. Naming both
   schemas finds it wherever pgcrypto happens to live, and the table is
   fully qualified below so nothing else depends on the path.

   crypt is left unqualified on purpose. Writing extensions.crypt would
   pin it to one schema and break the other way round, on a project that
   has pgcrypto in public. The search path above is the thing doing the
   work. */
create or replace function public.verify_admin_pin_scope(p_pin text)
returns text
language sql
stable
security definer
set search_path = extensions, public
as $$
  select p.scope
    from public.admin_pins p
   where p.pin_hash = crypt(p_pin, p.pin_hash)
   limit 1;
$$;

revoke execute on function public.verify_admin_pin_scope(text) from public;
grant execute on function public.verify_admin_pin_scope(text) to anon, authenticated;

/* One thing to know until the new page is live: the old function says
   yes to any code in the table, so 1357 will open the gems panel on the
   current site. That stops the moment the new page ships, which checks
   the scope. Nothing is exposed by it — the gems panel was already what
   the one existing code opened. */
