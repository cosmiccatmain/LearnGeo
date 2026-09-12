/* ------------------------------------------------------------------
   LearnGeo — admin panel.

   Opened with ?admin on the URL, unlocked with a four-digit code on a
   number pad, and then able to hand out — or take back — the two things
   the app will not award by itself: the verified seal and diamonds.

   Read this before trusting it with anything: the codes live in Supabase
   and are checked there (assets/js/admin-pin.js), so the page never holds
   one, but four digits are still only four digits and everything the
   panel changes is this browser's own save. It keeps the panel out of the
   way of a student poking around. It is not a security boundary, and
   nothing here should ever guard anything that matters.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons;

  var CODE_LEN = 4;
  var NO_CHECK = 'Can’t check the code right now. Try again when you’re online.';
  var unlocked = false;          /* survives until the tab is closed */

  /* ============================ number pad ========================== */
  function open() {
    if (unlocked) return panel();
    lock();
  }

  function lock() {
    var typed = '';
    var keyHandler = null;       /* removed when the dialog closes, however it closes */

    var m = global.UI.modal({
      title: 'Admin', icon: I.lock,
      body:
        '<p class="t-muted t-sm" style="margin:-4px 0 18px">Enter the four-digit code.</p>' +
        '<div class="pad-dots" id="pad-dots">' + dots('') + '</div>' +
        '<div class="pad" id="pad">' +
          [1, 2, 3, 4, 5, 6, 7, 8, 9].map(key).join('') +
          '<button class="pad__key pad__key--soft" data-k="clear">Clear</button>' +
          key(0) +
          '<button class="pad__key pad__key--soft" data-k="back" aria-label="Delete">' + I.arrowL + '</button>' +
        '</div>' +
        '<div id="pad-err" class="pad-err"></div>',
      actions: [{ label: 'Cancel', cls: 'btn--ghost', close: true }],
      onMount: function (root, close) {
        var dotsEl = W.$('#pad-dots', root);
        var errEl = W.$('#pad-err', root);

        W.$$('.pad__key', root).forEach(function (b) {
          b.addEventListener('click', function () { press(b.dataset.k); });
        });
        document.addEventListener('keydown', onKey);
        keyHandler = onKey;

        function onKey(e) {
          if (/^[0-9]$/.test(e.key)) { e.preventDefault(); press(e.key); }
          else if (e.key === 'Backspace') { e.preventDefault(); press('back'); }
        }

        /* Every keypress makes a check that is still in the air stale, so a
           yes for a code that has since been retyped cannot unlock the panel. */
        var checkId = 0;

        function press(k) {
          checkId += 1;
          errEl.textContent = '';
          if (k === 'clear') typed = '';
          else if (k === 'back') typed = typed.slice(0, -1);
          else if (typed.length < CODE_LEN) typed += k;
          dotsEl.innerHTML = dots(typed);
          if (typed.length === CODE_LEN) {
            var mine = checkId;
            setTimeout(function () { if (mine === checkId) check(mine); }, 120);
          }
        }

        /* Supabase answers yes or no without the page ever holding the
           codes (assets/js/admin-pin.js). If it cannot answer, nothing
           opens: there is no code built into this file to fall back on. */
        function check(mine) {
          var asking = global.AdminPin && global.AdminPin.verify(typed);
          if (!asking) return fail(NO_CHECK);
          errEl.textContent = 'Checking…';
          asking.then(function (ok) {
            if (mine !== checkId || !document.body.contains(root)) return;
            if (ok === true) pass();
            else fail(ok === null ? NO_CHECK : '');
          });
        }

        function pass() {
          unlocked = true;
          close();
          panel();
        }

        function fail(why) {
          typed = '';
          dotsEl.innerHTML = dots('');
          dotsEl.classList.remove('is-wrong');
          void dotsEl.offsetWidth;                 /* restart the shake */
          dotsEl.classList.add('is-wrong');
          errEl.textContent = why || 'Wrong code.';
          W.Sound.wrong();
        }
      },
      onClose: function () {
        if (keyHandler) { document.removeEventListener('keydown', keyHandler); keyHandler = null; }
      }
    });
    return m;

    function key(n) {
      return '<button class="pad__key" data-k="' + n + '">' + n + '</button>';
    }
  }

  function dots(typed) {
    var out = '';
    for (var i = 0; i < CODE_LEN; i++) {
      out += '<i class="' + (i < typed.length ? 'is-on' : '') + '"></i>';
    }
    return out;
  }

  /* ============================== panel ============================= */
  var GRANTS = [100, 500, 1000, 5000];

  /* One row of amount buttons. Pass 1 for the row that gives and -1 for
     the row that takes; both end up on the same click handler. */
  function grantRow(sign) {
    return GRANTS.map(function (n) {
      return '<button class="mini-btn' + (sign < 0 ? ' mini-btn--take' : '') +
        '" data-grant="' + (n * sign) + '">' +
        (sign < 0 ? '\u2212' : '+') + n.toLocaleString() + '</button>';
    }).join('');
  }

  function panel() {
    var p = W.state.profile;

    global.UI.modal({
      title: 'Admin', icon: I.shield, wide: true,
      body:
        '<div class="adm-who">' +
          '<div style="width:44px;height:44px;flex:none">' + W.avatarHtml(p) + '</div>' +
          '<div class="grow" style="min-width:0">' +
            '<b id="adm-name">' + W.escapeHtml(p.displayName || 'Explorer') + W.verifiedMark(p, 14) + '</b>' +
            '<span>Level ' + W.state.economy.level + ' · this device’s save</span>' +
          '</div>' +
          '<span class="chip chip--gem mono" id="adm-gems">' +
            W.state.economy.diamonds.toLocaleString() + ' 💎</span>' +
        '</div>' +

        '<div class="field" style="margin-top:22px">' +
          '<label class="field__label">Verified seal</label>' +
          '<div class="setting-row" style="border:none;padding:0">' +
            '<div class="setting-row__t">' +
              '<b>Show the seal beside this name</b>' +
              '<span>Appears on the home screen, the profile card and the menu.</span>' +
            '</div>' +
            '<button class="switch' + (p.verified ? ' is-on' : '') + '" id="adm-verified" ' +
              'role="switch" aria-checked="' + (p.verified ? 'true' : 'false') + '"></button>' +
          '</div>' +
        '</div>' +

        '<div class="field">' +
          '<label class="field__label">Diamonds</label>' +
          '<div class="adm-grants">' + grantRow(1) + '</div>' +
          '<div class="adm-grants adm-grants--take">' + grantRow(-1) + '</div>' +
          '<div class="row" style="gap:8px;margin-top:10px">' +
            '<input class="input mono" id="adm-amount" type="number" step="1" ' +
              'placeholder="Any amount" style="flex:1;min-width:0">' +
            '<button class="btn btn--accent" id="adm-give">Give</button>' +
            '<button class="btn btn--ghost" id="adm-take">Take</button>' +
          '</div>' +
          '<button class="mini-btn mini-btn--take adm-empty" id="adm-empty">Empty the balance</button>' +
          '<div class="field__hint">Taking stops at zero. Give with a negative amount ' +
            'does the same thing.</div>' +
        '</div>' +

        '<div id="adm-msg"></div>',
      actions: [{ label: 'Done', cls: 'btn--ghost', close: true }],
      onMount: function (root) {
        var sw = W.$('#adm-verified', root);
        sw.addEventListener('click', function () {
          var on = !W.state.profile.verified;
          W.state.profile.verified = on;
          W.saveNow();
          sw.classList.toggle('is-on', on);
          sw.setAttribute('aria-checked', on ? 'true' : 'false');
          W.$('#adm-name', root).innerHTML =
            W.escapeHtml(W.state.profile.displayName || 'Explorer') + W.verifiedMark(W.state.profile, 14);
          say(root, on ? 'Verified seal granted.' : 'Verified seal removed.');
          refresh();
        });

        W.$$('[data-grant]', root).forEach(function (b) {
          b.addEventListener('click', function () { give(root, +b.dataset.grant); });
        });

        var amt = W.$('#adm-amount', root);
        W.$('#adm-give', root).addEventListener('click', function () {
          withAmount(function (n) { give(root, n); });
        });
        /* Take reads the box as a size, so 200 and -200 both take 200. */
        W.$('#adm-take', root).addEventListener('click', function () {
          withAmount(function (n) { give(root, -Math.abs(n)); });
        });
        amt.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') W.$('#adm-give', root).click();
        });

        function withAmount(run) {
          var n = parseInt(amt.value, 10);
          if (!n) return say(root, 'Type an amount first.', true);
          amt.value = '';
          run(n);
        }

        /* Emptying the balance is the one thing here that cannot be typed
           back in a hurry, so it asks for a second tap. */
        var empty = W.$('#adm-empty', root), armed = 0;
        empty.addEventListener('click', function () {
          if (!W.state.economy.diamonds) return give(root, 0);
          if (!armed) {
            armed = setTimeout(disarm, 4000);
            empty.textContent = 'Tap again to empty';
            empty.classList.add('is-armed');
            return;
          }
          disarm();
          give(root, -W.state.economy.diamonds);
        });

        function disarm() {
          clearTimeout(armed);
          armed = 0;
          empty.textContent = 'Empty the balance';
          empty.classList.remove('is-armed');
        }
      }
    });
  }

  function give(root, n) {
    var e = W.state.economy;
    var before = e.diamonds;
    e.diamonds = Math.max(0, before + n);
    var moved = e.diamonds - before;
    W.saveNow();
    refresh();

    W.$('#adm-gems', root).innerHTML = e.diamonds.toLocaleString() + ' 💎';
    say(root, moved === 0
      ? 'Nothing to take — the balance is already 0.'
      : moved > 0
        ? 'Gave ' + moved.toLocaleString() + '. Balance ' + e.diamonds.toLocaleString() + '.'
        : 'Took ' + Math.abs(moved).toLocaleString() + '. Balance ' + e.diamonds.toLocaleString() + '.');
    if (moved > 0) { W.Sound.gem(); W.confetti({ count: 26, power: 150 }); }
    else if (moved < 0) W.Sound.flip();
  }

  function say(root, text, bad) {
    W.$('#adm-msg', root).innerHTML =
      '<div class="feedback feedback--' + (bad ? 'wrong' : 'right') + '" style="margin:4px 0 0">' +
      (bad ? I.info : I.check) + '<div><b>' + W.escapeHtml(text) + '</b></div></div>';
  }

  /* Anything already on screen that shows a name or a balance. */
  function refresh() {
    global.UI.refreshHud();
    var p = document.getElementById('view-portal');
    if (p && !p.classList.contains('hidden') && global.Portal) global.Portal.render();
  }

  global.Admin = { open: open, get unlocked() { return unlocked; } };
})(window);
