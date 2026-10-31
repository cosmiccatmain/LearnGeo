/* ------------------------------------------------------------------
   LearnGeo — the cut gem in the landing hero.

   A brilliant-cut stone built from flat facets and drawn to a canvas.
   Each facet is shaded by how squarely it faces the light, and only the
   facets turned toward the viewer are painted, back to front. That is
   enough to read as a solid stone with no 3D library behind it.

   It turns slowly and leans toward the pointer. It stops while it is off
   screen or in a background tab, and with reduced motion it is drawn once
   and left still.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';

  var SPIN = 0.22;         /* radians per second around the vertical axis */
  var TILT = 0.28;         /* resting tilt, so the table is seen at an angle */
  var LEAN = 0.45;         /* how far the pointer can swing it, in radians */
  var EASE = 0.06;         /* how quickly it catches up to the pointer */
  var CAM = 7;             /* viewer distance; larger is flatter */
  var FILL = 0.34;         /* stone radius as a share of the canvas width */

  var DEEP = [6, 18, 96], MID = [27, 77, 255], HI = [214, 230, 255];
  var CYAN = [70, 210, 255], VIOLET = [130, 96, 255];

  var LIGHT = norm([-0.5, 0.75, 0.6]);
  var HALF = norm([LIGHT[0], LIGHT[1], LIGHT[2] + 1]);   /* light + viewer, for the glint */

  var canvas, ctx, verts = [], faces = [];
  var raf = null, running = false, onScreen = true, reduced = false;
  var size = 0, dpr = 1, last = 0;
  var spin = 0, leanX = 0, leanY = 0, targetX = 0, targetY = 0;

  /* ============================ vectors ============================= */
  function norm(v) {
    var l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    return [v[0] / l, v[1] / l, v[2] / l];
  }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function mix(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }

  /* ============================ the stone =========================== */
  /* Eight-fold, so it reads as a brilliant cut: a girdle ring at radius 1,
     a flat table inside it, a star point in each crown bay, and a point at
     the bottom with a mid-pavilion point in each bay. Indices: girdle 0-7,
     table corners 8-15, star points 16-23, mid-pavilion 24-31, table
     centre 32, culet 33. */
  function build() {
    var girdle = [], table = [], star = [], mid = [], k, a, k1;
    for (k = 0; k < 8; k++) {
      a = k * Math.PI / 4;
      girdle.push([Math.cos(a), 0, Math.sin(a)]);
      table.push([0.58 * Math.cos(a), 0.62, 0.58 * Math.sin(a)]);
      a += Math.PI / 8;
      star.push([0.82 * Math.cos(a), 0.3, 0.82 * Math.sin(a)]);
      mid.push([0.5 * Math.cos(a), -0.55, 0.5 * Math.sin(a)]);
    }
    verts = girdle.concat(table, star, mid, [[0, 0.62, 0], [0, -1.15, 0]]);
    faces = [];
    for (k = 0; k < 8; k++) {
      k1 = (k + 1) % 8;
      add(32, 8 + k, 8 + k1);                    /* table */
      add(16 + k, 8 + k, 8 + k1);                /* crown: four facets fanned round each star point */
      add(16 + k, 8 + k1, k1);
      add(16 + k, k1, k);
      add(16 + k, k, 8 + k);
      add(24 + k, k, k1);                        /* pavilion */
      add(24 + k, k1, 33);
      add(24 + k, 33, k);
    }
  }

  function add(a, b, c) {
    var pa = verts[a], pb = verts[b], pc = verts[c];
    var n = norm(cross(sub(pb, pa), sub(pc, pa)));
    var centre = [(pa[0] + pb[0] + pc[0]) / 3, (pa[1] + pb[1] + pc[1]) / 3, (pa[2] + pb[2] + pc[2]) / 3];
    if (dot(n, centre) < 0) n = [-n[0], -n[1], -n[2]];   /* point outward */
    faces.push({ v: [a, b, c], n: n, c: centre, j: ((faces.length * 7919) % 17) / 8 - 1 });
  }

  /* ============================ drawing ============================= */
  /* Rotate a point, or a direction, by the current spin and lean. */
  function turn(p, cy, sy, cx, sx) {
    var x = p[0] * cy + p[2] * sy;
    var z = -p[0] * sy + p[2] * cy;
    return [x, p[1] * cx - z * sx, p[1] * sx + z * cx];
  }

  /* Facets are coloured in the app's blue, with a little cyan and violet
     from one facet to the next so the stone looks cut rather than painted. */
  function tone(b, j, glint) {
    var c = b < 0.55 ? mix(DEEP, MID, b / 0.55) : mix(MID, HI, (b - 0.55) / 0.45);
    c = j > 0 ? mix(c, CYAN, 0.14 * j) : mix(c, VIOLET, -0.14 * j);
    c = mix(c, [255, 255, 255], Math.min(1, glint * 0.9));
    return 'rgb(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ')';
  }

  function draw() {
    if (!ctx || !size) return;
    var cy = Math.cos(spin + leanY), sy = Math.sin(spin + leanY);
    var cx = Math.cos(TILT + leanX), sx = Math.sin(TILT + leanX);
    var half = size / 2, scale = size * FILL;
    var eye = [0, 0, CAM];
    var P = verts.map(function (p) { return turn(p, cy, sy, cx, sx); });
    var visible = [];

    faces.forEach(function (f) {
      var n = turn(f.n, cy, sy, cx, sx);
      var c = turn(f.c, cy, sy, cx, sx);
      if (dot(n, sub(eye, c)) > 0) visible.push({ f: f, n: n, z: c[2] });   /* only what faces the viewer */
    });
    visible.sort(function (a, b) { return a.z - b.z; });                     /* far facets first */

    ctx.clearRect(0, 0, size, size);
    visible.forEach(function (it) {
      var d = Math.max(0, dot(it.n, LIGHT));
      var glint = Math.pow(Math.max(0, dot(it.n, HALF)), 26);
      ctx.beginPath();
      it.f.v.forEach(function (i, k) {
        var p = P[i], s = CAM / (CAM - p[2]);
        var x = half + p[0] * s * scale;
        var y = half - (p[1] + 0.265) * s * scale;   /* 0.265 centres the stone, which sits low */
        if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      });
      ctx.closePath();
      ctx.fillStyle = tone(0.12 + 0.88 * d, it.f.j, glint);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = 1;
      ctx.stroke();
    });
  }

  /* ============================ motion ============================== */
  function frame(t) {
    raf = null;
    if (!running) return;
    var dt = last ? Math.min(0.1, (t - last) / 1000) : 0;
    last = t;
    spin += SPIN * dt;
    leanX += (targetX - leanX) * EASE;
    leanY += (targetY - leanY) * EASE;
    draw();
    raf = global.requestAnimationFrame(frame);
  }

  /* Only turn while it can be seen: not with reduced motion asked for, not
     scrolled off the screen, and not in a background tab. */
  function wanted() {
    return !reduced && onScreen && !document.hidden;
  }

  function sync() {
    var want = wanted();
    if (want === running) return;
    running = want;
    if (want) {
      last = 0;                       /* no catch-up leap after a pause */
      raf = global.requestAnimationFrame(frame);
    } else if (raf) {
      global.cancelAnimationFrame(raf);
      raf = null;
    }
  }

  function point(e) {
    var x = e.clientX / global.innerWidth - 0.5;
    var y = e.clientY / global.innerHeight - 0.5;
    targetY = x * LEAN * 2;
    targetX = y * LEAN;
  }

  function resize() {
    size = canvas.getBoundingClientRect().width;
    if (!size) return;
    dpr = Math.min(2, global.devicePixelRatio || 1);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!running) draw();
  }

  /* ============================== start ============================= */
  function mount() {
    canvas = document.getElementById('hero-gem');
    if (!canvas || !canvas.getContext) return;
    ctx = canvas.getContext('2d');
    if (!ctx) return;

    reduced = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    build();
    resize();
    canvas.parentNode.classList.add('is-live');

    if (global.IntersectionObserver) {
      new global.IntersectionObserver(function (entries) {
        onScreen = entries.some(function (e) { return e.isIntersecting; });
        sync();
      }, { rootMargin: '120px' }).observe(canvas);
    }
    document.addEventListener('visibilitychange', sync);
    global.addEventListener('pointermove', point, { passive: true });
    global.addEventListener('resize', resize, { passive: true });
    sync();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();

  global.HeroGem = { mount: mount };
})(window);
