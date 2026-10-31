/* ------------------------------------------------------------------
   LearnGeo — GameKit
   The parts every arcade game needs, in one place: the canvas shell and
   its HUD, the question picker, the frame loop, the ready / paused /
   game-over cards, the banner that carries the question, and the little
   particle layer.

   Before this existed each game carried its own copy of all of it, which
   is why Geo Dash, Globe Defender, Capital Snake and Geo Golf are each
   700 to 1,200 lines. The ten games added alongside them are 150 to 350
   because they only describe how they play.

   A game is still just:

     mount(host, opts) -> { destroy }

   and it still owns its own drawing. The kit never draws the game.

     GameKit.shell(host, spec)      the markup, HUD and handles
     GameKit.asker(opts)            questions from the study filters
     GameKit.loop(step)             requestAnimationFrame with a delta
     GameKit.fx()                   bursts and floating score text
     GameKit.award(correct, name)   score the answer the way the app does
     GameKit.flag(src)              a flag SVG drawn onto a canvas, cached
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons, TAU = Math.PI * 2;
  var esc = W.escapeHtml;

  /* ============================== flags =============================
     The flag files are SVGs with only a viewBox, so a canvas cannot draw
     one directly at a size. Each is drawn once onto its own canvas at
     3:2 and that canvas is what the games blit. Until it loads, null:
     every caller is drawing a frame and must not block on it. */
  var flags = {};
  function flag(src) {
    if (!src) return null;
    var f = flags[src];
    if (f) return f.ready ? f.canvas : null;
    f = flags[src] = { ready: false, canvas: document.createElement('canvas') };
    f.canvas.width = 120;
    f.canvas.height = 80;
    var img = new Image();
    img.onload = function () {
      f.canvas.getContext('2d').drawImage(img, 0, 0, 120, 80);
      f.ready = true;
    };
    img.src = src;
    return null;
  }

  /* Warm the cache for a set of choices, so a flag is ready by the time
     the thing wearing it is on screen. */
  function preload(list) {
    (list || []).forEach(function (c) { if (c && c.flag) flag(c.flag); });
  }

  /* ============================== shell =============================
     Every game gets the same frame: a canvas, a HUD row across the top,
     a banner under it for the question, and a full-size layer for the
     ready, paused and game-over cards.

       stats   [[key, label], ...] in HUD order, read back with set()
       aspect  width / height; the canvas follows the host's width
       cls     an extra class on the root, for the game's own colours
       round   true if the canvas should be snapped to whole pixels

     set(key, value) only touches the DOM when the value really changed,
     because it is called every frame. */
  function shell(host, spec) {
    spec = spec || {};
    var stats = spec.stats || [];
    host.innerHTML =
      '<div class="gd ' + (spec.cls || '') + '" tabindex="-1">' +
        '<canvas class="gd__canvas"></canvas>' +
        '<div class="gd__hud">' +
          stats.map(function (s) {
            return '<div class="gd__stat"><b class="mono" data-k="' + s[0] + '">0</b>' +
              '<span data-l="' + s[0] + '">' + esc(s[1]) + '</span></div>';
          }).join('') +
          '<div class="gk__extra" data-extra></div>' +
          '<button class="gd__btn" data-pause aria-label="Pause">' + I.pause + '</button>' +
        '</div>' +
        '<div class="game-banner hidden" data-banner></div>' +
        '<div class="gd__layer hidden" data-layer></div>' +
      '</div>';

    var root = host.querySelector('.gd');
    var canvas = root.querySelector('canvas');
    var ctx = canvas.getContext('2d');
    var api = {
      root: root,
      canvas: canvas,
      ctx: ctx,
      layer: root.querySelector('[data-layer]'),
      banner: root.querySelector('[data-banner]'),
      extra: root.querySelector('[data-extra]'),
      pauseBtn: root.querySelector('[data-pause]'),
      view: { w: 0, h: 0, dpr: 1 }
    };

    var was = {};
    api.set = function (key, value) {
      if (was[key] === value) return;
      was[key] = value;
      var el = root.querySelector('[data-k="' + key + '"]');
      if (el) el.textContent = value;
    };
    api.label = function (key, value) {
      var k = 'l:' + key;
      if (was[k] === value) return;
      was[k] = value;
      var el = root.querySelector('[data-l="' + key + '"]');
      if (el) el.textContent = value;
    };
    api.html = function (s) {
      if (was.extra === s) return;
      was.extra = s;
      api.extra.innerHTML = s;
    };

    /* The canvas is sized in CSS pixels by its host and in device pixels
       by the backing store, so a retina screen gets a sharp line. */
    api.fit = function (aspect) {
      var w = root.clientWidth || 800;
      var h = Math.round(w / (aspect || 1.6));
      var max = spec.maxHeight || 560;
      if (h > max) h = max;
      var dpr = Math.min(2, global.devicePixelRatio || 1);
      canvas.style.height = h + 'px';
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      api.view = { w: w, h: h, dpr: dpr };
      return api.view;
    };

    /* One resize path, whichever the browser gives us. */
    api.onResize = function (fn) {
      if (global.ResizeObserver) {
        var ro = new global.ResizeObserver(fn);
        ro.observe(root);
        return function () { ro.disconnect(); };
      }
      global.addEventListener('resize', fn);
      return function () { global.removeEventListener('resize', fn); };
    };

    return api;
  }

  /* ============================== cards =============================
     The three screens a game shows over itself. They share .gd-card so
     they match the four games that came before the kit. */
  function card(layer, html) {
    layer.innerHTML = html;
    layer.classList.remove('hidden');
  }

  function hide(layer) {
    layer.classList.add('hidden');
    layer.innerHTML = '';
  }

  function ready(layer, o) {
    card(layer,
      '<div class="gd-card gd-card--ready">' +
        '<div class="gd-card__eyebrow">' + (o.icon || I.gamepad) + ' ' + esc(o.eyebrow || '') + '</div>' +
        '<h3>' + esc(o.title) + '</h3>' +
        (o.lines || []).map(function (l) { return '<p>' + esc(l) + '</p>'; }).join('') +
      '</div>');
  }

  function paused(layer, o) {
    card(layer,
      '<div class="gd-card gd-card--ready">' +
        '<div class="gd-card__eyebrow">Paused</div>' +
        '<h3>' + esc(o.title || 'Press Space or tap to carry on') + '</h3>' +
        '<div class="gd-card__row">' +
          '<button class="btn btn--accent" data-resume>' + I.play + ' Resume</button>' +
          '<button class="btn btn--ghost" data-quit>Quit game</button>' +
        '</div>' +
      '</div>');
    W.$('[data-resume]', layer).addEventListener('click', function (e) { e.stopPropagation(); o.onResume(); });
    W.$('[data-quit]', layer).addEventListener('click', function (e) { e.stopPropagation(); o.onQuit(); });
  }

  function over(layer, o) {
    card(layer,
      '<div class="gd-card gd-card--over">' +
        '<div class="gd-card__eyebrow">' + (o.best ? I.trophy + ' New best · ' : '') + esc(o.eyebrow || '') + '</div>' +
        '<h3>' + esc(o.title) + '</h3>' +
        (o.text ? '<p>' + esc(o.text) + '</p>' : '') +
        '<div class="gd-stats">' +
          (o.stats || []).map(function (s) {
            return '<div><b class="mono">' + esc(String(s[0])) + '</b><span>' + esc(s[1]) + '</span></div>';
          }).join('') +
        '</div>' +
        '<div class="gd-card__row">' +
          '<button class="btn btn--accent" data-again>' + I.refresh + ' Play again</button>' +
          '<button class="btn btn--ghost" data-back>Back</button>' +
        '</div>' +
        '<div class="gd-card__hint">Space or Enter to play again</div>' +
      '</div>');
    W.$('[data-again]', layer).addEventListener('click', function (e) { e.stopPropagation(); o.onAgain(); });
    W.$('[data-back]', layer).addEventListener('click', function (e) { e.stopPropagation(); o.onBack(); });
  }

  /* ============================= banner =============================
     The question, over the top of the play area. `result` is the line
     that replaces it for a moment after an answer. */
  function banner(el, o) {
    if (!o) { el.classList.add('hidden'); return; }
    var html = '<div class="game-banner__line">' +
      (o.tag ? '<span class="game-banner__tag">' + (o.tagIcon || I.pin) + ' ' + esc(o.tag) + '</span>' : '') +
      o.line + '</div>';
    if (o.sub) html += '<div class="game-banner__sub">' + o.sub + '</div>';
    if (o.result) {
      html += '<div class="game-banner__sub ' + (o.result.correct ? 'is-right' : 'is-wrong') + '">' +
        o.result.html + '</div>';
    }
    el.innerHTML = html;
    el.classList.remove('hidden');
  }

  /* Said the same way in every game: what the right answer was. */
  function verdict(correct, q, chosen, extra) {
    var c = q.country;
    if (correct) {
      return { correct: true, html: I.check + ' ' + esc(right(q)) + (extra ? ' · ' + extra : '') };
    }
    var said = chosen && chosen.country && chosen.country.name !== c.name
      ? ' That one was ' + chosen.country.name + '.'
      : '';
    return { correct: false, html: I.x + ' ' + esc(right(q) + '.' + said) };
  }

  function right(q) {
    var c = q.country;
    if (q.type === 'flagpick' || q.type === 'flag') return 'That flag is ' + c.name + '’s';
    if (q.type === 'country') return c.capital + ' is the capital of ' + c.name;
    if (q.type === 'identify' || q.type === 'locate') return 'That is ' + c.name;
    return c.capital + ' is the capital of ' + c.name;
  }

  /* ============================== asker =============================
     Questions out of the study filters, the same way for every game.

       cfg()    the StudyFilters config, read fresh each question
       types()  the question types this game can draw, in preference
                order; the first one the country fits is used

     Three rules, all learned from the four older games:
       - a country that cannot take the question shape is skipped, not
         asked (Quiz.fits covers no outline, no flag, and the capitals
         that give their own country away)
       - the last few countries asked are held back, so a filter down to
         six countries does not ask the same two over and over
       - weakest-first takes from the shaky end of the list, but the
         distractors may come from the whole world, because a hand-picked
         list of three cannot supply three wrong answers */
  function asker(opts) {
    var recent = [];

    function next() {
      var cfg = opts.cfg();
      var types = opts.types();
      if (!types.length) types = ['capital'];
      var chosen = global.StudyFilters.pool(cfg);
      var world = global.Quiz.pool({ scope: 'all' });

      /* the first type any of the chosen countries can actually take */
      var type = null, list = [];
      for (var i = 0; i < types.length && !list.length; i++) {
        var fit = chosen.filter(function (c) { return global.Quiz.fits(types[i], c); });
        if (fit.length) { type = types[i]; list = fit; }
      }
      if (!list.length) {
        type = types[0];
        list = world.filter(function (c) { return global.Quiz.fits(type, c); });
      }
      if (!list.length) { type = 'capital'; list = world; }

      var fresh = list.filter(function (c) { return recent.indexOf(c.name) === -1; });
      if (fresh.length) list = fresh;

      var head = cfg.weakFirst ? list.slice(0, Math.max(8, Math.ceil(list.length / 3))) : list;
      var target = W.pick(head);
      recent.push(target.name);
      if (recent.length > 8) recent.shift();

      var field = list.length >= 5 ? list : world.filter(function (c) { return global.Quiz.fits(type, c); });
      if (field.length < 5) field = world;
      var q = global.Quiz.make(type, target, field, { typed: false });
      preload(q.choices || []);
      if (q.country.flag) flag(q.country.flag);
      return q;
    }

    return { next: next };
  }

  /* ============================== award =============================
     One call so a game never has to remember the five things that follow
     an answer: the score, the save, the HUD, the achievements and the
     sound. `arcade: true` is what the arcade achievement counts. */
  function award(correct, country) {
    var gains = W.award(correct, { country: country, arcade: true });
    W.save();
    if (global.UI) global.UI.refreshHud(true);
    if (gains.level) W.toast('Level ' + gains.level, 'Nice one, keep it going', I.bolt, 3200);
    W.announceAchievements(W.checkAchievements());
    if (correct) W.Sound.correct(gains.combo); else W.Sound.wrong();
    return gains;
  }

  /* =============================== loop =============================
     A frame loop with a clamped delta, so a tab coming back from the
     background does not advance a game by four seconds in one step. */
  function loop(step) {
    var raf = 0, last = 0, clock = 0, stopped = false;
    function frame(t) {
      if (stopped) return;
      raf = requestAnimationFrame(frame);
      var dt = last ? Math.min(0.05, (t - last) / 1000) : 0;
      last = t;
      clock += dt;
      step(dt, clock);
    }
    raf = requestAnimationFrame(frame);
    return {
      stop: function () { stopped = true; cancelAnimationFrame(raf); },
      get clock() { return clock; }
    };
  }

  /* ================================ fx ==============================
     Bursts and floating text, in whatever units the game draws in. The
     game says how big a unit is when it draws them. */
  function fx() {
    var bits = [], texts = [];
    return {
      burst: function (x, y, colour, n) {
        for (var i = 0; i < (n || 12); i++) {
          var a = Math.random() * TAU, s = 0.6 + Math.random() * 2.2;
          bits.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 0.6,
                      life: 0.5 + Math.random() * 0.4, t: 0, c: colour });
        }
      },
      text: function (x, y, str, colour) {
        texts.push({ x: x, y: y, s: str, c: colour || '#fff', life: 1.1, t: 0 });
      },
      step: function (dt) {
        bits = bits.filter(function (b) {
          b.t += dt;
          b.x += b.vx * dt * 3.4;
          b.y += b.vy * dt * 3.4;
          b.vy += dt * 7;
          return b.t < b.life;
        });
        texts = texts.filter(function (t) {
          t.t += dt;
          t.y -= dt * 1.1;
          return t.t < t.life;
        });
      },
      /* unit: how many canvas pixels one of the game's units is */
      draw: function (ctx, unit, ox, oy) {
        unit = unit || 1; ox = ox || 0; oy = oy || 0;
        bits.forEach(function (b) {
          ctx.globalAlpha = Math.max(0, 1 - b.t / b.life);
          ctx.fillStyle = b.c;
          var r = Math.max(1, unit * 0.09);
          ctx.fillRect(ox + b.x * unit - r, oy + b.y * unit - r, r * 2, r * 2);
        });
        ctx.globalAlpha = 1;
        texts.forEach(function (t) {
          ctx.globalAlpha = Math.max(0, 1 - t.t / t.life);
          ctx.fillStyle = t.c;
          ctx.font = '700 ' + Math.max(12, unit * 0.62) + 'px ' + FONT;
          ctx.textAlign = 'center';
          ctx.fillText(t.s, ox + t.x * unit, oy + t.y * unit);
        });
        ctx.globalAlpha = 1;
        ctx.textAlign = 'left';
      },
      clear: function () { bits = []; texts = []; }
    };
  }

  var FONT = 'Inter, system-ui, -apple-system, sans-serif';
  var MONO = '"JetBrains Mono", ui-monospace, Menlo, monospace';

  /* ---------------------------- canvas bits ------------------------- */
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* A label that has to fit a box: shrink the type rather than clip it,
     down to a floor, and only then cut it short. */
  function fitText(ctx, str, max, size, weight) {
    var s = size;
    ctx.font = (weight || 700) + ' ' + s + 'px ' + FONT;
    while (ctx.measureText(str).width > max && s > size * 0.55) {
      s -= 0.5;
      ctx.font = (weight || 700) + ' ' + s + 'px ' + FONT;
    }
    var out = str;
    while (ctx.measureText(out).width > max && out.length > 4) {
      out = out.slice(0, -2) + '…';
    }
    return out;
  }

  /* Draw a flag in a box, or a grey stand-in while it loads. */
  function drawFlag(ctx, src, x, y, w, h, r) {
    var f = flag(src);
    ctx.save();
    roundRect(ctx, x, y, w, h, r === undefined ? 3 : r);
    ctx.clip();
    if (f) ctx.drawImage(f, x, y, w, h);
    else { ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fillRect(x, y, w, h); }
    ctx.restore();
    ctx.strokeStyle = 'rgba(0,0,0,.35)';
    ctx.lineWidth = 1;
    roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r === undefined ? 3 : r);
    ctx.stroke();
  }

  /* ---------------------------- keyboard ---------------------------- */
  /* Games are keyboard-first, and all of them want the same guards: not
     while typing in a field, and never let the arrows scroll the page. */
  function keys(handler) {
    function onKey(e) {
      var t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (handler(e) === true) { e.preventDefault(); }
    }
    document.addEventListener('keydown', onKey);
    return function () { document.removeEventListener('keydown', onKey); };
  }

  /* A game is only playing while its tab is in front: leaving a run
     going in a hidden tab is how a score gets lost. */
  function onHidden(fn) {
    function go() { if (document.visibilityState === 'hidden') fn(); }
    document.addEventListener('visibilitychange', go);
    return function () { document.removeEventListener('visibilitychange', go); };
  }

  /* Toasts are held while a game is running, so a level-up card does not
     land over the play area mid-run. */
  function holding() {
    var on = false;
    return function (want) {
      if (want === on) return;
      on = want;
      W.holdToasts(want);
    };
  }

  /* ============================== engine ============================
     The run itself: ready, playing, paused, over, and every way a player
     gets between them. Ten games wanted the same state machine, the same
     pause-on-Escape, the same pause-when-the-tab-goes-away, the same
     "press anything to start" and the same game-over card, so it lives
     here and a game describes only how it plays.

     A game hands in:
       aspect, stats, cls, maxHeight   for the shell
       intro        { eyebrow, title, lines }  the ready card
       start(view)  begin a fresh run
       step(dt)     advance one frame; only called while playing
       draw(ctx, view, clock)          called every frame, always, so the
                                       board shows through the cards
       key(e)       true if the game used it
       pointer(kind, x, y)             'down' | 'move' | 'up', canvas px
       resize(view)
       score()      the number the best is kept on
       over()       { eyebrow, title, text, stats } for the card
       onBack()     leave for the setup screen

     and gets back { destroy, engine }. The game drives the engine with
     E.begin(), E.pause(), E.resume() and E.finish(). */
  function engine(host, spec) {
    var sh = shell(host, spec);
    var hold = holding();
    var E = {
      shell: sh, ctx: sh.ctx, layer: sh.layer, banner: sh.banner,
      view: sh.view, state: 'ready', fx: fx()
    };

    var frames = null, offResize = null, offKeys = null, offHidden = null, dead = false;
    /* set true by the first frame, which is when a run first exists */
    var armed = false;

    function fit() {
      E.view = sh.fit(spec.aspect || 1.6);
      if (spec.resize) spec.resize(E.view);
    }

    E.begin = function () {
      E.state = 'play';
      hide(sh.layer);
      sh.root.focus();
    };

    E.pause = function () {
      if (E.state !== 'play') return;
      E.state = 'paused';
      paused(sh.layer, {
        onResume: E.resume,
        onQuit: function () { E.state = 'over'; spec.onBack(); }
      });
    };

    E.resume = function () {
      if (E.state !== 'paused') return;
      E.state = 'play';
      hide(sh.layer);
      sh.root.focus();
    };

    /* quit: leave without a card, the way the pause menu's Quit does */
    E.quit = function () { E.state = 'over'; spec.onBack(); };

    E.finish = function () {
      if (E.state === 'over') return;
      E.state = 'over';
      var score = spec.score ? spec.score() : 0;
      var isBest = spec.best ? spec.best(score) : false;
      if (isBest && score > 0) W.Sound.finish();
      var o = spec.over() || {};
      over(sh.layer, {
        best: isBest && score > 0,
        eyebrow: o.eyebrow, title: o.title, text: o.text, stats: o.stats,
        onAgain: restart,
        onBack: spec.onBack
      });
    };

    /* The ready card, and a fresh run behind it. */
    function arm() {
      E.state = 'ready';
      E.fx.clear();
      spec.start(E.view);
      var intro = spec.intro || {};
      ready(sh.layer, { eyebrow: intro.eyebrow, title: intro.title, lines: intro.lines, icon: intro.icon });
    }

    function restart() {
      arm();
      E.begin();
    }

    /* ---- input ----
       One rule for the keys every game shares, then the game's own. */
    offKeys = keys(function (e) {
      /* Nothing is playable until the first frame has armed a run: a
         tab opened in the background gets no frames at all, and a key
         pressed there used to reach a game whose run was still null. */
      if (dead || !armed) return false;
      if (e.key === 'Escape') {
        if (E.state === 'play') { E.pause(); return true; }
        if (E.state === 'paused') { E.resume(); return true; }
        return false;
      }
      var go = e.key === ' ' || e.key === 'Enter';
      if (E.state === 'ready') {
        /* anything but a bare modifier starts it */
        if (e.key.length === 1 || go || e.key.indexOf('Arrow') === 0) {
          E.begin();
          /* The key that started the run is still a move, or a letter
             the game wanted: Capital Typer says "start typing", so the
             first letter has to reach its buffer rather than be eaten
             by the ready card. Space and Enter only ever mean "go". */
          if (spec.key && !go) spec.key(e);
          return true;
        }
        return false;
      }
      if (E.state === 'paused') { if (go) { E.resume(); return true; } return false; }
      if (E.state === 'over') { if (go) { restart(); return true; } return false; }
      return spec.key ? spec.key(e) === true : false;
    });

    /* Pointers come in canvas pixels, which is what every game draws in. */
    function at(e) {
      var r = sh.canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    function down(e) {
      if (dead || !armed) return;
      if (E.state === 'ready') return E.begin();
      if (E.state !== 'play') return;
      var p = at(e);
      if (spec.pointer) spec.pointer('down', p.x, p.y, e);
    }
    function move(e) {
      if (dead || !armed || E.state !== 'play' || !spec.pointer) return;
      var p = at(e);
      spec.pointer('move', p.x, p.y, e);
    }
    function up(e) {
      if (dead || !armed || E.state !== 'play' || !spec.pointer) return;
      var p = at(e);
      spec.pointer('up', p.x, p.y, e);
    }
    sh.canvas.addEventListener('pointerdown', down);
    sh.canvas.addEventListener('pointermove', move);
    global.addEventListener('pointerup', up);
    sh.pauseBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (E.state === 'play') E.pause(); else if (E.state === 'paused') E.resume();
    });

    offHidden = onHidden(function () { if (E.state === 'play') E.pause(); });
    offResize = sh.onResize(fit);

    fit();

    /* The first run is armed on the first frame rather than here.
       A game writes `var E = GameKit.engine(host, {...})` and its
       start() reaches for E.view and E.banner, so arming inside this
       call would run start() while that variable is still null.
       requestAnimationFrame lands after the assignment. */
    frames = loop(function (dt, clock) {
      if (!armed) { armed = true; arm(); }
      if (E.state === 'play') {
        spec.step(dt, clock);
        E.fx.step(dt);
      }
      hold(E.state === 'play');
      spec.draw(sh.ctx, E.view, clock);
    });

    E.destroy = function () {
      dead = true;
      if (frames) frames.stop();
      hold(false);
      offKeys(); offHidden(); offResize();
      sh.canvas.removeEventListener('pointerdown', down);
      sh.canvas.removeEventListener('pointermove', move);
      global.removeEventListener('pointerup', up);
      host.innerHTML = '';
    };

    return E;
  }

  /* Best score kept per game under state.games.<id>, the same place the
     four older games keep theirs. */
  function record(id) {
    var g = W.state.games || (W.state.games = {});
    return g[id] || (g[id] = {});
  }

  function keepBest(id, field, score, higher) {
    var r = record(id);
    var cur = r[field] || 0;
    var win = higher === false ? (cur === 0 || score < cur) : score > cur;
    if (win) r[field] = score;
    r.runs = (r.runs || 0) + 1;
    W.save();
    return win;
  }

  global.GameKit = {
    shell: shell, asker: asker, award: award, loop: loop, fx: fx,
    engine: engine, record: record, keepBest: keepBest,
    flag: flag, preload: preload, drawFlag: drawFlag,
    ready: ready, paused: paused, over: over, card: card, hide: hide,
    banner: banner, verdict: verdict, rightAnswer: right,
    roundRect: roundRect, fitText: fitText, keys: keys, onHidden: onHidden,
    holding: holding, FONT: FONT, MONO: MONO, TAU: TAU
  };
})(window);
