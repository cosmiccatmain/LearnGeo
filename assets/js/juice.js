/* ------------------------------------------------------------------
   LearnGeo — juice layer.

   Payoff moments stay quiet. A right answer does not throw a shockwave,
   sparkles, or orbs. The HUD counter still ticks up. Level-up is a
   plain label. A game-over card counts its stats up without confetti.

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

  var mq = global.matchMedia ? global.matchMedia('(prefers-reduced-motion: reduce)') : null;

  function on() {
    return !(mq && mq.matches) && !!(W.state && W.state.settings && W.state.settings.effects !== false);
  }

  function haptic(p) {
    try { if (on() && global.navigator && navigator.vibrate) navigator.vibrate(p); } catch (e) { /* not allowed */ }
  }

  var baseBurst = W.burstFrom;
  W.burstFrom = function () {
    baseBurst.apply(this, arguments);
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
    /* match refreshHud: short spelling past a million */
    var fmt = function (n) { return n >= 1e6 && W.compact ? W.compact(n) : n.toLocaleString(); };
    (function step(t) {
      var k = Math.min(1, (t - t0) / dur);
      el.textContent = fmt(Math.round(from + (to - from) * easeOut(k)));
      if (k < 1) tween = requestAnimationFrame(step);
      else el.textContent = fmt(to);
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
    var tag = doc.createElement('div');
    tag.className = 'jz-lvl-tag';
    tag.textContent = 'Level up';
    card.insertBefore(tag, ring);
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
        else el.textContent = final;
      });
    }, delay);
  }

  function gameOver(card) {
    if (card.jz || !on()) return;
    card.jz = true;
    Array.prototype.forEach.call(card.querySelectorAll('.gd-stats b'), function (b, i) { countUp(b, 220 + i * 140); });
    var eb = card.querySelector('.gd-card__eyebrow');
    if (eb && /new best/i.test(eb.textContent)) card.classList.add('jz-best');
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

  api.burst = function () {};

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start);
  else start();
})(window);
