# GeoLive, and the class leaderboard

Two features Owen asked for on 2026-09-12.

**GeoLive** is a live quiz a teacher runs with the class, the way Kahoot works.
The teacher picks who is playing and what gets asked, everyone answers on their
own device, and the standings update as it goes.

**The class leaderboard** is separate and simpler: an all-time table for the
class, not tied to a GeoLive game.

## Why this file exists

Ten sessions are building this at once. The only way that works is if nobody
has to guess what anyone else is writing. This file is the contract. If you
need something that is not here, ask LearnGeo Master rather than inventing it,
because the other end of your call is being written by someone who cannot see
your code.

Build against these signatures even if the file you call does not exist yet.

## Who owns what

Every file has exactly one owner. Write only your own.

| Owner | File | What it is |
| --- | --- | --- |
| oy-01 | `supabase/deployed/0002_geolive.sql` | tables, policies |
| oy-02 | `assets/js/geolive.js` | the game rules, no network, no DOM |
| oy-03 | `assets/js/cloud-geolive.js` | everything that talks to Supabase |
| oy-04 | `assets/js/geolive-teacher.js` | the teacher's screen |
| oy-05 | `assets/js/geolive-student.js` | the student's screen |
| oy-06 | `assets/css/geolive.css` | all styling for both screens |
| oy-07 | `assets/js/leaderboard.js` | the all-time class leaderboard |
| oy-08 | `assets/js/geolive-questions.js` | building the question set |
| oy-09 | the existing files | the only session allowed to touch them |
| oy-10 | nothing | tests it and reports |

Nobody except oy-09 edits `index.html`, `teacher.js`, `cloud.js`, `core.js`,
`ui.js`, `quiz.js` or anything else that already exists. If you need a hook in
one of those, write down exactly what you need and oy-09 adds it. This is the
rule that keeps ten people out of each other's way.

## The shape of a question

Everything passes questions around in this shape. Do not invent a variant.

```js
{
  kind: 'country-capital',   // or 'capital-country', 'shape-country', 'country-map'
  prompt: 'What is the capital of Peru?',
  answer: 'Lima',
  options: ['Sucre', 'Lima', 'Buenos Aires', 'Caracas'],  // always 4, answer included
  code: 'Peru'               // the country NAME, see the correction below
}
```

## `GeoLive` — assets/js/geolive.js, oy-02

The rules of the game. No fetch, no Supabase, no DOM. Given the same inputs it
gives the same answers, which is what makes it testable.

```js
GeoLive.create({ questions, players })   // players: [{id, name}] -> session object
GeoLive.start(session)                   // -> session, status 'asking', index 0
GeoLive.current(session)                 // -> the question, or null when finished
GeoLive.answer(session, playerId, choice, ms)  // -> {correct, points, total}
GeoLive.reveal(session)                  // -> {answer, counts: {option: n}}
GeoLive.next(session)                    // -> session, next question or status 'ended'
GeoLive.standings(session)               // -> [{id, name, score, streak}], best first
```

Scoring, Kahoot style: a wrong answer is 0. A correct answer is 600 points plus
a speed bonus of up to 400, scaled by how much of the time limit was left. Round
to whole points. A player who answers twice on the same question keeps the first
answer.

## `GeoLiveCloud` — assets/js/cloud-geolive.js, oy-03

Everything that touches the network. All methods return promises.

```js
GeoLiveCloud.available()                      // -> bool, is Supabase reachable
GeoLiveCloud.open(classId, questions, playerIds)  // -> {sessionId, code}
GeoLiveCloud.join(code, memberId, name)       // -> {sessionId, playerId}
GeoLiveCloud.watch(sessionId, onChange)       // -> unsubscribe function
GeoLiveCloud.answer(sessionId, playerId, index, choice, ms)
GeoLiveCloud.setStatus(sessionId, status, index)
GeoLiveCloud.close(sessionId)
```

**Fail soft, and this is not optional.** Tonight a merge shipped code that read
a table which did not exist, inside the same batch as the class sync. It would
have taken down the teacher dashboard and every student's assignment list, not
just the new feature. So: if the GeoLive tables are missing, `available()`
returns false and every other call resolves to null or an empty result. Never
let a missing table throw into the rest of the app, and never share a
`Promise.all` with anything that is not GeoLive. Every other kind of error still
throws.

## `GeoLiveQuestions` — assets/js/geolive-questions.js, oy-08

```js
GeoLiveQuestions.premade()        // -> [{id, label, note, build(n)}]
GeoLiveQuestions.fromCodes(codes, kinds, n)   // teacher picked specific countries
```

Premade sets, at least: capitals, countries from capitals, countries from their
shape, and a mixed set. `build(n)` returns n questions in the shape above.

Read the existing pool and distractor logic in `quiz.js` and reuse the ideas,
but do not edit that file. Two branches independently rewrote its pool
selection tonight and both were half right; do not make it three.

## The screens

`GeoLiveTeacher.mount(el, { classId, roster })` — oy-04. Pick players from the
roster, pick a premade set or choose countries, show the join code, show who has
joined, start, then per question show a live count of who has answered and the
standings after each reveal. End shows a podium.

`GeoLiveStudent.mount(el, { code })` — oy-05. Join, wait, answer with four big
targets, see right or wrong and the points, then their place. Must work on a
phone: this is the one screen that is definitely used on a phone, in a room,
in a hurry.

Both mount into a container oy-09 provides. Neither writes to `index.html`.

## `ClassLeaderboard` — assets/js/leaderboard.js, oy-07

```js
ClassLeaderboard.mount(el, { classId })
```

All-time table for the class: name, total points, quizzes done, accuracy, best
streak. Built from the `results` rows that already exist, plus GeoLive points
once those are being written. Handle the empty case, a class with one student,
and ties. Same fail-soft rule: no data means an empty table, never a thrown
error.

## The database — oy-01

Three tables under a `live_` prefix, in `supabase/deployed/0002_geolive.sql`:
sessions, players, answers. A session needs a short join code, a status of
lobby, asking, reveal or ended, the question set, and which question it is on.

Match the live database's existing style: look at what is actually there rather
than at `supabase/migrations`, which was never applied and does not describe the
real database. Row level security in the same shape as the existing tables. A
student may only read the session they joined and write their own answers.

Write it so it can be applied to a database that already has real data in it,
and say at the top what it creates.

## Working rules for this round

Write your file into your own folder at its real path, so oy-02's file goes to
`agents/oy-02/assets/js/geolive.js`. The Organizer moves them to the top of the
repo.

Run no git that writes. Ten sessions share one clone and concurrent commits
collide on `index.lock`.

Fill in your `NOTES.md`: what you built, what is unfinished, and what must not
be overwritten.

Nobody deploys and nobody promotes a build. Only `main` reaches production and
only Owen or aj promotes it.

## Settled after oy-02 built the rules

These were open in the first draft. They are decided now. If your code assumed
otherwise, change your code rather than arguing with the spec, and tell
LearnGeo Master if the decision is wrong.

**The time limit belongs to the session.** `GeoLive.create` takes an optional
`limitMs`, defaulting to 20000. The teacher screen may offer to change it. The
speed bonus scales against whatever the session was created with.

**A call that cannot produce a score returns `null`, not a zero.** Answering a
question that has closed, answering twice, or answering as a player who is not
in the session all return `null`. Do not read `.points` off the result without
checking. A zero and a refusal are different things, and showing a student
"0 points" when their answer was never counted is worse than showing nothing.

**A choice is the option text.** A number is accepted as a position, so a
keyboard shortcut can pass 1 to 4.

**`GeoLive.answered(session)` returns how many players have answered the
current question.** Use it for the teacher's live count. Do not reach into
`session.answers` yourself; that shape belongs to `geolive.js` and only it
should know about it.

**The standings order is a total order and never reshuffles.** Most points,
then most correct, then quicker total time, then the seat number handed out at
create. Deliberately not name, because two students called Sam would tie again.
Two renders of the same session always give the same order, which is what a
projector at the front of a class needs.

**A player who never answers stays on the board at 0** and their streak resets
when the question closes. Closing happens on reveal, or on next if the teacher
skips the reveal, and is idempotent, so a double reveal cannot punish twice.

**`reveal` returns counts for all four options**, including ones nobody picked,
in a fixed order, so a results chart keeps four bars that do not jump about.

## Settled after oy-01 built the tables

**Table and column names are final.**

```
live_sessions(id, class_id, host_id, code, status, questions, question_index,
              time_limit_ms, created_at, updated_at, ended_at)
live_players(id, session_id, student_id, name, score, streak, joined_at)
live_answers(id, session_id, player_id, question_index, choice, correct,
             points, ms, created_at)
```

`status` is `lobby | asking | reveal | ended`.

**Joining goes through `live_join(p_code, p_name)`**, which returns
`{sessionId, playerId, code, status}`. Not optional. A student may only read
the session they joined, which makes looking up a game by code impossible from
the client, so the lookup has to happen inside a function that runs with more
privilege. Never insert into `live_players` from the client; the policy blocks
it deliberately. Same pattern as the existing `join_class`.

**The time limit lives on the session**, as `time_limit_ms`, default 20000.
`GeoLive.create`'s `limitMs` must be filled from that column, never hardcoded.
A teacher who changes it and gets a countdown that disagrees with the scoring
is a bug that only shows up in a real lesson.

**Answering requires the session to be `asking` and the answer's
`question_index` to match the session's.** So the teacher's screen must set
status and index before students can answer. A student cannot run ahead or
answer a question the class has left.

### Students do not score themselves

oy-01 flagged that a client writing its own `correct` and `points` can post
whatever it likes, and asked whose call it was. Mine, and the answer is no.

A class leaderboard students can inflate is worth less than no leaderboard, and
these are school children, who will absolutely try it.

**The student client writes `choice` and `ms` only.** It never writes `correct`
or `points`. The host's screen computes both with `GeoLive.answer` and writes
them back, and `live_answers` policy allows only the host to set them.

The reason this is not solved by scoring in SQL instead: that would put the
rules in two places, Postgres and `geolive.js`, and they would drift. Two
independent implementations of the same rule quietly disagreeing is the exact
failure this project hit last night in `quiz.js`. Scoring stays in one file
that one session owns and 53 tests cover.

`ClassLeaderboard` must therefore read host-written points, never a student's
own row.

### The realtime publication is empty

Nothing in this project has ever received a live update. `supabase_realtime`
publishes nothing. oy-01's file adds the three tables to it, but until that SQL
is applied `GeoLiveCloud.watch()` will never fire and will report no error at
all. If you are testing `watch()` and nothing happens, check this before
debugging your own code.

Two migrations are now pending and neither has been applied to the live
database: `0001_announcements.sql` from last round, and `0002_geolive.sql`.

## Answers to the gaps oy-10 found

oy-10 wrote a test plan from the spec before any code existed and found eight
places where eight sessions could each be correct and still not fit together.
Two had already been closed: the time limit is `time_limit_ms` on the session
(oy-01 and oy-02 independently chose 20000) and the tie order is oy-02's total
order. The rest are settled here.

**Distractors come from the whole pool, not from the teacher's picks.**
A teacher who picks three countries cannot otherwise have four options. The
countries *asked about* come from their picks; the wrong options come from the
full set, preferring the same region. This also matches what a teacher means:
"test them on these three" is not "only ever show these three".

**No question may contain two identical options.** This is a correctness rule,
not a cosmetic one. `reveal()` counts by option text, so two identical options
collapse into one key and the teacher's counts go quietly wrong. Most likely to
happen in exactly the three-countries case. oy-08 must guarantee it.

**When `n` is more than the picked countries can fill**, vary the question kind
for the same country before repeating a country-and-kind pair. If it still
cannot be filled, ask fewer questions and report the real count. Never pad and
never return an empty game.

**A late joiner is added and starts at 0**, carrying zeros for questions that
already closed, consistent with a player who never answers. The teacher's
"answered" count compares against everyone currently in the session. A student
joining mid-question nudges that denominator, which is fine and self-correcting;
it is not worth a more precise rule that three sessions have to implement
identically.

**Rejecting a stale answer belongs to oy-03.** The database already enforces it,
since the insert policy requires the answer's `question_index` to equal the
session's. `GeoLiveCloud` enforces the same thing before it writes, so a student
whose phone woke up late gets a clean refusal rather than a policy error.
`geolive.js` stays index-free; that was the right call.

**GeoLive points reach the leaderboard by being read, not by being copied.**
`ClassLeaderboard` sums `live_players.score` per student across ended sessions,
alongside the existing `results` rows. Nobody writes a second copy of a score
into `results`. A number stored twice is a number that will disagree with
itself, and there is no owner for keeping the two in step.

**Accuracy is correct divided by answered**, with answered shown next to it, not
correct divided by asked. A student whose phone died should not be recorded as
having got those questions wrong.

## Integration decisions

**Players come from `members`, not `people()`.** oy-09 found that `people()`
returns an empty string as the id for any student the teacher typed by hand and
who has never signed in, which is most of a class before anyone joins. Two such
students both carry `id: ''`, so they collapse into a single player and
`open()` receives blanks. `W.state.classroom.members` is the set with an actual
account, which is also exactly the set with a device to answer on.

But the teacher screen still shows the whole class, with the ones who cannot
play greyed out and unselectable. A teacher who picks nine students and sees
three names would reasonably think the app lost the rest. So oy-09 passes
`{ classId, roster, members }`: `roster` is everyone, for display, `members` is
who can actually play.

**The mount adds its own container classes.** oy-09 provides a bare div;
`GeoLiveTeacher.mount` adds `gl gl--teacher` and `GeoLiveStudent.mount` adds
`gl gl--student`. Either convention works, so it is settled only so both ends
stop assuming the other does it and the screens render unstyled.

**oy-09 gates the not-online state before mounting**, reusing teacher.js's
existing sign-in hint. The screens may assume a live class and a signed-in
teacher.

**`teacher.js` exports `people` and `ownerKey`.** oy-07 was carrying its own
copy of the identity rule, the one where a typed roster name and the account
that joined under it are one student while two accounts with the same name are
two students. That rule was fixed hours ago and a second copy is how it drifts
back. Two added lines, no behaviour change.

### How GeoLive points reach the leaderboard

oy-03 keeps no scores in the database during a game, deliberately: `watch()`
returns raw answer rows and every screen scores them with the same module, so a
reconnecting phone cannot drift. That is right, and it also means nothing
writes `live_players.score`, which the leaderboard was told to read.

Both hold, because the two needs are at different times.

**During the game, points are derived and never stored.** After it, the host
calls `GeoLiveCloud.saveStandings(sessionId, standings)` exactly once, writing
final score and streak to `live_players`. Only the host may write them, which is
the same rule that stops students scoring themselves.

`ClassLeaderboard` then reads finished games through
`GeoLiveCloud.totals(classId)`, resolving to
`[{studentId, name, points, bestStreak, games}]`, counting only sessions with
status `ended`. oy-07 already built against that name and it is approved.

Re-scoring history from raw answers was the alternative and it is worse: it
needs every past session's questions and grows without limit.

### Two constraints the schema must carry

`live_players` unique on `(session_id, student_id)`, and `live_answers` unique
on `(session_id, player_id, question_index)`. These are what stop a rejoining
phone becoming a second player and a retried tap counting twice. Without them
no amount of client code can prevent either.

### Known limit, accepted for now

A guest who reopens the game in a different browser or a private window cannot
prove they are the same person and rejoins as a new player at zero. Fixing it
needs a token in the join link. Not worth it for the first version: the common
case, the same phone waking up, works.

### For oy-08, from the Organizer

The empty-pool guard in the merged `quiz.js` is not optional and not a detail.
`if (!wanted.length) wanted = pool({ scope: config.scope });` is the line that
stops an empty selection producing a quiz with no questions. Copy the structure
by all means, but copying it without that guard reintroduces a bug this project
spent a whole round fixing, in a new file, where it will look like fresh work
rather than a regression.

## Class names: oy-06's list is canonical

Four files ended up with three conventions. oy-06's stylesheet uses `gl`,
`gl--teacher`, `gl--student` and blocks like `gl-lobby`. oy-04 emits `gl__steps`
and `gl__head`. oy-05 emits `geolive`, `geolive__opt`. oy-07 reuses the app's
own `gb` and `cr-card`.

Left alone, the screens render completely unstyled and it reads as a CSS bug
rather than a contract gap, which is the most expensive kind of mistake to
diagnose.

**oy-06's names win** and its NOTES holds the list. oy-05 renames `geolive*` to
the `gl*` equivalents. oy-04 aligns its `gl__*` names to the same list. oy-06
then re-renders against what oy-04 and oy-05 actually emit and closes any gap
from the stylesheet side, because it is the only session with a rendering
harness and it used it to find three real bugs already.

**oy-07 is the exception and keeps the app's existing classes.** A leaderboard
that looks like the gradebook next to it is the right outcome, and reusing
`gb` and `cr-card` gets that for free. oy-06's `clb` block is then unused;
dropping it is oy-06's call.

Three things the screens must set from JS, because the stylesheet cannot:
`--gl-i` on each standings row and `--gl-n` on the container, `--gl-pct` on
each tally row, and `--gl-secs` plus `is-running` on the timer.

`--gl-i` is the answer to "standings must not jump". Keep rows in a fixed DOM
order and change only `--gl-i`, and a row moving from third to first slides
there. Reorder the DOM instead and every row below it snaps a full row height
in one frame, which is the exact thing a projector at the front of a class must
not do.

## `askedAt`, the gap oy-05 found

A session needs `asked_at`, set when a question opens. Without it a student who
joins mid-question cannot be told how much time is left. oy-05 chose to show no
countdown rather than a confident wrong one, which was right, but the real fix
is the field.

`live_sessions.asked_at`, carried through `open()` and `setStatus()` and
reported by `watch()` as `askedAt`. `GeoLive` takes it on the session so the
speed bonus and the countdown are computed from the same instant.

## Corrections to earlier entries

**The anti-cheat policy does work.** oy-03 read `0002_geolive.sql` before
oy-01's update landed and concluded the host could not mark answers and a
student could post their own points. I checked the current file: the student
insert policy carries `correct = false and points = 0` in its `with check`,
and the `geolive: host marks answers` update policy exists and is gated on
`private.is_class_teacher`. Both are present. No code change needed.

**`saveStandings` is called after each reveal, not once at the end.** oy-03's
shape. It survives a teacher closing the tab mid-game, where a single write at
the end would lose everything.

**Marking only happens while the host's screen is open.** Scoring lives on the
host, so if the teacher closes the tab mid-game answers sit unmarked until they
return, and standings count marked rows only. Worth a line on the teacher
screen rather than a silent stall.

**Guests can no longer play.** `live_join` requires an account and the answer
policy matches on `auth.uid()`. "Join with a code" no longer means "without an
account". Right for a school, and consistent with players coming from `members`,
who all have accounts. oy-04 and oy-05 should not offer a guest path.

**There are no ISO3 codes in this project.** `data.js` has no such field and the
map keys on country name, so `code` carries the name, which is what
`GeoMap.hasShape()` actually uses. This does not reach the schema: `code` on
`live_sessions` is the join code, and question codes live inside the
`questions` JSON. `resolveCodes(codes)` returns `{found, missing}` so the
teacher screen can warn before a game starts rather than silently running a
world quiz.

## `watch()` delivers a snapshot, not events

The spec named `watch(sessionId, onChange)` and never said what `onChange`
receives. oy-03 built a snapshot; oy-04 built for event deltas. Neither was
wrong and together they produce an empty room with no error, which oy-04
correctly called the worst way for it to fail.

**The snapshot wins.** `onChange` receives, or `null` when the feature is off:

```js
{
  status,        // lobby | asking | reveal | ended
  index,         // which question
  timeLimitMs,   // the session's limit, never a screen's constant
  askedAt,       // when this question opened
  players: [...],
  answers: [...] // every answer so far, each with player_id, question_index,
                 // choice, correct, points, ms
}
```

Deltas are the wrong model here. A phone on school wifi will miss messages, and
an event stream that has missed one is silently wrong from then on. A snapshot
that arrives late is still correct, which is why a waking phone lands in the
same state as one that never slept.

So a screen derives rather than accumulates. The live answered count is
`snap.answers` filtered to `snap.index`, not a running tally. Per-option counts
for the reveal come from the same filter.

**No screen keeps its own question length.** Read `timeLimitMs` off the
snapshot. oy-04 holds `QUESTION_SECONDS = 20`, which happens to match today's
default and will silently produce wrong speed bonuses the day a teacher changes
it, with nothing on screen looking broken.

## Two more rulings

**`saveStandings` is called after each reveal**, not once at the end. oy-03
proposed that first and was right. A teacher who closes the tab mid-game should
lose the rest of the game, not all of it.

**oy-07 does not query the database.** It currently has four direct `live_`
queries. oy-03 owns everything that talks to Supabase for GeoLive, and has now
built `totals(classId)` to exactly the name and shape oy-07 designed. So oy-07
deletes its own query and calls that. oy-07 was right to flag it as better
decided than left to happen by accident, and right about the risk it was
avoiding, but that risk is gone now the SQL exists.

**Accuracy needs two more columns.** `live_players` carries no answered or
correct count, so GeoLive can give the leaderboard points and a streak but
cannot contribute to accuracy at all, and a student who only plays live games
shows a dash. oy-01 adds `answered` and `correct` to `live_players`, written by
the host in the same call that writes score and streak, under the same policy.
Counting `live_answers` from the leaderboard was the alternative and it puts a
second query and a second definition of the same number in a file that should
not have either.

## The database stamps `asked_at`, not the screen

I specified the host setting `asked_at`. oy-01 built a trigger instead, so the
database stamps it whenever a session enters `asking` or advances
`question_index` while asking. That is better and it stands.

**One clock.** If the teacher's laptop stamps the time, every countdown in the
room is measured against whatever time that laptop believes it is. Stamped
server-side, every student measures against the same clock.

**It cannot be forgotten.** If `setStatus` ever advances the question without
resending `asked_at`, students would see a confident countdown left over from
the previous question, and a wrong countdown looks correct in a way that no
countdown does not. The trigger restamps whether or not anyone remembers.

`asked_at` is null in the lobby and holds the current question's open time
during reveal. Remaining time is `time_limit_ms - (now - asked_at)`.

**The student's device clock is oy-03's to solve.** Comparing a phone's local
`now` against a server timestamp drifts by however wrong that phone is, and a
few seconds out of twenty is a quarter of the question. Read the server time
once at join, keep the offset, apply it everywhere a countdown is computed.
Do not trust `Date.now()` against a server stamp without it.

## Reversal: the stylesheet follows the screens, not the other way round

I ruled that oy-06's class names were canonical and the two screens should
rename. That was based on my believing the gap was an alignment pass. oy-06
measured it: oy-04 emits 55 classes of which 53 have no rule, oy-05 emits 37 of
which 35 have none. Three names overlap in total, and one of those only by
name.

So it is not an alignment, it is a rewrite of the class strings in two files
whose authors are mid-flight, and a half-finished rename renders worse than
either convention on its own.

**oy-06 adds rules for the names oy-04 and oy-05 already emit.** One file
changes instead of two, and a stylesheet following the markup is the normal
direction of dependency anyway. oy-04 and oy-05 stop renaming and keep what
they have.

## `--gl-i` is not wired anywhere, and the standings still jump

I reported that oy-04 referenced `gl-i` and `gl-n` four times so had understood
the requirement. It had not. The four hits were `id="gl-none"` and
`id="gl-next"` caught by a loose grep. There is no `setProperty` and no `--gl`
in either screen.

`standingsBoard` builds `rows.slice(0, limit).map(...)` into a fresh innerHTML
in sorted order on every update. That is DOM reordering, so every row below a
score change snaps a full row height in one frame. **Owen asked for standings
that do not jump and right now they do.** No rename fixes it, because it is a
rendering strategy and not a class name.

The fix: keep one row per player in a stable DOM order keyed by player id,
never reordered, and set `--gl-i` on each row to its current rank plus `--gl-n`
on the container. A row moving from third to first then slides there.

## `saveStandings` is called once, and should be per reveal

oy-04 calls it in `doNext` only when the game ends, commented "Once, here, and
nowhere else". oy-03's implementation supports being called after each reveal
and always did; the single call site is oy-04's. A teacher closing the tab at
question 8 currently loses the whole game rather than the last question.

## The host marks answers, and there was no way to

oy-04 found that `live_answers.correct` and `points` exist, the spec says the
host computes and writes them, oy-01 built a policy allowing exactly that, and
no method in `GeoLiveCloud` can perform the write. So the columns would never
be filled, and because students must insert `correct = false, points = 0`,
every answer row would permanently read as wrong.

That is worse than not having the columns. Anyone querying `live_answers` later
for which questions a class found hard would get an answer that is uniformly,
confidently wrong.

**oy-03 adds `markAnswers(sessionId, questionIndex, marks)`** where `marks` is
`[{playerId, correct, points}]`. **oy-04 calls it at each reveal**, alongside
`saveStandings`.

This is not the duplicate-storage problem I ruled against earlier. That rule
was about two implementations of scoring drifting apart. Here `geolive.js` is
still the only thing that scores; the host is writing down what it decided, in
one place, under the one policy that permits it. The alternative, deriving
per-answer correctness later, means replaying every past session's questions.

## Accepted deviation: the count follows the screen, not the room

oy-04 filters the answered count on the question the screen is showing rather
than on `snap.index`. The room's index can lag a beat while the `setStatus`
write lands, and a count belonging to the previous question is worse on a
projector than a count that arrives a moment late. Flagged rather than hidden,
and right.

## A drift bug worth remembering

`open()` does not report the session's limit back, so `GeoLive.create` was
called without one and quietly defaulted to 20000 while the countdown read
`timeLimitMs` from the snapshot. With a room at the default those agree, which
is exactly why it would have shipped. At 30000 the session scored on 20000
while the clock counted 30.

Found by deliberately setting the room to a non-default value. A default that
matches the common case hides a mismatch rather than preventing one, and the
only way to see it is to test with a value that is not the default.

## `answer()`: two of my rulings contradicted, and oy-03's resolution wins

I ruled first that a second tap must resolve to the first answer's result, then
later listed "already answered" among the cases returning null. Both cannot
hold. oy-03 flagged it rather than picking silently.

**The shape is:**

```js
{ accepted: true, first: true,  row }   // written
{ accepted: true, first: false, row }   // already answered; row is the one that counted
null                                    // refused: closed, moved on, not in the session
```

oy-03's reasoning is right and my later list was the sloppy one. A second tap
is not a refusal: the student's answer *is* recorded, and returning null would
tell them it was not. `accepted` still answers the question oy-05 needed
answered, and `first` carries the rest. The alternative would push a memory of
having answered into the student screen, where it can get out of step.

## Clock correction, and the gap that is left

Every snapshot now carries `msLeft`, worked out against a corrected clock, so
no screen has to remember to allow for drift. `serverNow()` is exported for
anything counting down outside a snapshot.

It matters more than it sounds. With a server 90 seconds ahead of the device,
a 20-second question opened 5 seconds ago correctly reads 14998 ms left. On the
raw device clock the same snapshot claims 104597 ms left.

oy-03 established that the HTTP `Date` header is not readable cross-origin, by
checking rather than assuming, so the offset has to come from values the server
has already stamped: `asked_at` returning from `setStatus` corrects the host at
once, `created_at` on an answer corrects a student on their first answer.

**That leaves one gap: a student's first countdown of the game runs on their
own clock.** The fix is a `live_now()` function, four lines of SQL, and it
belongs to oy-01.

## How to route a change, after getting this wrong twice

Twice now the coordinator has relayed a summary of what another session's file
contains, and twice the file had moved by the time it arrived. Once it was a
false positive from a loose grep. Once it cost oy-06 a full rewrite of its
student section, converting to one convention while oy-05 converted to the
other, so the two swapped past each other and ended up further apart than they
started.

**The rule, from here:**

A ruling is the coordinator's to state. "The screens win, the stylesheet
follows" is a decision and travels fine in a message.

**The contents of a file are not.** "Their file now emits these names" is a
snapshot of something four sessions are editing, and it is stale roughly the
moment it is written. Route those as *go and read their file*, naming the file,
not as a list.

The sessions holding a harness can check a real file in about a minute. That is
always cheaper than acting on a description of it, and it is the only version
that cannot be out of date.

This applies to `agents/CLASS-GAP.md` too. It was accurate when generated and
is a starting point, not a source of truth. Regenerate or re-read rather than
working through it on faith.

## Testing at the default proves nothing

Adding oy-04's line to the drift lesson, because it generalises past that bug
and matters most to whoever is testing.

The session limit defaults to 20000. The scoring and the countdown each held
their own copy of it. At 20000 the two copies agree, so **every test run at the
default passes whether or not the bug is there.** A default that matches the
common case does not prevent a mismatch, it hides one.

Anyone testing a screen against 20000 alone gets a false pass. Use a value that
is not the default, on purpose. The bug was only ever visible at 30000.

## An answer that can never be marked

oy-04 found, and tested rather than assumed, that an answer landing between the
last snapshot and the status write can never be marked: `GeoLive` refuses to
score a closed question, so no mark exists and the row keeps the `false` and `0`
the student was required to insert.

It should be impossible in the real system, because the insert policy requires
status `asking` and a matching `question_index`, and by then the status is
`reveal`. So if such rows ever appear, that is where they came from, and **the
fix belongs at the insert, not at the marking.**

Marking an answer that `GeoLive` refused to score would mean inventing a number
on the host, which is the single thing this whole design exists to prevent.

## An audit that reads comments is not an audit

oy-05's class audit was matching class names anywhere in the stylesheet,
including inside comments. `geolive.css` is heavily commented and names classes
in prose throughout, so **a class that was only ever discussed counted as
styled.** The audit passed clean while the student's question text had no rule
at all.

Stripping comments first is what found it. Any check of this shape has the same
hole: searching a file for a name finds the name, not the rule.

Two things follow. Re-run any styling check that matches raw text. And render
every state, not the obvious ones: oy-06 rendered three phases of a screen that
has seven, and its count of what that screen emits was out by 21 as a result.

## Correction: the unmarkable answer is not impossible, it is a race

I recorded oy-04's straggler as impossible against the real database. oy-03
corrected it, and "impossible" is exactly how a real one gets misdiagnosed
later, so the precise version:

```
host takes its snapshot
  -> student's answer inserts, legally, status still asking
    -> host writes reveal
```

The insert policy tests the session's status at the moment of the insert, not
at the moment the host writes reveal. That row is valid, accepted, and absent
from the marks the host sends. Nothing rejects it.

The window is one round trip wide, which sounds negligible until you picture
thirty phones racing a buzzer. **The last-second answer is precisely the one
that falls in it.**

What it costs: the stored per-answer row says that student got it wrong, while
the derived standings may still count it. The aggregate and the per-question
detail can disagree, and the per-question detail is what feeds "which questions
did the class find hard".

### Closing it

oy-03's fix, and it invents nothing: after writing reveal, the host re-reads
once and marks any straggler for that question using the `ms` already on its
row. The answer was legally submitted while the question was open and carries
its own elapsed time, so scoring it is reading, not guessing.

It needs three parts:

- **oy-02** exposes scoring for a recorded answer without consulting the
  session's current status. The rules already know how; today they refuse
  because the question has closed, which is right for a live tap and wrong for
  a row being reconciled afterwards.
- **oy-03** does the re-read after `setStatus(reveal)` and marks stragglers.
- **oy-04** calls it once, after the reveal write.

Doing this rather than recording it because the round is blocked anyway, so the
cost is only attention, and a stored number that contradicts the standings is
the kind of thing nobody diagnoses six weeks later.

## `CLASS-GAP.md` is retired, not stale

I generated `agents/CLASS-GAP.md` to turn the class-name reconciliation into a
mechanical task. It was wrong in the direction that costs most: it listed
around twenty classes as unstyled that oy-06 verifiably had styled, and the
"same element named twice" pairs pointed at names that had already been
abandoned. Followed as written it would have had oy-06 break working rules.

The cause is the one this round keeps relearning. It was generated against a
copy of the stylesheet from the middle of the round, during the window when
oy-06 had briefly converted its student section to the other convention on the
strength of a forwarded summary that was itself stale.

**The file is deleted rather than regenerated.** A reference file describing
something four sessions are editing cannot be kept true, and a wrong one is
worse than none, because it is trusted.

### When you do pass on something you read

oy-06's request, adopted: anything said about another session's file carries
**when it was read**. That way the reader knows whether to trust it or go and
look. Reading a real file took oy-06 under a minute every time; acting on a
description of one cost it a full rewrite.

## A check that only walks the happy path certifies nothing

oy-05 found a second hole in its own class audit, and it is worse than the
comments one. **It only ever rendered the happy path.** So when it added a new
class for a visible error message, the audit passed clean at 47 of 47, because
nothing in the run ever produced an error state, so the new class was never
emitted and never checked.

A tool that only walks the path where nothing goes wrong will certify a screen
that breaks the moment something does. It now drives a failed join and a late
tap, finds 50 classes rather than 47, and correctly reports the one without a
rule.

Both holes have to travel together. Anyone adapting that audit for another
screen needs the comment stripping *and* the failure paths, or it will find
nothing and say so confidently.

The audit lives at `agents/oy-05/tools/`: `classcheck.js`, `dom.js`, and its
89-check suite as a worked example, whose stubbed snapshot shapes match oy-03's
real ones.

**Organizer: `agents/oy-05/tools/` is not part of the merge.** None of it
belongs at the top of the repo. It is a development tool that lives in the
agent folder.

## The error a student needs to see

A failed join was rendering as muted grey with `role="alert"`: correct
semantics fighting the styling, on a phone, in a noisy room, at the moment a
student is trying to get into a game everyone else is already in.

It is now `gl-alert` plus the app's existing `auth-error` box, so it is visible
today rather than whenever the new rule lands. **oy-06 writes the `.gl-alert`
rule**, and oy-05 drops the borrowed class once it exists. Every notice on that
screen goes through this, so the failed send and the time-up line carry too,
while the lobby and sign-in hints stay quiet. That split is right.

## Open items at the close of the round

Things that are not broken, and therefore will not announce themselves. Each
one works today and is quietly wrong. Check these before the round is called
finished.

**Two borrowed classes on the student screen are load-bearing.** Reported by
oy-05 at 20:22, verify before acting:

- The question text uses `.gl-live__q`, which belongs to the teacher's live
  block. It renders; it is borrowed.
- Join and send errors use `.gl-alert` plus `auth-error`, and `auth-error` is
  doing all the work. Drop the borrowed class before `.gl-alert` exists and
  every error on the student screen reverts to unstyled body text.

oy-06 owes a `.gl-alert` rule and a student prompt class. oy-05's audit reports
the first every run, which is the safeguard, but only for someone who runs it.

**Scoring a straggler without applying it relocates the race rather than
closing it.** Traced against oy-04 at 21:20: line 822 feeds arriving answers
through `answer()`, line 959 takes `standings()` and line 960 hands those to
`saveStandings`, so the in-memory session is the sole source of the aggregate.
A straggler marked in `live_answers` but never applied to the session leaves
the detail saying the student scored and the aggregate saying they did not.
Worse than before the fix, where both sides at least agreed. oy-02 is adding an
idempotent apply.

**`agents/oy-05/tools/` is not part of the merge.**

## A player's id in the game is the `live_players` row id, not the account id

oy-04 found this against the real shapes rather than by reasoning, and it is the
worst failure mode this round has produced, because everything "works".

`answer()` inserts `player_id` from what `live_join` returned, which is
`v_player.id`. `markAnswers` filters on `player_id`. `saveStandings` updates
`.eq('id', p.id)` against `live_players`. But `open()` takes **account** ids,
and the snapshot's players carry both: `id` is the row, `student_id` is the
account.

Build the game from account ids and every one of those misses. `GeoLive`
refuses every answer as coming from a player it has never heard of, so no score
moves. `markAnswers` matches zero rows. `saveStandings` updates zero rows. No
error anywhere. **A class watches a scoreboard of zeros and the leaderboard
stays empty.**

The game is built from the snapshot's player rows, and the roster is matched to
them by `student_id`. Anything scoring locally keys on the row id. That applies
to the student screen too: `join()` hands back a row id, which is right for
writing an answer and is also the id `GeoLive` must see.

## A seated player is not an arrived player

`seatRoster` inserts a row for every invited student the moment the game opens,
and `joined_at` defaults to `now()`, so it is stamped at seating. `live_join`
only updates the name. **So a row means invited, not present, and nothing
distinguishes them.**

That breaks the lobby, which is the part Owen asked for by name.

Fix, oy-01: make `joined_at` nullable with no default and set it in
`live_join`'s upsert (`do update set name = excluded.name, joined_at = now()`),
leaving `seatRoster`'s inserts null. Arrived is then `joined_at is not null`.
An explicit `joined` boolean works equally well.

Until then the teacher screen shows invited names unlit and says "Waiting for
the class. Start when everyone is looking at their phone", leaving Start to the
teacher, who can see the room. That is the right call: telling a teacher
everyone is present when nobody is would be worse than telling them nothing,
because they would start.

## Late joiners need `addPlayer`

The spec says a late joiner is added and starts at 0. `GeoLive` has no way to
add a player after `create`, and the host's session is frozen at the start.
`live_join` will happily upsert a row for a student who was never seated, so
they believe they are in while every answer is refused and unmarked.

Silent again. oy-02 adds `addPlayer`, seat assigned at add time so the tie-break
stays a total order.

## Correcting the `code: 'PER'` line, which was an instruction to write a bug

The question shape at the top of this file said `code: 'PER' // ISO3, so the
map can shade it`. **There is no ISO3 anywhere in this project.** oy-10 checked
all 213 entries in `GeoData.countries`: the fields are id, name, capital, lat,
lon, region, status, note, nameAliases, capitalAliases, and not one has an
iso3. `map.js` keys shapes by name.

That line has been corrected above, because a wrong spec line is worse than a
wrong file: it tells the next person to write the bug. Anyone following it
literally calls `fromCodes(['PER','CHL','BOL'], ...)` and silently gets a whole
world quiz, with only a `console.warn` a teacher will never see.

It has not fired so far only because oy-04 and oy-08 independently defended:
`countryKey()` falls through `c.iso3 || c.code || c.name`, and `resolve()`
matches on name. Two correct guesses that happen to interoperate is luck, not
design.

So `resolveCodes(codes)` must be called before a game starts and its `missing`
shown to the teacher. A silent world quiz when a teacher picked three countries
is not a fallback, it is a different lesson.
