/* ------------------------------------------------------------------
   0012 — per-admin command grants for the Administrator page.

   Owner account alexjschendel@gmail.com always has every command.
   (Historical note: an earlier `activity` / screen-monitoring grant gate
   lived here; live screen mirroring was removed from the client in LEA-46.)

   Everyone else on admin_allow starts with no grants: they can open
   the page and read accounts/stats/log, but cannot ban, change gems,
   message, or do destructive moderation until the owner grants a
   command.

   Safe to re-run: create-if-not-exists / create-or-replace throughout.
   Existing ultra_* bodies are patched in place so live logic (caps,
   jsonb paths, audit rows) is not reinvented.
-------------------------------------------------------------------*/

create table if not exists public.admin_command_grants (
  email      text primary key,
  commands   text[] not null default '{}',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.admin_command_grants enable row level security;
revoke all on public.admin_command_grants from public, anon, authenticated;

create or replace function public.admin_owner_email()
returns text
language sql
immutable
as $$ select 'alexjschendel@gmail.com'::text $$;

create or replace function public.admin_session_email(p_token uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(s.email)
    from public.admin_sessions s
   where s.token = p_token
     and s.expires_at > now()
     and s.opened_by = auth.uid()
$$;
revoke execute on function public.admin_session_email(uuid) from public, anon;
grant  execute on function public.admin_session_email(uuid) to authenticated;

create or replace function public.admin_is_owner(p_token uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(public.admin_session_email(p_token), ''))
       = lower(public.admin_owner_email())
$$;
revoke execute on function public.admin_is_owner(uuid) from public, anon;
grant  execute on function public.admin_is_owner(uuid) to authenticated;

/* Which commands an ultra session may run. Owner → everything.
   Non-owner → only rows in admin_command_grants. `activity` and
   `permissions` never leave the owner, even if somehow listed. */
create or replace function public.admin_may_command(p_token uuid, p_command text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cmd text := lower(btrim(coalesce(p_command, '')));
  mail text;
  granted text[];
begin
  if public.admin_scope_of(p_token) is distinct from 'ultra' then
    return false;
  end if;
  if cmd = '' then
    return false;
  end if;

  /* Read-only overview: any live ultra session. */
  if cmd in ('accounts', 'stats', 'log') then
    return true;
  end if;

  if public.admin_is_owner(p_token) then
    return true;
  end if;

  /* Hard gates — never grantable. */
  if cmd in ('activity', 'permissions', 'monitor') then
    return false;
  end if;

  mail := public.admin_session_email(p_token);
  if mail is null or mail = '' then
    return false;
  end if;

  select g.commands into granted
    from public.admin_command_grants g
   where lower(g.email) = mail;

  if granted is null then
    return false;
  end if;

  return cmd = any (granted);
end;
$$;
revoke execute on function public.admin_may_command(uuid, text) from public, anon;
grant  execute on function public.admin_may_command(uuid, text) to authenticated;

create or replace function public.admin_require(p_token uuid, p_command text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.admin_scope_of(p_token) is distinct from 'ultra' then
    raise exception 'not authorised' using errcode = '42501';
  end if;
  if not public.admin_may_command(p_token, p_command) then
    raise exception 'not permitted' using errcode = 'P0001';
  end if;
end;
$$;
revoke execute on function public.admin_require(uuid, text) from public, anon;
grant  execute on function public.admin_require(uuid, text) to authenticated;

/* What THIS session may do — drives the UI. */
create or replace function public.ultra_my_access(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  mail text;
  owner_ boolean;
  cmds text[] := '{}';
  all_cmds text[] := array[
    'accounts','stats','log','gems','ban','messages','staff',
    'allow','moderate','classes','activity','permissions'
  ];
begin
  if public.admin_scope_of(p_token) is distinct from 'ultra' then
    raise exception 'not authorised' using errcode = '42501';
  end if;

  mail := public.admin_session_email(p_token);
  owner_ := public.admin_is_owner(p_token);

  if owner_ then
    cmds := all_cmds;
  else
    select coalesce(g.commands, '{}') into cmds
      from public.admin_command_grants g
     where lower(g.email) = mail;
    cmds := coalesce(cmds, '{}') || array['accounts','stats','log'];
  end if;

  return jsonb_build_object(
    'owner', owner_,
    'email', mail,
    'commands', to_jsonb(cmds)
  );
end;
$$;
revoke execute on function public.ultra_my_access(uuid) from public, anon;
grant  execute on function public.ultra_my_access(uuid) to authenticated;

/* Owner: every allowlisted address and their grants. */
create or replace function public.ultra_grants_list(p_token uuid)
returns table (email text, commands text[], on_allowlist boolean, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.admin_require(p_token, 'permissions');
  return query
    select lower(a.email) as email,
           coalesce(g.commands, '{}'::text[]) as commands,
           true as on_allowlist,
           g.updated_at
      from public.admin_allow a
      left join public.admin_command_grants g on lower(g.email) = lower(a.email)
     where lower(a.email) is distinct from lower(public.admin_owner_email())
     order by lower(a.email);
end;
$$;
revoke execute on function public.ultra_grants_list(uuid) from public, anon;
grant  execute on function public.ultra_grants_list(uuid) to authenticated;

/* Owner assigns the grantable set. Empty array = restricted default. */
create or replace function public.ultra_grants_set(
  p_token uuid, p_email text, p_commands text[])
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  mail text := lower(btrim(coalesce(p_email, '')));
  allowed text[] := array['gems','ban','messages','staff','allow','moderate','classes'];
  cleaned text[] := '{}';
  c text;
begin
  perform public.admin_require(p_token, 'permissions');

  if mail = '' or mail !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'bad email' using errcode = '22023';
  end if;
  if mail = lower(public.admin_owner_email()) then
    raise exception 'the owner account is not limited' using errcode = '22023';
  end if;
  if not exists (select 1 from public.admin_allow a where lower(a.email) = mail) then
    raise exception 'that address is not on the admin allowlist' using errcode = 'P0002';
  end if;

  foreach c in array coalesce(p_commands, '{}') loop
    c := lower(btrim(c));
    if c = any (allowed) and not (c = any (cleaned)) then
      cleaned := cleaned || c;
    end if;
  end loop;

  if cardinality(cleaned) = 0 then
    delete from public.admin_command_grants where lower(email) = mail;
  else
    insert into public.admin_command_grants (email, commands, updated_at, updated_by)
    values (mail, cleaned, now(), auth.uid())
    on conflict (email) do update
      set commands = excluded.commands,
          updated_at = now(),
          updated_by = excluded.updated_by;
  end if;

  insert into public.admin_actions (actor, actor_email, target, target_email, action, detail)
  values (auth.uid(),
          (select u.email from auth.users u where u.id = auth.uid()),
          null, mail,
          'grants', jsonb_build_object('commands', cleaned));

  return cleaned;
end;
$$;
revoke execute on function public.ultra_grants_set(uuid, text, text[]) from public, anon;
grant  execute on function public.ultra_grants_set(uuid, text, text[]) to authenticated;

/* ================================================================
   Patch live ultra_* bodies: swap the bare scope check for
   admin_require(<command>). Re-running replaces an already-patched
   body with the same perform line (idempotent).
   ================================================================ */

create or replace function private.admin_patch_require(p_reg text, p_command text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  src text;
  neu text := 'perform public.admin_require(p_token, ''' || p_command || ''');';
  nxt text;
begin
  begin
    src := pg_get_functiondef(p_reg::regprocedure);
  exception when undefined_function then
    return;   /* function not on this database yet */
  end;

  if src ~ ('perform public\.admin_require\(p_token, ''' || p_command || '''\);') then
    return;   /* already gated for this command */
  end if;

  /* Prefer re-pointing an existing admin_require gate. */
  if src ~ 'perform public\.admin_require\(p_token, ''[^'']+''\);' then
    nxt := regexp_replace(
      src,
      'perform public\.admin_require\(p_token, ''[^'']+''\);',
      neu,
      'g'
    );
  else
    /* Classic scope check — whitespace-tolerant. */
    nxt := regexp_replace(
      src,
      'if\s+public\.admin_scope_of\(p_token\)\s+is\s+distinct\s+from\s+''ultra''\s+then\s+'
        || 'raise\s+exception\s+''not authorised''\s+using\s+errcode\s+=\s+''42501'';\s*'
        || 'end\s+if\s*;',
      neu,
      'gi'
    );
  end if;

  if nxt is null or nxt = src then
    raise exception 'admin_patch_require could not gate %', p_reg;
  end if;

  execute nxt;
end;
$$;

do $$
begin
  perform private.admin_patch_require('public.ultra_activity(uuid, integer)', 'activity');
  perform private.admin_patch_require('public.ultra_adjust_gems(uuid, uuid, integer, integer, text)', 'gems');
  perform private.admin_patch_require('public.ultra_override_gems(uuid, uuid, numeric, text)', 'gems');
  perform private.admin_patch_require('public.ultra_set_ban(uuid, uuid, boolean, text)', 'ban');
  perform private.admin_patch_require('public.ultra_banned(uuid)', 'ban');
  perform private.admin_patch_require('public.ultra_send_message(uuid, uuid, text)', 'messages');
  perform private.admin_patch_require('public.ultra_set_staff(uuid, uuid, boolean)', 'staff');
  perform private.admin_patch_require('public.ultra_allow_list(uuid)', 'allow');
  perform private.admin_patch_require('public.ultra_allow_set(uuid, text, boolean)', 'allow');
  perform private.admin_patch_require('public.ultra_set_name(uuid, uuid, text)', 'moderate');
  perform private.admin_patch_require('public.ultra_wipe_scores(uuid, uuid)', 'moderate');
  perform private.admin_patch_require('public.ultra_reset_progress(uuid, uuid)', 'moderate');
  perform private.admin_patch_require('public.ultra_leave_classes(uuid, uuid)', 'moderate');
  perform private.admin_patch_require('public.ultra_list_classes(uuid, text)', 'classes');
  perform private.admin_patch_require('public.ultra_set_admin_class(uuid, uuid, boolean)', 'classes');
  /* 0011 may or may not be applied yet. */
  perform private.admin_patch_require('public.ultra_message_thread(uuid, uuid)', 'messages');
end $$;

/* Keep the helper; it is only used at migrate time and is harmless. */
revoke execute on function private.admin_patch_require(text, text) from public, anon, authenticated;
