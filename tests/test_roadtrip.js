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
  /* Free vars in mode-roadtrip resolve against the sandbox root. */
  const sandbox = {
    window,
    encodeURIComponent,
    decodeURIComponent,
    escape,
    unescape,
    Buffer
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
      streak: { current: 0, best: 4 },
      stats: { answered: 12, correct: 8, tests: 1, arcade: 0, perfectTests: 0 },
      economy: { diamonds: 150, xp: 40, level: 2 },
      skills: {},
      daily: {},
      achievements: [],
      roadtrip: {
        unitId: 'africa-north', done: {}, claimed: {}, read: {},
        xpEarned: 0, gemsEarned: 0
      }
    },
    levelProgress() {
      return { have: this.state.economy.xp, need: 80 + 40 * this.state.economy.level };
    },
    masteredCount() {
      return Object.keys(this.state.mastery).filter(k => (this.state.mastery[k].box || 0) >= 4).length;
    },
    checkAchievements() { return []; },
    announceAchievements() {}
  };
  window.WW = WW;
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/js/data.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/js/cosmetics.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/js/quiz.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/js/mode-roadtrip.js'), 'utf8'), sandbox);
  return window;
}

/* Stub WorldMap.project using the same equirectangular math as worldmap.js. */
function loadWithWorldMap(mastery) {
  const window = load(mastery);
  const VB_W = 760;
  const LAT_TOP = 84;
  const LAT_BOT = -58;
  const SCALE = VB_W / 360;
  window.WorldMap = {
    project(lon, lat) {
      return { x: (lon + 180) * SCALE, y: (LAT_TOP - lat) * SCALE };
    },
    size: { w: VB_W, h: Math.round((LAT_TOP - LAT_BOT) * SCALE) }
  };
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
  assert.doesNotMatch(src, /ScreenShare|share screen|stripe\.com|Checkout Session|class.?wallet.?wall/i);
  assert.match(src, /LearnGeo/);
  assert.match(src, /no Duo owl/);
  assert.match(src, /Share road|shareUrlFor|progressSnapshot/);
  assert.match(src, /prefers-reduced-motion|reduceMotion/);
  assert.match(src, /SLIDE_MS|slideToUnit|is-enter-right/);
});

test('LEA-96 share payload round-trips and builds a /roadtrip?road= link', () => {
  const { RoadTripMode, WW } = load();
  WW.state.gamertag = 'MapKid';
  WW.state.roadtrip.done['africa-north.l1'] = 'played';
  WW.state.roadtrip.xpEarned = 40;
  WW.state.roadtrip.gemsEarned = 12;
  const snap = RoadTripMode.progressSnapshot();
  assert.equal(snap.v, 1);
  assert.equal(snap.t, 'MapKid');
  assert.equal(snap.u, 'africa-north');
  assert.ok(snap.n.includes('l1'));
  assert.equal(snap.s[0], 1);
  const enc = RoadTripMode.encodeSharePayload(snap);
  assert.ok(enc && !/[+/=]/.test(enc));
  const back = RoadTripMode.decodeSharePayload(enc);
  assert.deepEqual(back.n, snap.n);
  assert.equal(back.x, 40);
  const url = RoadTripMode.shareUrlFor(snap);
  assert.match(url, /\/roadtrip\?road=/);
  assert.equal(RoadTripMode.decodeSharePayload('%%%'), null);
  assert.equal(RoadTripMode.SLIDE_MS >= 350 && RoadTripMode.SLIDE_MS <= 500, true);
});

test('LEA-96 CSS has unit slides, share UI, and reduced-motion guards', () => {
  const css = fs.readFileSync(path.join(root, 'assets/css/roadtrip.css'), 'utf8');
  assert.match(css, /is-enter-right|is-exit-left/);
  assert.match(css, /is-q-enter-right|rt-q-stage/);
  assert.match(css, /\.rtshare\b|rtshare-view/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /rt-pulse|rt-unlock|rt-node-in/);
  /* LEA-95: level numeral is panel-scale (22px), not hero-sized. */
  assert.match(css, /\.rt-xpchart__level\s*\{[^}]*font-size:\s*22px/s);
  assert.doesNotMatch(css, /\.rt-xpchart__level\s*\{[^}]*font-size:\s*(6\d|7\d|[8-9]\d|[1-9]\d{2,})px/s);
});

test('upcoming awards prefer partial progress toward Cosmetics.achievements', () => {
  const { RoadTripMode, Cosmetics } = load();
  assert.ok(Cosmetics.achievements.length > 3);
  const first = RoadTripMode.achievementProgress(
    Cosmetics.achievements.find(a => a.id === 'first-steps'));
  assert.equal(first.pct, 1);
  const streak = RoadTripMode.achievementProgress(
    Cosmetics.achievements.find(a => a.id === 'streak-10'));
  assert.ok(streak.pct > 0 && streak.pct < 1);
  const upcoming = RoadTripMode.upcomingAwards(3);
  assert.ok(upcoming.length >= 1);
  assert.ok(upcoming.every(u => u.ach && u.progress));
  /* Closest-to-done first among locked (first-steps is complete → unlocked filter skips if in achievements; here achievements=[] so first-steps pct=1 leads). */
  assert.ok(upcoming[0].progress.pct >= upcoming[upcoming.length - 1].progress.pct);
});

test('XP/gems chart maps onto economy + roadtrip earned counters', () => {
  const src = fs.readFileSync(path.join(root, 'assets/js/mode-roadtrip.js'), 'utf8');
  assert.match(src, /levelProgress/);
  assert.match(src, /economy\.diamonds|eco\.diamonds/);
  assert.match(src, /xpEarned/);
  assert.match(src, /gemsEarned/);
  const core = fs.readFileSync(path.join(root, 'assets/js/core.js'), 'utf8');
  assert.match(core, /xpEarned:\s*0/);
  assert.match(core, /gemsEarned:\s*0/);
});

test('LEA-92 layout uses large side columns, not postage-stamp floats', () => {
  const css = fs.readFileSync(path.join(root, 'assets/css/roadtrip.css'), 'utf8');
  const js = fs.readFileSync(path.join(root, 'assets/js/mode-roadtrip.js'), 'utf8');
  assert.match(css, /grid-template-columns:\s*280px\s+480px\s+300px/);
  assert.match(css, /\.rt-xpchart__level\s*\{[^}]*font-size:\s*22px/s);
  assert.match(css, /\.rt-award__name\s*\{[^}]*font-size:\s*22px/s);
  assert.match(css, /\.rt-xpchart\s*\{[^}]*width:\s*100%/s);
  assert.match(css, /white-space:\s*nowrap/); /* trip line stays one line */
  assert.doesNotMatch(css, /\.rt-side-card\b/);
  assert.match(js, /awardsColumnHtml|rt-awards/);
  assert.match(js, /Coming up/);
});

test('Road Trip lessons include identify and mount a map host for it', () => {
  const src = fs.readFileSync(path.join(root, 'assets/js/mode-roadtrip.js'), 'utf8');
  assert.match(src, /types:\s*\[[^\]]*identify/);
  assert.match(src, /map-roadtrip/);
  assert.match(src, /function needsMap/);
  assert.match(src, /function paintMap/);
  assert.match(src, /GeoMap\.drawCountry/);
  assert.match(src, /GeoMap\.frame/);
  const css = fs.readFileSync(path.join(root, 'assets/css/roadtrip.css'), 'utf8');
  assert.match(css, /\.rt-map\b/);
  assert.match(css, /min-height:\s*200px/);
  const { Quiz, GeoData } = load();
  const africa = GeoData.countries.filter(c => c.region === 'Africa').slice(0, 8);
  const qs = Quiz.generate({
    countries: africa.map(c => c.name),
    types: ['identify'],
    count: 4,
    typed: false
  });
  assert.ok(qs.length >= 1);
  assert.ok(qs.every(q => q.type === 'identify'));
  assert.ok(qs.every(q => q.revealOnMap === true));
  assert.ok(qs.every(q => q.choices && q.choices.length === 4));
});

test('non-map Road Trip question types still generate without a map requirement', () => {
  const { Quiz, GeoData } = load();
  const names = ['Morocco', 'Algeria', 'Tunisia', 'Libya'];
  const qs = Quiz.generate({
    countries: names,
    types: ['capital', 'country', 'flag', 'flagpick'],
    count: 4,
    typed: false
  });
  assert.equal(qs.length, 4);
  assert.ok(qs.every(q => q.choices && q.choices.length === 4));
  assert.ok(qs.every(q => q.type !== 'locate'));
});

test('LEA-102 Journey globe: unit bounds + soft regions + markup hooks', () => {
  const { RoadTripMode, WorldMap, GeoData } = loadWithWorldMap();
  const unit = RoadTripMode.units[0];
  assert.ok(RoadTripMode.unitCountries(unit).includes('Morocco'));
  /* Sandbox strings are another realm — compare via JSON. */
  assert.equal(JSON.stringify(RoadTripMode.unitSoftRegions(unit)), '["Africa"]');
  assert.equal(
    JSON.stringify(RoadTripMode.unitSoftRegions(RoadTripMode.units.find(u => u.id === 'americas'))),
    '["North America","South America"]'
  );
  const bounds = RoadTripMode.unitMapBounds(unit);
  assert.ok(bounds && bounds.w > 0 && bounds.h > 0);
  assert.ok(WorldMap.project);
  const p = WorldMap.project(0, 0);
  assert.equal(typeof p.x, 'number');
  assert.equal(typeof p.y, 'number');
  /* Soft-region wash covers Africa countries that are not in the unit. */
  assert.ok(GeoData.countries.some(c => c.region === 'Africa' && c.name === 'Nigeria'));

  const src = fs.readFileSync(path.join(root, 'assets/js/mode-roadtrip.js'), 'utf8');
  assert.match(src, /rt-globe|wireGlobe|mode:\s*'journey'/);
  assert.match(src, /prefers-reduced-motion|reduceMotion/);
  assert.doesNotMatch(src, /ScreenShare|share screen/i);
  const wm = fs.readFileSync(path.join(root, 'assets/js/worldmap.js'), 'utf8');
  assert.match(wm, /mode === 'journey'/);
  assert.match(wm, /is-journey/);
  assert.match(wm, /project:/);
  const css = fs.readFileSync(path.join(root, 'assets/css/roadtrip.css'), 'utf8');
  assert.match(css, /\.rt-globe\b/);
  assert.match(css, /is-journey/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /rt-globe__stage/);
});
