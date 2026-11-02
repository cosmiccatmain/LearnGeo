/* ------------------------------------------------------------------
   LearnGeo — telling the console which screen somebody is on.

   WHAT IT SENDS, AND WHAT IT DELIBERATELY DOES NOT

   The name of the view — Learn, Practice test, Games, My class — and
   the time. That is the whole payload.

   It does not send what they typed, what they answered, which country
   came up, their score, or anything drawn on their screen. A class
   monitor needs to know that somebody is on Practice test and was
   active a minute ago. It does not need the contents of the box they
   are typing into, and a tool that collects that is a different and
   much worse thing than the one that was asked for.

   The server keeps ONE ROW per account, overwritten (0009). There is
   no history, so this cannot quietly become a log of somebody's day.

   Only for signed-in accounts. A guest has no row to write and
   report_activity() returns without doing anything.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW;

  var EVERY = 45000;          /* the quiet beat, while they stay put */
  var last = '';              /* the screen we last reported */
  var lastAt = 0;
  var sending = false;

  /* The friendly name of a view, so the console reads like the app
     rather than like its source. Anything unknown is sent as-is after
     being cut short, which is also what the server does to it. */
  var NAMES = {
    portal: 'Home', classroom: 'Classroom', teacher: 'My class',
    learn: 'Learn', test: 'Practice test', quiz: 'Class quiz',
    games: 'Games', codex: 'Codex', landing: 'Landing page'
  };

  function screenNow() {
    var app = document.getElementById('app');
    if (!app || !app.classList.contains('is-open')) return 'Landing page';
    var m = String(document.body.className).match(/view-([a-z]+)/);
    var key = m ? m[1] : '';
    return NAMES[key] || (key ? key.charAt(0).toUpperCase() + key.slice(1) : 'App');
  }

  function ready() {
    var C = global.Cloud;
    return !!(C && C.sb && C.signedIn && C.ready);
  }

  function send(force) {
    if (sending || !ready()) return;
    /* A banned account is being shown the door, not watched. */
    if (global.Banned && global.Banned.locked) return;

    var now = screenNow();
    if (!force && now === last && Date.now() - lastAt < EVERY) return;

    sending = true;
    last = now;
    lastAt = Date.now();
    global.Cloud.sb.rpc('report_activity', { p_screen: now, p_detail: '' })
      .then(function () { sending = false; }, function () { sending = false; });
  }

  function start() {
    /* on the beat */
    global.setInterval(function () { send(false); }, 15000);

    /* and the moment the screen changes, which is the thing worth
       seeing: a beat alone would show somebody on Learn for a minute
       after they had left it */
    if (global.UI && typeof global.UI.go === 'function') {
      var go = global.UI.go;
      global.UI.go = function () {
        var r = go.apply(this, arguments);
        global.setTimeout(function () { send(true); }, 0);
        return r;
      };
    }

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') send(true);
    });

    var C = global.Cloud;
    if (C && C.onChange) {
      C.onChange(function (status) { if (status === 'synced') send(true); });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else start();

  global.Activity = { send: send, screenNow: screenNow };
})(window);
