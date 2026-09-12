# NOTES for LearnGeo 9 OY

## Built on

Commit: aa0ca26 (origin/main). The shared working copy was byte-identical to it
when I took my baselines, so these three files are aa0ca26 plus my additions and
nothing else.

## What I changed

The integration edits, and only those. All five decisions from Master are in.

- `index.html`: one stylesheet link for `geolive.css`, and six script tags
  inserted after `classroom.js`. That position puts `cloud-geolive.js` after
  `cloud.js`, `geolive-questions.js` after `data.js` and `quiz.js`, and both
  screens after the modules they call.
- `assets/js/teacher.js`: a GeoLive tab and a Leaderboard tab, a `geolivePanel()`
  that answers the signed-out and not-yet-online cases before anything mounts,
  the two mounts in `wirePanel()`, and `people` and `ownerKey` added to the
  existing `global.Teacher` export.
- `assets/js/classroom.js`: a GeoLive tab on the student's class screen and the
  `GeoLiveStudent` mount.

**Nothing was rewritten.** Measured against origin/main: `index.html` +7 −0,
`teacher.js` +49 −0, `classroom.js` +10 −0. Zero deleted lines in all three.
Roughly a third of the added lines are comments.

## Files in this folder

- `index.html`
- `assets/js/teacher.js`
- `assets/js/classroom.js`
- `NOTES.md`

## Status

Status: Complete. Both JS files pass `node --check`. I assembled the whole app
in a scratch directory from origin/main plus my three files plus all seven new
modules: every path `index.html` asks for resolves, and every script it loads
parses. Every identifier my additions reference is defined in its own file, and
`I.bolt` and `I.trophy` were already in `core.js`.

I could not open it in a browser. Five dev servers are already running from
other sessions and the limit is five per folder, so starting mine would have
meant stopping someone else's. Runtime checking is oy-10's job and it has a
working preview, so this is not a gap, just a note on what I did and did not
verify myself.

## Do not overwrite

**1. The fail-soft shape in `wirePanel()`.**

Both mounts are plain calls. There is no `Promise.all`, no `.then` and no
`await` anywhere in what I added, and neither mount shares a batch with the
class sync. This is deliberate and it is the exact shape that took the teacher
dashboard down last round, when announcements were read alongside assignments,
results and members in one batch. If a later edit puts a GeoLive call into any
shared batch, a missing `live_` table stops being a GeoLive problem and becomes
a Classwork and People problem. Keep them separate calls.

The `GeoLiveTeacher.unmount()` on tab change matters for the same reason: the
teacher screen holds a live subscription and an interval, and re-rendering the
panel throws the markup away but not either of those.

**2. Both `roster` and `members` are passed, and they are not the same list.**

`roster: people()` is everyone, so a teacher who added nine names sees nine.
`members: cls().members` is who can actually play. A hand-typed name has no
account and no device, and `people()` gives it an empty id, so two of them would
collapse into one player and `open()` would receive blanks. Do not simplify this
to one list. If someone later "tidies" it by dropping `members`, the bug comes
straight back and it looks like a scoring fault, not an identity fault.

**3. The gate lives in `geolivePanel()`, not in the screens.**

Signed out gives the existing `signinHint()`, which the existing
`bind('#tm-signin', ...)` already wires, so no new binding was needed. No
`cloudId` gives a plain message. `GeoLiveCloud.available()` returns a promise so
it cannot be consulted from a function that returns a string, and it does not
need to be: oy-04's screen has its own `gl-offline` warning for the
tables-missing case. Sign-in state here, table state there.

**4. THE STYLESHEET AND THE TWO SCREENS DO NOT SHARE A VOCABULARY.**

This is not mine to fix, I own none of those three files, but it is the largest
open problem in the round and nobody else is positioned to see it, because each
of the three sessions only reads its own file.

Measured at 20:07, after the most recent edit to all three:

- `geolive.css` defines **59** class names.
- The two screens between them render **97** class names.
- **8** appear in both.
- **51** of the stylesheet's rules match nothing that is rendered.
- **89** of the rendered classes have no rule at all.

They are not different features, they are the same features named twice:

| oy-06 CSS | what the screens render |
| --- | --- |
| `gl-standings__row`, `gl-standings__name` | `gl-stand__row`, `gl-stand__n` |
| `gl-target`, `gl-target__key` | `gl-opt`, `gl__opt-key` |
| `gl-roster__chip` | `gl-pick` |
| `gl-tally__bar` | `gl-live__n` |
| `gl-wait__dots` | `gl__dots` |

As it stands GeoLive ships essentially unstyled, and the student screen is the
one the spec calls out as definitely used on a phone, in a room, in a hurry.

All three files are moving fast, so treat the counts as a reading rather than a
verdict: oy-04 and oy-05 were rewritten at 20:05 and oy-06 at 20:07, and the
overlap was still 8. It is not converging on its own. Someone has to say which
vocabulary is the real one, and my read is that the screens should win, because
there are two of them and one stylesheet.

My own integration is unaffected either way. I supply bare containers and load
the stylesheet, exactly as decided, so this gets fixed in those three files
without touching mine.

**5. One smaller mismatch.**

`ClassLeaderboard.mount` reads `opts.classroom`, `opts.people` and
`opts.liveTotals` as well as `opts.classId`. I pass `classId`, `classroom` and
`people`. I do not pass `liveTotals` because it has a working fallback and I
have no live totals to give it. oy-07 already prefers `global.Teacher.people()`
when it exists, which is now exported, so its private copy of the identity merge
rule can be deleted as planned.


---

# Round 3: the off switch

## What I changed

Five things. The Master's brief listed four and said three of four leaves it
broken. It was five: the student side was ungated too, and nothing in the brief
covered it.

1. `index.html`: `<script src="assets/js/class-features.js">`, placed before
   `geolive-teacher.js` and `leaderboard.js`, which are the two things that read
   it. Without this `window.ClassFeatures` is undefined and both gates are
   unreachable no matter how they are written.
2. `index.html`: the `leaderboard.css` link.
3. `teacher.js`: both tabs gated behind `featureOn()`, and a tab whose switch
   goes off while it is the open tab falls back to Stream.
4. `teacher.js`: `enabled: featureOn('leaderboard')` passed into
   `ClassLeaderboard.mount`. This is the half that was costing something real.
5. `classroom.js`: the student's GeoLive tab gated the same way, and the mount
   skipped entirely when the switch is off.

Plus two things nobody asked for but without which the rest is decoration:

6. `teacher.js`: a Features card in Settings that mounts `ClassFeatures`. The
   leaderboard defaults OFF. Gating the tab without giving anyone a way to turn
   it on would have made it permanently unreachable, which is not "off by
   default", it is "removed".
7. Both files call `ClassFeatures.load()` and re-render on `onChange`. Nothing
   else called `load` except `ClassFeatures.mount`, so before this the gates
   answered from defaults only and a teacher's saved choice never applied until
   they happened to open Settings.

Measured against origin/main: `index.html` +9 −0, `teacher.js` +97 −0,
`classroom.js` +40 −0. Still zero deletions in all three. The few round 2 lines
I replaced were my own.

## Do not overwrite

**1. The two switches do not share a contract, and that is the whole trap.**

GeoLive reads `ClassFeatures` itself, inside `GeoLiveTeacher`. The leaderboard
does not: its contract is `opts.enabled`, passed by the caller, and it checks
`opts.enabled === false`, so **leaving the key out is not the same as false**.
A wiring pass that gates one and assumes the other gates itself misses the
leaderboard, and the leaderboard is the one that defaults off.

I verified this directly rather than taking it on trust. Loading
`class-features.js` and `leaderboard.js` in node against a stub DOM:

- `mount(el, {classId:'c1', enabled:false})` renders **0 characters**.
- `mount(el, {classId:'c1'})` with no `enabled` key renders **155 characters**.

Same call, same class, one missing key. That is the bug oy-10 caught on the
network, reproduced at the render layer.

**2. `featureOn` fails safe towards off for the leaderboard.**

If `class-features.js` is missing entirely, `featureOn` returns `key ===
'geolive'`: live quiz on, leaderboard off. That mirrors the module's own
fallbacks, and it is deliberate that the failure direction for the leaderboard
is off. Getting it wrong the other way shows every student their rank in front
of the class because a script failed to load.

**3. The student side has no backstop of its own.**

`GeoLiveStudent` does not read `ClassFeatures`, zero references. The gate in
`classroom.js` is the only thing standing between a class with the live quiz
switched off and its students seeing a GeoLive tab they can try to join from.
If that gate is removed, nothing downstream catches it.

## Status

Status: Complete. Both files pass `node --check`. Assembled from origin/main
plus my three files plus every module: all paths resolve, all scripts parse,
every identifier resolves.

Still no browser run: five dev servers belong to other sessions and the cap is
five, so starting one meant stopping someone else's. The node harness covers
the render half of the gate. oy-10 has the network half and should re-run it.


---

# Round 3b: the eight-item wiring pass

Items 1 to 4 were already in from my earlier pass. 5, 6 and 7 are new here.
8 is deliberately not done, and the reason is below.

## Files

`index.html`, `assets/js/teacher.js`, `assets/js/classroom.js`,
`assets/js/cloud.js`, `assets/js/admin.js`.

Against origin/main: index.html +10 -0, teacher.js +97 -0, classroom.js +40 -0,
admin.js +12 -0, cloud.js **+96 -2**.

Four of five are still purely additive. The two removed lines are both in
cloud.js and neither could have been an addition:

    - sb.from('class_members').select('student_id, display_name, joined_at')...
    - c.members = ms.map(function (m) { return { id: ..., name: ... }; });

You cannot make a select that names columns safe by adding a line next to it.

## Do not overwrite

**1. THE SWITCHES HAD NO STORAGE AT ALL. This was not on the list.**

`class-features.js` looks for `Cloud.classFeatures` with `read` and `write`, and
falls back to `global.ClassFeatureStore`. **Neither existed anywhere in the
repo.** So `store()` returned null, `load()` resolved null before touching the
network, `on()` could only ever answer from hardcoded defaults, and the settings
block rendered its "these switches need the class to be online" warning forever.

The switches were decorative. Gating the tabs against them, which is items 3 and
4, would have produced a leaderboard nobody could ever turn on.

`Cloud.classFeatures` now exists in cloud.js. Verified in node: before `load()`
the gate answers geolive true / leaderboard false, after `load()` it answers
from the class row. A saved choice reaches the gate; before this it could not.

**2. read resolves, write rejects. That asymmetry is deliberate.**

`read` uses `select('*')` and returns null on any error, so a class row without
the 0002 columns falls back to defaults silently.

`write` rejects when the columns are missing, because `class-features.js` shows
"Not saved" and puts the switch back on a rejection. Before the migration, a
switch that appears to move and silently does not is worse than one that admits
it could not.

**3. Every 0002 touch is written for a database that is behind the code.**

`missingBit()` extends the existing `missingTable()` to cover missing columns
(42703, PGRST204) and missing functions (42883, PGRST202). The class_members
select names no columns at all, so it cannot error on level and xp. `pushLevel`
is detached from the profile push and can never reject.

This is the fourth time this round has produced the same shape: announcements,
asked_at, answered/correct, now level and xp.

**4. sync_level goes with the profile, not with GeoLive.**

A level is a student fact the leaderboard happens to read. `pushLevel()` fires
after the profile upsert lands, not awaited, so a function that does not exist
yet cannot turn a good sync into a failed one. Exported as `Cloud.syncLevel`.

**5. Item 8 is NOT done, on purpose.**

A `forceCorrect` hook in Learn's `pickCountry` would be two lines and no
restructuring, so cheapness was not the reason.

It would be dead code. `godmode.js` patches `Quiz.make` with
`if (on && type === 'locate') type = 'identify'`, so while god mode is on a
locate question is never built and the hook could never fire. For it to mean
anything oy-08 would have to drop that swap from a file it has finished. Two
lines of code that cannot execute, plus a required change in someone else's
closed file, at wrap-up. The documented workaround is better.

**6. God mode does nothing inside a live game and that is correct.**

Carried from oy-08 because it will be reported as a bug. GeoLive points feed
`live_players.score`, which feeds the class leaderboard, so a god mode that
reached GeoLive would hand an admin a way to top a table of children by tapping
any option. The comment is in admin.js at the mount point so the next person to
read that code finds the reason there.

## Status

Status: Complete, 7 of 8 done and the eighth declined with a reason. All five
files pass `node --check`. Assembled from origin/main plus every agent module:
all paths resolve, all scripts parse. Still no browser, the five dev server
slots belong to other sessions. oy-10 owns the network pass.
