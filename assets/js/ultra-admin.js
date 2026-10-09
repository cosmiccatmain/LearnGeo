/* ------------------------------------------------------------------
   LearnGeo — UltraAdmin.

   The second admin panel, behind its own code. The gems panel hands out
   diamonds and the verified seal, which only ever touch this browser's
   own save. This one reaches further: god mode, every class on the
   account, and the switch that wipes the save. So it gets a different
   code, and holding the gems code does not open it.

   Opened with ?ultra on the URL, the same way ?admin opens the other.

   What is worth being clear about: this is a lock on a drawer. Four
   digits are four digits, every action here runs in a page the user
   already controls, and anybody willing to open a console does not need
   a code at all. It keeps the panel out of the way of a student poking
   around, and it keeps the smaller code from reaching the larger
   powers. It is not a security boundary and nothing that actually
   matters should ever be guarded by it.

   Permissions live in admin-pin.js, which is the only place that knows
   what a scope may do. This file asks and does not decide.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons;

  function A() { return global.Admin; }
  function CL() { return global.Classes; }

  /* The way in. Asks for the ultra code, every time, unless one that
     covers it has already been given in this tab. */
  function open() {
    var adm = A();
    if (!adm || !adm.unlock) {
      W.toast('UltraAdmin is not available', 'The admin panel did not load.', I.info, 4200);
      return;
    }
    adm.unlock('ultra', function () { panel(); });
  }

  /* ============================== the panel ========================= */
  function panel() {
    if (!A().can('ultra')) return;        /* belt and braces; unlock already checked */

    global.UI.modal({
      title: 'UltraAdmin', icon: I.shield, wide: true,
      body:
        whoCard() +
        roleCard() +
        masqueradeCard() +
        godCard() +
        badgeCard() +
        accessCard() +
        enforceCard() +
        classesCard() +
        dangerCard(),
      actions: [{ label: 'Close', cls: 'btn--ghost', close: true }],
      onMount: wire
    });
  }

  function row(label, value) {
    return '<div class="row row--between" style="padding:7px 0;border-bottom:1px solid var(--line-soft)">' +
      '<span class="t-sm t-muted">' + W.escapeHtml(label) + '</span>' +
      '<b class="mono" style="font-size:13px">' + W.escapeHtml(String(value)) + '</b></div>';
  }

  function card(title, body, note) {
    return '<div class="cr-card" style="margin-bottom:14px">' +
      '<div class="cr-card__head"><h3>' + W.escapeHtml(title) + '</h3></div>' +
      (note ? '<p class="t-sm t-muted" style="margin:-6px 0 12px">' + note + '</p>' : '') +
      body + '</div>';
  }

  /* ------------------------------- who ---------------------------- */
  function whoCard() {
    var C = global.Cloud;
    var s = W.state;
    return card('This device',
      row('Signed in as', (C && C.user && C.user.email) || 'nobody, playing as a guest') +
      row('Role', s.role || 'student') +
      row('Admin scope', A().scope || 'none') +
      row('Level', s.economy.level) +
      row('Diamonds', s.economy.diamonds) +
      row('Countries seen', Object.keys(s.mastery || {}).length));
  }

  /* ------------------------------- role ---------------------------
     Switching to a student account is a one-way door everywhere else.
     The URL that sets a role is ignored once you are signed in — on
     purpose, so a link cannot flip somebody — and nothing in the app
     offered the way back, so a teacher who switched was simply stuck.

     Nothing is lost by switching. The classes stay in the save and on
     the account; only which screens you get changes.
  ---------------------------------------------------------------- */
  function roleCard() {
    var teacher = W.state.role === 'teacher';
    var mine = (global.Classes && global.Classes.count()) || 0;
    return card('Account',
      '<button class="btn btn--' + (teacher ? 'ghost' : 'accent') + ' btn--block" id="ua-role">' +
        (teacher ? 'Switch to a student account' : 'Switch back to a teacher account') + '</button>',
      teacher
        ? 'You are a teacher. Switching gives you the student screens; your ' +
          (mine === 1 ? 'class stays' : mine + ' classes stay') + ' where they are.'
        : 'You are a student. Switching back gives you your class again — ' +
          (mine ? (mine === 1 ? 'one is' : mine + ' are') + ' still on this device'
                : 'anything on your account comes back when it next syncs') + '.');
  }

  /* ---------------------------- masquerade ------------------------
     What a teacher cannot otherwise see: their own class through a
     student's eyes. Everything a student would be shown is built from
     the class the teacher is looking at, nothing is written down, and
     leaving puts the teacher back exactly where they were.
  ---------------------------------------------------------------- */
  function masqueradeCard() {
    if (W.state.role !== 'teacher') return '';
    var M = global.Masquerade;
    if (!M) return '';
    var c = global.Classes && global.Classes.active();
    var work = c ? (c.assignments || []).length : 0;
    return card('See it as a student',
      '<button class="btn btn--accent btn--block" id="ua-asstudent">' +
        'Open my class as a student</button>',
      'Shows the Classroom exactly as the people in ' +
        W.escapeHtml((c && c.name) || 'your class') + ' see it, with the ' +
        (work === 1 ? 'one assignment' : work + ' assignments') +
        ' you have set. Nothing is saved and nothing is handed in.');
  }

  /* ------------------------------ god mode ------------------------ */
  function godCard() {
    var G = global.GodMode;
    if (!G) return card('God mode', '<p class="t-sm t-muted">Not loaded on this page.</p>');
    var on = !!G.on;
    return card('God mode',
      '<button class="btn btn--' + (on ? 'primary' : 'ghost') + ' btn--block" id="ua-god">' +
        (on ? 'Turn god mode off' : 'Turn god mode on') + '</button>',
      'Every answer counts as right, so a mode can be walked end to end. ' +
      'It awards nothing — no XP, no level, no gems, no mastery — on purpose, ' +
      'because the class leaderboard ranks on level and that number has to keep meaning work done.');
  }

  /* ------------------------------ classes ------------------------- */
  /* ----------------------------- badges ---------------------------
     Moved here from the gems panel. A badge saying somebody runs this
     is a claim about who they are, which outlasts any number of
     diamonds, so it belongs behind the larger code.
  ----------------------------------------------------------------- */
  function badgeCard() {
    var B = global.Badges;
    if (!B) return card('Badges', '<div class="t-sm t-muted">badges.js is not loaded.</div>');
    return card('Badges',
      '<div class="adm-bdg" id="ua-badges">' +
        B.all().map(function (b) {
          var held = B.has(b.id), given = B.granted(b);
          return '<div class="adm-bdg__row' + (held ? ' is-on' : '') + ' bdg--' + b.tone + '">' +
            '<span class="adm-bdg__plate">' + B.svg(b, 17) + '</span>' +
            '<span class="adm-bdg__t"><b>' + W.escapeHtml(b.name) + '</b>' +
              '<span>' + W.escapeHtml(b.desc) + '</span></span>' +
            (given
              ? '<button class="switch' + (held ? ' is-on' : '') + '" data-ua-badge="' + b.id +
                '" role="switch" aria-checked="' + (held ? 'true' : 'false') + '"></button>'
              : '<span class="adm-bdg__earned">' + (held ? 'earned' : 'locked') + '</span>') +
          '</div>';
        }).join('') +
      '</div>',
      'Earned badges have no switch. The rule that grants them is the only thing that may.');
  }

  /* ---------------------------- who gets admin --------------------- */
  function accessCard() {
    var list = Array.isArray(W.state.adminAllow) ? W.state.adminAllow : [];
    return card('Who may open the admin panel',
      '<div class="ua-allow" id="ua-allow">' +
        (list.length
          ? list.map(function (who, i) {
              return '<div class="ua-allow__row">' +
                '<span class="mono">' + W.escapeHtml(who) + '</span>' +
                '<button class="icon-btn" data-ua-drop="' + i + '" title="Remove">' +
                  I.close + '</button></div>';
            }).join('')
          : '<div class="t-sm t-muted">Nobody yet. While this list is empty the gems ' +
            'panel opens for the UltraAdmin holder and for no one else.</div>') +
      '</div>' +
      '<div class="row" style="gap:8px;margin-top:10px">' +
        '<input class="input mono" id="ua-allow-add" placeholder="email on the account" ' +
          'style="flex:1;min-width:0" autocapitalize="off" spellcheck="false">' +
        '<button class="btn btn--accent btn--sm" id="ua-allow-go">Add</button>' +
      '</div>',
      'The gems code alone is no longer enough: the account has to be named here too.');
  }

  /* -------------------------- penalties and appeals ---------------- */
  function enforceCard() {
    var L = global.AdminLedger;
    if (!L) return '';
    var p = L.current();
    var grants = L.recentGrants(L.windowHours);

    var body =
      '<div class="ua-enf">' +
        row('Grants logged in the last ' + L.windowHours + 'h', String(grants.length)) +
        row('Log began', new Date(L.blindBefore()).toLocaleString()) +
        (p
          ? row('Penalty', p.status + ' \u00b7 ' + p.taken.toLocaleString() + ' taken')
          : row('Penalty', 'none on this device')) +
      '</div>';

    if (p && p.status === 'appealed') {
      body +=
        '<div class="feedback" style="background:var(--accent-soft);margin-top:12px">' + I.inbox +
          '<div><b style="color:var(--accent-ink)">Appeal waiting</b>' +
          '<p>' + W.escapeHtml(p.appeal.text) + '</p></div></div>' +
        '<div class="row" style="gap:8px;margin-top:10px">' +
          '<button class="btn btn--accent btn--sm" id="ua-appeal-ok">Give it back</button>' +
          '<button class="btn btn--ghost btn--sm" id="ua-appeal-no">Refuse</button>' +
        '</div>';
    } else if (p && p.status === 'applied') {
      body += '<button class="btn btn--ghost btn--sm" id="ua-appeal-ok" style="margin-top:10px">' +
why() + '</button>';
    }

    return card('Diamond enforcement', body,
      L.windowIsPartial()
        ? 'The log starts when this build shipped, so anything granted before that ' +
          'cannot be seen and was never charged for.'
        : '');

    function why() { return 'Reverse the penalty'; }
  }

  function classesCard() {
    if (!CL()) return card('Classes', '<p class="t-sm t-muted">Not loaded on this page.</p>');
    var list = CL().all();
    var here = CL().activeId();

    var body = list.map(function (c) {
      return '<div class="person">' +
        '<span class="cr-switch__dot cr-switch__dot--' + CL().validBg(c.background) + '" ' +
          'style="margin-right:10px"></span>' +
        '<div class="person__t"><b>' + W.escapeHtml(c.name || 'Unnamed class') + '</b>' +
          '<span>' + (c.assignments || []).length + ' set · ' +
            (c.results || []).length + ' in · ' +
            (c.code ? W.escapeHtml(c.code) : 'no code yet') +
            (c.cloudId ? ' · online' : ' · this device only') + '</span></div>' +
        (c.lid === here
          ? '<span class="pill-tag pill-tag--done">Showing</span>'
          : '<button class="btn btn--ghost btn--sm" data-go="' + W.escapeHtml(c.lid) + '">Show</button>') +
      '</div>';
    }).join('');

    return card('Classes', body || '<p class="t-sm t-muted">None yet.</p>',
      list.length + ' class' + (list.length === 1 ? '' : 'es') + ' on this device.');
  }

  /* ------------------------------ danger -------------------------- */
  function dangerCard() {
    return card('Danger',
      '<button class="btn btn--ghost btn--block" id="ua-copy">Copy this save as JSON</button>' +
      '<button class="btn btn--primary btn--block" id="ua-wipe" style="margin-top:8px">' +
        'Wipe this device’s save</button>',
      'Wiping clears progress, classes and sign-in on this browser only. ' +
      'Anything already on the account comes back when you sign in again; ' +
      'anything that never synced does not.');
  }

  /* ------------------------------- wiring ------------------------- */
  function wire(root, close) {
    wireBadges(root);
    wireAccess(root, close);
    wireEnforce(root);

    var role = W.$('#ua-role', root);
    if (role) role.addEventListener('click', function () {
      var toTeacher = W.state.role !== 'teacher';
      close();
      W.state.role = toTeacher ? 'teacher' : 'student';
      W.state.roleChosen = true;
      W.saveNow();
      global.UI.refreshTabs();
      global.UI.go(toTeacher ? 'teacher' : 'portal');
      global.UI.refreshHud();
      if (toTeacher) {
        var n = (global.Classes && global.Classes.count()) || 0;
        W.toast('You are a teacher again',
                n ? (n === 1 ? 'Your class is here' : 'Your ' + n + ' classes are here') : '',
                I.check);
        /* pull down anything that only exists on the account */
        if (global.Teacher && global.Teacher.render) global.Teacher.render();
      } else {
        W.toast('Now a student account', 'UltraAdmin can switch you back', I.check);
      }
    });

    var asStudent = W.$('#ua-asstudent', root);
    if (asStudent) asStudent.addEventListener('click', function () {
      close();
      if (global.Masquerade) global.Masquerade.start();
    });

    var god = W.$('#ua-god', root);
    if (god) god.addEventListener('click', function () {
      var G = global.GodMode;
      if (!G) return;
      if (G.on) G.disable(); else G.enable();
      close();
      setTimeout(function () { open(); }, 60);      /* reopen showing the new state */
    });

    W.$$('[data-go]', root).forEach(function (b) {
      b.addEventListener('click', function () {
        CL().switchTo(b.dataset.go);
        close();
        if (global.UI && global.UI.go) global.UI.go('teacher');
      });
    });

    var cp = W.$('#ua-copy', root);
    if (cp) cp.addEventListener('click', function () {
      var text = JSON.stringify(W.state, null, 2);
      if (global.Teacher && global.Teacher.copy) global.Teacher.copy(text, 'Save copied');
      else if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () {
        W.toast('Save copied', '', I.check);
      }, function () { W.toast('Copy blocked', 'Your browser would not allow it', I.info); });
    });

    var wipe = W.$('#ua-wipe', root);
    if (wipe) wipe.addEventListener('click', function () {
      close();
      global.UI.modal({
        title: 'Wipe this device?', icon: I.close,
        body: '<p class="t-muted">Progress, classes and sign-in on this browser go. ' +
          'There is no undo here.</p>',
        actions: [
          { label: 'Keep it', cls: 'btn--ghost', close: true },
          { label: 'Wipe', cls: 'btn--primary', close: true, onClick: function () {
              W.reset();
              global.location.reload();
            } }
        ]
      });
    });
  }

  function wireBadges(root) {
    var B = global.Badges;
    if (!B) return;
    W.$$('[data-ua-badge]', root).forEach(function (sw) {
      sw.addEventListener('click', function () {
        var id = sw.dataset.uaBadge;
        var on = B.has(id) ? !B.revoke(id) : B.grant(id);
        sw.classList.toggle('is-on', on);
        sw.setAttribute('aria-checked', on ? 'true' : 'false');
        sw.closest('.adm-bdg__row').classList.toggle('is-on', on);
        if (global.AdminLedger) {
          global.AdminLedger.record('badge', { note: (on ? 'granted ' : 'revoked ') + id });
        }
        global.UI.refreshHud();
      });
    });
  }

  function wireAccess(root, close) {
    var add = W.$('#ua-allow-go', root), box = W.$('#ua-allow-add', root);
    if (add) add.addEventListener('click', function () {
      var who = (box.value || '').trim().toLowerCase();
      if (!who) return;
      if (!Array.isArray(W.state.adminAllow)) W.state.adminAllow = [];
      if (W.state.adminAllow.indexOf(who) === -1) W.state.adminAllow.push(who);
      W.saveNow();
      if (global.AdminLedger) global.AdminLedger.record('allow', { note: 'added ' + who });
      close(); open();
    });
    W.$$('[data-ua-drop]', root).forEach(function (b) {
      b.addEventListener('click', function () {
        var i = +b.dataset.uaDrop;
        var gone = W.state.adminAllow[i];
        W.state.adminAllow.splice(i, 1);
        W.saveNow();
        if (global.AdminLedger) global.AdminLedger.record('allow', { note: 'removed ' + gone });
        close(); open();
      });
    });
  }

  function wireEnforce(root) {
    var L = global.AdminLedger;
    if (!L) return;
    var ok = W.$('#ua-appeal-ok', root), no = W.$('#ua-appeal-no', root);
    if (ok) ok.addEventListener('click', function () {
      L.reverse();
      if (global.Enforcement) global.Enforcement.render();
      global.UI.refreshHud();
      W.toast('Put back', 'The diamonds were returned', I.check);
    });
    if (no) no.addEventListener('click', function () {
      L.uphold();
      if (global.Enforcement) global.Enforcement.render();
      W.toast('Appeal refused', '', I.info);
    });
  }

  global.UltraAdmin = { open: open };
})(window);
