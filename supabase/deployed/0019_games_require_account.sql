/* ------------------------------------------------------------------
   0019: Games require a LearnGeo account (LEA-55).

   Live schema only (see README.md in this folder). Safe to run twice.
   Apply after 0014 / 0017 / 0018 (Chess Duel). Renumbered from 0018 so
   it does not collide with `0018_chess_duel.sql` (PR #83).

   MCP already applied this DDL on live LearnGeo as migration name
   `games_require_account` (Supabase MCP apply_migration) — do NOT
   re-apply blindly; the SQL is idempotent (CREATE OR REPLACE +
   revoke/grant) if a second run is needed.

   Guests may still browse the Games hub and read public leaderboards.
   Claiming a gamertag, submitting scores, and all Geo Duel PvP RPCs
   need auth.uid() — anonymous abuse of boards and matchmaking is cut off.
-------------------------------------------------------------------*/

begin;

/* ========================= claim a gamertag ======================= */
create or replace function public.claim_gamertag(p_device text, p_tag text)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return 'signin'; end if;
  if p_device is null or char_length(p_device) not between 8 and 64 then return 'invalid'; end if;
  if p_tag is null or p_tag !~ '^[A-Za-z0-9_]{3,16}$' then return 'invalid'; end if;
  if lower(p_tag) ~ '(fuck|shit|cunt|nigg|fag|rape|nazi|hitler|whore|slut|dick|cock|bitch)' then return 'rude'; end if;

  begin
    insert into public.gamertags (device_id, tag_key, gamertag)
    values (p_device, lower(p_tag), p_tag)
    on conflict (device_id) do update
      set tag_key = excluded.tag_key, gamertag = excluded.gamertag;
  exception when unique_violation then
    return 'taken';
  end;
  return 'ok';
end;
$$;

/* ============================ submit a score ====================== */
/* Same gates as 0013, plus an account is required. */
create or replace function public.submit_game_score(
  p_game text, p_device text, p_score integer, p_asc boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'signin'; end if;
  if p_game is null or p_game !~ '^[a-z0-9_]{2,24}$' then raise exception 'bad game'; end if;
  if p_score is null or p_score not between -1000000 and 100000000 then raise exception 'bad score'; end if;
  if not exists (select 1 from public.gamertags g where g.device_id = p_device) then
    raise exception 'no gamertag';
  end if;
  if exists (
       select 1
         from public.class_game_blocks b
         join public.class_members m on m.class_id = b.class_id
        where b.game_id = p_game and m.student_id = auth.uid()) then
    raise exception 'blocked';
  end if;
  if p_game = any (public.premium_game_ids())
     and not public.account_has_premium(auth.uid()) then
    raise exception 'premium';
  end if;

  insert into public.game_scores (game_id, device_id, score)
  values (p_game, p_device, p_score)
  on conflict (game_id, device_id) do update
    set score = case when coalesce(p_asc, false) then least(game_scores.score, excluded.score)
                     else greatest(game_scores.score, excluded.score) end,
        updated_at = now();
end;
$$;

/* Drop anonymous execute — authenticated keeps it. Leaderboard reads stay
   open so guests can peek from the hub without playing. */
revoke execute on function public.claim_gamertag(text, text) from anon;
revoke execute on function public.submit_game_score(text, text, integer, boolean) from anon;
grant  execute on function public.claim_gamertag(text, text) to authenticated;
grant  execute on function public.submit_game_score(text, text, integer, boolean) to authenticated;

/* ============================ Geo Duel PvP ======================== */
/* Device-scoped RPCs from 0014 were also granted to anon. Playing a
   duel needs an account; revoke anonymous execute on every PvP entry. */
revoke execute on function public.pvp_lookup_tag(text) from anon;
revoke execute on function public.pvp_send_invite(text, text) from anon;
revoke execute on function public.pvp_list_inbox(text) from anon;
revoke execute on function public.pvp_cancel_invite(text, uuid) from anon;
revoke execute on function public.pvp_respond_invite(text, uuid, boolean) from anon;
revoke execute on function public.pvp_seed_match(text, uuid, text, jsonb) from anon;
revoke execute on function public.pvp_match_state(text, uuid) from anon;
revoke execute on function public.pvp_resolve_round(text, uuid) from anon;
revoke execute on function public.pvp_submit_answer(text, uuid, integer, integer, integer) from anon;
revoke execute on function public.pvp_forfeit_match(text, uuid) from anon;

grant execute on function public.pvp_lookup_tag(text) to authenticated;
grant execute on function public.pvp_send_invite(text, text) to authenticated;
grant execute on function public.pvp_list_inbox(text) to authenticated;
grant execute on function public.pvp_cancel_invite(text, uuid) to authenticated;
grant execute on function public.pvp_respond_invite(text, uuid, boolean) to authenticated;
grant execute on function public.pvp_seed_match(text, uuid, text, jsonb) to authenticated;
grant execute on function public.pvp_match_state(text, uuid) to authenticated;
grant execute on function public.pvp_resolve_round(text, uuid) to authenticated;
grant execute on function public.pvp_submit_answer(text, uuid, integer, integer, integer) to authenticated;
grant execute on function public.pvp_forfeit_match(text, uuid) to authenticated;

commit;
