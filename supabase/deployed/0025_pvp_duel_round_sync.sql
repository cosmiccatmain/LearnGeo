/* ------------------------------------------------------------------
   0025: Geo Duel round sync.

   NOT APPLIED to the live database. Do not run this against production
   from an agent session. It is the source of truth for a later apply
   (SQL editor or MCP). Safe to run twice. Apply after 0014 / 0017 / 0019.

   1) pvp_send_invite rejects when either player already has a seeding
      or active match (Chess Duel already did this; Geo Duel only
      checked on accept, so the invite sat in the inbox and then failed).
   2) Answers after the 18s round clock are not stored. The round
      resolves with whoever had already answered.
   3) Speed is the server clock (now() - round_started_at). Client p_ms
      is ignored so a late paint or a forged 0ms cannot win the round.
   4) pvp_match_state includes server_now and round_remaining_ms so the
      client countdown does not depend on the device clock.

   CREATE OR REPLACE keeps existing grants. This file does not GRANT to
   anon (0019 revoked anon). Authenticated callers keep the privileges
   they already have.
-------------------------------------------------------------------*/

begin;

create or replace function public.pvp_send_invite(p_device text, p_to_tag text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me text;
  them text;
  their_tag text;
  pending_n integer;
  invite_id uuid;
begin
  perform private.pvp_expire_stale();
  if p_device is null or char_length(p_device) not between 8 and 64 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if p_to_tag is null or p_to_tag !~ '^[A-Za-z0-9_]{3,16}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_tag');
  end if;
  select g.device_id into me from public.gamertags g where g.device_id = p_device;
  if me is null then return jsonb_build_object('ok', false, 'error', 'no_gamertag'); end if;

  select g.device_id, g.gamertag into them, their_tag
    from public.gamertags g where g.tag_key = lower(p_to_tag);
  if them is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if them = me then return jsonb_build_object('ok', false, 'error', 'self'); end if;

  select count(*) into pending_n
    from public.pvp_invites i
   where i.from_device = me and i.status = 'pending';
  if pending_n >= 5 then
    return jsonb_build_object('ok', false, 'error', 'too_many');
  end if;

  if exists (
    select 1 from public.pvp_invites i
     where i.status = 'pending'
       and ((i.from_device = me and i.to_device = them)
         or (i.from_device = them and i.to_device = me))
  ) then
    return jsonb_build_object('ok', false, 'error', 'already_pending');
  end if;

  /* Same guard Chess Duel has had since 0018. Accept already returned
     busy; sending the invite anyway looked like a dropped challenge. */
  if exists (
    select 1 from public.pvp_matches m
     where m.status in ('seeding', 'active')
       and (m.host_device in (me, them) or m.guest_device in (me, them))
  ) then
    return jsonb_build_object('ok', false, 'error', 'busy');
  end if;

  insert into public.pvp_invites (from_device, to_device)
  values (me, them)
  returning id into invite_id;

  return jsonb_build_object(
    'ok', true,
    'invite_id', invite_id,
    'to_tag', their_tag
  );
end;
$$;

create or replace function public.pvp_submit_answer(
  p_device text, p_match uuid, p_round integer, p_choice integer, p_ms integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.pvp_matches%rowtype;
  role text;
  ms integer;
begin
  if p_device is null or p_match is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if p_choice is null or p_choice < 0 or p_choice > 7 then
    return jsonb_build_object('ok', false, 'error', 'bad_choice');
  end if;

  select * into m from public.pvp_matches where id = p_match for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if m.host_device <> p_device and m.guest_device <> p_device then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if m.status <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'not_active');
  end if;

  /* Clock already ran out: do not attach this click to the round. */
  if m.round_started_at is not null
     and m.round_started_at < now() - interval '18 seconds' then
    return public.pvp_resolve_round(p_device, p_match);
  end if;

  if p_round is distinct from m.current_round then
    return jsonb_build_object('ok', false, 'error', 'wrong_round');
  end if;

  if m.round_started_at is null then
    ms := 0;
  else
    ms := floor(extract(epoch from (now() - m.round_started_at)) * 1000)::integer;
  end if;
  if ms is null or ms < 0 then ms := 0; end if;
  if ms > 60000 then ms := 60000; end if;

  role := case when m.host_device = p_device then 'host' else 'guest' end;
  if role = 'host' then
    if m.host_choice is not null then
      return jsonb_build_object('ok', false, 'error', 'already');
    end if;
    update public.pvp_matches
       set host_choice = p_choice, host_ms = ms, updated_at = now()
     where id = p_match;
  else
    if m.guest_choice is not null then
      return jsonb_build_object('ok', false, 'error', 'already');
    end if;
    update public.pvp_matches
       set guest_choice = p_choice, guest_ms = ms, updated_at = now()
     where id = p_match;
  end if;

  return public.pvp_resolve_round(p_device, p_match);
end;
$$;

create or replace function public.pvp_match_state(p_device text, p_match uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.pvp_matches%rowtype;
  role text;
  reveal boolean;
  cur jsonb;
  i integer;
  rounds_out jsonb := '[]'::jsonb;
  answered_me boolean;
  answered_them boolean;
  secs integer := 18;
  remaining_ms integer;
begin
  if p_device is null or p_match is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  select * into m from public.pvp_matches where id = p_match;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if m.host_device <> p_device and m.guest_device <> p_device then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  role := case when m.host_device = p_device then 'host' else 'guest' end;

  /* Auto-resolve a timed-out round before returning state. */
  if m.status = 'active'
     and m.round_started_at is not null
     and m.round_started_at < now() - make_interval(secs => secs) then
    perform public.pvp_resolve_round(p_device, p_match);
    select * into m from public.pvp_matches where id = p_match;
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
  answered_me := case when role = 'host' then m.host_choice is not null else m.guest_choice is not null end;
  answered_them := case when role = 'host' then m.guest_choice is not null else m.host_choice is not null end;

  remaining_ms := null;
  if m.status = 'active' and m.round_started_at is not null then
    remaining_ms := greatest(0, floor(extract(epoch from (
      m.round_started_at + make_interval(secs => secs) - now()
    )) * 1000)::integer);
  end if;

  return jsonb_build_object(
    'ok', true,
    'id', m.id,
    'status', m.status,
    'role', role,
    'kind', m.kind,
    'host_tag', private.pvp_tag(m.host_device),
    'guest_tag', private.pvp_tag(m.guest_device),
    'host_score', m.host_score,
    'guest_score', m.guest_score,
    'my_score', case when role = 'host' then m.host_score else m.guest_score end,
    'their_score', case when role = 'host' then m.guest_score else m.host_score end,
    'current_round', m.current_round,
    'round_count', m.round_count,
    'round', cur,
    'rounds', rounds_out,
    'round_results', m.round_results,
    'answered_me', answered_me,
    'answered_them', answered_them,
    'round_started_at', m.round_started_at,
    'round_seconds', secs,
    'round_remaining_ms', remaining_ms,
    'server_now', now(),
    'winner_tag', case when m.winner_device is null then null else private.pvp_tag(m.winner_device) end,
    'i_won', m.winner_device is not null and m.winner_device = p_device,
    'draw', m.status = 'finished' and m.winner_device is null,
    'updated_at', m.updated_at
  );
end;
$$;

commit;
