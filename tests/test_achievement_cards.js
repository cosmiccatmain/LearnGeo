/* Node smoke checks for LEA-64 / LEA-67 / LEA-74 / LEA-80 / LEA-84 Achievement wallet + Friend inbox (no browser). */
var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var ui = fs.readFileSync(path.join(root, 'assets/js/ui.js'), 'utf8');
var cards = fs.readFileSync(path.join(root, 'assets/js/achievement-cards.js'), 'utf8');
var css = fs.readFileSync(path.join(root, 'assets/css/achievement-cards.css'), 'utf8');
var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
var router = fs.readFileSync(path.join(root, 'assets/js/router.js'), 'utf8');
var vercel = fs.readFileSync(path.join(root, 'vercel.json'), 'utf8');
var updates = fs.readFileSync(path.join(root, 'assets/data/updates.json'), 'utf8');
var updatesJs = fs.readFileSync(path.join(root, 'assets/js/updates.js'), 'utf8');
var games = fs.readFileSync(path.join(root, 'assets/js/games.js'), 'utf8');
var chessDuel = fs.readFileSync(path.join(root, 'assets/js/game-chess-duel.js'), 'utf8');
var cosmetics = fs.readFileSync(path.join(root, 'assets/js/cosmetics.js'), 'utf8');
var core = fs.readFileSync(path.join(root, 'assets/js/core.js'), 'utf8');
var sql = fs.readFileSync(path.join(root, 'supabase/deployed/0023_achievement_cards.sql'), 'utf8');
var sqlWallet = fs.readFileSync(path.join(root, 'supabase/deployed/0025_achievement_wallet_share.sql'), 'utf8');
var sqlSeasonal = fs.readFileSync(
  path.join(root, 'supabase/deployed/0028_seasonal_achievement_cards.sql'), 'utf8');
var readme = fs.readFileSync(path.join(root, 'supabase/deployed/README.md'), 'utf8');

assert(/view: 'achievements'/.test(ui) || /view:\s*'achievements'/.test(ui),
  'ui.js TAB_DEFS includes Achievements');
assert(/label: 'Achievements'/.test(ui), 'Achievements tab label present');
assert(/view: 'games'[\s\S]*?view: 'achievements'/.test(ui) ||
  /view:\s*'games'[\s\S]*?view:\s*'achievements'/.test(ui),
  'Achievements tab sits after Games');
assert(/'achievements'/.test(ui) && /VIEWS = \[[^\]]*achievements/.test(ui),
  'VIEWS includes achievements');
assert(/AchievementCards\.start/.test(ui), 'go() boots AchievementCards');
assert(/AchievementCards\.stop/.test(ui), 'leaving Achievements stops polling');
assert(/function openAchievements[\s\S]*?go\('achievements'\)/.test(ui),
  'openAchievements redirects to the tab');

assert(/achievements: '\/achievements'/.test(router), 'router maps /achievements');
assert(/"source": "\/achievements"/.test(vercel), 'vercel rewrite for /achievements');
assert(/id="view-achievements"/.test(html), 'index hosts #view-achievements');
assert(/achievement-cards\.js/.test(html), 'index loads achievement-cards.js');
assert(/achievement-cards\.css/.test(html), 'index loads achievement-cards.css');

assert(/global\.AchievementCards/.test(cards), 'module exports AchievementCards');
assert(/ach_card_send/.test(cards) && /ach_card_list_inbox/.test(cards),
  'client calls ach_card RPCs');
assert(/ach_wallet_share/.test(cards) && /ach_wallet_list/.test(cards),
  'client calls ach_wallet RPCs');
assert(/pvp_lookup_tag/.test(cards), 'send flow reuses gamertag lookup');
assert(/role="button"/.test(cards), 'cards use div role=button (Chromium 3D fix)');
assert(!/<button[^>]*class="achv-card/.test(cards),
  'achievement cards are not native <button> elements');
assert(/is-flipped|rotateY/.test(cards + css), 'flip animation present');
assert(/achv-float|is-floating/.test(css), 'float motion present');
assert(/is-unfolding/.test(css) && /runUnfold|is-unfolding/.test(cards),
  'wallet unfold animation present');
assert(/Share wallet|data-wallet-send|ach_wallet_share/.test(cards),
  'share wallet UI wired');
assert(/achv-stack|achv-card/.test(css), 'card stack styles present');
assert(/translateZ\(1px\)/.test(css), 'faces use translateZ for stacking');
/* LEA-70 — flip stays above peeks; deck switching is reachable */
assert(/is-flipping/.test(css) && /is-flipping/.test(cards),
  'flip raises active card / hides peeks mid-animation');
assert(/transform-style:\s*flat/.test(css), 'stack is flat so peeks do not share 3D space');
assert(/achv-stage__nav|data-prev/.test(cards + css), 'side prev/next chrome present');
assert(/achv-rail|data-rail|goTo|paintDeck/.test(cards + css),
  'rail jump + paintDeck navigation present');
assert(/onSwipeEnd|touchend|ArrowLeft|ArrowRight/.test(cards),
  'swipe and keyboard deck switching present');
/* LEA-71 — award-badge backs keep the wallet; username on the back */
assert(/achv-card__owner|ownerTag|awardBadgeSvg|achv-award/.test(cards),
  'card back shows owner gamertag + award badge SVG');
assert(/achv-card__award-title|achv-card__award-date|achv-award-wrap/.test(cards + css),
  'award title/date layout styles present');
assert(/shape:\s*'rounded'/.test(cards) && /shape:\s*'circle'/.test(cards) &&
  /shape:\s*'hex'/.test(cards) && /shape:\s*'shield'/.test(cards) &&
  /shape:\s*'heart'/.test(cards) && /shape:\s*'diamond'/.test(cards) &&
  /shape:\s*'scallop'/.test(cards) && /shape:\s*'banner'/.test(cards) &&
  /shape:\s*'star'/.test(cards) && /shape:\s*'oval'/.test(cards),
  'ten distinct award shapes (one per achievement)');
assert(/data-award|AWARD_META/.test(cards) && /--achv-back-a/.test(cards + css),
  'per-achievement back atmosphere + data-award uniqueness');
assert(/'first-steps'/.test(cards) && /'globetrotter'/.test(cards) &&
  /'streak-25'/.test(cards) && /'answers-500'/.test(cards),
  'unique award meta keyed by achievement id');
assert(/achv-card__face--back/.test(css) && /achv-stack|is-flipped/.test(css),
  'flip wallet stack retained with restyled back');
assert(!/Brainrot|Pets|screen.?mirror|Stripe\.checkout|vercel --prod/i.test(cards),
  'no Pets/Brainrot/mirroring/live Stripe in achievement-cards.js');
assert(!/Syne|Plus Jakarta/i.test(css), 'keeps original LearnGeo fonts');

assert(/achievement_card_sends/.test(sql), 'SQL creates achievement_card_sends');
assert(/ach_card_send/.test(sql) && /ach_card_respond/.test(sql), 'SQL has send/respond RPCs');
assert(/grant execute[\s\S]*authenticated/.test(sql), 'authenticated execute grants');
assert(/revoke[\s\S]*anon/.test(sql) || /from public, anon/.test(sql),
  'anon cannot execute card RPCs');
assert(/does NOT|does not unlock|not unlock/i.test(sql) ||
  /Accepting adds the card/.test(sql) || /no money/i.test(sql),
  'SQL comments keep share school-safe');

assert(/achievement_wallet_shares/.test(sqlWallet), 'SQL creates achievement_wallet_shares');
assert(/ach_wallet_share/.test(sqlWallet) && /ach_wallet_respond/.test(sqlWallet),
  'SQL has wallet share/respond RPCs');
assert(/grant execute[\s\S]*authenticated/.test(sqlWallet),
  'wallet RPCs granted to authenticated');
assert(/revoke[\s\S]*anon/.test(sqlWallet) || /from public, anon/.test(sqlWallet),
  'anon cannot execute wallet RPCs');
assert(/does NOT|does not unlock|not unlock/i.test(sqlWallet),
  'wallet SQL keeps share school-safe');

assert(/0023_achievement_cards/.test(readme), 'deployed README documents 0023');
assert(/0025_achievement_wallet_share/.test(readme), 'deployed README documents 0025');
assert(/LEA-80/.test(readme) && /LEA-84/.test(readme),
  'deployed README documents Friend inbox LEA-80/84');
assert(/2026-11-achievement-cards/.test(updates), 'updates.json What’s New entry');
assert(/2026-11-achievement-wallet/.test(updates), 'updates.json wallet entry');
assert(/2026-11-achievement-awards/.test(updates), 'updates.json award-back entry');
assert(/2026-11-friend-inbox/.test(updates), 'updates.json Friend inbox entry');
assert(/2026-11-friend-inbox-menu/.test(updates), 'updates.json Friend inbox menu entry');
assert(/2026-11-seasonal-awards/.test(updates), 'updates.json seasonal awards entry');
assert(/2026-11-achievement-cards/.test(updatesJs), 'updates.js seeded entry');
assert(/2026-11-achievement-wallet/.test(updatesJs), 'updates.js wallet seeded entry');
assert(/2026-11-achievement-awards/.test(updatesJs), 'updates.js award-back seeded entry');
assert(/2026-11-friend-inbox/.test(updatesJs), 'updates.js Friend inbox seeded entry');
assert(/2026-11-friend-inbox-menu/.test(updatesJs), 'updates.js Friend inbox menu seeded entry');
assert(/2026-11-seasonal-awards/.test(updatesJs), 'updates.js seasonal awards seeded entry');
assert(!/Pets|Brainrot|screen.?mirror/i.test(
  updates.match(/2026-11-friend-inbox-menu[\s\S]*?\},/)[0]),
  'What’s New Friend inbox menu entry stays public-safe');
assert(!/Pets|Brainrot|screen.?mirror/i.test(
  updates.match(/2026-11-achievement-awards[\s\S]*?\},/)[0]),
  'What’s New award-back entry stays public-safe');
assert(!/Pets|Brainrot|screen.?mirror/i.test(
  updates.match(/2026-11-seasonal-awards[\s\S]*?\},/)[0]),
  'What’s New seasonal entry stays public-safe');

/* LEA-80 / LEA-84 — Friend inbox (cards + wallets + chess) in profile menu */
assert(/openFriendInbox/.test(cards) && /openFriendInbox/.test(ui),
  'Friend inbox opens via AchievementCards + UI');
assert(/friend-inbox/.test(ui) && /Customization[\s\S]*?friend-inbox[\s\S]*?Achievements/.test(ui),
  'Friend inbox sits in profile menu next to Customization');
assert(!/achv-friend-inbox/.test(cards),
  'Friend inbox is not embedded under Achievements layout');
assert(/chessIncoming|chess_duel_respond_invite|data-chess-accept/.test(cards),
  'Friend inbox wires Geo Chess challenges');
assert(/learngeo:chess-duel-inbox/.test(cards), 'Friend inbox listens for chess poll events');
assert(/openChessMatch/.test(games) && /openChessMatch/.test(cards),
  'Accept/rejoin opens Geo Chess via Games.openChessMatch');
assert(/_matchId|matchId/.test(games), 'Games passes matchId into ChessDuel.mount');
assert(/profile menu → Friend inbox|Friend inbox/.test(chessDuel),
  'chess invite toast points at Friend inbox');
assert(/achv-inbox__kind--chess/.test(css), 'Chess kind style in Friend inbox');
assert(!/Stripe|screen.?mirror|vercel --prod/i.test(cards + games + ui),
  'no Stripe / mirroring / vercel --prod in Friend inbox path');

assert(fs.existsSync(path.join(root, 'assets/img/updates/achievement-cards.svg')),
  'What’s New art exists');

/* LEA-74 — seasonal / time-limited awards in the wallet */
assert(/seasonal:\s*true/.test(cosmetics) && /geo-awareness/.test(cosmetics) &&
  /earth-day/.test(cosmetics) && /winter-globe/.test(cosmetics),
  'cosmetics.js lists seasonal challenge achievements');
assert(/seasonInWindow/.test(cosmetics) && /seasonEditionYear/.test(cosmetics),
  'cosmetics exports seasonal window helpers');
assert(/noteSeasonalProgress/.test(core) && /state\.seasonal/.test(core) &&
  /testSeasonal/.test(core),
  'core.js tracks in-window seasonal progress + unlocks');
assert(/walletCatalog|seasonActive|is-seasonal|Challenge · open|Seasonal award/.test(cards),
  'wallet shows seasonal cards with challenge chrome');
assert(/'geo-awareness'/.test(cards) && /'earth-day'/.test(cards) &&
  /motif:\s*'leaf'/.test(cards) && /motif:\s*'snowflake'/.test(cards),
  'seasonal award badge meta + motifs present');
assert(/is-seasonal/.test(css) && /achv-chip--seasonal/.test(css),
  'seasonal card front styles present');
assert(!/Syne|Plus Jakarta/i.test(css), 'LEA-74 keeps original LearnGeo fonts');
assert(/geo-awareness/.test(sqlSeasonal) && /winter-globe/.test(sqlSeasonal) &&
  /ach_card_id_ok/.test(sqlSeasonal),
  '0028 extends ach_card_id_ok for seasonal ids');
assert(/0028_seasonal_achievement_cards/.test(readme),
  'deployed README documents 0028');
assert(/is-flipped|rotateY/.test(cards + css), 'flip cards retained with seasonal awards');

console.log('test_achievement_cards.js: ok');
