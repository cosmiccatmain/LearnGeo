/* ------------------------------------------------------------------
   LearnGeo — gamertags and a leaderboard for every game.

   A gamertag belongs to a device, not an account, so someone can pick
   the Games option on the first screen and be on a board a minute later
   without signing up. The server side is 0008_game_leaderboards_and_blocks
   .sql: three functions, no direct table access.

   What goes on a board is each game's own best, read out of
   state.games, so nothing in the games themselves had to change. The
   sync sends a score only when it beats the one already sent, and the
   server keeps the better of the two as well, so a stale device can
   never pull a board down.

   Fail soft. Until the SQL has been run, or while offline, the tag is
   kept on the device, scores wait, and the board says it is not switched
   on yet. Nothing here throws into a game.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons;

  var TAG_RE = /^[A-Za-z0-9_]{3,16}$/;
  var RUDE = /(fuck|shit|cunt|nigg|fag|rape|nazi|hitler|whore|slut|dick|cock|bitch)/i;

  function toPar(n) { return n === 0 ? 'E' : (n > 0 ? '+' + n : String(n)); }
  function num(n) { return Number(n).toLocaleString(); }

  /* Where each game keeps the number its board is ranked on, whether
     lower is better, and how to print it. Golf ranks the nine-hole best,
     in strokes against par. Chess ranks wins against the engine. */
  var SCORERS = {
    chess:    { get: function (r) { return r.wins || 0; },  fmt: function (n) { return num(n) + (n === 1 ? ' win' : ' wins'); } },
    dash:     { get: function (r) { return r.best || 0; },  fmt: function (n) { return num(n) + ' m'; } },
    orbit:    { get: function (r) { return r.best || 0; },  fmt: num },
    snake:    { get: function (r) { return r.best || 0; },  fmt: num },
    golf:     { get: function (r) { return r.best && typeof r.best['9'] === 'number' ? r.best['9'] : null; },
                asc: true, fmt: function (n) { return toPar(n) + ' · 9 holes'; } },
    invaders: best(), breakout: best(), maze: best(), typer: best(), crossing: best(),
    whack: best(), match: best(), sort: best(), stack: best(), echo: best()
  };
  function best() { return { get: function (r) { return r.best || 0; }, fmt: num }; }

  function sb() { return global.Cloud && global.Cloud.sb; }
  function esc(t) { return W.escapeHtml(String(t)); }

  /* ============================ identity ============================ */
  function deviceId() {
    if (!W.state.deviceId) {
      var a = new Uint8Array(12), id = '';
      (global.crypto || global.msCrypto).getRandomValues(a);
      for (var i = 0; i < a.length; i++) id += ('0' + a[i].toString(16)).slice(-2);
      W.state.deviceId = 'd' + id;
      W.save();
    }
    return W.state.deviceId;
  }
  function tag() { return W.state.gamertag || ''; }

  /* 'ok', 'taken', 'invalid', 'rude', or 'offline' when there is nobody
     to ask yet. Offline is not a failure: the tag is kept on the device
     and claimed the next time a score is sent. */
  function claim(name) {
    var c = sb();
    if (!c) return Promise.resolve('offline');
    return c.rpc('claim_gamertag', { p_device: deviceId(), p_tag: name }).then(function (res) {
      if (res && res.error) return 'offline';
      return res.data || 'offline';
    }, function () { return 'offline'; });
  }

  /* ========================= asking for a tag ====================== */
  /* o.then runs once there is a tag. o.onBack runs if the box is
     dismissed without one, so the first-screen chooser can come back. */
  function askTag(o) {
    o = o || {};
    var done = false, saving = false;
    global.UI.modal({
      title: o.title || (tag() ? 'Change your gamertag' : 'Pick a gamertag'),
      icon: I.gamepad,
      body:
        '<p class="t-muted" style="margin:-2px 0 14px">This is the name that goes on every game’s leaderboard. ' +
        '3 to 16 letters, numbers or underscores, no spaces.</p>' +
        '<div class="field"><label class="field__label" for="gt-input">Gamertag</label>' +
        '<input class="input" id="gt-input" maxlength="16" autocomplete="off" autocapitalize="off" ' +
          'spellcheck="false" value="' + esc(tag()) + '" placeholder="e.g. MapWizard"></div>' +
        '<div class="gt-err" id="gt-err" role="alert"></div>',
      actions: [
        { label: o.backLabel || 'Cancel', cls: 'btn--ghost', close: true },
        { label: 'Save', cls: 'btn--accent', onClick: function (m, close) { save(m, close); return false; } }
      ],
      onClose: function () { if (!done && o.onBack) o.onBack(); },
      onMount: function (root, close) {
        var input = W.$('#gt-input', root);
        setTimeout(function () { input.focus(); input.select(); }, 30);
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { e.preventDefault(); save(root, close); }
        });
      }
    });

    function save(root, close) {
      if (saving) return;
      var input = W.$('#gt-input', root), err = W.$('#gt-err', root);
      var name = input.value.trim();
      err.textContent = '';
      if (!TAG_RE.test(name)) { err.textContent = 'Use 3 to 16 letters, numbers or underscores.'; return; }
      if (RUDE.test(name)) { err.textContent = 'Please pick a different name.'; return; }
      saving = true;
      claim(name).then(function (r) {
        saving = false;
        if (r === 'taken') { err.textContent = 'Somebody already has that name. Try another.'; return; }
        if (r === 'rude' || r === 'invalid') { err.textContent = 'Please pick a different name.'; return; }
        W.state.gamertag = name;
        W.state.boardSent = {};               /* a new name, so say everything again */
        W.saveNow();
        done = true;
        close();
        if (r === 'offline') W.toast('Saved on this device', 'It goes on the leaderboards once you are online.', I.info, 4200);
        sync();
        if (o.then) o.then(name);
      });
    }
  }

  function ensureTag(then) {
    if (tag()) { then(tag()); return; }
    askTag({ then: then });
  }

  /* ============================== syncing ========================== */
  var busy = false, timer = null;

  function pending() {
    var out = [];
    Object.keys(SCORERS).forEach(function (id) {
      var sc = SCORERS[id], rec = (W.state.games || {})[id];
      if (!rec) return;
      var v = sc.get(rec);
      if (v === null || v === undefined) return;
      if (!sc.asc && v <= 0) return;
      var sent = (W.state.boardSent || {})[id];
      if (sent !== undefined && (sc.asc ? v >= sent : v <= sent)) return;
      out.push({ id: id, v: v, asc: !!sc.asc });
    });
    return out;
  }

  function sync() {
    var c = sb();
    if (!tag() || !c || busy) return Promise.resolve();
    var jobs = pending();
    if (!jobs.length) return Promise.resolve();
    busy = true;
    var reclaimed = false;

    function one(j) {
      return c.rpc('submit_game_score', {
        p_game: j.id, p_device: deviceId(), p_score: j.v, p_asc: j.asc
      }).then(function (res) {
        var e = res && res.error;
        if (!e) { remember(j); return; }
        var msg = String(e.message || '');
        if (/no gamertag/i.test(msg) && !reclaimed) {
          reclaimed = true;                    /* claimed offline earlier: do it now, once */
          return claim(tag()).then(function (r) { if (r === 'ok') return one(j); });
        }
        if (/blocked/i.test(msg)) remember(j); /* the teacher said no, so stop asking */
      });
    }
    function remember(j) {
      (W.state.boardSent || (W.state.boardSent = {}))[j.id] = j.v;
      W.save();
    }

    return jobs.reduce(function (p, j) { return p.then(function () { return one(j); }); }, Promise.resolve())
      .catch(function () {})
      .then(function () { busy = false; });
  }

  var soon = null;
  function touch() {
    if (!tag()) return;
    clearTimeout(soon);
    soon = setTimeout(sync, 1500);
  }

  function start() {
    if (timer) return;
    timer = setInterval(sync, 20000);
    setTimeout(sync, 2500);
  }

  /* ============================== the board ======================== */
  function catalogue() { return (global.Games && global.Games.catalogue) ? global.Games.catalogue() : []; }

  function open(gameId) { ensureTag(function () { show(gameId); }); }

  function show(gameId) {
    var games = catalogue();
    if (!games.length) return;
    var current = games.some(function (g) { return g.id === gameId; }) ? gameId : games[0].id;

    global.UI.modal({
      title: 'Leaderboards', icon: I.trophy, wide: true,
      body:
        '<div class="field"><label class="field__label" for="lb-game">Game</label>' +
        '<select class="input" id="lb-game">' +
          games.map(function (g) {
            return '<option value="' + esc(g.id) + '"' + (g.id === current ? ' selected' : '') + '>' + esc(g.title) + '</option>';
          }).join('') +
        '</select></div>' +
        '<div id="lb-body" class="lb-body" aria-live="polite"></div>' +
        '<div class="lb-you">Playing as <b id="lb-tag">' + esc(tag()) + '</b> · <button class="linkbtn" id="lb-change" type="button">Change</button></div>',
      actions: [{ label: 'Done', cls: 'btn--ghost', close: true }],
      onMount: function (root) {
        var sel = W.$('#lb-game', root), body = W.$('#lb-body', root);
        var token = 0;

        function load() {
          var id = sel.value, sc = SCORERS[id] || best(), mine = ++token;
          body.innerHTML = '<div class="lb-empty">Loading…</div>';
          var c = sb();
          if (!c) { body.innerHTML = notOn(id, sc); return; }
          sync().then(function () {
            return c.rpc('game_leaderboard', { p_game: id, p_asc: !!sc.asc, p_device: deviceId(), p_limit: 25 });
          }).then(function (res) {
            if (mine !== token) return;                      /* they changed game meanwhile */
            if (!res || res.error) { body.innerHTML = notOn(id, sc); return; }
            body.innerHTML = rows(res.data || [], sc);
          }, function () { if (mine === token) body.innerHTML = notOn(id, sc); });
        }

        sel.addEventListener('change', load);
        W.$('#lb-change', root).addEventListener('click', function () {
          askTag({ then: function () { W.$('#lb-tag', root).textContent = tag(); load(); } });
        });
        load();
      }
    });
  }

  function rows(list, sc) {
    if (!list.length) return '<div class="lb-empty">Nobody is on this board yet. Play a round and it could be you.</div>';
    var prev = 0;
    return '<ol class="lb-list">' + list.map(function (r) {
      var gap = prev && r.rank > prev + 1 ? '<li class="lb-gap" aria-hidden="true">…</li>' : '';
      prev = r.rank;
      return gap + '<li class="lb-row' + (r.mine ? ' is-mine' : '') + '">' +
        '<span class="lb-rank">' + (r.rank === 1 ? I.trophy : r.rank) + '</span>' +
        '<span class="lb-name">' + esc(r.gamertag) + (r.mine ? ' <i>you</i>' : '') + '</span>' +
        '<span class="lb-score mono">' + esc(sc.fmt(r.score)) + '</span></li>';
    }).join('') + '</ol>';
  }

  function notOn(id, sc) {
    var rec = (W.state.games || {})[id], v = rec ? sc.get(rec) : null;
    return '<div class="lb-empty">The shared boards are not switched on yet, so only your own best shows for now.' +
      (v ? '<div class="lb-mine mono">Your best: ' + esc(sc.fmt(v)) + '</div>' : '') + '</div>';
  }

  global.GameBoards = {
    open: open, askTag: askTag, ensureTag: ensureTag, sync: sync, touch: touch,
    start: start, get tag() { return tag(); }
  };

  /* Boards only matter once there is a tag, so the timer is cheap until
     then: sync() returns at once without one. */
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})(window);
