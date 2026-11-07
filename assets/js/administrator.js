/* ------------------------------------------------------------------
   LearnGeo — the Administrator page.

   Accounts can be picked one at a time, or ticked and acted on
   together. A bulk action is still one existing server call per
   account, so each call keeps that command's permission check.
   Sidebar layout (deep blue, profile, section nav, Leave Admin) with
   server-backed command grants (0012). Owner
   alexjschendel@gmail.com has every command. Development hosts the
   Premium plans preview switch (mock / TEST only) and the referral
   3-day all-games trial TEST switch (LEA-49). Other admins
   default to read-only accounts/stats/log until the owner grants
   gems / ban / messages / etc.

   NOTHING HERE IS A PERMISSION CHECK. Every call goes through
   AdminOps to a security definer function that re-checks the session
   server side. The worst an edited copy of this file achieves is a
   nicer-looking way to be refused.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons;

  var OWNER_EMAIL = 'alexjschendel@gmail.com';
  var GRANTABLE = [
    { id: 'gems',      label: 'Gems',      hint: 'Give, take, set, empty, override diamonds' },
    { id: 'ban',       label: 'Bans',      hint: 'Ban or lift a ban' },
    { id: 'messages',  label: 'Messages',  hint: 'Send messages and read threads' },
    { id: 'staff',     label: 'Staff',     hint: 'Grant or remove the staff effect' },
    { id: 'allow',     label: 'Allowlist', hint: 'Add or remove admin access' },
    { id: 'moderate',  label: 'Moderate',  hint: 'Rename, wipe scores, reset, leave classes' },
    { id: 'classes',   label: 'Classes',   hint: 'List and mark admin classrooms' }
  ];

  var root = null;
  var rows = [];
  var picked = null;
  var stats = null;
  var banner = '';
  var section = 'overview';
  var access = { owner: false, email: '', commands: ['accounts', 'stats', 'log'] };
  var grants = [];
  var bans = {};

  /* Ticked rows, separate from the one account open in the detail
     panel (`picked`). Page size is a client slice of whatever
     ultra_find_accounts returned (that function caps the list at 60). */
  var ticked = {};
  var page = 0;
  var PAGE = 12;
  var FIND_CAP = 60;
  var BULK_LARGE = 10;
  var loadedQuery = '';
  var querySeen = false;
  var bulkBusy = false;
  var bulkGen = 0;

  var DEAD = {
    live: function () { return false; },
    minutesLeft: function () { return 0; },
    connect: no, disconnect: function () {},
    stats: no, find: no, recent: no, gems: no, staff: no, allowList: no, allow: no,
    message: no, thread: no, override: no, myAccess: no, grantsList: no, grantsSet: no,
    activity: no, ban: no, banned: no, rename: no, wipeScores: no, resetProgress: no,
    leaveClasses: no
  };
  function no() {
    return Promise.resolve({ ok: false, kind: 'error', message: 'admin-ops.js did not load.' });
  }
  function ops() { return global.AdminOps || DEAD; }
  function esc(s) { return W.escapeHtml(String(s == null ? '' : s)); }
  var CAP = 2000000000, MAX_STEP = 1000000000;
  var MAX_SAFE = 9007199254740991;
  var MSG_MAX = 500;
  var SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
  function num(n) {
    var v = Number(n) || 0;
    if (Math.abs(v) <= MAX_SAFE) return v.toLocaleString();
    var parts = v.toExponential(2).split('e');
    var exp = String(Math.abs(+parts[1])).replace(/[0-9]/g, function (d) { return SUP[+d]; });
    return parts[0] + ' × 10' + (+parts[1] < 0 ? '⁻' : '') + exp;
  }

  function can(cmd) {
    if (access.owner) return true;
    var list = access.commands || [];
    for (var i = 0; i < list.length; i++) if (list[i] === cmd) return true;
    return false;
  }

  function meProfile() {
    var u = global.Cloud && global.Cloud.user;
    var email = (u && u.email) || (access.email) || '';
    var name = (W.state && W.state.profile && W.state.profile.displayName) ||
               (email ? email.split('@')[0] : 'Admin');
    return { name: name, email: email };
  }

  /* ============================== open ============================= */
  function open() {
    if (!global.Admin || !global.Admin.can || !global.Admin.can('ultra')) {
      W.toast('UltraAdmin only', 'Open UltraAdmin first.', I.lock, 3600);
      return;
    }
    if (root) return;
    build();
    refresh();
  }

  function close() {
    if (!root) return;
    root.remove();
    root = null; rows = []; picked = null; stats = null; banner = '';
    section = 'overview'; grants = [];
    ticked = {}; page = 0; loadedQuery = ''; querySeen = false;
    bulkBusy = false; bulkGen++;
    document.body.classList.remove('no-scroll');
  }

  /* ============================== shell ============================ */
  function navItem(id, icon, label) {
    return '<button type="button" class="adminp__nav' + (section === id ? ' is-on' : '') +
      '" data-nav="' + id + '">' +
      '<span class="adminp__nav-ic">' + icon + '</span>' +
      '<span>' + esc(label) + '</span></button>';
  }

  function build() {
    var who = meProfile();
    root = W.el('div', 'adminp');
    root.innerHTML =
      '<aside class="adminp__side">' +
        '<div class="adminp__profile">' +
          '<div class="adminp__avatar" aria-hidden="true">' + (I.user || '') + '</div>' +
          '<div class="adminp__whoami">' +
            '<b id="ap-name">' + esc(who.name) + '</b>' +
            '<span id="ap-email">' + esc(who.email || 'signed in') + '</span>' +
          '</div>' +
        '</div>' +
        '<nav class="adminp__navlist" id="ap-nav">' +
          navItem('overview', I.home || I.grid, 'Overview') +
          navItem('accounts', I.users, 'Accounts') +
          navItem('gems', I.gem, 'Gems') +
          navItem('messages', I.message || I.inbox, 'Messages') +
          navItem('activity', I.list || I.chart, 'Activity') +
          navItem('logins', I.lock || I.list, 'Logins') +
          navItem('permissions', I.lock, 'Permissions') +
          navItem('commands', I.bolt, 'Commands') +
          navItem('development', I.flask || I.bolt, 'Development') +
        '</nav>' +
        '<div class="adminp__sidefoot">' +
          '<span class="adminp__pill" id="ap-session">checking…</span>' +
          '<button type="button" class="adminp__leave" id="ap-leave">' +
            (I.logout || '') + ' Leave Admin</button>' +
        '</div>' +
      '</aside>' +
      '<div class="adminp__main">' +
        '<div class="adminp__bar">' +
          '<div class="adminp__title">' + I.shield + '<b id="ap-heading">Administrator</b></div>' +
          '<div class="grow"></div>' +
          '<button class="btn btn--ghost btn--sm" id="ap-refresh">' + I.refresh + ' Refresh</button>' +
          '<button class="icon-btn" id="ap-close" title="Leave Admin">' + I.close + '</button>' +
        '</div>' +
        '<div class="adminp__scroll">' +
          '<div id="ap-banner"></div>' +
          '<div id="ap-panel"></div>' +
        '</div>' +
      '</div>';

    document.body.appendChild(root);
    document.body.classList.add('no-scroll');
    wire();
    renderPanel();
  }

  function wire() {
    W.$('#ap-close', root).addEventListener('click', close);
    W.$('#ap-leave', root).addEventListener('click', close);
    W.$('#ap-refresh', root).addEventListener('click', refresh);

    root.addEventListener('click', function (e) {
      /* A tick must not also open that account. The checkbox lives in
         the row, and the row is what picking listens for. */
      if (e.target.closest && e.target.closest('.adminp__check')) return;

      var nav = e.target.closest('[data-nav]');
      if (nav) {
        section = nav.getAttribute('data-nav');
        syncNav();
        renderPanel();
        return;
      }

      var pick = e.target.closest('[data-pick]');
      if (pick) return select(pick.dataset.pick);

      var act = e.target.closest('[data-do]');
      if (!act) return;
      var d = act.dataset;
      if (d.do === 'gems')  return gems(d.delta ? { delta: +d.delta } : { set: +d.set }, d.label || '');
      if (d.do === 'staff') return setStaff(d.on === '1');
      if (d.do === 'allow') return setAllow(d.on === '1');
      if (d.do === 'selfstaff') return selfStaff(d.on === '1');
      if (d.do === 'ban')      return setBan(d.on === '1');
      if (d.do === 'rename')   return renameAccount();
      if (d.do === 'wipescores')   return wipeScores();
      if (d.do === 'resetprog')    return resetProgress();
      if (d.do === 'leaveclasses') return leaveClasses();
      if (d.do === 'search')   return search();
      if (d.do === 'select-everyone') return selectEveryone();
      if (d.do === 'clear-selection') return clearSelection();
      if (d.do === 'page')     return turnPage(+d.delta);
      if (d.do === 'bulk')     return startBulk(d.kind);
      if (d.do === 'runcmd')   return runCmd();
      if (d.do === 'savegrants') return saveGrants(d.email);
      if (d.do === 'gemsonly') return saveGrants(d.email, ['gems']);
      if (d.do === 'cleargrants') return saveGrants(d.email, []);
      if (d.do === 'msg') {
        var box = W.$('#ap-msg-text', root);
        return sendMessage(box ? box.value : '', box);
      }
      if (d.do === 'subdev') return openSubscriptionDev();
      if (d.do === 'prempreview') return setPremiumPreview(d.on === '1');
      if (d.do === 'cookpreview') return previewCookingLoader();
      if (d.do === 'reftrial') return setReferralTrial(d.on === '1');
      if (d.do === 'refsim') return simulateReferralSignup();
      if (d.do === 'refcopy') return copyReferralLink();
      if (d.do === 'refreset') return resetReferralTrial();
    });

    root.addEventListener('keydown', function (e) {
      if (e.target && e.target.id === 'ap-q' && e.key === 'Enter') {
        e.preventDefault(); search();
      }
      if (e.target && e.target.id === 'ap-cmd' && e.key === 'Enter') {
        e.preventDefault(); runCmd();
      }
    });

    root.addEventListener('change', function (e) {
      var t = e.target;
      if (!t) return;
      if (t.id === 'ap-select-page') return togglePage(!!t.checked);
      var id = t.getAttribute && t.getAttribute('data-check');
      if (id) toggleOne(id, !!t.checked);
    });

    root.addEventListener('input', function (e) {
      if (e.target && e.target.id === 'ap-msg-text') {
        var c = W.$('#ap-msg-count', root);
        if (c) c.textContent = e.target.value.length + ' / ' + MSG_MAX;
      }
    });

    document.addEventListener('keydown', onKey);
  }

  function onKey(e) {
    if (!root) { document.removeEventListener('keydown', onKey); return; }
    if (e.key === 'Escape' && !document.querySelector('.overlay')) close();
  }

  function syncNav() {
    if (!root) return;
    var nodes = root.querySelectorAll('[data-nav]');
    for (var i = 0; i < nodes.length; i++) {
      var id = nodes[i].getAttribute('data-nav');
      var show = true;
      if (id === 'permissions') show = !!access.owner;
      if (id === 'gems' && !access.owner && !can('gems')) show = false;
      if (id === 'messages' && !access.owner && !can('messages')) show = false;
      nodes[i].hidden = !show;
      nodes[i].classList.toggle('is-on', show && section === id);
    }
    if (section === 'permissions' && !access.owner) {
      section = 'overview';
    }
    if (section === 'monitor') section = 'overview';
    if (section === 'gems' && !can('gems')) section = 'overview';
    if (section === 'messages' && !can('messages')) section = 'overview';
  }

  var TITLES = {
    overview: 'Overview',
    accounts: 'Accounts',
    gems: 'Gems',
    messages: 'Messages',
    activity: 'Activity',
    logins: 'Logins',
    permissions: 'Permissions',
    commands: 'Commands',
    development: 'Development'
  };

  function renderPanel() {
    if (!root) return;
    syncNav();
    var head = W.$('#ap-heading', root);
    if (head) head.textContent = TITLES[section] || 'Administrator';
    var host = W.$('#ap-panel', root);
    if (!host) return;

    if (section === 'overview') host.innerHTML = panelOverview();
    else if (section === 'accounts') host.innerHTML = panelAccounts();
    else if (section === 'gems') host.innerHTML = panelGems();
    else if (section === 'messages') host.innerHTML = panelMessages();
    else     if (section === 'activity') host.innerHTML = panelActivity();
    else if (section === 'logins') host.innerHTML = panelLogins();
    else if (section === 'permissions') host.innerHTML = panelPermissions();
    else if (section === 'commands') host.innerHTML = panelCommands();
    else if (section === 'development') host.innerHTML = panelDevelopment();
    else host.innerHTML = '';

    /* Fill dynamic bits after the shell is in the DOM. */
    if (section === 'overview') { renderStats(); renderStaff(); }
    if (section === 'accounts') {
      var qEl = W.$('#ap-q', root);
      if (qEl && querySeen) qEl.value = loadedQuery;
      renderRows();
      if (picked) renderPicked();
      else { var ps = W.$('#ap-picked-sec', root); if (ps) ps.hidden = true; }
    }
    if (section === 'gems' || section === 'messages') {
      renderPickedMini();
      if (section === 'messages' && picked) loadThread();
    }
    if (section === 'activity') {
      ops().recent(30).then(function (r) { guard(r, renderLog); });
    }
    if (section === 'logins') {
      loadLogins();
    }
    if (section === 'permissions') loadGrants();
  }

  function panelOverview() {
    var note = access.owner
      ? 'You are the owner account. Every administrator command is available, including the permissions panel and Development Premium preview.'
      : 'Your access is limited to what the owner has granted. Destructive gems, bans, and moderation stay off until granted.';
    return '<div class="adminp__grid" id="ap-stats"></div>' +
      '<section class="adminp__sec">' +
        '<h3>Your access</h3>' +
        '<p class="t-sm t-muted">' + esc(note) + '</p>' +
        '<div class="adminp__chips" id="ap-access-chips">' + accessChips() + '</div>' +
      '</section>' +
      '<section class="adminp__sec">' +
        '<h3>LearnGeo staff</h3>' +
        '<p class="t-sm t-muted">The staff profile effect is the one cosmetic with no price.</p>' +
        '<div id="ap-staff"></div>' +
      '</section>';
  }

  function accessChips() {
    var labels = {
      accounts: 'Accounts', stats: 'Stats', log: 'Activity log', gems: 'Gems',
      ban: 'Bans', messages: 'Messages', staff: 'Staff', allow: 'Allowlist',
      moderate: 'Moderate', classes: 'Classes',
      permissions: 'Permissions'
    };
    var cmds = access.owner
      ? Object.keys(labels)
      : (access.commands || []);
    var seen = {};
    return cmds.filter(function (c) {
      if (seen[c] || !labels[c]) return false;
      seen[c] = true; return true;
    }).map(function (c) {
      return '<span class="adminp__chip">' + esc(labels[c]) + '</span>';
    }).join('') || '<span class="t-sm t-muted">Read-only default</span>';
  }

  function panelAccounts() {
    return '<section class="adminp__sec">' +
      '<h3>Accounts</h3>' +
      '<p class="t-sm t-muted">Search a display name or an email. An empty box lists whoever was active most recently. ' +
        'Tick accounts to act on them together. Select all covers this page. ' +
        'Select everyone covers every account in this search, including other pages.</p>' +
      '<div class="adminp__search">' +
        '<input class="input" id="ap-q" type="search" placeholder="name or email" ' +
          'autocomplete="off" spellcheck="false">' +
        '<button class="btn btn--primary btn--sm" data-do="search">Search</button>' +
      '</div>' +
      '<div class="adminp__bulk" id="ap-bulk" data-page-size="' + PAGE + '">' +
        '<div class="adminp__bulkbar">' +
          '<span id="ap-sel-count" aria-live="polite">0 selected</span>' +
          '<button type="button" class="btn btn--ghost btn--sm" id="ap-select-everyone" data-do="select-everyone">Select everyone</button>' +
          '<button type="button" class="btn btn--ghost btn--sm" id="ap-clear-selection" data-do="clear-selection">Clear selection</button>' +
        '</div>' +
        '<p class="t-sm t-muted" id="ap-bulk-cap" hidden></p>' +
        '<div id="ap-bulk-acts" class="adminp__bulkacts" hidden></div>' +
      '</div>' +
      '<div id="ap-rows" class="adminp__rows"></div>' +
      '<div class="adminp__pager" id="ap-pager" hidden></div>' +
    '</section>' +
    '<section class="adminp__sec" id="ap-picked-sec" hidden>' +
      '<h3>Selected account</h3>' +
      '<div id="ap-picked"></div>' +
    '</section>';
  }

  function panelGems() {
    return '<section class="adminp__sec">' +
      '<h3>Gems</h3>' +
      '<p class="t-sm t-muted">Pick an account under Accounts first, then adjust diamonds here. ' +
        'Takes and empties need the gems grant.</p>' +
      '<div id="ap-picked-mini"></div>' +
      '<div class="adminp__search" style="margin-top:12px">' +
        '<input class="input mono" id="ap-cmd" type="text" placeholder="take 500" ' +
          'autocomplete="off" spellcheck="false">' +
        '<button class="btn btn--sm" data-do="runcmd">Run</button>' +
      '</div>' +
      '<pre class="adminp__out" id="ap-out">Ready. Type help for the list.</pre>' +
    '</section>';
  }

  function panelMessages() {
    return '<section class="adminp__sec">' +
      '<h3>Messages</h3>' +
      '<p class="t-sm t-muted">Select an account under Accounts, then write here. ' +
        'They see it on their screen within about 30 seconds if the app is open.</p>' +
      '<div id="ap-picked-mini"></div>' +
      '<div id="ap-msg-host"></div>' +
    '</section>';
  }

  function panelActivity() {
    return '<section class="adminp__sec">' +
      '<h3>Recent admin actions</h3>' +
      '<p class="t-sm t-muted">Everything any admin has done to anybody else. Written by the server.</p>' +
      '<div id="ap-log" class="adminp__rows"></div>' +
    '</section>';
  }

  function panelLogins() {
    return '<section class="adminp__sec">' +
      '<h3>Admin panel logins</h3>' +
      '<p class="t-sm t-muted">Who unlocked UltraAdmin, and when. Written by the server when a session opens. ' +
        'Shows account email and time only — no screen sharing.</p>' +
      '<div id="ap-logins" class="adminp__rows"></div>' +
    '</section>';
  }

  function panelPermissions() {
    return '<section class="adminp__sec">' +
      '<h3>Permissions</h3>' +
      '<p class="t-sm t-muted">Limit other admins to certain commands. Default is restricted: ' +
        'no bans, no taking gems, no destructive moderation. Example: check only <b>Gems</b>, or use <b>Gems only</b>.</p>' +
      '<div id="ap-grants" class="adminp__grants">Loading…</div>' +
    '</section>';
  }

  function panelCommands() {
    return '<section class="adminp__sec">' +
      '<h3>Commands</h3>' +
      '<p class="t-sm t-muted">Type <code>help</code> for the list. A command that needs an account uses the selected one. ' +
        '<code>plans</code> opens the Premium plans TEST grant UI (mock checkout only). ' +
        '<code>cooking</code> previews the cooking loader.</p>' +
      '<div class="adminp__search">' +
        '<input class="input mono" id="ap-cmd" type="text" placeholder="take 500" ' +
          'autocomplete="off" spellcheck="false">' +
        '<button class="btn btn--sm" data-do="runcmd">Run</button>' +
      '</div>' +
      '<pre class="adminp__out" id="ap-out">Ready.</pre>' +
    '</section>';
  }

  function panelDevelopment() {
    var premOn = !!(global.Premium && global.Premium.active && global.Premium.active());
    var previewOn = !!(global.Premium && global.Premium.previewEnabled && global.Premium.previewEnabled());
    var RT = global.ReferralTrial;
    var refOn = !!(RT && RT.previewEnabled && RT.previewEnabled());
    var prog = (RT && RT.progress) ? RT.progress() : { count: 0, needed: 5, link: '', trialActive: false, trialUntil: null };
    var signedIn = !!(global.Cloud && global.Cloud.signedIn);
    return '<section class="adminp__sec">' +
      '<h3>Development</h3>' +
      '<p class="t-sm t-muted">TEST tools for owner <code>alexjschendel@gmail.com</code> and UltraAdmin. ' +
        'Premium is <b>account / player</b> level — not teacher-based. Public checkout stays mock / TEST only. ' +
        'Referral trial is TEST only — not in the real public UI yet.</p>' +
      '<div class="adminp__warn adminp__warn--expired" style="margin-bottom:14px">' +
        '<div class="row" style="gap:10px;align-items:flex-start">' + (I.info || '') +
          '<div class="grow"><b>Not live billing.</b> Stripe is not connected. Turning the switch on only previews ' +
            'Premium plans UI and client gates for testing. When off, learners do not see paywalls or plans as if live.</div>' +
        '</div>' +
      '</div>' +
      '<div class="adminp__who" style="align-items:flex-start;margin-bottom:14px">' +
        '<div class="grow">' +
          '<div class="adminp__nm">' + (I.flask || I.bolt || '') +
            '<span>Premium plans &amp; gating preview</span></div>' +
          '<p class="t-sm t-muted" style="margin:6px 0 0">' +
            (previewOn
              ? 'Preview is <b>on</b>. Games hub and cosmetics show Premium locks and the polished plans upgrade path.'
              : 'Preview is <b>off</b>. Premium paywalls, plan cards, and upgrade CTAs stay hidden from users.') +
          '</p>' +
        '</div>' +
        '<button type="button" class="btn btn--sm' + (previewOn ? '' : ' btn--accent') +
          '" data-do="prempreview" data-on="' + (previewOn ? '0' : '1') + '" id="ap-prem-preview">' +
          (previewOn ? 'Turn preview off' : 'Turn preview on') + '</button>' +
      '</div>' +
      '<div class="adminp__who" style="align-items:flex-start">' +
        '<div class="grow">' +
          '<div class="adminp__nm">' + (I.shop || I.flask || '') +
            '<span>Premium plans (Free / Premium)</span></div>' +
          '<p class="t-sm t-muted" style="margin:6px 0 0">Account Premium UI for Games and profile effects. ' +
            'This account is currently <b>' + (premOn ? 'Premium / trial' : 'Free') + '</b>. ' +
            'Open always works here for owner/admin TEST grants.</p>' +
        '</div>' +
        '<button type="button" class="btn btn--accent btn--sm" data-do="subdev">' +
          (I.arrowR || '') + ' Open Premium plans</button>' +
      '</div>' +
      '<p class="t-sm t-muted" style="margin:0 0 18px">Also available from Commands: <code>plans</code> or <code>subscription</code>.</p>' +
      '<div class="adminp__who" style="align-items:flex-start;margin-bottom:14px">' +
        '<div class="grow">' +
          '<div class="adminp__nm">' + (I.flask || I.bolt || '') +
            '<span>Cooking loader preview</span></div>' +
          '<p class="t-sm t-muted" style="margin:6px 0 0">' +
            'Force the little pot “cooking” wait UI on screen for a few seconds. ' +
            'Dismiss or press Escape anytime. Commands: <code>cooking</code> or <code>loader</code>.</p>' +
        '</div>' +
        '<button type="button" class="btn btn--accent btn--sm" data-do="cookpreview" id="ap-cook-preview">' +
          (I.flask || '') + ' Preview cooking loader</button>' +
      '</div>' +
      '<div class="adminp__warn adminp__warn--expired" style="margin-bottom:14px">' +
        '<div class="row" style="gap:10px;align-items:flex-start">' + (I.info || '') +
          '<div class="grow"><b>Referral trial is TEST only.</b> Share the site link; after 5 new accounts sign up with ' +
            'your <code>?ref=</code> code, this account gets a 3-day all-games trial. When this switch is off there is ' +
            'no public share surface and no grants. School-safe — no Pets / Brainrot / mirroring.</div>' +
        '</div>' +
      '</div>' +
      '<div class="adminp__who" style="align-items:flex-start;margin-bottom:14px">' +
        '<div class="grow">' +
          '<div class="adminp__nm">' + (I.users || I.flask || '') +
            '<span>Referral → 3-day all-games trial</span></div>' +
          '<p class="t-sm t-muted" style="margin:6px 0 0">' +
            (refOn
              ? 'TEST is <b>on</b>. Tracking and grants run in this browser. Not shown in real public UI yet.'
              : 'TEST is <b>off</b>. No public surfaces, no invite credits, no trial grants.') +
          '</p>' +
        '</div>' +
        '<button type="button" class="btn btn--sm' + (refOn ? '' : ' btn--accent') +
          '" data-do="reftrial" data-on="' + (refOn ? '0' : '1') + '" id="ap-ref-trial">' +
          (refOn ? 'Turn referral TEST off' : 'Turn referral TEST on') + '</button>' +
      '</div>' +
      (refOn
        ? '<div class="adminp__who" style="align-items:flex-start;flex-direction:column;gap:10px">' +
            '<div class="grow" style="width:100%">' +
              '<div class="adminp__nm">' + (I.key || I.link || '') +
                '<span>Invite progress (TEST)</span></div>' +
              '<p class="t-sm t-muted" style="margin:6px 0 0">' +
                (signedIn
                  ? 'Signed-up via your link: <b>' + esc(String(prog.count || 0)) + ' / ' +
                    esc(String(prog.needed || 5)) + '</b>.' +
                    (prog.trialActive
                      ? ' Trial <b>active</b> until ' + esc(String(prog.trialUntil || '').slice(0, 10)) + '.'
                      : ' Trial unlocks at 5.')
                  : 'Sign in to mint a share link for this account.') +
              '</p>' +
              (signedIn && prog.link
                ? '<p class="t-sm mono" style="margin:8px 0 0;word-break:break-all">' + esc(prog.link) + '</p>'
                : '') +
            '</div>' +
            '<div class="row" style="gap:8px;flex-wrap:wrap">' +
              '<button type="button" class="btn btn--sm btn--accent" data-do="refcopy" ' +
                (signedIn ? '' : 'disabled') + '>' + (I.key || '') + ' Copy share link</button>' +
              '<button type="button" class="btn btn--sm" data-do="refsim" ' +
                (signedIn ? '' : 'disabled') + '>Simulate invited signup</button>' +
              '<button type="button" class="btn btn--sm btn--ghost" data-do="refreset" ' +
                (signedIn ? '' : 'disabled') + '>Reset progress</button>' +
            '</div>' +
          '</div>'
        : '') +
    '</section>';
  }

  function setPremiumPreview(on) {
    if (!global.Premium || !global.Premium.setPreviewEnabled) {
      say('premium.js did not load.');
      return;
    }
    global.Premium.setPreviewEnabled(!!on);
    if (section === 'development') renderPanel();
    W.toast(
      'Premium preview',
      on ? 'Plans UI and gates are on for testing (still mock checkout).' : 'Plans UI and gates hidden from users.',
      I.flask || I.info,
      3600
    );
    say(on ? 'Premium preview ON (dev / mock only).' : 'Premium preview OFF.');
  }

  function setReferralTrial(on) {
    if (!global.ReferralTrial || !global.ReferralTrial.setPreviewEnabled) {
      say('referral-trial.js did not load.');
      return;
    }
    global.ReferralTrial.setPreviewEnabled(!!on);
    if (section === 'development') renderPanel();
    W.toast(
      'Referral trial TEST',
      on
        ? 'Share-link tracking and 3-day grants are on (still TEST / not public UI).'
        : 'No public surfaces and no trial grants.',
      I.users || I.flask || I.info,
      3600
    );
    say(on ? 'Referral trial TEST ON.' : 'Referral trial TEST OFF.');
  }

  function simulateReferralSignup() {
    var RT = global.ReferralTrial;
    if (!RT || !RT.simulateSignup) {
      say('referral-trial.js did not load.');
      return;
    }
    var res = RT.simulateSignup();
    if (!res || !res.ok) {
      say((res && res.reason === 'off')
        ? 'Turn referral TEST on first.'
        : (res && res.reason === 'no-account')
          ? 'Sign in to simulate invitees against your link.'
          : 'Could not simulate signup.');
      return;
    }
    if (section === 'development') renderPanel();
    W.toast(
      'Invited signup',
      (res.count || 0) + ' / ' + (RT.NEEDED || 5) + ' toward the 3-day trial.',
      I.users || I.check,
      2800
    );
    say('Simulated invited signup → ' + (res.count || 0) + ' / ' + (RT.NEEDED || 5) + '.');
  }

  function copyReferralLink() {
    var RT = global.ReferralTrial;
    if (!RT || !RT.copyShareLink) {
      say('referral-trial.js did not load.');
      return;
    }
    RT.copyShareLink().then(function (url) {
      W.toast('Share link copied', url, I.key || I.check, 3600);
      say('Copied ' + url);
    }).catch(function (e) {
      say((e && e.message) || 'Could not copy share link.');
    });
  }

  function resetReferralTrial() {
    var RT = global.ReferralTrial;
    if (!RT || !RT.resetProgress) {
      say('referral-trial.js did not load.');
      return;
    }
    RT.resetProgress();
    if (section === 'development') renderPanel();
    W.toast('Referral progress reset', 'Credits and trial cleared for this TEST.', I.refresh || I.info, 2800);
    say('Referral trial progress reset.');
  }

  function openSubscriptionDev() {
    var S = global.SubscriptionDev;
    if (!S || (!S.openForced && !S.open)) {
      say('subscription-dev.js did not load.');
      W.toast('Missing preview', 'subscription-dev.js did not load.', I.info, 3200);
      return;
    }
    if (S.openForced) S.openForced('');
    else S.open({ force: true });
  }

  function previewCookingLoader() {
    var CL = global.CookingLoader;
    if (!CL || !CL.preview) {
      say('cooking-loader.js did not load.');
      W.toast('Missing loader', 'cooking-loader.js did not load.', I.info, 3200);
      return;
    }
    CL.preview({ size: 'lg', ms: 4000 });
    W.toast('Cooking loader', 'Preview on screen — dismiss or wait a few seconds.', I.flask || I.info, 2800);
    say('Cooking loader preview shown (auto-hides).');
  }

  /* ========================= server round trips ==================== */
  function guard(res, after) {
    if (res && res.ok) {
      if (banner === 'nomigration' || banner === 'expired' || banner === 'notready') setBanner('');
      return after(res.data);
    }
    var kind = (res && res.kind) || 'error';
    if (kind === 'forbidden') {
      say((res && res.message) || 'You do not have permission for that.');
      W.toast('Not permitted', (res && res.message) || 'That command is not granted to you.', I.lock, 3600);
      return null;
    }
    setBanner(kind, (res && res.message) || 'Something went wrong.');
    return null;
  }

  function setBanner(kind, msg) {
    var host = root && W.$('#ap-banner', root);
    if (!host) return;
    if (!kind) { banner = ''; host.innerHTML = ''; return; }
    banner = kind;
    var title = kind === 'nomigration' ? 'The database is behind this page'
              : kind === 'expired'     ? 'The admin session has ended'
              : kind === 'notready'    ? 'Not signed in'
              : 'That did not work';
    var extra = kind === 'nomigration'
      ? '<p class="t-sm" style="margin:8px 0 0">Run <code>supabase/migrations/0007_administrator.sql</code> ' +
        'and <code>0012_admin_command_grants.sql</code> in the SQL editor.</p>'
      : kind === 'expired'
      ? '<p class="t-sm" style="margin:8px 0 0">Sessions last 30 minutes and are not renewed by use. ' +
        'Close this page, open UltraAdmin and enter the code again.</p>'
      : '';
    host.innerHTML =
      '<div class="adminp__warn adminp__warn--' + esc(kind) + '">' +
        '<div class="row" style="gap:10px;align-items:flex-start">' + I.info +
          '<div class="grow"><b>' + esc(title) + '</b>' +
          '<div class="t-sm" style="margin-top:2px">' + esc(msg) + '</div>' + extra + '</div>' +
        '</div></div>';
  }

  function refresh() {
    setBanner('');
    sessionPill();
    var o = ops();
    if (!o) return setBanner('error', 'admin-ops.js did not load.');

    var who = meProfile();
    var nm = W.$('#ap-name', root), em = W.$('#ap-email', root);
    if (nm) nm.textContent = who.name;
    if (em) em.textContent = who.email || 'signed in';

    loadAccess().then(function () {
      o.stats().then(function (r) {
        guard(r, function (d) { stats = d; if (section === 'overview') renderStats(); });
        if (!r.ok && section === 'overview') renderStats();
      });
      loadBans();
      if (section === 'overview') renderStaff();
      if (section === 'accounts' || !rows.length) search();
      if (section === 'permissions') loadGrants();
      if (section === 'activity') o.recent(30).then(function (r) { guard(r, renderLog); });
      if (section === 'logins') loadLogins();
      renderPanel();
    });
  }

  function loadAccess() {
    var o = ops();
    if (!o.myAccess) {
      access = { owner: false, email: '', commands: ['accounts', 'stats', 'log'] };
      return Promise.resolve();
    }
    return o.myAccess().then(function (r) {
      if (r && r.ok && r.data) {
        var d = r.data;
        var cmds = d.commands;
        if (cmds && typeof cmds === 'object' && !Array.isArray(cmds)) {
          /* jsonb array sometimes arrives already parsed; object map unlikely */
          cmds = Object.keys(cmds).map(function (k) { return cmds[k]; });
        }
        access = {
          owner: !!d.owner,
          email: d.email || '',
          commands: Array.isArray(cmds) ? cmds : ['accounts', 'stats', 'log']
        };
        /* Client-side owner mirror from signed-in email, in case 0012
           is not applied yet — still never trusted for server calls. */
        var mail = ((global.Cloud && global.Cloud.user && global.Cloud.user.email) || '').toLowerCase();
        if (mail === OWNER_EMAIL) {
          access.owner = true;
          access.commands = ['accounts','stats','log','gems','ban','messages','staff',
            'allow','moderate','classes','activity','permissions'];
        }
      } else if (r && r.kind === 'nomigration') {
        var m = ((global.Cloud && global.Cloud.user && global.Cloud.user.email) || '').toLowerCase();
        access = {
          owner: m === OWNER_EMAIL,
          email: m,
          commands: m === OWNER_EMAIL
            ? ['accounts','stats','log','gems','ban','messages','staff','allow','moderate','classes','activity','permissions']
            : ['accounts', 'stats', 'log']
        };
      }
      syncNav();
    });
  }

  function loadBans() {
    var o = ops();
    if (!o || !o.banned || !can('ban')) return;
    o.banned().then(function (r) {
      if (!r || !r.ok) return;
      bans = {};
      (r.data || []).forEach(function (b) { bans[b.user_id] = b; });
      for (var i = 0; i < rows.length; i++) rows[i].banned = !!bans[rows[i].id];
      if (picked) picked.banned = !!bans[picked.id];
      if (section === 'accounts') { renderRows(); if (picked) renderPicked(); }
    });
  }


  function sessionPill() {
    var el = root && W.$('#ap-session', root);
    if (!el) return;
    var o = ops();
    var mins = o ? o.minutesLeft() : 0;
    el.textContent = (o && o.live()) ? mins + ' min left' : 'no session';
    el.className = 'adminp__pill' + ((o && o.live()) ? ' is-live' : '');
  }

  function renderStats() {
    var host = root && W.$('#ap-stats', root);
    if (!host) return;
    var s = stats || {};
    var tiles = [
      [num(s.accounts), 'Accounts', 'Every profile row on the server.'],
      [num(s.active24), 'Active 24h', 'Profiles updated in the last day.'],
      [num(s.allowed), 'Admin list', 'Accounts that may open the admin panels.'],
      [num(s.staff), 'Staff marks', 'Accounts holding the staff cosmetic.'],
      [num(s.actions24), 'Admin actions 24h', 'Cross-account actions in the last day.']
    ];
    host.innerHTML = tiles.map(function (t) {
      return '<div class="adminp__tile" title="' + esc(t[2]) + '">' +
        '<b>' + esc(String(t[0])) + '</b><span>' + esc(t[1]) + '</span></div>';
    }).join('');
  }

  function search() {
    var qEl = root && W.$('#ap-q', root);
    var q = qEl ? qEl.value : loadedQuery;
    var host = root && W.$('#ap-rows', root);
    if (host) host.innerHTML = '<div class="adminp__empty">Searching…</div>';
    return ops().find(q).then(function (r) {
      host = root && W.$('#ap-rows', root);
      if (!r || !r.ok) {
        if (host) host.innerHTML = '<div class="adminp__empty">Nothing to show.</div>';
        return guard(r, function () {});
      }
      if (banner === 'nomigration' || banner === 'expired' || banner === 'notready') setBanner('');
      acceptRows(q, r.data || []);
      if (host) renderRows();
    });
  }

  /* A new query drops the ticks. The same query (Refresh) keeps ticks
     that are still in the result and drops the rest. */
  function acceptRows(q, data) {
    var changed = querySeen && q !== loadedQuery;
    rows = data || [];
    for (var i = 0; i < rows.length; i++) rows[i].banned = !!bans[rows[i].id];
    if (!querySeen || changed) {
      ticked = {};
      page = 0;
    } else {
      pruneTicked();
    }
    loadedQuery = q;
    querySeen = true;
    if (page > pageCount() - 1) page = pageCount() - 1;
    if (page < 0) page = 0;
  }

  function pageCount() {
    return Math.max(1, Math.ceil(rows.length / PAGE));
  }

  function pageRows() {
    return rows.slice(page * PAGE, page * PAGE + PAGE);
  }

  function tickCount() {
    var n = 0;
    for (var i = 0; i < rows.length; i++) if (ticked[rows[i].id]) n++;
    return n;
  }

  function tickedAccounts() {
    var out = [];
    for (var i = 0; i < rows.length; i++) if (ticked[rows[i].id]) out.push(rows[i]);
    return out;
  }

  function pruneTicked() {
    var keep = {};
    for (var i = 0; i < rows.length; i++) if (ticked[rows[i].id]) keep[rows[i].id] = true;
    ticked = keep;
  }

  function coversEveryone() {
    return rows.length > 0 && tickCount() === rows.length;
  }

  function toggleOne(id, on) {
    if (bulkBusy) return;
    if (on) ticked[id] = true;
    else delete ticked[id];
    renderRows();
  }

  function togglePage(on) {
    if (bulkBusy) return;
    var list = pageRows();
    for (var i = 0; i < list.length; i++) {
      if (on) ticked[list[i].id] = true;
      else delete ticked[list[i].id];
    }
    renderRows();
  }

  function selectEveryone() {
    if (bulkBusy) return;
    for (var i = 0; i < rows.length; i++) ticked[rows[i].id] = true;
    renderRows();
  }

  function clearSelection() {
    if (bulkBusy) return;
    ticked = {};
    renderRows();
  }

  function turnPage(delta) {
    if (bulkBusy) return;
    var next = page + delta;
    if (next < 0 || next > pageCount() - 1) return;
    page = next;
    renderRows();
  }

  function renderRows() {
    var host = root && W.$('#ap-rows', root);
    if (!host) return;
    renderBulk();
    renderPager();
    if (!rows.length) {
      host.innerHTML = '<div class="adminp__empty">No account matched that.</div>';
      return;
    }
    if (page > pageCount() - 1) page = pageCount() - 1;
    if (page < 0) page = 0;
    var list = pageRows();
    host.innerHTML =
      '<div class="adminp__row adminp__row--acct adminp__row--head">' +
        '<label class="adminp__check">' +
          '<input type="checkbox" id="ap-select-page" aria-label="Select all on this page" ' +
            'title="Select all on this page"' + (bulkBusy ? ' disabled' : '') + '>' +
        '</label>' +
        '<span>Name</span><span>Email</span><span class="num">Level</span>' +
        '<span class="num">💎</span><span class="num">XP</span><span>Seen</span>' +
      '</div>' +
      list.map(function (a) {
        var on = !!ticked[a.id];
        return '<div class="adminp__row adminp__row--acct' + (picked && picked.id === a.id ? ' is-picked' : '') +
          '" data-pick="' + esc(a.id) + '">' +
          '<label class="adminp__check">' +
            '<input type="checkbox" data-check="' + esc(a.id) + '"' +
              (on ? ' checked' : '') + (bulkBusy ? ' disabled' : '') +
              ' aria-label="Select ' + esc(a.display_name || 'account') + '">' +
          '</label>' +
          '<span class="adminp__nm">' + esc(a.display_name || 'Explorer') +
            (a.staff ? '<i class="adminp__staff" title="LearnGeo staff">STAFF</i>' : '') +
            (a.banned ? '<i class="adminp__ban" title="Banned from LearnGeo">BANNED</i>' : '') + '</span>' +
          '<span class="adminp__email t-muted">' + esc(a.email || '—') + '</span>' +
          '<span class="adminp__lv num">' + num(a.level) + '</span>' +
          '<span class="adminp__dia num">' + num(a.diamonds) + '</span>' +
          '<span class="adminp__xp num">' + num(a.xp) + '</span>' +
          '<span class="adminp__seen t-muted">' + esc(ago(a.last_seen || a.seen_at)) + '</span>' +
        '</div>';
      }).join('');
    syncPageCheckbox();
  }

  function syncPageCheckbox() {
    var box = root && W.$('#ap-select-page', root);
    if (!box) return;
    var list = pageRows();
    var n = 0;
    for (var i = 0; i < list.length; i++) if (ticked[list[i].id]) n++;
    box.checked = list.length > 0 && n === list.length;
    box.indeterminate = n > 0 && n < list.length;
    box.disabled = bulkBusy || !list.length;
  }

  function renderPager() {
    var host = root && W.$('#ap-pager', root);
    if (!host) return;
    if (page > pageCount() - 1) page = pageCount() - 1;
    if (page < 0) page = 0;
    if (rows.length <= PAGE) {
      host.hidden = true;
      host.innerHTML = '';
      return;
    }
    host.hidden = false;
    var pages = pageCount();
    var start = page * PAGE + 1;
    var end = Math.min(rows.length, (page + 1) * PAGE);
    host.innerHTML =
      '<button type="button" class="btn btn--ghost btn--sm" data-do="page" data-delta="-1"' +
        (page === 0 || bulkBusy ? ' disabled' : '') + '>Previous</button>' +
      '<span class="t-sm t-muted" id="ap-page-label">' + start + '–' + end + ' of ' + rows.length +
        ' · page ' + (page + 1) + ' of ' + pages + '</span>' +
      '<button type="button" class="btn btn--ghost btn--sm" data-do="page" data-delta="1"' +
        (page >= pages - 1 || bulkBusy ? ' disabled' : '') + '>Next</button>';
  }

  function renderBulk() {
    var countEl = root && W.$('#ap-sel-count', root);
    var acts = root && W.$('#ap-bulk-acts', root);
    var cap = root && W.$('#ap-bulk-cap', root);
    var clearBtn = root && W.$('#ap-clear-selection', root);
    var allBtn = root && W.$('#ap-select-everyone', root);
    if (!countEl) return;
    var n = tickCount();
    var everyone = coversEveryone();
    countEl.textContent = n + ' selected' + (everyone ? ' · everyone in this search' : '');
    if (clearBtn) clearBtn.disabled = bulkBusy || n === 0;
    if (allBtn) {
      allBtn.disabled = bulkBusy || rows.length === 0;
      allBtn.textContent = 'Select everyone' + (rows.length ? ' (' + rows.length + ')' : '');
    }
    if (cap) {
      cap.hidden = rows.length < FIND_CAP;
      cap.textContent = rows.length < FIND_CAP ? '' :
        'This search shows at most ' + FIND_CAP +
        ' accounts, the newest matches the server returns. Select everyone covers these ' +
        rows.length + '.';
    }
    if (!acts) return;
    acts.hidden = n === 0;
    if (n === 0) { acts.innerHTML = ''; return; }
    var html = bulkActionsHtml();
    acts.innerHTML = html ||
      '<p class="t-sm t-muted">You can select accounts. Bulk actions appear for commands granted to you.</p>';
    if (bulkBusy) {
      var btns = acts.querySelectorAll('button');
      for (var i = 0; i < btns.length; i++) btns[i].disabled = true;
    }
  }

  function bulkActionsHtml() {
    var html = '';
    if (can('messages')) {
      html += '<div class="adminp__act"><span class="eyebrow">Message</span>' +
        '<button type="button" class="btn btn--primary btn--sm" data-do="bulk" data-kind="msg">Message selected</button></div>';
    }
    if (can('gems')) {
      html += '<div class="adminp__act"><span class="eyebrow">Gems</span>' +
        '<button type="button" class="btn btn--sm" data-do="bulk" data-kind="give">Give diamonds</button>' +
        '<button type="button" class="btn btn--sm adminp__danger" data-do="bulk" data-kind="take">Take diamonds</button>' +
        '<button type="button" class="btn btn--sm adminp__danger" data-do="bulk" data-kind="empty">Empty diamonds</button></div>';
    }
    if (can('ban') || can('moderate')) {
      html += '<div class="adminp__act"><span class="eyebrow">Account</span>';
      if (can('ban')) {
        html += '<button type="button" class="btn btn--sm adminp__danger" data-do="bulk" data-kind="ban">Ban</button>' +
          '<button type="button" class="btn btn--sm" data-do="bulk" data-kind="unban">Lift bans</button>';
      }
      if (can('moderate')) {
        html += '<button type="button" class="btn btn--sm" data-do="bulk" data-kind="rename">Rename</button>' +
          '<button type="button" class="btn btn--sm adminp__danger" data-do="bulk" data-kind="wipe">Wipe scores</button>' +
          '<button type="button" class="btn btn--sm adminp__danger" data-do="bulk" data-kind="reset">Reset progress</button>' +
          '<button type="button" class="btn btn--sm adminp__danger" data-do="bulk" data-kind="leave">Remove from classes</button>';
      }
      html += '</div>';
    }
    if (can('staff') || can('allow')) {
      html += '<div class="adminp__act"><span class="eyebrow">Marks</span>';
      if (can('staff')) {
        html += '<button type="button" class="btn btn--sm" data-do="bulk" data-kind="staffOn">Grant staff</button>' +
          '<button type="button" class="btn btn--sm adminp__danger" data-do="bulk" data-kind="staffOff">Remove staff</button>';
      }
      if (can('allow')) {
        html += '<button type="button" class="btn btn--sm" data-do="bulk" data-kind="allowOn">Give admin access</button>' +
          '<button type="button" class="btn btn--sm adminp__danger" data-do="bulk" data-kind="allowOff">Remove admin access</button>';
      }
      html += '</div>';
    }
    return html;
  }

  function ago(ts) {
    if (!ts) return '—';
    var t = Date.parse(ts);
    if (!t) return '—';
    var s = Math.round((Date.now() - t) / 1000);
    if (s < 45) return 'just now';
    var m = Math.round(s / 60);
    if (m < 60) return m + 'm ago';
    var h = Math.round(m / 60);
    if (h < 24) return h + 'h ago';
    return Math.round(h / 24) + 'd ago';
  }

  /* Resolve via find by id/email when the account is not in the
     current search results. */
  function select(id) {
    var found = null;
    for (var i = 0; i < rows.length; i++) { if (rows[i].id === id) found = rows[i]; }
    if (found) {
      picked = found;
      afterSelect();
      return;
    }
    ops().find(id).then(function (r) {
      if (r && r.ok && r.data && r.data.length) {
        var hit = null;
        for (var j = 0; j < r.data.length; j++) if (r.data[j].id === id) hit = r.data[j];
        picked = hit || r.data[0];
        picked.banned = !!bans[picked.id];
        /* Keep a copy in rows so later renders stay coherent. */
        var exists = false;
        for (var k = 0; k < rows.length; k++) if (rows[k].id === picked.id) { rows[k] = picked; exists = true; }
        if (!exists) rows.unshift(picked);
      } else {
        picked = { id: id, display_name: 'Account', email: '', diamonds: 0, level: 1, xp: 0 };
      }
      afterSelect();
    });
  }

  function afterSelect() {
    if (section === 'accounts') { renderRows(); renderPicked(); }
    else if (section === 'gems' || section === 'messages') {
      renderPickedMini();
      if (section === 'messages') loadThread();
    } else {
      say(picked
        ? 'Selected ' + (picked.display_name || picked.email || picked.id)
        : 'Nothing selected.');
    }
  }

  var TAKE = [100, 500, 1000, 5000];

  function renderPicked() {
    var sec = root && W.$('#ap-picked-sec', root), host = root && W.$('#ap-picked', root);
    if (!sec || !host) return;
    if (!picked) { sec.hidden = true; host.innerHTML = ''; return; }
    sec.hidden = false;

    var gemsBtns = '';
    if (can('gems')) {
      gemsBtns =
        '<div class="adminp__act">' +
          '<span class="eyebrow">Take</span>' +
          TAKE.map(function (n) {
            return '<button class="btn btn--sm adminp__danger" data-do="gems" data-delta="-' + n +
              '" data-label="took ' + n + '">−' + num(n) + '</button>';
          }).join('') +
          '<button class="btn btn--sm adminp__danger" data-do="gems" data-set="0" data-label="emptied">Empty it</button>' +
        '</div>' +
        '<div class="adminp__act">' +
          '<span class="eyebrow">Give</span>' +
          TAKE.map(function (n) {
            return '<button class="btn btn--sm" data-do="gems" data-delta="' + n +
              '" data-label="gave ' + n + '">+' + num(n) + '</button>';
          }).join('') +
        '</div>';
    }

    var marks = '';
    if (can('staff') || can('allow')) {
      marks = '<div class="adminp__act"><span class="eyebrow">Marks</span>';
      if (can('staff')) {
        marks += '<button class="btn btn--sm" data-do="staff" data-on="' + (picked.staff ? '0' : '1') + '">' +
          (picked.staff ? 'Remove staff effect' : 'Grant staff effect') + '</button>';
      }
      if (can('allow')) {
        marks +=
          '<button class="btn btn--sm" data-do="allow" data-on="1">Give admin access</button>' +
          '<button class="btn btn--sm" data-do="allow" data-on="0">Remove admin access</button>';
      }
      marks += '</div>';
    }

    var account = '';
    if (can('ban') || can('moderate')) {
      account = '<div class="adminp__act"><span class="eyebrow">Account</span>';
      if (can('ban')) {
        account += picked.banned
          ? '<button class="btn btn--sm" data-do="ban" data-on="0">Lift the ban</button>'
          : '<button class="btn btn--sm adminp__danger" data-do="ban" data-on="1">Ban this account</button>';
      }
      if (can('moderate')) {
        account +=
          '<button class="btn btn--sm" data-do="rename">Rename</button>' +
          '<button class="btn btn--sm adminp__danger" data-do="wipescores">Wipe arcade scores</button>' +
          '<button class="btn btn--sm adminp__danger" data-do="resetprog">Reset progress</button>' +
          '<button class="btn btn--sm adminp__danger" data-do="leaveclasses">Remove from all classes</button>';
      }
      account += '</div>';
    }

    var msgBlock = '';
    if (can('messages')) {
      msgBlock =
        '<div class="adminp__msg">' +
          '<span class="eyebrow">Message</span>' +
          '<textarea class="input" id="ap-msg-text" rows="3" maxlength="' + MSG_MAX + '" ' +
            'placeholder="Shows up on their screen, from a LearnGeo administrator"></textarea>' +
          '<div class="adminp__msgfoot">' +
            '<span class="t-sm t-muted" id="ap-msg-count">0 / ' + MSG_MAX + '</span>' +
            '<button class="btn btn--primary btn--sm" data-do="msg">Send message</button>' +
          '</div>' +
          '<div class="adminp__thread" id="ap-thread">' +
            '<div class="adminp__thread-empty">Loading the conversation…</div>' +
          '</div>' +
        '</div>';
    }

    host.innerHTML =
      '<div class="adminp__who">' +
        '<div><b>' + esc(picked.display_name || 'Explorer') + '</b>' +
          '<div class="t-sm t-muted">' + esc(picked.email || 'no email on this account') + '</div></div>' +
        '<div class="grow"></div>' +
        '<div class="adminp__bal"><b class="mono">' + num(picked.diamonds) + '</b><span>diamonds</span></div>' +
      '</div>' +
      gemsBtns + marks + account +
      (picked.banned
        ? '<div class="adminp__warn" style="margin:4px 0 12px"><b>Banned.</b> ' +
          '<div class="t-sm" style="margin-top:2px">They are shown the banned screen when they sign in.</div></div>'
        : '') +
      msgBlock;

    if (can('messages')) loadThread();
  }

  function renderPickedMini() {
    var host = root && W.$('#ap-picked-mini', root);
    if (!host) return;
    if (!picked) {
      host.innerHTML = '<div class="adminp__empty">No account selected. Open Accounts and pick one.</div>';
      var msgHost = W.$('#ap-msg-host', root);
      if (msgHost) msgHost.innerHTML = '';
      return;
    }
    host.innerHTML =
      '<div class="adminp__who">' +
        '<div><b>' + esc(picked.display_name || 'Explorer') + '</b>' +
          '<div class="t-sm t-muted">' + esc(picked.email || 'no email') + '</div></div>' +
        '<div class="grow"></div>' +
        '<div class="adminp__bal"><b class="mono">' + num(picked.diamonds) + '</b><span>diamonds</span></div>' +
      '</div>';

    if (section === 'gems' && can('gems')) {
      host.innerHTML +=
        '<div class="adminp__act">' +
          TAKE.map(function (n) {
            return '<button class="btn btn--sm adminp__danger" data-do="gems" data-delta="-' + n +
              '" data-label="took ' + n + '">−' + num(n) + '</button>';
          }).join('') +
          '<button class="btn btn--sm adminp__danger" data-do="gems" data-set="0" data-label="emptied">Empty</button>' +
          TAKE.map(function (n) {
            return '<button class="btn btn--sm" data-do="gems" data-delta="' + n +
              '" data-label="gave ' + n + '">+' + num(n) + '</button>';
          }).join('') +
        '</div>';
    }

    if (section === 'messages' && can('messages')) {
      var msgHost2 = W.$('#ap-msg-host', root);
      if (msgHost2) {
        msgHost2.innerHTML =
          '<div class="adminp__msg" style="border-top:0;padding-top:0;margin-top:8px">' +
            '<textarea class="input" id="ap-msg-text" rows="3" maxlength="' + MSG_MAX + '" ' +
              'placeholder="Shows up on their screen, from a LearnGeo administrator"></textarea>' +
            '<div class="adminp__msgfoot">' +
              '<span class="t-sm t-muted" id="ap-msg-count">0 / ' + MSG_MAX + '</span>' +
              '<button class="btn btn--primary btn--sm" data-do="msg">Send message</button>' +
            '</div>' +
            '<div class="adminp__thread" id="ap-thread">' +
              '<div class="adminp__thread-empty">Loading the conversation…</div>' +
            '</div>' +
          '</div>';
        loadThread();
      }
    }
  }

  function loadThread() {
    var host = root && W.$('#ap-thread', root);
    if (!host || !picked || !ops().thread) return;
    var who = picked;
    ops().thread(who.id).then(function (r) {
      if (!root || !picked || picked.id !== who.id) return;
      host = W.$('#ap-thread', root);
      if (!host) return;
      if (!r || !r.ok) {
        host.innerHTML = r && r.kind === 'nomigration'
          ? '<div class="adminp__thread-empty">Conversation history needs 0011 on the database.</div>'
          : '<div class="adminp__thread-empty">Could not load the conversation.</div>';
        return;
      }
      var list = r.data || [];
      if (!list.length) {
        host.innerHTML = '<div class="adminp__thread-empty">No messages with this account yet.</div>';
        return;
      }
      host.innerHTML = list.map(function (m) {
        var outgoing = m.action === 'message';
        var label = outgoing
          ? (m.actor_email || 'Admin')
          : (who.display_name || who.email || m.actor_email || 'Them');
        var text = W.escapeHtml(String(m.body || '')).replace(/\n/g, '<br>');
        return '<div class="admsg admsg--' + (outgoing ? 'out' : 'in') + '">' +
          '<div class="admsg__who">' + esc(label) + ' · ' + esc(ago(m.created_at)) + '</div>' +
          '<div class="admsg__text">' + text + '</div>' +
        '</div>';
      }).join('');
      host.scrollTop = host.scrollHeight;
    });
  }

  /* =========================== permissions ========================= */
  function loadGrants() {
    var host = root && W.$('#ap-grants', root);
    if (!host) return;
    if (!access.owner) {
      host.innerHTML = '<div class="t-sm t-muted">Only the owner can edit permissions.</div>';
      return;
    }
    ops().grantsList().then(function (r) {
      if (!host) return;
      if (!r || !r.ok) {
        host.innerHTML = '<div class="t-sm t-muted">' +
          (r && r.kind === 'nomigration'
            ? 'Permissions need 0012_admin_command_grants.sql on the database.'
            : esc((r && r.message) || 'Could not load grants.')) + '</div>';
        return;
      }
      grants = r.data || [];
      renderGrants();
    });
  }

  function renderGrants() {
    var host = root && W.$('#ap-grants', root);
    if (!host) return;
    if (!grants.length) {
      host.innerHTML = '<div class="adminp__empty">Nobody else is on the admin allowlist yet.</div>';
      return;
    }
    host.innerHTML = grants.map(function (g) {
      var cmds = g.commands || [];
      var checks = GRANTABLE.map(function (c) {
        var on = cmds.indexOf(c.id) !== -1;
        return '<label class="adminp__grant">' +
          '<input type="checkbox" data-grant="' + esc(c.id) + '" ' + (on ? 'checked' : '') + '>' +
          '<span><b>' + esc(c.label) + '</b><i>' + esc(c.hint) + '</i></span></label>';
      }).join('');
      return '<div class="adminp__grantcard" data-grant-email="' + esc(g.email) + '">' +
        '<div class="row row--between" style="margin-bottom:10px">' +
          '<div><b>' + esc(g.email) + '</b>' +
            '<div class="t-sm t-muted">' +
              (cmds.length ? esc(cmds.join(', ')) : 'Restricted (default)') +
            '</div></div>' +
        '</div>' +
        '<div class="adminp__grantlist">' + checks + '</div>' +
        '<div class="adminp__act" style="margin-top:12px">' +
          '<button class="btn btn--primary btn--sm" data-do="savegrants" data-email="' + esc(g.email) + '">Save</button>' +
          '<button class="btn btn--sm" data-do="gemsonly" data-email="' + esc(g.email) + '">Gems only</button>' +
          '<button class="btn btn--ghost btn--sm" data-do="cleargrants" data-email="' + esc(g.email) + '">Clear (restricted)</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function saveGrants(email, forced) {
    if (!access.owner) return;
    var cmds = forced;
    if (!cmds) {
      var cards = root.querySelectorAll('[data-grant-email]');
      var card = null;
      for (var i = 0; i < cards.length; i++) {
        if (cards[i].getAttribute('data-grant-email') === email) card = cards[i];
      }
      cmds = [];
      if (card) {
        var boxes = card.querySelectorAll('input[data-grant]');
        for (var j = 0; j < boxes.length; j++) {
          if (boxes[j].checked) cmds.push(boxes[j].getAttribute('data-grant'));
        }
      }
    }
    ops().grantsSet(email, cmds).then(function (r) {
      guard(r, function (saved) {
        say(email + ' → ' + ((saved && saved.length) ? saved.join(', ') : 'restricted'));
        W.toast('Permissions saved', email + (saved && saved.length ? ': ' + saved.join(', ') : ' is restricted'), I.check, 3600);
        loadGrants();
      });
    });
  }

  /* =========================== the actions ========================= */
  function needPicked() {
    if (picked) return true;
    say('No account selected. Search for one under Accounts and click its row first.');
    return false;
  }

  function gems(opts, label) {
    if (!can('gems')) return say('Gems commands are not granted to you.');
    if (!needPicked()) return;
    ops().gems(picked.id, { delta: opts.delta, set: opts.set, reason: label }).then(function (r) {
      guard(r, function (left) {
        var was = picked.diamonds;
        picked.diamonds = left;
        for (var i = 0; i < rows.length; i++) { if (rows[i].id === picked.id) rows[i].diamonds = left; }
        if (section === 'accounts') { renderRows(); renderPicked(); }
        if (section === 'gems') renderPickedMini();
        say(esc(picked.display_name) + ': ' + num(was) + ' → ' + num(left) +
            ' (' + (left - was >= 0 ? '+' : '') + num(left - was) + ')');
        W.toast('Balance changed', (picked.display_name || 'That account') + ' now has ' + num(left) + ' 💎',
          I.gem, 3600);
        refreshLog();
      });
    });
  }

  function overrideGems(amount) {
    if (!can('gems')) return say('Gems commands are not granted to you.');
    if (!needPicked()) return;
    var who = picked;
    ops().override(who.id, amount, 'override to ' + amount).then(function (r) {
      guard(r, function (left) {
        var was = who.diamonds;
        left = Number(left);
        who.diamonds = left;
        for (var i = 0; i < rows.length; i++) { if (rows[i].id === who.id) rows[i].diamonds = left; }
        if (section === 'accounts') { renderRows(); renderPicked(); }
        if (section === 'gems') renderPickedMini();
        say((who.display_name || 'That account') + ': ' + num(was) + ' → ' + num(left) + ' (override)');
        W.toast('Balance overridden', (who.display_name || 'That account') + ' now has ' + num(left) + ' 💎',
          I.gem, 3600);
        refreshLog();
      });
    });
  }

  function setStaff(on) {
    if (!can('staff')) return say('Staff commands are not granted to you.');
    if (!needPicked()) return;
    ops().staff(picked.id, on).then(function (r) {
      guard(r, function (now) {
        picked.staff = now;
        for (var i = 0; i < rows.length; i++) { if (rows[i].id === picked.id) rows[i].staff = now; }
        renderRows(); renderPicked();
        say(esc(picked.display_name) + ': staff effect ' + (now ? 'granted' : 'removed'));
        refreshLog();
      });
    });
  }

  function ask(title, body, label, run, extra) {
    global.UI.modal({
      title: title, icon: I.info,
      body: '<p class="t-muted">' + body + '</p>' + (extra || ''),
      actions: [
        { label: 'Cancel', cls: 'btn--ghost', close: true },
        { label: label, cls: 'btn--primary', close: true, onClick: run }
      ]
    });
  }

  function setBan(on) {
    if (!can('ban')) return say('Ban commands are not granted to you.');
    if (!needPicked()) return;
    var who = picked;
    if (!on) {
      return ops().ban(who.id, false, '').then(function (r) {
        guard(r, function () {
          who.banned = false;
          markRow(who.id, 'banned', false);
          renderRows(); renderPicked();
          say(esc(who.display_name) + ': ban lifted');
          refreshLog();
        });
      });
    }
    ask('Ban ' + esc(who.display_name) + '?',
        'They will be shown "You have been banned from LearnGeo" when they sign in.',
        'Ban the account',
        function (modalRoot) {
          var why = W.$('#ap-ban-why', modalRoot);
          ops().ban(who.id, true, why ? why.value : '').then(function (r) {
            guard(r, function () {
              who.banned = true;
              markRow(who.id, 'banned', true);
              renderRows(); renderPicked();
              say(esc(who.display_name) + ': banned');
              refreshLog();
            });
          });
        },
        '<div class="field" style="margin-top:12px">' +
          '<label class="field__label" for="ap-ban-why">Reason, shown to them</label>' +
          '<input class="input" id="ap-ban-why" maxlength="300" ' +
            'placeholder="e.g. Cheating on the arcade boards"></div>');
  }

  function renameAccount() {
    if (!can('moderate')) return say('Moderate commands are not granted to you.');
    if (!needPicked()) return;
    var who = picked;
    global.UI.modal({
      title: 'Rename ' + esc(who.display_name), icon: I.user,
      body: '<div class="field"><label class="field__label">Display name</label>' +
        '<input class="input" id="ap-name" maxlength="40" value="' + esc(who.display_name || '') + '">' +
        '<div class="field__hint">Leave it empty to put them back to Explorer.</div></div>',
      actions: [
        { label: 'Cancel', cls: 'btn--ghost', close: true },
        { label: 'Rename', cls: 'btn--accent', close: true, onClick: function (modalRoot) {
            var box = W.$('#ap-name', modalRoot);
            ops().rename(who.id, box ? box.value : '').then(function (r) {
              guard(r, function (now) {
                who.display_name = now;
                markRow(who.id, 'display_name', now);
                renderRows(); renderPicked();
                say('Renamed to ' + esc(now));
                refreshLog();
              });
            });
          } }
      ],
      onMount: function (modalRoot) { setTimeout(function () { var el = W.$('#ap-name', modalRoot); if (el) el.focus(); }, 60); }
    });
  }

  function wipeScores() {
    if (!can('moderate')) return say('Moderate commands are not granted to you.');
    if (!needPicked()) return;
    var who = picked;
    ask('Wipe ' + esc(who.display_name) + '\'s arcade scores?',
        'Their gamertag and every game score go. Learning progress is untouched.',
        'Wipe the scores',
        function () {
          ops().wipeScores(who.id).then(function (r) {
            guard(r, function (n) {
              say(esc(who.display_name) + ': ' + (n ? n + ' score' + (n === 1 ? '' : 's') + ' wiped' : 'nothing on the boards'));
              refreshLog();
            });
          });
        });
  }

  function resetProgress() {
    if (!can('moderate')) return say('Moderate commands are not granted to you.');
    if (!needPicked()) return;
    var who = picked;
    ask('Reset ' + esc(who.display_name) + '\'s progress?',
        'Level, XP, diamonds, mastery, streaks and achievements go back to a new account.',
        'Reset it',
        function () {
          ops().resetProgress(who.id).then(function (r) {
            guard(r, function () {
              picked.diamonds = 150;
              markRow(who.id, 'diamonds', 150);
              renderRows(); renderPicked();
              say(esc(who.display_name) + ': progress reset');
              refreshLog();
            });
          });
        });
  }

  function leaveClasses() {
    if (!can('moderate')) return say('Moderate commands are not granted to you.');
    if (!needPicked()) return;
    var who = picked;
    ask('Remove ' + esc(who.display_name) + ' from every class?',
        'They come out of every class they have joined. Marks stay in those gradebooks.',
        'Remove them',
        function () {
          ops().leaveClasses(who.id).then(function (r) {
            guard(r, function (n) {
              say(esc(who.display_name) + ': out of ' + n + ' class' + (n === 1 ? '' : 'es'));
              refreshLog();
            });
          });
        });
  }

  function markRow(id, key, value) {
    for (var i = 0; i < rows.length; i++) { if (rows[i].id === id) rows[i][key] = value; }
  }

  function refreshLog() {
    ops().recent(15).then(function (x) { guard(x, renderLog); });
  }

  function sendMessage(text, box) {
    if (!can('messages')) return say('Message commands are not granted to you.');
    if (!needPicked()) return;
    var body = String(text || '').trim();
    if (!body) return say('Type a message first.');
    if (body.length > MSG_MAX) return say('A message is at most ' + MSG_MAX + ' characters.');
    var who = picked;
    ops().message(who.id, body).then(function (r) {
      guard(r, function () {
        if (box && document.body.contains(box)) {
          box.value = '';
          var c = W.$('#ap-msg-count', root);
          if (c) c.textContent = '0 / ' + MSG_MAX;
        }
        say('Message sent to ' + (who.display_name || who.email || 'that account') + '.');
        W.toast('Message sent', (who.display_name || 'That account') + ' will see it on their screen.', I.check, 3600);
        refreshLog();
        if (picked && picked.id === who.id) loadThread();
      });
    });
  }

  function setAllow(on) {
    if (!can('allow')) return say('Allowlist commands are not granted to you.');
    if (!needPicked()) return;
    if (!picked.email) return say('That account has no email, so it cannot go on the allowlist.');
    ops().allow(picked.email, on).then(function (r) {
      guard(r, function () {
        say(picked.email + (on ? ' now has admin access' : ' no longer has admin access'));
        refreshLog();
        ops().stats().then(function (x) { guard(x, function (d) { stats = d; renderStats(); }); });
      });
    });
  }

  function trim(s, n) {
    s = String(s || '');
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }

  function renderLog(list) {
    var host = root && W.$('#ap-log', root);
    if (!host) return;
    if (!list || !list.length) {
      host.innerHTML = '<div class="adminp__empty">Nothing yet.</div>';
      return;
    }
    host.innerHTML = list.map(function (a) {
      var d = a.detail || {};
      var what = a.action === 'gems'
        ? (num(d.was) + ' → ' + num(d.now) + (d.override ? ' · override' : d.reason ? ' · ' + esc(d.reason) : ''))
        : a.action === 'private-password' ? (d.on ? 'set a Private Password on a device' : 'removed a Private Password from a device')
        : a.action === 'staff' ? (d.on ? 'staff effect granted' : 'staff effect removed')
        : a.action === 'allow' ? (d.on ? 'given admin access' : 'admin access removed')
        : a.action === 'grants' ? ('commands: ' + esc(((d.commands || []).join(', ')) || 'restricted'))
        : a.action === 'message' ? 'message: “' + esc(trim(d.text, 80)) + '”'
        : a.action === 'reply'   ? 'reply: “' + esc(trim(d.text, 80)) + '”'
        : esc(a.action);
      return '<div class="adminp__logrow">' +
        '<span class="t-muted">' + esc(ago(a.created_at)) + '</span>' +
        '<span>' + esc(a.actor_email || 'unknown') + '</span>' +
        '<span class="t-muted">→</span>' +
        '<span>' + esc(a.target_email || '—') + '</span>' +
        '<span class="grow">' + what + '</span>' +
      '</div>';
    }).join('');
  }

  function loadLogins() {
    var o = ops();
    if (!o || !o.logins) {
      renderLogins([]);
      return;
    }
    o.logins(50).then(function (r) { guard(r, renderLogins); });
  }

  function loginWhen(iso) {
    if (!iso) return '—';
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return String(iso);
      return d.toLocaleString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit'
      });
    } catch (e) {
      return String(iso);
    }
  }

  function renderLogins(list) {
    var host = root && W.$('#ap-logins', root);
    if (!host) return;
    if (!list || !list.length) {
      host.innerHTML = '<div class="adminp__empty">No admin logins recorded yet.</div>';
      return;
    }
    host.innerHTML = list.map(function (row) {
      var how = row.method === 'private' ? 'Private Password' : 'Admin code';
      var whenAbs = loginWhen(row.logged_at);
      return '<div class="adminp__logrow adminp__logrow--login">' +
        '<span class="t-muted" title="' + esc(ago(row.logged_at)) + '">' + esc(whenAbs) + '</span>' +
        '<span class="grow">' + esc(row.email || 'unknown') + '</span>' +
        '<span class="t-muted">' + esc(how) + '</span>' +
      '</div>';
    }).join('');
  }

  function hasStaff() {
    return !!(W.state.flags && W.state.flags.staff);
  }

  function selfStaff(on) {
    if (!W.state.flags || typeof W.state.flags !== 'object') W.state.flags = {};
    W.state.flags.staff = !!on;
    W.saveNow();
    if (global.Cloud && global.Cloud.push) { try { global.Cloud.push(); } catch (e) {} }
    if (global.UI && global.UI.refreshHud) global.UI.refreshHud();
    if (global.Portal && global.Portal.render) { try { global.Portal.render(); } catch (e) {} }
    renderStaff();
    W.toast(on ? 'Staff effect unlocked' : 'Staff effect removed',
      on ? 'Equip it under Customise → Profile effect.' : 'It is no longer in your shop.',
      I.sparkle, 4000);
  }

  function renderStaff() {
    var host = root && W.$('#ap-staff', root);
    if (!host) return;
    var fx = global.Cosmetics && global.Cosmetics.staffEffect;
    host.innerHTML =
      '<div class="adminp__who">' +
        '<div><b>' + esc(fx ? fx.name : 'Staff effect') + '</b>' +
          '<div class="t-sm t-muted">' + esc(fx ? fx.blurb : '') + '</div></div>' +
        '<div class="grow"></div>' +
        '<button class="btn btn--sm' + (hasStaff() ? '' : ' btn--primary') + '" ' +
          'data-do="selfstaff" data-on="' + (hasStaff() ? '0' : '1') + '">' +
          (hasStaff() ? 'Remove from me' : 'Give it to me') + '</button>' +
      '</div>';
  }

  /* ============================ commands =========================== */
  function helpText() {
    var lines = [
      'find <text>        search names and emails',
      'Accounts ticks     select several accounts, then use the bulk actions there',
      'who                show the selected account',
      'stats              reload the numbers at the top',
      'log                reload the action list',
      'help               this',
      'plans              open Premium plans (TEST grant for owner/admin)',
      'subscription       same as plans',
      'cooking            preview the cooking loader (TEST)',
      'loader             same as cooking'
    ];
    if (can('gems')) {
      lines = lines.concat([
        'take <n>           take n diamonds from the selected account',
        'give <n>           give n diamonds',
        'set <n>            set the balance to exactly n',
        'empty              set the balance to 0',
        'override set <n>   set diamonds past the ' + num(CAP) + ' cap, up to ' + num(MAX_SAFE)
      ]);
    }
    if (can('staff')) lines.push('staff on|off       grant or remove the staff effect');
    if (can('messages')) lines.push('msg <text>         send a message to their screen');
    if (can('allow')) {
      lines.push('allow <email>      give that address admin access');
      lines.push('unallow <email>    take admin access away');
    }
    return lines.join('\n');
  }

  function say(text) {
    var out = root && W.$('#ap-out', root);
    if (!out) {
      if (text) W.toast('Administrator', String(text).slice(0, 120), I.info, 3200);
      return;
    }
    out.textContent = String(text);
    out.scrollTop = out.scrollHeight;
  }

  function runCmd() {
    var box = W.$('#ap-cmd', root);
    if (!box) return;
    var line = String(box.value || '').trim();
    if (!line) return;
    box.value = '';

    var bits = line.split(/\s+/);
    var cmd = bits.shift().toLowerCase();
    var rest = bits.join(' ');
    var n = rest === '' ? NaN : Number(rest.replace(/,/g, ''));
    var bad = 'Not a whole number. Try "take 500".';
    if (!Number.isInteger(n)) n = NaN;
    if ((cmd === 'take' || cmd === 'give') && !isNaN(n) && Math.abs(n) > MAX_STEP) {
      return say('At most ' + num(MAX_STEP) + ' at a time.');
    }
    if (cmd === 'set' && !isNaN(n) && n > CAP) {
      return say('The most a balance can be is ' + num(CAP) + '.');
    }

    if (cmd === 'help') return say(helpText());
    if (cmd === 'plans' || cmd === 'subscription' || cmd === 'subdev') {
      openSubscriptionDev();
      return say('Opened Premium plans. TEST grant available for owner/admin. No real charges.');
    }
    if (cmd === 'cooking' || cmd === 'loader' || cmd === 'cookpreview') {
      previewCookingLoader();
      return;
    }
    if (cmd === 'stats') { refresh(); return say('Reloading…'); }
    if (cmd === 'log') {
      section = 'activity'; renderPanel();
      return say('Opening Activity…');
    }
    if (cmd === 'find') {
      section = 'accounts'; renderPanel();
      var q = W.$('#ap-q', root); if (q) q.value = rest;
      search(); return say('Searching for "' + rest + '"…');
    }
    if (cmd === 'who') {
      return say(picked
        ? picked.display_name + '  <' + (picked.email || 'no email') + '>  ' +
          num(picked.diamonds) + ' diamonds, level ' + num(picked.level) +
          (picked.staff ? ', staff' : '')
        : 'Nothing selected.');
    }
    if (cmd === 'take')  return isNaN(n) ? say(bad) : gems({ delta: -Math.abs(n) }, 'took ' + Math.abs(n));
    if (cmd === 'give')  return isNaN(n) ? say(bad) : gems({ delta:  Math.abs(n) }, 'gave ' + Math.abs(n));
    if (cmd === 'set')   return isNaN(n) ? say(bad) : gems({ set: Math.max(0, n) }, 'set to ' + Math.max(0, n));
    if (cmd === 'empty') return gems({ set: 0 }, 'emptied');
    if (cmd === 'override') {
      var parts = bits.slice();
      if (parts[0] && parts[0].toLowerCase() === 'set') parts.shift();
      var raw = parts.join('').replace(/,/g, '');
      var amt = raw === '' ? NaN : Number(raw);
      if (!Number.isSafeInteger(amt) || amt < 0) {
        return say('override set <n> takes a whole number from 0 to ' + num(MAX_SAFE) + '.');
      }
      return overrideGems(amt);
    }
    if (cmd === 'msg' || cmd === 'message') {
      if (!rest) return say('What should it say? Try "msg Great work this week!"');
      return sendMessage(rest, null);
    }
    if (cmd === 'staff') {
      if (rest !== 'on' && rest !== 'off') return say('Say "staff on" or "staff off".');
      return setStaff(rest === 'on');
    }
    if (cmd === 'allow' || cmd === 'unallow') {
      if (!can('allow')) return say('Allowlist commands are not granted to you.');
      if (!rest) return say('Which address? Try "allow someone@example.com".');
      return ops().allow(rest, cmd === 'allow').then(function (r) {
        guard(r, function () {
          say(rest + (cmd === 'allow' ? ' now has admin access' : ' no longer has admin access'));
          refresh();
        });
      });
    }
    say('No command called "' + cmd + '". Type help.');
  }

  /* ============================== bulk ============================
     One existing AdminOps call per account. A failure is recorded and
     the loop keeps going. Destructive kinds leave the signed-in admin
     out unless the confirm dialog opts them back in. Everyone in the
     current search has to be confirmed by typing CONFIRM. Other
     destructive or large batches have to be confirmed by typing the
     exact number of accounts that will be touched.
  ================================================================= */
  var BULK_PERM = {
    msg: 'messages', give: 'gems', take: 'gems', empty: 'gems',
    ban: 'ban', unban: 'ban', staffOn: 'staff', staffOff: 'staff',
    allowOn: 'allow', allowOff: 'allow',
    rename: 'moderate', wipe: 'moderate', reset: 'moderate', leave: 'moderate'
  };
  var BULK_TITLE = {
    msg: 'Message selected accounts', give: 'Give diamonds', take: 'Take diamonds',
    empty: 'Empty diamonds', ban: 'Ban selected accounts', unban: 'Lift bans',
    staffOn: 'Grant the staff effect', staffOff: 'Remove the staff effect',
    allowOn: 'Give admin access', allowOff: 'Remove admin access',
    rename: 'Rename selected accounts', wipe: 'Wipe arcade scores',
    reset: 'Reset progress', leave: 'Remove from every class'
  };
  var BULK_GO = {
    msg: 'Send to', give: 'Give diamonds to', take: 'Take diamonds from',
    empty: 'Empty diamonds on', ban: 'Ban', unban: 'Lift bans on',
    staffOn: 'Grant staff to', staffOff: 'Remove staff from',
    allowOn: 'Give admin access to', allowOff: 'Remove admin access from',
    rename: 'Rename', wipe: 'Wipe scores for', reset: 'Reset', leave: 'Remove'
  };

  function myAccountId() {
    var u = global.Cloud && global.Cloud.user;
    return (u && u.id) || '';
  }

  function excludeSelfKind(kind) {
    return kind === 'take' || kind === 'empty' || kind === 'ban' ||
      kind === 'staffOff' || kind === 'allowOff' || kind === 'rename' ||
      kind === 'wipe' || kind === 'reset' || kind === 'leave';
  }

  function sensitiveKind(kind) {
    return excludeSelfKind(kind) || kind === 'unban';
  }

  function listHasMe(list) {
    var mine = myAccountId();
    if (!mine) return false;
    for (var i = 0; i < list.length; i++) if (list[i].id === mine) return true;
    return false;
  }

  function affectedList(list, exclude) {
    if (!exclude) return list.slice();
    var mine = myAccountId();
    var out = [];
    for (var i = 0; i < list.length; i++) if (list[i].id !== mine) out.push(list[i]);
    return out;
  }

  function neededPhrase(kind, n, coversAll) {
    if (coversAll) return 'CONFIRM';
    if (sensitiveKind(kind) || n >= BULK_LARGE) return String(n);
    return '';
  }

  function affectLine(kind, n) {
    var word = n + (n === 1 ? ' account' : ' accounts');
    if (kind === 'msg') return 'This sends one message to ' + word + '.';
    if (kind === 'give') return 'This gives diamonds to ' + word + '.';
    if (kind === 'take') return 'This takes diamonds from ' + word + '.';
    if (kind === 'empty') return 'This sets the diamond balance to 0 on ' + word + '.';
    if (kind === 'ban') return 'This bans ' + word + '.';
    if (kind === 'unban') return 'This lifts the ban on ' + word + '.';
    if (kind === 'staffOn') return 'This grants the staff effect to ' + word + '.';
    if (kind === 'staffOff') return 'This removes the staff effect from ' + word + '.';
    if (kind === 'allowOn') return 'This gives admin access to ' + word + '.';
    if (kind === 'allowOff') return 'This removes admin access from ' + word + '.';
    if (kind === 'rename') return 'This renames ' + word + '.';
    if (kind === 'wipe') return 'This wipes arcade scores for ' + word + '.';
    if (kind === 'reset') return 'This resets progress on ' + word + '.';
    if (kind === 'leave') return 'This removes ' + word + ' from every class.';
    return 'This applies to ' + word + '.';
  }

  function previewNames(list) {
    var names = [];
    var i;
    for (i = 0; i < list.length && i < 4; i++) {
      names.push(list[i].display_name || list[i].email || 'Account');
    }
    var s = names.join(', ');
    if (list.length > names.length) s += ', and ' + (list.length - names.length) + ' more';
    return s;
  }

  function accountWord(n) {
    return n + (n === 1 ? ' account' : ' accounts');
  }

  function startBulk(kind) {
    if (bulkBusy) return;
    var perm = BULK_PERM[kind];
    if (!perm || !can(perm)) return say('That command is not granted to you.');
    var targets = tickedAccounts();
    if (!targets.length) return say('Select at least one account first.');
    openBulk(kind, targets);
  }

  function readBulkFields(kind, modalRoot) {
    if (kind === 'msg') {
      var box = W.$('#ap-bulk-text', modalRoot);
      var text = String(box && box.value || '').trim();
      if (!text) return { error: 'Type a message first.' };
      if (text.length > MSG_MAX) return { error: 'A message is at most ' + MSG_MAX + ' characters.' };
      return { fields: { text: text } };
    }
    if (kind === 'give' || kind === 'take') {
      var amt = W.$('#ap-bulk-amount', modalRoot);
      var raw = String(amt && amt.value || '').replace(/,/g, '').trim();
      var n = raw === '' ? NaN : Number(raw);
      if (!Number.isInteger(n) || n <= 0) return { error: 'Enter a whole number of diamonds.' };
      if (n > MAX_STEP) return { error: 'At most ' + num(MAX_STEP) + ' at a time.' };
      return { fields: { amount: n } };
    }
    if (kind === 'rename') {
      var name = W.$('#ap-bulk-name', modalRoot);
      return { fields: { name: name ? name.value : '' } };
    }
    if (kind === 'ban') {
      var why = W.$('#ap-bulk-why', modalRoot);
      return { fields: { why: why ? why.value : '' } };
    }
    return { fields: {} };
  }

  function bulkAmountNote(kind, fields) {
    if (!fields || typeof fields.amount !== 'number') return '';
    if (kind === 'give') return ' Each account is given ' + num(fields.amount) + ' diamonds.';
    if (kind === 'take') return ' Each account loses ' + num(fields.amount) + ' diamonds.';
    return '';
  }

  function openBulk(kind, targets) {
    if (!global.UI || !global.UI.modal) {
      W.toast('Not loaded', 'The confirm dialog is not available.', I.info, 3200);
      return;
    }
    var coversAll = targets.length === rows.length && rows.length > 0;
    var offerSelf = excludeSelfKind(kind) && listHasMe(targets);
    var phase = 'edit';
    var fieldsHtml = '';
    if (kind === 'msg') {
      fieldsHtml =
        '<textarea class="input" id="ap-bulk-text" rows="3" maxlength="' + MSG_MAX + '" ' +
          'placeholder="Shows up on each of their screens, from a LearnGeo administrator"></textarea>' +
        '<div class="t-sm t-muted" id="ap-bulk-text-count">0 / ' + MSG_MAX + '</div>';
    } else if (kind === 'give' || kind === 'take') {
      fieldsHtml =
        '<div class="field"><label class="field__label" for="ap-bulk-amount">' +
          (kind === 'give' ? 'Diamonds to give each account' : 'Diamonds to take from each account') +
        '</label><input class="input mono" id="ap-bulk-amount" inputmode="numeric" autocomplete="off"></div>';
    } else if (kind === 'rename') {
      fieldsHtml =
        '<div class="field"><label class="field__label" for="ap-bulk-name">Display name for every selected account</label>' +
          '<input class="input" id="ap-bulk-name" maxlength="40" autocomplete="off">' +
          '<div class="field__hint">Leave it empty to put them back to Explorer.</div></div>';
    }
    if (kind === 'ban') {
      fieldsHtml +=
        '<div class="field" style="margin-top:10px"><label class="field__label" for="ap-bulk-why">Reason, shown to them</label>' +
          '<input class="input" id="ap-bulk-why" maxlength="300" placeholder="e.g. Cheating on the arcade boards"></div>';
    }
    var selfHtml = offerSelf
      ? '<label class="adminp__self"><input type="checkbox" id="ap-bulk-self"> Include my account (' +
          esc(meProfile().email || 'this signed-in admin') + ')</label>'
      : '';
    var showPhrase = coversAll || sensitiveKind(kind) || targets.length >= BULK_LARGE;
    var phraseHtml = showPhrase
      ? '<label class="field__label" id="ap-bulk-phrase-label" for="ap-bulk-phrase"></label>' +
        '<input class="input mono" id="ap-bulk-phrase" autocomplete="off" spellcheck="false">'
      : '';

    function excludeNow(modalRoot) {
      if (!offerSelf) return false;
      var box = W.$('#ap-bulk-self', modalRoot);
      return !(box && box.checked);
    }

    function paintConfirm(modalRoot) {
      var list = affectedList(targets, excludeNow(modalRoot));
      var n = list.length;
      var parsed = readBulkFields(kind, modalRoot);
      var phrase = neededPhrase(kind, n, coversAll);
      var lead = W.$('#ap-bulk-lead', modalRoot);
      var sentence = n === 0
        ? 'Your account is left out, so this affects 0 accounts.'
        : affectLine(kind, n) + (parsed.fields ? bulkAmountNote(kind, parsed.fields) : '');
      if (n > 0 && coversAll) {
        sentence += ' This is everyone in the current search (' + rows.length +
          (rows.length === 1 ? ' account).' : ' accounts).');
      }
      if (n > 0 && excludeNow(modalRoot)) sentence += ' Your account is left out.';
      if (lead) {
        lead.textContent = sentence;
        lead.setAttribute('data-affected', String(n));
        lead.setAttribute('data-phrase', phrase);
      }
      var who = W.$('#ap-bulk-who', modalRoot);
      if (who) who.textContent = n ? previewNames(list) : '';
      var lab = W.$('#ap-bulk-phrase-label', modalRoot);
      var input = W.$('#ap-bulk-phrase', modalRoot);
      if (lab) {
        lab.innerHTML = phrase ? ('Type <b>' + esc(phrase) + '</b> to confirm.') : '';
        lab.hidden = !phrase;
      }
      if (input) {
        input.hidden = !phrase;
        input.dataset.need = phrase;
      }
      var go = W.$('#ap-bulk-go', modalRoot);
      if (go && phase === 'edit') {
        go.textContent = n === 0 ? 'Nothing to apply' : (BULK_GO[kind] + ' ' + accountWord(n));
        go.disabled = n === 0;
      }
    }

    function setModalBody(modalRoot, html) {
      var body = modalRoot.querySelector('.modal__body');
      if (body) body.innerHTML = html;
    }

    global.UI.modal({
      title: BULK_TITLE[kind] || 'Bulk action',
      icon: I.info,
      wide: true,
      body:
        fieldsHtml +
        '<p id="ap-bulk-lead"></p>' +
        '<p class="t-sm t-muted" id="ap-bulk-who"></p>' +
        selfHtml + phraseHtml +
        '<p class="t-sm" id="ap-bulk-err"></p>',
      actions: [
        { label: 'Cancel', cls: 'btn--ghost', close: true, onClick: function () {
            if (phase === 'run') return false;
          } },
        { label: 'Continue', cls: 'btn--primary', close: true, onClick: function (modalRoot) {
            if (phase === 'done') return;
            if (phase === 'run' || bulkBusy) return false;
            var parsed = readBulkFields(kind, modalRoot);
            if (parsed.error) {
              var err = W.$('#ap-bulk-err', modalRoot);
              if (err) err.textContent = parsed.error;
              return false;
            }
            var list = affectedList(targets, excludeNow(modalRoot));
            if (!list.length) {
              var none = W.$('#ap-bulk-err', modalRoot);
              if (none) none.textContent = 'Your account is left out, so there is nobody to apply this to.';
              return false;
            }
            var phrase = neededPhrase(kind, list.length, coversAll);
            if (phrase) {
              var typed = W.$('#ap-bulk-phrase', modalRoot);
              var got = String(typed && typed.value || '').trim();
              if (got !== phrase) {
                var bad = W.$('#ap-bulk-err', modalRoot);
                if (bad) bad.textContent = 'Type ' + phrase + ' to confirm.';
                return false;
              }
            }
            phase = 'run';
            bulkBusy = true;
            var gen = bulkGen;
            var go = W.$('#ap-bulk-go', modalRoot);
            var cancel = W.$('#ap-bulk-cancel', modalRoot);
            if (go) { go.disabled = true; go.textContent = 'Working…'; }
            if (cancel) cancel.disabled = true;
            var x = modalRoot.querySelector('[data-close]');
            if (x) x.disabled = true;
            var ov = modalRoot.parentElement;
            if (ov) ov.dataset.locked = '1';
            if (root) renderRows();
            paintProgress(modalRoot, 0, list.length, list[0]);
            runBulk(kind, list, parsed.fields, function (done, total, account) {
              if (gen !== bulkGen || !modalRoot.isConnected) return;
              paintProgress(modalRoot, done, total, account);
            }).then(function (results) {
              if (gen === bulkGen) bulkBusy = false;
              if (gen !== bulkGen) return;
              if (root) {
                renderRows();
                if (picked && section === 'accounts') renderPicked();
                refreshLog();
                noteSession(results);
              }
              if (!modalRoot.isConnected) {
                if (root) W.toast('Bulk action finished', summaryLine(results), I.check, 4200);
                return;
              }
              phase = 'done';
              setModalBody(modalRoot, summaryHtml(results));
              if (ov) delete ov.dataset.locked;
              if (x) x.disabled = false;
              if (cancel) cancel.hidden = true;
              if (go) { go.disabled = false; go.textContent = 'Close'; }
            });
            return false;
          } }
      ],
      onMount: function (modalRoot) {
        var go = modalRoot.querySelector('[data-act="1"]');
        var cancel = modalRoot.querySelector('[data-act="0"]');
        if (go) go.id = 'ap-bulk-go';
        if (cancel) cancel.id = 'ap-bulk-cancel';
        paintConfirm(modalRoot);
        var self = W.$('#ap-bulk-self', modalRoot);
        if (self) self.addEventListener('change', function () { paintConfirm(modalRoot); });
        var amount = W.$('#ap-bulk-amount', modalRoot);
        if (amount) amount.addEventListener('input', function () { paintConfirm(modalRoot); });
        var text = W.$('#ap-bulk-text', modalRoot);
        if (text) text.addEventListener('input', function () {
          var c = W.$('#ap-bulk-text-count', modalRoot);
          if (c) c.textContent = text.value.length + ' / ' + MSG_MAX;
          var err = W.$('#ap-bulk-err', modalRoot);
          if (err) err.textContent = '';
        });
        var phrase = W.$('#ap-bulk-phrase', modalRoot);
        if (phrase) phrase.addEventListener('input', function () {
          var err = W.$('#ap-bulk-err', modalRoot);
          if (err) err.textContent = '';
        });
        var focus = W.$('#ap-bulk-text', modalRoot) || W.$('#ap-bulk-amount', modalRoot) ||
          W.$('#ap-bulk-name', modalRoot) || W.$('#ap-bulk-why', modalRoot) || W.$('#ap-bulk-phrase', modalRoot);
        if (focus) setTimeout(function () { focus.focus(); }, 60);
      }
    });
  }

  function paintProgress(modalRoot, done, total, account) {
    var body = modalRoot.querySelector('.modal__body');
    if (!body) return;
    var pct = total ? Math.round(done / total * 100) : 0;
    var who = account && done < total ? (account.display_name || account.email || 'account') : '';
    body.innerHTML =
      '<div data-bulk-state="run" data-bulk-progress="' + done + '/' + total + '">' +
        '<p><b>Working… ' + done + ' of ' + total + '</b></p>' +
        (who ? '<p class="t-sm t-muted">' + esc(who) + '</p>' : '') +
        '<div class="adminp__bartrack" role="progressbar" aria-valuemin="0" aria-valuemax="' + total +
          '" aria-valuenow="' + done + '"><i style="width:' + pct + '%"></i></div>' +
      '</div>';
  }

  function summaryLine(results) {
    var ok = 0, bad = 0, i;
    for (i = 0; i < results.length; i++) { if (results[i].ok) ok++; else bad++; }
    return ok + ' succeeded, ' + bad + ' failed.';
  }

  function summaryHtml(results) {
    var ok = 0, bad = 0, i, r, name, items = '';
    for (i = 0; i < results.length; i++) {
      r = results[i];
      if (r.ok) ok++; else bad++;
      name = r.account.display_name || r.account.email || r.account.id;
      items += '<li data-bulk-result="' + (r.ok ? 'ok' : 'fail') + '" data-id="' + esc(r.account.id) + '">' +
        '<b>' + esc(name) + '</b> — ' + esc(r.message) + '</li>';
    }
    return '<div data-bulk-state="done" data-ok="' + ok + '" data-fail="' + bad + '">' +
      '<p><b>' + ok + ' succeeded, ' + bad + ' failed.</b></p>' +
      '<ul class="adminp__bulksum">' + items + '</ul></div>';
  }

  function noteSession(results) {
    var i, kind = '';
    for (i = 0; i < results.length; i++) {
      if (results[i].ok) continue;
      if (results[i].kind === 'expired' || results[i].kind === 'nomigration' || results[i].kind === 'notready') {
        kind = results[i].kind;
        break;
      }
    }
    if (kind) setBanner(kind, 'A bulk action hit a session error. The summary lists every account.');
  }

  function bulkOk(kind, data) {
    if (kind === 'msg') return 'Message sent';
    if (kind === 'give' || kind === 'take' || kind === 'empty') return 'Balance is now ' + num(data);
    if (kind === 'ban') return 'Banned';
    if (kind === 'unban') return 'Ban lifted';
    if (kind === 'staffOn' || kind === 'staffOff') return data ? 'Staff effect granted' : 'Staff effect removed';
    if (kind === 'allowOn') return 'Admin access granted';
    if (kind === 'allowOff') return 'Admin access removed';
    if (kind === 'rename') return 'Renamed to ' + (data || 'Explorer');
    if (kind === 'wipe') return data ? (data + ' score' + (data === 1 ? '' : 's') + ' wiped') : 'Nothing on the boards';
    if (kind === 'reset') return 'Progress reset';
    if (kind === 'leave') return 'Out of ' + data + ' class' + (data === 1 ? '' : 'es');
    return 'Done';
  }

  function bulkApply(kind, account, data) {
    if (kind === 'give' || kind === 'take' || kind === 'empty') {
      account.diamonds = data;
      markRow(account.id, 'diamonds', data);
    } else if (kind === 'ban') {
      account.banned = true;
      markRow(account.id, 'banned', true);
      bans[account.id] = bans[account.id] || { user_id: account.id };
    } else if (kind === 'unban') {
      account.banned = false;
      markRow(account.id, 'banned', false);
      delete bans[account.id];
    } else if (kind === 'staffOn' || kind === 'staffOff') {
      account.staff = data;
      markRow(account.id, 'staff', data);
    } else if (kind === 'rename') {
      account.display_name = data;
      markRow(account.id, 'display_name', data);
    } else if (kind === 'reset') {
      account.diamonds = 150;
      markRow(account.id, 'diamonds', 150);
    }
  }

  function bulkCall(kind, account, fields) {
    var o = ops();
    if ((kind === 'allowOn' || kind === 'allowOff') && !account.email) {
      return Promise.resolve({ ok: false, kind: 'error', message: 'That account has no email, so it cannot go on the allowlist.' });
    }
    try {
      var p;
      if (kind === 'msg') p = o.message(account.id, fields.text);
      else if (kind === 'give') p = o.gems(account.id, { delta: fields.amount, reason: 'gave ' + fields.amount });
      else if (kind === 'take') p = o.gems(account.id, { delta: -fields.amount, reason: 'took ' + fields.amount });
      else if (kind === 'empty') p = o.gems(account.id, { set: 0, reason: 'emptied' });
      else if (kind === 'ban') p = o.ban(account.id, true, fields.why || '');
      else if (kind === 'unban') p = o.ban(account.id, false, '');
      else if (kind === 'staffOn') p = o.staff(account.id, true);
      else if (kind === 'staffOff') p = o.staff(account.id, false);
      else if (kind === 'allowOn') p = o.allow(account.email, true);
      else if (kind === 'allowOff') p = o.allow(account.email, false);
      else if (kind === 'rename') p = o.rename(account.id, fields.name || '');
      else if (kind === 'wipe') p = o.wipeScores(account.id);
      else if (kind === 'reset') p = o.resetProgress(account.id);
      else if (kind === 'leave') p = o.leaveClasses(account.id);
      else return Promise.resolve({ ok: false, kind: 'error', message: 'Unknown action' });
      if (!p || !p.then) p = Promise.resolve(p);
      return p.then(function (r) {
        return r || { ok: false, kind: 'error', message: 'No response' };
      }, function (e) {
        return { ok: false, kind: 'error', message: String((e && e.message) || e) };
      });
    } catch (e) {
      return Promise.resolve({ ok: false, kind: 'error', message: String((e && e.message) || e) });
    }
  }

  function runBulk(kind, list, fields, onProgress) {
    var results = [];
    var i = 0;
    function step() {
      if (i >= list.length) return Promise.resolve(results);
      var account = list[i];
      onProgress(i, list.length, account);
      return bulkCall(kind, account, fields).then(function (r) {
        var ok = !!(r && r.ok);
        results.push({
          account: account,
          ok: ok,
          kind: r && r.kind,
          message: ok ? bulkOk(kind, r.data) : ((r && r.message) || 'Failed'),
          data: r && r.data
        });
        if (ok) bulkApply(kind, account, r.data);
        i++;
        onProgress(i, list.length, list[i]);
        return step();
      });
    }
    return step();
  }

  global.Administrator = { open: open, close: close };
})(window);
