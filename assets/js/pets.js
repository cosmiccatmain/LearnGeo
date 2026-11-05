/* ------------------------------------------------------------------
   LearnGeo — Pets (Mongolian Brainrot collab)

   v0 shell: top-level Pets tab + homescreen event popup + starter roster.
   LEA-14: levels 1–10, XP, on-character skin stages A–D, pet detail UX.
   LEA-15: customize cosmetics/traits; request a brainrot; upload design
     with moderation states.
   LEA-16: mutations (on-instance modifiers + blocky visual cues) and a
     local marketplace to list / buy / cancel high-level or mutated pets.
   LEA-20: expanded catalog + rarities, flatter Pets chrome, dopamine
     chest-open pulls, Silver mutation (keeps Golden).

   Dismiss rule (documented product choice for v0):
     C — until dismissed. localStorage key learngeo.pets.event.v0.dismissed
     persists across sessions (homescreen / login update card). No server
     sync in v0 (known limitation).

   Rarity spread (LEA-17 — AJ: starters must NOT all be Mythical):
     Common → Rare → Epic → Legendary → Mythical (+ "Brainrot" suffix).
     Jill stays Mythical (ref-locked). Others get one tier each.

   XP / levels (earned, not minted):
     Correct answers add pet XP to a bank on the account save (state.pets).
     That bank is not account XP, level, or diamonds — an admin at Lv 9999
     with billions of diamonds still cannot upgrade a pet for free.
     Upgrade spends the bank (cost to leave level N is N × BASE_XP, minus
     any partial xp already on that pet). The old Play button minted XP on
     every click and never deducted a balance; that path is gone.
     Curve and skins unchanged: 1–3 A, 4–6 B, 7–9 C, 10 D.
     Legacy learngeo.pets.roster.v0 rows migrate in once (the pet is kept).
     Levels from before PETS_RESET_VERSION are wiped once on load; care,
     cosmetics and mutations stay. The stamp lives on state.pets so a
     later cloud copy without it cannot put the glitched levels back.

   Design queue (LEA-15 v1 — local only):
     learngeo.pets.designs.v0 holds request|upload rows with status
     pending → approved | rejected. Uploads store a data URL locally.
     Limits (documented in UI): PNG/JPEG/WebP, max UPLOAD_MAX_BYTES,
     max UPLOAD_MAX_PENDING pending items, school-safe affirmation required.
     Nothing goes public without a human approve action on the queue screen.

   Economy (LEA-16 / LEA-22):
     Pets Diamonds live in learngeo.pets.wallet.v0 (soft currency for this
     collab surface). Kept separate from LearnGeo shop diamonds to avoid
     double-charge / shop-path bugs in v1. Starting balance START_DIAMONDS.
     LEA-22: store is keyed by account id ({ version:1, accounts:{ id:… } }).
     Viewer balance uses W.accountId() or "local" for guests. Administrator
     give/take/set edits the selected account’s slot on THIS device.
     GAP (documented in admin UI + help): unlike shop diamonds via
     ultra_adjust_gems, Pets Diamonds are not yet synced through Supabase —
     an adjust on another account only lands on that user’s other devices
     once a cloud wallet exists. Same-browser / same-admin-device sees it.
     Listings: learngeo.pets.market.v0. Fee FEE_BPS (10%). List gate:
     level >= MIN_LIST_LEVEL OR has mutation. Price bounds PRICE_MIN–MAX.
     Demo NPC listings seed once so Buy works without a second account.
     No real-money / crypto / off-platform trades.
     HUD: Pets Diamonds chip sits in the topbar beside shop diamonds.

   Chest pulls (LEA-20 — local demo):
     Hub "Open chest" spends CHEST_COST Pets Diamonds, runs a suspense →
     reveal overlay, then adds a weighted catalog brainrot (duplicates OK).
     Small chance the new instance also rolls a mutation (incl. Silver /
     Golden). Starters still auto-grant on first visit; extended roster is
     chest-earn. Classroom-safe motion only (no jump-scare audio required).
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
  /* Kept so older callers can read the constant. Play no longer mints it. */
  var PLAY_XP = 25;
  var PET_XP_BASE = 6;
  var FEED_COST = 12;
  var CARE_HUNGER_FLOOR = 40;
  var CARE_HAPPY_FLOOR = 45;
  var CARE_HUNGER_PER_HOUR = 6;
  var CARE_HAPPY_PER_HOUR = 5;
  var CARE_SEED = 82;
  var HAPPY_AT = 70;
  var IMPORT_KEY = 'learngeo.pets.roster.v0.imported';
  /* One-time wipe of levels earned while Play minted XP for free.
     Bump this to run another reset. A save at or above this version
     is left alone, including levels earned after the wipe. */
  var PETS_RESET_VERSION = 1;
  var lastResetApplied = false;

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
  var CHEST_COST = 35;
  var CHEST_MUTATION_CHANCE = 0.22; /* bonus mutation on the pulled instance */
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
    hat: 'Hat',
    frame: 'Frame',
    trail: 'Trail',
    catchphrase: 'Phrase'
  };
  /* Locker tab copy (Fortnite-style category rail). */
  var LOCKER_TABS = [
    { id: 'aura', label: 'Aura' },
    { id: 'hat', label: 'Hat' },
    { id: 'frame', label: 'Frame' },
    { id: 'trail', label: 'Trail' },
    { id: 'catchphrase', label: 'Phrase' }
  ];

  /* LearnGeo-authored catalog — school-safe only. Equipping never changes
     species identity. Tiers drive locker tile borders. */
  var COSMETIC_CATALOG = [
    { id: 'aura-none', slot: 'aura', name: 'None', tier: 'Common', css: '' },
    { id: 'aura-spark', slot: 'aura', name: 'Sparkle Ring', tier: 'Common', css: 'spark' },
    { id: 'aura-mint', slot: 'aura', name: 'Mint Glow', tier: 'Rare', css: 'mint' },
    { id: 'aura-pulse', slot: 'aura', name: 'Pulse Ring', tier: 'Epic', css: 'pulse' },
    { id: 'hat-none', slot: 'hat', name: 'None', tier: 'Common', css: '' },
    { id: 'hat-cap', slot: 'hat', name: 'Class Cap', tier: 'Common', css: 'cap' },
    { id: 'hat-beanie', slot: 'hat', name: 'Soft Beanie', tier: 'Rare', css: 'beanie' },
    { id: 'hat-crown', slot: 'hat', name: 'Paper Crown', tier: 'Epic', css: 'crown' },
    { id: 'frame-none', slot: 'frame', name: 'None', tier: 'Common', css: '' },
    { id: 'frame-sticker', slot: 'frame', name: 'Sticker Border', tier: 'Common', css: 'sticker' },
    { id: 'frame-stars', slot: 'frame', name: 'Star Stickers', tier: 'Rare', css: 'stars' },
    { id: 'frame-pixel', slot: 'frame', name: 'Pixel Frame', tier: 'Epic', css: 'pixel' },
    { id: 'trail-none', slot: 'trail', name: 'None', tier: 'Common', css: '' },
    { id: 'trail-dots', slot: 'trail', name: 'Dot Bounce', tier: 'Common', css: 'dots' },
    { id: 'trail-confetti', slot: 'trail', name: 'Confetti Drift', tier: 'Rare', css: 'confetti' },
    { id: 'trail-spark', slot: 'trail', name: 'Spark Trail', tier: 'Epic', css: 'sparktrail' },
    { id: 'catch-none', slot: 'catchphrase', name: 'None', tier: 'Common', text: '' },
    { id: 'catch-ding', slot: 'catchphrase', name: 'Ding!', tier: 'Common', text: 'Ding!' },
    { id: 'catch-knock', slot: 'catchphrase', name: 'Who\'s there?', tier: 'Common', text: 'Who\'s there?' },
    { id: 'catch-geo', slot: 'catchphrase', name: 'Geo go!', tier: 'Rare', text: 'Geo go!' },
    { id: 'catch-chest', slot: 'catchphrase', name: 'Chest unlocked!', tier: 'Epic', text: 'Chest unlocked!' }
  ];

  /* Ordered rarity ladder (LEA-17). Labels keep the collab "Brainrot"
     suffix from the ref; CSS keys off the first word (tier). */
  var RARITY_TIERS = ['Common', 'Rare', 'Epic', 'Legendary', 'Mythical'];

  /* Starters stay auto-granted (LEA-20). Assignment (LEA-17): Jack Common
     → Freddy Rare → Washingtoń Epic → Napoleon Legendary → Jill Mythical
     (ref-locked). weight/starter fields feed chest pulls. */
  var STARTERS = [
    { id: 'knock-knock-jack', name: 'Knock Knock Jack', rarity: 'Common Brainrot', art: 'jack', weight: 4, starter: true },
    { id: 'freaky-freaky-freddy', name: 'Freaky Freaky Freddy', rarity: 'Rare Brainrot', art: 'freddy', weight: 4, starter: true },
    { id: 'washington', name: 'Washingtoń', rarity: 'Epic Brainrot', art: 'washington', weight: 4, starter: true },
    { id: 'napoleon', name: 'Napoleon', rarity: 'Legendary Brainrot', art: 'napoleon', weight: 4, starter: true },
    { id: 'ding-dong-jill', name: 'Ding Dong Jill', rarity: 'Mythical Brainrot', art: 'jill', weight: 4, starter: true }
  ];

  var EXTENDED = [
    { id: 'ping-pong-penny', name: 'Ping Pong Penny', rarity: 'Common Brainrot', art: 'penny', weight: 28 },
    { id: 'tip-tap-tim', name: 'Tip Tap Tim', rarity: 'Common Brainrot', art: 'tim', weight: 26 },
    { id: 'skip-skip-sam', name: 'Skip Skip Sam', rarity: 'Common Brainrot', art: 'sam', weight: 24 },
    { id: 'zoom-zoom-zara', name: 'Zoom Zoom Zara', rarity: 'Rare Brainrot', art: 'zara', weight: 16 },
    { id: 'wiggle-wiggle-will', name: 'Wiggle Wiggle Will', rarity: 'Rare Brainrot', art: 'will', weight: 14 },
    { id: 'boing-boing-bea', name: 'Boing Boing Bea', rarity: 'Epic Brainrot', art: 'bea', weight: 9 },
    { id: 'click-clack-claire', name: 'Click Clack Claire', rarity: 'Epic Brainrot', art: 'claire', weight: 8 },
    { id: 'hello-hello-hank', name: 'Hello Hello Hank', rarity: 'Mythical Brainrot', art: 'hank', weight: 3 }
  ];

  var CATALOG = STARTERS.concat(EXTENDED);

  /* Root-absolute so the img still loads on SPA routes like /home /pets. */
  var UPDATE_HERO_SRC = '/assets/img/pets/update-hero.svg';

  /* School-safe mutation tags (plan §9 + LEA-20 Silver). Applied per
     instance — species identity stays Jill/Jack/etc. Golden kept. */
  var MUTATIONS = [
    { id: 'glitched', label: 'Glitched', hint: 'Offset block shimmer' },
    { id: 'golden', label: 'Golden', hint: 'Warm metallic blocks' },
    { id: 'silver', label: 'Silver', hint: 'Cool chrome blocks' },
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
  var marketFilter = 'all'; /* all | mutated | high | rarity:<tier> */
  var lockerTab = 'aura'; /* active Fortnite-style locker category */
  var chestBusy = false;
  var chestReveal = null; /* { owned, species, mutation } while overlay open */

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

  function blankPets() {
    return { v: 1, xpBank: 0, activeId: '', care: {}, owned: [] };
  }

  function resetVersionOf(p) {
    var n = p && Number(p.resetVersion);
    return (isFinite(n) && n > 0) ? Math.floor(n) : 0;
  }

  /* Account save is canonical (cloud sync already uploads W.state).
     The legacy roster key is a one-time import plus a write-through copy. */
  function petsBag() {
    var s = W.state;
    if (!s.pets || typeof s.pets !== 'object' || Array.isArray(s.pets)) s.pets = blankPets();
    var p = s.pets;
    if (!Array.isArray(p.owned)) p.owned = [];
    var bank = Number(p.xpBank);
    p.xpBank = (isFinite(bank) && bank > 0) ? Math.floor(bank) : 0;
    if (!p.care || typeof p.care !== 'object' || Array.isArray(p.care)) p.care = {};
    if (typeof p.activeId !== 'string') p.activeId = '';
    return p;
  }

  function readLegacyRoster() {
    try {
      var raw = global.localStorage.getItem(ROSTER_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.owned)) return null;
      return parsed;
    } catch (e) { return null; }
  }

  function mirrorLocal(p) {
    try {
      global.localStorage.setItem(ROSTER_KEY, JSON.stringify({
        eventId: EVENT_ID,
        v: 1,
        owned: p.owned,
        xpBank: p.xpBank,
        activeId: p.activeId,
        care: p.care,
        resetVersion: resetVersionOf(p)
      }));
    } catch (e) {}
  }

  function commitPets() {
    var p = petsBag();
    mirrorLocal(p);
    if (W.saveNow) W.saveNow();
    else if (W.save) W.save();
    return p;
  }

  function migrateLegacy(p) {
    if (p.owned.length) return;
    var flag = '';
    try { flag = global.localStorage.getItem(IMPORT_KEY) || ''; } catch (e) {}
    if (flag) return;
    var legacy = readLegacyRoster();
    try { global.localStorage.setItem(IMPORT_KEY, '1'); } catch (e2) {}
    if (!legacy || !legacy.owned.length) return;
    p.owned = legacy.owned.map(normalizeOwned);
    if (typeof legacy.xpBank === 'number' && isFinite(legacy.xpBank) && legacy.xpBank > 0) {
      p.xpBank = Math.floor(legacy.xpBank);
    }
    if (typeof legacy.activeId === 'string') p.activeId = legacy.activeId;
    if (legacy.care && typeof legacy.care === 'object' && !Array.isArray(legacy.care)) p.care = legacy.care;
    if (typeof legacy.resetVersion === 'number' && isFinite(legacy.resetVersion)) {
      p.resetVersion = Math.floor(legacy.resetVersion);
    }
    p.migratedFrom = 'learngeo.pets.roster.v0';
  }

  /* Own marketplace listings are device-local. Cancelling one puts the
     snapshotted pet back on the roster, so a pre-reset listing has to
     lose its glitched level in the same one-time pass. Demo NPC stock
     is left as listed. */
  function resetOwnListings() {
    var data = readMarket();
    if (!data || !Array.isArray(data.listings)) return false;
    var changed = false;
    data.listings.forEach(function (listing) {
      var pet = listing && listing.pet;
      if (!listing || listing.sellerId !== YOU_SELLER || !pet || typeof pet !== 'object') return;
      if (pet.level === 1 && !pet.xp && pet.skinStage === 'A') return;
      pet.level = 1;
      pet.xp = 0;
      pet.skinStage = 'A';
      changed = true;
    });
    if (changed) writeMarket(data);
    return changed;
  }

  /* Levels, in-level progress, skin stage and the pet XP bank go back
     to the start. Ownership, care, cosmetics and mutations stay.
     Account XP, level and diamonds are not on this object. */
  function applyLevelReset() {
    lastResetApplied = false;
    var s = W.state;
    if (!s) return false;
    var p = s.pets;
    if (resetVersionOf(p) >= PETS_RESET_VERSION) return false;

    if (!p || typeof p !== 'object' || Array.isArray(p) || !Array.isArray(p.owned) || !p.owned.length) {
      var host = (p && typeof p === 'object' && !Array.isArray(p)) ? p : blankPets();
      if (!Array.isArray(host.owned)) host.owned = [];
      migrateLegacy(host);
      if (host.owned.length) {
        s.pets = host;
        p = host;
      }
    }

    if (resetVersionOf(p) >= PETS_RESET_VERSION) return false;

    var changed = false;
    if (p && Array.isArray(p.owned) && p.owned.length) {
      p.owned.forEach(function (row) {
        if (!row || typeof row !== 'object') return;
        row.level = 1;
        row.xp = 0;
        row.skinStage = 'A';
      });
      p.xpBank = 0;
      p.resetVersion = PETS_RESET_VERSION;
      s.pets = p;
      changed = true;
    }

    if (resetOwnListings()) changed = true;

    if (changed) {
      if (!s.pets || typeof s.pets !== 'object' || Array.isArray(s.pets)) s.pets = blankPets();
      s.pets.xpBank = 0;
      s.pets.resetVersion = PETS_RESET_VERSION;
      mirrorLocal(s.pets);
      lastResetApplied = true;
      if (W.saveNow) W.saveNow();
    }
    return changed;
  }

  /* When the cloud copy and this device disagree, pets that have already
     been through the reset win over a copy that has not. Otherwise a
     glitched device can upload level 10 over a reset account, or download
     those levels back. The rest of the save is left to the normal
     newest-save choice. */
  function noteCloudChoice(chosen, other) {
    if (!chosen || !other || !other.pets) return false;
    if (resetVersionOf(other.pets) < PETS_RESET_VERSION) return false;
    if (resetVersionOf(chosen.pets) >= PETS_RESET_VERSION) return false;
    try { chosen.pets = JSON.parse(JSON.stringify(other.pets)); }
    catch (e) { chosen.pets = other.pets; }
    return true;
  }

  function seedCare(p) {
    var now = Date.now();
    var changed = false;
    p.owned.forEach(function (o) {
      var c = p.care[o.instanceId];
      if (!c || typeof c.at !== 'number' || typeof c.hunger !== 'number') {
        p.care[o.instanceId] = { hunger: CARE_SEED, happiness: CARE_SEED, at: now };
        changed = true;
      }
    });
    return changed;
  }

  function readRoster() {
    return ensureRoster();
  }

  function writeRoster(data) {
    var p = petsBag();
    if (data && Array.isArray(data.owned)) p.owned = data.owned;
    return commitPets();
  }

  /* First Pets visit grants the five starters. Older v0 rows migrate in
     with their level, xp, cosmetics and mutation intact. */
  function ensureRoster() {
    var p = petsBag();
    migrateLegacy(p);
    applyLevelReset();
    p = petsBag();
    if (!p.owned.length) {
      p.owned = STARTERS.map(function (s) {
        return normalizeOwned({
          instanceId: newInstanceId(),
          speciesId: s.id,
          level: 1,
          xp: 0
        });
      });
      p.activeId = p.owned[0].instanceId;
      p.resetVersion = PETS_RESET_VERSION;
      seedCare(p);
      commitPets();
      return { owned: p.owned };
    }
    var before = JSON.stringify(p.owned);
    p.owned = p.owned.map(normalizeOwned);
    if (!p.activeId || !findOwned({ owned: p.owned }, p.activeId)) {
      p.activeId = p.owned[0].instanceId;
    }
    var careChanged = seedCare(p);
    if (careChanged || JSON.stringify(p.owned) !== before) commitPets();
    return { owned: p.owned };
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

  /* Spend `amount` pet XP from the earned bank onto one pet.
     Refuses the whole spend when the bank is short — never mints XP,
     and never reads account level or shop diamonds. */
  function grantXp(instanceId, amount) {
    var roster = ensureRoster();
    var owned = findOwned(roster, instanceId);
    if (!owned) return null;
    var before = owned.level;
    var beforeStage = owned.skinStage || skinStageForLevel(before);
    var add = Math.max(0, Math.floor(Number(amount) || 0));
    var p = petsBag();
    if (owned.level >= MAX_LEVEL) {
      owned.xp = 0;
      owned.skinStage = skinStageForLevel(owned.level);
      saveOwned(instanceId, owned);
      return { ok: false, owned: owned, levelsGained: 0, capped: true, mutation: null, code: 'max', spent: 0, have: p.xpBank };
    }
    if (add <= 0 || p.xpBank < add) {
      return {
        ok: false, owned: owned, levelsGained: 0, capped: false, mutation: null,
        code: 'xp', spent: 0, need: add, have: p.xpBank
      };
    }
    p.xpBank -= add;
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
      ok: true,
      owned: owned,
      levelsGained: owned.level - before,
      capped: owned.level >= MAX_LEVEL && before >= MAX_LEVEL,
      mutation: mutGain,
      spent: add,
      have: petsBag().xpBank,
      evolved: owned.skinStage !== beforeStage
    };
  }

  function upgradeCost(owned) {
    if (!owned || owned.level >= MAX_LEVEL) return 0;
    return Math.max(1, xpToAdvance(owned.level) - (Number(owned.xp) || 0));
  }

  /* One level, paid entirely from the pet XP bank. */
  function upgrade(instanceId) {
    var roster = ensureRoster();
    var owned = findOwned(roster, instanceId);
    if (!owned) return { ok: false, error: 'That pet is not in your roster.', code: 'missing' };
    if (owned.level >= MAX_LEVEL) return { ok: false, error: 'Already max level.', code: 'max' };
    var cost = upgradeCost(owned);
    var have = petsBag().xpBank;
    if (have < cost) {
      return {
        ok: false,
        error: 'Not enough pet XP. Correct answers earn it.',
        code: 'xp',
        need: cost,
        have: have
      };
    }
    var result = grantXp(instanceId, cost);
    if (!result) return { ok: false, error: 'Could not upgrade.', code: 'missing' };
    if (!result.ok) return result;
    result.need = cost;
    return result;
  }

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  function moodOf(hunger, happiness) {
    if (hunger >= HAPPY_AT && happiness >= HAPPY_AT) {
      return { id: 'happy', label: 'Happy', bonus: true };
    }
    if (happiness >= 55) return { id: 'content', label: 'Content', bonus: false };
    if (hunger < 55) return { id: 'peckish', label: 'Peckish', bonus: false };
    return { id: 'cozy', label: 'Cozy', bonus: false };
  }

  /* Decay is derived from the saved timestamp so a refresh cannot reset
     hunger, and it cannot stack extra decay without time passing. */
  function projectCare(raw, now) {
    var at = raw && typeof raw.at === 'number' ? raw.at : now;
    var hours = (now - at) / 3600000;
    if (!isFinite(hours) || hours < 0) hours = 0;
    if (hours > 24 * 14) hours = 24 * 14;
    var hunger = clamp((Number(raw && raw.hunger) || CARE_SEED) - hours * CARE_HUNGER_PER_HOUR, CARE_HUNGER_FLOOR, 100);
    var happiness = clamp((Number(raw && raw.happiness) || CARE_SEED) - hours * CARE_HAPPY_PER_HOUR, CARE_HAPPY_FLOOR, 100);
    hunger = Math.round(hunger);
    happiness = Math.round(happiness);
    var mood = moodOf(hunger, happiness);
    return { hunger: hunger, happiness: happiness, at: at, mood: mood.id, label: mood.label, bonus: mood.bonus };
  }

  function careFor(instanceId) {
    var p = petsBag();
    var raw = p.care[instanceId];
    if (!raw || typeof raw.at !== 'number') {
      raw = { hunger: CARE_SEED, happiness: CARE_SEED, at: Date.now() };
      p.care[instanceId] = raw;
      commitPets();
    }
    return projectCare(raw, Date.now());
  }

  function companion() {
    var p = petsBag();
    var roster = { owned: p.owned };
    var owned = p.activeId ? findOwned(roster, p.activeId) : null;
    if (!owned && p.owned.length) owned = p.owned[0];
    return owned;
  }

  function setCompanion(instanceId) {
    var roster = ensureRoster();
    if (!findOwned(roster, instanceId)) return null;
    petsBag().activeId = instanceId;
    commitPets();
    return instanceId;
  }

  /* Shop diamonds. Checked and deducted through the account spend path. */
  function feed(instanceId) {
    var roster = ensureRoster();
    var owned = findOwned(roster, instanceId);
    if (!owned) return { ok: false, error: 'That pet is not in your roster.', code: 'missing' };
    var view = careFor(instanceId);
    if (view.hunger >= 99 && view.happiness >= 99) {
      return { ok: false, error: 'Already well fed.', code: 'full', care: view };
    }
    var have = W.state && W.state.economy ? W.state.economy.diamonds : 0;
    if (typeof W.spend !== 'function' || !W.spend(FEED_COST)) {
      return {
        ok: false,
        error: 'Not enough diamonds.',
        code: 'diamonds',
        need: FEED_COST,
        have: have
      };
    }
    var hunger = Math.min(100, view.hunger + 36);
    var happiness = Math.min(100, view.happiness + 20);
    petsBag().care[instanceId] = { hunger: hunger, happiness: happiness, at: Date.now() };
    commitPets();
    var after = projectCare(petsBag().care[instanceId], Date.now());
    return { ok: true, spent: FEED_COST, care: after, diamonds: W.state.economy.diamonds };
  }

  function petXpForAnswer(gains) {
    var n = PET_XP_BASE;
    var streak = gains && gains.combo ? Number(gains.combo) : 0;
    if (streak >= 10) n += 3;
    else if (streak >= 5) n += 2;
    else if (streak >= 3) n += 1;
    return n;
  }

  function motionOn() {
    if (!W.state || !W.state.settings || !W.state.settings.effects) return false;
    try {
      return !(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) { return true; }
  }

  function showPetXpPop(total, leveled) {
    if (!global.document || !document.body) return;
    var el = document.createElement('div');
    el.className = 'pets-xp-pop' + (motionOn() ? '' : ' pets-xp-pop--still');
    el.setAttribute('role', 'status');
    el.textContent = '+' + total + ' pet XP' + (leveled ? ' · Lv ' + leveled : '');
    document.body.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, motionOn() ? 1500 : 1700);
  }

  /* Called from award() on a correct answer. Adds to the pet XP bank only. */
  function noteAnswer(gains) {
    if (!gains || gains === false) return null;
    ensureRoster();
    var base = petXpForAnswer(gains);
    var pal = companion();
    var mood = pal ? careFor(pal.instanceId) : null;
    var bonus = (mood && mood.bonus) ? Math.max(1, Math.round(base * 0.25)) : 0;
    var total = base + bonus;
    var p = petsBag();
    p.xpBank += total;
    commitPets();
    var leveled = 0;
    if (pal) {
      var guard = 0;
      while (pal && pal.level < MAX_LEVEL && guard++ < MAX_LEVEL) {
        if (p.xpBank < upgradeCost(pal)) break;
        var res = upgrade(pal.instanceId);
        if (!res || !res.ok) break;
        leveled = res.owned.level;
        pal = res.owned;
        p = petsBag();
      }
    }
    showPetXpPop(total, leveled);
    return { petXp: total, bonus: bonus, bank: petsBag().xpBank, level: leveled };
  }

  function bindPats(el) {
    if (!el || !W.$$) return;
    W.$$('.pets-card__art', el).forEach(function (art) {
      art.addEventListener('pointerdown', function () {
        if (!motionOn()) return;
        var blox = art.querySelector('.pets-blox');
        if (!blox) return;
        blox.classList.remove('is-patted');
        void blox.offsetWidth;
        blox.classList.add('is-patted');
      });
    });
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

  /* -------------------- Pets Diamonds wallet (per account) -------- */
  function viewerAccountId() {
    var id = (W && typeof W.accountId === 'function' && W.accountId()) ||
      (global.Cloud && global.Cloud.user && global.Cloud.user.id) ||
      '';
    return id ? String(id) : 'local';
  }

  function readWalletStore() {
    try {
      var raw = global.localStorage.getItem(WALLET_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }

  function writeWalletStore(store) {
    try { global.localStorage.setItem(WALLET_KEY, JSON.stringify(store)); } catch (e) {}
  }

  /* Legacy LEA-16 shape was { diamonds }. Promote into accounts[viewer]. */
  function normalizeWalletStore(raw) {
    if (raw && raw.version === 1 && raw.accounts && typeof raw.accounts === 'object') {
      return raw;
    }
    var accounts = {};
    if (raw && typeof raw.diamonds === 'number') {
      accounts[viewerAccountId()] = {
        diamonds: Math.max(0, Math.floor(raw.diamonds)),
        seededAt: raw.seededAt || Date.now(),
        updatedAt: Date.now(),
        migratedFrom: 'legacy-v0'
      };
    }
    return { version: 1, accounts: accounts };
  }

  function ensureWalletStore() {
    var store = normalizeWalletStore(readWalletStore());
    writeWalletStore(store);
    return store;
  }

  function ensureWallet(accountId) {
    var id = accountId ? String(accountId) : viewerAccountId();
    var store = ensureWalletStore();
    var w = store.accounts[id];
    if (w && typeof w.diamonds === 'number') {
      w.diamonds = Math.max(0, Math.floor(Number(w.diamonds) || 0));
      store.accounts[id] = w;
      writeWalletStore(store);
      return w;
    }
    w = { diamonds: START_DIAMONDS, seededAt: Date.now() };
    store.accounts[id] = w;
    writeWalletStore(store);
    return w;
  }

  function adjustDiamonds(delta, accountId) {
    var id = accountId ? String(accountId) : viewerAccountId();
    var store = ensureWalletStore();
    var w = ensureWallet(id);
    w.diamonds = Math.max(0, Math.floor(w.diamonds + (Number(delta) || 0)));
    w.updatedAt = Date.now();
    store.accounts[id] = w;
    writeWalletStore(store);
    if (id === viewerAccountId()) refreshHudChip();
    return w;
  }

  function setDiamonds(amount, accountId) {
    var id = accountId ? String(accountId) : viewerAccountId();
    var store = ensureWalletStore();
    var w = ensureWallet(id);
    w.diamonds = Math.max(0, Math.floor(Number(amount) || 0));
    w.updatedAt = Date.now();
    store.accounts[id] = w;
    writeWalletStore(store);
    if (id === viewerAccountId()) refreshHudChip();
    return w;
  }

  /* Administrator: adjust a selected account’s Pets Diamonds slot.
     Returns { ok, diamonds, accountId, live }. Live means the edited
     account is the signed-in viewer on this browser (HUD updated). */
  function adminAdjustWallet(accountId, opts) {
    var id = String(accountId || '');
    if (!id) return { ok: false, error: 'No account id.' };
    opts = opts || {};
    var before = ensureWallet(id).diamonds;
    var w;
    if (opts.set != null && opts.set !== '' && !isNaN(+opts.set)) {
      w = setDiamonds(+opts.set, id);
    } else {
      w = adjustDiamonds(Number(opts.delta) || 0, id);
    }
    var live = id === viewerAccountId();
    if (live) refreshHudChip();
    return {
      ok: true,
      accountId: id,
      before: before,
      diamonds: w.diamonds,
      live: live
    };
  }

  function refreshHudChip() {
    var nEl = document.getElementById('hud-pets-gems');
    var sEl = document.getElementById('hud-pets-gems-short');
    var chip = document.getElementById('hud-pets-gem-chip');
    if (!nEl && !sEl && !chip) return;
    var w = ensureWallet();
    var full = String(w.diamonds);
    var short = (W && W.compact) ? W.compact(w.diamonds) : full;
    if (nEl) nEl.textContent = full;
    if (sEl) sEl.textContent = short;
    if (chip) {
      chip.title = w.diamonds.toLocaleString() + ' Pets Diamonds (collab soft currency)';
      var teacher = W && W.state && W.state.role === 'teacher';
      chip.classList.toggle('hidden', !!teacher);
    }
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
      },
      {
        id: listingUid(),
        sellerId: 'demo-rio',
        sellerLabel: 'Rio (demo)',
        price: 95,
        feeBps: FEE_BPS,
        status: 'active',
        createdAt: Date.now() - 5400000,
        pet: {
          instanceId: newInstanceId(),
          speciesId: 'zoom-zoom-zara',
          level: 6,
          xp: 0,
          skinStage: 'B',
          cosmetics: emptyCosmetics(),
          mutationId: 'silver'
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

  function rarityTier(label) {
    var first = String(label || '').trim().split(/\s+/)[0] || '';
    var i;
    for (i = 0; i < RARITY_TIERS.length; i++) {
      if (RARITY_TIERS[i].toLowerCase() === first.toLowerCase()) {
        return RARITY_TIERS[i].toLowerCase();
      }
    }
    return 'common';
  }

  function rarityHtml(label) {
    var tier = rarityTier(label);
    var parts = String(label).trim().split(/\s+/);
    var inner;
    if (parts.length < 2) {
      inner = '<span class="pets-card__rarity-strong">' + esc(label) + '</span>';
    } else {
      var last = parts.pop();
      inner = '<span class="pets-card__rarity-soft">' + esc(parts.join(' ')) +
        '</span> <span class="pets-card__rarity-strong">' + esc(last) + '</span>';
    }
    return '<div class="pets-card__rarity pets-card__rarity--' + esc(tier) +
      '" data-rarity="' + esc(tier) + '">' + inner + '</div>';
  }

  function speciesById(id) {
    for (var i = 0; i < CATALOG.length; i++) {
      if (CATALOG[i].id === id) return CATALOG[i];
    }
    return null;
  }

  function weightedPickSpecies() {
    var total = 0;
    for (var i = 0; i < CATALOG.length; i++) {
      total += Math.max(1, Number(CATALOG[i].weight) || 1);
    }
    var roll = Math.random() * total;
    var acc = 0;
    for (var j = 0; j < CATALOG.length; j++) {
      acc += Math.max(1, Number(CATALOG[j].weight) || 1);
      if (roll < acc) return CATALOG[j];
    }
    return CATALOG[CATALOG.length - 1];
  }

  /* Spend CHEST_COST, mint a weighted catalog brainrot (dupes OK).
     Small chance to also stamp a mutation (Silver / Golden included). */
  function openChestPull() {
    var w = ensureWallet();
    if (w.diamonds < CHEST_COST) {
      return {
        ok: false,
        error: 'Need ' + CHEST_COST + ' Pets Diamonds to open a chest.'
      };
    }
    adjustDiamonds(-CHEST_COST);
    var species = weightedPickSpecies();
    var mut = null;
    if (Math.random() < CHEST_MUTATION_CHANCE) {
      mut = pickRandomMutation();
    }
    var owned = addOwned({
      instanceId: newInstanceId(),
      speciesId: species.id,
      level: 1,
      xp: 0,
      mutationId: mut ? mut.id : null
    });
    return { ok: true, owned: owned, species: species, mutation: mut };
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
    var tier = rarityTier(s.rarity);
    var aria = s.name + ', ' + s.rarity + ', level ' + owned.level +
      (mut ? ', ' + mut.label + ' mutation' : '');
    var isPal = petsBag().activeId === owned.instanceId;
    var mood = careFor(owned.instanceId);
    return '<button type="button" class="pets-card pets-card--tier-' + esc(tier) +
      (mut ? ' pets-card--mutated' : '') +
      (isPal ? ' pets-card--companion' : '') +
      '" data-pet="' + esc(owned.instanceId) +
      '" data-rarity="' + esc(tier) +
      '" aria-label="' + esc(aria) + '">' +
      artHtml(s, owned, '') +
      catchphraseHtml(owned.cosmetics) +
      '<h3 class="pets-card__name">' + nameHtml(s.name) + '</h3>' +
      rarityHtml(s.rarity) +
      '<div class="pets-card__meta">' +
        '<span class="pets-card__level">Lv ' + owned.level + '</span>' +
        '<span class="pets-card__stage">' + esc(stage) + '</span>' +
        (isPal ? '<span class="pets-card__pal">Companion</span>' : '') +
        '<span class="pets-card__mood pets-card__mood--' + esc(mood.mood) + '">' + esc(mood.label) + '</span>' +
        (mut ? mutationBadgeHtml(mut.id) : '') +
      '</div>' +
    '</button>';
  }

  /* Balance lives in the topbar HUD (LEA-22). Kept as a no-op helper so
     older call sites do not throw if a sibling branch still references it. */
  function walletChipHtml() {
    refreshHudChip();
    return '';
  }

  /* Product-update announcement card (LEA-17 follow-up): picture on top,
     update blurb under it — not a neon gradient slab. Shared by homescreen
     popup + Pets hub banner. */
  function eventCardHtml(opts) {
    var o = opts || {};
    var withClose = !!o.withClose;
    var withActions = !!o.withActions;
    return '<div class="pets-event pets-event--update">' +
      (withClose
        ? '<button type="button" class="pets-event__close" data-pets-dismiss aria-label="Dismiss">' +
            I.close + '</button>'
        : '') +
      '<div class="pets-event__media">' +
        '<img class="pets-event__img" src="' + UPDATE_HERO_SRC +
          '" alt="Square starter brainrots lined up for the Mongolian Brainrot collab" width="640" height="280" decoding="async">' +
      '</div>' +
      '<div class="pets-event__body">' +
        '<div class="pets-event__eyebrow">Limited-time collab · product update</div>' +
        '<h2 class="pets-event__title">Mongolian Brainrot × LearnGeo</h2>' +
        '<p class="pets-event__desc">What\'s new: a Pets tab with five starter brainrots ' +
          '(Common → Mythical), chest pulls, levels 1–10 with evolving skins, school-safe ' +
          'cosmetics, mutations, and a Pets Diamonds marketplace. Tap Meet the Pets to open your roster.</p>' +
        (withActions
          ? '<div class="pets-event__actions">' +
              '<button type="button" class="btn btn--sm btn--pets-primary" data-pets-meet>Meet the Pets</button>' +
              '<button type="button" class="btn btn--sm btn--pets-ghost" data-pets-dismiss>Dismiss</button>' +
            '</div>'
          : '') +
      '</div>' +
    '</div>';
  }

  function eventBannerHtml() {
    return eventCardHtml({ withClose: false, withActions: false });
  }

  function bankHtml() {
    var bank = petsBag().xpBank;
    var pal = companion();
    var palName = '';
    if (pal) {
      var sp = speciesById(pal.speciesId);
      palName = sp ? sp.name : '';
    }
    return '<div class="pets-bank" role="status">' +
      '<b class="mono">' + bank + '</b>' +
      '<span>pet XP' + (palName ? ' · companion ' + esc(palName) : '') + '</span>' +
      '<em>Earned from correct answers. Separate from your account level and diamonds.</em>' +
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
    var cost = upgradeCost(owned);
    var bank = petsBag().xpBank;
    return '<div class="pets-xp" role="status" aria-label="Experience ' + owned.xp + ' of ' + need + '">' +
      '<div class="pets-xp__row"><span>Level ' + owned.level + ' → ' + (owned.level + 1) +
        '</span><span>' + owned.xp + ' / ' + need + ' XP</span></div>' +
      '<div class="pets-xp__track"><div class="pets-xp__fill" style="width:' + pct + '%"></div></div>' +
      '<div class="pets-xp__cost">Upgrade costs <b>' + cost + '</b> pet XP · you have <b>' + bank + '</b></div>' +
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
    lockerTab = 'aura';
    render();
  }

  function tierClass(tier) {
    var t = String(tier || 'Common').toLowerCase();
    if (t.indexOf('myth') === 0) return 'mythic';
    if (t.indexOf('epic') === 0) return 'epic';
    if (t.indexOf('rare') === 0) return 'rare';
    return 'common';
  }

  function lockerTileHtml(item, equipped) {
    var isNone = item.id.indexOf('-none') !== -1 || item.id.indexOf('catch-none') === 0;
    var tier = tierClass(item.tier);
    return '<button type="button" class="pets-locker__tile pets-locker__tile--' + esc(tier) +
      (equipped ? ' is-equipped' : '') +
      '" data-pets-equip="' + esc(item.id) + '" data-slot="' + esc(item.slot) + '"' +
      ' aria-pressed="' + (equipped ? 'true' : 'false') + '"' +
      ' aria-label="' + esc(item.name) + (equipped ? ', equipped' : ', equip') + '">' +
      '<span class="pets-locker__tile-art" aria-hidden="true">' +
        (isNone
          ? '<span class="pets-locker__tile-none">∅</span>'
          : '<span class="pets-locker__tile-icon pets-locker__tile-icon--' +
              esc(item.slot) + '"></span>') +
      '</span>' +
      '<span class="pets-locker__tile-name">' + esc(item.name) + '</span>' +
      '<span class="pets-locker__tile-tier">' + esc(item.tier) + '</span>' +
      (equipped
        ? '<span class="pets-locker__equipped-tag">Equipped</span>'
        : '<span class="pets-locker__equip-hint">Equip</span>') +
    '</button>';
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

  function closeChestOverlay(keepNotice) {
    var ov = document.querySelector('.pets-chest-overlay');
    if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
    document.body.classList.remove('no-scroll');
    chestBusy = false;
    chestReveal = null;
    if (!keepNotice) formNotice = null;
    render();
  }

  function runChestSequence() {
    if (chestBusy) return;
    var result = openChestPull();
    if (!result.ok) {
      formNotice = { tone: 'err', text: result.error };
      render();
      return;
    }
    chestBusy = true;
    chestReveal = result;
    formNotice = null;
    document.body.classList.add('no-scroll');

    var ov = W.el('div', 'pets-chest-overlay');
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-label', 'Opening brainrot chest');
    ov.innerHTML =
      '<div class="pets-chest" data-chest-stage="idle">' +
        '<div class="pets-chest__glow" aria-hidden="true"></div>' +
        '<div class="pets-chest__box" aria-hidden="true">' +
          '<div class="pets-chest__lid"></div>' +
          '<div class="pets-chest__body"></div>' +
          '<div class="pets-chest__band"></div>' +
          '<div class="pets-chest__burst"></div>' +
        '</div>' +
        '<p class="pets-chest__status">Shaking…</p>' +
        '<div class="pets-chest__reveal" hidden></div>' +
        '<div class="pets-chest__actions" hidden>' +
          '<button type="button" class="btn btn--sm btn--pets-primary" data-chest-claim>Add to roster</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);

    var stageEl = ov.querySelector('[data-chest-stage]');
    var statusEl = ov.querySelector('.pets-chest__status');
    var revealEl = ov.querySelector('.pets-chest__reveal');
    var actionsEl = ov.querySelector('.pets-chest__actions');

    function setStage(name, status) {
      stageEl.setAttribute('data-chest-stage', name);
      if (status) statusEl.textContent = status;
    }

    /* Suspense timeline: idle → shake → crack → reveal. */
    setTimeout(function () { setStage('shake', 'Something\'s inside…'); }, 180);
    setTimeout(function () { setStage('crack', 'Almost!'); }, 1100);
    setTimeout(function () {
      setStage('open', 'New brainrot!');
      var owned = result.owned;
      var s = result.species;
      var mut = result.mutation;
      revealEl.hidden = false;
      revealEl.innerHTML =
        '<div class="pets-chest__prize">' +
          artHtml(s, owned, 'pets-card__art--lg') +
          '<h3 class="pets-card__name">' + nameHtml(s.name) + '</h3>' +
          '<div class="pets-card__rarity">' + rarityHtml(s.rarity) + '</div>' +
          (mut
            ? '<div class="pets-card__meta">' + mutationBadgeHtml(mut.id) + '</div>'
            : '') +
        '</div>';
      actionsEl.hidden = false;
      statusEl.textContent = mut
        ? 'Pulled ' + s.name + ' · ' + mut.label + ' mutation!'
        : 'Pulled ' + s.name + '!';
    }, 1680);

    var claim = ov.querySelector('[data-chest-claim]');
    if (claim) {
      claim.addEventListener('click', function () {
        formNotice = {
          tone: 'ok',
          text: 'Added ' + result.species.name + ' to your roster' +
            (result.mutation ? ' (' + result.mutation.label + ')' : '') +
            ' (−' + CHEST_COST + ' Pets Diamonds).'
        };
        closeChestOverlay(true);
      });
    }
    ov.addEventListener('mousedown', function (e) {
      if (e.target === ov && stageEl.getAttribute('data-chest-stage') === 'open') {
        formNotice = {
          tone: 'ok',
          text: 'Added ' + result.species.name + ' to your roster (−' + CHEST_COST + ' Pets Diamonds).'
        };
        closeChestOverlay(true);
      }
    });
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
    var chest = el.querySelector('[data-pets-chest]');
    if (chest) chest.addEventListener('click', runChestSequence);
    bindPats(el);
  }

  function bindDetail(el, instanceId) {
    var back = el.querySelector('[data-pets-back]');
    if (back) back.addEventListener('click', goHub);
    var play = el.querySelector('[data-pets-play]');
    if (play) {
      play.addEventListener('click', function () {
        var result = upgrade(instanceId);
        if (!result || !result.ok) {
          formNotice = { tone: 'err', text: (result && result.error) || 'Not enough pet XP.' };
          lastLevelUpFlash = null;
          render();
          return;
        }
        formNotice = null;
        if (result.levelsGained > 0) {
          lastLevelUpFlash = {
            instanceId: instanceId,
            level: result.owned.level,
            stage: result.owned.skinStage,
            gained: result.levelsGained,
            evolved: !!result.evolved
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
    var feedBtn = el.querySelector('[data-pets-feed]');
    if (feedBtn) {
      feedBtn.addEventListener('click', function () {
        var result = feed(instanceId);
        if (!result.ok) {
          formNotice = { tone: 'err', text: result.error };
        } else {
          formNotice = {
            tone: 'ok',
            text: 'Fed (−' + result.spent + ' diamonds). Mood: ' + result.care.label + '.'
          };
          if (motionOn()) {
            var blox = el.querySelector('.pets-blox');
            if (blox) blox.classList.add('is-patted');
          }
        }
        render();
      });
    }
    var companionBtn = el.querySelector('[data-pets-companion]');
    if (companionBtn) {
      companionBtn.addEventListener('click', function () {
        setCompanion(instanceId);
        formNotice = { tone: 'ok', text: 'This pet will level up as you study.' };
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
    W.$$('[data-pets-locker-tab]', el).forEach(function (btn) {
      btn.addEventListener('click', function () {
        lockerTab = btn.getAttribute('data-pets-locker-tab') || 'aura';
        render();
      });
    });
    W.$$('[data-pets-equip]', el).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var slot = btn.getAttribute('data-slot');
        var id = btn.getAttribute('data-pets-equip');
        var already = findOwned(ensureRoster(), instanceId);
        if (already && already.cosmetics && already.cosmetics[slot] === id) {
          formNotice = { tone: 'ok', text: 'Already equipped.' };
          render();
          return;
        }
        equipCosmetic(instanceId, slot, id);
        var item = cosmeticById(id);
        formNotice = {
          tone: 'ok',
          text: item ? 'Equipped ' + item.name + '.' : 'Equipped.'
        };
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
        '</div>' +
        '<p>Meet your starter brainrots — Common through Mythical. Correct answers earn pet XP (not your account level). Spend it to upgrade. Feed with shop diamonds to keep a happy mood.</p>' +
        bankHtml() +
      '</div>' +
      noticeHtml() +
      '<div class="pets__banner">' + eventBannerHtml() + '</div>' +
      '<div class="pets__chest-cta">' +
        '<div class="pets__create-head">' +
          '<span class="pets__toolbar-label">Brainrot chest</span>' +
          '<span class="t-sm t-muted">' + CHEST_COST + ' Pets Diamonds</span>' +
        '</div>' +
        '<p class="pets__chest-cta-copy">Suspense pull for a school-safe brainrot — Commons through Mythical, with a chance at Silver or Golden.</p>' +
        '<div class="pets__create-actions">' +
          '<button type="button" class="btn btn--sm btn--pets-primary" data-pets-chest>Open chest</button>' +
        '</div>' +
      '</div>' +
      '<div class="pets__toolbar">' +
        '<span class="pets__toolbar-label">Your roster</span>' +
        '<span class="t-sm t-muted">' + roster.owned.length + ' pets · rarity spread · ' + CATALOG.length + ' in catalog</span>' +
      '</div>' +
      (emptyRoster
        ? '<div class="pets-empty" role="status">' +
            '<strong>Roster empty</strong>' +
            '<p>Open a chest, cancel a listing, or buy a demo listing to fill the roster.</p>' +
            '<button type="button" class="btn btn--sm btn--pets-primary" data-pets-chest>Open chest</button> ' +
            '<button type="button" class="btn btn--sm btn--pets-ghost-dark" data-pets-market>Open marketplace</button>' +
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
      '<p class="pets__note">Tap a pet to upgrade, feed, mutate, customize, or list. Mutations (Glitched, Golden, Silver, Echo, Static) can proc when you cross a skin stage; paid rolls cost ' +
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
    var cost = upgradeCost(owned);
    var bank = petsBag().xpBank;
    var canUpgrade = !atMax && bank >= cost;
    var care = careFor(instanceId);
    var diamonds = (W.state && W.state.economy) ? W.state.economy.diamonds : 0;
    var canFeed = care.hunger < 99 || care.happiness < 99;
    var canPayFeed = diamonds >= FEED_COST;
    var isPal = petsBag().activeId === instanceId;
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
        '<div class="pets-detail__hero pets-detail__hero--tier-' + esc(rarityTier(s.rarity)) +
          (flash ? ' is-levelup' : '') +
          (flash && flash.evolved ? ' is-evolving' : '') + '">' +
          artHtml(s, owned, 'pets-card__art--lg') +
          catchphraseHtml(owned.cosmetics) +
          '<h1 class="pets-detail__name">' + nameHtml(s.name) + '</h1>' +
          rarityHtml(s.rarity) +
          '<div class="pets-detail__stage-line">' +
            '<span class="pets-detail__stage-badge">Skin ' + esc(stage) + '</span>' +
            '<span class="pets-detail__stage-label">' + esc(SKIN_LABELS[stage] || stage) + '</span>' +
            (mut ? mutationBadgeHtml(mut.id) : '') +
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
          '<div class="pets-care" role="status">' +
            '<span class="pets-care__mood pets-care__mood--' + esc(care.mood) + '">' + esc(care.label) + '</span>' +
            '<span>Hunger ' + care.hunger + '</span>' +
            '<span>Happiness ' + care.happiness + '</span>' +
            (care.bonus ? '<span class="pets-care__bonus">+25% pet XP while studying</span>' : '<span>Feed to reach Happy for a small study bonus</span>') +
          '</div>' +
          '<div class="pets-detail__actions">' +
            '<button type="button" class="btn btn--sm btn--pets-primary" data-pets-play' +
              (canUpgrade ? '' : ' disabled') + '>' +
              (atMax ? 'Max level' : (canUpgrade ? 'Upgrade (−' + cost + ' pet XP)' : 'Need ' + cost + ' pet XP')) +
            '</button>' +
            '<button type="button" class="btn btn--sm btn--pets-secondary" data-pets-feed' +
              (!canFeed || !canPayFeed ? ' disabled' : '') + '>' +
              (!canFeed ? 'Well fed' : ('Feed (−' + FEED_COST + ' 💎)')) +
            '</button>' +
            (isPal
              ? '<button type="button" class="btn btn--sm btn--pets-ghost-dark" disabled>Companion</button>'
              : '<button type="button" class="btn btn--sm btn--pets-ghost-dark" data-pets-companion>Set as companion</button>') +
            '<button type="button" class="btn btn--sm btn--pets-secondary" data-pets-customize>Open locker</button>' +
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
          '<p class="pets-detail__hint">Pet XP comes from correct answers in Learn, Practice test, Class quiz and games. It is not your account level or diamond balance. Feeding spends shop diamonds and never harms the pet. Market list gate: Lv ' + MIN_LIST_LEVEL +
            '+ or any mutation.</p>' +
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
    var tab = lockerTab;
    if (SLOT_ORDER.indexOf(tab) < 0) tab = 'aura';
    var options = COSMETIC_CATALOG.filter(function (c) { return c.slot === tab; });
    var tabsHtml = LOCKER_TABS.map(function (t) {
      var on = t.id === tab;
      var eqId = cos[t.id];
      var eqItem = cosmeticById(eqId);
      var filled = eqItem && eqItem.id.indexOf('-none') === -1 && eqItem.id !== 'catch-none';
      return '<button type="button" class="pets-locker__tab' + (on ? ' is-on' : '') +
        (filled ? ' has-item' : '') +
        '" data-pets-locker-tab="' + esc(t.id) + '"' +
        ' aria-pressed="' + (on ? 'true' : 'false') + '">' +
        '<span class="pets-locker__tab-label">' + esc(t.label) + '</span>' +
      '</button>';
    }).join('');
    var gridHtml = options.map(function (item) {
      return lockerTileHtml(item, cos[tab] === item.id);
    }).join('');
    var equippedNow = cosmeticById(cos[tab]);

    return '<div class="portal__inner pets pets--customize">' +
      '<button type="button" class="pets-back" data-pets-back>' +
        '<span aria-hidden="true">←</span> Back to ' + esc(s.name) +
      '</button>' +
      noticeHtml() +
      '<div class="pets__head pets__head--compact">' +
        '<div class="eyebrow">Locker</div>' +
        '<h1>' + esc(s.name) + '</h1>' +
        '<p>Fortnite-style locker for school-safe cosmetics. Big preview left, item tiles right.' +
          (mut ? ' Mutation <strong>' + esc(mut.label) + '</strong> stays on.' : '') +
        '</p>' +
      '</div>' +
      '<div class="pets-locker">' +
        '<aside class="pets-locker__stage" aria-label="Character preview">' +
          '<div class="pets-locker__preview">' +
            artHtml(s, owned, 'pets-card__art--locker') +
            catchphraseHtml(owned.cosmetics) +
          '</div>' +
          '<div class="pets-locker__stage-meta">' +
            '<div class="pets-card__name">' + nameHtml(s.name) + '</div>' +
            '<div class="pets-card__rarity">' + rarityHtml(s.rarity) + '</div>' +
            (mut ? '<div class="pets-card__meta">' + mutationBadgeHtml(mut.id) + '</div>' : '') +
            '<p class="pets-locker__equipped-line">' +
              (equippedNow && equippedNow.id.indexOf('-none') === -1 && equippedNow.id !== 'catch-none'
                ? 'Equipped · ' + esc(SLOT_LABELS[tab]) + ': <strong>' + esc(equippedNow.name) + '</strong>'
                : 'Nothing equipped in ' + esc(SLOT_LABELS[tab])) +
            '</p>' +
          '</div>' +
        '</aside>' +
        '<section class="pets-locker__panel" aria-label="Cosmetic locker">' +
          '<div class="pets-locker__tabs" role="tablist">' + tabsHtml + '</div>' +
          '<div class="pets-locker__grid" role="list">' + gridHtml + '</div>' +
        '</section>' +
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
    var tier = rarityTier(s.rarity);
    return '<article class="pets-mcard pets-mcard--tier-' + esc(tier) +
      '" data-rarity="' + esc(tier) + '">' +
      '<div class="pets-mcard__art">' + artHtml(s, pet, '') + '</div>' +
      '<div class="pets-mcard__body">' +
        '<h3 class="pets-mcard__name">' + nameHtml(s.name) + '</h3>' +
        rarityHtml(s.rarity) +
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

  function listingSpecies(listing) {
    return listing && listing.pet ? speciesById(listing.pet.speciesId) : null;
  }

  function renderMarket() {
    var listings = activeListings(ensureMarket());
    var rarityFilter = marketFilter.indexOf('rarity:') === 0
      ? marketFilter.slice('rarity:'.length)
      : null;
    var filtered = listings.filter(function (L) {
      if (marketFilter === 'mutated') return !!L.pet && !!L.pet.mutationId;
      if (marketFilter === 'high') return !!L.pet && L.pet.level >= MIN_LIST_LEVEL;
      if (rarityFilter) {
        var sp = listingSpecies(L);
        return !!sp && rarityTier(sp.rarity) === rarityFilter;
      }
      return true;
    });
    var yours = 0;
    for (var i = 0; i < listings.length; i++) {
      if (listings[i].sellerId === YOU_SELLER) yours++;
    }
    var rarityChips = RARITY_TIERS.map(function (tier) {
      var key = 'rarity:' + tier.toLowerCase();
      var on = marketFilter === key;
      return '<button type="button" class="pets-chip pets-chip--rarity-' +
        esc(tier.toLowerCase()) + (on ? ' is-on' : '') +
        '" data-pets-filter="' + esc(key) +
        '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
        '<span class="pets-chip__name">' + esc(tier) + '</span></button>';
    }).join('');
    var listHtml;
    if (!filtered.length) {
      listHtml = '<div class="pets-empty" role="status">' +
        '<strong>No listings here</strong>' +
        '<p>' +
          (listings.length
            ? 'Nothing matches this filter. Try All, another rarity, or list one of your high-level / mutated pets.'
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
        '</div>' +
        '<p>Browse by rarity (Common → Mythical), mutation, or level. Buy, list, or cancel — soft currency only, classroom-safe. Balance is in the top bar.</p>' +
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
        rarityChips +
        '<button type="button" class="btn btn--sm btn--pets-secondary" data-pets-go-list>List a pet</button>' +
      '</div>' +
      listHtml +
      '<div class="pets-limits" role="note">' +
        '<strong>v1 economy notes</strong>' +
        '<ul>' +
          '<li><strong>Pets Diamonds</strong> — local demo soft currency (' +
            'wallet key <code>learngeo.pets.wallet.v0</code>), separate from LearnGeo shop diamonds</li>' +
          '<li>Starter rarities span Common → Mythical (not every listing is Mythical)</li>' +
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
    refreshHudChip();
    el.classList.toggle('pets--motion', motionOn());
    var name = screen.name || 'hub';
    if (name === 'detail') {
      el.innerHTML = renderDetail(roster, screen.instanceId);
      bindDetail(el, screen.instanceId);
      bindPats(el);
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
  var popupTimer = null;
  var popupTries = 0;

  function closePopup(ov, dismiss) {
    if (dismiss) writeDismissed();
    if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
    popupOpen = false;
    /* Settings and other dialogs share no-scroll. Only release it when
       nothing else is holding the page. */
    if (!document.querySelector('.overlay')) document.body.classList.remove('no-scroll');
  }

  /* Student Home only, and never while a modal, menu, or other overlay
     is up. Teachers and every other view are a hard no. */
  function studentOnHome() {
    if (!W.state || W.state.role === 'teacher') return false;
    var app = document.getElementById('app');
    if (!app || !app.classList.contains('is-open')) return false;
    if (document.body.classList.contains('view-teacher')) return false;
    var portal = document.getElementById('view-portal');
    if (!portal || portal.classList.contains('hidden')) return false;
    return true;
  }

  function blockingOverlay() {
    return !!(document.querySelector(
      '.overlay, .role-pick, .menu, .pets-chest-overlay, .pets-event-overlay, .lg-update-overlay'
    ));
  }

  function showEventPopup() {
    if (popupOpen || readDismissed()) return;
    if (!studentOnHome() || blockingOverlay()) return;
    if (document.querySelector('.pets-event-overlay')) return;

    popupOpen = true;
    var ov = W.el('div', 'pets-event-overlay');
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-label', 'Mongolian Brainrot × LearnGeo update');
    ov.innerHTML = eventCardHtml({ withClose: true, withActions: true });
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

  function cancelEventPopup() {
    if (popupTimer) {
      clearTimeout(popupTimer);
      popupTimer = null;
    }
    popupTries = 0;
    var ov = document.querySelector('.pets-event-overlay');
    if (ov) closePopup(ov, false);
    else popupOpen = false;
  }

  /* Homescreen announcement for students. A pending retry is cancelled
     when the view, role, or a modal changes — it must not fire later. */
  function maybeShowEventPopup() {
    if (readDismissed()) return;
    if (popupTimer) {
      clearTimeout(popupTimer);
      popupTimer = null;
    }
    popupTries = 0;
    schedulePopup(420);
  }

  function schedulePopup(ms) {
    if (popupTimer) clearTimeout(popupTimer);
    popupTimer = setTimeout(attemptPopup, ms);
  }

  function attemptPopup() {
    popupTimer = null;
    if (readDismissed() || popupOpen) return;
    if (!studentOnHome()) return;
    if (blockingOverlay()) {
      if (popupTries++ < 8) schedulePopup(400);
      return;
    }
    showEventPopup();
  }

  function dismissOverlayIfOpen() {
    cancelEventPopup();
  }

  /* Any save that lands in state — guest load, account switch, cloud
     adopt — is wiped once if it predates the reset. replaceState is
     wrapped rather than copied so Cloud.adopt keeps calling it. */
  if (W.replaceState) {
    var replaceStateInner = W.replaceState;
    W.replaceState = function (obj) {
      replaceStateInner(obj);
      applyLevelReset();
    };
  }
  applyLevelReset();

  global.Pets = {
    start: start,
    stop: stop,
    render: render,
    maybeShowEventPopup: maybeShowEventPopup,
    cancelEventPopup: cancelEventPopup,
    dismissOverlayIfOpen: dismissOverlayIfOpen,
    starters: STARTERS,
    catalog: CATALOG,
    extended: EXTENDED,
    rarityTiers: RARITY_TIERS,
    cosmeticCatalog: COSMETIC_CATALOG,
    mutations: MUTATIONS,
    skinStageForLevel: skinStageForLevel,
    xpToAdvance: xpToAdvance,
    grantXp: grantXp,
    upgrade: upgrade,
    feed: feed,
    noteAnswer: noteAnswer,
    applyLevelReset: applyLevelReset,
    noteCloudChoice: noteCloudChoice,
    careFor: careFor,
    setCompanion: setCompanion,
    equipCosmetic: equipCosmetic,
    tryMutationRoll: tryMutationRoll,
    openChestPull: openChestPull,
    listPet: listPet,
    buyListing: buyListing,
    cancelListing: cancelListing,
    /* LEA-22 — HUD + Administrator */
    refreshHudChip: refreshHudChip,
    adminAdjustWallet: adminAdjustWallet,
    viewerAccountId: viewerAccountId,
    /* test / ops helpers */
    _dismissKey: DISMISS_KEY,
    _rosterKey: ROSTER_KEY,
    _designsKey: DESIGNS_KEY,
    _walletKey: WALLET_KEY,
    _marketKey: MARKET_KEY,
    _ensureRoster: ensureRoster,
    _ensureWallet: ensureWallet,
    _ensureMarket: ensureMarket,
    _setDiamonds: setDiamonds,
    _adjustDiamonds: adjustDiamonds,
    _readDismissed: readDismissed,
    _readDesigns: readDesigns,
    _updateDesignStatus: updateDesignStatus,
    _MAX_LEVEL: MAX_LEVEL,
    _BASE_XP: BASE_XP,
    _PLAY_XP: PLAY_XP,
    _PET_XP_BASE: PET_XP_BASE,
    _FEED_COST: FEED_COST,
    _RESET_VERSION: PETS_RESET_VERSION,
    get lastResetApplied() { return lastResetApplied; },
    _xpBank: function () { return petsBag().xpBank; },
    _setXpBank: function (n) { petsBag().xpBank = Math.max(0, Math.floor(Number(n) || 0)); commitPets(); return petsBag().xpBank; },
    _MIN_LIST_LEVEL: MIN_LIST_LEVEL,
    _FEE_BPS: FEE_BPS,
    _START_DIAMONDS: START_DIAMONDS,
    _CHEST_COST: CHEST_COST,
    _UPLOAD_MAX_BYTES: UPLOAD_MAX_BYTES,
    _UPLOAD_MAX_PENDING: UPLOAD_MAX_PENDING
  };
})(window);
