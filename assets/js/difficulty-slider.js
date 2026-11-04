/* ------------------------------------------------------------------
   LearnGeo — Difficulty slider
   Reusable progressive-fill level control for game setup panels.

   The native range input steps by index (0 … n−1) so option values
   may be numbers (chess 1–5) or strings (calm / brisk / frantic).
   Motion is continuous (step=any) while dragging; discrete options
   snap on pointer/key release. Labels follow the nearest option
   during the drag; persistence uses the snapped option value.

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

  function sameValue(a, b) {
    return String(a) === String(b);
  }

  function findIndex(levels, value) {
    var i;
    for (i = 0; i < levels.length; i++) {
      if (sameValue(levels[i].value, value)) return i;
    }
    return 0;
  }

  function findLevel(levels, value) {
    return levels[findIndex(levels, value)] || levels[0];
  }

  /* levels: [{ value, name, blurb }, ...] — value is the persisted option id */
  function html(opts) {
    opts = opts || {};
    var levels = opts.levels || [];
    if (!levels.length) return '';

    var max = levels.length - 1;
    var index = clampDiscrete(
      findIndex(levels, opts.value != null ? opts.value : levels[0].value),
      0,
      max
    );
    var active = levels[index];
    var ends = opts.ends || [levels[0].name, levels[levels.length - 1].name];
    var name = opts.name || 'level';
    var label = opts.label || 'Difficulty';
    var hint = opts.hint || '';
    var atMax = index === max;
    var esc = (global.WW && global.WW.escapeHtml) || function (s) {
      return String(s).replace(/[&<>"']/g, function (c) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
      });
    };

    return '<div class="diff-slider' + (atMax ? ' is-max' : '') +
      '" data-diff-slider data-diff-name="' + esc(name) +
      '" style="--pct: ' + pctOf(index, 0, max) + '%">' +
      '<div class="diff-slider__label">' + esc(label) + '</div>' +
      '<div class="diff-slider__status">' +
        '<div class="diff-slider__name-row">' +
          '<span class="diff-slider__name" data-diff-title>' + esc(active.name) + '</span>' +
          SPARK +
        '</div>' +
        '<p class="diff-slider__blurb" data-diff-blurb>' + esc(active.blurb || '') + '</p>' +
      '</div>' +
      '<div class="diff-slider__control">' +
        '<div class="diff-slider__track">' +
          '<div class="diff-slider__fill" aria-hidden="true"></div>' +
          /* step=any → fluid drag; discrete snap happens in wire() on release */
          '<input class="diff-slider__input" type="range" min="0" max="' + max +
            '" step="any" value="' + index + '" aria-label="' + esc(label) +
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

  /* continuous/discrete are range indices (0 … n−1). */
  function paint(root, levels, continuous, discrete) {
    var input = root.querySelector('.diff-slider__input');
    var max = levels.length - 1;
    continuous = clampContinuous(continuous, 0, max);
    discrete = clampDiscrete(discrete != null ? discrete : continuous, 0, max);
    var active = levels[discrete] || levels[0];
    var title = root.querySelector('[data-diff-title]');
    var blurb = root.querySelector('[data-diff-blurb]');

    root.style.setProperty('--pct', pctOf(continuous, 0, max) + '%');
    root.classList.toggle('is-max', discrete === max);

    if (title) title.textContent = active.name;
    if (blurb) blurb.textContent = active.blurb || '';
    if (input) {
      input.value = String(continuous);
      input.setAttribute('aria-valuetext', active.name);
    }
  }

  function wire(host, opts) {
    opts = opts || {};
    var levels = opts.levels || [];
    var root = null;

    if (typeof host === 'string') {
      root = document.querySelector(host);
    } else if (host && host.querySelector) {
      if (opts.name) {
        root = host.querySelector('[data-diff-slider][data-diff-name="' + opts.name + '"]');
      }
      if (!root) root = host.querySelector('[data-diff-slider]') || host;
    }
    if (!root || !root.classList.contains('diff-slider')) {
      root = host && host.querySelector ? host.querySelector('[data-diff-slider]') : null;
    }
    if (!root) return null;

    var input = root.querySelector('.diff-slider__input');
    if (!input || !levels.length) return null;

    var max = levels.length - 1;
    var lastDiscrete = clampDiscrete(input.value, 0, max);
    var dragging = false;

    function optionValue(index) {
      return levels[clampDiscrete(index, 0, max)].value;
    }

    function live(raw) {
      var continuous = clampContinuous(raw, 0, max);
      var discrete = clampDiscrete(continuous, 0, max);
      paint(root, levels, continuous, discrete);
      return discrete;
    }

    function commit(raw, notify) {
      var discrete = clampDiscrete(raw, 0, max);
      /* Snap the control onto the option; keep attribute for later restores. */
      input.value = String(discrete);
      input.setAttribute('value', String(discrete));
      paint(root, levels, discrete, discrete);
      if (notify && discrete !== lastDiscrete && typeof opts.onChange === 'function') {
        opts.onChange(optionValue(discrete));
      }
      lastDiscrete = discrete;
      return optionValue(discrete);
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
      get: function () { return optionValue(lastDiscrete); },
      set: function (v) { return commit(findIndex(levels, v), false); }
    };
  }

  global.DifficultySlider = {
    html: html,
    wire: wire,
    paint: paint,
    clamp: clampDiscrete,
    findIndex: findIndex,
    findLevel: findLevel
  };
})(window);
