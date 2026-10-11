/* ------------------------------------------------------------------
   LearnGeo — admin codes kept in Supabase.

   The codes are not in this file and never reach the browser. The page
   sends the digits someone typed to verify_admin_pin() and gets back
   what that code is allowed to do. The table itself has row-level
   security on with no policies, so the publishable key cannot list the
   codes, only ask about one. They are stored hashed (bcrypt), not as
   plain digits.

   Two codes now, not one, because the two panels are not the same
   risk. One opens the gems panel, which edits this browser's own save.
   The other opens UltraAdmin, which reaches the class and the account.
   A single code for both means the smaller job hands out the larger
   power, which is the thing worth avoiding.

   So verify answers a SCOPE rather than a yes:

     'gems'   the admin panel: diamonds and the verified seal
     'ultra'  UltraAdmin, and everything gems can do
     false    a code that is not one of ours
     null     the question could not be asked at all

   null is not a no. It never unlocks anything, and it must never be
   treated as a wrong code either, because telling a teacher their code
   is wrong when the network is down sends them looking for the wrong
   problem.

   A four-digit code is still only four digits, so treat this as a lock
   on a drawer, not on a door. There is no code built into the page: if
   the check cannot run, nothing opens.

   On an older database verify_admin_pin returns a bare boolean. That
   still works and reads as 'gems', which is what the single code did
   before there were two. See supabase/migrations for the SQL that
   teaches it scopes.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';

  var SCOPES = ['gems', 'ultra'];

  /* What each scope may do. ultra is a superset of gems on purpose:
     somebody holding the larger code should not have to type the
     smaller one to reach the smaller panel. */
  var GRANTS = {
    gems:  ['gems'],
    ultra: ['gems', 'ultra']
  };

  function clean(scope) {
    var s = String(scope || '').toLowerCase();
    return SCOPES.indexOf(s) === -1 ? '' : s;
  }

  /* Does a granted scope cover the one being asked for? */
  function covers(granted, want) {
    var g = clean(granted);
    if (!g) return false;
    return (GRANTS[g] || []).indexOf(String(want || '')) !== -1;
  }

  /* Answers a scope string, false, or null.

     Two names are asked for, newest first. verify_admin_pin_scope says
     which panel a code opens; verify_admin_pin, the older one, says only
     yes or no. Asking for the new one and falling back means the page
     and the database can be updated in either order without a window
     where codes stop working, which is the whole reason the database
     change adds a function rather than altering the old one. */
  function read(d) {
    if (d === true) return 'gems';        /* the old yes meant the gems panel */
    if (d === false || d === null || d === undefined) return false;
    if (typeof d === 'string') return clean(d) || false;
    if (typeof d === 'object') return clean(d.scope || d.role) || false;
    return false;
  }

  function verify(code) {
    var sb = global.Cloud && global.Cloud.sb;
    if (!sb) return null;
    var pin = String(code);

    return sb.rpc('verify_admin_pin_scope', { p_pin: pin })
      .then(function (res) {
        if (!res.error) return read(res.data);
        /* Not there yet: this database has not had the change run on it.
           Anything else wrong is a real failure and must not be read as
           a wrong code. */
        if (missing(res.error, 'verify_admin_pin_scope')) {
          return sb.rpc('verify_admin_pin', { p_pin: pin })
            .then(function (r2) { return r2.error ? null : read(r2.data); })
            .catch(function () { return null; });
        }
        return null;
      })
      .catch(function () { return null; });
  }

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

  /* ================= who the gems panel opens for =================
     A right code stopped being enough. admin_allow names the accounts,
     and admin_may_open is the only way to ask about it: the table has
     row-level security on with no policies, so the publishable key can
     neither list the names nor add one.

     This is asked of the server rather than read from the save, because
     a list kept on the device is a list that device can edit, and the
     device wanting in is exactly the one with a reason to.

       true   named, and the panel may open
       false  not named, or the question failed, so nothing opens
       null   this database predates admin_may_open

     null is the only answer that hands the decision back to the caller.
     A failure answers false: a check that could not run must not open
     a panel, and the code check above already needed the network, so
     an offline browser never reaches this line anyway. */
  function mayOpen(email) {
    var sb = global.Cloud && global.Cloud.sb;
    if (!sb) return Promise.resolve(null);
    var who = String(email || '').trim();
    if (!who) return Promise.resolve(false);   /* a guest is on no list */

    return sb.rpc('admin_may_open', { p_email: who })
      .then(function (res) {
        if (!res.error) return res.data === true;
        if (missing(res.error, 'admin_may_open')) return null;   /* database behind the page */
        return false;
      })
      .catch(function () { return false; });
  }

  /* ===================== the grant log ============================
     admin_grants takes inserts and nothing else, not even from the
     account that wrote the row, so a grant recorded here cannot be
     edited away afterwards. The copy in the save can be, which is why
     both are written and only this one settles an argument.

     Signed out there is no row to write: the insert policy checks
     account = auth.uid(), so an anonymous insert is refused by the
     database rather than quietly accepted. Say so by answering false
     instead of pretending it landed. */
  function logGrant(d) {
    var sb = global.Cloud && global.Cloud.sb;
    var u  = global.Cloud && global.Cloud.user;
    if (!sb || !u || !u.id) return Promise.resolve(false);

    return sb.from('admin_grants').insert({
      account:       u.id,
      email:         u.email || null,
      amount:        Math.round(Number(d && d.amount) || 0),
      balance_after: (d && typeof d.balanceAfter === 'number') ? Math.round(d.balanceAfter) : null,
      scope:         (d && d.scope) || null
    })
      .then(function (res) { return !res.error; })
      .catch(function () { return false; });
  }

  global.AdminPin = {
    verify: verify, covers: covers, clean: clean, SCOPES: SCOPES,
    mayOpen: mayOpen, logGrant: logGrant
  };
})(window);
