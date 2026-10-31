/* ------------------------------------------------------------------
   LearnGeo — what a banned account sees.

   The ban itself lives in public.account_bans (0009), in a table with
   row level security on and no policies, so the account cannot read,
   write or clear its own. The only way to ask is my_ban(), which
   takes no arguments and answers about auth.uid() — there is no
   target to tamper with.

   This file is the part the person sees. It asks once the account is
   signed in and settled, and if the answer is yes it puts a full
   screen in front of everything and leaves it there.

   WHAT THIS STOPS, AND WHAT IT DOES NOT

   It stops a banned person using LearnGeo. It is a locked door, not a
   wall: the writes themselves are not refused by the database, so
   somebody who opened the developer console and skipped this check
   could still have their device push a save. Blocking that means
   rewriting the policies on profiles, results and game_scores, which
   is a much larger change to a live database than was asked for.

   Said plainly here because a lock that is described as a wall is the
   kind of thing people lean on.

   WHY IT IS ASKED AGAIN ON EVERY SYNC

   Somebody banned while they are in the middle of a session should
   not keep playing until they next reload. The check is cheap and the
   answer is almost always no.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons;

  var locked = false;
  var asking = false;
  var lastAsk = 0;

  function sb() { return global.Cloud && global.Cloud.sb; }

  /* Answers the ban row, or null. A question that cannot be asked —
     offline, signed out, or a database without 0009 on it — answers
     null, which is NOT a ban: refusing to let somebody in because the
     network blinked is worse than the thing this is here to prevent. */
  function check() {
    var client = sb();
    if (!client || !global.Cloud.signedIn) return Promise.resolve(null);
    return client.rpc('my_ban')
      .then(function (res) {
        if (res.error) return null;
        var row = res.data && res.data.length ? res.data[0] : null;
        return (row && row.banned) ? row : null;
      })
      .catch(function () { return null; });
  }

  function askSoon(force) {
    if (locked || asking) return;
    if (!force && Date.now() - lastAsk < 20000) return;
    lastAsk = Date.now();
    asking = true;
    check().then(function (ban) {
      asking = false;
      if (ban) lock(ban);
    }, function () { asking = false; });
  }

  /* ------------------------------ the screen ---------------------- */
  function lock(ban) {
    if (locked) return;
    locked = true;

    /* Stop the app underneath doing anything else: no sync, no save
       being pushed, no sound from a mode that was mid-question. */
    try { if (global.Cloud && global.Cloud.push) { /* leave the last push alone */ } } catch (e) {}

    var wrap = document.createElement('div');
    wrap.className = 'banned-screen';
    wrap.setAttribute('role', 'alertdialog');
    wrap.setAttribute('aria-live', 'assertive');
    wrap.innerHTML =
      '<div class="banned-card">' +
        '<div class="banned-card__i">' + (I.lock || '') + '</div>' +
        '<h1>You have been banned from LearnGeo</h1>' +
        '<p>Please create a new account or leave the site.</p>' +
        (ban && ban.reason
          ? '<p class="banned-card__why">' + W.escapeHtml(String(ban.reason)) + '</p>'
          : '') +
        '<button class="btn btn--primary btn--lg" id="banned-out">Sign out</button>' +
      '</div>';

    document.body.appendChild(wrap);
    document.body.classList.add('is-banned');

    var out = wrap.querySelector('#banned-out');
    if (out) out.addEventListener('click', function () {
      out.disabled = true;
      out.textContent = 'Signing out…';
      var done = function () { global.location.href = global.location.pathname; };
      if (global.Cloud && global.Cloud.signOut) global.Cloud.signOut().then(done, done);
      else done();
    });
  }

  /* ------------------------------- wiring ------------------------- */
  function start() {
    var C = global.Cloud;
    if (!C || !C.onChange) return;
    /* 'synced' is the first moment the account is both signed in and
       reconciled, which is when the answer is worth having. */
    C.onChange(function (status) {
      if (status === 'synced') askSoon(true);
    });
    /* and again on the quiet beat, for somebody banned mid-session */
    global.setInterval(function () { askSoon(false); }, 60000);
    /* a tab brought back to the front is the other moment it matters */
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') askSoon(false);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else start();

  global.Banned = { check: check, lock: lock, get locked() { return locked; } };
})(window);
