/* ------------------------------------------------------------------
   LearnGeo — referral → 3-day all-games trial (LEA-49).

   TESTING ONLY. Owner / UltraAdmin flips the switch in Administrator →
   Development (same spirit as Premium preview, LEA-46). When the switch
   is off there is no public share surface and no trial grants.

   Flow while the switch is on:
     1. Signed-in tester gets a share link (?ref=<code>).
     2. Five new accounts that arrive with that code are credited.
     3. At five credits the referrer gets a 3-day all-games trial
        (Premium.active treats trialUntil as Premium while this switch
         is on, so Premium gates still apply when Premium preview is on).

   Credits live in a browser ledger for same-device TEST. Development
   also offers "Simulate invited signup" so AJ can exercise the grant
   without five real accounts. Nothing here is live growth product UI.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';

  var FEATURE_KEY = 'learngeo.dev.referralTrial';
  var PENDING_KEY = 'learngeo.dev.referralPending';
  var LEDGER_KEY = 'learngeo.dev.referralLedger';
  var NEEDED = 5;
  var TRIAL_MS = 3 * 24 * 60 * 60 * 1000;

  function W() { return global.WW; }

  function previewEnabled() {
    try {
      return localStorage.getItem(FEATURE_KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  function setPreviewEnabled(on) {
    try {
      localStorage.setItem(FEATURE_KEY, on ? '1' : '0');
    } catch (e) { /* private mode */ }
    try {
      if (typeof CustomEvent === 'function') {
        global.dispatchEvent(new CustomEvent('learngeo:referral-trial', {
          detail: { on: !!on }
        }));
      }
    } catch (e2) { /* ignore */ }
    if (on) maybeGrant();
    return !!on;
  }

  function readLedger() {
    try {
      var raw = localStorage.getItem(LEDGER_KEY);
      var o = raw ? JSON.parse(raw) : {};
      return o && typeof o === 'object' ? o : {};
    } catch (e) {
      return {};
    }
  }

  function writeLedger(o) {
    try {
      localStorage.setItem(LEDGER_KEY, JSON.stringify(o || {}));
    } catch (e) { /* private mode */ }
  }

  function flags() {
    var ww = W();
    var s = ww && ww.state;
    if (!s) return {};
    if (!s.flags || typeof s.flags !== 'object') s.flags = {};
    return s.flags;
  }

  function accountId() {
    if (global.Cloud && global.Cloud.user && global.Cloud.user.id) return global.Cloud.user.id;
    var ww = W();
    if (ww && ww.accountId) return ww.accountId();
    return null;
  }

  /* Stable short code from the account id (or a guest TEST code). */
  function inviteCode() {
    var id = accountId();
    if (!id) return null;
    var f = flags();
    if (f.referralCode && typeof f.referralCode === 'string') return f.referralCode;
    var code = String(id).replace(/-/g, '').slice(0, 8).toLowerCase();
    if (!code) return null;
    f.referralCode = code;
    var ww = W();
    if (ww && ww.saveNow) ww.saveNow();
    return code;
  }

  function shareUrl() {
    var code = inviteCode();
    if (!code) return '';
    var origin = '';
    try { origin = global.location.origin || ''; } catch (e) { origin = ''; }
    if (!origin) origin = 'https://www.learngeo.app';
    return origin + '/?ref=' + encodeURIComponent(code);
  }

  function captureFromUrl() {
    try {
      var params = new URLSearchParams(global.location.search || '');
      var ref = (params.get('ref') || '').trim().toLowerCase();
      if (!/^[a-z0-9]{4,16}$/.test(ref)) return null;
      try { sessionStorage.setItem(PENDING_KEY, ref); } catch (e) { /* ignore */ }
      return ref;
    } catch (e2) {
      return null;
    }
  }

  function pendingRef() {
    try {
      var v = sessionStorage.getItem(PENDING_KEY) || '';
      return /^[a-z0-9]{4,16}$/.test(v) ? v : null;
    } catch (e) {
      return null;
    }
  }

  function clearPending() {
    try { sessionStorage.removeItem(PENDING_KEY); } catch (e) { /* ignore */ }
  }

  function entryFor(code) {
    var led = readLedger();
    if (!led[code]) {
      led[code] = { signups: [], grantedAt: null, ownerId: null };
      writeLedger(led);
    }
    return led[code];
  }

  function signupCount(code) {
    var e = entryFor(code);
    return (e.signups && e.signups.length) || 0;
  }

  function progress() {
    var code = inviteCode();
    if (!code) return { code: null, count: 0, needed: NEEDED, link: '', trialUntil: null };
    return {
      code: code,
      count: signupCount(code),
      needed: NEEDED,
      link: shareUrl(),
      trialUntil: flags().trialUntil || null,
      trialActive: trialActive()
    };
  }

  function trialActive() {
    if (!previewEnabled()) return false;
    var until = flags().trialUntil;
    if (!until) return false;
    var t = Date.parse(until);
    return !isNaN(t) && t > Date.now();
  }

  function expireIfNeeded() {
    var f = flags();
    if (!f.trialUntil) return false;
    var t = Date.parse(f.trialUntil);
    if (isNaN(t) || t > Date.now()) return false;
    delete f.trialUntil;
    if (f.trialSource === 'referral') delete f.trialSource;
    var ww = W();
    if (ww && ww.saveNow) ww.saveNow();
    return true;
  }

  /* Credit a new account against a referral code. Idempotent per newUid.
     When the feature switch is off we still remember the pending ref for
     later TEST, but we do not credit or grant. */
  function creditSignup(code, newUid) {
    if (!previewEnabled()) return { ok: false, reason: 'off' };
    code = String(code || '').trim().toLowerCase();
    if (!/^[a-z0-9]{4,16}$/.test(code)) return { ok: false, reason: 'bad-code' };
    var uid = String(newUid || '').trim();
    if (!uid) uid = 'anon-' + Date.now().toString(36);
    var led = readLedger();
    if (!led[code]) led[code] = { signups: [], grantedAt: null, ownerId: null };
    var list = led[code].signups || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] === uid) {
        writeLedger(led);
        return { ok: true, duplicate: true, count: list.length };
      }
    }
    /* Do not credit yourself. */
    var me = accountId();
    if (me && me === uid) return { ok: false, reason: 'self' };
    list.push(uid);
    led[code].signups = list;
    writeLedger(led);
    maybeGrant(code);
    return { ok: true, count: list.length };
  }

  function creditPendingForNewUser(newUid) {
    var ref = pendingRef();
    if (!ref) return { ok: false, reason: 'none' };
    var res = creditSignup(ref, newUid);
    if (res && res.ok) clearPending();
    return res;
  }

  function simulateSignup() {
    if (!previewEnabled()) return { ok: false, reason: 'off' };
    var code = inviteCode();
    if (!code) return { ok: false, reason: 'no-account' };
    var fake = 'sim-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e4);
    return creditSignup(code, fake);
  }

  function grantTrial(code) {
    if (!previewEnabled()) return false;
    var f = flags();
    var until = new Date(Date.now() + TRIAL_MS).toISOString();
    f.trialUntil = until;
    f.trialSource = 'referral';
    var led = readLedger();
    if (code && led[code]) {
      led[code].grantedAt = until;
      led[code].ownerId = accountId();
      writeLedger(led);
    }
    var ww = W();
    if (ww && ww.saveNow) ww.saveNow();
    try {
      if (typeof CustomEvent === 'function') {
        global.dispatchEvent(new CustomEvent('learngeo:referral-granted', {
          detail: { until: until }
        }));
      }
    } catch (e) { /* ignore */ }
    if (ww && ww.toast) {
      ww.toast(
        '3-day trial',
        'All games unlocked for 3 days (TEST referral).',
        (ww.Icons && (ww.Icons.sparkle || ww.Icons.check)) || null,
        4200
      );
    }
    return true;
  }

  function maybeGrant(code) {
    if (!previewEnabled()) return false;
    expireIfNeeded();
    code = code || inviteCode();
    if (!code) return false;
    if (signupCount(code) < NEEDED) return false;
    if (trialActive()) return false;
    var led = readLedger();
    var e = led[code];
    /* Allow re-grant after a previous trial expired (grantedAt cleared on reset). */
    return grantTrial(code);
  }

  function resetProgress() {
    var code = inviteCode();
    var led = readLedger();
    if (code && led[code]) {
      led[code] = { signups: [], grantedAt: null, ownerId: accountId() };
      writeLedger(led);
    }
    var f = flags();
    delete f.trialUntil;
    if (f.trialSource === 'referral') delete f.trialSource;
    var ww = W();
    if (ww && ww.saveNow) ww.saveNow();
    return true;
  }

  function copyShareLink() {
    var url = shareUrl();
    if (!url) return Promise.reject(new Error('Sign in to get a share link.'));
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(url).then(function () { return url; });
    }
    return Promise.resolve(url);
  }

  function init() {
    captureFromUrl();
    expireIfNeeded();
    if (previewEnabled()) maybeGrant();
  }

  global.ReferralTrial = {
    FEATURE_KEY: FEATURE_KEY,
    NEEDED: NEEDED,
    TRIAL_MS: TRIAL_MS,
    previewEnabled: previewEnabled,
    setPreviewEnabled: setPreviewEnabled,
    inviteCode: inviteCode,
    shareUrl: shareUrl,
    captureFromUrl: captureFromUrl,
    pendingRef: pendingRef,
    creditSignup: creditSignup,
    creditPendingForNewUser: creditPendingForNewUser,
    simulateSignup: simulateSignup,
    progress: progress,
    trialActive: trialActive,
    maybeGrant: maybeGrant,
    resetProgress: resetProgress,
    copyShareLink: copyShareLink,
    expireIfNeeded: expireIfNeeded,
    init: init
  };
})(window);
