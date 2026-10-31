/* ------------------------------------------------------------------
   0009: account bans, a live activity board, and four more admin
   commands.

   Written against the LIVE schema (see README.md in this folder):
   profiles.save as jsonb, class_members.student_id, gamertags and
   game_scores keyed on device_id. It follows the shape of
   ../migrations/0007_administrator.sql, which IS deployed despite not
   being recorded here: every command takes p_token, checks
   admin_scope_of() first, and writes a row to admin_actions.

   Run the whole file as ONE transaction in the SQL editor. It is safe
   to run twice. Each of the three parts ends in a one-row check whose
   answer is obvious, so you can also paste them one at a time.

   ---------------------------------------------------------------
   WHAT THE BAN DOES, AND WHAT IT DOES NOT DO

   It is the truth about whether an account is banned, kept somewhere
   the account cannot write. The app asks my_ban() when somebody signs
   in and refuses to go any further.

   It does NOT stop a banned account's writes. Their device could
   still push a save or post a score if somebody edited the page's
   own code to skip the check. Making that impossible means rewriting
   the policies on profiles, results and game_scores, which is a much
   larger change to a live database and is not what was asked for.

   So: this stops a banned person using LearnGeo. It does not stop a
   determined person with the developer console open. That is worth
   knowing before it is relied on for anything that matters.
------------------------------------------------------------------ */

/* ================================================================
   PART 1 — bans
   ================================================================ */

/* Row level security on with no policies and no grants, exactly like
   the arcade tables: the only way in or out is the functions below,
   and they check who is asking. An account cannot read, write or
   delete its own ban. */
create table if not exists public.account_bans (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  reason     text not null default '',
  banned_at  timestamptz not null default now(),
  banned_by  uuid references auth.users(id) on delete set null
);
alter table public.account_bans enable row level security;
revoke all on public.account_bans from public, anon, authenticated;

/* What the signed-in account is told about ITSELF. It takes no
   arguments on purpose: there is no target to tamper with, so this
   cannot be used to ask about anybody else. */
create or replace function public.my_ban()
returns table (banned boolean, reason text, banned_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select true, b.reason, b.banned_at
    from public.account_bans b
   where b.user_id = auth.uid()
$$;
revoke execute on function public.my_ban() from public, anon;
grant  execute on function public.my_ban() to authenticated;

/* Ban or unban. p_on false lifts it, and lifting is a plain delete so
   an unbanned account leaves nothing behind that could be read as a
   mark against it. */
create or replace function public.ultra_set_ban(
  p_token uuid, p_target uuid, p_on boolean, p_reason text default '')
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  on_ boolean := coalesce(p_on, false);
begin
  if public.admin_scope_of(p_token) is distinct from 'ultra' then
    raise exception 'not authorised' using errcode = '42501';
  end if;
  if p_target is null then
    raise exception 'no account given' using errcode = '22023';
  end if;
  /* An admin who bans themselves locks themselves out of the console
     they would need to undo it. */
  if p_target = auth.uid() then
    raise exception 'you cannot ban your own account' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_target) then
    raise exception 'no such account' using errcode = 'P0002';
  end if;

  if on_ then
    insert into public.account_bans (user_id, reason, banned_by)
    values (p_target, left(coalesce(p_reason, ''), 300), auth.uid())
    on conflict (user_id) do update
      set reason = excluded.reason, banned_at = now(), banned_by = excluded.banned_by;
  else
    delete from public.account_bans where user_id = p_target;
  end if;

  insert into public.admin_actions (actor, actor_email, target, target_email, action, detail)
  values (auth.uid(),
          (select u.email from auth.users u where u.id = auth.uid()),
          p_target,
          (select u.email from auth.users u where u.id = p_target),
          'ban', jsonb_build_object('on', on_, 'reason', left(coalesce(p_reason, ''), 300)));

  return on_;
end;
$$;
revoke execute on function public.ultra_set_ban(uuid, uuid, boolean, text) from public, anon;
grant  execute on function public.ultra_set_ban(uuid, uuid, boolean, text) to authenticated;

/* Who is banned, for the console's own list. */
create or replace function public.ultra_banned(p_token uuid)
returns table (user_id uuid, email text, display_name text, reason text, banned_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.admin_scope_of(p_token) is distinct from 'ultra' then
    raise exception 'not authorised' using errcode = '42501';
  end if;
  return query
    select b.user_id,
           (select u.email from auth.users u where u.id = b.user_id),
           p.display_name, b.reason, b.banned_at
      from public.account_bans b
      left join public.profiles p on p.id = b.user_id
     order by b.banned_at desc;
end;
$$;
revoke execute on function public.ultra_banned(uuid) from public, anon;
grant  execute on function public.ultra_banned(uuid) to authenticated;

/* check 1 — expect: 0 */
select count(*)::int as bans_so_far from public.account_bans;

/* ================================================================
   PART 2 — the activity board

   What it records: which screen somebody is on, and when. That is
   all. Not what they type, not what they answer, not their screen.
   A class monitor needs to know that Sam is on Practice test and was
   active a minute ago; it does not need, and should not have, the
   contents of the box Sam is typing into.

   One row per account, overwritten. There is no history here, so
   this cannot become a log of somebody's day.
   ================================================================ */
create table if not exists public.account_activity (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  screen    text not null default '',
  detail    text not null default '',
  seen_at   timestamptz not null default now()
);
alter table public.account_activity enable row level security;
revoke all on public.account_activity from public, anon, authenticated;

/* The device says where it is. auth.uid() decides whose row it is, so
   a device cannot report on somebody else. Both strings are cut
   short: this is a screen name, not a place to put an essay. */
create or replace function public.report_activity(p_screen text, p_detail text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return; end if;
  insert into public.account_activity (user_id, screen, detail, seen_at)
  values (auth.uid(), left(coalesce(p_screen, ''), 40), left(coalesce(p_detail, ''), 80), now())
  on conflict (user_id) do update
    set screen = excluded.screen, detail = excluded.detail, seen_at = now();
end;
$$;
revoke execute on function public.report_activity(text, text) from public, anon;
grant  execute on function public.report_activity(text, text) to authenticated;

/* What the console shows: everybody seen in the last p_minutes. */
create or replace function public.ultra_activity(p_token uuid, p_minutes integer default 15)
returns table (user_id uuid, email text, display_name text,
               screen text, detail text, seen_at timestamptz, banned boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.admin_scope_of(p_token) is distinct from 'ultra' then
    raise exception 'not authorised' using errcode = '42501';
  end if;
  return query
    select a.user_id,
           (select u.email from auth.users u where u.id = a.user_id),
           p.display_name, a.screen, a.detail, a.seen_at,
           exists (select 1 from public.account_bans b where b.user_id = a.user_id)
      from public.account_activity a
      left join public.profiles p on p.id = a.user_id
     where a.seen_at > now() - make_interval(mins => greatest(1, least(coalesce(p_minutes, 15), 1440)))
     order by a.seen_at desc
     limit 200;
end;
$$;
revoke execute on function public.ultra_activity(uuid, integer) from public, anon;
grant  execute on function public.ultra_activity(uuid, integer) to authenticated;

/* check 2 — expect: 0 */
select count(*)::int as rows_so_far from public.account_activity;

/* ================================================================
   PART 3 — four more commands

   All four follow 0007's shape: check the token, do one thing, write
   a row to admin_actions. The three that change the save also stamp
   flags.adminAt, which is what makes admin-inbox.js pull the change
   down to a device that has the app open — without it, that device's
   next push would put the old copy straight back.
   ================================================================ */

/* Rename, or clear with an empty name. For a display name that is
   offensive or pretending to be somebody else. */
create or replace function public.ultra_set_name(p_token uuid, p_target uuid, p_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  s     jsonb;
  nm    text := left(btrim(coalesce(p_name, '')), 40);
begin
  if public.admin_scope_of(p_token) is distinct from 'ultra' then
    raise exception 'not authorised' using errcode = '42501';
  end if;
  if nm = '' then nm := 'Explorer'; end if;   /* the app's own default */

  select coalesce(p.save::jsonb, '{}'::jsonb) into s
    from public.profiles p where p.id = p_target;
  if not found then
    raise exception 'no such account' using errcode = 'P0002';
  end if;
  if jsonb_typeof(s) <> 'object' then
    raise exception 'that account''s save is not an object; refusing to overwrite it'
      using errcode = '22023';
  end if;

  if jsonb_typeof(s -> 'profile') is distinct from 'object' then s := s || '{"profile":{}}'::jsonb; end if;
  if jsonb_typeof(s -> 'flags')   is distinct from 'object' then s := s || '{"flags":{}}'::jsonb;   end if;
  s := jsonb_set(s, '{profile,displayName}', to_jsonb(nm));
  s := jsonb_set(s, '{flags,adminAt}', to_jsonb(now()));

  update public.profiles p set save = s, display_name = nm where p.id = p_target;

  insert into public.admin_actions (actor, actor_email, target, target_email, action, detail)
  values (auth.uid(),
          (select u.email from auth.users u where u.id = auth.uid()),
          p_target,
          (select u.email from auth.users u where u.id = p_target),
          'rename', jsonb_build_object('name', nm));

  return nm;
end;
$$;
revoke execute on function public.ultra_set_name(uuid, uuid, text) from public, anon;
grant  execute on function public.ultra_set_name(uuid, uuid, text) to authenticated;

/* Take an account off the arcade boards.

   A caveat worth reading before trusting this: gamertags and
   game_scores are keyed on DEVICE, not on account, and the only link
   back to an account is the device id sitting in its save. So this
   clears the device that account last synced from. Somebody who
   played on a second device keeps that device's scores, because
   nothing in the database ties it to them. */
create or replace function public.ultra_wipe_scores(p_token uuid, p_target uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  dev text;
  n   integer := 0;
begin
  if public.admin_scope_of(p_token) is distinct from 'ultra' then
    raise exception 'not authorised' using errcode = '42501';
  end if;

  select nullif(btrim(coalesce(p.save::jsonb ->> 'deviceId', '')), '') into dev
    from public.profiles p where p.id = p_target;
  if not found then
    raise exception 'no such account' using errcode = 'P0002';
  end if;
  if dev is null then
    return 0;      /* never played, or never synced a device id */
  end if;

  delete from public.game_scores where device_id = dev;
  get diagnostics n = row_count;
  delete from public.gamertags where device_id = dev;

  insert into public.admin_actions (actor, actor_email, target, target_email, action, detail)
  values (auth.uid(),
          (select u.email from auth.users u where u.id = auth.uid()),
          p_target,
          (select u.email from auth.users u where u.id = p_target),
          'wipe_scores', jsonb_build_object('device', dev, 'scores', n));

  return n;
end;
$$;
revoke execute on function public.ultra_wipe_scores(uuid, uuid) from public, anon;
grant  execute on function public.ultra_wipe_scores(uuid, uuid) to authenticated;

/* Put an account's learning progress back to new. The account, its
   classes and its name all stay; level, XP, diamonds, mastery, stats
   and streaks go. Cosmetics they own are left alone — taking those is
   the gem panel's job and a different decision. */
create or replace function public.ultra_reset_progress(p_token uuid, p_target uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  s jsonb;
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

  s := s || jsonb_build_object(
    'economy', jsonb_build_object('diamonds', 150, 'xp', 0, 'level', 1),
    'streak',  jsonb_build_object('current', 0, 'best', 0),
    'stats',   jsonb_build_object('answered', 0, 'correct', 0, 'tests', 0,
                                  'cards', 0, 'perfectTests', 0),
    'mastery', '{}'::jsonb,
    'achievements', '[]'::jsonb
  );
  if jsonb_typeof(s -> 'flags') is distinct from 'object' then s := s || '{"flags":{}}'::jsonb; end if;
  s := jsonb_set(s, '{flags,adminAt}', to_jsonb(now()));

  update public.profiles p set save = s where p.id = p_target;

  insert into public.admin_actions (actor, actor_email, target, target_email, action, detail)
  values (auth.uid(),
          (select u.email from auth.users u where u.id = auth.uid()),
          p_target,
          (select u.email from auth.users u where u.id = p_target),
          'reset_progress', '{}'::jsonb);

  return true;
end;
$$;
revoke execute on function public.ultra_reset_progress(uuid, uuid) from public, anon;
grant  execute on function public.ultra_reset_progress(uuid, uuid) to authenticated;

/* Take an account out of every class it has joined. Their results
   stay in those classes, because a teacher's gradebook should not
   lose marks because a student was removed. */
create or replace function public.ultra_leave_classes(p_token uuid, p_target uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer := 0;
begin
  if public.admin_scope_of(p_token) is distinct from 'ultra' then
    raise exception 'not authorised' using errcode = '42501';
  end if;

  delete from public.class_members where student_id = p_target;
  get diagnostics n = row_count;

  insert into public.admin_actions (actor, actor_email, target, target_email, action, detail)
  values (auth.uid(),
          (select u.email from auth.users u where u.id = auth.uid()),
          p_target,
          (select u.email from auth.users u where u.id = p_target),
          'leave_classes', jsonb_build_object('classes', n));

  return n;
end;
$$;
revoke execute on function public.ultra_leave_classes(uuid, uuid) from public, anon;
grant  execute on function public.ultra_leave_classes(uuid, uuid) to authenticated;

/* check 3 — expect: 9 */
select count(*)::int as new_functions
  from pg_proc
 where proname in ('my_ban','ultra_set_ban','ultra_banned','report_activity',
                   'ultra_activity','ultra_set_name','ultra_wipe_scores',
                   'ultra_reset_progress','ultra_leave_classes');
