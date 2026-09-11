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

  var map = null, layer = null, markers = [], hostId = null, sizeWatch = null;
  var guarded = false, bordersLayer = null;

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
    if (map) { map.remove(); map = null; markers = []; shapeLayers = []; bordersLayer = null; }

    hostId = hostEl.id;
    map = global.L.map(hostEl, {
      zoomControl: false,
      worldCopyJump: true,
      minZoom: 1.6,
      maxBounds: [[-89, -240], [89, 240]],
      maxBoundsViscosity: 0.6,
      attributionControl: true
    }).setView([22, 12], 2);

    /* top-right, so it never sits on top of the answer badge in the corner */
    global.L.control.zoom({ position: 'topright' }).addTo(map);

    /* sharp outlines drawn over the blurred tiles; below the clickable shapes */
    var bp = map.createPane('lg-borders');
    bp.style.zIndex = 350;
    bp.style.pointerEvents = 'none';

    /* zoomanim fires with the target zoom before the tiles scale up, so the
       blur is already on when enlarged labels would otherwise be readable */
    map.on('zoomanim', function (e) { applyBlur(e.zoom); });
    map.on('zoomend', function () { applyBlur(map.getZoom()); });

    applyProvider();
    applyBlur(map.getZoom());
    watchSize(hostEl);
    invalidate();
    return map;
  }

  /* A pane that was hidden reports 0x0, so Leaflet caches a stale size and
     renders tiles for a viewport that no longer exists. Watching the host
     means every show/hide and resize re-measures on its own. */
  function watchSize(hostEl) {
    if (sizeWatch) { sizeWatch.disconnect(); sizeWatch = null; }
    if (!global.ResizeObserver) return;
    sizeWatch = new global.ResizeObserver(function () {
      if (map && hostEl.clientWidth > 0 && hostEl.clientHeight > 0) {
        map.invalidateSize({ animate: false });
      }
    });
    sizeWatch.observe(hostEl);
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
    clearShapes();
  }

  /* ----------------------------- shapes ------------------------------
     Country outlines (Natural Earth 50m, via world-atlas). 211 of the 213
     entries have a polygon; Tuvalu and Gibraltar are too small to appear at
     this resolution and fall back to a circular highlight on the capital.
     Loading is over fetch, so opening index.html straight off the filesystem
     degrades to circles rather than breaking.
  --------------------------------------------------------------------*/
  var shapesByName = null, shapesPromise = null, shapesFC = null;
  var shapeLayers = [];

  function loadShapes() {
    if (shapesPromise) return shapesPromise;
    shapesPromise = fetch('assets/data/countries.geo.json')
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (fc) {
        shapesFC = fc;
        shapesByName = {};
        fc.features.forEach(function (f) { unwrap(f); shapesByName[f.properties.name] = f; });
        if (map) applyBlur(map.getZoom());
        return shapesByName;
      })
      .catch(function () { shapesByName = {}; return shapesByName; });
    return shapesPromise;
  }

  /* ------------------------------ blur guard ----------------------------
     OpenStreetMap tiles print every country and capital name, so zooming in
     mid-question used to hand over the answer. While a question is live the
     tiles stay sharp at the world view and blur once you zoom past it. The
     country outlines are redrawn sharp on top from our own shapes, so the
     borders stay readable and only the printed names are lost. */
  var BLUR_FROM_ZOOM = 3;

  function setGuard(on) {
    guarded = !!on;
    if (map) applyBlur(map.getZoom());
  }

  function applyBlur(zoom) {
    if (!map) return;
    var blur = guarded && zoom >= BLUR_FROM_ZOOM;
    map.getContainer().classList.toggle('is-guarded', blur);
    if (blur) showBorders(); else hideBorders();
  }

  function showBorders() {
    if (!map || !shapesFC) return;
    if (!bordersLayer) {
      bordersLayer = global.L.geoJSON(shapesFC, {
        pane: 'lg-borders',
        renderer: global.L.canvas({ pane: 'lg-borders', padding: 0.5 }),
        interactive: false,
        style: { color: '#334155', weight: 1, opacity: 0.7, fill: false }
      });
    }
    if (!map.hasLayer(bordersLayer)) bordersLayer.addTo(map);
  }

  function hideBorders() {
    if (map && bordersLayer && map.hasLayer(bordersLayer)) map.removeLayer(bordersLayer);
  }

  /* Countries that cross the 180° meridian (Fiji, eastern Russia, the
     Aleutians) arrive split across both edges of the map, and Leaflet joins
     the halves with a line straight across the world. Move the smaller far
     side over so every ring stays in one piece. */
  function unwrap(f) {
    var g = f.geometry;
    var polys = !g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    var east = 0, west = 0, min = 180, max = -180;
    function each(fn) { polys.forEach(function (poly) { poly.forEach(function (ring) { ring.forEach(fn); }); }); }
    each(function (p) {
      if (p[0] < min) min = p[0];
      if (p[0] > max) max = p[0];
      if (p[0] > 90) east += 1; else if (p[0] < -90) west += 1;
    });
    if (max - min <= 180 || !east || !west) return;
    var moveWest = west <= east;
    each(function (p) {
      if (moveWest && p[0] < -90) p[0] += 360;
      else if (!moveWest && p[0] > 90) p[0] -= 360;
    });
  }

  function hasShape(name) { return !!(shapesByName && shapesByName[name]); }

  var STYLES = {
    base:   { color: '#94A3B8', weight: 0.6, opacity: 0.55, fillColor: '#CBD5E1', fillOpacity: 0.18 },
    target: { color: '#B45309', weight: 2,   opacity: 1,    fillColor: '#F5B301', fillOpacity: 0.55 },
    right:  { color: '#0A5C42', weight: 2,   opacity: 1,    fillColor: '#0E9F6E', fillOpacity: 0.5 },
    wrong:  { color: '#9B1C1C', weight: 2,   opacity: 1,    fillColor: '#E02424', fillOpacity: 0.45 },
    choice: { color: '#1B4DFF', weight: 1.4, opacity: 0.9,  fillColor: '#1B4DFF', fillOpacity: 0.22 },
    dim:    { color: '#9CA3AF', weight: 0.8, opacity: 0.5,  fillColor: '#9CA3AF', fillOpacity: 0.12 }
  };

  /* Draw one country. Falls back to a circle when there is no polygon. */
  function drawCountry(country, state, onClick, tooltip) {
    if (!map) return null;
    var style = STYLES[state] || STYLES.base;
    var layer;

    if (hasShape(country.name)) {
      layer = global.L.geoJSON(shapesByName[country.name], {
        style: style,
        /* keep the hit area generous on small islands */
        onEachFeature: function (f, l) { l.options.interactive = !!onClick; }
      });
    } else if (finite(country)) {
      layer = global.L.circleMarker([country.lat, country.lon], Object.assign({
        radius: 11, interactive: !!onClick
      }, style));
    } else {
      return null;
    }

    layer.addTo(map);
    layer._lgState = state;
    if (tooltip) layer.bindTooltip(tooltip, { sticky: true });
    if (onClick) {
      layer.on('click', function () { onClick(country, layer); });
      /* hover and un-hover work from whatever state the shape is in now, so
         a country marked right or wrong keeps its colour when the mouse leaves */
      layer.on('mouseover', function () {
        var cur = STYLES[layer._lgState] || STYLES.base;
        setStyle(layer, { weight: 2.4, fillOpacity: Math.min(0.6, (cur.fillOpacity || 0.2) + 0.18) });
      });
      layer.on('mouseout', function () { setStyle(layer, STYLES[layer._lgState] || STYLES.base); });
    }
    shapeLayers.push({ country: country, layer: layer, state: state });
    return layer;
  }

  function setStyle(layer, style) {
    if (layer.setStyle) layer.setStyle(style);
  }

  function setCountryState(layer, state) {
    if (!layer) return;
    layer._lgState = state;
    setStyle(layer, STYLES[state] || STYLES.base);
  }

  /* A fixed name label in the middle of a country's largest landmass. Used
     when the question names the country anyway, so labelling it gives
     nothing away. */
  function label(country, text) {
    if (!map) return null;
    var at = null;
    var entry = null;
    shapeLayers.forEach(function (s) { if (s.country.name === country.name) entry = s; });
    if (entry && entry.layer.eachLayer) {
      var best = null, bestArea = -1;
      entry.layer.eachLayer(function (l) {
        if (!l.getBounds) return;
        var b = l.getBounds();
        var area = Math.abs((b.getNorth() - b.getSouth()) * (b.getEast() - b.getWest()));
        if (area > bestArea) { bestArea = area; best = l; }
      });
      if (best) { try { at = best.getCenter(); } catch (e) { at = best.getBounds().getCenter(); } }
    }
    if (!at && finite(country)) at = global.L.latLng(country.lat, country.lon);
    if (!at) return null;
    var tip = global.L.tooltip({ permanent: true, direction: 'center', className: 'map-label', interactive: false })
      .setLatLng(at).setContent(global.WW.escapeHtml(text || country.name)).addTo(map);
    markers.push(tip);
    return tip;
  }

  function clearShapes() {
    shapeLayers.forEach(function (s) { if (map) map.removeLayer(s.layer); });
    shapeLayers = [];
  }

  function boundsOf(country) {
    var entry = null;
    shapeLayers.forEach(function (s) { if (s.country.name === country.name) entry = s; });
    if (entry && entry.layer.getBounds) {
      try {
        var b = entry.layer.getBounds();
        if (b && b.isValid()) return b;
      } catch (e) {}
    }
    return null;
  }

  /* Frame a country by its outline where we have one, else by its capital. */
  function frame(country, pad) {
    if (!ready()) return;
    var b = boundsOf(country);
    if (b) {
      if (map.stop) map.stop();
      map.invalidateSize({ animate: false });
      try {
        map.fitBounds(b, { padding: [pad || 60, pad || 60], maxZoom: 6, animate: true });
        return;
      } catch (e) {}
    }
    focus(country, 4.6);
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
    loadShapes: loadShapes,
    hasShape: hasShape,
    drawCountry: drawCountry,
    setCountryState: setCountryState,
    label: label,
    setGuard: setGuard,
    clearShapes: clearShapes,
    boundsOf: boundsOf,
    frame: frame,
    reset: reset,
    invalidate: invalidate,
    get instance() { return map; }
  };
})(window);
