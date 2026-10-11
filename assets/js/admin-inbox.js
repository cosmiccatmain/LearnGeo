/* ------------------------------------------------------------------
   LearnGeo — the receiving end of the Administrator page.

   WHY THIS EXISTS

   Diamonds live on the device. profiles.save on the server is a mirror,
   and cloud.js overwrites it whole 1.5 seconds after every change with
   no conflict check. So when an admin takes diamonds from an account
   whose app is open, that app's next answer pushes the old balance
   straight back over the edit. Without this file, taking gems from
   somebody who keeps the tab open would never stick.

   So the device pulls. my_admin_actions (0007) answers the admin
   actions aimed at THIS account that are newer than the stamp in this
   save, flags.adminAt, and this file applies them to the balance the
   device actually holds.

   WHY THEY ARE NEVER APPLIED TWICE

   The server writes the new balance and the stamp in one update. A
   device that adopted that copy holds both, asks with the new stamp,
   and gets nothing back. A device that kept its own copy, or pushed
   over the edit, holds the old stamp with the old balance and gets the
   action. The stamp and the balance only ever travel together.

   The stamp is kept as the exact string the server wrote. Turning it
   into a Date and back would round off the microseconds, the action
   would compare as newer than its own stamp, and it would be applied
   on every check for ever.

   WHAT IT DOES NOT DO

   It does not record anything in the admin ledger. A row there is read
   by the 85% penalty as an offence by this account, and an admin
   correcting somebody's balance is not one.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons;

  /* Same bounds as admin.js and 0007's ultra_adjust_gems. */
  var CAP = 2000000000;
  var MAX_SAFE = 9007199254740991;   /* the largest whole number a browser holds exactly */
  function clamp(n, top) { return Math.min(top, Math.max(0, Math.round(n))); }

  var EVERY = 120e3;        /* while the tab is visible */
  var MIN_GAP = 30e3;       /* never closer together than this */

  var last = 0;
  var busy = false;
  var dead = false;         /* the function is not on the database; stop asking */

  function C() { return global.Cloud; }

  /* Is this the function itself being absent — the database not having
     had the migration — rather than something going wrong inside it?

     Decided by CODE, never by the message alone. The first version also
     matched "does not exist" anywhere in the text, and that phrase is
     how Postgres reports a missing COLUMN (42703) or TABLE (42P01) too.
     So a function that existed and failed on a bad column was reported
     as "the migration has not been run", which sent everybody to re-run
     SQL that was already there. Here it would stop this device asking
     for the rest of the session over an error that was not that.

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

  function stamp() {
    var f = W.state.flags;
    return (f && typeof f.adminAt === 'string' && f.adminAt) ? f.adminAt : null;
  }

  function check(force) {
    var cl = C();
    if (dead || busy || !cl || !cl.ready || !cl.sb) return;
    if (!force && Date.now() - last < MIN_GAP) return;
    last = Date.now();
    busy = true;

    /* The account can change while the request is out. An answer for
       somebody else's account must not land in this save. */
    var who = cl.user && cl.user.id;

    cl.sb.rpc('my_admin_actions', { p_since: stamp() })
      .then(function (res) {
        if (!C() || !C().user || C().user.id !== who) return;
        if (res.error) {
          if (missing(res.error, 'my_admin_actions')) {
            dead = true;          /* 0007 not run; say nothing, ask again next load */
          }
          return;
        }
        apply(res.data || []);
      })
      .catch(function () { /* offline: the next check will get it */ })
      .then(function () { busy = false; });
  }

  function apply(rows) {
    if (!rows.length) return;
    var s = W.state;
    if (!s.flags || typeof s.flags !== 'object') s.flags = {};
    if (!s.economy) return;

    var before = s.economy.diamonds;
    var staffNow = null;
    var wasSet = false;

    rows.forEach(function (r) {
      var d = r.detail || {};
      if (r.action === 'gems') {
        /* A "set" is an absolute instruction and is followed as one. A
           take or a give is a difference, applied to what this device
           has rather than to what the server had: anything earned here
           since the last sync is kept. */
        /* A balance outside 0..CAP — 1.35e36 typed into the old unbounded
           box, say — cannot take a difference: in floating point
           1.35e36 - 100 IS 1.35e36, so the instruction would be silently
           lost. The server already logs such an action as a set; this is
           the second lock for an action logged before it did. */
        /* A set — ordinary or override — was range-checked by the server
           and is followed exactly, up to MAX_SAFE. A difference never
           lifts a balance above the cap, and never drags one an override
           put above it back down: the server's rule, applied here to the
           number this device actually has. */
        var mine = s.economy.diamonds;
        var sane = typeof mine === 'number' && isFinite(mine) && mine >= 0 && mine <= MAX_SAFE;
        if (typeof d.set === 'number') {
          s.economy.diamonds = clamp(d.set, MAX_SAFE); wasSet = true;
        } else if (!sane && typeof d.now === 'number') {
          s.economy.diamonds = clamp(d.now, MAX_SAFE); wasSet = true;
        } else if (typeof d.moved === 'number') {
          var base = sane ? Math.floor(mine) : 0;
          s.economy.diamonds = clamp(base + d.moved, Math.max(CAP, base));
        }
      } else if (r.action === 'staff') {
        s.flags.staff = !!d.on;
        staffNow = !!d.on;
        /* Wearing an effect you no longer hold would leave it on show
           with no way to pick it again. */
        if (!d.on && s.profile && s.profile.effect === 'staff') s.profile.effect = 'none';
      }
      s.flags.adminAt = r.created_at;
    });

    W.saveNow();                       /* and cloud.js pushes it from here */
    if (global.UI && global.UI.refreshHud) global.UI.refreshHud();
    if (global.Portal && global.Portal.render) { try { global.Portal.render(); } catch (e) {} }

    var moved = s.economy.diamonds - before;
    if (wasSet && moved !== 0) {
      W.toast('An administrator set your diamonds',
        'Balance now ' + s.economy.diamonds.toLocaleString() + ' 💎', I.gem, 6000);
    } else if (moved !== 0) {
      W.toast('An administrator changed your diamonds',
        (moved > 0 ? '+' : '−') + Math.abs(moved).toLocaleString() + ' 💎 · balance now ' +
        s.economy.diamonds.toLocaleString(), I.gem, 6000);
    }
    if (staffNow === true) {
      W.toast('You have the LearnGeo Staff effect',
        'Equip it under Customise → Profile effect.', I.sparkle, 6000);
    } else if (staffNow === false) {
      W.toast('The LearnGeo Staff effect was removed', '', I.info, 4800);
    }
  }

  /* ============================ messages =============================
     Sent from the Administrator page (0008). Pulled against their own
     cursor, flags.adminMsgAt, NOT against flags.adminAt: the server
     writes adminAt into the save with every balance change, so a device
     that adopted a save stamped by a later change would ask for actions
     after that stamp and skip clean past an unread message sent before
     it. Only this file writes adminMsgAt, and only once a message has
     been dismissed.

     So a message stays until it is seen. Close the tab with it on
     screen and it is back the next time the app opens.

     Checked every 30 seconds while the tab is visible — more often than
     balance changes, because a message is somebody waiting for a reply
     and a balance is not. One small indexed query per check.
  ------------------------------------------------------------------ */
  var MSG_EVERY = 30e3;
  var MSG_GAP = 10e3;
  var msgLast = 0, msgBusy = false, msgDead = false, showing = false;

  function msgStamp() {
    var f = W.state.flags;
    return (f && typeof f.adminMsgAt === 'string' && f.adminMsgAt) ? f.adminMsgAt : null;
  }

  function checkMessages(force) {
    var cl = C();
    if (msgDead || msgBusy || showing || !cl || !cl.ready || !cl.sb) return;
    if (!force && Date.now() - msgLast < MSG_GAP) return;
    msgLast = Date.now();
    msgBusy = true;
    var who = cl.user && cl.user.id;

    cl.sb.rpc('my_admin_messages', { p_since: msgStamp() })
      .then(function (res) {
        if (!C() || !C().user || C().user.id !== who) return;
        if (res.error) {
          if (missing(res.error, 'my_admin_messages')) msgDead = true;   /* 0008 not run yet */
          return;
        }
        var rows = (res.data || []).filter(function (m) { return m && m.body; });
        if (rows.length) showMessages(rows, who);
      })
      .catch(function () { /* offline: the next check will get it */ })
      .then(function () { msgBusy = false; });
  }

  function when(ts) {
    var t = Date.parse(ts);
    if (!t) return '';
    var m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + ' min ago';
    var h = Math.round(m / 60);
    if (h < 24) return h + (h === 1 ? ' hour ago' : ' hours ago');
    var d = Math.round(h / 24);
    return d + (d === 1 ? ' day ago' : ' days ago');
  }

  function showMessages(rows, who) {
    if (!global.UI || !global.UI.modal) return;
    showing = true;
    /* Escaped before the line breaks are put back: the text came from
       another person, and it is going into HTML. */
    var body = rows.map(function (m) {
      return '<div class="admsg">' +
        '<div class="admsg__text">' + W.escapeHtml(String(m.body)).replace(/\n/g, '<br>') + '</div>' +
        '<div class="admsg__when">' + W.escapeHtml(when(m.created_at)) + '</div>' +
      '</div>';
    }).join('');

    global.UI.modal({
      title: rows.length === 1 ? 'A message from LearnGeo' : rows.length + ' messages from LearnGeo',
      icon: I.inbox,
      body: '<p class="t-sm t-muted" style="margin:-4px 0 12px">From a LearnGeo administrator.</p>' + body,
      actions: [{ label: 'Got it', cls: 'btn--primary', close: true }],
      onClose: function () {
        showing = false;
        /* Moved only now, and only for the account it was fetched for:
           an account switch with this open must not mark messages read
           in somebody else's save. */
        if (!C() || !C().user || C().user.id !== who) return;
        if (!W.state.flags || typeof W.state.flags !== 'object') W.state.flags = {};
        W.state.flags.adminMsgAt = rows[rows.length - 1].created_at;
        W.saveNow();
        /* Twenty at a time; if there were more, show the next lot. */
        if (rows.length >= 20) setTimeout(function () { checkMessages(true); }, 400);
      }
    });
    if (W.Sound && W.Sound.gem) { try { W.Sound.gem(); } catch (e) {} }
  }

  /* After every successful sync, which includes the one right after
     signing in, when the account has just been reconciled. */
  if (C() && C().onChange) {
    C().onChange(function (status) {
      if (status === 'synced') { check(false); checkMessages(false); }
    });
  }
  global.addEventListener('focus', function () { check(false); checkMessages(false); });
  setInterval(function () {
    if (document.visibilityState === 'visible') check(false);
  }, EVERY);
  setInterval(function () {
    if (document.visibilityState === 'visible') checkMessages(false);
  }, MSG_EVERY);

  global.AdminInbox = {
    check: function () { check(true); },
    checkMessages: function () { checkMessages(true); }
  };
})(window);
