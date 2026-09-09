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

  function inbox() {
    if (!W.state.inbox) W.state.inbox = [];
    return W.state.inbox;
  }

  /* The class name comes off the assignments themselves, so a student
     never has to be enrolled in anything. */
  function className() {
    var box = inbox();
    for (var i = box.length - 1; i >= 0; i--) {
      if (box[i].from) return box[i].from;
    }
    return '';
  }

  function classCode() {
    var box = inbox();
    for (var i = box.length - 1; i >= 0; i--) {
      if (box[i].classCode) return box[i].classCode;
    }
    return '';
  }

  function avg(nums) {
    if (!nums.length) return null;
    return Math.round(nums.reduce(function (a, b) { return a + b; }, 0) / nums.length);
  }

  function scoreClass(pct) {
    if (pct === null || pct === undefined) return 'gb__score--none';
    return pct >= 80 ? 'gb__score--hi' : pct >= 50 ? 'gb__score--mid' : 'gb__score--lo';
  }

  /* ============================== render ============================ */
  function render() {
    var host = document.getElementById('view-classroom');
    if (!host) return;
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

  function wire(host) {
    var add = W.$('#cl-add', host);
    if (add) add.addEventListener('click', openAdd);

    W.$$('[data-start]', host).forEach(function (b) {
      b.addEventListener('click', function () { A.run(inbox()[+b.dataset.start]); });
    });
    W.$$('[data-send]', host).forEach(function (b) {
      b.addEventListener('click', function () {
        var a = inbox()[+b.dataset.send];
        if (!a.last) return;
        global.Teacher.shareResult(a, a.last.pct, a.last.correct, a.last.total, a.last.missed || []);
      });
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
          '<div class="t-sm t-muted">Work your teacher has set.</div></div>' +
        '<button class="btn btn--accent" id="cl-add">' + I.plus + ' Add assignment</button>' +
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
                  ? '<button class="btn btn--ghost btn--sm" data-send="' + i + '">' + I.key + ' Send</button>'
                  : '') +
                '<button class="btn btn--' + (a.done ? 'ghost' : 'primary') + ' btn--sm" data-start="' + i + '">' +
                  (a.done ? 'Retry' : 'Start') + '</button>' +
                '<button class="icon-btn" data-drop="' + i + '" title="Remove">' + I.close + '</button>' +
              '</div></div>';
          }).join('')
        : '<div class="cr-card"><div class="empty-cta">' +
            '<div class="empty-cta__i">' + I.inbox + '</div>' +
            '<b>No assignments yet</b>' +
            '<p>When your teacher gives you a code, paste it in here and the work shows up.</p>' +
            '<button class="btn btn--accent" id="cl-add" style="margin-top:16px">' +
              I.plus + ' Add assignment</button>' +
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
      '<div class="t-sm t-muted" style="margin-bottom:16px">Across ' + done.length +
        ' finished assignment' + (done.length === 1 ? '' : 's') + '.</div>' +

      '<div class="an-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:20px">' +
        stat(mean + '%', 'your average') +
        stat(best.best + '%', 'best', best.title) +
        stat(worst.best + '%', 'lowest', worst.title) +
      '</div>' +

      '<div class="cr-card">' +
        '<div class="cr-card__head"><h3>Every assignment</h3></div>' +
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
  function trouble() {
    var count = {};
    inbox().forEach(function (a) {
      if (a.last && a.last.missed) {
        a.last.missed.forEach(function (n) { count[n] = (count[n] || 0) + 1; });
      }
    });
    var names = Object.keys(count).sort(function (a, b) { return count[b] - count[a]; }).slice(0, 8);
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
        'Drill these in Learn</button>' +
    '</div>';
  }

  /* ============================= actions ============================ */
  function openAdd() {
    global.UI.modal({
      title: 'Add an assignment', icon: I.key,
      body: '<div class="field"><label class="field__label">Paste the code from your teacher</label>' +
              '<textarea class="input mono" id="ad-code" style="min-height:120px" ' +
                'placeholder="LG1-…"></textarea>' +
              '<div class="field__hint">You can paste several at once.</div>' +
              '<div id="ad-err"></div></div>',
      actions: [
        { label: 'Cancel', cls: 'btn--ghost', close: true },
        { label: 'Add it', cls: 'btn--accent', onClick: function (root, close) {
            var raw = W.$('#ad-code', root).value;
            var tokens = raw.match(/LG1-[A-Za-z0-9_-]+/g) || [];
            var added = 0, dupes = 0;
            tokens.forEach(function (t) {
              var a = A.decode(t);
              if (!a) return;
              if (inbox().some(function (x) { return x.id === a.id; })) { dupes += 1; return; }
              a.added = Date.now();
              inbox().push(a);
              added += 1;
            });
            if (!added && !dupes) {
              W.$('#ad-err', root).innerHTML =
                '<div class="feedback feedback--wrong" style="margin-top:10px">' + I.info +
                '<div><b>That code did not read</b><p>Assignment codes start with LG1-. ' +
                'Check it copied in full.</p></div></div>';
              return false;
            }
            W.saveNow();
            if (added) {
              W.confetti({ count: 50, power: 200 });
              W.toast(added + ' assignment' + (added === 1 ? '' : 's') + ' added',
                      dupes ? dupes + ' already had' : '', I.check);
            } else {
              W.toast('Already added', 'That one is already in your list', I.info);
            }
            close();
            tab = 'classwork';
            render();
          } }
      ],
      onMount: function (root) { setTimeout(function () { W.$('#ad-code', root).focus(); }, 60); }
    });
  }

  function drop(i) {
    var a = inbox()[i];
    global.UI.modal({
      title: 'Remove assignment', icon: I.close,
      body: '<p class="t-muted">Take <b>' + W.escapeHtml(a.title) + '</b> off your list? ' +
        'You can add it again with the same code.</p>',
      actions: [
        { label: 'Keep it', cls: 'btn--ghost', close: true },
        { label: 'Remove', cls: 'btn--primary', close: true, onClick: function () {
            inbox().splice(i, 1); W.saveNow(); render();
          } }
      ]
    });
  }

  function modeLabel(m) {
    return { learn: 'Learn', test: 'Practice test', cards: 'Flashcards', quiz: 'Class quiz' }[m] || m;
  }

  global.Classroom = {
    render: render,
    openAdd: openAdd,
    get tab() { return tab; }, set tab(v) { tab = v; }
  };
})(window);
