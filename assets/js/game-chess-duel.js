/* ------------------------------------------------------------------
   LearnGeo — Geo Chess PvP (invite by gamertag)

   Mounted from Geo Chess when Opponent = Challenge a friend (LEA-68).
   Formerly a separate “Chess Duel” Games hub entry. Invite → inbox
   accept → live turn-based match. Host is White. Moves validated with
   chess.js; server stores FEN + enforces turns.
   Server: supabase/deployed/0018_chess_duel.sql (RPC names unchanged).
   LEA-76: weekly Elo ladder panel + Rematch last opponent in lobby /
   end screen (no separate Chess Duel hub entry).
-------------------------------------------------------------------*/
import { Chess } from '../vendor/chess.js/chess.js';

(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons;
  var esc = W.escapeHtml;
  var GLYPHS = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
  var NAMES = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };
  var seenInvite = {};
  var pollTimer = null;
  var lastInbox = { incoming: [], outgoing: [], active: null };

  function sb() { return global.Cloud && global.Cloud.sb; }
  function deviceId() {
    return global.GameBoards && global.GameBoards.deviceId
      ? global.GameBoards.deviceId()
      : (W.state.deviceId || '');
  }
  function myTag() { return (W.state.gamertag || ''); }

  function rpc(name, args) {
    var c = sb();
    if (!c) return Promise.resolve({ ok: false, error: 'offline' });
    return c.rpc(name, args).then(function (res) {
      if (res && res.error) return { ok: false, error: 'offline', message: res.error.message };
      return res.data || { ok: false, error: 'offline' };
    }, function () { return { ok: false, error: 'offline' }; });
  }

  function ensureServerTag() {
    var tag = myTag();
    var id = deviceId();
    if (!tag || !id) return Promise.resolve(false);
    var c = sb();
    if (!c) return Promise.resolve(false);
    return c.rpc('claim_gamertag', { p_device: id, p_tag: tag }).then(function (res) {
      if (res && res.error) return false;
      return (res && res.data) === 'ok';
    }, function () { return false; });
  }

  function ensureTag(then) {
    function afterLocal(tag) {
      ensureServerTag().then(function () { then(tag); });
    }
    if (global.GameBoards && global.GameBoards.ensureTag) {
      global.GameBoards.ensureTag(afterLocal);
    } else if (myTag()) {
      afterLocal(myTag());
    } else {
      W.toast('Pick a gamertag', 'Open Leaderboards once to claim a name first.', I.gamepad, 4200);
    }
  }

  function errMsg(code) {
    return ({
      not_found: 'No player with that gamertag.',
      self: 'You cannot challenge yourself.',
      already_pending: 'An invite is already pending with them.',
      too_many: 'Too many open invites. Cancel one first.',
      no_gamertag: 'Claim a gamertag first.',
      busy: 'One of you is already in a Geo Chess match.',
      offline: 'Cloud is offline right now.',
      invalid_tag: 'Use 3–16 letters, numbers, or underscores.',
      gone: 'That invite expired.',
      not_your_turn: 'Wait for your opponent’s move.',
      stale: 'Board changed — refreshing…',
      bad_square: 'That move is not allowed.',
      bad_fen: 'Could not sync the board.',
      not_active: 'This match has ended.'
    })[code] || 'Please try again.';
  }

  /* ============================ inbox ============================= */
  function fetchInbox() {
    var id = deviceId();
    if (!id || !myTag()) return Promise.resolve(lastInbox);
    return rpc('chess_duel_list_inbox', { p_device: id }).then(function (data) {
      if (!data || !data.ok) return lastInbox;
      lastInbox = {
        incoming: data.incoming || [],
        outgoing: data.outgoing || [],
        active: data.active || null
      };
      notifyIncoming(lastInbox.incoming);
      return lastInbox;
    });
  }

  function notifyIncoming(list) {
    (list || []).forEach(function (inv) {
      if (!inv || !inv.id || seenInvite[inv.id]) return;
      seenInvite[inv.id] = true;
      W.toast(
        'Geo Chess invite',
        (inv.from_tag || 'Someone') + ' challenged you. Accept from your profile menu → Friend inbox, or Geo Chess → Challenge a friend.',
        I.gamepad,
        6500
      );
    });
  }

  function inboxTick() {
    if (!myTag()) return;
    fetchInbox().then(function (box) {
      global.dispatchEvent(new CustomEvent('learngeo:chess-duel-inbox', { detail: box }));
    });
  }

  function startWatching() {
    if (pollTimer) return;
    pollTimer = setInterval(inboxTick, 2000);
    setTimeout(function () { if (myTag()) inboxTick(); }, 800);
  }

  function inboxHtml(box) {
    box = box || lastInbox;
    var parts = [];
    if (box.active) {
      parts.push(
        '<div class="duel-note duel-note--live">' +
          '<div><b>Match in progress</b><span>vs ' +
          esc(box.active.host_tag === myTag() ? box.active.guest_tag : box.active.host_tag) +
          ' · ' + (box.active.my_color === 'w' ? 'you are White' : 'you are Black') +
          '</span></div>' +
          '<button class="btn btn--accent btn--sm" type="button" data-cduel-resume="' +
          esc(box.active.id) + '">Rejoin</button></div>'
      );
    }
    (box.incoming || []).forEach(function (inv) {
      parts.push(
        '<div class="duel-note">' +
          '<div><b>' + esc(inv.from_tag || '?') + '</b><span>wants a chess duel</span></div>' +
          '<div class="duel-note__actions">' +
            '<button class="btn btn--accent btn--sm" type="button" data-cduel-accept="' + esc(inv.id) + '">Accept</button>' +
            '<button class="btn btn--ghost btn--sm" type="button" data-cduel-decline="' + esc(inv.id) + '">Decline</button>' +
          '</div></div>'
      );
    });
    (box.outgoing || []).forEach(function (inv) {
      parts.push(
        '<div class="duel-note duel-note--out">' +
          '<div><b>Waiting on ' + esc(inv.to_tag || '?') + '</b><span>Invite pending</span></div>' +
          '<button class="btn btn--ghost btn--sm" type="button" data-cduel-cancel="' + esc(inv.id) + '">Cancel</button></div>'
      );
    });
    if (!parts.length) {
      parts.push('<p class="duel-empty t-sm t-muted">No invites yet. Challenge a friend by their gamertag.</p>');
    }
    return parts.join('');
  }

  function wireInbox(el, onMatch) {
    function refresh() {
      fetchInbox().then(function () {
        var host = W.$('[data-cduel-inbox]', el);
        if (host) host.innerHTML = inboxHtml(lastInbox);
        wireInbox(el, onMatch);
      });
    }
    W.$$('[data-cduel-accept]', el).forEach(function (b) {
      b.addEventListener('click', function () {
        ensureTag(function () {
          function acceptOnce() {
            return rpc('chess_duel_respond_invite', {
              p_device: deviceId(), p_invite: b.getAttribute('data-cduel-accept'), p_accept: true
            });
          }
          acceptOnce().then(function (res) {
            if (!res.ok && res.error === 'no_gamertag') {
              return ensureServerTag().then(acceptOnce);
            }
            return res;
          }).then(function (res) {
            if (!res || !res.ok) {
              W.toast('Could not accept', errMsg(res && res.error), I.info, 3600);
              return refresh();
            }
            W.toast('Challenge accepted', 'Starting Geo Chess…', I.check, 2800);
            if (onMatch) onMatch(res.match_id);
          });
        });
      });
    });
    W.$$('[data-cduel-decline]', el).forEach(function (b) {
      b.addEventListener('click', function () {
        rpc('chess_duel_respond_invite', {
          p_device: deviceId(), p_invite: b.getAttribute('data-cduel-decline'), p_accept: false
        }).then(function () { refresh(); });
      });
    });
    W.$$('[data-cduel-cancel]', el).forEach(function (b) {
      b.addEventListener('click', function () {
        rpc('chess_duel_cancel_invite', {
          p_device: deviceId(), p_invite: b.getAttribute('data-cduel-cancel')
        }).then(function () { refresh(); });
      });
    });
    W.$$('[data-cduel-resume]', el).forEach(function (b) {
      b.addEventListener('click', function () {
        if (onMatch) onMatch(b.getAttribute('data-cduel-resume'));
      });
    });
  }

  function sendInvite(tag) {
    if (!tag || !/^[A-Za-z0-9_]{3,16}$/.test(tag)) {
      return Promise.resolve({ ok: false, error: 'invalid_tag' });
    }
    if (myTag() && tag.toLowerCase() === myTag().toLowerCase()) {
      return Promise.resolve({ ok: false, error: 'self' });
    }
    return rpc('pvp_lookup_tag', { p_tag: tag }).then(function (rows) {
      if (rows && rows.ok === false) return rows;
      var row = Array.isArray(rows) ? rows[0] : rows;
      var found = !!(row && (row.found === true || row.found === 't' || row.gamertag));
      if (!found) return { ok: false, error: 'not_found' };
      return rpc('chess_duel_send_invite', { p_device: deviceId(), p_to_tag: tag });
    });
  }

  function fmtWeekDelta(n) {
    if (global.ChessElo && global.ChessElo.fmtWeekDelta) return global.ChessElo.fmtWeekDelta(n);
    n = Math.round(Number(n) || 0);
    if (!n) return '±0';
    return (n > 0 ? '+' : '') + n;
  }

  function ladderHtml(data) {
    var week = (data && data.week_key) || (global.ChessElo && global.ChessElo.weekKey ? global.ChessElo.weekKey() : '');
    var rows = (data && data.rows) || [];
    var me = data && data.me;
    var parts = [];
    parts.push(
      '<div class="panel__head"><h3>This week’s Elo ladder</h3>' +
        (week ? '<span class="chess-ladder__week mono">' + esc(week) + '</span>' : '') +
      '</div>' +
      '<p class="t-sm t-muted chess-ladder__hint">Ranked by Elo gained this UTC week (bots + friend matches). Resets Monday.</p>'
    );
    if (!rows.length) {
      parts.push('<p class="duel-empty t-sm t-muted">No rated games yet this week. Finish a bot or friend match to climb.</p>');
    } else {
      parts.push('<ol class="chess-ladder__list">');
      rows.forEach(function (r) {
        var delta = fmtWeekDelta(r.week_delta);
        var deltaCls = (r.week_delta || 0) > 0 ? ' is-up' : (r.week_delta || 0) < 0 ? ' is-down' : '';
        parts.push(
          '<li class="chess-ladder__row' + (r.is_me ? ' is-me' : '') + '">' +
            '<span class="chess-ladder__rank">' + esc(String(r.rank || '')) + '</span>' +
            '<span class="chess-ladder__tag">' + esc(r.gamertag || '?') + '</span>' +
            '<span class="chess-ladder__delta' + deltaCls + '">' + esc(delta) + '</span>' +
            '<span class="chess-ladder__elo mono">' + esc(String(r.elo || '')) + '</span>' +
          '</li>'
        );
      });
      parts.push('</ol>');
    }
    if (me && me.week_games > 0 && me.rank && !rows.some(function (r) { return r.is_me; })) {
      parts.push(
        '<p class="chess-ladder__me t-sm">You · #' + esc(String(me.rank)) +
          ' · ' + esc(fmtWeekDelta(me.week_delta)) + ' this week</p>'
      );
    } else if (me && !(me.week_games > 0)) {
      parts.push('<p class="chess-ladder__me t-sm t-muted">Play a rated game to join this week’s ladder.</p>');
    }
    return parts.join('');
  }

  function rematchCardHtml(tag) {
    if (!tag) return '';
    return (
      '<div class="duel-note duel-note--rematch">' +
        '<div><b>Rematch ' + esc(tag) + '</b><span>Challenge your last opponent again</span></div>' +
        '<button class="btn btn--accent btn--sm" type="button" data-cduel-rematch="' +
          esc(tag) + '">Rematch</button></div>'
    );
  }

  /* ============================ mount ============================= */
  function mount(host, opts) {
    opts = opts || {};
    var matchId = opts.matchId || null;
    var destroyed = false;
    var poll = null;
    var state = null;
    var entering = false;
    var scored = false;
    var chess = new Chess();
    var selected = null;
    var promotion = null;
    var lastMove = null;
    var submitting = false;

    host.innerHTML = '<div class="duel cduel" tabindex="-1"><div class="duel__body" data-cduel-body></div></div>';
    var body = W.$('[data-cduel-body]', host);

    function onInboxEvent(ev) {
      if (destroyed || matchId || entering) return;
      var box = (ev && ev.detail) || lastInbox;
      if (box && box.active && box.active.id) {
        entering = true;
        W.toast('Challenge accepted', 'Entering Geo Chess…', I.check, 2800);
        enterMatch(box.active.id);
        return;
      }
      var inboxEl = body && W.$('[data-cduel-inbox]', body);
      if (!inboxEl) return;
      inboxEl.innerHTML = inboxHtml(box || lastInbox);
      wireInbox(body, function (id) { enterMatch(id); });
    }
    global.addEventListener('learngeo:chess-duel-inbox', onInboxEvent);

    function paint() {
      if (destroyed || !body) return;
      if (!matchId) return paintLobby();
      if (!state) {
        body.innerHTML = global.CookingLoader
          ? global.CookingLoader.host({ tall: true, note: 'Loading match…' })
          : '<div class="duel-wait"><div class="duel-wait__pulse"></div><p>Loading match…</p></div>';
        return;
      }
      if (state.status === 'finished') return paintFinished();
      return paintBoard();
    }

    function doSendInvite(tag, errEl, inputEl) {
      ensureTag(function () {
        sendInvite(tag).then(function (res) {
          if (!res || !res.ok) {
            if (res && res.error === 'no_gamertag') {
              ensureServerTag().then(function () { return sendInvite(tag); }).then(function (retry) {
                if (!retry || !retry.ok) {
                  if (errEl) errEl.textContent = errMsg(retry && retry.error);
                  return;
                }
                W.toast('Invite sent', 'Waiting for ' + (retry.to_tag || tag) + '…', I.check, 3600);
                if (inputEl) inputEl.value = '';
                refreshLobbyInbox();
              });
              return;
            }
            if (errEl) errEl.textContent = errMsg(res && res.error);
            else W.toast('Could not invite', errMsg(res && res.error), I.info, 3600);
            return;
          }
          W.toast('Invite sent', 'Waiting for ' + (res.to_tag || tag) + '…', I.check, 3600);
          if (inputEl) inputEl.value = '';
          refreshLobbyInbox();
        });
      });
    }

    function refreshLobbyInbox() {
      fetchInbox().then(function () {
        var box = W.$('[data-cduel-inbox]', body);
        if (box) {
          box.innerHTML = inboxHtml(lastInbox);
          wireInbox(body, function (id) { enterMatch(id); });
        }
      });
    }

    function wireRematchButtons() {
      W.$$('[data-cduel-rematch]', body).forEach(function (b) {
        b.addEventListener('click', function () {
          var tag = b.getAttribute('data-cduel-rematch');
          var err = W.$('#cduel-err', body);
          if (err) err.textContent = '';
          doSendInvite(tag, err, null);
        });
      });
    }

    function loadLadderAndRematch() {
      var ladderHost = W.$('[data-cduel-ladder]', body);
      var rematchHost = W.$('[data-cduel-rematch-slot]', body);
      var localTag = global.ChessElo && global.ChessElo.lastOpponentLocal
        ? global.ChessElo.lastOpponentLocal()
        : null;
      if (rematchHost) {
        rematchHost.innerHTML = rematchCardHtml(localTag);
        wireRematchButtons();
      }
      if (ladderHost) ladderHost.innerHTML = ladderHtml(null);

      var ladderP = global.ChessElo && global.ChessElo.weeklyLadder
        ? global.ChessElo.weeklyLadder(10)
        : Promise.resolve(null);
      var oppP = global.ChessElo && global.ChessElo.lastOpponent
        ? global.ChessElo.lastOpponent()
        : Promise.resolve(localTag ? { ok: true, found: true, tag: localTag } : { found: false });

      Promise.all([ladderP, oppP]).then(function (pair) {
        if (destroyed || matchId) return;
        var ladder = pair[0];
        var opp = pair[1];
        if (ladderHost) ladderHost.innerHTML = ladderHtml(ladder);
        var tag = (opp && opp.found && opp.tag) || localTag;
        if (rematchHost) {
          rematchHost.innerHTML = rematchCardHtml(tag);
          wireRematchButtons();
        }
      });
    }

    function paintLobby() {
      var localRematch = global.ChessElo && global.ChessElo.lastOpponentLocal
        ? global.ChessElo.lastOpponentLocal()
        : null;
      body.innerHTML =
        '<div class="duel-lobby">' +
          '<div class="duel-lobby__hero">' +
            '<div class="eyebrow">PvP · Geo Chess</div>' +
            '<h2>Challenge a friend</h2>' +
            '<p>Look up their gamertag. They get an invite, accept, and you play a live chess match. You are White when you send the invite. Climb this week’s Elo ladder, or rematch your last opponent.</p>' +
          '</div>' +
          '<div class="duel-invite panel">' +
            '<div class="panel__head"><h3>Invite by gamertag</h3></div>' +
            '<div data-cduel-rematch-slot>' + rematchCardHtml(localRematch) + '</div>' +
            '<div class="field"><label class="field__label" for="cduel-tag">Friend’s gamertag</label>' +
              '<input class="input" id="cduel-tag" maxlength="16" autocomplete="off" autocapitalize="off" ' +
                'spellcheck="false" placeholder="e.g. MapWizard"></div>' +
            '<div class="duel-invite__row">' +
              '<button class="btn btn--accent" type="button" data-cduel-send>' + I.play + ' Send invite</button>' +
            '</div>' +
            '<div class="gt-err" id="cduel-err" role="alert"></div>' +
          '</div>' +
          '<div class="duel-inbox panel">' +
            '<div class="panel__head"><h3>Invites</h3></div>' +
            '<div data-cduel-inbox>' + inboxHtml(lastInbox) + '</div>' +
          '</div>' +
          '<div class="chess-ladder panel" data-cduel-ladder>' + ladderHtml(null) + '</div>' +
        '</div>';

      W.$('[data-cduel-send]', body).addEventListener('click', function () {
        var input = W.$('#cduel-tag', body);
        var err = W.$('#cduel-err', body);
        var tag = (input.value || '').trim();
        if (err) err.textContent = '';
        doSendInvite(tag, err, input);
      });
      wireRematchButtons();
      wireInbox(body, function (id) { enterMatch(id); });
      loadLadderAndRematch();
      fetchInbox().then(function () {
        if (destroyed || matchId) return;
        if (lastInbox.active && lastInbox.active.id) {
          entering = true;
          enterMatch(lastInbox.active.id);
          return;
        }
        var box = W.$('[data-cduel-inbox]', body);
        if (box) { box.innerHTML = inboxHtml(lastInbox); wireInbox(body, function (id) { enterMatch(id); }); }
      });
    }

    function syncChess() {
      try {
        chess.load(state.fen);
      } catch (e) {
        chess.reset();
      }
      if (state.last_move && state.last_move.from && state.last_move.to) {
        lastMove = { from: state.last_move.from, to: state.last_move.to };
      } else {
        lastMove = null;
      }
    }

    function paintBoard() {
      syncChess();
      var iAmWhite = state.my_color === 'w';
      var flipped = !iAmWhite;
      var opening = state.opening_name
        ? '<span class="cduel-opening" data-opening-eco="' + esc(state.opening_eco || '') + '">' +
            esc(state.opening_name) + '</span>'
        : '<span class="cduel-opening cduel-opening--hook" data-opening-eco="" hidden></span>';
      var statusLine = state.my_turn
        ? (chess.isCheck() ? 'You are in check. Your move.' : 'Your move.')
        : 'Waiting for ' + esc(iAmWhite ? state.black_tag : state.white_tag) + '…';
      var drawOffer = state.last_move && state.last_move.draw_offer
        && state.last_move.draw_offer !== deviceId();

      body.innerHTML =
        '<div class="cduel-play">' +
          '<div class="duel-scoreboard">' +
            '<div class="duel-score' + (iAmWhite ? ' is-me' : '') + '">' +
              '<span>White · ' + esc(state.white_tag || 'Host') + '</span>' +
              '<b>' + (state.turn === 'w' ? '●' : '') + '</b></div>' +
            '<div class="duel-round mono">Geo Chess' +
              '<small>' + (state.my_turn ? 'Your turn' : 'Their turn') + '</small></div>' +
            '<div class="duel-score' + (!iAmWhite ? ' is-me' : '') + '">' +
              '<span>Black · ' + esc(state.black_tag || 'Guest') + '</span>' +
              '<b>' + (state.turn === 'b' ? '●' : '') + '</b></div>' +
          '</div>' +
          opening +
          '<p class="chess-status" role="status" aria-live="polite">' + statusLine + '</p>' +
          '<div class="chess-board cduel-board' + (flipped ? ' is-flipped' : '') +
            '" role="group" aria-label="Chessboard"></div>' +
          '<div class="chess-promotion"></div>' +
          '<details class="chess-history"><summary>Move history</summary>' +
            '<p data-moves>' + historyText() + '</p></details>' +
          '<div class="duel-play__foot cduel-foot">' +
            (drawOffer
              ? '<button class="btn btn--accent btn--sm" type="button" data-cduel-draw-accept>Accept draw</button>'
              : '<button class="btn btn--ghost btn--sm" type="button" data-cduel-draw>Offer draw</button>') +
            '<button class="btn btn--ghost btn--sm" type="button" data-cduel-forfeit>Resign</button>' +
          '</div>' +
        '</div>';

      renderSquares(flipped);
      var ff = W.$('[data-cduel-forfeit]', body);
      if (ff) ff.addEventListener('click', forfeit);
      var od = W.$('[data-cduel-draw]', body);
      if (od) od.addEventListener('click', function () {
        rpc('chess_duel_offer_draw', { p_device: deviceId(), p_match: matchId, p_accept: false })
          .then(function () {
            W.toast('Draw offered', 'Waiting for your opponent…', I.info, 2800);
            refresh();
          });
      });
      var da = W.$('[data-cduel-draw-accept]', body);
      if (da) da.addEventListener('click', function () {
        rpc('chess_duel_offer_draw', { p_device: deviceId(), p_match: matchId, p_accept: true })
          .then(refresh);
      });
    }

    function historyText() {
      var moves = state.moves || [];
      if (!moves.length) return 'No moves yet.';
      var parts = [];
      for (var i = 0; i < moves.length; i += 2) {
        var n = (i / 2) + 1;
        var w = moves[i] && moves[i].san ? moves[i].san : '…';
        var b = moves[i + 1] && moves[i + 1].san ? moves[i + 1].san : '';
        parts.push(n + '. ' + w + (b ? ' ' + b : ''));
      }
      return parts.join('  ');
    }

    function renderSquares(flipped) {
      var board = W.$('.cduel-board', body);
      if (!board) return;
      var html = '';
      var ranks = flipped ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
      var files = flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
      var legal = [];
      if (selected && state.my_turn && !submitting) {
        legal = chess.moves({ square: selected, verbose: true }) || [];
      }
      for (var ri = 0; ri < 8; ri++) {
        for (var fi = 0; fi < 8; fi++) {
          var rank = ranks[ri];
          var file = files[fi];
          var square = 'abcdefgh'[file] + (rank + 1);
          var piece = chess.get(square);
          var dark = (rank + file) % 2 === 0;
          var dest = legal.some(function (m) { return m.to === square; });
          var cls = 'chess-square ' + (dark ? 'chess-square--dark' : 'chess-square--light') +
            (piece ? ' chess-piece--' + piece.color : '') +
            (selected === square ? ' is-selected' : '') +
            (dest ? ' is-legal' : '') +
            (lastMove && (lastMove.from === square || lastMove.to === square) ? ' is-last' : '');
          var label = square + ': ' + (piece
            ? ((piece.color === 'w' ? 'White ' : 'Black ') + NAMES[piece.type])
            : 'empty');
          html += '<button type="button" class="' + cls + '" data-square="' + square +
            '" aria-label="' + esc(label) + '" tabindex="-1">' +
            '<span class="chess-piece" aria-hidden="true">' +
            (piece ? GLYPHS[piece.type] : '') + '</span>' +
            '<span class="chess-coordinate" aria-hidden="true">' + square + '</span></button>';
        }
      }
      board.innerHTML = html;
      board.querySelectorAll('[data-square]').forEach(function (btn) {
        btn.addEventListener('click', function () { choose(btn.getAttribute('data-square')); });
      });
      if (promotion) paintPromotion();
    }

    function paintPromotion() {
      var box = W.$('.chess-promotion', body);
      if (!box || !promotion) { if (box) box.innerHTML = ''; return; }
      var color = state.my_color;
      box.innerHTML = '<div class="chess-promotion__row" role="group" aria-label="Choose promotion piece">' +
        ['q', 'r', 'b', 'n'].map(function (t) {
          return '<button type="button" class="btn btn--ghost" data-promote="' + t + '">' +
            '<span class="chess-piece chess-piece--' + color + '" aria-hidden="true">' + GLYPHS[t] +
            '</span> ' + NAMES[t] + '</button>';
        }).join('') + '</div>';
      box.querySelectorAll('[data-promote]').forEach(function (b) {
        b.addEventListener('click', function () {
          playMove({ from: promotion.from, to: promotion.to, promotion: b.getAttribute('data-promote') });
          promotion = null;
        });
      });
    }

    function choose(square) {
      if (!state || !state.my_turn || submitting || state.status !== 'active') return;
      var piece = chess.get(square);
      if (piece && piece.color === state.my_color) {
        selected = selected === square ? null : square;
        promotion = null;
        paintBoard();
        return;
      }
      if (!selected) return;
      var legal = chess.moves({ square: selected, verbose: true }).filter(function (m) {
        return m.to === square;
      });
      if (!legal.length) return;
      if (legal.some(function (m) { return m.promotion; })) {
        promotion = { from: selected, to: square };
        paintBoard();
        return;
      }
      playMove({ from: selected, to: square });
    }

    function endReasonFromChess() {
      if (!chess.isGameOver()) return null;
      if (chess.isCheckmate()) return 'checkmate';
      if (chess.isStalemate()) return 'stalemate';
      if (chess.isThreefoldRepetition()) return 'repetition';
      if (chess.isInsufficientMaterial()) return 'insufficient';
      return 'fifty';
    }

    function playMove(move) {
      if (submitting || !state || !state.my_turn) return;
      var before = chess.fen();
      var played;
      try {
        played = chess.move(move);
      } catch (e) {
        return;
      }
      if (!played) return;
      submitting = true;
      selected = null;
      promotion = null;
      var after = chess.fen();
      var end = endReasonFromChess();
      rpc('chess_duel_submit_move', {
        p_device: deviceId(),
        p_match: matchId,
        p_from: played.from,
        p_to: played.to,
        p_promotion: played.promotion || null,
        p_fen_before: before,
        p_fen_after: after,
        p_san: played.san,
        p_end_reason: end
      }).then(function (res) {
        submitting = false;
        if (!res || !res.ok) {
          /* Roll back local board and resync. */
          try { chess.load(before); } catch (e2) {}
          if (res && res.error === 'stale') W.toast('Board updated', errMsg('stale'), I.info, 2400);
          else W.toast('Move rejected', errMsg(res && res.error), I.info, 3200);
          refresh();
          return;
        }
        state = res;
        paint();
      });
    }

    function paintFinished() {
      var title = state.draw ? 'Draw' : (state.i_won ? 'You win!' : 'Defeat');
      var reason = ({
        checkmate: 'Checkmate',
        stalemate: 'Stalemate',
        resign: 'Resignation',
        draw: 'Agreed draw',
        insufficient: 'Insufficient material',
        repetition: 'Threefold repetition',
        fifty: 'Fifty-move rule',
        abandoned: 'Abandoned'
      })[state.end_reason] || 'Game over';
      var oppTag = state.my_color === 'w' ? state.black_tag : state.white_tag;
      if (oppTag && global.ChessElo && global.ChessElo.rememberLastOpponent) {
        global.ChessElo.rememberLastOpponent(oppTag);
      }
      var sub = state.draw
        ? reason + '. Rematch them below, or return to the lobby.'
        : (state.i_won
          ? reason + '. Rematch, or challenge someone new from the lobby.'
          : reason + '. ' + (state.winner_tag || 'Your opponent') + ' took this one — rematch anytime.');
      body.innerHTML =
        '<div class="duel-end">' +
          '<div class="duel-end__badge' + (state.i_won ? ' is-win' : state.draw ? '' : ' is-loss') + '">' +
            esc(title) + '</div>' +
          '<div class="duel-vs">' +
            '<span>' + esc(state.white_tag) + ' (W)</span>' +
            '<b>VS</b>' +
            '<span>' + esc(state.black_tag) + ' (B)</span>' +
          '</div>' +
          '<p>' + esc(sub) + '</p>' +
          '<div class="duel-end__actions">' +
            (oppTag
              ? '<button class="btn btn--accent" type="button" data-cduel-rematch="' +
                  esc(oppTag) + '">Rematch ' + esc(oppTag) + '</button>'
              : '') +
            '<button class="btn btn--ghost" type="button" data-cduel-again>Back to lobby</button>' +
            '<button class="btn btn--ghost" type="button" data-cduel-back>Game setup</button>' +
          '</div>' +
        '</div>';
      maybeRecord();
      W.$$('[data-cduel-rematch]', body).forEach(function (b) {
        b.addEventListener('click', function () {
          var tag = b.getAttribute('data-cduel-rematch');
          b.disabled = true;
          ensureTag(function () {
            sendInvite(tag).then(function (res) {
              b.disabled = false;
              if (!res || !res.ok) {
                W.toast('Could not rematch', errMsg(res && res.error), I.info, 3600);
                return;
              }
              W.toast('Rematch sent', 'Waiting for ' + (res.to_tag || tag) + '…', I.check, 3600);
              matchId = null; state = null; entering = false; stopPoll(); paint();
            });
          });
        });
      });
      W.$('[data-cduel-again]', body).addEventListener('click', function () {
        matchId = null; state = null; entering = false; stopPoll(); paint();
      });
      W.$('[data-cduel-back]', body).addEventListener('click', function () {
        if (opts.onBack) opts.onBack();
      });
    }

    function maybeRecord() {
      if (scored || !state || state.status !== 'finished') return;
      var seen = (W.state.chessDuelSeen || (W.state.chessDuelSeen = {}));
      if (seen[matchId]) return;
      seen[matchId] = 1;
      scored = true;
      /* Keep legacy chessduel tallies + fold into Geo Chess record (LEA-68). */
      var games = W.state.games || (W.state.games = {});
      var rec = games.chessduel || (games.chessduel = {});
      var chess = games.chess || (games.chess = {});
      rec.runs = (rec.runs || 0) + 1;
      chess.completed = (chess.completed || 0) + 1;
      if (state.i_won) {
        rec.wins = (rec.wins || 0) + 1;
        rec.best = Math.max(rec.best || 0, rec.wins);
        chess.wins = (chess.wins || 0) + 1;
      }
      if (state.draw) {
        rec.draws = (rec.draws || 0) + 1;
        chess.draws = (chess.draws || 0) + 1;
      }
      W.save();
      if (global.ChessElo && global.ChessElo.afterDuel) {
        global.ChessElo.afterDuel(matchId).then(function (r) {
          if (!r || typeof r.delta !== 'number' || !r.delta) {
            if (global.GameBoards && global.GameBoards.touch) global.GameBoards.touch();
            return;
          }
          var sign = r.delta > 0 ? '+' : '';
          W.toast('Chess Elo ' + sign + r.delta, 'New rating: ' + r.elo, I.trophy || I.info, 4200);
          if (global.GameBoards && global.GameBoards.touch) global.GameBoards.touch();
        });
      } else if (global.GameBoards && global.GameBoards.touch) {
        global.GameBoards.touch();
      }
    }

    function forfeit() {
      if (!window.confirm('Resign this Geo Chess match?')) return;
      var id = matchId;
      rpc('chess_duel_forfeit_match', { p_device: deviceId(), p_match: id }).then(function () {
        refresh();
      });
    }

    function enterMatch(id) {
      matchId = id;
      state = null;
      entering = true;
      scored = false;
      selected = null;
      promotion = null;
      submitting = false;
      paint();
      refresh();
      startPoll();
    }

    function refresh() {
      if (destroyed || !matchId) return Promise.resolve();
      return rpc('chess_duel_match_state', { p_device: deviceId(), p_match: matchId }).then(function (res) {
        if (!res || !res.ok) {
          if (res && (res.error === 'not_found' || res.error === 'forbidden')) {
            matchId = null;
            state = null;
            entering = false;
            stopPoll();
            fetchInbox().then(paint);
          }
          return;
        }
        state = res;
        paint();
      });
    }

    function startPoll() {
      stopPoll();
      poll = setInterval(function () {
        if (destroyed || submitting) return;
        refresh();
      }, 1400);
    }
    function stopPoll() {
      if (poll) { clearInterval(poll); poll = null; }
    }

    startWatching();
    if (matchId) {
      paint();
      refresh();
      startPoll();
    } else if (opts.autoResume && lastInbox.active) {
      enterMatch(lastInbox.active.id);
    } else {
      fetchInbox().then(paint);
    }

    return {
      destroy: function () {
        destroyed = true;
        stopPoll();
        global.removeEventListener('learngeo:chess-duel-inbox', onInboxEvent);
        host.innerHTML = '';
      }
    };
  }

  function pendingCount() {
    return (lastInbox.incoming || []).length;
  }

  global.ChessDuel = {
    mount: mount,
    startWatching: startWatching,
    fetchInbox: fetchInbox,
    pendingCount: pendingCount,
    inbox: function () { return lastInbox; },
    sendInvite: sendInvite
  };

  setTimeout(startWatching, 2200);
})(window);
