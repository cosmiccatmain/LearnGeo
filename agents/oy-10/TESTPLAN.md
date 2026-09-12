# GeoLive and class leaderboard: test plan

Written by oy-10 from `agents/GEOLIVE-SPEC.md` on 2026-09-12, before any of the
code existed. Nothing here was derived from an implementation, so where a test
and a file disagree, that is a real disagreement and not me describing what was
built.

Every test below is written as: what to do, what must happen, and what it looks
like when it fails. I will report the third one.

## How I will run these

- Browser preview of the working tree, desktop and a 375x812 phone viewport.
- Three database states, because most of the interesting failures are here:
  **(A)** live_ tables present and empty, **(B)** live_ tables present with a
  game in progress, **(C)** live_ tables absent. State C is not hypothetical
  and is the single most important column in this plan.
- Two browsers side by side for anything involving a teacher and a student.

## A. Before any of it can work

These are cheap and they catch the class of bug that got through last round.
A file that parses is not a file that runs.

**A1. Every new file is actually loaded.** Each of `geolive.js`,
`cloud-geolive.js`, `geolive-teacher.js`, `geolive-student.js`,
`geolive-questions.js`, `leaderboard.js`, `geolive.css` is referenced from
`index.html`, and every referenced path returns 200.
*Fails if:* a file exists in the repo but nothing references it, or a tag
points at a path that 404s. Either way the feature is silently absent and
every later test gives a confusing result.

**A2. Every global the spec names exists after load.** `GeoLive`,
`GeoLiveCloud`, `GeoLiveQuestions`, `GeoLiveTeacher`, `GeoLiveStudent`,
`ClassLeaderboard`, each with the exact methods listed in the spec.
*Fails if:* a name is missing or a method is absent. Then two sessions
disagreed about a signature and nobody noticed.

**A3. Nothing is declared twice.** Load the page and check that no new file
redefines a global or a helper that another new file already defined. Eight
sessions are writing eight files against one shared namespace.
*Fails if:* the second declaration wins and quietly replaces the first. This is
exactly the bug that shipped last round, it parses fine, and only pressing a
key finds it. I will check by loading each file's global before and after the
full set loads and comparing.

**A4. Console is clean on load, in all three database states.** No errors, no
unhandled promise rejections, on the landing page, the student app and the
teacher dashboard.
*Fails if:* anything throws before a human has clicked a thing.

**A5. Load order.** Each file works when loaded in the order `index.html`
actually lists, not just in isolation. A file that calls another at parse time
rather than at mount time will break here.

## B. The rules, with no network and no DOM

`geolive.js` is specified as pure, which means these can be exact rather than
approximate. I will run them in the console against the real module.

**B1. Determinism.** `GeoLive.create` with identical inputs, twice, produces
identical sessions. Same for a full played-through game.
*Fails if:* anything uses `Math.random` or a clock inside the rules. Then no
other test in this section can be trusted.

**B2. Scoring boundaries.** Wrong answer scores exactly 0. Correct answer with
the full time limit left scores exactly 1000. Correct answer with no time left
scores exactly 600. Every correct answer lands in 600 to 1000 inclusive, and
every score is a whole number.
*Fails if:* a correct answer ever scores less than 600 or more than 1000, or a
score has a fractional part. See the gap about the time limit in section J,
because right now nothing in the spec says what the limit is.

**B3. A late or absurd `ms` cannot go negative.** Pass `ms` larger than the
time limit, and `ms` of 0, and a negative `ms`.
*Fails if:* the speed bonus goes negative and drags a correct answer below 600,
or a huge `ms` produces a negative total. This is the phone-woke-up case
arriving at the scoring function, so it matters.

**B4. Answering twice keeps the first answer.** Answer correctly, then answer
wrong on the same question. Then the reverse: answer wrong, then correct.
*Must:* the first answer stands in both directions, the score does not move on
the second call, and the returned `{correct, points, total}` describes the
first answer, not the second.
*Fails if:* the second call overwrites, or adds points a second time. The wrong
direction is the one people forget: answering wrong then right must stay wrong.

**B5. State machine.** `start` gives status `asking` and index 0. `current`
returns a question while asking and null once finished. `next` past the last
question gives status `ended`. `current` after `ended` is null, not a crash.
*Fails if:* `next` runs off the end of the array and returns undefined that
something later reads a property from.

**B6. `reveal` counts.** Counts reflect only answers actually given, and a
question nobody answered gives all zeros rather than an empty object or
undefined.

**B7. `standings` is sorted best first** and includes every player, including
players who scored 0 and players who never answered.
*Fails if:* a player disappears from standings because they have no answer row.
A student who sat out still exists and still has a name on the podium screen.

## C. Building the question set

**C1. The shape holds, always.** Every question from `premade()` builders and
from `fromCodes` has all five fields, `options.length === 4`, `options`
contains `answer`, and `code` is a three letter ISO3.
*Fails if:* options is ever 3 long, or the answer is missing from its own
options, which makes a question unanswerable.

**C2. No duplicate options within one question.** All four options are
distinct strings.
*Fails if:* two options render as identical buttons. This is worse than it
looks: `reveal` returns `counts` keyed by option text, so two identical options
collapse into one key and the teacher's counts silently go wrong. A duplicate
option is not cosmetic, it corrupts the reveal.

**C3. Three countries, twenty questions.** `fromCodes(['PER','CHL','BOL'],
kinds, 20)`. This is the case Master called out and it is the one I expect to
break.
*Must:* it returns promptly, every question still satisfies C1 and C2, and the
distractors come from the wider country pool rather than only the three picked,
because three countries cannot fill four options.
*Fails if:* it returns fewer than 20 without saying so, or it hangs trying to
find 20 unique questions that do not exist, or it pads options by repeating the
answer. A hang here locks the teacher's browser in front of a class, so I will
time it and treat anything over two seconds as a failure.

**C4. One country, one kind, ten questions.** The degenerate version of C3.
*Fails if:* it throws, hangs, or produces a question whose four options cannot
be filled.

**C5. Zero countries.** `fromCodes([], kinds, 10)` returns an empty array or a
clear refusal, and does not throw.

**C6. All four kinds appear** in a mixed set, and `shape-country` and
`country-map` carry a `code` the map can actually shade.

## D. Network, and the fail-soft rule

This section is the one I care most about, because the spec says the cost of
getting it wrong is the whole app rather than this feature.

**D1. Tables absent, GeoLive degrades.** Database state C. `available()`
resolves false. Every other `GeoLiveCloud` method resolves to null or an empty
result and none of them reject.
*Fails if:* any call rejects or throws.

**D2. Tables absent, the rest of the app is untouched.** State C, and this is
the test that matters most in the whole plan. The teacher dashboard loads and
lists classes. Every student's assignment list loads. The existing quiz, the
map, the shop and sign-in all work. Console clean.
*Fails if:* any existing screen is blank, partial, or throws. A merge a few
hours ago would have failed exactly this, so I will run it against state C
before I run anything else.

**D3. Fail-soft is scoped to the missing table, not to everything.** With the
tables present, force a different error, for example a malformed argument or a
denied row.
*Must:* that error still throws. The spec is explicit that every other kind of
error still throws.
*Fails if:* a blanket try/catch swallows all errors and returns null. That
looks identical to passing D1 while actually hiding real bugs forever, so
passing D1 is not evidence unless D3 also passes.

**D4. No shared `Promise.all`.** No GeoLive call is awaited in the same
`Promise.all` as a non-GeoLive call.
*Fails if:* one is, because a single GeoLive rejection then takes down whatever
it was batched with. That is the exact failure shape the spec describes.

**D5. Network drops mid-game and comes back.** Go offline during question 2,
answer while offline, come back during question 3.
*Must:* the student's screen recovers to the question the class is actually on.
The teacher's answered count reconciles rather than double counting.
*Fails if:* the student is stranded on question 2, or the offline answer lands
against the wrong question on reconnect.

**D6. Reconnect does not double subscribe.** Drop and restore the network three
times, then advance one question.
*Must:* the change handler runs once per change.
*Fails if:* the handler fires two or three times for one change, or the answered
count jumps by more than the number of people who answered. This app already
had a bug of exactly this shape, where a panel was rewired without dropping the
old handlers and one click fired many times, so I will watch for it here
specifically.

**D7. `watch` unsubscribes cleanly.** Call the returned function, then change
the session.
*Fails if:* the callback still runs after unsubscribe. That leaks a handler for
every game a teacher runs in a session.

## E. What actually happens in a classroom

**E1. A student joins late.** Teacher starts with 4 players and reaches
question 3. A fifth student joins.
*Must:* a defined, documented outcome. They appear in standings, their score
for the questions they missed is 0, and they can answer from the current
question onward.
*Fails if:* they never appear, or they appear with a score that lets them win
because they were not marked absent for questions 1 and 2, or the teacher's
count now expects 5 answers for a question only 4 people could see. See gap J1,
because the spec does not currently say which of these is right.

**E2. A phone sleeps and wakes two questions later.** Lock the phone during
question 1, unlock during question 3.
*Must:* the student's screen shows question 3, and the answer they submit
records against question 3.
*Fails if:* it shows question 1, or it submits an answer against index 0 that
the server accepts. A stale index must not score.

**E3. A student taps twice on one question.** Tap two different options as fast
as possible, and also double tap the same option.
*Must:* only the first counts, the score moves once, and the second tap does
not re-enable anything.
*Fails if:* the score moves twice, or the buttons stay live after the first tap,
or the double tap on one option registers two answers. This is B4 again, but
through real fingers and real event handlers, which is where it will actually
break.

**E4. Two students finish on identical points.** Engineer an exact tie for
first, and separately an exact tie for third.
*Must:* both students appear, the order is stable across reloads rather than
shuffling, and the podium shows both rather than dropping one.
*Fails if:* the order changes between two loads of the same finished game, or a
tied player vanishes off the podium. See gap J4.

**E5. The teacher starts with nobody selected.** Start with an empty roster
selection.
*Must:* either a clear message that nobody is selected, or an empty game that
does not crash. Standings is an empty list, reveal counts are all zero, and the
podium renders with no players.
*Fails if:* anything divides by the player count, or the podium throws on an
empty array.

**E6. The teacher picks three countries and asks for twenty questions.** The
C3 case driven through the real teacher screen rather than the console.
*Must:* the game is playable start to finish.
*Fails if:* the screen hangs, or a question shows fewer than four options, or
two options are identical.

**E7. A full clean game.** Four students, six questions, start to podium, with
a reveal between each. The baseline.

**E8. The student screen on a phone.** 375x812. Four options reachable with a
thumb, each at least 44px tall, no horizontal scroll, and the question readable
without zooming. The spec calls this the one screen definitely used on a phone
in a hurry, so I will test it on the phone viewport first rather than last.

## F. The all-time leaderboard

**F1. Empty class.** No results at all. An empty table with a heading, not a
thrown error and not a blank panel.

**F2. One student, one quiz.** Totals, quizzes done, accuracy and best streak
all correct for a single row.

**F3. Accuracy has no division by zero.** A student with zero answered
questions shows something sensible rather than NaN or Infinity.
*Fails if:* the cell reads `NaN%`.

**F4. Ties.** Two students on identical totals both appear, in a stable order.

**F5. It survives state C.** Tables absent, the leaderboard still renders from
existing `results` rows, because it is specified to work from data that already
exists and to gain GeoLive points only later.
*Fails if:* the leaderboard depends on the live_ tables and breaks without them.

## G. The database

**G1. It applies to a database that already has real data**, without dropping
or rewriting an existing table.
*Fails if:* it contains a destructive statement against anything outside the
three new tables.

**G2. Three `live_` tables** exist afterward with a join code, a status limited
to lobby, asking, reveal or ended, the question set and the current index.

**G3. A student can read only the session they joined.** Signed in as student
A, attempt to read student B's session.
*Must:* refused by row level security.

**G4. A student can write only their own answers.** Signed in as A, attempt to
write an answer as B.
*Must:* refused.

**G5. Join codes are unique** across sessions that are open at the same time.
*Fails if:* two open sessions share a code, because then a student joins the
wrong class.

**G6. It matches the live database's style**, not `supabase/migrations`, which
was never applied and does not describe the real database.

## H. Nothing else broke

Run after every merge, in all three database states.

**H1.** Sign in, including passkeys, still works.
**H2.** The existing quiz, learn, test and cards modes still work.
**H3.** The map still renders and shades.
**H4.** The shop still charges once per purchase and no more.
**H5.** The teacher dashboard, classes and assignments still load.
**H6.** `curl -s https://www.learngeo.app/ | grep -cE 'passkey\.js|admin-pin\.js'`
still returns 2. It returns 0 if production has gone stale again.

## J. Gaps in the spec, which I need answers to before some tests above can pass

These are questions, not complaints. Each one is a place where two sessions can
both follow the spec and still not fit together, so I would rather raise them
now than find them in a merge.

**J1. Late joiners.** `open` takes `playerIds` up front but `join` adds players
afterward. Is a late joiner added to the session, and do they get 0 for the
questions they missed or are they scored only from where they joined? E1 cannot
have a correct answer until this is decided, and oy-02, oy-03 and oy-04 all
need the same answer.

**J2. The time limit is never defined.** Scoring is "scaled by how much of the
time limit was left", but no number, and no per-question field, appears
anywhere in the spec. oy-02 needs it to score, oy-04 and oy-05 need the same
number to draw a countdown. If they pick different numbers the bonus will not
match the bar the student watched. B2 cannot be exact until this is fixed.

**J3. Stale answers.** `GeoLiveCloud.answer` takes an `index`. Must an answer
whose index is not the session's current index be rejected? E2 assumes yes. The
pure module's `answer` has no index at all, so this can only be enforced in the
cloud layer or the screens, and somebody has to own it.

**J4. Tie order.** `standings` is "best first" but nothing says how ties break.
Without a rule the podium is arbitrary and E4 cannot be stable across reloads.
Name order or first-to-reach-the-score would both work, it just has to be one
of them.

**J5. Options when the pool is tiny.** Must distractors come from the countries
the teacher picked, or from the whole pool? The spec requires four options
including the answer, which is impossible from three countries if distractors
are restricted to the picked set. C3 depends on this.

**J6. `fromCodes` when `n` exceeds what the codes can produce.** Repeat
questions, return fewer, or refuse? All three are defensible and they are
different implementations.

**J7. Who writes GeoLive points into `results`?** The leaderboard is specified
to include GeoLive points "once those are being written", but no owner in the
table is told to write them, and the row shape is not given. Today that means
F-section totals will not include GeoLive.

**J8. Accuracy definition.** Correct divided by answered, or correct divided by
asked? A student who skips questions scores very differently under the two, and
the leaderboard should agree with whatever the existing results screens do.
