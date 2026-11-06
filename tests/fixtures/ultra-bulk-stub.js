/* Harness for tests/test_ultra_bulk.py. Stands in for a signed-in
   UltraAdmin session and records every RPC the real admin-ops.js
   sends. Nothing here is loaded by the app. */
(function (global) {
  'use strict';

  var ME = '11111111-1111-4111-8111-111111111111';
  var FAIL = '22222222-2222-4222-8222-222222222222';
  var TOKEN = '99999999-9999-4999-8999-999999999999';

  function sid(n) {
    var s = String(n);
    while (s.length < 12) s = '0' + s;
    return 'aaaaaaaa-aaaa-4aaa-8aaa-' + s;
  }

  function row(id, name, email) {
    return {
      id: id,
      display_name: name,
      email: email,
      role: 'student',
      diamonds: 150,
      level: 3,
      xp: 40,
      staff: false,
      updated_at: '2026-01-01T00:00:00Z'
    };
  }

  var accounts = [
    row(ME, 'Alex', 'alexjschendel@gmail.com'),
    row(FAIL, 'Fail User', 'fail@example.com')
  ];
  accounts[0].staff = true;
  accounts[0].diamonds = 800;
  var n;
  for (n = 1; n <= 14; n++) accounts.push(row(sid(n), 'Student ' + n, 'student' + n + '@example.com'));

  global.__accounts = accounts;
  global.__order = accounts.map(function (a) { return a.id; });
  global.__ids = { me: ME, fail: FAIL, s1: sid(1), s2: sid(2), s11: sid(11), s14: sid(14) };
  global.__calls = [];
  global.__pending = [];
  global.__hold = false;
  global.__token = TOKEN;

  var READS = {
    admin_open_session: 1,
    ultra_my_access: 1,
    ultra_stats: 1,
    ultra_find_accounts: 1,
    ultra_banned: 1,
    ultra_recent_actions: 1,
    ultra_message_thread: 1
  };

  function copy(a) {
    var c = {}, k;
    for (k in a) if (Object.prototype.hasOwnProperty.call(a, k)) c[k] = a[k];
    return c;
  }

  function answer(fn, payload) {
    if (fn === 'admin_open_session') return { data: TOKEN, error: null };
    if (fn === 'ultra_my_access') {
      return { data: { owner: true, email: 'alexjschendel@gmail.com', commands: [] }, error: null };
    }
    if (fn === 'ultra_stats') {
      return { data: { accounts: global.__accounts.length, active24: 2, allowed: 1, staff: 1, actions24: 0 }, error: null };
    }
    if (fn === 'ultra_find_accounts') {
      var q = String(payload.p_query || '').toLowerCase();
      var matched = global.__accounts.filter(function (a) {
        if (!q) return true;
        return String(a.display_name || '').toLowerCase().indexOf(q) !== -1 ||
          String(a.email || '').toLowerCase().indexOf(q) !== -1;
      });
      /* The live function stops at 60. Mirror that so the cap note is real. */
      return { data: matched.slice(0, 60).map(copy), error: null };
    }
    if (fn === 'ultra_banned') return { data: [], error: null };
    if (fn === 'ultra_recent_actions') return { data: [], error: null };
    if (fn === 'ultra_message_thread') return { data: [], error: null };
    if (fn === 'ultra_send_message') return { data: '2026-01-02T00:00:00Z', error: null };
    if (fn === 'ultra_adjust_gems') return { data: 1000, error: null };
    if (fn === 'ultra_set_ban') {
      if (payload.p_target === ME) {
        return { data: null, error: { message: 'you cannot ban your own account', code: '22023' } };
      }
      if (payload.p_target === FAIL) {
        return { data: null, error: { message: 'no such account', code: 'P0002' } };
      }
      return { data: !!payload.p_on, error: null };
    }
    if (fn === 'ultra_set_staff') return { data: !!payload.p_on, error: null };
    if (fn === 'ultra_set_premium') return { data: !!payload.p_on, error: null };
    if (fn === 'ultra_allow_set' || fn === 'ultra_set_name') return { data: payload.p_name || true, error: null };
    if (fn === 'ultra_wipe_scores' || fn === 'ultra_leave_classes') return { data: 1, error: null };
    if (fn === 'ultra_reset_progress') return { data: true, error: null };
    return { data: null, error: { message: 'unexpected rpc ' + fn, code: 'XX000' } };
  }

  global.Admin = { can: function () { return true; } };
  global.Cloud = {
    user: { id: ME, email: 'alexjschendel@gmail.com' },
    sb: {
      rpc: function (fn, payload) {
        global.__calls.push({ fn: fn, payload: JSON.parse(JSON.stringify(payload || {})) });
        var result = answer(fn, payload || {});
        if (global.__hold && !READS[fn]) {
          return new Promise(function (resolve) {
            global.__pending.push(function () { resolve(result); });
          });
        }
        return Promise.resolve(result);
      }
    }
  };

  global.__drain = function () {
    global.__hold = false;
    return new Promise(function (resolve) {
      var spins = 0;
      function kick() {
        if (++spins > 500) return resolve('timeout');
        var status = document.querySelector('[data-bulk-state]');
        var fn = global.__pending.shift();
        if (fn) { fn(); return setTimeout(kick, 0); }
        if (status && status.getAttribute('data-bulk-state') === 'done') return resolve('done');
        setTimeout(kick, 0);
      }
      kick();
    });
  };
})(window);
