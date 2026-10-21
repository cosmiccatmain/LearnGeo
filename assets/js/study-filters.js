/* ------------------------------------------------------------------
   LearnGeo — Study filters
   The filters dialog Learn opens, shared so that anything else asking
   questions (Games) offers exactly the same choices.

     StudyFilters.open({ cfg, title, types, mapChoices, onApply(next) })
       cfg         { regions, scope, countries, types, typed,
                     nearbyMapChoices, weakFirst }
       types       show the question-type checkboxes
       mapChoices  show the Locate-on-map choice setting
       answerStyle show multiple choice / typed
       onApply     gets a fresh cfg; the one passed in is not touched

     StudyFilters.label(cfg)  "Europe · 48 places", for a summary line
     StudyFilters.pool(cfg)   the places those filters cover
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons;

  function pool(cfg) {
    return global.Quiz.pool({
      regions: cfg.regions || [], scope: cfg.scope || 'all',
      countries: cfg.countries, weakFirst: cfg.weakFirst
    });
  }

  function label(cfg) {
    if (cfg.countries && cfg.countries.length) {
      return cfg.countries.length + (cfg.countries.length === 1 ? ' picked country' : ' picked countries');
    }
    var regions = cfg.regions || [];
    var n = global.Quiz.pool({ regions: regions, scope: cfg.scope }).length;
    if (regions.length === 1) return regions[0] + ' · ' + n + ' places';
    if (regions.length > 1) return regions.length + ' regions · ' + n + ' places';
    if (cfg.scope === 'un') return 'UN members · ' + n + ' countries';
    if (cfg.scope === 'un-plus') return 'UN + observers · ' + n + ' places';
    return 'All ' + n + ' places';
  }

  function open(opts) {
    var cfg = opts.cfg;
    var showTypes = opts.types !== false;
    var showMap = opts.mapChoices !== false;
    var showTyped = opts.answerStyle !== false;
    var regions = global.GeoData.regions;
    var cfgRegions = cfg.regions || [];
    var cfgTypes = cfg.types || [];
    var choosing = cfg.countries && cfg.countries.length ? 'custom' : 'auto';
    var pickerApi = null;
    var body =
      '<div class="field"><label class="field__label">How to choose</label>' +
        '<div class="seg" id="cfg-choose">' +
          seg('auto', 'By region', choosing) +
          seg('custom', 'Pick countries', choosing) +
        '</div>' +
      '</div>' +
      '<div id="cfg-auto">' +
        '<div class="field"><label class="field__label">Scope</label>' +
          '<div class="seg" id="cfg-scope">' +
            seg('un', 'UN members', cfg.scope) +
            seg('un-plus', '+ Observers', cfg.scope) +
            seg('all', 'All 213', cfg.scope) +
          '</div>' +
          '<div class="field__hint">193 UN members, 2 permanent observers and 18 territories.</div>' +
        '</div>' +
        '<div class="field"><label class="field__label">Regions</label>' +
          '<div class="check-grid" id="cfg-regions">' +
            regions.map(function (r) {
              var on = !cfgRegions.length || cfgRegions.indexOf(r) !== -1;
              return check(r, r, on);
            }).join('') +
          '</div>' +
          '<div class="field__hint">Leave all selected to study the whole world.</div>' +
        '</div>' +
      '</div>' +
      '<div id="cfg-custom" class="' + (choosing === 'custom' ? '' : 'hidden') + '">' +
        '<div class="field"><label class="field__label">Your countries</label>' +
          '<div id="cfg-picker"></div>' +
          '<div class="field__hint">Type a country or capital and press Enter. ' +
            'The region buttons add a whole continent at once.</div>' +
        '</div>' +
      '</div>' +
      '<div class="field__hint" id="cfg-count"></div>' +
      (showTypes
        ? '<div class="field"><label class="field__label">Question types</label>' +
            '<div class="check-grid" id="cfg-types">' +
              Object.keys(global.Quiz.types).map(function (t) {
                return check(t, global.Quiz.types[t].label, cfgTypes.indexOf(t) !== -1);
              }).join('') +
            '</div>' +
          '</div>'
        : '') +
      (showMap
        ? '<div class="field"><label class="field__label">Map choices</label>' +
            '<div class="seg" id="cfg-map-choices">' +
              seg('region', 'Across the region', cfg.nearbyMapChoices ? 'nearby' : 'region') +
              seg('nearby', 'Nearby countries', cfg.nearbyMapChoices ? 'nearby' : 'region') +
            '</div>' +
            '<div class="field__hint">For Locate on map, nearby choices use the closest countries instead of spreading them across the region.</div>' +
          '</div>'
        : '') +
      (showTyped
        ? '<div class="field"><label class="field__label">Answer style</label>' +
            '<div class="seg" id="cfg-typed">' +
              seg('choice', 'Multiple choice', cfg.typed ? 'typed' : 'choice') +
              seg('typed', 'Type the answer', cfg.typed ? 'typed' : 'choice') +
            '</div>' +
          '</div>'
        : '') +
      '<div class="field"><label class="field__label">Order</label>' +
        '<div class="seg" id="cfg-order">' +
          seg('weak', 'Weakest first', cfg.weakFirst ? 'weak' : 'random') +
          seg('random', 'Random', cfg.weakFirst ? 'weak' : 'random') +
        '</div>' +
        '<div class="field__hint">Weakest first brings back the countries you keep getting wrong.</div>' +
      '</div>';

    global.UI.modal({
      title: opts.title || 'Study filters',
      icon: I.layers,
      wide: true,
      body: body,
      actions: [
        { label: 'Cancel', cls: 'btn--ghost', close: true },
        { label: 'Apply', cls: 'btn--accent', close: true,
          onClick: function (m) { return apply(m); } }
      ],
      onMount: function (m) {
        global.UI.wireSeg(m);
        global.UI.wireCheck(m);
        pickerApi = global.Assignments.picker(W.$('#cfg-picker', m), {
          initial: cfg.countries || [],
          onChange: refreshCount
        });
        W.$$('#cfg-choose button', m).forEach(function (b) {
          b.addEventListener('click', function () {
            var custom = b.dataset.v === 'custom';
            W.$('#cfg-auto', m).classList.toggle('hidden', custom);
            W.$('#cfg-custom', m).classList.toggle('hidden', !custom);
            refreshCount();
            if (custom) pickerApi.focus();
          });
        });
        W.$$('#cfg-scope button, #cfg-regions .check', m).forEach(function (b) {
          b.addEventListener('click', function () { setTimeout(refreshCount, 0); });
        });
        W.$('#cfg-auto', m).classList.toggle('hidden', choosing === 'custom');
        refreshCount();

        function refreshCount() {
          var mode = W.$('#cfg-choose .is-active', m);
          var custom = mode && mode.dataset.v === 'custom';
          var n;
          if (custom) {
            n = pickerApi ? pickerApi.value.length : (cfg.countries || []).length;
          } else {
            var scope = W.$('#cfg-scope .is-active', m);
            var selected = W.$$('#cfg-regions .check.is-on', m).map(function (n2) { return n2.dataset.v; });
            if (selected.length === regions.length) selected = [];
            n = global.Quiz.pool({
              scope: scope ? scope.dataset.v : 'all',
              regions: selected
            }).length;
          }
          W.$('#cfg-count', m).textContent = n + (n === 1 ? ' place' : ' places') + ' in your study set.';
        }
      }
    });

    function apply(m) {
      var choose = W.$('#cfg-choose .is-active', m);
      var custom = choose && choose.dataset.v === 'custom';
      var picked = custom && pickerApi ? pickerApi.value : [];
      if (custom && !picked.length) {
        W.toast('Pick at least one country', 'Search by country or capital, or add a region', I.info);
        return false;
      }

      var next = {
        countries: custom ? picked : null,
        types: cfgTypes.slice(),
        nearbyMapChoices: !!cfg.nearbyMapChoices
      };
      var scope = W.$('#cfg-scope .is-active', m);
      next.scope = scope ? scope.dataset.v : 'all';

      var on = W.$$('#cfg-regions .check.is-on', m).map(function (n) { return n.dataset.v; });
      next.regions = on.length === regions.length ? [] : on;

      if (showTypes) {
        var types = W.$$('#cfg-types .check.is-on', m).map(function (n) { return n.dataset.v; });
        next.types = types.length ? types : ['capital'];
      }
      if (showMap) {
        var mapChoices = W.$('#cfg-map-choices .is-active', m);
        next.nearbyMapChoices = !!mapChoices && mapChoices.dataset.v === 'nearby';
      }

      var typed = W.$('#cfg-typed .is-active', m);
      next.typed = showTyped ? !!typed && typed.dataset.v === 'typed' : !!cfg.typed;

      var order = W.$('#cfg-order .is-active', m);
      next.weakFirst = !order || order.dataset.v === 'weak';

      var n = global.Quiz.pool({ regions: next.regions, scope: next.scope, countries: next.countries }).length;
      W.toast('Filters applied', n + ' places in your study set', I.check);
      opts.onApply(next);
    }

    function seg(v, text, cur) {
      return '<button data-v="' + v + '" class="' + (cur === v ? 'is-active' : '') + '">' + text + '</button>';
    }
    function check(v, text, on) {
      return '<button class="check ' + (on ? 'is-on' : '') + '" data-v="' + v + '">' +
        '<span class="check__box">' + I.check + '</span>' + W.escapeHtml(text) + '</button>';
    }
  }

  global.StudyFilters = { open: open, label: label, pool: pool };
})(window);
