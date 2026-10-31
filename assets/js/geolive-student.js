/* ------------------------------------------------------------------
   LearnGeo — GeoLive, the student's screen.

   One phone, one thumb, and a room full of people racing you. The
   whole screen is built for that: four targets big enough to hit
   without looking twice, an answer that locks the moment it is
   touched, and never a number on screen that the server has not
   already agreed to.

   Three things happen in every real game, and each one is handled on
   purpose rather than by luck:

     joining late      the screen draws whatever the session is doing
                       right now. It never assumes question one, and a
                       student who walks in mid question gets the timer
                       wound forward to where it actually is, not
                       restarted at full.

     a sleeping phone  the drain is a CSS animation started at a
                       negative delay worked out from the wall clock,
                       so a phone that slept through half a question
                       wakes showing the right amount left. Waking also
                       re-subscribes, because a socket that died while
                       the screen was dark tells you nothing, and a tap
                       that arrives after time is up is stopped here
                       rather than sent off to be refused.

     a double tap      the first tap locks the question before anything
                       async happens, so the second tap never sends.
                       The rules keep the first answer and so does this
                       screen.

   Students never score themselves. This file writes a choice and a
   time and nothing else. A call that could not be counted comes back
   null, which is not a zero and is never drawn as one.

   The rules live in GeoLive, the network lives in GeoLiveCloud, the
   look lives in geolive.css, and this file talks to Supabase never.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';

  var W = global.WW || {};
  var esc = W.escapeHtml || function (s) { return String(s == null ? '' : s); };

  var FALLBACK_LIMIT = 20000;     /* only when the session names no limit at all */
  var LOW_AT = 5000;              /* when the timer turns red */
  var KEYS = ['A', 'B', 'C', 'D'];
  var SLOTS = ['a', 'b', 'c', 'd'];
  var MEDALS = ['🥇', '🥈', '🥉'];
  var RANKS = ['is-first', 'is-second', 'is-third'];

  /* ===================== reading the session ======================= */
  /* A snapshot may arrive shaped like the rules module or shaped like
     the database row, so every read below accepts both spellings and
     copes with the field being absent.                                */

  function num(v, fallback) {
    v = Number(v);
    return isFinite(v) ? v : fallback;
  }

  function first(obj, names, fallback) {
    for (var i = 0; i < names.length; i++) {
      var v = obj && obj[names[i]];
      if (v !== undefined && v !== null && v !== '') return v;
    }
    return fallback;
  }

  function indexOf(s) {
    return num(first(s, ['index', 'question_index', 'questionIndex'], 0), 0);
  }

  function statusOf(s) { return String((s && s.status) || 'lobby'); }

  function limitOf(s) {
    return num(first(s, ['limitMs', 'time_limit_ms', 'timeLimitMs', 'limit_ms', 'timeLimit', 'time_limit'], FALLBACK_LIMIT), FALLBACK_LIMIT);
  }

  function stamp(v) {
    if (!v) return 0;
    if (typeof v === 'number') return v;
    var t = Date.parse(v);
    return isFinite(t) ? t : 0;
  }

  /* The server's clock, corrected for a phone whose time is wrong. oy-03
     samples the offset at join; without it this is just the device. */
  function serverNow() {
    var C = global.GeoLiveCloud;
    if (C && typeof C.serverNow === 'function') {
      try { return C.serverNow(); } catch (e) { /* fall back to the device */ }
    }
    return Date.now();
  }

  /* oy-03 says whether it has seen a server timestamp yet. Until it has,
     msLeft and asked_at are only as good as this phone's clock, and a
     device 90 seconds out reads a 20 second question as a hundred. So
     anything derived from the server clock is refused until the offset
     is real. What we timed ourselves is still fine, because that is a
     local subtraction either way. */
  function clockTrusted() {
    var C = global.GeoLiveCloud;
    if (!C || typeof C.clockSource !== 'string') return true;
    return C.clockSource !== 'device';
  }

  /* When the current question opened, expressed on THIS device's clock so
     everything downstream is a local subtraction.

     msLeft is what oy-03 asks screens to prefer: it is worked out once
     against the corrected clock, and pairing it with the snapshot's own
     `at` keeps the whole sum device-local, so a wrong phone clock cannot
     get in. asked_at is the fallback, measured against serverNow rather
     than Date.now, because a device a few seconds out is a quarter of a
     twenty second question. There is no updated_at proxy any more: the
     database stamps asked_at with a trigger, so it is the real thing. */
  function openedAt(s) {
    if (!s || !clockTrusted()) return 0;
    var limit = limitOf(s);
    var left = s.msLeft;
    if (typeof left === 'number' && isFinite(left)) {
      return num(s.at, Date.now()) - (limit - left);
    }
    var opened = stamp(first(s, ['askedAt', 'asked_at', 'startedAt', 'started_at'], 0));
    if (opened) return Date.now() - (serverNow() - opened);
    return 0;
  }

  function questionOf(s) {
    if (!s) return null;
    if (global.GeoLive && typeof global.GeoLive.current === 'function') {
      try {
        var q = global.GeoLive.current(s);
        if (q) return q;
      } catch (e) { /* fall through to the plain read */ }
    }
    var list = s.questions || [];
    return list[indexOf(s)] || null;
  }

  function standingsOf(s) {
    if (!s) return [];
    if (global.GeoLive && typeof global.GeoLive.standings === 'function') {
      try {
        var list = global.GeoLive.standings(s);
        if (list && list.length) return list;
      } catch (e) { /* fall through */ }
    }
    return s.standings || [];
  }

  /* Whether the totals in this snapshot are being kept up to date at all.
     GeoLive.standings reads players[].score, and nothing writes that column
     until the game ends, so with a real mid-game snapshot every player reads
     0 and everyone is joint first. If any answer has scored and no player's
     total shows it, the totals are not maintained and a place worked out
     from them would be fiction. Both shapes are safe here: an oy-02 session
     keeps answers as objects per question, so nothing looks scored and this
     returns false. */
  function totalsStale(s) {
    var rows = (s && s.answers) || [];
    var scored = false, i;
    for (i = 0; i < rows.length; i++) {
      if (rows[i] && num(rows[i].points, 0) > 0) { scored = true; break; }
    }
    if (!scored) return false;
    var players = (s && s.players) || [];
    for (i = 0; i < players.length; i++) {
      if (num(players[i].score, 0) > 0) return false;
    }
    return true;
  }

  /* Asking GeoLive rather than reading session.answers, because that
     shape belongs to geolive.js and only it should know about it. */
  function answeredCount(s) {
    /* A room snapshot carries answers as a flat list of database rows, not
       as GeoLive's one object per question. Handed that, GeoLive.answered
       counts the COLUMNS of one row, six or seven, which passed the seat
       check below in any class of seven or more and was shown as "7 of 24
       have answered" whatever had happened. Count the rows instead: one
       per player on this question. */
    var rows = s && s.answers;
    if (rows && rows.length && rows[0] && rows[0].player_id !== undefined) {
      var who = {}, n = 0, at = indexOf(s);
      for (var r = 0; r < rows.length; r++) {
        var row = rows[r];
        if (!row || num(row.question_index, -1) !== at || who[row.player_id]) continue;
        who[row.player_id] = true; n++;
      }
      return n;
    }
    if (!s || !global.GeoLive || typeof global.GeoLive.answered !== 'function') return null;
    try {
      var v = global.GeoLive.answered(s);
      if (v && typeof v.length === 'number') v = v.length;
      if (typeof v === 'number' && isFinite(v) && v >= 0) {
        /* A count of who has answered cannot exceed the people playing.
           Handed the wrong session shape this returns the number of columns
           in one answer row, which is a small plausible number and the worst
           kind of wrong. Better to say nothing than to say six of twelve. */
        var seats = playerCount(s);
        if (seats && v > seats) return null;
        return v;
      }
    } catch (e) { /* not worth breaking a screen over a count */ }
    return null;
  }

  /* Who has actually turned up, which is joined_at being set. Deliberately
     never joinedAt: oy-02 uses that name for the question index a player
     arrived at, where 0 means "here from the start". The two are one letter
     apart, both go falsy, and they mean opposite things. Returns null when
     the snapshot carries no joined_at at all, so the wording can fall back
     rather than claim everyone is missing. */
  function arrivedCount(s) {
    var list = (s && (s.players || s.live_players)) || [];
    if (!list.length) return null;
    var known = false, here = 0;
    for (var i = 0; i < list.length; i++) {
      if (Object.prototype.hasOwnProperty.call(list[i], 'joined_at')) {
        known = true;
        if (list[i].joined_at) here++;
      }
    }
    return known ? here : null;
  }

  function playerCount(s) {
    if (!s) return 0;
    var p = s.players || s.live_players;
    if (p && p.length) return p.length;
    return standingsOf(s).length;
  }

  function totalOf(s) {
    if (!s) return 0;
    return num(first(s, ['total'], (s.questions || []).length), 0);
  }

  /* ========================== small helpers ======================== */

  function ordinal(n) {
    var t = n % 100;
    if (t >= 11 && t <= 13) return n + 'th';
    return n + (['th', 'st', 'nd', 'rd'][n % 10] || 'th');
  }

  /* A game needs an account now. live_join requires one and the answer
     policy matches on auth.uid, so there is no guest path to offer. */
  function signedIn() {
    return !!(global.Cloud && global.Cloud.signedIn);
  }

  function memberId() {
    var u = global.Cloud && global.Cloud.user;
    return (u && u.id) || null;
  }

  function knownName() {
    var n = W.state && W.state.profile && W.state.profile.displayName;
    return (!n || n === 'Explorer') ? '' : n;
  }

  /* God mode goes through godmode.js's own surface rather than reading its
     flag and repeating its logic here. liveReveal says what to mark,
     liveChoice says what to send, and both tell it a live game is happening
     so its banner stops guessing from the DOM.

     Absent GodMode, or an older one without these, means off: no marker and
     the tap goes through untouched, which is exactly how this screen behaved
     before god mode existed. */
  function godAnswer(q) {
    var G = global.GodMode;
    if (G && typeof G.liveReveal === 'function') {
      try { return G.liveReveal(q); } catch (e) { /* off */ }
    }
    return null;
  }

  function godChoice(q, picked) {
    var G = global.GodMode;
    if (G && typeof G.liveChoice === 'function') {
      try { return G.liveChoice(q, picked); } catch (e) { /* send the tap */ }
    }
    return picked;
  }

  /* The banner's only other way of knowing was whether #cl-geolive existed
     when god mode was switched on. Turn god mode on first and then walk into
     GeoLive, which is the natural order, and that check has already run: the
     banner says nothing is recorded while answers are being recorded. This
     is the half that says so at mount, and says the opposite at unmount, so
     it cannot lie in either direction. */
  function godLive(v) {
    var G = global.GodMode;
    if (G && typeof G.setLive === 'function') {
      try { G.setLive(!!v); } catch (e) { /* nothing to tell */ }
    }
  }

  /* A class tag beside a name on the podium. WornTag renders nothing for a
     row that carries no tag, which is every row until the column exists, so
     this costs nothing and lights up on its own when it does. Deliberately
     WornTag and not ClassTag: ClassTag is the live file that owns the tag
     markup, and this is the student's side of it. */
  function tagMark(subject) {
    var T = global.WornTag;
    if (T && typeof T.mark === 'function') {
      try { return T.mark(subject); } catch (e) { /* no tag */ }
    }
    return '';
  }

  function cloudFn(name) {
    var C = global.GeoLiveCloud;
    return (C && typeof C[name] === 'function') ? C[name].bind(C) : null;
  }

  /* The shape each answer carries, and the picture a map question is
     about. Both belong to GeoLiveQuestions so the projector draws the same
     ones; absent, the tile falls back to its letter and the question to
     its sentence, which is how this screen looked before either existed. */
  function glyphHtml(i) {
    var Q = global.GeoLiveQuestions;
    if (Q && typeof Q.glyph === 'function') {
      try { return Q.glyph(i); } catch (e) { /* the letter will do */ }
    }
    return KEYS[i] || '';
  }

  function pictureHtml(q) {
    var Q = global.GeoLiveQuestions;
    if (!q || !Q || typeof Q.picture !== 'function') return '';
    try { return Q.picture(q); } catch (e) { return ''; }
  }

  function icon(name) {
    return (W.Icons && W.Icons[name]) || '';
  }

  function initials(name) {
    var bits = String(name || '').trim().split(/\s+/);
    return ((bits[0] || '')[0] || '?').toUpperCase() +
           (bits.length > 1 ? (bits[bits.length - 1][0] || '').toUpperCase() : '');
  }

  /* A tap you can feel. Phones that cannot buzz ignore it, and so does
     anything that throws: a missing buzz is never worth an error. */
  function buzz(pattern) {
    try {
      var nav = global.navigator;
      /* Chrome refuses, and logs an error, until the page has been touched */
      if (nav && nav.userActivation && !nav.userActivation.hasBeenActive) return;
      if (nav && typeof nav.vibrate === 'function') nav.vibrate(pattern);
    } catch (e) { /* no motor, no matter */ }
  }

  function friendly(e) {
    var m = e && (e.message || e.msg || e.error_description);
    if (!m) return 'Something went wrong. Try again in a moment.';
    if (/network|fetch|offline/i.test(m)) return 'No connection. Check the wifi and try again.';
    return String(m).slice(0, 140);
  }

  /* What this phone knows about the game it is in, kept outside any one
     screen. The class page redraws itself whenever the class syncs, which
     throws this screen away and mounts a new one, and that used to drop a
     student back to "type the code" in the middle of a question. A new
     screen for the same class picks up exactly where the last one was. */
  var memory = null;
  var KEEP = ['sessionId', 'playerId', 'code', 'name', 'index', 'answeredIndex', 'choice',
              'result', 'accepted', 'scoreBefore', 'sawAsking', 'askedAt', 'clockKnown', 'limit'];

  function enrolledClass() {
    var e = W.state && W.state.enrolled;
    return (e && e.classId) || '';
  }

  /* How often a waiting phone asks whether the game has started. Gentle,
     because thirty phones are asking at once. */
  var SEEK_MS = 5000;

  /* ============================== mount ============================ */

  function mount(host, opts) {
    if (!host) return null;
    opts = opts || {};

    var S = {
      host: host,
      code: String(opts.code || '').toUpperCase(),
      name: knownName(),
      sessionId: null,
      playerId: null,
      session: null,
      unwatch: null,
      seen: 0,
      index: -1,
      answeredIndex: -1,      /* the question we locked, never a bare flag */
      choice: null,
      result: null,           /* only ever what came back from the network */
      askedAt: 0,
      scoreBefore: null,      /* our total as this question opened */
      sawAsking: -1,          /* the question we watched go live, so a late joiner is not told they missed one */
      accepted: null,         /* true in, false refused, null not heard yet */
      clockKnown: false,
      limit: FALLBACK_LIMIT,
      classId: String(opts.classId || enrolledClass() || ''),
      phase: signedIn() ? 'finding' : 'signin',
      seekTimer: null,
      note: '',
      busy: false,
      dead: false,
      lowTimer: null,
      fresh: '',              /* the phase and question last drawn, so a redraw does not replay its entrance */
      screen: ''              /* the same, with answering counted as part of asking */
    };

    /* ------------------------------ reads ------------------------- */

    function phaseFor(s) {
      var st = statusOf(s);
      if (st === 'ended') return 'ended';
      if (st === 'reveal') return 'reveal';
      if (st === 'asking') return S.answeredIndex === S.index ? 'locked' : 'asking';
      return 'lobby';
    }

    function question() { return questionOf(S.session); }
    function elapsed() { return S.askedAt ? Math.max(0, Date.now() - S.askedAt) : 0; }
    function leftMs() { return Math.max(0, S.limit - elapsed()); }
    function timeUp() { return S.clockKnown && leftMs() <= 0; }

    function myPlace() {
      if (totalsStale(S.session)) return null;
      var list = standingsOf(S.session);
      if (!list.length || !S.playerId) return null;
      var me = -1, i;
      for (i = 0; i < list.length; i++) {
        if (String(list[i].id) === String(S.playerId)) { me = i; break; }
      }
      if (me < 0) return null;
      var mine = num(list[me].score, 0);

      /* Position in the standings, which is the number the teacher's board
         shows for the same row. A competition rank, where equal points share
         a place, would tell a student they are second while the projector at
         the front of the room has them third. The engine's order is a total
         order and never reshuffles, so this is the one to trust. */
      var place = me + 1;

      /* Who they are dead level with, so the screen can say why they are
         where they are instead of leaving it to be guessed at. Nearest
         neighbour on the same points: the one above if there is one. */
      var level = null;
      if (me > 0 && num(list[me - 1].score, 0) === mine) level = list[me - 1].name;
      else if (me + 1 < list.length && num(list[me + 1].score, 0) === mine) level = list[me + 1].name;

      return { place: place, of: list.length, score: mine,
               streak: num(list[me].streak, 0), levelWith: level };
    }

    function myScoreNow() {
      var p = myPlace();
      return p ? p.score : null;
    }

    /* --------------------------- the timer ------------------------ */
    /* The drain is oy-06's CSS animation, not a JS loop. Starting it at
       a negative delay winds it forward to where the question actually
       is, which is what makes a late joiner and a woken phone both
       correct without a single tick being counted here. */

    function timerHtml() {
      if (!S.clockKnown) return '';
      var secs = Math.max(0, S.limit) / 1000;
      var gone = Math.min(elapsed(), S.limit) / 1000;
      var low = leftMs() <= LOW_AT ? ' is-low' : '';
      return '<div class="gl-timer' + low + '">' +
        '<span class="gl-timer__bar is-running" style="--gl-secs:' + secs + 's;animation-delay:-' + gone.toFixed(2) + 's"></span>' +
      '</div>';
    }

    function armLow() {
      clearLow();
      if (!S.clockKnown) return;
      var untilLow = leftMs() - LOW_AT;
      if (untilLow <= 0) return;      /* already painted low by timerHtml */
      S.lowTimer = setTimeout(function () {
        if (S.dead) return;
        var bar = S.host.querySelector('.gl-timer');
        if (bar && bar.classList) bar.classList.add('is-low');
      }, untilLow);
    }

    function clearLow() {
      if (S.lowTimer) { clearTimeout(S.lowTimer); S.lowTimer = null; }
    }

    /* --------------------------- the watch ------------------------ */

    function stopWatch() {
      if (typeof S.unwatch === 'function') {
        try { S.unwatch(); } catch (e) { /* already gone */ }
      }
      S.unwatch = null;
    }

    function watch() {
      stopWatch();
      var fn = cloudFn('watch');
      if (!fn) { S.note = 'Live games are not switched on yet.'; render(); return; }
      var out;
      try { out = fn(S.sessionId, onSnapshot); }
      catch (e) { S.note = friendly(e); render(); return; }

      if (out && typeof out.then === 'function') {
        out.then(function (un) {
          if (S.dead) { if (typeof un === 'function') { try { un(); } catch (e) {} } return; }
          S.unwatch = un;
        })['catch'](function (e) {
          if (S.dead) return;
          S.note = friendly(e);
          render();
        });
      } else {
        S.unwatch = out;
      }
    }

    /* oy-03 sends onChange(null) to mean switched off, or not set up.
       Ignoring it leaves a student sitting on a question that is never
       coming back, tapping into nothing. */
    function onStopped() {
      if (S.dead) return;
      stopWatch();
      clearLow();
      S.phase = 'off';
      render();
    }

    function onSnapshot(s) {
      if (S.dead) return;
      if (!s) { onStopped(); return; }
      var firstEver = S.seen === 0;
      S.seen++;
      S.session = s;
      S.limit = limitOf(s);   /* every snapshot, so a teacher changing it takes effect */

      var i = indexOf(s);
      var moved = i !== S.index;
      if (moved) {
        /* A new question, or we have walked in on one. Either way
           nothing we held about the last question still applies. */
        S.index = i;
        S.choice = null;
        S.result = null;
        S.answeredIndex = -1;
        S.note = '';
        S.accepted = null;
        S.scoreBefore = myScoreNow();
      }

      /* Timing comes off EVERY snapshot that carries it, not only the ones
         that change question. oy-03 re-sends msLeft whenever it wakes the
         screen and it is the corrected number, so reading it only on a
         change of index threw away a correction for the question already
         on screen and let the countdown drift from the one the scoring
         uses. */
      var started = openedAt(s);
      if (started) {
        S.askedAt = started;
        S.clockKnown = true;
      } else if (moved) {
        /* No server time. If we watched this question flip our own clock
           is right. If it is the first thing we have seen we joined mid
           question and have no idea, so no countdown. */
        S.askedAt = Date.now();
        S.clockKnown = !firstEver;
      }

      /* A late joiner has no business being told they missed a question
         they were not there for. This is the only way to tell the two
         apart: present and silent, or not yet in the room. */
      if (statusOf(s) === 'asking') S.sawAsking = S.index;

      S.phase = phaseFor(s);
      render();
    }

    function onWake() {
      if (S.dead || document.hidden) return;
      if (S.phase === 'signin' && signedIn()) { S.phase = 'finding'; render(); seek(); return; }
      if (S.phase === 'waiting' || S.phase === 'finding') { seek(); return; }
      /* Re-render so the drain is recomputed from the wall clock, and
         take a fresh subscription rather than trust one that was alive
         when the screen went dark. */
      if (S.phase === 'asking' || S.phase === 'locked') render();
      if (S.sessionId) watch();
    }

    /* --------------------------- answering ------------------------ */

    function tap(slot) {
      if (S.phase !== 'asking') return;
      if (S.answeredIndex === S.index) return;   /* the first tap already took it */

      var q = question();
      if (!q) return;
      var choice = (q.options || [])[slot];
      if (choice == null) return;

      /* A phone that woke up late would otherwise send an answer the
         rules will refuse. Stop it here, where we can say why. */
      if (timeUp()) {
        S.note = 'Time was up on that one. Hold on for the next question.';
        render();
        return;
      }

      /* God mode rewrites the CHOICE, here, on this device, and nothing
         else. It never writes correct or points: a student's device is not
         allowed to grade itself and this does not become the exception. The
         real answer goes to the server and the teacher's grader marks a
         genuinely correct answer, so the standings the class sees stay
         honest about what was submitted.

         S.choice takes the rewritten value rather than the tap, so every
         state after this one, the lock, the reveal, the verdict, the points
         and the place, is consistent with what was actually sent. That is
         what keeps god mode out of the rest of this file. */
      choice = godChoice(q, choice);

      /* Lock first, send second. Nothing async sits between the tap and
         the lock, so a second tap has nothing left to do. */
      S.answeredIndex = S.index;
      S.choice = choice;
      S.accepted = null;
      S.phase = 'locked';
      buzz(14);
      var ms = elapsed();
      var mine = S.index;
      render();

      var fn = cloudFn('answer');
      if (!fn) return;   /* nothing to send to, but the lock still stands */

      Promise.resolve(fn(S.sessionId, S.playerId, mine, choice, ms)).then(function (r) {
        if (S.dead || S.index !== mine) return;   /* the game moved on while we waited */
        /* { accepted: true } means it is in and the host will score it
           later, which is the normal case. null means refused and there
           is nothing to wait for. Two different things, and now they
           arrive as two different values. */
        if (r && typeof r === 'object') {
          S.result = r;
          S.accepted = r.accepted !== false;
          /* first:false means they had already answered and this tap was
             not the one that counted. Show them the answer that was.
             The retry path can reach here: a send that looked like it
             failed may have landed, and then they tapped something else. */
          if (r.first === false && r.row && r.row.choice != null) S.choice = r.row.choice;
        } else {
          S.accepted = false;
        }
        render();
      })['catch'](function (e) {
        if (S.dead || S.index !== mine) return;
        /* It never left the phone, so there is no first answer to keep.
           Hand the question back rather than leave them staring at a
           lock that means nothing. */
        S.answeredIndex = -1;
        S.choice = null;
        S.phase = 'asking';
        S.note = 'That did not send. Tap your answer again.';
        render();
      });
    }

    function join() {
      if (!signedIn()) { S.phase = 'signin'; render(); return; }

      var fields = S.host.querySelectorAll('.gl-join__field');
      var codeEl = fields[0], nameEl = fields[1];
      var code = String((codeEl && codeEl.value) || '').trim().toUpperCase();
      var name = String((nameEl && nameEl.value) || '').trim();

      if (code.length < 4) { S.note = 'That code looks too short. Check the board.'; render(); return; }
      if (!name) { S.note = 'Put your name in so the class knows who you are.'; render(); return; }
      joinWith(code, name);
    }

    function joinWith(code, name) {
      stopSeek();
      S.code = code;
      S.name = name;
      S.note = '';
      S.busy = true;
      render();

      var fn = cloudFn('join');
      if (!fn) { S.busy = false; S.note = 'Live games are not switched on yet.'; render(); return; }

      Promise.resolve(fn(code, memberId(), name)).then(function (r) {
        if (S.dead) return;
        S.busy = false;
        if (!r || !r.sessionId) {
          S.note = 'No game with that code. It may have already finished.';
          render();
          return;
        }
        if (r.sessionId !== S.sessionId) forgetGame();
        S.sessionId = r.sessionId;
        S.playerId = r.playerId;
        S.phase = 'lobby';
        render();
        watch();
        seekLater(SEEK_MS * 2);   /* keep an eye out for a newer game */
      })['catch'](function (e) {
        if (S.dead) return;
        S.busy = false;
        S.note = friendly(e);
        if (S.phase !== 'join') S.phase = 'join';
        render();
      });
    }

    /* Everything about the previous game, gone, so a new one starts clean. */
    function forgetGame() {
      stopWatch();
      S.session = null; S.seen = 0; S.index = -1; S.answeredIndex = -1;
      S.choice = null; S.result = null; S.accepted = null; S.scoreBefore = null;
      S.sawAsking = -1; S.clockKnown = false; S.askedAt = 0; S.fresh = ''; S.screen = '';
    }

    /* ------------------------- finding the game -------------------- */
    /* The teacher's room already has a seat for this student, so the
       phone can find it by itself. Nobody types a code unless they were
       not on the teacher's list, and nobody types their name if the app
       already knows it.

       While waiting, and in the lobby or at the end of a game, it keeps
       asking every few seconds, so a game started later, or a second game
       after this one, turns up without anyone touching the phone. */
    function seek() {
      stopSeek();
      if (S.dead || !signedIn()) return;
      var fn = cloudFn('findOpen');
      if (!fn) {
        if (S.phase === 'finding') { S.phase = 'join'; render(); }
        return;
      }
      Promise.resolve(fn(S.classId)).then(function (g) {
        if (S.dead) return;
        if (g && g.code && g.sessionId !== S.sessionId) {
          var name = S.name || knownName();
          if (name) { joinWith(g.code, name); return; }
          /* found it, but we do not know what to call them: one field */
          S.code = g.code;
          S.phase = 'join';
          S.note = '';
          render();
          return;
        }
        if (!g && S.phase === 'finding') { S.phase = 'waiting'; render(); }
        seekLater();
      }, function () { if (!S.dead) seekLater(); });
    }

    function seekLater(ms) {
      stopSeek();
      if (S.dead) return;
      /* only where a new game is worth looking for: never mid-question */
      if (!/^(waiting|finding|lobby|ended|off)$/.test(S.phase)) {
        S.seekTimer = setTimeout(function () { seekLater(ms); }, ms || SEEK_MS);
        return;
      }
      S.seekTimer = setTimeout(function () {
        if (document.hidden) { seekLater(ms); return; }
        seek();
      }, ms || SEEK_MS);
    }

    function stopSeek() {
      if (S.seekTimer) { clearTimeout(S.seekTimer); S.seekTimer = null; }
    }

    function remember() {
      if (!S.sessionId) return;
      memory = { classId: S.classId };
      KEEP.forEach(function (k) { memory[k] = S[k]; });
    }

    /* ============================ drawing =========================== */
    /* Everything is a direct child of the container, because
       .gl--student is a flex column and .gl-targets takes the space
       that is left. A wrapper in between would break that.            */

    function targetsHtml(q, mode, picked) {
      var mine = picked === undefined ? S.choice : picked;
      /* asked once per render rather than per option, and only where it can
         show: liveReveal is null whenever god mode is off */
      var godAns = mode === 'open' ? godAnswer(q) : null;
      var list = (q && q.options) || [];
      var mini = mode === 'reveal' ? ' gl-targets--mini' : '';
      return '<div class="gl-targets' + mini + '">' + list.map(function (opt, i) {
        var cls = 'gl-target gl-target--' + (SLOTS[i] || 'a');
        var extra = '';
        var badge = '';
        if (mode === 'locked') {
          cls += String(opt) === String(mine) ? ' is-picked' : ' is-dimmed';
          cls += ' is-locked';
          extra = ' disabled';
        } else if (mode === 'reveal') {
          var right = q.answer != null && String(opt) === String(q.answer);
          var chosen = String(opt) === String(mine);
          if (right) { cls += ' is-right'; badge = icon('check'); }
          else if (chosen) { cls += ' is-wrong'; badge = icon('x'); }
          else cls += ' is-dimmed';
          if (chosen) cls += ' is-mine';
          cls += ' is-locked';
          extra = ' disabled';
        }
        /* God mode points at the answer before it is tapped. Deliberately a
           written word and not the reveal's colouring: in a test session
           "god mode is showing me the answer" and "the answer has been
           revealed" are one keystroke apart, and they must not look alike.
           Only while the question is open, because at the reveal the target
           already carries is-right and a second marker would be noise. */
        var mark = (mode === 'open' && godAns != null &&
                    String(opt) === String(godAns))
          ? '<span class="gl__eyebrow">god mode answer</span>'
          : '';
        return '<button type="button" class="' + cls + '" data-slot="' + i + '"' + extra +
            ' style="--gl-n:' + i + '"' +
            ' aria-label="' + esc((KEYS[i] || '') + ': ' + opt) +
              (mark ? ', the correct answer, shown by god mode' : '') + '">' +
            '<span class="gl-target__key">' + glyphHtml(i) + '</span>' +
            '<span class="gl-target__text">' + esc(opt) + '</span>' + mark +
            (badge ? '<span class="gl-target__badge" aria-hidden="true">' + badge + '</span>' : '') +
          '</button>';
      }).join('') + '</div>';
    }

    /* The strip across the top of a question: where we are in the game on
       the left, what this student has on the right. The score only ever
       comes from the standings, so it is absent rather than zero until the
       host has saved some. */
    function headHtml() {
      var total = totalOf(S.session);
      var count = total ? ('<b>' + (S.index + 1) + '</b>/' + total) : ('Q<b>' + (S.index + 1) + '</b>');
      var p = myPlace();
      var streak = p && p.streak > 1
        ? '<span class="gl-chip gl-chip--fire">' + icon('fire') + p.streak + '</span>'
        : '';
      return '<div class="gl__head">' +
          '<span class="gl-qcount">' + count + '</span>' +
          '<span class="gl__head-r">' + streak +
            (p ? '<span class="gl-chip gl-chip--score">' + p.score.toLocaleString() + '</span>' : '') +
            (S.clockKnown ? '' : '<span class="gl__eyebrow">Answer fast</span>') +
          '</span>' +
        '</div>' + timerHtml();
    }

    /* Everything that reaches here is something the student has to act on:
       a code that did not work, an answer that did not send, time gone.
       role="alert" was already right and the muted grey was fighting it, so
       it carries now. oy-06 shipped .gl-alert at 20:28, so the app.css
       error box that was standing in for it is gone again. */
    function noteHtml(role) {
      return S.note
        ? '<p class="gl-alert" role="' + (role || 'alert') + '">' + esc(S.note) + '</p>'
        : '';
    }

    /* Rank goes on as a class, not as a custom property. A custom property
       is a value and CSS cannot branch on a number, so nothing could ever
       have read one on a single line of text. oy-06 styles the top three
       places by name instead. */
    function rankClass(place) {
      return RANKS[place - 1] ? ' ' + RANKS[place - 1] : '';
    }

    function placeHtml(p) {
      if (!p) return '';
      return '<p class="gl-place' + rankClass(p.place) + '">' +
          '<span class="gl-place__n">' + ordinal(p.place) + '</span>' +
          '<span class="gl-place__of">of ' + p.of + '</span>' +
          '<span class="gl-place__pts">' + p.score.toLocaleString() + ' pts</span>' +
        '</p>' +
        (p.levelWith ? '<p class="gl__eyebrow gl__eyebrow--mid">Level with ' + esc(p.levelWith) + '</p>' : '');
    }

    function brandHtml() {
      return '<div class="gl-brand" aria-hidden="true">' +
          '<span class="gl-brand__globe">' + icon('globe') + '</span>' +
          '<span class="gl-brand__word">Geo<b>Live</b></span>' +
        '</div>';
    }

    function signinHtml() {
      return brandHtml() +
        '<div class="gl-join">' +
          '<h2 class="gl__title">Sign in to play</h2>' +
          '<p class="gl-verdict__note">A live game needs your account, so your' +
            ' points go on the class board under your name. Sign in and come back to' +
            ' the code.</p>' +
        '</div>';
    }

    function offHtml() {
      var C = global.GeoLiveCloud;
      var off = !!(C && typeof C.isEnabled === 'function' && !C.isEnabled());
      var started = S.seen > 0;
      var head, note;
      if (started) {
        head = 'The game has stopped';
        note = off
          ? 'Your teacher turned live quizzes off. Nothing you tap now will count.'
          : 'The game is no longer running. Nothing you tap now will count.';
      } else {
        head = off ? 'Live quizzes are off' : 'Live quizzes are not set up yet';
        note = off
          ? 'Your teacher has turned these off for your class.'
          : 'Ask your teacher to turn this on.';
      }
      return '<div class="gl-wait">' +
          '<span class="gl-wait__icon">' + icon('info') + '</span>' +
          '<h2 class="gl__title">' + esc(head) + '</h2>' +
          '<p class="gl-verdict__note">' + esc(note) + '</p>' +
        '</div>';
    }

    function findingHtml() {
      return brandHtml() +
        '<div class="gl-wait">' +
          '<div class="gl-radar" aria-hidden="true"><i></i><i></i><span>' + icon('globe') + '</span></div>' +
          '<h2 class="gl__title">Looking for your class\u2019s game\u2026</h2>' +
        '</div>';
    }

    /* Nothing to join yet. This screen is the whole instruction: stay
       here, and the game arrives. The code is for anyone the teacher's
       list missed, so it is offered, small, rather than demanded. */
    function waitingHtml() {
      return brandHtml() +
        '<div class="gl-wait gl-wait--idle">' +
          '<div class="gl-radar" aria-hidden="true"><i></i><i></i><span>' + icon('globe') + '</span></div>' +
          '<h2 class="gl__title">No live game yet</h2>' +
          '<p class="gl-verdict__note">Keep this open. When your teacher starts one, it will open here by itself.</p>' +
          '<button type="button" class="gl-textbtn" data-gl-code>I have a game code</button>' +
          noteHtml() +
        '</div>';
    }

    function joinHtml() {
      var found = !!S.code && !S.note;
      return brandHtml() +
        '<div class="gl-join">' +
          (found
            ? '<h2 class="gl__title">Your teacher\u2019s game is ready</h2>' +
              '<p class="gl-verdict__note">Just tell the class who you are.</p>'
            : '') +
          /* found for them: the code is known, so it is not asked for */
          (found
            ? '<input class="gl-join__field" type="hidden" value="' + esc(S.code) + '">'
            : '<label class="gl-join__label">Game code<span>on the board</span></label>' +
              '<input class="gl-join__field gl-join__field--code" type="text" value="' + esc(S.code) + '" ' +
                'aria-label="Game code" autocomplete="one-time-code" autocapitalize="characters" ' +
                'autocorrect="off" spellcheck="false" maxlength="8" enterkeyhint="next" placeholder="······">') +
          '<label class="gl-join__label">Your name</label>' +
          '<input class="gl-join__field gl-join__field--name" type="text" value="' + esc(S.name) + '" ' +
            'aria-label="Your name" autocomplete="nickname" maxlength="20" enterkeyhint="go" ' +
            'placeholder="What the class calls you">' +
          '<button type="button" class="btn btn--accent btn--lg btn--block gl-go" data-gl-go' +
            (S.busy ? ' disabled' : '') + '>' + (S.busy ? 'Joining…' : 'Join the game') + '</button>' +
          noteHtml() +
        '</div>';
    }

    function lobbyHtml() {
      var n = playerCount(S.session);
      var here = arrivedCount(S.session);
      return '<div class="gl-wait gl-wait--lobby">' +
        '<div class="gl-me" aria-hidden="true"><span class="gl-me__ring"></span><span class="gl-me__ring"></span>' +
          '<span class="gl-me__av">' + esc(initials(S.name)) + '</span></div>' +
        '<h2 class="gl__title">You’re in, ' + esc(S.name || 'explorer') + '!</h2>' +
        '<p class="gl-verdict__note">Look up at the board. It starts when your teacher says go.</p>' +
        /* joined_at is nullable now and live_join fills it, so "here" is a
           real thing to say. Falls back to the seated wording only when a
           snapshot carries no joined_at at all. */
        (here != null
          ? '<p class="gl-chip gl-chip--live"><i></i>' + here + (here === 1 ? ' player' : ' players') + ' here</p>'
          : (n ? '<p class="gl-chip">Set up for ' + n + (n === 1 ? ' player' : ' players') + '</p>' : '')) +
        '<div class="gl-tips">' +
          '<p><b>Be quick.</b> A right answer is worth 600, and up to 400 more for speed.</p>' +
          '<p><b>Keep it going.</b> Answers in a row build a streak.</p>' +
        '</div>' +
        noteHtml() +
      '</div>';
    }

    function askingHtml() {
      var q = question();
      if (!q) return lobbyHtml();
      return headHtml() +
        '<p class="gl-prompt">' + esc(q.prompt) + '</p>' +
        pictureHtml(q) +
        targetsHtml(q, 'open') +
        noteHtml();
    }

    function lockedHtml() {
      var q = question();
      if (!q) return lobbyHtml();
      var done = answeredCount(S.session);
      var all = playerCount(S.session);
      var head, sub;
      if (S.accepted === false) { head = 'That one did not count'; sub = 'Hold on for the next question.'; }
      else {
        head = 'Locked in';
        sub = (done != null && all) ? done + ' of ' + all + ' have answered' : 'Waiting for the rest of the class';
      }
      return headHtml() +
        '<p class="gl-prompt">' + esc(q.prompt) + '</p>' +
        pictureHtml(q) +
        targetsHtml(q, 'locked') +
        '<div class="gl-locked" role="status">' +
          '<span class="gl-locked__spin" aria-hidden="true"></span>' +
          '<span><b>' + esc(head) + '</b><small>' + esc(sub) + '</small></span>' +
        '</div>';
    }

    function revealHtml() {
      var q = question() || {};
      var r = S.result;
      /* A refused answer is not ours to have a verdict about. Treat it as
         nothing sent, so the screen never says "Right" about a tap that
         was never counted. */
      var mine = S.accepted === false ? null : S.choice;
      var right = null;

      var row = (r && r.row) || null;

      if (S.accepted !== false) {
        if (r && typeof r.correct === 'boolean') right = r.correct;
        else if (row && typeof row.correct === 'boolean') right = row.correct;
        else if (q.answer != null && mine != null) right = String(q.answer) === String(mine);
      }

      /* Joined while an answer was already on screen. They did not miss
         this question, they were not in the room for it, and they play the
         next one normally. */
      var walkedIn = mine == null && S.sawAsking !== S.index;

      var head, mod, glyph;
      if (S.accepted === false) { head = 'That one did not count'; mod = ''; glyph = icon('info'); }
      else if (walkedIn) { head = 'You are in'; mod = ''; glyph = icon('users'); }
      else if (mine == null) { head = 'Too slow!'; mod = ' gl-verdict--late'; glyph = icon('clock'); }
      else if (right === true) { head = pick(RIGHT_WORDS); mod = ' gl-verdict--right'; glyph = icon('check'); }
      else if (right === false) { head = pick(WRONG_WORDS); mod = ' gl-verdict--wrong'; glyph = icon('x'); }
      else { head = 'Answer locked in'; mod = ''; glyph = icon('lock'); }

      /* Points, in order of how much we trust them. A number the network
         handed back, else what our own total actually moved by, which the
         rules scored from the real rows. A refusal moves nothing and so
         shows nothing. Never a zero standing in for no answer. */
      var pts = null;
      if (r && typeof r.points === 'number') pts = Math.round(r.points);
      else if (row && typeof row.points === 'number') pts = Math.round(row.points);
      else if (mine != null && S.scoreBefore != null) {
        var now = myScoreNow();
        if (now != null && now - S.scoreBefore > 0) pts = now - S.scoreBefore;
      }

      var note = '';
      if (S.accepted === false) note = 'The class had moved on by the time it arrived';
      else if (walkedIn) note = 'Next question shortly';
      else if (right === false && q.answer != null) note = 'It was ' + q.answer;
      else if (mine == null) note = q.answer != null ? 'It was ' + q.answer : 'Nothing sent in time';

      var p = myPlace();
      var streak = (right === true && p && p.streak > 1)
        ? '<p class="gl-chip gl-chip--fire gl-verdict__streak">' + icon('fire') + p.streak + ' in a row</p>'
        : '';

      return '<div class="gl-verdict' + mod + '" role="status" aria-live="polite">' +
          '<span class="gl-verdict__icon" aria-hidden="true">' + glyph + '</span>' +
          '<h2 class="gl-verdict__head">' + esc(head) + '</h2>' +
          (pts != null ? '<p class="gl-verdict__points">+<span data-gl-count="' + pts + '">' + pts + '</span></p>' : '') +
          (note ? '<p class="gl-verdict__note">' + esc(note) + '</p>' : '') +
          streak +
        '</div>' +
        placeHtml(p) +
        /* the outline again, now with its name beside it: the moment it is
           most likely to stick */
        pictureHtml(q) +
        targetsHtml(q, 'reveal', mine) +
        noteHtml();
    }

    /* A little variety, but stable for the question: the same reveal drawn
       twice must not change its mind about what it said. */
    var RIGHT_WORDS = ['Correct!', 'Nailed it!', 'Spot on!', 'Brilliant!', 'Right on!'];
    var WRONG_WORDS = ['Not quite', 'So close', 'Not this time', 'Next one!'];
    function pick(list) { return list[Math.abs(S.index * 7 + (S.playerId ? String(S.playerId).length : 0)) % list.length]; }

    function endedHtml() {
      var p = myPlace();
      var top = standingsOf(S.session).slice(0, 3);
      var line;
      if (!p) line = '<p class="gl-verdict__note">Thanks for playing</p>';
      else line =
        '<p class="gl-final' + rankClass(p.place) + '">' +
          '<span class="gl-final__label">You finished</span>' +
          '<span class="gl-final__n">' + ordinal(p.place) + '</span>' +
          '<span class="gl-final__pts">' + p.score.toLocaleString() + ' points · ' + p.of + ' players</span>' +
        '</p>' +
        (p.levelWith
          ? '<p class="gl-verdict__note">Level with ' + esc(p.levelWith) +
            '. Ties go on correct answers, then speed, then who joined first.</p>'
          : '');
      return '<div class="gl-wait gl-wait--end">' +
          '<span class="gl-wait__icon gl-wait__icon--gold">' + icon('trophy') + '</span>' +
          '<h2 class="gl__title">That’s the game!</h2>' +
          line +
        '</div>' +
        (top.length
          ? '<div class="gl-podium">' + top.map(function (t, i) {
              var me = String(t.id) === String(S.playerId) ? ' is-me' : '';
              return '<div class="gl-podium__place ' + RANKS[i] + me + '">' +
                '<span class="gl-podium__medal" aria-hidden="true">' + MEDALS[i] + '</span>' +
                '<span class="gl-podium__name">' + esc(t.name) + '</span>' + tagMark(t) +
                '<span class="gl-podium__score">' + num(t.score, 0).toLocaleString() + '</span>' +
              '</div>';
            }).join('') + '</div>'
          : '') +
        noteHtml();
    }

    /* Counts a number up from zero, once, the first time a verdict lands.
       Redraws of the same verdict show the final figure straight away. */
    function countUp(el) {
      var to = num(el.getAttribute('data-gl-count'), 0);
      if (to <= 0 || !global.requestAnimationFrame) return;
      var start = 0, dur = 700;
      el.textContent = '0';
      function step(t) {
        if (S.dead) return;
        if (!start) start = t;
        var k = Math.min(1, (t - start) / dur);
        el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3)));
        if (k < 1) global.requestAnimationFrame(step);
      }
      global.requestAnimationFrame(step);
    }

    /* Things that should happen once per moment rather than once per draw.
       A reveal is redrawn every time the host saves a score, and replaying
       the shake, the count and the buzz on each of those made the verdict
       stutter in the student's hand. */
    function firstTime(key) {
      if (S.fresh === key) return false;
      S.fresh = key;
      return true;
    }

    function render() {
      if (S.dead) return;

      /* If the container has been taken out of the page without anyone
         calling destroy, this screen is drawing into nothing: the watch
         keeps polling and the god mode banner keeps claiming a live game
         after the tab has been left. Take ourselves down instead. */
      if (detached()) { destroy(); return; }

      clearLow();

      remember();

      if (S.phase === 'off') S.host.innerHTML = offHtml();
      else if (S.phase === 'finding') S.host.innerHTML = findingHtml();
      else if (S.phase === 'waiting') S.host.innerHTML = waitingHtml();
      else if (S.phase === 'signin') S.host.innerHTML = signinHtml();
      else if (S.phase === 'join') S.host.innerHTML = joinHtml();
      else if (S.phase === 'lobby') S.host.innerHTML = lobbyHtml();
      else if (S.phase === 'asking') S.host.innerHTML = askingHtml();
      else if (S.phase === 'locked') S.host.innerHTML = lockedHtml();
      else if (S.phase === 'reveal') S.host.innerHTML = revealHtml();
      else S.host.innerHTML = endedHtml();

      if (S.host.setAttribute) S.host.setAttribute('data-phase', S.phase);
      if (S.phase === 'asking' || S.phase === 'locked') armLow();

      /* Two kinds of new. data-fresh is a new screen, and a question that
         has just been answered is the same screen: tapping must not make the
         question and its answers fly in again. data-new is a new moment,
         which is what the press on the picked answer belongs to. */
      var fresh = firstTime(S.phase + ':' + S.index);
      var screen = (S.phase === 'locked' ? 'asking' : S.phase) + ':' + S.index;
      var newScreen = S.screen !== screen;
      S.screen = screen;
      if (S.host.toggleAttribute) {
        S.host.toggleAttribute('data-fresh', newScreen);
        S.host.toggleAttribute('data-new', fresh);
      }

      if (S.phase === 'join' && fresh) {
        var nameEl = S.host.querySelector('.gl-join__field--name');
        if (nameEl && S.code && !nameEl.value) { try { nameEl.focus(); } catch (e) {} }
      }

      var Q = global.GeoLiveQuestions;
      if (Q && typeof Q.paintPictures === 'function') {
        try { Q.paintPictures(S.host); } catch (e) { /* the sentence still reads */ }
      }

      if (!fresh) return;
      if (S.phase === 'reveal') {
        var c = S.host.querySelector('[data-gl-count]');
        if (c) countUp(c);
        if (S.host.querySelector('.gl-verdict--right')) buzz([28, 60, 28]);
        else if (S.host.querySelector('.gl-verdict--wrong')) buzz(140);
      }
      if (S.phase === 'ended') {
        var me = myPlace();
        if (me && me.place <= 3 && W.confetti) {
          try { W.confetti({ count: 110, power: 260 }); } catch (e) { /* no party */ }
        }
      }
    }

    /* ---------------------------- input --------------------------- */
    /* Bound once on the container the caller gave us. Rendering only
       swaps what is inside it, so these never stack up. */

    function onClick(ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      var opt = t.closest('.gl-target');
      if (opt && !opt.disabled) { tap(num(opt.getAttribute('data-slot'), -1)); return; }
      /* a behaviour hook, not a style class, so the stylesheet owns
         every class this file emits and nothing else */
      var go = t.closest('[data-gl-go]');
      if (go && !go.disabled) { join(); return; }
      if (t.closest('[data-gl-code]')) { stopSeek(); S.phase = 'join'; S.note = ''; render(); }
    }

    function onKey(ev) {
      if (S.dead) return;
      if (S.phase === 'join') {
        if (ev.key === 'Enter') { ev.preventDefault(); join(); }
        return;
      }
      if (S.phase !== 'asking') return;
      var k = String(ev.key || '');
      var slot = -1;
      if (k >= '1' && k <= '4') slot = k.charCodeAt(0) - 49;
      else if (/^[a-dA-D]$/.test(k)) slot = k.toLowerCase().charCodeAt(0) - 97;
      if (slot >= 0) { ev.preventDefault(); tap(slot); }
    }

    /* Guarded: the document may not be a real one under test, and a host
       that was never in the document is not "detached", it is just not
       mounted into the page yet. */
    function detached() {
      var d = host.ownerDocument;
      if (!d || typeof d.contains !== 'function') return false;
      return d.contains(host) === false && S.seen > 0;
    }

    function destroy() {
      S.dead = true;
      stopSeek();
      godLive(false);
      clearLow();
      stopWatch();
      host.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onWake);
      global.removeEventListener('online', onWake);
      if (host.classList) host.classList.remove('gl', 'gl--student');
      if (host.__glStudent === api) host.__glStudent = null;
      host.innerHTML = '';
    }

    /* A caller that re-renders its view and mounts again would otherwise
       leave the old instance alive: still subscribed, still listening for
       keys, still drawing into this same container. Two instances mean two
       answers from one keypress. Take the old one down rather than rely on
       every caller remembering destroy(). */
    if (host.__glStudent && typeof host.__glStudent.destroy === 'function') {
      try { host.__glStudent.destroy(); } catch (e) { /* it is going anyway */ }
    }

    /* The container classes are ours to add. oy-09 hands over a bare
       div and this is what makes it a GeoLive screen. */
    if (host.classList) host.classList.add('gl', 'gl--student');

    godLive(true);

    host.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onWake);
    global.addEventListener('online', onWake);

    var api = null;

    /* Same class, a game already joined on this page: carry on with it.
       Otherwise go and look for one. */
    if (signedIn() && memory && memory.sessionId && memory.classId === S.classId) {
      KEEP.forEach(function (k) { if (memory[k] !== undefined) S[k] = memory[k]; });
      S.phase = 'lobby';
      render();
      watch();
      seekLater(SEEK_MS * 2);
    } else {
      render();
      if (S.phase === 'finding') seek();
    }

    api = {
      destroy: destroy,
      get phase() { return S.phase; },
      get playerId() { return S.playerId; },
      get sessionId() { return S.sessionId; }
    };
    host.__glStudent = api;
    return api;
  }

  global.GeoLiveStudent = { mount: mount };
})(window);
