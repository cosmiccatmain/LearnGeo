/* ------------------------------------------------------------------
   0007 — the Administrator page: reaching other accounts, safely.

   NOT YET APPLIED as of this commit. The client ships ahead of it and
   says so on screen rather than failing quietly.

   Everything before this file kept an admin inside their own save.
   The gems panel edits one browser; UltraAdmin edits one device. This
   file is the first time an admin reaches somebody else's account, so
   it is worth being explicit about what makes that safe.

   profiles has row level security and one rule: your own row, never
   anybody else's. That rule is not relaxed here and no policy is
   added to it. Instead every cross-account action goes through a
   security definer function that checks, server side, that the caller
   is holding a live UltraAdmin session. The publishable key still
   cannot read or write one other row directly.

   THE SESSION, AND WHY IT IS NOT THE PASSPHRASE

   The obvious shape is to pass the ultra passphrase to every call.
   That works and it is worse: the passphrase then crosses the wire
   once per keystroke-fast action, sits in promise chains and network
   logs, and has no expiry. Instead the passphrase is exchanged ONCE
   for a token that
     - expires after 30 minutes,
     - is bound to the auth user who opened it, so a token lifted from
       one browser is refused in another, and
     - can be revoked by deleting one row.
-------------------------------------------------------------------*/

create extension if not exists pgcrypto;

/* ================================================================
   PART 1 — sessions
   ================================================================ */

create table if not exists public.admin_sessions (
  token      uuid primary key default gen_random_uuid(),
  scope      text not null,
  opened_by  uuid references auth.users(id) on delete cascade,
  email      text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 minutes'
);

alter table public.admin_sessions enable row level security;
/* No policies. Nothing reads this table through the publishable key,
   including the account that owns the row: a token is handed back
   once, by the function that made it, and never listed again. */

create index if not exists admin_sessions_expiry on public.admin_sessions (expires_at);

/* Exchange a passphrase for a token. Answers null for a wrong code,
   exactly as verify_admin_pin_scope does, so a caller cannot tell a
   wrong code from a code with no scope. */
create or replace function public.admin_open_session(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  s text;
  t uuid;
begin
  if auth.uid() is null then
    return null;                      /* a guest holds no session */
  end if;

  delete from public.admin_sessions where expires_at < now();

  s := public.verify_admin_pin_scope(p_code);
  if s is null or s = '' then
    return null;
  end if;

  insert into public.admin_sessions (scope, opened_by, email)
  values (s, auth.uid(), (select u.email from auth.users u where u.id = auth.uid()))
  returning token into t;

  return t;
end;
$$;
revoke execute on function public.admin_open_session(text) from public, anon;
grant  execute on function public.admin_open_session(text) to authenticated;

/* The scope a token still carries, or null. Bound to auth.uid(): a
   token is useless to anybody but the account that opened it. */
create or replace function public.admin_scope_of(p_token uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select s.scope
    from public.admin_sessions s
   where s.token = p_token
     and s.expires_at > now()
     and s.opened_by = auth.uid()
$$;
revoke execute on function public.admin_scope_of(uuid) from public, anon;
grant  execute on function public.admin_scope_of(uuid) to authenticated;

create or replace function public.admin_close_session(p_token uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.admin_sessions
   where token = p_token and opened_by = auth.uid()
$$;
revoke execute on function public.admin_close_session(uuid) from public, anon;
grant  execute on function public.admin_close_session(uuid) to authenticated;

/* ================================================================
   PART 2 — the audit trail

   admin_grants (0006) records what an admin did to their OWN balance
   and feeds the 85% penalty. This table is the other half: what an
   admin did to SOMEBODY ELSE. Keeping them apart matters, because a
   row here must not read as an offence by the person it was done to.
   An admin correcting a balance upward is an administrative act; the
   penalty engine would see a grant and take 85% of it back.

   Insert-only, and not even that through the publishable key: only
   the functions below write here.
   ================================================================ */

create table if not exists public.admin_actions (
  id           uuid primary key default gen_random_uuid(),
  actor        uuid references auth.users(id) on delete set null,
  actor_email  text,
  target       uuid references auth.users(id) on delete set null,
  target_email text,
  action       text not null,
  detail       jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

alter table public.admin_actions enable row level security;
/* No policies, deliberately. Every write below is security definer. */

create index if not exists admin_actions_recent
  on public.admin_actions (created_at desc);

/* ================================================================
   PART 3 — reading a save safely

   Every read of profiles.save below casts it, save::jsonb. The column
   was added by hand and is not defined anywhere in this repo, so its
   type is unproven: jsonb is the likely answer and the cast is then a
   no-op, but if it is json, an uncast jsonb_typeof() or coalesce() with
   a jsonb default fails at the first click rather than at install. The
   writes need no cast either way, because Postgres has an assignment
   cast between the two in both directions.

   A diamond count lives at save -> economy -> diamonds and is written
   by a browser, so it is whatever that browser last put there. A cast
   straight to int fails the WHOLE query on one malformed save, which
   would mean one bad row hides every account from the search. Guard
   the cast instead of trusting it.
   ================================================================ */

create or replace function public.app_save_int(p_save jsonb, p_key text, p_default integer)
returns integer
language sql
immutable
as $$
  select case
           when p_save -> 'economy' ->> p_key ~ '^-?[0-9]{1,9}$'
             then (p_save -> 'economy' ->> p_key)::integer
           else p_default
         end
$$;

/* ================================================================
   PART 4 — the Administrator page's four calls
   ================================================================ */

/* Search by display name or email. Empty query lists the most
   recently active accounts, which is what an empty box should show. */
create or replace function public.ultra_find_accounts(p_token uuid, p_query text)
returns table (
  id           uuid,
  display_name text,
  email        text,
  role         text,
  diamonds     integer,
  level        integer,
  staff        boolean,
  updated_at   timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare q text := nullif(btrim(coalesce(p_query, '')), '');
begin
  if public.admin_scope_of(p_token) is distinct from 'ultra' then
    raise exception 'not authorised' using errcode = '42501';
  end if;

  return query
    select p.id,
           p.display_name,
           u.email::text,
           p.role,
           public.app_save_int(p.save::jsonb, 'diamonds', 0),
           public.app_save_int(p.save::jsonb, 'level', 1),
           coalesce((p.save::jsonb -> 'flags' ->> 'staff') = 'true', false),
           p.updated_at
      from public.profiles p
      left join auth.users u on u.id = p.id
     where q is null
        or p.display_name ilike '%' || q || '%'
        or u.email         ilike '%' || q || '%'
     order by p.updated_at desc nulls last
     limit 60;
end;
$$;
revoke execute on function public.ultra_find_accounts(uuid, text) from public, anon;
grant  execute on function public.ultra_find_accounts(uuid, text) to authenticated;

/* Move somebody's diamonds. Pass p_set for an absolute value, or
   p_delta to add and subtract; p_set wins when both arrive. Never
   goes below zero, and answers the balance it left behind so the
   caller shows what happened rather than what it asked for. */
create or replace function public.ultra_adjust_gems(
  p_token  uuid,
  p_target uuid,
  p_delta  integer default null,
  p_set    integer default null,
  p_reason text    default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  s      jsonb;
  was    integer;
  now_   integer;
  t_mail text;
begin
  if public.admin_scope_of(p_token) is distinct from 'ultra' then
    raise exception 'not authorised' using errcode = '42501';
  end if;

  select coalesce(p.save::jsonb, '{}'::jsonb) into s
    from public.profiles p where p.id = p_target;
  if not found then
    raise exception 'no such account' using errcode = 'P0002';
  end if;
  if jsonb_typeof(s) <> 'object' then
    raise exception 'that account''s save is not an object; refusing to overwrite it'
      using errcode = '22023';
  end if;

  was  := public.app_save_int(s, 'diamonds', 0);
  now_ := greatest(0, coalesce(p_set, was + coalesce(p_delta, 0)));

  if jsonb_typeof(s -> 'economy') is distinct from 'object' then s := s || '{"economy":{}}'::jsonb; end if;
  if jsonb_typeof(s -> 'flags')   is distinct from 'object' then s := s || '{"flags":{}}'::jsonb;   end if;
  s := jsonb_set(s, '{economy,diamonds}', to_jsonb(now_));
  s := jsonb_set(s, '{flags,adminAt}',    to_jsonb(now()));

  update public.profiles p set save = s where p.id = p_target;

  select u.email into t_mail from auth.users u where u.id = p_target;

  insert into public.admin_actions (actor, actor_email, target, target_email, action, detail)
  values (auth.uid(),
          (select u.email from auth.users u where u.id = auth.uid()),
          p_target, t_mail, 'gems',
          jsonb_build_object('was', was, 'now', now_,
                             'moved', now_ - was,
                             'set', p_set,
                             'reason', coalesce(p_reason, '')));

  return now_;
end;
$$;
revoke execute on function public.ultra_adjust_gems(uuid, uuid, integer, integer, text) from public, anon;
grant  execute on function public.ultra_adjust_gems(uuid, uuid, integer, integer, text) to authenticated;

/* The staff mark, which is what unlocks the staff-only cosmetic in
   the client. One boolean at save -> flags -> staff. */
create or replace function public.ultra_set_staff(p_token uuid, p_target uuid, p_on boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  s   jsonb;
  on_ boolean := coalesce(p_on, false);
begin
  if public.admin_scope_of(p_token) is distinct from 'ultra' then
    raise exception 'not authorised' using errcode = '42501';
  end if;

  select coalesce(p.save::jsonb, '{}'::jsonb) into s
    from public.profiles p where p.id = p_target;
  if not found then
    raise exception 'no such account' using errcode = 'P0002';
  end if;
  if jsonb_typeof(s) <> 'object' then
    raise exception 'that account''s save is not an object; refusing to overwrite it'
      using errcode = '22023';
  end if;

  if jsonb_typeof(s -> 'flags') is distinct from 'object' then s := s || '{"flags":{}}'::jsonb; end if;
  s := jsonb_set(s, '{flags,staff}',   to_jsonb(on_));
  s := jsonb_set(s, '{flags,adminAt}', to_jsonb(now()));

  update public.profiles p set save = s where p.id = p_target;

  insert into public.admin_actions (actor, actor_email, target, target_email, action, detail)
  values (auth.uid(),
          (select u.email from auth.users u where u.id = auth.uid()),
          p_target,
          (select u.email from auth.users u where u.id = p_target),
          'staff', jsonb_build_object('on', on_));

  return on_;
end;
$$;
revoke execute on function public.ultra_set_staff(uuid, uuid, boolean) from public, anon;
grant  execute on function public.ultra_set_staff(uuid, uuid, boolean) to authenticated;

/* ================================================================
   PART 4b — the other end: the account an admin changed

   Diamonds live on the device. profiles.save is a mirror that cloud.js
   overwrites, whole, 1.5 seconds after every change, with no conflict
   check — so an edit made on the server to an account whose app is
   open is undone by that app's next answer. Taking gems from somebody
   who simply keeps the tab open would never stick.

   So the device pulls. Every admin write above stamps the save with
   flags.adminAt = now(), in the same update that changes the balance,
   and logs the action at the same instant. A device asks for actions
   newer than the stamp IT holds:

   - It adopted the cloud copy: the stamp and the new balance arrived
     together, nothing is newer, nothing is applied twice.
   - It kept its own copy, or pushed over the edit: its stamp is older,
     so it gets the action back and applies it to the balance it
     actually has.

   The two cannot drift apart, because the stamp and the balance are
   only ever written together — by this function, or by a device push
   that replaces both with that device's version.

   now() is the transaction's start time, so the stamp in the save and
   created_at on the action are the same value to the microsecond. The
   client stores the stamp as the string the server wrote and sends it
   back unchanged; converting it to milliseconds would round it down
   and the action would come back again forever.

   Returns the caller's own rows only, and not who did it.
   ================================================================ */
create or replace function public.my_admin_actions(p_since timestamptz)
returns table (action text, detail jsonb, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  return query
    select a.action, a.detail, a.created_at
      from public.admin_actions a
     where a.target = auth.uid()
       and a.action in ('gems', 'staff')
       and (p_since is null or a.created_at > p_since)
     order by a.created_at asc
     limit 50;
end;
$$;
revoke execute on function public.my_admin_actions(timestamptz) from public, anon;
grant  execute on function public.my_admin_actions(timestamptz) to authenticated;

/* Everything the stats row shows, in one round trip. */
create or replace function public.ultra_stats(p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare r jsonb;
begin
  if public.admin_scope_of(p_token) is distinct from 'ultra' then
    raise exception 'not authorised' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'accounts',  (select count(*) from public.profiles),
    'teachers',  (select count(*) from public.profiles where role = 'teacher'),
    'students',  (select count(*) from public.profiles where role = 'student'),
    'active24',  (select count(*) from public.profiles where updated_at > now() - interval '1 day'),
    'active7',   (select count(*) from public.profiles where updated_at > now() - interval '7 days'),
    'diamonds',  (select coalesce(sum(public.app_save_int(save::jsonb, 'diamonds', 0)), 0) from public.profiles),
    'classes',   (select count(*) from public.classes where archived_at is null),
    'members',   (select count(*) from public.class_members where status = 'joined'),
    'allowed',   (select count(*) from public.admin_allow),
    'staff',     (select count(*) from public.profiles where (save::jsonb -> 'flags' ->> 'staff') = 'true'),
    'grants24',  (select count(*) from public.admin_grants  where created_at > now() - interval '1 day'),
    'actions24', (select count(*) from public.admin_actions where created_at > now() - interval '1 day')
  ) into r;

  return r;
end;
$$;
revoke execute on function public.ultra_stats(uuid) from public, anon;
grant  execute on function public.ultra_stats(uuid) to authenticated;

/* The last few things any admin did to anybody. */
create or replace function public.ultra_recent_actions(p_token uuid, p_limit integer default 20)
returns table (
  actor_email  text,
  target_email text,
  action       text,
  detail       jsonb,
  created_at   timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.admin_scope_of(p_token) is distinct from 'ultra' then
    raise exception 'not authorised' using errcode = '42501';
  end if;
  return query
    select a.actor_email, a.target_email, a.action, a.detail, a.created_at
      from public.admin_actions a
     order by a.created_at desc
     limit greatest(1, least(coalesce(p_limit, 20), 100));
end;
$$;
revoke execute on function public.ultra_recent_actions(uuid, integer) from public, anon;
grant  execute on function public.ultra_recent_actions(uuid, integer) to authenticated;

/* ================================================================
   PART 5 — the allowlist, from the page instead of the SQL editor
   ================================================================ */

create or replace function public.ultra_allow_list(p_token uuid)
returns table (email text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.admin_scope_of(p_token) is distinct from 'ultra' then
    raise exception 'not authorised' using errcode = '42501';
  end if;
  return query
    select a.email, a.created_at from public.admin_allow a order by a.email;
end;
$$;
revoke execute on function public.ultra_allow_list(uuid) from public, anon;
grant  execute on function public.ultra_allow_list(uuid) to authenticated;

create or replace function public.ultra_allow_set(p_token uuid, p_email text, p_on boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare mail text := lower(btrim(coalesce(p_email, '')));
begin
  if public.admin_scope_of(p_token) is distinct from 'ultra' then
    raise exception 'not authorised' using errcode = '42501';
  end if;
  if mail = '' or mail !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'that is not an email address' using errcode = '22023';
  end if;

  if coalesce(p_on, false) then
    insert into public.admin_allow (email) values (mail)
    on conflict (email) do nothing;
  else
    delete from public.admin_allow where lower(email) = mail;
  end if;

  insert into public.admin_actions (actor, actor_email, target_email, action, detail)
  values (auth.uid(),
          (select u.email from auth.users u where u.id = auth.uid()),
          mail, 'allow', jsonb_build_object('on', coalesce(p_on, false)));

  return coalesce(p_on, false);
end;
$$;
revoke execute on function public.ultra_allow_set(uuid, text, boolean) from public, anon;
grant  execute on function public.ultra_allow_set(uuid, text, boolean) to authenticated;

/* ------------------------------------------------------------------
   Worth knowing before this is applied.

   1. An ultra session is 30 minutes and is not renewed by use. That
      is deliberate: the page reopens one on the next action, which
      costs a round trip and means a walked-away-from laptop stops
      being an admin console fairly quickly.

   2. A change reaches the target through my_admin_actions, not
      through the profile row alone: an open app overwrites that row
      on its next save. admin-inbox.js asks on sign-in, on focus and
      every two minutes, so an open app picks the change up within a
      couple of minutes and a closed one the moment it opens.

   3. Supabase grants every new function in public to anon directly,
      through default privileges, so "revoke from public" alone leaves
      anon holding it. Every function here that has no business being
      called signed-out revokes anon by name. Each one also refuses an
      anonymous caller in its own body; this is the second lock.

   4. Nothing here can read a save wholesale. The search returns seven
      columns, chosen; there is no function that hands back somebody's
      answers, their classes or their progress.
-------------------------------------------------------------------*/
