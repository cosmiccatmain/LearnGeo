/* ------------------------------------------------------------------
   LearnGeo — Flag Match
   Pairs, played with flags and names. Turn over two tiles: a flag and
   the country it belongs to stay turned up, anything else turns back.

     GeoMatch.mount(host, { size(), cfg(), onBack() })
       size  6 | 8 | 10 pairs, read when a board is dealt

   The pair is always a flag and a name rather than two flags, because
   turning over two identical pictures teaches nothing. Every pair you
   find counts as a right answer for that country.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons, K = global.GameKit;

  var FLIP_BACK = 0.85;         /* how long a wrong pair stays up */

  function mount(host, opts) {
    var run = null, E = null, cols = 4, rows = 3, tw = 0, th = 0, ox = 0, oy = 0;

    function fresh() {
      var pairs = opts.size();
      var pool = global.StudyFilters.pool(opts.cfg()).filter(function (c) { return !!c.flag; });
      if (pool.length < pairs) {
        pool = pool.concat(global.Quiz.pool({ scope: 'all' }).filter(function (c) { return !!c.flag; }));
      }
      /* weakest first, when the filters say so, then shuffled for the deal */
      var cfg = opts.cfg();
      var picked = cfg.weakFirst
        ? pool.slice(0, Math.max(pairs, Math.ceil(pool.length / 2)))
        : pool;
      picked = W.shuffle(picked.slice()).slice(0, pairs);
      K.preload(picked);

      var tiles = [];
      picked.forEach(function (c) {
        tiles.push({ c: c, kind: 'flag', up: false, done: false, t: 0 });
        tiles.push({ c: c, kind: 'name', up: false, done: false, t: 0 });
      });
      tiles = W.shuffle(tiles);

      run = {
        tiles: tiles, pairs: pairs, found: 0, moves: 0, score: 0,
        streak: 0, bestStreak: 0, first: null, lock: 0, time: 0, shake: 0
      };
      grid(E ? E.view : { w: 800, h: 500 });
      paintBanner();
    }

    /* The board is laid out as near to square as the tile count allows. */
    function grid(view) {
      var n = run.tiles.length;
      cols = Math.ceil(Math.sqrt(n * (view.w / Math.max(1, view.h - 60))));
      cols = Math.max(4, Math.min(n, cols));
      rows = Math.ceil(n / cols);
      var padTop = 54;
      tw = Math.floor((view.w - 20 - (cols - 1) * 8) / cols);
      th = Math.floor((view.h - padTop - 16 - (rows - 1) * 8) / rows);
      ox = Math.round((view.w - (tw * cols + (cols - 1) * 8)) / 2);
      oy = padTop;
    }

    function paintBanner() {
      K.banner(E.banner, {
        tag: run.found + ' / ' + run.pairs,
        tagIcon: I.layers,
        line: run.result ? 'Match each flag to its country' : 'Match each <b>flag</b> to its <b>country</b>',
        result: run.result
      });
    }

    function at(i) {
      return { x: ox + (i % cols) * (tw + 8), y: oy + Math.floor(i / cols) * (th + 8) };
    }

    /* ----------------------------- turning --------------------------- */
    function turn(i) {
      var r = run, t = r.tiles[i];
      if (!t || t.done || t.up || r.lock > 0) return;
      t.up = true;
      t.t = 0;
      W.Sound.flip();

      if (!r.first) { r.first = t; return; }
      var a = r.first, b = t;
      r.first = null;
      r.moves += 1;

      var pair = a.c.name === b.c.name && a.kind !== b.kind;
      var gains = K.award(pair, a.c.name);
      var p = at(r.tiles.indexOf(b));

      if (pair) {
        a.done = b.done = true;
        r.found += 1;
        r.streak += 1;
        r.bestStreak = Math.max(r.bestStreak, r.streak);
        var pts = 120 + Math.min(5, r.streak) * 30;
        r.score += pts;
        E.fx.burst(p.x + tw / 2, p.y + th / 2, '#FFD23F', 18);
        E.fx.text(p.x + tw / 2, p.y + th / 2 - 10, '+' + pts, '#FFE27A');
        r.result = { correct: true, t: 2,
          html: I.check + ' ' + W.escapeHtml(a.c.name + ' · ' + a.c.capital) +
            ' · +' + pts + (gains.xp ? ' · +' + gains.xp + ' XP' : '') };
        paintBanner();
        if (r.found >= r.pairs) {
          r.score += Math.max(0, 600 - r.moves * 20);
          return E.finish();
        }
      } else {
        r.streak = 0;
        r.lock = FLIP_BACK;
        r.shake = 0.2;
        r.result = { correct: false, t: 2,
          html: I.x + ' ' + W.escapeHtml(a.c.name + ' and ' + b.c.name + ' do not go together') };
        paintBanner();
      }
    }

    /* ------------------------------ frame ---------------------------- */
    function step(dt) {
      var r = run;
      r.time += dt;
      if (r.shake > 0) r.shake = Math.max(0, r.shake - dt);
      r.tiles.forEach(function (t) { if (t.up || t.done) t.t += dt; });
      if (r.result && (r.result.t -= dt) <= 0) { r.result = null; paintBanner(); }
      if (r.lock > 0) {
        r.lock -= dt;
        if (r.lock <= 0) {
          r.tiles.forEach(function (t) { if (!t.done) { t.up = false; t.t = 0; } });
        }
      }
    }

    /* ------------------------------ draw ----------------------------- */
    function draw(ctx, view) {
      var r = run;
      ctx.fillStyle = '#0c1130';
      ctx.fillRect(0, 0, view.w, view.h);
      if (!r) return;
      ctx.save();
      if (r.shake > 0) ctx.translate((Math.random() - 0.5) * r.shake * 10, 0);

      r.tiles.forEach(function (t, i) {
        var p = at(i);
        /* the turn itself: the tile squashes through nothing and back */
        var spin = Math.min(1, t.t / 0.22);
        var k = (t.up || t.done) ? spin : 1 - Math.min(1, t.t / 0.22);
        var sx = Math.abs(Math.cos(Math.min(1, k) * Math.PI / 2));
        var faceUp = k > 0.5 || t.done;
        var w = Math.max(2, tw * (faceUp ? 1 - sx * 0.0 : 1) * (t.up || t.done ? (0.4 + 0.6 * k) : 1));

        ctx.save();
        ctx.translate(p.x + tw / 2, p.y + th / 2);
        ctx.scale(Math.max(0.05, w / tw), 1);
        ctx.translate(-tw / 2, -th / 2);

        if (t.done) ctx.fillStyle = 'rgba(14,159,110,.22)';
        else if (t.up) ctx.fillStyle = '#16205a';
        else ctx.fillStyle = '#1B2A5E';
        K.roundRect(ctx, 0, 0, tw, th, 9);
        ctx.fill();
        ctx.strokeStyle = t.done ? 'rgba(140,245,194,.7)' : 'rgba(124,243,255,.3)';
        ctx.lineWidth = t.done ? 2 : 1.4;
        K.roundRect(ctx, 0, 0, tw, th, 9);
        ctx.stroke();

        if (!t.up && !t.done) {
          /* the back of the card */
          ctx.fillStyle = 'rgba(124,243,255,.22)';
          ctx.font = '700 ' + Math.round(th * 0.4) + 'px ' + K.FONT;
          ctx.textAlign = 'center';
          ctx.fillText('?', tw / 2, th / 2 + th * 0.14);
          ctx.textAlign = 'left';
        } else if (t.kind === 'flag') {
          var fw = tw - 16, fh = Math.min(th - 16, fw * 0.62);
          K.drawFlag(ctx, t.c.flag, (tw - fw) / 2, (th - fh) / 2, fw, fh, 3);
        } else {
          ctx.fillStyle = t.done ? '#8CF5C2' : '#EAF2FF';
          var label = K.fitText(ctx, t.c.name, tw - 12, Math.min(15, th * 0.24), 700);
          ctx.textAlign = 'center';
          ctx.fillText(label, tw / 2, th / 2 + 5);
          ctx.textAlign = 'left';
        }
        ctx.restore();
      });

      E.fx.draw(ctx, 1, 0, 0);
      ctx.restore();
    }

    E = K.engine(host, {
      cls: 'gk-match',
      aspect: 1.5,
      stats: [['score', 'points'], ['found', 'pairs'], ['moves', 'turns']],
      intro: {
        eyebrow: 'Flag Match', icon: I.layers,
        title: 'Press anything, or tap, to deal',
        lines: ['Turn over two tiles. A flag and the country it belongs to stay up; anything else turns back.',
                'Fewer turns scores more, so it pays to remember where things were.']
      },
      start: function (view) { fresh(); grid(view); },
      step: step,
      draw: draw,
      resize: function (view) { if (run) grid(view); },
      pointer: function (kind, x, y) {
        if (kind !== 'down') return;
        var col = Math.floor((x - ox) / (tw + 8)), row = Math.floor((y - oy) / (th + 8));
        if (col < 0 || col >= cols || row < 0) return;
        turn(row * cols + col);
      },
      score: function () { return run.score; },
      best: function (s) { return K.keepBest('match', 'best', s); },
      over: function () {
        var done = run.found >= run.pairs;
        return {
          eyebrow: done ? 'Board cleared' : 'Gave up',
          title: done ? 'All ' + run.pairs + ' pairs in ' + run.moves + ' turns' : run.found + ' pairs found',
          text: done ? 'A perfect board is ' + run.pairs + ' turns.' : '',
          stats: [[run.score, 'Points'], [run.moves, 'Turns'], [K.record('match').best || 0, 'Best']]
        };
      },
      onBack: opts.onBack
    });

    return { destroy: E.destroy, get run() { return run; } };
  }

  global.GeoMatch = { mount: mount };
})(window);
