/* ------------------------------------------------------------------
   LearnGeo — teachers blocking games for a class.

   A teacher turns individual games off for one class from Settings. A
   signed-in student in that class then sees the game locked in the
   arcade and cannot open it, and the server refuses its scores too
   (submit_game_score checks, see 0008_game_leaderboards_and_blocks.sql).

   blocked() is synchronous on purpose, like the class switches: the
   arcade asks it while drawing, and a gate that returns a promise is a
   gate every caller will race. It answers from the last read and starts
   open, so a slow read never locks a game nobody blocked.

   A guest with no account is in no class, so nothing can be blocked for
   them. That is the limit of the thing, not a bug.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons;

  var mine = {};            /* game ids blocked for this student, by any class */
  var watchers = [];

  function sb() { return global.Cloud && global.Cloud.sb; }
  function esc(t) { return W.escapeHtml(String(t)); }
  function signedIn() { return !!(global.Cloud && global.Cloud.signedIn); }

  function blocked(id) { return !!mine[id]; }

  function onChange(fn) {
    watchers.push(fn);
    return function () { watchers = watchers.filter(function (w) { return w !== fn; }); };
  }

  /* The student's side: what is off for me. Teachers are never blocked
     from previewing their own arcade. */
  function load() {
    var c = sb();
    if (!c || !signedIn() || W.state.role === 'teacher') return Promise.resolve();
    return c.rpc('my_blocked_games').then(function (res) {
      if (!res || res.error) return;
      var next = {};
      (res.data || []).forEach(function (g) { next[typeof g === 'string' ? g : g.my_blocked_games] = true; });
      var changed = Object.keys(next).sort().join() !== Object.keys(mine).sort().join();
      mine = next;
      if (changed) watchers.slice().forEach(function (fn) { try { fn(); } catch (e) {} });
    }, function () {});
  }

  /* The teacher's side, drawn into the Settings card. */
  function mount(host, o) {
    var classId = o && o.classId;
    var games = global.Games && global.Games.catalogue ? global.Games.catalogue() : [];
    var set = {};

    function frame(inner) {
      host.innerHTML =
        '<div class="cr-card__head"><h3>Games</h3></div>' +
        '<p class="t-muted t-sm" style="margin:0 0 10px">Switch a game off and your students cannot open it. ' +
        'It applies to this class only, and to students who are signed in.</p>' + inner;
    }

    if (!classId || !global.Cloud || !global.Cloud.ready) {
      frame('<div class="lb-empty">Sign in and put this class online to block games for it.</div>');
      return;
    }
    if (!games.length) { frame('<div class="lb-empty">The arcade has not loaded yet.</div>'); return; }

    frame('<div class="lb-empty">Loading…</div>');
    sb().rpc('list_class_game_blocks', { p_class: classId }).then(function (res) {
      if (res && res.error) {
        frame('<div class="lb-empty">Game blocks are not switched on yet. They arrive with the latest database update.</div>');
        return;
      }
      (res.data || []).forEach(function (g) { set[typeof g === 'string' ? g : g.list_class_game_blocks] = true; });
      draw();
    }, function () { frame('<div class="lb-empty">Could not load. Try again in a moment.</div>'); });

    function draw() {
      frame(games.map(function (g) {
        return '<div class="setting-row">' +
          '<div class="setting-row__t"><b>' + esc(g.title) + '</b>' +
          '<span>' + (set[g.id] ? 'Blocked for this class' : 'Open to this class') + '</span></div>' +
          '<button class="switch' + (set[g.id] ? ' is-on' : '') + '" data-game="' + esc(g.id) + '" role="switch" ' +
            'aria-checked="' + (set[g.id] ? 'true' : 'false') + '" aria-label="Block ' + esc(g.title) + '"></button></div>';
      }).join(''));
      W.$$('[data-game]', host).forEach(function (b) {
        b.addEventListener('click', function () { toggle(b); });
      });
    }

    function toggle(btn) {
      var id = btn.dataset.game, want = !set[id];
      btn.disabled = true;
      sb().rpc('set_game_block', { p_class: classId, p_game: id, p_blocked: want }).then(function (res) {
        if (res && res.error) throw res.error;
        if (want) set[id] = true; else delete set[id];
        draw();
      }).catch(function (e) {
        btn.disabled = false;
        W.toast('Not saved', (e && e.message) || 'Try again', I.info, 4200);
      });
    }
  }

  global.GameBlocks = { blocked: blocked, load: load, mount: mount, onChange: onChange };
})(window);
