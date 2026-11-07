/* ------------------------------------------------------------------
   0026: admin unlock code + WebAuthn passkey enroll (LEA-82).

   Written against the LIVE schema (see README.md in this folder).

   1) Sets the shared admin unlock passphrase to adminisbetter for both
      gems and ultra scopes (bcrypt in admin_pins — never returned to
      the client).
   2) Makes verify_admin_pin_scope prefer ultra when one passphrase
      matches more than one row (same code for both panels).
   3) Adds admin_passkeys: device-bound unlock secret gated by a
      WebAuthn passkey on the client. Code remains the fallback.
   4) Extends admin_logins.method to allow 'passkey'.

   Safe to run twice.
------------------------------------------------------------------ */

begin;

/* ================================================================
   PART 1 — shared unlock code
   ================================================================ */

update public.admin_pins
   set pin_hash = crypt('adminisbetter', gen_salt('bf'))
 where scope in ('gems', 'ultra');

/* One passphrase may match both rows; UltraAdmin needs the larger scope. */
create or replace function public.verify_admin_pin_scope(p_pin text)
returns text
language sql
stable
security definer
set search_path = public, extensions
as $$
  select p.scope
    from public.admin_pins p
   where p.pin_hash = crypt(p_pin, p.pin_hash)
   order by case p.scope when 'ultra' then 0 when 'gems' then 1 else 2 end
   limit 1
$$;
revoke execute on function public.verify_admin_pin_scope(text) from public;
grant  execute on function public.verify_admin_pin_scope(text) to anon, authenticated;

/* ================================================================
   PART 2 — admin_logins may record passkey unlocks
   ================================================================ */

alter table public.admin_logins
  drop constraint if exists admin_logins_method_check;
alter table public.admin_logins
  add constraint admin_logins_method_check
  check (method in ('code', 'private', 'passkey'));

/* ================================================================
   PART 3 — passkey-backed unlock secrets (device-bound)
   ================================================================ */

create table if not exists public.admin_passkeys (
  user_id         uuid not null references auth.users(id) on delete cascade,
  device_hash     text not null,
  credential_id   text not null,
  unlock_hash     text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (user_id, device_hash)
);

alter table public.admin_passkeys enable row level security;
revoke all on public.admin_passkeys from public, anon, authenticated;

create unique index if not exists admin_passkeys_credential
  on public.admin_passkeys (credential_id);

/* Enroll or replace the passkey unlock secret for this device.
   Needs a live UltraAdmin session (same gate as Private Password). */
create or replace function public.admin_passkey_enroll(
  p_token uuid, p_device text, p_credential_id text, p_unlock_secret text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  cred text := left(trim(coalesce(p_credential_id, '')), 512);
  sec  text := coalesce(p_unlock_secret, '');
  dh   text;
begin
  if public.admin_scope_of(p_token) is distinct from 'ultra' then
    raise exception 'not authorised' using errcode = '42501';
  end if;
  if auth.uid() is null or coalesce(p_device, '') = '' then
    raise exception 'not authorised' using errcode = '42501';
  end if;
  if length(cred) < 16 or length(sec) < 32 then
    raise exception 'bad passkey material' using errcode = '22023';
  end if;

  dh := public.app_device_hash(p_device);

  insert into public.admin_passkeys (user_id, device_hash, credential_id, unlock_hash)
  values (auth.uid(), dh, cred, crypt(sec, gen_salt('bf')))
  on conflict (user_id, device_hash) do update
    set credential_id = excluded.credential_id,
        unlock_hash   = excluded.unlock_hash,
        updated_at    = now();

  return true;
end;
$$;
revoke execute on function public.admin_passkey_enroll(uuid, text, text, text) from public, anon;
grant  execute on function public.admin_passkey_enroll(uuid, text, text, text) to authenticated;

create or replace function public.admin_passkey_remove(p_token uuid, p_device text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare dh text;
begin
  if public.admin_scope_of(p_token) is distinct from 'ultra' then
    raise exception 'not authorised' using errcode = '42501';
  end if;
  if auth.uid() is null or coalesce(p_device, '') = '' then
    return false;
  end if;
  dh := public.app_device_hash(p_device);
  delete from public.admin_passkeys p
   where p.user_id = auth.uid() and p.device_hash = dh;
  return true;
end;
$$;
revoke execute on function public.admin_passkey_remove(uuid, text) from public, anon;
grant  execute on function public.admin_passkey_remove(uuid, text) to authenticated;

/* Opaque: null for wrong secret / missing / not allowlisted. */
create or replace function public.admin_open_session_passkey(
  p_device text, p_credential_id text, p_unlock_secret text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  me   text;
  rec  public.admin_passkeys%rowtype;
  dh   text;
  t    uuid;
  cred text := left(trim(coalesce(p_credential_id, '')), 512);
begin
  if auth.uid() is null or coalesce(p_device, '') = '' or length(cred) < 16 then
    return null;
  end if;
  select u.email into me from auth.users u where u.id = auth.uid();
  if not exists (select 1 from public.admin_allow a where lower(a.email) = lower(coalesce(me, ''))) then
    return null;
  end if;

  dh := public.app_device_hash(p_device);
  select * into rec from public.admin_passkeys p
   where p.user_id = auth.uid() and p.device_hash = dh
   for update;
  if not found then
    return null;
  end if;
  if rec.credential_id is distinct from cred then
    return null;
  end if;
  if crypt(coalesce(p_unlock_secret, ''), rec.unlock_hash) <> rec.unlock_hash then
    return null;
  end if;

  delete from public.admin_sessions where expires_at < now();
  insert into public.admin_sessions (scope, opened_by, email)
  values ('ultra', auth.uid(), me)
  returning token into t;

  insert into public.admin_logins (user_id, email, method, scope)
  values (auth.uid(), coalesce(me, ''), 'passkey', 'ultra');

  return t;
end;
$$;
revoke execute on function public.admin_open_session_passkey(text, text, text) from public, anon;
grant  execute on function public.admin_open_session_passkey(text, text, text) to authenticated;

/* One-row sanity: code should resolve to ultra. */
select public.verify_admin_pin_scope('adminisbetter') as unlock_scope;

commit;
