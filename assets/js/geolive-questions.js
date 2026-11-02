/* ------------------------------------------------------------------
   LearnGeo — GeoLive question sets

   Two ways a teacher starts a game:
     premade()   pick a ready-made set by type
     fromCodes() pick the countries yourself

   Both hand back questions in the GeoLive shape from GEOLIVE-SPEC.md:
     { kind, prompt, answer, options[4], code }

   This file does not rewrite quiz.js. It calls it. Quiz.make() already
   settles which question shape a country can actually take, and
   Quiz.distractors() already knows which wrong answers are safe, including
   the alias traps. Both were repaired once this week by combining two
   half-right rewrites; a third one here would undo that work. So the only
   things below that are new are the ones quiz.js has no opinion about:
   the GeoLive question shape, and what to do when a teacher asks for more
   questions than their picked countries can fill.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW;

  var KINDS = ['country-capital', 'capital-country', 'shape-country', 'country-map'];

  /* GeoLive kind -> the quiz.js type that builds it.

     shape-country and country-map both build from 'identify'. In quiz.js
     'locate' means clicking the country on the map, which needs no options
     at all, and GeoLive questions always carry four. So the two map kinds
     differ in how they are drawn, not in how they are answered: shape-country
     shows the outline on its own, country-map shows it shaded in place on the
     world map. Both are answered by picking a name from four. */
  var TYPE_FOR = {
    'country-capital': 'capital',
    'capital-country': 'country',
    'shape-country':   'identify',
    'country-map':     'identify'
  };

  /* and back again, for when quiz.js swaps the shape under us */
  var KIND_FOR_TYPE = {
    capital:  'country-capital',
    country:  'capital-country',
    identify: 'shape-country',
    locate:   'country-map'
  };

  /* ---------------------------------------------------------------- data */

  function countries() {
    return (global.GeoData && global.GeoData.countries) || [];
  }

  /* The spec asks for an ISO3 code so the map can shade the country. The
     dataset has no ISO3 column, and the map does not use one either:
     GeoMap.hasShape() and its shape index are both keyed on the country name.
     So the identifier that actually shades a country today is the name, and
     that is what goes in `code`.

     This reads iso3 first so that the day oy-09 adds one to data.js, every
     question starts carrying it with no change here. Until then, treat `code`
     as an opaque key: pass it back to the map, do not assume three letters,
     and do not store it in a char(3) column. Flagged to Master. */
  function codeOf(c) {
    if (!c) return '';
    if (c.iso3) return c.iso3;
    var table = global.GeoData && global.GeoData.iso3;
    if (table && table[c.name]) return table[c.name];
    return c.name;
  }

  /* Accepts whatever a teacher's picker hands over: an ISO3 code if one ever
     exists, a country name, or one of the aliases the app already accepts for
     typed answers. Anything unrecognised is dropped by the caller, not
     guessed at. */
  function resolve(code) {
    if (!code) return null;
    var list = countries();
    var want = W.tight(String(code));
    var i, c;
    for (i = 0; i < list.length; i++) {
      c = list[i];
      if (c.iso3 && W.tight(c.iso3) === want) return c;
    }
    for (i = 0; i < list.length; i++) {
      c = list[i];
      if (W.tight(c.name) === want) return c;
    }
    for (i = 0; i < list.length; i++) {
      c = list[i];
      var al = c.nameAliases || [];
      for (var j = 0; j < al.length; j++) {
        if (W.tight(al[j]) === want) return c;
      }
    }
    return null;
  }

  /* The field the visible options are drawn from, which is also the field a
     wrong answer must not clash on. Capitals are compared as capitals,
     everything else as names. */
  function optionKey(type) {
    return type === 'capital' ? 'capital' : 'name';
  }

  /* The pool a game is drawn from when nobody named specific countries.
     'un-plus' is UN members and observers, which is what a class is normally
     tested on; it leaves out the 18 territories. */
  function worldPool(scope) {
    if (!global.Quiz) return countries();
    return global.Quiz.pool({ scope: scope || 'un-plus' });
  }

  /* ----------------------------------------------------------- questions */

  function sentence(kind, c) {
    if (kind === 'country-capital') return 'What is the capital of ' + c.name + '?';
    if (kind === 'capital-country') return c.capital + ' is the capital of which country?';
    if (kind === 'shape-country')   return 'Which country has this outline?';
    return 'Which country is shaded on the map?';
  }

  /* Build one question, or null if it cannot be built at all.

     Quiz.make() does the part that matters and is easy to get wrong: it
     refuses to ask for the capital of Singapore, where the prompt hands over
     the answer, and it refuses to show the outline of Tuvalu, which has no
     polygon in the shape file. In both cases it swaps to a shape the country
     can take rather than dropping it. So the kind that comes back is not
     always the kind asked for, and the returned question says which it is. */
  function build1(kind, c, field, strict) {
    if (!global.Quiz || !c) return null;
    var type = TYPE_FOR[kind] || 'capital';

    /* Four attempts, because Quiz.distractors() draws fresh each time.

       A question with two identical options is a correctness bug, not an
       untidy one: GeoLive.reveal() counts answers keyed by the option text, so
       a repeated option collapses two counts into one key and the teacher's
       per-option numbers go quietly wrong with nothing on screen looking
       broken. oy-10 found that by reading oy-02's module against this one.

       So the rule is absolute: four distinct labels or no question. Retrying
       first means a single unlucky draw costs a redraw rather than a question,
       which matters most in the small-selection case where questions are
       scarce and, as oy-10 points out, collisions are likeliest. */
    for (var attempt = 0; attempt < 4; attempt++) {
      var q = global.Quiz.make(type, c, field, {});
      if (!q || !q.choices || q.choices.length !== 4) continue;

      /* If quiz.js kept the type we asked for, keep the kind we asked for too,
         so shape-country and country-map stay distinguishable. If it swapped,
         follow it.

         `strict` is for a set that is named after one kind. Mexico City,
         Monaco, Luxembourg and three others hand over their country's name, so
         quiz.js turns them into outline questions instead. That is the right
         call in the personal quiz, where the point is to ask the learner
         something. It is the wrong one in a set the teacher chose called
         Capitals, which should not quietly contain six outline questions.
         There are 195 countries in the pool and only a handful to skip, so a
         strict set drops them and asks someone else. */
      if (strict && q.type !== type) return null;
      var outKind = (q.type === type) ? kind : (KIND_FOR_TYPE[q.type] || kind);

      var options = q.choices.map(function (ch) { return ch.text; });
      if (options.indexOf(q.answerText) === -1) continue;

      /* Compared through W.tight(), which is stricter than reveal()'s exact
         match: it also catches "George Town" against "Georgetown", two labels
         that key separately but read as the same answer to a student. */
      var seen = {}, clash = false;
      for (var i = 0; i < options.length; i++) {
        var t = W.tight(options[i]);
        if (!t || seen[t]) { clash = true; break; }
        seen[t] = 1;
      }
      if (clash) continue;

      return {
        kind: outKind,
        prompt: sentence(outKind, q.country || c),
        answer: q.answerText,
        options: options,
        code: codeOf(q.country || c)
      };
    }
    return null;
  }

  /* What makes two questions the same question, for a player. Same country
     asked the same way. The kind is the one that came back, not the one asked
     for, because a swap can land two passes on the same question. */
  function key(q) {
    return q.code + '|' + q.kind;
  }

  /* Build up to n questions from a set of countries.

     Passes, not a flat shuffle. Pass one asks every country once, pass two
     asks them again in a different kind, and so on. That way every country is
     used before any is repeated, and when one is repeated it is never the same
     question twice.

     The teacher's countries decide what gets asked. The distractors come from
     the wider pool, because three picked countries cannot supply three wrong
     answers between them, and drawing the questions from the wider pool too is
     what used to turn "just my list" into a world test. Same two-pool split
     quiz.js settled on. */
  function assemble(picked, kinds, n, opts) {
    opts = opts || {};
    /* Wrong answers always come from the whole pool, never from the picks.

       quiz.js lets a selection of five or more supply its own distractors. For
       GeoLive that is the wrong default and oy-10 is right about why: a
       teacher who picks three countries cannot have four options at all, and
       "test them on these three" does not mean "only ever show these three".
       Quiz.distractors() already prefers the same region, so an answer in
       Europe still draws mostly European wrong answers out of the full set.
       The picks decide what is ASKED. They do not decide what is offered. */
    var field = worldPool(opts.scope);
    var use = (kinds && kinds.length ? kinds : KINDS).filter(function (k) {
      return TYPE_FOR[k];
    });
    if (!use.length) use = KINDS;

    var out = [], seen = {};

    /* Kind rotates across the countries, not across the passes.

       The first version handed pass one to the first kind, pass two to the
       second, and so on. With 195 countries and 20 questions it never reached
       pass two, so the mixed set was 35 capitals and nothing else. Offsetting
       by position instead means 20 questions out of a full pool already carry
       all four kinds, while a teacher's three countries still get a different
       kind each time round: country i on pass p is asked kind (p + i), so over
       four passes each country is asked each kind exactly once and never the
       same question twice. */
    var order = W.shuffle(picked.slice());
    var slot = {};
    order.forEach(function (c, i) { slot[c.name] = i; });

    for (var pass = 0; pass < use.length && out.length < n; pass++) {
      /* shuffled again so the running order is not identical every pass,
         but the kind comes from the country's fixed slot, not from where it
         landed this time. Rotating on the shuffled position instead let the
         same country draw the same kind twice and miss another, which cost
         two of the twelve questions a three-country game can make. */
      var round = W.shuffle(order.slice());
      for (var i = 0; i < round.length && out.length < n; i++) {
        var c = round[i];
        var q = build1(use[(pass + slot[c.name]) % use.length], c, field, !!opts.strict);
        if (!q) continue;
        var k = key(q);
        if (seen[k]) continue;
        seen[k] = 1;
        out.push(q);
      }
    }
    return out;
  }

  /* --------------------------------------------------------------- entry */

  /* Teacher picked the countries.

     Two cases worth stating, because both used to produce a broken game:

     Nothing resolved. Every code was unrecognised, or the list was empty. A
     game on the whole world beats a game with no questions, so fall back to
     the pool. This is the same guard quiz.js uses.

     More questions asked for than the picks can fill. Three countries and a
     request for twenty: four kinds gives at most twelve distinct questions,
     and some of those twelve will not exist because a country with no outline
     cannot be shown as one. So this returns what it can actually make, not
     twenty. A short game is fine. The same question asked twice in a live
     class is not, because the second time every player already knows the
     answer, and the scoreboard stops meaning anything. Callers must read
     questions.length rather than assume n. */
  function fromCodes(codes, kinds, n) {
    var want = Math.max(1, n || 10);
    var r = resolveCodes(codes);
    var picked = r.found;

    if (!picked.length) {
      /* Never an empty game. But say so, because silence here is the
         expensive kind: a teacher picks five countries, none of the codes
         resolve, and the class sits down to a quiz on the whole world with
         nothing on screen to say why. Check resolveCodes() before starting a
         game if you want to tell them first. */
      if (r.missing.length && global.console && console.warn) {
        console.warn('GeoLiveQuestions: none of these were recognised, ' +
          'falling back to a world game: ' + r.missing.join(', '));
      }
      picked = worldPool();
    }
    return assemble(picked, kinds, want);
  }

  /* Check a teacher's picks before building a game.

     Split out so the teacher screen can say "we do not know 2 of these"
     while they are still choosing, rather than discovering it when the game
     has already started. Returns the countries we know and the codes we do
     not. */
  function resolveCodes(codes) {
    var found = [], missing = [], seen = {};
    (codes || []).forEach(function (code) {
      var c = resolve(code);
      if (!c) { missing.push(String(code)); return; }
      if (seen[c.name]) return;
      seen[c.name] = 1;
      found.push(c);
    });
    return { found: found, missing: missing };
  }

  /* ------------------------------------------------------------- pictures

     Two of the four kinds are a picture with a question under it: "Which
     country has this outline?" and "Which country is shaded on the map?".
     Until now neither screen drew the picture, so both kinds were asked as
     a sentence pointing at nothing, and the Shapes set could not be played.

     The outlines come from WorldMap, which already projects and simplifies
     every country once for the study centre. Its whole-world SVG is about
     155 KB, far too much to re-insert on a phone every time a classmate
     answers, so it is read once into name -> { d, box } and each picture is
     a small SVG of only the paths it needs. Built once per country, cached.

     picture(q) returns markup straight away. If the outlines have not
     loaded yet it returns an empty frame, and paintPictures(root) fills any
     empty frame in when they land, so no screen has to wait or re-render. */

  var shapeIndex = null, shapeLoading = null, pictureCache = {};

  function attr(tag, name) {
    var m = new RegExp('\\s' + name + '="([^"]*)"').exec(tag);
    return m ? m[1] : '';
  }

  function boxOf(d) {
    var nums = String(d).match(/-?\d+(\.\d+)?/g) || [];
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (var i = 0; i + 1 < nums.length; i += 2) {
      var x = +nums[i], y = +nums[i + 1];
      /* a ring WorldMap redrew a world along sits off the board: it is
         clipped there and has no business stretching the frame here */
      if (x < 0 || x > WORLD_W) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    return isFinite(x0) ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
  }

  var WORLD_W = 760, WORLD_H = 300;

  /* The frame a country is drawn in. Not the box around every last ring:
     Alaska and Hawaii put the United States across half the world, and
     the frame around all of it drew the mainland as a sliver. So: the
     biggest landmass, plus whatever lies close enough to it to read as part
     of the same shape. Japan keeps its islands; the US keeps its lower 48. */
  function focusBox(d) {
    var parts = String(d).split('M').filter(Boolean).map(function (p) { return boxOf('M' + p); })
      .filter(Boolean);
    if (!parts.length) return null;
    var main = parts[0];
    parts.forEach(function (b) { if (b.w * b.h > main.w * main.h) main = b; });
    var reach = Math.max(main.w, main.h) * 0.45 + 2;
    var near = { x: main.x - reach, y: main.y - reach, w: main.w + reach * 2, h: main.h + reach * 2 };
    var x0 = main.x, y0 = main.y, x1 = main.x + main.w, y1 = main.y + main.h;
    parts.forEach(function (b) {
      if (!overlaps(b, near)) return;
      x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y);
      x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h);
    });
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  function buildIndex() {
    var WM = global.WorldMap;
    if (!WM || !WM.ready) return null;
    if (WM.size) { WORLD_W = WM.size.w; WORLD_H = WM.size.h; }
    var src = WM.svg({ mode: 'pale' }), out = {};
    var re = /<(path|circle)\b[^>]*>/g, m;
    while ((m = re.exec(src))) {
      var tag = m[0], name = attr(tag, 'data-c');
      if (!name) continue;
      if (m[1] === 'path') {
        var d = attr(tag, 'd');
        out[name] = { d: d, box: boxOf(d), focus: focusBox(d) };
      } else {
        var cx = +attr(tag, 'cx'), cy = +attr(tag, 'cy');
        out[name] = { dot: true, box: { x: cx - 1, y: cy - 1, w: 2, h: 2 } };
      }
    }
    return out;
  }

  function loadShapes() {
    if (shapeIndex) return Promise.resolve(shapeIndex);
    if (shapeLoading) return shapeLoading;
    var WM = global.WorldMap;
    if (!WM || typeof WM.load !== 'function') return Promise.resolve(null);
    shapeLoading = Promise.resolve(WM.load()).then(function () {
      shapeIndex = buildIndex();
      return shapeIndex;
    })['catch'](function () { return null; });
    return shapeLoading;
  }

  function hasPicture(q) {
    return !!q && (q.kind === 'shape-country' || q.kind === 'country-map');
  }

  function fmt(n) { return Math.round(n * 10) / 10; }

  function frameAround(box, minW, ratio, pad) {
    var w = Math.max(box.w * pad, minW), h = Math.max(box.h * pad, minW / ratio);
    if (w / h < ratio) w = h * ratio; else h = w / ratio;
    var x = box.x + box.w / 2 - w / 2, y = box.y + box.h / 2 - h / 2;
    return { x: x, y: y, w: w, h: h };
  }

  function overlaps(a, b) {
    return a && b && a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function drawPicture(q) {
    var c = resolve(q.code) || resolve(q.answer);
    if (!c || !shapeIndex) return null;
    var key = q.kind + '|' + c.name;
    if (pictureCache[key]) return pictureCache[key];

    var esc = W.escapeHtml;
    var me = shapeIndex[esc(c.name)] || shapeIndex[c.name];
    if (!me || !me.box) return null;
    var svg, as = 'map';

    /* An island nation a few map units across simplifies to a handful of
       points, and its "outline" is a spike. Those are shown where they are
       instead, ringed on the map, which is still a fair question. */
    var f0 = me.focus || me.box;
    var outline = me.d && Math.max(f0.w, f0.h) >= 4;

    if (q.kind === 'shape-country' && outline) {
      /* the outline alone, filling a square frame */
      as = 'shape';
      var f = frameAround(me.focus || me.box, 1, 1.35, 1.12);
      svg = '<svg class="gl-pic__svg" viewBox="' + fmt(f.x) + ' ' + fmt(f.y) + ' ' + fmt(f.w) + ' ' + fmt(f.h) +
        '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Outline of the country in question">' +
        '<path class="gl-pic__hit" vector-effect="non-scaling-stroke" d="' + me.d + '"/></svg>';
    } else {
      /* in place, with its neighbours for context. A microstate that is a
         dot at this scale also lands here, outline question or not, since
         an outline of a dot is no question at all. */
      var g, paths, near;
      /* Widen until there is land in the picture to get a bearing from. A
         ring in empty ocean is not a question anyone can answer. */
      /* The flat map ends at the date line and the Pacific does not, so a
         frame that hangs off one edge borrows the land from the other, drawn
         a world's width along. Only real landmasses count as a bearing:
         a ring among specks is still a ring in empty ocean. */
      [70, 150, 260, 400].some(function (min) {
        g = frameAround(me.focus || me.box, min, 1.6, 2.6);
        paths = ''; near = 0;
        Object.keys(shapeIndex).forEach(function (n) {
          var s = shapeIndex[n], b = s.focus || s.box;
          if (s === me || !s.d || !b) return;
          [0, WORLD_W, -WORLD_W].forEach(function (shift) {
            var moved = { x: b.x + shift, y: b.y, w: b.w, h: b.h };
            if (!overlaps(moved, g)) return;
            if (Math.max(b.w, b.h) >= 6) near++;
            paths += '<path class="gl-pic__land" vector-effect="non-scaling-stroke"' +
              (shift ? ' transform="translate(' + shift + ' 0)"' : '') + ' d="' + s.d + '"/>';
          });
        });
        return near >= 2;
      });
      var at = me.focus || me.box;
      var cx = at.x + at.w / 2, cy = at.y + at.h / 2;
      var mark = me.d
        ? '<path class="gl-pic__hit" vector-effect="non-scaling-stroke" d="' + me.d + '"/>'
        : '';
      /* small countries vanish at this zoom, so a ring says where to look */
      var small = at.w < g.w * 0.06 && at.h < g.h * 0.06;
      if (small || !me.d) {
        mark += '<circle class="gl-pic__ring" cx="' + fmt(cx) + '" cy="' + fmt(cy) + '" r="' + fmt(g.w * 0.035) + '"/>' +
                '<circle class="gl-pic__dot" cx="' + fmt(cx) + '" cy="' + fmt(cy) + '" r="' + fmt(g.w * 0.009) + '"/>';
      }
      svg = '<svg class="gl-pic__svg" viewBox="' + fmt(g.x) + ' ' + fmt(g.y) + ' ' + fmt(g.w) + ' ' + fmt(g.h) +
        '" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Map with the country in question shaded">' +
        paths + mark + '</svg>';
    }
    pictureCache[key] = { svg: svg, as: as };
    return pictureCache[key];
  }

  /* Markup for a question's picture, or '' for a kind that has none. */
  function picture(q) {
    if (!hasPicture(q)) return '';
    var pic = shapeIndex ? drawPicture(q) : null;
    if (!pic) loadShapes();
    var kind = pic ? pic.as : (q.kind === 'shape-country' ? 'shape' : 'map');
    return '<div class="gl-pic gl-pic--' + kind + (pic ? '' : ' is-loading') + '"' +
      ' data-gl-q="' + W.escapeHtml(JSON.stringify({ kind: q.kind, code: q.code, answer: q.answer })) + '">' +
      (pic ? pic.svg : '') + '</div>';
  }

  /* Fill in any picture frame drawn before the outlines had loaded. */
  function paintPictures(root) {
    if (!root || !root.querySelectorAll) return;
    var empty = root.querySelectorAll('.gl-pic.is-loading');
    if (!empty.length) return;
    loadShapes().then(function () {
      Array.prototype.forEach.call(empty, function (el) {
        if (!el.isConnected) return;
        var q;
        try { q = JSON.parse(el.getAttribute('data-gl-q')); } catch (e) { return; }
        var pic = drawPicture(q);
        if (!pic) { el.classList.remove('is-loading'); el.hidden = true; return; }
        el.innerHTML = pic.svg;
        el.className = 'gl-pic gl-pic--' + pic.as;
      });
    });
  }

  /* The mark each answer slot carries, the same on the phone and the
     projector, so "the triangle" means one answer to the whole room. A
     shape as well as a colour, because one child in twelve cannot tell
     the green tile from the amber one. */
  var GLYPHS = [
    '<path d="M12 3.2 22 20.4H2Z"/>',
    '<path d="M12 1.8 22.2 12 12 22.2 1.8 12Z"/>',
    '<circle cx="12" cy="12" r="9.6"/>',
    '<rect x="3" y="3" width="18" height="18" rx="2.4"/>'
  ];
  function glyph(i) {
    return '<svg class="gl-glyph" viewBox="0 0 24 24" aria-hidden="true">' + (GLYPHS[i] || GLYPHS[0]) + '</svg>';
  }

  /* The ready-made sets. */
  function premade() {
    return [
      {
        id: 'capitals',
        label: 'Capitals',
        note: 'A country, name its capital.',
        build: function (n) { return assemble(worldPool(), ['country-capital'], n || 10, { strict: true }); }
      },
      {
        id: 'countries-from-capitals',
        label: 'Countries from capitals',
        note: 'A capital city, name the country.',
        build: function (n) { return assemble(worldPool(), ['capital-country'], n || 10, { strict: true }); }
      },
      {
        id: 'shapes',
        label: 'Countries from their shape',
        note: 'An outline, name the country.',
        build: function (n) { return assemble(worldPool(), ['shape-country'], n || 10, { strict: true }); }
      },
      {
        id: 'mixed',
        label: 'Mixed',
        note: 'All four kinds, shuffled.',
        build: function (n) { return assemble(worldPool(), KINDS, n || 10); }
      }
    ];
  }

  global.GeoLiveQuestions = {
    kinds: KINDS,
    premade: premade,
    fromCodes: fromCodes,
    /* exposed so oy-10 can test the pieces, and so the teacher screen can
       show a country's code without rebuilding a question */
    codeOf: codeOf,
    resolve: resolve,
    resolveCodes: resolveCodes,
    /* the outline or map a shape or map question is asked about */
    glyph: glyph,
    hasPicture: hasPicture,
    picture: picture,
    paintPictures: paintPictures,
    loadShapes: loadShapes
  };
})(window);
