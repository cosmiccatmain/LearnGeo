/* ------------------------------------------------------------------
   LearnGeo — app shell: HUD, profile menu, modals,
   settings, customisation and the diamond shop.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons, Cos = global.Cosmetics;

  var currentView = 'learn';

  /* ============================== MODALS ============================ */
  var openModals = [];

  function modal(opts) {
    var ov = W.el('div', 'overlay');
    var m = W.el('div', 'modal' + (opts.wide ? ' modal--wide' : ''));

    var headHtml = opts.title
      ? '<div class="modal__head">' +
          (opts.icon ? '<span style="color:var(--muted)">' + opts.icon + '</span>' : '') +
          '<h3>' + W.escapeHtml(opts.title) + '</h3>' +
          '<button class="icon-btn" data-close>' + I.close + '</button>' +
        '</div>'
      : '';

    var actionsHtml = (opts.actions || []).map(function (a, i) {
      return '<button class="btn ' + (a.cls || 'btn--ghost') + '" data-act="' + i + '">' + a.label + '</button>';
    }).join('');

    m.innerHTML = headHtml +
      (opts.tabs ? opts.tabs : '') +
      '<div class="modal__body">' + opts.body + '</div>' +
      (actionsHtml ? '<div class="modal__foot">' + (opts.footLeft || '<div class="grow"></div>') + actionsHtml + '</div>' : '');

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
    set('hud-gems', s.economy.diamonds.toLocaleString());
    set('hud-level', 'Lv ' + s.economy.level);
    set('hud-streak', String(s.streak.current));

    var fireEl = document.getElementById('hud-fire');
    if (fireEl) fireEl.classList.toggle('hidden', s.streak.current < 2);

    var av = document.getElementById('avatar-slot');
    if (av) av.innerHTML = W.avatarHtml(s.profile);

    var lp = W.levelProgress();
    var bar = document.getElementById('hud-xpbar');
    if (bar) bar.style.width = Math.min(100, (lp.have / lp.need) * 100) + '%';

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
          '<div class="menu__name">' + W.escapeHtml(s.profile.displayName || 'Explorer') + '</div>' +
          '<div class="menu__meta">Lv ' + s.economy.level + ' · ' + lp.have + '/' + lp.need + ' XP · ' +
            s.economy.diamonds.toLocaleString() + ' 💎</div>' +
        '</div>' +
      '</div>' +
      item('settings', I.gear, 'Settings') +
      item('custom', I.palette, 'Customization') +
      item('achievements', I.trophy, 'Achievements') +
      item('teacher', I.users, 'Teacher mode') +
      '<div class="menu__sep"></div>' +
      '<div class="menu__note">' + I.shield +
        '<span>Saved in this browser<br><i>' + s.stats.answered.toLocaleString() +
        ' answers · no account needed</i></span></div>';

    document.querySelector('.topbar').appendChild(menuEl);
    setTimeout(function () { document.addEventListener('mousedown', outside); }, 0);

    W.$$('[data-go]', menuEl).forEach(function (b) {
      b.addEventListener('click', function () {
        var go = b.dataset.go;
        closeMenu();
        if (go === 'settings') openSettings();
        else if (go === 'custom') openCustomization();
        else if (go === 'achievements') openAchievements();
        else if (go === 'teacher') global.Teacher.becomeTeacher();
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
    var providers = global.GeoMap.providers;

    var tabs = '<div class="vtabs" id="set-tabs">' +
      '<button class="vtab is-active" data-t="general">' + I.gear + ' General</button>' +
      '<button class="vtab" data-t="map">' + I.pin + ' Map &amp; API key</button>' +
      '<button class="vtab" data-t="data">' + I.layers + ' Study data</button>' +
      '</div>';

    var general =
      '<div data-panel="general">' +
        row('Sound effects', 'Short synthesised tones on every answer.', sw('set-sound', s.sound)) +
        row('Reward animations', 'Confetti bursts, floating XP and profile effects.', sw('set-effects', s.effects)) +
        row('Show capital pins in Learn', 'Drop the pin as soon as a question is answered.', sw('set-pins', s.showCapitalPins)) +
        '<div class="divider"></div>' +
        '<div class="field"><label class="field__label">Daily goal</label>' +
          '<div class="seg" id="set-goal">' +
            ['10', '20', '40', '75'].map(function (n) {
              return '<button data-v="' + n + '" class="' + (String(W.state.daily.goal) === n ? 'is-active' : '') + '">' + n + '</button>';
            }).join('') +
          '</div><div class="field__hint">Questions per day. Hitting it extends your day streak.</div></div>' +
      '</div>';

    var mapPanel =
      '<div data-panel="map" class="hidden">' +
        '<div class="feedback" style="background:var(--accent-soft);margin:0 0 18px">' + I.info +
          '<div><b style="color:var(--accent-ink)">About the OpenStreetMap key</b>' +
          '<p>OpenStreetMap’s own tile service is free and needs <b>no API key</b> — that is the default, ' +
          'and LearnGeo works fully without one. Paste a key below to route the same OpenStreetMap data through ' +
          'a commercial tile host (CARTO, MapTiler, Thunderforest or Stadia) for higher rate limits and ' +
          'unwatermarked tiles. Choosing a keyed provider without a key falls back to plain OpenStreetMap.</p></div></div>' +

        '<div class="field"><label class="field__label">Tile provider</label>' +
          '<select class="input" id="set-provider">' +
            Object.keys(providers).map(function (k) {
              return '<option value="' + k + '"' + (s.tileProvider === k ? ' selected' : '') + '>' +
                providers[k].label + '</option>';
            }).join('') +
          '</select></div>' +

        '<div class="field"><label class="field__label">API key</label>' +
          '<input class="input mono" id="set-key" type="text" spellcheck="false" placeholder="paste key — leave blank for keyless OSM" ' +
            'value="' + W.escapeHtml(s.apiKey) + '">' +
          '<div class="field__hint">Stored only in this browser’s local storage. If a key-based provider is ' +
          'selected without a key, LearnGeo falls back to the keyless basemap.</div></div>' +

        '<div class="field" id="set-label-warn"></div>' +

        '<div class="field"><label class="field__label">Attribution</label>' +
          '<div class="t-sm t-muted">Map data © OpenStreetMap contributors, available under the Open Database License.</div></div>' +
      '</div>';

    var m = W.state.mastery;
    var seen = Object.keys(m).length;
    var strong = W.masteredCount();
    var st = W.state.stats;
    var acc = st.answered ? Math.round((st.correct / st.answered) * 100) : 0;

    var dataPanel =
      '<div data-panel="data" class="hidden">' +
        '<div class="stats" style="margin:0 0 20px;padding:0;grid-template-columns:repeat(4,1fr);border-top:none">' +
          st4('Answered', st.answered) + st4('Accuracy', acc + '%') +
          st4('Tests', st.tests) + st4('Cards', st.cards) +
        '</div>' +
        row('Places encountered', seen + ' of ' + global.GeoData.counts.total + ' in the dataset', '') +
        row('Mastered', strong + ' sitting at box 4 or 5', '') +
        row('Best answer streak', W.state.streak.best + ' in a row', '') +
        '<div class="divider"></div>' +
        '<div class="setting-row"><div class="setting-row__t">' +
          '<b>Reset all progress</b><span>Wipes XP, diamonds, mastery, purchases and achievements. Cannot be undone.</span>' +
          '</div><button class="btn btn--ghost btn--sm" id="set-reset" style="color:var(--danger);border-color:#F3C6C6">Reset</button></div>' +
      '</div>';

    modal({
      title: 'Settings', icon: I.gear, wide: true, tabs: tabs,
      body: general + mapPanel + dataPanel,
      actions: [{ label: 'Done', cls: 'btn--primary', close: true, onClick: saveSettings }],
      onMount: function (root, close) {
        wireSeg(root);
        wireTabs(root, '#set-tabs');
        labelWarning(root);
        W.$('#set-provider', root).addEventListener('change', function () { labelWarning(root); });
        W.$('#set-key', root).addEventListener('input', function () { labelWarning(root); });
        W.$$('.switch', root).forEach(function (sw2) {
          sw2.addEventListener('click', function () { sw2.classList.toggle('is-on'); });
        });
        W.$('#set-reset', root).addEventListener('click', function () {
          modal({
            title: 'Reset everything?', icon: I.info,
            body: '<p class="t-muted">This clears every diamond, level, purchase and mastery record on this device. ' +
              'There is no undo.</p>',
            actions: [
              { label: 'Cancel', cls: 'btn--ghost', close: true },
              { label: 'Reset everything', cls: 'btn--primary', close: true, onClick: function () {
                  W.reset(); close(); refreshHud(); global.UI.showLanding();
                  W.toast('Progress reset', 'Starting from a clean slate', I.refresh);
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

      var prevProvider = s2.tileProvider, prevKey = s2.apiKey;
      s2.tileProvider = W.$('#set-provider', root).value;
      s2.apiKey = W.$('#set-key', root).value.trim();
      W.saveNow();

      if (prevProvider !== s2.tileProvider || prevKey !== s2.apiKey) {
        global.GeoMap.applyProvider();
        var p = global.GeoMap.providers[s2.tileProvider];
        if (p && p.needsKey && !s2.apiKey) {
          W.toast('No key supplied', 'Falling back to the keyless OpenStreetMap basemap', I.info, 4200);
        } else {
          W.toast('Basemap updated', p ? p.label : '', I.pin);
        }
      }
      refreshHud();
    }

    function labelWarning(root) {
      var slot = W.$('#set-label-warn', root);
      if (!slot) return;
      var chosen = W.$('#set-provider', root).value;
      var pv = global.GeoMap.providers[chosen];
      var keyless = pv && pv.needsKey && !W.$('#set-key', root).value.trim();
      slot.innerHTML = keyless
        ? '<div class="feedback feedback--wrong" style="margin:0">' + I.info +
          '<div><b>No key supplied</b><p>' + W.escapeHtml(pv.label) + ' needs a key. Until you paste one, ' +
          'LearnGeo keeps using the free OpenStreetMap basemap.</p></div></div>'
        : '';
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
          '<div class="t-sm t-muted t-center" style="margin-top:10px">Earn diamonds by answering questions, ' +
            'finishing tests and unlocking achievements.</div>' +
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
        '<textarea class="input" id="cz-about" maxlength="190" placeholder="A short bio — 190 characters.">' +
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

  function wireShop(root) {
    W.$$('.shop-item', root).forEach(function (btn) {
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
            if (!W.spend(price)) return;
            W.state.owned[kind] = (W.state.owned[kind] || []).concat([id]);
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
      wireShop(root);
    }
    drawPreview(root);
    refreshHud();
    var bal = W.$('#cz-balance', root);
    if (bal) bal.textContent = W.state.economy.diamonds.toLocaleString() + ' 💎';
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

  function profileCard(live) {
    var p = W.state.profile, s = W.state;
    var banner = Cos.find(Cos.banners, p.banner);
    var plate = Cos.find(Cos.nameplates, p.nameplate);
    var theme = Cos.find(Cos.themes, p.theme);
    var name = (live && live.displayName) || p.displayName || 'Explorer';
    var pron = (live && live.pronouns) || p.pronouns;
    var about = (live && live.about !== undefined) ? live.about : p.about;

    return '<div class="profile-card" style="border-color:' + theme.c1 + '33">' +
      '<div class="profile-card__banner" style="background:' + banner.css + '"></div>' +
      '<div class="profile-fx" data-effect="' + p.effect + '"></div>' +
      '<div class="profile-card__body">' +
        '<div class="profile-card__avatar">' + W.avatarHtml(p) + '</div>' +
        '<div class="profile-card__name" style="background:' + plate.css + ';color:' + plate.text + '">' +
          W.escapeHtml(name) + '</div>' +
        '<div class="profile-card__tag">Level ' + s.economy.level + ' · ' + s.economy.diamonds.toLocaleString() + ' 💎</div>' +
        (pron ? '<div class="profile-card__pronouns">' + W.escapeHtml(pron) + '</div>' : '') +
        (about ? '<div class="profile-card__about">' + W.escapeHtml(about) + '</div>' : '') +
        '<div class="profile-card__stats">' +
          stat(s.stats.answered, 'answered') +
          stat(s.stats.answered ? Math.round(s.stats.correct / s.stats.answered * 100) + '%' : '—', 'accuracy') +
          stat(W.masteredCount(), 'mastered') +
        '</div>' +
      '</div></div>';

    function stat(v, l) {
      return '<div class="profile-card__stat" style="color:' + theme.c2 + '"><b>' + v + '</b><span>' + l + '</span></div>';
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

  /* ============================ NAVIGATION ========================== */
  var VIEWS = ['portal', 'classroom', 'teacher', 'learn', 'test', 'quiz', 'cards'];

  /* The switcher shows Classroom to students and Teacher to teachers, so
     teacher mode is a place you can leave and come back to rather than a
     one-way trip out of the menu. */
  var TAB_DEFS = [
    { view: 'portal',    icon: 'grid',   label: 'Home' },
    { view: 'classroom', icon: 'users',  label: 'Classroom', role: 'student' },
    { view: 'teacher',   icon: 'users',  label: 'Teacher',   role: 'teacher' },
    { view: 'learn',     icon: 'book',   label: 'Learn' },
    { view: 'test',      icon: 'clip',   label: 'Practice test' },
    { view: 'quiz',      icon: 'target', label: 'Class quiz' },
    { view: 'cards',     icon: 'cards',  label: 'Flashcards' }
  ];

  function refreshTabs() {
    var bar = document.getElementById('mode-tabs');
    if (!bar) return;
    var role = W.state.role === 'teacher' ? 'teacher' : 'student';
    var thumb = document.getElementById('tabs-thumb');

    W.$$('.tab', bar).forEach(function (t) { t.remove(); });
    TAB_DEFS.forEach(function (d) {
      if (d.role && d.role !== role) return;
      var b = W.el('button', 'tab' + (d.view === currentView ? ' is-active' : ''));
      b.dataset.view = d.view;
      b.innerHTML = I[d.icon] + '<span>' + d.label + '</span>';
      b.addEventListener('click', function () { go(d.view); });
      bar.appendChild(b);
    });
    if (thumb) bar.insertBefore(thumb, bar.firstChild);
    positionThumb(false);
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

  function showApp(view) {
    document.getElementById('landing').classList.add('hidden');
    document.getElementById('app').classList.add('is-open');
    document.body.classList.remove('no-scroll');
    W.touchDaily();
    W.saveNow();
    go(view || currentView || 'portal');
  }

  function showLanding() {
    closeMenu();
    document.getElementById('app').classList.remove('is-open');
    document.getElementById('landing').classList.remove('hidden');
    document.body.className = '';
    window.scrollTo(0, 0);
  }

  global.UI = {
    modal: modal, wireSeg: wireSeg, wireCheck: wireCheck, wireTabs: wireTabs,
    refreshHud: refreshHud, toggleMenu: toggleMenu, closeMenu: closeMenu,
    openSettings: openSettings, openCustomization: openCustomization, openAchievements: openAchievements,
    profileCard: profileCard, runEffect: runEffect,
    go: go, showApp: showApp, showLanding: showLanding,
    positionThumb: positionThumb, watchTabs: watchTabs, refreshTabs: refreshTabs
  };
})(window);
