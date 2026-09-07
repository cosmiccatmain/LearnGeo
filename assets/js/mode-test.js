/* ------------------------------------------------------------------
   LearnGeo — Practice Test mode

   Structured like a real test-prep section: you configure it, work
   through a fixed set with a question navigator and flags, then get a
   scored report you can review question by question.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons;

  var setup = {
    scope: 'un', regions: [], types: ['capital', 'country', 'identify'],
    count: 20, timed: true, secondsPer: 20, instant: true, typed: false
  };

  var T = null;          /* live test */
  var tick = null;

  function reset() { T = null; clearInterval(tick); tick = null; }

  function start() {
    if (!T) renderSetup();
    else if (T.phase === 'report') renderReport();
    else renderRunner();
  }

  function side() { return document.getElementById('test-body'); }
  function head() { return document.getElementById('test-head'); }
  function foot() { return document.getElementById('test-foot'); }

  /* Exactly one of setup / map / report is visible at a time. */
  function showPane(which) {
    [['test-setup', 'setup'], ['test-workspace', 'map'], ['test-report', 'report']].forEach(function (p) {
      var el = document.getElementById(p[0]);
      if (el) el.classList.toggle('hidden', p[1] !== which);
    });
  }

  /* =============================== SETUP ============================ */
  function renderSetup() {
    showPane('setup');
    head().innerHTML = '<div class="sidebar__title">Practice test</div>' +
      '<div class="t-sm t-muted" style="margin-top:2px">Build a section, then sit it end to end.</div>';

    var pool = global.Quiz.pool({ scope: setup.scope, regions: setup.regions });
    side().innerHTML =
      '<div class="deck-summary">' +
        '<div class="deck-summary__n mono">' + pool.length + '</div>' +
        '<div class="deck-summary__l">places in this question set</div>' +
      '</div>' +
      '<div class="divider"></div>' +
      '<span class="eyebrow">What to expect</span>' +
      '<ul class="feature-list" style="margin-top:10px">' +
        li(I.grid, 'Question navigator', 'Jump between questions and flag any you want to revisit.') +
        li(I.clock, 'Timed sections', 'The clock covers the whole section, not each question.') +
        li(I.chart, 'Score report', 'Accuracy by region and question type, plus a full answer review.') +
      '</ul>';
    foot().innerHTML = '<div class="t-sm t-muted t-center">Your answers still feed the same mastery record.</div>';

    var regions = global.GeoData.regions;
    document.getElementById('test-setup').innerHTML =
      '<div class="setup-panel">' +
        '<div class="t-center" style="margin-bottom:26px">' +
          '<span class="eyebrow">New section</span>' +
          '<h2 style="margin-top:10px;font-size:26px">Build your practice test</h2>' +
          '<p class="t-muted" style="margin-top:8px;font-size:14.5px">Everything here is optional — the defaults make a solid 20-question section.</p>' +
        '</div>' +
        '<div class="setup-grid">' +
          fld('Question set', '<div class="seg" id="ts-scope">' +
            sg('un', 'UN 193', setup.scope) + sg('un-plus', '+ Observers', setup.scope) + sg('all', 'All 213', setup.scope) + '</div>') +
          fld('Length', '<div class="seg" id="ts-count">' +
            ['10', '20', '40', '75'].map(function (n) { return sg(n, n, String(setup.count)); }).join('') + '</div>') +
          fld('Timing', '<div class="seg" id="ts-timed">' +
            sg('timed', 'Timed', setup.timed ? 'timed' : 'untimed') + sg('untimed', 'Untimed', setup.timed ? 'timed' : 'untimed') +
            '</div><div class="field__hint">' + setup.secondsPer + ' seconds per question, pooled across the section.</div>') +
          fld('Feedback', '<div class="seg" id="ts-instant">' +
            sg('instant', 'After each', setup.instant ? 'instant' : 'end') + sg('end', 'Exam mode', setup.instant ? 'instant' : 'end') +
            '</div><div class="field__hint">Exam mode holds every result back until you submit.</div>') +
          fld('Answer style', '<div class="seg" id="ts-typed">' +
            sg('choice', 'Multiple choice', setup.typed ? 'typed' : 'choice') + sg('typed', 'Type it', setup.typed ? 'typed' : 'choice') + '</div>') +
          fld('Question types', '<div class="check-grid" id="ts-types">' +
            Object.keys(global.Quiz.types).map(function (t) {
              return ck(t, global.Quiz.types[t].label, setup.types.indexOf(t) !== -1);
            }).join('') + '</div>') +
        '</div>' +
        fld('Regions', '<div class="check-grid check-grid--3" id="ts-regions">' +
          regions.map(function (r) {
            return ck(r, r, !setup.regions.length || setup.regions.indexOf(r) !== -1);
          }).join('') + '</div>') +
        '<button class="btn btn--accent btn--lg btn--block" id="ts-go" style="margin-top:26px">' +
          'Start test ' + I.arrowR + '</button>' +
      '</div>';

    var root = document.getElementById('test-setup');
    global.UI.wireSeg(root); global.UI.wireCheck(root);
    document.getElementById('ts-go').addEventListener('click', begin);

    function fld(label, inner) {
      return '<div class="field"><label class="field__label">' + label + '</label>' + inner + '</div>';
    }
    function li(icon, t, d) {
      return '<li>' + icon + '<div><b>' + t + '</b><span>' + d + '</span></div></li>';
    }
    function sg(v, l, cur) { return '<button data-v="' + v + '" class="' + (cur === v ? 'is-active' : '') + '">' + l + '</button>'; }
    function ck(v, l, on) {
      return '<button class="check ' + (on ? 'is-on' : '') + '" data-v="' + v + '">' +
        '<span class="check__box">' + I.check + '</span>' + W.escapeHtml(l) + '</button>';
    }
  }

  function readSetup() {
    var s = document.getElementById('test-setup');
    var v = function (sel) { var n = W.$(sel + ' .is-active', s); return n ? n.dataset.v : null; };
    setup.scope = v('#ts-scope') || 'un';
    var regions = W.$$('#ts-regions .check.is-on', s).map(function (n) { return n.dataset.v; });
    setup.regions = regions.length === global.GeoData.regions.length ? [] : regions;
    var types = W.$$('#ts-types .check.is-on', s).map(function (n) { return n.dataset.v; });
    setup.types = types.length ? types : ['capital'];
    setup.count = parseInt(v('#ts-count') || '20', 10);
    setup.timed = v('#ts-timed') === 'timed';
    setup.instant = v('#ts-instant') === 'instant';
    setup.typed = v('#ts-typed') === 'typed';
  }

  function begin() {
    readSetup();
    global.GeoMap.loadShapes();
    var qs = global.Quiz.generate({
      scope: setup.scope, regions: setup.regions, types: setup.types,
      count: setup.count, typed: setup.typed, weakFirst: false
    });
    if (!qs.length) { W.toast('Nothing to test', 'Widen the regions or scope', I.info); return; }

    T = {
      phase: 'running', qs: qs, i: 0,
      given: new Array(qs.length).fill(null),
      right: new Array(qs.length).fill(null),
      flags: new Array(qs.length).fill(false),
      revealed: new Array(qs.length).fill(false),
      startedAt: Date.now(),
      remaining: setup.timed ? qs.length * setup.secondsPer : null,
      instant: setup.instant,
      gems: 0, xp: 0
    };
    if (setup.timed) startTimer();
    renderRunner();
  }

  function startTimer() {
    clearInterval(tick);
    tick = setInterval(function () {
      if (!T || T.phase !== 'running') return clearInterval(tick);
      T.remaining -= 1;
      var el = document.getElementById('ts-timer');
      if (el) {
        el.textContent = W.fmtTime(Math.max(0, T.remaining));
        el.classList.toggle('is-low', T.remaining <= 30);
      }
      if (T.remaining <= 0) { clearInterval(tick); W.toast('Time', 'Section auto-submitted', I.clock); submit(); }
    }, 1000);
  }

  /* ============================== RUNNER ============================ */
  function renderRunner() {
    showPane('map');
    var q = T.qs[T.i];

    head().innerHTML =
      '<div class="row row--between">' +
        '<div><div class="sidebar__title">Question ' + (T.i + 1) +
          '<span class="t-muted" style="font-weight:500"> / ' + T.qs.length + '</span></div>' +
          '<div class="eyebrow" style="margin-top:3px">' + W.escapeHtml(global.Quiz.types[q.type].label) + '</div></div>' +
        (T.remaining !== null ? '<span class="timer mono" id="ts-timer">' + W.fmtTime(Math.max(0, T.remaining)) + '</span>' : '') +
      '</div>' +
      '<div class="pbar" style="margin-top:12px"><div class="pbar__fill pbar__fill--accent" style="width:' +
        (((T.i + 1) / T.qs.length) * 100) + '%"></div></div>';

    var answered = T.given[T.i] !== null;
    var html = '<div class="qcard">' +
      '<div class="qprompt">' + W.escapeHtml(q.prompt) + '</div>' +
      '<div class="qsubject">' + W.escapeHtml(q.subject) +
        '<small>' + W.escapeHtml(q.sub || '') + '</small></div>';

    if (q.typed) {
      html += '<input class="answer-input" id="ts-typed" autocomplete="off" spellcheck="false" ' +
        'placeholder="Type your answer…" value="' + W.escapeHtml(T.given[T.i] || '') + '"' +
        (answered && T.instant ? ' disabled' : '') + '>';
      if (!answered) html += '<button class="btn btn--accent btn--block" id="ts-check" style="margin-top:10px">Submit answer</button>';
    } else if (q.choices) {
      html += '<div class="options">';
      q.choices.forEach(function (c, i) {
        var cls = 'option';
        if (T.given[T.i] === c.text) cls += T.instant && answered ? (c.correct ? ' is-right' : ' is-wrong') : ' is-selected';
        else if (T.instant && answered && c.correct) cls += ' is-right';
        if (answered && T.instant) cls += ' is-locked';
        html += '<button class="' + cls + '" data-i="' + i + '">' +
          '<span class="option__key mono">' + (i + 1) + '</span>' +
          '<span class="option__text">' + W.escapeHtml(c.text) + '</span>' +
          '<span class="option__mark">' + I.check + '</span></button>';
      });
      html += '</div>';
    } else {
      html += '<div class="empty" style="padding:22px 0">Choose a pin on the map →</div>';
    }
    html += '</div><div id="ts-fb"></div>';

    /* question navigator — the thing that makes a test feel like a test */
    html += '<div class="divider"></div>' +
      '<div class="row row--between" style="margin-bottom:10px">' +
        '<span class="eyebrow">Navigator</span>' +
        '<span class="t-sm t-muted mono">' + T.given.filter(function (g) { return g !== null; }).length +
        '/' + T.qs.length + ' answered</span>' +
      '</div><div class="navgrid" id="ts-nav">';
    for (var i = 0; i < T.qs.length; i++) {
      var cls = 'navcell';
      if (T.given[i] !== null) cls += ' is-answered';
      if (T.flags[i]) cls += ' is-flagged';
      if (i === T.i) cls += ' is-current';
      html += '<button class="' + cls + '" data-n="' + i + '">' + (i + 1) + '</button>';
    }
    html += '</div>';
    side().innerHTML = html;

    W.$$('.option', side()).forEach(function (n) {
      n.addEventListener('click', function () { answer(q.choices[+n.dataset.i].text, n); });
    });
    var chk = document.getElementById('ts-check');
    if (chk) chk.addEventListener('click', function () {
      var v = document.getElementById('ts-typed').value;
      if (v.trim()) answer(v, document.getElementById('ts-typed'));
    });
    var ti = document.getElementById('ts-typed');
    if (ti && !answered) {
      ti.focus();
      ti.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && ti.value.trim()) answer(ti.value, ti);
      });
    }
    W.$$('#ts-nav .navcell', side()).forEach(function (n) {
      n.addEventListener('click', function () { go(+n.dataset.n); });
    });

    foot().innerHTML =
      '<div class="row" style="gap:8px">' +
        '<button class="btn btn--ghost" id="ts-prev" ' + (T.i === 0 ? 'disabled' : '') + '>' + I.arrowL + '</button>' +
        '<button class="btn btn--ghost" id="ts-flag">' + I.flag +
          (T.flags[T.i] ? ' Flagged' : ' Flag') + '</button>' +
        '<div class="grow"></div>' +
        (T.i === T.qs.length - 1
          ? '<button class="btn btn--accent" id="ts-submit">Submit test</button>'
          : '<button class="btn btn--primary" id="ts-next">Next ' + I.arrowR + '</button>') +
      '</div>';
    var p = document.getElementById('ts-prev'); if (p) p.addEventListener('click', function () { go(T.i - 1); });
    var n2 = document.getElementById('ts-next'); if (n2) n2.addEventListener('click', function () { go(T.i + 1); });
    var f = document.getElementById('ts-flag'); if (f) f.addEventListener('click', toggleFlag);
    var s = document.getElementById('ts-submit'); if (s) s.addEventListener('click', confirmSubmit);

    if (answered && T.instant) showFeedback(T.i);
    paintMap(q);
  }

  function paintMap(q) {
    var host = document.getElementById('map-test');
    if (!host || !global.GeoMap.ensure(host)) return;
    global.GeoMap.clear();

    var answered = T.given[T.i] !== null;
    var reveal = answered && T.instant;

    if (q.type === 'locate') {
      q.mapChoices.forEach(function (c) {
        var state = 'choice';
        if (reveal) {
          if (c.name === q.country.name) state = 'right';
          else if (c.name === T.given[T.i]) state = 'wrong';
          else state = 'dim';
        }
        global.GeoMap.drawCountry(c, state, reveal ? null : function (country) {
          answer(country.name, document.querySelector('#view-test .map-pane'));
        }, reveal ? c.name : null);
      });
      global.GeoMap.fitAll(q.mapChoices, 80);
      setHint(reveal ? '' : 'Click the country');
    } else if (q.type === 'identify') {
      global.GeoMap.drawCountry(q.country, reveal ? 'right' : 'target', null, reveal ? q.country.name : null);
      global.GeoMap.frame(q.country, 90);
      setHint(reveal ? '' : 'Which country is shaded?');
    } else {
      setHint('');
      if (reveal) {
        global.GeoMap.drawCountry(q.country, 'right', null, q.country.name);
        global.GeoMap.frame(q.country, 80);
      } else {
        global.GeoMap.reset();
      }
    }
    setBadge(reveal
      ? '<b>' + W.escapeHtml(q.country.capital) + '</b><span>' + W.escapeHtml(q.country.name) + '</span>'
      : '<b>Question ' + (T.i + 1) + ' of ' + T.qs.length + '</b><span>' +
        T.given.filter(function (g) { return g !== null; }).length + ' answered</span>');
  }

  function setHint(t) {
    var pane = document.querySelector('#view-test .map-pane');
    if (!pane) return;
    var o = pane.querySelector('.map-hint'); if (o) o.remove();
    if (t) pane.appendChild(W.el('div', 'map-hint', W.escapeHtml(t)));
  }
  function setBadge(html) {
    var pane = document.querySelector('#view-test .map-pane');
    if (!pane) return;
    var o = pane.querySelector('.map-badge'); if (o) o.remove();
    if (html) pane.appendChild(W.el('div', 'map-badge', html));
  }

  function answer(value, anchor) {
    if (T.given[T.i] !== null && T.instant) return;
    var q = T.qs[T.i];
    var correct = global.Quiz.grade(q, value);
    T.given[T.i] = value;
    T.right[T.i] = correct;

    if (T.instant) {
      var gains = W.award(correct, { country: q.country.name });
      T.gems += gains.gems; T.xp += gains.xp;
      if (correct) { W.Sound.correct(gains.combo); W.burstFrom(anchor, gains); }
      else W.Sound.wrong();
      if (gains.level) levelUp(gains.level);
      global.UI.refreshHud(true);
      W.checkAchievements().forEach(function (a, i) {
        setTimeout(function () { W.toast('Achievement — ' + a.name, '+' + a.reward + ' 💎', I.trophy, 4000); }, 500 + i * 450);
      });
      renderRunner();
    } else {
      W.Sound.flip();
      if (T.i < T.qs.length - 1) go(T.i + 1); else renderRunner();
    }
  }

  function showFeedback(i) {
    var slot = document.getElementById('ts-fb');
    if (!slot) return;
    var q = T.qs[i], ok = T.right[i], c = q.country;
    slot.innerHTML = '<div class="feedback feedback--' + (ok ? 'right' : 'wrong') + '">' +
      (ok ? I.check : I.x) + '<div><b>' + (ok ? 'Correct' : 'Incorrect') + '</b>' +
      '<p>' + (ok ? '' : 'Answer: <b>' + W.escapeHtml(q.answerText) + '</b>. ') +
      W.escapeHtml(c.capital) + ' · ' + W.escapeHtml(c.name) + ' · ' + W.escapeHtml(c.region) + '</p>' +
      (c.note ? '<p style="color:var(--muted);margin-top:5px">' + W.escapeHtml(c.note) + '</p>' : '') +
      '</div></div>';
  }

  function go(n) {
    if (n < 0 || n >= T.qs.length) return;
    T.i = n; renderRunner();
  }
  function toggleFlag() { T.flags[T.i] = !T.flags[T.i]; renderRunner(); }

  function levelUp(lvl) {
    W.Sound.levelUp();
    W.confetti({ count: 90, power: 300, y: window.innerHeight * 0.42 });
    W.toast('Level ' + lvl, 'You levelled up mid-test', I.bolt, 3600);
  }

  function confirmSubmit() {
    var unanswered = T.given.filter(function (g) { return g === null; }).length;
    var flagged = T.flags.filter(Boolean).length;
    if (!unanswered && !flagged) return submit();
    global.UI.modal({
      title: 'Submit test?',
      icon: I.clip,
      body: '<p class="t-muted">' +
        (unanswered ? '<b>' + unanswered + '</b> question' + (unanswered > 1 ? 's are' : ' is') + ' still unanswered. ' : '') +
        (flagged ? '<b>' + flagged + '</b> flagged for review. ' : '') +
        'Submitting scores the section and ends it.</p>',
      actions: [
        { label: 'Keep working', cls: 'btn--ghost', close: true },
        { label: 'Submit', cls: 'btn--accent', close: true, onClick: submit }
      ]
    });
  }

  function submit() {
    clearInterval(tick); tick = null;
    T.phase = 'report';
    T.elapsed = Math.round((Date.now() - T.startedAt) / 1000);

    /* grade anything left, and pay out if the test was run in exam mode */
    T.qs.forEach(function (q, i) {
      if (T.right[i] === null) T.right[i] = T.given[i] === null ? false : global.Quiz.grade(q, T.given[i]);
      if (!T.instant) {
        var g = W.award(T.right[i], { country: q.country.name });
        T.gems += g.gems; T.xp += g.xp;
      }
    });

    var correct = T.right.filter(Boolean).length;
    var pct = Math.round((correct / T.qs.length) * 100);
    W.state.stats.tests += 1;
    if (pct === 100) W.state.stats.perfectTests += 1;

    /* completion bonus scales with accuracy */
    var bonus = Math.round(T.qs.length * (pct / 100) * 3) + (pct === 100 ? 100 : 0);
    W.addDiamonds(bonus);
    T.bonus = bonus;
    W.saveNow();

    W.Sound.finish();
    if (pct >= 70) W.confetti({ count: 120, power: 340, y: window.innerHeight * 0.35 });
    global.UI.refreshHud(true);
    W.checkAchievements().forEach(function (a, i) {
      setTimeout(function () { W.toast('Achievement — ' + a.name, '+' + a.reward + ' 💎', I.trophy, 4200); }, 700 + i * 500);
    });
    renderReport();
  }

  /* ============================== REPORT ============================ */
  function renderReport() {
    showPane('report');
    var correct = T.right.filter(Boolean).length;
    var total = T.qs.length;
    var pct = Math.round((correct / total) * 100);
    var circ = 2 * Math.PI * 74;

    var byRegion = {}, byType = {};
    T.qs.forEach(function (q, i) {
      bump(byRegion, q.country.region, T.right[i]);
      bump(byType, global.Quiz.types[q.type].label, T.right[i]);
    });

    var html =
      '<div class="report">' +
        '<div class="score-hero">' +
          '<span class="eyebrow">Score report</span>' +
          '<div class="score-ring" style="margin-top:18px">' +
            '<svg width="168" height="168">' +
              '<circle cx="84" cy="84" r="74" fill="none" stroke="var(--line)" stroke-width="11"/>' +
              '<circle cx="84" cy="84" r="74" fill="none" stroke="' + ringColor(pct) + '" stroke-width="11" ' +
                'stroke-linecap="round" stroke-dasharray="' + circ + '" stroke-dashoffset="' + circ + '" ' +
                'id="score-arc" style="transition:stroke-dashoffset 1.1s cubic-bezier(.22,.61,.36,1)"/>' +
            '</svg>' +
            '<div class="score-ring__n mono">' + pct + '%<small>' + correct + ' / ' + total + '</small></div>' +
          '</div>' +
          '<h2 style="margin-top:22px;font-size:28px">' + verdict(pct) + '</h2>' +
          '<p class="t-muted" style="margin-top:8px">' +
            total + ' questions · ' + W.fmtTime(T.elapsed) + ' elapsed · ' +
            (T.instant ? 'feedback after each' : 'exam mode') + '</p>' +
          '<div class="row" style="justify-content:center;gap:8px;margin-top:16px">' +
            '<span class="chip chip--xp mono">+' + T.xp + ' XP</span>' +
            '<span class="chip chip--gem mono">+' + (T.gems + T.bonus) + ' 💎</span>' +
            (pct === 100 ? '<span class="chip chip--fire mono">Perfect +100 💎</span>' : '') +
          '</div>' +
        '</div>' +

        '<div class="breakdown">' +
          '<span class="eyebrow">By region</span>' + rows(byRegion) +
        '</div>' +
        '<div class="breakdown">' +
          '<span class="eyebrow">By question type</span>' + rows(byType) +
        '</div>' +

        '<div class="breakdown">' +
          '<div class="row row--between" style="margin-bottom:6px">' +
            '<span class="eyebrow">Answer review</span>' +
            '<span class="t-sm t-muted">' + (total - correct) + ' to revisit</span>' +
          '</div>' +
          T.qs.map(function (q, i) {
            var ok = T.right[i];
            return '<div class="review-item">' +
              '<div class="review-item__i review-item__i--' + (ok ? 'right' : 'wrong') + ' mono">' + (i + 1) + '</div>' +
              '<div class="grow">' +
                '<div class="review-item__q">' + W.escapeHtml(q.prompt) + ' ' +
                  '<b>' + W.escapeHtml(q.subject) + '</b></div>' +
                '<div class="review-item__a">' +
                  (ok ? '<b>' + W.escapeHtml(q.answerText) + '</b>'
                      : '<span class="bad">' + W.escapeHtml(T.given[i] === null ? 'skipped' : T.given[i]) + '</span>' +
                        ' → <b>' + W.escapeHtml(q.answerText) + '</b>') +
                  ' · ' + W.escapeHtml(q.country.region) +
                '</div>' +
              '</div>' +
              '<button class="icon-btn" data-focus="' + i + '" title="Show on map">' + I.pin + '</button>' +
            '</div>';
          }).join('') +
        '</div>' +

        '<div class="row" style="gap:10px;margin-top:30px">' +
          '<button class="btn btn--accent btn--lg" id="rp-again">' + I.refresh + ' New test</button>' +
          (correct < total ? '<button class="btn btn--ghost btn--lg" id="rp-missed">Drill the ' + (total - correct) + ' missed</button>' : '') +
          '<div class="grow"></div>' +
          '<button class="btn btn--ghost btn--lg" id="rp-learn">Back to Learn</button>' +
        '</div>' +
      '</div>';

    document.getElementById('test-report').innerHTML = html;
    setTimeout(function () {
      var arc = document.getElementById('score-arc');
      if (arc) arc.style.strokeDashoffset = circ * (1 - pct / 100);
    }, 120);

    head().innerHTML = '<div class="sidebar__title">Results</div>' +
      '<div class="t-sm t-muted" style="margin-top:2px">' + correct + ' of ' + total + ' correct</div>';
    side().innerHTML = '<span class="eyebrow">Navigator</span><div class="navgrid" style="margin-top:10px">' +
      T.qs.map(function (q, i) {
        return '<div class="navcell ' + (T.right[i] ? 'is-right' : 'is-wrong') + '">' + (i + 1) + '</div>';
      }).join('') + '</div>' +
      '<div class="divider"></div>' +
      '<div class="stack-8">' + weakest() + '</div>';
    foot().innerHTML = '<button class="btn btn--primary btn--block" id="rp-again2">' + I.refresh + ' Build another test</button>';

    document.getElementById('rp-again').addEventListener('click', newTest);
    document.getElementById('rp-again2').addEventListener('click', newTest);
    document.getElementById('rp-learn').addEventListener('click', function () { global.UI.go('learn'); });
    var miss = document.getElementById('rp-missed');
    if (miss) miss.addEventListener('click', drillMissed);
    W.$$('[data-focus]', document.getElementById('test-report')).forEach(function (b) {
      b.addEventListener('click', function () {
        var c = T.qs[+b.dataset.focus].country;
        W.toast(c.capital, c.name + ' · ' + c.lat.toFixed(1) + '°, ' + c.lon.toFixed(1) + '°', I.pin, 2600);
      });
    });

    function bump(o, k, ok) {
      o[k] = o[k] || { c: 0, n: 0 };
      o[k].n += 1; if (ok) o[k].c += 1;
    }
    function rows(o) {
      return Object.keys(o).sort().map(function (k) {
        var v = o[k], p = Math.round((v.c / v.n) * 100);
        return '<div class="brow">' +
          '<div>' + W.escapeHtml(k) + '</div>' +
          '<div class="pbar"><div class="pbar__fill ' + (p >= 70 ? 'pbar__fill--success' : '') +
            '" style="width:' + p + '%"></div></div>' +
          '<div class="brow__n">' + v.c + '/' + v.n + ' · ' + p + '%</div></div>';
      }).join('');
    }
    function weakest() {
      var miss = T.qs.filter(function (q, i) { return !T.right[i]; }).slice(0, 8);
      if (!miss.length) return '<div class="t-sm t-muted">Nothing missed. Clean sheet.</div>';
      return '<span class="eyebrow">Revisit these</span>' + miss.map(function (q) {
        return '<div class="row" style="gap:8px;padding:7px 0;border-bottom:1px solid var(--line-soft)">' +
          '<span style="color:var(--faint)">' + I.pin + '</span>' +
          '<div class="grow"><div style="font-size:13.5px;font-weight:550">' + W.escapeHtml(q.country.name) + '</div>' +
          '<div class="t-sm t-muted">' + W.escapeHtml(q.country.capital) + '</div></div></div>';
      }).join('');
    }
  }

  function ringColor(p) { return p >= 80 ? 'var(--success)' : p >= 60 ? 'var(--gold)' : 'var(--danger)'; }
  function verdict(p) {
    if (p === 100) return 'Perfect section';
    if (p >= 90) return 'Excellent';
    if (p >= 75) return 'Strong showing';
    if (p >= 60) return 'Solid, with gaps';
    if (p >= 40) return 'Worth another pass';
    return 'Early days — keep at it';
  }

  function newTest() { reset(); renderSetup(); }

  function drillMissed() {
    var missed = T.qs.filter(function (q, i) { return !T.right[i]; }).map(function (q) { return q.country; });
    var all = global.Quiz.pool({ scope: 'all' });
    var qs = missed.map(function (c) {
      return global.Quiz.make(W.pick(setup.types), c, all, { typed: setup.typed });
    });
    T = {
      phase: 'running', qs: qs, i: 0,
      given: new Array(qs.length).fill(null), right: new Array(qs.length).fill(null),
      flags: new Array(qs.length).fill(false), revealed: new Array(qs.length).fill(false),
      startedAt: Date.now(), remaining: null, instant: true, gems: 0, xp: 0
    };
    W.toast('Drill started', qs.length + ' questions you missed', I.target);
    renderRunner();
  }

  document.addEventListener('keydown', function (e) {
    if (!document.body.classList.contains('view-test') || !T || T.phase !== 'running') return;
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    var q = T.qs[T.i];
    if (q.choices && /^[1-4]$/.test(e.key)) {
      var n = W.$$('.option', side())[+e.key - 1];
      if (n && !n.classList.contains('is-locked')) { e.preventDefault(); n.click(); }
    } else if (e.key === 'ArrowRight') { e.preventDefault(); go(T.i + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(T.i - 1); }
    else if (e.key.toLowerCase() === 'f') { e.preventDefault(); toggleFlag(); }
  });

  global.TestMode = { start: start, reset: reset };
})(window);
