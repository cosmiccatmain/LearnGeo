/* ------------------------------------------------------------------
   LearnGeo — the relief behind the Geo Classroom headline.

   The world as a height field, seen from above and in front: land
   stands up, sea lies flat, and the whole thing is drawn as a stack of
   ridgelines running from the far edge of the map to the near one.
   Each row is filled below its own line, so it hides the rows behind
   it the way a range of hills hides the next valley.

   The heights come from the country outlines the app already ships.
   Rather than test every grid square against every polygon, the shapes
   are drawn once to a small offscreen canvas in plate carree and the
   pixels are read back — the browser's own fill does the
   point-in-polygon work, and it does it in one pass instead of a
   million. Blurring the result twice turns a coastline from a cliff
   into a slope, which is what makes it read as terrain.

   Real perspective, not a skew: the rows are points in space and the
   camera has a position, so leaning it moves near rows further than
   far ones. It drifts on its own and leans toward the pointer.

   The student page has the globe. This is the same world, opened out
   flat and stood up, so the two pages do not show the same picture.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';

  var COLS = 200;          /* samples across, west to east */
  var ROWS = 44;           /* ridgelines, north to south. Few enough that
                              the gaps read as relief and not as hatching */
  var AMP = 0.19;          /* how tall land stands, in model units. This is
                              scenery behind a headline, so the peaks stay
                              well under the line spacing of the body copy */
  var DIST = 3.05;         /* how far back the camera sits */
  var FOV = 2.20;
  var PITCH = 0.58;        /* how far down we look, radians */
  var LEAN_YAW = 0.26;     /* how far the pointer can swing it */
  var LEAN_PITCH = 0.13;
  var EASE = 0.055;        /* how quickly it catches the pointer */
  var DRIFT = 0.11;        /* radians a second of idle sway */
  var LAND = 0.17;         /* above this a sample counts as land */

  var canvas, ctx, raf = null, sized = 0, reduced = false;
  var field = null;        /* Float32Array COLS*ROWS, 0..1, or null until loaded */
  var yaw = 0, pitch = PITCH, targetYaw = 0, targetPitch = PITCH;
  var last = 0, clock = 0;

  /* scratch, reused every frame so a frame allocates nothing */
  var px = new Float64Array(COLS);
  var py = new Float64Array(COLS);
  var ph = new Float64Array(COLS);

  /* =========================== the heights ==========================
     Draw the world flat and small, then read it back as a grid. */
  function sample(byName) {
    var off = document.createElement('canvas');
    off.width = COLS; off.height = ROWS;
    var o = off.getContext('2d');
    if (!o) return null;

    o.fillStyle = '#000';
    o.fillRect(0, 0, COLS, ROWS);

    o.beginPath();
    Object.keys(byName || {}).forEach(function (name) {
      var g = byName[name] && byName[name].geometry;
      if (!g) return;
      var polys = g.type === 'Polygon' ? [g.coordinates]
                : g.type === 'MultiPolygon' ? g.coordinates : [];
      polys.forEach(function (poly) {
        poly.forEach(function (ring) {
          for (var i = 0; i < ring.length; i++) {
            var x = (ring[i][0] + 180) / 360 * COLS;
            var y = (90 - ring[i][1]) / 180 * ROWS;
            if (i) o.lineTo(x, y); else o.moveTo(x, y);
          }
          o.closePath();
        });
      });
    });
    o.fillStyle = '#fff';
    o.fill('nonzero');

    var data;
    try { data = o.getImageData(0, 0, COLS, ROWS).data; }
    catch (e) { return null; }

    var raw = new Float32Array(COLS * ROWS);
    for (var i = 0; i < COLS * ROWS; i++) raw[i] = data[i * 4] / 255;
    return blur(blur(raw));
  }

  /* A coastline one sample wide is a cliff. Two passes of this makes it
     a hill, which is the difference between a chart and a landscape. */
  function blur(src) {
    var out = new Float32Array(COLS * ROWS);
    for (var y = 0; y < ROWS; y++) {
      for (var x = 0; x < COLS; x++) {
        var sum = 0, n = 0;
        for (var dy = -1; dy <= 1; dy++) {
          var yy = y + dy;
          if (yy < 0 || yy >= ROWS) continue;
          for (var dx = -1; dx <= 1; dx++) {
            var xx = x + dx;
            if (xx < 0 || xx >= COLS) continue;
            sum += src[yy * COLS + xx]; n++;
          }
        }
        out[y * COLS + x] = sum / n;
      }
    }
    return out;
  }

  /* ============================ projection ==========================
     Model space: x runs -1..1 west to east, z runs +0.5..-0.5 far to
     near, y is height. Yaw turns the map, pitch tips it away. */
  var pjx = 0, pjy = 0;
  function project(x, y, z, cx, cy, scale) {
    var cyaw = Math.cos(yaw), syaw = Math.sin(yaw);
    var x1 = x * cyaw - z * syaw;
    var z1 = x * syaw + z * cyaw;

    var cp = Math.cos(pitch), sp = Math.sin(pitch);
    var y1 = y * cp + z1 * sp;
    var z2 = z1 * cp - y * sp + DIST;
    if (z2 < 0.25) z2 = 0.25;

    var k = (FOV / z2) * scale;
    pjx = cx + x1 * k;
    pjy = cy - y1 * k;
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
    var cx = w / 2, cy = h * 0.58;
    var scale = Math.min(w * 0.52, h * 0.92);

    ctx.clearRect(0, 0, w, h);

    var j, i;
    for (j = 0; j < ROWS; j++) {
      var z = 0.5 - (j / (ROWS - 1));          /* +0.5 far, -0.5 near */
      var depth = j / (ROWS - 1);              /* 0 far, 1 near */
      /* Nearer rows carry more weight, but the last few drop away again,
         so the front edge of the map dissolves into the page instead of
         ending on a ruled line straight across the body copy. */
      var fade = depth < 0.78 ? depth : Math.max(0, (1 - depth) / 0.22) * 0.78;

      for (i = 0; i < COLS; i++) {
        var hgt = field ? field[j * COLS + i] : 0;
        ph[i] = hgt;
        project((i / (COLS - 1)) * 2 - 1, hgt * AMP, z, cx, cy, scale);
        px[i] = pjx; py[i] = pjy;
      }

      /* the skirt: fill from the ridge straight down off the bottom of
         the canvas, so this row covers whatever is behind it */
      ctx.beginPath();
      ctx.moveTo(px[0], py[0]);
      for (i = 1; i < COLS; i++) ctx.lineTo(px[i], py[i]);
      ctx.lineTo(px[COLS - 1], h + 20);
      ctx.lineTo(px[0], h + 20);
      ctx.closePath();
      ctx.fillStyle = 'rgba(247,250,255,.97)';
      ctx.fill();

      /* the whole ridge, faint: this is the sea as much as the land */
      ctx.beginPath();
      ctx.moveTo(px[0], py[0]);
      for (i = 1; i < COLS; i++) ctx.lineTo(px[i], py[i]);
      ctx.strokeStyle = 'rgba(96,134,208,' + (0.05 + fade * 0.10).toFixed(3) + ')';
      ctx.lineWidth = 0.8;
      ctx.stroke();

      /* and again over the land only, so the continents carry the line */
      ctx.beginPath();
      var open = false;
      for (i = 0; i < COLS; i++) {
        if (ph[i] > LAND) {
          if (open) ctx.lineTo(px[i], py[i]);
          else { ctx.moveTo(px[i], py[i]); open = true; }
        } else open = false;
      }
      ctx.strokeStyle = 'rgba(37,80,190,' + (0.13 + fade * 0.26).toFixed(3) + ')';
      ctx.lineWidth = 1.05;
      ctx.stroke();
    }
  }

  /* ============================== motion ============================ */
  function frame(now) {
    raf = global.requestAnimationFrame(frame);
    var dt = last ? Math.min((now - last) / 1000, 0.05) : 0.016;
    last = now;
    clock += dt;

    var sway = Math.sin(clock * DRIFT) * 0.11;
    yaw += ((targetYaw + sway) - yaw) * EASE;
    pitch += (targetPitch - pitch) * EASE;
    draw();
  }

  function point(e) {
    var x = e.clientX / global.innerWidth - 0.5;
    var y = e.clientY / global.innerHeight - 0.5;
    targetYaw = x * LEAN_YAW;
    targetPitch = PITCH - y * LEAN_PITCH;
  }

  /* In the app GeoMap has already read and cached the outlines, so share
     that. On the teacher page, which carries no app, read them here
     rather than pulling in the whole Leaflet wrapper for one fetch. */
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
    canvas = document.getElementById('hero-relief');
    if (!canvas || !canvas.getContext) return;
    ctx = canvas.getContext('2d');
    if (!ctx) return;

    reduced = global.matchMedia &&
      global.matchMedia('(prefers-reduced-motion: reduce)').matches;

    canvas.parentNode.classList.add('is-live');
    draw();                       /* the flat sea, before the land arrives */

    /* Asked for less motion: draw it once and leave it, rather than
       repainting sixty times a second to show the same picture. */
    if (!reduced) {
      raf = global.requestAnimationFrame(frame);
      global.addEventListener('pointermove', point, { passive: true });
    }
    global.addEventListener('resize', function () {
      sized = 0;
      if (reduced) draw();
    }, { passive: true });

    /* The outlines are a megabyte, so they are never on the critical
       path: the relief is already breathing by the time they land. */
    shapes().then(function (byName) {
      field = sample(byName);
      canvas.parentNode.classList.add('has-land');
      if (reduced) draw();
    }, function () {});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();

  global.Relief = { mount: mount, get ready() { return !!field; } };
})(window);
