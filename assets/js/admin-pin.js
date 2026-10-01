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
        if (missing(res.error)) {
          return sb.rpc('verify_admin_pin', { p_pin: pin })
            .then(function (r2) { return r2.error ? null : read(r2.data); })
            .catch(function () { return null; });
        }
        return null;
      })
      .catch(function () { return null; });
  }

  /* PostgREST answers PGRST202 for a function it cannot find, and some
     versions say so only in the message. */
  function missing(err) {
    if (!err) return false;
    if (err.code === 'PGRST202' || err.code === '42883') return true;
    return /could not find|does not exist|schema cache/i.test(String(err.message || ''));
  }

  global.AdminPin = { verify: verify, covers: covers, clean: clean, SCOPES: SCOPES };
})(window);
