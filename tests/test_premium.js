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
/* LEA-76: weekly ladder + rematch stay inside Geo Chess (no Chess Duel). */
assert(/weekly ladder|Rematch last opponent|this week/i.test(games),
  'Geo Chess mentions weekly ladder / rematch');
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
assert(/id: 'invaders'[\s\S]{0,80}premium:\s*true/.test(games), 'Geo Invaders is a Plus extra');
assert(/id: 'breakout'[\s\S]{0,80}premium:\s*true/.test(games), 'Flag Breakout is a Plus extra');
assert(/id: 'typer'[\s\S]{0,80}premium:\s*true/.test(games), 'Capital Typer is a Plus extra');
assert(/id: 'echo'[\s\S]{0,80}premium:\s*true/.test(games), 'Flag Echo is a Plus extra');
assert(!/id: 'crossing'[\s\S]{0,80}premium:\s*true/.test(games), 'Border Crossing stays on Free');
assert(!/id: 'whack'[\s\S]{0,80}premium:\s*true/.test(games), 'Capital Whack stays on Free');
assert(!/id: 'sort'[\s\S]{0,80}premium:\s*true/.test(games), 'Continent Sort stays on Free');
assert(!/id: 'stack'[\s\S]{0,80}premium:\s*true/.test(games), 'Capital Stack stays on Free');
assert(/id: 'embers'[\s\S]{0,220}premium:\s*true/.test(cos), 'Embers effect is a Plus extra');
assert(/id: 'bubbles'[\s\S]{0,220}premium:\s*true/.test(cos), 'Deep Current is a Plus extra');
assert(!/id: 'rain'[\s\S]{0,220}premium:\s*true/.test(cos), 'Monsoon stays on Free');
assert(/id: 'wings'[\s\S]{0,220}premium:\s*true/.test(cos), 'Chicken Wings is a Plus extra');
assert(!/id: 'gambling'[\s\S]{0,280}premium:\s*true/.test(cos), 'Gambling stays on Free');
assert(/id: 'spark'[\s\S]*?price:\s*0/.test(cos), 'Atlas Sparks is free');
assert(!/id: 'spark'[\s\S]{0,120}premium:\s*true/.test(cos), 'Atlas Sparks is not Premium');
assert(/PREMIUM_GAMES/.test(prem) && /invaders:\s*true/.test(prem) && /echo:\s*true/.test(prem),
  'premium.js lists the Plus games');
assert(!/crossing:\s*true/.test(prem) && !/whack:\s*true/.test(prem) && !/stack:\s*true/.test(prem),
  'premium.js does not gate Crossing, Whack, or Stack');
assert(/PLUS_EXTRAS/.test(prem) && /catalogueVisible/.test(prem),
  'Free catalogue hides Plus extras while the preview gate is on');
assert(/function gameShown/.test(games) && /visibleGames/.test(games),
  'Games hub drops Plus titles for Free instead of rendering locks');
assert(!/game-card__prem-badge/.test(games) && !/Premium · Upgrade/.test(games),
  'hub cards do not tease locked Plus games');
assert(!/\(prem \?/.test(games),
  'hub cards do not reference a removed prem flag');
assert(!/golf:\s*true/.test(prem) && !/orbit:\s*true/.test(prem),
  'premium.js does not gate Golf or Globe Defender (LEA-62)');
assert(!/chess:\s*true/.test(prem) && !/dash:\s*true/.test(prem),
  'premium.js does not gate Chess or Dash');
assert(/crown:/.test(fs.readFileSync(path.join(root, 'assets/js/core.js'), 'utf8')),
  'Icons.crown still exists');
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
assert(/name: 'Free'/.test(sub) && /name: 'Plus'/.test(sub) && /name: 'Schools'/.test(sub),
  'plans UI uses Free, Plus, and Schools');
assert(!/name: 'Premium'/.test(sub), 'plans UI does not keep the Premium plan name');
assert(/\$2/.test(sub) && /id="subdev-students"/.test(sub) && /How many students/.test(sub),
  'Schools card has a $2 student slider');
assert(/No ads/.test(sub) && /Education badge/.test(sub) && /Geo Classroom/.test(sub),
  'Plus is no ads; Schools has the Education badge and Geo Classroom');
assert(!/Brainrot/i.test(sub), 'no Brainrot copy in subscription UI');
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
assert(/id: 'ember'[\s\S]{0,180}premium:\s*true/.test(cos), 'Ember Wake trail is a Plus extra');
assert(!/name: 'Neon Stream'[\s\S]{0,160}premium:\s*true/.test(cos), 'Neon Stream stays on Free');
assert(/name: 'Gilded Cube'[\s\S]{0,180}premium:\s*true/.test(cos), 'Gilded Cube jumper is a Plus extra');
assert(/dashTrail/.test(prem) && /dashJumper/.test(prem),
  'premium.js strips Geo Dash cosmetics without entitlement');

var sql16 = fs.readFileSync(path.join(root, 'supabase/deployed/0016_geo_dash_cosmetics.sql'), 'utf8');
assert(/dashTrail/.test(sql16) && /dashJumper/.test(sql16),
  '0016 strips Premium dashTrail / dashJumper');
assert(/'ember',\s*'neon',\s*'aurora'/.test(sql16), '0016 lists Premium trails');
assert(/'aurora',\s*'gilded'/.test(sql16), '0016 lists Premium jumpers');

var ui = fs.readFileSync(path.join(root, 'assets/js/ui.js'), 'utf8');
assert(/plusItemVisible/.test(ui),
  'Customise hides Plus skins and profile looks from Free');
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
assert(/id: 'meridian'[\s\S]{0,160}premium:\s*true/.test(cos), 'Meridian Gold is a Plus extra');
assert(!/name: 'Neon Coil'[\s\S]{0,140}premium:\s*true/.test(cos),
  'Neon snake coil stays on Free');
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

/* LEA-100: Customise piece cards + live preview use crisp SVG glyphs. */
assert(/chessPieceSvg/.test(cos) && /CHESS_GLYPH_PATHS/.test(cos),
  'cosmetics exports SVG chess glyph helper');
assert(/pieceSvg\('q'/.test(ui) && /pieceSvg\('n'/.test(ui) && /pieceSvg\('k'/.test(ui),
  'Customise piece cards and chess preview render SVG glyphs');
assert(/cz-chess-glyph/.test(fs.readFileSync(path.join(root, 'assets/css/app.css'), 'utf8')),
  'Customise CSS sizes SVG chess glyphs');

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
assert(/cookpreview/.test(admin) && /Preview cooking loader/.test(admin),
  'Development panel has cooking loader preview');
assert(/cmd === 'cooking'|cmd === \"cooking\"/.test(admin),
  'Commands include cooking loader preview');
assert(/ReferralTrial/.test(prem), 'premium.js honors referral trial');

/* LEA-119 / LEA-122: Plus and Education badges in the existing case. */
var badgesSrc = fs.readFileSync(path.join(root, 'assets/js/badges.js'), 'utf8');
var badgesCss = fs.readFileSync(path.join(root, 'assets/css/badges.css'), 'utf8');
var inbox = fs.readFileSync(path.join(root, 'assets/js/admin-inbox.js'), 'utf8');
var sql34 = fs.readFileSync(path.join(root, 'supabase/deployed/0034_plus_schools_plans.sql'), 'utf8');
assert(/id:\s*'plus'/.test(badgesSrc) && /name:\s*'Plus'/.test(badgesSrc),
  'badges.js catalogues a Plus entitlement badge');
assert(/id:\s*'education'/.test(badgesSrc) && /name:\s*'Education'/.test(badgesSrc),
  'badges.js catalogues a distinct Education badge');
assert(/art:\s*'mark'/.test(badgesSrc) && /art:\s*'cap'/.test(badgesSrc) && /fill:\s*true/.test(badgesSrc),
  'Plus uses the filled brand mark; Education uses a cap');
assert(/syncPremium/.test(badgesSrc) && /syncPlans/.test(badgesSrc),
  'badges.js exports syncPremium and syncPlans');
assert(/Stripe glyph|Not a Stripe/i.test(badgesSrc) || /not a Stripe/i.test(badgesSrc),
  'Plus art is documented as not a Stripe glyph');
assert(/bdg--plus/.test(badgesCss) && /#12907B/.test(badgesCss),
  'Plus tone uses LearnGeo brand teal');
assert(/bdg--education/.test(badgesCss) && /#1E3A5F/.test(badgesCss),
  'Education tone is navy, not the Plus teal');
assert(/'invaders', 'breakout', 'typer', 'echo'/.test(sql34),
  '0034 gates only the four Plus games');
assert(/ultra_set_plan/.test(sql34) && /flags,plan/.test(sql34),
  '0034 can grant a plan and freezes flags.plan');
assert(/function W\(\)|global\.WW/.test(prem) && /core\.js loads after/.test(prem),
  'premium.js resolves WW at call time (core.js loads after it)');
assert(/syncPremium/.test(prem), 'Premium.setLocal syncs the badge');
assert(/syncPremium/.test(inbox), 'admin-inbox grants/greys the badge with Premium');
assert(/syncPremium/.test(ui), 'account adopt re-syncs the Premium badge');
assert(/view:\s*'games'/.test(ui) && /label:\s*'Games'/.test(ui),
  'Games stays in the main nav');
assert(!/Screen monitoring/.test(ui) && !/Share screen/.test(ui),
  'no screen mirroring copy in ui.js');

console.log('test_premium.js: ok');
