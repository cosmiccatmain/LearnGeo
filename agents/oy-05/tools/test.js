const fs = require('fs'), vm = require('vm'), path = require('path');
const { El } = require(path.join(__dirname, 'dom.js'));
const SRC = fs.readFileSync(process.argv[2], 'utf8');
const tick = () => new Promise(r => setImmediate(r));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '\n        ' + extra : '')); }
}

const QS = [
  { kind:'country-capital', prompt:'What is the capital of Peru?',   answer:'Lima',     options:['Sucre','Lima','Buenos Aires','Caracas'], code:'PER' },
  { kind:'country-capital', prompt:'What is the capital of Kenya?',  answer:'Nairobi',  options:['Nairobi','Kampala','Dodoma','Lusaka'],   code:'KEN' },
  { kind:'country-capital', prompt:'What is the capital of Nepal?',  answer:'Kathmandu',options:['Thimphu','Dhaka','Kathmandu','Delhi'],   code:'NPL' }
];

function raw(n) {
  const cls = n.className ? ' class="' + n.className + '"' : '';
  const dis = n.disabled ? ' disabled' : '';
  const sty = n.attrs.style ? ' style="' + n.attrs.style + '"' : '';
  const inner = (n.text || '') + n.children.map(raw).join('');
  return '<' + n.tagName.toLowerCase() + cls + dis + sty + '>' + inner + '</' + n.tagName.toLowerCase() + '>';
}

function env(opts = {}) {
  const host = new El('div');
  const docL = {};
  const document = {
    hidden: false,
    addEventListener(t, fn) { (docL[t] = docL[t] || []).push(fn); },
    removeEventListener(t, fn) { docL[t] = (docL[t] || []).filter(f => f !== fn); },
    createElement: tag => new El(tag),
    fire(t, extra) { (docL[t] || []).forEach(fn => fn(Object.assign({ type: t, preventDefault() {} }, extra || {}))); }
  };
  const calls = { join: [], watch: [], answer: [] };
  const state = { onChange: null };
  const cloud = { signedIn: !opts.signedOut, user: opts.signedOut ? null : { id: 'u1' } };
  const win = {};
  Object.assign(win, {
    window: win, document, console,
    setInterval, clearInterval, setTimeout, clearTimeout, Promise, Date, Math, JSON,
    addEventListener() {}, removeEventListener() {},
    Cloud: cloud,
    WW: {
      escapeHtml: s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])),
      state: { profile: { displayName: 'Owen' } },
      accountId: () => 'local-1'
    },
    GeoLive: {
      current: s => (s.questions || [])[s.index] || null,
      standings: s => s.standings || [],
      answered: s => (opts.answered === undefined ? null : opts.answered)
    },
    GeoLiveCloud: {
      join: (c, m, n) => { calls.join.push([c, m, n]); return Promise.resolve({ sessionId: 'S1', playerId: 'P1' }); },
      watch: (sid, fn) => { calls.watch.push(sid); state.onChange = fn; return Promise.resolve(() => {}); },
      answer: (...a) => {
        calls.answer.push(a);
        if (opts.answerRejects) return Promise.reject(new Error('network died'));
        return Promise.resolve(opts.answerReply === undefined ? { accepted: true, first: true } : opts.answerReply);
      },
      serverNow: () => Date.now() + (opts.clockOffset || 0),
      get clockSource() { return opts.clockSource || 'server'; }
    }
  });
  vm.runInNewContext(SRC, win);
  const api = win.GeoLiveStudent.mount(host, { code: opts.code || '' });
  return { host, win, calls, document, api, cloud,
           push: s => state.onChange && state.onChange(s),
           html: () => host.children.map(raw).join('') };
}

const timerStyle = e => { const b = e.host.querySelector('.gl-timer__bar'); return b ? (b.attrs.style || '') : null; };
const delayOf = e => { const m = /animation-delay:-([\d.]+)s/.exec(timerStyle(e) || ''); return m ? Number(m[1]) : null; };
const secsOf  = e => { const m = /--gl-secs:([\d.]+)s/.exec(timerStyle(e) || ''); return m ? Number(m[1]) : null; };

async function joinGame(e) {
  const f = e.host.querySelectorAll('.gl-join__field');
  f[0].value = 'ABCD'; f[1].value = 'Owen';
  e.host.fire('click', e.host.querySelector('[data-gl-go]'));
  await tick(); await tick();
}

(async () => {
  console.log('\n--- 1. a student who taps twice ---');
  {
    const e = env();
    await joinGame(e);
    e.push({ status: 'asking', index: 0, questions: QS, total: 3, askedAt: Date.now() });
    e.host.fire('click', e.host.querySelector('.gl-target--b'));
    const c = e.host.querySelector('.gl-target--c'); if (c) e.host.fire('click', c);
    const b = e.host.querySelector('.gl-target--b'); if (b) e.host.fire('click', b);
    await tick();
    ok('answer sent exactly once', e.calls.answer.length === 1, 'sent ' + e.calls.answer.length);
    ok('the first choice is the one that went', e.calls.answer[0] && e.calls.answer[0][3] === 'Lima');
    ok('screen shows it locked', /Locked in/.test(e.html()));
    ok('targets carry is-locked so CSS kills the taps too',
       e.host.querySelectorAll('.gl-target').every(t => t.classList.contains('is-locked')));
    ok('the picked one is marked', e.host.querySelector('.gl-target--b').classList.contains('is-picked'));
  }

  console.log('\n--- 2. a student who joins late ---');
  {
    const e = env();
    await joinGame(e);
    e.push({ status: 'asking', index: 2, questions: QS, total: 3 });
    const h = e.html();
    ok('shows the question actually running', /Nepal/.test(h));
    ok('counts it as question 3 of 3', /Question 3 of 3/.test(h));
    ok('no timer it cannot vouch for', !/gl-timer/.test(h));
    ok('says answer fast instead', /Answer fast/.test(h));
    ok('four targets are live', e.host.querySelectorAll('.gl-target').filter(b => !b.disabled).length === 4);
  }
  {
    const e = env();
    await joinGame(e);
    /* joins 6s into a 20s question, askedAt present */
    e.push({ status: 'asking', index: 1, questions: QS, total: 3, askedAt: Date.now() - 6000 });
    ok('a late joiner gets the drain wound forward, not restarted', delayOf(e) >= 5.9 && delayOf(e) <= 6.1,
       'animation-delay was -' + delayOf(e) + 's');
    ok('and the full limit as the duration', secsOf(e) === 20, 'secs ' + secsOf(e));
  }

  console.log('\n--- 3. a phone that sleeps and wakes two questions later ---');
  {
    const e = env();
    await joinGame(e);
    e.push({ status: 'asking', index: 0, questions: QS, total: 3, askedAt: Date.now() });
    e.host.fire('click', e.host.querySelector('.gl-target--b'));
    await tick();
    ok('answered question 1', /Locked in/.test(e.html()));
    const watchesBefore = e.calls.watch.length;

    e.document.hidden = true; e.document.fire('visibilitychange');
    e.document.hidden = false;
    e.push({ status: 'asking', index: 2, questions: QS, total: 3, askedAt: Date.now() - 5000 });
    e.document.fire('visibilitychange');
    await tick();

    const h = e.html();
    ok('stale lock from question 1 is gone', !/Locked in/.test(h));
    ok('stale points from question 1 are gone', !/\+812/.test(h));
    ok('shows the question that is actually running', /Nepal/.test(h));
    ok('options are tappable again', e.host.querySelectorAll('.gl-target').filter(b => !b.disabled).length === 4);
    ok('waking re-subscribed rather than trusting a dead socket', e.calls.watch.length > watchesBefore);
    ok('the drain is wound to where the question really is', delayOf(e) >= 4.9 && delayOf(e) <= 5.2,
       'animation-delay was -' + delayOf(e) + 's');
  }

  console.log('\n--- 4. points never appear unless they are real ---');
  {
    const e = env({ answerReply: { accepted: true, first: true } });
    await joinGame(e);
    e.push({ status: 'asking', index: 0, questions: QS, total: 3, askedAt: Date.now() });
    e.host.fire('click', e.host.querySelector('.gl-target--b'));
    await tick();
    e.push({ status: 'reveal', index: 0, questions: QS, total: 3 });
    const h = e.html();
    ok('accepted but unscored still gets a verdict', /Right/.test(h));
    ok('no invented points when nothing was scored yet', !/gl-verdict__points/.test(h));
    ok('never draws +0', !/\+0\b/.test(h));
  }
  {
    const e = env({ answerReply: { correct: true, points: 812, total: 812 } });
    await joinGame(e);
    e.push({ status: 'asking', index: 0, questions: QS, total: 3, askedAt: Date.now() });
    e.host.fire('click', e.host.querySelector('.gl-target--b'));
    await tick();
    e.push({ status: 'reveal', index: 0, questions: QS, total: 3, standings: [{ id: 'P1', name: 'Owen', score: 812 }] });
    const h = e.html();
    ok('shows the real points the server gave', /\+812/.test(h));
    ok('marks the verdict right', /gl-verdict--right/.test(h));
    ok('shows where they stand', /1st/.test(h) && /812/.test(h));
    ok('rank goes on as a class CSS can actually branch on',
       e.host.querySelector('.gl-place').classList.contains('is-first'),
       e.host.querySelector('.gl-place').className);
    ok('and no custom property is emitted into the markup', !/--gl-i/.test(h));
  }

  console.log('\n--- 5. an answer that never left the phone ---');
  {
    const e = env({ answerRejects: true });
    await joinGame(e);
    e.push({ status: 'asking', index: 0, questions: QS, total: 3, askedAt: Date.now() });
    e.host.fire('click', e.host.querySelector('.gl-target--b'));
    await tick(); await tick();
    ok('hands the question back', e.host.querySelectorAll('.gl-target').filter(b => !b.disabled).length === 4);
    ok('says so in plain words', /did not send/.test(e.html()));
    e.host.fire('click', e.host.querySelector('.gl-target--b'));
    await tick();
    ok('and lets them try again', e.calls.answer.length === 2);
  }

  console.log('\n--- 6. the end of the game ---');
  {
    const e = env();
    await joinGame(e);
    e.push({ status: 'ended', index: 2, questions: QS, total: 3,
             standings: [{ id: 'X', name: 'Ada', score: 2400 }, { id: 'P1', name: 'Owen', score: 1900 }, { id: 'Y', name: 'Sam', score: 1900 }] });
    const h = e.html();
    ok('tells them where they finished', /You finished/.test(h) && /2nd/.test(h));
    ok('ties share a place', /2nd/.test(h));
    ok('podium uses oy-06 rank classes', /is-first/.test(h) && /is-second/.test(h) && /is-third/.test(h));
    ok('podium marks which row is theirs', /is-me/.test(h));
  }

  console.log('\n--- 7. a signed-out student ---');
  {
    const e = env({ signedOut: true });
    const h = e.html();
    ok('is told to sign in, not offered a guest path', /Sign in to play/.test(h));
    ok('no join field at all', !/gl-join__field/.test(h));
    ok('no mention of guests', !/guest/i.test(h));
    /* they sign in elsewhere and come back to the tab */
    e.cloud.signedIn = true; e.cloud.user = { id: 'u9' };
    e.document.fire('visibilitychange');
    ok('coming back signed in opens the join screen', /gl-join__field/.test(e.html()));
  }

  console.log('\n--- 8. a tap that arrives after time is up ---');
  {
    const e = env();
    await joinGame(e);
    e.push({ status: 'asking', index: 0, questions: QS, total: 3, askedAt: Date.now() - 25000, limitMs: 20000 });
    e.host.fire('click', e.host.querySelector('.gl-target--b'));
    await tick();
    ok('nothing is sent to be refused', e.calls.answer.length === 0);
    ok('says why in plain words', /Time was up/.test(e.html()));
  }

  console.log('\n--- 9. keyboard, 1 to 4 and A to D ---');
  {
    const e = env();
    await joinGame(e);
    e.push({ status: 'asking', index: 0, questions: QS, total: 3, askedAt: Date.now() });
    e.document.fire('keydown', { key: '2' });
    await tick();
    ok('pressing 2 answers the second option', e.calls.answer.length === 1 && e.calls.answer[0][3] === 'Lima');
    e.document.fire('keydown', { key: '3' });
    await tick();
    ok('a second key press is ignored like a second tap', e.calls.answer.length === 1);
  }
  {
    const e = env();
    await joinGame(e);
    e.push({ status: 'asking', index: 1, questions: QS, total: 3, askedAt: Date.now() });
    e.document.fire('keydown', { key: 'a' });
    await tick();
    ok('pressing A answers the first option', e.calls.answer.length === 1 && e.calls.answer[0][3] === 'Nairobi');
    ok('the choice sent is the option text, not the position', typeof e.calls.answer[0][3] === 'string');
  }

  console.log('\n--- 10. the database spellings ---');
  {
    const e = env();
    await joinGame(e);
    e.push({ status: 'asking', question_index: 1, questions: QS, total: 3,
             time_limit_ms: 10000, asked_at: new Date(Date.now() - 4000).toISOString() });
    const h = e.html();
    ok('reads question_index', /Kenya/.test(h) && /Question 2 of 3/.test(h));
    ok('reads time_limit_ms, so a teacher changing it is honoured', secsOf(e) === 10, 'secs ' + secsOf(e));
    ok('reads asked_at as the question start', delayOf(e) >= 3.9 && delayOf(e) <= 4.1, 'delay -' + delayOf(e));
  }
  {
    /* updated_at was the old proxy and is deliberately gone: any other
       write to the row would have jumped every student's countdown */
    const e = env();
    await joinGame(e);
    e.push({ status: 'asking', question_index: 1, questions: QS, total: 3,
             time_limit_ms: 10000, updated_at: new Date(Date.now() - 4000).toISOString() });
    ok('updated_at alone no longer starts a countdown', !/gl-timer/.test(e.html()));
    ok('and it says answer fast instead', /Answer fast/.test(e.html()));
  }

  console.log('\n--- 11. how many have answered ---');
  {
    const e = env({ answered: 4 });
    await joinGame(e);
    e.push({ status: 'asking', index: 0, questions: QS, total: 3, askedAt: Date.now(),
             players: new Array(12).fill(0).map((_, i) => ({ id: 'p' + i })) });
    e.host.fire('click', e.host.querySelector('.gl-target--b'));
    await tick();
    ok('uses GeoLive.answered rather than session.answers', /4 of 12 have answered/.test(e.html()));
  }

  console.log('\n--- 12. the container is oy-06 shaped ---');
  {
    const e = env();
    ok('mount adds gl', e.host.classList.contains('gl'));
    ok('mount adds gl--student', e.host.classList.contains('gl--student'));
    ok('data-phase is on the container', e.host.getAttribute('data-phase') === 'join');
    await joinGame(e);
    e.push({ status: 'asking', index: 0, questions: QS, total: 3, askedAt: Date.now() });
    ok('data-phase follows the game', e.host.getAttribute('data-phase') === 'asking');
    ok('targets are a direct child, so flex:1 fills the phone',
       e.host.children.some(c => c.classList.contains('gl-targets')),
       'children: ' + e.host.children.map(c => c.className).join(' | '));
    ok('no stray wrapper around the stage', !/gl__card/.test(e.html()));
    e.api.destroy();
    ok('destroy takes the classes back off', !e.host.classList.contains('gl'));
  }

  console.log('\n--- 13. points when the student is not allowed to score themselves ---');
  {
    const e = env({ answerReply: { accepted: true, first: true } });
    await joinGame(e);
    e.push({ status: 'asking', index: 1, questions: QS, total: 3, askedAt: Date.now(),
             standings: [{ id: 'P1', name: 'Owen', score: 600 }] });
    e.host.fire('click', e.host.querySelector('.gl-target--a'));
    await tick();
    e.push({ status: 'reveal', index: 1, questions: QS, total: 3,
             standings: [{ id: 'P1', name: 'Owen', score: 1487 }] });
    ok('points come from what the total actually moved by', /\+887/.test(e.html()));
  }
  {
    const e = env({ answerReply: { accepted: true, first: true } });
    await joinGame(e);
    e.push({ status: 'asking', index: 1, questions: QS, total: 3, askedAt: Date.now(),
             standings: [{ id: 'P1', name: 'Owen', score: 600 }] });
    e.host.fire('click', e.host.querySelector('.gl-target--b'));
    await tick();
    e.push({ status: 'reveal', index: 1, questions: QS, total: 3,
             standings: [{ id: 'P1', name: 'Owen', score: 600 }] });
    const h = e.html();
    ok('a wrong answer shows no points at all', !/gl-verdict__points/.test(h));
    ok('marks the verdict wrong', /gl-verdict--wrong/.test(h));
    ok('and tells them what it was', /It was Nairobi/.test(h));
    ok('the right target is marked on the reveal', e.host.querySelector('.gl-target--a').classList.contains('is-right'));
    ok('and theirs is marked wrong', e.host.querySelector('.gl-target--b').classList.contains('is-wrong'));
  }

  console.log('\n--- 14. one set of listeners, not one per render ---');
  {
    const e = env();
    await joinGame(e);
    for (let i = 0; i < 5; i++) e.push({ status: 'asking', index: 0, questions: QS, total: 3, askedAt: Date.now() });
    e.host.fire('click', e.host.querySelector('.gl-target--b'));
    await tick();
    ok('five renders still send exactly one answer', e.calls.answer.length === 1);
  }


  console.log('\n--- 15. a refusal is not a verdict ---');
  {
    const e = env({ answerReply: null });            /* null = refused */
    await joinGame(e);
    e.push({ status: 'asking', index: 0, questions: QS, total: 3, askedAt: Date.now() });
    e.host.fire('click', e.host.querySelector('.gl-target--b'));   /* Lima, the right one */
    await tick();
    ok('the locked line says it did not count', /did not count/.test(e.html()));
    e.push({ status: 'reveal', index: 0, questions: QS, total: 3,
             standings: [{ id: 'P1', name: 'Owen', score: 0 }] });
    const h = e.html();
    ok('never claims Right for an answer that was refused', !/>Right</.test(h), h.slice(0, 200));
    ok('says plainly that it did not count', /That one did not count/.test(h));
    ok('explains why', /moved on/.test(h));
    ok('claims no points', !/gl-verdict__points/.test(h));
    ok('their target is not marked wrong either',
       !e.host.querySelector('.gl-target--b').classList.contains('is-wrong'));
    ok('the right answer is still shown', e.host.querySelector('.gl-target--b').classList.contains('is-right'));
  }

  console.log('\n--- 16. msLeft is preferred over working it out again ---');
  {
    const e = env();
    await joinGame(e);
    /* oy-03's real snapshot shape: no askedAt needed, msLeft plus at */
    e.push({ status: 'asking', index: 0, questions: QS, timeLimitMs: 20000,
             msLeft: 12000, at: Date.now(), players: [], answers: [] });
    ok('drain wound to 8s gone of 20s', delayOf(e) >= 7.9 && delayOf(e) <= 8.1, 'delay -' + delayOf(e));
    ok('duration from timeLimitMs', secsOf(e) === 20, 'secs ' + secsOf(e));
  }
  {
    const e = env();
    await joinGame(e);
    e.push({ status: 'asking', index: 0, questions: QS, timeLimitMs: 20000,
             msLeft: 0, at: Date.now(), players: [], answers: [] });
    e.host.fire('click', e.host.querySelector('.gl-target--b'));
    await tick();
    ok('msLeft of 0 is no time left, not no countdown', e.calls.answer.length === 0, 'sent ' + e.calls.answer.length);
    ok('and says time was up', /Time was up/.test(e.html()));
  }

  console.log('\n--- 17. a phone whose own clock is wrong ---');
  {
    /* the phone is 30s behind the server; asked_at is a server stamp */
    const e = env({ clockOffset: 30000 });
    await joinGame(e);
    const serverAskedAt = Date.now() + 30000 - 5000;   /* opened 5s ago, server time */
    e.push({ status: 'asking', index: 0, questions: QS, timeLimitMs: 20000,
             askedAt: new Date(serverAskedAt).toISOString() });
    ok('measured against the corrected clock, so 5s gone not 35s',
       delayOf(e) >= 4.8 && delayOf(e) <= 5.2, 'delay -' + delayOf(e));
  }


  console.log('\n--- 18. they had already answered (first:false) ---');
  {
    /* the send looks like it failed, so they tap something else, but the
       first one had actually landed */
    const e = env({ answerReply: { accepted: true, first: false,
                                   row: { choice: 'Lima', correct: true, points: 940 } } });
    await joinGame(e);
    e.push({ status: 'asking', index: 0, questions: QS, total: 3, askedAt: Date.now() });
    e.host.fire('click', e.host.querySelector('.gl-target--c'));   /* Buenos Aires, the second tap */
    await tick();
    ok('the screen switches to the answer that counted',
       e.host.querySelector('.gl-target--b').classList.contains('is-picked'),
       'picked: ' + e.host.querySelectorAll('.gl-target').filter(t => t.classList.contains('is-picked')).map(t => t.className).join());
    ok('and stops showing the tap that did not', !e.host.querySelector('.gl-target--c').classList.contains('is-picked'));
    e.push({ status: 'reveal', index: 0, questions: QS, total: 3 });
    const h = e.html();
    ok('verdict follows the row that counted', /gl-verdict--right/.test(h));
    ok('points come off that row', /\+940/.test(h));
  }

  console.log('\n--- 19. the first countdown of the game, before any server stamp ---');
  {
    const e = env({ clockSource: 'device' });
    await joinGame(e);
    /* joined mid question, msLeft present but only as good as this phone */
    e.push({ status: 'asking', index: 1, questions: QS, timeLimitMs: 20000,
             msLeft: 104597, at: Date.now() });
    ok('an untrusted clock shows no countdown rather than a wrong one', !/gl-timer/.test(e.html()));
    ok('says answer fast instead', /Answer fast/.test(e.html()));
    e.host.fire('click', e.host.querySelector('.gl-target--a'));
    await tick();
    ok('and an untrusted clock never blocks a tap', e.calls.answer.length === 1);
  }
  {
    const e = env({ clockSource: 'device' });
    await joinGame(e);
    /* but a question we watched start is timed locally, which is fine */
    e.push({ status: 'asking', index: 0, questions: QS, timeLimitMs: 20000, at: Date.now() });
    e.push({ status: 'asking', index: 1, questions: QS, timeLimitMs: 20000, at: Date.now() });
    ok('a question we watched open still counts down', /gl-timer/.test(e.html()));
    ok('from the full limit', secsOf(e) === 20, 'secs ' + secsOf(e));
  }
  {
    const e = env({ clockSource: 'server' });
    await joinGame(e);
    e.push({ status: 'asking', index: 1, questions: QS, timeLimitMs: 20000,
             msLeft: 12000, at: Date.now() });
    ok('once the offset is real, a late joiner gets the countdown', /gl-timer/.test(e.html()));
    ok('wound to the right place', delayOf(e) >= 7.9 && delayOf(e) <= 8.1, 'delay -' + delayOf(e));
  }

  console.log('\n--- 20. an error a student can actually see ---');
  {
    const e = env();
    e.host.querySelectorAll('.gl-join__field')[0].value = 'AB';
    e.host.fire('click', e.host.querySelector('[data-gl-go]'));
    await tick();
    const p = e.host.querySelector('.gl-alert');
    ok('the join error carries a real alert class', !!p);
    ok('and keeps role=alert', p && p.getAttribute('role') === 'alert');
    ok('and is no longer muted grey', p && !p.classList.contains('t-muted'));
  }

  console.log('\n' + (fail === 0 ? 'ALL PASS' : fail + ' FAILED') + '  (' + pass + ' passed)');
  process.exit(fail ? 1 : 0);
})();
