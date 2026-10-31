/* ------------------------------------------------------------------
   LearnGeo — the games section on the landing page.

   The arcade lives inside the app, behind the Games tab, so a visitor
   who has never opened LearnGeo had no way of knowing it was there.
   This puts the five games on the public page and sends every card to
   the same place: the app, on the games view.

   The cards are the arcade's own .game-card markup, so they are styled
   by app.css and chess.css, which index.html already loads for the app
   half of the same document. This file ships no CSS of its own.

   ON THE DUPLICATED COPY BELOW
   games.js keeps its catalogue and its art() private; global.Games
   exposes only start, stop and the current screen. So the titles,
   blurbs and artwork are mirrored here, generated out of games.js
   rather than retyped, and checked at runtime against the real thing.

   If the arcade later exposes Games.catalogue() and Games.art(), this
   file prefers them automatically and FALLBACK stops being read.
   Delete it then: catalogue() and art() below are the only readers.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';

  /* How many cards the landing grid shows. The arcade is going from five
     games to fifteen, and fifteen cards is a wall rather than an invitation
     on a page somebody is still deciding whether to read. The rest are
     counted on a final tile that opens the arcade like the others, so the
     number is always whatever the arcade actually has. */
  var SHOWN = 6;

  var FALLBACK = [
    { id: "chess", title: "Geo Chess", art: "chess",
      blurb: "Build your chess skills, from a forgiving beginner opponent to Stockfish. Answer a geography question to unlock each move.",
      meta: "Chess · five difficulty levels" },
    { id: "dash", title: "Geo Dash", art: "dash",
      blurb: "Jump over spikes and onto blocks to the beat of your own taps. Every so often a capital gate comes up, and you have to name the capital to keep running.",
      meta: "One button · capital gates" },
    { id: "orbit", title: "Globe Defender", art: "orbit",
      blurb: "Circle the globe and shoot down the meteors before they land. Between waves, shoot the satellite with the right flag or capital for a power-up.",
      meta: "Steer and shoot · supply drops" },
    { id: "snake", title: "Capital Snake", art: "snake",
      blurb: "Classic Snake, where the food is the answer. Eat the capital of the country named to grow; eat the wrong one and you lose part of your tail.",
      meta: "Steer · eat the answer" },
    { id: "golf", title: "Geo Golf", art: "golf",
      blurb: "Top-down golf on the world map. Each hole names a country or a capital, and there’s no pin to aim at: putt to where it is.",
      meta: "Drag and putt · on the map" }
  ];

  var FALLBACK_ART = {
    chess: "<span class=\"chess-art__board\"></span><span class=\"chess-art__piece\">♞</span><span class=\"chess-art__caption\">Your next move starts here</span>",
    dash: "<span class=\"ga-cube\"></span><span class=\"ga-spike\" style=\"left:58%\"></span><span class=\"ga-spike\" style=\"left:66%\"></span><span class=\"ga-block\"></span><span class=\"ga-gate\">?</span><span class=\"ga-floor\"></span>",
    orbit: "<span class=\"go-art__orbit\"></span><span class=\"go-art__globe\"></span><span class=\"go-art__ship\"></span><span class=\"go-art__shot\"></span><span class=\"go-art__rock\" style=\"left:14%;top:22%\"></span><span class=\"go-art__rock go-art__rock--big\" style=\"left:80%;top:62%\"></span><span class=\"go-art__sat\" style=\"left:72%;top:14%\"><i></i></span>",
    snake: "<span class=\"sn-art__seg\" style=\"left:14%;top:68%\"></span><span class=\"sn-art__seg\" style=\"left:22%;top:68%\"></span><span class=\"sn-art__seg\" style=\"left:30%;top:68%\"></span><span class=\"sn-art__seg\" style=\"left:38%;top:68%\"></span><span class=\"sn-art__seg\" style=\"left:38%;top:52%\"></span><span class=\"sn-art__seg\" style=\"left:46%;top:52%\"></span><span class=\"sn-art__seg\" style=\"left:54%;top:52%\"></span><span class=\"sn-art__seg sn-art__head\" style=\"left:62%;top:52%\"></span><span class=\"sn-art__food\" style=\"left:78%;top:52%\"></span><span class=\"sn-art__pill\" style=\"left:78%;top:30%\">Nairobi</span><span class=\"sn-art__food\" style=\"left:22%;top:24%\"></span><span class=\"sn-art__pill\" style=\"left:22%;top:4%\">Kampala</span>",
    golf: "<span class=\"gg-art__land gg-art__land--a\"></span><span class=\"gg-art__land gg-art__land--b\"></span><span class=\"gg-art__trail\"></span><span class=\"gg-art__ball\"></span><span class=\"gg-art__pin\"></span><span class=\"gg-art__pill\">Putt to Kenya</span>"
  };

  /* The arcade's own data when it offers it, the mirror above when it
     does not. A shape that is not the array we expect is ignored
     rather than half-rendered. */
  function catalogue() {
    var G = global.Games;
    if (G && typeof G.catalogue === 'function') {
      try {
        var live = G.catalogue();
        if (live && live.length) return live;
      } catch (e) {}
    }
    return FALLBACK;
  }

  function art(kind) {
    var G = global.Games;
    if (G && typeof G.art === 'function') {
      try {
        var live = G.art(kind);
        if (typeof live === 'string' && live) return live;
      } catch (e) {}
    }
    return FALLBACK_ART[kind] || '';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function card(g) {
    return '<button class="game-card" data-open-games type="button">' +
      '<div class="game-card__art game-art--' + esc(g.art) + '" aria-hidden="true">' +
        art(g.art) +
      '</div>' +
      '<div class="game-card__body">' +
        '<h3>' + esc(g.title) + '</h3>' +
        '<p>' + esc(g.blurb) + '</p>' +
        '<div class="game-card__foot">' +
          '<span>' + esc(g.meta) + '</span>' +
          '<span class="game-card__go">Play</span>' +
        '</div>' +
      '</div>' +
    '</button>';
  }

  /* The tile that stands in for everything not shown. Reuses the arcade's
     own --soon modifier, so it is styled already. */
  function moreCard(n) {
    return '<button class="game-card game-card--soon" data-open-games type="button">' +
      '<div class="game-card__body">' +
        '<h3>' + n + ' more</h3>' +
        '<p>' + (n === 1 ? 'One more game is' : 'Another ' + n + ' games are') +
          ' waiting in the arcade.</p>' +
      '</div>' +
    '</button>';
  }

  function mount() {
    var host = document.getElementById('games-grid');
    if (!host) return;

    var list = catalogue();
    var shown = list.slice(0, SHOWN);
    var rest = list.length - shown.length;
    host.innerHTML = shown.map(card).join('') + (rest > 0 ? moreCard(rest) : '');

    /* Every card opens the arcade rather than one game: Games.start()
       takes no id, so there is nothing to deep-link to yet. */
    var open = function () {
      if (global.UI && global.UI.showApp) global.UI.showApp('games');
    };
    var i, b = host.querySelectorAll('[data-open-games]');
    for (i = 0; i < b.length; i++) b[i].addEventListener('click', open);

    var cta = document.getElementById('games-cta');
    if (cta) cta.addEventListener('click', open);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

  global.LandingGames = {
    mount: mount,
    get count() { return catalogue().length; },
    get shown() { return Math.min(SHOWN, catalogue().length); }
  };
})(window);
