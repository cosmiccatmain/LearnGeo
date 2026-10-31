/* ------------------------------------------------------------------
   LearnGeo — the teacher's grading screens.

   What was here before was one long scroll: four numbers, two bar
   charts, a histogram and a table, in that order, every time. It
   answered one question well — how is the class doing overall — and
   the other three badly.

   A teacher grading actually asks four things, and they are different
   shapes:

     who still owes me work        a list to chase
     how did the class do on THIS  one assignment, everybody on it
     how is THIS student doing     one student, everything they did
     what do they keep getting wrong   the class, in aggregate

   So this is three views behind a segmented control rather than one
   page. Overview keeps the aggregate picture and adds the chasing list.
   By assignment and By student are the two cross-sections that were
   missing, and both show what the old screen threw away: the raw score
   rather than only a percentage, when it was handed in, how many goes
   it took, and which countries that particular student got wrong.

   None of it is new data. Every result already carried correct, total,
   at, manual and missed; the old screen read pct and discarded the
   rest.

   The rules about who a score belongs to are NOT re-implemented here.
   They come from Teacher.data, because a typed name and the account
   that joined under it are one student, and a second copy of that rule
   would drift and start disagreeing about somebody's average.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons;

  /* which of the three views is up, and what each has selected */
  var view = 'overview';
  var pickedAssignment = '';
  var pickedStudent = '';
  var sortBy = 'name';          /* name | average | missing */

  function D() { return global.Teacher && global.Teacher.data; }

  function esc(s) { return W.escapeHtml(String(s === null || s === undefined ? '' : s)); }

  function pct(n) { return (n === null || n === undefined) ? '–' : n + '%'; }

  /* A score a teacher can read at a glance: the percentage, and the raw
     marks behind it when we have them. 70% says less than 14/20 does. */
  function rawOf(r) {
    if (!r || r.correct === null || r.correct === undefined ||
        r.total === null || r.total === undefined || !r.total) return '';
    return r.correct + '/' + r.total;
  }

  function whenOf(r) {
    if (!r || !r.at || !isFinite(r.at)) return '';
    var days = Math.floor((Date.now() - r.at) / 86400000);
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 7) return days + ' days ago';
    try {
      return new Date(r.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    } catch (e) { return ''; }
  }

  function chip(r) {
    var d = D();
    return '<span class="gb__score ' + d.scoreClass(r ? r.pct : null) + '">' +
      (r ? r.pct + '%' : '–') + '</span>';
  }

  /* ============================== the shell ========================= */
  function panel() {
    var d = D();
    if (!d) return '<div class="cr-card"><div class="empty">Grades are not loaded.</div></div>';

    var c = d.cls();
    if (!c.results.length && !c.assignments.length) {
      return '<div class="cr-card"><div class="empty-cta">' +
        '<div class="empty-cta__i">' + I.chart + '</div>' +
        '<b>Nothing to grade yet</b>' +
        '<p>Set an assignment and this fills with scores, who still owes you work, ' +
          'and what the class keeps getting wrong.</p>' +
      '</div></div>';
    }

    return '<div class="row row--between" style="margin-bottom:14px">' +
        '<div><h3 style="font-size:18px">Grades</h3>' +
          '<div class="t-sm t-muted">' + subtitle() + '</div></div>' +
        '<button class="btn btn--ghost btn--sm" id="tm-export">Export CSV</button>' +
      '</div>' +

      '<div class="seg" id="gr-view" style="margin-bottom:18px">' +
        segBtn('overview', 'Overview') +
        segBtn('assignment', 'By assignment') +
        segBtn('student', 'By student') +
      '</div>' +

      '<div id="gr-body">' +
        (view === 'assignment' ? byAssignment()
         : view === 'student' ? byStudent()
         : overview()) +
      '</div>';
  }

  function segBtn(v, label) {
    return '<button data-v="' + v + '" class="' + (view === v ? 'is-active' : '') + '">' +
      label + '</button>';
  }

  function subtitle() {
    var d = D();
    var n = d.latest().length;
    return n
      ? 'Based on ' + n + ' score' + (n === 1 ? '' : 's') + ', the latest from each student.'
      : 'No scores in yet.';
  }

  /* =============================== overview ========================= */
  function overview() {
    var d = D();
    var c = d.cls();
    var roster = d.people();
    var list = c.assignments;
    var scores = d.latest();

    return statRow(roster, list, scores) +
      owedCard(roster, list) +
      '<div class="cr-grid" style="grid-template-columns:1fr 1fr;margin-top:14px">' +
        assignmentAverages(list, scores) +
        hardestCard(scores) +
      '</div>' +
      spreadCard(scores) +
      '<div class="row row--between" style="margin:22px 0 12px">' +
        '<h3 style="font-size:16px">Gradebook</h3>' + sortControl() +
      '</div>' +
      gradebook(roster, list);
  }

  function statRow(roster, list, scores) {
    var d = D();
    var byStudent = roster.map(function (p) {
      var mine = scores.filter(function (r) { return d.isTheirs(r, p); });
      return { name: p.name, mean: d.avg(mine.map(function (r) { return r.pct; })) };
    }).filter(function (s) { return s.mean !== null; })
      .sort(function (a, b) { return a.mean - b.mean; });

    var owed = owedCount(roster, list);
    var expected = roster.length * list.length;
    var inHand = expected - owed;
    var completion = expected ? Math.round((inHand / expected) * 100) : 0;

    return '<div class="an-grid" style="margin-bottom:14px">' +
      stat(pct(d.classAverage()), 'class average', d.bandLabel(d.classAverage())) +
      stat(completion + '%', 'handed in', inHand + ' of ' + expected + ' expected') +
      stat(byStudent.length ? byStudent[byStudent.length - 1].mean + '%' : '—', 'top average',
           byStudent.length ? byStudent[byStudent.length - 1].name : '') +
      stat(byStudent.length ? byStudent[0].mean + '%' : '—', 'needs help most',
           byStudent.length ? byStudent[0].name : '') +
    '</div>';
  }

  function stat(n, l, sub) {
    return '<div class="an-stat"><div class="an-stat__n">' + n + '</div>' +
      '<div class="an-stat__l">' + l + '</div>' +
      (sub ? '<div class="an-stat__sub">' + esc(sub) + '</div>' : '') + '</div>';
  }

  /* --------------------------- who owes what ----------------------
     The daily job, and the old screen could not answer it: a blank cell
     in the table meant "not handed in" and there was no way to see them
     together or to know how old the debt was. */
  function missingPairs(roster, list) {
    var d = D();
    var out = [];
    roster.forEach(function (p) {
      list.forEach(function (a) {
        if (!d.resultFor(p, a.id)) out.push({ p: p, a: a });
      });
    });
    return out;
  }

  function owedCount(roster, list) { return missingPairs(roster, list).length; }

  function owedCard(roster, list) {
    var d = D();
    if (!roster.length || !list.length) return '';
    var missing = missingPairs(roster, list);

    if (!missing.length) {
      return '<div class="cr-card">' +
        '<div class="cr-card__head"><h3>Still to hand in</h3></div>' +
        '<div class="feedback feedback--right">' + I.check +
          '<div><b>Everybody is up to date</b>' +
          '<p>Every student has handed in every assignment you have set.</p></div></div>' +
      '</div>';
    }

    /* grouped by student, because chasing is done per person */
    var byP = {};
    missing.forEach(function (m) {
      var k = d.ownerKey({ studentId: m.p.id, name: m.p.name });
      if (!byP[k]) byP[k] = { p: m.p, titles: [] };
      byP[k].titles.push(m.a.title);
    });
    var rows = Object.keys(byP).map(function (k) { return byP[k]; })
      .sort(function (x, y) { return y.titles.length - x.titles.length; });

    return '<div class="cr-card">' +
      '<div class="cr-card__head"><h3>Still to hand in</h3>' +
        '<span class="eyebrow">' + missing.length + ' piece' +
        (missing.length === 1 ? '' : 's') + ' of work</span></div>' +
      rows.slice(0, 8).map(function (row) {
        return '<div class="person" ' + d.who(row.p) + '>' +
          '<div class="person__av">' + esc(d.initials(row.p.name)) + '</div>' +
          '<div class="person__t"><b>' + esc(row.p.name) + '</b>' +
            '<span>' + esc(row.titles.slice(0, 3).join(', ')) +
            (row.titles.length > 3 ? ' and ' + (row.titles.length - 3) + ' more' : '') +
            '</span></div>' +
          '<span class="pill-tag">' + row.titles.length + ' owed</span>' +
        '</div>';
      }).join('') +
      (rows.length > 8
        ? '<div class="t-sm t-muted" style="padding-top:10px">' +
          'and ' + (rows.length - 8) + ' more students.</div>'
        : '') +
    '</div>';
  }

  function assignmentAverages(list, scores) {
    var d = D();
    return '<div class="cr-card">' +
      '<div class="cr-card__head"><h3>Average by assignment</h3></div>' +
      (list.length ? list.map(function (a) {
        var mine = scores.filter(function (r) { return r.assignmentId === a.id; });
        var m = d.avg(mine.map(function (r) { return r.pct; }));
        return bar(a.title, m === null ? 0 : m, m === null ? 'no scores' : m + '%',
                   m === null ? 'var(--line)' : d.barColour(m),
                   'data-pick-a="' + esc(a.id) + '"');
      }).join('') : '<div class="empty">No assignments yet.</div>') +
    '</div>';
  }

  function missCounts(scores) {
    var count = {};
    scores.forEach(function (r) {
      (r.missed || []).forEach(function (n) { count[n] = (count[n] || 0) + 1; });
    });
    return count;
  }

  function hardestCard(scores) {
    var count = missCounts(scores);
    var names = Object.keys(count)
      .sort(function (a, b) { return count[b] - count[a]; }).slice(0, 8);
    return '<div class="cr-card">' +
      '<div class="cr-card__head"><h3>Hardest for the class</h3>' +
        '<span class="eyebrow">most missed</span></div>' +
      (names.length ? names.map(function (n) {
        var cty = (global.GeoData.countries.filter(function (x) { return x.name === n; })[0]);
        return bar(n + (cty ? ' · ' + cty.capital : ''),
                   Math.round((count[n] / scores.length) * 100),
                   count[n] + ' of ' + scores.length, 'var(--danger)', '');
      }).join('') : '<div class="empty">Nothing missed yet.</div>') +
    '</div>';
  }

  function spreadCard(scores) {
    var d = D();
    var bands = [0,0,0,0,0,0,0,0,0,0];
    scores.forEach(function (r) { bands[Math.min(9, Math.floor(r.pct / 10))] += 1; });
    var peak = Math.max.apply(null, bands) || 1;
    return '<div class="cr-card" style="margin-top:14px">' +
      '<div class="cr-card__head"><h3>Score spread</h3>' +
        '<span class="eyebrow">' + scores.length + ' latest scores</span></div>' +
      '<div class="hist">' +
        bands.map(function (v, i) {
          return '<div class="hist__col"><div class="hist__bar" style="height:' +
            Math.round((v / peak) * 100) + '%;background:' + d.barColour((i + 0.5) * 10) +
            '" title="' + v + ' between ' + (i * 10) + ' and ' + (i * 10 + 9) + '"></div></div>';
        }).join('') +
      '</div>' +
      '<div class="row" style="gap:6px">' +
        bands.map(function (v, i) {
          return '<div class="hist__lab" style="flex:1">' + (i * 10) + '</div>';
        }).join('') +
      '</div>' +
    '</div>';
  }

  function bar(label, width, right, colour, attr) {
    return '<div class="an-bar' + (attr ? ' an-bar--pick' : '') + '" ' + (attr || '') + '>' +
      '<div class="an-bar__label"><span>' + esc(label) + '</span></div>' +
      '<div class="an-bar__n">' + esc(right) + '</div>' +
      '<div class="an-bar__track" style="grid-column:1/-1">' +
        '<div class="an-bar__fill" style="width:' + width + '%;background:' + colour + '"></div>' +
      '</div></div>';
  }

  /* ============================= gradebook ========================== */
  function sortControl() {
    return '<div class="seg seg--sm" id="gr-sort">' +
      '<button data-s="name" class="' + (sortBy === 'name' ? 'is-active' : '') + '">Name</button>' +
      '<button data-s="average" class="' + (sortBy === 'average' ? 'is-active' : '') + '">Average</button>' +
      '<button data-s="missing" class="' + (sortBy === 'missing' ? 'is-active' : '') + '">Missing</button>' +
    '</div>';
  }

  function rowsFor(roster, list) {
    var d = D();
    return roster.map(function (p) {
      var got = [], missing = 0;
      var cells = list.map(function (a) {
        var r = d.resultFor(p, a.id);
        if (r) got.push(r.pct); else missing += 1;
        return { a: a, r: r, tries: d.attemptsFor(p, a.id).length };
      });
      return { p: p, cells: cells, mean: d.avg(got), missing: missing };
    });
  }

  function sortRows(rows) {
    var copy = rows.slice();
    if (sortBy === 'average') {
      /* nobody with no scores at all floats to the top as if they were
         perfect; they go last, where "no data" belongs */
      copy.sort(function (a, b) {
        if (a.mean === null && b.mean === null) return 0;
        if (a.mean === null) return 1;
        if (b.mean === null) return -1;
        return a.mean - b.mean;
      });
    } else if (sortBy === 'missing') {
      copy.sort(function (a, b) { return b.missing - a.missing; });
    } else {
      copy.sort(function (a, b) { return a.p.name.localeCompare(b.p.name); });
    }
    return copy;
  }

  function gradebook(roster, list) {
    var d = D();
    if (!roster.length || !list.length) {
      return '<div class="cr-card"><div class="empty" style="padding:20px 0">' +
        'Add students and assignments to see the gradebook.</div></div>';
    }
    var rows = sortRows(rowsFor(roster, list));

    return '<div class="gb-wrap"><table class="gb"><thead><tr>' +
      '<th>Student</th>' +
      list.map(function (a) {
        return '<th><button class="gb__head-btn" data-pick-a="' + esc(a.id) + '" ' +
          'title="See everyone on this assignment">' + esc(a.title) + '</button></th>';
      }).join('') +
      '<th>Missing</th><th>Average</th></tr></thead><tbody>' +
      rows.map(function (row) {
        var cells = row.cells.map(function (cell) {
          var r = cell.r;
          var title = r
            ? (rawOf(r) ? rawOf(r) + ' · ' : '') + whenOf(r) +
              (cell.tries > 1 ? ' · ' + cell.tries + ' tries' : '') +
              (r.manual ? ' · typed in' : '')
            : 'Not handed in. Click to set a score.';
          return '<td><button class="gb__cell-btn" data-cell="' + esc(cell.a.id) + '" ' +
            d.who(row.p) + ' title="' + esc(title) + '">' + chip(r) +
            (cell.tries > 1 ? '<i class="gb__tries">' + cell.tries + '</i>' : '') +
            '</button></td>';
        }).join('');
        return '<tr><td class="gb__name">' + esc(row.p.name) + '</td>' + cells +
          '<td>' + (row.missing
            ? '<span class="gb__score gb__score--lo">' + row.missing + '</span>'
            : '<span class="gb__score gb__score--hi">0</span>') + '</td>' +
          '<td><span class="gb__score ' + d.scoreClass(row.mean) + '">' +
            pct(row.mean) + '</span></td></tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  /* ========================== by assignment ========================= */
  function byAssignment() {
    var d = D();
    var list = d.cls().assignments;
    if (!list.length) {
      return '<div class="cr-card"><div class="empty" style="padding:20px 0">' +
        'No assignments set yet.</div></div>';
    }
    var a = d.assignmentById(pickedAssignment) || list[0];
    pickedAssignment = a.id;

    var roster = d.people();
    var rows = roster.map(function (p) {
      return { p: p, r: d.resultFor(p, a.id), tries: d.attemptsFor(p, a.id).length };
    });
    var inHand = rows.filter(function (x) { return !!x.r; });
    var owed = rows.filter(function (x) { return !x.r; });
    var mean = d.avg(inHand.map(function (x) { return x.r.pct; }));
    var missed = missCounts(inHand.map(function (x) { return x.r; }));
    var hardest = Object.keys(missed)
      .sort(function (x, y) { return missed[y] - missed[x]; }).slice(0, 6);

    return picker('gr-pick-a', list.map(function (x) {
      return { id: x.id, label: x.title, on: x.id === a.id };
    })) +

      '<div class="an-grid" style="margin:14px 0">' +
        stat(pct(mean), 'average on this', d.bandLabel(mean)) +
        stat(inHand.length + '/' + roster.length, 'handed in',
             owed.length ? owed.length + ' still owed' : 'everybody') +
        stat(inHand.length ? Math.max.apply(null, inHand.map(function (x) { return x.r.pct; })) + '%' : '—',
             'best score', '') +
        stat(inHand.length ? Math.min.apply(null, inHand.map(function (x) { return x.r.pct; })) + '%' : '—',
             'lowest score', '') +
      '</div>' +

      '<div class="cr-grid" style="grid-template-columns:1.15fr .85fr">' +
        '<div class="cr-card">' +
          '<div class="cr-card__head"><h3>Everyone on this</h3>' +
            '<span class="eyebrow">lowest first</span></div>' +
          (rows.length
            ? rows.slice().sort(function (x, y) {
                if (!x.r && !y.r) return x.p.name.localeCompare(y.p.name);
                if (!x.r) return -1;            /* not handed in sits at the top */
                if (!y.r) return 1;
                return x.r.pct - y.r.pct;
              }).map(function (x) {
                return '<div class="person" ' + d.who(x.p) + '>' +
                  '<div class="person__av">' + esc(d.initials(x.p.name)) + '</div>' +
                  '<div class="person__t"><b>' + esc(x.p.name) + '</b><span>' +
                    (x.r
                      ? esc((rawOf(x.r) ? rawOf(x.r) + ' · ' : '') + whenOf(x.r) +
                            (x.tries > 1 ? ' · ' + x.tries + ' tries' : '') +
                            (x.r.manual ? ' · typed in' : ''))
                      : 'Not handed in') +
                  '</span></div>' +
                  '<button class="gb__cell-btn" data-cell="' + esc(a.id) + '" ' + d.who(x.p) +
                    ' title="Set a score">' + chip(x.r) + '</button>' +
                '</div>';
              }).join('')
            : '<div class="empty">Nobody in the class yet.</div>') +
        '</div>' +

        '<div class="cr-card">' +
          '<div class="cr-card__head"><h3>Missed on this</h3>' +
            '<span class="eyebrow">' + inHand.length + ' hand-in' +
            (inHand.length === 1 ? '' : 's') + '</span></div>' +
          (hardest.length
            ? hardest.map(function (n) {
                var cty = global.GeoData.countries.filter(function (x) { return x.name === n; })[0];
                return bar(n + (cty ? ' · ' + cty.capital : ''),
                           Math.round((missed[n] / inHand.length) * 100),
                           missed[n] + ' of ' + inHand.length, 'var(--danger)', '');
              }).join('')
            : '<div class="empty">Nothing missed, or nothing handed in yet.</div>') +
        '</div>' +
      '</div>';
  }

  /* ============================ by student ========================== */
  function byStudent() {
    var d = D();
    var roster = d.people();
    if (!roster.length) {
      return '<div class="cr-card"><div class="empty" style="padding:20px 0">' +
        'Nobody in the class yet.</div></div>';
    }
    var p = null;
    roster.forEach(function (x) { if (d.ownerKey({ studentId: x.id, name: x.name }) === pickedStudent) p = x; });
    if (!p) p = roster[0];
    pickedStudent = d.ownerKey({ studentId: p.id, name: p.name });

    var list = d.cls().assignments;
    var rows = list.map(function (a) {
      var tries = d.attemptsFor(p, a.id);
      var best = tries.length ? Math.max.apply(null, tries.map(function (t) { return t.pct; })) : null;
      return { a: a, r: tries[0] || null, tries: tries, best: best };
    });
    var done = rows.filter(function (x) { return !!x.r; });
    var mean = d.avg(done.map(function (x) { return x.r.pct; }));

    /* what THIS student keeps getting wrong, which the class-wide chart
       can never show: a country nobody else misses is invisible there */
    var mine = missCounts(done.map(function (x) { return x.r; }));
    var theirs = Object.keys(mine)
      .sort(function (x, y) { return mine[y] - mine[x]; }).slice(0, 8);

    return picker('gr-pick-s', roster.map(function (x) {
      return { id: d.ownerKey({ studentId: x.id, name: x.name }), label: x.name,
               on: d.ownerKey({ studentId: x.id, name: x.name }) === pickedStudent };
    })) +

      '<div class="an-grid" style="margin:14px 0">' +
        stat(pct(mean), 'their average', d.bandLabel(mean)) +
        stat(done.length + '/' + list.length, 'handed in',
             (list.length - done.length) ? (list.length - done.length) + ' still owed' : 'all done') +
        stat(done.length ? Math.max.apply(null, done.map(function (x) { return x.r.pct; })) + '%' : '—',
             'their best', '') +
        stat(String(done.reduce(function (n, x) { return n + x.tries.length; }, 0)), 'attempts',
             'across ' + done.length + ' assignment' + (done.length === 1 ? '' : 's')) +
      '</div>' +

      '<div class="cr-grid" style="grid-template-columns:1.15fr .85fr">' +
        '<div class="cr-card">' +
          '<div class="cr-card__head"><h3>Every assignment</h3></div>' +
          (rows.length
            ? rows.map(function (x) {
                return '<div class="person">' +
                  '<div class="person__av" style="' + (x.r ? '' :
                    'background:var(--line-soft);color:var(--muted)') + '">' +
                    (x.r ? I.check : I.clip) + '</div>' +
                  '<div class="person__t"><b>' + esc(x.a.title) + '</b><span>' +
                    (x.r
                      ? esc((rawOf(x.r) ? rawOf(x.r) + ' · ' : '') + whenOf(x.r) +
                            (x.tries.length > 1
                              ? ' · ' + x.tries.length + ' tries, best ' + x.best + '%'
                              : '') +
                            (x.r.manual ? ' · typed in' : ''))
                      : 'Not handed in') +
                  '</span></div>' +
                  '<button class="gb__cell-btn" data-cell="' + esc(x.a.id) + '" ' + d.who(p) +
                    ' title="Set a score">' + chip(x.r) + '</button>' +
                '</div>';
              }).join('')
            : '<div class="empty">No assignments set yet.</div>') +
        '</div>' +

        '<div class="cr-card">' +
          '<div class="cr-card__head"><h3>What they keep missing</h3>' +
            '<span class="eyebrow">' + esc(p.name.split(/\s+/)[0]) + ' only</span></div>' +
          (theirs.length
            ? theirs.map(function (n) {
                var cty = global.GeoData.countries.filter(function (x) { return x.name === n; })[0];
                return bar(n + (cty ? ' · ' + cty.capital : ''),
                           Math.round((mine[n] / Math.max(1, done.length)) * 100),
                           mine[n] + '×', 'var(--danger)', '');
              }).join('')
            : '<div class="empty">Nothing missed yet.</div>') +
        '</div>' +
      '</div>';
  }

  /* A row of choices. A select would hide how many there are and cost a
     click to find out; these are the thing being chosen. */
  function picker(id, items) {
    return '<div class="gr-picker" id="' + id + '">' +
      items.map(function (it) {
        return '<button class="gr-chip' + (it.on ? ' is-on' : '') + '" data-id="' + esc(it.id) + '">' +
          esc(it.label) + '</button>';
      }).join('') +
    '</div>';
  }

  /* =============================== wiring =========================== */
  function wire(host) {
    if (!host) return;
    var T = global.Teacher;

    W.$$('#gr-view button', host).forEach(function (b) {
      b.addEventListener('click', function () { view = b.dataset.v; redraw(); });
    });
    W.$$('#gr-sort button', host).forEach(function (b) {
      b.addEventListener('click', function () { sortBy = b.dataset.s; redraw(); });
    });
    W.$$('#gr-pick-a button', host).forEach(function (b) {
      b.addEventListener('click', function () { pickedAssignment = b.dataset.id; redraw(); });
    });
    W.$$('#gr-pick-s button', host).forEach(function (b) {
      b.addEventListener('click', function () { pickedStudent = b.dataset.id; redraw(); });
    });
    /* a bar or a column header is a way into that assignment */
    W.$$('[data-pick-a]', host).forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        pickedAssignment = b.dataset.pickA;
        view = 'assignment';
        redraw();
      });
    });

    function redraw() { if (T && T.rerender) T.rerender(); }
  }

  global.Grades = {
    panel: panel, wire: wire,
    get view() { return view; }, set view(v) { view = v; }
  };
})(window);
