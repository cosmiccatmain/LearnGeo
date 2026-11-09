/* ------------------------------------------------------------------
   LearnGeo — Geo Duel (PvP)

   Invite a friend by gamertag. They get a pending invite, accept or
   decline, then you both play the same five geography questions at once.
   Correct + faster wins the round. First to the better score wins the
   match. Server: supabase/deployed/0014_pvp_geo_duel.sql (+ 0017 join flow).
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons;
  var esc = W.escapeHtml;
  var ROUND_N = 5;
  var KINDS = [['flags', 'Flags'], ['capitals', 'Capitals'], ['mix', 'Mix']];
  var seenInvite = {};
  var pollTimer = null;
  var lastInbox = { incoming: [], outgoing: [], active: null };

  function sb() { return global.Cloud && global.Cloud.sb; }
  function deviceId() {
    return global.GameBoards && global.GameBoards.deviceId
      ? global.GameBoards.deviceId()
      : (W.state.deviceId || '');
  }
  function myTag() { return (W.state.gamertag || ''); }

  function rpc(name, args) {
    var c = sb();
    if (!c) return Promise.resolve({ ok: false, error: 'offline' });
    return c.rpc(name, args).then(function (res) {
      if (res && res.error) return { ok: false, error: 'offline', message: res.error.message };
      return res.data || { ok: false, error: 'offline' };
    }, function () { return { ok: false, error: 'offline' }; });
  }

  /* Local tags can exist before the device row is on the server (offline
     claim, wiped gamertags, etc.). Re-claim so invite RPCs find us. */
  function ensureServerTag() {
    var tag = myTag();
    var id = deviceId();
    if (!tag || !id) return Promise.resolve(false);
    var c = sb();
    if (!c) return Promise.resolve(false);
    return c.rpc('claim_gamertag', { p_device: id, p_tag: tag }).then(function (res) {
      if (res && res.error) return false;
      /* 'taken' means another device owns the name — this device is still
         unregistered for PvP. Only 'ok' (including rename) counts. */
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
      W.toast('Pick a gamertag', 'Open Leaderboards once to claim a name first.', I.gamepad, 4200);
    }
  }

  function equippedDuelAccent() {
    var Cos = global.Cosmetics;
    if (!Cos || !Cos.duelAccents) {
      return { accent: '#1B4DFF', soft: 'rgba(27,77,255,.08)' };
    }
    var id = (W.state && W.state.profile && W.state.profile.duelAccent) || 'brand';
    var item = Cos.find(Cos.duelAccents, id);
    if (!item || !item.accent) return Cos.find(Cos.duelAccents, 'brand');
    return item;
  }

  function applyDuelAccent(el) {
    if (!el) return;
    var theme = equippedDuelAccent();
    el.style.setProperty('--duel-accent', theme.accent || '#1B4DFF');
    el.style.setProperty('--duel-accent-soft', theme.soft || 'rgba(27,77,255,.08)');
  }

  /* Postgres sometimes emits offsets Date.parse rejects ("...123456+00").
     A failed parse froze the round clock on 18s. */
  function parseTs(v) {
    if (v == null || v === '') return 0;
    if (typeof v === 'number' && isFinite(v)) return v;
    var s = String(v).trim();
    var t = Date.parse(s);
    if (t) return t;
    var fixed = s.replace(/([+-]\d{2})$/, '$1:00').replace(' ', 'T');
    t = Date.parse(fixed);
    return t || 0;
  }

  function inboxSignature(box) {
    box = box || lastInbox;
    function ids(list) {
      return (list || []).map(function (inv) {
        return inv && inv.id ? String(inv.id) : '';
      }).join(',');
    }
    var act = '';
    if (box.active && box.active.id) {
      act = [
        box.active.id,
        box.active.status || '',
        box.active.current_round,
        box.active.host_score,
        box.active.guest_score
      ].join(':');
    }
    return ids(box.incoming) + '|' + ids(box.outgoing) + '|' + act;
  }

  /* ========================= question pack ======================== */
  function typeFor(kind, c) {
    if (kind === 'flags') return c.flag ? (Math.random() < 0.5 ? 'flag' : 'flagpick') : 'capital';
    if (kind === 'capitals') return Math.random() < 0.5 ? 'capital' : 'country';
    var roll = Math.random();
    if (c.flag && roll < 0.34) return 'flag';
    if (c.flag && roll < 0.5) return 'flagpick';
    return roll < 0.75 ? 'capital' : 'country';
  }

  function buildRounds(cfg, kind) {
    var pool = global.StudyFilters.pool(cfg);
    if (pool.length < 8) pool = pool.concat(global.Quiz.pool({ scope: 'all' }));
    pool = W.shuffle(pool.slice());
    var all = global.Quiz.pool({ scope: 'all' });
    var out = [];
    var i = 0;
    while (out.length < ROUND_N && i < pool.length + ROUND_N) {
      var c = pool[i % pool.length];
      i += 1;
      if (!c) break;
      var q = global.Quiz.make(typeFor(kind, c), c, all, { typed: false });
      if (!q || !q.choices || q.choices.length < 2) continue;
      var correct = 0;
      for (var j = 0; j < q.choices.length; j++) if (q.choices[j].correct) { correct = j; break; }
      out.push({
        type: q.type,
        country: c.name,
        prompt: q.prompt,
        subject: q.subject,
        sub: q.sub || '',
        flag: q.flag || null,
        flag_choices: !!q.flagChoices,
        choices: q.choices.map(function (ch) {
          return { text: ch.text, flag: ch.flag || null };
        }),
        correct_idx: correct
      });
    }
    return out;
  }

  /* ============================ inbox ============================= */
  function fetchInbox() {
    var id = deviceId();
    if (!id || !myTag()) return Promise.resolve(lastInbox);
    return rpc('pvp_list_inbox', { p_device: id }).then(function (data) {
      if (!data || !data.ok) return lastInbox;
      lastInbox = {
        incoming: data.incoming || [],
        outgoing: data.outgoing || [],
        active: data.active || null
      };
      notifyIncoming(lastInbox.incoming);
      return lastInbox;
    });
  }

  function notifyIncoming(list) {
    (list || []).forEach(function (inv) {
      if (!inv || !inv.id || seenInvite[inv.id]) return;
      seenInvite[inv.id] = true;
      W.toast(
        'Geo Duel invite',
        (inv.from_tag || 'Someone') + ' challenged you. Open Geo Duel to accept.',
        I.gamepad,
        6500
      );
    });
  }

  function inboxTick() {
    if (!myTag()) return;
    fetchInbox().then(function (box) {
      global.dispatchEvent(new CustomEvent('learngeo:pvp-inbox', { detail: box }));
    });
  }

  function startWatching() {
    if (pollTimer) return;
    /* 2s so a host waiting on an invite joins promptly after accept. */
    pollTimer = setInterval(inboxTick, 2000);
    setTimeout(function () { if (myTag()) inboxTick(); }, 800);
  }

  /* ========================= setup helpers ======================== */
  function inboxHtml(box) {
    box = box || lastInbox;
    var parts = [];
    if (box.active) {
      parts.push(
        '<div class="duel-note duel-note--live">' +
          '<div><b>Match in progress</b><span>vs ' +
          esc(box.active.host_tag === myTag() ? box.active.guest_tag : box.active.host_tag) +
          ' · ' + esc(String(box.active.host_score)) + '–' + esc(String(box.active.guest_score)) +
          '</span></div>' +
          '<button class="btn btn--accent btn--sm" type="button" data-duel-resume="' +
          esc(box.active.id) + '">Rejoin</button></div>'
      );
    }
    (box.incoming || []).forEach(function (inv) {
      parts.push(
        '<div class="duel-note">' +
          '<div><b>' + esc(inv.from_tag || '?') + '</b><span>wants to duel</span></div>' +
          '<div class="duel-note__actions">' +
            '<button class="btn btn--accent btn--sm" type="button" data-duel-accept="' + esc(inv.id) + '">Accept</button>' +
            '<button class="btn btn--ghost btn--sm" type="button" data-duel-decline="' + esc(inv.id) + '">Decline</button>' +
          '</div></div>'
      );
    });
    (box.outgoing || []).forEach(function (inv) {
      parts.push(
        '<div class="duel-note duel-note--out">' +
          '<div><b>Waiting on ' + esc(inv.to_tag || '?') + '</b><span>Invite pending</span></div>' +
          '<button class="btn btn--ghost btn--sm" type="button" data-duel-cancel="' + esc(inv.id) + '">Cancel</button></div>'
      );
    });
    if (!parts.length) {
      parts.push('<p class="duel-empty t-sm t-muted">No invites yet. Challenge a friend by their gamertag.</p>');
    }
    return parts.join('');
  }

  function wireInbox(el, onMatch) {
    function refresh() {
      fetchInbox().then(function () {
        var host = W.$('[data-duel-inbox]', el);
        if (host) host.innerHTML = inboxHtml(lastInbox);
        wireInbox(el, onMatch);
      });
    }
    W.$$('[data-duel-accept]', el).forEach(function (b) {
      b.addEventListener('click', function () {
        ensureTag(function () {
          function acceptOnce() {
            return rpc('pvp_respond_invite', {
              p_device: deviceId(), p_invite: b.getAttribute('data-duel-accept'), p_accept: true
            });
          }
          acceptOnce().then(function (res) {
            if (!res.ok && res.error === 'no_gamertag') {
              return ensureServerTag().then(acceptOnce);
            }
            return res;
          }).then(function (res) {
            if (!res || !res.ok) {
              W.toast('Could not accept', errMsg(res && res.error), I.info, 3600);
              return refresh();
            }
            W.toast('Challenge accepted', 'Starting Geo Duel…', I.check, 2800);
            if (onMatch) onMatch(res.match_id);
          });
        });
      });
    });
    W.$$('[data-duel-decline]', el).forEach(function (b) {
      b.addEventListener('click', function () {
        rpc('pvp_respond_invite', {
          p_device: deviceId(), p_invite: b.getAttribute('data-duel-decline'), p_accept: false
        }).then(function () { refresh(); });
      });
    });
    W.$$('[data-duel-cancel]', el).forEach(function (b) {
      b.addEventListener('click', function () {
        rpc('pvp_cancel_invite', {
          p_device: deviceId(), p_invite: b.getAttribute('data-duel-cancel')
        }).then(function () { refresh(); });
      });
    });
    W.$$('[data-duel-resume]', el).forEach(function (b) {
      b.addEventListener('click', function () {
        if (onMatch) onMatch(b.getAttribute('data-duel-resume'));
      });
    });
  }

  function errMsg(code) {
    return ({
      not_found: 'No player with that gamertag.',
      self: 'You cannot challenge yourself.',
      already_pending: 'An invite is already pending with them.',
      too_many: 'Too many open invites. Cancel one first.',
      no_gamertag: 'Claim a gamertag first.',
      busy: 'One of you is already in a match.',
      offline: 'Cloud is offline right now.',
      invalid_tag: 'Use 3–16 letters, numbers, or underscores.',
      gone: 'That invite expired.'
    })[code] || 'Please try again.';
  }

  function sendInvite(tag, kind) {
    if (!tag || !/^[A-Za-z0-9_]{3,16}$/.test(tag)) {
      return Promise.resolve({ ok: false, error: 'invalid_tag' });
    }
    if (myTag() && tag.toLowerCase() === myTag().toLowerCase()) {
      return Promise.resolve({ ok: false, error: 'self' });
    }
    return rpc('pvp_lookup_tag', { p_tag: tag }).then(function (rows) {
      if (rows && rows.ok === false) return rows;
      var row = Array.isArray(rows) ? rows[0] : rows;
      var found = !!(row && (row.found === true || row.found === 't' || row.gamertag));
      if (!found) return { ok: false, error: 'not_found' };
      return rpc('pvp_send_invite', { p_device: deviceId(), p_to_tag: tag }).then(function (res) {
        if (res && res.ok) res.kind = kind;
        return res;
      });
    });
  }

  /* ============================ mount ============================= */
  function mount(host, opts) {
    opts = opts || {};
    var matchId = opts.matchId || null;
    var kind = opts.kind || 'mix';
    var cfg = typeof opts.cfg === 'function' ? opts.cfg() : (opts.cfg || {});
    var destroyed = false;
    var poll = null;
    var tickTimer = null;
    var state = null;
    var localAnswered = false;
    var selectedChoice = null;
    var submitInFlight = false;
    var scoredWin = false;
    var entering = false;
    var paintedSig = '';
    var inboxSigSeen = '';
    var refreshGen = 0;

    host.innerHTML = '<div class="duel" tabindex="-1"><div class="duel__body" data-duel-body></div></div>';
    var body = W.$('[data-duel-body]', host);

    function remainingMs() {
      if (!state || state.status !== 'active') return 0;
      var start = parseTs(state.round_started_at);
      var total = (state.round_seconds || 18) * 1000;
      if (!start) return total;
      return Math.max(0, total - (Date.now() - start));
    }

    function remainingSec() {
      return Math.max(0, Math.ceil(remainingMs() / 1000));
    }

    function elapsedAnswerMs() {
      var start = parseTs(state && state.round_started_at);
      if (!start) return 0;
      return Math.max(0, Math.min(60000, Math.round(Date.now() - start)));
    }

    function statusText() {
      var locked = !!(state && state.answered_me) || localAnswered || remainingMs() <= 0;
      if (locked) {
        if (state && state.answered_them) return 'Both answered — scoring…';
        if (remainingMs() <= 0 && !(state && state.answered_me) && !localAnswered) return 'Time\'s up.';
        return 'Answer locked. Waiting for your opponent…';
      }
      return 'Answer faster than your opponent. Wrong answers score nothing.';
    }

    /* Question identity only. Timer, scores-in-place, and "answered"
       flags must not rebuild the card — that replayed slideIn every poll. */
    function liveSig(s) {
      var r = (s && s.round) || {};
      var choices = (r.choices || []).map(function (ch) {
        return (ch && (ch.text || ch.flag || '')) + '';
      }).join('\u001e');
      return [
        s.status || '',
        s.current_round,
        s.round_count,
        s.role || '',
        s.host_tag || '',
        s.guest_tag || '',
        r.prompt || '',
        r.subject || '',
        r.sub || '',
        r.flag || '',
        r.flag_choices ? 1 : 0,
        choices
      ].join('\u001f');
    }

    function lockChoices(choice) {
      W.$$('[data-choice]', body).forEach(function (b) {
        b.classList.add('is-locked');
        var idx = +b.getAttribute('data-choice');
        b.classList.toggle('is-selected', choice != null && idx === choice);
      });
    }

    function updateRoundChrome() {
      if (!state || state.status !== 'active') return;
      var small = W.$('.duel-round small', body);
      if (small) small.textContent = remainingSec() + 's';
      var hs = W.$('[data-duel-host-score]', body);
      var gs = W.$('[data-duel-guest-score]', body);
      if (hs) hs.textContent = String(state.host_score);
      if (gs) gs.textContent = String(state.guest_score);
      var status = W.$('[data-duel-status]', body);
      if (status) status.textContent = statusText();
      var locked = !!(state.answered_me) || localAnswered || remainingMs() <= 0;
      if (locked) lockChoices(selectedChoice);
      else {
        W.$$('[data-choice]', body).forEach(function (b) {
          b.classList.remove('is-locked', 'is-selected');
        });
      }
    }

    function renderInbox() {
      var slot = body && W.$('[data-duel-inbox]', body);
      if (!slot) return;
      var sig = inboxSignature(lastInbox);
      if (sig === inboxSigSeen && slot.getAttribute('data-inbox-sig') === sig) return;
      inboxSigSeen = sig;
      slot.setAttribute('data-inbox-sig', sig);
      slot.innerHTML = inboxHtml(lastInbox);
      wireInbox(body, function (id) { enterMatch(id); });
    }

    function paint() {
      if (destroyed || !body) return;
      if (!matchId) {
        paintedSig = '';
        return paintLobby();
      }
      if (!state) {
        if (paintedSig === 'loading') return;
        paintedSig = 'loading';
        body.innerHTML = global.CookingLoader
          ? global.CookingLoader.host({ tall: true, note: 'Loading match…' })
          : '<div class="duel-wait"><div class="duel-wait__pulse"></div><p>Loading match…</p></div>';
        applyDuelAccent(body.firstChild);
        return;
      }
      if (state.status === 'seeding') return paintSeeding();
      if (state.status === 'finished') return paintFinished();
      var sig = liveSig(state);
      if (sig === paintedSig && W.$('[data-duel-q]', body)) {
        updateRoundChrome();
        return;
      }
      paintedSig = sig;
      return paintRound();
    }

    /* Host was stuck in the lobby after the friend accepted: inbox polling
       updated lastInbox.active but nothing entered the match or re-dealt
       the lobby UI. Listen while we are still in the lobby. */
    function onInboxEvent(ev) {
      if (destroyed || matchId || entering) return;
      var box = (ev && ev.detail) || lastInbox;
      if (box && box.active && box.active.id) {
        entering = true;
        W.toast('Challenge accepted', 'Entering Geo Duel…', I.check, 2800);
        enterMatch(box.active.id);
        return;
      }
      renderInbox();
    }
    global.addEventListener('learngeo:pvp-inbox', onInboxEvent);

    var lobbyCircles = null;

    function stopLobbyCircles() {
      if (lobbyCircles && lobbyCircles.destroy) lobbyCircles.destroy();
      lobbyCircles = null;
    }

    function doSendInvite(tag, errEl, inputEl) {
      ensureTag(function () {
        sendInvite(tag, kind).then(function (res) {
          if (!res || !res.ok) {
            if (res && res.error === 'no_gamertag') {
              ensureServerTag().then(function () {
                return sendInvite(tag, kind);
              }).then(function (retry) {
                if (!retry || !retry.ok) {
                  if (errEl) errEl.textContent = errMsg(retry && retry.error);
                  return;
                }
                W.toast('Invite sent', 'Waiting for ' + (retry.to_tag || tag) + '…', I.check, 3600);
                if (inputEl) inputEl.value = '';
                fetchInbox().then(function () {
                  var box = W.$('[data-duel-inbox]', body);
                  if (box) {
                    box.innerHTML = inboxHtml(lastInbox);
                    wireInbox(body, function (id) { enterMatch(id); });
                  }
                });
              });
              return;
            }
            if (errEl) errEl.textContent = errMsg(res && res.error);
            return;
          }
          W.toast('Invite sent', 'Waiting for ' + (res.to_tag || tag) + '…', I.check, 3600);
          if (inputEl) inputEl.value = '';
          fetchInbox().then(function () {
            var box = W.$('[data-duel-inbox]', body);
            if (box) {
              box.innerHTML = inboxHtml(lastInbox);
              wireInbox(body, function (id) { enterMatch(id); });
            }
          });
        });
      });
    }

    function paintLobby() {
      stopLobbyCircles();
      inboxSigSeen = inboxSignature(lastInbox);
      body.innerHTML =
        '<div class="duel-lobby">' +
          '<div class="duel-lobby__hero">' +
            '<div class="eyebrow">PvP</div>' +
            '<h2>Challenge a friend</h2>' +
            '<p>You float as a circle in the lobby. Tap another player to challenge or chat — or invite by gamertag below.</p>' +
          '</div>' +
          '<div class="panel duel-lobby__orbit-panel">' +
            '<div class="panel__head"><h3>Lobby</h3></div>' +
            '<div data-lobby-circles></div>' +
          '</div>' +
          '<div class="duel-invite panel">' +
            '<div class="panel__head"><h3>Invite by gamertag</h3></div>' +
            '<div class="field"><label class="field__label" for="duel-tag">Friend’s gamertag</label>' +
              '<input class="input" id="duel-tag" maxlength="16" autocomplete="off" autocapitalize="off" ' +
                'spellcheck="false" placeholder="e.g. MapWizard"></div>' +
            '<div class="duel-invite__row">' +
              '<div class="seg" data-kind>' +
                KINDS.map(function (k) {
                  return '<button type="button" data-v="' + k[0] + '"' +
                    (k[0] === kind ? ' class="is-active"' : '') + '>' + esc(k[1]) + '</button>';
                }).join('') +
              '</div>' +
              '<button class="btn btn--accent" type="button" data-duel-send>' + I.play + ' Send invite</button>' +
            '</div>' +
            '<div class="gt-err" id="duel-err" role="alert"></div>' +
          '</div>' +
          '<div class="duel-inbox panel">' +
            '<div class="panel__head"><h3>Invites</h3></div>' +
            '<div data-duel-inbox data-inbox-sig="' + esc(inboxSigSeen) + '">' + inboxHtml(lastInbox) + '</div>' +
          '</div>' +
        '</div>';

      W.$$('[data-kind] button', body).forEach(function (b) {
        b.addEventListener('click', function () {
          kind = b.dataset.v;
          W.$$('[data-kind] button', body).forEach(function (x) {
            x.classList.toggle('is-active', x === b);
          });
        });
      });
      W.$('[data-duel-send]', body).addEventListener('click', function () {
        var input = W.$('#duel-tag', body);
        var err = W.$('#duel-err', body);
        var tag = (input.value || '').trim();
        err.textContent = '';
        doSendInvite(tag, err, input);
      });
      wireInbox(body, function (id) { enterMatch(id); });
      fetchInbox().then(function () {
        if (destroyed || matchId) return;
        if (lastInbox.active && lastInbox.active.id) {
          entering = true;
          enterMatch(lastInbox.active.id);
          return;
        }
        renderInbox();
      });
      applyDuelAccent(body.firstChild);

      var orbitHost = W.$('[data-lobby-circles]', body);
      if (orbitHost && global.LobbyCircles) {
        lobbyCircles = global.LobbyCircles.mount({
          lobby: 'duel',
          hostEl: orbitHost,
          onChallenge: function (tag) {
            var input = W.$('#duel-tag', body);
            var err = W.$('#duel-err', body);
            if (input) input.value = tag;
            if (err) err.textContent = '';
            doSendInvite(tag, err, input);
          },
          onCopyTag: function (tag) {
            var input = W.$('#duel-tag', body);
            if (input) input.value = tag;
          }
        });
      }
    }

    function paintSeeding() {
      var iAmHost = state.role === 'host';
      var same = paintedSig === 'seeding' && W.$('[data-duel-seeding]', body);
      if (!same) {
        var seedNote = iAmHost ? 'Building your question set…' : 'Waiting for the host to deal the questions…';
        paintedSig = 'seeding';
        body.innerHTML =
          '<div class="duel-wait" data-duel-seeding>' +
            '<div class="duel-vs">' +
              '<span>' + esc(state.host_tag || 'Host') + '</span>' +
              '<b>VS</b>' +
              '<span>' + esc(state.guest_tag || 'Guest') + '</span>' +
            '</div>' +
            (global.CookingLoader
              ? global.CookingLoader.html({ size: 'md' }) +
                '<p class="cook-loader-host__note">' + esc(seedNote) + '</p>'
              : '<div class="duel-wait__pulse"></div><p>' + esc(seedNote) + '</p>') +
            '<div class="duel-play__foot" style="margin-top:18px">' +
              '<button class="btn btn--ghost btn--sm" type="button" data-duel-forfeit>Leave match</button>' +
            '</div>' +
          '</div>';
        var leave = W.$('[data-duel-forfeit]', body);
        if (leave) leave.addEventListener('click', forfeit);
        applyDuelAccent(body.firstChild);
      }
      if (iAmHost) seedIfNeeded();
    }

    function seedIfNeeded() {
      if (seedIfNeeded.busy) return;
      seedIfNeeded.busy = true;
      var rounds = buildRounds(cfg, kind);
      if (rounds.length < 3) {
        W.toast('Not enough countries', 'Widen your study filters and try again.', I.info, 4200);
        seedIfNeeded.busy = false;
        return;
      }
      rpc('pvp_seed_match', {
        p_device: deviceId(),
        p_match: matchId,
        p_kind: kind,
        p_rounds: rounds
      }).then(function (res) {
        seedIfNeeded.busy = false;
        if (!res.ok) {
          if (res.error === 'started') { refresh(); return; }
          W.toast('Could not start', errMsg(res.error), I.info, 3600);
          return;
        }
        refresh();
      });
    }

    function paintRound() {
      var r = state.round || {};
      var keys = 'ABCD';
      var locked = !!state.answered_me || localAnswered;
      var left = remainingSec();
      body.innerHTML =
        '<div class="duel-play">' +
          '<div class="duel-scoreboard">' +
            '<div class="duel-score' + (state.role === 'host' ? ' is-me' : '') + '">' +
              '<span>' + esc(state.host_tag || 'Host') + '</span><b class="mono" data-duel-host-score>' + esc(String(state.host_score)) + '</b></div>' +
            '<div class="duel-round mono">Round ' + (state.current_round + 1) + ' / ' + state.round_count +
              '<small>' + left + 's</small></div>' +
            '<div class="duel-score' + (state.role === 'guest' ? ' is-me' : '') + '">' +
              '<span>' + esc(state.guest_tag || 'Guest') + '</span><b class="mono" data-duel-guest-score>' + esc(String(state.guest_score)) + '</b></div>' +
          '</div>' +
          '<div class="qcard duel-q" data-duel-q>' +
            '<div class="qcard__prompt">' + esc(r.prompt || 'Question') + '</div>' +
            '<div class="qcard__subject">' +
              (r.flag
                ? '<span class="qflag">' + global.Quiz.flagImg(r.flag, 'qflag__img') + '</span>'
                : esc(r.subject || '')) +
              '<small>' + esc(r.sub || '') + '</small>' +
            '</div>' +
            '<div class="options' + (r.flag_choices ? ' options--flags' : '') + '">' +
              (r.choices || []).map(function (ch, idx) {
                return '<button type="button" class="option' + (locked ? ' is-locked' : '') +
                  '" data-choice="' + idx + '">' +
                  '<span class="option__key">' + keys.charAt(idx) + '</span>' +
                  '<span class="option__text">' +
                    (r.flag_choices && ch.flag
                      ? global.Quiz.flagImg(ch.flag, 'option__flag')
                      : esc(ch.text || '')) +
                  '</span></button>';
              }).join('') +
            '</div>' +
            '<p class="duel-status t-sm t-muted" data-duel-status>' + esc(statusText()) + '</p>' +
          '</div>' +
          '<div class="duel-play__foot">' +
            '<button class="btn btn--ghost btn--sm" type="button" data-duel-forfeit>Forfeit</button>' +
          '</div>' +
        '</div>';

      W.$$('[data-choice]', body).forEach(function (btn) {
        btn.addEventListener('click', function () {
          answer(+btn.getAttribute('data-choice'));
        });
      });
      var ff = W.$('[data-duel-forfeit]', body);
      if (ff) ff.addEventListener('click', forfeit);

      applyDuelAccent(body.firstChild);
      if (locked) lockChoices(selectedChoice);
    }

    function onKey(e) {
      if (destroyed || !state || state.status !== 'active') return;
      if (e.target && /input|textarea/i.test(e.target.tagName)) return;
      var map = { a: 0, b: 1, c: 2, d: 3, Digita: 0, Digitb: 1, Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3 };
      var idx = map[e.key];
      if (idx === undefined && /^[1-4]$/.test(e.key)) idx = +e.key - 1;
      if (idx === undefined && /^[a-d]$/i.test(e.key)) idx = e.key.toLowerCase().charCodeAt(0) - 97;
      if (idx === undefined) return;
      e.preventDefault();
      answer(idx);
    }

    function answer(choice) {
      if (!state || state.status !== 'active' || submitInFlight) return;
      if (localAnswered || state.answered_me) return;
      if (!state.round || !state.round.choices || choice < 0 || choice >= state.round.choices.length) return;
      if (remainingMs() <= 0) {
        updateRoundChrome();
        return;
      }
      var sentRound = state.current_round;
      localAnswered = true;
      selectedChoice = choice;
      submitInFlight = true;
      lockChoices(choice);
      var status = W.$('[data-duel-status]', body);
      if (status) status.textContent = statusText();
      var ms = elapsedAnswerMs();
      rpc('pvp_submit_answer', {
        p_device: deviceId(),
        p_match: matchId,
        p_round: sentRound,
        p_choice: choice,
        p_ms: ms
      }).then(function (res) {
        submitInFlight = false;
        var failed = !res || !res.ok;
        var terminal = !!(res && (res.error === 'already' || res.error === 'wrong_round' || res.error === 'not_active'));
        refresh().then(function () {
          if (!failed || terminal) return;
          if (!state || state.status !== 'active') return;
          if (state.current_round !== sentRound) return;
          if (state.answered_me) return;
          localAnswered = false;
          selectedChoice = null;
          updateRoundChrome();
        });
      });
    }

    function paintFinished() {
      var finSig = 'fin:' + state.host_score + ':' + state.guest_score + ':' +
        (state.i_won ? 1 : 0) + ':' + (state.draw ? 1 : 0) + ':' + (state.winner_tag || '');
      if (paintedSig === finSig && W.$('[data-duel-finished]', body)) return;
      paintedSig = finSig;
      stopPoll();
      var title = state.draw ? 'Draw' : (state.i_won ? 'You win!' : 'Defeat');
      var sub = state.draw
        ? 'Even score — rematch from the lobby.'
        : (state.i_won
          ? 'Nice work. Invite them again, or challenge someone from another school.'
          : (state.winner_tag || 'Your opponent') + ' took it this time.');
      body.innerHTML =
        '<div class="duel-end" data-duel-finished>' +
          '<div class="duel-end__badge' + (state.i_won ? ' is-win' : state.draw ? '' : ' is-loss') + '">' +
            esc(title) + '</div>' +
          '<div class="duel-vs">' +
            '<span>' + esc(state.host_tag) + ' · ' + esc(String(state.host_score)) + '</span>' +
            '<b>VS</b>' +
            '<span>' + esc(state.guest_tag) + ' · ' + esc(String(state.guest_score)) + '</span>' +
          '</div>' +
          '<p>' + esc(sub) + '</p>' +
          '<div class="duel-end__actions">' +
            '<button class="btn btn--accent" type="button" data-duel-again>Back to lobby</button>' +
            '<button class="btn btn--ghost" type="button" data-duel-back>Game setup</button>' +
          '</div>' +
        '</div>';
      maybeRecordWin();
      applyDuelAccent(body.firstChild);
      W.$('[data-duel-again]', body).addEventListener('click', function () {
        matchId = null; state = null; entering = false; stopPoll(); paint();
      });
      W.$('[data-duel-back]', body).addEventListener('click', function () {
        if (opts.onBack) opts.onBack();
      });
    }

    function maybeRecordWin() {
      if (scoredWin || !state || state.status !== 'finished') return;
      var seen = (W.state.duelSeen || (W.state.duelSeen = {}));
      if (seen[matchId]) return;
      seen[matchId] = 1;
      scoredWin = true;
      var rec = (W.state.games || (W.state.games = {})).duel || (W.state.games.duel = {});
      rec.runs = (rec.runs || 0) + 1;
      if (state.i_won) {
        rec.wins = (rec.wins || 0) + 1;
        rec.best = Math.max(rec.best || 0, rec.wins);
      }
      W.save();
      if (global.GameBoards && global.GameBoards.touch) global.GameBoards.touch();
      (state.round_results || []).forEach(function (rr) {
        var mineOk = state.role === 'host' ? rr.host_ok : rr.guest_ok;
        var country = (state.rounds && state.rounds[rr.round] && state.rounds[rr.round].country) || null;
        if (mineOk && country && global.GameKit && global.GameKit.award) {
          try { global.GameKit.award(true, country); } catch (e) {}
        }
      });
    }

    function forfeit() {
      var id = matchId;
      rpc('pvp_forfeit_match', { p_device: deviceId(), p_match: id }).then(function () {
        matchId = null;
        state = null;
        entering = false;
        stopPoll();
        fetchInbox().then(paint);
      });
    }

    function enterMatch(id) {
      stopLobbyCircles();
      matchId = id;
      state = null;
      localAnswered = false;
      selectedChoice = null;
      submitInFlight = false;
      scoredWin = false;
      entering = true;
      paintedSig = '';
      refreshGen = 0;
      seedIfNeeded.busy = false;
      paint();
      refresh();
      startPoll();
    }

    function refresh() {
      if (destroyed || !matchId) return Promise.resolve();
      var gen = ++refreshGen;
      var id = matchId;
      return rpc('pvp_match_state', { p_device: deviceId(), p_match: id }).then(function (res) {
        if (destroyed || gen !== refreshGen || matchId !== id) return;
        if (!res || !res.ok) {
          if (res && (res.error === 'not_found' || res.error === 'forbidden')) {
            matchId = null;
            state = null;
            entering = false;
            stopPoll();
            fetchInbox().then(paint);
          }
          return;
        }
        var prevRound = state && state.current_round;
        var prevStatus = state && state.status;
        /* A late response must not rewind the question under the cursor. */
        if (state && prevStatus === 'active' && res.status === 'active' &&
            typeof res.current_round === 'number' && typeof prevRound === 'number' &&
            res.current_round < prevRound) {
          return;
        }
        state = res;
        if (prevRound !== state.current_round || prevStatus !== state.status) {
          submitInFlight = false;
          localAnswered = !!state.answered_me;
          if (!state.answered_me) selectedChoice = null;
        } else if (state.answered_me) {
          localAnswered = true;
        }
        paint();
      });
    }

    function startPoll() {
      stopPoll();
      tickTimer = setInterval(function () {
        if (destroyed) return;
        updateRoundChrome();
      }, 250);
      poll = setInterval(function () {
        if (destroyed) return;
        refresh();
      }, 1200);
    }
    function stopPoll() {
      if (poll) { clearInterval(poll); poll = null; }
      if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
    }

    /* One listener for the life of the mount. paintRound used to add
       another on every poll, so one keypress fired answer() many times. */
    global.addEventListener('keydown', onKey);

    /* boot */
    startWatching();
    if (matchId) {
      entering = true;
      paint();
      refresh();
      startPoll();
    } else if (opts.autoResume && lastInbox.active) {
      enterMatch(lastInbox.active.id);
    } else {
      fetchInbox().then(function () {
        if (destroyed) return;
        if (opts.autoResume && lastInbox.active && lastInbox.active.id) {
          enterMatch(lastInbox.active.id);
        } else {
          paint();
        }
      });
    }

    return {
      destroy: function () {
        destroyed = true;
        stopLobbyCircles();
        stopPoll();
        global.removeEventListener('learngeo:pvp-inbox', onInboxEvent);
        global.removeEventListener('keydown', onKey);
        host.innerHTML = '';
      }
    };
  }

  /* Hub badge count for the Geo Duel card. */
  function pendingCount() {
    return (lastInbox.incoming || []).length;
  }

  /* ===================== teacher / host spectate =================== */
  /* Classroom host (teacher) watches a student duel as a read-only
     spectator. State + scores only — never screen mirroring. */
  function listClassDuels(classId) {
    if (!classId) return Promise.resolve({ ok: false, error: 'invalid', matches: [] });
    return rpc('pvp_list_class_duels', { p_class: classId }).then(function (data) {
      if (!data || !data.ok) {
        return { ok: false, error: (data && data.error) || 'offline', matches: [] };
      }
      return { ok: true, matches: data.matches || [] };
    });
  }

  function spectateRemainingSec(state) {
    if (!state || !state.round_started_at) return state && state.round_seconds || 18;
    var start = Date.parse(state.round_started_at);
    if (!start) return state.round_seconds || 18;
    var left = (state.round_seconds || 18) - ((Date.now() - start) / 1000);
    return Math.max(0, Math.ceil(left));
  }

  function mountSpectate(host, opts) {
    opts = opts || {};
    var matchId = opts.matchId || null;
    var destroyed = false;
    var poll = null;
    var state = null;
    var paintedSig = '';

    host.innerHTML = '<div class="duel duel--spectate" tabindex="-1"><div class="duel__body" data-duel-body></div></div>';
    var body = W.$('[data-duel-body]', host);

    function spectateSig(s) {
      var r = (s && s.round) || {};
      return [
        s.status || '',
        s.current_round,
        s.host_score,
        s.guest_score,
        s.answered_host ? 1 : 0,
        s.answered_guest ? 1 : 0,
        r.prompt || '',
        (r.choices || []).length
      ].join('|');
    }

    function paint() {
      if (destroyed || !body) return;
      if (!state) {
        if (paintedSig === 'loading') return;
        paintedSig = 'loading';
        body.innerHTML = global.CookingLoader
          ? global.CookingLoader.host({ tall: true, note: 'Loading duel…' })
          : '<div class="duel-wait"><div class="duel-wait__pulse"></div><p>Loading duel…</p></div>';
        applyDuelAccent(body.firstChild);
        return;
      }
      if (state.status === 'seeding') {
        if (paintedSig === 'seeding' && W.$('[data-duel-seeding]', body)) return;
        paintedSig = 'seeding';
        return paintSeeding();
      }
      if (state.status === 'finished') {
        var fin = 'fin:' + state.host_score + ':' + state.guest_score + ':' + (state.winner_tag || '');
        if (paintedSig === fin && W.$('[data-duel-finished]', body)) return;
        paintedSig = fin;
        return paintFinished();
      }
      if (state.status === 'cancelled') {
        if (paintedSig === 'cancelled' && W.$('[data-duel-closed]', body)) return;
        paintedSig = 'cancelled';
        return paintClosed();
      }
      var sig = spectateSig(state);
      if (sig === paintedSig && W.$('[data-duel-q]', body)) {
        var small = W.$('.duel-round small', body);
        if (small) small.textContent = spectateRemainingSec(state) + 's';
        return;
      }
      paintedSig = sig;
      return paintRound();
    }

    function paintBanner() {
      return '<div class="duel-spectate-banner" role="status">' +
        (I.eye || '') +
        '<div><b>Spectating</b><span>Host view · scores and rounds only — you are not playing</span></div>' +
        '</div>';
    }

    function paintSeeding() {
      body.innerHTML =
        '<div class="duel-wait" data-duel-seeding>' +
          paintBanner() +
          '<div class="duel-vs">' +
            '<span>' + esc(state.host_tag || 'Host') + '</span>' +
            '<b>VS</b>' +
            '<span>' + esc(state.guest_tag || 'Guest') + '</span>' +
          '</div>' +
          '<p class="t-sm t-muted">Waiting for the host to deal the questions…</p>' +
          '<div class="duel-play__foot" style="margin-top:18px">' +
            '<button class="btn btn--ghost btn--sm" type="button" data-duel-spectate-back>Back to live duels</button>' +
          '</div>' +
        '</div>';
      wireBack();
      applyDuelAccent(body.firstChild);
    }

    function paintClosed() {
      body.innerHTML =
        '<div class="duel-end" data-duel-closed>' +
          paintBanner() +
          '<div class="duel-end__badge">Match closed</div>' +
          '<p>This duel ended or was forfeited.</p>' +
          '<div class="duel-end__actions">' +
            '<button class="btn btn--accent" type="button" data-duel-spectate-back>Back to live duels</button>' +
          '</div>' +
        '</div>';
      wireBack();
      applyDuelAccent(body.firstChild);
    }

    function paintRound() {
      var r = state.round || {};
      var keys = 'ABCD';
      var left = spectateRemainingSec(state);
      var hostDone = !!state.answered_host;
      var guestDone = !!state.answered_guest;
      var statusLine = hostDone && guestDone
        ? 'Both answered — scoring…'
        : (hostDone
          ? esc(state.host_tag || 'Host') + ' locked in. Waiting on ' + esc(state.guest_tag || 'guest') + '…'
          : (guestDone
            ? esc(state.guest_tag || 'Guest') + ' locked in. Waiting on ' + esc(state.host_tag || 'host') + '…'
            : 'Watching both players answer.'));
      body.innerHTML =
        '<div class="duel-play duel-play--spectate">' +
          paintBanner() +
          '<div class="duel-scoreboard">' +
            '<div class="duel-score">' +
              '<span>' + esc(state.host_tag || 'Host') + '</span>' +
              '<b class="mono">' + esc(String(state.host_score)) + '</b>' +
              '<small class="duel-ans-flag">' + (hostDone ? 'Answered' : 'Thinking…') + '</small></div>' +
            '<div class="duel-round mono">Round ' + (state.current_round + 1) + ' / ' + state.round_count +
              '<small>' + left + 's</small></div>' +
            '<div class="duel-score">' +
              '<span>' + esc(state.guest_tag || 'Guest') + '</span>' +
              '<b class="mono">' + esc(String(state.guest_score)) + '</b>' +
              '<small class="duel-ans-flag">' + (guestDone ? 'Answered' : 'Thinking…') + '</small></div>' +
          '</div>' +
          '<div class="qcard duel-q" data-duel-q>' +
            '<div class="qcard__prompt">' + esc(r.prompt || 'Question') + '</div>' +
            '<div class="qcard__subject">' +
              (r.flag
                ? '<span class="qflag">' + global.Quiz.flagImg(r.flag, 'qflag__img') + '</span>'
                : esc(r.subject || '')) +
              '<small>' + esc(r.sub || '') + '</small>' +
            '</div>' +
            '<div class="options' + (r.flag_choices ? ' options--flags' : '') + '">' +
              (r.choices || []).map(function (ch, idx) {
                return '<div class="option is-locked is-spectate" data-choice="' + idx + '">' +
                  '<span class="option__key">' + keys.charAt(idx) + '</span>' +
                  '<span class="option__text">' +
                    (r.flag_choices && ch.flag
                      ? global.Quiz.flagImg(ch.flag, 'option__flag')
                      : esc(ch.text || '')) +
                  '</span></div>';
              }).join('') +
            '</div>' +
            '<p class="duel-status t-sm t-muted">' + statusLine + '</p>' +
          '</div>' +
          '<div class="duel-play__foot">' +
            '<button class="btn btn--ghost btn--sm" type="button" data-duel-spectate-back>Back to live duels</button>' +
          '</div>' +
        '</div>';
      wireBack();
      applyDuelAccent(body.firstChild);
    }

    function paintFinished() {
      var title = state.draw ? 'Draw' : ((state.winner_tag || 'Someone') + ' wins');
      body.innerHTML =
        '<div class="duel-end" data-duel-finished>' +
          paintBanner() +
          '<div class="duel-end__badge' + (state.draw ? '' : ' is-win') + '">' + esc(title) + '</div>' +
          '<div class="duel-vs">' +
            '<span>' + esc(state.host_tag) + ' · ' + esc(String(state.host_score)) + '</span>' +
            '<b>VS</b>' +
            '<span>' + esc(state.guest_tag) + ' · ' + esc(String(state.guest_score)) + '</span>' +
          '</div>' +
          '<p class="t-sm t-muted">Spectator view — this match is finished.</p>' +
          '<div class="duel-end__actions">' +
            '<button class="btn btn--accent" type="button" data-duel-spectate-back>Back to live duels</button>' +
          '</div>' +
        '</div>';
      wireBack();
      applyDuelAccent(body.firstChild);
    }

    function wireBack() {
      var b = W.$('[data-duel-spectate-back]', body);
      if (!b) return;
      b.addEventListener('click', function () {
        if (opts.onBack) opts.onBack();
      });
    }

    function refresh() {
      if (destroyed || !matchId) return Promise.resolve();
      return rpc('pvp_spectate_state', { p_match: matchId }).then(function (res) {
        if (!res || !res.ok) {
          if (res && (res.error === 'not_found' || res.error === 'forbidden')) {
            state = { status: 'cancelled', host_tag: '—', guest_tag: '—', host_score: 0, guest_score: 0 };
            stopPoll();
            paint();
          }
          return;
        }
        state = res;
        paint();
      });
    }

    function startPoll() {
      stopPoll();
      poll = setInterval(function () {
        if (destroyed) return;
        refresh();
      }, 1400);
    }
    function stopPoll() {
      if (poll) { clearInterval(poll); poll = null; }
    }

    paint();
    refresh();
    startPoll();

    return {
      destroy: function () {
        destroyed = true;
        stopPoll();
        host.innerHTML = '';
      }
    };
  }

  function mountClassLive(host, opts) {
    opts = opts || {};
    var classId = opts.classId || '';
    var destroyed = false;
    var poll = null;
    var active = null;
    var matches = [];

    function paintList() {
      if (destroyed || !host) return;
      if (active) return;
      var live = matches.filter(function (m) {
        return m && (m.status === 'seeding' || m.status === 'active');
      });
      var recent = matches.filter(function (m) {
        return m && m.status === 'finished';
      });
      var parts = [];
      parts.push(
        '<div class="duel-class-live">' +
          '<div class="duel-lobby__hero">' +
            '<div class="eyebrow">Host view</div>' +
            '<h2>Live Geo Duels</h2>' +
            '<p>Watch class matches as a spectator — scores and questions update live. You do not join the game, and nothing is screen-mirrored.</p>' +
          '</div>'
      );
      if (!live.length && !recent.length) {
        parts.push(
          '<div class="panel duel-inbox">' +
            '<p class="duel-empty t-sm t-muted">No class duels right now. When two signed-in students duel, they show up here so you can spectate.</p>' +
          '</div>'
        );
      } else {
        if (live.length) {
          parts.push('<div class="panel duel-inbox"><div class="panel__head"><h3>In progress</h3></div>');
          live.forEach(function (m) {
            parts.push(
              '<div class="duel-note duel-note--live">' +
                '<div><b>' + esc(m.host_tag || '?') + ' vs ' + esc(m.guest_tag || '?') + '</b>' +
                  '<span>' + esc(String(m.host_score)) + '–' + esc(String(m.guest_score)) +
                  ' · Round ' + (Number(m.current_round) + 1) + '/' + esc(String(m.round_count)) +
                  (m.status === 'seeding' ? ' · seeding' : '') +
                  '</span></div>' +
                '<button class="btn btn--accent btn--sm" type="button" data-duel-spectate="' +
                  esc(m.id) + '">' + (I.eye || '') + ' Spectate</button></div>'
            );
          });
          parts.push('</div>');
        }
        if (recent.length) {
          parts.push('<div class="panel duel-inbox"><div class="panel__head"><h3>Recently finished</h3></div>');
          recent.slice(0, 6).forEach(function (m) {
            parts.push(
              '<div class="duel-note">' +
                '<div><b>' + esc(m.host_tag || '?') + ' vs ' + esc(m.guest_tag || '?') + '</b>' +
                  '<span>' + esc(String(m.host_score)) + '–' + esc(String(m.guest_score)) + '</span></div>' +
                '<button class="btn btn--ghost btn--sm" type="button" data-duel-spectate="' +
                  esc(m.id) + '">Replay board</button></div>'
            );
          });
          parts.push('</div>');
        }
      }
      parts.push('</div>');
      host.innerHTML = parts.join('');
      W.$$('[data-duel-spectate]', host).forEach(function (btn) {
        btn.addEventListener('click', function () {
          openMatch(btn.getAttribute('data-duel-spectate'));
        });
      });
    }

    function openMatch(id) {
      if (!id || destroyed) return;
      stopPoll();
      active = mountSpectate(host, {
        matchId: id,
        onBack: function () {
          if (active && active.destroy) active.destroy();
          active = null;
          paintList();
          startPoll();
          refresh();
        }
      });
    }

    function refresh() {
      if (destroyed || !classId || active) return Promise.resolve();
      return listClassDuels(classId).then(function (res) {
        if (destroyed || active) return;
        matches = (res && res.matches) || [];
        paintList();
      });
    }

    function startPoll() {
      stopPoll();
      if (!classId) return;
      poll = setInterval(function () {
        if (destroyed || active) return;
        refresh();
      }, 2500);
    }
    function stopPoll() {
      if (poll) { clearInterval(poll); poll = null; }
    }

    if (!classId) {
      host.innerHTML =
        '<div class="empty">Put your class online first, then you can spectate student Geo Duels. Use the class code button at the top.</div>';
      return {
        destroy: function () { destroyed = true; host.innerHTML = ''; }
      };
    }

    host.innerHTML = global.CookingLoader
      ? global.CookingLoader.host({ tall: false, note: 'Checking for live duels…' })
      : '<p class="t-sm t-muted">Checking for live duels…</p>';
    refresh();
    startPoll();

    return {
      destroy: function () {
        destroyed = true;
        stopPoll();
        if (active && active.destroy) active.destroy();
        active = null;
        host.innerHTML = '';
      }
    };
  }

  global.GeoDuel = {
    mount: mount,
    mountSpectate: mountSpectate,
    mountClassLive: mountClassLive,
    listClassDuels: listClassDuels,
    startWatching: startWatching,
    fetchInbox: fetchInbox,
    pendingCount: pendingCount,
    inbox: function () { return lastInbox; },
    sendInvite: sendInvite
  };

  /* Kick a light watcher once Cloud is around so invites toast even from the hub. */
  setTimeout(startWatching, 2000);
})(window);
