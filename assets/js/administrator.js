/* ------------------------------------------------------------------
   LearnGeo — the Administrator page.

   Sidebar layout (deep blue, profile, section nav, Leave Admin) with
   server-backed command grants (0012). Owner
   alexjschendel@gmail.com has every command. Screen monitoring is
   owner-only. Other admins default to read-only accounts/stats/log
   until the owner grants gems / ban / messages / etc.

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
          navItem('monitor', I.monitor || I.eye, 'Screen monitoring') +
          navItem('accounts', I.users, 'Accounts') +
          navItem('gems', I.gem, 'Gems') +
          navItem('messages', I.message || I.inbox, 'Messages') +
          navItem('activity', I.list || I.chart, 'Activity') +
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
      if (d.do === 'watch')    return loadActivity(true);
      if (d.do === 'search')   return search();
      if (d.do === 'runcmd')   return runCmd();
      if (d.do === 'savegrants') return saveGrants(d.email);
      if (d.do === 'gemsonly') return saveGrants(d.email, ['gems']);
      if (d.do === 'cleargrants') return saveGrants(d.email, []);
      if (d.do === 'msg') {
        var box = W.$('#ap-msg-text', root);
        return sendMessage(box ? box.value : '', box);
      }
      if (d.do === 'subdev') return openSubscriptionDev();
    });

    root.addEventListener('keydown', function (e) {
      if (e.target && e.target.id === 'ap-q' && e.key === 'Enter') {
        e.preventDefault(); search();
      }
      if (e.target && e.target.id === 'ap-cmd' && e.key === 'Enter') {
        e.preventDefault(); runCmd();
      }
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
      if (id === 'monitor' || id === 'permissions') show = !!access.owner;
      if (id === 'gems' && !access.owner && !can('gems')) show = false;
      if (id === 'messages' && !access.owner && !can('messages')) show = false;
      nodes[i].hidden = !show;
      nodes[i].classList.toggle('is-on', show && section === id);
    }
    if ((section === 'monitor' || section === 'permissions') && !access.owner) {
      section = 'overview';
    }
    if (section === 'gems' && !can('gems')) section = 'overview';
    if (section === 'messages' && !can('messages')) section = 'overview';
  }

  var TITLES = {
    overview: 'Overview',
    monitor: 'Screen monitoring',
    accounts: 'Accounts',
    gems: 'Gems',
    messages: 'Messages',
    activity: 'Activity',
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
    else if (section === 'monitor') host.innerHTML = panelMonitor();
    else if (section === 'accounts') host.innerHTML = panelAccounts();
    else if (section === 'gems') host.innerHTML = panelGems();
    else if (section === 'messages') host.innerHTML = panelMessages();
    else if (section === 'activity') host.innerHTML = panelActivity();
    else if (section === 'permissions') host.innerHTML = panelPermissions();
    else if (section === 'commands') host.innerHTML = panelCommands();
    else if (section === 'development') host.innerHTML = panelDevelopment();
    else host.innerHTML = '';

    /* Fill dynamic bits after the shell is in the DOM. */
    if (section === 'overview') { renderStats(); renderStaff(); }
    if (section === 'monitor') loadActivity(false);
    if (section === 'accounts') {
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
    if (section === 'permissions') loadGrants();
  }

  function panelOverview() {
    var note = access.owner
      ? 'You are the owner account. Every administrator command is available, including screen monitoring and the permissions panel.'
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
      moderate: 'Moderate', classes: 'Classes', activity: 'Screen monitoring',
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

  function panelMonitor() {
    if (!access.owner) {
      return '<section class="adminp__sec"><h3>Screen monitoring</h3>' +
        '<p class="t-sm t-muted">Only the owner account can use screen monitoring.</p></section>';
    }
    return '<section class="adminp__sec">' +
      '<div class="row row--between">' +
        '<h3 style="margin:0">Who is on now</h3>' +
        '<button class="btn btn--ghost btn--sm" data-do="watch">' + I.refresh + ' Refresh</button>' +
      '</div>' +
      '<p class="t-sm t-muted">Which screen each signed-in account is on, and when they were ' +
        'last there. Screen names only — not what they type, what they answer, or anything on ' +
        'their screen.</p>' +
      '<div id="ap-activity" class="adminp__rows"></div>' +
    '</section>';
  }

  function panelAccounts() {
    return '<section class="adminp__sec">' +
      '<h3>Accounts</h3>' +
      '<p class="t-sm t-muted">Search a display name or an email. An empty box lists whoever was active most recently.</p>' +
      '<div class="adminp__search">' +
        '<input class="input" id="ap-q" type="search" placeholder="name or email" ' +
          'autocomplete="off" spellcheck="false">' +
        '<button class="btn btn--primary btn--sm" data-do="search">Search</button>' +
      '</div>' +
      '<div id="ap-rows" class="adminp__rows"></div>' +
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

  function panelPermissions() {
    return '<section class="adminp__sec">' +
      '<h3>Permissions</h3>' +
      '<p class="t-sm t-muted">Limit other admins to certain commands. Default is restricted: ' +
        'no bans, no taking gems, no destructive moderation. Screen monitoring stays owner-only ' +
        'and cannot be granted. Example: check only <b>Gems</b>, or use <b>Gems only</b>.</p>' +
      '<div id="ap-grants" class="adminp__grants">Loading…</div>' +
    '</section>';
  }

  function panelCommands() {
    return '<section class="adminp__sec">' +
      '<h3>Commands</h3>' +
      '<p class="t-sm t-muted">Type <code>help</code> for the list. A command that needs an account uses the selected one. ' +
        '<code>watch</code> refreshes screen monitoring (owner only). ' +
        '<code>plans</code> opens the TEST subscription preview.</p>' +
      '<div class="adminp__search">' +
        '<input class="input mono" id="ap-cmd" type="text" placeholder="take 500" ' +
          'autocomplete="off" spellcheck="false">' +
        '<button class="btn btn--sm" data-do="runcmd">Run</button>' +
      '</div>' +
      '<pre class="adminp__out" id="ap-out">Ready.</pre>' +
    '</section>';
  }

  function panelDevelopment() {
    return '<section class="adminp__sec">' +
      '<h3>Development</h3>' +
      '<p class="t-sm t-muted">Internal previews that must <b>not</b> appear on the public site. ' +
        'Owner <code>alexjschendel@gmail.com</code> and admins with UltraAdmin access only.</p>' +
      '<div class="adminp__warn adminp__warn--expired" style="margin-bottom:14px">' +
        '<div class="row" style="gap:10px;align-items:flex-start">' + (I.info || '') +
          '<div class="grow"><b>TEST only.</b> These tools are gated behind Administrator. ' +
            'No public nav, landing CTA, or student/teacher paywall.</div>' +
        '</div>' +
      '</div>' +
      '<div class="adminp__who" style="align-items:flex-start">' +
        '<div class="grow">' +
          '<div class="adminp__nm">' + (I.shop || I.flask || '') +
            '<span>Subscription plans (mock)</span></div>' +
          '<p class="t-sm t-muted" style="margin:6px 0 0">Full pricing page UI with Free / Pro / School, ' +
            'feature comparison, and a mock checkout. Labeled <b>TEST / Development</b>. ' +
            'No Stripe charges in v1 — see <code>assets/js/subscription-dev.js</code>.</p>' +
        '</div>' +
        '<button type="button" class="btn btn--accent btn--sm" data-do="subdev">' +
          (I.arrowR || '') + ' Open plans preview</button>' +
      '</div>' +
      '<p class="t-sm t-muted" style="margin:0">Also available from Commands: <code>plans</code> or <code>subscription</code>.</p>' +
    '</section>';
  }

  function openSubscriptionDev() {
    if (!global.SubscriptionDev || !global.SubscriptionDev.open) {
      say('subscription-dev.js did not load.');
      W.toast('Missing preview', 'subscription-dev.js did not load.', I.info, 3200);
      return;
    }
    global.SubscriptionDev.open();
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
      if (section === 'monitor') loadActivity(false);
      if (section === 'overview') renderStaff();
      if (section === 'accounts' || !rows.length) search();
      if (section === 'permissions') loadGrants();
      if (section === 'activity') o.recent(30).then(function (r) { guard(r, renderLog); });
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

  function loadActivity(loud) {
    var o = ops();
    var host = root && W.$('#ap-activity', root);
    if (!host) return;
    if (!access.owner) {
      host.innerHTML = '<div class="t-sm t-muted">Only the owner can use screen monitoring.</div>';
      return;
    }
    if (!o || !o.activity) return;
    if (loud) host.innerHTML = '<div class="t-sm t-muted">Looking…</div>';
    o.activity(15).then(function (r) {
      if (!r || !r.ok) {
        host.innerHTML = '<div class="t-sm t-muted">' +
          (r && r.kind === 'nomigration'
            ? 'This needs 0009 / 0012 on the database.'
            : r && r.kind === 'forbidden'
            ? 'Only the owner can use screen monitoring.'
            : 'Could not read who is on right now.') + '</div>';
        return;
      }
      var list = r.data || [];
      if (!list.length) {
        host.innerHTML = '<div class="t-sm t-muted">Nobody signed in has been active in the last 15 minutes.</div>';
        return;
      }
      host.innerHTML =
        '<div class="adminp__row adminp__row--watch adminp__row--head">' +
          '<span>Name</span><span>Email</span><span>On</span><span>Last seen</span>' +
        '</div>' +
        list.map(function (a) {
          return '<button type="button" class="adminp__row adminp__row--watch' +
            (picked && picked.id === a.user_id ? ' is-picked' : '') +
            '" data-pick="' + esc(a.user_id) + '">' +
            '<span class="adminp__nm">' + esc(a.display_name || 'Explorer') +
              (a.banned ? '<i class="adminp__ban" title="Banned">BANNED</i>' : '') + '</span>' +
            '<span class="t-muted">' + esc(a.email || '—') + '</span>' +
            '<span>' + esc(a.screen || '—') + '</span>' +
            '<span class="t-muted">' + esc(ago(a.seen_at)) + '</span>' +
          '</button>';
        }).join('');
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
    var q = qEl ? qEl.value : '';
    var host = root && W.$('#ap-rows', root);
    if (!host) {
      /* Searching from Commands / monitor without the accounts panel —
         still fetch so select() and who work. */
      return ops().find(q).then(function (r) {
        if (r && r.ok) {
          rows = r.data || [];
          for (var i = 0; i < rows.length; i++) rows[i].banned = !!bans[rows[i].id];
        }
      });
    }
    host.innerHTML = '<div class="adminp__empty">Searching…</div>';
    ops().find(q).then(function (r) {
      if (!r.ok) { host.innerHTML = '<div class="adminp__empty">Nothing to show.</div>'; return guard(r, function () {}); }
      if (banner === 'nomigration' || banner === 'expired' || banner === 'notready') setBanner('');
      rows = r.data || [];
      for (var i = 0; i < rows.length; i++) rows[i].banned = !!bans[rows[i].id];
      renderRows();
    });
  }

  function renderRows() {
    var host = root && W.$('#ap-rows', root);
    if (!host) return;
    if (!rows.length) {
      host.innerHTML = '<div class="adminp__empty">No account matched that.</div>';
      return;
    }
    host.innerHTML =
      '<div class="adminp__row adminp__row--head">' +
        '<span>Name</span><span>Email</span><span class="num">Level</span>' +
        '<span class="num">💎</span><span class="num">XP</span><span>Seen</span>' +
      '</div>' +
      rows.map(function (a) {
        return '<button type="button" class="adminp__row' + (picked && picked.id === a.id ? ' is-picked' : '') +
          '" data-pick="' + esc(a.id) + '">' +
          '<span class="adminp__nm">' + esc(a.display_name || 'Explorer') +
            (a.staff ? '<i class="adminp__staff" title="LearnGeo staff">STAFF</i>' : '') +
            (a.banned ? '<i class="adminp__ban" title="Banned from LearnGeo">BANNED</i>' : '') + '</span>' +
          '<span class="t-muted">' + esc(a.email || '—') + '</span>' +
          '<span class="num">' + num(a.level) + '</span>' +
          '<span class="num">' + num(a.diamonds) + '</span>' +
          '<span class="num">' + num(a.xp) + '</span>' +
          '<span class="t-muted">' + esc(ago(a.last_seen || a.seen_at)) + '</span>' +
        '</button>';
      }).join('');
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

  /* Clicking a screen-monitor row used to no-op when that account was
     not in the current search results. Resolve via find by id/email. */
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
    } else if (section === 'monitor') {
      section = 'accounts';
      renderPanel();
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
      'who                show the selected account',
      'stats              reload the numbers at the top',
      'log                reload the action list',
      'help               this',
      'plans              open TEST subscription preview (Development)',
      'subscription       same as plans'
    ];
    if (access.owner) lines.push('watch              refresh screen monitoring');
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
      return say('Opened TEST subscription preview (Development). No real charges.');
    }
    if (cmd === 'stats') { refresh(); return say('Reloading…'); }
    if (cmd === 'log') {
      section = 'activity'; renderPanel();
      return say('Opening Activity…');
    }
    if (cmd === 'watch') {
      if (!access.owner) return say('Screen monitoring is owner-only.');
      section = 'monitor'; renderPanel();
      loadActivity(true);
      return say('Refreshing screen monitoring…');
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

  global.Administrator = { open: open, close: close };
})(window);
