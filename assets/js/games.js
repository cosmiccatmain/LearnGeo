/* ------------------------------------------------------------------
   LearnGeo — Games hub and Geo Kart setup/lobbies

   GAMES is a registry on purpose: adding the next game means adding one
   card, not another top-level route. Geo Kart itself owns no app navigation;
   this module mounts it and always tears it down on exit.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons;

  var host = null;
  var screen = 'hub';
  var mode = 'solo';
  var watchStop = null;
  var sessionId = null;
  var lastSnapshot = null;
  var lastSolo = null;

  var CATALOG = [{
    id: 'geokart',
    title: 'Geo Kart',
    description: 'Drive a full 3D circuit, drift through corners and turn geography knowledge into speed boosts.',
    tags: ['3 laps', '1–6 racers', 'questions → boost']
  }];

  function start() {
    host = document.getElementById('view-games');
    if (!host) return;
    stopRuntime();
    renderHub();
  }

  function stop() {
    stopRuntime();
    if (host) host.innerHTML = '';
    host = null;
    screen = 'hub';
  }

  function stopRuntime() {
    if (global.GeoKart) global.GeoKart.destroy();
    if (watchStop) { try { watchStop(); } catch (e) {} }
    watchStop = null;
    sessionId = null;
    lastSnapshot = null;
  }

  function renderHub() {
    stopRuntime();
    screen = 'hub';
    host.innerHTML =
      '<div class="games-shell">' +
        '<div class="games-head"><div><span class="kart-eyebrow">LearnGeo arcade</span>' +
          '<h1>Games</h1><p>Learning modes where the geography helps you play — but the game is still fun on its own.</p></div>' +
          '<span class="kart-chip">' + CATALOG.length + ' game available</span></div>' +
        '<div class="games-grid">' + CATALOG.map(gameCard).join('') + '</div>' +
      '</div>';
    host.querySelectorAll('[data-game]').forEach(function (button) {
      button.addEventListener('click', function () { renderSetup(button.dataset.game, 'solo'); });
    });
  }

  function gameCard(game) {
    return '<article class="game-card">' +
      '<div class="game-card__art" aria-hidden="true"><div class="game-card__mountains"></div>' +
        '<div class="game-card__kart"></div><span class="game-card__bolt">⚡</span></div>' +
      '<div class="game-card__body"><span class="game-card__eyebrow">Racing</span>' +
        '<h2>' + W.escapeHtml(game.title) + '</h2><p>' + W.escapeHtml(game.description) + '</p>' +
        '<div class="game-card__foot"><div class="game-card__tags">' +
          game.tags.map(function (tag) { return '<span>' + W.escapeHtml(tag) + '</span>'; }).join('') +
          '</div><button class="btn btn--accent" data-game="' + game.id + '">Play ' + I.arrowR + '</button></div>' +
      '</div></article>';
  }

  function renderSetup(game, nextMode) {
    stopRuntime();
    screen = 'setup';
    mode = nextMode || mode;
    var regions = ['all', 'un'].concat(global.GeoData.regions);
    host.innerHTML =
      '<div class="games-shell kart-setup"><button class="btn btn--ghost btn--sm kart-back" data-back>' +
        I.arrowL + ' Games</button>' +
        '<section class="kart-setup-card"><span class="kart-eyebrow">Geo Kart · Atlas Ridge Circuit</span>' +
          '<h1>Choose your race</h1><p>Three laps. Questions run continuously and never interrupt your steering.</p>' +
          '<div class="kart-mode-tabs">' +
            modeTab('solo', 'Solo race', 'Race five bots at your pace') +
            modeTab('class', 'Class race', 'Teacher-hosted live multiplayer') +
          '</div><div id="kart-setup-content">' + (mode === 'solo' ? soloOptions(regions) : classOptions(regions)) + '</div>' +
        '</section></div>';
    host.querySelector('[data-back]').onclick = renderHub;
    host.querySelectorAll('[data-mode]').forEach(function (button) {
      button.onclick = function () { renderSetup(game, button.dataset.mode); };
    });
    if (mode === 'solo') {
      host.querySelector('[data-start-solo]').onclick = startSoloFromForm;
    } else {
      wireClassSetup();
    }
  }

  function modeTab(id, title, note) {
    return '<button class="kart-mode-tab ' + (mode === id ? 'is-active' : '') + '" data-mode="' + id + '">' +
      '<b>' + title + '</b><span>' + note + '</span></button>';
  }

  function regionOptions(regions) {
    return regions.map(function (r) {
      var label = r === 'all' ? 'World · all 213 places' : r === 'un' ? 'UN member countries' : r;
      return '<option value="' + W.escapeHtml(r) + '">' + W.escapeHtml(label) + '</option>';
    }).join('');
  }

  function soloOptions(regions) {
    return '<div class="kart-options">' +
      '<div class="kart-field"><label for="kart-set">Country set</label><select id="kart-set">' + regionOptions(regions) + '</select></div>' +
      '<div class="kart-field"><label for="kart-geo">Geography difficulty</label><select id="kart-geo">' +
        '<option value="easy">Easy · countries → capitals</option><option value="mixed">Mixed · both directions</option></select></div>' +
      '<div class="kart-field"><label for="kart-bots">Bot driving difficulty</label><select id="kart-bots">' +
        '<option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></div>' +
      '</div>' + controls() +
      '<div class="kart-start-row"><span class="t-sm t-muted">Tip: save boosts for the long uphill straight.</span>' +
        '<button class="btn btn--accent btn--lg" data-start-solo>Start race ' + I.arrowR + '</button></div>';
  }

  function classOptions(regions) {
    var signedIn = global.Cloud && global.Cloud.signedIn;
    if (!signedIn) {
      return '<div class="kart-notice">Class racing needs a signed-in LearnGeo account so the server can verify the teacher, roster and results.</div>' +
        controls();
    }
    if (W.state.role === 'teacher') {
      var classes = teacherClasses();
      return '<div class="kart-options">' +
        '<div class="kart-field"><label for="kart-class">Class</label><select id="kart-class">' +
          (classes.length ? classes.map(function (c) {
            return '<option value="' + c.id + '">' + W.escapeHtml(c.name) + '</option>';
          }).join('') : '<option value="">No online class found</option>') + '</select></div>' +
        '<div class="kart-field"><label for="kart-set">Country set</label><select id="kart-set">' + regionOptions(regions) + '</select></div>' +
        '<div class="kart-field"><label for="kart-geo">Geography difficulty</label><select id="kart-geo">' +
          '<option value="easy">Easy</option><option value="mixed">Mixed</option></select></div>' +
        '</div><div id="kart-cloud-status" class="kart-notice">Checking the authoritative class-race service…</div>' +
        controls() + '<div class="kart-start-row"><button class="btn btn--accent btn--lg" data-create disabled>Create race lobby</button></div>';
    }
    var mine = global.Cloud.myClasses ? global.Cloud.myClasses() : [];
    return '<div class="kart-options">' +
      '<div class="kart-field"><label for="kart-code">Race code</label><input id="kart-code" maxlength="6" autocomplete="off" placeholder="ABC234"></div>' +
      '<div class="kart-field"><label>Existing class</label><select id="kart-existing">' +
        '<option value="">Choose a class race…</option>' + mine.map(function (c) {
          return '<option value="' + c.classId + '">' + W.escapeHtml(c.className || 'My class') + '</option>';
        }).join('') + '</select></div>' +
      '<div class="kart-field"><label>&nbsp;</label><button class="btn btn--ghost" data-find>Find class lobby</button></div>' +
      '</div><div id="kart-cloud-status" class="kart-notice">Checking the authoritative class-race service…</div>' +
      controls() + '<div class="kart-start-row"><button class="btn btn--accent btn--lg" data-join disabled>Join race</button></div>';
  }

  function teacherClasses() {
    var rows = global.Cloud.teacherClasses ? global.Cloud.teacherClasses() : [];
    var out = rows.map(function (r) { return { id: r.id, name: r.name || 'My class' }; });
    var active = W.state.classroom;
    if (active && active.cloudId && !out.some(function (r) { return r.id === active.cloudId; })) {
      out.unshift({ id: active.cloudId, name: active.name || 'My class' });
    }
    return out;
  }

  function controls() {
    return '<div class="kart-controls"><h3>Controls</h3><div class="kart-control-grid">' +
      '<span><b>WASD / arrows</b> drive</span><span><b>Shift</b> drift</span><span><b>Space</b> use boost</span>' +
      '<span><b>1–4</b> answer</span><span><b>Esc</b> pause / menu</span><span><b>Touch</b> controls appear on-screen</span>' +
    '</div></div>';
  }

  function wireClassSetup() {
    if (!global.Cloud || !global.Cloud.signedIn) return;
    var status = host.querySelector('#kart-cloud-status');
    var action = host.querySelector(W.state.role === 'teacher' ? '[data-create]' : '[data-join]');
    global.GeoKartCloud.available(true).then(function (ok) {
      if (!host || screen !== 'setup' || mode !== 'class') return;
      if (ok) {
        status.textContent = 'Connected. Starts, answers, boosts, checkpoints and finishes will be validated by the server.';
        status.style.background = '#ecfdf5'; status.style.color = '#047857';
        if (action) action.disabled = false;
      } else {
        status.innerHTML = 'Class racing is not configured on this Supabase project. Apply <b>supabase/deployed/0006_geokart.sql</b>. Solo racing is fully available now.';
      }
    });
    if (W.state.role === 'teacher') {
      if (action) action.onclick = createLobby;
    } else {
      if (action) action.onclick = joinLobbyByCode;
      var find = host.querySelector('[data-find]');
      if (find) find.onclick = findClassLobby;
    }
  }

  function selectedPool() {
    var set = host.querySelector('#kart-set').value;
    if (set === 'all') return global.Quiz.pool({ scope: 'all' });
    if (set === 'un') return global.Quiz.pool({ scope: 'un' });
    return global.Quiz.pool({ regions: [set], scope: 'all' });
  }

  function settingsFromForm() {
    return {
      set: host.querySelector('#kart-set').value,
      geoDifficulty: host.querySelector('#kart-geo').value,
      botDifficulty: host.querySelector('#kart-bots') ? host.querySelector('#kart-bots').value : null,
      laps: 3,
      circuit: 'atlas-ridge'
    };
  }

  function startSoloFromForm() {
    var settings = settingsFromForm();
    lastSolo = { settings: settings, pool: selectedPool() };
    launchSolo(lastSolo);
  }

  function launchSolo(config) {
    stopRuntime();
    screen = 'race';
    global.GeoKart.mount(host, {
      mode: 'solo',
      settings: config.settings,
      pool: config.pool,
      onExit: renderHub,
      onRetry: function () { launchSolo(config); }
    });
  }

  function makeClassQuestions(pool, difficulty) {
    var sequence = [];
    while (sequence.length < 72) sequence = sequence.concat(W.shuffle(pool));
    sequence = sequence.slice(0, 72);
    var all = pool.length >= 5 ? pool : global.Quiz.pool({ scope: 'all' });
    return sequence.map(function (country, i) {
      var type = difficulty === 'easy' ? 'capital' : (i % 2 ? 'country' : 'capital');
      var q = global.Quiz.make(type, country, all);
      return {
        prompt: q.prompt,
        subject: q.subject,
        choices: q.choices.map(function (c) { return c.text; }),
        correctChoice: q.choices.findIndex(function (c) { return c.correct; })
      };
    });
  }

  function createLobby() {
    var button = host.querySelector('[data-create]');
    var classId = host.querySelector('#kart-class').value;
    if (!classId) { W.toast('Put a class online first', '', I.info); return; }
    button.disabled = true; button.textContent = 'Creating…';
    var settings = settingsFromForm();
    var pool = selectedPool();
    var questions = makeClassQuestions(pool, settings.geoDifficulty);
    global.GeoKartCloud.open(classId, settings, questions).then(function (result) {
      sessionId = result.sessionId;
      renderLobby({ session: result, players: [], status: 'lobby', isHost: true });
      beginWatch(sessionId, true);
    }, function (err) {
      button.disabled = false; button.textContent = 'Create race lobby';
      W.toast('Couldn’t create the race', err.message || '', I.info, 6000);
    });
  }

  function joinLobbyByCode() {
    var input = host.querySelector('#kart-code');
    var code = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    input.value = code;
    if (code.length !== 6) { W.toast('Enter the six-character race code', '', I.info); return; }
    joinCode(code);
  }

  function findClassLobby() {
    var classId = host.querySelector('#kart-existing').value;
    if (!classId) { W.toast('Choose one of your classes first', '', I.info); return; }
    global.GeoKartCloud.findForClass(classId).then(function (found) {
      if (!found) { W.toast('No open Geo Kart race in that class', '', I.info); return; }
      joinCode(found.code);
    }, cloudError);
  }

  function joinCode(code) {
    global.GeoKartCloud.join(code, W.state.profile.displayName || 'Explorer').then(function (result) {
      sessionId = result.sessionId;
      return global.GeoKartCloud.ready(sessionId, true);
    }).then(function () {
      return global.GeoKartCloud.state(sessionId);
    }).then(function (snapshot) {
      renderLobby(snapshot);
      beginWatch(sessionId, false);
    }, cloudError);
  }

  function cloudError(err) {
    W.toast('Couldn’t join the race', (err && err.message) || 'Try the code again.', I.info, 6000);
  }

  function beginWatch(id, isHost) {
    if (watchStop) watchStop();
    global.GeoKartCloud.watch(id, function (snapshot) {
      if (!snapshot) return;
      lastSnapshot = snapshot;
      snapshot.isHost = isHost;
      if (screen === 'race') {
        global.GeoKart.syncClass(snapshot);
        return;
      }
      if (!isHost && (snapshot.status === 'countdown' || snapshot.status === 'racing')) {
        launchClassRace(snapshot);
      } else {
        renderLobby(snapshot);
      }
    }, function (packet) {
      if (screen === 'race') global.GeoKart.remotePosition(packet);
    }).then(function (stopper) {
      watchStop = stopper;
    });
  }

  function renderLobby(snapshot) {
    screen = 'lobby';
    lastSnapshot = snapshot;
    var session = snapshot.session || snapshot;
    var players = snapshot.players || [];
    var isHost = !!snapshot.isHost || W.state.role === 'teacher';
    var status = snapshot.status || session.status || 'lobby';
    var finished = status === 'finished' || status === 'cancelled';
    host.innerHTML =
      '<div class="games-shell kart-setup"><button class="btn btn--ghost btn--sm kart-back" data-leave>' +
        I.arrowL + ' Leave lobby</button><div class="kart-lobby">' +
        '<section class="kart-lobby__main"><span class="kart-eyebrow">Geo Kart class race</span>' +
          '<h1>' + (finished ? 'Final standings' : 'Race lobby') + '</h1>' +
          '<div class="kart-code">' + W.escapeHtml(session.code || '') + '</div>' +
          '<p class="t-muted">' + (finished ? 'The race is closed.' : 'Share this race code. Students must already belong to this class.') + '</p>' +
          '<div class="kart-roster">' + (players.length ? players.map(playerRow).join('') :
            '<div class="empty">Waiting for racers to join…</div>') + '</div>' +
        '</section><aside class="kart-lobby__side">' +
          '<h3>Atlas Ridge</h3><p class="t-sm t-muted" style="margin:8px 0 16px">3 laps · shared rules · 90 second finish window</p>' +
          '<div class="kart-controls"><div class="kart-control-grid" style="grid-template-columns:1fr">' +
            '<span><b>' + players.filter(function (p) { return p.ready; }).length + ' / ' + players.length + '</b> ready</span>' +
            '<span><b>Server</b> validates progress and boosts</span></div></div>' +
          (isHost && !finished
            ? '<button class="btn btn--accent btn--block" data-start ' + (!players.some(function (p) { return p.ready; }) ? 'disabled' : '') + '>Start race</button>' +
              '<button class="btn btn--ghost btn--block" style="margin-top:8px" data-cancel>Cancel lobby</button>'
            : (!finished ? '<div class="kart-notice">You’re ready. The teacher starts the race for everyone.</div>' : '')) +
        '</aside></div></div>';
    host.querySelector('[data-leave]').onclick = renderHub;
    var startButton = host.querySelector('[data-start]');
    if (startButton) startButton.onclick = function () {
      startButton.disabled = true;
      global.GeoKartCloud.start(sessionId).catch(cloudError);
    };
    var cancel = host.querySelector('[data-cancel]');
    if (cancel) cancel.onclick = function () {
      global.GeoKartCloud.cancel(sessionId).then(renderHub, cloudError);
    };

    function playerRow(p, index) {
      var accuracy = p.answered ? Math.round(p.correct / p.answered * 100) + '%' : '—';
      var tail = finished ? (p.finishMs ? fmtMs(p.finishMs) + ' · ' + accuracy : 'DNF · ' + accuracy) : (p.ready ? 'Ready' : 'Not ready');
      return '<div class="kart-player-row ' + (p.ready ? 'is-ready' : '') + '"><i></i><b>' +
        (finished ? (index + 1) + '. ' : '') + W.escapeHtml(p.name || 'Racer') + '</b><span>' + tail + '</span></div>';
    }
  }

  function fmtMs(ms) {
    var sec = Number(ms || 0) / 1000;
    return Math.floor(sec / 60) + ':' + (sec % 60).toFixed(2).padStart(5, '0');
  }

  function launchClassRace(snapshot) {
    screen = 'race';
    var startAt = Date.parse(snapshot.startsAt || (snapshot.session && snapshot.session.startsAt)) || Date.now() + 1500;
    global.GeoKart.mount(host, {
      mode: 'class',
      settings: snapshot.settings || (snapshot.session && snapshot.session.settings) || {},
      sessionId: sessionId,
      snapshot: snapshot,
      startAt: startAt,
      sendPosition: function (packet) { if (watchStop && watchStop.send) watchStop.send(packet); },
      onExit: renderHub,
      onCancelled: function () { setTimeout(renderHub, 1400); }
    });
  }

  global.Games = {
    start: start,
    stop: stop,
    renderHub: renderHub,
    get catalog() { return CATALOG.slice(); }
  };
})(window);
