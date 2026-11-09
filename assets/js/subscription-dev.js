/* ------------------------------------------------------------------
   LearnGeo — plans (Free / Plus / Schools). LEA-122.

   Opened from locked Plus games / cosmetics (upgrade path), from a
   Schools-only Geo Classroom gate, or from Administrator → Development
   / the `plans` command (TEST tools).

   Checkout is MOCKED. No Stripe keys, no network charges. Granting a
   plan for real in TEST mode:
     - UltraAdmin / owner (alexjschendel@gmail.com) mock Pay sets
       flags.plan locally and calls ultra_set_plan / ultra_set_premium
       when signed in.
     - Everyone else sees the pitch; Pay stays mock and does not grant
       entitlement. Mock subscribe still counts for the owner TEST path,
       and badges award once (idempotent) from that grant.

   Public paywall stays behind Administrator → Development →
   “Premium plans & gating preview”.

   LEA-127: the plans and checkout screens stay plain. Prices and
   plan rules are unchanged. Mock checkout only.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons;
  var OWNER_EMAIL = 'alexjschendel@gmail.com';

  var root = null;
  var gateReason = '';
  var students = 25;

  var PLANS = [
    {
      id: 'free',
      name: 'Free',
      blurb: 'Study and play the core Games. Ads can show when we turn them back on.',
      price: 0,
      cta: 'Stay on Free',
      tone: 'free',
      features: [
        { t: 'Learn, practice test, and class quiz', on: true },
        { t: 'Popular Games and a basic cosmetics locker', on: true },
        { t: 'Join a classroom with a class code', on: true },
        { t: 'Ads, once placements are turned back on', on: true },
        { t: 'No ads', on: false },
        { t: 'Plus games, skins, and the Plus badge', on: false },
        { t: 'Full Geo Classroom', on: false }
      ]
    },
    {
      id: 'plus',
      name: 'Plus',
      blurb: 'The reason to upgrade: no ads. Plus a Plus badge and ten extra games and looks.',
      price: 6,
      cta: 'Get Plus (mock)',
      tone: 'plus',
      features: [
        { t: 'Everything in Free, with no ads', on: true },
        { t: 'Plus badge beside your name', on: true },
        { t: 'Geo Invaders, Flag Breakout, Capital Typer, Flag Echo', on: true },
        { t: 'Embers, Chicken Wings, and Deep Current', on: true },
        { t: 'Ember Wake, Gilded Cube, and Meridian Gold', on: true },
        { t: 'Full Geo Classroom', on: false },
        { t: 'Education badge', on: false }
      ]
    },
    {
      id: 'schools',
      name: 'Schools',
      blurb: 'Everything in Plus, priced per student. Full Geo Classroom, with extra protection.',
      price: 2,
      per: 'student',
      cta: 'Get Schools (mock)',
      tone: 'schools',
      features: [
        { t: 'Everything in Plus, including no ads', on: true },
        { t: 'Education badge, distinct from Plus', on: true },
        { t: 'Full access to Geo Classroom', on: true },
        { t: 'No messaging between students', on: true },
        { t: 'No ad pixels or cross-site ad tracking', on: true },
        { t: '$2 per student — the slider sets the total', on: true }
      ]
    }
  ];

  var COMPARE = [
    { label: 'Study modes', free: true, plus: true, schools: true },
    { label: 'Popular Games', free: true, plus: true, schools: true },
    { label: 'Ads when placements are on', free: true, plus: false, schools: false },
    { label: 'Plus badge', free: false, plus: true, schools: true },
    { label: 'Ten extra games and looks', free: false, plus: true, schools: true },
    { label: 'Education badge', free: false, plus: false, schools: true },
    { label: 'Messaging between students', free: true, plus: true, schools: false },
    { label: 'Ad pixels / cross-site ad tracking', free: 'When ads are on', plus: false, schools: false },
    { label: 'Join with a class code', free: true, plus: true, schools: true },
    { label: 'Full Geo Classroom', free: false, plus: false, schools: true }
  ];

  function esc(s) { return W.escapeHtml(String(s == null ? '' : s)); }

  function isOwnerOrUltra() {
    if (global.Admin && global.Admin.can && global.Admin.can('ultra')) return true;
    try {
      var c = global.Cloud && global.Cloud.user;
      var email = (c && c.email) || '';
      return String(email).toLowerCase() === OWNER_EMAIL;
    } catch (e) { return false; }
  }

  function canGrantTest() {
    return isOwnerOrUltra();
  }

  function clampStudents(n) {
    if (global.Premium && global.Premium.clampStudents) return global.Premium.clampStudents(n);
    n = parseInt(n, 10);
    if (!isFinite(n)) n = 25;
    if (n < 1) n = 1;
    if (n > 400) n = 400;
    return n;
  }

  function schoolsTotal() { return clampStudents(students) * 2; }

  function currentPlanId() {
    if (global.Premium && global.Premium.plan) return global.Premium.plan();
    var s = W.state && W.state.flags;
    if (s && (s.plan === 'plus' || s.plan === 'schools' || s.plan === 'free')) return s.plan;
    if (s && s.premium) return 'plus';
    return 'free';
  }

  function mark(v) {
    if (v === true) return '<span class="subdev__yes">' + (I.check || '✓') + '</span>';
    if (v === false) return '<span class="subdev__no">—</span>';
    return esc(v);
  }

  function open(opts) {
    opts = opts || {};
    /* Public upgrade path only while Development preview is on.
       Admin Development / plans command may pass force: true for TEST. */
    if (!opts.force && global.Premium && global.Premium.previewEnabled &&
        !global.Premium.previewEnabled()) {
      return;
    }
    gateReason = opts.reason || '';
    if (global.Premium && global.Premium.studentCount && currentPlanId() === 'schools') {
      students = global.Premium.studentCount();
    }
    if (root) { render(); return; }
    build();
  }

  function openUpgrade(reason) {
    open({ reason: reason || 'Plus is no ads, a Plus badge, and ten extra games and looks.' });
  }

  function openForced(reason) {
    open({ force: true, reason: reason || '' });
  }

  function close() {
    if (!root) return;
    root.remove();
    root = null;
    gateReason = '';
    document.removeEventListener('keydown', onKey);
  }

  function onKey(e) {
    if (!root) { document.removeEventListener('keydown', onKey); return; }
    if (e.key === 'Escape' && !document.querySelector('.overlay')) close();
  }

  function build() {
    root = W.el('div', 'subdev');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'LearnGeo plans');
    root.innerHTML =
      '<div class="subdev__ribbon" role="status">' +
        '<b>DEV PREVIEW</b>' +
        '<span>Free, Plus, and Schools · mock checkout only (TEST grants for owner/admin) · not live billing</span>' +
      '</div>' +
      '<div class="subdev__bar">' +
        '<div class="subdev__brand">' + (I.globe || '') + ' LearnGeo</div>' +
        '<span class="subdev__tag">' + (canGrantTest() ? 'TEST grant ready' : 'Upgrade path') + '</span>' +
        '<div class="grow"></div>' +
        '<button type="button" class="btn btn--ghost btn--sm" id="subdev-back">' +
          (I.arrowL || '') + ' Close</button>' +
        '<button type="button" class="icon-btn" id="subdev-close" title="Close">' +
          (I.close || '') + '</button>' +
      '</div>' +
      '<div class="subdev__scroll">' +
        '<div class="subdev__inner" id="subdev-body"></div>' +
      '</div>';

    document.body.appendChild(root);
    W.$('#subdev-back', root).addEventListener('click', close);
    W.$('#subdev-close', root).addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    render();
  }

  function planLabel(id) {
    if (id === 'schools') return 'Schools';
    if (id === 'plus') return 'Plus';
    return 'Free';
  }

  function statusLine() {
    var id = currentPlanId();
    if (id === 'schools') {
      return '<div class="subdev__banner subdev__banner--ok">' + (I.check || '') +
        '<div><b>Schools is on for this account.</b> No ads, the Education badge, and full Geo Classroom. ' +
        clampStudents(students) + ' students · $' + schoolsTotal() + '.</div></div>';
    }
    if (id === 'plus') {
      return '<div class="subdev__banner subdev__banner--ok">' + (I.check || '') +
        '<div><b>Plus is on for this account.</b> No ads, the Plus badge, and the ten extras are unlocked.</div></div>';
    }
    return '<div class="subdev__banner">' + (I.info || '') +
      '<div><b>You are on Free.</b> Ads stay off until placements are turned back on. ' +
      'Plus removes them. Schools is $2 per student and includes Geo Classroom. ' +
      'Checkout is mocked; only the owner/admin TEST path grants a plan today.</div></div>';
  }

  function render() {
    if (!root) return;
    var body = W.$('#subdev-body', root);
    if (!body) return;

    body.innerHTML =
      '<div class="subdev__hero">' +
        '<div class="subdev__eyebrow">Plans</div>' +
        '<h1>Free, Plus, and <em>Schools</em></h1>' +
        '<p>' + (gateReason
          ? esc(gateReason)
          : 'Plus is no ads, a Plus badge, and ten extra games and looks. Schools is everything in Plus at $2 per student.') +
        '</p>' +
      '</div>' +

      statusLine() +

      '<div class="subdev__plans">' + PLANS.map(planCard).join('') + '</div>' +

      '<section class="subdev__compare">' +
        '<h2>Feature comparison</h2>' +
        '<p class="t-sm t-muted">Ads stay dark until we turn placements back on. Plus and Schools never show them.</p>' +
        '<table class="subdev__table">' +
          '<thead><tr><th>Feature</th><th>Free</th><th>Plus</th><th>Schools</th></tr></thead>' +
          '<tbody>' + COMPARE.map(function (row) {
            return '<tr><td>' + esc(row.label) + '</td><td>' + mark(row.free) +
              '</td><td>' + mark(row.plus) + '</td><td>' + mark(row.schools) + '</td></tr>';
          }).join('') + '</tbody>' +
        '</table>' +
      '</section>' +

      '<div class="subdev__faq">' +
        '<article><h3>What is Plus for?</h3>' +
          '<p>No ads. You also get a Plus badge and ten extras already in LearnGeo: Geo Invaders, Flag Breakout, Capital Typer, Flag Echo, Embers, Chicken Wings, Deep Current, Ember Wake, Gilded Cube, and Meridian Gold.</p></article>' +
        '<article><h3>How does the Schools slider work?</h3>' +
          '<p>$2 per student. Drag the slider to set how many students, and the card shows count × $2. Mock checkout only.</p></article>' +
        '<article><h3>What do Schools accounts not get?</h3>' +
          '<p>Messaging between students is off (friend inbox, challenges, lobby chat). Ad pixels and cross-site ad tracking stay off. Full Geo Classroom is included.</p></article>' +
        '<article><h3>Does checkout charge a card?</h3>' +
          '<p>Not yet. Mock checkout only. Owner <code>' + OWNER_EMAIL + '</code> and UltraAdmin can grant a TEST plan. The public paywall stays behind the Development preview switch.</p></article>' +
      '</div>' +

      '<p class="subdev__foot">' +
        'LEA-122 · Free / Plus / Schools. Mock checkout only. ' +
        'Documented in <code>assets/js/subscription-dev.js</code> and <code>assets/js/premium.js</code>.</p>';

    var slider = body.querySelector('#subdev-students');
    if (slider) {
      slider.addEventListener('input', function () {
        students = clampStudents(slider.value);
        paintStudents(body);
      });
      slider.addEventListener('change', function () {
        students = clampStudents(slider.value);
        paintStudents(body);
      });
    }
    body.querySelectorAll('[data-plan]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        openCheckout(btn.getAttribute('data-plan'));
      });
    });
  }

  function paintStudents(body) {
    var n = clampStudents(students);
    var total = n * 2;
    var countEl = body.querySelector('#subdev-student-count');
    var totalEl = body.querySelector('#subdev-school-total');
    var noteEl = body.querySelector('#subdev-school-note');
    var slider = body.querySelector('#subdev-students');
    if (countEl) countEl.textContent = n + (n === 1 ? ' student' : ' students');
    if (totalEl) totalEl.textContent = '$' + total;
    if (noteEl) noteEl.textContent = n + ' × $2 = $' + total + ' · mock price';
    if (slider && String(slider.value) !== String(n)) slider.value = String(n);
  }

  function planCard(plan) {
    var feats = plan.features.map(function (f) {
      return '<li' + (f.on ? '' : ' class="is-muted"') + '>' +
        (f.on ? (I.check || '') : (I.x || '')) +
        '<span>' + esc(f.t) + '</span></li>';
    }).join('');
    var tone = plan.tone || 'free';
    var cls = 'subdev__plan subdev__plan--' + tone +
      (tone === 'plus' ? ' subdev__plan--featured' : '');
    var btnCls = tone === 'plus'
      ? 'btn btn--accent subdev__cta--premium'
      : tone === 'schools'
        ? 'btn btn--primary subdev__cta--schools'
        : 'btn btn--ghost';
    var badge = tone === 'plus'
      ? '<div class="subdev__plan-badge">No ads</div>'
      : tone === 'schools'
        ? '<div class="subdev__plan-badge subdev__plan-badge--edu">Education</div>'
        : '';
    var priceHtml;
    if (plan.id === 'schools') {
      var n = clampStudents(students);
      priceHtml =
        '<div class="subdev__price"><b id="subdev-school-total">$' + (n * 2) + '</b></div>' +
        '<p class="subdev__price-note" id="subdev-school-note">' + n + ' × $2 = $' + (n * 2) + ' · mock price</p>' +
        '<div class="subdev__slider">' +
          '<div class="subdev__slider-top">' +
            '<span>Students</span>' +
            '<b id="subdev-student-count">' + n + (n === 1 ? ' student' : ' students') + '</b>' +
          '</div>' +
          '<input id="subdev-students" class="subdev__range" type="range" min="1" max="400" step="1" ' +
            'value="' + n + '" aria-label="How many students">' +
          '<div class="subdev__slider-ends"><span>1</span><span>$2 each</span><span>400</span></div>' +
        '</div>';
    } else if (plan.price > 0) {
      priceHtml =
        '<div class="subdev__price"><b>$' + plan.price + '</b><span>/mo</span></div>' +
        '<p class="subdev__price-note">per month · mock price</p>';
    } else {
      priceHtml =
        '<div class="subdev__price"><b>$0</b></div>' +
        '<p class="subdev__price-note">Forever free for every account</p>';
    }
    return '<article class="' + cls + '">' +
      badge +
      '<div class="subdev__plan-top">' +
        '<h3 class="subdev__plan-name">' + esc(plan.name) + '</h3>' +
        '<p class="subdev__plan-blurb">' + esc(plan.blurb) + '</p>' +
      '</div>' +
      priceHtml +
      '<ul class="subdev__feats">' + feats + '</ul>' +
      '<button type="button" class="subdev__cta ' + btnCls + '" data-plan="' + esc(plan.id) + '">' +
        esc(plan.cta) + '</button>' +
    '</article>';
  }

  function findPlan(id) {
    for (var i = 0; i < PLANS.length; i++) if (PLANS[i].id === id) return PLANS[i];
    return PLANS[0];
  }

  function applyPlan(planId, done) {
    var P = global.Premium;
    var n = clampStudents(students);
    if (P && P.setPlan) P.setPlan(planId, { students: n });
    else if (P && P.setLocal) P.setLocal(planId !== 'free');
    var ops = global.AdminOps;
    var cloud = global.Cloud;
    var uid = cloud && cloud.user && cloud.user.id;
    if (canGrantTest() && uid && ops) {
      var job = null;
      if (planId === 'schools' && typeof ops.plan === 'function') {
        job = ops.plan(uid, 'schools', n);
      } else if (typeof ops.premium === 'function') {
        job = ops.premium(uid, planId !== 'free');
      }
      if (job && typeof job.then === 'function') {
        job.then(function () { if (done) done(true); }).catch(function () { if (done) done(false); });
        return;
      }
    }
    if (done) done(true);
  }

  function chargeLabel(plan) {
    if (plan.id === 'free') return '$0';
    if (plan.id === 'schools') {
      var n = clampStudents(students);
      return n + (n === 1 ? ' student' : ' students') + ' × $2 = $' + (n * 2);
    }
    return '$' + plan.price + ' / month';
  }

  function openCheckout(planId) {
    if (!global.UI || !global.UI.modal) {
      W.toast('Mock checkout', 'UI.modal is unavailable.', I.info, 2800);
      return;
    }
    var plan = findPlan(planId);
    var charge = chargeLabel(plan);
    var grant = canGrantTest();
    var state = { done: false };
    var paid = plan.id !== 'free';

    global.UI.modal({
      title: grant ? 'TEST checkout — ' + plan.name : plan.name + ' checkout (mock)',
      icon: I.shop || I.lock,
      wide: false,
      body:
        '<div class="subdev-checkout" id="subdev-co">' +
          '<div class="subdev-checkout__warn">' +
            (I.info || '') +
            '<div><b>No real charge.</b> Stripe is not connected. ' +
              (grant
                ? 'As owner/admin, confirming sets the TEST plan on this account.'
                : 'Live billing is not enabled; this sheet does not grant a plan yet.') +
            '</div>' +
          '</div>' +
          '<div class="subdev-checkout__plan' + (paid ? ' subdev-checkout__plan--prem' : '') +
            (plan.id === 'schools' ? ' subdev-checkout__plan--schools' : '') + '">' +
            '<div><b>' + esc(plan.name) + '</b>' +
              '<div class="t-sm t-muted" style="margin-top:2px">' + esc(plan.blurb) + '</div></div>' +
            '<span>' + esc(charge) + '</span>' +
          '</div>' +
          '<div class="subdev-checkout__fields">' +
            '<label>Email (mock)<input class="input" type="email" value="' + OWNER_EMAIL + '" readonly></label>' +
            '<label>Card number (fake)<input class="input mono" type="text" value="4242 4242 4242 4242" readonly></label>' +
            '<div class="subdev-checkout__fake">TEST MODE · Stripe not connected · LEA-122</div>' +
          '</div>' +
        '</div>',
      actions: [
        { label: 'Cancel', cls: 'btn--ghost', close: true },
        {
          label: plan.id === 'free'
            ? (grant ? 'Confirm Free (TEST)' : 'Stay on Free')
            : (grant ? 'Grant ' + plan.name + ' (TEST)' : 'Pay (mock)'),
          cls: 'btn--accent',
          close: false,
          onClick: function (m, closeModal) {
            if (state.done) { closeModal(); return; }
            state.done = true;

            function finish(ok) {
              var host = m.querySelector('#subdev-co');
              var granted = grant && ok !== false;
              var headline = plan.id === 'free'
                ? 'Back on Free'
                : (granted ? plan.name + ' granted (TEST)' : 'Mock purchase recorded');
              var detail = plan.id === 'free'
                ? 'Plus extras stay locked. Ads can return when placements are turned on.'
                : (granted
                  ? (plan.id === 'schools'
                    ? 'flags.plan is schools. No ads, Education and Plus badges, full Geo Classroom. ' + charge + '.'
                    : 'flags.plan is plus. No ads, the Plus badge, and the ten extras unlock.')
                  : 'Nothing was charged and no entitlement was granted. Ask the owner for a TEST grant, or wait for live billing.');
              if (host) {
                host.innerHTML =
                  '<div class="subdev-checkout__ok' + (paid ? ' subdev-checkout__ok--prem' : '') + '">' +
                    (I.check || '') +
                    '<b>' + esc(headline) + '</b>' +
                    '<p>' + esc(detail) + '</p>' +
                  '</div>';
              }
              var foot = m.querySelector('.modal__foot');
              if (foot) {
                var buttons = foot.querySelectorAll('button');
                if (buttons[1]) buttons[1].textContent = 'Done';
              }
              if (root) render();
              W.toast(plan.name, granted || plan.id === 'free' ? headline : 'Mock only — no grant',
                granted ? I.check : I.info, 2800);
            }

            if (!grant) {
              finish(false);
              return;
            }
            applyPlan(plan.id, finish);
          }
        }
      ]
    });
  }

  global.SubscriptionDev = {
    open: open,
    openUpgrade: openUpgrade,
    openForced: openForced,
    close: close,
    isOpen: function () { return !!root; },
    canGrantTest: canGrantTest,
    students: function () { return clampStudents(students); },
    planLabel: planLabel
  };
})(window);
