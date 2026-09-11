/* ------------------------------------------------------------------
   LearnGeo — bootstrap: landing wiring and routing.

   There are no accounts. Everything — progress, diamonds, purchases,
   settings — lives in this browser's localStorage under one key, so the
   app opens straight into study with nothing to sign into.

   Which of the two landing pages someone came from is what decides
   whether they get the student screens or teacher mode. index.html is
   the student page, so every button on it says "student"; teachers.html
   links in with ?role=teacher. The first-run question is only asked of
   someone who reached the app without passing either.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW;

  function param(name) {
    var m = new RegExp('[?&]' + name + '=([^&]*)').exec(global.location.search);
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
  }

  function setRole(role) {
    W.state.role = role === 'teacher' ? 'teacher' : 'student';
    W.state.roleChosen = true;
    W.saveNow();
  }

  function init() {
    /* ---- mode switcher, built for the current role ---- */
    global.UI.refreshTabs();

    var pex = document.getElementById('preview-exit');
    if (pex) pex.addEventListener('click', global.UI.endPreview);

    /* ---- every landing CTA opens the app directly ---- */
    W.$$('[data-launch]').forEach(function (b) {
      b.addEventListener('click', function () {
        setRole('student');                    /* this is the student page */
        global.UI.showApp(b.dataset.launch);
      });
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
    landingMaps();
    openFromUrl();

    window.addEventListener('resize', function () { global.GeoMap.invalidate(); });
  }

  /* ---- teachers.html and the join links hand the role over in the URL ---- */
  function openFromUrl() {
    var role = param('role'), view = param('view');
    if (!role && !view) return;

    /* the query has done its job; a refresh should not replay it */
    if (global.history && global.history.replaceState) {
      global.history.replaceState({}, '', global.location.pathname);
    }

    if (role) setRole(role);
    if (role === 'teacher') {
      global.UI.showApp('portal');
      global.Teacher.becomeTeacher();
      return;
    }
    global.UI.showApp(view || 'portal');
  }

  /* ---- the two maps on the landing page ----
     The outlines are 1.3 MB, which is not worth spending on a visitor who
     never scrolls that far, so neither map is drawn until it is about to
     come into view. */
  function landingMaps() {
    draw('landing-map', { mode: 'sample', label: 'A world map with most of the Americas and Europe filled in' });
    draw('learn-shot-map', {
      mode: 'demo', focus: 'Slovenia', highlight: 'Slovenia', span: 30, ratio: 1.15,
      label: 'Slovenia shaded on the map'
    });

    function draw(id, opts) {
      var el = document.getElementById(id);
      if (!el || !global.WorldMap) return;
      var done = false;

      function go() {
        if (done) return;
        done = true;
        if (io) io.disconnect();
        global.WorldMap.paint(el, opts);
      }

      var io = global.IntersectionObserver && new global.IntersectionObserver(function (entries) {
        if (entries.some(function (e) { return e.isIntersecting; })) go();
      }, { rootMargin: '300px' });

      if (io) io.observe(el); else return go();

      /* An observer that never fires leaves an empty grey box on the page,
         and there are several ways for that to happen: a prerender, a tab
         opened in the background and never painted, printing. Anyone still
         here after a few seconds is reading, so draw it regardless and let
         the observer win the race whenever it can. A page that is not on
         screen waits instead of spending a megabyte nobody asked for. */
      function later() {
        if (document.visibilityState !== 'hidden') return go();
        document.addEventListener('visibilitychange', function seen() {
          if (document.visibilityState === 'hidden') return;
          document.removeEventListener('visibilitychange', seen);
          setTimeout(later, 4000);
        });
      }
      setTimeout(later, 4000);
    }
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
