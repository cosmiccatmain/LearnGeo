/* ------------------------------------------------------------------
   LearnGeo — Class Quiz

   The paper map quiz, working the way it does in class: a country is
   shaded on the map, you click it to claim it, then you write the
   country and its capital. Two marks per question, no multiple choice.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons;

  var cfg = { scope: 'un', regions: [], length: 10, countries: null };
  var Q = null;      /* the run */
  var stage = 'idle';/* idle | locate | name | capital | marked */

  function side()  { return document.getElementById('quiz-body'); }
  function head()  { return document.getElementById('quiz-head'); }
  function foot()  { return document.getElementById('quiz-foot'); }
  function setupEl(){ return document.getElementById('quiz-setup'); }

  function showPane(which) {
    [['quiz-setup', 'setup'], ['quiz-workspace', 'map'], ['quiz-report', 'report']].forEach(function (p) {
      var el = document.getElementById(p[0]);
      if (el) el.classList.toggle('hidden', p[1] !== which);
    });
  }

  function start() {
    if (!Q) renderSetup();
    else if (Q.phase === 'report') renderReport();
    else renderRound();
  }

  /* =============================== SETUP ============================ */
  function renderSetup() {
    showPane('setup');
    head().innerHTML = '<div class="sidebar__title">Class quiz</div>' +
      '<div class="t-sm t-muted" style="margin-top:2px">Works like the map quizzes we do in class.</div>';

    var pool = global.Quiz.pool({ scope: cfg.scope, regions: cfg.regions });
    side().innerHTML =
      '<div class="deck-summary">' +
        '<div class="deck-summary__n mono">' + pool.length + '</div>' +
        '<div class="deck-summary__l">countries to pick from</div>' +
      '</div>' +
      '<div class="divider"></div>' +
      '<span class="eyebrow">How it works</span>' +
      '<ol class="quiz-steps">' +
        '<li><b>Find it.</b> One country is shaded gold on the map. Click it.</li>' +
        '<li><b>Name it.</b> Type the country name. There are no options to pick from.</li>' +
        '<li><b>Capital.</b> Type its capital city.</li>' +
      '</ol>' +
      '<div class="t-sm t-muted" style="margin-top:12px">Each question is worth 2 marks, 1 for the country and 1 for the capital.</div>';
    foot().innerHTML = '<div class="t-sm t-muted t-center">Don’t worry about accents, capital letters or punctuation. They’re ignored.</div>';

    var regions = global.GeoData.regions;
    setupEl().innerHTML =
      '<div class="setup-panel">' +
        '<div class="t-center" style="margin-bottom:26px">' +
          '<span class="eyebrow">New quiz</span>' +
          '<h2 style="margin-top:10px;font-size:26px">Set up your class quiz</h2>' +
          '<p class="t-muted" style="margin-top:8px;font-size:14.5px">' +
            'You’ll see a shaded country on the map. Write its name and its capital.</p>' +
        '</div>' +
        '<div class="setup-grid">' +
          fld('Question set', '<div class="seg" id="qz-scope">' +
            sg('un', 'UN 193', cfg.scope) + sg('un-plus', '+ Observers', cfg.scope) + sg('all', 'All 213', cfg.scope) + '</div>') +
          fld('Length', '<div class="seg" id="qz-count">' +
            ['5', '10', '20', '30'].map(function (n) { return sg(n, n, String(cfg.length)); }).join('') + '</div>') +
        '</div>' +
        fld('Regions', '<div class="check-grid check-grid--3" id="qz-regions">' +
          regions.map(function (r) {
            return ck(r, r, !cfg.regions.length || cfg.regions.indexOf(r) !== -1);
          }).join('') + '</div>') +
        '<button class="btn btn--accent btn--lg btn--block" id="qz-go" style="margin-top:26px">' +
          'Start quiz ' + I.arrowR + '</button>' +
      '</div>';

    global.UI.wireSeg(setupEl()); global.UI.wireCheck(setupEl());
    document.getElementById('qz-go').addEventListener('click', begin);

    function fld(l, inner) { return '<div class="field"><label class="field__label">' + l + '</label>' + inner + '</div>'; }
    function sg(v, l, cur) { return '<button data-v="' + v + '" class="' + (cur === v ? 'is-active' : '') + '">' + l + '</button>'; }
    function ck(v, l, on) {
      return '<button class="check ' + (on ? 'is-on' : '') + '" data-v="' + v + '">' +
        '<span class="check__box">' + I.check + '</span>' + W.escapeHtml(l) + '</button>';
    }
  }

  function begin() {
    var root = setupEl();
    var v = function (sel) { var n = W.$(sel + ' .is-active', root); return n ? n.dataset.v : null; };
    cfg.scope = v('#qz-scope') || 'un';
    cfg.length = parseInt(v('#qz-count') || '10', 10);
    var regs = W.$$('#qz-regions .check.is-on', root).map(function (n) { return n.dataset.v; });
    cfg.regions = regs.length === global.GeoData.regions.length ? [] : regs;

    cfg.countries = null;
    var pool = global.Quiz.pool({ scope: cfg.scope, regions: cfg.regions });
    if (pool.length < 3) { W.toast('Not enough countries', 'Pick more regions or a bigger set', I.info); return; }
    launch(W.sample(pool, Math.min(cfg.length, pool.length)), null);
  }

  function launch(list, meta) {
    Q = {
      phase: 'running', i: 0,
      items: list.map(function (c) {
        return { country: c, clicked: null, nameGiven: '', capGiven: '', nameOk: null, capOk: null,
                 misclicks: 0, context: null };
      }),
      startedAt: Date.now(), xp: 0, gems: 0,
      assignment: meta || null
    };
    stage = 'locate';
    global.GeoMap.loadShapes().then(renderRound);
  }

  /* Entry point for classwork: skip setup and quiz the teacher's list. */
  function startAssignment(a, meta) {
    cfg.scope = a.scope || 'un';
    cfg.regions = a.regions || [];
    cfg.countries = a.countries && a.countries.length ? a.countries : null;
    var want = a.count || (cfg.countries || []).length || 10;
    var pool = cfg.countries ? global.Assignments.resolve(cfg.countries)
                             : global.Quiz.pool({ scope: cfg.scope, regions: cfg.regions });
    if (!pool.length) { W.toast('Nothing to quiz', 'That assignment has no countries in it', I.info); return; }
    launch(W.sample(pool, Math.min(want, pool.length)), meta);
  }

  /* =============================== ROUND ============================ */
  function item() { return Q.items[Q.i]; }

  function renderRound() {
    showPane('map');
    /* a finished question must stay finished when the tab is reopened */
    var it = item();
    stage = it.capOk !== null ? 'marked'
          : it.nameOk !== null ? 'capital'
          : it.clicked ? 'name' : 'locate';
    paintMap();
    renderSidebar();
  }

  function paintMap() {
    var host = document.getElementById('map-quiz');
    if (!host || !global.GeoMap.ensure(host)) return;
    global.GeoMap.clear();

    var it = item();
    var target = it.country;

    /* Neighbours give the shaded country context to be clicked among. Picked
       once per question so they do not reshuffle every time the map redraws. */
    if (!it.context) {
      var near = global.Quiz.pool({ scope: cfg.scope }).filter(function (c) {
        return c.name !== target.name && c.region === target.region;
      });
      it.context = W.sample(near, Math.min(14, near.length));
    }

    it.context.forEach(function (c) {
      global.GeoMap.drawCountry(c, 'base', stage === 'locate' ? onWrongClick : null);
    });

    var revealed = stage === 'marked';
    var state = revealed ? (it.nameOk ? 'right' : 'wrong') : 'target';
    global.GeoMap.drawCountry(target, state, stage === 'locate' ? onCorrectClick : null,
      revealed ? target.name : null);

    global.GeoMap.frame(target, 70);
    /* the shaded country is the answer, so its printed name must stay unreadable */
    global.GeoMap.setGuard(stage !== 'marked');
    setHint(stage === 'locate'
      ? 'Click the shaded country'
      : (stage === 'marked' ? '' : 'Now type your answers in the sidebar'));
  }

  function setHint(t) {
    var pane = document.querySelector('#quiz-workspace');
    if (!pane) return;
    var o = pane.querySelector('.map-hint'); if (o) o.remove();
    if (t) pane.appendChild(W.el('div', 'map-hint', W.escapeHtml(t)));
  }

  function onCorrectClick() {
    if (stage !== 'locate') return;
    item().clicked = true;
    stage = 'name';
    W.Sound.flip();
    paintMap();
    renderSidebar();
  }

  function onWrongClick(country) {
    if (stage !== 'locate') return;
    item().misclicks += 1;
    W.Sound.wrong();
    W.toast('Not that one', 'Click the country shaded in gold', I.info, 1800);
  }

  /* ============================== SIDEBAR =========================== */
  function renderSidebar() {
    var it = item();
    head().innerHTML =
      '<div class="row row--between">' +
        '<div><div class="sidebar__title">Question ' + (Q.i + 1) +
          '<span class="t-muted" style="font-weight:500"> / ' + Q.items.length + '</span></div>' +
          '<div class="eyebrow" style="margin-top:3px">Class quiz</div></div>' +
        '<span class="timer mono">' + W.fmtTime(Math.round((Date.now() - Q.startedAt) / 1000)) + '</span>' +
      '</div>' +
      '<div class="pbar" style="margin-top:12px"><div class="pbar__fill pbar__fill--accent" style="width:' +
        (((Q.i + 1) / Q.items.length) * 100) + '%"></div></div>';

    var html = '<ol class="quiz-track">' +
      step(1, 'Find it on the map', it.clicked ? 'done' : (stage === 'locate' ? 'active' : 'todo')) +
      step(2, 'Write the country', it.nameOk !== null ? 'done' : (stage === 'name' ? 'active' : 'todo')) +
      step(3, 'Write the capital', it.capOk !== null ? 'done' : (stage === 'capital' ? 'active' : 'todo')) +
      '</ol>';

    if (stage === 'locate') {
      html += '<div class="quiz-prompt">' +
        '<div class="quiz-prompt__icon">' + I.target + '</div>' +
        '<b>Find the shaded country</b>' +
        '<p>One country on the map is shaded gold. Click on it to start.</p>' +
        (it.misclicks ? '<p class="t-sm" style="color:var(--danger);margin-top:6px">' +
          it.misclicks + ' wrong ' + (it.misclicks > 1 ? 'clicks' : 'click') + ' so far</p>' : '') +
      '</div>';
    } else if (stage === 'name' || stage === 'capital') {
      html += '<div class="qcard">' +
        '<div class="qprompt">Question ' + (Q.i + 1) + '</div>' +
        '<div class="qsubject">Type your answers' +
          '<small>Accents and punctuation don’t matter.</small></div>' +

        '<label class="field__label" style="margin-top:18px;display:block">1. Country</label>' +
        '<input class="answer-input" id="qz-name" style="margin-top:6px" autocomplete="off" spellcheck="false" ' +
          'placeholder="Country name…" value="' + W.escapeHtml(it.nameGiven) + '"' +
          (it.nameOk !== null ? ' disabled' : '') + '>' +
        (it.nameOk !== null ? mark(it.nameOk, it.country.name, it.nameGiven) : '') +

        (stage === 'capital'
          ? '<label class="field__label" style="margin-top:18px;display:block">2. Capital city</label>' +
            '<input class="answer-input" id="qz-cap" style="margin-top:6px" autocomplete="off" spellcheck="false" ' +
              'placeholder="Capital city…" value="' + W.escapeHtml(it.capGiven) + '">'
          : '') +

        '<button class="btn btn--accent btn--block" id="qz-submit" style="margin-top:14px">' +
          (stage === 'name' ? 'Submit country' : 'Submit capital') + '</button>' +
      '</div>';
    } else if (stage === 'marked') {
      html += markedPanel(it);
    }

    side().innerHTML = html;

    var sub = document.getElementById('qz-submit');
    if (sub) sub.addEventListener('click', submit);
    var input = document.getElementById(stage === 'capital' ? 'qz-cap' : 'qz-name');
    if (input) {
      input.focus();
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    }
    var next = document.getElementById('qz-next');
    if (next) { next.addEventListener('click', advance); next.focus(); }

    foot().innerHTML = '<div class="row" style="gap:8px">' +
      '<span class="t-sm t-muted grow">' + scoreLine() + '</span>' +
      (stage === 'locate'
        ? '<button class="btn btn--quiet btn--sm" id="qz-skip">Skip</button>'
        : '') +
    '</div>';
    var skip = document.getElementById('qz-skip');
    if (skip) skip.addEventListener('click', function () {
      it.nameOk = false; it.capOk = false; it.nameGiven = ''; it.capGiven = '';
      stage = 'marked'; paintMap(); renderSidebar();
    });

    function step(n, label, state) {
      return '<li class="quiz-step is-' + state + '"><span class="quiz-step__n mono">' +
        (state === 'done' ? '✓' : n) + '</span>' + label + '</li>';
    }
    function mark(okFlag, answer, given) {
      return '<div class="feedback feedback--' + (okFlag ? 'right' : 'wrong') + '" style="margin-top:10px">' +
        (okFlag ? I.check : I.x) + '<div><b>' + (okFlag ? 'Correct' : 'Not quite') + '</b>' +
        (okFlag ? '' : '<p>You wrote “' + W.escapeHtml(given || '—') + '”. The answer is <b>' +
          W.escapeHtml(answer) + '</b>.</p>') + '</div></div>';
    }
  }

  function markedPanel(it) {
    var c = it.country;
    var marks = (it.nameOk ? 1 : 0) + (it.capOk ? 1 : 0);
    return '<div class="qcard">' +
      '<div class="feedback feedback--' + (marks === 2 ? 'right' : marks === 1 ? 'wrong' : 'wrong') + '">' +
        (marks === 2 ? I.check : I.x) +
        '<div><b>' + marks + ' of 2 marks</b>' +
        '<p>The capital of <b>' + W.escapeHtml(c.name) + '</b> is <b>' + W.escapeHtml(c.capital) + '</b>.</p>' +
        (c.note ? '<p style="margin-top:6px;color:var(--muted)">' + W.escapeHtml(c.note) + '</p>' : '') +
        '</div>' +
      '</div>' +
      '<div class="quiz-answers">' +
        answerRow('Country', it.nameGiven, c.name, it.nameOk) +
        answerRow('Capital', it.capGiven, c.capital, it.capOk) +
      '</div>' +
      '<button class="btn btn--primary btn--block" id="qz-next" style="margin-top:16px">' +
        (Q.i === Q.items.length - 1 ? 'See results' : 'Next question') + ' ' + I.arrowR + '</button>' +
    '</div>';

    function answerRow(label, given, answer, okFlag) {
      return '<div class="quiz-answer">' +
        '<span class="quiz-answer__l">' + label + '</span>' +
        '<span class="quiz-answer__v ' + (okFlag ? 'is-right' : 'is-wrong') + '">' +
          W.escapeHtml(given || '—') + '</span>' +
        (okFlag ? '' : '<span class="quiz-answer__a">' + W.escapeHtml(answer) + '</span>') +
      '</div>';
    }
  }

  function scoreLine() {
    var got = 0, outOf = 0;
    Q.items.forEach(function (it) {
      if (it.nameOk !== null) { outOf += 2; got += (it.nameOk ? 1 : 0) + (it.capOk ? 1 : 0); }
    });
    return outOf ? got + ' / ' + outOf + ' marks' : 'No marks yet';
  }

  /* ============================= ANSWERING ========================== */
  function submit() {
    var it = item();
    if (stage === 'name') {
      var input = document.getElementById('qz-name');
      if (!input || !input.value.trim()) return;
      it.nameGiven = input.value.trim();
      it.nameOk = W.matches(it.nameGiven, it.country.name, it.country.nameAliases);
      pay(it.nameOk, input);
      stage = 'capital';
      renderSidebar();
    } else if (stage === 'capital') {
      var cap = document.getElementById('qz-cap');
      if (!cap || !cap.value.trim()) return;
      it.capGiven = cap.value.trim();
      it.capOk = W.matches(it.capGiven, it.country.capital, it.country.capitalAliases);
      pay(it.capOk, cap);
      stage = 'marked';
      paintMap();
      renderSidebar();
    }
  }

  function pay(correct, anchor) {
    var gains = W.award(correct, { country: item().country.name, baseXp: 12, baseGems: 5 });
    Q.xp += gains.xp; Q.gems += gains.gems;
    if (correct) { W.Sound.correct(gains.combo); W.burstFrom(anchor, gains); }
    else W.Sound.wrong();
    if (gains.level) {
      W.Sound.levelUp();
      W.confetti({ count: 90, power: 300, y: window.innerHeight * 0.4 });
      W.toast('Level ' + gains.level, 'Class quizzes count toward your level too', I.bolt);
    }
    global.UI.refreshHud(true);
    W.checkAchievements().forEach(function (a, i) {
      setTimeout(function () { W.toast('Achievement: ' + a.name, '+' + a.reward + ' 💎', I.trophy, 4000); }, 480 + i * 440);
    });
  }

  function advance() {
    if (Q.i === Q.items.length - 1) return finish();
    Q.i += 1;
    stage = 'locate';
    renderRound();
  }

  /* ============================== REPORT ============================ */
  function finish() {
    if (Q.phase === 'report') return;
    Q.phase = 'report';
    Q.elapsed = Math.round((Date.now() - Q.startedAt) / 1000);
    var marks = 0;
    Q.items.forEach(function (it) { marks += (it.nameOk ? 1 : 0) + (it.capOk ? 1 : 0); });
    Q.marks = marks;
    Q.outOf = Q.items.length * 2;
    var pct = Math.round((marks / Q.outOf) * 100);
    W.state.stats.tests += 1;
    if (pct === 100) W.state.stats.perfectTests += 1;
    var missed = Q.items.filter(function (it) { return !it.nameOk || !it.capOk; })
                        .map(function (it) { return it.country.name; });
    Q.handIn = Q.assignment
      ? global.Assignments.complete(Q.assignment, pct, marks, Q.outOf, missed) : null;
    var bonus = Math.round(Q.items.length * (pct / 100) * 4) + (pct === 100 ? 120 : 0);
    W.addDiamonds(bonus);
    Q.bonus = bonus;
    W.saveNow();
    W.Sound.finish();
    if (pct >= 70) W.confetti({ count: 120, power: 340, y: window.innerHeight * 0.35 });
    global.UI.refreshHud(true);
    /* the quiz that was just counted may be the fifth, or the first
       perfect one, and neither is checked anywhere else on this path */
    W.checkAchievements().forEach(function (a, i) {
      setTimeout(function () { W.toast('Achievement: ' + a.name, '+' + a.reward + ' 💎', I.trophy, 4200); }, 700 + i * 500);
    });
    renderReport();
  }

  function renderReport() {
    showPane('report');
    var pct = Math.round((Q.marks / Q.outOf) * 100);
    var circ = 2 * Math.PI * 74;

    document.getElementById('quiz-report').innerHTML =
      '<div class="report">' +
        '<div class="score-hero">' +
          '<span class="eyebrow">Class quiz results</span>' +
          '<div class="score-ring" style="margin-top:18px">' +
            '<svg width="168" height="168">' +
              '<circle cx="84" cy="84" r="74" fill="none" stroke="var(--line)" stroke-width="11"/>' +
              '<circle cx="84" cy="84" r="74" fill="none" stroke="' +
                (pct >= 80 ? 'var(--success)' : pct >= 60 ? 'var(--gold)' : 'var(--danger)') +
                '" stroke-width="11" stroke-linecap="round" stroke-dasharray="' + circ +
                '" stroke-dashoffset="' + circ + '" id="qz-arc" ' +
                'style="transition:stroke-dashoffset 1.1s cubic-bezier(.22,.61,.36,1)"/>' +
            '</svg>' +
            '<div class="score-ring__n mono">' + pct + '%<small>' + Q.marks + ' / ' + Q.outOf + ' marks</small></div>' +
          '</div>' +
          '<h2 style="margin-top:22px;font-size:28px">' + verdict(pct) + '</h2>' +
          '<p class="t-muted" style="margin-top:8px">' + Q.items.length + ' countries · ' +
            W.fmtTime(Q.elapsed) + ' · two marks each</p>' +
          '<div class="row" style="justify-content:center;gap:8px;margin-top:16px">' +
            '<span class="chip chip--xp mono">+' + Q.xp + ' XP</span>' +
            '<span class="chip chip--gem mono">' + W.gem(Q.gems + Q.bonus) + '</span>' +
          '</div>' +
        '</div>' +

        '<div class="breakdown">' +
          '<span class="eyebrow">Your answers</span>' +
          '<table class="quiz-table"><thead><tr>' +
            '<th></th><th>Country you wrote</th><th>Capital you wrote</th><th class="t-center">Marks</th>' +
          '</tr></thead><tbody>' +
          Q.items.map(function (it, n) {
            var m = (it.nameOk ? 1 : 0) + (it.capOk ? 1 : 0);
            return '<tr>' +
              '<td class="mono t-muted">' + (n + 1) + '</td>' +
              '<td>' + cell(it.nameGiven, it.country.name, it.nameOk) + '</td>' +
              '<td>' + cell(it.capGiven, it.country.capital, it.capOk) + '</td>' +
              '<td class="t-center mono"><b>' + m + '</b>/2</td>' +
            '</tr>';
          }).join('') +
          '</tbody></table>' +
        '</div>' +

        '<div class="row" style="gap:10px;margin-top:30px;justify-content:center">' +
          (Q.handIn && !global.UI.previewing
            ? '<button class="btn btn--primary btn--lg" id="qz-send"></button>' : '') +
          '<button class="btn btn--accent btn--lg" id="qz-again">' + I.refresh + ' New quiz</button>' +
          '<button class="btn btn--ghost btn--lg" id="qz-home">Back to home</button>' +
        '</div>' +
      '</div>';

    setTimeout(function () {
      var a = document.getElementById('qz-arc');
      if (a) a.style.strokeDashoffset = circ * (1 - pct / 100);
    }, 120);

    head().innerHTML = '<div class="sidebar__title">Results</div>' +
      '<div class="t-sm t-muted" style="margin-top:2px">' + Q.marks + ' of ' + Q.outOf + ' marks</div>';
    side().innerHTML = '<span class="eyebrow">Review these</span>' +
      (Q.items.filter(function (it) { return !it.nameOk || !it.capOk; }).length
        ? Q.items.filter(function (it) { return !it.nameOk || !it.capOk; }).map(function (it) {
            return '<div class="row" style="gap:8px;padding:8px 0;border-bottom:1px solid var(--line-soft)">' +
              '<span style="color:var(--faint)">' + I.pin + '</span>' +
              '<div class="grow"><div style="font-size:13.5px;font-weight:550">' + W.escapeHtml(it.country.name) + '</div>' +
              '<div class="t-sm t-muted">' + W.escapeHtml(it.country.capital) + '</div></div></div>';
          }).join('')
        : '<div class="t-sm t-muted" style="margin-top:8px">Full marks! Nothing to review.</div>');
    foot().innerHTML = '<button class="btn btn--primary btn--block" id="qz-again2">' + I.refresh + ' New quiz</button>';

    document.getElementById('qz-again').addEventListener('click', reset);
    document.getElementById('qz-again2').addEventListener('click', reset);
    document.getElementById('qz-home').addEventListener('click', function () { global.UI.go('portal'); });
    global.Assignments.wireSend(document.getElementById('qz-send'), Q.handIn);

    function cell(given, answer, okFlag) {
      if (okFlag) return '<span class="quiz-cell is-right">' + W.escapeHtml(given) + '</span>';
      return '<span class="quiz-cell is-wrong">' + W.escapeHtml(given || '—') + '</span>' +
             '<span class="quiz-cell__a">' + W.escapeHtml(answer) + '</span>';
    }
  }

  function verdict(p) {
    if (p === 100) return 'Full marks!';
    if (p >= 90) return 'Great job';
    if (p >= 75) return 'Nice work';
    if (p >= 60) return 'You passed';
    if (p >= 40) return 'Needs more practice';
    return 'Keep practicing, you’ll get there';
  }

  function reset() { Q = null; stage = 'idle'; renderSetup(); }

  global.QuizMode = { start: start, reset: reset, startAssignment: startAssignment };
})(window);
