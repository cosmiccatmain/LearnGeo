/* ------------------------------------------------------------------
   LearnGeo — the study centre.
   Signing in lands here, not in a quiz. Everything starts from here.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons;

  var MODES = [
    { view: 'learn', icon: I.book, title: 'Learn',
      blurb: 'Answer, find out straight away, keep going. The map jumps to the capital as soon as you commit.',
      meta: 'Weakest-first · 4 question types' },
    { view: 'test', icon: I.clip, title: 'Practice test',
      blurb: 'Sit a whole section and get it marked. Flag anything you want to come back to.',
      meta: '10 – 75 questions · timed' },
    { view: 'quiz', icon: I.target, title: 'Class quiz',
      blurb: 'The paper map quiz. A country lights up, you click it and write its name and capital from memory.',
      meta: 'Two marks each \u00b7 no multiple choice' },
    { view: 'cards', icon: I.cards, title: 'Flashcards',
      blurb: 'Two-sided cards that keep score of themselves. Shaky ones come round again before you finish.',
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

  function render() {
    var host = document.getElementById('view-portal');
    if (!host) return;
    var s = W.state, st = s.stats;
    var acc = st.answered ? Math.round((st.correct / st.answered) * 100) : 0;
    var mastered = W.masteredCount();
    var total = global.GeoData.counts.total;
    var lp = W.levelProgress();
    var d = s.daily;
    var goalPct = Math.min(1, d.answered / Math.max(1, d.goal));
    var circ = 2 * Math.PI * 20;

    host.innerHTML =
      '<div class="portal__inner">' +

        '<div class="portal__head">' +
          '<div class="portal__avatar">' + W.avatarHtml(s.profile) + '</div>' +
          '<div class="portal__hello grow">' +
            '<h1>' + greeting() + ', ' + W.escapeHtml(s.profile.displayName || 'Explorer') + '.</h1>' +
            '<p>' + subtitle(st, mastered, total) + '</p>' +
          '</div>' +
          '<button class="btn btn--accent btn--lg" id="portal-resume">' +
            (st.answered ? 'Continue learning' : 'Start learning') + ' ' + I.arrowR + '</button>' +
        '</div>' +

        '<div class="portal__metrics">' +
          '<div class="metric metric--goal">' +
            '<div class="goal__ring" style="width:46px;height:46px;flex:none">' +
              '<svg width="46" height="46">' +
                '<circle cx="23" cy="23" r="20" fill="none" stroke="var(--line)" stroke-width="4"/>' +
                '<circle cx="23" cy="23" r="20" fill="none" stroke="var(--success)" stroke-width="4" ' +
                  'stroke-linecap="round" stroke-dasharray="' + circ + '" stroke-dashoffset="' + (circ * (1 - goalPct)) + '"/>' +
              '</svg>' +
              '<span class="mono">' + Math.round(goalPct * 100) + '</span>' +
            '</div>' +
            '<div><div class="metric__n" style="font-size:19px">' + d.answered + '/' + d.goal + '</div>' +
            '<div class="metric__l">today’s goal</div></div>' +
          '</div>' +
          metric('Lv ' + s.economy.level, lp.have + ' / ' + lp.need + ' XP') +
          metric(s.economy.diamonds.toLocaleString(), 'diamonds') +
          metric(mastered + '<span style="color:var(--faint);font-size:16px">/' + total + '</span>', 'mastered') +
        '</div>' +

        recommendedSection() +
        inboxSection() +

        '<div class="portal__section">' +
          '<span class="eyebrow">Choose a mode</span>' +
          '<div class="portal-modes">' +
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
        '</div>' +

        '<div class="portal__section portal-split">' +
          '<div class="panel">' +
            '<div class="panel__head"><h3>Progress by region</h3>' +
              '<span class="eyebrow">' + mastered + ' mastered</span></div>' +
            regionRows() +
          '</div>' +
          '<div class="panel">' +
            '<div class="panel__head"><h3>Achievements</h3>' +
              '<span class="eyebrow">' + s.achievements.length + '/' + global.Cosmetics.achievements.length + '</span></div>' +
            achievementPreview() +
            '<button class="btn btn--ghost btn--block btn--sm" id="portal-ach" style="margin-top:12px">View all</button>' +
          '</div>' +
        '</div>' +

      '</div>';

    W.$$('[data-rec]', host).forEach(function (b) {
      b.addEventListener('click', function () { global.Assignments.run(recsCache[+b.dataset.rec]); });
    });
    var box = W.state.inbox || [];
    W.$$('[data-inbox]', host).forEach(function (b) {
      b.addEventListener('click', function () { global.Assignments.run(box[+b.dataset.inbox]); });
    });
    var addBtn = document.getElementById('portal-add');
    if (addBtn) addBtn.addEventListener('click', global.Classroom.openAdd);
    var openBtn = document.getElementById('portal-openclass');
    if (openBtn) openBtn.addEventListener('click', function () { global.UI.go('classroom'); });
    var tBtn = document.getElementById('portal-teacher');
    if (tBtn) tBtn.addEventListener('click', global.Teacher.becomeTeacher);

    W.$$('.portal-mode', host).forEach(function (b) {
      b.addEventListener('click', function () { global.UI.go(b.dataset.view); });
    });
    document.getElementById('portal-resume').addEventListener('click', function () { global.UI.go('learn'); });
    document.getElementById('portal-ach').addEventListener('click', global.UI.openAchievements);
  }

  /* Suggestions built from the mastery record: unseen places first, then
     whatever is being missed most often. */
  function recommendedSection() {
    recsCache = global.Assignments.recommend(3);
    var recs = recsCache;
    if (!recs.length) return '';
    return '<div class="portal__section">' +
      '<div class="row row--between" style="margin-bottom:14px">' +
        '<div><span class="eyebrow">Suggested for you</span>' +
        '<div class="t-sm t-muted" style="margin-top:4px">' +
          'Based on what you keep missing, and what you have never been asked about.' +
        '</div></div>' +
      '</div>' +
      '<div class="rec-list">' +
        recs.map(function (r, i) {
          return '<button class="rec" data-rec="' + i + '">' +
            '<span class="rec__icon rec__icon--' + (r.tone || 'cool') + '">' + r.icon + '</span>' +
            '<span class="rec__t"><b>' + W.escapeHtml(r.title) + '</b>' +
              '<span>' + W.escapeHtml(r.blurb) + '</span>' +
              '<span class="rec__why">' + W.escapeHtml(r.why) + '</span></span>' +
            '<span class="rec__go">' + I.arrowR + '</span>' +
          '</button>';
        }).join('') +
      '</div></div>';
  }

  function inboxSection() {
    var box = W.state.inbox || [];
    var open = box.filter(function (a) { return !a.done; });
    return '<div class="portal__section">' +
      '<div class="row row--between" style="margin-bottom:14px">' +
        '<div><span class="eyebrow">Assignments</span>' +
          '<div class="t-sm t-muted" style="margin-top:4px">' +
            (box.length ? open.length + ' still to do of ' + box.length
                        : 'Got a code from your teacher? Add it here.') +
          '</div></div>' +
        '<div class="row" style="gap:8px">' +
          (box.length
            ? '<button class="btn btn--ghost btn--sm" id="portal-openclass">Open Classroom</button>'
            : '<button class="btn btn--ghost btn--sm" id="portal-teacher">' + I.users + ' Teacher mode</button>') +
          '<button class="btn btn--primary btn--sm" id="portal-add">' + I.plus + ' Add assignment</button>' +
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
        : '<div class="panel"><div class="empty" style="padding:22px 0">' +
          'No assignments yet.</div></div>') +
    '</div>';
  }

  function subtitle(st, mastered, total) {
    if (!st.answered) return 'Pick a mode below to start. Whatever you answer, it all counts towards the same record.';
    var acc = Math.round((st.correct / st.answered) * 100);
    return st.answered.toLocaleString() + ' questions answered · ' + acc + '% accuracy · ' +
      mastered + ' of ' + total + ' places mastered.';
  }

  function metric(n, l) {
    return '<div class="metric"><div class="metric__n">' + n + '</div><div class="metric__l">' + l + '</div></div>';
  }

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

  global.Portal = { render: render };
})(window);
