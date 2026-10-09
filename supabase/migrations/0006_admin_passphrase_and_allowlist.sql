/* ------------------------------------------------------------------
   0006 — a passphrase instead of four digits, and a list of who the
   gems panel opens for.

   NOT APPLIED BY THE CLIENT. Somebody with database access has to run
   this; the page works either way, it just keeps honouring the old
   code until the row below is replaced.

   Part 1 sets the new code. Part 2 adds the allowlist the client
   mirrors, and part 3 the grant log, so a penalty can be decided from
   the server's copy rather than from the device being penalised.
-------------------------------------------------------------------*/

/* ================================================================
   PART 1 — the new code

   admin_pins stores bcrypt hashes, never the code, so this is the only
   place the new one is written down. Change it here and the page needs
   no edit: it sends what was typed and reads back a scope.

   Four digits were guessable by hand. A passphrase is not, and the
   client field now accepts letters, which the number pad could not.
   ================================================================ */

create extension if not exists pgcrypto;

update public.admin_pins
   set pin_hash = crypt('thisisnotthecode', gen_salt('bf')),
       scope    = 'gems'
 where scope = 'gems';

/* If no gems row existed, make one rather than leaving the panel shut. */
insert into public.admin_pins (label, pin_hash, scope, active)
select 'gems', crypt('thisisnotthecode', gen_salt('bf')), 'gems', true
 where not exists (select 1 from public.admin_pins where scope = 'gems');

/* ================================================================
   PART 2 — who the gems panel opens for

   A correct code stops being enough. The account has to be named here
   as well, so a leaked code on its own opens nothing.
   ================================================================ */

create table if not exists public.admin_allow (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique,
  added_by   uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.admin_allow enable row level security;
/* No policies: the publishable key cannot read or write this table. The
   function below is the only way in, and it answers one question. */

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

/* ================================================================
   PART 3 — the grant log

   The client keeps its own log, but a log on the device being judged is
   a log that device can edit. This is the copy that decides a penalty
   once the client is pointed at it.

   Insert-only on purpose: a row can be added and never changed or
   removed, including by the account that wrote it.
   ================================================================ */

create table if not exists public.admin_grants (
  id         uuid primary key default gen_random_uuid(),
  account    uuid references auth.users(id),
  email      text,
  amount     integer not null,
  balance_after integer,
  scope      text,
  created_at timestamptz not null default now()
);

alter table public.admin_grants enable row level security;

create policy admin_grants_insert_self
  on public.admin_grants for insert
  to authenticated
  with check (account = auth.uid());

/* Nobody selects, updates or deletes through the publishable key. */

create index if not exists admin_grants_recent
  on public.admin_grants (account, created_at desc);

/* ------------------------------------------------------------------
   Not yet run as of this commit.

   Everything in the client ships ahead of this file, deliberately: the
   page keeps honouring whatever code is already in admin_pins until
   part 1 is applied, so nothing breaks while this waits. What does NOT
   work until then is the new code itself. `thisisnotthecode` opens
   nothing while the old row is still in place.

   Parts 2 and 3 are the half that makes the allowlist and the penalty
   real rather than advisory. Until they are applied, both are enforced
   only on the device doing the enforcing, which is the device with the
   motive to edit them.
-------------------------------------------------------------------*/
