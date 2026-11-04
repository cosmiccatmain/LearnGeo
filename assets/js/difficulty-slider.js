/* ------------------------------------------------------------------
   LearnGeo — Difficulty slider
   Reusable nebula-track level control for game setup panels.
   Thumb position comes from the native range input (input/change),
   not from requestAnimationFrame, so background-tab throttle cannot
   leave labels or the value out of sync with what the player sees.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';

  var SPARK =
    '<svg class="diff-slider__spark" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<path fill="currentColor" d="M12 1.6l1.7 6.2 6.3 1.7-6.3 1.7L12 17.4l-1.7-6.2L4 9.5l6.3-1.7L12 1.6z"/>' +
    '</svg>';

  function clamp(n, min, max) {
    n = +n;
    if (!(n >= min)) return min;
    if (!(n <= max)) return max;
    return Math.round(n);
  }

  function findLevel(levels, value) {
    var i, hit = levels[0];
    for (i = 0; i < levels.length; i++) {
      if (+levels[i].value === +value) return levels[i];
    }
    return hit;
  }

  /* levels: [{ value, name, blurb }, ...] — value is the persisted level id */
  function html(opts) {
    opts = opts || {};
    var levels = opts.levels || [];
    if (!levels.length) return '';

    var min = opts.min != null ? +opts.min : +levels[0].value;
    var max = opts.max != null ? +opts.max : +levels[levels.length - 1].value;
    var value = clamp(opts.value != null ? opts.value : min, min, max);
    var active = findLevel(levels, value);
    var ends = opts.ends || [levels[0].name, levels[levels.length - 1].name];
    var name = opts.name || 'level';
    var label = opts.label || 'Difficulty';
    var hint = opts.hint || '';
    var esc = (global.WW && global.WW.escapeHtml) || function (s) {
      return String(s).replace(/[&<>"']/g, function (c) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
      });
    };

    return '<div class="diff-slider" data-diff-slider data-diff-name="' + esc(name) + '">' +
      '<div class="diff-slider__label">' + esc(label) + '</div>' +
      '<div class="diff-slider__status">' +
        '<div class="diff-slider__name-row">' +
          '<span class="diff-slider__name" data-diff-title>' + esc(active.name) + '</span>' +
          SPARK +
        '</div>' +
        '<p class="diff-slider__blurb" data-diff-blurb>' + esc(active.blurb) + '</p>' +
      '</div>' +
      '<div class="diff-slider__control">' +
        '<div class="diff-slider__track">' +
          '<input class="diff-slider__input" type="range" min="' + min + '" max="' + max +
            '" step="1" value="' + value + '" aria-label="' + esc(label) +
            '" aria-valuetext="' + esc(active.name) + '">' +
        '</div>' +
        '<div class="diff-slider__ends">' +
          '<span>' + esc(ends[0]) + '</span>' +
          '<span>' + esc(ends[1] || ends[0]) + '</span>' +
        '</div>' +
      '</div>' +
      (hint ? '<p class="diff-slider__hint">' + esc(hint) + '</p>' : '') +
    '</div>';
  }

  function paint(root, levels, value) {
    var active = findLevel(levels, value);
    var title = root.querySelector('[data-diff-title]');
    var blurb = root.querySelector('[data-diff-blurb]');
    var input = root.querySelector('.diff-slider__input');
    if (title) title.textContent = active.name;
    if (blurb) blurb.textContent = active.blurb;
    if (input) {
      /* Keep the control’s value attribute and live value aligned so a
         later re-read or form restore cannot drift from the labels. */
      input.value = String(active.value);
      input.setAttribute('value', String(active.value));
      input.setAttribute('aria-valuetext', active.name);
    }
  }

  function wire(host, opts) {
    opts = opts || {};
    var root = typeof host === 'string'
      ? document.querySelector(host)
      : (host && host.querySelector ? host.querySelector('[data-diff-slider]') || host : null);
    if (!root || !root.classList.contains('diff-slider')) {
      root = host && host.querySelector ? host.querySelector('[data-diff-slider]') : null;
    }
    if (!root) return null;

    var levels = opts.levels || [];
    var input = root.querySelector('.diff-slider__input');
    if (!input || !levels.length) return null;

    var min = +input.min;
    var max = +input.max;

    function apply(raw, notify) {
      var value = clamp(raw, min, max);
      paint(root, levels, value);
      if (notify && typeof opts.onChange === 'function') opts.onChange(value);
      return value;
    }

    /* Synchronous updates on both events: input covers drag, change
       covers keyboard commit / release. Never gate this on rAF. */
    input.addEventListener('input', function () { apply(input.value, true); });
    input.addEventListener('change', function () { apply(input.value, true); });

    apply(input.value, false);

    return {
      root: root,
      get: function () { return clamp(input.value, min, max); },
      set: function (v) { return apply(v, false); }
    };
  }

  global.DifficultySlider = {
    html: html,
    wire: wire,
    paint: paint,
    clamp: clamp
  };
})(window);
