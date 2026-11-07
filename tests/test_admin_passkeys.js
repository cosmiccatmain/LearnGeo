/* LEA-82: admin unlock code + WebAuthn passkey wiring. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

test('deployed 0026 sets adminisbetter and admin_passkeys RPCs', () => {
  const sql = read('supabase/deployed/0026_admin_passkeys.sql');
  assert.match(sql, /adminisbetter/);
  assert.match(sql, /create table if not exists public\.admin_passkeys/);
  assert.match(sql, /admin_passkey_enroll/);
  assert.match(sql, /admin_passkey_remove/);
  assert.match(sql, /admin_open_session_passkey/);
  assert.match(sql, /verify_admin_pin_scope/);
  assert.match(sql, /'passkey'/);
  assert.doesNotMatch(sql, /screen.?shar/i);
});

test('AdminPasskey client exports enroll/remove/unlock and the code', () => {
  const pk = read('assets/js/admin-passkey.js');
  assert.match(pk, /AdminPasskey/);
  assert.match(pk, /enroll:/);
  assert.match(pk, /remove:/);
  assert.match(pk, /unlock:/);
  assert.match(pk, /CODE:\s*'adminisbetter'/);
  assert.match(pk, /navigator\.credentials\.create/);
  assert.match(pk, /navigator\.credentials\.get/);
});

test('AdminOps wires passkey session RPCs', () => {
  const ops = read('assets/js/admin-ops.js');
  assert.match(ops, /openPasskey/);
  assert.match(ops, /enrollPasskey/);
  assert.match(ops, /removePasskey/);
  assert.match(ops, /admin_open_session_passkey/);
  assert.match(ops, /admin_passkey_enroll/);
});

test('Unlock dialog offers passkey; UltraAdmin has Set up / Remove', () => {
  const admin = read('assets/js/admin.js');
  const ultra = read('assets/js/ultra-admin.js');
  const html = read('index.html');
  assert.match(admin, /pad-passkey/);
  assert.match(admin, /Use passkey/);
  assert.match(admin, /adminisbetter/);
  assert.match(ultra, /ua-pk-setup/);
  assert.match(ultra, /ua-pk-remove/);
  assert.match(ultra, /Set up passkey/);
  assert.match(ultra, /Remove passkey/);
  assert.match(ultra, /adminisbetter/);
  assert.match(html, /admin-passkey\.js/);
});

test('docs mention adminisbetter and admin-passkey.js', () => {
  const readme = read('README.md');
  const deployed = read('supabase/deployed/README.md');
  assert.match(readme, /adminisbetter/);
  assert.match(readme, /admin-passkey\.js/);
  assert.match(deployed, /0026_admin_passkeys/);
  assert.match(deployed, /adminisbetter/);
});

test('account Auth passkey.js is not the admin unlock path', () => {
  const authPk = read('assets/js/passkey.js');
  assert.doesNotMatch(authPk, /admin_open_session_passkey|AdminPasskey|adminisbetter/);
});
