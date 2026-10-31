/* ------------------------------------------------------------------
   LearnGeo — Flag Breakout
   Breakout with a wall of flags. The banner names a country and its
   flag is somewhere in the wall; knock that brick out.

     GeoBreakout.mount(host, { rows(), cfg(), onBack() })
       rows  how many rows the wall starts with, read when a wave builds

   Aiming a bouncing ball at one brick is the skill, so a wrong brick is
   not punished with a life — it tells you whose flag you just hit and
   moves on. Only losing the ball costs you.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons, K = global.GameKit;

  var LIVES = 3;
  var COLS = 7;
  var PAD_W = 0.17;             /* of the width */
  var BALL_R = 7;
  var SPEED0 = 0.42;            /* of the height, per second */
  var SPEED_UP = 1.035;
  var RESULT_TIME = 2.2;

  function mount(host, opts) {
    var run = null, E = null;

    function fresh(view) {
      run = {
        lives: LIVES, score: 0, right: 0, wrong: 0, streak: 0, bestStreak: 0,
        wave: 1, bricks: [], target: null, result: null, shake: 0, time: 0, askedAt: 0,
        pad: { x: view.w / 2, w: view.w * PAD_W },
        ball: null, stuck: true
      };
      build(view);
      reball(view);
    }

    /* A wall of distinct flags out of the study set. */
    function build(view) {
      var pool = global.StudyFilters.pool(opts.cfg()).filter(function (c) { return !!c.flag; });
      if (pool.length < COLS) {
        pool = pool.concat(global.Quiz.pool({ scope: 'all' }).filter(function (c) { return !!c.flag; }));
      }
      var rows = Math.max(2, Math.min(5, opts.rows() + Math.floor((run.wave - 1) / 2)));
      var want = Math.min(rows * COLS, pool.length);
      var pick = W.shuffle(pool.slice()).slice(0, want);
      K.preload(pick);

      var top = view.h * 0.13;
      var bw = (view.w - 24) / COLS, bh = Math.max(24, view.h * 0.072);
      run.bricks = pick.map(function (c, i) {
        var col = i % COLS, row = Math.floor(i / COLS);
        return { c: c, x: 12 + col * bw + 3, y: top + row * (bh + 5), w: bw - 6, h: bh, dead: 0 };
      });
      retarget();
    }

    /* The next country to call for, always one still in the wall. */
    function retarget() {
      var live = run.bricks.filter(function (b) { return !b.dead; });
      if (!live.length) return null;
      var cfg = opts.cfg();
      /* weakest first, when that is what the filters ask for */
      if (cfg.weakFirst) {
        live = live.slice().sort(function (a, b) {
          return box(a.c) - box(b.c);
        }).slice(0, Math.max(3, Math.ceil(live.length / 3)));
      }
      run.target = W.pick(live).c;
      run.askedAt = run.time;
      paintBanner();
      return run.target;
    }

    function box(c) {
      var m = W.state.mastery[c.name];
      return (m ? m.box * 10 - m.w * 3 : -1) + Math.random();
    }

    function paintBanner() {
      if (!run.target) return;
      K.banner(E.banner, {
        tag: 'Wave ' + run.wave,
        tagIcon: I.flag,
        line: 'Knock out the flag of <b>' + W.escapeHtml(run.target.name) + '</b>',
        result: run.result
      });
    }

    function reball(view) {
      run.ball = { x: run.pad.x, y: view.h - 52, vx: 0, vy: 0, speed: SPEED0 * view.h };
      run.stuck = true;
    }

    function launch() {
      if (!run.stuck) return;
      run.stuck = false;
      var a = -Math.PI / 2 + (Math.random() - 0.5) * 0.7;
      run.ball.vx = Math.cos(a);
      run.ball.vy = Math.sin(a);
      W.Sound.flip();
    }

    /* ----------------------------- answers --------------------------- */
    function smash(b) {
      b.dead = 0.001;
      var correct = run.target && b.c.name === run.target.name;
      var gains = K.award(correct, correct ? b.c.name : run.target.name);
      var cx = b.x + b.w / 2, cy = b.y + b.h / 2;

      if (correct) {
        run.right += 1;
        run.streak += 1;
        run.bestStreak = Math.max(run.bestStreak, run.streak);
        var quick = Math.max(0, Math.round(50 - (run.time - run.askedAt) * 6));
        var pts = 120 + quick + Math.min(5, run.streak) * 20;
        run.score += pts;
        E.fx.burst(cx, cy, '#FFD23F', 20);
        E.fx.text(cx, cy - 14, '+' + pts, '#FFE27A');
        run.result = { correct: true, t: RESULT_TIME,
          html: I.check + ' ' + W.escapeHtml('That is ' + b.c.name + '’s flag') +
            ' · +' + pts + (gains.xp ? ' · +' + gains.xp + ' XP' : '') };
      } else {
        run.wrong += 1;
        run.streak = 0;
        E.fx.burst(cx, cy, '#9AA6C8', 12);
        run.result = { correct: false, t: RESULT_TIME,
          html: I.x + ' ' + W.escapeHtml('That one was ' + b.c.name + '. Still looking for ' +
            (run.target ? run.target.name : '') + '.') };
      }

      /* the wall is out, or the country we were calling for has gone */
      var live = run.bricks.filter(function (x) { return !x.dead; });
      if (!live.length) {
        run.wave += 1;
        run.score += 200;
        build(E.view);
        reball(E.view);
        return;
      }
      if (correct) retarget(); else paintBanner();
    }

    function lose() {
      run.lives -= 1;
      run.streak = 0;
      run.shake = 0.4;
      W.Sound.wrong();
      if (run.lives <= 0) return E.finish();
      reball(E.view);
    }

    /* ------------------------------ frame ---------------------------- */
    function step(dt) {
      var view = E.view, r = run;
      r.time += dt;
      if (r.shake > 0) r.shake = Math.max(0, r.shake - dt);
      if (r.result && (r.result.t -= dt) <= 0) { r.result = null; paintBanner(); }
      r.bricks.forEach(function (b) { if (b.dead) b.dead += dt; });

      r.pad.w = view.w * PAD_W;
      r.pad.x = Math.max(r.pad.w / 2, Math.min(view.w - r.pad.w / 2, r.pad.x));

      var b = r.ball;
      if (r.stuck) { b.x = r.pad.x; b.y = view.h - 52; return; }

      /* step in slices, so a fast ball cannot tunnel through a brick */
      var dist = b.speed * dt, slices = Math.max(1, Math.ceil(dist / 6));
      for (var s = 0; s < slices && !r.stuck; s++) {
        b.x += b.vx * dist / slices;
        b.y += b.vy * dist / slices;

        if (b.x < BALL_R) { b.x = BALL_R; b.vx = Math.abs(b.vx); }
        if (b.x > view.w - BALL_R) { b.x = view.w - BALL_R; b.vx = -Math.abs(b.vx); }
        if (b.y < BALL_R) { b.y = BALL_R; b.vy = Math.abs(b.vy); }

        /* the paddle, which steers as well as bounces */
        var py = view.h - 34;
        if (b.vy > 0 && b.y + BALL_R > py && b.y < py + 16 &&
            b.x > r.pad.x - r.pad.w / 2 - BALL_R && b.x < r.pad.x + r.pad.w / 2 + BALL_R) {
          var off = (b.x - r.pad.x) / (r.pad.w / 2);
          var a = -Math.PI / 2 + Math.max(-1, Math.min(1, off)) * 1.05;
          b.vx = Math.cos(a);
          b.vy = Math.sin(a);
          b.y = py - BALL_R;
          b.speed = Math.min(b.speed * 1.012, view.h * 0.95);
          W.Sound.flip();
        }

        if (b.y - BALL_R > view.h) { lose(); return; }

        for (var i = 0; i < r.bricks.length; i++) {
          var k = r.bricks[i];
          if (k.dead) continue;
          if (b.x > k.x - BALL_R && b.x < k.x + k.w + BALL_R &&
              b.y > k.y - BALL_R && b.y < k.y + k.h + BALL_R) {
            /* bounce off whichever face it came through */
            var ox = Math.min(Math.abs(b.x - k.x), Math.abs(b.x - (k.x + k.w)));
            var oy = Math.min(Math.abs(b.y - k.y), Math.abs(b.y - (k.y + k.h)));
            if (ox < oy) b.vx = -b.vx; else b.vy = -b.vy;
            b.speed = Math.min(b.speed * SPEED_UP, view.h * 0.95);
            smash(k);
            break;
          }
        }
      }
    }

    /* ------------------------------ draw ----------------------------- */
    function draw(ctx, view) {
      var r = run;
      ctx.save();
      if (r && r.shake > 0) ctx.translate((Math.random() - 0.5) * r.shake * 14, 0);

      var g = ctx.createLinearGradient(0, 0, 0, view.h);
      g.addColorStop(0, '#141a3c');
      g.addColorStop(1, '#070a18');
      ctx.fillStyle = g;
      ctx.fillRect(-20, -20, view.w + 40, view.h + 40);
      if (!r) { ctx.restore(); return; }

      r.bricks.forEach(function (b) {
        if (b.dead) {
          var t = Math.min(1, b.dead / 0.35);
          ctx.globalAlpha = 1 - t;
          K.drawFlag(ctx, b.c.flag, b.x - t * 6, b.y - t * 6, b.w + t * 12, b.h + t * 12, 4);
          ctx.globalAlpha = 1;
          return;
        }
        K.drawFlag(ctx, b.c.flag, b.x, b.y, b.w, b.h, 4);
        /* the one being called for gets a ring, so it can be found */
        if (r.target && b.c.name === r.target.name) {
          ctx.strokeStyle = '#FFD23F';
          ctx.lineWidth = 2.5;
          K.roundRect(ctx, b.x - 2, b.y - 2, b.w + 4, b.h + 4, 6);
          ctx.stroke();
        }
      });

      /* paddle */
      ctx.fillStyle = '#7CF3FF';
      K.roundRect(ctx, r.pad.x - r.pad.w / 2, view.h - 34, r.pad.w, 11, 6);
      ctx.fill();

      /* ball */
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(r.ball.x, r.ball.y, BALL_R, 0, K.TAU);
      ctx.fill();

      if (r.stuck) {
        ctx.fillStyle = 'rgba(255,255,255,.75)';
        ctx.font = '600 13px ' + K.FONT;
        ctx.textAlign = 'center';
        ctx.fillText('Space or tap to serve', view.w / 2, view.h - 64);
        ctx.textAlign = 'left';
      }

      E.fx.draw(ctx, 1, 0, 0);

      for (var l = 0; l < r.lives; l++) {
        ctx.fillStyle = '#FFD23F';
        ctx.beginPath();
        ctx.arc(view.w - 18 - l * 18, view.h - 14, 5, 0, K.TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    E = K.engine(host, {
      cls: 'gk-breakout',
      aspect: 1.45,
      stats: [['score', 'points'], ['right', 'right'], ['wave', 'wave']],
      intro: {
        eyebrow: 'Flag Breakout', icon: I.flag,
        title: 'Press an arrow key, Space, or tap',
        lines: ['Move the paddle with the arrow keys or the mouse, and serve with Space.',
                'The banner names a country and rings its flag in the wall. Knock that brick out. A wrong brick only tells you whose it was; losing the ball costs a life.']
      },
      start: fresh,
      step: step,
      draw: draw,
      resize: function (view) { if (run) { run.pad.w = view.w * PAD_W; build(view); reball(view); } },
      key: function (e) {
        var k = e.key;
        if (k === 'ArrowLeft' || k === 'a' || k === 'A') { run.pad.x -= E.view.w * 0.07; return true; }
        if (k === 'ArrowRight' || k === 'd' || k === 'D') { run.pad.x += E.view.w * 0.07; return true; }
        if (k === ' ') { launch(); return true; }
        return false;
      },
      pointer: function (kind, x) {
        if (kind === 'move' || kind === 'down') run.pad.x = x;
        if (kind === 'down') launch();
      },
      score: function () { return run.score; },
      best: function (s) { return K.keepBest('breakout', 'best', s); },
      over: function () {
        return {
          eyebrow: 'Out of balls',
          title: run.right ? run.right + ' flag' + (run.right === 1 ? '' : 's') + ' knocked out' : 'No flags knocked out',
          text: 'You reached wave ' + run.wave + '.',
          stats: [[run.score, 'Points'], [run.right, 'Right'], [K.record('breakout').best || 0, 'Best']]
        };
      },
      onBack: opts.onBack
    });

    return { destroy: E.destroy, get run() { return run; } };
  }

  global.GeoBreakout = { mount: mount };
})(window);
