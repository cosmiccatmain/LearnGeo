/* ------------------------------------------------------------------
   LearnGeo — avatar + decoration artwork

   Everything here is inline SVG rather than emoji: emoji depend on a
   system font that is missing on plenty of machines, which left the
   avatar circles blank. These always render.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';

  function wrap(inner, stroke) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="' + (stroke || 'currentColor') +
      '" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" ' +
      'width="100%" height="100%" preserveAspectRatio="xMidYMid meet">' + inner + '</svg>';
  }

  /* 24x24 monoline glyphs, drawn on the same grid so they sit together. */
  var ART = {
    globe:      '<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4a13 13 0 0 1 0 16a13 13 0 0 1 0-16"/>',
    map:        '<path d="M9 5 4 7v12l5-2 6 2 5-2V5l-5 2z"/><path d="M9 5v12M15 7v12"/>',
    compass:    '<circle cx="12" cy="12" r="8"/><path d="m15 9-2.2 4.8L8 16l2.2-4.8z"/>',
    mountain:   '<path d="m3 18 5.5-9 3.5 5.4L15 10l6 8z"/><path d="m8.5 9 2 3.2"/>',
    fox:        '<path d="M4 6.5 6.5 12 12 15l5.5-3L20 6.5 15.5 9h-7z"/><path d="M9.5 11.5h.01M14.5 11.5h.01M12 15v2"/>',
    owl:        '<path d="M5 9a7 7 0 0 1 14 0v4a7 7 0 0 1-14 0z"/><circle cx="9.3" cy="11" r="1.6"/><circle cx="14.7" cy="11" r="1.6"/><path d="m5 9-1-3 3 1M19 9l1-3-3 1M12 13.5v2"/>',
    whale:      '<path d="M3 13c0-3 3-5 6.5-5S17 10 19 13c-2 3-5 4-8 4s-6-1-8-4z"/><path d="M12 8V5M12 5c-1-1.2-.3-2.4 1-2.6M12 5c1-1.2 2.3-1 2.6.4"/>',
    penguin:    '<path d="M8 9a4 4 0 0 1 8 0v7a4 4 0 0 1-8 0z"/><path d="M12 9.5c-1.4 0-2 1.2-2 3s.6 3 2 3 2-1.2 2-3-.6-3-2-3z"/><path d="M10.4 7.4h.01M13.6 7.4h.01M9 20l1.5-2M15 20l-1.5-2"/>',
    rocket:     '<path d="M12 3c2.6 2 4 5.2 4 8.6L12 16l-4-4.4C8 8.2 9.4 5 12 3z"/><path d="M8 11.6 5 14l1 4 3-2M16 11.6 19 14l-1 4-3-2"/><circle cx="12" cy="9" r="1.6"/>',
    satellite:  '<rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M9.5 12H4M20 12h-5.5M12 9.5V4M12 20v-5.5"/><path d="M2.5 10v4M21.5 10v4M10 2.5h4M10 21.5h4"/>',
    volcano:    '<path d="m4 19 5-9h6l5 9z"/><path d="M9.5 10 12 4l2.5 6"/><path d="M12 4c1.5-1 3-.4 3.4 1"/>',
    lighthouse: '<path d="M9 21V9h6v12z"/><path d="M9.8 5h4.4l.8 4H9z"/><path d="M12 2v1.5M4 8l2.5 1M20 8l-2.5 1M9 14h6"/>',
    camel:      '<path d="M4 18v-3c0-2 1.5-3 3-4.5C8.6 9 9.5 7 12 7s3.4 2 5 3.5c1.5 1.5 3 2.5 3 4.5v3"/><path d="M8 18v-3M16 18v-3M20 15V9.5c0-1.2-1-1.8-1.8-1.2"/>',
    sailboat:   '<path d="M4 17h16l-2.5 4h-11z"/><path d="M12 15V3L5.5 15zM13.5 15h5L13.5 7z"/>',
    aurora:     '<path d="M3 16c3-5 6-5 9 0s6 5 9 0"/><path d="M3 11c3-5 6-5 9 0s6 5 9 0"/><path d="M3 20.5c3-4 6-4 9 0"/>',
    trophy:     '<path d="M7 5h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H5a2.5 2.5 0 0 0 2.5 4M17 6h2a2.5 2.5 0 0 1-2.5 4"/><path d="M12 15v3M9 21h6"/>'
  };

  /* Decoration badges pinned to the avatar's top-right corner. */
  var BADGE = {
    laurel:  '<path d="M12 21c-4-2-6-5.5-6-9 3 .5 5 2.5 6 5 1-2.5 3-4.5 6-5 0 3.5-2 7-6 9z"/>',
    compass: '<circle cx="12" cy="12" r="8"/><path d="m15 9-2.2 4.8L8 16l2.2-4.8z"/>',
    crown:   '<path d="M4 17 3 7l5 4 4-6 4 6 5-4-1 10z"/><path d="M4 20h16"/>',
    bloom:   '<circle cx="12" cy="12" r="2.4"/><path d="M12 3.5c2 2 2 4.2 0 6.1-2-1.9-2-4.1 0-6.1zM20.5 12c-2 2-4.2 2-6.1 0 1.9-2 4.1-2 6.1 0zM12 20.5c-2-2-2-4.2 0-6.1 2 1.9 2 4.1 0 6.1zM3.5 12c2-2 4.2-2 6.1 0-1.9 2-4.1 2-6.1 0z"/>',

    /* Ten marks for the ten achievement badges, one each. None of them
       reuses the art above: those four are bought for up to 1400 diamonds,
       and an earned badge that looked like a bought one would say the wrong
       thing about how it was got. Each mark is a plain outline that still
       reads at the 14px the avatar corner draws it at, and each differs in
       shape rather than only in colour, so they are still told apart in
       greyscale or by someone who cannot separate the hues. */
    flag:     '<path d="M6 21V4"/><path d="M6 5h11l-2 3.5L17 12H6z"/>',
    flame:    '<path d="M12 21a6 6 0 0 0 6-6c0-4-3-6.5-4.5-9C12 8 11.5 9.5 11 11c-.8-1-1.5-2-1.5-3.5C7.5 9.5 6 12 6 15a6 6 0 0 0 6 6z"/>',
    bolt:     '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    bullseye: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.6"/><circle cx="12" cy="12" r="1"/>',
    clipboard:'<rect x="6" y="4.5" width="12" height="16" rx="2"/><path d="M9.5 4.5h5v2.6h-5z"/><path d="M9.5 11.5h5M9.5 15.5h3.5"/>',
    cards:    '<rect x="3.5" y="7.5" width="10" height="12.5" rx="2"/><path d="M8 5.2h8.5a2 2 0 0 1 2 2v9.3"/>',
    region:   '<path d="M4 7.5 9.5 5l5 2.5L20 5v11.5L14.5 19l-5-2.5L4 19z"/><path d="M9.5 5v11.5M14.5 7.5V19"/>',
    chevrons: '<path d="m6 13 6-5 6 5"/><path d="m6 18.5 6-5 6 5"/>',
    bars:     '<path d="M5 20v-6M10 20V9M15 20v-8M20 20V4"/>',
    orbit:    '<circle cx="12" cy="12" r="5.6"/><ellipse cx="12" cy="12" rx="10" ry="4.2" transform="rotate(-24 12 12)"/>'
  };

  function avatarSvg(id, color) {
    var art = ART[id] || ART.globe;
    return wrap(art, color || 'currentColor');
  }

  function badgeSvg(id, color) {
    var art = BADGE[id];
    if (!art) return '';
    return '<svg viewBox="0 0 24 24" fill="none" stroke="' + (color || 'currentColor') +
      '" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + art + '</svg>';
  }

  global.Avatars = { art: ART, badges: BADGE, svg: avatarSvg, badge: badgeSvg, has: function (id) { return !!ART[id]; } };
})(window);
