/* Node smoke checks for LEA-43 Premium catalogue flags (no browser). */
'use strict';
var fs = require('fs');
var path = require('path');
var assert = require('assert');

var root = path.join(__dirname, '..');
var games = fs.readFileSync(path.join(root, 'assets/js/games.js'), 'utf8');
var cos = fs.readFileSync(path.join(root, 'assets/js/cosmetics.js'), 'utf8');
var prem = fs.readFileSync(path.join(root, 'assets/js/premium.js'), 'utf8');
var sql = fs.readFileSync(path.join(root, 'supabase/deployed/0013_premium_subscriptions.sql'), 'utf8');
var sub = fs.readFileSync(path.join(root, 'assets/js/subscription-dev.js'), 'utf8');

assert(/premium:\s*true/.test(games), 'games.js marks Premium titles');
assert(/id: 'chess'[\s\S]*?premium:\s*true/.test(games), 'Geo Chess is Premium');
assert(/id: 'dash'[\s\S]*?premium:\s*true/.test(games), 'Geo Dash is Premium');
assert(/id: 'snake'/.test(games) && !/id: 'snake'[\s\S]{0,80}premium:\s*true/.test(games),
  'Capital Snake stays free');
assert(/id: 'embers'[\s\S]*?premium:\s*true/.test(cos), 'Embers effect is Premium');
assert(/PREMIUM_GAMES/.test(prem) && /chess:\s*true/.test(prem), 'premium.js lists gated games');
assert(/ultra_set_premium/.test(sql), 'SQL exposes ultra_set_premium');
assert(/premium_game_ids/.test(sql), 'SQL lists premium_game_ids');
assert(/raise exception 'premium'/.test(sql), 'submit_game_score refuses Premium without flag');
assert(/name: 'Premium'/.test(sub), 'plans UI uses Premium label');
assert(!/Brainrot/i.test(sub), 'no Brainrot copy in subscription UI');
assert(/not tied to being a teacher/i.test(sub) || /not teacher/i.test(sub),
  'copy says Premium is not teacher-based');
assert(/alexjschendel@gmail\.com/.test(sub), 'owner TEST email kept');

console.log('test_premium.js: ok');
