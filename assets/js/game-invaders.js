/* ------------------------------------------------------------------
   LearnGeo — Geo Invaders
   Space Invaders, where the formation is the answer sheet. Four pods
   march across the sky carrying flags or capitals, and the banner names
   the country. Shoot the right pod.

     GeoInvaders.mount(host, { kind(), cfg(), onBack() })
       kind  'flags' | 'capitals' | 'mix', read per question

   The descent is the clock: every march that reaches the edge drops the
   formation a step, and a formation that reaches the cannon costs a
   life. So a slow answer is punished by the game rather than by a timer
   bolted on top.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons, K = global.GameKit;

  var LIVES = 3;
  var STEP_DOWN = 0.055;        /* of the height, per edge bounce */
  var BULLET_SPEED = 1.15;      /* of the height, per second */
  var RESULT_TIME = 2.2;

  function mount(host, opts) {
    var ask = K.asker({
      cfg: opts.cfg,
      types: function () {
        var k = opts.kind();
        if (k === 'flags') return ['flagpick', 'capital'];
        if (k === 'mix') return W.pick([['flagpick', 'capital'], ['capital', 'flagpick']]);
        return ['capital', 'flagpick'];
      }
    });

    var run = null, E = null;

    function fresh(view) {
      run = {
        lives: LIVES, score: 0, right: 0, wrong: 0, streak: 0, bestStreak: 0,
        wave: 1, speed: 0.1, dir: 1, pods: [], bullets: [], q: null,
        askedAt: 0, time: 0, result: null, shake: 0,
        ship: { x: view.w / 2, cool: 0 }, aim: null
      };
      next();
    }

    /* A pod per choice, in one row, marching together. */
    function next() {
      var view = E ? E.view : { w: 800, h: 500 };
      run.q = ask.next();
      run.askedAt = run.time;
      var n = run.q.choices.length;
      var pw = Math.min(170, (view.w - 40) / n - 14);
      var ph = pw * 0.52;
      var gap = (view.w - n * pw) / (n + 1);
      run.pods = run.q.choices.map(function (c, i) {
        return { c: c, x: gap + i * (pw + gap), y: view.h * 0.16, w: pw, h: ph, dead: 0 };
      });
      run.speed = 0.055 + Math.min(0.09, run.wave * 0.006);
      run.dir = Math.random() < 0.5 ? 1 : -1;
      paintBanner();
    }

    function paintBanner() {
      var q = run.q;
      var what = q.type === 'flagpick' ? 'flag' : 'capital';
      K.banner(E.banner, {
        tag: 'Wave ' + run.wave,
        tagIcon: I.target,
        line: 'Shoot the ' + what + ' of <b>' + W.escapeHtml(q.country.name) + '</b>',
        result: run.result
      });
    }

    /* ----------------------------- firing ---------------------------- */
    function fire() {
      if (run.ship.cool > 0) return;
      run.ship.cool = 0.26;
      run.bullets.push({ x: run.ship.x, y: E.view.h - 46 });
      W.Sound.flip();
    }

    function hit(pod) {
      var q = run.q, correct = !!pod.c.correct;
      var gains = K.award(correct, q.country.name);
      pod.dead = 0.001;

      var cx = pod.x + pod.w / 2, cy = pod.y + pod.h / 2;
      if (correct) {
        run.right += 1;
        run.streak += 1;
        run.bestStreak = Math.max(run.bestStreak, run.streak);
        var quick = Math.max(0, Math.round(60 - (run.time - run.askedAt) * 8));
        var pts = 100 + quick + Math.min(5, run.streak) * 20;
        run.score += pts;
        run.wave += 1;
        E.fx.burst(cx, cy, '#FFD23F', 22);
        E.fx.burst(cx, cy, '#8CF5C2', 14);
        E.fx.text(cx, cy - 18, '+' + pts, '#FFE27A');
        run.result = K.verdict(true, q, pod.c, '+' + pts + (gains.xp ? ' · +' + gains.xp + ' XP' : ''));
      } else {
        run.wrong += 1;
        run.streak = 0;
        run.lives -= 1;
        run.shake = 0.35;
        E.fx.burst(cx, cy, '#FF8A8E', 18);
        run.result = K.verdict(false, q, pod.c);
      }
      run.result.t = RESULT_TIME;
      paintBanner();
      if (run.lives <= 0) return E.finish();
      next();
    }

    /* The formation got through: a life, and a new question. */
    function landed() {
      run.lives -= 1;
      run.streak = 0;
      run.shake = 0.4;
      W.Sound.wrong();
      run.result = { correct: false, t: RESULT_TIME,
        html: I.x + ' ' + W.escapeHtml('They got through. ' + K.rightAnswer(run.q) + '.') };
      paintBanner();
      if (run.lives <= 0) return E.finish();
      next();
    }

    /* ------------------------------ frame ---------------------------- */
    function step(dt) {
      var view = E.view, r = run;
      r.time += dt;
      if (r.shake > 0) r.shake = Math.max(0, r.shake - dt);
      if (r.ship.cool > 0) r.ship.cool -= dt;
      if (r.result && (r.result.t -= dt) <= 0) { r.result = null; paintBanner(); }

      /* steering: a held key, or the pointer */
      if (r.aim !== null) {
        r.ship.x += Math.max(-520 * dt, Math.min(520 * dt, r.aim - r.ship.x));
      }
      r.ship.x = Math.max(24, Math.min(view.w - 24, r.ship.x));

      /* the march */
      var live = r.pods.filter(function (p) { return !p.dead; });
      var dx = r.dir * r.speed * view.w * dt;
      var edge = false;
      live.forEach(function (p) {
        p.x += dx;
        if (p.x < 8 || p.x + p.w > view.w - 8) edge = true;
      });
      if (edge) {
        r.dir *= -1;
        live.forEach(function (p) {
          p.x = Math.max(8, Math.min(view.w - 8 - p.w, p.x));
          p.y += view.h * STEP_DOWN;
        });
        if (live.some(function (p) { return p.y + p.h > view.h - 58; })) return landed();
      }

      /* bullets */
      r.bullets = r.bullets.filter(function (b) {
        b.y -= BULLET_SPEED * view.h * dt;
        if (b.y < -10) return false;
        for (var i = 0; i < r.pods.length; i++) {
          var p = r.pods[i];
          if (p.dead) continue;
          if (b.x > p.x && b.x < p.x + p.w && b.y > p.y && b.y < p.y + p.h) { hit(p); return false; }
        }
        return true;
      });

      r.pods.forEach(function (p) { if (p.dead) p.dead += dt; });
    }

    /* ------------------------------ draw ----------------------------- */
    function draw(ctx, view, clock) {
      var r = run;
      ctx.save();
      if (r && r.shake > 0) {
        ctx.translate((Math.random() - 0.5) * r.shake * 16, (Math.random() - 0.5) * r.shake * 16);
      }

      /* sky */
      var sky = ctx.createLinearGradient(0, 0, 0, view.h);
      sky.addColorStop(0, '#0a0f30');
      sky.addColorStop(1, '#05070f');
      ctx.fillStyle = sky;
      ctx.fillRect(-20, -20, view.w + 40, view.h + 40);
      ctx.fillStyle = 'rgba(255,255,255,.5)';
      for (var i = 0; i < 46; i++) {
        var sx = (i * 137.5) % view.w, sy = (i * 71.3) % (view.h - 70);
        var tw = 0.4 + 0.6 * Math.abs(Math.sin(clock * 0.9 + i));
        ctx.globalAlpha = tw * 0.7;
        ctx.fillRect(sx, sy, 2, 2);
      }
      ctx.globalAlpha = 1;

      if (!r) { ctx.restore(); return; }

      /* the ground line the formation must not cross */
      ctx.strokeStyle = 'rgba(124,243,255,.35)';
      ctx.setLineDash([6, 8]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, view.h - 58);
      ctx.lineTo(view.w, view.h - 58);
      ctx.stroke();
      ctx.setLineDash([]);

      r.pods.forEach(function (p) { pod(ctx, p, clock); });

      /* bullets */
      ctx.fillStyle = '#7CF3FF';
      r.bullets.forEach(function (b) {
        ctx.fillRect(b.x - 2, b.y, 4, 14);
      });

      ship(ctx, view, r.ship);
      E.fx.draw(ctx, 1, 0, 0);

      /* lives */
      for (var l = 0; l < r.lives; l++) {
        ctx.fillStyle = '#FFD23F';
        tri(ctx, view.w - 20 - l * 20, view.h - 18, 7);
      }
      ctx.restore();
    }

    function pod(ctx, p, clock) {
      if (p.dead) {
        var t = Math.min(1, p.dead / 0.4);
        ctx.globalAlpha = 1 - t;
        ctx.strokeStyle = '#FFD23F';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x + p.w / 2, p.y + p.h / 2, 10 + t * 50, 0, K.TAU);
        ctx.stroke();
        ctx.globalAlpha = 1;
        return;
      }
      var bob = Math.sin(clock * 3 + p.x * 0.03) * 2;
      var y = p.y + bob;
      ctx.fillStyle = 'rgba(16,24,64,.92)';
      K.roundRect(ctx, p.x, y, p.w, p.h, 9);
      ctx.fill();
      ctx.strokeStyle = 'rgba(124,243,255,.55)';
      ctx.lineWidth = 2;
      K.roundRect(ctx, p.x, y, p.w, p.h, 9);
      ctx.stroke();

      /* the little legs, so it reads as an invader */
      ctx.fillStyle = 'rgba(124,243,255,.55)';
      ctx.fillRect(p.x + p.w * 0.2, y + p.h, 4, 5);
      ctx.fillRect(p.x + p.w * 0.8 - 4, y + p.h, 4, 5);

      if (p.c.flag && run.q.type === 'flagpick') {
        var fw = p.w - 20, fh = fw * 0.62;
        K.drawFlag(ctx, p.c.flag, p.x + 10, y + (p.h - fh) / 2, fw, fh, 3);
      } else {
        ctx.fillStyle = '#EAF2FF';
        var label = K.fitText(ctx, p.c.text, p.w - 16, 16, 700);
        ctx.textAlign = 'center';
        ctx.fillText(label, p.x + p.w / 2, y + p.h / 2 + 5);
        ctx.textAlign = 'left';
      }
    }

    function ship(ctx, view, s) {
      var y = view.h - 34;
      ctx.fillStyle = '#FFD23F';
      ctx.beginPath();
      ctx.moveTo(s.x, y - 16);
      ctx.lineTo(s.x + 17, y + 10);
      ctx.lineTo(s.x - 17, y + 10);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#1B4DFF';
      ctx.fillRect(s.x - 5, y - 2, 10, 8);
      /* thruster */
      ctx.fillStyle = 'rgba(124,243,255,' + (0.4 + Math.random() * 0.4) + ')';
      ctx.beginPath();
      ctx.moveTo(s.x - 5, y + 10);
      ctx.lineTo(s.x + 5, y + 10);
      ctx.lineTo(s.x, y + 18 + Math.random() * 5);
      ctx.closePath();
      ctx.fill();
    }

    function tri(ctx, x, y, r) {
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y + r);
      ctx.lineTo(x - r, y + r);
      ctx.closePath();
      ctx.fill();
    }

    /* ------------------------------ wiring --------------------------- */
    E = K.engine(host, {
      cls: 'gk-invaders',
      aspect: 1.62,
      stats: [['score', 'points'], ['right', 'right'], ['wave', 'wave']],
      intro: {
        eyebrow: 'Geo Invaders', icon: I.target,
        title: 'Press an arrow key, Space, or tap',
        lines: ['Steer with the arrow keys or A and D, or point with the mouse. Space fires.',
                'Shoot the pod the banner asks for. A wrong pod costs a life, and so does letting them land.']
      },
      start: fresh,
      step: step,
      draw: draw,
      resize: function (view) { if (run) run.ship.x = Math.min(run.ship.x, view.w - 24); },
      key: function (e) {
        var k = e.key;
        if (k === 'ArrowLeft' || k === 'a' || k === 'A') { run.aim = run.ship.x - 90; return true; }
        if (k === 'ArrowRight' || k === 'd' || k === 'D') { run.aim = run.ship.x + 90; return true; }
        if (k === ' ') { fire(); return true; }
        return false;
      },
      pointer: function (kind, x) {
        if (kind === 'move') { run.aim = x; return; }
        if (kind === 'down') { run.aim = x; fire(); }
      },
      score: function () { return run.score; },
      best: function (s) { return K.keepBest('invaders', 'best', s); },
      over: function () {
        return {
          eyebrow: 'The sky fell in',
          title: run.right ? 'You cleared ' + run.right + ' wave' + (run.right === 1 ? '' : 's') : 'No waves cleared',
          text: 'Best run of ' + run.bestStreak + ' in a row.',
          stats: [[run.score, 'Points'], [run.right, 'Right'], [K.record('invaders').best || 0, 'Best']]
        };
      },
      onBack: opts.onBack
    });

    return {
      destroy: E.destroy,
      get run() { return run; },
      fire: fire
    };
  }

  global.GeoInvaders = { mount: mount };
})(window);
