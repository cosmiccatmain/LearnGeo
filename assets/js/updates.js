/* ------------------------------------------------------------------
   LearnGeo — product update announcement popup (LEA-28 / LEA-79).

   On app open / Home load, if the newest public update id is not the
   one this browser dismissed, show a card (hero + title + body + Try it).

   Agents: append a new object at the TOP of UPDATES (or updates.json)
   with a fresh unique `id` whenever something ships for everyone.
   Optional `try` is a deep-link action id (see runTry). Keep entries
   public-safe — no Pets/Brainrot, no admin-only or subscription marketing.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW;
  var I = W.Icons;

  /* Newest first. Bump `id` when shipping so returning users see it.
     Geo Chess PvP unify, achievement wallet, cooking loader, Chess Elo,
     achievement cards, openings/bots, and Games cosmetics each keep their
     own What’s New id. `try` deep-links into the feature (LEA-79). */
  var UPDATES = [
    {
      id: '2026-11-friend-inbox-menu',
      title: 'Friend inbox in your menu',
      body: 'Open your profile menu (next to Customization) for Friend inbox — card gifts, wallet shares, and Geo Chess challenges in one place.',
      image: '/assets/img/updates/achievement-cards.svg',
      date: '2026-11-07',
      try: 'friend-inbox'
    },
    {
      id: '2026-11-friend-inbox',
      title: 'Friend inbox',
      body: 'One Friend inbox for card gifts, wallet shares, and Geo Chess challenges — accept or decline without hunting through separate screens.',
      image: '/assets/img/updates/achievement-cards.svg',
      date: '2026-11-07',
      try: 'friend-inbox'
    },
    {
      id: '2026-11-duel-spectate',
      title: 'Spectate Geo Duels',
      body: 'Teachers can open the new Duels tab in My class and watch a live student Geo Duel — scores and questions update as they play. Host view only; you stay out of the match.',
      image: '/assets/img/updates/chess-duel.svg',
      date: '2026-11-07',
      try: 'duel-spectate'
    },
    {
      id: '2026-11-achievement-awards',
      title: 'Award-style card backs',
      body: 'Flip an achievement card to see your gamertag under a colorful enamel award badge — title and status sit underneath, still in the same flip wallet.',
      image: '/assets/img/updates/achievement-cards.svg',
      date: '2026-11-07',
      try: 'achievements'
    },
    {
      id: '2026-11-geo-chess-pvp',
      title: 'Geo Chess: play other players',
      body: 'Challenge a classmate by gamertag right inside Geo Chess — no separate Chess Duel. Bot games and friend matches both update your Chess Elo (prior wins convert into a starting rating).',
      image: '/assets/img/updates/chess-duel.svg',
      date: '2026-11-07',
      try: 'chess-pvp'
    },
    {
      id: '2026-11-achievement-wallet',
      title: 'Achievement wallet',
      body: 'Your achievement stack unfolds when you open it, cards float gently, flips work again, and you can share your whole wallet with a classmate by gamertag.',
      image: '/assets/img/updates/achievement-cards.svg',
      date: '2026-11-07',
      try: 'achievements'
    },
    {
      id: '2026-11-cooking-loader',
      title: 'Cooking… while you wait',
      body: 'Loading screens across LearnGeo now simmer with a little pot animation and a “cooking” caption — games, maps, Learn, and more.',
      image: '/assets/img/updates/cooking-loader.svg',
      date: '2026-11-07',
      try: 'cooking'
    },
    {
      id: '2026-11-geo-chess-elo',
      title: 'Geo Chess Elo & leaderboard',
      body: 'Geo Chess now has a Chess Elo rating (starts at 1000). Finished bot and friend games update your rating, and the Games leaderboard ranks Elo instead of win counts.',
      image: '/assets/img/updates/geo-chess-elo.svg',
      date: '2026-11-07',
      try: 'chess-boards'
    },
    {
      id: '2026-11-achievement-cards',
      title: 'Achievement cards',
      body: 'Flip through your achievements like a stack of cards, then send unlocked ones to classmates by gamertag — school-safe sharing, no real money.',
      image: '/assets/img/updates/achievement-cards.svg',
      date: '2026-11-07',
      try: 'achievements'
    },
    {
      id: '2026-11-geo-chess-openings-bots',
      title: 'Geo Chess: openings & tougher bots',
      body: 'After a few moves you’ll see the opening name. Pawn promotion and the usual chess rules are clearer, and you can challenge Grandmaster (~3200) or Engine Max.',
      image: '/assets/img/updates/geo-chess-openings-bots.svg',
      date: '2026-11-06',
      try: 'chess'
    },
    {
      id: '2026-11-games-cosmetics-more',
      title: 'More Games cosmetics',
      body: 'Customise → Games now covers Geo Chess boards and pieces, Capital Snake coils, Flag Match tile backs, Capital Maze explorers, and Geo Duel accents — alongside Geo Dash trails and jumpers.',
      image: '/assets/img/updates/games-cosmetics.svg',
      date: '2026-11-06',
      try: 'cosmetics-games'
    },
    {
      id: '2026-11-chess-duel',
      title: 'Chess Duel: challenge a friend',
      body: 'Invite a classmate by gamertag to a live chess match — same invite inbox as Geo Duel, then take turns on a shared board. Host plays White.',
      image: '/assets/img/updates/chess-duel.svg',
      date: '2026-11-06',
      try: 'chess-pvp'
    },
    {
      id: '2026-11-rivers-lakes-select',
      title: 'Rivers & lakes in Select',
      body: 'Study filters now include rivers and lakes alongside countries, capitals, and flags — turn them on when you set what to practise.',
      image: '/assets/img/updates/rivers-lakes.svg',
      date: '2026-11-05',
      try: 'learn-filters'
    },
    {
      id: '2026-11-border-crossing-gates',
      title: 'Border Crossing: clearer gates',
      body: 'The crossing gates now sit below the question sign, so the prompt stays readable while you pick a gate.',
      image: '/assets/img/updates/border-crossing.svg',
      date: '2026-11-05',
      try: 'crossing'
    },
    {
      id: '2026-11-hidden-secrets',
      title: 'Hidden secrets & badge case',
      body: 'Twelve new secrets to find around LearnGeo, with rewards and a badge case section so you can show what you’ve unlocked.',
      image: '/assets/img/updates/secrets.svg',
      date: '2026-11-04',
      try: 'badges'
    },
    {
      id: '2026-11-difficulty-slider',
      title: 'Smoother difficulty sliders',
      body: 'Study and game difficulty controls got clearer ticks, a steadier thumb, and a light tick sound when you change levels.',
      image: '/assets/img/updates/difficulty-slider.svg',
      date: '2026-11-03',
      try: 'chess'
    },
    {
      id: '2026-11-games-leaderboards',
      title: 'Games hub & leaderboards',
      body: 'The arcade hub is easier to browse, and every game has a leaderboard so you can see how you stack up.',
      image: '/assets/img/updates/games-hub.svg',
      date: '2026-11-02',
      try: 'leaderboards'
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
      '.overlay, .role-pick, .lg-update-overlay'
    ));
  }

  function tryActionOf(update) {
    if (!update || update.try == null || update.try === '') return '';
    if (typeof update.try === 'string') return update.try;
    if (update.try && update.try.action) return String(update.try.action);
    return '';
  }

  function cardHtml(update) {
    var img = update.image
      ? '<div class="lg-update__media">' +
          '<img class="lg-update__img" src="' + W.escapeHtml(update.image) +
            '" alt="" width="640" height="280" decoding="async">' +
        '</div>'
      : '';
    var tryAct = tryActionOf(update);
    var tryBtn = tryAct
      ? '<button type="button" class="btn btn--sm btn--accent" data-lg-update-try="' +
          W.escapeHtml(tryAct) + '">Try it</button>'
      : '';
    var dismissCls = tryAct ? 'btn btn--sm btn--ghost' : 'btn btn--sm btn--accent';
    return '<div class="lg-update">' +
      '<button type="button" class="lg-update__close" data-lg-update-dismiss aria-label="Dismiss">' +
        I.close + '</button>' +
      img +
      '<div class="lg-update__body">' +
        '<div class="lg-update__eyebrow">What’s new</div>' +
        '<h2 class="lg-update__title">' + W.escapeHtml(update.title) + '</h2>' +
        '<p class="lg-update__desc">' + W.escapeHtml(update.body) + '</p>' +
        '<div class="lg-update__actions">' +
          tryBtn +
          '<button type="button" class="' + dismissCls + '" data-lg-update-dismiss>Got it</button>' +
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

  /* LEA-79: map try ids → feature deep-links. Keep in sync with updates.json. */
  function runTry(action) {
    var UI = global.UI;
    var Games = global.Games;
    action = String(action || '');
    switch (action) {
      case 'cooking':
        if (global.CookingLoader && global.CookingLoader.preview) {
          global.CookingLoader.preview({
            size: 'lg',
            ms: 4000,
            hint: 'Loading preview · auto-hides in a few seconds'
          });
        }
        return;
      case 'achievements':
        if (UI && UI.openAchievements) UI.openAchievements();
        else if (UI && UI.go) UI.go('achievements');
        return;
      case 'chess-pvp':
        if (UI && UI.go) UI.go('games');
        if (Games && Games.openChessPvp) Games.openChessPvp();
        else if (Games && Games.open) Games.open('chess', { opponent: 'pvp' });
        return;
      case 'chess':
        if (UI && UI.go) UI.go('games');
        if (Games && Games.open) Games.open('chess', { opponent: 'bot' });
        return;
      case 'chess-boards':
        if (UI && UI.go) UI.go('games');
        if (global.GameBoards && global.GameBoards.open) global.GameBoards.open('chess');
        return;
      case 'cosmetics-games':
        if (UI && UI.openCustomization) UI.openCustomization({ tab: 'games' });
        return;
      case 'learn-filters':
        if (UI && UI.go) UI.go('learn');
        if (global.LearnMode && global.LearnMode.openFilters) global.LearnMode.openFilters();
        return;
      case 'crossing':
        if (UI && UI.go) UI.go('games');
        if (Games && Games.open) Games.open('crossing');
        return;
      case 'badges':
        if (global.Badges && global.Badges.openCase) global.Badges.openCase();
        return;
      case 'games':
        if (UI && UI.go) UI.go('games');
        return;
      case 'leaderboards':
        if (UI && UI.go) UI.go('games');
        if (global.GameBoards && global.GameBoards.open) global.GameBoards.open();
        return;
      case 'friend-inbox':
        if (UI && UI.openFriendInbox) UI.openFriendInbox();
        return;
      case 'duel-spectate':
        if (global.Teacher) global.Teacher.tab = 'duels';
        if (UI && UI.go) UI.go('teacher');
        else if (global.Teacher && global.Teacher.render) global.Teacher.render();
        return;
      default:
        return;
    }
  }

  function onTry(ov, action) {
    /* Dismiss so Home does not re-show this update after Try it. */
    closePopup(ov, true);
    runTry(action);
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
    W.$$('[data-lg-update-try]', ov).forEach(function (b) {
      b.addEventListener('click', function () {
        onTry(ov, b.getAttribute('data-lg-update-try'));
      });
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
      var entry = {
        id: String(row.id),
        title: String(row.title),
        body: String(row.body || ''),
        image: row.image ? String(row.image) : '',
        date: row.date ? String(row.date) : ''
      };
      var tryAct = tryActionOf(row);
      if (tryAct) entry.try = tryAct;
      next.push(entry);
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
    runTry: runTry,
    _dismissKey: DISMISS_KEY,
    _readDismissedId: readDismissedId,
    _writeDismissedId: writeDismissedId
  };
})(window);
