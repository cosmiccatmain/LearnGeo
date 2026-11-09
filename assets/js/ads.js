/* ------------------------------------------------------------------
   LearnGeo — explicit AdSense slots (LEA-118 / LEA-120).

   Auto ads / page-level ads stay off. Allowed inventory is a short
   list: home footer, a few Games hub banners, one 20s pre-game
   display, landing/teachers footers, and two shell rails (home and
   the Games hub only). Premium (flags.premium) skips every slot even
   while the public paywall is Admin-gated. 100,000,000 gems
   (economy.diamonds) skips ads for one play; they return on the next
   session/play.

   Web interstitial / vignette units are auto ads, so they stay off.
   The pre-game unit is a 300×250 display rectangle (rewarded-style:
   the unit sits on screen, Play stays locked for 20s). A branded
   frame stays visible until Google returns a creative — site approval
   and a numeric ad-unit id are still required for a real fill.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW;
  var cfg = global.LearnGeoMetricsConfig || {};
  var PUB = String(cfg.ADSENSE_PUBLISHER_ID || 'ca-pub-6903921330074472').trim();
  var GEM_SKIP = 100000000;
  var WAIT_MS = 20000;
  var RAIL_MQ = '(min-width: 900px)';
  var HUB_AFTER = { 5: 'games-hub-a', 10: 'games-hub-b', 15: 'games-hub-c' };
  var SIZES = {
    horizontal: { format: 'horizontal', width: '100%', height: '90px', responsive: 'true', box: 'ad-slot__box--horizontal', copy: 'Ad will show here' },
    rectangle: { format: 'rectangle', width: '300px', height: '250px', responsive: 'false', box: 'ad-slot__box--rectangle', copy: 'A short ad, then you play.' },
    vertical: { format: 'vertical', width: '160px', height: '600px', responsive: 'false', box: 'ad-slot__box--vertical', copy: 'Ad will show here' }
  };
  var overlay = null;
  var tickTimer = null;
  var watchTimer = null;
  var skipThisPlay = false;
  var waitMs = WAIT_MS;

  function premium() {
    var ww = global.WW || W;
    var s = ww && ww.state;
    if (s && s.flags && s.flags.premium) return true;
    if (global.Premium && typeof global.Premium.active === 'function' && global.Premium.active()) return true;
    return false;
  }

  function shouldShowAds() {
    if (premium()) return false;
    if (skipThisPlay) return false;
    return true;
  }

  function syncRoot() {
    var off = !shouldShowAds();
    if (document.documentElement) {
      document.documentElement.classList.toggle('ads-off', off);
      document.documentElement.classList.add('ads-explicit');
    }
    return !off;
  }

  function shapeFor(id) {
    if (id === 'pregame') return 'rectangle';
    if (id === 'shell-rail-left' || id === 'shell-rail-right') return 'vertical';
    return 'horizontal';
  }

  function unitIdFor(shape) {
    var c = global.LearnGeoMetricsConfig || cfg;
    var map = {
      horizontal: c.ADSENSE_UNIT_HORIZONTAL,
      rectangle: c.ADSENSE_UNIT_RECTANGLE,
      vertical: c.ADSENSE_UNIT_VERTICAL
    };
    var id = String((map[shape] || '')).trim();
    return /^\d{8,}$/.test(id) ? id : '';
  }

  function slotHtml(id, extraClass) {
    var shape = shapeFor(id);
    var size = SIZES[shape];
    var unit = unitIdFor(shape);
    var slotAttr = unit ? ' data-ad-slot="' + unit + '"' : '';
    return '<aside class="ad-slot ' + (extraClass || '') + '" data-ad-slot="' + id +
      '" data-ad-shape="' + shape + '" aria-label="Advertisement">' +
      '<span class="ad-slot__label">Advertisement</span>' +
      '<div class="ad-slot__box ' + size.box + '">' +
        '<div class="ad-slot__fallback">' +
          '<img class="ad-slot__mark" src="assets/img/brand/mark.svg" alt="" width="36" height="36">' +
          '<p class="ad-slot__fallback-copy"><strong>LearnGeo</strong><span>' + size.copy + '</span></p>' +
        '</div>' +
        '<ins class="adsbygoogle" style="display:inline-block;width:' + size.width +
          ';height:' + size.height + ';max-width:100%" data-ad-client="' + PUB + '"' + slotAttr +
          ' data-ad-format="' + size.format + '" data-full-width-responsive="' + size.responsive + '"></ins>' +
      '</div></aside>';
  }

  function homeFooterHtml() {
    if (!shouldShowAds()) return '';
    return slotHtml('home-footer', 'ad-slot--home');
  }

  function hubSlotAfter(index1) {
    if (!shouldShowAds()) return '';
    var id = HUB_AFTER[index1];
    if (!id) return '';
    return slotHtml(id, 'ad-slot--hub ad-slot--hub-row');
  }

  function mountRails() {
    if (!document.querySelector) return;
    var pairs = [
      ['.ad-rail--left', 'shell-rail-left'],
      ['.ad-rail--right', 'shell-rail-right']
    ];
    for (var i = 0; i < pairs.length; i++) {
      var host = document.querySelector(pairs[i][0]);
      if (!host || (host.querySelector && host.querySelector('.ad-slot'))) continue;
      host.innerHTML = slotHtml(pairs[i][1], 'ad-slot--rail');
    }
  }

  function wideScreen() {
    try {
      if (global.matchMedia) return !!global.matchMedia(RAIL_MQ).matches;
    } catch (err) {}
    return typeof global.innerWidth === 'number' && global.innerWidth >= 900;
  }

  function railsWanted() {
    if (overlay) return false;
    if (!shouldShowAds()) return false;
    if (!wideScreen()) return false;
    var body = document.body;
    if (!body || !body.classList) return false;
    if (body.classList.contains('view-portal')) return true;
    if (body.classList.contains('view-games')) {
      if (document.querySelector && document.querySelector('.games--play')) return false;
      if (global.Games && global.Games.playing && global.Games.playing()) return false;
      return true;
    }
    return false;
  }

  function syncRails() {
    mountRails();
    var on = railsWanted();
    if (document.documentElement && document.documentElement.classList) {
      document.documentElement.classList.toggle('ads-rails', on);
    }
    if (!document.querySelectorAll) return;
    var rails = document.querySelectorAll('.ad-rail');
    for (var i = 0; i < rails.length; i++) {
      if (on) rails[i].removeAttribute('hidden');
      else rails[i].setAttribute('hidden', '');
    }
    if (on) fill(document.getElementById ? document.getElementById('app') : document);
  }

  function disablePageLevelAds() {
    global.adsbygoogle = global.adsbygoogle || [];
    try {
      global.adsbygoogle.push({
        google_ad_client: PUB,
        enable_page_level_ads: false,
        overlays: { bottom: false }
      });
    } catch (err) { /* AdSense script may not have arrived yet */ }
  }

  function slotMeasurable(ins) {
    if (!ins || typeof ins.getBoundingClientRect !== 'function') return true;
    var rail = ins.closest && ins.closest('.ad-rail');
    if (rail && (rail.hidden || (rail.hasAttribute && rail.hasAttribute('hidden')))) return false;
    var rect = ins.getBoundingClientRect();
    return rect.width >= 40 && rect.height >= 40;
  }

  function markUnfilled(ins) {
    var slot = ins && ins.closest && ins.closest('.ad-slot');
    if (!slot || !slot.classList || slot.classList.contains('is-filled')) return;
    slot.classList.add('is-unfilled');
  }

  function markFilled(ins) {
    var slot = ins && ins.closest && ins.closest('.ad-slot');
    if (!slot || !slot.classList) return;
    slot.classList.add('is-filled');
    slot.classList.remove('is-unfilled');
  }

  function watchStatus(ins) {
    if (!ins || !ins.getAttribute) return;
    function apply() {
      var status = ins.getAttribute('data-ad-status');
      if (status === 'filled') markFilled(ins);
      else if (status === 'unfilled' || status === 'unfill-optimized') markUnfilled(ins);
    }
    apply();
    if (typeof global.MutationObserver === 'function' && ins.nodeType === 1) {
      try {
        var obs = new global.MutationObserver(apply);
        obs.observe(ins, { attributes: true, attributeFilter: ['data-ad-status'] });
      } catch (err) {}
    }
    if (typeof global.setTimeout === 'function') {
      global.setTimeout(function () {
        if (!ins.getAttribute || ins.getAttribute('data-ad-status') === 'filled') return;
        markUnfilled(ins);
      }, 1200);
    }
  }

  function stampUnit(ins) {
    if (!ins || !ins.getAttribute || ins.getAttribute('data-ad-slot')) return;
    var slot = ins.closest && ins.closest('[data-ad-shape]');
    var shape = slot && slot.getAttribute ? slot.getAttribute('data-ad-shape') : '';
    var unit = unitIdFor(shape || 'horizontal');
    if (unit && ins.setAttribute) ins.setAttribute('data-ad-slot', unit);
  }

  function fill(root) {
    if (!syncRoot()) return;
    mountRails();
    global.adsbygoogle = global.adsbygoogle || [];
    var scope = root || document;
    if (!scope.querySelectorAll) return;
    var nodes = scope.querySelectorAll('ins.adsbygoogle');
    for (var i = 0; i < nodes.length; i++) {
      var ins = nodes[i];
      if (!ins.getAttribute) continue;
      if (ins.getAttribute('data-adsbygoogle-status') || ins.getAttribute('data-lg-filled')) continue;
      if (ins.closest && ins.closest('#games-stage, .games--play, .map-pane')) continue;
      if (!slotMeasurable(ins)) continue;
      stampUnit(ins);
      try {
        global.adsbygoogle.push({});
        ins.setAttribute('data-lg-filled', '1');
      } catch (err) {
        ins.setAttribute('data-lg-filled', '1');
        markUnfilled(ins);
      }
      watchStatus(ins);
    }
  }

  function diamonds() {
    return (W && W.state && W.state.economy && W.state.economy.diamonds) || 0;
  }

  function buySkip() {
    if (premium()) return { ok: true, reason: 'premium' };
    var have = diamonds();
    if (!W || typeof W.spend !== 'function' || !W.spend(GEM_SKIP)) {
      var msg = 'Skipping ads costs ' + GEM_SKIP.toLocaleString() +
        ' gems. You have ' + Number(have).toLocaleString() + '.';
      if (W && W.toast) {
        W.toast('Not enough gems', msg, (W.Icons && W.Icons.gem) || null, 4200);
      }
      return { ok: false, error: 'cant_afford', have: have, need: GEM_SKIP, message: msg };
    }
    skipThisPlay = true;
    if (global.UI && global.UI.refreshHud) global.UI.refreshHud();
    return { ok: true };
  }

  function notePlayStarted() {
    skipThisPlay = false;
  }

  function clearTimers() {
    if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
    if (watchTimer) { clearInterval(watchTimer); watchTimer = null; }
  }

  function closePregame() {
    clearTimers();
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null;
    syncRails();
  }

  function enablePlay(playBtn, countEl) {
    if (!playBtn || (playBtn.disabled === false && playBtn.getAttribute('data-ready') === '1')) return;
    playBtn.disabled = false;
    playBtn.setAttribute('data-ready', '1');
    playBtn.textContent = 'Play';
    if (countEl) countEl.textContent = '0';
  }

  function watchAdEnded(ins, onEnd) {
    if (!ins || !onEnd) return;
    var fired = false;
    function fire() {
      if (fired) return;
      fired = true;
      onEnd();
    }
    watchTimer = setInterval(function () {
      /* adsbygoogle-status="done" means the unit filled, not that a
         creative finished. Only an explicit end (video complete / test
         hook) may unlock Play before 20s. */
      if (ins.getAttribute('data-ad-ended') === '1') fire();
    }, 250);
    ins.addEventListener('learngeo:ad-ended', fire);
  }

  function notifyAdEnded() {
    if (!overlay) return;
    var ins = overlay.querySelector('ins.adsbygoogle');
    if (ins) ins.setAttribute('data-ad-ended', '1');
    var playBtn = overlay.querySelector('[data-ad-play]');
    var countEl = overlay.querySelector('[data-ad-count]');
    enablePlay(playBtn, countEl);
  }

  function showPregame(opts) {
    opts = opts || {};
    var onPlay = opts.onPlay || function () {};
    closePregame();
    if (!shouldShowAds()) {
      onPlay();
      return;
    }
    overlay = document.createElement('div');
    overlay.className = 'ad-pregame';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'ad-pregame-title');
    var title = (opts.title ? String(opts.title) : 'this game');
    overlay.innerHTML =
      '<div class="ad-pregame__card">' +
        '<p class="ad-pregame__kicker" id="ad-pregame-title">Before you play ' +
          (W && W.escapeHtml ? W.escapeHtml(title) : title) + '</p>' +
        '<div class="ad-pregame__count"><span data-ad-count>' + Math.ceil(waitMs / 1000) +
          '</span><small>seconds</small></div>' +
        slotHtml('pregame', 'ad-slot--pregame') +
        '<div class="ad-pregame__actions">' +
          '<button class="btn btn--accent btn--lg" type="button" data-ad-play disabled>Play in ' +
            Math.ceil(waitMs / 1000) + 's</button>' +
          '<button class="btn btn--ghost" type="button" data-ad-gem>Skip this play · ' +
            GEM_SKIP.toLocaleString() + ' 💎</button>' +
          '<button class="btn btn--quiet btn--sm" type="button" data-ad-back>Back</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    fill(overlay);
    syncRails();

    var playBtn = overlay.querySelector('[data-ad-play]');
    var countEl = overlay.querySelector('[data-ad-count]');
    var gemBtn = overlay.querySelector('[data-ad-gem]');
    var backBtn = overlay.querySelector('[data-ad-back]');
    var ins = overlay.querySelector('ins.adsbygoogle');
    var left = waitMs;
    var started = Date.now();

    function tick() {
      left = Math.max(0, waitMs - (Date.now() - started));
      var secs = Math.ceil(left / 1000);
      if (countEl) countEl.textContent = String(secs);
      if (left <= 0) {
        clearTimers();
        enablePlay(playBtn, countEl);
        return;
      }
      if (playBtn && playBtn.getAttribute('data-ready') !== '1') {
        playBtn.textContent = 'Play in ' + secs + 's';
      }
    }
    tickTimer = setInterval(tick, 200);
    watchAdEnded(ins, function () {
      clearTimers();
      enablePlay(playBtn, countEl);
    });

    playBtn.addEventListener('click', function () {
      if (playBtn.disabled) return;
      closePregame();
      onPlay();
    });
    gemBtn.addEventListener('click', function () {
      var res = buySkip();
      if (!res.ok) return;
      closePregame();
      onPlay();
    });
    backBtn.addEventListener('click', function () {
      closePregame();
    });
  }

  function boot() {
    disablePageLevelAds();
    syncRoot();
    mountRails();
    syncRails();
    fill();
    if (global.matchMedia) {
      try {
        var mq = global.matchMedia(RAIL_MQ);
        if (mq.addEventListener) mq.addEventListener('change', syncRails);
        else if (mq.addListener) mq.addListener(syncRails);
      } catch (err) {}
    }
    if (global.addEventListener) global.addEventListener('resize', syncRails);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  global.LearnGeoAds = {
    PUBLISHER_ID: PUB,
    GEM_SKIP: GEM_SKIP,
    WAIT_MS: WAIT_MS,
    HUB_AFTER: HUB_AFTER,
    shouldShowAds: shouldShowAds,
    slotHtml: slotHtml,
    homeFooterHtml: homeFooterHtml,
    hubSlotAfter: hubSlotAfter,
    fill: fill,
    mountRails: mountRails,
    syncRails: syncRails,
    disablePageLevelAds: disablePageLevelAds,
    buySkip: buySkip,
    notePlayStarted: notePlayStarted,
    showPregame: showPregame,
    closePregame: closePregame,
    notifyAdEnded: notifyAdEnded,
    syncRoot: syncRoot,
    /* tests only */
    _setWaitMs: function (ms) { waitMs = ms; },
    _skipThisPlay: function () { return skipThisPlay; },
    _setSkipThisPlay: function (v) { skipThisPlay = !!v; }
  };
})(window);
