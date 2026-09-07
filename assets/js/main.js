/* ------------------------------------------------------------------
   LearnGeo — bootstrap: landing wiring, auth screen, routing
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW, I = W.Icons;

  var TABS = [
    { view: 'portal', icon: I.grid,  label: 'Home' },
    { view: 'learn',  icon: I.book,  label: 'Learn' },
    { view: 'test',   icon: I.clip,  label: 'Practice test' },
    { view: 'quiz',   icon: I.target, label: 'Class quiz' },
    { view: 'cards',  icon: I.cards, label: 'Flashcards' }
  ];

  /* =============================== AUTH UI ========================== */
  var mode = 'signup';

  function setMode(m) {
    mode = m === 'login' ? 'login' : 'signup';
    var signup = mode === 'signup';
    text('auth-title', signup ? 'Create your account' : 'Welcome back');
    text('auth-sub', signup
      ? 'Your progress, diamonds and profile are tied to your account.'
      : 'Pick up exactly where you left off.');
    text('auth-submit', signup ? 'Create account' : 'Log in');
    document.getElementById('auth-name-field').classList.toggle('hidden', !signup);
    document.getElementById('auth-password').setAttribute(
      'autocomplete', signup ? 'new-password' : 'current-password');
    document.getElementById('auth-error').innerHTML = '';
    document.getElementById('auth-switch').innerHTML = signup
      ? 'Already have an account? <button type="button" data-mode="login">Log in</button>'
      : 'New here? <button type="button" data-mode="signup">Create an account</button>';
    W.$$('#auth-switch button').forEach(function (b) {
      b.addEventListener('click', function () { setMode(b.dataset.mode); });
    });
    var first = document.getElementById(signup ? 'auth-name' : 'auth-email');
    if (first) setTimeout(function () { first.focus(); }, 40);
  }

  function authError(msg) {
    document.getElementById('auth-error').innerHTML =
      '<div class="auth-error">' + I.info + '<span>' + W.escapeHtml(msg) + '</span></div>';
  }

  function submitAuth(e) {
    e.preventDefault();
    var name = val('auth-name'), email = val('auth-email'), pass = val('auth-password');
    var btn = document.getElementById('auth-submit');
    btn.disabled = true;

    var p = mode === 'signup'
      ? global.Auth.signUp(email, pass, name)
      : global.Auth.logIn(email, pass);

    p.then(function () {
      btn.disabled = false;
      document.getElementById('auth-form').reset();
      global.UI.showApp('portal');
      W.toast(mode === 'signup' ? 'Account created' : 'Welcome back',
        W.state.profile.displayName, I.check);
      if (mode === 'signup') W.confetti({ count: 70, power: 240, y: window.innerHeight * 0.4 });
    }).catch(function (err) {
      btn.disabled = false;
      authError(err.message || 'Something went wrong.');
    });
  }

  function val(id) { var n = document.getElementById(id); return n ? n.value : ''; }
  function text(id, t) { var n = document.getElementById(id); if (n) n.textContent = t; }

  /* ================================ INIT ============================ */
  function init() {
    TABS.forEach(function (t) {
      var btn = document.querySelector('.tab[data-view="' + t.view + '"]');
      if (!btn) return;
      btn.innerHTML = t.icon + '<span>' + t.label + '</span>';
      btn.addEventListener('click', function () { global.UI.go(t.view); });
    });

    W.$$('[data-auth]').forEach(function (b) {
      b.addEventListener('click', function () { global.UI.showAuth(b.dataset.auth); });
    });
    W.$$('[data-launch]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (global.Auth.isSignedIn()) global.UI.showApp(b.dataset.launch);
        else global.UI.showAuth('signup');
      });
    });

    document.getElementById('auth-form').addEventListener('submit', submitAuth);
    document.getElementById('auth-back').addEventListener('click', global.UI.showLanding);

    var av = document.getElementById('avatar-btn');
    if (av) av.addEventListener('click', function (e) { e.stopPropagation(); global.UI.toggleMenu(); });
    var home = document.getElementById('home-btn');
    if (home) home.addEventListener('click', function () {
      if (global.Auth.isSignedIn()) global.UI.go('portal'); else global.UI.showLanding();
    });

    var counts = global.GeoData.counts;
    countUp('s-total', counts.total);
    countUp('s-members', counts.members);

    W.touchDaily();
    global.UI.refreshHud();

    /* an open session drops straight into the study centre */
    if (global.Auth.isSignedIn()) global.UI.showApp('portal');

    window.addEventListener('resize', function () { global.GeoMap.invalidate(); });
  }

  function countUp(id, n) {
    var el = document.getElementById(id);
    if (!el) return;
    var start = performance.now(), dur = 900;
    (function step(now) {
      var p = Math.min(1, (now - start) / dur);
      el.textContent = Math.round(n * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step);
    })(start);
  }

  global.AuthUI = { setMode: setMode };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
