/* ------------------------------------------------------------------
   LearnGeo — the teacher's switches for GeoLive and the class
   leaderboard.

   Two switches, not one. A teacher who wants a class quiz without a
   public ranking is a real case, and so is a teacher who wants the
   ranking without ever running a live quiz.

   Off means off. Not hidden: no tab, no mount, and no network call.
   This module is therefore the thing every other GeoLive file asks
   before it does anything, and it answers without going to the network
   itself, because a gate that has to make a request to tell you a
   feature is off has already failed at its job.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';

  /* Same guard as the screens: a module that throws at load leaves no
     switch, and a missing switch reads as a missing feature. */
  var WW = global.WW || {};
  function ww() { return global.WW || WW; }

  function esc(str) {
    var f = ww().escapeHtml;
    if (f) return f(str);
    return String(str).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }
  function q1(sel, root) {
    var f = ww().$;
    return f ? f(sel, root) : (root || document).querySelector(sel);
  }
  function qa(sel, root) {
    var f = ww().$$;
    if (f) return f(sel, root);
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }
  function toast(a, b, c, d) { var f = ww().toast; if (f) f(a, b, c, d); }

  /* ============================ the switches ======================== */

  var FEATURES = [
    {
      key: 'geolive',
      label: 'Live quiz',
      note: 'Run a quiz the class answers together, on their own devices.',
      /* On by default. Nothing happens until a teacher deliberately opens
         a room, so an unused switch costs a class nothing, and a teacher
         who goes looking for the feature Owen asked for should find it
         rather than a setting they have to know about first. */
      fallback: true
    },
    {
      key: 'leaderboard',
      label: 'Class leaderboard',
      note: 'Rank the class by level, so everyone can see where they are.',
      /* Off by default, and this one is deliberate. It shows every student
         their place in front of everyone else, which is a decision about a
         classroom rather than a feature preference. Turning that on for
         every existing class because a new switch appeared is exactly the
         surprise the round was told to avoid. A teacher who wants it turns
         it on in one tap; a teacher who would not have wanted it never has
         to discover it was already on. */
      fallback: false
    }
  ];

  var FALLBACK = {};
  FEATURES.forEach(function (f) { FALLBACK[f.key] = f.fallback; });

  /* Last known answer per class, so gating is synchronous. A gate that
     returns a promise is a gate every caller will race. */
  var known = {};
  var watchers = [];

  /* ============================== the store ========================= */
  /* The flags live with the class, which means Supabase, which this file
     does not talk to: oy-01 owns the column and oy-09 owns the read and
     write. Looked for in order, and if neither is there the switches say
     so instead of pretending to save. The shape needed is small:

       read(classId)          -> promise of { geolive: bool, leaderboard: bool }
       write(classId, patch)  -> promise, resolving when it is stored

     Anything missing from a read means "not set", and the fallback above
     applies. */
  function store() {
    var C = global.Cloud;
    if (C && C.classFeatures &&
        typeof C.classFeatures.read === 'function' &&
        typeof C.classFeatures.write === 'function') return C.classFeatures;
    var S = global.ClassFeatureStore;
    if (S && typeof S.read === 'function' && typeof S.write === 'function') return S;
    return null;
  }

  function load(classId) {
    var s = store();
    if (!classId || !s) return Promise.resolve(null);
    var out;
    try { out = Promise.resolve(s.read(classId)); }
    catch (e) { return Promise.resolve(null); }
    return out.then(function (row) {
      if (!row) return null;
      known[classId] = normalise(row);
      tell(classId);
      return known[classId];
    }).catch(function () { return null; });
  }

  function normalise(row) {
    var out = {};
    FEATURES.forEach(function (f) {
      out[f.key] = typeof row[f.key] === 'boolean' ? row[f.key] : FALLBACK[f.key];
    });
    return out;
  }

  /* The answer a gate gets. Synchronous on purpose, and it errs towards
     the fallback rather than towards "on": a feature nobody has switched
     on yet should not appear because a read was slow. */
  function on(key, classId) {
    var row = known[classId];
    if (row && typeof row[key] === 'boolean') return row[key];
    return !!FALLBACK[key];
  }

  function onChange(fn) {
    if (typeof fn === 'function') watchers.push(fn);
    return function () {
      watchers = watchers.filter(function (w) { return w !== fn; });
    };
  }

  function tell(classId) {
    watchers.forEach(function (fn) {
      try { fn(classId, known[classId] || null); } catch (e) {}
    });
  }

  /* ============================== the panel ========================= */

  function mount(el, opts) {
    opts = opts || {};
    var classId = opts.classId || '';
    var view = { el: el, classId: classId, busy: {} };

    if (el.className.indexOf('clf') < 0) {
      el.className = (el.className + ' clf').trim();
    }

    render(view);
    load(classId).then(function (row) {
      if (!row) { view.unavailable = !store(); }
      render(view);
    });
    return view;
  }

  function render(view) {
    var reachable = !!store();
    view.el.innerHTML =
      '<div class="clf__head">' +
        '<h3 class="clf__h">What this class uses</h3>' +
        '<div class="clf__sub">Switched off means off: the tab goes, and nothing is loaded or looked up.</div>' +
      '</div>' +
      (reachable ? '' :
        '<div class="clf__warn">These switches need the class to be online. ' +
        'Sign in and sync the class, then they can be changed.</div>') +
      FEATURES.map(function (f) {
        var isOn = on(f.key, view.classId);
        return '<div class="clf-row' + (isOn ? ' is-on' : '') + '" data-feature="' + esc(f.key) + '">' +
          '<div class="clf-row__t"><b>' + esc(f.label) + '</b>' +
            '<span>' + esc(f.note) + '</span></div>' +
          '<button class="clf-switch" role="switch" data-toggle="' + esc(f.key) + '" ' +
            'aria-checked="' + (isOn ? 'true' : 'false') + '"' +
            (reachable && !view.busy[f.key] ? '' : ' disabled') + '>' +
            '<span class="clf-switch__dot"></span>' +
            '<span class="clf-switch__t">' + (isOn ? 'On' : 'Off') + '</span>' +
          '</button>' +
        '</div>';
      }).join('');
    wire(view);
  }

  function wire(view) {
    qa('[data-toggle]', view.el).forEach(function (b) {
      b.addEventListener('click', function () {
        flip(view, b.getAttribute('data-toggle'));
      });
    });
  }

  /* The switch moves when the store says it moved, not when it is
     clicked. A switch that flips and then silently fails to save is how a
     teacher ends up believing a class has the leaderboard turned off. */
  function flip(view, key) {
    var s = store();
    if (!s || view.busy[key]) return;

    var next = !on(key, view.classId);
    var patch = {};
    patch[key] = next;

    view.busy[key] = true;
    render(view);

    var done;
    try { done = Promise.resolve(s.write(view.classId, patch)); }
    catch (e) { done = Promise.reject(e); }

    done.then(function () {
      var row = known[view.classId] || normalise({});
      row[key] = next;
      known[view.classId] = row;
      view.busy[key] = false;
      render(view);
      tell(view.classId);
    }).catch(function () {
      view.busy[key] = false;
      render(view);
      toast('Not saved', 'That switch could not be changed just now. It is unchanged.',
            (ww().Icons || {}).info, 4500);
    });
  }

  global.ClassFeatures = {
    mount: mount,
    load: load,
    on: on,
    onChange: onChange,
    features: FEATURES.map(function (f) {
      return { key: f.key, label: f.label, fallback: f.fallback };
    }),
    /* so a gate can say which way it defaulted, rather than guessing */
    fallback: function (key) { return !!FALLBACK[key]; }
  };
})(window);
