/* ------------------------------------------------------------------
   LearnGeo — Cloudflare Turnstile for Supabase Auth.

   One widget, explicit render, execution "execute" so a token is minted
   only when an auth call needs one. appearance "interaction-only" keeps
   a Managed widget invisible unless Cloudflare actually wants a tap.
   Tokens are single-use, so each checkout resets the widget when the
   caller is done, and checkouts run one at a time.

   Site key order: window.TURNSTILE_SITE_KEY if injected, then
   LearnGeoTurnstileConfig.SITE_KEY (assets/js/turnstile-config.js),
   then the public LearnGeo site key. The secret never lives here.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';

  var PUBLIC_SITE_KEY = '0x4AAAAAAF612GEfAQXNmqpL';
  var SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  var WAIT_MS = 120000;

  var widgetId = null;
  var host = null;
  var loading = null;
  var queue = Promise.resolve();
  var pending = null;
  var arming = false;
  var warned = false;
  var hasRun = false;

  function siteKey() {
    var injected = global.TURNSTILE_SITE_KEY;
    injected = injected ? String(injected).trim() : '';
    if (injected) return injected;
    var cfg = global.LearnGeoTurnstileConfig;
    var key = cfg && (cfg.SITE_KEY || cfg.siteKey);
    key = key ? String(key).trim() : '';
    return key || PUBLIC_SITE_KEY;
  }

  function isTestKey(key) {
    return key === '1x00000000000000000000AA' ||
      key === '1x00000000000000000000BB' ||
      key === '2x00000000000000000000AB' ||
      key === '2x00000000000000000000BB' ||
      key === '3x00000000000000000000FF';
  }

  function fail(kind) {
    var message = kind === 'load'
      ? 'The security check couldn’t load. Check your connection and try again.'
      : kind === 'expired'
        ? 'The security check expired. Try again.'
        : 'The security check didn’t finish. Try again.';
    var err = new Error(message);
    err.code = 'captcha_' + kind;
    return err;
  }

  function warnIfTestKeyOnLiveHost() {
    if (warned || !isTestKey(siteKey())) return;
    var hostName = '';
    try { hostName = String(global.location && global.location.hostname || ''); } catch (e) {}
    if (!hostName || hostName === 'localhost' || hostName === '127.0.0.1' || hostName === '0.0.0.0') return;
    warned = true;
    if (global.console && console.warn) {
      console.warn('LearnGeo Turnstile is still using Cloudflare’s test site key (' +
        siteKey() + '). Set LearnGeoTurnstileConfig.SITE_KEY to the production widget ' +
        'before enabling captcha in Supabase, or sign-in will fail.');
    }
  }

  function ensureHost() {
    if (host && host.isConnected) return host;
    host = global.document.createElement('div');
    host.id = 'lg-turnstile';
    host.className = 'lg-turnstile';
    global.document.body.appendChild(host);
    return host;
  }

  function loadApi() {
    if (global.turnstile && typeof global.turnstile.render === 'function') {
      return Promise.resolve();
    }
    if (loading) return loading;
    loading = new Promise(function (resolve, reject) {
      /* Dynamic scripts default to async, and turnstile.ready() refuses an
         async or defer tag. Force ordered execution and render from onload. */
      var s = global.document.createElement('script');
      s.src = SCRIPT;
      s.async = false;
      s.onload = function () { resolve(); };
      s.onerror = function () {
        loading = null;
        reject(fail('load'));
      };
      global.document.head.appendChild(s);
    });
    return loading;
  }

  function settle(err, token) {
    var job = pending;
    if (!job) return;
    pending = null;
    clearTimeout(job.timer);
    if (err) job.reject(err);
    else job.resolve(token);
  }

  function renderWidget() {
    if (widgetId != null && global.turnstile) return Promise.resolve(widgetId);
    return loadApi().then(function () {
      if (widgetId != null) return widgetId;
      warnIfTestKeyOnLiveHost();
      var el = ensureHost();
      widgetId = global.turnstile.render(el, {
        sitekey: siteKey(),
        execution: 'execute',
        appearance: 'interaction-only',
        retry: 'never',
        theme: 'auto',
        action: 'auth',
        callback: function (token) {
          if (arming) return;
          settle(null, token);
        },
        'error-callback': function () {
          if (arming) return;
          settle(fail('error'));
        },
        'expired-callback': function () {
          if (arming || !pending) return;
          settle(fail('expired'));
        },
        'timeout-callback': function () {
          if (arming) return;
          settle(fail('timeout'));
        }
      });
      return widgetId;
    });
  }

  function reset() {
    if (widgetId == null || !global.turnstile) return;
    arming = true;
    try { global.turnstile.reset(widgetId); } catch (e) { /* next execute retries */ }
    arming = false;
  }

  function executeOnce() {
    return renderWidget().then(function (id) {
      return new Promise(function (resolve, reject) {
        var timer = setTimeout(function () { settle(fail('timeout')); }, WAIT_MS);
        pending = { resolve: resolve, reject: reject, timer: timer };
        try {
          /* Resetting a widget that has never run makes Turnstile log
             no_div. The first execute is enough; later ones reset first
             because the previous token is single-use. */
          if (hasRun) {
            arming = true;
            try { global.turnstile.reset(id); } catch (e) { /* execute retries */ }
            arming = false;
          }
          hasRun = true;
          var ran = global.turnstile.execute(id);
          if (ran && typeof ran.then === 'function') {
            ran.then(function () {}, function () { settle(fail('error')); });
          }
        } catch (e) {
          arming = false;
          settle(fail('error'));
        }
      });
    });
  }

  /* Hand back a fresh token and hold the queue until done() so the next
     caller cannot reset this token out from under an in-flight auth call. */
  function checkout() {
    var release;
    var gate = new Promise(function (resolve) { release = resolve; });
    var run = queue.then(function () {
      return executeOnce().then(function (token) {
        var finished = false;
        return {
          token: token,
          done: function () {
            if (finished) return;
            finished = true;
            reset();
            release();
          }
        };
      }, function (err) {
        reset();
        release();
        throw err;
      });
    });
    queue = gate.then(function () {}, function () {});
    return run;
  }

  function preload() {
    if (!global.document || !global.document.head) return;
    warnIfTestKeyOnLiveHost();
    loadApi().then(renderWidget).catch(function () {});
  }

  global.LearnGeoTurnstile = {
    siteKey: siteKey,
    isTestKey: function () { return isTestKey(siteKey()); },
    checkout: checkout,
    reset: reset,
    preload: preload
  };
})(window);
