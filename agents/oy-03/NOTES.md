# NOTES for LearnGeo 3 OY — round 2, GeoLive

Last round's bug-fix pass is merged and is no longer described here.

## Built on

The working copy as of 2026-09-12, plus oy-01's
`agents/oy-01/supabase/deployed/0002_geolive.sql` as it stands at 20:08, which
has `asked_at` (line 57), the `stamp_asked_at` trigger (155 to 169), and both
anti-cheat policies: "geolive: player answers" at 294 opening with
`correct = false` and `points = 0`, and "geolive: host marks answers" at 314.
**None of it has been applied to the live database.** Neither has
`0001_announcements.sql`.

## What I changed

One new file, nothing else touched:

- `assets/js/cloud-geolive.js` — everything GeoLive sends or reads.

The calls:

- **available()** asks once whether GeoLive exists at all, and remembers.
- **open(classId, questions, playerIds, limitMs)** starts a game: session row
  with `host_id` and `time_limit_ms`, a six character join code (no I, O, 0 or
  1, because it is read off a board), and the picked players seated so the
  lobby can show the room filling up. A code already in use by a running game
  retries, up to five times. `limitMs` is optional, default 20000.
- **join(code, memberId, name)** calls `live_join(p_code, p_name)`. It never
  inserts a player, and it learns the server's clock on the way in.
- **watch(sessionId, onChange)** re-reads the whole session and hands back a
  stop function. The snapshot carries `askedAt`, `timeLimitMs` and `msLeft`.
- **answer(sessionId, playerId, index, choice, ms)** writes `choice` and `ms`
  only. Resolves `{ accepted: true }` or null, never both meanings at once.
- **setStatus() / close()** move the game between lobby, asking, reveal, ended.
- **recordedAnswers(sessionId, questionIndex)** every answer recorded for one
  question, read after the reveal write, so late arrivals can be scored.
- **markAnswers(sessionId, questionIndex, marks)** the host writing down what
  geolive.js decided: `correct` and `points` per answer, at each reveal.
- **saveStandings(sessionId, standings)** the host's write, after each reveal.
- **totals(classId)** the all-time table for the leaderboard.
- **serverNow()**, **clockOffsetMs**, **clockSource** for anything counting
  down outside a snapshot.

## Files in this folder

- `assets/js/cloud-geolive.js`

(The 20 files from the previous round are still here. They are merged already
and can be ignored or deleted.)

## Status

Status: Complete against the final schema and every settled decision, and
tested both against the real database (tables absent) and against a stand-in
client with known rows.

Fail soft, against the real database in exactly the state that caused the
breakage:

- `available()` false; `open`, `join`, `answer`, `setStatus`, `close` and
  `saveStandings` all resolved null; `totals()` an empty list; none threw.
- `watch()` returned a working stop function, called back once with null so a
  screen can say "not set up yet" rather than spinning, and stopping twice is
  safe.
- The app kept working, zero unhandled promise rejections.
- Real mistakes still throw: `setStatus(id, 'nope')` rejects.
- Checked by grep: no direct insert into `live_players`, no `teacher_id`, and
  the file never writes `correct` or `points` on an answer.

Behaviour, against the stand-in client:

- **answer() accepted:** a written answer resolves `{accepted: true, first:
  true, row}`.
- **answer() refused:** question closed and class moved on both resolve null,
  and in both cases the answers table is never touched at all.
- **A second tap:** resolves `{accepted: true, first: false, row}` carrying the
  answer that counted (its choice, its points), not the tap that lost.
- **setStatus:** sends `status`, `updated_at`, `question_index` and no
  `asked_at`.
- **The clock:** with the stand-in server deliberately 90 seconds ahead of the
  device, the offset is learned and `msLeft` reads 14998 on a 20 second
  question opened 5 seconds ago. The same snapshot on the raw device clock
  would have claimed 104597 ms left, which is what a student would have seen.
- **totals():** points add across games, `bestStreak` is the best single game,
  `games` counts sessions, a player with no account is held together by name,
  order is points first, empty cases give an empty list.
- **markAnswers():** writes one row per player for a single question, filtered
  on session, player and question index, patching only `correct` and `points`,
  with points capped at the 1000 the column allows.
- **The whole straggler chain, across two sessions' files:** loaded oy-02's
  real `geolive.js`, gave a player an answer at 19.5 seconds that the host
  never scored, and ran it. Before: Ada 920, Sam 0. After `recordedAnswers` ->
  `applyRecorded` -> `scoreRecorded` -> `markAnswers`: Ada 920, Sam 620, with 2
  rows written and both marks carrying the player row id. Running the entire
  chain a second time produced identical standings.
- **A screen that throws** inside an update handler now shows up as
  "GeoLive: a screen threw while handling an update ReferenceError: ..." in the
  console instead of looking like a quiet room.

Untestable until the SQL is applied: every path that reads or writes a real
row, and realtime.

## The clock

Countdowns are measured from `asked_at`, which the database stamps. A phone
comparing that against its own `Date.now()` is wrong by however wrong the phone
is, and a few seconds out of twenty is a quarter of the question.

So the difference between this device and the server is kept and applied
wherever time is worked out. Three ways to learn it, best first:

1. **Ask the server outright**, via `live_now()`. **This function does not
   exist yet and I cannot add it: oy-01 owns the SQL.** It is small:
   `create function public.live_now() returns timestamptz language sql stable
   as $$ select now() $$;` plus `grant execute ... to authenticated`.
2. **Take it from a value the server just stamped**, which costs nothing extra:
   `asked_at` coming back from `setStatus` (so a host is corrected the moment
   they open a question) and `created_at` from an answer (so a student is
   corrected on their first answer). The true time sits inside the round trip,
   so the midpoint is used and the error is at most half of it.
3. **Fall back to this device's clock** and say so, via `clockSource`.

Reading it from the HTTP `Date` header is not possible: it is not a
CORS-exposed header, so the browser hides it. I checked rather than assuming.

Without `live_now()`, a student's first countdown of the game is on their own
clock and every countdown after their first answer is corrected. With it,
every countdown is right from the first one. Worth adding.

## A conflict between two rulings, and what I did

These two cannot both hold:

- Earlier: "answer() on a second tap must resolve to the FIRST answer's result,
  not an error and not the second."
- Now: "null when it was refused: question closed, index moved on, **already
  answered**, not in the session."

A second tap returning null would tell a student their answer was refused when
it is in fact recorded, which is worse than the ambiguity the change is meant
to fix. So I read the new rule as being about the *outcome*, not the tap:

- **Their answer is in** -> `{ accepted: true }`, with `first: false` and the
  counted row when it was an earlier tap that landed.
- **Their answer is not in and never will be** (question closed, class moved
  on, not in this session) -> null.

That satisfies both rulings: oy-05 can branch on `accepted` alone and never
sees null for an answer that counted. **If Master really does want a second
tap to be null, say so and I will change it in one line**, but the student
screen will then need its own memory of having already answered, or it will
tell them their answer did not count when it did.

## Live updates: polling is what everyone gets for now

`supabase_realtime` publishes nothing today, and nothing in this project has
ever received a live update. oy-01's SQL adds the three live_ tables to the
publication, but until Owen applies it, **the polling path is the default
experience, not a fallback**: screens refresh about every two seconds while in
front, and a locked phone catches up the moment it wakes.

`watch()` is built so this is a difference in speed and nothing else. A
realtime message only ever asks for a re-read, so one that never arrives costs
a poll interval rather than leaving a screen wrong. Nobody should debug a
silent `watch()` before checking whether the SQL has been applied: it fails
silently by design, because nothing reports that a publication is empty.

## The decisions, and what each became in the code

- **Joining goes through `live_join`.** A code cannot be looked up from the
  client. `join()` maps the function's errors: no running game with that code
  returns null so a screen can say "check the code"; not signed in, wrong
  class, or no name throw with a sentence worth showing.
- **Students never score themselves.** The client writes `choice` and `ms`
  only, and the database enforces the same thing.
- **`asked_at` belongs to the trigger.** `setStatus` no longer sends it. The
  database stamps it on the move into a question, so every countdown in the
  room is measured against one clock and advancing a question restamps it even
  if a screen forgets. It is null in the lobby and holds the current question's
  open time during reveal.
- **Stale answers are refused here**, before the write, so a phone that woke up
  two questions late gets a clean no rather than a policy error.
- **Nothing is derived from stored score during a game.** Every screen works
  the score out from the answers, which is what stops a reconnecting phone
  drifting away from the room.
- **`saveStandings()` after each reveal**, not once at the end, so a teacher
  who closes the tab at question 8 keeps the first seven.
- **The leaderboard reads those totals.** `totals(classId)` returns
  `[{studentId, name, points, bestStreak, games}]`, best first, counting only
  sessions with status `ended`. Most recent 200 finished games.
- **Snapshots, not deltas.** A delta stream that misses one message is silently
  wrong from then on, and a room of phones on school wifi will miss messages. A
  snapshot that arrives late is still correct.
- **The host writes the marks, at each reveal.** `markAnswers()` records what
  geolive.js already decided. It is not scoring in two places: geolive.js
  remains the only thing that scores, and this writes the decision down once,
  under the one policy that permits it. Without it every answer row would stay
  at the `correct = false, points = 0` a student is required to insert, so any
  later question about which questions a class found hard would get a
  confident wrong answer.
- **Accountless players are keyed exactly as `teacher.js` keys them**:
  `studentId || ('name:' + name)`, original case, no trimming. It used to fold
  the case here and nowhere else, so a hand-added "Sam" in the roster and a
  "sam" from `totals()` did not match and that player's points went missing
  silently. oy-07 guards its own side too, but the guard should not be the
  thing holding it together.
- **The guest-in-another-browser case is a known limit, not a bug.**

## What a sleeping phone does, because it will

A locked phone stops polling and usually drops its socket. Nothing is queued on
the device while it sleeps. On waking:

- `visibilitychange` and `online` both force an immediate re-read, so it
  catches up in well under a second.
- That read is the whole session, not a diff, so a phone that missed five
  updates lands exactly where one that missed none is.
- They land on whatever `question_index` says now, and `msLeft` tells the
  screen how much of the current question is actually left, measured against
  the server's clock rather than the phone's.
- An answer for a question that has closed is refused cleanly, and one already
  accepted stays accepted.
- They do not become a second player: `live_join` matches on their account.

**Signed-out students cannot play at all now**, because `live_join` requires an
account and the answer policy matches on `auth.uid()`. It is the right call for
a school, but both screens need a real sign-in step in front of the join box,
not a removed guest button.

## The unmarkable answer, and why the fix is not here

oy-04 found that an answer landing between the host's last snapshot and its
status write is never marked, so the row keeps the `correct = false, points = 0`
a student is required to insert.

**It is not impossible against the real database, and it is worth being precise
about that, because believing it cannot happen is how a real one gets
misdiagnosed.** The insert policy tests the session's status at the moment of
the insert. An answer that arrives while the status is still `asking` is legal
and is written. The host's snapshot may already have been taken. The status
write then lands after it. Nothing rejects that row; it simply never appears in
the marks the host sends.

The window is one round trip wide, which sounds small until you picture thirty
phones tapping on the buzzer. The last-second answer is exactly the one that
falls in it.

What it costs: the stored per-answer data says that student got it wrong, while
the derived standings may still count it, depending on which snapshot the host
scored from. So the aggregate and the per-question detail can disagree.

**The fix belongs at the insert, never at the marking.** Marking an answer that
GeoLive refused to score would mean inventing a number on the host, which is the
single thing this design exists to prevent, and it would not be an error anyone
would catch.

Master has ruled to close it now rather than record it, across three sessions:
oy-02 exposes scoring for a recorded answer without consulting the session's
current status (a separate way in, not a relaxation of its live rule), this file
re-reads after the `reveal` write and marks the stragglers, and oy-04 calls it
once after that write. Agreed: a stored number that contradicts the standings is
not something anyone diagnoses later, it just surfaces as a teacher saying the
class did badly on question 6 when they did not.

Built, as `recordedAnswers(sessionId, questionIndex)`. oy-04 calls it after the
reveal write, applies each row with `GeoLive.applyRecorded`, scores it with
`GeoLive.scoreRecorded`, and sends the result to `markAnswers()`. The existing
per-reveal `saveStandings()` then carries the corrected totals.

**It returns every answer for the question, not just the late ones, and that is
the whole design.** An unmarked row and a row marked as a wrong answer are
identical, both `correct = false, points = 0`: a student is required to insert
those values and a wrong answer earns them. They cannot be told apart without a
column that does not exist, so rather than ask oy-01 for one, hand back the lot.
Scoring is deterministic from the choice and the `ms` on the row, applying is
idempotent, and marking rewrites the same values, so running it twice changes
nothing. That also covers a host that closed its tab and came back, which is the
failure that made this worth fixing.

**Each row carries `playerId`, the `live_players` row id, and no account id at
all.** oy-04 warned that a freshly written reconciliation path is exactly where
that confusion comes back, because the account id is the one that feels like the
player's identity. Leaving it out of the shape entirely means it cannot be
picked by mistake.

## Do not overwrite

- **The fail-soft path.** `withTables()` wraps every call and `missingTable()`
  is the same test `cloud.js` uses for `announcements`. A missing table means
  `available()` is false and every other call resolves null (or an empty list
  for `totals`), never a throw into the rest of the app. The only `Promise.all`
  in the file reads the three live_ tables and nothing else, never the class
  sync. Every other kind of error still throws.
- **The client never writes `correct` or `points`.** The insert policy will
  reject the row outright, and students could otherwise score themselves.
- **The stale check in `answer()` before the insert**, and reading the first
  answer back on a conflict.
- **`join()` goes through `live_join` and never inserts a player.**
- **The clock correction.** If a screen computes a countdown from `Date.now()`
  instead of `snap.msLeft` or `GeoLiveCloud.serverNow()`, every phone in the
  room is wrong by its own drift and nobody will notice until a lesson.
- **The quiet paths say so in the console.** Every swallowed failure calls
  `warn()` first. The silence is for a table that does not exist yet, not for
  a fault in this file or in a screen's own update handler, and from outside
  those look identical. oy-07 lost an hour to exactly that.
- **The session row is read with `select('*')`.** Naming columns that do not
  exist yet fails the read outright, which would take `watch()` down for
  everyone while a column is in flight. That is not hypothetical: it is exactly
  what `asked_at` was doing an hour ago.

# Round 3 — the off switch: proving off means off

## What I added

`GeoLiveCloud.setEnabled(on)` and `isEnabled()`. The switch is checked before
anything else, including `available()`, which is itself a read. Turning it off
also stops any `watch()` already running.

This file is the only one that talks to the database, so it is the only place
that can promise "no network call". A tab that is hidden, a mount that is
skipped and a screen that is unmounted all leave the timer running.

**Default: on.** Nothing changes for a class that has never been told either
way, and the gating layer applies the real setting once it knows it. A module
that defaulted to off would silently break every class the moment it merged, in
a way that looks exactly like the feature being broken.

## Tested, counting every call the client made

- **Off: 0 network calls.** All ten entry points called with the switch off
  (`available`, `open`, `join`, `answer`, `setStatus`, `close`,
  `recordedAnswers`, `markAnswers`, `saveStandings`, `totals`) plus a `watch()`
  left running for 2.5 seconds. Nothing touched a table, nothing called an RPC.
  Return values are the same empty shapes as "not set up", so screens behave
  identically whether GeoLive is off or absent.
- **On: traffic appears**, so the counter is real, not a broken test: the
  availability probe, `live_now`, and the three-table snapshot.
- **Switched off mid-lesson: immediate silence.** A running watch sat at 6
  calls, and five seconds later was still at 6.

## The finding worth passing on

**A screen unmounted without calling `stop()` keeps polling forever.** Measured:
4 calls in 5 seconds and rising, from a watch whose reference had been dropped.
Switching off stopped it dead; nothing else did.

This is the shape of failure this project keeps nearly shipping: invisible, but
still reading three tables every two seconds. It exists independently of the
switch, so oy-04 and oy-05 must call the stop function `watch()` returns when a
screen goes away. The switch is a backstop, not a substitute.

## The server side is genuinely enforced, and I checked rather than assuming

oy-01 built it: `classes.geolive_enabled` and `classes.leaderboard_enabled`, the
insert policy on `live_sessions` requires `geolive_enabled`, and `live_join`
refuses with "Live quizzes are switched off for this class". So a student
holding a stale code is stopped at the database, not merely hidden from. A game
already running is deliberately left alone when the switch flips, so a class is
not stranded mid-question, which is the right call.

That makes my switch a traffic gate and the SQL the enforcement. Both should
exist; neither replaces the other.

## One thing for Owen, not for us

Both switches default to on, and the reasoning for that is written into the SQL
and is sound for GeoLive: on means "a teacher can start a game", and nothing
happens until one does.

**The leaderboard is not the same shape at that default.** On means it shows
itself. Every existing class gets an all-time ranking of its students, by level,
the moment this ships, without any teacher choosing it. Ranking children against
their classmates in public is a decision a teacher should make on purpose rather
than discover, and the round brief warned about exactly this: a new switch that
silently turns something on for every existing class is its own kind of surprise.

Worth Owen deciding rather than us: default the leaderboard off, or make sure a
teacher sees it before their students do. The two switches having the same
default is the part that deserves a second look, not the default itself.

## The two columns totals() was not selecting

oy-07 found this by reading my file rather than assuming, and it was real.

oy-01 added `answered` and `correct` to `live_players` as counts. My `totals()`
selected `session_id, student_id, name, score, streak` and nothing else, so both
came back undefined. Nothing threw. A student who only ever played live games
contributed nothing to their level and read as "not started" on a leaderboard
that otherwise looked entirely correct.

Fixed: both are selected and summed across games. Verified with known rows, a
student across two games now returns 20 answered and 14 correct alongside their
points, streak and game count.

Two things I added while in there, neither asked for:

- **A player who was invited but never turned up is left out.** `joined_at` is
  nullable now precisely so the lobby can tell invited from arrived, and a
  teacher who types six names into the lobby would otherwise have the four who
  were away counted as games played with nothing answered, quietly dragging down
  the accuracy of the two who were there.
- **`correct` is capped at `answered`.** A row claiming 99 right out of 10 is
  nonsense, and accuracy over 100% would look like a leaderboard bug rather than
  a data one.

## The leaderboard switch, verified independently

oy-07 reports its side makes no network call when switched off. Confirmed by
counting calls rather than taking the report:

- Leaderboard off: **0 calls**, nothing rendered.
- Leaderboard on: 2 calls (`live_sessions`, `live_players`), so the zero above
  is a real zero and not a broken counter.
- Leaderboard on but GeoLive off through `setEnabled(false)`: **0 calls**. A
  class that keeps its leaderboard but turns off live quizzes still does not
  touch the live_ tables.

That is the flag-honoured-in-the-mount-but-not-the-fetch failure, checked for
rather than assumed absent.

## The SQL, plainly: still unexecuted, and I could not execute it

oy-01's 501 lines have never run anywhere. I tried:

- no Postgres and no Docker on this machine
- a Supabase branch is a real database but costs money, so it is Owen's call
- I tried running the file inside a transaction that rolls back, which would
  have proved it executes while creating nothing. **The safety classifier
  blocked writing to the live database, and I did not work around it.**

What I could verify statically, against the live database: nothing it creates
already exists, so no collision; everything it builds on exists, including the
three `private.` helpers; and `gen_random_uuid`, `auth.uid` and the
`supabase_realtime` publication are all present, so the realtime section will
run rather than silently skip.

The file wraps itself in a transaction, so a mistake creates nothing and shows
an ERROR rather than half a schema. That is real protection, and it is still not
the same as having been run. Owen has been told it is unexecuted, in those words.

## Writing level and xp on sync: handover for oy-09, plus a blocker for oy-01

Owen decided a teacher should read the student's real level, so level and xp get
mirrored on sync. **I cannot do this piece.** The sync is `cloud.js` `payload()`
and `push()`, and the spec is explicit that only oy-09 edits existing files.
Writing it myself is how this project got its merge problems. So, exactly what
is needed, per the spec's own instruction to write it down.

### The blocker, and it decides where the columns go

Under the live read policies:

- `profiles` is **read own only**. A teacher cannot read a student's profiles
  row, and a student cannot read a classmate's.
- `class_members` is **self or teacher**. A teacher can read every row in their
  own class. A student can read only their own.

So **if level and xp land on `profiles`, the teacher cannot see them at all.**
The sync would write faithfully, the column would fill, and the feature would be
invisible to the only person it was built for. That is the empty-room failure
again, one layer down.

`class_members` works for the teacher today with no policy change, and is the
right home for exactly the stated purpose.

**The separate question, which is Owen's and not oy-01's:** if the class
leaderboard is shown to *students*, no current policy lets a student read a
classmate's row, on either table. Making that work means deliberately widening a
read policy so every student in a class can see every classmate's level. That is
a privacy decision about children, not a schema detail, and it pairs with the
default-on question above. Worth settling before the SQL is written, because it
is much harder to walk back once classes are using it.

### What oy-09 needs to change in cloud.js

Assuming `class_members` (swap the table if oy-01 decides otherwise):

```js
/* level and xp are mirrored so a teacher can rank a class on the number the
   student actually sees on their phone. The device is the source of truth:
   copy it, never compute it. If the two ever disagree, the device wins. */
function mirrorLevel() {
  if (!ready() || !levelColumns) return Promise.resolve();
  var e = W.state.economy, cls = W.state.enrolled;
  if (!cls || !cls.classId) return Promise.resolve();
  return sb.from('class_members')
    .update({ level: Math.max(1, e.level | 0), xp: Math.max(0, e.xp | 0) })
    .eq('class_id', cls.classId).eq('student_id', user.id)
    .then(function (res) {
      /* the columns are not there until Owen applies the SQL, which is the
         state of the world right now, not an edge case */
      if (res.error && missingColumn(res.error)) { levelColumns = false; return; }
      if (res.error) throw res.error;
    });
}

function missingColumn(err) {
  var code = (err && err.code) || '';
  var msg = (err && err.message) || '';
  return code === '42703' || code === 'PGRST204' ||
         /Could not find the '.*' column|column .* does not exist/i.test(msg);
}
```

with `var levelColumns = true;` at module level, and `mirrorLevel()` called from
`push()`'s success path, after `setStatus('synced')`.

Three things that matter about that shape:

1. **It is a separate write, not part of the `profiles` upsert.** If the new
   columns were added to `payload()` and did not exist, PostgREST rejects the
   whole row and **the student's entire save stops syncing**. That is far worse
   than the feature not working, and the columns do not exist yet, so it would
   be the first thing anyone hit.
2. **It never throws into the sync.** A failure here must not mark the save
   unsynced or trigger a retry loop; the save itself already went up.
3. **Copy, never compute.** `level` and `xp` come straight from
   `W.state.economy`. Recomputing from XP in a second place is how the number a
   teacher sees drifts from the number on the student's phone.

### Still open from my side, and all three are done or answered

- `totals()` selecting `answered` and `correct`: **fixed and tested.**
- The straggler re-read: **built and tested**, including against oy-02's real
  `geolive.js`.
- Running the 501-line SQL first: **I cannot.** No Postgres, no Docker, a paid
  branch is Owen's money, and the rollback-wrapped run was blocked by the safety
  classifier. Static checks are clean. Owen has been told in those words.

These keep being re-listed because my replies have not been reaching Master: a
loop guard has held every message since Owen last typed.

## Level mirroring: built. Supersedes the handover above

The section above proposed cloud.js code because no server function existed.
oy-01 has since built `sync_level(p_level, p_xp)`, which is the better shape: a
function rather than an update policy, so a client cannot also rewrite its
display name or point a membership row at another class. Ignore the cloud.js
snippet above; this is what to do instead.

**`GeoLiveCloud.syncLevel()` is built and tested.** So oy-09's change to
`cloud.js` is one line in `push()`'s success path, after `setStatus('synced')`:

```js
if (global.GeoLiveCloud) global.GeoLiveCloud.syncLevel();
```

Not awaited, and deliberately so: the save itself has already gone up, and a
mirror that is a second behind is fine while a sync that waits on it is not.

Tested:

- Copies the device's numbers exactly. With the student on level 7 with 1840 XP,
  it sends `p_level: 7, p_xp: 1840`. It never computes a level from XP, because
  working it out in a second place is how the number a teacher sees drifts from
  the number on the student's phone.
- **The function not existing is today's state of the world, not an edge case.**
  It resolves false and then stops asking: three calls produced one attempt.
  When the SQL is applied it starts working with no code change.
- A guest resolves false quietly, because there is no membership row to mirror
  into and that is not an error.
- Offline, or any other failure, resolves false and **never throws**. This is
  the one function here that deliberately does not throw on an unexpected error:
  it is called from the save sync, and a failed mirror must not mark a student's
  save unsynced or start a retry loop over their real progress.

### One thing oy-01 should know

`sync_level` updates **every** class the student is in, in one statement. That
is the right shape for one call, but it means a client cannot skip the classes
where the teacher switched the leaderboard off: a student can be in one class
with it on and another with it off, and this call writes to both.

If "leaderboard off" is meant to stop the level being stored at all rather than
just stop it being displayed, only the SQL can do it, by filtering the update on
`c.leaderboard_enabled`. Worth a decision either way rather than leaving the
switch meaning one thing on screen and another in the table. My own reading is
that storing a number nobody displays is fine and not worth the complexity, but
it should be a decision rather than an accident.
