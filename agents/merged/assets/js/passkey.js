/* ------------------------------------------------------------------
   LearnGeo - passkeys, and the eye button on password boxes.

   This lives in its own file so it doesn't get in the way of edits to
   ui.js. It watches for dialogs to appear and adds two things:

     1. "Sign in with a passkey" on the sign-in dialog. Supabase Auth
        runs the WebAuthn ceremony, so there is no password to type and
        no email to remember. The account is resolved by the passkey.
     2. An eye button on every password box, on sign-in, sign-up and
        the reset-password dialog.

   Passkeys are tied to a domain, set on the Supabase project as the
   relying party. On any other address the browser refuses the request,
   which is caught below and explained instead of shown as an error.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW;

  function icon(paths, size) {
    return '<svg width="' + (size || 18) + '" height="' + (size || 18) + '" viewBox="0 0 24 24" ' +
      'fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" ' +
      'stroke-linejoin="round">' + paths + '</svg>';
  }

  var PASSKEY_ICON = icon('<path d="M12 10.5a1.8 1.8 0 0 0-1.8 1.8c0 2-.4 4-1.2 5.9"/>' +
    '<path d="M8.2 6.6A6.2 6.2 0 0 1 18.2 12c0 1.4-.1 2.7-.4 4"/>' +
    '<path d="M5 12a7 7 0 0 1 1.4-4.2"/><path d="M14.4 12.3c0 3.1-.5 6.1-1.6 8.9"/>' +
    '<path d="M5.2 17.8c.5-1.8.8-3.7.8-5.5"/>');
  var EYE = icon('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>', 17);
  var EYE_OFF = icon('<path d="M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.1 3.9"/>' +
    '<path d="M6.6 6.6A16.8 16.8 0 0 0 2 12s3.6 7 10 7a9.8 9.8 0 0 0 5.3-1.5"/>' +
    '<path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="m3 3 18 18"/>', 17);

  function cloud() { return global.Cloud; }
  function auth() {
    var c = cloud() && cloud().sb;
    return c && c.auth;
  }
  function signedIn() { return !!(cloud() && cloud().signedIn); }

  /* Needs a browser with WebAuthn and a supabase-js new enough to have the
     passkey API turned on. Without both, nothing here is offered. */
  function supported() {
    var a = auth();
    return !!(global.PublicKeyCredential && a && typeof a.signInWithPasskey === 'function');
  }

  function appOpen() {
    var app = document.getElementById('app');
    return !!(app && app.classList.contains('is-open'));
  }

  /* ========================= the eye button ========================= */
  function addEye(input) {
    if (!input || input.dataset.eyed) return;
    input.dataset.eyed = '1';

    var box = document.createElement('span');
    box.className = 'pw-box';
    input.parentNode.insertBefore(box, input);
    box.appendChild(input);

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pw-eye';
    btn.innerHTML = EYE;
    btn.title = 'Show password';
    btn.setAttribute('aria-label', 'Show password');
    btn.addEventListener('click', function () {
      var show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.innerHTML = show ? EYE_OFF : EYE;
      btn.title = show ? 'Hide password' : 'Show password';
      btn.setAttribute('aria-label', btn.title);
      btn.classList.toggle('is-on', show);
      input.focus();
    });
    box.appendChild(btn);
  }

  /* ====================== sign in with a passkey ==================== */
  function problem(err) {
    var name = (err && err.name) || '';
    /* DOMException.code is a number, so only a string code means anything */
    var code = err && typeof err.code === 'string' ? err.code : '';
    var msg = (err && err.message) || '';
    var all = name + ' ' + code + ' ' + msg;
    /* closing the system prompt is a choice, not a failure worth reporting */
    if (name === 'NotAllowedError' || name === 'AbortError' ||
        code === 'NotAllowedError' || code === 'AbortError' ||
        /not allowed|cancell?ed|aborted|timed out/i.test(msg)) return null;
    if (code === 'passkey_disabled') return 'Passkeys are not switched on for this project yet.';
    if (code === 'webauthn_credential_not_found') {
      return 'That passkey is not on any LearnGeo account. Sign in with your password, then add one.';
    }
    if (code === 'webauthn_challenge_expired' || code === 'webauthn_challenge_not_found') {
      return 'That took too long. Try again.';
    }
    if (code === 'too_many_passkeys') return 'This account already has as many passkeys as it can hold.';
    if (name === 'SecurityError' || code === 'ERROR_INVALID_RP_ID' ||
        /relying party|rp id|origin/i.test(all)) {
      return 'Passkeys only work on the real site address, not on this one.';
    }
    if (name === 'InvalidStateError') return 'This device already has a passkey for this account.';
    if (name === 'NotSupportedError') return 'This device cannot make a passkey.';
    return msg || 'The passkey did not work. Use your password instead.';
  }

  function say(root, kind, title, text) {
    var slot = root && root.querySelector('#au-msg');
    if (!slot) { W.toast(title, text || '', W.Icons.info, 4200); return; }
    slot.innerHTML = '<div class="feedback feedback--' + kind + '" style="margin:0 0 14px">' +
      (kind === 'right' ? W.Icons.check : W.Icons.info) +
      '<div><b>' + W.escapeHtml(title) + '</b>' +
      (text ? '<p>' + W.escapeHtml(text) + '</p>' : '') + '</div></div>';
  }

  function signIn(btn, root) {
    var a = auth();
    if (!a) return;
    var was = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = PASSKEY_ICON + ' Waiting for your device';

    /* supabase-js hands failures back in res.error rather than rejecting,
       so both endings are funnelled through the same place */
    a.signInWithPasskey().then(function (res) {
      if (res && res.error) throw res.error;
      return res;
    }).then(function (res) {
      done();
      var closer = root.querySelector('[data-close]');
      if (closer) closer.click();
      var who = res && res.data && res.data.user;
      W.toast('Signed in', (who && who.email) || 'Welcome back', W.Icons.check);
      if (!appOpen() && global.UI) global.UI.showApp('portal');
    })['catch'](function (err) {
      done();
      var note = problem(err);
      if (note) say(root, 'wrong', 'Could not use your passkey', note);
    });

    function done() {
      btn.disabled = false;
      btn.innerHTML = was;
    }
  }

  /* ========================= adding a passkey ======================= */
  function register() {
    var a = auth();
    if (!a) return Promise.reject(new Error('Passkeys are not available here.'));
    return a.registerPasskey().then(function (res) {
      if (res && res.error) throw res.error;
      return res.data;
    });
  }

  function list() {
    var a = auth();
    if (!a || !a.passkey) return Promise.resolve([]);
    return a.passkey.list().then(function (res) {
      if (res && res.error) throw res.error;
      return res.data || [];
    });
  }

  function remove(id) {
    return auth().passkey.delete({ passkeyId: id }).then(function (res) {
      if (res && res.error) throw res.error;
    });
  }

  function when(row) {
    var d = row.created_at ? new Date(row.created_at) : null;
    if (!d || isNaN(d.getTime())) return 'Added';
    return 'Added ' + d.toLocaleDateString();
  }

  /* The list of passkeys on this account, with a way to add and remove. */
  function manage() {
    if (!global.UI) return;
    global.UI.modal({
      title: 'Passkeys', icon: PASSKEY_ICON,
      body: '<p class="t-muted" style="margin-bottom:14px">A passkey signs you in with your ' +
              'fingerprint, face or screen lock, so there is no password to type.</p>' +
            '<div id="pk-list" class="pk-list"><div class="pk-empty">Loading…</div></div>' +
            '<div id="pk-msg"></div>',
      actions: [
        { label: 'Done', cls: 'btn--ghost', close: true },
        { label: 'Add a passkey', cls: 'btn--accent', onClick: function (root) { add(root); return false; } }
      ],
      onMount: paint
    });
  }

  function paint(root) {
    var host = root.querySelector('#pk-list');
    list().then(function (rows) {
      if (!rows.length) {
        host.innerHTML = '<div class="pk-empty">No passkeys yet. Add one and you can skip the ' +
          'password next time.</div>';
        return;
      }
      host.innerHTML = rows.map(function (r, i) {
        return '<div class="pk-row">' + PASSKEY_ICON +
          '<div class="grow"><b>' + W.escapeHtml(r.friendly_name || 'Passkey') + '</b>' +
          '<span>' + W.escapeHtml(when(r)) + '</span></div>' +
          '<button class="btn btn--ghost btn--sm" data-drop="' + i + '">Remove</button></div>';
      }).join('');
      W.$$('[data-drop]', host).forEach(function (b) {
        b.addEventListener('click', function () {
          b.disabled = true;
          remove(rows[+b.dataset.drop].id).then(function () {
            W.toast('Passkey removed', '', W.Icons.check);
            paint(root);
          }, function (err) {
            b.disabled = false;
            note(root, problem(err) || 'Could not remove that passkey.');
          });
        });
      });
    }, function (err) {
      host.innerHTML = '<div class="pk-empty">' + W.escapeHtml(problem(err) || 'Could not load your passkeys.') + '</div>';
    });
  }

  function note(root, text) {
    var slot = root.querySelector('#pk-msg');
    if (!slot) return W.toast(text, '', W.Icons.info, 4200);
    slot.innerHTML = '<div class="feedback feedback--wrong" style="margin:12px 0 0">' + W.Icons.info +
      '<div><b>' + W.escapeHtml(text) + '</b></div></div>';
  }

  function add(root, close) {
    register().then(function (data) {
      W.toast('Passkey added', (data && data.friendly_name) || 'You can use it next time you sign in', W.Icons.check);
      if (close) {
        var closer = root.querySelector('[data-close]');
        if (closer) closer.click();
      } else {
        paint(root);
      }
    }, function (err) {
      var text = problem(err);
      if (text) note(root, text);
    });
  }

  /* Offered once per account, right after a password sign-in. */
  function offer(tries) {
    if (!supported() || !signedIn() || !global.UI) return;
    if (document.querySelector('.overlay')) {
      /* something else is on screen; wait for it rather than stack on it */
      if ((tries || 0) < 10) setTimeout(function () { offer((tries || 0) + 1); }, 1500);
      return;
    }
    var key = 'learngeo.passkeyAsked.' + cloud().user.id;
    try { if (localStorage.getItem(key)) return; } catch (e) {}
    list().then(function (rows) {
      if (rows.length) return;
      try { localStorage.setItem(key, '1'); } catch (e) {}
      global.UI.modal({
        title: 'Skip the password next time?', icon: PASSKEY_ICON,
        body: '<p class="t-muted">You can sign in with your fingerprint, face or screen lock ' +
              'instead of typing a password. It stays on this device and works on the LearnGeo site.</p>',
        actions: [
          { label: 'Not now', cls: 'btn--ghost', close: true },
          { label: 'Set up a passkey', cls: 'btn--accent', onClick: function (root) { add(root, true); return false; } }
        ]
      });
    }, function () {});
  }

  /* ====================== finding things on screen ================== */
  function decorate(overlay) {
    var modal = overlay.querySelector('.modal') || overlay;
    W.$$('input[type="password"]', modal).forEach(addEye);

    if (!supported()) return;
    settingsButton(modal);

    /* let the browser offer saved passkeys straight from the email box */
    var email = modal.querySelector('#au-email');
    if (email && !/webauthn/.test(email.getAttribute('autocomplete') || '')) {
      email.setAttribute('autocomplete', 'username webauthn');
    }
    /* the sign-in dialog, which has an email box but no name box */
    if (!modal.querySelector('#au-email') || modal.querySelector('#au-name')) return;
    var body = modal.querySelector('.modal__body');
    if (!body || body.querySelector('.passkey-row')) return;

    var row = document.createElement('div');
    row.className = 'passkey-row';
    row.innerHTML =
      '<button type="button" class="btn btn--ghost btn--block passkey-btn">' +
        PASSKEY_ICON + ' Sign in with a passkey</button>' +
      '<div class="auth-or"><span>or use your password</span></div>';
    body.insertBefore(row, body.firstChild);
    row.querySelector('.passkey-btn').addEventListener('click', function (e) {
      signIn(e.currentTarget, modal);
    });
  }

  /* Settings has an account row with a Sign out button. Passkeys belong
     next to it, for anyone who goes looking there first. */
  function settingsButton(modal) {
    var out = modal.querySelector('#set-signout');
    if (!out || !signedIn() || modal.querySelector('[data-pk-settings]')) return;
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn--ghost btn--sm';
    b.setAttribute('data-pk-settings', '1');
    b.style.marginRight = '8px';
    b.textContent = 'Passkeys';
    b.addEventListener('click', manage);
    out.parentNode.insertBefore(b, out);
  }

  function decorateMenu(menu) {
    if (!supported() || !signedIn()) return;
    if (menu.querySelector('[data-pk]')) return;
    var out = menu.querySelector('[data-go="signout"]') || menu.querySelector('.menu__note');
    if (!out) return;
    var b = document.createElement('button');
    b.className = 'menu__item';
    b.setAttribute('data-pk', '1');
    b.innerHTML = PASSKEY_ICON + '<span>Passkeys</span>';
    b.addEventListener('click', function () {
      if (global.UI.closeMenu) global.UI.closeMenu();
      manage();
    });
    out.parentNode.insertBefore(b, out);
  }

  function scan(node) {
    if (!node || node.nodeType !== 1) return;
    if (node.classList.contains('overlay')) return decorate(node);
    if (node.classList.contains('menu')) return decorateMenu(node);
    if (!node.querySelector) return;
    var ov = node.querySelector('.overlay');
    if (ov) decorate(ov);
    var menu = node.querySelector('.menu');
    if (menu) decorateMenu(menu);
  }

  /* A passkey request can be refused by the browser outside any code of
     ours, for instance when it offers a saved passkey from the email box
     and the address does not match the passkey domain. That refusal
     belongs to nobody and lands in the console as an uncaught error on a
     page where nothing is wrong. Only that exact one is swallowed; every
     refusal we asked for is reported in the dialog instead. */
  function hushAutofillRefusal() {
    global.addEventListener('unhandledrejection', function (e) {
      var r = e.reason;
      if (r && r.name === 'SecurityError' && /RP ID/i.test(r.message || '')) e.preventDefault();
    });
  }

  function boot() {
    new MutationObserver(function (records) {
      records.forEach(function (r) {
        Array.prototype.forEach.call(r.addedNodes, scan);
      });
    }).observe(document.body, { childList: true, subtree: true });

    watchSignIn(0);
  }

  function watchSignIn(tries) {
    var a = auth();
    if (a && a.onAuthStateChange) {
      a.onAuthStateChange(function (event) {
        if (event === 'SIGNED_IN') setTimeout(offer, 1500);
      });
      return;
    }
    /* supabase-js may still be loading when the page is slow */
    if (tries < 20) setTimeout(function () { watchSignIn(tries + 1); }, 500);
  }

  /* installed while this file is being read, because the request it quiets
     can start as soon as any script touches the Supabase client */
  hushAutofillRefusal();

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  global.Passkeys = {
    manage: manage, register: register, list: list,
    get supported() { return supported(); }
  };
})(window);
