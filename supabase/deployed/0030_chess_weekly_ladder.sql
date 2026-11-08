/* ------------------------------------------------------------------
   0030: Geo Chess weekly Elo ladder (file slot; MCP name stays chess_weekly_ladder_0026) + last opponent (LEA-76).

   Extends chess_ratings with an ISO-week (UTC Monday) roll so we can
   rank players by Elo gained this week. Bot and PvP apply_* paths
   roll the week before updating Elo. Rematch uses the most recent
   finished chess_duel_matches row (no new invite table).

   Safe to run twice. File slot 0030 after 0026–0029 collisions. Apply after 0024 / 0018.
   MCP already applied as chess_weekly_ladder_0026 — do not re-apply.
-------------------------------------------------------------------*/

begin;

/* ======================== weekly columns ========================== */
alter table public.chess_ratings
  add column if not exists week_key text,
  add column if not exists week_base integer
    check (week_base is null or week_base between 100 and 3500),
  add column if not exists week_games integer not null default 0
    check (week_games >= 0);

create index if not exists chess_ratings_week_delta
  on public.chess_ratings (week_key, week_games)
  where week_games > 0;

/* ============================ helpers ============================= */
/* ISO week label in UTC, e.g. 2026-W45 (Monday-start). */
create or replace function private.chess_week_key(p_at timestamptz)
returns text
language sql
immutable
as $$
  select to_char((p_at at time zone 'utc')::date, 'IYYY-"W"IW');
$$;

/* Roll week_key / week_base when the UTC ISO week has advanced.
   Call BEFORE changing elo so week_base captures pre-game rating. */
create or replace function private.chess_elo_roll_week(p_device text)
returns public.chess_ratings
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.chess_ratings;
  cur text := private.chess_week_key(now());
begin
  row := private.chess_elo_ensure(p_device);
  if row.week_key is distinct from cur then
    update public.chess_ratings
       set week_key = cur,
           week_base = elo,
           week_games = 0,
           updated_at = now()
     where device_id = p_device
     returning * into row;
  elsif row.week_base is null then
    update public.chess_ratings
       set week_base = elo,
           week_key = coalesce(week_key, cur),
           updated_at = now()
     where device_id = p_device
     returning * into row;
  end if;
  return row;
end;
$$;

/* =========================== vs bot =============================== */
create or replace function public.apply_chess_bot_elo(
  p_device text, p_bot_elo integer, p_outcome text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  gate text;
  row public.chess_ratings;
  score double precision;
  new_elo integer;
  delta integer;
  week_delta integer;
begin
  gate := private.chess_elo_gate(p_device);
  if gate is not null then
    return jsonb_build_object('ok', false, 'error', gate);
  end if;
  if p_bot_elo is null or p_bot_elo not between 100 and 4000 then
    return jsonb_build_object('ok', false, 'error', 'bad_bot');
  end if;
  if p_outcome is null or p_outcome not in ('win', 'draw', 'loss') then
    return jsonb_build_object('ok', false, 'error', 'bad_outcome');
  end if;

  score := case p_outcome when 'win' then 1.0 when 'draw' then 0.5 else 0.0 end;
  row := private.chess_elo_roll_week(p_device);
  new_elo := private.chess_elo_next(row.elo, p_bot_elo, score, 32);
  delta := new_elo - row.elo;
  week_delta := new_elo - coalesce(row.week_base, row.elo);

  update public.chess_ratings
     set elo = new_elo,
         games = games + 1,
         week_games = week_games + 1,
         updated_at = now()
   where device_id = p_device;

  perform private.chess_elo_mirror(p_device, new_elo);

  return jsonb_build_object(
    'ok', true,
    'elo', new_elo,
    'delta', delta,
    'games', row.games + 1,
    'before', row.elo,
    'opp', p_bot_elo,
    'week_key', row.week_key,
    'week_delta', week_delta,
    'week_games', row.week_games + 1
  );
end;
$$;

/* =========================== Chess Duel =========================== */
create or replace function public.apply_chess_duel_elo(p_device text, p_match uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  gate text;
  m public.chess_duel_matches;
  me_row public.chess_ratings;
  them_row public.chess_ratings;
  them text;
  my_score double precision;
  their_score double precision;
  my_new integer;
  their_new integer;
  my_delta integer;
  week_delta integer;
begin
  gate := private.chess_elo_gate(p_device);
  if gate is not null then
    return jsonb_build_object('ok', false, 'error', gate);
  end if;
  if p_match is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  select * into m from public.chess_duel_matches where id = p_match for update;
  if m is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if p_device <> m.host_device and p_device <> m.guest_device then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if m.status <> 'finished' then
    return jsonb_build_object('ok', false, 'error', 'not_finished');
  end if;

  them := case when p_device = m.host_device then m.guest_device else m.host_device end;
  me_row := private.chess_elo_roll_week(p_device);
  them_row := private.chess_elo_roll_week(them);

  if m.elo_applied then
    return jsonb_build_object(
      'ok', true,
      'already', true,
      'elo', me_row.elo,
      'delta', 0,
      'games', me_row.games,
      'opp_elo', them_row.elo,
      'week_key', me_row.week_key,
      'week_delta', me_row.elo - coalesce(me_row.week_base, me_row.elo),
      'week_games', me_row.week_games
    );
  end if;

  if m.winner_device is null and coalesce(m.end_reason, '') not in
       ('draw', 'stalemate', 'insufficient', 'repetition', 'fifty') then
    update public.chess_duel_matches set elo_applied = true where id = p_match;
    return jsonb_build_object(
      'ok', true, 'skipped', true,
      'elo', me_row.elo, 'delta', 0, 'games', me_row.games, 'opp_elo', them_row.elo,
      'week_key', me_row.week_key,
      'week_delta', me_row.elo - coalesce(me_row.week_base, me_row.elo),
      'week_games', me_row.week_games
    );
  end if;

  if m.winner_device is null then
    my_score := 0.5; their_score := 0.5;
  elsif m.winner_device = p_device then
    my_score := 1.0; their_score := 0.0;
  else
    my_score := 0.0; their_score := 1.0;
  end if;

  my_new := private.chess_elo_next(me_row.elo, them_row.elo, my_score, 32);
  their_new := private.chess_elo_next(them_row.elo, me_row.elo, their_score, 32);
  my_delta := my_new - me_row.elo;
  week_delta := my_new - coalesce(me_row.week_base, me_row.elo);

  update public.chess_ratings
     set elo = my_new, games = games + 1, week_games = week_games + 1, updated_at = now()
   where device_id = p_device;
  update public.chess_ratings
     set elo = their_new, games = games + 1, week_games = week_games + 1, updated_at = now()
   where device_id = them;
  perform private.chess_elo_mirror(p_device, my_new);
  perform private.chess_elo_mirror(them, their_new);
  update public.chess_duel_matches set elo_applied = true where id = p_match;

  return jsonb_build_object(
    'ok', true,
    'elo', my_new,
    'delta', my_delta,
    'games', me_row.games + 1,
    'before', me_row.elo,
    'opp_elo', them_row.elo,
    'opp_new', their_new,
    'week_key', me_row.week_key,
    'week_delta', week_delta,
    'week_games', me_row.week_games + 1
  );
end;
$$;

/* ============================== read ============================== */
create or replace function public.get_chess_elo(p_device text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  row public.chess_ratings;
  cur text := private.chess_week_key(now());
  week_delta integer;
begin
  if p_device is null or char_length(p_device) not between 8 and 64 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  select * into row from public.chess_ratings where device_id = p_device;
  if row is null then
    return jsonb_build_object(
      'ok', true, 'elo', 1000, 'games', 0, 'provisional', true,
      'week_key', cur, 'week_delta', 0, 'week_games', 0
    );
  end if;
  if row.week_key is distinct from cur then
    week_delta := 0;
  else
    week_delta := row.elo - coalesce(row.week_base, row.elo);
  end if;
  return jsonb_build_object(
    'ok', true,
    'elo', row.elo,
    'games', row.games,
    'provisional', false,
    'week_key', case when row.week_key is distinct from cur then cur else row.week_key end,
    'week_delta', week_delta,
    'week_games', case when row.week_key is distinct from cur then 0 else row.week_games end
  );
end;
$$;

/* ======================== weekly ladder =========================== */
create or replace function public.chess_weekly_ladder(
  p_device text default null,
  p_limit integer default 25)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cur text := private.chess_week_key(now());
  lim integer := greatest(1, least(coalesce(p_limit, 25), 50));
  rows jsonb;
  me jsonb := null;
  my_rank integer;
  my_delta integer := 0;
  my_games integer := 0;
  my_elo integer := 1000;
begin
  select coalesce(jsonb_agg(x.obj order by x.ord), '[]'::jsonb)
    into rows
    from (
      select
        row_number() over (order by (r.elo - coalesce(r.week_base, r.elo)) desc,
                                    r.elo desc, r.updated_at asc) as ord,
        jsonb_build_object(
          'rank', row_number() over (order by (r.elo - coalesce(r.week_base, r.elo)) desc,
                                              r.elo desc, r.updated_at asc),
          'gamertag', g.gamertag,
          'elo', r.elo,
          'week_delta', r.elo - coalesce(r.week_base, r.elo),
          'week_games', r.week_games,
          'is_me', (p_device is not null and r.device_id = p_device)
        ) as obj,
        r.device_id
      from public.chess_ratings r
      join public.gamertags g on g.device_id = r.device_id
      where r.week_key = cur
        and r.week_games > 0
      order by (r.elo - coalesce(r.week_base, r.elo)) desc, r.elo desc, r.updated_at asc
      limit lim
    ) x;

  if p_device is not null and char_length(p_device) between 8 and 64 then
    select
      r.elo,
      case when r.week_key = cur then r.elo - coalesce(r.week_base, r.elo) else 0 end,
      case when r.week_key = cur then r.week_games else 0 end
      into my_elo, my_delta, my_games
    from public.chess_ratings r
    where r.device_id = p_device;

    if found then
      select count(*) + 1 into my_rank
        from public.chess_ratings r
       where r.week_key = cur
         and r.week_games > 0
         and (
           (r.elo - coalesce(r.week_base, r.elo)) > my_delta
           or (
             (r.elo - coalesce(r.week_base, r.elo)) = my_delta
             and r.elo > my_elo
           )
           or (
             (r.elo - coalesce(r.week_base, r.elo)) = my_delta
             and r.elo = my_elo
             and r.device_id < p_device
           )
         );
      if my_games = 0 then my_rank := null; end if;
      me := jsonb_build_object(
        'rank', my_rank,
        'elo', coalesce(my_elo, 1000),
        'week_delta', coalesce(my_delta, 0),
        'week_games', coalesce(my_games, 0),
        'gamertag', private.pvp_tag(p_device)
      );
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'week_key', cur,
    'rows', coalesce(rows, '[]'::jsonb),
    'me', me
  );
end;
$$;

/* ======================== last opponent =========================== */
create or replace function public.chess_duel_last_opponent(p_device text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  m public.chess_duel_matches;
  them text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'signin');
  end if;
  if p_device is null or char_length(p_device) not between 8 and 64 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if not exists (select 1 from public.gamertags g where g.device_id = p_device) then
    return jsonb_build_object('ok', false, 'error', 'no_gamertag');
  end if;

  select * into m
    from public.chess_duel_matches
   where status = 'finished'
     and (host_device = p_device or guest_device = p_device)
   order by updated_at desc
   limit 1;

  if m is null then
    return jsonb_build_object('ok', true, 'found', false);
  end if;

  them := case when m.host_device = p_device then m.guest_device else m.host_device end;
  return jsonb_build_object(
    'ok', true,
    'found', true,
    'tag', private.pvp_tag(them),
    'match_id', m.id,
    'updated_at', m.updated_at,
    'end_reason', m.end_reason
  );
end;
$$;

/* ============================== grants ============================ */
revoke all on function public.chess_weekly_ladder(text, integer) from public, anon, authenticated;
revoke all on function public.chess_duel_last_opponent(text) from public, anon, authenticated;
revoke all on function public.get_chess_elo(text) from public, anon, authenticated;
revoke all on function public.apply_chess_bot_elo(text, integer, text) from public, anon, authenticated;
revoke all on function public.apply_chess_duel_elo(text, uuid) from public, anon, authenticated;

grant execute on function public.chess_weekly_ladder(text, integer) to anon, authenticated;
grant execute on function public.chess_duel_last_opponent(text) to authenticated;
grant execute on function public.get_chess_elo(text) to anon, authenticated;
grant execute on function public.apply_chess_bot_elo(text, integer, text) to authenticated;
grant execute on function public.apply_chess_duel_elo(text, uuid) to authenticated;

commit;
