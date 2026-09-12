/* ------------------------------------------------------------------
   LearnGeo - the three-question demo on the landing page.

   One question from three of the app's question types:
     1. country -> capital
     2. capital -> country
     3. name the country from its outline (shapes in demo-shapes.js)
   Nothing here touches the saved state. When it's done we ask if they
   want to sign up as a student or a teacher, once per visit.

   The options are lettered A to D and those letters work: the card
   answers to the keyboard whenever it is the thing on screen, which is
   what anyone who has used the app itself will reach for.
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

  var KEYS = ['1', '2', '3', '4'];
  var ICON_CHECK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m20 6-11 11-5-5"/></svg>';
  var ICON_X = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  var ICON_GLOBE = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18"/></svg>';

  var root, qs, at, results, locked;
  var popTimer = null;    /* the sign-up nudge, so it can be called off */
  var asked = false;      /* only nudge once a visit */

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

  /* The back of a flashcard prints the capital's position, so the demo
     prints it the same way rather than inventing a second format. */
  function where(c) {
    if (!c || typeof c.lat !== 'number') return '';
    return Math.abs(c.lat).toFixed(2) + '\u00B0 ' + (c.lat < 0 ? 'S' : 'N') + ', ' +
           Math.abs(c.lon).toFixed(2) + '\u00B0 ' + (c.lon < 0 ? 'W' : 'E');
  }

  function find(name) {
    var list = global.GeoData.countries;
    for (var i = 0; i < list.length; i++) if (list[i].name === name) return list[i];
    return null;
  }

  /* Three wrong answers, from the same region when possible so it isn't
     obvious which one is right. `only` narrows the pool: the outline
     question draws its decoys from the countries that have an outline
     here too, so nobody is asked to rule out a country the size of a town.

     They are kept near the answer's own length as well. Partly because a
     decoy twice as long as everything else is not a decoy, and partly
     because the answers are short and a thirty-character one wraps its
     button onto a second line, which makes the card taller than the
     question before it and moves the page while it is being read. */
  function wrongOnes(c, key, only) {
    var room = Math.max(String(c[key]).length + 6, 14);
    var all = global.GeoData.countries.filter(function (x) {
      return x.name !== c.name && x.status !== 2 && x[key] !== c[key] &&
             x[key].length <= room && (!only || only[x.name]);
    });
    var near = shuffle(all.filter(function (x) { return x.region === c.region; }));
    var far = shuffle(all.filter(function (x) { return x.region !== c.region; }));
    return near.concat(far).slice(0, 3).map(function (x) { return x[key]; });
  }

  /* Three questions, or as many as the data can actually supply: nothing
     in here is allowed to throw, because a card that is dead on arrival
     costs more than a round of two questions ever would.

     All three show the country's outline, since that is the whole claim
     the app makes — a name sticks once it has a shape and a place to go
     with it. Question one names the country, so its outline is up from the
     start; question two would be handing over the answer, so its outline
     waits until the answer is in. */
  function build() {
    var shapes = global.DemoShapes || {};
    var outlined = {};
    Object.keys(shapes).forEach(function (n) { if (find(n)) outlined[n] = true; });

    var pool = shuffle(FAMILIAR.map(find).filter(function (c) { return c && !c.note; }));
    pool = pool.filter(function (c) { return outlined[c.name]; })
               .concat(pool.filter(function (c) { return !outlined[c.name]; }));
    var a = pool[0], b = pool[1];

    var drawn = shuffle(Object.keys(outlined).filter(function (n) {
      return (!a || n !== a.name) && (!b || n !== b.name);
    }));
    var s = find(drawn[0]);

    var out = [];
    if (a) out.push({
      label: 'Country → Capital', ask: 'What’s the capital of', subject: a.name + '?',
      answer: a.capital, recap: a.name, fact: a.region + ' · ' + where(a),
      shape: shapes[a.name],
      options: shuffle([a.capital].concat(wrongOnes(a, 'capital')))
    });
    if (b) out.push({
      label: 'Capital → Country', ask: 'Which country has this capital?', subject: b.capital,
      answer: b.name, recap: b.capital, fact: b.region + ' · ' + where(b),
      shape: shapes[b.name], keepBack: true,
      options: shuffle([b.name].concat(wrongOnes(b, 'name')))
    });
    if (s) out.push({
      label: 'Identify the country', ask: 'Which country is this?', shape: shapes[s.name],
      answer: s.name, recap: 'The outline', fact: s.region + ' · capital ' + s.capital,
      options: shuffle([s.name].concat(wrongOnes(s, 'name', outlined)))
    });
    return out;
  }

  function start() {
    clearTimeout(popTimer);
    qs = build();
    at = 0;
    results = [];
    if (!qs.length) {                       /* no data to ask about */
      root.innerHTML = '';
      setBar('Try it in the app');
      return;
    }
    draw();
  }

  function dots() {
    return '<div class="demo__dots">' + qs.map(function (q, i) {
      var cls = i < results.length ? (results[i].right ? 'is-right' : 'is-wrong') : (i === at ? 'is-now' : '');
      return '<i class="' + cls + '"></i>';
    }).join('') + '</div>';
  }

  /* The question, the outline and the four options all sit in one stage of
     a fixed shape: the options are pinned to the bottom of it and the
     outline takes whatever is left, so the card is exactly the same height
     on all three questions and nothing under it moves as you go. */
  function draw() {
    var q = qs[at];
    locked = false;
    setBar('Question ' + (at + 1) + ' of ' + qs.length);

    var outline = q.shape
      ? '<div class="demo__shape-wrap' + (q.keepBack ? ' is-back' : '') + '">' +
          '<svg class="demo__shape" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid meet" ' +
            'role="img" aria-label="The outline of a country"><path d="' + q.shape + '"/></svg>' +
        '</div>'
      : '<div class="demo__shape-wrap"></div>';
    /* Always rendered, empty on the outline question: the stage keeps one
       shape whatever is being asked, so the outline lands in the same
       place and at the same size on all three. */
    var subject = '<div class="demo__q">' + esc(q.subject || '') + '</div>';

    root.innerHTML =
      '<div class="demo__top"><span class="eyebrow">' + esc(q.label) + '</span>' + dots() + '</div>' +
      '<div class="demo__stage is-in" tabindex="-1">' +
        '<div class="demo__ask">' + esc(q.ask) + '</div>' + subject + outline +
        '<div class="demo__fact" aria-live="polite"></div>' +
        '<div class="options">' + q.options.map(function (o, i) {
          return '<button class="option" data-i="' + i + '">' +
            '<span class="option__key">' + KEYS[i] + '</span>' +
            '<span class="option__text">' + esc(o) + '</span>' +
            '<span class="option__mark"></span></button>';
        }).join('') + '</div>' +
      '</div>' +
      '<div class="demo__foot" aria-live="polite"><span class="demo__note">Pick one, or press ' +
        KEYS.slice(0, q.options.length).map(function (k) { return '<kbd>' + k + '</kbd>'; }).join('') +
      '.</span></div>';

    W.$$('.option', root).forEach(function (b) {
      b.addEventListener('click', function () { choose(parseInt(b.dataset.i, 10)); });
    });
    fitShape();

    /* keep the keyboard on the question, but not on the first paint,
       which would scroll the page down to the demo on load */
    if (at > 0) {
      var stage = root.querySelector('.demo__stage');
      if (stage) stage.focus({ preventScroll: true });
    }
  }

  /* Every outline is drawn into the same 200 x 200 box, so a wide country
     like Iceland ends up a third the size of a tall one like Chile. Crop
     the view to what the path actually covers and each one arrives at the
     same size, filling the space the card has for it. */
  function fitShape() {
    var svg = root.querySelector('.demo__shape');
    var path = svg && svg.querySelector('path');
    if (!path || !path.getBBox) return;
    try {
      var b = path.getBBox();
      if (!b.width || !b.height) return;
      var pad = Math.max(b.width, b.height) * 0.04;
      svg.setAttribute('viewBox', (b.x - pad) + ' ' + (b.y - pad) + ' ' +
                                  (b.width + pad * 2) + ' ' + (b.height + pad * 2));
    } catch (e) { /* the 200 x 200 box is a fine fallback */ }
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
    /* The outline settles on the right answer whichever way the guess
       went. It is a picture of that country and it always was, so turning
       it red for a wrong guess says something untrue about the drawing;
       the red belongs on the option that was picked. */
    var wrap = root.querySelector('.demo__shape-wrap');
    if (wrap) wrap.classList.remove('is-back');
    var shape = root.querySelector('.demo__shape');
    if (shape) shape.classList.add('is-solved');

    var fact = root.querySelector('.demo__fact');
    if (fact) {
      fact.innerHTML = '<b>' + esc(q.answer) + '</b><span class="mono">' + esc(q.fact || '') + '</span>';
      fact.classList.add('is-in');
    }

    root.querySelector('.demo__dots').outerHTML = dots();
    sound(right);

    var last = at === qs.length - 1;
    var foot = root.querySelector('.demo__foot');
    foot.innerHTML =
      '<span class="demo__note ' + (right ? 'is-right' : 'is-wrong') + '">' +
        (right ? '<b>Correct.</b> ' + esc(scoreLine()) : '<b>Not quite.</b> It’s ' + esc(q.answer) + '.') + '</span>' +
      '<button class="btn btn--primary btn--sm" data-next>' + (last ? 'See my score' : 'Next question') + '</button>';
    var next = foot.querySelector('[data-next]');
    next.addEventListener('click', advance);
    next.focus({ preventScroll: true });
  }

  /* Where they stand, said in words rather than as a second scoreboard. */
  function scoreLine() {
    var got = results.filter(function (r) { return r.right; }).length;
    if (got === results.length) return got === 1 ? 'One down.' : got + ' in a row.';
    return got + ' of ' + results.length + ' so far.';
  }

  function advance() {
    if (at === qs.length - 1) finish();
    else { at += 1; draw(); }
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
    root.querySelector('[data-learn]').addEventListener('click', function () {
      clearTimeout(popTimer);
      global.UI.showApp('learn');
    });

    if (got === qs.length && W.confetti && W.state.settings.effects) {
      try { W.confetti({ count: 40, power: 170 }); } catch (e) {}
    }
    clearTimeout(popTimer);
    popTimer = setTimeout(popup, 650);
  }

  function popup() {
    if (!global.UI || !global.UI.modal || asked) return;
    /* already signed in: there is nothing to nudge them towards */
    if (global.Cloud && global.Cloud.signedIn) return;
    /* they have moved on from the score screen, so leave them alone */
    if (!root || !root.querySelector('.demo__end')) return;
    if (document.querySelector('.overlay')) return;
    asked = true;
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

    /* the role they picked counts even if they back out of the form */
    W.state.role = role;
    W.state.roleChosen = true;
    W.saveNow();
    if (UI.refreshTabs) UI.refreshTabs();

    if (C && C.signedIn) return openApp(role);

    if (UI.openAuth && C && C.available) {
      UI.openAuth('signup');
      var pick = document.querySelector('#au-role [data-v="' + role + '"]');
      if (pick) pick.click();
      return;
    }

    /* no accounts to sign up for, so say so instead of pretending */
    W.toast('Accounts aren\u2019t working right now',
            'You can still study as a guest. Your progress stays in this browser.', W.Icons.info, 4600);
    openApp(role);
  }

  function openApp(role) {
    var UI = global.UI;
    if (role === 'teacher') {
      UI.showApp('teacher');
      if (global.Teacher) global.Teacher.becomeTeacher();
    } else {
      UI.showApp('portal');
    }
  }

  /* 1-4 answers, Enter moves on. Only while the card is on screen with
     nothing open over it, so it can never answer a question you can't see. */
  function setBar(text) {
    var bar = document.getElementById('demo-bar-label');
    if (bar) bar.textContent = text;
  }

  /* ---- the keyboard ----
     A, B, C, D and 1 to 4 pick an option; Enter or the space bar takes the
     next question. The card only listens while it is the thing the visitor
     is looking at: not once the app is open over the top of it, not behind
     a dialog, not while it is scrolled off the screen, and never while
     something is being typed into. */
  function listening() {
    if (!root || !root.firstChild) return false;
    var app = document.getElementById('app');
    if (app && app.classList.contains('is-open')) return false;
    if (document.body.classList.contains('no-scroll')) return false;   /* a dialog is up */
    var r = root.getBoundingClientRect();
    return r.bottom > 80 && r.top < (global.innerHeight || 0) - 80;
  }

  function typing(el) {
    if (!el) return false;
    var tag = el.tagName;
    return el.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  }

  function onKey(e) {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
    if (!listening()) return;

    var next = root.querySelector('[data-next]');
    if (next && (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar')) {
      e.preventDefault();
      advance();
      return;
    }
    if (locked || !qs || !qs[at]) return;

    var k = String(e.key || '').toUpperCase();
    var i = KEYS.indexOf(k);
    if (i === -1 && k >= '1' && k <= '4') i = Number(k) - 1;
    if (i < 0 || i >= qs[at].options.length) return;

    e.preventDefault();
    var btn = root.querySelector('.option[data-i="' + i + '"]');
    if (btn) btn.classList.add('is-tapped');
    choose(i);
  }

  function init() {
    root = document.getElementById('demo-body');
    if (!root || !global.GeoData) return;

    /* the outlines live in their own file, so cope if it never arrived */
    if (!global.DemoShapes || !Object.keys(global.DemoShapes).length) {
      root.innerHTML = '<div class="demo__stage demo__end">' +
        '<div class="demo__verdict">The demo didn\u2019t load.</div>' +
        '<p class="t-sm t-muted" style="margin-top:8px">Try Learn in the app instead.</p>' +
        '<div class="row-btns"><button class="btn btn--accent btn--sm" data-learn>Open the app</button></div>' +
      '</div>';
      var b = root.querySelector('[data-learn]');
      if (b) b.addEventListener('click', function () { global.UI.showApp('learn'); });
      setBar('Demo unavailable');
      return;
    }

    document.addEventListener('keydown', onKey);
    start();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  global.Demo = { restart: function () { if (root) start(); } };
})(window);
