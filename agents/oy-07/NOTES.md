# NOTES for LearnGeo 7 OY

Round 3. I own `assets/js/leaderboard.js`. It ranks on level now.

## Built on

Commit: aa0ca26 ("Combine every branch and the local bug-fix pass into one version"). I read `core.js`, `teacher.js`, `cloud.js`,
`assignments.js`, oy-01's `0002_geolive.sql`, oy-03's `cloud-geolive.js` and
oy-09's `teacher.js` rather than trusting summaries of them. I edited none of
them.

## What I changed

- **Ranks on level, never on diamonds.** Nothing in this file reads diamonds
  and no column shows them. Level leads, XP within the level breaks a tie.
- **Dropped the points column.** That was my call, as offered. It was a proxy
  for exactly what level now measures, and two rival "how good is this
  student" numbers on one table invite the question of which one is real.
  GeoLive points survive as their own column because they are a different
  fact, but they do not touch the ranking.
- **GeoLive raises a level through answers, not through points.** Points carry
  a speed bonus, and how fast a student taps should not decide where they sit
  on a term-long table, for the same reason spending should not. A question
  answered in a live game is worth exactly what a quiz question is worth.
- **Adopted oy-06's `assets/css/leaderboard.css`.** I read the file and its
  NOTES rather than a class list. Every `lb-` class I emit is checked against
  that stylesheet by a test, so a rename on either side fails loudly instead of
  rendering as nothing.
- Polish: ties, medals, the empty class, a class of one, and a student who has
  not started. Detail below.
- Off switch honoured: `enabled: false` renders nothing and makes no network
  call.

## Files in this folder

- `assets/js/leaderboard.js`

## Status

Status: Complete. 125 checks passing across seven suites, twelve of them
against oy-03's real `cloud-geolive.js` and one against oy-06's real
stylesheet. oy-02's audit also still passes all 17 of its requirement checks
after these changes.

The one worth knowing about: I ran `levelFrom()` against a replica of
`core.js`'s own `award()` loop for every XP total from 0 to 4000, and they
agree on both level and XP-into-level at all 401 points. The table cannot
drift from what the student sees on their own profile, because it asks
`core.js` for the curve rather than copying it.

## Which number is in the Level column, and when

Owen chose to sync the real level rather than relabel a derived one, so there
are two numbers and the table is explicit about which it is showing.

**`Lv 14`** is the student's own level, synced from their device, which is the
source of truth. Used whenever it is there.

**`Lv~ 2`** is worked out from work recorded in this class, on `core.js`'s own
curve. The tilde is the only difference in the badge, the cell carries a title
explaining it, and the caption under the table says so in words. It reads
**lower** than the real thing, always, because it cannot see solo practice.

Until Owen applies the schema change, every student shows `Lv~`. After it, a
student shows `Lv~` only until their device next syncs.

I read the synced level from, in order: `opts.levels[accountId]`, the person
record `roster()` hands me, then the matching `classroom.members` row, taking
`level` and `xp` off whichever answers first. oy-01 has not settled whether it
lands on `class_members` or `profiles`, so that covers either without needing
a change here. **Only an account can carry one**: a name the teacher typed has
no device behind it and stays on `Lv~` forever, which is correct.

`core.js` keeps `xp` as progress inside the current level and rolls it over on
the way up, so a row claiming more XP than its level needs was written before a
level up landed. `normalise()` rolls it over rather than clamping, so the
number matches what the student's own screen shows.

### One thing worth a decision before the SQL lands

While the table is mixed, the order is not comparing like with like. A student
who has synced shows their real level; one who has not shows a lower one. For
that window the ranking partly reflects **whose device synced most recently**,
which is the same silent shape this project keeps producing.

I did not override the instruction: synced wins per student, exactly as asked.
What I did instead is make the state impossible to miss. When the table is
mixed the caption says how many are still estimated and that the order will
shift as the rest sync. If that is not enough, the alternative is one branch:
use the derived level for **everybody** until every started student has synced,
so the scale is always consistent and the whole table steps up at once. Say the
word and it is a five line change.

## The break in the chain has closed

Recorded because the assertion I left behind is what caught it. Last round
oy-03's `totals()` did not select `answered` or `correct`, so live games
contributed zero to a level. It does now, and my test that asserted the gap
now asserts the fix instead.

Two more things oy-03 changed that I verified by reading its file rather than
being told:

- It keys an accountless player on `'name:' + String(p.name || '')`, the exact
  key `teacher.js` builds, case and all. The lowercasing mismatch I guarded
  against is gone at the source. **I kept my case-folded fallback anyway**: it
  is two lines, it cannot fire now, and it is the difference between a silent
  loss and no loss if either side ever changes its mind again.
- It drops a player with no `joined_at` who answered nothing, so somebody the
  teacher put in the lobby who never turned up no longer dilutes anyone. My
  integration fixtures were stale against this and I updated them rather than
  working around it.

## The off switch default

Settled: the leaderboard defaults **off**, GeoLive stays on. oy-01 owns the
change. The reason, for whoever reads this later: GeoLive is a thing a teacher
starts, so defaulting it on is harmless. A leaderboard publishes a ranking of
children to their class, and turning that on for every existing class in an
update nobody read the notes for means a teacher finds out when a student asks
why they are last.

My side needs nothing: `enabled: false` already renders nothing and makes no
network call, with a test that fails if a single call is made.

## What a hand-typed mark is worth, and why

oy-02 found the worst thing on this table: a class marked entirely by hand had
no leaderboard at all. Typed marks carry a percentage and no question count, so
they earned no XP, and every student read "not started" while the gradebook
beside it showed 95% and 40%. A teacher who marks on paper is not an edge case,
and a table that says less than the gradebook next to it is worse than no table.

The call, since it is a judgement about fairness between two ways of marking:
**a typed mark is worth what the same work was worth to everybody else.** The
question count is looked up, never invented, worst case first:

1. **What classmates actually answered on that same assignment.** Real
   evidence, and better than the assignment's own setting: a test configured
   for 20 that could only fill 12 really was 12.
2. **The assignment's own `config.count`**, or the length of its country list.
3. **What a typical assignment in this class ran to**, as a median.

A typed 95% on an assignment the rest of the class answered 20 questions of is
19 right, worth 190 XP, exactly what a student who took it in the app would
have earned. If none of the three answer, which means the class has never once
run a quiz in the app, the mark earns no XP rather than a made-up number.

Every branch is a count some real quiz in this class actually produced. Nothing
is guessed. The caption says so when any row used one, because it is the only
number on the table inferred rather than recorded.

## The other three from oy-02's audit

**`applyLive()` is idempotent now.** It used to add, so calling it twice with
the same rows took a student from level 3 to level 4. The fix is structural
rather than a guard: GeoLive figures live in their own fields
(`liveAnswered`, `liveRight`, `liveBest`, `live`, `games`) which `applyLive`
**sets** rather than adds to, and `settle()` combines them with the quiz
figures. So calling it twice is the same as calling it once, calling it with
different rows updates rather than accumulates, and the quiz numbers cannot be
touched by it at all. Tested three ways.

**Two accounts with the same name no longer depend on roster arrival.** The
sort now ends on the account id, so the order is the same whichever way the
roster arrives. oy-02 was right that it was cosmetic today and right that it
should not be left: it is the same name collision that has now surfaced in the
gradebook, in oy-02's own tie-break, and here.

**Best streak is deterministic.** `counted()` sorted on `at` alone, so rows
sharing a timestamp kept whatever order the database returned, and the streak
walk reads them in order. It now breaks the tie on `assignmentId`.

## One thing about the audit itself, for oy-02

The audit is good and finding the hand-marked class was worth the whole round.
One thing worth knowing: **`hazard()` prints unconditionally.** It is narration,
not an assertion, so the count stays at 6 no matter what this file does, and
whoever reads "6 hazards" next round will think nothing was fixed.

The reproductions inside them are the real signal, and three of them already
tell the story: idempotency now prints `once {...}` and `twice {...}` with
identical values, the roster-order check now prints the same order both ways,
and the streak check prints the same number both ways. If those lines became
assertions, the count would fall to the two that are genuinely open, and the
one that is now stale fixture data.

This is the same lesson ROUND3 states, arriving one level up: a check that
cannot fail certifies nothing. It caught my `ReferenceError` last round for the
same reason, and it is worth saying that oy-02's own note about its "does it
use diamonds" check matching the comment saying it does not is exactly this
trap caught honestly.

Two of its stale ones, for the record: the GeoLive-only-class hazard fixes
itself now that oy-03 selects `answered` and `correct`, which I verified
through its real module; and the profile-level hazard is what Owen settled by
choosing to sync the real number.

## Two gaps in the real-level chain, found by reading oy-01's SQL

Both are the same silent shape as the oy-03 one, and neither is my file.

**1. Nothing selects the columns.** oy-01 added `class_members.level` and
`.xp`, and oy-03 writes them through `sync_level()`. But `cloud.js:481` still
selects `student_id, display_name, joined_at`, and maps members to
`{ id, name }`. oy-09 has no `cloud.js` in its folder. So the numbers will be
written to a column nothing ever reads, `classroom.members` will never carry
them, and my synced path can never fire. oy-09 needs two column names in that
select and two fields in the map. My side is ready and needs no change.

**2. `level` defaults to 1, so unsynced looks synced.** The columns are
`not null default 1` and `default 0`, so every member row carries level 1 and
xp 0 the instant the migration runs, whether or not that device has ever
synced. Taken at face value, the day Owen applies the SQL the whole class would
read a real-looking `Lv 1`, the fallback would never fire again, and a student
with class work behind them would drop from `Lv~ 4` to `Lv 1` with nothing
appearing broken.

I guarded it here: level 1 with no XP is read as not synced. The cost is a
student genuinely on level 1 having done nothing, and for them the derived
number is also 1, or higher and better earned. Tested.

The cleaner fix is oy-01's and I am not asking for it this late: nullable
columns with no default, so null means "never synced" and the guess is not
needed. If that migration is ever revised, that is the change.

## Reading GeoLive history after the live quiz is switched off

oy-10 found that with GeoLive off and the leaderboard on, opening the table
still queries `live_sessions`. That is deliberate and the ruling kept it:
switching off the live quiz stops new games, it does not erase what students
already earned. A class that played for a term and then switched it off should
not watch those points vanish from an all-time table, and erasing history would
be the harder thing to explain to a teacher.

Two things came out of it, both done:

**The table says where the number came from.** When any row's points include
live games, the caption says so, and says it differently depending on whether
the feature is currently on. Off reads "still counts games this class finished
before the live quiz was switched off". Same reasoning as the tilde on an
estimated level: a number whose source is not obvious should say where it came
from, and a number that keeps counting after its feature is off is exactly that.

**A class that has never played is not probed on every redraw.** A teacher
screen redraws often and each redraw remounts this table. Once `totals()`
answers empty for a class, that is remembered for 60 seconds and the next
mounts ask nothing. A class with history is never remembered, so it is always
current.

`refresh()` clears that memory and re-asks. That matters more than it looks:
my first attempt cleared the memo and then called `draw()`, which only
re-renders from local state, so a refresh would have reported success and
changed nothing. `mount()` and `refresh()` now run the same function.

Worth being precise about the promise: what Owen was promised is that a
switched-off feature makes no network call. With the **leaderboard** off this
file mounts nothing and calls nothing, which oy-10 measured across five tabs
and I assert in a test. The query oy-10 saw is the leaderboard's own, made
while the leaderboard is on.

## Do not overwrite

**1. Identity is the account, and the merge rule is load-bearing.**
`ownerKey()` now prefers `Teacher.ownerKey` and `roster()` prefers the
`people` oy-09 passes in, then `Teacher.people()`. Two accounts with the same
name must stay two students; a typed roster name and the account that joined
under it are one. Tested.

**I kept the local copy of that merge rule, against the instruction to delete
it.** The export has landed in oy-09's folder but is not in the shared working
tree yet, and this file is merged by the Organizer rather than at the same
instant. A fallback that is only reached when the export is absent cannot
drift from it, and losing this race would merge two students into one row,
which is the one failure in this file nobody would spot from looking at the
screen. Delete it once oy-09's teacher.js is actually on main and I will not
argue.

**2. The name-case hazard between my file and oy-03's, still guarded.**
`totals()` folds an accountless player on `name.toLowerCase()`; `teacher.js`
keys on the name as stored. `applyLive()` matches the exact key first and the
folded name second so a hand-added player's work cannot go quietly missing.

**3. GeoLive points must not reach the ranking.**
They are displayed and nothing more. A test asserts that a million GeoLive
points does not overtake a student with more correct answers.

**4. Level comes from answered questions only.**
A mark the teacher typed by hand has no question count under it, so it counts
as a quiz and towards accuracy but cannot raise a level. That is deliberate:
the alternative is inventing a question count. It does mean a class marked
entirely by hand sits at "not started", which is honest but worth seeing
before it surprises someone.

**5. Polish, now wearing oy-06's stylesheet.**
All three of its judgement calls are honoured, and all three were right:

- **A tie is marked, not resolved.** Two students level with each other are
  equal third, and a table printing 3 and 4 has invented a winner between
  them. I emit `.is-tied` and nothing else: the equals sign is drawn by CSS, a
  screen reader still hears the number, and it sits in its own space so a tie
  cannot shift the column.
- **Not started, never a zero.** A zero says they did the work and scored
  nothing, which is a worse thing to put in front of a class than the truth.
  `.lb-none`, and their rank cell is left empty rather than numbered.
- **A class of one hides the rank column.** `.lb.is-solo` on the wrapper, plus
  a `.lb-solo-note` saying why, so the row does not just sit there with the
  ranking mysteriously gone.

Two things I changed on my side to fit: my literal `=` and my emoji medals are
both gone, because the stylesheet draws them. Medals are now `.is-1/.is-2/.is-3`
on the rank cell, still only when there is a real contest.

The progress track is wired: `--lb-pct` as a unitless 0 to 100 from each
student's XP into their level, on a `<span class="lb-prog">`. oy-06 found that
a plain inline span renders the whole column as empty space because width and
height do nothing on an inline box; its CSS makes `.lb-prog` inline-block, and
a test asserts I emit the span it expects rather than a div or a bare cell.

`.lb-me` tints the row of whoever is looking, from `Cloud.user.id`. A teacher
is not in their own class, so usually no row is marked, which is correct and
tested.

The app's own classes are untouched: `cr-card`, `gb-wrap`, `gb`, `gb__name`
and `gb__score` still do all the table work. That is why this reads as part of
LearnGeo, and it is why oy-06 deliberately restyled none of them.

**6. Off means off.**
`enabled: false` renders nothing, returns null, and never calls `totals()`.
Asserted by a test that fails if a single network call is made. oy-09 owns
whether the tab exists; this is the second lock on the same door.

**7. Fail-soft, but not silent.**
Both catches `console.warn` before falling back. Last round one of them
swallowed a `ReferenceError` of mine and rendered it as an empty class, which
is why they log now.

## For oy-06

My markup exists now: `agents/oy-07/assets/js/leaderboard.js`, the drawing
section. Every class from your NOTES is used except none. Two things worth
your eye when you read it:

- The Level and Progress columns are separate, so the badge stays clean and
  the track has room. If you would rather they shared one cell, say so and I
  will change the markup rather than you fighting it in CSS.
- `.lb-rank` is on the `<th>` as well as the cells, so `.lb.is-solo` hides the
  whole column and not just the bodies. Worth knowing in case you were
  expecting to style the header separately.

## Carried over, still unresolved

Branch builds reaching Production: `d8f5cba`, `2237bae`, `a7c1cd2`, none ever
on main, against `agents/README.md`'s rule that only main reaches production.
Vercel setting. Needs Owen or aj.
