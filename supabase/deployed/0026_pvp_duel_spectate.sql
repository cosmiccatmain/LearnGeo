/* ------------------------------------------------------------------
   0026: Geo Duel — classroom host/teacher spectate (LEA-77).

   Teachers (class hosts / co-teachers) can watch a live Geo Duel between
   students as a read-only spectator. Match state only: scores, round
   progress, and the public question payload. No submit / forfeit / seed,
   and spectator reads do NOT call pvp_resolve_round.

   Not pixel capture or admin monitoring. Do not reintroduce Daily share.

   Live schema only (see README.md). Safe to run twice.
   Apply after 0014 / 0017 / 0019. Next file after 0025 wallet share.

   MCP apply name on LearnGeo: `pvp_duel_spectate_0027`
   (0026 slot on live was used by an unrelated chess ladder apply).
-------------------------------------------------------------------*/

begin;

/* ========================= auth helpers =========================== */
/* A device is linked to an account only through profiles.save.deviceId
   (same caveat as ultra_wipe_scores in 0009). Teachers see matches where
   at least one player’s synced device belongs to a student in a class
   they teach. */
create or replace function private.pvp_can_spectate_match(p_match uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and exists (
       select 1
         from public.pvp_matches m
         join public.profiles p
           on nullif(btrim(coalesce(p.save::jsonb ->> 'deviceId', '')), '')
              in (m.host_device, m.guest_device)
         join public.class_members cm on cm.student_id = p.id
        where m.id = p_match
          and private.is_class_teacher(cm.class_id)
     );
$$;

create or replace function private.pvp_class_member_devices(p_class uuid)
returns table (device_id text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct nullif(btrim(coalesce(p.save::jsonb ->> 'deviceId', '')), '') as device_id
    from public.class_members cm
    join public.profiles p on p.id = cm.student_id
   where cm.class_id = p_class
     and nullif(btrim(coalesce(p.save::jsonb ->> 'deviceId', '')), '') is not null;
$$;

/* ===================== list live class duels ====================== */
create or replace function public.pvp_list_class_duels(p_class uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  rows jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'signin');
  end if;
  if p_class is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if not private.is_class_teacher(p_class) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', m.id,
           'status', m.status,
           'kind', m.kind,
           'host_tag', private.pvp_tag(m.host_device),
           'guest_tag', private.pvp_tag(m.guest_device),
           'host_score', m.host_score,
           'guest_score', m.guest_score,
           'current_round', m.current_round,
           'round_count', m.round_count,
           'updated_at', m.updated_at
         ) order by m.updated_at desc), '[]'::jsonb)
    into rows
    from public.pvp_matches m
   where m.status in ('seeding', 'active', 'finished')
     and m.updated_at > now() - interval '45 minutes'
     and (
       m.host_device in (select d.device_id from private.pvp_class_member_devices(p_class) d)
       or m.guest_device in (select d.device_id from private.pvp_class_member_devices(p_class) d)
     );

  return jsonb_build_object('ok', true, 'matches', rows);
end;
$$;

/* ======================== spectate one match ====================== */
/* Read-only. Reveal rules match pvp_match_state. No round resolve. */
create or replace function public.pvp_spectate_state(p_match uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  m public.pvp_matches%rowtype;
  reveal boolean;
  cur jsonb;
  i integer;
  rounds_out jsonb := '[]'::jsonb;
  secs integer := 18;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'signin');
  end if;
  if p_match is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  select * into m from public.pvp_matches where id = p_match;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if not private.pvp_can_spectate_match(p_match) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  for i in 0 .. greatest(m.round_count - 1, 0) loop
    reveal := (m.status = 'finished')
           or (i < m.current_round)
           or (i = m.current_round and m.status = 'active'
               and m.host_choice is not null and m.guest_choice is not null);
    rounds_out := rounds_out || jsonb_build_array(
      private.pvp_public_round(m.rounds->i, reveal)
    );
  end loop;

  cur := rounds_out->m.current_round;

  return jsonb_build_object(
    'ok', true,
    'id', m.id,
    'status', m.status,
    'role', 'spectator',
    'kind', m.kind,
    'host_tag', private.pvp_tag(m.host_device),
    'guest_tag', private.pvp_tag(m.guest_device),
    'host_score', m.host_score,
    'guest_score', m.guest_score,
    'current_round', m.current_round,
    'round_count', m.round_count,
    'round', cur,
    'rounds', rounds_out,
    'round_results', m.round_results,
    'answered_host', m.host_choice is not null,
    'answered_guest', m.guest_choice is not null,
    'round_started_at', m.round_started_at,
    'round_seconds', secs,
    'winner_tag', case when m.winner_device is null then null else private.pvp_tag(m.winner_device) end,
    'draw', m.status = 'finished' and m.winner_device is null,
    'updated_at', m.updated_at
  );
end;
$$;

revoke all on function public.pvp_list_class_duels(uuid) from public, anon;
revoke all on function public.pvp_spectate_state(uuid) from public, anon;
grant execute on function public.pvp_list_class_duels(uuid) to authenticated;
grant execute on function public.pvp_spectate_state(uuid) to authenticated;

commit;
