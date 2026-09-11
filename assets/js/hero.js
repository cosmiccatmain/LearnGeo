/* ------------------------------------------------------------------
   LearnGeo — the moving backdrop behind the hero headline.

   Every capital in the dataset, projected flat and drawn as a dot, so
   the shape behind the words is the actual world: Europe crowded, the
   Pacific nearly empty, the Americas running down one side.

   Nothing is fetched for this. The coordinates are already in memory
   from data.js, which is why the hero can move without the megabyte of
   outlines the study centre's map needs.

   The wave is pure CSS: each dot's animation-delay comes from its
   longitude, so brightness travels west to east on its own with no
   timer running behind it.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';

  /* Cropped to the inhabited band, same idea as worldmap.js but wider and
     shorter: this is a strip behind a headline, not a map to read. */
  var VB_W = 1000, LAT_TOP = 74, LAT_BOT = -56;
  var K = VB_W / 360;
  var VB_H = Math.round((LAT_TOP - LAT_BOT) * K);
  var SWEEP = 7;        /* seconds for the wave to cross the world */

  function build() {
    var list = global.GeoData && global.GeoData.countries;
    if (!list || !list.length) return '';

    var dots = list.map(function (c) {
      var x = (c.lon + 180) * K;
      var y = (LAT_TOP - c.lat) * K;
      if (y < 0 || y > VB_H) return '';

      /* A stable per-country jitter, so the field does not look like a
         grid and the wave does not arrive as one hard line. */
      var h = 0, i;
      for (i = 0; i < c.name.length; i++) h = (h * 31 + c.name.charCodeAt(i)) % 997;
      var r = 2 + (h % 5) * 0.34;
      var delay = (x / VB_W) * SWEEP + (h % 17) * 0.06;

      return '<circle class="hero-dot" cx="' + Math.round(x * 10) / 10 +
        '" cy="' + Math.round(y * 10) / 10 + '" r="' + Math.round(r * 100) / 100 +
        '" style="--d:' + (Math.round(delay * 100) / 100) + 's"/>';
    }).join('');

    /* meet, not slice: cropping the sides would throw away the Americas and
       the Pacific, and the whole point is that the shape is the real world. */
    return '<svg viewBox="0 0 ' + VB_W + ' ' + VB_H + '" preserveAspectRatio="xMidYMid meet" ' +
      'aria-hidden="true" focusable="false">' + dots + '</svg>';
  }

  function mount() {
    var host = document.getElementById('hero-sky');
    if (!host) return;
    var svg = build();
    if (!svg) return;
    host.innerHTML = svg;
    host.classList.add('is-live');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();

  global.Hero = { mount: mount };
})(window);
