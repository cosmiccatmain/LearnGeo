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
        title: 'Meet ' + Math.min(15, pool.length) + ' new places in ' + worst,
        blurb: 'Countries you have not been asked about even once.',
        why: never.length + ' unseen overall',
        mode: 'learn',
        config: { countries: pool.slice(0, 15).map(name), types: ['capital', 'identify'], typed: false }
      });
    }

    /* 2. the ones you keep missing */
    if (weak.length >= 4) {
      out.push({
        id: 'trouble',
        icon: I.target, tone: 'warm',
        title: 'Drill your ' + Math.min(12, weak.length) + ' worst answers',
        blurb: 'The places you have missed more often than you have got right.',
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
        title: 'Finish off ' + Math.min(15, close.length) + ' near-mastered places',
        blurb: 'One more clean answer each and these count as mastered.',
        why: 'sitting at box 3 of 5',
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
        blurb: 'Your weakest region right now. A short section covering all of it.',
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
        blurb: 'Forty-three countries packed close together. A good first region.',
        why: 'suggested opener',
        mode: 'learn',
        config: { regions: ['Europe'], scope: 'un', types: ['capital', 'country'] }
      });
    }

    return out.slice(0, limit || 3);
  }

  function name(c) { return c.name; }

  /* ========================== running one ========================== */
  function run(a) {
    var cfg = a.config || {};
    if (a.mode === 'learn' && global.LearnMode.applyAssignment) {
      global.LearnMode.applyAssignment(cfg);
      global.UI.go('learn');
    } else if (a.mode === 'test' && global.TestMode.startAssignment) {
      global.UI.go('test');
      global.TestMode.startAssignment(cfg, a);
    } else if (a.mode === 'cards' && global.CardsMode.applyAssignment) {
      global.CardsMode.applyAssignment(cfg);
      global.UI.go('cards');
    } else if (a.mode === 'quiz') {
      global.UI.go('quiz');
    } else {
      global.UI.go(a.mode || 'learn');
    }
  }

  /* ====================== share codes ============================== */
  /* An assignment is JSON, deflated to base64url so it can be pasted
     into a chat or written on a board without a server in the middle. */
  function encode(a) {
    try {
      var json = JSON.stringify(a);
      var bytes = new TextEncoder().encode(json);
      var bin = '';
      bytes.forEach(function (b) { bin += String.fromCharCode(b); });
      return 'LG1-' + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    } catch (e) { return null; }
  }

  function decode(code) {
    try {
      var raw = String(code || '').trim().replace(/^LG1-/, '');
      raw = raw.replace(/-/g, '+').replace(/_/g, '/');
      while (raw.length % 4) raw += '=';
      var bin = atob(raw);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      var obj = JSON.parse(new TextDecoder().decode(bytes));
      if (!obj || !obj.mode) throw new Error('bad payload');
      return obj;
    } catch (e) { return null; }
  }

  /* The way back: a student turns a finished assignment into a short code
     and sends it to the teacher, who pastes it in to record the score.
     Same idea as the assignment code, running the other direction. */
  function encodeResult(r) {
    try {
      /* 'm' carries the countries that were missed, which is what makes the
         class analytics worth reading: you can see what the room found hard. */
      var payload = { k: 'r', a: r.assignmentId, t: r.title, n: r.name,
                      p: r.pct, c: r.correct, q: r.total, d: Date.now(),
                      m: (r.missed || []).slice(0, 40) };
      var bytes = new TextEncoder().encode(JSON.stringify(payload));
      var bin = '';
      bytes.forEach(function (b) { bin += String.fromCharCode(b); });
      return 'LGR-' + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    } catch (e) { return null; }
  }

  function decodeResult(code) {
    try {
      var raw = String(code || '').trim().replace(/^LGR-/, '');
      raw = raw.replace(/-/g, '+').replace(/_/g, '/');
      while (raw.length % 4) raw += '=';
      var bin = atob(raw);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      var o = JSON.parse(new TextDecoder().decode(bytes));
      if (!o || o.k !== 'r') throw new Error('not a result');
      return { assignmentId: o.a, title: o.t, name: o.n, pct: o.p,
               correct: o.c, total: o.q, at: o.d, missed: o.m || [] };
    } catch (e) { return null; }
  }

  /* A class is twenty codes, not one. Pull every LGR- token out of whatever
     was pasted, in any order, separated by anything. */
  function decodeResultBatch(text) {
    var tokens = String(text || '').match(/LGR-[A-Za-z0-9_-]+/g) || [];
    var out = { ok: [], bad: 0 };
    tokens.forEach(function (t) {
      var r = decodeResult(t);
      if (r) out.ok.push(r); else out.bad += 1;
    });
    return out;
  }

  function classCode() {
    var abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   /* no I/O/0/1 */
    var out = '';
    for (var i = 0; i < 6; i++) out += abc[(Math.random() * abc.length) | 0];
    return out;
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

    function search(q) {
      var n = W.normalise(q);
      if (!n) return [];
      return global.GeoData.countries.filter(function (c) {
        if (chosen.indexOf(c.name) !== -1) return false;
        return W.normalise(c.name).indexOf(n) === 0 ||
               W.normalise(c.capital).indexOf(n) === 0 ||
               W.normalise(c.name).indexOf(n) !== -1 ||
               W.normalise(c.capital).indexOf(n) !== -1;
      }).slice(0, 8);
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

  /* Record a finished assignment against the student's inbox. */
  function complete(id, pct, correct, total) {
    if (!id) return;
    var box = W.state.inbox || [];
    for (var i = 0; i < box.length; i++) {
      if (box[i].id === id) {
        var prev = box[i].best || 0;
        box[i].done = true;
        box[i].attempts = (box[i].attempts || 0) + 1;
        box[i].best = Math.max(prev, pct);
        box[i].last = { pct: pct, correct: correct, total: total, at: Date.now() };
        W.saveNow();
        return box[i];
      }
    }
    return null;
  }

  global.Assignments = {
    complete: complete,
    recommend: recommend, run: run,
    encode: encode, decode: decode, classCode: classCode,
    encodeResult: encodeResult, decodeResult: decodeResult,
    decodeResultBatch: decodeResultBatch,
    picker: picker, resolve: resolve,
    regionStats: regionStats, unseen: unseen, shaky: shaky, almost: almost
  };
})(window);
