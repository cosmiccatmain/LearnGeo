/* ------------------------------------------------------------------
   LearnGeo — Road Trips path (LEA-85).

   Duolingo-style vertical zig-zag of lessons, chests, stories and a
   unit trophy. Units start in Africa; the learner can switch units.
   Existing mastery seeds completed lessons so shipping this does not
   reset progress. LearnGeo fonts/brand only — no Duo owl. Games stays
   in the nav. No Stripe, no screen mirroring.
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
        nodes.push({ kind: 'chest', id: 'chest', title: 'Route chest', zig: ZIG[nodes.length % ZIG.length] });
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
    renderPath();
  }

  function abandon() { run = null; }

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

  function awardsColumnHtml() {
    var upcoming = upcomingAwards(4);
    var body = upcoming.length
      ? upcoming.map(awardCardHtml).join('')
      : '<p class="rt-awards__empty">All wallet awards unlocked.</p>';
    return '<aside class="rt-awards" aria-label="Upcoming wallet awards">' +
      '<div class="rt-awards__head">' +
        '<b>Coming up</b>' +
        '<span>Wallet cards you’re close to</span>' +
      '</div>' +
      '<div class="rt-awards__list">' + body + '</div>' +
    '</aside>';
  }

  /* Left column: large XP + gems panel. XP bar = economy.xp / xpToNext
     (same as HUD). Gems = economy.diamonds. Trip line = roadtrip earned. */
  function xpGemsChartHtml() {
    var eco = W.state.economy || { xp: 0, level: 1, diamonds: 0 };
    var prog = W.levelProgress ? W.levelProgress() : { have: eco.xp || 0, need: 80 };
    var need = Math.max(1, prog.need || 1);
    var have = Math.max(0, prog.have || 0);
    var pct = Math.min(100, Math.round((have / need) * 100));
    var r = rtState();
    var gems = Number(eco.diamonds) || 0;
    return '<aside class="rt-xpchart" aria-label="XP and gems">' +
      '<div class="rt-xpchart__kicker">On the road</div>' +
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
      '<div class="rt-xpchart__trip mono" title="Awarded from Road Trips lessons">' +
        'Trip +' + (r.xpEarned || 0) + ' XP · +' + (r.gemsEarned || 0) + ' gems' +
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

    /* LEA-92: three columns — big XP left, path center, big awards right. */
    el.innerHTML =
      '<div class="rtpath rtpath--shell">' +
        xpGemsChartHtml() +
        '<div class="rtpath__main">' +
          unitBanner(unit) +
          '<div class="rtpath__road">' +
            '<div class="rtpath__trail" id="rt-trail">' +
              nodes.map(function (n, i) { return pathNodeHtml(unit, n, i); }).join('') +
            '</div>' +
          '</div>' +
          '<p class="rtpath__foot">Past study seeds this path — lessons you already know light up gold. ' +
            'Right column previews wallet awards you’re close to. Games stays in the nav.</p>' +
        '</div>' +
        awardsColumnHtml() +
      '</div>';

    wirePath(el, unit, nodes);
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

  function pathNodeHtml(unit, n, i) {
    var cls = 'rtnode rtnode--' + n.kind + ' is-' + n.state;
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

    return '<div class="rtnode__row" style="--zig:' + n.zig + '">' +
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
    W.$('#rt-guide', el).addEventListener('click', function () { openGuide(unit); });
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

  function shiftUnit(dir) {
    var cur = currentUnit();
    var i = UNITS.indexOf(cur) + dir;
    if (i < 0 || i >= UNITS.length) return;
    rtState().unitId = UNITS[i].id;
    W.save();
    renderPath();
  }

  function openUnitPicker() {
    if (!global.UI || !global.UI.modal) return;
    var cur = rtState().unitId;
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
            rtState().unitId = b.getAttribute('data-unit');
            W.save();
            close();
            renderPath();
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

  function openChest(unit) {
    var key = nodeKey(unit.id, 'chest');
    if (rtState().claimed[key]) {
      W.toast('Already claimed', 'This route chest is empty.', I.chest || I.gem, 2600);
      return;
    }
    rtState().claimed[key] = true;
    W.state.economy.diamonds += 40;
    W.save();
    if (global.UI && global.UI.refreshHud) global.UI.refreshHud();
    W.toast('Route chest', '+40 diamonds for the road', I.gem, 3200);
    renderPath();
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

  function renderQuestion() {
    var el = host();
    if (!el || !run) return;
    var q = run.qs[run.i];
    var pct = Math.round((run.i / run.qs.length) * 100);
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
        '<div class="rt-q">' +
          '<div class="qmeta">' +
            '<span class="eyebrow">' + esc((global.Quiz.types[q.type] || {}).label || q.type) + '</span>' +
            '<span class="eyebrow">Road trip</span>' +
          '</div>' +
          '<div class="qprompt">' + esc(q.prompt) + '</div>' +
          '<div class="qsubject">' + global.Quiz.subjectHtml(q) + '</div>' +
          mapHtml +
          '<div class="' + global.Quiz.optionsClass(q) + '" id="rt-opts"></div>' +
          '<div id="rt-fb"></div>' +
        '</div>' +
      '</div>';

    var opts = W.$('#rt-opts', el);
    if (opts && q.choices) {
      q.choices.forEach(function (c, i) {
        var b = W.el('button', 'option');
        b.dataset.i = String(i);
        b.innerHTML =
          '<span class="option__key mono">' + (i + 1) + '</span>' +
          '<span class="option__text">' + global.Quiz.choiceHtml(q, c) + '</span>' +
          '<span class="option__mark">' + (I.check || '') + '</span>';
        b.addEventListener('click', function () { pick(i); });
        opts.appendChild(b);
      });
    }
    if (needsMap(q)) paintMap(q, false);
    W.$('#rt-leave', el).addEventListener('click', function () {
      if (active() && !global.confirm('Leave this lesson? This run will be lost.')) return;
      abandon();
      renderPath();
    });
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
    run.i += 1;
    run.answered = false;
    renderQuestion();
  }

  function finish() {
    if (!run) return;
    var score = run.right.filter(Boolean).length;
    var total = run.qs.length;
    var pct = Math.round((score / total) * 100);
    /* Complete the node when they clear at least half — keeps the path moving
       without demanding perfection on a seeded review. */
    if (pct >= 50) markDone(run.unitId, run.nodeId, 'played');
    run.phase = 'done';
    run.score = score;
    run.pct = pct;
    renderDone();
  }

  function renderDone() {
    var el = host();
    if (!el || !run) return;
    var cleared = run.pct >= 50;
    el.innerHTML =
      '<div class="rtpath rtpath--done">' +
        '<div class="rt-done">' +
          '<div class="rt-done__badge mono">' + run.score + '<span>/' + run.qs.length + '</span></div>' +
          '<h2>' + esc(run.title) + '</h2>' +
          '<p>' + (cleared
            ? 'Stop cleared — the path moves forward.'
            : 'Under half right. Try this stop again to unlock the next one.') + '</p>' +
          '<div class="rt-done__pct mono">' + run.pct + '%</div>' +
          '<div class="rt-done__acts">' +
            '<button type="button" class="btn btn--accent" id="rt-path">Back to path</button>' +
            (!cleared ? '<button type="button" class="btn btn--ghost" id="rt-retry">Try again</button>' : '') +
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
    SEED_BOX: SEED_BOX,
    SEED_RATIO: SEED_RATIO
  };
})(window);
