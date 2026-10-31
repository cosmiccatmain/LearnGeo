/* ------------------------------------------------------------------
   LearnGeo — Flag Echo
   Simon, played with flags. The board lights a sequence of flags and
   you play it back. Each round adds one, and the flag that joins is
   named as it lights, so the name goes in with the picture.

     GeoEcho.mount(host, { pads(), cfg(), onBack() })
       pads  how many flags are on the board, read when a run starts

   Playing a sequence back right counts as a right answer for every
   country in it, which is what makes a long chain worth chasing.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons, K = global.GameKit;

  var LIT = 0.52, GAP = 0.18;   /* seconds a flag is lit, and between */
  var START_WAIT = 0.7;

  function mount(host, opts) {
    var run = null, E = null, cols = 3, rows = 2, pw = 0, ph = 0, ox = 0, oy = 0;

    function fresh() {
      var n = opts.pads();
      var pool = global.StudyFilters.pool(opts.cfg()).filter(function (c) { return !!c.flag; });
      if (pool.length < n) {
        pool = pool.concat(global.Quiz.pool({ scope: 'all' }).filter(function (c) { return !!c.flag; }));
      }
      var cfg = opts.cfg();
      var head = cfg.weakFirst ? pool.slice(0, Math.max(n, Math.ceil(pool.length / 2))) : pool;
      var pads = W.shuffle(head.slice()).slice(0, n);
      K.preload(pads);

      run = {
        pads: pads.map(function (c) { return { c: c, lit: 0, wrong: 0 }; }),
        seq: [], at: 0, round: 0, score: 0, best: 0,
        phase: 'show', wait: START_WAIT, showAt: -1, showT: 0,
        naming: null, time: 0, shake: 0, result: null
      };
      grow();
    }

    function grow() {
      var r = run;
      r.round += 1;
      /* never the same flag twice running, so the echo is readable */
      var last = r.seq.length ? r.seq[r.seq.length - 1] : -1;
      var choices = [];
      for (var i = 0; i < r.pads.length; i++) if (i !== last) choices.push(i);
      var add = W.pick(choices);
      r.seq.push(add);
      r.naming = r.pads[add].c;
      r.at = 0;
      r.phase = 'show';
      r.showAt = -1;
      r.showT = 0;
      r.wait = START_WAIT;
      paintBanner();
    }

    function paintBanner() {
      var r = run;
      var line = r.phase === 'show'
        ? 'Watch: <b>' + r.seq.length + '</b> in the sequence'
        : 'Play it back · <b>' + (r.at) + ' / ' + r.seq.length + '</b>';
      K.banner(E.banner, {
        tag: 'Round ' + r.round,
        tagIcon: I.sparkle,
        line: line,
        sub: r.phase === 'show' && r.naming
          ? 'New this round: ' + W.escapeHtml(r.naming.name)
          : null,
        result: r.result
      });
    }

    /* ---------------------------- answering -------------------------- */
    function press(i) {
      var r = run;
      if (r.phase !== 'play') return;
      var pad = r.pads[i];
      pad.lit = 0.3;
      W.Sound.flip();

      if (r.seq[r.at] === i) {
        r.at += 1;
        if (r.at >= r.seq.length) return done();
        paintBanner();
        return;
      }

      /* wrong: score every country in the sequence as a miss once */
      pad.wrong = 0.5;
      r.shake = 0.4;
      K.award(false, r.pads[r.seq[r.at]].c.name);
      r.result = { correct: false, t: 3,
        html: I.x + ' ' + W.escapeHtml('That was ' + pad.c.name + '. Next was ' +
          r.pads[r.seq[r.at]].c.name) };
      paintBanner();
      E.finish();
    }

    function done() {
      var r = run;
      /* a sequence played back right is a right answer for each of its
         countries, counted once per distinct country */
      var seen = {};
      r.seq.forEach(function (i) {
        var name = r.pads[i].c.name;
        if (seen[name]) return;
        seen[name] = 1;
        K.award(true, name);
      });
      var pts = 100 * r.seq.length + Math.min(5, r.seq.length) * 25;
      r.score += pts;
      r.best = Math.max(r.best, r.seq.length);
      E.fx.text(E.view.w / 2, E.view.h * 0.5, '+' + pts, '#FFE27A');
      r.result = { correct: true, t: 2.2,
        html: I.check + ' ' + W.escapeHtml(r.seq.length + ' long') + ' · +' + pts };
      W.Sound.correct(r.seq.length);
      grow();
    }

    /* ------------------------------ frame ---------------------------- */
    function step(dt) {
      var r = run;
      r.time += dt;
      if (r.shake > 0) r.shake = Math.max(0, r.shake - dt);
      if (r.result && (r.result.t -= dt) <= 0) { r.result = null; paintBanner(); }
      r.pads.forEach(function (p) {
        if (p.lit > 0) p.lit = Math.max(0, p.lit - dt);
        if (p.wrong > 0) p.wrong = Math.max(0, p.wrong - dt);
      });

      if (r.phase !== 'show') return;
      if (r.wait > 0) { r.wait -= dt; return; }

      r.showT += dt;
      var slot = LIT + GAP;
      var idx = Math.floor(r.showT / slot);
      if (idx >= r.seq.length) {
        r.phase = 'play';
        r.at = 0;
        paintBanner();
        return;
      }
      if (idx !== r.showAt) {
        r.showAt = idx;
        var pad = r.pads[r.seq[idx]];
        pad.lit = LIT;
        W.Sound.gem();
      }
    }

    /* ------------------------------ draw ----------------------------- */
    function layout(view) {
      var n = run ? run.pads.length : 6;
      cols = n <= 4 ? 2 : n <= 6 ? 3 : 4;
      rows = Math.ceil(n / cols);
      var top = 76;
      pw = Math.floor((view.w - 24 - (cols - 1) * 10) / cols);
      ph = Math.floor((view.h - top - 18 - (rows - 1) * 10) / rows);
      ox = Math.round((view.w - (pw * cols + (cols - 1) * 10)) / 2);
      oy = top;
    }

    function draw(ctx, view) {
      var r = run;
      ctx.fillStyle = '#080c22';
      ctx.fillRect(0, 0, view.w, view.h);
      if (!r) return;
      ctx.save();
      if (r.shake > 0) ctx.translate((Math.random() - 0.5) * r.shake * 12, 0);

      r.pads.forEach(function (p, i) {
        var x = ox + (i % cols) * (pw + 10), y = oy + Math.floor(i / cols) * (ph + 10);
        var on = p.lit > 0, bad = p.wrong > 0;

        ctx.save();
        if (on) {
          ctx.shadowColor = '#FFD23F';
          ctx.shadowBlur = 26;
        }
        ctx.fillStyle = bad ? 'rgba(122,36,48,.9)' : on ? 'rgba(255,210,63,.22)' : 'rgba(22,32,90,.85)';
        K.roundRect(ctx, x, y, pw, ph, 12);
        ctx.fill();
        ctx.restore();

        ctx.strokeStyle = bad ? '#FF8A8E' : on ? '#FFD23F' : 'rgba(124,243,255,.28)';
        ctx.lineWidth = on || bad ? 3 : 1.5;
        K.roundRect(ctx, x, y, pw, ph, 12);
        ctx.stroke();

        var fw = pw - 24, fh = Math.min(ph - 38, fw * 0.62);
        ctx.globalAlpha = on ? 1 : 0.82;
        K.drawFlag(ctx, p.c.flag, x + (pw - fw) / 2, y + 12, fw, fh, 4);
        ctx.globalAlpha = 1;

        ctx.fillStyle = on ? '#FFD23F' : 'rgba(255,255,255,.6)';
        var label = K.fitText(ctx, p.c.name, pw - 16, 12, 600);
        ctx.textAlign = 'center';
        ctx.fillText(label, x + pw / 2, y + ph - 11);
        ctx.textAlign = 'left';
      });

      /* how far through the playback you are */
      if (r.phase === 'play') {
        var bw = Math.min(view.w - 40, 320);
        var bx = (view.w - bw) / 2;
        ctx.fillStyle = 'rgba(255,255,255,.15)';
        ctx.fillRect(bx, 60, bw, 4);
        ctx.fillStyle = '#8CF5C2';
        ctx.fillRect(bx, 60, bw * (r.at / Math.max(1, r.seq.length)), 4);
      }

      E.fx.draw(ctx, 1, 0, 0);
      ctx.restore();
    }

    E = K.engine(host, {
      cls: 'gk-echo',
      aspect: 1.45,
      stats: [['score', 'points'], ['round', 'round'], ['best', 'longest']],
      intro: {
        eyebrow: 'Flag Echo', icon: I.sparkle,
        title: 'Press anything, or tap, to begin',
        lines: ['The board lights a sequence of flags. Play it back by clicking them in order, or with the number keys.',
                'Each round adds one flag, and the new one is named as it lights. One wrong press ends the run.']
      },
      start: function (view) { fresh(); layout(view); },
      step: step,
      draw: draw,
      resize: function (view) { if (run) layout(view); },
      key: function (e) {
        var n = '123456789'.indexOf(e.key);
        if (n === -1 || n >= run.pads.length) return false;
        press(n);
        return true;
      },
      pointer: function (kind, x, y) {
        if (kind !== 'down') return;
        var col = Math.floor((x - ox) / (pw + 10)), row = Math.floor((y - oy) / (ph + 10));
        if (col < 0 || col >= cols || row < 0) return;
        var i = row * cols + col;
        if (i < run.pads.length) press(i);
      },
      score: function () { return run.score; },
      best: function (s) {
        /* keepBest counts the run, so the longest chain is kept beside
           it rather than through a second call */
        var rec = K.record('echo');
        rec.longest = Math.max(rec.longest || 0, run.best);
        return K.keepBest('echo', 'best', s);
      },
      over: function () {
        return {
          eyebrow: 'Broke the chain',
          title: run.best ? 'Longest echo: ' + run.best : 'No sequence played back',
          text: 'You reached round ' + run.round + '.',
          stats: [[run.score, 'Points'], [run.best, 'Longest'], [K.record('echo').longest || 0, 'Best']]
        };
      },
      onBack: opts.onBack
    });

    return { destroy: E.destroy, get run() { return run; } };
  }

  global.GeoEcho = { mount: mount };
})(window);
