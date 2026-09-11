/* ------------------------------------------------------------------
   LearnGeo — the globe behind the hero headline.

   An orthographic projection of the country outlines the app already
   ships, drawn to a canvas. Orthographic is what you get when you look
   at a sphere from far away, so this is a real globe rather than a
   picture of one: turning it means moving the point the projection is
   centred on, and the far side genuinely falls away behind the limb.

   Canvas rather than SVG because the whole thing is re-projected every
   frame. Points are thinned once at load, so a frame is arithmetic over
   a few thousand coordinates and nothing else.

   It drifts on its own and leans toward the pointer.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';

  var DEG = Math.PI / 180;
  var SPIN = 3.2;          /* degrees of longitude per second when idle */
  var LEAN_LON = 42;       /* how far the pointer can swing the globe */
  var LEAN_LAT = 26;
  var EASE = 0.055;        /* how quickly it catches up to the pointer */
  var THIN = 0.7;          /* drop points closer together than this, in degrees */

  var canvas, ctx, land = null, raf = null, sized = 0;
  var lon = -20, lat = 18;             /* where the projection is centred */
  var spin = -20, targetLon = 0, targetLat = 18;
  var last = 0, reduced = false;

  /* ============================ the outlines ======================== */
  /* Every ring as a flat [lon, lat, lon, lat, …], thinned once. Flat
     arrays because this is walked sixty times a second. */
  function prepare(shapes) {
    var out = [];
    Object.keys(shapes || {}).forEach(function (name) {
      var g = shapes[name] && shapes[name].geometry;
      if (!g) return;
      var polys = g.type === 'Polygon' ? [g.coordinates]
                : g.type === 'MultiPolygon' ? g.coordinates : [];
      polys.forEach(function (poly) {
        poly.forEach(function (ring) {
          var flat = [], px = null, py = null, i;
          for (i = 0; i < ring.length; i++) {
            var x = ring[i][0], y = ring[i][1];
            if (px !== null && Math.abs(x - px) < THIN && Math.abs(y - py) < THIN) continue;
            flat.push(x, y); px = x; py = y;
          }
          if (flat.length >= 8) out.push(flat);
        });
      });
    });
    return out;
  }

  /* ============================== drawing =========================== */
  function resize() {
    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    var w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return false;
    var key = w * 10000 + h * 10 + dpr;
    if (key === sized) return true;
    sized = key;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  }

  function draw() {
    if (!resize()) return;
    var w = canvas.clientWidth, h = canvas.clientHeight;
    var cx = w / 2, cy = h / 2;
    var r = Math.min(w, h) * 0.46;

    ctx.clearRect(0, 0, w, h);

    var sinLat = Math.sin(lat * DEG), cosLat = Math.cos(lat * DEG);

    /* the sphere: lit from the upper left so it reads as a ball */
    var sea = ctx.createRadialGradient(cx - r * 0.38, cy - r * 0.42, r * 0.08, cx, cy, r);
    sea.addColorStop(0, 'rgba(229,240,255,.96)');
    sea.addColorStop(0.55, 'rgba(198,222,252,.88)');
    sea.addColorStop(1, 'rgba(152,187,243,.72)');
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = sea;
    ctx.fill();

    graticule(cx, cy, r, sinLat, cosLat);

    /* the land */
    if (land) {
      ctx.beginPath();
      for (var i = 0; i < land.length; i++) ringPath(land[i], cx, cy, r, sinLat, cosLat);
      ctx.fillStyle = 'rgba(80,118,214,.34)';
      ctx.fill('evenodd');
      ctx.strokeStyle = 'rgba(46,86,184,.48)';
      ctx.lineWidth = 0.7;
      ctx.stroke();
    }

    /* the edge, and a breath of atmosphere just outside it */
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(64,106,200,.38)';
    ctx.lineWidth = 1;
    ctx.stroke();

    var air = ctx.createRadialGradient(cx, cy, r * 0.93, cx, cy, r * 1.1);
    air.addColorStop(0, 'rgba(126,166,244,.14)');
    air.addColorStop(1, 'rgba(120,160,240,0)');
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.1, 0, Math.PI * 2);
    ctx.fillStyle = air;
    ctx.fill();
  }

  /* One ring, cut wherever it crosses the limb so the far side does not
     get joined up across the face of the globe. */
  function ringPath(flat, cx, cy, r, sinLat, cosLat) {
    var open = false;
    for (var i = 0; i < flat.length; i += 2) {
      var dl = (flat[i] - lon) * DEG;
      var p = flat[i + 1] * DEG;
      var cosP = Math.cos(p), sinP = Math.sin(p), cosDl = Math.cos(dl);

      if (sinLat * sinP + cosLat * cosP * cosDl <= 0) { open = false; continue; }

      var x = cx + r * cosP * Math.sin(dl);
      var y = cy - r * (cosLat * sinP - sinLat * cosP * cosDl);
      if (open) ctx.lineTo(x, y);
      else { ctx.moveTo(x, y); open = true; }
    }
  }

  function graticule(cx, cy, r, sinLat, cosLat) {
    ctx.strokeStyle = 'rgba(94,132,208,.18)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    var a, t;

    for (a = -60; a <= 60; a += 30) {                 /* parallels */
      var flat = [];
      for (t = -180; t <= 180; t += 4) flat.push(t, a);
      ringPath(flat, cx, cy, r, sinLat, cosLat);
    }
    for (a = -180; a < 180; a += 30) {                /* meridians */
      var mer = [];
      for (t = -88; t <= 88; t += 4) mer.push(a, t);
      ringPath(mer, cx, cy, r, sinLat, cosLat);
    }
    ctx.stroke();
  }

  /* ============================== motion ============================ */
  function frame(now) {
    raf = global.requestAnimationFrame(frame);
    var dt = last ? Math.min((now - last) / 1000, 0.05) : 0.016;
    last = now;

    spin += SPIN * dt;
    lon += (spin + targetLon - lon) * EASE;
    lat += (targetLat - lat) * EASE;
    draw();
  }

  function point(e) {
    var x = e.clientX / global.innerWidth - 0.5;
    var y = e.clientY / global.innerHeight - 0.5;
    targetLon = x * LEAN_LON;
    targetLat = Math.max(-62, Math.min(62, 18 - y * LEAN_LAT));
  }

  /* In the app GeoMap has already read and cached the outlines, so share
     that. On the teacher page, which carries no app, read them here rather
     than pulling in the whole Leaflet wrapper for one fetch. */
  function shapes() {
    if (global.GeoMap && global.GeoMap.loadShapes) return global.GeoMap.loadShapes();
    return fetch('assets/data/countries.geo.json')
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (fc) {
        var by = {};
        fc.features.forEach(function (f) { by[f.properties.name] = f; });
        return by;
      });
  }

  /* ============================== start ============================= */
  function mount() {
    canvas = document.getElementById('hero-globe');
    if (!canvas || !canvas.getContext) return;
    ctx = canvas.getContext('2d');
    if (!ctx) return;

    reduced = global.matchMedia &&
      global.matchMedia('(prefers-reduced-motion: reduce)').matches;

    canvas.parentNode.classList.add('is-live');
    draw();                                   /* the sphere, before the land arrives */

    /* Asked for less motion: draw the globe once and leave it there, rather
       than repainting sixty times a second to show the same picture. */
    if (!reduced) {
      raf = global.requestAnimationFrame(frame);
      global.addEventListener('pointermove', point, { passive: true });
    }
    global.addEventListener('resize', function () {
      sized = 0;
      if (reduced) draw();
    }, { passive: true });

    /* The land is a megabyte, so it is never on the critical path: the
       globe is already turning by the time it lands. */
    shapes().then(function (byName) {
      land = prepare(byName);
      canvas.parentNode.classList.add('has-land');
      if (reduced) draw();
    }, function () {});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();

  global.Globe = { mount: mount, get ready() { return !!land; } };
})(window);
