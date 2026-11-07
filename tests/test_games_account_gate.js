/* Node smoke checks for LEA-55 Games account gate (no browser). */
'use strict';
var fs = require('fs');
var path = require('path');
var assert = require('assert');

var root = path.join(__dirname, '..');
var games = fs.readFileSync(path.join(root, 'assets/js/games.js'), 'utf8');
var boards = fs.readFileSync(path.join(root, 'assets/js/game-boards.js'), 'utf8');
var ui = fs.readFileSync(path.join(root, 'assets/js/ui.js'), 'utf8');
var css = fs.readFileSync(path.join(root, 'assets/css/game-boards.css'), 'utf8');
var sql = fs.readFileSync(path.join(root, 'supabase/deployed/0019_games_require_account.sql'), 'utf8');
var readme = fs.readFileSync(path.join(root, 'supabase/deployed/README.md'), 'utf8');

assert(/needsAccount/.test(games), 'games.js exposes needsAccount');
assert(/promptAccount/.test(games), 'games.js exposes promptAccount');
assert(/is-auth-locked/.test(games), 'hub cards get is-auth-locked for guests');
assert(/Make an account to play|Account needed to play|To play Games/.test(games),
  'friendly account prompt copy in games hub');
assert(/openAuth/.test(games) && /'signup'/.test(games) && /'signin'/.test(games),
  'gate sends guests to existing auth flow');
assert(/data-games-signup/.test(games) && /data-games-signin/.test(games),
  'hub banner has Create account and Sign in');

assert(/Games stays|role === 'games'|data-role="games"/.test(ui),
  'role picker still offers Games path');
assert(/openAuth\('signup',\s*afterAuth\)/.test(ui),
  'I’m here for the games requires signup when guest');
assert(/Make a free account, then jump into Games/.test(ui),
  'role picker copy mentions account first');

assert(/LEA-55/.test(boards) && /promptAccount/.test(boards),
  'game-boards askTag/ensureTag respect account gate');
assert(/signin/.test(boards), 'claim handles server signin result');

assert(/is-auth-locked/.test(css), 'CSS styles guest lock on game cards');

assert(/auth\.uid\(\) is null/.test(sql), 'SQL refuses anonymous claim/score');
assert(/revoke execute on function public\.claim_gamertag/.test(sql),
  'anon lose claim_gamertag');
assert(/revoke execute on function public\.submit_game_score/.test(sql),
  'anon lose submit_game_score');
assert(/revoke execute on function public\.pvp_send_invite/.test(sql),
  'anon lose Geo Duel invite RPC');
assert(/0019_games_require_account/.test(readme), 'deployed README documents 0019');
assert(!/<<<<<<|>>>>>>|======/.test(readme), 'README has no conflict markers');
assert(!/0018_games_require_account/.test(readme), 'README no longer points at 0018 file');

assert(!/Brainrot/i.test(games), 'no Brainrot copy in games gate');
assert(!/screen.?mirror|Share screen/i.test(games), 'no screen mirroring in games gate');

console.log('test_games_account_gate.js: ok');
