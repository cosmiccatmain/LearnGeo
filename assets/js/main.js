/* ------------------------------------------------------------------
   LearnGeo — bootstrap: landing wiring and routing.

   There are no accounts. Everything — progress, diamonds, purchases,
   settings — lives in this browser's localStorage under one key, so the
   app opens straight into study with nothing to sign into.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons;

  var TABS = [
    { view: 'portal', icon: I.grid,   label: 'Home' },
    { view: 'learn',  icon: I.book,   label: 'Learn' },
    { view: 'test',   icon: I.clip,   label: 'Practice test' },
    { view: 'quiz',   icon: I.target, label: 'Class quiz' },
    { view: 'cards',  icon: I.cards,  label: 'Flashcards' }
  ];

  function init() {
    /* ---- mode switcher ---- */
    TABS.forEach(function (t) {
      var btn = document.querySelector('.tab[data-view="' + t.view + '"]');
      if (!btn) return;
      btn.innerHTML = t.icon + '<span>' + t.label + '</span>';
      btn.addEventListener('click', function () { global.UI.go(t.view); });
    });

    /* ---- every landing CTA opens the app directly ---- */
    W.$$('[data-launch]').forEach(function (b) {
      b.addEventListener('click', function () { global.UI.showApp(b.dataset.launch); });
    });

    /* ---- "continue" only means anything once there is progress ---- */
    var cont = document.getElementById('nav-continue');
    if (cont) {
      var s = W.state;
      var resumable = s.stats.answered > 0 || s.economy.level > 1;
      cont.classList.toggle('hidden', !resumable);
      cont.textContent = resumable
        ? 'Continue · Lv ' + s.economy.level
        : 'Continue';
      cont.addEventListener('click', function () { global.UI.showApp('portal'); });
    }

    var av = document.getElementById('avatar-btn');
    if (av) av.addEventListener('click', function (e) { e.stopPropagation(); global.UI.toggleMenu(); });

    var home = document.getElementById('home-btn');
    if (home) home.addEventListener('click', function () { global.UI.go('portal'); });

    var counts = global.GeoData.counts;
    countUp('s-total', counts.total);
    countUp('s-members', counts.members);

    W.touchDaily();
    global.UI.refreshHud();

    window.addEventListener('resize', function () { global.GeoMap.invalidate(); });
  }

  function countUp(id, n) {
    var el = document.getElementById(id);
    if (!el) return;
    var start = performance.now(), dur = 900;
    (function step(now) {
      var p = Math.min(1, (now - start) / dur);
      el.textContent = Math.round(n * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step);
    })(start);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
