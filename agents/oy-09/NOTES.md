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


---

# Round 4: "where is the class leaderboard?"

All measurements below taken 2026-09-12 ~22:10 against origin/main f1f60d0 and
a full local assembly of it. Re-measure before acting on them.

## The answer, in two halves, because the two dashboards failed differently

**Teacher: the switch was always reachable. The feature was not.**

Settings is a plain visible tab, not behind an overflow, and the switches card
has been in it since round 3. Nothing was hidden. But when the leaderboard is
off, teacher.js omitted the tab entirely AND bounced the route back to Stream,
so there was no trace of the feature anywhere in the classroom. A teacher would
have had to already know it existed to go into Settings and look.

**Student: the leaderboard did not exist at all.**

classroom.js on f1f60d0 had ZERO references to `ClassLeaderboard` or the word
leaderboard. This was never a switch problem on that side. A student in a class
with the leaderboard switched ON had nowhere to see it, because the tab, the
panel and the mount were never written. I own that file, so that gap is mine.

## What I changed

**Teacher (`teacher.js`)**

- The Leaderboard tab is now always rendered, carrying an `Off` badge in the
  existing `cr-tab__n` slot when the feature is off. No new markup or CSS.
- Its panel, when off, says what the feature is, why it starts off, and offers
  a button that jumps to Settings.
- The route is no longer bounced away. GeoLive still is, deliberately: it
  defaults ON, so a teacher who turned it off already knows it exists. The
  leaderboard is the opposite case.
- The switches card is now FIRST in Settings, not third. It was below two cards
  in a two-column grid, so on a laptop it sat under the fold.

**Student (`classroom.js`, `cloud.js`)**

- A Leaderboard tab, shown only when the feature is on. Deliberately NOT the
  teacher's greyed-out treatment: a teacher who sees it off can turn it on, a
  student cannot, so for them an off feature is only noise.
- `Cloud.classMembers(classId)`, a standalone fetch, because `studentSync` does
  not read `class_members` and I did not add it to that batch. That batch
  carries assignments and the stream, which a student always needs, and
  class_members is a table their policy may or may not let them read. An
  uncertain read next to a certain one is the announcements outage again. Any
  refusal returns an empty list, so a policy that says no reads as an empty
  class rather than an error.

**The default is unchanged.** Off until a teacher switches it on.

## Verified in a browser, not reasoned about

A preview slot freed up, so this round is checked at runtime rather than in a
stub.

- Teacher, leaderboard off: tabs read Stream, Classwork, People, Analytics,
  GeoLive, **Leaderboard Off**, Settings. Before this change the Leaderboard
  entry was absent.
- Clicking it renders the explanation panel; its button lands on Settings with
  `What this class uses` as the first card and both switches present.
- Student, leaderboard off: tabs are Stream, Classwork, Grades, GeoLive. No
  leaderboard, correctly.
- Student, leaderboard on: the tab appears and mounts a real populated table,
  1264 characters, ranking `Ana Lv5 120/280` above `Bo Lv3 40/200`.

## Do not overwrite

**1. THERE IS NO STYLESHEET FOR THE SWITCHES, AND THIS IS THE THIRD REASON
NOBODY FOUND THEM.**

`class-features.js` renders `clf__head`, `clf__h`, `clf__sub`, `clf-row`,
`clf-row__t`, `clf-switch`, `clf-switch__dot`, `clf-switch__t`. **Eight of those
nine classes are defined in no stylesheet in the repo.** Checked every loaded
sheet at runtime and every `.css` file on disk and in every agent folder: zero
`.clf` rules anywhere.

So the switches do not render as switches. They render as a run-on paragraph:
"Live quizRun a quiz the class answers together, on their own devices.On".

Even a teacher who reached Settings would not obviously see two toggles. This
belongs to whoever owns CSS, not to me, and it is worth fixing before anyone
concludes the discoverability work did not take.

**2. The `Off` badge reuses `cr-tab__n`.**

`crTab(id, icon, label, n)` renders `n` into a `cr-tab__n` span when truthy, so
passing the string `'Off'` styles itself with markup that already exists. If
someone later changes `crTab` to coerce `n` to a number, the badge disappears
silently and the tab looks enabled while the feature is off.

**3. The two sides gate differently on purpose.**

Teacher: tab always visible, badged Off. Student: tab hidden when off. The
asymmetry is the point, and it is not an oversight to be tidied up.

## Status

Status: Complete. teacher.js, classroom.js and cloud.js pass `node --check`,
full assembly resolves and parses, and the behaviour above was verified in a
browser rather than inferred.

`index.html` needed nothing this round, so there is no copy of it in this
folder; a copy identical to main is only a diff for the Organizer to resolve.

Not done, and flagged rather than actioned: I could not verify the live value of
`leaderboard_enabled` for class DJZN4Y myself. The database read was refused by
a permission classifier in my session. The `false` reading is Master's,
measured 2026-09-12, not mine.


---

# Round 5: "the themes don't work"

Measured 2026-09-12 ~22:40, at runtime in a browser against origin/main f1f60d0.

## Master's static reading was right, and the runtime makes it worse

Confirmed exactly: `ui.js:649` border at `c1 + '33'`, `ui.js:667` colour on three
stats, and `app.css:1094` keeping the labels `var(--faint)` so only the numbers
inherit. Nothing to correct.

Two things the runtime added.

**How little it was, measured on the rendered card.** The theme controlled
**5.03%** of the card's area: 1.2% border ring at 20% alpha, 3.8% stat numbers.
The banner, which is a different purchasable slot, is **26.2%**. The loudest
quarter of the card was never the theme.

**Every `c2` is near black.** `#0A0A0B`, `#064E3B`, `#7C2D12`, `#3B0764`,
`#0C4A6E`, `#4C0519`, `#0F172A`. At 17px on white those all read as "dark text",
so even the 3.8% that was themed barely differentiated. The card background was
`rgb(255,255,255)` and the labels `rgb(156,163,175)` in all seven, identical.

So it was not a broken wire. It was built to be imperceptible, and seven themes
up to 800 diamonds were indistinguishable.

## What a theme now does

All inline style in `ui.js`. **No CSS needed from oy-06.**

- The card border at full `c1` instead of 20% alpha.
- A 3px `c1` rule under the banner, where the body starts.
- A wash down the body, `c1` at 14% fading out by 62%.
- The stats block on a `c1` tint at 8%, rounded, with a `c1` top rule.

Themed area goes from 5.0% to **73.6%** of the card.

## What it still does not touch, and this is the constraint

**The banner and the nameplate keep their own slots entirely.** Verified on the
rendered card: with Moss equipped the banner's inline style is still
`background:#F3F4F6`, its own slot's value, and the nameplate is still
`background:transparent;color:#0A0A0B`, its own. The theme sets neither.

Checked across four banners (Plain, Ink, Atlas, Savanna) against Moss and Clay:
every banner renders intact and unchanged, and the theme is still obvious on
each. A theme that repainted the top strip would make every banner in the shop
pointless and fold two economies into one.

## Do not overwrite

**1. The gradient fades to `c1` at zero alpha, not to `transparent`.**

`linear-gradient(..., c1 + '00', ...)` and not `transparent`. A gradient to
`transparent` can interpolate through transparent black in some engines and
leave a dirty grey cast down the middle of the card. This looks like a pointless
long-hand until it is changed back.

**2. The free theme is now visibly blue.**

`default` has `c1: #1B4DFF`, so a card with no theme bought now carries a soft
brand-blue wash. That is deliberate: it is the brand colour and it makes the
paid themes read as different rather than as "finally something". Anyone who
never bought a theme will still see their card change.

**3. Not a rendering problem, but worth saying once.**

Owen asked for an 800 theme to feel different from a free one. The seven are now
plainly distinguishable from each other, which is what was broken. But `rose`
and `graphite` are both 800 and `graphite` is `#475569`, a muted slate, so it
will always read as quieter than `plum` at 500. If price is meant to track
impact, that is a pricing or palette decision in `cosmetics.js`, not something
the renderer can fix, and I have not touched the data.

## Status

Status: Complete. `ui.js` passes `node --check`, +31 −3 against origin/main. The
three removed lines are the card, body and stats container tags, each replaced
rather than dropped. Verified by rendering all seven themes side by side, and
four banners against two themes, in a browser rather than reasoned about.


---

# Round 5b: Owen ruled, the body is the canvas

Measured 2026-09-12 ~23:10 in a browser against origin/main f1f60d0. This
supersedes the numbers in Round 5: that version was a soft wash fading out by
62%, and Owen's answer ("all of the white space around like bio and stuff,
make it more apparent") made clear that was still too timid. Both gradient
stops now carry colour, so the bottom of the card is not white either.

## What a theme does now

- Card border at full `c1`.
- A 3px `c1` rule where the body starts, under the banner.
- **The whole body** carries `c1` from 37% at the top to 20% at the bottom.
- The stats block sits on `c1` at 25% with a `c1` top rule.
- Every piece of text on that surface is drawn from `c2`.

## Readability, measured rather than eyeballed

This is the part that took the work. `var(--faint)` is `#9CA3AF`, which is fine
on white and fails on every tinted surface, so the greys had to be replaced.

**The alpha floor is `D1`, 82%, and it is measured.** Composited over the tinted
body, `c2` below that drops under 4.5:1. Clay is the worst case, its body is the
lightest of the seven and `#7C2D12` is the warmest `c2`: it needs 0.82 where
Default needs 0.61 and Graphite 0.65.

Set above that floor: numbers full `c2`, bio `E6`, tag `DE`, pronouns and stat
labels `D9`.

Contrast after, every text element against its own theme's surface:

| theme | bio | pronouns | tag | stat label | stat number |
| --- | --- | --- | --- | --- | --- |
| default | 10.60 | 9.41 | 9.89 | 9.41 | 12.53 |
| moss | 5.87 | 5.21 | 5.47 | 5.21 | 7.42 |
| clay | 5.34 | 4.81 | 5.01 | 4.81 | 6.56 |
| plum | 7.96 | 7.10 | 7.44 | 7.10 | 9.65 |
| ice | 5.63 | 5.02 | 5.25 | 5.02 | 7.07 |
| rose | 8.12 | 7.24 | 7.59 | 7.24 | 9.84 |
| graphite | 9.20 | 8.09 | 8.53 | 8.09 | 11.36 |

All 35 clear WCAG AA for normal text. Worst is Clay's pronouns and labels at
4.81. Before this round several sat between 3.29 and 4.43, which is why the
alphas are what they are.

**No stylesheet change was needed.** Inline beats the class rule, so
`app.css:1094` pinning `.profile-card__stat span` to `var(--faint)` is overridden
at the element rather than worked around. oy-06 is not blocked on this.

## Do not overwrite

**1. The alpha floor. `D1` is the number, Clay is the case.**

If someone pales these back toward the old greys because they look heavy, the
lighter themes fail contrast first and it will not be obvious on Default or
Graphite, which are the two most likely to be spot-checked.

**2. The banner and nameplate are still untouched, and this was re-verified.**

With Clay equipped the banner's inline style is `background:#F3F4F6` and the
nameplate's is `background:transparent;color:#0A0A0B`, both their own slots'
values. Checked across three banners against Clay, Moss and Graphite.

**3. Both gradient stops carry colour deliberately.**

`c1` at 37% to `c1` at 20%, not to transparent and not to zero alpha. A fade-out
leaves the lower half of the card white, and the lower half is where the bio and
the stats live. That white is exactly what Owen was pointing at.

## Owen's own test

Clay, Moss and Graphite side by side, which is how he found the bug: three
plainly different cards, no second look needed.

## Status

Status: Complete. `ui.js` passes `node --check`. Verified at runtime: all seven
rendered together, three banners against three themes, and 35 contrast
measurements.
