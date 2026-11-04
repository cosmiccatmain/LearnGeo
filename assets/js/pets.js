/* ------------------------------------------------------------------
   LearnGeo — Pets (Mongolian Brainrot collab v0 shell)

   Top-level Pets tab + homescreen event popup + starter roster.
   Classroom-safe chrome only: no levels, marketplace, mutations, or
   upload yet (later LEA tasks).

   Dismiss rule (documented product choice for v0):
     C — until dismissed. localStorage key learngeo.pets.event.v0.dismissed
     persists across sessions. No server sync in v0 (known limitation).
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons;
  var esc = W.escapeHtml;

  var EVENT_ID = 'mongolian-brainrot-v0';
  var DISMISS_KEY = 'learngeo.pets.event.v0.dismissed';
  var ROSTER_KEY = 'learngeo.pets.roster.v0';

  /* Exact starter names from the collab plan. Tier language: Mythical
     for launch shell (Jill is locked Mythical in the ref; others TBD —
     v0 shows Mythical Brainrot across the set so the rarity line matches
     the card language). */
  var STARTERS = [
    { id: 'ding-dong-jill', name: 'Ding Dong Jill', rarity: 'Mythical Brainrot', art: 'jill' },
    { id: 'knock-knock-jack', name: 'Knock Knock Jack', rarity: 'Mythical Brainrot', art: 'jack' },
    { id: 'freaky-freaky-freddy', name: 'Freaky Freaky Freddy', rarity: 'Mythical Brainrot', art: 'freddy' },
    { id: 'washington', name: 'Washingtoń', rarity: 'Mythical Brainrot', art: 'washington' },
    { id: 'napoleon', name: 'Napoleon', rarity: 'Mythical Brainrot', art: 'napoleon' }
  ];

  function readDismissed() {
    try { return global.localStorage.getItem(DISMISS_KEY) === '1'; }
    catch (e) { return false; }
  }

  function writeDismissed() {
    try { global.localStorage.setItem(DISMISS_KEY, '1'); } catch (e) {}
  }

  function readRoster() {
    try {
      var raw = global.localStorage.getItem(ROSTER_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.owned)) return null;
      return parsed;
    } catch (e) { return null; }
  }

  function writeRoster(data) {
    try { global.localStorage.setItem(ROSTER_KEY, JSON.stringify(data)); } catch (e) {}
  }

  /* First Pets visit grants the five starters locally so the roster is
     visible. Earn/grant rules remain OPEN in the plan. */
  function ensureRoster() {
    var data = readRoster();
    if (data && data.owned && data.owned.length) return data;
    data = {
      eventId: EVENT_ID,
      grantedAt: Date.now(),
      owned: STARTERS.map(function (s) {
        return { speciesId: s.id, level: 1, skinStage: 'A' };
      })
    };
    writeRoster(data);
    return data;
  }

  function host() { return document.getElementById('view-pets'); }

  /* Split the display name for the contrast style from the ref:
     leading words soft, final word strong. Single-word names stay strong. */
  function nameHtml(displayName) {
    var parts = String(displayName).trim().split(/\s+/);
    if (parts.length < 2) {
      return '<span class="pets-card__name-strong">' + esc(parts[0].toUpperCase()) + '</span>';
    }
    var last = parts.pop();
    return '<span class="pets-card__name-soft">' + esc(parts.join(' ').toUpperCase()) +
      '</span> <span class="pets-card__name-strong">' + esc(last.toUpperCase()) + '</span>';
  }

  function rarityHtml(label) {
    var parts = String(label).trim().split(/\s+/);
    if (parts.length < 2) {
      return '<span class="pets-card__rarity-strong">' + esc(label) + '</span>';
    }
    var last = parts.pop();
    return '<span class="pets-card__rarity-soft">' + esc(parts.join(' ')) +
      '</span> <span class="pets-card__rarity-strong">' + esc(last) + '</span>';
  }

  function speciesById(id) {
    for (var i = 0; i < STARTERS.length; i++) {
      if (STARTERS[i].id === id) return STARTERS[i];
    }
    return null;
  }

  function petCard(owned) {
    var s = speciesById(owned.speciesId);
    if (!s) return '';
    return '<article class="pets-card" data-pet="' + esc(s.id) + '">' +
      '<div class="pets-card__art pets-card__art--' + esc(s.art) + '" aria-hidden="true"></div>' +
      '<h3 class="pets-card__name">' + nameHtml(s.name) + '</h3>' +
      '<div class="pets-card__rarity">' + rarityHtml(s.rarity) + '</div>' +
    '</article>';
  }

  function eventBannerHtml(withActions) {
    return '<div class="pets-event' + (withActions ? '' : '') + '">' +
      '<h2 class="pets-event__title">Mongolian Brainrot x LearnGeo</h2>' +
      '<div class="pets-event__sub">Limited Time Event*</div>' +
      (withActions
        ? '<div class="pets-event__actions">' +
            '<button type="button" class="btn btn--sm btn--pets-primary" data-pets-meet>Meet the Pets</button>' +
            '<button type="button" class="btn btn--sm btn--pets-ghost" data-pets-dismiss>Dismiss</button>' +
          '</div>'
        : '') +
    '</div>';
  }

  function render() {
    var el = host();
    if (!el) return;
    var roster = ensureRoster();
    el.innerHTML =
      '<div class="portal__inner pets">' +
        '<div class="pets__head">' +
          '<div class="eyebrow">Limited-time collab</div>' +
          '<h1>Pets</h1>' +
          '<p>Meet your starter brainrots. Collectibles for the Mongolian Brainrot × LearnGeo event — geography stays in Learn, Games, and class.</p>' +
        '</div>' +
        '<div class="pets__banner">' + eventBannerHtml(false) + '</div>' +
        '<div class="pets__toolbar">' +
          '<span class="pets__toolbar-label">Starter roster</span>' +
          '<span class="t-sm t-muted">' + roster.owned.length + ' pets</span>' +
        '</div>' +
        '<div class="pets__grid">' +
          roster.owned.map(petCard).join('') +
        '</div>' +
        '<p class="pets__note">Levels, skins, marketplace, and uploads come later. This shell is classroom-safe and local-only for now.</p>' +
      '</div>';
  }

  function start() {
    render();
  }

  function stop() { /* v0 hub has no live loop */ }

  var popupOpen = false;

  function closePopup(ov, dismiss) {
    if (dismiss) writeDismissed();
    if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
    popupOpen = false;
    document.body.classList.remove('no-scroll');
  }

  function showEventPopup() {
    if (popupOpen || readDismissed()) return;
    if (document.querySelector('.pets-event-overlay')) return;
    /* Do not stack on top of role pick or locked auth dialogs. */
    if (document.querySelector('.role-pick') || document.querySelector('.overlay[data-locked="1"]')) return;

    popupOpen = true;
    var ov = W.el('div', 'pets-event-overlay');
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-label', 'Mongolian Brainrot x LearnGeo');
    ov.innerHTML =
      '<div class="pets-event">' +
        '<button type="button" class="pets-event__close" data-pets-dismiss aria-label="Dismiss">' + I.close + '</button>' +
        '<h2 class="pets-event__title">Mongolian Brainrot x LearnGeo</h2>' +
        '<div class="pets-event__sub">Limited Time Event*</div>' +
        '<div class="pets-event__actions">' +
          '<button type="button" class="btn btn--sm btn--pets-primary" data-pets-meet>Meet the Pets</button>' +
          '<button type="button" class="btn btn--sm btn--pets-ghost" data-pets-dismiss>Dismiss</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);
    document.body.classList.add('no-scroll');

    function onMeet() {
      closePopup(ov, true);
      if (global.UI && global.UI.go) global.UI.go('pets');
    }
    function onDismiss() { closePopup(ov, true); }

    W.$$('[data-pets-meet]', ov).forEach(function (b) {
      b.addEventListener('click', onMeet);
    });
    W.$$('[data-pets-dismiss]', ov).forEach(function (b) {
      b.addEventListener('click', onDismiss);
    });
    ov.addEventListener('mousedown', function (e) {
      if (e.target === ov) onDismiss();
    });
  }

  /* Homescreen = student Home (portal). Teachers never land on portal in
     go(), so they skip this popup in v0 — document as known limitation. */
  function maybeShowEventPopup() {
    if (readDismissed()) return;
    var tries = 0;
    function attempt() {
      if (readDismissed() || popupOpen) return;
      /* Wait out role-pick / locked auth so we do not lose the one show. */
      if (document.querySelector('.role-pick') ||
          document.querySelector('.overlay[data-locked="1"]')) {
        if (tries++ < 40) setTimeout(attempt, 350);
        return;
      }
      showEventPopup();
    }
    setTimeout(attempt, 420);
  }

  function dismissOverlayIfOpen() {
    var ov = document.querySelector('.pets-event-overlay');
    if (ov) closePopup(ov, false);
  }

  global.Pets = {
    start: start,
    stop: stop,
    render: render,
    maybeShowEventPopup: maybeShowEventPopup,
    dismissOverlayIfOpen: dismissOverlayIfOpen,
    starters: STARTERS,
    /* test / ops helpers */
    _dismissKey: DISMISS_KEY,
    _rosterKey: ROSTER_KEY,
    _ensureRoster: ensureRoster,
    _readDismissed: readDismissed
  };
})(window);
