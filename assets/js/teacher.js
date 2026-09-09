/* ------------------------------------------------------------------
   LearnGeo — teacher mode.

   There is no server behind this. A teacher writes an assignment, and
   LearnGeo turns it into a short code. Students paste the code and the
   work appears in their list. Nothing leaves the browser it was made in
   unless the teacher copies the code out and sends it.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons, A = global.Assignments;

  var draftPicker = null;

  function cls() { return W.state.classroom; }

  function ensureCode() {
    if (!cls().code) { cls().code = A.classCode(); W.saveNow(); }
    return cls().code;
  }

  /* ============================ dashboard =========================== */
  function render() {
    var host = document.getElementById('view-teacher');
    if (!host) return;
    var c = cls();
    var list = c.assignments || [];

    host.innerHTML =
      '<div class="portal__inner">' +

        '<div class="portal__head">' +
          '<div class="portal__avatar">' + W.avatarHtml(W.state.profile) + '</div>' +
          '<div class="portal__hello grow">' +
            '<h1>' + W.escapeHtml(c.name || 'Your class') + '</h1>' +
            '<p>Write an assignment, copy the code, hand it to your students. ' +
               'They paste it once and the work shows up on their home screen.</p>' +
          '</div>' +
          '<button class="btn btn--accent btn--lg" id="tm-new">' + I.clip + ' New assignment</button>' +
        '</div>' +

        '<div class="portal__section portal-split">' +
          '<div class="panel">' +
            '<div class="panel__head"><h3>Class code</h3></div>' +
            '<p class="t-sm t-muted" style="margin-bottom:12px">' +
              'Students enter this once so their work is labelled with your class.</p>' +
            '<div class="code-chip">' + ensureCode() +
              '<button id="tm-copycode" title="Copy code">' + I.clip + '</button></div>' +
            '<div class="field" style="margin-top:16px">' +
              '<label class="field__label">Class name</label>' +
              '<input class="input" id="tm-name" maxlength="40" placeholder="e.g. Period 3 Geography" ' +
                'value="' + W.escapeHtml(c.name) + '">' +
            '</div>' +
          '</div>' +

          '<div class="panel">' +
            '<div class="panel__head"><h3>Assignments</h3>' +
              '<span class="eyebrow">' + list.length + '</span></div>' +
            (list.length
              ? list.map(assignRow).join('')
              : '<div class="empty" style="padding:26px 0">Nothing set yet.<br>' +
                'Use <b>New assignment</b> to write your first one.</div>') +
          '</div>' +
        '</div>' +

        '<div class="portal__section">' + resultsPanel() + '</div>' +

        '<div class="portal__section">' +
          '<span class="eyebrow">How handing work out works</span>' +
          '<div class="portal-modes" style="margin-top:14px">' +
            step(I.clip, '1. Write it', 'Choose the countries by hand or by region, pick the length and whether it is timed.') +
            step(I.key, '2. Copy the code', 'Every assignment gets its own code. Paste it into your class chat or write it up.') +
            step(I.check, '3. They paste it in', 'Students open Home, hit Add assignment, and it lands in their list.') +
          '</div>' +
        '</div>' +
      '</div>';

    document.getElementById('tm-new').addEventListener('click', function () { openBuilder(); });
    document.getElementById('tm-copycode').addEventListener('click', function () {
      copy(ensureCode(), 'Class code copied');
    });
    var nameEl = document.getElementById('tm-name');
    nameEl.addEventListener('change', function () {
      cls().name = nameEl.value.trim().slice(0, 40); W.saveNow(); render();
    });

    var recBtn = document.getElementById('tm-record');
    if (recBtn) recBtn.addEventListener('click', openRecordResult);

    W.$$('[data-share]', host).forEach(function (b) {
      b.addEventListener('click', function () { shareAssignment(list[+b.dataset.share]); });
    });
    W.$$('[data-edit]', host).forEach(function (b) {
      b.addEventListener('click', function () { openBuilder(list[+b.dataset.edit], +b.dataset.edit); });
    });
    W.$$('[data-try]', host).forEach(function (b) {
      b.addEventListener('click', function () { A.run(list[+b.dataset.try]); });
    });
    W.$$('[data-del]', host).forEach(function (b) {
      b.addEventListener('click', function () { removeAssignment(+b.dataset.del); });
    });

    function step(icon, t, d) {
      return '<div class="tcard"><div class="tcard__head">' +
        '<span class="tcard__icon">' + icon + '</span><h4>' + t + '</h4></div>' +
        '<p class="t-sm t-muted">' + d + '</p></div>';
    }
  }

  function assignRow(a, i) {
    var n = (a.config && a.config.countries && a.config.countries.length) ||
            (a.config && a.config.count) || 0;
    return '<div class="assign-row">' +
      '<div class="assign-row__i">' + (a.mode === 'cards' ? I.cards : a.mode === 'learn' ? I.book : I.clip) + '</div>' +
      '<div class="assign-row__t">' +
        '<b>' + W.escapeHtml(a.title) + '</b>' +
        '<span>' + modeLabel(a.mode) + ' · ' + n + ' items' +
          (a.config && a.config.timed ? ' · timed' : '') + '</span>' +
      '</div>' +
      '<div class="row" style="gap:4px">' +
        '<button class="icon-btn" data-try="' + i + '" title="Try it yourself">' + I.arrowR + '</button>' +
        '<button class="icon-btn" data-share="' + i + '" title="Get the code">' + I.key + '</button>' +
        '<button class="icon-btn" data-edit="' + i + '" title="Edit">' + I.gear + '</button>' +
        '<button class="icon-btn" data-del="' + i + '" title="Delete">' + I.close + '</button>' +
      '</div>' +
    '</div>';
  }

  function modeLabel(m) {
    return { learn: 'Learn', test: 'Practice test', cards: 'Flashcards', quiz: 'Class quiz' }[m] || m;
  }

  function removeAssignment(i) {
    var a = cls().assignments[i];
    global.UI.modal({
      title: 'Delete assignment',
      icon: I.close,
      body: '<p class="t-muted">Remove <b>' + W.escapeHtml(a.title) + '</b>? ' +
        'Students who already added it keep their copy.</p>',
      actions: [
        { label: 'Cancel', cls: 'btn--ghost', close: true },
        { label: 'Delete', cls: 'btn--primary', close: true, onClick: function () {
            cls().assignments.splice(i, 1); W.saveNow(); render();
          } }
      ]
    });
  }

  /* ============================= builder ============================ */
  function openBuilder(existing, index) {
    var a = existing || {
      id: 'a' + Date.now().toString(36),
      title: '', mode: 'test',
      config: { countries: [], count: 20, types: ['capital', 'country'],
                timed: false, instant: true, typed: false, fill: false }
    };
    var cfg = a.config;

    var body =
      '<div class="field"><label class="field__label">Title</label>' +
        '<input class="input" id="ab-title" maxlength="60" placeholder="e.g. South America capitals" ' +
          'value="' + W.escapeHtml(a.title) + '"></div>' +

      '<div class="field"><label class="field__label">What they do</label>' +
        '<div class="seg" id="ab-mode">' +
          seg('test', 'Practice test', a.mode) + seg('learn', 'Learn', a.mode) +
          seg('cards', 'Flashcards', a.mode) + seg('quiz', 'Class quiz', a.mode) +
        '</div></div>' +

      '<div class="field"><label class="field__label">Countries</label>' +
        '<div id="ab-picker"></div>' +
        '<div class="field__hint">Leave empty to cover every UN member state.</div></div>' +

      '<div class="field"><label class="field__label">Length</label>' +
        '<div class="seg" id="ab-count">' +
          ['10', '20', '30', '50'].map(function (n) { return seg(n, n, String(cfg.count || 20)); }).join('') +
        '</div></div>' +

      '<div class="field"><label class="field__label">Question types</label>' +
        '<div class="check-grid" id="ab-types">' +
          Object.keys(global.Quiz.types).map(function (t) {
            return ck(t, global.Quiz.types[t].label, (cfg.types || []).indexOf(t) !== -1);
          }).join('') + '</div></div>' +

      '<div class="field"><label class="field__label">Conditions</label>' +
        '<div class="seg" id="ab-timed">' +
          seg('untimed', 'Untimed', cfg.timed ? 'timed' : 'untimed') +
          seg('timed', 'Timed', cfg.timed ? 'timed' : 'untimed') +
        '</div>' +
        '<div class="seg" style="margin-top:8px" id="ab-instant">' +
          seg('instant', 'Feedback after each', cfg.instant === false ? 'end' : 'instant') +
          seg('end', 'Exam mode', cfg.instant === false ? 'end' : 'instant') +
        '</div>' +
        '<div class="seg" style="margin-top:8px" id="ab-typed">' +
          seg('choice', 'Multiple choice', cfg.typed ? 'typed' : 'choice') +
          seg('typed', 'Type the answer', cfg.typed ? 'typed' : 'choice') +
        '</div></div>';

    global.UI.modal({
      title: existing ? 'Edit assignment' : 'New assignment',
      icon: I.clip, wide: true, body: body,
      actions: [
        { label: 'Cancel', cls: 'btn--ghost', close: true },
        { label: existing ? 'Save' : 'Create', cls: 'btn--accent', close: true, onClick: function (root) {
            save(root, a, index);
          } }
      ],
      onMount: function (root) {
        global.UI.wireSeg(root); global.UI.wireCheck(root);
        draftPicker = A.picker(W.$('#ab-picker', root), { initial: cfg.countries || [] });
      }
    });

    function seg(v, l, cur) {
      return '<button data-v="' + v + '" class="' + (cur === v ? 'is-active' : '') + '">' + l + '</button>';
    }
    function ck(v, l, on) {
      return '<button class="check ' + (on ? 'is-on' : '') + '" data-v="' + v + '">' +
        '<span class="check__box">' + I.check + '</span>' + W.escapeHtml(l) + '</button>';
    }
  }

  function save(root, a, index) {
    var v = function (sel) { var n = W.$(sel + ' .is-active', root); return n ? n.dataset.v : null; };
    var title = W.$('#ab-title', root).value.trim();
    var picked = draftPicker ? draftPicker.value : [];
    var types = W.$$('#ab-types .check.is-on', root).map(function (n) { return n.dataset.v; });

    a.title = title || 'Untitled assignment';
    a.mode = v('#ab-mode') || 'test';
    a.config = {
      countries: picked,
      count: parseInt(v('#ab-count') || '20', 10),
      types: types.length ? types : ['capital'],
      timed: v('#ab-timed') === 'timed',
      instant: v('#ab-instant') !== 'end',
      typed: v('#ab-typed') === 'typed',
      fill: !picked.length
    };
    a.from = cls().name || 'Your teacher';
    a.classCode = ensureCode();

    if (!cls().assignments) cls().assignments = [];
    if (index === undefined || index === null) cls().assignments.push(a);
    else cls().assignments[index] = a;
    W.saveNow();
    render();
    W.toast('Assignment saved', a.title, I.check);
  }

  /* ============================== sharing =========================== */
  function shareAssignment(a) {
    var code = A.encode(a);
    if (!code) { W.toast('Could not build a code', 'Try again', I.info); return; }
    global.UI.modal({
      title: 'Hand out “' + a.title + '”',
      icon: I.key, wide: true,
      body: '<p class="t-muted" style="margin-bottom:14px">Send this code to your class. ' +
              'They open <b>Home</b>, choose <b>Add assignment</b> and paste it in.</p>' +
            '<div class="share-box" id="sh-code">' + W.escapeHtml(code) + '</div>' +
            '<div class="field__hint" style="margin-top:10px">' +
              'The code carries the whole assignment, so it works even if the student has ' +
              'never opened LearnGeo before.</div>',
      actions: [
        { label: 'Close', cls: 'btn--ghost', close: true },
        { label: 'Copy code', cls: 'btn--accent', onClick: function () {
            copy(code, 'Code copied'); return false;
          } }
      ]
    });
  }

  function copy(text, msg) {
    var done = function () { W.toast(msg, 'Paste it wherever your class will see it', I.check); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else fallback();

    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); }
      catch (e) { W.toast('Copy it by hand', 'Your browser blocked the clipboard', I.info); }
      ta.remove();
    }
  }

  /* ====================== student side: add by code ================= */
  function openAddAssignment() {
    global.UI.modal({
      title: 'Add an assignment',
      icon: I.key,
      body: '<div class="field"><label class="field__label">Paste the code from your teacher</label>' +
              '<textarea class="input mono" id="ad-code" style="min-height:110px" ' +
              'placeholder="LG1-…"></textarea>' +
              '<div id="ad-err"></div></div>',
      actions: [
        { label: 'Cancel', cls: 'btn--ghost', close: true },
        { label: 'Add it', cls: 'btn--accent', onClick: function (root, close) {
            var raw = W.$('#ad-code', root).value;
            var a = A.decode(raw);
            if (!a) {
              W.$('#ad-err', root).innerHTML =
                '<div class="feedback feedback--wrong" style="margin-top:10px">' + I.info +
                '<div><b>That code did not read</b><p>Check it copied in full. ' +
                'Codes start with LG1-.</p></div></div>';
              return false;
            }
            if (!W.state.inbox) W.state.inbox = [];
            var dupe = W.state.inbox.filter(function (x) { return x.id === a.id; })[0];
            if (dupe) {
              W.toast('Already added', a.title, I.info);
            } else {
              a.added = Date.now();
              W.state.inbox.push(a);
              W.saveNow();
              W.confetti({ count: 50, power: 200 });
              W.toast('Assignment added', a.title, I.check);
            }
            close();
            global.Portal.render();
          } }
      ],
      onMount: function (root) { setTimeout(function () { W.$('#ad-code', root).focus(); }, 60); }
    });
  }

  /* -------- student: turn a finished assignment into a result code ------- */
  function shareResult(assignment, pct, correct, total) {
    var name = W.state.profile.displayName || 'Student';
    var code = A.encodeResult({
      assignmentId: assignment.id, title: assignment.title,
      name: name, pct: pct, correct: correct, total: total
    });
    if (!code) { W.toast('Could not build a code', 'Try again', I.info); return; }
    global.UI.modal({
      title: 'Send your score',
      icon: I.key, wide: true,
      body: '<p class="t-muted" style="margin-bottom:14px">' +
              'This code says who you are, which assignment it was, and what you scored. ' +
              'Send it to your teacher however you normally hand work in.</p>' +
            '<div class="share-box">' + W.escapeHtml(code) + '</div>' +
            '<div class="row" style="gap:8px;margin-top:14px">' +
              '<span class="chip chip--xp mono">' + W.escapeHtml(name) + '</span>' +
              '<span class="chip chip--gem mono">' + correct + '/' + total + ' · ' + pct + '%</span>' +
            '</div>',
      actions: [
        { label: 'Close', cls: 'btn--ghost', close: true },
        { label: 'Copy code', cls: 'btn--accent', onClick: function () {
            copy(code, 'Result code copied'); return false;
          } }
      ]
    });
  }

  /* -------- teacher: paste a result code to record it -------- */
  function openRecordResult() {
    global.UI.modal({
      title: 'Record a result',
      icon: I.inbox,
      body: '<div class="field"><label class="field__label">Paste a result code from a student</label>' +
              '<textarea class="input mono" id="rr-code" style="min-height:110px" placeholder="LGR-…"></textarea>' +
              '<div id="rr-err"></div></div>',
      actions: [
        { label: 'Cancel', cls: 'btn--ghost', close: true },
        { label: 'Record it', cls: 'btn--accent', onClick: function (root, close) {
            var r = A.decodeResult(W.$('#rr-code', root).value);
            if (!r) {
              W.$('#rr-err', root).innerHTML =
                '<div class="feedback feedback--wrong" style="margin-top:10px">' + I.info +
                '<div><b>That code did not read</b><p>Result codes start with LGR-.</p></div></div>';
              return false;
            }
            if (!cls().results) cls().results = [];
            cls().results.push(r);
            W.saveNow();
            W.toast('Recorded', r.name + ' · ' + r.pct + '%', I.check);
            close(); render();
          } }
      ],
      onMount: function (root) { setTimeout(function () { W.$('#rr-code', root).focus(); }, 60); }
    });
  }

  function resultsPanel() {
    var rows = (cls().results || []).slice().sort(function (a, b) { return b.at - a.at; });
    return '<div class="panel">' +
      '<div class="panel__head"><h3>Results in</h3>' +
        '<span class="eyebrow">' + rows.length + '</span></div>' +
      (rows.length
        ? rows.slice(0, 12).map(function (r) {
            var tone = r.pct >= 80 ? 'var(--success)' : r.pct >= 50 ? 'var(--gold)' : 'var(--danger)';
            return '<div class="assign-row">' +
              '<div class="assign-row__i">' + I.user + '</div>' +
              '<div class="assign-row__t"><b>' + W.escapeHtml(r.name) + '</b>' +
                '<span>' + W.escapeHtml(r.title) + '</span></div>' +
              '<div class="mono" style="font-weight:620;color:' + tone + '">' +
                r.correct + '/' + r.total + ' · ' + r.pct + '%</div>' +
            '</div>';
          }).join('')
        : '<div class="empty" style="padding:22px 0">No results yet.<br>' +
          'Students send a code when they finish.</div>') +
      '<button class="btn btn--ghost btn--block btn--sm" id="tm-record" style="margin-top:12px">' +
        I.plus + ' Record a result</button>' +
    '</div>';
  }

  function becomeTeacher() {
    W.state.role = 'teacher';
    ensureCode();
    W.saveNow();
    global.UI.go('teacher');
  }

  global.Teacher = {
    render: render, openBuilder: openBuilder, openAddAssignment: openAddAssignment,
    shareResult: shareResult, openRecordResult: openRecordResult,
    becomeTeacher: becomeTeacher, shareAssignment: shareAssignment, ensureCode: ensureCode
  };
})(window);
