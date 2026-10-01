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
        godCard() +
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

  global.UltraAdmin = { open: open };
})(window);
