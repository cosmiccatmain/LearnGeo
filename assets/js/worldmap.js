/* ------------------------------------------------------------------
   LearnGeo — the whole world as one inline SVG.

   The same country outlines the study modes draw over Leaflet, but flat:
   projected once into a fixed viewBox, simplified, and kept as path strings
   at module level. No Leaflet, no tiles, and nothing over the network after
   the outlines have been read once.

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

  /* Simplification. Douglas–Peucker drops the points that do not change the
     shape, which is the difference between a coastline and a staircase: an
     earlier version snapped every point to a whole-unit grid instead, and
     Alaska, the Canadian arctic and Greenland came out as blocks. EPS is in
     viewBox units, so at the largest size this is ever drawn it is well
     under a pixel. Roughly 900 KB of raw path data comes down to 155 KB. */
  var EPS = 0.25;
  var MIN_SPAN = 0.8;   /* a ring smaller than this on both axes is dropped */

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

  /* Three rings in the dataset walk off one side of the world and back on
     the other: Russia's mainland, one small Russian island and Fiji. Read
     literally that is a jump of nearly 360°, and joining it up draws a line
     straight back across the map. Letting the longitude keep counting past
     180 instead keeps the ring in one piece; the copy shifted a world's
     width along puts the far side back where it belongs, and the viewBox
     clips whatever hangs over the edge. */
  function unwrap(ring) {
    var out = [], prev = null, lon, i;
    for (i = 0; i < ring.length; i++) {
      lon = ring[i][0];
      if (prev !== null) {
        while (lon - prev > 180) lon -= 360;
        while (lon - prev < -180) lon += 360;
      }
      out.push([lon, ring[i][1]]);
      prev = lon;
    }
    return out;
  }

  /* Douglas–Peucker, run off a stack rather than recursively: the longest
     ring in here is nearly five thousand points. */
  function simplify(pts) {
    var n = pts.length;
    if (n < 3) return pts;
    var keep = new Uint8Array(n);
    keep[0] = 1; keep[n - 1] = 1;
    var stack = [0, n - 1], e2 = EPS * EPS;

    while (stack.length) {
      var last = stack.pop(), first = stack.pop();
      if (last - first < 2) continue;
      var ax = pts[first][0], ay = pts[first][1];
      var dx = pts[last][0] - ax, dy = pts[last][1] - ay;
      var len2 = dx * dx + dy * dy;
      var maxD = -1, idx = -1, i, x, y, t, ex, ey, d;

      for (i = first + 1; i < last; i++) {
        x = pts[i][0]; y = pts[i][1];
        if (len2 === 0) {
          ex = x - ax; ey = y - ay;
        } else {
          t = ((x - ax) * dx + (y - ay) * dy) / len2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          ex = x - (ax + t * dx); ey = y - (ay + t * dy);
        }
        d = ex * ex + ey * ey;
        if (d > maxD) { maxD = d; idx = i; }
      }
      if (maxD > e2) { keep[idx] = 1; stack.push(first, idx, idx, last); }
    }

    var out = [];
    for (var j = 0; j < n; j++) if (keep[j]) out.push(pts[j]);
    return out;
  }

  function ringPath(ring) {
    var pts = unwrap(ring);
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    var i, x, y;
    for (i = 0; i < pts.length; i++) {
      x = px(pts[i][0]); y = py(pts[i][1]);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      pts[i] = [x, y];
    }
    /* an island this small is a speck of noise; the country still gets a dot
       of its own if this was the only ring it had */
    if (maxX - minX < MIN_SPAN && maxY - minY < MIN_SPAN) return '';

    var d = subpath(simplify(pts), 0);
    if (!d) return '';
    /* a ring that ran off an edge is drawn again a world along, so the part
       that wrapped shows up on the other side instead of being lost */
    if (maxX > VB_W) d += subpath(simplify(pts), -VB_W);
    else if (minX < 0) d += subpath(simplify(pts), VB_W);
    return d;
  }

  function subpath(pts, shift) {
    var s = '', lastX = null, lastY = null, n = 0, i, x, y;
    for (i = 0; i < pts.length; i++) {
      x = round(pts[i][0] + shift); y = round(pts[i][1]);
      if (x === lastX && y === lastY) continue;
      s += (n ? ' ' : 'M') + x + ' ' + y;
      lastX = x; lastY = y; n += 1;
    }
    return n < 3 ? '' : s + 'Z';
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
     the study centre again with nothing changed costs nothing.

     Counts alone are not what the picture says: getting one mastered
     country wrong and another right leaves the same two numbers and a
     different map, and the cache would then hand back the old colours.
     So the band each country is in goes into the key as well. */
  function signature(opts) {
    if (opts.mode && opts.mode !== 'mastery') return opts.mode + ':' + (opts.highlight || '');
    var m = W.state.mastery, seen = 0, done = 0, h = 0;
    Object.keys(m).forEach(function (k) {
      var band = m[k].box >= 4 ? 2 : 1;
      seen += 1;
      if (band === 2) done += 1;
      for (var i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i) * band) | 0;
    });
    return 'mastery:' + seen + ':' + done + ':' + h;
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
