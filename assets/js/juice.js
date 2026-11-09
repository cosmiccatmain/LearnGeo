/* ------------------------------------------------------------------
   LearnGeo — juice layer.

   The payoff moments, made bigger. A right answer sends a shockwave,
   sparkles and XP / gem orbs that fly into the top bar, where the
   counter ticks up to the new total. Streaks get a shout-out, level-ups
   get rays and side cannons, and a game-over card counts its stats up.

   It wraps WW.burstFrom, WW.Sound and UI.refreshHud and watches for the
   level-up and game-over cards; nothing calls into it. Honours the
   "Reward animations" setting and prefers-reduced-motion.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';

  /* ------------------------- pure helpers -------------------------
     Kept free of the DOM so tests can load them in node. */
  var TIERS = [
    { at: 3,  text: 'Nice!',         tone: 'mint' },
    { at: 5,  text: 'Great!',        tone: 'sky' },
    { at: 10, text: 'On fire!',      tone: 'flame' },
    { at: 15, text: 'Unstoppable!',  tone: 'violet' },
    { at: 25, text: 'Legendary!',    tone: 'gold' }
  ];

  /* The shout-out for a streak, or null. Fires on each tier and then
     every fifth answer past ten, so it stays special. */
  function callout(combo) {
    combo = combo | 0;
    if (combo < 3) return null;
    var tier = null;
    for (var i = 0; i < TIERS.length; i++) if (combo >= TIERS[i].at) tier = TIERS[i];
    var onTier = TIERS.some(function (t) { return t.at === combo; });
    if (!onTier && !(combo > 10 && combo % 5 === 0)) return null;
    return { text: tier.text, tone: tier.tone, combo: combo };
  }

  /* "1,907 m" -> { pre: '', n: 1907, post: ' m' }. Times and anything
     without a whole number are left alone (null). */
  function parseCount(text) {
    var s = String(text == null ? '' : text);
    if (/\d:\d/.test(s)) return null;
    var m = /^([^\d-]*)(-?\d[\d,]*)(?!\.\d)(.*)$/.exec(s);
    if (!m) return null;
    var n = parseInt(m[2].replace(/,/g, ''), 10);
    if (!isFinite(n)) return null;
    return { pre: m[1], n: n, post: m[3], commas: m[2].indexOf(',') !== -1 };
  }

  function formatCount(p, n) {
    var v = Math.round(n);
    return p.pre + (p.commas ? v.toLocaleString('en-US') : String(v)) + p.post;
  }

  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

  var api = { callout: callout, parseCount: parseCount, formatCount: formatCount, easeOut: easeOut };
  global.Juice = api;

  var doc = global.document;
  var W = global.WW;
  if (!doc || !W || !global.Element || !Element.prototype.animate) return;

  var SPRING = 'cubic-bezier(.34,1.56,.64,1)';
  var OUT = 'cubic-bezier(.16,1,.3,1)';
  var mq = global.matchMedia ? global.matchMedia('(prefers-reduced-motion: reduce)') : null;

  function on() {
    return !(mq && mq.matches) && !!(W.state && W.state.settings && W.state.settings.effects !== false);
  }

  function layer() {
    var el = doc.getElementById('fx-layer');
    if (!el) { el = doc.createElement('div'); el.id = 'fx-layer'; doc.body.appendChild(el); }
    return el;
  }

  function spawn(cls, x, y) {
    var el = doc.createElement('div');
    el.className = cls;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    layer().appendChild(el);
    return el;
  }

  function play(el, frames, opts) {
    var a = el.animate(frames, opts);
    var gone = function () { if (el.parentNode) el.remove(); };
    a.onfinish = gone;
    setTimeout(gone, (opts.duration || 600) + (opts.delay || 0) + 400);
    return a;
  }

  function haptic(p) {
    try { if (on() && global.navigator && navigator.vibrate) navigator.vibrate(p); } catch (e) { /* not allowed */ }
  }

  function visible(el) {
    if (!el || el.classList.contains('hidden')) return null;
    var r = el.getBoundingClientRect();
    return r.width && r.height ? r : null;
  }

  /* --------------------------- the burst --------------------------- */
  function shockwave(x, y, big) {
    var ring = spawn('jz-ring' + (big ? ' jz-ring--big' : ''), x, y);
    play(ring, [
      { transform: 'translate(-50%,-50%) scale(.2)', opacity: 0.9 },
      { transform: 'translate(-50%,-50%) scale(' + (big ? 3.4 : 2.4) + ')', opacity: 0 }
    ], { duration: big ? 720 : 560, easing: OUT });
  }

  function sparkles(x, y, n) {
    for (var i = 0; i < n; i++) {
      var s = spawn('jz-spark', x, y);
      var ang = (Math.PI * 2 * i) / n + Math.random() * 0.4;
      var dist = 46 + Math.random() * 46;
      var dx = Math.cos(ang) * dist, dy = Math.sin(ang) * dist;
      var size = 0.6 + Math.random() * 0.8;
      play(s, [
        { transform: 'translate(-50%,-50%) scale(0) rotate(0deg)', opacity: 1 },
        { transform: 'translate(calc(-50% + ' + dx * 0.7 + 'px), calc(-50% + ' + dy * 0.7 + 'px)) scale(' + size + ') rotate(90deg)', opacity: 1, offset: 0.55 },
        { transform: 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px)) scale(0) rotate(180deg)', opacity: 0 }
      ], { duration: 520 + Math.random() * 220, easing: OUT });
    }
  }

  /* Orbs arc from the answer into a HUD chip; the chip pops as they land. */
  function orbs(x, y, chipId, n, kind, onLand) {
    var chip = doc.getElementById(chipId);
    var r = visible(chip);
    if (!r) return;
    var tx = r.left + r.width / 2, ty = r.top + r.height / 2;
    var landed = 0;
    for (var i = 0; i < n; i++) {
      (function (i) {
        var o = spawn('jz-orb jz-orb--' + kind, x, y);
        var sx = (Math.random() - 0.5) * 90, sy = -30 - Math.random() * 70;
        var dx = tx - x, dy = ty - y;
        var a = play(o, [
          { transform: 'translate(-50%,-50%) scale(.3)', opacity: 0 },
          { transform: 'translate(calc(-50% + ' + sx + 'px), calc(-50% + ' + sy + 'px)) scale(1.15)', opacity: 1, offset: 0.3 },
          { transform: 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px)) scale(.45)', opacity: 0.9 }
        ], { duration: 640 + i * 40, delay: 60 + i * 55, easing: 'cubic-bezier(.5,0,.75,.2)' });
        a.addEventListener('finish', function () {
          landed += 1;
          chip.classList.remove('jz-hit');
          void chip.offsetWidth;
          chip.classList.add('jz-hit');
          if (landed === 1 && onLand) onLand();
        });
      })(i);
    }
  }

  function shout(c, x, y) {
    var el = spawn('jz-callout jz-callout--' + c.tone, 0, 0);
    el.innerHTML = '<b>' + c.text + '</b><span>' + c.combo + ' in a row</span>';
    var w = global.innerWidth;
    var cx = Math.max(110, Math.min(w - 110, x));
    var cy = Math.max(70, y - 70);
    el.style.left = cx + 'px';
    el.style.top = cy + 'px';
    var tilt = (Math.random() - 0.5) * 10;
    play(el, [
      { transform: 'translate(-50%,-50%) scale(.2) rotate(' + (tilt - 14) + 'deg)', opacity: 0 },
      { transform: 'translate(-50%,-50%) scale(1.18) rotate(' + tilt + 'deg)', opacity: 1, offset: 0.22 },
      { transform: 'translate(-50%,-50%) scale(1) rotate(' + tilt + 'deg)', opacity: 1, offset: 0.36 },
      { transform: 'translate(-50%,-50%) scale(1) rotate(' + tilt + 'deg)', opacity: 1, offset: 0.78 },
      { transform: 'translate(-50%,-90%) scale(.9) rotate(' + tilt + 'deg)', opacity: 0 }
    ], { duration: 1500, easing: 'ease-out' });
  }

  function edgeGlow(strong) {
    var g = spawn('jz-edge' + (strong ? ' jz-edge--strong' : ''), 0, 0);
    play(g, [{ opacity: 0 }, { opacity: 1, offset: 0.25 }, { opacity: 0 }], { duration: strong ? 900 : 620, easing: 'ease-out' });
  }

  var baseBurst = W.burstFrom;
  W.burstFrom = function (el, gains) {
    baseBurst.apply(this, arguments);
    if (!el || !on()) return;
    var r = el.getBoundingClientRect();
    var x = r.left + r.width / 2, y = r.top + r.height / 2;
    var combo = gains ? gains.combo | 0 : 0;
    var c = callout(combo);
    shockwave(x, y, !!c);
    sparkles(x, y, combo >= 10 ? 14 : combo >= 5 ? 11 : 8);
    edgeGlow(!!c);
    if (gains) {
      orbs(x, y, 'hud-xp-chip', Math.min(8, 3 + Math.floor(combo / 3)), 'xp');
      if (gains.gems > 0) orbs(x, y, 'hud-gem-chip', Math.min(6, 2 + Math.floor(combo / 4)), 'gem', function () { W.Sound.gem(); });
      if (c) setTimeout(function () { shout(c, x, r.top); }, 90);
    }
  };

  /* --------------------------- haptics ----------------------------- */
  var baseCorrect = W.Sound.correct, baseWrong = W.Sound.wrong;
  W.Sound.correct = function () { haptic(12); return baseCorrect.apply(this, arguments); };
  W.Sound.wrong = function () { haptic([20, 50, 20]); return baseWrong.apply(this, arguments); };

  /* ------------------------ HUD count-up --------------------------- */
  var shownGems = null, shownLevel = null, tween = 0;

  function countGems(from, to) {
    var el = doc.getElementById('hud-gems');
    if (!el) return;
    cancelAnimationFrame(tween);
    var t0 = performance.now(), dur = Math.min(1100, 450 + (to - from) * 6);
    (function step(t) {
      var k = Math.min(1, (t - t0) / dur);
      el.textContent = Math.round(from + (to - from) * easeOut(k)).toLocaleString();
      if (k < 1) tween = requestAnimationFrame(step);
      else el.textContent = to.toLocaleString();
    })(t0);
  }

  function wrapHud() {
    var UI = global.UI;
    if (!UI || !UI.refreshHud || UI.refreshHud.jz) return;
    var base = UI.refreshHud;
    UI.refreshHud = function () {
      var out = base.apply(this, arguments);
      var e = W.state && W.state.economy;
      if (!e) return out;
      doc.documentElement.classList.toggle('jz-off', !on());
      if (shownGems !== null && e.diamonds > shownGems && on()) {
        countGems(shownGems, e.diamonds);
      }
      if (shownLevel !== null && e.level > shownLevel && on()) {
        var chip = doc.getElementById('hud-xp-chip');
        var bar = doc.getElementById('hud-xpbar');
        [chip, bar].forEach(function (n) {
          if (!n) return;
          n.classList.remove('jz-lvl');
          void n.offsetWidth;
          n.classList.add('jz-lvl');
        });
      }
      shownGems = e.diamonds;
      shownLevel = e.level;
      return out;
    };
    UI.refreshHud.jz = true;
  }

  /* --------------------------- level up ---------------------------- */
  function levelUp(card) {
    if (card.jz) return;
    card.jz = true;
    var ring = card.querySelector('.levelup__ring');
    if (!ring) return;
    var rays = doc.createElement('div');
    rays.className = 'jz-rays';
    rays.setAttribute('aria-hidden', 'true');
    card.insertBefore(rays, card.firstChild);
    var tag = doc.createElement('div');
    tag.className = 'jz-lvl-tag';
    tag.textContent = 'Level up!';
    card.insertBefore(tag, ring);
    if (!on()) return;

    var lvl = parseInt(ring.textContent, 10);
    if (lvl > 1) {
      ring.textContent = String(lvl - 1);
      setTimeout(function () {
        ring.animate([
          { transform: 'scale(1)' }, { transform: 'scale(.82)', offset: 0.35 }, { transform: 'scale(1.14)', offset: 0.7 }, { transform: 'scale(1)' }
        ], { duration: 520, easing: SPRING });
        setTimeout(function () { ring.textContent = String(lvl); }, 180);
        var r = ring.getBoundingClientRect();
        shockwave(r.left + r.width / 2, r.top + r.height / 2, true);
        sparkles(r.left + r.width / 2, r.top + r.height / 2, 16);
      }, 420);
    }
    var h = global.innerHeight, w = global.innerWidth;
    setTimeout(function () {
      W.confetti({ x: 0, y: h, angle: -Math.PI / 3, spread: 0.7, count: 70, power: 520 });
      W.confetti({ x: w, y: h, angle: -Math.PI * 2 / 3, spread: 0.7, count: 70, power: 520 });
    }, 300);
    haptic([30, 60, 30, 60, 60]);
  }

  /* -------------------------- game over ---------------------------- */
  function countUp(el, delay) {
    var final = el.textContent;
    var p = parseCount(final);
    if (!p || p.n <= 0) return;
    el.textContent = formatCount(p, 0);
    var t0 = null, dur = 900;
    setTimeout(function () {
      requestAnimationFrame(function step(t) {
        if (t0 === null) t0 = t;
        var k = Math.min(1, (t - t0) / dur);
        el.textContent = formatCount(p, p.n * easeOut(k));
        if (k < 1) requestAnimationFrame(step);
        else {
          el.textContent = final;
          el.animate([{ transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 380, easing: SPRING });
        }
      });
    }, delay);
  }

  function gameOver(card) {
    if (card.jz || !on()) return;
    card.jz = true;
    Array.prototype.forEach.call(card.querySelectorAll('.gd-stats b'), function (b, i) { countUp(b, 220 + i * 140); });
    var eb = card.querySelector('.gd-card__eyebrow');
    if (eb && /new best/i.test(eb.textContent)) {
      card.classList.add('jz-best');
      setTimeout(function () {
        var r = card.getBoundingClientRect();
        W.confetti({ x: r.left + r.width / 2, y: r.top + 30, count: 80, power: 300 });
        W.Sound.levelUp();
        haptic([20, 40, 40]);
      }, 260);
    }
  }

  function scan(node) {
    if (node.nodeType !== 1) return;
    if (node.matches('.levelup')) levelUp(node);
    else if (node.matches('.gd-card--over')) gameOver(node);
    if (!node.firstElementChild) return;
    Array.prototype.forEach.call(node.querySelectorAll('.levelup'), levelUp);
    Array.prototype.forEach.call(node.querySelectorAll('.gd-card--over'), gameOver);
  }

  function start() {
    wrapHud();
    var e = W.state && W.state.economy;
    if (e) { shownGems = e.diamonds; shownLevel = e.level; }
    new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        var added = records[i].addedNodes;
        for (var j = 0; j < added.length; j++) scan(added[j]);
      }
    }).observe(doc.body, { childList: true, subtree: true });
  }

  api.burst = function (x, y, combo) { var c = callout(combo); shockwave(x, y, !!c); sparkles(x, y, 10); if (c) shout(c, x, y); };

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start);
  else start();
})(window);
