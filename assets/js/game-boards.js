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

   The modal covers the whole hub: an All overview with a short board
   per game, plus a chip rail to open any one board in full. Scores are
   formatted per game (wins, metres, strokes against par, points).

   Fail soft. Until the SQL has been run, or while offline, the tag is
   kept on the device, scores wait, and the board says it is not switched
   on yet. Nothing here throws into a game.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons;

  var TAG_RE = /^[A-Za-z0-9_]{3,16}$/;
  var RUDE = /(fuck|shit|cunt|nigg|fag|rape|nazi|hitler|whore|slut|dick|cock|bitch)/i;
  var ALL = '__all__';

  function toPar(n) { return n === 0 ? 'E' : (n > 0 ? '+' + n : String(n)); }
  function num(n) { return Number(n).toLocaleString(); }
  function pts(n) { return num(n) + (n === 1 ? ' pt' : ' pts'); }

  /* Where each game keeps the number its board is ranked on, whether
     lower is better, how to print it, and a short line for the board
     header. Golf ranks the nine-hole best, in strokes against par.
     Geo Chess / Chess Duel share one Elo board (game_id chess). Elo
     can go down, so replace:true always re-submits the current rating. */
  var SCORERS = {
    chess:    { get: function (r) {
                  if (global.ChessElo) global.ChessElo.ensure(r);
                  /* Only publish after at least one rated game so everyone
                     does not land on the board at the starting 1000. */
                  if (!(r.eloGames > 0) || typeof r.elo !== 'number') return null;
                  return r.elo;
                },
                fmt: function (n) { return num(n) + ' Elo'; },
                metric: 'Chess Elo rating · vs bots and Chess Duel',
                replace: true },
    duel:     { get: function (r) { return r.wins || 0; },
                fmt: function (n) { return num(n) + (n === 1 ? ' win' : ' wins'); },
                metric: 'Wins against friends' },
    chessduel:{ /* Shared Elo with Geo Chess — board alias opens chess. */
                get: function () { return null; },
                fmt: function (n) { return num(n) + ' Elo'; },
                metric: 'Chess Elo rating · same board as Geo Chess',
                alias: 'chess' },
    dash:     { get: function (r) { return r.best || 0; },
                fmt: function (n) { return num(n) + ' m'; },
                metric: 'Best distance' },
    orbit:    { get: function (r) { return r.best || 0; }, fmt: pts, metric: 'Best score' },
    snake:    { get: function (r) { return r.best || 0; }, fmt: pts, metric: 'Best score' },
    golf:     { get: function (r) { return r.best && typeof r.best['9'] === 'number' ? r.best['9'] : null; },
                asc: true,
                fmt: function (n) { return toPar(n) + ' · 9 holes'; },
                metric: 'Best 9-hole score vs par · lower is better' },
    invaders: ptsBest(), breakout: ptsBest(), maze: ptsBest(), typer: ptsBest(),
    crossing: ptsBest(), whack: ptsBest(), match: ptsBest(), sort: ptsBest(),
    stack: ptsBest(),
    echo:     { get: function (r) { return r.best || 0; }, fmt: pts, metric: 'Best score' }
  };
  function ptsBest() { return { get: function (r) { return r.best || 0; }, fmt: pts, metric: 'Best score' }; }
  function best() { return { get: function (r) { return r.best || 0; }, fmt: num, metric: 'Best score' }; }

  function sb() { return global.Cloud && global.Cloud.sb; }
  function esc(t) { return W.escapeHtml(String(t)); }
  function scorer(id) { return SCORERS[id] || best(); }

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

  /* 'ok', 'taken', 'invalid', 'rude', 'signin' (LEA-55 account gate),
     or 'offline' when there is nobody to ask yet. Offline is not a
     failure: the tag is kept on the device and claimed the next time
     a score is sent. */
  function claim(name) {
    var c = sb();
    if (!c) return Promise.resolve('offline');
    if (!signedIn()) return Promise.resolve('signin');
    return c.rpc('claim_gamertag', { p_device: deviceId(), p_tag: name }).then(function (res) {
      if (res && res.error) {
        var msg = String((res.error && res.error.message) || '');
        if (/signin|not authenticated|JWT/i.test(msg)) return 'signin';
        return 'offline';
      }
      return res.data || 'offline';
    }, function () { return 'offline'; });
  }

  function signedIn() { return !!(global.Cloud && global.Cloud.signedIn); }

  /* ========================= asking for a tag ====================== */
  /* o.then runs once there is a tag. o.onBack runs if the box is
     dismissed without one, so the first-screen chooser can come back. */
  function askTag(o) {
    o = o || {};
    /* LEA-55: gamertags / scores need an account — send guests to auth. */
    if (!signedIn()) {
      if (global.Games && global.Games.promptAccount) {
        global.Games.promptAccount(function () { askTag(o); });
      } else if (global.UI && global.UI.openAuth) {
        global.UI.openAuth('signup', function () { askTag(o); });
      } else if (o.onBack) {
        o.onBack();
      }
      return;
    }
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
      onClose: function (reason) { if (reason !== 'navigation' && !done && o.onBack) o.onBack(); },
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
        if (r === 'signin') {
          done = true;
          close();
          if (global.Games && global.Games.promptAccount) {
            global.Games.promptAccount(function () { askTag(o); });
          } else if (global.UI && global.UI.openAuth) {
            global.UI.openAuth('signup', function () { askTag(o); });
          }
          return;
        }
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
    if (!signedIn()) {
      if (global.Games && global.Games.promptAccount) {
        global.Games.promptAccount(function () { ensureTag(then); });
      } else if (global.UI && global.UI.openAuth) {
        global.UI.openAuth('signup', function () { ensureTag(then); });
      }
      return;
    }
    if (tag()) { then(tag()); return; }
    askTag({ then: then });
  }

  /* ============================== syncing ========================== */
  var busy = false, timer = null;

  function pending() {
    var out = [];
    Object.keys(SCORERS).forEach(function (id) {
      var sc = SCORERS[id], rec = (W.state.games || {})[id];
      if (!rec || sc.alias) return;
      var v = sc.get(rec);
      if (v === null || v === undefined) return;
      if (!sc.replace && !sc.asc && v <= 0) return;
      var sent = (W.state.boardSent || {})[id];
      if (sc.replace) {
        if (sent === v) return;
      } else if (sent !== undefined && (sc.asc ? v >= sent : v <= sent)) {
        return;
      }
      out.push({ id: id, v: v, asc: !!sc.asc, replace: !!sc.replace });
    });
    return out;
  }

  function sync() {
    var c = sb();
    if (!tag() || !c || busy || !signedIn()) return Promise.resolve();
    var jobs = pending();
    if (!jobs.length) return Promise.resolve();
    busy = true;
    var reclaimed = false;

    function one(j) {
      var req = (j.id === 'chess' && j.replace)
        ? c.rpc('submit_chess_elo', { p_device: deviceId(), p_elo: j.v })
        : c.rpc('submit_game_score', {
            p_game: j.id, p_device: deviceId(), p_score: j.v, p_asc: j.asc
          });
      return req.then(function (res) {
        var e = res && res.error;
        var data = res && res.data;
        if (j.id === 'chess' && j.replace) {
          if (data && data.ok) { remember(j); return; }
          if (data && data.error === 'signin') return;
          if (data && data.error === 'no_gamertag' && !reclaimed) {
            reclaimed = true;
            return claim(tag()).then(function (r) { if (r === 'ok') return one(j); });
          }
          if (data && data.error === 'blocked') { remember(j); return; }
          if (e) {
            var em = String(e.message || '');
            if (/signin|not authenticated|JWT/i.test(em)) return;
          }
          return;
        }
        if (!e) { remember(j); return; }
        var msg = String(e.message || '');
        if (/signin|not authenticated|JWT/i.test(msg)) return; /* LEA-55 — wait for account */
        if (/no gamertag/i.test(msg) && !reclaimed) {
          reclaimed = true;                    /* claimed offline earlier: do it now, once */
          return claim(tag()).then(function (r) { if (r === 'ok') return one(j); });
        }
        if (/blocked/i.test(msg)) remember(j); /* the teacher said no, so stop asking */
        if (/premium/i.test(msg)) remember(j); /* Premium gate — do not keep retrying the score */
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

  function fetchBoard(id, limit) {
    var sc = scorer(id), c = sb();
    if (!c) return Promise.resolve({ offline: true, rows: [], sc: sc });
    return c.rpc('game_leaderboard', {
      p_game: id, p_asc: !!sc.asc, p_device: deviceId(), p_limit: limit || 25
    }).then(function (res) {
      if (!res || res.error) return { offline: true, rows: [], sc: sc };
      return { offline: false, rows: res.data || [], sc: sc };
    }, function () { return { offline: true, rows: [], sc: sc }; });
  }

  /* open() with no id (or an unknown one) lands on the All overview so
     the hub button covers every game at once. A setup screen still
     passes its own id and opens that board. */
  function boardIdFor(gameId) {
    var sc = SCORERS[gameId];
    return (sc && sc.alias) ? sc.alias : gameId;
  }

  function open(gameId) {
    ensureTag(function () { show(boardIdFor(gameId)); });
  }

  function show(gameId) {
    var games = catalogue();
    if (!games.length) return;
    gameId = boardIdFor(gameId);
    var startId = games.some(function (g) { return g.id === gameId; }) ? gameId : ALL;

    global.UI.modal({
      title: 'Game leaderboards', icon: I.trophy, wide: true,
      body:
        '<div class="gboards">' +
          '<div class="gb__screen">' +
            '<div class="gb__rail" role="tablist" aria-label="Games" id="lb-rail">' +
              chip(ALL, 'All games', startId === ALL) +
              games.map(function (g) {
                return chip(g.id, g.title, g.id === startId);
              }).join('') +
            '</div>' +
            '<p class="gb__metric" id="lb-metric"></p>' +
            '<div id="lb-body" class="lb-body" aria-live="polite"></div>' +
          '</div>' +
          '<div class="lb-you">Playing as <b id="lb-tag">' + esc(tag()) + '</b> · ' +
            '<button class="linkbtn" id="lb-change" type="button">Change</button></div>' +
        '</div>',
      actions: [{ label: 'Done', cls: 'btn--ghost', close: true }],
      onMount: function (root) {
        var rail = W.$('#lb-rail', root), body = W.$('#lb-body', root);
        var metric = W.$('#lb-metric', root);
        var token = 0;
        var current = startId;

        function setChip(id) {
          current = id;
          W.$$('.gb__chip', rail).forEach(function (b) {
            var on = b.getAttribute('data-game') === id;
            b.classList.toggle('is-on', on);
            b.setAttribute('aria-selected', on ? 'true' : 'false');
          });
          var onChip = W.$('.gb__chip.is-on', rail);
          if (onChip && onChip.scrollIntoView) {
            try { onChip.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); }
            catch (e) { /* older browsers */ }
          }
        }

        function load() {
          var id = current, mine = ++token;
          body.innerHTML = global.CookingLoader
            ? '<div class="lb-empty lb-empty--loading">' + global.CookingLoader.html({ size: 'inline' }) + '</div>'
            : '<div class="lb-empty lb-empty--loading"><span class="gb__pulse" aria-hidden="true"></span>Loading…</div>';
          if (id === ALL) {
            metric.textContent = 'Top scores across every game';
            loadAll(mine);
            return;
          }
          var bid = boardIdFor(id);
          var g = games.filter(function (x) { return x.id === id; })[0];
          var boardGame = games.filter(function (x) { return x.id === bid; })[0] || g;
          var sc = scorer(bid);
          metric.textContent = (boardGame ? boardGame.title + ' · ' : '') + (sc.metric || 'Best score');
          var c = sb();
          if (!c) { body.innerHTML = notOn(bid, sc); return; }
          sync().then(function () { return fetchBoard(bid, 25); }).then(function (res) {
            if (mine !== token) return;
            if (res.offline) { body.innerHTML = notOn(bid, sc); return; }
            body.innerHTML = boardPanel(boardGame, res.rows, sc, false);
          });
        }

        function loadAll(mine) {
          var c = sb();
          if (!c) {
            body.innerHTML = '<div class="lb-empty">The shared boards are not switched on yet. ' +
              'Your own bests still show on each game’s setup screen.</div>';
            return;
          }
          sync().then(function () {
            /* Skip aliased boards (Chess Duel → Geo Chess Elo) so All
               does not list the same Elo table twice. */
            var listed = games.filter(function (g) { return boardIdFor(g.id) === g.id; });
            return Promise.all(listed.map(function (g) {
              return fetchBoard(g.id, 3).then(function (res) {
                return { game: g, res: res };
              });
            }));
          }).then(function (parts) {
            if (mine !== token) return;
            if (parts.every(function (p) { return p.res.offline; })) {
              body.innerHTML = '<div class="lb-empty">The shared boards are not switched on yet. ' +
                'Your own bests still show on each game’s setup screen.</div>';
              return;
            }
            body.innerHTML = '<div class="gb__sections">' + parts.map(function (p) {
              return section(p.game, p.res);
            }).join('') + '</div>';
            W.$$('[data-open-game]', body).forEach(function (btn) {
              btn.addEventListener('click', function () {
                setChip(btn.getAttribute('data-open-game'));
                load();
              });
            });
          });
        }

        rail.addEventListener('click', function (e) {
          var btn = e.target.closest && e.target.closest('[data-game]');
          if (!btn || !rail.contains(btn)) return;
          setChip(btn.getAttribute('data-game'));
          load();
        });
        W.$('#lb-change', root).addEventListener('click', function () {
          askTag({ then: function () { W.$('#lb-tag', root).textContent = tag(); load(); } });
        });
        setChip(current);
        load();
      }
    });
  }

  function chip(id, label, on) {
    return '<button type="button" class="gb__chip' + (on ? ' is-on' : '') + '" role="tab" ' +
      'data-game="' + esc(id) + '" aria-selected="' + (on ? 'true' : 'false') + '">' +
      esc(label) + '</button>';
  }

  function section(g, res) {
    var sc = res.sc;
    var initial = (g.title || g.id || '?').charAt(0).toUpperCase();
    var head =
      '<div class="gb__sec-head">' +
        '<div class="gb__sec-title">' +
          '<span class="gb__sec-mark" aria-hidden="true">' + esc(initial) + '</span>' +
          '<div><b>' + esc(g.title) + '</b><span>' + esc(sc.metric || 'Best score') + '</span></div>' +
        '</div>' +
        '<button type="button" class="linkbtn gb__sec-more" data-open-game="' + esc(g.id) + '">Full board</button>' +
      '</div>';
    if (res.offline) {
      return '<section class="gb__sec">' + head +
        '<div class="lb-empty lb-empty--compact">Board offline for now.</div></section>';
    }
    if (!res.rows.length) {
      return '<section class="gb__sec">' + head +
        '<div class="lb-empty lb-empty--compact">Nobody on this board yet. Be the first.</div></section>';
    }
    return '<section class="gb__sec">' + head + rows(res.rows, sc, true) + '</section>';
  }

  function boardPanel(g, list, sc, compact) {
    if (!list.length) {
      return emptyState(g, sc);
    }
    return rows(list, sc, compact);
  }

  function emptyState(g, sc) {
    var rec = (W.state.games || {})[g.id], v = rec ? sc.get(rec) : null;
    if ((v === null || v === undefined) && sc.replace && rec && typeof rec.elo === 'number') {
      v = rec.elo; /* show provisional Elo even before first publish */
    }
    var local = (v !== null && v !== undefined && (sc.replace || sc.asc || v > 0))
      ? '<div class="lb-mine mono">Your rating on this device: ' + esc(sc.fmt(v)) + '</div>'
      : '';
    return '<div class="lb-empty">' +
      '<div class="lb-empty__glyph" aria-hidden="true">' + I.trophy + '</div>' +
      '<p>Nobody is on the ' + esc(g.title) + ' board yet.</p>' +
      '<p class="lb-empty__hint">Play a round and your gamertag can take first place.</p>' +
      local +
    '</div>';
  }

  function rows(list, sc, compact) {
    var prev = 0;
    return '<ol class="lb-list' + (compact ? ' lb-list--compact' : '') + '">' + list.map(function (r) {
      var gap = prev && r.rank > prev + 1 ? '<li class="lb-gap" aria-hidden="true">…</li>' : '';
      prev = r.rank;
      var medal = r.rank <= 3 ? ' lb-rank--' + r.rank : '';
      var rankHtml = r.rank === 1 ? I.trophy : String(r.rank);
      return gap + '<li class="lb-row' + (r.mine ? ' is-mine' : '') + '">' +
        '<span class="lb-rank' + medal + '">' + rankHtml + '</span>' +
        '<span class="lb-name">' + esc(r.gamertag) + (r.mine ? ' <i>you</i>' : '') + '</span>' +
        '<span class="lb-score mono">' + esc(sc.fmt(r.score)) + '</span></li>';
    }).join('') + '</ol>';
  }

  function notOn(id, sc) {
    var rec = (W.state.games || {})[id], v = rec ? sc.get(rec) : null;
    var local = (v !== null && v !== undefined && (sc.asc || v > 0))
      ? '<div class="lb-mine mono">Your best: ' + esc(sc.fmt(v)) + '</div>'
      : '';
    return '<div class="lb-empty">' +
      '<div class="lb-empty__glyph" aria-hidden="true">' + I.trophy + '</div>' +
      '<p>The shared boards are not switched on yet.</p>' +
      '<p class="lb-empty__hint">Only your own best shows for now. Scores still save on this device.</p>' +
      local +
    '</div>';
  }

  global.GameBoards = {
    open: open, askTag: askTag, ensureTag: ensureTag, sync: sync, touch: touch,
    start: start, deviceId: deviceId, get tag() { return tag(); }
  };

  /* Boards only matter once there is a tag, so the timer is cheap until
     then: sync() returns at once without one. */
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})(window);
