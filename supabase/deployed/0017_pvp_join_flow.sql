/* ------------------------------------------------------------------
   0017: Geo Duel join-flow fix.

   1) pvp_list_inbox was STABLE but calls private.pvp_expire_stale()
      (UPDATE). PostgREST runs STABLE RPCs in a read-only txn, so the
      client got "cannot execute UPDATE in a read-only transaction" and
      the inbox never loaded — guests never saw Accept, hosts never saw
      outgoing / active matches. Recreate as VOLATILE.

   2) Expire stale seeding/active matches so abandoned accepts stop
      blocking new invites with "busy".

   Safe to run twice. Apply after 0014. File number is 0017 because
   0016 is reserved for admin_logins (LEA-53).
-------------------------------------------------------------------*/

begin;

create or replace function private.pvp_expire_stale()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.pvp_invites
     set status = 'expired', responded_at = now()
   where status = 'pending'
     and created_at < now() - interval '10 minutes';

  /* Host never seeded (or both abandoned): free the pair to duel again. */
  update public.pvp_matches
     set status = 'cancelled', updated_at = now()
   where status = 'seeding'
     and created_at < now() - interval '5 minutes';

  update public.pvp_matches
     set status = 'cancelled', updated_at = now()
   where status = 'active'
     and updated_at < now() - interval '30 minutes';
end;
$$;

/* VOLATILE (default): must write via pvp_expire_stale. */
create or replace function public.pvp_list_inbox(p_device text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me text;
  incoming jsonb;
  outgoing jsonb;
  active jsonb;
begin
  perform private.pvp_expire_stale();
  if p_device is null or char_length(p_device) not between 8 and 64 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  select g.device_id into me from public.gamertags g where g.device_id = p_device;
  if me is null then return jsonb_build_object('ok', true, 'incoming', '[]'::jsonb, 'outgoing', '[]'::jsonb, 'active', null); end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', i.id,
           'from_tag', private.pvp_tag(i.from_device),
           'to_tag', private.pvp_tag(i.to_device),
           'status', i.status,
           'created_at', i.created_at,
           'match_id', i.match_id
         ) order by i.created_at desc), '[]'::jsonb)
    into incoming
    from public.pvp_invites i
   where i.to_device = me and i.status = 'pending';

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', i.id,
           'from_tag', private.pvp_tag(i.from_device),
           'to_tag', private.pvp_tag(i.to_device),
           'status', i.status,
           'created_at', i.created_at,
           'match_id', i.match_id
         ) order by i.created_at desc), '[]'::jsonb)
    into outgoing
    from public.pvp_invites i
   where i.from_device = me and i.status = 'pending';

  select jsonb_build_object(
           'id', m.id,
           'status', m.status,
           'host_tag', private.pvp_tag(m.host_device),
           'guest_tag', private.pvp_tag(m.guest_device),
           'host_score', m.host_score,
           'guest_score', m.guest_score,
           'current_round', m.current_round,
           'round_count', m.round_count,
           'kind', m.kind,
           'updated_at', m.updated_at
         )
    into active
    from public.pvp_matches m
   where (m.host_device = me or m.guest_device = me)
     and m.status in ('seeding','active')
   order by m.updated_at desc
   limit 1;

  return jsonb_build_object(
    'ok', true,
    'incoming', incoming,
    'outgoing', outgoing,
    'active', active
  );
end;
$$;

revoke execute on function public.pvp_list_inbox(text) from public;
grant execute on function public.pvp_list_inbox(text) to anon, authenticated;

/* One-shot cleanup for anything already stuck before this migration. */
update public.pvp_matches
   set status = 'cancelled', updated_at = now()
 where status = 'seeding'
   and created_at < now() - interval '5 minutes';

update public.pvp_matches
   set status = 'cancelled', updated_at = now()
 where status = 'active'
   and updated_at < now() - interval '30 minutes';

commit;
