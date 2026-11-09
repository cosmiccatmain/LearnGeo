/* Harness for tests/test_duel_stable.js. Not a user-facing page. */
(function () {
  'use strict';
  var MATCH = '00000000-0000-4000-8000-0000000000aa';
  var calls = { state: 0, submit: 0 };
  var startedAt = null;
  var shotStartedAt = null;

  function capitalRound(n) {
    var japan = n > 0;
    if (!startedAt) startedAt = new Date().toISOString();
    return {
      ok: true,
      id: MATCH,
      status: 'active',
      role: 'host',
      kind: 'capitals',
      host_tag: 'MapWizard',
      guest_tag: 'AtlasKid',
      host_score: japan ? 2 : 1,
      guest_score: 0,
      current_round: japan ? 1 : 0,
      round_count: 5,
      round: {
        type: 'capital',
        country: japan ? 'Japan' : 'France',
        prompt: japan ? 'What is the capital of Japan?' : 'What is the capital of France?',
        subject: japan ? 'Japan' : 'France',
        sub: 'Capital',
        flag: japan ? null : '/assets/flags/fr.svg',
        flag_choices: false,
        choices: japan
          ? [{ text: 'Tokyo' }, { text: 'Osaka' }, { text: 'Kyoto' }, { text: 'Nagoya' }]
          : [{ text: 'Paris' }, { text: 'Lyon' }, { text: 'Nice' }, { text: 'Marseille' }]
      },
      rounds: [],
      round_results: [],
      answered_me: false,
      answered_them: false,
      round_started_at: startedAt,
      round_seconds: 18,
      i_won: false,
      draw: false
    };
  }

  function shotRound() {
    if (!shotStartedAt) shotStartedAt = new Date(Date.now() - 4000).toISOString();
    return {
      ok: true,
      id: MATCH,
      status: 'active',
      role: 'host',
      kind: 'mix',
      host_tag: 'MapWizard',
      guest_tag: 'AtlasKid',
      host_score: 1,
      guest_score: 0,
      current_round: 1,
      round_count: 5,
      round: {
        type: 'flag',
        country: 'France',
        prompt: 'Which country does this flag belong to?',
        subject: '',
        sub: 'Flag',
        flag: '/assets/flags/fr.svg',
        flag_choices: false,
        choices: [
          { text: 'France' },
          { text: 'Italy' },
          { text: 'Netherlands' },
          { text: 'Russia' }
        ]
      },
      rounds: [],
      round_results: [],
      answered_me: false,
      answered_them: false,
      round_started_at: shotStartedAt,
      round_seconds: 18,
      i_won: false,
      draw: false
    };
  }

  window.Cloud = {
    sb: {
      rpc: function (name) {
        var shot = /(?:\?|&)shot=1(?:&|$)/.test(location.search);
        if (name === 'pvp_match_state') {
          calls.state += 1;
          var view;
          if (shot) view = shotRound();
          else if (calls.state < 4) view = capitalRound(0);
          else if (calls.state === 4) view = capitalRound(1);
          else view = capitalRound(0);
          return Promise.resolve({ data: view });
        }
        if (name === 'pvp_submit_answer') {
          calls.submit += 1;
          return Promise.resolve({ data: { ok: true, waiting: true } });
        }
        if (name === 'pvp_list_inbox') {
          return Promise.resolve({ data: { ok: true, incoming: [], outgoing: [], active: null } });
        }
        if (name === 'pvp_lobby_list') {
          return Promise.resolve({ data: {
            ok: true,
            people: [
              { tag: 'MapWizard', mine: true, accent: '#1B4DFF', initial: 'M' },
              { tag: 'AtlasKid', mine: false, accent: '#0E9F6E', initial: 'A' }
            ]
          } });
        }
        if (name === 'pvp_lobby_chat_inbox') {
          return Promise.resolve({ data: { ok: true, messages: [] } });
        }
        return Promise.resolve({ data: { ok: true } });
      }
    }
  };

  window.Quiz = {
    flagImg: function (src, cls) {
      return '<img class="' + cls + '" src="' + src + '" alt="A flag" draggable="false">';
    }
  };

  function tagState() {
    if (!window.WW || !WW.state) return;
    WW.state.gamertag = 'MapWizard';
    WW.state.deviceId = 'host-device-1';
  }

  window.__bootDuel = function () {
    tagState();
    var shot = /(?:\?|&)shot=1(?:&|$)/.test(location.search);
    GeoDuel.mount(document.getElementById('games-stage'), { matchId: MATCH, kind: 'mix' });
    if (shot) return;
    var last = null;
    var jumps = 0;
    var timers = [];
    var prompt = '';
    setInterval(function () {
      var q = document.querySelector('[data-duel-q]');
      if (!q) return;
      if (last && last !== q) jumps += 1;
      last = q;
      var small = document.querySelector('.duel-round small');
      if (small && timers[timers.length - 1] !== small.textContent) timers.push(small.textContent);
      var p = q.querySelector('.qcard__prompt');
      if (p) prompt = p.textContent;
    }, 200);
    setTimeout(function () {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', bubbles: true }));
    }, 400);
    setTimeout(function () {
      var pre = document.createElement('pre');
      pre.id = 'duel-probe';
      pre.textContent = JSON.stringify({
        jumps: jumps,
        prompt: prompt,
        timers: timers,
        submits: calls.submit,
        cards: document.querySelectorAll('[data-duel-q]').length,
        states: calls.state
      });
      document.body.appendChild(pre);
    }, 6500);
  };

  window.__bootLobby = function () {
    tagState();
    LobbyCircles.mount({
      lobby: 'duel',
      hostEl: document.getElementById('host'),
      onChallenge: function () {}
    });
    var node = null;
    var jumps = 0;
    setInterval(function () {
      var btn = document.querySelector('[data-tag="AtlasKid"]');
      if (!btn) return;
      if (node && node !== btn) jumps += 1;
      node = btn;
    }, 200);
    setTimeout(function () {
      var anim = 0;
      if (node && node.getAnimations) {
        var list = node.getAnimations();
        if (list[0] && list[0].currentTime) anim = Math.round(list[0].currentTime);
      }
      var pre = document.createElement('pre');
      pre.id = 'lobby-probe';
      pre.textContent = JSON.stringify({ jumps: jumps, anim: anim });
      document.body.appendChild(pre);
    }, 6500);
  };
})();
