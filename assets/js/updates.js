/* ------------------------------------------------------------------
   LearnGeo — product update announcement popup (LEA-28).

   On app open / Home load, if the newest public update id is not the
   one this browser dismissed, show a card (hero + title + body).

   Agents: append a new object at the TOP of UPDATES (or updates.json)
   with a fresh unique `id` whenever something ships for everyone.
   Keep entries public-safe — no Pets/Brainrot, no admin-only or
   subscription marketing.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW;
  var I = W.Icons;

  /* Newest first. Bump `id` when shipping so returning users see it.
     Chess Duel (LEA-56) is its own short entry so openings/rules/bots
     (LEA-57/58) can ship a separate What’s New without sharing an id. */
  var UPDATES = [
    {
      id: '2026-11-games-cosmetics-more',
      title: 'More Games cosmetics',
      body: 'Customise → Games now covers Geo Chess boards and pieces, Capital Snake coils, Flag Match tile backs, Capital Maze explorers, and Geo Duel accents — alongside Geo Dash trails and jumpers.',
      image: '/assets/img/updates/games-cosmetics.svg',
      date: '2026-11-06'
    },
    {
      id: '2026-11-chess-duel',
      title: 'Chess Duel: challenge a friend',
      body: 'Invite a classmate by gamertag to a live chess match — same invite inbox as Geo Duel, then take turns on a shared board. Host plays White.',
      image: '/assets/img/updates/chess-duel.svg',
      date: '2026-11-06'
    },
    {
      id: '2026-11-rivers-lakes-select',
      title: 'Rivers & lakes in Select',
      body: 'Study filters now include rivers and lakes alongside countries, capitals, and flags — turn them on when you set what to practise.',
      image: '/assets/img/updates/rivers-lakes.svg',
      date: '2026-11-05'
    },
    {
      id: '2026-11-border-crossing-gates',
      title: 'Border Crossing: clearer gates',
      body: 'The crossing gates now sit below the question sign, so the prompt stays readable while you pick a gate.',
      image: '/assets/img/updates/border-crossing.svg',
      date: '2026-11-05'
    },
    {
      id: '2026-11-hidden-secrets',
      title: 'Hidden secrets & badge case',
      body: 'Twelve new secrets to find around LearnGeo, with rewards and a badge case section so you can show what you’ve unlocked.',
      image: '/assets/img/updates/secrets.svg',
      date: '2026-11-04'
    },
    {
      id: '2026-11-difficulty-slider',
      title: 'Smoother difficulty sliders',
      body: 'Study and game difficulty controls got clearer ticks, a steadier thumb, and a light tick sound when you change levels.',
      image: '/assets/img/updates/difficulty-slider.svg',
      date: '2026-11-03'
    },
    {
      id: '2026-11-games-leaderboards',
      title: 'Games hub & leaderboards',
      body: 'The arcade hub is easier to browse, and every game has a leaderboard so you can see how you stack up.',
      image: '/assets/img/updates/games-hub.svg',
      date: '2026-11-02'
    }
  ];

  var DISMISS_KEY = 'learngeo.updates.dismissedId';
  var popupOpen = false;
  var popupTimer = null;
  var popupTries = 0;
  var jsonLoaded = false;

  function latest() {
    return UPDATES.length ? UPDATES[0] : null;
  }

  function readDismissedId() {
    try { return global.localStorage.getItem(DISMISS_KEY) || ''; }
    catch (e) { return ''; }
  }

  function writeDismissedId(id) {
    try { global.localStorage.setItem(DISMISS_KEY, id || ''); } catch (e) {}
  }

  function needsShow() {
    var u = latest();
    if (!u || !u.id) return false;
    return readDismissedId() !== u.id;
  }

  /* Home for the current role: portal for students/guests, teacher view
     for teachers. Guests who have not picked a role still count as Home
     once the app is open on portal — role-pick blocks the popup. */
  function onHome() {
    var app = document.getElementById('app');
    if (!app || !app.classList.contains('is-open')) return false;
    var role = W.state && W.state.role;
    if (role === 'teacher') {
      var teacher = document.getElementById('view-teacher');
      return !!(teacher && !teacher.classList.contains('hidden'));
    }
    var portal = document.getElementById('view-portal');
    return !!(portal && !portal.classList.contains('hidden'));
  }

  function blockingOverlay() {
    return !!(document.querySelector(
      '.overlay, .role-pick, .menu, .lg-update-overlay'
    ));
  }

  function cardHtml(update) {
    var img = update.image
      ? '<div class="lg-update__media">' +
          '<img class="lg-update__img" src="' + W.escapeHtml(update.image) +
            '" alt="" width="640" height="280" decoding="async">' +
        '</div>'
      : '';
    return '<div class="lg-update">' +
      '<button type="button" class="lg-update__close" data-lg-update-dismiss aria-label="Dismiss">' +
        I.close + '</button>' +
      img +
      '<div class="lg-update__body">' +
        '<div class="lg-update__eyebrow">What’s new</div>' +
        '<h2 class="lg-update__title">' + W.escapeHtml(update.title) + '</h2>' +
        '<p class="lg-update__desc">' + W.escapeHtml(update.body) + '</p>' +
        '<div class="lg-update__actions">' +
          '<button type="button" class="btn btn--sm btn--accent" data-lg-update-dismiss>Got it</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function closePopup(ov, dismiss) {
    var u = latest();
    if (dismiss && u) writeDismissedId(u.id);
    if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
    popupOpen = false;
    if (!document.querySelector('.overlay')) {
      document.body.classList.remove('no-scroll');
    }
  }

  function showPopup() {
    if (popupOpen || !needsShow()) return;
    if (!onHome() || blockingOverlay()) return;
    if (document.querySelector('.lg-update-overlay')) return;

    var update = latest();
    if (!update) return;

    popupOpen = true;
    var ov = W.el('div', 'lg-update-overlay');
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-label', 'LearnGeo update: ' + update.title);
    ov.innerHTML = cardHtml(update);
    document.body.appendChild(ov);
    document.body.classList.add('no-scroll');

    function onDismiss() { closePopup(ov, true); }
    W.$$('[data-lg-update-dismiss]', ov).forEach(function (b) {
      b.addEventListener('click', onDismiss);
    });
    ov.addEventListener('mousedown', function (e) {
      if (e.target === ov) onDismiss();
    });
  }

  function cancel() {
    if (popupTimer) {
      clearTimeout(popupTimer);
      popupTimer = null;
    }
    popupTries = 0;
    var ov = document.querySelector('.lg-update-overlay');
    if (ov) closePopup(ov, false);
    else popupOpen = false;
  }

  function schedule(ms) {
    if (popupTimer) clearTimeout(popupTimer);
    popupTimer = setTimeout(attempt, ms);
  }

  function attempt() {
    popupTimer = null;
    if (!needsShow() || popupOpen) return;
    if (!onHome()) return;
    if (blockingOverlay()) {
      if (popupTries++ < 10) schedule(400);
      return;
    }
    showPopup();
  }

  /* Called from UI.go on Home, and after modals close. */
  function maybeShow() {
    if (!needsShow()) return;
    if (popupTimer) {
      clearTimeout(popupTimer);
      popupTimer = null;
    }
    popupTries = 0;
    schedule(480);
  }

  /* Prefer the JSON file when it loads so agents can append there without
     touching this module. Seeded UPDATES above stay as the sync fallback. */
  function hydrateFromJson(data) {
    if (!data || !Array.isArray(data.updates) || !data.updates.length) return;
    var next = [];
    for (var i = 0; i < data.updates.length; i++) {
      var row = data.updates[i];
      if (!row || !row.id || !row.title) continue;
      next.push({
        id: String(row.id),
        title: String(row.title),
        body: String(row.body || ''),
        image: row.image ? String(row.image) : '',
        date: row.date ? String(row.date) : ''
      });
    }
    if (next.length) {
      UPDATES.length = 0;
      for (var j = 0; j < next.length; j++) UPDATES.push(next[j]);
    }
  }

  function loadJson() {
    if (jsonLoaded) return;
    jsonLoaded = true;
    if (!global.fetch) return;
    global.fetch('/assets/data/updates.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data) return;
        var before = latest() && latest().id;
        hydrateFromJson(data);
        var after = latest() && latest().id;
        if (after && after !== before && needsShow() && onHome()) maybeShow();
      })
      .catch(function () { /* keep seeded list */ });
  }

  loadJson();

  global.LearnGeoUpdates = {
    maybeShow: maybeShow,
    cancel: cancel,
    list: function () { return UPDATES.slice(); },
    latest: latest,
    needsShow: needsShow,
    _dismissKey: DISMISS_KEY,
    _readDismissedId: readDismissedId,
    _writeDismissedId: writeDismissedId
  };
})(window);
