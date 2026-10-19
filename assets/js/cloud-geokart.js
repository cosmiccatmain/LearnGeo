/* ------------------------------------------------------------------
   LearnGeo — authoritative Geo Kart class transport

   This file is intentionally only transport. Race rendering and physics
   stay in geokart.js. The additive 0006_geokart.sql migration owns starts,
   answers/boosts, ordered checkpoints and finishes. When it is absent every
   method fails soft, so solo play and the rest of LearnGeo are unaffected.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';

  var setup = null;
  var probing = null;
  var watches = [];
  var POLL_ACTIVE = 1500;
  var POLL_HIDDEN = 6000;

  function sb() {
    var C = global.Cloud;
    return C && C.available ? C.sb : null;
  }

  function missing(err) {
    var code = err && err.code || '';
    var msg = err && err.message || '';
    return code === '42883' || code === '42P01' || code === 'PGRST202' ||
      code === 'PGRST205' || /kart_|Could not find the function|does not exist/i.test(msg);
  }

  function call(name, args) {
    var client = sb();
    if (!client) return Promise.reject(new Error('Sign in to use class races.'));
    return client.rpc(name, args || {}).then(function (res) {
      if (res.error) {
        if (missing(res.error)) {
          setup = false;
          var e = new Error('Geo Kart class racing is not configured yet.');
          e.code = 'GEOKART_NOT_CONFIGURED';
          throw e;
        }
        throw res.error;
      }
      setup = true;
      return res.data;
    });
  }

  function available(force) {
    if (!sb()) return Promise.resolve(false);
    if (!force && setup !== null) return Promise.resolve(setup);
    if (probing) return probing;
    probing = call('kart_now').then(function () { return true; }, function (err) {
      if (!missing(err) && err.code !== 'GEOKART_NOT_CONFIGURED' && global.console) {
        console.warn('Geo Kart availability check failed', err);
      }
      return false;
    }).then(function (ok) {
      setup = ok;
      probing = null;
      return ok;
    });
    return probing;
  }

  function open(classId, settings, questions) {
    return call('kart_open', {
      p_class: classId,
      p_settings: settings || {},
      p_questions: questions || []
    });
  }

  function join(code, name) {
    return call('kart_join', {
      p_code: String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6),
      p_name: String(name || '').trim().slice(0, 40)
    });
  }

  function findForClass(classId) {
    return call('kart_find', { p_class: classId });
  }

  function state(sessionId) {
    return call('kart_state', { p_session: sessionId });
  }

  function ready(sessionId, value) {
    return call('kart_ready', { p_session: sessionId, p_ready: value !== false });
  }

  function start(sessionId) {
    return call('kart_start', { p_session: sessionId });
  }

  function cancel(sessionId) {
    return call('kart_cancel', { p_session: sessionId });
  }

  function answer(sessionId, questionIndex, choice) {
    return call('kart_answer', {
      p_session: sessionId,
      p_question: questionIndex,
      p_choice: choice
    });
  }

  function useBoost(sessionId) {
    return call('kart_use_boost', { p_session: sessionId });
  }

  function checkpoint(sessionId, sequence) {
    return call('kart_checkpoint', { p_session: sessionId, p_sequence: sequence });
  }

  function finish(sessionId) {
    return call('kart_finish', { p_session: sessionId });
  }

  /* One channel carries durable database changes and lightweight position
     broadcasts. Positions are presentation only: the server never uses them
     for placements, laps or finishes. */
  function watch(sessionId, onState, onPosition) {
    if (!sessionId) return Promise.resolve(function () {});
    return available().then(function (ok) {
      if (!ok) {
        if (onState) onState(null);
        return function () {};
      }

      var stopped = false, timer = null, reading = false, again = false;
      var client = sb();
      var channel = client.channel('geokart:' + sessionId, {
        config: { broadcast: { self: false, ack: false } }
      });

      function delay() {
        return document.visibilityState === 'hidden' ? POLL_HIDDEN : POLL_ACTIVE;
      }
      function schedule(ms) {
        clearTimeout(timer);
        if (!stopped) timer = setTimeout(read, ms);
      }
      function read() {
        if (stopped) return;
        if (reading) { again = true; return; }
        reading = true;
        state(sessionId).then(function (snap) {
          reading = false;
          if (!stopped && onState) onState(snap);
          schedule(again ? 0 : delay());
          again = false;
        }, function (err) {
          reading = false;
          if (!stopped && global.console) console.warn('Geo Kart sync failed', err);
          schedule(delay());
        });
      }

      channel
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'kart_sessions', filter: 'id=eq.' + sessionId
        }, read)
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'kart_players', filter: 'session_id=eq.' + sessionId
        }, read)
        .on('broadcast', { event: 'position' }, function (message) {
          if (onPosition && message && message.payload) onPosition(message.payload);
        })
        .subscribe(function (status) {
          if (status === 'SUBSCRIBED') read();
        });

      /* Poll even if Realtime publication is not enabled yet. */
      schedule(0);

      function stop() {
        if (stopped) return;
        stopped = true;
        clearTimeout(timer);
        var i = watches.indexOf(stop);
        if (i !== -1) watches.splice(i, 1);
        try { client.removeChannel(channel); } catch (e) {}
      }
      stop.send = function (payload) {
        if (stopped) return;
        channel.send({ type: 'broadcast', event: 'position', payload: payload });
      };
      watches.push(stop);
      return stop;
    });
  }

  function stopAll() {
    watches.slice().forEach(function (stop) { try { stop(); } catch (e) {} });
  }

  global.GeoKartCloud = {
    available: available,
    open: open,
    join: join,
    findForClass: findForClass,
    state: state,
    ready: ready,
    start: start,
    cancel: cancel,
    answer: answer,
    useBoost: useBoost,
    checkpoint: checkpoint,
    finish: finish,
    watch: watch,
    stopAll: stopAll,
    get isSetUp() { return setup; }
  };
})(window);
