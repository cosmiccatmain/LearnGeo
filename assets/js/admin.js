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
  var scope = '';                /* which code opened it: 'gems' or 'ultra' */

  /* What the code that was typed is allowed to reach. Everything that
     gates on an admin code asks this rather than reading `unlocked`,
     so the gems code cannot walk into UltraAdmin. */
  function can(perm) {
    if (!unlocked) return false;
    var P = global.AdminPin;
    if (!P || !P.covers) return perm === 'gems';
    return P.covers(scope, perm);
  }

  /* ============================ number pad ========================== */
  /* open() is the gems panel. unlock(want, then) is the same number pad
     for anything else that needs a code — UltraAdmin uses it — so there
     is one pad, one check and one place the scope is decided.

     Already holding a code that covers what is being asked for goes
     straight through. Holding the other one does not: it asks again,
     because the whole point of two codes is that one is not the other. */
  function open() { unlock('gems', panel); }

  function unlock(want, then) {
    want = want || 'gems';
    if (unlocked && can(want)) return then ? then(scope) : panel();
    lock(want, then);
  }

  function lock(want, onPass) {
    want = want || 'gems';
    var typed = '';
    var keyHandler = null;       /* removed when the dialog closes, however it closes */

    var m = global.UI.modal({
      title: want === 'ultra' ? 'UltraAdmin' : 'Admin', icon: I.lock,
      body:
        '<p class="t-muted t-sm" style="margin:-4px 0 18px">Enter the four-digit code' +
          (want === 'ultra' ? ' for UltraAdmin' : '') + '.</p>' +
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
        /* Supabase answers which panel the code opens, without the page
           ever holding the codes (assets/js/admin-pin.js). If it cannot
           answer, nothing opens: there is no code built into this file
           to fall back on. */
        function check(mine) {
          var asking = global.AdminPin && global.AdminPin.verify(typed);
          if (!asking) return fail(NO_CHECK);
          errEl.textContent = 'Checking…';
          asking.then(function (got) {
            if (mine !== checkId || !document.body.contains(root)) return;
            if (got === null) return fail(NO_CHECK);
            if (!got) return fail('');
            /* A real code, but for the other panel. Say so rather than
               calling it wrong: a teacher who typed the UltraAdmin code
               here has not made a mistake, they are in the wrong place. */
            if (!global.AdminPin.covers(got, want)) {
              unlocked = true; scope = got;
              return fail('That code does not open this panel.');
            }
            pass(got);
          });
        }

        function pass(got) {
          unlocked = true;
          scope = got || 'gems';
          close();
          if (typeof onPass === 'function') onPass(scope);
          else panel();
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
            '<b id="adm-name">' + W.escapeHtml(p.displayName || 'Explorer') + W.verifiedMark(p, 14) +
              (global.Badges ? global.Badges.markup(null, 13) : '') + '</b>' +
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

        '<div class="field">' +
          '<label class="field__label">Badges</label>' +
          '<div class="adm-bdg" id="adm-badges"></div>' +
          '<div class="field__hint">Only the given badges can be switched here. ' +
            'Earned ones are shown so you can see what this save holds, and they ' +
            'have no switch because the rule owns them.</div>' +
        '</div>' +

        '<div class="field" id="adm-god"></div>' +

        '<div id="adm-msg"></div>',
      actions: [{ label: 'Done', cls: 'btn--ghost', close: true }],
      onMount: function (root) {
        /* God mode builds its own button, so this is only somewhere to put it.

           IT USED TO DO NOTHING INSIDE A LIVE GAME, ON PURPOSE. Owen asked for
           it to work there, which is his call, so it now does. The reasoning
           for the old refusal is kept below rather than deleted, because the
           harm it names is real and the protection against it is what changed,
           not the harm.

           The old note said GeoLive points feed live_players.score which feeds
           the class leaderboard. Measured 2026-09-12, that is not how the
           table ranks. order() in leaderboard.js sorts on level, then XP within
           the level, and both come from class_members, which GeoLive never
           writes. Accuracy is only the third key, reached when two students are
           on an identical level AND identical XP.

           So a god-moded game cannot climb the table. What it can still do is
           write a false accuracy, a false answered count and a false streak
           into a row on a table that has children's names on it, and break a
           tie. That is a smaller harm than the old note claimed and it is still
           a real one.

           What protects it: god mode never fakes a verdict. GeoLive is graded
           on the host's device, and that is untouched. What god mode rewrites is
           the CHOICE submitted from its own device, so the host grades a real
           answer. The exclusion of assisted play from the class leaderboard is
           SPECIFIED BUT NOT YET BUILT: it needs a marker that survives to the
           teacher's device, and that lives in cloud-geolive.js, not here. Until
           it lands, a god-moded game does show up in those columns. Do not read
           this comment as saying it is handled. */
        mountBadges(root);

        var god = W.$('#adm-god', root);
        if (god && global.GodMode && global.GodMode.mountToggle) {
          global.GodMode.mountToggle(god);
        }

        var sw = W.$('#adm-verified', root);
        sw.addEventListener('click', function () {
          var on = !W.state.profile.verified;
          W.state.profile.verified = on;
          W.saveNow();
          sw.classList.toggle('is-on', on);
          sw.setAttribute('aria-checked', on ? 'true' : 'false');
          redrawName(root);
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
  /* Every badge in one list. Given badges get a switch; earned ones are
     read-only, because the rule that grants them is the only thing allowed
     to, and a switch there would be a lie about what the panel controls. */
  function mountBadges(root) {
    var host = W.$('#adm-badges', root);
    if (!host || !global.Badges) return;
    var B = global.Badges;

    host.innerHTML = B.all().map(function (b) {
      var held = B.has(b.id);
      var given = B.granted(b);
      return '<div class="adm-bdg__row' + (held ? ' is-on' : '') + ' bdg--' + b.tone +
        '" data-badge="' + b.id + '">' +
        '<span class="adm-bdg__plate">' + B.svg(b, 17) + '</span>' +
        '<span class="adm-bdg__t"><b>' + W.escapeHtml(b.name) + '</b>' +
          '<span>' + W.escapeHtml(b.desc) + '</span></span>' +
        (given
          ? '<button class="switch' + (held ? ' is-on' : '') + '" data-toggle="' + b.id +
            '" role="switch" aria-checked="' + (held ? 'true' : 'false') +
            '" aria-label="' + W.escapeHtml(b.name) + '"></button>'
          : '<span class="adm-bdg__earned">' + (held ? 'earned' : 'locked') + '</span>') +
      '</div>';
    }).join('');

    W.$$('[data-toggle]', host).forEach(function (sw) {
      sw.addEventListener('click', function () {
        var id = sw.dataset.toggle;
        var on = global.Badges.has(id)
          ? !global.Badges.revoke(id)
          : global.Badges.grant(id);
        sw.classList.toggle('is-on', on);
        sw.setAttribute('aria-checked', on ? 'true' : 'false');
        sw.closest('.adm-bdg__row').classList.toggle('is-on', on);
        redrawName(root);
        say(root, (on ? 'Granted ' : 'Removed ') + global.Badges.find(id).name + '.');
        refresh();
      });
    });
  }

  function redrawName(root) {
    var el = W.$('#adm-name', root);
    if (!el) return;
    el.innerHTML = W.escapeHtml(W.state.profile.displayName || 'Explorer') +
      W.verifiedMark(W.state.profile, 14) +
      (global.Badges ? global.Badges.markup(null, 13) : '');
  }

  function refresh() {
    global.UI.refreshHud();
    var p = document.getElementById('view-portal');
    if (p && !p.classList.contains('hidden') && global.Portal) global.Portal.render();
  }

  global.Admin = {
    open: open, unlock: unlock, can: can,
    get unlocked() { return unlocked; },
    get scope() { return scope; }
  };
})(window);
