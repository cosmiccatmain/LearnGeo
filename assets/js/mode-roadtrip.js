/* ------------------------------------------------------------------
   LearnGeo — Road trip mode (LEA-78).

   Curated short quiz packs that match the homepage pitch “for road
   trips.” Passenger-friendly: multiple choice, instant feedback, no
   long setup. Reuses Quiz.generate / W.award so mastery still counts.

   Reachable from the app nav (Road trips) and the Home mode grid.
   Games stays in the nav — this does not replace it.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons;

  /* Each pack is a fixed country list. Counts stay short so a pack fits
     a rest stop or a stretch of highway. Types rotate capital / country /
     flag so it feels like car trivia, not a map exam. */
  var PACKS = [
    {
      id: 'grand-tour',
      title: 'European Grand Tour',
      blurb: 'Capitals along the classic loop — Paris to Prague and back.',
      meta: '10 questions · ~4 min',
      minutes: 4,
      accent: '#1B4DFF',
      countries: ['France', 'Italy', 'Spain', 'Germany', 'Switzerland',
        'Austria', 'Belgium', 'Netherlands', 'Portugal', 'Czechia'],
      types: ['capital', 'country', 'flag', 'flagpick'],
      count: 10
    },
    {
      id: 'mediterranean',
      title: 'Mediterranean Coast',
      blurb: 'Sea-side capitals from Iberia to the Maghreb and the Aegean.',
      meta: '10 questions · ~4 min',
      minutes: 4,
      accent: '#0E7490',
      countries: ['Spain', 'France', 'Italy', 'Greece', 'Turkey',
        'Egypt', 'Morocco', 'Tunisia', 'Croatia', 'Albania'],
      types: ['capital', 'country', 'flag'],
      count: 10
    },
    {
      id: 'nordic',
      title: 'Nordic Drive',
      blurb: 'Fjords, Baltic ferries, and northern capitals.',
      meta: '8 questions · ~3 min',
      minutes: 3,
      accent: '#0369A1',
      countries: ['Norway', 'Sweden', 'Finland', 'Denmark', 'Iceland',
        'Estonia', 'Latvia', 'Lithuania'],
      types: ['capital', 'country', 'flag'],
      count: 8
    },
    {
      id: 'pan-american',
      title: 'Pan-American',
      blurb: 'North to south along the Americas — border hops and long hauls.',
      meta: '10 questions · ~4 min',
      minutes: 4,
      accent: '#B45309',
      countries: ['Canada', 'United States', 'Mexico', 'Guatemala', 'Costa Rica',
        'Colombia', 'Peru', 'Chile', 'Argentina', 'Brazil'],
      types: ['capital', 'country', 'flag', 'flagpick'],
      count: 10
    },
    {
      id: 'silk-road',
      title: 'Silk Road',
      blurb: 'Overland Asia — caravanserai capitals and mountain passes.',
      meta: '10 questions · ~4 min',
      minutes: 4,
      accent: '#9A3412',
      countries: ['Turkey', 'Iran', 'Uzbekistan', 'Kazakhstan', 'China',
        'India', 'Pakistan', 'Afghanistan', 'Kyrgyzstan', 'Tajikistan'],
      types: ['capital', 'country', 'flag'],
      count: 10
    },
    {
      id: 'east-africa',
      title: 'East Africa Overland',
      blurb: 'Safari-route capitals down the Great Rift.',
      meta: '8 questions · ~3 min',
      minutes: 3,
      accent: '#166534',
      countries: ['Kenya', 'Tanzania', 'Uganda', 'Ethiopia', 'Rwanda',
        'Burundi', 'Malawi', 'Mozambique'],
      types: ['capital', 'country', 'flag'],
      count: 8
    },
    {
      id: 'pacific-rim',
      title: 'Pacific Rim',
      blurb: 'Island hops and coastal megacities around the Pacific.',
      meta: '8 questions · ~3 min',
      minutes: 3,
      accent: '#6D28D9',
      countries: ['Japan', 'South Korea', 'China', 'Philippines', 'Indonesia',
        'Australia', 'New Zealand', 'Vietnam'],
      types: ['capital', 'country', 'flag', 'flagpick'],
      count: 8
    },
    {
      id: 'pit-stop',
      title: 'Pit stop',
      blurb: 'A worldwide warm-up — eight classics before the next exit.',
      meta: '8 questions · ~3 min',
      minutes: 3,
      accent: '#BE123C',
      countries: ['United Kingdom', 'France', 'Japan', 'Brazil', 'Egypt',
        'Australia', 'Canada', 'South Africa'],
      types: ['capital', 'country', 'flag'],
      count: 8
    }
  ];

  var run = null; /* { pack, qs, i, right[], given[], answered } */

  function host() { return document.getElementById('view-roadtrip'); }
  function esc(s) { return W.escapeHtml(String(s == null ? '' : s)); }
  function packById(id) {
    for (var i = 0; i < PACKS.length; i++) if (PACKS[i].id === id) return PACKS[i];
    return null;
  }
  function active() { return !!(run && run.phase === 'running'); }

  function start() {
    if (run && run.phase === 'running') renderQuestion();
    else if (run && run.phase === 'done') renderDone();
    else renderHub();
  }

  function abandon() {
    run = null;
  }

  /* ================================ hub ============================== */
  function bestKey(id) { return 'roadtrip.best.' + id; }

  function bestScore(id) {
    try {
      var n = parseInt(global.localStorage.getItem(bestKey(id)), 10);
      return n >= 0 ? n : null;
    } catch (e) { return null; }
  }

  function saveBest(id, score, total) {
    var prev = bestScore(id);
    if (prev != null && prev >= score) return;
    try { global.localStorage.setItem(bestKey(id), String(score)); } catch (e) {}
    /* also stash total so the hub can say 8/10 */
    try { global.localStorage.setItem(bestKey(id) + '.of', String(total)); } catch (e) {}
  }

  function bestOf(id) {
    try {
      var n = parseInt(global.localStorage.getItem(bestKey(id) + '.of'), 10);
      return n > 0 ? n : null;
    } catch (e) { return null; }
  }

  function renderHub() {
    var el = host();
    if (!el) return;
    run = null;
    el.innerHTML =
      '<div class="rt">' +
        '<div class="rt__hero">' +
          '<div class="rt__eyebrow">' + (I.car || I.globe || '') +
            ' Road trips</div>' +
          '<h1>Short packs for the road</h1>' +
          '<p>Curated capital and flag quizzes — five to ten questions, instant ' +
            'answers, no setup. Made for the homepage pitch: <em>LearnGeo for road trips.</em></p>' +
        '</div>' +
        '<div class="rt__grid">' + PACKS.map(packCard).join('') + '</div>' +
        '<p class="rt__note">Multiple choice only. Progress still counts toward mastery, XP, and diamonds. ' +
          'Games stays in the nav — this is a study pack, not an arcade mode.</p>' +
      '</div>';

    W.$$('[data-pack]', el).forEach(function (btn) {
      btn.addEventListener('click', function () { begin(btn.getAttribute('data-pack')); });
    });
  }

  function packCard(p) {
    var best = bestScore(p.id);
    var of = bestOf(p.id) || p.count;
    var score = best == null
      ? '<span class="rt__best t-muted">Not tried yet</span>'
      : '<span class="rt__best">Best <b class="mono">' + best + '/' + of + '</b></span>';
    return '<article class="rt-card" style="--rt-accent:' + esc(p.accent) + '">' +
      '<div class="rt-card__top">' +
        '<h3>' + esc(p.title) + '</h3>' +
        '<span class="rt-card__mins mono">' + p.minutes + ' min</span>' +
      '</div>' +
      '<p>' + esc(p.blurb) + '</p>' +
      '<div class="rt-card__foot">' +
        '<span class="rt-card__meta">' + esc(p.meta) + '</span>' + score +
      '</div>' +
      '<button type="button" class="btn btn--accent btn--block" data-pack="' + esc(p.id) + '">' +
        'Start pack ' + (I.arrowR || '') + '</button>' +
    '</article>';
  }

  /* ============================== runner ============================= */
  function begin(packId) {
    var pack = packById(packId);
    if (!pack || !global.Quiz) return;
    var qs = global.Quiz.generate({
      countries: pack.countries.slice(),
      types: pack.types.slice(),
      count: pack.count,
      typed: false,
      weakFirst: false
    });
    if (!qs.length) {
      W.toast('Empty pack', 'No questions could be built for that route.', I.info, 3200);
      return;
    }
    run = {
      phase: 'running',
      pack: pack,
      qs: qs,
      i: 0,
      right: qs.map(function () { return false; }),
      given: qs.map(function () { return null; }),
      answered: false
    };
    renderQuestion();
  }

  function renderQuestion() {
    var el = host();
    if (!el || !run) return;
    var q = run.qs[run.i];
    var pack = run.pack;
    var pct = Math.round((run.i / run.qs.length) * 100);

    el.innerHTML =
      '<div class="rt rt--run">' +
        '<div class="rt-runbar">' +
          '<button type="button" class="btn btn--ghost btn--sm" id="rt-leave">' +
            (I.arrowL || '') + ' Packs</button>' +
          '<div class="rt-runbar__title">' +
            '<b>' + esc(pack.title) + '</b>' +
            '<span class="mono">Q' + (run.i + 1) + '/' + run.qs.length + '</span>' +
          '</div>' +
          '<div class="grow"></div>' +
        '</div>' +
        '<div class="rt-progress"><div class="rt-progress__fill" style="width:' + pct + '%"></div></div>' +
        '<div class="rt-q">' +
          '<div class="qmeta">' +
            '<span class="eyebrow">' + esc((global.Quiz.types[q.type] || {}).label || q.type) + '</span>' +
            '<span class="eyebrow">Road trip</span>' +
          '</div>' +
          '<div class="qprompt">' + esc(q.prompt) + '</div>' +
          '<div class="qsubject">' + global.Quiz.subjectHtml(q) + '</div>' +
          '<div class="' + global.Quiz.optionsClass(q) + '" id="rt-opts"></div>' +
          '<div id="rt-fb"></div>' +
        '</div>' +
      '</div>';

    var opts = W.$('#rt-opts', el);
    if (opts && q.choices) {
      q.choices.forEach(function (c, i) {
        var b = W.el('button', 'option');
        b.dataset.i = String(i);
        b.innerHTML =
          '<span class="option__key mono">' + (i + 1) + '</span>' +
          '<span class="option__text">' + global.Quiz.choiceHtml(q, c) + '</span>' +
          '<span class="option__mark">' + (I.check || '') + '</span>';
        b.addEventListener('click', function () { pick(i); });
        opts.appendChild(b);
      });
    }

    W.$('#rt-leave', el).addEventListener('click', function () {
      if (active() && !global.confirm('Leave this road-trip pack? This run will be lost.')) return;
      abandon();
      renderHub();
    });
  }

  function pick(idx) {
    if (!run || run.phase !== 'running' || run.answered) return;
    var q = run.qs[run.i];
    var choice = q.choices && q.choices[idx];
    if (!choice) return;
    var given = choice.text;
    var correct = !!global.Quiz.grade(q, given);
    run.answered = true;
    run.given[run.i] = given;
    run.right[run.i] = correct;

    var gains = W.award(correct, { country: q.country.name, type: q.type });
    W.save();
    if (global.UI && global.UI.refreshHud) global.UI.refreshHud();

    var el = host();
    var opts = W.$$('.option', el);
    opts.forEach(function (n, i) {
      n.disabled = true;
      var c = q.choices[i];
      if (c && c.text === q.answerText) n.classList.add('is-right');
      if (i === idx && !correct) n.classList.add('is-wrong');
    });

    var fb = W.$('#rt-fb', el);
    if (fb) {
      var detail = correct
        ? '<p>' + esc(q.country.capital) + ' is the capital of ' + esc(q.country.name) + '.</p>'
        : '<p>The answer is <b>' + esc(q.answerText) + '</b>.</p>';
      var chips = correct
        ? '<div class="feedback__gain">' +
            '<span class="chip chip--xp mono">+' + gains.xp + ' XP</span>' +
            '<span class="chip chip--gem mono">' + W.gem(gains.gems) + '</span>' +
          '</div>'
        : '';
      fb.innerHTML =
        '<div class="feedback feedback--' + (correct ? 'right' : 'wrong') + '">' +
          (correct ? I.check : I.x) +
          '<div><b>' + (correct ? 'Nice one' : 'Not quite') + '</b>' + detail + chips + '</div>' +
        '</div>' +
        '<button type="button" class="btn btn--primary btn--block" id="rt-next" style="margin-top:14px">' +
          (run.i >= run.qs.length - 1 ? 'See results' : 'Next question') +
          ' ' + (I.arrowR || '') + '</button>';
      W.$('#rt-next', fb).addEventListener('click', next);
    }
  }

  function next() {
    if (!run) return;
    if (run.i >= run.qs.length - 1) {
      finish();
      return;
    }
    run.i += 1;
    run.answered = false;
    renderQuestion();
  }

  function finish() {
    if (!run) return;
    var score = run.right.filter(Boolean).length;
    var total = run.qs.length;
    saveBest(run.pack.id, score, total);
    run.phase = 'done';
    run.score = score;
    renderDone();
  }

  function renderDone() {
    var el = host();
    if (!el || !run) return;
    var score = run.score;
    var total = run.qs.length;
    var pct = Math.round((score / total) * 100);
    var line = pct === 100 ? 'Perfect run — no wrong turns.'
      : pct >= 80 ? 'Solid driving. One more lap?'
      : pct >= 50 ? 'Halfway there — try the same route again.'
      : 'Rough stretch. The map will stick next time.';

    el.innerHTML =
      '<div class="rt rt--done">' +
        '<div class="rt-done">' +
          '<div class="rt-done__badge mono">' + score + '<span>/' + total + '</span></div>' +
          '<h2>' + esc(run.pack.title) + '</h2>' +
          '<p>' + esc(line) + '</p>' +
          '<div class="rt-done__pct mono">' + pct + '%</div>' +
          '<div class="rt-done__acts">' +
            '<button type="button" class="btn btn--accent" id="rt-again">Drive it again</button>' +
            '<button type="button" class="btn btn--ghost" id="rt-hub">All packs</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    var packId = run.pack.id;
    W.$('#rt-again', el).addEventListener('click', function () { begin(packId); });
    W.$('#rt-hub', el).addEventListener('click', function () { abandon(); renderHub(); });
  }

  global.RoadTripMode = {
    start: start,
    abandon: abandon,
    active: active,
    packs: PACKS,
    begin: begin
  };
})(window);
