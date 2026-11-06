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
