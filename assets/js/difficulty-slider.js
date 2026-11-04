/* ------------------------------------------------------------------
   LearnGeo — Difficulty slider
   Reusable progressive-fill level control for game setup panels.

   Motion is continuous (step=any) while dragging. Discrete option
   values snap on pointer/key release. Labels follow the nearest
   option during the drag; persistence should use the snapped value.

   Visual sync uses --pct + class toggles on input/change — never
   requestAnimationFrame alone — so background-tab throttle cannot
   leave the thumb/fill out of sync with stored state.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';

  var SPARK =
    '<svg class="diff-slider__spark" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<path fill="currentColor" d="M12 1.6l1.7 6.2 6.3 1.7-6.3 1.7L12 17.4l-1.7-6.2L4 9.5l6.3-1.7L12 1.6z"/>' +
    '</svg>';

  function clampDiscrete(n, min, max) {
    n = +n;
    if (!(n >= min)) return min;
    if (!(n <= max)) return max;
    return Math.round(n);
  }

  function clampContinuous(n, min, max) {
    n = +n;
    if (!(n >= min)) return min;
    if (!(n <= max)) return max;
    return n;
  }

  function pctOf(value, min, max) {
    if (max === min) return 100;
    return ((value - min) / (max - min)) * 100;
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
    var value = clampDiscrete(opts.value != null ? opts.value : min, min, max);
    var active = findLevel(levels, value);
    var ends = opts.ends || [levels[0].name, levels[levels.length - 1].name];
    var name = opts.name || 'level';
    var label = opts.label || 'Difficulty';
    var hint = opts.hint || '';
    var atMax = value === max;
    var esc = (global.WW && global.WW.escapeHtml) || function (s) {
      return String(s).replace(/[&<>"']/g, function (c) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
      });
    };

    return '<div class="diff-slider' + (atMax ? ' is-max' : '') +
      '" data-diff-slider data-diff-name="' + esc(name) +
      '" style="--pct: ' + pctOf(value, min, max) + '%">' +
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
          '<div class="diff-slider__fill" aria-hidden="true"></div>' +
          /* step=any → fluid drag; discrete snap happens in wire() on release */
          '<input class="diff-slider__input" type="range" min="' + min + '" max="' + max +
            '" step="any" value="' + value + '" aria-label="' + esc(label) +
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

  /* continuous: thumb/fill position. discrete: nearest option for labels/nebula. */
  function paint(root, levels, continuous, discrete) {
    var input = root.querySelector('.diff-slider__input');
    var min = input ? +input.min : +levels[0].value;
    var max = input ? +input.max : +levels[levels.length - 1].value;
    continuous = clampContinuous(continuous, min, max);
    discrete = clampDiscrete(discrete != null ? discrete : continuous, min, max);
    var active = findLevel(levels, discrete);
    var title = root.querySelector('[data-diff-title]');
    var blurb = root.querySelector('[data-diff-blurb]');

    root.style.setProperty('--pct', pctOf(continuous, min, max) + '%');
    root.classList.toggle('is-max', discrete === max);

    if (title) title.textContent = active.name;
    if (blurb) blurb.textContent = active.blurb;
    if (input) {
      input.value = String(continuous);
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
    var lastDiscrete = clampDiscrete(input.value, min, max);
    var dragging = false;

    function live(raw) {
      var continuous = clampContinuous(raw, min, max);
      var discrete = clampDiscrete(continuous, min, max);
      paint(root, levels, continuous, discrete);
      return discrete;
    }

    function commit(raw, notify) {
      var discrete = clampDiscrete(raw, min, max);
      /* Snap the control onto the option; keep attribute for later restores. */
      input.value = String(discrete);
      input.setAttribute('value', String(discrete));
      paint(root, levels, discrete, discrete);
      if (notify && discrete !== lastDiscrete && typeof opts.onChange === 'function') {
        opts.onChange(discrete);
      }
      lastDiscrete = discrete;
      return discrete;
    }

    function endDrag() {
      if (!dragging) return;
      dragging = false;
      window.removeEventListener('pointerup', endDrag, true);
      window.removeEventListener('pointercancel', endDrag, true);
      commit(input.value, true);
    }

    input.addEventListener('pointerdown', function () {
      dragging = true;
      window.addEventListener('pointerup', endDrag, true);
      window.addEventListener('pointercancel', endDrag, true);
    });

    /* Fluid visuals only — never snap here, or the thumb jumps tick-to-tick. */
    input.addEventListener('input', function () { live(input.value); });

    /* change: keyboard steps and browsers that commit on release. */
    input.addEventListener('change', function () {
      if (dragging) endDrag();
      else commit(input.value, true);
    });

    commit(input.value, false);

    return {
      root: root,
      get: function () { return lastDiscrete; },
      set: function (v) { return commit(v, false); }
    };
  }

  global.DifficultySlider = {
    html: html,
    wire: wire,
    paint: paint,
    clamp: clampDiscrete
  };
})(window);
