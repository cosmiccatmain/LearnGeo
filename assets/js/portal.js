/* ------------------------------------------------------------------
   LearnGeo — the study centre.

   Built around the map rather than around a column of counters: the
   first thing on the screen is the world with everything you have
   mastered filled in, and one obvious thing to do next. Everything
   else is ranked below that.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons;

  var MODES = [
    { view: 'learn', icon: I.book, title: 'Learn',
      blurb: 'You find out right away if you got it, then move on to the next one. The map shades the country as soon as you answer.',
      meta: 'Weakest-first · 4 question types' },
    { view: 'test', icon: I.clip, title: 'Practice test',
      blurb: 'Do a whole section and get a score at the end. You can flag questions to come back to later.',
      meta: '10 – 75 questions · timed' },
    { view: 'quiz', icon: I.target, title: 'Class quiz',
      blurb: 'Works like the paper map quiz from class. A country lights up, you click it, then write its name and capital from memory.',
      meta: 'Two marks each · no multiple choice' },
    { view: 'cards', icon: I.cards, title: 'Flashcards',
      blurb: 'Flip cards that keep track of how you’re doing. The ones you’re unsure about come back again before you finish.',
      meta: 'Both directions · 10 – 100 cards' }
  ];

  var recsCache = [];

  function greeting() {
    var h = new Date().getHours();
    if (h < 5)  return 'Still up';
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  }

  /* ============================== render ============================ */
  function render() {
    var host = document.getElementById('view-portal');
    if (!host) return;
    if (global.Classroom) global.Classroom.syncSoon();   /* new classwork, when signed in */
    var s = W.state, st = s.stats;
    var mastered = W.masteredCount();
    var total = global.GeoData.counts.total;

    recsCache = global.Assignments.recommend(3);

    host.innerHTML =
      '<div class="portal__inner">' +
        heroSection(s, st, mastered, total) +
        railSection(s, st) +
        assignmentsSection() +
        '<div class="home-grid">' +
          '<div class="home-modes">' +
            MODES.map(function (m) {
              return '<button class="portal-mode" data-view="' + m.view + '">' +
                '<div class="portal-mode__top">' +
                  '<span class="portal-mode__icon">' + m.icon + '</span>' +
                  '<h3>' + m.title + '</h3>' +
                '</div>' +
                '<p>' + m.blurb + '</p>' +
                '<div class="portal-mode__foot"><span>' + m.meta + '</span>' +
                  '<span class="portal-mode__go">Open ' + I.arrowR + '</span></div>' +
              '</button>';
            }).join('') +
          '</div>' +
          '<div class="home-side">' +
            '<div class="panel">' +
              '<div class="panel__head"><h3>Progress by region</h3>' +
                '<span class="eyebrow">' + mastered + ' mastered</span></div>' +
              regionRows() +
            '</div>' +
            '<div class="panel">' +
              '<div class="panel__head"><h3>Achievements</h3>' +
                '<span class="eyebrow">' + s.achievements.length + '/' +
                  global.Cosmetics.achievements.length + '</span></div>' +
              achievementPreview() +
              '<button class="btn btn--ghost btn--block btn--sm" id="portal-ach" style="margin-top:12px">' +
                'View all</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    global.WorldMap.paint(document.getElementById('home-map'));
    wire(host);
  }

  /* =============================== hero ============================= */
  /* The map is the headline. Everything a new student needs — where they
     are, and the one thing to do next — sits inside this one panel. */
  function heroSection(s, st, mastered, total) {
    var pct = Math.round((mastered / total) * 100);
    return '<section class="home-hero">' +
      '<div class="home-hero__top">' +
        '<div class="portal__avatar">' + W.avatarHtml(s.profile) + '</div>' +
        '<div class="home-hero__hello grow">' +
          '<h1>' + greeting() + ', ' + W.escapeHtml(s.profile.displayName || 'Explorer') + '.</h1>' +
          '<p>' + subtitle(st, mastered, total) + '</p>' +
        '</div>' +
        '<div class="home-hero__score">' +
          '<b>' + mastered + '</b><span>/ ' + total + '</span>' +
          '<em>mastered · ' + pct + '% of the world</em>' +
        '</div>' +
      '</div>' +

      '<div class="home-map" id="home-map"></div>' +

      '<div class="home-legend">' +
        '<span><i class="wm-key"></i>Not seen yet</span>' +
        '<span><i class="wm-key wm-key--seen"></i>Learning</span>' +
        '<span><i class="wm-key wm-key--done"></i>Mastered</span>' +
      '</div>' +

      nextUp() +
    '</section>';
  }

  /* recommend() always returns something, so there is never a home screen
     without a next step on it. */
  function nextUp() {
    var r = recsCache[0];
    if (!r) return '';
    return '<div class="home-next">' +
      '<span class="home-next__icon home-next__icon--' + (r.tone || 'cool') + '">' + r.icon + '</span>' +
      '<div class="home-next__t">' +
        '<span class="eyebrow">Next up</span>' +
        '<b>' + W.escapeHtml(r.title) + '</b>' +
        '<span>' + W.escapeHtml(r.blurb) + '</span>' +
      '</div>' +
      '<button class="btn btn--accent btn--lg" data-rec="0">Start ' + I.arrowR + '</button>' +
    '</div>';
  }

  function subtitle(st, mastered, total) {
    if (!st.answered) {
      return 'Nothing on the map yet. Every country you learn fills in below.';
    }
    var acc = Math.round((st.correct / st.answered) * 100);
    return 'You’ve answered ' + st.answered.toLocaleString() + ' questions with ' + acc +
      '% accuracy. ' + (total - mastered) + ' places still to go.';
  }

  /* =============================== rail ============================= */
  function railSection(s, st) {
    var d = s.daily;
    var lp = W.levelProgress();
    var goalPct = Math.min(1, d.answered / Math.max(1, d.goal));
    var acc = st.answered ? Math.round((st.correct / st.answered) * 100) : null;
    var circ = 2 * Math.PI * 18;

    return '<div class="rail">' +
      '<div class="rail__i rail__i--goal">' +
        '<div class="goal__ring" style="width:42px;height:42px;flex:none">' +
          '<svg width="42" height="42">' +
            '<circle cx="21" cy="21" r="18" fill="none" stroke="var(--line)" stroke-width="4"/>' +
            '<circle cx="21" cy="21" r="18" fill="none" stroke="var(--success)" stroke-width="4" ' +
              'stroke-linecap="round" stroke-dasharray="' + circ + '" ' +
              'stroke-dashoffset="' + (circ * (1 - goalPct)) + '"/>' +
          '</svg>' +
        '</div>' +
        '<div><b>' + d.answered + '/' + d.goal + '</b><span>today’s goal</span></div>' +
      '</div>' +

      railItem(I.fire, (d.dayStreak || 0) + (d.dayStreak === 1 ? ' day' : ' days'),
               'daily streak', d.dayStreak ? 'is-live' : '') +

      '<div class="rail__i">' +
        '<span class="rail__icon">' + I.bolt + '</span>' +
        '<div><b>Level ' + s.economy.level + '</b>' +
          '<span>' + lp.have + ' / ' + lp.need + ' XP</span>' +
          '<span class="rail__bar"><i style="width:' +
            Math.min(100, (lp.have / lp.need) * 100) + '%"></i></span>' +
        '</div>' +
      '</div>' +

      railItem(I.gem, s.economy.diamonds.toLocaleString(), 'diamonds') +
      railItem(I.target, acc === null ? '—' : acc + '%', 'accuracy') +
    '</div>';
  }

  function railItem(icon, n, l, cls) {
    return '<div class="rail__i ' + (cls || '') + '">' +
      '<span class="rail__icon">' + icon + '</span>' +
      '<div><b>' + n + '</b><span>' + l + '</span></div></div>';
  }

  /* =========================== assignments ========================== */
  /* A student who is not in a class has no assignments and never will
     until a teacher hands them a code, so they get one line rather than
     an empty panel taking up a third of the screen. */
  function assignmentsSection() {
    var box = W.state.inbox || [];
    if (!W.state.enrolled && !box.length) {
      return '<button class="home-join" id="portal-join">' +
        '<span class="home-join__icon">' + I.users + '</span>' +
        '<span class="home-join__t"><b>Got a code from your teacher?</b>' +
          '<span>Join your class and their work lands here.</span></span>' +
        '<span class="home-join__go">Join a class ' + I.arrowR + '</span>' +
      '</button>';
    }

    var open = box.filter(function (a) { return !a.done; });
    return '<div class="portal__section">' +
      '<div class="row row--between" style="margin-bottom:14px">' +
        '<div><span class="eyebrow">Assignments</span>' +
          '<div class="t-sm t-muted" style="margin-top:4px">' +
            (box.length ? open.length + ' of ' + box.length + ' still to do'
                        : 'Nothing set yet. It shows up here when your teacher sends it.') +
          '</div></div>' +
        '<div class="row" style="gap:8px">' +
          '<button class="btn btn--ghost btn--sm" id="portal-openclass">Open Classroom</button>' +
          '<button class="btn btn--primary btn--sm" id="portal-add">' + I.plus +
            (W.state.enrolled ? ' Add assignment' : ' Join a class') + '</button>' +
        '</div>' +
      '</div>' +
      (box.length
        ? '<div class="panel">' + box.slice(0, 3).map(function (a, i) {
            var pct = a.last ? a.last.pct : null;
            return '<div class="assign-row">' +
              '<div class="assign-row__i ' + (a.done ? 'assign-row__i--done' : '') + '">' +
                (a.done ? I.check : I.clip) + '</div>' +
              '<div class="assign-row__t">' +
                '<b>' + W.escapeHtml(a.title) + '</b>' +
                '<span>' + W.escapeHtml(a.from || 'Assignment') +
                  (pct !== null ? ' · best ' + a.best + '%' : ' · not started yet') + '</span>' +
              '</div>' +
              '<button class="btn btn--ghost btn--sm" data-inbox="' + i + '">' +
                (a.done ? 'Retry' : 'Start') + '</button>' +
            '</div>';
          }).join('') + '</div>'
        : '') +
    '</div>';
  }

  /* =============================== panels =========================== */
  function regionRows() {
    return global.GeoData.regions.map(function (r) {
      var list = global.GeoData.countries.filter(function (c) { return c.region === r; });
      var done = list.filter(function (c) {
        var m = W.state.mastery[c.name]; return m && m.box >= 4;
      }).length;
      var pct = Math.round((done / list.length) * 100);
      return '<div class="region-row">' +
        '<div>' + r + '</div>' +
        '<div class="pbar"><div class="pbar__fill ' + (pct >= 70 ? 'pbar__fill--success' : 'pbar__fill--accent') +
          '" style="width:' + pct + '%"></div></div>' +
        '<div class="region-row__n">' + done + '/' + list.length + '</div>' +
      '</div>';
    }).join('');
  }

  function achievementPreview() {
    var have = W.state.achievements;
    var next = global.Cosmetics.achievements.filter(function (a) { return have.indexOf(a.id) === -1; }).slice(0, 3);
    var got = global.Cosmetics.achievements.filter(function (a) { return have.indexOf(a.id) !== -1; }).slice(-2);
    var rows = got.concat(next).slice(0, 4);
    if (!rows.length) return '<div class="empty" style="padding:16px 0">Nothing yet.</div>';
    return rows.map(function (a) {
      var done = have.indexOf(a.id) !== -1;
      return '<div class="ach-row ' + (done ? 'is-done' : '') + '" style="padding:9px 0">' +
        '<div class="ach-row__i" style="width:30px;height:30px">' + (done ? I.check : I.lock) + '</div>' +
        '<div class="ach-row__t grow"><b style="font-size:13px">' + a.name + '</b>' +
        '<span style="font-size:11.5px">' + a.desc + '</span></div></div>';
    }).join('');
  }

  /* =============================== wiring =========================== */
  function wire(host) {
    W.$$('[data-rec]', host).forEach(function (b) {
      b.addEventListener('click', function () { global.Assignments.run(recsCache[+b.dataset.rec]); });
    });
    var box = W.state.inbox || [];
    W.$$('[data-inbox]', host).forEach(function (b) {
      b.addEventListener('click', function () { global.Assignments.run(box[+b.dataset.inbox]); });
    });
    W.$$('.portal-mode', host).forEach(function (b) {
      b.addEventListener('click', function () { global.UI.go(b.dataset.view); });
    });

    bind('portal-add', function () {
      if (W.state.enrolled) global.Classroom.openAdd();
      else global.UI.go('classroom');
    });
    bind('portal-openclass', function () { global.UI.go('classroom'); });
    bind('portal-join', function () { global.UI.go('classroom'); });
    bind('portal-ach', global.UI.openAchievements);

    function bind(id, fn) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('click', fn);
    }
  }

  global.Portal = { render: render };
})(window);
