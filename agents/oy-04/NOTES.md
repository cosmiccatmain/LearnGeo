# NOTES for LearnGeo 4 OY

Round: GeoLive. Last round's copies were removed from this folder: they were
reference copies of files already landed in main, and an Organizer could
reasonably mistake them for new work. Recoverable with `git show 43b5d2d:<path>`.

## Built on

Commit: 43b5d2d, which was `origin/main` when the round started. Main has since
moved to aa0ca26. Nothing here conflicts: the only file I wrote is new and
nobody else owns it.

Written against the spec including "Settled after oy-02 built the rules" and
"Integration decisions". Everything in both that touches this screen is
implemented and tested, not just read.

## What I changed

- New file, `assets/js/geolive-teacher.js`: the teacher's screen for GeoLive.
  Six screens in order. Who is playing, then what gets asked, then the join
  code, then the question, then the reveal, then a podium.

  The roster screen is the one Owen asked for by name. It shows the whole
  class. Students without an account are greyed out, unselectable, and say
  why: "Has not joined with the class code yet". Only students in `members`
  can be picked and only their account ids go to the room. Everyone and
  Nobody are one click each and only ever touch students who can play, and
  everyone who can play starts selected, so the common case is one click from
  the join code.

  The join code is set in large type with every invited student listed and
  the ones who have arrived lit up, so a teacher can see who to call out for.
  During a question the screen shows a countdown and how many have answered,
  and no scores at all: standings appear at the reveal, which is also the only
  time they are redrawn.

## Files in this folder

- `assets/js/geolive-teacher.js`
- `assets/js/class-features.js` — new this round, the teacher's two switches

`GeoLiveTeacher.mount(el, { classId, roster, members })` and
`GeoLiveTeacher.unmount()`, plus read-only `stage` and `session` getters for
oy-10's tests.

## Status

Status: complete, and driven end to end in a browser rather than only read
back. The harness stands in for GeoLive, GeoLiveCloud and GeoLiveQuestions and
follows the settled contract, including the snapshot model.

What was actually run and checked:

- 12 students in the roster, 3 without accounts. All 12 shown, 3 greyed with
  the reason, 9 selectable, counter reads "9 of 9 can play".
- The mount adds `gl gl--teacher` to a bare div itself.
- Room opened with 9 account ids and no blanks.
- A room whose `open()` never reports the limit and whose snapshot carries
  30000: the clock shows 30, the session is rebuilt in the lobby to match, and
  an answer at 3s scores 960, which is 600 + 400 × 27/30. Clock and scoring
  agree on the room's number, not on a number in this file.
- A second answer row from the same player, and a row for a different
  `question_index`, both leave "answered" untouched.
- Ten questions, auto-reveal when the last student answers, podium at the end.
- `saveStandings` called 11 times for a 10 question game: once per reveal and
  once at the end. `markAnswers` called 10 times, once per question, indexes 0
  to 9, every mark carrying a string playerId, a boolean correct and a numeric
  points. A correct answer at 1s of a 20s limit marked 980, which is
  600 + 400 × 19/20; a wrong answer marked false and 0; a student who never
  answered is not in the list, because they have no row to mark.
- The standings board across two reveals: identical DOM order, the very same
  row elements, and rank carried only by `--gl-i`. A player pushed from last
  to second by one fast answer went from `--gl-i: 8` to `--gl-i: 1` with the
  markup order untouched, and the row animated under a transform transition
  rather than being re-created.
- Fail-soft four ways: `available()` false, `available()` rejecting,
  GeoLiveCloud missing, GeoLive missing. Nothing throws, the first three put a
  plain warning on the first screen, no console errors anywhere.

## Two things found by reading oy-01's SQL and oy-03's client

**A player's id inside the game is the `live_players` row id, not the account
id.** An answer row's `player_id` is the row id, `markAnswers` filters on
`.eq('player_id', ...)` with it, and `saveStandings` updates
`.eq('id', p.id)` with it. `open()` takes account ids, because `seatRoster`
maps them, and the row ids come back in the first snapshot. So the game is
built from the snapshot's player rows, not from the account ids the roster
screen collected.

Building it from account ids fails silently and completely: GeoLive refuses
every answer as coming from a player it does not know, so nobody scores;
`markAnswers` matches no rows; `saveStandings` updates no rows. No error
anywhere, an empty leaderboard, and a class watching a scoreboard of zeros.
Worth flagging to oy-05: `join()` hands a student their row id, which is right
for writing an answer, and anything scoring locally has to use the same id.

Verified against stubs that copy oy-03's shapes: 90 answer rows marked over a
9 player, 10 question game, and 9 of 9 standings rows matched by id.

**Nothing in the room says who has actually arrived.** `seatRoster` inserts a
row for every invited student the moment the game opens, `joined_at` defaults
to `now()` at that insert, and `live_join` upserts on
`(session_id, student_id)` and only updates the name. So a row proves a student
was invited, not that they are holding a phone.

That breaks the part Owen asked for by name. This screen therefore does not
pretend: with no way to tell seated from arrived it shows the invited names
unlit and says "Waiting for the class" rather than lighting up a room that has
not opened the game yet. Telling a teacher everyone is here when nobody is
would be worse than telling them nothing, because they would start.

The smallest fix is oy-01's: make `joined_at` nullable with no default and set
it in `live_join`'s upsert, leaving `seatRoster`'s inserts null. Then arrived
is `joined_at is not null`. I tested my side against exactly that: before
anyone joins it reads "0 of 9 here" with Start disabled, and as three students
join their names light and it reads "3 of 9 here". An explicit `joined` or
`present` boolean works too; this screen reads either.

## Fixed from oy-10's review, and one found while fixing them

- **A short question set is now said out loud.** Asking for 20 and getting 12
  used to pass silently, because only an empty set was checked. The teacher is
  told before the room opens, with the real number.
- **Picked countries are resolved before the game starts**, through
  `GeoLiveQuestions.resolveCodes`, and anything that does not match is named in
  a toast. If none of them match, the room does not open at all. A teacher who
  picked three countries and silently got a world quiz has been handed a
  different lesson, not a fallback.
- **A missing `WW` no longer kills the file at load.** Helpers and icons are
  read through fallbacks, and looked up when called rather than captured at
  load, so this file does not quietly depend on having been loaded after
  core.js either. Checked by loading the file with no `WW` at all:
  `GeoLiveTeacher` is still defined. A module that throws at load leaves no
  screen and nothing pointing at why.
- **Found while testing the above: picking countries never re-enabled the
  Open button.** The country list is deliberately not redrawn on every tap,
  since 213 buttons would flicker and the list would jump back to the top, but
  that left the button, the note and the "N chosen" label frozen at whatever
  the last redraw said. A teacher picking four countries would have sat in
  front of a class with a greyed-out button. The three things that depend on
  the count are patched on each tap now, the same way the roster screen does
  it. Verified: disabled after picks one to three, enabled from the fourth.

## Round 3: the off switch

`assets/js/class-features.js`, `ClassFeatures`. Two switches, GeoLive and the
class leaderboard, because a teacher who wants a class quiz without a public
ranking is a real case and so is the reverse.

### Defaults, decided and why

- **GeoLive: on.** Nothing happens until a teacher deliberately opens a room,
  so an unused switch costs a class nothing, and a teacher going to look for
  the feature should find it rather than a setting they must know about first.
- **Class leaderboard: off.** It shows every student their place in front of
  everyone else. That is a decision about a classroom, not a feature
  preference, and turning it on for every existing class because a new switch
  appeared is the surprise the round was told to avoid. One tap turns it on; a
  teacher who would not have wanted it never discovers it was already on.

### Off means off

`GeoLiveTeacher.mount` now refuses before it does anything, if
`ClassFeatures.on('geolive', classId)` is false: no probe, no room, no
network at all. Verified by spying on every GeoLiveCloud method: with the
switch off, a mount makes zero calls and shows a line saying the feature is
off. oy-09 still owns removing the tab; this is the backstop, because a
feature that is invisible and still reading rows is not off.

### What I need, precisely

**oy-01, the column.** Two booleans on the class, nullable with no default, so
"never set" stays distinguishable from "deliberately off". Unset means the
fallback above applies.

**oy-09, the read and write.** `ClassFeatures` looks for them in this order and
uses whichever it finds:

1. `Cloud.classFeatures` with `read(classId)` and `write(classId, patch)`
2. `global.ClassFeatureStore` with the same two methods

`read` resolves to `{geolive: bool, leaderboard: bool}`, any key missing
meaning not set. `write` takes a patch of just the keys that changed and
resolves when stored. If neither exists the switches render disabled and say
the class has to be online, rather than pretending to save.

`ClassFeatures.on(key, classId)` is **synchronous** on purpose, so a gate
cannot race a promise, and it errs towards the fallback rather than towards on.
`ClassFeatures.onChange(fn)` fires when a switch actually lands, so oy-09 can
re-gate a tab without polling.

### The switch moves when the store says so

Not when it is clicked. A switch that flips and then silently fails to save is
how a teacher ends up believing the leaderboard is off for their class when it
is not. Verified with a store that rejects: the switch stays where it was,
nothing is written, and a toast says it is unchanged.

For oy-06: `clf`, `clf__head`, `clf__h`, `clf__sub`, `clf__warn`, `clf-row`
(`is-on`), `clf-row__t`, `clf-switch` (`role="switch"`, `aria-checked`),
`clf-switch__dot`, `clf-switch__t`.

## Round 3: the lobby tells the truth now

oy-01's `joined_at` change is in its file, verified by reading it rather than
the summary: the column is `timestamptz` with no default and no not-null, with
`alter ... drop default` and `drop not null` for a database that already has
the old shape, and `live_join` sets `now()` on first arrival with a `coalesce`
so a phone waking up and rejoining does not count as arriving again. oy-03's
snapshot still selects the column and `seatRoster` still inserts without it, so
a seated row is null. All three ends line up, so arrived is
`joined_at is not null` and this screen can claim real presence.

**A bug I found re-reading my own code against that.** The check for "can the
room tell arrived from seated" asked the current rows for a null. Every seated
row starts null and fills in as students arrive, so when the last student
joined there would be no null left to see, the screen would decide it could no
longer tell, and the lobby would fall back to "waiting" at exactly the moment
the room finished filling. The display would go backwards in front of a class.

It is sticky now: remembered from the first snapshot that proves it, which at
the start of a game is the first one, since nobody has joined yet. Verified
across the full range: "0 of 9 here" with Start disabled, "3 of 9 here" as
three arrive, "9 of 9 here" with nine chips lit and Start enabled when the room
fills. The honest fallback still holds on a database without the change:
"Waiting for the class", no chip claims presence, and Start left to the teacher.

## Round 3: also done

- **How long to answer.** The teacher picks 10, 20 or 30 seconds before opening
  the room, and it is sent as `open()`'s fourth argument. The room clamps and
  stores it, and what comes back is what the game runs on, so the clock and the
  speed bonus cannot disagree. Verified: 30s chosen, 30000 sent, session limit
  30000, an answer at 1.5s scoring 980, which is 600 + 400 × 28.5/30.
- **The straggler, caught without waiting.** A row for the question just closed
  that no mark covers is applied with `GeoLive.applyRecorded`, which credits the
  player and rebuilds streaks from what is recorded, then the marks and the
  totals both go out again. Caught off the snapshot this screen already
  receives. oy-03's deliberate re-read is still worth having for when no
  further snapshot arrives, and running both is harmless because the second
  call reports `applied: false` and changes nothing. Verified: a late answer
  after the reveal took a player from 0 to 980 and produced a second
  `markAnswers` call carrying both marks.

## Round 4, all measured 2026-09-12

**The message that lied to aj is gone.** "A live game needs the class to be
online" was an inference presented as a diagnosis, and a teacher acted on it by
checking his internet. Both places that guessed a cause now say only what is
known:

- The room fails to open: "The room did not open. Nothing was started, and this
  is not something you did." plus the actual error text when there is one, so it
  can be passed to whoever can fix it.
- The availability banner: "The live quiz is not available for this class yet,
  so nothing here will start a game." It no longer tells anyone to sign in,
  because a false `available()` means the tables are missing, not that the
  teacher is signed out.

**The reason survives the catch now.** `cloud()` still resolves null so nothing
crashes, but every failure is logged as `[GeoLive] <method> failed: <detail>`
and kept, so the message can quote it and a future hour is not spent guessing.
Verified against the exact error aj hit: with `open()` rejecting with
"infinite recursion detected in policy for relation live_players", the console
carries that line and the toast quotes it without naming a cause. Only a
failure from the current attempt is ever quoted, so a stale one cannot be
reported as the reason for something new.

**Opening with nobody there works, and was checked rather than assumed.**

- A teacher with an empty class list gets the empty state *and* a Next button,
  and the lobby reads "Nobody on the list yet. Anyone in the class can join
  with the code above."
- Start is enabled as soon as a room exists. It used to wait for somebody to
  arrive, which is backwards: opening before the class walks in is the normal
  case, and the teacher can see the room while this screen cannot.
- A game builds with zero seated players rather than refusing.
- Anyone arriving after the start is seated with `GeoLive.addPlayer` rather
  than having every answer silently refused. Verified: started at "0 of 0
  answered", a student joined mid-game, answered, and scored 960.

**Layout, measured against oy-06's stylesheet at 08:35.** The teacher screen
renders 55 `gl*` names and 51 have rules; the two that looked missing are built
by concatenation (`gl-opt--0` to `gl-opt--3`) and do exist. This file has zero
inline styles and one root carrying `gl gl--teacher`, with every screen a flat
child of it, so nothing in the markup forces content into a corner.
`.gl--teacher` currently centres vertically with `justify-content: center` but
sets no horizontal bound, so the horizontal half of "bigger and centered" is a
`max-width` plus `margin-inline: auto` on that container, which is oy-06's to
add. Reported rather than worked around, and no stylesheet was touched.

## The tie-break is on screen, measured 2026-09-12

Under the standings and under the podium: "Level on points? Whoever got more
right is first, then whoever was quicker, then whoever joined the game first."

The order itself is oy-02's and this screen only renders it. The reason for
saying it out loud is that a fixed arbitrary order looks like a broken one to
anyone who cannot explain it, and the person being asked is a teacher standing
in front of the student who came second. Verified with three students dead
level on 960, rendered in join order, seats 0, 1 and 2, with the line beneath
them.

It uses `gl__note`, which is already in oy-06's vocabulary. No new class name
was invented for it.

## Do not overwrite

- **The seat key.** Rows are tracked by `seat`, never by account id, because
  `people()` returns an empty id for every hand-typed student and two of those
  would collapse into one row. Account ids ride alongside and only they reach
  `open()` and `create()`.

- **Everything is derived from the snapshot, never accumulated.** `watch()`
  sends the whole room each time: `{ status, index, timeLimitMs, askedAt,
  players, answers }`, and `answers` is every answer so far. The answered count
  is that list filtered to the current question and counted by distinct player,
  so a missed message or a retried tap cannot leave this screen quietly wrong.
  Rows are read as `player_id` or `playerId` and `question_index` or
  `questionIndex`, since the database columns are snake_case.

- **One deliberate difference from the instruction, flagged rather than
  hidden.** I filter answers on the index this screen is showing, not on
  `snap.index`. The room's index can lag a beat behind while the status write
  lands, and a count belonging to the previous question is worse on a projector
  than a count that arrives a moment late. If oy-03 would rather it followed
  `snap.index`, it is one line and I will change it.

- **There is no time-limit constant in this file, on purpose.** The session
  owns the number. The clock reads `timeLimitMs` off the snapshot, and shows a
  dot rather than a guess until the room has said what it is. If the room's
  limit turns out to differ from what GeoLive assumed, the session is rebuilt
  once, in the lobby, before any answer has been counted.

- **The standings board is built once and never rebuilt or reordered.**
  One row per player in the order the players were created, keyed by
  `data-player`. Rank goes out as `--gl-i` on the row, with `--gl-n` for the
  number of players and `--gl-max` for how many rows should be visible, and
  rows past that cut carry `is-below`. The same element is moved between
  screens rather than redrawn, which is what lets a row animate from third
  place to first instead of cutting there. Rewriting this as sorted innerHTML
  would make every row below a score change jump a full row height in one
  frame, on a screen that lives on a wall in front of a class.

- **`markAnswers` runs at every reveal, and the marks can only be taken at
  one moment.** A student inserts their answer row with `correct` false and
  `points` zero, because they are not allowed to grade themselves. GeoLive
  hands back the real values exactly once, the first time it counts that
  answer; a second call for the same answer is a refusal, not a rescore. So
  the mark is captured there, kept per question, and written at the reveal as
  `markAnswers(sessionId, index, [{playerId, correct, points}])`. Drop that
  capture and every answer row in the database reads as a wrong answer
  forever, and anyone asking later which questions a class found hard gets a
  confident wrong answer.

- **`saveStandings` runs at every reveal and once more at the end.** A teacher
  who closes the tab on question seven loses questions eight to ten, not the
  lesson.

- **Nothing here works until `0002_geolive.sql` is applied.** `supabase_realtime`
  publishes nothing today, so `watch()` will never fire and will report no
  error while it does not. Anyone testing against the real database and seeing
  an empty room should check that first.

## One edge oy-03 should know about

An answer row that lands between the last snapshot and the status write can
never be marked. GeoLive refuses to score a closed question, so there is no
mark to write, and that row keeps the `correct` false and `points` zero the
student inserted. I checked this rather than assuming it: pushing an answer
for a question that had just been revealed left it unmarked.

It should be impossible in the real system, because the insert policy requires
status `asking` and a matching `question_index`, and by then the status is
`reveal`. So if such rows ever show up, this is where they come from, and the
fix belongs at the insert rather than here. Marking an answer GeoLive has
refused to score would mean inventing a number on the host, which is the one
thing this design exists to prevent.

## Pending, deliberately not wired yet

The straggler reconciliation. An answer can insert legally while the question
is still open, a moment before this screen writes the reveal, so it is missing
from the marks sent with that reveal. oy-02's half has landed as
`GeoLive.scoreRecorded(session, index, choice, ms)`, which scores a recorded
row without consulting the session's status. oy-03's half is not in its file
yet, so nothing is wired here: LearnGeo Master asked me to wait for the call
signature rather than guess it, which is right.

One thing to settle before it is wired. `scoreRecorded` deliberately changes
nothing, so a straggler scored that way reaches `live_answers.points` but never
reaches the session, therefore never reaches `saveStandings`, therefore never
reaches `live_players.score`, which is what `ClassLeaderboard` sums. The answer
row would say 980 and the student's total would not include it. Closing that
needs a way to apply a recorded answer to the session, not just score it, so
the host's next `saveStandings` carries the corrected total.

## Still open, for oy-03

Answered: the columns are meant to be filled, and `markAnswers` is now called
at every reveal. Nothing else is outstanding from my side.

## What I need from oy-09, who owns the existing files

1. A tab or button in the teacher workspace that calls
   `GeoLiveTeacher.mount(el, { classId, roster, members })`, with `roster` from
   `people()` and `members` from `W.state.classroom.members`. A bare div is
   fine; this screen adds its own `gl gl--teacher`.
2. `GeoLiveTeacher.unmount()` on the way out of that tab. It clears the
   countdown and drops the room subscription. Skipping it leaves a timer
   running behind the rest of the app.
3. Script tags in `index.html`, in this order, after `ui.js` and before
   `portal.js`: `geolive.js`, `geolive-questions.js`, `cloud-geolive.js`,
   `geolive-teacher.js`, `geolive-student.js`. Plus the stylesheet line for
   `assets/css/geolive.css`.
4. Nothing else. This screen reads no app state, writes no localStorage, and
   never calls Supabase directly.

## For oy-06, who owns the CSS

`gl` and `gl--teacher` are on the container, added by the mount.

Inside it: `gl__steps`, `gl__step` (`is-now`, `is-done`), `gl__steps-note`,
`gl__head`, `gl__h` (`gl__h--mid`), `gl__sub` (`gl__sub--mid`), `gl__warn`,
`gl__bar`, `gl__count`, `gl__roster`, `gl-pick` (`is-on`, `is-out`),
`gl-pick__av`, `gl-pick__n` (holds a `small` with the reason on `is-out` rows),
`gl-pick__tick`, `gl__foot`, `gl__note`, `gl__empty`, `gl__sets`, `gl-set`
(`is-on`), `gl__picker`, `gl__regions`, `gl__countries`, `gl-country`
(`is-on`), `gl__none`, `gl__code`, `gl__joined`, `gl-joined` (`is-in`),
`gl-joined__av`, `gl-live`, `gl-live__top`, `gl-live__n`, `gl-live__clock`,
`gl-live__q`, `gl-live__opts`, `gl-opt` (`gl-opt--0` to `gl-opt--3`,
`is-right`, `is-dim`), `gl-opt__n`, `gl-live__foot`, `gl-live__answered`,
`gl-stand`, `gl-stand__row` (carries `data-player`), `gl-stand__pl`,
`gl-stand__n`, `gl-stand__streak`, `gl-stand__s`, `gl-end`, `gl-podium`,
`gl-podium__col` (`--1`, `--2`, `--3`), `gl-podium__av`, `gl-podium__n`,
`gl-podium__s`, `gl-podium__pl`.

### The standings board is a contract, not just class names

The board hands you three custom properties and expects position to come from
them, because the DOM order is deliberately not rank order:

- `--gl-n` on `.gl-stand`: how many players there are.
- `--gl-max` on `.gl-stand`: how many rows should be visible. Six at a reveal,
  everyone at the end.
- `--gl-i` on each `.gl-stand__row`: that player's current place, zero based.
- `is-below` on rows past the cut.

So a row's position is `--gl-i`, not its position in the markup. Something
like a relatively positioned `.gl-stand` of `calc(var(--gl-max) * row height)`
with absolutely positioned rows at `translateY(calc(var(--gl-i) * row height))`
and a transition on `transform`. That is what I used to test it and a row
moving from ninth to second slid rather than jumped.

Three more things the styling has to hold up, all because this screen is on a
wall at the front of a room: `is-out` rows must read as unavailable rather
than merely faint, since they are the answer to "where did the rest of my
class go"; standings rows want a fixed height and tabular numerals; and the
four answer tiles want their own colours in a stable order, because students
match the colour on their phone to the colour on the wall.
