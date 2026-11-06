/* LEA-46: screen mirroring / remote share must stay gone from the app. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

test('screen share client and Daily edge functions are removed', () => {
  assert.equal(exists('assets/js/screen-share.js'), false);
  assert.equal(exists('supabase/functions/daily-share-token'), false);
  assert.equal(exists('supabase/functions/daily-share-stop'), false);
  assert.equal(exists('supabase/functions/_shared/daily.ts'), false);
  assert.equal(exists('supabase/functions/_shared/share.ts'), false);
});

test('app shell has no Share screen UI or ScreenShare hooks', () => {
  const html = read('index.html');
  const admin = read('assets/js/administrator.js');
  const ops = read('assets/js/admin-ops.js');
  const ui = read('assets/js/ui.js');
  assert.doesNotMatch(html, /id="share-screen"/);
  assert.doesNotMatch(html, /id="share-bar"/);
  assert.doesNotMatch(html, /screen-share\.js/);
  assert.doesNotMatch(admin, /Screen monitoring/);
  assert.doesNotMatch(admin, /Live shares/);
  assert.doesNotMatch(admin, /ScreenShare/);
  assert.doesNotMatch(admin, /screenShares|viewerToken|sharewatch/);
  assert.doesNotMatch(ops, /list_screen_shares|daily-share-token|invokeDaily/);
  assert.doesNotMatch(ui, /ScreenShare/);
});

test('page sources do not call Daily REST or embed a Daily key', () => {
  const files = ['index.html', 'assets/js/administrator.js', 'assets/js/admin-ops.js', 'assets/js/ui.js'];
  const hits = [];
  for (const rel of files) {
    const text = read(rel);
    if (text.includes('DAILY_API_KEY')) hits.push(rel + ' mentions DAILY_API_KEY');
    if (text.includes('api.daily.co')) hits.push(rel + ' calls api.daily.co');
    if (text.includes('getDisplayMedia')) hits.push(rel + ' uses getDisplayMedia');
  }
  assert.deepEqual(hits, []);
});
