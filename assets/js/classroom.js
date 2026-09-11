/* ------------------------------------------------------------------
   LearnGeo — the student's Classroom.

   The other side of teacher mode. Work arrives as a code, sits here
   until it is done, and goes back as a result code. Same shape as the
   teacher's view so the two read as one thing.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons, A = global.Assignments;

  var tab = 'classwork';
  var lastSync = 0;

  /* Signed in: new work from the teacher shows up by itself. Throttled,
     since Home and Classroom both ask whenever they redraw. */
  function syncSoon(force) {
    var C = global.Cloud;
    if (!C || !C.ready || !enrolled()) return;
    if (!force && Date.now() - lastSync < 15000) return;
    lastSync = Date.now();
    C.studentSync().then(function (changed) {
      if (!changed || document.querySelector('.overlay')) return;
      var v = document.getElementById('view-classroom');
      if (v && !v.classList.contains('hidden')) render(true);
      var p = document.getElementById('view-portal');
      if (p && !p.classList.contains('hidden') && global.Portal) global.Portal.render();
    }, function () {});
  }

  function syncLine() {
    var C = global.Cloud, e = enrolled();
    if (!C || !C.signedIn || !e) return '';
    var label = e.classId
      ? { synced: 'Online. New work shows up automatically', syncing: 'Syncing…',
          offline: 'Offline. Your work is saved on this device', off: '' }[C.status] || ''
      : 'Your teacher hasn’t put this class online yet';
    return '<div class="cr-banner__sync"><span class="sync-dot sync-dot--' +
      (e.classId ? C.status : 'off') + '"></span>' + label + '</div>';
  }

  function inbox() {
    if (!W.state.inbox) W.state.inbox = [];
    return W.state.inbox;
  }

  function enrolled() { return W.state.enrolled || null; }
  function className() { return enrolled() ? enrolled().className : ''; }
  function classCode() { return enrolled() ? enrolled().code : ''; }

  function avg(nums) {
    if (!nums.length) return null;
    return Math.round(nums.reduce(function (a, b) { return a + b; }, 0) / nums.length);
  }

  function scoreClass(pct) {
    if (pct === null || pct === undefined) return 'gb__score--none';
    return pct >= 80 ? 'gb__score--hi' : pct >= 50 ? 'gb__score--mid' : 'gb__score--lo';
  }

  /* ============================== render ============================ */
  function render(fromSync) {
    var host = document.getElementById('view-classroom');
    if (!host) return;
    if (!enrolled()) return renderJoin(host);
    if (fromSync !== true) syncSoon(false);
    var box = inbox();
    var todo = box.filter(function (a) { return !a.done; });
    var done = box.filter(function (a) { return a.done; });
    var name = className();
    var code = classCode();

    host.innerHTML =
      '<div class="cr">' +
        '<div class="cr-banner">' +
          '<div>' +
            '<h1>' + W.escapeHtml(name || 'Classroom') + '</h1>' +
            '<p>' + (box.length
              ? todo.length + ' to do · ' + done.length + ' handed in'
              : 'Nothing here yet. Add a code from your teacher to get started.') + '</p>' +
            syncLine() +
          '</div>' +
          (code
            ? '<div class="cr-banner__code"><span>Class code</span><b>' + W.escapeHtml(code) + '</b></div>'
            : '') +
        '</div>' +

        '<div class="cr-tabs">' +
          crTab('classwork', I.clip, 'Classwork', box.length) +
          crTab('grades', I.chart, 'Grades', done.length) +
        '</div>' +

        '<div id="cl-body">' + (tab === 'grades' ? gradesPanel() : classworkPanel()) + '</div>' +
      '</div>';

    W.$$('.cr-tab', host).forEach(function (b) {
      b.addEventListener('click', function () { tab = b.dataset.t; render(); });
    });
    wire(host);

    function crTab(id, icon, label, n) {
      return '<button class="cr-tab' + (tab === id ? ' is-active' : '') + '" data-t="' + id + '">' +
        icon + label + (n ? '<span class="cr-tab__n">' + n + '</span>' : '') + '</button>';
    }
  }

  /* ------------------------------ joining ---------------------------
     One code and your name. The class code is issued by the server when
     the teacher creates the class, so a code that exists is a code that
     works — there is no long code to fall back on and nothing to paste.

     Signing in is part of joining rather than a wall in front of it: if
     you are not signed in, Join takes you through it and then finishes
     the job. */

  var CODE_LEN = 6;
  var CODE_OK = /^[A-HJ-NP-Z2-9]{6}$/;          /* no I, O, 0 or 1 */
  var pending = '';                             /* a code from a join link */

  /* A teacher can hand the class over as a link instead of six characters
     on a board. This is what that link fills in. */
  function prefill(code) {
    pending = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LEN);
    return pending;
  }

  function renderJoin(host) {
    var signedIn = !!(global.Cloud && global.Cloud.signedIn);
    var known = W.state.profile.displayName === 'Explorer' ? '' : W.state.profile.displayName;

    host.innerHTML =
      '<div class="cr" style="max-width:620px">' +
        '<div class="join-card">' +
          '<div class="join-card__i">' + I.users + '</div>' +
          '<h2>Join your class</h2>' +
          '<p>Type the class code your teacher gave you. You only have to do this once.</p>' +

          (signedIn ? '' :
            '<div class="signin-hint" style="margin:18px 0 0">' + I.info +
              '<span>You need an account to join, so your teacher knows whose work is whose. ' +
              'Press Join and we will sort it out in one go.</span></div>') +

          '<div class="field" style="margin-top:22px">' +
            '<label class="field__label" for="j-code">Class code</label>' +
            '<input class="input mono join-code" id="j-code" maxlength="' + CODE_LEN + '" ' +
              'placeholder="ABC234" autocomplete="off" spellcheck="false" ' +
              'value="' + W.escapeHtml(pending) + '">' +
            '<div class="field__hint">Six letters and numbers, from your teacher.</div>' +
          '</div>' +

          '<div class="field">' +
            '<label class="field__label" for="j-name">Your name</label>' +
            '<input class="input" id="j-name" maxlength="40" placeholder="First and last name" ' +
              'value="' + W.escapeHtml(known) + '">' +
            '<div class="field__hint">This is the name your teacher sees next to your scores.</div>' +
          '</div>' +

          '<div id="j-err"></div>' +
          '<button class="btn btn--accent btn--lg btn--block" id="j-go" style="margin-top:8px">' +
            'Join class</button>' +
        '</div>' +
      '</div>';

    var codeEl = W.$('#j-code', host);
    codeEl.addEventListener('input', function () {
      codeEl.value = codeEl.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    });
    W.$('#j-go', host).addEventListener('click', function () { join(host); });
    W.$$('#j-code, #j-name', host).forEach(function (el) {
      el.addEventListener('keydown', function (e) { if (e.key === 'Enter') join(host); });
    });
    setTimeout(function () { (pending ? W.$('#j-name', host) : codeEl).focus(); }, 60);
  }

  function joinError(host, title, body) {
    var box = W.$('#j-err', host);
    if (!box) return;
    box.innerHTML =
      '<div class="feedback feedback--wrong" style="margin:0 0 12px">' + I.info +
      '<div><b>' + W.escapeHtml(title) + '</b><p>' + body + '</p></div></div>';
  }

  function busy(host, on, label) {
    var b = W.$('#j-go', host);
    if (!b) return;
    b.disabled = !!on;
    b.textContent = label || 'Join class';
  }

  /* The codes never contain I, O, zero or one, so anything with those in
     is wrong for certain and can be answered here instead of by a round
     trip that comes back saying only that no class matched. */
  function codeProblem(code) {
    if (!code) return ['Class code needed', 'Ask your teacher for the class code.'];
    if (/[IO01]/.test(code)) {
      return ['Check that code',
              'Class codes never use the letter O, the letter I, a zero or a one. ' +
              'One of those is probably meant to be something else.'];
    }
    if (code.length !== CODE_LEN) {
      return ['That code is the wrong length',
              'A class code is exactly ' + CODE_LEN + ' letters and numbers. Yours has ' +
              code.length + '.'];
    }
    if (!CODE_OK.test(code)) return ['Check that code', 'That is not a class code we can read.'];
    return null;
  }

  function join(host) {
    var code = W.$('#j-code', host).value.trim().toUpperCase();
    var name = W.$('#j-name', host).value.trim();

    var bad = codeProblem(code);
    if (bad) return joinError(host, bad[0], bad[1]);
    if (!name) return joinError(host, 'Name needed', 'Your teacher needs to know whose work this is.');

    var C = global.Cloud;
    if (!C || !C.available) {
      return joinError(host, 'Can’t reach the server',
        'Joining a class needs a connection. Your code is fine — try again once you are back online.');
    }

    /* not signed in yet: do that first, then come straight back and finish */
    if (!C.ready) {
      W.state.profile.displayName = name;
      W.saveNow();
      pending = code;
      global.UI.openAuth(C.signedIn ? 'signin' : 'signup', function () { finish(host, code, name); });
      return;
    }
    finish(host, code, name);
  }

  function finish(host, code, name) {
    var C = global.Cloud;
    busy(host, true, 'Joining…');
    C.joinClass(code, name).then(function (klass) {
      pending = '';
      enroll({ code: klass.code, className: klass.name, name: name, classId: klass.id }, [],
             'Your classwork will show up here');
      C.studentSync().then(function () { render(true); }, function () {});
    }, function (e) {
      busy(host, false);
      var msg = String((e && e.message) || '');
      if (/no class|not found|does not exist/i.test(msg)) {
        return joinError(host, 'No class has that code',
          'Nothing matches <b class="mono">' + W.escapeHtml(code) + '</b>. Check the letters with ' +
          'your teacher — and if they have not set the class up online yet, it will not work until they do.');
      }
      if (/closed|not accepting|join_open/i.test(msg)) {
        return joinError(host, 'That class isn’t taking new students',
          'Your teacher has closed it. Ask them to open it again.');
      }
      if (/already/i.test(msg)) {
        return joinError(host, 'You’re already in that class', 'Refresh the page and your work will be here.');
      }
      joinError(host, 'Couldn’t join', W.escapeHtml(C.friendly(e)));
    });
  }


  function enroll(e, assignments, note) {
    W.state.enrolled = e;
    W.state.profile.displayName = e.name;
    if (!W.state.inbox) W.state.inbox = [];
    var have = {};
    W.state.inbox.forEach(function (a) { have[a.id] = 1; });
    assignments.forEach(function (a) {
      if (!have[a.id]) { a.added = Date.now(); W.state.inbox.push(a); }
    });
    W.saveNow();
    W.confetti({ count: 70, power: 240 });
    W.toast('Joined ' + e.className, note, I.check);
    global.UI.refreshHud();
    tab = 'classwork';
    render(true);
  }

  function leaveClass() {
    var e = enrolled();
    if (!e) return;
    global.UI.modal({
      title: 'Leave ' + (e.className || 'this class'), icon: I.users,
      body: '<p class="t-muted">Your teacher keeps any scores you already sent, and anything you ' +
        'finished stays on your list. To come back, just join again with the class code.</p>',
      actions: [
        { label: 'Stay', cls: 'btn--ghost', close: true },
        { label: 'Leave class', cls: 'btn--primary', close: true, onClick: function () {
            var C = global.Cloud;
            var done = function () {
              W.state.inbox = inbox().filter(function (a) { return a.done || a.classCode !== e.code; });
              W.state.enrolled = null;
              W.saveNow();
              render(true);
              W.toast('You left ' + (e.className || 'the class'), '', I.check);
            };
            if (C && C.ready && e.classId) {
              C.leaveClass().then(done, function (err) { W.toast('Couldn’t leave',C.friendly(err), I.info); });
            } else done();
          } }
      ]
    });
  }

  function wire(host) {
    /* the header and the empty state both carry an Add button */
    W.$$('#cl-add', host).forEach(function (b) { b.addEventListener('click', checkForWork); });
    var leave = W.$('#cl-leave', host);
    if (leave) leave.addEventListener('click', leaveClass);

    W.$$('[data-start]', host).forEach(function (b) {
      b.addEventListener('click', function () { A.run(inbox()[+b.dataset.start]); });
    });
    W.$$('[data-send]', host).forEach(function (b) {
      b.addEventListener('click', function () { A.send(inbox()[+b.dataset.send]); });
    });
    var drill = W.$('#cl-drill', host);
    if (drill) drill.addEventListener('click', function () {
      global.LearnMode.applyAssignment({ countries: missedNames(), types: ['capital', 'country', 'identify'] }, null);
      global.UI.go('learn');
    });
    W.$$('[data-drop]', host).forEach(function (b) {
      b.addEventListener('click', function () { drop(+b.dataset.drop); });
    });
  }

  /* ============================ classwork =========================== */
  function classworkPanel() {
    var box = inbox();
    return '<div class="row row--between" style="margin-bottom:16px">' +
        '<div><h3 style="font-size:18px">Classwork</h3>' +
          '<div class="t-sm t-muted">Assignments from your teacher.</div></div>' +
        '<div class="row" style="gap:8px">' +
          '<button class="btn btn--ghost" id="cl-leave">Leave class</button>' +
          '<button class="btn btn--ghost" id="cl-add">' + I.refresh + ' Check for new work</button>' +
        '</div>' +
      '</div>' +
      (box.length
        ? box.map(function (a, i) {
            var n = (a.config && a.config.countries && a.config.countries.length) ||
                    (a.config && a.config.count) || 0;
            var pct = a.last ? a.last.pct : null;
            return '<div class="cw-row">' +
              '<div class="cw-row__i" style="' + (a.done
                ? 'background:var(--success-soft);color:var(--success)' : '') + '">' +
                (a.done ? I.check : I.clip) + '</div>' +
              '<div class="cw-row__t"><b>' + W.escapeHtml(a.title) + '</b>' +
                '<span>' + W.escapeHtml(a.from || 'Assignment') + ' · ' + modeLabel(a.mode) +
                ' · ' + n + ' items' + (a.config && a.config.timed ? ' · timed' : '') + '</span></div>' +
              (a.done
                ? '<div class="cw-row__meta"><b>' + a.best + '%</b>' +
                    (a.attempts > 1 ? a.attempts + ' tries' : 'best score') + '</div>'
                : '<div class="cw-row__meta"><b>–</b>not started</div>') +
              '<div class="row" style="gap:6px">' +
                (a.done && a.last
                  ? '<button class="btn btn--ghost btn--sm" data-send="' + i + '">' + I.key +
                      (a.last.sent ? ' Sent' : ' Send') + '</button>'
                  : '') +
                '<button class="btn btn--' + (a.done ? 'ghost' : 'primary') + ' btn--sm" data-start="' + i + '">' +
                  (a.done ? 'Retry' : 'Start') + '</button>' +
                '<button class="icon-btn" data-drop="' + i + '" title="Remove">' + I.close + '</button>' +
              '</div></div>';
          }).join('')
        : '<div class="cr-card"><div class="empty-cta">' +
            '<div class="empty-cta__i">' + I.inbox + '</div>' +
            '<b>No assignments yet</b>' +
            '<p>Nothing has been set yet. When your teacher saves an assignment it turns up ' +
              'here on its own, with nothing for you to type.</p>' +
            '<button class="btn btn--ghost" id="cl-add" style="margin-top:16px">' +
              I.refresh + ' Check for new work</button>' +
          '</div></div>');
  }

  /* ============================== grades ============================ */
  function gradesPanel() {
    var box = inbox();
    var done = box.filter(function (a) { return a.done; });
    if (!done.length) {
      return '<div class="cr-card"><div class="empty-cta">' +
        '<div class="empty-cta__i">' + I.chart + '</div>' +
        '<b>No grades yet</b><p>Finish an assignment and your score shows up here.</p>' +
        '</div></div>';
    }
    var mean = avg(done.map(function (a) { return a.best; }));
    var best = done.slice().sort(function (a, b) { return b.best - a.best; })[0];
    var worst = done.slice().sort(function (a, b) { return a.best - b.best; })[0];

    return '<h3 style="font-size:18px;margin-bottom:4px">Grades</h3>' +
      '<div class="t-sm t-muted" style="margin-bottom:16px">Based on ' + done.length +
        ' finished assignment' + (done.length === 1 ? '' : 's') + '.</div>' +

      '<div class="an-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:20px">' +
        stat(mean + '%', 'your average') +
        stat(best.best + '%', 'best', best.title) +
        stat(worst.best + '%', 'lowest', worst.title) +
      '</div>' +

      '<div class="cr-card">' +
        '<div class="cr-card__head"><h3>All assignments</h3></div>' +
        done.map(function (a) {
          return '<div class="an-bar">' +
            '<div class="an-bar__label"><span>' + W.escapeHtml(a.title) + '</span></div>' +
            '<div class="an-bar__n">' +
              (a.last && a.last.correct !== null
                ? a.last.correct + '/' + a.last.total + ' · ' : '') + a.best + '%</div>' +
            '<div class="an-bar__track" style="grid-column:1/-1">' +
              '<div class="an-bar__fill" style="width:' + a.best + '%;background:' +
                (a.best >= 80 ? 'var(--success)' : a.best >= 50 ? 'var(--gold)' : 'var(--danger)') +
              '"></div></div></div>';
        }).join('') +
      '</div>' +

      trouble();

    function stat(n, l, sub) {
      return '<div class="an-stat"><div class="an-stat__n">' + n + '</div>' +
        '<div class="an-stat__l">' + l + '</div>' +
        (sub ? '<div class="an-stat__sub">' + W.escapeHtml(sub) + '</div>' : '') + '</div>';
    }
  }

  /* What this student personally keeps missing, across their assignments. */
  function missedCounts() {
    var count = {};
    inbox().forEach(function (a) {
      if (a.last && a.last.missed) {
        a.last.missed.forEach(function (n) { count[n] = (count[n] || 0) + 1; });
      }
    });
    return count;
  }

  function missedNames() {
    var count = missedCounts();
    return Object.keys(count).sort(function (a, b) { return count[b] - count[a]; }).slice(0, 8);
  }

  function trouble() {
    var count = missedCounts();
    var names = missedNames();
    if (!names.length) return '';
    return '<div class="cr-card" style="margin-top:14px">' +
      '<div class="cr-card__head"><h3>What you keep missing</h3>' +
        '<span class="eyebrow">from your assignments</span></div>' +
      names.map(function (n) {
        var c = global.GeoData.countries.filter(function (x) { return x.name === n; })[0];
        return '<div class="person">' +
          '<div class="person__av" style="background:var(--danger-soft);color:var(--danger)">' +
            I.pin + '</div>' +
          '<div class="person__t"><b>' + W.escapeHtml(n) + '</b>' +
            '<span>' + (c ? W.escapeHtml(c.capital) + ' · ' + c.region : '') + '</span></div>' +
          '<span class="pill-tag">missed ' + count[n] + '×</span>' +
        '</div>';
      }).join('') +
      '<button class="btn btn--ghost btn--block btn--sm" id="cl-drill" style="margin-top:12px">' +
        'Practice these in Learn</button>' +
    '</div>';
  }

  /* ============================= actions ============================ */
  /* Work arrives on its own now: the teacher saves an assignment, it goes
     straight to the class, and this pulls down whatever is new. There is
     nothing to paste, so this is a refresh rather than an inbox. */
  function checkForWork() {
    var C = global.Cloud;
    if (!C || !C.ready) {
      W.toast('Not connected', C && C.signedIn
        ? 'You are offline. New work appears as soon as you are back.'
        : 'Sign in and your class work keeps itself up to date.', I.info, 4200);
      return;
    }
    var before = inbox().length;
    W.toast('Checking…', '', I.refresh, 1200);
    C.studentSync().then(function () {
      var added = inbox().length - before;
      render(true);
      W.toast(added > 0 ? added + ' new assignment' + (added === 1 ? '' : 's')
                        : 'You are up to date',
              added > 0 ? 'Just arrived from ' + (className() || 'your teacher') : '',
              added > 0 ? I.check : I.info);
    }, function (e) {
      W.toast('Couldn’t check', C.friendly(e), I.info, 4200);
    });
  }


  function drop(i) {
    var a = inbox()[i];
    global.UI.modal({
      title: 'Remove assignment', icon: I.close,
      body: '<p class="t-muted">Remove <b>' + W.escapeHtml(a.title) + '</b> from your list? ' +
        'You can add it back later with the same code.</p>',
      actions: [
        { label: 'Keep it', cls: 'btn--ghost', close: true },
        { label: 'Remove', cls: 'btn--primary', close: true, onClick: function () {
            inbox().splice(i, 1); W.saveNow(); render();
          } }
      ]
    });
  }

  function modeLabel(m) {
    return { learn: 'Learn', test: 'Practice test', cards: 'Flashcards', quiz: 'Class quiz' }[m] || W.escapeHtml(m);
  }

  global.Classroom = {
    render: render,
    checkForWork: checkForWork, prefill: prefill,
    syncSoon: syncSoon,
    forget: function () { lastSync = 0; },
    get tab() { return tab; }, set tab(v) { tab = v; }
  };
})(window);
