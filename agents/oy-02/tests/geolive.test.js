/* Tests for assets/js/geolive.js. Not part of the site: this file is for
   running by hand, and must not be moved to the top of the repo.

     node agents/oy-02/tests/geolive.test.js

   It finds geolive.js whether it is still in the agent folder or has been
   merged to assets/js/, so it keeps working after the Organizer moves it.
   Exits non-zero if anything fails. */

const fs = require('fs');
const path = require('path');

const candidates = [
  path.join(__dirname, '..', 'assets', 'js', 'geolive.js'),
  path.join(__dirname, '..', '..', '..', 'assets', 'js', 'geolive.js'),
  path.join(process.cwd(), 'assets', 'js', 'geolive.js')
];
const found = candidates.find(p => fs.existsSync(p));
if (!found) {
  console.error('Could not find geolive.js. Looked in:\n  ' + candidates.join('\n  '));
  process.exit(2);
}
console.log('testing ' + found);

const window = {};
eval(fs.readFileSync(found, 'utf8'));
const G = window.GeoLive;

let pass = 0, fail = 0;
const is = (label, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { pass++; console.log('  ok   ' + label); }
  else { fail++; console.log('  FAIL ' + label + '\n         got  ' + a + '\n         want ' + b); }
};

const Q = (answer, options, prompt) => ({ kind: 'country-capital', prompt, answer, options, code: 'XXX' });
const questions = [
  Q('Lima', ['Sucre', 'Lima', 'Buenos Aires', 'Caracas'], 'Capital of Peru?'),
  Q('Oslo', ['Oslo', 'Bergen', 'Malmo', 'Turku'], 'Capital of Norway?'),
  Q('Cairo', ['Tunis', 'Rabat', 'Cairo', 'Amman'], 'Capital of Egypt?')
];
const players = [{ id: 'a', name: 'Ana' }, { id: 'b', name: 'Ben' }, { id: 'c', name: 'Cy' }];
const fresh = () => G.start(G.create({ questions: JSON.parse(JSON.stringify(questions)), players, limitMs: 20000 }));

console.log('\nSCORING');
{
  const s = fresh();
  is('instant correct answer = 600 + full 400 bonus', G.answer(s, 'a', 'Lima', 0).points, 1000);
  is('half the time left = 600 + 200', G.answer(s, 'b', 'Lima', 10000).points, 800);
  is('wrong answer scores 0', G.answer(s, 'c', 'Sucre', 1000).points, 0);
  is('running total comes back', G.answer(s, 'a', 'Lima', 0), { correct: true, points: 1000, total: 1000 });
}
{
  const s = fresh();
  is('answering at the buzzer still gets the base 600', G.answer(s, 'a', 'Lima', 20000).points, 600);
  is('answering late is clamped, not negative', G.answer(s, 'b', 'Lima', 999999).points, 600);
  is('a nonsense time counts as using the whole limit', G.answer(s, 'c', 'Lima', undefined).points, 600);
}
{
  const s = G.start(G.create({ questions, players, limitMs: 7000 }));
  is('bonus scales to a custom limit', G.answer(s, 'a', 'Lima', 3500).points, 800);
}
{
  const s = fresh();
  is('picking by position works too', G.answer(s, 'a', 1, 0).points, 1000);
  is('an option that does not exist is just wrong', G.answer(s, 'b', 'Atlantis', 0).points, 0);
}

console.log('\nANSWERING TWICE');
{
  const s = fresh();
  const first = G.answer(s, 'a', 'Lima', 0);
  const second = G.answer(s, 'a', 'Sucre', 100);
  is('first answer stands', second, { correct: true, points: 1000, total: 1000 });
  is('score is not added twice', s.players[0].score, 1000);
  is('the stored choice is still the first one', s.answers[0]['a'].choice, 'Lima');
  is('a second wrong answer cannot break the streak', s.players[0].streak, 1);
  is('first reply and repeat reply match', first, second);
}

console.log('\nEDGE CASE 1: a player who never answers');
{
  const s = fresh();
  G.answer(s, 'a', 'Lima', 0);
  G.answer(s, 'b', 'Lima', 0);
  G.reveal(s); G.next(s);
  G.answer(s, 'a', 'Oslo', 0);
  G.reveal(s); G.next(s);
  G.answer(s, 'a', 'Cairo', 0);
  G.reveal(s); G.next(s);
  is('game ends', s.status, 'ended');
  const table = G.standings(s);
  is('the silent player is still on the board', table.map(p => p.id), ['a', 'b', 'c']);
  is('with a score of zero', table[2], { id: 'c', name: 'Cy', score: 0, streak: 0 });
  is('never answering leaves no streak', s.players[2].streak, 0);
  is('a player who stops answering loses their streak', s.players[1].streak, 0);
  is('but keeps the points they earned', s.players[1].score, 1000);
}

console.log('\nEDGE CASE 2: everyone gets it wrong');
{
  const s = fresh();
  G.answer(s, 'a', 'Sucre', 1000);
  G.answer(s, 'b', 'Caracas', 2000);
  G.answer(s, 'c', 'Sucre', 3000);
  const r = G.reveal(s);
  is('the right answer is still reported', r.answer, 'Lima');
  is('counts cover every option, including the unpicked ones', r.counts, { Sucre: 2, Lima: 0, 'Buenos Aires': 0, Caracas: 1 });
  is('nobody scores', G.standings(s).map(p => p.score), [0, 0, 0]);
  is('all streaks are zero', s.players.map(p => p.streak), [0, 0, 0]);
  is('the game carries on', G.next(s).status, 'asking');
}

console.log('\nEDGE CASE 3: two players tied on points');
{
  const s = fresh();
  G.answer(s, 'a', 'Lima', 5000);
  G.answer(s, 'b', 'Lima', 5000);
  G.reveal(s); G.next(s);
  const first = G.standings(s);
  const second = G.standings(s);
  is('tied players are ordered by who joined first', first.map(p => p.id), ['a', 'b', 'c']);
  is('the order does not change between renders', first, second);
  is('or on a third render', G.standings(s), first);
}
{
  const s = fresh();
  G.answer(s, 'a', 'Lima', 8000);
  G.answer(s, 'b', 'Lima', 2000);
  G.reveal(s); G.next(s);
  G.answer(s, 'a', 'Oslo', 2000);
  G.answer(s, 'b', 'Bergen', 100);
  G.reveal(s); G.next(s);
  const t = G.standings(s);
  is('more points wins', t[0].id, 'a');
  is('streak shown is the current one', t.map(p => p.streak), [2, 0, 0]);
}
{
  const s = fresh();
  G.answer(s, 'a', 'Lima', 10000);
  G.answer(s, 'b', 'Lima', 10000);
  G.reveal(s); G.next(s);
  G.answer(s, 'b', 'Oslo', 0);
  G.answer(s, 'a', 'Oslo', 0);
  G.reveal(s); G.next(s);
  is('an exact tie falls back to join order', G.standings(s).map(p => p.id), ['a', 'b', 'c']);
}

console.log('\nFLOW AND GUARDS');
{
  const s = G.create({ questions, players });
  is('a new session sits in the lobby', s.status, 'lobby');
  is('no answers before it starts', G.answer(s, 'a', 'Lima', 0), null);
  G.start(s);
  is('starting asks the first question', [s.status, s.index], ['asking', 0]);
  is('current returns the live question', G.current(s).answer, 'Lima');
  G.reveal(s);
  is('answers stop once the question is revealed', G.answer(s, 'c', 'Lima', 0), null);
  G.next(s); G.next(s); G.next(s);
  is('the game ends after the last question', s.status, 'ended');
  is('current is null when it is over', G.current(s), null);
  is('answers are refused after the end', G.answer(s, 'a', 'Cairo', 0), null);
  is('standings still work when it is over', G.standings(s).length, 3);
}
{
  const s = fresh();
  is('an unknown player is refused', G.answer(s, 'zzz', 'Lima', 0), null);
  is('and is not added to the game', s.players.length, 3);
}
{
  const s = G.start(G.create({ questions: [], players }));
  is('a game with no questions ends immediately', s.status, 'ended');
  is('current is null', G.current(s), null);
  is('reveal is harmless', G.reveal(s), { answer: null, counts: {} });
  is('standings still lists everyone', G.standings(s).map(p => p.score), [0, 0, 0]);
}
{
  const s = G.start(G.create({ questions, players: [] }));
  is('a game with no players still runs', s.status, 'asking');
  is('and has an empty board', G.standings(s), []);
}
{
  const s = fresh();
  G.answer(s, 'a', 'Lima', 0);
  is('revealing twice gives the same counts', G.reveal(s), G.reveal(s));
  is('and does not punish the streak twice', s.players[0].streak, 1);
  is('skipping the reveal still closes the question', (() => {
    const t = fresh();
    G.answer(t, 'a', 'Lima', 0);
    G.next(t);
    return [t.players[1].streak, t.closed[0]];
  })(), [0, true]);
}

console.log('\nANSWERED COUNT');
{
  const s = fresh();
  is('nobody has answered yet', G.answered(s), 0);
  G.answer(s, 'a', 'Lima', 0);
  is('counts one', G.answered(s), 1);
  G.answer(s, 'a', 'Sucre', 10);
  is('a repeat answer from the same player does not count twice', G.answered(s), 1);
  G.answer(s, 'b', 'Sucre', 20);
  is('a wrong answer still counts as answered', G.answered(s), 2);
  G.answer(s, 'zzz', 'Lima', 30);
  is('an unknown player is not counted', G.answered(s), 2);
  is('it matches the roster size when everyone is in', (G.answer(s, 'c', 'Lima', 40), G.answered(s)), s.players.length);
  G.reveal(s); G.next(s);
  is('the next question starts from zero again', G.answered(s), 0);
}
{
  const s = G.create({ questions, players });
  is('zero before the game starts', G.answered(s), 0);
  const empty = G.start(G.create({ questions: [], players }));
  is('zero when there are no questions at all', G.answered(empty), 0);
}

console.log('\nSCORING A RECORDED ANSWER (the reveal race)');
{
  // the point of this helper: it must agree with a live tap, always
  const cases = [
    ['Lima', 0], ['Lima', 1], ['Lima', 9999], ['Lima', 20000], ['Lima', 999999],
    ['Sucre', 0], ['Sucre', 12345], ['Lima', undefined], ['Atlantis', 500], [1, 250], [0, 250]
  ];
  let same = true;
  cases.forEach(([choice, ms]) => {
    const live = G.answer(fresh(), 'a', choice, ms);
    const recorded = G.scoreRecorded(fresh(), 0, choice, ms);
    if (live.correct !== recorded.correct || live.points !== recorded.points) {
      same = false;
      console.log('    mismatch for ' + JSON.stringify([choice, ms]) + ': live ' + JSON.stringify(live) + ' vs recorded ' + JSON.stringify(recorded));
    }
  });
  is('scores identically to a live answer, across ' + cases.length + ' cases', same, true);
}
{
  const s = fresh();
  G.answer(s, 'a', 'Lima', 0);
  G.reveal(s);
  is('a live tap is still refused once the question closed', G.answer(s, 'b', 'Lima', 19000), null);
  is('but the straggler can still be scored from its stored row', G.scoreRecorded(s, 0, 'Lima', 19000), { correct: true, points: 620 });
  G.next(s); G.next(s); G.next(s);
  is('game is over', s.status, 'ended');
  is('and it still scores after the game ended', G.scoreRecorded(s, 0, 'Lima', 0), { correct: true, points: 1000 });
}
{
  const s = fresh();
  is('scores a question that is not the current one', G.scoreRecorded(s, 2, 'Cairo', 0), { correct: true, points: 1000 });
  is('wrong answer on another question', G.scoreRecorded(s, 1, 'Bergen', 0), { correct: false, points: 0 });
  is('no such question, low', G.scoreRecorded(s, -1, 'Lima', 0), null);
  is('no such question, high', G.scoreRecorded(s, 99, 'Lima', 0), null);
}
{
  const s = fresh();
  G.answer(s, 'a', 'Lima', 3000);
  const before = JSON.stringify(s);
  G.scoreRecorded(s, 0, 'Lima', 0);
  G.scoreRecorded(s, 1, 'Oslo', 0);
  G.scoreRecorded(s, 0, 'Sucre', 0);
  is('it changes nothing at all in the session', JSON.stringify(s), before);
  is('no score was added to anyone', G.standings(s)[0].score, 940);
}

console.log('\nAPPLYING A RECORDED ANSWER (closing the race)');
{
  // the exact trace: answer lands legally, question closes, host reconciles
  const s = fresh();
  G.answer(s, 'b', 'Lima', 1000);
  G.reveal(s);                                   // Ana's answer is in the database but not here
  is('the straggler is not counted yet', G.standings(s).find(p => p.id === 'a').score, 0);
  const r = G.applyRecorded(s, 0, 'a', 'Lima', 1000);
  is('applying it reports the score', { correct: r.correct, points: r.points, applied: r.applied }, { correct: true, points: 980, applied: true });
  is('the aggregate now agrees with the stored row', G.standings(s).find(p => p.id === 'a').score, 980);
  is('and the per-question detail holds the same points', s.answers[0]['a'].points, 980);
  is('scoreRecorded agreed on the number all along', G.scoreRecorded(s, 0, 'Lima', 1000).points, 980);
  is('the answered count sees it too', G.answered(s), 2);
}
{
  const s = fresh();
  G.reveal(s);
  G.applyRecorded(s, 0, 'a', 'Lima', 500);
  const after = JSON.stringify(s);
  const second = G.applyRecorded(s, 0, 'a', 'Lima', 500);
  const third = G.applyRecorded(s, 0, 'a', 'Sucre', 9999);
  is('a repeat call says it applied nothing', second.applied, false);
  is('and reports the score already stored', second.points, 990);
  is('even when the repeat carries different values', { correct: third.correct, points: third.points, applied: third.applied }, { correct: true, points: 990, applied: false });
  is('the session is untouched by the repeats', JSON.stringify(s), after);
  is('so the score was counted exactly once', G.standings(s).find(p => p.id === 'a').score, 990);
}
{
  const s = fresh();
  G.answer(s, 'a', 'Lima', 0);
  const r = G.applyRecorded(s, 0, 'a', 'Sucre', 50);
  is('an answer given live is never overwritten', { points: r.points, applied: r.applied }, { points: 1000, applied: false });
  is('the live choice stands', s.answers[0]['a'].choice, 'Lima');
}
{
  const s = fresh();
  is('unknown player', G.applyRecorded(s, 0, 'zzz', 'Lima', 0), null);
  is('no such question', G.applyRecorded(s, 9, 'a', 'Lima', 0), null);
  is('nothing was added', G.answered(s), 0);
}
{
  // a late answer sits behind a question that already closed, so streaks rebuild
  const s = fresh();
  G.answer(s, 'a', 'Lima', 0);
  G.reveal(s); G.next(s);
  G.answer(s, 'b', 'Oslo', 0);
  G.reveal(s);                                   // Ana missed question 2, streak broken
  is('the miss broke the streak', s.players[0].streak, 0);
  G.applyRecorded(s, 1, 'a', 'Oslo', 5000);
  is('the straggler restores the run of two', s.players[0].streak, 2);
  is('without disturbing anyone else', s.players[1].streak, 1);
  is('and the silent player still has none', s.players[2].streak, 0);
}
{
  const s = fresh();
  G.answer(s, 'a', 'Lima', 0);
  G.reveal(s); G.next(s);
  G.reveal(s);
  const r = G.applyRecorded(s, 1, 'a', 'Bergen', 100);
  is('a wrong straggler still applies', r.applied, true);
  is('for no points', r.points, 0);
  is('and it breaks the streak, as a wrong answer should', s.players[0].streak, 0);
}
{
  // when the straggler is folded in must not change where anyone ends up
  const early = () => {
    const s = fresh();
    G.answer(s, 'b', 'Lima', 2000);
    G.reveal(s);
    G.applyRecorded(s, 0, 'a', 'Lima', 1500);    // reconciled straight away
    G.next(s);
    G.answer(s, 'a', 'Oslo', 1000);
    G.reveal(s); G.next(s); G.next(s);
    return [G.standings(s), s.players.map(p => p.streak)];
  };
  const late = () => {
    const s = fresh();
    G.answer(s, 'b', 'Lima', 2000);
    G.reveal(s);
    G.next(s);
    G.answer(s, 'a', 'Oslo', 1000);
    G.reveal(s); G.next(s); G.next(s);
    G.applyRecorded(s, 0, 'a', 'Lima', 1500);    // reconciled at the very end
    return [G.standings(s), s.players.map(p => p.streak)];
  };
  is('it does not matter when the straggler is folded in', late(), early());
}
{
  // tie-break fields have to move too, or the board sorts on stale numbers
  const s = fresh();
  G.answer(s, 'b', 'Lima', 10000);
  G.reveal(s);
  G.applyRecorded(s, 0, 'a', 'Lima', 10000);
  is('same points and same speed falls back to join order', G.standings(s).map(p => p.id), ['a', 'b', 'c']);
  is('the correct count moved', s.players[0].correct, 1);
  is('the answer time moved', s.players[0].totalMs, 10000);
}

console.log('\nA PLAYER WHO JOINS LATE');
{
  const s = G.create({ questions, players });
  const r = G.addPlayer(s, { id: 'd', name: 'Dee' });
  is('joining in the lobby seats them', { id: r.id, score: r.score, added: r.added, joinedAt: r.joinedAt }, { id: 'd', score: 0, added: true, joinedAt: 0 });
  is('they get the next seat', r.seat, 3);
  is('and appear on the board at zero', G.standings(s).find(p => p.id === 'd'), { id: 'd', name: 'Dee', score: 0, streak: 0 });
}
{
  // the failure this fixes: joining mid-game and having every answer refused
  const s = fresh();
  G.answer(s, 'a', 'Lima', 0);
  G.reveal(s); G.next(s);                        // question 2 is live
  const r = G.addPlayer(s, { id: 'd', name: 'Dee' });
  is('they can join mid-game', r.added, true);
  is('recorded as arriving on question 2', r.joinedAt, 1);
  const ans = G.answer(s, 'd', 'Oslo', 0);
  is('and their answer counts immediately', ans, { correct: true, points: 1000, total: 1000 });
  is('the answered count includes them', G.answered(s), 1);
  G.reveal(s);
  is('a straggler row from them applies too', G.applyRecorded(s, 1, 'c', 'Oslo', 100).applied, true);
}
{
  // absent from what closed before they arrived, not zeros
  const s = fresh();
  G.answer(s, 'a', 'Lima', 0);
  G.reveal(s); G.next(s);
  G.addPlayer(s, { id: 'd', name: 'Dee' });
  is('no record was invented for the question they missed', s.answers[0]['d'], undefined);
  G.answer(s, 'd', 'Oslo', 0);
  G.reveal(s); G.next(s);
  G.answer(s, 'd', 'Cairo', 0);
  G.reveal(s);
  is('their streak counts only what they were there for', s.players.find(p => p.id === 'd').streak, 2);
  is('an original player who missed one still breaks', s.players[0].streak, 0);
}
{
  // a reconnect must never wipe a score
  const s = fresh();
  G.addPlayer(s, { id: 'd', name: 'Dee' });
  G.answer(s, 'd', 'Lima', 0);
  const again = G.addPlayer(s, { id: 'd', name: 'Dee' });
  is('joining twice does not seat them twice', s.players.length, 4);
  is('and says so', again.added, false);
  is('their score survives the rejoin', again.score, 1000);
  is('their seat does not move', again.seat, 3);
  const renamed = G.addPlayer(s, { id: 'd', name: 'Dee W' });
  is('a reconnect can correct the name', renamed.name, 'Dee W');
  is('without touching the score', s.players.find(p => p.id === 'd').score, 1000);
}
{
  const s = fresh();
  G.next(s); G.next(s); G.next(s);
  is('the game is over', s.status, 'ended');
  is('joining after the end is refused', G.addPlayer(s, { id: 'd', name: 'Dee' }), null);
  is('so nobody appears on the podium who never played', s.players.length, 3);
}
{
  const s = fresh();
  is('no id is refused', G.addPlayer(s, { name: 'Nameless' }), null);
  is('empty id is refused', G.addPlayer(s, { id: '', name: 'Nameless' }), null);
  is('nothing at all is refused', G.addPlayer(s), null);
  is('nobody was seated', s.players.length, 3);
}
{
  // seats must stay unique, or the tie-break stops being a total order
  const s = fresh();
  G.addPlayer(s, { id: 'd', name: 'Dee' });
  G.addPlayer(s, { id: 'e', name: 'Eli' });
  is('seats are unique', new Set(s.players.map(p => p.seat)).size, s.players.length);
  G.answer(s, 'd', 'Lima', 5000);
  G.answer(s, 'e', 'Lima', 5000);
  G.reveal(s);
  const board = G.standings(s);
  is('late joiners tied with each other keep join order', board.slice(0, 2).map(p => p.id), ['d', 'e']);
  is('and the whole board is still a total order', new Set(board.map(p => p.id)).size, 5);
}

console.log('\nAN EMPTY ROOM, ALL THE WAY THROUGH (round 4: the normal case)');
{
  // a teacher opens the room and puts the code on the board. Nobody is in yet.
  const s = G.create({ questions });
  is('a room with no roster at all is created', [s.status, s.players.length], ['lobby', 0]);
  is('and starts', G.start(s).status, 'asking');
  is('with a live question', G.current(s).answer, 'Lima');
  is('nobody has answered', G.answered(s), 0);
  is('the board is empty rather than broken', G.standings(s), []);
  is('a tap from someone not in the room is refused, not a crash', G.answer(s, 'ghost', 'Lima', 0), null);
  const r = G.reveal(s);
  is('the reveal still shows the answer', r.answer, 'Lima');
  is('with every option on zero', r.counts, { Sucre: 0, Lima: 0, 'Buenos Aires': 0, Caracas: 0 });
  is('revealing an empty room twice is the same', G.reveal(s), r);
  is('it moves on', G.next(s).status, 'asking');
  G.next(s); G.next(s);
  is('and ends like any other game', s.status, 'ended');
  is('with an empty board, still not broken', G.standings(s), []);
  is('and no live question', G.current(s), null);
}
{
  const s = G.start(G.create({ questions, players: [] }));
  is('an explicitly empty roster behaves the same', [s.status, G.standings(s).length, G.answered(s)], ['asking', 0, 0]);
}

console.log('\nTHE ROOM FILLS UP AFTER IT STARTED');
{
  const s = G.start(G.create({ questions, players: [] }));   // empty at the buzzer
  const ana = G.addPlayer(s, { id: 'a', name: 'Ana' });
  is('the first student walks in during question 1', [ana.added, ana.joinedAt], [true, 0]);
  is('and can answer straight away', G.answer(s, 'a', 'Lima', 2000).points, 960);
  is('the answered count sees one of one', G.answered(s), 1);
  const r1 = G.reveal(s);
  is('the reveal counts only the people who were there', r1.counts.Lima, 1);
  G.next(s);

  const ben = G.addPlayer(s, { id: 'b', name: 'Ben' });
  is('a second student arrives at question 2', ben.joinedAt, 1);
  is('the new arrival starts on zero', ben.score, 0);
  is('and sits below the student who has been playing', G.standings(s).map(p => p.id), ['a', 'b']);
  G.answer(s, 'b', 'Oslo', 0);
  G.answer(s, 'a', 'Bergen', 0);
  is('a late joiner can overtake on merit', G.standings(s).map(p => p.id), ['b', 'a']);
  const r2 = G.reveal(s);
  is('question 2 counts both of them', r2.counts.Oslo + r2.counts.Bergen, 2);
  is('question 1 is untouched by the arrival', s.answers[0]['b'], undefined);
  is('and its counts are unchanged', G.scoreRecorded(s, 0, 'Lima', 2000).points, 960);
}
{
  // arriving while the answer is on screen
  const s = G.start(G.create({ questions, players: [{ id: 'a', name: 'Ana' }] }));
  G.answer(s, 'a', 'Lima', 0);
  G.reveal(s);
  const late = G.addPlayer(s, { id: 'z', name: 'Zed' });
  is('joining during the reveal is allowed', late.added, true);
  is('but the closed question is not theirs to answer', G.answer(s, 'z', 'Lima', 0), null);
  is('they are on the board at zero', G.standings(s).find(p => p.id === 'z').score, 0);
  G.next(s);
  is('and they play the next question normally', G.answer(s, 'z', 'Oslo', 0).points, 1000);
}

console.log('\nTIES, INCLUDING LATE ARRIVALS');
{
  const s = G.start(G.create({ questions, players: [] }));
  G.addPlayer(s, { id: 'a', name: 'Ana' });
  G.addPlayer(s, { id: 'b', name: 'Ben' });
  G.addPlayer(s, { id: 'c', name: 'Cy' });
  G.answer(s, 'a', 'Lima', 4000);
  G.answer(s, 'b', 'Lima', 4000);
  G.answer(s, 'c', 'Lima', 4000);
  G.reveal(s);
  const one = G.standings(s), two = G.standings(s), three = G.standings(s);
  is('three students dead level are ordered by who joined first', one.map(p => p.id), ['a', 'b', 'c']);
  is('identical scores, identical points', one.map(p => p.score), [920, 920, 920]);
  is('and the order holds on a second render', two, one);
  is('and a third', three, one);
}
{
  // a late joiner tied with someone who was there from the start
  const s = G.start(G.create({ questions, players: [{ id: 'a', name: 'Ana' }] }));
  G.reveal(s); G.next(s);                       // Ana missed question 1
  G.addPlayer(s, { id: 'z', name: 'Zed' });
  G.answer(s, 'a', 'Oslo', 5000);
  G.answer(s, 'z', 'Oslo', 5000);
  G.reveal(s);
  const board = G.standings(s);
  is('tied on everything, the earlier seat is shown first', board.map(p => p.id), ['a', 'z']);
  is('and they really are tied', board[0].score === board[1].score, true);
  is('the order is the same on a redraw', G.standings(s), board);
}
{
  // the messiest sequence I can build, rendered three times
  const s = G.start(G.create({ questions, players: [] }));
  G.addPlayer(s, { id: 'a', name: 'Ana' });
  G.answer(s, 'a', 'Lima', 1000);
  G.addPlayer(s, { id: 'b', name: 'Ben' });     // arrives, taps as the question closes
  G.reveal(s);
  const straggler = G.applyRecorded(s, 0, 'b', 'Lima', 1100);
  is('the straggler was folded in', straggler.applied, true);
  G.next(s);
  G.addPlayer(s, { id: 'c', name: 'Cy' });
  G.answer(s, 'c', 'Oslo', 900);
  G.answer(s, 'a', 'Oslo', 900);
  G.addPlayer(s, { id: 'a', name: 'Ana again' });  // a reconnect mid-game
  G.reveal(s); G.next(s);
  G.answer(s, 'b', 'Cairo', 100);
  G.reveal(s); G.next(s);
  const a = G.standings(s), b = G.standings(s), c = G.standings(s);
  is('a messy game still renders the same three times running', [a, b], [c, c]);
  is('the reconnect did not cost Ana her points', s.players.find(p => p.id === 'a').score > 0, true);
  is('the straggler was counted once', s.answers[0]['b'].choice, 'Lima');
  is('everyone who joined is on the board', a.length, 3);
}

console.log('\nDETERMINISM');
{
  const run = () => {
    const s = fresh();
    G.answer(s, 'a', 'Lima', 1234); G.answer(s, 'b', 'Sucre', 900);
    G.reveal(s); G.next(s);
    G.answer(s, 'c', 'Oslo', 10); G.reveal(s); G.next(s);
    return G.standings(s);
  };
  is('same inputs, same standings', run(), run());
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
