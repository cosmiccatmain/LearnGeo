/* ------------------------------------------------------------------
   0022: LEA-62 — Unlock Geo Golf and Globe Defender.

   Replaces public.premium_game_ids() from 0021. Golf (`golf`) and
   Globe Defender (`orbit`) become free. Remaining lesser-played hub
   arcade titles stay Premium-gated for score submit.

   Live schema only. Safe to run twice. Apply after 0021.
-------------------------------------------------------------------*/

begin;

create or replace function public.premium_game_ids()
returns text[]
language sql
immutable
as $$
  select array[
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
