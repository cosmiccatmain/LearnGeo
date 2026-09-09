/* ------------------------------------------------------------------
   LearnGeo — question generator

   Four question shapes, all built from the same pool:
     capital   country -> capital
     country   capital -> country
     locate    click the right capital pin on the map
     identify  a pin is highlighted -> whose capital is it?
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW;

  var TYPES = {
    capital:  { id: 'capital',  label: 'Country → Capital', icon: 'pin' },
    country:  { id: 'country',  label: 'Capital → Country', icon: 'globe' },
    locate:   { id: 'locate',   label: 'Locate on map',     icon: 'target' },
    identify: { id: 'identify', label: 'Identify the pin',  icon: 'layers' }
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

  /* Distractors: prefer same region so the choice is actually a test. */
  function distractors(answer, all, n, key) {
    var same = all.filter(function (c) {
      return c.name !== answer.name && c.region === answer.region && c[key] !== answer[key];
    });
    var other = all.filter(function (c) {
      return c.name !== answer.name && c.region !== answer.region && c[key] !== answer[key];
    });
    var out = W.sample(same, n);
    if (out.length < n) out = out.concat(W.sample(other, n - out.length));
    /* de-duplicate on the visible label */
    var seen = {}, uniq = [];
    out.forEach(function (c) { if (!seen[c[key]]) { seen[c[key]] = 1; uniq.push(c); } });
    var i = 0;
    while (uniq.length < n && i < other.length) {
      if (!seen[other[i][key]]) { seen[other[i][key]] = 1; uniq.push(other[i]); }
      i++;
    }
    return uniq.slice(0, n);
  }

  function make(type, answer, all, opts) {
    opts = opts || {};
    var q = {
      type: type,
      country: answer,
      note: answer.note,
      typed: !!opts.typed,
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
      q.sub = 'Click the country itself, not a pin';
      q.answerText = answer.name;      /* you click the country, so the answer is its name */
      q.mapChoices = W.shuffle([answer].concat(distractors(answer, all, 4, 'name')));
    } else if (type === 'identify') {
      q.prompt = 'The highlighted pin is the capital of';
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
    if (all.length < 5) all = pool({ scope: config.scope });

    var ordered = config.weakFirst
      ? pool({ regions: config.regions, scope: config.scope, countries: config.countries, weakFirst: true })
      : W.shuffle(all);

    var types = config.types && config.types.length ? config.types : ['capital'];
    var n = Math.min(config.count || 20, ordered.length);
    var picked = ordered.slice(0, n);
    if (config.shuffleAfterWeighting !== false) picked = W.shuffle(picked);

    return picked.map(function (c, i) {
      var t = types[i % types.length];
      return make(t, c, all, { typed: config.typed && (t === 'capital' || t === 'country') });
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
