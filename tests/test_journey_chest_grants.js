/* LEA-111: admin-granted Journey chests (SQL + admin UI + live path). */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function loadRoadtrip() {
  const window = {
    localStorage: {
      _d: Object.create(null),
      getItem(k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
      setItem(k, v) { this._d[k] = String(v); }
    },
    confirm: () => true,
    btoa: (s) => Buffer.from(String(s), 'binary').toString('base64'),
    atob: (s) => Buffer.from(String(s), 'base64').toString('binary'),
    encodeURIComponent,
    decodeURIComponent,
    escape,
    unescape,
    location: { origin: 'https://www.learngeo.app', search: '', pathname: '/roadtrip', hash: '' },
    matchMedia: () => ({ matches: false })
  };
  const sandbox = { window, encodeURIComponent, decodeURIComponent, escape, unescape, Buffer };
  const WW = {
    Icons: {
      car: '', arrowR: '', arrowL: '', check: '', x: '', globe: '', info: '',
      book: '', lock: '', star: '', chest: '', trophy: '', gem: '', layers: '', grid: ''
    },
    escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      })[c]);
    },
    toast() {},
    gem(n) { return '+' + n; },
    award() { return { xp: 10, gems: 4, mult: 1 }; },
    save() {},
    shuffle(a) { return a.slice(); },
    sample(a, n) { return a.slice(0, n); },
    pick(a) { return a[0]; },
    tight(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); },
    matches(a, b) { return WW.tight(a) === WW.tight(b); },
    el(tag, cls) {
      return {
        className: cls || '', dataset: {}, innerHTML: '',
        style: { setProperty() {} },
        setAttribute() {}, getAttribute() { return null; },
        querySelector() { return null; },
        addEventListener() {}, appendChild() {}
      };
    },
    $() { return null; },
    $$() { return []; },
    xpToNext(level) { return 80 + 40 * level; },
    Sound: { gem() {}, flip() {}, levelUp() {}, correct() {}, wrong() {} },
    confetti() {},
    state: {
      mastery: {},
      streak: { current: 0, best: 0 },
      stats: { answered: 0, correct: 0, tests: 0, arcade: 0, perfectTests: 0 },
      economy: { diamonds: 100, xp: 0, level: 1 },
      skills: {},
      owned: { nameplates: [], banners: [], decorations: [], effects: [] },
      roadtrip: {
        unitId: 'africa-north', done: {}, claimed: {}, read: {},
        xpEarned: 0, gemsEarned: 0
      },
      settings: { effects: true },
      gamertag: '',
      deviceId: ''
    }
  };
  window.WW = WW;
  sandbox.WW = WW;
  vm.createContext(sandbox);
  vm.runInContext(read('assets/js/mode-roadtrip.js'), sandbox);
  return { RoadTripMode: sandbox.window.RoadTripMode, WW };
}

test('deployed 0033 defines grant / list / claim Journey chest RPCs', () => {
  const sql = read('supabase/deployed/0033_journey_chest_grants.sql');
  assert.match(sql, /journey_chest_grants/);
  assert.match(sql, /ultra_grant_journey_chests/);
  assert.match(sql, /my_journey_chest_grants/);
  assert.match(sql, /claim_journey_chest/);
  assert.match(sql, /profile_id_for_gamertag/);
  assert.match(sql, /supabase_realtime/);
  assert.match(sql, /journey_chest_grants_select_own/);
  assert.match(sql, /admin_scope_of/);
  assert.match(sql, /p_tag/);
  assert.doesNotMatch(sql, /screen_shares|daily-share/i);
});

test('AdminOps + UltraAdmin expose Journey chest grants', () => {
  const ops = read('assets/js/admin-ops.js');
  assert.match(ops, /grantJourneyChests/);
  assert.match(ops, /ultra_grant_journey_chests/);
  const admin = read('assets/js/administrator.js');
  assert.match(admin, /grantJourneyChests|grantchest/);
  assert.match(admin, /Grant Journey chests|Journey chests/);
  assert.match(admin, /chesttag|ap-chest-tag/);
  assert.match(admin, /journey_chest/);
  assert.doesNotMatch(admin, /Screen monitoring|Live shares|screenShares/);
});

test('LEA-111 gift chests inject onto the path without locking lessons', () => {
  const src = read('assets/js/mode-roadtrip.js');
  assert.match(src, /applyPendingGrants|startGrantWatch|my_journey_chest_grants/);
  assert.match(src, /claim_journey_chest|Gift Journey chest|is-gift/);
  assert.match(src, /GRANT_POLL_MS|postgres_changes/);
  assert.match(src, /CHEST_RARITY_TAPS|Tap to push rarity higher/);

  const { RoadTripMode } = loadRoadtrip();
  RoadTripMode.applyPendingGrants([
    { id: '11111111-1111-1111-1111-111111111111', unit_id: null },
    { id: '22222222-2222-2222-2222-222222222222', unit_id: 'africa-west' }
  ], { silent: true });

  const north = RoadTripMode.buildPath(RoadTripMode.units[0]);
  const gifts = north.filter(n => n.granted);
  assert.equal(gifts.length, 1);
  assert.equal(gifts[0].id, 'grant-11111111-1111-1111-1111-111111111111');
  assert.equal(gifts[0].state, 'current');
  /* Unit lessons still progress — gift chests do not lock the gate. */
  const firstLesson = north.find(n => n.kind === 'lesson');
  assert.ok(firstLesson);
  assert.notEqual(firstLesson.state, 'locked');

  const west = RoadTripMode.buildPath(RoadTripMode.units[1]);
  assert.equal(west.filter(n => n.granted).length, 2);

  const css = read('assets/css/roadtrip.css');
  assert.match(css, /\.rtnode--chest\.is-gift/);
});

test('deployed README documents 0033 / LEA-111', () => {
  const readme = read('supabase/deployed/README.md');
  assert.match(readme, /0033_journey_chest_grants/);
  assert.match(readme, /LEA-111/);
});
