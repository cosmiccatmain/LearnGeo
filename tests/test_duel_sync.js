/* Two-player Geo Duel lifecycle, plus a Chess Duel smoke check.
   The mock server is in-process. It is not the live database.
   Run: node --test tests/test_duel_sync.js
   Browser cases need Google Chrome and puppeteer-core
   (npm install --prefix /tmp/duel-test-deps puppeteer-core).
   The source-guard test does not.
*/
'use strict';

var assert = require('node:assert/strict');
var fs = require('node:fs');
var http = require('node:http');
var path = require('node:path');
var test = require('node:test').test;
var describe = require('node:test').describe;

var root = path.join(__dirname, '..');
var HOST = 'hostdev000001';
var GUEST = 'guestdev00001';
var HOST_TAG = 'DuelHost';
var GUEST_TAG = 'DuelGuest';
var START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

test('duel sync source guards', function () {
  var duel = read('assets/js/game-duel.js');
  var chess = read('assets/js/game-chess-duel.js');
  var sql = read('supabase/deployed/0025_pvp_duel_round_sync.sql');
  var readme = read('supabase/deployed/README.md');

  assert.equal(/roundStartedLocal/.test(duel), false, 'speed no longer uses a per-client render clock');
  assert.match(duel, /parseTs/);
  assert.match(duel, /refreshGen/);
  assert.match(duel, /round_remaining_ms/);
  assert.match(duel, /data-duel-closed/);
  assert.match(duel, /data-busy/);
  assert.match(duel, /data-duel-seeding/);
  assert.match(duel, /rec\.kind = next/);

  assert.match(chess, /refreshGen/);
  assert.match(chess, /paintedBoard/);
  assert.match(chess, /data-cduel-closed/);
  assert.match(chess, /data-busy/);
  assert.match(chess, /prevDetails\.open/);

  assert.match(sql, /NOT APPLIED/);
  assert.match(sql, /m\.status in \('seeding', 'active'\)/);
  assert.match(sql, /interval '18 seconds'/);
  assert.match(sql, /now\(\) - m\.round_started_at/);
  assert.match(sql, /server_now/);
  assert.match(sql, /round_remaining_ms/);
  assert.equal(/to anon/.test(sql), false, '0025 must not grant anon');
  assert.match(readme, /0025_pvp_duel_round_sync\.sql/);
  assert.match(readme, /NOT applied/);
});

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function createMock() {
  var seq = 1;
  var tags = new Map();
  var invites = [];
  var matches = [];
  var chessInvites = [];
  var chessMatches = [];
  var calls = [];
  var maskUsed = false;
  var cfg = { skewMs: 0, sendClock: false, forceRemainingMs: null, fail: null, maskMs: 4000 };
  var chain = Promise.resolve();

  function uid() {
    seq += 1;
    return '00000000-0000-4000-8000-' + String(seq).padStart(12, '0');
  }
  function serverNow() { return Date.now() + (cfg.skewMs || 0); }
  function iso(ms) { return new Date(ms).toISOString(); }
  function tagOf(device) { return tags.get(device) || ''; }
  function findTag(name) {
    var key = String(name || '').toLowerCase();
    var found = null;
    tags.forEach(function (tag, device) {
      if (tag.toLowerCase() === key) found = { device: device, tag: tag };
    });
    return found;
  }
  function logCall(name, args, extra) {
    var copy = Object.assign({}, args || {});
    if (Array.isArray(copy.p_rounds)) copy.p_rounds = { n: copy.p_rounds.length };
    calls.push(Object.assign({ name: name, args: copy, at: Date.now() }, extra || {}));
  }
  function timedOut(m) {
    return !!(m.round_started_at && (serverNow() - m.round_started_at) >= 18000);
  }
  function resolveRound(m) {
    if (m.status !== 'active') return;
    if ((m.host_choice == null || m.guest_choice == null) && !timedOut(m)) return;
    var round = m.rounds[m.current_round] || {};
    var correct = round.correct_idx;
    var hostOk = m.host_choice != null && m.host_choice === correct;
    var guestOk = m.guest_choice != null && m.guest_choice === correct;
    var winner = 'none';
    if (hostOk && guestOk) {
      var hm = m.host_ms == null ? 999999 : m.host_ms;
      var gm = m.guest_ms == null ? 999999 : m.guest_ms;
      if (hm < gm) winner = 'host';
      else if (gm < hm) winner = 'guest';
      else winner = 'draw';
    } else if (hostOk) winner = 'host';
    else if (guestOk) winner = 'guest';
    if (winner === 'host') m.host_score += 1;
    else if (winner === 'guest') m.guest_score += 1;
    m.round_results.push({
      round: m.current_round,
      winner: winner,
      host_ok: hostOk,
      guest_ok: guestOk,
      host_ms: m.host_ms,
      guest_ms: m.guest_ms
    });
    var next = m.current_round + 1;
    if (next >= m.round_count) {
      m.status = 'finished';
      if (m.host_score > m.guest_score) m.winner_device = m.host_device;
      else if (m.guest_score > m.host_score) m.winner_device = m.guest_device;
      else m.winner_device = null;
    } else {
      m.current_round = next;
      m.host_choice = null;
      m.guest_choice = null;
      m.host_ms = null;
      m.guest_ms = null;
      m.round_started_at = serverNow();
    }
    m.updated_at = serverNow();
  }
  function publicRound(r, reveal) {
    if (!r) return null;
    return {
      type: r.type,
      country: r.country,
      prompt: r.prompt,
      subject: r.subject,
      sub: r.sub || '',
      flag: r.flag || null,
      flag_choices: !!r.flag_choices,
      choices: r.choices || [],
      correct_idx: reveal ? r.correct_idx : null
    };
  }
  function geoView(m, device) {
    var role = m.host_device === device ? 'host' : 'guest';
    if (role === 'guest' && m.status === 'active' && m.maskGuestUntil && Date.now() < m.maskGuestUntil) {
      return {
        ok: true,
        id: m.id,
        status: 'seeding',
        role: 'guest',
        kind: m.kind,
        host_tag: tagOf(m.host_device),
        guest_tag: tagOf(m.guest_device),
        host_score: m.host_score,
        guest_score: m.guest_score,
        current_round: 0,
        round_count: m.round_count,
        round: null,
        rounds: [],
        round_results: [],
        answered_me: false,
        answered_them: false,
        round_started_at: null,
        round_seconds: 18,
        updated_at: iso(m.updated_at)
      };
    }
    if (m.status === 'active' && timedOut(m)) resolveRound(m);
    var rounds = [];
    for (var i = 0; i < (m.rounds || []).length; i++) {
      var reveal = m.status === 'finished' || i < m.current_round;
      rounds.push(publicRound(m.rounds[i], reveal));
    }
    var answeredMe = role === 'host' ? m.host_choice != null : m.guest_choice != null;
    var answeredThem = role === 'host' ? m.guest_choice != null : m.host_choice != null;
    var view = {
      ok: true,
      id: m.id,
      status: m.status,
      role: role,
      kind: m.kind,
      host_tag: tagOf(m.host_device),
      guest_tag: tagOf(m.guest_device),
      host_score: m.host_score,
      guest_score: m.guest_score,
      current_round: m.current_round,
      round_count: m.round_count,
      round: rounds[m.current_round] || null,
      rounds: rounds,
      round_results: m.round_results,
      answered_me: answeredMe,
      answered_them: answeredThem,
      round_started_at: m.round_started_at ? iso(m.round_started_at) : null,
      round_seconds: 18,
      winner_tag: m.winner_device ? tagOf(m.winner_device) : null,
      i_won: !!(m.winner_device && m.winner_device === device),
      draw: m.status === 'finished' && !m.winner_device,
      updated_at: iso(m.updated_at)
    };
    if (cfg.sendClock) {
      view.server_now = iso(serverNow());
      if (m.status === 'active' && m.round_started_at) {
        view.round_remaining_ms = Math.max(0, 18000 - (serverNow() - m.round_started_at));
      }
      if (cfg.forceRemainingMs != null && view.status === 'active') {
        view.round_remaining_ms = cfg.forceRemainingMs;
      }
    }
    return view;
  }
  function activeGeo(device) {
    for (var i = matches.length - 1; i >= 0; i--) {
      var m = matches[i];
      if ((m.host_device === device || m.guest_device === device) &&
          (m.status === 'seeding' || m.status === 'active')) return m;
    }
    return null;
  }
  function inbox(device) {
    return {
      ok: true,
      incoming: invites.filter(function (i) { return i.to_device === device && i.status === 'pending'; })
        .map(function (i) {
          return { id: i.id, from_tag: tagOf(i.from_device), to_tag: tagOf(i.to_device), status: i.status };
        }),
      outgoing: invites.filter(function (i) { return i.from_device === device && i.status === 'pending'; })
        .map(function (i) {
          return { id: i.id, from_tag: tagOf(i.from_device), to_tag: tagOf(i.to_device), status: i.status };
        }),
      active: (function () {
        var m = activeGeo(device);
        if (!m) return null;
        return {
          id: m.id,
          status: m.status,
          host_tag: tagOf(m.host_device),
          guest_tag: tagOf(m.guest_device),
          host_score: m.host_score,
          guest_score: m.guest_score,
          current_round: m.current_round,
          round_count: m.round_count,
          kind: m.kind
        };
      })()
    };
  }
  function fenTurn(fen) {
    var parts = String(fen || '').split(' ');
    return parts[1] || 'w';
  }
  function chessView(m, device) {
    var role = m.host_device === device ? 'host' : 'guest';
    var my = role === 'host' ? 'w' : 'b';
    var turn = fenTurn(m.fen);
    return {
      ok: true,
      id: m.id,
      status: m.status,
      role: role,
      my_color: my,
      turn: turn,
      my_turn: m.status === 'active' && turn === my,
      fen: m.fen,
      moves: m.moves,
      last_move: m.last_move,
      host_tag: tagOf(m.host_device),
      guest_tag: tagOf(m.guest_device),
      white_tag: tagOf(m.host_device),
      black_tag: tagOf(m.guest_device),
      opening_eco: null,
      opening_name: null,
      winner_tag: m.winner_device ? tagOf(m.winner_device) : null,
      i_won: !!(m.winner_device && m.winner_device === device),
      draw: m.status === 'finished' && !m.winner_device,
      end_reason: m.end_reason || null,
      updated_at: iso(m.updated_at)
    };
  }
  function activeChess(device) {
    for (var i = chessMatches.length - 1; i >= 0; i--) {
      var m = chessMatches[i];
      if ((m.host_device === device || m.guest_device === device) && m.status === 'active') return m;
    }
    return null;
  }
  function chessInbox(device) {
    var m = activeChess(device);
    return {
      ok: true,
      incoming: chessInvites.filter(function (i) { return i.to_device === device && i.status === 'pending'; })
        .map(function (i) {
          return { id: i.id, from_tag: tagOf(i.from_device), to_tag: tagOf(i.to_device), status: i.status };
        }),
      outgoing: chessInvites.filter(function (i) { return i.from_device === device && i.status === 'pending'; })
        .map(function (i) {
          return { id: i.id, from_tag: tagOf(i.from_device), to_tag: tagOf(i.to_device), status: i.status };
        }),
      active: m ? {
        id: m.id,
        status: m.status,
        host_tag: tagOf(m.host_device),
        guest_tag: tagOf(m.guest_device),
        my_color: m.host_device === device ? 'w' : 'b'
      } : null
    };
  }
  function busyPair(a, b) {
    return matches.some(function (m) {
      return (m.status === 'seeding' || m.status === 'active') &&
        (m.host_device === a || m.guest_device === a || m.host_device === b || m.guest_device === b);
    });
  }

  function handle(name, args) {
    args = args || {};
    var device = args.p_device;
    if (cfg.fail && cfg.fail.name === name && (!cfg.fail.device || cfg.fail.device === device)) {
      cfg.fail = null;
      logCall(name, args, { error: 'offline' });
      return { error: { message: 'boom' } };
    }
    if (name === 'claim_gamertag') {
      tags.set(args.p_device, args.p_tag);
      logCall(name, args);
      return { data: 'ok' };
    }
    if (name === 'pvp_lookup_tag') {
      var row = findTag(args.p_tag);
      logCall(name, args);
      return { data: [{ found: !!row, gamertag: row ? row.tag : null }] };
    }
    if (name === 'pvp_list_inbox') {
      logCall(name, args);
      return { data: inbox(device) };
    }
    if (name === 'pvp_send_invite') {
      if (!tags.has(device)) return { data: { ok: false, error: 'no_gamertag' } };
      var them = findTag(args.p_to_tag);
      if (!them) return { data: { ok: false, error: 'not_found' } };
      if (them.device === device) return { data: { ok: false, error: 'self' } };
      if (busyPair(device, them.device)) return { data: { ok: false, error: 'busy' } };
      var dup = invites.some(function (i) {
        return i.status === 'pending' &&
          ((i.from_device === device && i.to_device === them.device) ||
           (i.from_device === them.device && i.to_device === device));
      });
      if (dup) return { data: { ok: false, error: 'already_pending' } };
      var inv = { id: uid(), from_device: device, to_device: them.device, status: 'pending' };
      invites.push(inv);
      logCall(name, args);
      return { data: { ok: true, invite_id: inv.id, to_tag: them.tag } };
    }
    if (name === 'pvp_cancel_invite') {
      var c = invites.find(function (i) { return i.id === args.p_invite && i.from_device === device; });
      if (!c || c.status !== 'pending') return { data: { ok: false, error: 'not_found' } };
      c.status = 'cancelled';
      logCall(name, args);
      return { data: { ok: true } };
    }
    if (name === 'pvp_respond_invite') {
      var inv2 = invites.find(function (i) { return i.id === args.p_invite; });
      if (!inv2) return { data: { ok: false, error: 'not_found' } };
      if (inv2.to_device !== device) return { data: { ok: false, error: 'forbidden' } };
      if (inv2.status !== 'pending') return { data: { ok: false, error: 'gone' } };
      if (!args.p_accept) {
        inv2.status = 'declined';
        logCall(name, args);
        return { data: { ok: true, status: 'declined' } };
      }
      if (busyPair(inv2.from_device, inv2.to_device)) return { data: { ok: false, error: 'busy' } };
      var m = {
        id: uid(),
        host_device: inv2.from_device,
        guest_device: inv2.to_device,
        status: 'seeding',
        kind: 'mix',
        rounds: [],
        round_count: 5,
        current_round: 0,
        host_score: 0,
        guest_score: 0,
        host_choice: null,
        guest_choice: null,
        host_ms: null,
        guest_ms: null,
        round_started_at: null,
        first_started: null,
        round_results: [],
        winner_device: null,
        maskGuestUntil: 0,
        updated_at: serverNow()
      };
      matches.push(m);
      inv2.status = 'accepted';
      inv2.match_id = m.id;
      logCall(name, args);
      return { data: { ok: true, status: 'accepted', match_id: m.id, host_tag: tagOf(m.host_device), guest_tag: tagOf(m.guest_device) } };
    }
    if (name === 'pvp_seed_match') {
      var sm = matches.find(function (x) { return x.id === args.p_match; });
      if (!sm) return { data: { ok: false, error: 'not_found' } };
      if (sm.host_device !== device) return { data: { ok: false, error: 'forbidden' } };
      if (sm.status !== 'seeding') return { data: { ok: false, error: 'started' } };
      sm.rounds = args.p_rounds || [];
      sm.round_count = sm.rounds.length;
      sm.kind = args.p_kind || 'mix';
      sm.status = 'active';
      sm.round_started_at = serverNow();
      sm.first_started = sm.round_started_at;
      sm.updated_at = serverNow();
      if (!maskUsed) {
        maskUsed = true;
        sm.maskGuestUntil = Date.now() + (cfg.maskMs || 0);
      }
      logCall(name, args);
      return { data: { ok: true, status: 'active', round_count: sm.round_count } };
    }
    if (name === 'pvp_match_state') {
      var mm = matches.find(function (x) { return x.id === args.p_match; });
      if (!mm) return { data: { ok: false, error: 'not_found' } };
      if (mm.host_device !== device && mm.guest_device !== device) return { data: { ok: false, error: 'forbidden' } };
      logCall(name, args);
      return { data: geoView(mm, device) };
    }
    if (name === 'pvp_submit_answer') {
      var am = matches.find(function (x) { return x.id === args.p_match; });
      if (!am) return { data: { ok: false, error: 'not_found' } };
      if (am.status !== 'active') return { data: { ok: false, error: 'not_active' } };
      if (timedOut(am)) {
        resolveRound(am);
        logCall(name, args, { note: 'timeout' });
        return { data: { ok: true, resolved: true } };
      }
      if (args.p_round !== am.current_round) return { data: { ok: false, error: 'wrong_round' } };
      var isHost = am.host_device === device;
      if (isHost) {
        if (am.host_choice != null) return { data: { ok: false, error: 'already' } };
        am.host_choice = args.p_choice;
        am.host_ms = args.p_ms;
      } else {
        if (am.guest_choice != null) return { data: { ok: false, error: 'already' } };
        am.guest_choice = args.p_choice;
        am.guest_ms = args.p_ms;
      }
      am.updated_at = serverNow();
      resolveRound(am);
      logCall(name, args);
      return { data: { ok: true } };
    }
    if (name === 'pvp_forfeit_match') {
      var fm = matches.find(function (x) { return x.id === args.p_match; });
      if (!fm) return { data: { ok: false, error: 'not_found' } };
      if (fm.status === 'seeding' || fm.status === 'active') {
        fm.status = 'finished';
        fm.winner_device = fm.host_device === device ? fm.guest_device : fm.host_device;
        fm.updated_at = serverNow();
      }
      logCall(name, args);
      return { data: { ok: true, status: 'finished' } };
    }
    if (name === 'chess_duel_list_inbox') {
      logCall(name, args);
      return { data: chessInbox(device) };
    }
    if (name === 'chess_duel_send_invite') {
      if (!tags.has(device)) return { data: { ok: false, error: 'no_gamertag' } };
      var cthem = findTag(args.p_to_tag);
      if (!cthem) return { data: { ok: false, error: 'not_found' } };
      if (cthem.device === device) return { data: { ok: false, error: 'self' } };
      if (activeChess(device) || activeChess(cthem.device)) return { data: { ok: false, error: 'busy' } };
      var cinv = { id: uid(), from_device: device, to_device: cthem.device, status: 'pending' };
      chessInvites.push(cinv);
      logCall(name, args);
      return { data: { ok: true, invite_id: cinv.id, to_tag: cthem.tag } };
    }
    if (name === 'chess_duel_respond_invite') {
      var ci = chessInvites.find(function (i) { return i.id === args.p_invite; });
      if (!ci || ci.status !== 'pending' || ci.to_device !== device) {
        return { data: { ok: false, error: ci ? 'gone' : 'not_found' } };
      }
      if (!args.p_accept) {
        ci.status = 'declined';
        logCall(name, args);
        return { data: { ok: true, status: 'declined' } };
      }
      var cm = {
        id: uid(),
        host_device: ci.from_device,
        guest_device: ci.to_device,
        status: 'active',
        fen: START_FEN,
        moves: [],
        last_move: null,
        winner_device: null,
        end_reason: null,
        updated_at: serverNow()
      };
      chessMatches.push(cm);
      ci.status = 'accepted';
      logCall(name, args);
      return { data: { ok: true, match_id: cm.id } };
    }
    if (name === 'chess_duel_match_state') {
      var cms = chessMatches.find(function (x) { return x.id === args.p_match; });
      if (!cms) return { data: { ok: false, error: 'not_found' } };
      logCall(name, args);
      return { data: chessView(cms, device) };
    }
    if (name === 'chess_duel_submit_move') {
      var mv = chessMatches.find(function (x) { return x.id === args.p_match; });
      if (!mv) return { data: { ok: false, error: 'not_found' } };
      if (mv.status !== 'active') return { data: { ok: false, error: 'not_active' } };
      var my = mv.host_device === device ? 'w' : 'b';
      if (fenTurn(mv.fen) !== my) return { data: { ok: false, error: 'not_your_turn' } };
      if (args.p_fen_before && args.p_fen_before !== mv.fen) return { data: { ok: false, error: 'stale' } };
      mv.fen = args.p_fen_after;
      mv.last_move = { from: args.p_from, to: args.p_to, san: args.p_san };
      mv.moves.push(mv.last_move);
      mv.updated_at = serverNow();
      if (args.p_end_reason) {
        mv.status = 'finished';
        mv.end_reason = args.p_end_reason;
        if (args.p_end_reason === 'checkmate') mv.winner_device = device;
      }
      logCall(name, args);
      return { data: chessView(mv, device) };
    }
    logCall(name, args, { error: 'unknown' });
    return { data: { ok: false, error: 'unknown' } };
  }

  function serialized(fn) {
    var run = chain.then(fn, fn);
    chain = run.then(function () {}, function () {});
    return run;
  }

  var server = http.createServer(function (req, res) {
    var url = new URL(req.url, 'http://127.0.0.1');
    if (req.method === 'POST' && (url.pathname === '/mock/rpc' || url.pathname === '/mock/config' || url.pathname === '/mock/cancel')) {
      var body = '';
      req.on('data', function (c) { body += c; });
      req.on('end', function () {
        var json = {};
        try { json = body ? JSON.parse(body) : {}; } catch (e) { json = {}; }
        if (url.pathname === '/mock/config') {
          if ('skewMs' in json) cfg.skewMs = json.skewMs;
          if ('sendClock' in json) cfg.sendClock = !!json.sendClock;
          if ('forceRemainingMs' in json) cfg.forceRemainingMs = json.forceRemainingMs;
          if ('fail' in json) cfg.fail = json.fail;
          if ('maskMs' in json) cfg.maskMs = json.maskMs;
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
          return;
        }
        if (url.pathname === '/mock/cancel') {
          var active = null;
          for (var i = matches.length - 1; i >= 0; i--) {
            if (matches[i].status === 'seeding' || matches[i].status === 'active') active = matches[i];
          }
          if (active) {
            active.status = 'cancelled';
            active.updated_at = serverNow();
          }
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ ok: !!active }));
          return;
        }
        serialized(function () { return handle(json.name, json.args); }).then(function (payload) {
          res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
          res.end(JSON.stringify(payload));
        }, function (err) {
          res.writeHead(500, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: { message: String(err && err.message || err) } }));
        });
      });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/mock/calls') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(calls));
      return;
    }
    if (req.method === 'GET' && url.pathname === '/mock/debug') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        geo: matches.map(function (m) {
          return {
            id: m.id,
            status: m.status,
            kind: m.kind,
            current_round: m.current_round,
            host_score: m.host_score,
            guest_score: m.guest_score,
            first_started: m.first_started,
            round_started_at: m.round_started_at,
            host_ms: m.host_ms,
            guest_ms: m.guest_ms
          };
        })
      }));
      return;
    }
    var rel = decodeURIComponent(url.pathname);
    if (rel.includes('..')) {
      res.writeHead(403); res.end('no'); return;
    }
    var file = path.join(root, rel);
    if (!file.startsWith(root)) { res.writeHead(403); res.end('no'); return; }
    fs.readFile(file, function (err, buf) {
      if (err) { res.writeHead(404); res.end('missing ' + rel); return; }
      var type = 'text/plain; charset=utf-8';
      if (file.endsWith('.html')) type = 'text/html; charset=utf-8';
      else if (file.endsWith('.js')) type = 'text/javascript; charset=utf-8';
      else if (file.endsWith('.css')) type = 'text/css; charset=utf-8';
      res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
      res.end(buf);
    });
  });

  return {
    server: server,
    calls: function () { return calls; },
    listen: function () {
      return new Promise(function (resolve) {
        server.listen(0, '127.0.0.1', function () { resolve(server.address().port); });
      });
    },
    close: function () {
      return new Promise(function (resolve) { server.close(function () { resolve(); }); });
    }
  };
}

function loadPuppeteer() {
  try { return require('puppeteer-core'); } catch (e) { /* optional install */ }
  try { return require('/tmp/duel-test-deps/node_modules/puppeteer-core'); } catch (e2) { return null; }
}

function harden(page) {
  var waitForFunction = page.waitForFunction.bind(page);
  page.waitForFunction = function (fn, options) {
    var rest = Array.prototype.slice.call(arguments, 2);
    var opts = Object.assign({ polling: 100, timeout: 15000 }, options || {});
    return waitForFunction.apply(page, [fn, opts].concat(rest));
  };
}

async function snippet(page) {
  return page.evaluate(function () {
    return (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 500);
  });
}

async function stamp(page, sel) {
  return page.evaluate(function (s) {
    var el = document.querySelector(s);
    if (!el) return '';
    var id = 's' + Math.random().toString(16).slice(2);
    el.dataset.stamp = id;
    return id;
  }, sel);
}

async function hasStamp(page, sel, id) {
  return page.evaluate(function (s, stampId) {
    var el = document.querySelector(s);
    return !!(el && el.dataset.stamp === stampId);
  }, sel, id);
}

describe('duel two-player sessions', { concurrency: 1 }, function () {
  test('geo duel lifecycle stays in sync', { timeout: 180000 }, async function (t) {
    var puppeteer = loadPuppeteer();
    if (!puppeteer) { t.skip('puppeteer-core is not installed'); return; }
    var mock = createMock();
    var port = await mock.listen();
    var base = 'http://127.0.0.1:' + port;
    var browser = await puppeteer.launch({
      executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    });
    var errors = [];
    function watch(page) {
      page.on('pageerror', function (e) { errors.push(String(e)); });
      page.on('console', function (msg) {
        var text = msg.text();
        if (msg.type() === 'error' && /404|Failed to load resource/.test(text)) return;
        if (msg.type() === 'error') errors.push(text);
      });
    }
    try {
      var host = await browser.newPage();
      var guest = await browser.newPage();
      watch(host); watch(guest);
      harden(host); harden(guest);
      host.setDefaultTimeout(15000);
      guest.setDefaultTimeout(15000);
      await host.goto(base + '/tests/duel-player.html?d=' + HOST + '&t=' + HOST_TAG + '&stale=1', { waitUntil: 'domcontentloaded' });
      await guest.goto(base + '/tests/duel-player.html?d=' + GUEST + '&t=' + GUEST_TAG, { waitUntil: 'domcontentloaded' });
      await host.waitForFunction(function () { return window.GeoDuel && window.__boot; });
      await guest.waitForFunction(function () { return window.GeoDuel && window.__boot; });
      await host.evaluate(function () { return window.__boot(); });
      await guest.evaluate(function () { return window.__boot(); });
      await host.waitForSelector('#duel-tag');
      await guest.waitForSelector('#duel-tag');

      await host.evaluate(function () {
        document.querySelector('[data-kind] button[data-v="capitals"]').click();
      });
      await host.evaluate(function () { window.__session.destroy(); return window.__boot(); });
      await host.waitForSelector('#duel-tag');
      var kind = await host.evaluate(function () {
        var b = document.querySelector('[data-kind] button.is-active');
        return b ? b.getAttribute('data-v') : '';
      });
      assert.equal(kind, 'capitals', 'lobby kind survives leaving and coming back');

      await host.evaluate(function () {
        document.querySelector('#duel-tag').value = 'DuelGuest';
        document.querySelector('[data-duel-send]').click();
      });
      await guest.waitForSelector('[data-duel-accept]', { timeout: 15000 });
      var acceptStamp = await stamp(guest, '[data-duel-accept]');
      await sleep(2500);
      assert.equal(await hasStamp(guest, '[data-duel-accept]', acceptStamp), true,
        'inbox poll replaced the Accept button. Guest: ' + await snippet(guest));

      await guest.evaluate(function () {
        var b = document.querySelector('[data-duel-accept]');
        b.click();
        b.click();
      });
      await sleep(600);
      var accepts = mock.calls().filter(function (c) {
        return c.name === 'pvp_respond_invite' && c.args && c.args.p_accept;
      });
      assert.equal(accepts.length, 1, 'double Accept created ' + accepts.length + ' matches');

      await host.waitForFunction(function () {
        return !!document.querySelector('.duel-round');
      }, { timeout: 20000 });
      var choiceStamp = await stamp(host, '[data-choice]');
      assert.ok(choiceStamp, 'host has no answer button. ' + await snippet(host));
      await sleep(1400);
      assert.equal(await hasStamp(host, '[data-choice]', choiceStamp), true,
        'match poll rebuilt the question. Host: ' + await snippet(host));

      var seedStamp = await stamp(guest, '[data-duel-seeding]');
      assert.ok(seedStamp, 'guest was not held on the seeding screen. ' + await snippet(guest));
      await sleep(1000);
      assert.equal(await hasStamp(guest, '[data-duel-seeding]', seedStamp), true,
        'seeding wait restarted the cooking loader. Guest: ' + await snippet(guest));

      await guest.waitForFunction(function () { return !!document.querySelector('.duel-round'); }, { timeout: 20000 });
      var prompts = await Promise.all([host, guest].map(function (p) {
        return p.evaluate(function () {
          var el = document.querySelector('.qcard__prompt');
          return el ? el.textContent : '';
        });
      }));
      assert.equal(prompts[0], prompts[1]);
      assert.match(prompts[0], /capital/i);

      var beforeGuest = mock.calls().length;
      await guest.evaluate(function () { document.querySelector('[data-choice="0"]').click(); });
      var guestSub = null;
      var started = 0;
      for (var i = 0; i < 40 && !guestSub; i++) {
        await sleep(100);
        guestSub = mock.calls().slice(beforeGuest).filter(function (c) {
          return c.name === 'pvp_submit_answer' && c.args.p_device === GUEST && !c.error;
        }).pop();
      }
      assert.ok(guestSub, 'guest answer was not stored');
      var dbg = await (await fetch(base + '/mock/debug')).json();
      started = dbg.geo[0].first_started;
      assert.ok(guestSub.args.p_ms > 1000, 'guest p_ms ' + guestSub.args.p_ms + ' ignored the server round clock');
      assert.ok(Math.abs(guestSub.args.p_ms - (guestSub.at - started)) < 2500,
        'p_ms ' + guestSub.args.p_ms + ' vs elapsed ' + (guestSub.at - started));

      await host.evaluate(function () { document.querySelector('[data-choice="0"]').click(); });
      await host.waitForFunction(function () {
        var el = document.querySelector('.duel-round');
        return el && el.innerText.indexOf('Round 2 /') === 0;
      }, { timeout: 15000 });
      await guest.waitForFunction(function () {
        var el = document.querySelector('.duel-round');
        return el && el.innerText.indexOf('Round 2 /') === 0;
      }, { timeout: 15000 });
      var hostScores = await host.evaluate(function () {
        return Array.prototype.map.call(document.querySelectorAll('.duel-score b'), function (b) { return b.textContent.trim(); });
      });
      var guestScores = await guest.evaluate(function () {
        return Array.prototype.map.call(document.querySelectorAll('.duel-score b'), function (b) { return b.textContent.trim(); });
      });
      assert.deepEqual(hostScores, ['0', '1']);
      assert.deepEqual(guestScores, ['0', '1']);
      var hostNote = await host.evaluate(function () {
        var el = document.querySelector('[data-duel-status]');
        return el ? el.textContent : '';
      });
      var guestNote = await guest.evaluate(function () {
        var el = document.querySelector('[data-duel-status]');
        return el ? el.textContent : '';
      });
      assert.match(hostNote, /Opponent took the last round/);
      assert.match(guestNote, /You took the last round/);

      var deliveredEarly = await host.evaluate(function () { return !!window.__staleDelivered; });
      assert.equal(deliveredEarly, false, 'stale poll arrived before round 2, so it does not prove ordering');

      var busy = await host.evaluate(function () { return window.GeoDuel.sendInvite('DuelGuest', 'mix'); });
      assert.equal(busy.error, 'busy');

      await guest.evaluate(function () { window.__session.destroy(); return window.__boot(); });
      await guest.waitForFunction(function () {
        var el = document.querySelector('.duel-round');
        return el && el.innerText.indexOf('Round 2 /') === 0;
      }, { timeout: 15000 });

      var submitsBefore = mock.calls().filter(function (c) { return c.name === 'pvp_submit_answer' && !c.error; }).length;
      await fetch(base + '/mock/config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sendClock: true, forceRemainingMs: 0 })
      });
      await sleep(1600);
      await host.evaluate(function () {
        var b = document.querySelector('[data-choice="0"]');
        if (b) b.click();
      });
      await sleep(400);
      var submitsLocked = mock.calls().filter(function (c) { return c.name === 'pvp_submit_answer' && !c.error; }).length;
      assert.equal(submitsLocked, submitsBefore, 'a click at 0s was still sent');

      await fetch(base + '/mock/config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ forceRemainingMs: null, fail: { name: 'pvp_submit_answer', device: GUEST } })
      });
      await sleep(1600);
      await host.evaluate(function () { document.querySelector('[data-choice="0"]').click(); });
      await sleep(300);
      await guest.evaluate(function () { document.querySelector('[data-choice="0"]').click(); });
      await sleep(500);
      var failed = mock.calls().filter(function (c) {
        return c.name === 'pvp_submit_answer' && c.args.p_device === GUEST && c.error;
      });
      assert.ok(failed.length >= 1, 'expected a failed guest submit');
      var unlocked = await guest.evaluate(function () {
        var b = document.querySelector('[data-choice="0"]');
        return !!(b && !b.classList.contains('is-locked'));
      });
      assert.equal(unlocked, true, 'failed submit left the guest stuck. ' + await snippet(guest));
      await guest.evaluate(function () { document.querySelector('[data-choice="0"]').click(); });
      await host.waitForFunction(function () {
        var el = document.querySelector('.duel-round');
        return el && el.innerText.indexOf('Round 3 /') === 0;
      }, { timeout: 15000 });
      await guest.waitForFunction(function () {
        var el = document.querySelector('.duel-round');
        return el && el.innerText.indexOf('Round 3 /') === 0;
      }, { timeout: 15000 });

      for (var n = 3; n <= 5; n++) {
        await host.waitForFunction(function (num) {
          var el = document.querySelector('.duel-round');
          return el && el.innerText.indexOf('Round ' + num + ' /') === 0;
        }, { timeout: 15000 }, n);
        await guest.waitForFunction(function (num) {
          var el = document.querySelector('.duel-round');
          return el && el.innerText.indexOf('Round ' + num + ' /') === 0;
        }, { timeout: 15000 }, n);
        await host.evaluate(function () { document.querySelector('[data-choice="0"]').click(); });
        await sleep(250);
        await guest.evaluate(function () { document.querySelector('[data-choice="0"]').click(); });
      }
      await host.waitForFunction(function () { return /You win!/.test(document.body.innerText); }, { timeout: 15000 });
      await guest.waitForFunction(function () { return /Defeat/.test(document.body.innerText); }, { timeout: 15000 });
      await sleep(1500);
      var hostRec = await host.evaluate(function () { return window.WW.state.games.duel; });
      var guestRec = await guest.evaluate(function () { return window.WW.state.games.duel; });
      assert.equal(hostRec.runs, 1);
      assert.equal(hostRec.wins, 1);
      assert.equal(guestRec.runs, 1);
      assert.equal(guestRec.wins || 0, 0);
      var finStamp = await stamp(host, '[data-duel-finished]');
      await host.waitForFunction(function () { return window.__staleDelivered === true; }, { timeout: 25000 });
      assert.equal(await hasStamp(host, '[data-duel-finished]', finStamp), true,
        'a late round-1 poll rewound the finished match. ' + await snippet(host));

      await host.evaluate(function () { document.querySelector('[data-duel-again]').click(); });
      await guest.evaluate(function () { document.querySelector('[data-duel-again]').click(); });
      await host.waitForSelector('#duel-tag');
      await guest.waitForSelector('#duel-tag');

      await host.evaluate(function () {
        document.querySelector('#duel-tag').value = 'DuelGuest';
        document.querySelector('[data-duel-send]').click();
      });
      await guest.waitForSelector('[data-duel-accept]', { timeout: 15000 });
      await host.evaluate(function () { document.querySelector('[data-duel-cancel]').click(); });
      await guest.waitForFunction(function () { return !document.querySelector('[data-duel-accept]'); }, { timeout: 10000 });

      await fetch(base + '/mock/config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sendClock: true, skewMs: 6000, forceRemainingMs: null, maskMs: 0 })
      });
      await host.evaluate(function () {
        document.querySelector('#duel-tag').value = 'DuelGuest';
        document.querySelector('[data-duel-send]').click();
      });
      await guest.waitForSelector('[data-duel-accept]', { timeout: 15000 });
      await guest.evaluate(function () { document.querySelector('[data-duel-accept]').click(); });
      await guest.waitForFunction(function () { return !!document.querySelector('[data-choice]'); }, { timeout: 15000 });
      var mark = mock.calls().length;
      await guest.evaluate(function () { document.querySelector('[data-choice="0"]').click(); });
      var skewSub = null;
      for (var k = 0; k < 30 && !skewSub; k++) {
        await sleep(100);
        skewSub = mock.calls().slice(mark).filter(function (c) {
          return c.name === 'pvp_submit_answer' && c.args.p_device === GUEST && !c.error;
        }).pop();
      }
      assert.ok(skewSub, 'skewed-clock answer missing');
      assert.ok(skewSub.args.p_ms >= 30 && skewSub.args.p_ms < 8000,
        'clock correction failed, p_ms=' + skewSub.args.p_ms);

      await host.waitForSelector('[data-duel-forfeit]', { timeout: 15000 });
      await host.evaluate(function () { document.querySelector('[data-duel-forfeit]').click(); });
      await host.waitForFunction(function () { return /Defeat/.test(document.body.innerText); }, { timeout: 10000 });
      await guest.waitForFunction(function () { return /You win!/.test(document.body.innerText); }, { timeout: 10000 });
      var hostRec2 = await host.evaluate(function () { return window.WW.state.games.duel; });
      var guestRec2 = await guest.evaluate(function () { return window.WW.state.games.duel; });
      assert.equal(hostRec2.runs, 2);
      assert.equal(hostRec2.wins, 1);
      assert.equal(guestRec2.runs, 2);
      assert.equal(guestRec2.wins, 1);

      await host.evaluate(function () { document.querySelector('[data-duel-again]').click(); });
      await guest.evaluate(function () { document.querySelector('[data-duel-again]').click(); });
      await host.waitForSelector('#duel-tag');
      await fetch(base + '/mock/config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ skewMs: 0, sendClock: false, maskMs: 0 })
      });
      await host.evaluate(function () {
        document.querySelector('#duel-tag').value = 'DuelGuest';
        document.querySelector('[data-duel-send]').click();
      });
      await guest.waitForSelector('[data-duel-accept]', { timeout: 15000 });
      await guest.evaluate(function () { document.querySelector('[data-duel-accept]').click(); });
      await host.waitForFunction(function () {
        return !!document.querySelector('.duel-round') || !!document.querySelector('[data-duel-seeding]');
      }, { timeout: 15000 });
      await fetch(base + '/mock/cancel', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      await host.waitForFunction(function () { return !!document.querySelector('[data-duel-closed]'); }, { timeout: 10000 });
      await guest.waitForFunction(function () { return !!document.querySelector('[data-duel-closed]'); }, { timeout: 10000 });
      var closedText = await host.evaluate(function () { return document.body.innerText; });
      assert.equal(/Question/.test(closedText), false);
      assert.match(closedText, /Match closed/);

      var seeds = mock.calls().filter(function (c) { return c.name === 'pvp_seed_match'; });
      assert.equal(seeds[0].args.p_kind, 'capitals');
      assert.equal(errors.length, 0, errors.join('\n'));
    } finally {
      await browser.close();
      await mock.close();
    }
  });

  test('chess duel board survives the poll', { timeout: 120000 }, async function (t) {
    var puppeteer = loadPuppeteer();
    if (!puppeteer) { t.skip('puppeteer-core is not installed'); return; }
    var mock = createMock();
    var port = await mock.listen();
    var base = 'http://127.0.0.1:' + port;
    var browser = await puppeteer.launch({
      executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    });
    var errors = [];
    try {
      var host = await browser.newPage();
      var guest = await browser.newPage();
      host.on('pageerror', function (e) { errors.push(String(e)); });
      guest.on('pageerror', function (e) { errors.push(String(e)); });
      harden(host); harden(guest);
      await host.goto(base + '/tests/chess-duel-player.html?d=' + HOST + '&t=' + HOST_TAG, { waitUntil: 'domcontentloaded' });
      await guest.goto(base + '/tests/chess-duel-player.html?d=' + GUEST + '&t=' + GUEST_TAG, { waitUntil: 'domcontentloaded' });
      await host.waitForFunction(function () { return window.ChessDuel && window.__boot; }, { timeout: 20000 });
      await guest.waitForFunction(function () { return window.ChessDuel && window.__boot; }, { timeout: 20000 });
      await host.evaluate(function () { return window.__boot(); });
      await guest.evaluate(function () { return window.__boot(); });
      await host.waitForSelector('#cduel-tag');
      await guest.waitForSelector('#cduel-tag');

      await host.evaluate(function () {
        document.querySelector('#cduel-tag').value = 'DuelGuest';
        document.querySelector('[data-cduel-send]').click();
      });
      await guest.waitForSelector('[data-cduel-accept]', { timeout: 15000 });
      var acceptStamp = await stamp(guest, '[data-cduel-accept]');
      await sleep(2500);
      assert.equal(await hasStamp(guest, '[data-cduel-accept]', acceptStamp), true,
        'chess inbox poll replaced Accept. ' + await snippet(guest));
      await guest.evaluate(function () {
        var b = document.querySelector('[data-cduel-accept]');
        b.click();
        b.click();
      });
      await sleep(500);
      var accepts = mock.calls().filter(function (c) {
        return c.name === 'chess_duel_respond_invite' && c.args && c.args.p_accept;
      });
      assert.equal(accepts.length, 1);

      await host.waitForSelector('[data-square="e2"]', { timeout: 15000 });
      await guest.waitForSelector('[data-square="e7"]', { timeout: 15000 });
      var e2 = await stamp(host, '[data-square="e2"]');
      var e7 = await stamp(guest, '[data-square="e7"]');
      await host.evaluate(function () { document.querySelector('.chess-history').open = true; });
      await sleep(2200);
      assert.equal(await hasStamp(host, '[data-square="e2"]', e2), true, 'chess poll rebuilt the board');
      assert.equal(await hasStamp(guest, '[data-square="e7"]', e7), true, 'guest board was rebuilt');
      assert.equal(await host.evaluate(function () { return document.querySelector('.chess-history').open; }), true,
        'move history snapped shut on poll');

      await host.evaluate(function () { document.querySelector('[data-square="e2"]').click(); });
      var selected = await stamp(host, '[data-square="e2"]');
      await sleep(1800);
      assert.equal(await hasStamp(host, '[data-square="e2"]', selected), true);
      assert.equal(await host.evaluate(function () {
        var sq = document.querySelector('[data-square="e2"]');
        return !!(sq && sq.classList.contains('is-selected'));
      }), true, 'selection was cleared by the poll');

      await host.evaluate(function () { document.querySelector('[data-square="e4"]').click(); });
      await guest.waitForFunction(function () {
        var piece = document.querySelector('[data-square="e4"] .chess-piece');
        return piece && piece.textContent.trim().length > 0;
      }, { timeout: 10000 });
      var guestFenPiece = await guest.evaluate(function () {
        return document.querySelector('[data-square="e2"] .chess-piece').textContent.trim();
      });
      assert.equal(guestFenPiece, '');

      await guest.evaluate(function () { window.__session.destroy(); return window.__boot(); });
      await guest.waitForFunction(function () {
        var piece = document.querySelector('[data-square="e4"] .chess-piece');
        return piece && piece.textContent.trim().length > 0;
      }, { timeout: 15000 });
      assert.equal(errors.length, 0, errors.join('\n'));
    } finally {
      await browser.close();
      await mock.close();
    }
  });
});
