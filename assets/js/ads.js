/* ------------------------------------------------------------------
   LearnGeo — explicit AdSense slots (LEA-118).

   Auto ads / page-level ads stay off. Allowed inventory is a short
   list: home footer, a few Games hub banners, one 20s pre-game
   interstitial, plus a single footer on the public landing/teachers
   pages. Premium (flags.premium) skips every slot even while the
   public paywall is Admin-gated. 100,000,000 gems (economy.diamonds)
   skips ads for one play; they return on the next session/play.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW;
  var cfg = global.LearnGeoMetricsConfig || {};
  var PUB = String(cfg.ADSENSE_PUBLISHER_ID || 'ca-pub-6903921330074472').trim();
  var GEM_SKIP = 100000000;
  var WAIT_MS = 20000;
  var HUB_AFTER = { 5: 'games-hub-a', 10: 'games-hub-b', 15: 'games-hub-c' };
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

  function slotHtml(id, extraClass) {
    return '<aside class="ad-slot ' + (extraClass || '') + '" data-ad-slot="' + id +
      '" aria-label="Advertisement">' +
      '<span class="ad-slot__label">Advertisement</span>' +
      '<ins class="adsbygoogle" style="display:block" data-ad-client="' + PUB +
      '" data-ad-format="auto" data-full-width-responsive="true"></ins></aside>';
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

  function fill(root) {
    if (!syncRoot()) return;
    global.adsbygoogle = global.adsbygoogle || [];
    var scope = root || document;
    if (!scope.querySelectorAll) return;
    var nodes = scope.querySelectorAll('ins.adsbygoogle');
    for (var i = 0; i < nodes.length; i++) {
      var ins = nodes[i];
      if (ins.getAttribute('data-adsbygoogle-status') || ins.getAttribute('data-lg-filled')) continue;
      if (ins.closest('#games-stage, .games--play, .map-pane')) continue;
      ins.setAttribute('data-lg-filled', '1');
      try { global.adsbygoogle.push({}); } catch (err) {}
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
    fill();
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
