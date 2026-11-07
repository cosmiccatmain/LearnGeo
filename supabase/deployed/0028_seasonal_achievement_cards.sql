-- LEA-74 — Seasonal / time-limited achievement card ids.
-- Extends private.ach_card_id_ok (from 0023) so wallet share + card send
-- accept holiday/challenge awards. Client keeps flip wallet; unlocks are
-- local (state.achievements) during calendar windows.
-- MCP apply name: seasonal_achievement_cards_0028

create or replace function private.ach_card_id_ok(p text)
returns boolean
language sql
immutable
as $$
  select p in (
    'first-steps','streak-10','streak-25','perfect-test','test-5',
    'cards-100','region-master','level-10','answers-500','globetrotter',
    'new-year-atlas','heart-maps','earth-day','summer-explorer',
    'geo-awareness','winter-globe'
  );
$$;
