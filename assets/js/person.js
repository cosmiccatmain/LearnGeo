/* ------------------------------------------------------------------
   LearnGeo — the person card.

   Click a name anywhere it appears and this says who they are and what
   they have done. One card, four callers: the class leaderboard, the
   teacher's People list, the gradebook, and the classroom roster.

   It is wired by delegation rather than by editing those four files.
   Each of them is owned by somebody else this round, and a card that
   reads a name out of the DOM cannot collide with a file it never
   touches. The cost is that a renamed class here breaks the click
   silently, so hit() names every selector it depends on in one place.

   Nothing is fetched. Everything shown is already in memory, because a
   teacher's device holds the class and a student's device holds their
   own save. What is not known is said to be not known rather than
   drawn as a zero somebody might read as a score.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons;

  /* ============================== lookup ============================ */
  function cls() {
    var c = W.state.classroom || {};
    if (!c.results) c.results = [];
    if (!c.roster) c.roster = [];
    return c;
  }

  function myName() {
    return (W.state.profile && W.state.profile.displayName) || '';
  }

  function sameName(a, b) {
    return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
  }

  /* The leaderboard already merges members, roster and results into one
     record per student. Borrowing it keeps one definition of a level. */
  function tallyFor(name, id) {
    if (!global.ClassLeaderboard || !global.ClassLeaderboard.tally) return null;
    var rows;
    try { rows = global.ClassLeaderboard.tally(cls(), {}) || []; }
    catch (e) { return null; }
    for (var i = 0; i < rows.length; i++) {
      if (id && rows[i].id && rows[i].id === id) return rows[i];
    }
    for (var j = 0; j < rows.length; j++) {
      if (sameName(rows[j].name, name)) return rows[j];
    }
    return null;
  }

  /* Who is this, as far as this device can tell. */
  function roleOf(name, id, hint) {
    if (hint) return hint;
    if (sameName(name, myName())) {
      return W.state.role === 'teacher' ? 'you-teacher' : 'you';
    }
    var c = cls();

    /* A student knows their teacher only by the name on the class. */
    if (W.state.enrolled && sameName(name, W.state.enrolled.className)) return 'teacher';

    /* Membership decides this, not who is looking. Keying off the viewer's
       role called every unknown name a student, including one typed by
       hand or left behind by a renamed account. */
    var inClass =
      (c.members || []).some(function (m) { return sameName(m.name, name); }) ||
      c.roster.some(function (n) { return sameName(n, name); }) ||
      c.results.some(function (r) { return sameName(r.name, name); });
    return inClass ? 'student' : 'other';
  }

  var ROLE = {
    'you':         { label: 'You',     tone: 'blue' },
    'you-teacher': { label: 'You',     tone: 'blue' },
    'teacher':     { label: 'Teacher', tone: 'teal' },
    'student':     { label: 'Student', tone: 'slate' },
    'other':       { label: 'Not in this class', tone: 'slate' }
  };

  function initials(n) {
    return String(n || '?').trim().split(/\s+/).slice(0, 2)
      .map(function (w) { return w.charAt(0); }).join('').toUpperCase() || '?';
  }

  /* Their results on this teacher's assignments, newest first. */
  function workFor(name, id) {
    var c = cls();
    var mine = c.results.filter(function (r) {
      return id && r.studentId ? r.studentId === id : sameName(r.name, name);
    });
    var byA = {};
    mine.forEach(function (r) {
      var k = r.assignmentId || r.title || '?';
      if (!byA[k] || (r.at || 0) > (byA[k].at || 0)) byA[k] = r;
    });
    return Object.keys(byA).map(function (k) { return byA[k]; })
      .sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
  }

  function titleOf(r) {
    var c = cls();
    var a = (c.assignments || []).filter(function (x) { return x && x.id === r.assignmentId; })[0];
    return (a && a.title) || r.title || 'Assignment';
  }

  function scoreTone(p) {
    if (p === null || p === undefined) return 'gb__score--none';
    return p >= 80 ? 'gb__score--hi' : p >= 50 ? 'gb__score--mid' : 'gb__score--lo';
  }

  /* ============================== the card ========================== */
  function open(who) {
    who = who || {};
    var name = who.name || '';
    if (!name) return;
    var id = who.id || '';
    var role = roleOf(name, id, who.role);
    var meta = ROLE[role] || ROLE.other;
    var isMe = role === 'you' || role === 'you-teacher';

    var t = tallyFor(name, id);
    var work = workFor(name, id);

    /* Only my own device holds my save, so badges, streaks and diamonds
       are mine to show and nobody else's to guess at. */
    var s = W.state;
    var acc = isMe
      ? (s.stats.answered ? Math.round((s.stats.correct / s.stats.answered) * 100) : null)
      : (t && global.ClassLeaderboard ? global.ClassLeaderboard.accuracy(t) : null);

    var level    = isMe ? s.economy.level : (t && t.level);
    var answered = isMe ? s.stats.answered : (t && t.answered);
    var best     = isMe ? s.streak.best    : (t && t.best);
    var quizzes  = isMe ? s.stats.tests    : (t && t.quizzes);

    global.UI.modal({
      title: 'Profile', icon: I.user, wide: true,
      body:
        '<div class="pcard">' +
          '<div class="pcard__head">' +
            (isMe
              ? '<div class="pcard__av">' + W.avatarHtml(s.profile) + '</div>'
              : '<div class="pcard__ini">' + W.escapeHtml(initials(name)) + '</div>') +
            '<div class="pcard__who">' +
              '<h3>' + W.escapeHtml(name) +
                (isMe ? W.verifiedMark(s.profile, 15) +
                  (global.Badges ? global.Badges.markup(null, 13) : '') : '') +
              '</h3>' +
              '<span class="pcard__role pcard__role--' + meta.tone + '">' + meta.label + '</span>' +
              (isMe ? '' : '<span class="pcard__src">' +
                (t ? 'From your class records' : 'No class record yet') + '</span>') +
            '</div>' +
          '</div>' +

          statGrid() +

          (work.length
            ? '<div class="pcard__sec"><span class="eyebrow">Work handed in</span>' +
                work.map(function (r) {
                  return '<div class="pcard__row">' +
                    '<span class="pcard__row-t">' + W.escapeHtml(titleOf(r)) + '</span>' +
                    (r.correct !== null && r.correct !== undefined && r.total
                      ? '<span class="pcard__row-n mono">' + r.correct + '/' + r.total + '</span>' : '') +
                    '<span class="gb__score ' + scoreTone(r.pct) + '">' + r.pct + '%</span>' +
                  '</div>';
                }).join('') +
              '</div>'
            : '<div class="pcard__sec"><span class="eyebrow">Work handed in</span>' +
              '<div class="pcard__empty">Nothing handed in yet.</div></div>') +

          (isMe && global.Badges && global.Badges.owned().length
            ? '<div class="pcard__sec"><span class="eyebrow">Badges</span>' +
                '<div class="pcard__badges">' +
                  global.Badges.markup(global.Badges.owned(), 15, true) +
                '</div></div>'
            : '') +
        '</div>',
      actions: [{ label: 'Close', cls: 'btn--ghost', close: true }]
    });

    function statGrid() {
      var cells = [
        ['Level',     level    === undefined || level    === null ? null : level],
        ['Accuracy',  acc      === undefined || acc      === null ? null : acc + '%'],
        ['Answered',  answered ? Number(answered).toLocaleString() : null],
        ['Quizzes',   quizzes  === undefined || quizzes  === null ? null : quizzes],
        ['Best streak', best   === undefined || best     === null ? null : best]
      ];
      if (isMe) cells.push(['Diamonds', s.economy.diamonds.toLocaleString()]);
      else if (t && t.games) cells.push(['GeoLive', t.games]);

      var known = cells.filter(function (c) { return c[1] !== null && c[1] !== 0 || c[1] === 0 && false; });
      if (!known.length) {
        return '<div class="pcard__empty pcard__empty--wide">' +
          'Nothing recorded for ' + W.escapeHtml(name) + ' yet. Numbers show up once ' +
          'they hand something in.</div>';
      }
      return '<div class="pcard__stats">' +
        cells.map(function (c) {
          var v = c[1];
          return '<div class="pcard__stat' + (v === null ? ' is-unknown' : '') + '">' +
            '<b>' + (v === null ? '–' : W.escapeHtml(String(v))) + '</b>' +
            '<span>' + c[0] + '</span></div>';
        }).join('') +
      '</div>';
    }
  }

  /* ============================= delegation =========================
     Every selector the click depends on, in one place, so a rename in
     somebody else's file is one edit here rather than a hunt.
  ------------------------------------------------------------------ */
  var HOOKS = [
    { sel: '.lb .gb__name',        role: null },      /* class leaderboard   */
    { sel: '.gb-wrap .gb__name',   role: null },      /* teacher gradebook   */
    { sel: '.person__t b',         role: null },      /* People and roster   */
    { sel: '[data-person-name]',   role: null }       /* anything explicit   */
  ];

  function hit(el) {
    for (var i = 0; i < HOOKS.length; i++) {
      var found = el.closest(HOOKS[i].sel);
      if (found) return { el: found, role: HOOKS[i].role };
    }
    return null;
  }

  function nameFrom(el) {
    if (el.dataset && el.dataset.personName) return el.dataset.personName;
    /* the name cell holds the name and nothing else */
    return (el.textContent || '').trim();
  }

  function idFrom(el) {
    if (el.dataset && el.dataset.personId) return el.dataset.personId;
    var row = el.closest('[data-student-id]');
    return row ? row.getAttribute('data-student-id') : '';
  }

  function onClick(e) {
    var target = e.target;
    if (!target || !target.closest) return;
    /* never swallow a click meant for a control sitting inside the row */
    if (target.closest('button, a, input, select, textarea, .switch')) return;
    var h = hit(target);
    if (!h) return;
    var name = nameFrom(h.el);
    if (!name) return;
    e.preventDefault();
    open({ name: name, id: idFrom(h.el), role: h.role });
  }

  function mark() {
    HOOKS.forEach(function (h) {
      W.$$(h.sel).forEach(function (el) {
        if (el.dataset.personReady) return;
        el.dataset.personReady = '1';
        el.classList.add('is-person');
        if (!el.getAttribute('tabindex')) el.setAttribute('tabindex', '0');
        el.setAttribute('role', 'button');
        el.setAttribute('title', 'See this profile');
      });
    });
  }

  function init() {
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var h = hit(e.target);
      if (!h) return;
      e.preventDefault();
      var name = nameFrom(h.el);
      if (name) open({ name: name, id: idFrom(h.el), role: h.role });
    });
    /* Those four lists redraw constantly, so hint at clickability whenever
       the page changes rather than once at load. */
    if (typeof MutationObserver !== 'undefined') {
      var mo = new MutationObserver(function () { mark(); });
      mo.observe(document.body, { childList: true, subtree: true });
    }
    mark();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  global.Person = { open: open, mark: mark, roleOf: roleOf, hooks: HOOKS };
})(window);
