/* LEA-126: Geo Duel must not rebuild the live question on every poll.
   A full innerHTML swap replayed the card entrance, dropped clicks,
   and stacked keydown listeners. Lobby circles had the same problem:
   the float restarted every presence poll.

   Browser half uses headless Chrome when it is installed.
   Run: node --test tests/test_duel_stable.js
*/
'use strict';

var assert = require('node:assert/strict');
var child = require('node:child_process');
var fs = require('node:fs');
var http = require('node:http');
var os = require('node:os');
var path = require('node:path');
var test = require('node:test').test;

var root = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function sliceFn(src, name, nextName) {
  var start = src.indexOf('function ' + name);
  var end = nextName ? src.indexOf('function ' + nextName, start + 1) : src.length;
  assert.ok(start >= 0, name + ' exists');
  return src.slice(start, end === -1 ? src.length : end);
}

test('live duel does not rebuild the question or stack keys on each poll', function () {
  var duel = read('assets/js/game-duel.js');
  var lobby = read('assets/js/lobby-circles.js');

  assert.equal(/roundStartedLocal/.test(duel), false, 'answer speed uses the server round clock');
  assert.match(duel, /function parseTs/);
  assert.match(duel, /function elapsedAnswerMs/);
  assert.match(duel, /refreshGen/);
  assert.match(duel, /paintedSig/);
  assert.match(duel, /inboxSignature/);
  assert.match(duel, /data-duel-q/);
  assert.match(duel, /data-duel-status/);
  assert.match(duel, /current_round < prevRound/);

  var paintRound = sliceFn(duel, 'paintRound()', 'onKey');
  assert.doesNotMatch(paintRound, /addEventListener\(\s*'keydown'/);
  assert.equal((duel.match(/addEventListener\(\s*'keydown'/g) || []).length, 1);
  assert.match(duel, /removeEventListener\(\s*'keydown'/);

  assert.match(lobby, /function peopleSig/);
  assert.match(lobby, /skySig/);
  assert.match(lobby, /sig === skySig && sky\.querySelector\('\.lobby-circle'\)/);
});

function chromeBin() {
  var list = [
    process.env.CHROME,
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/local/bin/google-chrome'
  ];
  for (var i = 0; i < list.length; i++) {
    if (list[i] && fs.existsSync(list[i])) return list[i];
  }
  return '';
}

function serve(dir) {
  return new Promise(function (resolve) {
    var server = http.createServer(function (req, res) {
      var url = (req.url || '/').split('?')[0];
      var file = path.join(dir, decodeURIComponent(url));
      if (!file.startsWith(dir)) {
        res.writeHead(403);
        res.end('no');
        return;
      }
      fs.readFile(file, function (err, buf) {
        if (err) {
          res.writeHead(404);
          res.end('missing');
          return;
        }
        var ext = path.extname(file);
        var type = ext === '.html' ? 'text/html'
          : ext === '.js' ? 'text/javascript'
          : ext === '.css' ? 'text/css'
          : ext === '.svg' ? 'image/svg+xml'
          : 'application/octet-stream';
        res.writeHead(200, { 'content-type': type });
        res.end(buf);
      });
    });
    server.listen(0, '127.0.0.1', function () {
      resolve({ server: server, port: server.address().port });
    });
  });
}

function dumpDom(chrome, url) {
  return new Promise(function (resolve, reject) {
    var proc = child.spawn(chrome, [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--virtual-time-budget=7000',
      '--timeout=20000',
      '--dump-dom',
      url
    ]);
    var stdout = '';
    var stderr = '';
    proc.stdout.on('data', function (d) { stdout += d; });
    proc.stderr.on('data', function (d) { stderr += d; });
    var timer = setTimeout(function () { proc.kill('SIGKILL'); }, 25000);
    proc.on('close', function (code) {
      clearTimeout(timer);
      if (!stdout) reject(new Error(stderr.slice(-500) || ('chrome exit ' + code)));
      else resolve(stdout);
    });
  });
}

function duelPage() {
  return '<!doctype html><html><head><meta charset="utf-8">' +
    '<link rel="stylesheet" href="/assets/css/app.css">' +
    '<link rel="stylesheet" href="/assets/css/motion.css">' +
    '<link rel="stylesheet" href="/assets/css/arcade.css">' +
    '</head><body>' +
    '<div class="portal__inner games games--play">' +
      '<div class="games__playbar"><span class="games__back">Geo Duel</span>' +
      '<span class="t-sm t-muted">PvP duel</span></div>' +
      '<div class="games__stage" id="games-stage"></div></div>' +
    '<script src="/assets/js/core.js"></script>' +
    '<script src="/tests/duel-stable-page.js"></script>' +
    '<script src="/assets/js/game-duel.js"></script>' +
    '<script>window.__bootDuel && window.__bootDuel();</script>' +
    '</body></html>';
}

function lobbyPage() {
  return '<!doctype html><html><head><meta charset="utf-8">' +
    '<link rel="stylesheet" href="/assets/css/app.css">' +
    '<link rel="stylesheet" href="/assets/css/arcade.css">' +
    '</head><body><div id="host"></div>' +
    '<script src="/assets/js/core.js"></script>' +
    '<script src="/tests/duel-stable-page.js"></script>' +
    '<script src="/assets/js/lobby-circles.js"></script>' +
    '<script>window.__bootLobby && window.__bootLobby();</script>' +
    '</body></html>';
}

test('question node and lobby circle survive unchanged polls', { skip: !chromeBin() && 'chrome not installed' }, async function () {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duel-stable-'));
  fs.mkdirSync(path.join(dir, 'tests'));
  fs.writeFileSync(path.join(dir, 'tests', 'duel.html'), duelPage());
  fs.writeFileSync(path.join(dir, 'tests', 'lobby.html'), lobbyPage());
  fs.copyFileSync(path.join(root, 'tools', 'duel-stable-page.js'), path.join(dir, 'tests', 'duel-stable-page.js'));
  fs.symlinkSync(path.join(root, 'assets'), path.join(dir, 'assets'));

  var running = await serve(dir);
  try {
    var duelDom = await dumpDom(chromeBin(), 'http://127.0.0.1:' + running.port + '/tests/duel.html');
    var duel = duelDom.match(/id="duel-probe"[^>]*>([^<]*)</);
    assert.ok(duel, 'duel probe missing:\n' + duelDom.slice(0, 500));
    var report = JSON.parse(duel[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
    assert.equal(report.jumps, 1, 'question DOM rebuilt more than the one real round change: ' + JSON.stringify(report));
    assert.equal(report.prompt, 'What is the capital of Japan?');
    assert.ok(report.timers.length >= 2, 'round clock did not tick in place');
    assert.notEqual(report.timers[0], report.timers[report.timers.length - 1]);
    assert.equal(report.submits, 1, 'one keypress should submit once');
    assert.equal(report.cards, 1);

    var lobbyDom = await dumpDom(chromeBin(), 'http://127.0.0.1:' + running.port + '/tests/lobby.html');
    var lobby = lobbyDom.match(/id="lobby-probe"[^>]*>([^<]*)</);
    assert.ok(lobby, 'lobby probe missing');
    var lobbyReport = JSON.parse(lobby[1].replace(/&quot;/g, '"'));
    assert.equal(lobbyReport.jumps, 0, 'lobby circles were recreated: ' + JSON.stringify(lobbyReport));
  } finally {
    running.server.close();
  }
});
