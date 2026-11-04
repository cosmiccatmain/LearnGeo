/* ------------------------------------------------------------------
   LearnGeo — Pets (Mongolian Brainrot collab)

   v0 shell: top-level Pets tab + homescreen event popup + starter roster.
   LEA-14: levels 1–10, XP, on-character skin stages A–D, pet detail UX.

   Dismiss rule (documented product choice for v0):
     C — until dismissed. localStorage key learngeo.pets.event.v0.dismissed
     persists across sessions. No server sync in v0 (known limitation).

   XP / earn hook (LEA-14 demo — real game hooks not wired yet):
     Pet detail "Play" grants PLAY_XP each click. Curve: to leave level N
     you need N × BASE_XP total XP into that level (mildly increasing).
     At level 10, further Play XP is discarded (soft cap; prestige OPEN).
     Persist: same localStorage roster key as v0 (learngeo.pets.roster.v0).
     Skin stage auto-follows level bands (plan §6): 1–3 A, 4–6 B, 7–9 C, 10 D.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons;
  var esc = W.escapeHtml;

  var EVENT_ID = 'mongolian-brainrot-v0';
  var DISMISS_KEY = 'learngeo.pets.event.v0.dismissed';
  var ROSTER_KEY = 'learngeo.pets.roster.v0';

  var MAX_LEVEL = 10;
  var BASE_XP = 40;
  var PLAY_XP = 25;

  var SKIN_LABELS = {
    A: 'Stage A — base',
    B: 'Stage B — evolved',
    C: 'Stage C — peak',
    D: 'Stage D — ascended'
  };

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

  /* Screen state: null = roster hub; species id = pet detail. */
  var selectedSpeciesId = null;
  var lastLevelUpFlash = null;

  function readDismissed() {
    try { return global.localStorage.getItem(DISMISS_KEY) === '1'; }
    catch (e) { return false; }
  }

  function writeDismissed() {
    try { global.localStorage.setItem(DISMISS_KEY, '1'); } catch (e) {}
  }

  function skinStageForLevel(level) {
    var n = Math.max(1, Math.min(MAX_LEVEL, Number(level) || 1));
    if (n >= 10) return 'D';
    if (n >= 7) return 'C';
    if (n >= 4) return 'B';
    return 'A';
  }

  function xpToAdvance(level) {
    var n = Math.max(1, Math.min(MAX_LEVEL - 1, Number(level) || 1));
    return n * BASE_XP;
  }

  function normalizeOwned(entry) {
    var level = Math.max(1, Math.min(MAX_LEVEL, Number(entry && entry.level) || 1));
    var xp = Math.max(0, Number(entry && entry.xp) || 0);
    if (level >= MAX_LEVEL) xp = 0;
    return {
      speciesId: entry.speciesId,
      level: level,
      xp: xp,
      skinStage: skinStageForLevel(level)
    };
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
     visible. Earn/grant rules remain OPEN in the plan. Migrates older
     v0 rows (level/skin only) by filling xp + recomputing skinStage. */
  function ensureRoster() {
    var data = readRoster();
    if (data && data.owned && data.owned.length) {
      data.owned = data.owned.map(normalizeOwned);
      writeRoster(data);
      return data;
    }
    data = {
      eventId: EVENT_ID,
      grantedAt: Date.now(),
      owned: STARTERS.map(function (s) {
        return normalizeOwned({ speciesId: s.id, level: 1, xp: 0 });
      })
    };
    writeRoster(data);
    return data;
  }

  function findOwned(roster, speciesId) {
    for (var i = 0; i < roster.owned.length; i++) {
      if (roster.owned[i].speciesId === speciesId) return roster.owned[i];
    }
    return null;
  }

  function saveOwned(speciesId, owned) {
    var roster = ensureRoster();
    for (var i = 0; i < roster.owned.length; i++) {
      if (roster.owned[i].speciesId === speciesId) {
        roster.owned[i] = normalizeOwned(owned);
        writeRoster(roster);
        return roster.owned[i];
      }
    }
    return null;
  }

  /* Apply delta XP; returns { owned, levelsGained, capped }. */
  function grantXp(speciesId, amount) {
    var roster = ensureRoster();
    var owned = findOwned(roster, speciesId);
    if (!owned) return null;
    var before = owned.level;
    var add = Math.max(0, Number(amount) || 0);
    if (owned.level >= MAX_LEVEL) {
      owned.xp = 0;
      owned.skinStage = skinStageForLevel(owned.level);
      saveOwned(speciesId, owned);
      return { owned: owned, levelsGained: 0, capped: true };
    }
    owned.xp += add;
    while (owned.level < MAX_LEVEL) {
      var need = xpToAdvance(owned.level);
      if (owned.xp < need) break;
      owned.xp -= need;
      owned.level += 1;
    }
    if (owned.level >= MAX_LEVEL) {
      owned.level = MAX_LEVEL;
      owned.xp = 0;
    }
    owned.skinStage = skinStageForLevel(owned.level);
    saveOwned(speciesId, owned);
    return {
      owned: owned,
      levelsGained: owned.level - before,
      capped: owned.level >= MAX_LEVEL && before >= MAX_LEVEL
    };
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

  function artHtml(s, owned, sizeClass) {
    var stage = owned.skinStage || skinStageForLevel(owned.level);
    return '<div class="pets-card__art pets-card__art--' + esc(s.art) +
      ' pets-card__art--stage-' + esc(stage) +
      (sizeClass ? ' ' + sizeClass : '') +
      '" data-stage="' + esc(stage) + '" aria-hidden="true">' +
      '<span class="pets-card__art-flare"></span>' +
      '<span class="pets-card__art-mark"></span>' +
    '</div>';
  }

  function petCard(owned) {
    var s = speciesById(owned.speciesId);
    if (!s) return '';
    var stage = owned.skinStage || skinStageForLevel(owned.level);
    return '<button type="button" class="pets-card" data-pet="' + esc(s.id) +
      '" aria-label="' + esc(s.name) + ', level ' + owned.level + '">' +
      artHtml(s, owned, '') +
      '<h3 class="pets-card__name">' + nameHtml(s.name) + '</h3>' +
      '<div class="pets-card__rarity">' + rarityHtml(s.rarity) + '</div>' +
      '<div class="pets-card__meta">' +
        '<span class="pets-card__level">Lv ' + owned.level + '</span>' +
        '<span class="pets-card__stage">' + esc(stage) + '</span>' +
      '</div>' +
    '</button>';
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

  function xpBarHtml(owned) {
    if (owned.level >= MAX_LEVEL) {
      return '<div class="pets-xp" role="status">' +
        '<div class="pets-xp__row"><span>Level ' + MAX_LEVEL + ' — max</span><span>Ascended</span></div>' +
        '<div class="pets-xp__track"><div class="pets-xp__fill pets-xp__fill--max" style="width:100%"></div></div>' +
      '</div>';
    }
    var need = xpToAdvance(owned.level);
    var pct = Math.min(100, Math.round((owned.xp / need) * 100));
    return '<div class="pets-xp" role="status" aria-label="Experience ' + owned.xp + ' of ' + need + '">' +
      '<div class="pets-xp__row"><span>Level ' + owned.level + ' → ' + (owned.level + 1) +
        '</span><span>' + owned.xp + ' / ' + need + ' XP</span></div>' +
      '<div class="pets-xp__track"><div class="pets-xp__fill" style="width:' + pct + '%"></div></div>' +
    '</div>';
  }

  function bindHub(el) {
    W.$$('[data-pet]', el).forEach(function (card) {
      card.addEventListener('click', function () {
        selectedSpeciesId = card.getAttribute('data-pet');
        lastLevelUpFlash = null;
        render();
      });
    });
  }

  function bindDetail(el, speciesId) {
    var back = el.querySelector('[data-pets-back]');
    if (back) {
      back.addEventListener('click', function () {
        selectedSpeciesId = null;
        lastLevelUpFlash = null;
        render();
      });
    }
    var play = el.querySelector('[data-pets-play]');
    if (play) {
      play.addEventListener('click', function () {
        var result = grantXp(speciesId, PLAY_XP);
        if (!result) return;
        if (result.levelsGained > 0) {
          lastLevelUpFlash = {
            speciesId: speciesId,
            level: result.owned.level,
            stage: result.owned.skinStage,
            gained: result.levelsGained
          };
        } else {
          lastLevelUpFlash = null;
        }
        render();
      });
    }
  }

  function renderHub(roster) {
    return '<div class="portal__inner pets">' +
      '<div class="pets__head">' +
        '<div class="eyebrow">Limited-time collab</div>' +
        '<h1>Pets</h1>' +
        '<p>Meet your starter brainrots. Level them up — skins evolve on-character through stage D.</p>' +
      '</div>' +
      '<div class="pets__banner">' + eventBannerHtml(false) + '</div>' +
      '<div class="pets__toolbar">' +
        '<span class="pets__toolbar-label">Starter roster</span>' +
        '<span class="t-sm t-muted">' + roster.owned.length + ' pets</span>' +
      '</div>' +
      '<div class="pets__grid">' +
        roster.owned.map(petCard).join('') +
      '</div>' +
      '<p class="pets__note">Tap a pet to train. XP comes from the Play action on pet detail for now — geography / Games hooks are not wired yet. Marketplace and uploads stay later.</p>' +
    '</div>';
  }

  function renderDetail(roster, speciesId) {
    var s = speciesById(speciesId);
    var owned = findOwned(roster, speciesId);
    if (!s || !owned) {
      selectedSpeciesId = null;
      return renderHub(roster);
    }
    var stage = owned.skinStage || skinStageForLevel(owned.level);
    var flash = lastLevelUpFlash && lastLevelUpFlash.speciesId === speciesId
      ? lastLevelUpFlash
      : null;
    var atMax = owned.level >= MAX_LEVEL;

    return '<div class="portal__inner pets pets--detail">' +
      '<button type="button" class="pets-back" data-pets-back>' +
        '<span aria-hidden="true">←</span> Back to roster' +
      '</button>' +
      (flash
        ? '<div class="pets-levelup" role="status">' +
            '<strong>Level up!</strong> Now Lv ' + flash.level +
            (flash.gained > 1 ? ' (+' + flash.gained + ')' : '') +
            ' · skin ' + esc(flash.stage) +
          '</div>'
        : '') +
      '<div class="pets-detail">' +
        '<div class="pets-detail__hero">' +
          artHtml(s, owned, 'pets-card__art--lg') +
          '<h1 class="pets-detail__name">' + nameHtml(s.name) + '</h1>' +
          '<div class="pets-card__rarity">' + rarityHtml(s.rarity) + '</div>' +
          '<div class="pets-detail__stage-line">' +
            '<span class="pets-detail__stage-badge">Skin ' + esc(stage) + '</span>' +
            '<span class="pets-detail__stage-label">' + esc(SKIN_LABELS[stage] || stage) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="pets-detail__panel">' +
          xpBarHtml(owned) +
          '<div class="pets-detail__bands" aria-label="Skin stage bands">' +
            '<span class="' + (stage === 'A' ? 'is-active' : '') + '">1–3 A</span>' +
            '<span class="' + (stage === 'B' ? 'is-active' : '') + '">4–6 B</span>' +
            '<span class="' + (stage === 'C' ? 'is-active' : '') + '">7–9 C</span>' +
            '<span class="' + (stage === 'D' ? 'is-active' : '') + '">10 D</span>' +
          '</div>' +
          '<div class="pets-detail__actions">' +
            '<button type="button" class="btn btn--sm btn--pets-primary" data-pets-play' +
              (atMax ? ' disabled' : '') + '>' +
              (atMax ? 'Max level' : 'Play (+' + PLAY_XP + ' XP)') +
            '</button>' +
          '</div>' +
          '<p class="pets-detail__hint">Demo XP only — Play grants ' + PLAY_XP +
            ' XP locally. Curve: level N needs ' + 'N×' + BASE_XP +
            ' XP. Real LearnGeo activity hooks come later.</p>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function render() {
    var el = host();
    if (!el) return;
    var roster = ensureRoster();
    if (selectedSpeciesId) {
      el.innerHTML = renderDetail(roster, selectedSpeciesId);
      bindDetail(el, selectedSpeciesId);
    } else {
      el.innerHTML = renderHub(roster);
      bindHub(el);
    }
  }

  function start() {
    render();
  }

  function stop() {
    selectedSpeciesId = null;
    lastLevelUpFlash = null;
  }

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
    skinStageForLevel: skinStageForLevel,
    xpToAdvance: xpToAdvance,
    grantXp: grantXp,
    /* test / ops helpers */
    _dismissKey: DISMISS_KEY,
    _rosterKey: ROSTER_KEY,
    _ensureRoster: ensureRoster,
    _readDismissed: readDismissed,
    _MAX_LEVEL: MAX_LEVEL,
    _BASE_XP: BASE_XP,
    _PLAY_XP: PLAY_XP
  };
})(window);
