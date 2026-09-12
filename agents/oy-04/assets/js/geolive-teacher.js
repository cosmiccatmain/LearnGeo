/* ------------------------------------------------------------------
   LearnGeo — GeoLive, the teacher's screen.

   The front of the room. A teacher opens this on a projector with a
   class waiting, so every screen is built to be read from the back row
   and to be driven with as few clicks as the moment allows.

   Order of the screens: who is playing, what gets asked, the join code,
   then the questions themselves and a podium at the end.

   This file draws and nothing else. The rules live in GeoLive, the
   network lives in GeoLiveCloud, the questions come from
   GeoLiveQuestions. Scoring in particular is not repeated here: every
   point on this screen came out of GeoLive.standings().
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  /* WW should always be loaded first, but if it ever is not, this file
     still has to define GeoLiveTeacher. A module that throws at load leaves
     no screen, no error anyone reads, and nothing pointing at the cause: it
     looks like the teacher screen was never built. So the helpers are taken
     with plain fallbacks rather than dereferenced blind. Same guard as
     geolive-student.js. */
  var WW = global.WW || {};
  var ICONS = WW.Icons || {};

  /* Looked up when called rather than captured now, so this file does not
     quietly depend on having been loaded after core.js. Capturing would
     freeze whatever WW happened to hold at load, which is a no-op toast if
     the order ever changes. */
  function ww() { return global.WW || WW; }

  var W = {
    escapeHtml: function (str) {
      var f = ww().escapeHtml;
      if (f) return f(str);
      return String(str).replace(/[&<>"']/g, function (ch) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
      });
    },
    $: function (sel, root) {
      var f = ww().$;
      return f ? f(sel, root) : (root || document).querySelector(sel);
    },
    $$: function (sel, root) {
      var f = ww().$$;
      if (f) return f(sel, root);
      return Array.prototype.slice.call((root || document).querySelectorAll(sel));
    },
    toast: function (a, b, c, d) {
      var f = ww().toast;
      if (f) f(a, b, c, d);
    },
    confetti: function (o) {
      var f = ww().confetti;
      if (f) f(o);
    }
  };

  /* An icon that is missing renders as nothing, never as the word
     "undefined" across the front of a classroom. Read through a getter for
     the same load-order reason as the helpers above. */
  var I = {};
  ['check', 'info', 'users', 'trophy', 'fire'].forEach(function (name) {
    Object.defineProperty(I, name, {
      get: function () { return (ww().Icons || ICONS)[name] || ''; }
    });
  });

  /* There is deliberately no time-limit constant in this file. The limit
     belongs to the session: GeoLive scales its speed bonus by whatever the
     session was created with, and a second copy here would agree with it
     today and disagree silently the day a teacher changes it. The clock
     runs on timeLimitMs off the room snapshot, and shows nothing until it
     knows the real number. */
  var DEFAULT_COUNT = 10;
  /* Only the teacher's choice before a game is opened. Once the room is
     made, the session's own limit is the only number that counts, and it
     comes back from open(). */
  var DEFAULT_SECONDS = 20;
  var SECOND_CHOICES = [10, 20, 30];
  var PODIUM = 3;

  var view = null;

  /* ========================== small helpers ========================= */

  function esc(s) { return W.escapeHtml(String(s == null ? '' : s)); }

  /* Every call into the network goes through here. A live quiz is a
     side show: if its tables are missing or the room drops out, the
     teacher dashboard around it has to stay standing. Nothing from
     GeoLiveCloud is ever allowed to throw upwards. */
  function cloud(method) {
    var args = Array.prototype.slice.call(arguments, 1);
    var C = global.GeoLiveCloud;
    if (!C || typeof C[method] !== 'function') {
      noteFailure(method, null, 'GeoLiveCloud.' + method + ' is not there');
      return Promise.resolve(null);
    }
    try {
      return Promise.resolve(C[method].apply(C, args)).catch(function (err) {
        noteFailure(method, err);
        return null;
      });
    } catch (err) {
      noteFailure(method, err);
      return Promise.resolve(null);
    }
  }

  /* Callers still get null, so nothing crashes, but the reason does not
     disappear with it. A database error and a room that simply is not
     there used to arrive here as the same null, which is how a recursive
     policy error sat unseen for an hour while a teacher checked his wifi.

     Logged every time, and kept so the message shown can say what is
     actually known rather than guessing a cause. */
  var lastFailure = null;

  function noteFailure(method, err, why) {
    var detail = why || (err && (err.message || err.code || err.error_description)) || '';
    lastFailure = { method: method, detail: String(detail || ''), at: Date.now() };
    try {
      if (global.console && global.console.warn) {
        global.console.warn('[GeoLive] ' + method + ' failed:', detail || err, err || '');
      }
    } catch (e) {}
  }

  /* Only a failure from this attempt, so an old one cannot be reported as
     the reason for a new thing going wrong. */
  function failureSince(t) {
    return (lastFailure && lastFailure.at >= t) ? lastFailure : null;
  }

  function rules() { return global.GeoLive || null; }

  /* The roster arrives from teacher.js as [{id, name}], but a class that
     was typed in by hand can hand us bare strings. Both are students. */
  /* The class as the teacher knows it, crossed with the accounts that can
     actually answer. people() hands back an empty id for every student who
     was typed in by hand and has never signed in, which is most of a class
     before anyone joins, and two of those would collapse into one player.
     So the key a row is tracked by here is never an account id: it is the
     seat, which is unique by construction. The account id is carried
     separately and only that goes to the room. */
  function normaliseRoster(roster, members) {
    var byId = {}, byName = {};
    (members || []).forEach(function (m) {
      if (!m) return;
      var id = typeof m === 'string' ? '' : (m.id || '');
      var name = typeof m === 'string' ? m : (m.name || '');
      if (id) byId[id] = { id: id, name: name };
      if (name) byName['n:' + name] = { id: id, name: name };
    });

    var out = [];
    (roster || []).forEach(function (p, i) {
      if (!p) return;
      var name = typeof p === 'string' ? p : (p.name || '');
      if (!name) return;
      var accId = typeof p === 'string' ? '' : (p.id || '');
      var m = (accId && byId[accId]) || byName['n:' + name] || null;
      out.push({
        key: 'seat' + i,
        seat: i,
        name: name,
        playerId: (m && m.id) || '',
        canPlay: !!(m && m.id)
      });
    });
    return out;
  }

  function playable() {
    return view.roster.filter(function (p) { return p.canPlay; });
  }

  function chosenPlayers() {
    return view.roster.filter(function (p) { return p.canPlay && view.chosen[p.key]; });
  }

  function initials(name) {
    var bits = String(name).trim().split(/\s+/);
    return ((bits[0] || '')[0] || '?').toUpperCase() +
           (bits.length > 1 ? (bits[bits.length - 1][0] || '').toUpperCase() : '');
  }

  /* ============================== mount ============================= */

  function mount(el, opts) {
    unmount();
    opts = opts || {};
    view = {
      el: el,
      classId: opts.classId || '',
      roster: normaliseRoster(opts.roster, opts.members),
      chosen: {},
      stage: 'players',
      sets: [],
      setId: '',
      picked: {},
      count: DEFAULT_COUNT,
      seconds: DEFAULT_SECONDS,
      questions: [],
      session: null,
      sessionId: '',
      code: '',
      joined: [],
      answered: 0,
      marks: {},
      presenceKnown: false,
      board: null,
      reveal: null,
      unwatch: null,
      tick: null,
      endsAt: 0
    };

    /* Everyone who can play is in, to start. A teacher who wants the whole
       class, which is most of the time, is then one click from the join
       code. Students without an account are left out because they have no
       device in this game, not because the teacher deselected them. */
    playable().forEach(function (p) { view.chosen[p.key] = true; });

    /* This screen owns its own container classes. oy-09 hands over a bare
       div, and if both ends assume the other adds these the whole thing
       renders unstyled and reads as a CSS bug rather than a missing line. */
    if (el.className.indexOf('gl') < 0) el.className = (el.className + ' gl gl--teacher').trim();

    try {
      view.sets = (global.GeoLiveQuestions && global.GeoLiveQuestions.premade()) || [];
    } catch (e) { view.sets = []; }
    if (view.sets.length) view.setId = view.sets[0].id;

    /* The backstop on the off switch. oy-09 gates the tab, but if this is
       ever mounted for a class that has GeoLive switched off, off has to
       mean off here too: no probe, no room, no network at all. Anything
       less and a switched-off feature is still talking to the database,
       which is the exact thing this project has already nearly shipped. */
    if (global.ClassFeatures && !global.ClassFeatures.on('geolive', view.classId)) {
      view.stage = 'off';
      view.el.innerHTML =
        '<div class="gl__empty">' +
          '<b>The live quiz is switched off for this class</b>' +
          '<span>Turn it back on under what this class uses.</span>' +
        '</div>';
      return view;
    }

    draw();

    /* Asked last, so the first screen is already up while this answers.
       If the tables are not there yet the teacher finds out before they
       have picked anybody, not after. */
    var asked = Date.now();
    cloud('available').then(function (ok) {
      if (!view || view.stage !== 'players') return;
      view.whyUnavailable = ok ? null : failureSince(asked);
      /* Anything that is not a clear yes counts as no: false, a missing
         module, or a call that threw and came back null. Saying the room
         is ready when it is not is the one answer a teacher cannot use. */
      view.online = !!ok;
      var warn = W.$('#gl-offline', view.el);
      if (warn) warn.hidden = view.online;
    });
    return view;
  }

  function unmount() {
    if (!view) return;
    if (view.unwatch) { try { view.unwatch(); } catch (e) {} }
    clearInterval(view.tick);
    view = null;
  }

  /* ============================== drawing =========================== */

  function draw() {
    if (!view) return;
    var body =
      view.stage === 'players' ? playersScreen() :
      view.stage === 'questions' ? questionsScreen() :
      view.stage === 'lobby' ? lobbyScreen() :
      view.stage === 'asking' ? askingScreen() :
      view.stage === 'reveal' ? revealScreen() :
      view.stage === 'ended' ? endedScreen() : '';
    view.el.innerHTML = body;
    placeBoard();
    wire();
  }

  function step(n, label) {
    var names = ['Who is playing', 'What gets asked', 'Joining', 'Live'];
    return '<div class="gl__steps">' + names.map(function (t, i) {
      return '<span class="gl__step' + (i === n ? ' is-now' : (i < n ? ' is-done' : '')) + '">' +
        esc(t) + '</span>';
    }).join('') + (label ? '<span class="gl__steps-note">' + esc(label) + '</span>' : '') + '</div>';
  }

  /* ---------------------------- 1. players -------------------------- */
  /* First screen on purpose. This is not open join: the teacher says who
     is in, and a class is waiting while they do it, so Everyone and
     Nobody are one click each and the list never scrolls out from under
     a tap. */
  function playersScreen() {
    var picked = chosenPlayers().length, able = playable().length;
    return step(0) +
      '<div class="gl__head">' +
        '<h2 class="gl__h">Who is playing?</h2>' +
        '<div class="gl__sub">Tap a name to leave someone out. Only these students can join.</div>' +
      '</div>' +
      /* Says what is known: the live quiz is not available. It does not
         name a cause, because the cause is not known here and a teacher
         acts on whatever they are told. The detail, when there is one, is
         the thing worth passing on to whoever can fix it. */
      '<div id="gl-offline" class="gl__warn" hidden>' + I.info +
        ' The live quiz is not available for this class yet, so nothing here will start a game.' +
        (view.whyUnavailable && view.whyUnavailable.detail
          ? ' If you are reporting it, this is what it said: ' + esc(view.whyUnavailable.detail) + '.'
          : '') +
      '</div>' +
      (view.roster.length
        ? '<div class="gl__bar">' +
            '<button class="btn btn--ghost" id="gl-all">Everyone</button>' +
            '<button class="btn btn--ghost" id="gl-none">Nobody</button>' +
            '<span class="gl__count" id="gl-picked">' + picked + ' of ' + able + ' can play</span>' +
          '</div>' +
          '<div class="gl__roster">' +
            view.roster.map(function (p) {
              if (!p.canPlay) {
                /* Shown, not hidden. A teacher who picks nine students and
                   sees three names thinks the app lost the rest. */
                return '<span class="gl-pick is-out" title="Has not joined with the class code yet">' +
                  '<span class="gl-pick__av">' + esc(initials(p.name)) + '</span>' +
                  '<span class="gl-pick__n">' + esc(p.name) +
                    '<small>Has not joined with the class code yet</small></span>' +
                '</span>';
              }
              return '<button class="gl-pick' + (view.chosen[p.key] ? ' is-on' : '') + '" ' +
                  'data-pick="' + esc(p.key) + '" aria-pressed="' + (view.chosen[p.key] ? 'true' : 'false') + '">' +
                '<span class="gl-pick__av">' + esc(initials(p.name)) + '</span>' +
                '<span class="gl-pick__n">' + esc(p.name) + '</span>' +
                '<span class="gl-pick__tick">' + I.check + '</span>' +
              '</button>';
            }).join('') +
          '</div>' +
          '<div class="gl__foot">' +
            '<button class="btn btn--primary btn--lg" id="gl-to-questions">' +
              'Next, pick the questions</button>' +
            (picked ? '' :
              '<span class="gl__note">Nobody picked yet. You can still open a room and let them join with the code.</span>') +
          '</div>'
        : '<div class="gl__empty">' + I.users +
            '<b>No students on the class list yet</b>' +
            '<span>You can still open a room now. Anyone in the class can join with the code, ' +
              'and they will show up here as they arrive.</span>' +
          '</div>' +
          '<div class="gl__foot">' +
            '<button class="btn btn--primary btn--lg" id="gl-to-questions">' +
              'Next, pick the questions</button>' +
          '</div>');
  }

  /* --------------------------- 2. questions ------------------------- */
  function questionsScreen() {
    var countries = (global.GeoData && global.GeoData.countries) || [];
    var pickedCount = Object.keys(view.picked).length;
    var custom = view.setId === 'custom';
    return step(1) +
      '<div class="gl__head">' +
        '<h2 class="gl__h">What gets asked?</h2>' +
        '<div class="gl__sub">' + chosenPlayers().length + ' playing. Pick a set, or choose the countries yourself.</div>' +
      '</div>' +
      '<div class="gl__sets">' +
        view.sets.map(function (s) {
          return '<button class="gl-set' + (view.setId === s.id ? ' is-on' : '') + '" data-set="' + esc(s.id) + '">' +
            '<b>' + esc(s.label) + '</b><span>' + esc(s.note || '') + '</span></button>';
        }).join('') +
        '<button class="gl-set' + (custom ? ' is-on' : '') + '" data-set="custom">' +
          '<b>Choose countries</b><span>' +
          (pickedCount ? pickedCount + ' chosen' : 'Pick exactly what the class has covered') +
          '</span></button>' +
      '</div>' +
      (custom
        ? '<div class="gl__picker">' +
            '<input class="input" id="gl-search" type="search" placeholder="Search countries" spellcheck="false">' +
            '<div class="gl__regions">' +
              ((global.GeoData && global.GeoData.regions) || []).map(function (r) {
                return '<button class="btn btn--ghost btn--sm" data-region="' + esc(r) + '">' + esc(r) + '</button>';
              }).join('') +
              '<button class="btn btn--ghost btn--sm" data-region="">Clear</button>' +
            '</div>' +
            '<div class="gl__countries" id="gl-countries">' + countryRows(countries, '') + '</div>' +
          '</div>'
        : '') +
      '<div class="gl__bar">' +
        '<span class="gl__count">How many questions</span>' +
        [10, 15, 20].map(function (n) {
          return '<button class="btn btn--ghost btn--sm' + (view.count === n ? ' is-on' : '') +
            '" data-count="' + n + '">' + n + '</button>';
        }).join('') +
      '</div>' +
      '<div class="gl__bar">' +
        '<span class="gl__count">How long to answer</span>' +
        SECOND_CHOICES.map(function (n) {
          return '<button class="btn btn--ghost btn--sm' + (view.seconds === n ? ' is-on' : '') +
            '" data-seconds="' + n + '">' + n + 's</button>';
        }).join('') +
      '</div>' +
      '<div class="gl__foot">' +
        '<button class="btn btn--ghost" id="gl-back-players">Back</button>' +
        '<button class="btn btn--primary btn--lg" id="gl-open"' +
          ((custom && pickedCount < 4) ? ' disabled' : '') + '>Open the room</button>' +
        '<span class="gl__note" id="gl-pick-note"' +
          ((custom && pickedCount < 4) ? '' : ' hidden') + '>' +
          'Pick at least four countries, so a question has four answers to choose from.</span>' +
      '</div>';
  }

  function countryRows(list, needle) {
    needle = (needle || '').toLowerCase();
    var rows = list.filter(function (c) {
      return !needle || c.name.toLowerCase().indexOf(needle) >= 0 ||
        (c.capital || '').toLowerCase().indexOf(needle) >= 0;
    });
    if (!rows.length) return '<div class="gl__none">Nothing matches that.</div>';
    return rows.map(function (c) {
      var key = countryKey(c);
      return '<button class="gl-country' + (view.picked[key] ? ' is-on' : '') + '" data-country="' + esc(key) + '">' +
        esc(c.name) + '</button>';
    }).join('');
  }

  /* Settled: there is no ISO3 in this project, so a question's code
     carries the country name, which is what GeoMap.hasShape() keys on.
     The iso3 field is read first anyway, so the day one is added this
     upgrades without being touched. */
  function countryKey(c) { return c.iso3 || c.code || c.name; }

  /* ----------------------------- 3. lobby --------------------------- */
  function lobbyScreen() {
    var picked = chosenPlayers();
    return step(2) +
      '<div class="gl__head">' +
        '<h2 class="gl__h">Join at learngeo.app</h2>' +
      '</div>' +
      '<div class="gl__code" id="gl-code">' + esc(view.code || '······') + '</div>' +
      '<div class="gl__sub gl__sub--mid">' + esc(view.questions.length) + ' questions · ' +
        picked.length + ' invited</div>' +
      '<div class="gl__joined" id="gl-joined">' + joinedRows() + '</div>' +
      '<div class="gl__foot">' +
        '<button class="btn btn--ghost" id="gl-cancel">Cancel</button>' +
        '<button class="btn btn--primary btn--lg" id="gl-start"' +
          (readyToStart() ? '' : ' disabled') + '>Start the quiz</button>' +
      '</div>';
  }

  /* Who is in, and who the room is still waiting on. The waiting half is
     the useful half: it is how a teacher knows to say a name out loud. */
  function joinedRows() {
    var known = presenceKnown();
    var here = known ? inRoom() : {};
    return chosenPlayers().map(function (p) {
      return '<span class="gl-joined' + (here[p.playerId || p.key] ? ' is-in' : '') + '">' +
        '<span class="gl-joined__av">' + esc(initials(p.name)) + '</span>' + esc(p.name) + '</span>';
    }).join('') +
    (known ? strangers().map(function (j) {
      return '<span class="gl-joined is-in">' +
        '<span class="gl-joined__av">' + esc(initials(j.name || '?')) + '</span>' +
        esc(j.name || 'Someone') + '</span>';
    }).join('') : '') +
    '<span class="gl__count">' +
      (!chosenPlayers().length
        ? 'Nobody on the list yet. Anyone in the class can join with the code above.'
        : known
          ? hereCount() + ' of ' + chosenPlayers().length + ' here'
          : 'Waiting for the class. Start when everyone is looking at their phone.') +
    '</span>';
  }

  /* Once a room is open, starting is the teacher's call. They can see the
     room and this screen cannot, and opening before the class walks in is
     the normal way round. An empty game is not broken: anyone who joins
     later is seated as they arrive. */
  function readyToStart() { return !!view.session; }

  /* Who is in the room. Matched on the account id, falling back to the
     name they joined under, so the lobby chips and the answered count are
     always drawn from one set and cannot disagree. A student who joins
     late and was not on the invited list still counts: the spec says the
     denominator is everyone currently in the session, and a name on screen
     that is not in the count is the confusing half of that. */
  function inRoom() {
    var by = {};
    view.joined.forEach(function (j) {
      if (!isPresent(j)) return;
      /* The account id is student_id on a room row. Its id is the row's
         own id, which is the player id inside the game and means nothing
         to the class roster. */
      var acc = j.student_id || j.studentId || j.playerId || '';
      if (acc) by[acc] = true;
      if (j.name) by['n:' + j.name] = true;
    });
    var out = {};
    chosenPlayers().forEach(function (p) {
      if (by[p.playerId] || by['n:' + p.name]) out[p.playerId || p.key] = true;
    });
    return out;
  }

  /* Anyone in the room the invited list does not account for. Should be
     nobody, since the database only lets invited players join, but if it
     ever happens the teacher sees them rather than a count that does not
     add up. */
  function strangers() {
    var known = {};
    chosenPlayers().forEach(function (p) {
      known[p.playerId] = true;
      known['n:' + p.name] = true;
    });
    return view.joined.filter(function (j) {
      if (!isPresent(j)) return false;
      var acc = j.student_id || j.studentId || j.playerId || '';
      return !known[acc] && !known['n:' + j.name];
    });
  }

  function hereCount() { return Object.keys(inRoom()).length + strangers().length; }

  /* Whether a room row means a person is actually in the room.

     The room seats every invited student the moment the game is opened, so
     a row on its own proves nothing: joined_at is stamped at seating, and
     joining only updates the name. Until the room carries something that
     separates seated from arrived, this screen says it does not know
     rather than lighting up a class that has not opened their phones yet.
     Telling a teacher everyone is here when nobody is would be worse than
     telling them nothing, because they would start. */
  function isPresent(row) {
    if (!row) return false;
    if (typeof row.joined === 'boolean') return row.joined;
    if (typeof row.present === 'boolean') return row.present;
    var at = row.joined_at === undefined ? row.joinedAt : row.joined_at;
    if (at === null) return false;
    if (at) return true;
    return false;
  }

  /* Can the room tell arrived from merely seated at all?

     Sticky, and that is the whole point. Asking the current rows would go
     wrong at the worst moment: every seated row starts null and fills in as
     students arrive, so once the last one joins there would be no null left
     to see, and the lobby would decide it could no longer tell and fall
     back to "waiting" exactly as the room finished filling. The display
     would go backwards in front of the class.

     So the answer is remembered from the first snapshot that proves it. At
     the start of a game nobody has joined yet, so if the room can tell at
     all, it says so immediately. A room that never shows the distinction
     never claims presence, which is the honest fallback. */
  function notePresenceSignal(rows) {
    if (view.presenceKnown) return;
    var proof = (rows || []).some(function (r) {
      return typeof r.joined === 'boolean' || typeof r.present === 'boolean' ||
             r.joined_at === null || r.joinedAt === null;
    });
    if (proof) view.presenceKnown = true;
  }

  function presenceKnown() { return !!view.presenceKnown; }

  /* ---------------------------- 4. asking --------------------------- */
  /* No scores while a question is open. Kahoot does the same thing, and
     it also means the one thing moving on a projector is a number going
     up, not a table reordering itself behind the question. */
  function askingScreen() {
    var q = rules() ? rules().current(view.session) : null;
    if (!q) return '';
    return '<div class="gl-live">' +
      '<div class="gl-live__top">' +
        '<span class="gl-live__n">Question ' + (view.session.index + 1) + ' of ' + view.questions.length + '</span>' +
        '<span class="gl-live__clock" id="gl-clock">' +
          (view.limitMs ? Math.round(view.limitMs / 1000) : '·') + '</span>' +
      '</div>' +
      '<h2 class="gl-live__q">' + esc(q.prompt) + '</h2>' +
      '<div class="gl-live__opts">' +
        (q.options || []).map(function (o, i) {
          return '<div class="gl-opt gl-opt--' + i + '">' + esc(o) + '</div>';
        }).join('') +
      '</div>' +
      '<div class="gl-live__foot">' +
        '<span class="gl-live__answered" id="gl-answered">' + answeredLine() + '</span>' +
        '<button class="btn btn--ghost" id="gl-reveal">Show the answer</button>' +
      '</div>' +
    '</div>';
  }

  function answeredLine() {
    return view.answered + ' of ' + playingCount() + ' answered';
  }

  function playingCount() {
    return presenceKnown() ? hereCount() : (view.joined || []).length;
  }

  /* ---------------------------- 5. reveal --------------------------- */
  function revealScreen() {
    var q = rules() ? rules().current(view.session) : null;
    var r = view.reveal || { answer: '', counts: {} };
    var last = view.session.index + 1 >= view.questions.length;
    return '<div class="gl-live">' +
      '<h2 class="gl-live__q">' + esc(q ? q.prompt : '') + '</h2>' +
      '<div class="gl-live__opts">' +
        ((q && q.options) || []).map(function (o, i) {
          var n = (r.counts && r.counts[o]) || 0;
          var right = o === r.answer;
          return '<div class="gl-opt gl-opt--' + i + (right ? ' is-right' : ' is-dim') + '">' +
            esc(o) + '<span class="gl-opt__n">' + n + '</span></div>';
        }).join('') +
      '</div>' +
      boardSlot(6) +
      '<div class="gl-live__foot">' +
        '<button class="btn btn--primary btn--lg" id="gl-next">' +
          (last ? 'Finish' : 'Next question') + '</button>' +
      '</div>' +
    '</div>';
  }

  /* The standings board is built once and then never rebuilt, and its rows
     are never reordered. Writing fresh HTML in rank order would move a row
     a whole row height between one frame and the next, which on a wall in
     front of a class is the jump this screen exists to avoid.

     So: one row per player, in the order the players were created, which
     never changes. Rank arrives as a custom property, --gl-i on the row and
     --gl-n on the container, and oy-06's stylesheet turns a change in that
     number into a row sliding from third place to first. --gl-max is how
     many rows are meant to be visible, so the same board can show a top six
     at the reveal and the whole class at the end without any row being
     added or taken away. */
  function boardSlot(visible) {
    return '<div id="gl-stand-slot" data-visible="' + (visible || 0) + '"></div>' + tieNote();
  }

  /* The order two level students appear in is arbitrary, but it is fixed,
     and fixed is the property that matters on a wall in front of a class.
     Said on screen rather than left implicit, because a teacher who cannot
     explain the order to the student asking about it will reasonably
     assume the scoreboard is broken. */
  function tieNote() {
    return '<span class="gl__note">Level on points? Whoever got more right is ' +
      'first, then whoever was quicker, then whoever joined the game first.</span>';
  }

  function ensureBoard() {
    if (view.board) return view.board;
    if (!view.session || !view.session.players) return null;
    var box = document.createElement('div');
    box.className = 'gl-stand';
    view.session.players.forEach(function (p) {
      var row = document.createElement('div');
      row.className = 'gl-stand__row';
      row.setAttribute('data-player', p.id);
      row.innerHTML =
        '<span class="gl-stand__pl"></span>' +
        '<span class="gl-stand__n">' + esc(p.name) + '</span>' +
        '<span class="gl-stand__streak"></span>' +
        '<span class="gl-stand__s">0</span>';
      box.appendChild(row);
    });
    view.board = box;
    return box;
  }

  /* Places, points and streaks are written into the rows that are already
     there. Nothing is created, removed or moved. */
  function refreshBoard(visible) {
    var box = view.board;
    if (!box) return;
    var rows = [];
    try { rows = (rules() && rules().standings(view.session)) || []; } catch (e) { rows = []; }
    if (!rows.length) return;

    var byId = {};
    W.$$('.gl-stand__row', box).forEach(function (row) {
      byId[row.getAttribute('data-player')] = row;
    });

    box.style.setProperty('--gl-n', rows.length);
    box.style.setProperty('--gl-max', visible || rows.length);

    rows.forEach(function (p, i) {
      var row = byId[p.id];
      if (!row) return;
      row.style.setProperty('--gl-i', i);
      row.classList.toggle('is-below', !!visible && i >= visible);
      var pl = W.$('.gl-stand__pl', row), sc = W.$('.gl-stand__s', row),
          st = W.$('.gl-stand__streak', row);
      if (pl) pl.textContent = i + 1;
      if (sc) sc.textContent = Number(p.score || 0).toLocaleString();
      if (st) st.innerHTML = p.streak > 1 ? I.fire + ' ' + p.streak : '';
    });
  }

  /* Put the one board back wherever the screen that was just drawn wants
     it. Moving the same element keeps every row's identity, which is what
     lets the stylesheet animate the move instead of cutting to it. */
  function placeBoard() {
    var slot = W.$('#gl-stand-slot', view.el);
    if (!slot) return;
    var box = ensureBoard();
    if (!box) return;
    slot.appendChild(box);
    refreshBoard(Number(slot.getAttribute('data-visible')) || 0);
  }

  /* ----------------------------- 6. podium -------------------------- */
  function endedScreen() {
    var rows = [];
    try { rows = (rules() && rules().standings(view.session)) || []; } catch (e) { rows = []; }
    var top = rows.slice(0, PODIUM);
    var order = [1, 0, 2];   /* second, first, third, the way a podium stands */
    return '<div class="gl-end">' +
      '<h2 class="gl__h gl__h--mid">' + I.trophy + ' Final standings</h2>' +
      '<div class="gl-podium">' +
        order.map(function (idx) {
          var p = top[idx];
          if (!p) return '';
          return '<div class="gl-podium__col gl-podium__col--' + (idx + 1) + '">' +
            '<span class="gl-podium__av">' + esc(initials(p.name)) + '</span>' +
            '<b class="gl-podium__n">' + esc(p.name) + '</b>' +
            '<span class="gl-podium__s">' + Number(p.score || 0).toLocaleString() + '</span>' +
            '<span class="gl-podium__pl">' + (idx + 1) + '</span>' +
          '</div>';
        }).join('') +
      '</div>' +
      boardSlot(0) +
      '<div class="gl__foot">' +
        '<button class="btn btn--primary btn--lg" id="gl-done">Done</button>' +
      '</div>' +
    '</div>';
  }

  /* ============================== wiring ============================ */

  function wire() {
    var el = view.el;

    W.$$('[data-pick]', el).forEach(function (b) {
      b.addEventListener('click', function () {
        var key = b.getAttribute('data-pick');
        view.chosen[key] = !view.chosen[key];
        b.classList.toggle('is-on', !!view.chosen[key]);
        b.setAttribute('aria-pressed', view.chosen[key] ? 'true' : 'false');
        patchPicked();
      });
    });

    on('#gl-all', function () {
      playable().forEach(function (p) { view.chosen[p.key] = true; });
      draw();
    });
    on('#gl-none', function () {
      view.chosen = {};
      draw();
    });
    on('#gl-to-questions', function () { view.stage = 'questions'; draw(); });
    on('#gl-back-players', function () { view.stage = 'players'; draw(); });

    W.$$('[data-set]', el).forEach(function (b) {
      b.addEventListener('click', function () { view.setId = b.getAttribute('data-set'); draw(); });
    });
    W.$$('[data-count]', el).forEach(function (b) {
      b.addEventListener('click', function () { view.count = Number(b.getAttribute('data-count')); draw(); });
    });
    W.$$('[data-seconds]', el).forEach(function (b) {
      b.addEventListener('click', function () { view.seconds = Number(b.getAttribute('data-seconds')); draw(); });
    });
    W.$$('[data-country]', el).forEach(function (b) {
      b.addEventListener('click', function () {
        var key = b.getAttribute('data-country');
        if (view.picked[key]) delete view.picked[key]; else view.picked[key] = true;
        b.classList.toggle('is-on', !!view.picked[key]);
        patchPicks();
      });
    });
    W.$$('[data-region]', el).forEach(function (b) {
      b.addEventListener('click', function () {
        var r = b.getAttribute('data-region');
        if (!r) { view.picked = {}; draw(); return; }
        ((global.GeoData && global.GeoData.countries) || []).forEach(function (c) {
          if (c.region === r) view.picked[countryKey(c)] = true;
        });
        draw();
      });
    });
    var search = W.$('#gl-search', el);
    if (search) {
      search.addEventListener('input', function () {
        var box = W.$('#gl-countries', el);
        if (!box) return;
        box.innerHTML = countryRows((global.GeoData && global.GeoData.countries) || [], search.value);
        wire();
        patchPicks();
      });
    }

    on('#gl-open', openRoom);
    on('#gl-cancel', function () { closeRoom(); view.stage = 'questions'; draw(); });
    on('#gl-start', startQuiz);
    on('#gl-reveal', doReveal);
    on('#gl-next', doNext);
    on('#gl-done', function () { closeRoom(); unmount(); });
  }

  function on(sel, fn) {
    var b = W.$(sel, view.el);
    if (b) b.addEventListener('click', fn);
  }

  /* Picking a country moves the button and the count with it. Without
     this the teacher picks four countries and Open stays greyed, because
     the screen is not redrawn while they pick: 213 buttons would flicker
     and the list would jump back to the top on every tap. So the two
     things that depend on the count are patched instead. */
  function patchPicks() {
    var count = Object.keys(view.picked).length;
    var enough = count >= 4;

    var open = W.$('#gl-open', view.el);
    if (open) open.disabled = !enough;

    var note = W.$('#gl-pick-note', view.el);
    if (note) note.hidden = enough;

    var card = W.$('[data-set="custom"] span', view.el);
    if (card) {
      card.textContent = count
        ? count + ' chosen'
        : 'Pick exactly what the class has covered';
    }
  }

  /* Counts change on every tap. Rewriting one number beats redrawing a
     roster of thirty buttons and losing the scroll position with it. */
  function patchPicked() {
    var n = chosenPlayers().length;
    var tag = W.$('#gl-picked', view.el);
    if (tag) tag.textContent = n + ' of ' + playable().length + ' can play';
    var next = W.$('#gl-to-questions', view.el);
    if (next) next.disabled = !n;
  }

  /* ============================ the game =========================== */

  /* What the picked identifiers actually match, asked of the module that
     owns matching rather than worked out again here. */
  function resolvePicked() {
    var Q = global.GeoLiveQuestions;
    if (!Q || typeof Q.resolveCodes !== 'function') return null;
    try { return Q.resolveCodes(Object.keys(view.picked)); } catch (e) { return null; }
  }

  function buildQuestions() {
    var Q = global.GeoLiveQuestions;
    if (!Q) return [];
    try {
      if (view.setId === 'custom') {
        return Q.fromCodes(Object.keys(view.picked), null, view.count) || [];
      }
      var set = view.sets.filter(function (s) { return s.id === view.setId; })[0];
      return (set && set.build(view.count)) || [];
    } catch (e) { return []; }
  }

  function openRoom() {
    var players = chosenPlayers();

    /* A teacher who picked countries by hand is told what could not be
       matched, before the class is watching. Silently dropping them turns
       "test them on these three" into a world quiz, which is a different
       lesson rather than a graceful fallback. */
    if (view.setId === 'custom') {
      var found = resolvePicked();
      if (found && found.missing.length) {
        var some = found.missing.slice(0, 3).join(', ');
        if (found.missing.length > 3) some += ' and ' + (found.missing.length - 3) + ' more';
        if (!found.found.length) {
          W.toast('None of those countries were found', some +
            '. Nothing can be asked, so pick them again.', I.info, 6000);
          return;
        }
        W.toast('Some countries were not found', some +
          '. The game will leave them out.', I.info, 5500);
      }
    }

    view.questions = buildQuestions();
    if (!view.questions.length) {
      W.toast('No questions', 'That set came back empty. Try another one.', I.info, 4000);
      return;
    }

    /* Asked for twenty, got twelve. The teacher hears it here rather than
       finding out when the game ends eight questions early. */
    if (view.questions.length < view.count) {
      W.toast('Only ' + view.questions.length + ' questions',
        'That is all those countries can ask without repeating themselves, so the game will run ' +
        view.questions.length + '.', I.info, 5500);
    }
    var btn = W.$('#gl-open', view.el);
    if (btn) { btn.disabled = true; btn.textContent = 'Opening…'; }
    var asked = Date.now();

    /* The chosen limit goes to the room, which clamps it and stores it.
       What comes back is what the game actually runs on. */
    cloud('open', view.classId, view.questions,
          players.map(function (p) { return p.playerId; }),
          view.seconds * 1000)
      .then(function (room) {
        if (!view) return;
        if (!room || !room.code) {
          var why = failureSince(asked);
          W.toast('The room did not open',
            'Nothing was started, and this is not something you did. ' +
            (why && why.detail
              ? 'If you are reporting it, this is what it said: ' + why.detail + '.'
              : 'Try it again in a moment, and tell us if it keeps happening.'),
            I.info, 6500);
          if (btn) { btn.disabled = false; btn.textContent = 'Open the room'; }
          return;
        }
        view.sessionId = room.sessionId;
        view.code = room.code;
        /* open() reads the limit back off the row it inserted, so this is
           the number the game was actually stored with, clamp and all. */
        view.limitMs = Number(room.timeLimitMs || room.time_limit_ms || room.limitMs) || 0;

        /* The game is deliberately NOT created here. A player's id inside
           this game is its live_players row id, not the account id, because
           that is what an answer row's player_id carries, what markAnswers
           filters on and what saveStandings updates by. Those row ids only
           exist once the room has seated the roster, and they arrive in the
           first snapshot. Building the game off account ids instead would
           look right and score nobody: GeoLive would refuse every answer as
           coming from a player it has never heard of. */
        view.session = null;
        view.stage = 'lobby';
        draw();
        watchRoom();
      });
  }

  /* The game is built from the room's own player rows and rebuilt while
     the lobby is still open, so a student who arrives before the start is
     in it. Never rebuilt after that: a rebuild is a reset, and resetting
     mid-game would wipe every score the class has just earned. */
  function syncSession(rows) {
    if (!rules()) return;
    if (view.session && view.stage !== 'lobby') return;

    var players = (rows || []).map(function (r) {
      return { id: r.id || r.playerId, name: r.name || 'Student' };
    }).filter(function (p) { return !!p.id; });

    /* An empty room is a real starting point, not a failure. A teacher
       opening before the class walks in is the normal case, and anyone who
       joins later is added to the game rather than turned away. */

    if (view.session && sameIds(view.session.players, players) &&
        (!view.limitMs || view.session.limitMs === view.limitMs)) return;

    var made = { questions: view.questions, players: players };
    if (view.limitMs) made.limitMs = view.limitMs;
    try {
      view.session = rules().create(made);
      view.board = null;   /* the board is built per set of players */
    } catch (e) { /* keep whatever we had rather than nothing */ }
  }

  /* Someone who arrives after the start. GeoLive.answer refuses a player
     it does not know, so without this their taps would vanish while their
     phone showed the question quite happily. addPlayer gives them a seat
     and a score of zero, and leaves anyone already in the game alone. */
  function seatLatecomers(rows) {
    if (!view.session || view.stage === 'lobby' || !rules()) return;
    if (typeof rules().addPlayer !== 'function') return;
    var have = {};
    view.session.players.forEach(function (p) { have[p.id] = true; });
    (rows || []).forEach(function (r) {
      var id = r.id || r.playerId;
      if (!id || have[id]) return;
      try { rules().addPlayer(view.session, { id: id, name: r.name || 'Student' }); }
      catch (e) {}
      view.board = null;   /* the board is one row per player */
    });
  }

  function sameIds(a, b) {
    if (!a || a.length !== b.length) return false;
    var have = {};
    a.forEach(function (p) { have[p.id] = true; });
    return b.every(function (p) { return have[p.id]; });
  }

  /* One subscription for the whole game. Everything the room reports
     lands here, and anything this screen does not recognise is ignored
     rather than guessed at. */
  function watchRoom() {
    if (view.unwatch) { try { view.unwatch(); } catch (e) {} view.unwatch = null; }
    cloud('watch', view.sessionId, onRoomChange).then(function (off) {
      if (!view) { if (typeof off === 'function') off(); return; }
      if (typeof off === 'function') view.unwatch = off;
    });
  }

  /* The room sends a whole snapshot every time, not a stream of events:
     { status, index, timeLimitMs, askedAt, players, answers }, where
     answers is every answer so far. So everything here is derived from
     what arrived, never accumulated across messages. A snapshot that turns
     up late is still correct; a missed event would leave this screen
     quietly wrong for the rest of the lesson, which on school wifi in a
     room full of phones is not a rare case. */
  function onRoomChange(snap) {
    if (!view || !snap) return;

    if (snap.players) {
      view.joined = snap.players.slice();
      notePresenceSignal(view.joined);
      syncSession(view.joined);
      seatLatecomers(view.joined);
      if (view.stage === 'lobby') {
        var box = W.$('#gl-joined', view.el);
        if (box) box.innerHTML = joinedRows();
        var start = W.$('#gl-start', view.el);
        if (start) start.disabled = !readyToStart();
      }
    }

    /* The session owns the limit. Taking askedAt with it means the clock
       is right on a screen that reconnected halfway through a question
       rather than starting its twenty seconds again. */
    if (Number(snap.timeLimitMs)) {
      var known = view.limitMs;
      view.limitMs = Number(snap.timeLimitMs);
      if (snap.askedAt) view.askedAt = toMs(snap.askedAt);
      if (view.limitMs !== known) {
        /* The session was built before the room had said what the limit
           was, so if it turns out to be something other than what GeoLive
           assumed, build it again now. Only ever in the lobby, where no
           answer has been counted yet and nothing is lost. After that the
           number the game was created with is the number it keeps, which
           is what makes every screen's speed bonus agree. */
        if (view.stage === 'lobby') syncSession(view.joined);
        if (view.stage === 'asking') runClock();
      }
    }

    var rows = snap.answers || [];

    /* Answers go to GeoLive and nowhere else: this screen never works out
       a score for itself. Replaying the whole list each time is safe
       because a second answer from the same player comes back null, which
       is a refusal rather than a zero. */
    if (view.session && rules()) {
      rows.forEach(function (r) {
        if (qIndexOf(r) !== view.session.index) return;
        var who = playerIdOf(r);
        try {
          var marked = rules().answer(view.session, who, r.choice, Number(r.ms) || 0);
          if (marked) noteMark(view.session.index, who, marked);
        } catch (e) {}
      });
    }

    catchStragglers(rows);

    view.answered = answeredFrom(rows);

    if (view.stage === 'asking') {
      var line = W.$('#gl-answered', view.el);
      if (line) line.textContent = answeredLine();
      /* Everybody in: no reason to make a room of children watch a clock
         run down. */
      var n = playingCount();
      if (n && view.answered >= n) doReveal();
    }
  }

  /* What the host marked each answer as, kept per question until the
     reveal writes them back. This is the only moment the marks exist: a
     student inserts their row with correct false and points zero, because
     they are not allowed to grade themselves, and GeoLive hands back the
     real values exactly once, the first time it counts that answer. Miss
     that moment and the row reads as a wrong answer for good, so anyone
     asking later which questions a class struggled with gets a confident
     wrong answer. */
  function noteMark(index, playerId, marked) {
    if (!playerId || !marked) return;
    var box = view.marks[index] || (view.marks[index] = {});
    box[playerId] = {
      playerId: playerId,
      correct: !!marked.correct,
      points: Number(marked.points) || 0
    };
  }

  function marksFor(index) {
    var box = view.marks[index] || {};
    return Object.keys(box).map(function (k) { return box[k]; });
  }

  /* An answer can insert legally while a question is still open, a moment
     before this screen writes the reveal, so it is missing from the marks
     that went with it. It is a real answer: submitted in time and carrying
     its own elapsed time, so scoring it afterwards is reading rather than
     guessing.

     GeoLive.answer refuses it, correctly, because the question is closed.
     applyRecorded is the way in that does not pretend otherwise: it credits
     the player, rebuilds streaks from what is recorded so the result does
     not depend on when the straggler turned up, and is safe to call twice.

     Caught here, off the snapshot this screen already receives, rather than
     waiting on a re-read. oy-03's deliberate re-read is still worth having
     for the case where no further snapshot arrives, and running both is
     harmless: the second call reports applied false and changes nothing. */
  function catchStragglers(rows) {
    if (view.stage !== 'reveal' || !view.session || !rules()) return;
    if (typeof rules().applyRecorded !== 'function') return;

    var idx = view.session.index;
    var caught = 0;
    (rows || []).forEach(function (r) {
      if (qIndexOf(r) !== idx) return;
      var who = playerIdOf(r);
      if (!who) return;
      if (view.marks[idx] && view.marks[idx][who]) return;   /* already marked */
      var m;
      try { m = rules().applyRecorded(view.session, idx, who, r.choice, Number(r.ms) || 0); }
      catch (e) { m = null; }
      if (!m || !m.applied) return;
      noteMark(idx, who, m);
      caught++;
    });

    if (!caught) return;
    /* The marks and the totals both have to go out again: the row needs its
       real points, and the standings the class is looking at have changed. */
    markAnswers(idx);
    saveStandings();
    placeBoard();
  }

  /* The three shapes a row can arrive in. The database columns are
     snake_case and the rest of this file is not, so the translation lives
     in one place rather than at every use. */
  function playerIdOf(r) { return r.player_id || r.playerId || r.id || ''; }
  function qIndexOf(r) {
    var i = r.question_index;
    if (i === undefined) i = r.questionIndex;
    return Number(i);
  }
  function toMs(t) {
    if (!t) return 0;
    if (typeof t === 'number') return t;
    var n = Date.parse(t);
    return isNaN(n) ? 0 : n;
  }

  /* How many have answered the question on screen, counted off the
     snapshot rather than off my own tally, and by distinct player so a
     phone that retried cannot count twice. Filtered on the index this
     screen is showing: the room's own index can lag a beat behind while
     the status write lands, and a count for the previous question is worse
     than a count that arrives a moment late. */
  function answeredFrom(rows) {
    if (!view.session) return 0;
    var seen = {};
    (rows || []).forEach(function (r) {
      if (qIndexOf(r) !== view.session.index) return;
      var id = playerIdOf(r);
      if (id) seen[id] = true;
    });
    return Object.keys(seen).length;
  }

  function startQuiz() {
    if (!view.session || !rules()) return;
    try { rules().start(view.session); } catch (e) { return; }
    cloud('setStatus', view.sessionId, 'asking', 0);
    askQuestion();
  }

  function askQuestion() {
    view.answered = 0;
    view.reveal = null;
    view.askedAt = Date.now();   /* replaced by the room's askedAt when it lands */
    view.stage = 'asking';
    draw();
    runClock();
  }

  /* No limit, no countdown. Showing twenty seconds because twenty is the
     usual answer would be a clock that disagrees with the scoring, and a
     teacher would have no way of knowing. The reveal button is always
     there, so a missing clock costs nothing but a guess. */
  function runClock() {
    clearInterval(view.tick);
    if (!view.limitMs) {
      var dash = W.$('#gl-clock', view.el);
      if (dash) dash.textContent = '·';
      return;
    }
    var from = view.askedAt || Date.now();
    view.endsAt = from + view.limitMs;
    view.tick = setInterval(function () {
      if (!view || view.stage !== 'asking') { clearInterval(view.tick); return; }
      var left = Math.max(0, Math.ceil((view.endsAt - Date.now()) / 1000));
      var c = W.$('#gl-clock', view.el);
      if (c) c.textContent = left;
      if (left <= 0) doReveal();
    }, 250);
  }

  function doReveal() {
    if (!view || view.stage !== 'asking') return;
    clearInterval(view.tick);
    try { view.reveal = rules() ? rules().reveal(view.session) : null; } catch (e) { view.reveal = null; }
    view.stage = 'reveal';
    cloud('setStatus', view.sessionId, 'reveal', view.session.index);
    markAnswers(view.session.index);
    saveStandings();
    draw();
  }

  /* Written per question, at the reveal, because that is when the question
     is closed and the marks for it are final. */
  function markAnswers(index) {
    if (!view.sessionId) return;
    var marks = marksFor(index);
    if (marks.length) cloud('markAnswers', view.sessionId, index, marks);
  }

  /* Written at every reveal rather than once at the end. A teacher who
     closes the tab on question seven should lose questions eight to ten,
     not the whole lesson. */
  function saveStandings() {
    if (!view.sessionId || !view.session || !rules()) return;
    var rows = [];
    try { rows = rules().standings(view.session) || []; } catch (e) { rows = []; }
    if (rows.length) cloud('saveStandings', view.sessionId, rows);
  }

  function doNext() {
    if (!view) return;
    var s;
    try { s = rules() ? rules().next(view.session) : null; } catch (e) { s = null; }
    if (!s || s.status === 'ended') {
      view.stage = 'ended';
      cloud('setStatus', view.sessionId, 'ended', view.session ? view.session.index : 0);
      /* One more, so the ended session carries the final numbers even if a
         last answer landed after the reveal was written. */
      saveStandings();
      draw();
      try { W.confetti({ count: 90 }); } catch (e) {}
      return;
    }
    cloud('setStatus', view.sessionId, 'asking', view.session.index);
    askQuestion();
  }

  function closeRoom() {
    clearInterval(view.tick);
    if (view.unwatch) { try { view.unwatch(); } catch (e) {} view.unwatch = null; }
    if (view.sessionId) cloud('close', view.sessionId);
    view.sessionId = '';
    view.code = '';
    view.joined = [];
    view.session = null;
    view.board = null;
    view.marks = {};
    view.presenceKnown = false;
  }

  global.GeoLiveTeacher = {
    mount: mount,
    unmount: unmount,
    /* Read only, so a test can see which screen is up and hand answers
       to the same session the rules are running on. */
    get stage() { return view ? view.stage : ''; },
    get session() { return view ? view.session : null; }
  };
})(window);
