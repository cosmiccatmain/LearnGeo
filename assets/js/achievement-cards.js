/* ------------------------------------------------------------------
   LearnGeo — Achievement cards (LEA-64)

   Credit-card-style stack with flip. Unlocked Cosmetics.achievements
   can be sent to a classmate by gamertag (school-safe; no money).
   Server: supabase/deployed/0023_achievement_cards.sql.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons;
  var esc = W.escapeHtml;
  var hostEl = null;
  var index = 0;
  var flipped = false;
  var lastInbox = { incoming: [], outgoing: [], received: [] };
  var pollTimer = null;
  var tray = 'mine'; /* mine | gifts */

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

  function deck() {
    return tray === 'gifts' ? giftCards() : mineCards();
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
      not_found: 'No player with that gamertag.',
      self: 'You can’t send a card to yourself.',
      no_gamertag: 'Claim a gamertag in Games → Leaderboards first.',
      too_many: 'You already have several pending sends. Wait a bit.',
      already_pending: 'You already sent that card to them.',
      locked: 'Unlock this achievement before you can send it.',
      guest: 'Sign in to send cards to classmates.'
    })[code] || 'Please try again.';
  }

  /* ============================ RPC =============================== */
  function fetchInbox() {
    var id = deviceId();
    if (!id || !signedIn()) {
      lastInbox = { incoming: [], outgoing: [], received: [] };
      return Promise.resolve(lastInbox);
    }
    return rpc('ach_card_list_inbox', { p_device: id }).then(function (data) {
      if (data && data.ok) {
        lastInbox = {
          incoming: data.incoming || [],
          outgoing: data.outgoing || [],
          received: data.received || []
        };
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

  /* ============================ paint ============================= */
  function cardFaceHtml(card, depth) {
    var a = card.ach;
    var unlocked = !!card.unlocked;
    var gift = card.kind === 'gift';
    var faceCls = 'achv-card__face achv-card__face--front' +
      (unlocked ? '' : ' is-locked') + (gift ? ' is-gift' : '');
    var eyebrow = gift
      ? ('From ' + esc(card.fromTag || 'friend'))
      : (unlocked ? 'Achievement' : 'Locked');
    var reward = unlocked
      ? ('+' + a.reward + ' 💎')
      : 'Locked';
    return '' +
      '<button type="button" class="achv-card' + (depth === 0 ? ' is-front' : '') + '"' +
        ' data-depth="' + (depth > 3 ? 'n' : depth) + '"' +
        ' data-card="' + esc(card.id) + '"' +
        ' aria-label="' + esc(a.name) + (unlocked ? '' : ' (locked)') + '">' +
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
            '<div class="achv-card__brand-sub">' +
              (gift
                ? 'A classmate shared this achievement card with you.'
                : 'Tap to flip · send unlocked cards to friends by gamertag.') +
            '</div>' +
          '</div>' +
        '</div>' +
      '</button>';
  }

  function stackHtml() {
    var cards = deck();
    if (!cards.length) {
      return '<div class="empty">No cards here yet.</div>';
    }
    if (index >= cards.length) index = cards.length - 1;
    if (index < 0) index = 0;
    var layers = [];
    for (var d = 0; d < Math.min(4, cards.length); d++) {
      var ci = (index + d) % cards.length;
      layers.push(cardFaceHtml(cards[ci], d));
    }
    return '<div class="achv-stack" data-stack>' + layers.join('') + '</div>';
  }

  function inboxHtml() {
    var inc = lastInbox.incoming || [];
    var out = lastInbox.outgoing || [];
    var parts = [];

    if (!signedIn()) {
      return '<p class="achv-empty">Sign in and claim a gamertag to send or receive cards.</p>';
    }
    if (!inc.length && !out.length) {
      parts.push('<p class="achv-empty">No pending card sends.</p>');
    }
    inc.forEach(function (row) {
      var a = findAch(row.achievement_id);
      parts.push(
        '<div class="achv-inbox__row" data-send="' + esc(row.id) + '">' +
          '<div class="grow"><b>' + esc((a && a.name) || row.achievement_id) + '</b>' +
            '<span>From ' + esc(row.from_tag || 'friend') + '</span></div>' +
          '<div class="achv-inbox__acts">' +
            '<button type="button" class="btn btn--accent btn--sm" data-accept>Keep</button>' +
            '<button type="button" class="btn btn--ghost btn--sm" data-decline>No thanks</button>' +
          '</div>' +
        '</div>'
      );
    });
    out.forEach(function (row) {
      var a = findAch(row.achievement_id);
      parts.push(
        '<div class="achv-inbox__row" data-send="' + esc(row.id) + '">' +
          '<div class="grow"><b>' + esc((a && a.name) || row.achievement_id) + '</b>' +
            '<span>Waiting on ' + esc(row.to_tag || 'friend') + '</span></div>' +
          '<div class="achv-inbox__acts">' +
            '<button type="button" class="btn btn--ghost btn--sm" data-cancel>Cancel</button>' +
          '</div>' +
        '</div>'
      );
    });
    return '<div class="achv-inbox__list">' + parts.join('') + '</div>';
  }

  function paint() {
    if (!hostEl) return;
    var cards = deck();
    var have = haveIds().length;
    var total = catalog().length;
    var front = cards[index];
    var canSend = !!(front && front.kind === 'mine' && front.unlocked);

    hostEl.innerHTML =
      '<div class="achv">' +
        '<div class="achv__hero">' +
          '<div>' +
            '<div class="eyebrow">Collection</div>' +
            '<h1>Achievement cards</h1>' +
            '<p>Flip through your stack like a deck of cards. Send unlocked ones to classmates by gamertag — school-safe, no real money.</p>' +
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
            '<div class="seg" data-tray style="margin-bottom:12px;max-width:280px">' +
              '<button type="button" data-v="mine"' + (tray === 'mine' ? ' class="is-active"' : '') + '>My cards</button>' +
              '<button type="button" data-v="gifts"' + (tray === 'gifts' ? ' class="is-active"' : '') +
                '>Received' +
                ((lastInbox.received || []).length
                  ? ' · ' + lastInbox.received.length
                  : '') +
              '</button>' +
            '</div>' +
            '<div class="achv-stage" data-stage>' + stackHtml() + '</div>' +
            '<div class="achv-nav">' +
              '<button type="button" class="btn btn--ghost btn--sm" data-prev aria-label="Previous card">' +
                I.arrowL + '</button>' +
              '<span class="achv-nav__count">' +
                (cards.length ? (index + 1) + ' / ' + cards.length : '0 / 0') +
              '</span>' +
              '<button type="button" class="btn btn--ghost btn--sm" data-next aria-label="Next card">' +
                I.arrowR + '</button>' +
            '</div>' +
            '<p class="achv-hint">Tap the front card to flip · use arrows to cycle the stack</p>' +
            '<div class="achv-actions">' +
              '<button type="button" class="btn btn--ghost" data-flip>' +
                I.refresh + ' Flip</button>' +
              (canSend
                ? '<button type="button" class="btn btn--accent" data-focus-send>' +
                    I.inbox + ' Send this card</button>'
                : '') +
            '</div>' +
          '</div>' +
          '<div class="achv-side">' +
            '<div class="panel" id="achv-send-panel">' +
              '<div class="panel__head"><h3>Send to a friend</h3></div>' +
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
                      : 'Unlock this achievement to send its card.') +
                  '</p>'
                : '') +
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
  }

  function applyFlipClass() {
    if (!hostEl) return;
    var front = W.$('.achv-card.is-front', hostEl);
    if (!front) return;
    front.classList.toggle('is-flipped', !!flipped);
  }

  function wire() {
    W.$$('[data-tray] button', hostEl).forEach(function (b) {
      b.addEventListener('click', function () {
        tray = b.dataset.v;
        index = 0;
        flipped = false;
        paint();
      });
    });

    var prev = W.$('[data-prev]', hostEl);
    var next = W.$('[data-next]', hostEl);
    if (prev) prev.addEventListener('click', function () { step(-1); });
    if (next) next.addEventListener('click', function () { step(1); });

    var flipBtn = W.$('[data-flip]', hostEl);
    if (flipBtn) flipBtn.addEventListener('click', function () {
      flipped = !flipped;
      applyFlipClass();
    });

    var focusSend = W.$('[data-focus-send]', hostEl);
    if (focusSend) focusSend.addEventListener('click', function () {
      var input = W.$('#achv-tag', hostEl);
      var panel = W.$('#achv-send-panel', hostEl);
      if (panel && panel.scrollIntoView) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      if (input) input.focus();
    });

    W.$$('.achv-card.is-front', hostEl).forEach(function (card) {
      card.addEventListener('click', function () {
        flipped = !flipped;
        applyFlipClass();
      });
    });

    var sendBtn = W.$('[data-achv-send]', hostEl);
    if (sendBtn) sendBtn.addEventListener('click', onSend);

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

  function afterSent(res, tag, input, err) {
    W.toast('Card sent', 'Waiting for ' + (res.to_tag || tag) + '…', I.check, 3600);
    if (input) input.value = '';
    if (err) err.textContent = '';
    refreshInbox();
  }

  function step(dir) {
    var cards = deck();
    if (!cards.length) return;
    index = (index + dir + cards.length) % cards.length;
    flipped = false;
    paint();
  }

  function refreshInbox(fullPaint) {
    return fetchInbox().then(function () {
      if (fullPaint || !hostEl) { paint(); return; }
      var box = W.$('[data-achv-inbox]', hostEl);
      if (box) {
        box.innerHTML = inboxHtml();
        wireInbox();
      }
      /* refresh Received tab count without losing focus unnecessarily */
      var trayBtns = W.$$('[data-tray] button', hostEl);
      trayBtns.forEach(function (b) {
        if (b.dataset.v === 'gifts') {
          b.textContent = 'Received' +
            ((lastInbox.received || []).length ? ' · ' + lastInbox.received.length : '');
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
    paint();
    fetchInbox().then(function () { paint(); startPolling(); });
  }

  function stop() {
    stopPolling();
    hostEl = null;
  }

  function pendingCount() {
    return (lastInbox.incoming || []).length;
  }

  global.AchievementCards = {
    start: start,
    stop: stop,
    pendingCount: pendingCount,
    refresh: function () { return refreshInbox(true); }
  };
})(window);
