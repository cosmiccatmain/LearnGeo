/* ------------------------------------------------------------------
   LearnGeo — map layer (Leaflet over OpenStreetMap tiles)

   OpenStreetMap's own tiles are free and need no key, so that is the
   default. Settings > Map lets you paste a key for a provider that
   wants one (CARTO / MapTiler / Thunderforest / Stadia); the
   underlying data is still OpenStreetMap.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';

  var OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

  var PROVIDERS = {
    osm: {
      label: 'OpenStreetMap Standard (no key)',
      needsKey: false,
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      attr: OSM_ATTR, max: 19
    },
    carto: {
      label: 'CARTO Light (API key)',
      needsKey: true,
      url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
      attr: OSM_ATTR + ' &copy; <a href="https://carto.com/attributions">CARTO</a>',
      sub: 'abcd', max: 20
    },
    maptiler: {
      label: 'MapTiler (API key)',
      needsKey: true,
      url: 'https://api.maptiler.com/maps/basic-v2/{z}/{x}/{y}.png?key={key}',
      attr: OSM_ATTR + ' &copy; <a href="https://www.maptiler.com/">MapTiler</a>', max: 20
    },
    thunderforest: {
      label: 'Thunderforest Atlas (API key)',
      needsKey: true,
      url: 'https://tile.thunderforest.com/atlas/{z}/{x}/{y}.png?apikey={key}',
      attr: OSM_ATTR + ' &copy; <a href="https://www.thunderforest.com/">Thunderforest</a>', max: 20
    },
    stadia: {
      label: 'Stadia Alidade Smooth (API key)',
      needsKey: true,
      url: 'https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png?api_key={key}',
      attr: OSM_ATTR + ' &copy; <a href="https://stadiamaps.com/">Stadia Maps</a>', max: 20
    }
  };

  var map = null, layer = null, markers = [], hostId = null;

  function providerConf() {
    var s = global.WW.state.settings;
    var p = PROVIDERS[s.tileProvider] || PROVIDERS.osm;
    if (p.needsKey && !s.apiKey) p = PROVIDERS.osm;   /* fall back to the keyless basemap */
    return p;
  }

  function tileUrl(p) {
    return p.url.replace('{key}', encodeURIComponent(global.WW.state.settings.apiKey || ''));
  }

  function ensure(hostEl) {
    if (!global.L || !hostEl) return null;

    if (map && hostId === hostEl.id && hostEl.querySelector('.leaflet-pane')) {
      invalidate();
      return map;
    }
    if (map) { map.remove(); map = null; markers = []; }

    hostId = hostEl.id;
    map = global.L.map(hostEl, {
      zoomControl: true,
      worldCopyJump: true,
      minZoom: 1.6,
      maxBounds: [[-89, -240], [89, 240]],
      maxBoundsViscosity: 0.6,
      attributionControl: true
    }).setView([22, 12], 2);

    applyProvider();
    invalidate();
    return map;
  }

  function applyProvider() {
    if (!map) return;
    if (layer) { map.removeLayer(layer); layer = null; }
    var p = providerConf();
    var opts = { attribution: p.attr, maxZoom: p.max, noWrap: false, detectRetina: true };
    if (p.sub) opts.subdomains = p.sub;
    layer = global.L.tileLayer(tileUrl(p), opts).addTo(map);
  }

  function clear() {
    if (map && map.stop) map.stop();
    markers.forEach(function (m) { if (map) map.removeLayer(m); });
    markers = [];
  }

  function pinIcon(cls) {
    return global.L.divIcon({
      className: '',
      html: '<div class="cap-pin ' + (cls || '') + '"></div>',
      iconSize: [13, 13], iconAnchor: [6.5, 6.5]
    });
  }

  function addPin(country, cls, onClick, label) {
    if (!map || !finite(country)) return null;
    var m = global.L.marker([country.lat, country.lon], {
      icon: pinIcon(cls), keyboard: !!onClick, title: label || ''
    }).addTo(map);
    if (label) m.bindTooltip(label, { direction: 'top', offset: [0, -8] });
    if (onClick) m.on('click', function () { onClick(country, m); });
    markers.push(m);
    return m;
  }

  function setPinClass(marker, cls) {
    if (!marker) return;
    var node = marker.getElement && marker.getElement();
    var pin = node && node.querySelector('.cap-pin');
    if (pin) pin.className = 'cap-pin ' + cls;
  }

  /* ------------------------- camera movement -------------------------
     Two things make Leaflet throw "Invalid LatLng (NaN, NaN)":
       1. moving a map whose container currently has no size — which is
          every hidden view, and any moment mid-resize; and
       2. flyTo, which divides by the distance travelled and so blows up
          when the target equals the current view, or when the container
          collapses while the flight is still running (async, so a
          try/catch around the call cannot catch it).
     Everything therefore goes through move(), which checks the size,
     cancels any in-flight animation, and uses setView rather than flyTo.
  --------------------------------------------------------------------*/
  function ready() {
    if (!map) return false;
    var c = map.getContainer();
    return !!(c && c.clientWidth > 0 && c.clientHeight > 0);
  }

  function finite(c) { return !!c && isFinite(c.lat) && isFinite(c.lon); }

  function move(lat, lon, zoom, animate) {
    if (!ready() || !isFinite(lat) || !isFinite(lon)) return;
    if (map.stop) map.stop();
    map.invalidateSize({ animate: false });
    map.setView([lat, lon], zoom, {
      animate: animate === false ? false : true,
      duration: 0.6
    });
  }

  function focus(country, zoom, animate) {
    if (!finite(country)) return;
    move(country.lat, country.lon, zoom || 4.4, animate);
  }

  function fitAll(list, pad) {
    if (!ready() || !list || !list.length) return;
    var pts = list.filter(finite).map(function (c) { return [c.lat, c.lon]; });
    if (!pts.length) return;
    if (map.stop) map.stop();
    map.invalidateSize({ animate: false });
    try {
      map.fitBounds(global.L.latLngBounds(pts), {
        padding: [pad || 70, pad || 70], maxZoom: 5, animate: true
      });
    } catch (e) {
      move(pts[0][0], pts[0][1], 3, false);
    }
  }

  function reset() { move(22, 12, 2); }

  function invalidate() {
    if (!map) return;
    setTimeout(function () {
      if (map && map.getContainer() && map.getContainer().clientHeight > 0) {
        map.invalidateSize({ animate: false });
      }
    }, 40);
  }

  global.GeoMap = {
    providers: PROVIDERS,
    ensure: ensure,
    applyProvider: applyProvider,
    clear: clear,
    addPin: addPin,
    setPinClass: setPinClass,
    focus: focus,
    fitAll: fitAll,
    reset: reset,
    invalidate: invalidate,
    get instance() { return map; }
  };
})(window);
