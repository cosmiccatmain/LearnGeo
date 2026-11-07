/* ------------------------------------------------------------------
   0020: More Games cosmetics entitlement strip (LEA-59).

   Extends enforce_entitlement_flags so Free accounts cannot keep
   Premium-only Chess / Snake / Match / Maze / Duel cosmetics equipped
   in profiles.save. Keeps Geo Dash trail/jumper rules from 0016.
   Client gates still depend on the Development Premium preview switch
   (LEA-46). Safe to run twice.

   Numbering: 0019 is `0019_games_require_account` (#84). This file was
   briefly drafted as 0019_more_games_cosmetics and renamed to 0020 —
   do not apply under the old name. MCP apply_migration name:
   more_games_cosmetics (never 0019_more_games_cosmetics).
-------------------------------------------------------------------*/

begin;

create or replace function public.enforce_entitlement_flags()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  old_s jsonb;
  new_s jsonb;
  allow_write boolean;
  old_prem boolean;
  new_prem boolean;
  old_staff boolean;
  new_staff boolean;
  effect_id text;
  trail_id text;
  jumper_id text;
  board_id text;
  pieces_id text;
  snake_id text;
  match_id text;
  maze_id text;
  duel_id text;
begin
  allow_write := current_setting('app.admin_write', true) = '1';

  old_s := coalesce(old.save::jsonb, '{}'::jsonb);
  new_s := coalesce(new.save::jsonb, '{}'::jsonb);
  if jsonb_typeof(new_s) <> 'object' then
    return new;
  end if;

  old_prem  := coalesce((old_s -> 'flags' ->> 'premium') = 'true', false);
  new_prem  := coalesce((new_s -> 'flags' ->> 'premium') = 'true', false);
  old_staff := coalesce((old_s -> 'flags' ->> 'staff') = 'true', false);
  new_staff := coalesce((new_s -> 'flags' ->> 'staff') = 'true', false);

  if not allow_write then
    if jsonb_typeof(new_s -> 'flags') is distinct from 'object' then
      new_s := new_s || '{"flags":{}}'::jsonb;
    end if;
    new_s := jsonb_set(new_s, '{flags,premium}', to_jsonb(old_prem), true);
    new_s := jsonb_set(new_s, '{flags,staff}',   to_jsonb(old_staff), true);
    new_prem := old_prem;
  end if;

  /* Free accounts cannot keep a Premium-only effect equipped. The client
     catalogues Premium effects; the server only knows the effect id list
     that must never stick without Premium. */
  if not new_prem then
    effect_id := coalesce(new_s #>> '{profile,effect}', 'none');
    if effect_id in ('embers', 'gambling', 'wings', 'rain', 'bubbles') then
      new_s := jsonb_set(new_s, '{profile,effect}', '"none"', true);
    end if;

    /* Geo Dash cosmetics (LEA-54 / 0016). */
    trail_id := coalesce(new_s #>> '{profile,dashTrail}', 'dust');
    if trail_id in ('ember', 'neon', 'aurora') then
      new_s := jsonb_set(new_s, '{profile,dashTrail}', '"dust"', true);
    end if;

    jumper_id := coalesce(new_s #>> '{profile,dashJumper}', 'classic');
    if jumper_id in ('aurora', 'gilded') then
      new_s := jsonb_set(new_s, '{profile,dashJumper}', '"classic"', true);
    end if;

    /* More Games cosmetics (LEA-59). Keep in sync with cosmetics.js. */
    board_id := coalesce(new_s #>> '{profile,chessBoard}', 'classic');
    if board_id in ('aurora', 'meridian') then
      new_s := jsonb_set(new_s, '{profile,chessBoard}', '"classic"', true);
    end if;

    pieces_id := coalesce(new_s #>> '{profile,chessPieces}', 'classic');
    if pieces_id in ('neon', 'gilded') then
      new_s := jsonb_set(new_s, '{profile,chessPieces}', '"classic"', true);
    end if;

    snake_id := coalesce(new_s #>> '{profile,snakeBody}', 'meadow');
    if snake_id in ('neon', 'aurora') then
      new_s := jsonb_set(new_s, '{profile,snakeBody}', '"meadow"', true);
    end if;

    match_id := coalesce(new_s #>> '{profile,matchBack}', 'indigo');
    if match_id in ('neon', 'aurora') then
      new_s := jsonb_set(new_s, '{profile,matchBack}', '"indigo"', true);
    end if;

    maze_id := coalesce(new_s #>> '{profile,mazeRunner}', 'cyan');
    if maze_id in ('neon', 'aurora') then
      new_s := jsonb_set(new_s, '{profile,mazeRunner}', '"cyan"', true);
    end if;

    duel_id := coalesce(new_s #>> '{profile,duelAccent}', 'brand');
    if duel_id in ('neon', 'aurora') then
      new_s := jsonb_set(new_s, '{profile,duelAccent}', '"brand"', true);
    end if;
  end if;

  new.save := new_s;
  return new;
end;
$$;

drop trigger if exists profiles_enforce_entitlements on public.profiles;
create trigger profiles_enforce_entitlements
  before insert or update of save on public.profiles
  for each row execute function public.enforce_entitlement_flags();

commit;
