/* ------------------------------------------------------------------
   0016: durable admin panel login roster (LEA-53).

   Written against the LIVE schema (see README.md in this folder).
   Opening UltraAdmin already creates an ephemeral admin_sessions row,
   but that row is deleted on expiry / close and has no client-readable
   policies. This file keeps a separate append-only history of who
   opened the admin panel and when.

   Safe to run twice. Creates admin_logins (RLS on, no policies — only
   the functions below touch it), records a row inside both session
   open RPCs, and adds ultra_admin_logins for the Administrator UI.

   Apply after 0015. Does not change Development / Premium preview.
------------------------------------------------------------------ */

begin;

/* ================================================================
   PART 1 — append-only login history
   ================================================================ */

create table if not exists public.admin_logins (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete set null,
  email      text not null,
  method     text not null check (method in ('code', 'private')),
  scope      text not null default 'ultra',
  logged_at  timestamptz not null default now()
);

alter table public.admin_logins enable row level security;
revoke all on public.admin_logins from public, anon, authenticated;

create index if not exists admin_logins_recent
  on public.admin_logins (logged_at desc);

/* ================================================================
   PART 2 — record on successful session open
   ================================================================ */

create or replace function public.admin_open_session(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  s  text;
  t  uuid;
  me text;
begin
  if auth.uid() is null then
    return null;
  end if;
  select u.email into me from auth.users u where u.id = auth.uid();
  if not exists (select 1 from public.admin_allow a where lower(a.email) = lower(coalesce(me, ''))) then
    return null;
  end if;

  delete from public.admin_sessions where expires_at < now();

  s := public.verify_admin_pin_scope(p_code);
  if s is null or s = '' then
    return null;
  end if;

  insert into public.admin_sessions (scope, opened_by, email)
  values (s, auth.uid(), me)
  returning token into t;

  /* Only UltraAdmin opens reach the Administrator page. Gems-only
     codes create a session row but are not a panel login for LEA-53. */
  if s = 'ultra' then
    insert into public.admin_logins (user_id, email, method, scope)
    values (auth.uid(), coalesce(me, ''), 'code', s);
  end if;

  return t;
end;
$$;
revoke execute on function public.admin_open_session(text) from public, anon;
grant  execute on function public.admin_open_session(text) to authenticated;

create or replace function public.admin_open_session_private(p_password text, p_device text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  me  text;
  rec public.admin_private_passwords%rowtype;
  dh  text;
  t   uuid;
begin
  if auth.uid() is null or coalesce(p_device, '') = '' then
    return null;
  end if;
  select u.email into me from auth.users u where u.id = auth.uid();
  if not exists (select 1 from public.admin_allow a where lower(a.email) = lower(coalesce(me, ''))) then
    return null;
  end if;

  dh := public.app_device_hash(p_device);
  select * into rec from public.admin_private_passwords p
   where p.user_id = auth.uid() and p.device_hash = dh
   for update;
  if not found then
    return null;
  end if;

  if rec.locked_until is not null and rec.locked_until > now() then
    return jsonb_build_object('locked_until', rec.locked_until);
  end if;

  if crypt(coalesce(p_password, ''), rec.pass_hash) <> rec.pass_hash then
    if rec.fails + 1 >= 5 then
      update public.admin_private_passwords p
         set fails = 0, locked_until = now() + interval '15 minutes'
       where p.user_id = auth.uid() and p.device_hash = dh;
      return jsonb_build_object('locked_until', now() + interval '15 minutes');
    end if;
    update public.admin_private_passwords p
       set fails = rec.fails + 1
     where p.user_id = auth.uid() and p.device_hash = dh;
    return null;
  end if;

  update public.admin_private_passwords p
     set fails = 0, locked_until = null
   where p.user_id = auth.uid() and p.device_hash = dh;

  delete from public.admin_sessions where expires_at < now();
  insert into public.admin_sessions (scope, opened_by, email)
  values ('ultra', auth.uid(), me)
  returning token into t;

  insert into public.admin_logins (user_id, email, method, scope)
  values (auth.uid(), coalesce(me, ''), 'private', 'ultra');

  return jsonb_build_object('token', t);
end;
$$;
revoke execute on function public.admin_open_session_private(text, text) from public, anon;
grant  execute on function public.admin_open_session_private(text, text) to authenticated;

/* ================================================================
   PART 3 — roster reader for Administrator
   ================================================================ */

create or replace function public.ultra_admin_logins(
  p_token uuid, p_limit integer default 50)
returns table (
  email      text,
  method     text,
  scope      text,
  logged_at  timestamptz
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
    select l.email, l.method, l.scope, l.logged_at
      from public.admin_logins l
     order by l.logged_at desc
     limit greatest(1, least(coalesce(p_limit, 50), 200));
end;
$$;
revoke execute on function public.ultra_admin_logins(uuid, integer) from public, anon;
grant  execute on function public.ultra_admin_logins(uuid, integer) to authenticated;

/* One-row sanity check. */
select count(*)::int as admin_logins_rows from public.admin_logins;

commit;
