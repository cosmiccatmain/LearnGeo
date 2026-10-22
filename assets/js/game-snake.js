/* ------------------------------------------------------------------
   LearnGeo — Capital Snake
   Snake, where the food is the answer. The banner names a country and
   four capitals (or flags) lie on the board. Eat the right one and the
   snake grows, speeds up and wears that country's flag on its head; eat
   a wrong one and it loses part of its tail. Walls and your own tail end
   the game as in the original, unless walls are set to wrap.

     GeoSnake.mount(host, { kind(), speed(), walls(), cfg(), onBack() })
       kind    'capitals' | 'flags' | 'mix', read per question
       speed   'relaxed' | 'normal' | 'fast', read when a game starts
       walls   'solid' | 'wrap', read when a game starts
       cfg     the question filters (StudyFilters shape), read per question
       onBack  leave for the setup screen

   Positions are grid cells, x across and y down. The snake moves a whole
   cell per tick and is drawn part of the way to its next cell between
   ticks, so it glides instead of jumping.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons, TAU = Math.PI * 2;

  var GRID = { wide: [24, 14], phone: [14, 16] };
  var SPEEDS = { relaxed: 2.75, normal: 3.75, fast: 4.75 };   /* cells a second */
  var SPEED_UP = 0.15, MAX_SPEED = 7;
  var START_LEN = 4, GROW = 3, CUT = 3;
  var RESULT_TIME = 2.6;
  var LABEL_FONT = 0.5, LABEL_MAX = 6;                     /* in cells */

  /* The flags are SVGs with only a viewBox, so each is drawn once onto a
     canvas at 3:2 and the canvas is what gets drawn on the board. */
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

  function mount(host, opts) {
    var esc = W.escapeHtml;
    host.innerHTML =
      '<div class="gd sn" tabindex="-1">' +
        '<canvas class="gd__canvas"></canvas>' +
        '<div class="gd__hud">' +
          '<div class="gd__stat"><b class="mono" data-score>0</b><span>points</span></div>' +
          '<div class="gd__stat"><b class="mono" data-caps>0</b><span data-caps-l>capitals</span></div>' +
          '<div class="gd__stat"><b class="mono" data-len>0</b><span>long</span></div>' +
          '<div class="sn-streak" data-streak></div>' +
          '<button class="gd__btn" data-pause aria-label="Pause">' + I.pause + '</button>' +
        '</div>' +
        '<div class="game-banner hidden" data-banner></div>' +
        '<div class="gd__layer hidden" data-layer></div>' +
      '</div>';

    var root = host.querySelector('.sn');
    var canvas = root.querySelector('canvas');
    var ctx = canvas.getContext('2d');
    var layer = root.querySelector('[data-layer]');
    var banner = root.querySelector('[data-banner]');
    var hud = {
      score: root.querySelector('[data-score]'), caps: root.querySelector('[data-caps]'),
      capsL: root.querySelector('[data-caps-l]'), len: root.querySelector('[data-len]'),
      streak: root.querySelector('[data-streak]')
    };
    var hudWas = {};

    var save = W.state.games.snake;
    var best = save.best || 0;
    var raf = 0, lastT = 0, clock = 0;
    var view = { w: 0, h: 0, cell: 20, ox: 0, oy: 0, dpr: 1 };
    var run, holding = false, recentQ = [], swipe = null;

    /* ----------------------------- the run ---------------------------- */
    function reset(go) {
      var g = (root.clientWidth || 800) < 620 ? GRID.phone : GRID.wide;
      run = {
        cols: g[0], rows: g[1], state: 'ready',
        body: [], prev: [], dir: { x: 1, y: 0 }, queue: [], grow: 0,
        speed: SPEEDS[opts.speed()] || SPEEDS.normal, acc: 0, time: 0,
        wrap: opts.walls() === 'wrap',
        foods: [], q: null, askedAt: 0, result: null,
        score: 0, caps: 0, streak: 0, bestStreak: 0, wrong: 0,
        skin: null, parts: [], texts: [], shake: 0, dead: 0, reason: null
      };
      resize();
      var y = Math.floor(run.rows / 2), x0 = Math.floor(run.cols / 4) + START_LEN - 1;
      for (var i = 0; i < START_LEN; i++) run.body.push({ x: x0 - i, y: y });
      run.prev = copy(run.body);
      ask();
      if (go) begin(); else showReady();
      syncHud();
    }

    function copy(b) { return b.map(function (s) { return { x: s.x, y: s.y }; }); }

    function begin() {
      run.state = 'play';
      layer.classList.add('hidden'); layer.innerHTML = '';
      root.focus();
    }

    /* ---------------------------- questions --------------------------- */
    function ask() {
      var r = run;
      var kind = opts.kind();
      var type = kind === 'flags' ? 'flagpick' : kind === 'mix' ? W.pick(['capital', 'flagpick']) : 'capital';
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
      r.q = global.Quiz.make(type, target, field, { typed: false });
      r.askedAt = r.time;
      placeFoods();
      renderBanner();
    }

    /* Four foods, each with the room its label needs. A capital is an orb
       with its name on a pill just above it (below, on the top row); a flag
       is drawn across a cell and a half. None may land on the snake, right
       in front of its head, or with a label over another food. */
    function placeFoods() {
      var r = run, h = r.body[0], placed = [];
      ctx.font = '700 50px system-ui, sans-serif';
      r.foods = [];
      r.q.choices.forEach(function (c) {
        var isFlag = r.q.type === 'flagpick';
        var tw = 0, font = LABEL_FONT;
        if (isFlag) flag(c.flag);
        else {
          tw = ctx.measureText(c.text).width / 100;
          if (tw > LABEL_MAX) { font *= LABEL_MAX / tw; tw = LABEL_MAX; }
        }
        var spot = null;
        for (var tries = 0; tries < 400 && !spot; tries++) {
          var strict = tries < 300;
          var x = Math.floor(Math.random() * r.cols), y = Math.floor(Math.random() * r.rows);
          var rects = footprint(isFlag, x, y, tw);
          if (!rects) continue;
          if (occupied(x, y)) continue;
          if (Math.abs(x - h.x) + Math.abs(y - h.y) < 4) continue;
          if (strict && ahead(x, y)) continue;
          if (strict && r.foods.some(function (o) { return Math.max(Math.abs(o.x - x), Math.abs(o.y - y)) < 3; })) continue;
          if (strict && rects.some(function (a) { return placed.some(function (b) { return hit(a, b, 0.3); }) || onBody(a); })) continue;
          spot = { x: x, y: y, rects: rects };
        }
        if (!spot) return;
        placed.push.apply(placed, spot.rects);
        r.foods.push({ x: spot.x, y: spot.y, choice: c, flag: isFlag, label: spot.rects[1] || null, font: font, born: clock });
      });
    }

    function footprint(isFlag, x, y, tw) {
      var r = run;
      if (isFlag) {
        var f = { x: x + 0.5 - 0.8, y: y - 0.05, w: 1.6, h: 1.1 };
        if (f.x < 0 || f.x + f.w > r.cols) return null;
        return [f];
      }
      var lw = tw + 0.6, lh = 0.82;
      var lx = Math.max(0.05, Math.min(r.cols - lw - 0.05, x + 0.5 - lw / 2));
      var ly = y >= 1 ? y - 0.9 : y + 1.08;
      if (ly + lh > r.rows) return null;
      return [{ x: x, y: y, w: 1, h: 1 }, { x: lx, y: ly, w: lw, h: lh }];
    }

    function hit(a, b, pad) {
      return a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;
    }
    function occupied(x, y) {
      return run.body.some(function (s) { return s.x === x && s.y === y; });
    }
    function onBody(rect) {
      return run.body.some(function (s) { return hit(rect, { x: s.x, y: s.y, w: 1, h: 1 }, 0); });
    }
    /* the next few cells straight ahead, so nothing gets eaten by accident */
    function ahead(x, y) {
      var r = run, h = r.body[0], d = r.dir;
      for (var i = 1; i <= 6; i++) if (h.x + d.x * i === x && h.y + d.y * i === y) return true;
      return false;
    }

    function renderBanner() {
      var r = run, q = r.q, res = r.result;
      var what = q.type === 'flagpick' ? 'flag' : 'capital';
      var html = '<div class="game-banner__line"><span class="game-banner__tag">' + I.pin + ' Question ' + (r.caps + r.wrong + 1) + '</span>' +
        'Eat the ' + what + ' of <b>' + esc(q.country.name) + '</b></div>';
      if (res) html += '<div class="game-banner__sub ' + (res.correct ? 'is-right' : 'is-wrong') + '">' + res.html + '</div>';
      banner.innerHTML = html;
      banner.classList.remove('hidden');
    }

    function eat(f) {
      var r = run, q = r.q, c = f.choice, correct = c.correct;
      var gains = W.award(correct, { country: q.country.name });
      W.save();
      if (global.UI) global.UI.refreshHud(true);
      if (gains.level) W.toast('Level ' + gains.level, 'Nice one, keep it going', I.bolt, 3200);
      W.announceAchievements(W.checkAchievements());
      var isFlag = q.type === 'flagpick';

      if (correct) {
        r.caps += 1;
        r.streak += 1;
        r.bestStreak = Math.max(r.bestStreak, r.streak);
        var quick = Math.max(0, Math.round(20 - (r.time - r.askedAt)));
        var pts = 10 * Math.min(5, r.streak) + quick;
        r.score += pts;
        r.grow += GROW;
        r.speed = Math.min(MAX_SPEED, r.speed + SPEED_UP);
        r.skin = q.country.flag || null;
        if (r.skin) flag(r.skin);
        burst(f.x + 0.5, f.y + 0.5, '#FFD23F', 18);
        burst(f.x + 0.5, f.y + 0.5, '#fff', 10);
        text(f.x + 0.5, f.y - 0.2, '+' + pts, '#FFE27A');
        r.result = { correct: true, t: RESULT_TIME, html: I.check + ' ' +
          (isFlag ? 'That was the flag of ' + esc(q.country.name) : esc(q.country.capital) + ' is the capital of ' + esc(q.country.name)) +
          ' · +' + pts + (gains.xp ? ' · +' + gains.xp + ' XP' : '') };
        W.Sound.correct(gains.combo);
      } else {
        r.wrong += 1;
        r.streak = 0;
        var other = c.country;
        r.result = { correct: false, t: RESULT_TIME, html: I.x + ' ' +
          (isFlag
            ? 'That was the flag of ' + esc(other.name)
            : esc(c.text) + ' is the capital of ' + esc(other.name) + '. ' + esc(q.country.name) + '’s is ' + esc(q.country.capital)) };
        r.shake = 0.3;
        W.Sound.wrong();
        var keep = r.body.length - CUT;
        r.body.slice(Math.max(1, keep)).forEach(function (s) { burst(s.x + 0.5, s.y + 0.5, '#FF8A8E', 6); });
        if (keep < 2) {
          r.body.length = 1;
          return crash('tail');
        }
        r.body.length = keep;
        r.grow = 0;
        text(f.x + 0.5, f.y - 0.2, '−' + CUT + ' tail', '#FF9EA1');
      }
      ask();
    }

    /* ----------------------------- stepping --------------------------- */
    function tick() {
      var r = run;
      r.prev = copy(r.body);
      if (r.queue.length) r.dir = r.queue.shift();
      var h = r.body[0], nx = h.x + r.dir.x, ny = h.y + r.dir.y;
      if (nx < 0 || ny < 0 || nx >= r.cols || ny >= r.rows) {
        if (!r.wrap) return crash('wall');
        nx = (nx + r.cols) % r.cols; ny = (ny + r.rows) % r.rows;
      }
      /* the tail moves out of the way this tick unless the snake is growing */
      var n = r.body.length - (r.grow > 0 ? 0 : 1);
      for (var i = 0; i < n; i++) if (r.body[i].x === nx && r.body[i].y === ny) return crash('self');
      r.body.unshift({ x: nx, y: ny });
      if (r.grow > 0) r.grow -= 1; else r.body.pop();
      for (var j = 0; j < r.foods.length; j++) {
        if (r.foods[j].x === nx && r.foods[j].y === ny) { eat(r.foods[j]); break; }
      }
    }

    function turn(dx, dy) {
      var r = run;
      if (!r) return;
      if (r.state === 'ready') begin();
      if (r.state !== 'play') return;
      var last = r.queue.length ? r.queue[r.queue.length - 1] : r.dir;
      if ((dx === last.x && dy === last.y) || (dx === -last.x && dy === -last.y)) return;
      if (r.queue.length < 2) r.queue.push({ x: dx, y: dy });
    }

    var REASONS = {
      wall: ['Hit the wall', 'Crashed into the wall'],
      self: ['Ran into your tail', 'Tied in a knot'],
      tail: ['Out of tail', 'No tail left']
    };

    function crash(why) {
      var r = run;
      r.state = 'dead'; r.dead = 0; r.reason = why; r.shake = 0.45;
      var h = r.body[0];
      burst(h.x + 0.5, h.y + 0.5, '#fff', 22);
      burst(h.x + 0.5, h.y + 0.5, '#9BE15D', 18);
      W.Sound.wrong();
    }

    /* ----------------------------- effects ---------------------------- */
    function burst(x, y, color, n) {
      for (var i = 0; i < n; i++) {
        var a = Math.random() * TAU, v = 1.5 + Math.random() * 5;
        run.parts.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.4 + Math.random() * 0.4, max: 0.8, size: 0.1 + Math.random() * 0.14, color: color });
      }
    }
    function text(x, y, t, color) { run.texts.push({ x: x, y: y, t: t, color: color, life: 1.1, max: 1.1 }); }

    function tickEffects(dt) {
      var r = run;
      r.parts = r.parts.filter(function (p) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.94; p.vy *= 0.94; return p.life > 0; });
      r.texts = r.texts.filter(function (t) { t.life -= dt; t.y -= 0.9 * dt; return t.life > 0; });
      r.shake = Math.max(0, r.shake - dt);
      if (r.result && r.state === 'play') {
        r.result.t -= dt;
        if (r.result.t <= 0) { r.result = null; renderBanner(); }
      }
    }

    /* ----------------------------- screens ---------------------------- */
    function kindWord() {
      var k = opts.kind();
      return k === 'flags' ? 'flag' : k === 'mix' ? 'capital or flag' : 'capital';
    }

    function showReady() {
      layer.innerHTML =
        '<div class="gd-card gd-card--ready">' +
          '<div class="gd-card__eyebrow">' + I.pin + ' Capital Snake</div>' +
          '<h3>Press an arrow key, Space, or tap</h3>' +
          '<p>Steer with the arrow keys or WASD, or swipe. Eat the ' + kindWord() + ' the banner asks for to grow; ' +
            'a wrong one costs you ' + CUT + ' pieces of tail.</p>' +
          '<p>' + (run.wrap ? 'The walls wrap round, so only your own tail can stop you.' : 'Keep off the walls and your own tail.') + '</p>' +
        '</div>';
      layer.classList.remove('hidden');
    }

    function showPaused() {
      layer.innerHTML =
        '<div class="gd-card gd-card--ready">' +
          '<div class="gd-card__eyebrow">Paused</div>' +
          '<h3>Press Space or tap to carry on</h3>' +
          '<div class="gd-card__row">' +
            '<button class="btn btn--accent" data-unpause>' + I.play + ' Resume</button>' +
            '<button class="btn btn--ghost" data-back>Quit game</button>' +
          '</div>' +
        '</div>';
      layer.classList.remove('hidden');
      W.$('[data-unpause]', layer).addEventListener('click', function (e) { e.stopPropagation(); unpause(); });
      W.$('[data-back]', layer).addEventListener('click', function (e) { e.stopPropagation(); finish(true); });
    }

    function pause() {
      if (!run || run.state !== 'play') return;
      run.state = 'paused';
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
      save.bestCaps = Math.max(save.bestCaps || 0, run.caps);
      W.save();
      run.state = 'over';
      if (quit) { opts.onBack(); return; }
      if (isBest && run.score > 0) W.Sound.finish();

      var why = REASONS[run.reason] || REASONS.wall;
      var noun = opts.kind() === 'flags' ? 'flag' : opts.kind() === 'mix' ? 'answer' : 'capital';
      if (run.caps !== 1) noun += 's';
      layer.innerHTML =
        '<div class="gd-card gd-card--over">' +
          '<div class="gd-card__eyebrow">' + (isBest && run.score > 0 ? I.trophy + ' New best · ' : '') + esc(why[0]) + '</div>' +
          '<h3>' + esc(why[1]) + '</h3>' +
          '<p>You got ' + run.caps + ' ' + noun + ' right' + (run.bestStreak > 1 ? ', ' + run.bestStreak + ' in a row at best' : '') +
            ', and grew to ' + run.body.length + ' long.</p>' +
          '<div class="gd-stats">' +
            '<div><b class="mono">' + run.score + '</b><span>Points</span></div>' +
            '<div><b class="mono">' + run.caps + '</b><span>Right</span></div>' +
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
    var DIRS = {
      ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
      w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0]
    };

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
      var d = DIRS[k];
      if (d && run.state !== 'over' && run.state !== 'paused') { e.preventDefault(); turn(d[0], d[1]); return; }
      if ((k === 'Escape' || k === 'p') && run.state === 'play') { e.preventDefault(); pause(); return; }
      if (k === ' ' || k === 'Enter') {
        if (run.state === 'play') { if (k === ' ') e.preventDefault(); return; }
        e.preventDefault();
        if (e.repeat) return;
        if (k === 'Enter' && t && t.tagName === 'BUTTON' && layer.contains(t)) return;
        press();
      }
    }

    function onDown(e) {
      if (e.target.closest('button, .gd-card--over')) return;
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      if (!run) return;
      if (run.state !== 'play') { press(); return; }
      swipe = { x: e.clientX, y: e.clientY };
    }
    function onMove(e) {
      if (!swipe || !run || run.state !== 'play') return;
      var dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 22) return;
      if (Math.abs(dx) > Math.abs(dy)) turn(dx > 0 ? 1 : -1, 0); else turn(0, dy > 0 ? 1 : -1);
      swipe = { x: e.clientX, y: e.clientY };
    }
    function onUp() { swipe = null; }
    function onVisible() { if (document.hidden) pause(); }

    document.addEventListener('keydown', onKey);
    root.addEventListener('pointerdown', onDown);
    root.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    document.addEventListener('visibilitychange', onVisible);
    root.querySelector('[data-pause]').addEventListener('click', function (e) {
      e.stopPropagation();
      if (run.state === 'play') pause(); else if (run.state === 'paused') unpause();
    });

    /* ------------------------------ sizing ---------------------------- */
    /* The HUD and the question banner sit above the board rather than on it,
       so nothing ever covers a cell the snake could be in. */
    function resize() {
      var w = root.clientWidth || 800, phone = w < 620;
      var cols = run ? run.cols : (phone ? GRID.phone : GRID.wide)[0];
      var rows = run ? run.rows : (phone ? GRID.phone : GRID.wide)[1];
      var top = phone ? 100 : 110, pad = phone ? 8 : 12;
      var cell = (w - pad * 2) / cols;
      if (!phone) cell = Math.min(cell, (620 - top - pad) / rows);
      view.cell = cell;
      view.w = w;
      view.h = Math.round(top + rows * cell + pad);
      view.ox = (w - cols * cell) / 2;
      view.oy = top;
      view.dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.style.height = view.h + 'px';
      canvas.width = Math.round(w * view.dpr);
      canvas.height = Math.round(view.h * view.dpr);
      if (run && run.body.length) draw();
    }
    var ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(root); else window.addEventListener('resize', resize);

    /* ------------------------------ drawing --------------------------- */
    function X(x) { return view.ox + x * view.cell; }
    function Y(y) { return view.oy + y * view.cell; }

    function draw() {
      var r = run, c = ctx, s = view.cell;
      c.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      var bg = c.createLinearGradient(0, 0, 0, view.h);
      bg.addColorStop(0, '#0b2c22');
      bg.addColorStop(1, '#06180f');
      c.fillStyle = bg;
      c.fillRect(0, 0, view.w, view.h);

      var shake = r.shake > 0 ? (Math.random() - 0.5) * r.shake * 14 : 0;
      c.save();
      c.translate(shake, shake * 0.6);

      for (var y = 0; y < r.rows; y++) {
        for (var x = 0; x < r.cols; x++) {
          c.fillStyle = (x + y) % 2 ? '#14533f' : '#174a3a';
          c.fillRect(X(x), Y(y), s + 0.5, s + 0.5);
        }
      }
      c.strokeStyle = r.wrap ? 'rgba(124,243,255,.45)' : 'rgba(255,255,255,.7)';
      c.lineWidth = r.wrap ? 2 : 3;
      if (r.wrap) c.setLineDash([6, 6]);
      c.strokeRect(X(0) - 1.5, Y(0) - 1.5, r.cols * s + 3, r.rows * s + 3);
      c.setLineDash([]);

      r.foods.forEach(drawFoodBody);
      drawSnake();
      r.foods.forEach(drawFoodLabel);

      r.parts.forEach(function (p) {
        c.globalAlpha = Math.max(0, Math.min(1, p.life / p.max * 1.5));
        c.fillStyle = p.color;
        var ps = p.size * s;
        c.fillRect(X(p.x) - ps / 2, Y(p.y) - ps / 2, ps, ps);
      });
      c.globalAlpha = 1;

      c.textAlign = 'center';
      c.font = '800 ' + Math.round(s * 0.55) + 'px system-ui, sans-serif';
      r.texts.forEach(function (t) {
        c.globalAlpha = Math.min(1, t.life / 0.4);
        c.lineWidth = 4; c.strokeStyle = 'rgba(4,20,14,.85)';
        c.strokeText(t.t, X(t.x), Y(t.y));
        c.fillStyle = t.color;
        c.fillText(t.t, X(t.x), Y(t.y));
      });
      c.globalAlpha = 1;
      c.restore();
    }

    function grow(f) { return Math.min(1, (clock - f.born) / 0.25); }

    function drawFoodBody(f) {
      var c = ctx, s = view.cell, k = grow(f);
      var cx = X(f.x + 0.5), cy = Y(f.y + 0.5);
      if (f.flag) {
        var w = 1.5 * s * k, h = 1 * s * k, pad = Math.max(1.5, s * 0.06);
        c.fillStyle = '#fff';
        c.fillRect(cx - w / 2 - pad, cy - h / 2 - pad, w + pad * 2, h + pad * 2);
        var img = flag(f.choice.flag);
        if (img) c.drawImage(img, cx - w / 2, cy - h / 2, w, h);
        else { c.fillStyle = '#c9d2e3'; c.fillRect(cx - w / 2, cy - h / 2, w, h); }
        return;
      }
      var pulse = 1 + Math.sin(clock * 5 + f.x) * 0.06;
      c.save();
      c.shadowColor = '#FFD23F'; c.shadowBlur = s * 0.5;
      c.fillStyle = '#FFD23F';
      c.beginPath(); c.arc(cx, cy, s * 0.32 * pulse * k, 0, TAU); c.fill();
      c.restore();
      c.fillStyle = '#fff';
      c.beginPath(); c.arc(cx - s * 0.08, cy - s * 0.08, s * 0.1 * k, 0, TAU); c.fill();
    }

    function drawFoodLabel(f) {
      if (f.flag || !f.label) return;
      var c = ctx, s = view.cell, L = f.label, k = grow(f);
      c.globalAlpha = k;
      var x = X(L.x), y = Y(L.y), w = L.w * s, h = L.h * s;
      c.fillStyle = 'rgba(255,255,255,.96)';
      rounded(x, y, w, h, h / 2);
      c.fill();
      c.fillStyle = '#0b2c22';
      c.textAlign = 'center';
      c.font = '700 ' + Math.max(9, Math.round(f.font * s)) + 'px system-ui, sans-serif';
      c.fillText(f.choice.text, x + w / 2, y + h / 2 + f.font * s * 0.36);
      /* a little tail from the pill to its orb */
      var cx = X(f.x + 0.5), up = L.y < f.y;
      c.fillStyle = 'rgba(255,255,255,.96)';
      c.beginPath();
      c.moveTo(cx - s * 0.1, up ? y + h - 0.5 : y + 0.5);
      c.lineTo(cx + s * 0.1, up ? y + h - 0.5 : y + 0.5);
      c.lineTo(cx, up ? y + h + s * 0.1 : y - s * 0.1);
      c.fill();
      c.globalAlpha = 1;
    }

    /* Where each piece is drawn this frame: part of the way from where it
       was at the last tick to where it is now. A piece that just wrapped
       round the board is drawn where it is, not dragged across it. */
    function positions() {
      var r = run, t = r.state === 'play' ? Math.min(1, r.acc * r.speed) : 1, out = [];
      for (var i = 0; i < r.body.length; i++) {
        var to = r.body[i], from = r.prev[i] || to;
        if (Math.abs(to.x - from.x) + Math.abs(to.y - from.y) > 1) from = to;
        out.push({ x: from.x + (to.x - from.x) * t + 0.5, y: from.y + (to.y - from.y) * t + 0.5 });
      }
      return out;
    }

    function drawSnake() {
      var r = run, c = ctx, s = view.cell, pts = positions();
      if (r.state === 'over' && r.reason === 'tail') return;
      var hide = r.state === 'dead' && Math.floor(clock * 12) % 2;
      if (hide) return;
      c.lineCap = 'round'; c.lineJoin = 'round';
      [[0.84, '#1d5a24'], [0.66, '#8BD650'], [0.3, '#B5EE7A']].forEach(function (band) {
        c.strokeStyle = band[1];
        c.lineWidth = s * band[0];
        c.beginPath();
        for (var i = 0; i < pts.length; i++) {
          var p = pts[i], q = pts[i - 1];
          if (!i || Math.abs(p.x - q.x) + Math.abs(p.y - q.y) > 1.5) c.moveTo(X(p.x), Y(p.y)); else c.lineTo(X(p.x), Y(p.y));
        }
        if (pts.length === 1) c.lineTo(X(pts[0].x) + 0.01, Y(pts[0].y));
        c.stroke();
      });
      c.lineCap = 'butt'; c.lineJoin = 'miter';

      var h = pts[0], hx = X(h.x), hy = Y(h.y), hr = s * 0.48;
      c.beginPath(); c.arc(hx, hy, hr, 0, TAU);
      c.fillStyle = '#1d5a24'; c.fill();
      var img = r.skin && flag(r.skin);
      c.save();
      c.beginPath(); c.arc(hx, hy, hr * 0.86, 0, TAU); c.clip();
      if (img) c.drawImage(img, hx - hr * 1.3, hy - hr * 0.86, hr * 2.6, hr * 1.72);
      else { c.fillStyle = '#9BE15D'; c.fillRect(hx - hr, hy - hr, hr * 2, hr * 2); }
      c.restore();
      var d = r.dir, px = -d.y, py = d.x;
      [-1, 1].forEach(function (side) {
        var ex = hx + d.x * s * 0.16 + px * side * s * 0.2, ey = hy + d.y * s * 0.16 + py * side * s * 0.2;
        c.fillStyle = '#fff';
        c.beginPath(); c.arc(ex, ey, s * 0.12, 0, TAU); c.fill();
        c.fillStyle = '#10221a';
        c.beginPath(); c.arc(ex + d.x * s * 0.04, ey + d.y * s * 0.04, s * 0.06, 0, TAU); c.fill();
      });
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
      if (hudWas.score !== r.score) { hudWas.score = r.score; hud.score.textContent = r.score; }
      if (hudWas.caps !== r.caps) { hudWas.caps = r.caps; hud.caps.textContent = r.caps; }
      var k = opts.kind(), noun = k === 'flags' ? 'flags' : k === 'mix' ? 'right' : 'capitals';
      if (hudWas.capsL !== noun) { hudWas.capsL = noun; hud.capsL.textContent = noun; }
      var len = r.body.length;
      if (hudWas.len !== len) { hudWas.len = len; hud.len.textContent = len; }
      var st = r.streak > 1 ? I.fire + ' ' + r.streak + ' in a row' : '';
      if (hudWas.streak !== st) { hudWas.streak = st; hud.streak.innerHTML = st; }
    }

    /* ------------------------------- loop ----------------------------- */
    function frame(t) {
      raf = requestAnimationFrame(frame);
      var dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 0;
      lastT = t;
      clock += dt;
      if (!run) return;
      var r = run;
      if (r.state === 'play') {
        r.time += dt;
        r.acc += dt;
        var step = 1 / r.speed;
        while (r.acc >= step && r.state === 'play') { r.acc -= step; tick(); step = 1 / r.speed; }
      }
      if (r.state === 'dead') {
        r.dead += dt;
        if (r.dead > 0.9) finish();
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
      turn: turn,
      tick: function () { if (run && run.state === 'play') tick(); },
      ask: function () { if (run) ask(); }
    };
  }

  global.GeoSnake = { mount: mount };
})(window);
