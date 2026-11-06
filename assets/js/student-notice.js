/* ------------------------------------------------------------------
   LearnGeo — one-time student notice.

   A signed-in student in Oliver's class ("this is a test.", join code
   DJZN4Y) sees "All countries are now in the stream." once, the next
   time they are in the app. Dismissing it, or leaving and coming back,
   does not show it again. Another account on the same browser still
   gets its own first look. Guests never see it.

   Scope is the join code already stored on the student's enrolment.
   Enrolments are keyed by that code (classes.js). The class row UUID
   is not written here. That id is a private database key, and shipping
   it in the page would publish it to every visitor. The join code does
   ship in this file, because the page has no other way to know which
   class this one-time note is for. There is no class-targeted login
   notice in the database: `announcements` is the Stream itself, and
   this note must not become a stream post, an email, or a push.

   Seen state lives on the account save, `flags.notices[id]`, the same
   blob as flags.premium and flags.staff. core.js stores that blob under
   learngeo.save.v1.u.<uid> and cloud.js upserts the whole save to
   profiles.save. A global localStorage key, which is what the public
   product-update card uses, would mark every account on a shared
   computer as having seen it.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW;

  var NOTICE_ID = '2026-11-africa-all-countries-stream';
  var MESSAGE = 'All countries are now in the stream.';
  var CLASS_CODE = 'DJZN4Y';
  var DOM_ID = 'student-notice';

  /* Account id the element currently on screen was shown for.
     A reload starts this at null, so a saved flag stays hidden.
     The same visit keeps the banner up until Got it or Escape. */
  var shownFor = null;
  var waitTimer = null;
  var waitTries = 0;
  var keyBound = false;

  function accountId() {
    return (W.accountId && W.accountId()) || '';
  }

  /* True once the signed-in save on screen belongs to that account.
     adopt() points storage at the new id before the profile comes back,
     and a save in that gap would write the previous person's state
     under the new key. Cloud.ready is false and status is "syncing"
     for exactly that wait. A later upload also says "syncing", but
     ready stays true, so those do not block the note. */
  function sessionReady() {
    var C = global.Cloud;
    if (!C || C.signedIn !== true) return false;
    var id = accountId();
    if (!id) return false;
    if (C.user && C.user.id && C.user.id !== id) return false;
    if (C.status === 'syncing' && C.ready !== true) return false;
    return true;
  }

  function isStudent() {
    return !W.state || W.state.role !== 'teacher';
  }

  function masquerading() {
    return !!(global.Masquerade && global.Masquerade.active);
  }

  function appOpen() {
    var app = document.getElementById('app');
    return !!(app && app.classList && app.classList.contains('is-open'));
  }

  function normalCode(code) {
    return String(code || '').trim().toUpperCase();
  }

  /* Every class on the account, not only the one on screen. A student
     in two classes should still hear about this one. */
  function inClass() {
    var codes = [];
    function add(row) {
      if (row && row.code) codes.push(normalCode(row.code));
    }
    if (global.Classes && typeof global.Classes.enrolments === 'function') {
      global.Classes.enrolments().forEach(add);
    } else {
      var s = W.state || {};
      (s.enrolments || []).forEach(add);
      add(s.enrolled);
    }
    return codes.indexOf(CLASS_CODE) !== -1;
  }

  function notices() {
    var flags = W.state && W.state.flags;
    if (!flags || typeof flags !== 'object' || Array.isArray(flags)) return null;
    var n = flags.notices;
    if (!n || typeof n !== 'object' || Array.isArray(n)) return null;
    return n;
  }

  function hasSeen() {
    var n = notices();
    return !!(n && n[NOTICE_ID]);
  }

  function markSeen() {
    if (!accountId()) return;
    if (!W.state.flags || typeof W.state.flags !== 'object' || Array.isArray(W.state.flags)) {
      W.state.flags = {};
    }
    if (!W.state.flags.notices || typeof W.state.flags.notices !== 'object' ||
        Array.isArray(W.state.flags.notices)) {
      W.state.flags.notices = {};
    }
    if (W.state.flags.notices[NOTICE_ID]) return;
    W.state.flags.notices[NOTICE_ID] = true;
    if (typeof W.saveNow === 'function') W.saveNow();
  }

  function blocking() {
    return !!(document.querySelector &&
      document.querySelector('.overlay, .lg-update-overlay, .role-pick'));
  }

  function cancelWait() {
    if (!waitTimer) return;
    clearTimeout(waitTimer);
    waitTimer = null;
  }

  function removeDom() {
    var el = document.getElementById(DOM_ID);
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function bindKeys() {
    if (keyBound) return;
    keyBound = true;
    document.addEventListener('keydown', function (e) {
      if (!e || e.key !== 'Escape') return;
      if (!document.getElementById(DOM_ID)) return;
      if (blocking()) return;
      dismiss();
    });
  }

  function place(el) {
    var share = document.getElementById('share-bar');
    var anchor = share || document.querySelector('.topbar');
    if (anchor && anchor.parentNode) {
      anchor.parentNode.insertBefore(el, anchor.nextSibling);
      return true;
    }
    var app = document.getElementById('app');
    if (!app) return false;
    app.insertBefore(el, app.firstChild);
    return true;
  }

  function build() {
    var el = document.createElement('div');
    el.id = DOM_ID;
    el.className = 'student-notice';
    el.setAttribute('role', 'region');
    el.setAttribute('aria-labelledby', 'student-notice-text');
    el.setAttribute('aria-live', 'polite');

    var mark = document.createElement('span');
    mark.className = 'student-notice__mark';
    mark.setAttribute('aria-hidden', 'true');
    mark.innerHTML = (W.Icons && W.Icons.info) || '';

    var text = document.createElement('p');
    text.id = 'student-notice-text';
    text.className = 'student-notice__text';
    text.textContent = MESSAGE;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn--sm btn--primary student-notice__dismiss';
    btn.setAttribute('aria-label', 'Dismiss notice');
    btn.textContent = 'Got it';
    btn.addEventListener('click', dismiss);

    el.appendChild(mark);
    el.appendChild(text);
    el.appendChild(btn);
    return el;
  }

  function reveal() {
    if (document.getElementById(DOM_ID)) return;
    var el = build();
    if (!place(el)) return;
    markSeen();
    shownFor = accountId();
    bindKeys();
  }

  function paint() {
    var id = accountId();
    if (!sessionReady()) {
      /* Still comparing this device to the account. A banner from the
         previous person has to come down; theirs must not be marked seen
         under the id storage just switched to. */
      if (!(global.Cloud && global.Cloud.signedIn === true && appOpen())) {
        cancelWait();
        waitTries = 0;
        removeDom();
        shownFor = null;
        return;
      }
      if (shownFor && id && shownFor !== id) {
        removeDom();
        shownFor = null;
      }
      if (waitTries > 40) return;
      queuePaint(300);
      return;
    }
    if (!isStudent() || masquerading() || !appOpen() || !inClass()) {
      cancelWait();
      waitTries = 0;
      removeDom();
      shownFor = null;
      return;
    }

    var existing = document.getElementById(DOM_ID);
    if (hasSeen()) {
      cancelWait();
      if (existing && shownFor === id) return;
      removeDom();
      shownFor = null;
      return;
    }
    if (existing && shownFor === id) return;
    if (existing) {
      removeDom();
      shownFor = null;
    }
    if (blocking()) {
      if (waitTries > 40) return;
      queuePaint(300);
      return;
    }
    waitTries = 0;
    reveal();
  }

  function queuePaint(ms) {
    if (waitTimer) return;
    waitTries += 1;
    waitTimer = setTimeout(function () {
      waitTimer = null;
      paint();
    }, ms);
    if (waitTimer && waitTimer.unref) waitTimer.unref();
  }

  /* Ask again. Safe to call from navigation, sign-in, and modal close.
     The paint waits a tick so a dialog opened later in the same turn
     (role pick, screen-share prompt, product update) is already up
     and this banner does not mark itself seen from behind it. */
  function sync() {
    waitTries = 0;
    cancelWait();
    queuePaint(0);
  }

  function dismiss() {
    markSeen();
    removeDom();
    shownFor = null;
    cancelWait();
  }

  global.StudentNotice = {
    sync: sync,
    dismiss: dismiss,
    hasSeen: hasSeen,
    id: NOTICE_ID,
    message: MESSAGE,
    classCode: CLASS_CODE
  };
})(window);
