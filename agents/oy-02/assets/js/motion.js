/* ------------------------------------------------------------------
   LearnGeo — motion layer.

   Click ripples, the cursor light on cards, view and report entrances,
   exit fades for modals and the profile menu, and landing scroll
   reveals. It only watches the DOM the other modules build and never
   calls into them, so it can be removed without touching anything else.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var doc = global.document;
  if (!doc || !global.Element || !Element.prototype.animate) return;

  var OUT = 'cubic-bezier(.16,1,.3,1)';
  var SPRING = 'cubic-bezier(.34,1.56,.64,1)';
  var mq = global.matchMedia ? global.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function still() { return !!(mq && mq.matches); }
  function now() { return global.performance ? performance.now() : Date.now(); }
  function each(list, fn) { Array.prototype.forEach.call(list, fn); }
  function hasWord(str, word) { return (' ' + (str || '') + ' ').indexOf(' ' + word + ' ') !== -1; }

  /* ============================= ripple =============================
     Drawn in #fx-layer over the pressed element rather than inside it,
     so no module ever finds an extra child in its own markup. */
  var INK = '.btn, .option, .tab, .seg button, .fc-rate button, .mini-btn, .icon-btn, ' +
            '.menu__item, .rec, .cw-row, .role-opt, .check, .portal-mode, .shop-item, ' +
            '.navcell, .vtab, .cr-tab, .picker__hit, .code-chip button, .avatar-btn';
  var TABS = '.cr-tab, .vtab';
  var tabTap = { at: 0, root: null };

  function inkColour(host) {
    var m = getComputedStyle(host).color.match(/[\d.]+/g);
    if (!m) return 'rgba(27,77,255,.16)';
    var lum = (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) / 255;
    return lum > 0.7 ? 'rgba(255,255,255,.42)' : 'rgba(27,77,255,.16)';
  }

  function ripple(e) {
    if (!e.target.closest) return;
    var tab = e.target.closest(TABS);
    if (tab) { tabTap.at = now(); tabTap.root = tab.closest('.portal') || tab.closest('.modal'); }

    if (still() || (e.pointerType === 'mouse' && e.button !== 0)) return;
    var host = e.target.closest(INK);
    if (!host || host.disabled || host.classList.contains('is-locked')) return;
    var r = host.getBoundingClientRect();
    if (!r.width || !r.height) return;

    var wrap = doc.createElement('span');
    wrap.className = 'lg-ripple-wrap';
    wrap.style.cssText = 'left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' +
                         r.height + 'px;border-radius:' + getComputedStyle(host).borderRadius;
    var x = e.clientX - r.left, y = e.clientY - r.top;
    var size = 2 * Math.sqrt(Math.pow(Math.max(x, r.width - x), 2) + Math.pow(Math.max(y, r.height - y), 2));
    var dot = doc.createElement('span');
    dot.className = 'lg-ripple';
    dot.style.cssText = 'width:' + size + 'px;height:' + size + 'px;left:' + (x - size / 2) + 'px;top:' +
                        (y - size / 2) + 'px;background:' + inkColour(host);
    wrap.appendChild(dot);
    (doc.getElementById('fx-layer') || doc.body).appendChild(wrap);

    var done = function () { if (wrap.parentNode) wrap.remove(); };
    dot.animate([{ transform: 'scale(0)', opacity: 1 }, { transform: 'scale(1)', opacity: 0 }],
                { duration: 650, easing: OUT }).onfinish = done;
    setTimeout(done, 1000);
  }
  doc.addEventListener('pointerdown', ripple, { passive: true });

  /* ========================= card cursor light ====================== */
  var GLOW = '.mode-card, .portal-mode, .rec, .cw-row, .role-opt, .shop-item';
  var glow = { el: null, x: 0, y: 0, queued: false };

  function paintGlow() {
    glow.queued = false;
    if (!glow.el) return;
    var r = glow.el.getBoundingClientRect();
    glow.el.style.setProperty('--lg-x', (glow.x - r.left) + 'px');
    glow.el.style.setProperty('--lg-y', (glow.y - r.top) + 'px');
  }
  doc.addEventListener('pointermove', function (e) {
    if (e.pointerType !== 'mouse' || !e.target.closest) return;
    glow.el = e.target.closest(GLOW);
    if (!glow.el) return;
    glow.x = e.clientX; glow.y = e.clientY;
    if (!glow.queued) { glow.queued = true; requestAnimationFrame(paintGlow); }
  }, { passive: true });

  /* ======================= staggered entrances ====================== */
  var VIEW_PARTS = '.portal__head, .metric, .portal-mode, .rec, .panel, .cr-banner, .cr-tabs, .cr-card, ' +
                   '.cw-row, .tcard, .an-stat, .join-card, .empty-cta, .setup-panel > *, .score-hero, ' +
                   '.breakdown, .brow, .review-item, .quiz-table';
  var TAB_PARTS  = '.cr-card, .cw-row, .tcard, .an-stat, .panel, .rec, .empty-cta, .gb-wrap, .person, ' +
                   '.assign-row, .join-card, .an-grid, .setting-row, .shop-item, .ach-row';
  var MODAL_PARTS = '.modal__body > *, .shop-item, .ach-row, .setting-row';

  /* outermost matches only, so a card and the panel around it don't both slide */
  function pick(root, sel, max) {
    var out = [], all = root.querySelectorAll(sel);
    for (var i = 0; i < all.length && out.length < max; i++) {
      var el = all[i], nested = false;
      for (var j = 0; j < out.length; j++) if (out[j].contains(el)) { nested = true; break; }
      if (!nested && el.getClientRects().length) out.push(el);
    }
    return out;
  }

  function cascade(root, sel, max, step, lift) {
    pick(root, sel, max).forEach(function (el, i) {
      el.animate([{ opacity: 0, transform: 'translateY(' + lift + 'px)' }, { opacity: 1, transform: 'none' }],
                 { duration: 560, delay: 40 + i * step, easing: OUT, fill: 'backwards' });
    });
  }

  function growBars(root) {
    each(root.querySelectorAll('.pbar__fill, .an-bar__fill'), function (bar, i) {
      if (i > 40) return;
      bar.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }],
                  { duration: 900, delay: 120 + i * 25, easing: OUT, fill: 'backwards' });
    });
    each(root.querySelectorAll('.hist__bar'), function (bar, i) {
      bar.animate([{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }],
                  { duration: 800, delay: 120 + i * 30, easing: OUT, fill: 'backwards' });
    });
  }

  var entered = typeof WeakMap === 'function' ? new WeakMap() : null;

  function enterView(el) {
    if (entered) entered.set(el, now());
    /* a translated Leaflet pane mis-aims clicks for a moment, so maps only fade */
    var hasMap = !!el.querySelector('.leaflet-container');
    el.animate(hasMap ? [{ opacity: 0 }, { opacity: 1 }]
                      : [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }],
               { duration: hasMap ? 320 : 440, easing: OUT });
    cascade(el, VIEW_PARTS, 16, 38, 14);
    growBars(el);
  }

  var SECTIONS = { 'test-setup': 1, 'test-report': 1, 'quiz-setup': 1, 'quiz-report': 1 };

  function reveal(el) {
    if (typeof el.animate !== 'function') return;
    if (el.id && (el.id.indexOf('view-') === 0 || SECTIONS[el.id])) return enterView(el);
    if (el.id === 'landing') return el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 380, easing: OUT });
    if (el.classList.contains('hud__item')) {
      return el.animate([{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'none' }],
                        { duration: 480, easing: SPRING });
    }
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: OUT });
  }

  /* Anything that loses .hidden fades in; views and reports also cascade. */
  new MutationObserver(function (records) {
    if (still()) return;
    var shown = [];
    records.forEach(function (r) {
      var el = r.target, cls = el.getAttribute('class');
      if (el.id === 'app' && !hasWord(r.oldValue, 'is-open') && hasWord(cls, 'is-open')) {
        if (shown.indexOf(el) === -1) {
          shown.push(el);
          el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 380, easing: OUT });
        }
        return;
      }
      if (!hasWord(r.oldValue, 'hidden') || hasWord(cls, 'hidden') || !el.isConnected) return;
      if (el.closest('[data-lg-ghost]') || shown.indexOf(el) !== -1) return;
      shown.push(el);
      reveal(el);
    });
  }).observe(doc.body, { attributes: true, attributeFilter: ['class'], attributeOldValue: true, subtree: true });

  /* Classroom / teacher sub-tabs re-render their content: cascade it once per tap. */
  new MutationObserver(function (records) {
    if (still() || !tabTap.root || now() - tabTap.at > 700) return;
    var root = tabTap.root;
    if (!records.some(function (r) { return r.addedNodes.length && root.contains(r.target); })) return;
    if (entered && now() - (entered.get(root) || 0) < 200) return;
    tabTap.root = null;
    cascade(root, TAB_PARTS, 14, 30, 10);
    growBars(root);
  }).observe(doc.body, { childList: true, subtree: true });

  /* ==================== modal / menu open and close =================
     ui.js removes these instantly. A detached, id-less copy is put back
     in the same spot to play the exit, then removed. */
  function leaveCopy(node, parent, before) {
    if (still() || node.isConnected || node.hasAttribute('data-lg-ghost')) return;
    var copy = node.cloneNode(true);
    var from = node.querySelectorAll('input, textarea, select');
    var to = copy.querySelectorAll('input, textarea, select');
    for (var i = 0; i < from.length && i < to.length; i++) {
      to[i].value = from[i].value;
      if (from[i].type === 'checkbox' || from[i].type === 'radio') to[i].checked = from[i].checked;
    }
    copy.removeAttribute('id');
    each(copy.querySelectorAll('[id]'), function (n) { n.removeAttribute('id'); });
    each(copy.querySelectorAll('[name]'), function (n) { n.removeAttribute('name'); });
    copy.setAttribute('data-lg-ghost', '');
    copy.setAttribute('aria-hidden', 'true');
    copy.setAttribute('inert', '');
    copy.classList.add('lg-leaving');
    parent.insertBefore(copy, before && before.parentNode === parent ? before : null);
    var gone = function () { if (copy.parentNode) copy.remove(); };
    copy.addEventListener('animationend', function (e) { if (e.target === copy) gone(); });
    setTimeout(gone, 450);
  }

  function watchLayer(parent) {
    if (!parent) return;
    new MutationObserver(function (records) {
      records.forEach(function (r) {
        each(r.removedNodes, function (n) {
          if (n.nodeType === 1 && (n.classList.contains('overlay') || n.classList.contains('menu'))) {
            leaveCopy(n, r.target, r.nextSibling);
          }
        });
        if (still()) return;
        each(r.addedNodes, function (n) {
          if (n.nodeType === 1 && n.classList.contains('overlay') && !n.hasAttribute('data-lg-ghost')) {
            cascade(n, MODAL_PARTS, 18, 26, 8);
          }
        });
      });
    }).observe(parent, { childList: true });
  }
  watchLayer(doc.body);
  watchLayer(doc.querySelector('.topbar'));

  /* ============================= landing ============================ */
  var land = doc.getElementById('landing');

  function heroIntro() {
    if (!land || land.classList.contains('hidden')) return;
    each(land.querySelectorAll('.hero h1, .hero__sub, .hero__cta, .hero__note'), function (el, i) {
      el.animate([{ opacity: 0, transform: 'translateY(16px)', filter: 'blur(8px)' },
                  { opacity: 1, transform: 'none', filter: 'none' }],
                 { duration: 900, delay: 60 + i * 90, easing: OUT, fill: 'backwards' });
    });
  }

  /* Content starts hidden, so it must never be left that way: the observer
     is the smooth path, and a plain position check on scroll/resize/load is
     the backstop for browsers where the observer is late or never fires. */
  function scrollReveal() {
    if (!land) return;
    var waiting = Array.prototype.slice.call(
      land.querySelectorAll('.section__head, .mode-card, .step, .shot, .split > div, .prose-block, .stat'));
    var io = 'IntersectionObserver' in global ? new IntersectionObserver(function (entries) {
      show(entries.filter(function (en) { return en.isIntersecting; }).map(function (en) { return en.target; }));
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' }) : null;

    function show(els) {
      els.forEach(function (el, i) {
        var at = waiting.indexOf(el);
        if (at === -1) return;
        waiting.splice(at, 1);
        if (io) io.unobserve(el);
        el.classList.remove('lg-pre');
        el.animate([{ opacity: 0, transform: 'translateY(24px)', filter: 'blur(6px)' },
                    { opacity: 1, transform: 'none', filter: 'none' }],
                   { duration: 800, delay: Math.min(i, 6) * 70, easing: OUT, fill: 'backwards' });
      });
      if (!waiting.length) {
        global.removeEventListener('scroll', soon);
        global.removeEventListener('resize', soon);
      }
    }

    var timer = 0;
    function sweep() {
      timer = 0;
      if (land.classList.contains('hidden')) return;
      var edge = global.innerHeight * 0.94;
      show(waiting.filter(function (el) { return el.getBoundingClientRect().top < edge; }));
    }
    function soon() { if (!timer) timer = setTimeout(sweep, 120); }

    waiting.forEach(function (el) { el.classList.add('lg-pre'); if (io) io.observe(el); });
    global.addEventListener('scroll', soon, { passive: true });
    global.addEventListener('resize', soon);
    global.addEventListener('load', soon);
    setTimeout(sweep, 600);
  }

  function navShadow() {
    var nav = land && land.querySelector('.nav');
    if (!nav) return;
    var on = function () { nav.classList.toggle('lg-scrolled', global.scrollY > 8); };
    global.addEventListener('scroll', on, { passive: true });
    on();
  }

  /* in-page links glide instead of jumping */
  doc.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('#landing a[href^="#"]');
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey) return;
    var id = a.getAttribute('href').slice(1);
    var target = id && doc.getElementById(id);
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: still() ? 'auto' : 'smooth', block: 'start' });
    if (global.history && history.replaceState) history.replaceState(null, '', '#' + id);
  });

  navShadow();
  if (!still()) { heroIntro(); scrollReveal(); }
})(window);
