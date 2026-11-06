/* ------------------------------------------------------------------
   LearnGeo — account Premium entitlements (LEA-43).

   Premium is account / player level, not teacher-based. The durable
   mark lives at save.flags.premium (same shape as flags.staff). Admins
   set it with ultra_set_premium; clients cannot flip it on via a push
   once 0013_premium_subscriptions.sql is applied.

   Games and cosmetics mark themselves with `premium: true`. This file
   is the single client check so the hub, shop, and score submit agree.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW;

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

  function active() {
    return !!flags().premium;
  }

  function gameRequires(id) {
    return !!PREMIUM_GAMES[id];
  }

  function gameAllowed(id) {
    if (!gameRequires(id)) return true;
    return active();
  }

  function itemRequires(item) {
    return !!(item && item.premium);
  }

  function itemAllowed(item) {
    if (!itemRequires(item)) return true;
    return active();
  }

  function stripUnearnedCosmetics() {
    var s = W && W.state;
    if (!s || !s.profile || active()) return false;
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
          '</p><p class="t-sm t-muted" style="margin:12px 0 0">Premium unlocks select Games and profile effects for your account — not a teacher plan.</p>',
        actions: [{ label: 'Got it', cls: 'btn--primary', close: true }]
      });
      return;
    }
    if (W && W.toast) W.toast('Premium', why, (W.Icons && W.Icons.lock) || null, 4200);
  }

  global.Premium = {
    PREMIUM_GAMES: PREMIUM_GAMES,
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
