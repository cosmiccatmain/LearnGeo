/* Node unit checks for ChessElo math (no browser). Run: node tests/test_chess_elo.js */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var src = fs.readFileSync(path.join(__dirname, '../assets/js/chess-elo.js'), 'utf8');
var sandbox = { window: {}, console: console };
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
var Elo = sandbox.window.ChessElo;

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
}

assert(Elo.START === 1000, 'start Elo');
assert(Elo.K === 32, 'K-factor');
assert(Elo.BOT[1] === 600 && Elo.BOT[6] === 3190, 'bot ladder');

var even = Elo.next(1000, 1000, 'win');
assert(even.elo === 1016, 'even win → +16, got ' + even.elo);
assert(even.delta === 16, 'even win delta');

var draw = Elo.next(1000, 1000, 'draw');
assert(draw.elo === 1000 && draw.delta === 0, 'even draw');

var loss = Elo.next(1000, 1000, 'loss');
assert(loss.elo === 984 && loss.delta === -16, 'even loss → -16');

var upset = Elo.next(1000, 1400, 'win');
assert(upset.delta > 16, 'upset win gains more than even, got ' + upset.delta);

var expected = Elo.expected(1000, 1000);
assert(Math.abs(expected - 0.5) < 1e-9, 'expected vs equal');

/* LEA-68 legacy win → Elo seed */
assert(typeof Elo.seedEloFromCounts === 'function', 'seed helper');
assert(Elo.seedEloFromCounts(0, 0, 0) === 1000, 'empty seed stays 1000');
assert(Elo.seedEloFromCounts(1, 0, 0) === 1024, 'one win → +24');
assert(Elo.seedEloFromCounts(0, 0, 1) === 984, 'one loss → −16');
assert(Elo.seedEloFromCounts(0, 1, 0) === 1008, 'one draw → +8');
assert(Elo.seedEloFromCounts(100, 0, 0) === 2000, 'seed capped at 2000');

console.log('test_chess_elo.js: ok');
