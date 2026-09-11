/* ------------------------------------------------------------------
   LearnGeo — teacher workspace.

   Laid out like a classroom app: a banner with the class code, then
   Stream, Classwork, People and Analytics.

   There is no server. Assignments travel as codes, and results come
   back the same way. Twenty results can be pasted in one go, and any
   score can be typed straight into the gradebook instead.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons, A = global.Assignments;

  var tab = 'stream';
  var draftPicker = null;

  function cls() {
    var c = W.state.classroom;
    if (!c.roster) c.roster = [];
    if (!c.assignments) c.assignments = [];
    if (!c.results) c.results = [];
    return c;
  }

  function ensureCode() {
    if (!cls().code) { cls().code = A.classCode(); W.saveNow(); }
    return cls().code;
  }

  /* ============================== helpers =========================== */
  function initials(name) {
    return String(name || '?').trim().split(/\s+/).slice(0, 2)
      .map(function (w) { return w[0]; }).join('').toUpperCase();
  }

  function scoreClass(pct) {
    if (pct === null || pct === undefined) return 'gb__score--none';
    return pct >= 80 ? 'gb__score--hi' : pct >= 50 ? 'gb__score--mid' : 'gb__score--lo';
  }

  /* Latest result per (student, assignment). */
  function resultFor(name, assignmentId) {
    var best = null;
    cls().results.forEach(function (r) {
      if (r.name !== name || r.assignmentId !== assignmentId) return;
      if (!best || r.at > best.at) best = r;
    });
    return best;
  }

  /* Everyone the class knows about: the roster plus anyone who sent a result. */
  function people() {
    var seen = {}, out = [];
    cls().roster.forEach(function (n) { if (!seen[n]) { seen[n] = 1; out.push(n); } });
    cls().results.forEach(function (r) {
      if (!seen[r.name]) { seen[r.name] = 1; out.push(r.name); }
    });
    return out.sort();
  }

  function avg(nums) {
    if (!nums.length) return null;
    return Math.round(nums.reduce(function (a, b) { return a + b; }, 0) / nums.length);
  }

  /* ============================== shell ============================= */
  function render() {
    var host = document.getElementById('view-teacher');
    if (!host) return;
    var c = cls();
    var roster = people();

    var counts = {
      stream: 0,
      classwork: c.assignments.length,
      people: roster.length,
      analytics: c.results.length
    };

    host.innerHTML =
      '<div class="cr">' +
        '<div class="cr-banner">' +
          '<div>' +
            '<h1>' + W.escapeHtml(c.name || 'Your class') + '</h1>' +
            '<p>' + c.assignments.length + ' assignment' + (c.assignments.length === 1 ? '' : 's') +
              ' · ' + roster.length + ' student' + (roster.length === 1 ? '' : 's') +
              ' · ' + c.results.length + ' result' + (c.results.length === 1 ? '' : 's') + ' in' +
              (classAverage() === null ? '' : ' · ' + classAverage() + '% class average') + '</p>' +
          '</div>' +
          '<button class="cr-banner__code" id="tm-copycode" title="Copy class code">' +
            '<span>Class code</span><b>' + ensureCode() + '</b>' +
          '</button>' +
        '</div>' +

        '<div class="cr-tabs">' +
          crTab('stream', I.layers, 'Stream') +
          crTab('classwork', I.clip, 'Classwork', counts.classwork) +
          crTab('people', I.users, 'People', counts.people) +
          crTab('analytics', I.chart, 'Analytics') +
          crTab('settings', I.gear, 'Settings') +
        '</div>' +

        '<div id="cr-body">' + panel() + '</div>' +
      '</div>';

    W.$$('.cr-tab', host).forEach(function (b) {
      b.addEventListener('click', function () { tab = b.dataset.t; render(); });
    });
    document.getElementById('tm-copycode').addEventListener('click', function () {
      copy(ensureCode(), 'Class code copied');
    });
    wirePanel();

    function crTab(id, icon, label, n) {
      return '<button class="cr-tab' + (tab === id ? ' is-active' : '') + '" data-t="' + id + '">' +
        icon + label + (n ? '<span class="cr-tab__n">' + n + '</span>' : '') + '</button>';
    }
  }

  function panel() {
    if (tab === 'classwork') return classworkPanel();
    if (tab === 'people') return peoplePanel();
    if (tab === 'analytics') return analyticsPanel();
    if (tab === 'settings') return settingsPanel();
    return streamPanel();
  }

  function wirePanel() {
    var host = document.getElementById('cr-body');
    if (!host) return;

    bind('#tm-new', function () { openBuilder(); });
    bind('#tm-collect', openCollect);
    bind('#tm-invite', shareInvite);
    bind('#tm-addperson', openAddPerson);
    bind('#tm-export', exportCsv);

    W.$$('[data-share]', host).forEach(function (b) {
      b.addEventListener('click', function () { shareAssignment(cls().assignments[+b.dataset.share]); });
    });
    W.$$('[data-edit]', host).forEach(function (b) {
      b.addEventListener('click', function () { openBuilder(cls().assignments[+b.dataset.edit], +b.dataset.edit); });
    });
    W.$$('[data-try]', host).forEach(function (b) {
      b.addEventListener('click', function () {
        var a = cls().assignments[+b.dataset.try];
        global.UI.startPreview('Previewing "' + a.title + '"');
        A.run(a);
      });
    });
    W.$$('[data-del]', host).forEach(function (b) {
      b.addEventListener('click', function () { removeAssignment(+b.dataset.del); });
    });
    W.$$('[data-cell]', host).forEach(function (b) {
      b.addEventListener('click', function () {
        var p = b.dataset.cell.split('|');
        openScoreEntry(p[0], p[1]);
      });
    });
    W.$$('[data-rmperson]', host).forEach(function (b) {
      b.addEventListener('click', function () { removePerson(b.dataset.rmperson); });
    });

    bind('#tm-leave', leaveTeacher);
    var nameEl = W.$('#tm-name', host);
    if (nameEl) nameEl.addEventListener('change', function () {
      cls().name = nameEl.value.trim().slice(0, 40); W.saveNow(); render();
    });

    function bind(sel, fn) { var el = W.$(sel, host); if (el) el.addEventListener('click', fn); }
  }

  /* ============================== stream ============================ */
  function streamPanel() {
    var c = cls();
    var recent = c.results.slice().sort(function (a, b) { return b.at - a.at; }).slice(0, 8);

    return '<div class="cr-grid">' +
      '<div>' +
        '<div class="cr-card" style="margin-bottom:14px">' +
          '<div class="cr-card__head"><h3>Hand out work</h3></div>' +
          '<button class="btn btn--accent btn--block" id="tm-new">' + I.plus + ' New assignment</button>' +
          '<button class="btn btn--primary btn--block" id="tm-invite" style="margin-top:8px">' +
            I.key + ' Get the join code</button>' +
          '<button class="btn btn--ghost btn--block" id="tm-collect" style="margin-top:8px">' +
            I.inbox + ' Collect results</button>' +
        '</div>' +
      '</div>' +

      '<div>' +
        (c.assignments.length ? '' :
          '<div class="cr-card" style="margin-bottom:14px">' + emptyCta(I.clip, 'No classwork yet',
            'Write your first assignment and LearnGeo turns it into a code you can hand out.') + '</div>') +
        '<div class="cr-card">' +
          '<div class="cr-card__head"><h3>Recent activity</h3>' +
            '<span class="eyebrow">' + c.results.length + ' total</span></div>' +
          (recent.length
            ? recent.map(function (r) {
                return '<div class="person">' +
                  '<div class="person__av">' + initials(r.name) + '</div>' +
                  '<div class="person__t"><b>' + W.escapeHtml(r.name) + '</b>' +
                    '<span>handed in ' + W.escapeHtml(r.title) + '</span></div>' +
                  '<span class="gb__score ' + scoreClass(r.pct) + '">' + r.pct + '%</span>' +
                '</div>';
              }).join('')
            : '<div class="empty" style="padding:22px 0">Nothing handed in yet.</div>') +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function emptyCta(icon, title, body) {
    return '<div class="empty-cta"><div class="empty-cta__i">' + icon + '</div>' +
      '<b>' + title + '</b><p>' + body + '</p></div>';
  }

  /* ============================ classwork =========================== */
  function classworkPanel() {
    var list = cls().assignments;
    return '<div class="row row--between" style="margin-bottom:16px">' +
        '<div><h3 style="font-size:18px">Classwork</h3>' +
        '<div class="t-sm t-muted">Each one carries its own code.</div></div>' +
        '<button class="btn btn--accent" id="tm-new">' + I.plus + ' New assignment</button>' +
      '</div>' +
      (list.length
        ? list.map(function (a, i) {
            var done = cls().results.filter(function (r) { return r.assignmentId === a.id; });
            var names = {}; done.forEach(function (r) { names[r.name] = 1; });
            var handedIn = Object.keys(names).length;
            var mean = avg(done.map(function (r) { return r.pct; }));
            var n = (a.config.countries && a.config.countries.length) || a.config.count || 0;
            return '<div class="cw-row">' +
              '<div class="cw-row__i">' + (a.mode === 'cards' ? I.cards : a.mode === 'learn' ? I.book : I.clip) + '</div>' +
              '<div class="cw-row__t"><b>' + W.escapeHtml(a.title) + '</b>' +
                '<span>' + modeLabel(a.mode) + ' · ' + n + ' items' +
                (a.config.timed ? ' · timed' : '') + (a.config.instant === false ? ' · exam mode' : '') + '</span></div>' +
              '<div class="cw-row__meta"><b>' + handedIn + '/' + Math.max(handedIn, people().length) + '</b>' +
                'handed in' + (mean !== null ? ' · avg ' + mean + '%' : '') + '</div>' +
              '<div class="row" style="gap:4px">' +
                '<button class="icon-btn" data-try="' + i + '" title="Try it yourself">' + I.arrowR + '</button>' +
                '<button class="icon-btn" data-share="' + i + '" title="Get the code">' + I.key + '</button>' +
                '<button class="icon-btn" data-edit="' + i + '" title="Edit">' + I.gear + '</button>' +
                '<button class="icon-btn" data-del="' + i + '" title="Delete">' + I.close + '</button>' +
              '</div></div>';
          }).join('')
        : '<div class="cr-card">' + emptyCta(I.clip, 'No assignments yet',
            'Pick the countries, set the conditions, and hand out the code.') + '</div>');
  }

  /* ============================== people ============================ */
  function peoplePanel() {
    var roster = people();
    var list = cls().assignments;
    return '<div class="row row--between" style="margin-bottom:16px">' +
        '<div><h3 style="font-size:18px">People</h3>' +
        '<div class="t-sm t-muted">Anyone who hands work in is added automatically.</div></div>' +
        '<div class="row" style="gap:8px">' +
          '<button class="btn btn--ghost" id="tm-collect">' + I.inbox + ' Collect results</button>' +
          '<button class="btn btn--accent" id="tm-addperson">' + I.plus + ' Add student</button>' +
        '</div>' +
      '</div>' +
      '<div class="cr-card">' +
        (roster.length
          ? roster.map(function (n) {
              var done = list.filter(function (a) { return !!resultFor(n, a.id); }).length;
              var mine = cls().results.filter(function (r) { return r.name === n; });
              var mean = avg(mine.map(function (r) { return r.pct; }));
              return '<div class="person">' +
                '<div class="person__av">' + initials(n) + '</div>' +
                '<div class="person__t"><b>' + W.escapeHtml(n) + '</b>' +
                  '<span>' + done + ' of ' + list.length + ' handed in' +
                  (mean !== null ? ' · average ' + mean + '%' : '') + '</span></div>' +
                '<span class="pill-tag ' + (list.length && done === list.length ? 'pill-tag--done' : '') + '">' +
                  (list.length ? Math.round((done / list.length) * 100) + '%' : '—') + '</span>' +
                '<button class="icon-btn" data-rmperson="' + W.escapeHtml(n) + '" title="Remove">' + I.close + '</button>' +
              '</div>';
            }).join('')
          : emptyCta(I.users, 'Nobody yet',
              'Add students by name, or let them appear as their results come in.')) +
      '</div>';
  }

  /* ============================ analytics =========================== */
  function classAverage() {
    return avg(cls().results.map(function (r) { return r.pct; }));
  }

  function analyticsPanel() {
    var c = cls();
    var roster = people();
    var list = c.assignments;

    if (!c.results.length) {
      return '<div class="cr-card">' + emptyCta(I.chart, 'No data yet',
        'Once students hand work in, this fills with class averages, who is struggling, ' +
        'and which countries the room keeps missing.') +
        '<div class="t-center"><button class="btn btn--accent" id="tm-collect">' +
        I.inbox + ' Collect results</button></div></div>';
    }

    /* which countries the class as a whole keeps missing */
    var missCount = {};
    c.results.forEach(function (r) {
      (r.missed || []).forEach(function (n) { missCount[n] = (missCount[n] || 0) + 1; });
    });
    var hardest = Object.keys(missCount)
      .sort(function (a, b) { return missCount[b] - missCount[a]; })
      .slice(0, 8);
    var worstCount = hardest.length ? missCount[hardest[0]] : 1;

    /* score distribution in ten-point bands */
    var bands = new Array(10).fill(0);
    c.results.forEach(function (r) {
      bands[Math.min(9, Math.floor(r.pct / 10))] += 1;
    });
    var peak = Math.max.apply(null, bands) || 1;

    /* per-student averages, weakest first */
    var byStudent = roster.map(function (n) {
      var mine = c.results.filter(function (r) { return r.name === n; });
      return { name: n, mean: avg(mine.map(function (r) { return r.pct; })), n: mine.length };
    }).filter(function (s) { return s.mean !== null; })
      .sort(function (a, b) { return a.mean - b.mean; });

    var handedIn = {};
    c.results.forEach(function (r) { handedIn[r.name + '|' + r.assignmentId] = 1; });
    var expected = roster.length * list.length;
    var completion = expected ? Math.round((Object.keys(handedIn).length / expected) * 100) : 0;

    return '<h3 style="font-size:18px;margin-bottom:4px">Analytics</h3>' +
      '<div class="t-sm t-muted" style="margin-bottom:16px">Across ' + c.results.length +
        ' submission' + (c.results.length === 1 ? '' : 's') + '.</div>' +

      '<div class="an-grid" style="margin-bottom:20px">' +
        anStat(classAverage() + '%', 'class average', bandLabel(classAverage())) +
        anStat(completion + '%', 'handed in', Object.keys(handedIn).length + ' of ' + expected + ' expected') +
        anStat(byStudent.length ? byStudent[byStudent.length - 1].mean + '%' : '—', 'top average',
               byStudent.length ? byStudent[byStudent.length - 1].name : '') +
        anStat(byStudent.length ? byStudent[0].mean + '%' : '—', 'needs help most',
               byStudent.length ? byStudent[0].name : '') +
      '</div>' +

      '<div class="cr-grid" style="grid-template-columns:1fr 1fr">' +
        '<div class="cr-card">' +
          '<div class="cr-card__head"><h3>Average by assignment</h3></div>' +
          (list.length ? list.map(function (a) {
            var mine = c.results.filter(function (r) { return r.assignmentId === a.id; });
            var m = avg(mine.map(function (r) { return r.pct; }));
            return bar(a.title, m === null ? 0 : m, m === null ? 'no results' : m + '%',
                       m === null ? 'var(--line)' : barColour(m));
          }).join('') : '<div class="empty">No assignments.</div>') +
        '</div>' +

        '<div class="cr-card">' +
          '<div class="cr-card__head"><h3>Hardest for the class</h3>' +
            '<span class="eyebrow">most missed</span></div>' +
          (hardest.length ? hardest.map(function (n) {
            var cty = global.GeoData.countries.filter(function (x) { return x.name === n; })[0];
            return bar(n + (cty ? ' · ' + cty.capital : ''),
                       Math.round((missCount[n] / worstCount) * 100),
                       missCount[n] + '×', 'var(--danger)');
          }).join('') : '<div class="empty">Nothing missed yet.</div>') +
        '</div>' +
      '</div>' +

      '<div class="cr-card" style="margin-top:14px">' +
        '<div class="cr-card__head"><h3>Score spread</h3>' +
          '<span class="eyebrow">' + c.results.length + ' submissions</span></div>' +
        '<div class="hist">' +
          bands.map(function (v) {
            return '<div class="hist__col"><div class="hist__bar" style="height:' +
              Math.round((v / peak) * 100) + '%;background:' + barColour((bands.indexOf(v) + 0.5) * 10) + '"></div></div>';
          }).join('') +
        '</div>' +
        '<div class="row" style="gap:6px">' +
          bands.map(function (v, i) {
            return '<div class="hist__lab" style="flex:1">' + (i * 10) + '</div>';
          }).join('') +
        '</div>' +
      '</div>' +

      '<div class="row row--between" style="margin:22px 0 12px">' +
        '<h3 style="font-size:16px">Gradebook</h3>' +
        '<button class="btn btn--ghost btn--sm" id="tm-export">Export CSV</button>' +
      '</div>' +
      gradebook(roster, list);

    function anStat(n, l, sub) {
      return '<div class="an-stat"><div class="an-stat__n">' + n + '</div>' +
        '<div class="an-stat__l">' + l + '</div>' +
        (sub ? '<div class="an-stat__sub">' + W.escapeHtml(sub) + '</div>' : '') + '</div>';
    }
    function bar(label, pct, right, colour) {
      return '<div class="an-bar"><div class="an-bar__label"><span>' + W.escapeHtml(label) + '</span></div>' +
        '<div class="an-bar__n">' + right + '</div>' +
        '<div class="an-bar__track" style="grid-column:1/-1"><div class="an-bar__fill" style="width:' +
        pct + '%;background:' + colour + '"></div></div></div>';
    }
  }

  function bandLabel(p) {
    if (p === null) return '';
    return p >= 80 ? 'the class has this' : p >= 60 ? 'getting there' : 'needs another pass';
  }
  function barColour(p) {
    return p >= 80 ? 'var(--success)' : p >= 50 ? 'var(--gold)' : 'var(--danger)';
  }

  function gradebook(roster, list) {
    if (!roster.length || !list.length) {
      return '<div class="cr-card"><div class="empty" style="padding:20px 0">' +
        'Add students and assignments to see the gradebook.</div></div>';
    }
    return '<div class="gb-wrap"><table class="gb"><thead><tr>' +
      '<th>Student</th>' +
      list.map(function (a) { return '<th>' + W.escapeHtml(a.title) + '</th>'; }).join('') +
      '<th>Average</th></tr></thead><tbody>' +
      roster.map(function (n) {
        var scores = [];
        var cells = list.map(function (a) {
          var r = resultFor(n, a.id);
          if (r) scores.push(r.pct);
          return '<td><button class="gb__cell-btn" data-cell="' + W.escapeHtml(n) + '|' + a.id + '" ' +
            'title="Click to set a score"><span class="gb__score ' + scoreClass(r ? r.pct : null) + '">' +
            (r ? r.pct + '%' : '–') + '</span></button></td>';
        }).join('');
        var m = avg(scores);
        return '<tr><td class="gb__name">' + W.escapeHtml(n) + '</td>' + cells +
          '<td><span class="gb__score ' + scoreClass(m) + '">' + (m === null ? '–' : m + '%') + '</span></td></tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  /* ============================= settings =========================== */
  function settingsPanel() {
    var c = cls();
    return '<div class="cr-grid">' +
      '<div class="cr-card">' +
        '<div class="cr-card__head"><h3>Class</h3></div>' +
        '<div class="field"><label class="field__label">Class name</label>' +
          '<input class="input" id="tm-name" maxlength="40" placeholder="e.g. Period 3 Geography" ' +
            'value="' + W.escapeHtml(c.name) + '"></div>' +
        '<div class="field"><label class="field__label">Class code</label>' +
          '<div class="code-chip">' + ensureCode() + '</div>' +
          '<div class="field__hint">Students type this in once so their work carries your class name.</div></div>' +
      '</div>' +
      '<div class="cr-card">' +
        '<div class="cr-card__head"><h3>Data</h3></div>' +
        '<p class="t-sm t-muted" style="margin-bottom:14px">Everything lives in this browser. ' +
          'Export the gradebook if you need it somewhere else.</p>' +
        '<button class="btn btn--ghost btn--block" id="tm-export">Export gradebook CSV</button>' +
        '<button class="btn btn--ghost btn--block" id="tm-leave" style="margin-top:8px">' +
          'Switch to a student account</button>' +
        '<div class="field__hint" style="margin-top:8px">Your class, assignments and results stay ' +
          'saved. To come back, open the For teachers page from the home site.</div>' +
      '</div>' +
    '</div>';
  }

  /* ============================= actions ============================ */
  function openAddPerson() {
    global.UI.modal({
      title: 'Add students', icon: I.users,
      body: '<div class="field"><label class="field__label">One name per line</label>' +
        '<textarea class="input" id="ap-names" style="min-height:150px" ' +
        'placeholder="Ada Lovelace&#10;Sam Okafor&#10;Yuki Tanaka"></textarea>' +
        '<div class="field__hint">Names only. This is just so you can see who has not handed in yet.</div></div>',
      actions: [
        { label: 'Cancel', cls: 'btn--ghost', close: true },
        { label: 'Add', cls: 'btn--accent', close: true, onClick: function (root) {
            var names = W.$('#ap-names', root).value.split('\n')
              .map(function (n) { return n.trim(); }).filter(Boolean);
            names.forEach(function (n) {
              if (cls().roster.indexOf(n) === -1) cls().roster.push(n);
            });
            W.saveNow(); render();
            W.toast(names.length + ' added', 'They show up in People and the gradebook', I.check);
          } }
      ]
    });
  }

  function removePerson(name) {
    cls().roster = cls().roster.filter(function (n) { return n !== name; });
    W.saveNow(); render();
  }

  /* Paste the whole class at once. */
  function openCollect() {
    global.UI.modal({
      title: 'Collect results', icon: I.inbox, wide: true,
      body: '<p class="t-muted" style="margin-bottom:14px">Paste every code your students sent. ' +
              'They can be on separate lines, in one blob, or mixed in with other text. ' +
              'LearnGeo picks out the codes and ignores the rest.</p>' +
            '<textarea class="input mono" id="cl-codes" style="min-height:190px" ' +
              'placeholder="LGR-…&#10;LGR-…&#10;LGR-…"></textarea>' +
            '<div id="cl-out"></div>',
      actions: [
        { label: 'Close', cls: 'btn--ghost', close: true },
        { label: 'Add them', cls: 'btn--accent', onClick: function (root) {
            var res = A.decodeResultBatch(W.$('#cl-codes', root).value);
            if (!res.ok.length) {
              W.$('#cl-out', root).innerHTML =
                '<div class="feedback feedback--wrong" style="margin-top:12px">' + I.info +
                '<div><b>No codes found</b><p>Result codes start with LGR-. ' +
                'Check the paste came through in full.</p></div></div>';
              return false;
            }
            var added = 0, dupes = 0;
            res.ok.forEach(function (r) {
              var exists = cls().results.some(function (x) {
                return x.name === r.name && x.assignmentId === r.assignmentId && x.at === r.at;
              });
              if (exists) { dupes += 1; return; }
              cls().results.push(r);
              if (cls().roster.indexOf(r.name) === -1) cls().roster.push(r.name);
              added += 1;
            });
            W.saveNow();
            W.$('#cl-out', root).innerHTML =
              '<div class="feedback feedback--right" style="margin-top:12px">' + I.check +
              '<div><b>' + added + ' recorded</b><p>' +
              (dupes ? dupes + ' were already in. ' : '') +
              (res.bad ? res.bad + ' could not be read. ' : '') +
              'Names not on the roster were added.</p></div></div>';
            W.$('#cl-codes', root).value = '';
            render();
            return false;
          } }
      ],
      onMount: function (root) { setTimeout(function () { W.$('#cl-codes', root).focus(); }, 60); }
    });
  }

  /* Type a score straight into a gradebook cell. */
  function openScoreEntry(name, assignmentId) {
    var a = cls().assignments.filter(function (x) { return x.id === assignmentId; })[0];
    var existing = resultFor(name, assignmentId);
    global.UI.modal({
      title: W.escapeHtml(name),
      icon: I.chart,
      body: '<p class="t-muted" style="margin-bottom:14px">' + W.escapeHtml(a ? a.title : 'Assignment') + '</p>' +
        '<div class="field"><label class="field__label">Score, as a percentage</label>' +
        '<input class="input mono" id="se-pct" type="number" min="0" max="100" ' +
          'value="' + (existing ? existing.pct : '') + '" placeholder="0 – 100"></div>',
      actions: [
        (existing ? { label: 'Clear', cls: 'btn--ghost', close: true, onClick: function () {
            cls().results = cls().results.filter(function (r) {
              return !(r.name === name && r.assignmentId === assignmentId);
            });
            W.saveNow(); render();
          } } : { label: 'Cancel', cls: 'btn--ghost', close: true }),
        { label: 'Save', cls: 'btn--accent', close: true, onClick: function (root) {
            var v = parseInt(W.$('#se-pct', root).value, 10);
            if (isNaN(v)) return;
            v = Math.max(0, Math.min(100, v));
            cls().results = cls().results.filter(function (r) {
              return !(r.name === name && r.assignmentId === assignmentId);
            });
            cls().results.push({ assignmentId: assignmentId, title: a ? a.title : '', name: name,
                                 pct: v, correct: null, total: null, at: Date.now(), missed: [],
                                 manual: true });
            if (cls().roster.indexOf(name) === -1) cls().roster.push(name);
            W.saveNow(); render();
          } }
      ],
      onMount: function (root) { setTimeout(function () { W.$('#se-pct', root).focus(); }, 60); }
    });
  }

  function exportCsv() {
    var roster = people(), list = cls().assignments;
    var rows = [['Student'].concat(list.map(function (a) { return a.title; })).concat(['Average'])];
    roster.forEach(function (n) {
      var scores = [];
      var line = [n].concat(list.map(function (a) {
        var r = resultFor(n, a.id);
        if (r) scores.push(r.pct);
        return r ? r.pct : '';
      }));
      line.push(avg(scores) === null ? '' : avg(scores));
      rows.push(line);
    });
    var csv = rows.map(function (r) {
      return r.map(function (cell) {
        var s = String(cell === null || cell === undefined ? '' : cell);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(',');
    }).join('\n');

    global.UI.modal({
      title: 'Gradebook CSV', icon: I.chart, wide: true,
      body: '<p class="t-muted" style="margin-bottom:12px">Copy this into a spreadsheet.</p>' +
        '<textarea class="input mono" style="min-height:220px" readonly id="ex-csv">' +
        W.escapeHtml(csv) + '</textarea>',
      actions: [
        { label: 'Close', cls: 'btn--ghost', close: true },
        { label: 'Copy', cls: 'btn--accent', onClick: function () { copy(csv, 'CSV copied'); return false; } }
      ],
      onMount: function (root) { setTimeout(function () { W.$('#ex-csv', root).select(); }, 60); }
    });
  }

  function modeLabel(m) {
    return { learn: 'Learn', test: 'Practice test', cards: 'Flashcards', quiz: 'Class quiz' }[m] || m;
  }

  function removeAssignment(i) {
    var a = cls().assignments[i];
    global.UI.modal({
      title: 'Delete assignment', icon: I.close,
      body: '<p class="t-muted">Remove <b>' + W.escapeHtml(a.title) + '</b>? ' +
        'Results already collected stay in the gradebook.</p>',
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
      id: 'a' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36),
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
          seg('timed', 'Timed', cfg.timed ? 'timed' : 'untimed') + '</div>' +
        '<div class="seg" style="margin-top:8px" id="ab-instant">' +
          seg('instant', 'Feedback after each', cfg.instant === false ? 'end' : 'instant') +
          seg('end', 'Exam mode', cfg.instant === false ? 'end' : 'instant') + '</div>' +
        '<div class="seg" style="margin-top:8px" id="ab-typed">' +
          seg('choice', 'Multiple choice', cfg.typed ? 'typed' : 'choice') +
          seg('typed', 'Type the answer', cfg.typed ? 'typed' : 'choice') + '</div></div>';

    global.UI.modal({
      title: existing ? 'Edit assignment' : 'New assignment',
      icon: I.clip, wide: true, body: body,
      actions: [
        { label: 'Cancel', cls: 'btn--ghost', close: true },
        { label: existing ? 'Save' : 'Create', cls: 'btn--accent', close: true,
          onClick: function (root) { saveAssignment(root, a, index); } }
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

  function saveAssignment(root, a, index) {
    var v = function (sel) { var n = W.$(sel + ' .is-active', root); return n ? n.dataset.v : null; };
    var picked = draftPicker ? draftPicker.value : [];
    var types = W.$$('#ab-types .check.is-on', root).map(function (n) { return n.dataset.v; });

    a.title = W.$('#ab-title', root).value.trim() || 'Untitled assignment';
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

    if (index === undefined || index === null) cls().assignments.push(a);
    else cls().assignments[index] = a;
    W.saveNow();
    tab = 'classwork';
    render();
    W.toast('Assignment saved', a.title, I.check);
  }

  /* ============================== sharing =========================== */
  /* One code for the whole class: the class code, the name, and every
     assignment. Students paste it once when they join, and again later to
     pick up anything new. */
  function shareInvite() {
    var c = cls();
    var code = A.encodePack(c);
    if (!code) { W.toast('Could not build the code', 'Try again', I.info); return; }
    global.UI.modal({
      title: 'Join code for ' + (c.name || 'your class'),
      icon: I.key, wide: true,
      body: '<p class="t-muted" style="margin-bottom:16px">Give your class ' +
              '<b>both</b> of these. The short code is what they type; the long one carries ' +
              'the work.</p>' +
            '<div class="field"><label class="field__label">1. Class code, they type this</label>' +
              '<div class="code-chip">' + c.code + '</div></div>' +
            '<div class="field"><label class="field__label">2. Join code, they paste this</label>' +
              '<div class="share-box">' + W.escapeHtml(code) + '</div></div>' +
            '<div class="feedback" style="background:var(--accent-soft);margin:4px 0 0">' + I.info +
              '<div><b style="color:var(--accent-ink)">It carries all ' + c.assignments.length +
              ' assignment' + (c.assignments.length === 1 ? '' : 's') + '</b>' +
              '<p>Add more work later and send the same join code again. Students only ' +
              'pick up what they do not already have.</p></div></div>',
      actions: [
        { label: 'Close', cls: 'btn--ghost', close: true },
        { label: 'Copy join code', cls: 'btn--accent', onClick: function () {
            copy(code, 'Join code copied'); return false;
          } }
      ]
    });
  }

  function shareAssignment(a) {
    var code = A.encode(a);
    if (!code) { W.toast('Could not build a code', 'Try again', I.info); return; }
    global.UI.modal({
      title: 'Hand out "' + a.title + '"',
      icon: I.key, wide: true,
      body: '<p class="t-muted" style="margin-bottom:14px">Send this to your class. They open ' +
              '<b>Classroom</b>, hit <b>Add assignment</b> and paste it in.</p>' +
            '<div class="share-box">' + W.escapeHtml(code) + '</div>' +
            '<div class="field__hint" style="margin-top:10px">The code carries the whole assignment, ' +
              'so it works even for a student opening LearnGeo for the first time.</div>',
      actions: [
        { label: 'Close', cls: 'btn--ghost', close: true },
        { label: 'Copy code', cls: 'btn--accent', onClick: function () { copy(code, 'Code copied'); return false; } }
      ]
    });
  }

  function shareResult(assignment, pct, correct, total, missed) {
    var name = W.state.profile.displayName || 'Student';
    var code = A.encodeResult({
      assignmentId: assignment.id, title: assignment.title,
      name: name, pct: pct, correct: correct, total: total, missed: missed || []
    });
    if (!code) { W.toast('Could not build a code', 'Try again', I.info); return; }
    global.UI.modal({
      title: 'Send your score', icon: I.key, wide: true,
      body: '<p class="t-muted" style="margin-bottom:14px">This says who you are, which assignment ' +
              'it was, what you scored and which ones you missed. Send it to your teacher.</p>' +
            '<div class="share-box">' + W.escapeHtml(code) + '</div>' +
            '<div class="row" style="gap:8px;margin-top:14px">' +
              '<span class="chip chip--xp mono">' + W.escapeHtml(name) + '</span>' +
              '<span class="chip chip--gem mono">' + correct + '/' + total + ' · ' + pct + '%</span>' +
            '</div>',
      actions: [
        { label: 'Close', cls: 'btn--ghost', close: true },
        { label: 'Copy code', cls: 'btn--accent', onClick: function () { copy(code, 'Result code copied'); return false; } }
      ]
    });
  }

  function copy(text, msg) {
    var done = function () { W.toast(msg, '', I.check); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else fallback();
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); }
      catch (e) { W.toast('Copy it by hand', 'The browser blocked the clipboard', I.info); }
      ta.remove();
    }
  }

  function becomeTeacher() {
    W.state.role = 'teacher';
    ensureCode();
    W.saveNow();
    global.UI.refreshTabs();
    global.UI.go('teacher');
  }

  function leaveTeacher() {
    W.state.role = 'student';
    W.saveNow();
    global.UI.refreshTabs();
    global.UI.go('portal');
  }

  global.Teacher = {
    render: render, openBuilder: openBuilder, becomeTeacher: becomeTeacher,
    leaveTeacher: leaveTeacher, shareAssignment: shareAssignment, shareResult: shareResult,
    openCollect: openCollect, ensureCode: ensureCode, copy: copy,
    get tab() { return tab; }, set tab(v) { tab = v; }
  };
})(window);
