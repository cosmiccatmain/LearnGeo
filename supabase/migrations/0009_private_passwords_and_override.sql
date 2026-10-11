/* ------------------------------------------------------------------
   0009 — the admin list gates everything, Private Passwords, and an
   override past the diamond cap.

   NOT YET APPLIED as of this commit.

   WHO IS ON THE LIST IS NOT WRITTEN HERE. This repository is public and
   several of the addresses are students' school accounts. aj adds them
   in the SQL editor or on the Administrator page; this file only
   changes what being on the list means.

   1. THE LIST NOW GATES ULTRAADMIN TOO
      Before this, the UltraAdmin code skipped admin_allow entirely: the
      account that decided the list could not be shut out by it. Now
      nobody gets an admin session without being on it, whichever
      secret they type, and admin_scope_of re-reads the list on every
      call, so taking somebody off cuts a session they already hold
      rather than letting it run out its 30 minutes.

   2. PRIVATE PASSWORDS
      One per person per device. Set from inside UltraAdmin, which means
      the real code has to have been typed on that device once; after
      that, that person opens the panel there with their own password.
      It works on no other device: the device holds a random 256-bit id
      in its own storage (never in the save, which follows the account
      everywhere), and the server stores only a SHA-256 of that id next
      to a bcrypt of the password. A password typed on another device
      arrives with a different id, or none, and matches nothing.

      The real UltraAdmin code still works on every device.

      Five wrong tries on a device lock that device's Private Password
      for fifteen minutes, counted on the server, so clearing the page
      does not reset them. A Private Password may not be one of the
      shared codes.

   3. OVERRIDE
      Ordinary commands are held to 2,000,000,000. ultra_override_gems
      sets any whole number up to 9,007,199,254,740,991 — the largest a
      browser can count exactly; past it, numbers stop being whole, which
      is how 1,350,000,000,000,000,800,000,… happened. ultra_adjust_gems
      changes so that an ordinary command never LIFTS a balance above
      the cap but never DRAGS an overridden one down to it either:
      taking 100 from 5,000,000,000 leaves 4,999,999,900. It now returns
      bigint, so it is dropped and recreated.
-------------------------------------------------------------------*/

create extension if not exists pgcrypto;

/* ================================================================
   PART 1 — the list gates every session, and is re-read every call
   ================================================================ */

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
     and exists (select 1 from public.admin_allow a where lower(a.email) = lower(s.email))
$$;
revoke execute on function public.admin_scope_of(uuid) from public, anon;
grant  execute on function public.admin_scope_of(uuid) to authenticated;

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

  return t;
end;
$$;
revoke execute on function public.admin_open_session(text) from public, anon;
grant  execute on function public.admin_open_session(text) to authenticated;

/* ================================================================
   PART 2 — Private Passwords
   ================================================================ */

create table if not exists public.admin_private_passwords (
  user_id      uuid not null references auth.users(id) on delete cascade,
  device_hash  text not null,
  pass_hash    text not null,
  fails        integer not null default 0,
  locked_until timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (user_id, device_hash)
);

alter table public.admin_private_passwords enable row level security;
/* No policies. Only the functions below touch this table. */

create or replace function public.app_device_hash(p_device text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select encode(digest(coalesce(p_device, ''), 'sha256'), 'hex')
$$;
revoke execute on function public.app_device_hash(text) from public, anon, authenticated;

/* Answers {"token": …} on success, {"locked_until": …} while locked,
   and null for everything else — not on the list, no Private Password
   on this device, or a wrong one — so a caller cannot tell those apart. */
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

  return jsonb_build_object('token', t);
end;
$$;
revoke execute on function public.admin_open_session_private(text, text) from public, anon;
grant  execute on function public.admin_open_session_private(text, text) to authenticated;

/* Set or change the caller's Private Password on this device. Needs a
   live UltraAdmin session, so the real code or an existing Private
   Password has already been typed on this device. */
create or replace function public.admin_set_private_password(p_token uuid, p_device text, p_password text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare pw text := coalesce(p_password, '');
begin
  if public.admin_scope_of(p_token) is distinct from 'ultra' then
    raise exception 'not authorised' using errcode = '42501';
  end if;
  if coalesce(p_device, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'this device has no usable id' using errcode = '22023';
  end if;
  if char_length(pw) < 6 then
    raise exception 'a Private Password is at least 6 characters' using errcode = '22023';
  end if;
  if octet_length(pw) > 72 then
    raise exception 'a Private Password is at most 72 characters' using errcode = '22023';
  end if;
  if public.verify_admin_pin_scope(pw) is not null then
    raise exception 'that is one of the shared admin codes; pick something of your own'
      using errcode = '22023';
  end if;

  insert into public.admin_private_passwords (user_id, device_hash, pass_hash)
  values (auth.uid(), public.app_device_hash(p_device), crypt(pw, gen_salt('bf')))
  on conflict (user_id, device_hash) do update
     set pass_hash = excluded.pass_hash, fails = 0, locked_until = null, updated_at = now();

  insert into public.admin_actions (actor, actor_email, target, target_email, action, detail)
  values (auth.uid(), (select u.email from auth.users u where u.id = auth.uid()),
          auth.uid(), (select u.email from auth.users u where u.id = auth.uid()),
          'private-password', jsonb_build_object('on', true));

  return true;
end;
$$;
revoke execute on function public.admin_set_private_password(uuid, text, text) from public, anon;
grant  execute on function public.admin_set_private_password(uuid, text, text) to authenticated;

create or replace function public.admin_clear_private_password(p_token uuid, p_device text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if public.admin_scope_of(p_token) is distinct from 'ultra' then
    raise exception 'not authorised' using errcode = '42501';
  end if;

  delete from public.admin_private_passwords p
   where p.user_id = auth.uid() and p.device_hash = public.app_device_hash(p_device);

  insert into public.admin_actions (actor, actor_email, target, target_email, action, detail)
  values (auth.uid(), (select u.email from auth.users u where u.id = auth.uid()),
          auth.uid(), (select u.email from auth.users u where u.id = auth.uid()),
          'private-password', jsonb_build_object('on', false));

  return true;
end;
$$;
revoke execute on function public.admin_clear_private_password(uuid, text) from public, anon;
grant  execute on function public.admin_clear_private_password(uuid, text) to authenticated;

/* ================================================================
   PART 3 — the cap, and the override past it
   ================================================================ */

drop function if exists public.ultra_adjust_gems(uuid, uuid, integer, integer, text);
create function public.ultra_adjust_gems(
  p_token  uuid,
  p_target uuid,
  p_delta  integer default null,
  p_set    integer default null,
  p_reason text    default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  cap    constant numeric := 2000000000;
  safe   constant numeric := 9007199254740991;
  s      jsonb;
  was    numeric;
  base   numeric;
  top    numeric;
  now_   bigint;
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

  was  := coalesce(public.app_save_num(s, 'diamonds', 0), 0);
  base := case when was > safe then cap when was < 0 then 0 else floor(was) end;
  top  := greatest(cap, base);
  now_ := least(top, greatest(0, coalesce(p_set, base + coalesce(p_delta, 0))))::bigint;

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
                             'moved', now_ - base,
                             'set', case when p_set is not null or was > safe or was < 0
                                         then now_ end,
                             'reason', coalesce(p_reason, '')));

  return now_;
end;
$$;
revoke execute on function public.ultra_adjust_gems(uuid, uuid, integer, integer, text) from public, anon;
grant  execute on function public.ultra_adjust_gems(uuid, uuid, integer, integer, text) to authenticated;

create or replace function public.ultra_override_gems(
  p_token  uuid,
  p_target uuid,
  p_amount numeric,
  p_reason text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  safe   constant numeric := 9007199254740991;
  s      jsonb;
  was    numeric;
  now_   bigint;
  t_mail text;
begin
  if public.admin_scope_of(p_token) is distinct from 'ultra' then
    raise exception 'not authorised' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <> trunc(p_amount) or p_amount < 0 or p_amount > safe then
    raise exception 'override takes a whole number from 0 to 9,007,199,254,740,991'
      using errcode = '22023';
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

  was  := coalesce(public.app_save_num(s, 'diamonds', 0), 0);
  now_ := p_amount::bigint;

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
          jsonb_build_object('was', was, 'now', now_, 'set', now_, 'override', true,
                             'reason', coalesce(p_reason, 'override')));

  return now_;
end;
$$;
revoke execute on function public.ultra_override_gems(uuid, uuid, numeric, text) from public, anon;
grant  execute on function public.ultra_override_gems(uuid, uuid, numeric, text) to authenticated;
