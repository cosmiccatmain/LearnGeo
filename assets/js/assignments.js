/* ------------------------------------------------------------------
   LearnGeo — recommendations, assignments and the country picker.

   Recommendations read the same mastery record every mode writes to,
   so they point at whatever you have actually been getting wrong.
   Assignments are plain objects that survive a round trip through a
   share code, which is how a teacher hands work to a class without
   anyone needing an account.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons;

  /* ========================= mastery helpers ======================== */
  function record(name) { return W.state.mastery[name] || null; }

  function unseen() {
    return global.GeoData.countries.filter(function (c) { return !record(c.name); });
  }

  function shaky() {
    return global.GeoData.countries.filter(function (c) {
      var m = record(c.name);
      return m && m.box <= 2 && (m.w > 0 || m.box === 0);
    }).sort(function (a, b) {
      var ma = record(a.name), mb = record(b.name);
      return (mb.w - mb.c) - (ma.w - ma.c);
    });
  }

  function almost() {
    return global.GeoData.countries.filter(function (c) {
      var m = record(c.name);
      return m && m.box === 3;
    });
  }

  function regionStats() {
    return global.GeoData.regions.map(function (r) {
      var list = global.GeoData.countries.filter(function (c) { return c.region === r; });
      var seen = list.filter(function (c) { return record(c.name); }).length;
      var done = list.filter(function (c) {
        var m = record(c.name); return m && m.box >= 4;
      }).length;
      return { region: r, total: list.length, seen: seen, done: done,
               pct: Math.round((done / list.length) * 100) };
    });
  }

  /* ======================== recommendations ========================= */
  /* Each one names a real gap and says why it is being suggested. */
  function recommend(limit) {
    var out = [];
    var stats = regionStats();
    var never = unseen();
    var weak = shaky();
    var close = almost();

    /* 1. somewhere you have never been asked about */
    if (never.length) {
      var byRegion = {};
      never.forEach(function (c) { byRegion[c.region] = (byRegion[c.region] || 0) + 1; });
      var worst = Object.keys(byRegion).sort(function (a, b) { return byRegion[b] - byRegion[a]; })[0];
      var pool = never.filter(function (c) { return c.region === worst; });
      out.push({
        id: 'new-' + worst,
        icon: I.globe, tone: 'cool',
        title: 'Learn ' + Math.min(15, pool.length) + ' new places in ' + worst,
        blurb: 'Countries you haven’t been asked about yet.',
        why: never.length + ' not seen yet',
        mode: 'learn',
        config: { countries: pool.slice(0, 15).map(name), types: ['capital', 'identify'], typed: false }
      });
    }

    /* 2. the ones you keep missing */
    if (weak.length >= 4) {
      out.push({
        id: 'trouble',
        icon: I.target, tone: 'warm',
        title: 'Practice your ' + Math.min(12, weak.length) + ' weakest places',
        blurb: 'Places you’ve gotten wrong more often than right.',
        why: 'weakest by miss rate',
        mode: 'test',
        config: { countries: weak.slice(0, 12).map(name), count: Math.min(12, weak.length),
                  types: ['capital', 'country'], instant: true, timed: false }
      });
    }

    /* 3. one more correct answer moves these to mastered */
    if (close.length >= 5) {
      out.push({
        id: 'almost',
        icon: I.trophy, tone: 'cool',
        title: 'Finish off ' + Math.min(15, close.length) + ' places you almost know',
        blurb: 'Get each of these right one more time and they count as mastered.',
        why: 'in box 3 of 5',
        mode: 'cards',
        config: { countries: close.slice(0, 15).map(name), face: 'country' }
      });
    }

    /* 4. weakest region overall, once there is enough history to judge */
    var judged = stats.filter(function (r) { return r.seen >= 3; })
                      .sort(function (a, b) { return a.pct - b.pct; })[0];
    if (judged && judged.pct < 70) {
      out.push({
        id: 'region-' + judged.region,
        icon: I.layers, tone: 'warm',
        title: judged.region + ' needs work',
        blurb: 'This is your weakest region right now. Here’s a short test that covers all of it.',
        why: judged.done + '/' + judged.total + ' mastered · ' + judged.pct + '%',
        mode: 'test',
        config: { regions: [judged.region], count: 20, scope: 'un',
                  types: ['capital', 'country', 'identify'], instant: true, timed: false }
      });
    }

    /* fallback for a brand new account */
    if (!out.length) {
      out.push({
        id: 'starter',
        icon: I.book, tone: 'cool',
        title: 'Start with Europe',
        blurb: 'It has 43 countries close together, so it’s a good region to start with.',
        why: 'good place to start',
        mode: 'learn',
        config: { regions: ['Europe'], scope: 'un', types: ['capital', 'country'] }
      });
    }

    /* suggestions are practice, not classwork: nothing to hand in */
    out.forEach(function (r) { r.rec = true; });
    return out.slice(0, limit || 3);
  }

  function name(c) { return c.name; }

  /* ========================== running one ========================== */
  /* A config with no country list means "every UN member", not whatever
     regions the student happened to filter to last. */
  function withDefaults(cfg) {
    var out = {};
    Object.keys(cfg || {}).forEach(function (k) { out[k] = cfg[k]; });
    if (!out.countries || !out.countries.length) {
      out.countries = null;
      if (!out.regions) out.regions = [];
      if (!out.scope) out.scope = 'un';
    }
    return out;
  }

  function run(a) {
    var cfg = withDefaults(a.config);
    var meta = a.rec ? null : a;
    if (a.mode === 'learn') {
      global.LearnMode.applyAssignment(cfg, meta);
      global.UI.go('learn');
    } else if (a.mode === 'test') {
      global.UI.go('test');
      global.TestMode.startAssignment(cfg, meta);
    } else if (a.mode === 'cards') {
      global.CardsMode.applyAssignment(cfg, meta);
      global.UI.go('cards');
    } else if (a.mode === 'quiz') {
      global.UI.go('quiz');
      global.QuizMode.startAssignment(cfg, meta);
    } else {
      global.UI.go('learn');
    }
  }

  /* ===================== checking what came in ======================
     Codes arrive from outside, pasted from a chat or typed off a board,
     so every field is checked before any of it reaches the page. */
  var MODES = ['learn', 'test', 'quiz', 'cards'];
  var ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
  var CODE_RE = /^[A-Z0-9]{4,10}$/;
  var knownNames = null;

  function known() {
    if (!knownNames) {
      knownNames = {};
      global.GeoData.countries.forEach(function (c) { knownNames[c.name] = 1; });
    }
    return knownNames;
  }
  function str(v, max) { return String(v == null ? '' : v).trim().slice(0, max); }
  function int(v, lo, hi, dflt) {
    var n = parseInt(v, 10);
    return isNaN(n) ? dflt : Math.max(lo, Math.min(hi, n));
  }
  function countryList(v, max) {
    return (Array.isArray(v) ? v : []).filter(function (n) {
      return typeof n === 'string' && known()[n];
    }).slice(0, max || 250);
  }

  function sanitizeConfig(c) {
    c = c && typeof c === 'object' ? c : {};
    var out = {
      countries: countryList(c.countries),
      count: int(c.count, 1, 250, 20),
      types: (Array.isArray(c.types) ? c.types : []).filter(function (t) {
        return typeof t === 'string' && Object.prototype.hasOwnProperty.call(global.Quiz.types, t);
      }),
      timed: !!c.timed,
      instant: c.instant !== false,
      typed: !!c.typed,
      fill: c.fill !== false
    };
    if (!out.types.length) out.types = ['capital'];
    if (Array.isArray(c.regions)) {
      out.regions = c.regions.filter(function (r) { return global.GeoData.regions.indexOf(r) !== -1; });
    }
    if (['un', 'un-plus', 'all'].indexOf(c.scope) !== -1) out.scope = c.scope;
    if (c.face === 'country' || c.face === 'capital') out.face = c.face;
    return out;
  }

  function sanitize(a) {
    if (!a || typeof a !== 'object' || MODES.indexOf(a.mode) === -1) return null;
    var id = String(a.id || '');
    if (!ID_RE.test(id)) return null;
    var out = { id: id, title: str(a.title, 80) || 'Untitled assignment', mode: a.mode,
                config: sanitizeConfig(a.config) };
    if (typeof a.classCode === 'string' && CODE_RE.test(a.classCode)) out.classCode = a.classCode;
    if (a.from) out.from = str(a.from, 60);
    return out;
  }

  function sanitizeResult(o) {
    if (!o || typeof o !== 'object') return null;
    var id = String(o.assignmentId || '');
    var nm = str(o.name, 40);
    if (!ID_RE.test(id) || !nm) return null;
    return {
      assignmentId: id, title: str(o.title, 80), name: nm,
      pct: int(o.pct, 0, 100, 0),
      correct: int(o.correct, 0, 100000, null),
      total: int(o.total, 0, 100000, null),
      at: isFinite(o.at) && o.at > 0 ? Number(o.at) : Date.now(),
      missed: countryList(o.missed, 60)
    };
  }

  /* ======================= country picker ========================== */
  /* A typeahead over all 213 places. Returns the chosen names in order. */
  function picker(host, opts) {
    opts = opts || {};
    var chosen = (opts.initial || []).slice();
    var cursor = 0, hits = [];

    host.classList.add('picker');
    host.innerHTML =
      '<div class="picker__field" data-field>' +
        '<input type="text" placeholder="' + (opts.placeholder || 'Type a country or capital…') + '" ' +
          'autocomplete="off" spellcheck="false" data-input>' +
      '</div>' +
      '<div class="picker__hits hidden" data-hits></div>' +
      '<div class="picker__bulk">' +
        '<button class="mini-btn" data-bulk="clear">Clear</button>' +
        global.GeoData.regions.map(function (r) {
          return '<button class="mini-btn" data-bulk="' + r + '">+ ' + r + '</button>';
        }).join('') +
      '</div>';

    var field = host.querySelector('[data-field]');
    var input = host.querySelector('[data-input]');
    var hitBox = host.querySelector('[data-hits]');

    /* Ranked by how the match starts, not by where the country happens to
       sit in the dataset. Both tests were already here, but ORed together
       inside one filter they came out in dataset order, which put Namibia
       ahead of India for "ind" (Windhoek) and Benin ahead of Portugal for
       "port" (Porto-Novo). Sorting is stable, so ties keep that order. */
    function search(q) {
      var n = W.normalise(q);
      if (!n) return [];
      var hits = [];
      global.GeoData.countries.forEach(function (c) {
        if (chosen.indexOf(c.name) !== -1) return;
        var name = W.normalise(c.name), cap = W.normalise(c.capital);
        var rank = name.indexOf(n) === 0 ? 0     /* the country starts with it */
                 : cap.indexOf(n) === 0  ? 1     /* its capital does */
                 : name.indexOf(n) !== -1 ? 2    /* it is in the name somewhere */
                 : cap.indexOf(n) !== -1  ? 3    /* or in the capital */
                 : -1;
        if (rank !== -1) hits.push({ c: c, rank: rank });
      });
      hits.sort(function (a, b) { return a.rank - b.rank; });
      return hits.slice(0, 8).map(function (h) { return h.c; });
    }

    function drawTokens() {
      W.$$('.token', field).forEach(function (t) { t.remove(); });
      chosen.forEach(function (nm) {
        var t = W.el('span', 'token', W.escapeHtml(nm) +
          '<button type="button" aria-label="Remove ' + W.escapeHtml(nm) + '">' + I.close + '</button>');
        t.querySelector('button').addEventListener('click', function () {
          chosen = chosen.filter(function (x) { return x !== nm; });
          drawTokens(); notify();
        });
        field.insertBefore(t, input);
      });
    }

    function drawHits() {
      if (!hits.length) { hitBox.classList.add('hidden'); hitBox.innerHTML = ''; return; }
      hitBox.classList.remove('hidden');
      hitBox.innerHTML = hits.map(function (c, i) {
        return '<button type="button" class="picker__hit' + (i === cursor ? ' is-cursor' : '') +
          '" data-i="' + i + '"><b>' + W.escapeHtml(c.name) + '</b>' +
          '<small>' + W.escapeHtml(c.capital) + ' · ' + c.region + '</small></button>';
      }).join('');
      W.$$('.picker__hit', hitBox).forEach(function (b) {
        b.addEventListener('mousedown', function (e) { e.preventDefault(); add(hits[+b.dataset.i]); });
      });
    }

    function add(c) {
      if (!c || chosen.indexOf(c.name) !== -1) return;
      chosen.push(c.name);
      input.value = ''; hits = []; cursor = 0;
      drawTokens(); drawHits(); notify();
      input.focus();
    }

    function notify() { if (opts.onChange) opts.onChange(chosen.slice()); }

    input.addEventListener('input', function () {
      hits = search(input.value); cursor = 0; drawHits();
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); cursor = Math.min(cursor + 1, hits.length - 1); drawHits(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); cursor = Math.max(cursor - 1, 0); drawHits(); }
      else if (e.key === 'Enter') { e.preventDefault(); add(hits[cursor]); }
      else if (e.key === 'Backspace' && !input.value && chosen.length) {
        chosen.pop(); drawTokens(); notify();
      }
    });
    input.addEventListener('blur', function () {
      setTimeout(function () { hits = []; drawHits(); }, 120);
    });
    field.addEventListener('click', function () { input.focus(); });

    W.$$('[data-bulk]', host).forEach(function (b) {
      b.addEventListener('click', function () {
        var v = b.dataset.bulk;
        if (v === 'clear') chosen = [];
        else {
          global.GeoData.countries.filter(function (c) {
            return c.region === v && c.status === 0 && chosen.indexOf(c.name) === -1;
          }).forEach(function (c) { chosen.push(c.name); });
        }
        drawTokens(); notify();
      });
    });

    drawTokens();
    return {
      get value() { return chosen.slice(); },
      set: function (list) { chosen = list.slice(); drawTokens(); notify(); },
      focus: function () { input.focus(); }
    };
  }

  /* Turn a list of names into country objects, dropping anything unknown. */
  function resolve(names) {
    return (names || []).map(function (n) {
      return global.GeoData.countries.filter(function (c) { return c.name === n; })[0];
    }).filter(Boolean);
  }

  /* ============================ handing in ========================== */
  /* Record a finished assignment against the student's inbox. Returns the
     inbox entry, or null when it was not classwork (a suggestion, or a
     teacher previewing their own assignment). Signed-in students in an
     online class have the score sent to the teacher straight away. */
  var pendingSends = {};

  function complete(a, pct, correct, total, missed) {
    if (!a || !a.id) return null;
    var box = W.state.inbox || [];
    var item = null;
    for (var i = 0; i < box.length; i++) if (box[i].id === a.id) item = box[i];
    if (!item) return null;

    item.done = true;
    item.attempts = (item.attempts || 0) + 1;
    item.best = Math.max(item.best || 0, pct);
    item.last = { pct: pct, correct: correct, total: total,
                  missed: (missed || []).slice(0, 60), at: Date.now(), sent: false };
    W.saveNow();
    if (global.Cloud && global.Cloud.canSubmit(item)) submitOnline(item).catch(function () {});
    return item;
  }

  function submitOnline(item) {
    var L = item.last;
    var p = global.Cloud.submitResult(item, L.pct, L.correct, L.total, L.missed || [])
      .then(function () {
        delete pendingSends[item.id];
        L.sent = true;
        W.save();
        W.toast('Score sent', (item.from || 'Your teacher') + ' has it now', I.check);
        refreshClassroom();
      }, function (e) {
        delete pendingSends[item.id];
        W.toast('Couldn’t send your score', 'It will try again on its own', I.info, 4200);
        throw e;
      });
    pendingSends[item.id] = p;
    return p;
  }

  /* The Send button. Scores go over the network or they wait: there is no
     longer a code to read out, so a score that cannot go now is queued and
     flushed the moment the connection comes back. */
  function send(item) {
    if (!item || !item.last) return;
    var L = item.last;
    if (L.sent) { W.toast('Already sent', (item.from || 'Your teacher') + ' has this score', I.check); return; }
    if (pendingSends[item.id]) return;
    if (global.Cloud && global.Cloud.canSubmit(item)) { submitOnline(item).catch(function () {}); return; }

    W.toast('Saved, not sent yet',
            global.Cloud && global.Cloud.signedIn
              ? 'You are offline. It goes to your teacher as soon as you are back.'
              : 'Sign in and it goes to your teacher on its own.',
            I.info, 4200);
  }

  /* Everything finished but unsent, tried again. Called whenever the
     connection or the sign-in state turns good. */
  function flushUnsent() {
    var C = global.Cloud;
    if (!C || !C.ready) return;
    (W.state.inbox || []).forEach(function (item) {
      if (!item.last || item.last.sent || pendingSends[item.id]) return;
      if (!C.canSubmit(item)) return;
      submitOnline(item).catch(function () {});
    });
  }

  /* cloud.js is loaded after this file, so the hook goes on once the page
     is together rather than while this one is still being parsed. */
  function hookCloud() {
    if (global.Cloud && global.Cloud.onChange) {
      global.Cloud.onChange(function (st) { if (st === 'synced') flushUnsent(); });
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hookCloud);
  } else hookCloud();

  function sendLabel(item) {
    if (item && item.last && item.last.sent) return 'Sent to your teacher ✓';
    if (item && pendingSends[item.id]) return 'Sending to your teacher…';
    return 'Send score to teacher';
  }

  /* Fill a button with the right label and keep it honest while a send
     is in flight. */
  function wireSend(btn, item) {
    if (!btn || !item) return;
    function paint() { btn.innerHTML = I.key + ' ' + W.escapeHtml(sendLabel(item)); }
    function follow() { var p = pendingSends[item.id]; if (p) p.then(paint, paint); }
    paint(); follow();
    btn.addEventListener('click', function () { send(item); paint(); follow(); });
  }

  function refreshClassroom() {
    var v = document.getElementById('view-classroom');
    if (v && !v.classList.contains('hidden') && global.Classroom) global.Classroom.render();
  }

  global.Assignments = {
    complete: complete, send: send, sendLabel: sendLabel, wireSend: wireSend,
    sanitize: sanitize, sanitizeResult: sanitizeResult, withDefaults: withDefaults,
    recommend: recommend, run: run,
    flushUnsent: flushUnsent,
    picker: picker, resolve: resolve,
    regionStats: regionStats, unseen: unseen, shaky: shaky, almost: almost
  };
})(window);
