/* ------------------------------------------------------------------
   LearnGeo — the Codex.

   Two things that only make sense together. The hexagon is the
   evaluation: six axes, one number, drawn rather than listed, so a
   student can see the shape of what they know instead of reading six
   percentages and doing the comparison themselves. The Guild below it
   is the lore, and every page of it is sealed behind a number the
   hexagon already shows — so the story is the progress bar.

   Nothing here is a new currency or a new record to keep. Both halves
   are read out of mastery and the per-skill tally, so a save that has
   never opened this tab still arrives with a hexagon already drawn and
   a few chapters already open.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons;

  /* which hexagon is on screen. Not saved: it is a way of looking at
     the same six-sided thing, not a setting. */
  var lens = 'world';

  /* ======================= the six skill axes =======================
     The question types, in the order they go round the hexagon. Capitals
     and countries sit opposite each other, and so do the two flag
     directions, so a lopsided shape reads as "I know the names but not
     the flags" rather than as noise. */
  var SKILLS = [
    { key: 'capital',  label: 'Capitals',   blurb: 'Country → capital' },
    { key: 'flag',     label: 'Flag sense', blurb: 'Flag → country' },
    { key: 'identify', label: 'Outlines',   blurb: 'Name the shaded country' },
    { key: 'country',  label: 'Reverse',    blurb: 'Capital → country' },
    { key: 'flagpick', label: 'Colours',    blurb: 'Country → flag' },
    { key: 'locate',   label: 'Placing',    blurb: 'Find it on the map' }
  ];

  /* An axis reads its true accuracy only once there are enough answers
     behind it. Below that it fills in proportion, so twelve right out of
     twelve is a promising axis rather than a perfect one. */
  var FULL_AT = 30;

  /* ============================== scoring =========================== */
  /* Regions score on how deep the mastery goes, not on how many countries
     have crossed the line. box is 0–5 and the Leitner steps are what the
     rest of the app already moves, so the mean box is the honest reading
     and it starts moving on the first right answer. */
  function worldAxes() {
    return global.GeoData.regions.map(function (r) {
      var list = global.GeoData.countries.filter(function (c) { return c.region === r; });
      var boxes = 0, done = 0;
      list.forEach(function (c) {
        var m = W.state.mastery[c.name];
        if (!m) return;
        boxes += Math.min(5, m.box || 0);
        if (m.box >= 4) done += 1;
      });
      var score = Math.round((boxes / (5 * list.length)) * 100);
      return {
        key: r, label: shortRegion(r), full: r, score: score,
        detail: !boxes
          ? 'Nothing from ' + r + ' yet. Every answer here lifts this corner.'
          : done + ' of ' + list.length + ' mastered, and the rest part-learnt. ' +
            'The corner fills when all ' + list.length + ' are at the top box.'
      };
    });
  }

  /* North and South America are the only labels too long for a corner. */
  function shortRegion(r) {
    if (r === 'North America') return 'N. America';
    if (r === 'South America') return 'S. America';
    return r;
  }

  function skillAxes() {
    var tally = W.state.skills || {};
    return SKILLS.map(function (s) {
      var t = tally[s.key] || { c: 0, w: 0 };
      var n = (t.c || 0) + (t.w || 0);
      var acc = n ? t.c / n : 0;
      var ramp = Math.min(1, n / FULL_AT);
      return {
        key: s.key, label: s.label, full: s.blurb,
        score: Math.round(acc * ramp * 100),
        thin: n < 8,
        detail: !n
          ? 'No ' + s.blurb.toLowerCase() + ' questions answered yet.'
          : t.c + ' right out of ' + n + ' (' + Math.round(acc * 100) + '%)' +
            (n < FULL_AT
              ? '. The corner reaches that accuracy at ' + FULL_AT + ' answers — ' +
                (FULL_AT - n) + ' to go.'
              : '. Enough answers behind it to trust.')
      };
    });
  }

  function axes() { return lens === 'world' ? worldAxes() : skillAxes(); }

  /* The one number the Guild ranks you on. Deliberately the world
     hexagon rather than the better of the two: the skills tally only
     started counting when this tab shipped, and a rank that fell when
     the feature arrived would be a bug with a story. */
  function rating() {
    var a = worldAxes();
    return Math.round(a.reduce(function (t, x) { return t + x.score; }, 0) / a.length);
  }

  /* ============================== the lore ==========================
     Written as the archive of a mapmakers' guild, because that is the
     job the app actually gives a student: fill in a blank world, one
     verified place at a time. */  var RANKS = [
    { at: 0,  name: 'Apprentice of the Blank Page',
      charge: 'Make a mark and be wrong in a useful direction.',
      text: 'Everyone starts with the same sheet: white, enormous, and wrong in every ' +
            'direction. The Guild hands it over without apology. Your first mark can go ' +
            'anywhere, and that is exactly the problem.' },
    { at: 12, name: 'Margin Scribe',
      charge: 'Correct one thing on somebody else’s map.',
      text: 'You have earned the right to write in the margins of other people’s maps. ' +
            'Most of what the Guild knows was once a note in a margin — a capital corrected, ' +
            'a border moved eighty miles, a name spelled the way the people there spell it. ' +
            'The archive keeps the margins and throws away the rest.' },
    { at: 25, name: 'Pacekeeper',
      charge: 'Walk the same road twice and account for the difference.',
      text: 'Before instruments, distance was counted in paces and trusted anyway. ' +
            'Pacekeepers walked the same road twice and argued about the difference. ' +
            'You are measuring now, not guessing, and the two feel almost the same from inside.' },
    { at: 40, name: 'Chartwright',
      charge: 'Fill an empty continent without opening the index.',
      text: 'A chartwright can be handed an empty continent and give it back with its ' +
            'countries in the right order. The Guild stops checking your work line by line ' +
            'at this rank and starts checking only the places you claim are difficult.' },
    { at: 55, name: 'Coastliner',
      charge: 'Draw an edge you are willing to defend.',
      text: 'Coasts are where maps are won. They bend, they argue with the sea, and no two ' +
            'surveys agree on them — measure one closely enough and it gets longer, which is ' +
            'the oldest joke in the Guild and the only one that is true. A Coastliner draws ' +
            'the line anyway and signs it.' },
    { at: 70, name: 'Meridian Warden',
      charge: 'Hold the lines nobody can see.',
      text: 'Wardens keep the agreed fictions — meridians, parallels, the dateline that bends ' +
            'round whoever asks it to. None of them exist, all of them are obeyed, and ' +
            'together they let two strangers describe the same spot and mean it.' },
    { at: 85, name: 'Guild Cartographer',
      charge: 'Produce the world, whole, from memory.',
      text: 'The last rank is the plainest title in the Guild, and it is given for one ' +
            'thing: the world, entire, from memory, with the hard parts right. There is ' +
            'nothing above it. There is only the next edition, because the world keeps ' +
            'moving and somebody has to keep up.' }
  ];

  /* Always open, because a world nobody has explained yet is just a form.
     Three paragraphs, read before anything is earned. */
  var FOUNDING = [
    'The Guild was founded by an argument. Two surveyors came back from the same coast with ' +
    'two different coasts, and rather than decide which of them was lying, the people who ' +
    'paid for the trip made them sit down and build a method.',
    'The method is unglamorous and it is the whole of the craft: go, look, write it down, ' +
    'have it checked, and be ready for the day somebody checks it again and you are the one ' +
    'who was wrong. Everything in this archive was produced that way, including the parts ' +
    'that have since been corrected.',
    'There is no secret map in the vault. The Guild’s only treasure is a world a person ' +
    'can carry in their head, and it is handed over one place at a time, to anyone who will ' +
    'do the work of learning it.'
  ];

  /* Five pages a region, sealed at a fifth, a third, a half, three
     quarters and almost all of it. Each one is an entry from the archive
     rather than a fact sheet: the app already teaches the facts, so these
     are what the facts felt like to the people who wrote them down. */
  var SEALS = [15, 35, 55, 75, 92];

  var CHAPTERS = {
    'Africa': {
      title: 'The Long Survey',
      strap: 'Fifty-four countries and a continent that will not be rushed',
      frags: [
        'The Guild’s oldest working sheet is a strip of the Nile, drawn by a surveyor who ' +
        'never once saw its mouth. He was right about the river and wrong about everything ' +
        'either side of it, which is the usual ratio.',

        'Fifty-four countries, and the archive holds a separate quarrel about each one. The ' +
        'Guild’s rule is simple and unpopular: a border drawn in a room far away is still ' +
        'a border you have to learn before you have earned an opinion about it.',

        'North of the forest the archive keeps the sand charts, which are redrawn every ' +
        'generation because the thing they describe moves. A desert the size of a continent ' +
        'does not hold still for anybody’s survey, and the Guild stopped pretending ' +
        'otherwise a long time ago.',

        'Down the eastern side the ground is splitting, slowly, into two. The rift holds the ' +
        'deepest lakes on the archive’s books and mountains close enough to the equator ' +
        'to be snowed on, which cost one surveyor his reputation until somebody went and ' +
        'looked.',

        'Three oceans around it, the largest desert on the planet across the top, rainforest ' +
        'through the middle, and a cape at the bottom where two oceans meet and neither gives ' +
        'way. Apprentices call it the Long Survey. Nobody who finishes it calls it anything ' +
        'but Africa.'
      ]
    },
    'Asia': {
      title: 'The Weight of the East',
      strap: 'The top of the world, the bottom of it, and most of the people',
      frags: [
        'The first thing the archive says about Asia is a warning about scale: whatever size ' +
        'you have drawn it, it is bigger. Two of its countries between them hold more people ' +
        'than every other continent put together.',

        'Here the Guild keeps its folder of impossible capitals — the ones that moved, the ' +
        'ones that are two cities at once, the ones whose name changed while the ink was ' +
        'drying. Learn this folder and almost nothing in the craft can surprise you again.',

        'The steppe road runs the width of the chapter, and every name on it was collected ' +
        'twice: once from the people who lived there and once from the people passing through. ' +
        'Where the two disagree the archive prints both and lets the reader do the work.',

        'From a sea lying four hundred metres below every other sea to an eight-kilometre wall ' +
        'of rock still being pushed higher each year, Asia holds the top and the bottom of the ' +
        'world. The Guild sends its best here and gets them back quieter.',

        'The chapter ends in water: two archipelagos of thousands of islands apiece, counted ' +
        'and recounted, where the number in the archive has a footnote because the tide has an ' +
        'opinion on what counts as an island.'
      ]
    },
    'Europe': {
      title: 'The Crowded Sheet',
      strap: 'More labels than room, and a border that moved while you read this',
      frags: [
        'No continent is harder to draw small. Europe fits in a corner of the world map and ' +
        'still needs more labels than the whole Pacific, so every Guild sheet of it is a fight ' +
        'between accuracy and somewhere to put the writing.',

        'The archive’s favourite page lists the states you can walk across before lunch, ' +
        'and beside it the pairs of flags nobody can tell apart. The Guild stopped setting ' +
        'those as trick questions: it was unkind, and it taught nothing.',

        'Several of its borders are rivers, which is an elegant idea until the river moves. ' +
        'One of them runs through ten countries and is called something different in most of ' +
        'them, and the archive files all the names on the same page.',

        'Fifty-odd borders redrawn inside a single century, and the peninsula still comes out ' +
        'looking like itself. The lesson the Guild takes from Europe, and prints in the front ' +
        'of every edition: a map is a date as much as a place.',

        'A peninsula of peninsulas, nowhere in it far from salt water, and a capital on nearly ' +
        'every one. Finish this chapter and the crowding stops being noise and starts being ' +
        'the point.'
      ]
    },
    'North America': {
      title: 'The Narrow Bridge',
      strap: 'Three giants, a bridge of seven, and an arc of islands',
      frags: [
        'Three enormous countries, then a bridge of seven small ones, then an arc of islands. ' +
        'Apprentices learn the three in an afternoon and spend a fortnight on the bridge and ' +
        'the arc, which is the entire purpose of the exercise.',

        'The isthmus survey is never closed. A strip of land thin enough to cut, joining two ' +
        'continents and holding two oceans apart — the Guild has never settled whether it is a ' +
        'border or a seam.',

        'The arc gets its own drawer. Every island in it is a country or belongs to one, each ' +
        'with a flag, a capital and a name longer than the space the sheet allows, and the ' +
        'Guild’s note on the drawer reads: the Caribbean is not a detail.',

        'At the top of the chapter is the lesson every apprentice learns the hard way. The ' +
        'island up there is enormous on the sheet and nothing like that size on the ground: ' +
        'flattening a sphere has to put the error somewhere, and it puts it at the poles.',

        'From an ice sheet larger than most countries down to islands you can see across, all ' +
        'filed under one heading. Finish it and you will never again say "America" and mean ' +
        'one country.'
      ]
    },
    'South America': {
      title: 'The Spine and the Green',
      strap: 'One mountain chain, one river, and the extremes between them',
      frags: [
        'A dozen countries, one mountain chain running the entire length of them, and a river ' +
        'carrying more water than the next seven put together. South America is the continent ' +
        'that is easiest to sketch and hardest to finish.',

        'Two of its capitals sit high enough that Guild surveyors were sent up in stages to ' +
        'keep from falling ill, and one country keeps its government in a city the archive ' +
        'once refused to call the capital. Both answers are accepted now. Both are correct.',

        'The driest desert on the planet and the largest rainforest on the planet, a few ' +
        'hundred miles apart with a mountain range in between doing the dividing. The archive ' +
        'files them on facing pages so nobody forgets they are neighbours.',

        'One country runs four thousand kilometres down the coast and is barely wider than a ' +
        'long day’s walk, which broke two of the Guild’s standard sheet sizes before ' +
        'somebody thought to turn the paper.',

        'The Guild teaches South America last on purpose. By the time an apprentice reaches ' +
        'it, they will believe what the archive says about it, and not before.'
      ]
    },
    'Oceania': {
      title: 'The Scattered Archive',
      strap: 'Mostly water, and the archive says so on the sheet',
      frags: [
        'Mostly water, and the Guild prints that on the sheet rather than filling the space ' +
        'with decoration. The land here is counted in atolls and specks, and the distances ' +
        'between them are measured in days.',

        'Some of these countries are too small to draw at the scale the rest of the map uses, ' +
        'so the archive marks them with a ring on the capital and a note: here, and real, and ' +
        'not a flaw in the paper.',

        'The dateline runs through this chapter, bending round whoever asks it to, so two ' +
        'islands in sight of one another can be a day apart. Wardens love this page. ' +
        'Everybody else files a complaint.',

        'An ocean with a continent in it, a long reef you can see from orbit, and a country of ' +
        'two main islands where the Guild’s southern office keeps its instruments. Past ' +
        'that there is nothing but ice and the end of the index.',

        'Navigators crossed this ocean by swell, star and the flight of birds long before ' +
        'anyone drew it, and they arrived, deliberately, and settled. The last page of the ' +
        'chapter is the Guild writing down that it was not first.'
      ]
    }
  };

  /* The skills lens gets its own shelf. Six instruments, one per question
     type, each opening in two stages — so the hexagon you are not looking
     at is still unsealing something while you work. */
  var INSTRUMENT_SEALS = [40, 80];

  var INSTRUMENTS = {
    capital: {
      title: 'The Capitals Ledger',
      frags: [
        'One line per country, in a hand that has not changed in generations: the place, and ' +
        'the room where its decisions are made. The Guild keeps it in pencil, because the ' +
        'second column moves more often than anyone expects.',

        'The back of the ledger is the interesting half — the countries with two capitals, the ' +
        'ones where the government sits apart from the courts, the ones that built a new ' +
        'capital in the middle of nowhere on purpose. The Guild marks those and accepts more ' +
        'than one answer, because the world did too.'
      ]
    },
    flag: {
      title: 'The Flag Loft',
      frags: [
        'Two hundred-odd pieces of cloth on a rail, sorted by nothing at all, because sorting ' +
        'them would give the game away. An apprentice is sent up here to fail at first, which ' +
        'is the fastest way anybody has found to learn them.',

        'The loft’s standing rule is pinned to the door: never set two flags against each ' +
        'other that only a specialist can tell apart. There are a few such pairs. The Guild ' +
        'knows exactly which, and keeps them apart out of fairness, not mercy.'
      ]
    },
    identify: {
      title: 'The Silhouette Drawer',
      frags: [
        'Countries with everything taken away — no names, no rivers, no colour, just the ' +
        'outline. Shown this way, half of them turn out to be unmistakable and the other half ' +
        'turn out to be a shape you have never once looked at properly.',

        'The drawer is how the Guild tests whether a place has actually been learnt or merely ' +
        'read about. A name can be remembered from a list. An outline has to have been looked ' +
        'at, which is a different and slower kind of knowing.'
      ]
    },
    country: {
      title: 'The Reverse Index',
      frags: [
        'The ledger read backwards: a city, and the question of which country keeps it. Guild ' +
        'clerks say this is the harder direction, and the archive’s own error rate agrees ' +
        'with them.',

        'Working backwards is what you do with a letter, a rumour or a line in a shipping ' +
        'record — you are handed the city and have to place it. Every serious piece of work in ' +
        'the archive started as somebody doing exactly this.'
      ]
    },
    flagpick: {
      title: 'The Dye Book',
      frags: [
        'Colour from the other end: the country is known, and the question is what it flies. ' +
        'The dye book sits beside the loft and is consulted twice as often, because recognising ' +
        'a flag and recalling one are not the same skill.',

        'Bound into the back are the patterns that repeat across whole regions — the shared ' +
        'bands, the crescent, the southern stars, the colours half a continent adopted in the ' +
        'same decade. Learn the families and the individuals stop being arbitrary.'
      ]
    },
    locate: {
      title: 'The Plumb Line',
      frags: [
        'Knowing the name is not knowing the place. The plumb line is the Guild’s oldest ' +
        'test and the one it respects most: put your finger on it, on a map with nothing ' +
        'written on it.',

        'Get this one instrument working and the rest of the archive rearranges itself around ' +
        'it. Names, flags and capitals stop being a list to recite and become things with ' +
        'somewhere to be.'
      ]
    }
  };

  /* ============================== render ============================ */
  function render() {
    var host = document.getElementById('view-codex');
    if (!host) return;
    var rate = rating();

    host.innerHTML =
      '<div class="portal__inner">' +
        hexSection(rate) +
        guildSection(rate) +
        archiveSection() +
      '</div>';

    wire(host);
  }

  /* ----------------------------- hexagon --------------------------- */
  /* Geometry in viewBox units. The corner labels live outside the shape,
     so the box is wider than it is tall and the radius leaves room for
     "N. America" on the right-hand points. */
  var CX = 170, CY = 158, R = 110;
  var RINGS = [0.25, 0.5, 0.75, 1];

  function point(i, frac) {
    var a = (Math.PI / 3) * i - Math.PI / 2;
    return [CX + Math.cos(a) * R * frac, CY + Math.sin(a) * R * frac];
  }
  function ring(frac) {
    var p = [];
    for (var i = 0; i < 6; i++) p.push(point(i, frac).map(round).join(','));
    return p.join(' ');
  }
  function round(n) { return Math.round(n * 10) / 10; }

  function hexSection(rate) {
    var list = axes();
    var shape = list.map(function (a, i) {
      /* a corner at nothing still needs to be on the shape, or the
         polygon collapses into a line and reads as a drawing error */
      return point(i, Math.max(0.04, a.score / 100)).map(round).join(',');
    }).join(' ');

    var dots = list.map(function (a, i) {
      var p = point(i, Math.max(0.04, a.score / 100));
      return '<circle class="hex__dot" data-i="' + i + '" cx="' + round(p[0]) + '" cy="' +
        round(p[1]) + '" r="4.5"/>';
    }).join('');

    var labels = list.map(function (a, i) {
      var p = point(i, 1.22);
      /* top and bottom corners centre; the four side corners hang off
         their own side, so a long label never crosses the shape */
      var anchor = i === 0 || i === 3 ? 'middle' : (i < 3 ? 'start' : 'end');
      return '<text class="hex__label" data-i="' + i + '" x="' + round(p[0]) + '" y="' +
        round(p[1] + 4) + '" text-anchor="' + anchor + '">' +
        W.escapeHtml(a.label) + '</text>' +
        '<text class="hex__val" data-i="' + i + '" x="' + round(p[0]) + '" y="' +
        round(p[1] + 19) + '" text-anchor="' + anchor + '">' + a.score + '</text>';
    }).join('');

    return '<section class="hex-eval" id="hex-eval">' +
      '<div class="row row--between hex-eval__head">' +
        '<div>' +
          '<span class="eyebrow">Hexagon evaluation</span>' +
          '<h1 class="hex-eval__h">' + verdictTitle(list) + '</h1>' +
        '</div>' +
        '<div class="seg seg--sm" data-onchange="codexLens">' +
          '<button data-v="world"' + (lens === 'world' ? ' class="is-active"' : '') + '>World</button>' +
          '<button data-v="skills"' + (lens === 'skills' ? ' class="is-active"' : '') + '>Skills</button>' +
        '</div>' +
      '</div>' +

      '<div class="hex-eval__body">' +
        '<div class="hex-wrap">' +
          '<svg class="hex" viewBox="0 0 340 320" role="img" aria-label="' +
            W.escapeHtml(ariaShape(list)) + '">' +
            RINGS.map(function (f) {
              return '<polygon class="hex__ring" points="' + ring(f) + '"/>';
            }).join('') +
            list.map(function (a, i) {
              var p = point(i, 1);
              return '<line class="hex__spoke" x1="' + CX + '" y1="' + CY + '" x2="' +
                round(p[0]) + '" y2="' + round(p[1]) + '"/>';
            }).join('') +
            '<polygon class="hex__fill" points="' + shape + '"/>' + dots +
            /* The rating sits in the middle of the shape, and the shape is
               whatever it is: six corners at nothing all meet at the centre.
               It was an HTML box laid over the chart with a white disc behind
               it, which collided with the fill the moment a corner came close.
               Now it is drawn in the SVG, last, with a white halo painted
               under the glyphs — so it is legible over the fill, over a dot,
               over anything, and nothing has to be punched out of the chart
               to make room for it. The word "rating" moved out to the side,
               where there is room to say what it means. */
            '<text class="hex__rate" x="' + CX + '" y="' + (CY + 12) + '" ' +
              'text-anchor="middle">' + (lens === 'world' ? rate : mean(list)) + '</text>' +
            labels +
          '</svg>' +
        '</div>' +

        '<div class="hex-side">' +
          '<span class="eyebrow">' +
            (lens === 'world' ? 'Guild rating · out of 100' : 'Skill mean · out of 100') +
          '</span>' +
          '<p class="hex-side__verdict" id="hex-verdict">' + verdict(list) + '</p>' +
          '<div class="hex-rows">' +
            list.map(function (a, i) {
              return '<button class="hex-row" data-i="' + i + '" type="button">' +
                '<span class="hex-row__n">' + W.escapeHtml(a.label) + '</span>' +
                '<span class="pbar"><span class="pbar__fill ' +
                  (a.score >= 70 ? 'pbar__fill--success' : 'pbar__fill--accent') +
                  '" style="width:' + Math.max(1, a.score) + '%"></span></span>' +
                '<span class="hex-row__v mono">' + a.score + '</span>' +
              '</button>';
            }).join('') +
          '</div>' +
          weakest(list) +
        '</div>' +
      '</div>' +
    '</section>';
  }

  function mean(list) {
    return Math.round(list.reduce(function (t, a) { return t + a.score; }, 0) / list.length);
  }

  function ariaShape(list) {
    return (lens === 'world' ? 'Progress by region' : 'Progress by skill') + ': ' +
      list.map(function (a) { return a.label + ' ' + a.score; }).join(', ') + ' out of 100.';
  }

  /* The headline names the shape rather than the score, because the shape
     is the thing a flat percentage cannot tell you. */
  function verdictTitle(list) {
    var hi = best(list), lo = worst(list);
    if (!hi.score) return 'A hexagon waiting to be drawn';
    if (hi.score - lo.score <= 12) {
      return mean(list) >= 70 ? 'Even on all six sides' : 'Level, and still filling';
    }
    return 'Strong on ' + hi.label + ', thin on ' + lo.label;
  }

  function verdict(list) {
    var hi = best(list), lo = worst(list), m = mean(list);
    if (!hi.score) {
      return lens === 'world'
        ? 'Nothing to measure yet. Answer a few questions in any mode and the corners start lifting ' +
          'on their own — this tab never asks you to do anything twice.'
        : 'No answers counted yet. Learn, Practice test, Class quiz and the games all feed this ' +
          'hexagon; whichever you play, the matching corner grows.';
    }
    var spread = hi.score - lo.score;
    return W.escapeHtml(hi.label) + ' is your strongest corner at ' + hi.score + '. ' +
      W.escapeHtml(lo.label) + ' is the shortest at ' + lo.score + ', ' +
      (spread > 40
        ? (lens === 'world' ? 'and that gap is the shape of your map right now.'
                            : 'and that gap is where the quickest points are.')
        : spread > 18 ? 'a gap worth closing before the rest goes any higher.'
        : 'which is close enough that the hexagon is holding its shape.') +
      ' The rating in the middle is the average of all six.';
  }

  function best(list) {
    return list.reduce(function (a, b) { return b.score > a.score ? b : a; }, list[0]);
  }
  function worst(list) {
    return list.reduce(function (a, b) { return b.score < a.score ? b : a; }, list[0]);
  }

  /* One button, aimed at the shortest corner. An evaluation that does not
     end in something to do is a scoreboard. */
  function weakest(list) {
    var lo = worst(list);
    if (lo.score >= 100) {
      return '<div class="hex-fix is-done">' + I.check +
        '<span>Every corner is full. There is nothing left for this tab to suggest.</span></div>';
    }
    return '<div class="hex-fix">' +
      '<div class="hex-fix__t">' +
        '<b>' + W.escapeHtml(lo.label) + '</b>' +
        '<span>' + W.escapeHtml(lo.detail) + '</span>' +
      '</div>' +
      '<button class="btn btn--accent btn--sm" id="hex-train" data-axis="' +
        W.escapeHtml(lo.key) + '">Practise this ' + I.arrowR + '</button>' +
    '</div>';
  }

  /* --------------------------- the Guild --------------------------- */
  function rankAt(rate) {
    var held = RANKS[0], next = null;
    RANKS.forEach(function (r) {
      if (rate >= r.at) held = r;
      else if (!next) next = r;
    });
    return { held: held, next: next };
  }

  function guildSection(rate) {
    var r = rankAt(rate);
    var i = RANKS.indexOf(r.held);
    return '<section class="guild">' +
      '<div class="guild__scroll">' +
        '<span class="eyebrow">The Cartographers’ Guild</span>' +
        '<h2 class="guild__rank">' + W.escapeHtml(r.held.name) + '</h2>' +
        '<p class="guild__text">' + r.held.text + '</p>' +
        '<p class="guild__charge"><span class="eyebrow">The charge</span>' +
          r.held.charge + '</p>' +
        (r.next
          ? '<div class="guild__next">' +
              '<div class="pbar"><div class="pbar__fill pbar__fill--accent" style="width:' +
                Math.round((rate / r.next.at) * 100) + '%"></div></div>' +
              '<span>' + (r.next.at - rate) + ' more on the rating to be made ' +
                W.escapeHtml(r.next.name) + '</span>' +
            '</div>'
          : '<div class="guild__next"><span>Nothing above this rank. Only the next edition.</span></div>') +
      '</div>' +
      '<ol class="guild__ladder">' +
        RANKS.map(function (x, n) {
          var state = n < i ? 'is-past' : n === i ? 'is-now' : '';
          return '<li class="' + state + '">' +
            '<span class="guild__pip">' + (n <= i ? I.check : I.lock) + '</span>' +
            '<span class="guild__lname">' + W.escapeHtml(x.name) + '</span>' +
            '<span class="guild__lat mono">' + x.at + '</span>' +
          '</li>';
        }).join('') +
      '</ol>' +
    '</section>';
  }

  /* -------------------------- the archive -------------------------- */
  /* Three shelves. The founding is always open, because a world nobody
     has explained yet is just a form to fill in. The regional chapters
     unseal off the world hexagon and the instruments off the skills one,
     so whichever lens you are working on, something is opening behind
     you on the other. */
  function archiveSection() {
    var world = {}, skill = {};
    worldAxes().forEach(function (a) { world[a.key] = a.score; });
    skillAxes().forEach(function (a) { skill[a.key] = a.score; });
    var open = 0, all = 0;

    /* Only the next page sealed says what it is waiting for. Spelling it
       out on all five turned a chapter into the same sentence printed
       five times, which reads as nothing being there at all. */
    function pages(frags, seals, score, how) {
      var said = false;
      return frags.map(function (text, i) {
        var at = seals[i];
        all += 1;
        if (score >= at) {
          open += 1;
          return '<li class="frag"><span class="frag__seal">' + I.check + '</span>' +
            '<p>' + text + '</p></li>';
        }
        var line = said
          ? 'Sealed at ' + at + '.'
          : 'Sealed at ' + at + ' — ' + W.escapeHtml(how) + ' is at ' + score + ' now, so this ' +
            'is the next page to open.';
        said = true;
        return '<li class="frag is-sealed"><span class="frag__seal">' + I.lock + '</span>' +
          '<p>' + line + '</p></li>';
      }).join('');
    }

    var regions = global.GeoData.regions.map(function (r) {
      var ch = CHAPTERS[r];
      return '<article class="chapter">' +
        '<div class="chapter__head">' +
          '<div><span class="eyebrow">' + W.escapeHtml(r) + '</span>' +
            '<h3>' + W.escapeHtml(ch.title) + '</h3>' +
            '<p class="chapter__strap">' + W.escapeHtml(ch.strap) + '</p></div>' +
          '<span class="chapter__score mono">' + world[r] + '</span>' +
        '</div>' +
        '<ul class="chapter__frags">' +
          pages(ch.frags, SEALS, world[r], r + ' on the hexagon') +
        '</ul>' +
      '</article>';
    }).join('');

    var instruments = SKILLS.map(function (sk) {
      var it = INSTRUMENTS[sk.key];
      return '<article class="chapter chapter--kit">' +
        '<div class="chapter__head">' +
          '<div><span class="eyebrow">' + W.escapeHtml(sk.label) + '</span>' +
            '<h3>' + W.escapeHtml(it.title) + '</h3>' +
            '<p class="chapter__strap">' + W.escapeHtml(sk.blurb) + '</p></div>' +
          '<span class="chapter__score mono">' + skill[sk.key] + '</span>' +
        '</div>' +
        '<ul class="chapter__frags">' +
          pages(it.frags, INSTRUMENT_SEALS, skill[sk.key], sk.label + ' on the skills hexagon') +
        '</ul>' +
      '</article>';
    }).join('');

    /* built last: the counters are filled in by the two passes above */
    return '<section class="portal__section">' +
      '<div class="row row--between" style="margin-bottom:14px">' +
        '<div><span class="eyebrow">The archive</span>' +
          '<div class="t-sm t-muted" style="margin-top:4px">' +
            open + ' of ' + all + ' pages unsealed. Every one opens on a corner of a hexagon, ' +
            'so studying is the only key.</div></div>' +
      '</div>' +

      '<article class="founding">' +
        '<span class="eyebrow">How the Guild began</span>' +
        FOUNDING.map(function (para) { return '<p>' + para + '</p>'; }).join('') +
      '</article>' +

      '<h2 class="archive__h">The regional chapters</h2>' +
      '<div class="chapters">' + regions + '</div>' +

      '<h2 class="archive__h">The instrument room</h2>' +
      '<p class="archive__note">Six instruments, one for each corner of the skills hexagon. ' +
        'These open on how you answer rather than on where in the world you have been.</p>' +
      '<div class="chapters">' + instruments + '</div>' +
    '</section>';
  }

  /* ============================== wiring ============================ */
  function wire(host) {
    if (global.UI && global.UI.wireSeg) global.UI.wireSeg(host);

    var list = axes();
    var svg = W.$('.hex', host);
    var verd = document.getElementById('hex-verdict');
    var resting = verd ? verd.innerHTML : '';

    function focus(i) {
      W.$$('[data-i]', host).forEach(function (n) {
        n.classList.toggle('is-on', +n.dataset.i === i);
      });
      if (verd && list[i]) {
        verd.innerHTML = '<b>' + W.escapeHtml(list[i].label) + ' · ' + list[i].score + '</b> ' +
          W.escapeHtml(list[i].detail);
      }
    }
    function blur() {
      W.$$('[data-i]', host).forEach(function (n) { n.classList.remove('is-on'); });
      if (verd) verd.innerHTML = resting;
    }

    W.$$('.hex-row', host).forEach(function (b) {
      b.addEventListener('mouseenter', function () { focus(+b.dataset.i); });
      b.addEventListener('mouseleave', blur);
      b.addEventListener('focus', function () { focus(+b.dataset.i); });
      b.addEventListener('blur', blur);
    });
    if (svg) {
      W.$$('.hex__dot', svg).forEach(function (d) {
        d.addEventListener('mouseenter', function () { focus(+d.dataset.i); });
        d.addEventListener('mouseleave', blur);
      });
    }

    var train = document.getElementById('hex-train');
    if (train) train.addEventListener('click', function () { practise(train.dataset.axis); });
  }

  /* Hand the shortest corner to Learn as a one-off recommendation: a
     region axis narrows the pool, a skill axis narrows the question
     types. `rec: true` keeps it out of the assignment machinery, so
     nothing here is ever handed in to a teacher. */
  function practise(key) {
    var cfg = { scope: 'all', weakFirst: true };
    if (lens === 'world') cfg.regions = [key];
    else cfg.types = [key];
    global.Assignments.run({ rec: true, mode: 'learn', config: cfg });
  }

  function setLens(v) {
    if (v === lens) return;
    lens = v === 'skills' ? 'skills' : 'world';
    render();
  }

  global.Codex = { render: render, rating: rating, setLens: setLens };
})(window);
