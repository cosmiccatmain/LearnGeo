/* ------------------------------------------------------------------
   LearnGeo — Geo Kart

   A procedural Three.js racer: one continuous circuit, chase camera,
   arcade handling, ordered checkpoints, bots, question boosts and a clean
   destroy path. Class authority lives in 0006_geokart.sql; position packets
   only animate remote karts and never decide results.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW;

  var active = null;
  var ROAD_HALF = 8.5;
  var CHECKPOINTS_PER_LAP = 8;
  var LAPS = 3;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function mod(v, n) { return ((v % n) + n) % n; }
  function fmt(ms) {
    if (!isFinite(ms) || ms < 0) ms = 0;
    var sec = ms / 1000;
    return Math.floor(sec / 60) + ':' + (sec % 60).toFixed(2).padStart(5, '0');
  }

  function KartRace(host, opts) {
    this.host = host;
    this.opts = opts || {};
    this.mode = this.opts.mode || 'solo';
    this.settings = this.opts.settings || {};
    this.destroyed = false;
    this.keys = {};
    this.pointerKeys = {};
    this.listeners = [];
    this.disposables = [];
    this.bots = [];
    this.remotes = {};
    this.sparks = [];
    this.speed = 0;
    this.progress = 0;
    this.lateral = 0;
    this.lateralSpeed = 0;
    this.steerVisual = 0;
    this.drifting = false;
    this.boosts = 0;
    this.boostUntil = 0;
    this.boostsUsed = 0;
    this.correct = 0;
    this.answered = 0;
    this.question = null;
    this.questionLocked = false;
    this.questionTimer = null;
    this.lastCountries = [];
    this.nextCheckpoint = 1;
    this.lastCheckpointSent = 0;
    this.startAt = this.opts.startAt || (Date.now() + 3600);
    this.raceStartedAt = this.startAt;
    this.finishedAt = 0;
    this.paused = false;
    this.menuOpen = false;
    this.stuckFor = 0;
    this.lastFrame = performance.now();
    this.lastBroadcast = 0;
    this.lastPlacement = 1;
    this.init();
  }

  KartRace.prototype.init = function () {
    if (!global.THREE) {
      this.host.innerHTML = '<div class="games-shell"><div class="kart-notice">The 3D renderer could not load. Check the network connection and reload Geo Kart.</div></div>';
      return;
    }
    var T = global.THREE;
    this.host.innerHTML =
      '<div class="geokart" tabindex="-1" aria-label="Geo Kart race">' +
        '<div class="kart-hud">' +
          '<div class="kart-stats">' +
            stat('Speed', '<span id="kart-speed">0</span> km/h') +
            stat('Position', '<span id="kart-position">1</span> / <span id="kart-field">6</span>', 'kart-stat--position') +
            stat('Lap', '<span id="kart-lap">1</span> / ' + LAPS) +
            stat('Time', '<span id="kart-time">0:00.00</span>') +
            '<div class="kart-stat"><span>Boosts</span><div class="kart-boosts">' +
              '<i class="kart-boost"></i><i class="kart-boost"></i><i class="kart-boost"></i></div></div>' +
          '</div>' +
          '<div class="kart-question" id="kart-question"></div>' +
          '<div class="kart-countdown" id="kart-countdown"></div>' +
          '<div class="kart-message hidden" id="kart-message"></div>' +
          '<button class="kart-menu-button" id="kart-menu" aria-label="Pause or race menu">☰</button>' +
          touchControls() +
          '<div id="kart-overlay"></div>' +
        '</div>' +
      '</div>';

    function stat(label, value, cls) {
      return '<div class="kart-stat ' + (cls || '') + '"><span>' + label + '</span><b>' + value + '</b></div>';
    }

    this.root = this.host.querySelector('.geokart');
    this.root.focus({ preventScroll: true });
    this.scene = new T.Scene();
    this.scene.background = new T.Color(0x78d4f5);
    this.scene.fog = new T.Fog(0x78d4f5, 90, 330);
    this.camera = new T.PerspectiveCamera(62, 1, .1, 700);
    this.renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 1.7));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.root.insertBefore(this.renderer.domElement, this.root.firstChild);

    this.buildWorld();
    this.playerKart = this.makeKart(0xef4444);
    this.scene.add(this.playerKart);
    this.buildBots();
    this.bindControls();
    this.resize();
    var self = this;
    this.resizeObserver = new ResizeObserver(function () { self.resize(); });
    this.resizeObserver.observe(this.root);

    if (this.mode === 'solo') this.nextSoloQuestion();
    else if (this.opts.snapshot) this.syncClass(this.opts.snapshot);

    this.frameId = requestAnimationFrame(function (t) { self.frame(t); });
  };

  function touchControls() {
    return '<div class="kart-touch" aria-label="Touch driving controls">' +
      '<div class="kart-touch__steer">' +
        '<button data-hold="left" aria-label="Steer left">◀</button>' +
        '<button data-hold="right" aria-label="Steer right">▶</button>' +
        '<button data-hold="drift" aria-label="Drift">DR</button>' +
      '</div>' +
      '<div class="kart-touch__pedals">' +
        '<button data-hold="brake" aria-label="Brake or reverse">▼</button>' +
        '<button data-hold="gas" aria-label="Accelerate">▲</button>' +
        '<button class="kart-touch__boost" data-press="boost" aria-label="Use boost">⚡</button>' +
      '</div>' +
    '</div>';
  }

  KartRace.prototype.buildWorld = function () {
    var T = global.THREE, scene = this.scene;
    var hemi = new T.HemisphereLight(0xe7fbff, 0x3b6b3f, 2.4);
    scene.add(hemi);
    var sun = new T.DirectionalLight(0xfff3cf, 2.8);
    sun.position.set(-70, 110, 45);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -170;
    sun.shadow.camera.right = sun.shadow.camera.top = 170;
    scene.add(sun);

    var points = [
      [-92, 0, -18], [-68, 0, -75], [-8, 0, -96], [55, 1, -83],
      [92, 0, -40], [86, 0, 12], [58, 3, 54], [19, 8, 78],
      [-23, 1, 72], [-65, 0, 54], [-98, 0, 18]
    ].map(function (p) { return new T.Vector3(p[0], p[1], p[2]); });
    this.curve = new T.CatmullRomCurve3(points, true, 'catmullrom', .28);
    this.trackLength = this.curve.getLength();

    var ground = new T.Mesh(
      new T.PlaneGeometry(620, 620, 1, 1),
      new T.MeshStandardMaterial({ color: 0x4f9e5d, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1.15;
    ground.receiveShadow = true;
    scene.add(ground);
    this.disposables.push(ground);

    var road = this.ribbon(ROAD_HALF, 0x343a40, .03);
    road.receiveShadow = true;
    scene.add(road);
    var leftCurb = this.ribbon(ROAD_HALF + .7, 0xf8fafc, -.03);
    scene.add(leftCurb);
    /* Add the road again over the wider white ribbon, leaving curb edges. */
    var roadTop = this.ribbon(ROAD_HALF, 0x30363d, .02);
    scene.add(roadTop);

    var centerMat = new T.MeshBasicMaterial({ color: 0xf8d56b });
    for (var i = 0; i < 80; i += 2) {
      var p = this.trackPoint(i / 80, 0);
      var tangent = this.curve.getTangentAt(i / 80);
      var mark = new T.Mesh(new T.BoxGeometry(.24, .025, 3.2), centerMat);
      mark.position.copy(p);
      mark.position.y += .08;
      mark.rotation.y = Math.atan2(tangent.x, tangent.z);
      scene.add(mark);
      this.disposables.push(mark);
    }

    this.addStartLine();
    this.addScenery();
  };

  KartRace.prototype.ribbon = function (halfWidth, color, yOffset) {
    var T = global.THREE, steps = 420, pos = [], uv = [], idx = [];
    for (var i = 0; i <= steps; i++) {
      var u = i / steps;
      var p = this.curve.getPointAt(u);
      var tan = this.curve.getTangentAt(u).normalize();
      var nx = -tan.z, nz = tan.x;
      pos.push(p.x + nx * halfWidth, p.y + yOffset, p.z + nz * halfWidth);
      pos.push(p.x - nx * halfWidth, p.y + yOffset, p.z - nz * halfWidth);
      uv.push(0, i / 8, 1, i / 8);
      if (i < steps) {
        var a = i * 2;
        idx.push(a, a + 2, a + 1, a + 2, a + 3, a + 1);
      }
    }
    var geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    geometry.setIndex(idx);
    geometry.computeVertexNormals();
    var mesh = new T.Mesh(geometry, new T.MeshStandardMaterial({ color: color, roughness: .9 }));
    this.disposables.push(mesh);
    return mesh;
  };

  KartRace.prototype.addStartLine = function () {
    var T = global.THREE, p = this.trackPoint(0, 0), tan = this.curve.getTangentAt(0);
    var group = new T.Group();
    for (var x = -8; x < 8; x += 2) {
      for (var z = -1.2; z < 1.2; z += 1.2) {
        var tile = new T.Mesh(
          new T.BoxGeometry(2, .06, 1.2),
          new T.MeshBasicMaterial({ color: ((x / 2 + z / 1.2) % 2) ? 0x111827 : 0xffffff })
        );
        tile.position.set(x + 1, .05, z);
        group.add(tile);
      }
    }
    group.position.copy(p);
    group.position.y += .08;
    group.rotation.y = Math.atan2(tan.x, tan.z);
    this.scene.add(group);
    this.disposables.push(group);
  };

  KartRace.prototype.addScenery = function () {
    var T = global.THREE;
    var trunkGeo = new T.CylinderGeometry(.45, .65, 3, 6);
    var leafGeo = new T.ConeGeometry(2.2, 5.5, 7);
    var trunkMat = new T.MeshStandardMaterial({ color: 0x79502f, roughness: 1 });
    var leafMats = [
      new T.MeshStandardMaterial({ color: 0x176b4a, roughness: 1 }),
      new T.MeshStandardMaterial({ color: 0x2c8557, roughness: 1 })
    ];
    for (var i = 0; i < 54; i++) {
      var u = i / 54 + ((i * 17) % 11) / 600;
      var side = i % 2 ? 1 : -1;
      var dist = 17 + (i * 13 % 26);
      var p = this.trackPoint(u, side * dist);
      var tree = new T.Group();
      var trunk = new T.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 1.5; tree.add(trunk);
      var leaves = new T.Mesh(leafGeo, leafMats[i % 2]);
      leaves.position.y = 5.4; leaves.castShadow = true; tree.add(leaves);
      tree.position.set(p.x, Math.max(-1, p.y - .9), p.z);
      tree.scale.setScalar(.7 + (i % 5) * .08);
      this.scene.add(tree);
    }
    this.disposables.push({ geometry: trunkGeo, material: trunkMat });
    this.disposables.push({ geometry: leafGeo, material: leafMats });

    /* Colorful grandstand blocks and arch make the circuit feel authored
       without downloading any external model or texture. */
    for (var b = 0; b < 12; b++) {
      var box = new T.Mesh(
        new T.BoxGeometry(5, 2 + b % 3, 3),
        new T.MeshStandardMaterial({ color: [0xf97316, 0x14b8a6, 0xfacc15, 0x8b5cf6][b % 4] })
      );
      var bp = this.trackPoint(.06 + b * .008, b % 2 ? 16 : -16);
      box.position.set(bp.x, bp.y + 1, bp.z);
      box.castShadow = true;
      this.scene.add(box);
      this.disposables.push(box);
    }
  };

  KartRace.prototype.trackPoint = function (u, lateral) {
    var T = global.THREE, p = this.curve.getPointAt(mod(u, 1));
    var tan = this.curve.getTangentAt(mod(u, 1)).normalize();
    return p.add(new T.Vector3(-tan.z * lateral, 0, tan.x * lateral));
  };

  KartRace.prototype.makeKart = function (color) {
    var T = global.THREE, g = new T.Group();
    var bodyMat = new T.MeshStandardMaterial({ color: color, roughness: .42, metalness: .08, emissive: 0x000000 });
    var dark = new T.MeshStandardMaterial({ color: 0x111827, roughness: .8 });
    var body = new T.Mesh(new T.BoxGeometry(2.5, .75, 3.8), bodyMat);
    body.position.y = .75; body.castShadow = true; g.add(body);
    var nose = new T.Mesh(new T.BoxGeometry(2.1, .45, 1.2), bodyMat);
    nose.position.set(0, .7, 2.25); nose.castShadow = true; g.add(nose);
    var seat = new T.Mesh(new T.BoxGeometry(1.35, 1.05, 1.25), dark);
    seat.position.set(0, 1.25, -.55); g.add(seat);
    var head = new T.Mesh(new T.SphereGeometry(.48, 12, 8), new T.MeshStandardMaterial({ color: 0xf6c38b }));
    head.position.set(0, 2.05, -.45); head.castShadow = true; g.add(head);
    [[-1.35,.65,1.3],[1.35,.65,1.3],[-1.35,.65,-1.25],[1.35,.65,-1.25]].forEach(function (v) {
      var wheel = new T.Mesh(new T.CylinderGeometry(.52, .52, .42, 12), dark);
      wheel.rotation.z = Math.PI / 2; wheel.position.set(v[0], v[1], v[2]); wheel.castShadow = true; g.add(wheel);
    });
    g.userData.bodyMat = bodyMat;
    g.userData.target = { progress: 0, lateral: 0 };
    return g;
  };

  KartRace.prototype.buildBots = function () {
    if (this.mode !== 'solo') return;
    var count = 5, colors = [0x3b82f6, 0xf59e0b, 0x8b5cf6, 0x10b981, 0xec4899];
    var level = this.settings.botDifficulty || 'easy';
    var base = { easy: 24, medium: 29, hard: 34 }[level] || 24;
    for (var i = 0; i < count; i++) {
      var mesh = this.makeKart(colors[i]);
      var bot = {
        mesh: mesh, progress: -.006 * (i + 1), lateral: (i % 2 ? 1 : -1) * (2 + Math.floor(i / 2) * 1.4),
        speed: base * (.88 + i * .025), target: base * (.93 + i * .025), seed: i * 1.7
      };
      this.bots.push(bot);
      this.scene.add(mesh);
    }
    var field = this.host.querySelector('#kart-field');
    if (field) field.textContent = String(count + 1);
  };

  KartRace.prototype.bindControls = function () {
    var self = this;
    function on(target, event, fn, opts) {
      target.addEventListener(event, fn, opts);
      self.listeners.push(function () { target.removeEventListener(event, fn, opts); });
    }
    on(global, 'keydown', function (e) {
      if (!self.root || self.destroyed) return;
      var code = e.code;
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','ShiftLeft','ShiftRight'].indexOf(code) !== -1) e.preventDefault();
      if (/^Digit[1-4]$/.test(code) && !e.repeat) {
        e.preventDefault(); self.answer(Number(code.slice(5)) - 1); return;
      }
      if (code === 'Escape' && !e.repeat) { e.preventDefault(); self.toggleMenu(); return; }
      if (code === 'Space' && !e.repeat) self.useBoost();
      self.keys[code] = true;
    }, { passive: false });
    on(global, 'keyup', function (e) { self.keys[e.code] = false; });
    on(global, 'blur', function () { self.keys = {}; self.pointerKeys = {}; });
    on(this.host.querySelector('#kart-menu'), 'click', function () { self.toggleMenu(); });
    this.host.querySelectorAll('.kart-answer').forEach(function () {});
    on(this.host, 'click', function (e) {
      var answer = e.target.closest('[data-answer]');
      if (answer) self.answer(Number(answer.dataset.answer));
      var press = e.target.closest('[data-press="boost"]');
      if (press) self.useBoost();
    });
    this.host.querySelectorAll('[data-hold]').forEach(function (button) {
      var key = button.dataset.hold;
      function down(e) { e.preventDefault(); self.pointerKeys[key] = true; button.classList.add('is-held'); }
      function up(e) { e.preventDefault(); self.pointerKeys[key] = false; button.classList.remove('is-held'); }
      on(button, 'pointerdown', down, { passive: false });
      on(button, 'pointerup', up, { passive: false });
      on(button, 'pointercancel', up, { passive: false });
      on(button, 'pointerleave', up, { passive: false });
    });
  };

  KartRace.prototype.input = function (name) {
    var map = {
      gas: ['KeyW', 'ArrowUp'], brake: ['KeyS', 'ArrowDown'],
      left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
      drift: ['ShiftLeft', 'ShiftRight']
    };
    return this.pointerKeys[name] || (map[name] || []).some(function (k) { return !!this.keys[k]; }, this);
  };

  KartRace.prototype.frame = function (now) {
    if (this.destroyed || !this.renderer) return;
    var self = this;
    this.frameId = requestAnimationFrame(function (t) { self.frame(t); });
    var dt = Math.min(.05, Math.max(.001, (now - this.lastFrame) / 1000));
    this.lastFrame = now;

    var remaining = this.startAt - Date.now();
    this.drawCountdown(remaining);
    if (remaining <= 0 && !this.paused && !this.finishedAt) {
      this.updatePhysics(dt, now);
      this.updateBots(dt);
      /* Starts and multiplayer deadlines are wall-clock timestamps. Keep race
         timing in that same domain; `now` from requestAnimationFrame is only
         suitable for frame deltas and short visual boost effects. */
      this.updateRace(Date.now());
    }
    this.updateKartTransform(this.playerKart, this.progress, this.lateral, dt);
    this.bots.forEach(function (b) { self.updateKartTransform(b.mesh, b.progress, b.lateral, dt); });
    this.updateRemotes(dt);
    this.updateCamera(dt, now);
    this.updateSparks(dt);
    this.updateHud(Date.now());
    this.renderer.render(this.scene, this.camera);
  };

  KartRace.prototype.drawCountdown = function (ms) {
    var box = this.host.querySelector('#kart-countdown');
    if (!box) return;
    if (ms <= -500) { box.innerHTML = ''; return; }
    if (ms <= 0) box.innerHTML = 'GO!';
    else {
      var n = Math.ceil(ms / 1000);
      box.innerHTML = n + (n === 3 ? '<small>Get ready</small>' : '');
    }
  };

  KartRace.prototype.updatePhysics = function (dt, now) {
    var gas = this.input('gas'), brake = this.input('brake');
    var left = this.input('left'), right = this.input('right'), drift = this.input('drift');
    var offroad = Math.abs(this.lateral) > ROAD_HALF - .8;
    var boosting = now < this.boostUntil;
    var max = boosting ? 52 : (offroad ? 17 : 38);
    if (gas) this.speed += (this.speed < 0 ? 28 : 17) * dt;
    else this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 5.2 * dt);
    if (brake) this.speed -= (this.speed > 0 ? 29 : 11) * dt;
    if (offroad) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 14 * dt);
    if (boosting) this.speed += 23 * dt;
    this.speed = clamp(this.speed, -8, max);

    /* Positive lateral follows the curve's LEFT normal. Keeping that sign
       explicit avoids the old bug where A moved right and D moved left on
       much of the circuit. Steering now has momentum instead of teleporting
       sideways: normal steering settles quickly; drift keeps sliding after
       the wheel comes back to centre. */
    var steer = (left ? 1 : 0) - (right ? 1 : 0);
    var direction = this.speed < -.2 ? -1 : 1;
    var speedRatio = clamp(Math.abs(this.speed) / 25, 0, 1);
    var steerGrip = .18 + speedRatio * .82;
    var targetSlide = steer * direction * steerGrip * (drift ? 13.5 : 9.2);
    var response = drift ? 3.2 : 10.5;
    this.lateralSpeed += (targetSlide - this.lateralSpeed) * Math.min(1, response * dt);
    if (!steer) {
      this.lateralSpeed *= Math.pow(drift ? .982 : .88, dt * 60);
    }
    this.lateral += this.lateralSpeed * dt;
    this.steerVisual += (steer * direction - this.steerVisual) * Math.min(1, (drift ? 4 : 9) * dt);
    this.drifting = drift && Math.abs(this.speed) > 8 && Math.abs(steer) > 0;
    this.lateral = clamp(this.lateral, -18, 18);
    if (Math.abs(this.lateral) >= 17.95) this.lateralSpeed *= -.25;
    this.progress += (this.speed * dt) / this.trackLength;
    if (this.progress < -.01) this.progress = -.01;

    if (Math.abs(this.speed) < 1.2 && offroad && !gas && !brake) this.stuckFor += dt;
    else this.stuckFor = 0;
    if (this.stuckFor > 3.2) this.recover();

    if (boosting && Math.random() < .65) this.spawnSpark();
    if (this.playerKart && this.playerKart.userData.bodyMat) {
      this.playerKart.userData.bodyMat.emissive.setHex(boosting ? 0x5a2e00 : 0x000000);
    }
  };

  KartRace.prototype.updateBots = function (dt) {
    var self = this;
    this.bots.forEach(function (bot, i) {
      var bend = Math.sin((bot.progress * 18 + bot.seed)) * 1.4;
      bot.speed += (bot.target + bend - bot.speed) * Math.min(1, dt * 1.2);
      bot.progress += bot.speed * dt / self.trackLength;
      bot.lateral += (Math.sin(bot.progress * 25 + bot.seed) * 2.6 - bot.lateral) * dt * .45;
    });
  };

  KartRace.prototype.updateKartTransform = function (kart, progress, lateral, dt) {
    if (!kart) return;
    var p = this.trackPoint(progress, lateral);
    var tan = this.curve.getTangentAt(mod(progress, 1)).normalize();
    kart.position.lerp(p, clamp(dt * 14, 0, 1));
    var yaw = Math.atan2(tan.x, tan.z);
    if (kart === this.playerKart) {
      /* Turn the nose into the corner; drift adds counter-steer and a larger
         slip angle so the handling is readable from the chase camera. */
      yaw -= this.steerVisual * (this.drifting ? .34 : .2);
    }
    var current = kart.rotation.y;
    var delta = Math.atan2(Math.sin(yaw - current), Math.cos(yaw - current));
    kart.rotation.y += delta * clamp(dt * 12, 0, 1);
    kart.rotation.z = kart === this.playerKart
      ? clamp(this.steerVisual * (this.drifting ? .15 : .08), -.16, .16)
      : 0;
  };

  KartRace.prototype.updateCamera = function (dt, now) {
    if (!this.playerKart) return;
    var T = global.THREE, u = mod(this.progress, 1);
    var tangent = this.curve.getTangentAt(u).normalize();
    var desired = this.playerKart.position.clone()
      .add(tangent.clone().multiplyScalar(-11.5))
      .add(new T.Vector3(0, 6.2, 0));
    this.camera.position.lerp(desired, 1 - Math.pow(.0015, dt));
    var look = this.playerKart.position.clone().add(tangent.clone().multiplyScalar(8)).add(new T.Vector3(0, 1.3, 0));
    this.camera.lookAt(look);
    var targetFov = now < this.boostUntil ? 74 : 62;
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 5);
    this.camera.updateProjectionMatrix();
  };

  KartRace.prototype.updateRace = function (now) {
    var sequence = Math.floor(Math.max(0, this.progress) * CHECKPOINTS_PER_LAP) + 1;
    var maxSequence = LAPS * CHECKPOINTS_PER_LAP;
    while (this.nextCheckpoint <= Math.min(sequence, maxSequence)) {
      var passed = this.nextCheckpoint++;
      if (this.mode === 'class' && passed > this.lastCheckpointSent) {
        this.lastCheckpointSent = passed;
        global.GeoKartCloud.checkpoint(this.opts.sessionId, passed).catch(function () {});
      }
    }

    if (this.progress >= LAPS && !this.finishedAt) {
      if (this.mode === 'class') {
        var self = this;
        this.finishedAt = now;
        global.GeoKartCloud.finish(this.opts.sessionId).then(function (result) {
          self.showResults(result && result.finishMs);
        }, function () {
          self.finishedAt = 0;
          self.message('Finish is waiting for server checkpoint validation');
        });
      } else {
        this.finishedAt = now;
        this.showResults(now - this.raceStartedAt);
      }
    }

    if (this.mode === 'solo') {
      var ahead = this.bots.filter(function (b) { return b.progress > this.progress; }, this).length;
      this.lastPlacement = ahead + 1;
    }
    if (this.mode === 'class' && this.opts.sendPosition && now - this.lastBroadcast > 90) {
      this.lastBroadcast = now;
      this.opts.sendPosition({
        userId: global.Cloud && global.Cloud.user && global.Cloud.user.id,
        progress: this.progress, lateral: this.lateral, speed: this.speed, at: Date.now()
      });
    }
  };

  KartRace.prototype.updateHud = function (now) {
    var speed = this.host.querySelector('#kart-speed');
    var pos = this.host.querySelector('#kart-position');
    var lap = this.host.querySelector('#kart-lap');
    var time = this.host.querySelector('#kart-time');
    if (speed) speed.textContent = String(Math.round(Math.abs(this.speed) * 3.6));
    if (pos) pos.textContent = String(this.lastPlacement);
    if (lap) lap.textContent = String(clamp(Math.floor(Math.max(0, this.progress)) + 1, 1, LAPS));
    if (time) time.textContent = fmt((this.finishedAt || now) - this.raceStartedAt);
    this.host.querySelectorAll('.kart-boost').forEach(function (el, i) {
      el.classList.toggle('is-full', i < this.boosts);
    }, this);
  };

  KartRace.prototype.nextSoloQuestion = function () {
    var pool = this.opts.pool || global.Quiz.pool({ scope: 'un' });
    if (!pool.length) return;
    var candidates = pool.filter(function (c) { return this.lastCountries.indexOf(c.name) === -1; }, this);
    if (!candidates.length) candidates = pool;
    var country = candidates[Math.floor(Math.random() * candidates.length)];
    this.lastCountries.push(country.name);
    if (this.lastCountries.length > Math.min(5, pool.length - 1)) this.lastCountries.shift();
    var types = this.settings.geoDifficulty === 'easy' ? ['capital'] : ['capital', 'country'];
    var type = types[Math.floor(Math.random() * types.length)];
    this.question = global.Quiz.make(type, country, pool.length >= 5 ? pool : global.Quiz.pool({ scope: 'all' }));
    this.renderQuestion();
  };

  KartRace.prototype.renderQuestion = function () {
    var box = this.host.querySelector('#kart-question');
    if (!box) return;
    var q = this.question;
    if (!q) {
      box.innerHTML = '<div class="kart-question__subject">Waiting for the first question…</div>';
      return;
    }
    var choices = q.choices || [];
    box.innerHTML =
      '<div class="kart-question__prompt">' + W.escapeHtml(q.prompt || 'Choose the answer') + '</div>' +
      '<div class="kart-question__subject">' + W.escapeHtml(q.subject || '') + '</div>' +
      '<div class="kart-answers">' + choices.map(function (choice, i) {
        var text = typeof choice === 'string' ? choice : choice.text;
        return '<button class="kart-answer" data-answer="' + i + '"><b>' + (i + 1) + '</b>' + W.escapeHtml(text) + '</button>';
      }).join('') + '</div>';
  };

  KartRace.prototype.answer = function (index) {
    if (this.questionLocked || !this.question || Date.now() < this.startAt || this.finishedAt) return;
    var q = this.question, choices = q.choices || [];
    if (index < 0 || index >= choices.length) return;
    this.questionLocked = true;
    this.answered++;
    var self = this;
    if (this.mode === 'class') {
      global.GeoKartCloud.answer(this.opts.sessionId, q.index, index).then(function (result) {
        self.applyAnswerResult(index, !!result.correct, result.correctChoice, result.boosts);
        if (result.question) {
          self.question = normaliseClassQuestion(result.question);
        }
      }, function (err) {
        self.questionLocked = false;
        self.message((err && err.message) || 'Answer was not accepted');
      });
      return;
    }
    this.applyAnswerResult(index, !!choices[index].correct, choices.findIndex(function (c) { return c.correct; }));
  };

  KartRace.prototype.applyAnswerResult = function (picked, correct, right, serverBoosts) {
    if (correct) {
      this.correct++;
      this.boosts = serverBoosts === undefined ? Math.min(3, this.boosts + 1) : serverBoosts;
    } else if (serverBoosts !== undefined) {
      this.boosts = serverBoosts;
    }
    var buttons = this.host.querySelectorAll('.kart-answer');
    buttons.forEach(function (b, i) {
      b.disabled = true;
      if (i === right) b.classList.add('is-right');
      else if (i === picked) b.classList.add('is-wrong');
    });
    this.message(correct ? '+1 boost charged' : 'Correct answer shown — keep racing');
    clearTimeout(this.questionTimer);
    var self = this;
    this.questionTimer = setTimeout(function () {
      self.questionLocked = false;
      if (self.mode === 'solo') self.nextSoloQuestion();
      else self.renderQuestion();
    }, 1150);
  };

  KartRace.prototype.useBoost = function () {
    if (this.boosts <= 0 || Date.now() < this.startAt || this.finishedAt) {
      if (this.boosts <= 0) this.message('Answer correctly to charge a boost');
      return;
    }
    var self = this;
    if (this.mode === 'class') {
      global.GeoKartCloud.useBoost(this.opts.sessionId).then(function (result) {
        self.boosts = result.boosts;
        self.fireBoost();
      }, function () { self.message('No server-validated boost available'); });
    } else {
      this.boosts--;
      this.fireBoost();
    }
  };

  KartRace.prototype.fireBoost = function () {
    this.boostsUsed++;
    this.boostUntil = performance.now() + 1800;
    this.speed = Math.max(this.speed, 34);
    this.message('BOOST!');
    for (var i = 0; i < 12; i++) this.spawnSpark();
  };

  KartRace.prototype.spawnSpark = function () {
    if (!this.playerKart || this.sparks.length > 80) return;
    var T = global.THREE;
    var mesh = new T.Mesh(
      new T.BoxGeometry(.12 + Math.random() * .18, .12, .5 + Math.random()),
      new T.MeshBasicMaterial({ color: Math.random() > .5 ? 0xfbbf24 : 0x38bdf8 })
    );
    var tangent = this.curve.getTangentAt(mod(this.progress, 1)).normalize();
    mesh.position.copy(this.playerKart.position).add(tangent.multiplyScalar(-2.3));
    mesh.position.x += (Math.random() - .5) * 1.5;
    mesh.position.y += .4 + Math.random() * .5;
    this.scene.add(mesh);
    this.sparks.push({ mesh: mesh, life: .45 + Math.random() * .35 });
  };

  KartRace.prototype.updateSparks = function (dt) {
    for (var i = this.sparks.length - 1; i >= 0; i--) {
      var s = this.sparks[i];
      s.life -= dt;
      s.mesh.position.y += dt * 1.4;
      s.mesh.scale.multiplyScalar(.94);
      if (s.life <= 0) {
        this.scene.remove(s.mesh);
        s.mesh.geometry.dispose(); s.mesh.material.dispose();
        this.sparks.splice(i, 1);
      }
    }
  };

  KartRace.prototype.recover = function () {
    this.lateral = 0;
    this.speed = 9;
    this.stuckFor = 0;
    this.message('Recovered to the track');
  };

  KartRace.prototype.message = function (text) {
    var el = this.host.querySelector('#kart-message');
    if (!el) return;
    el.textContent = text;
    el.classList.remove('hidden');
    clearTimeout(this.messageTimer);
    this.messageTimer = setTimeout(function () { el.classList.add('hidden'); }, 1200);
  };

  KartRace.prototype.toggleMenu = function () {
    if (this.finishedAt) return;
    this.menuOpen = !this.menuOpen;
    if (this.mode === 'solo') this.paused = this.menuOpen;
    var overlay = this.host.querySelector('#kart-overlay');
    if (!this.menuOpen) { overlay.innerHTML = ''; return; }
    overlay.innerHTML =
      '<div class="kart-pause"><div class="kart-dialog">' +
        '<span class="kart-eyebrow">' + (this.mode === 'solo' ? 'Race paused' : 'Race still running') + '</span>' +
        '<h2>' + (this.mode === 'solo' ? 'Take a breather' : 'Race menu') + '</h2>' +
        '<p>' + (this.mode === 'solo' ? 'Your timer and opponents are paused.' : 'Class races continue while this menu is open.') + '</p>' +
        '<div class="kart-dialog__actions"><button class="btn btn--ghost" data-leave>Leave race</button>' +
        '<button class="btn btn--accent" data-resume>Resume</button></div>' +
      '</div></div>';
    var self = this;
    overlay.querySelector('[data-resume]').onclick = function () { self.toggleMenu(); };
    overlay.querySelector('[data-leave]').onclick = function () {
      self.menuOpen = false;
      if (self.opts.onExit) self.opts.onExit();
    };
  };

  KartRace.prototype.showResults = function (elapsed) {
    this.paused = true;
    elapsed = isFinite(elapsed) ? elapsed : this.finishedAt - this.raceStartedAt;
    var accuracy = this.answered ? Math.round(this.correct / this.answered * 100) : 0;
    var placement = this.lastPlacement;
    var overlay = this.host.querySelector('#kart-overlay');
    overlay.innerHTML =
      '<div class="kart-results"><div class="kart-dialog">' +
        '<span class="kart-eyebrow">Finish</span><h2>' + ordinal(placement) + ' place</h2>' +
        '<p>Three laps complete on Atlas Ridge Circuit.</p>' +
        '<div class="kart-result-grid">' +
          result('Race time', fmt(elapsed)) + result('Correct', this.correct + ' / ' + this.answered) +
          result('Accuracy', accuracy + '%') + result('Boosts used', String(this.boostsUsed)) +
        '</div><div class="kart-dialog__actions">' +
          (this.mode === 'solo' ? '<button class="btn btn--ghost" data-retry>Retry</button>' : '') +
          '<button class="btn btn--accent" data-done>Return to Games</button>' +
        '</div></div></div>';
    var self = this;
    var retry = overlay.querySelector('[data-retry]');
    if (retry) retry.onclick = function () { if (self.opts.onRetry) self.opts.onRetry(); };
    overlay.querySelector('[data-done]').onclick = function () { if (self.opts.onExit) self.opts.onExit(); };

    function result(label, value) {
      return '<div><span>' + label + '</span><b>' + value + '</b></div>';
    }
    function ordinal(n) {
      var x = n % 100;
      return n + (x >= 11 && x <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'));
    }
  };

  KartRace.prototype.syncClass = function (snapshot) {
    if (!snapshot) return;
    this.opts.snapshot = snapshot;
    var me = snapshot.me;
    if (me) {
      this.boosts = Number(me.boosts || 0);
      this.correct = Number(me.correct || 0);
      this.answered = Number(me.answered || 0);
      if (Number(me.checkpoint || 0) + 1 > this.nextCheckpoint) {
        this.nextCheckpoint = Number(me.checkpoint) + 1;
      }
    }
    if (snapshot.question && (!this.question || this.question.index !== snapshot.question.index)) {
      this.questionLocked = false;
      this.question = normaliseClassQuestion(snapshot.question);
      this.renderQuestion();
    }
    var players = snapshot.players || [];
    var myId = global.Cloud && global.Cloud.user && global.Cloud.user.id;
    var sorted = players.slice().sort(function (a, b) {
      if (a.finishMs && b.finishMs) return a.finishMs - b.finishMs;
      if (a.finishMs) return -1;
      if (b.finishMs) return 1;
      return (b.checkpoint || 0) - (a.checkpoint || 0);
    });
    var rank = sorted.findIndex(function (p) { return p.userId === myId; });
    if (rank >= 0) this.lastPlacement = rank + 1;
    var field = this.host.querySelector('#kart-field');
    if (field) field.textContent = String(players.length || 1);
    if (snapshot.status === 'cancelled') {
      this.paused = true;
      this.message('Teacher cancelled the race');
      if (this.opts.onCancelled) this.opts.onCancelled();
    }
  };

  function normaliseClassQuestion(q) {
    return {
      index: Number(q.index),
      prompt: q.prompt,
      subject: q.subject,
      choices: q.choices || []
    };
  }

  KartRace.prototype.remotePosition = function (packet) {
    var mine = global.Cloud && global.Cloud.user && global.Cloud.user.id;
    if (!packet || !packet.userId || packet.userId === mine) return;
    var remote = this.remotes[packet.userId];
    if (!remote) {
      var colors = [0x3b82f6, 0xf59e0b, 0x8b5cf6, 0x10b981, 0xec4899];
      remote = this.remotes[packet.userId] = {
        mesh: this.makeKart(colors[Object.keys(this.remotes).length % colors.length]),
        progress: Number(packet.progress) || 0, lateral: Number(packet.lateral) || 0,
        targetProgress: Number(packet.progress) || 0, targetLateral: Number(packet.lateral) || 0, at: Date.now()
      };
      this.scene.add(remote.mesh);
    }
    remote.targetProgress = Number(packet.progress) || 0;
    remote.targetLateral = Number(packet.lateral) || 0;
    remote.at = Date.now();
  };

  KartRace.prototype.updateRemotes = function (dt) {
    var self = this;
    Object.keys(this.remotes).forEach(function (id) {
      var r = self.remotes[id];
      r.progress += (r.targetProgress - r.progress) * Math.min(1, dt * 9);
      r.lateral += (r.targetLateral - r.lateral) * Math.min(1, dt * 9);
      r.mesh.visible = Date.now() - r.at < 5000;
      self.updateKartTransform(r.mesh, r.progress, r.lateral, dt);
    });
  };

  KartRace.prototype.resize = function () {
    if (!this.renderer || !this.root) return;
    var w = Math.max(1, this.root.clientWidth), h = Math.max(1, this.root.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  KartRace.prototype.debug = function () {
    return {
      mode: this.mode, speed: this.speed, progress: this.progress, lateral: this.lateral,
      lateralSpeed: this.lateralSpeed, steer: this.steerVisual, drifting: this.drifting,
      boosts: this.boosts, answered: this.answered, correct: this.correct,
      nextCheckpoint: this.nextCheckpoint, paused: this.paused, finished: !!this.finishedAt
    };
  };

  KartRace.prototype.destroy = function () {
    if (this.destroyed) return;
    this.destroyed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.questionTimer);
    clearTimeout(this.messageTimer);
    this.listeners.forEach(function (off) { try { off(); } catch (e) {} });
    this.listeners = [];
    if (this.resizeObserver) this.resizeObserver.disconnect();
    this.sparks.forEach(function (s) {
      s.mesh.geometry.dispose(); s.mesh.material.dispose();
    });
    if (this.scene) {
      this.scene.traverse(function (obj) {
        if (obj.geometry && obj.geometry.dispose) obj.geometry.dispose();
        if (obj.material) {
          (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach(function (m) {
            if (m.map) m.map.dispose();
            if (m.dispose) m.dispose();
          });
        }
      });
    }
    if (this.renderer) {
      this.renderer.dispose();
      if (this.renderer.forceContextLoss) this.renderer.forceContextLoss();
    }
    this.host.innerHTML = '';
  };

  function mount(host, opts) {
    destroy();
    active = new KartRace(host, opts || {});
    return active;
  }
  function destroy() {
    if (active) active.destroy();
    active = null;
  }

  global.GeoKart = {
    mount: mount,
    destroy: destroy,
    syncClass: function (snap) { if (active) active.syncClass(snap); },
    remotePosition: function (packet) { if (active) active.remotePosition(packet); },
    debug: function () { return active ? active.debug() : null; },
    debugAnswer: function (index) { if (active) active.answer(index); },
    debugBoost: function () { if (active) active.useBoost(); },
    get active() { return active; }
  };
})(window);
