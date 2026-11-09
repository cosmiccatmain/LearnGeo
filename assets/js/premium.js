/* ------------------------------------------------------------------
   LearnGeo — account Premium entitlements (LEA-43 / LEA-46).

   Premium is account / player level, not teacher-based. The durable
   mark lives at save.flags.premium (same shape as flags.staff). Admins
   set it with ultra_set_premium; clients cannot flip it on via a push
   once 0013_premium_subscriptions.sql is applied.

   LEA-46: Premium plans UI and client gating are DEVELOPMENT-ONLY.
   Owner / UltraAdmin flips the preview in Administrator → Development.
   When the preview is off, Games and cosmetics do not show live
   paywalls or Premium locks. Checkout stays mock / TEST forever until
   a separate live-billing project lands.

   Games and cosmetics mark themselves with `premium: true`. This file
   is the single client check so the hub, shop, and score submit agree.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  /* core.js loads after this file, so WW must be resolved at call time. */
  function W() { return global.WW; }

  var PREVIEW_KEY = 'learngeo.dev.premiumPreview';

  /* Keep in sync with public.premium_game_ids() in 0022 (and 0013 base).
     Free: Geo Duel, Geo Chess (bots + PvP), Geo Dash, Capital Snake,
     Flag Match, Capital Maze, Geo Golf, Globe Defender.
     Gate remaining lesser-played hub arcade titles. */
  var PREMIUM_GAMES = {
    invaders: true,
    breakout: true,
    typer: true,
    crossing: true,
    whack: true,
    sort: true,
    stack: true,
    echo: true
  };

  function flags() {
    var ww = W();
    var s = ww && ww.state;
    if (!s) return {};
    if (!s.flags || typeof s.flags !== 'object') s.flags = {};
    return s.flags;
  }

  function previewEnabled() {
    try {
      return localStorage.getItem(PREVIEW_KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  function setPreviewEnabled(on) {
    try {
      localStorage.setItem(PREVIEW_KEY, on ? '1' : '0');
    } catch (e) { /* private mode */ }
    try {
      if (typeof CustomEvent === 'function') {
        global.dispatchEvent(new CustomEvent('learngeo:premium-preview', {
          detail: { on: !!on }
        }));
      }
    } catch (e2) { /* ignore */ }
    return !!on;
  }

  function trialActive() {
    /* LEA-49: 3-day all-games trial from referral TEST switch. */
    if (global.ReferralTrial && typeof global.ReferralTrial.trialActive === 'function') {
      return !!global.ReferralTrial.trialActive();
    }
    return false;
  }

  function active() {
    return !!flags().premium || trialActive();
  }

  function gameRequires(id) {
    return !!PREMIUM_GAMES[id];
  }

  /* Gates only apply while the Development preview switch is on. */
  function gameAllowed(id) {
    if (!gameRequires(id)) return true;
    if (!previewEnabled()) return true;
    return active();
  }

  function itemRequires(item) {
    return !!(item && item.premium);
  }

  function itemAllowed(item) {
    if (!itemRequires(item)) return true;
    if (!previewEnabled()) return true;
    return active();
  }

  function stripUnearnedCosmetics() {
    var s = W() && W().state;
    if (!s || !s.profile || active() || !previewEnabled()) return false;
    var Cos = global.Cosmetics;
    if (!Cos) return false;
    var changed = false;
    var slots = [
      ['effect', 'effects'],
      ['decoration', 'decorations'],
      ['nameplate', 'nameplates'],
      ['banner', 'banners'],
      ['theme', 'themes'],
      ['avatar', 'avatars'],
      ['dashTrail', 'trails'],
      ['dashJumper', 'jumpers'],
      ['chessBoard', 'chessBoards'],
      ['chessPieces', 'chessPieces'],
      ['snakeBody', 'snakeBodies'],
      ['matchBack', 'matchBacks'],
      ['mazeRunner', 'mazeRunners'],
      ['duelAccent', 'duelAccents']
    ];
    var freeFallback = {
      theme: 'default', banner: 'plain', decoration: 'ring-slate', avatar: 'globe',
      dashTrail: 'dust', dashJumper: 'classic',
      chessBoard: 'classic', chessPieces: 'classic',
      snakeBody: 'meadow', matchBack: 'indigo', mazeRunner: 'cyan', duelAccent: 'brand'
    };
    slots.forEach(function (pair) {
      var slot = pair[0], list = Cos[pair[1]];
      if (!list) return;
      var id = s.profile[slot];
      var item = Cos.find(list, id);
      if (item && item.premium) {
        if (freeFallback[slot] != null) s.profile[slot] = freeFallback[slot];
        else s.profile[slot] = list[0] ? list[0].id : 'none';
        changed = true;
      }
    });
    return changed;
  }

  function openUpgrade(reason) {
    if (!previewEnabled()) return;
    var why = reason || 'This content needs LearnGeo Premium.';
    if (global.SubscriptionDev && typeof global.SubscriptionDev.openUpgrade === 'function') {
      global.SubscriptionDev.openUpgrade(why);
      return;
    }
    if (global.UI && global.UI.modal) {
      global.UI.modal({
        title: 'Premium',
        icon: (W() && W().Icons && W().Icons.lock) || null,
        body: '<p class="t-muted" style="margin:0">' + (W() ? W().escapeHtml(why) : why) +
          '</p><p class="t-sm t-muted" style="margin:12px 0 0">Premium unlocks select Games and profile effects for your account — not a teacher plan. Checkout is mock / TEST only.</p>',
        actions: [{ label: 'Got it', cls: 'btn--primary', close: true }]
      });
      return;
    }
    if (W() && W().toast) W().toast('Premium', why, (W().Icons && W().Icons.lock) || null, 4200);
  }

  global.Premium = {
    PREMIUM_GAMES: PREMIUM_GAMES,
    PREVIEW_KEY: PREVIEW_KEY,
    previewEnabled: previewEnabled,
    setPreviewEnabled: setPreviewEnabled,
    active: active,
    gameRequires: gameRequires,
    gameAllowed: gameAllowed,
    itemRequires: itemRequires,
    itemAllowed: itemAllowed,
    stripUnearnedCosmetics: stripUnearnedCosmetics,
    openUpgrade: openUpgrade,
    /* Local TEST flip used by SubscriptionDev mock checkout before / without RPC.
       LEA-119: also awards / greys the Premium collection badge. */
    setLocal: function (on) {
      flags().premium = !!on;
      if (!on) stripUnearnedCosmetics();
      if (global.Badges && typeof global.Badges.syncPremium === 'function') {
        global.Badges.syncPremium({ announce: !!on, save: false });
      }
      if (W() && W().saveNow) W().saveNow();
      return !!on;
    }
  };
})(window);
