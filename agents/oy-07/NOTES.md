# NOTES for LearnGeo 7 OY

I own `assets/js/leaderboard.js`. It ranks on level, never on diamonds.
Current through round 4. All measurements dated 2026-09-12 unless said
otherwise.

## God mode, and the one thing I cannot do about it

**The exclusion cannot happen in this file, and that is not a gap.** Measured
2026-09-12: oy-03's `totals()` sums a student's games before I ever see them
(`t.points += p.score`, one entry per student). By the time a row reaches
`applyLive()`, one god-mode game and three real ones are a single number that
cannot be unpicked. Excluding "the student" would erase their real games;
keeping them would launder the fake one. The filtering has to happen where the
rows still exist.

**Nothing here reads `GodMode.on`, on purpose.** That is the *viewing* device's
state. A board that hid rows because of what the reader's browser happens to be
doing is a comment, not a protection: the same board on the teacher's laptop
would show the lie. What this file honours is what the data says, and a test
asserts the board is byte-identical with god mode on and off on the reading
device.

### What I need, and from whom

A column written at play time and carried through the read. Concretely:

- **oy-01:** a marker on `live_players`, written when that player's row is
  created or updated, not asserted later.
- **oy-03:** exclude those rows from the sums in `totals()`, and report how
  many were dropped per student as `excludedGames`.

I already honour two shapes so whichever lands, this file works unchanged:

- `excludedGames: n` — **the one to prefer.** The numbers arrive clean and I
  use the count only to tell the teacher.
- `godMode: true` on an entry — the whole entry is dropped. Only correct when
  an entry never mixes god-mode and real play, which is why it is the fallback.

### What already protects the ranking

`godmode.js` on main awards nothing: no XP, no level. So god mode cannot move a
student's **place**, which is the harm `admin.js:188` was written about. A test
confirms 500 god-mode answers do not move a level. The remaining exposure is
the GeoLive columns beside the ranking, which is smaller but still a lie told
about real children's company.

### The teacher can tell

When any game is excluded the caption says so and counts them: "2 games played
in god mode are left out, so these totals will not match every game you
watched." Same reasoning as the past-live-games line: a total a teacher cannot
account for is the thing that caption exists to stop, and this is that problem
one layer down.

## The ranking rule, and why ties are the whole board

Ties are not an edge case here, and how far from one they are depends on how
long the class has been going. Simulated 30 students, 2026-09-12:

| The class has done | Levels on the board | Distinct places | Students sharing a place |
| --- | --- | --- | --- |
| one 20-question quiz | 2 | 9 of 30 | **27 of 30** |
| one 20-question quiz, wider ability spread | 2 | 14 of 30 | 24 of 30 |
| a term: 8 quizzes of 20 | 4 | 28 of 30 | 4 of 30 |
| a term: 8 quizzes of 40 | 6 | 29 of 30 | 2 of 30 |

**A new class is nearly all ties and an established one is nearly none.** That
is worth knowing before switching it on, because the first thing a teacher sees
is the top row of that table: almost everybody level with almost everybody.
That is the board working, not the board broken. It sorts itself out over a
term as the levels spread.

(My first measurement said every one of thirty shared a place. That was an
artifact of test data drawn from ten fixed scores. The table above varies each
student's accuracy per quiz and is the honest number.)

So the order has to be total and identical on every render, every session and
every device. A board that quietly reorders equal students in front of a class
is worse than one that ranks them wrongly, because nobody can tell which draw
was the true one.

The rule, and it is written in the comment on `order()` where the decision is
actually made, not only here:

1. anyone who has started, above anyone who has not
2. higher level
3. further into that level, since two students on level 4 are not equal if one
   is nearly 5

Those three decide a **place**. Students matching on 2 and 3 share it and are
marked tied. Two more keys decide only the order inside a shared place, never
the place itself: accuracy, then name, then account id. The account id is the
floor and cannot tie. Names compare with `<` rather than `localeCompare`, so
the order does not depend on the device's locale.

The table prints the same rule in the teacher's words whenever a shared place
is on screen: "Place goes on level first, then how far into that level a
student is. Two students who match on both share a place, shown with =."

Proved rather than asserted: 200 shuffles of the input rows, 100 shuffles of
the roster, and a fresh load of the module, all produce one identical board.
Two students called Sam stay separate and stay in the same order.

## Round 4: the empty board is a real screen now

Two people went looking for this leaderboard and found nothing, and part of
that is mine. When a teacher switches it on for the first time, nobody in the
class has synced a level yet, so what they used to get was a table of names
with a dash in every column. That is the worst of both: it looks like data
that failed to arrive rather than a board with nothing on it yet.

Measured 2026-09-12, four screens, all rewritten:

- **Nobody has joined.** "Nobody in this class yet / Students appear here once
  they join with the class code." No table.
- **Switched on, nobody has answered anything.** "Nothing to rank yet / 3
  students are in this class. Levels and scores appear here as soon as they
  answer questions, in a quiz or in a live game." No table. This is the screen
  the round is about: it now confirms the class is really there and says what
  makes it fill.
- **One student has started, the rest have not.** A table, with "Only Ana has
  started, so there is nothing to compare yet." A lone "1" should not look like
  somebody won something.
- **A working class.** Leads with what the table is ranked on, then counts who
  has not started, then explains the tilde. The first line a teacher reads
  should say what they are looking at, not explain a mark they have not
  noticed yet.

A test asserts that no data table is ever drawn when nobody has started, at 0,
1, 3 and 30 students, because that is the exact shape of the thing that made
this look broken.

Switched off still renders nothing at all and makes no network call. That is
the contract oy-09 wires: the caller passes `enabled`, this file does not read
the switch itself.

## For Owen, before you run a real game

**The leaderboard is off until you turn it on.** That was deliberate and it was
my recommendation: a leaderboard publishes a ranking of children to their
class, and switching that on for every existing class in an update nobody read
the notes for means a teacher finds out when a student asks why they are last.
Turn it on per class.

**Two kinds of level, and the table tells you which.** `Lv 14` is the student's
own level, synced from their device. `Lv~ 2` is worked out from work recorded
in this class and always reads lower, because it cannot see solo practice. Every
student shows `Lv~` until their device next syncs. If you see `Lv~` everywhere
after people have used the app, sync is not running.

**What has not been tested: an actual game.** Everything here is verified
against the real files of the sessions it talks to, and 127 checks pass. None
of that says the game plays, because playing one needs a signed-in teacher and
a real class. The first person to find out is you.

**Expect a lot of ties at first.** A class that has done one quiz puts roughly
27 of 30 students on a shared place, because there are only two levels to be on
yet. That is the board working. After a term of quizzes it is 2 of 30. The
table under the board explains the rule in a line you can repeat to a student.

**What I would watch on the leaderboard specifically.** Whether a student who
only plays live games gets a level at all; whether two students with the same
first name stay on separate rows; and whether a class you mark by hand shows
levels rather than a column of "not started".

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

Status: Complete. 179 checks passing across ten suites, twelve of them
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

## The off switch default, and what it cost

Settled: the leaderboard defaults **off**, GeoLive stays on. The reason still
holds: a leaderboard publishes a ranking of children to their class, and
turning that on for every existing class in an update nobody read the notes for
means a teacher finds out when a student asks why they are last.

Worth recording honestly, because it was my recommendation: on 2026-09-12 two
people went looking for this feature and neither found it, because a board that
is invisible by default sits behind a switch that is also not obvious, and from
the outside that is identical to a feature nobody built. Defaulting off was
right. Defaulting off **without making the switch findable** was not, and that
is the half nobody thought about, including me.

The discoverability work is oy-09's. My side of it is that the first screen a
teacher sees after switching it on now says what it is rather than looking
broken, which is the round 4 section above.

`enabled: false` still renders nothing and makes no network call, with a test
that fails if a single call is made.

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

## Both gaps in the real-level chain are closed, verified on main

I flagged two. Both are fixed on `origin/main` and I checked the file rather
than taking the word for it:

- `cloud.js` now selects `*` from `class_members` and copies `level` and `xp`
  onto a member **only when they are actually numbers**, so unknown stays
  unknown. `cloud-geolive.js` calls `sync_level()` on sync.
- The columns are nullable with no default now, instead of `not null default 1`.

That second change made my own guard obsolete **and wrong**, so it is gone. I
had been reading "level 1 with no XP" as not-yet-synced, which was right while
every row defaulted to 1 and would now hide a student genuinely on level 1.
Absent means nobody synced; present means somebody did.

## The private copy of the identity rule is retired

`teacher.js` is on main exporting `people` and `ownerKey`, it loads before this
file, and it passes `people` in when it mounts the table. Two independent
sources, so the copy I held for two rounds is deleted and there is one rule
again.

If neither source ever answers, `roster()` returns nobody and the table says
the class is empty. That is the right way to be wrong: an empty table is
obviously wrong, while a table built on a guessed identity rule is wrong and
looks fine.

The tests now install `people()` and `ownerKey()` copied verbatim from main's
`teacher.js`, so they exercise the real rule rather than my idea of it.

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
