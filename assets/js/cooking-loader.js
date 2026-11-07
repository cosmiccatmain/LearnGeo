/* ------------------------------------------------------------------
   LearnGeo — Cooking loader (LEA-63)

   Shared “cooking” wait UI: a small charming pot loop + caption.
   Use CookingLoader.html() / .host() anywhere string-HTML loaders live.
   Administrator → Development can call CookingLoader.preview() (LEA-69).
-------------------------------------------------------------------*/
(function (global) {
  'use strict';

  var DEFAULT_CAPTION = 'cooking';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* Tiny SVG scene — original art, LearnGeo teal + gold flame. */
  function sceneSvg() {
    return (
      '<svg class="cook-loader__svg" viewBox="0 0 100 100" aria-hidden="true" focusable="false">' +
        '<ellipse class="cook-loader__plate" cx="50" cy="82" rx="28" ry="5"/>' +
        '<g class="cook-loader__flame">' +
          '<path d="M42 78 C42 72 46 70 48 66 C50 70 52 72 52 78 Z" fill="var(--cook-flame)" opacity=".95"/>' +
          '<path d="M48 78 C48 73 51 71 53 68 C55 72 56 74 56 78 Z" fill="var(--cook-flame-soft)"/>' +
        '</g>' +
        '<g class="cook-loader__flame cook-loader__flame--2">' +
          '<path d="M54 78 C54 73 57 71 58 67 C61 72 62 74 62 78 Z" fill="var(--cook-flame)" opacity=".9"/>' +
        '</g>' +
        '<path class="cook-loader__pot" d="M28 48 C28 44 32 42 36 42 H64 C68 42 72 44 72 48 V66 C72 72 66 76 50 76 C34 76 28 72 28 66 Z"/>' +
        '<path class="cook-loader__pot-inner" d="M32 50 C33 48 36 47 39 47 H61 C64 47 67 48 68 50 V64 C67 68 62 71 50 71 C38 71 33 68 32 64 Z"/>' +
        '<path class="cook-loader__pot-shine" d="M36 52 H64"/>' +
        '<g class="cook-loader__handle">' +
          '<path class="cook-loader__handle-a" d="M72 52 C84 50 86 58 78 60"/>' +
          '<path class="cook-loader__handle-b" d="M72 52 C84 50 86 58 78 60"/>' +
        '</g>' +
        '<ellipse class="cook-loader__broth" cx="50" cy="56" rx="16" ry="4.5"/>' +
        '<circle class="cook-loader__bubble" cx="44" cy="55" r="2.2"/>' +
        '<circle class="cook-loader__bubble cook-loader__bubble--2" cx="52" cy="57" r="1.7"/>' +
        '<circle class="cook-loader__bubble cook-loader__bubble--3" cx="57" cy="54" r="1.4"/>' +
        '<g class="cook-loader__lid">' +
          '<ellipse class="cook-loader__lid-base" cx="50" cy="42" rx="22" ry="5.5"/>' +
          '<ellipse class="cook-loader__lid-top" cx="50" cy="40.5" rx="20" ry="4.2"/>' +
          '<ellipse class="cook-loader__lid-gloss" cx="50" cy="39.5" rx="10" ry="2"/>' +
          '<circle class="cook-loader__knob" cx="50" cy="36" r="3.2"/>' +
          '<circle class="cook-loader__knob-dot" cx="50" cy="35.2" r="1.6"/>' +
        '</g>' +
        '<path class="cook-loader__steam" d="M40 34 C38 28 42 24 40 18"/>' +
        '<path class="cook-loader__steam cook-loader__steam--2" d="M50 32 C48 26 52 22 50 15"/>' +
        '<path class="cook-loader__steam cook-loader__steam--3" d="M60 34 C58 28 62 24 60 18"/>' +
      '</svg>'
    );
  }

  function normalize(opts) {
    opts = opts || {};
    var size = opts.size || 'md';
    if (size !== 'sm' && size !== 'md' && size !== 'lg' && size !== 'inline') size = 'md';
    var caption = opts.caption;
    if (caption === false || caption === null) caption = '';
    else if (caption == null || caption === true) caption = DEFAULT_CAPTION;
    return {
      size: size,
      caption: String(caption),
      dots: opts.dots !== false && !!String(caption),
      onDark: !!opts.onDark,
      label: opts.label || (String(caption) ? String(caption) : 'Loading')
    };
  }

  /* Compact widget: scene + optional caption. */
  function html(opts) {
    var o = normalize(opts);
    var cls = 'cook-loader cook-loader--' + o.size + (o.onDark ? ' cook-loader--on-dark' : '');
    var cap = o.caption
      ? '<p class="cook-loader__caption">' +
          esc(o.caption) +
          (o.dots
            ? '<span class="cook-loader__dots" aria-hidden="true"><i>.</i><i>.</i><i>.</i></span>'
            : '') +
        '</p>'
      : '';
    return (
      '<div class="' + cls + '" role="status" aria-live="polite" aria-label="' + esc(o.label) + '">' +
        '<div class="cook-loader__stage" aria-hidden="true">' +
          '<div class="cook-loader__glow"></div>' +
          sceneSvg() +
        '</div>' +
        cap +
      '</div>'
    );
  }

  /* Centered host for empty/loading panels. Optional note under caption. */
  function host(opts) {
    opts = opts || {};
    var tall = opts.tall ? ' cook-loader-host--tall' : '';
    var note = opts.note
      ? '<p class="cook-loader-host__note">' + esc(opts.note) + '</p>'
      : '';
    var loaderOpts = {
      size: opts.size || (opts.tall ? 'lg' : 'md'),
      caption: opts.caption,
      dots: opts.dots,
      label: opts.label
    };
    return '<div class="cook-loader-host' + tall + '">' + html(loaderOpts) + note + '</div>';
  }

  /* Absolute overlay for map hosts that already paint SVG content. */
  function overlay(opts) {
    opts = opts || {};
    return '<div class="wm-cooking">' + html({
      size: opts.size || 'sm',
      caption: opts.caption,
      dots: opts.dots,
      label: opts.label || 'Drawing the world'
    }) + '</div>';
  }

  var previewEl = null;
  var previewTimer = null;
  var previewKeyHandler = null;

  function hidePreview() {
    if (previewTimer) {
      clearTimeout(previewTimer);
      previewTimer = null;
    }
    if (previewKeyHandler) {
      document.removeEventListener('keydown', previewKeyHandler, true);
      previewKeyHandler = null;
    }
    if (previewEl && previewEl.parentNode) previewEl.parentNode.removeChild(previewEl);
    previewEl = null;
  }

  /* Full-screen preview (Admin Development + What’s New Try it).
     Auto-hides after `ms` (default 4s). Click Dismiss / press Escape to close.
     opts.hint overrides the small caption under the pot. */
  function preview(opts) {
    opts = opts || {};
    hidePreview();
    var ms = opts.ms == null ? 4000 : Math.max(800, Number(opts.ms) || 4000);
    var hint = opts.hint != null
      ? String(opts.hint)
      : 'Admin preview · auto-hides in a few seconds';
    var el = document.createElement('div');
    el.className = 'cook-loader-preview';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Cooking loader preview');
    el.innerHTML =
      '<div class="cook-loader-preview__card">' +
        html({
          size: opts.size || 'lg',
          caption: opts.caption,
          dots: opts.dots,
          label: opts.label || 'Cooking loader preview'
        }) +
        (hint
          ? '<p class="cook-loader-preview__hint">' + hint + '</p>'
          : '') +
        '<button type="button" class="btn btn--sm cook-loader-preview__dismiss" data-cook-dismiss>' +
          'Dismiss</button>' +
      '</div>';
    var dismissBtn = el.querySelector('[data-cook-dismiss]');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', function (e) {
        e.preventDefault();
        hidePreview();
      });
    }
    el.addEventListener('click', function (e) {
      if (e.target === el) hidePreview();
    });
    previewKeyHandler = function (e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        hidePreview();
      }
    };
    document.addEventListener('keydown', previewKeyHandler, true);
    document.body.appendChild(el);
    previewEl = el;
    previewTimer = setTimeout(hidePreview, ms);
    if (dismissBtn && typeof dismissBtn.focus === 'function') {
      try { dismissBtn.focus(); } catch (err) {}
    }
    return hidePreview;
  }

  global.CookingLoader = {
    html: html,
    host: host,
    overlay: overlay,
    preview: preview,
    hidePreview: hidePreview,
    caption: DEFAULT_CAPTION
  };
})(window);
