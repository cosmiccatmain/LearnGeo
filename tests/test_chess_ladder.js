/* Node smoke checks for LEA-76 weekly Elo ladder + rematch (no browser). */
'use strict';
var fs = require('fs');
var path = require('path');
var assert = require('assert');

var root = path.join(__dirname, '..');
var eloSrc = fs.readFileSync(path.join(root, 'assets/js/chess-elo.js'), 'utf8');
var duel = fs.readFileSync(path.join(root, 'assets/js/game-chess-duel.js'), 'utf8');
var games = fs.readFileSync(path.join(root, 'assets/js/games.js'), 'utf8');
var sql = fs.readFileSync(path.join(root, 'supabase/deployed/0030_chess_weekly_ladder.sql'), 'utf8');
var updates = fs.readFileSync(path.join(root, 'assets/data/updates.json'), 'utf8');
var css = fs.readFileSync(path.join(root, 'assets/css/arcade.css'), 'utf8');

/* SQL surface */
assert(/chess_weekly_ladder/.test(sql), 'SQL defines chess_weekly_ladder');
assert(/chess_duel_last_opponent/.test(sql), 'SQL defines chess_duel_last_opponent');
assert(/week_key/.test(sql) && /week_base/.test(sql) && /week_games/.test(sql), 'weekly columns');
assert(/chess_elo_roll_week/.test(sql), 'week roll helper');
assert(/IYYY-"W"IW/.test(sql) || /IYYY-\\"W\\"IW/.test(sql) || /IYYY-"W"IW/.test(sql), 'ISO week key');

/* Client Elo helpers */
var vm = require('vm');
var sandbox = { window: {}, console: console };
vm.runInNewContext(eloSrc, sandbox);
var Elo = sandbox.window.ChessElo;
assert(typeof Elo.weeklyLadder === 'function', 'weeklyLadder helper');
assert(typeof Elo.lastOpponent === 'function', 'lastOpponent helper');
assert(typeof Elo.rememberLastOpponent === 'function', 'rememberLastOpponent');
assert(typeof Elo.weekKey === 'function', 'weekKey');
assert(/^\d{4}-W\d{2}$/.test(Elo.weekKey(new Date('2026-11-07T12:00:00Z'))), 'weekKey format');
assert(Elo.fmtWeekDelta(16) === '+16', 'fmtWeekDelta +');
assert(Elo.fmtWeekDelta(-8) === '-8', 'fmtWeekDelta -');

/* Geo Chess PvP UI (no separate Chess Duel) */
assert(/This week.s Elo ladder|This week’s Elo ladder/.test(duel), 'lobby shows weekly ladder');
assert(/data-cduel-rematch/.test(duel), 'rematch controls');
assert(/Rematch/.test(duel), 'Rematch copy');
assert(/data-cduel-ladder/.test(duel), 'ladder host');
assert(!/id: 'chessduel'[\s\S]{0,40}title:/.test(games), 'still no Chess Duel hub entry');
assert(/weekly ladder|Rematch/.test(games), 'Geo Chess setup mentions ladder/rematch');

/* What’s New + styles */
assert(/2026-11-geo-chess-ladder/.test(updates), 'What’s New id');
assert(/geo-chess-ladder\.svg/.test(updates), 'What’s New image');
assert(fs.existsSync(path.join(root, 'assets/img/updates/geo-chess-ladder.svg')), 'ladder SVG exists');
assert(/chess-ladder__list/.test(css), 'ladder CSS');
assert(/duel-note--rematch/.test(css), 'rematch CSS');

console.log('test_chess_ladder.js: ok');
