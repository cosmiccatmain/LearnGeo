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

  var GAMES = [
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
        var kind = kind_(r);
        return '<div class="panel">' +
            '<div class="panel__head"><h3>Satellites show</h3></div>' +
            '<div class="seg game-seg" data-kind>' +
              KINDS.map(function (k) {
                return '<button data-v="' + k[0] + '" class="' + (k[0] === kind ? 'is-active' : '') + '">' + k[1] + '</button>';
              }).join('') +
            '</div>' +
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
    }
  ];

  var screen = 'hub';
  var current = null;       /* the game whose setup or stage is showing */
  var game = null;          /* the running game, if any */

  function host() { return document.getElementById('view-games'); }

  function record(id) {
    var g = W.state.games || (W.state.games = {});
    return g[id] || (g[id] = {});
  }

  function kind_(r) {
    return KINDS.some(function (k) { return k[0] === r.kind; }) ? r.kind : 'flags';
  }

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
    if (screen === 'play') screen = 'setup';
    stop();
    if (screen === 'setup') renderSetup(); else renderHub();
  }

  function stop() {
    if (game) { game.destroy(); game = null; }
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
  function renderHub() {
    stop();
    screen = 'hub';
    var el = host();
    if (!el) return;
    el.innerHTML =
      '<div class="portal__inner games">' +
        '<div class="games__head">' +
          '<span class="eyebrow">Games</span>' +
          '<h1>Play with the map in your head</h1>' +
          '<p>Short 2D games where the geography is part of how you play. Everything you answer counts toward your mastery, XP and gems like the other modes.</p>' +
        '</div>' +
        '<div class="games__grid">' +
          GAMES.map(function (g) {
            var best = g.best(record(g.id));
            return '<button class="game-card" data-game="' + g.id + '">' +
              '<div class="game-card__art game-art--' + g.art + '" aria-hidden="true">' + art(g.art) + '</div>' +
              '<div class="game-card__body">' +
                '<h3>' + esc(g.title) + '</h3>' +
                '<p>' + esc(g.blurb) + '</p>' +
                '<div class="game-card__foot"><span>' + esc(g.meta) + '</span>' +
                  (best ? '<span class="game-card__best">' + esc(best) + '</span>' : '') +
                  '<span class="game-card__go">Play ' + I.arrowR + '</span></div>' +
              '</div>' +
            '</button>';
          }).join('') +
          '<div class="game-card game-card--soon">' +
            '<div class="game-card__body">' +
              '<h3>More games on the way</h3>' +
              '<p>More 2D games will join these here.</p>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    W.$$('[data-game]', el).forEach(function (b) {
      b.addEventListener('click', function () { current = b.dataset.game; toSetup(); });
    });
  }

  function art(kind) {
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
    return '';
  }

  /* ----------------------------- setup ------------------------------ */
  function renderSetup() {
    stop();
    var el = host();
    if (!el) return;
    var g = byId(current);
    current = g.id;
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
            '<button class="btn btn--accent btn--lg" data-play>' + I.play + ' Play</button>' +
          '</div>' +
          '<div class="dash-setup__side">' +
            '<div class="panel">' +
              '<div class="panel__head"><h3>' + esc(g.filters.heading) + '</h3>' +
                '<button class="btn btn--ghost btn--sm" data-filters>Filters</button></div>' +
              '<div class="dash-cfg">' +
                '<div><span>Countries</span><b>' + esc(global.StudyFilters.label(cfg)) + '</b></div>' +
                (g.filters.typed
                  ? '<div><span>Answer</span><b>' + (cfg.typed ? 'Type the capital' : 'Multiple choice') + '</b></div>'
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

  global.Games = {
    start: start, stop: stop,
    get current() { return game; },
    get game() { return current; },
    get screen() { return screen; }
  };
})(window);
