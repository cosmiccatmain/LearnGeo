/* ------------------------------------------------------------------
   LearnGeo — Games
   A hub of small 2D games where geography is part of how you play.
   GAMES is the list the hub draws. Each entry brings its own setup
   screen (intro, keys, side panels) and a mount(host) that returns
   { destroy }.

   Each game keeps its own record under state.games.<id>.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons;
  var esc = W.escapeHtml;

  var EVERY = [10, 20, 30, 45];
  var KINDS = [['flags', 'Flags'], ['capitals', 'Capitals'], ['mix', 'Mix']];
  var FOODS = [['capitals', 'Capitals'], ['flags', 'Flags'], ['mix', 'Mix']];
  var SPEEDS = [['relaxed', 'Relaxed'], ['normal', 'Normal'], ['fast', 'Fast']];
  var WALLS = [['solid', 'Solid'], ['wrap', 'Wrap round']];
  var TARGETS = [['countries', 'Countries'], ['capitals', 'Capitals'], ['mix', 'Mix']];
  var HOLES = [['6', '6 holes'], ['9', '9 holes'], ['18', '18 holes']];
  var LEVELS = [['1', 'Level 1 difficulty'], ['2', 'Level 2 difficulty'], ['3', 'Level 3 difficulty'], ['4', 'Level 4 difficulty'], ['5', 'Level 5 difficulty']];
  /* the ten added alongside the first five */
  var ROWS_ = [['2', '2 rows'], ['3', '3 rows'], ['4', '4 rows']];
  var RATES_ = [['calm', 'Calm'], ['brisk', 'Brisk'], ['frantic', 'Frantic']];
  var LENGTHS = [['60', '60s'], ['90', '90s'], ['120', '120s']];
  var SIZES = [['6', '6 pairs'], ['8', '8 pairs'], ['10', '10 pairs']];
  var SHOWS = [['name', 'Country'], ['flag', 'Flag'], ['capital', 'Capital']];
  var PADS = [['4', '4 flags'], ['6', '6 flags'], ['8', '8 flags']];

  var GAMES = [
    {
      id: 'chess', title: 'Geo Chess', art: 'chess',
      blurb: 'Build your chess skills, from a forgiving beginner opponent to Stockfish. Answer a geography question to unlock each move.',
      meta: 'Chess · five difficulty levels',
      best: function (r) { return r.wins ? r.wins + (r.wins === 1 ? ' win' : ' wins') : ''; },
      intro: 'Play White against the computer. Answer a question from your study set before each move. A wrong answer shows you the answer and gives you another question. Choose a piece, then a highlighted square. Castling, en passant and promotion follow standard chess rules.',
      keys: [[['Click / tap'], 'a piece, then its destination'], [['Arrow keys'], 'explore the board; Enter or Space selects a square']],
      filters: { title: 'Chess question filters', heading: 'Move questions', typed: true },
      side: function (r) {
        return '<div class="panel"><div class="panel__head"><h3>Difficulty</h3></div>' +
          segHtml('level', LEVELS, pick(LEVELS, String(r.level), '1')) +
          '<p class="field__hint">Level 1 plays random legal moves. Level 2 plays mostly random moves. Levels 3–5 use increasingly strong Stockfish opponents.</p></div>' +
          '<div class="panel"><div class="panel__head"><h3>Questions</h3></div>' +
          segHtml('kind', KINDS, kind_(r)) + '</div>' +
          stats([[r.wins || 0, 'Wins'], [r.draws || 0, 'Draws'], [r.completed || 0, 'Finished games']]);
      },
      wire: function (el, r) {
        seg(el, '[data-level]', function (v) { r.level = +v; });
        seg(el, '[data-kind]', function (v) { r.kind = v; });
      },
      mount: function (stage, r) {
        return global.GeoChess.mount(stage, {
          level: +pick(LEVELS, String(r.level), '1'), kind: kind_(r),
          cfg: function () { return gameCfg('chess'); }, onBack: toSetup
        });
      },
      playing: function () { return 'Move questions from ' + global.StudyFilters.label(gameCfg('chess')); }
    },
    {
      id: 'dash', title: 'Geo Dash', art: 'dash',
      blurb: 'Jump over spikes and onto blocks to the beat of your own taps. Every so often a capital gate comes up, and you have to name the capital to keep running.',
      meta: 'One button · capital gates',
      best: function (r) { return r.best ? 'Best ' + r.best + ' m' : ''; },
      intro: 'Your cube runs by itself. Jump over spikes, land on blocks, and get as far as you can. ' +
        'Every so often a capital gate comes down the track: name the capital and the run speeds up, ' +
        'and your cube wears that country’s flag. Get it wrong and the run is over.',
      keys: [
        [['Space', '↑'], 'or click / tap to jump, hold to keep jumping'],
        [['1', '–', '4'], 'answer at a capital gate'],
        [['Esc'], 'pause']
      ],
      filters: { title: 'Capital question filters', heading: 'Capital questions', typed: true },
      side: function (r) {
        var every = EVERY.indexOf(r.every) !== -1 ? r.every : 20;
        return '<div class="panel">' +
            '<div class="panel__head"><h3>A capital gate every</h3></div>' +
            '<div class="seg game-seg" data-every>' +
              EVERY.map(function (s) {
                return '<button data-v="' + s + '" class="' + (s === every ? 'is-active' : '') + '">' + s + 's</button>';
              }).join('') +
            '</div>' +
          '</div>' +
          stats([[(r.best || 0) + ' m', 'Best distance'], [r.bestCaps || 0, 'Most capitals'], [r.runs || 0, 'Runs']]);
      },
      wire: function (el, r) {
        seg(el, '[data-every]', function (v) { r.every = +v; });
      },
      mount: function (stage, r) {
        return global.GeoDash.mount(stage, {
          every: EVERY.indexOf(r.every) !== -1 ? r.every : 20,
          cfg: function () { return gameCfg('dash'); },
          onBack: toSetup
        });
      },
      playing: function () { return 'Capitals from ' + global.StudyFilters.label(gameCfg('dash')); }
    },
    {
      id: 'orbit', title: 'Globe Defender', art: 'orbit',
      blurb: 'Circle the globe and shoot down the meteors before they land. Between waves, shoot the satellite with the right flag or capital for a power-up.',
      meta: 'Steer and shoot · supply drops',
      best: function (r) { return r.best ? 'Best ' + r.best + ' pts' : ''; },
      intro: 'Your ship orbits the globe and fires outward on its own; you steer it round to meet the meteors. ' +
        'Each one that gets through costs a shield and lights up the country it hit. ' +
        'After every wave four satellites fly in: shoot the right one for a power-up, ' +
        'and a wrong one brings a meteor shower.',
      keys: [
        [['←', '→'], 'or A / D, or point with the mouse, to steer'],
        [['Space'], 'fire an answer shot at a satellite, or click / tap one'],
        [['Esc'], 'pause']
      ],
      filters: { title: 'Supply drop filters', heading: 'Supply drop questions', typed: false },
      side: function (r) {
        return '<div class="panel">' +
            '<div class="panel__head"><h3>Satellites show</h3></div>' +
            segHtml('kind', KINDS, kind_(r)) +
            '<div class="field__hint" style="margin-top:10px">Flags: shoot the flag of the country named. Capitals: shoot its capital. Mix: either.</div>' +
          '</div>' +
          stats([[r.best || 0, 'Best score'], [r.bestWave || 0, 'Best wave'], [r.runs || 0, 'Games']]);
      },
      wire: function (el, r) {
        seg(el, '[data-kind]', function (v) { r.kind = v; });
      },
      mount: function (stage, r) {
        return global.GeoOrbit.mount(stage, {
          kind: function () { return kind_(r); },
          cfg: function () { return gameCfg('orbit'); },
          onBack: toSetup
        });
      },
      playing: function () {
        var k = kind_(record('orbit'));
        var what = k === 'capitals' ? 'Capitals' : k === 'mix' ? 'Flags and capitals' : 'Flags';
        return what + ' from ' + global.StudyFilters.label(gameCfg('orbit'));
      }
    },
    {
      id: 'snake', title: 'Capital Snake', art: 'snake',
      blurb: 'Classic Snake, where the food is the answer. Eat the capital of the country named to grow; eat the wrong one and you lose part of your tail.',
      meta: 'Steer · eat the answer',
      best: function (r) { return r.best ? 'Best ' + r.best + ' pts' : ''; },
      intro: 'The banner names a country and four capitals lie on the board. Steer into the right one: the snake grows, ' +
        'speeds up and wears that country’s flag on its head, and quick answers and streaks score more. ' +
        'A wrong capital costs three pieces of tail. Hit a wall or your own tail and the game is over.',
      keys: [
        [['←', '↑', '↓', '→'], 'or WASD, or swipe, to steer'],
        [['Space'], 'start, or carry on after a pause'],
        [['Esc'], 'pause']
      ],
      filters: { title: 'Snake question filters', heading: 'Questions', typed: false },
      side: function (r) {
        return '<div class="panel">' +
            '<div class="panel__head"><h3>The food shows</h3></div>' +
            segHtml('food', FOODS, pick(FOODS, r.food, 'capitals')) +
            '<div class="field__hint" style="margin-top:10px">Capitals: eat the capital of the country named. Flags: eat its flag. Mix: either.</div>' +
          '</div>' +
          '<div class="panel">' +
            '<div class="panel__head"><h3>Speed</h3></div>' +
            segHtml('speed', SPEEDS, pick(SPEEDS, r.speed, 'normal')) +
            '<div class="panel__head" style="margin-top:14px"><h3>Walls</h3></div>' +
            segHtml('walls', WALLS, pick(WALLS, r.walls, 'solid')) +
          '</div>' +
          stats([[r.best || 0, 'Best score'], [r.bestCaps || 0, 'Most right'], [r.runs || 0, 'Games']]);
      },
      wire: function (el, r) {
        seg(el, '[data-food]', function (v) { r.food = v; });
        seg(el, '[data-speed]', function (v) { r.speed = v; });
        seg(el, '[data-walls]', function (v) { r.walls = v; });
      },
      mount: function (stage, r) {
        return global.GeoSnake.mount(stage, {
          kind: function () { return pick(FOODS, r.food, 'capitals'); },
          speed: function () { return pick(SPEEDS, r.speed, 'normal'); },
          walls: function () { return pick(WALLS, r.walls, 'solid'); },
          cfg: function () { return gameCfg('snake'); },
          onBack: toSetup
        });
      },
      playing: function () {
        var k = pick(FOODS, record('snake').food, 'capitals');
        var what = k === 'flags' ? 'Flags' : k === 'mix' ? 'Capitals and flags' : 'Capitals';
        return what + ' from ' + global.StudyFilters.label(gameCfg('snake'));
      }
    },
    {
      id: 'golf', title: 'Geo Golf', art: 'golf',
      blurb: 'Top-down golf on the world map. Each hole names a country or a capital, and there’s no pin to aim at: putt to where it is.',
      meta: 'Drag and putt · on the map',
      best: function (r) {
        var b = r.best || {}, n = b['9'] !== undefined ? '9' : Object.keys(b)[0];
        return n ? 'Best ' + parToText(b[n]) + ' · ' + n + ' holes' : '';
      },
      intro: 'The banner names a country, or a capital whose country you have to find, and you putt across the map to it. ' +
        'Stop in the wrong country and you’re told where you are; stop in the sea and it’s a water hazard. ' +
        'After three misses the pin comes out, and after six you pick up and see where it was. Fewest strokes wins.',
      keys: [
        [['Drag'], 'back from anywhere, like a slingshot, and let go to putt'],
        [['←', '→'], 'aim, with ↑ ↓ for power and Space to putt'],
        [['Esc'], 'pause']
      ],
      filters: { title: 'Golf course filters', heading: 'The course', typed: false },
      side: function (r) {
        var holes = pick(HOLES, String(r.holes), '9');
        var best = (r.best || {})[holes];
        return '<div class="panel">' +
            '<div class="panel__head"><h3>Putt to</h3></div>' +
            segHtml('target', TARGETS, pick(TARGETS, r.target, 'countries')) +
            '<div class="field__hint" style="margin-top:10px">Countries: the hole names the country. Capitals: it names a capital, and you land in its country. Mix: either.</div>' +
            '<div class="panel__head" style="margin-top:14px"><h3>Round</h3></div>' +
            segHtml('holes', HOLES, holes) +
          '</div>' +
          stats([[best === undefined ? '–' : parToText(best), 'Best, ' + holes + ' holes'], [r.aces || 0, 'Holes in one'], [r.rounds || 0, 'Rounds']]);
      },
      wire: function (el, r) {
        seg(el, '[data-target]', function (v) { r.target = v; });
        seg(el, '[data-holes]', function (v) { r.holes = +v; renderSetup(); });
      },
      mount: function (stage, r) {
        return global.GeoGolf.mount(stage, {
          kind: function () { return pick(TARGETS, r.target, 'countries'); },
          holes: function () { return +pick(HOLES, String(r.holes), '9'); },
          cfg: function () { return gameCfg('golf'); },
          onBack: toSetup
        });
      },
      playing: function () {
        var k = pick(TARGETS, record('golf').target, 'countries');
        var what = k === 'capitals' ? 'Capitals' : k === 'mix' ? 'Countries and capitals' : 'Countries';
        return what + ' from ' + global.StudyFilters.label(gameCfg('golf'));
      }
    },
    {
      id: 'invaders', title: 'Geo Invaders', art: 'invaders',
      blurb: 'Space Invaders, where the formation is the answer sheet. Four pods march down carrying flags or capitals, and you shoot the one the banner names.',
      meta: 'Steer and shoot · three lives',
      best: function (r) { return r.best ? 'Best ' + r.best + ' pts' : ''; },
      intro: 'Pods march across the sky and drop a step every time they reach the edge. Shoot the one the banner asks for. A wrong pod costs a life, and so does letting the formation reach your cannon, so a slow answer is punished by the game rather than by a timer.',
      keys: [[['←', '→'], 'or A / D, or the mouse, to steer'], [['Space'], 'fire'], [['Esc'], 'pause']],
      filters: { title: 'Invader question filters', heading: 'Pod questions', typed: false },
      side: function (r) {
        return '<div class="panel"><div class="panel__head"><h3>Pods show</h3></div>' +
          segHtml('kind', KINDS, kind_(r)) + '</div>' +
          stats([[r.best || 0, 'Best score'], [r.runs || 0, 'Games']]);
      },
      wire: function (el, r) { seg(el, '[data-kind]', function (v) { r.kind = v; }); },
      mount: function (stage, r) {
        return global.GeoInvaders.mount(stage, {
          kind: function () { return kind_(r); },
          cfg: function () { return gameCfg('invaders'); }, onBack: toSetup
        });
      },
      playing: function () { return whatKind(kind_(record('invaders'))) + ' from ' + global.StudyFilters.label(gameCfg('invaders')); }
    },
    {
      id: 'breakout', title: 'Flag Breakout', art: 'breakout',
      blurb: 'Breakout against a wall of flags. The banner names a country and rings its flag in the wall; knock that brick out without losing the ball.',
      meta: 'Paddle and ball · flag wall',
      best: function (r) { return r.best ? 'Best ' + r.best + ' pts' : ''; },
      intro: 'A wall of flags from your study set, with the one you are after ringed in gold. Aiming a bouncing ball at one brick is the skill, so a wrong brick is not punished with a life: it tells you whose flag you just hit and the hunt carries on. Only losing the ball costs you.',
      keys: [[['←', '→'], 'or the mouse, to move the paddle'], [['Space'], 'serve'], [['Esc'], 'pause']],
      filters: { title: 'Breakout wall filters', heading: 'The wall', typed: false },
      side: function (r) {
        return '<div class="panel"><div class="panel__head"><h3>Wall depth</h3></div>' +
          segHtml('rows', ROWS_, pick(ROWS_, String(r.rows), '3')) +
          '<div class="field__hint" style="margin-top:10px">How many rows the first wave starts with. It grows every other wave.</div></div>' +
          stats([[r.best || 0, 'Best score'], [r.runs || 0, 'Games']]);
      },
      wire: function (el, r) { seg(el, '[data-rows]', function (v) { r.rows = +v; }); },
      mount: function (stage, r) {
        return global.GeoBreakout.mount(stage, {
          rows: function () { return +pick(ROWS_, String(r.rows), '3'); },
          cfg: function () { return gameCfg('breakout'); }, onBack: toSetup
        });
      },
      playing: function () { return 'Flags from ' + global.StudyFilters.label(gameCfg('breakout')); }
    },
    {
      id: 'maze', title: 'Capital Maze', art: 'maze',
      blurb: 'A maze crawl where four of the things lying in the corridors are the answers. Drive into the right one while two roamers hunt you.',
      meta: 'Steer · dodge the roamers',
      best: function (r) { return r.best ? 'Best ' + r.best + ' pts' : ''; },
      intro: 'Dots in the corridors are worth a few points each. Four answers are scattered further out: drive into the one the banner asks for. Two roamers chase you the whole time and cost a life on contact, so the pressure is on finding the answer quickly rather than on twitch.',
      keys: [[['←', '↑', '↓', '→'], 'or WASD, or tap a direction'], [['Esc'], 'pause']],
      filters: { title: 'Maze question filters', heading: 'Corridor questions', typed: false },
      side: function (r) {
        return '<div class="panel"><div class="panel__head"><h3>The answers show</h3></div>' +
          segHtml('kind', FOODS, pick(FOODS, r.kind, 'capitals')) + '</div>' +
          stats([[r.best || 0, 'Best score'], [r.runs || 0, 'Games']]);
      },
      wire: function (el, r) { seg(el, '[data-kind]', function (v) { r.kind = v; }); },
      mount: function (stage, r) {
        return global.GeoMaze.mount(stage, {
          kind: function () { return pick(FOODS, r.kind, 'capitals'); },
          cfg: function () { return gameCfg('maze'); }, onBack: toSetup
        });
      },
      playing: function () { return whatKind(pick(FOODS, record('maze').kind, 'capitals')) + ' from ' + global.StudyFilters.label(gameCfg('maze')); }
    },
    {
      id: 'typer', title: 'Capital Typer', art: 'typer',
      blurb: 'Countries fall and you shoot them down by typing their capital. The only game here that asks you to produce the answer rather than recognise it.',
      meta: 'Typing · no multiple choice',
      best: function (r) { return r.best ? 'Best ' + r.best + ' pts' : ''; },
      intro: 'Countries drift down the screen. Type the capital of one and it goes down, and a box lights up as soon as what you have typed could be it. Enter submits, and a wrong guess shows you the answer. Three reaching the bottom ends the run. Spelling is marked the way the rest of the app marks typed answers, so the usual slips are forgiven.',
      keys: [[['A', '–', 'Z'], 'type the capital'], [['Enter'], 'submit'], [['Esc'], 'pause']],
      filters: { title: 'Typer question filters', heading: 'Falling countries', typed: false },
      side: function (r) {
        return '<div class="panel"><div class="panel__head"><h3>How fast they come</h3></div>' +
          segHtml('rate', RATES_, pick(RATES_, r.rate, 'brisk')) + '</div>' +
          stats([[r.best || 0, 'Best score'], [r.runs || 0, 'Games']]);
      },
      wire: function (el, r) { seg(el, '[data-rate]', function (v) { r.rate = v; }); },
      mount: function (stage, r) {
        return global.GeoTyper.mount(stage, {
          rate: function () { return pick(RATES_, r.rate, 'brisk'); },
          cfg: function () { return gameCfg('typer'); }, onBack: toSetup
        });
      },
      playing: function () { return 'Capitals, typed, from ' + global.StudyFilters.label(gameCfg('typer')); }
    },
    {
      id: 'crossing', title: 'Border Crossing', art: 'crossing',
      blurb: 'Frogger with four border gates along the top. Cross five lanes of traffic and go through the gate with the right answer on it.',
      meta: 'Hop the lanes · pick a gate',
      best: function (r) { return r.best ? 'Best ' + r.best + ' pts' : ''; },
      intro: 'Five lanes of traffic between you and four gates. The banner names a country; get across and through the right gate. Picking the wrong gate from the kerb is cheap, but realising halfway across is not, and a car costs a life.',
      keys: [[['←', '↑', '↓', '→'], 'or WASD, to hop'], [['Tap'], 'where you want to go'], [['Esc'], 'pause']],
      filters: { title: 'Gate question filters', heading: 'Gate questions', typed: false },
      side: function (r) {
        return '<div class="panel"><div class="panel__head"><h3>Gates show</h3></div>' +
          segHtml('kind', FOODS, pick(FOODS, r.kind, 'capitals')) + '</div>' +
          stats([[r.best || 0, 'Best score'], [r.runs || 0, 'Games']]);
      },
      wire: function (el, r) { seg(el, '[data-kind]', function (v) { r.kind = v; }); },
      mount: function (stage, r) {
        return global.GeoCrossing.mount(stage, {
          kind: function () { return pick(FOODS, r.kind, 'capitals'); },
          cfg: function () { return gameCfg('crossing'); }, onBack: toSetup
        });
      },
      playing: function () { return whatKind(pick(FOODS, record('crossing').kind, 'capitals')) + ' from ' + global.StudyFilters.label(gameCfg('crossing')); }
    },
    {
      id: 'whack', title: 'Capital Whack', art: 'whack',
      blurb: 'Nine holes, answers popping out of them, and a clock. Whack the right one before it ducks back down.',
      meta: 'Reflex · against the clock',
      best: function (r) { return r.best ? 'Best ' + r.best + ' pts' : ''; },
      intro: 'Answers pop out of nine holes and duck back down on their own. Whack the one the banner asks for, by clicking it or pressing 1 to 9. There are no lives: a wrong one costs you three seconds, and the clock is the whole game.',
      keys: [[['1', '–', '9'], 'whack that hole'], [['Click'], 'or tap a head'], [['Esc'], 'pause']],
      filters: { title: 'Whack question filters', heading: 'What pops up', typed: false },
      side: function (r) {
        return '<div class="panel"><div class="panel__head"><h3>Round length</h3></div>' +
          segHtml('length', LENGTHS, pick(LENGTHS, String(r.length), '90')) + '</div>' +
          stats([[r.best || 0, 'Best score'], [r.runs || 0, 'Games']]);
      },
      wire: function (el, r) { seg(el, '[data-length]', function (v) { r.length = +v; }); },
      mount: function (stage, r) {
        return global.GeoWhack.mount(stage, {
          length: function () { return +pick(LENGTHS, String(r.length), '90'); },
          cfg: function () { return gameCfg('whack'); }, onBack: toSetup
        });
      },
      playing: function () { return 'Capitals and countries from ' + global.StudyFilters.label(gameCfg('whack')); }
    },
    {
      id: 'match', title: 'Flag Match', art: 'match',
      blurb: 'Pairs, played with flags and names. Turn over two tiles: a flag and the country it belongs to stay up, anything else turns back.',
      meta: 'Memory · fewer turns is better',
      best: function (r) { return r.best ? 'Best ' + r.best + ' pts' : ''; },
      intro: 'The pair is always a flag and a name rather than two flags, because turning over two identical pictures teaches nothing. Fewer turns scores more, so it pays to remember where things were. Every pair you find counts as a right answer for that country.',
      keys: [[['Click'], 'or tap a tile to turn it over'], [['Esc'], 'pause']],
      filters: { title: 'Match board filters', heading: 'The board', typed: false },
      side: function (r) {
        return '<div class="panel"><div class="panel__head"><h3>Board size</h3></div>' +
          segHtml('size', SIZES, pick(SIZES, String(r.size), '8')) + '</div>' +
          stats([[r.best || 0, 'Best score'], [r.runs || 0, 'Games']]);
      },
      wire: function (el, r) { seg(el, '[data-size]', function (v) { r.size = +v; }); },
      mount: function (stage, r) {
        return global.GeoMatch.mount(stage, {
          size: function () { return +pick(SIZES, String(r.size), '8'); },
          cfg: function () { return gameCfg('match'); }, onBack: toSetup
        });
      },
      playing: function () { return 'Flags from ' + global.StudyFilters.label(gameCfg('match')); }
    },
    {
      id: 'sort', title: 'Continent Sort', art: 'sort',
      blurb: 'A belt brings countries along and six bins wait underneath. Drop each one into its region before it runs off the end.',
      meta: 'Sorting · six regions',
      best: function (r) { return r.best ? 'Best ' + r.best + ' pts' : ''; },
      intro: 'The only game here that asks about region rather than capitals or flags, which is the thing a map quiz always wants and no other mode drills on its own. Send each one to its bin by clicking it or pressing 1 to 6. A wrong bin costs two seconds; letting one run off the end just loses it.',
      keys: [[['1', '–', '6'], 'drop into that bin'], [['Click'], 'or tap a bin'], [['Esc'], 'pause']],
      filters: { title: 'Sort belt filters', heading: 'On the belt', typed: false },
      side: function (r) {
        return '<div class="panel"><div class="panel__head"><h3>The parcel shows</h3></div>' +
          segHtml('show', SHOWS, pick(SHOWS, r.show, 'name')) +
          '<div class="panel__head" style="margin-top:14px"><h3>Round length</h3></div>' +
          segHtml('length', LENGTHS, pick(LENGTHS, String(r.length), '90')) + '</div>' +
          stats([[r.best || 0, 'Best score'], [r.runs || 0, 'Games']]);
      },
      wire: function (el, r) {
        seg(el, '[data-show]', function (v) { r.show = v; });
        seg(el, '[data-length]', function (v) { r.length = +v; });
      },
      mount: function (stage, r) {
        return global.GeoSort.mount(stage, {
          show: function () { return pick(SHOWS, r.show, 'name'); },
          length: function () { return +pick(LENGTHS, String(r.length), '90'); },
          cfg: function () { return gameCfg('sort'); }, onBack: toSetup
        });
      },
      playing: function () { return 'Regions from ' + global.StudyFilters.label(gameCfg('sort')); }
    },
    {
      id: 'stack', title: 'Capital Stack', art: 'stack',
      blurb: 'Four columns, each headed by a country. A capital falls; slide it under the country it belongs to before it lands.',
      meta: 'Falling blocks · four columns',
      best: function (r) { return r.best ? 'Best ' + r.best + ' pts' : ''; },
      intro: 'A wrong drop does not end anything: the block stays where it fell and that column grows. A right one clears the column and brings in a new country. The game ends when a column reaches the headers, so mistakes cost you room rather than a life.',
      keys: [[['←', '→'], 'or A / D, to slide'], [['Space'], 'drop it now'], [['1', '–', '4'], 'send it to that column'], [['Esc'], 'pause']],
      filters: { title: 'Stack question filters', heading: 'The columns', typed: false },
      side: function (r) {
        return '<div class="panel"><div class="panel__head"><h3>Speed</h3></div>' +
          segHtml('speed', SPEEDS, pick(SPEEDS, r.speed, 'normal')) + '</div>' +
          stats([[r.best || 0, 'Best score'], [r.runs || 0, 'Games']]);
      },
      wire: function (el, r) { seg(el, '[data-speed]', function (v) { r.speed = v; }); },
      mount: function (stage, r) {
        return global.GeoStack.mount(stage, {
          speed: function () { return pick(SPEEDS, r.speed, 'normal'); },
          cfg: function () { return gameCfg('stack'); }, onBack: toSetup
        });
      },
      playing: function () { return 'Capitals from ' + global.StudyFilters.label(gameCfg('stack')); }
    },
    {
      id: 'echo', title: 'Flag Echo', art: 'echo',
      blurb: 'Simon, played with flags. The board lights a sequence and you play it back, one longer every round.',
      meta: 'Memory · one longer each round',
      best: function (r) { return r.longest ? 'Longest ' + r.longest : ''; },
      intro: 'The board lights a sequence of flags and you play it back in order. Each round adds one, and the flag that joins is named as it lights, so the name goes in with the picture. Playing a sequence back right counts as a right answer for every country in it, which is what makes a long chain worth chasing.',
      keys: [[['1', '–', '9'], 'press that flag'], [['Click'], 'or tap a flag'], [['Esc'], 'pause']],
      filters: { title: 'Echo board filters', heading: 'The board', typed: false },
      side: function (r) {
        return '<div class="panel"><div class="panel__head"><h3>Flags on the board</h3></div>' +
          segHtml('pads', PADS, pick(PADS, String(r.pads), '6')) +
          '<div class="field__hint" style="margin-top:10px">More flags make a longer sequence harder to hold.</div></div>' +
          stats([[r.longest || 0, 'Longest echo'], [r.best || 0, 'Best score'], [r.runs || 0, 'Games']]);
      },
      wire: function (el, r) { seg(el, '[data-pads]', function (v) { r.pads = +v; }); },
      mount: function (stage, r) {
        return global.GeoEcho.mount(stage, {
          pads: function () { return +pick(PADS, String(r.pads), '6'); },
          cfg: function () { return gameCfg('echo'); }, onBack: toSetup
        });
      },
      playing: function () { return 'Flags from ' + global.StudyFilters.label(gameCfg('echo')); }
    }
  ];

  /* Said in the playing line of half the games. */
  function whatKind(k) {
    return k === 'flags' ? 'Flags' : k === 'mix' ? 'Flags and capitals' : 'Capitals';
  }

  function parToText(n) { return n === 0 ? 'E' : n > 0 ? '+' + n : '−' + Math.abs(n); }

  function pick(list, v, fallback) {
    return list.some(function (o) { return o[0] === v; }) ? v : fallback;
  }

  function segHtml(name, list, active) {
    return '<div class="seg game-seg" data-' + name + '>' +
      list.map(function (o) {
        return '<button data-v="' + o[0] + '" class="' + (o[0] === active ? 'is-active' : '') + '">' + o[1] + '</button>';
      }).join('') +
    '</div>';
  }

  var screen = 'hub';
  var current = null;       /* the game whose setup or stage is showing */
  var game = null;          /* the running game, if any */

  function host() { return document.getElementById('view-games'); }

  function record(id) {
    var g = W.state.games || (W.state.games = {});
    return g[id] || (g[id] = {});
  }

  function kind_(r) { return pick(KINDS, r.kind, 'flags'); }

  /* Games ask with the same filters as Learn. The first time, each one
     starts from whatever Learn is set to. */
  function gameCfg(id) {
    var r = record(id);
    if (!r.cfg) {
      var L = global.LearnMode && global.LearnMode.config;
      r.cfg = {
        regions: L ? L.regions.slice() : [], scope: L ? L.scope : 'all',
        countries: L && L.countries ? L.countries.slice() : null,
        typed: L ? !!L.typed : false, weakFirst: L ? L.weakFirst !== false : true
      };
    }
    return r.cfg;
  }

  function byId(id) {
    return GAMES.filter(function (g) { return g.id === id; })[0] || GAMES[0];
  }

  function start() {
    /* ask who is blocked, then redraw if the answer changed anything */
    if (global.GameBlocks && !start.watching) {
      start.watching = true;
      global.GameBlocks.onChange(function () {
        if (screen === 'hub') renderHub();
        else if (screen === 'setup' && isBlocked(current)) renderSetup();
      });
    }
    if (global.GameBlocks) global.GameBlocks.load();
    if (screen === 'play') screen = 'setup';
    stop();
    if (screen === 'setup') renderSetup(); else renderHub();
  }

  function stop() {
    if (game) { game.destroy(); game = null; }
    if (global.GameBoards) global.GameBoards.touch();
  }

  function playing() { return screen === 'play' && !!game; }

  /* The canvas is gone once stop() runs, so a history return cannot resume
     the run. Callers that are about to leave ask first, then abandon. */
  function abandon() {
    if (screen === 'play') screen = 'hub';
    stop();
  }

  function toSetup() { screen = 'setup'; renderSetup(); }

  function stats(items) {
    return '<div class="panel dash-best">' + items.map(function (s) {
      return '<div><b class="mono">' + esc(String(s[0])) + '</b><span>' + esc(s[1]) + '</span></div>';
    }).join('') + '</div>';
  }

  function seg(el, sel, set) {
    var buttons = W.$$(sel + ' button', el);
    buttons.forEach(function (b) {
      b.addEventListener('click', function () {
        set(b.dataset.v);
        W.save();
        buttons.forEach(function (x) { x.classList.toggle('is-active', x === b); });
      });
    });
  }

  /* ------------------------------ hub ------------------------------- */
  /* ------------------------------ hub -------------------------------
     The hub is drawn as an arcade cabinet: a lit marquee, a CRT holding
     the game list, and a control deck underneath.

     The cabinet is decoration and says so. The marquee carries the real
     <h1>, and everything else of it — bulbs, joystick, buttons, coin
     slot — is aria-hidden, so what a screen reader walks is the heading
     and then a plain list of buttons. The buttons are the same
     .game-card markup the landing page uses, restyled by arcade.css
     rather than rebuilt, which is also what keeps Games.art() honest
     for the landing section.

     The arrow keys move focus between the cards, because a cabinet you
     cannot drive with a stick is a poster. Enter and Space are the
     buttons' own, so they need no wiring. */
  function renderHub() {
    stop();
    screen = 'hub';
    var el = host();
    if (!el) return;

    var hi = 0;
    GAMES.forEach(function (g) { hi = Math.max(hi, record(g.id).best || 0); });

    var bulbs = '';
    for (var b = 0; b < 16; b++) bulbs += '<i></i>';

    el.innerHTML =
      '<div class="portal__inner games arcade">' +
        '<div class="cab">' +

          '<div class="cab__marquee">' +
            '<h1 class="cab__title">LearnGeo <em>Arcade</em></h1>' +
            '<div class="cab__sub">' + GAMES.length + ' games · everything you answer counts</div>' +
            '<div class="cab__bulbs" aria-hidden="true">' + bulbs + '</div>' +
          '</div>' +

          '<div class="cab__screen">' +
            '<div class="cab__crt">' +
              '<div class="cab__row">' +
                '<span class="cab__blink">\u25B6 Select game</span>' +
                '<button class="btn btn--ghost btn--sm cab__boards" data-boards type="button">' + I.trophy + ' Leaderboards</button>' +
                '<b>Hi ' + hi.toLocaleString() + '</b>' +
              '</div>' +
              '<div class="games__grid">' +
                GAMES.map(card).join('') +
              '</div>' +
              '<div class="cab__row" style="margin:16px 0 0">' +
                '<span>Mastery · XP · gems, same as the study modes</span>' +
                '<b>' + W.masteredCount() + ' / ' + global.GeoData.counts.total + ' mastered</b>' +
              '</div>' +
            '</div>' +
          '</div>' +

          '<div class="cab__deck" aria-hidden="true">' +
            '<div class="cab__stick"><i></i><b></b></div>' +
            '<div class="cab__buttons"><span></span><span></span><span></span></div>' +
            '<div class="cab__hint">' +
              '<kbd>\u2190</kbd> <kbd>\u2192</kbd> to choose · <kbd>Enter</kbd> to play' +
            '</div>' +
          '</div>' +
          '<div class="cab__slot" aria-hidden="true"></div>' +

        '</div>' +
      '</div>';

    W.$('[data-boards]', el).addEventListener('click', function () {
      if (global.GameBoards) global.GameBoards.open(current);
    });

    var cards = W.$$('[data-game]', el);
    cards.forEach(function (btn, i) {
      btn.addEventListener('click', function () {
        if (isBlocked(btn.dataset.game)) { blockedToast(); return; }
        current = btn.dataset.game; toSetup();
      });
      btn.addEventListener('focus', function () {
        cards.forEach(function (o) { o.classList.toggle('is-picked', o === btn); });
      });
      btn.addEventListener('keydown', function (e) {
        var step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1
                 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
        if (!step) return;
        e.preventDefault();
        cards[(i + step + cards.length) % cards.length].focus();
      });
    });
  }

  function isBlocked(id) { return !!(global.GameBlocks && global.GameBlocks.blocked(id)); }

  function card(g) {
    var best = g.best(record(g.id));
    var off = isBlocked(g.id);
    return '<button class="game-card' + (off ? ' is-blocked' : '') + '" data-game="' + g.id + '" type="button"' +
      (off ? ' aria-disabled="true"' : '') + '>' +
      '<div class="game-card__art game-art--' + g.art + '" aria-hidden="true">' + art(g.art) + '</div>' +
      '<div class="game-card__body">' +
        '<h3>' + esc(g.title) + '</h3>' +
        '<p>' + esc(g.blurb) + '</p>' +
        '<div class="game-card__foot"><span>' + esc(g.meta) + '</span>' +
          (best ? '<span class="game-card__best">' + esc(best) + '</span>' : '') +
          (off ? '<span class="game-card__go">' + I.lock + ' Blocked by your teacher</span>'
               : '<span class="game-card__go">Play ' + I.arrowR + '</span>') + '</div>' +
      '</div>' +
    '</button>';
  }

  function art(kind) {
    if (kind === 'chess') {
      return '<span class="chess-art__board"></span><span class="chess-art__piece">♞</span><span class="chess-art__caption">Your next move starts here</span>';
    }
    if (kind === 'dash') {
      return '<span class="ga-cube"></span><span class="ga-spike" style="left:58%"></span>' +
        '<span class="ga-spike" style="left:66%"></span><span class="ga-block"></span>' +
        '<span class="ga-gate">?</span><span class="ga-floor"></span>';
    }
    if (kind === 'orbit') {
      return '<span class="go-art__orbit"></span><span class="go-art__globe"></span>' +
        '<span class="go-art__ship"></span><span class="go-art__shot"></span>' +
        '<span class="go-art__rock" style="left:14%;top:22%"></span>' +
        '<span class="go-art__rock go-art__rock--big" style="left:80%;top:62%"></span>' +
        '<span class="go-art__sat" style="left:72%;top:14%"><i></i></span>';
    }
    if (kind === 'snake') {
      var body = [[14, 68], [22, 68], [30, 68], [38, 68], [38, 52], [46, 52], [54, 52]];
      return body.map(function (p) {
        return '<span class="sn-art__seg" style="left:' + p[0] + '%;top:' + p[1] + '%"></span>';
      }).join('') +
        '<span class="sn-art__seg sn-art__head" style="left:62%;top:52%"></span>' +
        '<span class="sn-art__food" style="left:78%;top:52%"></span><span class="sn-art__pill" style="left:78%;top:30%">Nairobi</span>' +
        '<span class="sn-art__food" style="left:22%;top:24%"></span><span class="sn-art__pill" style="left:22%;top:4%">Kampala</span>';
    }
    if (kind === 'golf') {
      return '<span class="gg-art__land gg-art__land--a"></span><span class="gg-art__land gg-art__land--b"></span>' +
        '<span class="gg-art__trail"></span><span class="gg-art__ball"></span>' +
        '<span class="gg-art__pin"></span><span class="gg-art__pill">Putt to Kenya</span>';
    }
    if (kind === 'invaders') {
      var pods = [[14, 18], [38, 14], [62, 18], [84, 14]];
      return pods.map(function (p) {
        return '<span class="gi-art__pod" style="left:' + p[0] + '%;top:' + p[1] + '%"></span>';
      }).join('') +
        '<span class="gi-art__shot"></span><span class="gi-art__ship"></span>';
    }
    if (kind === 'breakout') {
      var cols = ['#D7262B', '#1B4DFF', '#0E9F6E', '#F5B301', '#8B5CF6', '#22D3EE'];
      var out = '';
      for (var r = 0; r < 3; r++) {
        for (var c = 0; c < 6; c++) {
          out += '<span class="gb-art__brick" style="left:' + (6 + c * 15) + '%;top:' +
            (14 + r * 17) + '%;background:' + cols[(r + c) % cols.length] + '"></span>';
        }
      }
      return out + '<span class="gb-art__ball"></span><span class="gb-art__pad"></span>';
    }
    if (kind === 'maze') {
      var walls = [[0, 0, 100, 8], [0, 92, 100, 8], [0, 0, 4, 100], [96, 0, 4, 100],
                   [18, 24, 22, 9], [60, 24, 22, 9], [18, 58, 22, 9], [60, 58, 22, 9]];
      var m = walls.map(function (w) {
        return '<span class="gm-art__wall" style="left:' + w[0] + '%;top:' + w[1] +
          '%;width:' + w[2] + '%;height:' + w[3] + '%"></span>';
      }).join('');
      for (var d = 0; d < 7; d++) {
        m += '<span class="gm-art__dot" style="left:' + (12 + d * 11) + '%;top:45%"></span>';
      }
      return m + '<span class="gm-art__me" style="left:10%;top:41%"></span>' +
        '<span class="gm-art__ghost" style="left:74%;top:41%"></span>' +
        '<span class="gm-art__pill" style="left:34%;top:74%">Nairobi</span>';
    }
    if (kind === 'typer') {
      return '<span class="gt-art__word" style="left:10%;top:16%">Peru</span>' +
        '<span class="gt-art__word gt-art__word--lit" style="left:46%;top:40%">Norway</span>' +
        '<span class="gt-art__bar">oslo&#9612;</span>';
    }
    if (kind === 'crossing') {
      var lanes = '';
      for (var l = 0; l < 3; l++) {
        lanes += '<span class="gc-art__lane" style="top:' + (44 + l * 18) + '%"></span>';
      }
      return lanes +
        '<span class="gc-art__gate" style="left:4%;width:28%">Lima</span>' +
        '<span class="gc-art__gate" style="left:36%;width:28%">Quito</span>' +
        '<span class="gc-art__gate" style="left:68%;width:28%">La Paz</span>' +
        '<span class="gc-art__car" style="left:12%;top:46%;width:22%;background:#FF9A3D"></span>' +
        '<span class="gc-art__car" style="left:58%;top:64%;width:26%;background:#C38BFF"></span>' +
        '<span class="gc-art__me"></span>';
    }
    if (kind === 'whack') {
      var w = '';
      [[18, 30], [50, 30], [82, 30], [18, 62], [50, 62], [82, 62]].forEach(function (h, i) {
        w += '<span class="gw-art__hole" style="left:' + h[0] + '%;top:' + h[1] +
          '%;margin-left:-17px"></span>';
        if (i === 1 || i === 3) {
          w += '<span class="gw-art__head" style="left:' + h[0] + '%;top:' + (h[1] - 14) +
            '%;margin-left:-19px">' + (i === 1 ? 'Oslo' : 'Lima') + '</span>';
        }
      });
      return w + '<span class="gw-art__mallet" style="left:56%;top:22%"></span>';
    }
    if (kind === 'match') {
      var t = '';
      var faces = ['?', '?', 'up', 'done', '?', 'done'];
      faces.forEach(function (f, i) {
        var col = i % 3, row = Math.floor(i / 3);
        var cls = f === 'up' ? ' gmt-art__tile--up' : f === 'done' ? ' gmt-art__tile--done' : '';
        var inner = f === '?' ? '?' : '<i style="background:' +
          (f === 'up' ? 'linear-gradient(90deg,#D7262B 33%,#fff 33% 66%,#D7262B 66%)'
                      : 'linear-gradient(#D7262B 50%,#fff 50%)') + '"></i>';
        t += '<span class="gmt-art__tile' + cls + '" style="left:' + (14 + col * 26) +
          '%;top:' + (24 + row * 34) + '%">' + inner + '</span>';
      });
      return t;
    }
    if (kind === 'sort') {
      var bins = [['#FF9A3D', 'Africa'], ['#FFD23F', 'Asia'], ['#7CF3FF', 'Europe'],
                  ['#8CF5C2', 'N. Am'], ['#C38BFF', 'S. Am']];
      var b = '<span class="gs-art__belt"></span><span class="gs-art__parcel">Kenya</span>';
      bins.forEach(function (x, i) {
        b += '<span class="gs-art__bin" style="left:' + (2 + i * 19.6) + '%;width:18%;color:' +
          x[0] + ';border-color:' + x[0] + '">' + x[1] + '</span>';
      });
      return b;
    }
    if (kind === 'stack') {
      var heads = ['Chile', 'Nepal', 'Mali', 'Fiji'];
      var k = heads.map(function (h, i) {
        return '<span class="gst-art__head" style="left:' + (2 + i * 24.5) + '%;width:23%">' + h + '</span>';
      }).join('');
      k += '<span class="gst-art__block gst-art__block--fall" style="left:26.5%;width:23%;top:46%">Kathmandu</span>';
      k += '<span class="gst-art__block gst-art__block--bad" style="left:51%;width:23%;bottom:12px">Suva</span>';
      return k + '<span class="gst-art__floor"></span>';
    }
    if (kind === 'echo') {
      var flagsArt = [
        'linear-gradient(#D7262B 50%,#fff 50%)',
        'linear-gradient(90deg,#0E9F6E 33%,#fff 33% 66%,#D7262B 66%)',
        'linear-gradient(#1B4DFF 33%,#F5B301 33% 66%,#0E9F6E 66%)',
        'linear-gradient(90deg,#1B4DFF 50%,#D7262B 50%)',
        'linear-gradient(#111 33%,#D7262B 33% 66%,#F5B301 66%)',
        'linear-gradient(90deg,#8B5CF6 50%,#22D3EE 50%)'
      ];
      return flagsArt.map(function (f, i) {
        var col = i % 3, row = Math.floor(i / 3);
        var lit = i === 1 ? ' ge-art__pad--lit' : '';
        return '<span class="ge-art__pad' + lit + '" style="left:' + (14 + col * 26) +
          '%;top:' + (22 + row * 36) + '%"><i style="background:' + f + '"></i></span>';
      }).join('');
    }
    return '';
  }

  /* ----------------------------- setup ------------------------------ */
  function blockedToast() {
    W.toast('Blocked by your teacher', 'Ask them if you would like it turned back on.', I.lock, 4200);
  }

  function renderSetup() {
    stop();
    var el = host();
    if (!el) return;
    var g = byId(current);
    current = g.id;
    if (isBlocked(g.id)) { blockedToast(); renderHub(); return; }
    var r = record(g.id);
    var cfg = gameCfg(g.id);

    el.innerHTML =
      '<div class="portal__inner games">' +
        '<button class="games__back" data-hub>' + I.arrowL + ' All games</button>' +
        '<div class="dash-setup">' +
          '<div class="dash-setup__main">' +
            '<div class="game-card__art game-art--' + g.art + ' dash-setup__art" aria-hidden="true">' + art(g.art) + '</div>' +
            '<h1>' + esc(g.title) + '</h1>' +
            '<p>' + esc(g.intro) + '</p>' +
            '<div class="dash-keys">' +
              g.keys.map(function (k) {
                return '<div>' + k[0].map(function (x) { return '<kbd>' + esc(x) + '</kbd>'; }).join('') +
                  '<span>' + esc(k[1]) + '</span></div>';
              }).join('') +
            '</div>' +
            '<div class="dash-setup__go">' +
              '<button class="btn btn--accent btn--lg" data-play>' + I.play + ' Play</button>' +
              '<button class="btn btn--ghost btn--lg" data-board type="button">' + I.trophy + ' Leaderboard</button>' +
            '</div>' +
          '</div>' +
          '<div class="dash-setup__side">' +
            '<div class="panel">' +
              '<div class="panel__head"><h3>' + esc(g.filters.heading) + '</h3>' +
                '<button class="btn btn--ghost btn--sm" data-filters>Filters</button></div>' +
              '<div class="dash-cfg">' +
                '<div><span>Countries</span><b>' + esc(global.StudyFilters.label(cfg)) + '</b></div>' +
                (g.filters.typed
                  ? '<div><span>Answer</span><b>' + (cfg.typed ? (g.id === 'chess' ? 'Type the answer' : 'Type the capital') : 'Multiple choice') + '</b></div>'
                  : '') +
                '<div><span>Order</span><b>' + (cfg.weakFirst ? 'Weakest first' : 'Random') + '</b></div>' +
              '</div>' +
              '<div class="field__hint" style="margin-top:10px">The same filters as Learn: regions, UN members, or the countries you pick.</div>' +
            '</div>' +
            g.side(r) +
          '</div>' +
        '</div>' +
      '</div>';

    W.$('[data-hub]', el).addEventListener('click', renderHub);
    W.$('[data-play]', el).addEventListener('click', play);
    W.$('[data-board]', el).addEventListener('click', function () {
      if (global.GameBoards) global.GameBoards.open(g.id);
    });
    W.$('[data-filters]', el).addEventListener('click', function () {
      global.StudyFilters.open({
        cfg: cfg, title: g.filters.title, types: false, mapChoices: false, answerStyle: g.filters.typed,
        onApply: function (f) {
          r.cfg = { regions: f.regions, scope: f.scope, countries: f.countries, typed: f.typed, weakFirst: f.weakFirst };
          W.save();
          renderSetup();
        }
      });
    });
    g.wire(el, r);
  }

  /* ------------------------------ play ------------------------------ */
  function play() {
    stop();
    screen = 'play';
    var el = host();
    var g = byId(current);
    var r = record(g.id);
    el.innerHTML =
      '<div class="portal__inner games games--play">' +
        '<div class="games__playbar">' +
          '<button class="games__back" data-setup>' + I.arrowL + ' ' + esc(g.title) + '</button>' +
          '<span class="t-sm t-muted">' + esc(g.playing()) + '</span>' +
        '</div>' +
        '<div class="games__stage" id="games-stage"></div>' +
      '</div>';
    W.$('[data-setup]', el).addEventListener('click', toSetup);
    game = g.mount(W.$('#games-stage', el), r);
  }

  /* Read-only, for anything outside the arcade that wants to show the
     games — the landing page renders its cards from these, so a title
     or a drawing changed here shows up there without being retyped.
     Copies, so nothing out there can reach into GAMES. */
  function catalogue() {
    return GAMES.map(function (g) {
      return { id: g.id, title: g.title, blurb: g.blurb, meta: g.meta, art: g.art };
    });
  }

  global.Games = {
    start: start, stop: stop, catalogue: catalogue, art: art,
    playing: playing, abandon: abandon,
    get current() { return game; },
    get game() { return current; },
    get screen() { return screen; }
  };
})(window);
