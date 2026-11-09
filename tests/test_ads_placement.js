/* LEA-118: explicit AdSense slots, Premium skip, 100M gem one-play skip. */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');
const { test } = require('node:test');

const root = path.join(__dirname, '..');
function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const ALLOWED = [
  'landing-footer',
  'teachers-footer',
  'home-footer',
  'games-hub-a',
  'games-hub-b',
  'games-hub-c',
  'pregame'
];

test('site-wide explicit slots stay inside the 15–20 cap and the allowed list', () => {
  const files = [
    'index.html', 'teachers.html',
    'assets/js/ads.js', 'assets/js/games.js', 'assets/js/portal.js', 'assets/js/metrics.js'
  ];
  const found = new Set();
  const re = /data-ad-slot="([a-z0-9-]+)"/g;
  for (const rel of files) {
    const text = read(rel);
    let m;
    while ((m = re.exec(text))) found.add(m[1]);
  }
  const ads = read('assets/js/ads.js');
  assert.match(ads, /home-footer/);
  assert.match(ads, /games-hub-a/);
  assert.match(ads, /games-hub-b/);
  assert.match(ads, /games-hub-c/);
  assert.match(ads, /pregame/);
  found.add('home-footer');
  found.add('games-hub-a');
  found.add('games-hub-b');
  found.add('games-hub-c');
  found.add('pregame');
  for (const id of found) {
    assert.ok(ALLOWED.includes(id), 'unexpected slot ' + id);
  }
  assert.ok(found.size <= 20, 'too many named slots: ' + found.size);
  assert.ok(found.size >= 5, 'expected the AJ surfaces');
});

test('SEO country/continent pages keep the head snippet and drop body units', () => {
  for (const rel of [
    'countries/index.html', 'countries/france/index.html', 'continents/europe/index.html'
  ]) {
    const html = read(rel);
    assert.match(html, /pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js\?client=ca-pub-6903921330074472/);
    assert.doesNotMatch(html, /data-ad-slot="seo"/);
    assert.doesNotMatch(html, /<aside class="ad-slot/);
  }
  const builder = read('tools/build_seo.py');
  assert.doesNotMatch(builder, /data-ad-slot="seo"/);
});

test('home footer and sparse hub wiring exist; chrome is gone', () => {
  const portal = read('assets/js/portal.js');
  const games = read('assets/js/games.js');
  const index = read('index.html');
  assert.match(portal, /homeFooterHtml/);
  assert.match(games, /hubSlotAfter\(i \+ 1\)/);
  assert.match(games, /HUB_AFTER|hubSlotAfter/);
  assert.doesNotMatch(index, /app-ad-chrome/);
  assert.doesNotMatch(games, /GAMES\.map\(card\)\.join/);
});

test('Auto ads / page-level ads are turned off in code', () => {
  const ads = read('assets/js/ads.js');
  const metrics = read('assets/js/metrics.js');
  const css = read('assets/css/ads.css');
  assert.match(ads, /enable_page_level_ads:\s*false/);
  assert.match(metrics, /enable_page_level_ads:\s*false/);
  assert.match(css, /google-auto-placed/);
  assert.match(css, /adsbygoogle-noablate/);
  assert.match(css, /html\.ads-explicit/);
  assert.match(css, /html\.ads-off/);
});

test('Premium flag skips ads even when the paywall preview is off', () => {
  const ctx = sandbox();
  vm.runInNewContext(read('assets/js/metrics-config.js'), ctx);
  vm.runInNewContext(read('assets/js/ads.js'), ctx);
  assert.equal(ctx.window.LearnGeoAds.shouldShowAds(), true);
  ctx.window.WW.state.flags = { premium: true };
  ctx.window.Premium.active = function () { return false; };
  assert.equal(ctx.window.LearnGeoAds.shouldShowAds(), false);
  ctx.window.WW.state.flags.premium = false;
  ctx.window.Premium.active = function () { return true; };
  assert.equal(ctx.window.LearnGeoAds.shouldShowAds(), false);
  assert.equal(ctx.window.LearnGeoAds.homeFooterHtml(), '');
  assert.equal(ctx.window.LearnGeoAds.hubSlotAfter(5), '');
});

test('100,000,000 gems skip uses economy.diamonds and fails clearly when broke', () => {
  const ctx = sandbox();
  ctx.window.WW.state.economy.diamonds = 50;
  vm.runInNewContext(read('assets/js/metrics-config.js'), ctx);
  vm.runInNewContext(read('assets/js/ads.js'), ctx);
  const Ads = ctx.window.LearnGeoAds;
  assert.equal(Ads.GEM_SKIP, 100000000);
  const fail = Ads.buySkip();
  assert.equal(fail.ok, false);
  assert.equal(fail.error, 'cant_afford');
  assert.equal(ctx.window.WW.state.economy.diamonds, 50);
  assert.equal(ctx.toasts.length, 1);
  assert.match(ctx.toasts[0].title, /Not enough gems/);
  assert.match(ctx.toasts[0].body, /100,000,000/);

  ctx.window.WW.state.economy.diamonds = 100000000;
  ctx.toasts.length = 0;
  const ok = Ads.buySkip();
  assert.equal(ok.ok, true);
  assert.equal(ctx.window.WW.state.economy.diamonds, 0);
  assert.equal(Ads.shouldShowAds(), false);
  Ads.notePlayStarted();
  assert.equal(Ads.shouldShowAds(), true);
});

test('pregame overlay waits 20s unless the unit ends sooner; Play starts the game', () => {
  const ctx = sandbox();
  vm.runInNewContext(read('assets/js/metrics-config.js'), ctx);
  vm.runInNewContext(read('assets/js/ads.js'), ctx);
  const Ads = ctx.window.LearnGeoAds;
  Ads._setWaitMs(20);
  let played = 0;
  Ads.showPregame({ title: 'Geo Dash', onPlay: function () { played += 1; } });
  const overlay = ctx.document.body.children[0];
  assert.ok(overlay);
  assert.match(overlay.innerHTML, /data-ad-slot="pregame"/);
  assert.match(overlay.innerHTML, /Before you play Geo Dash/);
  const playBtn = overlay.querySelector('[data-ad-play]');
  assert.equal(playBtn.disabled, true);
  Ads.notifyAdEnded();
  assert.equal(playBtn.disabled, false);
  playBtn.click();
  assert.equal(played, 1);
  assert.equal(ctx.document.body.children.length, 0);
});

test('original fonts, Games nav, no screen mirroring, Stripe mock untouched', () => {
  const css = read('assets/css/ads.css');
  const ui = read('assets/js/ui.js');
  const sub = read('assets/js/subscription-dev.js');
  const ads = read('assets/js/ads.js');
  assert.match(css, /font-family:\s*Inter/);
  assert.doesNotMatch(css, /Syne|Plus Jakarta/);
  assert.doesNotMatch(ads, /Syne|Plus Jakarta/);
  assert.match(ui, /view: 'games'[\s\S]{0,40}label: 'Games'/);
  assert.doesNotMatch(read('index.html'), /id="share-screen"/);
  assert.match(sub, /mock checkout/i);
  assert.match(sub, /Stripe is not connected/);
});

function sandbox() {
  const toasts = [];
  const children = [];
  function el(tag) {
    const attrs = {};
    const node = {
      tagName: String(tag || 'div').toUpperCase(),
      className: '',
      innerHTML: '',
      disabled: false,
      parentNode: null,
      children,
      style: {},
      listeners: {},
      setAttribute(k, v) { attrs[k] = String(v); },
      getAttribute(k) { return attrs[k] == null ? null : attrs[k]; },
      addEventListener(type, fn) {
        node.listeners[type] = node.listeners[type] || [];
        node.listeners[type].push(fn);
      },
      closest() { return null; },
      click() {
        (node.listeners.click || []).forEach(function (fn) { fn(); });
      },
      querySelector(sel) {
        if (sel === '[data-ad-play]') return node._play;
        if (sel === '[data-ad-count]') return node._count;
        if (sel === '[data-ad-gem]') return node._gem;
        if (sel === '[data-ad-back]') return node._back;
        if (sel === 'ins.adsbygoogle') return node._ins;
        return null;
      },
      querySelectorAll(sel) {
        if (sel === 'ins.adsbygoogle') return node._ins ? [node._ins] : [];
        return [];
      }
    };
    return node;
  }
  const body = {
    children,
    appendChild(n) { n.parentNode = body; children.push(n); materialize(n); },
    querySelector() { return children[0] || null; },
    querySelectorAll(sel) {
      if (sel === 'ins.adsbygoogle') {
        return children.reduce(function (acc, n) {
          return acc.concat(n.querySelectorAll(sel));
        }, []);
      }
      return [];
    }
  };
  function materialize(overlay) {
    overlay._play = el('button');
    overlay._play.disabled = true;
    overlay._count = el('span');
    overlay._count.textContent = '20';
    overlay._gem = el('button');
    overlay._back = el('button');
    overlay._ins = el('ins');
    overlay.querySelectorAll = function (sel) {
      if (sel === 'ins.adsbygoogle') return overlay._ins ? [overlay._ins] : [];
      return [];
    };
    const origRemove = {
      removeChild(n) {
        const i = children.indexOf(n);
        if (i >= 0) children.splice(i, 1);
      }
    };
    overlay.parentNode = Object.assign(body, origRemove);
  }
  const document = {
    readyState: 'complete',
    documentElement: { classList: { toggle() {}, add() {}, contains() { return false; } } },
    body,
    createElement: el,
    addEventListener() {},
    querySelectorAll() { return []; },
    getElementById() { return null }
  };
  const economy = { diamonds: 0 };
  const window = {
    location: { pathname: '/', search: '', href: 'https://www.learngeo.app/' },
    addEventListener() {},
    document,
    Premium: { active: function () { return false; } },
    WW: {
      state: { economy: economy },
      spend: function (n) {
        if (economy.diamonds < n) return false;
        economy.diamonds -= n;
        return true;
      },
      toast: function (title, body) { toasts.push({ title: title, body: body }); },
      Icons: { gem: '' },
      escapeHtml: function (s) { return String(s); }
    },
    UI: { refreshHud: function () {} }
  };
  window.window = window;
  return {
    window: window,
    document: document,
    toasts: toasts,
    setInterval: function () { return 1; },
    clearInterval: function () {},
    setTimeout: function () { return 1; },
    clearTimeout: function () {},
    Date: Date,
    Math: Math,
    Number: Number,
    String: String
  };
}
