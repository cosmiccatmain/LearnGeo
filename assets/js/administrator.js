/* ------------------------------------------------------------------
   LearnGeo — the Administrator page.

   A full screen rather than another card inside UltraAdmin, because
   the job is different. UltraAdmin is a column of switches for THIS
   device. This reaches every account, and a search box, a results
   table and a balance editor do not fit in a 560px dialog without
   becoming unusable.

   It sits at z-index 190, deliberately BELOW .overlay at 200, so a
   confirm dialog opened from here lands on top of it rather than
   underneath. Toasts are 320 and stay above both.

   NOTHING HERE IS A PERMISSION CHECK. Every call goes through
   AdminOps to a security definer function that re-checks the session
   server side. The worst an edited copy of this file achieves is a
   nicer-looking way to be refused.

   WHEN 0007 HAS NOT BEEN RUN

   Which is true the moment this ships. Every call answers
   kind:'nomigration' and the page says so, once, at the top, in
   words that name the file to run. It does not disable itself and it
   does not pretend to work: a dead console that explains itself is
   worth more than a grey one that does not.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons;

  var root = null;          /* the page element, or null when closed */
  var rows = [];            /* last search result */
  var picked = null;        /* the selected account row */
  var stats = null;
  var banner = '';          /* a sticky problem, shown until it changes */

  /* Never answers undefined. Every caller below would otherwise need
     its own null check, and the one that forgot would throw inside a
     click handler and leave the page looking merely unresponsive. */
  var DEAD = {
    live: function () { return false; },
    minutesLeft: function () { return 0; },
    connect: no, disconnect: function () {},
    stats: no, find: no, recent: no, gems: no, staff: no, allowList: no, allow: no, message: no, override: no
  };
  function no() {
    return Promise.resolve({ ok: false, kind: 'error', message: 'admin-ops.js did not load.' });
  }
  function ops() { return global.AdminOps || DEAD; }
  function esc(s) { return W.escapeHtml(String(s == null ? '' : s)); }
  /* Same bounds as admin.js, admin-inbox.js and 0007. */
  var CAP = 2000000000, MAX_STEP = 1000000000;
  var MAX_SAFE = 9007199254740991;   /* the most override can set: the largest whole number a browser holds exactly */
  var MSG_MAX = 500;        /* the server refuses longer; 0008, ultra_send_message */

  /* Past 2^53 a number written out in full is partly invented: 1.35e36
     prints as 1,350,000,000,000,000,800,000,… where the 8 is floating-
     point residue, not a diamond. Those are shown as a power of ten.
     Everything up to MAX_SAFE is exact and is shown in full, because
     override can set it and the admin should see the figure they set. */
  var SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
  function num(n) {
    var v = Number(n) || 0;
    if (Math.abs(v) <= MAX_SAFE) return v.toLocaleString();     /* exact, so shown in full */
    var parts = v.toExponential(2).split('e');
    var exp = String(Math.abs(+parts[1])).replace(/[0-9]/g, function (d) { return SUP[+d]; });
    return parts[0] + ' × 10' + (+parts[1] < 0 ? '⁻' : '') + exp;
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
    document.body.classList.remove('no-scroll');
  }

  /* ============================== shell ============================ */
  function build() {
    root = W.el('div', 'adminp');
    root.innerHTML =
      '<div class="adminp__bar">' +
        '<div class="adminp__title">' + I.shield + '<b>Administrator</b>' +
          '<span class="adminp__pill" id="ap-session">checking…</span></div>' +
        '<div class="grow"></div>' +
        '<button class="btn btn--ghost btn--sm" id="ap-refresh">' + I.refresh + ' Refresh</button>' +
        '<button class="icon-btn" id="ap-close">' + I.close + '</button>' +
      '</div>' +
      '<div class="adminp__scroll">' +
        '<div id="ap-banner"></div>' +
        '<div class="adminp__grid" id="ap-stats"></div>' +

        '<section class="adminp__sec">' +
          '<h3>Accounts</h3>' +
          '<p class="t-sm t-muted">Search a display name or an email. An empty box lists whoever was active most recently.</p>' +
          '<div class="adminp__search">' +
            '<input class="input" id="ap-q" type="search" placeholder="name or email" ' +
              'autocomplete="off" spellcheck="false">' +
            '<button class="btn btn--primary btn--sm" id="ap-go">Search</button>' +
          '</div>' +
          '<div id="ap-rows" class="adminp__rows"></div>' +
        '</section>' +

        '<section class="adminp__sec" id="ap-picked-sec" hidden>' +
          '<h3>Selected account</h3>' +
          '<div id="ap-picked"></div>' +
        '</section>' +

        '<section class="adminp__sec">' +
          '<h3>Commands</h3>' +
          '<p class="t-sm t-muted">Type <code>help</code> for the list. A command that needs an account uses the selected one.</p>' +
          '<div class="adminp__search">' +
            '<input class="input mono" id="ap-cmd" type="text" placeholder="take 500" ' +
              'autocomplete="off" spellcheck="false">' +
            '<button class="btn btn--sm" id="ap-run">Run</button>' +
          '</div>' +
          '<pre class="adminp__out" id="ap-out">Ready.</pre>' +
        '</section>' +

        '<section class="adminp__sec">' +
          '<h3>LearnGeo staff</h3>' +
          '<p class="t-sm t-muted">The staff profile effect is the one cosmetic with no price. ' +
            'It cannot be bought at any balance and the shop refuses to sell it; it is on an account ' +
            'because somebody on this page put it there.</p>' +
          '<div id="ap-staff"></div>' +
        '</section>' +

        '<section class="adminp__sec">' +
          '<h3>Recent admin actions</h3>' +
          '<p class="t-sm t-muted">Everything any admin has done to anybody else. Written by the server, ' +
            'not by this browser, and nothing can edit a line once it is here.</p>' +
          '<div id="ap-log" class="adminp__rows"></div>' +
        '</section>' +
      '</div>';

    document.body.appendChild(root);
    document.body.classList.add('no-scroll');
    wire();
  }

  /* ============================== wiring =========================== */
  function wire() {
    W.$('#ap-close', root).addEventListener('click', close);
    W.$('#ap-refresh', root).addEventListener('click', refresh);

    W.$('#ap-go', root).addEventListener('click', search);
    W.$('#ap-q', root).addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); search(); }
    });

    W.$('#ap-run', root).addEventListener('click', runCmd);
    W.$('#ap-cmd', root).addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); runCmd(); }
    });

    /* One delegated handler for the whole page. The rows and the
       buttons inside them are rebuilt constantly, and rebinding after
       every render is how a dead button happens. */
    root.addEventListener('click', function (e) {
      var pick = e.target.closest('[data-pick]');
      if (pick) return select(pick.dataset.pick);

      var act = e.target.closest('[data-do]');
      if (!act) return;
      var d = act.dataset;
      if (d.do === 'gems')  return gems(d.delta ? { delta: +d.delta } : { set: +d.set }, d.label || '');
      if (d.do === 'staff') return setStaff(d.on === '1');
      if (d.do === 'allow') return setAllow(d.on === '1');
      if (d.do === 'selfstaff') return selfStaff(d.on === '1');
      if (d.do === 'msg') {
        var box = W.$('#ap-msg-text', root);
        return sendMessage(box ? box.value : '', box);
      }
    });

    /* The counter under the message box. Delegated for the same reason
       the clicks are: the box is rebuilt every time an account is
       picked. */
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

  /* ========================= server round trips ==================== */
  /* Everything funnels through here so one failure is described once
     and a stale "Loading…" can never be left on screen. */
  function guard(res, after) {
    /* A success clears only the problems a success disproves: a missing
       migration, a lost session, being signed out. It does NOT clear a
       real error from a different call. refresh() fires three calls at
       once, and the search answering fine after the stats failed used
       to wipe the stats' error off the screen, leaving a row of dashes
       with no explanation. */
    if (res && res.ok) {
      if (banner === 'nomigration' || banner === 'expired' || banner === 'notready') setBanner('');
      return after(res.data);
    }
    var kind = (res && res.kind) || 'error';
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
        'in the SQL editor. Until then this page can show its own layout and nothing else: every account ' +
        'it would read lives behind functions that do not exist yet.</p>'
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

    o.stats().then(function (r) {
      guard(r, function (d) { stats = d; renderStats(); });
      if (!r.ok) renderStats();
    });
    o.recent(15).then(function (r) { guard(r, renderLog); });
    renderStaff();
    search();
  }

  function sessionPill() {
    var el = root && W.$('#ap-session', root);
    if (!el) return;
    var o = ops();
    var mins = o ? o.minutesLeft() : 0;
    el.textContent = (o && o.live()) ? mins + ' min left' : 'no session';
    el.className = 'adminp__pill' + ((o && o.live()) ? ' is-live' : '');
  }

  /* ============================== stats ============================ */
  var TILES = [
    ['accounts',  'Accounts',        'Every profile row on the server.'],
    ['active24',  'Active today',    'Profiles whose save changed in the last 24 hours.'],
    ['active7',   'Active this week','Profiles whose save changed in the last 7 days.'],
    ['students',  'Students',        'role = student.'],
    ['teachers',  'Teachers',        'role = teacher.'],
    ['classes',   'Classes',         'Every class row. Production has no archived flag on a class.'],
    ['members',   'Class seats',     'Every class_members row. Production has no status column, so pending and joined are not told apart.'],
    ['diamonds',  'Diamonds in play','Every balance added together.'],
    ['allowed',   'Admin list',      'Accounts that may open the admin panels, with the code or their Private Password.'],
    ['staff',     'Staff marks',     'Accounts holding the staff cosmetic.'],
    ['grants24',  'Self-grants 24h', 'Gems-panel grants logged in the last day.'],
    ['actions24', 'Admin actions 24h','Cross-account actions in the last day.']
  ];

  function renderStats() {
    var host = W.$('#ap-stats', root);
    if (!host) return;
    host.innerHTML = TILES.map(function (t) {
      var v = stats && stats[t[0]] != null ? num(stats[t[0]]) : '—';
      return '<div class="adminp__tile" title="' + esc(t[2]) + '">' +
        '<b>' + esc(v) + '</b><span>' + esc(t[1]) + '</span></div>';
    }).join('');
  }

  /* ============================= accounts ========================== */
  function search() {
    var q = root ? W.$('#ap-q', root).value : '';
    var host = W.$('#ap-rows', root);
    host.innerHTML = '<div class="adminp__empty">Searching…</div>';
    ops().find(q).then(function (r) {
      if (!root) return;
      if (!r.ok) { host.innerHTML = '<div class="adminp__empty">Nothing to show.</div>'; return guard(r, function () {}); }
      if (banner === 'nomigration' || banner === 'expired' || banner === 'notready') setBanner('');
      rows = r.data || [];
      renderRows();
    });
  }

  function renderRows() {
    var host = W.$('#ap-rows', root);
    if (!rows.length) {
      host.innerHTML = '<div class="adminp__empty">No account matched that.</div>';
      return;
    }
    host.innerHTML =
      '<div class="adminp__row adminp__row--head">' +
        '<span>Name</span><span>Email</span><span>Role</span>' +
        '<span class="num">Level</span><span class="num">Diamonds</span><span>Last seen</span>' +
      '</div>' +
      rows.map(function (a) {
        return '<button class="adminp__row' + (picked && picked.id === a.id ? ' is-picked' : '') +
          '" data-pick="' + esc(a.id) + '">' +
          '<span class="adminp__nm">' + esc(a.display_name || 'Explorer') +
            (a.staff ? '<i class="adminp__staff" title="LearnGeo staff">STAFF</i>' : '') + '</span>' +
          '<span class="t-muted">' + esc(a.email || '—') + '</span>' +
          '<span>' + esc(a.role || '—') + '</span>' +
          '<span class="num mono">' + num(a.level) + '</span>' +
          '<span class="num mono">' + num(a.diamonds) + '</span>' +
          '<span class="t-muted">' + esc(ago(a.updated_at)) + '</span>' +
        '</button>';
      }).join('');
  }

  function ago(ts) {
    var t = Date.parse(ts);
    if (!t) return '—';
    var m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + 'm ago';
    var h = Math.round(m / 60);
    if (h < 24) return h + 'h ago';
    return Math.round(h / 24) + 'd ago';
  }

  function select(id) {
    picked = null;
    for (var i = 0; i < rows.length; i++) { if (rows[i].id === id) picked = rows[i]; }
    renderRows();
    renderPicked();
  }

  var TAKE = [100, 500, 1000, 5000];

  function renderPicked() {
    var sec = W.$('#ap-picked-sec', root), host = W.$('#ap-picked', root);
    if (!picked) { sec.hidden = true; host.innerHTML = ''; return; }
    sec.hidden = false;

    host.innerHTML =
      '<div class="adminp__who">' +
        '<div><b>' + esc(picked.display_name || 'Explorer') + '</b>' +
          '<div class="t-sm t-muted">' + esc(picked.email || 'no email on this account') + '</div></div>' +
        '<div class="grow"></div>' +
        '<div class="adminp__bal"><b class="mono">' + num(picked.diamonds) + '</b><span>diamonds</span></div>' +
      '</div>' +

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
      '</div>' +

      '<div class="adminp__act">' +
        '<span class="eyebrow">Marks</span>' +
        '<button class="btn btn--sm" data-do="staff" data-on="' + (picked.staff ? '0' : '1') + '">' +
          (picked.staff ? 'Remove staff effect' : 'Grant staff effect') + '</button>' +
        '<button class="btn btn--sm" data-do="allow" data-on="1">Give admin access</button>' +
        '<button class="btn btn--sm" data-do="allow" data-on="0">Remove admin access</button>' +
      '</div>' +

      (Number(picked.diamonds) > MAX_SAFE
        ? '<div class="adminp__warn adminp__warn--nomigration" style="margin:4px 0 12px"><b>Too large to count.</b> ' +
          '<div class="t-sm" style="margin-top:2px">This balance is past what a browser can hold as a whole ' +
          'number, so it came from the old unbounded box, not from playing. Any button here brings it to ' +
          num(CAP) + ' first, or use <code>set</code> or <code>override set</code> below for an exact figure.</div></div>'
        : Number(picked.diamonds) > CAP
        ? '<div class="adminp__warn adminp__warn--expired" style="margin:4px 0 12px"><b>Above the cap, set with override.</b> ' +
          '<div class="t-sm" style="margin-top:2px">Take and Empty work as normal. Give cannot raise it any ' +
          'further; use <code>override set</code> for that.</div></div>'
        : '') +
      '<p class="t-sm t-muted" style="margin:10px 0 0">A balance or staff change reaches their app within about ' +
      'two minutes if it is open, and the moment it next opens if not. A take is applied to whatever ' +
      'balance their device actually has, so diamonds they earned since their last sync are not wiped.</p>' +

      '<div class="adminp__msg">' +
        '<span class="eyebrow">Message</span>' +
        '<textarea class="input" id="ap-msg-text" rows="3" maxlength="' + MSG_MAX + '" ' +
          'placeholder="Shows up on their screen, from a LearnGeo administrator"></textarea>' +
        '<div class="adminp__msgfoot">' +
          '<span class="t-sm t-muted" id="ap-msg-count">0 / ' + MSG_MAX + '</span>' +
          '<button class="btn btn--primary btn--sm" data-do="msg">Send message</button>' +
        '</div>' +
      '</div>';
  }

  /* =========================== the actions ========================= */
  function needPicked() {
    if (picked) return true;
    say('No account selected. Search for one and click its row first.');
    return false;
  }

  function gems(opts, label) {
    if (!needPicked()) return;
    var o = ops();
    o.gems(picked.id, { delta: opts.delta, set: opts.set, reason: label }).then(function (r) {
      guard(r, function (left) {
        var was = picked.diamonds;
        picked.diamonds = left;
        for (var i = 0; i < rows.length; i++) { if (rows[i].id === picked.id) rows[i].diamonds = left; }
        renderRows(); renderPicked();
        say(esc(picked.display_name) + ': ' + num(was) + ' → ' + num(left) +
            ' (' + (left - was >= 0 ? '+' : '') + num(left - was) + ')');
        W.toast('Balance changed', (picked.display_name || 'That account') + ' now has ' + num(left) + ' 💎',
          I.gem, 3600);
        ops().recent(15).then(function (x) { guard(x, renderLog); });
      });
    });
  }

  function overrideGems(amount) {
    if (!needPicked()) return;
    var who = picked;
    ops().override(who.id, amount, 'override to ' + amount).then(function (r) {
      guard(r, function (left) {
        var was = who.diamonds;
        left = Number(left);
        who.diamonds = left;
        for (var i = 0; i < rows.length; i++) { if (rows[i].id === who.id) rows[i].diamonds = left; }
        renderRows(); renderPicked();
        say((who.display_name || 'That account') + ': ' + num(was) + ' → ' + num(left) + ' (override)');
        W.toast('Balance overridden', (who.display_name || 'That account') + ' now has ' + num(left) + ' 💎',
          I.gem, 3600);
        ops().recent(15).then(function (x) { guard(x, renderLog); });
      });
    });
  }

  function setStaff(on) {
    if (!needPicked()) return;
    ops().staff(picked.id, on).then(function (r) {
      guard(r, function (now) {
        picked.staff = now;
        for (var i = 0; i < rows.length; i++) { if (rows[i].id === picked.id) rows[i].staff = now; }
        renderRows(); renderPicked();
        say(esc(picked.display_name) + ': staff effect ' + (now ? 'granted' : 'removed'));
        ops().recent(15).then(function (x) { guard(x, renderLog); });
      });
    });
  }

  /* Sends to the selected account. The text is checked here only so a
     mistake is caught before a round trip; the server checks it again
     and its answer is the one that counts. */
  function sendMessage(text, box) {
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
        say('Message sent to ' + (who.display_name || who.email || 'that account') +
            '. It appears on their screen within about 30 seconds if their app is open, ' +
            'otherwise the next time it opens.');
        W.toast('Message sent', (who.display_name || 'That account') + ' will see it on their screen.', I.check, 3600);
        ops().recent(15).then(function (x) { guard(x, renderLog); });
      });
    });
  }

  function setAllow(on) {
    if (!needPicked()) return;
    if (!picked.email) return say('That account has no email, so it cannot go on the allowlist.');
    ops().allow(picked.email, on).then(function (r) {
      guard(r, function () {
        say(picked.email + (on ? ' now has admin access' : ' no longer has admin access'));
        ops().recent(15).then(function (x) { guard(x, renderLog); });
        ops().stats().then(function (x) { guard(x, function (d) { stats = d; renderStats(); }); });
      });
    });
  }

  /* ============================ the log ============================ */
  function trim(s, n) {
    s = String(s || '');
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }

  function renderLog(list) {
    var host = W.$('#ap-log', root);
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
        : a.action === 'message' ? 'message: “' + esc(trim(d.text, 80)) + '”'
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

  /* =========================== staff, on me ======================== */
  function hasStaff() {
    return !!(W.state.flags && W.state.flags.staff);
  }

  function selfStaff(on) {
    if (!W.state.flags || typeof W.state.flags !== 'object') W.state.flags = {};
    W.state.flags.staff = !!on;
    W.saveNow();
    if (global.Cloud && global.Cloud.push) { try { global.Cloud.push(); } catch (e) {} }
    /* The shop reads the flag live, but anything already on screen was
       drawn before it changed. */
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
      '</div>' +
      '<p class="t-sm t-muted" style="margin:10px 0 0">Granting it to somebody else is the ' +
      '<b>Grant staff effect</b> button on a selected account above. This one is your own device, ' +
      'and it takes effect immediately rather than on a reload.</p>';
  }

  /* ============================ commands =========================== */
  var HELP = [
    'find <text>        search names and emails',
    'take <n>           take n diamonds from the selected account',
    'give <n>           give n diamonds',
    'set <n>            set the balance to exactly n',
    'empty              set the balance to 0',
    'staff on|off       grant or remove the staff effect',
    'msg <text>         send a message to their screen',
    'override set <n>   set diamonds past the ' + num(CAP) + ' cap, up to ' + num(MAX_SAFE),
    'allow <email>      give that address admin access',
    'unallow <email>    take admin access away',
    'stats              reload the numbers at the top',
    'log                reload the action list',
    'who                show the selected account',
    'help               this'
  ].join('\n');

  function say(text) {
    var out = root && W.$('#ap-out', root);
    if (!out) return;
    out.textContent = String(text);
    out.scrollTop = out.scrollHeight;
  }

  function runCmd() {
    var box = W.$('#ap-cmd', root);
    var line = String(box.value || '').trim();
    if (!line) return;
    box.value = '';

    var bits = line.split(/\s+/);
    var cmd = bits.shift().toLowerCase();
    var rest = bits.join(' ');
    /* Number(), not parseInt(): parseInt reads "1e9" as 1 and "500abc"
       as 500, and a command that quietly acts on a different amount
       than the one typed is worse than one that refuses. Commas are
       allowed because people type them. */
    var n = rest === '' ? NaN : Number(rest.replace(/,/g, ''));
    var bad = 'Not a whole number. Try "take 500".';
    if (!Number.isInteger(n)) n = NaN;
    if ((cmd === 'take' || cmd === 'give') && !isNaN(n) && Math.abs(n) > MAX_STEP) {
      return say('At most ' + num(MAX_STEP) + ' at a time.');
    }
    if (cmd === 'set' && !isNaN(n) && n > CAP) {
      return say('The most a balance can be is ' + num(CAP) + '.');
    }

    if (cmd === 'help') return say(HELP);
    if (cmd === 'stats') { refreshStats(); return say('Reloading the numbers…'); }
    if (cmd === 'log') { ops().recent(15).then(function (r) { guard(r, renderLog); }); return say('Reloading the log…'); }
    if (cmd === 'find') { W.$('#ap-q', root).value = rest; search(); return say('Searching for "' + rest + '"…'); }
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
    /* `override set 5000000000`, or just `override 5000000000`. Read
       with Number.isSafeInteger, so anything a browser would round —
       9007199254740993 becomes …992 — is refused rather than quietly
       changed into a different number. */
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
      if (!rest) return say('Which address? Try "allow someone@example.com".');
      return ops().allow(rest, cmd === 'allow').then(function (r) {
        guard(r, function () {
          say(rest + (cmd === 'allow' ? ' now has admin access' : ' no longer has admin access'));
          refreshStats();
        });
      });
    }
    say('No command called "' + cmd + '". Type help.');
  }

  function refreshStats() {
    ops().stats().then(function (r) { guard(r, function (d) { stats = d; renderStats(); }); });
    sessionPill();
  }

  global.Administrator = { open: open, close: close };
})(window);
