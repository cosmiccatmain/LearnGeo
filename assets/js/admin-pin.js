/* ------------------------------------------------------------------
   LearnGeo — admin codes kept in Supabase.

   The codes are not in this file and never reach the browser. The page
   sends the digits someone typed to verify_admin_pin() and gets back
   true or false. The table itself has row-level security on with no
   policies, so the publishable key cannot list the codes, only ask
   about one. They are stored hashed (bcrypt), not as plain digits.

   A four-digit code is still only four digits, and the admin panel only
   edits this browser's own save, so treat this as a lock on a drawer,
   not on a door. Offline, the built-in code in admin.js is the only one
   that works.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';

  function verify(code) {
    var sb = global.Cloud && global.Cloud.sb;
    if (!sb) return Promise.resolve(false);
    return sb.rpc('verify_admin_pin', { p_pin: String(code) })
      .then(function (res) { return !res.error && res.data === true; })
      .catch(function () { return false; });
  }

  global.AdminPin = { verify: verify };
})(window);
