/* ------------------------------------------------------------------
   LearnGeo — bootstrap: landing wiring and routing.

   Accounts are optional. A guest's progress lives in this browser's
   localStorage, so the app opens straight into study with nothing to sign
   into; signing in (cloud.js) mirrors the same save to Supabase.

   There are two landing pages. index.html is the student one and carries
   the app shell; teachers.html is marketing only and links in here with
   ?role=teacher. A guest arriving that way has said which they are, so
   the first-run question stays out of their way. A signed-in account
   carries its own role and the URL is not allowed to override it.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW;

  function param(name) {
    var m = new RegExp('[?&]' + name + '=([^&]*)').exec(global.location.search);
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
  }

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

  /* ---- teachers.html hands the role over in the URL ----
     An account's role is its own business, so a save that belongs to one is
     left alone: the link can open a view but never change who you are. */
  function openFromUrl() {
    var role = param('role'), view = param('view');
    if (!role && !view) return;

    /* the query has done its job; a refresh should not replay it */
    if (global.history && global.history.replaceState) {
      global.history.replaceState({}, '', global.location.pathname);
    }

    if (role && !W.accountId()) {
      W.state.role = role === 'teacher' ? 'teacher' : 'student';
      W.state.roleChosen = true;
      W.saveNow();
    }

    if (W.state.role === 'teacher') {
      global.UI.showApp('teacher');
      global.Teacher.becomeTeacher();
      return;
    }
    global.UI.showApp(view || 'portal');
  }

  /* ---- the two maps on the landing page ----
     The outlines are a megabyte, which is not worth spending on a visitor
     who never scrolls that far, so neither map is drawn until it is about
     to come into view. */
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
