/* LEA-77: Geo Duel host/teacher spectate — state only, no screen mirror. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

test('spectate SQL adds list + read-only state RPCs', () => {
  const sql = read('supabase/deployed/0026_pvp_duel_spectate.sql');
  assert.match(sql, /pvp_list_class_duels/);
  assert.match(sql, /pvp_spectate_state/);
  assert.match(sql, /private\.pvp_can_spectate_match/);
  assert.match(sql, /is_class_teacher/);
  assert.match(sql, /role',\s*'spectator'/);
  assert.match(sql, /answered_host/);
  assert.match(sql, /answered_guest/);
  /* Comments may name forbidden RPCs; the function body must not call them. */
  const spectateFn = sql.slice(sql.indexOf('create or replace function public.pvp_spectate_state'));
  assert.doesNotMatch(spectateFn, /perform\s+public\.pvp_resolve_round|pvp_submit_answer|pvp_forfeit_match|pvp_seed_match/);
  assert.doesNotMatch(sql, /screen_shares|daily-share|getDisplayMedia/i);
  assert.match(sql, /grant execute on function public\.pvp_list_class_duels/);
  assert.match(sql, /grant execute on function public\.pvp_spectate_state/);
  assert.match(sql, /revoke all on function public\.pvp_list_class_duels[\s\S]*anon/);
});

test('GeoDuel exposes spectate mounts and never submits from spectate UI', () => {
  const duel = read('assets/js/game-duel.js');
  assert.match(duel, /mountSpectate/);
  assert.match(duel, /mountClassLive/);
  assert.match(duel, /listClassDuels/);
  assert.match(duel, /pvp_spectate_state/);
  assert.match(duel, /pvp_list_class_duels/);
  assert.match(duel, /Spectating/);
  assert.match(duel, /Host view/);
  assert.match(duel, /is-spectate/);
  /* Spectate path must not call player answer / forfeit RPCs. */
  const spectateBlock = duel.slice(duel.indexOf('function mountSpectate'));
  assert.doesNotMatch(spectateBlock.slice(0, spectateBlock.indexOf('function mountClassLive')),
    /pvp_submit_answer|pvp_forfeit_match|pvp_seed_match/);
  assert.doesNotMatch(duel, /getDisplayMedia|screen_shares|ScreenShare|daily-share/);
});

test('teacher workspace has Duels tab wired to class live spectate', () => {
  const teacher = read('assets/js/teacher.js');
  assert.match(teacher, /crTab\('duels'/);
  assert.match(teacher, /duelsPanel/);
  assert.match(teacher, /cr-duels/);
  assert.match(teacher, /mountClassLive/);
  assert.match(teacher, /duelSpectate/);
  assert.doesNotMatch(teacher, /ScreenShare|getDisplayMedia|screen_shares|daily-share/i);
});

test('screen share stays removed while spectate ships', () => {
  const share = read('tests/test_screen_share.js');
  assert.match(share, /screen mirroring/);
  assert.equal(fs.existsSync(path.join(root, 'assets/js/screen-share.js')), false);
});

test('What’s New mentions duel spectate without Stripe or mirroring', () => {
  const updates = read('assets/data/updates.json');
  assert.match(updates, /2026-11-duel-spectate/);
  const entry = updates.match(/"id": "2026-11-duel-spectate"[\s\S]*?\},/)[0];
  assert.match(entry, /Spectate Geo Duels/);
  assert.doesNotMatch(entry, /Stripe|screen.?mirror|Share screen/i);
});

test('deployed README documents LEA-77 spectate migration', () => {
  const readme = read('supabase/deployed/README.md');
  assert.match(readme, /0026_pvp_duel_spectate\.sql/);
  assert.match(readme, /pvp_duel_spectate_0027/);
  assert.match(readme, /Not screen mirroring/);
});
