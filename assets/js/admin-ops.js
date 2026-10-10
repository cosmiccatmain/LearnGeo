/* ------------------------------------------------------------------
   LearnGeo — the Administrator page's line to the server.

   Everything that reaches ANOTHER account goes through here, and
   nothing here decides anything. The checks are all server side, in
   supabase/migrations/0007_administrator.sql: this file cannot grant
   itself permission by being edited, because permission is not kept
   in it.

   WHAT IT HOLDS

   One token, in memory, for at most 29 minutes. Not the passphrase.
   The passphrase arrives once, from the unlock dialog, is exchanged
   for the token and is then gone — connect() does not keep it, and
   there is no variable it could be read back out of.

   Nothing is written to localStorage. A refreshed tab is signed out
   of admin, which is the correct amount of convenience for a console
   that can empty somebody's balance.

   WHAT A FAILURE MEANS

   Three failures look alike from the outside and need telling apart,
   because the fix for each is different and a wrong guess sends
   somebody to the wrong place:

     notready   signed out, or Supabase is not up in this page
     nomigration  0007 has not been run; the function does not exist
     expired    the token has aged out, or was never ultra

   Everything else is reported as it came back. A call that failed is
   never reported as a call that did nothing.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';

  var LIFE = 29 * 60e3;     /* the server says 30; expire a minute early */

  var token = null;
  var until = 0;
  var scope = '';
  var opening = null;

  function sb() { return (global.Cloud && global.Cloud.sb) || null; }
  function signedIn() { return !!(global.Cloud && global.Cloud.user && global.Cloud.user.id); }

  function live() { return !!token && Date.now() < until; }

  /* PostgREST says PGRST202 for a function it cannot find, and some
     versions only say so in the message. Same shape as admin-pin.js. */
  function missing(err) {
    if (!err) return false;
    if (err.code === 'PGRST202' || err.code === '42883') return true;
    return /could not find|does not exist|schema cache/i.test(String(err.message || ''));
  }

  function denied(err) {
    if (!err) return false;
    return err.code === '42501' || /not authorised|not authorized/i.test(String(err.message || ''));
  }

  function fault(kind, message) { return { ok: false, kind: kind, message: message }; }

  /* ------------------------------------------------------------------
     Exchange the passphrase for a token. Called by admin.js the moment
     an ultra code is accepted, with the string the person typed.

     Answers a promise so a caller can wait, but nothing has to: the
     page opens, shows "connecting", and the first call waits on the
     same promise rather than starting a second exchange.
  ------------------------------------------------------------------ */
  function connect(code, got) {
    if (got && got !== 'ultra') return Promise.resolve(fault('expired', 'That code is not UltraAdmin.'));
    var client = sb();
    if (!client || !signedIn()) {
      return Promise.resolve(fault('notready',
        'Sign in first. Reaching another account needs an account of your own.'));
    }

    opening = client.rpc('admin_open_session', { p_code: String(code || '') })
      .then(function (res) {
        if (res.error) {
          if (missing(res.error)) {
            return fault('nomigration',
              'The database has not had 0007 run on it yet, so there is nothing to connect to.');
          }
          return fault('error', res.error.message || 'The server refused the session.');
        }
        if (!res.data) {
          /* The server answers null for a wrong code and for a code with
             no scope, on purpose, so neither can be told from the other. */
          return fault('expired', 'The server did not recognise that code.');
        }
        token = res.data;
        until = Date.now() + LIFE;
        scope = 'ultra';
        return { ok: true };
      })
      .catch(function (e) { return fault('error', String((e && e.message) || e)); })
      .then(function (r) { opening = null; return r; });

    return opening;
  }

  function disconnect() {
    var client = sb(), t = token;
    token = null; until = 0; scope = '';
    if (client && t) {
      try { client.rpc('admin_close_session', { p_token: t }); } catch (e) { /* best effort */ }
    }
  }

  /* Minutes left, for the page to show. 0 once it has gone. */
  function minutesLeft() {
    return live() ? Math.max(0, Math.round((until - Date.now()) / 60000)) : 0;
  }

  /* ------------------------------------------------------------------
     One call. Every RPC below goes through it so the three failures are
     described in one place rather than at eight call sites.
  ------------------------------------------------------------------ */
  function call(fn, args) {
    var client = sb();
    if (!client || !signedIn()) {
      return Promise.resolve(fault('notready', 'Signed out. Sign in and open UltraAdmin again.'));
    }
    var wait = opening ? opening : Promise.resolve(null);

    return wait.then(function () {
      if (!live()) {
        return fault('expired', 'The admin session has ended. Close this and open UltraAdmin again.');
      }
      var payload = { p_token: token };
      for (var k in args) { if (Object.prototype.hasOwnProperty.call(args, k)) payload[k] = args[k]; }

      return client.rpc(fn, payload).then(function (res) {
        if (!res.error) return { ok: true, data: res.data };
        if (missing(res.error)) {
          return fault('nomigration', 'That needs 0007, which has not been run on the database yet.');
        }
        if (denied(res.error)) {
          token = null; until = 0;    /* it is gone; do not keep pretending */
          return fault('expired', 'The admin session has ended. Open UltraAdmin again.');
        }
        return fault('error', res.error.message || 'The server refused that.');
      });
    }).catch(function (e) { return fault('error', String((e && e.message) || e)); });
  }

  global.AdminOps = {
    connect: connect,
    disconnect: disconnect,
    live: live,
    minutesLeft: minutesLeft,
    get scope() { return scope; },

    stats:    function ()                 { return call('ultra_stats', {}); },
    find:     function (q)                { return call('ultra_find_accounts', { p_query: q || '' }); },
    recent:   function (n)                { return call('ultra_recent_actions', { p_limit: n || 20 }); },

    /* Exactly one of delta / set. Passing both is a caller bug, and the
       server takes `set` when it happens rather than guessing. */
    gems:     function (id, opts)         {
      return call('ultra_adjust_gems', {
        p_target: id,
        p_delta: (opts && typeof opts.delta === 'number') ? opts.delta : null,
        p_set:   (opts && typeof opts.set   === 'number') ? opts.set   : null,
        p_reason: (opts && opts.reason) || ''
      });
    },

    staff:    function (id, on)           { return call('ultra_set_staff', { p_target: id, p_on: !!on }); },
    allowList: function ()                { return call('ultra_allow_list', {}); },
    allow:    function (email, on)        { return call('ultra_allow_set', { p_email: email, p_on: !!on }); }
  };
})(window);
