const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');

function load() {
  const window = {
    localStorage: {
      _d: Object.create(null),
      getItem(k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
      setItem(k, v) { this._d[k] = String(v); }
    }
  };
  const WW = {
    Icons: { car: '', arrowR: '', arrowL: '', check: '', x: '', globe: '', info: '' },
    escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]); },
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
      /* Minimal stand-in — mode-roadtrip uses WW.el only for option buttons in
         the browser DOM. Pack metadata tests never call it. */
      return { className: cls || '', dataset: {}, innerHTML: '', addEventListener() {} };
    },
    $(sel) { return null; },
    $$() { return []; },
    state: { mastery: {}, streak: { current: 0 }, stats: {}, economy: {}, skills: {}, daily: {} }
  };
  window.WW = WW;

  /* Load real data + quiz + roadtrip so pack country names resolve. */
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/js/data.js'), 'utf8'), { window });
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/js/quiz.js'), 'utf8'), { window });
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/js/mode-roadtrip.js'), 'utf8'), { window });
  return window;
}

test('road-trip packs use real country names and short counts', () => {
  const { RoadTripMode, GeoData } = load();
  assert.ok(RoadTripMode.packs.length >= 6);
  const names = new Set(GeoData.countries.map(c => c.name));
  for (const pack of RoadTripMode.packs) {
    assert.ok(pack.count >= 5 && pack.count <= 12, pack.id + ' count');
    assert.equal(pack.countries.length, pack.count, pack.id + ' country list');
    for (const name of pack.countries) {
      assert.ok(names.has(name), pack.id + ' missing ' + name);
    }
    const qs = require('node:vm'); // silence unused in loop
    void qs;
  }
});

test('Quiz.generate builds a full pack for every route', () => {
  const { RoadTripMode, Quiz } = load();
  for (const pack of RoadTripMode.packs) {
    const qs = Quiz.generate({
      countries: pack.countries.slice(),
      types: pack.types.slice(),
      count: pack.count,
      typed: false
    });
    assert.equal(qs.length, pack.count, pack.id);
    for (const q of qs) {
      assert.ok(q.choices && q.choices.length >= 2, pack.id + ' choices');
      assert.ok(q.answerText, pack.id + ' answer');
    }
  }
});

test('Games tab is still registered next to Road trips in ui TAB_DEFS', () => {
  const ui = fs.readFileSync(path.join(root, 'assets/js/ui.js'), 'utf8');
  assert.match(ui, /view:\s*'roadtrip'/);
  assert.match(ui, /view:\s*'games'/);
  assert.match(ui, /label:\s*'Games'/);
  const road = ui.indexOf("view: 'roadtrip'");
  const games = ui.indexOf("view: 'games'");
  assert.ok(road !== -1 && games !== -1 && road < games);
});
