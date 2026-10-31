/* ------------------------------------------------------------------
   LearnGeo — Capital Maze
   A maze crawl where four of the things lying in the corridors are the
   answers. The banner names a country; drive into its capital.

     GeoMaze.mount(host, { kind(), cfg(), onBack() })
       kind  'capitals' | 'flags' | 'mix', read per question

   Two roamers hunt you while you look. They cost a life on contact and
   the maze restarts around you, so the pressure is on finding the right
   answer quickly rather than on twitch.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons, K = global.GameKit;

  /* # wall, . pellet, P player start, G roamer pen */
  var MAP = [
    '###################',
    '#........#........#',
    '#.##.###.#.###.##.#',
    '#.................#',
    '#.##.#.#####.#.##.#',
    '#....#..#G#..#....#',
    '#.##.##.#.#.##.##.#',
    '#.................#',
    '#.##.###.#.###.##.#',
    '#........P........#',
    '###################'
  ];
  var COLS = MAP[0].length, ROWS = MAP.length;
  var LIVES = 3;
  var SPEED = 5.2;              /* cells a second */
  var GHOST_SPEED = 3.9;
  var RESULT_TIME = 2.2;
  var DIRS = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];

  function mount(host, opts) {
    var ask = K.asker({
      cfg: opts.cfg,
      types: function () {
        var k = opts.kind();
        if (k === 'flags') return ['flagpick', 'capital'];
        if (k === 'mix') return W.pick([['capital', 'flagpick'], ['flagpick', 'capital']]);
        return ['capital', 'flagpick'];
      }
    });

    var run = null, E = null, cell = 24, ox = 0, oy = 0;

    function wall(x, y) {
      if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return true;
      return MAP[y][x] === '#';
    }

    function fresh() {
      run = {
        lives: LIVES, score: 0, right: 0, wrong: 0, streak: 0, bestStreak: 0,
        pellets: {}, answers: [], q: null, result: null, time: 0, askedAt: 0,
        me: null, ghosts: [], dir: { x: 0, y: 0 }, want: null, shake: 0, caught: 0
      };
      for (var y = 0; y < ROWS; y++) {
        for (var x = 0; x < COLS; x++) {
          if (MAP[y][x] === '.') run.pellets[x + ',' + y] = 1;
        }
      }
      place();
      next();
    }

    /* everyone back to their corner, the maze left as it is */
    function place() {
      var p = find('P'), g = find('G');
      run.me = { x: p.x, y: p.y };
      run.dir = { x: 0, y: 0 };
      run.want = null;
      run.ghosts = [
        { x: g.x, y: g.y, d: DIRS[3], wait: 0 },
        { x: g.x, y: g.y, d: DIRS[3], wait: 1.6 }
      ];
    }

    function find(ch) {
      for (var y = 0; y < ROWS; y++) {
        var x = MAP[y].indexOf(ch);
        if (x !== -1) return { x: x, y: y };
      }
      return { x: 1, y: 1 };
    }

    /* The four choices go in open cells, well apart and away from you. */
    function next() {
      run.q = ask.next();
      run.askedAt = run.time;
      var free = [];
      for (var y = 0; y < ROWS; y++) {
        for (var x = 0; x < COLS; x++) {
          if (MAP[y][x] === '#' || MAP[y][x] === 'G') continue;
          if (Math.abs(x - run.me.x) + Math.abs(y - run.me.y) < 4) continue;
          free.push({ x: x, y: y });
        }
      }
      free = W.shuffle(free);
      run.answers = [];
      run.q.choices.forEach(function (c) {
        for (var i = 0; i < free.length; i++) {
          var s = free[i];
          var clash = run.answers.some(function (a) {
            return Math.abs(a.x - s.x) + Math.abs(a.y - s.y) < 4;
          });
          if (clash) continue;
          free.splice(i, 1);
          run.answers.push({ x: s.x, y: s.y, c: c, born: run.time });
          return;
        }
        if (free.length) {
          var s2 = free.shift();
          run.answers.push({ x: s2.x, y: s2.y, c: c, born: run.time });
        }
      });
      paintBanner();
    }

    function paintBanner() {
      var q = run.q;
      var what = q.type === 'flagpick' ? 'flag' : 'capital';
      K.banner(E.banner, {
        tag: 'Question ' + (run.right + run.wrong + 1),
        line: 'Drive into the ' + what + ' of <b>' + W.escapeHtml(q.country.name) + '</b>',
        result: run.result
      });
    }

    function eat(a) {
      var q = run.q, correct = !!a.c.correct;
      var gains = K.award(correct, q.country.name);
      if (correct) {
        run.right += 1;
        run.streak += 1;
        run.bestStreak = Math.max(run.bestStreak, run.streak);
        var quick = Math.max(0, Math.round(50 - (run.time - run.askedAt) * 5));
        var pts = 100 + quick + Math.min(5, run.streak) * 20;
        run.score += pts;
        E.fx.burst(a.x + 0.5, a.y + 0.5, '#FFD23F', 18);
        E.fx.text(a.x + 0.5, a.y - 0.1, '+' + pts, '#FFE27A');
        run.result = K.verdict(true, q, a.c, '+' + pts + (gains.xp ? ' · +' + gains.xp + ' XP' : ''));
      } else {
        run.wrong += 1;
        run.streak = 0;
        run.shake = 0.3;
        E.fx.burst(a.x + 0.5, a.y + 0.5, '#FF8A8E', 12);
        run.result = K.verdict(false, q, a.c);
      }
      run.result.t = RESULT_TIME;
      next();
    }

    function caught() {
      run.lives -= 1;
      run.streak = 0;
      run.shake = 0.45;
      run.caught = 0.8;
      W.Sound.wrong();
      if (run.lives <= 0) return E.finish();
      place();
    }

    /* --------------------------- movement ---------------------------- */
    /* Everything turns only when it is sitting on a cell centre, which
       is what keeps a grid crawl from drifting into walls. */
    function advance(a, dir, speed, dt) {
      if (!dir.x && !dir.y) return false;
      var nx = a.x + dir.x * speed * dt, ny = a.y + dir.y * speed * dt;
      var tx = Math.round(nx), ty = Math.round(ny);
      if (dir.x && wall(tx + Math.sign(dir.x), ty) && Math.abs(nx - tx) > 0.001 &&
          Math.sign(nx - tx) === Math.sign(dir.x)) { a.x = tx; return false; }
      if (dir.y && wall(tx, ty + Math.sign(dir.y)) && Math.abs(ny - ty) > 0.001 &&
          Math.sign(ny - ty) === Math.sign(dir.y)) { a.y = ty; return false; }
      a.x = nx; a.y = ny;
      return true;
    }

    function centred(a) {
      return Math.abs(a.x - Math.round(a.x)) < 0.08 && Math.abs(a.y - Math.round(a.y)) < 0.08;
    }

    function step(dt) {
      var r = run;
      r.time += dt;
      if (r.shake > 0) r.shake = Math.max(0, r.shake - dt);
      if (r.caught > 0) { r.caught -= dt; return; }
      if (r.result && (r.result.t -= dt) <= 0) { r.result = null; paintBanner(); }

      /* a queued turn is taken at the next centre it fits */
      if (r.want && centred(r.me)) {
        var cx = Math.round(r.me.x), cy = Math.round(r.me.y);
        if (!wall(cx + r.want.x, cy + r.want.y)) {
          r.me.x = cx; r.me.y = cy;
          r.dir = r.want;
          r.want = null;
        }
      }
      advance(r.me, r.dir, SPEED, dt);

      var mx = Math.round(r.me.x), my = Math.round(r.me.y);
      var key = mx + ',' + my;
      if (r.pellets[key]) {
        delete r.pellets[key];
        r.score += 5;
        W.Sound.flip();
      }
      for (var i = 0; i < r.answers.length; i++) {
        var a = r.answers[i];
        if (Math.abs(r.me.x - a.x) < 0.55 && Math.abs(r.me.y - a.y) < 0.55) { eat(a); break; }
      }

      r.ghosts.forEach(function (g) {
        if (g.wait > 0) { g.wait -= dt; return; }
        if (centred(g)) {
          g.x = Math.round(g.x); g.y = Math.round(g.y);
          var open = DIRS.filter(function (d) {
            if (wall(g.x + d.x, g.y + d.y)) return false;
            return !(d.x === -g.d.x && d.y === -g.d.y);   /* no about-turns */
          });
          if (!open.length) open = DIRS.filter(function (d) { return !wall(g.x + d.x, g.y + d.y); });
          if (open.length) {
            if (Math.random() < 0.25) g.d = W.pick(open);
            else {
              open.sort(function (p, q2) { return far(g, p) - far(g, q2); });
              g.d = open[0];
            }
          }
        }
        advance(g, g.d, GHOST_SPEED, dt);
        if (Math.abs(g.x - r.me.x) < 0.7 && Math.abs(g.y - r.me.y) < 0.7) caught();
      });
    }

    function far(g, d) {
      var dx = g.x + d.x - run.me.x, dy = g.y + d.y - run.me.y;
      return dx * dx + dy * dy;
    }

    /* ------------------------------ draw ----------------------------- */
    function layout(view) {
      cell = Math.floor(Math.min((view.w - 16) / COLS, (view.h - 86) / ROWS));
      ox = Math.round((view.w - cell * COLS) / 2);
      oy = Math.round((view.h - cell * ROWS) / 2 + 24);
    }

    function draw(ctx, view, clock) {
      var r = run;
      ctx.fillStyle = '#05081c';
      ctx.fillRect(0, 0, view.w, view.h);
      if (!r) return;
      ctx.save();
      if (r.shake > 0) ctx.translate((Math.random() - 0.5) * r.shake * 12, (Math.random() - 0.5) * r.shake * 12);

      /* walls */
      for (var y = 0; y < ROWS; y++) {
        for (var x = 0; x < COLS; x++) {
          if (MAP[y][x] !== '#') continue;
          ctx.fillStyle = '#16205a';
          K.roundRect(ctx, ox + x * cell + 1, oy + y * cell + 1, cell - 2, cell - 2, 4);
          ctx.fill();
          ctx.strokeStyle = 'rgba(124,243,255,.22)';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }

      /* pellets */
      ctx.fillStyle = 'rgba(255,255,255,.45)';
      Object.keys(r.pellets).forEach(function (k) {
        var p = k.split(',');
        ctx.beginPath();
        ctx.arc(ox + (+p[0] + 0.5) * cell, oy + (+p[1] + 0.5) * cell, Math.max(1.5, cell * 0.08), 0, K.TAU);
        ctx.fill();
      });

      /* the answers */
      r.answers.forEach(function (a) {
        var cx = ox + (a.x + 0.5) * cell, cy = oy + (a.y + 0.5) * cell;
        var pulse = 1 + Math.sin(clock * 4 + a.x) * 0.08;
        if (r.q.type === 'flagpick') {
          var fw = cell * 1.7 * pulse, fh = fw * 0.62;
          K.drawFlag(ctx, a.c.flag, cx - fw / 2, cy - fh / 2, fw, fh, 3);
          return;
        }
        ctx.fillStyle = '#FFD23F';
        ctx.beginPath();
        ctx.arc(cx, cy, cell * 0.3 * pulse, 0, K.TAU);
        ctx.fill();
        var label = K.fitText(ctx, a.c.text, cell * 4.4, Math.max(10, cell * 0.44), 700);
        var tw = ctx.measureText(label).width;
        var ly = a.y < 2 ? cy + cell * 0.95 : cy - cell * 0.78;
        ctx.fillStyle = 'rgba(8,12,40,.9)';
        K.roundRect(ctx, cx - tw / 2 - 5, ly - cell * 0.38, tw + 10, cell * 0.56, 5);
        ctx.fill();
        ctx.fillStyle = '#EAF2FF';
        ctx.textAlign = 'center';
        ctx.fillText(label, cx, ly + cell * 0.06);
        ctx.textAlign = 'left';
      });

      /* you */
      var mxp = ox + (r.me.x + 0.5) * cell, myp = oy + (r.me.y + 0.5) * cell;
      ctx.fillStyle = r.caught > 0 ? '#FF8A8E' : '#7CF3FF';
      var mouth = Math.abs(Math.sin(clock * 9)) * 0.5;
      var face = Math.atan2(r.dir.y, r.dir.x);
      ctx.beginPath();
      ctx.moveTo(mxp, myp);
      ctx.arc(mxp, myp, cell * 0.38, face + mouth, face - mouth + K.TAU);
      ctx.closePath();
      ctx.fill();

      /* the roamers */
      r.ghosts.forEach(function (g, i) {
        var gx = ox + (g.x + 0.5) * cell, gy = oy + (g.y + 0.5) * cell;
        ctx.fillStyle = i ? '#C38BFF' : '#FF9A3D';
        ctx.beginPath();
        ctx.arc(gx, gy - cell * 0.06, cell * 0.34, Math.PI, 0);
        ctx.lineTo(gx + cell * 0.34, gy + cell * 0.3);
        ctx.lineTo(gx, gy + cell * 0.14);
        ctx.lineTo(gx - cell * 0.34, gy + cell * 0.3);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(gx - cell * 0.12, gy - cell * 0.08, cell * 0.09, 0, K.TAU);
        ctx.arc(gx + cell * 0.12, gy - cell * 0.08, cell * 0.09, 0, K.TAU);
        ctx.fill();
      });

      E.fx.draw(ctx, cell, ox, oy);

      for (var l = 0; l < r.lives; l++) {
        ctx.fillStyle = '#7CF3FF';
        ctx.beginPath();
        ctx.arc(view.w - 18 - l * 18, view.h - 14, 6, 0.4, K.TAU - 0.4);
        ctx.lineTo(view.w - 18 - l * 18, view.h - 14);
        ctx.fill();
      }
      ctx.restore();
    }

    E = K.engine(host, {
      cls: 'gk-maze',
      aspect: 1.62,
      stats: [['score', 'points'], ['right', 'right']],
      intro: {
        eyebrow: 'Capital Maze', icon: I.globe,
        title: 'Press an arrow key to set off',
        lines: ['Steer with the arrow keys or WASD. Dots are worth a few points each.',
                'Four answers lie in the corridors. Drive into the one the banner asks for, and keep away from the two roamers.']
      },
      start: function (view) { layout(view); fresh(); },
      step: step,
      draw: draw,
      resize: layout,
      key: function (e) {
        var m = { ArrowLeft: DIRS[1], ArrowRight: DIRS[0], ArrowUp: DIRS[3], ArrowDown: DIRS[2],
                  a: DIRS[1], d: DIRS[0], w: DIRS[3], s: DIRS[2],
                  A: DIRS[1], D: DIRS[0], W: DIRS[3], S: DIRS[2] };
        if (m[e.key]) { run.want = m[e.key]; return true; }
        return false;
      },
      pointer: function (kind, x, y) {
        if (kind !== 'down') return;
        var mx = ox + (run.me.x + 0.5) * cell, my = oy + (run.me.y + 0.5) * cell;
        var dx = x - mx, dy = y - my;
        run.want = Math.abs(dx) > Math.abs(dy)
          ? (dx > 0 ? DIRS[0] : DIRS[1])
          : (dy > 0 ? DIRS[2] : DIRS[3]);
      },
      score: function () { return run.score; },
      best: function (s) { return K.keepBest('maze', 'best', s); },
      over: function () {
        return {
          eyebrow: 'Caught',
          title: run.right ? run.right + ' answer' + (run.right === 1 ? '' : 's') + ' found' : 'No answers found',
          text: 'Best run of ' + run.bestStreak + ' in a row.',
          stats: [[run.score, 'Points'], [run.right, 'Right'], [K.record('maze').best || 0, 'Best']]
        };
      },
      onBack: opts.onBack
    });

    return { destroy: E.destroy, get run() { return run; } };
  }

  global.GeoMaze = { mount: mount };
})(window);
