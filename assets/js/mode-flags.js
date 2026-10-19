/* ------------------------------------------------------------------
   LearnGeo — Flags
   A section of its own for the world's flags, with no map in the way.

     Practice   one flag at a time, weakest first: name the flag, find
                the flag, or a mix of both, by choice or by typing
     All flags  every flag with its name and capital, searchable, with
                the names hidden on request for a self-test

   Questions come from quiz.js, so they are the same flag questions Learn
   and Practice test ask. Each answer goes through W.award like every
   other mode, and flag progress is kept apart in state.flagMastery so
   "flags learned" means flags, not capitals.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons;

  var STYLES = {
    name:  { label: 'Name the flag', type: 'flag' },
    find:  { label: 'Find the flag', type: 'flagpick' },
    mixed: { label: 'Mixed',         type: null }
  };
  /* box 2 means right twice more often than wrong, which is the point a
     flag stops coming up first */
  var LEARNED_BOX = 2;
  var RECENT = 6;

  var cfg = { style: 'name', region: '', typed: false };
  var tab = 'practice';
  var q = null, answered = false, last = null;
  var session = { asked: 0, right: 0 };
  var recent = [];
  var gallery = { query: '', hide: false, shown: {} };

  function host() { return document.getElementById('view-flags'); }
  function esc(s) { return W.escapeHtml(String(s == null ? '' : s)); }

  function all() {
    return global.GeoData.countries.filter(function (c) { return !!c.flag; });
  }
  function pool() {
    var list = all();
    return cfg.region ? list.filter(function (c) { return c.region === cfg.region; }) : list;
  }

  function record(name) {
    var fm = W.state.flagMastery || (W.state.flagMastery = {});
    return fm[name] || null;
  }
  function learned(c) {
    var m = record(c.name);
    return !!m && m.box >= LEARNED_BOX;
  }

  /* ------------------------------ asking ---------------------------- */
  function weight(c) {
    var m = record(c.name);
    if (!m) return -1 + Math.random() * 0.9;
    return m.box * 10 - m.w * 2 + Math.random() * 4;
  }

  function next() {
    answered = false; last = null;
    var list = pool();
    if (!list.length) list = all();
    var fresh = list.filter(function (c) { return recent.indexOf(c.name) === -1; });
    if (fresh.length) list = fresh;
    list = list.slice().sort(function (a, b) { return weight(a) - weight(b); });
    var target = W.pick(list.slice(0, Math.max(8, Math.ceil(list.length / 3))));

    recent.push(target.name);
    if (recent.length > RECENT) recent.shift();

    var type = STYLES[cfg.style].type || W.pick(['flag', 'flagpick']);
    var field = pool().length >= 5 ? pool() : all();
    q = global.Quiz.make(type, target, field, { typed: cfg.typed });
    render();
  }

  function resolve(correct, given, anchor, how) {
    if (answered) return;
    answered = true;
    session.asked += 1;
    if (correct) session.right += 1;

    var fm = W.state.flagMastery || (W.state.flagMastery = {});
    var m = fm[q.country.name] || { c: 0, w: 0, box: 0 };
    if (correct) { m.c += 1; m.box = Math.min(5, m.box + 1); }
    else { m.w += 1; m.box = Math.max(0, m.box - 1); }
    fm[q.country.name] = m;

    var gains = W.award(correct, { country: q.country.name });
    last = { correct: correct, given: given, gains: gains, idx: how.idx };

    if (correct) { W.Sound.correct(gains.combo); W.burstFrom(anchor, gains); }
    else W.Sound.wrong();

    W.save();
    render();
    if (global.UI) global.UI.refreshHud(true);
    if (gains.level) W.toast('Level ' + gains.level, 'Nice one, keep it going', I.bolt, 3200);
    W.announceAchievements(W.checkAchievements());
  }

  function pickOption(i, node) {
    if (answered || !q.choices) return;
    var ch = q.choices[i];
    resolve(global.Quiz.grade(q, ch.text), ch.text, node, { idx: i });
  }

  function submitTyped() {
    if (answered) return;
    var input = document.getElementById('fl-typed');
    if (!input || !input.value.trim()) return;
    resolve(global.Quiz.grade(q, input.value), input.value, input, {});
  }

  /* ------------------------------ render ---------------------------- */
  function start() {
    if (!q) next(); else render();
  }

  function render() {
    var el = host();
    if (!el) return;
    var list = pool();
    var known = list.filter(learned).length;
    var pct = list.length ? Math.round((known / list.length) * 100) : 0;

    el.innerHTML =
      '<div class="portal__inner fl">' +
        '<div class="fl-head">' +
          '<div>' +
            '<span class="eyebrow">Flags</span>' +
            '<h1>Learn the world’s flags</h1>' +
            '<p>All ' + all().length + ' flags, weakest first. Get one right twice and it counts as learned.</p>' +
          '</div>' +
          '<div class="fl-learned">' +
            '<div class="fl-learned__n"><b class="mono">' + known + '</b><span>of ' + list.length +
              ' learned' + (cfg.region ? ' in ' + esc(cfg.region) : '') + '</span></div>' +
            '<div class="pbar"><div class="pbar__fill pbar__fill--success" style="width:' + pct + '%"></div></div>' +
          '</div>' +
        '</div>' +

        '<div class="fl-bar">' +
          '<div class="seg" id="fl-tab">' +
            seg('practice', 'Practice', tab) + seg('all', 'All flags', tab) +
          '</div>' +
          '<div class="fl-regions" id="fl-region">' +
            chip('', 'Whole world') +
            global.GeoData.regions.map(function (r) { return chip(r, r); }).join('') +
          '</div>' +
        '</div>' +

        (tab === 'practice' ? practiceHtml() : galleryHtml()) +
      '</div>';

    wire(el);
  }

  function seg(v, label, cur) {
    return '<button data-v="' + v + '" class="' + (cur === v ? 'is-active' : '') + '">' + label + '</button>';
  }
  function chip(v, label) {
    return '<button class="fl-chip' + (cfg.region === v ? ' is-on' : '') + '" data-region="' + esc(v) + '">' +
      esc(label) + '</button>';
  }

  function practiceHtml() {
    if (!q) return '';
    var Q = global.Quiz;
    var streak = W.state.streak.current;
    var html =
      '<div class="fl-practice">' +
        '<div class="fl-opts">' +
          '<div class="seg" id="fl-style">' +
            Object.keys(STYLES).map(function (k) { return seg(k, STYLES[k].label, cfg.style); }).join('') +
          '</div>' +
          '<div class="seg" id="fl-answer">' +
            seg('choice', 'Multiple choice', cfg.typed ? 'typed' : 'choice') +
            seg('typed', 'Type it', cfg.typed ? 'typed' : 'choice') +
          '</div>' +
        '</div>' +

        '<div class="fl-card qcard">' +
          '<div class="qmeta">' +
            '<span class="eyebrow">' + esc(Q.types[q.type].label) + '</span>' +
            '<span class="eyebrow">' + session.right + '/' + session.asked + ' this session' +
              (streak >= 3 ? ' · ' + streak + ' in a row' : '') + '</span>' +
          '</div>' +
          (q.type === 'flag'
            ? '<div class="qprompt">' + esc(q.prompt) + '</div>' +
              '<div class="fl-big">' + Q.flagImg(q.flag, 'fl-big__img') + '</div>'
            : '<div class="qprompt">' + esc(q.prompt) + '</div>' +
              '<div class="qsubject">' + esc(q.subject) + '<small>' + esc(q.sub || '') + '</small></div>');

    if (q.typed) {
      html += '<input class="answer-input" id="fl-typed" autocomplete="off" autocorrect="off" ' +
        'spellcheck="false" placeholder="Type the country…"' +
        (answered ? ' disabled value="' + esc(last.given) + '" style="border-color:' +
          (last.correct ? 'var(--success)' : 'var(--danger)') + '"' : '') + '>' +
        (answered ? '' : '<button class="btn btn--accent btn--block" id="fl-check" style="margin-top:10px">Check answer</button>');
    } else {
      html += '<div class="' + Q.optionsClass(q) + (q.flagChoices ? '' : ' fl-names') + '">';
      q.choices.forEach(function (c, i) {
        var cls = 'option';
        if (answered) {
          cls += ' is-locked';
          if (c.correct) cls += ' is-right';
          else if (last.idx === i) cls += ' is-wrong';
        }
        html += '<button class="' + cls + '" data-i="' + i + '">' +
          '<span class="option__key mono">' + (i + 1) + '</span>' +
          '<span class="option__text">' + Q.choiceHtml(q, c) + '</span>' +
          '<span class="option__mark">' + I.check + '</span></button>';
      });
      html += '</div>';
    }

    if (answered) html += feedbackHtml();
    html += '</div></div>';
    return html;
  }

  function feedbackHtml() {
    var c = q.country, ok = last.correct, g = last.gains;
    var picked = (!ok && q.flagChoices && last.idx !== undefined) ? q.choices[last.idx].country : null;
    return '<div class="feedback feedback--' + (ok ? 'right' : 'wrong') + '" style="margin-top:16px">' +
        (ok ? I.check : I.x) +
        '<div><b>' + (ok ? 'Correct' : 'Not quite') + '</b>' +
          '<p>' + (!ok && q.flagChoices
              ? 'The flag of <b>' + esc(c.name) + '</b> is the one marked in green.'
              : 'That’s the flag of <b>' + esc(c.name) + '</b>.') +
            ' Its capital is ' + esc(c.capital) + ', in ' + esc(c.region) + '.</p>' +
          (picked ? '<p class="t-sm t-muted" style="margin-top:4px">You picked ' + esc(picked.name) + '.</p>' : '') +
          (!ok && q.typed ? '<p class="t-sm t-muted" style="margin-top:4px">You wrote “' + esc(last.given) + '”.</p>' : '') +
          (ok ? '<div class="feedback__gain"><span class="chip chip--xp mono">+' + g.xp + ' XP</span>' +
                '<span class="chip chip--gem mono">' + W.gem(g.gems) + '</span></div>' : '') +
        '</div>' +
      '</div>' +
      '<button class="btn btn--primary btn--block" id="fl-next" style="margin-top:14px">Next flag ' + I.arrowR + '</button>';
  }

  function galleryHtml() {
    var want = W.tight(gallery.query);
    var list = pool().filter(function (c) {
      if (!want) return true;
      if (W.tight(c.name).indexOf(want) !== -1 || W.tight(c.capital).indexOf(want) !== -1) return true;
      return (c.nameAliases || []).some(function (a) { return W.tight(a).indexOf(want) !== -1; });
    }).sort(function (a, b) { return a.name.localeCompare(b.name); });

    return '<div class="fl-gallery">' +
        '<div class="fl-gallery__bar">' +
          '<input class="input" id="fl-search" placeholder="Search a country or capital" value="' + esc(gallery.query) + '">' +
          '<button class="btn btn--ghost btn--sm' + (gallery.hide ? ' is-on' : '') + '" id="fl-hide">' +
            (gallery.hide ? 'Show names' : 'Hide names') + '</button>' +
        '</div>' +
        '<div class="t-sm t-muted" style="margin:10px 0 14px">' + list.length + (list.length === 1 ? ' flag' : ' flags') +
          (gallery.hide ? ' · click a flag to see whose it is' : '') + '</div>' +
        (list.length
          ? '<div class="fl-grid">' + list.map(tile).join('') + '</div>'
          : '<div class="empty" style="padding:30px 0">No flag matches “' + esc(gallery.query) + '”.</div>') +
      '</div>';

    function tile(c) {
      var hidden = gallery.hide && !gallery.shown[c.name];
      return '<button class="fl-tile' + (hidden ? ' is-hidden' : '') + '" data-name="' + esc(c.name) + '">' +
        '<img class="fl-tile__img" src="' + esc(c.flag) + '" alt="' + (hidden ? 'A flag' : 'Flag of ' + esc(c.name)) +
          '" loading="lazy" draggable="false">' +
        '<span class="fl-tile__t">' +
          (hidden ? '<b>?</b><span>Click to reveal</span>'
                  : '<b>' + esc(c.name) + '</b><span>' + esc(c.capital) + '</span>') +
        '</span>' +
        (learned(c) ? '<span class="fl-tile__ok" title="Learned">' + I.check + '</span>' : '') +
      '</button>';
    }
  }

  /* ------------------------------ wiring ---------------------------- */
  function wire(el) {
    W.$$('#fl-tab button', el).forEach(function (b) {
      b.addEventListener('click', function () { tab = b.dataset.v; render(); });
    });
    W.$$('#fl-region [data-region]', el).forEach(function (b) {
      b.addEventListener('click', function () {
        cfg.region = b.dataset.region;
        if (tab === 'practice') { recent = []; next(); } else render();
      });
    });
    W.$$('#fl-style button', el).forEach(function (b) {
      b.addEventListener('click', function () { if (cfg.style !== b.dataset.v) { cfg.style = b.dataset.v; next(); } });
    });
    W.$$('#fl-answer button', el).forEach(function (b) {
      b.addEventListener('click', function () {
        var typed = b.dataset.v === 'typed';
        if (cfg.typed !== typed) { cfg.typed = typed; next(); }
      });
    });
    W.$$('.fl-card .option', el).forEach(function (n) {
      n.addEventListener('click', function () { pickOption(+n.dataset.i, n); });
    });
    var chk = document.getElementById('fl-check');
    if (chk) chk.addEventListener('click', submitTyped);
    var inp = document.getElementById('fl-typed');
    if (inp && !answered) {
      inp.focus();
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') submitTyped(); });
    }
    var nx = document.getElementById('fl-next');
    if (nx) { nx.addEventListener('click', next); nx.focus(); }

    var search = document.getElementById('fl-search');
    if (search) {
      search.addEventListener('input', function () {
        gallery.query = search.value;
        var at = search.selectionStart;
        render();
        var again = document.getElementById('fl-search');
        if (again) { again.focus(); again.setSelectionRange(at, at); }
      });
    }
    var hide = document.getElementById('fl-hide');
    if (hide) hide.addEventListener('click', function () { gallery.hide = !gallery.hide; gallery.shown = {}; render(); });
    W.$$('.fl-tile.is-hidden', el).forEach(function (t) {
      t.addEventListener('click', function () { gallery.shown[t.dataset.name] = 1; render(); });
    });
  }

  /* keyboard: 1-4 to answer, Enter or Space for the next flag */
  document.addEventListener('keydown', function (e) {
    if (!document.body.classList.contains('view-flags') || tab !== 'practice' || !q) return;
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.target && e.target.isContentEditable) return;
    if (document.querySelector('.overlay')) return;
    var onButton = e.target && /BUTTON|SELECT|A/.test(e.target.tagName);
    if (onButton && (e.key === ' ' || e.key === 'Enter')) return;
    if (!answered && q.choices && /^[1-4]$/.test(e.key)) {
      var node = W.$$('.fl-card .option', host())[+e.key - 1];
      if (node) { e.preventDefault(); node.click(); }
    } else if (answered && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault(); next();
    }
  });

  global.FlagsMode = { start: start, render: render, next: next };
})(window);
