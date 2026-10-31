/* ------------------------------------------------------------------
   LearnGeo — the landing headline.

   The line reads "LearnGeo for …", and the last phrase cycles through
   the reasons people use it. Every phrase sits in the same grid cell, so
   the headline keeps its width and height as it changes. Screen readers
   get one sentence from the markup instead of the whole cycle.

   With reduced motion the first phrase stays put.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';

  var EVERY = 2600;        /* ms each phrase stays up */

  function mount() {
    var stack = document.querySelector('[data-cycle]');
    if (!stack || stack.children.length < 2) return;
    if (global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    var items = stack.children, i = 0;
    global.setInterval(function () {
      items[i].classList.remove('is-on');
      i = (i + 1) % items.length;
      items[i].classList.add('is-on');
    }, EVERY);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})(window);
