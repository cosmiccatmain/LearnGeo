/* ------------------------------------------------------------------
   0021: LEA-61 — Premium game id list (popular titles stay free).

   Replaces public.premium_game_ids() from 0013. Geo Dash, Geo Chess,
   Geo Duel, Chess Duel, Capital Snake, Flag Match, and Capital Maze
   stay free. Gate lesser-played hub arcade titles instead.

   Live schema only. Safe to run twice. Apply after 0020.
-------------------------------------------------------------------*/

begin;

create or replace function public.premium_game_ids()
returns text[]
language sql
immutable
as $$
  select array[
    'golf',
    'orbit',
    'invaders',
    'breakout',
    'typer',
    'crossing',
    'whack',
    'sort',
    'stack',
    'echo'
  ]::text[];
$$;

commit;
