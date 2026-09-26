/* oy-03: the class-tag seams in cloud.js.
 *
 *   node agents/oy-03/tools/cloudtags.js agents/oy-03/assets/js/cloud.js
 *
 * Runs the real file in a vm with a stand-in Supabase client, driven through
 * an actual sign-in so cloud.js's own ready() is true. Testing the module
 * rather than around it is the only way these seams mean anything: every bug
 * this round was in the gap between two files, not inside one.
 *
 * THE PATTERN WORTH KEEPING, and the one that caught my own bug:
 * MAKE THE TWO SOURCES DISAGREE. Local state and the database will both be
 * right about different things, and a test where they happen to match proves
 * nothing. myClasses() reads both, and its first version silently dropped the
 * richer copy. A fixture where enrolled knows the class name and the database
 * knows the tag found it in one run. Every test below that matters is built
 * that way: give each source a different piece of the truth and check the
 * result carries both.
 */
'use strict';
const fs = require('fs'), vm = require('vm');

const SRC = fs.readFileSync(process.argv[2] || 'agents/oy-03/assets/js/cloud.js', 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x) => {
  c ? (pass++, console.log('  PASS  ' + n))
    : (fail++, console.log('  FAIL  ' + n + (x ? '\n        ' + x : '')));
};
const tick = (ms) => new Promise(r => setTimeout(r, ms || 20));

/* A stand-in for supabase-js: records what was asked for, answers from a
   fixture. `rows` may hold a function per table so one table can answer
   differently depending on the columns requested, which is how the class
   sync ('id, code, name') and the tag read ('*') are told apart. */
function makeClient(rows, errs, calls) {
  errs = errs || {};
  function table(name) {
    const st = { table: name, cols: null, op: null, payload: null };
    const chain = {
      select: (c) => { st.cols = c; return chain; },
      eq: () => chain, in: () => chain, order: () => chain, limit: () => chain,
      update: (p) => { st.op = 'update'; st.payload = p; return chain; },
      insert: (p) => { st.op = 'insert'; st.payload = p; return chain; },
      upsert: (p) => { st.op = 'upsert'; st.payload = p; return chain; },
      delete: () => { st.op = 'delete'; return chain; },
      single: () => settle(), maybeSingle: () => settle(),
      then: (res, rej) => settle().then(res, rej)
    };
    function settle() {
      calls.push({ table: st.table, cols: st.cols, op: st.op, payload: st.payload });
      const key = (st.cols === '*' && errs[name + ':star']) ? name + ':star' : name;
      if (errs[key]) return Promise.resolve({ data: null, error: errs[key] });
      let v = rows[name];
      if (typeof v === 'function') v = v(st);
      return Promise.resolve({ data: v === undefined ? null : v, error: null });
    }
    return chain;
  }
  return {
    from: table,
    rpc: (n, args) => {
      const settle = () => {
        calls.push({ rpc: n, args: args });
        const key = 'rpc:' + n;
        if (errs[key]) return Promise.resolve({ data: null, error: errs[key] });
        const v = rows[key];
        return Promise.resolve({ data: v === undefined ? null : v, error: null });
      };
      return { maybeSingle: settle, single: settle, then: (res, rej) => settle().then(res, rej) };
    },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: () => {},
    auth: {
      onAuthStateChange: (cb) => {
        setTimeout(() => cb('SIGNED_IN', { user: { id: 'u1', email: 's@example.com' } }), 0);
        return { data: { subscription: { unsubscribe() {} } } };
      },
      signOut: () => Promise.resolve({ error: null })
    }
  };
}

/* Enough of core.js for the paths under test. */
function makeWindow(rows, errs, calls, state) {
  const win = {};
  const saved = {};
  Object.assign(win, {
    window: win, console, Promise, Math, JSON, Date, RegExp, String, Number,
    Object, Array, setTimeout, clearTimeout, isFinite, parseInt,
    supabase: { createClient: () => makeClient(rows, errs, calls) },
    /* cloud.js listens for the tab coming back and for the network
       returning; neither fires here, but init() must not trip over them */
    document: { addEventListener() {}, removeEventListener() {}, visibilityState: 'visible' },
    addEventListener() {}, removeEventListener() {},
    WW: {
      state: state,
      GUEST_KEY: 'learngeo.save.v1',
      Icons: { info: '', check: '' },
      escapeHtml: (s) => String(s == null ? '' : s),
      onSave() {}, save() { saved.n = (saved.n || 0) + 1; }, saveLocal() {}, saveNow() {},
      toast() {}, defaultState: () => ({ profile: {}, economy: { level: 1, xp: 0 } }),
      readSaved: () => null, userKey: (id) => 'u.' + id, accountId: () => 'u1',
      useAccount() {}, replaceState(s) { if (s) Object.assign(state, s); },
      masteredCount: () => 0
    }
  });
  win.saved = saved;
  return win;
}

async function boot(opts) {
  const calls = [];
  const state = Object.assign({
    profile: { displayName: 'Ada' }, economy: { level: 3, xp: 400 },
    enrolled: null, inbox: [], stream: [], meta: {}, classroom: {}
  }, opts.state || {});
  const win = makeWindow(opts.rows || {}, opts.errs || {}, calls, state);
  vm.createContext(win);
  vm.runInContext(SRC, win);
  /* notReady skips the sign-in, which is what a student on bad wifi looks
     like from in here: a client that exists and an account that has not
     reconciled */
  if (!opts.notReady) win.Cloud.init();
  await tick(30);
  return { Cloud: win.Cloud, state, calls, win };
}

(async function run() {
  console.log('\ncloud.js class tags\n');

  /* ---- 1. the three answers a tag read can give ---- */
  {
    const has = await boot({ rows: { profiles: { id: 'u1', save: {} }, 'rpc:class_tag': { id: 'c1', tag: 'GEOG', tag_glyph: 'globe' } } });
    const got = await has.Cloud.classTag.read('c1');
    ok('a class with a tag answers known, with the letters and the glyph',
       got.known === true && got.tag === 'GEOG' && got.glyph === 'globe', JSON.stringify(got));

    const none = await boot({ rows: { profiles: { id: 'u1', save: {} }, 'rpc:class_tag': { id: 'c1', tag: null, tag_glyph: null } } });
    const g2 = await none.Cloud.classTag.read('c1');
    ok('a class that has chosen no tag says so as a fact, not as a shrug',
       g2.known === true && g2.tag === null, JSON.stringify(g2));

    const absent = await boot({
      rows: { profiles: { id: 'u1', save: {} } },
      errs: { 'rpc:class_tag': { code: 'PGRST202', message: 'Could not find the function public.class_tag' } }
    });
    const g3 = await absent.Cloud.classTag.read('c1');
    ok('0005 not applied reads as absent, never as "no tag"',
       g3.known === false && g3.why === 'absent', JSON.stringify(g3));

    /* the function exists and hands back nothing: we are not entitled to see
       this tag. Calling that absent would tell a screen the class has no tag
       when the truth is we were not shown it. */
    const notOurs = await boot({ rows: { profiles: { id: 'u1', save: {} }, 'rpc:class_tag': null } });
    const g5 = await notOurs.Cloud.classTag.read('c1');
    ok('a class whose tag we may not see is refused, not absent',
       g5.known === false && g5.why === 'refused', JSON.stringify(g5));

    const travelled = await boot({ rows: { profiles: { id: 'u1', save: {} }, 'rpc:class_tag': { id: 'c9', tag: 'MAPS', tag_glyph: 'compass' } } });
    const g6 = await travelled.Cloud.classTag.read('c9');
    ok('a tag worn in from another class reads through the function',
       g6.known === true && g6.tag === 'MAPS' && g6.glyph === 'compass');

    const refused = await boot({
      rows: { profiles: { id: 'u1', save: {} } },
      errs: { 'rpc:class_tag': { code: '42501', message: 'permission denied' } }
    });
    const g4 = await refused.Cloud.classTag.read('c1');
    ok('a refusal is refused, and carries the code',
       g4.known === false && g4.why === 'refused' && g4.code === '42501', JSON.stringify(g4));
  }

  /* ---- 2. writes say what they mean ---- */
  {
    const t = await boot({ rows: { profiles: { id: 'u1', save: {} }, classes: { id: 'c1' } } });
    t.calls.length = 0;
    await t.Cloud.classTag.write('c1', 'geog', 'globe');
    const wrote = t.calls.filter(c => c.op === 'update').pop();
    ok('a lowercase tag is uppercased here, not trusted from a screen',
       wrote && wrote.payload.tag === 'GEOG', JSON.stringify(wrote && wrote.payload));

    t.calls.length = 0;
    let rejected = false;
    await t.Cloud.classTag.write('c1', 'AB', 'globe').catch(() => { rejected = true; });
    ok('a tag that is not four letters is refused without touching the network',
       rejected && t.calls.filter(c => c.op === 'update').length === 0);

    t.calls.length = 0;
    await t.Cloud.classTag.write('c1', '', '');
    const cleared = t.calls.filter(c => c.op === 'update').pop();
    ok('clearing takes the glyph with it: half a tag is not a tag',
       cleared && cleared.payload.tag === null && cleared.payload.tag_glyph === null);
  }

  /* ---- 3. an uncertain read never sinks a certain one ---- */
  {
    const r = await boot({
      rows: {
        profiles: { id: 'u1', save: {} },
        classes: { id: 'c1', code: 'AAA', name: 'Period 3' },
        assignments: [], announcements: [], class_members: []
      },
      errs: { 'rpc:class_tag': { code: '42501', message: 'permission denied' } },
      state: { enrolled: { classId: 'c1', code: 'AAA', className: 'Period 3', tag: 'GEOG' } }
    });
    const okSync = await r.Cloud.studentSync();
    ok('a refused tag read does not sink the class sync', okSync === true);
    ok('and does not blank a tag the device already knew', r.state.enrolled.tag === 'GEOG');
  }

  /* ---- 4. enrolled.tag is a string, because that is what the renderer reads ---- */
  {
    const r = await boot({
      rows: {
        profiles: { id: 'u1', save: {} },
        classes: { id: 'c1', code: 'AAA', name: 'Period 3' },
        'rpc:class_tag': { id: 'c1', tag: 'GEOG', tag_glyph: 'globe' },
        assignments: [], announcements: [], class_members: []
      },
      state: { enrolled: { classId: 'c1', code: 'AAA', className: 'Period 3' } }
    });
    await r.Cloud.studentSync();
    ok('enrolled.tag is a plain four-letter string, not an object',
       typeof r.state.enrolled.tag === 'string' && r.state.enrolled.tag === 'GEOG',
       'an object stringifies to [object Object] and renders as nothing at all');
    ok('the glyph is cached beside it, or half the answer goes nowhere',
       r.state.enrolled.tagGlyph === 'globe', JSON.stringify(r.state.enrolled));
    const classReads = r.calls.filter(c => c.table === 'classes').map(c => c.cols);
    ok('the class sync select was not widened to carry it',
       classReads.indexOf('id, code, name') !== -1 && r.calls.some(c => c.rpc === 'class_tag'),
       JSON.stringify(classReads));
  }

  /* ---- 5. THE PATTERN: make the two sources disagree ---- */
  {
    /* local state knows the class NAME and not the tag; the database knows
       the TAG and is asked separately. First-wins deduplication dropped the
       database copy, so a student was offered their own class with no tag
       and could not wear it. */
    const r = await boot({
      rows: {
        profiles: { id: 'u1', save: {} },
        classes: (st) => st.cols === '*'
          ? [{ id: 'c1', name: 'Period 3', tag: 'GEOG' }, { id: 'c2', name: 'Period 5', tag: 'MAPS' }]
          : { id: 'c1', code: 'AAA', name: 'Period 3' },
        class_members: [{ class_id: 'c1', student_id: 'u1' }, { class_id: 'c2', student_id: 'u1' }],
        assignments: [], announcements: []
      },
      state: { enrolled: { classId: 'c1', code: 'AAA', className: 'Period 3' } }
    });
    await r.Cloud.studentSync();
    const list = r.Cloud.myClasses();
    const mine = list.filter(c => c.classId === 'c1')[0];
    ok('the enrolled class keeps the tag only the database knew',
       mine && mine.tag === 'GEOG', JSON.stringify(list));
    ok('and the name only local state knew', mine && mine.className === 'Period 3');
    ok('a class the student is still in but no longer enrolled in is offered too',
       list.filter(c => c.classId === 'c2' && c.tag === 'MAPS').length === 1,
       'a failed leave leaves them a member; the picker must not under-report');

    r.calls.length = 0;
    r.Cloud.myClasses(); r.Cloud.myClasses();
    ok('drawing the control costs no requests', r.calls.length === 0);
    ok('and it is an array, never a promise', Array.isArray(list) && typeof list.then !== 'function');
  }

  /* ---- 6. leaving a named class ---- */
  {
    const r = await boot({
      rows: { profiles: { id: 'u1', save: {} }, class_members: [], classes: { id: 'c1' } },
      state: { enrolled: { classId: 'c2', className: 'Period 5' } }
    });
    r.calls.length = 0;
    await r.Cloud.leaveClass('c1');
    ok('a stale membership can be left by name', r.calls.filter(c => c.op === 'delete').length === 1);
    r.calls.length = 0;
    const left = await r.Cloud.leaveClass();
    ok('and the old call site, with no argument, still works',
       r.calls.filter(c => c.op === 'delete').length === 1);
    ok('a leave that happened resolves true, not undefined', left === true);

    /* the silent path: it used to resolve, reporting success for something
       it never sent, so a student on bad wifi was told they had left */
    let rejected = false;
    const notReady = await boot({ rows: {}, state: { enrolled: { classId: 'c1' } }, notReady: true });
    notReady.calls.length = 0;
    await notReady.Cloud.leaveClass('c1').then(function () {}, function () { rejected = true; });
    const sent = notReady.calls.filter(c => c.op === 'delete').length;
    ok('not connected rejects rather than claiming success', rejected, 'it resolved instead');
    ok('and sends nothing, which is the point', sent === 0);

    const nothing = await boot({ rows: { profiles: { id: 'u1', save: {} } }, state: { enrolled: null } });
    const none = await nothing.Cloud.leaveClass();
    ok('nothing to leave resolves false, told apart from having left', none === false);
  }

  console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
  process.exit(fail ? 1 : 0);
})();
