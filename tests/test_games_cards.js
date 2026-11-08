/* Node smoke checks for LEA-98 Games hub card chrome. */
var fs = require('fs');
var path = require('path');
var assert = require('assert');

var root = path.join(__dirname, '..');
var games = fs.readFileSync(path.join(root, 'assets/js/games.js'), 'utf8');
var css = fs.readFileSync(path.join(root, 'assets/css/games.css'), 'utf8');
var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

assert(/game-card--cover/.test(games), 'hub cards use cover-led chrome class');
assert(/game-card__media/.test(games), 'hub cards wrap art in media well');
assert(/game-card__title/.test(games), 'hub cards keep accessible title');
assert(/game-card__blurb/.test(games), 'hub cards mark blurb for clamp');
assert(/src="assets\/img\/games\/' \+ thumb/.test(games),
  'thumbs still load from assets/img/games');
assert(/width="161" height="74"/.test(games), 'thumb intrinsic size matches sheet crops');
assert(!/assets\/img\/games\/[a-z]+\.svg/.test(games), 'no SVG remakes for hub thumbs');

assert(/assets\/css\/games\.css/.test(html), 'index loads games.css');
assert(/aspect-ratio:\s*161\s*\/\s*74/.test(css), 'art frame matches LEA-91 crop ratio');
assert(/image-rendering:\s*crisp-edges/.test(css), 'crisp pixel scaling for sheet crops');
assert(/-webkit-line-clamp:\s*2/.test(css), 'blurb clamped to two lines');
assert(/translateY\(-5px\)|translateY\(-4px\)/.test(css), 'hover lift motion');
assert(/game-card__title[\s\S]{0,200}clip:\s*rect\(0,\s*0,\s*0,\s*0\)/.test(css),
  'duplicate cover title is visually hidden');

console.log('test_games_cards.js: ok');
