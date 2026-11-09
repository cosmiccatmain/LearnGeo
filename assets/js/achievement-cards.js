/* ------------------------------------------------------------------
   LearnGeo — Achievement cards (LEA-64 / LEA-67 / LEA-70 / LEA-71 / LEA-74 / LEA-80)

   Credit-card-style stack with flip. Unlocked Cosmetics.achievements
   can be sent to a classmate by gamertag (school-safe; no money).
   LEA-67: fix Chromium button 3D flatten, float + wallet unfold,
   share whole wallet by gamertag.
   LEA-71: award-badge card backs with owner gamertag (wallet kept).
   LEA-74: seasonal / time-limited challenge awards drop into the wallet
           (holiday style; flip + enamel backs kept).
   LEA-80: Friend inbox unifies card gifts, wallet shares, and Geo Chess
   challenges (no new SQL).
   LEA-84: Friend inbox entry moves to the profile menu beside
   Customization (modal); Achievements keeps send/share only.
   Server: supabase/deployed/0023_achievement_cards.sql
           + 0025_achievement_wallet_share.sql
           + 0028_seasonal_achievement_cards.sql
           + chess invites via 0018_chess_duel.sql RPCs
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons;
  var esc = W.escapeHtml;
  var hostEl = null;
  var inboxModalRoot = null;
  var inboxModalPoll = null;
  var index = 0;
  var flipped = false;
  var lastInbox = {
    incoming: [], outgoing: [], received: [],
    walletIncoming: [], walletOutgoing: [], walletShared: [],
    chessIncoming: [], chessOutgoing: [], chessActive: null
  };
  var pollTimer = null;
  var chessInboxListener = null;
  var tray = 'mine'; /* mine | gifts | shared */
  var viewingShare = null; /* accepted wallet share row while tray=shared */
  var unfoldTimer = null;
  var settleTimer = null;
  var flipTimer = null;
  var didUnfold = false;
  var reduceMotion = false;
  var swipeStartX = null;
  var swipeStartY = null;

  try {
    reduceMotion = !!(global.matchMedia &&
      global.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch (e) { reduceMotion = false; }

  function sb() { return global.Cloud && global.Cloud.sb; }
  function deviceId() {
    return global.GameBoards && global.GameBoards.deviceId
      ? global.GameBoards.deviceId()
      : (W.state.deviceId || '');
  }
  function myTag() { return (W.state.gamertag || ''); }
  function signedIn() { return !!(global.Cloud && global.Cloud.signedIn); }

  function rpc(name, args) {
    var c = sb();
    if (!c) return Promise.resolve({ ok: false, error: 'offline' });
    return c.rpc(name, args).then(function (res) {
      if (res && res.error) return { ok: false, error: 'offline', message: res.error.message };
      return res.data || { ok: false, error: 'offline' };
    }, function () { return { ok: false, error: 'offline' }; });
  }

  function ensureServerTag() {
    var tag = myTag();
    var id = deviceId();
    if (!tag || !id) return Promise.resolve(false);
    var c = sb();
    if (!c) return Promise.resolve(false);
    return c.rpc('claim_gamertag', { p_device: id, p_tag: tag }).then(function (res) {
      if (res && res.error) return false;
      return (res && res.data) === 'ok';
    }, function () { return false; });
  }

  function ensureTag(then) {
    function afterLocal(tag) {
      ensureServerTag().then(function () { then(tag); });
    }
    if (global.GameBoards && global.GameBoards.ensureTag) {
      global.GameBoards.ensureTag(afterLocal);
    } else if (myTag()) {
      afterLocal(myTag());
    } else {
      W.toast('Pick a gamertag', 'Open Games → Leaderboards once to claim a name first.', I.gamepad, 4200);
    }
  }

  function catalog() {
    return (global.Cosmetics && global.Cosmetics.achievements) || [];
  }

  function haveIds() {
    return (W.state && W.state.achievements) || [];
  }

  function giftCards() {
    return (lastInbox.received || []).map(function (r) {
      var a = findAch(r.achievement_id) || {
        id: r.achievement_id,
        name: r.achievement_id,
        desc: 'Shared by a classmate',
        reward: 0
      };
      return {
        kind: 'gift',
        id: 'gift:' + r.id,
        sendId: r.id,
        fromTag: r.from_tag || 'Friend',
        createdAt: r.created_at || r.responded_at || null,
        unlocked: true,
        ach: a
      };
    });
  }

  function seasonSlot(achId) {
    var bag = (W.state && W.state.seasonal) || {};
    return bag[achId] || null;
  }

  function seasonActive(a, now) {
    var Cos = global.Cosmetics;
    if (!a || !a.seasonal || !a.season || !Cos || !Cos.seasonInWindow) return false;
    return !!Cos.seasonInWindow(a.season, now || new Date());
  }

  /* Wallet shows: all permanent cards; unlocked seasonals forever;
     locked seasonals only while their challenge window is open. */
  function walletCatalog() {
    var have = haveIds();
    var now = new Date();
    return catalog().filter(function (a) {
      if (!a.seasonal) return true;
      if (have.indexOf(a.id) !== -1) return true;
      return seasonActive(a, now);
    });
  }

  function mineCards() {
    var have = haveIds();
    return walletCatalog().map(function (a) {
      return {
        kind: 'mine',
        id: a.id,
        unlocked: have.indexOf(a.id) !== -1,
        ach: a,
        seasonal: !!a.seasonal
      };
    });
  }

  function sharedCards() {
    var row = viewingShare;
    if (!row) {
      var list = lastInbox.walletShared || [];
      if (!list.length) return [];
      row = list[0];
      viewingShare = row;
    }
    var ids = row.card_ids || [];
    return ids.map(function (id) {
      var a = findAch(id) || {
        id: id,
        name: id,
        desc: 'From ' + (row.from_tag || 'a friend') + '’s wallet',
        reward: 0
      };
      return {
        kind: 'shared',
        id: 'shared:' + row.id + ':' + id,
        fromTag: row.from_tag || 'Friend',
        unlocked: true,
        ach: a
      };
    });
  }

  function deck() {
    if (tray === 'gifts') return giftCards();
    if (tray === 'shared') return sharedCards();
    return mineCards();
  }

  function findAch(id) {
    var list = catalog();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function errMsg(code) {
    return ({
      offline: 'Couldn’t reach the server. Check your connection.',
      invalid: 'Something looked off — try again.',
      invalid_tag: 'Gamertags are 3–16 letters, numbers, or _.',
      invalid_card: 'That achievement card isn’t sendable.',
      invalid_wallet: 'Nothing unlocked to share yet.',
      not_found: 'No player with that gamertag.',
      self: 'You can’t send to yourself.',
      no_gamertag: 'Claim a gamertag in Games → Leaderboards first.',
      too_many: 'You already have several pending sends. Wait a bit.',
      already_pending: 'You already sent that to them.',
      locked: 'Unlock this achievement before you can send it.',
      guest: 'Sign in to share with classmates.'
    })[code] || 'Please try again.';
  }

  /* ====================== award badge (LEA-71) =====================
     Each achievement gets its OWN enamel pin: unique outer shape,
     metal, cloisonné segments, motif, and card-back atmosphere.
     Apple Watch award spirit — original LearnGeo art, not Apple assets.
  ------------------------------------------------------------------ */
  var AWARD_META = {
    'first-steps': {
      shape: 'rounded', metal: 'silver', accent: '#94A3B8',
      segments: [['sky', '#E2E8F0', '#94A3B8'], ['ground', '#64748B', '#334155']],
      layout: 'horizon', motif: 'flag', mark: '1',
      back: ['#1e293b', '#0f172a', '#334155']
    },
    'streak-10': {
      shape: 'hex', metal: 'gold', accent: '#F97316',
      segments: [['core', '#FB923C', '#EA580C'], ['ember', '#FDBA74', '#F97316']],
      layout: 'wedge', motif: 'flame', mark: '10',
      back: ['#7c2d12', '#431407', '#c2410c']
    },
    'streak-25': {
      shape: 'diamond', metal: 'rose', accent: '#EF4444',
      segments: [['hot', '#F87171', '#DC2626'], ['spark', '#FECACA', '#F97316']],
      layout: 'cross', motif: 'bolt', mark: '25',
      back: ['#7f1d1d', '#450a0a', '#b91c1c']
    },
    'perfect-test': {
      shape: 'circle', metal: 'gold', accent: '#10B981',
      segments: [['ring', '#6EE7B7', '#059669'], ['bull', '#34D399', '#047857']],
      layout: 'rings', motif: 'target', mark: '100',
      back: ['#064e3b', '#022c22', '#059669']
    },
    'test-5': {
      shape: 'shield', metal: 'gold', accent: '#3B82F6',
      segments: [['field', '#93C5FD', '#1D4ED8'], ['banner', '#60A5FA', '#1E40AF']],
      layout: 'chevron', motif: 'clipboard', mark: '5',
      back: ['#1e3a8a', '#172554', '#2563eb']
    },
    'cards-100': {
      shape: 'scallop', metal: 'rose', accent: '#A855F7',
      segments: [['play', '#E9D5FF', '#7C3AED'], ['pad', '#C084FC', '#6D28D9']],
      layout: 'split', motif: 'joystick', mark: '150',
      back: ['#4c1d95', '#2e1065', '#7c3aed']
    },
    'region-master': {
      shape: 'banner', metal: 'copper', accent: '#06B6D4',
      segments: [['sea', '#A5F3FC', '#0E7490'], ['land', '#67E8F9', '#155E75']],
      layout: 'bands', motif: 'map', mark: 'RM',
      back: ['#164e63', '#083344', '#0891b2']
    },
    'level-10': {
      shape: 'star', metal: 'gold', accent: '#F59E0B',
      segments: [['ray', '#FDE68A', '#D97706'], ['core', '#FBBF24', '#B45309']],
      layout: 'rays', motif: 'chevrons', mark: 'Lv10',
      back: ['#78350f', '#451a03', '#d97706']
    },
    'answers-500': {
      shape: 'heart', metal: 'rose', accent: '#DB2777',
      segments: [['blush', '#FBCFE8', '#BE185D'], ['ink', '#F472B6', '#9D174D']],
      layout: 'split', motif: 'bars', mark: '500',
      back: ['#831843', '#500724', '#db2777']
    },
    'globetrotter': {
      shape: 'oval', metal: 'gold', accent: '#0EA5E9',
      segments: [['ocean', '#7DD3FC', '#0284C7'], ['land', '#4ADE80', '#15803D']],
      layout: 'globe', motif: 'globe', mark: '100',
      back: ['#0c4a6e', '#082f49', '#0284c7']
    },
    /* LEA-74 — seasonal / holiday challenge awards (Apple Watch spirit) */
    'new-year-atlas': {
      shape: 'hex', metal: 'gold', accent: '#F59E0B',
      segments: [['spark', '#FDE68A', '#D97706'], ['night', '#1E3A5F', '#0F172A']],
      layout: 'rays', motif: 'sparkler', mark: 'NY',
      back: ['#1e293b', '#0f172a', '#f59e0b']
    },
    'heart-maps': {
      shape: 'heart', metal: 'rose', accent: '#FB7185',
      segments: [['blush', '#FECDD3', '#E11D48'], ['leaf', '#86EFAC', '#15803D']],
      layout: 'split', motif: 'heart', mark: '♥',
      back: ['#881337', '#4c0519', '#fb7185']
    },
    'earth-day': {
      shape: 'circle', metal: 'gold', accent: '#22C55E',
      segments: [['ocean', '#38BDF8', '#0369A1'], ['land', '#4ADE80', '#166534']],
      layout: 'globe', motif: 'leaf', mark: 'ED',
      back: ['#14532d', '#052e16', '#22c55e']
    },
    'summer-explorer': {
      shape: 'scallop', metal: 'gold', accent: '#FBBF24',
      segments: [['sun', '#FDE68A', '#F59E0B'], ['sky', '#7DD3FC', '#0284C7']],
      layout: 'rings', motif: 'sun', mark: '☀',
      back: ['#78350f', '#451a03', '#fbbf24']
    },
    'geo-awareness': {
      shape: 'shield', metal: 'copper', accent: '#06B6D4',
      segments: [['field', '#A5F3FC', '#0E7490'], ['ridge', '#FDBA74', '#C2410C']],
      layout: 'chevron', motif: 'mountain', mark: 'GA',
      back: ['#164e63', '#083344', '#f97316']
    },
    'winter-globe': {
      shape: 'oval', metal: 'silver', accent: '#93C5FD',
      segments: [['ice', '#E0F2FE', '#38BDF8'], ['night', '#1E3A8A', '#0F172A']],
      layout: 'bands', motif: 'snowflake', mark: 'WG',
      back: ['#1e3a8a', '#0f172a', '#93c5fd']
    }
  };

  function awardMeta(achId, unlocked) {
    var base = AWARD_META[achId] || {
      shape: 'circle', metal: 'gold', accent: '#0E9F6E',
      segments: [['a', '#34D399', '#166534']],
      layout: 'split', motif: 'globe', mark: '',
      back: ['#12352f', '#0a221e', '#0e9f6e']
    };
    if (unlocked) {
      return {
        shape: base.shape, metal: base.metal, accent: base.accent,
        segments: base.segments, layout: base.layout, motif: base.motif,
        mark: base.mark, back: base.back, unlocked: true
      };
    }
    return {
      shape: base.shape, metal: 'silver', accent: '#94A3B8',
      segments: base.segments.map(function (s, i) {
        return [s[0], i ? '#64748B' : '#94A3B8', '#334155'];
      }),
      layout: base.layout, motif: base.motif, mark: base.mark,
      back: ['#1e293b', '#0f172a', '#475569'], unlocked: false
    };
  }

  function ownerTag(card) {
    if (card.kind === 'shared') return card.fromTag || 'Friend';
    return myTag() || 'Player';
  }

  function formatAwardDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var mm = String(d.getMonth() + 1);
    var dd = String(d.getDate());
    var yy = String(d.getFullYear()).slice(-2);
    if (mm.length < 2) mm = '0' + mm;
    if (dd.length < 2) dd = '0' + dd;
    return mm + '/' + dd + '/' + yy;
  }

  function awardDateLabel(card) {
    if (card.kind === 'gift' && card.createdAt) return formatAwardDate(card.createdAt);
    if (card.kind === 'shared') return 'Shared';
    var a = card.ach;
    if (a && a.seasonal) {
      var slot = seasonSlot(a.id);
      if (card.unlocked && slot && slot.unlockedAt) return formatAwardDate(slot.unlockedAt);
      if (card.unlocked && slot && slot.year) {
        /* Apple Watch–style challenge stamp: month/day of window start + year */
        var s = a.season && a.season.start;
        if (s) {
          var mm = String(s[0]);
          var dd = String(s[1]);
          if (mm.length < 2) mm = '0' + mm;
          if (dd.length < 2) dd = '0' + dd;
          return mm + '/' + dd + '/' + String(slot.year).slice(-2);
        }
      }
      if (seasonActive(a)) return 'Challenge open';
      return 'Locked';
    }
    if (card.unlocked) return 'Unlocked';
    return 'Locked';
  }

  function seasonProgressLabel(a) {
    var Cos = global.Cosmetics;
    if (!a || !a.seasonal || !a.season || !Cos) return '';
    if (!seasonActive(a)) return '';
    var year = Cos.seasonEditionYear(a.season, new Date());
    var slot = seasonSlot(a.id);
    if (!slot || slot.year !== year) {
      return '0 / ' + a.season.goal;
    }
    var have = Cos.seasonProgressValue(slot, a.season.metric);
    return have + ' / ' + a.season.goal;
  }

  function metalStops(kind) {
    if (kind === 'silver') {
      return '<stop offset="0%" stop-color="#F8FAFC"/><stop offset="32%" stop-color="#CBD5E1"/>' +
        '<stop offset="58%" stop-color="#94A3B8"/><stop offset="100%" stop-color="#E2E8F0"/>';
    }
    if (kind === 'rose') {
      return '<stop offset="0%" stop-color="#FFF1F2"/><stop offset="30%" stop-color="#FDA4AF"/>' +
        '<stop offset="58%" stop-color="#E11D48"/><stop offset="100%" stop-color="#FECDD3"/>';
    }
    if (kind === 'copper') {
      return '<stop offset="0%" stop-color="#FFEDD5"/><stop offset="30%" stop-color="#FDBA74"/>' +
        '<stop offset="58%" stop-color="#C2410C"/><stop offset="100%" stop-color="#FDE68A"/>';
    }
    return '<stop offset="0%" stop-color="#FFF6D1"/><stop offset="28%" stop-color="#F5C84B"/>' +
      '<stop offset="55%" stop-color="#C9891A"/><stop offset="100%" stop-color="#F0D78A"/>';
  }

  function motifPaths(motif) {
    var m = {
      flag: '<path d="M8 4.5v15M8 5.2h9.2l-1.4 3.1 1.4 3.1H8"/>',
      flame: '<path d="M12 3.2s3.6 3.8 3.6 7.2a3.6 3.6 0 1 1-7.2 0c0-.9.4-1.8.9-2.7C6.2 9.4 4.4 11.6 4.4 14.6a7.6 7.6 0 0 0 15.2 0c0-5.4-7.6-11.4-7.6-11.4z"/>',
      bolt: '<path d="M13.2 2.8 5.6 13h5.6l-1.2 8.2 7.6-10.2h-5.6z"/>',
      target: '<circle cx="12" cy="12" r="7.4" fill="none"/><circle cx="12" cy="12" r="4.2" fill="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
      clipboard: '<rect x="6.4" y="5.2" width="11.2" height="14.2" rx="1.4" fill="none"/><path d="M9 5.2V4.2h6v1"/><path d="M8.8 10h6.4M8.8 13h6.4M8.8 16h4.2"/>',
      joystick: '<circle cx="12" cy="7" r="2.8"/><path d="M12 9.8v4.2"/><path d="M5.8 19.2a6.2 6.2 0 0 1 12.4 0z" fill="none"/>',
      map: '<path d="m3.8 6.6 5.2-2.4 5.6 2.4 5.6-2.4v13l-5.6 2.4-5.6-2.4-5.2 2.4z" fill="none"/><path d="M9 4.2v13M14.6 6.6v13"/>',
      chevrons: '<path d="m6 14 6-6 6 6M6 18.5l6-6 6 6"/>',
      bars: '<path d="M5 17.6V11h2.8v6.6zm5.6 0V6.4h2.8v11.2zm5.6 0V9.2H19v8.4z" fill="currentColor" stroke="none"/>',
      globe: '<circle cx="12" cy="12" r="7.4" fill="none"/><path d="M4.6 12h14.8M12 4.6a13 13 0 0 1 0 14.8 13 13 0 0 1 0-14.8"/>',
      leaf: '<path d="M12 20.4C7 16.8 4.4 12.8 4.4 8.6 4.4 5.2 7 3 12 3c5 0 7.6 2.2 7.6 5.6 0 4.2-2.6 8.2-7.6 11.8z"/><path d="M12 3.4v17"/>',
      sparkler: '<path d="M12 3.2v6.4M12 14.4v6.4M3.2 12h6.4M14.4 12h6.4M5.6 5.6l4.4 4.4M14 14l4.4 4.4M18.4 5.6l-4.4 4.4M10 14l-4.4 4.4"/>',
      sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.4 5.4l1.7 1.7M16.9 16.9l1.7 1.7M18.6 5.4l-1.7 1.7M7.1 16.9l-1.7 1.7"/>',
      mountain: '<path d="m3.2 18.4 5.6-9.2 3.4 5.4 3-4.6 5.6 8.4z" fill="none"/><path d="M9.6 12.2 12 8.4l2.2 3.4"/>',
      snowflake: '<path d="M12 3.2v17.6M4.4 7.6l15.2 8.8M4.4 16.4l15.2-8.8M8.2 5.2l1.6 2.8M14.2 16l1.6 2.8M8.2 18.8l1.6-2.8M14.2 8l1.6-2.8"/>',
      heart: '<path d="M12 19.6C6.4 15.4 4 12.2 4 9a4.2 4.2 0 0 1 8-1.8A4.2 4.2 0 0 1 20 9c0 3.2-2.4 6.4-8 10.6z"/>'
    };
    return m[motif] || m.globe;
  }

  function shapeShell(shape) {
    var shells = {
      circle: {
        rim: 'M50 8 A42 42 0 1 1 49.9 8 Z',
        plate: 'M50 16 A34 34 0 1 1 49.9 16 Z'
      },
      rounded: {
        rim: 'M22 10 H78 A12 12 0 0 1 90 22 V78 A12 12 0 0 1 78 90 H22 A12 12 0 0 1 10 78 V22 A12 12 0 0 1 22 10 Z',
        plate: 'M26 18 H74 A8 8 0 0 1 82 26 V74 A8 8 0 0 1 74 82 H26 A8 8 0 0 1 18 74 V26 A8 8 0 0 1 26 18 Z'
      },
      hex: {
        rim: 'M50 6 L88 28 V72 L50 94 L12 72 V28 Z',
        plate: 'M50 14 L80 32 V68 L50 86 L20 68 V32 Z'
      },
      shield: {
        rim: 'M50 6 L90 20 V48 C90 72 70 88 50 96 C30 88 10 72 10 48 V20 Z',
        plate: 'M50 14 L82 26 V48 C82 68 66 82 50 88 C34 82 18 68 18 48 V26 Z'
      },
      heart: {
        rim: 'M50 90 C18 66 6 48 6 30 A22 22 0 0 1 50 22 A22 22 0 0 1 94 30 C94 48 82 66 50 90 Z',
        plate: 'M50 82 C24 62 14 48 14 32 A16 16 0 0 1 50 28 A16 16 0 0 1 86 32 C86 48 76 62 50 82 Z'
      },
      diamond: {
        rim: 'M50 4 L94 50 L50 96 L6 50 Z',
        plate: 'M50 14 L84 50 L50 86 L16 50 Z'
      },
      scallop: {
        rim: 'M50 8 C62 8 70 14 74 22 C84 20 92 28 90 40 C98 46 98 58 90 64 C92 76 84 84 74 82 C70 90 62 96 50 96 C38 96 30 90 26 82 C16 84 8 76 10 64 C2 58 2 46 10 40 C8 28 16 20 26 22 C30 14 38 8 50 8 Z',
        plate: 'M50 16 C60 16 66 21 69 27 C77 26 83 32 82 41 C88 46 88 56 82 61 C83 70 77 76 69 75 C66 81 60 86 50 86 C40 86 34 81 31 75 C23 76 17 70 18 61 C12 56 12 46 18 41 C17 32 23 26 31 27 C34 21 40 16 50 16 Z'
      },
      banner: {
        rim: 'M12 18 H88 V70 L70 82 L50 72 L30 82 L12 70 Z',
        plate: 'M20 26 H80 V64 L68 74 L50 66 L32 74 L20 64 Z'
      },
      star: {
        rim: 'M50 4 L61 36 L94 36 L68 56 L78 90 L50 70 L22 90 L32 56 L6 36 L39 36 Z',
        plate: 'M50 14 L58 38 L82 38 L63 53 L70 78 L50 63 L30 78 L37 53 L18 38 L42 38 Z'
      },
      oval: {
        rim: 'M50 8 C74 8 90 26 90 50 C90 74 74 92 50 92 C26 92 10 74 10 50 C10 26 26 8 50 8 Z',
        plate: 'M50 16 C68 16 80 30 80 50 C80 70 68 84 50 84 C32 84 20 70 20 50 C20 30 32 16 50 16 Z'
      }
    };
    return shells[shape] || shells.circle;
  }

  function segmentPaths(layout, plate) {
    /* Cloisonné partitions clipped to the enamel plate. */
    if (layout === 'horizon') {
      return [
        { d: 'M10 10 H90 V50 H10 Z' },
        { d: 'M10 50 H90 V90 H10 Z' }
      ];
    }
    if (layout === 'wedge') {
      return [
        { d: 'M50 10 L90 78 L10 78 Z' },
        { d: 'M18 70 H82 L50 92 Z' }
      ];
    }
    if (layout === 'cross') {
      return [
        { d: 'M20 20 H80 V80 H20 Z' },
        { d: 'M42 12 H58 V88 H42 Z' }
      ];
    }
    if (layout === 'rings') {
      return [
        { d: plate },
        { d: 'M50 30 A20 20 0 1 1 49.9 30 Z' }
      ];
    }
    if (layout === 'chevron') {
      return [
        { d: 'M15 18 H85 V55 L50 78 L15 55 Z' },
        { d: 'M22 58 H78 L50 88 Z' }
      ];
    }
    if (layout === 'bands') {
      return [
        { d: 'M12 22 H88 V48 H12 Z' },
        { d: 'M12 48 H88 V78 H12 Z' }
      ];
    }
    if (layout === 'rays') {
      return [
        { d: 'M50 12 L88 50 L50 88 L12 50 Z' },
        { d: 'M50 28 L72 50 L50 72 L28 50 Z' }
      ];
    }
    if (layout === 'globe') {
      return [
        { d: 'M12 20 H88 V55 H12 Z' },
        { d: 'M18 55 H82 V82 H18 Z' }
      ];
    }
    /* split default */
    return [
      { d: 'M10 10 H50 V90 H10 Z' },
      { d: 'M50 10 H90 V90 H50 Z' }
    ];
  }

  function awardBadgeSvg(ach, unlocked) {
    var meta = awardMeta(ach.id, unlocked);
    var shell = shapeShell(meta.shape);
    var uid = 'ab-' + String(ach.id || 'x').replace(/[^a-z0-9_-]/gi, '') +
      (unlocked ? '-u' : '-l');
    var segs = meta.segments || [];
    var parts = segmentPaths(meta.layout, shell.plate);
    var i;
    var enamelDefs = '';
    var enamelPaths = '';
    for (i = 0; i < segs.length; i++) {
      var seg = segs[i];
      var part = parts[i] || parts[parts.length - 1];
      enamelDefs += '<linearGradient id="' + uid + '-e' + i + '" x1="25%" y1="10%" x2="75%" y2="90%">' +
        '<stop offset="0%" stop-color="' + seg[1] + '"/>' +
        '<stop offset="100%" stop-color="' + seg[2] + '"/>' +
        '</linearGradient>';
      enamelPaths += '<path d="' + part.d + '" fill="url(#' + uid + '-e' + i + ')"/>';
    }
    var motif = motifPaths(meta.motif);
    var mark = meta.mark
      ? ('<text class="achv-award__mark" x="50" y="78" text-anchor="middle" ' +
        'fill="url(#' + uid + '-metal)" font-size="8" font-weight="700" ' +
        'font-family="ui-monospace, Menlo, monospace">' +
        esc(meta.mark) + '</text>')
      : '';
    /* Wireframe dividers sit on top of enamel (cloisonné look) */
    var wires = '';
    for (i = 0; i < parts.length; i++) {
      wires += '<path d="' + parts[i].d + '" fill="none" stroke="url(#' + uid + '-metal)" ' +
        'stroke-width="1.4" opacity=".85"/>';
    }
    return '' +
      '<svg class="achv-award achv-award--' + meta.shape + '" viewBox="0 0 100 100" ' +
        'aria-hidden="true" focusable="false">' +
        '<defs>' +
          '<linearGradient id="' + uid + '-metal" x1="18%" y1="8%" x2="82%" y2="92%">' +
            metalStops(meta.metal) +
          '</linearGradient>' +
          enamelDefs +
          '<clipPath id="' + uid + '-clip"><path d="' + shell.plate + '"/></clipPath>' +
          '<radialGradient id="' + uid + '-shine" cx="32%" cy="28%" r="55%">' +
            '<stop offset="0%" stop-color="#fff" stop-opacity=".5"/>' +
            '<stop offset="55%" stop-color="#fff" stop-opacity="0"/>' +
          '</radialGradient>' +
          '<filter id="' + uid + '-shadow" x="-20%" y="-20%" width="140%" height="140%">' +
            '<feDropShadow dx="0" dy="2.5" stdDeviation="2.2" flood-color="#061510" flood-opacity=".45"/>' +
          '</filter>' +
        '</defs>' +
        '<g filter="url(#' + uid + '-shadow)">' +
          '<path class="achv-award__rim" d="' + shell.rim + '" fill="url(#' + uid + '-metal)"/>' +
          '<g clip-path="url(#' + uid + '-clip)">' +
            enamelPaths +
            wires +
            '<path class="achv-award__shine" d="' + shell.plate + '" fill="url(#' + uid + '-shine)"/>' +
          '</g>' +
          '<path d="' + shell.plate + '" fill="none" stroke="url(#' + uid + '-metal)" stroke-width="2.2"/>' +
          '<g class="achv-award__motif" transform="translate(26,22) scale(2)" fill="none" ' +
            'stroke="url(#' + uid + '-metal)" stroke-width="1.55" stroke-linecap="round" ' +
            'stroke-linejoin="round">' + motif + '</g>' +
          mark +
        '</g>' +
      '</svg>';
  }

  function backFaceHtml(card) {
    var a = card.ach;
    var unlocked = !!card.unlocked;
    var meta = awardMeta(a.id, unlocked);
    var tag = ownerTag(card);
    var title = a.name || 'Achievement';
    var date = awardDateLabel(card);
    var back = meta.back || ['#12352f', '#0a221e', '#0e9f6e'];
    var style = '--achv-back-a:' + back[0] + ';--achv-back-b:' + back[1] +
      ';--achv-back-c:' + back[2] + ';--achv-back-accent:' + (meta.accent || '#0e9f6e');
    return '' +
      '<div class="achv-card__face achv-card__face--back' +
        (unlocked ? '' : ' is-locked') +
        '" data-award="' + esc(a.id || '') + '" data-shape="' + esc(meta.shape) +
        '" style="' + style + '">' +
        '<div class="achv-award-wrap">' + awardBadgeSvg(a, unlocked) + '</div>' +
        '<div class="achv-card__owner">' + esc(tag) + '</div>' +
        '<div class="achv-card__award-title">' + esc(title) + '</div>' +
        '<div class="achv-card__award-date">' + esc(date) + '</div>' +
      '</div>';
  }

  /* ============================ RPC =============================== */
  function applyChessBox(box) {
    box = box || (global.ChessDuel && global.ChessDuel.inbox
      ? global.ChessDuel.inbox()
      : null) || {};
    lastInbox.chessIncoming = box.incoming || [];
    lastInbox.chessOutgoing = box.outgoing || [];
    lastInbox.chessActive = box.active || null;
  }

  function fetchInbox() {
    var id = deviceId();
    if (!id || !signedIn()) {
      lastInbox = {
        incoming: [], outgoing: [], received: [],
        walletIncoming: [], walletOutgoing: [], walletShared: [],
        chessIncoming: [], chessOutgoing: [], chessActive: null
      };
      return Promise.resolve(lastInbox);
    }
    var chessP = (global.ChessDuel && global.ChessDuel.fetchInbox)
      ? global.ChessDuel.fetchInbox().catch(function () { return null; })
      : Promise.resolve(null);
    return Promise.all([
      rpc('ach_card_list_inbox', { p_device: id }),
      rpc('ach_wallet_list', { p_device: id }),
      chessP
    ]).then(function (both) {
      var cards = both[0];
      var wallets = both[1];
      var chessBox = both[2];
      if (cards && cards.ok) {
        lastInbox.incoming = cards.incoming || [];
        lastInbox.outgoing = cards.outgoing || [];
        lastInbox.received = cards.received || [];
      }
      if (wallets && wallets.ok) {
        lastInbox.walletIncoming = wallets.incoming || [];
        lastInbox.walletOutgoing = wallets.outgoing || [];
        lastInbox.walletShared = wallets.shared || [];
        if (viewingShare) {
          var still = null;
          (lastInbox.walletShared || []).forEach(function (r) {
            if (r.id === viewingShare.id) still = r;
          });
          viewingShare = still;
        }
      } else if (wallets && wallets.error === 'offline') {
        /* migration not applied yet — keep card inbox working */
        lastInbox.walletIncoming = lastInbox.walletIncoming || [];
        lastInbox.walletOutgoing = lastInbox.walletOutgoing || [];
        lastInbox.walletShared = lastInbox.walletShared || [];
      }
      applyChessBox(chessBox);
      return lastInbox;
    });
  }

  function sendCard(tag, achievementId) {
    if (global.Premium && global.Premium.blockStudentMessaging &&
        global.Premium.blockStudentMessaging(tag)) {
      return Promise.resolve({ ok: false, error: 'school' });
    }
    if (!signedIn()) return Promise.resolve({ ok: false, error: 'guest' });
    if (!tag || !/^[A-Za-z0-9_]{3,16}$/.test(tag)) {
      return Promise.resolve({ ok: false, error: 'invalid_tag' });
    }
    if (myTag() && tag.toLowerCase() === myTag().toLowerCase()) {
      return Promise.resolve({ ok: false, error: 'self' });
    }
    if (haveIds().indexOf(achievementId) === -1) {
      return Promise.resolve({ ok: false, error: 'locked' });
    }
    return schoolMessageGate(tag, function () { return rpc('pvp_lookup_tag', { p_tag: tag }).then(function (rows) {
      if (rows && rows.ok === false) return rows;
      var row = Array.isArray(rows) ? rows[0] : rows;
      var found = !!(row && (row.found === true || row.found === 't' || row.gamertag));
      if (!found) return { ok: false, error: 'not_found' };
      return rpc('ach_card_send', {
        p_device: deviceId(),
        p_to_tag: tag,
        p_achievement_id: achievementId
      });
    }); });
  }

  function schoolMessageGate(tag, next) {
    if (!(global.SchoolDashboard && global.SchoolDashboard.confirmMessage)) return next();
    return global.SchoolDashboard.confirmMessage(tag).then(function (ok) {
      if (ok) return next();
      if (global.Premium && global.Premium.blockStudentMessaging) {
        global.Premium.blockStudentMessaging(tag);
      }
      return { ok: false, error: 'school' };
    });
  }

  function sendWallet(tag) {
    if (global.Premium && global.Premium.blockStudentMessaging &&
        global.Premium.blockStudentMessaging(tag)) {
      return Promise.resolve({ ok: false, error: 'school' });
    }
    if (!signedIn()) return Promise.resolve({ ok: false, error: 'guest' });
    if (!tag || !/^[A-Za-z0-9_]{3,16}$/.test(tag)) {
      return Promise.resolve({ ok: false, error: 'invalid_tag' });
    }
    if (myTag() && tag.toLowerCase() === myTag().toLowerCase()) {
      return Promise.resolve({ ok: false, error: 'self' });
    }
    var unlocked = haveIds().slice();
    if (!unlocked.length) return Promise.resolve({ ok: false, error: 'invalid_wallet' });
    return schoolMessageGate(tag, function () { return rpc('pvp_lookup_tag', { p_tag: tag }).then(function (rows) {
      if (rows && rows.ok === false) return rows;
      var row = Array.isArray(rows) ? rows[0] : rows;
      var found = !!(row && (row.found === true || row.found === 't' || row.gamertag));
      if (!found) return { ok: false, error: 'not_found' };
      return rpc('ach_wallet_share', {
        p_device: deviceId(),
        p_to_tag: tag,
        p_card_ids: unlocked
      });
    }); });
  }

  /* ============================ paint ============================= */
  function cardFaceHtml(card, depth) {
    var a = card.ach;
    var unlocked = !!card.unlocked;
    var gift = card.kind === 'gift';
    var shared = card.kind === 'shared';
    var seasonal = !!(a && a.seasonal);
    var faceCls = 'achv-card__face achv-card__face--front' +
      (unlocked ? '' : ' is-locked') +
      (gift ? ' is-gift' : '') +
      (shared ? ' is-shared' : '') +
      (seasonal ? ' is-seasonal' : '');
    var eyebrow;
    if (gift) eyebrow = 'From ' + esc(card.fromTag || 'friend');
    else if (shared) eyebrow = 'Wallet · ' + esc(card.fromTag || 'friend');
    else if (seasonal) {
      eyebrow = unlocked
        ? 'Seasonal award'
        : (seasonActive(a) ? 'Challenge · open' : 'Seasonal');
    } else {
      eyebrow = unlocked ? 'Achievement' : 'Locked';
    }
    var progress = (!unlocked && seasonal) ? seasonProgressLabel(a) : '';
    var reward = unlocked
      ? ('+' + a.reward + ' 💎')
      : (progress || 'Locked');
    var lockedHint = seasonal
      ? (seasonActive(a)
        ? ('Challenge open — ' + (a.desc || 'earn this award before it ends.'))
        : 'This seasonal challenge isn’t open right now.')
      : 'Keep exploring to unlock this card.';
    /* div[role=button]: native <button> flattens preserve-3d in Chromium */
    var depthAttr = depth > 3 ? 'n' : String(depth);
    return '' +
      '<div role="button" tabindex="' + (depth === 0 ? '0' : '-1') + '" class="achv-card' +
        (depth === 0 ? ' is-front' : '') +
        (seasonal ? ' is-seasonal' : '') + '"' +
        ' data-depth="' + depthAttr + '"' +
        ' data-offset="' + depth + '"' +
        ' data-card="' + esc(card.id) + '"' +
        (seasonal ? ' data-seasonal="1"' : '') +
        ' aria-label="' + esc(a.name) + (unlocked ? '' : ' (locked)') +
        (depth === 0 ? '' : ' · next in stack') + '">' +
        '<div class="achv-card__inner">' +
          '<div class="' + faceCls + '">' +
            '<div class="achv-card__chip" aria-hidden="true"></div>' +
            '<div class="achv-card__eyebrow">' + eyebrow + '</div>' +
            '<div class="achv-card__name">' + esc(a.name) + '</div>' +
            '<div class="achv-card__desc">' +
              esc(unlocked ? a.desc : lockedHint) +
            '</div>' +
            '<div class="achv-card__foot">' +
              '<span class="achv-card__reward">' + reward + '</span>' +
              '<span class="mono" style="font-size:11px;opacity:.65">' +
                (unlocked ? I.check : I.lock) +
              '</span>' +
            '</div>' +
          '</div>' +
          backFaceHtml(card) +
        '</div>' +
      '</div>';
  }

  function stackLayersHtml() {
    var cards = deck();
    if (!cards.length) return '';
    if (index >= cards.length) index = cards.length - 1;
    if (index < 0) index = 0;
    var layers = [];
    var show = Math.min(5, cards.length);
    for (var d = 0; d < show; d++) {
      var ci = (index + d) % cards.length;
      layers.push(cardFaceHtml(cards[ci], d));
    }
    return layers.join('');
  }

  function stackHtml() {
    var cards = deck();
    if (!cards.length) {
      var emptyMsg = tray === 'shared'
        ? 'No shared wallets yet — accept a wallet invite from Inbox.'
        : tray === 'gifts'
          ? 'No received cards yet.'
          : 'No cards here yet.';
      return '<div class="empty" data-stack-empty>' + emptyMsg + '</div>';
    }
    return '<div class="achv-stack" data-stack>' + stackLayersHtml() + '</div>';
  }

  function railHtml() {
    var cards = deck();
    if (cards.length < 2) return '';
    var dots = cards.map(function (c, i) {
      var cls = 'achv-rail__dot' +
        (i === index ? ' is-active' : '') +
        (c.unlocked ? ' is-unlocked' : '');
      return '<button type="button" class="' + cls + '" data-rail="' + i + '"' +
        ' aria-label="' + esc(c.ach.name) + '"' +
        ' title="' + esc(c.ach.name) + '">' + (i + 1) + '</button>';
    }).join('');
    return '<div class="achv-rail" data-rail-wrap role="tablist" aria-label="Cards in wallet">' +
      dots + '</div>';
  }

  function stageHtml() {
    var cards = deck();
    var canStep = cards.length > 1;
    return '' +
      '<div class="achv-stage" data-stage tabindex="0" aria-label="Achievement card deck">' +
        '<button type="button" class="btn btn--ghost achv-stage__nav" data-prev' +
          (canStep ? '' : ' disabled') + ' aria-label="Previous card">' + I.arrowL + '</button>' +
        '<div class="achv-stage__deck" data-deck>' + stackHtml() + '</div>' +
        '<button type="button" class="btn btn--ghost achv-stage__nav" data-next' +
          (canStep ? '' : ' disabled') + ' aria-label="Next card">' + I.arrowR + '</button>' +
      '</div>' +
      railHtml();
  }

  function inboxHtml() {
    var inc = lastInbox.incoming || [];
    var out = lastInbox.outgoing || [];
    var wInc = lastInbox.walletIncoming || [];
    var wOut = lastInbox.walletOutgoing || [];
    var cInc = lastInbox.chessIncoming || [];
    var cOut = lastInbox.chessOutgoing || [];
    var cActive = lastInbox.chessActive;
    var parts = [];

    if (!signedIn()) {
      return '<p class="achv-empty">Sign in and claim a gamertag to send or receive cards, wallets, and chess challenges.</p>';
    }
    if (!inc.length && !out.length && !wInc.length && !wOut.length &&
        !cInc.length && !cOut.length && !cActive) {
      parts.push('<p class="achv-empty">No pending cards, wallets, or chess challenges.</p>');
    }
    if (cActive && cActive.id) {
      var vs = cActive.host_tag === myTag() ? cActive.guest_tag : cActive.host_tag;
      parts.push(
        '<div class="achv-inbox__row" data-chess-active="' + esc(cActive.id) + '">' +
          '<div class="grow">' +
            '<span class="achv-inbox__kind achv-inbox__kind--chess">Chess</span>' +
            '<b>Match in progress</b>' +
            '<span>vs ' + esc(vs || 'friend') +
              (cActive.my_color === 'w' ? ' · you are White' : ' · you are Black') +
            '</span></div>' +
          '<div class="achv-inbox__acts">' +
            '<button type="button" class="btn btn--accent btn--sm" data-chess-resume>Rejoin</button>' +
          '</div>' +
        '</div>'
      );
    }
    cInc.forEach(function (row) {
      parts.push(
        '<div class="achv-inbox__row" data-chess="' + esc(row.id) + '">' +
          '<div class="grow">' +
            '<span class="achv-inbox__kind achv-inbox__kind--chess">Chess</span>' +
            '<b>' + esc(row.from_tag || 'Friend') + ' challenged you</b>' +
            '<span>Geo Chess · they play White</span></div>' +
          '<div class="achv-inbox__acts">' +
            '<button type="button" class="btn btn--accent btn--sm" data-chess-accept>Accept</button>' +
            '<button type="button" class="btn btn--ghost btn--sm" data-chess-decline>Decline</button>' +
          '</div>' +
        '</div>'
      );
    });
    wInc.forEach(function (row) {
      var n = (row.card_ids && row.card_ids.length) || 0;
      parts.push(
        '<div class="achv-inbox__row" data-wallet="' + esc(row.id) + '">' +
          '<div class="grow">' +
            '<span class="achv-inbox__kind">Wallet</span>' +
            '<b>' + esc(row.from_tag || 'Friend') + '’s wallet</b>' +
            '<span>' + n + ' unlocked card' + (n === 1 ? '' : 's') + '</span></div>' +
          '<div class="achv-inbox__acts">' +
            '<button type="button" class="btn btn--accent btn--sm" data-w-accept>Keep</button>' +
            '<button type="button" class="btn btn--ghost btn--sm" data-w-decline>No thanks</button>' +
          '</div>' +
        '</div>'
      );
    });
    inc.forEach(function (row) {
      var a = findAch(row.achievement_id);
      parts.push(
        '<div class="achv-inbox__row" data-send="' + esc(row.id) + '">' +
          '<div class="grow">' +
            '<span class="achv-inbox__kind">Card</span>' +
            '<b>' + esc((a && a.name) || row.achievement_id) + '</b>' +
            '<span>From ' + esc(row.from_tag || 'friend') + '</span></div>' +
          '<div class="achv-inbox__acts">' +
            '<button type="button" class="btn btn--accent btn--sm" data-accept>Keep</button>' +
            '<button type="button" class="btn btn--ghost btn--sm" data-decline>No thanks</button>' +
          '</div>' +
        '</div>'
      );
    });
    cOut.forEach(function (row) {
      parts.push(
        '<div class="achv-inbox__row" data-chess="' + esc(row.id) + '">' +
          '<div class="grow">' +
            '<span class="achv-inbox__kind achv-inbox__kind--chess">Chess</span>' +
            '<b>Challenge → ' + esc(row.to_tag || 'friend') + '</b>' +
            '<span>Geo Chess · waiting</span></div>' +
          '<div class="achv-inbox__acts">' +
            '<button type="button" class="btn btn--ghost btn--sm" data-chess-cancel>Cancel</button>' +
          '</div>' +
        '</div>'
      );
    });
    wOut.forEach(function (row) {
      var n = (row.card_ids && row.card_ids.length) || 0;
      parts.push(
        '<div class="achv-inbox__row" data-wallet="' + esc(row.id) + '">' +
          '<div class="grow">' +
            '<span class="achv-inbox__kind">Wallet</span>' +
            '<b>Wallet → ' + esc(row.to_tag || 'friend') + '</b>' +
            '<span>' + n + ' cards · waiting</span></div>' +
          '<div class="achv-inbox__acts">' +
            '<button type="button" class="btn btn--ghost btn--sm" data-w-cancel>Cancel</button>' +
          '</div>' +
        '</div>'
      );
    });
    out.forEach(function (row) {
      var a = findAch(row.achievement_id);
      parts.push(
        '<div class="achv-inbox__row" data-send="' + esc(row.id) + '">' +
          '<div class="grow">' +
            '<span class="achv-inbox__kind">Card</span>' +
            '<b>' + esc((a && a.name) || row.achievement_id) + '</b>' +
            '<span>Waiting on ' + esc(row.to_tag || 'friend') + '</span></div>' +
          '<div class="achv-inbox__acts">' +
            '<button type="button" class="btn btn--ghost btn--sm" data-cancel>Cancel</button>' +
          '</div>' +
        '</div>'
      );
    });
    return '<div class="achv-inbox__list">' + parts.join('') + '</div>';
  }

  function sharedPickerHtml() {
    var list = lastInbox.walletShared || [];
    if (!list.length) return '';
    var opts = list.map(function (r) {
      var n = (r.card_ids && r.card_ids.length) || 0;
      var sel = viewingShare && viewingShare.id === r.id ? ' selected' : '';
      return '<option value="' + esc(r.id) + '"' + sel + '>' +
        esc(r.from_tag || 'Friend') + ' · ' + n + ' cards</option>';
    }).join('');
    return '<div class="field" style="margin:0 0 12px;max-width:280px">' +
      '<label class="field__label" for="achv-shared-pick">Friend’s wallet</label>' +
      '<select class="input" id="achv-shared-pick">' + opts + '</select></div>';
  }

  function paint(opts) {
    if (!hostEl) return;
    opts = opts || {};
    var cards = deck();
    var have = haveIds().length;
    var total = walletCatalog().length;
    var front = cards[index];
    var canSend = !!(front && front.kind === 'mine' && front.unlocked);
    var canShareWallet = have > 0;
    var sharedN = (lastInbox.walletShared || []).length;
    var openSeasonals = catalog().filter(function (a) {
      return a.seasonal && seasonActive(a);
    }).length;

    hostEl.innerHTML =
      '<div class="achv">' +
        '<div class="achv__hero">' +
          '<div>' +
            '<div class="eyebrow">Collection</div>' +
            '<h1>Achievement wallet</h1>' +
            '<p>Flip through your stack like a deck of cards. Seasonal challenges drop enamel awards into the wallet while they\'re open — then stay forever. Send unlocked ones or share the whole wallet by gamertag. School-safe, no real money.</p>' +
          '</div>' +
          '<div class="achv__stats">' +
            '<span class="chip mono">' + have + ' / ' + total + ' unlocked</span>' +
            (openSeasonals
              ? '<span class="chip mono achv-chip--seasonal">' + openSeasonals +
                ' challenge' + (openSeasonals === 1 ? '' : 's') + ' open</span>'
              : '') +
            '<span class="chip chip--gem mono">' +
              W.gem((W.state.economy && W.state.economy.diamonds || 0).toLocaleString(), false) +
            '</span>' +
          '</div>' +
        '</div>' +
        '<div class="achv__layout">' +
          '<div>' +
            '<div class="seg" data-tray style="margin-bottom:12px;max-width:420px">' +
              '<button type="button" data-v="mine"' + (tray === 'mine' ? ' class="is-active"' : '') + '>My wallet</button>' +
              '<button type="button" data-v="gifts"' + (tray === 'gifts' ? ' class="is-active"' : '') +
                '>Received' +
                ((lastInbox.received || []).length
                  ? ' · ' + lastInbox.received.length
                  : '') +
              '</button>' +
              '<button type="button" data-v="shared"' + (tray === 'shared' ? ' class="is-active"' : '') +
                '>Friends' +
                (sharedN ? ' · ' + sharedN : '') +
              '</button>' +
            '</div>' +
            (tray === 'shared' ? sharedPickerHtml() : '') +
            stageHtml() +
            '<div class="achv-nav">' +
              '<span class="achv-nav__count" data-count>' +
                (cards.length ? (index + 1) + ' / ' + cards.length : '0 / 0') +
              '</span>' +
            '</div>' +
            '<p class="achv-hint">Tap front to flip · swipe or side arrows to switch · tap a number to jump</p>' +
            '<div class="achv-actions">' +
              '<button type="button" class="btn btn--ghost" data-flip>' +
                I.refresh + ' Flip</button>' +
              (canSend
                ? '<button type="button" class="btn btn--accent" data-focus-send>' +
                    I.inbox + ' Send this card</button>'
                : '') +
              (tray === 'mine'
                ? '<button type="button" class="btn btn--ghost" data-focus-wallet>' +
                    I.users + ' Share wallet</button>'
                : '') +
            '</div>' +
          '</div>' +
          '<div class="achv-side">' +
            '<div class="panel" id="achv-send-panel">' +
              '<div class="panel__head"><h3>Send a card</h3></div>' +
              '<p class="t-sm t-muted" style="margin:0 0 12px">They need a Games gamertag. Accepting adds the card to their Received tray — it doesn’t unlock the achievement for them.</p>' +
              '<div class="achv-send__row">' +
                '<div class="field"><label class="field__label" for="achv-tag">Friend’s gamertag</label>' +
                  '<input class="input" id="achv-tag" maxlength="16" autocomplete="off" autocapitalize="off" ' +
                    'spellcheck="false" placeholder="e.g. MapWizard"' +
                    (canSend ? '' : ' disabled') + '></div>' +
                '<button class="btn btn--accent" type="button" data-achv-send' +
                  (canSend ? '' : ' disabled') + '>' + I.play + ' Send</button>' +
              '</div>' +
              '<div class="gt-err" id="achv-err" role="alert" style="margin-top:8px"></div>' +
              (!canSend
                ? '<p class="achv-empty" style="margin-top:10px">' +
                    (front && front.kind === 'gift'
                      ? 'Gifted cards stay in your Received tray.'
                      : front && front.kind === 'shared'
                        ? 'Shared wallets are view-only.'
                        : 'Unlock this achievement to send its card.') +
                  '</p>'
                : '') +
            '</div>' +
            '<div class="panel" id="achv-wallet-panel">' +
              '<div class="panel__head"><h3>Share wallet</h3></div>' +
              '<p class="t-sm t-muted" style="margin:0 0 12px">Send a snapshot of your unlocked cards. Friends can flip through them — it doesn’t unlock achievements or diamonds for them. Open Friend inbox from your profile menu to accept shares.</p>' +
              '<div class="achv-send__row">' +
                '<div class="field"><label class="field__label" for="achv-wallet-tag">Friend’s gamertag</label>' +
                  '<input class="input" id="achv-wallet-tag" maxlength="16" autocomplete="off" autocapitalize="off" ' +
                    'spellcheck="false" placeholder="e.g. MapWizard"' +
                    (canShareWallet ? '' : ' disabled') + '></div>' +
                '<button class="btn btn--accent" type="button" data-wallet-send' +
                  (canShareWallet ? '' : ' disabled') + '>' + I.play + ' Share</button>' +
              '</div>' +
              '<div class="gt-err" id="achv-wallet-err" role="alert" style="margin-top:8px"></div>' +
              (!canShareWallet
                ? '<p class="achv-empty" style="margin-top:10px">Unlock at least one achievement to share your wallet.</p>'
                : '<p class="achv-empty" style="margin-top:10px">Sharing ' + have + ' unlocked card' +
                    (have === 1 ? '' : 's') + '.</p>') +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    wire();
    applyFlipClass();
    if (!opts.skipUnfold) runUnfold();
    else enableFloat();
  }

  function applyFlipClass() {
    if (!hostEl) return;
    var front = W.$('.achv-card.is-front', hostEl);
    if (!front) return;
    front.classList.toggle('is-flipped', !!flipped);
  }

  function markFlipping() {
    var stack = hostEl && W.$('[data-stack]', hostEl);
    if (!stack) return;
    stack.classList.add('is-flipping');
    if (flipTimer) global.clearTimeout(flipTimer);
    flipTimer = global.setTimeout(function () {
      if (stack.isConnected) stack.classList.remove('is-flipping');
      flipTimer = null;
    }, reduceMotion ? 0 : 700);
  }

  function toggleFlip() {
    flipped = !flipped;
    markFlipping();
    applyFlipClass();
  }

  function enableFloat() {
    if (!hostEl || reduceMotion) return;
    var stack = W.$('[data-stack]', hostEl);
    if (stack) stack.classList.add('is-floating');
  }

  /* Refresh only the deck + count + rail so side panels keep focus/state. */
  function paintDeck() {
    if (!hostEl) return;
    var cards = deck();
    if (cards.length && index >= cards.length) index = cards.length - 1;
    if (index < 0) index = 0;

    var deckWrap = W.$('[data-deck]', hostEl);
    if (deckWrap) {
      deckWrap.innerHTML = stackHtml();
    }
    var count = W.$('[data-count]', hostEl);
    if (count) {
      count.textContent = cards.length ? (index + 1) + ' / ' + cards.length : '0 / 0';
    }
    var rail = W.$('[data-rail-wrap]', hostEl);
    var railNext = railHtml();
    if (rail && railNext) {
      rail.outerHTML = railNext;
    } else if (rail && !railNext) {
      rail.remove();
    } else if (!rail && railNext) {
      var stage = W.$('[data-stage]', hostEl);
      if (stage && stage.insertAdjacentHTML) {
        stage.insertAdjacentHTML('afterend', railNext);
      }
    }

    var canStep = cards.length > 1;
    W.$$('[data-prev], [data-next]', hostEl).forEach(function (b) {
      b.disabled = !canStep;
    });

    flipped = false;
    wireDeckCards();
    applyFlipClass();
    enableFloat();
    updateActionButtons();
  }

  function updateActionButtons() {
    if (!hostEl) return;
    var cards = deck();
    var front = cards[index];
    var canSend = !!(front && front.kind === 'mine' && front.unlocked);
    var actions = W.$('.achv-actions', hostEl);
    if (!actions) return;
    var focusSend = W.$('[data-focus-send]', hostEl);
    if (canSend && !focusSend) {
      /* full paint keeps send CTA in sync when unlocking mid-session is rare;
         step() uses paintDeck — rebuild actions row cheaply */
    }
    var sendBtn = W.$('[data-achv-send]', hostEl);
    var tagInput = W.$('#achv-tag', hostEl);
    if (sendBtn) sendBtn.disabled = !canSend;
    if (tagInput) tagInput.disabled = !canSend;
  }

  function runUnfold() {
    if (!hostEl) return;
    var stage = W.$('[data-stage]', hostEl);
    var stack = W.$('[data-stack]', hostEl);
    if (!stage || !stack) return;
    if (unfoldTimer) { global.clearTimeout(unfoldTimer); unfoldTimer = null; }
    if (settleTimer) { global.clearTimeout(settleTimer); settleTimer = null; }
    stack.classList.remove('is-floating');
    stage.classList.remove('is-unfolding', 'is-settling');

    if (reduceMotion || didUnfold) {
      enableFloat();
      return;
    }
    didUnfold = true;
    /* force reflow so the fan transition plays from the stacked pose */
    void stage.offsetWidth;
    stage.classList.add('is-unfolding');
    unfoldTimer = global.setTimeout(function () {
      if (!hostEl || !stage.isConnected) return;
      stage.classList.remove('is-unfolding');
      stage.classList.add('is-settling');
      settleTimer = global.setTimeout(function () {
        if (!hostEl || !stage.isConnected) return;
        stage.classList.remove('is-settling');
        enableFloat();
      }, 560);
    }, 980);
  }

  /* Bind only nodes that paintDeck() recreates (cards + rail dots). */
  function wireDeckCards() {
    W.$$('.achv-card.is-front', hostEl).forEach(function (card) {
      card.addEventListener('click', function (ev) {
        ev.stopPropagation();
        toggleFlip();
      });
      card.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          toggleFlip();
        }
      });
    });

    W.$$('.achv-card[data-offset]', hostEl).forEach(function (card) {
      if (card.classList.contains('is-front')) return;
      card.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        var off = parseInt(card.getAttribute('data-offset'), 10) || 0;
        if (off > 0) step(off);
      });
    });

    W.$$('[data-rail]', hostEl).forEach(function (dot) {
      dot.addEventListener('click', function (ev) {
        ev.preventDefault();
        goTo(parseInt(dot.getAttribute('data-rail'), 10) || 0);
      });
    });
  }

  /* Side arrows + swipe/keyboard — bound once per full paint(). */
  function wireDeckChrome() {
    W.$$('[data-prev]', hostEl).forEach(function (btn) {
      btn.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        step(-1);
      });
    });
    W.$$('[data-next]', hostEl).forEach(function (btn) {
      btn.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        step(1);
      });
    });

    var stage = W.$('[data-stage]', hostEl);
    if (stage) {
      stage.addEventListener('keydown', function (ev) {
        if (ev.key === 'ArrowLeft') { ev.preventDefault(); step(-1); }
        else if (ev.key === 'ArrowRight') { ev.preventDefault(); step(1); }
        else if (ev.key === 'f' || ev.key === 'F') { ev.preventDefault(); toggleFlip(); }
      });
      stage.addEventListener('touchstart', onSwipeStart, { passive: true });
      stage.addEventListener('touchend', onSwipeEnd, { passive: true });
      stage.addEventListener('pointerdown', onPointerDown);
      stage.addEventListener('pointerup', onPointerUp);
    }
  }

  function onSwipeStart(ev) {
    var t = ev.changedTouches && ev.changedTouches[0];
    if (!t) return;
    swipeStartX = t.clientX;
    swipeStartY = t.clientY;
  }
  function onSwipeEnd(ev) {
    var t = ev.changedTouches && ev.changedTouches[0];
    if (!t || swipeStartX == null) return;
    var dx = t.clientX - swipeStartX;
    var dy = t.clientY - swipeStartY;
    swipeStartX = null;
    swipeStartY = null;
    if (Math.abs(dx) < 42 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
    step(dx < 0 ? 1 : -1);
  }

  var ptrStartX = null;
  var ptrStartY = null;
  function onPointerDown(ev) {
    if (ev.pointerType === 'touch') return; /* touch handlers cover phones */
    if (ev.button != null && ev.button !== 0) return;
    /* ignore presses on the side nav buttons themselves */
    if (ev.target && ev.target.closest && ev.target.closest('[data-prev], [data-next], [data-rail]')) {
      return;
    }
    ptrStartX = ev.clientX;
    ptrStartY = ev.clientY;
  }
  function onPointerUp(ev) {
    if (ptrStartX == null) return;
    var dx = ev.clientX - ptrStartX;
    var dy = ev.clientY - ptrStartY;
    ptrStartX = null;
    ptrStartY = null;
    if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
    /* Don't steal a simple click-to-flip on the front card */
    if (ev.target && ev.target.closest && ev.target.closest('.achv-card.is-front')) {
      if (Math.abs(dx) < 90) return;
    }
    step(dx < 0 ? 1 : -1);
  }

  function wire() {
    W.$$('[data-tray] button', hostEl).forEach(function (b) {
      b.addEventListener('click', function () {
        tray = b.dataset.v;
        index = 0;
        flipped = false;
        if (tray === 'shared') {
          var list = lastInbox.walletShared || [];
          viewingShare = list[0] || null;
        }
        paint({ skipUnfold: true });
      });
    });

    var sharedPick = W.$('#achv-shared-pick', hostEl);
    if (sharedPick) {
      sharedPick.addEventListener('change', function () {
        var id = sharedPick.value;
        viewingShare = null;
        (lastInbox.walletShared || []).forEach(function (r) {
          if (r.id === id) viewingShare = r;
        });
        index = 0;
        flipped = false;
        paint({ skipUnfold: true });
      });
    }

    wireDeckChrome();
    wireDeckCards();

    var flipBtn = W.$('[data-flip]', hostEl);
    if (flipBtn) flipBtn.addEventListener('click', toggleFlip);

    var focusSend = W.$('[data-focus-send]', hostEl);
    if (focusSend) focusSend.addEventListener('click', function () {
      var input = W.$('#achv-tag', hostEl);
      var panel = W.$('#achv-send-panel', hostEl);
      if (panel && panel.scrollIntoView) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      if (input) input.focus();
    });

    var focusWallet = W.$('[data-focus-wallet]', hostEl);
    if (focusWallet) focusWallet.addEventListener('click', function () {
      var input = W.$('#achv-wallet-tag', hostEl);
      var panel = W.$('#achv-wallet-panel', hostEl);
      if (panel && panel.scrollIntoView) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      if (input) input.focus();
    });

    var sendBtn = W.$('[data-achv-send]', hostEl);
    if (sendBtn) sendBtn.addEventListener('click', onSend);

    var walletBtn = W.$('[data-wallet-send]', hostEl);
    if (walletBtn) walletBtn.addEventListener('click', onWalletSend);
  }

  function wireInbox(root) {
    root = root || inboxModalRoot;
    if (!root) return;
    var box = W.$('[data-friend-inbox]', root) || W.$('[data-achv-inbox]', root);
    if (!box) return;

    W.$$('[data-accept]', box).forEach(function (b) {
      b.addEventListener('click', function () {
        var row = b.closest('[data-send]');
        respond(row && row.dataset.send, true);
      });
    });
    W.$$('[data-decline]', box).forEach(function (b) {
      b.addEventListener('click', function () {
        var row = b.closest('[data-send]');
        respond(row && row.dataset.send, false);
      });
    });
    W.$$('[data-cancel]', box).forEach(function (b) {
      b.addEventListener('click', function () {
        var row = b.closest('[data-send]');
        var id = row && row.dataset.send;
        if (!id) return;
        ensureTag(function () {
          rpc('ach_card_cancel', { p_device: deviceId(), p_send: id }).then(function (res) {
            if (!res || !res.ok) {
              W.toast('Couldn’t cancel', errMsg(res && res.error), I.info, 3600);
              return;
            }
            refreshInbox();
          });
        });
      });
    });

    W.$$('[data-w-accept]', box).forEach(function (b) {
      b.addEventListener('click', function () {
        var row = b.closest('[data-wallet]');
        respondWallet(row && row.dataset.wallet, true);
      });
    });
    W.$$('[data-w-decline]', box).forEach(function (b) {
      b.addEventListener('click', function () {
        var row = b.closest('[data-wallet]');
        respondWallet(row && row.dataset.wallet, false);
      });
    });
    W.$$('[data-w-cancel]', box).forEach(function (b) {
      b.addEventListener('click', function () {
        var row = b.closest('[data-wallet]');
        var id = row && row.dataset.wallet;
        if (!id) return;
        ensureTag(function () {
          rpc('ach_wallet_cancel', { p_device: deviceId(), p_share: id }).then(function (res) {
            if (!res || !res.ok) {
              W.toast('Couldn’t cancel', errMsg(res && res.error), I.info, 3600);
              return;
            }
            refreshInbox();
          });
        });
      });
    });

    W.$$('[data-chess-accept]', box).forEach(function (b) {
      b.addEventListener('click', function () {
        var row = b.closest('[data-chess]');
        respondChess(row && row.dataset.chess, true);
      });
    });
    W.$$('[data-chess-decline]', box).forEach(function (b) {
      b.addEventListener('click', function () {
        var row = b.closest('[data-chess]');
        respondChess(row && row.dataset.chess, false);
      });
    });
    W.$$('[data-chess-cancel]', box).forEach(function (b) {
      b.addEventListener('click', function () {
        var row = b.closest('[data-chess]');
        var id = row && row.dataset.chess;
        if (!id) return;
        ensureTag(function () {
          rpc('chess_duel_cancel_invite', {
            p_device: deviceId(),
            p_invite: id
          }).then(function (res) {
            if (!res || !res.ok) {
              W.toast('Couldn’t cancel', chessErr(res && res.error), I.info, 3600);
              return;
            }
            refreshInbox();
          });
        });
      });
    });
    W.$$('[data-chess-resume]', box).forEach(function (b) {
      b.addEventListener('click', function () {
        var row = b.closest('[data-chess-active]');
        var id = row && row.getAttribute('data-chess-active');
        if (!id) return;
        openChessFromInbox(id);
      });
    });
  }

  function chessErr(code) {
    return ({
      guest: 'Sign in first.',
      offline: 'Couldn’t reach the server.',
      no_gamertag: 'Claim a gamertag in Games first.',
      not_found: 'That invite is gone.',
      gone: 'That invite expired.',
      self: 'You cannot challenge yourself.',
      already_pending: 'An invite is already pending.',
      too_many: 'Too many open invites.'
    })[code] || errMsg(code);
  }

  function openChessFromInbox(matchId) {
    if (global.UI && global.UI.closeModals) global.UI.closeModals();
    if (global.Games && global.Games.openChessMatch) {
      global.Games.openChessMatch(matchId || null);
      return;
    }
    if (global.Games && global.Games.openChessPvp && global.UI && global.UI.go) {
      global.Games.openChessPvp();
      global.UI.go('games');
    }
  }

  function respondChess(inviteId, accept) {
    if (!inviteId) return;
    ensureTag(function () {
      function once() {
        return rpc('chess_duel_respond_invite', {
          p_device: deviceId(),
          p_invite: inviteId,
          p_accept: !!accept
        });
      }
      once().then(function (res) {
        if (!res || !res.ok) {
          if (res && res.error === 'no_gamertag') {
            return ensureServerTag().then(once);
          }
          return res;
        }
        return res;
      }).then(function (res) {
        if (!res || !res.ok) {
          W.toast('Couldn’t update', chessErr(res && res.error), I.info, 3600);
          refreshInbox();
          return;
        }
        if (accept) {
          W.toast('Challenge accepted', 'Opening Geo Chess…', I.check, 2800);
          openChessFromInbox(res.match_id);
          return;
        }
        W.toast('Declined', 'Chess invite closed', I.check, 2400);
        refreshInbox();
      });
    });
  }

  function respond(sendId, accept) {
    if (!sendId) return;
    ensureTag(function () {
      rpc('ach_card_respond', {
        p_device: deviceId(),
        p_send: sendId,
        p_accept: !!accept
      }).then(function (res) {
        if (!res || !res.ok) {
          W.toast('Couldn’t update', errMsg(res && res.error), I.info, 3600);
          return;
        }
        if (accept) {
          W.toast('Card kept', (res.from_tag || 'Friend') + ' shared a card with you', I.trophy, 3600);
          tray = 'gifts';
        } else {
          W.toast('Declined', 'Invite closed', I.check, 2400);
        }
        refreshInbox(true);
      });
    });
  }

  function respondWallet(shareId, accept) {
    if (!shareId) return;
    ensureTag(function () {
      rpc('ach_wallet_respond', {
        p_device: deviceId(),
        p_share: shareId,
        p_accept: !!accept
      }).then(function (res) {
        if (!res || !res.ok) {
          W.toast('Couldn’t update', errMsg(res && res.error), I.info, 3600);
          return;
        }
        if (accept) {
          W.toast('Wallet kept', (res.from_tag || 'Friend') + ' shared their wallet', I.trophy, 3600);
          tray = 'shared';
          viewingShare = null;
        } else {
          W.toast('Declined', 'Wallet invite closed', I.check, 2400);
        }
        refreshInbox(true);
      });
    });
  }

  function onSend() {
    var cards = deck();
    var front = cards[index];
    var err = W.$('#achv-err', hostEl);
    var input = W.$('#achv-tag', hostEl);
    if (err) err.textContent = '';
    if (!front || front.kind !== 'mine' || !front.unlocked) {
      if (err) err.textContent = errMsg('locked');
      return;
    }
    if (!signedIn()) {
      if (global.UI && global.UI.openAuth) global.UI.openAuth('signin');
      if (err) err.textContent = errMsg('guest');
      return;
    }
    var tag = ((input && input.value) || '').trim();
    ensureTag(function () {
      sendCard(tag, front.ach.id).then(function (res) {
        if (!res || !res.ok) {
          if (res && res.error === 'no_gamertag') {
            ensureServerTag().then(function () { return sendCard(tag, front.ach.id); })
              .then(function (retry) {
                if (!retry || !retry.ok) {
                  if (err) err.textContent = errMsg(retry && retry.error);
                  return;
                }
                afterSent(retry, tag, input, err);
              });
            return;
          }
          if (err) err.textContent = errMsg(res && res.error);
          return;
        }
        afterSent(res, tag, input, err);
      });
    });
  }

  function onWalletSend() {
    var err = W.$('#achv-wallet-err', hostEl);
    var input = W.$('#achv-wallet-tag', hostEl);
    if (err) err.textContent = '';
    if (!haveIds().length) {
      if (err) err.textContent = errMsg('invalid_wallet');
      return;
    }
    if (!signedIn()) {
      if (global.UI && global.UI.openAuth) global.UI.openAuth('signin');
      if (err) err.textContent = errMsg('guest');
      return;
    }
    var tag = ((input && input.value) || '').trim();
    ensureTag(function () {
      sendWallet(tag).then(function (res) {
        if (!res || !res.ok) {
          if (res && res.error === 'no_gamertag') {
            ensureServerTag().then(function () { return sendWallet(tag); })
              .then(function (retry) {
                if (!retry || !retry.ok) {
                  if (err) err.textContent = errMsg(retry && retry.error);
                  return;
                }
                afterWalletSent(retry, tag, input, err);
              });
            return;
          }
          if (err) err.textContent = errMsg(res && res.error);
          return;
        }
        afterWalletSent(res, tag, input, err);
      });
    });
  }

  function afterSent(res, tag, input, err) {
    W.toast('Card sent', 'Waiting for ' + (res.to_tag || tag) + '…', I.check, 3600);
    if (input) input.value = '';
    if (err) err.textContent = '';
    refreshInbox();
  }

  function afterWalletSent(res, tag, input, err) {
    W.toast('Wallet shared', 'Waiting for ' + (res.to_tag || tag) + '…', I.check, 3600);
    if (input) input.value = '';
    if (err) err.textContent = '';
    refreshInbox();
  }

  function step(dir) {
    var cards = deck();
    if (!cards.length || cards.length < 2) return;
    index = (index + dir + cards.length) % cards.length;
    flipped = false;
    paintDeck();
  }

  function goTo(i) {
    var cards = deck();
    if (!cards.length) return;
    var next = Math.max(0, Math.min(cards.length - 1, i | 0));
    if (next === index) return;
    index = next;
    flipped = false;
    paintDeck();
  }

  function paintInboxModal() {
    if (!inboxModalRoot || !inboxModalRoot.isConnected) return;
    var box = W.$('[data-friend-inbox]', inboxModalRoot);
    if (!box) return;
    box.innerHTML = inboxHtml();
    wireInbox(inboxModalRoot);
  }

  function refreshInbox(fullPaint) {
    return fetchInbox().then(function () {
      paintInboxModal();
      if (!hostEl || !hostEl.isConnected) return;
      if (fullPaint) { paint({ skipUnfold: true }); return; }
      var trayBtns = W.$$('[data-tray] button', hostEl);
      trayBtns.forEach(function (b) {
        if (b.dataset.v === 'gifts') {
          b.textContent = 'Received' +
            ((lastInbox.received || []).length ? ' · ' + lastInbox.received.length : '');
        }
        if (b.dataset.v === 'shared') {
          var n = (lastInbox.walletShared || []).length;
          b.textContent = 'Friends' + (n ? ' · ' + n : '');
        }
      });
    });
  }

  function startPolling() {
    stopPolling();
    if (!signedIn()) return;
    pollTimer = global.setInterval(function () {
      if (!hostEl || !hostEl.isConnected) { stopPolling(); return; }
      refreshInbox(false);
    }, 12000);
  }

  function stopPolling() {
    if (pollTimer) { global.clearInterval(pollTimer); pollTimer = null; }
  }

  function stopInboxModalPoll() {
    if (inboxModalPoll) { global.clearInterval(inboxModalPoll); inboxModalPoll = null; }
  }

  function onChessInboxEvent(ev) {
    applyChessBox(ev && ev.detail);
    paintInboxModal();
  }

  function openFriendInbox() {
    if (global.SchoolDashboard && global.SchoolDashboard.featureBlocked &&
        global.SchoolDashboard.featureBlocked('messaging')) return;
    if (!(global.SchoolDashboard && global.SchoolDashboard.outsideOnly &&
          global.SchoolDashboard.outsideOnly())) {
      if (global.Premium && global.Premium.blockStudentMessaging &&
          global.Premium.blockStudentMessaging()) return;
    }
    if (!global.UI || !global.UI.modal) return;
    if (inboxModalRoot && inboxModalRoot.isConnected) {
      paintInboxModal();
      return;
    }
    stopInboxModalPoll();
    global.UI.modal({
      title: 'Friend inbox',
      icon: I.inbox,
      wide: true,
      body:
        '<p class="t-sm t-muted" style="margin:0 0 14px">Card gifts, wallet shares, and Geo Chess challenges in one place.</p>' +
        '<div class="panel" style="padding:12px">' +
          '<div data-friend-inbox data-achv-inbox>' + inboxHtml() + '</div>' +
        '</div>',
      actions: [{ label: 'Done', cls: 'btn--ghost', close: true }],
      onMount: function (root) {
        inboxModalRoot = root;
        if (!chessInboxListener) {
          chessInboxListener = onChessInboxEvent;
          global.addEventListener('learngeo:chess-duel-inbox', chessInboxListener);
        }
        wireInbox(root);
        fetchInbox().then(paintInboxModal);
        stopInboxModalPoll();
        inboxModalPoll = global.setInterval(function () {
          if (!inboxModalRoot || !inboxModalRoot.isConnected) {
            stopInboxModalPoll();
            return;
          }
          refreshInbox(false);
        }, 8000);
      },
      onClose: function () {
        stopInboxModalPoll();
        inboxModalRoot = null;
        if ((!hostEl || !hostEl.isConnected) && chessInboxListener) {
          global.removeEventListener('learngeo:chess-duel-inbox', chessInboxListener);
          chessInboxListener = null;
        }
      }
    });
  }

  /* ============================ public ============================ */
  function start() {
    hostEl = document.getElementById('view-achievements');
    if (!hostEl) return;
    index = 0;
    flipped = false;
    tray = 'mine';
    viewingShare = null;
    didUnfold = false;
    if (unfoldTimer) { global.clearTimeout(unfoldTimer); unfoldTimer = null; }
    if (settleTimer) { global.clearTimeout(settleTimer); settleTimer = null; }
    if (flipTimer) { global.clearTimeout(flipTimer); flipTimer = null; }
    /* Fast first paint without anim, then one unfold after inbox lands
       so a second paint does not tear down the fan-out mid-flight. */
    paint({ skipUnfold: true });
    fetchInbox().then(function () {
      didUnfold = false;
      paint();
      startPolling();
    });
  }

  function stop() {
    stopPolling();
    if ((!inboxModalRoot || !inboxModalRoot.isConnected) && chessInboxListener) {
      global.removeEventListener('learngeo:chess-duel-inbox', chessInboxListener);
      chessInboxListener = null;
    }
    if (unfoldTimer) { global.clearTimeout(unfoldTimer); unfoldTimer = null; }
    if (settleTimer) { global.clearTimeout(settleTimer); settleTimer = null; }
    if (flipTimer) { global.clearTimeout(flipTimer); flipTimer = null; }
    hostEl = null;
  }

  function pendingCount() {
    return (lastInbox.incoming || []).length +
      (lastInbox.walletIncoming || []).length +
      (lastInbox.chessIncoming || []).length;
  }

  global.AchievementCards = {
    start: start,
    stop: stop,
    pendingCount: pendingCount,
    openFriendInbox: openFriendInbox,
    refresh: function () { return refreshInbox(true); }
  };
})(window);
