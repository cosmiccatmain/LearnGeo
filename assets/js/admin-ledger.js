/* ------------------------------------------------------------------
   LearnGeo — the admin ledger, the penalty, and the appeal.

   Until now the gems panel wrote a new balance and left nothing behind.
   No timestamp, no record, no way afterwards to tell a diamond that was
   earned from one that was handed over. That is why this file exists,
   and it is worth being exact about what it can and cannot do:

     From now on   every admin action is recorded here before it lands,
                   so the penalty has something true to read.
     Before now    nothing was recorded, so nothing can be found. A
                   sweep of the last 24 hours over a log that starts
                   today returns nobody, and that is the honest answer
                   rather than a bug.

   The penalty takes 85% of the balance AT THE MOMENT IT RUNS, not 85%
   of what was granted. That is what was asked for, and it is worth
   saying plainly because the two come apart: somebody granted 100 who
   then earned 900 honestly loses 850.

   Every penalty is reversible. The amount taken is stored, so an appeal
   that succeeds puts back exactly what was removed rather than an
   estimate of it.
-------------------------------------------------------------------*/
(function (global) {
  'use strict';
  var W = global.WW;

  var WINDOW_H = 24;          /* how far back a grant still counts */
  var RATE = 0.85;            /* share of the balance a penalty takes */
  var MAX_LOG = 400;

  function store() {
    var s = W.state;
    if (!s.enforcement || typeof s.enforcement !== 'object') {
      s.enforcement = { log: [], penalty: null, startedAt: Date.now() };
    }
    if (!Array.isArray(s.enforcement.log)) s.enforcement.log = [];
    if (!s.enforcement.startedAt) s.enforcement.startedAt = Date.now();
    return s.enforcement;
  }

  /* ============================== writing =========================== */
  function record(kind, detail) {
    var e = store();
    var row = {
      t: Date.now(),
      kind: String(kind),
      amount: detail && typeof detail.amount === 'number' ? detail.amount : null,
      balanceAfter: W.state.economy ? W.state.economy.diamonds : null,
      scope: (detail && detail.scope) || '',
      note: (detail && detail.note) || ''
    };
    e.log.push(row);
    if (e.log.length > MAX_LOG) e.log = e.log.slice(-MAX_LOG);
    W.saveNow();
    return row;
  }

  function log() { return store().log.slice(); }

  /* ============================== reading =========================== */
  function since(hours) {
    var cut = Date.now() - (hours || WINDOW_H) * 3600e3;
    return store().log.filter(function (r) { return r.t >= cut; });
  }

  /* A grant is a gems-panel action that ADDED diamonds. Taking them away
     is not an offence, so a negative amount is not one either. */
  function recentGrants(hours) {
    return since(hours).filter(function (r) {
      return r.kind === 'grant' && typeof r.amount === 'number' && r.amount > 0;
    });
  }

  /* Nothing recorded before this file shipped, so a window that reaches
     back past the first entry is reaching into a time with no evidence
     in it. Callers show this rather than implying the window was clean. */
  function blindBefore() { return store().startedAt; }

  function windowIsPartial(hours) {
    return blindBefore() > Date.now() - (hours || WINDOW_H) * 3600e3;
  }

  /* ============================== penalty =========================== */
  function current() { return store().penalty; }

  function owing() {
    var p = current();
    if (p && (p.status === 'applied' || p.status === 'appealed')) return null;  /* already taken */
    var grants = recentGrants(WINDOW_H);
    if (!grants.length) return null;
    /* Only grants since the last settled penalty count, so one offence is
       not charged twice after an appeal has already been decided. */
    var after = p && p.t ? p.t : 0;
    var fresh = grants.filter(function (g) { return g.t > after; });
    if (!fresh.length) return null;
    return {
      grants: fresh,
      granted: fresh.reduce(function (a, g) { return a + g.amount; }, 0),
      balance: W.state.economy.diamonds,
      take: Math.floor(W.state.economy.diamonds * RATE)
    };
  }

  function apply() {
    var due = owing();
    if (!due) return null;
    var e = store();
    var before = W.state.economy.diamonds;
    var take = Math.floor(before * RATE);
    W.state.economy.diamonds = Math.max(0, before - take);

    e.penalty = {
      t: Date.now(),
      taken: take,
      balanceBefore: before,
      granted: due.granted,
      grantCount: due.grants.length,
      rate: RATE,
      status: 'applied',
      appeal: null,
      seen: false
    };
    record('penalty', { amount: -take, note: 'automatic, ' + Math.round(RATE * 100) + '% of balance' });
    W.saveNow();
    return e.penalty;
  }

  /* Run once on open. Returns the penalty if one was applied just now. */
  function enforce() {
    if (!owing()) return null;
    return apply();
  }

  function markSeen() {
    var p = current();
    if (p && !p.seen) { p.seen = true; W.saveNow(); }
  }

  /* ============================== appeal ============================ */
  function appeal(text) {
    var p = current();
    if (!p || p.status !== 'applied') return false;
    p.status = 'appealed';
    p.appeal = { t: Date.now(), text: String(text || '').slice(0, 600) };
    record('appeal', { note: p.appeal.text.slice(0, 120) });
    W.saveNow();
    return true;
  }

  /* UltraAdmin decides. Reversing puts back exactly what was taken. */
  function reverse() {
    var p = current();
    if (!p || (p.status !== 'appealed' && p.status !== 'applied')) return false;
    W.state.economy.diamonds += p.taken;
    p.status = 'reversed';
    p.reversedAt = Date.now();
    record('reversal', { amount: p.taken, note: 'appeal upheld' });
    W.saveNow();
    return true;
  }

  function uphold() {
    var p = current();
    if (!p || p.status !== 'appealed') return false;
    p.status = 'upheld';
    p.decidedAt = Date.now();
    record('decision', { note: 'appeal refused' });
    W.saveNow();
    return true;
  }

  function clear() {
    var e = store();
    e.penalty = null;
    W.saveNow();
  }

  global.AdminLedger = {
    record: record, log: log, since: since, recentGrants: recentGrants,
    owing: owing, apply: apply, enforce: enforce, current: current,
    markSeen: markSeen, appeal: appeal, reverse: reverse, uphold: uphold, clear: clear,
    blindBefore: blindBefore, windowIsPartial: windowIsPartial,
    get rate() { return RATE; },
    get windowHours() { return WINDOW_H; }
  };
})(window);
