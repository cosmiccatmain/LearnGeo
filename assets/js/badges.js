/* ------------------------------------------------------------------
   LearnGeo — badges.

   Not to be confused with the avatar decorations in cosmetics.js that
   also say kind:'badge'. Those are ONE emblem worn on the avatar ring,
   and one is showing at a time. These are a COLLECTION: everything the
   account has earned or been given, shown together beside the name and
   laid out in full in the badge case.

   Two ways to hold one, and they never mix:

     earned   a rule in EARN below returned true. Re-checked after every
              answer, so it cannot be granted and cannot be revoked.
     granted  an admin turned it on. No rule, no way to earn it, and the
              only thing that can set it is the admin panel.

   Admin is the reason the split exists. A badge that says somebody runs
   this thing must not be reachable by playing well.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW;

  /* ============================== art ===============================
     Drawn rather than emoji so they sit on the text baseline, take
     currentColor, and stay sharp at 13px beside a name and at 40px in
     the case. Each is a 24-box path set.
  ------------------------------------------------------------------ */
  var ART = {
    shield: '<path d="M12 2.6 4.6 5.8v5.4c0 4.6 3.2 7.8 7.4 9.2 4.2-1.4 7.4-4.6 7.4-9.2V5.8z"/>',
    key:    '<circle cx="9" cy="14.5" r="3.6"/><path d="m11.6 12 7-7 2.6 2.6-1.7 1.7-1.8-1.7-1.7 1.7-1.8-1.7"/>',
    star:   '<path d="m12 3.2 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.7l6.1-.9z"/>',
    spark:  '<path d="M12 2.6 13.9 9l6.4 1.9-6.4 1.9L12 19.2 10.1 12.8 3.7 10.9 10.1 9z"/>',
    globe:  '<circle cx="12" cy="12" r="8.6"/><path d="M3.4 12h17.2M12 3.4a15 15 0 0 1 0 17.2 15 15 0 0 1 0-17.2"/>',
    flame:  '<path d="M12 2.8s4.2 4.2 4.2 8.2a4.2 4.2 0 0 1-8.4 0c0-1 .5-2 1-3-3 2-5.2 4.6-5.2 8.2a8.4 8.4 0 0 0 16.8 0c0-6.2-8.4-13.4-8.4-13.4z"/>',
    target: '<circle cx="12" cy="12" r="8.6"/><circle cx="12" cy="12" r="4.8"/><circle cx="12" cy="12" r="1.3"/>',
    crown:  '<path d="M3.4 7.6 7 12l5-6.6 5 6.6 3.6-4.4V18H3.4z"/>',
    book:   '<path d="M4 5.2A2.2 2.2 0 0 1 6.2 3H20v15.6H6.2A2.2 2.2 0 0 0 4 20.8z"/><path d="M4 18.6h16"/>',
    bolt:   '<path d="M13.4 2.4 4.8 13.6h6.2l-1.4 8 8.6-11.2h-6.2z"/>',
    map:    '<path d="m3.4 6.4 5.6-2.6 6 2.6 5.6-2.6v13.8l-5.6 2.6-6-2.6-5.6 2.6z"/><path d="M9 3.8v13.8M15 6.4v13.8"/>',
    moon:   '<path d="M20 14.4A8.6 8.6 0 0 1 9.6 4 8.6 8.6 0 1 0 20 14.4z"/>',
    sun:    '<circle cx="12" cy="12" r="4.4"/><path d="M12 2.6v2.6M12 18.8v2.6M2.6 12h2.6M18.8 12h2.6M5.4 5.4l1.9 1.9M16.7 16.7l1.9 1.9M18.6 5.4l-1.9 1.9M7.3 16.7l-1.9 1.9"/>',
    seed:   '<path d="M12 21c0-5 3.6-8.6 8.6-8.6C20.6 17.4 17 21 12 21z"/><path d="M12 21C12 16 8.4 12.4 3.4 12.4 3.4 17.4 7 21 12 21z"/><path d="M12 21v-7"/>'
  };

  function art(id) { return ART[id] || ART.star; }

  /* ============================ catalogue ===========================
     tone drives the plate colour in the case and the tint beside a name.
  ------------------------------------------------------------------ */
  var BADGES = [
    /* ---- granted only. No rule, so nothing here can be played into. ---- */
    { id: 'admin', name: 'Admin', art: 'key', tone: 'admin', grant: true,
      desc: 'Runs LearnGeo. Granted from the admin panel and nowhere else.' },
    { id: 'staff', name: 'Staff', art: 'shield', tone: 'staff', grant: true,
      desc: 'Works on LearnGeo.' },
    { id: 'teacher', name: 'Teacher', art: 'book', tone: 'teach', grant: true,
      desc: 'Runs a class here.' },
    { id: 'founder', name: 'Founder', art: 'crown', tone: 'gold', grant: true,
      desc: 'Was here at the start.' },
    { id: 'tester', name: 'Beta Tester', art: 'seed', tone: 'beta', grant: true,
      desc: 'Broke things early so nobody else had to.' },

    /* ---- earned. Each one re-checks itself after every answer. ---- */
    { id: 'first-answer', name: 'First Steps', art: 'spark', tone: 'slate',
      desc: 'Answer your first question.',
      test: function (s) { return s.stats.answered >= 1; } },

    { id: 'centurion', name: 'Centurion', art: 'bolt', tone: 'blue',
      desc: 'Answer 100 questions.',
      test: function (s) { return s.stats.answered >= 100; } },

    { id: 'thousand', name: 'Four Figures', art: 'star', tone: 'violet',
      desc: 'Answer 1,000 questions.',
      test: function (s) { return s.stats.answered >= 1000; } },

    { id: 'sharp', name: 'Sharpshooter', art: 'target', tone: 'green',
      desc: 'Hold 90% accuracy over at least 100 answers.',
      test: function (s) {
        return s.stats.answered >= 100 &&
               (s.stats.correct / s.stats.answered) >= 0.9;
      } },

    { id: 'flawless', name: 'Flawless', art: 'spark', tone: 'green',
      desc: 'Score 100% on a practice test.',
      test: function (s) { return (s.stats.perfectTests || 0) >= 1; } },

    { id: 'week', name: 'Seven Days', art: 'flame', tone: 'amber',
      desc: 'Keep a seven day streak.',
      test: function (s) { return (s.daily.dayStreak || 0) >= 7; } },

    { id: 'month', name: 'Thirty Days', art: 'flame', tone: 'red',
      desc: 'Keep a thirty day streak.',
      test: function (s) { return (s.daily.dayStreak || 0) >= 30; } },

    { id: 'cartographer', name: 'Cartographer', art: 'map', tone: 'teal',
      desc: 'Master 50 places.',
      test: function () { return W.masteredCount() >= 50; } },

    { id: 'globetrotter', name: 'Globetrotter', art: 'globe', tone: 'blue',
      desc: 'Master 150 places.',
      test: function () { return W.masteredCount() >= 150; } },

    { id: 'whole-world', name: 'The Whole World', art: 'globe', tone: 'gold',
      desc: 'Master every place in the dataset.',
      test: function () {
        return global.GeoData && W.masteredCount() >= global.GeoData.counts.total;
      } },

    { id: 'early', name: 'Early Bird', art: 'sun', tone: 'amber',
      desc: 'Answer a question before 7am.',
      test: function (s) { return !!(s.flags && s.flags.early); } },

    { id: 'night', name: 'Night Owl', art: 'moon', tone: 'indigo',
      desc: 'Answer a question after midnight.',
      test: function (s) { return !!(s.flags && s.flags.night); } }
  ];

  var BY_ID = {};
  BADGES.forEach(function (b) { BY_ID[b.id] = b; });

  function find(id) { return BY_ID[id] || null; }
  function all() { return BADGES.slice(); }
  function granted(b) { return !!b.grant; }

  /* ============================== state =============================
     state.badges holds the ids. Kept on the save rather than derived so
     a granted badge survives a reload, and so an earned one does not
     silently vanish if a rule is later tightened.
  ------------------------------------------------------------------ */
  function owned() {
    var s = W.state;
    if (!Array.isArray(s.badges)) s.badges = [];
    return s.badges;
  }

  function has(id) { return owned().indexOf(id) !== -1; }

  /* Which badges show beside the name, in order, capped. */
  var SHOWN_MAX = 3;

  function shown() {
    var p = W.state.profile;
    var pick = Array.isArray(p.badgeSlots) ? p.badgeSlots : null;
    var list = (pick || owned()).filter(has);
    /* granted badges lead, because that is the thing people look for */
    if (!pick) {
      list = list.slice().sort(function (a, b) {
        var ga = granted(find(a) || {}) ? 0 : 1;
        var gb = granted(find(b) || {}) ? 0 : 1;
        if (ga !== gb) return ga - gb;
        return BADGES.indexOf(find(a)) - BADGES.indexOf(find(b));
      });
    }
    return list.slice(0, SHOWN_MAX);
  }

  /* ============================ evaluation ==========================
     Earned only. Never touches a granted badge, so an admin toggling one
     off is not undone by the next answer.
  ------------------------------------------------------------------ */
  function evaluate() {
    var s = W.state, fresh = [];
    BADGES.forEach(function (b) {
      if (granted(b) || !b.test) return;
      if (has(b.id)) return;
      var ok = false;
      try { ok = !!b.test(s); } catch (e) { ok = false; }
      if (ok) { owned().push(b.id); fresh.push(b); }
    });
    if (fresh.length) W.save();
    return fresh;
  }

  /* Time-of-day badges need a mark at the moment of answering, because
     the clock has moved on by the time anything else looks. */
  function noteAnswerTime(when) {
    var s = W.state;
    if (!s.flags) s.flags = {};
    var h = (when || new Date()).getHours();
    var before = '' + !!s.flags.early + !!s.flags.night;
    if (h < 7) s.flags.early = true;
    if (h >= 0 && h < 5) s.flags.night = true;
    if (before !== '' + !!s.flags.early + !!s.flags.night) W.save();
  }

  function announce(list) {
    (list || []).forEach(function (b, i) {
      setTimeout(function () {
        if (W.Sound && W.Sound.gem) W.Sound.gem();
        W.toast('Badge earned: ' + b.name, b.desc, markup([b.id], 16, true), 4200);
      }, 520 + i * 520);
    });
  }

  /* ============================= granting ===========================
     Admin only. Returns false when asked to grant something earnable,
     so a mis-wired caller cannot hand out an earned badge.
  ------------------------------------------------------------------ */
  function grant(id) {
    var b = find(id);
    if (!b || !granted(b) || has(id)) return false;
    owned().push(id);
    W.saveNow();
    return true;
  }

  function revoke(id) {
    var b = find(id);
    if (!b || !granted(b) || !has(id)) return false;
    W.state.badges = owned().filter(function (x) { return x !== id; });
    var p = W.state.profile;
    if (Array.isArray(p.badgeSlots)) {
      p.badgeSlots = p.badgeSlots.filter(function (x) { return x !== id; });
    }
    W.saveNow();
    return true;
  }

  function setShown(ids) {
    W.state.profile.badgeSlots = (ids || []).filter(has).slice(0, SHOWN_MAX);
    W.saveNow();
  }

  /* ============================= rendering ========================== */
  function svg(b, size) {
    var s = size || 14;
    return '<svg class="bdg__art" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" ' +
      'fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" ' +
      'stroke-linejoin="round" aria-hidden="true">' + art(b.art) + '</svg>';
  }

  /* A row of badges to sit beside a name. Returns '' when there is
     nothing to show, so callers can concatenate it unconditionally. */
  /* `onPlate` is for a name sitting on a nameplate or a banner. The pastel
     fills that read as emblems against white read as stickers against a
     colour, so there they turn into frosted glass and keep only their ink. */
  function markup(ids, size, bare, onPlate) {
    var list = (ids || shown()).map(find).filter(Boolean);
    if (!list.length) return '';
    var inner = list.map(function (b) {
      return '<span class="bdg bdg--' + b.tone + (onPlate ? ' bdg--plate' : '') +
        '" title="' + W.escapeHtml(b.name + ' — ' + b.desc) +
        '" role="img" aria-label="' + W.escapeHtml(b.name) + '">' + svg(b, size || 13) + '</span>';
    }).join('');
    return bare ? inner : '<span class="bdg-row">' + inner + '</span>';
  }

  /* =========================== the badge case ======================= */
  function openCase() {
    var have = owned();
    var earned = BADGES.filter(function (b) { return !granted(b); });
    var role = BADGES.filter(granted);

    global.UI.modal({
      title: 'Badges', icon: W.Icons.trophy, wide: true,
      body:
        '<div class="row row--between" style="margin-bottom:14px">' +
          '<span class="eyebrow">' + have.length + ' of ' + BADGES.length + ' held</span>' +
          '<span class="t-sm t-muted">Up to ' + SHOWN_MAX + ' show beside your name</span>' +
        '</div>' +
        section('Earned by playing', earned) +
        section('Given, not earned', role) +
        '<div class="field__hint" style="margin-top:14px">Click one you hold to show or hide it ' +
          'beside your name.</div>',
      actions: [{ label: 'Done', cls: 'btn--ghost', close: true }],
      onMount: function (root) {
        W.$$('[data-bdg]', root).forEach(function (el) {
          el.addEventListener('click', function () {
            var id = el.dataset.bdg;
            if (!has(id)) return;
            var cur = shown().slice();
            var at = cur.indexOf(id);
            if (at !== -1) cur.splice(at, 1);
            else if (cur.length < SHOWN_MAX) cur.push(id);
            else return W.toast('Three at a time', 'Hide one before showing another', W.Icons.info);
            setShown(cur);
            paint(root);
            if (global.UI.refreshHud) global.UI.refreshHud();
            if (global.Portal && document.body.classList.contains('view-portal')) global.Portal.render();
          });
        });
        paint(root);
      }
    });

    function section(title, list) {
      return '<div class="field"><label class="field__label">' + title + '</label>' +
        '<div class="bdg-grid">' +
          list.map(function (b) {
            return '<button class="bdg-card" data-bdg="' + b.id + '">' +
              '<span class="bdg-card__plate bdg--' + b.tone + '">' + svg(b, 26) + '</span>' +
              '<b>' + W.escapeHtml(b.name) + '</b>' +
              '<span class="bdg-card__desc">' + W.escapeHtml(b.desc) + '</span>' +
              '<span class="bdg-card__state"></span>' +
            '</button>';
          }).join('') +
        '</div></div>';
    }

    function paint(root) {
      var on = shown();
      W.$$('[data-bdg]', root).forEach(function (el) {
        var id = el.dataset.bdg;
        var held = has(id);
        el.classList.toggle('is-held', held);
        el.classList.toggle('is-shown', on.indexOf(id) !== -1);
        var tag = el.querySelector('.bdg-card__state');
        tag.textContent = !held ? 'Locked' : on.indexOf(id) !== -1 ? 'Showing' : 'Held';
      });
    }
  }

  global.Badges = {
    all: all, find: find, has: has, owned: owned, shown: shown, granted: granted,
    evaluate: evaluate, announce: announce, noteAnswerTime: noteAnswerTime,
    grant: grant, revoke: revoke, setShown: setShown,
    markup: markup, svg: svg, openCase: openCase,
    get max() { return SHOWN_MAX; }
  };
})(window);
