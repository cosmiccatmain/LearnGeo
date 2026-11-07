/* Node smoke checks for LEA-89 — classroom Wallet wall client removed. */
var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var teacher = fs.readFileSync(path.join(root, 'assets/js/teacher.js'), 'utf8');
var cloud = fs.readFileSync(path.join(root, 'assets/js/cloud.js'), 'utf8');
var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
var updates = fs.readFileSync(path.join(root, 'assets/data/updates.json'), 'utf8');
var updatesJs = fs.readFileSync(path.join(root, 'assets/js/updates.js'), 'utf8');
var readme = fs.readFileSync(path.join(root, 'supabase/deployed/README.md'), 'utf8');

assert(!/crTab\('wallets'/.test(teacher), 'no Wallet wall teacher tab');
assert(!/walletsPanel|cr-wallets|ClassWalletWall/.test(teacher),
  'no wallet wall mount points in teacher.js');
assert(!/'Wallet wall'/.test(teacher), 'no Wallet wall tab label string');
assert(!/class-wallet-wall\.js/.test(html), 'index does not load class-wallet-wall.js');
assert(!/class-wallet-wall\.css/.test(html), 'index does not load class-wallet-wall.css');
assert(!fs.existsSync(path.join(root, 'assets/js/class-wallet-wall.js')),
  'class-wallet-wall.js deleted');
assert(!fs.existsSync(path.join(root, 'assets/css/class-wallet-wall.css')),
  'class-wallet-wall.css deleted');
assert(!/pushAchievements|syncAchievements|sync_achievements/.test(cloud),
  'cloud has no achievement sync hooks for the wall');
assert(!/2026-11-class-wallet-wall/.test(updates), 'What’s New JSON entry removed');
assert(!/2026-11-class-wallet-wall/.test(updatesJs), 'What’s New JS entry removed');
assert(!/Stripe\.checkout|loadStripe|vercel --prod/i.test(teacher + cloud + html),
  'no live Stripe / vercel --prod');

/* SQL may remain unused (LEA-89). */
assert(fs.existsSync(path.join(root, 'supabase/deployed/0027_class_wallet_wall.sql')),
  '0027 SQL file kept (unused)');
assert(/LEA-89|client removed|unused/i.test(readme),
  'README notes client removed / SQL unused');

console.log('test_class_wallet_wall.js: ok (removed)');
