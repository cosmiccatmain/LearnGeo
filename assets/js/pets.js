/* ------------------------------------------------------------------
   LearnGeo — Pets (Mongolian Brainrot collab)

   v0 shell: top-level Pets tab + homescreen event popup + starter roster.
   LEA-14: levels 1–10, XP, on-character skin stages A–D, pet detail UX.
   LEA-15: customize cosmetics/traits; request a brainrot; upload design
     with moderation states.
   LEA-16: mutations (on-instance modifiers + blocky visual cues) and a
     local marketplace to list / buy / cancel high-level or mutated pets.

   Dismiss rule (documented product choice for v0):
     C — until dismissed. localStorage key learngeo.pets.event.v0.dismissed
     persists across sessions. No server sync in v0 (known limitation).

   XP / earn hook (LEA-14 demo — real game hooks not wired yet):
     Pet detail "Play" grants PLAY_XP each click. Curve: to leave level N
     you need N × BASE_XP total XP into that level (mildly increasing).
     At level 10, further Play XP is discarded (soft cap; prestige OPEN).
     Persist: same localStorage roster key as v0 (learngeo.pets.roster.v0).
     Skin stage auto-follows level bands (plan §6): 1–3 A, 4–6 B, 7–9 C, 10 D.

   Design queue (LEA-15 v1 — local only):
     learngeo.pets.designs.v0 holds request|upload rows with status
     pending → approved | rejected. Uploads store a data URL locally.
     Limits (documented in UI): PNG/JPEG/WebP, max UPLOAD_MAX_BYTES,
     max UPLOAD_MAX_PENDING pending items, school-safe affirmation required.
     Nothing goes public without a human approve action on the queue screen.

   Economy (LEA-16 v1 — local demo):
     Pets Diamonds live in learngeo.pets.wallet.v0 (soft currency for this
     collab surface). Kept separate from LearnGeo shop diamonds to avoid
     double-charge / shop-path bugs in v1. Starting balance START_DIAMONDS.
     Listings: learngeo.pets.market.v0. Fee FEE_BPS (10%). List gate:
     level >= MIN_LIST_LEVEL OR has mutation. Price bounds PRICE_MIN–MAX.
     Demo NPC listings seed once so Buy works without a second account.
     No real-money / crypto / off-platform trades.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons;
  var esc = W.escapeHtml;

  var EVENT_ID = 'mongolian-brainrot-v0';
  var DISMISS_KEY = 'learngeo.pets.event.v0.dismissed';
  var ROSTER_KEY = 'learngeo.pets.roster.v0';
  var DESIGNS_KEY = 'learngeo.pets.designs.v0';
  var WALLET_KEY = 'learngeo.pets.wallet.v0';
  var MARKET_KEY = 'learngeo.pets.market.v0';

  var MAX_LEVEL = 10;
  var BASE_XP = 40;
  var PLAY_XP = 25;

  /* Marketplace / mutation demo knobs (classroom-safe soft currency). */
  var START_DIAMONDS = 320;
  var MIN_LIST_LEVEL = 7;
  var PRICE_MIN = 10;
  var PRICE_MAX = 9999;
  var FEE_BPS = 1000; /* 10% platform fee shown before confirm */
  var MUTATION_ROLL_COST = 20;
  var MUTATION_ROLL_CHANCE = 0.4; /* paid attempt on detail */
  var MUTATION_PROC_STAGE = 0.14; /* free proc when crossing a skin stage */
  var MUTATION_PROC_MAX = 0.3; /* free proc when hitting level 10 */
  var YOU_SELLER = 'you';

  /* Upload / request limits for v1 local storage. */
  var UPLOAD_MAX_BYTES = 400 * 1024; /* ~400KB data URL payload */
  var UPLOAD_MAX_PENDING = 8;
  var UPLOAD_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
  var NAME_MAX = 40;
  var DESC_MAX = 280;
  var REF_MAX = 200;

  var SKIN_LABELS = {
    A: 'Stage A — base',
    B: 'Stage B — evolved',
    C: 'Stage C — peak',
    D: 'Stage D — ascended'
  };

  var SLOT_ORDER = ['aura', 'hat', 'frame', 'trail', 'catchphrase'];
  var SLOT_LABELS = {
    aura: 'Aura',
    hat: 'Hat / accessory',
    frame: 'Frame',
    trail: 'Trail / idle VFX',
    catchphrase: 'Catchphrase chip'
  };

  /* LearnGeo-authored catalog — school-safe only. Equipping never changes
     species identity. */
  var COSMETIC_CATALOG = [
    { id: 'aura-none', slot: 'aura', name: 'None', tier: 'Common', css: '' },
    { id: 'aura-spark', slot: 'aura', name: 'Sparkle Ring', tier: 'Common', css: 'spark' },
    { id: 'aura-mint', slot: 'aura', name: 'Mint Glow', tier: 'Rare', css: 'mint' },
    { id: 'hat-none', slot: 'hat', name: 'None', tier: 'Common', css: '' },
    { id: 'hat-cap', slot: 'hat', name: 'Class Cap', tier: 'Common', css: 'cap' },
    { id: 'hat-crown', slot: 'hat', name: 'Paper Crown', tier: 'Epic', css: 'crown' },
    { id: 'frame-none', slot: 'frame', name: 'None', tier: 'Common', css: '' },
    { id: 'frame-sticker', slot: 'frame', name: 'Sticker Border', tier: 'Common', css: 'sticker' },
    { id: 'frame-stars', slot: 'frame', name: 'Star Stickers', tier: 'Rare', css: 'stars' },
    { id: 'trail-none', slot: 'trail', name: 'None', tier: 'Common', css: '' },
    { id: 'trail-dots', slot: 'trail', name: 'Dot Bounce', tier: 'Common', css: 'dots' },
    { id: 'trail-confetti', slot: 'trail', name: 'Confetti Drift', tier: 'Rare', css: 'confetti' },
    { id: 'catch-none', slot: 'catchphrase', name: 'None', tier: 'Common', text: '' },
    { id: 'catch-ding', slot: 'catchphrase', name: 'Ding!', tier: 'Common', text: 'Ding!' },
    { id: 'catch-knock', slot: 'catchphrase', name: 'Who\'s there?', tier: 'Common', text: 'Who\'s there?' },
    { id: 'catch-geo', slot: 'catchphrase', name: 'Geo go!', tier: 'Rare', text: 'Geo go!' }
  ];

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

  /* School-safe mutation tags (plan §9 flavor). Applied per instance —
     species identity stays Jill/Jack/etc. */
  var MUTATIONS = [
    { id: 'glitched', label: 'Glitched', hint: 'Offset block shimmer' },
    { id: 'golden', label: 'Golden', hint: 'Warm metallic blocks' },
    { id: 'echo', label: 'Echo', hint: 'Soft after-image twin' },
    { id: 'static', label: 'Static', hint: 'Speckled TV snow' }
  ];

  /* Screen: hub | detail | customize | request | upload | queue | market | list
     instanceId for pet-scoped screens; listingId optional for market focus. */
  var screen = { name: 'hub', instanceId: null, listingId: null };
  var lastLevelUpFlash = null;
  var lastMutationFlash = null;
  var formNotice = null; /* { tone, text } flash after submit */
  var pendingUploadDataUrl = null;
  var pendingUploadMeta = null;
  var marketFilter = 'all'; /* all | mutated | high */

  function emptyCosmetics() {
    return { aura: 'aura-none', hat: 'hat-none', frame: 'frame-none',
      trail: 'trail-none', catchphrase: 'catch-none' };
  }

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

  function cosmeticById(id) {
    for (var i = 0; i < COSMETIC_CATALOG.length; i++) {
      if (COSMETIC_CATALOG[i].id === id) return COSMETIC_CATALOG[i];
    }
    return null;
  }

  function normalizeCosmetics(raw) {
    var base = emptyCosmetics();
    if (!raw || typeof raw !== 'object') return base;
    SLOT_ORDER.forEach(function (slot) {
      var id = raw[slot];
      var item = cosmeticById(id);
      if (item && item.slot === slot) base[slot] = item.id;
    });
    return base;
  }

  function mutationById(id) {
    if (!id) return null;
    for (var i = 0; i < MUTATIONS.length; i++) {
      if (MUTATIONS[i].id === id) return MUTATIONS[i];
    }
    return null;
  }

  function pickRandomMutation() {
    return MUTATIONS[Math.floor(Math.random() * MUTATIONS.length)];
  }

  function newInstanceId() {
    return 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function normalizeOwned(entry) {
    var level = Math.max(1, Math.min(MAX_LEVEL, Number(entry && entry.level) || 1));
    var xp = Math.max(0, Number(entry && entry.xp) || 0);
    if (level >= MAX_LEVEL) xp = 0;
    var mut = mutationById(entry && entry.mutationId);
    return {
      instanceId: (entry && entry.instanceId) || ('legacy-' + (entry && entry.speciesId || 'pet')),
      speciesId: entry.speciesId,
      level: level,
      xp: xp,
      skinStage: skinStageForLevel(level),
      cosmetics: normalizeCosmetics(entry && entry.cosmetics),
      mutationId: mut ? mut.id : null
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
     v0 rows by filling xp, cosmetics, instanceId, mutationId + skin. */
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
        return normalizeOwned({
          instanceId: newInstanceId(),
          speciesId: s.id,
          level: 1,
          xp: 0
        });
      })
    };
    writeRoster(data);
    return data;
  }

  function findOwned(roster, instanceId) {
    for (var i = 0; i < roster.owned.length; i++) {
      if (roster.owned[i].instanceId === instanceId) return roster.owned[i];
    }
    return null;
  }

  function saveOwned(instanceId, owned) {
    var roster = ensureRoster();
    for (var i = 0; i < roster.owned.length; i++) {
      if (roster.owned[i].instanceId === instanceId) {
        roster.owned[i] = normalizeOwned(owned);
        writeRoster(roster);
        return roster.owned[i];
      }
    }
    return null;
  }

  function removeOwned(instanceId) {
    var roster = ensureRoster();
    var next = [];
    var removed = null;
    for (var i = 0; i < roster.owned.length; i++) {
      if (roster.owned[i].instanceId === instanceId) removed = roster.owned[i];
      else next.push(roster.owned[i]);
    }
    if (!removed) return null;
    roster.owned = next;
    writeRoster(roster);
    return removed;
  }

  function addOwned(entry) {
    var roster = ensureRoster();
    var row = normalizeOwned(entry);
    roster.owned.push(row);
    writeRoster(roster);
    return row;
  }

  function canListPet(owned) {
    if (!owned) return false;
    return owned.level >= MIN_LIST_LEVEL || !!owned.mutationId;
  }

  /* Apply delta XP; returns { owned, levelsGained, capped, mutation }. */
  function grantXp(instanceId, amount) {
    var roster = ensureRoster();
    var owned = findOwned(roster, instanceId);
    if (!owned) return null;
    var before = owned.level;
    var add = Math.max(0, Number(amount) || 0);
    if (owned.level >= MAX_LEVEL) {
      owned.xp = 0;
      owned.skinStage = skinStageForLevel(owned.level);
      saveOwned(instanceId, owned);
      return { owned: owned, levelsGained: 0, capped: true, mutation: null };
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
    var mutGain = null;
    if (!owned.mutationId && owned.level > before) {
      var stageBefore = skinStageForLevel(before);
      var stageAfter = skinStageForLevel(owned.level);
      var hitMax = owned.level >= MAX_LEVEL && before < MAX_LEVEL;
      var crossed = stageBefore !== stageAfter || hitMax;
      if (crossed) {
        var chance = hitMax ? MUTATION_PROC_MAX : MUTATION_PROC_STAGE;
        if (Math.random() < chance) {
          var picked = pickRandomMutation();
          owned.mutationId = picked.id;
          mutGain = picked;
        }
      }
    }
    saveOwned(instanceId, owned);
    return {
      owned: owned,
      levelsGained: owned.level - before,
      capped: owned.level >= MAX_LEVEL && before >= MAX_LEVEL,
      mutation: mutGain
    };
  }

  function equipCosmetic(instanceId, slot, cosmeticId) {
    var owned = findOwned(ensureRoster(), instanceId);
    if (!owned) return null;
    var item = cosmeticById(cosmeticId);
    if (!item || item.slot !== slot) return null;
    owned.cosmetics = normalizeCosmetics(owned.cosmetics);
    owned.cosmetics[slot] = item.id;
    return saveOwned(instanceId, owned);
  }

  /* -------------------- Pets Diamonds wallet (local demo) --------- */
  function readWallet() {
    try {
      var raw = global.localStorage.getItem(WALLET_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.diamonds !== 'number') return null;
      return parsed;
    } catch (e) { return null; }
  }

  function writeWallet(data) {
    try { global.localStorage.setItem(WALLET_KEY, JSON.stringify(data)); } catch (e) {}
  }

  function ensureWallet() {
    var w = readWallet();
    if (w) {
      w.diamonds = Math.max(0, Math.floor(Number(w.diamonds) || 0));
      writeWallet(w);
      return w;
    }
    w = { diamonds: START_DIAMONDS, seededAt: Date.now() };
    writeWallet(w);
    return w;
  }

  function adjustDiamonds(delta) {
    var w = ensureWallet();
    w.diamonds = Math.max(0, Math.floor(w.diamonds + (Number(delta) || 0)));
    w.updatedAt = Date.now();
    writeWallet(w);
    return w;
  }

  function feeOf(price) {
    return Math.floor(Number(price) * FEE_BPS / 10000);
  }

  function netOf(price) {
    return Math.max(0, Number(price) - feeOf(price));
  }

  /* -------------------- marketplace listings ---------------------- */
  function readMarket() {
    try {
      var raw = global.localStorage.getItem(MARKET_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.listings)) return null;
      return parsed;
    } catch (e) { return null; }
  }

  function writeMarket(data) {
    try { global.localStorage.setItem(MARKET_KEY, JSON.stringify(data)); } catch (e) {}
  }

  function listingUid() {
    return 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function petSnapshot(owned) {
    return {
      instanceId: owned.instanceId,
      speciesId: owned.speciesId,
      level: owned.level,
      xp: owned.xp,
      skinStage: owned.skinStage,
      cosmetics: normalizeCosmetics(owned.cosmetics),
      mutationId: owned.mutationId || null
    };
  }

  function seedDemoListings() {
    /* NPC stock so Buy works in a single-device classroom demo. */
    return [
      {
        id: listingUid(),
        sellerId: 'demo-maya',
        sellerLabel: 'Maya (demo)',
        price: 85,
        feeBps: FEE_BPS,
        status: 'active',
        createdAt: Date.now() - 86400000,
        pet: {
          instanceId: newInstanceId(),
          speciesId: 'ding-dong-jill',
          level: 8,
          xp: 0,
          skinStage: 'C',
          cosmetics: emptyCosmetics(),
          mutationId: 'golden'
        }
      },
      {
        id: listingUid(),
        sellerId: 'demo-leo',
        sellerLabel: 'Leo (demo)',
        price: 120,
        feeBps: FEE_BPS,
        status: 'active',
        createdAt: Date.now() - 3600000,
        pet: {
          instanceId: newInstanceId(),
          speciesId: 'napoleon',
          level: 10,
          xp: 0,
          skinStage: 'D',
          cosmetics: emptyCosmetics(),
          mutationId: 'glitched'
        }
      },
      {
        id: listingUid(),
        sellerId: 'demo-sam',
        sellerLabel: 'Sam (demo)',
        price: 45,
        feeBps: FEE_BPS,
        status: 'active',
        createdAt: Date.now() - 7200000,
        pet: {
          instanceId: newInstanceId(),
          speciesId: 'knock-knock-jack',
          level: 7,
          xp: 0,
          skinStage: 'C',
          cosmetics: emptyCosmetics(),
          mutationId: null
        }
      }
    ];
  }

  function ensureMarket() {
    var data = readMarket();
    if (data && data.seeded) return data;
    data = {
      seeded: true,
      listings: seedDemoListings(),
      trades: []
    };
    writeMarket(data);
    return data;
  }

  function activeListings(data) {
    var out = [];
    var list = (data || ensureMarket()).listings;
    for (var i = 0; i < list.length; i++) {
      if (list[i].status === 'active') out.push(list[i]);
    }
    return out;
  }

  function findListing(id) {
    var data = ensureMarket();
    for (var i = 0; i < data.listings.length; i++) {
      if (data.listings[i].id === id) return data.listings[i];
    }
    return null;
  }

  function listPet(instanceId, price) {
    var owned = findOwned(ensureRoster(), instanceId);
    if (!owned) return { ok: false, error: 'Pet not found on your roster.' };
    if (!canListPet(owned)) {
      return {
        ok: false,
        error: 'Listable pets need level ' + MIN_LIST_LEVEL + '+ or a mutation.'
      };
    }
    var p = Math.floor(Number(price) || 0);
    if (p < PRICE_MIN || p > PRICE_MAX) {
      return {
        ok: false,
        error: 'Price must be between ' + PRICE_MIN + ' and ' + PRICE_MAX + ' Pets Diamonds.'
      };
    }
    var removed = removeOwned(instanceId);
    if (!removed) return { ok: false, error: 'Could not move pet to the market.' };
    var data = ensureMarket();
    var listing = {
      id: listingUid(),
      sellerId: YOU_SELLER,
      sellerLabel: 'You',
      price: p,
      feeBps: FEE_BPS,
      status: 'active',
      createdAt: Date.now(),
      pet: petSnapshot(removed)
    };
    data.listings.unshift(listing);
    writeMarket(data);
    return { ok: true, listing: listing };
  }

  function cancelListing(listingId) {
    var data = ensureMarket();
    var listing = null;
    for (var i = 0; i < data.listings.length; i++) {
      if (data.listings[i].id === listingId) { listing = data.listings[i]; break; }
    }
    if (!listing || listing.status !== 'active') {
      return { ok: false, error: 'Listing is not active.' };
    }
    if (listing.sellerId !== YOU_SELLER) {
      return { ok: false, error: 'You can only cancel your own listings.' };
    }
    listing.status = 'cancelled';
    listing.cancelledAt = Date.now();
    writeMarket(data);
    addOwned(listing.pet);
    return { ok: true, listing: listing };
  }

  function buyListing(listingId) {
    var data = ensureMarket();
    var listing = null;
    for (var i = 0; i < data.listings.length; i++) {
      if (data.listings[i].id === listingId) { listing = data.listings[i]; break; }
    }
    if (!listing || listing.status !== 'active') {
      return { ok: false, error: 'That listing is gone.' };
    }
    if (listing.sellerId === YOU_SELLER) {
      return { ok: false, error: 'You cannot buy your own listing. Cancel it instead.' };
    }
    var wallet = ensureWallet();
    if (wallet.diamonds < listing.price) {
      return {
        ok: false,
        error: 'Not enough Pets Diamonds (need ' + listing.price + ', have ' + wallet.diamonds + ').'
      };
    }
    adjustDiamonds(-listing.price);
    /* Demo NPC sellers: fee + price are sunk (no peer wallet). Documented. */
    listing.status = 'sold';
    listing.soldAt = Date.now();
    listing.buyerId = YOU_SELLER;
    var fee = feeOf(listing.price);
    data.trades = data.trades || [];
    data.trades.unshift({
      listingId: listing.id,
      buyerId: YOU_SELLER,
      sellerId: listing.sellerId,
      gross: listing.price,
      fee: fee,
      net: listing.price - fee,
      at: Date.now()
    });
    writeMarket(data);
    var pet = normalizeOwned(listing.pet);
    pet.instanceId = newInstanceId(); /* fresh id so buyer never collides */
    addOwned(pet);
    return { ok: true, listing: listing, pet: pet, fee: fee };
  }

  function tryMutationRoll(instanceId) {
    var owned = findOwned(ensureRoster(), instanceId);
    if (!owned) return { ok: false, error: 'Pet not found.' };
    if (owned.mutationId) {
      return { ok: false, error: 'This pet already has a mutation.' };
    }
    if (owned.level < MIN_LIST_LEVEL && owned.level < MAX_LEVEL) {
      return {
        ok: false,
        error: 'Mutation rolls unlock at level ' + MIN_LIST_LEVEL + '+ (or try leveling into a new skin stage).'
      };
    }
    var wallet = ensureWallet();
    if (wallet.diamonds < MUTATION_ROLL_COST) {
      return {
        ok: false,
        error: 'Need ' + MUTATION_ROLL_COST + ' Pets Diamonds for a mutation attempt.'
      };
    }
    adjustDiamonds(-MUTATION_ROLL_COST);
    if (Math.random() < MUTATION_ROLL_CHANCE) {
      var picked = pickRandomMutation();
      owned.mutationId = picked.id;
      saveOwned(instanceId, owned);
      return { ok: true, mutation: picked, owned: owned };
    }
    return { ok: true, mutation: null, owned: owned, miss: true };
  }

  /* -------------------- design request / upload queue ------------- */
  function readDesigns() {
    try {
      var raw = global.localStorage.getItem(DESIGNS_KEY);
      if (!raw) return { items: [] };
      var parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.items)) return { items: [] };
      return parsed;
    } catch (e) { return { items: [] }; }
  }

  function writeDesigns(data) {
    try { global.localStorage.setItem(DESIGNS_KEY, JSON.stringify(data)); } catch (e) {}
  }

  function countPending() {
    var items = readDesigns().items;
    var n = 0;
    for (var i = 0; i < items.length; i++) {
      if (items[i].status === 'pending') n++;
    }
    return n;
  }

  function uid() {
    return 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function softProfanityHit(text) {
    /* Minimal classroom blocklist — not a full filter; mods still review. */
    var t = String(text || '').toLowerCase();
    var bad = ['kill', 'hate', 'nsfw', 'porn', 'sex', 'nude', 'damn', 'hell'];
    for (var i = 0; i < bad.length; i++) {
      if (t.indexOf(bad[i]) !== -1) return true;
    }
    return false;
  }

  function addDesign(entry) {
    var data = readDesigns();
    data.items.unshift(entry);
    writeDesigns(data);
    return entry;
  }

  function updateDesignStatus(id, status, reason) {
    var data = readDesigns();
    for (var i = 0; i < data.items.length; i++) {
      if (data.items[i].id === id) {
        data.items[i].status = status;
        data.items[i].reviewedAt = Date.now();
        data.items[i].reason = reason || '';
        /* Drop heavy data URL after reject to save quota (v1 audit = metadata). */
        if (status === 'rejected' && data.items[i].dataUrl) {
          data.items[i].dataUrl = null;
          data.items[i].cleared = true;
        }
        writeDesigns(data);
        return data.items[i];
      }
    }
    return null;
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

  function cosmeticsClasses(cosmetics) {
    var c = normalizeCosmetics(cosmetics);
    var parts = [];
    SLOT_ORDER.forEach(function (slot) {
      if (slot === 'catchphrase') return;
      var item = cosmeticById(c[slot]);
      if (item && item.css) parts.push('pets-cos--' + slot + '-' + item.css);
    });
    return parts.join(' ');
  }

  function catchphraseHtml(cosmetics) {
    var c = normalizeCosmetics(cosmetics);
    var item = cosmeticById(c.catchphrase);
    if (!item || !item.text) return '';
    return '<div class="pets-catch" aria-hidden="true">' + esc(item.text) + '</div>';
  }

  function mutationBadgeHtml(mutationId) {
    var m = mutationById(mutationId);
    if (!m) return '';
    return '<span class="pets-mut-badge pets-mut-badge--' + esc(m.id) + '">' +
      esc(m.label) + '</span>';
  }

  /* Blox Fruits–adjacent placeholder: chunky square head/torso/limbs
     (CSS blocks). Not smooth round avatars. Species tint via art class.
     Mutations add a visual cue class — identity stays on-character. */
  function artHtml(s, owned, sizeClass) {
    var stage = owned.skinStage || skinStageForLevel(owned.level);
    var cos = cosmeticsClasses(owned.cosmetics);
    var mut = mutationById(owned.mutationId);
    return '<div class="pets-card__art pets-card__art--' + esc(s.art) +
      ' pets-card__art--stage-' + esc(stage) +
      (mut ? ' pets-card__art--mut-' + esc(mut.id) : '') +
      (cos ? ' ' + cos : '') +
      (sizeClass ? ' ' + sizeClass : '') +
      '" data-stage="' + esc(stage) + '"' +
      (mut ? ' data-mutation="' + esc(mut.id) + '"' : '') +
      ' aria-hidden="true">' +
      '<div class="pets-blox">' +
        '<span class="pets-blox__hat"></span>' +
        '<span class="pets-blox__head">' +
          '<span class="pets-blox__eye pets-blox__eye--l"></span>' +
          '<span class="pets-blox__eye pets-blox__eye--r"></span>' +
          '<span class="pets-blox__mouth"></span>' +
        '</span>' +
        '<span class="pets-blox__torso">' +
          '<span class="pets-blox__arm pets-blox__arm--l"></span>' +
          '<span class="pets-blox__arm pets-blox__arm--r"></span>' +
        '</span>' +
        '<span class="pets-blox__legs">' +
          '<span class="pets-blox__leg pets-blox__leg--l"></span>' +
          '<span class="pets-blox__leg pets-blox__leg--r"></span>' +
        '</span>' +
      '</div>' +
      '<span class="pets-card__art-flare"></span>' +
      '<span class="pets-card__art-trail"></span>' +
      (mut ? '<span class="pets-mut-cue" title="' + esc(mut.label) + '"></span>' : '') +
    '</div>';
  }

  function petCard(owned) {
    var s = speciesById(owned.speciesId);
    if (!s) return '';
    var stage = owned.skinStage || skinStageForLevel(owned.level);
    var mut = mutationById(owned.mutationId);
    var aria = s.name + ', level ' + owned.level +
      (mut ? ', ' + mut.label + ' mutation' : '');
    return '<button type="button" class="pets-card' +
      (mut ? ' pets-card--mutated' : '') +
      '" data-pet="' + esc(owned.instanceId) +
      '" aria-label="' + esc(aria) + '">' +
      artHtml(s, owned, '') +
      catchphraseHtml(owned.cosmetics) +
      '<h3 class="pets-card__name">' + nameHtml(s.name) + '</h3>' +
      '<div class="pets-card__rarity">' + rarityHtml(s.rarity) + '</div>' +
      '<div class="pets-card__meta">' +
        '<span class="pets-card__level">Lv ' + owned.level + '</span>' +
        '<span class="pets-card__stage">' + esc(stage) + '</span>' +
        (mut ? mutationBadgeHtml(mut.id) : '') +
      '</div>' +
    '</button>';
  }

  function walletChipHtml() {
    var w = ensureWallet();
    return '<span class="pets-wallet" title="Pets Diamonds — local demo currency">' +
      '<span class="pets-wallet__gem" aria-hidden="true">◆</span>' +
      '<span class="pets-wallet__n">' + w.diamonds + '</span>' +
      '<span class="pets-wallet__lbl">Pets Diamonds</span>' +
    '</span>';
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

  function noticeHtml() {
    if (!formNotice) return '';
    var tone = formNotice.tone === 'ok' ? 'pets-notice--ok' :
      (formNotice.tone === 'err' ? 'pets-notice--err' : '');
    return '<div class="pets-notice ' + tone + '" role="status">' + esc(formNotice.text) + '</div>';
  }

  function statusBadge(status) {
    var label = status === 'approved' ? 'Approved' :
      (status === 'rejected' ? 'Rejected' : 'Pending review');
    return '<span class="pets-status pets-status--' + esc(status) + '">' + esc(label) + '</span>';
  }

  function goHub() {
    screen = { name: 'hub', instanceId: null, listingId: null };
    lastLevelUpFlash = null;
    lastMutationFlash = null;
    formNotice = null;
    pendingUploadDataUrl = null;
    pendingUploadMeta = null;
    render();
  }

  function goDetail(instanceId) {
    screen = { name: 'detail', instanceId: instanceId, listingId: null };
    formNotice = null;
    render();
  }

  function goCustomize(instanceId) {
    screen = { name: 'customize', instanceId: instanceId, listingId: null };
    formNotice = null;
    render();
  }

  function goRequest() {
    screen = { name: 'request', instanceId: null, listingId: null };
    formNotice = null;
    render();
  }

  function goUpload() {
    screen = { name: 'upload', instanceId: null, listingId: null };
    formNotice = null;
    pendingUploadDataUrl = null;
    pendingUploadMeta = null;
    render();
  }

  function goQueue() {
    screen = { name: 'queue', instanceId: null, listingId: null };
    formNotice = null;
    render();
  }

  function goMarket() {
    screen = { name: 'market', instanceId: null, listingId: null };
    formNotice = null;
    ensureWallet();
    ensureMarket();
    render();
  }

  function goList(instanceId) {
    screen = { name: 'list', instanceId: instanceId, listingId: null };
    formNotice = null;
    render();
  }

  function bindHub(el) {
    W.$$('[data-pet]', el).forEach(function (card) {
      card.addEventListener('click', function () {
        lastLevelUpFlash = null;
        lastMutationFlash = null;
        goDetail(card.getAttribute('data-pet'));
      });
    });
    var req = el.querySelector('[data-pets-request]');
    if (req) req.addEventListener('click', goRequest);
    var up = el.querySelector('[data-pets-upload]');
    if (up) up.addEventListener('click', goUpload);
    var q = el.querySelector('[data-pets-queue]');
    if (q) q.addEventListener('click', goQueue);
    var m = el.querySelector('[data-pets-market]');
    if (m) m.addEventListener('click', goMarket);
  }

  function bindDetail(el, instanceId) {
    var back = el.querySelector('[data-pets-back]');
    if (back) back.addEventListener('click', goHub);
    var play = el.querySelector('[data-pets-play]');
    if (play) {
      play.addEventListener('click', function () {
        var result = grantXp(instanceId, PLAY_XP);
        if (!result) return;
        if (result.levelsGained > 0) {
          lastLevelUpFlash = {
            instanceId: instanceId,
            level: result.owned.level,
            stage: result.owned.skinStage,
            gained: result.levelsGained
          };
        } else {
          lastLevelUpFlash = null;
        }
        if (result.mutation) {
          lastMutationFlash = {
            instanceId: instanceId,
            label: result.mutation.label,
            id: result.mutation.id
          };
        }
        render();
      });
    }
    var custom = el.querySelector('[data-pets-customize]');
    if (custom) {
      custom.addEventListener('click', function () {
        goCustomize(instanceId);
      });
    }
    var roll = el.querySelector('[data-pets-mut-roll]');
    if (roll) {
      roll.addEventListener('click', function () {
        var result = tryMutationRoll(instanceId);
        if (!result.ok) {
          formNotice = { tone: 'err', text: result.error };
          render();
          return;
        }
        if (result.mutation) {
          lastMutationFlash = {
            instanceId: instanceId,
            label: result.mutation.label,
            id: result.mutation.id
          };
          formNotice = {
            tone: 'ok',
            text: 'Mutation unlocked: ' + result.mutation.label + '!'
          };
        } else {
          formNotice = {
            tone: 'err',
            text: 'No mutation this time (−' + MUTATION_ROLL_COST + ' Pets Diamonds). Try again later.'
          };
        }
        render();
      });
    }
    var listBtn = el.querySelector('[data-pets-list]');
    if (listBtn) {
      listBtn.addEventListener('click', function () {
        goList(instanceId);
      });
    }
  }

  function bindCustomize(el, instanceId) {
    var back = el.querySelector('[data-pets-back]');
    if (back) {
      back.addEventListener('click', function () { goDetail(instanceId); });
    }
    W.$$('[data-pets-equip]', el).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var slot = btn.getAttribute('data-slot');
        var id = btn.getAttribute('data-pets-equip');
        equipCosmetic(instanceId, slot, id);
        render();
      });
    });
  }

  function bindRequest(el) {
    var back = el.querySelector('[data-pets-back]');
    if (back) back.addEventListener('click', goHub);
    var form = el.querySelector('[data-pets-request-form]');
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = (form.querySelector('[name="name"]').value || '').trim();
      var desc = (form.querySelector('[name="desc"]').value || '').trim();
      var ref = (form.querySelector('[name="ref"]').value || '').trim();
      var safe = form.querySelector('[name="safe"]').checked;
      if (!name || name.length > NAME_MAX) {
        formNotice = { tone: 'err', text: 'Add a school-safe name (max ' + NAME_MAX + ' characters).' };
        render();
        return;
      }
      if (!desc || desc.length > DESC_MAX) {
        formNotice = { tone: 'err', text: 'Add a short description (max ' + DESC_MAX + ' characters).' };
        render();
        return;
      }
      if (ref.length > REF_MAX) {
        formNotice = { tone: 'err', text: 'Reference link is too long.' };
        render();
        return;
      }
      if (!safe) {
        formNotice = { tone: 'err', text: 'Confirm the school-safe guidelines before sending.' };
        render();
        return;
      }
      if (softProfanityHit(name + ' ' + desc)) {
        formNotice = { tone: 'err', text: 'Please keep names and descriptions classroom-friendly.' };
        render();
        return;
      }
      if (countPending() >= UPLOAD_MAX_PENDING) {
        formNotice = { tone: 'err', text: 'Too many pending items. Wait for review before sending more.' };
        render();
        return;
      }
      addDesign({
        id: uid(),
        type: 'request',
        name: name,
        desc: desc,
        ref: ref,
        status: 'pending',
        createdAt: Date.now(),
        reason: '',
        dataUrl: null
      });
      formNotice = { tone: 'ok', text: 'Request sent! It stays pending until a moderator reviews it.' };
      goQueue();
    });
  }

  function bindUpload(el) {
    var back = el.querySelector('[data-pets-back]');
    if (back) back.addEventListener('click', goHub);
    var fileInput = el.querySelector('[data-pets-file]');
    var preview = el.querySelector('[data-pets-preview]');
    if (fileInput) {
      fileInput.addEventListener('change', function () {
        var file = fileInput.files && fileInput.files[0];
        pendingUploadDataUrl = null;
        pendingUploadMeta = null;
        if (!file) {
          if (preview) preview.innerHTML = '';
          return;
        }
        if (UPLOAD_TYPES.indexOf(file.type) === -1) {
          formNotice = { tone: 'err', text: 'Use PNG, JPEG, or WebP only.' };
          fileInput.value = '';
          render();
          return;
        }
        if (file.size > UPLOAD_MAX_BYTES) {
          formNotice = { tone: 'err', text: 'File is too large (max ' + Math.round(UPLOAD_MAX_BYTES / 1024) + ' KB for v1).' };
          fileInput.value = '';
          render();
          return;
        }
        var reader = new FileReader();
        reader.onload = function () {
          pendingUploadDataUrl = String(reader.result || '');
          pendingUploadMeta = { name: file.name, type: file.type, size: file.size };
          formNotice = null;
          if (preview) {
            preview.innerHTML = '<img class="pets-upload__img" alt="Design preview" src="' +
              pendingUploadDataUrl.replace(/"/g, '') + '">' +
              '<div class="pets-upload__meta">' + esc(file.name) + ' · ' +
              Math.round(file.size / 1024) + ' KB</div>';
          }
        };
        reader.onerror = function () {
          formNotice = { tone: 'err', text: 'Could not read that file. Try another image.' };
          render();
        };
        reader.readAsDataURL(file);
      });
    }
    var form = el.querySelector('[data-pets-upload-form]');
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var title = (form.querySelector('[name="title"]').value || '').trim();
      var notes = (form.querySelector('[name="notes"]').value || '').trim();
      var safe = form.querySelector('[name="safe"]').checked;
      if (!title || title.length > NAME_MAX) {
        formNotice = { tone: 'err', text: 'Add a school-safe title (max ' + NAME_MAX + ' characters).' };
        render();
        return;
      }
      if (notes.length > DESC_MAX) {
        formNotice = { tone: 'err', text: 'Notes are too long (max ' + DESC_MAX + ' characters).' };
        render();
        return;
      }
      if (!safe) {
        formNotice = { tone: 'err', text: 'Confirm the school-safe guidelines before uploading.' };
        render();
        return;
      }
      if (!pendingUploadDataUrl || !pendingUploadMeta) {
        formNotice = { tone: 'err', text: 'Choose a PNG, JPEG, or WebP image first.' };
        render();
        return;
      }
      if (softProfanityHit(title + ' ' + notes)) {
        formNotice = { tone: 'err', text: 'Please keep titles and notes classroom-friendly.' };
        render();
        return;
      }
      if (countPending() >= UPLOAD_MAX_PENDING) {
        formNotice = { tone: 'err', text: 'Too many pending items. Wait for review before uploading more.' };
        render();
        return;
      }
      addDesign({
        id: uid(),
        type: 'upload',
        name: title,
        desc: notes,
        ref: '',
        status: 'pending',
        createdAt: Date.now(),
        reason: '',
        dataUrl: pendingUploadDataUrl,
        fileMeta: pendingUploadMeta
      });
      pendingUploadDataUrl = null;
      pendingUploadMeta = null;
      formNotice = { tone: 'ok', text: 'Design uploaded for review. It will not appear publicly until approved.' };
      goQueue();
    });
  }

  function bindQueue(el) {
    var back = el.querySelector('[data-pets-back]');
    if (back) back.addEventListener('click', goHub);
    W.$$('[data-pets-approve]', el).forEach(function (btn) {
      btn.addEventListener('click', function () {
        updateDesignStatus(btn.getAttribute('data-pets-approve'), 'approved', '');
        formNotice = { tone: 'ok', text: 'Marked approved (local v1 — not published to a live catalog yet).' };
        render();
      });
    });
    W.$$('[data-pets-reject]', el).forEach(function (btn) {
      btn.addEventListener('click', function () {
        updateDesignStatus(btn.getAttribute('data-pets-reject'), 'rejected',
          'Does not meet school-safe guidelines (local v1).');
        formNotice = { tone: 'ok', text: 'Marked rejected. Upload preview cleared to save space.' };
        render();
      });
    });
  }

  function bindMarket(el) {
    var back = el.querySelector('[data-pets-back]');
    if (back) back.addEventListener('click', goHub);
    W.$$('[data-pets-filter]', el).forEach(function (btn) {
      btn.addEventListener('click', function () {
        marketFilter = btn.getAttribute('data-pets-filter') || 'all';
        render();
      });
    });
    W.$$('[data-pets-buy]', el).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-pets-buy');
        var listing = findListing(id);
        if (!listing) return;
        var fee = feeOf(listing.price);
        var ok = global.confirm(
          'Buy for ' + listing.price + ' Pets Diamonds?\n' +
          'Platform fee on this sale: ' + fee + ' (seller would net ' + netOf(listing.price) + ').'
        );
        if (!ok) return;
        var result = buyListing(id);
        if (!result.ok) {
          formNotice = { tone: 'err', text: result.error };
          render();
          return;
        }
        formNotice = {
          tone: 'ok',
          text: 'Purchased! The brainrot is on your roster (−' + listing.price + ' Pets Diamonds).'
        };
        render();
      });
    });
    W.$$('[data-pets-cancel-listing]', el).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var result = cancelListing(btn.getAttribute('data-pets-cancel-listing'));
        if (!result.ok) {
          formNotice = { tone: 'err', text: result.error };
        } else {
          formNotice = { tone: 'ok', text: 'Listing cancelled. Pet returned to your roster.' };
        }
        render();
      });
    });
    var listEligible = el.querySelector('[data-pets-go-list]');
    if (listEligible) {
      listEligible.addEventListener('click', function () {
        var roster = ensureRoster();
        var eligible = null;
        for (var i = 0; i < roster.owned.length; i++) {
          if (canListPet(roster.owned[i])) { eligible = roster.owned[i]; break; }
        }
        if (!eligible) {
          formNotice = {
            tone: 'err',
            text: 'No listable pets yet. Reach level ' + MIN_LIST_LEVEL +
              '+ or unlock a mutation first.'
          };
          render();
          return;
        }
        goList(eligible.instanceId);
      });
    }
  }

  function bindList(el, instanceId) {
    var back = el.querySelector('[data-pets-back]');
    if (back) {
      back.addEventListener('click', function () { goDetail(instanceId); });
    }
    var form = el.querySelector('[data-pets-list-form]');
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var price = form.querySelector('[name="price"]').value;
      var result = listPet(instanceId, price);
      if (!result.ok) {
        formNotice = { tone: 'err', text: result.error };
        render();
        return;
      }
      formNotice = {
        tone: 'ok',
        text: 'Listed for ' + result.listing.price +
          ' Pets Diamonds (fee ' + feeOf(result.listing.price) +
          ' · you would net ' + netOf(result.listing.price) + ').'
      };
      goMarket();
    });
  }

  function renderHub(roster) {
    var pending = countPending();
    var live = activeListings(ensureMarket()).length;
    var emptyRoster = !roster.owned.length;
    return '<div class="portal__inner pets">' +
      '<div class="pets__head">' +
        '<div class="pets__head-row">' +
          '<div>' +
            '<div class="eyebrow">Limited-time collab</div>' +
            '<h1>Pets</h1>' +
          '</div>' +
          walletChipHtml() +
        '</div>' +
        '<p>Meet your starter brainrots. Level them up, unlock mutations, customize looks, and trade high-level pets in the marketplace.</p>' +
      '</div>' +
      '<div class="pets__banner">' + eventBannerHtml(false) + '</div>' +
      '<div class="pets__toolbar">' +
        '<span class="pets__toolbar-label">Your roster</span>' +
        '<span class="t-sm t-muted">' + roster.owned.length + ' pets</span>' +
      '</div>' +
      (emptyRoster
        ? '<div class="pets-empty" role="status">' +
            '<strong>Roster empty</strong>' +
            '<p>Your pets may be listed on the marketplace. Cancel a listing or buy a demo listing to fill the roster.</p>' +
            '<button type="button" class="btn btn--sm btn--pets-primary" data-pets-market>Open marketplace</button>' +
          '</div>'
        : '<div class="pets__grid">' +
            roster.owned.map(petCard).join('') +
          '</div>') +
      '<div class="pets__market-cta">' +
        '<div class="pets__create-head">' +
          '<span class="pets__toolbar-label">Marketplace</span>' +
          '<span class="t-sm t-muted">' + live + ' live listing' + (live === 1 ? '' : 's') + '</span>' +
        '</div>' +
        '<div class="pets__create-actions">' +
          '<button type="button" class="btn btn--sm btn--pets-primary" data-pets-market>Browse market</button>' +
        '</div>' +
        '<p class="pets__note pets__note--tight">Sell level ' + MIN_LIST_LEVEL +
          '+ or mutated brainrots for <strong>Pets Diamonds</strong> (local demo currency, separate from the main diamond shop).</p>' +
      '</div>' +
      '<div class="pets__create">' +
        '<div class="pets__create-head">' +
          '<span class="pets__toolbar-label">Create</span>' +
          '<span class="t-sm t-muted">Moderated · classroom-safe</span>' +
        '</div>' +
        '<div class="pets__create-actions">' +
          '<button type="button" class="btn btn--sm btn--pets-secondary" data-pets-request>Request a brainrot</button>' +
          '<button type="button" class="btn btn--sm btn--pets-secondary" data-pets-upload>Upload a design</button>' +
          '<button type="button" class="btn btn--sm btn--pets-ghost-dark" data-pets-queue>' +
            'Review queue' + (pending ? ' (' + pending + ')' : '') +
          '</button>' +
        '</div>' +
        '<p class="pets__note pets__note--tight">Requests and uploads stay <strong>pending</strong> until approved. Nothing goes live unmoderated.</p>' +
      '</div>' +
      '<p class="pets__note">Tap a pet to train, mutate, customize, or list. Mutations can proc when you cross a skin stage; paid rolls cost ' +
        MUTATION_ROLL_COST + ' Pets Diamonds from level ' + MIN_LIST_LEVEL + '+.</p>' +
    '</div>';
  }

  function renderDetail(roster, instanceId) {
    var owned = findOwned(roster, instanceId);
    var s = owned ? speciesById(owned.speciesId) : null;
    if (!s || !owned) {
      screen = { name: 'hub', instanceId: null, listingId: null };
      return renderHub(roster);
    }
    var stage = owned.skinStage || skinStageForLevel(owned.level);
    var flash = lastLevelUpFlash && lastLevelUpFlash.instanceId === instanceId
      ? lastLevelUpFlash
      : null;
    var mutFlash = lastMutationFlash && lastMutationFlash.instanceId === instanceId
      ? lastMutationFlash
      : null;
    var atMax = owned.level >= MAX_LEVEL;
    var mut = mutationById(owned.mutationId);
    var listable = canListPet(owned);
    var canRoll = !mut && owned.level >= MIN_LIST_LEVEL;
    var cos = normalizeCosmetics(owned.cosmetics);
    var equippedBits = SLOT_ORDER.map(function (slot) {
      var item = cosmeticById(cos[slot]);
      if (!item || item.id.indexOf('-none') !== -1) return null;
      return SLOT_LABELS[slot] + ': ' + item.name;
    }).filter(Boolean);

    return '<div class="portal__inner pets pets--detail">' +
      '<button type="button" class="pets-back" data-pets-back>' +
        '<span aria-hidden="true">←</span> Back to roster' +
      '</button>' +
      noticeHtml() +
      (flash
        ? '<div class="pets-levelup" role="status">' +
            '<strong>Level up!</strong> Now Lv ' + flash.level +
            (flash.gained > 1 ? ' (+' + flash.gained + ')' : '') +
            ' · skin ' + esc(flash.stage) +
          '</div>'
        : '') +
      (mutFlash
        ? '<div class="pets-mutflash" role="status">' +
            '<strong>Mutation!</strong> ' + esc(mutFlash.label) +
            ' — still the same brainrot, louder look.' +
          '</div>'
        : '') +
      '<div class="pets-detail">' +
        '<div class="pets-detail__hero">' +
          artHtml(s, owned, 'pets-card__art--lg') +
          catchphraseHtml(owned.cosmetics) +
          '<h1 class="pets-detail__name">' + nameHtml(s.name) + '</h1>' +
          '<div class="pets-card__rarity">' + rarityHtml(s.rarity) + '</div>' +
          '<div class="pets-detail__stage-line">' +
            '<span class="pets-detail__stage-badge">Skin ' + esc(stage) + '</span>' +
            '<span class="pets-detail__stage-label">' + esc(SKIN_LABELS[stage] || stage) + '</span>' +
            (mut ? mutationBadgeHtml(mut.id) : '') +
          '</div>' +
        '</div>' +
        '<div class="pets-detail__panel">' +
          walletChipHtml() +
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
            '<button type="button" class="btn btn--sm btn--pets-secondary" data-pets-customize>Customize</button>' +
            (canRoll
              ? '<button type="button" class="btn btn--sm btn--pets-secondary" data-pets-mut-roll>' +
                  'Mutation roll (−' + MUTATION_ROLL_COST + ' ◆)' +
                '</button>'
              : '') +
            (listable
              ? '<button type="button" class="btn btn--sm btn--pets-ghost-dark" data-pets-list>List on market</button>'
              : '') +
          '</div>' +
          '<p class="pets-detail__equipped">' +
            (mut
              ? 'Mutation — ' + esc(mut.label) + ' (' + esc(mut.hint) + '). '
              : 'No mutation yet. Crossing a skin stage can proc one for free. ') +
            (equippedBits.length
              ? 'Equipped — ' + esc(equippedBits.join(' · '))
              : 'No cosmetics equipped yet.') +
          '</p>' +
          '<p class="pets-detail__hint">Demo XP only — Play grants ' + PLAY_XP +
            ' XP locally. Market list gate: Lv ' + MIN_LIST_LEVEL +
            '+ or any mutation. Pets Diamonds are a local soft currency (not the main shop).</p>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function renderCustomize(roster, instanceId) {
    var owned = findOwned(roster, instanceId);
    var s = owned ? speciesById(owned.speciesId) : null;
    if (!s || !owned) {
      screen = { name: 'hub', instanceId: null, listingId: null };
      return renderHub(roster);
    }
    var cos = normalizeCosmetics(owned.cosmetics);
    var mut = mutationById(owned.mutationId);
    var slotsHtml = SLOT_ORDER.map(function (slot) {
      var options = COSMETIC_CATALOG.filter(function (c) { return c.slot === slot; });
      var chips = options.map(function (item) {
        var on = cos[slot] === item.id;
        return '<button type="button" class="pets-chip' + (on ? ' is-on' : '') +
          '" data-pets-equip="' + esc(item.id) + '" data-slot="' + esc(slot) + '"' +
          ' aria-pressed="' + (on ? 'true' : 'false') + '">' +
          '<span class="pets-chip__name">' + esc(item.name) + '</span>' +
          '<span class="pets-chip__tier">' + esc(item.tier) + '</span>' +
        '</button>';
      }).join('');
      return '<div class="pets-slot">' +
        '<h3 class="pets-slot__label">' + esc(SLOT_LABELS[slot]) + '</h3>' +
        '<div class="pets-slot__chips">' + chips + '</div>' +
      '</div>';
    }).join('');

    return '<div class="portal__inner pets pets--customize">' +
      '<button type="button" class="pets-back" data-pets-back>' +
        '<span aria-hidden="true">←</span> Back to ' + esc(s.name) +
      '</button>' +
      '<div class="pets__head pets__head--compact">' +
        '<div class="eyebrow">Customize</div>' +
        '<h1>' + esc(s.name) + '</h1>' +
        '<p>Pick school-safe cosmetics and traits. Looks change on this pet only — identity stays the same.' +
          (mut ? ' Mutation <strong>' + esc(mut.label) + '</strong> stays on.' : '') +
        '</p>' +
      '</div>' +
      '<div class="pets-customize">' +
        '<div class="pets-customize__preview">' +
          artHtml(s, owned, 'pets-card__art--lg') +
          catchphraseHtml(owned.cosmetics) +
          '<div class="pets-card__name">' + nameHtml(s.name) + '</div>' +
          (mut ? '<div class="pets-card__meta">' + mutationBadgeHtml(mut.id) + '</div>' : '') +
        '</div>' +
        '<div class="pets-customize__slots">' + slotsHtml + '</div>' +
      '</div>' +
      '<p class="pets__note">Want a brand-new brainrot? Use Request or Upload from the Pets hub — those go to the review queue first.</p>' +
    '</div>';
  }

  function renderRequest() {
    return '<div class="portal__inner pets pets--form">' +
      '<button type="button" class="pets-back" data-pets-back>' +
        '<span aria-hidden="true">←</span> Back to roster' +
      '</button>' +
      noticeHtml() +
      '<div class="pets__head pets__head--compact">' +
        '<div class="eyebrow">Request</div>' +
        '<h1>Request a brainrot</h1>' +
        '<p>Suggest a silly, school-safe character idea. Moderators review every request before anything is added.</p>' +
      '</div>' +
      '<form class="pets-form" data-pets-request-form>' +
        '<label class="pets-form__field">' +
          '<span>Name</span>' +
          '<input name="name" type="text" maxlength="' + NAME_MAX + '" required placeholder="e.g. Map Cap Max" autocomplete="off">' +
        '</label>' +
        '<label class="pets-form__field">' +
          '<span>Short description</span>' +
          '<textarea name="desc" maxlength="' + DESC_MAX + '" rows="4" required placeholder="Look, vibe, and classroom-friendly personality"></textarea>' +
        '</label>' +
        '<label class="pets-form__field">' +
          '<span>Optional reference link</span>' +
          '<input name="ref" type="url" maxlength="' + REF_MAX + '" placeholder="https://… (optional)">' +
        '</label>' +
        '<label class="pets-form__check">' +
          '<input name="safe" type="checkbox" required>' +
          '<span>I confirm this idea is school-safe: no violence, hate, romance, or personal info.</span>' +
        '</label>' +
        '<div class="pets-form__actions">' +
          '<button type="submit" class="btn btn--sm btn--pets-primary">Send for review</button>' +
        '</div>' +
      '</form>' +
      '<p class="pets__note">Status starts as <strong>pending</strong>. Check the review queue anytime. Max ' +
        UPLOAD_MAX_PENDING + ' pending items at once.</p>' +
    '</div>';
  }

  function renderUpload() {
    var previewBlock = pendingUploadDataUrl
      ? '<div class="pets-upload__preview" data-pets-preview>' +
          '<img class="pets-upload__img" alt="Design preview" src="' +
            pendingUploadDataUrl.replace(/"/g, '') + '">' +
          (pendingUploadMeta
            ? '<div class="pets-upload__meta">' + esc(pendingUploadMeta.name) + ' · ' +
              Math.round(pendingUploadMeta.size / 1024) + ' KB</div>'
            : '') +
        '</div>'
      : '<div class="pets-upload__preview" data-pets-preview></div>';

    return '<div class="portal__inner pets pets--form">' +
      '<button type="button" class="pets-back" data-pets-back>' +
        '<span aria-hidden="true">←</span> Back to roster' +
      '</button>' +
      noticeHtml() +
      '<div class="pets__head pets__head--compact">' +
        '<div class="eyebrow">Upload</div>' +
        '<h1>Upload your design</h1>' +
        '<p>Share original, school-safe art. Files stay private until a human approves them.</p>' +
      '</div>' +
      '<form class="pets-form" data-pets-upload-form>' +
        '<label class="pets-form__field">' +
          '<span>Title</span>' +
          '<input name="title" type="text" maxlength="' + NAME_MAX + '" required placeholder="Name for this design" autocomplete="off">' +
        '</label>' +
        '<label class="pets-form__field">' +
          '<span>Notes (optional)</span>' +
          '<textarea name="notes" maxlength="' + DESC_MAX + '" rows="3" placeholder="Anything mods should know"></textarea>' +
        '</label>' +
        '<label class="pets-form__field">' +
          '<span>Image file</span>' +
          '<input name="file" type="file" accept="image/png,image/jpeg,image/webp" data-pets-file>' +
        '</label>' +
        previewBlock +
        '<div class="pets-limits" role="note">' +
          '<strong>v1 storage limits</strong>' +
          '<ul>' +
            '<li>PNG, JPEG, or WebP only</li>' +
            '<li>Max ' + Math.round(UPLOAD_MAX_BYTES / 1024) + ' KB (stored as a local data URL)</li>' +
            '<li>Max ' + UPLOAD_MAX_PENDING + ' pending submissions</li>' +
            '<li>Rejected uploads clear the image to save space</li>' +
            '<li>No public use until status is <em>approved</em></li>' +
          '</ul>' +
        '</div>' +
        '<label class="pets-form__check">' +
          '<input name="safe" type="checkbox" required>' +
          '<span>This is my original school-safe art — no violence, hate, celebrity likeness, or personal photos.</span>' +
        '</label>' +
        '<div class="pets-form__actions">' +
          '<button type="submit" class="btn btn--sm btn--pets-primary">Upload for review</button>' +
        '</div>' +
      '</form>' +
    '</div>';
  }

  function renderQueue() {
    var items = readDesigns().items;
    var list;
    if (!items.length) {
      list = '<p class="pets-queue__empty">No requests or uploads yet. Send one from the Pets hub.</p>';
    } else {
      list = '<ul class="pets-queue">' + items.map(function (item) {
        var when = new Date(item.createdAt).toLocaleString();
        var typeLabel = item.type === 'upload' ? 'Upload' : 'Request';
        var thumb = (item.type === 'upload' && item.dataUrl)
          ? '<img class="pets-queue__thumb" alt="" src="' + String(item.dataUrl).replace(/"/g, '') + '">'
          : (item.cleared
            ? '<div class="pets-queue__thumb pets-queue__thumb--cleared">Cleared</div>'
            : '<div class="pets-queue__thumb pets-queue__thumb--req">' + esc(typeLabel.charAt(0)) + '</div>');
        var actions = item.status === 'pending'
          ? '<div class="pets-queue__actions">' +
              '<button type="button" class="btn btn--sm btn--pets-primary" data-pets-approve="' + esc(item.id) + '">Approve</button>' +
              '<button type="button" class="btn btn--sm btn--pets-ghost-dark" data-pets-reject="' + esc(item.id) + '">Reject</button>' +
            '</div>'
          : (item.reason
            ? '<p class="pets-queue__reason">' + esc(item.reason) + '</p>'
            : '');
        return '<li class="pets-queue__item">' +
          thumb +
          '<div class="pets-queue__body">' +
            '<div class="pets-queue__top">' +
              '<strong>' + esc(item.name) + '</strong>' +
              statusBadge(item.status) +
            '</div>' +
            '<div class="pets-queue__meta">' + esc(typeLabel) + ' · ' + esc(when) + '</div>' +
            (item.desc ? '<p class="pets-queue__desc">' + esc(item.desc) + '</p>' : '') +
            (item.ref ? '<p class="pets-queue__ref">' + esc(item.ref) + '</p>' : '') +
            actions +
          '</div>' +
        '</li>';
      }).join('') + '</ul>';
    }

    return '<div class="portal__inner pets pets--queue">' +
      '<button type="button" class="pets-back" data-pets-back>' +
        '<span aria-hidden="true">←</span> Back to roster' +
      '</button>' +
      noticeHtml() +
      '<div class="pets__head pets__head--compact">' +
        '<div class="eyebrow">Moderation</div>' +
        '<h1>Review queue</h1>' +
        '<p>Local v1 queue — pending items are visible here for players and admins. Approve or reject stays on this device until a real backend lands.</p>' +
      '</div>' +
      list +
    '</div>';
  }

  function marketListingCard(listing) {
    var pet = normalizeOwned(listing.pet);
    var s = speciesById(pet.speciesId);
    if (!s) return '';
    var mut = mutationById(pet.mutationId);
    var mine = listing.sellerId === YOU_SELLER;
    var actions = mine
      ? '<button type="button" class="btn btn--sm btn--pets-ghost-dark" data-pets-cancel-listing="' +
          esc(listing.id) + '">Cancel listing</button>'
      : '<button type="button" class="btn btn--sm btn--pets-primary" data-pets-buy="' +
          esc(listing.id) + '">Buy · ' + listing.price + ' ◆</button>';
    return '<article class="pets-mcard">' +
      '<div class="pets-mcard__art">' + artHtml(s, pet, '') + '</div>' +
      '<div class="pets-mcard__body">' +
        '<h3 class="pets-mcard__name">' + nameHtml(s.name) + '</h3>' +
        '<div class="pets-card__rarity">' + rarityHtml(s.rarity) + '</div>' +
        '<div class="pets-card__meta">' +
          '<span class="pets-card__level">Lv ' + pet.level + '</span>' +
          '<span class="pets-card__stage">' + esc(pet.skinStage) + '</span>' +
          (mut ? mutationBadgeHtml(mut.id) : '') +
        '</div>' +
        '<div class="pets-mcard__price">' +
          '<strong>' + listing.price + '</strong> Pets Diamonds' +
          '<span class="pets-mcard__fee">Fee ' + feeOf(listing.price) +
            ' · net ' + netOf(listing.price) + '</span>' +
        '</div>' +
        '<div class="pets-mcard__seller">Seller · ' + esc(listing.sellerLabel || listing.sellerId) + '</div>' +
        '<div class="pets-mcard__actions">' + actions + '</div>' +
      '</div>' +
    '</article>';
  }

  function renderMarket() {
    var listings = activeListings(ensureMarket());
    var filtered = listings.filter(function (L) {
      if (marketFilter === 'mutated') return !!L.pet && !!L.pet.mutationId;
      if (marketFilter === 'high') return !!L.pet && L.pet.level >= MIN_LIST_LEVEL;
      return true;
    });
    var yours = 0;
    for (var i = 0; i < listings.length; i++) {
      if (listings[i].sellerId === YOU_SELLER) yours++;
    }
    var listHtml;
    if (!filtered.length) {
      listHtml = '<div class="pets-empty" role="status">' +
        '<strong>No listings here</strong>' +
        '<p>' +
          (listings.length
            ? 'Nothing matches this filter. Try All, or list one of your high-level / mutated pets.'
            : 'The market is empty. List a level ' + MIN_LIST_LEVEL +
              '+ or mutated brainrot, or reset demo seeds by clearing local storage.') +
        '</p>' +
        '<button type="button" class="btn btn--sm btn--pets-secondary" data-pets-go-list>List a pet</button>' +
      '</div>';
    } else {
      listHtml = '<div class="pets-market__grid">' +
        filtered.map(marketListingCard).join('') +
      '</div>';
    }

    return '<div class="portal__inner pets pets--market">' +
      '<button type="button" class="pets-back" data-pets-back>' +
        '<span aria-hidden="true">←</span> Back to roster' +
      '</button>' +
      noticeHtml() +
      '<div class="pets__head pets__head--compact">' +
        '<div class="pets__head-row">' +
          '<div>' +
            '<div class="eyebrow">Trade</div>' +
            '<h1>Marketplace</h1>' +
          '</div>' +
          walletChipHtml() +
        '</div>' +
        '<p>Browse high-level and mutated brainrots. Buy, list, or cancel — soft currency only, classroom-safe.</p>' +
      '</div>' +
      '<div class="pets-market__filters" role="tablist" aria-label="Listing filters">' +
        '<button type="button" class="pets-chip' + (marketFilter === 'all' ? ' is-on' : '') +
          '" data-pets-filter="all" aria-pressed="' + (marketFilter === 'all') + '">' +
          '<span class="pets-chip__name">All</span>' +
          '<span class="pets-chip__tier">' + listings.length + '</span></button>' +
        '<button type="button" class="pets-chip' + (marketFilter === 'mutated' ? ' is-on' : '') +
          '" data-pets-filter="mutated" aria-pressed="' + (marketFilter === 'mutated') + '">' +
          '<span class="pets-chip__name">Has mutation</span></button>' +
        '<button type="button" class="pets-chip' + (marketFilter === 'high' ? ' is-on' : '') +
          '" data-pets-filter="high" aria-pressed="' + (marketFilter === 'high') + '">' +
          '<span class="pets-chip__name">Lv ' + MIN_LIST_LEVEL + '+</span></button>' +
        '<button type="button" class="btn btn--sm btn--pets-secondary" data-pets-go-list>List a pet</button>' +
      '</div>' +
      listHtml +
      '<div class="pets-limits" role="note">' +
        '<strong>v1 economy notes</strong>' +
        '<ul>' +
          '<li><strong>Pets Diamonds</strong> — local demo soft currency (' +
            'wallet key <code>learngeo.pets.wallet.v0</code>), separate from LearnGeo shop diamonds</li>' +
          '<li>List gate: level ≥ ' + MIN_LIST_LEVEL + ' <em>or</em> any mutation</li>' +
          '<li>Platform fee ' + (FEE_BPS / 100) + '% shown before buy/list confirm</li>' +
          '<li>Price bounds ' + PRICE_MIN + '–' + PRICE_MAX + ' · cancel returns your pet</li>' +
          '<li>Demo NPC listings seed once so Buy works without a second account</li>' +
          '<li>No real money, crypto, or off-platform trades</li>' +
          '<li>Your active listings: ' + yours + '</li>' +
        '</ul>' +
      '</div>' +
    '</div>';
  }

  function renderList(roster, instanceId) {
    var owned = findOwned(roster, instanceId);
    var s = owned ? speciesById(owned.speciesId) : null;
    if (!s || !owned) {
      screen = { name: 'hub', instanceId: null, listingId: null };
      return renderHub(roster);
    }
    if (!canListPet(owned)) {
      formNotice = {
        tone: 'err',
        text: 'This pet needs level ' + MIN_LIST_LEVEL + '+ or a mutation to list.'
      };
      screen = { name: 'detail', instanceId: instanceId, listingId: null };
      return renderDetail(roster, instanceId);
    }
    var mut = mutationById(owned.mutationId);
    var sample = 100;
    return '<div class="portal__inner pets pets--form">' +
      '<button type="button" class="pets-back" data-pets-back>' +
        '<span aria-hidden="true">←</span> Back to ' + esc(s.name) +
      '</button>' +
      noticeHtml() +
      '<div class="pets__head pets__head--compact">' +
        '<div class="eyebrow">Sell</div>' +
        '<h1>List on marketplace</h1>' +
        '<p>Set a Pets Diamonds price. Your pet leaves the roster until someone buys or you cancel.</p>' +
      '</div>' +
      '<div class="pets-list-preview">' +
        artHtml(s, owned, '') +
        '<div>' +
          '<div class="pets-card__name">' + nameHtml(s.name) + '</div>' +
          '<div class="pets-card__meta">' +
            '<span class="pets-card__level">Lv ' + owned.level + '</span>' +
            (mut ? mutationBadgeHtml(mut.id) : '') +
          '</div>' +
        '</div>' +
      '</div>' +
      '<form class="pets-form" data-pets-list-form>' +
        '<label class="pets-form__field">' +
          '<span>Price (Pets Diamonds)</span>' +
          '<input name="price" type="number" min="' + PRICE_MIN + '" max="' + PRICE_MAX +
            '" step="1" required value="75" inputmode="numeric">' +
        '</label>' +
        '<div class="pets-limits" role="note">' +
          '<strong>Before you list</strong>' +
          '<ul>' +
            '<li>Bounds: ' + PRICE_MIN + '–' + PRICE_MAX + '</li>' +
            '<li>Example at ' + sample + ': fee ' + feeOf(sample) +
              ' (' + (FEE_BPS / 100) + '%) · seller net ' + netOf(sample) + '</li>' +
            '<li>You cannot buy your own listing — use Cancel instead</li>' +
            '<li>Classroom-safe soft currency only</li>' +
          '</ul>' +
        '</div>' +
        '<div class="pets-form__actions">' +
          '<button type="submit" class="btn btn--sm btn--pets-primary">Confirm listing</button>' +
        '</div>' +
      '</form>' +
    '</div>';
  }

  function render() {
    var el = host();
    if (!el) return;
    var roster = ensureRoster();
    ensureWallet();
    var name = screen.name || 'hub';
    if (name === 'detail') {
      el.innerHTML = renderDetail(roster, screen.instanceId);
      bindDetail(el, screen.instanceId);
    } else if (name === 'customize') {
      el.innerHTML = renderCustomize(roster, screen.instanceId);
      bindCustomize(el, screen.instanceId);
    } else if (name === 'request') {
      el.innerHTML = renderRequest();
      bindRequest(el);
    } else if (name === 'upload') {
      el.innerHTML = renderUpload();
      bindUpload(el);
    } else if (name === 'queue') {
      el.innerHTML = renderQueue();
      bindQueue(el);
    } else if (name === 'market') {
      el.innerHTML = renderMarket();
      bindMarket(el);
    } else if (name === 'list') {
      el.innerHTML = renderList(roster, screen.instanceId);
      if (screen.name === 'detail') bindDetail(el, screen.instanceId);
      else bindList(el, screen.instanceId);
    } else {
      el.innerHTML = renderHub(roster);
      bindHub(el);
    }
  }

  function start() {
    render();
  }

  function stop() {
    screen = { name: 'hub', instanceId: null, listingId: null };
    lastLevelUpFlash = null;
    lastMutationFlash = null;
    formNotice = null;
    pendingUploadDataUrl = null;
    pendingUploadMeta = null;
    marketFilter = 'all';
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
    cosmeticCatalog: COSMETIC_CATALOG,
    mutations: MUTATIONS,
    skinStageForLevel: skinStageForLevel,
    xpToAdvance: xpToAdvance,
    grantXp: grantXp,
    equipCosmetic: equipCosmetic,
    tryMutationRoll: tryMutationRoll,
    listPet: listPet,
    buyListing: buyListing,
    cancelListing: cancelListing,
    /* test / ops helpers */
    _dismissKey: DISMISS_KEY,
    _rosterKey: ROSTER_KEY,
    _designsKey: DESIGNS_KEY,
    _walletKey: WALLET_KEY,
    _marketKey: MARKET_KEY,
    _ensureRoster: ensureRoster,
    _ensureWallet: ensureWallet,
    _ensureMarket: ensureMarket,
    _readDismissed: readDismissed,
    _readDesigns: readDesigns,
    _updateDesignStatus: updateDesignStatus,
    _MAX_LEVEL: MAX_LEVEL,
    _BASE_XP: BASE_XP,
    _PLAY_XP: PLAY_XP,
    _MIN_LIST_LEVEL: MIN_LIST_LEVEL,
    _FEE_BPS: FEE_BPS,
    _START_DIAMONDS: START_DIAMONDS,
    _UPLOAD_MAX_BYTES: UPLOAD_MAX_BYTES,
    _UPLOAD_MAX_PENDING: UPLOAD_MAX_PENDING
  };
})(window);
