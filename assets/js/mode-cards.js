/* ------------------------------------------------------------------
   LearnGeo — Flashcards (rebuilt)

   The sidebar stays a short summary; deck settings live in a modal so
   nothing in this view ever needs scrolling. The card is sized to the
   viewport, and the map underneath only uncovers once you flip.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons;

  var cfg = { scope: 'un', regions: [], countries: null, face: 'country', size: 25 };
  var deck = [], pos = 0, flipped = false, built = false, celebrated = false;
  var tally = { again: 0, hard: 0, good: 0, easy: 0, done: 0 };
  var job = null;   /* classwork: { meta, size, first: name -> first rating, item, pct } */

  function side()  { return document.getElementById('cards-body'); }
  function head()  { return document.getElementById('cards-head'); }
  function foot()  { return document.getElementById('cards-foot'); }
  function stage() { return document.getElementById('cards-stage'); }

  function start() {
    global.GeoMap.loadShapes();
    if (!built) build();
    renderSidebar();
    renderCard();
  }

  function build() {
    var list = global.Quiz.pool({ scope: cfg.scope, regions: cfg.regions, countries: cfg.countries, weakFirst: true });
    if (!list.length) list = global.Quiz.pool({ scope: 'all' });
    deck = list.slice(0, Math.min(cfg.size, list.length));
    pos = 0; flipped = false; built = true; celebrated = false;
    tally = { again: 0, hard: 0, good: 0, easy: 0, done: 0 };
    if (job) { job.size = deck.length; job.first = {}; job.item = null; }
  }

  function current() { return deck[pos]; }
  function reviewed() { return tally.again + tally.hard + tally.good + tally.easy; }

  /* ------------------------------ card ------------------------------ */
  function renderCard() {
    var host = stage();
    if (!host) return;
    if (!deck.length) return renderComplete();

    var c = current();
    var askCountry = cfg.face === 'country';
    var frontTerm = askCountry ? c.name : c.capital;
    var backTerm  = askCountry ? c.capital : c.name;
    var pct = (tally.done / Math.max(1, tally.done + deck.length)) * 100;

    host.innerHTML =
      '<div class="fc-wrap">' +
        '<div class="fc-card' + (flipped ? ' is-flipped' : '') + '" id="fc-card" tabindex="0" ' +
          'role="button" aria-label="Flashcard, press space to flip">' +
          '<div class="fc-inner">' +

            '<div class="fc-face">' +
              '<div class="fc-face__top">' +
                '<span class="eyebrow">' + (askCountry ? 'Country' : 'Capital city') + '</span>' +
                '<span class="eyebrow">' + W.escapeHtml(c.region) + '</span>' +
              '</div>' +
              '<div class="fc-term">' + W.escapeHtml(frontTerm) + '</div>' +
              '<div class="fc-sub">' + (askCountry ? 'What is its capital?' : 'Which country?') + '</div>' +
              '<div class="fc-flip-hint">Click the card or press Space to flip</div>' +
            '</div>' +

            '<div class="fc-face fc-face--back">' +
              '<div class="fc-face__top">' +
                '<span class="eyebrow">' + (askCountry ? 'Capital city' : 'Country') + '</span>' +
                '<span class="eyebrow">' + W.escapeHtml(c.region) + '</span>' +
              '</div>' +
              '<div class="fc-term">' + W.escapeHtml(backTerm) + '</div>' +
              (c.note ? '<div class="fc-note">' + W.escapeHtml(c.note) + '</div>' : '') +
              '<div class="fc-coord mono">' + c.lat.toFixed(2) + '°, ' + c.lon.toFixed(2) + '°</div>' +
            '</div>' +

          '</div>' +
        '</div>' +

        '<div class="fc-actions">' +
          (flipped
            ? '<div class="fc-rate" id="fc-rate">' +
                rate('again', 'Again', 'soon', 'r-again') +
                rate('hard',  'Hard',  'later', 'r-hard') +
                rate('good',  'Good',  'done', 'r-good') +
                rate('easy',  'Easy',  'done', 'r-easy') +
              '</div>'
            : '<button class="btn btn--primary btn--block btn--lg" id="fc-flip">Flip card</button>') +
        '</div>' +

        '<div class="fc-progress">' +
          '<div class="pbar"><div class="pbar__fill pbar__fill--success" style="width:' + pct + '%"></div></div>' +
          '<span class="mono">' + tally.done + ' / ' + (tally.done + deck.length) + '</span>' +
        '</div>' +
      '</div>';

    var card = document.getElementById('fc-card');
    card.addEventListener('click', flip);
    card.addEventListener('keydown', function (e) {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); }
    });
    var fb = document.getElementById('fc-flip');
    if (fb) fb.addEventListener('click', function (e) { e.stopPropagation(); flip(); });
    W.$$('#fc-rate button').forEach(function (b) {
      b.addEventListener('click', function () { grade(b.dataset.r, b); });
    });

    paintMap(flipped);
    renderSidebar();

    function rate(id, label, sub, cls) {
      return '<button class="' + cls + '" data-r="' + id + '">' + label + '<span>' + sub + '</span></button>';
    }
  }

  function flip() {
    if (flipped) return;
    flipped = true;
    W.Sound.flip();
    var el = document.getElementById('fc-card');
    if (el) el.classList.add('is-flipped');
    paintMap(true);
    setTimeout(renderCard, 320);
  }

  function grade(r, node) {
    var c = current();
    if (!c) return;
    tally[r] += 1;
    if (job && !(c.name in job.first)) job.first[c.name] = r;
    W.state.stats.cards += 1;

    var m = W.state.mastery[c.name] || { c: 0, w: 0, box: 0 };
    if (r === 'again')     { m.box = 0; m.w += 1; }
    else if (r === 'hard') { m.box = Math.max(0, m.box - 1); }
    else if (r === 'good') { m.box = Math.min(5, m.box + 1); m.c += 1; }
    else                   { m.box = Math.min(5, m.box + 2); m.c += 1; }
    W.state.mastery[c.name] = m;

    if (r === 'good' || r === 'easy') {
      var gains = W.award(true, { baseXp: r === 'easy' ? 5 : 7, baseGems: 2 });
      W.Sound.correct(W.state.streak.current);
      W.burstFrom(node, gains);
      if (gains.level) {
        W.Sound.levelUp();
        W.confetti({ count: 90, power: 300, y: window.innerHeight * 0.4 });
        W.toast('Level ' + gains.level, 'Flashcards count toward your level too', I.bolt);
      }
      tally.done += 1;
      deck.splice(pos, 1);
      if (pos >= deck.length) pos = 0;
    } else {
      var card = deck.splice(pos, 1)[0];
      deck.splice(Math.min(deck.length, pos + (r === 'again' ? 3 : 8)), 0, card);
      if (pos >= deck.length) pos = 0;
      W.Sound.wrong();
    }

    W.save();
    global.UI.refreshHud(true);
    W.checkAchievements().forEach(function (a, i) {
      setTimeout(function () { W.toast('Achievement: ' + a.name, '+' + a.reward + ' 💎', I.trophy, 4000); }, 480 + i * 440);
    });

    flipped = false;
    renderCard();
  }

  /* Classwork score: the share of cards known on first sight (Good or Easy). */
  function handIn() {
    var names = Object.keys(job.first);
    var known = names.filter(function (n) { return job.first[n] === 'good' || job.first[n] === 'easy'; }).length;
    var total = job.size || names.length || 1;
    var missed = names.filter(function (n) { return job.first[n] === 'again' || job.first[n] === 'hard'; });
    job.pct = Math.round((known / total) * 100);
    job.item = global.Assignments.complete(job.meta, job.pct, known, total, missed);
  }

  function renderComplete() {
    /* celebrate once per deck, not every time the tab is reopened */
    if (!celebrated) {
      celebrated = true;
      W.Sound.finish();
      W.confetti({ count: 130, power: 340, y: window.innerHeight * 0.36 });
      if (job && !job.item) handIn();
    }
    var showSend = !!(job && job.item && !global.UI.previewing);
    stage().innerHTML =
      '<div class="fc-wrap t-center">' +
        '<div class="levelup" style="border:1px solid var(--line);border-radius:20px;background:#fff;box-shadow:var(--shadow-lg)">' +
          '<div class="levelup__ring" style="background:linear-gradient(135deg,var(--success),#34D399)">' + I.check + '</div>' +
          '<h3>Deck cleared</h3>' +
          '<p>You finished ' + tally.done + ' cards in ' + reviewed() + ' reviews.</p>' +
          '<div class="row" style="justify-content:center;gap:8px;margin-top:18px;flex-wrap:wrap">' +
            '<span class="chip chip--xp mono">' + tally.good + ' good</span>' +
            '<span class="chip chip--gem mono">' + tally.easy + ' easy</span>' +
            '<span class="chip chip--fire mono">' + (tally.again + tally.hard) + ' repeated</span>' +
          '</div>' +
          (showSend
            ? '<p class="t-sm t-muted" style="margin-top:16px">Assignment score: <b>' + job.pct +
                '%</b> right on the first try</p>' +
              '<div><button class="btn btn--primary btn--lg" style="margin-top:12px" id="fc-send"></button></div>'
            : '') +
          '<button class="btn btn--accent btn--lg" style="margin-top:20px" id="fc-new">Make a new deck</button>' +
        '</div>' +
      '</div>';
    if (showSend) global.Assignments.wireSend(document.getElementById('fc-send'), job.item);
    document.getElementById('fc-new').addEventListener('click', function () { build(); renderCard(); });
    paintMap(false);
    renderSidebar();
  }

  /* ------------------------------ map ------------------------------- */
  function paintMap(reveal) {
    var host = document.getElementById('cards-map');
    var veil = document.getElementById('cards-veil');
    if (veil) veil.classList.toggle('is-gone', !!reveal);
    if (!host || !global.GeoMap.ensure(host)) return;
    global.GeoMap.clear();
    global.GeoMap.setGuard(false);   /* the veil hides the map until the flip */
    var c = current();
    if (!c || !reveal) { global.GeoMap.reset(); return; }
    global.GeoMap.drawCountry(c, 'right', null, c.name);
    global.GeoMap.frame(c, 60);
  }

  /* ---------------------------- sidebar ----------------------------- */
  function renderSidebar() {
    if (!head()) return;
    head().innerHTML =
      '<div class="sidebar__title">Flashcards</div>' +
      '<div class="t-sm t-muted" style="margin-top:2px">' +
        (job ? 'Assignment: ' + W.escapeHtml(job.meta.title) : deckLabel()) + '</div>';

    side().innerHTML =
      '<div class="deck-summary">' +
        '<div class="deck-summary__n mono">' + deck.length + '</div>' +
        '<div class="deck-summary__l">cards left</div>' +
        '<div class="pbar" style="margin-top:12px"><div class="pbar__fill pbar__fill--success" style="width:' +
          ((tally.done / Math.max(1, tally.done + deck.length)) * 100) + '%"></div></div>' +
      '</div>' +

      '<div class="divider"></div>' +
      '<span class="eyebrow">This session</span>' +
      '<div class="deck-stat" style="margin-top:12px">' +
        tile('Again', tally.again, 'var(--danger)') + tile('Hard', tally.hard, '#B45309') +
        tile('Good', tally.good, 'var(--accent)') + tile('Easy', tally.easy, 'var(--success)') +
      '</div>' +

      '<div class="divider"></div>' +
      '<button class="btn btn--ghost btn--block" id="fc-settings">' + I.layers + ' Deck settings</button>';

    document.getElementById('fc-settings').addEventListener('click', openSettings);

    foot().innerHTML = '<button class="btn btn--primary btn--block" id="fc-rebuild">' +
      I.refresh + ' Rebuild deck</button>';
    document.getElementById('fc-rebuild').addEventListener('click', function () {
      build(); renderCard();
      W.toast('Deck rebuilt', deck.length + ' cards, weakest first', I.cards);
    });

    function tile(l, n, col) {
      return '<div><b style="color:' + col + '">' + n + '</b><span>' + l + '</span></div>';
    }
  }

  function deckLabel() {
    var scope = { un: 'UN 193', 'un-plus': 'UN + observers', all: 'All 213' }[cfg.scope];
    var reg = cfg.regions.length ? cfg.regions.length + ' regions' : 'all regions';
    return scope + ' · ' + reg + ' · ' + (cfg.face === 'country' ? 'country → capital' : 'capital → country');
  }

  /* Settings live in a modal so the sidebar never has to scroll. */
  function openSettings() {
    var regions = global.GeoData.regions;
    global.UI.modal({
      title: 'Deck settings', icon: I.cards,
      body:
        '<div class="field"><label class="field__label">Card front</label>' +
          '<div class="seg" id="fcs-face">' + sg('country', 'Country', cfg.face) + sg('capital', 'Capital', cfg.face) + '</div>' +
          '<div class="field__hint">Switch this to practice the other way around.</div></div>' +
        '<div class="field"><label class="field__label">Set</label>' +
          '<div class="seg" id="fcs-scope">' + sg('un', 'UN 193', cfg.scope) + sg('un-plus', '+ Observers', cfg.scope) +
          sg('all', 'All 213', cfg.scope) + '</div></div>' +
        '<div class="field"><label class="field__label">Regions</label>' +
          '<div class="check-grid" id="fcs-regions">' +
            regions.map(function (r) {
              var on = !cfg.regions.length || cfg.regions.indexOf(r) !== -1;
              return '<button class="check ' + (on ? 'is-on' : '') + '" data-v="' + r + '">' +
                '<span class="check__box">' + I.check + '</span>' + r + '</button>';
            }).join('') + '</div></div>' +
        '<div class="field"><label class="field__label">Deck size</label>' +
          '<div class="seg" id="fcs-size">' + ['10', '25', '50', '100'].map(function (n) {
            return sg(n, n, String(cfg.size)); }).join('') + '</div></div>',
      actions: [
        { label: 'Cancel', cls: 'btn--ghost', close: true },
        { label: 'Rebuild deck', cls: 'btn--accent', close: true, onClick: apply }
      ],
      onMount: function (m) { global.UI.wireSeg(m); global.UI.wireCheck(m); }
    });

    function sg(v, l, cur) { return '<button data-v="' + v + '" class="' + (cur === v ? 'is-active' : '') + '">' + l + '</button>'; }

    function apply(m) {
      var v = function (sel) { var n = W.$(sel + ' .is-active', m); return n ? n.dataset.v : null; };
      cfg.face = v('#fcs-face') || 'country';
      cfg.scope = v('#fcs-scope') || 'un';
      cfg.size = parseInt(v('#fcs-size') || '25', 10);
      var regs = W.$$('#fcs-regions .check.is-on', m).map(function (n) { return n.dataset.v; });
      cfg.regions = regs.length === global.GeoData.regions.length ? [] : regs;
      cfg.countries = null;   /* choosing filters by hand replaces an assignment */
      job = null;
      build(); renderCard();
      W.toast('Deck rebuilt', deck.length + ' cards · ' + deckLabel(), I.cards);
    }
  }

  document.addEventListener('keydown', function (e) {
    if (!document.body.classList.contains('view-cards')) return;
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    if (document.querySelector('.overlay')) return;
    if (!flipped && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); flip(); }
    else if (flipped && /^[1-4]$/.test(e.key)) {
      var b = W.$('#fc-rate [data-r="' + { '1': 'again', '2': 'hard', '3': 'good', '4': 'easy' }[e.key] + '"]');
      if (b) { e.preventDefault(); b.click(); }
    }
  });

  /* Entry point for recommendations and teacher assignments. */
  function applyAssignment(a, meta) {
    cfg.countries = (a.countries && a.countries.length) ? a.countries : null;
    cfg.regions = a.regions || [];
    cfg.scope = a.scope || 'un';
    if (a.face) cfg.face = a.face;
    cfg.size = cfg.countries ? Math.max(10, cfg.countries.length)
                             : Math.max(10, Math.min(100, a.count || 25));
    job = meta ? { meta: meta, size: 0, first: {}, item: null, pct: 0 } : null;
    build();
    renderCard();
  }

  global.CardsMode = { start: start, applyAssignment: applyAssignment,
    rebuild: function () { build(); renderCard(); } };
})(window);
