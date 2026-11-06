/* ------------------------------------------------------------------
   0013 — two fixes already applied on the live project
   (envecwhnnktltfoypekk).

   screen_share_viewer_ok used to require auth.users.email =
   admin_owner_email(). Oliver (oliver@themaclan.com) is an owner via
   admin_is_owner, so list_screen_shares raised "not permitted" for
   him. The gate is admin_is_owner now. 0012's definition matches
   this; running this file updates a database that already applied
   the old 0012.

   ultra_activity lives in 0009. auth.users.email is varchar(255) and
   the function declares email as text, so Postgres raised "structure
   of query does not match function result type" ("Could not read who
   is on right now."). The cast is the only change to that body.
   0009 is left as it was.

   Safe to run twice.
------------------------------------------------------------------- */

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
           (select u.email::text from auth.users u where u.id = a.user_id),
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

notify pgrst, 'reload schema';
