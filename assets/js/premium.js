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
  var W = global.WW;

  var PREVIEW_KEY = 'learngeo.dev.premiumPreview';

  /* Keep in sync with public.premium_game_ids() in 0013. */
  var PREMIUM_GAMES = {
    chess: true,
    dash: true,
    golf: true,
    orbit: true
  };

  function flags() {
    var s = W && W.state;
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
    var s = W && W.state;
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
      ['avatar', 'avatars']
    ];
    slots.forEach(function (pair) {
      var slot = pair[0], list = Cos[pair[1]];
      if (!list) return;
      var id = s.profile[slot];
      var item = Cos.find(list, id);
      if (item && item.premium) {
        s.profile[slot] = list[0] ? list[0].id : (slot === 'avatar' ? 'globe' : 'none');
        if (slot === 'theme') s.profile.theme = 'default';
        if (slot === 'banner') s.profile.banner = 'plain';
        if (slot === 'decoration') s.profile.decoration = 'ring-slate';
        if (slot === 'avatar') s.profile.avatar = 'globe';
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
        icon: (W && W.Icons && W.Icons.lock) || null,
        body: '<p class="t-muted" style="margin:0">' + (W ? W.escapeHtml(why) : why) +
          '</p><p class="t-sm t-muted" style="margin:12px 0 0">Premium unlocks select Games and profile effects for your account — not a teacher plan. Checkout is mock / TEST only.</p>',
        actions: [{ label: 'Got it', cls: 'btn--primary', close: true }]
      });
      return;
    }
    if (W && W.toast) W.toast('Premium', why, (W.Icons && W.Icons.lock) || null, 4200);
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
    /* Local TEST flip used by SubscriptionDev mock checkout before / without RPC. */
    setLocal: function (on) {
      flags().premium = !!on;
      if (!on) stripUnearnedCosmetics();
      if (W && W.saveNow) W.saveNow();
      return !!on;
    }
  };
})(window);
