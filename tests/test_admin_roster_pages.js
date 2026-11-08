/* LEA-103: Admin Accounts roster pagination reaches every profile. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

test('deployed 0032 raises ultra_find_accounts past the old 60-row cap', () => {
  const sql = read('supabase/deployed/0032_admin_roster_pages.sql');
  assert.match(sql, /ultra_find_accounts/);
  assert.match(sql, /limit 2000/i);
  assert.doesNotMatch(sql, /limit 60/i);
  assert.match(sql, /admin_scope_of/);
  assert.match(sql, /revoke execute on function public\.ultra_find_accounts/);
});

test('Administrator pages the roster at 25 with FIND_CAP 2000', () => {
  const admin = read('assets/js/administrator.js');
  assert.match(admin, /var PAGE = 25/);
  assert.match(admin, /var FIND_CAP = 2000/);
  assert.match(admin, /Math\.ceil\(rows\.length \/ PAGE\)/);
  assert.doesNotMatch(admin, /var PAGE = 12/);
  assert.doesNotMatch(admin, /var FIND_CAP = 60/);
  /* Games nav / Premium / no screen mirroring prefs stay intact. */
  assert.match(admin, /panelDevelopment/);
  assert.doesNotMatch(admin, /Screen monitoring|Live shares|screenShares/);
});

test('bulk stub mirrors the 2000-row find cap', () => {
  const stub = read('tests/fixtures/ultra-bulk-stub.js');
  assert.match(stub, /matched\.slice\(0,\s*2000\)/);
  assert.doesNotMatch(stub, /slice\(0,\s*60\)/);
});

test('deployed README documents 0032 / LEA-103', () => {
  const readme = read('supabase/deployed/README.md');
  assert.match(readme, /0032_admin_roster_pages/);
  assert.match(readme, /LEA-103/);
});
