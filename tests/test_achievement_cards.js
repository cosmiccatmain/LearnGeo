/* Node smoke checks for LEA-64 Achievement cards (no browser). */
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
var sql = fs.readFileSync(path.join(root, 'supabase/deployed/0023_achievement_cards.sql'), 'utf8');
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
assert(/pvp_lookup_tag/.test(cards), 'send flow reuses gamertag lookup');
assert(/is-flipped|rotateY/.test(cards + css), 'flip animation present');
assert(/achv-stack|achv-card/.test(css), 'card stack styles present');
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

assert(/0023_achievement_cards/.test(readme), 'deployed README documents 0023');
assert(/2026-11-achievement-cards/.test(updates), 'updates.json What’s New entry');
assert(/2026-11-achievement-cards/.test(updatesJs), 'updates.js seeded entry');
assert(!/Pets|Brainrot|screen.?mirror/i.test(
  updates.match(/2026-11-achievement-cards[\s\S]*?\},/)[0]),
  'What’s New entry stays public-safe');

assert(fs.existsSync(path.join(root, 'assets/img/updates/achievement-cards.svg')),
  'What’s New art exists');

console.log('test_achievement_cards.js: ok');
