/* Turnstile tokens on every Supabase auth call that GoTrue captcha-gates. */
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

const PUBLIC_SITE_KEY = '0x4AAAAAAF612GEfAQXNmqpL';
const TEST_SITE_KEY = '1x00000000000000000000BB';

function loadCloud(opts) {
  opts = opts || {};
  const calls = [];
  const doneTokens = [];
  let n = 0;
  const auth = {
    signUp(body) {
      calls.push(['signUp', body]);
      if (opts.fail === 'signUp') return Promise.resolve({ data: null, error: { message: opts.failMessage } });
      return Promise.resolve({ data: { user: { identities: [{}] }, session: { access_token: 's' } }, error: null });
    },
    signInWithPassword(body) {
      calls.push(['signIn', body]);
      if (opts.fail === 'signIn') return Promise.resolve({ data: null, error: { message: opts.failMessage } });
      return Promise.resolve({ data: { session: {} }, error: null });
    },
    signInAnonymously(body) {
      calls.push(['anon', body]);
      if (opts.fail === 'anon') return Promise.resolve({ data: { user: null, session: null }, error: { message: opts.failMessage || 'anonymous off' } });
      return Promise.resolve({ data: { user: {}, session: { access_token: 'a' } }, error: null });
    },
    resetPasswordForEmail(email, options) {
      calls.push(['reset', email, options]);
      if (opts.fail === 'reset') return Promise.resolve({ data: null, error: { message: opts.failMessage } });
      return Promise.resolve({ data: {}, error: null });
    },
    signInWithOAuth(body) {
      calls.push(['oauth', body]);
      return Promise.resolve({ data: { url: 'https://accounts.google.com' }, error: null });
    },
    updateUser(body) {
      calls.push(['update', body]);
      return Promise.resolve({ data: {}, error: null });
    },
    onAuthStateChange() {}
  };
  const window = {
    location: new URL('http://localhost:8765/learn'),
    WW: { onSave() {} },
    document: { addEventListener() {} },
    addEventListener() {},
    LearnGeoTurnstile: {
      checkout() {
        const token = 'tok-' + (++n);
        let finished = false;
        return Promise.resolve({
          token: token,
          done() {
            assert.equal(finished, false);
            finished = true;
            doneTokens.push(token);
          }
        });
      }
    },
    supabase: { createClient() { return { auth: auth }; } }
  };
  if (opts.noTurnstile) delete window.LearnGeoTurnstile;
  vm.runInNewContext(read('assets/js/cloud.js'), { window: window, Promise: Promise });
  return { Cloud: window.Cloud, calls: calls, doneTokens: doneTokens };
}

test('config uses the public site key, prefers TURNSTILE_SITE_KEY, and has no secret', () => {
  const cfg = read('assets/js/turnstile-config.js');
  const widget = read('assets/js/turnstile.js');
  assert.match(cfg, /LearnGeoTurnstileConfig/);
  assert.match(cfg, /TURNSTILE_SITE_KEY/);
  assert.match(cfg, new RegExp(PUBLIC_SITE_KEY));
  assert.match(widget, new RegExp(PUBLIC_SITE_KEY));
  const keys = (cfg + '\n' + widget).match(/0x[0-9A-Za-z]+/g) || [];
  assert.deepEqual(keys, [PUBLIC_SITE_KEY, PUBLIC_SITE_KEY]);
  assert.doesNotMatch(cfg + widget, /secret[_-]?key\s*[:=]\s*['"]0x/i);
  const html = read('index.html');
  const configAt = html.indexOf('turnstile-config.js');
  const widgetAt = html.indexOf('turnstile.js');
  const cloudAt = html.indexOf('assets/js/cloud.js');
  assert.ok(configAt > 0 && widgetAt > configAt && cloudAt > widgetAt);
  assert.match(html, /challenges\.cloudflare\.com/);
});

test('sign-up, sign-in, anonymous sign-in and password reset each send a fresh token and reset after', async () => {
  const h = loadCloud();
  await h.Cloud.signUp('a@b.co', 'secret1', 'Ada', 'student');
  await h.Cloud.signIn('a@b.co', 'secret1');
  await h.Cloud.signInAnonymously({ display_name: 'Ada', classroom_pass: true });
  await h.Cloud.resetPassword('a@b.co');

  assert.equal(h.calls[0][0], 'signUp');
  assert.equal(h.calls[0][1].options.captchaToken, 'tok-1');
  assert.equal(h.calls[0][1].options.data.display_name, 'Ada');
  assert.equal(h.calls[0][1].options.emailRedirectTo, 'http://localhost:8765/');

  assert.equal(h.calls[1][1].options.captchaToken, 'tok-2');
  assert.equal(h.calls[2][1].options.captchaToken, 'tok-3');
  assert.equal(h.calls[2][1].options.data.classroom_pass, true);
  assert.equal(h.calls[3][2].captchaToken, 'tok-4');
  assert.equal(h.calls[3][2].redirectTo, 'http://localhost:8765/');
  assert.deepEqual(h.doneTokens, ['tok-1', 'tok-2', 'tok-3', 'tok-4']);
});

test('a failed attempt still resets the token and explains a captcha rejection', async () => {
  const h = loadCloud({
    fail: 'signIn',
    failMessage: 'captcha protection: request disallowed (timeout-or-duplicate)'
  });
  const thrown = await h.Cloud.signIn('a@b.co', 'nope').then(
    function () { throw new Error('expected sign-in to fail'); },
    function (err) { return err; }
  );
  assert.equal(thrown.message, 'captcha protection: request disallowed (timeout-or-duplicate)');
  assert.deepEqual(h.doneTokens, ['tok-1']);
  assert.equal(
    h.Cloud.friendly({ message: 'captcha protection: request disallowed (timeout-or-duplicate)' }),
    'The security check expired. Try again.'
  );
  assert.equal(
    h.Cloud.friendly({ message: 'captcha protection: request disallowed (invalid-input-response)' }),
    'The security check didn’t finish. Try again.'
  );
  assert.equal(
    h.Cloud.friendly(new Error('The security check couldn’t load. Check your connection and try again.')),
    'The security check couldn’t load. Check your connection and try again.'
  );
});

test('missing widget refuses the auth call instead of sending it with no token', async () => {
  const h = loadCloud({ noTurnstile: true });
  await assert.rejects(() => h.Cloud.signUp('a@b.co', 'secret1', 'Ada', 'student'), /security check/);
  assert.equal(h.calls.length, 0);
});

test('Google sign-in and password update do not take a captcha token', async () => {
  const h = loadCloud();
  await h.Cloud.signInWithGoogle();
  await h.Cloud.updatePassword('new-secret');
  assert.equal(h.calls[0][0], 'oauth');
  assert.equal(h.calls[0][1].options.captchaToken, undefined);
  assert.equal(h.calls[1][0], 'update');
  assert.deepEqual(h.doneTokens, []);
  const cloud = read('assets/js/cloud.js');
  assert.match(cloud, /grant_type=pkce/);
  assert.match(cloud, /grant_type=refresh_token/);
});

test('classroom pass and passkey sign-in go through the captcha helper', () => {
  const pass = read('assets/js/classroom-pass.js');
  const pk = read('assets/js/passkey.js');
  assert.match(pass, /C\.signInAnonymously\(/);
  assert.match(pass, /captcha\|security check/);
  assert.doesNotMatch(pass, /client\.auth\.signInAnonymously/);
  assert.match(pk, /withCaptcha/);
  assert.match(pk, /captchaToken:\s*token/);
  assert.match(pk, /signInWithPasskey\(\{\s*options:\s*\{\s*captchaToken:\s*token\s*\}\s*\}\)/);
});

test('TURNSTILE_SITE_KEY overrides the committed public site key', async () => {
  const api = {
    ready(fn) { fn(); },
    render(el, opts) { api.opts = opts; return 'wid'; },
    reset() {},
    execute() {}
  };
  const document = {
    head: { appendChild(node) { if (node.onload) node.onload(); } },
    body: { appendChild() {} },
    createElement() { return { isConnected: true }; }
  };
  const window = {
    location: { hostname: 'www.learngeo.app' },
    document: document,
    TURNSTILE_SITE_KEY: 'injected-site-key',
    LearnGeoTurnstileConfig: { SITE_KEY: PUBLIC_SITE_KEY },
    turnstile: api,
    Promise: Promise,
    console: { warn() { window.warned = true; } }
  };
  window.window = window;
  vm.runInNewContext(read('assets/js/turnstile.js'), window);
  window.LearnGeoTurnstile.preload();
  await new Promise(function (r) { setTimeout(r, 0); });
  assert.equal(window.LearnGeoTurnstile.siteKey(), 'injected-site-key');
  assert.equal(api.opts.sitekey, 'injected-site-key');
  assert.equal(window.warned, undefined);
});

test('checkout serializes tokens and resets after done, including after a failure', async () => {
  const rendered = [];
  let executes = 0;
  const api = {
    ready(fn) { fn(); },
    render(el, opts) {
      rendered.push(opts);
      api.opts = opts;
      return 'wid';
    },
    reset() { api.resets = (api.resets || 0) + 1; },
    execute() {
      executes += 1;
      const token = 'live-' + executes;
      setTimeout(function () { api.opts.callback(token); }, 0);
    }
  };
  const document = {
    head: { appendChild(node) { if (node.onload) node.onload(); } },
    body: { appendChild() {} },
    createElement() { return { isConnected: true }; }
  };
  const window = {
    location: { hostname: 'localhost' },
    document: document,
    LearnGeoTurnstileConfig: { SITE_KEY: TEST_SITE_KEY },
    turnstile: api,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    Promise: Promise
  };
  window.window = window;
  vm.runInNewContext(read('assets/js/turnstile.js'), window);

  let releaseSecond;
  const secondStarted = new Promise(function (resolve) { releaseSecond = resolve; });
  const originalExecute = api.execute;
  api.execute = function () {
    if (executes === 0) {
      /* first call proceeds */
    } else {
      releaseSecond();
    }
    return originalExecute.apply(api, arguments);
  };

  const firstP = window.LearnGeoTurnstile.checkout();
  const secondP = window.LearnGeoTurnstile.checkout();
  const first = await firstP;
  assert.equal(first.token, 'live-1');
  let secondArrived = false;
  secondP.then(function () { secondArrived = true; });
  await new Promise(function (r) { setTimeout(r, 20); });
  assert.equal(secondArrived, false, 'second checkout waits until the first token is released');
  first.done();
  const second = await secondP;
  assert.equal(second.token, 'live-2');
  await secondStarted;
  second.done();
  assert.ok(api.resets >= 2);
  assert.equal(rendered[0].sitekey, TEST_SITE_KEY);
  assert.equal(rendered[0].execution, 'execute');
  assert.equal(rendered[0].appearance, 'interaction-only');

  api.execute = function () {
    setTimeout(function () { api.opts['error-callback'](); }, 0);
  };
  await assert.rejects(() => window.LearnGeoTurnstile.checkout(), /security check didn’t finish/);

  api.execute = function () {
    executes += 1;
    setTimeout(function () { api.opts.callback('live-after-error'); }, 0);
  };
  const third = await window.LearnGeoTurnstile.checkout();
  assert.equal(third.token, 'live-after-error');
  third.done();
});
