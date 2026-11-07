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
  var LEVELS = [
    ['1', 'Level 1 difficulty'], ['2', 'Level 2 difficulty'], ['3', 'Level 3 difficulty'],
    ['4', 'Level 4 difficulty'], ['5', 'Level 5 difficulty'], ['6', 'Level 6 difficulty'],
    ['7', 'Level 7 difficulty']
  ];
  /* Named rungs for the shared DifficultySlider (values 1–7). Levels 1–5 keep
     the hardened LEA-35 levers; 6–7 add ~3200 and Engine Max. */
  var CHESS_DIFF = [
    { value: 1, name: 'Beginner', blurb: 'Plays random legal moves' },
    { value: 2, name: 'Easy', blurb: 'Fewer random slips; light Stockfish pressure' },
    { value: 3, name: 'Intermediate', blurb: 'A sharp Stockfish opponent' },
    { value: 4, name: 'Advanced', blurb: 'Deep search and high skill' },
    { value: 5, name: 'Expert', blurb: 'Full-strength Stockfish on your device' },
    { value: 6, name: 'Grandmaster', blurb: 'Near Stockfish’s rated ceiling (~3200)' },
    { value: 7, name: 'Engine Max', blurb: 'Deepest on-device search this lite engine allows' }
  ];
  var CHESS_DIFF_HINT = 'Level 1 plays random legal moves. Level 2 mixes occasional random moves with Stockfish. Levels 3–5 use increasingly strong Stockfish opponents. Grandmaster is near the ~3200 rated ceiling; Engine Max goes deeper still. Wins at higher levels score more points.';
  var CHESS_OPP = [['bot', 'Vs bot'], ['pvp', 'Challenge a friend']];
  function chessOpponent(r) {
    return (r && r.opponent === 'pvp') ? 'pvp' : 'bot';
  }
  var RATE_DIFF = [
    { value: 'calm', name: 'Calm', blurb: 'Countries drift down slowly' },
    { value: 'brisk', name: 'Brisk', blurb: 'A steady fall pace' },
    { value: 'frantic', name: 'Frantic', blurb: 'Countries rain down fast' }
  ];
  var SPEED_DIFF = [
    { value: 'relaxed', name: 'Relaxed', blurb: 'A slower game tempo' },
    { value: 'normal', name: 'Normal', blurb: 'The standard pace' },
    { value: 'fast', name: 'Fast', blurb: 'A quicker game tempo' }
  ];
  var ROWS_DIFF = [
    { value: '2', name: '2 rows', blurb: 'A shallow first wall' },
    { value: '3', name: '3 rows', blurb: 'A medium first wall' },
    { value: '4', name: '4 rows', blurb: 'A deep first wall' }
  ];
  var SIZE_DIFF = [
    { value: '6', name: '6 pairs', blurb: 'A small memory board' },
    { value: '8', name: '8 pairs', blurb: 'A standard memory board' },
    { value: '10', name: '10 pairs', blurb: 'A large memory board' }
  ];
  var PADS_DIFF = [
    { value: '4', name: '4 flags', blurb: 'A short sequence board' },
    { value: '6', name: '6 flags', blurb: 'A standard sequence board' },
    { value: '8', name: '8 flags', blurb: 'A wide sequence board' }
  ];
  var LENGTH_DIFF = [
    { value: '60', name: '60s', blurb: 'A short round' },
    { value: '90', name: '90s', blurb: 'A standard round' },
    { value: '120', name: '120s', blurb: 'A long round' }
  ];
  var EVERY_DIFF = [
    { value: 10, name: 'Every 10s', blurb: 'Capital gates come often' },
    { value: 20, name: 'Every 20s', blurb: 'A regular capital gate' },
    { value: 30, name: 'Every 30s', blurb: 'Gates are less frequent' },
    { value: 45, name: 'Every 45s', blurb: 'Gates are rare' }
  ];
  /* Geo Dash tracks for the shared DifficultySlider. Prefer live GeoDash.maps
     so any tracks added there show up without retyping the list here. */
  var MAP_DIFF_FALLBACK = [
    { value: 'classic', name: 'Classic Ridge', blurb: 'The original mixed track of spikes, blocks, pads and rings.' },
    { value: 'andes', name: 'Andes Ascent', blurb: 'Stacked mountain stairs — climb the blocks, watch the edges.' },
    { value: 'sahara', name: 'Sahara Sprint', blurb: 'Open desert runs of spikes with pads to clear the dunes.' },
    { value: 'isles', name: 'Pacific Isles', blurb: 'Island hops — pads and mid-air rings between short platforms.' }
  ];
  function dashMapLevels() {
    if (global.GeoDash && global.GeoDash.maps && global.GeoDash.maps.length) {
      return global.GeoDash.maps.map(function (m) {
        return { value: m.id, name: m.name, blurb: m.blurb || '' };
      });
    }
    return MAP_DIFF_FALLBACK;
  }
  function dashMapId(r) {
    var levels = dashMapLevels();
    var id = r && r.map;
    for (var i = 0; i < levels.length; i++) if (levels[i].value === id) return id;
    return levels[0].value;
  }
  var HOLES_DIFF = [
    { value: '6', name: '6 holes', blurb: 'A short course' },
    { value: '9', name: '9 holes', blurb: 'A half-round course' },
    { value: '18', name: '18 holes', blurb: 'A full course' }
  ];
  /* the ten added alongside the first five */
  var ROWS_ = [['2', '2 rows'], ['3', '3 rows'], ['4', '4 rows']];
  var RATES_ = [['calm', 'Calm'], ['brisk', 'Brisk'], ['frantic', 'Frantic']];
  var LENGTHS = [['60', '60s'], ['90', '90s'], ['120', '120s']];
  var SIZES = [['6', '6 pairs'], ['8', '8 pairs'], ['10', '10 pairs']];
  var SHOWS = [['name', 'Country'], ['flag', 'Flag'], ['capital', 'Capital']];
  var PADS = [['4', '4 flags'], ['6', '6 flags'], ['8', '8 flags']];

  function sliderHtml(opts, fallbackName, fallbackList, active) {
    if (global.DifficultySlider) return global.DifficultySlider.html(opts);
    return '<div class="panel__head"><h3>' + esc(opts.label || 'Difficulty') + '</h3></div>' +
      segHtml(fallbackName, fallbackList, active);
  }

  function wireSlider(el, opts, fallbackSel, set) {
    if (global.DifficultySlider) {
      global.DifficultySlider.wire(el, {
        name: opts.name,
        levels: opts.levels,
        commitOnly: !!opts.commitOnly,
        onChange: function (v) { set(v); W.save(); }
      });
    } else {
      seg(el, fallbackSel, set);
    }
  }

  var GAMES = [
    {
      id: 'duel', title: 'Geo Duel', art: 'duel',
      blurb: 'Challenge a friend by gamertag. They get an invite, you both race the same geography questions, and the faster correct answer wins each round.',
      meta: 'PvP · invite by gamertag · five rounds',
      playLabel: 'Open duel lobby',
      best: function (r) {
        if (r.wins) return r.wins + (r.wins === 1 ? ' win' : ' wins');
        return r.runs ? r.runs + (r.runs === 1 ? ' match' : ' matches') : '';
      },
      intro: 'Look up a friend’s gamertag and send an invite. When they accept, you both get the same five flag and capital questions. ' +
        'Answer correctly and faster than they do to take the round. First to the better score after five rounds wins. ' +
        'A great way to pull friends from other schools into LearnGeo.',
      keys: [
        [['Gamertag'], 'look up a friend and send an invite'],
        [['A', 'B', 'C', 'D'], 'or tap an answer in a live match'],
        [['Forfeit'], 'leave a live match from the foot bar']
      ],
      filters: { title: 'Duel question filters', heading: 'Questions (host deals these)', typed: false },
      side: function (r) {
        var box = global.GeoDuel && global.GeoDuel.inbox ? global.GeoDuel.inbox() : { incoming: [], outgoing: [] };
        var pending = (box.incoming || []).length;
        return '<div class="panel">' +
            '<div class="panel__head"><h3>Question mix</h3></div>' +
            segHtml('kind', KINDS, kind_(r)) +
            '<div class="field__hint" style="margin-top:10px">The host’s mix is used when the match starts. Guest plays the same set.</div>' +
          '</div>' +
          '<div class="panel">' +
            '<div class="panel__head"><h3>How invites work</h3></div>' +
            '<p class="t-sm t-muted" style="margin:0">Your friend needs a gamertag (any Games leaderboard claim works). They see a pending invite in Geo Duel and can accept or decline.</p>' +
            (pending
              ? '<p class="t-sm" style="margin:10px 0 0"><b>' + pending + ' pending invite' + (pending === 1 ? '' : 's') + '</b> waiting in the lobby.</p>'
              : '') +
          '</div>' +
          stats([[r.wins || 0, 'Wins'], [r.runs || 0, 'Matches']]);
      },
      wire: function (el, r) {
        seg(el, '[data-kind]', function (v) { r.kind = v; });
        if (global.GeoDuel && global.GeoDuel.fetchInbox) global.GeoDuel.fetchInbox();
      },
      mount: function (stage, r) {
        return global.GeoDuel.mount(stage, {
          kind: kind_(r),
          cfg: function () { return gameCfg('duel'); },
          onBack: toSetup,
          autoResume: true
        });
      },
      playing: function () {
        return 'PvP duel · ' + whatKind(kind_(record('duel'))) + ' from ' + global.StudyFilters.label(gameCfg('duel'));
      }
    },
    {
      /* LEA-61/62: Geo Chess stays free (not in premium_game_ids).
         LEA-68: PvP (invite by gamertag) lives inside Geo Chess — no
         separate Chess Duel hub entry. Backend RPCs stay chess_duel_*. */
      id: 'chess', title: 'Geo Chess', art: 'chess',
      blurb: 'Play bots from Beginner to Engine Max, or challenge a classmate by gamertag. Geography questions unlock bot moves. Every rated game updates your Chess Elo.',
      meta: 'Chess Elo · bots + play other players',
      playLabel: function (r) {
        return chessOpponent(r) === 'pvp' ? 'Open lobby' : 'Play';
      },
      best: function (r) {
        var elo = global.ChessElo ? global.ChessElo.ensure(r) : (typeof r.elo === 'number' ? r.elo : 0);
        return elo ? elo + ' Elo' : '';
      },
      intro: 'Choose Vs bot or Challenge a friend. Against the computer you play White and answer a study-set question before each move — wrong answers show the key and deal another question. Choose a piece, then a highlighted square. Castling, en passant, promotion, check, checkmate, stalemate, threefold repetition and the fifty-move rule follow standard chess. Known openings appear after the first few moves. Against a friend, invite by gamertag (same inbox flow as Geo Duel); the challenger is White. Every finished rated game updates your Chess Elo (starts at 1000; prior wins convert into a starting rating).',
      keys: function (r) {
        if (chessOpponent(r) === 'pvp') {
          return [
            [['Gamertag'], 'look up a friend and send an invite'],
            [['Click / tap'], 'your piece, then a highlighted square'],
            [['Resign'], 'leave a live match from the foot bar']
          ];
        }
        return [
          [['Click / tap'], 'a piece, then its destination'],
          [['Arrow keys'], 'explore the board; Enter or Space selects a square']
        ];
      },
      filters: function (r) {
        if (chessOpponent(r) === 'pvp') return false;
        return { title: 'Chess question filters', heading: 'Move questions', typed: true };
      },
      side: function (r) {
        var elo = global.ChessElo ? global.ChessElo.ensure(r) : (typeof r.elo === 'number' ? r.elo : 1000);
        var opp = chessOpponent(r);
        var mode = '<div class="panel"><div class="panel__head"><h3>Opponent</h3></div>' +
          segHtml('opponent', CHESS_OPP, opp) + '</div>';
        if (opp === 'pvp') {
          var box = global.ChessDuel && global.ChessDuel.inbox ? global.ChessDuel.inbox() : { incoming: [], outgoing: [] };
          var pending = (box.incoming || []).length;
          var duel = record('chessduel');
          return mode +
            '<div class="panel">' +
              '<div class="panel__head"><h3>How invites work</h3></div>' +
              '<p class="t-sm t-muted" style="margin:0">Your friend needs a gamertag (any Games leaderboard claim works). They see the invite in Friend inbox (Achievements) and here in Geo Chess. Wins and losses change your Chess Elo.</p>' +
              (pending
                ? '<p class="t-sm" style="margin:10px 0 0"><b>' + pending + ' pending invite' + (pending === 1 ? '' : 's') + '</b> waiting in the lobby.</p>'
                : '') +
            '</div>' +
            stats([[elo, 'Chess Elo'], [(r.wins || 0) + (duel.wins || 0), 'Wins'],
              [(r.draws || 0) + (duel.draws || 0), 'Draws'],
              [(r.completed || 0) + (duel.runs || 0), 'Finished games']]);
        }
        var level = +pick(LEVELS, String(r.level), '1');
        var slider = global.DifficultySlider
          ? global.DifficultySlider.html({
              name: 'level',
              value: level,
              levels: CHESS_DIFF,
              ends: ['Beginner', 'Engine Max'],
              hint: CHESS_DIFF_HINT
            })
          : segHtml('level', LEVELS, String(level));
        return mode +
          '<div class="panel">' + slider + '</div>' +
          '<div class="panel"><div class="panel__head"><h3>Questions</h3></div>' +
          segHtml('kind', KINDS, kind_(r)) + '</div>' +
          stats([[elo, 'Chess Elo'], [r.wins || 0, 'Wins'], [r.draws || 0, 'Draws'], [r.completed || 0, 'Finished games']]);
      },
      wire: function (el, r) {
        if (global.ChessElo && global.ChessElo.pull) global.ChessElo.pull();
        seg(el, '[data-opponent]', function (v) {
          r.opponent = v === 'pvp' ? 'pvp' : 'bot';
          W.save();
          renderSetup();
        });
        if (chessOpponent(r) === 'pvp') {
          if (global.ChessDuel && global.ChessDuel.fetchInbox) global.ChessDuel.fetchInbox();
          return;
        }
        wireSlider(el, { name: 'level', levels: CHESS_DIFF }, '[data-level]', function (v) { r.level = +v; });
        seg(el, '[data-kind]', function (v) { r.kind = v; });
      },
      mount: function (stage, r) {
        if (chessOpponent(r) === 'pvp') {
          var mid = r._matchId || null;
          if (r._matchId) { delete r._matchId; W.save(); }
          return global.ChessDuel.mount(stage, {
            onBack: toSetup,
            autoResume: true,
            matchId: mid || null
          });
        }
        return global.GeoChess.mount(stage, {
          level: +pick(LEVELS, String(r.level), '1'), kind: kind_(r),
          cfg: function () { return gameCfg('chess'); }, onBack: toSetup
        });
      },
      playing: function (r) {
        if (chessOpponent(r) === 'pvp') return 'Live Geo Chess · challenge a friend';
        return 'Move questions from ' + global.StudyFilters.label(gameCfg('chess'));
      }
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
        var maps = dashMapLevels();
        var map = dashMapId(r);
        return '<div class="panel dash-track">' +
            sliderHtml({
              name: 'map',
              label: 'Map',
              value: map,
              levels: maps,
              ends: [maps[0].name, maps[maps.length - 1].name]
            }, 'map', maps.map(function (m) { return [m.value, m.name]; }), map) +
            '<div class="dash-track__gate">' +
              sliderHtml({
                name: 'every',
                label: 'A capital gate every',
                value: every,
                levels: EVERY_DIFF,
                ends: ['Every 10s', 'Every 45s']
              }, 'every', EVERY.map(function (s) { return [String(s), s + 's']; }), String(every)) +
            '</div>' +
          '</div>' +
          stats([[(r.best || 0) + ' m', 'Best distance'], [r.bestCaps || 0, 'Most capitals'], [r.runs || 0, 'Runs']]);
      },
      wire: function (el, r) {
        wireSlider(el, { name: 'map', levels: dashMapLevels() }, '[data-map]', function (v) { r.map = v; });
        wireSlider(el, { name: 'every', levels: EVERY_DIFF }, '[data-every]', function (v) { r.every = +v; });
      },
      mount: function (stage, r) {
        return global.GeoDash.mount(stage, {
          every: EVERY.indexOf(r.every) !== -1 ? r.every : 20,
          map: dashMapId(r),
          cfg: function () { return gameCfg('dash'); },
          onBack: toSetup
        });
      },
      playing: function () {
        var map = dashMapId(record('dash'));
        var levels = dashMapLevels();
        var label = (levels.filter(function (m) { return m.value === map; })[0] || levels[0]).name;
        return label + ' · Capitals from ' + global.StudyFilters.label(gameCfg('dash'));
      }
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
            sliderHtml({
              name: 'speed',
              label: 'Speed',
              value: pick(SPEEDS, r.speed, 'normal'),
              levels: SPEED_DIFF,
              ends: ['Relaxed', 'Fast']
            }, 'speed', SPEEDS, pick(SPEEDS, r.speed, 'normal')) +
            '<div class="panel__head" style="margin-top:14px"><h3>Walls</h3></div>' +
            segHtml('walls', WALLS, pick(WALLS, r.walls, 'solid')) +
          '</div>' +
          stats([[r.best || 0, 'Best score'], [r.bestCaps || 0, 'Most right'], [r.runs || 0, 'Games']]);
      },
      wire: function (el, r) {
        seg(el, '[data-food]', function (v) { r.food = v; });
        wireSlider(el, { name: 'speed', levels: SPEED_DIFF }, '[data-speed]', function (v) { r.speed = v; });
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
            '<div style="margin-top:14px">' +
            sliderHtml({
              name: 'holes',
              label: 'Round',
              value: holes,
              levels: HOLES_DIFF,
              ends: ['6 holes', '18 holes']
            }, 'holes', HOLES, holes) +
            '</div>' +
          '</div>' +
          stats([[best === undefined ? '–' : parToText(best), 'Best, ' + holes + ' holes'], [r.aces || 0, 'Holes in one'], [r.rounds || 0, 'Rounds']]);
      },
      wire: function (el, r) {
        seg(el, '[data-target]', function (v) { r.target = v; });
        wireSlider(el, { name: 'holes', levels: HOLES_DIFF, commitOnly: true }, '[data-holes]', function (v) {
          r.holes = +v;
          renderSetup();
        });
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
      id: 'invaders', title: 'Geo Invaders', art: 'invaders', premium: true,
      blurb: 'Space Invaders, where the formation is the answer sheet. Four pods march down carrying flags or capitals, and you shoot the one the banner names.',
      meta: 'Premium · Steer and shoot · three lives',
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
      id: 'breakout', title: 'Flag Breakout', art: 'breakout', premium: true,
      blurb: 'Breakout against a wall of flags. The banner names a country and rings its flag in the wall; knock that brick out without losing the ball.',
      meta: 'Premium · Paddle and ball · flag wall',
      best: function (r) { return r.best ? 'Best ' + r.best + ' pts' : ''; },
      intro: 'A wall of flags from your study set, with the one you are after ringed in gold. Aiming a bouncing ball at one brick is the skill, so a wrong brick is not punished with a life: it tells you whose flag you just hit and the hunt carries on. Only losing the ball costs you.',
      keys: [[['←', '→'], 'or the mouse, to move the paddle'], [['Space'], 'serve'], [['Esc'], 'pause']],
      filters: { title: 'Breakout wall filters', heading: 'The wall', typed: false },
      side: function (r) {
        var rows = pick(ROWS_, String(r.rows), '3');
        return '<div class="panel">' +
          sliderHtml({
            name: 'rows',
            label: 'Wall depth',
            value: rows,
            levels: ROWS_DIFF,
            ends: ['2 rows', '4 rows'],
            hint: 'How many rows the first wave starts with. It grows every other wave.'
          }, 'rows', ROWS_, rows) +
          '</div>' +
          stats([[r.best || 0, 'Best score'], [r.runs || 0, 'Games']]);
      },
      wire: function (el, r) {
        wireSlider(el, { name: 'rows', levels: ROWS_DIFF }, '[data-rows]', function (v) { r.rows = +v; });
      },
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
      id: 'typer', title: 'Capital Typer', art: 'typer', premium: true,
      blurb: 'Countries fall and you shoot them down by typing their capital. The only game here that asks you to produce the answer rather than recognise it.',
      meta: 'Premium · Typing · no multiple choice',
      best: function (r) { return r.best ? 'Best ' + r.best + ' pts' : ''; },
      intro: 'Countries drift down the screen. Type the capital of one and it goes down, and a box lights up as soon as what you have typed could be it. Enter submits, and a wrong guess shows you the answer. Three reaching the bottom ends the run. Spelling is marked the way the rest of the app marks typed answers, so the usual slips are forgiven.',
      keys: [[['A', '–', 'Z'], 'type the capital'], [['Enter'], 'submit'], [['Esc'], 'pause']],
      filters: { title: 'Typer question filters', heading: 'Falling countries', typed: false },
      side: function (r) {
        var rate = pick(RATES_, r.rate, 'brisk');
        return '<div class="panel">' +
          sliderHtml({
            name: 'rate',
            label: 'How fast they come',
            value: rate,
            levels: RATE_DIFF,
            ends: ['Calm', 'Frantic']
          }, 'rate', RATES_, rate) +
          '</div>' +
          stats([[r.best || 0, 'Best score'], [r.runs || 0, 'Games']]);
      },
      wire: function (el, r) {
        wireSlider(el, { name: 'rate', levels: RATE_DIFF }, '[data-rate]', function (v) { r.rate = v; });
      },
      mount: function (stage, r) {
        return global.GeoTyper.mount(stage, {
          rate: function () { return pick(RATES_, r.rate, 'brisk'); },
          cfg: function () { return gameCfg('typer'); }, onBack: toSetup
        });
      },
      playing: function () { return 'Capitals, typed, from ' + global.StudyFilters.label(gameCfg('typer')); }
    },
    {
      id: 'crossing', title: 'Border Crossing', art: 'crossing', premium: true,
      blurb: 'Frogger with four border gates along the top. Cross five lanes of traffic and go through the gate with the right answer on it.',
      meta: 'Premium · Hop the lanes · pick a gate',
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
      id: 'whack', title: 'Capital Whack', art: 'whack', premium: true,
      blurb: 'Nine holes, answers popping out of them, and a clock. Whack the right one before it ducks back down.',
      meta: 'Premium · Reflex · against the clock',
      best: function (r) { return r.best ? 'Best ' + r.best + ' pts' : ''; },
      intro: 'Answers pop out of nine holes and duck back down on their own. Whack the one the banner asks for, by clicking it or pressing 1 to 9. There are no lives: a wrong one costs you three seconds, and the clock is the whole game.',
      keys: [[['1', '–', '9'], 'whack that hole'], [['Click'], 'or tap a head'], [['Esc'], 'pause']],
      filters: { title: 'Whack question filters', heading: 'What pops up', typed: false },
      side: function (r) {
        var length = pick(LENGTHS, String(r.length), '90');
        return '<div class="panel">' +
          sliderHtml({
            name: 'length',
            label: 'Round length',
            value: length,
            levels: LENGTH_DIFF,
            ends: ['60s', '120s']
          }, 'length', LENGTHS, length) +
          '</div>' +
          stats([[r.best || 0, 'Best score'], [r.runs || 0, 'Games']]);
      },
      wire: function (el, r) {
        wireSlider(el, { name: 'length', levels: LENGTH_DIFF }, '[data-length]', function (v) { r.length = +v; });
      },
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
        var size = pick(SIZES, String(r.size), '8');
        return '<div class="panel">' +
          sliderHtml({
            name: 'size',
            label: 'Board size',
            value: size,
            levels: SIZE_DIFF,
            ends: ['6 pairs', '10 pairs']
          }, 'size', SIZES, size) +
          '</div>' +
          stats([[r.best || 0, 'Best score'], [r.runs || 0, 'Games']]);
      },
      wire: function (el, r) {
        wireSlider(el, { name: 'size', levels: SIZE_DIFF }, '[data-size]', function (v) { r.size = +v; });
      },
      mount: function (stage, r) {
        return global.GeoMatch.mount(stage, {
          size: function () { return +pick(SIZES, String(r.size), '8'); },
          cfg: function () { return gameCfg('match'); }, onBack: toSetup
        });
      },
      playing: function () { return 'Flags from ' + global.StudyFilters.label(gameCfg('match')); }
    },
    {
      id: 'sort', title: 'Continent Sort', art: 'sort', premium: true,
      blurb: 'A belt brings countries along and six bins wait underneath. Drop each one into its region before it runs off the end.',
      meta: 'Premium · Sorting · six regions',
      best: function (r) { return r.best ? 'Best ' + r.best + ' pts' : ''; },
      intro: 'The only game here that asks about region rather than capitals or flags, which is the thing a map quiz always wants and no other mode drills on its own. Send each one to its bin by clicking it or pressing 1 to 6. A wrong bin costs two seconds; letting one run off the end just loses it.',
      keys: [[['1', '–', '6'], 'drop into that bin'], [['Click'], 'or tap a bin'], [['Esc'], 'pause']],
      filters: { title: 'Sort belt filters', heading: 'On the belt', typed: false },
      side: function (r) {
        var length = pick(LENGTHS, String(r.length), '90');
        return '<div class="panel"><div class="panel__head"><h3>The parcel shows</h3></div>' +
          segHtml('show', SHOWS, pick(SHOWS, r.show, 'name')) +
          '<div style="margin-top:14px">' +
          sliderHtml({
            name: 'length',
            label: 'Round length',
            value: length,
            levels: LENGTH_DIFF,
            ends: ['60s', '120s']
          }, 'length', LENGTHS, length) +
          '</div>' +
          '</div>' +
          stats([[r.best || 0, 'Best score'], [r.runs || 0, 'Games']]);
      },
      wire: function (el, r) {
        seg(el, '[data-show]', function (v) { r.show = v; });
        wireSlider(el, { name: 'length', levels: LENGTH_DIFF }, '[data-length]', function (v) { r.length = +v; });
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
      id: 'stack', title: 'Capital Stack', art: 'stack', premium: true,
      blurb: 'Four columns, each headed by a country. A capital falls; slide it under the country it belongs to before it lands.',
      meta: 'Premium · Falling blocks · four columns',
      best: function (r) { return r.best ? 'Best ' + r.best + ' pts' : ''; },
      intro: 'A wrong drop does not end anything: the block stays where it fell and that column grows. A right one clears the column and brings in a new country. The game ends when a column reaches the headers, so mistakes cost you room rather than a life.',
      keys: [[['←', '→'], 'or A / D, to slide'], [['Space'], 'drop it now'], [['1', '–', '4'], 'send it to that column'], [['Esc'], 'pause']],
      filters: { title: 'Stack question filters', heading: 'The columns', typed: false },
      side: function (r) {
        var speed = pick(SPEEDS, r.speed, 'normal');
        return '<div class="panel">' +
          sliderHtml({
            name: 'speed',
            label: 'Speed',
            value: speed,
            levels: SPEED_DIFF,
            ends: ['Relaxed', 'Fast']
          }, 'speed', SPEEDS, speed) +
          '</div>' +
          stats([[r.best || 0, 'Best score'], [r.runs || 0, 'Games']]);
      },
      wire: function (el, r) {
        wireSlider(el, { name: 'speed', levels: SPEED_DIFF }, '[data-speed]', function (v) { r.speed = v; });
      },
      mount: function (stage, r) {
        return global.GeoStack.mount(stage, {
          speed: function () { return pick(SPEEDS, r.speed, 'normal'); },
          cfg: function () { return gameCfg('stack'); }, onBack: toSetup
        });
      },
      playing: function () { return 'Capitals from ' + global.StudyFilters.label(gameCfg('stack')); }
    },
    {
      id: 'echo', title: 'Flag Echo', art: 'echo', premium: true,
      blurb: 'Simon, played with flags. The board lights a sequence and you play it back, one longer every round.',
      meta: 'Premium · Memory · one longer each round',
      best: function (r) { return r.longest ? 'Longest ' + r.longest : ''; },
      intro: 'The board lights a sequence of flags and you play it back in order. Each round adds one, and the flag that joins is named as it lights, so the name goes in with the picture. Playing a sequence back right counts as a right answer for every country in it, which is what makes a long chain worth chasing.',
      keys: [[['1', '–', '9'], 'press that flag'], [['Click'], 'or tap a flag'], [['Esc'], 'pause']],
      filters: { title: 'Echo board filters', heading: 'The board', typed: false },
      side: function (r) {
        var pads = pick(PADS, String(r.pads), '6');
        return '<div class="panel">' +
          sliderHtml({
            name: 'pads',
            label: 'Flags on the board',
            value: pads,
            levels: PADS_DIFF,
            ends: ['4 flags', '8 flags'],
            hint: 'More flags make a longer sequence harder to hold.'
          }, 'pads', PADS, pads) +
          '</div>' +
          stats([[r.longest || 0, 'Longest echo'], [r.best || 0, 'Best score'], [r.runs || 0, 'Games']]);
      },
      wire: function (el, r) {
        wireSlider(el, { name: 'pads', levels: PADS_DIFF }, '[data-pads]', function (v) { r.pads = +v; });
      },
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
    /* LEA-68: Chess Duel folded into Geo Chess — keep old ids working. */
    if (id === 'chessduel') id = 'chess';
    return GAMES.filter(function (g) { return g.id === id; })[0] || GAMES[0];
  }

  function openChessPvp() {
    var r = record('chess');
    r.opponent = 'pvp';
    W.save();
    current = 'chess';
    toSetup();
  }

  /* LEA-80: jump into Geo Chess PvP from Friend inbox (accept / rejoin). */
  var pendingChessMatch = null;
  function openChessMatch(matchId) {
    var r = record('chess');
    r.opponent = 'pvp';
    if (matchId) r._matchId = matchId;
    else delete r._matchId;
    W.save();
    current = 'chess';
    pendingChessMatch = matchId || true;
    if (global.UI && global.UI.go) global.UI.go('games');
    else start();
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
    if (!start.previewHook) {
      start.previewHook = true;
      global.addEventListener('learngeo:premium-preview', function () {
        if (screen === 'hub') renderHub();
        else if (screen === 'setup') renderSetup();
      });
    }
    if (global.GameBlocks) global.GameBlocks.load();
    if (global.GeoDuel && global.GeoDuel.startWatching) global.GeoDuel.startWatching();
    if (global.ChessDuel && global.ChessDuel.startWatching) global.ChessDuel.startWatching();
    /* Guests may browse the hub, but must not stay in a live run or setup. */
    if (needsAccount() && (screen === 'play' || screen === 'setup')) screen = 'hub';
    if (screen === 'play') screen = 'setup';
    stop();
    if (pendingChessMatch) {
      var mid = pendingChessMatch === true ? null : pendingChessMatch;
      pendingChessMatch = null;
      var cr = record('chess');
      cr.opponent = 'pvp';
      if (mid) cr._matchId = mid;
      current = 'chess';
      W.save();
      if (needsAccount()) {
        promptAccount(function () { openChessMatch(mid); });
        renderHub();
        return;
      }
      play();
      return;
    }
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

  /* ------------------------------ hub -------------------------------
     Same shell language as Home and Learn: eyebrow, heading, panels,
     light game cards. The cards reuse the landing .game-card markup so
     Games.art() stays honest. Arrow keys move focus between cards;
     Enter and Space are the buttons' own. */
  function renderHub() {
    stop();
    screen = 'hub';
    var el = host();
    if (!el) return;

    var hi = 0;
    GAMES.forEach(function (g) { hi = Math.max(hi, record(g.id).best || 0); });
    var guest = needsAccount();

    el.innerHTML =
      '<div class="portal__inner games">' +
        '<div class="games__head">' +
          '<div class="eyebrow">Practice</div>' +
          '<h1>Games</h1>' +
          '<p>' + GAMES.length + ' games · everything you answer counts toward mastery, XP, and gems, same as the study modes.</p>' +
        '</div>' +
        (guest
          ? '<div class="signin-hint" data-games-auth>' + I.user +
              '<span>To play Games, make a free LearnGeo account (or sign in). Scores, gamertags, and matches stay with you.</span>' +
              '<button class="btn btn--accent btn--sm" type="button" data-games-signup>Create account</button>' +
              '<button class="btn btn--ghost btn--sm" type="button" data-games-signin>Sign in</button>' +
            '</div>'
          : '') +
        '<div class="games__toolbar">' +
          '<span class="games__toolbar-label">Choose a game</span>' +
          '<button class="btn btn--ghost btn--sm" data-boards type="button">' + I.trophy + ' Leaderboards</button>' +
          '<span class="games__toolbar-meta mono">Best ' + hi.toLocaleString() +
            ' · ' + W.masteredCount() + ' / ' + global.GeoData.counts.total + ' mastered</span>' +
        '</div>' +
        '<div class="games__grid">' +
          GAMES.map(card).join('') +
        '</div>' +
        '<p class="games__hint"><kbd>\u2190</kbd> <kbd>\u2192</kbd> to choose · <kbd>Enter</kbd> to play</p>' +
      '</div>';

    W.$('[data-boards]', el).addEventListener('click', function () {
      /* Hub opens the All overview so every game is one tap away. */
      if (global.GameBoards) global.GameBoards.open();
    });
    var signupBtn = W.$('[data-games-signup]', el);
    if (signupBtn) signupBtn.addEventListener('click', function () {
      promptAccount(null, 'signup');
    });
    var signinBtn = W.$('[data-games-signin]', el);
    if (signinBtn) signinBtn.addEventListener('click', function () {
      promptAccount(null, 'signin');
    });

    var cards = W.$$('[data-game]', el);
    cards.forEach(function (btn, i) {
      btn.addEventListener('click', function () {
        if (isBlocked(btn.dataset.game)) { blockedToast(); return; }
        if (needsAccount()) {
          var id = btn.dataset.game;
          promptAccount(function () {
            if (isPremiumLocked(id)) { premiumToast(id); renderHub(); return; }
            current = id; toSetup();
          });
          return;
        }
        if (isPremiumLocked(btn.dataset.game)) { premiumToast(btn.dataset.game); return; }
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

  function signedIn() { return !!(global.Cloud && global.Cloud.signedIn); }
  function needsAccount() { return !signedIn(); }

  /* Friendly gate → existing auth modal. `mode` is signup|signin; after a
     successful account the optional `then` resumes the play path. */
  function promptAccount(then, mode) {
    if (!needsAccount()) {
      if (then) then();
      return;
    }
    var resume = function () {
      if (then) then();
      else if (screen === 'hub') renderHub();
      else if (screen === 'setup') renderSetup();
    };
    var open = function (m) {
      if (global.UI && global.UI.openAuth) global.UI.openAuth(m || 'signup', resume);
      else W.toast('Account needed', 'Sign in or create an account to play Games.', I.user, 4200);
    };
    /* Direct banner buttons skip the explainer and open auth immediately. */
    if (mode === 'signup' || mode === 'signin') { open(mode); return; }
    if (global.UI && global.UI.modal) {
      global.UI.modal({
        title: 'Make an account to play',
        icon: I.user,
        body: '<p class="t-muted" style="margin:0">Games keep your scores, gamertag, and matches on your LearnGeo account. ' +
          'Create a free account or sign in — then come back and play.</p>',
        actions: [
          { label: 'Not now', cls: 'btn--ghost', close: true },
          { label: 'Sign in', cls: 'btn--ghost', close: true,
            onClick: function () { open('signin'); } },
          { label: 'Create account', cls: 'btn--accent', close: true,
            onClick: function () { open('signup'); } }
        ]
      });
      return;
    }
    open('signup');
  }

  function isBlocked(id) { return !!(global.GameBlocks && global.GameBlocks.blocked(id)); }

  function premiumPreviewOn() {
    return !!(global.Premium && global.Premium.previewEnabled && global.Premium.previewEnabled());
  }

  function isPremiumLocked(id) {
    if (!premiumPreviewOn()) return false;
    var g = byId(id);
    var needs = !!(g && g.premium) || !!(global.Premium && global.Premium.gameRequires && global.Premium.gameRequires(id));
    if (!needs) return false;
    return !(global.Premium && global.Premium.gameAllowed && global.Premium.gameAllowed(id));
  }

  function premiumToast(id) {
    var g = byId(id);
    var title = (g && g.title) || 'This game';
    W.toast('Premium', title + ' needs LearnGeo Premium.', I.crown || I.lock, 3600);
    if (global.Premium && global.Premium.openUpgrade) {
      global.Premium.openUpgrade(title + ' is a Premium game.');
    }
  }

  function card(g) {
    var best = g.best(record(g.id));
    var off = isBlocked(g.id);
    var guest = !off && needsAccount();
    var showPrem = premiumPreviewOn() && !!g.premium;
    var prem = !off && !guest && isPremiumLocked(g.id);
    var locked = off || prem || guest;
    var meta = showPrem ? g.meta : String(g.meta || '').replace(/^Premium\s*·\s*/i, '');
    var crown = I.crown || I.lock || '';
    var invites = 0;
    if (g.id === 'duel' && global.GeoDuel && global.GeoDuel.pendingCount) {
      invites = global.GeoDuel.pendingCount();
    } else if (g.id === 'chess' && global.ChessDuel && global.ChessDuel.pendingCount) {
      invites = global.ChessDuel.pendingCount();
    }
    return '<button class="game-card' + (off ? ' is-blocked' : '') +
      (prem ? ' is-premium-locked' : '') + (guest ? ' is-auth-locked' : '') +
      '" data-game="' + g.id + '" type="button"' +
      (locked ? ' aria-disabled="true"' : '') + '>' +
      '<div class="game-card__art game-art--' + g.art + '" aria-hidden="true">' + art(g.art) +
        (showPrem ? '<span class="game-card__prem-badge" title="Premium">' +
          crown + '<span>Premium</span></span>' : '') +
        (invites ? '<span class="game-card__invite-badge">' + invites + ' invite' + (invites === 1 ? '' : 's') + '</span>' : '') +
      '</div>' +
      '<div class="game-card__body">' +
        '<h3>' + esc(g.title) +
          (prem ? ' <span class="game-card__crown" title="Premium" aria-hidden="true">' + crown + '</span>' : '') +
        '</h3>' +
        '<p>' + esc(g.blurb) + '</p>' +
        '<div class="game-card__foot"><span>' + esc(meta) + '</span>' +
          (best ? '<span class="game-card__best">' + esc(best) + '</span>' : '') +
          (off ? '<span class="game-card__go">' + I.lock + ' Blocked by your teacher</span>'
               : guest ? '<span class="game-card__go">' + I.lock + ' Account to play</span>'
               : prem ? '<span class="game-card__go">' + crown + ' Premium · Upgrade</span>'
               : '<span class="game-card__go">' +
                   (g.id === 'duel' ? 'Challenge ' : 'Play ') + I.arrowR + '</span>') + '</div>' +
      '</div>' +
    '</button>';
  }

  function art(kind) {
    if (kind === 'chess') {
      return '<span class="chess-art__board"></span><span class="chess-art__piece">♞</span><span class="chess-art__caption">Your next move starts here</span>';
    }
    if (kind === 'chessduel') {
      return '<span class="chess-art__board"></span><span class="chess-art__piece">♞</span>' +
        '<span class="gduel-art__pill gduel-art__pill--a" style="top:18%">You</span>' +
        '<span class="gduel-art__vs" style="top:42%">VS</span>' +
        '<span class="gduel-art__pill gduel-art__pill--b" style="top:18%">Friend</span>' +
        '<span class="chess-art__caption">Challenge a friend</span>';
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
    if (kind === 'duel') {
      return '<span class="gduel-art__pill gduel-art__pill--a">You</span>' +
        '<span class="gduel-art__vs">VS</span>' +
        '<span class="gduel-art__pill gduel-art__pill--b">Friend</span>' +
        '<span class="gduel-art__flag" style="left:18%;top:58%"></span>' +
        '<span class="gduel-art__flag gduel-art__flag--b" style="left:62%;top:58%"></span>' +
        '<span class="gduel-art__bolt"></span>';
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
    var fromChessDuel = (current === 'chessduel');
    var g = byId(current);
    current = g.id;
    if (isBlocked(g.id)) { blockedToast(); renderHub(); return; }
    if (needsAccount()) {
      promptAccount(function () {
        if (isPremiumLocked(g.id)) { premiumToast(g.id); renderHub(); return; }
        renderSetup();
      });
      renderHub();
      return;
    }
    if (isPremiumLocked(g.id)) { premiumToast(g.id); renderHub(); return; }
    var r = record(g.id);
    /* Old Chess Duel deep-links / toasts open Geo Chess in Challenge mode. */
    if (g.id === 'chess' && (fromChessDuel || r._openPvp)) {
      r.opponent = 'pvp';
      delete r._openPvp;
      W.save();
    }
    var cfg = gameCfg(g.id);
    var keys = typeof g.keys === 'function' ? g.keys(r) : g.keys;
    var filters = typeof g.filters === 'function' ? g.filters(r) : g.filters;
    var playLabel = typeof g.playLabel === 'function' ? g.playLabel(r) : (g.playLabel || 'Play');

    el.innerHTML =
      '<div class="portal__inner games">' +
        '<button class="games__back" data-hub>' + I.arrowL + ' All games</button>' +
        '<div class="dash-setup">' +
          '<div class="dash-setup__main">' +
            '<div class="game-card__art game-art--' + g.art + ' dash-setup__art" aria-hidden="true">' + art(g.art) + '</div>' +
            '<h1>' + esc(g.title) + '</h1>' +
            '<p>' + esc(g.intro) + '</p>' +
            '<div class="dash-keys">' +
              keys.map(function (k) {
                return '<div>' + k[0].map(function (x) { return '<kbd>' + esc(x) + '</kbd>'; }).join('') +
                  '<span>' + esc(k[1]) + '</span></div>';
              }).join('') +
            '</div>' +
            '<div class="dash-setup__go">' +
              '<button class="btn btn--accent btn--lg" data-play>' + I.play + ' ' +
                esc(playLabel) + '</button>' +
              '<button class="btn btn--ghost btn--lg" data-board type="button">' + I.trophy + ' Leaderboard</button>' +
            '</div>' +
          '</div>' +
          '<div class="dash-setup__side">' +
            (filters
              ? '<div class="panel">' +
                  '<div class="panel__head"><h3>' + esc(filters.heading) + '</h3>' +
                    '<button class="btn btn--ghost btn--sm" data-filters>Filters</button></div>' +
                  '<div class="dash-cfg">' +
                    '<div><span>Countries</span><b>' + esc(global.StudyFilters.label(cfg)) + '</b></div>' +
                    (filters.typed
                      ? '<div><span>Answer</span><b>' + (cfg.typed ? (g.id === 'chess' ? 'Type the answer' : 'Type the capital') : 'Multiple choice') + '</b></div>'
                      : '') +
                    '<div><span>Order</span><b>' + (cfg.weakFirst ? 'Weakest first' : 'Random') + '</b></div>' +
                  '</div>' +
                  '<div class="field__hint" style="margin-top:10px">The same filters as Learn: regions, UN members, or the countries you pick.</div>' +
                '</div>'
              : '') +
            g.side(r) +
          '</div>' +
        '</div>' +
      '</div>';

    W.$('[data-hub]', el).addEventListener('click', renderHub);
    W.$('[data-play]', el).addEventListener('click', play);
    W.$('[data-board]', el).addEventListener('click', function () {
      if (global.GameBoards) global.GameBoards.open(g.id);
    });
    var filtersBtn = W.$('[data-filters]', el);
    if (filtersBtn && filters) {
      filtersBtn.addEventListener('click', function () {
        global.StudyFilters.open({
          cfg: cfg, title: filters.title, types: false, mapChoices: false, answerStyle: filters.typed,
          onApply: function (f) {
            r.cfg = { regions: f.regions, scope: f.scope, countries: f.countries, typed: f.typed, weakFirst: f.weakFirst };
            W.save();
            renderSetup();
          }
        });
      });
    }
    g.wire(el, r);
  }

  /* ------------------------------ play ------------------------------ */
  function play() {
    var g0 = byId(current);
    if (isBlocked(g0.id)) { blockedToast(); renderHub(); return; }
    if (needsAccount()) {
      promptAccount(function () {
        if (isPremiumLocked(g0.id)) { premiumToast(g0.id); renderHub(); return; }
        play();
      });
      return;
    }
    if (isPremiumLocked(g0.id)) { premiumToast(g0.id); renderHub(); return; }
    stop();
    screen = 'play';
    var el = host();
    var g = g0;
    var r = record(g.id);
    el.innerHTML =
      '<div class="portal__inner games games--play">' +
        '<div class="games__playbar">' +
          '<button class="games__back" data-setup>' + I.arrowL + ' ' + esc(g.title) + '</button>' +
          '<span class="t-sm t-muted">' + esc(typeof g.playing === 'function' ? g.playing(r) : '') + '</span>' +
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
      return { id: g.id, title: g.title, blurb: g.blurb, meta: g.meta, art: g.art, premium: !!g.premium };
    });
  }

  global.Games = {
    start: start, stop: stop, catalogue: catalogue, art: art,
    playing: playing, abandon: abandon,
    needsAccount: needsAccount, promptAccount: promptAccount,
    openChessPvp: openChessPvp,
    openChessMatch: openChessMatch,
    get current() { return game; },
    get game() { return current; },
    get screen() { return screen; }
  };
})(window);
