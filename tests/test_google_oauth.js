/* LEA-113: Google OAuth wiring — button, signInWithOAuth, same session path. */
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

test('Cloud.signInWithGoogle calls signInWithOAuth(google) with site-root redirectTo', () => {
  const cloud = read('assets/js/cloud.js');
  assert.match(cloud, /signInWithGoogle\s*:\s*signInWithGoogle/);
  assert.match(cloud, /signInWithOAuth\s*\(/);
  assert.match(cloud, /provider:\s*['"]google['"]/);
  assert.match(cloud, /redirectTo:\s*redirectUrl\(\)/);
  assert.match(cloud, /detectSessionInUrl:\s*true/);
  assert.match(cloud, /onAuthStateChange/);

  const calls = [];
  const window = {
    location: new URL('https://www.learngeo.app/games'),
    WW: { onSave() {} },
    document: { addEventListener() {} },
    addEventListener() {},
    supabase: {
      createClient() {
        return {
          auth: {
            signInWithOAuth(opts) {
              calls.push(opts);
              return Promise.resolve({ data: { url: 'https://accounts.google.com' }, error: null });
            },
            onAuthStateChange() {},
            signInWithPassword() { return Promise.resolve({ data: {}, error: null }); }
          },
          from() {
            return {
              upsert() { return this; },
              select() { return this; },
              eq() { return this; },
              maybeSingle() { return Promise.resolve({ data: null, error: null }); },
              single() { return Promise.resolve({ data: {}, error: null }); }
            };
          }
        };
      }
    }
  };
  vm.runInNewContext(cloud, { window });
  assert.equal(window.Cloud.emailRedirect(), 'https://www.learngeo.app/');
  return window.Cloud.signInWithGoogle().then(function () {
    assert.equal(calls.length, 1);
    assert.equal(calls[0].provider, 'google');
    assert.equal(calls[0].options.redirectTo, 'https://www.learngeo.app/');
  });
});

test('local OAuth redirectTo is the localhost root', () => {
  const cloud = read('assets/js/cloud.js');
  const calls = [];
  const window = {
    location: new URL('http://localhost:8765/learn'),
    WW: { onSave() {} },
    document: { addEventListener() {} },
    addEventListener() {},
    supabase: {
      createClient() {
        return {
          auth: {
            signInWithOAuth(opts) {
              calls.push(opts);
              return Promise.resolve({ data: {}, error: null });
            },
            onAuthStateChange() {}
          }
        };
      }
    }
  };
  vm.runInNewContext(cloud, { window });
  return window.Cloud.signInWithGoogle().then(function () {
    assert.equal(calls[0].options.redirectTo, 'http://localhost:8765/');
  });
});

test('auth modal offers Continue with Google on sign-in and sign-up', () => {
  const ui = read('assets/js/ui.js');
  assert.match(ui, /Continue with Google/);
  assert.match(ui, /data-oauth-google/);
  assert.match(ui, /signInWithGoogle/);
  assert.match(ui, /oauth-row/);
  assert.match(ui, /or use email/);
});

test('auth.css styles the Google button without new font stacks', () => {
  const css = read('assets/css/auth.css');
  assert.match(css, /\.oauth-google/);
  assert.match(css, /\.oauth-row/);
  assert.doesNotMatch(css, /font-family\s*:/);
});

test('passkeys nest under the Google oauth row when present', () => {
  const pk = read('assets/js/passkey.js');
  assert.match(pk, /\.oauth-row/);
  assert.match(pk, /oauth\.appendChild\(btn\)/);
});

test('supabase README documents Google callback and redirect allow-list', () => {
  const readme = read('supabase/README.md');
  assert.match(readme, /envecwhnnktltfoypekk\.supabase\.co\/auth\/v1\/callback/);
  assert.match(readme, /www\.learngeo\.app/);
  assert.match(readme, /localhost:8765/);
  assert.match(readme, /Google provider/);
});

test('adopt seeds display name from Google user_metadata', () => {
  const cloud = read('assets/js/cloud.js');
  assert.match(cloud, /metaDisplayName/);
  assert.match(cloud, /full_name/);
  assert.match(cloud, /user_metadata/);
});
