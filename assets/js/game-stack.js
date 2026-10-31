/* ------------------------------------------------------------------
   LearnGeo — Capital Stack
   Four columns, each headed by a country. A capital falls; slide it
   into the column it belongs to before it lands.

     GeoStack.mount(host, { speed(), cfg(), onBack() })
       speed  'relaxed' | 'normal' | 'fast', read when a run starts

   A wrong drop does not end anything: the block stays where it fell
   and the column grows. The game ends when a column reaches the
   headers, so mistakes cost you room rather than a life.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons, K = global.GameKit;

  var COLS = 4;
  var MAX_STACK = 5;            /* blocks per column before it is full */
  var SPEEDS = { relaxed: 0.10, normal: 0.145, fast: 0.2 };
  var RESULT_TIME = 2.1;

  function mount(host, opts) {
    var run = null, E = null, colW = 0, headY = 0, headH = 0, floorY = 0, blockH = 0;

    function fresh() {
      run = {
        score: 0, right: 0, wrong: 0, streak: 0, bestStreak: 0, level: 1,
        countries: [], stacks: [[], [], [], []], falling: null,
        speed: SPEEDS[opts.speed()] || SPEEDS.normal,
        time: 0, result: null, shake: 0, recent: []
      };
      headers();
      drop();
    }

    /* Four countries at the top, redrawn whenever the board clears. */
    function headers() {
      var list = global.StudyFilters.pool(opts.cfg()).filter(function (c) {
        return global.Quiz.fits('capital', c);
      });
      if (list.length < COLS) {
        list = global.Quiz.pool({ scope: 'all' }).filter(function (c) {
          return global.Quiz.fits('capital', c);
        });
      }
      var cfg = opts.cfg();
      var head = cfg.weakFirst ? list.slice(0, Math.max(COLS, Math.ceil(list.length / 2))) : list;
      run.countries = W.shuffle(head.slice()).slice(0, COLS);
      /* a short study set can repeat; a column still needs a country */
      while (run.countries.length < COLS) run.countries.push(W.pick(list));
    }

    function drop() {
      var r = run;
      var open = [];
      r.countries.forEach(function (c, i) { if (r.stacks[i].length < MAX_STACK) open.push(i); });
      if (!open.length) return E.finish();
      /* the capital that falls belongs to one of the four up there */
      var fresh2 = open.filter(function (i) { return r.recent.indexOf(r.countries[i].name) === -1; });
      var pick = W.pick(fresh2.length ? fresh2 : open);
      var c = r.countries[pick];
      r.recent.push(c.name);
      if (r.recent.length > 3) r.recent.shift();
      r.falling = { c: c, col: Math.floor(Math.random() * COLS), y: 0, born: r.time };
      paintBanner();
    }

    function paintBanner() {
      K.banner(E.banner, {
        tag: 'Level ' + run.level,
        tagIcon: I.layers,
        line: 'Slide each <b>capital</b> under its country',
        result: run.result
      });
    }

    function move(d) {
      if (!run.falling) return;
      run.falling.col = Math.max(0, Math.min(COLS - 1, run.falling.col + d));
    }

    function slam() {
      if (run.falling) run.falling.y = 1;
    }

    /* ------------------------------ landing -------------------------- */
    function land() {
      var r = run, f = r.falling, col = f.col;
      var correct = r.countries[col].name === f.c.name;
      var gains = K.award(correct, f.c.name);
      var cx = (col + 0.5) * colW;

      if (correct) {
        r.right += 1;
        r.streak += 1;
        r.bestStreak = Math.max(r.bestStreak, r.streak);
        var quick = Math.max(0, Math.round(40 - (r.time - f.born) * 5));
        var pts = 100 + quick + Math.min(5, r.streak) * 25;
        r.score += pts;
        r.level = 1 + Math.floor(r.right / 8);
        r.speed = (SPEEDS[opts.speed()] || SPEEDS.normal) * (1 + (r.level - 1) * 0.14);
        E.fx.burst(cx, floorY - 20, '#8CF5C2', 18);
        E.fx.text(cx, floorY - 44, '+' + pts, '#FFE27A');
        r.result = { correct: true, t: RESULT_TIME,
          html: I.check + ' ' + W.escapeHtml(f.c.capital + ' is ' + f.c.name + '’s') +
            ' · +' + pts + (gains.xp ? ' · +' + gains.xp + ' XP' : '') };
        /* a right answer clears that column back down */
        r.stacks[col] = [];
        /* and the country it belonged to is replaced */
        swap(col);
      } else {
        r.wrong += 1;
        r.streak = 0;
        r.shake = 0.3;
        r.stacks[col].push({ c: f.c, t: 0 });
        E.fx.burst(cx, floorY - 20, '#FF8A8E', 12);
        r.result = { correct: false, t: RESULT_TIME,
          html: I.x + ' ' + W.escapeHtml(f.c.capital + ' is ' + f.c.name + '’s, not ' +
            r.countries[col].name + '’s') };
      }
      r.falling = null;
      paintBanner();
      if (r.stacks.some(function (s) { return s.length >= MAX_STACK; })) return E.finish();
      drop();
    }

    function swap(col) {
      var r = run;
      var list = global.StudyFilters.pool(opts.cfg()).filter(function (c) {
        return global.Quiz.fits('capital', c) &&
          !r.countries.some(function (x, i) { return i !== col && x.name === c.name; });
      });
      if (!list.length) return;
      var cfg = opts.cfg();
      var head = cfg.weakFirst ? list.slice(0, Math.max(4, Math.ceil(list.length / 3))) : list;
      r.countries[col] = W.pick(head);
    }

    /* ------------------------------ frame ---------------------------- */
    function step(dt) {
      var r = run;
      r.time += dt;
      if (r.shake > 0) r.shake = Math.max(0, r.shake - dt);
      if (r.result && (r.result.t -= dt) <= 0) { r.result = null; paintBanner(); }
      r.stacks.forEach(function (s) { s.forEach(function (b) { b.t += dt; }); });
      if (!r.falling) return;
      r.falling.y += r.speed * dt;
      /* it lands on whatever is already in that column */
      var limit = 1 - (r.stacks[r.falling.col].length * blockH) / Math.max(1, floorY - headY - headH);
      if (r.falling.y >= limit) land();
    }

    /* ------------------------------ draw ----------------------------- */
    function layout(view) {
      colW = view.w / COLS;
      headY = 48;
      headH = Math.max(42, view.h * 0.13);
      floorY = view.h - 14;
      blockH = Math.max(26, Math.min(40, (floorY - headY - headH) / (MAX_STACK + 1)));
    }

    function draw(ctx, view) {
      var r = run;
      ctx.fillStyle = '#0b1030';
      ctx.fillRect(0, 0, view.w, view.h);
      if (!r) return;
      ctx.save();
      if (r.shake > 0) ctx.translate((Math.random() - 0.5) * r.shake * 10, 0);

      /* columns */
      for (var i = 0; i < COLS; i++) {
        ctx.fillStyle = i % 2 ? 'rgba(255,255,255,.025)' : 'rgba(255,255,255,.05)';
        ctx.fillRect(i * colW, headY, colW, floorY - headY);
        ctx.strokeStyle = 'rgba(124,243,255,.14)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(i * colW, headY);
        ctx.lineTo(i * colW, floorY);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(124,243,255,.4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, floorY);
      ctx.lineTo(view.w, floorY);
      ctx.stroke();

      /* the headers: the countries to aim at */
      r.countries.forEach(function (c, i) {
        var full = r.stacks[i].length >= MAX_STACK - 1;
        ctx.fillStyle = full ? 'rgba(122,36,48,.8)' : 'rgba(22,32,90,.9)';
        K.roundRect(ctx, i * colW + 5, headY + 4, colW - 10, headH - 8, 9);
        ctx.fill();
        ctx.strokeStyle = full ? '#FF8A8E' : 'rgba(255,210,63,.5)';
        ctx.lineWidth = 2;
        K.roundRect(ctx, i * colW + 5, headY + 4, colW - 10, headH - 8, 9);
        ctx.stroke();
        ctx.fillStyle = '#EAF2FF';
        var label = K.fitText(ctx, c.name, colW - 18, 15, 700);
        ctx.textAlign = 'center';
        ctx.fillText(label, i * colW + colW / 2, headY + headH / 2 + 5);
        ctx.textAlign = 'left';
      });

      /* what has piled up */
      r.stacks.forEach(function (s, i) {
        s.forEach(function (b, k) {
          var y = floorY - (k + 1) * blockH;
          ctx.fillStyle = 'rgba(122,36,48,.85)';
          K.roundRect(ctx, i * colW + 7, y + 2, colW - 14, blockH - 4, 7);
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,138,142,.5)';
          ctx.lineWidth = 1.4;
          K.roundRect(ctx, i * colW + 7, y + 2, colW - 14, blockH - 4, 7);
          ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,.75)';
          var lb = K.fitText(ctx, b.c.capital, colW - 20, 12, 600);
          ctx.textAlign = 'center';
          ctx.fillText(lb, i * colW + colW / 2, y + blockH / 2 + 4);
          ctx.textAlign = 'left';
        });
      });

      /* the one coming down */
      if (r.falling) {
        var top = headY + headH;
        var y = top + r.falling.y * (floorY - top - blockH);
        var x = r.falling.col * colW;
        ctx.fillStyle = '#1B4DFF';
        K.roundRect(ctx, x + 7, y, colW - 14, blockH - 4, 8);
        ctx.fill();
        ctx.strokeStyle = '#7CF3FF';
        ctx.lineWidth = 2;
        K.roundRect(ctx, x + 7, y, colW - 14, blockH - 4, 8);
        ctx.stroke();
        ctx.fillStyle = '#fff';
        var fl = K.fitText(ctx, r.falling.c.capital, colW - 20, 14, 700);
        ctx.textAlign = 'center';
        ctx.fillText(fl, x + colW / 2, y + blockH / 2 + 3);
        ctx.textAlign = 'left';

        /* the shadow showing where it will land */
        ctx.fillStyle = 'rgba(124,243,255,.14)';
        var ly = floorY - (r.stacks[r.falling.col].length + 1) * blockH;
        ctx.fillRect(x + 7, ly + 2, colW - 14, blockH - 4);
      }

      E.fx.draw(ctx, 1, 0, 0);
      ctx.restore();
    }

    E = K.engine(host, {
      cls: 'gk-stack',
      aspect: 1.35,
      stats: [['score', 'points'], ['right', 'right'], ['level', 'level']],
      intro: {
        eyebrow: 'Capital Stack', icon: I.layers,
        title: 'Press an arrow key to start the drop',
        lines: ['Arrow keys or A and D slide the falling capital, and Space drops it at once. You can also tap a column.',
                'A right answer clears that column and brings in a new country. A wrong one stays, and five deep ends the game.']
      },
      start: function (view) { layout(view); fresh(); },
      step: step,
      draw: draw,
      resize: layout,
      key: function (e) {
        var k = e.key;
        if (k === 'ArrowLeft' || k === 'a' || k === 'A') { move(-1); return true; }
        if (k === 'ArrowRight' || k === 'd' || k === 'D') { move(1); return true; }
        if (k === ' ' || k === 'ArrowDown' || k === 's' || k === 'S') { slam(); return true; }
        var n = '1234'.indexOf(k);
        if (n !== -1 && run.falling) { run.falling.col = n; slam(); return true; }
        return false;
      },
      pointer: function (kind, x) {
        if (kind !== 'down' || !run.falling) return;
        var col = Math.max(0, Math.min(COLS - 1, Math.floor(x / colW)));
        if (run.falling.col === col) slam(); else run.falling.col = col;
      },
      score: function () { return run.score; },
      best: function (s) { return K.keepBest('stack', 'best', s); },
      over: function () {
        return {
          eyebrow: 'Stacked out',
          title: run.right ? run.right + ' capital' + (run.right === 1 ? '' : 's') + ' placed' : 'No capitals placed',
          text: 'Best run of ' + run.bestStreak + ' in a row, at level ' + run.level + '.',
          stats: [[run.score, 'Points'], [run.right, 'Right'], [K.record('stack').best || 0, 'Best']]
        };
      },
      onBack: opts.onBack
    });

    return { destroy: E.destroy, get run() { return run; } };
  }

  global.GeoStack = { mount: mount };
})(window);
