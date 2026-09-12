# NOTES for LearnGeo 2 OY

## Round 3: audit of oy-07's leaderboard (I am testing, not building)

`tests/leaderboard.audit.js`, run with
`node agents/oy-02/tests/leaderboard.audit.js`. **17 requirement checks pass,
0 fail, 6 hazards.** Audited against the 21:09 version of
`agents/oy-07/assets/js/leaderboard.js`; the file changed twice while I was
working (20:10, 21:05, 21:09) and my first run hit a mix, so everything below
was re-run against the current one.

**Verdict: the level change landed properly.** Not a single code path reads
diamonds or economy, no diamond reaches the rendered table, and the two minute
test passes: a student who spends every gem does not move. Level leads, XP
within the level breaks a tie, and `levelFrom()` agrees with `core.js`'s own
`award()` loop for every XP total from 0 to 6000 and for 200 random
award-in-pieces sequences. The off switch is real: `enabled: false` draws
nothing and makes no network call, and it is opt-out rather than opt-in.

Two of my own checks were wrong before they were right, both worth recording.
Searching the source for "diamond" matched the comment saying it does not use
diamonds, which is the trap ROUND3 names; the check now strips comments and
also asserts nothing reaches the rendered HTML. And I labelled a GeoLive-only
class "unstarted" when it is started and merely all level 1.

### Three gaps in the level-mirroring chain (checked after the broadcast)

The decision to sync the student's real level is right and I am not arguing
with it. These are gaps in what delivers it, and two of them produce wrong
numbers on screen the moment `0002` is applied.

- **Nothing calls `sync_level`.** Across every agent folder and `assets/`, the
  only mentions are oy-01's SQL and NOTES. oy-03's `cloud-geolive.js` calls
  `live_now` and `live_join` and nothing else. The sync that would carry a
  level is the profile push in `cloud.js`, which is oy-09's file.
- **An unwritten column outranks the fallback.** `class_members.level` is
  `NOT NULL DEFAULT 1` and `xp` `NOT NULL DEFAULT 0`, and oy-07's
  `syncedLevel()` accepts any numeric level, so a row that never synced looks
  exactly like a real level 1 and `settle()` prefers it. A student with class
  work drops from level 4 to level 1 when the migration is applied, and stays
  there while nothing writes it. Nullable with default null fixes it properly;
  treating `level <= 1 && xp <= 0` as unsynced is the safe guess.
- **Default off is not wired.** `classes.leaderboard_enabled` defaults false,
  but `teacher.js:334` mounts without `enabled`, and oy-07 only suppresses on
  `enabled === false`, so every class draws the table and calls the network.

### Hazards, worst first

1. **The level on this table is not the level in the student's own profile.**
   It is derived from class work: correct answers in class quizzes and live
   games at 10 XP each. A student's real level in `core.js` also counts
   everything they do alone, so the same student can read level 3 here and
   level 9 on their own screen. I checked whether oy-07 could have used the
   real number, and they could not: `profiles` has SELECT `auth.uid() = id`,
   so a teacher cannot read any student's save; `class_members` carries only
   `student_id, display_name, joined_at`; `results` carries `pct/correct/total`.
   Nothing a teacher can read contains a level. So it is a class level or it is
   nothing, until oy-01 adds a column each student writes for themselves.
   **This one needs Owen, not a session:** "based on level" reads as the level
   the student sees, and two different levels for one student will be asked
   about.
2. **A class marked entirely by hand has no leaderboard.** Typed marks carry a
   percentage and no question count, so they earn no XP and nobody counts as
   started. The table reads "not started" for the whole class while the
   gradebook beside it shows 95% and 40%. It is deliberate and right for
   levels, but it is the one case where this table says less than the old
   points column did.
3. **`applyLive()` is not idempotent.** Applying the same GeoLive rows twice
   counts them twice: level 3 became level 4 in the test. `mount()` is safe
   because it re-tallies from scratch first, but the function is exported, and
   a screen that refreshes by calling it again on tallies it already holds
   inflates levels silently. Same shape as the reconcile bug in my own module,
   which is keyed on the stored answer so it cannot double-count.
4. **Two accounts with the same name are ordered by whatever the roster did.**
   The last tie-break is the name and they share one, so the order follows
   roster arrival, which is a network result. Cosmetic today, since both are
   marked tied and share a place. Ending on the account id closes it, the way
   GeoLive standings end on the seat.
5. **Best streak depends on row order when timestamps are equal.** `counted()`
   sorts on `at` alone, so rows sharing a timestamp keep the order the database
   returned: the same three quizzes gave best streak 1 one way and 2 the other.
   Only the streak column is affected. Breaking the tie on `assignmentId` makes
   it deterministic.
6. **A GeoLive-only class is a table of ties at level 1.** Levels come from
   `answered`/`correct`, which oy-01 has not added to `live_players` yet, so a
   live game currently contributes points and a streak but no XP. It fixes
   itself when those columns land, with no change to oy-07's file.

## Built on

Commit: ade3a48 (local HEAD). origin/main has since moved on; nothing here
touches an existing file, so it merges regardless.

## What I changed

**This round: GeoLive rules (`assets/js/geolive.js`).** The rules of the live
quiz, as a single file with no network, no DOM and no clock. Time comes in as
the `ms` argument, so the same calls always give the same answers and anyone
can test it without a database or a browser.

- `create({questions, players, limitMs})`, `start`, `current`, `answer`,
  `reveal`, `next`, `standings`, exactly as the spec lists them.
- `addPlayer(session, {id, name})`: seats somebody who joined after the game
  was created, which the spec promised and nothing implemented. Returns
  `{id, name, score, streak, seat, joinedAt, added}`, or null if refused.
- `answered(session)`: how many players have answered the live question, so the
  teacher's screen can show "7 of 12" without reading the session's internals.
  Counts players rather than taps.
- `scoreRecorded(session, questionIndex, choice, ms)`: scores an answer that is
  already stored, ignoring the session's status and index and changing nothing.
  Returns `{correct, points}`, or null if there is no question at that index.
- `applyRecorded(session, questionIndex, playerId, choice, ms)`: folds that
  answer into the session, even though the question has closed. Returns
  `{correct, points, total, applied}`, or null for an unknown question or
  player. `applied` is false when the answer was already counted, so a
  reconcile pass can log what it actually changed.
- Scoring: wrong is 0, correct is 600 plus up to 400 more, scaled by how much
  of the time limit was left, rounded to whole points. Answering the instant
  the question appears is 1000; answering as the timer runs out is 600.
- Answering twice keeps the first answer. The second call is not an error, it
  returns the same reply the player already got.

### Why both score and apply exist

An answer can be accepted while the question is legally still open, a moment
before the host writes the reveal, so it is missing from the marks the host
sent. Marking the stored row alone would not fix that, it would invert it: the
per-question detail would say the student scored 980 while the standings, built
from this session, still said they scored nothing. Before the fix both sides at
least agreed. So the reconcile pass scores the row **and** folds it in, and
`applyRecorded` is what makes the second half safe to run more than once.

### The two calls made inside addPlayer

**A late joiner is absent from what already closed, not zeroed into it.** No
record is invented for questions asked before they arrived, and `joinedAt`
records which question they turned up on so `restreak()` skips the earlier
ones. A student who was not in the room did not miss anything, and a streak is
a statement about questions you were asked. The alternative, writing zeros
backwards, would also make their accuracy read as though they had failed
questions they never saw.

**Joining after the game ends is refused**, returning null. There is nothing
left to answer, and seating them would put a name on the final podium that
never played. Every other status accepts, including mid-question.

**A rejoin never costs anything.** Calling `addPlayer` again with the same id
returns the existing player with `added: false`, keeping their score, seat and
streak, and only refreshes the name, since a reconnect can carry a corrected
one. `live_join` upserts, so this will be called again for the same student;
wiping a score on reconnect would be the worse failure by far.

**Earlier rounds, already on main:** the animations (c74333a), the Supabase
admin PIN (3c880bc) and the shop double-charge fix (dd1c0a7).

## Files in this folder

- `assets/js/geolive.js` — mine, new, this round's work.
- `tests/geolive.test.js` — 127 tests for the above. **Not part of the site.**
  Do not move this to the top of the repo. Run it with
  `node agents/oy-02/tests/geolive.test.js`. It finds `geolive.js` whether it
  is still in this folder or already merged into `assets/js/`, so oy-10 can
  rerun it after the merge.

Nothing in this folder is a copy of a file that already exists in the repo, so
a sweep of it cannot revert anything.

## Status

Status: Complete. 127 tests pass, covering scoring, the answered count,
scoring and applying a recorded answer, late joiners and rejoins, the
first-answer rule, the three edge cases below, the empty cases (no questions,
no players), guard rails (answering before the start, after a reveal, after the
end, or as a player who is not in the game), and determinism.

Nothing is half-done. It has no dependencies, so it cannot be broken by what
anyone else lands.

### The three edge cases

**A player who never answers.** They stay on the board with 0 points, and are
never dropped. A missed question is only counted when the question closes,
which happens on `reveal`, or on `next` if the teacher skips the reveal.
Closing is one-way and idempotent, so a double reveal cannot punish anyone
twice.

**A question everyone gets wrong.** `reveal` still returns the right answer and
a count for all four options, including the ones nobody picked, so a results
chart keeps four bars in a fixed order. Nobody scores, every streak resets, and
the game carries on.

**Two players tied on points.** Order is: most points, then most correct
answers, then the quicker total answer time, then the order they joined. That
last key is a seat number, and no two players share one, so the sort is a total
order. Sorting is done on a copy, never in place.

**Why that last tie-break matters:** a leaderboard on a projector in front of a
class must not reshuffle between renders. If ties were left to the sort, the
order could differ run to run, and two players swapping places every second
looks broken to a room full of students. Using join order makes it stable and
explainable: tied on everything, the one who joined first is shown first. I
deliberately did not tie-break on name, since two students called Sam would tie
again.

## Do not overwrite

- **`assets/js/geolive.js` stays pure.** No fetch, no Supabase, no DOM, no
  `Date.now()`. It is the one piece that can be tested on its own and the piece
  every other session calls. If a screen needs the time, it passes `ms` in. If
  something needs the network, that belongs in oy-03's `cloud-geolive.js`.
- **One scoring rule, shared.** `answer()`, `scoreRecorded()` and
  `applyRecorded()` all go through the internal `mark()`. Do not inline the
  arithmetic into any of them. If they drift, the live standings and the stored
  per-question marks stop agreeing, which is the exact bug the reconcile pass
  exists to fix. A test scores the same 11 inputs through two paths and fails on
  any mismatch.
- **`answer()` still refuses a closed question.** Right for a live tap: a
  student cannot score after the reveal. Reconciliation goes through
  `applyRecorded()` instead. Do not merge the two.
- **The idempotency key is the stored answer itself**: `answers[questionIndex]`
  keyed by player id, which is unique per session, player and question, and
  matches the database constraint. If `applyRecorded` stops checking that first,
  a reconcile pass that runs twice inflates a student's total, and nothing
  downstream would catch it.
- **`restreak()` rebuilds streaks rather than nudging them.** A late answer
  lands behind questions that have already closed, so a straggler's streak
  cannot be worked out by adding one. Rebuilding from what is recorded is what
  makes the result independent of when the straggler arrived; there is a test
  that reconciles the same answer early and late and expects identical
  standings and streaks.
- **Seats are one past the highest, never a count**, and `addPlayer` reuses the
  existing player rather than seating a duplicate. Both protect the same thing:
  unique seats are what keep the tie-break a total order, and a duplicate seat
  brings the flickering leaderboard back.
- **`joinedAt` is what makes a late joiner absent rather than failing.** Drop it
  and `restreak()` treats every question asked before they arrived as one they
  missed.
- **`applyRecorded` moves `correct` and `totalMs`, not just `score`**, or the
  board sorts ties on stale numbers, which is invisible until two students are
  level.
- **Closing a question is what records a miss.** If `close` stops being called
  from both `reveal` and `next`, a teacher who skips the reveal leaves streaks
  standing for people who never answered.
- **The shop fix from dd1c0a7**, in `assets/js/ui.js`: `wireShop(root, scope)`
  and the `wireShop(root, next)` call inside `equip()`, plus the owned check in
  the Unlock handler. Without it one click can open several confirm dialogs and
  charge several times for one item, compounding until the page locks up.
- **The Supabase admin PIN** (`admin-pin.js` and the check in `admin.js`). The
  codes must not go back into a file: the repo and the site are both public.
- **The `pre-push` hook** at `repo/.git/hooks/pre-push`. It refuses a push built
  on an older copy. Its limit: it only guards pushes from this folder, so the
  `claude/*` cloud branches go around it, and it cannot tell you what is
  deployed.

## Things the spec did not settle, decided here

Each is a one-line change if a different answer is wanted, and the tests pin
the current behaviour.

1. **Time limit.** `create` takes an optional `limitMs`, default 20000. A
   per-question limit would need a spec change.
2. **Calls that cannot count return `null`**, rather than a zero score: no live
   question, a question already revealed, a player who is not in the game, a
   question index that does not exist, a join with no id, or a join after the
   end. Callers should check for null instead of reading a field off it.
3. **A choice is the option's text**, matching the `counts` keys in `reveal`. A
   number is accepted as a position. Anything else counts as wrong rather than
   throwing.
4. **The teacher's live "who has answered" count** is `answered(session)`.
5. **Reconciliation both scores and applies.** `scoreRecorded` for the stored
   row, `applyRecorded` to fold it in, idempotent by the answer already held
   for that player on that question. Anything that also writes standings must
   use `applyRecorded`, or the two halves disagree again.
6. **Late joiners**, as described above: absent from closed questions rather
   than zeroed, refused once the game has ended, and a rejoin keeps the score
   while refreshing the name. `joinedAt` is new on the player record, and is 0
   for everyone seated at `create`.
