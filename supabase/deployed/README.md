# The schema the app actually runs on

Two different backends are described in this repo, and only one of them
is real.

`../migrations/` describes a design that has **never been applied**:
classes keyed on `owner_id`, seats with four states, `submissions` and
`submission_answers` instead of `results`, scores derived server-side,
and three Edge Functions. It is a sketch of where the classroom could
go, not a record of where it is.

This folder is for the live project — the one whose URL is in
`assets/js/cloud.js`. There, the tables are:

| Table | Key columns |
| --- | --- |
| `profiles` | `id`, `display_name`, `role`, `save` (the whole save as jsonb) |
| `classes` | `id`, `code`, `name`, `teacher_id`, `arcade` |
| `class_members` | `class_id`, `student_id`, `display_name` |
| `assignments` | `id` (text), `class_id`, `title`, `mode`, `config` |
| `results` | `class_id`, `assignment_id`, `student_id`, `student_name`, `pct`, `missed` |
| `announcements` | `class_id`, `body`, `pinned` — added by `0001` here; `author_id`, `author_name` by `0007` (not applied yet) |
| `arcade_scores`, `admin_pins` | the arcade and the admin panel |
| `gamertags`, `game_scores`, `class_game_blocks` | game leaderboards and per-class game blocks, added by `0008`. The Games hub leaderboard UI calls `game_leaderboard` / `submit_game_score` / `claim_gamertag` from that file. If those RPCs are missing in the live project, Owen or AJ must apply `0008_game_leaderboards_and_blocks.sql` before shipping a Games leaderboard change — no newer migration is required for the polished All-games board. |
| `admin_actions` replies | `0011_admin_message_replies.sql` adds `reply_to_admin_message` (recipient → admin) and `ultra_message_thread` (admin reads the conversation). Applied on the live project 2026-11-06 (LEA-42). Without it, Send reply 404s and the inbox shows a vague server error. |
| `screen_shares` | Legacy table from `0012_screen_shares.sql`. Screen mirroring / live share was removed from the client (LEA-46); do not redeploy Daily share Edge Functions. `account_activity` remains view-name only. |
| Premium entitlements | `0013_premium_subscriptions.sql` — `flags.premium` on `profiles.save`, `ultra_set_premium`, entitlement-flag protect trigger, and Premium game check inside `submit_game_score`. Account / player level (not teacher-based). Apply after `0012`. Client gates also require the Development preview switch (LEA-46). |
| Geo Duel PvP | `0014_pvp_geo_duel.sql` — `pvp_invites` / `pvp_matches` plus RPCs for gamertag lookup, invite send/respond, match seed/answer/state. Applied on the live project for LEA-48. Device-scoped like gamertags; no direct table access. |
| GeoLive student host | `0015_geolive_student_host.sql` — class members and explorers can host/run GeoLive; `class_id` nullable for friend rounds; teacher `geolive_enabled` still gates class rooms. Applied for LEA-51 (same SQL as previously applied migration `geolive_student_host`). |
| Geo Dash cosmetics | `0016_geo_dash_cosmetics.sql` — extends `enforce_entitlement_flags` to strip Premium Geo Dash trails (`ember`, `neon`, `aurora`) and jumpers (`aurora`, `gilded`) when `flags.premium` is off. Apply after `0013` / `0015`. Client Customise → Games tab still respects the Development Premium preview switch (LEA-46). |
| Admin panel logins | `0016_admin_logins.sql` — append-only `admin_logins` (RLS, no direct grants) plus inserts inside `admin_open_session` / `admin_open_session_private`, and `ultra_admin_logins` for the Administrator Logins roster. Applied for LEA-53. Both `0016_*` files coexist by distinct filenames. |
| Admin passkeys | `0026_admin_passkeys.sql` — sets shared unlock passphrase to `adminisbetter`, prefers ultra when one code matches both scopes, `admin_passkeys` table + enroll/remove/open RPCs, and `admin_logins.method` may be `passkey`. Applied for LEA-82. |
| Geo Duel join flow | `0017_pvp_join_flow.sql` — make `pvp_list_inbox` VOLATILE (was STABLE + UPDATE → PostgREST read-only failure; inbox never loaded), plus expire stale seeding/active matches. LEA-52. Live applies: MCP `pvp_join_flow_0016` (expire helper only; name predates file renumber) and MCP `pvp_join_flow_0017_inbox_volatile` (inbox volatility + expire). Do not re-apply either. |
| Chess Duel PvP | `0018_chess_duel.sql` — `chess_duel_invites` / `chess_duel_matches` plus RPCs for gamertag invite, inbox, turn-based FEN moves, resign/draw. Applied for LEA-56 (MCP `chess_duel_0018` + `chess_duel_0018_auth_grants`; authenticated-only). Uses `private.pvp_tag` from 0014. File is 0018 after 0017 join-flow. Do not re-apply. |
| Games account gate | `0019_games_require_account.sql` — LEA-55. Guests may browse the Games hub / public leaderboards, but `claim_gamertag`, `submit_game_score`, and Geo Duel PvP RPCs require a signed-in account (anon execute revoked). Renumbered from 0018 to leave that slot for Chess Duel (`0018_chess_duel.sql`, PR #83). MCP already applied the DDL under migration name `games_require_account` — do not double-apply casually (SQL is idempotent). |
| More Games cosmetics | `0020_more_games_cosmetics.sql` — strips Premium Chess board/pieces, Snake coils, Match backs, Maze runners, and Duel accents (and keeps Dash rules). Renamed from a draft `0019_more_games_cosmetics` after #84 took `0019`. MCP apply name: `more_games_cosmetics` (do not apply as `0019_more_games_cosmetics`). Apply after `0016_geo_dash_cosmetics` / `0019_games_require_account`. |
| Premium game ids (LEA-61) | `0021_premium_game_ids.sql` — updates `premium_game_ids()` so popular Games (Dash, Chess, Duel, Snake, Match, Maze) stay free; lesser-played arcade titles (Golf, Defender, Invaders, Breakout, Typer, Crossing, Whack, Sort, Stack, Echo) require Premium for score submit. Client gates still behind Development Premium preview. |
| Unlock Golf / Defender (LEA-62) | `0022_premium_game_ids.sql` — drops `golf` and `orbit` from `premium_game_ids()` so Geo Golf and Globe Defender are free; other LEA-61 arcade gates stay. MCP apply name: `premium_game_ids_0022`. Apply after `0021`. |
| Achievement cards (LEA-64) | `0023_achievement_cards.sql` — `achievement_card_sends` plus RPCs `ach_card_send` / `ach_card_list_inbox` / `ach_card_cancel` / `ach_card_respond` for school-safe gamertag card sharing (no money; accept does not unlock diamonds). Authenticated-only. Uses `private.pvp_tag` from 0014. MCP apply name: `achievement_cards_0023`. Apply after 0014 / 0019. |
| Chess Elo (LEA-60) | `0024_chess_elo.sql` — `chess_ratings` + `get_chess_elo` / `submit_chess_elo` / `apply_chess_bot_elo` / `apply_chess_duel_elo`. Shared Elo (start 1000, K=32) for Geo Chess vs bots and in-game PvP; mirrors current Elo onto `game_scores` game_id `chess` (always replace). Renumbered from a draft `0021_chess_elo` after LEA-61/62/64 took 0021–0023. **MCP already applied as `chess_elo_0021` (+ `chess_elo_0021_clear_win_scores`) — do not re-apply.** |
| Achievement wallet share (LEA-67) | `0025_achievement_wallet_share.sql` — `achievement_wallet_shares` plus RPCs `ach_wallet_share` / `ach_wallet_list` / `ach_wallet_cancel` / `ach_wallet_respond` for school-safe gamertag wallet sharing (snapshot of unlocked cards; accept does not unlock diamonds). Authenticated-only. Uses `private.ach_card_id_ok` from 0023. MCP apply name: `achievement_wallet_share_0025`. Apply after 0023. |
| Geo Chess PvP unify (LEA-68) | No new SQL. Reuses `0018_chess_duel.sql` RPCs + `0024` Elo. Client folds the old Chess Duel hub entry into Geo Chess (“Challenge a friend”) and seeds Elo from legacy local win counts (`seed = clamp(1000 + 24·wins − 16·losses + 8·draws, 100, 2000)`). LEA-67 already owns `0025`. |
| Geo Duel host spectate (LEA-77) | `0026_pvp_duel_spectate.sql` — `pvp_list_class_duels` + `pvp_spectate_state` so a class teacher/host can watch student Geo Duels as a read-only spectator (scores/rounds/questions; no submit/forfeit; no `pvp_resolve_round` side effect). Auth via `private.is_class_teacher` + student `profiles.save.deviceId`. **Not screen mirroring.** MCP apply name: `pvp_duel_spectate_0027` (live already used a `*_0026` name for an unrelated chess ladder). Apply after 0014 / 0019 / 0025. |
| Friend inbox (LEA-80 / LEA-84) | No new SQL. Friend inbox aggregates card gifts (`0023`), wallet shares (`0025`), and Geo Chess challenges (`0018`) client-side. LEA-84 opens it from the profile menu beside Customization (modal); Achievements keeps send/share only. Accepting chess opens Geo Chess PvP via existing `chess_duel_*` RPCs. |
| Class wallet wall SQL (LEA-75; client removed LEA-89) | `0027_class_wallet_wall.sql` — `achievement_unlock_events` + `sync_achievements` / `class_wallet_wall` remain in the DB but the My class Wallet wall UI was removed (LEA-89). SQL may stay unused. MCP apply name: `class_wallet_wall_0027`. Do not re-wire the teacher tab without AJ. |
| Seasonal achievement cards (LEA-74) | `0028_seasonal_achievement_cards.sql` — extends `private.ach_card_id_ok` with six holiday/challenge award ids (`new-year-atlas`, `heart-maps`, `earth-day`, `summer-explorer`, `geo-awareness`, `winter-globe`) so card send + wallet share accept them. Client unlocks stay local during calendar windows. Live DB already applied earlier as MCP `seasonal_achievement_cards_0026` (same SQL; do not double-apply casually). File slot **0028** after 0026/0027 collisions. Apply after 0023 / 0025. |
| Classroom passcodes (LEA-81) | `0029_classroom_passcodes.sql` — `classes.classroom_pass` plus `set_classroom_pass` / `clear_classroom_pass` / `read_classroom_pass` (teachers), `classroom_pass_lookup` (anon preview), `join_class_by_pass` (authenticated redeem). Short 4-char codes for iPad Games / Geo Live join without email friction. File slot **0029** after 0026–0028. **MCP already applied as `classroom_passcodes_0026`** (idempotent). |
| Geo Chess weekly ladder (LEA-76) | `0030_chess_weekly_ladder.sql` — `chess_ratings.week_key` / `week_base` / `week_games`, rolls UTC ISO weeks inside `apply_chess_bot_elo` / `apply_chess_duel_elo`, plus `chess_weekly_ladder` and `chess_duel_last_opponent`. Client shows the ladder + Rematch inside Geo Chess PvP only (no separate Chess Duel). File slot **0030** after 0026–0029. **MCP already applied as `chess_weekly_ladder_0026` — do not re-apply.** |
| PvP lobby circles (LEA-83) | `0031_pvp_lobby_presence.sql` — `pvp_lobby_presence` + `pvp_lobby_chats` with heartbeat/list/leave and school-safe 1:1 chat RPCs for Geo Duel and Geo Chess challenge lobbies. Authenticated-only. MCP apply name: `pvp_lobby_presence_0027` (file renumbered to **0031** after 0027 class wallet wall). Apply after 0014 / 0018 / 0019. |
| Admin Accounts roster pages (LEA-103) | `0032_admin_roster_pages.sql` — raises `ultra_find_accounts` cap from 60 → 2000 so every profile is reachable (was stuck at ~5 client pages). Client pages at 25. MCP apply name: `admin_roster_pages_0032`. Apply after 0031. |
| Admin grant Journey chests (LEA-111) | `0033_journey_chest_grants.sql` — `journey_chest_grants` + `ultra_grant_journey_chests` (by account id or gamertag) + `my_journey_chest_grants` / `claim_journey_chest`. Realtime publication so the receiver’s Journey path can show gift chests instantly. MCP apply name: `journey_chest_grants_0033`. Apply after 0032. |
| Free / Plus / Schools (LEA-122) | `0034_plus_schools_plans.sql` — `premium_game_ids()` is Invaders, Breakout, Typer, Echo. Entitlement strip keeps only Plus looks (Embers, Wings, Deep Current, Ember Wake, Gilded Cube, Meridian Gold). `flags.plan` / `flags.school` / `flags.students` freeze like `flags.premium`. `ultra_set_plan` grants Free, Plus, or Schools with a seat count. MCP apply name: `plus_schools_plans_0034`. Apply after 0022 / 0020. Client gates stay behind the Development preview switch. |

Authorisation goes through two `security definer` helpers in the
`private` schema, `is_class_teacher(cid)` and `is_class_member(cid)`,
and every policy is written in terms of those rather than of
`profiles.role`.

So: apply the files in **this** folder to the live project. Applying
`../migrations/` on top of it would fail on the first reference to
`owner_id`, and anything written against those table names will not
find them.

Telling the two apart is the whole reason this folder exists. If the
live schema is ever rebuilt to match `../migrations/`, the client in
`assets/js/cloud.js` has to be rewritten in the same change, and this
folder should go away.

## Applying

```bash
supabase link --project-ref <ref>
psql "$DATABASE_URL" -f deployed/0001_announcements.sql
```

Or paste the file into the SQL editor. Every statement is written to be
safe to run twice.

Screen sharing Edge Functions (`daily-share-token`, `daily-share-stop`)
were removed in LEA-46. Do not deploy them. Historical `0012_screen_shares.sql`
may still exist on older databases; the app no longer calls those RPCs.
