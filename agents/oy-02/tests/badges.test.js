/* Achievement badges: earned, never bought. Not part of the site.

     node agents/oy-02/tests/badges.test.js

   Section C drives the real core.js rather than a copy of its rules, because
   "an achievement cannot grant twice" is only worth testing against the code
   that actually grants. */

const fs = require('fs');
const path = require('path');

const MINE = path.join(__dirname, '..', 'assets', 'js');
const REPO = path.join(__dirname, '..', '..', '..', 'assets', 'js');
const pick = f => fs.existsSync(path.join(MINE, f)) ? path.join(MINE, f) : path.join(REPO, f);

let pass = 0, fail = 0;
const is = (label, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { pass++; console.log('  ok   ' + label); }
  else { fail++; console.log('  FAIL ' + label + '\n         got  ' + a + '\n         want ' + b); }
};

/* load cosmetics + avatars into one window, the way the page does */
function shop() {
  const win = {};
  new Function('window', fs.readFileSync(pick('avatars.js'), 'utf8'))(win);
  new Function('window', fs.readFileSync(pick('cosmetics.js'), 'utf8'))(win);
  return win;
}

const W = shop();
const Cos = W.Cosmetics, Av = W.Avatars;
const earned = Cos.earned;
const bought = Cos.decorations.filter(d => !d.earn);

console.log('A. THE BADGE TABLE');
is('one badge per achievement', earned.length, Cos.achievements.length);
is('every achievement has exactly one badge',
  Cos.achievements.filter(a => earned.filter(b => b.earn === a.id).length === 1).length,
  Cos.achievements.length);
is('no badge points at an achievement that does not exist',
  earned.filter(b => !Cos.achievements.some(a => a.id === b.earn)).map(b => b.id), []);
is('badge ids are unique', new Set(earned.map(b => b.id)).size, earned.length);
is('and do not collide with the bought decorations',
  earned.filter(b => bought.some(d => d.id === b.id)).map(b => b.id), []);
is('no earned badge carries a price', earned.filter(b => 'price' in b).map(b => b.id), []);
is('every glyph exists in avatars.js', earned.filter(b => !Av.badges[b.badge]).map(b => b.badge), []);
is('every badge has its own glyph, none shared', new Set(earned.map(b => b.badge)).size, earned.length);
is('and none reuses a bought badge glyph',
  earned.filter(b => bought.some(d => d.badge === b.badge)).map(b => b.badge), []);
is('each glyph renders as a real svg in the colour it is given',
  earned.filter(b => {
    const out = Av.badge(b.badge, '#123456');
    return !/^<svg /.test(out) || out.indexOf('#123456') === -1 || !/<(path|circle|rect|ellipse)/.test(out);
  }).map(b => b.badge), []);
is('every badge has its own colour', new Set(earned.map(b => b.c1)).size, earned.length);
is('they join the one wearing slot rather than making a second list',
  earned.every(b => Cos.decorations.indexOf(b) !== -1), true);
is('the four bought badges are untouched',
  bought.filter(d => d.kind === 'badge').map(d => d.id + ':' + d.price),
  ['laurel:700', 'compass:700', 'sakura:900', 'crown:1400']);

console.log('\nB. THE OWNERSHIP RULE');
const badge = id => Cos.find(Cos.decorations, id);
is('not owned with no achievements at all', Cos.ownsEarned(badge('ach-streak-25'), []), false);
is('not owned when a different achievement is unlocked', Cos.ownsEarned(badge('ach-streak-25'), ['first-steps']), false);
is('owned once its own achievement is unlocked', Cos.ownsEarned(badge('ach-streak-25'), ['streak-25']), true);
is('owned among many', Cos.ownsEarned(badge('ach-globetrotter'), ['first-steps', 'globetrotter', 'test-5']), true);
is('a bought badge is never "earned"', Cos.ownsEarned(badge('crown'), ['first-steps', 'streak-25']), false);
is('a missing achievements list is not a crash', Cos.ownsEarned(badge('ach-first-steps'), undefined), false);
is('nor is a missing item', Cos.ownsEarned(null, ['first-steps']), false);
is('an unlock tells you what earned it', Cos.unlockedBy(badge('ach-streak-25')).desc, 'Hit a 25-answer streak');
is('every locked badge can say what unlocks it',
  earned.filter(b => !(Cos.unlockedBy(b) || {}).desc).map(b => b.id), []);
is('a bought badge has nothing to say', Cos.unlockedBy(badge('crown')), null);

console.log('\nB2. CLASS TAG GLYPHS (Cosmetics.tagGlyph)');
is('the picker list is exported', Array.isArray(Cos.tagGlyphs), true);
is('and is not empty', Cos.tagGlyphs.length > 0, true);
is('every name in the list is a plain string', Cos.tagGlyphs.filter(n => typeof n !== 'string'), []);
is('names are unique', new Set(Cos.tagGlyphs).size, Cos.tagGlyphs.length);
is('every listed name renders a mark', Cos.tagGlyphs.filter(n => !Cos.tagGlyph(n)), []);
is('each mark is a real svg that inherits the tag colour',
  Cos.tagGlyphs.filter(n => {
    const s = Cos.tagGlyph(n);
    return !/^<svg /.test(s) || s.indexOf('currentColor') === -1 || !/<(path|circle)/.test(s);
  }), []);
is('a name it does not know gives nothing rather than throwing', Cos.tagGlyph('banana'), null);
is('and so does every kind of rubbish',
  [null, undefined, '', 0, 42, {}, [], true, 'GLOBE', 'globe '].map(v => Cos.tagGlyph(v)).filter(v => v !== null), []);
is('an inherited property is not a glyph', Cos.tagGlyph('toString'), null);
is('achievement marks are a separate vocabulary, not reachable here',
  earned.map(b => b.badge).filter(n => Cos.tagGlyph(n) !== null), []);
is('and no tag name collides with an achievement glyph name',
  Cos.tagGlyphs.filter(n => Object.prototype.hasOwnProperty.call(Av.badges, n)), []);
is('the list and the renderer cannot drift: both come from one object',
  Cos.tagGlyphs.every(n => typeof Cos.tagGlyph(n) === 'string'), true);
is('a label can be made from the name without a second list',
  Cos.tagGlyphs.filter(n => !/^[a-z][a-z]+$/.test(n)), []);

console.log('\nC. THE REAL core.js ACHIEVEMENT PATH');
/* enough of a browser for core.js to load */
function loadCore() {
  const store = {};
  const noop = () => {};
  const made = [];
  const el = () => {
    const node = { style: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
      appendChild: noop, remove: noop, addEventListener: noop, setAttribute: noop, querySelector: () => null,
      querySelectorAll: () => [], insertBefore: noop, firstChild: null, innerHTML: '', textContent: '' };
    made.push(node);
    return node;
  };
  const win = {
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; }
    },
    document: { createElement: el, getElementById: () => null, querySelector: () => null,
      querySelectorAll: () => [], addEventListener: noop, body: el(), documentElement: el() },
    addEventListener: noop, setTimeout, clearTimeout, requestAnimationFrame: noop,
    matchMedia: () => ({ matches: false, addEventListener: noop }),
    navigator: { onLine: true }, performance: { now: () => 0 }
  };
  win.window = win;
  win.__made = made;          /* every element core.js built, so a toast can be read back */
  new Function('window', 'document', 'localStorage', 'navigator',
    fs.readFileSync(pick('data.js'), 'utf8'))(win, win.document, win.localStorage, win.navigator);
  new Function('window', fs.readFileSync(pick('avatars.js'), 'utf8'))(win);
  new Function('window', fs.readFileSync(pick('cosmetics.js'), 'utf8'))(win);
  new Function('window', 'document', 'localStorage', 'navigator',
    fs.readFileSync(pick('core.js'), 'utf8'))(win, win.document, win.localStorage, win.navigator);
  return win;
}

let core = null;
try { core = loadCore(); } catch (e) { console.log('  (core.js would not load here: ' + e.message + ')'); }

if (core && core.WW && core.WW.checkAchievements) {
  const WW = core.WW;
  const reset = () => { WW.state.achievements.length = 0; WW.state.stats.answered = 0; WW.state.economy.diamonds = 0; };

  reset();
  WW.state.stats.answered = 1;
  const first = WW.checkAchievements();
  is('answering once unlocks First Steps', first.map(a => a.id), ['first-steps']);
  is('and pays its reward once', WW.state.economy.diamonds, 25);

  const again = WW.checkAchievements();
  is('checking again unlocks nothing', again, []);
  is('and pays nothing more', WW.state.economy.diamonds, 25);
  is('it is recorded exactly once',
    WW.state.achievements.filter(id => id === 'first-steps').length, 1);

  for (let i = 0; i < 5; i++) WW.checkAchievements();
  is('five more checks still pay nothing', WW.state.economy.diamonds, 25);

  is('unlocking writes nothing into owned decorations',
    (WW.state.owned.decorations || []).filter(id => String(id).indexOf('ach-') === 0), []);

  const b = Cos.find(core.Cosmetics.decorations, 'ach-first-steps');
  is('the badge is wearable only now that it is earned',
    [core.Cosmetics.ownsEarned(b, []), core.Cosmetics.ownsEarned(b, WW.state.achievements)],
    [false, true]);

  reset();
  is('a reset clears the achievement', WW.state.achievements.length, 0);
  is('and the badge stops being wearable with it',
    core.Cosmetics.ownsEarned(b, WW.state.achievements), false);

  WW.state.streak.best = 25;
  const streaks = WW.checkAchievements().map(a => a.id).sort();
  is('a 25 streak unlocks both streak achievements at once', streaks, ['streak-10', 'streak-25']);
  is('and both badges become wearable together',
    ['ach-streak-10', 'ach-streak-25'].map(id =>
      core.Cosmetics.ownsEarned(Cos.find(core.Cosmetics.decorations, id), WW.state.achievements)),
    [true, true]);
} else {
  fail++;
  console.log('  FAIL core.js could not be exercised, so the double-unlock rule is unverified');
}

console.log('\nD. ONE UNLOCK NOTICE');
if (core && core.WW) {
  const WW = core.WW;
  is('the announcer is exported', typeof WW.announceAchievements, 'function');
  /* the announcer calls core's own toast, not the exported one, so read
     what it actually built rather than stubbing the export */
  const before = core.__made.length;
  let gems = 0;
  WW.Sound.gem = () => { gems += 1; };
  WW.announceAchievements([
    { id: 'x', name: 'First Steps', desc: 'Answer your first question', reward: 25 },
    { id: 'y', name: 'Seasoned', desc: 'Reach level 10', reward: 300 }
  ]);
  new Promise(r => setTimeout(r, 1400)).then(() => {
    const said = core.__made.slice(before)
      .map(n => String(n.innerHTML || ''))
      .filter(h => h.indexOf('Achievement:') !== -1);
    is('one notice per achievement', said.length, 2);
    is('it sounds once per unlock too', gems, 2);
    is('it says what was done, what it paid, and that a badge came with it',
      /Achievement: First Steps[\s\S]*Answer your first question[\s\S]*25 💎[\s\S]*badge unlocked/.test(said[0] || ''), true);
    is('the second one is the second achievement',
      /Seasoned/.test(said[1] || ''), true);
    is('nothing thrown on an empty list', WW.announceAchievements([]).length, 0);
    is('nor on nothing at all', WW.announceAchievements().length, 0);
    finish();
  });
} else { finish(); }

function finish() {
console.log('\nE. THE SHOP GUARDS (source checks, weaker than the above)');
const ui = fs.readFileSync(pick('ui.js'), 'utf8');
is('shopPanel decides earned ownership through the one rule', /ownsEarned\(it, W\.state\.achievements\)/.test(ui), true);
is('a locked badge never renders a price', /earned \? '' : \(it\.price \|\| 0\)/.test(ui), true);
is('clicking a locked badge does not open the buy dialog', /if \(!owned && btn\.dataset\.earn\)/.test(ui), true);
is('and buy\(\) refuses anything earnable whatever the price', /if \(item && item\.earn\) return;/.test(ui), true);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
}
