/* ------------------------------------------------------------------
   LearnGeo — secrets.

   Twelve hidden things to do. Each pays out once: a secret badge,
   diamonds and XP, and the hard ones a cosmetic you cannot buy. Finding
   all twelve adds the Secret Keeper set on top.

   state.secrets maps id -> the time it was found. Nothing here tells a
   player what the triggers are; the badge case shows ??? until found.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW;
  if (!W) return;

  var LIST = [
    { id: 'poke', tier: 'easy', name: 'Poke', art: 'joystick', tone: 'slate',
      desc: 'Poked your own avatar ten times. It noticed.' },
    { id: 'spin', tier: 'easy', name: 'Spin the Globe', art: 'globe', tone: 'blue',
      desc: 'Clicked the LearnGeo logo until the world went round.' },
    { id: 'konami', tier: 'easy', name: 'Up Up Down Down', art: 'bolt', tone: 'violet',
      desc: 'Entered the old code.' },
    { id: 'witching', tier: 'easy', name: 'Witching Hour', art: 'moon', tone: 'indigo',
      desc: 'Answered a question between 3 and 4 in the morning.' },
    { id: 'tiny', tier: 'medium', name: 'Tiny Nation', art: 'key', tone: 'gold',
      desc: 'Found Vatican City on the home map.' },
    { id: 'nemo', tier: 'medium', name: 'Lost at Sea', art: 'target', tone: 'teal',
      desc: 'Clicked Point Nemo, the place furthest from any land.' },
    { id: 'speed', tier: 'medium', name: 'Speed Demon', art: 'bolt', tone: 'amber',
      desc: 'Answered correctly in under a second.' },
    { id: 'world', tier: 'medium', name: 'Around the World', art: 'map', tone: 'green',
      desc: 'Five correct answers in a row, each from a different region.' },
    { id: 'antipodes', tier: 'hard', name: 'Antipodes', art: 'globe', tone: 'red',
      desc: 'Two correct answers in a row from opposite sides of the planet.' },
    { id: 'bookworm', tier: 'hard', name: 'Bookworm', art: 'book', tone: 'teal',
      desc: 'Studied every corner of your Codex, in both World and Skills.' },
    { id: 'comeback', tier: 'hard', name: 'Comeback', art: 'flame', tone: 'red',
      desc: 'Got the same country wrong three times, then got it right.' },
    { id: 'tayt', tier: 'hard', name: 'Tayt', art: 'seed', tone: 'violet',
      desc: 'Found the name hidden on the home page.' }
  ];
  var TOTAL = LIST.length;
  var BY_ID = {};
  LIST.forEach(function (s) { BY_ID[s.id] = s; });

  /* What each secret unlocks in the shop. Mirrors the `secret` field on
     the items in cosmetics.js. */
  var COSMETIC = {
    antipodes: 'nameplate', bookworm: 'banner', comeback: 'theme', tayt: 'decoration'
  };

  function map() {
    var s = W.state;
    if (!s.secrets || typeof s.secrets !== 'object' || Array.isArray(s.secrets)) s.secrets = {};
    return s.secrets;
  }
  function has(id) { return !!map()[id]; }
  function found() { return LIST.filter(function (s) { return has(s.id); }).map(function (s) { return s.id; }); }
  function count() { return found().length; }
  function allFound() { return count() >= TOTAL; }

  function addXp(n) {
    var e = W.state.economy;
    e.xp += n;
    var up = false;
    while (e.xp >= W.xpToNext(e.level)) { e.xp -= W.xpToNext(e.level); e.level += 1; up = true; }
    return up;
  }

  function rewardFor(tier) {
    var lv = W.state.economy.level;
    if (tier === 'hard') return { gems: 500, xp: W.xpToNext(lv) + W.xpToNext(lv + 1) };
    if (tier === 'medium') return { gems: 200, xp: W.xpToNext(lv) };
    return { gems: 50, xp: 100 };
  }

  /* The state change happens now, so the badge is already held when the
     mode runs its own badge check and nothing gets announced twice. Only
     the toast waits. */
  function unlock(id) {
    var sec = BY_ID[id];
    if (!sec || has(id)) return false;
    if (W.state.role === 'teacher') return false;
    map()[id] = Date.now();

    var r = rewardFor(sec.tier);
    W.state.economy.diamonds += r.gems;
    addXp(r.xp);
    var badgeId = 'secret-' + id;
    if (!Array.isArray(W.state.badges)) W.state.badges = [];
    if (W.state.badges.indexOf(badgeId) === -1) W.state.badges.push(badgeId);

    var keeper = allFound();
    if (keeper) {
      W.state.economy.diamonds += 1000;
      if (W.state.badges.indexOf('secret-keeper') === -1) W.state.badges.push('secret-keeper');
    }
    W.saveNow();

    var n = count();
    var extra = COSMETIC[id] ? ' · secret ' + COSMETIC[id] + ' unlocked' : '';
    setTimeout(function () {
      if (W.Sound && W.Sound.gem) W.Sound.gem();
      try { (W.calmConfetti || W.confetti)({ count: 12, power: 100 }); } catch (e) { /* decoration only */ }
      var icon = global.Badges ? global.Badges.markup([badgeId], 18, true) : '';
      W.toast('🥚 You found a secret: ' + sec.name,
        sec.desc + ' · +' + r.gems + ' 💎 · +' + r.xp + ' XP' + extra +
        ' · ' + n + '/' + TOTAL + ' found', icon, 6500);
      if (keeper) {
        setTimeout(function () {
          if (W.Sound && W.Sound.gem) W.Sound.gem();
          try { (W.calmConfetti || W.confetti)({ count: 12, power: 100 }); } catch (e) { /* decoration only */ }
          W.toast('🗝️ Secret Keeper',
            'You found all ' + TOTAL + ' secrets. +1000 💎 and the Secret Keeper ring and effect are yours.',
            global.Badges ? global.Badges.markup(['secret-keeper'], 18, true) : '', 8000);
        }, 1800);
      }
      if (global.UI && global.UI.refreshHud) global.UI.refreshHud();
      if (global.Portal && document.body.classList.contains('view-portal')) {
        try { global.Portal.render(); } catch (e) { /* redraw only */ }
      }
    }, 650);
    return true;
  }

  /* ========================= click secrets ========================= */
  function rapid(n, windowMs) {
    var times = [];
    return function () {
      var now = Date.now();
      times.push(now);
      while (times.length && now - times[0] > windowMs) times.shift();
      if (times.length >= n) { times = []; return true; }
      return false;
    };
  }
  var poke = rapid(10, 3000);
  var spin = rapid(7, 2500);

  /* Home map: screen point -> lon/lat in the map's own projection
     (worldmap.js: 760 wide, 84N to 58S, equirectangular). */
  function lonLat(svg, e) {
    if (!svg.getScreenCTM || !svg.createSVGPoint) return null;
    var m = svg.getScreenCTM();
    if (!m) return null;
    var p = svg.createSVGPoint();
    p.x = e.clientX; p.y = e.clientY;
    var v = p.matrixTransform(m.inverse());
    var scale = 760 / 360;
    return { lon: v.x / scale - 180, lat: 84 - v.y / scale };
  }

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    try {
      if (t.closest('#avatar-btn') && poke()) unlock('poke');
      if (t.closest('#home-btn') && spin()) unlock('spin');
      if (t.closest('.secret-tayt')) unlock('tayt');

      var svg = t.closest('#home-map svg');
      if (svg) {
        var c = t.closest('[data-c]');
        var ll = lonLat(svg, e);
        if ((c && c.getAttribute('data-c') === 'Vatican City') ||
            (ll && Math.abs(ll.lat - 41.90) < 0.6 && Math.abs(ll.lon - 12.45) < 0.6)) unlock('tiny');
        if (ll && Math.abs(ll.lat + 48.88) < 4 && Math.abs(ll.lon + 123.39) < 4) unlock('nemo');
      }
    } catch (err) { /* a secret is never worth breaking a click */ }
  }, true);

  var KONAMI = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright',
                'arrowleft', 'arrowright', 'b', 'a'];
  var kpos = 0;
  document.addEventListener('keydown', function (e) {
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    var k = (e.key || '').toLowerCase();
    if (k === KONAMI[kpos]) {
      kpos += 1;
      if (kpos === KONAMI.length) { kpos = 0; unlock('konami'); }
    } else {
      kpos = k === KONAMI[0] ? 1 : 0;
    }
  });

  /* Codex: every row of the hexagon looked at, in both lenses. */
  var seen = { world: {}, skills: {} };
  function codexLook(e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var row = t.closest('#view-codex .hex-row');
    if (!row) return;
    var on = document.querySelector('#view-codex [data-v].is-active');
    var lens = on ? on.getAttribute('data-v') : 'world';
    if (!seen[lens]) return;
    seen[lens][row.getAttribute('data-i')] = 1;
    var rows = document.querySelectorAll('#view-codex .hex-row').length;
    seen[lens].n = rows;
    function done(l) { return seen[l].n && Object.keys(seen[l]).length - 1 >= seen[l].n; }
    if (done('world') && done('skills')) unlock('bookworm');
  }
  document.addEventListener('mouseover', codexLook);
  document.addEventListener('focusin', codexLook);

  /* ========================= answer secrets ======================== */
  var shownAt = 0;
  var Q = global.Quiz;
  if (Q && Q.make) {
    var make = Q.make;
    Q.make = function () {
      shownAt = Date.now();
      return make.apply(this, arguments);
    };
  }

  var byName = null;
  function country(name) {
    if (!byName) {
      byName = {};
      ((global.GeoData && global.GeoData.countries) || []).forEach(function (c) { byName[c.name] = c; });
    }
    return byName[name] || null;
  }

  function apart(a, b) {
    var r = Math.PI / 180;
    var d = Math.sin(a.lat * r) * Math.sin(b.lat * r) +
            Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.cos((a.lon - b.lon) * r);
    return Math.acos(Math.max(-1, Math.min(1, d))) / r;
  }

  var run = [];          /* countries in the current correct run */
  var misses = {};       /* country -> wrong answers this session */

  function onAnswer(correct, opts) {
    var now = new Date();
    if (now.getHours() === 3) unlock('witching');

    var c = opts && opts.country ? country(opts.country) : null;
    if (!correct) {
      run = [];
      if (c) misses[c.name] = (misses[c.name] || 0) + 1;
      return;
    }
    if (shownAt && Date.now() - shownAt < 1000) unlock('speed');
    shownAt = 0;
    if (!c) { run = []; return; }

    if ((misses[c.name] || 0) >= 3) unlock('comeback');
    misses[c.name] = 0;

    var prev = run[run.length - 1];
    if (prev && typeof prev.lat === 'number' && typeof c.lat === 'number' && apart(prev, c) >= 150) {
      unlock('antipodes');
    }

    run.push(c);
    if (run.length > 5) run.shift();
    if (run.length === 5) {
      var regions = {};
      run.forEach(function (x) { if (x.region) regions[x.region] = 1; });
      if (Object.keys(regions).length === 5) unlock('world');
    }
  }

  if (W.award) {
    var award = W.award;
    W.award = function (correct, opts) {
      var out = award.apply(this, arguments);
      try { onAnswer(correct, opts || {}); } catch (e) { /* never in the way of an answer */ }
      return out;
    };
  }

  global.Secrets = {
    list: function () { return LIST.slice(); },
    find: function (id) { return BY_ID[id] || null; },
    has: has, found: found, count: count, allFound: allFound,
    total: TOTAL
  };
})(window);
