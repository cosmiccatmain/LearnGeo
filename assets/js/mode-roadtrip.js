/* ------------------------------------------------------------------
   LearnGeo — Journey path (LEA-85 / LEA-96 / LEA-99 / LEA-102 / LEA-105).

   Duolingo-style vertical zig-zag of lessons, chests, stories and a
   unit trophy. Units start in Africa; the learner can switch units.
   Existing mastery seeds completed lessons so shipping this does not
   reset progress. LearnGeo fonts/brand only — no Duo owl. Games stays
   in the nav. No Stripe, no screen mirroring, no classroom wallet wall.

   LEA-96 — unit/lesson slide transitions (~400ms), share-journey
   (link + friend gamertag, wallet-style), motion polish on path/nodes/XP.
   LEA-99 — Journey rename, drop Coming-up rail, bigger unit banner,
   tighter XP panel + path nodes. Level numeral stays modest (LEA-95).
   LEA-102 — interactive world map on the path: pan/zoom (CSS
   transform), current unit countries highlighted. Not a loupe; not
   screen mirroring. Respects prefers-reduced-motion.
   LEA-105 — Brawl Stars–style Journey chest open: big chest overlay,
   tap to open with rarity upgrade chance, juicy multi-reward loot
   (gems / XP / journey boosts / cosmetics). Reduced-motion safe.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons;

  /* box >= SEED_BOX counts as “already knows this place.” A lesson is
     seeded complete when SEED_RATIO of its countries clear that bar. */
  var SEED_BOX = 2;
  var SEED_RATIO = 0.6;

  /* Zig-zag horizontal slots: 0 center, -1 left, 1 right. */
  var ZIG = [0, 1, -1, 0, 1, -1, 0];

  /* Slide + motion timing (ms). Crisp, satisfying — not sluggish. */
  var SLIDE_MS = 420;
  var SLIDE_EASE = 'cubic-bezier(.22,.8,.28,1)';

  /* Pending enter animation for the next path paint. */
  var pendingSlide = null; /* { dir: 1|-1 } */
  var pendingPulse = null; /* node id just completed */
  var pendingUnlock = null; /* node id that became playable */
  var viewingShare = null; /* decoded friend road snapshot */
  var chestBusy = false; /* LEA-105 — block double-open while overlay runs */

  /* LEA-105 — Journey chest rarities (visual + loot tier). Cascade upgrade
     chances are independent rolls after each step, Brawl Stars style. */
  var CHEST_RARITIES = [
    { id: 'common', label: 'Common', hue: '#94A3B8', glow: 'rgba(148,163,184,.45)' },
    { id: 'rare', label: 'Rare', hue: '#1B4DFF', glow: 'rgba(27,77,255,.5)' },
    { id: 'epic', label: 'Epic', hue: '#7C3AED', glow: 'rgba(124,58,237,.55)' },
    { id: 'legendary', label: 'Legendary', hue: '#F59E0B', glow: 'rgba(245,158,11,.6)' }
  ];
  var CHEST_UPGRADE_CHANCE = { common: 0.42, rare: 0.32, epic: 0.22 };

  /* Interactive Journey globe (LEA-102). One live controller at a time. */
  var globeCtl = null;
  var GLOBE_MIN = 1;
  var GLOBE_MAX = 4.8;
  var GLOBE_PAD = 0.22; /* fraction of bbox padding when framing a unit */

  var UNITS = [
    {
      id: 'africa-north',
      n: 1,
      title: 'North Africa',
      blurb: 'Sahara rim capitals — Maghreb to the Nile.',
      accent: '#0F766E',
      region: 'Africa',
      story: {
        title: 'Along the Sahara rim',
        body: 'North Africa ties the Atlantic to the Red Sea. Capitals sit on the coast or the Nile — Algiers, Tunis, Tripoli, Cairo — while the desert still shapes the map between them.'
      },
      lessons: [
        { id: 'l1', title: 'Maghreb coast', countries: ['Morocco', 'Algeria', 'Tunisia', 'Libya'] },
        { id: 'l2', title: 'Nile corridor', countries: ['Egypt', 'Sudan', 'South Sudan'] },
        { id: 'l3', title: 'Atlantic Sahara', countries: ['Mauritania', 'Cabo Verde', 'Senegal'] }
      ]
    },
    {
      id: 'africa-west',
      n: 2,
      title: 'West Africa',
      blurb: 'Gulf of Guinea capitals and Sahel stops.',
      accent: '#B45309',
      region: 'Africa',
      story: {
        title: 'Gulf of Guinea',
        body: 'West Africa’s coastal capitals — Accra, Lagos, Abidjan — grew as ports. Inland, Bamako and Niamey mark the Sahel road north toward the desert.'
      },
      lessons: [
        { id: 'l1', title: 'Gulf ports', countries: ['Nigeria', 'Ghana', "Côte d'Ivoire", 'Benin', 'Togo'] },
        { id: 'l2', title: 'Sahel road', countries: ['Mali', 'Niger', 'Burkina Faso', 'Chad'] },
        { id: 'l3', title: 'Upper coast', countries: ['Senegal', 'Gambia', 'Guinea', 'Sierra Leone', 'Liberia', 'Guinea-Bissau'] }
      ]
    },
    {
      id: 'africa-east',
      n: 3,
      title: 'East Africa',
      blurb: 'Rift Valley capitals and Horn ports.',
      accent: '#166534',
      region: 'Africa',
      story: {
        title: 'Great Rift',
        body: 'The East African Rift lines up Nairobi, Kampala, Kigali and Dodoma. Further north, Addis Ababa and the Horn ports open to the Red Sea and Indian Ocean.'
      },
      lessons: [
        { id: 'l1', title: 'Rift core', countries: ['Kenya', 'Tanzania', 'Uganda', 'Rwanda', 'Burundi'] },
        { id: 'l2', title: 'Horn', countries: ['Ethiopia', 'Eritrea', 'Djibouti', 'Somalia'] },
        { id: 'l3', title: 'Lakes south', countries: ['Malawi', 'Zambia', 'Mozambique'] }
      ]
    },
    {
      id: 'africa-south',
      n: 4,
      title: 'Southern Africa',
      blurb: 'Cape routes, highveld and Kalahari edges.',
      accent: '#9A3412',
      region: 'Africa',
      story: {
        title: 'Cape to Kalahari',
        body: 'Southern Africa runs from Cape Town’s tip to the highveld around Pretoria and Harare, with Windhoek and Gaborone inland on the dry plateau.'
      },
      lessons: [
        { id: 'l1', title: 'Cape & highveld', countries: ['South Africa', 'Lesotho', 'Eswatini'] },
        { id: 'l2', title: 'Plateau', countries: ['Namibia', 'Botswana', 'Zimbabwe'] },
        { id: 'l3', title: 'Atlantic south', countries: ['Angola', 'Zambia', 'Mozambique'] }
      ]
    },
    {
      id: 'africa-central',
      n: 5,
      title: 'Central Africa',
      blurb: 'Congo Basin and Gulf of Guinea bend.',
      accent: '#1D4ED8',
      region: 'Africa',
      story: {
        title: 'Congo Basin',
        body: 'Kinshasa and Brazzaville face each other on the Congo River. Inland capitals — Bangui, Yaoundé, Libreville — sit on forest and gulf routes.'
      },
      lessons: [
        { id: 'l1', title: 'Congo cities', countries: ['Democratic Republic of the Congo', 'Republic of the Congo', 'Central African Republic'] },
        { id: 'l2', title: 'Gulf bend', countries: ['Cameroon', 'Gabon', 'Equatorial Guinea', 'São Tomé and Príncipe'] },
        { id: 'l3', title: 'Island hops', countries: ['Madagascar', 'Mauritius', 'Seychelles', 'Comoros'] }
      ]
    },
    {
      id: 'europe',
      n: 6,
      title: 'Europe',
      blurb: 'A short continental hop after Africa.',
      accent: '#1B4DFF',
      region: 'Europe',
      story: {
        title: 'Grand Tour',
        body: 'Europe’s classic road-trip capitals still sit a train ride apart — Paris, Rome, Berlin, Madrid — so a short pack covers a lot of ground.'
      },
      lessons: [
        { id: 'l1', title: 'West core', countries: ['France', 'Spain', 'Portugal', 'United Kingdom', 'Ireland'] },
        { id: 'l2', title: 'Center', countries: ['Germany', 'Switzerland', 'Austria', 'Czechia', 'Poland'] },
        { id: 'l3', title: 'South & north', countries: ['Italy', 'Greece', 'Sweden', 'Norway', 'Netherlands', 'Belgium'] }
      ]
    },
    {
      id: 'asia',
      n: 7,
      title: 'Asia',
      blurb: 'Silk Road stops and Pacific megacities.',
      accent: '#7C2D12',
      region: 'Asia',
      story: {
        title: 'Silk & sea',
        body: 'Asia’s path swings from Istanbul and Tehran across the steppe to Beijing and Delhi, then out to Tokyo and Jakarta on the Pacific rim.'
      },
      lessons: [
        { id: 'l1', title: 'West Asia', countries: ['Turkey', 'Iran', 'Iraq', 'Saudi Arabia', 'Israel', 'Jordan'] },
        { id: 'l2', title: 'South & center', countries: ['India', 'Pakistan', 'China', 'Kazakhstan', 'Uzbekistan'] },
        { id: 'l3', title: 'East rim', countries: ['Japan', 'South Korea', 'Vietnam', 'Thailand', 'Indonesia', 'Philippines'] }
      ]
    },
    {
      id: 'americas',
      n: 8,
      title: 'The Americas',
      blurb: 'Pan-American capitals north to south.',
      accent: '#C2410C',
      region: 'Americas',
      story: {
        title: 'Long highway',
        body: 'The Americas stretch one long road story — Ottawa to Mexico City, then down the Andes past Bogotá, Lima and Santiago to Buenos Aires.'
      },
      lessons: [
        { id: 'l1', title: 'North', countries: ['Canada', 'United States', 'Mexico'] },
        { id: 'l2', title: 'Central', countries: ['Guatemala', 'Costa Rica', 'Panama', 'Cuba', 'Jamaica'] },
        { id: 'l3', title: 'South', countries: ['Colombia', 'Peru', 'Chile', 'Argentina', 'Brazil', 'Uruguay'] }
      ]
    },
    {
      id: 'oceania',
      n: 9,
      title: 'Oceania',
      blurb: 'Pacific island capitals and the Antipodes.',
      accent: '#6D28D9',
      region: 'Oceania',
      story: {
        title: 'Island chain',
        body: 'Oceania’s capitals are often ports — Canberra and Wellington on the Antipodes, with Suva, Port Moresby and others hopping the Pacific.'
      },
      lessons: [
        { id: 'l1', title: 'Antipodes', countries: ['Australia', 'New Zealand'] },
        { id: 'l2', title: 'Melanesia', countries: ['Papua New Guinea', 'Fiji', 'Solomon Islands', 'Vanuatu'] },
        { id: 'l3', title: 'Wider Pacific', countries: ['Samoa', 'Tonga', 'Kiribati', 'Micronesia', 'Palau', 'Marshall Islands'] }
      ]
    }
  ];

  var run = null; /* active quiz run */

  function esc(s) { return W.escapeHtml(String(s == null ? '' : s)); }
  function host() { return document.getElementById('view-roadtrip'); }

  function reduceMotion() {
    try {
      return !!(global.matchMedia &&
        global.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) { return false; }
  }

  function sb() { return global.Cloud && global.Cloud.sb; }
  function signedIn() { return !!(global.Cloud && global.Cloud.signedIn); }
  function myTag() { return (W.state.gamertag || ''); }
  function deviceId() {
    return global.GameBoards && global.GameBoards.deviceId
      ? global.GameBoards.deviceId()
      : (W.state.deviceId || '');
  }

  function rpc(name, args) {
    var c = sb();
    if (!c) return Promise.resolve({ ok: false, error: 'offline' });
    return c.rpc(name, args).then(function (res) {
      if (res && res.error) return { ok: false, error: 'offline', message: res.error.message };
      return res.data || { ok: false, error: 'offline' };
    }, function () { return { ok: false, error: 'offline' }; });
  }

  function rtState() {
    if (!W.state.roadtrip || typeof W.state.roadtrip !== 'object') {
      W.state.roadtrip = {
        unitId: 'africa-north', done: {}, claimed: {}, read: {},
        xpEarned: 0, gemsEarned: 0
      };
    }
    var r = W.state.roadtrip;
    if (!r.done || typeof r.done !== 'object') r.done = {};
    if (!r.claimed || typeof r.claimed !== 'object') r.claimed = {};
    if (!r.read || typeof r.read !== 'object') r.read = {};
    if (!r.unitId) r.unitId = 'africa-north';
    if (typeof r.xpEarned !== 'number') r.xpEarned = 0;
    if (typeof r.gemsEarned !== 'number') r.gemsEarned = 0;
    return r;
  }

  function unitById(id) {
    for (var i = 0; i < UNITS.length; i++) if (UNITS[i].id === id) return UNITS[i];
    return UNITS[0];
  }

  function currentUnit() { return unitById(rtState().unitId); }

  function nodeKey(unitId, nodeId) { return unitId + '.' + nodeId; }

  function masteryBox(name) {
    var m = W.state.mastery && W.state.mastery[name];
    return m ? (m.box || 0) : 0;
  }

  /* True when prior knowledge is enough to treat the lesson as done. */
  function seedLessonDone(countries) {
    if (!countries || !countries.length) return false;
    var known = 0;
    for (var i = 0; i < countries.length; i++) {
      if (masteryBox(countries[i]) >= SEED_BOX) known += 1;
    }
    return (known / countries.length) >= SEED_RATIO;
  }

  function lessonCountriesKnown(countries) {
    var known = 0;
    for (var i = 0; i < (countries || []).length; i++) {
      if (masteryBox(countries[i]) >= SEED_BOX) known += 1;
    }
    return { known: known, total: (countries || []).length };
  }

  /* Apply mastery seeds into roadtrip.done without clearing play progress. */
  function seedFromMastery(unit) {
    var r = rtState();
    var changed = false;
    (unit.lessons || []).forEach(function (les) {
      var key = nodeKey(unit.id, les.id);
      if (r.done[key]) return;
      if (seedLessonDone(les.countries)) {
        r.done[key] = 'seeded';
        changed = true;
      }
    });
    /* Trophy seeds only when every lesson is done (seeded or played). */
    var trophyKey = nodeKey(unit.id, 'trophy');
    if (!r.done[trophyKey] && lessonsAllDone(unit)) {
      /* do not auto-complete trophy — learner still plays the finale */
    }
    if (changed) W.save();
  }

  function isDone(unitId, nodeId) {
    return !!rtState().done[nodeKey(unitId, nodeId)];
  }

  function markDone(unitId, nodeId, how) {
    rtState().done[nodeKey(unitId, nodeId)] = how || true;
    W.save();
  }

  function lessonsAllDone(unit) {
    for (var i = 0; i < unit.lessons.length; i++) {
      if (!isDone(unit.id, unit.lessons[i].id)) return false;
    }
    return true;
  }

  function buildPath(unit) {
    seedFromMastery(unit);
    var nodes = [];
    unit.lessons.forEach(function (les, i) {
      nodes.push({
        kind: 'lesson',
        id: les.id,
        title: les.title,
        countries: les.countries,
        zig: ZIG[nodes.length % ZIG.length]
      });
      /* Chest after the second lesson; story after the third. */
      if (i === 1) {
        nodes.push({ kind: 'chest', id: 'chest', title: 'Journey chest', zig: ZIG[nodes.length % ZIG.length] });
      }
      if (i === 2) {
        nodes.push({
          kind: 'story', id: 'story', title: unit.story.title,
          zig: ZIG[nodes.length % ZIG.length]
        });
      }
    });
    nodes.push({
      kind: 'trophy', id: 'trophy', title: 'Unit trophy',
      countries: unitCountries(unit),
      zig: ZIG[nodes.length % ZIG.length]
    });
    return annotate(unit, nodes);
  }

  function unitCountries(unit) {
    var seen = {}, out = [];
    unit.lessons.forEach(function (les) {
      les.countries.forEach(function (n) {
        if (!seen[n]) { seen[n] = 1; out.push(n); }
      });
    });
    return out;
  }

  /* Map unit.region labels onto GeoData region names for a soft wash. */
  function unitSoftRegions(unit) {
    if (!unit) return [];
    if (unit.region === 'Americas') return ['North America', 'South America'];
    return unit.region ? [unit.region] : [];
  }

  /* Bounding box of unit countries in WorldMap viewBox units. */
  function unitMapBounds(unit) {
    var WM = global.WorldMap;
    if (!WM || !WM.project || !global.GeoData) return null;
    var names = unitCountries(unit);
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    var hit = 0;
    for (var i = 0; i < names.length; i++) {
      var c = null;
      for (var j = 0; j < global.GeoData.countries.length; j++) {
        if (global.GeoData.countries[j].name === names[i]) {
          c = global.GeoData.countries[j];
          break;
        }
      }
      if (!c) continue;
      var p = WM.project(c.lon, c.lat);
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
      hit++;
    }
    if (!hit) return null;
    /* Tiny island packs need a floor span so zoom doesn't blow past MAX. */
    var padX = Math.max(18, (maxX - minX) * GLOBE_PAD + 10);
    var padY = Math.max(14, (maxY - minY) * GLOBE_PAD + 8);
    return {
      x: minX - padX,
      y: minY - padY,
      w: Math.max(36, maxX - minX + padX * 2),
      h: Math.max(28, maxY - minY + padY * 2)
    };
  }

  function globeHtml(unit) {
    return '<section class="rt-globe" id="rt-globe" style="--rt-accent:' + esc(unit.accent) +
      '" aria-label="Interactive map of ' + esc(unit.title) + '">' +
      '<div class="rt-globe__head">' +
        '<div class="rt-globe__copy">' +
          '<b>On the map</b>' +
          '<span>Drag to pan · scroll to zoom · unit region lit</span>' +
        '</div>' +
        '<div class="rt-globe__tools" role="group" aria-label="Map controls">' +
          '<button type="button" class="rt-globe__btn" id="rt-globe-out" aria-label="Zoom out" title="Zoom out">−</button>' +
          '<button type="button" class="rt-globe__btn" id="rt-globe-in" aria-label="Zoom in" title="Zoom in">+</button>' +
          '<button type="button" class="rt-globe__btn rt-globe__btn--wide" id="rt-globe-reset" aria-label="Frame unit" title="Frame this unit">Frame</button>' +
        '</div>' +
      '</div>' +
      '<div class="rt-globe__frame" id="rt-globe-frame">' +
        '<div class="rt-globe__stage" id="rt-globe-stage">' +
          '<div class="rt-globe__map" id="rt-globe-map"></div>' +
        '</div>' +
      '</div>' +
    '</section>';
  }

  function annotate(unit, nodes) {
    var currentSet = false;
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var prevDone = i === 0 || nodeCleared(unit, nodes[i - 1]);
      if (n.kind === 'lesson' || n.kind === 'trophy') {
        if (isDone(unit.id, n.id)) {
          n.state = 'done';
        } else if (prevDone && !currentSet) {
          n.state = 'current';
          currentSet = true;
        } else if (prevDone) {
          n.state = 'open';
        } else {
          n.state = 'locked';
        }
      } else if (n.kind === 'chest') {
        var claimed = !!rtState().claimed[nodeKey(unit.id, n.id)];
        if (claimed) n.state = 'done';
        else if (prevDone) n.state = 'current';
        else n.state = 'locked';
      } else if (n.kind === 'story') {
        var read = !!rtState().read[nodeKey(unit.id, n.id)];
        if (read) n.state = 'done';
        else if (prevDone) n.state = 'current';
        else n.state = 'locked';
      }
    }
    /* If everything is cleared, keep trophy as current when not done. */
    if (!currentSet) {
      for (var j = 0; j < nodes.length; j++) {
        if (nodes[j].state === 'open') { nodes[j].state = 'current'; break; }
      }
    }
    return nodes;
  }

  function nodeCleared(unit, node) {
    if (node.kind === 'lesson' || node.kind === 'trophy') return isDone(unit.id, node.id);
    if (node.kind === 'chest') return !!rtState().claimed[nodeKey(unit.id, node.id)];
    if (node.kind === 'story') return !!rtState().read[nodeKey(unit.id, node.id)];
    return false;
  }

  function active() { return !!(run && run.phase === 'running'); }

  function start() {
    if (run && run.phase === 'running') return renderQuestion();
    if (run && run.phase === 'done') return renderDone();
    captureShareFromUrl();
    renderPath();
  }

  function abandon() {
    run = null;
    if (globeCtl && globeCtl.destroy) {
      globeCtl.destroy();
      globeCtl = null;
    }
  }

  /* ======================== share your journey (LEA-96) =============== */
  /* Compact snapshot for a share link. School-safe — progress only, no
     classroom wallet wall, no screen mirroring. Friend share looks up a
     gamertag the same way wallet/chess invites do, then hands them a link. */
  function progressSnapshot() {
    var r = rtState();
    var counts = UNITS.map(function (u) {
      var n = 0;
      for (var i = 0; i < u.lessons.length; i++) {
        if (isDone(u.id, u.lessons[i].id)) n += 1;
      }
      return n;
    });
    var unit = currentUnit();
    var nodes = [];
    (unit.lessons || []).forEach(function (les) {
      if (isDone(unit.id, les.id)) nodes.push(les.id);
    });
    if (r.claimed[nodeKey(unit.id, 'chest')]) nodes.push('chest');
    if (r.read[nodeKey(unit.id, 'story')]) nodes.push('story');
    if (isDone(unit.id, 'trophy')) nodes.push('trophy');
    return {
      v: 1,
      t: myTag() || 'Explorer',
      u: unit.id,
      n: nodes,
      s: counts,
      x: r.xpEarned || 0,
      g: r.gemsEarned || 0
    };
  }

  function b64urlEncode(str) {
    var b64 = global.btoa(unescape(encodeURIComponent(str)));
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function b64urlDecode(str) {
    var b64 = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    return decodeURIComponent(escape(global.atob(b64)));
  }

  function encodeSharePayload(snap) {
    try { return b64urlEncode(JSON.stringify(snap)); }
    catch (e) { return ''; }
  }

  function decodeSharePayload(raw) {
    try {
      var obj = JSON.parse(b64urlDecode(raw));
      if (!obj || obj.v !== 1 || typeof obj.u !== 'string') return null;
      if (!Array.isArray(obj.s) || !Array.isArray(obj.n)) return null;
      return {
        v: 1,
        t: String(obj.t || 'Friend').slice(0, 24),
        u: obj.u,
        n: obj.n.map(String).slice(0, 12),
        s: obj.s.map(function (n) { return Math.max(0, Math.min(9, Number(n) || 0)); }).slice(0, UNITS.length),
        x: Math.max(0, Number(obj.x) || 0),
        g: Math.max(0, Number(obj.g) || 0)
      };
    } catch (e) { return null; }
  }

  function shareUrlFor(snap) {
    var payload = encodeSharePayload(snap || progressSnapshot());
    if (!payload) return '';
    var origin = '';
    try { origin = global.location.origin || ''; } catch (e) { origin = ''; }
    if (!origin) origin = 'https://www.learngeo.app';
    return origin + '/roadtrip?road=' + encodeURIComponent(payload);
  }

  function captureShareFromUrl() {
    try {
      var params = new URLSearchParams(global.location.search || '');
      var raw = (params.get('road') || '').trim();
      if (!raw) return null;
      var snap = decodeSharePayload(raw);
      if (!snap) return null;
      viewingShare = snap;
      /* Drop the query so refresh doesn’t keep reopening the friend card. */
      if (global.history && global.history.replaceState) {
        var path = (global.location.pathname || '/roadtrip') +
          (global.location.hash || '');
        global.history.replaceState(global.history.state || {}, '', path);
      }
      return snap;
    } catch (e) { return null; }
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; },
        function () { return fallbackCopy(text); });
    }
    return Promise.resolve(fallbackCopy(text));
  }

  function fallbackCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return !!ok;
    } catch (e) { return false; }
  }

  function friendShareMessage(tag, url) {
    return 'Hey ' + tag + ' — check my LearnGeo Journey! ' + url;
  }

  function lookupTag(tag) {
    if (!tag || !/^[A-Za-z0-9_]{3,16}$/.test(tag)) {
      return Promise.resolve({ ok: false, error: 'invalid_tag' });
    }
    if (myTag() && tag.toLowerCase() === myTag().toLowerCase()) {
      return Promise.resolve({ ok: false, error: 'self' });
    }
    if (!signedIn()) return Promise.resolve({ ok: false, error: 'guest' });
    return rpc('pvp_lookup_tag', { p_tag: tag }).then(function (rows) {
      if (rows && rows.ok === false) return rows;
      var row = Array.isArray(rows) ? rows[0] : rows;
      var found = !!(row && (row.found === true || row.found === 't' || row.gamertag));
      if (!found) return { ok: false, error: 'not_found' };
      return {
        ok: true,
        tag: row.gamertag || tag
      };
    });
  }

  function openShareRoad() {
    if (!global.UI || !global.UI.modal) return;
    var snap = progressSnapshot();
    var url = shareUrlFor(snap);
    var unit = currentUnit();
    var doneN = (snap.s[UNITS.indexOf(unit)] || 0);
    global.UI.modal({
      title: 'Share your journey',
      icon: I.users || I.car,
      body:
        '<div class="rtshare">' +
          '<p class="rtshare__blurb">Send a snapshot of your Journey progress to a friend — school-safe link, no screen mirroring.</p>' +
          '<div class="rtshare__stats">' +
            '<span class="chip mono">' + esc(unit.title) + ' · ' + doneN + '/' +
              unit.lessons.length + ' lessons</span>' +
            '<span class="chip mono">Journey +' + (snap.x || 0) + ' XP</span>' +
            '<span class="chip chip--gem mono">+' + (snap.g || 0) + ' gems</span>' +
          '</div>' +
          '<div class="field" style="margin-top:14px">' +
            '<label class="field__label" for="rt-share-link">Share link</label>' +
            '<div class="rtshare__linkrow">' +
              '<input class="input" id="rt-share-link" readonly value="' + esc(url) + '">' +
              '<button type="button" class="btn btn--ghost" id="rt-share-copy">Copy</button>' +
            '</div>' +
          '</div>' +
          '<div class="panel" style="margin-top:16px;padding:14px 14px 12px">' +
            '<div class="panel__head" style="margin-bottom:8px"><h3 style="margin:0;font-size:15px">Friend share</h3></div>' +
            '<p class="t-sm t-muted" style="margin:0 0 10px">Same pattern as wallet shares — they need a Games gamertag. We look them up, then hand you a copy-ready note with your journey link.</p>' +
            '<div class="rtshare__friend">' +
              '<div class="field" style="flex:1;margin:0">' +
                '<label class="field__label" for="rt-share-tag">Friend’s gamertag</label>' +
                '<input class="input" id="rt-share-tag" maxlength="16" autocomplete="off" autocapitalize="off" ' +
                  'spellcheck="false" placeholder="e.g. MapWizard">' +
              '</div>' +
              '<button type="button" class="btn btn--accent" id="rt-share-friend" style="align-self:flex-end">' +
                (I.play || '') + ' Share</button>' +
            '</div>' +
            '<div class="gt-err" id="rt-share-err" role="alert" style="margin-top:8px"></div>' +
          '</div>' +
        '</div>',
      actions: [{ label: 'Close', cls: 'btn--ghost', close: true }],
      onMount: function (m) {
        var err = W.$('#rt-share-err', m);
        W.$('#rt-share-copy', m).addEventListener('click', function () {
          copyText(url).then(function (ok) {
            W.toast(ok ? 'Link copied' : 'Copy failed',
              ok ? 'Send it to a friend' : 'Select the link and copy manually',
              ok ? I.check : I.info, 2800);
          });
        });
        W.$('#rt-share-friend', m).addEventListener('click', function () {
          var tagEl = W.$('#rt-share-tag', m);
          var tag = (tagEl && tagEl.value || '').trim();
          if (err) err.textContent = '';
          if (!myTag()) {
            if (err) err.textContent = 'Claim a gamertag in Games → Leaderboards first.';
            return;
          }
          lookupTag(tag).then(function (res) {
            if (!res || !res.ok) {
              var msg = ({
                guest: 'Sign in to look up friends.',
                offline: 'Couldn’t reach the server — copy the link instead.',
                invalid_tag: 'Gamertags are 3–16 letters, numbers, or _.',
                not_found: 'No player with that gamertag.',
                self: 'Share with a friend, not yourself.'
              })[res && res.error] || 'Couldn’t share right now.';
              if (err) err.textContent = msg;
              return;
            }
            var note = friendShareMessage(res.tag, url);
            var finish = function (ok) {
              W.toast(ok ? 'Ready for ' + res.tag : 'Copy failed',
                ok ? 'Message copied — paste it to your friend' : 'Use the share link above',
                ok ? I.check : I.info, 3400);
            };
            if (navigator.share) {
              navigator.share({
                title: 'My LearnGeo Journey',
                text: note,
                url: url
              }).then(function () {
                W.toast('Shared', 'Journey sent toward ' + res.tag, I.check, 2800);
              }, function () {
                copyText(note).then(finish);
              });
            } else {
              copyText(note).then(finish);
            }
          });
        });
      }
    });
  }

  function sharePreviewHtml(snap) {
    if (!snap) return '';
    var unit = unitById(snap.u);
    var idx = UNITS.indexOf(unit);
    var done = (snap.s && snap.s[idx]) || 0;
    var rows = UNITS.map(function (u, i) {
      var n = (snap.s && snap.s[i]) || 0;
      var pct = Math.round((n / Math.max(1, u.lessons.length)) * 100);
      return '<div class="rtshare-view__row' + (u.id === snap.u ? ' is-focus' : '') + '">' +
        '<span class="rtshare-view__n mono">U' + u.n + '</span>' +
        '<span class="rtshare-view__t">' + esc(u.title) + '</span>' +
        '<span class="rtshare-view__bar" aria-hidden="true"><i style="width:' + pct + '%"></i></span>' +
        '<span class="mono">' + n + '/' + u.lessons.length + '</span>' +
      '</div>';
    }).join('');
    return '<div class="rtshare-view" id="rt-share-view">' +
      '<div class="rtshare-view__card">' +
        '<button type="button" class="rtshare-view__close" id="rt-share-dismiss" aria-label="Close">' +
          (I.x || '×') + '</button>' +
        '<div class="eyebrow">Friend’s journey</div>' +
        '<h2>' + esc(snap.t) + '</h2>' +
        '<p>Focus unit <b>' + esc(unit.title) + '</b> · ' + done + '/' +
          unit.lessons.length + ' lessons · Journey +' + (snap.x || 0) + ' XP</p>' +
        '<div class="rtshare-view__list">' + rows + '</div>' +
        '<p class="t-sm t-muted" style="margin:12px 0 0">Read-only snapshot — it doesn’t change your path.</p>' +
      '</div>' +
    '</div>';
  }

  /* ====================== upcoming awards + XP chart ================= */
  /* Progress toward Cosmetics.achievements using the same counters
     checkAchievements() reads (stats, streak, level, mastery, seasonal). */
  function achievementProgress(a) {
    var Cos = global.Cosmetics;
    var s = W.state.stats || {};
    if (a.seasonal && a.season) {
      if (!Cos.seasonInWindow(a.season)) return { have: 0, need: a.season.goal || 1, pct: 0 };
      var slot = (W.state.seasonal && W.state.seasonal[a.id]) || null;
      var year = Cos.seasonEditionYear(a.season);
      if (!slot || slot.year !== year) return { have: 0, need: a.season.goal || 1, pct: 0 };
      var have = Cos.seasonProgressValue(slot, a.season.metric);
      var need = a.season.goal || 1;
      return { have: have, need: need, pct: Math.min(1, have / need) };
    }
    switch (a.id) {
      case 'first-steps':  return ratio(s.answered || 0, 1);
      case 'streak-10':    return ratio((W.state.streak && W.state.streak.best) || 0, 10);
      case 'streak-25':    return ratio((W.state.streak && W.state.streak.best) || 0, 25);
      case 'perfect-test': return ratio(s.perfectTests || 0, 1);
      case 'test-5':       return ratio(s.tests || 0, 5);
      case 'cards-100':    return ratio(s.arcade || 0, 150);
      case 'level-10':     return ratio((W.state.economy && W.state.economy.level) || 1, 10);
      case 'answers-500':  return ratio(s.answered || 0, 500);
      case 'globetrotter': return ratio(W.masteredCount ? W.masteredCount() : 0, 100);
      case 'region-master': return bestRegionRatio();
      default: return { have: 0, need: 1, pct: 0 };
    }
  }

  function ratio(have, need) {
    return { have: have, need: need, pct: Math.min(1, (have || 0) / (need || 1)) };
  }

  function bestRegionRatio() {
    var regions = (global.GeoData && global.GeoData.regions) || [];
    var best = 0, have = 0, need = 1;
    for (var i = 0; i < regions.length; i++) {
      var list = global.GeoData.countries.filter(function (c) { return c.region === regions[i]; });
      if (!list.length) continue;
      var done = list.filter(function (c) {
        var m = W.state.mastery[c.name]; return m && m.box >= 4;
      }).length;
      var pct = done / list.length;
      if (pct > best) { best = pct; have = done; need = list.length; }
    }
    return { have: have, need: need, pct: best };
  }

  /* Locked wallet awards closest to unlocking — shown as mini cards on the
     sides of the road (LEA-90). */
  function upcomingAwards(limit) {
    var have = W.state.achievements || [];
    var list = ((global.Cosmetics && global.Cosmetics.achievements) || [])
      .filter(function (a) { return have.indexOf(a.id) === -1; })
      .map(function (a) {
        var p = achievementProgress(a);
        return { ach: a, progress: p };
      })
      .sort(function (x, y) {
        /* Prefer partial progress, then higher %, then smaller remaining. */
        var xp = x.progress.pct > 0 ? 1 : 0;
        var yp = y.progress.pct > 0 ? 1 : 0;
        if (yp !== xp) return yp - xp;
        if (y.progress.pct !== x.progress.pct) return y.progress.pct - x.progress.pct;
        return (x.progress.need - x.progress.have) - (y.progress.need - y.progress.have);
      });
    return list.slice(0, limit || 4);
  }

  /* LEA-92 — large readable award cards in a right-hand column (not
     postage-stamp floats beside the path). */
  function awardCardHtml(item) {
    var a = item.ach;
    var p = item.progress;
    var pct = Math.round(p.pct * 100);
    var seasonal = !!a.seasonal;
    return '<article class="rt-award' + (seasonal ? ' is-seasonal' : '') +
      '" data-award="' + esc(a.id) + '">' +
      '<div class="rt-award__top">' +
        '<span class="rt-award__chip" aria-hidden="true"></span>' +
        '<span class="rt-award__eye">' + (seasonal ? 'Seasonal' : 'Up next') + '</span>' +
      '</div>' +
      '<h3 class="rt-award__name">' + esc(a.name) + '</h3>' +
      '<p class="rt-award__desc">' + esc(a.desc) + '</p>' +
      '<div class="rt-award__bar" aria-hidden="true"><i style="width:' + pct + '%"></i></div>' +
      '<div class="rt-award__foot">' +
        '<span class="mono">' + Math.min(p.have, p.need) + ' / ' + p.need + '</span>' +
        '<span class="rt-award__reward">+' + a.reward + ' ' + (I.gem || '💎') + '</span>' +
      '</div>' +
    '</article>';
  }

  /* LEA-99: Coming-up / wallet rail removed from Journey UI. Helpers kept
     for progress APIs / tests; not mounted in renderPath. */
  function awardsColumnHtml() {
    return '';
  }

  /* Left column: compact XP + gems panel. XP bar = economy.xp / xpToNext
     (same as HUD). Gems = economy.diamonds. Journey line = roadtrip earned. */
  function xpGemsChartHtml() {
    var eco = W.state.economy || { xp: 0, level: 1, diamonds: 0 };
    var prog = W.levelProgress ? W.levelProgress() : { have: eco.xp || 0, need: 80 };
    var need = Math.max(1, prog.need || 1);
    var have = Math.max(0, prog.have || 0);
    var pct = Math.min(100, Math.round((have / need) * 100));
    var r = rtState();
    var gems = Number(eco.diamonds) || 0;
    return '<aside class="rt-xpchart" aria-label="XP and gems">' +
      '<div class="rt-xpchart__kicker">Journey</div>' +
      '<div class="rt-xpchart__level mono">Lv ' + (eco.level || 1) + '</div>' +
      '<div class="rt-xpchart__bar" title="XP toward next level">' +
        '<i style="width:' + pct + '%"></i>' +
      '</div>' +
      '<div class="rt-xpchart__meta mono">' + have.toLocaleString() + ' / ' +
        need.toLocaleString() + ' XP</div>' +
      '<div class="rt-xpchart__gems">' +
        '<span class="rt-xpchart__gemic">' + (I.gem || '') + '</span>' +
        '<div class="rt-xpchart__gemtxt">' +
          '<b class="mono">' + gems.toLocaleString() + '</b>' +
          '<span>gems</span>' +
        '</div>' +
      '</div>' +
      '<div class="rt-xpchart__trip mono" title="Awarded from Journey lessons">' +
        '+' + (r.xpEarned || 0) + ' XP · +' + (r.gemsEarned || 0) + ' gems' +
      '</div>' +
    '</aside>';
  }

  /* ============================== path UI ============================ */
  function renderPath() {
    var el = host();
    if (!el) return;
    run = null;
    var unit = currentUnit();
    var nodes = buildPath(unit);
    var slide = pendingSlide;
    pendingSlide = null;
    var pulseId = pendingPulse;
    pendingPulse = null;
    var unlockId = pendingUnlock;
    pendingUnlock = null;
    var shareSnap = viewingShare;
    var still = reduceMotion();
    var slideCls = '';
    if (slide && !still) {
      slideCls = slide.dir > 0 ? ' is-enter-right' : ' is-enter-left';
    }

    /* LEA-99: two columns — compact XP left, dominant path/banner center.
       Coming-up / wallet rail removed. LEA-96 stage for unit slides. */
    el.innerHTML =
      '<div class="rtpath rtpath--shell' + slideCls + '" id="rt-shell">' +
        xpGemsChartHtml() +
        '<div class="rtpath__main">' +
          unitBanner(unit) +
          globeHtml(unit) +
          '<div class="rtpath__stage">' +
            '<div class="rtpath__road" id="rt-road">' +
              '<div class="rtpath__trail" id="rt-trail">' +
                nodes.map(function (n, i) {
                  return pathNodeHtml(unit, n, i, {
                    pulse: pulseId === n.id,
                    unlock: unlockId === n.id
                  });
                }).join('') +
              '</div>' +
            '</div>' +
          '</div>' +
          '<p class="rtpath__foot">Past study seeds this path — lessons you already know light up gold. ' +
            'Share your journey with friends. Games stays in the nav.</p>' +
        '</div>' +
      '</div>' +
      (shareSnap ? sharePreviewHtml(shareSnap) : '');

    wirePath(el, unit, nodes);
    wireGlobe(el, unit);
    if (shareSnap) {
      var dismiss = W.$('#rt-share-dismiss', el);
      if (dismiss) dismiss.addEventListener('click', function () {
        viewingShare = null;
        var panel = W.$('#rt-share-view', el);
        if (panel) panel.remove();
      });
    }
    playPathEnter(el, still);
  }

  function playPathEnter(el, still) {
    var shell = W.$('#rt-shell', el);
    if (!shell) return;
    if (still) {
      shell.classList.remove('is-enter-left', 'is-enter-right');
      return;
    }
    /* Kick CSS enter → settle on next frame for a crisp slide. */
    global.requestAnimationFrame(function () {
      if (!shell.isConnected) return;
      shell.classList.add('is-settle');
      global.setTimeout(function () {
        if (!shell.isConnected) return;
        shell.classList.remove('is-enter-left', 'is-enter-right', 'is-settle');
      }, SLIDE_MS + 40);
    });
    /* Animate XP bar fill from 0 → target width. */
    var bar = W.$('.rt-xpchart__bar i', el);
    if (bar) {
      var w = bar.style.width || '0%';
      bar.style.width = '0%';
      global.requestAnimationFrame(function () {
        if (!bar.isConnected) return;
        bar.style.transition = 'width ' + SLIDE_MS + 'ms ' + SLIDE_EASE;
        bar.style.width = w;
      });
    }
  }

  function unitBanner(unit) {
    var idx = UNITS.indexOf(unit);
    return '<div class="rtpath__banner" style="--rt-accent:' + esc(unit.accent) + '">' +
      '<div class="rtpath__banner-main">' +
        '<div class="rtpath__banner-kicker">Unit ' + unit.n + ' · ' + esc(unit.region) + '</div>' +
        '<h1>' + esc(unit.title) + '</h1>' +
        '<p>' + esc(unit.blurb) + '</p>' +
      '</div>' +
      '<div class="rtpath__banner-acts">' +
        '<button type="button" class="rtpath__guide" id="rt-share" title="Share your journey">' +
          (I.users || I.inbox || '') + ' Share journey</button>' +
        '<button type="button" class="rtpath__guide" id="rt-guide">' +
          (I.book || '') + ' Guidebook</button>' +
        '<div class="rtpath__switch">' +
          '<button type="button" class="rtpath__navbtn" id="rt-prev" ' +
            (idx <= 0 ? 'disabled' : '') + ' aria-label="Previous unit">' + (I.arrowL || '') + '</button>' +
          '<button type="button" class="rtpath__navbtn" id="rt-units" title="Switch unit">' +
            (I.layers || I.grid || '') + '</button>' +
          '<button type="button" class="rtpath__navbtn" id="rt-next" ' +
            (idx >= UNITS.length - 1 ? 'disabled' : '') + ' aria-label="Next unit">' + (I.arrowR || '') + '</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function pathNodeHtml(unit, n, i, flags) {
    flags = flags || {};
    var cls = 'rtnode rtnode--' + n.kind + ' is-' + n.state;
    if (flags.pulse) cls += ' is-pulse';
    if (flags.unlock) cls += ' is-unlock';
    var label = '';
    if (n.state === 'current' && (n.kind === 'lesson' || n.kind === 'trophy')) {
      label = '<span class="rtnode__tip">START</span>';
    } else if (n.state === 'current' && n.kind === 'chest') {
      label = '<span class="rtnode__tip">OPEN</span>';
    } else if (n.state === 'current' && n.kind === 'story') {
      label = '<span class="rtnode__tip">READ</span>';
    }

    var icon = I.lock || '';
    if (n.kind === 'lesson') {
      icon = n.state === 'done' ? (I.check || '') : (n.state === 'locked' ? (I.lock || '') : (I.star || I.car || ''));
    } else if (n.kind === 'chest') {
      icon = n.state === 'done' ? (I.check || '') : (n.state === 'locked' ? (I.lock || '') : (I.chest || I.gem || ''));
    } else if (n.kind === 'story') {
      icon = n.state === 'done' ? (I.check || '') : (n.state === 'locked' ? (I.lock || '') : (I.book || ''));
    } else if (n.kind === 'trophy') {
      icon = n.state === 'done' ? (I.check || '') : (n.state === 'locked' ? (I.lock || '') : (I.trophy || ''));
    }

    var sub = n.title || '';
    if (n.kind === 'lesson') {
      var ks = lessonCountriesKnown(n.countries);
      sub = n.title + ' · ' + ks.known + '/' + ks.total + ' known';
    }

    return '<div class="rtnode__row" style="--zig:' + n.zig + ';--rt-i:' + i + '">' +
      '<div class="' + cls + '" data-node="' + esc(n.id) + '" data-kind="' + esc(n.kind) + '" data-state="' + esc(n.state) + '">' +
        label +
        '<button type="button" class="rtnode__btn" ' + (n.state === 'locked' ? 'disabled' : '') + '>' +
          '<span class="rtnode__ic">' + icon + '</span>' +
        '</button>' +
        '<div class="rtnode__label">' + esc(sub) + '</div>' +
      '</div>' +
    '</div>';
  }

  function wirePath(el, unit, nodes) {
    var guide = W.$('#rt-guide', el);
    if (guide) guide.addEventListener('click', function () { openGuide(unit); });
    var shareBtn = W.$('#rt-share', el);
    if (shareBtn) shareBtn.addEventListener('click', openShareRoad);
    W.$('#rt-prev', el).addEventListener('click', function () { shiftUnit(-1); });
    W.$('#rt-next', el).addEventListener('click', function () { shiftUnit(1); });
    W.$('#rt-units', el).addEventListener('click', function () { openUnitPicker(); });

    W.$$('[data-node]', el).forEach(function (nodeEl) {
      var btn = nodeEl.querySelector('.rtnode__btn');
      if (!btn || btn.disabled) return;
      btn.addEventListener('click', function () {
        var id = nodeEl.getAttribute('data-node');
        var kind = nodeEl.getAttribute('data-kind');
        var state = nodeEl.getAttribute('data-state');
        if (state === 'locked') return;
        if (kind === 'lesson' || kind === 'trophy') startLesson(unit, id, kind);
        else if (kind === 'chest') openChest(unit);
        else if (kind === 'story') openStory(unit);
      });
    });
  }

  /* LEA-102 — pan/zoom Journey globe. GPU-friendly CSS transforms only. */
  function wireGlobe(root, unit) {
    if (globeCtl && globeCtl.destroy) globeCtl.destroy();
    globeCtl = null;

    var frame = W.$('#rt-globe-frame', root);
    var stage = W.$('#rt-globe-stage', root);
    var mapHost = W.$('#rt-globe-map', root);
    if (!frame || !stage || !mapHost || !global.WorldMap) return;

    var countries = unitCountries(unit);
    var paintOpts = {
      mode: 'journey',
      countries: countries,
      softRegions: unitSoftRegions(unit),
      label: unit.title + ' on the world map'
    };

    var still = reduceMotion();
    var tx = 0, ty = 0, scale = 1;
    var dragging = false;
    var moved = false;
    var lastX = 0, lastY = 0;
    var pid = null;
    var anim = null;
    var destroyed = false;

    function apply(animated) {
      if (destroyed || !stage.isConnected) return;
      var useMotion = animated && !still;
      stage.style.transition = useMotion
        ? 'transform ' + SLIDE_MS + 'ms ' + SLIDE_EASE
        : 'none';
      stage.style.transform = 'translate3d(' + tx + 'px,' + ty + 'px,0) scale(' + scale + ')';
    }

    function clampScale(s) {
      return Math.max(GLOBE_MIN, Math.min(GLOBE_MAX, s));
    }

    function zoomAt(clientX, clientY, nextScale, animated) {
      var rect = frame.getBoundingClientRect();
      var px = clientX - rect.left;
      var py = clientY - rect.top;
      var wx = (px - tx) / scale;
      var wy = (py - ty) / scale;
      scale = clampScale(nextScale);
      tx = px - wx * scale;
      ty = py - wy * scale;
      apply(!!animated);
    }

    function frameUnit(animated) {
      var bounds = unitMapBounds(unit);
      var WM = global.WorldMap;
      var fw = frame.clientWidth || 1;
      var fh = frame.clientHeight || 1;
      if (!bounds || !WM) {
        scale = 1; tx = 0; ty = 0; apply(false);
        return;
      }
      /* Stage is laid out at WorldMap aspect filling frame width. */
      var baseW = fw;
      var baseH = baseW * (WM.size.h / WM.size.w);
      var sx = fw / (bounds.w * (baseW / WM.size.w));
      var sy = fh / (bounds.h * (baseH / WM.size.h));
      scale = clampScale(Math.min(sx, sy) * 0.92);
      var cx = (bounds.x + bounds.w / 2) * (baseW / WM.size.w);
      var cy = (bounds.y + bounds.h / 2) * (baseH / WM.size.h);
      tx = fw / 2 - cx * scale;
      ty = fh / 2 - cy * scale;
      apply(!!animated && !still);
    }

    function paintAndFrame(animated) {
      global.WorldMap.paint(mapHost, paintOpts);
      /* Layout then frame — rAF so clientWidth is real. */
      global.requestAnimationFrame(function () {
        if (destroyed || !frame.isConnected) return;
        frameUnit(animated);
      });
    }

    paintAndFrame(false);
    if (!global.WorldMap.ready && global.WorldMap.load) {
      global.WorldMap.load().then(function () {
        if (destroyed || !mapHost.isConnected) return;
        paintAndFrame(false);
      });
    }

    function onPointerDown(e) {
      if (e.button != null && e.button !== 0) return;
      dragging = true;
      moved = false;
      pid = e.pointerId;
      lastX = e.clientX;
      lastY = e.clientY;
      try { frame.setPointerCapture(pid); } catch (err) {}
      frame.classList.add('is-dragging');
      stage.style.transition = 'none';
    }
    function onPointerMove(e) {
      if (!dragging || (pid != null && e.pointerId !== pid)) return;
      var dx = e.clientX - lastX;
      var dy = e.clientY - lastY;
      if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
      lastX = e.clientX;
      lastY = e.clientY;
      tx += dx;
      ty += dy;
      apply(false);
    }
    function onPointerUp(e) {
      if (pid != null && e.pointerId !== pid) return;
      dragging = false;
      pid = null;
      frame.classList.remove('is-dragging');
    }
    function onWheel(e) {
      e.preventDefault();
      var factor = e.deltaY > 0 ? 0.9 : 1.12;
      zoomAt(e.clientX, e.clientY, scale * factor, false);
    }
    function onDblClick(e) {
      if (moved) return;
      zoomAt(e.clientX, e.clientY, scale * 1.45, !still);
    }

    frame.addEventListener('pointerdown', onPointerDown);
    frame.addEventListener('pointermove', onPointerMove);
    frame.addEventListener('pointerup', onPointerUp);
    frame.addEventListener('pointercancel', onPointerUp);
    frame.addEventListener('wheel', onWheel, { passive: false });
    frame.addEventListener('dblclick', onDblClick);

    var btnIn = W.$('#rt-globe-in', root);
    var btnOut = W.$('#rt-globe-out', root);
    var btnReset = W.$('#rt-globe-reset', root);
    if (btnIn) btnIn.addEventListener('click', function () {
      var r = frame.getBoundingClientRect();
      zoomAt(r.left + r.width / 2, r.top + r.height / 2, scale * 1.28, !still);
    });
    if (btnOut) btnOut.addEventListener('click', function () {
      var r = frame.getBoundingClientRect();
      zoomAt(r.left + r.width / 2, r.top + r.height / 2, scale / 1.28, !still);
    });
    if (btnReset) btnReset.addEventListener('click', function () {
      frameUnit(true);
    });

    globeCtl = {
      destroy: function () {
        destroyed = true;
        if (anim) { global.cancelAnimationFrame(anim); anim = null; }
        frame.removeEventListener('pointerdown', onPointerDown);
        frame.removeEventListener('pointermove', onPointerMove);
        frame.removeEventListener('pointerup', onPointerUp);
        frame.removeEventListener('pointercancel', onPointerUp);
        frame.removeEventListener('wheel', onWheel);
        frame.removeEventListener('dblclick', onDblClick);
      },
      frameUnit: frameUnit
    };
  }

  /* Horizontal unit slide: exit current shell, then enter from the
     direction you navigated. Feels like “one more unit” dopamine. */
  function slideToUnit(nextId, dir) {
    var el = host();
    var shell = el && W.$('#rt-shell', el);
    var still = reduceMotion();
    rtState().unitId = nextId;
    W.save();
    pendingSlide = { dir: dir };

    if (still || !shell) {
      renderPath();
      return;
    }

    shell.classList.remove('is-enter-left', 'is-enter-right', 'is-settle');
    shell.classList.add(dir > 0 ? 'is-exit-left' : 'is-exit-right');
    global.setTimeout(function () {
      renderPath();
    }, Math.round(SLIDE_MS * 0.55));
  }

  function shiftUnit(dir) {
    var cur = currentUnit();
    var i = UNITS.indexOf(cur) + dir;
    if (i < 0 || i >= UNITS.length) return;
    slideToUnit(UNITS[i].id, dir);
  }

  function openUnitPicker() {
    if (!global.UI || !global.UI.modal) return;
    var cur = rtState().unitId;
    var curIdx = UNITS.indexOf(unitById(cur));
    global.UI.modal({
      title: 'Switch unit',
      icon: I.layers || I.car,
      body: '<div class="rtpick">' + UNITS.map(function (u) {
        var doneN = u.lessons.filter(function (l) { return isDone(u.id, l.id); }).length;
        return '<button type="button" class="rtpick__row' + (u.id === cur ? ' is-on' : '') + '" data-unit="' + esc(u.id) + '">' +
          '<span class="rtpick__n mono">U' + u.n + '</span>' +
          '<span class="rtpick__t"><b>' + esc(u.title) + '</b>' +
            '<i>' + esc(u.blurb) + '</i></span>' +
          '<span class="rtpick__m mono">' + doneN + '/' + u.lessons.length + '</span>' +
        '</button>';
      }).join('') + '</div>',
      actions: [{ label: 'Close', cls: 'btn--ghost', close: true }],
      onMount: function (m, close) {
        W.$$('[data-unit]', m).forEach(function (b) {
          b.addEventListener('click', function () {
            var id = b.getAttribute('data-unit');
            var nextIdx = UNITS.indexOf(unitById(id));
            var dir = nextIdx >= curIdx ? 1 : -1;
            close();
            if (id === cur) return;
            slideToUnit(id, dir || 1);
          });
        });
      }
    });
  }

  function openGuide(unit) {
    if (!global.UI || !global.UI.modal) return;
    var rows = unitCountries(unit).map(function (name) {
      var box = masteryBox(name);
      var cls = box >= 4 ? 'is-mastered' : box >= SEED_BOX ? 'is-known' : 'is-new';
      return '<li class="' + cls + '"><b>' + esc(name) + '</b>' +
        '<span class="mono">box ' + box + '</span></li>';
    }).join('');
    global.UI.modal({
      title: 'Guidebook · ' + unit.title,
      icon: I.book,
      wide: true,
      body: '<p class="t-sm t-muted" style="margin:0 0 12px">' + esc(unit.blurb) +
        ' Countries with mastery box ≥ ' + SEED_BOX + ' seed lesson completion.</p>' +
        '<ul class="rtguide">' + rows + '</ul>',
      actions: [{ label: 'Close', cls: 'btn--ghost', close: true }]
    });
  }

  /* ======================== LEA-105 chest open ====================== */
  function rarityById(id) {
    for (var i = 0; i < CHEST_RARITIES.length; i++) {
      if (CHEST_RARITIES[i].id === id) return CHEST_RARITIES[i];
    }
    return CHEST_RARITIES[0];
  }

  function rand01(rng) {
    if (typeof rng === 'function') return rng();
    return Math.random();
  }

  function randInt(min, max, rng) {
    var a = Math.floor(min);
    var b = Math.floor(max);
    if (b < a) { var t = a; a = b; b = t; }
    return a + Math.floor(rand01(rng) * (b - a + 1));
  }

  /* Independent cascade: common → rare → epic → legendary. */
  function rollChestRarity(rng) {
    var path = ['common'];
    var cur = 'common';
    while (CHEST_UPGRADE_CHANCE[cur] != null) {
      if (rand01(rng) >= CHEST_UPGRADE_CHANCE[cur]) break;
      if (cur === 'common') cur = 'rare';
      else if (cur === 'rare') cur = 'epic';
      else if (cur === 'epic') cur = 'legendary';
      else break;
      path.push(cur);
    }
    return { rarity: cur, path: path };
  }

  function ownedList(kind) {
    if (!W.state.owned) W.state.owned = {};
    if (!W.state.owned[kind]) W.state.owned[kind] = [];
    return W.state.owned[kind];
  }

  function grantOwnedCosmetic(kind, id) {
    var have = ownedList(kind);
    if (have.indexOf(id) !== -1) return false;
    have.push(id);
    return true;
  }

  /* Shop cosmetics eligible for route-chest drops: buyable, non-premium,
     non-secret, non-staff — never grants earn-locked badges. */
  function chestCosmeticPool(kind, maxPrice) {
    var Cos = global.Cosmetics;
    if (!Cos || !Cos[kind]) return [];
    var have = ownedList(kind);
    return Cos[kind].filter(function (it) {
      if (!it || !it.id || it.id === 'none' || it.id === 'plain') return false;
      if (it.earn || it.premium || it.staff || it.secret) return false;
      if (typeof it.price !== 'number' || it.price <= 0) return false;
      if (maxPrice != null && it.price > maxPrice) return false;
      return have.indexOf(it.id) === -1;
    });
  }

  function pickCosmeticLoot(rarity, rng) {
    var kind = 'nameplates';
    var maxPrice = 450;
    if (rarity === 'epic') { kind = rand01(rng) < 0.5 ? 'decorations' : 'banners'; maxPrice = 900; }
    if (rarity === 'legendary') {
      kind = rand01(rng) < 0.55 ? 'effects' : (rand01(rng) < 0.5 ? 'decorations' : 'banners');
      maxPrice = 1600;
    }
    if (rarity === 'rare') { kind = rand01(rng) < 0.55 ? 'nameplates' : 'banners'; maxPrice = 700; }
    var pool = chestCosmeticPool(kind, maxPrice);
    if (!pool.length && kind !== 'nameplates') pool = chestCosmeticPool('nameplates', maxPrice);
    if (!pool.length) return null;
    var item = pool[Math.floor(rand01(rng) * pool.length)];
    return { kind: kind, id: item.id, name: item.name, price: item.price };
  }

  function grantEconomyXp(amount) {
    var n = Math.max(0, Math.floor(amount || 0));
    if (!n) return { xp: 0, level: false };
    W.state.economy.xp += n;
    var leveled = false;
    while (W.state.economy.xp >= W.xpToNext(W.state.economy.level)) {
      W.state.economy.xp -= W.xpToNext(W.state.economy.level);
      W.state.economy.level += 1;
      leveled = W.state.economy.level;
    }
    return { xp: n, level: leveled };
  }

  /* Journey progress boost: nudge mastery boxes on this unit's countries. */
  function applyJourneyBoost(unit, bumps, rng) {
    bumps = bumps || 2;
    var names = W.shuffle(unitCountries(unit).slice());
    if (!names.length) return { bumps: 0, countries: [] };
    var hit = [];
    var i;
    for (i = 0; i < names.length && hit.length < bumps; i++) {
      var name = names[i];
      var m = W.state.mastery[name] || { c: 0, w: 0, box: 0 };
      if (m.box >= 5) continue;
      m.box = Math.min(5, (m.box || 0) + 1);
      m.c = (m.c || 0) + 1;
      W.state.mastery[name] = m;
      hit.push(name);
    }
    return { bumps: hit.length, countries: hit };
  }

  /* Build loot lines for a final rarity. Always includes gems + XP;
     higher tiers add boost and/or cosmetic. */
  function buildChestLoot(rarity, unit, rng) {
    var gems = 40;
    var xp = 30;
    var boost = 0;
    var cosmeticChance = 0;
    if (rarity === 'common') {
      gems = randInt(35, 50, rng);
      xp = randInt(20, 40, rng);
      cosmeticChance = 0.08;
    } else if (rarity === 'rare') {
      gems = randInt(55, 85, rng);
      xp = randInt(45, 75, rng);
      boost = 2;
      cosmeticChance = 0.35;
    } else if (rarity === 'epic') {
      gems = randInt(95, 140, rng);
      xp = randInt(85, 130, rng);
      boost = 3;
      cosmeticChance = 0.72;
    } else {
      gems = randInt(160, 240, rng);
      xp = randInt(140, 220, rng);
      boost = 4;
      cosmeticChance = 0.92;
    }

    var rewards = [
      { type: 'gems', amount: gems, label: '+' + gems + ' diamonds', icon: 'gem' },
      { type: 'xp', amount: xp, label: '+' + xp + ' XP', icon: 'star' }
    ];

    if (boost > 0) {
      rewards.push({
        type: 'boost',
        amount: boost,
        label: 'Journey boost ×' + boost,
        detail: 'Mastery nudge on this route',
        icon: 'globe'
      });
    }

    if (rand01(rng) < cosmeticChance) {
      var cos = pickCosmeticLoot(rarity, rng);
      if (cos) {
        rewards.push({
          type: 'cosmetic',
          kind: cos.kind,
          id: cos.id,
          name: cos.name,
          label: cos.name,
          detail: 'Profile ' + cos.kind.replace(/s$/, ''),
          icon: 'sparkle'
        });
      } else {
        /* Pool empty — juice the gem pile instead. */
        var bonus = rarity === 'legendary' ? 40 : (rarity === 'epic' ? 25 : 12);
        rewards[0].amount += bonus;
        rewards[0].label = '+' + rewards[0].amount + ' diamonds';
      }
    }

    return { rarity: rarity, rewards: rewards };
  }

  function applyChestLoot(loot, unit, rng) {
    var out = { gems: 0, xp: 0, level: false, boost: null, cosmetics: [], rewards: [] };
    (loot.rewards || []).forEach(function (r) {
      if (r.type === 'gems') {
        W.state.economy.diamonds += r.amount;
        rtState().gemsEarned = (rtState().gemsEarned || 0) + r.amount;
        out.gems += r.amount;
        out.rewards.push(r);
      } else if (r.type === 'xp') {
        var g = grantEconomyXp(r.amount);
        rtState().xpEarned = (rtState().xpEarned || 0) + g.xp;
        out.xp += g.xp;
        if (g.level) out.level = g.level;
        out.rewards.push(r);
      } else if (r.type === 'boost') {
        out.boost = applyJourneyBoost(unit, r.amount, rng);
        out.rewards.push(r);
      } else if (r.type === 'cosmetic') {
        if (grantOwnedCosmetic(r.kind, r.id)) {
          out.cosmetics.push(r);
          out.rewards.push(r);
        } else {
          var fallback = rarityById(loot.rarity).id === 'legendary' ? 35 : 18;
          W.state.economy.diamonds += fallback;
          rtState().gemsEarned = (rtState().gemsEarned || 0) + fallback;
          out.gems += fallback;
          out.rewards.push({
            type: 'gems', amount: fallback,
            label: '+' + fallback + ' diamonds', icon: 'gem'
          });
        }
      }
    });
    return out;
  }

  function closeChestOverlay() {
    var ov = document.querySelector('.rt-chest-overlay');
    if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
    document.body.classList.remove('no-scroll');
    chestBusy = false;
  }

  function rewardIcon(key) {
    if (key === 'gem') return I.gem || '💎';
    if (key === 'star') return I.star || '★';
    if (key === 'globe') return I.globe || '◎';
    if (key === 'sparkle') return I.sparkle || I.star || '✦';
    return I.chest || I.gem || '';
  }

  function openChest(unit) {
    var key = nodeKey(unit.id, 'chest');
    if (rtState().claimed[key]) {
      W.toast('Already claimed', 'This Journey chest is empty.', I.chest || I.gem, 2600);
      return;
    }
    if (chestBusy) return;
    showChestOverlay(unit);
  }

  function showChestOverlay(unit) {
    closeChestOverlay();
    chestBusy = true;
    document.body.classList.add('no-scroll');

    var still = reduceMotion();
    var ov = W.el('div', 'rt-chest-overlay' + (still ? ' is-reduced' : ''));
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-label', 'Journey chest');
    ov.innerHTML =
      '<div class="rt-chest" data-chest-stage="idle" data-rarity="common">' +
        '<div class="rt-chest__glow" aria-hidden="true"></div>' +
        '<div class="rt-chest__particles" aria-hidden="true"></div>' +
        '<button type="button" class="rt-chest__box" aria-label="Open Journey chest">' +
          '<span class="rt-chest__lid"></span>' +
          '<span class="rt-chest__body"></span>' +
          '<span class="rt-chest__band"></span>' +
          '<span class="rt-chest__lock"></span>' +
          '<span class="rt-chest__burst"></span>' +
        '</button>' +
        '<p class="rt-chest__rarity" hidden></p>' +
        '<p class="rt-chest__status">Tap the chest to open</p>' +
        '<div class="rt-chest__rewards" hidden></div>' +
        '<div class="rt-chest__actions" hidden>' +
          '<button type="button" class="btn btn--accent" data-rt-chest-collect>Collect</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);

    var stageEl = ov.querySelector('[data-chest-stage]');
    var statusEl = ov.querySelector('.rt-chest__status');
    var rarityEl = ov.querySelector('.rt-chest__rarity');
    var rewardsEl = ov.querySelector('.rt-chest__rewards');
    var actionsEl = ov.querySelector('.rt-chest__actions');
    var boxBtn = ov.querySelector('.rt-chest__box');
    var opened = false;
    var timers = [];

    function later(fn, ms) {
      if (still) { fn(); return null; }
      var id = setTimeout(fn, ms);
      timers.push(id);
      return id;
    }

    function clearTimers() {
      timers.forEach(function (id) { clearTimeout(id); });
      timers = [];
    }

    function setStage(name, status) {
      stageEl.setAttribute('data-chest-stage', name);
      if (status) statusEl.textContent = status;
    }

    function setRarityVisual(id) {
      var meta = rarityById(id);
      stageEl.setAttribute('data-rarity', meta.id);
      rarityEl.hidden = false;
      rarityEl.textContent = meta.label;
      rarityEl.style.color = meta.hue;
      stageEl.style.setProperty('--rt-chest-glow', meta.glow);
      stageEl.style.setProperty('--rt-chest-hue', meta.hue);
    }

    function finishAndClose() {
      clearTimers();
      closeChestOverlay();
      pendingPulse = 'chest';
      var path = buildPath(unit);
      var nxt = path.find(function (n) { return n.state === 'current' && n.id !== 'chest'; });
      if (nxt) pendingUnlock = nxt.id;
      renderPath();
    }

    function revealRewards(loot, applied) {
      setStage('open', loot.rarity === 'legendary'
        ? 'Legendary haul!'
        : (loot.rarity === 'epic' ? 'Epic pull!' : 'Chest opened!'));
      rewardsEl.hidden = false;
      rewardsEl.innerHTML = (applied.rewards || []).map(function (r, i) {
        return '<div class="rt-chest__prize" style="--rt-ri:' + i + '">' +
          '<span class="rt-chest__prize-ic" aria-hidden="true">' + rewardIcon(r.icon) + '</span>' +
          '<span class="rt-chest__prize-label">' + esc(r.label) + '</span>' +
          (r.detail ? '<span class="rt-chest__prize-detail">' + esc(r.detail) + '</span>' : '') +
        '</div>';
      }).join('');
      actionsEl.hidden = false;

      if (W.state.settings && W.state.settings.effects !== false && !still) {
        if (W.confetti) {
          W.confetti({
            count: loot.rarity === 'legendary' ? 90 : (loot.rarity === 'epic' ? 64 : 42),
            power: loot.rarity === 'legendary' ? 280 : 200,
            y: window.innerHeight * 0.42
          });
        }
      }
      if (applied.level && W.Sound && W.Sound.levelUp) W.Sound.levelUp();
      else if (W.Sound && W.Sound.gem) W.Sound.gem();

      var collect = ov.querySelector('[data-rt-chest-collect]');
      if (collect) collect.addEventListener('click', finishAndClose);
    }

    function runOpenSequence() {
      if (opened) return;
      opened = true;
      boxBtn.disabled = true;

      var key = nodeKey(unit.id, 'chest');
      if (rtState().claimed[key]) {
        closeChestOverlay();
        W.toast('Already claimed', 'This Journey chest is empty.', I.chest || I.gem, 2600);
        return;
      }

      var roll = rollChestRarity();
      var loot = buildChestLoot(roll.rarity, unit);
      /* Claim + grant before reveal so a mid-animation refresh cannot
         double-pay. Overlay stays up until Collect. */
      rtState().claimed[key] = true;
      var applied = applyChestLoot(loot, unit);
      W.save();
      if (global.UI && global.UI.refreshHud) global.UI.refreshHud();

      if (still) {
        setRarityVisual(roll.rarity);
        revealRewards(loot, applied);
        return;
      }

      setStage('shake', 'Something\'s rattling…');
      if (W.Sound && W.Sound.flip) W.Sound.flip();

      var upgradeIdx = 0;
      function playUpgradeStep() {
        if (upgradeIdx >= roll.path.length) {
          later(function () {
            setStage('crack', 'Almost!');
            if (W.Sound && W.Sound.gem) W.Sound.gem();
          }, 280);
          later(function () { revealRewards(loot, applied); }, 720);
          return;
        }
        var id = roll.path[upgradeIdx];
        setRarityVisual(id);
        if (upgradeIdx > 0) {
          setStage('upgrade', rarityById(id).label + '!');
          stageEl.classList.remove('is-upgrade-flash');
          /* reflow so the flash can replay */
          void stageEl.offsetWidth;
          stageEl.classList.add('is-upgrade-flash');
          if (W.Sound && W.Sound.levelUp) W.Sound.levelUp();
          else if (W.Sound && W.Sound.gem) W.Sound.gem();
        } else {
          setStage('shake', rarityById(id).label);
        }
        upgradeIdx += 1;
        later(playUpgradeStep, upgradeIdx === 1 ? 520 : 640);
      }
      later(playUpgradeStep, 360);
    }

    boxBtn.addEventListener('click', runOpenSequence);
    ov.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && stageEl.getAttribute('data-chest-stage') === 'open') {
        finishAndClose();
      }
    });
  }

  function openStory(unit) {
    if (!global.UI || !global.UI.modal) return;
    var key = nodeKey(unit.id, 'story');
    global.UI.modal({
      title: unit.story.title,
      icon: I.book,
      body: '<p style="margin:0;line-height:1.5">' + esc(unit.story.body) + '</p>' +
        '<p class="t-sm t-muted" style="margin:14px 0 0">A LearnGeo roadside note — not a Duolingo story owl.</p>',
      actions: [{
        label: 'Got it', cls: 'btn--accent', close: true,
        onClick: function () {
          rtState().read[key] = true;
          W.save();
          pendingPulse = 'story';
          var path = buildPath(unit);
          var nxt = path.find(function (n) { return n.state === 'current' && n.id !== 'story'; });
          if (nxt) pendingUnlock = nxt.id;
          renderPath();
        }
      }]
    });
  }

  /* ============================ lessons ============================== */
  function findLesson(unit, id) {
    for (var i = 0; i < unit.lessons.length; i++) if (unit.lessons[i].id === id) return unit.lessons[i];
    return null;
  }

  function startLesson(unit, id, kind) {
    var countries, title, count, nodeId;
    if (kind === 'trophy') {
      countries = unitCountries(unit);
      title = unit.title + ' · Trophy';
      count = Math.min(12, Math.max(8, countries.length));
      nodeId = 'trophy';
    } else {
      var les = findLesson(unit, id);
      if (!les) return;
      countries = les.countries.slice();
      title = les.title;
      count = Math.min(8, Math.max(5, countries.length + 2));
      nodeId = les.id;
    }
    if (!global.Quiz) return;
    /* identify is intentional: shaded-country MC needs the map host below.
       flag/flagpick can also fall back to identify via Quiz.fitType. */
    var qs = global.Quiz.generate({
      countries: countries,
      types: ['capital', 'country', 'identify', 'flag', 'flagpick'],
      count: count,
      typed: false,
      weakFirst: true
    });
    if (!qs.length) {
      W.toast('Empty lesson', 'No questions for that stop.', I.info, 2800);
      return;
    }
    if (global.GeoMap && global.GeoMap.loadShapes) global.GeoMap.loadShapes();
    run = {
      phase: 'running',
      unitId: unit.id,
      nodeId: nodeId,
      title: title,
      qs: qs,
      i: 0,
      right: qs.map(function () { return false; }),
      answered: false
    };
    renderQuestion();
  }

  /* Map panel is required when the prompt refers to a shaded / clickable
     country. Other types stay text+MC only so the card does not grow empty. */
  function needsMap(q) {
    return !!(q && (q.type === 'identify' || q.type === 'locate' || q.revealOnMap));
  }

  function paintMap(q, reveal) {
    var mapHost = document.getElementById('map-roadtrip');
    if (!mapHost || !global.GeoMap || !q) return;
    var paint = function () {
      if (!mapHost.isConnected) return;
      if (!global.GeoMap.ensure(mapHost)) return;
      global.GeoMap.clear();
      if (q.type === 'locate' && q.mapChoices && q.mapChoices.length) {
        q.mapChoices.forEach(function (c) {
          var state = 'choice';
          if (reveal) {
            if (c.name === q.country.name) state = 'right';
            else state = 'dim';
          }
          global.GeoMap.drawCountry(c, state, null, reveal ? c.name : null);
        });
        global.GeoMap.fitAll(q.mapChoices, 80);
      } else {
        global.GeoMap.drawCountry(
          q.country,
          reveal ? 'right' : 'target',
          null,
          reveal ? q.country.name : null
        );
        global.GeoMap.frame(q.country, 90);
      }
      global.GeoMap.setGuard(!reveal);
    };
    if (global.GeoMap.loadShapes) {
      global.GeoMap.loadShapes().then(paint);
    } else {
      paint();
    }
  }

  function renderQuestion(opts) {
    var el = host();
    if (!el || !run) return;
    opts = opts || {};
    var q = run.qs[run.i];
    var pct = Math.round((run.i / run.qs.length) * 100);
    var still = reduceMotion();
    var slideCls = '';
    if (opts.slide && !still) {
      slideCls = opts.slide > 0 ? ' is-q-enter-right' : ' is-q-enter-left';
    }
    var mapHtml = needsMap(q)
      ? '<div class="rt-map" aria-label="Map showing the shaded country">' +
          '<div id="map-roadtrip" class="rt-map__host" role="img" ' +
            'aria-label="Shaded country on the map"></div></div>'
      : '';
    el.innerHTML =
      '<div class="rtpath rtpath--run">' +
        '<div class="rt-runbar">' +
          '<button type="button" class="btn btn--ghost btn--sm" id="rt-leave">' +
            (I.arrowL || '') + ' Path</button>' +
          '<div class="rt-runbar__title">' +
            '<b>' + esc(run.title) + '</b>' +
            '<span class="mono">Q' + (run.i + 1) + '/' + run.qs.length + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="rt-progress"><div class="rt-progress__fill" style="width:' + pct + '%"></div></div>' +
        '<div class="rt-q-stage">' +
          '<div class="rt-q' + slideCls + '" id="rt-qcard">' +
            '<div class="qmeta">' +
              '<span class="eyebrow">' + esc((global.Quiz.types[q.type] || {}).label || q.type) + '</span>' +
              '<span class="eyebrow">Journey</span>' +
            '</div>' +
            '<div class="qprompt">' + esc(q.prompt) + '</div>' +
            '<div class="qsubject">' + global.Quiz.subjectHtml(q) + '</div>' +
            mapHtml +
            '<div class="' + global.Quiz.optionsClass(q) + '" id="rt-opts"></div>' +
            '<div id="rt-fb"></div>' +
          '</div>' +
        '</div>' +
      '</div>';

    var optsEl = W.$('#rt-opts', el);
    if (optsEl && q.choices) {
      q.choices.forEach(function (c, i) {
        var b = W.el('button', 'option');
        b.dataset.i = String(i);
        b.innerHTML =
          '<span class="option__key mono">' + (i + 1) + '</span>' +
          '<span class="option__text">' + global.Quiz.choiceHtml(q, c) + '</span>' +
          '<span class="option__mark">' + (I.check || '') + '</span>';
        b.addEventListener('click', function () { pick(i); });
        optsEl.appendChild(b);
      });
    }
    if (needsMap(q)) paintMap(q, false);
    W.$('#rt-leave', el).addEventListener('click', function () {
      if (active() && !global.confirm('Leave this lesson? This run will be lost.')) return;
      abandon();
      renderPath();
    });
    var card = W.$('#rt-qcard', el);
    if (card && slideCls && !still) {
      global.requestAnimationFrame(function () {
        if (!card.isConnected) return;
        card.classList.add('is-q-settle');
        global.setTimeout(function () {
          if (card.isConnected) card.classList.remove('is-q-enter-right', 'is-q-enter-left', 'is-q-settle');
        }, SLIDE_MS + 40);
      });
    }
  }

  function pick(idx) {
    if (!run || run.phase !== 'running' || run.answered) return;
    var q = run.qs[run.i];
    var choice = q.choices && q.choices[idx];
    if (!choice) return;
    var correct = !!global.Quiz.grade(q, choice.text);
    run.answered = true;
    run.right[run.i] = correct;
    var gains = W.award(correct, { country: q.country.name, type: q.type });
    if (correct && gains) {
      var r = rtState();
      r.xpEarned = (r.xpEarned || 0) + (gains.xp || 0);
      r.gemsEarned = (r.gemsEarned || 0) + (gains.gems || 0);
    }
    if (W.checkAchievements) W.announceAchievements(W.checkAchievements());
    W.save();
    if (global.UI && global.UI.refreshHud) global.UI.refreshHud();

    var el = host();
    W.$$('.option', el).forEach(function (n, i) {
      n.disabled = true;
      var c = q.choices[i];
      if (c && c.text === q.answerText) n.classList.add('is-right');
      if (i === idx && !correct) n.classList.add('is-wrong');
    });
    if (needsMap(q)) paintMap(q, true);
    var fb = W.$('#rt-fb', el);
    if (fb) {
      var detail = correct
        ? '<p>' + esc(q.country.capital) + ' is the capital of ' + esc(q.country.name) + '.</p>'
        : '<p>The answer is <b>' + esc(q.answerText) + '</b>.</p>';
      var chips = correct
        ? '<div class="feedback__gain">' +
            '<span class="chip chip--xp mono">+' + gains.xp + ' XP</span>' +
            '<span class="chip chip--gem mono">' + W.gem(gains.gems) + '</span></div>'
        : '';
      fb.innerHTML =
        '<div class="feedback feedback--' + (correct ? 'right' : 'wrong') + '">' +
          (correct ? I.check : I.x) +
          '<div><b>' + (correct ? 'Nice one' : 'Not quite') + '</b>' + detail + chips + '</div></div>' +
        '<button type="button" class="btn btn--primary btn--block" id="rt-next" style="margin-top:14px">' +
          (run.i >= run.qs.length - 1 ? 'See results' : 'Next') + ' ' + (I.arrowR || '') + '</button>';
      W.$('#rt-next', fb).addEventListener('click', next);
    }
  }

  function next() {
    if (!run) return;
    if (run.i >= run.qs.length - 1) return finish();
    var el = host();
    var card = el && W.$('#rt-qcard', el);
    var still = reduceMotion();
    run.i += 1;
    run.answered = false;
    if (still || !card) {
      renderQuestion({ slide: 1 });
      return;
    }
    card.classList.remove('is-q-enter-right', 'is-q-enter-left', 'is-q-settle');
    card.classList.add('is-q-exit-left');
    global.setTimeout(function () {
      renderQuestion({ slide: 1 });
    }, Math.round(SLIDE_MS * 0.5));
  }

  function finish() {
    if (!run) return;
    var score = run.right.filter(Boolean).length;
    var total = run.qs.length;
    var pct = Math.round((score / total) * 100);
    /* Complete the node when they clear at least half — keeps the path moving
       without demanding perfection on a seeded review. */
    if (pct >= 50) {
      markDone(run.unitId, run.nodeId, 'played');
      pendingPulse = run.nodeId;
      var unit = unitById(run.unitId);
      var path = buildPath(unit);
      var nxt = path.find(function (n) { return n.state === 'current'; });
      if (nxt) pendingUnlock = nxt.id;
    }
    run.phase = 'done';
    run.score = score;
    run.pct = pct;
    renderDone();
  }

  function renderDone() {
    var el = host();
    if (!el || !run) return;
    var cleared = run.pct >= 50;
    var still = reduceMotion();
    el.innerHTML =
      '<div class="rtpath rtpath--done">' +
        '<div class="rt-done' + (still ? '' : ' is-pop') + '">' +
          '<div class="rt-done__badge mono">' + run.score + '<span>/' + run.qs.length + '</span></div>' +
          '<h2>' + esc(run.title) + '</h2>' +
          '<p>' + (cleared
            ? 'Stop cleared — the path moves forward.'
            : 'Under half right. Try this stop again to unlock the next one.') + '</p>' +
          '<div class="rt-done__pct mono">' + run.pct + '%</div>' +
          '<div class="rt-done__acts">' +
            '<button type="button" class="btn btn--accent" id="rt-path">Back to path</button>' +
            (!cleared ? '<button type="button" class="btn btn--ghost" id="rt-retry">Try again</button>' : '') +
            (cleared ? '<button type="button" class="btn btn--ghost" id="rt-share-done">Share journey</button>' : '') +
          '</div>' +
        '</div>' +
      '</div>';
    var unitId = run.unitId, nodeId = run.nodeId;
    var kind = nodeId === 'trophy' ? 'trophy' : 'lesson';
    W.$('#rt-path', el).addEventListener('click', function () { abandon(); renderPath(); });
    var retry = W.$('#rt-retry', el);
    if (retry) retry.addEventListener('click', function () {
      abandon();
      startLesson(unitById(unitId), nodeId, kind);
    });
    var shareDone = W.$('#rt-share-done', el);
    if (shareDone) shareDone.addEventListener('click', function () {
      abandon();
      renderPath();
      openShareRoad();
    });
  }

  global.RoadTripMode = {
    start: start,
    abandon: abandon,
    active: active,
    units: UNITS,
    seedFromMastery: seedFromMastery,
    seedLessonDone: seedLessonDone,
    buildPath: buildPath,
    achievementProgress: achievementProgress,
    upcomingAwards: upcomingAwards,
    progressSnapshot: progressSnapshot,
    encodeSharePayload: encodeSharePayload,
    decodeSharePayload: decodeSharePayload,
    shareUrlFor: shareUrlFor,
    unitCountries: unitCountries,
    unitSoftRegions: unitSoftRegions,
    unitMapBounds: unitMapBounds,
    SEED_BOX: SEED_BOX,
    SEED_RATIO: SEED_RATIO,
    SLIDE_MS: SLIDE_MS,
    /* LEA-105 — exported for unit tests / demo harness. */
    CHEST_RARITIES: CHEST_RARITIES,
    CHEST_UPGRADE_CHANCE: CHEST_UPGRADE_CHANCE,
    rollChestRarity: rollChestRarity,
    buildChestLoot: buildChestLoot,
    applyChestLoot: applyChestLoot,
    openChest: openChest
  };
})(window);
