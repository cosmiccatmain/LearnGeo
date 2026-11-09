/* ------------------------------------------------------------------
   LearnGeo — account plans (LEA-43 / LEA-46 / LEA-122).

   Three plans: Free, Plus, Schools. The paid mark is still
   save.flags.premium (Plus and Schools both set it) so existing
   ultra_set_premium / score-submit checks keep working. flags.plan is
   'free' | 'plus' | 'schools'. flags.school marks a Schools account.

   LEA-46: the plans screen and upgrade modal stay DEVELOPMENT-ONLY.
   Owner / UltraAdmin flips the preview in Administrator → Development.
   Checkout stays mock / TEST until Stripe keys exist.

   LEA-125: Free never renders the Plus extras (four games and five
   cosmetics). No locked card, crown, or grey tile. Plus, Schools, and
   an active referral trial see them. The preview switch still only
   opens the upgrade modal and the Schools classroom paywall.

   Plus extras are the ids in PLUS_EXTRAS (games + skins already
   in the repo). Chicken Wings is not one of them. Games and cosmetics
   also mark themselves with `premium: true`. This file is the single
   client check.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  /* core.js loads after this file, so WW must be resolved at call time. */
  function W() { return global.WW; }

  var PREVIEW_KEY = 'learngeo.dev.premiumPreview';

  /* LEA-122: Plus extras. Keep in sync with
     public.premium_game_ids() in 0034 (games only) and the
     premium: true flags in games.js / cosmetics.js.
     Chicken Wings is not granted. Free keeps the popular arcade
     (Dash, Chess, Duel, Snake, Match, Maze, Golf, Defender) plus
     the titles dropped from this list. */
  var PLUS_EXTRAS = [
    { kind: 'game', id: 'invaders', name: 'Geo Invaders' },
    { kind: 'game', id: 'breakout', name: 'Flag Breakout' },
    { kind: 'game', id: 'typer', name: 'Capital Typer' },
    { kind: 'game', id: 'echo', name: 'Flag Echo' },
    { kind: 'effect', id: 'embers', name: 'Embers' },
    { kind: 'effect', id: 'bubbles', name: 'Deep Current' },
    { kind: 'trail', id: 'ember', name: 'Ember Wake' },
    { kind: 'jumper', id: 'gilded', name: 'Gilded Cube' },
    { kind: 'board', id: 'meridian', name: 'Meridian Gold' }
  ];

  var PREMIUM_GAMES = {
    invaders: true,
    breakout: true,
    typer: true,
    echo: true
  };

  var STUDENT_MIN = 1;
  var STUDENT_MAX = 400;

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

  function plan() {
    var f = flags();
    if (f.plan === 'schools' || f.school === true) return 'schools';
    if (f.plan === 'plus' || f.premium) return 'plus';
    return 'free';
  }

  function isPlus() {
    var id = plan();
    return id === 'plus' || id === 'schools';
  }

  function isSchool() {
    var f = flags();
    return plan() === 'schools' || !!f.school;
  }

  /* Paid entitlement: no ads + the ten extras. Referral trial unlocks
     play without awarding a subscribe badge. */
  function active() {
    return isPlus() || !!flags().premium || trialActive();
  }

  function clampStudents(n) {
    n = parseInt(n, 10);
    if (!isFinite(n)) n = 25;
    if (n < STUDENT_MIN) n = STUDENT_MIN;
    if (n > STUDENT_MAX) n = STUDENT_MAX;
    return n;
  }

  function studentCount() {
    return clampStudents(flags().students || 25);
  }

  function gameRequires(id) {
    return !!PREMIUM_GAMES[id];
  }

  /* The ten Plus extras stay off Free. Not a lock and not a grey card. */
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

  /* Free only sees Free. Plus, Schools, and an active referral trial
     see the ten extras. The preview switch does not put them back. */
  function catalogueVisible(thing) {
    var needs = false;
    if (typeof thing === 'string') needs = gameRequires(thing);
    else needs = itemRequires(thing);
    if (!needs) return true;
    return active();
  }

  function stripUnearnedCosmetics() {
    var s = W() && W().state;
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
      if (item && item.premium && !itemAllowed(item)) {
        if (freeFallback[slot] != null) s.profile[slot] = freeFallback[slot];
        else s.profile[slot] = list[0] ? list[0].id : 'none';
        changed = true;
      }
    });
    return changed;
  }

  /* Full Geo Classroom (teacher surfaces) is Schools-only while the
     Development preview is on. Joining with a class code stays Free. */
  function classroomAllowed() {
    if (!previewEnabled()) return true;
    return isSchool();
  }

  function schoolsLock() {
    return previewEnabled() && !classroomAllowed();
  }

  /* School accounts: no student-to-student messaging. Also covers a
     student whose enrolled class was marked by a Schools teacher. */
  function messagingAllowed() {
    if (isSchool()) return false;
    var tag = arguments[0];
    var f = flags();
    /* Set by school_create_student and by joining a Schools class (0035). */
    if (f.schoolStudent) {
      if (global.SchoolDashboard && global.SchoolDashboard.messagingOpen) {
        return !!global.SchoolDashboard.messagingOpen(tag);
      }
      return false;
    }
    var s = W() && W().state;
    if (!s) return true;
    if (s.role === 'student' && s.classroom && s.classroom.schoolPlan) return false;
    if (s.enrolled && s.enrolled.schoolPlan) return false;
    return true;
  }

  function blockStudentMessaging() {
    var tag = arguments[0];
    if (messagingAllowed(tag)) return false;
    var managed = flags().schoolStudent &&
      global.SchoolDashboard && global.SchoolDashboard.rulesReady &&
      global.SchoolDashboard.rulesReady();
    var ww = W();
    if (ww && ww.toast) {
      ww.toast(managed ? 'Managed by your school' : 'Schools',
        managed
          ? 'Managed by your school'
          : 'Schools plans do not include messaging between students.',
        (ww.Icons && (ww.Icons.info || ww.Icons.lock)) || null, 4200);
    }
    return true;
  }

  function syncTracking() {
    try {
      if (global.LearnGeoAds && typeof global.LearnGeoAds.syncSchoolTracking === 'function') {
        global.LearnGeoAds.syncSchoolTracking();
      }
    } catch (e) { /* ads script may load later */ }
  }

  function openUpgrade(reason) {
    if (!previewEnabled()) return;
    var why = reason || 'This is included with LearnGeo Plus.';
    if (global.SubscriptionDev && typeof global.SubscriptionDev.openUpgrade === 'function') {
      global.SubscriptionDev.openUpgrade(why);
      return;
    }
    if (global.UI && global.UI.modal) {
      global.UI.modal({
        title: 'Plus',
        icon: (W() && W().Icons && W().Icons.lock) || null,
        body: '<p class="t-muted" style="margin:0">' + (W() ? W().escapeHtml(why) : why) +
          '</p><p class="t-sm t-muted" style="margin:12px 0 0">Plus is no ads, a Plus badge, and ten extra games and looks. Schools adds full Geo Classroom at $2 per student. Checkout is mock / TEST only.</p>',
        actions: [{ label: 'Got it', cls: 'btn--primary', close: true }]
      });
      return;
    }
    if (W() && W().toast) W().toast('Plus', why, (W().Icons && W().Icons.lock) || null, 4200);
  }

  /* Local TEST flip. Mock subscribe counts: Plus or Schools awards the
     matching badge once (idempotent). setLocal(true) is Plus. */
  function setPlan(planId, opts) {
    opts = opts || {};
    var id = planId === 'schools' || planId === 'plus' ? planId : 'free';
    var f = flags();
    f.plan = id;
    f.premium = id !== 'free';
    f.school = id === 'schools';
    if (id === 'schools') f.students = clampStudents(opts.students != null ? opts.students : f.students);
    if (id === 'free') stripUnearnedCosmetics();
    if (id === 'schools') {
      var s = W() && W().state;
      if (s && s.classroom) s.classroom.schoolPlan = true;
    } else if (W() && W().state && W().state.classroom) {
      W().state.classroom.schoolPlan = false;
    }
    if (global.Badges && typeof global.Badges.syncPlans === 'function') {
      global.Badges.syncPlans({ announce: id !== 'free', save: false });
    } else if (global.Badges && typeof global.Badges.syncPremium === 'function') {
      global.Badges.syncPremium({ announce: id !== 'free', save: false });
    }
    syncTracking();
    if (W() && W().saveNow) W().saveNow();
    return id;
  }

  function setLocal(on) {
    setPlan(on ? 'plus' : 'free');
    return !!on;
  }

  global.Premium = {
    PREMIUM_GAMES: PREMIUM_GAMES,
    PLUS_EXTRAS: PLUS_EXTRAS,
    PREVIEW_KEY: PREVIEW_KEY,
    STUDENT_MIN: STUDENT_MIN,
    STUDENT_MAX: STUDENT_MAX,
    previewEnabled: previewEnabled,
    setPreviewEnabled: setPreviewEnabled,
    active: active,
    plan: plan,
    isPlus: isPlus,
    isSchool: isSchool,
    studentCount: studentCount,
    clampStudents: clampStudents,
    classroomAllowed: classroomAllowed,
    schoolsLock: schoolsLock,
    messagingAllowed: messagingAllowed,
    blockStudentMessaging: blockStudentMessaging,
    gameRequires: gameRequires,
    gameAllowed: gameAllowed,
    itemRequires: itemRequires,
    itemAllowed: itemAllowed,
    catalogueVisible: catalogueVisible,
    stripUnearnedCosmetics: stripUnearnedCosmetics,
    openUpgrade: openUpgrade,
    setPlan: setPlan,
    setLocal: setLocal
  };
})(window);
