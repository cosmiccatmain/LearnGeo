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

  /* Is this the function itself being absent — the database not having
     had the migration — rather than something going wrong inside it?

     Decided by CODE, never by the message alone. The first version also
     matched "does not exist" anywhere in the text, and that phrase is
     how Postgres reports a missing COLUMN (42703) or TABLE (42P01) too.
     So a function that existed and failed on a bad column was reported
     as "the migration has not been run", which sent everybody to re-run
     SQL that was already there. Worse, in admin-pin.js a null from
     mayOpen hands the gems gate to the list kept on this device.

       PGRST202  PostgREST cannot find the function at all
       42883     undefined_function — but Postgres raises it for a missing
                 OPERATOR inside a body too, so it counts only when the
                 message names the function that was called

     Anything else with a code is a real failure and is reported as one.
     Only a codeless error falls back to the message. */
  function missing(err, fn) {
    if (!err) return false;
    var msg = String(err.message || '');
    if (err.code === 'PGRST202') return true;
    if (err.code === '42883') return !!fn && msg.indexOf(fn) !== -1 && /function/i.test(msg);
    if (err.code) return false;
    return /could not find the function/i.test(msg);
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
          if (missing(res.error, 'admin_open_session')) {
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

  /* ========================= this device ===========================
     A Private Password works only on the device it was set on (0009).
     What makes it this device is a random 256-bit id kept in this
     browser's own storage — deliberately NOT in the save, because the
     save syncs to the account and would carry the id to every device
     the account signs in on, which is the opposite of the point.

     Clearing site data loses the id, and with it the Private Password
     here. The real code still works, and setting a new one is a minute.

     `accounts` records which accounts set one on this device, so the
     unlock dialog can say "your Private Password" only to somebody who
     has one, and so two people sharing a laptop do not see each other's
     state. It is a hint for the wording, never a permission: the server
     decides whether a password opens anything.
  ------------------------------------------------------------------ */
  var DEVICE_KEY = 'learngeo.adminDevice.v1';

  function readDevice() {
    try {
      var d = JSON.parse(global.localStorage.getItem(DEVICE_KEY) || 'null');
      if (d && typeof d.id === 'string' && /^[0-9a-f]{64}$/.test(d.id)) {
        if (!d.accounts || typeof d.accounts !== 'object') d.accounts = {};
        return d;
      }
    } catch (e) { /* storage blocked or junk: treated as no device */ }
    return null;
  }

  function writeDevice(d) {
    try { global.localStorage.setItem(DEVICE_KEY, JSON.stringify(d)); return true; }
    catch (e) { return false; }
  }

  function device(create) {
    var d = readDevice();
    if (d || !create) return d;
    if (!global.crypto || !global.crypto.getRandomValues) return null;
    var bytes = new Uint8Array(32);
    global.crypto.getRandomValues(bytes);
    var hex = '';
    for (var i = 0; i < bytes.length; i++) hex += ('0' + bytes[i].toString(16)).slice(-2);
    d = { id: hex, accounts: {} };
    return writeDevice(d) ? d : null;
  }

  function me() { return (global.Cloud && global.Cloud.user && global.Cloud.user.id) || ''; }

  function hasPrivate() {
    var d = readDevice(), uid = me();
    return !!(d && uid && d.accounts[uid]);
  }

  function markPrivate(on) {
    var d = device(on), uid = me();
    if (!d || !uid) return;
    if (on) d.accounts[uid] = Date.now(); else delete d.accounts[uid];
    writeDevice(d);
  }

  /* Open a session with a Private Password instead of a code. The server
     answers a token, a lock, or null; null covers "not on the list", "no
     Private Password on this device" and "wrong", on purpose. */
  function openPrivate(password) {
    var client = sb(), d = readDevice();
    if (!client || !signedIn()) {
      return Promise.resolve(fault('notready', 'Sign in first.'));
    }
    if (!d) return Promise.resolve(fault('wrong', 'Wrong code or Private Password.'));

    opening = client.rpc('admin_open_session_private', { p_password: String(password || ''), p_device: d.id })
      .then(function (res) {
        if (res.error) {
          if (missing(res.error, 'admin_open_session_private')) {
            return fault('nomigration', 'Private Passwords need 0009, which has not been run yet.');
          }
          return fault('error', res.error.message || 'The server refused that.');
        }
        var r = res.data;
        if (r && r.token) {
          token = r.token; until = Date.now() + LIFE; scope = 'ultra';
          return { ok: true };
        }
        if (r && r.locked_until) {
          return { ok: false, kind: 'locked', until: Date.parse(r.locked_until),
                   message: 'Too many wrong tries on this device.' };
        }
        return fault('wrong', 'Wrong code or Private Password.');
      })
      .catch(function (e) { return fault('error', String((e && e.message) || e)); })
      .then(function (r) { opening = null; return r; });
    return opening;
  }

  function setPrivate(password) {
    var d = device(true);
    if (!d) return Promise.resolve(fault('error', 'This browser will not store a device id, so a Private Password cannot be tied to it.'));
    return call('admin_set_private_password', { p_device: d.id, p_password: String(password || '') })
      .then(function (r) { if (r.ok) markPrivate(true); return r; });
  }

  function clearPrivate() {
    var d = readDevice();
    if (!d) { markPrivate(false); return Promise.resolve({ ok: true }); }
    return call('admin_clear_private_password', { p_device: d.id })
      .then(function (r) { if (r.ok) markPrivate(false); return r; });
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
        if (missing(res.error, fn)) {
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
    message:  function (id, text)         { return call('ultra_send_message', { p_target: id, p_text: String(text || '') }); },
    /* Past the 2,000,000,000 cap, up to the largest whole number a browser
       holds exactly. The caller checks the range first; the server
       checks it again and its answer is the one that counts. */
    override: function (id, amount, why)  { return call('ultra_override_gems', { p_target: id, p_amount: amount, p_reason: why || 'override' }); },

    /* Admin classrooms (0010). */
    classes:  function (q)                { return call('ultra_list_classes', { p_query: q || '' }); },
    setAdminClass: function (id, on)      { return call('ultra_set_admin_class', { p_class: id, p_on: !!on }); },

    hasPrivate: hasPrivate,
    openPrivate: openPrivate,
    setPrivate: setPrivate,
    clearPrivate: clearPrivate,
    allowList: function ()                { return call('ultra_allow_list', {}); },
    allow:    function (email, on)        { return call('ultra_allow_set', { p_email: email, p_on: !!on }); }
  };
})(window);
