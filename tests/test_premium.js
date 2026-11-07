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
/* LEA-61 / LEA-62: popular + Golf / Defender stay free; other arcade is Premium. */
assert(!/id: 'chess'[\s\S]{0,120}premium:\s*true/.test(games), 'Geo Chess stays free');
assert(!/id: 'dash'[\s\S]{0,120}premium:\s*true/.test(games), 'Geo Dash stays free');
assert(!/id: 'duel'[\s\S]{0,120}premium:\s*true/.test(games), 'Geo Duel stays free');
/* LEA-68: Chess Duel hub entry removed; PvP lives in free Geo Chess. */
assert(!/id: 'chessduel'[\s\S]{0,40}title:/.test(games), 'Chess Duel is not a separate Games hub entry');
assert(/Challenge a friend/.test(games), 'Geo Chess offers Challenge a friend');
assert(/id: 'snake'/.test(games) && !/id: 'snake'[\s\S]{0,80}premium:\s*true/.test(games),
  'Capital Snake stays free');
assert(/id: 'match'/.test(games) && !/id: 'match'[\s\S]{0,80}premium:\s*true/.test(games),
  'Flag Match stays free');
assert(/id: 'maze'/.test(games) && !/id: 'maze'[\s\S]{0,80}premium:\s*true/.test(games),
  'Capital Maze stays free');
assert(/id: 'golf'/.test(games) && !/id: 'golf'[\s\S]{0,80}premium:\s*true/.test(games),
  'Geo Golf stays free (LEA-62)');
assert(/id: 'orbit'/.test(games) && !/id: 'orbit'[\s\S]{0,80}premium:\s*true/.test(games),
  'Globe Defender stays free (LEA-62)');
assert(/id: 'invaders'[\s\S]*?premium:\s*true/.test(games), 'Geo Invaders is Premium');
assert(/id: 'echo'[\s\S]*?premium:\s*true/.test(games), 'Flag Echo is Premium');
assert(/id: 'embers'[\s\S]*?premium:\s*true/.test(cos), 'Embers effect is Premium');
assert(/id: 'bubbles'[\s\S]*?premium:\s*true/.test(cos), 'Deep Current is Premium');
assert(/id: 'rain'[\s\S]*?premium:\s*true/.test(cos), 'Monsoon is Premium');
assert(/id: 'wings'[\s\S]*?premium:\s*true/.test(cos), 'Wings is Premium');
assert(/id: 'gambling'[\s\S]*?premium:\s*true/.test(cos), 'Gambling is Premium');
assert(/id: 'spark'[\s\S]*?price:\s*0/.test(cos), 'Atlas Sparks is free');
assert(!/id: 'spark'[\s\S]{0,120}premium:\s*true/.test(cos), 'Atlas Sparks is not Premium');
assert(/PREMIUM_GAMES/.test(prem) && /invaders:\s*true/.test(prem) && /echo:\s*true/.test(prem),
  'premium.js lists gated lesser-played games');
assert(!/golf:\s*true/.test(prem) && !/orbit:\s*true/.test(prem),
  'premium.js does not gate Golf or Globe Defender (LEA-62)');
assert(!/chess:\s*true/.test(prem) && !/dash:\s*true/.test(prem),
  'premium.js does not gate Chess or Dash');
assert(/crown:/.test(fs.readFileSync(path.join(root, 'assets/js/core.js'), 'utf8')),
  'Icons.crown exists for Premium locks');
assert(/game-card__crown|game-card__prem-badge/.test(games),
  'Games hub renders crown / Premium badge on locked cards');
assert(/ultra_set_premium/.test(sql), 'SQL exposes ultra_set_premium');
assert(/premium_game_ids/.test(sql), 'SQL lists premium_game_ids');
assert(/raise exception 'premium'/.test(sql), 'submit_game_score refuses Premium without flag');
var sql21 = fs.readFileSync(path.join(root, 'supabase/deployed/0021_premium_game_ids.sql'), 'utf8');
assert(/'golf'/.test(sql21) && /'invaders'/.test(sql21) && /'echo'/.test(sql21),
  '0021 listed lesser-played Premium games (historical)');
assert(!/'chess'/.test(sql21) && !/'dash'/.test(sql21),
  '0021 does not gate Chess or Dash');
var sql22 = fs.readFileSync(path.join(root, 'supabase/deployed/0022_premium_game_ids.sql'), 'utf8');
assert(/'invaders'/.test(sql22) && /'echo'/.test(sql22) && /'breakout'/.test(sql22),
  '0022 keeps remaining Premium arcade titles');
assert(!/'golf'/.test(sql22) && !/'orbit'/.test(sql22),
  '0022 unlocks Golf and Globe Defender');
assert(/name: 'Premium'/.test(sub), 'plans UI uses Premium label');
assert(!/Brainrot/i.test(sub), 'no Brainrot copy in subscription UI');
assert(/not tied to being a teacher/i.test(sub) || /not teacher/i.test(sub),
  'copy says Premium is not teacher-based');
assert(/alexjschendel@gmail\.com/.test(sub), 'owner TEST email kept');
assert(/previewEnabled/.test(prem) && /setPreviewEnabled/.test(prem),
  'premium.js exposes Development preview switch');
assert(/learngeo\.dev\.premiumPreview/.test(prem), 'preview flag key is stable');
assert(/force:\s*true/.test(sub) || /openForced/.test(sub),
  'admin can force-open plans for TEST while preview is off');
assert(/mock checkout/i.test(sub) && /Stripe is not connected/.test(sub),
  'checkout stays mock / TEST only');
assert(/overflow:\s*visible/.test(fs.readFileSync(
  path.join(root, 'assets/css/subscription-dev.css'), 'utf8')),
  'Premium plan cards use overflow:visible so badges are not clipped');

/* LEA-54: Geo Dash trails + jumper skins */
assert(/trails:\s*TRAILS/.test(cos), 'cosmetics exports trails');
assert(/jumpers:\s*JUMPERS/.test(cos), 'cosmetics exports jumpers');
assert(/id: 'dust'[\s\S]*?price:\s*0/.test(cos), 'Chalk Dust trail is free');
assert(/id: 'classic'[\s\S]*?price:\s*0/.test(cos), 'Classic jumper is free');
assert(/id: 'ember'[\s\S]*?premium:\s*true/.test(cos), 'Ember Wake trail is Premium');
assert(/id: 'neon'[\s\S]*?premium:\s*true/.test(cos), 'Neon Stream trail is Premium');
assert(/id: 'gilded'[\s\S]*?premium:\s*true/.test(cos), 'Gilded Cube jumper is Premium');
assert(/dashTrail/.test(prem) && /dashJumper/.test(prem),
  'premium.js strips Geo Dash cosmetics without entitlement');

var sql16 = fs.readFileSync(path.join(root, 'supabase/deployed/0016_geo_dash_cosmetics.sql'), 'utf8');
assert(/dashTrail/.test(sql16) && /dashJumper/.test(sql16),
  '0016 strips Premium dashTrail / dashJumper');
assert(/'ember',\s*'neon',\s*'aurora'/.test(sql16), '0016 lists Premium trails');
assert(/'aurora',\s*'gilded'/.test(sql16), '0016 lists Premium jumpers');

var ui = fs.readFileSync(path.join(root, 'assets/js/ui.js'), 'utf8');
assert(/vt\('games'/.test(ui), 'Customise has Games tab');
assert(/gamesPanel/.test(ui) && /Geo Dash cosmetics/.test(ui), 'Games panel for dash cosmetics');
var gamesPanelChunk = (ui.match(/function gamesPanel[\s\S]*?function gamesSection/) || [''])[0];
assert(gamesPanelChunk.length > 0 && !/Brainrot|Mongolian|Pets/i.test(gamesPanelChunk),
  'Games cosmetics panel has no Pets/Brainrot');

var dash = fs.readFileSync(path.join(root, 'assets/js/game-dash.js'), 'utf8');
assert(/equippedTrail/.test(dash) && /equippedJumper/.test(dash),
  'Geo Dash reads equipped trail/jumper');
assert(/drawJumperCube/.test(dash) && /spawnTrail/.test(dash),
  'Geo Dash draws jumper skins and trail particles');

/* LEA-59: more Games cosmetics beyond Geo Dash */
assert(/chessBoards:\s*CHESS_BOARDS/.test(cos), 'cosmetics exports chessBoards');
assert(/chessPieces:\s*CHESS_PIECES/.test(cos), 'cosmetics exports chessPieces');
assert(/snakeBodies:\s*SNAKE_BODIES/.test(cos), 'cosmetics exports snakeBodies');
assert(/matchBacks:\s*MATCH_BACKS/.test(cos), 'cosmetics exports matchBacks');
assert(/mazeRunners:\s*MAZE_RUNNERS/.test(cos), 'cosmetics exports mazeRunners');
assert(/duelAccents:\s*DUEL_ACCENTS/.test(cos), 'cosmetics exports duelAccents');
assert(/id: 'parchment'[\s\S]*?price:\s*0/.test(cos), 'Parchment chess board is free');
assert(/id: 'meridian'[\s\S]*?premium:\s*true/.test(cos), 'Meridian chess board is Premium');
assert(/SNAKE_BODIES[\s\S]*?id: 'neon'[\s\S]*?premium:\s*true/.test(cos),
  'Neon snake coil is Premium');
assert(/chessBoard/.test(prem) && /snakeBody/.test(prem) && /duelAccent/.test(prem),
  'premium.js strips LEA-59 Games cosmetics without entitlement');

var sql20 = fs.readFileSync(path.join(root, 'supabase/deployed/0020_more_games_cosmetics.sql'), 'utf8');
assert(/chessBoard/.test(sql20) && /snakeBody/.test(sql20) && /matchBack/.test(sql20),
  '0020 strips Premium multi-game cosmetics');
assert(/'aurora',\s*'meridian'/.test(sql20), '0020 lists Premium chess boards');
assert(/duelAccent/.test(sql20) && /mazeRunner/.test(sql20), '0020 covers duel + maze');
assert(!fs.existsSync(path.join(root, 'supabase/deployed/0019_more_games_cosmetics.sql')),
  'old 0019_more_games_cosmetics filename must not exist (renamed to 0020)');

assert(/Games cosmetics/.test(ui) && /chessBoards/.test(ui) && /snakeBodies/.test(ui),
  'Games panel lists Chess and Snake cosmetics');
assert(/renderGamesPreview/.test(ui) || /chessPreviewHtml/.test(ui),
  'Games tab preview covers more than Dash');

var chess = fs.readFileSync(path.join(root, 'assets/js/game-chess.js'), 'utf8');
assert(/applyChessCosmetics|--chess-light|chessBoard/.test(chess),
  'Geo Chess applies board/piece cosmetics');
var snake = fs.readFileSync(path.join(root, 'assets/js/game-snake.js'), 'utf8');
assert(/equippedSnakeBody/.test(snake), 'Capital Snake reads coil cosmetics');
var match = fs.readFileSync(path.join(root, 'assets/js/game-match.js'), 'utf8');
assert(/equippedMatchBack/.test(match), 'Flag Match reads tile-back cosmetics');
var maze = fs.readFileSync(path.join(root, 'assets/js/game-maze.js'), 'utf8');
assert(/equippedMazeRunner/.test(maze), 'Capital Maze reads explorer cosmetics');
var duel = fs.readFileSync(path.join(root, 'assets/js/game-duel.js'), 'utf8');
assert(/applyDuelAccent|equippedDuelAccent/.test(duel), 'Geo Duel applies accent cosmetics');

var updates = fs.readFileSync(path.join(root, 'assets/data/updates.json'), 'utf8');
assert(/2026-11-games-cosmetics-more/.test(updates), 'updates.json has LEA-59 What’s New entry');
assert(!/Pets|Brainrot|screen.?mirror/i.test(updates.match(/2026-11-games-cosmetics-more[\s\S]*?\},/)[0]),
  'LEA-59 What’s New stays public-safe');

var admin = fs.readFileSync(path.join(root, 'assets/js/administrator.js'), 'utf8');
assert(/prempreview/.test(admin) && /Premium plans &amp; gating preview|Premium plans \& gating preview|Turn preview/.test(admin),
  'Development panel has Premium preview toggle');
assert(!/Screen monitoring/.test(admin), 'Screen monitoring nav is gone');
assert(/reftrial/.test(admin) && /Referral → 3-day all-games trial/.test(admin),
  'Development panel has referral trial TEST toggle');
assert(/ReferralTrial/.test(prem), 'premium.js honors referral trial');

console.log('test_premium.js: ok');
