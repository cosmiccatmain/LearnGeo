const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');

function load(mastery) {
  const window = {
    localStorage: {
      _d: Object.create(null),
      getItem(k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
      setItem(k, v) { this._d[k] = String(v); }
    },
    confirm: () => true
  };
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
    el() { return { className: '', dataset: {}, innerHTML: '', addEventListener() {} }; },
    $() { return null; },
    $$() { return []; },
    state: {
      mastery: mastery || {},
      streak: { current: 0 },
      stats: {},
      economy: { diamonds: 150, xp: 0, level: 1 },
      skills: {},
      daily: {},
      roadtrip: { unitId: 'africa-north', done: {}, claimed: {}, read: {} }
    }
  };
  window.WW = WW;
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/js/data.js'), 'utf8'), { window });
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/js/quiz.js'), 'utf8'), { window });
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/js/mode-roadtrip.js'), 'utf8'), { window });
  return window;
}

test('units start in Africa and cover a zig-zag path shape', () => {
  const { RoadTripMode, GeoData } = load();
  assert.ok(RoadTripMode.units.length >= 5);
  assert.equal(RoadTripMode.units[0].region, 'Africa');
  assert.equal(RoadTripMode.units[0].id, 'africa-north');
  const names = new Set(GeoData.countries.map(c => c.name));
  for (const u of RoadTripMode.units) {
    assert.ok(u.lessons.length >= 3, u.id);
    assert.ok(u.story && u.story.title, u.id + ' story');
    for (const les of u.lessons) {
      assert.ok(les.countries.length >= 2, u.id + '.' + les.id);
      for (const name of les.countries) assert.ok(names.has(name), name);
    }
    const path = RoadTripMode.buildPath(u);
    const kinds = path.map(n => n.kind);
    assert.ok(kinds.includes('lesson'));
    assert.ok(kinds.includes('chest'));
    assert.ok(kinds.includes('story'));
    assert.ok(kinds.includes('trophy'));
    assert.equal(path[0].kind, 'lesson');
    assert.equal(path[path.length - 1].kind, 'trophy');
  }
});

test('prior mastery seeds lessons without wiping other progress', () => {
  const mastery = {
    Morocco: { c: 3, w: 0, box: 3 },
    Algeria: { c: 2, w: 0, box: 2 },
    Tunisia: { c: 2, w: 0, box: 2 },
    Libya: { c: 1, w: 0, box: 2 }
  };
  const { RoadTripMode, WW } = load(mastery);
  const unit = RoadTripMode.units[0];
  assert.equal(RoadTripMode.seedLessonDone(unit.lessons[0].countries), true);
  RoadTripMode.seedFromMastery(unit);
  assert.equal(WW.state.roadtrip.done['africa-north.l1'], 'seeded');
  /* Playing progress is preserved if already set. */
  WW.state.roadtrip.done['africa-north.l2'] = 'played';
  RoadTripMode.seedFromMastery(unit);
  assert.equal(WW.state.roadtrip.done['africa-north.l2'], 'played');
  const path = RoadTripMode.buildPath(unit);
  assert.equal(path[0].state, 'done');
  assert.equal(path[1].state, 'done');
  const current = path.find(n => n.state === 'current');
  assert.ok(current, 'expected a current node after seeded lessons');
  assert.ok(current.kind === 'chest' || current.kind === 'lesson');
});

test('Games tab still sits after Road trips in ui TAB_DEFS', () => {
  const ui = fs.readFileSync(path.join(root, 'assets/js/ui.js'), 'utf8');
  assert.match(ui, /view:\s*'roadtrip'/);
  assert.match(ui, /label:\s*'Games'/);
  const road = ui.indexOf("view: 'roadtrip'");
  const games = ui.indexOf("view: 'games'");
  assert.ok(road !== -1 && games !== -1 && road < games);
});

test('no Stripe checkout or screen-share hooks in roadtrip mode', () => {
  const src = fs.readFileSync(path.join(root, 'assets/js/mode-roadtrip.js'), 'utf8');
  assert.doesNotMatch(src, /ScreenShare|share screen|stripe\.com|Checkout Session/i);
  assert.match(src, /LearnGeo/);
  assert.match(src, /no Duo owl/);
});
