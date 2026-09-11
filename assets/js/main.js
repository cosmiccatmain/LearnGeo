/* ------------------------------------------------------------------
   LearnGeo — bootstrap: landing wiring and routing.

   Accounts are optional. A guest's progress lives in this browser's
   localStorage, so the app opens straight into study with nothing to sign
   into; signing in (cloud.js) mirrors the same save to Supabase.
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
    if (cont) cont.addEventListener('click', function () { global.UI.showApp('portal'); });

    /* ---- accounts are optional: guests carry on exactly as before ---- */
    var signin = document.getElementById('nav-signin');
    if (signin) signin.addEventListener('click', function () {
      if (global.Cloud && global.Cloud.signedIn) global.UI.showApp('portal');
      else global.UI.openAuth('signin');
    });
    global.UI.refreshLanding();
    if (global.Cloud) global.Cloud.init();

    var tcta = document.getElementById('teacher-cta');
    if (tcta) tcta.addEventListener('click', function () {
      /* settle the role first, or "who is using LearnGeo" pops up over the class */
      W.state.role = 'teacher';
      W.state.roleChosen = true;
      W.saveNow();
      global.UI.showApp('teacher');
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
