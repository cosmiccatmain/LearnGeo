/* ------------------------------------------------------------------
   LearnGeo — Achievement cards (LEA-64 / LEA-67)

   Credit-card-style stack with flip. Unlocked Cosmetics.achievements
   can be sent to a classmate by gamertag (school-safe; no money).
   LEA-67: fix Chromium button 3D flatten, float + wallet unfold,
   share whole wallet by gamertag.
   Server: supabase/deployed/0023_achievement_cards.sql
           + 0025_achievement_wallet_share.sql
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons;
  var esc = W.escapeHtml;
  var hostEl = null;
  var index = 0;
  var flipped = false;
  var lastInbox = {
    incoming: [], outgoing: [], received: [],
    walletIncoming: [], walletOutgoing: [], walletShared: []
  };
  var pollTimer = null;
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
        unlocked: true,
        ach: a
      };
    });
  }

  function mineCards() {
    var have = haveIds();
    return catalog().map(function (a) {
      return {
        kind: 'mine',
        id: a.id,
        unlocked: have.indexOf(a.id) !== -1,
        ach: a
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

  /* ============================ RPC =============================== */
  function fetchInbox() {
    var id = deviceId();
    if (!id || !signedIn()) {
      lastInbox = {
        incoming: [], outgoing: [], received: [],
        walletIncoming: [], walletOutgoing: [], walletShared: []
      };
      return Promise.resolve(lastInbox);
    }
    return Promise.all([
      rpc('ach_card_list_inbox', { p_device: id }),
      rpc('ach_wallet_list', { p_device: id })
    ]).then(function (both) {
      var cards = both[0];
      var wallets = both[1];
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
      return lastInbox;
    });
  }

  function sendCard(tag, achievementId) {
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
    return rpc('pvp_lookup_tag', { p_tag: tag }).then(function (rows) {
      if (rows && rows.ok === false) return rows;
      var row = Array.isArray(rows) ? rows[0] : rows;
      var found = !!(row && (row.found === true || row.found === 't' || row.gamertag));
      if (!found) return { ok: false, error: 'not_found' };
      return rpc('ach_card_send', {
        p_device: deviceId(),
        p_to_tag: tag,
        p_achievement_id: achievementId
      });
    });
  }

  function sendWallet(tag) {
    if (!signedIn()) return Promise.resolve({ ok: false, error: 'guest' });
    if (!tag || !/^[A-Za-z0-9_]{3,16}$/.test(tag)) {
      return Promise.resolve({ ok: false, error: 'invalid_tag' });
    }
    if (myTag() && tag.toLowerCase() === myTag().toLowerCase()) {
      return Promise.resolve({ ok: false, error: 'self' });
    }
    var unlocked = haveIds().slice();
    if (!unlocked.length) return Promise.resolve({ ok: false, error: 'invalid_wallet' });
    return rpc('pvp_lookup_tag', { p_tag: tag }).then(function (rows) {
      if (rows && rows.ok === false) return rows;
      var row = Array.isArray(rows) ? rows[0] : rows;
      var found = !!(row && (row.found === true || row.found === 't' || row.gamertag));
      if (!found) return { ok: false, error: 'not_found' };
      return rpc('ach_wallet_share', {
        p_device: deviceId(),
        p_to_tag: tag,
        p_card_ids: unlocked
      });
    });
  }

  /* ============================ paint ============================= */
  function cardFaceHtml(card, depth) {
    var a = card.ach;
    var unlocked = !!card.unlocked;
    var gift = card.kind === 'gift';
    var shared = card.kind === 'shared';
    var faceCls = 'achv-card__face achv-card__face--front' +
      (unlocked ? '' : ' is-locked') +
      (gift ? ' is-gift' : '') +
      (shared ? ' is-shared' : '');
    var eyebrow = gift
      ? ('From ' + esc(card.fromTag || 'friend'))
      : shared
        ? ('Wallet · ' + esc(card.fromTag || 'friend'))
        : (unlocked ? 'Achievement' : 'Locked');
    var reward = unlocked
      ? ('+' + a.reward + ' 💎')
      : 'Locked';
    var backCopy = gift
      ? 'A classmate shared this achievement card with you.'
      : shared
        ? 'Peeking at a friend’s achievement wallet.'
        : 'Tap to flip · send unlocked cards to friends by gamertag.';
    /* div[role=button]: native <button> flattens preserve-3d in Chromium */
    var depthAttr = depth > 3 ? 'n' : String(depth);
    return '' +
      '<div role="button" tabindex="' + (depth === 0 ? '0' : '-1') + '" class="achv-card' +
        (depth === 0 ? ' is-front' : '') + '"' +
        ' data-depth="' + depthAttr + '"' +
        ' data-offset="' + depth + '"' +
        ' data-card="' + esc(card.id) + '"' +
        ' aria-label="' + esc(a.name) + (unlocked ? '' : ' (locked)') +
        (depth === 0 ? '' : ' · next in stack') + '">' +
        '<div class="achv-card__inner">' +
          '<div class="' + faceCls + '">' +
            '<div class="achv-card__chip" aria-hidden="true"></div>' +
            '<div class="achv-card__eyebrow">' + eyebrow + '</div>' +
            '<div class="achv-card__name">' + esc(a.name) + '</div>' +
            '<div class="achv-card__desc">' +
              esc(unlocked ? a.desc : 'Keep exploring to unlock this card.') +
            '</div>' +
            '<div class="achv-card__foot">' +
              '<span class="achv-card__reward">' + reward + '</span>' +
              '<span class="mono" style="font-size:11px;opacity:.65">' +
                (unlocked ? I.check : I.lock) +
              '</span>' +
            '</div>' +
          '</div>' +
          '<div class="achv-card__face achv-card__face--back">' +
            '<div class="achv-card__brand">LearnGeo</div>' +
            '<div class="achv-card__brand-sub">' + backCopy + '</div>' +
          '</div>' +
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
    var parts = [];

    if (!signedIn()) {
      return '<p class="achv-empty">Sign in and claim a gamertag to send or receive cards.</p>';
    }
    if (!inc.length && !out.length && !wInc.length && !wOut.length) {
      parts.push('<p class="achv-empty">No pending card or wallet shares.</p>');
    }
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
    var total = catalog().length;
    var front = cards[index];
    var canSend = !!(front && front.kind === 'mine' && front.unlocked);
    var canShareWallet = have > 0;
    var sharedN = (lastInbox.walletShared || []).length;

    hostEl.innerHTML =
      '<div class="achv">' +
        '<div class="achv__hero">' +
          '<div>' +
            '<div class="eyebrow">Collection</div>' +
            '<h1>Achievement wallet</h1>' +
            '<p>Flip through your stack like a deck of cards. Send unlocked ones — or share your whole wallet — with classmates by gamertag. School-safe, no real money.</p>' +
          '</div>' +
          '<div class="achv__stats">' +
            '<span class="chip mono">' + have + ' / ' + total + ' unlocked</span>' +
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
              '<p class="t-sm t-muted" style="margin:0 0 12px">Send a snapshot of your unlocked cards. Friends can flip through them — it doesn’t unlock achievements or diamonds for them.</p>' +
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
            '<div class="panel">' +
              '<div class="panel__head"><h3>Inbox</h3></div>' +
              '<div data-achv-inbox>' + inboxHtml() + '</div>' +
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

    wireInbox();
  }

  function wireInbox() {
    var box = W.$('[data-achv-inbox]', hostEl);
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

  function refreshInbox(fullPaint) {
    return fetchInbox().then(function () {
      if (fullPaint || !hostEl) { paint({ skipUnfold: true }); return; }
      var box = W.$('[data-achv-inbox]', hostEl);
      if (box) {
        box.innerHTML = inboxHtml();
        wireInbox();
      }
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
    if (unfoldTimer) { global.clearTimeout(unfoldTimer); unfoldTimer = null; }
    if (settleTimer) { global.clearTimeout(settleTimer); settleTimer = null; }
    if (flipTimer) { global.clearTimeout(flipTimer); flipTimer = null; }
    hostEl = null;
  }

  function pendingCount() {
    return (lastInbox.incoming || []).length + (lastInbox.walletIncoming || []).length;
  }

  global.AchievementCards = {
    start: start,
    stop: stop,
    pendingCount: pendingCount,
    refresh: function () { return refreshInbox(true); }
  };
})(window);
