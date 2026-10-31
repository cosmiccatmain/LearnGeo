/* ------------------------------------------------------------------
   LearnGeo — Border Crossing
   Frogger, with four border gates along the top. The banner names a
   country; cross the traffic and go through the right gate.

     GeoCrossing.mount(host, { kind(), cfg(), onBack() })
       kind  'capitals' | 'flags' | 'mix', read per question

   The lanes are the cost of changing your mind: picking the wrong gate
   from the kerb is cheap, but realising halfway across is not.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons, K = global.GameKit;

  var LIVES = 3;
  var LANES = 5;
  var ROWS = LANES + 3;         /* gates row, a safe kerb, the lanes, the start */
  var RESULT_TIME = 2.3;
  var CAR_COLOURS = ['#FF9A3D', '#C38BFF', '#7CF3FF', '#FFD23F', '#FF8A8E'];

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

    var run = null, E = null, cw = 0, ch = 0;

    function fresh() {
      run = {
        lives: LIVES, score: 0, right: 0, wrong: 0, streak: 0, bestStreak: 0,
        round: 1, lanes: [], gates: [], q: null, result: null,
        me: { x: 0.5, row: ROWS - 1 }, hop: 0, time: 0, askedAt: 0, shake: 0, dead: 0
      };
      lanes();
      next();
    }

    /* Each lane has its own speed, direction and spacing. */
    function lanes() {
      run.lanes = [];
      for (var i = 0; i < LANES; i++) {
        var dir = i % 2 ? 1 : -1;
        var speed = (0.07 + Math.random() * 0.06) * (1 + (run.round - 1) * 0.07);
        var gap = 0.26 + Math.random() * 0.14;
        var cars = [];
        for (var x = 0; x < 1 + gap; x += gap) {
          cars.push({ x: x, w: 0.1 + Math.random() * 0.06 });
        }
        run.lanes.push({ dir: dir, speed: Math.min(0.2, speed), cars: cars, c: CAR_COLOURS[i % CAR_COLOURS.length] });
      }
    }

    function next() {
      run.q = ask.next();
      run.askedAt = run.time;
      var n = run.q.choices.length;
      run.gates = run.q.choices.map(function (c, i) {
        return { c: c, x: (i + 0.5) / n, w: 1 / n };
      });
      run.me = { x: 0.5, row: ROWS - 1 };
      paintBanner();
    }

    function paintBanner() {
      var q = run.q;
      var what = q.type === 'flagpick' ? 'flag' : 'capital';
      K.banner(E.banner, {
        tag: 'Crossing ' + run.round,
        line: 'Cross to the ' + what + ' of <b>' + W.escapeHtml(q.country.name) + '</b>',
        result: run.result
      });
    }

    /* ---------------------------- the hop ---------------------------- */
    function move(dx, dy) {
      if (run.dead > 0) return;
      var r = run;
      if (dx) r.me.x = Math.max(0.04, Math.min(0.96, r.me.x + dx * 0.12));
      if (dy) r.me.row = Math.max(0, Math.min(ROWS - 1, r.me.row + dy));
      r.hop = 0.14;
      W.Sound.flip();
      if (r.me.row === 0) arrive();
    }

    function arrive() {
      var r = run, gate = null;
      r.gates.forEach(function (g) {
        if (Math.abs(g.x - r.me.x) < g.w / 2) gate = g;
      });
      if (!gate) { r.me.row = 1; return; }

      var correct = !!gate.c.correct;
      var gains = K.award(correct, r.q.country.name);
      var px = gate.x * cw * 0 + gate.x * E.view.w, py = ch * 0.5;

      if (correct) {
        r.right += 1;
        r.streak += 1;
        r.bestStreak = Math.max(r.bestStreak, r.streak);
        var quick = Math.max(0, Math.round(50 - (r.time - r.askedAt) * 4));
        var pts = 100 + quick + Math.min(5, r.streak) * 20;
        r.score += pts;
        r.round += 1;
        E.fx.burst(px, py, '#8CF5C2', 20);
        E.fx.text(px, py - 14, '+' + pts, '#FFE27A');
        r.result = K.verdict(true, r.q, gate.c, '+' + pts + (gains.xp ? ' · +' + gains.xp + ' XP' : ''));
        lanes();
      } else {
        r.wrong += 1;
        r.streak = 0;
        r.shake = 0.3;
        E.fx.burst(px, py, '#FF8A8E', 14);
        r.result = K.verdict(false, r.q, gate.c);
      }
      r.result.t = RESULT_TIME;
      next();
    }

    function squashed() {
      run.lives -= 1;
      run.streak = 0;
      run.shake = 0.45;
      run.dead = 0.7;
      W.Sound.wrong();
      if (run.lives <= 0) return E.finish();
    }

    /* ------------------------------ frame ---------------------------- */
    function step(dt) {
      var r = run;
      r.time += dt;
      if (r.shake > 0) r.shake = Math.max(0, r.shake - dt);
      if (r.hop > 0) r.hop -= dt;
      if (r.dead > 0) {
        r.dead -= dt;
        if (r.dead <= 0) r.me = { x: 0.5, row: ROWS - 1 };
        return;
      }
      if (r.result && (r.result.t -= dt) <= 0) { r.result = null; paintBanner(); }

      r.lanes.forEach(function (ln) {
        ln.cars.forEach(function (car) {
          car.x += ln.dir * ln.speed * dt;
          if (ln.dir > 0 && car.x > 1.1) car.x = -car.w - 0.05;
          if (ln.dir < 0 && car.x + car.w < -0.1) car.x = 1.05;
        });
      });

      /* lanes occupy rows 2 .. 2+LANES-1 */
      var lane = r.me.row - 2;
      if (lane >= 0 && lane < LANES) {
        var ln = r.lanes[lane];
        for (var i = 0; i < ln.cars.length; i++) {
          var car = ln.cars[i];
          if (r.me.x > car.x - 0.02 && r.me.x < car.x + car.w + 0.02) { squashed(); return; }
        }
      }
    }

    /* ------------------------------ draw ----------------------------- */
    function layout(view) {
      cw = view.w;
      ch = (view.h - 54) / ROWS;
    }

    function draw(ctx, view, clock) {
      var r = run;
      ctx.fillStyle = '#071024';
      ctx.fillRect(0, 0, view.w, view.h);
      if (!r) return;
      ctx.save();
      if (r.shake > 0) ctx.translate((Math.random() - 0.5) * r.shake * 12, 0);
      var top = 48;

      /* rows */
      for (var row = 0; row < ROWS; row++) {
        var y = top + row * ch;
        var lane = row - 2;
        if (row === 0) ctx.fillStyle = '#10204a';
        else if (lane >= 0 && lane < LANES) ctx.fillStyle = row % 2 ? '#0d1530' : '#0f1838';
        else ctx.fillStyle = '#123524';
        ctx.fillRect(0, y, view.w, ch);
        if (lane >= 0 && lane < LANES) {
          ctx.strokeStyle = 'rgba(255,255,255,.14)';
          ctx.setLineDash([10, 12]);
          ctx.beginPath();
          ctx.moveTo(0, y + ch / 2);
          ctx.lineTo(view.w, y + ch / 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      /* the gates */
      r.gates.forEach(function (g) {
        var gx = g.x * view.w, gw = g.w * view.w - 8;
        ctx.fillStyle = 'rgba(8,14,44,.9)';
        K.roundRect(ctx, gx - gw / 2, top + 4, gw, ch - 8, 8);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,210,63,.55)';
        ctx.lineWidth = 2;
        K.roundRect(ctx, gx - gw / 2, top + 4, gw, ch - 8, 8);
        ctx.stroke();
        if (r.q.type === 'flagpick') {
          var fh = ch - 22, fw = Math.min(gw - 14, fh / 0.62);
          K.drawFlag(ctx, g.c.flag, gx - fw / 2, top + (ch - fw * 0.62) / 2, fw, fw * 0.62, 3);
        } else {
          ctx.fillStyle = '#EAF2FF';
          var label = K.fitText(ctx, g.c.text, gw - 12, 14, 700);
          ctx.textAlign = 'center';
          ctx.fillText(label, gx, top + ch / 2 + 5);
          ctx.textAlign = 'left';
        }
      });

      /* traffic */
      r.lanes.forEach(function (ln, i) {
        var y = top + (i + 2) * ch;
        ln.cars.forEach(function (car) {
          ctx.fillStyle = ln.c;
          K.roundRect(ctx, car.x * view.w, y + ch * 0.18, car.w * view.w, ch * 0.64, 6);
          ctx.fill();
          ctx.fillStyle = 'rgba(0,0,0,.35)';
          var wx = ln.dir > 0 ? car.x * view.w + car.w * view.w - 10 : car.x * view.w + 4;
          ctx.fillRect(wx, y + ch * 0.28, 6, ch * 0.44);
        });
      });

      /* you */
      var my = top + r.me.row * ch + ch / 2;
      var mx = r.me.x * view.w;
      var lift = r.hop > 0 ? Math.sin((0.14 - r.hop) / 0.14 * Math.PI) * 6 : 0;
      if (r.dead > 0) {
        ctx.fillStyle = '#FF8A8E';
        ctx.globalAlpha = Math.abs(Math.sin(clock * 20));
      } else {
        ctx.fillStyle = '#8CF5C2';
      }
      ctx.beginPath();
      ctx.arc(mx, my - lift, Math.min(13, ch * 0.3), 0, K.TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#06301f';
      ctx.beginPath();
      ctx.arc(mx - 4, my - lift - 3, 2, 0, K.TAU);
      ctx.arc(mx + 4, my - lift - 3, 2, 0, K.TAU);
      ctx.fill();

      E.fx.draw(ctx, 1, 0, 0);

      for (var l = 0; l < r.lives; l++) {
        ctx.fillStyle = '#8CF5C2';
        ctx.beginPath();
        ctx.arc(view.w - 18 - l * 18, view.h - 14, 5, 0, K.TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    E = K.engine(host, {
      cls: 'gk-crossing',
      aspect: 1.35,
      stats: [['score', 'points'], ['right', 'right'], ['round', 'crossing']],
      intro: {
        eyebrow: 'Border Crossing', icon: I.pin,
        title: 'Press an arrow key to step off the kerb',
        lines: ['Arrow keys or WASD to hop, or tap where you want to go.',
                'Get across the traffic and through the gate the banner asks for. A car costs a life.']
      },
      start: function (view) { layout(view); fresh(); },
      step: step,
      draw: draw,
      resize: layout,
      key: function (e) {
        var k = e.key;
        if (k === 'ArrowLeft' || k === 'a' || k === 'A') { move(-1, 0); return true; }
        if (k === 'ArrowRight' || k === 'd' || k === 'D') { move(1, 0); return true; }
        if (k === 'ArrowUp' || k === 'w' || k === 'W') { move(0, -1); return true; }
        if (k === 'ArrowDown' || k === 's' || k === 'S') { move(0, 1); return true; }
        return false;
      },
      pointer: function (kind, x, y) {
        if (kind !== 'down') return;
        var myY = 48 + run.me.row * ch + ch / 2;
        var dx = x - run.me.x * E.view.w, dy = y - myY;
        if (Math.abs(dy) > ch * 0.5 && Math.abs(dy) > Math.abs(dx)) move(0, dy > 0 ? 1 : -1);
        else move(dx > 0 ? 1 : -1, 0);
      },
      score: function () { return run.score; },
      best: function (s) { return K.keepBest('crossing', 'best', s); },
      over: function () {
        return {
          eyebrow: 'Flattened',
          title: run.right ? run.right + ' crossing' + (run.right === 1 ? '' : 's') + ' made' : 'No crossings made',
          text: 'Best run of ' + run.bestStreak + ' in a row.',
          stats: [[run.score, 'Points'], [run.right, 'Right'], [K.record('crossing').best || 0, 'Best']]
        };
      },
      onBack: opts.onBack
    });

    return { destroy: E.destroy, get run() { return run; } };
  }

  global.GeoCrossing = { mount: mount };
})(window);
