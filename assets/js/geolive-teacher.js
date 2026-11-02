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
  ['check', 'info', 'users', 'trophy', 'fire', 'globe', 'x', 'grid', 'arrowR'].forEach(function (name) {
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
  var lastOpts = null;

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
    opts = opts || {};

    /* The teacher page redraws itself when the class syncs or its settings
       reload, and each redraw hands over a brand new container. A room that
       is open, or a game being played, carries on in the new container
       rather than being thrown away: that used to drop a teacher back to
       the setup screen in the middle of a question, with the class still
       waiting on their phones. */
    if (view && view.sessionId && view.classId === (opts.classId || '')) {
      if (view.el !== el) {
        var old = view.el;
        view.el = el;
        if (old && old.__glSetup) bindSetup(el);
      }
      if (el.className.indexOf('gl--teacher') < 0) el.className = (el.className + ' gl gl--teacher').trim();
      view.drawn = null;
      draw();
      return view;
    }

    unmount(true);
    lastOpts = opts;
    view = {
      el: el,
      classId: opts.classId || '',
      roster: normaliseRoster(opts.roster, opts.members),
      chosen: {},
      stage: 'start',
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
    loadLast();

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

    /* Setup clicks are handled by the container, bound once per container.
       Binding per draw stacked a second listener on every button each time
       the country search ran, so one click opened two rooms. */
    bindSetup(el);

    draw();

    /* Asked last, so the first screen is already up while this answers.
       If the tables are not there yet the teacher finds out before they
       have picked anybody, not after. */
    var asked = Date.now();
    cloud('available').then(function (ok) {
      if (!view || !/^(start|players)$/.test(view.stage)) return;
      view.whyUnavailable = ok ? null : failureSince(asked);
      /* Anything that is not a clear yes counts as no: false, a missing
         module, or a call that threw and came back null. Saying the room
         is ready when it is not is the one answer a teacher cannot use. */
      view.online = !!ok;
      /* Said up front, with the reason, rather than discovered at Open. */
      if (!ok) { view.problem = diagnosis(); draw(); }
    });
    return view;
  }

  function bindSetup(el) {
    if (el.__glSetup) {
      el.removeEventListener('click', el.__glSetup.click);
      el.removeEventListener('input', el.__glSetup.input);
      el.removeEventListener('keydown', el.__glSetup.key);
    }
    el.__glSetup = { click: onSetupClick, input: onSetupInput, key: onSetupKey };
    el.addEventListener('click', onSetupClick);
    el.addEventListener('input', onSetupInput);
    el.addEventListener('keydown', onSetupKey);
  }

  /* After Done, straight back to the start screen for the same class, so
     a second game is one click away rather than a trip out of the tab. */
  function restart(el) {
    if (!el || !lastOpts) return;
    mount(el, lastOpts);
  }

  /* The full screen button swaps its own icon, and leaving full screen
     with Escape has to swap it back. */
  function onFsChange() {
    if (view && /^(lobby|asking|reveal|ended)$/.test(view.stage)) draw();
  }
  document.addEventListener('fullscreenchange', onFsChange);

  /* Leaving the GeoLive tab does not end a game in progress: the class is
     still playing, and coming back to the tab picks it up again. Only Done,
     Cancel, or a mount for a different class ends it for real. */
  function unmount(force) {
    if (!view) return;
    if (!force && view.sessionId && view.stage !== 'ended') return;
    try { if (document.fullscreenElement === view.el) document.exitFullscreen(); } catch (e) {}
    if (view.unwatch) { try { view.unwatch(); } catch (e) {} }
    clearInterval(view.tick);
    view = null;
  }

  /* ============================== drawing =========================== */

  function draw() {
    if (!view) return;
    var body =
      view.stage === 'start' ? startScreen() :
      view.stage === 'players' ? setupScreen() :
      view.stage === 'questions' ? setupScreen() :
      view.stage === 'lobby' ? lobbyScreen() :
      view.stage === 'asking' ? askingScreen() :
      view.stage === 'reveal' ? revealScreen() :
      view.stage === 'ended' ? endedScreen() : '';
    /* The whole game is one stage, setup included: the projector is
       usually already on while the teacher sets up, and a white form that
       turns into a dark game halfway through reads as two products. */
    view.el.classList.add('gl--stage');
    view.el.setAttribute('data-stage', view.stage);
    /* Entrances play once per screen, not on every redraw of it. */
    var key = (view.stage === 'questions' ? 'players' : view.stage) + ':' + (view.session ? view.session.index : '');
    view.el.toggleAttribute('data-fresh', view.drawn !== key);
    view.drawn = key;
    view.el.innerHTML = body;
    placeBoard();
    wire();
    if (view.stage === 'players' || view.stage === 'questions') paintMap();
    var Q = global.GeoLiveQuestions;
    if (Q && Q.paintPictures) { try { Q.paintPictures(view.el); } catch (e) {} }
  }

  /* Same shapes as the phones, from the one place both screens ask. */
  function glyph(i) {
    var Q = global.GeoLiveQuestions;
    if (Q && Q.glyph) { try { return Q.glyph(i); } catch (e) {} }
    return String.fromCharCode(65 + i);
  }

  function picture(q) {
    var Q = global.GeoLiveQuestions;
    if (!q || !Q || !Q.picture) return '';
    try { return Q.picture(q); } catch (e) { return ''; }
  }

  /* A projector is driven from a laptop whose browser chrome eats a fifth
     of the wall. One button takes the stage full screen, and the same
     button brings it back. */
  function fsButton() {
    if (!document.fullscreenEnabled) return '';
    var on = document.fullscreenElement === view.el;
    return '<button class="gl-fs" id="gl-fs" type="button" title="' + (on ? 'Exit full screen' : 'Full screen') +
      '" aria-label="' + (on ? 'Exit full screen' : 'Full screen for the projector') + '">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      (on ? '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>' : '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>') +
      '</svg></button>';
  }

  function toggleFs() {
    if (!view) return;
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else if (view.el.requestFullscreen) view.el.requestFullscreen();
    } catch (e) { /* the browser said no; the panel still works */ }
  }

  function brand() {
    return '<div class="gl-brand"><span class="gl-brand__globe">' + I.globe + '</span>' +
      '<span class="gl-brand__word">Geo<b>Live</b></span></div>';
  }

  /* ============================== setup ============================= */
  /* One screen, not two. Who plays and what gets asked are decided
     together, side by side, and the teacher can see both before the class
     sees anything. The old two-step version made a teacher page back to
     check who they had left out, and its 213-button country list was a
     wall of names with no geography in it, in a geography app.

     Everything here is patched in place after the first draw rather than
     redrawn, so the map, the scroll position of the roster and the text
     in the search box all stay put while the teacher clicks. Clicks are
     handled by one listener on the container (see onSetupClick), bound
     once at mount: re-binding per draw is how a single click once opened
     two rooms. */

  var SET_ICONS = {
    capitals: '🏛️',
    'countries-from-capitals': '📍',
    shapes: '🗺️',
    mixed: '🎲',
    custom: '🌍'
  };

  function countries() { return (global.GeoData && global.GeoData.countries) || []; }
  function regions() { return (global.GeoData && global.GeoData.regions) || []; }

  /* ---------------------------- the start ------------------------- */
  /* What a teacher sees first: one button. The whole class, the game they
     played last time (or ten capitals at twenty seconds), straight to the
     join screen. Choosing anything else is one link away and optional. */

  var LAST_KEY = 'gl:last';

  function loadLast() {
    var saved = null;
    try { saved = JSON.parse(global.localStorage.getItem(LAST_KEY) || 'null'); } catch (e) {}
    if (!saved) return;
    var known = saved.setId === 'custom' ||
      view.sets.some(function (x) { return x.id === saved.setId; });
    if (known && !(saved.setId === 'custom' && !(saved.picked || []).length)) view.setId = saved.setId;
    if ([5, 10, 15, 20].indexOf(saved.count) >= 0) view.count = saved.count;
    if (SECOND_CHOICES.indexOf(saved.seconds) >= 0) view.seconds = saved.seconds;
    (saved.picked || []).forEach(function (k) { view.picked[k] = true; });
  }

  function saveLast() {
    try {
      global.localStorage.setItem(LAST_KEY, JSON.stringify({
        setId: view.setId, count: view.count, seconds: view.seconds,
        picked: view.setId === 'custom' ? Object.keys(view.picked) : []
      }));
    } catch (e) { /* a private window forgets; nothing breaks */ }
  }

  function startScreen() {
    var n = chosenPlayers().length;
    var faces = chosenPlayers().slice(0, 6);
    return '<div class="gl-stagebar">' + brand() + '</div>' +
      problemHtml() +
      '<div class="gl-start">' +
        '<h2 class="gl-start__h">Play a live quiz<br>with the whole class</h2>' +
        '<p class="gl-start__sub">Everyone answers on their own device. You run it from this screen.</p>' +
        '<div class="gl-start__card">' +
          '<span class="gl-start__ic" aria-hidden="true">' + (SET_ICONS[view.setId] || '🌍') + '</span>' +
          '<span class="gl-start__what"><b>' + esc(gameTitle()) + '</b>' +
            '<small>' + view.count + ' questions · ' + view.seconds + ' seconds each</small></span>' +
          '<span class="gl-start__who">' +
            (faces.length
              ? '<span class="gl-faces">' + faces.map(function (p, i) {
                  return '<i style="--gl-n:' + i + '">' + esc(initials(p.name)) + '</i>';
                }).join('') + '</span>' +
                '<small>' + (n === playable().length ? 'Whole class · ' : '') + n + (n === 1 ? ' player' : ' players') + '</small>'
              : '<small>Anyone in the class</small>') +
          '</span>' +
        '</div>' +
        '<button type="button" class="btn btn--accent btn--lg gl-cta gl-cta--xl" id="gl-open" data-act="open"' +
          (canOpen() ? '' : ' disabled') + '>Start a game ' + I.arrowR + '</button>' +
        '<button type="button" class="gl-textbtn" data-act="customize">Change the questions or who plays</button>' +
        '<ol class="gl-how">' +
          '<li><b>1</b><span>Press <em>Start a game</em></span></li>' +
          '<li><b>2</b><span>Students open your class in LearnGeo. The game pops up on its own.</span></li>' +
          '<li><b>3</b><span>Press <em>Go</em> when everyone is in</span></li>' +
        '</ol>' +
      '</div>';
  }

  function gameTitle() {
    if (view.setId === 'custom') return 'Your ' + pickedCount() + ' countries';
    var s = view.sets.filter(function (x) { return x.id === view.setId; })[0];
    return s ? s.label : 'Live quiz';
  }

  function setupScreen() {
    var custom = view.setId === 'custom';
    return '<div class="gl-stagebar">' + brand() +
        '<span class="gl-stagebar__note">New live game</span></div>' +
      problemHtml() +
      '<div class="gl-setup">' +
        '<section class="gl-panel gl-panel--game">' +
          '<h3 class="gl-panel__h">What gets asked</h3>' +
          '<div class="gl-modes">' +
            view.sets.map(function (s) {
              return modeCard(s.id, s.label, s.note || '');
            }).join('') +
            modeCard('custom', 'Pick on the map', 'Exactly what the class has covered') +
          '</div>' +
          (custom ? pickerHtml() : '') +
          '<div class="gl-knobs">' +
            '<div class="gl-knob"><span class="gl-knob__l">Questions</span>' +
              '<div class="gl-seg" role="radiogroup" aria-label="How many questions">' +
                [5, 10, 15, 20].map(function (n) {
                  return segBtn('data-count', n, n, view.count === n);
                }).join('') +
              '</div></div>' +
            '<div class="gl-knob"><span class="gl-knob__l">Time to answer</span>' +
              '<div class="gl-seg" role="radiogroup" aria-label="How long to answer">' +
                SECOND_CHOICES.map(function (n) {
                  return segBtn('data-seconds', n, n + 's', view.seconds === n);
                }).join('') +
              '</div></div>' +
          '</div>' +
        '</section>' +
        '<section class="gl-panel gl-panel--who">' +
          '<div class="gl-panel__bar">' +
            '<h3 class="gl-panel__h">Who is playing</h3>' +
            (view.roster.length
              ? '<span class="gl-panel__acts">' +
                  '<button type="button" class="gl-link" data-act="all">All</button>' +
                  '<button type="button" class="gl-link" data-act="none">None</button>' +
                '</span>'
              : '') +
          '</div>' +
          rosterHtml() +
        '</section>' +
      '</div>' +
      '<div class="gl-setup__foot">' +
        '<button type="button" class="btn btn--ghost" data-act="back">Back</button>' +
        '<p class="gl-summary" id="gl-summary">' + summaryHtml() + '</p>' +
        '<button type="button" class="btn btn--accent btn--lg gl-cta" id="gl-open" data-act="open"' +
          (canOpen() ? '' : ' disabled') + '>Open the room ' + I.arrowR + '</button>' +
      '</div>';
  }

  function modeCard(id, label, note) {
    var on = view.setId === id;
    var extra = id === 'custom'
      ? '<span class="gl-mode__n"' + (pickedCount() ? '' : ' hidden') + '>' + pickedCount() + ' picked</span>' : '';
    return '<button type="button" class="gl-mode' + (on ? ' is-on' : '') + '" data-set="' + esc(id) + '"' +
        ' aria-pressed="' + on + '">' +
      '<span class="gl-mode__ic" aria-hidden="true">' + (SET_ICONS[id] || '❓') + '</span>' +
      '<span class="gl-mode__t"><b>' + esc(label) + '</b><small>' + esc(note) + '</small></span>' +
      extra +
    '</button>';
  }

  function segBtn(attr, value, label, on) {
    return '<button type="button" role="radio" aria-checked="' + on + '" class="gl-seg__b' +
      (on ? ' is-on' : '') + '" ' + attr + '="' + value + '">' + esc(label) + '</button>';
  }

  /* -------------------------- the roster -------------------------- */

  function rosterHtml() {
    if (!view.roster.length) {
      return '<div class="gl-none">' + I.users +
        '<b>No students on the class list yet</b>' +
        '<span>Open a room anyway. Anyone in the class can join with the code.</span></div>';
    }
    var able = view.roster.filter(function (p) { return p.canPlay; });
    var out = view.roster.filter(function (p) { return !p.canPlay; });
    return '<p class="gl-panel__count" id="gl-picked">' + countLine() + '</p>' +
      '<div class="gl-roster">' +
        able.map(function (p) {
          var on = !!view.chosen[p.key];
          return '<button type="button" class="gl-who' + (on ? ' is-on' : '') + '" data-pick="' + esc(p.key) + '"' +
              ' role="switch" aria-checked="' + on + '">' +
            '<span class="gl-who__av">' + esc(initials(p.name)) + '</span>' +
            '<span class="gl-who__n">' + esc(p.name) + '</span>' +
            '<span class="gl-who__sw" aria-hidden="true"></span>' +
          '</button>';
        }).join('') +
        /* Shown, not hidden. A teacher who added nine names and sees six
           thinks the app lost three. */
        (out.length
          ? '<p class="gl-roster__sep">Not signed in yet, so they cannot play</p>' +
            out.map(function (p) {
              return '<span class="gl-who is-out">' +
                '<span class="gl-who__av">' + esc(initials(p.name)) + '</span>' +
                '<span class="gl-who__n">' + esc(p.name) + '</span></span>';
            }).join('')
          : '') +
      '</div>';
  }

  function countLine() {
    var n = chosenPlayers().length, all = playable().length;
    return '<b>' + n + '</b> of ' + all + ' playing';
  }

  /* --------------------------- the picker -------------------------- */
  /* The map is the picker. Click a country to add it, again to take it
     out; the search finds the ones too small to click; a region adds a
     whole continent. What is picked is listed underneath, each with a way
     to remove it, so nobody has to find Andorra on the map twice. */

  function pickedCount() { return Object.keys(view.picked).length; }

  function pickerHtml() {
    return '<div class="gl-pick">' +
      '<div class="gl-pick__tools">' +
        '<div class="gl-search">' +
          '<input class="gl-search__in" id="gl-search" type="search" placeholder="Find a country or capital" ' +
            'spellcheck="false" autocomplete="off" aria-label="Find a country">' +
          '<div class="gl-search__list" id="gl-suggest" hidden></div>' +
        '</div>' +
        '<div class="gl-regions">' +
          regions().map(function (r) {
            return '<button type="button" class="gl-chip-b" data-region="' + esc(r) + '">+ ' + esc(r) + '</button>';
          }).join('') +
        '</div>' +
      '</div>' +
      '<div class="gl-map" id="gl-map" aria-label="World map. Click a country to add it to the game."></div>' +
      '<div class="gl-picked" id="gl-picked-list">' + pickedChips() + '</div>' +
    '</div>';
  }

  function pickedChips() {
    var keys = Object.keys(view.picked);
    if (!keys.length) {
      return '<p class="gl-picked__empty">Click countries on the map, search, or add a whole region. ' +
        'Pick at least four, so every question has four answers.</p>';
    }
    return '<div class="gl-picked__bar"><b>' + keys.length + '</b> picked' +
        (keys.length < 4 ? ' · pick ' + (4 - keys.length) + ' more' : '') +
        '<button type="button" class="gl-link" data-act="clear">Clear all</button></div>' +
      '<div class="gl-picked__chips">' +
        keys.sort().map(function (k) {
          return '<button type="button" class="gl-tag" data-country="' + esc(k) + '" title="Remove ' + esc(k) + '">' +
            esc(k) + '<span aria-hidden="true">×</span></button>';
        }).join('') +
      '</div>';
  }

  function paintMap() {
    var host = W.$('#gl-map', view.el);
    var WM = global.WorldMap;
    if (!host || !WM) return;
    host.classList.add('is-loading');
    Promise.resolve(WM.load ? WM.load() : null).then(function () {
      if (!view || !host.isConnected) return;
      host.innerHTML = WM.svg({ mode: 'pale', label: 'World map' });
      host.classList.remove('is-loading');
      markMap();
    })['catch'](function () { host.hidden = true; });
  }

  function keyOfName(name) {
    var c = countries().filter(function (x) { return x.name === name; })[0];
    return c ? countryKey(c) : name;
  }

  function markMap() {
    var host = W.$('#gl-map', view.el);
    if (!host) return;
    W.$$('[data-c]', host).forEach(function (p) {
      p.classList.toggle('is-picked', !!view.picked[keyOfName(p.getAttribute('data-c'))]);
    });
  }

  function suggest(text) {
    var box = W.$('#gl-suggest', view.el);
    if (!box) return;
    var needle = String(text || '').trim().toLowerCase();
    if (!needle) { box.hidden = true; box.innerHTML = ''; return; }
    var hits = countries().filter(function (c) {
      return c.name.toLowerCase().indexOf(needle) >= 0 ||
        (c.capital || '').toLowerCase().indexOf(needle) >= 0;
    }).slice(0, 8);
    box.innerHTML = hits.length
      ? hits.map(function (c) {
          var k = countryKey(c), on = !!view.picked[k];
          return '<button type="button" class="gl-sug' + (on ? ' is-on' : '') + '" data-country="' + esc(k) + '">' +
            '<b>' + esc(c.name) + '</b><small>' + esc(c.capital || '') + ' · ' + esc(c.region || '') + '</small>' +
            '<span>' + (on ? '✓ Added' : '+ Add') + '</span></button>';
        }).join('')
      : '<p class="gl-sug__none">Nothing matches that.</p>';
    box.hidden = false;
  }

  function togglePick(key, force) {
    if (!key) return;
    var on = force === undefined ? !view.picked[key] : force;
    if (on) view.picked[key] = true; else delete view.picked[key];
    patchSetup();
  }

  /* --------------------------- summary ---------------------------- */

  function setLabel() {
    if (view.setId === 'custom') return 'questions on ' + pickedCount() + ' countries';
    var s = view.sets.filter(function (x) { return x.id === view.setId; })[0];
    return s ? s.label.toLowerCase() + ' questions' : 'questions';
  }

  function summaryHtml() {
    var n = chosenPlayers().length;
    return '<b>' + view.count + '</b> ' + esc(setLabel()) + ' · <b>' + view.seconds + 's</b> each · ' +
      (n ? '<b>' + n + '</b> ' + (n === 1 ? 'player' : 'players')
         : 'anyone in the class can join');
  }

  function canOpen() {
    return !(view.setId === 'custom' && pickedCount() < 4) && !view.opening;
  }

  /* Every count and state that depends on a click, rewritten in place. */
  function patchSetup() {
    if (!view || !/^(start|players|questions)$/.test(view.stage)) return;
    var el = view.el;
    W.$$('[data-pick]', el).forEach(function (b) {
      var on = !!view.chosen[b.getAttribute('data-pick')];
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    var tag = W.$('#gl-picked', el);
    if (tag) tag.innerHTML = countLine();
    var list = W.$('#gl-picked-list', el);
    if (list) list.innerHTML = pickedChips();
    var card = W.$('[data-set="custom"] .gl-mode__n', el);
    if (card) { card.textContent = pickedCount() + ' picked'; card.hidden = !pickedCount(); }
    var sum = W.$('#gl-summary', el);
    if (sum) sum.innerHTML = summaryHtml();
    var open = W.$('#gl-open', el);
    if (open) open.disabled = !canOpen();
    var search = W.$('#gl-search', el);
    if (search && search.value) suggest(search.value);
    markMap();
  }

  /* --------------------------- problems --------------------------- */
  /* Why GeoLive cannot run, in words a teacher can act on, read from
     GeoLiveCloud's own diagnosis rather than guessed. "Try again in a
     moment" is only honest for a dropped connection; a database that
     refuses will refuse again in a moment too, and saying otherwise sends
     a teacher round the same loop in front of a class. */
  function diagnosis() {
    var C = global.GeoLiveCloud;
    if (!C) return { head: 'The live quiz did not load', body: 'Reload the page and try again.' };
    if (!view.classId) return {
      head: 'This class is not online yet',
      body: 'A live game runs through your account, so the class has to be put online first. ' +
        'Use the class code button at the top of the class, then come back.' };
    var st = typeof C.status === 'function' ? C.status() : '';
    var f = typeof C.lastFault === 'function' ? C.lastFault() : null;
    var said = f && (f.message || f.code)
      ? (f.code ? f.code + ': ' : '') + String(f.message || '').slice(0, 160) : '';
    if (!said && lastFailure && lastFailure.detail) said = lastFailure.detail;
    var tail = said ? ' The server said: ' + said : '';
    if (st === 'off') return { head: 'Live quizzes are switched off', body: 'They have been turned off in this app.' };
    if (st === 'absent') return {
      head: 'The live quiz is not set up in the database',
      body: 'Its tables were not found, so no room can be made. Whoever looks after the database needs to ' +
        'run the GeoLive setup in Supabase. Nothing on this screen can fix it.' + tail };
    if (st === 'blocked') return {
      head: 'The database refused to open the room',
      body: 'This is a database permission problem, not your connection, and trying again will not change it. ' +
        'Pass this on to whoever looks after the database.' + tail };
    if (st === 'offline') return {
      head: 'Could not reach the server',
      body: 'Check the connection, then try again.' + tail };
    return {
      head: 'The room did not open',
      body: (said ? 'The server said: ' + said : 'No reason came back from the server.') +
        ' Try again, and if it happens twice, pass the message on.' };
  }

  function problemHtml() {
    if (!view.problem) return '';
    var d = view.problem;
    return '<div class="gl-problem" role="alert">' +
      '<span class="gl-problem__ic">' + I.info + '</span>' +
      '<div><b>' + esc(d.head) + '</b><p>' + esc(d.body) + '</p></div>' +
      '<button type="button" class="btn btn--ghost" data-act="retry">Try again</button>' +
    '</div>';
  }

  function retry() {
    var C = global.GeoLiveCloud;
    var p = C && typeof C.recheck === 'function' ? C.recheck() : Promise.resolve(false);
    var b = W.$('[data-act="retry"]', view.el);
    if (b) { b.disabled = true; b.textContent = 'Checking…'; }
    Promise.resolve(p).then(function (ok) {
      if (!view) return;
      view.online = !!ok;
      view.problem = ok ? null : diagnosis();
      draw();
      if (ok) W.toast('Live quiz is ready', 'You can open the room now.', I.check, 2500);
    });
  }

  /* ---------------------------- clicks ---------------------------- */

  function onSetupClick(ev) {
    if (!view || !/^(start|players|questions)$/.test(view.stage)) return;
    var t = ev.target;
    if (!t || !t.closest) return;

    /* the suggestions close on any click outside the search */
    if (!t.closest('.gl-search')) {
      var list = W.$('#gl-suggest', view.el);
      if (list && !list.hidden) { list.hidden = true; }
    }

    var b = t.closest('[data-pick]');
    if (b) { var k = b.getAttribute('data-pick'); view.chosen[k] = !view.chosen[k]; patchSetup(); return; }

    b = t.closest('[data-country]');
    if (b) {
      togglePick(b.getAttribute('data-country'));
      return;
    }

    var land = t.closest('#gl-map [data-c]');
    if (land) { togglePick(keyOfName(land.getAttribute('data-c'))); return; }

    b = t.closest('[data-set]');
    if (b) {
      var id = b.getAttribute('data-set');
      if (id !== view.setId) { view.setId = id; draw(); }
      return;
    }
    b = t.closest('[data-count]');
    if (b) { view.count = Number(b.getAttribute('data-count')); patchSeg('data-count', view.count); return; }
    b = t.closest('[data-seconds]');
    if (b) { view.seconds = Number(b.getAttribute('data-seconds')); patchSeg('data-seconds', view.seconds); return; }

    b = t.closest('[data-region]');
    if (b) {
      var r = b.getAttribute('data-region');
      countries().forEach(function (c) { if (c.region === r) view.picked[countryKey(c)] = true; });
      patchSetup();
      return;
    }

    b = t.closest('[data-act]');
    if (!b || b.disabled) return;
    var act = b.getAttribute('data-act');
    if (act === 'all') { playable().forEach(function (p) { view.chosen[p.key] = true; }); patchSetup(); }
    else if (act === 'none') { view.chosen = {}; patchSetup(); }
    else if (act === 'clear') { view.picked = {}; patchSetup(); }
    else if (act === 'retry') retry();
    else if (act === 'open') openRoom();
    else if (act === 'customize') { view.stage = 'players'; draw(); }
    else if (act === 'back') { view.stage = 'start'; draw(); }
  }

  function patchSeg(attr, value) {
    W.$$('[' + attr + ']', view.el).forEach(function (b) {
      var on = Number(b.getAttribute(attr)) === value;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    var sum = W.$('#gl-summary', view.el);
    if (sum) sum.innerHTML = summaryHtml();
  }

  function onSetupInput(ev) {
    if (!view || !ev.target || ev.target.id !== 'gl-search') return;
    suggest(ev.target.value);
  }

  function onSetupKey(ev) {
    if (!view || !ev.target || ev.target.id !== 'gl-search') return;
    if (ev.key === 'Escape') { ev.target.value = ''; suggest(''); }
    if (ev.key === 'Enter') {
      ev.preventDefault();
      var first = W.$('#gl-suggest [data-country]', view.el);
      if (first) togglePick(first.getAttribute('data-country'), true);
      ev.target.value = '';
      suggest('');
    }
  }

  /* Settled: there is no ISO3 in this project, so a question's code
     carries the country name, which is what GeoMap.hasShape() keys on.
     The iso3 field is read first anyway, so the day one is added this
     upgrades without being touched. */
  function countryKey(c) { return c.iso3 || c.code || c.name; }

  /* ----------------------------- 3. lobby --------------------------- */
  function lobbyScreen() {
    var picked = chosenPlayers();
    var code = String(view.code || '······');
    return '<div class="gl-stagebar">' + brand() + fsButton() + '</div>' +
      '<div class="gl-lobby">' +
        '<h2 class="gl-lobby__h">Open your class in <b>LearnGeo</b>. The game pops up by itself.</h2>' +
        '<p class="gl-lobby__how">Not on the list, or it did not pop up? Tap <b>GeoLive</b> and use this code</p>' +
        /* The letters sit in tiles of their own so an O and a 0 cannot run
           together at the back of the room. textContent is still the code. */
        '<div class="gl__code" id="gl-code" aria-label="Game code ' + esc(code.split('').join(' ')) + '">' +
          code.split('').map(function (ch, i) {
            return '<span style="--gl-n:' + i + '">' + esc(ch) + '</span>';
          }).join('') +
        '</div>' +
        '<div class="gl__sub gl__sub--mid">' + esc(view.questions.length) + ' questions · ' +
          (view.limitMs ? Math.round(view.limitMs / 1000) + ' seconds each · ' : '') +
          picked.length + ' invited</div>' +
        '<div class="gl__joined" id="gl-joined">' + joinedRows() + '</div>' +
      '</div>' +
      '<div class="gl__foot">' +
        '<button class="btn btn--ghost" id="gl-cancel">Cancel</button>' +
        '<button class="btn btn--accent btn--lg gl-cta" id="gl-start"' +
          (readyToStart() ? '' : ' disabled') + '>Go! Start the quiz ' + I.arrowR + '</button>' +
      '</div>';
  }

  /* Who is in, and who the room is still waiting on. The waiting half is
     the useful half: it is how a teacher knows to say a name out loud. */
  function joinedRows() {
    var known = presenceKnown();
    var here = known ? inRoom() : {};
    /* This list is rewritten on every snapshot, so a chip only pops the
       first time it lights up. Without that, every arrival made every
       chip already there bounce again. */
    var seen = view.popped || (view.popped = {});
    function chip(id, name, isIn) {
      var fresh = isIn && !seen[id];
      if (isIn) seen[id] = true;
      return '<span class="gl-joined' + (isIn ? ' is-in' : '') + (fresh ? ' is-new' : '') + '">' +
        '<span class="gl-joined__av">' + esc(initials(name)) + '</span>' + esc(name) + '</span>';
    }
    return chosenPlayers().map(function (p) {
      return chip(p.key, p.name, !!here[p.playerId || p.key]);
    }).join('') +
    (known ? strangers().map(function (j) {
      return chip('x:' + (j.id || j.name), j.name || 'Someone', true);
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
    var pic = picture(q);
    return '<div class="gl-live' + (pic ? ' has-pic' : '') + '">' +
      '<div class="gl-live__top">' +
        '<span class="gl-live__n">Question <b>' + (view.session.index + 1) + '</b> of ' + view.questions.length + '</span>' +
        fsButton() +
      '</div>' +
      '<div class="gl-live__mid">' +
        ringHtml() +
        '<div class="gl-live__ask">' +
          '<h2 class="gl-live__q">' + esc(q.prompt) + '</h2>' +
          pic +
        '</div>' +
        '<div class="gl-live__count"><b id="gl-answered-n">' + view.answered + '</b><span>answers</span></div>' +
      '</div>' +
      '<div class="gl-live__opts">' +
        (q.options || []).map(function (o, i) {
          return '<div class="gl-opt gl-opt--' + i + '" style="--gl-n:' + i + '">' +
            '<span class="gl-opt__key">' + glyph(i) + '</span>' +
            '<span class="gl-opt__t">' + esc(o) + '</span></div>';
        }).join('') +
      '</div>' +
      '<div class="gl-live__foot">' +
        '<span class="gl-progress" aria-hidden="true"><i id="gl-progress" style="width:' + answeredPct() + '%"></i></span>' +
        '<span class="gl-live__answered" id="gl-answered">' + answeredLine() + '</span>' +
        '<button class="btn btn--ghost" id="gl-reveal">Show the answer</button>' +
      '</div>' +
    '</div>';
  }

  /* The countdown as a ring. The sweep is a CSS animation started at a
     negative delay worked out from when the question opened, so a redraw
     or a reconnect lands it where it should be rather than back at full.
     The number in the middle is still the one runClock writes. */
  function ringHtml() {
    if (!view.limitMs) {
      return '<div class="gl-ring is-idle"><span class="gl-live__clock" id="gl-clock">·</span></div>';
    }
    var secs = view.limitMs / 1000;
    var gone = Math.max(0, Math.min(view.limitMs, Date.now() - (view.askedAt || Date.now()))) / 1000;
    var left = Math.max(0, Math.ceil(secs - gone));
    return '<div class="gl-ring' + (left <= 5 ? ' is-low' : '') + '" id="gl-ring" ' +
        'style="--gl-secs:' + secs + 's;--gl-delay:-' + gone.toFixed(2) + 's">' +
        '<svg viewBox="0 0 100 100" aria-hidden="true">' +
          '<circle class="gl-ring__track" cx="50" cy="50" r="44"/>' +
          '<circle class="gl-ring__arc" cx="50" cy="50" r="44" pathLength="100"/>' +
        '</svg>' +
        '<span class="gl-live__clock" id="gl-clock">' + left + '</span>' +
      '</div>';
  }

  function answeredPct() {
    var n = playingCount();
    return n ? Math.min(100, Math.round(view.answered / n * 100)) : 0;
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
    var opts = (q && q.options) || [];
    var total = 0, rightN = 0;
    opts.forEach(function (o) {
      var n = (r.counts && r.counts[o]) || 0;
      total += n;
      if (o === r.answer) rightN = n;
    });
    return '<div class="gl-live gl-live--reveal">' +
      '<div class="gl-live__top">' +
        '<span class="gl-live__n">Question <b>' + (view.session.index + 1) + '</b> of ' + view.questions.length + '</span>' +
        fsButton() +
      '</div>' +
      '<h2 class="gl-live__q gl-live__q--sm">' + esc(q ? q.prompt : '') + '</h2>' +
      '<div class="gl-live__opts">' +
        opts.map(function (o, i) {
          var n = (r.counts && r.counts[o]) || 0;
          var right = o === r.answer;
          /* How many chose it, as a share of everyone who answered. The bar
             behind each answer is that share, so the room can see at a
             glance where the class went. */
          var pct = total ? Math.round(n / total * 100) : 0;
          return '<div class="gl-opt gl-opt--' + i + (right ? ' is-right' : ' is-dim') + '" ' +
              'style="--gl-n:' + i + ';--gl-pct:' + pct + '">' +
            '<span class="gl-opt__key">' + (right ? I.check : glyph(i)) + '</span>' +
            '<span class="gl-opt__t">' + esc(o) + '</span>' +
            '<span class="gl-opt__n">' + n + '</span></div>';
        }).join('') +
      '</div>' +
      '<p class="gl-live__verdict">' +
        (total
          ? '<b>' + rightN + ' of ' + total + '</b> got it right'
          : 'Nobody answered that one') +
      '</p>' +
      '<h3 class="gl-board__h">' + I.trophy + ' Leaderboard</h3>' +
      boardSlot(5) +
      '<div class="gl-live__foot">' +
        '<button class="btn btn--accent btn--lg gl-cta" id="gl-next">' +
          (last ? 'See the winners ' + I.trophy : 'Next question ' + I.arrowR) + '</button>' +
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
      /* the place as an attribute too, so the top three can be told apart
         by the stylesheet: nth-child counts creation order, not rank */
      row.setAttribute('data-place', i + 1);
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
    var medals = ['🥇', '🥈', '🥉'];
    return '<div class="gl-stagebar">' + brand() + fsButton() + '</div>' +
      '<div class="gl-end">' +
      '<h2 class="gl__h gl__h--mid">' + (top[0] ? esc(top[0].name) + ' wins!' : 'Final standings') + '</h2>' +
      '<div class="gl-podium">' +
        order.map(function (idx) {
          var p = top[idx];
          if (!p) return '';
          return '<div class="gl-podium__col gl-podium__col--' + (idx + 1) + '">' +
            '<span class="gl-podium__who">' +
              (idx === 0 ? '<span class="gl-podium__crown" aria-hidden="true">👑</span>' : '') +
              '<span class="gl-podium__av">' + esc(initials(p.name)) + '</span>' +
              '<b class="gl-podium__n">' + esc(p.name) + '</b>' +
              '<span class="gl-podium__s">' + Number(p.score || 0).toLocaleString() + '</span>' +
            '</span>' +
            '<span class="gl-podium__block"><span class="gl-podium__medal" aria-hidden="true">' + medals[idx] + '</span>' +
              '<span class="gl-podium__pl">' + (idx + 1) + '</span></span>' +
          '</div>';
        }).join('') +
      '</div>' +
      (rows.length > PODIUM ? '<h3 class="gl-board__h">Everyone</h3>' + boardSlot(0) : '') +
      '<div class="gl__foot">' +
        '<button class="btn btn--accent btn--lg gl-cta" id="gl-done">Done</button>' +
      '</div>' +
    '</div>';
  }

  /* ============================== wiring ============================ */

  function wire() {
    var el = view.el;

    on('#gl-cancel', function () { closeRoom(); view.stage = 'start'; draw(); });
    on('#gl-start', startQuiz);
    on('#gl-reveal', doReveal);
    on('#gl-next', doNext);
    on('#gl-done', function () { closeRoom(); var el = view.el; unmount(true); restart(el); });
    on('#gl-fs', toggleFs);
  }

  function on(sel, fn) {
    var b = W.$(sel, view.el);
    if (b) b.addEventListener('click', fn);
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
    view.opening = true;
    var asked = Date.now();

    /* The chosen limit goes to the room, which clamps it and stores it.
       What comes back is what the game actually runs on. */
    cloud('open', view.classId, view.questions,
          players.map(function (p) { return p.playerId; }),
          view.seconds * 1000)
      .then(function (room) {
        if (!view) return;
        view.opening = false;
        if (!room || !room.code) {
          /* Said on the screen, with the actual reason, and left there until
             it is fixed. A toast that vanished after six seconds saying "try
             again in a moment" was wrong about half the causes. */
          var why = failureSince(asked);
          view.problem = diagnosis();
          if (why && why.detail && view.problem.body.indexOf(why.detail) < 0) {
            view.problem.body += ' (' + why.method + ': ' + why.detail + ')';
          }
          draw();
          return;
        }
        view.problem = null;
        saveLast();
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
      var big = W.$('#gl-answered-n', view.el);
      if (big) big.textContent = view.answered;
      var bar = W.$('#gl-progress', view.el);
      if (bar) bar.style.width = answeredPct() + '%';
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
      var ring = W.$('#gl-ring', view.el);
      if (ring) ring.classList.toggle('is-low', left <= 5);
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
      celebrate();
      return;
    }
    cloud('setStatus', view.sessionId, 'asking', view.session.index);
    askQuestion();
  }

  /* Three volleys from where the podium stands, a beat apart, rather than
     one burst from the middle of the window. */
  function celebrate() {
    var box = view && view.el && view.el.getBoundingClientRect ? view.el.getBoundingClientRect() : null;
    var shots = box
      ? [[box.left + box.width * .5, box.top + box.height * .42],
         [box.left + box.width * .3, box.top + box.height * .5],
         [box.left + box.width * .7, box.top + box.height * .5]]
      : [[undefined, undefined]];
    shots.forEach(function (at, i) {
      setTimeout(function () {
        try { W.confetti({ count: i ? 70 : 120, power: i ? 220 : 300, x: at[0], y: at[1] }); } catch (e) {}
      }, 250 + i * 380);
    });
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
    view.popped = {};
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
