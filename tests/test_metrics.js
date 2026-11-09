/* LEA-116 / LEA-117: gated GA4, official AdSense snippet, no in-round ads. */
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

const SNIPPET = '<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6903921330074472" crossorigin="anonymous"></script>';
const PUB = 'ca-pub-6903921330074472';

test('metrics-config keeps GA4 empty and uses AJ’s AdSense publisher ID', () => {
  const src = read('assets/js/metrics-config.js');
  assert.match(src, /GA4_MEASUREMENT_ID:\s*''/);
  assert.match(src, /ADSENSE_PUBLISHER_ID:\s*'ca-pub-6903921330074472'/);
  assert.doesNotMatch(src, /GA4_MEASUREMENT_ID:\s*'G-/);
  const window = {};
  vm.runInNewContext(src, { window });
  assert.equal(window.LearnGeoMetricsConfig.GA4_MEASUREMENT_ID, '');
  assert.equal(window.LearnGeoMetricsConfig.ADSENSE_PUBLISHER_ID, PUB);
});

test('official AdSense snippet is in every public HTML head', () => {
  for (const rel of ['index.html', 'teachers.html',
    'countries/index.html', 'countries/france/index.html',
    'continents/europe/index.html']) {
    const html = read(rel);
    assert.ok(html.includes(SNIPPET), rel + ' is missing the official AdSense snippet');
    const head = html.slice(0, html.indexOf('</head>'));
    assert.ok(head.includes(SNIPPET), rel + ' must put the snippet in <head>');
    assert.ok(head.includes('metrics-config.js'), rel);
    assert.ok(head.includes('metrics.js'), rel);
  }
});

test('ads.txt matches the publisher ID', () => {
  const ads = read('ads.txt').trim();
  assert.equal(ads, 'google.com, pub-6903921330074472, DIRECT, f08c47fec0942fa0');
});

test('empty GA4 does not inject gtag; AdSense script is not double-loaded from metrics.js', () => {
  const metrics = read('assets/js/metrics.js');
  assert.match(metrics, /if \(!validGa\(gaId\) \|\| gaReady\) return;/);
  assert.match(metrics, /googletagmanager\.com\/gtag\/js/);
  assert.doesNotMatch(metrics, /pagead2\.googlesyndication\.com/);
  const sandbox = documentLike();
  vm.runInNewContext(read('assets/js/metrics-config.js'), sandbox.context);
  vm.runInNewContext(metrics, sandbox.context);
  assert.equal(sandbox.context.window.LearnGeoMetrics.hasGa(), false);
  assert.equal(sandbox.context.window.LearnGeoMetrics.hasAds(), true);
  assert.equal(sandbox.scripts.filter(s => /googletagmanager/.test(s)).length, 0);
  assert.equal(sandbox.scripts.filter(s => /pagead2/.test(s)).length, 0);
});

test('in-app page_view and cta_click go to Vercel Insights even without G-', () => {
  const metrics = read('assets/js/metrics.js');
  assert.match(metrics, /vaEvent\('page_view'/);
  assert.match(metrics, /vaEvent\('cta_click'/);
  assert.match(metrics, /__metricsWrapped/);
  assert.match(metrics, /syncGameplay/);
});

test('Games hub has an ad slot; in-round play canvas does not', () => {
  const games = read('assets/js/games.js');
  assert.match(games, /data-ad-slot="games-hub"/);
  const play = games.slice(games.indexOf('function play()'), games.indexOf('function catalogue()'));
  assert.doesNotMatch(play, /ad-slot/);
  assert.doesNotMatch(play, /adsbygoogle/);
  assert.match(play, /LearnGeoMetrics\.syncGameplay/);
});

test('landing, teachers, and app chrome expose display slots', () => {
  const index = read('index.html');
  const teachers = read('teachers.html');
  assert.match(index, /data-ad-slot="landing-hero"/);
  assert.match(index, /data-ad-slot="landing-footer"/);
  assert.match(index, /data-ad-slot="app-chrome"/);
  assert.match(teachers, /data-ad-slot="teachers-hero"/);
  assert.match(teachers, /data-ad-slot="teachers-footer"/);
  assert.doesNotMatch(teachers, /id="app-ad-chrome"/);
  assert.match(read('assets/css/ads.css'), /html\.ads-gameplay/);
  assert.match(read('assets/css/ads.css'), /#games-stage/);
  assert.match(read('assets/css/ads.css'), /\.map-pane/);
});

test('no invented GA4 IDs shipped as a live measurement ID', () => {
  const files = [
    'assets/js/metrics-config.js', 'assets/js/metrics.js',
    'index.html', 'teachers.html', 'ads.txt'
  ];
  for (const rel of files) {
    const text = read(rel);
    assert.doesNotMatch(text, /GA4_MEASUREMENT_ID:\s*'G-/, rel);
    assert.doesNotMatch(text, /gtag\/js\?id=G-/, rel);
    assert.doesNotMatch(text, /gtag\('config',\s*'G-/, rel);
  }
});

function documentLike() {
  const scripts = [];
  const document = {
    readyState: 'complete',
    documentElement: { classList: { toggle() {}, contains() { return false; } } },
    body: { className: '' },
    head: {
      appendChild(el) { if (el && el.src) scripts.push(el.src); }
    },
    createElement() { return { async: false, src: '', setAttribute() {} }; },
    addEventListener() {},
    querySelectorAll() { return []; },
    getElementById() { return null }
  };
  const window = {
    location: { pathname: '/', search: '', href: 'https://www.learngeo.app/' },
    addEventListener() {},
    va() {},
    document
  };
  window.window = window;
  return { context: { window, document }, scripts };
}
