/* ------------------------------------------------------------------
   LearnGeo — Capital Whack
   Nine holes, answers popping out of them, and ninety seconds. The
   banner names a country and the right answer is up there somewhere,
   among wrong ones that look just as inviting.

     GeoWhack.mount(host, { length(), cfg(), onBack() })
       length  round length in seconds, read when a run starts

   There is no life to lose. The clock is the whole pressure, and a
   wrong whack costs you time rather than ending anything.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons, K = global.GameKit;

  var COLS = 3, ROWS = 3;
  var UP_TIME = 2.4;            /* how long a head stays up */
  var PENALTY = 3;              /* seconds a wrong whack costs */
  var RESULT_TIME = 1.9;

  function mount(host, opts) {
    var ask = K.asker({ cfg: opts.cfg, types: function () { return ['capital', 'country']; } });
    var run = null, E = null, hx = 0, hy = 0, hw = 0, hh = 0;

    function fresh() {
      run = {
        left: opts.length(), score: 0, right: 0, wrong: 0, streak: 0, bestStreak: 0,
        holes: [], q: null, result: null, time: 0, askedAt: 0, shake: 0, round: 0
      };
      for (var i = 0; i < COLS * ROWS; i++) run.holes.push({ up: 0, c: null, hit: 0 });
      next();
    }

    /* A fresh question sends the right answer up with two or three
       wrong ones, in holes picked at random. */
    function next() {
      var r = run;
      r.q = ask.next();
      r.askedAt = r.time;
      r.round += 1;
      r.holes.forEach(function (h) { h.up = 0; h.c = null; h.hit = 0; });
      var spots = W.shuffle(r.holes.slice());
      var choices = W.shuffle(r.q.choices.slice()).slice(0, Math.min(4, r.q.choices.length));
      /* the right answer is always one of them */
      if (!choices.some(function (c) { return c.correct; })) {
        choices[0] = r.q.choices.filter(function (c) { return c.correct; })[0];
      }
      choices.forEach(function (c, i) {
        if (!spots[i]) return;
        spots[i].c = c;
        spots[i].up = 0.001;
        spots[i].life = UP_TIME + Math.random() * 1.2;
      });
      paintBanner();
    }

    function paintBanner() {
      var q = run.q;
      var line = q.type === 'country'
        ? 'Whack the country whose capital is <b>' + W.escapeHtml(q.subject) + '</b>'
        : 'Whack the capital of <b>' + W.escapeHtml(q.country.name) + '</b>';
      K.banner(E.banner, {
        tag: Math.ceil(run.left) + 's left',
        tagIcon: I.clock,
        line: line,
        result: run.result
      });
    }

    function whack(h) {
      if (!h.c || h.hit || h.up <= 0) return;
      var r = run, correct = !!h.c.correct;
      var gains = K.award(correct, r.q.country.name);
      h.hit = 0.001;
      var c = centre(r.holes.indexOf(h));

      if (correct) {
        r.right += 1;
        r.streak += 1;
        r.bestStreak = Math.max(r.bestStreak, r.streak);
        var quick = Math.max(0, Math.round(40 - (r.time - r.askedAt) * 8));
        var pts = 100 + quick + Math.min(5, r.streak) * 25;
        r.score += pts;
        E.fx.burst(c.x, c.y, '#FFD23F', 20);
        E.fx.text(c.x, c.y - 20, '+' + pts, '#FFE27A');
        r.result = K.verdict(true, r.q, h.c, '+' + pts + (gains.xp ? ' · +' + gains.xp + ' XP' : ''));
        r.result.t = RESULT_TIME;
        next();
        return;
      }
      r.wrong += 1;
      r.streak = 0;
      r.shake = 0.3;
      r.left = Math.max(0, r.left - PENALTY);
      E.fx.burst(c.x, c.y, '#FF8A8E', 14);
      E.fx.text(c.x, c.y - 20, '−' + PENALTY + 's', '#FF9EA1');
      r.result = K.verdict(false, r.q, h.c);
      r.result.t = RESULT_TIME;
      paintBanner();
      if (r.left <= 0) E.finish();
    }

    /* ------------------------------ frame ---------------------------- */
    function step(dt) {
      var r = run;
      r.time += dt;
      r.left -= dt;
      if (r.shake > 0) r.shake = Math.max(0, r.shake - dt);
      /* The banner carries the countdown, so it is rebuilt when the
         second changes or the result line comes and goes, never every
         frame. */
      var secs = Math.ceil(r.left);
      var had = !!r.result;
      if (r.result && (r.result.t -= dt) <= 0) r.result = null;
      if (secs !== r.shownSecs || had !== !!r.result) { r.shownSecs = secs; paintBanner(); }

      if (r.left <= 0) { r.left = 0; return E.finish(); }

      var anyUp = false;
      r.holes.forEach(function (h) {
        if (h.hit) { h.hit += dt; return; }
        if (h.up > 0) {
          h.up += dt;
          if (h.up > h.life) { h.up = 0; h.c = null; }
          else anyUp = true;
        }
      });
      /* everything ducked back down without being hit: ask again */
      if (!anyUp && !r.holes.some(function (h) { return h.hit && h.hit < 0.4; })) next();
    }

    /* ------------------------------ draw ----------------------------- */
    function layout(view) {
      var padY = 56;
      hw = Math.floor((view.w - 40) / COLS);
      hh = Math.floor((view.h - padY - 24) / ROWS);
      hx = Math.round((view.w - hw * COLS) / 2);
      hy = padY;
    }

    function centre(i) {
      return { x: hx + (i % COLS + 0.5) * hw, y: hy + (Math.floor(i / COLS) + 0.5) * hh };
    }

    function draw(ctx, view, clock) {
      var r = run;
      ctx.fillStyle = '#10251a';
      ctx.fillRect(0, 0, view.w, view.h);
      if (!r) return;
      ctx.save();
      if (r.shake > 0) ctx.translate((Math.random() - 0.5) * r.shake * 12, 0);

      r.holes.forEach(function (h, i) {
        var c = centre(i);
        var rw = hw * 0.78, rh = hh * 0.26;

        /* the hole */
        ctx.fillStyle = '#071509';
        ctx.beginPath();
        ctx.ellipse(c.x, c.y + hh * 0.22, rw / 2, rh / 2, 0, 0, K.TAU);
        ctx.fill();

        if (!h.c) return;
        var t = h.hit ? Math.max(0, 1 - h.hit / 0.4)
                      : Math.min(1, h.up / 0.18) * (h.up > h.life - 0.25 ? Math.max(0, (h.life - h.up) / 0.25) : 1);
        if (t <= 0) return;

        var bw = hw * 0.86, bh = hh * 0.5;
        var by = c.y + hh * 0.22 - bh * t;
        ctx.save();
        ctx.beginPath();
        ctx.rect(c.x - bw / 2 - 6, by - 10, bw + 12, bh + 10);
        ctx.clip();

        ctx.fillStyle = h.hit ? (h.c.correct ? '#1f7a52' : '#7a2430') : '#1B4DFF';
        K.roundRect(ctx, c.x - bw / 2, by, bw, bh + 14, 10);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.3)';
        ctx.lineWidth = 1.5;
        K.roundRect(ctx, c.x - bw / 2, by, bw, bh + 14, 10);
        ctx.stroke();

        ctx.fillStyle = '#fff';
        var label = K.fitText(ctx, h.c.text, bw - 14, 15, 700);
        ctx.textAlign = 'center';
        ctx.fillText(label, c.x, by + bh * 0.58);
        ctx.textAlign = 'left';
        ctx.restore();
      });

      E.fx.draw(ctx, 1, 0, 0);

      /* the clock, as a bar across the bottom */
      var frac = Math.max(0, r.left / opts.length());
      ctx.fillStyle = 'rgba(255,255,255,.15)';
      ctx.fillRect(16, view.h - 14, view.w - 32, 6);
      ctx.fillStyle = frac < 0.2 ? '#FF8A8E' : '#FFD23F';
      ctx.fillRect(16, view.h - 14, (view.w - 32) * frac, 6);
      ctx.restore();
    }

    E = K.engine(host, {
      cls: 'gk-whack',
      aspect: 1.4,
      stats: [['score', 'points'], ['right', 'right'], ['left', 'seconds']],
      intro: {
        eyebrow: 'Capital Whack', icon: I.clock,
        title: 'Press anything, or tap, to start the clock',
        lines: ['Answers pop out of the nine holes. Whack the one the banner asks for, by clicking it or pressing 1 to 9.',
                'A wrong one costs you three seconds. There are no lives: the clock is the whole game.']
      },
      start: function (view) { layout(view); fresh(); },
      step: step,
      draw: draw,
      resize: layout,
      key: function (e) {
        var n = '123456789'.indexOf(e.key);
        if (n === -1) return false;
        /* the keypad reads the way the holes look: 1 is top-left */
        whack(run.holes[n]);
        return true;
      },
      pointer: function (kind, x, y) {
        if (kind !== 'down') return;
        var col = Math.floor((x - hx) / hw), row = Math.floor((y - hy) / hh);
        if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return;
        whack(run.holes[row * COLS + col]);
      },
      score: function () { return run.score; },
      best: function (s) { return K.keepBest('whack', 'best', s); },
      over: function () {
        return {
          eyebrow: 'Time',
          title: run.right ? run.right + ' whacked' : 'Nothing whacked',
          text: 'Best run of ' + run.bestStreak + ' in a row, and ' + run.wrong + ' wrong.',
          stats: [[run.score, 'Points'], [run.right, 'Right'], [K.record('whack').best || 0, 'Best']]
        };
      },
      onBack: opts.onBack
    });

    /* The HUD counts whole seconds, not a flickering fraction. */
    var tick = setInterval(function () {
      if (run) E.shell.set('left', Math.max(0, Math.ceil(run.left)));
    }, 200);

    return {
      destroy: function () { clearInterval(tick); E.destroy(); },
      get run() { return run; }
    };
  }

  global.GeoWhack = { mount: mount };
})(window);
