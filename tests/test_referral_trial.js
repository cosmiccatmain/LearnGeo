/* Node smoke checks for LEA-49 referral → 3-day all-games trial (TEST). */
'use strict';
var fs = require('fs');
var path = require('path');
var assert = require('assert');
var vm = require('vm');

var root = path.join(__dirname, '..');
var src = fs.readFileSync(path.join(root, 'assets/js/referral-trial.js'), 'utf8');
var prem = fs.readFileSync(path.join(root, 'assets/js/premium.js'), 'utf8');
var admin = fs.readFileSync(path.join(root, 'assets/js/administrator.js'), 'utf8');
var index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
var main = fs.readFileSync(path.join(root, 'assets/js/main.js'), 'utf8');
var cloud = fs.readFileSync(path.join(root, 'assets/js/cloud.js'), 'utf8');

assert(/referral-trial\.js/.test(index), 'index.html loads referral-trial.js');
assert(/ReferralTrial\.init/.test(main), 'main.js initializes ReferralTrial');
assert(/creditPendingForNewUser/.test(cloud), 'cloud.js credits referral on adopt');
assert(/learngeo\.dev\.referralTrial/.test(src), 'feature key is stable');
assert(/NEEDED\s*=\s*5/.test(src) || /needed:\s*NEEDED/.test(src), 'needs 5 signups');
assert(/3\s*\*\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/.test(src), 'trial length is 3 days');
assert(/reftrial/.test(admin), 'Development panel wires referral toggle');
assert(/Referral → 3-day all-games trial|referral TEST/i.test(admin),
  'Development panel labels referral trial');
assert(/Simulate invited signup/.test(admin), 'Development can simulate invitees');
assert(/Turn referral TEST/.test(admin), 'toggle copy mentions TEST');
assert(/not in the real public UI|Not shown in real public UI/i.test(admin),
  'copy says not public UI yet');
assert(/trialActive/.test(prem) && /ReferralTrial/.test(prem),
  'premium.js treats active referral trial as Premium');
assert(!/Brainrot/i.test(src), 'no Brainrot in referral module');
assert(!/screen.?share|mirroring/i.test(src), 'no mirroring in referral module');

/* Lightweight runtime: toggle off → no grant; five credits → trial. */
var store = {};
var sandbox = {
  window: {},
  localStorage: {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem: function (k, v) { store[k] = String(v); },
    removeItem: function (k) { delete store[k]; }
  },
  sessionStorage: {
    _s: {},
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(this._s, k) ? this._s[k] : null; },
    setItem: function (k, v) { this._s[k] = String(v); },
    removeItem: function (k) { delete this._s[k]; }
  },
  Date: Date,
  Math: Math,
  URLSearchParams: URLSearchParams,
  CustomEvent: function () {},
  console: console
};
sandbox.window = sandbox;
sandbox.global = sandbox;
sandbox.WW = {
  state: { flags: {}, profile: { displayName: 'Tester' } },
  accountId: function () { return '11111111-2222-3333-4444-555555555555'; },
  saveNow: function () {},
  toast: function () {},
  Icons: {}
};
sandbox.Cloud = { user: { id: '11111111-2222-3333-4444-555555555555' }, signedIn: true };
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
var RT = sandbox.ReferralTrial;
assert(RT, 'ReferralTrial exports');
assert.strictEqual(RT.previewEnabled(), false, 'default off');
assert.strictEqual(RT.simulateSignup().reason, 'off', 'no simulate while off');
assert.strictEqual(RT.creditSignup('abcd1234', 'u1').reason, 'off', 'no credit while off');

RT.setPreviewEnabled(true);
assert.strictEqual(RT.previewEnabled(), true, 'toggle on');
var code = RT.inviteCode();
assert(code && code.length >= 4, 'invite code minted');
for (var i = 0; i < 4; i++) {
  var r = RT.simulateSignup();
  assert(r.ok, 'simulate ' + (i + 1));
}
assert.strictEqual(RT.progress().count, 4, 'four credits before grant');
assert.strictEqual(RT.trialActive(), false, 'no trial before 5');
var fifth = RT.simulateSignup();
assert(fifth.ok && fifth.count === 5, 'fifth credit');
assert.strictEqual(RT.trialActive(), true, 'trial active after 5');
assert(sandbox.WW.state.flags.trialUntil, 'trialUntil written');
assert(Date.parse(sandbox.WW.state.flags.trialUntil) > Date.now(), 'trialUntil in future');

RT.setPreviewEnabled(false);
assert.strictEqual(RT.trialActive(), false, 'trial inactive when toggle off');
assert.strictEqual(RT.simulateSignup().reason, 'off', 'no grants surfaces while off');

console.log('test_referral_trial.js: ok');
