/* ------------------------------------------------------------------
   LearnGeo — app shell: HUD, profile menu, modals,
   settings, customisation and the diamond shop.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons, Cos = global.Cosmetics;

  var currentView = 'learn';
  var previewing = false;

  /* A teacher opening an assignment to check it. Study views are otherwise
     closed to them, so this opens a door and puts a way back on screen. */
  function startPreview(label) {
    previewing = true;
    var bar = document.getElementById('preview-bar');
    if (bar) {
      bar.classList.remove('hidden');
      bar.querySelector('[data-label]').textContent = label || 'Previewing an assignment';
    }
    document.body.classList.add('is-previewing');
  }

  function endPreview() {
    previewing = false;
    var bar = document.getElementById('preview-bar');
    if (bar) bar.classList.add('hidden');
    document.body.classList.remove('is-previewing');
    go('teacher');
  }

  /* ============================== MODALS ============================ */
  var openModals = [];

  function modal(opts) {
    var ov = W.el('div', 'overlay');
    var m = W.el('div', 'modal' + (opts.wide ? ' modal--wide' : ''));

    var headHtml = opts.title
      ? '<div class="modal__head">' +
          (opts.icon ? '<span style="color:var(--muted)">' + opts.icon + '</span>' : '') +
          '<h3>' + W.escapeHtml(opts.title) + '</h3>' +
          /* a non-dismissible dialog gets no escape hatch, or it is not one */
          (opts.dismissible === false ? '' : '<button class="icon-btn" data-close>' + I.close + '</button>') +
        '</div>'
      : '';

    var actionsHtml = (opts.actions || []).map(function (a, i) {
      return '<button class="btn ' + (a.cls || 'btn--ghost') + '" data-act="' + i + '">' + a.label + '</button>';
    }).join('');

    m.innerHTML = headHtml +
      (opts.tabs ? opts.tabs : '') +
      '<div class="modal__body">' + opts.body + '</div>' +
      (actionsHtml ? '<div class="modal__foot">' + (opts.footLeft || '<div class="grow"></div>') + actionsHtml + '</div>' : '');

    if (opts.dismissible === false) ov.dataset.locked = '1';
    ov.appendChild(m);
    document.body.appendChild(ov);
    document.body.classList.add('no-scroll');
    openModals.push(ov);

    function close() {
      ov.remove();
      openModals = openModals.filter(function (x) { return x !== ov; });
      if (!openModals.length) document.body.classList.remove('no-scroll');
      if (opts.onClose) opts.onClose();
    }

    W.$$('[data-close]', m).forEach(function (b) { b.addEventListener('click', close); });
    (opts.actions || []).forEach(function (a, i) {
      var btn = W.$('[data-act="' + i + '"]', m);
      if (!btn) return;
      btn.addEventListener('click', function () {
        var keep = a.onClick && a.onClick(m, close);
        if (a.close && keep !== false) close();
      });
    });
    ov.addEventListener('mousedown', function (e) { if (e.target === ov && opts.dismissible !== false) close(); });

    if (opts.onMount) opts.onMount(m, close);
    return { el: m, close: close };
  }

  function escClose(e) {
    if (e.key === 'Escape' && openModals.length) {
      var top = openModals[openModals.length - 1];
      if (top.dataset.locked === '1') return;
      var btn = top.querySelector('[data-close]');
      if (btn) btn.click(); else { top.remove(); openModals.pop(); document.body.classList.remove('no-scroll'); }
    }
  }
  document.addEventListener('keydown', escClose);

  /* Segmented controls / checkbox grids used across every panel. */
  function wireSeg(root) {
    W.$$('.seg', root).forEach(function (seg) {
      W.$$('button', seg).forEach(function (b) {
        b.addEventListener('click', function () {
          W.$$('button', seg).forEach(function (x) { x.classList.remove('is-active'); });
          b.classList.add('is-active');
          if (seg.dataset.onchange && global.UI[seg.dataset.onchange]) global.UI[seg.dataset.onchange](b.dataset.v, seg);
        });
      });
    });
  }
  function wireCheck(root) {
    W.$$('.check', root).forEach(function (c) {
      c.addEventListener('click', function () { c.classList.toggle('is-on'); });
    });
  }

  /* =============================== HUD ============================== */
  function refreshHud(bump) {
    var s = W.state;
    var teacher = s.role === 'teacher';

    set('hud-gems', s.economy.diamonds.toLocaleString());
    set('hud-gems-short', W.compact(s.economy.diamonds));
    set('hud-level', 'Lv ' + s.economy.level);
    set('hud-streak', String(s.streak.current));

    /* Narrow screens show the short spelling, so keep the exact figure
       somewhere it can still be read. */
    var gemChip = document.getElementById('hud-gem-chip');
    if (gemChip) gemChip.title = s.economy.diamonds.toLocaleString() + ' diamonds';

    /* XP, diamonds and answer streaks are earned by answering questions,
       which teachers never do here. Their half of the top bar says which
       class they are in and what its code is instead. */
    var fireEl = document.getElementById('hud-fire');
    if (fireEl) fireEl.classList.toggle('hidden', teacher || s.streak.current < 2);
    ['hud-xp-chip', 'hud-gem-chip'].forEach(function (id) {
      var n = document.getElementById(id);
      if (n) n.classList.toggle('hidden', teacher);
    });
    classChip(teacher, s);

    var av = document.getElementById('avatar-slot');
    if (av) av.innerHTML = W.avatarHtml(s.profile);

    var lp = W.levelProgress();
    var bar = document.getElementById('hud-xpbar');
    if (bar) {
      bar.style.width = Math.min(100, (lp.have / lp.need) * 100) + '%';
      /* the hairline track under the bar is an XP meter too */
      if (bar.parentNode) bar.parentNode.classList.toggle('hidden', teacher);
    }

    if (bump) {
      ['hud-gem-chip', 'hud-xp-chip'].forEach(function (id) {
        var n = document.getElementById(id);
        if (!n) return;
        n.classList.remove('is-bumped');
        void n.offsetWidth;
        n.classList.add('is-bumped');
      });
    }
    function set(id, v) { var n = document.getElementById(id); if (n) n.textContent = v; }
  }

  /* Built here rather than sitting in the markup, because it only ever
     exists for one of the two roles. */
  function classChip(teacher, s) {
    var hud = document.querySelector('.hud');
    var chip = document.getElementById('hud-class');
    if (!hud) return;
    if (!teacher) { if (chip) chip.remove(); return; }
    if (!chip) {
      chip = W.el('span', 'hud__item hud__class');
      chip.id = 'hud-class';
      chip.title = 'Your class and the code students type to join it';
      hud.appendChild(chip);
    }
    var c = s.classroom || {};
    chip.innerHTML = '<b>' + W.escapeHtml(c.name || 'Your class') + '</b>' +
      (c.code ? '<i class="mono">' + W.escapeHtml(c.code) + '</i>' : '');
  }

  /* =========================== PROFILE MENU ========================= */
  var menuEl = null;

  function toggleMenu() {
    if (menuEl) return closeMenu();
    var s = W.state, lp = W.levelProgress();

    menuEl = W.el('div', 'menu');
    menuEl.innerHTML =
      '<div class="menu__head">' +
        '<div style="width:40px;height:40px;flex:none">' + W.avatarHtml(s.profile) + '</div>' +
        '<div class="grow" style="min-width:0">' +
          '<div class="menu__name">' + W.escapeHtml(s.profile.displayName || 'Explorer') +
            W.verifiedMark(s.profile, 13) + '</div>' +
          '<div class="menu__meta">Lv ' + s.economy.level + ' · ' + lp.have + '/' + lp.need + ' XP · ' +
            s.economy.diamonds.toLocaleString() + ' 💎</div>' +
        '</div>' +
      '</div>' +
      acctBlock() +
      item('settings', I.gear, 'Settings') +
      item('custom', I.palette, 'Customization') +
      item('achievements', I.trophy, 'Achievements') +
      '<div class="menu__sep"></div>' +
      (signedIn()
        ? item('signout', I.logout, 'Sign out')
        : item('signin', I.user, 'Sign in or create account')) +
      '<div class="menu__note">' + I.shield +
        (signedIn()
          ? '<span>Saved to your account<br><i>' + s.stats.answered.toLocaleString() +
            ' answers, on any device you sign in on</i></span>'
          : '<span>Saved in this browser<br><i>' + s.stats.answered.toLocaleString() +
            ' answers. Sign in to use them on other devices</i></span>') +
      '</div>';

    document.querySelector('.topbar').appendChild(menuEl);
    setTimeout(function () { document.addEventListener('mousedown', outside); }, 0);

    W.$$('[data-go]', menuEl).forEach(function (b) {
      b.addEventListener('click', function () {
        var go = b.dataset.go;
        closeMenu();
        if (go === 'settings') openSettings();
        else if (go === 'custom') openCustomization();
        else if (go === 'achievements') openAchievements();
        else if (go === 'signin') openAuth('signin');
        else if (go === 'signout') signOut();
      });
    });

    function item(id, icon, label) {
      return '<button class="menu__item" data-go="' + id + '">' + icon + '<span>' + label + '</span></button>';
    }
  }

  function outside(e) {
    if (!menuEl) return;
    if (menuEl.contains(e.target) || e.target.closest('#avatar-btn')) return;
    closeMenu();
  }
  function closeMenu() {
    if (menuEl) menuEl.remove();
    menuEl = null;
    document.removeEventListener('mousedown', outside);
  }

  /* ============================= SETTINGS =========================== */
  function openSettings() {
    var s = W.state.settings;

    var tabs = '<div class="vtabs" id="set-tabs">' +
      '<button class="vtab is-active" data-t="general">' + I.gear + ' General</button>' +
      '<button class="vtab" data-t="data">' + I.layers + ' Study data</button>' +
      '</div>';

    var general =
      '<div data-panel="general">' +
        row('Sound effects', 'Plays a little sound when you answer.', sw('set-sound', s.sound)) +
        row('Reward animations', 'Shows confetti, floating XP and profile effects.', sw('set-effects', s.effects)) +
        row('Show capital pins in Learn', 'Puts a pin on the capital as soon as you answer.', sw('set-pins', s.showCapitalPins)) +
        '<div class="divider"></div>' +
        '<div class="field"><label class="field__label">Daily goal</label>' +
          '<div class="seg" id="set-goal">' +
            ['10', '20', '40', '75'].map(function (n) {
              return '<button data-v="' + n + '" class="' + (String(W.state.daily.goal) === n ? 'is-active' : '') + '">' + n + '</button>';
            }).join('') +
          '</div><div class="field__hint">How many questions you want to do each day. Hit it to add a day to your streak.</div></div>' +
      '</div>';

    var m = W.state.mastery;
    var seen = Object.keys(m).length;
    var strong = W.masteredCount();
    var st = W.state.stats;
    var acc = st.answered ? Math.round((st.correct / st.answered) * 100) : 0;

    var acctRow = signedIn()
      ? row('Account', 'Signed in as ' + W.escapeHtml(global.Cloud.user.email || '') + '. Your progress saves to your account.',
            '<button class="btn btn--ghost btn--sm" id="set-signout">Sign out</button>')
      : row('Account', 'You’re playing as a guest, so your progress only stays in this browser.',
            '<button class="btn btn--accent btn--sm" id="set-signin">Sign in</button>');

    var dataPanel =
      '<div data-panel="data" class="hidden">' +
        acctRow + '<div class="divider"></div>' +
        '<div class="stats" style="margin:0 0 20px;padding:0;grid-template-columns:repeat(4,1fr);border-top:none">' +
          st4('Answered', st.answered) + st4('Accuracy', acc + '%') +
          st4('Tests', st.tests) + st4('Cards', st.cards) +
        '</div>' +
        row('Places you’ve seen', seen + ' of ' + global.GeoData.counts.total + ' total', '') +
        row('Mastered', strong + ' places at box 4 or 5', '') +
        row('Best answer streak', W.state.streak.best + ' in a row', '') +
        '<div class="divider"></div>' +
        '<div class="setting-row"><div class="setting-row__t">' +
          '<b>Reset all progress</b><span>This deletes your XP, diamonds, progress, purchases and achievements' +
            (signedIn() ? ', here and in your account' : '') + '. You can’t undo it.</span>' +
          '</div><button class="btn btn--ghost btn--sm" id="set-reset" style="color:var(--danger);border-color:#F3C6C6">Reset</button></div>' +
      '</div>';

    modal({
      title: 'Settings', icon: I.gear, wide: true, tabs: tabs,
      body: general + dataPanel,
      actions: [{ label: 'Done', cls: 'btn--primary', close: true, onClick: saveSettings }],
      onMount: function (root, close) {
        wireSeg(root);
        wireTabs(root, '#set-tabs');
        W.$$('.switch', root).forEach(function (sw2) {
          sw2.addEventListener('click', function () { sw2.classList.toggle('is-on'); });
        });
        var so = W.$('#set-signout', root), si = W.$('#set-signin', root);
        if (so) so.addEventListener('click', function () { close(); signOut(); });
        if (si) si.addEventListener('click', function () { close(); openAuth('signin'); });
        W.$('#set-reset', root).addEventListener('click', function () {
          modal({
            title: 'Reset everything?', icon: I.info,
            body: '<p class="t-muted">This clears all your diamonds, levels, purchases and mastery on this device. ' +
              'You can’t get any of it back.</p>',
            actions: [
              { label: 'Cancel', cls: 'btn--ghost', close: true },
              { label: 'Reset everything', cls: 'btn--primary', close: true, onClick: function () {
                  W.reset(); close(); refreshHud(); global.UI.showLanding();
                  var C = global.Cloud;
                  if (!signedIn() || !C || !C.push) {
                    W.toast('Progress reset', 'Everything’s back to the start', I.refresh);
                    return;
                  }
                  /* The empty save still has to reach the account. Nothing
                     waits for the background push, and if it never lands the
                     next sign-in brings every diamond and level back. */
                  W.toast('Progress reset', 'Clearing your account too', I.refresh, 2200);
                  C.push().then(report, report);

                  function report() {
                    /* push stamps this the moment the account takes the save,
                       and the reset just wiped it, so it is the honest signal */
                    if (W.state.meta.syncedAt) {
                      W.toast('Account cleared', 'Nothing left to bring back', I.check);
                    } else {
                      W.toast('Cleared on this device only',
                        'Your account still has the old copy. Open the app again while you’re online to finish it.',
                        I.info, 6500);
                    }
                  }
                } }
            ]
          });
        });
      }
    });

    function saveSettings(root) {
      var s2 = W.state.settings;
      s2.sound   = W.$('#set-sound', root).classList.contains('is-on');
      s2.effects = W.$('#set-effects', root).classList.contains('is-on');
      s2.showCapitalPins = W.$('#set-pins', root).classList.contains('is-on');
      var goal = W.$('#set-goal .is-active', root);
      if (goal) W.state.daily.goal = parseInt(goal.dataset.v, 10);
      W.saveNow();
      refreshHud();
    }

    function row(t, sub, right) {
      return '<div class="setting-row"><div class="setting-row__t"><b>' + t + '</b><span>' + sub + '</span></div>' + right + '</div>';
    }
    function sw(id, on) { return '<button class="switch ' + (on ? 'is-on' : '') + '" id="' + id + '" role="switch"></button>'; }
    function st4(l, v) { return '<div class="stat" style="padding:14px 4px"><div class="stat__n">' + v + '</div><div class="stat__l">' + l + '</div></div>'; }
  }

  function wireTabs(root, sel) {
    var bar = W.$(sel, root);
    if (!bar) return;
    W.$$('.vtab', bar).forEach(function (t) {
      t.addEventListener('click', function () {
        W.$$('.vtab', bar).forEach(function (x) { x.classList.remove('is-active'); });
        t.classList.add('is-active');
        W.$$('[data-panel]', root).forEach(function (p) {
          p.classList.toggle('hidden', p.dataset.panel !== t.dataset.t);
        });
      });
    });
  }

  /* ========================== CUSTOMIZATION ========================= */
  function openCustomization() {
    var body =
      '<div class="split" style="grid-template-columns:1fr 300px;gap:26px;align-items:start">' +
        '<div id="cz-panels">' +
          profilePanel() + shopPanel('avatars') + shopPanel('decorations') +
          shopPanel('effects') + shopPanel('nameplates') + shopPanel('banners') + shopPanel('themes') +
        '</div>' +
        '<div><span class="eyebrow">Live preview</span>' +
          '<div id="cz-preview" style="margin-top:10px"></div>' +
          '<div class="row" style="margin-top:14px;gap:6px;justify-content:center">' +
            '<span class="chip chip--gem mono" id="cz-balance">' + W.gem(W.state.economy.diamonds.toLocaleString(), false) + '</span>' +
          '</div>' +
          '<div class="t-sm t-muted t-center" style="margin-top:10px">You get diamonds for answering questions, ' +
            'finishing tests and getting achievements.</div>' +
        '</div>' +
      '</div>';

    var tabs = '<div class="vtabs" id="cz-tabs">' +
      vt('profile', I.user, 'Profile', true) + vt('avatars', I.globe, 'Avatar') +
      vt('decorations', I.sparkle, 'Decorations') + vt('effects', I.bolt, 'Effects') +
      vt('nameplates', I.grid, 'Nameplates') + vt('banners', I.layers, 'Banner') +
      vt('themes', I.palette, 'Theme') + '</div>';

    modal({
      title: 'Customization', icon: I.palette, wide: true, tabs: tabs, body: body,
      actions: [{ label: 'Done', cls: 'btn--primary', close: true, onClick: commitProfile }],
      onMount: function (root) {
        wireTabs(root, '#cz-tabs');
        wireShop(root);
        wireProfileFields(root);
        drawPreview(root);
      }
    });

    function vt(id, icon, label, active) {
      return '<button class="vtab' + (active ? ' is-active' : '') + '" data-t="' + id + '">' + icon + ' ' + label + '</button>';
    }
  }

  function profilePanel() {
    var p = W.state.profile;
    return '<div data-panel="profile">' +
      '<div class="field"><label class="field__label">Display name</label>' +
        '<input class="input" id="cz-name" maxlength="32" value="' + W.escapeHtml(p.displayName) + '"></div>' +
      '<div class="field"><label class="field__label">Pronouns</label>' +
        '<input class="input" id="cz-pronouns" maxlength="24" placeholder="e.g. they/them" value="' + W.escapeHtml(p.pronouns) + '">' +
        '<div class="field__hint">Shown under your name on your profile card.</div></div>' +
      '<div class="field"><label class="field__label">About me</label>' +
        '<textarea class="input" id="cz-about" maxlength="190" placeholder="A short bio, up to 190 characters">' +
        W.escapeHtml(p.about) + '</textarea>' +
        '<div class="field__hint"><span id="cz-count">' + p.about.length + '</span>/190</div></div>' +
      '<div class="field"><label class="field__label">Status</label>' +
        '<div class="seg" id="cz-status">' +
          Cos.statuses.map(function (s) {
            return '<button data-v="' + s.id + '" class="' + (p.status === s.id ? 'is-active' : '') + '">' +
              '<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:' + s.color +
              ';margin-right:6px"></span>' + s.name + '</button>';
          }).join('') +
        '</div></div>' +
      '</div>';
  }

  var LISTS = {
    avatars: 'avatar', decorations: 'decoration', effects: 'effect',
    nameplates: 'nameplate', banners: 'banner', themes: 'theme'
  };

  function shopPanel(kind) {
    var list = Cos[kind];
    var slot = LISTS[kind];
    var owned = W.state.owned[kind] || [];
    var equipped = W.state.profile[slot];

    return '<div data-panel="' + kind + '" class="hidden">' +
      '<div class="row row--between" style="margin-bottom:14px">' +
        '<div><b style="font-size:15px">' + label(kind) + '</b>' +
        '<div class="t-sm t-muted">Click to equip. Locked items cost diamonds.</div></div>' +
      '</div>' +
      '<div class="shop-grid">' +
        list.map(function (it) {
          var isOwned = it.price === 0 || owned.indexOf(it.id) !== -1;
          var isEq = equipped === it.id;
          return '<button class="shop-item' + (isEq ? ' is-equipped' : '') + (isOwned ? '' : ' is-locked') + '" ' +
            'data-kind="' + kind + '" data-id="' + it.id + '" data-price="' + (it.price || 0) + '" ' +
            'data-owned="' + (isOwned ? 1 : 0) + '">' +
            visual(kind, it) +
            '<span class="shop-item__name">' + W.escapeHtml(it.name || it.id) + '</span>' +
            (isEq ? '<span class="shop-item__eq mono">EQUIPPED</span>'
                  : isOwned ? '<span class="shop-item__owned">owned</span>'
                  : '<span class="shop-item__price mono">' + I.gem + ' ' + it.price + '</span>') +
            '</button>';
        }).join('') +
      '</div></div>';

    function label(k) {
      return { avatars: 'Avatar', decorations: 'Avatar decoration', effects: 'Profile effect',
               nameplates: 'Nameplate', banners: 'Profile banner', themes: 'Profile theme' }[k];
    }
  }

  function visual(kind, it) {
    var Av = global.Avatars;
    if (kind === 'avatars') {
      return '<span class="shop-item__vis" style="background:var(--paper);color:' + it.color +
        ';padding:13px">' + Av.svg(it.art, it.color) + '</span>';
    }
    if (kind === 'decorations') {
      var inner = '<span class="shop-item__vis-inner">' + Av.svg('globe', 'var(--faint)') + '</span>';
      if (it.kind === 'ring') {
        return '<span class="shop-item__vis" style="background:linear-gradient(135deg,' + it.c1 + ',' + it.c2 +
          ');padding:3px"><span class="shop-item__disc">' + inner + '</span></span>';
      }
      if (it.kind === 'badge') {
        return '<span class="shop-item__vis" style="background:var(--paper);padding:13px">' + inner +
          '<span class="shop-item__badge" style="color:' + it.c1 + '">' + Av.badge(it.badge, it.c1) + '</span></span>';
      }
      if (it.kind === 'orbit') {
        return '<span class="shop-item__vis" style="background:var(--paper);border:1.5px dashed ' + it.c1 +
          ';padding:13px">' + inner + '</span>';
      }
      return '<span class="shop-item__vis" style="background:var(--paper);padding:13px">' + inner + '</span>';
    }
    if (kind === 'effects') {
      if (!it.shape) return '<span class="shop-item__vis" style="background:var(--paper);color:var(--faint)">—</span>';
      return '<span class="shop-item__vis shop-item__vis--fx" style="background:var(--paper)">' +
        it.colors.slice(0, 3).map(function (c, i) {
          var st = it.shape === 'ring' ? 'border-color:' + c : 'background:' + c;
          return '<i class="fx-' + it.shape + '" style="' + st + ';position:static;animation:none;margin:1px"></i>';
        }).join('') + '</span>';
    }
    if (kind === 'nameplates') {
      return '<span class="shop-item__vis shop-item__vis--bar" style="background:' + it.css +
        ';border:1px solid var(--line);color:' + it.text + ';font-size:11px;font-weight:600">Aa</span>';
    }
    if (kind === 'banners') {
      return '<span class="shop-item__vis shop-item__vis--bar" style="background:' + it.css + ';border:1px solid var(--line)"></span>';
    }
    if (kind === 'themes') {
      return '<span class="shop-item__vis" style="background:linear-gradient(135deg,' + it.c1 + ',' + it.c2 + ')"></span>';
    }
    return '<span class="shop-item__vis"></span>';
  }

  /* `root` is the whole dialog, which equip() needs to find the panel, the
     preview and the balance. `scope` limits which buttons get a handler, so
     a rebuilt panel can be wired without touching the others. */
  function wireShop(root, scope) {
    W.$$('.shop-item', scope || root).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var kind = btn.dataset.kind, id = btn.dataset.id;
        var price = parseInt(btn.dataset.price, 10) || 0;
        var owned = btn.dataset.owned === '1';

        if (!owned) return buy(kind, id, price, root);
        equip(kind, id, root);
      });
    });
  }

  function buy(kind, id, price, root) {
    var item = Cos.find(Cos[kind], id);
    if (W.state.economy.diamonds < price) {
      W.Sound.wrong();
      W.toast('Not enough diamonds', 'You need ' + (price - W.state.economy.diamonds) + ' more', I.gem, 3400);
      return;
    }
    modal({
      title: 'Unlock ' + (item.name || id),
      icon: I.shop,
      body: '<div class="t-center" style="padding:8px 0 4px">' +
        '<div style="display:inline-block">' + visual(kind, item) + '</div>' +
        '<p style="margin-top:14px" class="t-muted">Unlock <b>' + W.escapeHtml(item.name) + '</b> for ' +
        '<b class="mono">' + price + ' 💎</b>? You have ' +
        '<b class="mono">' + W.state.economy.diamonds.toLocaleString() + ' 💎</b>.</p></div>',
      actions: [
        { label: 'Cancel', cls: 'btn--ghost', close: true },
        { label: 'Unlock', cls: 'btn--accent', close: true, onClick: function () {
            /* Already unlocked: equip it, but never charge for it twice. */
            var have = W.state.owned[kind] || [];
            if (have.indexOf(id) !== -1) return equip(kind, id, root);
            if (!W.spend(price)) return;
            W.state.owned[kind] = have.concat([id]);
            W.saveNow();
            W.Sound.gem();
            W.confetti({ count: 46, power: 190 });
            W.toast('Unlocked', item.name + ' is yours', I.sparkle);
            equip(kind, id, root);
          } }
      ]
    });
  }

  function equip(kind, id, root) {
    W.state.profile[LISTS[kind]] = id;
    W.saveNow();
    W.Sound.flip();
    /* re-render just the affected panel, keeping the open tab */
    var panel = W.$('[data-panel="' + kind + '"]', root);
    if (panel) {
      var wasHidden = panel.classList.contains('hidden');
      var fresh = W.el('div');
      fresh.innerHTML = shopPanel(kind);
      var next = fresh.firstChild;
      if (wasHidden) next.classList.add('hidden'); else next.classList.remove('hidden');
      panel.replaceWith(next);
      /* Only the panel that was just rebuilt. Wiring the whole dialog again
         left every other panel's buttons holding one more click handler
         each time, so one click later fired the handler many times over. */
      wireShop(root, next);
    }
    drawPreview(root);
    refreshHud();
    var bal = W.$('#cz-balance', root);
    /* built with W.gem(), so put it back the same way rather than dropping
       the sized diamond for a bare emoji */
    if (bal) bal.innerHTML = W.gem(W.state.economy.diamonds.toLocaleString(), false);
  }

  function wireProfileFields(root) {
    var name = W.$('#cz-name', root), pron = W.$('#cz-pronouns', root), about = W.$('#cz-about', root);
    [name, pron, about].forEach(function (el) {
      if (el) el.addEventListener('input', function () {
        var c = W.$('#cz-count', root);
        if (c && about) c.textContent = about.value.length;
        drawPreview(root);
      });
    });
    var seg = W.$('#cz-status', root);
    if (seg) W.$$('button', seg).forEach(function (b) {
      b.addEventListener('click', function () {
        W.$$('button', seg).forEach(function (x) { x.classList.remove('is-active'); });
        b.classList.add('is-active');
        W.state.profile.status = b.dataset.v;
        drawPreview(root);
        refreshHud();
      });
    });
  }

  function commitProfile(root) {
    var p = W.state.profile;
    var name = W.$('#cz-name', root), pron = W.$('#cz-pronouns', root), about = W.$('#cz-about', root);
    if (name) p.displayName = name.value.trim().slice(0, 32) || 'Explorer';
    if (pron) p.pronouns = pron.value.trim().slice(0, 24);
    if (about) p.about = about.value.trim().slice(0, 190);
    W.saveNow();
    refreshHud();
    W.toast('Profile saved', p.displayName, I.check);
  }

  /* Reads live field values so the preview updates as you type. */
  function drawPreview(root) {
    var host = W.$('#cz-preview', root);
    if (!host) return;
    var p = W.state.profile;
    var nameEl = W.$('#cz-name', root), pronEl = W.$('#cz-pronouns', root), aboutEl = W.$('#cz-about', root);
    var live = {
      displayName: nameEl ? nameEl.value : p.displayName,
      pronouns: pronEl ? pronEl.value : p.pronouns,
      about: aboutEl ? aboutEl.value : p.about
    };
    host.innerHTML = profileCard(live);
    runEffect(host);
  }

  /* A theme used to be a 1px border at 20% alpha and three numbers in c2, and
     every c2 is near black, so at 17px they all read as dark text. Measured on
     the rendered card that was 5% of its area, none of it loud. Seven themes,
     up to 800 diamonds, and no way to tell which one was on.

     Owen's answer to what a theme should colour was "all of the white space
     around like bio and stuff", so the body is the canvas: everything under
     the banner, behind the name, pronouns, bio and stats.

     Two things it still must not touch. The BANNER is its own purchasable
     slot and repainting the top strip would make every banner in the shop
     worthless. The NAMEPLATE is its own slot too. The theme owns the space
     between them and nothing else.

     Readability is the limit that shapes the numbers below. The body carries
     c1 at 37% down to 20%, which is a clear pastel on white for all seven
     including Graphite, and every piece of text on that surface is set from
     c2, which is near black in every theme. That is why the greys are
     overridden here: var(--faint) at #9CA3AF is fine on white and much too
     weak once the surface is tinted. Inline beats the class rule, so this
     needs no stylesheet change. */
  function themeCard(t) { return 'border-color:' + t.c1; }

  function themeBody(t) {
    return 'border-top:3px solid ' + t.c1 + ';' +
           /* Both stops carry colour, and neither is the keyword `transparent`.
              Two separate reasons, and the second one is the one that bites.

              1. A stop that fades out leaves the bottom of the card white, and
                 the bottom is where the bio and the stats are. That white is
                 the white space Owen asked to be coloured in the first place.
              2. `transparent` is rgba(0,0,0,0), so a gradient running to it can
                 interpolate through transparent BLACK and lay a grey cast down
                 the card. Fading to the same hue at zero alpha avoids it. This
                 reads as pointless long-hand and is not: shortening it back to
                 `transparent` looks correct, passes review, and dirties every
                 card at runtime. */
           'background:linear-gradient(180deg,' + t.c1 + '5E 0%,' + t.c1 + '33 100%)';
  }

  function themeStats(t) {
    return 'background:' + t.c1 + '40;border-top-color:' + t.c1 + '73;' +
           'border-radius:12px;padding:12px 10px 10px';
  }

  /* c2 at an alpha, so secondary text stays secondary without going pale.

     THE FLOOR IS 'D1' (82%) AND IT IS MEASURED, NOT GUESSED. Composited over
     the tinted body, c2 below that alpha drops under 4.5:1 against the
     surface. Clay is the worst case: its body is the lightest of the seven
     and #7C2D12 is the warmest c2, so it needs 0.82 where Default needs
     0.61. Every alpha below clears Clay, which clears all seven.

     Before this, these were var(--faint) at #9CA3AF, which is fine on white
     and fails on every tinted surface. Do not pale them back down without
     re-running the contrast check against the lightest theme. */
  function themeInk(t, a) { return 'color:' + t.c2 + a; }

  function profileCard(live) {
    var p = W.state.profile, s = W.state;
    var banner = Cos.find(Cos.banners, p.banner);
    var plate = Cos.find(Cos.nameplates, p.nameplate);
    var theme = Cos.find(Cos.themes, p.theme);
    var name = (live && live.displayName) || p.displayName || 'Explorer';
    var pron = (live && live.pronouns) || p.pronouns;
    var about = (live && live.about !== undefined) ? live.about : p.about;

    return '<div class="profile-card" style="' + themeCard(theme) + '">' +
      '<div class="profile-card__banner" style="background:' + banner.css + '"></div>' +
      '<div class="profile-fx" data-effect="' + p.effect + '"></div>' +
      '<div class="profile-card__body" style="' + themeBody(theme) + '">' +
        '<div class="profile-card__avatar">' + W.avatarHtml(p) + '</div>' +
        '<div class="profile-card__name" style="background:' + plate.css + ';color:' + plate.text + '">' +
          W.escapeHtml(name) + W.verifiedMark(p, 15) + '</div>' +
        '<div class="profile-card__tag" style="' + themeInk(theme, 'DE') + '">Level ' +
          s.economy.level + ' · ' + s.economy.diamonds.toLocaleString() + ' 💎</div>' +
        (pron ? '<div class="profile-card__pronouns" style="' + themeInk(theme, 'D9') + '">' +
          W.escapeHtml(pron) + '</div>' : '') +
        (about ? '<div class="profile-card__about" style="' + themeInk(theme, 'E6') +
          ';border-top-color:' + theme.c1 + '59">' + W.escapeHtml(about) + '</div>' : '') +
        '<div class="profile-card__stats" style="' + themeStats(theme) + '">' +
          stat(s.stats.answered, 'answered') +
          stat(s.stats.answered ? Math.round(s.stats.correct / s.stats.answered * 100) + '%' : '—', 'accuracy') +
          stat(W.masteredCount(), 'mastered') +
        '</div>' +
      '</div></div>';

    function stat(v, l) {
      /* the label override is the point: var(--faint) is pinned in app.css and
         is far too weak once the surface behind it is no longer white */
      return '<div class="profile-card__stat" style="color:' + theme.c2 + '">' +
        '<b>' + v + '</b><span style="' + themeInk(theme, 'D9') + '">' + l + '</span></div>';
    }
  }

  function runEffect(host) {
    var layer = host.querySelector('.profile-fx');
    if (!layer) return;
    var fx = Cos.find(Cos.effects, layer.dataset.effect);
    layer.innerHTML = '';
    if (!fx.shape || !W.state.settings.effects) return;
    for (var i = 0; i < 16; i++) {
      var n = document.createElement('i');
      n.className = 'fx-' + fx.shape;
      var col = fx.colors[i % fx.colors.length];
      if (fx.shape === 'ring') n.style.borderColor = col; else n.style.background = col;
      n.style.left = (Math.random() * 94) + '%';
      n.style.animationDuration = (2.6 + Math.random() * 2.8) + 's';
      n.style.animationDelay = (Math.random() * 3.2) + 's';
      var scale = 0.7 + Math.random() * 0.8;
      n.style.transform = 'scale(' + scale + ')';
      layer.appendChild(n);
    }
  }

  /* ========================== ACHIEVEMENTS ========================== */
  function openAchievements() {
    var have = W.state.achievements;
    var body = '<div class="row row--between" style="margin-bottom:8px">' +
      '<span class="eyebrow">' + have.length + ' of ' + Cos.achievements.length + ' unlocked</span>' +
      '<span class="chip chip--gem mono">' + W.gem(W.state.economy.diamonds.toLocaleString(), false) + '</span></div>' +
      Cos.achievements.map(function (a) {
        var done = have.indexOf(a.id) !== -1;
        return '<div class="ach-row ' + (done ? 'is-done' : '') + '">' +
          '<div class="ach-row__i">' + (done ? I.check : I.lock) + '</div>' +
          '<div class="ach-row__t grow"><b>' + a.name + '</b><span>' + a.desc + '</span></div>' +
          '<div class="ach-row__r"><span class="chip ' + (done ? 'chip--gem' : '') + ' mono" ' +
            (done ? '' : 'style="background:var(--line-soft);color:var(--faint)"') + '>+' + a.reward + ' 💎</span></div>' +
        '</div>';
      }).join('');

    modal({ title: 'Achievements', icon: I.trophy, body: body, actions: [{ label: 'Close', cls: 'btn--ghost', close: true }] });
  }

  /* ============================= ACCOUNTS =========================== */
  function signedIn() { return !!(global.Cloud && global.Cloud.signedIn); }
  function appOpen() { return document.getElementById('app').classList.contains('is-open'); }
  var EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

  var SYNC_LABEL = { synced: 'Saved to your account', syncing: 'Saving…',
                     offline: 'Offline, will sync when you’re back', off: 'Signed in' };

  function acctBlock() {
    if (!signedIn()) return '';
    var C = global.Cloud;
    return '<div class="menu__acct"><span class="sync-dot sync-dot--' + C.status + '" data-sync-dot></span>' +
      '<div><b>' + W.escapeHtml(C.user.email || 'Signed in') + '</b>' +
      '<span data-sync-label>' + SYNC_LABEL[C.status] + '</span></div></div>';
  }

  /* every sync dot on screen follows the account's save status */
  function paintSync(status) {
    W.$$('[data-sync-dot]').forEach(function (d) { d.className = 'sync-dot sync-dot--' + status; });
    W.$$('[data-sync-label]').forEach(function (l) { l.textContent = SYNC_LABEL[status] || ''; });
  }
  if (global.Cloud) global.Cloud.onChange(paintSync);

  function signOut() {
    global.Cloud.signOut().then(function () {
      W.toast('Signed out', 'You’re back on the guest profile for this device', I.logout);
    });
  }

  function authMsg(root, kind, title, text) {
    var slot = W.$('#au-msg', root);
    if (!slot) return;
    slot.innerHTML = '<div class="feedback feedback--' + kind + '" style="margin:0 0 14px">' +
      (kind === 'right' ? I.check : I.info) +
      '<div><b>' + W.escapeHtml(title) + '</b>' + (text ? '<p>' + W.escapeHtml(text) + '</p>' : '') +
      '</div></div>';
  }

  /* `then` runs once the account is live and Cloud has finished reconciling,
     so a caller can pick up whatever it was doing. Joining a class uses it:
     signing in is a step on the way, not a dead end. */
  function openAuth(mode, then) {
    var C = global.Cloud;
    if (!C || !C.available) {
      W.toast('Accounts aren’t working right now', 'Sign-in didn’t load. Check your internet and refresh the page.', I.info, 4600);
      return;
    }
    if (C.signedIn) { W.toast('Already signed in', C.user.email || '', I.check); return; }

    var signup = mode === 'signup';
    var p = W.state.profile;
    var label = signup ? 'Create account' : 'Sign in';
    var busy = false;

    function perk(t) { return '<div>' + I.check + '<span>' + t + '</span></div>'; }

    var body =
      (signup
        ? '<div class="auth-perks">' +
            perk('Your progress saves to your account, so you can pick up on any device') +
            perk('Join a class with the class code') +
            perk('Your scores get sent to your teacher automatically') +
          '</div>' +
          '<div class="field"><label class="field__label" for="au-name">Your name</label>' +
            '<input class="input" id="au-name" maxlength="40" autocomplete="name" placeholder="First and last name" ' +
            'value="' + W.escapeHtml(p.displayName === 'Explorer' ? '' : p.displayName) + '">' +
            '<div class="field__hint">Teachers see this next to your scores.</div></div>'
        : '') +
      '<div class="field"><label class="field__label" for="au-email">Email</label>' +
        '<input class="input" id="au-email" type="email" autocomplete="email" spellcheck="false" ' +
        'placeholder="you@example.com"></div>' +
      '<div class="field"><label class="field__label" for="au-pass">Password</label>' +
        '<input class="input" id="au-pass" type="password" autocomplete="' +
        (signup ? 'new-password" placeholder="At least 6 characters"' : 'current-password"') + '></div>' +
      (signup
        ? '<div class="field"><label class="field__label">I’m a</label><div class="seg" id="au-role">' +
            '<button data-v="student" class="' + (W.state.role !== 'teacher' ? 'is-active' : '') + '">Student</button>' +
            '<button data-v="teacher" class="' + (W.state.role === 'teacher' ? 'is-active' : '') + '">Teacher</button>' +
          '</div></div>'
        : '') +
      '<div id="au-msg"></div>' +
      '<div class="auth-switch">' +
        (signup
          ? 'Already have an account? <button data-switch="signin">Sign in</button>'
          : 'New here? <button data-switch="signup">Create an account</button> · ' +
            '<button data-forgot>Forgot password?</button>') +
      '</div>';

    var dlg = modal({
      title: signup ? 'Create your account' : 'Sign in', icon: I.user, body: body,
      actions: [{ label: label, cls: 'btn--accent', onClick: function (root) { submit(root); return false; } }],
      onMount: function (root, close) {
        wireSeg(root);
        W.$$('[data-switch]', root).forEach(function (b) {
          b.addEventListener('click', function () { close(); openAuth(b.dataset.switch); });
        });
        var fg = W.$('[data-forgot]', root);
        if (fg) fg.addEventListener('click', function () { forgot(root); });
        W.$$('input', root).forEach(function (inp) {
          inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(root); });
        });
        setTimeout(function () {
          var f = W.$(signup ? '#au-name' : '#au-email', root);
          if (f) f.focus();
        }, 60);
      },
      onClose: function () {
        /* backing out of sign-in on a first visit still needs a role */
        setTimeout(function () { if (appOpen() && !W.state.roleChosen && !signedIn()) askRole(); }, 0);
      }
    });

    function setBusy(root, on, text) {
      busy = on;
      var b = root.querySelector('.modal__foot .btn--accent');
      if (b) { b.disabled = on; b.textContent = text; }
    }

    function done(msg) {
      dlg.close();
      W.toast(msg, '', I.check);
      if (!appOpen()) showApp('portal');
      if (then) whenReady(then);
    }

    /* Signing in resolves before Cloud has compared this device against the
       account, and nothing server-side works until it has. Wait for that
       rather than firing into a client that is not ready yet. */
    function whenReady(fn) {
      if (C.ready) return fn();
      var tries = 0;
      var t = setInterval(function () {
        if (C.ready) { clearInterval(t); fn(); }
        else if (++tries > 50) { clearInterval(t); fn(); }
      }, 200);
    }

    function submit(root) {
      if (busy) return;
      var email = W.$('#au-email', root).value.trim();
      var pass = W.$('#au-pass', root).value;
      if (!EMAIL_RE.test(email)) return authMsg(root, 'wrong', 'Check your email address');
      if (pass.length < 6) return authMsg(root, 'wrong', 'Password too short', 'Use at least 6 characters.');

      if (!signup) {
        setBusy(root, true, 'Signing in…');
        C.signIn(email, pass).then(function () { done('Signed in as ' + email); }, function (e) {
          setBusy(root, false, label);
          authMsg(root, 'wrong', 'Couldn’t sign in', C.friendly(e));
        });
        return;
      }

      var name = W.$('#au-name', root).value.trim();
      if (!name) return authMsg(root, 'wrong', 'Add your name', 'Teachers see it next to your scores.');
      var roleBtn = W.$('#au-role .is-active', root);
      var role = roleBtn && roleBtn.dataset.v === 'teacher' ? 'teacher' : 'student';
      /* Picking Teacher here is the answer to the role question, so record it
         on this device too. Without this a teacher lands in student mode with
         the question already counted as asked, and never gets it again. */
      W.state.role = role;
      W.state.roleChosen = true;
      W.saveNow();
      refreshTabs();
      setBusy(root, true, 'Creating account…');
      C.signUp(email, pass, name, role).then(function (res) {
        if (!res.needsConfirm) return done('Account created. You’re signed in as ' + email);
        /* the project asks for email confirmation before the first sign-in */
        W.$('.modal__body', root).innerHTML =
          '<div class="t-center" style="padding:14px 6px">' +
            '<div class="levelup__ring" style="margin:0 auto 14px;background:linear-gradient(135deg,var(--success),#34D399)">' +
              I.check + '</div>' +
            '<h3 style="font-size:19px">Check your inbox</h3>' +
            '<p class="t-muted" style="margin-top:8px">We sent a confirmation link to <b>' + W.escapeHtml(email) +
              '</b>. Open it on this device and you’ll be signed in.</p>' +
          '</div>';
        var foot = root.querySelector('.modal__foot');
        if (foot) {
          foot.innerHTML = '<div class="grow"></div><button class="btn btn--primary">Done</button>';
          foot.querySelector('button').addEventListener('click', dlg.close);
        }
      }, function (e) {
        setBusy(root, false, label);
        authMsg(root, 'wrong', 'Couldn’t create your account', C.friendly(e));
      });
    }

    function forgot(root) {
      var email = W.$('#au-email', root).value.trim();
      if (!EMAIL_RE.test(email)) return authMsg(root, 'wrong', 'Type your email first', 'Then press Forgot password again.');
      C.resetPassword(email).then(function () {
        authMsg(root, 'right', 'Check your inbox',
          'If there’s an account for ' + email + ', we’ve sent it a link to set a new password.');
      }, function (e) { authMsg(root, 'wrong', 'Couldn’t send the link', C.friendly(e)); });
    }
  }

  /* Arrived from a password-reset email. */
  function openNewPassword() {
    var C = global.Cloud;
    modal({
      title: 'Set a new password', icon: I.key,
      body: '<div class="field"><label class="field__label" for="np-pass">New password</label>' +
        '<input class="input" id="np-pass" type="password" autocomplete="new-password" ' +
        'placeholder="At least 6 characters"></div><div id="au-msg"></div>',
      actions: [{ label: 'Save password', cls: 'btn--accent', onClick: function (root, close) {
        var v = W.$('#np-pass', root).value;
        if (v.length < 6) { authMsg(root, 'wrong', 'Password too short', 'Use at least 6 characters.'); return false; }
        C.updatePassword(v).then(function () { close(); W.toast('Password updated', '', I.check); },
          function (e) { authMsg(root, 'wrong', 'Couldn’t save it', C.friendly(e)); });
        return false;
      } }]
    });
  }

  function refreshLanding() {
    var s = W.state;
    var cont = document.getElementById('nav-continue');
    if (cont) {
      var resumable = s.stats.answered > 0 || s.economy.level > 1;
      cont.classList.toggle('hidden', !resumable);
      cont.textContent = resumable ? 'Continue · Lv ' + s.economy.level : 'Continue';
    }
    var si = document.getElementById('nav-signin');
    if (si) si.textContent = signedIn() ? (s.profile.displayName || 'My account') : 'Sign in';
  }

  /* Someone signed in or out, or the account's copy replaced this one:
     redraw everything that reads the save. */
  function afterAccountChange() {
    closeMenu();
    refreshLanding();
    refreshTabs();
    refreshHud();
    if (global.Teacher && global.Teacher.forget) global.Teacher.forget();
    if (global.Classroom && global.Classroom.forget) global.Classroom.forget();
    if (appOpen()) {
      go(currentView);
      if (!W.state.roleChosen) askRole();
    }
  }

  /* ============================ NAVIGATION ========================== */
  var VIEWS = ['portal', 'classroom', 'teacher', 'learn', 'test', 'quiz', 'cards'];

  /* The switcher shows Classroom to students and Teacher to teachers, so
     teacher mode is a place you can leave and come back to rather than a
     one-way trip out of the menu. */
  /* Teachers get their class and nothing else. XP, diamonds and streaks are
     for the people being taught; a teacher previewing an assignment goes
     through Classwork, which opens the mode in preview and comes back. */
  var TAB_DEFS = [
    { view: 'portal',    icon: 'grid',   label: 'Home',          role: 'student' },
    { view: 'classroom', icon: 'users',  label: 'Classroom',     role: 'student' },
    { view: 'teacher',   icon: 'users',  label: 'My class',      role: 'teacher' },
    { view: 'learn',     icon: 'book',   label: 'Learn',         role: 'student' },
    { view: 'test',      icon: 'clip',   label: 'Practice test', role: 'student' },
    { view: 'quiz',      icon: 'target', label: 'Class quiz',    role: 'student' },
    { view: 'cards',     icon: 'cards',  label: 'Flashcards',    role: 'student' }
  ];

  function refreshTabs() {
    var bar = document.getElementById('mode-tabs');
    if (!bar) return;
    var role = W.state.role === 'teacher' ? 'teacher' : 'student';
    var thumb = document.getElementById('tabs-thumb');

    W.$$('.tab', bar).forEach(function (t) { t.remove(); });
    var n = 0;
    TAB_DEFS.forEach(function (d) {
      if (d.role && d.role !== role) return;
      var b = W.el('button', 'tab' + (d.view === currentView ? ' is-active' : ''));
      b.dataset.view = d.view;
      /* The label is display:none from 1080px down and gone from the
         accessibility tree with it, so the button carries its own name. */
      b.title = d.label;
      b.setAttribute('aria-label', d.label);
      b.innerHTML = I[d.icon] + '<span>' + d.label + '</span>';
      b.addEventListener('click', function () { go(d.view); });
      bar.appendChild(b);
      n += 1;
    });
    /* A switcher with one thing in it is not a switcher, it is a button
       that does nothing. Teachers have only their class, so they get no
       bar at all and the brand carries them home. */
    bar.classList.toggle('hidden', n < 2);
    if (thumb) bar.insertBefore(thumb, bar.firstChild);
    placeTabs();
    positionThumb(false);
  }

  /* ---------------------------------------------------------------
     Below the phone breakpoint the switcher is a bottom bar instead of
     part of the top bar: six icon tabs, the brand, the HUD and the avatar
     do not fit in 320px, and the strip was the thing forcing every view to
     scroll sideways. The element moves rather than being rebuilt, so the
     tabs keep their handlers and the pill keeps its place.
  ---------------------------------------------------------------- */
  var phone = global.matchMedia ? global.matchMedia('(max-width: 560px)') : null;

  function placeTabs() {
    var bar = document.getElementById('mode-tabs');
    var top = document.querySelector('.topbar');
    var bottom = document.getElementById('modebar');
    var host = (phone && phone.matches) ? bottom : top;
    if (!bar || !host || bar.parentNode === host) return;
    /* back into the top bar it goes after the brand, ahead of the spacer
       that pushes the HUD right */
    if (host === top) host.insertBefore(bar, top.querySelector('.grow'));
    else host.appendChild(bar);
    positionThumb(false);
  }

  if (phone) {
    if (phone.addEventListener) phone.addEventListener('change', placeTabs);
    else if (phone.addListener) phone.addListener(placeTabs);
  }

  /* Slide the pill under whichever tab is active. Measured rather than
     hard-coded, so it stays correct when labels collapse on narrow screens.

     Booting a mode can reflow the top bar (map pins, HUD chips), which
     occasionally landed the transform before the final layout and left the
     pill a tab behind. So the position is re-asserted after layout settles
     and again whenever the bar's geometry actually changes. */
  function positionThumb(animate) {
    var bar = document.getElementById('mode-tabs');
    var thumb = document.getElementById('tabs-thumb');
    if (!bar || !thumb) return;
    var active = bar.querySelector('.tab.is-active');
    if (!active || !active.offsetWidth) return;

    var x = active.offsetLeft - bar.clientLeft;
    var w = active.offsetWidth;
    if (animate === false) thumb.style.transition = 'none';
    thumb.style.width = w + 'px';
    thumb.style.transform = 'translateX(' + x + 'px)';

    /* offsetLeft is unaffected by scrolling and the pill is inside the
       scroller, so the two stay together — but the active tab can still sit
       off the edge on a squeezed strip. Bring it back into view. */
    if (bar.scrollWidth > bar.clientWidth) {
      var into = x - (bar.clientWidth - w) / 2;
      if (bar.scrollTo) bar.scrollTo({ left: into, behavior: animate === false ? 'auto' : 'smooth' });
      else bar.scrollLeft = into;
    }
    if (animate === false) {
      void thumb.offsetWidth;          /* flush, then hand control back to CSS */
      thumb.style.transition = '';
    }
  }

  /* Re-measure once the browser has finished laying the frame out. */
  function settleThumb() {
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { positionThumb(); });
    });
  }

  var thumbRaf = null;
  function repositionSoon() {
    cancelAnimationFrame(thumbRaf);
    thumbRaf = requestAnimationFrame(function () { positionThumb(false); });
  }
  window.addEventListener('resize', repositionSoon);

  /* Watch the bar itself: any change in tab geometry (fonts arriving, labels
     collapsing, a mode reflowing the header) re-seats the pill. */
  function watchTabs() {
    var bar = document.getElementById('mode-tabs');
    if (!bar || typeof ResizeObserver === 'undefined') return;
    var ro = new ResizeObserver(repositionSoon);
    ro.observe(bar);
    W.$$('.tab', bar).forEach(function (t) { ro.observe(t); });
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { positionThumb(false); });
    }
  }

  function go(view) {
    /* The tab strip already hides the wrong one, but guard the route too so
       a student cannot reach the teacher's class by any other path. */
    var isTeacher = W.state.role === 'teacher';
    if (view === 'teacher' && !isTeacher) view = 'classroom';
    if (view === 'classroom' && isTeacher) view = 'teacher';
    if (isTeacher && !previewing && ['portal', 'learn', 'test', 'quiz', 'cards'].indexOf(view) !== -1) {
      view = 'teacher';
    }
    /* heading back to the class by any route ends a preview */
    if (view === 'teacher' && previewing) {
      previewing = false;
      var bar = document.getElementById('preview-bar');
      if (bar) bar.classList.add('hidden');
      document.body.classList.remove('is-previewing');
    }

    currentView = view;
    VIEWS.forEach(function (v) {
      var el = document.getElementById('view-' + v);
      if (el) el.classList.toggle('hidden', v !== view);
      var tab = document.querySelector('.tab[data-view="' + v + '"]');
      if (tab) tab.classList.toggle('is-active', v === view);
    });
    document.body.className = document.body.className
      .replace(/\bview-\w+\b/g, '').trim() + ' view-' + view;

    /* move the indicator before booting the mode: a slow or failing mode
       start should never leave the switcher pointing at the wrong tab */
    positionThumb();

    if (view === 'portal') global.Portal.render();
    if (view === 'teacher') global.Teacher.render();
    if (view === 'classroom') global.Classroom.render();
    if (view === 'learn') global.LearnMode.start();
    if (view === 'test') global.TestMode.start();
    if (view === 'quiz') global.QuizMode.start();
    if (view === 'cards') global.CardsMode.start();
    settleThumb();                     /* correct for any reflow the mode caused */
    global.GeoMap.invalidate();
    refreshHud();
  }

  /* Asked once, the first time someone opens the app. Students never see
     teacher mode after this, and teachers land straight in their class. */
  function askRole(then) {
    if (document.querySelector('.role-pick')) return;   /* already on screen */
    modal({
      title: 'Who’s using LearnGeo?',
      icon: I.users,
      dismissible: false,
      body: '<p class="t-muted" style="margin-bottom:16px">This just decides which screens you get. ' +
              'You can change it later from the For teachers page.</p>' +
            '<div class="role-pick">' +
              '<button class="role-opt" data-role="student">' +
                '<span class="role-opt__i">' + I.book + '</span>' +
                '<b>I’m a student</b>' +
                '<span>Study and do the assignments your teacher gives you.</span>' +
              '</button>' +
              '<button class="role-opt" data-role="teacher">' +
                '<span class="role-opt__i">' + I.users + '</span>' +
                '<b>I’m a teacher</b>' +
                '<span>Give your class assignments, get their results back and see how everyone did.</span>' +
              '</button>' +
            '</div>' +
            (global.Cloud && global.Cloud.available && !signedIn()
              ? '<div class="auth-switch">Already have an account? <button data-signin>Sign in</button></div>'
              : ''),
      onMount: function (root, close) {
        var si = W.$('[data-signin]', root);
        if (si) si.addEventListener('click', function () { close(); openAuth('signin'); });
        W.$$('[data-role]', root).forEach(function (b) {
          b.addEventListener('click', function () {
            W.state.role = b.dataset.role;
            W.state.roleChosen = true;
            W.saveNow();
            close();
            refreshTabs();
            if (b.dataset.role === 'teacher') global.Teacher.becomeTeacher();
            else if (then) then();
          });
        });
      }
    });
  }

  function showApp(view) {
    document.getElementById('landing').classList.add('hidden');
    document.getElementById('app').classList.add('is-open');
    document.body.classList.remove('no-scroll');
    W.touchDaily();
    W.saveNow();
    refreshTabs();
    go(view || currentView || 'portal');
    if (!W.state.roleChosen) askRole();
  }

  function showLanding() {
    closeMenu();
    document.getElementById('app').classList.remove('is-open');
    document.getElementById('landing').classList.remove('hidden');
    /* only the view classes. no-scroll belongs to the modal stack and
       is-previewing to the preview bar, and both put them back themselves. */
    VIEWS.forEach(function (v) { document.body.classList.remove('view-' + v); });
    window.scrollTo(0, 0);
    if (global.Demo) global.Demo.restart();
  }

  global.UI = {
    modal: modal, wireSeg: wireSeg, wireCheck: wireCheck, wireTabs: wireTabs,
    refreshHud: refreshHud, toggleMenu: toggleMenu, closeMenu: closeMenu,
    openSettings: openSettings, openCustomization: openCustomization, openAchievements: openAchievements,
    profileCard: profileCard, runEffect: runEffect,
    go: go, showApp: showApp, showLanding: showLanding,
    positionThumb: positionThumb, watchTabs: watchTabs, refreshTabs: refreshTabs,
    askRole: askRole, startPreview: startPreview, endPreview: endPreview,
    openAuth: openAuth, openNewPassword: openNewPassword,
    afterAccountChange: afterAccountChange, refreshLanding: refreshLanding,
    get previewing() { return previewing; }
  };
})(window);
