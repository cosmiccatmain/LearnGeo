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

  /* ============================== rings =============================
     Five concentric rings, Activity-style. Each one is a fraction of a
     target, so they can all be read at a glance without numbers. The
     numbers are there anyway: hover a ring and the middle switches to
     that stat while a card explains what it is counting.
  ------------------------------------------------------------------ */

  /* Ring geometry, outermost first. */
  /* Thinner strokes pulled outward, so the hole in the middle is wide
     enough for the label to sit in without touching the inner ring. */
  var RING_R = [104, 89, 74, 59, 44];
  var RING_W = 11;

  function ringData(s, st) {
    var d = s.daily;
    var lp = W.levelProgress();
    var acc = st.answered ? Math.round((st.correct / st.answered) * 100) : null;

    /* Diamonds have no natural ceiling, so the ring counts down to the
       cheapest thing still locked in Customization. */
    var target = cheapestLocked();

    return [
      { key: 'goal', label: 'Daily goal', colour: '#0E9F6E',
        value: d.answered + ' / ' + d.goal,
        pct: d.answered / Math.max(1, d.goal),
        detail: d.answered >= d.goal
          ? 'Done for today. You answered ' + d.answered + ' with a target of ' + d.goal + '.'
          : (d.goal - d.answered) + ' more question' + (d.goal - d.answered === 1 ? '' : 's') +
            ' to hit today’s target of ' + d.goal + '.' },

      { key: 'streak', label: 'Daily streak', colour: '#F59E0B',
        value: (d.dayStreak || 0) + (d.dayStreak === 1 ? ' day' : ' days'),
        pct: (d.dayStreak || 0) / 7,
        detail: !d.dayStreak
          ? 'Answer one question today to start a streak.'
          : d.dayStreak >= 7
            ? d.dayStreak + ' days running. The ring fills at seven.'
            : d.dayStreak + ' day' + (d.dayStreak === 1 ? '' : 's') + ' running. ' +
              (7 - d.dayStreak) + ' more fills the ring.' },

      { key: 'xp', label: 'Level ' + s.economy.level, colour: '#1B4DFF',
        value: 'Lv ' + s.economy.level,
        pct: lp.have / Math.max(1, lp.need),
        detail: (lp.need - lp.have) + ' XP to level ' + (s.economy.level + 1) +
                '. You have ' + lp.have + ' of ' + lp.need + '.' },

      { key: 'gem', label: 'Diamonds', colour: '#0284C7',
        value: s.economy.diamonds.toLocaleString(),
        pct: target ? s.economy.diamonds / target.price : 1,
        detail: !target
          ? 'You own everything in Customization.'
          : s.economy.diamonds >= target.price
            ? 'Enough for ' + target.name + ' (' + target.price + '). Spend it in Customization.'
            : (target.price - s.economy.diamonds) + ' more for ' + target.name +
              ', the cheapest thing still locked.' },

      { key: 'acc', label: 'Accuracy', colour: '#7C3AED',
        value: acc === null ? '—' : acc + '%',
        pct: acc === null ? 0 : acc / 100,
        detail: acc === null
          ? 'Answer a few questions and your accuracy shows up here.'
          : st.correct.toLocaleString() + ' right out of ' + st.answered.toLocaleString() +
            ' answered, across every mode.' }
    ];
  }

  /* The cheapest item the learner has not unlocked yet, across every
     kind of cosmetic. Gives the diamonds ring something to aim at. */
  function cheapestLocked() {
    var Cos = global.Cosmetics, owned = W.state.owned || {};
    /* Avatars are listed by id and glyph with no display name, so each kind
       carries a noun to fall back on rather than printing "undefined". */
    var kinds = {
      avatars: 'avatar', decorations: 'decoration', effects: 'effect',
      nameplates: 'nameplate', banners: 'banner', themes: 'theme'
    };
    var best = null;
    Object.keys(kinds).forEach(function (k) {
      (Cos[k] || []).forEach(function (it) {
        if (!it.price) return;
        if ((owned[k] || []).indexOf(it.id) !== -1) return;
        if (best && it.price >= best.price) return;
        var label = it.name || (String(it.id).charAt(0).toUpperCase() +
                    String(it.id).slice(1).replace(/-/g, ' ') + ' ' + kinds[k]);
        best = { name: label, price: it.price };
      });
    });
    return best;
  }

  function railSection(s, st) {
    var rings = ringData(s, st);

    var arcs = rings.map(function (g, i) {
      var r = RING_R[i], circ = 2 * Math.PI * r;
      var pct = Math.max(0, Math.min(1, g.pct || 0));
      return '<circle class="ring__track" cx="120" cy="120" r="' + r + '" stroke-width="' + RING_W + '"/>' +
        '<circle class="ring__arc" data-i="' + i + '" cx="120" cy="120" r="' + r + '" ' +
          'stroke="' + g.colour + '" stroke-width="' + RING_W + '" stroke-linecap="round" ' +
          'stroke-dasharray="' + circ + '" stroke-dashoffset="' + circ + '" ' +
          'style="--to:' + (circ * (1 - pct)) + '"/>' +
        /* a fatter invisible copy so the ring is easy to point at */
        '<circle class="ring__hit" data-i="' + i + '" cx="120" cy="120" r="' + r + '" ' +
          'stroke-width="' + (RING_W + 6) + '" tabindex="0" role="button" ' +
          'aria-label="' + W.escapeHtml(g.label + ': ' + g.value) + '"/>';
    }).join('');

    return '<div class="rings" id="stat-rings">' +
      '<div class="rings__viz">' +
        '<svg viewBox="0 0 240 240" class="rings__svg">' + arcs + '</svg>' +
        '<div class="rings__mid" id="rings-mid">' + midHtml(rings, -1, s) + '</div>' +
      '</div>' +
      '<div class="rings__legend">' +
        rings.map(function (g, i) {
          return '<button class="rleg" data-i="' + i + '">' +
            '<span class="rleg__dot" style="background:' + g.colour + '"></span>' +
            '<span class="rleg__t"><b>' + W.escapeHtml(g.value) + '</b>' +
              '<span>' + W.escapeHtml(g.label) + '</span></span>' +
            '<span class="rleg__pct mono">' + Math.round(Math.min(1, g.pct || 0) * 100) + '%</span>' +
          '</button>';
        }).join('') +
      '</div>' +
      '<div class="rings__tip" id="rings-tip" hidden></div>' +
    '</div>';
  }

  /* Middle of the rings: a summary at rest, the hovered stat otherwise. */
  function midHtml(rings, i, s) {
    if (i < 0 || !rings[i]) {
      var done = rings.filter(function (g) { return (g.pct || 0) >= 1; }).length;
      return '<b class="rings__mid-n">' + done + '<span>/5</span></b>' +
        '<span class="rings__mid-l">rings closed</span>';
    }
    var g = rings[i];
    return '<b class="rings__mid-n" style="color:' + g.colour + '">' + W.escapeHtml(g.value) + '</b>' +
      '<span class="rings__mid-l">' + W.escapeHtml(g.label) + '</span>';
  }

  /* Hover, focus and touch all drive the same highlight. */
  function wireRings(host) {
    var box = W.$('#stat-rings', host);
    if (!box) return;
    var s = W.state, st = s.stats;
    var rings = ringData(s, st);
    var mid = W.$('#rings-mid', box);
    var tip = W.$('#rings-tip', box);

    /* let the arcs grow from zero once laid out */
    requestAnimationFrame(function () {
      W.$$('.ring__arc', box).forEach(function (a) {
        a.style.strokeDashoffset = a.style.getPropertyValue('--to');
      });
    });

    function show(i, ev) {
      box.classList.add('is-focused');
      W.$$('[data-i]', box).forEach(function (n) {
        n.classList.toggle('is-on', +n.dataset.i === i);
      });
      mid.innerHTML = midHtml(rings, i, s);
      var g = rings[i];
      tip.innerHTML = '<b style="color:' + g.colour + '">' + W.escapeHtml(g.label) + '</b>' +
        '<span>' + W.escapeHtml(g.detail) + '</span>';
      tip.hidden = false;
      if (ev) place(ev);
    }

    /* Follows the cursor vertically but never slides over the rings, so the
       arc being pointed at stays visible while its card is open. */
    function place(ev) {
      var r = box.getBoundingClientRect();
      var viz = W.$('.rings__viz', box).getBoundingClientRect();
      var clear = viz.right - r.left + 14;
      var x = Math.max(ev.clientX - r.left + 18, clear);
      var y = ev.clientY - r.top + 14;
      x = Math.max(8, Math.min(x, r.width - tip.offsetWidth - 8));
      y = Math.max(8, Math.min(y, r.height - tip.offsetHeight - 8));
      tip.style.left = x + 'px';
      tip.style.top = y + 'px';
    }

    function clear() {
      box.classList.remove('is-focused');
      W.$$('[data-i]', box).forEach(function (n) { n.classList.remove('is-on'); });
      mid.innerHTML = midHtml(rings, -1, s);
      tip.hidden = true;
    }

    W.$$('.ring__hit', box).forEach(function (h) {
      h.addEventListener('mouseenter', function (e) { show(+h.dataset.i, e); });
      h.addEventListener('mousemove', place);
      h.addEventListener('mouseleave', clear);
      h.addEventListener('focus', function () { show(+h.dataset.i); centreTip(); });
      h.addEventListener('blur', clear);
    });
    W.$$('.rleg', box).forEach(function (b) {
      b.addEventListener('mouseenter', function (e) { show(+b.dataset.i, e); });
      b.addEventListener('mousemove', place);
      b.addEventListener('mouseleave', clear);
      b.addEventListener('focus', function () { show(+b.dataset.i); centreTip(); });
      b.addEventListener('blur', clear);
    });

    /* keyboard has no pointer, so park the card under the rings */
    function centreTip() {
      var viz = W.$('.rings__viz', box).getBoundingClientRect();
      var r = box.getBoundingClientRect();
      tip.style.left = Math.max(8, viz.left - r.left) + 'px';
      tip.style.top = (viz.bottom - r.top + 8) + 'px';
    }
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
    wireRings(host);
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

    bind('portal-add', function () { global.UI.go('classroom'); });
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
