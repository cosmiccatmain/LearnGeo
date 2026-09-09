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
    inbox:  svg('<path d="M3 12h5l2 3h4l2-3h5"/><path d="M5 5h14l2 7v7H3v-7z"/>')
  };

  /* ============================= STORAGE ============================ */
  var KEY = 'learngeo.save.v1';

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
        status: 'online'
      },
      owned: {
        avatars: ['globe', 'map', 'compass', 'mountain'],
        decorations: ['none', 'ring-slate'],
        effects: ['none'],
        nameplates: ['none'],
        banners: ['plain'],
        themes: ['default']
      },
      economy: { diamonds: 150, xp: 0, level: 1 },
      streak: { current: 0, best: 0 },
      daily: { date: '', answered: 0, goal: 20, dayStreak: 0, lastDay: '', hit: false },
      stats: { answered: 0, correct: 0, tests: 0, cards: 0, perfectTests: 0 },
      mastery: {},          /* countryName -> { c: correctCount, w: wrongCount, box: 0..5 } */
      achievements: [],
      role: 'student',            /* 'student' | 'teacher' */
      roleChosen: false,          /* asked once, on first entry */
      classroom: {
        name: '', code: '',       /* teacher's own class */
        roster: [],               /* names the teacher tracks locally */
        results: [],              /* result codes pasted back in */
        assignments: []           /* assignments the teacher has written */
      },
      inbox: [],                  /* assignments a student has loaded by code */
      enrolled: null,             /* { code, className, name } once joined */
      customSets: [],             /* saved lists of hand-picked countries */
      settings: {
        sound: true,
        effects: true,
        timerDefault: true,
        tileProvider: 'osm',
        apiKey: '',
        showCapitalPins: true
      }
    };
  }

  var state = load();

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return defaultState();
      var parsed = JSON.parse(raw);
      return merge(defaultState(), parsed);
    } catch (e) { return defaultState(); }
  }

  function merge(base, over) {
    if (!over || typeof over !== 'object') return base;
    Object.keys(base).forEach(function (k) {
      if (over[k] === undefined || over[k] === null) return;
      if (Array.isArray(base[k])) { base[k] = Array.isArray(over[k]) ? over[k] : base[k]; }
      else if (typeof base[k] === 'object') { base[k] = merge(base[k], over[k]); }
      else { base[k] = over[k]; }
    });
    return base;
  }

  var saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
    }, 120);
  }
  function saveNow() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }
  function reset() { state = defaultState(); saveNow(); }

  /* ============================= ECONOMY ============================ */
  function xpToNext(level) { return 80 + 40 * level; }

  function levelProgress() {
    return { have: state.economy.xp, need: xpToNext(state.economy.level) };
  }

  var listeners = [];
  function onChange(fn) { listeners.push(fn); }
  function emit() { listeners.forEach(function (f) { f(state); }); }

  function todayKey() {
    var d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }

  function touchDaily() {
    var t = todayKey();
    if (state.daily.date !== t) {
      /* day rolled over — extend or reset the day streak */
      var y = new Date(Date.now() - 86400000);
      var yKey = y.getFullYear() + '-' + (y.getMonth() + 1) + '-' + y.getDate();
      if (state.daily.lastDay === yKey) state.daily.dayStreak += 1;
      else if (state.daily.lastDay !== t) state.daily.dayStreak = 1;
      state.daily.date = t;
      state.daily.answered = 0;
      state.daily.hit = false;
      state.daily.lastDay = t;
      save();
    }
  }

  /* Award for one answered question. Returns the gains for display. */
  function award(correct, opts) {
    opts = opts || {};
    touchDaily();
    state.stats.answered += 1;
    state.daily.answered += 1;

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

    if (opts.country) {
      var m = state.mastery[opts.country] || { c: 0, w: 0, box: 0 };
      if (correct) { m.c += 1; m.box = Math.min(5, m.box + 1); }
      else { m.w += 1; m.box = Math.max(0, m.box - 1); }
      state.mastery[opts.country] = m;
    }

    /* crossing the daily goal is the one moment worth a full-screen payout */
    if (!state.daily.hit && state.daily.answered >= state.daily.goal) {
      state.daily.hit = true;
      gains.goalHit = true;
      gains.goalBonus = 60 + state.daily.dayStreak * 10;
      state.economy.diamonds += gains.goalBonus;
      /* fired here so every mode gets it without wiring the call four times */
      var b = gains.goalBonus, ds = state.daily.dayStreak;
      setTimeout(function () { celebrateGoal(b, ds); }, 520);
    }

    save(); emit();
    return gains;
  }

  function comboMultiplier(streak) {
    if (streak >= 25) return 3;
    if (streak >= 15) return 2.5;
    if (streak >= 10) return 2;
    if (streak >= 5)  return 1.5;
    if (streak >= 3)  return 1.25;
    return 1;
  }

  function addDiamonds(n) { state.economy.diamonds += n; save(); emit(); }
  function spend(n) {
    if (state.economy.diamonds < n) return false;
    state.economy.diamonds -= n; save(); emit(); return true;
  }

  function masteredCount() {
    return Object.keys(state.mastery).filter(function (k) {
      return state.mastery[k].box >= 4;
    }).length;
  }

  /* -------------------------- achievements ------------------------- */
  function checkAchievements() {
    var C = global.Cosmetics.achievements;
    var unlocked = [];
    C.forEach(function (a) {
      if (state.achievements.indexOf(a.id) !== -1) return;
      if (test(a.id)) {
        state.achievements.push(a.id);
        state.economy.diamonds += a.reward;
        unlocked.push(a);
      }
    });
    if (unlocked.length) { save(); emit(); }
    return unlocked;

    function test(id) {
      var s = state.stats;
      switch (id) {
        case 'first-steps':   return s.answered >= 1;
        case 'streak-10':     return state.streak.best >= 10;
        case 'streak-25':     return state.streak.best >= 25;
        case 'perfect-test':  return s.perfectTests >= 1;
        case 'test-5':        return s.tests >= 5;
        case 'cards-100':     return s.cards >= 100;
        case 'level-10':      return state.economy.level >= 10;
        case 'answers-500':   return s.answered >= 500;
        case 'globetrotter':  return masteredCount() >= 100;
        case 'region-master': return regionMastered();
        default: return false;
      }
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

  function confetti(opts) {
    if (!state.settings.effects) return;
    opts = opts || {};
    var layer = fxLayer();
    var n = opts.count || 42;
    var ox = opts.x !== undefined ? opts.x : window.innerWidth / 2;
    var oy = opts.y !== undefined ? opts.y : window.innerHeight / 2;

    for (var i = 0; i < n; i++) {
      var bit = document.createElement('div');
      bit.className = 'confetti-bit';
      bit.style.background = CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0];
      bit.style.left = ox + 'px';
      bit.style.top = oy + 'px';
      if (Math.random() > 0.62) bit.style.borderRadius = '50%';
      layer.appendChild(bit);

      var angle = (Math.PI * 2 * i) / n + Math.random() * 0.5;
      var power = (opts.power || 190) * (0.45 + Math.random() * 0.75);
      var dx = Math.cos(angle) * power;
      var dy = Math.sin(angle) * power - 90;
      var dur = 900 + Math.random() * 700;

      (function (node) {
        var anim = node.animate([
          { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
          { transform: 'translate(' + dx * 0.65 + 'px,' + (dy * 0.7) + 'px) rotate(' + (Math.random() * 260 - 130) + 'deg)', opacity: 1, offset: 0.45 },
          { transform: 'translate(' + dx + 'px,' + (dy + 340) + 'px) rotate(' + (Math.random() * 620 - 310) + 'deg)', opacity: 0 }
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

  /* The full daily-goal payout: banner, confetti volleys, diamond rain. */
  function celebrateGoal(bonus, dayStreak) {
    Sound.goal();
    confetti({ count: 120, power: 360, y: window.innerHeight * 0.34 });
    setTimeout(function () {
      confetti({ count: 80, power: 300, x: window.innerWidth * 0.25, y: window.innerHeight * 0.4 });
    }, 220);
    setTimeout(function () {
      confetti({ count: 80, power: 300, x: window.innerWidth * 0.75, y: window.innerHeight * 0.4 });
    }, 380);
    diamondRain({ count: 70 });

    var banner = document.createElement('div');
    banner.className = 'goal-banner';
    banner.innerHTML =
      '<div class="goal-banner__card">' +
        '<div class="goal-banner__ring">' + Icons.check + '</div>' +
        '<b>Daily goal done</b>' +
        '<span>' + state.daily.goal + ' questions' +
          (dayStreak > 1 ? ' · ' + dayStreak + ' days running' : '') + '</span>' +
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
    confetti({ x: cx, y: cy, count: gains && gains.combo >= 5 ? 56 : 34, power: 170 });
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
  function toast(title, sub, icon, ms) {
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

  function matches(input, canonical, aliases) {
    var n = normalise(input);
    if (!n) return false;
    var t = n.replace(/ /g, '');
    var pool = [canonical].concat(aliases || []);
    for (var i = 0; i < pool.length; i++) {
      /* accept either the spaced or the run-together spelling: "N'Djamena" / "ndjamena" */
      if (n === normalise(pool[i]) || t === tight(pool[i])) return true;
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

  /* Render an avatar (artwork + decoration + status dot) as HTML. */
  function avatarHtml(profile, opts) {
    opts = opts || {};
    var Cos = global.Cosmetics, Av = global.Avatars;
    var av = Cos.find(Cos.avatars, profile.avatar);
    var deco = Cos.find(Cos.decorations, profile.decoration);
    var st = Cos.find(Cos.statuses, profile.status);

    var decoHtml = '';
    if (deco.kind === 'ring') {
      decoHtml = '<span class="avatar__ring" style="background:linear-gradient(135deg,' +
        deco.c1 + ',' + deco.c2 + ')"></span>';
    } else if (deco.kind === 'badge') {
      decoHtml = '<span class="avatar__badge" style="color:' + deco.c1 + '">' +
        Av.badge(deco.badge, deco.c1) + '</span>';
    } else if (deco.kind === 'orbit') {
      decoHtml = '<span class="avatar__orbit" style="border-color:' + deco.c1 + '">' +
        '<i style="background:' + deco.c2 + '"></i></span>';
    }

    var statusHtml = opts.status === false ? '' :
      '<span class="avatar__status" style="background:' +
      (profile.status === 'invisible' ? '#9CA3AF' : st.color) + '"></span>';

    return '<span class="avatar">' + decoHtml +
      '<span class="avatar__img" style="color:' + av.color + '">' + Av.svg(av.art, av.color) + '</span>' +
      statusHtml + '</span>';
  }

  global.WW = {
    Icons: Icons,
    state: state,
    save: save, saveNow: saveNow, reset: reset,
    onChange: onChange, emit: emit,
    award: award, addDiamonds: addDiamonds, spend: spend,
    xpToNext: xpToNext, levelProgress: levelProgress,
    comboMultiplier: comboMultiplier,
    masteredCount: masteredCount,
    checkAchievements: checkAchievements,
    touchDaily: touchDaily,
    Sound: Sound,
    confetti: confetti, floatGain: floatGain, burstFrom: burstFrom, toast: toast,
    diamondRain: diamondRain, celebrateGoal: celebrateGoal,
    gem: gem, escapeHtml: escapeHtml, normalise: normalise, matches: matches, tight: tight,
    shuffle: shuffle, sample: sample, pick: pick,
    el: el, $: $, $$: $$, fmtTime: fmtTime, avatarHtml: avatarHtml
  };
})(window);
