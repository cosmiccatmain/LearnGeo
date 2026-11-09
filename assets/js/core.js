/* ------------------------------------------------------------------
   LearnGeo — core: icons, storage, economy, feedback effects
-------------------------------------------------------------------*/
(function (global) {
  'use strict';

  /* ============================== ICONS ============================= */
  function svg(path, extra) {
    return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"' +
      (extra || '') + '>' + path + '</svg>';
  }
  var Icons = {
    globe:  svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18"/>'),
    book:   svg('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>'),
    clip:   svg('<path d="M9 2h6a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1z"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12l2 2 4-4"/>'),
    cards:  svg('<rect x="2" y="6" width="14" height="14" rx="2"/><path d="M7 3h11a3 3 0 0 1 3 3v11"/>'),
    gear:   svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'),
    palette: svg('<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>'),
    logout: svg('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>'),
    gem:    svg('<path d="M6 3h12l4 6-10 12L2 9z"/><path d="M2 9h20M12 3 8 9l4 12 4-12-4-6"/>'),
    bolt:   svg('<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>'),
    fire:   svg('<path d="M12 2s4 4 4 8a4 4 0 0 1-8 0c0-1 .5-2 1-3-3 2-5 4.5-5 8a8 8 0 0 0 16 0c0-6-8-13-8-13z"/>'),
    check:  svg('<path d="m20 6-11 11-5-5"/>'),
    x:      svg('<path d="M18 6 6 18M6 6l12 12"/>'),
    flag:   svg('<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>'),
    arrowR: svg('<path d="M5 12h14M12 5l7 7-7 7"/>'),
    arrowL: svg('<path d="M19 12H5M12 19l-7-7 7-7"/>'),
    pin:    svg('<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>'),
    trophy: svg('<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M6 2h12v7a6 6 0 0 1-12 0z"/><path d="M9 21h6M12 15v6"/>'),
    target: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>'),
    clock:  svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    chart:  svg('<path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/>'),
    layers: svg('<path d="m12 2 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>'),
    shield: svg('<path d="M12 2 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6z"/><path d="m9 12 2 2 4-4"/>'),
    lock:   svg('<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>'),
    /* Small Premium crown for locked game cards / cosmetics (LEA-61). */
    crown:  svg('<path d="M3 17 4.5 8l4.2 3.2L12 5l3.3 6.2L19.5 8 21 17z"/><path d="M4 20h16"/>'),
    shop:   svg('<path d="M3 3h2l2.4 12.4a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L21 8H6"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/>'),
    user:   svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
    sparkle: svg('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.8 2.8M14.9 14.9l2.8 2.8M17.7 6.3l-2.8 2.8M9.1 14.9l-2.8 2.8"/>'),
    grid:   svg('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'),
    refresh: svg('<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/>'),
    volume: svg('<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a9 9 0 0 1 0 14"/>'),
    key:    svg('<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.5 12.5 8-8 3 3-2 2-2-2-2 2-2-2"/>'),
    info:   svg('<circle cx="12" cy="12" r="9"/><path d="M12 16v-5M12 8h.01"/>'),
    close:  svg('<path d="M18 6 6 18M6 6l12 12"/>'),
    users:  svg('<circle cx="9" cy="8" r="3.2"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 5.2a3.2 3.2 0 0 1 0 5.9"/><path d="M18 14.4a6.2 6.2 0 0 1 3.5 5.6"/>'),
    plus:   svg('<path d="M12 5v14M5 12h14"/>'),
    gamepad: svg('<path d="M6 11h4M8 9v4"/><path d="M15 12h.01M18 10h.01"/><path d="M17.3 5H6.7a4 4 0 0 0-4 3.6l-.7 6.6A2.6 2.6 0 0 0 4.6 18c.9 0 1.7-.5 2.2-1.2L8 15h8l1.2 1.8c.5.7 1.3 1.2 2.2 1.2a2.6 2.6 0 0 0 2.6-2.8l-.7-6.6A4 4 0 0 0 17.3 5z"/>'),
    pause:  svg('<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>'),
    play:   svg('<path d="M7 4v16l13-8z"/>'),
    inbox:  svg('<path d="M3 12h5l2 3h4l2-3h5"/><path d="M5 5h14l2 7v7H3v-7z"/>'),
    hex:    svg('<path d="M12 2.5 20 7v10l-8 4.5L4 17V7z"/><path d="M12 7.5 16 10v4l-4 2.5L8 14v-4z"/>'),
    /* Administrator sidebar */
    eye:    svg('<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>'),
    monitor: svg('<rect x="2" y="4" width="20" height="14" rx="2"/><path d="M8 21h8M12 18v3"/>'),
    message: svg('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'),
    list:   svg('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'),
    home:   svg('<path d="M3 11.5 12 4l9 7.5"/><path d="M6 10.5V20h12v-9.5"/>'),
    /* Development / lab previews (Administrator → Development) */
    flask:  svg('<path d="M9 3h6"/><path d="M10 3v6.5L4.8 18.2A2 2 0 0 0 6.5 21h11a2 2 0 0 0 1.7-2.8L14 9.5V3"/><path d="M7.5 14h9"/>'),
    /* Rivers & lakes in study filters */
    water:  svg('<path d="M12 2.5S7 9 7 13.2a5 5 0 0 0 10 0C17 9 12 2.5 12 2.5z"/>'),
    /* Road trip packs (LEA-78) */
    car:    svg('<path d="M5 13h14l-1.2-4.2A2 2 0 0 0 15.9 7H8.1a2 2 0 0 0-1.9 1.8z"/><path d="M5 13v4h2.2"/><path d="M16.8 17H19v-4"/><circle cx="7.5" cy="17" r="1.6"/><circle cx="16.5" cy="17" r="1.6"/><path d="M3 13h2M19 13h2"/>'),
    /* Duo-style road path nodes (LEA-85) */
    star:   svg('<path d="m12 3 2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 15.9 7.2 18l.9-5.4L4.2 8.7l5.4-.8z"/>'),
    chest:  svg('<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M3 13h18M12 8v12"/><path d="M8 8V6.5A2.5 2.5 0 0 1 10.5 4h3A2.5 2.5 0 0 1 16 6.5V8"/>')
  };

  /* The verified seal. Solid rather than line art, because it has to read as
     a stamp next to a name at 14px rather than as another button. Granted
     from the admin panel; nothing in the app awards it on its own. */
  var VERIFIED_SEAL =
    'M12 1L14.43 2.92L17.5 2.47L18.65 5.35L21.53 6.5L21.08 9.57L23 12L21.08 14.43' +
    'L21.53 17.5L18.65 18.65L17.5 21.53L14.43 21.08L12 23L9.57 21.08L6.5 21.53' +
    'L5.35 18.65L2.47 17.5L2.92 14.43L1 12L2.92 9.57L2.47 6.5L5.35 5.35L6.5 2.47L9.57 2.92Z';

  function verifiedMark(profile, size) {
    if (!profile || !profile.verified) return '';
    var s = size || 14;
    return '<svg class="verified" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" ' +
      'role="img" aria-label="Verified"><title>Verified</title>' +
      '<path fill="currentColor" d="' + VERIFIED_SEAL + '"/>' +
      '<path d="m8.2 12.4 2.5 2.5 5.1-5.4" fill="none" stroke="#fff" stroke-width="2.3" ' +
      'stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  /* ============================= STORAGE ============================
     Guests save under one key. A signed-in account keeps a local copy under
     its own key (so a shared computer never mixes two people's progress) and
     Cloud mirrors every save to Supabase. The active account is remembered
     so the right copy loads before the network has answered. */
  var GUEST_KEY = 'learngeo.save.v1';
  var ACTIVE_KEY = 'learngeo.activeUser';
  function userKey(uid) { return GUEST_KEY + '.u.' + uid; }
  var activeUid = (function () {
    try { return localStorage.getItem(ACTIVE_KEY) || null; } catch (e) { return null; }
  })();
  var KEY = activeUid ? userKey(activeUid) : GUEST_KEY;

  function defaultState() {
    return {
      profile: {
        displayName: 'Explorer',
        pronouns: '',
        about: '',
        avatar: 'globe',
        decoration: 'ring-slate',
        effect: 'none',
        nameplate: 'none',
        banner: 'plain',
        theme: 'default',
        status: 'online',
        /* Geo Dash cosmetics (Customise → Games). LEA-54. */
        dashTrail: 'dust',
        dashJumper: 'classic',
        /* More Games cosmetics (LEA-59). */
        chessBoard: 'classic',
        chessPieces: 'classic',
        snakeBody: 'meadow',
        matchBack: 'indigo',
        mazeRunner: 'cyan',
        duelAccent: 'brand',
        verified: false,       /* granted from the admin panel, never earned */
        badgeSlots: null       /* which badges show beside the name; null = auto */
      },
      badges: [],              /* badge ids held, earned or granted */
      adminAllow: [],          /* accounts UltraAdmin lets into the gems panel */
      enforcement: null,       /* admin-ledger.js owns the shape */
      flags: {},               /* one-off marks badges read, e.g. answered before 7am */
      owned: {
        avatars: ['globe', 'map', 'compass', 'mountain'],
        decorations: ['none', 'ring-slate', 'ring-sky', 'ring-chalk'],
        effects: ['none', 'spark'],
        nameplates: ['none', 'parchment'],
        banners: ['plain', 'meadow', 'chalkboard'],
        themes: ['default', 'sand'],
        trails: ['none', 'dust'],
        jumpers: ['classic', 'cobalt'],
        chessBoards: ['classic', 'parchment'],
        chessPieces: ['classic', 'ivory'],
        snakeBodies: ['meadow', 'cobalt'],
        matchBacks: ['indigo', 'chalk'],
        mazeRunners: ['cyan', 'cobalt'],
        duelAccents: ['brand', 'emerald']
      },
      economy: { diamonds: 150, xp: 0, level: 1 },
      streak: { current: 0, best: 0 },
      daily: { date: '', answered: 0, goal: 20, dayStreak: 0, lastDay: '', lastHit: '', hit: false },
      stats: { answered: 0, correct: 0, tests: 0, arcade: 0, perfectTests: 0 },
      mastery: {},          /* countryName -> { c: correctCount, w: wrongCount, box: 0..5 } */
      /* question type -> { c, w }. Mastery says which countries you know;
         this says which kind of question you are good at, which is what
         the Codex hexagon is drawn from. */
      skills: {},
      games: {},            /* per game: best scores and settings, e.g. games.dash */
      gamertag: '',         /* the name on the game leaderboards (game-boards.js) */
      deviceId: '',         /* random, made here; what a gamertag is tied to */
      boardSent: {},            /* last score sent to each game's board */
      achievements: [],
      /* LEA-74: per-challenge progress while a seasonal window is open.
         Keyed by achievement id → { year, answered, correct, streakBest, unlockedAt }. */
      seasonal: {},
      secrets: {},
      role: 'student',            /* 'student' | 'teacher' */
      roleChosen: false,          /* asked once, on first entry */
      /* Every class this teacher runs. state.classroom below is the one
         they are looking at, and is the same object as its entry here,
         so the cls() helpers all over the app keep working unchanged.
         assets/js/classes.js owns the list and the switching. */
      classes: [],
      activeClassId: '',
      classroom: {
        lid: '',                  /* local id, stable before the class is online */
        name: '', code: '',       /* teacher's own class */
        background: 'default',    /* which look, so several classes are tellable apart */
        cloudId: '',              /* the row id in Supabase once the class is live */
        roster: [],               /* names the teacher tracks locally */
        members: [],              /* students who joined with the code: { id, name } */
        results: [],              /* scores handed in, newest last */
        assignments: [],          /* assignments the teacher has written */
        posts: []                 /* announcements on the class stream */
      },
      inbox: [],                  /* assignments a student has loaded by code */
      stream: [],                 /* the teacher's announcements, as a student sees them */
      streamSeen: 0,              /* newest announcement this student has read */
      /* Every class this student has joined. state.enrolled below is the
         one they are looking at, and is the same object as its entry
         here. assets/js/classes.js owns the list. */
      enrolments: [],
      enrolled: null,             /* { code, className, name, classId?, background? } */
      customSets: [],             /* saved lists of hand-picked countries */
      /* Journey path (LEA-85; state key stays roadtrip). done/claimed/read
         are open maps keyed by unitId.nodeId. Mastery still seeds lesson
         completion on open — this only stores explicit path progress. */
      roadtrip: {
        unitId: 'africa-north',
        done: {},
        claimed: {},
        read: {},
        /* LEA-90 — totals from Journey awards (maps onto economy gains). */
        xpEarned: 0,
        gemsEarned: 0
      },
      settings: {
        sound: true,
        effects: true,
        timerDefault: true,
        showCapitalPins: true
      },
      /* savedAt: newest copy wins when device and account disagree.
         syncedAt: what the account said the last time this device synced. */
      meta: { savedAt: 0, syncedAt: '' }
    };
  }

  /* Chicken Wings (profile effect id `wings`) was removed. A save that
     still has it equipped, or still lists it under owned effects, falls
     back to no effect. Other cosmetics are left alone. */
  function retireChickenWings(s) {
    if (!s || typeof s !== 'object') return false;
    var changed = false;
    if (s.profile && s.profile.effect === 'wings') {
      s.profile.effect = 'none';
      changed = true;
    }
    var owned = s.owned && s.owned.effects;
    if (Array.isArray(owned)) {
      var at = owned.indexOf('wings');
      if (at !== -1) {
        owned.splice(at, 1);
        changed = true;
      }
    }
    return changed;
  }

  var state = merge(defaultState(), readSaved(KEY));
  var retiredOnLoad = retireChickenWings(state);

  function readSaved(key) {
    var raw = null;
    try { raw = localStorage.getItem(key); } catch (e) { return null; }
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      /* The defaults are about to be written over this, and it is the only
         copy there is. Keep the unreadable text under its own key. */
      try { localStorage.setItem(key + '.broken', raw); } catch (e2) {}
      return null;
    }
  }

  /* Lay a saved object over the defaults. Open-ended maps (mastery) and
     slots that start empty (enrolled) take whatever was saved wholesale;
     everything else merges key by key so new settings pick up defaults. */
  function merge(base, over) {
    if (!over || typeof over !== 'object' || Array.isArray(over)) return base;
    Object.keys(base).forEach(function (k) {
      var b = base[k], o = over[k];
      if (o === undefined || o === null) return;
      if (Array.isArray(b)) {
        if (Array.isArray(o)) base[k] = o;
      } else if (b === null || (typeof b === 'object' && !Object.keys(b).length)) {
        if (typeof o === 'object' && !Array.isArray(o)) base[k] = o;
      } else if (typeof b === 'object') {
        base[k] = merge(b, o);
      } else if (typeof o === typeof b) {
        base[k] = o;
      }
    });
    return base;
  }

  /* Swap the contents in place. Every module holds this same object as
     WW.state, so replacing the reference would strand them on a stale copy. */
  function replaceState(obj) {
    var fresh = merge(defaultState(), obj);
    var retired = retireChickenWings(fresh);
    Object.keys(state).forEach(function (k) { delete state[k]; });
    Object.keys(fresh).forEach(function (k) { state[k] = fresh[k]; });
    return retired;
  }

  var saveHooks = [];
  function onSave(fn) { saveHooks.push(fn); }

  /* Private browsing and a full storage box both make writing impossible.
     Say so the first time it happens: a toast on every save would be
     worse than the problem it is reporting. */
  var warnedNoStore = false;
  function putSave() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      if (!warnedNoStore) {
        warnedNoStore = true;
        try {
          toast('Progress can’t be saved in this browser',
            'Private browsing, or no room left. Nothing from this session will be here next time.',
            Icons.info, 6500);
        } catch (e2) {}
      }
      return false;
    }
  }

  function write() {
    state.meta.savedAt = Date.now();
    putSave();
    saveHooks.forEach(function (f) { try { f(state); } catch (e) {} });
  }

  var saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(write, 120);
  }
  function saveNow() { clearTimeout(saveTimer); write(); }
  function reset() { replaceState(null); saveNow(); }

  /* Write this device's copy only: no timestamp, no upload. */
  function saveLocal() {
    putSave();
  }

  /* Point storage at a signed-in account (uid) or back at the guest save. */
  function useAccount(uid) {
    clearTimeout(saveTimer);
    activeUid = uid || null;
    KEY = uid ? userKey(uid) : GUEST_KEY;
    try {
      if (uid) localStorage.setItem(ACTIVE_KEY, uid);
      else localStorage.removeItem(ACTIVE_KEY);
    } catch (e) {}
  }

  /* ============================= ECONOMY ============================ */
  function xpToNext(level) { return 80 + 40 * level; }

  function levelProgress() {
    return { have: state.economy.xp, need: xpToNext(state.economy.level) };
  }

  function dayKey(d) { return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function todayKey() { return dayKey(new Date()); }
  function yesterdayKey() {
    var d = new Date();
    d.setDate(d.getDate() - 1);
    return dayKey(d);
  }

  /* The day streak counts days the goal was actually hit, not days the app
     happened to be opened. Miss a day and it drops back to zero. */
  function touchDaily() {
    var t = todayKey();
    if (state.daily.date !== t) {
      state.daily.date = t;
      state.daily.answered = 0;
      state.daily.hit = false;
      state.daily.lastDay = t;
      if (state.daily.lastHit !== t && state.daily.lastHit !== yesterdayKey()) state.daily.dayStreak = 0;
      save();
    }
  }

  function markGoalHit() {
    var t = todayKey();
    if (state.daily.lastHit === yesterdayKey()) state.daily.dayStreak += 1;
    else if (state.daily.lastHit !== t) state.daily.dayStreak = 1;
    state.daily.lastHit = t;
  }

  /* Award for one answered question. Returns the gains for display. */
  function award(correct, opts) {
    opts = opts || {};
    touchDaily();
    state.stats.answered += 1;
    state.daily.answered += 1;
    /* the arcade keeps its own tally, for the achievement that reads it */
    if (opts.arcade) state.stats.arcade = (state.stats.arcade || 0) + 1;

    var gains = { xp: 0, gems: 0, level: false, combo: state.streak.current };

    if (correct) {
      state.stats.correct += 1;
      state.streak.current += 1;
      if (state.streak.current > state.streak.best) state.streak.best = state.streak.current;

      var mult = comboMultiplier(state.streak.current);
      gains.xp = Math.round((opts.baseXp || 10) * mult);
      gains.gems = Math.round((opts.baseGems || 4) * mult);
      gains.combo = state.streak.current;
      gains.mult = mult;

      state.economy.xp += gains.xp;
      state.economy.diamonds += gains.gems;

      while (state.economy.xp >= xpToNext(state.economy.level)) {
        state.economy.xp -= xpToNext(state.economy.level);
        state.economy.level += 1;
        gains.level = state.economy.level;
      }
    } else {
      state.streak.current = 0;
    }

    /* The type is passed where the mode has a question in hand. Where it
       does not — a game that only knows the country it asked about — the
       answer still counts everywhere else, it just does not land on one
       of the six skill axes. */
    if (opts.type) {
      var sk = state.skills[opts.type] || { c: 0, w: 0 };
      if (correct) sk.c += 1; else sk.w += 1;
      state.skills[opts.type] = sk;
    }

    if (opts.country) {
      var m = state.mastery[opts.country] || { c: 0, w: 0, box: 0 };
      if (correct) { m.c += 1; m.box = Math.min(5, m.box + 1); }
      else { m.w += 1; m.box = Math.max(0, m.box - 1); }
      state.mastery[opts.country] = m;
    }

    /* crossing the daily goal is the one moment worth a full-screen payout */
    if (!state.daily.hit && state.daily.answered >= state.daily.goal) {
      state.daily.hit = true;
      markGoalHit();
      gains.goalHit = true;
      gains.goalBonus = 60 + state.daily.dayStreak * 10;
      state.economy.diamonds += gains.goalBonus;
      /* fired here so every mode gets it without wiring the call four times */
      var b = gains.goalBonus, ds = state.daily.dayStreak;
      setTimeout(function () { celebrateGoal(b, ds); }, 520);
    }

    /* Seasonal challenge counters only move while the window is open. */
    noteSeasonalProgress(correct);

    save();
    return gains;
  }

  /* LEA-74 — bump in-window counters for active seasonal awards. */
  function noteSeasonalProgress(correct) {
    var Cos = global.Cosmetics;
    if (!Cos || !Cos.achievements) return;
    var now = new Date();
    if (!state.seasonal) state.seasonal = {};
    Cos.achievements.forEach(function (a) {
      if (!a.seasonal || !a.season) return;
      if (!Cos.seasonInWindow(a.season, now)) return;
      var year = Cos.seasonEditionYear(a.season, now);
      var slot = state.seasonal[a.id];
      if (!slot || slot.year !== year) {
        slot = { year: year, answered: 0, correct: 0, streakBest: 0, unlockedAt: '' };
        state.seasonal[a.id] = slot;
      }
      slot.answered = (slot.answered || 0) + 1;
      if (correct) {
        slot.correct = (slot.correct || 0) + 1;
        if (state.streak.current > (slot.streakBest || 0)) {
          slot.streakBest = state.streak.current;
        }
      }
    });
  }

  /* One unlock notice for the whole app.

     This was written out six times across four modes and had drifted into
     four different timings: 4000ms on 480+i*440, 4000 on 500+450, 4200 on
     700+500, and Learn's 4200 on 600+500, which was also the only one that
     played a sound or said what the achievement was for. So the same unlock
     felt different depending on which mode you happened to be in, and
     nobody chose that.

     Picked Learn's version, because it was the fullest rather than because
     it was first: the sound marks the moment, and the description is what
     tells a student what they actually did. The badge line is new, and is
     the point of the feature: an achievement is now something you can wear,
     and nothing else in the app would say so. */
  function announceAchievements(list) {
    (list || []).forEach(function (a, i) {
      setTimeout(function () {
        Sound.gem();
        var kind = a.seasonal ? 'Seasonal award' : 'Achievement';
        var tail = a.seasonal
          ? ('  ·  +' + a.reward + ' 💎  ·  drops into your wallet')
          : ('  ·  +' + a.reward + ' 💎  ·  badge unlocked');
        toast(kind + ': ' + a.name, a.desc + tail, Icons.trophy, 4200);
      }, 600 + i * 500);
    });
    return list || [];
  }

  function comboMultiplier(streak) {
    if (streak >= 25) return 3;
    if (streak >= 15) return 2.5;
    if (streak >= 10) return 2;
    if (streak >= 5)  return 1.5;
    if (streak >= 3)  return 1.25;
    return 1;
  }

  function addDiamonds(n) { state.economy.diamonds += n; save(); }
  function spend(n) {
    if (state.economy.diamonds < n) return false;
    state.economy.diamonds -= n; save(); return true;
  }

  function masteredCount() {
    return Object.keys(state.mastery).filter(function (k) {
      return state.mastery[k].box >= 4;
    }).length;
  }

  /* -------------------------- achievements ------------------------- */
  /* Badges ride the achievement beat rather than their own, so a badge and
     the achievement that implies it never land one answer apart. */
  function checkBadges() {
    if (!global.Badges) return [];
    global.Badges.noteAnswerTime();
    return global.Badges.evaluate();
  }

  function checkAchievements() {
    var Cos = global.Cosmetics;
    var C = Cos.achievements;
    var unlocked = [];
    var now = new Date();
    C.forEach(function (a) {
      if (state.achievements.indexOf(a.id) !== -1) return;
      if (test(a)) {
        state.achievements.push(a.id);
        state.economy.diamonds += a.reward;
        if (a.seasonal) {
          if (!state.seasonal) state.seasonal = {};
          var slot = state.seasonal[a.id] || {};
          slot.year = Cos.seasonEditionYear(a.season, now);
          slot.unlockedAt = now.toISOString();
          state.seasonal[a.id] = slot;
        }
        unlocked.push(a);
      }
    });
    if (unlocked.length) { save(); }

    /* Badges are checked and announced from here rather than from each mode,
       so all six existing callers pick them up without being edited, and a
       badge can never land a beat behind the achievement that implies it. */
    var freshBadges = checkBadges();
    if (freshBadges.length && global.Badges) global.Badges.announce(freshBadges);

    return unlocked;

    function test(a) {
      if (a.seasonal && a.season) return testSeasonal(a);
      var id = a.id;
      var s = state.stats;
      switch (id) {
        case 'first-steps':   return s.answered >= 1;
        case 'streak-10':     return state.streak.best >= 10;
        case 'streak-25':     return state.streak.best >= 25;
        case 'perfect-test':  return s.perfectTests >= 1;
        case 'test-5':        return s.tests >= 5;
        case 'cards-100':     return (s.arcade || 0) >= 150;
        case 'level-10':      return state.economy.level >= 10;
        case 'answers-500':   return s.answered >= 500;
        case 'globetrotter':  return masteredCount() >= 100;
        case 'region-master': return regionMastered();
        default: return false;
      }
    }
    function testSeasonal(a) {
      if (!Cos.seasonInWindow(a.season, now)) return false;
      var year = Cos.seasonEditionYear(a.season, now);
      var slot = (state.seasonal && state.seasonal[a.id]) || null;
      if (!slot || slot.year !== year) return false;
      var have = Cos.seasonProgressValue(slot, a.season.metric);
      return have >= (a.season.goal || 1);
    }
    function regionMastered() {
      var regions = global.GeoData.regions;
      for (var i = 0; i < regions.length; i++) {
        var list = global.GeoData.countries.filter(function (c) { return c.region === regions[i]; });
        var done = list.every(function (c) {
          var m = state.mastery[c.name]; return m && m.box >= 4;
        });
        if (done) return true;
      }
      return false;
    }
  }

  /* ============================== SOUND ============================= */
  var actx = null;
  function ac() {
    if (!actx) {
      var Ctx = global.AudioContext || global.webkitAudioContext;
      if (!Ctx) return null;
      actx = new Ctx();
    }
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }
  function tone(freq, start, dur, type, vol) {
    var c = ac(); if (!c) return;
    var o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, c.currentTime + start);
    g.gain.setValueAtTime(0, c.currentTime + start);
    g.gain.linearRampToValueAtTime(vol || 0.13, c.currentTime + start + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
    o.connect(g); g.connect(c.destination);
    o.start(c.currentTime + start); o.stop(c.currentTime + start + dur + 0.02);
  }
  var Sound = {
    correct: function (streak) {
      if (!state.settings.sound) return;
      var step = Math.min(streak || 0, 8) * 28;
      tone(587 + step, 0, 0.14, 'sine', 0.11);
      tone(880 + step, 0.075, 0.19, 'sine', 0.09);
    },
    wrong: function () {
      if (!state.settings.sound) return;
      tone(196, 0, 0.17, 'triangle', 0.09);
      tone(155, 0.07, 0.2, 'triangle', 0.07);
    },
    gem: function () {
      if (!state.settings.sound) return;
      tone(1046, 0, 0.09, 'sine', 0.07);
      tone(1568, 0.06, 0.13, 'sine', 0.055);
    },
    levelUp: function () {
      if (!state.settings.sound) return;
      [523, 659, 784, 1046].forEach(function (f, i) { tone(f, i * 0.085, 0.3, 'sine', 0.1); });
    },
    flip: function () {
      if (!state.settings.sound) return;
      tone(420, 0, 0.06, 'sine', 0.05);
    },
    goal: function () {
      if (!state.settings.sound) return;
      [523, 659, 784, 1046, 1318, 1568].forEach(function (f, i) {
        tone(f, i * 0.09, 0.5, 'sine', 0.1);
      });
      [392, 523].forEach(function (f, i) { tone(f, 0.5 + i * 0.12, 0.6, 'triangle', 0.07); });
    },
    finish: function () {
      if (!state.settings.sound) return;
      [523, 659, 784, 1046, 1318].forEach(function (f, i) { tone(f, i * 0.1, 0.42, 'triangle', 0.09); });
    }
  };

  /* ============================ EFFECTS ============================= */
  function fxLayer() {
    var el = document.getElementById('fx-layer');
    if (!el) {
      el = document.createElement('div');
      el.id = 'fx-layer';
      document.body.appendChild(el);
    }
    return el;
  }

  var CONFETTI_COLORS = ['#1B4DFF', '#22D3EE', '#F5B301', '#0E9F6E', '#FB7185', '#8B5CF6'];
  /* Everyday bursts stay on the brand palette. Level-up and the chest
     still call confetti() with the full set. */
  var CALM_CONFETTI = ['#0C8F7F', '#0E9F6E', '#F5B301'];

  function confetti(opts) {
    if (!state.settings.effects) return;
    opts = opts || {};
    var layer = fxLayer();
    var colors = opts.colors || CONFETTI_COLORS;
    var n = opts.count || 42;
    var ox = opts.x !== undefined ? opts.x : window.innerWidth / 2;
    var oy = opts.y !== undefined ? opts.y : window.innerHeight / 2;

    for (var i = 0; i < n; i++) {
      var bit = document.createElement('div');
      bit.className = 'confetti-bit';
      bit.style.background = colors[(Math.random() * colors.length) | 0];
      bit.style.left = ox + 'px';
      bit.style.top = oy + 'px';
      var shape = Math.random();
      if (shape > 0.8) bit.classList.add('is-ribbon');
      else if (shape > 0.58) bit.style.borderRadius = '50%';
      layer.appendChild(bit);

      /* opts.angle aims a cannon (radians, 0 = right); default is a full ring */
      var angle = opts.angle !== undefined
        ? opts.angle + (Math.random() - 0.5) * (opts.spread || 0.8)
        : (Math.PI * 2 * i) / n + Math.random() * 0.5;
      var power = (opts.power || 190) * (0.45 + Math.random() * 0.75);
      var dx = Math.cos(angle) * power;
      var dy = Math.sin(angle) * power - (opts.angle !== undefined ? 0 : 90);
      var dur = 1000 + Math.random() * 900;
      var depth = 0.7 + Math.random() * 0.6;
      var flip = (Math.random() > 0.5 ? 1 : -1) * (540 + Math.random() * 900);

      (function (node) {
        var anim = node.animate([
          { transform: 'translate(0,0) rotate(0deg) rotateX(0deg) scale(' + depth + ')', opacity: 1 },
          { transform: 'translate(' + dx * 0.65 + 'px,' + (dy * 0.7) + 'px) rotate(' + (Math.random() * 260 - 130) + 'deg) rotateX(' + flip * 0.4 + 'deg) scale(' + depth + ')', opacity: 1, offset: 0.4 },
          { transform: 'translate(' + (dx + (Math.random() - 0.5) * 60) + 'px,' + (dy + 380) + 'px) rotate(' + (Math.random() * 620 - 310) + 'deg) rotateX(' + flip + 'deg) scale(' + depth * 0.9 + ')', opacity: 0 }
        ], { duration: dur, easing: 'cubic-bezier(.16,.72,.4,1)' });
        anim.onfinish = function () { node.remove(); };
        setTimeout(function () { if (node.parentNode) node.remove(); }, dur + 300);
      })(bit);
    }
  }

  /* Diamonds falling the full height of the window. Used when the daily
     goal lands, which should feel bigger than any single right answer. */
  function diamondRain(opts) {
    if (!state.settings.effects) return;
    opts = opts || {};
    var layer = fxLayer();
    var n = opts.count || 60;
    var w = window.innerWidth;

    for (var i = 0; i < n; i++) {
      (function (i) {
        var gem = document.createElement('div');
        gem.className = 'rain-gem';
        gem.textContent = '💎';
        var size = 15 + Math.random() * 20;
        gem.style.left = (Math.random() * w) + 'px';
        gem.style.fontSize = size + 'px';
        gem.style.top = '-40px';
        layer.appendChild(gem);

        var delay = Math.random() * 900;
        var dur = 1500 + Math.random() * 1400;
        var drift = (Math.random() - 0.5) * 160;
        var spin = (Math.random() - 0.5) * 540;

        var anim = gem.animate([
          { transform: 'translate(0,0) rotate(0deg)', opacity: 0 },
          { opacity: 1, offset: 0.08 },
          { opacity: 1, offset: 0.82 },
          { transform: 'translate(' + drift + 'px,' + (window.innerHeight + 90) + 'px) rotate(' + spin + 'deg)', opacity: 0 }
        ], { duration: dur, delay: delay, easing: 'cubic-bezier(.32,.16,.62,1)' });
        anim.onfinish = function () { gem.remove(); };
        setTimeout(function () { if (gem.parentNode) gem.remove(); }, dur + delay + 400);
      })(i);
    }
  }

  function calmConfetti(opts) {
    opts = opts || {};
    if (!opts.colors) opts.colors = CALM_CONFETTI;
    if (!opts.count) opts.count = 14;
    if (!opts.power) opts.power = 120;
    return confetti(opts);
  }

  /* The daily-goal payout: a short banner and one quiet burst. */
  function celebrateGoal(bonus, dayStreak) {
    Sound.goal();
    calmConfetti({ count: 18, power: 140, y: window.innerHeight * 0.34 });
    diamondRain({ count: 12 });

    var banner = document.createElement('div');
    banner.className = 'goal-banner';
    banner.innerHTML =
      '<div class="goal-banner__card">' +
        '<div class="goal-banner__ring">' + Icons.check + '</div>' +
        '<b>Daily goal done</b>' +
        '<span>' + state.daily.goal + ' questions' +
          (dayStreak > 1 ? ' · ' + dayStreak + ' days in a row' : '') + '</span>' +
        '<div class="goal-banner__gem mono">+' + bonus + ' 💎</div>' +
      '</div>';
    fxLayer().appendChild(banner);
    setTimeout(function () {
      banner.classList.add('is-out');
      setTimeout(function () { banner.remove(); }, 420);
    }, 2900);
  }

  /* Floating "+12 XP" text at a screen point. */
  function floatGain(x, y, text, color) {
    if (!state.settings.effects) return;
    var el = document.createElement('div');
    el.className = 'float-gain';
    el.textContent = text;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.style.color = color || '#1B4DFF';
    fxLayer().appendChild(el);
    setTimeout(function () { el.remove(); }, 1200);
  }

  function burstFrom(el, gains) {
    if (!el) return;
    var r = el.getBoundingClientRect();
    var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    calmConfetti({ x: cx, y: cy, count: gains && gains.combo >= 5 ? 10 : 6, power: 90 });
    if (gains) {
      floatGain(cx - 46, cy - 12, '+' + gains.xp + ' XP', '#1B4DFF');
      floatGain(cx + 22, cy - 12, '+' + gains.gems + ' \u25C6', '#0369A1');
    }
  }

  /* --------------------------- toasts ------------------------------ */
  function toastStack() {
    var el = document.querySelector('.toast-stack');
    if (!el) {
      el = document.createElement('div');
      el.className = 'toast-stack';
      document.body.appendChild(el);
    }
    return el;
  }
  /* A game in motion holds toasts back: a stack of them over the track hides
     what is coming. They come out together once it stops. */
  var toastHold = false, toastQueue = [];
  function holdToasts(on) {
    toastHold = !!on;
    if (toastHold) {
      Array.prototype.forEach.call(document.querySelectorAll('.toast-stack .toast'), function (t) {
        t.classList.add('is-out');
        setTimeout(function () { t.remove(); }, 260);
      });
      return;
    }
    var queued = toastQueue;
    toastQueue = [];
    queued.forEach(function (a, i) { setTimeout(function () { toast(a[0], a[1], a[2], a[3]); }, i * 350); });
  }
  function toast(title, sub, icon, ms) {
    if (toastHold) { toastQueue.push([title, sub, icon, ms]); return; }
    var el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = '<div class="toast__i">' + (icon || Icons.check) + '</div>' +
      '<div><b>' + escapeHtml(title) + '</b>' + (sub ? '<span>' + escapeHtml(sub) + '</span>' : '') + '</div>';
    toastStack().appendChild(el);
    setTimeout(function () {
      el.classList.add('is-out');
      setTimeout(function () { el.remove(); }, 260);
    }, ms || 3200);
  }

  /* ============================= HELPERS ============================ */
  /* '+8 <gem>' with the emoji sized to sit level with the digits. */
  function gem(n, sign) {
    return (sign === false ? '' : '+') + n + ' <span class="gem">💎</span>';
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* Loose comparison for typed answers: case, accents and punctuation insensitive. */
  function normalise(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   /* strip accents */
      .replace(/[^a-z0-9 ]/g, ' ')                         /* punctuation -> space */
      .replace(/\b(the|of|and)\b/g, ' ')                  /* ignore connective words */
      .replace(/\s+/g, ' ')
      .trim();
  }

  function tight(s) { return normalise(s).replace(/ /g, ''); }

  /* A canonical answer that lists three or more comma-separated names
     (South Africa) is right only when every name is present. Order does
     not matter, and commas, "and" and "&" fall out with the other
     punctuation. Two-part answers such as "Washington, D.C." stay exact
     matches, so this leaves them alone. */
  function listsEveryName(inputNorm, canonical) {
    var parts = String(canonical || '').split(',');
    if (parts.length < 3) return false;
    for (var i = 0; i < parts.length; i++) {
      var phrase = normalise(parts[i]);
      if (!phrase || !containsPhrase(inputNorm, phrase)) return false;
    }
    return true;
  }

  function containsPhrase(inputNorm, phraseNorm) {
    var words = inputNorm.split(' ');
    var goal = phraseNorm.replace(/ /g, '');
    if (!goal) return false;
    for (var i = 0; i < words.length; i++) {
      var acc = '';
      for (var j = i; j < words.length; j++) {
        acc += words[j];
        if (acc === goal) return true;
        if (acc.length > goal.length) break;
      }
    }
    return false;
  }

  function matches(input, canonical, aliases) {
    var n = normalise(input);
    if (!n) return false;
    var t = n.replace(/ /g, '');
    var pool = [canonical].concat(aliases || []);
    for (var i = 0; i < pool.length; i++) {
      /* accept either the spaced or the run-together spelling: "N'Djamena" / "ndjamena" */
      if (n === normalise(pool[i]) || t === tight(pool[i])) return true;
      if (listsEveryName(n, pool[i])) return true;
    }
    return false;
  }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = (Math.random() * (i + 1)) | 0;
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function sample(arr, n) { return shuffle(arr).slice(0, n); }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html !== undefined) n.innerHTML = html;
    return n;
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function fmtTime(sec) {
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  /* A diamond balance has no ceiling — the admin panel hands out whatever
     gets typed — so anywhere the number shares a row with something else it
     has to be able to give ground: 100,241,768 → 100M. Under a thousand
     there is nothing to save, so the full figure stands. */
  var UNITS = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];

  function compact(n) {
    n = Number(n) || 0;
    for (var i = 0; i < UNITS.length; i++) {
      if (Math.abs(n) >= UNITS[i][0]) {
        var v = n / UNITS[i][0];
        return (Math.abs(v) >= 100 ? Math.round(v)
                                   : Math.round(v * 10) / 10).toLocaleString() + UNITS[i][1];
      }
    }
    return n.toLocaleString();
  }

  /* Render an avatar (artwork + decoration + status dot) as HTML. */
  function avatarHtml(profile, opts) {
    opts = opts || {};
    var Cos = global.Cosmetics, Av = global.Avatars;
    var av = Cos.find(Cos.avatars, profile.avatar);
    var deco = Cos.find(Cos.decorations, profile.decoration);
    var st = Cos.find(Cos.statuses, profile.status);

    var decoHtml = Cos.decoHtml(deco);

    var statusHtml = opts.status === false ? '' :
      '<span class="avatar__status" style="background:' +
      (profile.status === 'invisible' ? '#9CA3AF' : st.color) + '"></span>';

    return '<span class="avatar' + (deco && deco.kind !== 'none' ? ' avatar--deco' : '') + '">' + decoHtml +
      '<span class="avatar__img" style="color:' + av.color + '">' + Av.svg(av.art, av.color) + '</span>' +
      statusHtml + '</span>';
  }

  global.WW = {
    Icons: Icons,
    state: state,
    save: save, saveNow: saveNow, reset: reset,
    defaultState: defaultState, replaceState: replaceState, readSaved: readSaved,
    onSave: onSave, useAccount: useAccount, userKey: userKey, GUEST_KEY: GUEST_KEY,
    saveLocal: saveLocal, accountId: function () { return activeUid; },
    award: award, addDiamonds: addDiamonds, spend: spend,
    xpToNext: xpToNext, levelProgress: levelProgress,
    comboMultiplier: comboMultiplier,
    masteredCount: masteredCount,
    checkAchievements: checkAchievements, announceAchievements: announceAchievements,
    checkBadges: checkBadges,
    touchDaily: touchDaily,
    Sound: Sound,
    confetti: confetti, calmConfetti: calmConfetti, floatGain: floatGain, burstFrom: burstFrom, toast: toast, holdToasts: holdToasts,
    diamondRain: diamondRain, celebrateGoal: celebrateGoal,
    gem: gem, verifiedMark: verifiedMark,
    escapeHtml: escapeHtml, normalise: normalise, matches: matches, tight: tight,
    shuffle: shuffle, sample: sample, pick: pick,
    el: el, $: $, $$: $$, fmtTime: fmtTime, compact: compact, avatarHtml: avatarHtml
  };

  /* Persist the fallback before cloud.js attaches, so a guest save does
     not keep `wings` on disk. Signed-in copies are cleaned again when
     the account save is adopted. */
  if (retiredOnLoad) saveNow();
})(window);
