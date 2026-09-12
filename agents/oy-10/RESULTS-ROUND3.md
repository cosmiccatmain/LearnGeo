# Round 3 results, oy-10 (lead tester)

> **CURRENT DATABASE STATE: 0002 IS APPLIED.** This file is written in the order
> the work happened, so earlier sections describe the pre-migration state and say
> so in their own headings. Read the last section, "Post-0002 run", for the state
> as it now stands. Nothing below is mixed: each section names the state it ran
> against.
>
> **For Owen:** the list of things nobody has been able to test, and which you
> should watch the first time you run a real game, is at the very end under
> "What only you can check".


Run 2026-09-12 against the round-3 files assembled at their real paths:
`agents/merged/` base, oy-09's `index.html`/`classroom.js`/`teacher.js`, and the
current files from oy-02, oy-03, oy-04, oy-05, oy-06, oy-07, oy-08.

## THE OFF SWITCH DOES NOT WORK IN THE INTEGRATED APP

This is the headline and it is the invisible failure mode the round was warned
about. Both builders wrote correct backstops. Neither is reachable, because the
wiring is not there. I proved each half separately rather than reading it.

**What is broken, all verified at runtime:**

1. `class-features.js` is not referenced by `index.html`. At runtime
   `window.ClassFeatures` is `undefined` and no script tag for it exists.
   `leaderboard.css` is not referenced either.
2. `teacher.js` renders `crTab('geolive')` and `crTab('leaderboard')`
   unconditionally. There is no gate on either tab.
3. `teacher.js` calls `ClassLeaderboard.mount(lbHost, {classId, classroom,
   people})` with **no `enabled` key**.

**What that costs, measured on the network rather than the screen.** Mounting
the leaderboard exactly the way `teacher.js` calls it today renders 146
characters AND fires a real request to
`rest/v1/live_sessions?select=id&limit=1`. So the feature that is supposed to be
**off by default** is both visible and reading rows. That is precisely "a
feature that is invisible but still reading rows is not off", except it is not
even invisible.

**Both backstops are correct, and I checked both directions.**
- `ClassLeaderboard.mount(el, {enabled: false})` returns null, renders 0
  characters, and makes **zero** network requests.
- With a `ClassFeatures` stub reporting geolive off, `GeoLiveTeacher.mount`
  renders "The live quiz is switched off for this class" and makes **zero**
  network requests. Switched on, it renders 1190 characters.

**THE TRAP FOR WHOEVER WIRES THIS.** The two backstops use *different
contracts*. GeoLive reads the global `ClassFeatures` itself; the leaderboard
expects `opts.enabled` passed in by the caller. A single wiring pass that
handles one will silently miss the other, and missing the leaderboard is the
worse half because that is the one that defaults off. oy-09 needs to load
`class-features.js` and `leaderboard.css`, gate both tabs, AND pass
`enabled: ClassFeatures.on('leaderboard', classId)` into the leaderboard mount.

## The leaderboard ranks on level, not gems: PASSES

Tested, not grepped. Two students, identical assignment, Ana 9/10 and Ben 3/10.
Ben given 99999 diamonds *and* a faked `economy: {xp: 99999, level: 99}`.

Result: Ana xp 90, Ben xp 30, ranked Ana first. Flipping the diamonds between
them changed nothing. No `diamonds` or `gems` field appears anywhere in a tally
row. The table derives xp from `right * XP_PER_CORRECT` out of the results
rows and never reads the spendable economy at all, which is a stronger
guarantee than sorting on level would be.

I threw away a first version of this test. It reported "identical despite
diamonds: true" while every row was `xp: 0, quizzes: 0`, because my results rows
did not match `ownerKey()` and never counted. It was true because both sides
were empty, not because diamonds were ignored. The rerun asserts
`rowsActuallyCounted` before it concludes anything.

## Defaults: written correctly, not currently enforced

`class-features.js` sets geolive `fallback: true` and leaderboard
`fallback: false`, and the reasoning in the file is sound: a ranking that shows
every student their place in front of everyone else should not switch itself on
for every existing class because a new switch appeared. `on()` is synchronous
and errs toward the fallback.

For an existing class with no stored row, `on('geolive')` is true and
`on('leaderboard')` is false, which is what the file claims. But since nothing
gates on it, the leaderboard's default-off is not honoured in the running app.
The default is correct on paper and unenforced in practice.

## Regression from round 2: holds

Section B, 26 of 26 against the current `geolive.js`. Non-default timer, 11 of
11, run at 30000 and 5000 rather than the default. Section C unchanged. The
6 red lines in C are my own assertions of the spec's ISO3 contract, which this
app's data has never had; they are the known finding, not a new break.

**Tables-absent still holds.** The probe still reaches the real project and
still comes back missing, and no existing screen is affected.

## oy-04's fixes to my round 2 findings: all three confirmed

1. `geolive-teacher.js:834` now has `if (view.questions.length < view.count)`.
2. `resolveCodes` is called before a game starts, with toasts naming countries
   that were not found.
3. Line 18 is now `var WW = global.WW || {}; var ICONS = WW.Icons || {};`.

## Not run

Everything needing a live game: the classroom situations, RLS, the leaderboard
against real class data, and the standings node-identity check. Both migrations
are still unapplied, so a game cannot be opened or joined. Unknown, not passing.

---

# Re-run after oy-09 wired the off switch

The network half, which is the part I own. All measured in a browser against
the current files.

## The bug I reported is fixed. Measured, not observed.

With the leaderboard off, which is its default, on a teacher dashboard: no
Leaderboard tab, **zero `ClassLeaderboard.mount` calls**, and **zero Supabase
requests** across Stream, Classwork, People, Analytics and Settings. That same
path previously fired `rest/v1/live_sessions`. Off now means off on the wire,
not just on the screen.

I instrumented `mount` to count calls rather than infer from the DOM, so "no
mount" is a measurement and not an assumption.

**The counter-test matters as much**, because a gate stuck permanently off
would also pass the above. Switched on, the leaderboard mounts once, receives
`enabled: true`, renders 155 characters and queries. 155 is the same figure
oy-09 measured in node against a stub DOM, from a browser, which is a useful
cross-check on both harnesses.

## All four wiring fixes verified against oy-09's files

Script tag for `class-features.js` at line 574, `leaderboard.css` link at line
19, both `crTab` calls gated behind `featureOn(...)`, and
`enabled: featureOn('leaderboard')` passed into the mount. The comment at
line 377 records the two-contracts trap explicitly.

## The seventh fix, tested with non-default values on purpose

I installed a stored row that **inverts both defaults**: geolive false (default
true), leaderboard true (default false). Testing at the defaults would have
proved nothing, the same way the timer bug was invisible at 20000.

Result: `load()` was actually called (one store read), the GeoLive tab
disappeared, the Leaderboard tab appeared, and `on()` reported the stored values
rather than the module defaults. Navigating away to Classwork and People and
back left it unchanged. At no point did I open Settings. That is the fix.

## The fifth fix, the student transition

Reached the state properly on the second attempt, and the first attempt is
worth recording as a warning: it reported a clean transition while
`step1_hasGeoliveTab` was false, so there had never been a tab to remove and
the flip had silently no-opped because I called `read()`, which is not an
export, instead of `load()`. It was a pass on a path never taken.

Corrected: student enrolled in a class with GeoLive on, Classroom tabs are
stream/classwork/grades/geolive, student sitting on the GeoLive tab with the
student screen mounted. Teacher flips it off. The tab goes, the host element
goes, and there are **zero runtime errors and zero unhandled rejections**
through the transition.

## The sixth fix

The Features card is in Settings, titled "What this class uses", and it says
"Switched off means off: the tab goes, and nothing is loaded or looked up."
Signed out with no synced class it says the switches need the class online
rather than offering a control that would silently fail. That is the honest
path in `class-features.js` working.

## NEW FINDING: the leaderboard queries GeoLive's tables even when GeoLive is off

With `geolive: false` and `leaderboard: true`, opening the Leaderboard fires a
request to `rest/v1/live_sessions`, which is GeoLive's table, for a feature the
teacher has switched off.

`leaderboard.js:396` calls `GeoLiveCloud.totals(classId)` guarded only by
`!C || typeof C.totals !== 'function' || !classId`. There is no `ClassFeatures`
check, so it runs regardless of the GeoLive switch, and `totals()` goes through
`available()`, which probes `live_sessions`.

**Harmless today and not harmless later.** With 0002 unapplied, `available()`
returns false and `totals()` resolves null. Once 0002 is applied, every class
with GeoLive switched off will query the `live_` tables whenever anybody opens
the leaderboard.

In fairness to oy-07 there is a real argument the other way: points a class
already earned in past games arguably should still count on an all-time table,
and switching off the live quiz is not the same as erasing history. So this may
be a decision rather than a bug. It should be a decision someone makes on
purpose, though, because as it stands Owen was promised that off means no
network call, and for GeoLive-off-plus-leaderboard-on that is not currently
true.

---

# Pre-migration pass. Database state at the time: 0002 NOT YET applied.

(Superseded by the post-0002 section below. Correct as written for the state it ran against.)

Confirmed from inside the app via `GeoLiveCloud.available()`, which returned
false. Everything below is the tables-absent state and none of it is mixed
with a post-migration run.

## Most of this round's targets are behind sign-in, and I could not reach them

I ran the sync and storage tests, got five green results, and then checked
whether the passes were real. They were not. Every one came back from a guard
clause before the database was touched:

- `writeClassFeatures` starts `if (!ready() || !classId || !patch) return
  Promise.reject(new Error('not online'))`. My "write rejects" result was that
  guard. The missing-column path, `sb.from('classes').update(row).then(check)`,
  was never reached.
- `teacherSync` starts `if (!ready() || W.state.role !== 'teacher') return
  Promise.resolve(false)`. It returned false because the session is signed out.
- `studentSync` and `pushLevel` have the same shape.
- `readClassFeatures` resolved null from the same place, not from a real
  select falling back.

So **the deliberate read/write asymmetry is UNVERIFIED**, and so is **"the class
sync can never break"**, which was the item I was told to hammer hardest. Both
need a signed-in teacher with a synced class. I am not signing in: the
credentials are Owen's and entering them is not something I will do.

The same blocks the re-run of the seventh through the real storage path.
`store()` does now find `Cloud.classFeatures`, so the wiring is right, but
`read()` short-circuits while signed out, so a genuinely saved choice cannot be
round-tripped through a reload from here. My earlier seventh result stands only
as what it was: proof that a stored row reaches the gate, using a store I
injected. Master is right that it did not prove storage existed.

## What I did verify

**God mode is correctly gated, and this one is a real test rather than a
source reading.** `GodMode.available()` returns false for this non-admin
session, `GodMode.enable()` refuses and returns false, and ctrl+shift+G
produces no banner and no error. An inert shortcut here is the correct
behaviour, not a missing feature. The banner itself and `mountToggle` still
need an admin session to see, so they remain unverified.

Both script tags are present and load: `admin.js` and `godmode.js`.
`Cloud.classFeatures` exists and exposes `read` and `write`.

## Source review, labelled as review and not as test

I read these rather than exercised them, because the paths are unreachable
signed out. They support the claims made for them:

- `missingBit()` covers `42703`, `42883`, `PGRST202`, `PGRST204` alongside the
  table codes `42P01` and `PGRST205`.
- `pushLevel` returns `Promise.resolve(0)` on every early exit and is detached
  from the profile push, so a missing `sync_level` cannot fail a sync that
  otherwise worked.
- Line 784's `if (res && res.error && !missingBit(res.error)) throw res.error`
  is scoped rather than a blanket catch, so real errors still surface.

That is a reasonable design and I would expect it to hold. It is not evidence
that it does hold, and I am not recording it as a pass.

## What becomes runnable the moment 0002 is applied

Unchanged: the eight classroom situations, RLS, the leaderboard against real
class data, and the standings node-identity check. Plus, now, the read/write
asymmetry and the class-sync resilience, though those additionally need someone
signed in.

---

# Post-0002 run. Database state: 0002 APPLIED.

Confirmed from inside the app: `GeoLiveCloud.available()` now returns **true**
through a real probe of `live_sessions`. The premise of everything earlier in
this file has flipped, and it flipped the right way.

**Headline: applying 0002 did not unblock most of the list, because the blocker
was never only 0002. It is sign-in.** Opening a room, joining one, answering,
revealing and ending all require an authenticated teacher and student. This
session is anonymous, and I will not sign in with Owen's credentials. So the
classroom situations and the standings check remain unverified.

## 1. Tables present: PASS

`available()` returns true via a real request to `live_sessions`. The fail-soft
layer correctly reports present now that the tables exist, having correctly
reported absent before. Both directions of that gate are now verified.

## 3. Row level security, anonymous: PASS as far as anonymous goes

From an unauthenticated session against the live database:

- `insert live_answers` with a fabricated `correct: true, points: 1000`:
  **REFUSED, 42501**, "new row violates row-level security policy".
- `insert live_sessions`: **REFUSED, 42501**.
- `update live_players.score` and `update live_sessions.status`: 0 rows.
- `select` on all three `live_` tables: 0 rows.

**No row was written to Owen's database.** So "a student cannot post their own
correct or points" is verified for the anonymous case, which is the case that
matters for someone poking the API from outside.

What is NOT covered: whether an *authenticated* student A can write student B's
answer, or read a game they did not join. Those need two signed-in accounts.
The 0-row updates are also weaker than they look: the fabricated id matched
nothing, so they prove nothing about RLS on a real row.

## 4. Standings node identity: NOT EXECUTED

This is Owen's explicit "must not jump" requirement and I could not run it. A
standings board only exists once a real game reaches a reveal, which needs a
signed-in teacher and at least one joined student. `mount()` returns its view
and the module exposes `stage` and `session` getters, but the view carries no
function keys, so there is no way to drive a redraw from outside.

**Source review, and labelled as review.** The mechanism looks correct:
`ensureBoard()` builds one row per player and caches it on `view.board`,
returning early if it already exists. `refreshBoard()` looks rows up by
`data-player`, does `if (!row) return;` rather than creating one, and only sets
`--gl-i`, toggles `is-below`, and writes `textContent` into child spans. It
never sets the container's innerHTML and never appends or removes a row.
`placeBoard()` moves the same element into the new slot. `view.board` is
discarded in exactly two places, when a new session is created for a changed
set of players, and on teardown, with a `sameIds()` helper to avoid recreating
when the ids match.

By construction node identity should hold. I have not proved that it does, and
I am not recording it as a pass.

## 5. The leaderboard with mixed synced and unsynced students

Verified on the data layer, with `rowsActuallyCounted` asserted first:

- A member row with `level: 7, xp: 55` is used: Ana reads level 7.
- Members with `level: null, xp: null` carry no `synced` value at all and fall
  back to the level derived from class work. **oy-01's nullable fix works: an
  unsynced student does not read as a real level 1.** That closes the flag I
  raised earlier.

**One thing worth a decision, not a bug.** Ana and Ben did *identical* class
work, 9 out of 10 each, and the table shows Ana at level 7 and Ben at level 1,
because Ana has synced a real level and Ben has not. That is the intended
design, since level measures all of a student's work rather than only this
class. But until every student has synced, the table is ranking real levels
against derived ones on one list, and the student who simply has not opened the
app on their own device sits at the bottom. Whether the rendered column shows
`Lv~` for those students is a render-layer question I did not test; I tested
`tally`, not the display.

## What I could not run, and what it would take

The eight classroom situations, authenticated RLS, the standings node-identity
check, `sync_level` actually writing, and the leaderboard against genuinely
real class data. Every one needs a signed-in session, and the classroom
situations need two. 0002 was necessary and is not sufficient.

---

# What only you can check

Owen: everything below needs a signed-in teacher, and most of it needs a
signed-in student too. Nobody has executed any of it. It is not known to be
broken; it is simply unknown. This is the list to keep beside you the first
time you run a real game.

**Watch the standings board when places change.** Rows must slide, not jump or
flicker. If a row blinks out and reappears in its new place, the board is being
rebuilt instead of moved, and that is the one thing Owen asked for by name. The
code looks right and nobody has seen it run.

**Have a student join after the game has started.** They should appear, score 0
for the questions they missed, and be able to answer from the current question
on. Check the teacher's "answered" count does not sit waiting for someone who
could not have seen that question.

**Lock a student's phone during one question and unlock it two questions
later.** The screen should catch up to the question the class is on. The answer
they then submit must count against the question actually on screen.

**Have a student tap two answers as fast as they can.** Only the first counts.
The rules module is proven on this, but the real screen with real fingers has
not been.

**Engineer a tie.** Two students on identical points should both appear, in a
stable order, and both should survive onto the podium.

**Start a game with nobody selected**, and separately **pick three countries and
ask for twenty questions.** The second gives twelve questions, which is correct,
and the teacher is now told. Check that you are actually told.

**Drop the wifi mid-game and bring it back.** The student should recover to the
right question. The teacher's answered count should reconcile rather than
double.

**Two students, RLS.** Signed in as one student, you should not be able to read
a game you have not joined, or write another student's answer. Anonymous access
is verified and refused; two signed-in students are not.

**Turn the leaderboard on, then off, with the class open.** Off must mean no
tab and no request. That is verified. What is not verified is the same flip
saved through the real storage layer and surviving a reload.

**Look at the level column with a mixed class.** A student who has synced shows
a real level; one who has not falls back to a level derived from class work. Two
students who did identical work can therefore show different levels. That is
intended, but it will look wrong to a class if you are not expecting it.
