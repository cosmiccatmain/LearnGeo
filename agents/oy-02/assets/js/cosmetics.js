/* ------------------------------------------------------------------
   LearnGeo — cosmetics catalogue
   Mirrors the shape of Discord's profile customisation:
   avatar, avatar decoration, profile effect, nameplate, banner,
   profile theme, display name, pronouns, about me, status.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';

  /* Avatar decorations — a ring/overlay drawn around the avatar. */
  var DECORATIONS = [
    { id: 'none', name: 'None', price: 0, kind: 'none' },
    { id: 'ring-slate', name: 'Cartographer', price: 0, kind: 'ring', c1: '#0A0A0B', c2: '#6B7280' },
    { id: 'ring-gold', name: 'Meridian Gold', price: 300, kind: 'ring', c1: '#F5B301', c2: '#FF8A00' },
    { id: 'ring-aurora', name: 'Aurora', price: 450, kind: 'ring', c1: '#22D3EE', c2: '#8B5CF6' },
    { id: 'ring-coral', name: 'Coral Reef', price: 450, kind: 'ring', c1: '#FB7185', c2: '#F97316' },
    { id: 'laurel', name: 'Laurel', price: 700, kind: 'badge', badge: 'laurel', c1: '#16A34A' },
    { id: 'compass', name: 'Compass Rose', price: 700, kind: 'badge', badge: 'compass', c1: '#1B4DFF' },
    { id: 'orbit', name: 'Low Orbit', price: 900, kind: 'orbit', c1: '#1B4DFF', c2: '#22D3EE' },
    { id: 'sakura', name: 'Sakura', price: 900, kind: 'badge', badge: 'bloom', c1: '#F472B6' },
    { id: 'crown', name: 'Summit Crown', price: 1400, kind: 'badge', badge: 'crown', c1: '#F5B301' },
    { id: 'ring-glacier', name: 'Glacier', price: 1400, kind: 'ring', c1: '#38BDF8', c2: '#E0F2FE' },
    { id: 'ring-magma', name: 'Magma', price: 2000, kind: 'ring', c1: '#DC2626', c2: '#F59E0B' }
  ];

  /* --------------------- earned, never bought ----------------------
     One badge per achievement. `earn` holds the achievement id, and that
     is the only thing that can own one: it is in `state.achievements` or
     you cannot wear it. There is deliberately no price on any of them,
     and the shop refuses to sell anything carrying an `earn`, so there is
     no route in through diamonds however long somebody plays.

     They live in DECORATIONS rather than in a list of their own because
     they compete for the same wearing slot as a bought badge. One badge
     shows beside a name, and an earned one takes that place rather than
     adding a second.

     The four bought badges above are untouched. Somebody paid 1400
     diamonds for the crown, and turning that into a freebie would take
     something away from a purchase that has already been made.

     Names are the achievement's own, so a badge says what was done
     rather than needing a legend: wearing Unstoppable means a 25 streak. */
  var EARNED = [
    { id: 'ach-first-steps',  name: 'First Steps',  kind: 'badge', badge: 'flag',      c1: '#6B7280', earn: 'first-steps' },
    { id: 'ach-streak-10',    name: 'On a Roll',    kind: 'badge', badge: 'flame',     c1: '#F97316', earn: 'streak-10' },
    { id: 'ach-streak-25',    name: 'Unstoppable',  kind: 'badge', badge: 'bolt',      c1: '#DC2626', earn: 'streak-25' },
    { id: 'ach-perfect-test', name: 'Flawless',     kind: 'badge', badge: 'bullseye',  c1: '#0E9F6E', earn: 'perfect-test' },
    { id: 'ach-test-5',       name: 'Test Taker',   kind: 'badge', badge: 'clipboard', c1: '#1B4DFF', earn: 'test-5' },
    { id: 'ach-cards-100',    name: 'Card Shark',   kind: 'badge', badge: 'cards',     c1: '#8B5CF6', earn: 'cards-100' },
    { id: 'ach-region-master',name: 'Region Master',kind: 'badge', badge: 'region',    c1: '#0891B2', earn: 'region-master' },
    { id: 'ach-level-10',     name: 'Seasoned',     kind: 'badge', badge: 'chevrons',  c1: '#F5B301', earn: 'level-10' },
    { id: 'ach-answers-500',  name: 'Five Hundred', kind: 'badge', badge: 'bars',      c1: '#DB2777', earn: 'answers-500' },
    { id: 'ach-globetrotter', name: 'Globetrotter', kind: 'badge', badge: 'orbit',     c1: '#22D3EE', earn: 'globetrotter' }
  ];

  EARNED.forEach(function (b) { DECORATIONS.push(b); });

  /* ------------------------- class tag glyphs -----------------------
     A separate set from the achievement marks above, deliberately.

     Two reasons, and the second is the one that decided it. First, size:
     an achievement mark sits on an avatar at 24 to 32px, so it can afford
     three concentric circles or a map with internal lines. A tag glyph
     sits beside four letters at about 12px next to a child's name, on a
     leaderboard row and sometimes on a projector at the back of a room.
     Bullseye, region, clipboard, cards and orbit all turn to mud there.
     These are drawn with fewer strokes and a heavier line so they survive
     it.

     Second, meaning. An achievement mark says "this person did this
     thing". A class tag says "this is which class". Wearing the same mark
     for both would make a class logo read as something a student earned,
     which is the distinction the whole badge feature exists to draw.

     Names are plain words so a picker can title-case them for a label
     without a second list to fall out of step with. */
  var TAG_GLYPHS = {
    globe:    '<circle cx="12" cy="12" r="8.2"/><path d="M3.8 12h16.4"/><path d="M12 3.8c2.7 2.8 2.7 13.6 0 16.4M12 3.8c-2.7 2.8-2.7 13.6 0 16.4"/>',
    star:     '<path d="m12 3.6 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 10l6.1-.9z"/>',
    leaf:     '<path d="M19.5 4.5C19.5 13 15 18 8.5 18H4.5C4.5 9.5 9 4.5 15.5 4.5z"/><path d="M15.5 8 6.5 17"/>',
    /* A rocket was the obvious eighth and it is not here: every version I
       drew was a 5px blob at 12px, identifiable only by already knowing it
       was a rocket. If somebody draws one that survives that size it can
       come back. */
    heart:    '<path d="M12 20.4 4.6 13c-2-2-2-5.2 0-7.2s5.2-2 7.2 0l.2.2.2-.2c2-2 5.2-2 7.2 0s2 5.2 0 7.2z"/>',
    book:     '<path d="M4 5.6A2.6 2.6 0 0 1 6.6 3H19.5v14.6H6.6A2.6 2.6 0 0 0 4 20.2z"/><path d="M19.5 17.6V21H6.6"/>',
    pennant:  '<path d="M6 21V3.6"/><path d="M6 4.4h13.2l-3.1 4.1 3.1 4.1H6z"/>',
    mountain: '<path d="m2.8 19.4 7.1-12.2 4 6.6 2.6-3.6 4.7 9.2z"/>',
    /* A shield rather than an anchor: the anchor's ring came out under a
       pixel across at 12px and its arms merged into the shank. */
    shield:   '<path d="M12 3.2 20 6v6.2c0 4.3-3.2 7.3-8 8.6-4.8-1.3-8-4.3-8-8.6V6z"/>'
  };

  /* The mark for a class tag, or null for a name this does not know.
     Never throws, whatever it is handed, because the caller renders four
     letters on its own when there is no glyph and that is the permanent
     arrangement rather than a stopgap. currentColor so the tag's own
     colour carries through. */
  function tagGlyph(name) {
    var art = typeof name === 'string' ? TAG_GLYPHS[name] : null;
    if (!art || !Object.prototype.hasOwnProperty.call(TAG_GLYPHS, name)) return null;
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + art + '</svg>';
  }

  /* Profile effects — animated particles over the profile card. */
  var EFFECTS = [
    { id: 'none', name: 'None', price: 0, shape: null, colors: [] },
    { id: 'confetti', name: 'Confetti', price: 500, shape: 'rect', colors: ['#1B4DFF', '#F5B301', '#0E9F6E', '#FB7185'] },
    { id: 'snow', name: 'Snowfall', price: 500, shape: 'dot', colors: ['#BAE6FD', '#E0F2FE', '#FFFFFF'] },
    { id: 'stars', name: 'Starfall', price: 800, shape: 'star', colors: ['#F5B301', '#FDE68A'] },
    { id: 'leaves', name: 'Drifting Leaves', price: 800, shape: 'leaf', colors: ['#16A34A', '#84CC16', '#CA8A04'] },
    { id: 'bubbles', name: 'Deep Current', price: 1200, shape: 'ring', colors: ['#0EA5E9', '#22D3EE'] },
    { id: 'rain', name: 'Monsoon', price: 1200, shape: 'drop', colors: ['#38BDF8', '#0284C7'] },
    { id: 'embers', name: 'Embers', price: 1800, shape: 'dot', colors: ['#F97316', '#DC2626', '#F5B301'] }
  ];

  /* Nameplates — the bar the display name sits on. */
  var NAMEPLATES = [
    { id: 'none', name: 'None', price: 0, css: 'transparent', text: '#0A0A0B' },
    { id: 'slate', name: 'Slate', price: 200, css: 'linear-gradient(90deg,#111827,#374151)', text: '#FFFFFF' },
    { id: 'cobalt', name: 'Cobalt', price: 400, css: 'linear-gradient(90deg,#1B4DFF,#4F7BFF)', text: '#FFFFFF' },
    { id: 'forest', name: 'Forest', price: 400, css: 'linear-gradient(90deg,#065F46,#10B981)', text: '#FFFFFF' },
    { id: 'sunset', name: 'Sunset', price: 700, css: 'linear-gradient(90deg,#F97316,#EC4899)', text: '#FFFFFF' },
    { id: 'lagoon', name: 'Lagoon', price: 700, css: 'linear-gradient(90deg,#0EA5E9,#22D3EE)', text: '#053345' },
    { id: 'orchid', name: 'Orchid', price: 1000, css: 'linear-gradient(90deg,#7C3AED,#C084FC)', text: '#FFFFFF' },
    { id: 'gilded', name: 'Gilded', price: 1600, css: 'linear-gradient(90deg,#B45309,#F5B301)', text: '#2A1A00' }
  ];

  /* Banners — the strip behind the top of the profile card. */
  var BANNERS = [
    { id: 'plain', name: 'Plain', price: 0, css: '#F3F4F6' },
    { id: 'ink', name: 'Ink', price: 150, css: 'linear-gradient(120deg,#0A0A0B,#3F3F46)' },
    { id: 'atlas', name: 'Atlas', price: 350, css: 'linear-gradient(120deg,#1B4DFF,#22D3EE)' },
    { id: 'savanna', name: 'Savanna', price: 350, css: 'linear-gradient(120deg,#F59E0B,#FDE68A)' },
    { id: 'tundra', name: 'Tundra', price: 600, css: 'linear-gradient(120deg,#94A3B8,#E2E8F0)' },
    { id: 'rainforest', name: 'Rainforest', price: 600, css: 'linear-gradient(120deg,#064E3B,#34D399)' },
    { id: 'dusk', name: 'Dusk', price: 950, css: 'linear-gradient(120deg,#312E81,#DB2777,#F59E0B)' },
    { id: 'meridian', name: 'Meridian', price: 1500, css: 'linear-gradient(120deg,#0A0A0B,#1B4DFF,#22D3EE,#F5B301)' }
  ];

  /* Profile themes — accent pair applied to the profile card. */
  var THEMES = [
    { id: 'default', name: 'Default', price: 0, c1: '#1B4DFF', c2: '#0A0A0B' },
    { id: 'moss', name: 'Moss', price: 250, c1: '#10B981', c2: '#064E3B' },
    { id: 'clay', name: 'Clay', price: 250, c1: '#EA580C', c2: '#7C2D12' },
    { id: 'plum', name: 'Plum', price: 500, c1: '#9333EA', c2: '#3B0764' },
    { id: 'ice', name: 'Ice', price: 500, c1: '#0EA5E9', c2: '#0C4A6E' },
    { id: 'rose', name: 'Rose', price: 800, c1: '#E11D48', c2: '#4C0519' },
    { id: 'graphite', name: 'Graphite', price: 800, c1: '#475569', c2: '#0F172A' }
  ];

  /* Avatars — emoji, so nothing external has to load. */
  var AVATARS = [
    { id: 'globe', art: 'globe', color: '#1B4DFF', price: 0 },
    { id: 'map', art: 'map', color: '#0E9F6E', price: 0 },
    { id: 'compass', art: 'compass', color: '#B45309', price: 0 },
    { id: 'mountain', art: 'mountain', color: '#475569', price: 0 },
    { id: 'fox', art: 'fox', color: '#EA580C', price: 120 },
    { id: 'owl', art: 'owl', color: '#7C3AED', price: 120 },
    { id: 'whale', art: 'whale', color: '#0EA5E9', price: 120 },
    { id: 'penguin', art: 'penguin', color: '#0F172A', price: 120 },
    { id: 'rocket', art: 'rocket', color: '#E11D48', price: 300 },
    { id: 'satellite', art: 'satellite', color: '#0891B2', price: 300 },
    { id: 'volcano', art: 'volcano', color: '#DC2626', price: 300 },
    { id: 'lighthouse', art: 'lighthouse', color: '#C2410C', price: 300 },
    { id: 'camel', art: 'camel', color: '#A16207', price: 600 },
    { id: 'sailboat', art: 'sailboat', color: '#0369A1', price: 600 },
    { id: 'aurora', art: 'aurora', color: '#8B5CF6', price: 600 },
    { id: 'trophy', art: 'trophy', color: '#F5B301', price: 1200 }
  ];

  var STATUSES = [
    { id: 'online', name: 'Online', color: '#22C55E' },
    { id: 'idle', name: 'Idle', color: '#F59E0B' },
    { id: 'dnd', name: 'Do Not Disturb', color: '#EF4444' },
    { id: 'invisible', name: 'Invisible', color: '#9CA3AF' }
  ];

  var ACHIEVEMENTS = [
    { id: 'first-steps', name: 'First Steps', desc: 'Answer your first question', reward: 25 },
    { id: 'streak-10', name: 'On a Roll', desc: 'Hit a 10-answer streak', reward: 75 },
    { id: 'streak-25', name: 'Unstoppable', desc: 'Hit a 25-answer streak', reward: 200 },
    { id: 'perfect-test', name: 'Flawless', desc: 'Score 100% on a practice test', reward: 250 },
    { id: 'test-5', name: 'Test Taker', desc: 'Finish 5 practice tests', reward: 150 },
    { id: 'cards-100', name: 'Card Shark', desc: 'Review 100 flashcards', reward: 150 },
    { id: 'region-master', name: 'Region Master', desc: 'Master every country in one region', reward: 400 },
    { id: 'level-10', name: 'Seasoned', desc: 'Reach level 10', reward: 300 },
    { id: 'answers-500', name: 'Five Hundred', desc: 'Answer 500 questions', reward: 400 },
    { id: 'globetrotter', name: 'Globetrotter', desc: 'Master 100 countries', reward: 600 }
  ];

  global.Cosmetics = {
    decorations: DECORATIONS,
    effects: EFFECTS,
    nameplates: NAMEPLATES,
    banners: BANNERS,
    themes: THEMES,
    avatars: AVATARS,
    statuses: STATUSES,
    achievements: ACHIEVEMENTS,
    earned: EARNED,

    /* Class tags. `tagGlyphs` is the list a picker should be built from,
       so nobody hardcodes four names that later disagree with this file. */
    tagGlyph: tagGlyph,
    tagGlyphs: Object.keys(TAG_GLYPHS),

    /* The ownership rule for an earned badge, in one place so nothing has
       to re-implement it. Unlocking the achievement is the whole of it:
       there is no purchase, no grant and nothing written into
       `state.owned`, so a badge cannot be wearable a moment before it is
       earned and cannot survive a reset that clears the achievement. */
    ownsEarned: function (item, achievements) {
      if (!item || !item.earn) return false;
      return (achievements || []).indexOf(item.earn) !== -1;
    },

    /* The achievement a badge comes from, for showing what unlocks it. */
    unlockedBy: function (item) {
      if (!item || !item.earn) return null;
      for (var i = 0; i < ACHIEVEMENTS.length; i++) {
        if (ACHIEVEMENTS[i].id === item.earn) return ACHIEVEMENTS[i];
      }
      return null;
    },

    find: function (list, id) {
      for (var i = 0; i < list.length; i++) { if (list[i].id === id) return list[i]; }
      return list[0];
    }
  };
})(window);
