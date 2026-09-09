/* ------------------------------------------------------------------
   LearnGeo — bootstrap: landing wiring and routing.

   There are no accounts. Everything — progress, diamonds, purchases,
   settings — lives in this browser's localStorage under one key, so the
   app opens straight into study with nothing to sign into.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons;

  function init() {
    /* ---- mode switcher, built for the current role ---- */
    global.UI.refreshTabs();

    var pex = document.getElementById('preview-exit');
    if (pex) pex.addEventListener('click', global.UI.endPreview);

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

    var tcta = document.getElementById('teacher-cta');
    if (tcta) tcta.addEventListener('click', function () {
      global.UI.showApp('portal');
      global.Teacher.becomeTeacher();
    });

    global.UI.watchTabs();

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
