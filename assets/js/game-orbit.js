/* ------------------------------------------------------------------
   LearnGeo — Globe Defender
   An orbit shooter. Your ship circles the globe and fires outward on its
   own; you steer it round to meet the meteors before they land. Whatever
   gets through costs a shield and shows you which country it hit.

   After every wave a supply drop arrives: four satellites, each carrying
   a flag or a capital. Shoot the right one for a power-up. Shoot the
   wrong one, or let the timer run out, and a meteor shower follows.

     GeoOrbit.mount(host, { kind(), cfg(), onBack() })
       kind    'flags' | 'capitals' | 'mix', read per supply drop
       cfg     the question filters (StudyFilters shape), read per drop
       onBack  leave for the setup screen

   Everything is measured in globe radii from the middle of the stage, with
   y pointing down the screen like the canvas.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons;
  var DEG = Math.PI / 180, TAU = Math.PI * 2;

  var STEP = 1 / 120;
  var SHIP_ORBIT = 1.5, SAT_ORBIT = 2.25;
  var TURN = 4.2;                       /* radians a second */
  var FIRE = 0.16, FIRE_RAPID = 0.08, SPREAD = 0.18;
  var BULLET_V = 5.2, BULLET_LIFE = 1.1;
  var ANSWER_V = 6, ANSWER_COOL = 0.35;
  var SHIELDS = 3, STUN = 1;
  var SUPPLY_TIME = 14, SAT_SPIN = 0.22;
  var SPIN = 6;                         /* degrees of longitude a second */
  var THIN = 0.6;

  var SIZES = {
    s: { r: 0.12, hp: 1, pts: 10 },
    m: { r: 0.18, hp: 2, pts: 20 },
    l: { r: 0.26, hp: 3, pts: 30 }
  };
  var POWERS = {
    shield: { label: '+1 shield', icon: 'shield' },
    triple: { label: 'Triple shot', icon: 'target', time: 10 },
    rapid:  { label: 'Rapid fire', icon: 'bolt', time: 8 },
    slow:   { label: 'Slow motion', icon: 'clock', time: 8 }
  };

  /* ---------------------------- the outlines ------------------------
     Per country this time, unlike the hero globe, because a country gets
     lit up: the one a meteor landed on, and the one a supply drop asks
     about. Shared by every run, since the shapes never change. */
  var land = null, landWanted = false;
  function loadLand() {
    if (landWanted || !global.GeoMap || !global.GeoMap.loadShapes) return;
    landWanted = true;
    global.GeoMap.loadShapes().then(function (byName) {
      var list = [], by = {};
      Object.keys(byName || {}).forEach(function (name) {
        var g = byName[name] && byName[name].geometry;
        if (!g) return;
        var polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
        var rings = [], box = [180, 90, -180, -90];
        polys.forEach(function (poly) {
          poly.forEach(function (ring) {
            var flat = [], px = null, py = null;
            for (var i = 0; i < ring.length; i++) {
              var x = ring[i][0], y = ring[i][1];
              if (x < box[0]) box[0] = x; if (y < box[1]) box[1] = y;
              if (x > box[2]) box[2] = x; if (y > box[3]) box[3] = y;
              if (px !== null && Math.abs(x - px) < THIN && Math.abs(y - py) < THIN) continue;
              flat.push(x, y); px = x; py = y;
            }
            if (flat.length >= 8) rings.push(flat);
          });
        });
        if (!rings.length) return;
        var c = { name: name, rings: rings, box: box };
        list.push(c); by[name] = c;
      });
      land = { list: list, by: by };
    }, function () { landWanted = false; });
  }

  function inside(c, lon, lat) {
    var b = c.box;
    if (lon < b[0] || lon > b[2] || lat < b[1] || lat > b[3]) return false;
    var hit = false;
    c.rings.forEach(function (f) {
      for (var i = 0, j = f.length - 2; i < f.length; j = i, i += 2) {
        var yi = f[i + 1], yj = f[j + 1];
        if ((yi > lat) !== (yj > lat) && lon < (f[j] - f[i]) * (lat - yi) / (yj - yi) + f[i]) hit = !hit;
      }
    });
    return hit;
  }

  /* The flags are SVGs with only a viewBox, so each is drawn once onto a
     canvas at 3:2 and the canvas is what the satellites carry. */
  var flags = {};
  function flag(src) {
    if (!src) return null;
    var f = flags[src];
    if (f) return f.ready ? f.canvas : null;
    f = flags[src] = { ready: false, canvas: document.createElement('canvas') };
    f.canvas.width = 120; f.canvas.height = 80;
    var img = new Image();
    img.onload = function () { f.canvas.getContext('2d').drawImage(img, 0, 0, 120, 80); f.ready = true; };
    img.src = src;
    return null;
  }

  function wrap(a) {
    while (a > Math.PI) a -= TAU;
    while (a < -Math.PI) a += TAU;
    return a;
  }
  function ease(t) { t = Math.max(0, Math.min(1, t)); return 1 - Math.pow(1 - t, 3); }

  function mount(host, opts) {
    var esc = W.escapeHtml;
    host.innerHTML =
      '<div class="gd go" tabindex="-1">' +
        '<canvas class="gd__canvas"></canvas>' +
        '<div class="gd__hud">' +
          '<div class="gd__stat"><b class="mono" data-score>0</b><span>points</span></div>' +
          '<div class="gd__stat"><span>wave</span><b class="mono" data-wave>1</b></div>' +
          '<div class="go-shields" data-shields></div>' +
          '<div class="go-powers" data-powers></div>' +
          '<button class="gd__btn" data-pause aria-label="Pause">' + I.pause + '</button>' +
        '</div>' +
        '<div class="game-banner hidden" data-banner></div>' +
        '<div class="gd__layer hidden" data-layer></div>' +
      '</div>';

    var root = host.querySelector('.go');
    var canvas = root.querySelector('canvas');
    var ctx = canvas.getContext('2d');
    var layer = root.querySelector('[data-layer]');
    var banner = root.querySelector('[data-banner]');
    var hud = {
      score: root.querySelector('[data-score]'), wave: root.querySelector('[data-wave]'),
      shields: root.querySelector('[data-shields]'), powers: root.querySelector('[data-powers]')
    };
    var hudWas = {};

    var save = W.state.games.orbit;
    var best = save.best || 0;
    var raf = 0, lastT = 0, acc = 0, clock = 0;
    var view = { w: 0, h: 0, R: 1, cx: 0, cy: 0, dpr: 1, spawn: 6, halfW: 4, rx: SAT_ORBIT, ry: SAT_ORBIT };
    var globe = { lon: -20, lat: 15, tLon: null, tLat: 15 };
    var keys = { left: false, right: false }, aim = null, pointerDown = false;
    var run, holding = false, recentQ = [];
    var stars = [];
    for (var si = 0; si < 150; si++) {
      stars.push({ x: Math.random(), y: Math.random(), s: 0.4 + Math.random() * 1.3, p: Math.random() * TAU });
    }

    loadLand();

    /* ----------------------------- the run ---------------------------- */
    function reset(go) {
      run = {
        state: 'ready', phase: 'wave', wave: 0, score: 0, shields: SHIELDS,
        ship: { a: -Math.PI / 2, stun: 0, cool: 0, ansCool: 0 },
        bullets: [], shots: [], meteors: [], parts: [], texts: [], sats: [], lit: [],
        toSpawn: 0, spawnT: 0, waveT: 0, supplyT: 0, trickleT: 0, resolveT: 0, leaveT: 0,
        shower: 0, showerT: 0, q: null, result: null,
        powers: { triple: 0, rapid: 0, slow: 0 },
        flash: 0, shake: 0, dead: 0, asked: 0, right: 0, kills: 0
      };
      globe.tLon = null;
      banner.classList.add('hidden'); banner.innerHTML = '';
      startWave(1);
      if (go) begin(); else showReady();
      syncHud();
    }

    function begin() {
      run.state = 'play';
      layer.classList.add('hidden'); layer.innerHTML = '';
      root.focus();
    }

    function startWave(n) {
      run.wave = n;
      run.phase = 'wave';
      run.toSpawn = 4 + 2 * n;
      run.spawnT = 1.2;
      run.waveT = 1.8;
      run.sats = []; run.q = null; run.result = null;
      globe.tLon = null;
      banner.classList.add('hidden');
    }

    function interval() { return Math.max(0.55, 1.8 - 0.12 * run.wave); }

    function spawnMeteor(size, fast, at) {
      var a = at === undefined ? Math.random() * TAU : at;
      var x = Math.cos(a) * view.spawn, y = Math.sin(a) * view.spawn;
      var ta = Math.random() * TAU, tr = Math.sqrt(Math.random()) * 0.6;
      var dx = Math.cos(ta) * tr - x, dy = Math.sin(ta) * tr - y, d = Math.hypot(dx, dy);
      var v = 0.5 * Math.min(1.8, 1 + 0.06 * (run.wave - 1));
      if (size === 'l') v *= 0.8; else if (size === 's') v *= 1.15;
      if (fast) v *= 1.6;
      run.meteors.push(meteor(size, fast, x, y, dx / d * v, dy / d * v));
    }

    function meteor(size, fast, x, y, vx, vy) {
      var S = SIZES[size], verts = [], n = 8 + Math.floor(Math.random() * 3);
      for (var i = 0; i < n; i++) verts.push(0.72 + Math.random() * 0.34);
      return {
        size: size, fast: fast, x: x, y: y, vx: vx, vy: vy, r: S.r, hp: S.hp,
        rot: Math.random() * TAU, spin: (Math.random() - 0.5) * 2.4, verts: verts, hit: 0,
        tone: 30 + Math.floor(Math.random() * 16)
      };
    }

    function pickSize() {
      var n = run.wave, roll = Math.random();
      if (n >= 4 && roll < Math.min(0.3, 0.12 + 0.03 * (n - 4))) return ['s', true];
      roll = Math.random();
      if (roll < Math.min(0.4, 0.12 + 0.03 * n)) return ['l', false];
      if (roll < 0.55) return ['m', false];
      return ['s', false];
    }

    /* ----------------------------- stepping --------------------------- */
    function step(dt) {
      var r = run, sh = r.ship;
      clock += dt;
      var slow = r.powers.slow > 0 ? 0.5 : 1;
      Object.keys(r.powers).forEach(function (k) { r.powers[k] = Math.max(0, r.powers[k] - dt); });

      /* a clicked satellite: fly round under it, then fire */
      if (r.pending) {
        if (r.phase !== 'supply' || r.result) r.pending = null;
        else {
          aim = Math.atan2(r.pending.y, r.pending.x);
          if (Math.abs(wrap(aim - sh.a)) < 0.12 && answerShot(r.pending)) r.pending = null;
        }
      }

      /* steering: held keys first, then the pointer, the short way round */
      var dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
      if (dir) sh.a = wrap(sh.a + dir * TURN * dt);
      else if (aim !== null) {
        var diff = wrap(aim - sh.a), most = TURN * dt;
        sh.a = wrap(sh.a + Math.max(-most, Math.min(most, diff)));
      }
      var shipX = Math.cos(sh.a) * SHIP_ORBIT, shipY = Math.sin(sh.a) * SHIP_ORBIT;

      sh.stun = Math.max(0, sh.stun - dt);
      sh.cool -= dt;
      sh.ansCool -= dt;
      if (r.state === 'play' && sh.stun <= 0 && sh.cool <= 0) {
        sh.cool = r.powers.rapid > 0 ? FIRE_RAPID : FIRE;
        var spread = r.powers.triple > 0 ? [-SPREAD, 0, SPREAD] : [0];
        spread.forEach(function (o) {
          var a = sh.a + o;
          r.bullets.push({ x: shipX, y: shipY, vx: Math.cos(a) * BULLET_V, vy: Math.sin(a) * BULLET_V, life: BULLET_LIFE });
        });
      }

      r.bullets = r.bullets.filter(function (b) {
        b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
        if (b.life <= 0) return false;
        for (var i = 0; i < r.meteors.length; i++) {
          var m = r.meteors[i];
          if (m.dead) continue;
          if (Math.hypot(m.x - b.x, m.y - b.y) < m.r + 0.04) { damage(m); return false; }
        }
        return true;
      });

      r.meteors.forEach(function (m) {
        if (m.dead) return;
        m.x += m.vx * dt * slow; m.y += m.vy * dt * slow;
        m.rot += m.spin * dt * slow;
        m.hit = Math.max(0, m.hit - dt);
        var d = Math.hypot(m.x, m.y);
        if (sh.stun <= 0 && Math.hypot(m.x - shipX, m.y - shipY) < m.r + 0.09) {
          m.dead = true;
          sh.stun = STUN;
          burst(m.x, m.y, '#FFB067', 18);
          burst(shipX, shipY, '#fff', 10);
          W.Sound.flip();
        } else if (d <= 1 + 0.35 * m.r) {
          m.dead = true;
          impact(m);
        } else if (d > view.spawn + 1.5) {
          m.dead = true;
        }
      });
      r.meteors = r.meteors.filter(function (m) { return !m.dead; });

      if (r.state !== 'play') return;
      if (r.shower > 0) {
        r.showerT -= dt;
        if (r.showerT <= 0) { r.shower -= 1; r.showerT = 0.4; spawnMeteor('s', false); }
      }

      if (r.phase === 'wave') {
        r.waveT = Math.max(0, r.waveT - dt);
        r.spawnT -= dt;
        if (r.toSpawn > 0 && r.spawnT <= 0) {
          var kind = pickSize();
          spawnMeteor(kind[0], kind[1]);
          r.toSpawn -= 1;
          r.spawnT = interval() * (0.6 + Math.random() * 0.8);
        }
        if (r.toSpawn === 0 && !r.meteors.length && r.shower === 0) waveCleared();
      } else if (r.phase === 'supply') {
        stepSats(dt);
        stepShots(dt);
        if (r.result) {
          r.resolveT -= dt;
          if (r.resolveT <= 0) { r.phase = 'leave'; r.leaveT = 0.9; banner.classList.add('hidden'); }
        } else {
          r.supplyT -= dt;
          r.trickleT -= dt;
          if (r.trickleT <= 0) { r.trickleT = 3.2; spawnMeteor('s', false); }
          if (r.supplyT <= 0) resolve(-1);
        }
      } else if (r.phase === 'leave') {
        stepSats(dt);
        r.leaveT -= dt;
        if (r.leaveT <= 0) startWave(r.wave + 1);
      }
    }

    function damage(m) {
      m.hp -= 1;
      m.hit = 0.12;
      if (m.hp > 0) { burst(m.x, m.y, '#FFE2B8', 4); return; }
      m.dead = true;
      run.kills += 1;
      run.score += m.fast ? 25 : SIZES[m.size].pts;
      burst(m.x, m.y, m.fast ? '#FF9A3D' : '#E8C9A8', m.size === 'l' ? 22 : 12);
      if (m.size === 'l') {
        [-0.35, 0.35].forEach(function (o) {
          var c = Math.cos(o), s = Math.sin(o);
          run.meteors.push(meteor('s', false, m.x, m.y, m.vx * c - m.vy * s, m.vx * s + m.vy * c));
        });
      }
    }

    /* Where a meteor lands is a real place: take the point on the face of
       the globe it came down on and turn it back into a longitude and
       latitude, the inverse of the orthographic projection. */
    function countryAt(dx, dy) {
      if (!land) return null;
      var X = dx * 0.8, Y = -dy * 0.8, rho = Math.hypot(X, Y);
      if (rho < 1e-6) return null;
      var c = Math.asin(Math.min(1, rho)), sc = Math.sin(c), cc = Math.cos(c);
      var p0 = globe.lat * DEG, sp = Math.sin(p0), cp = Math.cos(p0);
      var lat = Math.asin(cc * sp + Y * sc * cp / rho) / DEG;
      var lon = globe.lon + Math.atan2(X * sc, rho * cp * cc - Y * sp * sc) / DEG;
      lon = ((lon + 540) % 360) - 180;
      for (var i = 0; i < land.list.length; i++) if (inside(land.list[i], lon, lat)) return land.list[i].name;
      return null;
    }

    function impact(m) {
      var r = run, d = Math.hypot(m.x, m.y), ux = m.x / d, uy = m.y / d;
      var where = countryAt(ux, uy);
      r.shields = Math.max(0, r.shields - 1);
      r.flash = 0.5; r.shake = Math.max(r.shake, 0.4);
      burst(ux, uy, '#FF5A5F', 20);
      burst(ux, uy, '#FFD23F', 10);
      if (where) r.lit.push({ name: where, color: '255,90,95', life: 2.2 });
      text(ux * 1.45, uy * 1.45, where ? 'Impact: ' + where : 'Splashdown in the ocean', '#FF8A8E', 2.2);
      W.Sound.wrong();
      if (r.shields <= 0 && r.state === 'play') {
        r.state = 'dead'; r.dead = 0; r.shake = 0.9;
        burst(0, 0, '#FF5A5F', 40); burst(0, 0, '#fff', 30);
        banner.classList.add('hidden');
      }
    }

    function waveCleared() {
      var bonus = 50 * run.wave;
      run.score += bonus;
      text(0, -1.25, 'Wave ' + run.wave + ' cleared · +' + bonus, '#7CF3FF', 1.8);
      W.Sound.goal();
      startSupply();
    }

    /* ---------------------------- supply drop ------------------------- */
    function question() {
      var kind = opts.kind();
      var type = kind === 'capitals' ? 'capital' : kind === 'mix' ? W.pick(['capital', 'flagpick']) : 'flagpick';
      var cfg = opts.cfg();
      /* a capital that names its country gives itself away, and a place
         without a flag cannot be asked by flag */
      var ok = function (c) { return global.Quiz.fits(type, c); };
      var chosen = global.StudyFilters.pool(cfg);
      var list = chosen.filter(ok);
      /* stay with the chosen countries if they can be asked the other way */
      if (!list.length) {
        var other = type === 'capital' ? 'flagpick' : 'capital';
        var alt = chosen.filter(function (c) { return global.Quiz.fits(other, c); });
        if (alt.length) { type = other; list = alt; }
      }
      var world = global.Quiz.pool({ scope: 'all' }).filter(ok);
      if (!list.length) list = world;
      var fresh = list.filter(function (c) { return recentQ.indexOf(c.name) === -1; });
      if (fresh.length) list = fresh;
      var head = cfg.weakFirst ? list.slice(0, Math.max(8, Math.ceil(list.length / 3))) : list;
      var target = W.pick(head);
      recentQ.push(target.name);
      if (recentQ.length > 8) recentQ.shift();
      var field = list.length >= 5 ? list : world;
      return global.Quiz.make(type, target, field, { typed: false });
    }

    function startSupply() {
      var r = run;
      r.phase = 'supply';
      r.q = question();
      r.result = null;
      r.asked += 1;
      r.supplyT = SUPPLY_TIME;
      r.trickleT = 3.2;
      r.spin = Math.random() * TAU;
      var flagSats = r.q.type === 'flagpick';
      ctx.font = '700 15px system-ui, sans-serif';
      r.sats = r.q.choices.map(function (c, i) {
        var w = 0.62, h = 0.42, font = 0.15;
        if (!flagSats) {
          w = ctx.measureText(c.text).width / 100 + 0.3;
          if (w > 1.7) { font *= 1.4 / (w - 0.3); w = 1.7; }
          h = 0.32;
        }
        if (flagSats) flag(c.flag);
        return { i: i, choice: c, flag: flagSats, w: w, h: h, font: font, off: i * Math.PI / 2, enter: 0, x: 0, y: 0, mark: null };
      });
      stepSats(0);
      var c = r.q.country;
      if (c.lon !== undefined && c.lat !== undefined) {
        globe.tLon = +c.lon;
        globe.tLat = Math.max(-55, Math.min(55, +c.lat));
      }
      r.lit.push({ name: c.name, color: '255,210,63', life: SUPPLY_TIME + 3, ask: true, lat: +c.lat, lon: +c.lon });
      renderBanner();
    }

    function stepSats(dt) {
      var r = run;
      r.spin += SAT_SPIN * dt;
      r.sats.forEach(function (s) {
        var out;
        if (r.phase === 'leave') { s.enter -= dt / 0.9; out = 3.5 * (1 - ease(s.enter)); }
        else { s.enter = Math.min(1, s.enter + dt / 1.2); out = 3.5 * (1 - ease(s.enter)); }
        var a = r.spin + s.off;
        var x = Math.cos(a) * (view.rx + out), y = Math.sin(a) * (view.ry + out);
        /* long capitals would run off a narrow stage, so keep the whole label on it */
        var mx = view.halfW - s.w / 2 - 0.3 - 0.06;
        if (out < 0.5 && mx > 0) x = Math.max(-mx, Math.min(mx, x));
        s.x = x; s.y = y;
      });
    }

    function satAt(x, y, pad) {
      for (var i = 0; i < run.sats.length; i++) {
        var s = run.sats[i];
        if (Math.abs(x - s.x) <= s.w / 2 + 0.3 + pad && Math.abs(y - s.y) <= s.h / 2 + pad) return s;
      }
      return null;
    }

    /* An answer shot is a separate, slower round. The ordinary fire passes
       through satellites, so holding a direction never answers for you. */
    function answerShot(target) {
      var r = run, sh = r.ship;
      if (r.state !== 'play' || r.phase !== 'supply' || r.result || sh.ansCool > 0 || sh.stun > 0) return false;
      sh.ansCool = ANSWER_COOL;
      var x = Math.cos(sh.a) * SHIP_ORBIT, y = Math.sin(sh.a) * SHIP_ORBIT;
      r.shots.push({ x: x, y: y, vx: Math.cos(sh.a) * ANSWER_V, vy: Math.sin(sh.a) * ANSWER_V, life: 1.2, target: target || null });
      return true;
    }

    function stepShots(dt) {
      var r = run;
      r.shots = r.shots.filter(function (b) {
        if (b.target && !r.result) {
          var dx = b.target.x - b.x, dy = b.target.y - b.y, d = Math.hypot(dx, dy) || 1;
          b.vx = dx / d * ANSWER_V; b.vy = dy / d * ANSWER_V;
        }
        b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
        if (b.life <= 0 || r.result) return false;
        if (Math.hypot(b.x, b.y) < 1) { burst(b.x, b.y, '#7CF3FF', 6); return false; }
        var s = b.target && Math.hypot(b.target.x - b.x, b.target.y - b.y) < 0.12 ? b.target : satAt(b.x, b.y, 0.04);
        if (s && s.enter >= 1) { resolve(s.i); return false; }
        return true;
      });
    }

    function resolve(idx) {
      var r = run, q = r.q;
      var correct = idx >= 0 && q.choices[idx].correct;
      var right = r.sats.filter(function (s) { return s.choice.correct; })[0];
      r.result = { idx: idx, correct: correct, power: null, gains: null };
      r.resolveT = correct ? 1.6 : 2.4;
      r.shots = [];
      if (right) right.mark = 'right';
      if (idx >= 0) {
        var gains = W.award(correct, { country: q.country.name });
        r.result.gains = gains;
        W.save();
        if (global.UI) global.UI.refreshHud(true);
        if (gains.level) W.toast('Level ' + gains.level, 'Nice one, keep it going', I.bolt, 3200);
        W.announceAchievements(W.checkAchievements());
      }
      if (correct) {
        r.right += 1;
        var bonus = 100 + 25 * r.wave;
        r.score += bonus;
        var p = power();
        r.result.power = p;
        burst(right.x, right.y, '#3DDC97', 24);
        text(right.x, right.y - 0.45, '+' + bonus + ' · ' + POWERS[p].label, '#8CF5C2', 2);
        W.Sound.correct(r.result.gains.combo);
      } else {
        if (idx >= 0) r.sats[idx].mark = 'wrong';
        r.shower = idx >= 0 ? 6 : 3;
        r.showerT = 0.9;
        W.Sound.wrong();
      }
      renderBanner();
      if (correct) {
        var anchor = W.$('.game-banner__line', banner);
        if (anchor && r.result.gains) W.burstFrom(anchor, r.result.gains);
      }
      r.lit = r.lit.filter(function (l) { return !l.ask; });
      if (land && land.by[q.country.name]) r.lit.push({ name: q.country.name, color: correct ? '61,220,151' : '255,210,63', life: 3 });
    }

    function power() {
      var r = run, pool = ['triple', 'rapid', 'slow'];
      if (r.shields < SHIELDS) pool.push('shield', 'shield');
      var p = W.pick(pool);
      if (p === 'shield') r.shields += 1;
      else r.powers[p] = POWERS[p].time;
      return p;
    }

    function renderBanner() {
      var r = run, q = r.q, res = r.result;
      var what = q.type === 'flagpick' ? 'flag' : 'capital';
      var html;
      if (!res) {
        html = '<div class="game-banner__line"><span class="game-banner__tag">' + I.sparkle + ' Supply drop</span>' +
            'Shoot the ' + what + ' of <b>' + esc(q.country.name) + '</b></div>' +
          '<div class="game-banner__bar"><i data-timer></i></div>';
      } else if (res.correct) {
        html = '<div class="game-banner__line is-right">' + I.check +
            (what === 'flag' ? 'The flag of <b>' + esc(q.country.name) + '</b>' : '<b>' + esc(q.country.capital) + '</b> is right') + '</div>' +
          '<div class="game-banner__sub">' + esc(POWERS[res.power].label) +
            (res.gains ? ' · +' + res.gains.xp + ' XP · ' + W.gem(res.gains.gems) : '') + '</div>';
      } else {
        html = '<div class="game-banner__line is-wrong">' + I.x + (res.idx < 0 ? 'Out of time: ' : 'Not that one: ') +
            (what === 'flag' ? 'it’s the green one' : 'it’s <b>' + esc(q.country.capital) + '</b>') + '</div>' +
          '<div class="game-banner__sub">Meteor shower incoming</div>';
      }
      banner.innerHTML = html;
      banner.classList.remove('hidden');
      banner.classList.toggle('is-done', !!res);
    }

    /* ----------------------------- effects ---------------------------- */
    function burst(x, y, color, n) {
      for (var i = 0; i < n; i++) {
        var a = Math.random() * TAU, v = 0.4 + Math.random() * 1.6;
        run.parts.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.4 + Math.random() * 0.5, max: 0.9, size: 0.02 + Math.random() * 0.035, color: color });
      }
    }
    function text(x, y, t, color, life) { run.texts.push({ x: x, y: y, t: t, color: color, life: life, max: life }); }

    function tickEffects(dt) {
      var r = run;
      r.parts = r.parts.filter(function (p) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.97; p.vy *= 0.97; return p.life > 0; });
      r.texts = r.texts.filter(function (t) { t.life -= dt; t.y -= 0.12 * dt; return t.life > 0; });
      r.lit = r.lit.filter(function (l) { l.life -= dt; return l.life > 0; });
      r.flash = Math.max(0, r.flash - dt);
      r.shake = Math.max(0, r.shake - dt);

      if (globe.tLon === null || r.phase === 'wave') {
        globe.lon += SPIN * dt;
        globe.lat += (15 - globe.lat) * Math.min(1, dt * 1.5);
      } else {
        globe.lon += wrapDeg(globe.tLon - globe.lon) * Math.min(1, dt * 2.2);
        globe.lat += (globe.tLat - globe.lat) * Math.min(1, dt * 2.2);
      }
      globe.lon = ((globe.lon + 540) % 360) - 180;
    }
    function wrapDeg(d) { return ((d + 540) % 360) - 180; }

    /* ----------------------------- screens ---------------------------- */
    function showReady() {
      layer.innerHTML =
        '<div class="gd-card gd-card--ready">' +
          '<div class="gd-card__eyebrow">' + I.shield + ' Globe Defender</div>' +
          '<h3>Click, tap or press Space</h3>' +
          '<p>Your ship fires on its own. Steer with <b>←</b> <b>→</b> or point with the mouse, and stop the meteors before they land.</p>' +
          '<p>After each wave, shoot the satellite with the right ' + kindWord() + ' for a power-up.</p>' +
        '</div>';
      layer.classList.remove('hidden');
    }
    function kindWord() {
      var k = opts.kind();
      return k === 'capitals' ? 'capital' : k === 'mix' ? 'flag or capital' : 'flag';
    }

    function showPaused() {
      layer.innerHTML =
        '<div class="gd-card gd-card--ready">' +
          '<div class="gd-card__eyebrow">Paused</div>' +
          '<h3>Press Space or tap to carry on</h3>' +
          '<div class="gd-card__row">' +
            '<button class="btn btn--accent" data-unpause>' + I.play + ' Resume</button>' +
            '<button class="btn btn--ghost" data-back>Quit run</button>' +
          '</div>' +
        '</div>';
      layer.classList.remove('hidden');
      W.$('[data-unpause]', layer).addEventListener('click', function (e) { e.stopPropagation(); unpause(); });
      W.$('[data-back]', layer).addEventListener('click', function (e) { e.stopPropagation(); finish(true); });
    }

    function pause() {
      if (!run || run.state !== 'play') return;
      run.state = 'paused';
      keys.left = keys.right = false;
      showPaused();
    }
    function unpause() {
      if (run.state !== 'paused') return;
      run.state = 'play';
      layer.classList.add('hidden'); layer.innerHTML = '';
      root.focus();
    }

    function finish(quit) {
      if (run.state === 'over') return;
      var isBest = !quit && run.score > best;
      if (isBest) best = run.score;
      save.best = best;
      save.runs = (save.runs || 0) + 1;
      save.bestWave = Math.max(save.bestWave || 0, run.wave);
      W.save();
      run.state = 'over';
      banner.classList.add('hidden');
      if (quit) { opts.onBack(); return; }
      if (isBest && run.score > 0) W.Sound.finish();

      layer.innerHTML =
        '<div class="gd-card gd-card--over">' +
          '<div class="gd-card__eyebrow">' + (isBest && run.score > 0 ? I.trophy + ' New best · ' : '') + 'Shields down</div>' +
          '<h3>The globe took one too many</h3>' +
          '<p>You held out until wave ' + run.wave + ' and got ' + run.right + ' of ' + run.asked + ' supply drops right.</p>' +
          '<div class="gd-stats">' +
            '<div><b class="mono">' + run.score + '</b><span>Points</span></div>' +
            '<div><b class="mono">' + run.wave + '</b><span>Wave</span></div>' +
            '<div><b class="mono">' + best + '</b><span>Best</span></div>' +
          '</div>' +
          '<div class="gd-card__row">' +
            '<button class="btn btn--accent" data-again>' + I.refresh + ' Play again</button>' +
            '<button class="btn btn--ghost" data-back>Back</button>' +
          '</div>' +
          '<div class="gd-card__hint">Space or Enter to play again</div>' +
        '</div>';
      layer.classList.remove('hidden');
      W.$('[data-again]', layer).addEventListener('click', function (e) { e.stopPropagation(); reset(true); });
      W.$('[data-back]', layer).addEventListener('click', function (e) { e.stopPropagation(); opts.onBack(); });
      syncHud();
    }

    /* ------------------------------ input ----------------------------- */
    function press() {
      if (!run) return;
      if (run.state === 'ready') begin();
      else if (run.state === 'paused') unpause();
      else if (run.state === 'over') reset(true);
      else if (run.state === 'play') answerShot(null);
    }

    function onKey(e) {
      if (!document.body.classList.contains('view-games')) return;
      if (document.querySelector('.overlay')) return;
      var t = e.target;
      if (t && (/INPUT|TEXTAREA|SELECT/.test(t.tagName) || t.isContentEditable)) return;
      var k = e.key, down = e.type === 'keydown';
      var left = k === 'ArrowLeft' || k === 'a' || k === 'A';
      var right = k === 'ArrowRight' || k === 'd' || k === 'D';
      if (left || right) {
        e.preventDefault();
        if (left) keys.left = down; else keys.right = down;
        if (down) aim = null;
        return;
      }
      if (!down) return;
      if ((k === 'Escape' || k === 'p' || k === 'P') && run.state === 'play') { e.preventDefault(); pause(); return; }
      if (k === ' ' || (k === 'Enter' && run.state !== 'play')) {
        e.preventDefault();
        if (e.repeat && run.state !== 'play') return;
        if (k === 'Enter' && t && t.tagName === 'BUTTON' && layer.contains(t)) return;
        press();
      }
    }

    function toWorld(e) {
      var b = canvas.getBoundingClientRect();
      return { x: (e.clientX - b.left - view.cx) / view.R, y: (e.clientY - b.top - view.cy) / view.R };
    }
    function onMove(e) {
      if (e.pointerType !== 'mouse' && !pointerDown) return;
      if (!run || run.state !== 'play') return;
      var p = toWorld(e);
      if (Math.hypot(p.x, p.y) > 0.3) aim = Math.atan2(p.y, p.x);
    }
    function onDown(e) {
      if (e.target.closest('button, .gd-card--over, .game-banner')) return;
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      if (!run) return;
      if (run.state !== 'play') { press(); return; }
      pointerDown = true;
      var p = toWorld(e);
      if (Math.hypot(p.x, p.y) > 0.3) aim = Math.atan2(p.y, p.x);
      if (run.phase === 'supply' && !run.result) {
        var s = satAt(p.x, p.y, 0.15);
        if (s && s.enter >= 1) run.pending = s;
      }
    }
    function onUp() { pointerDown = false; }
    function onBlur() { keys.left = keys.right = false; pointerDown = false; }
    function onVisible() { if (document.hidden) pause(); }

    document.addEventListener('keydown', onKey);
    document.addEventListener('keyup', onKey);
    root.addEventListener('pointerdown', onDown);
    root.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisible);
    root.querySelector('[data-pause]').addEventListener('click', function (e) {
      e.stopPropagation();
      if (run.state === 'play') pause(); else if (run.state === 'paused') unpause();
    });

    /* ------------------------------ sizing ---------------------------- */
    /* The top of the stage belongs to the HUD and the supply-drop banner, so
       the globe and the satellite path are fitted into what is left below.
       On a wide stage the satellites fly a flattened ellipse, which keeps
       the globe large without the top one sliding under the banner. */
    function resize() {
      var w = root.clientWidth || 800, phone = w < 620;
      var h = phone ? Math.round(w * 1.2) : Math.round(Math.max(360, Math.min(600, w * 0.62)));
      var top = phone ? 100 : 110, bottom = 12, satH = 0.24, satW = 0.65;
      view.rx = phone ? SAT_ORBIT : 2.9;
      view.ry = phone ? SAT_ORBIT : 1.95;
      var room = h - top - bottom;
      view.w = w; view.h = h;
      view.R = Math.min(room / (2 * (view.ry + satH)), (w / 2 - 8) / (view.rx + satW), Math.min(w, h) * 0.2);
      view.cx = w / 2;
      view.cy = top + room / 2;
      view.halfW = w / 2 / view.R;
      view.spawn = Math.hypot(view.halfW, Math.max(view.cy, h - view.cy) / view.R) + 0.4;
      view.dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.style.height = h + 'px';
      canvas.width = Math.round(w * view.dpr);
      canvas.height = Math.round(h * view.dpr);
      if (run) draw();
    }
    var ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(root); else window.addEventListener('resize', resize);

    /* ------------------------------ drawing --------------------------- */
    function X(x) { return view.cx + x * view.R; }
    function Y(y) { return view.cy + y * view.R; }

    function draw() {
      var r = run, c = ctx, R = view.R;
      c.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);

      var bg = c.createRadialGradient(view.cx, view.cy, R * 0.5, view.cx, view.cy, Math.max(view.w, view.h) * 0.75);
      bg.addColorStop(0, '#16205a');
      bg.addColorStop(0.55, '#0b1238');
      bg.addColorStop(1, '#050817');
      c.fillStyle = bg;
      c.fillRect(0, 0, view.w, view.h);
      stars.forEach(function (s) {
        c.globalAlpha = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(clock * 1.6 + s.p));
        c.fillStyle = '#fff';
        c.fillRect(s.x * view.w, s.y * view.h, s.s, s.s);
      });
      c.globalAlpha = 1;

      var shake = r.shake > 0 ? (Math.random() - 0.5) * r.shake * 16 : 0;
      c.save();
      c.translate(shake, shake * 0.7);

      c.beginPath();
      c.arc(X(0), Y(0), SHIP_ORBIT * R, 0, TAU);
      c.strokeStyle = 'rgba(124,243,255,.10)';
      c.setLineDash([4, 8]);
      c.lineWidth = 1;
      c.stroke();
      c.setLineDash([]);

      drawGlobe(X(0), Y(0), R);

      if (r.phase === 'supply' || r.phase === 'leave') {
        c.beginPath();
        c.ellipse(X(0), Y(0), view.rx * R, view.ry * R, 0, 0, TAU);
        c.strokeStyle = 'rgba(255,210,63,.10)';
        c.lineWidth = 1;
        c.stroke();
        r.sats.forEach(drawSat);
      }

      c.fillStyle = '#FFE27A';
      r.bullets.forEach(function (b) {
        c.beginPath(); c.arc(X(b.x), Y(b.y), Math.max(1.6, R * 0.022), 0, TAU); c.fill();
      });
      r.shots.forEach(function (b) {
        c.save();
        c.shadowColor = '#7CF3FF'; c.shadowBlur = 14;
        c.fillStyle = '#C6FBFF';
        c.beginPath(); c.arc(X(b.x), Y(b.y), Math.max(3, R * 0.045), 0, TAU); c.fill();
        c.restore();
      });

      r.meteors.forEach(drawMeteor);
      if (r.state !== 'dead' && r.state !== 'over') drawShip();

      r.parts.forEach(function (p) {
        c.globalAlpha = Math.max(0, Math.min(1, p.life / p.max * 1.4));
        c.fillStyle = p.color;
        var s = p.size * R;
        c.fillRect(X(p.x) - s / 2, Y(p.y) - s / 2, s, s);
      });
      c.globalAlpha = 1;

      c.textAlign = 'center';
      r.texts.forEach(function (t) {
        c.globalAlpha = Math.min(1, t.life / 0.5);
        c.font = '700 ' + Math.max(12, Math.round(R * 0.14)) + 'px system-ui, sans-serif';
        c.lineWidth = 4; c.strokeStyle = 'rgba(5,8,23,.85)';
        var tx = Math.max(70, Math.min(view.w - 70, X(t.x)));
        c.strokeText(t.t, tx, Y(t.y));
        c.fillStyle = t.color;
        c.fillText(t.t, tx, Y(t.y));
      });
      c.globalAlpha = 1;

      if (r.phase === 'wave' && r.waveT > 0 && r.state !== 'ready') {
        c.globalAlpha = Math.min(1, r.waveT / 0.6);
        c.font = '800 ' + Math.round(R * 0.4) + 'px system-ui, sans-serif';
        c.lineWidth = 6; c.strokeStyle = 'rgba(5,8,23,.7)';
        c.strokeText('Wave ' + r.wave, X(0), Y(0) + R * 0.14);
        c.fillStyle = '#fff';
        c.fillText('Wave ' + r.wave, X(0), Y(0) + R * 0.14);
        c.globalAlpha = 1;
      }
      c.restore();

      if (r.flash > 0) {
        c.fillStyle = 'rgba(255,60,70,' + (r.flash * 0.4) + ')';
        c.fillRect(0, 0, view.w, view.h);
      }
    }

    function drawGlobe(cx, cy, R) {
      var c = ctx, r = run;
      var p0 = globe.lat * DEG, sp = Math.sin(p0), cp = Math.cos(p0);

      var air = c.createRadialGradient(cx, cy, R * 0.95, cx, cy, R * 1.35);
      air.addColorStop(0, 'rgba(110,170,255,.35)');
      air.addColorStop(1, 'rgba(110,170,255,0)');
      c.fillStyle = air;
      c.beginPath(); c.arc(cx, cy, R * 1.35, 0, TAU); c.fill();

      var sea = c.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
      sea.addColorStop(0, '#4f8ff0');
      sea.addColorStop(0.6, '#2156c4');
      sea.addColorStop(1, '#0f2f82');
      c.fillStyle = sea;
      c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.fill();

      c.save();
      c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.clip();
      c.strokeStyle = 'rgba(255,255,255,.08)';
      c.lineWidth = 0.6;
      c.beginPath();
      var a, t, line;
      for (a = -60; a <= 60; a += 30) { line = []; for (t = -180; t <= 180; t += 5) line.push(t, a); ring(line, cx, cy, R, sp, cp, false); }
      for (a = -180; a < 180; a += 30) { line = []; for (t = -85; t <= 85; t += 5) line.push(a, t); ring(line, cx, cy, R, sp, cp, false); }
      c.stroke();

      if (land) {
        c.beginPath();
        land.list.forEach(function (k) { k.rings.forEach(function (f) { ring(f, cx, cy, R, sp, cp, true); }); });
        c.fillStyle = '#4FC38A';
        c.fill('evenodd');
        c.strokeStyle = 'rgba(12,60,40,.55)';
        c.lineWidth = 0.6;
        c.stroke();
        r.lit.forEach(function (l) {
          var k = land.by[l.name];
          if (!k) return;
          var pulse = l.ask ? 0.75 + 0.25 * Math.sin(clock * 5) : Math.min(1, l.life);
          c.beginPath();
          k.rings.forEach(function (f) { ring(f, cx, cy, R, sp, cp, true); });
          c.fillStyle = 'rgba(' + l.color + ',' + (0.95 * pulse) + ')';
          c.fill('evenodd');
          c.strokeStyle = 'rgba(255,255,255,' + (0.8 * pulse) + ')';
          c.lineWidth = 1.2;
          c.stroke();
        });
      }

      /* small countries are a few pixels on a globe this size, so the one
         being asked about also gets a ring round it */
      r.lit.forEach(function (l) {
        if (!l.ask || isNaN(l.lat) || isNaN(l.lon)) return;
        var dl = (l.lon - globe.lon) * DEG, ph = l.lat * DEG;
        if (sp * Math.sin(ph) + cp * Math.cos(ph) * Math.cos(dl) <= 0.05) return;
        var mx = cx + R * Math.cos(ph) * Math.sin(dl), my = cy - R * (cp * Math.sin(ph) - sp * Math.cos(ph) * Math.cos(dl));
        var k = (clock * 1.2) % 1;
        c.strokeStyle = 'rgba(255,210,63,' + (1 - k) + ')';
        c.lineWidth = 2;
        c.beginPath(); c.arc(mx, my, R * (0.06 + 0.12 * k), 0, TAU); c.stroke();
        c.fillStyle = '#FFD23F';
        c.beginPath(); c.arc(mx, my, Math.max(2, R * 0.025), 0, TAU); c.fill();
      });

      var shade = c.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.2, cx, cy, R * 1.05);
      shade.addColorStop(0, 'rgba(255,255,255,.12)');
      shade.addColorStop(0.55, 'rgba(0,0,0,0)');
      shade.addColorStop(1, 'rgba(2,6,30,.5)');
      c.fillStyle = shade;
      c.fillRect(cx - R, cy - R, R * 2, R * 2);
      c.restore();

      if (r.shields > 0 && r.state !== 'dead') {
        c.beginPath();
        c.arc(cx, cy, R * 1.14, 0, TAU);
        c.strokeStyle = r.flash > 0 ? 'rgba(255,120,120,.8)' : 'rgba(124,243,255,' + (0.1 + 0.1 * r.shields) + ')';
        c.lineWidth = 1 + r.shields;
        c.stroke();
      }
    }

    /* One ring. Points round the back are pulled onto the edge rather than
       dropped, so a country half over the horizon still fills cleanly up to
       the limb instead of being closed with a chord across its face. */
    function ring(f, cx, cy, R, sp, cp, closed) {
      var c = ctx, seen = false, i, pts = [];
      for (i = 0; i < f.length; i += 2) {
        var dl = (f[i] - globe.lon) * DEG, p = f[i + 1] * DEG;
        var cosP = Math.cos(p), sinP = Math.sin(p), cosDl = Math.cos(dl);
        var x = cosP * Math.sin(dl), y = cp * sinP - sp * cosP * cosDl;
        var front = sp * sinP + cp * cosP * cosDl > 0;
        if (front) seen = true;
        else if (closed) { var n = Math.hypot(x, y) || 1; x /= n; y /= n; }
        pts.push(x, y, front);
      }
      if (!seen) return;
      var open = false;
      for (i = 0; i < pts.length; i += 3) {
        if (!closed && !pts[i + 2]) { open = false; continue; }
        var px = cx + R * pts[i], py = cy - R * pts[i + 1];
        if (open) c.lineTo(px, py); else { c.moveTo(px, py); open = true; }
      }
      if (closed) c.closePath();
    }

    function drawMeteor(m) {
      var c = ctx, R = view.R, x = X(m.x), y = Y(m.y), rr = m.r * R;
      if (m.fast) {
        var d = Math.hypot(m.vx, m.vy) || 1;
        var g = c.createLinearGradient(x, y, x - m.vx / d * rr * 4, y - m.vy / d * rr * 4);
        g.addColorStop(0, 'rgba(255,154,61,.7)');
        g.addColorStop(1, 'rgba(255,154,61,0)');
        c.strokeStyle = g; c.lineWidth = rr * 1.2; c.lineCap = 'round';
        c.beginPath(); c.moveTo(x, y); c.lineTo(x - m.vx / d * rr * 4, y - m.vy / d * rr * 4); c.stroke();
        c.lineCap = 'butt';
      }
      c.beginPath();
      for (var i = 0; i < m.verts.length; i++) {
        var a = m.rot + i / m.verts.length * TAU, k = m.verts[i] * rr;
        if (i) c.lineTo(x + Math.cos(a) * k, y + Math.sin(a) * k); else c.moveTo(x + Math.cos(a) * k, y + Math.sin(a) * k);
      }
      c.closePath();
      var hpLeft = m.hp / SIZES[m.size].hp;
      c.fillStyle = m.hit > 0 ? '#fff' : m.fast ? '#C2662B' : 'hsl(' + m.tone + ',' + (18 + 10 * hpLeft) + '%,' + (34 + 10 * (1 - hpLeft)) + '%)';
      c.fill();
      c.strokeStyle = m.fast ? '#FFB067' : 'rgba(255,230,200,.55)';
      c.lineWidth = 1.5;
      c.stroke();
      c.fillStyle = 'rgba(0,0,0,.22)';
      c.beginPath(); c.arc(x - rr * 0.2, y - rr * 0.15, rr * 0.22, 0, TAU); c.fill();
    }

    function drawShip() {
      var c = ctx, R = view.R, sh = run.ship;
      if (sh.stun > 0 && Math.floor(clock * 14) % 2) return;
      var x = X(Math.cos(sh.a) * SHIP_ORBIT), y = Y(Math.sin(sh.a) * SHIP_ORBIT), s = Math.max(9, R * 0.11);
      if (run.phase === 'supply' && !run.result) {
        c.strokeStyle = 'rgba(124,243,255,.35)';
        c.setLineDash([3, 6]);
        c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(x, y);
        var reach = Math.max(view.rx, view.ry) + 0.6;
        c.lineTo(X(Math.cos(sh.a) * reach), Y(Math.sin(sh.a) * reach));
        c.stroke();
        c.setLineDash([]);
      }
      c.save();
      c.translate(x, y);
      c.rotate(sh.a);
      c.fillStyle = 'rgba(124,243,255,' + (0.5 + 0.3 * Math.sin(clock * 30)) + ')';
      c.beginPath(); c.moveTo(-s * 0.55, -s * 0.3); c.lineTo(-s * 1.05, 0); c.lineTo(-s * 0.55, s * 0.3); c.fill();
      c.beginPath();
      c.moveTo(s * 1.05, 0);
      c.lineTo(-s * 0.7, -s * 0.78);
      c.lineTo(-s * 0.4, 0);
      c.lineTo(-s * 0.7, s * 0.78);
      c.closePath();
      c.fillStyle = sh.stun > 0 ? '#ccc' : run.powers.rapid > 0 ? '#FF9A3D' : run.powers.triple > 0 ? '#C38BFF' : '#FFD23F';
      c.fill();
      c.strokeStyle = '#fff'; c.lineWidth = 1.5;
      c.stroke();
      c.restore();
    }

    function drawSat(s) {
      var c = ctx, R = view.R, x = X(s.x), y = Y(s.y), w = s.w * R, h = s.h * R;
      c.globalAlpha = Math.max(0, Math.min(1, s.enter * 1.5));
      var pw = 0.3 * R;
      c.strokeStyle = 'rgba(200,215,255,.8)'; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(x - w / 2 - pw, y); c.lineTo(x + w / 2 + pw, y); c.stroke();
      [-1, 1].forEach(function (side) {
        var px = side < 0 ? x - w / 2 - pw : x + w / 2 + pw * 0.15;
        c.fillStyle = '#1d3d8f';
        c.fillRect(px, y - h * 0.32, pw * 0.85, h * 0.64);
        c.strokeStyle = 'rgba(160,190,255,.9)'; c.lineWidth = 1;
        c.strokeRect(px, y - h * 0.32, pw * 0.85, h * 0.64);
        c.beginPath(); c.moveTo(px + pw * 0.42, y - h * 0.32); c.lineTo(px + pw * 0.42, y + h * 0.32); c.stroke();
      });
      var pad = Math.max(2, R * 0.03);
      if (s.mark) {
        c.save();
        c.shadowColor = s.mark === 'right' ? '#3DDC97' : '#FF5A5F'; c.shadowBlur = 18;
        c.fillStyle = s.mark === 'right' ? '#3DDC97' : '#FF5A5F';
        c.fillRect(x - w / 2 - pad * 2, y - h / 2 - pad * 2, w + pad * 4, h + pad * 4);
        c.restore();
      }
      if (s.flag) {
        c.fillStyle = '#fff';
        c.fillRect(x - w / 2 - pad, y - h / 2 - pad, w + pad * 2, h + pad * 2);
        var img = flag(s.choice.flag);
        if (img) c.drawImage(img, x - w / 2, y - h / 2, w, h);
        else { c.fillStyle = '#c9d2e3'; c.fillRect(x - w / 2, y - h / 2, w, h); }
      } else {
        c.fillStyle = '#fff';
        rounded(x - w / 2, y - h / 2, w, h, h / 2);
        c.fill();
        c.fillStyle = '#0b1640';
        c.textAlign = 'center';
        c.font = '700 ' + Math.max(10, Math.round(s.font * R)) + 'px system-ui, sans-serif';
        c.fillText(s.choice.text, x, y + s.font * R * 0.36);
      }
      c.globalAlpha = 1;
    }

    function rounded(x, y, w, h, r) {
      var c = ctx;
      c.beginPath();
      c.moveTo(x + r, y);
      c.arcTo(x + w, y, x + w, y + h, r);
      c.arcTo(x + w, y + h, x, y + h, r);
      c.arcTo(x, y + h, x, y, r);
      c.arcTo(x, y, x + w, y, r);
      c.closePath();
    }

    function syncHud() {
      var r = run;
      if (hudWas.score !== r.score) { hudWas.score = r.score; hud.score.textContent = r.score; }
      if (hudWas.wave !== r.wave) { hudWas.wave = r.wave; hud.wave.textContent = r.wave; }
      if (hudWas.shields !== r.shields) {
        hudWas.shields = r.shields;
        var s = '';
        for (var i = 0; i < SHIELDS; i++) s += '<span class="' + (i < r.shields ? '' : 'is-off') + '">' + I.shield + '</span>';
        hud.shields.innerHTML = s;
        hud.shields.setAttribute('aria-label', r.shields + ' shields left');
      }
      var pw = Object.keys(r.powers).filter(function (k) { return r.powers[k] > 0; }).map(function (k) {
        return '<span class="go-chip go-chip--' + k + '">' + I[POWERS[k].icon] + POWERS[k].label + ' ' + Math.ceil(r.powers[k]) + 's</span>';
      }).join('');
      if (hudWas.powers !== pw) { hudWas.powers = pw; hud.powers.innerHTML = pw; }
      var timer = r.phase === 'supply' && !r.result && W.$('[data-timer]', banner);
      if (timer) timer.style.width = Math.max(0, r.supplyT / SUPPLY_TIME * 100) + '%';
    }

    /* ------------------------------- loop ----------------------------- */
    function frame(t) {
      raf = requestAnimationFrame(frame);
      var dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 0;
      lastT = t;
      if (!run) return;
      var r = run;
      if (r.state === 'play' || r.state === 'dead') {
        acc += dt;
        while (acc >= STEP) { step(STEP); acc -= STEP; }
      } else {
        acc = 0;
        clock += dt;
      }
      if (r.state === 'dead') {
        r.dead += dt;
        if (r.dead > 1.4) finish();
      }
      var moving = r.state === 'play' || r.state === 'dead';
      if (moving !== holding) { holding = moving; W.holdToasts(moving); }
      if (r.state !== 'paused') tickEffects(dt);
      draw();
      syncHud();
    }

    resize();
    reset();
    raf = requestAnimationFrame(frame);

    return {
      destroy: function () {
        cancelAnimationFrame(raf);
        if (holding) { holding = false; W.holdToasts(false); }
        document.removeEventListener('keydown', onKey);
        document.removeEventListener('keyup', onKey);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        window.removeEventListener('blur', onBlur);
        document.removeEventListener('visibilitychange', onVisible);
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize);
        host.innerHTML = '';
        run = null;
      },
      /* for tests */
      get run() { return run; },
      get globe() { return globe; },
      get view() { return view; },
      press: press,
      aim: function (a) { aim = a; },
      answer: function (i) { var s = run && run.sats[i]; if (s) run.pending = s; return !!s; },
      countryAt: countryAt
    };
  }

  global.GeoOrbit = { mount: mount };
})(window);
