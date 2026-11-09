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

var plus = B.find('plus');
var edu = B.find('education');
assert(plus && edu, 'Plus and Education badges exist');
assert.strictEqual(plus.entitlement, 'plus', 'Plus is an entitlement, not grant/earn');
assert.strictEqual(edu.entitlement, 'education', 'Education is an entitlement');
assert.strictEqual(B.granted(plus), false, 'admin badge switch cannot grant Plus');
assert.strictEqual(B.entitlement(plus), true, 'entitlement() is true');
assert.strictEqual(plus.fill, true, 'Plus uses filled brand-mark art');
assert.strictEqual(plus.art, 'mark', 'Plus art id is mark');
assert.strictEqual(plus.tone, 'plus', 'Plus tone is plus');
assert.strictEqual(edu.art, 'cap', 'Education art is a cap');
assert.strictEqual(edu.tone, 'education', 'Education tone is distinct');
assert.notStrictEqual(plus.tone, edu.tone, 'the two badges do not share a tone');
assert(!/stripe/i.test(plus.desc), 'copy does not mention Stripe');

var svg = B.svg(plus, 16);
assert(/^<svg /.test(svg), 'svg renders');
assert(/fill="currentColor"/.test(svg), 'mark is filled currentColor');
assert(!/stroke-width/.test(svg), 'mark is not a stroke glyph');
assert(/<rect /.test(svg) && /<circle /.test(svg), 'mark has square + circle');
var cap = B.svg(edu, 16);
assert(/<path /.test(cap) && !/<rect /.test(cap), 'Education cap is not the brand mark');

assert.strictEqual(B.has('plus'), false, 'Plus not held by default');
assert.strictEqual(B.has('education'), false, 'Education not held by default');
assert.strictEqual(B.grant('plus'), false, 'grant() refuses entitlements');

/* Award from flags.premium (mock subscribe / admin / Stripe later). */
ctx.WW.state.flags.premium = true;
var first = B.syncPremium({ announce: false, save: false, paint: false });
assert(first && first.id === 'plus', 'sync awards the Plus badge');
assert.strictEqual(B.has('plus'), true, 'held after award');
assert.strictEqual(B.has('education'), false, 'premium flag alone is not Schools');
assert.strictEqual(ctx.WW.state.badges.filter(function (id) { return id === 'plus'; }).length, 1,
  'awarded once');

var again = B.syncPremium({ announce: false, save: false, paint: false });
assert.strictEqual(again, null, 'second sync is idempotent');
assert.strictEqual(ctx.WW.state.badges.filter(function (id) { return id === 'plus'; }).length, 1,
  'still a single copy');

assert.strictEqual(B.shown()[0], 'plus', 'auto-shown beside the name');

var row = B.markup(null, 13);
assert(/bdg--plus/.test(row), 'name chip uses plus tone');
assert(/aria-label="Plus"/.test(row), 'name chip is labelled Plus');

/* Lapse: hide beside the name, grey in the case (not held). */
ctx.WW.state.flags.premium = false;
ctx.WW.state.flags.plan = 'free';
B.syncPremium({ announce: false, save: false, paint: false });
assert.strictEqual(B.has('plus'), false, 'dropped on lapse');
assert.strictEqual(B.shown().indexOf('plus'), -1, 'hidden beside the name');
assert.strictEqual(B.markup(null, 13), '', 'no chip while lapsed');

/* Resubscribe restores a single copy. */
ctx.WW.state.flags.premium = true;
B.syncPremium({ announce: false, save: false, paint: false });
assert.strictEqual(B.has('plus'), true, 'restored on resubscribe');

/* Premium.setLocal is the mock Plus subscribe path. */
ctx.WW.state.flags.premium = false;
ctx.WW.state.flags.plan = 'free';
ctx.WW.state.badges = [];
ctx.WW.state.profile.badgeSlots = null;
P.setLocal(true);
assert.strictEqual(!!ctx.WW.state.flags.premium, true, 'setLocal turns the flag on');
assert.strictEqual(P.plan(), 'plus', 'setLocal is Plus');
assert.strictEqual(B.has('plus'), true, 'setLocal awards the Plus badge');
assert.strictEqual(B.has('education'), false, 'Plus does not award Education');
P.setLocal(true);
assert.strictEqual(ctx.WW.state.badges.filter(function (id) { return id === 'plus'; }).length, 1,
  'setLocal stays idempotent');
P.setLocal(false);
assert.strictEqual(!!ctx.WW.state.flags.premium, false, 'setLocal can lapse');
assert.strictEqual(B.has('plus'), false, 'setLocal greys/hides the Plus badge');

/* Schools mock subscribe awards both badges, once. */
P.setPlan('schools', { students: 40 });
assert.strictEqual(P.plan(), 'schools', 'setPlan schools');
assert.strictEqual(P.studentCount(), 40, 'slider count is stored');
assert.strictEqual(B.has('plus'), true, 'Schools includes the Plus badge');
assert.strictEqual(B.has('education'), true, 'Schools awards Education');
P.setPlan('schools', { students: 40 });
assert.strictEqual(ctx.WW.state.badges.filter(function (id) { return id === 'education'; }).length, 1,
  'Education award is idempotent');
assert.strictEqual(ctx.WW.state.badges.filter(function (id) { return id === 'plus'; }).length, 1,
  'Plus award stays a single copy on Schools');
var both = B.markup(null, 13);
assert(/aria-label="Plus"/.test(both) && /aria-label="Education"/.test(both),
  'both badges can show beside the name');
assert(/bdg--plus/.test(both) && /bdg--education/.test(both), 'tones stay distinct in the row');

/* Free hides them again. */
P.setPlan('free');
assert.strictEqual(B.has('plus'), false, 'Free drops Plus');
assert.strictEqual(B.has('education'), false, 'Free drops Education');

/* Referral trial is Premium.active but is not a subscribe — no badge. */
ctx.WW.state.flags.premium = false;
ctx.WW.state.flags.plan = 'free';
ctx.WW.state.flags.school = false;
ctx.WW.state.badges = [];
ctx.WW.state.profile.badgeSlots = null;
ctx.ReferralTrial = { trialActive: function () { return true; } };
assert.strictEqual(P.active(), true, 'trial counts as Premium.active');
assert.strictEqual(P.plan(), 'free', 'trial is not a Plus subscribe');
assert.strictEqual(B.has('plus'), false, 'trial does not award Plus');
assert.strictEqual(B.has('education'), false, 'trial does not award Education');
B.syncPremium({ announce: false, save: false, paint: false });
assert.strictEqual(B.has('plus'), false, 'sync still keys off the plan, not the trial');

console.log('test_premium_badge.js: ok');
