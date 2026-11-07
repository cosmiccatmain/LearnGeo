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
    { id: 'ring-sky', name: 'Horizon', price: 0, kind: 'ring', c1: '#0EA5E9', c2: '#BAE6FD' },
    { id: 'ring-chalk', name: 'Chalk Frame', price: 0, kind: 'ring', c1: '#E2E8F0', c2: '#94A3B8' },
    { id: 'ring-gold', name: 'Meridian Gold', price: 300, kind: 'ring', c1: '#F5B301', c2: '#FF8A00' },
    { id: 'ring-aurora', name: 'Aurora', price: 450, kind: 'ring', c1: '#22D3EE', c2: '#8B5CF6' },
    { id: 'ring-coral', name: 'Coral Reef', price: 450, kind: 'ring', c1: '#FB7185', c2: '#F97316' },
    { id: 'ring-mint', name: 'Mint Coast', price: 550, kind: 'ring', c1: '#10B981', c2: '#A7F3D0' },
    { id: 'laurel', name: 'Laurel', price: 700, kind: 'badge', badge: 'laurel', c1: '#16A34A' },
    { id: 'compass', name: 'Compass Rose', price: 700, kind: 'badge', badge: 'compass', c1: '#1B4DFF' },
    { id: 'orbit', name: 'Low Orbit', price: 900, kind: 'orbit', c1: '#1B4DFF', c2: '#22D3EE' },
    { id: 'sakura', name: 'Sakura', price: 900, kind: 'badge', badge: 'bloom', c1: '#F472B6' },
    { id: 'crown', name: 'Summit Crown', price: 1400, kind: 'badge', badge: 'crown', c1: '#F5B301' },
    { id: 'ring-glacier', name: 'Glacier', price: 1400, kind: 'ring', c1: '#38BDF8', c2: '#E0F2FE' },
    { id: 'ring-magma', name: 'Magma', price: 2000, kind: 'ring', c1: '#DC2626', c2: '#F59E0B' },
    { id: 'ring-neon', name: 'Neon Trail', price: 2200, kind: 'orbit', c1: '#F472B6', c2: '#22D3EE' },
    /* secrets (secrets.js). Never sold; held once the secret is found. */
    { id: 'ring-tayt', name: 'Tayt', price: 0, kind: 'ring', c1: '#A855F7', c2: '#F472B6', earn: 'secret', secret: 'tayt' },
    { id: 'ring-keeper', name: 'Secret Keeper', price: 0, kind: 'ring', c1: '#F5B301', c2: '#7C3AED', earn: 'secret', secret: '*' }
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
    { id: 'ach-cards-100',    name: 'Arcade Regular', kind: 'badge', badge: 'joystick', c1: '#8B5CF6', earn: 'cards-100' },
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
     Bullseye, region, clipboard, joystick and orbit all turn to mud there.
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

  /* Profile effects — animated particles over the profile card.
     `motion` picks the CSS keyframe family in cosmetics-extra.css /
     runEffect(). Premium ids must stay in sync with
     0013_premium_subscriptions.sql (embers, gambling, wings, rain, bubbles). */
  var EFFECTS = [
    { id: 'none', name: 'None', price: 0, shape: null, colors: [], motion: null, count: 0 },
    /* Free solid effect — soft atlas sparks so Free accounts get a real
       animated look without touching the Premium catalogue. */
    { id: 'spark', name: 'Atlas Sparks', price: 0, shape: 'spark',
      colors: ['#1B4DFF', '#22D3EE', '#F5B301'], motion: 'twinkle', count: 18,
      blurb: 'Soft brand sparks across your card. Free for every explorer.' },
    { id: 'confetti', name: 'Confetti', price: 500, shape: 'rect',
      colors: ['#1B4DFF', '#F5B301', '#0E9F6E', '#FB7185'], motion: 'tumble', count: 22 },
    { id: 'snow', name: 'Snowfall', price: 500, shape: 'dot',
      colors: ['#BAE6FD', '#E0F2FE', '#FFFFFF'], motion: 'drift', count: 24 },
    { id: 'stars', name: 'Starfall', price: 800, shape: 'star',
      colors: ['#F5B301', '#FDE68A', '#FFF7ED'], motion: 'twinkle-fall', count: 16 },
    { id: 'leaves', name: 'Drifting Leaves', price: 800, shape: 'leaf',
      colors: ['#16A34A', '#84CC16', '#CA8A04'], motion: 'sway', count: 14 },
    { id: 'petals', name: 'Cherry Drift', price: 900, shape: 'petal',
      colors: ['#FB7185', '#F9A8D4', '#FDA4AF'], motion: 'sway', count: 16 },
    { id: 'bubbles', name: 'Deep Current', price: 1200, shape: 'ring',
      colors: ['#0EA5E9', '#22D3EE', '#67E8F9'], motion: 'rise', count: 16, premium: true,
      blurb: 'Bubbles rising through deep water. Premium.' },
    { id: 'rain', name: 'Monsoon', price: 1200, shape: 'drop',
      colors: ['#38BDF8', '#0284C7', '#7DD3FC'], motion: 'rain', count: 28, premium: true,
      blurb: 'Fast monsoon streaks. Premium.' },
    { id: 'embers', name: 'Embers', price: 1800, shape: 'ember',
      colors: ['#F97316', '#DC2626', '#F5B301'], motion: 'embers', count: 20, premium: true,
      blurb: 'Glowing embers drifting upward. Premium.' },
    { id: 'wings', name: 'Chicken Wings', price: 900, shape: 'wing',
      colors: ['#B45309', '#D97706', '#92400E', '#C2410C'], motion: 'flutter', count: 12, premium: true,
      blurb: 'Fluttering wings across the card. Premium.' },
    { id: 'gambling', name: 'Gambling', price: 1500, shape: 'dice',
      colors: ['#FFFFFF', '#FEF3C7', '#F1F5F9'], motion: 'tumble', count: 14, premium: true,
      blurb: 'Dice tumbling over your profile. Premium.' },

    /* ---------------------- the one with no price -------------------
       Not for sale, and not earnable either. It carries `earn` so the
       shop routes it through ownsEarned and refuses to sell it — the
       same two locks the achievement badges use — and `staff`, which
       is what ownsEarned actually looks at for this one.

       `earn` is deliberately a string no achievement uses. If one ever
       did, holding that achievement would hand out the staff effect. */
    { id: 'staff', name: 'LearnGeo Staff', price: 0, shape: 'crest',
      colors: ['#1B4DFF', '#F5B301', '#22D3EE'], motion: 'twinkle', count: 18,
      earn: 'staff-grant', staff: true,
      blurb: 'Brand-mark sparks in LearnGeo blue and gold. Granted from the Administrator page and nowhere else.' },
    { id: 'fx-keeper', name: 'Secret Keeper', price: 0, shape: 'star',
      colors: ['#F5B301', '#7C3AED', '#F472B6'], motion: 'twinkle-fall', count: 16,
      earn: 'secret', secret: '*' }
  ];

  /* Nameplates — the bar the display name sits on. */
  var NAMEPLATES = [
    { id: 'none', name: 'None', price: 0, css: 'transparent', text: '#0A0A0B' },
    { id: 'parchment', name: 'Parchment', price: 0, css: 'linear-gradient(90deg,#F8F1E3,#E8D9C0)', text: '#3B2F1A' },
    { id: 'slate', name: 'Slate', price: 200, css: 'linear-gradient(90deg,#111827,#374151)', text: '#FFFFFF' },
    { id: 'cobalt', name: 'Cobalt', price: 400, css: 'linear-gradient(90deg,#1B4DFF,#4F7BFF)', text: '#FFFFFF' },
    { id: 'forest', name: 'Forest', price: 400, css: 'linear-gradient(90deg,#065F46,#10B981)', text: '#FFFFFF' },
    { id: 'harbor', name: 'Harbor', price: 450, css: 'linear-gradient(90deg,#0F766E,#14B8A6)', text: '#ECFEFF' },
    { id: 'sunset', name: 'Sunset', price: 700, css: 'linear-gradient(90deg,#F97316,#EC4899)', text: '#FFFFFF' },
    { id: 'lagoon', name: 'Lagoon', price: 700, css: 'linear-gradient(90deg,#0EA5E9,#22D3EE)', text: '#053345' },
    { id: 'orchid', name: 'Orchid', price: 1000, css: 'linear-gradient(90deg,#7C3AED,#C084FC)', text: '#FFFFFF' },
    { id: 'gilded', name: 'Gilded', price: 1600, css: 'linear-gradient(90deg,#B45309,#F5B301)', text: '#2A1A00' },
    { id: 'antipodes', name: 'Antipodes', price: 0, css: 'linear-gradient(90deg,#DC2626,#0A0A0B 50%,#1B4DFF)', text: '#FFFFFF', earn: 'secret', secret: 'antipodes' }
  ];

  /* Banners — the strip behind the top of the profile card. */
  var BANNERS = [
    { id: 'plain', name: 'Plain', price: 0, css: '#F3F4F6' },
    { id: 'meadow', name: 'Meadow', price: 0, css: 'linear-gradient(120deg,#BBF7D0,#86EFAC 45%,#4ADE80)' },
    { id: 'chalkboard', name: 'Chalkboard', price: 0, css: 'linear-gradient(135deg,#1E293B 0%,#334155 55%,#0F172A 100%)' },
    { id: 'ink', name: 'Ink', price: 150, css: 'linear-gradient(120deg,#0A0A0B,#3F3F46)' },
    { id: 'atlas', name: 'Atlas', price: 350, css: 'linear-gradient(120deg,#1B4DFF,#22D3EE)' },
    { id: 'savanna', name: 'Savanna', price: 350, css: 'linear-gradient(120deg,#F59E0B,#FDE68A)' },
    { id: 'canyon', name: 'Canyon', price: 450, css: 'linear-gradient(120deg,#9A3412,#EA580C,#FDBA74)' },
    { id: 'tundra', name: 'Tundra', price: 600, css: 'linear-gradient(120deg,#94A3B8,#E2E8F0)' },
    { id: 'rainforest', name: 'Rainforest', price: 600, css: 'linear-gradient(120deg,#064E3B,#34D399)' },
    { id: 'aurora-sky', name: 'Northern Lights', price: 850, css: 'linear-gradient(120deg,#0F172A,#4C1D95,#22D3EE,#A3E635)' },
    { id: 'dusk', name: 'Dusk', price: 950, css: 'linear-gradient(120deg,#312E81,#DB2777,#F59E0B)' },
    { id: 'meridian', name: 'Meridian', price: 1500, css: 'linear-gradient(120deg,#0A0A0B,#1B4DFF,#22D3EE,#F5B301)' },
    { id: 'bookworm', name: 'Bookworm', price: 0, css: 'linear-gradient(120deg,#3B2414,#92400E,#FDE68A)', earn: 'secret', secret: 'bookworm' }
  ];

  /* Profile themes — accent pair applied to the profile card. */
  var THEMES = [
    { id: 'default', name: 'Default', price: 0, c1: '#1B4DFF', c2: '#0A0A0B' },
    { id: 'sand', name: 'Sand', price: 0, c1: '#D97706', c2: '#451A03' },
    { id: 'moss', name: 'Moss', price: 250, c1: '#10B981', c2: '#064E3B' },
    { id: 'clay', name: 'Clay', price: 250, c1: '#EA580C', c2: '#7C2D12' },
    { id: 'tide', name: 'Tide', price: 350, c1: '#0F766E', c2: '#042F2E' },
    { id: 'plum', name: 'Plum', price: 500, c1: '#9333EA', c2: '#3B0764' },
    { id: 'ice', name: 'Ice', price: 500, c1: '#0EA5E9', c2: '#0C4A6E' },
    { id: 'rose', name: 'Rose', price: 800, c1: '#E11D48', c2: '#4C0519' },
    { id: 'graphite', name: 'Graphite', price: 800, c1: '#475569', c2: '#0F172A' },
    { id: 'comeback', name: 'Comeback', price: 0, c1: '#F97316', c2: '#450A0A', earn: 'secret', secret: 'comeback' }
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
    { id: 'trophy', art: 'trophy', color: '#F5B301', price: 1200 },
    { id: 'chicken', art: 'chicken', color: '#B45309', price: 450 }
  ];

  var STATUSES = [
    { id: 'online', name: 'Online', color: '#22C55E' },
    { id: 'idle', name: 'Idle', color: '#F59E0B' },
    { id: 'dnd', name: 'Do Not Disturb', color: '#EF4444' },
    { id: 'invisible', name: 'Invisible', color: '#9CA3AF' }
  ];

  /* --------------------- Geo Dash game cosmetics --------------------
     Trails leave a particle wake behind the runner. Jumpers are the
     cube's visual style when no capital-flag skin is on. Both live under
     Customise → Games. Premium ids must stay in sync with
     0016_geo_dash_cosmetics.sql. */
  var TRAILS = [
    { id: 'none', name: 'None', price: 0, colors: [], shape: null, rate: 0, size: 0, air: false,
      blurb: 'No wake behind the cube.' },
    { id: 'dust', name: 'Chalk Dust', price: 0, colors: ['rgba(255,255,255,.78)'], shape: 'square',
      rate: 0.035, size: 0.16, air: false,
      blurb: 'Soft white chalk behind every stride. Free for every explorer.' },
    { id: 'atlas', name: 'Atlas Wake', price: 200, colors: ['#1B4DFF', '#22D3EE', '#F5B301'], shape: 'spark',
      rate: 0.03, size: 0.17, air: false,
      blurb: 'Brand sparks left on the track.' },
    { id: 'breeze', name: 'Sea Breeze', price: 350, colors: ['#0EA5E9', '#67E8F9', '#BAE6FD'], shape: 'circle',
      rate: 0.028, size: 0.15, air: true,
      blurb: 'Cool aqua motes that keep drifting in the air.' },
    { id: 'leaf', name: 'Canopy Drift', price: 450, colors: ['#16A34A', '#84CC16', '#CA8A04'], shape: 'leaf',
      rate: 0.04, size: 0.18, air: false,
      blurb: 'Leaf flecks kicked up from the floor.' },
    { id: 'ember', name: 'Ember Wake', price: 900, colors: ['#F97316', '#DC2626', '#F5B301'], shape: 'ember',
      rate: 0.026, size: 0.15, air: true, premium: true,
      blurb: 'Glowing embers that trail through jumps. Premium.' },
    { id: 'neon', name: 'Neon Stream', price: 1200, colors: ['#F472B6', '#22D3EE', '#A78BFA'], shape: 'streak',
      rate: 0.022, size: 0.22, air: true, premium: true,
      blurb: 'Long neon streaks behind the cube. Premium.' },
    { id: 'aurora', name: 'Aurora Trail', price: 1600, colors: ['#22D3EE', '#8B5CF6', '#A3E635', '#F472B6'], shape: 'spark',
      rate: 0.02, size: 0.2, air: true, premium: true,
      blurb: 'Northern-light sparks in the air and on the ground. Premium.' }
  ];

  var JUMPERS = [
    { id: 'classic', name: 'Classic Cube', price: 0, style: 'classic',
      fill: '#FFD23F', accent: '#1B4DFF', face: '#fff',
      blurb: 'The original LearnGeo dash cube.' },
    { id: 'cobalt', name: 'Cobalt Block', price: 0, style: 'block',
      fill: '#1B4DFF', accent: '#22D3EE', face: '#E0F2FE',
      blurb: 'Solid brand blue with a cyan inset.' },
    { id: 'slate', name: 'Slate Runner', price: 250, style: 'block',
      fill: '#334155', accent: '#94A3B8', face: '#F8FAFC',
      blurb: 'Quiet charcoal with a steel inset.' },
    { id: 'meadow', name: 'Meadow Cube', price: 350, style: 'block',
      fill: '#16A34A', accent: '#BBF7D0', face: '#ECFDF5',
      blurb: 'Fresh green for a softer run.' },
    { id: 'compass', name: 'Compass Cube', price: 550, style: 'compass',
      fill: '#0EA5E9', accent: '#F5B301', face: '#fff',
      blurb: 'Sky-blue face with a gold compass rose.' },
    { id: 'sunset', name: 'Sunset Form', price: 800, style: 'gradient',
      fill: '#F97316', accent: '#EC4899', face: '#FFF7ED',
      blurb: 'Warm orange-to-pink gradient body.' },
    { id: 'aurora', name: 'Aurora Form', price: 1400, style: 'aurora',
      fill: '#7C3AED', accent: '#22D3EE', face: '#F5F3FF', premium: true,
      blurb: 'Violet body with aurora rim light. Premium.' },
    { id: 'gilded', name: 'Gilded Cube', price: 1800, style: 'gilded',
      fill: '#B45309', accent: '#F5B301', face: '#FFFBEB', premium: true,
      blurb: 'Meridian gold with a bright rim. Premium.' }
  ];

  /* --------------------- more Games cosmetics (LEA-59) ----------------
     Board / runner / tile themes for Chess, Snake, Match, Maze, and Duel.
     Premium ids must stay in sync with 0020_more_games_cosmetics.sql. */
  var CHESS_BOARDS = [
    { id: 'classic', name: 'Classic Green', price: 0,
      light: '#e8ebd5', dark: '#72957d', border: '#23443b',
      blurb: 'The familiar LearnGeo board.' },
    { id: 'parchment', name: 'Parchment', price: 0,
      light: '#f3e6c8', dark: '#b08968', border: '#6b4f3a',
      blurb: 'Warm map-paper squares. Free.' },
    { id: 'atlas', name: 'Atlas Blue', price: 300,
      light: '#dbe7ff', dark: '#3b6fd9', border: '#1B4DFF',
      blurb: 'Brand-blue checker for Geo Chess.' },
    { id: 'midnight', name: 'Midnight Sea', price: 450,
      light: '#c7d7e8', dark: '#2a4060', border: '#152238',
      blurb: 'Cool navy for evening matches.' },
    { id: 'canopy', name: 'Canopy', price: 550,
      light: '#e4f0d4', dark: '#4f7a3c', border: '#2f4a24',
      blurb: 'Forest greens across the ranks.' },
    { id: 'aurora', name: 'Aurora Board', price: 1400, premium: true,
      light: '#e8ddff', dark: '#5b4fcf', border: '#7C3AED',
      blurb: 'Violet aurora squares. Premium.' },
    { id: 'meridian', name: 'Meridian Gold', price: 1800, premium: true,
      light: '#fff3cc', dark: '#c4891a', border: '#8a5a08',
      blurb: 'Gold and parchment. Premium.' }
  ];

  var CHESS_PIECES = [
    { id: 'classic', name: 'Classic Set', price: 0,
      white: '#fffdf2', black: '#172e2b', outline: '#243c35',
      blurb: 'Cream white and deep green-black.' },
    { id: 'ivory', name: 'Ivory & Ink', price: 0,
      white: '#fffaf0', black: '#1f2937', outline: '#374151',
      blurb: 'Soft ivory against ink black. Free.' },
    { id: 'ocean', name: 'Ocean Set', price: 250,
      white: '#e0f2fe', black: '#0c4a6e', outline: '#0369a1',
      blurb: 'Sea-foam white and deep ocean.' },
    { id: 'ember', name: 'Ember Set', price: 500,
      white: '#fff7ed', black: '#7c2d12', outline: '#9a3412',
      blurb: 'Warm cream and ember black.' },
    { id: 'neon', name: 'Neon Set', price: 1200, premium: true,
      white: '#f5f3ff', black: '#4c1d95', outline: '#7c3aed',
      blurb: 'Bright violet pair. Premium.' },
    { id: 'gilded', name: 'Gilded Set', price: 1600, premium: true,
      white: '#fffbeb', black: '#78350f', outline: '#b45309',
      blurb: 'Meridian gold outline. Premium.' }
  ];

  var SNAKE_BODIES = [
    { id: 'meadow', name: 'Meadow Coil', price: 0,
      bands: ['#1d5a24', '#8BD650', '#B5EE7A'], face: '#9BE15D',
      blurb: 'The original Capital Snake greens.' },
    { id: 'cobalt', name: 'Cobalt Coil', price: 0,
      bands: ['#123a8a', '#3b82f6', '#93c5fd'], face: '#60a5fa',
      blurb: 'Brand-blue body. Free.' },
    { id: 'slate', name: 'Slate Coil', price: 250,
      bands: ['#1e293b', '#64748b', '#cbd5e1'], face: '#94a3b8',
      blurb: 'Quiet steel for night runs.' },
    { id: 'sunset', name: 'Sunset Coil', price: 450,
      bands: ['#9a3412', '#f97316', '#fdba74'], face: '#fb923c',
      blurb: 'Warm orange coil.' },
    { id: 'neon', name: 'Neon Coil', price: 1100, premium: true,
      bands: ['#6d28d9', '#a78bfa', '#f472b6'], face: '#c4b5fd',
      blurb: 'Violet-pink neon. Premium.' },
    { id: 'aurora', name: 'Aurora Coil', price: 1500, premium: true,
      bands: ['#0e7490', '#22d3ee', '#a3e635'], face: '#67e8f9',
      blurb: 'Northern-light greens and cyan. Premium.' }
  ];

  var MATCH_BACKS = [
    { id: 'indigo', name: 'Indigo Back', price: 0,
      down: '#1B2A5E', up: '#16205a', mark: 'rgba(124,243,255,.22)',
      blurb: 'The classic Flag Match card back.' },
    { id: 'chalk', name: 'Chalk Back', price: 0,
      down: '#334155', up: '#475569', mark: 'rgba(226,232,240,.28)',
      blurb: 'Soft chalkboard backs. Free.' },
    { id: 'atlas', name: 'Atlas Back', price: 250,
      down: '#1B4DFF', up: '#2563eb', mark: 'rgba(34,211,238,.3)',
      blurb: 'Brand-blue card backs.' },
    { id: 'meadow', name: 'Meadow Back', price: 400,
      down: '#166534', up: '#15803d', mark: 'rgba(187,247,208,.28)',
      blurb: 'Forest green backs.' },
    { id: 'neon', name: 'Neon Back', price: 1000, premium: true,
      down: '#5b21b6', up: '#7c3aed', mark: 'rgba(244,114,182,.35)',
      blurb: 'Violet neon backs. Premium.' },
    { id: 'aurora', name: 'Aurora Back', price: 1400, premium: true,
      down: '#0e7490', up: '#0891b2', mark: 'rgba(163,230,53,.32)',
      blurb: 'Cyan aurora backs. Premium.' }
  ];

  var MAZE_RUNNERS = [
    { id: 'cyan', name: 'Cyan Explorer', price: 0,
      fill: '#7CF3FF', glow: 'rgba(124,243,255,.45)',
      blurb: 'The classic Capital Maze runner.' },
    { id: 'cobalt', name: 'Cobalt Explorer', price: 0,
      fill: '#1B4DFF', glow: 'rgba(27,77,255,.4)',
      blurb: 'Solid brand blue. Free.' },
    { id: 'gold', name: 'Gold Explorer', price: 300,
      fill: '#F5B301', glow: 'rgba(245,179,1,.4)',
      blurb: 'Meridian gold glow.' },
    { id: 'meadow', name: 'Meadow Explorer', price: 400,
      fill: '#4ade80', glow: 'rgba(74,222,128,.4)',
      blurb: 'Fresh green runner.' },
    { id: 'neon', name: 'Neon Explorer', price: 1100, premium: true,
      fill: '#c084fc', glow: 'rgba(192,132,252,.5)',
      blurb: 'Violet neon trail. Premium.' },
    { id: 'aurora', name: 'Aurora Explorer', price: 1500, premium: true,
      fill: '#22d3ee', glow: 'rgba(34,211,238,.5)',
      blurb: 'Aurora cyan glow. Premium.' }
  ];

  var DUEL_ACCENTS = [
    { id: 'brand', name: 'Brand Accent', price: 0,
      accent: '#1B4DFF', soft: 'rgba(27,77,255,.08)',
      blurb: 'Default Geo Duel highlight.' },
    { id: 'emerald', name: 'Emerald Accent', price: 0,
      accent: '#0E9F6E', soft: 'rgba(14,159,110,.1)',
      blurb: 'Cool emerald scoreboard. Free.' },
    { id: 'gold', name: 'Gold Accent', price: 300,
      accent: '#F5B301', soft: 'rgba(245,179,1,.12)',
      blurb: 'Gold rim on your side of the board.' },
    { id: 'coral', name: 'Coral Accent', price: 450,
      accent: '#FB7185', soft: 'rgba(251,113,133,.12)',
      blurb: 'Warm coral duel highlight.' },
    { id: 'neon', name: 'Neon Accent', price: 1100, premium: true,
      accent: '#A78BFA', soft: 'rgba(167,139,250,.14)',
      blurb: 'Violet neon duel rim. Premium.' },
    { id: 'aurora', name: 'Aurora Accent', price: 1500, premium: true,
      accent: '#22D3EE', soft: 'rgba(34,211,238,.14)',
      blurb: 'Aurora cyan duel rim. Premium.' }
  ];

  var ACHIEVEMENTS = [
    { id: 'first-steps', name: 'First Steps', desc: 'Answer your first question', reward: 25 },
    { id: 'streak-10', name: 'On a Roll', desc: 'Hit a 10-answer streak', reward: 75 },
    { id: 'streak-25', name: 'Unstoppable', desc: 'Hit a 25-answer streak', reward: 200 },
    { id: 'perfect-test', name: 'Flawless', desc: 'Score 100% on a practice test', reward: 250 },
    { id: 'test-5', name: 'Test Taker', desc: 'Finish 5 practice tests', reward: 150 },
    { id: 'cards-100', name: 'Arcade Regular', desc: 'Answer 150 questions in the arcade', reward: 150 },
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
    trails: TRAILS,
    jumpers: JUMPERS,
    chessBoards: CHESS_BOARDS,
    chessPieces: CHESS_PIECES,
    snakeBodies: SNAKE_BODIES,
    matchBacks: MATCH_BACKS,
    mazeRunners: MAZE_RUNNERS,
    duelAccents: DUEL_ACCENTS,
    achievements: ACHIEVEMENTS,
    earned: EARNED,

    /* Class tags. `tagGlyphs` is the list a picker should be built from,
       so nobody hardcodes four names that later disagree with this file. */
    tagGlyph: tagGlyph,
    tagGlyphs: Object.keys(TAG_GLYPHS),

    /* Premium cosmetics need flags.premium (account Premium). LEA-43. */
    requiresPremium: function (item) {
      return !!(item && item.premium);
    },

    /* The ownership rule for an earned badge, in one place so nothing has
       to re-implement it. Unlocking the achievement is the whole of it:
       there is no purchase, no grant and nothing written into
       `state.owned`, so a badge cannot be wearable a moment before it is
       earned and cannot survive a reset that clears the achievement. */
    ownsEarned: function (item, achievements) {
      if (!item) return false;
      /* A staff item is held by the mark on the save, not by anything in
         the achievement list. Checked FIRST so a staff item never falls
         through to a lookup that would answer no for the wrong reason.

         state is read here rather than passed in because the shop calls
         this with the achievement list and nothing else, and widening
         that call means editing ui.js, which several sessions share. */
      if (item.staff) {
        var s = global.WW && global.WW.state;
        if (s && s.flags && s.flags.staff) return true;
        /* One of the admin classroom perks (0010): everybody in one wears
           it while they are in it, and loses it when they leave. */
        var X = global.ClassExtras;
        return !!(X && X.inAdminClass && X.inAdminClass());
      }
      if (!item.earn) return false;
      if (item.secret) {
        var S = global.Secrets;
        if (!S) return false;
        return item.secret === '*' ? S.allFound() : S.has(item.secret);
      }
      return (achievements || []).indexOf(item.earn) !== -1;
    },

    /* The achievement a badge comes from, for showing what unlocks it.
       A staff item has no achievement, so it answers a line of its own
       in the same shape: the shop prints `.desc` under a locked tile and
       the toast reads it when somebody taps one. */
    unlockedBy: function (item) {
      if (!item || !item.earn) return null;
      if (item.staff) {
        return { id: 'staff-grant', name: 'LearnGeo Staff',
                 desc: 'For LearnGeo staff and admin classrooms — not for sale', reward: 0 };
      }
      if (item.secret) {
        return { id: 'secret', name: 'Secret', desc: '??? Find a secret', reward: 0 };
      }
      for (var i = 0; i < ACHIEVEMENTS.length; i++) {
        if (ACHIEVEMENTS[i].id === item.earn) return ACHIEVEMENTS[i];
      }
      return null;
    },

    /* The Administrator page shows the staff item's name and blurb, and
       should not have to know its id to do it. */
    get staffEffect() {
      for (var i = 0; i < EFFECTS.length; i++) { if (EFFECTS[i].staff) return EFFECTS[i]; }
      return null;
    },

    find: function (list, id) {
      for (var i = 0; i < list.length; i++) { if (list[i].id === id) return list[i]; }
      return list[0];
    }
  };
})(window);
