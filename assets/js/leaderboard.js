/* ------------------------------------------------------------------
   LearnGeo — the all-time class leaderboard.

   The standing table for a class: who has done the work, and how well.
   It is not part of GeoLive and does not need a live game to have ever
   been played.

   ClassLeaderboard.mount(el, { classId, classroom, people, enabled })

   It ranks on LEVEL, and never on diamonds.

   Diamonds are spendable. A student buys things in the shop with them,
   so a table built on diamonds ranks the hoarder above the learner and
   two students who did identical work end up apart because one bought a
   hat. XP only ever accumulates and level derives from it, so level
   measures work done and cannot go backwards. Diamonds do not appear on
   this table at all, and nothing here reads them.

   Level comes from answered questions, counted the same whether they
   were answered in a quiz or in a live game. Deliberately not from
   GeoLive's points, which carry a speed bonus: how fast a student
   taps should not decide where they sit on a term-long table, for the
   same reason spending should not.

   Identity is the account, never the name. The gradebook was keyed on
   display names until this was fixed, which meant two students called
   Sam shared one row and one average.

   It fails soft. No class, no results, a class where the feature is
   switched off, missing live_ tables: all of those do something sane
   and none of them throw. Nothing here shares a promise with the class
   sync.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW;

  /* core.js awards 10 XP for a correct answer before its combo
     multiplier. The multiplier depends on the run a student was on at
     the time, which is not stored on a result, so it cannot be
     reconstructed here and is left out. That makes this a floor on the
     XP a student really earned, applied identically to everyone, which
     is what a ranking needs. */
  var XP_PER_CORRECT = 10;
  var STREAK_BAR = 80;   /* the mark a quiz has to reach to keep a streak */

  /* ============================ identity =========================== */

  /* teacher.js owns this rule. Use its copy when it is there. */
  function ownerKey(r) {
    var T = global.Teacher;
    if (T && typeof T.ownerKey === 'function') {
      try { return T.ownerKey(r); } catch (e) { /* fall through */ }
    }
    return r.studentId || ('name:' + r.name);
  }

  function cls() {
    var s = W && W.state;
    return (s && s.classroom) || null;
  }

  /* teacher.js owns who is in a class, and it is loaded before this file
     and passes its answer in. This carried a copy of its merge rule for
     two rounds, while the export existed only in a folder waiting to be
     merged: losing that race would have merged two students with the
     same name into one row, which is the one failure here nobody would
     spot from the screen. The export is on main now, so the copy is
     gone and there is one rule again.

     If neither source answers, this returns nobody and the table says
     the class is empty. That is the right way to be wrong: an empty
     table is obviously wrong, a table built on a guessed identity rule
     is wrong and looks fine. */
  function roster(c, opts) {
    if (opts && opts.people && opts.people.length) return opts.people.slice();
    var T = global.Teacher;
    if (T && typeof T.people === 'function') {
      try {
        var list = T.people();
        if (list && list.length) return list.slice();
      } catch (e) { /* fall through */ }
    }
    return [];
  }

  /* ============================== level ============================ */

  /* core.js's own curve, asked for rather than copied, so the table and
     the student's own profile cannot drift apart. The fallback is the
     same formula and only matters if this somehow runs before core. */
  function xpToNext(level) {
    if (W && typeof W.xpToNext === 'function') {
      var n = W.xpToNext(level);
      if (isFinite(n) && n > 0) return n;
    }
    return 80 + 40 * level;
  }

  /* Walks the curve exactly the way award() does when it levels a
     student up, so a given XP total lands on the same level here as it
     would on their own device. */
  function levelFrom(xp) {
    var level = 1, left = Math.max(0, Math.round(xp) || 0), need = xpToNext(1), guard = 0;
    while (left >= need && guard++ < 100000) {
      left -= need;
      level += 1;
      need = xpToNext(level);
    }
    return { level: level, into: left, need: need };
  }

  /* A synced level and its leftover XP, tidied. core.js keeps xp as
     progress inside the current level and rolls it over on the way up,
     so a row claiming more XP than the level needs is a row written
     before a level up landed. Rolling it over here rather than clamping
     keeps the number the student's own screen would show. */
  function normalise(level, into) {
    var lv = Math.max(1, Math.round(Number(level)) || 1);
    var left = Math.max(0, Math.round(Number(into)) || 0);
    var need = xpToNext(lv), guard = 0;
    while (left >= need && guard++ < 100000) {
      left -= need;
      lv += 1;
      need = xpToNext(lv);
    }
    return { level: lv, into: left, need: need };
  }

  /* The student's real level, once it is somewhere a teacher can read.
     Owen chose to sync the real number rather than relabel a derived
     one, so the device is the source of truth and this column mirrors
     it. Only an account can carry one: a name the teacher typed has no
     device behind it.

     oy-01 has not settled whether it lands on class_members or
     profiles, so this reads the places it could plausibly arrive and
     takes the first that answers. When none of them do, the caller
     falls back to the level derived from class work. */
  function syncedLevel(t, c, opts) {
    if (!t.id) return null;

    function fromRow(row) {
      if (!row) return null;
      var lv = row.level, xp = row.xp;
      if (lv === null || lv === undefined || !isFinite(Number(lv))) return null;
      /* No guessing needed: class_members.level and .xp are nullable with
         no default, and cloud.js only copies them onto a member when
         they are actually numbers. So absent means nobody has synced and
         present means somebody did, including a genuine level 1. This
         used to carry a guard reading level 1 with no XP as unsynced,
         written when the columns defaulted to 1; that default is gone
         and so is the guard, because it would now hide a real level. */
      return { level: Number(lv), xp: Number(xp) || 0 };
    }

    if (opts && opts.levels && opts.levels[t.id]) {
      var injected = fromRow(opts.levels[t.id]);
      if (injected) return injected;
    }
    var direct = fromRow(t.person);
    if (direct) return direct;

    var members = (c && c.members) || [];
    for (var i = 0; i < members.length; i++) {
      if (members[i] && members[i].id === t.id) {
        var m = fromRow(members[i]);
        if (m) return m;
      }
    }
    return null;
  }

  /* ============================ the maths ========================== */

  /* One result per student per assignment, newest wins, matching
     latest() in the gradebook. A student who retried four times is one
     row there, and a leaderboard that disagreed with the gradebook
     beside it would just look broken.

     Ordered on the timestamp and then the assignment id. The second key
     is not decoration: two results handed in within the same
     millisecond used to keep whatever order the database returned, and
     the streak walk below reads them in order, so the same three quizzes
     could give a best streak of 1 or 2 depending on the reply. */
  function counted(results) {
    var by = {}, out = [];
    (results || []).forEach(function (r) {
      if (!r || !r.name) return;
      var k = ownerKey(r) + '|' + r.assignmentId;
      if (!by[k] || (r.at || 0) > (by[k].at || 0)) by[k] = r;
    });
    Object.keys(by).forEach(function (k) { out.push(by[k]); });
    return out.sort(function (a, b) {
      if ((a.at || 0) !== (b.at || 0)) return (a.at || 0) - (b.at || 0);
      var ai = String(a.assignmentId || ''), bi = String(b.assignmentId || '');
      return ai < bi ? -1 : ai > bi ? 1 : 0;
    });
  }

  function pctOf(r) {
    var p = Number(r.pct);
    if (!isFinite(p)) return 0;
    return p < 0 ? 0 : p > 100 ? 100 : p;
  }

  function median(list) {
    if (!list.length) return 0;
    var s = list.slice().sort(function (a, b) { return a - b; });
    var m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
  }

  /* How many questions a hand-typed mark stood for.

     A teacher who marks on paper types a percentage and nothing else, so
     those rows carry no question count. Left at nothing they earn no XP,
     and a class marked entirely by hand reads "not started" from top to
     bottom while the gradebook beside it shows 95% and 40%. A teacher
     who marks by hand is not an edge case, and a leaderboard that says
     less than the gradebook next to it is worse than no leaderboard.

     So the count is looked up rather than invented, worst case first:

       1. what classmates actually answered on the same assignment. Real
          evidence, and better than the assignment's own setting, since a
          test configured for 20 that could only fill 12 really was 12.
       2. the assignment's own count, or the length of its country list.
       3. what a typical assignment in this class actually ran to.

     If none of those answer, the mark earns no XP, which is where this
     started. Nothing here is guessed from thin air: every branch is a
     number some real quiz in this class actually produced. */
  function questionCounts(c) {
    var perAssignment = {}, all = [];
    (c.results || []).forEach(function (r) {
      var total = Number(r && r.total) || 0;
      if (total <= 0) return;
      var id = String(r.assignmentId || '');
      (perAssignment[id] = perAssignment[id] || []).push(total);
      all.push(total);
    });

    var declared = {};
    (c.assignments || []).forEach(function (a) {
      if (!a || !a.id) return;
      var cfg = a.config || {};
      var n = Number(cfg.count) || 0;
      if (!n && cfg.countries && cfg.countries.length) n = cfg.countries.length;
      if (n > 0) declared[String(a.id)] = n;
    });

    var classWide = median(all);

    return function (assignmentId) {
      var id = String(assignmentId || '');
      if (perAssignment[id] && perAssignment[id].length) return median(perAssignment[id]);
      if (declared[id]) return declared[id];
      return classWide;   /* 0 when the class has never run one in the app */
    };
  }

  function blank(p) {
    return {
      id: p.id || '', name: p.name, keys: p.keys, person: p,
      quizzes: 0, pctSum: 0, estimated: 0,
      /* kept apart from the live figures so applying GeoLive twice
         cannot count it twice */
      quizAnswered: 0, quizRight: 0, quizBest: 0,
      liveAnswered: 0, liveRight: 0, liveBest: 0, live: 0, games: 0, excluded: 0
    };
  }

  function tally(c, opts) {
    var people = roster(c, opts);
    var rows = counted(c.results);
    var countFor = questionCounts(c);
    var byKey = {}, out = [];

    people.forEach(function (p) {
      var t = blank(p);
      t.synced = syncedLevel(t, c, opts);
      out.push(t);
      (p.keys || []).forEach(function (k) { byKey[k] = t; });
    });

    var run = {};
    rows.forEach(function (r) {
      var t = byKey[ownerKey(r)];
      if (!t) return;
      var pct = pctOf(r);
      var key = ownerKey(r);

      t.quizzes += 1;
      t.pctSum += pct;

      /* Right out of answered, never right out of asked. A quiz row only
         exists once the quiz is finished so the two match here, but a
         live game is a place a student can answer fewer than were asked
         and should not be marked wrong for the ones they never saw. */
      var total = Number(r.total) || 0;
      if (total > 0) {
        t.quizAnswered += total;
        t.quizRight += Math.min(Number(r.correct) || 0, total);
      } else {
        /* A hand-typed mark. Stand it on a real question count. */
        var n = countFor(r.assignmentId);
        if (n > 0) {
          t.quizAnswered += n;
          t.quizRight += Math.round(pct / 100 * n);
          t.estimated += 1;
        }
      }

      if (pct >= STREAK_BAR) {
        run[key] = (run[key] || 0) + 1;
        if (run[key] > t.quizBest) t.quizBest = run[key];
      } else {
        run[key] = 0;
      }
    });

    out.forEach(settle);
    return out;
  }

  /* Everything derived sits here, so GeoLive can be folded in and the
     same function run again over the same numbers. */
  function settle(t) {
    t.answered = t.quizAnswered + t.liveAnswered;
    t.right = t.quizRight + t.liveRight;
    t.best = Math.max(t.quizBest, t.liveBest);
    t.xp = t.right * XP_PER_CORRECT;

    if (t.synced) {
      /* The real thing: what the student's own screen says. */
      var real = normalise(t.synced.level, t.synced.xp);
      t.level = real.level;
      t.into = real.into;
      t.need = real.need;
      t.levelSource = 'synced';
      /* Level 1 with nothing in it and no class work is a student who
         has not started, whatever their device says. */
      t.started = t.answered > 0 || t.games > 0 || t.level > 1 || t.into > 0;
      return;
    }

    /* Nothing synced yet. Derived from work recorded in this class, on
       core.js's own curve, so it is a real level in the same units and
       simply a lower one: it cannot see solo practice. */
    var lv = levelFrom(t.xp);
    t.level = lv.level;
    t.into = lv.into;
    t.need = lv.need;
    t.levelSource = 'class';
    t.started = t.answered > 0 || t.games > 0;
  }

  /* =========================== GeoLive ============================= */

  /* oy-03 owns every call that touches Supabase for GeoLive, so this
     asks for a total rather than reading live_players itself. It hands
     back [{studentId, name, points, bestStreak, games, answered,
     correct}], ended games only, and resolves empty when the live_
     tables are not there. */
  /* Classes we have asked about and found no finished games in, with the
     time we asked. A teacher screen redraws often and each redraw
     remounts this table, so a class that has never run a live game would
     otherwise query those tables every time somebody glances at it.

     Deliberately short, and deliberately cleared by refresh(): a teacher
     who has just finished a game and come straight back to this table
     must see it. The probe inside available() is already cached by
     oy-03 for the life of the page, so this is only about the two
     queries totals() runs after it. */
  var noGames = {};
  var NO_GAMES_FOR = 60000;

  function forget(classId) { delete noGames[classId]; }

  function liveTotals(classId, opts) {
    if (opts && opts.liveTotals) return Promise.resolve(opts.liveTotals);
    var C = global.GeoLiveCloud;
    if (!C || typeof C.totals !== 'function' || !classId) return null;

    var asked = noGames[classId];
    if (asked && (Date.now() - asked) < NO_GAMES_FOR) return null;

    try {
      /* Its own promise on purpose. Joining a Promise.all with the class
         sync would let a GeoLive failure take the teacher dashboard and
         every student's assignment list down with it. */
      return Promise.resolve(C.totals(classId)).then(function (list) {
        var rows = Array.isArray(list) && list.length ? list : null;
        if (rows) forget(classId); else noGames[classId] = Date.now();
        return rows;
      }, function () { return null; });
    } catch (e) {
      return null;
    }
  }

  /* Sets the GeoLive figures rather than adding to them, so calling this
     twice with the same rows leaves the same numbers. It used to add,
     which turned level 3 into level 4 on a second call. mount() happened
     to be safe because it re-tallies first, but this is exported and a
     screen that refreshes by calling it again on tallies it already
     holds would have inflated levels silently. */
  function applyLive(tallies, list) {
    if (!list || !list.length) return false;

    var byKey = {}, byName = {};
    tallies.forEach(function (t) {
      (t.keys || []).forEach(function (k) { byKey[k] = t; });
      /* A player the teacher added by hand has no account, so a name is
         all that holds them together. oy-03 now folds that name exactly
         as teacher.js does, case and all, so this second lookup cannot
         fire. It stays because the failure it prevents is silent: points
         going quietly missing rather than anything erroring. */
      byName[String(t.name || '').toLowerCase()] = t;
    });

    var touched = [], used = false;
    list.forEach(function (row) {
      if (!row) return;
      var name = String(row.name || '');
      var t = byKey[row.studentId || ('name:' + name)];
      if (!t && !row.studentId) t = byName[name.toLowerCase()];
      if (!t) return;

      if (touched.indexOf(t) === -1) {
        /* first row for this student in this call: clear, do not add */
        t.liveAnswered = 0; t.liveRight = 0; t.liveBest = 0;
        t.live = 0; t.games = 0; t.excluded = 0;
        touched.push(t);
      }

      /* God mode must not appear here beside real students on points it
         did not earn. The exclusion cannot happen in this file and that
         is not a gap: totals() sums a student's games before I see them,
         so by the time a row arrives, one god-mode game and three real
         ones are a single number that cannot be unpicked. The filtering
         belongs where the rows still exist.

         Nothing here reads GodMode.on either. That is the viewing
         device's own state, and a board that hid rows because of what
         the reader's browser happens to be doing would be a comment, not
         a protection: the same board on a teacher's laptop would show
         the lie. What this file honours is what the DATA says.

         Two shapes, whichever oy-03 settles on:
           excludedGames  a count already removed from the sums, used
                          only to tell the teacher. This is the one to
                          prefer, because the numbers arrive clean.
           godMode: true  the whole entry was played in god mode, so
                          drop it. Only correct when an entry never mixes
                          god-mode and real play. */
      var dropped = Number(row.excludedGames) || 0;
      if (row.godMode === true) {
        t.excluded += Math.max(1, Number(row.games) || 1) + dropped;
        used = true;
        return;
      }
      t.excluded += dropped;

      /* Points are shown, never ranked on. They carry a speed bonus. */
      t.live += Number(row.points) || 0;
      t.games += Number(row.games) || 0;

      var bs = Number(row.bestStreak) || 0;
      if (bs > t.liveBest) t.liveBest = bs;

      /* What a live game contributes to a level: the questions actually
         answered, worth exactly what a quiz question is worth. */
      var answered = Number(row.answered) || 0;
      if (answered > 0) {
        t.liveAnswered += answered;
        t.liveRight += Math.min(Number(row.correct) || 0, answered);
      }

      used = true;
    });

    if (used) tallies.forEach(settle);
    return used;
  }

  /* ============================ ranking ============================ */

  function accuracy(t) {
    if (t.answered > 0) return Math.round(t.right / t.answered * 100);
    if (t.quizzes > 0) return Math.round(t.pctSum / t.quizzes);  /* typed-in marks only */
    return null;
  }

  /* THE RANKING RULE. This is where it is decided; the line the table
     prints under itself says the same thing in the teacher's words.

     A class of thirty lands on a handful of levels, so ties here are not
     an edge case, they are most of the board: measured 2026-09-12, a
     realistic thirty put every single student on a shared place. So the
     order has to be total, and it has to be the same order every render,
     every session and every device. A board that quietly reorders equal
     students in front of a class is worse than one that ranks them
     wrongly, because nobody can tell which draw was the true one.

       1. anyone who has started, above anyone who has not
       2. higher level
       3. further into that level, since two students on level 4 are not
          equal if one is nearly 5. This is the tie-break a teacher can
          repeat, and it is the last one that decides a PLACE: students
          matching on 2 and 3 share a place and are marked tied.
       4. better accuracy          } these only decide the order inside a
       5. name, then account id    } shared place, never the place itself

     Keys 4 and 5 exist so the display order cannot wander. The account
     id is the floor and cannot tie: two accounts sharing a display name
     used to fall through every other test and land in whatever order the
     roster arrived in, which is a network result. Names are compared
     with < rather than localeCompare on purpose, so the order does not
     depend on the device's locale. */
  function order(tallies) {
    return tallies.slice().sort(function (a, b) {
      if (a.started !== b.started) return a.started ? -1 : 1;
      if (b.level !== a.level) return b.level - a.level;
      if (b.into !== a.into) return b.into - a.into;
      var aa = accuracy(a) || 0, ba = accuracy(b) || 0;
      if (ba !== aa) return ba - aa;
      if (a.name !== b.name) return a.name < b.name ? -1 : 1;
      var ai = String(a.id || ''), bi = String(b.id || '');
      return ai < bi ? -1 : ai > bi ? 1 : 0;
    });
  }

  /* Joint places, the way a scoreboard does it: two students level with
     each other are both second and the next one is fourth. Level with
     each other means the same level AND the same XP inside it, which is
     what the ranking actually compares. */
  function ranked(sorted) {
    var place = 0, seen = 0, key = null;
    return sorted.map(function (t) {
      seen += 1;
      var k = t.started ? (t.level + ':' + t.into) : 'none';
      if (key === null || k !== key) { place = seen; key = k; }
      t.place = place;
      t.tied = false;
      return t;
    }).map(function (t, i, all) {
      t.tied = all.filter(function (o) { return o.place === t.place; }).length > 1;
      return t;
    });
  }

  /* ============================ drawing ============================ */

  /* oy-06 wrote assets/css/leaderboard.css for this table. It is
     additive: cr-card, gb-wrap, gb, gb__name and gb__score are still the
     app's own, which is why this reads as part of LearnGeo rather than a
     widget dropped into it. The lb- classes cover only what the
     gradebook has no way to say, which is everything the level ranking
     introduced. Every one of them degrades to no change if the
     stylesheet is absent. */

  function esc(s) {
    if (W && typeof W.escapeHtml === 'function') return W.escapeHtml(s);
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function num(n) { return Number(n || 0).toLocaleString(); }

  function scoreClass(pct) {
    if (pct === null) return 'gb__score--none';
    return pct >= 80 ? 'gb__score--hi' : pct >= 50 ? 'gb__score--mid' : 'gb__score--lo';
  }

  function empty(headline, detail) {
    return '<div class="cr-card"><div class="lb-empty">' +
      '<b>' + esc(headline) + '</b>' +
      (detail ? '<p>' + esc(detail) + '</p>' : '') +
      '</div></div>';
  }

  /* Who is looking, so their own row can be tinted. A teacher is not in
     their own class, so usually nobody matches and no row is marked. */
  function meId(opts) {
    if (opts && opts.meId) return opts.meId;
    try {
      var C = global.Cloud;
      return (C && C.user && C.user.id) || '';
    } catch (e) { return ''; }
  }

  /* A medal is a placing against somebody. One student on their own has
     not come first, and a table where everyone is level has no podium. */
  function contested(list) {
    var started = list.filter(function (t) { return t.started; });
    if (started.length < 2) return false;
    return started[0].place !== started[started.length - 1].place;
  }

  /* The equals sign for a shared rank is drawn by the stylesheet, not
     written here, so a screen reader still hears the number and a tie
     never shifts the column. */
  function rankCell(t, medals) {
    if (!t.started) return '<td class="lb-rank"></td>';
    var c = 'lb-rank';
    if (medals && t.place <= 3) c += ' is-' + t.place;
    if (t.tied) c += ' is-tied';
    return '<td class="' + c + '">' + t.place + '</td>';
  }

  function levelCell(t) {
    if (!t.started) {
      /* Never a zero. A zero says they did the work and scored nothing,
         which is a worse thing to put in front of a class than the
         truth. The dash is drawn by the stylesheet. */
      return '<td><span class="lb-none">not started</span></td>';
    }
    /* A title rather than a new class: oy-06's stylesheet has no rule
       for an estimated level, and inventing a class it does not define
       is how a column ends up styled by nothing. */
    var est = t.levelSource === 'class';
    return '<td><span class="lb-level"' +
      (est ? ' title="Worked out from this class. Their real level appears once their device syncs."' : '') +
      '>' +
      '<span class="lb-level__word">' + (est ? 'Lv~' : 'Lv') + '</span>' +
      '<span class="lb-level__n">' + num(t.level) + '</span>' +
      '</span></td>';
  }

  function progressCell(t) {
    if (!t.started) return '<td></td>';
    var pct = t.need > 0 ? Math.round(t.into / t.need * 100) : 0;
    if (pct < 0) pct = 0; else if (pct > 100) pct = 100;
    return '<td>' +
      '<span class="lb-prog" style="--lb-pct:' + pct + '">' +
        '<span class="lb-prog__fill"></span>' +
      '</span> ' +
      '<span class="lb-xp">' + num(t.into) + '/' + num(t.need) + '</span>' +
      '</td>';
  }

  function table(list, showLive) {
    var medals = contested(list);
    var solo = list.length === 1;
    var me = meId();
    return '<div class="gb-wrap lb' + (solo ? ' is-solo' : '') + '">' +
      '<table class="gb"><thead><tr>' +
      '<th class="lb-rank">#</th><th>Student</th><th>Level</th><th>Progress</th>' +
      '<th>Quizzes</th><th>Accuracy</th><th>Answered</th><th>Best streak</th>' +
      (showLive ? '<th>GeoLive</th>' : '') +
      '</tr></thead><tbody>' +
      list.map(function (t) {
        var acc = accuracy(t);
        var mine = me && t.id && t.id === me;
        return '<tr' + (mine ? ' class="lb-me"' : '') + '>' +
          rankCell(t, medals) +
          '<td class="gb__name">' + esc(t.name) + '</td>' +
          levelCell(t) +
          progressCell(t) +
          '<td class="mono">' + num(t.quizzes) + '</td>' +
          '<td><span class="gb__score ' + scoreClass(acc) + '">' +
            (acc === null ? '–' : acc + '%') + '</span></td>' +
          '<td class="mono">' + (t.answered ? num(t.answered) : '–') + '</td>' +
          '<td class="mono">' + (t.best ? num(t.best) : '–') + '</td>' +
          (showLive ? '<td class="mono">' + (t.games ? num(t.live) : '–') + '</td>' : '') +
        '</tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  /* The caption is one sentence about what the table is, then a note for
     each thing on it that is not self-explanatory. Built in that order on
     purpose: the first line a teacher reads should tell them what they
     are looking at, not explain a tilde they have not noticed yet. */
  function caption(list) {
    var live = list.filter(function (t) { return t.started; });
    var est = live.filter(function (t) { return t.levelSource === 'class'; }).length;
    var real = live.length - est;
    var waiting = list.length - live.length;
    var line;

    /* A class of one is told plainly rather than ranked. The rank column
       is hidden by .lb.is-solo, so without this the row would sit there
       with no explanation for where the ranking went. */
    if (list.length === 1) {
      return '<div class="lb-solo-note">' +
        'One student in this class, so there is nothing to rank yet. ' +
        'Their level still counts up as they work.</div>';
    }

    if (live.length === 1) {
      /* A ranking of one is not a ranking. Say so rather than leaving a
         lone "1" looking like somebody won something. */
      line = 'Only ' + esc(live[0].name) + ' has started, so there is nothing to ' +
             'compare yet. The rest join the ranking as they answer questions.';
    } else {
      line = 'Ranked on level, which counts questions answered in quizzes and ' +
             'live games alike. Retakes count once, the same as in the gradebook.';
      if (waiting > 0) {
        line += ' ' + plural(waiting, 'student has', 'students have') +
                ' not answered anything yet.';
      }
    }

    /* The ranking rule, in words a teacher can repeat to a student who
       asks why they are level with someone. Shown only when the board
       actually contains a shared place, which on a real class of thirty
       is nearly always. */
    if (list.some(function (t) { return t.tied; })) {
      line += ' Place goes on level first, then how far into that level a ' +
              'student is. Two students who match on both share a place, ' +
              'shown with =.';
    }

    /* What the tilde means, and only when one is on screen. */
    if (est && !real) {
      line += ' Levels marked Lv~ are worked out from work recorded in this ' +
              'class, so they read lower than the level each student sees on ' +
              'their own device. The real number replaces them once devices sync.';
    } else if (est && real) {
      /* The one state where the order is not comparing like with like. */
      line += ' ' + est + ' of these levels are still worked out from class work ' +
              'only (Lv~) and read lower than the real thing, so the order will ' +
              'shift as the rest sync.';
    } else if (real) {
      /* Worth saying once everything is real: this is the student's own
         level, the same number they see on their own screen, and not
         anything this table worked out. */
      line += ' These are each student\'s own levels, synced from their devices.';
    }

    /* Where the GeoLive figure came from, said plainly. Switching the
       live quiz off stops new games; it does not erase what students
       already earned, and an all-time table should not quietly drop a
       term's work because a teacher turned the feature off last week.
       But a number that keeps counting after its feature is off is
       exactly the kind that should say so. */
    if (live.some(function (t) { return t.games > 0; })) {
      var C = global.GeoLiveCloud;
      var off = false;
      try { off = !!(C && typeof C.isEnabled === 'function' && !C.isEnabled()); } catch (e) {}
      line += off
        ? ' The GeoLive column still counts games this class finished before ' +
          'the live quiz was switched off.'
        : ' The GeoLive column counts every live game this class has finished.';
    }

    /* A total a teacher cannot account for is the thing this caption
       exists to stop, and an excluded game is that problem one layer
       down: the class's points will not match the games they watched
       happen. So say it, and say how many. */
    var dropped = list.reduce(function (n, t) { return n + (t.excluded || 0); }, 0);
    if (dropped > 0) {
      line += ' ' + plural(dropped, 'game', 'games') + ' played in god mode ' +
              (dropped === 1 ? 'is' : 'are') + ' left out, so these totals will ' +
              'not match every game you watched.';
    }

    /* Marks the teacher typed carry a percentage and no question count,
       so the count is taken from what the same assignment actually ran
       to for everyone else. Worth saying, because it is the one number
       on the table that is inferred rather than recorded. */
    if (live.some(function (t) { return t.estimated > 0; })) {
      line += ' Marks entered by hand are counted against the length the ' +
              'same assignment ran to for the rest of the class.';
    }

    return '<div class="t-sm t-muted" style="margin-top:10px">' + line + '</div>';
  }

  function paint(el, list) {
    var showLive = list.some(function (t) { return t.games > 0; });
    el.innerHTML = table(list, showLive) + caption(list);
  }

  /* Three kinds of nothing, and a teacher should be able to tell them
     apart at a glance. Two of them are the first thing anybody sees when
     they switch this on for a real class, so neither may look like a
     board that failed to load.

     A table of names with a dash in every column is the worst of both:
     it looks like data that did not arrive. Better to say plainly that
     there is nothing yet and that the class is there. */
  function draw(el, c, opts) {
    var list = ranked(order(tally(c, opts)));

    if (!list.length) {
      el.innerHTML = empty('Nobody in this class yet',
        'Students appear here once they join with the class code.');
      return list;
    }

    if (!list.some(function (t) { return t.started; })) {
      el.innerHTML = empty('Nothing to rank yet',
        plural(list.length, 'student is', 'students are') + ' in this class. ' +
        'Levels and scores appear here as soon as they answer questions, ' +
        'in a quiz or in a live game.');
      return list;
    }

    paint(el, list);
    return list;
  }

  /* ============================= mount ============================= */

  function mount(el, options) {
    if (typeof el === 'string') el = document.getElementById(el);
    if (!el) return null;

    var opts = options || {};

    /* Off means off. No table, no promise, no network call. A teacher
       who switched this off should not be able to find it in the
       console or in the request log. oy-09 owns whether the tab exists
       at all; this is the second lock on the same door. */
    if (opts.enabled === false) {
      el.innerHTML = '';
      return null;
    }

    var classId = opts.classId || '';
    var c = opts.classroom || cls();

    if (!c) {
      el.innerHTML = empty('No class loaded yet');
      return null;
    }
    /* Never draw another class's numbers. */
    if (classId && c.cloudId && c.cloudId !== classId) {
      el.innerHTML = empty('This leaderboard belongs to another class',
        'Reopen it from the class you meant.');
      return null;
    }

    /* Draw from what is already here, then ask GeoLive for the rest.
       Shared so refresh() does the same thing mount() does, rather than
       only redrawing: a refresh that cleared the memo without re-asking
       would look like it worked and change nothing. */
    function render() {
      var live = null;
      try {
        draw(el, c, opts);
        live = liveTotals(classId || c.cloudId || '', opts);
      } catch (e) {
        /* The page must not go down over a leaderboard, but a fault in
           this file is a fault and should not read as a quiet empty
           class. */
        if (global.console && console.warn) console.warn('ClassLeaderboard:', e);
        el.innerHTML = empty('The leaderboard could not be worked out',
          'Nothing else on this page is affected.');
        return false;
      }

      if (live) {
        live.then(function (rows) {
          if (!rows || !el.isConnected) return;
          try {
            var list = tally(c, opts);
            if (!applyLive(list, rows)) return;
            paint(el, ranked(order(list)));
          } catch (e) {
            if (global.console && console.warn) console.warn('ClassLeaderboard (GeoLive):', e);
            /* the quiz-only table stays up */
          }
        }, function () { /* same */ });
      }
      return true;
    }

    if (!render()) return null;

    return {
      refresh: function () {
        /* An explicit refresh always re-asks. Only the automatic redraws
           a teacher screen does on its own are throttled. */
        forget(classId || c.cloudId || '');
        return render();
      }
    };
  }

  global.ClassLeaderboard = {
    mount: mount,
    /* exported so the testing sessions can reach the maths without a DOM */
    tally: tally, order: order, ranked: ranked, accuracy: accuracy,
    ownerKey: ownerKey, applyLive: applyLive, levelFrom: levelFrom
  };
})(window);
