/* ------------------------------------------------------------------
   LearnGeo — GeoLive: the rules of the live class quiz.

   No network, no DOM, no clock. Time arrives as the `ms` argument, so
   the same calls always produce the same answers and this file can be
   tested on its own.

   The session object is plain data, so it can be stored, sent over the
   wire and read back:

     {
       status:  'lobby' | 'asking' | 'reveal' | 'ended',
       index:   0,                  // which question is live
       limitMs: 20000,              // time limit used for the speed bonus
       questions: [ {kind, prompt, answer, options, code}, ... ],
       players:   [ {id, name, score, streak, correct, totalMs, seat}, ... ],
       answers:   [ { playerId: {choice, ms, correct, points} }, ... ],
       closed:    [ false, ... ]    // a question stops taking answers once closed
     }

   Screens can read `session.answers[session.index]` to show who has
   answered yet. Nothing outside this file should write to a session.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';

  var BASE = 600;      /* every correct answer is worth this much */
  var SPEED = 400;     /* and up to this much more for answering early */
  var LIMIT = 20000;   /* default time limit per question, in ms */

  function create(opts) {
    opts = opts || {};
    var questions = (opts.questions || []).slice();

    return {
      status: 'lobby',
      index: 0,
      limitMs: opts.limitMs > 0 ? opts.limitMs : LIMIT,
      questions: questions,
      /* `seat` is the order players were added. It is the final tie-break,
         and it is what stops the leaderboard reshuffling between renders. */
      players: (opts.players || []).map(function (p, i) {
        return {
          id: p.id, name: p.name, score: 0, streak: 0,
          correct: 0, totalMs: 0, seat: i, joinedAt: 0
        };
      }),
      answers: questions.map(function () { return {}; }),
      closed: questions.map(function () { return false; })
    };
  }

  function start(session) {
    session.index = 0;
    /* a game with no questions is over before it starts */
    session.status = session.questions.length ? 'asking' : 'ended';
    return session;
  }

  function current(session) {
    if (session.status === 'ended') return null;
    return session.questions[session.index] || null;
  }

  /* Returns {correct, points, total}, or null if the answer cannot count:
     no live question, the question already closed, or an unknown player. */
  function answer(session, playerId, choice, ms) {
    var q = session.questions[session.index];
    if (!q || session.status !== 'asking' || session.closed[session.index]) return null;

    var player = find(session, playerId);
    if (!player) return null;

    var slot = session.answers[session.index];

    /* Answering twice keeps the first answer. Saying so again is not an
       error: the student gets the same reply they already had. */
    var already = slot[playerId];
    if (already) {
      return { correct: already.correct, points: already.points, total: player.score };
    }

    var m = mark(q, choice, ms, session.limitMs);

    slot[playerId] = { choice: m.choice, ms: m.ms, correct: m.correct, points: m.points };
    player.score += m.points;
    player.totalMs += m.ms;
    if (m.correct) { player.correct += 1; player.streak += 1; }
    else { player.streak = 0; }

    return { correct: m.correct, points: m.points, total: player.score };
  }

  /* The right answer plus how many people picked each option. Every option
     is listed, including the ones nobody chose, so a bar chart of the
     results keeps the same four bars in the same order every time. */
  function reveal(session) {
    var q = session.questions[session.index];
    if (!q) return { answer: null, counts: {} };

    close(session);
    session.status = 'reveal';

    var counts = {};
    q.options.forEach(function (o) { counts[o] = 0; });

    var slot = session.answers[session.index];
    Object.keys(slot).forEach(function (id) {
      var picked = slot[id].choice;
      if (Object.prototype.hasOwnProperty.call(counts, picked)) counts[picked] += 1;
    });

    return { answer: q.answer, counts: counts };
  }

  function next(session) {
    close(session);                       /* in case the reveal was skipped */
    if (session.index + 1 < session.questions.length) {
      session.index += 1;
      session.status = 'asking';
    } else {
      session.status = 'ended';
    }
    return session;
  }

  /* Best first. Ties are broken by more correct answers, then by the
     quicker total time, then by the order players joined. That last one
     can never tie, so two renders of the same session always come out in
     the same order. */
  function standings(session) {
    return session.players.slice().sort(function (a, b) {
      return (b.score - a.score)
          || (b.correct - a.correct)
          || (a.totalMs - b.totalMs)
          || (a.seat - b.seat);
    }).map(function (p) {
      return { id: p.id, name: p.name, score: p.score, streak: p.streak };
    });
  }

  /* ---------------------------- helpers ---------------------------- */

  /* Closing a question is what turns "never answered" into a real miss,
     and it only counts once however often it is called. */
  function close(session) {
    var i = session.index;
    if (session.closed[i] === undefined || session.closed[i]) return;
    session.closed[i] = true;

    var slot = session.answers[i];
    session.players.forEach(function (p) {
      if (!slot[p.id]) p.streak = 0;
    });
  }

  function find(session, playerId) {
    var list = session.players;
    for (var i = 0; i < list.length; i++) if (list[i].id === playerId) return list[i];
    return null;
  }

  /* A choice is the option's text. A number is taken as its position, so
     "the third button" also works. Anything else counts as wrong. */
  function option(q, choice) {
    if (typeof choice === 'number') return q.options[choice];
    return choice;
  }

  /* Late, missing or impossible times all land inside the limit, so the
     bonus can never go above 400 or below 0. */
  function spent(ms, limit) {
    var n = typeof ms === 'number' && isFinite(ms) ? ms : limit;
    if (n < 0) return 0;
    if (n > limit) return limit;
    return n;
  }

  /* The whole scoring rule, in one place. A live tap and a row reconciled
     afterwards both come through here, so the two can never drift apart. */
  function mark(q, choice, ms, limitMs) {
    var picked = option(q, choice);
    var correct = picked === q.answer;
    var taken = spent(ms, limitMs);
    return {
      choice: picked,
      ms: taken,
      correct: correct,
      points: correct ? BASE + Math.round(SPEED * (1 - taken / limitMs)) : 0
    };
  }

  /* Scores an answer that is already recorded somewhere else, without
     looking at the session's status or index and without changing anything.

     This exists for one job: an answer can land in the database while the
     question is legally still open, a moment before the host writes the
     reveal, so it is missing from the marks the host sent. The host re-reads,
     finds the straggler, and marks it with the elapsed time already stored on
     that row. That is reading, not guessing, so the arithmetic is the same as
     a live tap and shares the same code below.

     `answer()` still refuses a closed question, which is right for a live tap
     and wrong for a row being reconciled afterwards. Hence the separate way
     in, rather than loosening that rule.

     Returns {correct, points}, or null if there is no question at that index. */
  function scoreRecorded(session, questionIndex, choice, ms) {
    var q = session.questions[questionIndex];
    if (!q) return null;
    var m = mark(q, choice, ms, session.limitMs);
    return { correct: m.correct, points: m.points };
  }

  /* How many players have answered the live question. Here so a screen can
     show "7 of 12 answered" without reading the session's internals, which
     would tie that screen to a shape only this file should own. Counts
     players, not taps: a second answer from the same player does not move
     it. After the game ends it holds the last question's count. */
  function answered(session) {
    var slot = session.answers[session.index];
    return slot ? Object.keys(slot).length : 0;
  }

  /* Folds an answer recorded elsewhere into the session, even though the
     question has closed. This is the other half of scoreRecorded: marking the
     stored row without counting it here would leave the per-question detail
     saying the student scored while the standings say they did not.

     Safe to call more than once. The answer already held for that player on
     that question is the key, which is unique, so a repeat call returns what
     is already there and changes nothing.

     Returns {correct, points, total, applied}, where `applied` is false when
     the answer was already counted, so a reconcile pass can log what it
     actually changed. Null if there is no such question or player. */
  function applyRecorded(session, questionIndex, playerId, choice, ms) {
    var q = session.questions[questionIndex];
    if (!q) return null;

    var player = find(session, playerId);
    if (!player) return null;

    var slot = session.answers[questionIndex];
    var already = slot[playerId];
    if (already) {
      return {
        correct: already.correct, points: already.points,
        total: player.score, applied: false
      };
    }

    var m = mark(q, choice, ms, session.limitMs);
    slot[playerId] = { choice: m.choice, ms: m.ms, correct: m.correct, points: m.points };
    player.score += m.points;
    player.totalMs += m.ms;
    if (m.correct) player.correct += 1;

    /* A late answer lands behind questions that have already closed, so
       streaks are worked out again from what is recorded rather than nudged.
       That way the result does not depend on when the straggler turned up. */
    restreak(session);

    return { correct: m.correct, points: m.points, total: player.score, applied: true };
  }

  /* Every streak, rebuilt from the recorded answers. A closed question with no
     answer breaks the streak; an open one is simply not counted yet. This
     produces the same numbers the live path keeps as it goes. */
  function restreak(session) {
    session.players.forEach(function (p) {
      var streak = 0;
      for (var i = 0; i < session.questions.length; i++) {
        /* questions asked before someone joined are not theirs to have
           missed, so they neither break a streak nor count against them */
        if (i < (p.joinedAt || 0)) continue;
        var rec = session.answers[i] && session.answers[i][p.id];
        if (rec) streak = rec.correct ? streak + 1 : 0;
        else if (session.closed[i]) streak = 0;
      }
      p.streak = streak;
    });
  }

  /* Seats someone who joined after the game was created.

     They start at zero and are simply absent from the questions that already
     closed, rather than carrying zeros for them: a student who was not in the
     room did not miss anything. `joinedAt` records the question they arrived
     on, so a screen can say "3 of the 4 they were here for" and so restreak()
     knows which questions were never theirs.

     Calling it again with the same id is safe. The existing player comes back
     untouched, apart from the name, which is worth refreshing because a
     reconnect can carry a corrected one. Wiping their score on a rejoin would
     be the worse failure.

     Refused, returning null: a player with no id, and any join once the game
     has ended, since there is nothing left for them to answer and seating them
     would put a name on the final podium that never played.

     Returns {id, name, score, streak, seat, joinedAt, added}. */
  function addPlayer(session, person) {
    if (!person || person.id === undefined || person.id === null || person.id === '') return null;
    if (session.status === 'ended') return null;

    var existing = find(session, person.id);
    if (existing) {
      if (person.name) existing.name = person.name;
      return seated(existing, false);
    }

    /* one past the highest seat, never a count, so seats stay unique even if
       a player is ever removed: the tie-break depends on that */
    var seat = 0;
    session.players.forEach(function (p) { if (p.seat >= seat) seat = p.seat + 1; });

    var player = {
      id: person.id, name: person.name, score: 0, streak: 0,
      correct: 0, totalMs: 0, seat: seat,
      joinedAt: session.status === 'lobby' ? 0 : session.index
    };
    session.players.push(player);
    return seated(player, true);
  }

  /* A copy, so a caller holding the return value cannot edit the session. */
  function seated(p, added) {
    return {
      id: p.id, name: p.name, score: p.score, streak: p.streak,
      seat: p.seat, joinedAt: p.joinedAt, added: added
    };
  }

  global.GeoLive = {
    create: create,
    addPlayer: addPlayer,
    start: start,
    current: current,
    answer: answer,
    answered: answered,
    scoreRecorded: scoreRecorded,
    applyRecorded: applyRecorded,
    reveal: reveal,
    next: next,
    standings: standings
  };
})(window);
