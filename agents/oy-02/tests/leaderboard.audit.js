/* Adversarial audit of oy-07's assets/js/leaderboard.js, by oy-02, who did
   not write it. Not part of the site.

     node agents/oy-02/tests/leaderboard.audit.js

   REQUIREMENT checks are round 3's rule: rank on level, never on gems.
   HAZARD checks are things that hold today but break under a named
   condition. A hazard is not a bug report, it is a "this breaks when X". */

const fs = require('fs');
const path = require('path');

const candidates = [
  path.join(__dirname, '..', '..', 'oy-07', 'assets', 'js', 'leaderboard.js'),
  path.join(__dirname, '..', '..', '..', 'assets', 'js', 'leaderboard.js')
];
const FILE = candidates.find(p => fs.existsSync(p));
if (!FILE) { console.error('leaderboard.js not found'); process.exit(2); }
const SRC = fs.readFileSync(FILE, 'utf8');
console.log('auditing ' + FILE);
console.log('mtime   ' + fs.statSync(FILE).mtime.toLocaleString() + '\n');

/* ------------------------------ harness ------------------------------ */

function sandbox(extra) {
  const win = Object.assign({
    /* the real curve from core.js, so the file's preferred path is exercised */
    WW: {
      escapeHtml: s => String(s == null ? '' : s),
      xpToNext: level => 80 + 40 * level,
      state: { classroom: null }
    },
    console: { warn() {} }
  }, extra || {});
  new Function('window', 'document', SRC)(win, { getElementById: () => null });
  return { L: win.ClassLeaderboard, win };
}

const el = () => ({ innerHTML: '', isConnected: true });
const person = (id, name) => ({ id, name, keys: [id || ('name:' + name)] });
const R = (name, id, assignmentId, pct, at, correct, total) =>
  ({ name, studentId: id, assignmentId, pct, at, correct, total });

let pass = 0, fail = 0, hazards = 0;
const ok = (label, good, detail) => {
  if (good) { pass++; console.log('  PASS ' + label); }
  else { fail++; console.log('  FAIL ' + label + (detail ? '\n         ' + detail : '')); }
};
const hazard = (label, detail) => {
  hazards++;
  console.log('  HAZARD ' + label + (detail ? '\n         ' + detail : ''));
};

/* ===================================================================== */
console.log('REQUIREMENT: level leads, gems never');

{
  /* Searching the source finds the word in the comment that says it does not
     use diamonds, which proves nothing. Strip comments, then ask whether any
     code reads such a field, and whether one ever reaches the rendered table. */
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const readsField = /\.diamonds|\['diamonds'\]|economy/.test(code);
  ok('no code path reads diamonds or economy', !readsField,
    'code (comments stripped) references a diamonds or economy field');

  const { L } = sandbox();
  const people = [person('s1', 'Ana')];
  people[0].economy = { diamonds: 99999, level: 40, xp: 1000 };
  const e = el();
  L.mount(e, { classroom: { results: [R('Ana', 's1', 'a1', 100, 1, 10, 10)] }, people });
  ok('and no diamond reaches the rendered table', !/💎|[Dd]iamond/.test(e.innerHTML),
    e.innerHTML.slice(0, 160));
}
{
  // THE TWO MINUTE TEST
  const { L } = sandbox();
  const people = [person('s1', 'Ana'), person('s2', 'Ben')];
  const c = { results: [R('Ana', 's1', 'a1', 100, 1, 10, 10), R('Ben', 's2', 'a1', 60, 2, 6, 10)] };
  const before = L.order(L.tally(c, { people })).map(t => t.name + ':L' + t.level + '+' + t.into);
  people[0].diamonds = 0; people[0].economy = { diamonds: 0 };     // Ana spends every gem
  people[1].diamonds = 99999; people[1].economy = { diamonds: 99999 };
  const after = L.order(L.tally(c, { people })).map(t => t.name + ':L' + t.level + '+' + t.into);
  ok('spending every diamond does not move a student',
    JSON.stringify(before) === JSON.stringify(after), before + ' vs ' + after);
}
{
  // level outranks everything else, including a better percentage
  const { L } = sandbox();
  const people = [person('s1', 'Ana'), person('s2', 'Ben')];
  const rows = [R('Ben', 's2', 'a1', 100, 2, 5, 5)];          // perfect, but tiny
  for (let i = 0; i < 6; i++) rows.push(R('Ana', 's1', 'a' + i, 70, i, 14, 20));  // plenty of work
  const out = L.order(L.tally({ results: rows }, { people }));
  ok('more work outranks a better percentage',
    out[0].name === 'Ana' && out[0].level > out[1].level,
    JSON.stringify(out.map(t => t.name + ':L' + t.level)));
}
{
  const { L } = sandbox();
  const people = [person('s1', 'Ana'), person('s2', 'Ben')];
  const c = { results: [R('Ana', 's1', 'a1', 100, 1, 13, 13), R('Ben', 's2', 'a1', 100, 2, 12, 12)] };
  const out = L.order(L.tally(c, { people }));
  ok('same level, more XP inside it comes first',
    out[0].level === out[1].level && out[0].name === 'Ana' && out[0].into > out[1].into,
    JSON.stringify(out.map(t => t.name + ':L' + t.level + '+' + t.into)));
}
{
  const { L } = sandbox();
  const people = [person('s1', 'Ana'), person('s2', 'New')];
  const c = { results: [R('Ana', 's1', 'a1', 50, 1, 5, 10)] };
  const out = L.ranked(L.order(L.tally(c, { people })));
  const newbie = out.find(t => t.name === 'New');
  ok('a student with no level yet sits last and is not shown as level 1',
    out[out.length - 1].name === 'New' && newbie.started === false,
    JSON.stringify(out.map(t => t.name + ':started=' + t.started)));
  const e = el();
  sandbox().L.mount(e, { classroom: c, people });
  ok('and the table says "not started" rather than a number',
    /not started/.test(e.innerHTML), e.innerHTML.slice(0, 200));
}
{
  const { L } = sandbox();
  const people = [person('s1', 'A'), person('s2', 'B'), person('s3', 'C')];
  const c = { results: [
    R('A', 's1', 'a1', 100, 1, 2, 2), R('B', 's2', 'a1', 100, 2, 2, 2), R('C', 's3', 'a1', 100, 3, 2, 2)
  ] };
  const out = L.ranked(L.order(L.tally(c, { people })));
  ok('a class where everyone is level 1 is one joint place, not an invented order',
    out.every(t => t.level === 1) && out.every(t => t.place === 1) && out.every(t => t.tied),
    JSON.stringify(out.map(t => t.name + ':L' + t.level + ' place ' + t.place)));
  const e = el();
  sandbox().L.mount(e, { classroom: c, people });
  ok('and no medal is handed out when nobody is ahead', !/🥇/.test(e.innerHTML));
}
{
  // GeoLive points must not move the ranking; GeoLive answers must
  const { L } = sandbox();
  const people = [person('s1', 'Ana'), person('s2', 'Ben')];
  const c = { results: [R('Ana', 's1', 'a1', 100, 1, 20, 20), R('Ben', 's2', 'a1', 100, 2, 20, 20)] };
  const list = L.tally(c, { people });
  L.applyLive(list, [{ studentId: 's2', name: 'Ben', points: 999999, games: 3, bestStreak: 9 }]);
  const out = L.order(list);
  ok('a million GeoLive points cannot overtake anybody',
    out[0].name === 'Ana' && out[0].level === out[1].level,
    JSON.stringify(out.map(t => t.name + ':L' + t.level + ' live ' + t.live)));

  const list2 = L.tally(c, { people });
  L.applyLive(list2, [{ studentId: 's2', name: 'Ben', points: 10, games: 1, answered: 30, correct: 30 }]);
  const out2 = L.order(list2);
  ok('but questions answered in a live game do raise a level',
    out2[0].name === 'Ben' && out2[0].level > out2[1].level,
    JSON.stringify(out2.map(t => t.name + ':L' + t.level)));
}
{
  let called = 0;
  const { L } = sandbox({ GeoLiveCloud: { totals: () => { called++; return Promise.resolve([]); } } });
  const c = { cloudId: 'c1', members: [{ id: 's1', name: 'Ana' }], results: [R('Ana', 's1', 'a1', 100, 1, 10, 10)] };
  const offEl = el();
  L.mount(offEl, { classId: 'c1', classroom: c, enabled: false });
  ok('switched off means no network call', called === 0, 'totals() ran ' + called + ' times');
  ok('and nothing is drawn', offEl.innerHTML === '', JSON.stringify(offEl.innerHTML.slice(0, 80)));
  L.mount(el(), { classId: 'c1', classroom: c });
  ok('left alone, it still reads GeoLive (so the switch is opt-out, not opt-in)', called === 1,
    'totals() ran ' + called + ' times');
}
{
  /* levelFrom has to land on the same level core.js would, or a student's
     own profile and this table disagree. Replica of award()'s loop. */
  const { L } = sandbox();
  const xpToNext = level => 80 + 40 * level;
  function coreLevel(chunks) {
    let level = 1, xp = 0;
    chunks.forEach(n => {
      xp += n;
      while (xp >= xpToNext(level)) { xp -= xpToNext(level); level += 1; }
    });
    return { level, into: xp };
  }
  let worst = null;
  for (let total = 0; total <= 6000 && !worst; total++) {
    const a = coreLevel([total]), b = L.levelFrom(total);
    if (a.level !== b.level || a.into !== b.into) worst = { total, core: a, file: b };
  }
  ok('levelFrom matches core.js for every XP total from 0 to 6000', !worst, JSON.stringify(worst));

  // and awarded in dribs and drabs, the way a real student earns it
  let mismatch = null;
  for (let seed = 1; seed <= 200 && !mismatch; seed++) {
    const chunks = [];
    let total = 0, x = seed;
    for (let i = 0; i < 25; i++) { x = (x * 1103515245 + 12345) % 2147483648; const n = x % 90; chunks.push(n); total += n; }
    const a = coreLevel(chunks), b = L.levelFrom(total);
    if (a.level !== b.level || a.into !== b.into) mismatch = { chunks, core: a, file: b };
  }
  ok('and matches when the XP arrives in pieces rather than all at once', !mismatch,
    JSON.stringify(mismatch));

  ok('rubbish XP does not produce a rubbish level',
    L.levelFrom(-500).level === 1 && L.levelFrom(NaN).level === 1 && L.levelFrom(undefined).level === 1);
}

/* ===================================================================== */
console.log('\nHAZARDS: holds today, breaks when X');

{
  // a mark the teacher typed by hand has no question count under it
  const { L } = sandbox();
  const people = [person('s1', 'Ana'), person('s2', 'Ben')];
  const c = { results: [
    { name: 'Ana', studentId: 's1', assignmentId: 'a1', pct: 95, at: 1, manual: true },
    { name: 'Ben', studentId: 's2', assignmentId: 'a1', pct: 40, at: 2, manual: true }
  ] };
  const out = L.ranked(L.order(L.tally(c, { people })));
  hazard('a class marked entirely by hand has no leaderboard at all',
    JSON.stringify(out.map(t => t.name + ': started=' + t.started + ' level=' + t.level + ' acc=' + L.accuracy(t))) +
    '\n         Typed marks carry a percentage and no question count, so they earn no XP and\n' +
    '         nobody counts as started. The table reads "not started" for the whole class\n' +
    '         while the gradebook beside it shows 95% and 40%. Deliberate per the comment in\n' +
    '         tally(), and correct for levels, but it is the one case where this table says\n' +
    '         less than the old points column did. Worth a line in the caption at least.');
}
{
  // the exported applyLive is not idempotent
  const { L } = sandbox();
  const people = [person('s1', 'Ana')];
  const c = { results: [R('Ana', 's1', 'a1', 100, 1, 10, 10)] };
  const list = L.tally(c, { people });
  const rows = [{ studentId: 's1', name: 'Ana', points: 100, games: 1, answered: 20, correct: 20 }];
  L.applyLive(list, rows);
  const once = { level: list[0].level, into: list[0].into, live: list[0].live };
  L.applyLive(list, rows);
  const twice = { level: list[0].level, into: list[0].into, live: list[0].live };
  hazard('applying the same GeoLive rows twice counts them twice',
    'once ' + JSON.stringify(once) + ', twice ' + JSON.stringify(twice) + '\n' +
    '         mount() is safe because it re-tallies from scratch first. But applyLive is\n' +
    '         exported, and a screen that refreshes by calling it again on tallies it already\n' +
    '         has inflates levels with no error. Either re-tally, or key it on the game the\n' +
    '         way GeoLive.applyRecorded keys on the stored answer.');
}
{
  // two accounts, one name: every tie-break runs out
  const { L } = sandbox();
  const a = person('s1', 'Sam'), b = person('s2', 'Sam');
  const rows = [R('Sam', 's1', 'a1', 90, 1, 9, 10), R('Sam', 's2', 'a1', 90, 2, 9, 10)];
  const one = L.order(L.tally({ results: rows }, { people: [a, b] })).map(t => t.id);
  const two = L.order(L.tally({ results: rows }, { people: [b, a] })).map(t => t.id);
  hazard('two accounts with the same name are ordered by whatever the roster did',
    'roster [s1,s2] gives ' + JSON.stringify(one) + ', roster [s2,s1] gives ' + JSON.stringify(two) + '\n' +
    '         The last tie-break is the name and these two share one, so the order follows\n' +
    '         roster arrival, which is a network result. They are both marked tied and share a\n' +
    '         place, so it is cosmetic today. Ending on the account id would close it, the way\n' +
    '         GeoLive standings end on the seat.');
}
{
  // equal timestamps decide a streak
  const { L } = sandbox();
  const p = [person('s1', 'Ana')];
  const good1 = R('Ana', 's1', 'a1', 100, 5, 10, 10);
  const bad = R('Ana', 's1', 'a2', 40, 5, 4, 10);
  const good2 = R('Ana', 's1', 'a3', 100, 5, 10, 10);
  const first = L.tally({ results: [good1, bad, good2] }, { people: p })[0].best;
  const second = L.tally({ results: [good1, good2, bad] }, { people: p })[0].best;
  hazard('best streak depends on row order when timestamps are equal',
    'same three quizzes: best ' + first + ' one way, ' + second + ' the other\n' +
    '         counted() sorts on `at` alone, so rows sharing a timestamp keep the order the\n' +
    '         database returned. Only the streak column is affected; level and accuracy are\n' +
    '         order-free. Breaking the tie on assignmentId would make it deterministic.');
}
{
  const { L } = sandbox();
  const people = [person('s1', 'Ana')];
  const list = L.tally({ results: [] }, { people });
  L.applyLive(list, [{ studentId: 's1', name: 'Ana', points: 4500, games: 3, bestStreak: 7 }]);
  hazard('a class that only plays GeoLive is a table of ties at level 1',
    'after 3 games: started=' + list[0].started + ' level=' + list[0].level + ' live=' + list[0].live + '\n' +
    '         They count as started, and the GeoLive column fills in, but every level is 1.\n' +
    '         Levels come from `answered`/`correct`, which oy-01 has not added to live_players\n' +
    '         yet, so today a live game contributes points and a streak but no XP. The moment\n' +
    '         those columns land this fixes itself, with no change to this file. Until then a\n' +
    '         GeoLive-only class has a ranking of ties.');
}
{
  hazard('the level on this table is not the level in the student\'s own profile',
    'This file derives a level from class work only: correct answers in class quizzes and\n' +
    '         live games, at ' + (SRC.match(/XP_PER_CORRECT\s*=\s*(\d+)/) || [])[1] + ' XP each. A student\'s real level in core.js also counts\n' +
    '         everything they do alone, so the same student can read level 3 here and level 9\n' +
    '         on their own screen.\n' +
    '         Checked, and this is not oy-07 taking a shortcut: the real number cannot be had.\n' +
    '         `profiles` has SELECT policy (auth.uid() = id), so a teacher cannot read any\n' +
    '         student\'s save; class_members carries only student_id, display_name, joined_at;\n' +
    '         results carries pct/correct/total. Nothing a teacher can read contains a level.\n' +
    '         So either this stays a class level and the table says so plainly, or oy-01 adds\n' +
    '         a level column that each student writes for themselves under their own policy.');
}

/* ===================================================================== */
console.log('\n' + pass + ' requirement checks passed, ' + fail + ' failed, ' + hazards + ' hazards');
process.exit(fail ? 1 : 0);
