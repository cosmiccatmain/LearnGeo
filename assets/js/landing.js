/* ------------------------------------------------------------------
   LearnGeo — public landing helpers (LEA-65).

   Nav section highlighting and a light hero orbit parallax. Does not
   touch the signed-in app shell. Motion reveals stay in motion.js.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';

  var doc = global.document;
  var land = doc.getElementById('landing');
  if (!land || land.classList.contains('hidden')) return;

  var REDUCE = '(prefers-reduced-motion: reduce)';
  function still() {
    return !!(global.matchMedia && global.matchMedia(REDUCE).matches);
  }

  /* Active section link in the sticky nav */
  function sectionNav() {
    var links = Array.prototype.slice.call(
      land.querySelectorAll('.nav__links a[href^="#"], .nav__sheet a[href^="#"]'));
    if (!links.length) return;

    var map = {};
    links.forEach(function (a) {
      var id = (a.getAttribute('href') || '').slice(1);
      if (!id) return;
      var el = doc.getElementById(id);
      if (el) map[id] = { el: el, links: (map[id] && map[id].links) || [] };
      if (map[id]) map[id].links.push(a);
    });

    var ids = Object.keys(map);
    if (!ids.length) return;

    function setActive(id) {
      links.forEach(function (a) {
        var on = (a.getAttribute('href') || '') === '#' + id;
        a.classList.toggle('is-active', on);
        if (on) a.setAttribute('aria-current', 'true');
        else a.removeAttribute('aria-current');
      });
    }

    function pick() {
      var y = global.scrollY + 96;
      var firstTop = map[ids[0]].el.getBoundingClientRect().top + global.scrollY;
      /* Above the first nav section (still in the hero) — no active link. */
      if (y < firstTop - 40) {
        setActive('');
        return;
      }
      var current = ids[0];
      for (var i = 0; i < ids.length; i++) {
        var top = map[ids[i]].el.getBoundingClientRect().top + global.scrollY;
        if (top <= y) current = ids[i];
      }
      setActive(current);
    }

    global.addEventListener('scroll', pick, { passive: true });
    global.addEventListener('resize', pick);
    pick();
  }

  /* Soft parallax on the decorative orbit ring — atmosphere only */
  function orbitParallax() {
    if (still()) return;
    var orbit = land.querySelector('.hero__orbit');
    var hero = land.querySelector('.hero--brand');
    if (!orbit || !hero) return;

    var ticking = false;
    function frame() {
      ticking = false;
      var rect = hero.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > global.innerHeight) return;
      var mid = (rect.top + rect.bottom) / 2;
      var t = (mid - global.innerHeight / 2) / global.innerHeight;
      var y = Math.max(-18, Math.min(18, t * -28));
      orbit.style.transform = 'translate(-50%, calc(-50% + ' + y.toFixed(1) + 'px))';
    }
    function onScroll() {
      if (!ticking) {
        ticking = true;
        global.requestAnimationFrame(frame);
      }
    }
    global.addEventListener('scroll', onScroll, { passive: true });
    frame();
  }

  sectionNav();
  orbitParallax();
})(window);
