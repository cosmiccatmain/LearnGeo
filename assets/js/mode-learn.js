/* ------------------------------------------------------------------
   LearnGeo — Learn mode
   Endless practice with instant feedback. Sidebar asks, map answers.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons;

  var cfg = {
    regions: [], scope: 'all',
    types: ['capital', 'country', 'locate', 'identify'],
    weakFirst: true, typed: false
  };
  var q = null, answered = false, session = { asked: 0, right: 0 };
  var pinRefs = [];

  function root() { return document.getElementById('learn-body'); }

  function start() {
    global.GeoMap.loadShapes().then(function () { if (q) paintMap(); });
    render();
    if (!q) next();
  }

  function next() {
    answered = false;
    pinRefs = [];
    var list = global.Quiz.pool({ regions: cfg.regions, scope: cfg.scope, weakFirst: cfg.weakFirst });
    if (!list.length) list = global.Quiz.pool({ scope: 'all' });

    /* weakFirst sorts shakiest first — take from the front third, at random */
    var head = list.slice(0, Math.max(8, Math.ceil(list.length / 3)));
    var target = W.pick(cfg.weakFirst ? head : list);
    var type = W.pick(cfg.types.length ? cfg.types : ['capital']);

    q = global.Quiz.make(type, target, list, {
      typed: cfg.typed && (type === 'capital' || type === 'country')
    });
    render();
    paintMap();
  }

  /* ------------------------------- map ------------------------------ */
  function paintMap() {
    var host = document.getElementById('map');
    if (!host || !global.GeoMap.ensure(host)) return;
    global.GeoMap.clear();

    if (q.type === 'locate') {
      /* whole countries are the targets now, not pins */
      q.mapChoices.forEach(function (c) {
        var layer = global.GeoMap.drawCountry(c, 'choice', function (country) { pickCountry(country); });
        pinRefs.push({ country: c, layer: layer });
      });
      global.GeoMap.fitAll(q.mapChoices, 80);
      setHint('Click the country you think it is');
    } else if (q.type === 'identify') {
      var l = global.GeoMap.drawCountry(q.country, 'target');
      pinRefs.push({ country: q.country, layer: l });
      global.GeoMap.frame(q.country, 90);
      setHint('Which country is shaded?');
    } else {
      setHint('Answer in the sidebar — the map shows you where');
      global.GeoMap.reset();
    }
    setBadge('');
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
  function pickCountry(country) {
    if (answered || q.type !== 'locate') return;
    var correct = country.name === q.country.name;
    pinRefs.forEach(function (p) {
      if (p.country.name === q.country.name) global.GeoMap.setCountryState(p.layer, 'right');
      else if (p.country.name === country.name) global.GeoMap.setCountryState(p.layer, 'wrong');
      else global.GeoMap.setCountryState(p.layer, 'dim');
    });
    resolve(correct, country.name, document.querySelector('#view-learn .map-pane'));
  }

  function pickOption(idx, node) {
    if (answered) return;
    var choice = q.choices[idx];
    resolve(choice.correct, choice.text, node);
    W.$$('.option', root()).forEach(function (n, i) {
      n.classList.add('is-locked');
      if (q.choices[i].correct) n.classList.add('is-right');
      else if (i === idx) n.classList.add('is-wrong');
    });
  }

  function submitTyped() {
    if (answered) return;
    var input = W.$('#typed-answer', root());
    if (!input || !input.value.trim()) return;
    var ok = global.Quiz.grade(q, input.value);
    input.disabled = true;
    input.style.borderColor = ok ? 'var(--success)' : 'var(--danger)';
    resolve(ok, input.value, input);
  }

  function resolve(correct, given, anchorNode) {
    answered = true;
    session.asked += 1;
    if (correct) session.right += 1;

    var gains = W.award(correct, { country: q.country.name });

    if (correct) {
      W.Sound.correct(gains.combo);
      W.burstFrom(anchorNode, gains);
    } else {
      W.Sound.wrong();
    }

    revealOnMap();
    renderFeedback(correct, given, gains);
    updateHud();

    if (gains.level) celebrateLevel(gains.level);
    var unlocked = W.checkAchievements();
    unlocked.forEach(function (a, i) {
      setTimeout(function () {
        W.Sound.gem();
        W.toast('Achievement — ' + a.name, a.desc + '  ·  +' + a.reward + ' 💎', I.trophy, 4200);
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
        '<p>Nice climb. Higher levels stack up faster when your streak is running.</p>' +
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
    var html = '';

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
      html += '<div class="empty" style="padding:26px 0">Pick the right pin on the map →</div>';
    }
    html += '</div><div id="fb-slot"></div>';
    host.innerHTML = html;

    W.$$('.option', host).forEach(function (n) {
      n.addEventListener('click', function () { pickOption(+n.dataset.i, n); });
    });
    var sub = W.$('#typed-submit', host);
    if (sub) sub.addEventListener('click', submitTyped);
    var inp = W.$('#typed-answer', host);
    if (inp) {
      inp.focus();
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') submitTyped(); });
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
          '<span class="chip chip--gem mono">+' + gains.gems + ' 💎</span>' +
          (gains.mult > 1 ? '<span class="chip chip--fire mono">×' + gains.mult + ' streak</span>' : '') +
        '</div>'
      : '';

    var detail = correct
      ? '<p>' + W.escapeHtml(c.capital) + ' is the capital of ' + W.escapeHtml(c.name) + '.</p>'
      : '<p>The answer is <b>' + W.escapeHtml(q.answerText) + '</b>' +
        (given && q.typed ? ' — you wrote “' + W.escapeHtml(given) + '”.' : '.') + '</p>';

    var note = c.note ? '<p style="margin-top:6px;color:var(--muted)">' + W.escapeHtml(c.note) + '</p>' : '';

    slot.innerHTML =
      '<div class="feedback feedback--' + (correct ? 'right' : 'wrong') + '">' +
        (correct ? I.check : I.x) +
        '<div><b>' + (correct ? praise() : 'Not quite') + '</b>' + detail + note + gainChips + '</div>' +
      '</div>' +
      '<button class="btn btn--primary btn--block" id="next-q" style="margin-top:14px">' +
        'Next question ' + I.arrowR + '</button>';

    var btn = document.getElementById('next-q');
    btn.addEventListener('click', next);
    btn.focus();
    renderFooter();
  }

  var PRAISE = ['Correct', 'Nailed it', 'Exactly', 'Spot on', 'That’s it', 'Sharp'];
  function praise() {
    var s = W.state.streak.current;
    if (s >= 25) return 'Unstoppable — ' + s + ' in a row';
    if (s >= 10) return 'On fire — ' + s + ' straight';
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
        '<div class="field__hint">193 UN member states · 2 permanent observers · 18 territories.</div>' +
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
        '<div class="field__hint">Weakest-first resurfaces the countries you keep missing.</div>' +
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

  function applyConfig(modalEl) {
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

    var n = global.Quiz.pool({ regions: cfg.regions, scope: cfg.scope }).length;
    W.toast('Filters applied', n + ' places in your study set', I.check);
    next();
  }

  function updateHud() { if (global.UI) global.UI.refreshHud(true); }

  /* keyboard: 1-4 to answer, Enter/Space for next */
  document.addEventListener('keydown', function (e) {
    if (!document.body.classList.contains('view-learn')) return;
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    if (!answered && q && q.choices && /^[1-4]$/.test(e.key)) {
      var node = W.$$('.option', root())[+e.key - 1];
      if (node) { e.preventDefault(); node.click(); }
    } else if (answered && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault(); next();
    }
  });

  global.LearnMode = {
    start: start, next: next, render: render,
    get config() { return cfg; }
  };
})(window);
