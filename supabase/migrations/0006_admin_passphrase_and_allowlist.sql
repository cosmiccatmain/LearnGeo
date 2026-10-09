/* ------------------------------------------------------------------
   0006 — a passphrase instead of four digits, a list of who the gems
   panel opens for, and a log of what it handed out.

   APPLIED 2026-10-08 by aj, through the SQL editor.

   Parts 2 and 3 below are the statements that ran, verbatim, and are
   safe to run again. Part 1 is not: the code itself was set by hand
   and is deliberately not written down here. See the note under it.
-------------------------------------------------------------------*/

/* ================================================================
   PART 1 — the code

   DO NOT RUN THIS AS IT STANDS. It would set the live code to the
   word CHANGE-ME, and the first draft of this file did worse: it
   carried the real passphrase, in a repository anybody can read.

   admin_pins stores a bcrypt hash and never the code, which is the
   right shape and buys nothing at all if the plain text is sitting
   in the migration that produced it. The hash is only as private as
   the least private copy of what went into it.

   So the code is set by hand, in the SQL editor, and lives in a
   password manager rather than in git. To change it, run these two
   statements with the new code in BOTH places — they have to match
   or the check below answers null and nothing opens:

     update public.admin_pins
        set pin_hash = crypt('<the new code>', gen_salt('bf'))
      where scope = 'gems';

     select public.verify_admin_pin_scope('<the new code>');

   The second should answer 'gems'. The page needs no edit either
   way: it sends what was typed and reads back a scope.

   Four digits were guessable by hand, and the client field now takes
   letters, which the number pad could not.
   ================================================================ */

create extension if not exists pgcrypto;

/* Left here so a fresh database has a row to update rather than a
   silent no-op. The value is not a code anybody is meant to use, and
   the update above replaces it. */
insert into public.admin_pins (label, pin_hash, scope)
select 'gems', crypt('CHANGE-ME', gen_salt('bf')), 'gems'
 where not exists (select 1 from public.admin_pins where scope = 'gems');

/* ================================================================
   PART 2 — who the gems panel opens for

   A correct code stops being enough. The account has to be named
   here as well, so a leaked code on its own opens nothing.
   ================================================================ */

create table if not exists public.admin_allow (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique,
  created_at timestamptz not null default now()
);

alter table public.admin_allow enable row level security;
/* No policies: the publishable key can neither list these names nor
   add one. The function below is the only way in, and it answers one
   question about one address. */

create or replace function public.admin_may_open(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_allow a
     where lower(a.email) = lower(p_email)
  );
$$;
revoke execute on function public.admin_may_open(text) from public;
grant execute on function public.admin_may_open(text) to anon, authenticated;

/* The list is empty on a new database, and an empty list opens for
   nobody — including whoever is running this. Name somebody:

     insert into public.admin_allow (email) values ('you@example.com')
     on conflict (email) do nothing;
*/

/* ================================================================
   PART 3 — the grant log

   The client keeps its own log, but a log on the device being judged
   is a log that device can edit. This is the copy that decides a
   penalty.

   Insert-only on purpose: a row can be added and then never changed
   or removed, including by the account that wrote it.
   ================================================================ */

create table if not exists public.admin_grants (
  id            uuid primary key default gen_random_uuid(),
  account       uuid references auth.users(id),
  email         text,
  amount        integer not null,
  balance_after integer,
  scope         text,
  created_at    timestamptz not null default now()
);

alter table public.admin_grants enable row level security;

drop policy if exists admin_grants_insert_self on public.admin_grants;
create policy admin_grants_insert_self
  on public.admin_grants for insert
  to authenticated
  with check (account = auth.uid());

/* Nobody selects, updates or deletes through the publishable key. */

create index if not exists admin_grants_recent
  on public.admin_grants (account, created_at desc);

/* ------------------------------------------------------------------
   What the client does with all this, as of this commit:

   - admin-pin.js asks admin_may_open before the gems panel opens, and
     writes every grant to admin_grants.
   - admin.js falls back to the list in the save ONLY when the database
     has no admin_may_open. A question that fails is a no.
   - The 85% penalty still reads the log in the save. Pointing it at
     admin_grants is the last piece, and needs a read path that does
     not also let the penalised device read everyone else's rows.
-------------------------------------------------------------------*/
