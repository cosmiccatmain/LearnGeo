/* Node checks for LEA-119 Premium collection badge (no browser).
   Run: node tests/test_premium_badge.js */
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var assert = require('assert');

var root = path.join(__dirname, '..');
var store = {};
var toasts = [];

function freshState() {
  return {
    flags: {},
    badges: [],
    profile: { displayName: 'Tester', badgeSlots: null },
    stats: { answered: 0, correct: 0, tests: 0, arcade: 0, perfectTests: 0 },
    daily: { dayStreak: 0 },
    secrets: {}
  };
}

function load() {
  toasts.length = 0;
  var sandbox = {
    window: {},
    document: { body: { classList: { contains: function () { return false; } } } },
    localStorage: {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem: function (k, v) { store[k] = String(v); },
      removeItem: function (k) { delete store[k]; }
    },
    console: console,
    setTimeout: setTimeout,
    CustomEvent: function () {}
  };
  sandbox.window = sandbox;
  sandbox.global = sandbox;
  sandbox.WW = {
    state: freshState(),
    save: function () {},
    saveNow: function () {},
    toast: function (t, d) { toasts.push({ t: t, d: d }); },
    escapeHtml: function (s) { return String(s); },
    Icons: { trophy: '', info: '' },
    $$: function () { return []; },
    masteredCount: function () { return 0; }
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'assets/js/premium.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'assets/js/badges.js'), 'utf8'), sandbox);
  return sandbox;
}

var ctx = load();
var B = ctx.Badges;
var P = ctx.Premium;
assert(B && P, 'Badges and Premium load');

var prem = B.find('premium');
assert(prem, 'Premium badge exists');
assert.strictEqual(prem.entitlement, 'premium', 'it is an entitlement, not grant/earn');
assert.strictEqual(B.granted(prem), false, 'admin badge switch cannot grant it');
assert.strictEqual(B.entitlement(prem), true, 'entitlement() is true');
assert.strictEqual(prem.fill, true, 'uses filled brand-mark art');
assert.strictEqual(prem.art, 'mark', 'art id is mark');
assert.strictEqual(prem.tone, 'premium', 'tone is premium');
assert(!/stripe/i.test(prem.desc), 'copy does not mention Stripe');

var svg = B.svg(prem, 16);
assert(/^<svg /.test(svg), 'svg renders');
assert(/fill="currentColor"/.test(svg), 'mark is filled currentColor');
assert(!/stroke-width/.test(svg), 'mark is not a stroke glyph');
assert(/<rect /.test(svg) && /<circle /.test(svg), 'mark has square + circle');

assert.strictEqual(B.has('premium'), false, 'not held by default');
assert.strictEqual(B.grant('premium'), false, 'grant() refuses entitlements');

/* Award from flags.premium (mock subscribe / admin / Stripe later). */
ctx.WW.state.flags.premium = true;
var first = B.syncPremium({ announce: false, save: false, paint: false });
assert(first && first.id === 'premium', 'sync awards the badge');
assert.strictEqual(B.has('premium'), true, 'held after award');
assert.strictEqual(ctx.WW.state.badges.filter(function (id) { return id === 'premium'; }).length, 1,
  'awarded once');

var again = B.syncPremium({ announce: false, save: false, paint: false });
assert.strictEqual(again, null, 'second sync is idempotent');
assert.strictEqual(ctx.WW.state.badges.filter(function (id) { return id === 'premium'; }).length, 1,
  'still a single copy');

assert.strictEqual(B.shown()[0], 'premium', 'auto-shown beside the name');

var row = B.markup(null, 13);
assert(/bdg--premium/.test(row), 'name chip uses premium tone');
assert(/aria-label="Premium"/.test(row), 'name chip is labelled Premium');

/* Lapse: hide beside the name, grey in the case (not held). */
ctx.WW.state.flags.premium = false;
B.syncPremium({ announce: false, save: false, paint: false });
assert.strictEqual(B.has('premium'), false, 'dropped on lapse');
assert.strictEqual(B.shown().indexOf('premium'), -1, 'hidden beside the name');
assert.strictEqual(B.markup(null, 13), '', 'no chip while lapsed');

/* Resubscribe restores a single copy. */
ctx.WW.state.flags.premium = true;
B.syncPremium({ announce: false, save: false, paint: false });
assert.strictEqual(B.has('premium'), true, 'restored on resubscribe');

/* Premium.setLocal is the mock-subscribe path. */
ctx.WW.state.flags.premium = false;
ctx.WW.state.badges = [];
P.setLocal(true);
assert.strictEqual(!!ctx.WW.state.flags.premium, true, 'setLocal turns the flag on');
assert.strictEqual(B.has('premium'), true, 'setLocal awards the badge');
P.setLocal(true);
assert.strictEqual(ctx.WW.state.badges.filter(function (id) { return id === 'premium'; }).length, 1,
  'setLocal stays idempotent');
P.setLocal(false);
assert.strictEqual(!!ctx.WW.state.flags.premium, false, 'setLocal can lapse');
assert.strictEqual(B.has('premium'), false, 'setLocal greys/hides the badge');

/* Referral trial is Premium.active but is not a subscribe — no badge. */
ctx.WW.state.flags.premium = false;
ctx.WW.state.badges = [];
ctx.ReferralTrial = { trialActive: function () { return true; } };
assert.strictEqual(P.active(), true, 'trial counts as Premium.active');
assert.strictEqual(B.has('premium'), false, 'trial does not award the badge');
B.syncPremium({ announce: false, save: false, paint: false });
assert.strictEqual(B.has('premium'), false, 'sync still keys off flags.premium');

console.log('test_premium_badge.js: ok');
