/* LEA-53: admin panel login roster — migration + UI wiring. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

test('deployed 0016 defines admin_logins table, open-session hooks, and reader RPC', () => {
  const sql = read('supabase/deployed/0016_admin_logins.sql');
  assert.match(sql, /create table if not exists public\.admin_logins/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on public\.admin_logins/);
  assert.match(sql, /insert into public\.admin_logins/);
  assert.match(sql, /create or replace function public\.ultra_admin_logins/);
  assert.match(sql, /admin_open_session/);
  assert.match(sql, /admin_open_session_private/);
  assert.doesNotMatch(sql, /screen.?shar/i);
});

test('AdminOps exposes logins via ultra_admin_logins', () => {
  const ops = read('assets/js/admin-ops.js');
  assert.match(ops, /logins:\s*function/);
  assert.match(ops, /ultra_admin_logins/);
});

test('Administrator has a Logins section with identity + timestamp roster', () => {
  const admin = read('assets/js/administrator.js');
  assert.match(admin, /navItem\('logins'/);
  assert.match(admin, /panelLogins/);
  assert.match(admin, /renderLogins/);
  assert.match(admin, /loadLogins/);
  assert.match(admin, /ap-logins/);
  assert.match(admin, /Admin panel logins/);
  assert.doesNotMatch(admin, /Screen monitoring|Live shares|screenShares/);
  /* Development / Premium preview wiring must stay intact. */
  assert.match(admin, /panelDevelopment/);
  assert.match(admin, /prempreview/);
  assert.match(admin, /cookpreview/);
  assert.match(admin, /Preview cooking loader/);
});

test('deployed README documents 0016', () => {
  const readme = read('supabase/deployed/README.md');
  assert.match(readme, /0016_admin_logins/);
});
