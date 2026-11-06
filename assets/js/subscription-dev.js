/* ------------------------------------------------------------------
   LearnGeo — Premium plans (account / player, not teacher-based).

   Opened from locked Premium games / cosmetics (upgrade path), or from
   Administrator → Development / the `plans` command (TEST tools).

   Checkout is MOCKED. No Stripe keys, no network charges. Granting
   Premium for real in TEST mode:
     - UltraAdmin / owner (alexjschendel@gmail.com) mock Pay sets
       flags.premium locally and calls ultra_set_premium when signed in.
     - Everyone else sees the school-safe Premium pitch; Pay stays mock
       and does not grant entitlement.

   Label: Premium. School-safe player entitlements only.
   LEA-45: Premium card visual polish (glow / sparkle / hover) — still mock.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons;
  var OWNER_EMAIL = 'alexjschendel@gmail.com';

  var root = null;
  var cycle = 'yearly'; /* monthly | yearly */
  var gateReason = '';

  var PLANS = [
    {
      id: 'free',
      name: 'Free',
      blurb: 'Study, practice, and play core Games on any account.',
      monthly: 0,
      yearly: 0,
      cta: 'Stay on Free',
      featured: false,
      features: [
        { t: 'Learn, practice test, and class quiz', on: true },
        { t: 'Free Games (Snake, Match, Maze, and more)', on: true },
        { t: 'Join a classroom with a class code', on: true },
        { t: 'Basic cosmetics locker', on: true },
        { t: 'Premium Games (Chess, Dash, Golf, Defender)', on: false },
        { t: 'Premium profile effects', on: false }
      ]
    },
    {
      id: 'premium',
      name: 'Premium',
      blurb: 'For learners and players — unlocks Premium Games and profile effects on your account.',
      monthly: 6,
      yearly: 54,
      cta: 'Get Premium (mock)',
      featured: true,
      features: [
        { t: 'Everything in Free', on: true },
        { t: 'Geo Chess, Geo Dash, Geo Golf, Globe Defender', on: true },
        { t: 'Premium profile effects (Embers, Wings, and more)', on: true },
        { t: 'Account-level — not tied to being a teacher', on: true },
        { t: 'School-safe cosmetics and games', on: true },
        { t: 'Works for students, teachers, and solo explorers', on: true }
      ]
    }
  ];

  var COMPARE = [
    { label: 'Study modes', free: true, premium: true },
    { label: 'Free Games', free: true, premium: true },
    { label: 'Premium Games', free: false, premium: true },
    { label: 'Basic cosmetics', free: true, premium: true },
    { label: 'Premium profile effects', free: false, premium: true },
    { label: 'Requires teacher role', free: false, premium: false }
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

  function priceLabel(plan) {
    if (plan.monthly === 0) return { big: '$0', note: 'Forever free for every account' };
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

  function open(opts) {
    opts = opts || {};
    /* Public upgrade path only while Development preview is on.
       Admin Development / plans command may pass force: true for TEST. */
    if (!opts.force && global.Premium && global.Premium.previewEnabled &&
        !global.Premium.previewEnabled()) {
      return;
    }
    gateReason = opts.reason || '';
    if (root) { render(); return; }
    build();
  }

  function openUpgrade(reason) {
    open({ reason: reason || 'Unlock this with LearnGeo Premium.' });
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
    root.setAttribute('aria-label', 'LearnGeo Premium plans');
    root.innerHTML =
      '<div class="subdev__ribbon" role="status">' +
        '<b>DEV PREVIEW</b>' +
        '<span>Account / player plan · school-safe · mock checkout only (TEST grants for owner/admin) · not live billing</span>' +
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

  function statusLine() {
    var on = global.Premium && global.Premium.active && global.Premium.active();
    return on
      ? '<div class="subdev__banner subdev__banner--ok">' + (I.check || '') +
          '<div><b>Premium is on for this account.</b> Premium Games and effects are unlocked.</div></div>'
      : '<div class="subdev__banner">' + (I.info || '') +
          '<div><b>You are on Free.</b> Premium is for your player account — not a teacher-only seat. ' +
          'Checkout is mocked; only the owner/admin TEST path grants Premium today.</div></div>';
  }

  function render() {
    if (!root) return;
    var body = W.$('#subdev-body', root);
    if (!body) return;

    body.innerHTML =
      '<div class="subdev__hero">' +
        '<div class="subdev__eyebrow">' + (I.sparkle || I.bolt || '') + ' Account Premium</div>' +
        '<h1>LearnGeo <em>Premium</em></h1>' +
        '<p>' + (gateReason
          ? esc(gateReason) + ' Premium unlocks select Games and profile effects for learners and players.'
          : 'One account plan for students, teachers, and solo explorers. Not tied to classroom teacher tools.') +
        '</p>' +
      '</div>' +

      statusLine() +

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
        '<p class="t-sm t-muted">Player entitlements — teacher role is never required.</p>' +
        '<table class="subdev__table">' +
          '<thead><tr><th>Feature</th><th>Free</th><th>Premium</th></tr></thead>' +
          '<tbody>' + COMPARE.map(function (row) {
            return '<tr><td>' + esc(row.label) + '</td><td>' + mark(row.free) +
              '</td><td>' + mark(row.premium) + '</td></tr>';
          }).join('') + '</tbody>' +
        '</table>' +
      '</section>' +

      '<div class="subdev__faq">' +
        '<article><h3>Is this for teachers only?</h3>' +
          '<p>No. Premium is account-level for any learner or player. Classroom tools stay separate.</p></article>' +
        '<article><h3>Does checkout charge a card?</h3>' +
          '<p>Not yet. Mock checkout only. Owner <code>' + OWNER_EMAIL + '</code> and UltraAdmin can grant a TEST Premium flag.</p></article>' +
        '<article><h3>What stays free?</h3>' +
          '<p>Study modes and several Games (including Capital Snake, Flag Match, and Capital Maze) stay playable on Free.</p></article>' +
      '</div>' +

      '<p class="subdev__foot">' +
        'LEA-45 · Premium plans UI (account / player). Mock checkout only. ' +
        'Documented in <code>assets/js/subscription-dev.js</code> and <code>assets/js/premium.js</code>.</p>';

    body.querySelectorAll('[data-cycle]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        cycle = btn.getAttribute('data-cycle') || 'yearly';
        render();
      });
    });
    body.querySelectorAll('.subdev__plan--featured').forEach(function (card) {
      card.addEventListener('pointerenter', function () { card.classList.add('is-hot'); });
      card.addEventListener('pointerleave', function () {
        card.classList.remove('is-hot');
        card.classList.remove('is-press');
      });
    });
    body.querySelectorAll('[data-plan]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var card = btn.closest('.subdev__plan');
        if (card && card.classList.contains('subdev__plan--featured')) {
          card.classList.add('is-press');
          setTimeout(function () { card.classList.remove('is-press'); }, 180);
        }
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
    var featured = !!plan.featured;
    var cls = 'subdev__plan' +
      (featured ? ' subdev__plan--featured' : ' subdev__plan--free');
    var btnCls = featured
      ? 'btn btn--accent subdev__cta--premium'
      : 'btn btn--ghost';
    var badge = featured
      ? '<div class="subdev__plan-badge" aria-hidden="true">' +
          (I.sparkle || I.bolt || '') + ' Most rewarding</div>'
      : '';
    var sparkles = featured
      ? '<div class="subdev__sparkles" aria-hidden="true">' +
          '<span class="subdev__spark"></span>' +
          '<span class="subdev__spark"></span>' +
          '<span class="subdev__spark"></span>' +
          '<span class="subdev__spark"></span>' +
          '<span class="subdev__spark"></span>' +
        '</div>'
      : '';
    var nameIcon = featured ? ((I.sparkle || I.bolt || '') + ' ') : '';
    return '<article class="' + cls + '">' +
      badge + sparkles +
      '<div class="subdev__plan-top">' +
        '<h3 class="subdev__plan-name">' + nameIcon + esc(plan.name) + '</h3>' +
        '<p class="subdev__plan-blurb">' + esc(plan.blurb) + '</p>' +
      '</div>' +
      '<div class="subdev__price"><b>' + esc(p.big) + '</b>' +
        (plan.monthly > 0 ? '<span>/mo</span>' : '') +
      '</div>' +
      '<p class="subdev__price-note">' + esc(p.note) + '</p>' +
      '<ul class="subdev__feats">' + feats + '</ul>' +
      '<button type="button" class="subdev__cta ' + btnCls + '" data-plan="' + esc(plan.id) + '">' +
        (featured ? ((I.sparkle || '') + ' ') : '') + esc(plan.cta) + '</button>' +
    '</article>';
  }

  function findPlan(id) {
    for (var i = 0; i < PLANS.length; i++) if (PLANS[i].id === id) return PLANS[i];
    return PLANS[0];
  }

  function applyPremium(on, done) {
    var P = global.Premium;
    if (P && P.setLocal) P.setLocal(!!on);
    var ops = global.AdminOps;
    var cloud = global.Cloud;
    var uid = cloud && cloud.user && cloud.user.id;
    if (canGrantTest() && ops && typeof ops.premium === 'function' && uid) {
      ops.premium(uid, !!on).then(function () {
        if (done) done(true);
      }).catch(function () {
        if (done) done(false);
      });
      return;
    }
    if (done) done(!!(P && P.active && P.active()) === !!on || !on);
  }

  function openCheckout(planId) {
    if (!global.UI || !global.UI.modal) {
      W.toast('Mock checkout', 'UI.modal is unavailable.', I.info, 2800);
      return;
    }
    var plan = findPlan(planId);
    var p = priceLabel(plan);
    var charge = plan.monthly === 0
      ? '$0'
      : (cycle === 'yearly' ? ('$' + plan.yearly + ' / year') : ('$' + plan.monthly + ' / month'));
    var grant = canGrantTest();
    var state = { done: false };

    global.UI.modal({
      title: grant ? 'TEST checkout — Premium' : 'Premium checkout (mock)',
      icon: I.shop || I.lock,
      wide: false,
      body:
        '<div class="subdev-checkout" id="subdev-co">' +
          '<div class="subdev-checkout__warn">' +
            (I.info || '') +
            '<div><b>No real charge.</b> Stripe is not connected. ' +
              (grant
                ? 'As owner/admin, confirming Premium sets the TEST entitlement on this account.'
                : 'Live billing is not enabled; this sheet does not grant Premium yet.') +
            '</div>' +
          '</div>' +
          '<div class="subdev-checkout__plan' + (plan.id === 'premium' ? ' subdev-checkout__plan--prem' : '') + '">' +
            '<div><b>' + esc(plan.name) + '</b>' +
              '<div class="t-sm t-muted" style="margin-top:2px">' + esc(plan.blurb) + '</div></div>' +
            '<span>' + esc(charge) + '</span>' +
          '</div>' +
          '<div class="subdev-checkout__fields">' +
            '<label>Email (mock)<input class="input" type="email" value="' + OWNER_EMAIL + '" readonly></label>' +
            '<label>Card number (fake)<input class="input mono" type="text" value="4242 4242 4242 4242" readonly></label>' +
            '<div class="subdev-checkout__fake">TEST MODE · Stripe not connected · LEA-45</div>' +
          '</div>' +
        '</div>',
      actions: [
        { label: 'Cancel', cls: 'btn--ghost', close: true },
        {
          label: plan.id === 'free'
            ? (grant ? 'Confirm Free (TEST)' : 'Stay on Free')
            : (grant ? 'Grant Premium (TEST)' : 'Pay (mock)'),
          cls: 'btn--accent',
          close: false,
          onClick: function (m, closeModal) {
            if (state.done) { closeModal(); return; }
            state.done = true;
            var wantPremium = plan.id === 'premium';

            function finish(ok) {
              var host = m.querySelector('#subdev-co');
              if (host) {
                host.innerHTML =
                  '<div class="subdev-checkout__ok' + (wantPremium ? ' subdev-checkout__ok--prem' : '') + '">' +
                    (I.check || I.sparkle || '') +
                    '<b>' + (wantPremium
                      ? (grant && ok !== false ? 'Premium granted (TEST)' : 'Mock purchase recorded')
                      : 'Back on Free') + '</b>' +
                    '<p>' + (wantPremium
                      ? (grant
                        ? 'flags.premium is set for this account. Premium Games and effects unlock.'
                        : 'Nothing was charged and no entitlement was granted. Ask the owner for a TEST grant, or wait for live billing.')
                      : 'Premium Games and effects stay locked until you upgrade.') +
                    '</p>' +
                  '</div>';
              }
              var foot = m.querySelector('.modal__foot');
              if (foot) {
                var buttons = foot.querySelectorAll('button');
                if (buttons[1]) buttons[1].textContent = 'Done';
              }
              if (root) render();
              W.toast(
                wantPremium ? 'Premium' : 'Free',
                wantPremium
                  ? (grant ? 'TEST Premium on' : 'Mock only — no grant')
                  : 'Staying on Free',
                wantPremium && grant ? I.check : I.info,
                2800
              );
            }

            if (!grant) {
              finish(false);
              return;
            }
            applyPremium(wantPremium, finish);
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
    canGrantTest: canGrantTest
  };
})(window);
