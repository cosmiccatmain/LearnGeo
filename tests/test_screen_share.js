/* The Daily API key must never ship in the page. These checks read the
   source. They do not call Daily or Supabase. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function walk(rel, out) {
  const abs = path.join(root, rel);
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const child = path.join(rel, entry.name);
    if (entry.isDirectory()) walk(child, out);
    else out.push(child);
  }
  return out;
}

test('the page does not contain the Daily API key or Daily REST calls', () => {
  const files = walk('assets', []).concat(['index.html', 'vercel.json']);
  const hits = [];
  for (const rel of files) {
    if (!/\.(js|css|html|json)$/.test(rel)) continue;
    const text = read(rel);
    if (text.includes('DAILY_API_KEY')) hits.push(rel + ' mentions DAILY_API_KEY');
    if (text.includes('api.daily.co')) hits.push(rel + ' calls api.daily.co');
    if (/Bearer\s+[A-Za-z0-9_\-]{20,}/.test(text) && /daily/i.test(text)) {
      hits.push(rel + ' has a bearer token next to Daily');
    }
  }
  assert.deepEqual(hits, []);
});

test('tokens are minted only in the edge function, from the secret', () => {
  const tokenFn = read('supabase/functions/daily-share-token/index.ts');
  const daily = read('supabase/functions/_shared/daily.ts');
  const stopFn = read('supabase/functions/daily-share-stop/index.ts');
  assert.match(daily, /Deno\.env\.get\('DAILY_API_KEY'\)/);
  assert.match(daily, /Deno\.env\.get\('DAILY_DOMAIN'\)/);
  assert.match(tokenFn, /role === 'publisher'/);
  assert.match(tokenFn, /role === 'viewer'/);
  assert.match(tokenFn, /screen_share_viewer_ok|viewerAllowed/);
  assert.match(tokenFn, /enable_screenshare: true/);
  assert.match(tokenFn, /enable_screenshare: false/);
  assert.match(tokenFn, /canSend: \['screenVideo'\]/);
  assert.match(tokenFn, /canSend: false/);
  assert.match(tokenFn, /is_owner: false/);
  assert.doesNotMatch(daily, /DAILY_API_KEY\s*=\s*['"][A-Za-z0-9]/);
  assert.match(stopFn, /deleteRoom/);
  assert.doesNotMatch(tokenFn + stopFn + daily, /sk_live_|sk_test_/);
});

test('screen share SQL is owner-gated and the student writes only their row', () => {
  const sql = read('supabase/deployed/0012_screen_shares.sql');
  assert.match(sql, /create table if not exists public\.screen_shares/);
  assert.match(sql, /report_screen_share/);
  assert.match(sql, /list_screen_shares/);
  assert.match(sql, /screen_share_viewer_ok/);
  assert.match(sql, /alexjschendel@gmail\.com/);
  assert.match(sql, /revoke all on public\.screen_shares from public, anon, authenticated/);
  assert.match(sql, /admin_scope_of\(p_token\) is distinct from 'ultra'/);
  assert.match(sql, /not permitted/);
  assert.match(sql, /lg-u-/);
  assert.doesNotMatch(sql, /DAILY_API_KEY/);
});

test('the app shell exposes Share screen and the monitor tab lists live shares', () => {
  const html = read('index.html');
  const admin = read('assets/js/administrator.js');
  const share = read('assets/js/screen-share.js');
  assert.match(html, /id="share-screen"/);
  assert.match(html, /id="share-stop"/);
  assert.match(html, /assets\/js\/screen-share\.js/);
  assert.match(admin, /Live shares/);
  assert.match(admin, /list_screen_shares|screenShares/);
  assert.match(admin, /Stop watching/);
  assert.match(share, /startScreenShare/);
  assert.match(share, /selfBrowserSurface: 'exclude'/);
  assert.match(share, /role: 'publisher'/);
  assert.doesNotMatch(share, /daily-share-stop[\s\S]{0,80}viewer/);
  assert.match(share, /lg-share-prompt/);
  assert.match(share, /sessionStorage/);
  assert.match(share, /function offer\(/);
  assert.match(read('assets/js/ui.js'), /ScreenShare\.offer/);
  assert.match(share, /\/terms\.html#screen/);
  assert.match(share, /does not save a video/);
  assert.doesNotMatch(share, /teacher or the site owner will see/);
  assert.doesNotMatch(share, /teacher or admin will see/);
});

test('the terms tell families the live picture is not a saved recording', () => {
  const terms = read('terms.html');
  assert.match(terms, /id="screen"/);
  assert.match(terms, /does not save a video/);
  assert.match(terms, /under 13/);
  assert.match(terms, /alexjschendel@gmail\.com/);
  assert.match(terms, /COPPA/);
  assert.doesNotMatch(terms, /by using the site you agree we may record/);
});
