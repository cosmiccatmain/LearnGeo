/* ------------------------------------------------------------------
   LearnGeo — the whole world as one inline SVG.

   The same country outlines the study modes draw over Leaflet, but flat:
   projected once into a fixed viewBox, snapped to a coarse grid and kept
   as path strings at module level. No Leaflet, no tiles, and nothing over
   the network after the outlines have been read once.

   Colour carries the only meaning here: what you have mastered, what you
   have merely met, and what you have never been asked about.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW;

  /* Equirectangular, cropped to the inhabited band. The outlines run from
     Ushuaia at 55.9°S to northern Greenland at 83.6°N, so everything past
     those is empty ocean and is left out rather than drawn. */
  var VB_W = 760, LAT_TOP = 84, LAT_BOT = -58;
  var SCALE = VB_W / 360;
  var VB_H = Math.round((LAT_TOP - LAT_BOT) * SCALE);   /* 300 */

  /* The picture is never drawn much wider than its viewBox, so anything
     finer than a whole unit is detail nobody can see. Snapping to that grid
     and dropping the points which land on top of each other takes the
     outlines from around 900 KB of path data to around 190 KB. */
  var SNAP = 1;
  var MIN_SPAN = 1;   /* a ring smaller than this on both axes is dropped */

  function px(lon) { return (lon + 180) * SCALE; }
  function py(lat) { return (LAT_TOP - lat) * SCALE; }
  function round(n) { return Math.round(n * 10) / 10; }

  /* ============================ geometry ============================
     name -> { d: 'M…Z' } for anything with a usable outline, or
     { x, y } for the microstates that disappear at this resolution.
     Every one of the 213 is in here either way, so every one can be
     coloured. Built once; re-renders only ever change classes.
  -------------------------------------------------------------------*/
  var geometry = null, buildPromise = null, cache = {};

  function load() {
    if (buildPromise) return buildPromise;
    buildPromise = global.GeoMap.loadShapes().then(function (shapes) {
      var out = {};
      global.GeoData.countries.forEach(function (c) {
        var f = shapes && shapes[c.name];
        var d = f ? pathFor(f.geometry) : '';
        out[c.name] = d ? { d: d } : { x: px(c.lon), y: py(c.lat) };
      });
      geometry = out;
      cache = {};
      return out;
    });
    return buildPromise;
  }

  function pathFor(g) {
    if (!g) return '';
    var rings = [], out = '', i;
    if (g.type === 'Polygon') rings = g.coordinates;
    else if (g.type === 'MultiPolygon') {
      for (i = 0; i < g.coordinates.length; i++) rings = rings.concat(g.coordinates[i]);
    }
    for (i = 0; i < rings.length; i++) out += ringPath(rings[i]);
    return out;
  }

  function ringPath(ring) {
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    var xs = [], ys = [], i, x, y;
    for (i = 0; i < ring.length; i++) {
      x = px(ring[i][0]); y = py(ring[i][1]);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      xs.push(x); ys.push(y);
    }
    /* an island this small is one pixel of noise; the country still gets a
       dot of its own if this was the only ring it had */
    if (maxX - minX < MIN_SPAN && maxY - minY < MIN_SPAN) return '';

    /* A ring that crosses the antimeridian arrives with a point near +180
       followed by one near -180. Joined up as written that is a straight
       line back across the whole map, which is why Russia and the Aleutians
       painted a band over everything above them. A step of more than half
       the world is that seam and nothing else, so the ring is cut there and
       carries on as a separate subpath. */
    var runs = [], run = [], lastX = null, lastY = null, sx, sy;
    for (i = 0; i < xs.length; i++) {
      sx = Math.round(xs[i] / SNAP) * SNAP;
      sy = Math.round(ys[i] / SNAP) * SNAP;
      if (sx === lastX && sy === lastY) continue;
      if (lastX !== null && Math.abs(sx - lastX) > VB_W / 2) { runs.push(run); run = []; }
      run.push(sx + ' ' + sy);
      lastX = sx; lastY = sy;
    }
    runs.push(run);

    var d = '';
    for (i = 0; i < runs.length; i++) {
      if (runs[i].length >= 3) d += 'M' + runs[i].join(' ') + 'Z';
    }
    return d;
  }

  /* ============================ colouring ===========================
     The same three bands masteredCount() counts with: box 4 of 5 is where
     the app draws the line, so the map draws it in the same place.
  -------------------------------------------------------------------*/
  function stateOf(name) {
    var m = W.state.mastery[name];
    if (!m) return '';
    return m.box >= 4 ? 'is-mastered' : 'is-seen';
  }

  /* A worked example for the landing page. A visitor has no progress, and
     an all-grey world sells the app badly, so the marketing shot shows what
     a term's work looks like: the Americas and Europe done, Africa started.
     The 89 it adds up to is the number printed beside it. */
  var SAMPLE = {
    'Europe': 'is-mastered', 'South America': 'is-mastered', 'North America': 'is-mastered',
    'Africa': 'is-seen'
  };

  function classOf(c, opts) {
    if (opts.mode === 'pale') return '';
    if (opts.mode === 'sample') return SAMPLE[c.region] || '';
    if (opts.mode === 'demo') return c.name === opts.highlight ? (opts.lit || 'is-target') : '';
    return stateOf(c.name);
  }

  /* What the picture currently says, in one short string, so that opening
     the study centre again with nothing changed costs nothing. */
  function signature(opts) {
    if (opts.mode && opts.mode !== 'mastery') return opts.mode + ':' + (opts.highlight || '');
    var m = W.state.mastery, seen = 0, done = 0;
    Object.keys(m).forEach(function (k) { seen += 1; if (m[k].box >= 4) done += 1; });
    return 'mastery:' + seen + ':' + done;
  }

  /* ============================== render ============================ */
  /* A crop around one country, for the landing page's single-country shot.
     Measured off the capital rather than the outline, which keeps it
     working for the two places that have no polygon at all. */
  function viewBox(opts) {
    var full = '0 0 ' + VB_W + ' ' + VB_H;
    if (!opts.focus) return full;
    var c = global.GeoData.countries.filter(function (x) { return x.name === opts.focus; })[0];
    if (!c) return full;
    var w = (opts.span || 26) * SCALE;
    var h = w * (opts.ratio || 0.66);
    var x = Math.max(0, Math.min(VB_W - w, px(c.lon) - w / 2));
    var y = Math.max(0, Math.min(VB_H - h, py(c.lat) - h / 2));
    return round(x) + ' ' + round(y) + ' ' + round(w) + ' ' + round(h);
  }

  function shapes(opts) {
    var out = '';
    global.GeoData.countries.forEach(function (c) {
      var g = geometry[c.name];
      if (!g) return;
      var cls = 'wm__c ' + classOf(c, opts);
      var attrs = ' class="' + cls.trim() + '" data-c="' + W.escapeHtml(c.name) + '"';
      var title = '<title>' + W.escapeHtml(c.name + ' · ' + c.capital) + '</title>';
      out += g.d
        ? '<path' + attrs + ' d="' + g.d + '">' + title + '</path>'
        : '<circle' + attrs + ' cx="' + round(g.x) + '" cy="' + round(g.y) + '" r="2.2">' +
            title + '</circle>';
    });
    return out;
  }

  /* One picture as a string. The study centre and the landing page both
     draw from here, which is why the outlines are only ever projected once. */
  function svg(opts) {
    opts = opts || {};
    var view = viewBox(opts);
    var key = view + '|' + signature(opts) + '|' + (opts.fit || '') + '|' + (opts.lit || '');
    if (cache[key]) return cache[key];

    var out = '<svg class="wm__svg" viewBox="' + view + '" preserveAspectRatio="xMidYMid ' +
        (opts.fit === 'fill' ? 'slice' : 'meet') + '" ' +
        'role="img" aria-label="' + W.escapeHtml(opts.label || 'World map') + '">' +
        (geometry ? shapes(opts) : '') +
      '</svg>';
    if (geometry) cache[key] = out;
    return out;
  }

  /* Draw into a host element, and draw again once the outlines land. The
     caller never waits on the fetch: the panel is on screen either way,
     pale until the world arrives. */
  function paint(host, opts) {
    if (!host) return;
    opts = opts || {};
    host.classList.toggle('is-loading', !geometry);
    host.innerHTML = svg(opts);
    if (geometry) return;
    load().then(function () {
      if (!document.contains(host)) return;
      host.classList.remove('is-loading');
      host.innerHTML = svg(opts);
    });
  }

  global.WorldMap = {
    svg: svg,
    paint: paint,
    load: load,
    stateOf: stateOf,
    size: { w: VB_W, h: VB_H },
    get ready() { return !!geometry; }
  };
})(window);
