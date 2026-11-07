/* Node smoke checks for LEA-75 Class wallet wall (no browser). */
var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var teacher = fs.readFileSync(path.join(root, 'assets/js/teacher.js'), 'utf8');
var wall = fs.readFileSync(path.join(root, 'assets/js/class-wallet-wall.js'), 'utf8');
var css = fs.readFileSync(path.join(root, 'assets/css/class-wallet-wall.css'), 'utf8');
var cloud = fs.readFileSync(path.join(root, 'assets/js/cloud.js'), 'utf8');
var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
var sql = fs.readFileSync(path.join(root, 'supabase/deployed/0027_class_wallet_wall.sql'), 'utf8');
var readme = fs.readFileSync(path.join(root, 'supabase/deployed/README.md'), 'utf8');
var updates = fs.readFileSync(path.join(root, 'assets/data/updates.json'), 'utf8');
var updatesJs = fs.readFileSync(path.join(root, 'assets/js/updates.js'), 'utf8');
var screenTest = fs.readFileSync(path.join(root, 'tests/test_screen_share.js'), 'utf8');

assert(/crTab\('wallets'/.test(teacher), 'teacher tab wallets present');
assert(/Wallet wall/.test(teacher), 'Wallet wall label present');
assert(/walletsPanel|cr-wallets/.test(teacher), 'wallets panel host wired');
assert(/ClassWalletWall/.test(teacher), 'teacher mounts ClassWalletWall');
assert(/tab === 'wallets'/.test(teacher) || /tab !== 'wallets'/.test(teacher),
  'teacher leaves/mounts wallet wall with tab');

assert(/global\.ClassWalletWall/.test(wall), 'module exports ClassWalletWall');
assert(/class_wallet_wall/.test(wall), 'client calls class_wallet_wall RPC');
assert(/Recent unlocks|Student wallets/.test(wall), 'wall UI sections present');
assert(!/getDisplayMedia|screen-share|Daily\.|list_screen_shares|report_screen_share/i.test(wall),
  'wallet wall has no screen mirroring');
assert(!/checkout\.sessions|Stripe\.checkout|loadStripe/i.test(wall),
  'no live Stripe checkout in wallet wall');
assert(!/\bPets\b|Brainrot/i.test(wall), 'no Pets/Brainrot in wallet wall');

assert(/class-wallet-wall\.js/.test(html), 'index loads class-wallet-wall.js');
assert(/class-wallet-wall\.css/.test(html), 'index loads class-wallet-wall.css');
assert(/\.cww-tile|\.cww-feed|\.cww-chip/.test(css), 'wallet wall styles present');
assert(!/Syne|Plus Jakarta/i.test(css), 'keeps original LearnGeo fonts');

assert(/sync_achievements/.test(cloud) && /pushAchievements/.test(cloud),
  'cloud syncs achievements for the wall feed');
assert(/try \{ pushAchievements\(\); \}/.test(cloud),
  'pushAchievements runs after profile push');

assert(/achievement_unlock_events/.test(sql), 'SQL creates unlock events table');
assert(/sync_achievements/.test(sql) && /class_wallet_wall/.test(sql),
  'SQL has sync + wall RPCs');
assert(/app_teaches/.test(sql), 'wall gated by app_teaches');
assert(/grant execute[\s\S]*authenticated/.test(sql), 'authenticated execute grants');
assert(/revoke[\s\S]*anon/.test(sql) || /from public, anon/.test(sql),
  'anon cannot execute wall RPCs');
assert(/No screen mirroring|no screen mirroring|Data view only/i.test(sql),
  'SQL comments ban mirroring');
assert(!/season_/i.test(sql), 'avoids LEA-74 seasons naming collision');

assert(/0027_class_wallet_wall/.test(readme), 'deployed README documents 0027');
assert(/class_wallet_wall_0027/.test(readme), 'README lists MCP apply name');
assert(/LEA-75/.test(readme), 'README tags LEA-75');
assert(!/0026_class_wallet_wall/.test(readme),
  'does not steal LEA-74 seasons 0026 slot');

assert(/2026-11-class-wallet-wall/.test(updates), 'updates.json What’s New entry');
assert(/2026-11-class-wallet-wall/.test(updatesJs), 'updates.js seeded entry');
assert(!/Pets|Brainrot|screen.?mirror|Stripe/i.test(
  updates.match(/2026-11-class-wallet-wall[\s\S]*?\},/)[0]),
  'What’s New entry stays public-safe');

assert(/screen.?share|getDisplayMedia/i.test(screenTest),
  'screen-share guard test still present');

console.log('test_class_wallet_wall.js: ok');
