/* ------------------------------------------------------------------
   LearnGeo — GA4, Vercel Insights custom events, AdSense slots.

   Empty GA4_MEASUREMENT_ID means zero gtag network calls. AdSense is
   loaded by the official <head> snippet (not from here) so Google's
   site crawler can verify the publisher ID. Display slots are filled
   here; Auto ads / overlays are hidden on in-round canvases.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var cfg = global.LearnGeoMetricsConfig || {};
  var gaId = String(cfg.GA4_MEASUREMENT_ID || '').trim();
  var adsId = String(cfg.ADSENSE_PUBLISHER_ID || '').trim();
  var gaReady = false;
  var lastPath = '';
  var ROUND_VIEWS = { learn: 1, test: 1, quiz: 1, roadtrip: 1 };

  function validGa(id) {
    return /^G-[A-Z0-9]{6,}$/.test(id);
  }

  function validAds(id) {
    return /^ca-pub-\d{10,}$/.test(id);
  }

  function vaEvent(name, data) {
    try {
      if (typeof global.va === 'function') {
        global.va('event', { name: name, data: data || {} });
      }
    } catch (err) { /* insights script is absent on a local Python server */ }
  }

  function loadGtag() {
    if (!validGa(gaId) || gaReady) return;
    gaReady = true;
    global.dataLayer = global.dataLayer || [];
    global.gtag = function () { global.dataLayer.push(arguments); };
    global.gtag('js', new Date());
    global.gtag('config', gaId, { send_page_view: false, anonymize_ip: true });
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(gaId);
    document.head.appendChild(s);
  }

  function pageView(path) {
    path = path || (global.location.pathname + global.location.search);
    if (path === lastPath) return;
    lastPath = path;
    vaEvent('page_view', { path: path });
    if (gaReady && typeof global.gtag === 'function') {
      global.gtag('event', 'page_view', { page_path: path, page_location: global.location.href });
    }
  }

  function currentView() {
    var m = document.body && document.body.className && document.body.className.match(/\bview-(\w+)/);
    return m ? m[1] : '';
  }

  function inRound() {
    var view = currentView();
    if (ROUND_VIEWS[view]) return true;
    return !!(global.Games && global.Games.playing && global.Games.playing());
  }

  function syncGameplay() {
    var hide = inRound();
    document.documentElement.classList.toggle('ads-gameplay', hide);
    var chrome = document.getElementById('app-ad-chrome');
    if (chrome) {
      var view = currentView();
      chrome.hidden = hide || view === 'games';
    }
  }

  function fillSlots() {
    if (!validAds(adsId) || inRound()) return;
    global.adsbygoogle = global.adsbygoogle || [];
    var nodes = document.querySelectorAll('ins.adsbygoogle');
    for (var i = 0; i < nodes.length; i++) {
      var ins = nodes[i];
      if (ins.getAttribute('data-adsbygoogle-status')) continue;
      if (ins.closest('#games-stage, .games--play, .map-pane')) continue;
      try { global.adsbygoogle.push({}); } catch (err) {}
    }
  }

  function wrapRouter() {
    var r = global.AppRouter;
    if (!r || r.__metricsWrapped) return;
    r.__metricsWrapped = true;
    var orig = r.record;
    r.record = function (view, opts) {
      orig.call(r, view, opts);
      pageView(global.location.pathname + global.location.search);
      syncGameplay();
      fillSlots();
    };
  }

  function wireCtas() {
    document.addEventListener('click', function (e) {
      var t = e.target && e.target.closest && e.target.closest('[data-launch], #nav-signup, #hero-signup, #cta-signup, #nav-signin, #nav-continue');
      if (!t) return;
      vaEvent('cta_click', { id: t.id || t.getAttribute('data-launch') || 'cta' });
    }, true);
  }

  function boot() {
    loadGtag();
    wrapRouter();
    wireCtas();
    syncGameplay();
    fillSlots();
    pageView();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  global.LearnGeoMetrics = {
    pageView: pageView,
    fillSlots: fillSlots,
    syncGameplay: syncGameplay,
    hasGa: function () { return validGa(gaId); },
    hasAds: function () { return validAds(adsId); }
  };
})(window);
