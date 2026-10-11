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

  var EVERY = 120e3;        /* while the tab is visible */
  var MIN_GAP = 30e3;       /* never closer together than this */

  var last = 0;
  var busy = false;
  var dead = false;         /* the function is not on the database; stop asking */

  function C() { return global.Cloud; }

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
          var m = String(res.error.message || ''), c = res.error.code;
          if (c === 'PGRST202' || c === '42883' || /could not find|does not exist|schema cache/i.test(m)) {
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

    rows.forEach(function (r) {
      var d = r.detail || {};
      if (r.action === 'gems') {
        /* A "set" is an absolute instruction and is followed as one. A
           take or a give is a difference, applied to what this device
           has rather than to what the server had: anything earned here
           since the last sync is kept. */
        if (typeof d.set === 'number') {
          s.economy.diamonds = Math.max(0, d.set);
        } else if (typeof d.moved === 'number') {
          s.economy.diamonds = Math.max(0, s.economy.diamonds + d.moved);
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
    if (moved !== 0) {
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

  /* After every successful sync, which includes the one right after
     signing in, when the account has just been reconciled. */
  if (C() && C().onChange) {
    C().onChange(function (status) { if (status === 'synced') check(false); });
  }
  global.addEventListener('focus', function () { check(false); });
  setInterval(function () {
    if (document.visibilityState === 'visible') check(false);
  }, EVERY);

  global.AdminInbox = { check: function () { check(true); } };
})(window);
