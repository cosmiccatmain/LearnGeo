/* LEA-79: What’s New Try-it deep links. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const KNOWN_TRY = new Set([
  'cooking',
  'achievements',
  'chess-pvp',
  'chess',
  'chess-boards',
  'cosmetics-games',
  'learn-filters',
  'crossing',
  'badges',
  'games',
  'leaderboards'
]);

test('updates.json entries each carry a known try action', () => {
  const data = JSON.parse(read('assets/data/updates.json'));
  assert.ok(Array.isArray(data.updates) && data.updates.length > 0);
  for (const row of data.updates) {
    assert.ok(row.id, 'update id');
    assert.ok(row.try, `${row.id} missing try`);
    assert.ok(KNOWN_TRY.has(row.try), `${row.id} unknown try: ${row.try}`);
  }
  const byId = Object.fromEntries(data.updates.map((u) => [u.id, u.try]));
  assert.equal(byId['2026-11-cooking-loader'], 'cooking');
  assert.equal(byId['2026-11-achievement-wallet'], 'achievements');
  assert.equal(byId['2026-11-geo-chess-pvp'], 'chess-pvp');
});

test('updates.js seeds try fields and wires Try it UI + runTry', () => {
  const src = read('assets/js/updates.js');
  assert.match(src, /data-lg-update-try/);
  assert.match(src, />Try it</);
  assert.match(src, /runTry:\s*runTry/);
  assert.match(src, /case 'cooking'/);
  assert.match(src, /case 'chess-pvp'/);
  assert.match(src, /case 'achievements'/);
  assert.match(src, /CookingLoader\.preview/);
  assert.match(src, /openChessPvp|open\('chess',\s*\{\s*opponent:\s*'pvp'/);
  assert.match(src, /openAchievements|go\('achievements'\)/);
  assert.match(src, /try:\s*'cooking'/);
  assert.match(src, /try:\s*'achievements'/);
  assert.match(src, /try:\s*'chess-pvp'/);
  assert.match(src, /entry\.try\s*=\s*tryAct/);
});

test('deep-link helpers exist for Try it destinations', () => {
  const games = read('assets/js/games.js');
  assert.match(games, /function open\(gameId,\s*opts\)/);
  assert.match(games, /open:\s*open/);
  assert.match(games, /openChessPvp:\s*openChessPvp/);

  const ui = read('assets/js/ui.js');
  assert.match(ui, /function openCustomization\(opts\)/);
  assert.match(ui, /opts\.tab/);
  assert.match(ui, /startTab/);

  const learn = read('assets/js/mode-learn.js');
  assert.match(learn, /openFilters:\s*openConfig/);
});
