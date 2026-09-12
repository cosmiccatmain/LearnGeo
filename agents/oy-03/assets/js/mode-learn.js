/* ------------------------------------------------------------------
   LearnGeo — Learn mode
   Endless practice with instant feedback. Sidebar asks, map answers.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons;

  var cfg = {
    regions: [], scope: 'all', countries: null,
    types: ['capital', 'country', 'locate', 'identify'],
    weakFirst: true, typed: false
  };
  var q = null, answered = false, session = { asked: 0, right: 0 };
  var pinRefs = [];
  var last = null;                 /* how the current question was answered, for redrawing it */
  var job = null, jobDone = null;  /* classwork in progress, and its hand-in once finished */

  function root() { return document.getElementById('learn-body'); }

  function start() {
    global.GeoMap.loadShapes().then(function () { if (q) paintMap(); });
    render();
    if (!q) next();
  }

  function next() {
    answered = false; last = null; jobDone = null;
    var list = global.Quiz.pool({ regions: cfg.regions, scope: cfg.scope, countries: cfg.countries, weakFirst: cfg.weakFirst });
    if (!list.length) list = global.Quiz.pool({ scope: 'all' });

    /* weakFirst sorts shakiest first — take from the front third, at random */
    var head = list.slice(0, Math.max(8, Math.ceil(list.length / 3)));
    var target = W.pick(cfg.weakFirst ? head : list);
    var type = W.pick(cfg.types.length ? cfg.types : ['capital']);

    /* a short hand-picked list cannot supply three wrong answers on its own */
    var choicesFrom = list.length >= 5 ? list : global.Quiz.pool({ scope: 'all' });
    q = global.Quiz.make(type, target, choicesFrom, {
      typed: cfg.typed && (type === 'capital' || type === 'country')
    });
    render();
    paintMap();
  }

  /* ------------------------------- map ------------------------------ */
  function paintMap() {
    var host = document.getElementById('map');
    if (!q || !host || !global.GeoMap.ensure(host)) return;
    global.GeoMap.clear();
    pinRefs = [];

    if (q.type === 'locate') {
      q.mapChoices.forEach(function (c) {
        var layer = global.GeoMap.drawCountry(c, 'choice', function (country) { pickCountry(country); });
        pinRefs.push({ country: c, layer: layer });
      });
      global.GeoMap.fitAll(q.mapChoices, 80);
      setHint('Click the country you think it is');
    } else if (q.type === 'identify') {
      global.GeoMap.drawCountry(q.country, 'target');
      global.GeoMap.frame(q.country, 90);
      setHint('Which country is shaded?');
    } else if (q.type === 'capital') {
      /* the question already names the country, so shade and label it;
         the blur keeps its capital from being read off the tiles */
      global.GeoMap.drawCountry(q.country, 'target');
      global.GeoMap.label(q.country, q.country.name);
      global.GeoMap.frame(q.country, 90);
      setHint('Answer in the sidebar');
    } else {
      setHint('Answer in the sidebar. The map shows where it is once you answer');
      global.GeoMap.reset();
    }
    setBadge('');
    global.GeoMap.setGuard(true);

    /* coming back to a question already answered: put the answer back */
    if (answered && last) {
      if (q.type === 'locate') markChoices(last.picked);
      revealOnMap();
    }
  }

  function setHint(text) {
    var pane = document.querySelector('#view-learn .map-pane');
    if (!pane) return;
    var old = pane.querySelector('.map-hint');
    if (old) old.remove();
    if (!text) return;
    var el = W.el('div', 'map-hint', W.escapeHtml(text));
    pane.appendChild(el);
  }

  function setBadge(html) {
    var pane = document.querySelector('#view-learn .map-pane');
    if (!pane) return;
    var old = pane.querySelector('.map-badge');
    if (old) old.remove();
    if (!html) return;
    pane.appendChild(W.el('div', 'map-badge', html));
  }

  function revealOnMap() {
    var c = q.country;
    global.GeoMap.setGuard(false);     /* answered: the map is for learning now */
    if (q.type !== 'locate') {
      global.GeoMap.clear();
      global.GeoMap.drawCountry(c, 'right', null, c.name);
      global.GeoMap.frame(c, 80);
    }
    setHint('');
    setBadge('<b>' + W.escapeHtml(c.capital) + '</b>' +
      '<span>' + W.escapeHtml(c.name) + ' · ' + W.escapeHtml(c.region) + '</span>');
  }

  /* ---------------------------- answering --------------------------- */
  function markChoices(picked) {
    pinRefs.forEach(function (p) {
      if (p.country.name === q.country.name) global.GeoMap.setCountryState(p.layer, 'right');
      else if (p.country.name === picked) global.GeoMap.setCountryState(p.layer, 'wrong');
      else global.GeoMap.setCountryState(p.layer, 'dim');
    });
  }

  function markOptions(idx) {
    W.$$('.option', root()).forEach(function (n, i) {
      n.classList.add('is-locked');
      if (q.choices[i].correct) n.classList.add('is-right');
      else if (i === idx) n.classList.add('is-wrong');
    });
  }

  function lockTyped(input, given, ok) {
    input.value = given;
    input.disabled = true;
    input.style.borderColor = ok ? 'var(--success)' : 'var(--danger)';
  }

  function pickCountry(country) {
    if (answered || q.type !== 'locate') return;
    markChoices(country.name);
    resolve(country.name === q.country.name, country.name,
            document.querySelector('#view-learn .map-pane'), { picked: country.name });
  }

  function pickOption(idx, node) {
    if (answered) return;
    var choice = q.choices[idx];
    resolve(choice.correct, choice.text, node, { idx: idx });
    markOptions(idx);
  }

  function submitTyped() {
    if (answered) return;
    var input = W.$('#typed-answer', root());
    if (!input || !input.value.trim()) return;
    var ok = global.Quiz.grade(q, input.value);
    lockTyped(input, input.value, ok);
    resolve(ok, input.value, input, {});
  }

  function resolve(correct, given, anchorNode, how) {
    answered = true;
    session.asked += 1;
    if (correct) session.right += 1;

    var gains = W.award(correct, { country: q.country.name });
    last = { correct: correct, given: given, gains: gains, idx: how.idx, picked: how.picked };

    if (correct) {
      W.Sound.correct(gains.combo);
      W.burstFrom(anchorNode, gains);
    } else {
      W.Sound.wrong();
    }

    revealOnMap();
    trackJob(correct);
    renderFeedback(correct, given, gains);
    updateHud();

    if (gains.level) celebrateLevel(gains.level);
    var unlocked = W.checkAchievements();
    unlocked.forEach(function (a, i) {
      setTimeout(function () {
        W.Sound.gem();
        W.toast('Achievement: ' + a.name, a.desc + '  ·  +' + a.reward + ' 💎', I.trophy, 4200);
      }, 600 + i * 500);
    });
  }

  function celebrateLevel(lvl) {
    W.Sound.levelUp();
    W.confetti({ count: 90, power: 300, y: window.innerHeight * 0.42 });
    global.UI.modal({
      wide: false,
      body: '<div class="levelup">' +
        '<div class="levelup__ring mono">' + lvl + '</div>' +
        '<h3>Level ' + lvl + '</h3>' +
        '<p>Nice one. Keep your streak going and you’ll earn XP faster.</p>' +
        '</div>',
      actions: [{ label: 'Keep going', cls: 'btn--accent', close: true }]
    });
  }

  /* ----------------------------- render ----------------------------- */
  function render() {
    var host = root();
    if (!host) return;
    if (!q) { host.innerHTML = '<div class="empty">Loading…</div>'; return; }

    var streak = W.state.streak.current;
    var html = jobCard();

    if (streak >= 3) {
      var mult = W.comboMultiplier(streak);
      html += '<div class="combo">' +
        '<span class="combo__n mono">' + streak + '</span>' +
        '<div><div class="combo__l">answer streak</div></div>' +
        '<span class="combo__mult mono">×' + mult + '</span></div>';
    }

    html += '<div class="qcard">' +
      '<div class="qmeta">' +
        '<span class="eyebrow">' + W.escapeHtml(global.Quiz.types[q.type].label) + '</span>' +
        '<span class="eyebrow">' + session.right + '/' + session.asked + ' this session</span>' +
      '</div>' +
      '<div class="qprompt">' + W.escapeHtml(q.prompt) + '</div>' +
      '<div class="qsubject">' + W.escapeHtml(q.subject) +
        '<small>' + W.escapeHtml(q.sub || '') + '</small></div>';

    if (q.typed) {
      html += '<input class="answer-input" id="typed-answer" autocomplete="off" ' +
        'autocorrect="off" spellcheck="false" placeholder="Type your answer…">' +
        '<button class="btn btn--accent btn--block" id="typed-submit" style="margin-top:10px">Check answer</button>';
    } else if (q.choices) {
      html += '<div class="options">';
      q.choices.forEach(function (c, i) {
        html += '<button class="option" data-i="' + i + '">' +
          '<span class="option__key mono">' + (i + 1) + '</span>' +
          '<span class="option__text">' + W.escapeHtml(c.text) + '</span>' +
          '<span class="option__mark">' + I.check + '</span></button>';
      });
      html += '</div>';
    } else {
      html += '<div class="empty" style="padding:26px 0">Click the right country on the map →</div>';
    }
    html += '</div><div id="fb-slot"></div>';
    host.innerHTML = html;

    W.$$('.option', host).forEach(function (n) {
      n.addEventListener('click', function () { pickOption(+n.dataset.i, n); });
    });
    var sub = W.$('#typed-submit', host);
    if (sub) sub.addEventListener('click', submitTyped);
    var inp = W.$('#typed-answer', host);
    if (inp && !answered) {
      inp.focus();
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') submitTyped(); });
    }
    /* reopening the tab after answering shows the answer, not a fresh question */
    if (answered && last) {
      if (q.typed && inp) { lockTyped(inp, last.given || '', last.correct); if (sub) sub.remove(); }
      else if (q.choices && last.idx !== undefined) markOptions(last.idx);
      renderFeedback(last.correct, last.given, last.gains);
    }
    renderFooter();
  }

  function renderFeedback(correct, given, gains) {
    var slot = document.getElementById('fb-slot');
    if (!slot) return;
    var c = q.country;
    var gainChips = correct
      ? '<div class="feedback__gain">' +
          '<span class="chip chip--xp mono">+' + gains.xp + ' XP</span>' +
          '<span class="chip chip--gem mono">' + W.gem(gains.gems) + '</span>' +
          (gains.mult > 1 ? '<span class="chip chip--fire mono">×' + gains.mult + ' streak</span>' : '') +
        '</div>'
      : '';

    var detail = correct
      ? '<p>' + W.escapeHtml(c.capital) + ' is the capital of ' + W.escapeHtml(c.name) + '.</p>'
      : '<p>The answer is <b>' + W.escapeHtml(q.answerText) + '</b>' +
        (given && q.typed ? '. You wrote “' + W.escapeHtml(given) + '”.' : '.') + '</p>';

    var note = c.note ? '<p style="margin-top:6px;color:var(--muted)">' + W.escapeHtml(c.note) + '</p>' : '';

    slot.innerHTML =
      '<div class="feedback feedback--' + (correct ? 'right' : 'wrong') + '">' +
        (correct ? I.check : I.x) +
        '<div><b>' + (correct ? praise() : 'Not quite') + '</b>' + detail + note + gainChips + '</div>' +
      '</div>' +
      (jobDone ? handInHtml() : '') +
      '<button class="btn btn--primary btn--block" id="next-q" style="margin-top:14px">' +
        'Next question ' + I.arrowR + '</button>';

    var jc = document.getElementById('learn-job');
    if (jc) jc.outerHTML = jobCard();
    if (jobDone) global.Assignments.wireSend(document.getElementById('learn-send'), jobDone.item);

    var btn = document.getElementById('next-q');
    btn.addEventListener('click', next);
    btn.focus();
    renderFooter();
  }

  /* ------------------------- classwork progress --------------------- */
  function jobCard() {
    if (!job) return '';
    return '<div class="job" id="learn-job">' +
      '<div class="job__top"><b>' + W.escapeHtml(job.meta.title) + '</b>' +
        '<span>' + job.asked + ' / ' + job.target + '</span></div>' +
      '<div class="pbar"><div class="pbar__fill pbar__fill--accent" style="width:' +
        Math.round((job.asked / job.target) * 100) + '%"></div></div>' +
    '</div>';
  }

  function trackJob(correct) {
    if (!job) return;
    job.asked += 1;
    if (correct) job.right += 1; else job.missed[q.country.name] = 1;
    if (job.asked < job.target) return;

    var pct = Math.round((job.right / job.asked) * 100);
    jobDone = {
      title: job.meta.title, pct: pct, right: job.right, asked: job.asked,
      item: global.Assignments.complete(job.meta, pct, job.right, job.asked, Object.keys(job.missed))
    };
    job = null;
    setTimeout(function () {
      W.Sound.finish();
      W.confetti({ count: 110, power: 320, y: window.innerHeight * 0.4 });
    }, 250);
  }

  function handInHtml() {
    var d = jobDone;
    return '<div class="handin">' +
      '<div><span class="eyebrow">Assignment finished</span>' +
        '<b>' + W.escapeHtml(d.title) + '</b>' +
        '<span class="t-sm t-muted">' + d.right + ' of ' + d.asked + ' right (' + d.pct + '%)</span></div>' +
      (d.item && !global.UI.previewing
        ? '<button class="btn btn--primary btn--block" id="learn-send"></button>' : '') +
    '</div>';
  }

  var PRAISE = ['Correct', 'Nailed it', 'Nice', 'Spot on', 'That’s it', 'Good one'];
  function praise() {
    var s = W.state.streak.current;
    if (s >= 25) return 'Unstoppable! ' + s + ' in a row';
    if (s >= 10) return 'On fire! ' + s + ' in a row';
    if (s >= 5)  return 'Streak ×' + s;
    return W.pick(PRAISE);
  }

  /* --------------------------- sidebar chrome ----------------------- */
  function renderFooter() {
    var foot = document.getElementById('learn-foot');
    if (!foot) return;
    var d = W.state.daily;
    var pct = Math.min(1, d.answered / Math.max(1, d.goal));
    var circ = 2 * Math.PI * 19;
    foot.innerHTML =
      '<div class="goal">' +
        '<div class="goal__ring">' +
          '<svg width="44" height="44">' +
            '<circle cx="22" cy="22" r="19" fill="none" stroke="var(--line)" stroke-width="4"/>' +
            '<circle cx="22" cy="22" r="19" fill="none" stroke="var(--success)" stroke-width="4" ' +
              'stroke-linecap="round" stroke-dasharray="' + circ + '" ' +
              'stroke-dashoffset="' + (circ * (1 - pct)) + '" style="transition:stroke-dashoffset .5s"/>' +
          '</svg>' +
          '<span class="mono">' + Math.round(pct * 100) + '</span>' +
        '</div>' +
        '<div class="goal__t grow"><b>Daily goal</b>' +
          '<span>' + d.answered + ' of ' + d.goal + ' questions' +
          (d.dayStreak > 1 ? ' · ' + d.dayStreak + '-day streak' : '') + '</span></div>' +
        '<button class="btn btn--ghost btn--sm" id="learn-config">Filters</button>' +
      '</div>';
    document.getElementById('learn-config').addEventListener('click', openConfig);
  }

  function openConfig() {
    var regions = global.GeoData.regions;
    var body =
      '<div class="field"><label class="field__label">Scope</label>' +
        '<div class="seg" id="cfg-scope">' +
          seg('un', 'UN members', cfg.scope) +
          seg('un-plus', '+ Observers', cfg.scope) +
          seg('all', 'All 213', cfg.scope) +
        '</div>' +
        '<div class="field__hint">193 UN members, 2 permanent observers and 18 territories.</div>' +
      '</div>' +
      '<div class="field"><label class="field__label">Regions</label>' +
        '<div class="check-grid" id="cfg-regions">' +
          regions.map(function (r) {
            var on = !cfg.regions.length || cfg.regions.indexOf(r) !== -1;
            return check(r, r, on);
          }).join('') +
        '</div>' +
        '<div class="field__hint">Leave all selected to study the whole world.</div>' +
      '</div>' +
      '<div class="field"><label class="field__label">Question types</label>' +
        '<div class="check-grid" id="cfg-types">' +
          Object.keys(global.Quiz.types).map(function (t) {
            return check(t, global.Quiz.types[t].label, cfg.types.indexOf(t) !== -1);
          }).join('') +
        '</div>' +
      '</div>' +
      '<div class="field"><label class="field__label">Answer style</label>' +
        '<div class="seg" id="cfg-typed">' +
          seg('choice', 'Multiple choice', cfg.typed ? 'typed' : 'choice') +
          seg('typed', 'Type the answer', cfg.typed ? 'typed' : 'choice') +
        '</div>' +
      '</div>' +
      '<div class="field"><label class="field__label">Order</label>' +
        '<div class="seg" id="cfg-order">' +
          seg('weak', 'Weakest first', cfg.weakFirst ? 'weak' : 'random') +
          seg('random', 'Random', cfg.weakFirst ? 'weak' : 'random') +
        '</div>' +
        '<div class="field__hint">Weakest first brings back the countries you keep getting wrong.</div>' +
      '</div>';

    global.UI.modal({
      title: 'Study filters',
      icon: I.layers,
      body: body,
      actions: [
        { label: 'Cancel', cls: 'btn--ghost', close: true },
        { label: 'Apply', cls: 'btn--accent', close: true, onClick: applyConfig }
      ],
      onMount: function (m) { global.UI.wireSeg(m); global.UI.wireCheck(m); }
    });

    function seg(v, label, cur) {
      return '<button data-v="' + v + '" class="' + (cur === v ? 'is-active' : '') + '">' + label + '</button>';
    }
    function check(v, label, on) {
      return '<button class="check ' + (on ? 'is-on' : '') + '" data-v="' + v + '">' +
        '<span class="check__box">' + I.check + '</span>' + W.escapeHtml(label) + '</button>';
    }
  }

  /* Entry point for suggestions and classwork. Classwork (meta) runs for a
     set number of questions and is handed in at the end. */
  function applyAssignment(a, meta) {
    cfg.countries = a.countries && a.countries.length ? a.countries : null;
    cfg.regions = a.regions || [];
    cfg.scope = a.scope || 'all';
    if (a.types && a.types.length) cfg.types = a.types;
    cfg.typed = !!a.typed;
    job = meta ? {
      meta: meta, asked: 0, right: 0, missed: {},
      target: Math.max(1, Math.min(100, a.count || (cfg.countries || []).length || 20))
    } : null;
    q = null;
    next();
  }

  function applyConfig(modalEl) {
    cfg.countries = null;             /* hand-picked filters replace an assignment */
    job = null;
    var scope = W.$('#cfg-scope .is-active', modalEl);
    cfg.scope = scope ? scope.dataset.v : 'all';

    var regions = W.$$('#cfg-regions .check.is-on', modalEl).map(function (n) { return n.dataset.v; });
    cfg.regions = regions.length === global.GeoData.regions.length ? [] : regions;

    var types = W.$$('#cfg-types .check.is-on', modalEl).map(function (n) { return n.dataset.v; });
    cfg.types = types.length ? types : ['capital'];

    var typed = W.$('#cfg-typed .is-active', modalEl);
    cfg.typed = typed && typed.dataset.v === 'typed';

    var order = W.$('#cfg-order .is-active', modalEl);
    cfg.weakFirst = !order || order.dataset.v === 'weak';

    var n = global.Quiz.pool({ regions: cfg.regions, scope: cfg.scope, countries: cfg.countries }).length;
    W.toast('Filters applied', n + ' places in your study set', I.check);
    next();
  }

  function updateHud() { if (global.UI) global.UI.refreshHud(true); }

  /* keyboard: 1-4 to answer, Enter/Space for next */
  document.addEventListener('keydown', function (e) {
    if (!document.body.classList.contains('view-learn')) return;
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.target && e.target.isContentEditable) return;
    /* Space and Enter belong to whatever button has focus, so Filters and the
       rest of the toolbar still work from the keyboard. The number keys are
       ours either way. */
    var onButton = e.target && /BUTTON|SELECT|A/.test(e.target.tagName);
    if (onButton && (e.key === ' ' || e.key === 'Enter')) return;
    if (document.querySelector('.overlay')) return;   /* keys belong to the open dialog */
    if (!answered && q && q.choices && /^[1-4]$/.test(e.key)) {
      var node = W.$$('.option', root())[+e.key - 1];
      if (node) { e.preventDefault(); node.click(); }
    } else if (answered && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault(); next();
    }
  });

  global.LearnMode = {
    start: start, next: next, render: render, applyAssignment: applyAssignment,
    get config() { return cfg; }
  };
})(window);
