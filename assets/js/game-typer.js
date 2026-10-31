/* ------------------------------------------------------------------
   LearnGeo — Capital Typer
   Countries fall and you shoot them down by typing their capital. No
   multiple choice anywhere in this one: it is the only game that asks
   you to produce the answer rather than recognise it.

     GeoTyper.mount(host, { rate(), cfg(), onBack() })
       rate  'calm' | 'brisk' | 'frantic', read when a run starts

   Spelling is marked the way the rest of the app marks typed answers,
   through W.matches, so accents and the usual slips are forgiven and
   the aliases count.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons, K = global.GameKit;

  var SHIELDS = 3;
  var RATES = {
    calm:     { gap: 3.4, fall: 0.030, max: 2 },
    brisk:    { gap: 2.5, fall: 0.040, max: 3 },
    frantic:  { gap: 1.7, fall: 0.052, max: 4 }
  };
  var RESULT_TIME = 2.4;

  function mount(host, opts) {
    var run = null, E = null;

    function fresh() {
      var r = RATES[opts.rate()] || RATES.brisk;
      run = {
        shields: SHIELDS, score: 0, right: 0, missed: 0, streak: 0, bestStreak: 0,
        targets: [], buffer: '', since: r.gap, time: 0, rate: r, level: 1,
        result: null, shake: 0, recent: []
      };
    }

    /* One country at a time, never one already on screen. */
    function spawn(view) {
      var cfg = opts.cfg();
      var pool = global.StudyFilters.pool(cfg).filter(function (c) {
        return global.Quiz.fits('capital', c);
      });
      if (!pool.length) {
        pool = global.Quiz.pool({ scope: 'all' }).filter(function (c) {
          return global.Quiz.fits('capital', c);
        });
      }
      var here = run.targets.map(function (t) { return t.c.name; });
      var free = pool.filter(function (c) {
        return here.indexOf(c.name) === -1 && run.recent.indexOf(c.name) === -1;
      });
      if (!free.length) free = pool.filter(function (c) { return here.indexOf(c.name) === -1; });
      if (!free.length) return;

      var head = cfg.weakFirst ? free.slice(0, Math.max(6, Math.ceil(free.length / 3))) : free;
      var c = W.pick(head);
      run.recent.push(c.name);
      if (run.recent.length > 10) run.recent.shift();
      run.targets.push({
        c: c, x: 0.1 + Math.random() * 0.8, y: -0.04,
        born: run.time, hit: 0
      });
    }

    /* ----------------------------- typing ---------------------------- */
    function type(ch) {
      run.buffer += ch;
      check(false);
    }

    function submit() { check(true); }

    /* A buffer that matches any target on screen takes it down. On
       Enter, a buffer that matches nothing is a miss on the lowest one,
       so a wrong guess has a cost and the answer gets shown. */
    function check(forced) {
      var b = run.buffer.trim();
      if (!b) return;
      for (var i = 0; i < run.targets.length; i++) {
        var t = run.targets[i];
        if (t.hit) continue;
        if (W.matches(b, t.c.capital, t.c.capitalAliases)) {
          down(t, true);
          run.buffer = '';
          return;
        }
      }
      if (!forced) return;
      var low = null;
      run.targets.forEach(function (t) { if (!t.hit && (!low || t.y > low.y)) low = t; });
      run.buffer = '';
      if (low) down(low, false);
    }

    function down(t, correct) {
      t.hit = 0.001;
      var gains = K.award(correct, t.c.name);
      var view = E.view;
      var px = t.x * view.w, py = t.y * view.h;
      if (correct) {
        run.right += 1;
        run.streak += 1;
        run.bestStreak = Math.max(run.bestStreak, run.streak);
        var quick = Math.max(0, Math.round(40 - (run.time - t.born) * 4));
        var pts = 120 + quick + Math.min(5, run.streak) * 25;
        run.score += pts;
        run.level = 1 + Math.floor(run.right / 6);
        E.fx.burst(px, py, '#8CF5C2', 20);
        E.fx.text(px, py - 16, '+' + pts, '#FFE27A');
        run.result = { correct: true, t: RESULT_TIME,
          html: I.check + ' ' + W.escapeHtml(t.c.capital + ' · ' + t.c.name) +
            ' · +' + pts + (gains.xp ? ' · +' + gains.xp + ' XP' : '') };
      } else {
        run.streak = 0;
        run.shake = 0.28;
        E.fx.burst(px, py, '#FF8A8E', 10);
        run.result = { correct: false, t: RESULT_TIME,
          html: I.x + ' ' + W.escapeHtml(t.c.name + '’s capital is ' + t.c.capital) };
      }
      paintBanner();
    }

    function escaped(t) {
      run.shields -= 1;
      run.missed += 1;
      run.streak = 0;
      run.shake = 0.4;
      W.Sound.wrong();
      run.result = { correct: false, t: RESULT_TIME,
        html: I.x + ' ' + W.escapeHtml('Through: ' + t.c.name + ' · ' + t.c.capital) };
      paintBanner();
      if (run.shields <= 0) E.finish();
    }

    function paintBanner() {
      K.banner(E.banner, {
        tag: 'Level ' + run.level,
        tagIcon: I.bolt,
        line: 'Type the <b>capital</b> of each country, then Enter',
        result: run.result
      });
    }

    /* ------------------------------ frame ---------------------------- */
    function step(dt) {
      var r = run, view = E.view;
      r.time += dt;
      if (r.shake > 0) r.shake = Math.max(0, r.shake - dt);
      if (r.result && (r.result.t -= dt) <= 0) { r.result = null; paintBanner(); }

      var live = r.targets.filter(function (t) { return !t.hit; });
      r.since += dt;
      if (r.since >= r.rate.gap && live.length < r.rate.max) {
        r.since = 0;
        spawn(view);
      }

      var fall = r.rate.fall * (1 + (r.level - 1) * 0.12);
      r.targets.forEach(function (t) {
        if (t.hit) { t.hit += dt; return; }
        t.y += fall * dt;
        if (t.y > 0.86) { t.hit = 0.001; escaped(t); }
      });
      r.targets = r.targets.filter(function (t) { return !t.hit || t.hit < 0.45; });
    }

    /* ------------------------------ draw ----------------------------- */
    function draw(ctx, view, clock) {
      var r = run;
      var g = ctx.createLinearGradient(0, 0, 0, view.h);
      g.addColorStop(0, '#0b1030');
      g.addColorStop(1, '#04060f');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, view.w, view.h);
      if (!r) return;

      ctx.save();
      if (r.shake > 0) ctx.translate((Math.random() - 0.5) * r.shake * 12, 0);

      /* the line they must not cross */
      var line = view.h * 0.86;
      ctx.strokeStyle = 'rgba(255,154,61,.5)';
      ctx.setLineDash([5, 7]);
      ctx.beginPath();
      ctx.moveTo(0, line);
      ctx.lineTo(view.w, line);
      ctx.stroke();
      ctx.setLineDash([]);

      var typed = r.buffer.trim();
      r.targets.forEach(function (t) {
        var x = t.x * view.w, y = t.y * view.h;
        if (t.hit) {
          var k = Math.min(1, t.hit / 0.45);
          ctx.globalAlpha = 1 - k;
          ctx.strokeStyle = '#8CF5C2';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x, y, 12 + k * 46, 0, K.TAU);
          ctx.stroke();
          ctx.globalAlpha = 1;
          return;
        }
        /* a target lights up as soon as what you have typed could be it */
        var lit = typed && W.normalise(t.c.capital).indexOf(W.normalise(typed)) === 0;
        var label = K.fitText(ctx, t.c.name, view.w * 0.44, 17, 700);
        var tw = ctx.measureText(label).width;
        ctx.fillStyle = lit ? 'rgba(27,77,255,.9)' : 'rgba(16,24,64,.9)';
        K.roundRect(ctx, x - tw / 2 - 12, y - 16, tw + 24, 32, 9);
        ctx.fill();
        ctx.strokeStyle = lit ? '#7CF3FF' : 'rgba(124,243,255,.4)';
        ctx.lineWidth = lit ? 2.5 : 1.5;
        K.roundRect(ctx, x - tw / 2 - 12, y - 16, tw + 24, 32, 9);
        ctx.stroke();
        ctx.fillStyle = '#EAF2FF';
        ctx.textAlign = 'center';
        ctx.fillText(label, x, y + 6);
        ctx.textAlign = 'left';

        /* how close it is getting */
        var danger = Math.max(0, (t.y - 0.55) / 0.31);
        if (danger > 0) {
          ctx.fillStyle = 'rgba(255,138,142,' + (danger * 0.8) + ')';
          ctx.fillRect(x - tw / 2 - 12, y + 18, (tw + 24) * danger, 3);
        }
      });

      E.fx.draw(ctx, 1, 0, 0);

      /* what you are typing */
      var caret = Math.floor(clock * 2) % 2 ? '▌' : ' ';
      ctx.fillStyle = 'rgba(8,12,40,.9)';
      K.roundRect(ctx, 12, view.h - 42, view.w - 24, 32, 9);
      ctx.fill();
      ctx.strokeStyle = 'rgba(124,243,255,.4)';
      ctx.lineWidth = 1.5;
      K.roundRect(ctx, 12, view.h - 42, view.w - 24, 32, 9);
      ctx.stroke();
      ctx.font = '600 15px ' + K.MONO;
      ctx.fillStyle = r.buffer ? '#7CF3FF' : 'rgba(255,255,255,.35)';
      ctx.fillText(r.buffer ? r.buffer + caret : 'type a capital…', 24, view.h - 21);

      for (var s = 0; s < r.shields; s++) {
        ctx.fillStyle = '#FFD23F';
        ctx.beginPath();
        ctx.arc(view.w - 18 - s * 18, 14, 5, 0, K.TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    E = K.engine(host, {
      cls: 'gk-typer',
      aspect: 1.5,
      stats: [['score', 'points'], ['right', 'right'], ['shields', 'shields']],
      intro: {
        eyebrow: 'Capital Typer', icon: I.bolt,
        title: 'Start typing to begin',
        lines: ['Countries fall. Type the capital of one and it goes down; a box lights up as soon as what you have typed could be it.',
                'Enter submits, and a wrong guess shows you the answer. Three get through and the run is over.']
      },
      start: fresh,
      step: step,
      draw: draw,
      key: function (e) {
        if (e.metaKey || e.ctrlKey || e.altKey) return false;
        if (e.key === 'Backspace') { run.buffer = run.buffer.slice(0, -1); return true; }
        if (e.key === 'Enter') { submit(); return true; }
        if (e.key.length === 1 && e.key !== ' ') { type(e.key); return true; }
        if (e.key === ' ' && run.buffer) { type(' '); return true; }
        return false;
      },
      score: function () { return run.score; },
      best: function (s) { return K.keepBest('typer', 'best', s); },
      over: function () {
        return {
          eyebrow: 'Shields down',
          title: run.right ? run.right + ' capital' + (run.right === 1 ? '' : 's') + ' typed' : 'No capitals typed',
          text: 'Best run of ' + run.bestStreak + ' in a row, at level ' + run.level + '.',
          stats: [[run.score, 'Points'], [run.right, 'Typed'], [K.record('typer').best || 0, 'Best']]
        };
      },
      onBack: opts.onBack
    });

    return { destroy: E.destroy, get run() { return run; } };
  }

  global.GeoTyper = { mount: mount };
})(window);
