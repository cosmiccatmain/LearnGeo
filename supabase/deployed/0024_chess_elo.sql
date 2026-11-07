/* ------------------------------------------------------------------
   0024: Geo Chess Elo ratings (LEA-60).

   Shared rating for Geo Chess (vs bots) and Chess Duel PvP. Starts at
   1000; K-factor 32 (school-friendly, moves faster than adult FIDE K).
   Standard Elo expected-score math. Ratings are clamped 100–3500.

   Authoritative rows live in chess_ratings. game_scores for game_id
   'chess' is always overwritten (not “keep best”) so the Games
   leaderboard can rank current Elo — wins no longer drive that board.

   Bot results: client passes the bot’s nominal Elo + outcome.
   Duel results: either participant calls apply_chess_duel_elo once the
   match is finished; elo_applied makes it idempotent.

   Safe to run twice. Apply after 0023. File was drafted as 0021 before
   LEA-61/62/64 took 0021–0023; renumbered to 0024. Live MCP already
   applied as `chess_elo_0021` (+ `chess_elo_0021_clear_win_scores`) —
   do NOT re-apply. Chess vs bots may be Premium in the client, but Elo
   submit itself is not Premium-gated so free Chess Duel can still rank.
-------------------------------------------------------------------*/

begin;

/* ============================ ratings ============================= */
create table if not exists public.chess_ratings (
  device_id  text primary key references public.gamertags(device_id) on delete cascade,
  elo        integer not null default 1000
             check (elo between 100 and 3500),
  games      integer not null default 0 check (games >= 0),
  updated_at timestamptz not null default now()
);

alter table public.chess_ratings enable row level security;
revoke all on public.chess_ratings from anon, authenticated;

alter table public.chess_duel_matches
  add column if not exists elo_applied boolean not null default false;

/* ============================ helpers ============================= */
create or replace function private.chess_elo_expected(p_me integer, p_opp integer)
returns double precision
language sql
immutable
as $$
  select 1.0 / (1.0 + power(10.0, ((p_opp::double precision - p_me::double precision) / 400.0)));
$$;

create or replace function private.chess_elo_next(
  p_me integer, p_opp integer, p_score double precision, p_k integer default 32)
returns integer
language sql
immutable
as $$
  select greatest(100, least(3500,
    round(p_me + coalesce(p_k, 32) * (p_score - private.chess_elo_expected(p_me, p_opp)))::integer
  ));
$$;

create or replace function private.chess_elo_ensure(p_device text)
returns public.chess_ratings
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.chess_ratings;
begin
  insert into public.chess_ratings (device_id, elo, games)
  values (p_device, 1000, 0)
  on conflict (device_id) do nothing;
  select * into row from public.chess_ratings where device_id = p_device;
  return row;
end;
$$;

/* Mirror current Elo onto the shared Games board (always replace). */
create or replace function private.chess_elo_mirror(p_device text, p_elo integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.game_scores (game_id, device_id, score)
  values ('chess', p_device, p_elo)
  on conflict (game_id, device_id) do update
    set score = excluded.score, updated_at = now();
end;
$$;

create or replace function private.chess_elo_gate(p_device text)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return 'signin'; end if;
  if p_device is null or char_length(p_device) not between 8 and 64 then return 'invalid'; end if;
  if not exists (select 1 from public.gamertags g where g.device_id = p_device) then
    return 'no_gamertag';
  end if;
  if exists (
       select 1
         from public.class_game_blocks b
         join public.class_members m on m.class_id = b.class_id
        where b.game_id = 'chess' and m.student_id = auth.uid()) then
    return 'blocked';
  end if;
  return null;
end;
$$;

/* ======================= catch-up submit ========================== */
/* Always-replace path for local Elo when apply_* could not run
   (offline bot games). Not Premium-gated so Chess Duel players can
   land on the shared board. Prefer apply_chess_bot_elo /
   apply_chess_duel_elo when online. */
create or replace function public.submit_chess_elo(p_device text, p_elo integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  gate text;
  row public.chess_ratings;
  neu integer;
begin
  gate := private.chess_elo_gate(p_device);
  if gate is not null then
    return jsonb_build_object('ok', false, 'error', gate);
  end if;
  if p_elo is null or p_elo not between 100 and 3500 then
    return jsonb_build_object('ok', false, 'error', 'bad_elo');
  end if;
  neu := p_elo;
  row := private.chess_elo_ensure(p_device);
  update public.chess_ratings
     set elo = neu, updated_at = now()
   where device_id = p_device;
  perform private.chess_elo_mirror(p_device, neu);
  return jsonb_build_object('ok', true, 'elo', neu, 'games', row.games);
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
begin
  if p_device is null or char_length(p_device) not between 8 and 64 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  select * into row from public.chess_ratings where device_id = p_device;
  if row is null then
    return jsonb_build_object('ok', true, 'elo', 1000, 'games', 0, 'provisional', true);
  end if;
  return jsonb_build_object('ok', true, 'elo', row.elo, 'games', row.games, 'provisional', false);
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
  row := private.chess_elo_ensure(p_device);
  new_elo := private.chess_elo_next(row.elo, p_bot_elo, score, 32);
  delta := new_elo - row.elo;

  update public.chess_ratings
     set elo = new_elo, games = games + 1, updated_at = now()
   where device_id = p_device;

  perform private.chess_elo_mirror(p_device, new_elo);

  return jsonb_build_object(
    'ok', true,
    'elo', new_elo,
    'delta', delta,
    'games', row.games + 1,
    'before', row.elo,
    'opp', p_bot_elo
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
begin
  gate := private.chess_elo_gate(p_device);
  if gate is not null then
    return jsonb_build_object('ok', false, 'error', gate);
  end if;
  if p_match is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  /* Lock the match row so simultaneous host/guest calls cannot double-apply. */
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
  me_row := private.chess_elo_ensure(p_device);
  them_row := private.chess_elo_ensure(them);

  if m.elo_applied then
    return jsonb_build_object(
      'ok', true,
      'already', true,
      'elo', me_row.elo,
      'delta', 0,
      'games', me_row.games,
      'opp_elo', them_row.elo
    );
  end if;

  /* Abandoned / cancelled-without-winner: no Elo change. */
  if m.winner_device is null and coalesce(m.end_reason, '') not in
       ('draw', 'stalemate', 'insufficient', 'repetition', 'fifty') then
    update public.chess_duel_matches set elo_applied = true where id = p_match;
    return jsonb_build_object(
      'ok', true, 'skipped', true,
      'elo', me_row.elo, 'delta', 0, 'games', me_row.games, 'opp_elo', them_row.elo
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

  update public.chess_ratings
     set elo = my_new, games = games + 1, updated_at = now()
   where device_id = p_device;
  update public.chess_ratings
     set elo = their_new, games = games + 1, updated_at = now()
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
    'opp_new', their_new
  );
end;
$$;

/* ============================== grants ============================ */
revoke all on function public.get_chess_elo(text) from public, anon, authenticated;
revoke all on function public.submit_chess_elo(text, integer) from public, anon, authenticated;
revoke all on function public.apply_chess_bot_elo(text, integer, text) from public, anon, authenticated;
revoke all on function public.apply_chess_duel_elo(text, uuid) from public, anon, authenticated;

grant execute on function public.get_chess_elo(text) to anon, authenticated;
grant execute on function public.submit_chess_elo(text, integer) to authenticated;
grant execute on function public.apply_chess_bot_elo(text, integer, text) to authenticated;
grant execute on function public.apply_chess_duel_elo(text, uuid) to authenticated;

commit;
