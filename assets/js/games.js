/* ------------------------------------------------------------------
   LearnGeo — Games
   A hub of small 2D games where geography is part of how you play.
   GAMES is the list the hub draws; a new game is one more entry with a
   setup screen and a mount(host) that returns { destroy }.

   Each game keeps its own record under state.games.<id>.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons;
  var esc = W.escapeHtml;

  var EVERY = [10, 20, 30, 45];

  var GAMES = [
    { id: 'dash', title: 'Geo Dash', art: 'dash',
      blurb: 'Jump over spikes and onto blocks to the beat of your own taps. Every so often a capital gate comes up, and you have to name the capital to keep running.',
      meta: 'One button · capital gates' }
  ];

  var screen = 'hub';
  var game = null;          /* the running game, if any */

  function host() { return document.getElementById('view-games'); }

  function record(id) {
    var g = W.state.games || (W.state.games = {});
    return g[id] || (g[id] = {});
  }

  /* Geo Dash asks capitals with the same filters as Learn. The first time,
     it starts from whatever Learn is set to. */
  function dashCfg() {
    var r = record('dash');
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

  function start() {
    if (screen === 'play') screen = 'setup';
    stop();
    if (screen === 'setup') renderSetup(); else renderHub();
  }

  function stop() {
    if (game) { game.destroy(); game = null; }
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
            var r = record(g.id);
            return '<button class="game-card" data-game="' + g.id + '">' +
              '<div class="game-card__art game-art--' + g.art + '" aria-hidden="true">' + art(g.art) + '</div>' +
              '<div class="game-card__body">' +
                '<h3>' + esc(g.title) + '</h3>' +
                '<p>' + esc(g.blurb) + '</p>' +
                '<div class="game-card__foot"><span>' + esc(g.meta) + '</span>' +
                  (r.best ? '<span class="game-card__best">Best ' + r.best + ' m</span>' : '') +
                  '<span class="game-card__go">Play ' + I.arrowR + '</span></div>' +
              '</div>' +
            '</button>';
          }).join('') +
          '<div class="game-card game-card--soon">' +
            '<div class="game-card__body">' +
              '<h3>More games on the way</h3>' +
              '<p>This is the first one. More 2D games will join it here.</p>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    W.$$('[data-game]', el).forEach(function (b) {
      b.addEventListener('click', function () { screen = 'setup'; renderSetup(); });
    });
  }

  function art(kind) {
    if (kind !== 'dash') return '';
    return '<span class="ga-cube"></span><span class="ga-spike" style="left:58%"></span>' +
      '<span class="ga-spike" style="left:66%"></span><span class="ga-block"></span>' +
      '<span class="ga-gate">?</span><span class="ga-floor"></span>';
  }

  /* ----------------------------- setup ------------------------------ */
  function renderSetup() {
    stop();
    var el = host();
    if (!el) return;
    var r = record('dash');
    var cfg = dashCfg();
    var every = EVERY.indexOf(r.every) !== -1 ? r.every : 20;

    el.innerHTML =
      '<div class="portal__inner games">' +
        '<button class="games__back" data-hub>' + I.arrowL + ' All games</button>' +
        '<div class="dash-setup">' +
          '<div class="dash-setup__main">' +
            '<div class="game-card__art game-art--dash dash-setup__art" aria-hidden="true">' + art('dash') + '</div>' +
            '<h1>Geo Dash</h1>' +
            '<p>Your cube runs by itself. Jump over spikes, land on blocks, and get as far as you can. ' +
              'Every so often a capital gate comes down the track: name the capital and the run speeds up, ' +
              'and your cube wears that country’s flag. Get it wrong and the run is over.</p>' +
            '<div class="dash-keys">' +
              '<div><kbd>Space</kbd><kbd>↑</kbd><span>or click / tap to jump, hold to keep jumping</span></div>' +
              '<div><kbd>1</kbd><kbd>–</kbd><kbd>4</kbd><span>answer at a capital gate</span></div>' +
              '<div><kbd>Esc</kbd><span>pause</span></div>' +
            '</div>' +
            '<button class="btn btn--accent btn--lg" data-play>' + I.play + ' Play</button>' +
          '</div>' +
          '<div class="dash-setup__side">' +
            '<div class="panel">' +
              '<div class="panel__head"><h3>Capital questions</h3>' +
                '<button class="btn btn--ghost btn--sm" data-filters>Filters</button></div>' +
              '<div class="dash-cfg">' +
                '<div><span>Countries</span><b>' + esc(global.StudyFilters.label(cfg)) + '</b></div>' +
                '<div><span>Answer</span><b>' + (cfg.typed ? 'Type the capital' : 'Multiple choice') + '</b></div>' +
                '<div><span>Order</span><b>' + (cfg.weakFirst ? 'Weakest first' : 'Random') + '</b></div>' +
              '</div>' +
              '<div class="field__hint" style="margin-top:10px">The same filters as Learn: regions, UN members, or the countries you pick.</div>' +
            '</div>' +
            '<div class="panel">' +
              '<div class="panel__head"><h3>A capital gate every</h3></div>' +
              '<div class="seg" id="dash-every">' +
                EVERY.map(function (s) {
                  return '<button data-v="' + s + '" class="' + (s === every ? 'is-active' : '') + '">' + s + 's</button>';
                }).join('') +
              '</div>' +
            '</div>' +
            '<div class="panel dash-best">' +
              '<div><b class="mono">' + (r.best || 0) + ' m</b><span>Best distance</span></div>' +
              '<div><b class="mono">' + (r.bestCaps || 0) + '</b><span>Most capitals</span></div>' +
              '<div><b class="mono">' + (r.runs || 0) + '</b><span>Runs</span></div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    W.$('[data-hub]', el).addEventListener('click', renderHub);
    W.$('[data-play]', el).addEventListener('click', play);
    W.$('[data-filters]', el).addEventListener('click', function () {
      global.StudyFilters.open({
        cfg: cfg, title: 'Capital question filters', types: false, mapChoices: false,
        onApply: function (f) {
          r.cfg = { regions: f.regions, scope: f.scope, countries: f.countries, typed: f.typed, weakFirst: f.weakFirst };
          W.save();
          renderSetup();
        }
      });
    });
    W.$$('#dash-every button', el).forEach(function (b) {
      b.addEventListener('click', function () {
        r.every = +b.dataset.v;
        W.save();
        W.$$('#dash-every button', el).forEach(function (x) { x.classList.toggle('is-active', x === b); });
      });
    });
  }

  /* ------------------------------ play ------------------------------ */
  function play() {
    stop();
    screen = 'play';
    var el = host();
    var r = record('dash');
    var cfg = dashCfg();
    el.innerHTML =
      '<div class="portal__inner games games--play">' +
        '<div class="games__playbar">' +
          '<button class="games__back" data-setup>' + I.arrowL + ' Geo Dash</button>' +
          '<span class="t-sm t-muted">Capitals from ' + esc(global.StudyFilters.label(cfg)) + '</span>' +
        '</div>' +
        '<div class="games__stage" id="games-stage"></div>' +
      '</div>';
    W.$('[data-setup]', el).addEventListener('click', function () { screen = 'setup'; renderSetup(); });
    game = global.GeoDash.mount(W.$('#games-stage', el), {
      every: EVERY.indexOf(r.every) !== -1 ? r.every : 20,
      cfg: dashCfg,
      onBack: function () { screen = 'setup'; renderSetup(); }
    });
  }

  global.Games = {
    start: start, stop: stop,
    get current() { return game; },
    get screen() { return screen; }
  };
})(window);
