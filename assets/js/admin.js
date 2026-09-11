/* ------------------------------------------------------------------
   LearnGeo — admin panel.

   Opened with ?admin on the URL, unlocked with a four-digit code on a
   number pad, and then able to hand out the two things the app will not
   award by itself: the verified seal and diamonds.

   Read this before trusting it with anything: the code lives in the page
   source, which is a public repository and a public site, and everything
   it changes is this browser's own save. It keeps the panel out of the
   way of a student poking around. It is not a security boundary, and
   nothing here should ever guard anything that matters.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons;

  var CODE = '1357';
  var unlocked = false;          /* survives until the tab is closed */

  /* ============================ number pad ========================== */
  function open() {
    if (unlocked) return panel();
    lock();
  }

  function lock() {
    var typed = '';

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

        function onKey(e) {
          if (!document.body.contains(root)) return document.removeEventListener('keydown', onKey);
          if (/^[0-9]$/.test(e.key)) { e.preventDefault(); press(e.key); }
          else if (e.key === 'Backspace') { e.preventDefault(); press('back'); }
        }

        function press(k) {
          errEl.textContent = '';
          if (k === 'clear') typed = '';
          else if (k === 'back') typed = typed.slice(0, -1);
          else if (typed.length < CODE.length) typed += k;
          dotsEl.innerHTML = dots(typed);
          if (typed.length === CODE.length) setTimeout(check, 120);
        }

        /* The code above works with no internet. Anything else is checked
           by Supabase, which answers yes or no without the page ever
           holding the other codes (assets/js/admin-pin.js). */
        function check() {
          if (typed === CODE) return pass();
          var asking = global.AdminPin && global.AdminPin.verify(typed);
          if (!asking) return fail();
          errEl.textContent = 'Checking…';
          asking.then(function (ok) {
            if (!document.body.contains(root)) return;
            if (ok) pass(); else fail();
          });
        }

        function pass() {
          unlocked = true;
          document.removeEventListener('keydown', onKey);
          close();
          panel();
        }

        function fail() {
          typed = '';
          dotsEl.innerHTML = dots('');
          dotsEl.classList.remove('is-wrong');
          void dotsEl.offsetWidth;                 /* restart the shake */
          dotsEl.classList.add('is-wrong');
          errEl.textContent = 'Wrong code.';
          W.Sound.wrong();
        }
      }
    });
    return m;

    function key(n) {
      return '<button class="pad__key" data-k="' + n + '">' + n + '</button>';
    }
  }

  function dots(typed) {
    var out = '';
    for (var i = 0; i < CODE.length; i++) {
      out += '<i class="' + (i < typed.length ? 'is-on' : '') + '"></i>';
    }
    return out;
  }

  /* ============================== panel ============================= */
  var GRANTS = [100, 500, 1000, 5000];

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
          '<div class="adm-grants">' +
            GRANTS.map(function (n) {
              return '<button class="mini-btn" data-grant="' + n + '">+' + n.toLocaleString() + '</button>';
            }).join('') +
          '</div>' +
          '<div class="row" style="gap:8px;margin-top:10px">' +
            '<input class="input mono" id="adm-amount" type="number" min="1" step="1" ' +
              'placeholder="Any amount" style="flex:1">' +
            '<button class="btn btn--accent" id="adm-give">Give</button>' +
          '</div>' +
          '<div class="field__hint">Negative amounts take diamonds away. It will not go below zero.</div>' +
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
          var n = parseInt(amt.value, 10);
          if (!n) return say(root, 'Type an amount first.', true);
          amt.value = '';
          give(root, n);
        });
        amt.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') W.$('#adm-give', root).click();
        });
      }
    });
  }

  function give(root, n) {
    var e = W.state.economy;
    var before = e.diamonds;
    e.diamonds = Math.max(0, before + n);
    var moved = e.diamonds - before;
    W.saveNow();
    W.emit();
    refresh();

    W.$('#adm-gems', root).innerHTML = e.diamonds.toLocaleString() + ' 💎';
    say(root, moved >= 0
      ? 'Gave ' + moved.toLocaleString() + '. Balance ' + e.diamonds.toLocaleString() + '.'
      : 'Took ' + Math.abs(moved).toLocaleString() + '. Balance ' + e.diamonds.toLocaleString() + '.');
    if (moved > 0) { W.Sound.gem(); W.confetti({ count: 26, power: 150 }); }
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
