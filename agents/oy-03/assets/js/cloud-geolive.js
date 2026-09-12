/* ------------------------------------------------------------------
   LearnGeo — GeoLive over Supabase.

   Everything GeoLive sends or reads lives here. The game rules are in
   geolive.js and never touch the network; the screens never touch it
   either. They all come through this file.

   Three things shape it.

   First, fail soft. The live_ tables arrive with 0002_geolive.sql, and
   until that has been applied they are simply not there. A missing table
   means "GeoLive is not set up yet" and nothing more: available() answers
   false and every other call gives back null. It never throws into the
   rest of the app, and nothing here ever shares a Promise.all with the
   class sync, so a table we are missing cannot take the teacher's
   dashboard or a student's assignment list down with it. Every other kind
   of error still throws, because swallowing real failures is its own bug.

   Second, the server decides, not us. A student cannot look a game up by
   its code (reading a game is limited to the people already in it), so
   joining goes through live_join(). A student writes only which option
   they picked and how long they took; correct and points are not theirs
   to set. And an answer is only accepted while its question is the one
   the class is actually on.

   Third, the connection drops. Students are on phones on school wifi, and
   a phone that sleeps for two minutes has to come back to the right
   question without answering twice or turning into a second player. So
   watch() re-reads the whole session rather than patching together a
   stream it may have missed pieces of.

   Note for anyone testing watch(): live updates only arrive once the
   three live_ tables are in the supabase_realtime publication, which
   0002_geolive.sql does. Until that SQL is applied nothing is published,
   no error is reported, and the polling below is doing all the work.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';

  var SESSIONS = 'live_sessions';
  var PLAYERS  = 'live_players';
  var ANSWERS  = 'live_answers';

  /* No I, O, 0 or 1: these get read off a board and typed in a hurry. */
  var CODE_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var CODE_LEN = 6;

  var DEFAULT_LIMIT_MS = 20000;

  var POLL_ON  = 2000;    /* in front and running */
  var POLL_OFF = 15000;   /* backgrounded: a slow pulse, to save the battery */
  var RETRY_MS = 4000;    /* after a failed read */

  /* null until asked, then true or false. Cached because every screen
     asks at mount and the answer cannot change inside a lesson. */
  var setUp = null;
  var probing = null;

  /* ============================= the off switch ====================== */

  /* A teacher can switch GeoLive off for their class, and off has to mean
     no network call, not a hidden tab. This file is the only one that
     talks to the database, so this is the only place that can promise it.

     Everything below checks this before it checks anything else, ahead of
     available(), which is itself a read. Turning it off also stops any
     watch already running: a class switched off mid-lesson must go quiet
     immediately, not carry on polling three tables every two seconds
     behind a screen nobody can see.

     Starts on, so the switch has to be applied deliberately and nothing
     changes for a class that has never been told either way. The gating
     layer calls setEnabled(false) once it knows the class's setting.

     This is not a security control. A student who wants to can call the
     database directly; what stops that is live_join() refusing and the
     row level security rules, which live in the SQL and not here. This
     stops the app talking when it has been told not to. */
  var enabled = true;
  var liveWatches = [];

  function setEnabled(on) {
    var was = enabled;
    enabled = !!on;
    if (was && !enabled) {
      /* stop first, empty after: a stop that throws must not strand the rest */
      var running = liveWatches.slice();
      liveWatches = [];
      running.forEach(function (stop) {
        try { stop(); } catch (e) { warn('a watch would not stop when switched off', e); }
      });
    }
    return enabled;
  }

  function isEnabled() { return enabled; }

  /* ============================== the clock ========================== */

  /* Countdowns are measured from asked_at, which the database stamps, so
     a phone with a wrong clock would show the wrong time left. A few
     seconds out of twenty is a quarter of the question, and school phones
     are routinely worse than that. So we keep the difference between this
     device and the server and apply it wherever time is worked out.

     Three ways to learn it, best first:
       - ask the server outright, if live_now() exists
       - take it from any value the server stamped on a write we just made
         (asked_at coming back from setStatus, created_at from an answer),
         which costs nothing extra
       - fall back to this device's own clock, and say so
     None of them can fail loudly: a wrong countdown is worth fixing, but
     not at the price of a game that will not start. */
  var clockOffset = 0;
  var clockSource = 'device';
  var clockAt = 0;
  var clocking = null;

  function serverNow() { return Date.now() + clockOffset; }

  /* A server timestamp we already have, plus when we asked for it. The
     true value sits somewhere inside the round trip, so the midpoint is
     the best guess and the error is at most half of it. */
  function sample(iso, t0, t1, source) {
    var at = Date.parse(iso);
    if (!at || !isFinite(at)) return false;
    var offset = at - Math.round((t0 + t1) / 2);
    /* an obviously mad value means the row was stamped a while ago, not
       that this device is a year out */
    if (Math.abs(offset) > 24 * 3600 * 1000) return false;
    clockOffset = offset;
    clockSource = source;
    clockAt = Date.now();
    return true;
  }

  function syncClock() {
    if (!enabled) return Promise.resolve(clockOffset);
    if (clocking) return clocking;
    if (clockSource !== 'device' && Date.now() - clockAt < 600000) {
      return Promise.resolve(clockOffset);
    }
    var client = sb();
    if (!client) return Promise.resolve(clockOffset);
    var t0 = Date.now();
    clocking = client.rpc('live_now')
      .then(function (res) {
        var t1 = Date.now();
        if (!res.error && res.data) sample(res.data, t0, t1, 'server');
        return clockOffset;
      })
      .catch(function (err) { warn('could not read the server clock', err); return clockOffset; })
      .then(function (v) { clocking = null; return v; });
    return clocking;
  }

  function sb() {
    var C = global.Cloud;
    return (C && C.available && C.sb) ? C.sb : null;
  }

  function me() {
    var C = global.Cloud;
    return (C && C.user) ? C.user.id : null;
  }

  /* The same test cloud.js uses for the announcements table. */
  function missingTable(err) {
    if (!err) return false;
    var code = err.code || '';
    var msg = err.message || '';
    return code === '42P01' || code === 'PGRST205' ||
           /Could not find the table|relation .* does not exist/i.test(msg);
  }

  /* The quiet paths in this file are deliberate: a table that has not been
     created yet is not worth shouting about. A fault in this file is, and
     from the outside the two look identical, which is how an afternoon
     gets lost. So anything swallowed says so once, here, before falling
     back. Never throws: a logger that breaks the game is worse than none. */
  function warn(where, err) {
    try {
      if (global.console && global.console.warn) global.console.warn('GeoLive: ' + where, err);
    } catch (e) {}
  }

  /* Anything that is not "the table is not there" is a real error. */
  function check(res) {
    if (res && res.error) {
      if (missingTable(res.error)) { setUp = false; return null; }
      throw res.error;
    }
    return res ? res.data : null;
  }

  function available() {
    if (!enabled) return Promise.resolve(false);
    if (!sb()) return Promise.resolve(false);
    if (setUp !== null) return Promise.resolve(setUp);
    if (probing) return probing;
    probing = sb().from(SESSIONS).select('id').limit(1)
      .then(function (res) {
        if (res.error) {
          if (missingTable(res.error)) { setUp = false; return false; }
          throw res.error;
        }
        setUp = true;
        return true;
      })
      .catch(function (err) {
        if (missingTable(err)) { setUp = false; return false; }
        /* Offline, or a server having a bad day. Not set up as far as this
           call goes, but ask again next time rather than remembering a no. */
        warn('could not check whether it is set up', err);
        setUp = null;
        return false;
      })
      .then(function (v) { probing = null; return v; });
    return probing;
  }

  /* Every entry point goes through here, so one missing table can only
     ever produce the empty answer for that one call. */
  function withTables(fn) {
    if (!enabled) return Promise.resolve(null);
    return available().then(function (ok) { return ok ? fn() : null; });
  }

  function code() {
    var out = '';
    for (var i = 0; i < CODE_LEN; i++) out += CODE_ABC[(Math.random() * CODE_ABC.length) | 0];
    return out;
  }

  function nowIso() { return new Date().toISOString(); }

  /* ============================== opening ============================ */

  /* The teacher picks who is playing, so their rows exist before anyone
     joins and the lobby can show the room filling up. Only the teacher may
     insert players; students arrive through live_join(). */
  function seatRoster(sessionId, classId, playerIds) {
    var ids = (playerIds || []).filter(function (x) { return !!x; });
    if (!ids.length) return Promise.resolve([]);
    return sb().from('class_members').select('student_id, display_name')
      .eq('class_id', classId).in('student_id', ids)
      .then(function (res) {
        if (res.error) warn('could not read the class roster for the lobby', res.error);
        var rows = res.error ? [] : (res.data || []);
        var names = {};
        rows.forEach(function (r) { names[r.student_id] = r.display_name; });
        var seats = ids.map(function (id) {
          return {
            session_id: sessionId,
            student_id: id,
            name: String(names[id] || 'Student').slice(0, 40) || 'Student'
          };
        });
        return sb().from(PLAYERS)
          .upsert(seats, { onConflict: 'session_id,student_id' })
          .select('id, student_id, name').then(check);
      });
  }

  function openOnce(classId, questions, playerIds, limitMs, tries) {
    return sb().from(SESSIONS).insert({
      class_id: classId,
      host_id: me(),
      code: code(),
      status: 'lobby',
      question_index: 0,
      questions: questions || [],
      time_limit_ms: limitMs
    }).select('id, code, time_limit_ms').single()
      .then(function (res) {
        if (res.error) {
          if (missingTable(res.error)) { setUp = false; return null; }
          /* A running game already has that code: pick another. */
          if (res.error.code === '23505' && tries < 5) {
            return openOnce(classId, questions, playerIds, limitMs, tries + 1);
          }
          throw res.error;
        }
        var row = res.data;
        return seatRoster(row.id, classId, playerIds).then(function () {
          return { sessionId: row.id, code: row.code, timeLimitMs: row.time_limit_ms };
        });
      });
  }

  /* limitMs is optional and lands on the session, which is where the
     speed bonus reads it from. Never hardcode it on a screen. */
  function open(classId, questions, playerIds, limitMs) {
    if (!classId) return Promise.resolve(null);
    var limit = Math.max(1000, Math.min(300000, limitMs || DEFAULT_LIMIT_MS));
    return withTables(function () {
      return openOnce(classId, questions, playerIds, limit, 0);
    });
  }

  /* =============================== joining =========================== */

  /* Reading a game is limited to the people already in it, so a code
     cannot be looked up from here. live_join() does the lookup with more
     privilege, checks the student is in the class, and either creates
     their player row or hands back the one they already have. Rejoining
     from a second device returns the same player, which is what makes a
     reconnect safe.

     Returns null when no running game has that code, so a screen can say
     "check the code". A student who is not signed in, or who belongs to
     another class, is a different situation and throws with a message
     worth showing. */
  function join(joinCode, memberId, name) {
    var text = String(joinCode || '').toUpperCase().trim();
    if (!text) return Promise.resolve(null);
    return withTables(function () {
      /* learn the server's clock on the way in, so the first countdown a
         student sees is already right rather than right on the next poll */
      syncClock();
      return sb().rpc('live_join', {
        p_code: text,
        p_name: String(name || '').trim().slice(0, 40)
      }).then(function (res) {
        if (res.error) {
          if (missingTable(res.error)) { setUp = false; return null; }
          var e = res.error;
          if (e.code === 'P0002') return null;            /* no game with that code */
          if (e.code === '28000') throw new Error('Sign in first, then join the game.');
          if (e.code === '42501') throw new Error('That game belongs to another class.');
          if (e.code === '22023') throw new Error('Your name is needed to join.');
          throw e;
        }
        var out = res.data;
        if (!out) return null;
        return {
          sessionId: out.sessionId,
          playerId: out.playerId,
          code: out.code,
          status: out.status
        };
      });
    });
  }

  /* =============================== watching ========================== */

  /* One read of everything that matters, so a screen that has missed
     updates ends up where a screen that has not already is.

     What comes back depends on who is asking, by policy: the teacher sees
     every player's answers, which is where the count under each option
     comes from, and a student sees only their own. Neither has to know
     that; both just read what they are given. */
  /* How long is left on the question that is open, against the corrected
     clock. null when no question is running, so a screen can tell "no
     countdown" apart from "no time left". */
  function msLeft(session) {
    if (!session || session.status !== 'asking' || !session.asked_at) return null;
    var opened = Date.parse(session.asked_at);
    if (!opened || !isFinite(opened)) return null;
    var limit = session.time_limit_ms || DEFAULT_LIMIT_MS;
    return Math.max(0, limit - (serverNow() - opened));
  }

  function snapshot(sessionId) {
    return Promise.all([
      /* the whole row on purpose: asked_at is being added, and naming
         columns that are not there yet would fail the read outright */
      sb().from(SESSIONS).select('*').eq('id', sessionId).maybeSingle(),
      sb().from(PLAYERS).select('id, student_id, name, score, streak, joined_at')
        .eq('session_id', sessionId).order('joined_at'),
      sb().from(ANSWERS).select('player_id, question_index, choice, correct, points, ms, created_at')
        .eq('session_id', sessionId)
    ]).then(function (all) {
      var session = check(all[0]);
      if (!session) return null;
      return {
        session: session,
        status: session.status,
        index: session.question_index,
        questions: session.questions || [],
        timeLimitMs: session.time_limit_ms || DEFAULT_LIMIT_MS,
        /* when the question on screen opened, stamped by the database.
           null in the lobby; during reveal it still holds the time the
           current question opened. */
        askedAt: session.asked_at || null,
        /* worked out here, once, against the corrected clock, so no screen
           has to remember to allow for a phone whose time is wrong */
        msLeft: msLeft(session),
        players: check(all[1]) || [],
        answers: check(all[2]) || [],
        at: Date.now()
      };
    });
  }

  function watch(sessionId, onChange) {
    if (!sessionId || typeof onChange !== 'function') {
      return Promise.resolve(function () {});
    }
    if (!enabled) {
      try { onChange(null); } catch (e) { warn('a screen threw on the switched-off notice', e); }
      return Promise.resolve(function () {});
    }
    return available().then(function (ok) {
      if (!ok) {
        /* Say so once, so a screen can show "not set up yet" instead of
           sitting on a spinner for the rest of the lesson. */
        try { onChange(null); } catch (e) { warn('a screen threw on the not-set-up notice', e); }
        return function () {};
      }

      var stopped = false;
      var timer = null;
      var channel = null;
      var reading = false;
      var again = false;
      var last = '';

      /* a host who never joins still needs the corrected clock */
      syncClock();

      function schedule(ms) {
        if (stopped) return;
        clearTimeout(timer);
        timer = setTimeout(read, ms);
      }

      function hidden() {
        return global.document && global.document.visibilityState === 'hidden';
      }

      function read() {
        if (stopped) return;
        if (reading) { again = true; return; }
        reading = true;
        snapshot(sessionId).then(function (snap) {
          reading = false;
          if (stopped) return;
          if (snap) {
            /* Only wake the screen when something actually moved. */
            var now = JSON.stringify([snap.status, snap.index, snap.players.length,
                                      snap.answers.length, snap.timeLimitMs]);
            if (now !== last) {
              last = now;
              /* a fault in the screen's own handler, not ours, and it would
                 otherwise vanish into this catch and read as "nothing is
                 happening" */
              try { onChange(snap); } catch (e) { warn('a screen threw while handling an update', e); }
            }
            if (snap.status === 'ended') { schedule(POLL_OFF); return; }
          }
          if (again) { again = false; return read(); }
          schedule(hidden() ? POLL_OFF : POLL_ON);
        }).catch(function (err) {
          reading = false;
          if (stopped) return;
          if (missingTable(err)) { setUp = false; return; }
          /* Offline, or the server stumbled. Keep the game on screen and
             try again: this is the phone-in-a-pocket case, not something
             the student can do anything about. Said out loud because a
             fault of ours retrying every few seconds looks the same as a
             bad connection from here. */
          warn('could not read the session, retrying', err);
          schedule(RETRY_MS);
        });
      }

      /* Realtime where it is published, polling regardless. A realtime
         message only ever asks for a re-read, so one that never arrives
         costs a poll interval rather than leaving the screen wrong. */
      try {
        if (sb().channel) {
          channel = sb().channel('geolive:' + sessionId);
          [SESSIONS, PLAYERS, ANSWERS].forEach(function (table) {
            channel.on('postgres_changes', {
              event: '*', schema: 'public', table: table,
              filter: (table === SESSIONS ? 'id=eq.' : 'session_id=eq.') + sessionId
            }, function () { schedule(60); });
          });
          channel.subscribe();
        }
      } catch (e) { warn('realtime would not start, polling instead', e); channel = null; }

      function wake() { if (!hidden()) schedule(0); }

      if (global.document) global.document.addEventListener('visibilitychange', wake);
      global.addEventListener('online', wake);

      read();

      /* Registered so the off switch can silence a poll already running.
         A screen that forgets to call stop() is not the only way this
         outlives its usefulness: a class switched off mid-lesson has to go
         quiet too, and only this file knows the timer exists. */
      liveWatches.push(stop);
      return stop;

      function stop() {
        if (stopped) return;
        stopped = true;
        clearTimeout(timer);
        if (global.document) global.document.removeEventListener('visibilitychange', wake);
        global.removeEventListener('online', wake);
        if (channel) { try { sb().removeChannel(channel); } catch (e) {} channel = null; }
        liveWatches = liveWatches.filter(function (f) { return f !== stop; });
      }
    });
  }

  /* =============================== answering ========================= */

  /* A student writes which option they picked and how long they took.
     Nothing else: correct and points belong to the host's screen, because
     a client that scores itself can post whatever it likes.

     Resolves to { accepted: true } when their answer is in, and null when
     it is not, so a screen never has to guess which happened. Since the
     host marks the answer afterwards, "in but not yet scored" is the
     normal case, not an edge one.

     null means refused, and there is nothing to wait for:
       - the question has closed, or the class has moved on
       - they are not in this session
     A second tap is not a refusal. Their answer is in; it was the first
     tap that landed, so that one comes back with first: false.

     The database enforces the same rules. Checking here first turns a raw
     policy rejection into a clean no, which is what a phone that woke up
     two questions late will hit. */
  function answer(sessionId, playerId, index, choice, ms) {
    if (!sessionId || !playerId) return Promise.resolve(null);
    var picked = (choice === null || choice === undefined) ? '' : String(choice);
    if (!picked) return Promise.resolve(null);          /* choice is required */

    return withTables(function () {
      return sb().from(SESSIONS).select('status, question_index')
        .eq('id', sessionId).maybeSingle()
        .then(function (res) {
          var session = check(res);
          if (!session) return null;
          /* the class has moved on, or the question is not open */
          if (session.status !== 'asking') return null;
          if (session.question_index !== (index | 0)) return null;

          var t0 = Date.now();
          return sb().from(ANSWERS).insert({
            session_id: sessionId,
            player_id: playerId,
            question_index: index | 0,
            choice: picked.slice(0, 120),
            ms: Math.max(0, Math.min(3600000, ms | 0))
          }).select('player_id, question_index, choice, correct, points, ms, created_at').single()
            .then(function (ins) {
              if (ins.error) {
                if (missingTable(ins.error)) { setUp = false; return null; }
                /* Already answered. The first answer stands, which is what
                   the scoring rules say, so hand that one back rather than
                   an error or the tap that lost. A screen showing the
                   result of a second tap must show the answer that counted. */
                if (ins.error.code === '23505') {
                  return sb().from(ANSWERS)
                    .select('player_id, question_index, choice, correct, points, ms, created_at')
                    .eq('session_id', sessionId).eq('player_id', playerId)
                    .eq('question_index', index | 0).maybeSingle()
                    .then(function (got) {
                      if (got && got.error) warn('could not read back the answer that counted', got.error);
                      var row = (got && !got.error) ? got.data : null;
                      /* accepted, because their answer is in: it was the
                         earlier tap that landed, not this one */
                      return { accepted: true, first: false, row: row || null };
                    });
                }
                /* the policy refused between our check and the write, so
                   the question closed in that gap */
                if (ins.error.code === '42501') return null;
                throw ins.error;
              }
              /* the row came back stamped by the server, so a student's
                 clock corrects itself on their first answer */
              if (ins.data && ins.data.created_at) {
                sample(ins.data.created_at, t0, Date.now(), 'server');
              }
              return { accepted: true, first: true, row: ins.data };
            });
        });
    });
  }

  /* ============================== the host =========================== */

  function setStatus(sessionId, status, index) {
    if (!sessionId) return Promise.resolve(null);
    var allowed = ['lobby', 'asking', 'reveal', 'ended'];
    if (allowed.indexOf(status) === -1) {
      return Promise.reject(new Error('Unknown GeoLive status: ' + status));
    }
    return withTables(function () {
      var patch = { status: status, updated_at: nowIso() };
      if (index !== undefined && index !== null) patch.question_index = index | 0;
      if (status === 'ended') patch.ended_at = nowIso();
      /* asked_at is deliberately not set here. A trigger stamps it when a
         question opens, so every countdown in the room is measured against
         the database's clock rather than the host laptop's, and advancing
         a question restamps it whether or not this call remembers to. */
      var t0 = Date.now();
      return sb().from(SESSIONS).update(patch).eq('id', sessionId)
        .select('*').single()
        .then(function (res) {
          var row = check(res);
          /* the row comes back carrying the server's own idea of the time,
             so the host's clock corrects itself for free */
          if (row && row.asked_at && status === 'asking') {
            sample(row.asked_at, t0, Date.now(), 'server');
          }
          return row;
        });
    });
  }

  function close(sessionId) {
    return setStatus(sessionId, 'ended');
  }

  /* The host's write, after each reveal.

     Scores are still worked out from the answers on every screen, which
     is what stops a reconnecting phone drifting away from the room. This
     writes the running totals down as the game goes, so a teacher who
     closes the tab at question 8 keeps the first 7 rather than losing the
     lot. Only the host may write these rows, the same rule that stops
     students scoring themselves.

     standings: [{ id, score, streak }] straight from GeoLive.standings().
     Returns how many rows were written, or null if GeoLive is not set up. */
  function saveStandings(sessionId, standings) {
    if (!sessionId || !standings || !standings.length) return Promise.resolve(null);
    return withTables(function () {
      var rows = standings.filter(function (p) { return p && p.id; });
      if (!rows.length) return 0;
      return Promise.all(rows.map(function (p) {
        return sb().from(PLAYERS).update({
          score: Math.max(0, Math.min(1000000, p.score | 0)),
          streak: Math.max(0, p.streak | 0)
        }).eq('id', p.id).eq('session_id', sessionId);
      })).then(function (all) {
        var written = 0;
        all.forEach(function (res) {
          if (res && res.error) {
            if (missingTable(res.error)) { setUp = false; return; }
            throw res.error;
          }
          written++;
        });
        return written;
      });
    });
  }

  /* Every answer recorded for one question, read after the reveal write, so
     the host can score and mark the ones that arrived too late to be in the
     snapshot it marked from.

     It returns all of them, not just the late ones, and that is deliberate.
     An answer nobody has scored yet and an answer scored as wrong are the
     same row: correct = false, points = 0. A student is required to insert
     exactly those values and a wrong answer earns exactly those values, so
     the two cannot be told apart without a column that does not exist.
     Rather than ask for one, hand back the lot: scoring is deterministic
     from the choice and the ms already on the row, applying is idempotent,
     and marking writes the same values a second time. Running it twice
     changes nothing, which also covers a host that closed its tab and came
     back.

     Each row carries playerId, which is the live_players row id and the id
     GeoLive knows a player by. The account id is deliberately not returned:
     it is the one that feels like the player's identity, and passing it here
     by mistake is the break this path is most likely to reintroduce.

     -> [{ playerId, questionIndex, choice, ms, correct, points, at }],
     oldest first. No data, or GeoLive not set up, is an empty list. */
  function recordedAnswers(sessionId, questionIndex) {
    if (!enabled || !sessionId) return Promise.resolve([]);
    return available().then(function (ok) {
      if (!ok) return [];
      return sb().from(ANSWERS)
        .select('player_id, question_index, choice, correct, points, ms, created_at')
        .eq('session_id', sessionId).eq('question_index', questionIndex | 0)
        .order('created_at')
        .then(function (res) {
          var rows = check(res) || [];
          return rows.map(function (r) {
            return {
              playerId: r.player_id,
              questionIndex: r.question_index,
              choice: r.choice,
              ms: r.ms,
              correct: !!r.correct,
              points: r.points | 0,
              at: r.created_at
            };
          });
        });
    });
  }

  /* The host writes down what geolive.js decided, once, at the reveal.

     This is not the same as scoring in two places. geolive.js is still the
     only thing that works out whether an answer was right and what it was
     worth; this records that decision against the row. Without it the
     columns stay at the values the student had to insert, so every answer
     in the database would read as wrong forever, and anyone asking later
     which questions a class found hard would get a confident wrong answer.

     marks: [{ playerId, correct, points }] for one question.
     Returns how many rows were written, or null if GeoLive is not set up. */
  function markAnswers(sessionId, questionIndex, marks) {
    if (!sessionId || !marks || !marks.length) return Promise.resolve(null);
    return withTables(function () {
      var rows = marks.filter(function (m) { return m && m.playerId; });
      if (!rows.length) return 0;
      var idx = questionIndex | 0;
      return Promise.all(rows.map(function (m) {
        return sb().from(ANSWERS).update({
          correct: !!m.correct,
          points: Math.max(0, Math.min(1000, m.points | 0))
        }).eq('session_id', sessionId).eq('player_id', m.playerId)
          .eq('question_index', idx);
      })).then(function (all) {
        var written = 0;
        all.forEach(function (res) {
          if (res && res.error) {
            if (missingTable(res.error)) { setUp = false; return; }
            throw res.error;
          }
          written++;
        });
        return written;
      });
    });
  }

  /* ===================== mirroring the student's level ================ */

  /* A teacher ranks a class on the level the student actually sees on their
     own phone, so that number has to leave the device. sync_level() writes
     it to every class the student is in, in one call, and clamps it on the
     server.

     The device is the source of truth and this is only a mirror of it.
     Copy, never compute: working the level out from XP a second time here
     is exactly how the number a teacher sees drifts from the number the
     student sees.

     This one deliberately never throws, unlike the rest of this file. It is
     called from the save sync, and a mirror that fails must not mark a
     student's save unsynced or start a retry loop. Their actual progress
     has already gone up; only the copy of the number is behind.

     Not gated on the GeoLive switch, because it is not GeoLive: it feeds
     the leaderboard, which is a separate switch. See NOTES for why a class
     with the leaderboard off cannot be skipped from here. */
  var levelSync = true;     /* until the function turns out not to be there */

  function missingFunction(err) {
    var code = (err && err.code) || '';
    var msg = (err && err.message) || '';
    return code === 'PGRST202' || code === '42883' ||
           /Could not find the function|function .* does not exist/i.test(msg);
  }

  function syncLevel() {
    if (!levelSync) return Promise.resolve(false);
    var client = sb();
    var W = global.WW;
    if (!client || !W || !W.state || !W.state.economy) return Promise.resolve(false);
    var e = W.state.economy;
    return client.rpc('sync_level', { p_level: e.level | 0, p_xp: e.xp | 0 })
      .then(function (res) {
        if (!res || !res.error) return true;
        /* the SQL has not been applied yet: stop asking for the rest of
           the session rather than failing once per save */
        if (missingFunction(res.error)) { levelSync = false; return false; }
        /* playing as a guest, so there is no class row to mirror into */
        if ((res.error.code || '') === '28000') return false;
        warn('could not mirror the level into the class table', res.error);
        return false;
      })
      .catch(function (err) {
        if (missingFunction(err)) { levelSync = false; return false; }
        warn('could not mirror the level into the class table', err);
        return false;
      });
  }

  /* ========================== the all-time table ===================== */

  /* Every finished game in a class, added up per student, for the
     leaderboard. Only sessions that actually ended count: a game the
     teacher abandoned in the lobby is not a result.

     Reads the totals the host wrote at the end of each game rather than
     re-scoring old answers, because re-scoring needs every past session's
     questions and gets slower every lesson, forever.

     -> [{ studentId, name, points, bestStreak, games, answered, correct }],
     best first. No data is an empty list, never an error.

     `answered` and `correct` are counts, summed across games, and they are
     what lets the leaderboard give a level to a student who only ever plays
     live games. Without them such a student reads as "not started" on a
     screen that otherwise looks completely right, which is the quiet kind
     of wrong. */
  function totals(classId) {
    if (!enabled || !classId) return Promise.resolve([]);
    return available().then(function (ok) {
      if (!ok) return [];
      return sb().from(SESSIONS).select('id')
        .eq('class_id', classId).eq('status', 'ended')
        .order('created_at', { ascending: false }).limit(200)
        .then(function (res) {
          var games = check(res) || [];
          if (!games.length) return [];
          var ids = games.map(function (g) { return g.id; });
          return sb().from(PLAYERS)
            .select('session_id, student_id, name, score, streak, answered, correct, joined_at')
            .in('session_id', ids).order('joined_at', { ascending: false })
            .then(function (pres) {
              var players = check(pres) || [];
              var by = {};
              var order = [];
              players.forEach(function (p) {
                /* Invited but never turned up: a teacher put their name in
                   the lobby and they were away. joined_at is empty for those,
                   and counting it as a game played would dilute the accuracy
                   of someone who was not there. */
                if (!p.joined_at && !(p.answered | 0)) return;
                /* A player the teacher added by hand has no account, so
                   their name is the only thing holding them together.
                   The exact same key teacher.js builds in ownerKey(), case
                   and all: folding it differently here loses their points
                   quietly, and quietly is the bad part. */
                var key = p.student_id || ('name:' + String(p.name || ''));
                if (!by[key]) {
                  by[key] = {
                    studentId: p.student_id || null,
                    name: String(p.name || 'Player'),
                    points: 0, bestStreak: 0, games: 0,
                    answered: 0, correct: 0
                  };
                  order.push(key);
                }
                var t = by[key];
                t.points += Math.max(0, p.score | 0);
                if ((p.streak | 0) > t.bestStreak) t.bestStreak = p.streak | 0;
                t.answered += Math.max(0, p.answered | 0);
                /* never more right than were answered, whatever the rows say */
                t.correct += Math.min(Math.max(0, p.correct | 0), Math.max(0, p.answered | 0));
                t.games++;
              });
              return order.map(function (k) { return by[k]; })
                .sort(function (a, b) {
                  return (b.points - a.points) ||
                         (b.bestStreak - a.bestStreak) ||
                         (b.games - a.games) ||
                         a.name.localeCompare(b.name);
                });
            });
        });
    });
  }

  global.GeoLiveCloud = {
    /* the off switch. Checked before anything else, including available(),
       and it stops watches that are already running. */
    setEnabled: setEnabled,
    isEnabled: isEnabled,
    available: available,
    open: open,
    join: join,
    watch: watch,
    answer: answer,
    setStatus: setStatus,
    close: close,
    recordedAnswers: recordedAnswers,
    markAnswers: markAnswers,
    saveStandings: saveStandings,
    totals: totals,
    /* called from the save sync by cloud.js; one line there, see NOTES */
    syncLevel: syncLevel,
    /* the server's clock, for anything that counts down outside a
       snapshot. Screens should prefer snap.msLeft; this is here so the
       two can never disagree. */
    serverNow: serverNow,
    /* so a screen can say "not set up yet" without asking again */
    get isSetUp() { return setUp; },
    get clockOffsetMs() { return clockOffset; },
    /* 'server' once a server timestamp has been seen, 'device' before
       that. A countdown on 'device' is only as good as the phone's clock. */
    get clockSource() { return clockSource; }
  };
})(window);
