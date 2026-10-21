/* ------------------------------------------------------------------
   LearnGeo — Geo Dash
   A 2D runner in the style of Geometry Dash. The cube runs on its own;
   you only jump. Every so often a question gate comes down the track,
   and getting through it means naming a country's capital.

     GeoDash.mount(host, { every, cfg(), onBack(), onRun(result) })
       every   seconds of running between capital gates
       cfg     the question filters (StudyFilters shape), read per question
       onBack  leave for the setup screen
       onRun   called once per finished run with its result

   Units are tiles. y goes up from the floor, x along the track. Physics
   runs on a fixed 240 Hz step so a fast cube cannot pass through a spike
   between two frames.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons;

  /* a jump clears three spikes in a row and tops out just over 2 tiles */
  var GRAVITY = 62, JUMP = 16.1, PAD = 21, ORB = 15.5;
  var STEP = 1 / 240;
  var AIR_TIME = 2 * JUMP / GRAVITY;
  var SPIN = Math.PI / AIR_TIME;                  /* half a turn per jump */
  var SPEEDS = [8.6, 9.6, 10.6, 11.4, 12];        /* tiles per second, one per capital answered */
  var HUES = [222, 262, 318, 18, 158];
  var VIEW_H = 10, FLOOR = 2.2, PLAYER_AT = 5;
  var ORB_BUFFER = 0.12;

  /* Track pieces. s spike [x, y], b block [x, y, w, h], p jump pad [x],
     o jump ring [x, y]. Spacing inside a piece is either short enough to
     take in one jump or long enough for two; nothing in between, which is
     where a run becomes unfair rather than hard. tier 0 is before the first
     capital, tier 1 after one, tier 2 after two. */
  var PIECES = [
    { tier: 0, len: 1, o: [['s', 0, 0]] },
    { tier: 0, len: 2, o: [['s', 0, 0], ['s', 1, 0]] },
    { tier: 0, len: 3, o: [['b', 0, 0, 3, 1]] },
    { tier: 0, len: 6, o: [['b', 0, 0, 3, 1], ['b', 3, 0, 3, 2]] },
    { tier: 1, len: 3, o: [['s', 0, 0], ['s', 1, 0], ['s', 2, 0]] },
    { tier: 1, len: 6, o: [['b', 0, 0, 6, 1], ['s', 3, 1]] },
    { tier: 1, len: 5, o: [['p', 0], ['s', 2, 0], ['s', 3, 0], ['s', 4, 0]] },
    { tier: 1, len: 6, o: [['b', 0, 0, 2, 1], ['b', 2, 0, 2, 2], ['b', 4, 0, 2, 3]] },
    { tier: 2, len: 6, o: [['b', 0, 0, 3, 1], ['s', 3, 0], ['s', 4, 0], ['s', 5, 0]] },
    { tier: 2, len: 5, o: [['s', 0, 0], ['s', 1, 0], ['s', 2, 0], ['s', 3, 0], ['s', 4, 0], ['o', 2, 1.2]] },
    { tier: 2, len: 7, o: [['b', 0, 0, 2, 1], ['s', 2, 0], ['s', 3, 0], ['s', 4, 0], ['b', 5, 0, 2, 1]] }
  ];

  function mount(host, opts) {
    var esc = W.escapeHtml;
    host.innerHTML =
      '<div class="gd" tabindex="-1">' +
        '<canvas class="gd__canvas"></canvas>' +
        '<div class="gd__hud">' +
          '<div class="gd__stat"><b class="mono" data-dist>0</b><span>m</span></div>' +
          '<div class="gd__stat"><b class="mono" data-caps>0</b><span>capitals</span></div>' +
          '<div class="gd__next"><span data-next-l>Next capital</span><div class="gd__bar"><i data-next></i></div></div>' +
          '<button class="gd__btn" data-pause aria-label="Pause">' + I.pause + '</button>' +
        '</div>' +
        '<div class="gd__layer hidden" data-layer></div>' +
      '</div>';

    var root = host.querySelector('.gd');
    var canvas = root.querySelector('canvas');
    var ctx = canvas.getContext('2d');
    var layer = root.querySelector('[data-layer]');
    var hud = {
      dist: root.querySelector('[data-dist]'), caps: root.querySelector('[data-caps]'),
      next: root.querySelector('[data-next]'), nextL: root.querySelector('[data-next-l]')
    };

    var save = W.state.games.dash;
    var every = opts.every || 20;
    var attempt = 0, best = save.best || 0;
    var raf = 0, lastT = 0, acc = 0;
    var view = { w: 0, h: 0, s: 1, tiles: 20, dpr: 1 };
    var run, held = false, pressAt = -1, clock = 0;
    var recentQ = [], skins = {};
    var holding = false;

    /* ----------------------------- the run ---------------------------- */
    function reset(go) {
      attempt += 1;
      run = {
        state: 'ready', x: 0, y: 0, vy: 0, ground: true, angle: 0,
        objs: [], next: 16, time: 0, sinceGate: 0, gateDue: false, gate: null,
        stage: 0, caps: 0, hue: HUES[0], dead: 0, parts: [], skin: null,
        reason: null, q: null, answered: null, trail: 0, shake: 0, startX: 0
      };
      fill();
      if (go) { run.state = 'run'; layer.classList.add('hidden'); layer.innerHTML = ''; root.focus(); }
      else showReady();
      draw();
      syncHud();
    }

    function speed() { return SPEEDS[Math.min(run.stage, SPEEDS.length - 1)]; }

    function fill() {
      var ahead = run.x - PLAYER_AT + view.tiles + 14;
      while (run.next < ahead) place();
    }

    function place() {
      if (run.gateDue && !run.gate) {
        var gx = run.next + 4;
        run.gate = { k: 'g', x: gx, y: 0, w: 1, h: 4.5 };
        run.objs.push(run.gate);
        run.next = gx + 12;          /* a clear runway out of the gate */
        return;
      }
      var tier = Math.min(run.stage, 2);
      var choices = PIECES.filter(function (p) { return p.tier <= tier; });
      /* newer pieces come up more often than the ones you have seen since the start */
      var weighted = [];
      choices.forEach(function (p) { for (var i = 0; i <= p.tier; i++) weighted.push(p); });
      var piece = W.pick(weighted);
      var x0 = run.next;
      piece.o.forEach(function (o) {
        if (o[0] === 's') run.objs.push({ k: 's', x: x0 + o[1], y: o[2], w: 1, h: 1 });
        else if (o[0] === 'b') run.objs.push({ k: 'b', x: x0 + o[1], y: o[2], w: o[3], h: o[4] });
        else if (o[0] === 'p') run.objs.push({ k: 'p', x: x0 + o[1], y: 0, w: 1, h: 0.3 });
        else if (o[0] === 'o') run.objs.push({ k: 'o', x: x0 + o[1], y: o[2], w: 1, h: 1 });
      });
      /* step() stops at the first object past the cube, so keep them in x order */
      run.objs.sort(function (a, b) { return a.x - b.x; });
      /* the gap after a piece is sized for the next speed up, so a capital
         answered mid-stretch never leaves a gap too short to land in */
      var fast = SPEEDS[Math.min(run.stage + 1, SPEEDS.length - 1)];
      var reach = Math.ceil(fast * AIR_TIME + 1.5);
      var spare = run.stage >= 2 ? 3 : 5;
      run.next = x0 + piece.len + reach + Math.floor(Math.random() * spare);
    }

    function step(dt) {
      var r = run;
      clock += dt;
      r.time += dt;
      r.sinceGate += dt;
      if (!r.gateDue && r.sinceGate >= every) r.gateDue = true;

      var prevY = r.y;
      r.x += speed() * dt;
      r.vy -= GRAVITY * dt;
      r.y += r.vy * dt;
      r.ground = false;
      if (r.y <= 0) { r.y = 0; r.vy = 0; r.ground = true; }

      for (var i = 0; i < r.objs.length; i++) {
        var o = r.objs[i];
        if (o.x > r.x + 2) break;
        if (o.x + o.w < r.x - 1) continue;
        if (o.k === 'b') {
          if (!overlap(r.x, r.y, 1, 1, o.x, o.y, o.w, o.h)) continue;
          var top = o.y + o.h;
          /* a little lenience on the lip: landing a hair low still lands */
          if (prevY >= top - 0.25) { r.y = top; r.vy = 0; r.ground = true; }
          else return crash('Crashed into a block');
        } else if (o.k === 's') {
          if (overlap(r.x + 0.14, r.y + 0.12, 0.72, 0.76, o.x + 0.34, o.y, 0.32, 0.52)) return crash('Hit a spike');
        } else if (o.k === 'p') {
          if (!o.used && overlap(r.x, r.y, 1, 1, o.x + 0.15, o.y, 0.7, o.h)) {
            o.used = true; r.vy = PAD; r.ground = false; burst(o.x + 0.5, 0.2, '#FFD23F', 10);
          }
        } else if (o.k === 'o') {
          var cx = o.x + 0.5, cy = o.y + 0.5;
          if (!o.used && Math.abs(r.x + 0.5 - cx) < 1 && Math.abs(r.y + 0.5 - cy) < 1 &&
              pressAt >= 0 && clock - pressAt <= ORB_BUFFER) {
            o.used = true; pressAt = -1; r.vy = ORB; r.ground = false; burst(cx, cy, '#FFD23F', 14);
          }
        } else if (o.k === 'g') {
          if (r.x + 0.5 >= o.x + 0.5) return ask();
        }
      }

      /* a tap let go just before landing still counts */
      if (r.ground && (held || (pressAt >= 0 && clock - pressAt <= ORB_BUFFER))) {
        r.vy = JUMP; r.ground = false; pressAt = -1;
      }

      if (r.ground) {
        var snap = Math.round(r.angle / (Math.PI / 2)) * (Math.PI / 2);
        r.angle += (snap - r.angle) * Math.min(1, dt * 30);
        r.trail += dt;
        if (r.trail > 0.035) { r.trail = 0; r.parts.push(part(r.x + 0.05, r.y + 0.08, -1.5 - Math.random(), Math.random() * 1.6, 0.35, 0.16, 'rgba(255,255,255,.75)')); }
      } else {
        r.angle += SPIN * dt;
      }

      while (r.objs.length && r.objs[0].x + r.objs[0].w < r.x - PLAYER_AT - 2) r.objs.shift();
      fill();
    }

    function overlap(ax, ay, aw, ah, bx, by, bw, bh) {
      return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
    }

    function part(x, y, vx, vy, life, size, color) {
      return { x: x, y: y, vx: vx, vy: vy, life: life, max: life, size: size, color: color };
    }
    function burst(x, y, color, n) {
      for (var i = 0; i < n; i++) {
        var a = Math.random() * Math.PI * 2, v = 2 + Math.random() * 6;
        run.parts.push(part(x, y, Math.cos(a) * v, Math.sin(a) * v, 0.5 + Math.random() * 0.4, 0.12 + Math.random() * 0.2, color));
      }
    }
    function tickParts(dt) {
      run.parts = run.parts.filter(function (p) {
        p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy -= 14 * dt;
        return p.life > 0;
      });
    }

    function crash(why) {
      run.state = 'dead'; run.dead = 0; run.reason = why; run.shake = 0.35;
      burst(run.x + 0.5, run.y + 0.5, '#fff', 26);
      burst(run.x + 0.5, run.y + 0.5, 'hsl(' + run.hue + ',95%,65%)', 18);
      W.Sound.wrong();
    }

    function distance() { return Math.max(0, Math.floor(run.x - run.startX)); }

    /* ---------------------------- questions --------------------------- */
    function ask() {
      var cfg = opts.cfg();
      /* Quiz.make turns a capital that names its own country (Andorra la
         Vella, Djibouti) into a map question, and there is no map here */
      var askable = function (c) { return global.Quiz.fits('capital', c); };
      var list = global.StudyFilters.pool(cfg).filter(askable);
      if (!list.length) list = global.Quiz.pool({ scope: 'all' }).filter(askable);
      var fresh = list.filter(function (c) { return recentQ.indexOf(c.name) === -1; });
      if (fresh.length) list = fresh;
      var head = cfg.weakFirst ? list.slice(0, Math.max(8, Math.ceil(list.length / 3))) : list;
      var target = W.pick(head);
      recentQ.push(target.name);
      if (recentQ.length > 8) recentQ.shift();
      var field = list.length >= 5 ? list : global.Quiz.pool({ scope: 'all' });

      run.state = 'ask';
      run.gateNo = run.caps + 1;
      run.q = global.Quiz.make('capital', target, field, { typed: !!cfg.typed });
      run.answered = null;
      held = false;
      renderAsk();
    }

    function renderAsk() {
      var q = run.q, a = run.answered;
      var html = '<div class="gd-card gd-card--q">' +
        '<div class="gd-card__eyebrow">' + I.pin + ' Capital gate · ' + run.gateNo + '</div>' +
        '<div class="gd-card__prompt">' + esc(q.prompt) + '</div>' +
        '<div class="gd-card__subject">' + global.Quiz.subjectHtml(q) + '</div>';
      if (q.typed) {
        html += '<div class="gd-typed"><input class="answer-input" data-typed autocomplete="off" autocorrect="off" spellcheck="false" ' +
          'placeholder="Type the capital…"' + (a ? ' disabled value="' + esc(a.given) + '"' : '') + '>' +
          (a ? '' : '<button class="btn btn--accent" data-check>Check</button>') + '</div>';
      } else {
        html += '<div class="gd-opts">' + q.choices.map(function (c, i) {
          var cls = 'gd-opt';
          if (a) { cls += ' is-locked'; if (c.correct) cls += ' is-right'; else if (a.idx === i) cls += ' is-wrong'; }
          return '<button class="' + cls + '" data-i="' + i + '"><span class="mono">' + (i + 1) + '</span>' + esc(c.text) + '</button>';
        }).join('') + '</div>';
      }
      if (a && a.correct) {
        html += '<div class="gd-card__ok">' + I.check + '<div><b>Correct, ' + esc(q.country.capital) + '.</b>' +
          '<span>+' + a.gains.xp + ' XP · ' + W.gem(a.gains.gems) + ' · it speeds up now</span></div></div>' +
          '<button class="btn btn--accent btn--block" data-go>Keep going ' + I.arrowR + '</button>' +
          '<div class="gd-card__hint">Press Space or tap to go</div>';
      }
      html += '</div>';
      layer.innerHTML = html;
      layer.classList.remove('hidden');

      W.$$('.gd-opt', layer).forEach(function (b) {
        b.addEventListener('click', function () { choose(+b.dataset.i); });
      });
      var input = W.$('[data-typed]', layer);
      if (input && !a) {
        input.focus();
        input.addEventListener('keydown', function (e) {
          e.stopPropagation();
          if (e.key === 'Enter') submitTyped();
        });
        W.$('[data-check]', layer).addEventListener('click', submitTyped);
      }
      var go = W.$('[data-go]', layer);
      if (go) { go.addEventListener('click', resume); go.focus(); }
    }

    function choose(i) {
      if (run.answered || !run.q.choices) return;
      var c = run.q.choices[i];
      answer(global.Quiz.grade(run.q, c.text), c.text, i);
    }
    function submitTyped() {
      var input = W.$('[data-typed]', layer);
      if (run.answered || !input || !input.value.trim()) return;
      answer(global.Quiz.grade(run.q, input.value), input.value, -1);
    }

    function answer(correct, given, idx) {
      var gains = W.award(correct, { country: run.q.country.name });
      run.answered = { correct: correct, given: given, idx: idx, gains: gains };
      if (correct) {
        W.Sound.correct(gains.combo);
        run.caps += 1;
        run.stage += 1;
        loadSkin(run.q.country);
        renderAsk();
        var anchor = W.$('.gd-opt.is-right', layer) || W.$('[data-typed]', layer);
        if (anchor) W.burstFrom(anchor, gains);
      } else {
        W.Sound.wrong();
        run.reason = 'wrong';
        renderAsk();
        setTimeout(function () { if (run && run.state === 'ask') finish(); }, 1100);
      }
      W.save();
      if (global.UI) global.UI.refreshHud(true);
      if (gains.level) W.toast('Level ' + gains.level, 'Nice one, keep it going', I.bolt, 3200);
      W.announceAchievements(W.checkAchievements());
    }

    function resume() {
      if (run.state !== 'ask' || !run.answered || !run.answered.correct) return;
      run.objs = run.objs.filter(function (o) { return o !== run.gate; });
      run.gate = null; run.gateDue = false; run.sinceGate = 0;
      run.state = 'run';
      layer.classList.add('hidden'); layer.innerHTML = '';
      root.focus();
    }

    /* The cube wears the flag of the last capital you got right. The flags
       are SVGs with only a viewBox, which Chrome sizes as 300x150 when you
       crop from them directly, so each is drawn once at 4:3 onto a canvas and
       the middle square of that is the skin. */
    function loadSkin(c) {
      if (!c.flag) return;
      var r = run;
      if (skins[c.flag]) { r.skin = skins[c.flag]; return; }
      var img = new Image();
      img.onload = function () {
        var flat = document.createElement('canvas');
        flat.width = 96; flat.height = 72;
        flat.getContext('2d').drawImage(img, 0, 0, 96, 72);
        var sq = document.createElement('canvas');
        sq.width = 72; sq.height = 72;
        sq.getContext('2d').drawImage(flat, 12, 0, 72, 72, 0, 0, 72, 72);
        skins[c.flag] = sq;
        if (run === r) r.skin = sq;
      };
      img.src = c.flag;
    }

    /* ----------------------------- screens ---------------------------- */
    function showReady() {
      layer.innerHTML =
        '<div class="gd-card gd-card--ready">' +
          '<div class="gd-card__eyebrow">Attempt ' + attempt + '</div>' +
          '<h3>Click, tap or press Space</h3>' +
          '<p>Jump over spikes and onto blocks. Hold to keep jumping. ' +
            'Yellow pads launch you; tap again inside a yellow ring to jump in mid-air.</p>' +
          '<p>Every ' + every + ' seconds a capital gate comes up. Name the capital to get through.</p>' +
        '</div>';
      layer.classList.remove('hidden');
    }

    function showPaused() {
      layer.innerHTML =
        '<div class="gd-card gd-card--ready">' +
          '<div class="gd-card__eyebrow">Paused</div>' +
          '<h3>Press Space or tap to carry on</h3>' +
          '<div class="gd-card__row">' +
            '<button class="btn btn--accent" data-unpause>' + I.play + ' Resume</button>' +
            '<button class="btn btn--ghost" data-back>Quit run</button>' +
          '</div>' +
        '</div>';
      layer.classList.remove('hidden');
      W.$('[data-unpause]', layer).addEventListener('click', function (e) { e.stopPropagation(); unpause(); });
      W.$('[data-back]', layer).addEventListener('click', function (e) { e.stopPropagation(); finish(true); });
    }

    function pause() {
      if (!run || run.state !== 'run') return;
      run.state = 'paused'; held = false;
      showPaused();
    }
    function unpause() {
      if (run.state !== 'paused') return;
      run.state = 'run';
      layer.classList.add('hidden'); layer.innerHTML = '';
      root.focus();
    }

    function finish(quit) {
      if (run.state === 'over') return;
      var dist = distance();
      var isBest = !quit && dist > best;
      if (isBest) best = dist;
      save.best = best;
      save.runs = (save.runs || 0) + 1;
      save.bestCaps = Math.max(save.bestCaps || 0, run.caps);
      W.save();
      run.state = 'over';
      if (opts.onRun) opts.onRun({ distance: dist, capitals: run.caps, best: isBest });
      if (quit) { opts.onBack(); return; }
      if (isBest && dist > 0) W.Sound.finish();

      var q = run.q, wrong = run.reason === 'wrong';
      layer.innerHTML =
        '<div class="gd-card gd-card--over">' +
          '<div class="gd-card__eyebrow">' + (isBest && dist > 0 ? I.trophy + ' New best · ' : '') +
            (wrong ? 'Run over' : esc(run.reason || 'Crashed')) + '</div>' +
          '<h3>' + (wrong ? 'Wrong capital' : 'Crashed!') + '</h3>' +
          (wrong
            ? '<p>The capital of <b>' + esc(q.country.name) + '</b> is <b>' + esc(q.country.capital) + '</b>' +
                (run.answered && run.answered.given ? ', not ' + esc(run.answered.given) : '') + '.</p>'
            : '') +
          '<div class="gd-stats">' +
            '<div><b class="mono">' + dist + ' m</b><span>Distance</span></div>' +
            '<div><b class="mono">' + run.caps + '</b><span>Capitals</span></div>' +
            '<div><b class="mono">' + best + ' m</b><span>Best</span></div>' +
          '</div>' +
          '<div class="gd-card__row">' +
            '<button class="btn btn--accent" data-again>' + I.refresh + ' Play again</button>' +
            '<button class="btn btn--ghost" data-back>Back</button>' +
          '</div>' +
          '<div class="gd-card__hint">Space or Enter to play again</div>' +
        '</div>';
      layer.classList.remove('hidden');
      W.$('[data-again]', layer).addEventListener('click', function (e) { e.stopPropagation(); reset(true); });
      W.$('[data-back]', layer).addEventListener('click', function (e) { e.stopPropagation(); opts.onBack(); });
      syncHud();
    }

    /* ------------------------------ input ----------------------------- */
    function press() {
      if (!run) return;
      if (run.state === 'ready') {
        run.state = 'run';
        layer.classList.add('hidden'); layer.innerHTML = '';
      } else if (run.state === 'paused') { unpause(); return; }
      else if (run.state === 'ask') { resume(); return; }
      else if (run.state === 'over') { reset(true); return; }
      if (run.state !== 'run') return;
      held = true;
      pressAt = clock;
    }
    function release() { held = false; }

    function onKey(e) {
      if (!document.body.classList.contains('view-games')) return;
      if (document.querySelector('.overlay')) return;
      var t = e.target;
      if (t && (/INPUT|TEXTAREA|SELECT/.test(t.tagName) || t.isContentEditable)) return;
      var jumpKey = e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W';
      if (e.type === 'keyup') { if (jumpKey) release(); return; }

      if (run.state === 'ask' && !run.answered && /^[1-4]$/.test(e.key)) { e.preventDefault(); choose(+e.key - 1); return; }
      if ((e.key === 'Escape' || e.key === 'p' || e.key === 'P') && run.state === 'run') { e.preventDefault(); pause(); return; }
      if (jumpKey || (e.key === 'Enter' && run.state !== 'run')) {
        e.preventDefault();
        if (e.repeat) return;
        /* a focused button takes Enter for itself; Space is always the jump */
        if (e.key === 'Enter' && t && t.tagName === 'BUTTON' && layer.contains(t)) return;
        press();
      }
    }
    function onDown(e) {
      if (e.target.closest('button, input, .gd-card--q, .gd-card--over')) return;
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      press();
    }
    function onVisible() { if (document.hidden) pause(); }

    document.addEventListener('keydown', onKey);
    document.addEventListener('keyup', onKey);
    root.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', onVisible);
    root.querySelector('[data-pause]').addEventListener('click', function (e) {
      e.stopPropagation();
      if (run.state === 'run') pause(); else if (run.state === 'paused') unpause();
    });

    /* ------------------------------ sizing ---------------------------- */
    function resize() {
      var w = root.clientWidth || 800;
      view.tiles = w < 620 ? 15 : 20;
      view.s = w / view.tiles;
      view.w = w;
      view.h = Math.round(view.s * VIEW_H);
      view.dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.style.height = view.h + 'px';
      canvas.width = Math.round(w * view.dpr);
      canvas.height = Math.round(view.h * view.dpr);
      if (run) { fill(); draw(); }
    }
    var ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(root); else window.addEventListener('resize', resize);

    /* ------------------------------ drawing --------------------------- */
    function sx(x) { return (x - (run.x - PLAYER_AT)) * view.s; }
    function sy(y) { return view.h - (FLOOR + y) * view.s; }

    function draw() {
      var r = run, s = view.s, c = ctx;
      c.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      var shake = r.shake > 0 ? (Math.random() - 0.5) * r.shake * 18 : 0;
      c.save();
      c.translate(shake, shake * 0.6);

      var hue = r.hue;
      var sky = c.createLinearGradient(0, 0, 0, view.h);
      sky.addColorStop(0, 'hsl(' + hue + ',72%,52%)');
      sky.addColorStop(1, 'hsl(' + hue + ',78%,30%)');
      c.fillStyle = sky;
      c.fillRect(-20, -20, view.w + 40, view.h + 40);

      /* background squares, a quarter of the track speed */
      var camX = r.x - PLAYER_AT;
      var bx = camX * 0.25;
      c.strokeStyle = 'hsla(' + hue + ',90%,85%,.13)';
      c.lineWidth = 2;
      for (var i = Math.floor(bx / 3) - 1; i < bx / 3 + view.tiles / 3 + 2; i++) {
        var h1 = hash(i), size = (1.2 + h1 * 1.6) * s;
        var px = (i * 3 - bx) * s, py = (0.6 + hash(i + 99) * 4.2) * s;
        c.strokeRect(px, py, size, size);
      }

      /* the floor */
      var gy = sy(0);
      c.fillStyle = 'hsl(' + hue + ',70%,20%)';
      c.fillRect(-20, gy, view.w + 40, view.h - gy + 20);
      c.strokeStyle = 'hsla(' + hue + ',90%,85%,.12)';
      c.lineWidth = 1;
      for (var g = Math.floor(camX); g < camX + view.tiles + 1; g++) {
        var gx = sx(g);
        c.beginPath(); c.moveTo(gx, gy); c.lineTo(gx, view.h); c.stroke();
      }
      c.fillStyle = 'rgba(255,255,255,.85)';
      c.fillRect(-20, gy - 1, view.w + 40, 2);

      if (attemptTextVisible()) {
        c.fillStyle = 'rgba(255,255,255,.55)';
        c.font = '700 ' + Math.round(s * 0.9) + 'px system-ui, sans-serif';
        c.textAlign = 'left';
        c.fillText('Attempt ' + attempt, sx(r.startX + 2), sy(4.3));
      }

      r.objs.forEach(function (o) {
        var x = sx(o.x), y = sy(o.y + o.h), w = o.w * s, h = o.h * s;
        if (x > view.w + s || x + w < -s) return;
        if (o.k === 'b') drawBlock(x, y, w, h, hue);
        else if (o.k === 's') drawSpike(sx(o.x), sy(o.y), s, hue);
        else if (o.k === 'p') drawPad(sx(o.x), sy(0), s, o.used);
        else if (o.k === 'o') drawOrb(sx(o.x + 0.5), sy(o.y + 0.5), s, o.used);
        else if (o.k === 'g') drawGate(sx(o.x), sy(0), s, hue);
      });

      r.parts.forEach(function (p) {
        c.globalAlpha = Math.max(0, p.life / p.max);
        c.fillStyle = p.color;
        var ps = p.size * s;
        c.fillRect(sx(p.x) - ps / 2, sy(p.y) - ps / 2, ps, ps);
      });
      c.globalAlpha = 1;

      if (r.state !== 'dead' && r.state !== 'over') drawCube(sx(r.x + 0.5), sy(r.y + 0.5), s, r.angle, hue);
      c.restore();
    }

    function attemptTextVisible() { return run.x - run.startX < view.tiles + 4; }
    function hash(n) { var x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

    function drawBlock(x, y, w, h, hue) {
      var c = ctx;
      var g = c.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, 'hsla(' + hue + ',60%,16%,.95)');
      g.addColorStop(1, 'hsla(' + hue + ',70%,8%,.95)');
      c.fillStyle = g;
      c.fillRect(x, y, w, h);
      c.strokeStyle = 'rgba(255,255,255,.9)';
      c.lineWidth = 2;
      c.strokeRect(x + 1, y + 1, w - 2, h - 2);
      c.strokeStyle = 'rgba(255,255,255,.18)';
      c.lineWidth = 1;
      for (var i = 1; i < Math.round(w / view.s); i++) {
        c.beginPath(); c.moveTo(x + i * view.s, y + 3); c.lineTo(x + i * view.s, y + h - 3); c.stroke();
      }
    }

    function drawSpike(x, base, s, hue) {
      var c = ctx;
      c.beginPath();
      c.moveTo(x + s * 0.06, base);
      c.lineTo(x + s * 0.5, base - s * 0.92);
      c.lineTo(x + s * 0.94, base);
      c.closePath();
      c.fillStyle = 'hsl(' + hue + ',60%,8%)';
      c.fill();
      c.strokeStyle = 'rgba(255,255,255,.92)';
      c.lineWidth = 2;
      c.stroke();
    }

    function drawPad(x, base, s, used) {
      var c = ctx;
      c.beginPath();
      c.ellipse(x + s * 0.5, base, s * 0.42, s * 0.22, 0, Math.PI, 0);
      c.fillStyle = used ? 'rgba(255,210,63,.45)' : '#FFD23F';
      c.shadowColor = '#FFD23F'; c.shadowBlur = used ? 0 : 14;
      c.fill();
      c.shadowBlur = 0;
    }

    function drawOrb(cx, cy, s, used) {
      var c = ctx, pulse = 1 + Math.sin(clock * 8) * 0.06;
      c.beginPath();
      c.arc(cx, cy, s * 0.36 * pulse, 0, Math.PI * 2);
      c.strokeStyle = used ? 'rgba(255,210,63,.35)' : '#FFD23F';
      c.lineWidth = s * 0.12;
      c.shadowColor = '#FFD23F'; c.shadowBlur = used ? 0 : 18;
      c.stroke();
      c.shadowBlur = 0;
      c.beginPath();
      c.arc(cx, cy, s * 0.14, 0, Math.PI * 2);
      c.fillStyle = used ? 'rgba(255,255,255,.3)' : '#fff';
      c.fill();
    }

    function drawGate(x, base, s, hue) {
      var c = ctx, h = s * 4.5, w = s * 1.1, top = base - h;
      c.save();
      c.shadowColor = '#7CF3FF'; c.shadowBlur = 22;
      c.strokeStyle = '#7CF3FF'; c.lineWidth = s * 0.14;
      roundRect(x - s * 0.05, top, w, h, w / 2);
      c.stroke();
      c.restore();
      c.fillStyle = 'rgba(124,243,255,.16)';
      roundRect(x - s * 0.05, top, w, h, w / 2);
      c.fill();
      c.fillStyle = '#fff';
      c.textAlign = 'center';
      c.font = '800 ' + Math.round(s * 1.1) + 'px system-ui, sans-serif';
      c.fillText('?', x + w / 2 - s * 0.05, top + h / 2 + s * 0.38);
      c.font = '700 ' + Math.round(s * 0.38) + 'px system-ui, sans-serif';
      c.fillText('CAPITAL', x + w / 2 - s * 0.05, top - s * 0.25);
    }

    function roundRect(x, y, w, h, r) {
      var c = ctx;
      c.beginPath();
      c.moveTo(x + r, y);
      c.arcTo(x + w, y, x + w, y + h, r);
      c.arcTo(x + w, y + h, x, y + h, r);
      c.arcTo(x, y + h, x, y, r);
      c.arcTo(x, y, x + w, y, r);
      c.closePath();
    }

    function drawCube(cx, cy, s, angle, hue) {
      var c = ctx, half = s / 2;
      c.save();
      c.translate(cx, cy);
      c.rotate(angle);
      var skin = run.skin;
      if (skin) {
        c.drawImage(skin, -half, -half, s, s);
        c.strokeStyle = '#111'; c.lineWidth = Math.max(2, s * 0.08);
        c.strokeRect(-half + c.lineWidth / 2, -half + c.lineWidth / 2, s - c.lineWidth, s - c.lineWidth);
      } else {
        c.fillStyle = '#FFD23F';
        c.fillRect(-half, -half, s, s);
        c.fillStyle = '#1B4DFF';
        c.fillRect(-half * 0.62, -half * 0.62, s * 0.62, s * 0.62);
        c.fillStyle = '#fff';
        c.fillRect(-half * 0.42, -half * 0.36, s * 0.16, s * 0.16);
        c.fillRect(half * 0.1, -half * 0.36, s * 0.16, s * 0.16);
        c.fillRect(-half * 0.42, half * 0.12, s * 0.52, s * 0.1);
        c.strokeStyle = '#111'; c.lineWidth = Math.max(2, s * 0.07);
        c.strokeRect(-half + c.lineWidth / 2, -half + c.lineWidth / 2, s - c.lineWidth, s - c.lineWidth);
      }
      c.restore();
    }

    function syncHud() {
      hud.dist.textContent = distance();
      hud.caps.textContent = run.caps;
      var left = Math.max(0, every - run.sinceGate);
      var pct = run.gateDue ? 100 : Math.min(100, (run.sinceGate / every) * 100);
      hud.next.style.width = pct + '%';
      hud.nextL.textContent = run.gateDue ? 'Capital gate ahead' : 'Next capital in ' + Math.ceil(left) + 's';
    }

    /* ------------------------------- loop ----------------------------- */
    function frame(t) {
      raf = requestAnimationFrame(frame);
      var dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 0;
      lastT = t;
      if (!run) return;
      var r = run;
      if (r.state === 'run') {
        acc += dt;
        while (acc >= STEP && r.state === 'run') { step(STEP); acc -= STEP; }
        if (r.state !== 'run') acc = 0;
      } else {
        acc = 0;
        clock += dt;
      }
      if (r.state === 'dead') {
        r.dead += dt;
        if (r.dead > 0.9) finish();
      }
      var moving = r.state === 'run' || r.state === 'dead';
      if (moving !== holding) { holding = moving; W.holdToasts(moving); }
      var target = HUES[Math.min(r.stage, HUES.length - 1)];
      r.hue += (target - r.hue) * Math.min(1, dt * 2);
      r.shake = Math.max(0, r.shake - dt);
      tickParts(dt);
      draw();
      syncHud();
    }

    resize();
    reset();
    raf = requestAnimationFrame(frame);

    return {
      destroy: function () {
        cancelAnimationFrame(raf);
        if (holding) { holding = false; W.holdToasts(false); }
        document.removeEventListener('keydown', onKey);
        document.removeEventListener('keyup', onKey);
        window.removeEventListener('pointerup', release);
        window.removeEventListener('pointercancel', release);
        window.removeEventListener('blur', release);
        document.removeEventListener('visibilitychange', onVisible);
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize);
        host.innerHTML = '';
        run = null;
      },
      /* for tests: the current run, read-only in spirit */
      get run() { return run; },
      press: press, release: release
    };
  }

  global.GeoDash = { mount: mount, pieces: PIECES, physics: { gravity: GRAVITY, jump: JUMP, pad: PAD, orb: ORB, speeds: SPEEDS } };
})(window);
