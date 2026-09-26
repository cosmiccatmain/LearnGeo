/* oy-03: the claims cloud-geolive.js makes that someone could quietly regress.
 *
 *   node agents/oy-03/tools/geolivecloud.js agents/oy-03/assets/js/cloud-geolive.js
 *
 * Three of these exist because the thing they check was once wrong in a way
 * that looked fine from outside:
 *
 *   "off means off"        a switched-off feature that still polls three
 *                          tables every two seconds is not off. This counts
 *                          every call rather than trusting the switch.
 *   the fault channel      a database refusing, a database with no tables and
 *                          an empty result all used to arrive as the same
 *                          null, and a screen invented an explanation a real
 *                          teacher then acted on.
 *   god mode excluded      a game played with the answers showing must not
 *                          reach a child's place in a class table.
 */
'use strict';
const fs = require('fs'), vm = require('vm');

const SRC = fs.readFileSync(process.argv[2] || 'agents/oy-03/assets/js/cloud-geolive.js', 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x) => {
  c ? (pass++, console.log('  PASS  ' + n))
    : (fail++, console.log('  FAIL  ' + n + (x ? '\n        ' + x : '')));
};
const tick = (ms) => new Promise(r => setTimeout(r, ms || 20));

function boot(opts) {
  opts = opts || {};
  const calls = [], logs = [];
  function table(name) {
    const st = { table: name, cols: null, op: null, payload: null };
    const chain = {
      select: (c) => { st.cols = c; return chain; },
      eq: () => chain, in: () => chain, order: () => chain, limit: () => chain,
      update: (p) => { st.op = 'update'; st.payload = p; return chain; },
      insert: (p) => { st.op = 'insert'; st.payload = p; return chain; },
      upsert: (p) => { st.op = 'upsert'; st.payload = p; return chain; },
      single: () => settle(), maybeSingle: () => settle(),
      then: (res, rej) => settle().then(res, rej)
    };
    function settle() {
      calls.push({ table: name, cols: st.cols, op: st.op, payload: st.payload });
      if (opts.errs && opts.errs[name]) return Promise.resolve({ data: null, error: opts.errs[name] });
      let v = (opts.rows || {})[name];
      if (typeof v === 'function') v = v(st);
      return Promise.resolve({ data: v === undefined ? null : v, error: null });
    }
    return chain;
  }
  const win = {};
  Object.assign(win, {
    window: win, console: {
      log() {}, warn: (...a) => logs.push('WARN ' + a.map(String).join(' ')),
      error: (...a) => logs.push('ERROR ' + a.map(String).join(' '))
    },
    Promise, Math, JSON, Date, RegExp, String, Number, Object, Array,
    setTimeout, clearTimeout, isFinite, parseInt,
    document: { addEventListener() {}, removeEventListener() {}, visibilityState: 'visible' },
    addEventListener() {}, removeEventListener() {},
    GodMode: opts.god === undefined ? undefined : { on: opts.god },
    WW: { state: { settings: { sound: false }, economy: { level: 5, xp: 900 } }, Sound: {}, Icons: {} },
    Cloud: {
      available: true, user: opts.signedOut ? null : { id: 'u1' },
      sb: {
        from: table,
        rpc: (n) => ({ then: (res, rej) => { calls.push({ rpc: n }); return Promise.resolve({ data: null, error: (opts.errs || {})[n] || null }).then(res, rej); } }),
        channel: () => ({ on() { return this; }, subscribe() { return this; } }),
        removeChannel: () => {}
      }
    }
  });
  vm.createContext(win);
  vm.runInContext(SRC, win);
  return { G: win.GeoLiveCloud, calls, logs, win };
}

(async function run() {
  console.log('\ncloud-geolive.js\n');

  /* ---- off means off, counted rather than trusted ---- */
  {
    const t = boot({ rows: { live_sessions: [], live_players: [], live_answers: [] } });
    t.G.setEnabled(false);
    t.calls.length = 0;
    await t.G.available();
    await t.G.open('c1', [{ prompt: 'q' }], ['s1']);
    await t.G.join('ABC234', null, 'Ada');
    await t.G.answer('s1', 'p1', 0, 'Lima', 900);
    await t.G.setStatus('s1', 'asking', 0);
    await t.G.close('s1');
    await t.G.markAnswers('s1', 0, [{ playerId: 'p1', correct: true, points: 900 }]);
    await t.G.saveStandings('s1', [{ id: 'p1', score: 900, streak: 1 }]);
    await t.G.totals('c1');
    await t.G.recordedAnswers('s1', 0);
    const stop = await t.G.watch('s1', () => {});
    await tick(60);
    if (typeof stop === 'function') stop();
    ok('switched off, every entry point makes ZERO network calls',
       t.calls.length === 0, JSON.stringify(t.calls.slice(0, 3)));
  }

  /* ---- a refusal, an absence and a bad moment are three different things ---- */
  {
    const blocked = boot({ errs: { live_sessions: { code: '42P17', message: 'infinite recursion detected in policy for relation "live_players"' } } });
    await blocked.G.available();
    ok('a policy that cannot work reads as blocked', blocked.G.status() === 'blocked');
    ok('and says so loudly, because it will not fix itself',
       blocked.logs.some(l => l.indexOf('ERROR') === 0), JSON.stringify(blocked.logs));
    const before = blocked.calls.length;
    await blocked.G.available(); await blocked.G.available();
    ok('and is not asked again: retrying a structural refusal only hides it',
       blocked.calls.length === before);

    const absent = boot({ errs: { live_sessions: { code: '42P01', message: 'relation "public.live_sessions" does not exist' } } });
    await absent.G.available();
    ok('a table that does not exist yet reads as absent, and stays quiet',
       absent.G.status() === 'absent' && !absent.logs.some(l => l.indexOf('ERROR') === 0));

    const offline = boot({ errs: { live_sessions: { message: 'Failed to fetch' } } });
    await offline.G.available();
    const n = offline.calls.length;
    await offline.G.available();
    ok('a bad moment reads as offline, and IS asked again',
       offline.G.status() === 'offline' && offline.calls.length > n);
  }

  /* ---- the probe asks the question that matters when signed in ---- */
  {
    const out = boot({ signedOut: true, rows: { live_sessions: [] } });
    await out.G.available();
    ok('signed out, one probe is enough: nothing else is readable anyway',
       out.calls.filter(c => c.table === 'live_sessions').length === 1);

    const inn = boot({ rows: { live_sessions: [], live_players: [] } });
    await inn.G.available();
    ok('signed in, it also reads the table whose policy can refuse',
       inn.calls.filter(c => c.table === 'live_players').length === 1,
       'reading only live_sessions reported ready while a teacher was refused');
  }

  /* ---- god mode is recorded as it is played, not asserted when read ---- */
  {
    const on = boot({ god: true, rows: { live_sessions: { status: 'asking', question_index: 0 }, live_answers: { player_id: 'p1', question_index: 0, choice: 'Lima', ms: 900, created_at: new Date().toISOString() } } });
    await on.G.answer('s1', 'p1', 0, 'Lima', 900);
    const wrote = on.calls.filter(c => c.table === 'live_answers' && c.op === 'insert').pop();
    ok('an answer played with god mode on carries it', wrote && wrote.payload.assisted === true);

    const off = boot({ god: false, rows: { live_sessions: { status: 'asking', question_index: 0 }, live_answers: { player_id: 'p1' } } });
    await off.G.answer('s1', 'p1', 0, 'Lima', 900);
    const w2 = off.calls.filter(c => c.table === 'live_answers' && c.op === 'insert').pop();
    ok('and an honest one says so too', w2 && w2.payload.assisted === false);

    const none = boot({ rows: { live_sessions: { status: 'asking', question_index: 0 }, live_answers: { player_id: 'p1' } } });
    await none.G.answer('s1', 'p1', 0, 'Lima', 900);
    ok('a page that never loaded god mode does not throw',
       none.calls.filter(c => c.table === 'live_answers').length === 1);
  }

  /* ---- an assisted game never reaches a child's place in the table ---- */
  {
    const players = [
      { session_id: 's1', student_id: 'u1', name: 'Ada', score: 1800, streak: 4, answered: 10, correct: 8, joined_at: 'a', assisted: false },
      { session_id: 's2', student_id: 'u1', name: 'Ada', score: 9000, streak: 20, answered: 10, correct: 10, joined_at: 'b', assisted: true },
      { session_id: 's1', student_id: 'u2', name: 'Sam', score: 0, streak: 0, answered: 0, correct: 0, joined_at: null, assisted: false }
    ];
    const t = boot({ rows: { live_sessions: [{ id: 's1' }, { id: 's2' }], live_players: players } });
    await t.G.available();
    const rows = await t.G.totals('c1');
    const ada = rows.filter(r => r.name === 'Ada')[0];
    ok('the assisted game is dropped whole, points, streak and accuracy',
       ada && ada.points === 1800 && ada.bestStreak === 4 && ada.answered === 10 && ada.correct === 8,
       JSON.stringify(ada));
    ok('and the teacher is told one was left out', ada && ada.excludedGames === 1);
    ok('a student who was invited but never turned up is not counted as a game',
       rows.filter(r => r.name === 'Sam').length === 0,
       'counting an absence as a played game drags down the accuracy of those who came');
  }

  console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
  process.exit(fail ? 1 : 0);
})();
