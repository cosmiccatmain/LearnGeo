/* ------------------------------------------------------------------
   LearnGeo — telling somebody their balance was cut, and letting them
   say it was a mistake.

   The penalty is applied by admin-ledger.js. This file is only the part
   the person sees: a banner that says what happened and why, in plain
   words, and a way to appeal it without finding an email address.

   It says the number. "Your balance was adjusted" is the kind of
   sentence that makes people assume the worst, so this one says how
   many diamonds went, what is left, and what triggered it.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons;
  var L = function () { return global.AdminLedger; };

  function fmt(n) { return Number(n || 0).toLocaleString(); }

  function when(t) {
    var mins = Math.round((Date.now() - t) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + ' minute' + (mins === 1 ? '' : 's') + ' ago';
    var h = Math.round(mins / 60);
    if (h < 24) return h + ' hour' + (h === 1 ? '' : 's') + ' ago';
    return Math.round(h / 24) + ' day' + (Math.round(h / 24) === 1 ? '' : 's') + ' ago';
  }

  /* ============================== banner ============================ */
  /* Lives at the top of the app, under the bar, until it is dealt with.
     An appealed penalty keeps a quieter version so nobody is left
     wondering whether the appeal went anywhere. */
  function render() {
    var host = document.getElementById('enforce-bar');
    if (!host || !L()) return;
    var p = L().current();

    if (!p || p.status === 'reversed') { host.classList.add('hidden'); host.innerHTML = ''; return; }

    host.classList.remove('hidden');

    if (p.status === 'appealed') {
      host.className = 'enforce enforce--wait';
      host.innerHTML =
        '<span class="enforce__i">' + I.clock + '</span>' +
        '<div class="enforce__t"><b>Your appeal is with the admin</b>' +
          '<span>Sent ' + when(p.appeal.t) + '. The ' + fmt(p.taken) +
          ' diamonds come back if it is upheld.</span></div>';
      return;
    }

    if (p.status === 'upheld') {
      host.className = 'enforce enforce--done';
      host.innerHTML =
        '<span class="enforce__i">' + I.info + '</span>' +
        '<div class="enforce__t"><b>Your appeal was not upheld</b>' +
          '<span>The adjustment stands. Everything you earn from here is yours.</span></div>' +
        '<button class="btn btn--sm" id="enforce-dismiss">Got it</button>';
      wire(host);
      return;
    }

    host.className = 'enforce enforce--warn';
    host.innerHTML =
      '<span class="enforce__i">' + I.shield + '</span>' +
      '<div class="enforce__t">' +
        '<b>' + fmt(p.taken) + ' diamonds were removed from your balance</b>' +
        '<span>Diamonds were added to this account from the admin panel ' +
          'rather than earned. ' + Math.round(p.rate * 100) + '% of the balance was taken back. ' +
          'You have ' + fmt(W.state.economy.diamonds) + ' left.</span>' +
      '</div>' +
      '<button class="btn btn--sm" id="enforce-why">Why?</button>' +
      '<button class="btn btn--sm btn--accent" id="enforce-appeal">This was a mistake</button>';
    wire(host);
  }

  function wire(host) {
    var a = W.$('#enforce-appeal', host); if (a) a.addEventListener('click', openAppeal);
    var y = W.$('#enforce-why', host);    if (y) y.addEventListener('click', explain);
    var d = W.$('#enforce-dismiss', host);
    if (d) d.addEventListener('click', function () { L().clear(); render(); });
  }

  /* ============================== why =============================== */
  function explain() {
    var p = L().current();
    var grants = L().recentGrants(L().windowHours);
    global.UI.modal({
      title: 'What happened', icon: I.shield, wide: true,
      body:
        '<p class="t-muted">The admin panel can add diamonds to a save directly. ' +
          'Diamonds added that way were not earned by answering anything, so they ' +
          'are taken back when they are found.</p>' +

        '<div class="field" style="margin-top:18px">' +
          '<label class="field__label">What was found</label>' +
          '<div class="enf-rows">' +
            row('Grants in the last ' + L().windowHours + ' hours', p.grantCount || grants.length) +
            row('Diamonds granted', fmt(p.granted)) +
            row('Balance before', fmt(p.balanceBefore)) +
            row('Taken back (' + Math.round(p.rate * 100) + '%)', '−' + fmt(p.taken)) +
            row('Balance now', fmt(W.state.economy.diamonds)) +
          '</div>' +
        '</div>' +

        '<div class="feedback" style="background:var(--accent-soft);margin-top:16px">' + I.info +
          '<div><b style="color:var(--accent-ink)">The percentage is of the balance, not of the grant</b>' +
          '<p>It is ' + Math.round(p.rate * 100) + '% of what was in the account when the check ran. ' +
          'If most of your diamonds were earned honestly, say so in an appeal and they ' +
          'can be put straight back.</p></div></div>',
      actions: [
        { label: 'Close', cls: 'btn--ghost', close: true },
        { label: 'This was a mistake', cls: 'btn--accent', close: true, onClick: openAppeal }
      ]
    });

    function row(k, v) {
      return '<div class="enf-row"><span>' + k + '</span><b class="mono">' + v + '</b></div>';
    }
  }

  /* ============================= appeal ============================= */
  function openAppeal() {
    global.UI.modal({
      title: 'Appeal this', icon: I.inbox, wide: true,
      body:
        '<p class="t-muted" style="margin-bottom:14px">Say what happened. If the diamonds ' +
          'were earned, or somebody else used this device, write that here. An admin ' +
          'reads these and can put the ' + fmt(L().current().taken) + ' back.</p>' +
        '<div class="field">' +
          '<label class="field__label" for="ap-text">What happened</label>' +
          '<textarea class="input" id="ap-text" style="min-height:120px" maxlength="600" ' +
            'placeholder="I earned these by…"></textarea>' +
          '<div class="field__hint"><span id="ap-count">0</span>/600</div>' +
        '</div>' +
        '<div id="ap-err"></div>',
      actions: [
        { label: 'Cancel', cls: 'btn--ghost', close: true },
        { label: 'Send appeal', cls: 'btn--accent', onClick: function (root, close) {
            var txt = W.$('#ap-text', root).value.trim();
            if (txt.length < 10) {
              W.$('#ap-err', root).innerHTML =
                '<div class="feedback feedback--wrong" style="margin-top:10px">' + I.info +
                '<div><b>Say a little more</b><p>A sentence is enough, but an empty ' +
                'appeal gives the admin nothing to go on.</p></div></div>';
              return false;
            }
            L().appeal(txt);
            close();
            render();
            if (global.UI && global.UI.refreshHud) global.UI.refreshHud();
            W.toast('Appeal sent', 'An admin will look at it', I.check, 4000);
          } }
      ],
      onMount: function (root) {
        var ta = W.$('#ap-text', root), c = W.$('#ap-count', root);
        ta.addEventListener('input', function () { c.textContent = ta.value.length; });
        setTimeout(function () { ta.focus(); }, 60);
      }
    });
  }

  /* Checked once when the app opens, and again whenever the admin panel
     has just been used, which is the only thing that can create one. */
  function check() {
    if (!L()) return;
    var fresh = L().enforce();
    render();
    if (fresh) {
      /* The balance in the top bar was drawn before the penalty ran, so
         without this the banner says 300 while the chip still says 2,000
         and the person has no idea which one is real. */
      if (global.UI && global.UI.refreshHud) global.UI.refreshHud();
      if (global.Portal && document.body.classList.contains('view-portal')) {
        global.Portal.render();
      }
      W.Sound && W.Sound.wrong && W.Sound.wrong();
      explain();
    }
  }

  global.Enforcement = { check: check, render: render, openAppeal: openAppeal, explain: explain };
})(window);
