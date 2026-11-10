/* ------------------------------------------------------------------
   LearnGeo — Cloudflare Turnstile site key.

   Public config, same idea as assets/js/metrics-config.js. This value
   ships in the page. It is not a secret. The Turnstile secret key is
   pasted only into the Supabase dashboard (Authentication > Bot and
   Abuse Protection) and must never be committed.

   The widget hostnames are learngeo.app, www.learngeo.app and localhost.

   TURNSTILE_SITE_KEY wins when something sets window.TURNSTILE_SITE_KEY
   before this file runs. This static site has no build step, so the
   public site key below is what production uses unless that override
   is injected.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var PUBLIC_SITE_KEY = '0x4AAAAAAF612GEfAQXNmqpL';
  var injected = global.TURNSTILE_SITE_KEY;
  injected = injected ? String(injected).trim() : '';
  global.LearnGeoTurnstileConfig = {
    SITE_KEY: injected || PUBLIC_SITE_KEY
  };
})(window);
