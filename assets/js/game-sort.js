/* ------------------------------------------------------------------
   LearnGeo — Continent Sort
   A belt brings countries along and six bins wait underneath. Drop
   each one into its region before it runs off the end.

     GeoSort.mount(host, { length(), show(), cfg(), onBack() })
       length  round length in seconds
       show    'name' | 'flag' | 'capital', what the parcel shows

   The only game here that asks about region rather than capitals or
   flags, which is the thing a map quiz always wants and no other mode
   drills on its own.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons, K = global.GameKit;

  var BIN_COLOURS = {
    'Africa': '#FF9A3D', 'Asia': '#FFD23F', 'Europe': '#7CF3FF',
    'North America': '#8CF5C2', 'South America': '#C38BFF', 'Oceania': '#FF8A8E'
  };
  var SHORT = {
    'Africa': 'Africa', 'Asia': 'Asia', 'Europe': 'Europe',
    'North America': 'N. America', 'South America': 'S. America', 'Oceania': 'Oceania'
  };
  var RESULT_TIME = 1.8;

  function mount(host, opts) {
    var regions = global.GeoData.regions;
    var run = null, E = null, binY = 0, binW = 0, binH = 0;

    function fresh() {
      run = {
        left: opts.length(), score: 0, right: 0, wrong: 0, missed: 0,
        streak: 0, bestStreak: 0, parcel: null, time: 0, shake: 0, result: null,
        recent: [], shownSecs: -1, speed: 0.1
      };
      deal();
    }

    function pool() {
      var p = global.StudyFilters.pool(opts.cfg());
      return p.length ? p : global.Quiz.pool({ scope: 'all' });
    }

    function deal() {
      var r = run;
      var list = pool();
      var show = opts.show();
      if (show === 'flag') list = list.filter(function (c) { return !!c.flag; });
      if (!list.length) list = pool();
      var free = list.filter(function (c) { return r.recent.indexOf(c.name) === -1; });
      if (!free.length) free = list;
      var cfg = opts.cfg();
      var head = cfg.weakFirst ? free.slice(0, Math.max(6, Math.ceil(free.length / 3))) : free;
      var c = W.pick(head);
      r.recent.push(c.name);
      if (r.recent.length > 12) r.recent.shift();
      if (c.flag) K.flag(c.flag);
      r.parcel = { c: c, x: -0.12, born: r.time };
      r.speed = 0.072 + Math.min(0.07, r.right * 0.0022);
      paintBanner();
    }

    function paintBanner() {
      var r = run;
      if (!r.parcel) return;
      var show = opts.show();
      var what = show === 'capital' ? 'capital' : show === 'flag' ? 'flag' : 'country';
      K.banner(E.banner, {
        tag: Math.ceil(r.left) + 's left',
        tagIcon: I.clock,
        line: 'Drop each ' + what + ' into its <b>region</b>',
        result: r.result
      });
    }

    /* ----------------------------- sorting --------------------------- */
    function drop(region) {
      var r = run;
      if (!r.parcel) return;
      var c = r.parcel.c;
      var correct = c.region === region;
      var gains = K.award(correct, c.name);
      var i = regions.indexOf(region);
      var bx = (i + 0.5) * binW, by = binY + binH / 2;

      if (correct) {
        r.right += 1;
        r.streak += 1;
        r.bestStreak = Math.max(r.bestStreak, r.streak);
        var pts = 80 + Math.min(5, r.streak) * 20;
        r.score += pts;
        E.fx.burst(bx, by, BIN_COLOURS[region] || '#FFD23F', 16);
        E.fx.text(bx, by - 18, '+' + pts, '#FFE27A');
        r.result = { correct: true, t: RESULT_TIME,
          html: I.check + ' ' + W.escapeHtml(c.name + ' is in ' + c.region) +
            ' · +' + pts + (gains.xp ? ' · +' + gains.xp + ' XP' : '') };
      } else {
        r.wrong += 1;
        r.streak = 0;
        r.shake = 0.28;
        r.left = Math.max(0, r.left - 2);
        E.fx.burst(bx, by, '#FF8A8E', 12);
        r.result = { correct: false, t: RESULT_TIME,
          html: I.x + ' ' + W.escapeHtml(c.name + ' is in ' + c.region + ', not ' + region) };
      }
      r.parcel = null;
      if (r.left <= 0) return E.finish();
      deal();
    }

    function ranOff() {
      var r = run;
      r.missed += 1;
      r.streak = 0;
      r.result = { correct: false, t: RESULT_TIME,
        html: I.x + ' ' + W.escapeHtml('Missed: ' + r.parcel.c.name + ' · ' + r.parcel.c.region) };
      r.parcel = null;
      W.Sound.wrong();
      deal();
    }

    /* ------------------------------ frame ---------------------------- */
    function step(dt) {
      var r = run;
      r.time += dt;
      r.left -= dt;
      if (r.shake > 0) r.shake = Math.max(0, r.shake - dt);

      var secs = Math.ceil(r.left), had = !!r.result;
      if (r.result && (r.result.t -= dt) <= 0) r.result = null;
      if (secs !== r.shownSecs || had !== !!r.result) { r.shownSecs = secs; paintBanner(); }

      if (r.left <= 0) { r.left = 0; return E.finish(); }

      if (r.parcel) {
        r.parcel.x += r.speed * dt;
        if (r.parcel.x > 1.1) ranOff();
      }
    }

    /* ------------------------------ draw ----------------------------- */
    function layout(view) {
      binW = view.w / regions.length;
      binH = Math.max(52, view.h * 0.2);
      binY = view.h - binH - 14;
    }

    function draw(ctx, view, clock) {
      var r = run;
      ctx.fillStyle = '#0a1024';
      ctx.fillRect(0, 0, view.w, view.h);
      if (!r) return;
      ctx.save();
      if (r.shake > 0) ctx.translate((Math.random() - 0.5) * r.shake * 10, 0);

      /* the belt */
      var beltY = view.h * 0.3, beltH = Math.max(54, view.h * 0.18);
      ctx.fillStyle = '#161d42';
      ctx.fillRect(0, beltY, view.w, beltH);
      ctx.strokeStyle = 'rgba(255,255,255,.1)';
      ctx.lineWidth = 2;
      for (var x = -((clock * 60) % 26); x < view.w; x += 26) {
        ctx.beginPath();
        ctx.moveTo(x, beltY);
        ctx.lineTo(x - 10, beltY + beltH);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(124,243,255,.3)';
      ctx.beginPath();
      ctx.moveTo(0, beltY);
      ctx.lineTo(view.w, beltY);
      ctx.moveTo(0, beltY + beltH);
      ctx.lineTo(view.w, beltY + beltH);
      ctx.stroke();

      /* the parcel on it */
      if (r.parcel) {
        var show = opts.show();
        var px = r.parcel.x * view.w, py = beltY + beltH / 2;
        var pw = Math.min(190, view.w * 0.3), ph = beltH - 16;
        ctx.fillStyle = '#1B4DFF';
        K.roundRect(ctx, px - pw / 2, py - ph / 2, pw, ph, 10);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.4)';
        ctx.lineWidth = 2;
        K.roundRect(ctx, px - pw / 2, py - ph / 2, pw, ph, 10);
        ctx.stroke();
        if (show === 'flag') {
          var fw = pw - 24, fh = Math.min(ph - 14, fw * 0.62);
          K.drawFlag(ctx, r.parcel.c.flag, px - fw / 2, py - fh / 2, fw, fh, 3);
        } else {
          var text = show === 'capital' ? r.parcel.c.capital : r.parcel.c.name;
          ctx.fillStyle = '#fff';
          var label = K.fitText(ctx, text, pw - 16, 16, 700);
          ctx.textAlign = 'center';
          ctx.fillText(label, px, py + 6);
          ctx.textAlign = 'left';
        }
        /* how far it has left before it runs off */
        ctx.fillStyle = 'rgba(255,255,255,.2)';
        ctx.fillRect(0, beltY - 6, view.w, 3);
        ctx.fillStyle = r.parcel.x > 0.78 ? '#FF8A8E' : '#FFD23F';
        ctx.fillRect(0, beltY - 6, view.w * Math.min(1, r.parcel.x / 1.1), 3);
      }

      /* the bins */
      regions.forEach(function (rg, i) {
        var bx = i * binW;
        ctx.fillStyle = 'rgba(255,255,255,.05)';
        K.roundRect(ctx, bx + 4, binY, binW - 8, binH, 10);
        ctx.fill();
        ctx.strokeStyle = BIN_COLOURS[rg] || '#fff';
        ctx.lineWidth = 2;
        K.roundRect(ctx, bx + 4, binY, binW - 8, binH, 10);
        ctx.stroke();

        ctx.fillStyle = BIN_COLOURS[rg] || '#fff';
        var label = K.fitText(ctx, SHORT[rg] || rg, binW - 16, 13, 700);
        ctx.textAlign = 'center';
        ctx.fillText(label, bx + binW / 2, binY + binH / 2 + 4);
        ctx.font = '600 11px ' + K.MONO;
        ctx.fillStyle = 'rgba(255,255,255,.45)';
        ctx.fillText(String(i + 1), bx + binW / 2, binY + binH - 10);
        ctx.textAlign = 'left';
      });

      E.fx.draw(ctx, 1, 0, 0);

      var frac = Math.max(0, r.left / opts.length());
      ctx.fillStyle = 'rgba(255,255,255,.15)';
      ctx.fillRect(16, 8, view.w - 32, 4);
      ctx.fillStyle = frac < 0.2 ? '#FF8A8E' : '#FFD23F';
      ctx.fillRect(16, 8, (view.w - 32) * frac, 4);
      ctx.restore();
    }

    E = K.engine(host, {
      cls: 'gk-sort',
      aspect: 1.5,
      stats: [['score', 'points'], ['right', 'right'], ['left', 'seconds']],
      intro: {
        eyebrow: 'Continent Sort', icon: I.layers,
        title: 'Press anything, or tap, to start the belt',
        lines: ['A country comes along the belt. Send it to its region by clicking a bin or pressing 1 to 6.',
                'A wrong bin costs two seconds. Let one run off the end and you just lose it.']
      },
      start: function (view) { layout(view); fresh(); },
      step: step,
      draw: draw,
      resize: layout,
      key: function (e) {
        var n = '123456'.indexOf(e.key);
        if (n === -1 || n >= regions.length) return false;
        drop(regions[n]);
        return true;
      },
      pointer: function (kind, x, y) {
        if (kind !== 'down' || y < binY - 20) return;
        var i = Math.floor(x / binW);
        if (i < 0 || i >= regions.length) return;
        drop(regions[i]);
      },
      score: function () { return run.score; },
      best: function (s) { return K.keepBest('sort', 'best', s); },
      over: function () {
        return {
          eyebrow: 'Time',
          title: run.right ? run.right + ' sorted' : 'Nothing sorted',
          text: run.wrong + ' in the wrong bin, ' + run.missed + ' off the end.',
          stats: [[run.score, 'Points'], [run.right, 'Right'], [K.record('sort').best || 0, 'Best']]
        };
      },
      onBack: opts.onBack
    });

    var tick = setInterval(function () {
      if (run) E.shell.set('left', Math.max(0, Math.ceil(run.left)));
    }, 200);

    return {
      destroy: function () { clearInterval(tick); E.destroy(); },
      get run() { return run; }
    };
  }

  global.GeoSort = { mount: mount };
})(window);
