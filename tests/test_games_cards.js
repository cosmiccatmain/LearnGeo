/* Node smoke checks for Games hub card chrome + LEA-136 vibrant covers. */
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
assert(/\.svg" alt="" width="644" height="296"/.test(games),
  'thumbs are SVG covers at 644×296');
assert(/games--hub/.test(games), 'hub wrapper carries the vibrant chrome class');
assert(!/\.png" alt="" width="161" height="74"/.test(games),
  'legacy LEA-91 PNG crop wiring is gone');

assert(/assets\/css\/games\.css/.test(html), 'index loads games.css');
assert(/#7B3CFF/.test(css), 'hub chrome uses the shared violet');
assert(/#FF3D6E/.test(css), 'hub chrome uses the shared coral');
assert(/#FFF6EA/.test(css), 'hub chrome uses the shared paper');
assert(/aspect-ratio:\s*644\s*\/\s*296/.test(css), 'art frame matches SVG cover ratio');
assert(/image-rendering:\s*auto/.test(css), 'smooth scaling for vector covers');
assert(/-webkit-line-clamp:\s*2/.test(css), 'blurb clamped to two lines');
assert(/game-card--cover:hover[\s\S]{0,80}transform:\s*none/.test(css), 'hub cards stay flat on hover');
assert(/game-card__title[\s\S]{0,200}clip:\s*rect\(0,\s*0,\s*0,\s*0\)/.test(css),
  'duplicate cover title is visually hidden');

var ids = ['duel', 'chess', 'dash', 'orbit', 'snake', 'golf', 'invaders',
  'breakout', 'maze', 'typer', 'crossing', 'whack', 'match', 'sort', 'stack', 'echo'];
ids.forEach(function (id) {
  var svg = path.join(root, 'assets/img/games', id + '.svg');
  assert(fs.existsSync(svg), 'missing hub cover ' + id + '.svg');
  assert(!fs.existsSync(path.join(root, 'assets/img/games', id + '.png')),
    'legacy crop PNG must be removed for ' + id);
  var body = fs.readFileSync(svg, 'utf8');
  assert(/LEA-136/.test(body), id + '.svg should be marked LEA-136');
  assert(/viewBox="0 0 644 296"/.test(body), id + '.svg viewBox should be 644×296');
  assert(/#FF3D6E/.test(body) || /#7B3CFF/.test(body) || /#C8F542/.test(body) || /#19D3FF/.test(body) || /#FFB703/.test(body) || /#FF2EC8/.test(body),
    id + '.svg should use the shared vibrant palette');
  assert(/font-family="Inter/.test(body), id + '.svg title should be Inter');
  assert(/JetBrains Mono/.test(body), id + '.svg kicker should be JetBrains Mono');
  assert(!/Georgia|Liberation Serif|Instrument Serif|Noto Serif/.test(body),
    id + '.svg should not use a serif face');
  assert(!/LEA-132|LEA-133|LEA-134/.test(body), id + '.svg should not keep the muted editorial plate');
});

console.log('test_games_cards.js: ok');
