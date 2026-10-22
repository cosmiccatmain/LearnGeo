/* ------------------------------------------------------------------
   LearnGeo — Geo Golf
   Top-down golf on the flat world map. Each hole names a country, or a
   capital whose country you have to find, and there is no pin to aim
   at: you putt to where you think it is. Stop in the wrong country and
   it is named, so you learn the neighbours; stop in the sea and it is a
   water hazard. After a few misses the pin comes out as a hint, and a
   hole that runs out of strokes is picked up and the country shown.

     GeoGolf.mount(host, { kind(), holes(), cfg(), onBack() })
       kind    'countries' | 'capitals' | 'mix', read per hole
       holes   holes in a round, read when a round starts
       cfg     the question filters (StudyFilters shape), read per round
       onBack  leave for the setup screen

   The course is the part of the map the filtered countries cover, drawn
   once to an offscreen canvas. Positions on it are course units: degrees
   of latitude down, and degrees of longitude across scaled by the cosine
   of the middle latitude, so a unit is the same length both ways.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons, TAU = Math.PI * 2;

  var MAX_STROKES = 6, HINT_AFTER = 3;
  var REACH = 0.55;          /* the longest putt, as a share of the course width */
  var ROLL_TIME = 1.7;       /* seconds a full-power putt rolls for */
  var SINK_SPEED = 0.4;      /* share of full speed below which the ball drops in */
  var SMALL_PX = 16;         /* a target narrower than this is played to a cup */
  var THIN = 0.12;
  var NAMES = { '-3': 'Albatross', '-2': 'Eagle', '-1': 'Birdie', '0': 'Par', '1': 'Bogey', '2': 'Double bogey', '3': 'Triple bogey' };

  /* ---------------------------- the outlines ------------------------ */
  var land = null, landWanted = false, landWaiters = [];
  function loadLand(done) {
    if (land) return done();
    landWaiters.push(done);
    if (landWanted) return;
    landWanted = true;
    var finish = function () { var w = landWaiters; landWaiters = []; w.forEach(function (f) { f(); }); };
    if (!global.GeoMap || !global.GeoMap.loadShapes) { land = { list: [], by: {} }; return finish(); }
    global.GeoMap.loadShapes().then(function (byName) {
      var list = [], by = {};
      Object.keys(byName || {}).forEach(function (name) {
        var g = byName[name] && byName[name].geometry;
        if (!g) return;
        var polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
        var rings = [], box = [999, 90, -999, -90];
        polys.forEach(function (poly) {
          poly.forEach(function (ring) {
            var flat = [], px = null, py = null, rb = [999, -999];
            for (var i = 0; i < ring.length; i++) {
              var x = ring[i][0], y = ring[i][1];
              if (x < box[0]) box[0] = x; if (y < box[1]) box[1] = y;
              if (x > box[2]) box[2] = x; if (y > box[3]) box[3] = y;
              if (x < rb[0]) rb[0] = x; if (x > rb[1]) rb[1] = x;
              if (px !== null && Math.abs(x - px) < THIN && Math.abs(y - py) < THIN) continue;
              flat.push(x, y); px = x; py = y;
            }
            if (flat.length >= 6) { flat.lo = rb[0]; flat.hi = rb[1]; rings.push(flat); }
          });
        });
        if (!rings.length) return;
        var c = { name: name, rings: rings, box: box };
        list.push(c); by[name] = c;
      });
      land = { list: list, by: by };
      finish();
    }, function () { land = { list: [], by: {} }; finish(); });
  }

  function inside(c, lon, lat) {
    var b = c.box;
    if (lat < b[1] || lat > b[3]) return false;
    for (var off = -360; off <= 360; off += 360) {
      var x = lon + off;
      if (x < b[0] || x > b[2]) continue;
      var hit = false;
      c.rings.forEach(function (f) {
        for (var i = 0, j = f.length - 2; i < f.length; j = i, i += 2) {
          var yi = f[i + 1], yj = f[j + 1];
          if ((yi > lat) !== (yj > lat) && x < (f[j] - f[i]) * (lat - yi) / (yj - yi) + f[i]) hit = !hit;
        }
      });
      if (hit) return true;
    }
    return false;
  }

  function countryAt(lon, lat) {
    for (var i = 0; i < land.list.length; i++) if (inside(land.list[i], lon, lat)) return land.list[i];
    return null;
  }

  function toPar(n) { return n === 0 ? 'E' : n > 0 ? '+' + n : '−' + Math.abs(n); }

  function mount(host, opts) {
    var esc = W.escapeHtml;
    host.innerHTML =
      '<div class="gd gg" tabindex="-1">' +
        '<canvas class="gd__canvas"></canvas>' +
        '<div class="gd__hud">' +
          '<div class="gd__stat"><span>hole</span><b class="mono" data-hole>1</b></div>' +
          '<div class="gd__stat"><b class="mono" data-strokes>0</b><span data-strokes-l>strokes</span></div>' +
          '<div class="gd__stat"><b class="mono" data-par>E</b><span>to par</span></div>' +
          '<div class="gg-tip" data-tip></div>' +
          '<button class="gd__btn" data-pause aria-label="Pause">' + I.pause + '</button>' +
        '</div>' +
        '<div class="game-banner hidden" data-banner></div>' +
        '<div class="gd__layer hidden" data-layer></div>' +
      '</div>';

    var root = host.querySelector('.gg');
    var canvas = root.querySelector('canvas');
    var ctx = canvas.getContext('2d');
    var layer = root.querySelector('[data-layer]');
    var banner = root.querySelector('[data-banner]');
    var hud = {
      hole: root.querySelector('[data-hole]'), strokes: root.querySelector('[data-strokes]'),
      strokesL: root.querySelector('[data-strokes-l]'), par: root.querySelector('[data-par]'),
      tip: root.querySelector('[data-tip]')
    };
    var hudWas = {};

    var save = W.state.games.golf;
    var raf = 0, lastT = 0, clock = 0;
    var view = { w: 0, h: 0, k: 1, ox: 0, oy: 0, aw: 0, ah: 0, u0: 0, v0: 0, dpr: 1 };
    var off = document.createElement('canvas');
    var paths = {};
    var run = null, holding = false, recent = [], drag = null, keys = {};

    /* ----------------------------- the run ---------------------------- */
    function reset(go) {
      var holes = +opts.holes() || 9;
      run = {
        state: 'loading', go: !!go, holes: holes, hole: 0, cards: [],
        list: [], course: null, target: null, type: 'country', par: 2,
        strokes: 0, hinted: false, ball: null, rest: null, vel: null, trail: [],
        aim: { a: -Math.PI / 4, p: 0.5 }, landed: null, result: null, small: false,
        parts: [], texts: [], timer: 0, sunkAt: null, reveal: false
      };
      layer.innerHTML = '<div class="gd-card gd-card--ready"><div class="gd-card__eyebrow">' + I.pin + ' Geo Golf</div><h3>Laying out the course…</h3></div>';
      layer.classList.remove('hidden');
      banner.classList.add('hidden');
      var mine = run;
      loadLand(function () { if (run === mine) setUp(); });
    }

    function setUp() {
      var r = run, cfg = opts.cfg();
      var world = global.Quiz.pool({ scope: 'all' }).filter(placed);
      var list = global.StudyFilters.pool(cfg).filter(placed);
      if (!list.length) list = world;
      r.list = list;
      r.weak = cfg.weakFirst;
      r.course = makeCourse(list);
      resize();
      var first = W.pick(list);
      r.ball = { u: U(first.lon), v: V(first.lat) };
      r.rest = { u: r.ball.u, v: r.ball.v };
      nextHole(true);
      if (r.go) begin(); else { r.state = 'ready'; showReady(); }
    }

    function placed(c) { return isFinite(c.lat) && isFinite(c.lon); }

    /* The part of the map the countries cover, padded, and never so small
       that one country fills it. A set across the date line (the Pacific
       islands) is measured the other way round the world. */
    function makeCourse(list) {
      var lons = list.map(function (c) { return c.lon; });
      var lats = list.map(function (c) { return c.lat; });
      var span = function (a) { return Math.max.apply(null, a) - Math.min.apply(null, a); };
      var east = lons.map(function (l) { return l < 0 ? l + 360 : l; });
      var shift = span(east) < span(lons) - 1;
      var L = shift ? east : lons;
      var lo = Math.min.apply(null, L) - 12, hi = Math.max.apply(null, L) + 12;
      var la0 = Math.min.apply(null, lats) - 9, la1 = Math.max.apply(null, lats) + 9;
      if (hi - lo > 200) { lo = -180; hi = 180; shift = false; la0 = Math.min(la0, -56); la1 = Math.max(la1, 76); }
      if (hi - lo < 44) { var m = (hi + lo) / 2; lo = m - 22; hi = m + 22; }
      if (la1 - la0 < 26) { var n = (la1 + la0) / 2; la0 = n - 13; la1 = n + 13; }
      la0 = Math.max(-78, la0); la1 = Math.min(84, la1);
      var cos = Math.max(0.35, Math.cos((la0 + la1) / 2 * Math.PI / 180));
      return { shift: shift, lo: lo, hi: hi, la0: la0, la1: la1, cos: cos, w: (hi - lo) * cos, h: la1 - la0 };
    }

    function U(lon) { var c = run.course; if (c.shift && lon < 0) lon += 360; return (lon - c.lo) * c.cos; }
    function V(lat) { return run.course.la1 - lat; }
    function lonOf(u) { var l = u / run.course.cos + run.course.lo; while (l > 180) l -= 360; while (l < -180) l += 360; return l; }
    function latOf(v) { return run.course.la1 - v; }

    function reach() { return REACH * view.aw / view.k; }
    function decel() { var d = reach(); return 2 * d / (ROLL_TIME * ROLL_TIME); }
    function topSpeed() { return 2 * reach() / ROLL_TIME; }

    /* ------------------------------ holes ----------------------------- */
    function nextHole(first) {
      var r = run;
      if (!first) r.hole += 1;
      r.strokes = 0; r.hinted = false; r.landed = null; r.result = null; r.reveal = false; r.sunkAt = null;
      r.trail = [];
      var kind = opts.kind();
      r.type = kind === 'capitals' ? 'capital' : kind === 'mix' ? W.pick(['country', 'capital']) : 'country';
      var type = r.type;
      var ok = function (c) { return type !== 'capital' || global.Quiz.fits('capital', c); };
      var list = r.list.filter(ok);
      if (!list.length) { r.type = 'country'; list = r.list; }
      var minD = 0.12 * view.aw / view.k;
      var far = list.filter(function (c) { return dist(c) >= minD && recent.indexOf(c.name) === -1; });
      if (!far.length) far = list.filter(function (c) { return dist(c) >= minD; });
      if (!far.length) far = list;
      var head = r.weak ? far.slice(0, Math.max(6, Math.ceil(far.length / 3))) : far;
      r.target = W.pick(head);
      recent.push(r.target.name);
      if (recent.length > 8) recent.shift();
      if (dist(r.target) < minD || inTarget()) tee(minD);
      var d = dist(r.target);
      r.par = d <= reach() * 0.92 ? 2 : 3;
      var shape = land.by[r.target.name];
      var pb = shape && boxPx(shape);
      r.small = !pb || pb.w < SMALL_PX || pb.h < SMALL_PX;
      renderBanner();
    }

    function dist(c) { var r = run; return Math.hypot(U(c.lon) - r.ball.u, V(c.lat) - r.ball.v); }

    function inTarget() {
      var shape = land.by[run.target.name], b = run.ball;
      return !!shape && inside(shape, lonOf(b.u), latOf(b.v));
    }

    /* The ball would start on (or in) the hole, which happens when the
       filters leave only a country or two: tee off from another capital
       on the course instead, a putt or so away. */
    function tee(minD) {
      var r = run, t = r.target, tu = U(t.lon), tv = V(t.lat);
      var u0 = view.u0, u1 = u0 + view.aw / view.k, v0 = view.v0, v1 = v0 + view.ah / view.k;
      var spots = global.Quiz.pool({ scope: 'all' }).filter(placed).map(function (c) {
        return { name: c.name, u: U(c.lon), v: V(c.lat) };
      }).filter(function (s) {
        var d = Math.hypot(s.u - tu, s.v - tv);
        return s.name !== t.name && s.u > u0 && s.u < u1 && s.v > v0 && s.v < v1 && d >= minD && d <= reach() * 1.6;
      });
      var s = spots.length ? W.pick(spots) : null;
      if (!s) {
        var a = Math.random() * TAU, d = Math.max(minD, reach() * 0.5);
        s = { u: Math.max(u0, Math.min(u1, tu + Math.cos(a) * d)), v: Math.max(v0, Math.min(v1, tv + Math.sin(a) * d)) };
      }
      r.ball = { u: s.u, v: s.v };
      r.rest = { u: s.u, v: s.v };
      r.trail = [];
    }

    function boxPx(shape) {
      var b = shape.box;
      return { w: (b[2] - b[0]) * run.course.cos * view.k, h: (b[3] - b[1]) * view.k };
    }

    function renderBanner() {
      var r = run, t = r.target;
      var name = r.type === 'capital' ? t.capital : t.name;
      var html = '<div class="game-banner__line"><span class="game-banner__tag">' + I.pin + ' Hole ' + (r.hole + 1) + ' · Par ' + r.par + '</span>' +
        'Putt to <b>' + esc(name) + '</b></div>';
      var res = r.result;
      if (res) html += '<div class="game-banner__sub ' + (res.good ? 'is-right' : res.bad ? 'is-wrong' : '') + '">' + res.html + '</div>';
      else if (r.type === 'capital') html += '<div class="game-banner__sub">Land in the country it’s the capital of</div>';
      banner.innerHTML = html;
      banner.classList.remove('hidden');
    }

    function say(html, good, bad) { run.result = { html: html, good: good, bad: bad }; renderBanner(); }

    /* ----------------------------- putting ---------------------------- */
    function putt() {
      var r = run;
      if (r.state !== 'aim' || r.aim.p < 0.03) return;
      var v0 = Math.sqrt(2 * decel() * r.aim.p * reach());
      r.vel = { u: Math.cos(r.aim.a) * v0, v: Math.sin(r.aim.a) * v0 };
      r.rest = { u: r.ball.u, v: r.ball.v };
      r.strokes += 1;
      r.landed = null;
      r.trail = [{ u: r.ball.u, v: r.ball.v }];
      r.state = 'roll';
      if (r.result && !r.hinted) { r.result = null; renderBanner(); }
      W.Sound.flip();
    }

    function roll(dt) {
      var r = run, b = r.ball, sp = Math.hypot(r.vel.u, r.vel.v);
      var ns = Math.max(0, sp - decel() * dt);
      if (sp > 0) { r.vel.u *= ns / sp; r.vel.v *= ns / sp; }
      b.u += r.vel.u * dt; b.v += r.vel.v * dt;
      var u0 = view.u0, u1 = view.u0 + view.aw / view.k, v0 = view.v0, v1 = view.v0 + view.ah / view.k;
      var edge = 4 / view.k;
      if (b.u < u0 + edge) { b.u = u0 + edge; r.vel.u = Math.abs(r.vel.u) * 0.6; }
      if (b.u > u1 - edge) { b.u = u1 - edge; r.vel.u = -Math.abs(r.vel.u) * 0.6; }
      if (b.v < v0 + edge) { b.v = v0 + edge; r.vel.v = Math.abs(r.vel.v) * 0.6; }
      if (b.v > v1 - edge) { b.v = v1 - edge; r.vel.v = -Math.abs(r.vel.v) * 0.6; }
      var last = r.trail[r.trail.length - 1];
      if (Math.hypot(b.u - last.u, b.v - last.v) * view.k > 6) r.trail.push({ u: b.u, v: b.v });
      if (ns < topSpeed() * SINK_SPEED && holed()) return sink();
      if (ns === 0) stopped();
    }

    function holed() {
      var r = run, b = r.ball, t = r.target;
      var shape = land.by[t.name];
      if (shape && inside(shape, lonOf(b.u), latOf(b.v))) return true;
      if (r.small || !land.list.length) {
        var cup = (view.w < 620 ? 11 : 13) / view.k;
        return Math.hypot(b.u - U(t.lon), b.v - V(t.lat)) < cup;
      }
      return false;
    }

    function stopped() {
      var r = run, b = r.ball;
      if (holed()) return sink();
      var c = land.list.length ? countryAt(lonOf(b.u), latOf(b.v)) : null;
      if (!c && land.list.length) {
        r.strokes += 1;
        splash(b.u, b.v);
        b.u = r.rest.u; b.v = r.rest.v;
        r.trail = [];
        W.Sound.wrong();
        if (r.strokes >= MAX_STROKES) return pickUp();
        say(I.x + ' Splash! Water hazard, +1 stroke', false, true);
      } else {
        r.landed = c;
        W.Sound.wrong();
        if (r.strokes >= MAX_STROKES) return pickUp();
        say(I.x + ' You landed in ' + esc(c ? c.name : 'the wrong place'), false, true);
      }
      if (!r.hinted && r.strokes >= HINT_AFTER) {
        r.hinted = true;
        r.result.html += ' · the pin is out';
        renderBanner();
      }
      r.state = 'aim';
    }

    function sink() {
      var r = run, t = r.target;
      r.vel = null;
      r.state = 'sunk';
      r.timer = 1.9;
      r.sunkAt = { u: r.ball.u, v: r.ball.v };
      var diff = r.strokes - r.par;
      r.cards.push({ par: r.par, strokes: r.strokes, name: t.name });
      finishQuestion(!r.hinted);
      var label = r.strokes === 1 ? 'Hole in one!' : (NAMES[diff] || (diff > 0 ? '+' + diff : diff));
      var where = r.type === 'capital' ? esc(t.capital) + ' is in ' + esc(t.name) : 'That’s ' + esc(t.name);
      say(I.check + ' ' + label + ' ' + where, true, false);
      confetti(r.ball.u, r.ball.v);
      text(r.ball.u, r.ball.v, r.strokes === 1 ? 'Hole in one!' : label, '#FFE27A');
      if (r.strokes === 1) W.Sound.finish(); else W.Sound.correct(diff <= 0 ? 3 : 1);
    }

    function pickUp() {
      var r = run, t = r.target;
      r.vel = null;
      r.state = 'reveal';
      r.reveal = true;
      r.timer = 2.8;
      r.cards.push({ par: r.par, strokes: MAX_STROKES + 1, name: t.name, picked: true });
      finishQuestion(false);
      say(I.x + ' Picked up. ' + (r.type === 'capital' ? esc(t.capital) + ' is in ' + esc(t.name) + ', at the pin' : esc(t.name) + ' is at the pin'), false, true);
    }

    function finishQuestion(correct) {
      var gains = W.award(correct, { country: run.target.name });
      W.save();
      if (global.UI) global.UI.refreshHud(true);
      if (gains.level) W.toast('Level ' + gains.level, 'Nice one, keep it going', I.bolt, 3200);
      W.announceAchievements(W.checkAchievements());
    }

    function afterHole() {
      var r = run;
      if (r.reveal) {
        r.ball = { u: U(r.target.lon), v: V(r.target.lat) };
        r.rest = { u: r.ball.u, v: r.ball.v };
      }
      if (r.cards.length >= r.holes) return finish();
      r.state = 'aim';
      nextHole();
    }

    /* ----------------------------- effects ---------------------------- */
    function burst(u, v, colors, n, speed) {
      for (var i = 0; i < n; i++) {
        var a = Math.random() * TAU, s = (0.3 + Math.random()) * speed;
        run.parts.push({ u: u, v: v, vu: Math.cos(a) * s, vv: Math.sin(a) * s, life: 0.6 + Math.random() * 0.6, max: 1.2,
          size: 2 + Math.random() * 3, color: colors[i % colors.length] });
      }
    }
    function confetti(u, v) { burst(u, v, ['#FFD23F', '#FF6B6B', '#7CF3FF', '#fff', '#9BE15D'], 40, 90 / view.k); }
    function splash(u, v) { burst(u, v, ['#cfe9ff', '#fff', '#7fc3ff'], 22, 50 / view.k); }
    function text(u, v, t, color) { run.texts.push({ u: u, v: v, t: t, color: color, life: 1.4, max: 1.4 }); }

    function tickEffects(dt) {
      var r = run;
      r.parts = r.parts.filter(function (p) { p.life -= dt; p.u += p.vu * dt; p.v += p.vv * dt; p.vu *= 0.92; p.vv *= 0.92; return p.life > 0; });
      r.texts = r.texts.filter(function (t) { t.life -= dt; t.v -= 18 / view.k * dt; return t.life > 0; });
    }

    /* ----------------------------- screens ---------------------------- */
    function showReady() {
      var r = run;
      layer.innerHTML =
        '<div class="gd-card gd-card--ready">' +
          '<div class="gd-card__eyebrow">' + I.pin + ' Geo Golf · ' + r.holes + ' holes</div>' +
          '<h3>Press Space or tap to tee off</h3>' +
          '<p>Drag back from anywhere on the course, like a slingshot, and let go to putt; or aim with ← →, set the power with ↑ ↓ and press Space.</p>' +
          '<p>There’s no pin to aim at: putt to where the country is. The sea is a water hazard, and after ' + HINT_AFTER + ' misses the pin comes out.</p>' +
        '</div>';
      layer.classList.remove('hidden');
    }

    function begin() {
      run.state = 'aim';
      layer.classList.add('hidden'); layer.innerHTML = '';
      root.focus();
    }

    function showPaused() {
      layer.innerHTML =
        '<div class="gd-card gd-card--ready">' +
          '<div class="gd-card__eyebrow">Paused</div>' +
          '<h3>Press Space or tap to carry on</h3>' +
          '<div class="gd-card__row">' +
            '<button class="btn btn--accent" data-unpause>' + I.play + ' Resume</button>' +
            '<button class="btn btn--ghost" data-back>Quit round</button>' +
          '</div>' +
        '</div>';
      layer.classList.remove('hidden');
      W.$('[data-unpause]', layer).addEventListener('click', function (e) { e.stopPropagation(); unpause(); });
      W.$('[data-back]', layer).addEventListener('click', function (e) { e.stopPropagation(); quit(); });
    }

    function playing() { var s = run && run.state; return s === 'aim' || s === 'roll' || s === 'sunk' || s === 'reveal'; }

    function pause() {
      if (!playing()) return;
      run.was = run.state;
      run.state = 'paused';
      drag = null;
      showPaused();
    }
    function unpause() {
      if (run.state !== 'paused') return;
      run.state = run.was;
      layer.classList.add('hidden'); layer.innerHTML = '';
      root.focus();
    }
    function quit() {
      save.rounds = (save.rounds || 0) + (run.cards.length ? 1 : 0);
      W.save();
      run.state = 'over';
      opts.onBack();
    }

    function finish() {
      var r = run;
      r.state = 'over';
      var strokes = 0, par = 0, aces = 0;
      r.cards.forEach(function (c) { strokes += c.strokes; par += c.par; if (c.strokes === 1) aces += 1; });
      var diff = strokes - par;
      var bests = save.best || (save.best = {});
      var key = String(r.holes);
      var isBest = bests[key] === undefined || diff < bests[key];
      if (isBest) bests[key] = diff;
      save.aces = (save.aces || 0) + aces;
      save.rounds = (save.rounds || 0) + 1;
      W.save();
      if (isBest) W.Sound.finish();

      var how = diff === 0 ? 'level par' : Math.abs(diff) + (diff < 0 ? ' under par' : ' over par');
      layer.innerHTML =
        '<div class="gd-card gd-card--over">' +
          '<div class="gd-card__eyebrow">' + (isBest ? I.trophy + ' New best · ' : '') + 'Round complete</div>' +
          '<h3>You went round in ' + strokes + '</h3>' +
          '<p>That’s ' + how + ' for ' + r.holes + ' holes' + (aces ? ', with ' + aces + (aces === 1 ? ' hole' : ' holes') + ' in one' : '') + '.</p>' +
          '<div class="gg-card">' + r.cards.map(function (c, i) {
            var d = c.strokes - c.par;
            return '<span class="' + (c.picked ? 'is-picked' : d < 0 ? 'is-under' : d > 0 ? 'is-over' : '') + '" title="' + esc(c.name) + '">' +
              '<i>' + (i + 1) + '</i><b class="mono">' + (c.picked ? '–' : c.strokes) + '</b></span>';
          }).join('') + '</div>' +
          '<div class="gd-stats">' +
            '<div><b class="mono">' + toPar(diff) + '</b><span>To par</span></div>' +
            '<div><b class="mono">' + aces + '</b><span>Holes in one</span></div>' +
            '<div><b class="mono">' + toPar(bests[key]) + '</b><span>Best, ' + r.holes + ' holes</span></div>' +
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
    }

    /* ------------------------------ input ----------------------------- */
    function press() {
      if (!run) return;
      if (run.state === 'ready') begin();
      else if (run.state === 'paused') unpause();
      else if (run.state === 'over') reset(true);
    }

    function onKey(e) {
      if (!document.body.classList.contains('view-games')) return;
      if (document.querySelector('.overlay')) return;
      var t = e.target;
      if (t && (/INPUT|TEXTAREA|SELECT/.test(t.tagName) || t.isContentEditable)) return;
      var k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (/^Arrow/.test(k) || 'wasd'.indexOf(k) !== -1 && k.length === 1) {
        if (run.state === 'aim') { e.preventDefault(); keys[k] = true; }
        return;
      }
      if ((k === 'Escape' || k === 'p') && playing()) { e.preventDefault(); pause(); return; }
      if (k === ' ' || k === 'Enter') {
        if (k === 'Enter' && t && t.tagName === 'BUTTON' && layer.contains(t)) return;
        e.preventDefault();
        if (e.repeat) return;
        if (run.state === 'aim') putt();
        else if (!playing()) press();
      }
    }
    function onKeyUp(e) {
      var k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      delete keys[k];
    }

    function onDown(e) {
      if (e.target.closest('button, .gd-card--over')) return;
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      if (!run) return;
      if (run.state === 'aim') { drag = { x: e.clientX, y: e.clientY }; return; }
      if (!playing()) press();
    }
    function onMove(e) {
      if (!drag || !run || run.state !== 'aim') return;
      var dx = drag.x - e.clientX, dy = drag.y - e.clientY, len = Math.hypot(dx, dy);
      if (len < 6) return;
      run.aim.a = Math.atan2(dy, dx);
      run.aim.p = Math.min(1, len / (0.32 * Math.min(view.w, view.h)));
      drag.moved = true;
    }
    function onUp() {
      if (drag && drag.moved && run && run.state === 'aim') putt();
      drag = null;
    }
    function onVisible() { if (document.hidden) pause(); }

    document.addEventListener('keydown', onKey);
    document.addEventListener('keyup', onKeyUp);
    root.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    document.addEventListener('visibilitychange', onVisible);
    root.querySelector('[data-pause]').addEventListener('click', function (e) {
      e.stopPropagation();
      if (run.state === 'paused') unpause(); else pause();
    });

    /* ------------------------------ sizing ---------------------------- */
    /* The HUD and the banner sit above the course. The course is as tall
       as its shape wants, within limits, and the view widens one way or
       the other so the whole drawing area is playable. */
    function resize() {
      var w = root.clientWidth || 800, phone = w < 620;
      var top = phone ? 96 : 108, pad = phone ? 8 : 12;
      view.w = w;
      view.aw = w - pad * 2;
      view.dpr = Math.min(2, window.devicePixelRatio || 1);
      var c = run && run.course;
      var aspect = c ? c.w / c.h : 2;
      view.ah = Math.round(Math.max(phone ? 220 : 280, Math.min(phone ? 440 : 500, view.aw / aspect)));
      view.h = top + view.ah + pad;
      view.ox = pad; view.oy = top;
      canvas.style.height = view.h + 'px';
      canvas.width = Math.round(w * view.dpr);
      canvas.height = Math.round(view.h * view.dpr);
      if (!c) return;
      view.k = Math.min(view.aw / c.w, view.ah / c.h);
      view.u0 = c.w / 2 - view.aw / view.k / 2;
      view.v0 = c.h / 2 - view.ah / view.k / 2;
      if (run.ball) {
        var b = run.ball;
        b.u = Math.max(view.u0, Math.min(view.u0 + view.aw / view.k, b.u));
        b.v = Math.max(view.v0, Math.min(view.v0 + view.ah / view.k, b.v));
      }
      if (run.target) {
        var shape = land.by[run.target.name], pb = shape && boxPx(shape);
        run.small = !pb || pb.w < SMALL_PX || pb.h < SMALL_PX;
      }
      renderCourse();
    }
    var ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(function () { if (run && run.course) resize(); }) : null;
    if (ro) ro.observe(root); else window.addEventListener('resize', resize);

    /* The map, drawn once: sea, a strip of sand round every coast, the
       fairway mown in stripes, and the countries in play a brighter green
       than the rough around them. */
    function renderCourse() {
      var c = run.course, k = view.k, dpr = view.dpr;
      off.width = Math.round(view.aw * dpr);
      off.height = Math.round(view.ah * dpr);
      var o = off.getContext('2d');
      o.setTransform(dpr, 0, 0, dpr, 0, 0);
      var sea = o.createLinearGradient(0, 0, 0, view.ah);
      sea.addColorStop(0, '#3a8fd0'); sea.addColorStop(1, '#2b72b3');
      o.fillStyle = sea;
      o.fillRect(0, 0, view.aw, view.ah);
      o.strokeStyle = 'rgba(255,255,255,.06)'; o.lineWidth = 1;
      for (var y = 10; y < view.ah; y += 16) {
        o.beginPath();
        for (var x = 0; x <= view.aw; x += 12) o.lineTo(x, y + Math.sin(x / 22 + y) * 2);
        o.stroke();
      }
      paths = {};
      if (!land.list.length) return;
      var lonA = c.lo + view.u0 / c.cos, lonB = lonA + view.aw / k / c.cos;
      var latA = c.la1 - view.v0, latB = latA - view.ah / k;
      var inPlay = {};
      run.list.forEach(function (x) { inPlay[x.name] = 1; });
      var all = new Path2D();
      land.list.forEach(function (s) {
        if (s.box[1] > latA || s.box[3] < latB) return;
        var p = null;
        s.rings.forEach(function (f) {
          for (var shift = -360; shift <= 360; shift += 360) {
            if (f.hi + shift < lonA || f.lo + shift > lonB) continue;
            p = p || new Path2D();
            var lx = null, ly = null;
            for (var i = 0; i < f.length; i += 2) {
              var px = (f[i] + shift - c.lo) * c.cos * k - view.u0 * k;
              var py = (c.la1 - f[i + 1]) * k - view.v0 * k;
              if (i && Math.abs(px - lx) < 0.7 && Math.abs(py - ly) < 0.7) continue;
              if (i) p.lineTo(px, py); else p.moveTo(px, py);
              lx = px; ly = py;
            }
            p.closePath();
          }
        });
        if (!p) return;
        paths[s.name] = p;
        all.addPath(p);
      });
      o.lineJoin = 'round';
      o.strokeStyle = '#ead9a2'; o.lineWidth = 3.4;
      Object.keys(paths).forEach(function (n) { o.stroke(paths[n]); });
      Object.keys(paths).forEach(function (n) {
        o.fillStyle = inPlay[n] ? '#68b654' : '#4b9140';
        o.fill(paths[n]);
      });
      o.save();
      o.clip(all);
      o.strokeStyle = 'rgba(255,255,255,.07)'; o.lineWidth = 9;
      for (var d = -view.ah; d < view.aw; d += 24) { o.beginPath(); o.moveTo(d, 0); o.lineTo(d + view.ah, view.ah); o.stroke(); }
      o.restore();
      o.strokeStyle = 'rgba(28,66,24,.6)'; o.lineWidth = 0.8;
      Object.keys(paths).forEach(function (n) { o.stroke(paths[n]); });
    }

    /* ------------------------------ drawing --------------------------- */
    function X(u) { return view.ox + (u - view.u0) * view.k; }
    function Y(v) { return view.oy + (v - view.v0) * view.k; }

    function draw() {
      var c = ctx, r = run;
      c.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      var bg = c.createLinearGradient(0, 0, 0, view.h);
      bg.addColorStop(0, '#0d2c1d'); bg.addColorStop(1, '#071a10');
      c.fillStyle = bg;
      c.fillRect(0, 0, view.w, view.h);
      if (!r || !r.course || !r.ball) return;

      c.save();
      c.beginPath(); c.rect(view.ox, view.oy, view.aw, view.ah); c.clip();
      c.drawImage(off, view.ox, view.oy, view.aw, view.ah);

      c.translate(view.ox, view.oy);
      if (r.landed && paths[r.landed.name] && r.state === 'aim') {
        c.fillStyle = 'rgba(255,110,110,.42)'; c.fill(paths[r.landed.name]);
        c.strokeStyle = '#FFB3B3'; c.lineWidth = 1.5; c.stroke(paths[r.landed.name]);
      }
      var tp = paths[r.target.name];
      if (tp && (r.state === 'sunk' || r.reveal)) {
        c.fillStyle = 'rgba(255,214,64,.5)'; c.fill(tp);
        c.strokeStyle = '#FFE27A'; c.lineWidth = 1.8; c.stroke(tp);
      }
      c.translate(-view.ox, -view.oy);

      if (r.trail.length > 1) {
        c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 2; c.setLineDash([3, 5]);
        c.beginPath();
        r.trail.forEach(function (p, i) { if (i) c.lineTo(X(p.u), Y(p.v)); else c.moveTo(X(p.u), Y(p.v)); });
        c.lineTo(X(r.ball.u), Y(r.ball.v));
        c.stroke(); c.setLineDash([]);
      }

      if (r.hinted || r.reveal || r.state === 'sunk') drawPin(r.state === 'sunk' ? r.sunkAt : { u: U(r.target.lon), v: V(r.target.lat) });
      if (r.landed && r.state === 'aim') label(r.landed.name, r.ball, '#FFB3B3');
      if (r.state === 'aim') drawAim();
      if (r.state !== 'sunk') drawBall(r.ball, 1);
      else drawBall(r.sunkAt, Math.max(0, (r.timer - 1.4) / 0.5));

      r.parts.forEach(function (p) {
        c.globalAlpha = Math.max(0, Math.min(1, p.life / p.max * 1.6));
        c.fillStyle = p.color;
        c.fillRect(X(p.u) - p.size / 2, Y(p.v) - p.size / 2, p.size, p.size);
      });
      c.globalAlpha = 1;
      c.textAlign = 'center';
      c.font = '800 17px system-ui, sans-serif';
      r.texts.forEach(function (t) {
        c.globalAlpha = Math.min(1, t.life / 0.4);
        c.lineWidth = 4; c.strokeStyle = 'rgba(6,26,16,.85)';
        c.strokeText(t.t, X(t.u), Y(t.v) - 18);
        c.fillStyle = t.color;
        c.fillText(t.t, X(t.u), Y(t.v) - 18);
      });
      c.globalAlpha = 1;
      c.restore();
    }

    function drawBall(b, size) {
      if (!b || size <= 0) return;
      var c = ctx, x = X(b.u), y = Y(b.v), rr = (view.w < 620 ? 5 : 6) * size;
      c.fillStyle = 'rgba(0,0,0,.3)';
      c.beginPath(); c.ellipse(x + 2, y + 2.5, rr, rr * 0.8, 0, 0, TAU); c.fill();
      var g = c.createRadialGradient(x - rr * 0.35, y - rr * 0.35, rr * 0.1, x, y, rr);
      g.addColorStop(0, '#fff'); g.addColorStop(1, '#d9dee6');
      c.fillStyle = g;
      c.beginPath(); c.arc(x, y, rr, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 1; c.stroke();
    }

    function drawPin(at) {
      var c = ctx, x = X(at.u), y = Y(at.v), pulse = 1 + Math.sin(clock * 5) * 0.15;
      c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = 2;
      c.beginPath(); c.arc(x, y, 10 * pulse, 0, TAU); c.stroke();
      c.fillStyle = 'rgba(10,30,20,.7)';
      c.beginPath(); c.ellipse(x, y, 5, 3.5, 0, 0, TAU); c.fill();
      c.strokeStyle = '#f4f4f4'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - 26); c.stroke();
      c.fillStyle = '#FF5A5F';
      c.beginPath(); c.moveTo(x, y - 26); c.lineTo(x + 14, y - 21); c.lineTo(x, y - 16); c.closePath(); c.fill();
    }

    function drawAim() {
      var r = run, c = ctx, b = r.ball, len = r.aim.p * reach();
      var ex = b.u + Math.cos(r.aim.a) * len, ey = b.v + Math.sin(r.aim.a) * len;
      var u0 = view.u0, u1 = view.u0 + view.aw / view.k, v0 = view.v0, v1 = view.v0 + view.ah / view.k;
      ex = Math.max(u0, Math.min(u1, ex)); ey = Math.max(v0, Math.min(v1, ey));
      c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 2.5; c.setLineDash([2, 7]); c.lineCap = 'round';
      c.beginPath(); c.moveTo(X(b.u), Y(b.v)); c.lineTo(X(ex), Y(ey)); c.stroke();
      c.setLineDash([]); c.lineCap = 'butt';
      c.strokeStyle = '#fff'; c.lineWidth = 2;
      c.beginPath(); c.arc(X(ex), Y(ey), 7, 0, TAU); c.stroke();
      var x = X(b.u), y = Y(b.v);
      c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 4;
      c.beginPath(); c.arc(x, y, 15, -Math.PI / 2, -Math.PI / 2 + TAU); c.stroke();
      c.strokeStyle = r.aim.p > 0.85 ? '#FF8A5B' : '#FFD23F';
      c.beginPath(); c.arc(x, y, 15, -Math.PI / 2, -Math.PI / 2 + TAU * r.aim.p); c.stroke();
    }

    function label(t, at, color) {
      var c = ctx, x = X(at.u), y = Y(at.v) + 24;
      c.font = '700 12px system-ui, sans-serif';
      var w = c.measureText(t).width + 14;
      x = Math.max(view.ox + w / 2 + 2, Math.min(view.ox + view.aw - w / 2 - 2, x));
      if (y > view.oy + view.ah - 6) y = Y(at.v) - 26;
      c.fillStyle = 'rgba(8,24,16,.82)';
      rounded(x - w / 2, y - 10, w, 20, 10); c.fill();
      c.fillStyle = color; c.textAlign = 'center';
      c.fillText(t, x, y + 4);
    }

    function rounded(x, y, w, h, rr) {
      var c = ctx;
      c.beginPath();
      c.moveTo(x + rr, y);
      c.arcTo(x + w, y, x + w, y + h, rr);
      c.arcTo(x + w, y + h, x, y + h, rr);
      c.arcTo(x, y + h, x, y, rr);
      c.arcTo(x, y, x + w, y, rr);
      c.closePath();
    }

    function syncHud() {
      var r = run;
      var hole = r.course ? Math.min(r.hole + 1, r.holes) + '/' + r.holes : '';
      var played = 0;
      r.cards.forEach(function (c) { played += c.strokes - c.par; });
      var vals = { hole: hole, strokes: String(r.strokes), par: toPar(played),
        tip: r.state === 'aim' && r.hole === 0 && r.strokes === 0 ? 'Drag back to aim · let go to putt' : '' };
      Object.keys(vals).forEach(function (k) {
        if (hudWas[k] !== vals[k]) { hudWas[k] = vals[k]; hud[k].textContent = vals[k]; }
      });
      var sl = r.strokes === 1 ? 'stroke' : 'strokes';
      if (hudWas.sl !== sl) { hudWas.sl = sl; hud.strokesL.textContent = sl; }
    }

    /* ------------------------------- loop ----------------------------- */
    function frame(t) {
      raf = requestAnimationFrame(frame);
      var dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 0;
      lastT = t;
      clock += dt;
      if (!run) return;
      var r = run;
      if (r.state === 'aim') {
        if (keys.ArrowLeft || keys.a) r.aim.a -= 1.8 * dt;
        if (keys.ArrowRight || keys.d) r.aim.a += 1.8 * dt;
        if (keys.ArrowUp || keys.w) r.aim.p = Math.min(1, r.aim.p + 0.7 * dt);
        if (keys.ArrowDown || keys.s) r.aim.p = Math.max(0, r.aim.p - 0.7 * dt);
      } else if (r.state === 'roll') {
        var steps = 4;
        for (var i = 0; i < steps && r.state === 'roll'; i++) roll(dt / steps);
      } else if (r.state === 'sunk' || r.state === 'reveal') {
        r.timer -= dt;
        if (r.timer <= 0) afterHole();
      }
      var on = playing();
      if (on !== holding) { holding = on; W.holdToasts(on); }
      if (r.state !== 'paused') tickEffects(dt);
      draw();
      if (r.course) syncHud();
    }

    resize();
    reset();
    raf = requestAnimationFrame(frame);

    return {
      destroy: function () {
        cancelAnimationFrame(raf);
        if (holding) { holding = false; W.holdToasts(false); }
        document.removeEventListener('keydown', onKey);
        document.removeEventListener('keyup', onKeyUp);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        document.removeEventListener('visibilitychange', onVisible);
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize);
        host.innerHTML = '';
        run = null;
      },
      /* for tests */
      get run() { return run; },
      get view() { return view; },
      press: press,
      /* the angle and power that would stop the ball at a place, ignoring the edges */
      shotTo: function (lon, lat) {
        var b = run.ball, du = U(lon) - b.u, dv = V(lat) - b.v;
        return { a: Math.atan2(dv, du), p: Math.hypot(du, dv) / reach() };
      },
      aim: function (a, p) { run.aim.a = a; run.aim.p = Math.max(0, Math.min(1, p)); },
      putt: putt,
      spotIn: function (name) {
        var s = land.by[name];
        var t = run.list.concat(global.Quiz.pool({ scope: 'all' })).filter(function (x) { return x.name === name; })[0];
        if (!s || (t && inside(s, t.lon, t.lat))) return t ? { lon: t.lon, lat: t.lat } : null;
        for (var i = 0; i < 4000; i++) {
          var lon = s.box[0] + Math.random() * (s.box[2] - s.box[0]), lat = s.box[1] + Math.random() * (s.box[3] - s.box[1]);
          if (inside(s, lon, lat)) return { lon: lon > 180 ? lon - 360 : lon, lat: lat };
        }
        return null;
      },
      seaNear: function () {
        for (var i = 0; i < 4000; i++) {
          var u = view.u0 + Math.random() * view.aw / view.k, v = view.v0 + Math.random() * view.ah / view.k;
          var lat = latOf(v);
          if (Math.abs(lat) < 70 && !countryAt(lonOf(u), lat) && Math.hypot(u - run.ball.u, v - run.ball.v) < reach() * 0.9) return { lon: lonOf(u), lat: lat };
        }
        return null;
      }
    };
  }

  global.GeoGolf = { mount: mount };
})(window);
