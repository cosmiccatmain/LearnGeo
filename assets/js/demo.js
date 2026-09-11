/* ------------------------------------------------------------------
   LearnGeo - the three-question demo on the landing page.

   One question from three of the app's question types:
     1. country -> capital
     2. capital -> country
     3. name the country from its outline (shapes in demo-shapes.js)
   Nothing here touches the saved state. When it's done we ask if they
   want to sign up as a student or a teacher.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW;

  /* Countries most people have at least heard of. A first-time visitor
     should have a fair shot, even if the capital is a classic trick
     question (Canberra, Ottawa, Ankara...). */
  var FAMILIAR = [
    'Canada', 'Australia', 'Brazil', 'Egypt', 'Japan', 'Kenya', 'Peru', 'Norway',
    'Turkey', 'Thailand', 'Argentina', 'Nigeria', 'Vietnam', 'Poland', 'Morocco',
    'New Zealand', 'Portugal', 'South Korea', 'Colombia', 'Greece', 'Ireland',
    'Switzerland', 'Chile', 'Pakistan', 'Germany', 'Mexico', 'India', 'Italy',
    'Spain', 'France', 'Iceland', 'Cuba', 'Mongolia', 'Ukraine'
  ];

  var KEYS = ['A', 'B', 'C', 'D'];
  var ICON_CHECK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m20 6-11 11-5-5"/></svg>';
  var ICON_X = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  var ICON_GLOBE = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18"/></svg>';

  var root, qs, at, results, locked;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function find(name) {
    var list = global.GeoData.countries;
    for (var i = 0; i < list.length; i++) if (list[i].name === name) return list[i];
    return null;
  }

  /* Three wrong answers, from the same region when possible so it isn't
     obvious which one is right. */
  function wrongOnes(c, key) {
    var all = global.GeoData.countries.filter(function (x) {
      return x.name !== c.name && x.status !== 2 && x[key] !== c[key];
    });
    var near = shuffle(all.filter(function (x) { return x.region === c.region; }));
    var far = shuffle(all.filter(function (x) { return x.region !== c.region; }));
    return near.concat(far).slice(0, 3).map(function (x) { return x[key]; });
  }

  function build() {
    var pool = shuffle(FAMILIAR.map(find).filter(function (c) { return c && !c.note; }));
    var a = pool[0], b = pool[1];

    var shapes = shuffle(Object.keys(global.DemoShapes || {}).filter(function (n) {
      return find(n) && n !== a.name && n !== b.name;
    }));
    var s = find(shapes[0]);

    return [
      { label: 'Country → Capital', ask: 'What’s the capital of', subject: a.name,
        answer: a.capital, recap: a.name, options: shuffle([a.capital].concat(wrongOnes(a, 'capital'))) },
      { label: 'Capital → Country', ask: 'Which country has this capital?', subject: b.capital,
        answer: b.name, recap: b.capital, options: shuffle([b.name].concat(wrongOnes(b, 'name'))) },
      { label: 'Identify the country', ask: 'Which country is this?', shape: global.DemoShapes[s.name],
        answer: s.name, recap: 'The outline', options: shuffle([s.name].concat(wrongOnes(s, 'name'))) }
    ];
  }

  function start() {
    qs = build();
    at = 0;
    results = [];
    draw();
  }

  function dots() {
    return '<div class="demo__dots">' + qs.map(function (q, i) {
      var cls = i < results.length ? (results[i].right ? 'is-right' : 'is-wrong') : (i === at ? 'is-now' : '');
      return '<i class="' + cls + '"></i>';
    }).join('') + '</div>';
  }

  function draw() {
    var q = qs[at];
    locked = false;
    setBar('Question ' + (at + 1) + ' of ' + qs.length);

    var subject = q.shape
      ? '<svg class="demo__shape" viewBox="0 0 200 200" role="img" aria-label="A country outline"><path d="' + q.shape + '"/></svg>'
      : '<div class="demo__q">' + esc(q.subject) + (q.label === 'Country → Capital' ? '?' : '') + '</div>';

    root.innerHTML =
      '<div class="demo__top"><span class="eyebrow">' + esc(q.label) + '</span>' + dots() + '</div>' +
      '<div class="demo__stage is-in">' +
        '<div class="demo__ask">' + esc(q.ask) + '</div>' + subject +
        '<div class="options">' + q.options.map(function (o, i) {
          return '<button class="option" data-i="' + i + '">' +
            '<span class="option__key">' + KEYS[i] + '</span>' +
            '<span class="option__text">' + esc(o) + '</span>' +
            '<span class="option__mark"></span></button>';
        }).join('') + '</div>' +
      '</div>' +
      '<div class="demo__foot"><span class="demo__note">Pick one.</span></div>';

    W.$$('.option', root).forEach(function (b) {
      b.addEventListener('click', function () { choose(parseInt(b.dataset.i, 10)); });
    });
  }

  function choose(i) {
    if (locked) return;
    locked = true;
    var q = qs[at];
    var picked = q.options[i];
    var right = picked === q.answer;
    results.push({ right: right, picked: picked });

    W.$$('.option', root).forEach(function (b, j) {
      b.classList.add('is-locked');
      var mark = b.querySelector('.option__mark');
      if (q.options[j] === q.answer) { b.classList.add('is-right'); mark.innerHTML = ICON_CHECK; }
      else if (j === i) { b.classList.add('is-wrong'); mark.innerHTML = ICON_X; }
    });
    var shape = root.querySelector('.demo__shape');
    if (shape) shape.classList.add(right ? 'is-right' : 'is-wrong');

    root.querySelector('.demo__dots').outerHTML = dots();
    sound(right);

    var last = at === qs.length - 1;
    var foot = root.querySelector('.demo__foot');
    foot.innerHTML =
      '<span class="demo__note ' + (right ? 'is-right' : 'is-wrong') + '">' +
        (right ? '<b>Correct!</b>' : '<b>Not quite.</b> It’s ' + esc(q.answer) + '.') + '</span>' +
      '<button class="btn btn--primary btn--sm" data-next>' + (last ? 'See my score' : 'Next question') + '</button>';
    var next = foot.querySelector('[data-next]');
    next.addEventListener('click', function () {
      if (last) finish();
      else { at++; draw(); }
    });
    next.focus({ preventScroll: true });
  }

  function sound(right) {
    try {
      if (!W.Sound || !W.state.settings.sound) return;
      if (right && W.Sound.correct) W.Sound.correct(0);
      if (!right && W.Sound.wrong) W.Sound.wrong();
    } catch (e) { /* sound is a nice-to-have */ }
  }

  function verdict(n) {
    return [
      'Zero this time. Everyone starts somewhere.',
      'One right. Give it a week and that goes up.',
      'Two out of three. Not bad at all.',
      'All three! You clearly know your stuff.'
    ][n];
  }

  function finish() {
    var got = results.filter(function (r) { return r.right; }).length;
    setBar('Done');

    root.innerHTML =
      '<div class="demo__top"><span class="eyebrow">Your score</span>' + dots() + '</div>' +
      '<div class="demo__stage demo__end is-in">' +
        '<div class="demo__score">' + got + '<small>/' + qs.length + '</small></div>' +
        '<div class="demo__verdict">' + verdict(got) + '</div>' +
        '<ul class="demo__recap">' + qs.map(function (q, i) {
          var r = results[i];
          return '<li><span class="tag ' + (r.right ? 'tag--right">✓' : 'tag--wrong">✗') + '</span>' +
            '<span class="what">' + esc(q.recap) + '</span>' +
            '<span class="ans">' + esc(q.answer) + '</span></li>';
        }).join('') + '</ul>' +
        '<div class="row-btns">' +
          '<button class="btn btn--ghost btn--sm" data-again>Try three more</button>' +
          '<button class="btn btn--accent btn--sm" data-learn>Keep going in the app</button>' +
        '</div>' +
      '</div>';

    root.querySelector('[data-again]').addEventListener('click', start);
    root.querySelector('[data-learn]').addEventListener('click', function () { global.UI.showApp('learn'); });

    if (got === qs.length && W.confetti && W.state.settings.effects) {
      try { W.confetti({ count: 40, power: 170 }); } catch (e) {}
    }
    setTimeout(popup, 650);
  }

  function popup() {
    if (!global.UI || !global.UI.modal) return;
    global.UI.modal({
      body:
        '<div class="demo-pop">' +
          '<div class="demo-pop__globe">' + ICON_GLOBE + '</div>' +
          '<h3>Liking this?</h3>' +
          '<p>Sign up for free as a student or a teacher. Your progress gets saved, ' +
            'so you can pick up where you left off on any device.</p>' +
          '<div class="role-pick">' +
            '<button class="role-opt" data-role="student">' +
              '<span class="role-opt__i">' + (W.Icons.book || '') + '</span>' +
              '<b>I’m a student</b>' +
              '<span>Practice all 213 places and get the work your teacher sets.</span>' +
            '</button>' +
            '<button class="role-opt" data-role="teacher">' +
              '<span class="role-opt__i">' + (W.Icons.users || '') + '</span>' +
              '<b>I’m a teacher</b>' +
              '<span>Make a class, hand out work and see how everyone did.</span>' +
            '</button>' +
          '</div>' +
          '<button class="demo-pop__later" data-close>Maybe later</button>' +
        '</div>',
      onMount: function (m, close) {
        W.$$('[data-role]', m).forEach(function (b) {
          b.addEventListener('click', function () { close(); signUp(b.dataset.role); });
        });
      }
    });
  }

  /* Opens the Create account screen with their role already picked. If
     accounts can't load (offline, script blocked), set the role and drop
     them into the app so the choice still counts for something. */
  function signUp(role) {
    var UI = global.UI, C = global.Cloud;
    if (C && C.signedIn) { UI.showApp(W.state.role === 'teacher' ? 'teacher' : 'portal'); return; }
    if (UI.openAuth && C && C.available) {
      UI.openAuth('signup');
      var pick = document.querySelector('#au-role [data-v="' + role + '"]');
      if (pick) pick.click();
      return;
    }

    W.state.role = role;
    W.state.roleChosen = true;
    W.saveNow();
    if (role === 'teacher') {
      UI.showApp('teacher');
      if (global.Teacher) global.Teacher.becomeTeacher();
    } else {
      UI.showApp('portal');
    }
  }

  function setBar(text) {
    var bar = document.getElementById('demo-bar-label');
    if (bar) bar.textContent = text;
  }

  function init() {
    root = document.getElementById('demo-body');
    if (!root || !global.GeoData) return;
    start();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  global.Demo = { restart: function () { if (root) start(); } };
})(window);
