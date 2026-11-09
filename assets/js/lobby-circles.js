/* ------------------------------------------------------------------
   LearnGeo — floating profile circles for PvP lobbies (LEA-83)

   Used by Geo Duel and Geo Chess challenge lobbies. You appear as a
   floating circle; others in the same lobby float nearby. Clicking
   another circle opens Challenge / Chat / Copy gamertag.

   Presence + whispers: supabase/deployed/0031_pvp_lobby_presence.sql.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons;
  var esc = W.escapeHtml;
  var SLOT = [
    { x: 18, y: 42 }, { x: 78, y: 38 }, { x: 50, y: 22 },
    { x: 32, y: 68 }, { x: 68, y: 70 }, { x: 12, y: 18 },
    { x: 88, y: 62 }, { x: 46, y: 78 }, { x: 62, y: 16 },
    { x: 24, y: 58 }
  ];

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

  function accentFor(lobby) {
    if (lobby === 'duel' && global.Cosmetics && global.Cosmetics.duelAccents) {
      var id = (W.state && W.state.profile && W.state.profile.duelAccent) || 'brand';
      var item = global.Cosmetics.find(global.Cosmetics.duelAccents, id);
      if (item && item.accent) return item.accent;
    }
    if (lobby === 'chess') return '#0E9F6E';
    return '#1B4DFF';
  }

  function myInitial() {
    var tag = myTag();
    return tag ? tag.charAt(0).toUpperCase() : '?';
  }

  function hashSlot(tag, i) {
    var h = 0, s = String(tag || '') + ':' + i;
    for (var n = 0; n < s.length; n++) h = ((h << 5) - h + s.charCodeAt(n)) | 0;
    return Math.abs(h) % SLOT.length;
  }

  function placePeople(people) {
    var used = {};
    return (people || []).map(function (p, i) {
      var idx = p.mine ? 2 : hashSlot(p.tag, i);
      var tries = 0;
      while (used[idx] && tries < SLOT.length) {
        idx = (idx + 1) % SLOT.length;
        tries += 1;
      }
      used[idx] = 1;
      var slot = SLOT[idx];
      return {
        tag: p.tag,
        accent: p.accent || '#1B4DFF',
        initial: (p.initial || (p.tag || '?').charAt(0)).toUpperCase(),
        mine: !!p.mine,
        x: slot.x,
        y: slot.y,
        delay: ((i * 0.37) % 2.4).toFixed(2) + 's',
        dur: (4.8 + (i % 5) * 0.35).toFixed(2) + 's'
      };
    });
  }

  function errMsg(code) {
    return ({
      offline: 'Cloud is offline right now.',
      auth: 'Sign in to see who’s in the lobby.',
      no_gamertag: 'Claim a gamertag first.',
      not_found: 'That player left the lobby.',
      self: 'That’s you.',
      rude: 'Please keep it school-safe.',
      bad_body: 'Say something short (1–120 characters).',
      invalid_tag: 'That gamertag looks off.'
    })[code] || 'Please try again.';
  }

  /* opts: { lobby, hostEl, onChallenge(tag), label } */
  function mount(opts) {
    opts = opts || {};
    var lobby = opts.lobby === 'chess' ? 'chess' : 'duel';
    var host = opts.hostEl;
    if (!host) return { destroy: function () {} };

    var destroyed = false;
    var people = [];
    var messages = [];
    var seenChat = {};
    var beatTimer = null;
    var listTimer = null;
    var openTag = null;
    var skySig = '';

    host.innerHTML =
      '<div class="lobby-orbit" data-lobby-orbit>' +
        '<div class="lobby-orbit__sky" data-lobby-sky aria-label="Players in this lobby"></div>' +
        '<div class="lobby-orbit__hint t-sm t-muted" data-lobby-hint></div>' +
        '<div class="lobby-orbit__pop hidden" data-lobby-pop role="dialog" aria-modal="false"></div>' +
        '<div class="lobby-orbit__chat panel hidden" data-lobby-chat></div>' +
      '</div>';

    var sky = W.$('[data-lobby-sky]', host);
    var hint = W.$('[data-lobby-hint]', host);
    var pop = W.$('[data-lobby-pop]', host);
    var chatPanel = W.$('[data-lobby-chat]', host);

    function peopleSig(list) {
      if (!list || !list.length) return 'alone:' + (myTag() || '') + ':' + accentFor(lobby);
      return list.map(function (p) {
        return [
          p.tag || '',
          p.mine ? 1 : 0,
          p.accent || '',
          (p.initial || '').charAt(0)
        ].join('~');
      }).join('|');
    }

    function paintSky() {
      if (!sky) return;
      /* Replacing the sky on every presence poll restarts lobbyFloat,
         so circles jump back to the top of the bob. Skip when the
         roster has not changed. */
      var sig = peopleSig(people);
      if (sig === skySig && sky.querySelector('.lobby-circle')) return;
      skySig = sig;
      var placed = placePeople(people);
      if (!placed.length) {
        sky.innerHTML =
          '<div class="lobby-orbit__alone">' +
            '<button type="button" class="lobby-circle is-me is-float" data-tag="' + esc(myTag() || 'You') + '" ' +
              'style="--lc-accent:' + esc(accentFor(lobby)) + ';--lc-x:50%;--lc-y:46%;--lc-delay:0s;--lc-dur:5.2s" ' +
              'aria-label="You">' +
              '<span class="lobby-circle__face">' + esc(myInitial()) + '</span>' +
              '<span class="lobby-circle__tag">You</span>' +
            '</button>' +
          '</div>';
        hint.textContent = 'Waiting for friends… Keep this lobby open so they can find your circle.';
        return;
      }
      sky.innerHTML = placed.map(function (p) {
        return '<button type="button" class="lobby-circle is-float' + (p.mine ? ' is-me' : '') + '" ' +
          'data-tag="' + esc(p.tag) + '" ' +
          (p.mine ? 'data-mine="1" ' : '') +
          'style="--lc-accent:' + esc(p.accent) +
            ';--lc-x:' + p.x + '%;--lc-y:' + p.y +
            '%;--lc-delay:' + p.delay + ';--lc-dur:' + p.dur + '" ' +
          'aria-label="' + esc(p.mine ? 'You (' + p.tag + ')' : p.tag) + '">' +
          '<span class="lobby-circle__face">' + esc(p.initial) + '</span>' +
          '<span class="lobby-circle__tag">' + esc(p.mine ? 'You' : p.tag) + '</span>' +
        '</button>';
      }).join('');
      var others = placed.filter(function (p) { return !p.mine; }).length;
      hint.textContent = others
        ? (others + ' other player' + (others === 1 ? '' : 's') + ' here · tap a circle to challenge or chat')
        : 'You’re the only one here right now · friends who open this lobby will float in';

      W.$$('.lobby-circle', sky).forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          if (btn.getAttribute('data-mine') === '1') {
            openTag = null;
            hidePop();
            W.toast('That’s you', 'Waiting for friends to float in.', I.info, 2400);
            return;
          }
          openMenu(btn.getAttribute('data-tag'), btn);
        });
      });
    }

    function hidePop() {
      if (!pop) return;
      pop.classList.add('hidden');
      pop.innerHTML = '';
      openTag = null;
    }

    function openMenu(tag, anchor) {
      if (!tag || !pop) return;
      openTag = tag;
      var rect = host.getBoundingClientRect();
      var a = anchor.getBoundingClientRect();
      var left = Math.min(Math.max(12, a.left - rect.left + a.width / 2 - 110), Math.max(12, rect.width - 232));
      var top = Math.min(Math.max(12, a.top - rect.top + a.height + 8), Math.max(12, rect.height - 180));
      pop.classList.remove('hidden');
      pop.style.left = left + 'px';
      pop.style.top = top + 'px';
      pop.innerHTML =
        '<div class="lobby-pop">' +
          '<div class="lobby-pop__head"><b>' + esc(tag) + '</b>' +
            '<button type="button" class="btn btn--ghost btn--sm" data-pop-close aria-label="Close">' + I.x + '</button></div>' +
          '<div class="lobby-pop__actions">' +
            '<button type="button" class="btn btn--accent btn--sm" data-pop-challenge>' + I.play + ' Challenge</button>' +
            '<button type="button" class="btn btn--ghost btn--sm" data-pop-chat>' + I.message + ' Chat</button>' +
            '<button type="button" class="btn btn--ghost btn--sm" data-pop-copy>Copy tag</button>' +
          '</div>' +
        '</div>';
      W.$('[data-pop-close]', pop).addEventListener('click', hidePop);
      W.$('[data-pop-challenge]', pop).addEventListener('click', function () {
        hidePop();
        if (typeof opts.onChallenge === 'function') opts.onChallenge(tag);
      });
      W.$('[data-pop-chat]', pop).addEventListener('click', function () {
        hidePop();
        openChat(tag);
      });
      W.$('[data-pop-copy]', pop).addEventListener('click', function () {
        hidePop();
        if (global.navigator && navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(tag).then(function () {
            W.toast('Copied', tag, I.check, 2200);
          }, function () {
            W.toast(tag, 'Could not copy — select it from the invite box.', I.info, 3200);
          });
        } else {
          W.toast(tag, 'Paste this into the invite box.', I.info, 3200);
        }
        if (typeof opts.onCopyTag === 'function') opts.onCopyTag(tag);
      });
    }

    function openChat(tag) {
      if (!chatPanel) return;
      chatPanel.classList.remove('hidden');
      chatPanel.innerHTML =
        '<div class="panel__head"><h3>Chat · ' + esc(tag) + '</h3>' +
          '<button type="button" class="btn btn--ghost btn--sm" data-chat-close>Close</button></div>' +
        '<div class="lobby-chat__thread" data-chat-thread></div>' +
        '<div class="lobby-chat__compose">' +
          '<input class="input" maxlength="120" data-chat-input placeholder="Say hi (school-safe)…" autocomplete="off">' +
          '<button type="button" class="btn btn--accent btn--sm" data-chat-send>Send</button>' +
        '</div>';
      paintThread(tag);
      W.$('[data-chat-close]', chatPanel).addEventListener('click', function () {
        chatPanel.classList.add('hidden');
        chatPanel.innerHTML = '';
      });
      var input = W.$('[data-chat-input]', chatPanel);
      var send = function () {
        var body = (input.value || '').trim();
        if (!body) return;
        rpc('pvp_lobby_chat_send', {
          p_device: deviceId(),
          p_to_tag: tag,
          p_lobby: lobby,
          p_body: body
        }).then(function (res) {
          if (!res || !res.ok) {
            W.toast('Chat failed', errMsg(res && res.error), I.info, 3200);
            return;
          }
          input.value = '';
          messages.unshift({
            id: res.id,
            from_tag: myTag(),
            to_tag: tag,
            lobby: lobby,
            body: body,
            mine: true,
            created_at: new Date().toISOString()
          });
          paintThread(tag);
          W.toast('Sent', 'Message to ' + tag, I.check, 2000);
        });
      };
      W.$('[data-chat-send]', chatPanel).addEventListener('click', send);
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); send(); }
      });
      setTimeout(function () { input.focus(); }, 40);
    }

    function paintThread(tag) {
      var thread = W.$('[data-chat-thread]', chatPanel);
      if (!thread) return;
      var rows = (messages || []).filter(function (m) {
        return (m.from_tag === tag || m.to_tag === tag);
      }).slice(0, 12).reverse();
      if (!rows.length) {
        thread.innerHTML = '<p class="t-sm t-muted">No messages yet with ' + esc(tag) + '.</p>';
        return;
      }
      thread.innerHTML = rows.map(function (m) {
        return '<div class="lobby-chat__bubble' + (m.mine ? ' is-mine' : '') + '">' +
          '<span>' + esc(m.body) + '</span></div>';
      }).join('');
      thread.scrollTop = thread.scrollHeight;
    }

    function notifyChats(list) {
      (list || []).forEach(function (m) {
        if (!m || !m.id || m.mine || seenChat[m.id]) return;
        seenChat[m.id] = 1;
        W.toast('Lobby chat', (m.from_tag || 'Someone') + ': ' + (m.body || ''), I.message, 5200);
      });
    }

    function heartbeat() {
      if (destroyed || !deviceId() || !myTag()) return Promise.resolve();
      return rpc('pvp_lobby_heartbeat', {
        p_device: deviceId(),
        p_lobby: lobby,
        p_accent: accentFor(lobby),
        p_initial: myInitial()
      });
    }

    function refresh() {
      if (destroyed) return Promise.resolve();
      return heartbeat().then(function () {
        return rpc('pvp_lobby_list', { p_device: deviceId(), p_lobby: lobby });
      }).then(function (res) {
        if (!res || !res.ok) {
          if (res && res.error === 'auth') {
            hint.textContent = 'Sign in to see other players floating in this lobby.';
          } else if (res && res.error === 'offline') {
            hint.textContent = 'Lobby presence is offline — you can still invite by gamertag below.';
          }
          /* Still show local me circle. */
          people = myTag() ? [{ tag: myTag(), accent: accentFor(lobby), initial: myInitial(), mine: true }] : [];
          paintSky();
          return;
        }
        people = res.people || [];
        if (!people.some(function (p) { return p.mine; }) && myTag()) {
          people = [{ tag: myTag(), accent: accentFor(lobby), initial: myInitial(), mine: true }].concat(people);
        }
        paintSky();
      }).then(function () {
        return rpc('pvp_lobby_chat_inbox', { p_device: deviceId(), p_limit: 20 });
      }).then(function (inbox) {
        if (!inbox || !inbox.ok) return;
        messages = inbox.messages || [];
        notifyChats(messages);
        if (openTag && chatPanel && !chatPanel.classList.contains('hidden')) paintThread(openTag);
      });
    }

    function onDocClick(e) {
      if (!pop || pop.classList.contains('hidden')) return;
      if (pop.contains(e.target)) return;
      if (e.target.closest && e.target.closest('.lobby-circle')) return;
      hidePop();
    }

    document.addEventListener('click', onDocClick);
    paintSky();
    refresh();
    beatTimer = setInterval(heartbeat, 4000);
    listTimer = setInterval(refresh, 3500);

    return {
      destroy: function () {
        destroyed = true;
        document.removeEventListener('click', onDocClick);
        if (beatTimer) clearInterval(beatTimer);
        if (listTimer) clearInterval(listTimer);
        rpc('pvp_lobby_leave', { p_device: deviceId() });
        host.innerHTML = '';
      },
      refresh: refresh,
      lobby: lobby
    };
  }

  global.LobbyCircles = { mount: mount };
})(window);
