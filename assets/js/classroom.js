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
  function render() {
    var host = document.getElementById('view-classroom');
    if (!host) return;
    if (!enrolled()) return renderJoin(host);
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

  /* You cannot see any classwork until you have joined with the code your
     teacher gave you. The join code carries the class and its assignments;
     the class code is what proves you were meant to have it. */
  function renderJoin(host) {
    host.innerHTML =
      '<div class="cr" style="max-width:620px">' +
        '<div class="join-card">' +
          '<div class="join-card__i">' + I.users + '</div>' +
          '<h2>Join your class</h2>' +
          '<p>Your teacher will give you a class code and a join code. ' +
             'You only have to do this once.</p>' +

          '<div class="field" style="margin-top:22px">' +
            '<label class="field__label" for="j-code">Class code</label>' +
            '<input class="input mono join-code" id="j-code" maxlength="10" ' +
              'placeholder="ABC123" autocomplete="off" spellcheck="false">' +
          '</div>' +

          '<div class="field">' +
            '<label class="field__label" for="j-name">Your name</label>' +
            '<input class="input" id="j-name" maxlength="40" placeholder="First and last name" ' +
              'value="' + W.escapeHtml(W.state.profile.displayName === 'Explorer' ? '' : W.state.profile.displayName) + '">' +
            '<div class="field__hint">This is the name your teacher sees next to your scores.</div>' +
          '</div>' +

          '<div class="field">' +
            '<label class="field__label" for="j-pack">Join code</label>' +
            '<textarea class="input mono" id="j-pack" style="min-height:92px" ' +
              'placeholder="LGC-…"></textarea>' +
            '<div class="field__hint">Paste the long code your teacher sent.</div>' +
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
    setTimeout(function () { codeEl.focus(); }, 60);
  }

  function joinError(host, title, body) {
    W.$('#j-err', host).innerHTML =
      '<div class="feedback feedback--wrong" style="margin:0 0 12px">' + I.info +
      '<div><b>' + title + '</b><p>' + body + '</p></div></div>';
  }

  function join(host) {
    var code = W.$('#j-code', host).value.trim().toUpperCase();
    var name = W.$('#j-name', host).value.trim();
    var pack = W.$('#j-pack', host).value;

    if (!code) return joinError(host, 'Class code needed', 'Ask your teacher for the class code.');
    if (!name) return joinError(host, 'Name needed', 'Your teacher needs to know whose work this is.');

    var parsed = A.decodePack(pack);
    if (!parsed) {
      return joinError(host, 'That join code did not read',
        'It should start with LGC-. Check the whole thing copied across.');
    }
    if (parsed.code !== code) {
      return joinError(host, 'Class code does not match',
        'That join code belongs to class ' + W.escapeHtml(parsed.code) +
        '. Check the code your teacher gave you.');
    }

    W.state.enrolled = { code: parsed.code, className: parsed.name, name: name };
    W.state.profile.displayName = name;
    if (!W.state.inbox) W.state.inbox = [];
    var have = {};
    W.state.inbox.forEach(function (a) { have[a.id] = 1; });
    parsed.assignments.forEach(function (a) {
      if (!have[a.id]) { a.added = Date.now(); W.state.inbox.push(a); }
    });
    W.saveNow();
    W.confetti({ count: 70, power: 240 });
    W.toast('Joined ' + parsed.name, parsed.assignments.length + ' assignment' +
      (parsed.assignments.length === 1 ? '' : 's') + ' added', I.check);
    global.UI.refreshHud();
    tab = 'classwork';
    render();
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
  /* One button, two jobs: paste a fresh join code to pull in everything new,
     or paste a single assignment code. Either way it has to be your class. */
  function openAdd() {
    global.UI.modal({
      title: 'Get new work', icon: I.inbox,
      body: '<p class="t-muted" style="margin-bottom:14px">Paste whatever your teacher sent. ' +
              'A new join code brings in every assignment at once; a single assignment code ' +
              'brings in just that one.</p>' +
            '<div class="field">' +
              '<textarea class="input mono" id="ad-code" style="min-height:120px" ' +
                'placeholder="LGC-…  or  LG1-…"></textarea>' +
              '<div class="field__hint">Joined as <b>' + W.escapeHtml(className()) +
                '</b> (' + W.escapeHtml(classCode()) + ').</div>' +
              '<div id="ad-err"></div></div>',
      actions: [
        { label: 'Cancel', cls: 'btn--ghost', close: true },
        { label: 'Add', cls: 'btn--accent', onClick: function (root, close) {
            var raw = W.$('#ad-code', root).value;
            var mine = classCode();
            var added = 0, dupes = 0, wrongClass = 0;

            /* a whole class pack */
            var pack = A.decodePack(raw);
            if (pack) {
              if (pack.code !== mine) {
                return err(root, 'Different class',
                  'That join code is for class ' + W.escapeHtml(pack.code) +
                  ', but you are in ' + W.escapeHtml(mine) + '.');
              }
              pack.assignments.forEach(function (a) {
                if (inbox().some(function (x) { return x.id === a.id; })) { dupes += 1; return; }
                a.added = Date.now(); inbox().push(a); added += 1;
              });
              if (pack.name) W.state.enrolled.className = pack.name;
            } else {
              /* or one assignment at a time */
              var tokens = raw.match(/LG1-[A-Za-z0-9_-]+/g) || [];
              tokens.forEach(function (t) {
                var a = A.decode(t);
                if (!a) return;
                if (a.classCode && a.classCode !== mine) { wrongClass += 1; return; }
                if (inbox().some(function (x) { return x.id === a.id; })) { dupes += 1; return; }
                a.added = Date.now(); inbox().push(a); added += 1;
              });
              if (!tokens.length) {
                return err(root, 'That code did not read',
                  'Codes start with LGC- or LG1-. Check it copied in full.');
              }
              if (wrongClass && !added) {
                return err(root, 'Different class',
                  'That assignment belongs to another class.');
              }
            }

            W.saveNow();
            if (added) {
              W.confetti({ count: 50, power: 200 });
              W.toast(added + ' added', dupes ? dupes + ' you already had' : '', I.check);
            } else {
              W.toast('Nothing new', 'You already have everything in that code', I.info);
            }
            close(); tab = 'classwork'; render();
          } }
      ],
      onMount: function (root) { setTimeout(function () { W.$('#ad-code', root).focus(); }, 60); }
    });

    function err(root, title, body) {
      W.$('#ad-err', root).innerHTML =
        '<div class="feedback feedback--wrong" style="margin-top:10px">' + I.info +
        '<div><b>' + title + '</b><p>' + body + '</p></div></div>';
      return false;
    }
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
