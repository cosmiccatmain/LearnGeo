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
  var REDUCE = '(prefers-reduced-motion: reduce)';

  function reduced() {
    return !!(global.matchMedia && global.matchMedia(REDUCE).matches);
  }

  function mount() {
    var stack = document.querySelector('.hero--brand [data-cycle], [data-cycle]');
    if (!stack || stack.children.length < 2) return;
    if (reduced()) return;

    var items = stack.children;
    var i = 0;
    var n = items.length;
    var timer = null;

    /* One phrase on; the rest off. Markup already sets the first, but
       re-assert so a partial paint or hot reload cannot leave two on. */
    for (var k = 0; k < n; k++) items[k].classList.toggle('is-on', k === 0);

    function advance() {
      if (reduced()) return;
      var from = items[i];
      i = (i + 1) % n;
      var to = items[i];
      /* Drop the outgoing class first, then force a layout read so the
         browser commits the "off" style before the next phrase turns on.
         Without the reflow some engines skip the enter transition and the
         teal line looks stuck or snaps with an empty beat. */
      from.classList.remove('is-on');
      void from.offsetWidth;
      to.classList.add('is-on');
    }

    function start() {
      if (timer != null) return;
      timer = global.setInterval(advance, EVERY);
    }

    function stop() {
      if (timer == null) return;
      global.clearInterval(timer);
      timer = null;
    }

    /* Pause while the tab is hidden — browsers throttle timers anyway, and
       restarting on visible avoids a burst of skipped frames. */
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop();
      else if (!reduced()) start();
    });

    if (global.matchMedia) {
      var mq = global.matchMedia(REDUCE);
      var onMq = function () {
        if (reduced()) {
          stop();
          for (var k = 0; k < n; k++) items[k].classList.toggle('is-on', k === 0);
          i = 0;
        } else {
          start();
        }
      };
      if (mq.addEventListener) mq.addEventListener('change', onMq);
      else if (mq.addListener) mq.addListener(onMq);
    }

    start();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})(window);
