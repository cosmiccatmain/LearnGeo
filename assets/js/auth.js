/* ------------------------------------------------------------------
   LearnGeo — accounts

   Accounts are stored in this browser. Passwords are never kept in
   plain text: we store a SHA-256 hash with a per-account random salt,
   which is the right shape for a local-first app and swaps cleanly for
   Supabase Auth once a project URL and anon key are configured.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW;
  var USERS = 'learngeo.accounts.v1';
  var SESSION = 'learngeo.session.v1';

  function readUsers() {
    try { return JSON.parse(localStorage.getItem(USERS) || '{}'); } catch (e) { return {}; }
  }
  function writeUsers(u) {
    try { localStorage.setItem(USERS, JSON.stringify(u)); } catch (e) {}
  }

  function randomSalt() {
    var a = new Uint8Array(16);
    (global.crypto || global.msCrypto).getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }

  function hash(password, salt) {
    var subtle = global.crypto && global.crypto.subtle;
    var data = new TextEncoder().encode(salt + '::' + password);
    if (!subtle) {
      /* file:// in some browsers has no SubtleCrypto — degrade, but never store the raw value */
      var h = 0, str = salt + '::' + password;
      for (var i = 0; i < str.length; i++) { h = ((h << 5) - h + str.charCodeAt(i)) | 0; }
      return Promise.resolve('fallback:' + (h >>> 0).toString(16));
    }
    return subtle.digest('SHA-256', data).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) {
        return ('0' + b.toString(16)).slice(-2);
      }).join('');
    });
  }

  function normEmail(e) { return String(e || '').trim().toLowerCase(); }

  function validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e); }

  function signUp(email, password, displayName) {
    email = normEmail(email);
    if (!validEmail(email)) return Promise.reject(new Error('Enter a valid email address.'));
    if (!password || password.length < 8) return Promise.reject(new Error('Password must be at least 8 characters.'));
    if (!displayName || !displayName.trim()) return Promise.reject(new Error('Choose a display name.'));

    var users = readUsers();
    if (users[email]) return Promise.reject(new Error('An account already exists for that email.'));

    var salt = randomSalt();
    return hash(password, salt).then(function (h) {
      users[email] = { email: email, salt: salt, hash: h, name: displayName.trim().slice(0, 32), created: Date.now() };
      writeUsers(users);
      startSession(email);
      /* a brand new account starts from a clean slate */
      W.reset();
      W.state.profile.displayName = displayName.trim().slice(0, 32);
      W.state.account = { email: email };
      W.state.loggedIn = true;
      W.saveNow();
      return users[email];
    });
  }

  function logIn(email, password) {
    email = normEmail(email);
    var users = readUsers();
    var u = users[email];
    if (!u) return Promise.reject(new Error('No account found for that email.'));
    return hash(password, u.salt).then(function (h) {
      if (h !== u.hash) throw new Error('That password is not right.');
      startSession(email);
      W.state.account = { email: email };
      W.state.loggedIn = true;
      if (!W.state.profile.displayName || W.state.profile.displayName === 'Explorer') {
        W.state.profile.displayName = u.name;
      }
      W.saveNow();
      return u;
    });
  }

  function startSession(email) {
    try { localStorage.setItem(SESSION, email); } catch (e) {}
  }
  function endSession() {
    try { localStorage.removeItem(SESSION); } catch (e) {}
    W.state.loggedIn = false;
    W.saveNow();
  }
  function currentEmail() {
    try { return localStorage.getItem(SESSION); } catch (e) { return null; }
  }
  function isSignedIn() { return !!currentEmail() && W.state.loggedIn; }
  function hasAccounts() { return Object.keys(readUsers()).length > 0; }

  global.Auth = {
    signUp: signUp, logIn: logIn, endSession: endSession,
    currentEmail: currentEmail, isSignedIn: isSignedIn, hasAccounts: hasAccounts,
    validEmail: validEmail
  };
})(window);
