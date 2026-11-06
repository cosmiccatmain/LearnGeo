/* ------------------------------------------------------------------
   0012 — voluntary screen shares.

   This is not the activity board. account_activity (0009) stores the
   name of the view somebody is on. This table stores whether they are
   currently sending a live picture of a window they chose to share.
   One row per account, overwritten. There is no history of what was
   on the screen, because the pixels never land here — they go through
   Daily, and only while the share is live.

   Who can write: the signed-in account, its own row, and only for the
   room name lg-u-{their user id}. A banned account cannot.

   Who can read the list: an owner, with a live UltraAdmin session.
   The owner check is public.admin_is_owner, the same one Administrator
   uses. That already includes alexjschendel@gmail.com and
   oliver@themaclan.com. Comparing auth.users.email to
   admin_owner_email() alone excluded Oliver.
   ultra_activity lets any ultra session see view names. Live pictures
   do not.

   The browser never gets the Daily API key. Tokens are minted by the
   daily-share-token Edge Function.

   Safe to run twice. Run the whole file in the SQL editor.
------------------------------------------------------------------- */

create table if not exists public.screen_shares (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  room_name    text not null,
  status       text not null default 'stopped',
  started_at   timestamptz,
  last_seen_at timestamptz not null default now(),
  constraint screen_shares_status_chk check (status in ('live', 'stopped'))
);

alter table public.screen_shares enable row level security;
revoke all on public.screen_shares from public, anon, authenticated;

create index if not exists screen_shares_live_idx
  on public.screen_shares (last_seen_at desc)
  where status = 'live';

/* The device says whether its own share is live. auth.uid() decides
   the row, and the room name has to be the one we would mint a token
   for, so a device cannot mark somebody else as sharing. */
create or replace function public.report_screen_share(p_status text, p_room_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  st     text := lower(btrim(coalesce(p_status, '')));
  room   text := lower(btrim(coalesce(p_room_name, '')));
  expect text;
begin
  if auth.uid() is null then
    raise exception 'not authorised' using errcode = '42501';
  end if;
  if exists (select 1 from public.account_bans b where b.user_id = auth.uid()) then
    raise exception 'not authorised' using errcode = '42501';
  end if;

  expect := 'lg-u-' || lower(auth.uid()::text);
  if room <> expect
     or room !~ '^lg-u-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'not authorised' using errcode = '42501';
  end if;
  if st not in ('live', 'stopped') then
    raise exception 'status must be live or stopped' using errcode = '22023';
  end if;

  insert into public.screen_shares (user_id, room_name, status, started_at, last_seen_at)
  values (
    auth.uid(),
    room,
    st,
    case when st = 'live' then now() else null end,
    now()
  )
  on conflict (user_id) do update
    set room_name = excluded.room_name,
        status = excluded.status,
        last_seen_at = now(),
        started_at = case
          when excluded.status <> 'live' then screen_shares.started_at
          when screen_shares.status = 'live'
            then coalesce(screen_shares.started_at, now())
          else now()
        end;
end;
$$;
revoke execute on function public.report_screen_share(text, text) from public, anon;
grant  execute on function public.report_screen_share(text, text) to authenticated;

/* True only for an owner holding a live ultra session. Returns false
   for everyone else, including other ultra admins. admin_is_owner is
   bound to auth.uid(), so a stolen session token is useless to a
   different account. */
create or replace function public.screen_share_viewer_ok(p_token uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or p_token is null then
    return false;
  end if;
  if public.admin_scope_of(p_token) is distinct from 'ultra' then
    return false;
  end if;
  return coalesce(public.admin_is_owner(p_token), false);
end;
$$;
revoke execute on function public.screen_share_viewer_ok(uuid) from public, anon;
grant  execute on function public.screen_share_viewer_ok(uuid) to authenticated;

/* What Screen monitoring lists under Live shares. A row that has not
   been refreshed in two minutes is omitted: the tab was closed or the
   heartbeat stopped. Deleting the Daily room for those is a later
   pass; this only stops showing them. */
create or replace function public.list_screen_shares(p_token uuid)
returns table (
  user_id      uuid,
  email        text,
  display_name text,
  room_name    text,
  started_at   timestamptz,
  last_seen_at timestamptz,
  screen       text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.admin_scope_of(p_token) is distinct from 'ultra' then
    raise exception 'not authorised' using errcode = '42501';
  end if;
  if not public.screen_share_viewer_ok(p_token) then
    raise exception 'not permitted' using errcode = 'P0001';
  end if;

  return query
    select s.user_id,
           (select u.email::text from auth.users u where u.id = s.user_id),
           p.display_name::text,
           s.room_name,
           s.started_at,
           s.last_seen_at,
           coalesce(a.screen, '')::text
      from public.screen_shares s
      left join public.profiles p on p.id = s.user_id
      left join public.account_activity a on a.user_id = s.user_id
     where s.status = 'live'
       and s.last_seen_at > now() - interval '2 minutes'
     order by s.started_at desc nulls last
     limit 100;
end;
$$;
revoke execute on function public.list_screen_shares(uuid) from public, anon;
grant  execute on function public.list_screen_shares(uuid) to authenticated;

notify pgrst, 'reload schema';

/* check — expect: 3 */
select count(*)::int as screen_share_fns
  from pg_proc
 where proname in ('report_screen_share', 'list_screen_shares', 'screen_share_viewer_ok');
