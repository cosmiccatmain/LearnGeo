/* ------------------------------------------------------------------
   LearnGeo — question generator

   Four question shapes, all built from the same pool:
     capital   country -> capital
     country   capital -> country
     locate    click the named country on the map
     identify  a country is shaded -> which one is it?
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW;

  var TYPES = {
    capital:  { id: 'capital',  label: 'Country → Capital',    icon: 'pin' },
    country:  { id: 'country',  label: 'Capital → Country',    icon: 'globe' },
    locate:   { id: 'locate',   label: 'Locate on map',        icon: 'target' },
    identify: { id: 'identify', label: 'Identify the country', icon: 'layers' }
  };

  /* Filter the dataset down to what the learner asked for. */
  function pool(opts) {
    opts = opts || {};
    var list = global.GeoData.countries.slice();

    /* An explicit list wins over every other filter. This is what custom
       tests and teacher assignments hand us. */
    if (opts.countries && opts.countries.length) {
      var want = {};
      opts.countries.forEach(function (n) { want[n] = 1; });
      list = list.filter(function (c) { return want[c.name]; });
      if (opts.weakFirst) list.sort(function (a, b) { return score(a) - score(b); });
      return list;
    }

    if (opts.regions && opts.regions.length) {
      list = list.filter(function (c) { return opts.regions.indexOf(c.region) !== -1; });
    }
    if (opts.scope === 'un') list = list.filter(function (c) { return c.status === 0; });
    else if (opts.scope === 'un-plus') list = list.filter(function (c) { return c.status !== 2; });
    if (opts.weakFirst) {
      list.sort(function (a, b) { return score(a) - score(b); });
    }
    return list;
  }

  /* Lower score = shakier = show sooner. */
  function score(c) {
    var m = W.state.mastery[c.name];
    if (!m) return -1;                       /* unseen sits just ahead of known */
    return m.box * 10 - m.w * 3 + Math.random();
  }

  var ALIAS_KEY = { capital: 'capitalAliases', name: 'nameAliases' };

  /* A wrong answer has to be plainly wrong. Comparing the raw strings is not
     enough: "George Town" and "Georgetown" are different countries' capitals
     but the same answer to a learner, and Jerusalem sits in Palestine's
     capitalAliases as well as being Israel's capital. Compare the way the app
     marks typed answers, and look at the aliases on both sides. */
  function clashes(c, answer, key) {
    if (c.name === answer.name) return true;
    var subject = W.tight(answer[key]);
    var cand = W.tight(c[key]);
    if (subject === cand) return true;
    var ak = ALIAS_KEY[key];
    var theirs = (ak && c[ak]) || [];
    var ours = (ak && answer[ak]) || [];
    for (var i = 0; i < theirs.length; i++) if (W.tight(theirs[i]) === subject) return true;
    for (var j = 0; j < ours.length; j++) if (W.tight(ours[j]) === cand) return true;
    return false;
  }

  /* Distractors: prefer same region so the choice is actually a test. */
  function distractors(answer, all, n, key) {
    var same = all.filter(function (c) {
      return c.region === answer.region && !clashes(c, answer, key);
    });
    var other = all.filter(function (c) {
      return c.region !== answer.region && !clashes(c, answer, key);
    });
    var out = W.sample(same, n);
    if (out.length < n) out = out.concat(W.sample(other, n - out.length));
    /* de-duplicate on the visible label */
    var seen = {}, uniq = [];
    out.forEach(function (c) { if (!seen[W.tight(c[key])]) { seen[W.tight(c[key])] = 1; uniq.push(c); } });
    var i = 0;
    while (uniq.length < n && i < other.length) {
      if (!seen[W.tight(other[i][key])]) { seen[W.tight(other[i][key])] = 1; uniq.push(other[i]); }
      i++;
    }
    return uniq.slice(0, n);
  }

  /* Not every country can take every question shape.

     Tuvalu and Gibraltar have no polygon in the shape file, so there is
     nothing to shade or click and "locate" / "identify" cannot be answered.

     And for 17 places the prompt hands over the answer, because the capital
     is the country's name or holds it: Singapore, Monaco, Mexico City,
     Kuwait City and so on. Those cannot use "capital" / "country".

     So swap the shape rather than ask the question. */
  function givesAway(c) {
    var n = W.tight(c.name), p = W.tight(c.capital);
    if (!n || !p) return false;
    return n === p || p.indexOf(n) !== -1 || n.indexOf(p) !== -1;
  }

  function mappable(c) {
    var M = global.GeoMap;
    /* shapes still loading: say yes rather than hold the question up */
    if (!M || !M.shapesReady || !M.shapesReady()) return true;
    return M.hasShape(c.name);
  }

  function fits(type, c) {
    if (type === 'locate' || type === 'identify') return mappable(c);
    if (type === 'capital' || type === 'country') return !givesAway(c);
    return true;
  }

  function fitType(type, c) {
    if (fits(type, c)) return type;
    var alts = (type === 'locate' || type === 'identify')
      ? ['capital', 'country'] : ['identify', 'locate'];
    for (var i = 0; i < alts.length; i++) if (fits(alts[i], c)) return alts[i];
    /* Gibraltar is the one place that fails both tests: no outline, and its
       own capital. A question that gives the answer away still beats one that
       cannot be answered at all, so the map shapes give way. */
    return (type === 'locate' || type === 'identify') ? alts[0] : type;
  }

  function make(type, answer, all, opts) {
    opts = opts || {};
    type = fitType(type, answer);
    var q = {
      type: type,
      country: answer,
      note: answer.note,
      typed: !!opts.typed && (type === 'capital' || type === 'country'),
      choices: null
    };

    if (type === 'capital') {
      q.prompt = 'What is the capital of';
      q.subject = answer.name;
      q.sub = answer.region;
      q.answerText = answer.capital;
      q.aliases = answer.capitalAliases;
      if (!opts.typed) q.choices = build(answer, all, 'capital');
    } else if (type === 'country') {
      q.prompt = 'Which country has the capital';
      q.subject = answer.capital;
      q.sub = answer.region;
      q.answerText = answer.name;
      q.aliases = answer.nameAliases;
      if (!opts.typed) q.choices = build(answer, all, 'name');
    } else if (type === 'locate') {
      q.prompt = 'Find this country on the map';
      q.subject = answer.name;
      q.sub = 'Click the country itself';
      q.answerText = answer.name;      /* you click the country, so the answer is its name */
      q.mapChoices = W.shuffle([answer].concat(distractors(answer, all, 4, 'name')));
    } else if (type === 'identify') {
      q.prompt = 'The shaded country on the map is';
      q.subject = 'Which country?';
      q.sub = 'Look at the map';
      q.answerText = answer.name;
      q.aliases = answer.nameAliases;
      q.choices = build(answer, all, 'name');
      q.revealOnMap = true;
    }
    return q;

    function build(ans, allList, key) {
      var opts4 = W.shuffle([ans].concat(distractors(ans, allList, 3, key)));
      return opts4.map(function (c) {
        return { text: c[key], correct: c.name === ans.name, country: c };
      });
    }
  }

  /* Build a full sequence of questions for a session. */
  function generate(config) {
    var all = pool({ regions: config.regions, scope: config.scope, countries: config.countries });
    /* A tiny pool has nowhere to draw four wrong answers from, so widen it —
       but only for the wrong answers. The questions themselves stay on the
       countries that were asked for, which is the whole point of a teacher
       assignment, "Only my list", or a weakest-places practice run. */
    var source = all;
    if (all.length < 5) all = pool({ scope: config.scope });

    var ordered = config.weakFirst
      ? pool({ regions: config.regions, scope: config.scope, countries: config.countries, weakFirst: true })
      : W.shuffle(source);

    var types = config.types && config.types.length ? config.types : ['capital'];
    var n = Math.min(config.count || 20, ordered.length);
    var picked = ordered.slice(0, n);
    if (config.shuffleAfterWeighting !== false) picked = W.shuffle(picked);

    return picked.map(function (c, i) {
      var t = types[i % types.length];
      /* make() settles the final shape and whether it can be typed */
      return make(t, c, all, { typed: config.typed });
    });
  }

  function grade(q, given) {
    if (q.typed) return W.matches(given, q.answerText, q.aliases);
    return given === q.answerText;
  }

  global.Quiz = {
    types: TYPES, pool: pool, make: make, generate: generate,
    grade: grade, distractors: distractors
  };
})(window);
