/* ------------------------------------------------------------------
   LearnGeo — TEST / Development subscription preview (v1).

   Reachable ONLY from Administrator → Development, or the admin
   command `plans` / `subscription`. Not linked from public nav,
   landing CTAs, or student/teacher flows.

   Checkout is MOCKED. No Stripe keys, no network charges, no real
   billing. The modal labels itself TEST and records nothing durable.
   Wiring a live Stripe Checkout Session is deferred until AJ opts in.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons;

  var root = null;
  var cycle = 'yearly'; /* monthly | yearly */

  var PLANS = [
    {
      id: 'free',
      name: 'Free',
      blurb: 'Everything a student needs to study countries and capitals.',
      monthly: 0,
      yearly: 0,
      cta: 'Stay on Free',
      featured: false,
      features: [
        { t: 'Learn, practice test, and class quiz', on: true },
        { t: 'Games hub and mastery tracking', on: true },
        { t: 'Join a teacher\'s classroom', on: true },
        { t: 'One Cosmetics locker', on: true },
        { t: 'Class analytics for teachers', on: false },
        { t: 'Priority classroom tools', on: false }
      ]
    },
    {
      id: 'pro',
      name: 'Pro',
      blurb: 'Built for teachers who run Geo Classroom every week.',
      monthly: 8,
      yearly: 72,
      cta: 'Try Pro (mock)',
      featured: true,
      features: [
        { t: 'Everything in Free', on: true },
        { t: 'Unlimited class assignments', on: true },
        { t: 'Roster analytics and grade export', on: true },
        { t: 'Custom class backgrounds', on: true },
        { t: 'Priority GeoLive rooms', on: true },
        { t: 'School admin seats', on: false }
      ]
    },
    {
      id: 'school',
      name: 'School',
      blurb: 'Districts and departments that need seats and oversight.',
      monthly: null,
      yearly: null,
      cta: 'Talk to us (mock)',
      featured: false,
      features: [
        { t: 'Everything in Pro', on: true },
        { t: 'Shared school seats', on: true },
        { t: 'Admin classroom tools', on: true },
        { t: 'Centralized billing (future)', on: true },
        { t: 'Onboarding help', on: true },
        { t: 'Custom SSO (future)', on: true }
      ]
    }
  ];

  var COMPARE = [
    { label: 'Study modes & games', free: true, pro: true, school: true },
    { label: 'Join classrooms', free: true, pro: true, school: true },
    { label: 'Create classrooms', free: 'Limited', pro: true, school: true },
    { label: 'Assignment analytics', free: false, pro: true, school: true },
    { label: 'Grade export', free: false, pro: true, school: true },
    { label: 'School seats & oversight', free: false, pro: false, school: true }
  ];

  function esc(s) { return W.escapeHtml(String(s == null ? '' : s)); }

  function canOpen() {
    return !!(global.Admin && global.Admin.can && global.Admin.can('ultra'));
  }

  function priceLabel(plan) {
    if (plan.monthly == null) return { big: 'Custom', note: 'Mock quote only — not billed' };
    if (plan.monthly === 0) return { big: '$0', note: 'Forever free for students' };
    if (cycle === 'yearly') {
      return {
        big: '$' + Math.round(plan.yearly / 12),
        note: '$' + plan.yearly + '/year billed annually · mock price'
      };
    }
    return { big: '$' + plan.monthly, note: 'per month · mock price' };
  }

  function mark(v) {
    if (v === true) return '<span class="subdev__yes">' + (I.check || '✓') + '</span>';
    if (v === false) return '<span class="subdev__no">—</span>';
    return esc(v);
  }

  function open() {
    if (!canOpen()) {
      W.toast('Development only', 'Open Administrator first (UltraAdmin).', I.lock, 3600);
      return;
    }
    if (root) return;
    build();
  }

  function close() {
    if (!root) return;
    root.remove();
    root = null;
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
    root.setAttribute('aria-label', 'TEST subscription plans preview');
    root.innerHTML =
      '<div class="subdev__ribbon" role="status">' +
        '<b>TEST / Development</b>' +
        '<span>Not live on the public site · mock pricing · no real Stripe charges</span>' +
      '</div>' +
      '<div class="subdev__bar">' +
        '<div class="subdev__brand">' + (I.globe || '') + ' LearnGeo</div>' +
        '<span class="subdev__tag">TEST preview</span>' +
        '<div class="grow"></div>' +
        '<button type="button" class="btn btn--ghost btn--sm" id="subdev-back">' +
          (I.arrowL || '') + ' Back to Development</button>' +
        '<button type="button" class="icon-btn" id="subdev-close" title="Close preview">' +
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

  function render() {
    if (!root) return;
    var body = W.$('#subdev-body', root);
    if (!body) return;

    body.innerHTML =
      '<div class="subdev__hero">' +
        '<div class="subdev__eyebrow">' + (I.flask || I.bolt || '') + ' Development preview</div>' +
        '<h1>Plans for <em>LearnGeo</em></h1>' +
        '<p>A polished subscription shell for internal review. Public students and teachers ' +
          'never see this page — it opens only from Administrator → Development.</p>' +
      '</div>' +

      '<div class="subdev__banner">' +
        (I.info || '') +
        '<div><b>Not live.</b> Prices and features below are placeholders for design review. ' +
          'Checkout is a local mock — nothing is charged, and no Stripe keys are required for v1. ' +
          'See the footer and <code>assets/js/subscription-dev.js</code> header comment.</div>' +
      '</div>' +

      '<div class="subdev__toggle">' +
        '<div class="subdev__seg" role="group" aria-label="Billing cycle">' +
          '<button type="button" data-cycle="monthly"' + (cycle === 'monthly' ? ' class="is-on"' : '') +
            '>Monthly</button>' +
          '<button type="button" data-cycle="yearly"' + (cycle === 'yearly' ? ' class="is-on"' : '') +
            '>Yearly <span class="subdev__save">Save ~25%</span></button>' +
        '</div>' +
      '</div>' +

      '<div class="subdev__plans">' + PLANS.map(planCard).join('') + '</div>' +

      '<section class="subdev__compare">' +
        '<h2>Feature comparison</h2>' +
        '<p class="t-sm t-muted">Mock matrix for the test UI — not a product commitment.</p>' +
        '<table class="subdev__table">' +
          '<thead><tr><th>Feature</th><th>Free</th><th>Pro</th><th>School</th></tr></thead>' +
          '<tbody>' + COMPARE.map(function (row) {
            return '<tr><td>' + esc(row.label) + '</td><td>' + mark(row.free) +
              '</td><td>' + mark(row.pro) + '</td><td>' + mark(row.school) + '</td></tr>';
          }).join('') + '</tbody>' +
        '</table>' +
      '</section>' +

      '<div class="subdev__faq">' +
        '<article><h3>Will this appear on the main site?</h3>' +
          '<p>No. There is no public nav entry, no landing CTA, and no student/teacher paywall. ' +
          'Only UltraAdmin → Administrator → Development (or the <code>plans</code> command) opens it.</p></article>' +
        '<article><h3>Does checkout charge a card?</h3>' +
          '<p>Not in v1. The CTA opens a mock checkout sheet labeled TEST. No Stripe session is created. ' +
          'Live billing can be added later behind the same Development gate.</p></article>' +
        '<article><h3>Who can preview?</h3>' +
          '<p>The owner account <code>alexjschendel@gmail.com</code> and any admin who can open ' +
          'Administrator (UltraAdmin access).</p></article>' +
        '<article><h3>Pets / Mongolian Brainrot?</h3>' +
          '<p>Not part of this preview. Pets is a separate collab and is not gated by these test plans.</p></article>' +
      '</div>' +

      '<p class="subdev__foot">' +
        'TEST / Development artifact for LEA-26. Mock plans only. ' +
        'Documented in <code>assets/js/subscription-dev.js</code>. ' +
        'Do not promote this overlay to production billing without an explicit go-live.</p>';

    body.querySelectorAll('[data-cycle]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        cycle = btn.getAttribute('data-cycle') || 'yearly';
        render();
      });
    });
    body.querySelectorAll('[data-plan]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        openCheckout(btn.getAttribute('data-plan'));
      });
    });
  }

  function planCard(plan) {
    var p = priceLabel(plan);
    var feats = plan.features.map(function (f) {
      return '<li' + (f.on ? '' : ' class="is-muted"') + '>' +
        (f.on ? (I.check || '') : (I.x || '')) +
        '<span>' + esc(f.t) + '</span></li>';
    }).join('');
    var cls = 'subdev__plan' + (plan.featured ? ' subdev__plan--featured' : '');
    var btnCls = plan.featured ? 'btn btn--accent' : (plan.id === 'free' ? 'btn btn--ghost' : 'btn btn--primary');
    return '<article class="' + cls + '">' +
      '<div class="subdev__plan-top">' +
        '<h3 class="subdev__plan-name">' + esc(plan.name) + '</h3>' +
        '<p class="subdev__plan-blurb">' + esc(plan.blurb) + '</p>' +
      '</div>' +
      '<div class="subdev__price"><b>' + esc(p.big) + '</b>' +
        (plan.monthly != null && plan.monthly > 0 ? '<span>/mo</span>' : '') +
      '</div>' +
      '<p class="subdev__price-note">' + esc(p.note) + '</p>' +
      '<ul class="subdev__feats">' + feats + '</ul>' +
      '<button type="button" class="subdev__cta ' + btnCls + '" data-plan="' + esc(plan.id) + '">' +
        esc(plan.cta) + '</button>' +
    '</article>';
  }

  function findPlan(id) {
    for (var i = 0; i < PLANS.length; i++) if (PLANS[i].id === id) return PLANS[i];
    return PLANS[0];
  }

  function openCheckout(planId) {
    if (!global.UI || !global.UI.modal) {
      W.toast('Mock checkout', 'UI.modal is unavailable.', I.info, 2800);
      return;
    }
    var plan = findPlan(planId);
    var p = priceLabel(plan);
    var charge = plan.monthly == null
      ? 'Custom quote (mock)'
      : (plan.monthly === 0
        ? '$0'
        : (cycle === 'yearly' ? ('$' + plan.yearly + ' / year') : ('$' + plan.monthly + ' / month')));

    var state = { done: false };

    global.UI.modal({
      title: 'Mock checkout — TEST',
      icon: I.shop || I.lock,
      wide: false,
      body:
        '<div class="subdev-checkout" id="subdev-co">' +
          '<div class="subdev-checkout__warn">' +
            (I.info || '') +
            '<div><b>No real charge.</b> This sheet does not call Stripe. Card fields are decorative placeholders.</div>' +
          '</div>' +
          '<div class="subdev-checkout__plan">' +
            '<div><b>' + esc(plan.name) + '</b>' +
              '<div class="t-sm t-muted" style="margin-top:2px">' + esc(plan.blurb) + '</div></div>' +
            '<span>' + esc(charge) + '</span>' +
          '</div>' +
          '<div class="subdev-checkout__fields">' +
            '<label>Email (mock)<input class="input" type="email" value="alexjschendel@gmail.com" readonly></label>' +
            '<label>Card number (fake)<input class="input mono" type="text" value="4242 4242 4242 4242" readonly></label>' +
            '<div class="subdev-checkout__fake">TEST MODE · Stripe not connected · LEA-26</div>' +
          '</div>' +
        '</div>',
      actions: [
        { label: 'Cancel', cls: 'btn--ghost', close: true },
        {
          label: plan.monthly === 0 ? 'Confirm Free (mock)' : 'Pay (mock)',
          cls: 'btn--accent',
          close: false,
          onClick: function (m, closeModal) {
            if (state.done) { closeModal(); return; }
            state.done = true;
            var host = m.querySelector('#subdev-co');
            if (host) {
              host.innerHTML =
                '<div class="subdev-checkout__ok">' +
                  (I.check || '') +
                  '<b>Mock purchase recorded locally</b>' +
                  '<p>Nothing was charged. No customer, subscription, or webhook was created. ' +
                    'Close this dialog to keep reviewing the TEST plans page.</p>' +
                '</div>';
            }
            var foot = m.querySelector('.modal__foot');
            if (foot) {
              var buttons = foot.querySelectorAll('button');
              if (buttons[1]) buttons[1].textContent = 'Done';
            }
            W.toast('TEST checkout', plan.name + ' mock OK — no charge', I.check, 2800);
          }
        }
      ]
    });
  }

  global.SubscriptionDev = {
    open: open,
    close: close,
    /* True when the overlay is mounted — handy for screenshots / tests. */
    isOpen: function () { return !!root; }
  };
})(window);
