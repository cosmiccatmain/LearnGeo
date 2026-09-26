# NOTES for LearnGeo 5 OY

## Built on

Commit: ade3a48. No git that writes, so this clone never moved. The file is new
and standalone, so it does not care which commit it lands on.

Written against the settled sections of `GEOLIVE-SPEC.md`, the `live_` schema,
and oy-06's class list in `agents/oy-06/NOTES.md`.

## What I changed

- Added `assets/js/geolive-student.js`, the student's GeoLive screen. New file,
  nothing existing touched.
- `GeoLiveStudent.mount(el, { code })` runs sign-in check, join, lobby, answer,
  verdict, place, and the finish. Returns `{ destroy, phase, playerId,
  sessionId }`.
- The screen writes a choice and a time. Nothing else. It never writes
  `correct` or `points` and never scores anything itself.

## Files in this folder

- `assets/js/geolive-student.js`
- `tools/` — the class audit, the fake DOM and my behaviour suite, put here
  because Master asked me to pass them to oy-06 and oy-10. **`tools/` is not
  part of the merge.** Organizer: skip that folder, none of it belongs at the
  top of the repo.

## Status

Status: complete.

90 behaviour checks pass against a fake DOM, 14 integration checks pass
against the **real** `geolive.js` with the **real** snapshot player shape, and
a class audit: it renders every phase,
collects all 50 class names the file can emit, and checks each against
`agents/oy-06/assets/css/geolive.css` and `app.css`. All 49 are defined and nothing is borrowed any more. oy-06
shipped `.gl-alert`, `.gl-prompt` and `.gl-place.is-first/.is-second/.is-third`,
and this file is on all three.

That audit had two holes, both worth knowing about because oy-06 runs a
similar check. It was matching class names inside CSS comments, so a class
merely discussed in prose counted as styled; that one hid `.gl-question__prompt`
being deleted. And it only rendered the happy path, so a class that appears
only in an error state was never checked; that one hid `.gl-alert`. It strips
comments and drives the error states now. Both fixes are why it finds things.

Harness is at
`/private/tmp/claude-501/-Users-oky-Desktop-My-Files-Projects-LearnGeo/9eb06e53-c368-469b-93a6-797af2a6868b/scratchpad/`
as `test.js`, `classcheck.js` and `dom.js`. Not in the repo because I own one
file. Run `LIST=1 node classcheck.js <my file> <css files>` to print what I emit.

Never run against the real `GeoLive` or `GeoLiveCloud`. Until
`0002_geolive.sql` is applied, `watch()` never fires and reports no error, so a
screen that looks dead is probably that and not this file.

## Do not overwrite

**The five behaviours.** Each is deliberate and each is easy to undo:

- A second tap on the same question never sends. The lock is set before
  anything async runs and is keyed to the question index, not a bare boolean,
  so it survives the question changing underneath it. The keyboard goes through
  the same lock.
- A tap after the clock runs out is stopped here rather than sent off to be
  refused, and says so.
- Points are never invented. In order of trust: a number the network handed
  back, else the amount our own total actually moved by in the standings, which
  the rules scored from the real rows. A refusal returns null, moves nothing
  and claims nothing. No path prints a zero for an answer that was not counted.
- The drain is wound forward with a negative `animation-delay` worked out from
  the wall clock. That one line is what makes both a late joiner and a woken
  phone show the right amount of time left, with no ticks counted in JS.
  Waking also re-renders and re-subscribes.
- A send that fails hands the question back and unlocks. Nothing reached the
  server, so there is no first answer to keep, and a retry is safe because a
  duplicate is refused. Master confirmed this one.

**Round three and four changes:**

- Renamed everything to oy-06's list. Container `.gl` + `.gl--student` added by
  mount and removed by destroy, `data-phase` on the same element. Targets are
  `.gl-target--a` to `--d` inside `.gl-targets`.
- Guests are gone. `live_join` needs an account and the answer policy matches
  on `auth.uid()`, so there is no guest path and no guest id fallback.
- The `updated_at` proxy is gone. `asked_at` is stamped by a database trigger
  now, so it is the real thing.
- Timing goes through oy-03. `snap.msLeft` is preferred, exactly as oy-03 asks,
  paired with the snapshot's own `at` so the whole sum stays device-local and a
  wrong phone clock cannot get into it. `asked_at` is the fallback and is
  measured against `GeoLiveCloud.serverNow()`, never raw `Date.now()`, because
  a phone a few seconds out is a quarter of a twenty second question. With
  neither, still no countdown rather than a wrong one.
- `msLeft` of 0 is treated as no time left, not as no countdown. They are
  different and oy-03 made them different on purpose.
- `answer()` now resolves to `{ accepted: true }` or null, so refused and
  "in, the host will score it later" are finally distinguishable. A refusal no
  longer falls through to comparing the choice against the revealed answer, so
  the screen can never say "Right" about a tap that was never counted. It says
  it did not count, claims no points, and does not mark their target wrong.
- `answer()` is three-way now: `{accepted:true, first:true, row}`,
  `{accepted:true, first:false, row}`, or null. On `first:false` the screen
  switches to `row.choice`, the answer that actually counted, rather than
  showing the tap that did not. My retry path can genuinely reach this: a send
  that looked like it failed may have landed, and then they tapped something
  else. `row.correct` and `row.points` are used when the host has filled them
  in, and the standings delta stays as the fallback.
- Countdowns are gated on `GeoLiveCloud.clockSource`. While it is `device`,
  nothing derived from the server clock is trusted, because a phone 90 seconds
  out reads a 20 second question as a hundred. A question we watched open is
  still timed, because that is a local subtraction either way, and an untrusted
  clock never blocks a tap. Once the offset is real, late joiners get a proper
  countdown.
- Join and send errors carry now. They were `gl-verdict__note t-muted` with
  `role="alert"`, which is a muted grey error on a phone in a noisy room at the
  moment a student is trying to get into a game. They are `gl-alert auth-error`
  now: `gl-alert` is the name oy-06 is writing a rule for, `auth-error` is
  app.css's existing error box, borrowed so it is visible today. Once
  `.gl-alert` lands, tell me and I will drop the borrowed one.

**The player id inside a game is the `live_players` row id, not the account
id.** Verified rather than assumed, after Master flagged it as a silent break:
`join()` hands back the row id, `GeoLive.standings` maps `p.id` straight from
`session.players`, and the snapshot carries `id` as the row and `student_id`
as the account. My screen keys on the row id throughout and there is an
integration check with the two deliberately set to different strings, plus a
negative control that keys on the account id and correctly finds nobody. The
account id is used for exactly one thing, the `join()` call, which is where it
belongs. Worth knowing: oy-03's `join()` accepts `memberId` and never reads it,
because `live_join` takes only the code and the name and trusts `auth.uid()`.

**The lobby no longer claims who has turned up.** `players` is who the teacher
seated: `joined_at` is stamped when the room opens, so nothing in the snapshot
means "present" yet. It used to say "12 people in the room", which was a
presence claim built on a roster. It says "Set up for 12 players" now, which is
true of what is actually there. Once `live_join` stamps arrival this should
become a count of who is really here, which is the version worth having.

**A late joiner GeoLive has never heard of is handled.** Until oy-02's
`addPlayer` lands, a student who joins mid game has no row in `players`, so
`standings` cannot find them. No place is claimed, nobody else is marked as
them, the end screen still renders, and nothing throws. Tested against the real
module.

**Things oy-06 should look at when re-rendering against this:**

1. I render the phase straight into the container with no wrapper, because
   `.gl--student` is a flex column and `.gl-targets` is `flex: 1`. A wrapper
   would stop the targets filling the phone. There is no `.gl-stage` on the
   student side for that reason.
2. On the reveal, `.gl-verdict` has `margin: auto 0` and `.gl-targets` has
   `flex: 1`, and both are on screen at once competing for what is left. It may
   need a rule for the student reveal specifically.
3. There is no class for a numeric countdown, so I dropped the seconds number
   and use your bar alone. When there is no timestamp I emit no `.gl-timer` at
   all and put "Answer fast" in `.gl__eyebrow`.
4. I set `--gl-secs` and `animation-delay` inline on `.gl-timer__bar`, and add
   `.is-low` to `.gl-timer` on a timeout rather than a polling loop.
5. There is no general note or error class, so small plain text reuses
   `.gl-verdict__note` with `.t-muted`. Say the word if you would rather have a
   dedicated one and I will switch.
6. The join button uses the app's own `.btn .btn--accent .btn--lg .btn--block`
   because `geolive.css` defines no button. The click hook is `data-gl-go`, an
   attribute rather than a class, so every class this file emits is one you own.
7. `.gl-question__prompt` and the `.gl-podium` set are listed under the teacher
   in your notes, but the student needs both. I use them as written.

**Rank is a class, not a custom property.** `--gl-i` is gone from the place
line. oy-06's reasoning is right and worth keeping: a custom property is a
value, and CSS cannot branch on a number without style queries, so no rule
could ever have read `--gl-i` on a single line of text. The instruction to set
it was not implementable, which is why nothing slid. Rank goes on as
`.is-first`, `.is-second` or `.is-third` now, which oy-06 styles, using the
same three names already on the podium.

**Nothing is borrowed any more.** The question text moved off the teacher's
`.gl-live__q` onto `.gl-prompt`, and oy-06 kept both working so there was no
flag day. The errors moved off app.css's `auth-error` onto `.gl-alert`.

A note on how the prompt one went, because the lesson is not about CSS. I told
Master no student prompt class existed. I had checked for
`.gl-question__prompt` and `.gl-ask__q`, which were my guesses at what it would
be called. It was `.gl-prompt`, and it had been sitting in the file since
20:28. Grepping a file for names I had invented told me only that I had
invented them, and I reported the absence as fact.

**Hooks I need from oy-09:**

1. `<script src="assets/js/geolive-student.js"></script>` after `geolive.js`
   and `cloud-geolive.js`.
2. A bare div and a call to `GeoLiveStudent.mount(el, { code })`. `code` may be
   empty. Do not put classes on the div, mount does it.
3. If a code arrives in the URL, pass it as `code`. The name step still runs.
4. Call `destroy()` when the view is left, so the watch, the timeout and the
   keyboard listener all stop.
5. You do not need to gate on sign-in for the student. The screen does it
   itself and explains why an account is needed.

## Round 3, testing GeoLive end to end from the student side

138 checks pass: 90 behaviour, 14 integration against the real `geolive.js`,
34 for this round. Harnesses in `tools/`, still not for the merge.

### The one that matters most: a student cannot score from a snapshot

`GeoLive.standings()` and `GeoLive.answered()` cannot read what
`GeoLiveCloud.watch()` hands a screen. The two shapes were never joined up:

- oy-02's session keeps `answers` as one object per question, keyed by player,
  and carries running totals on `players[]`.
- oy-03's snapshot returns `answers` as a flat array of database rows, and
  `players[]` straight from `live_players`, where `score` is **0 for the whole
  game** because nothing writes that column until `saveStandings` at the end.

Fed a real mid-game snapshot, measured not reasoned:

- `standings()` returns every player on 0, so everyone is joint first all game.
- `answered()` returns **6**, because `answers[index]` lands on the first row
  and it counts that row's columns. Six is a small plausible number, which is
  the worst kind of wrong.

oy-04 does not hit this, because the teacher's screen keeps its own GeoLive
session and replays the raw rows into it. That replay is the missing adapter,
and it currently lives inside the teacher screen. The student has no session
to score with.

This needs a builder decision, not a third copy of scoring in my file: either
oy-03 shapes the snapshot into what the rules module accepts, or oy-02 accepts
raw rows, or oy-04's replay is lifted somewhere both screens can call. The
spec's rule that scoring lives in exactly one place is the reason I have not
written my own.

It also changes the premise of the "keep the standings delta" ruling: the delta
is derived from totals that are never maintained during a game, so it yields
nothing. It is not wrong, it just cannot fire yet.

Two guards added here in the meantime, because a wrong number is worse than no
number: the place display is suppressed when any answer has scored and no
player's total reflects it, and an answered count larger than the number of
people playing is treated as no count at all. A genuine early zero still shows
a real place.

### Also found, not mine to fix

1. **Nothing reads `geolive_enabled`.** oy-01 added the column and an RLS
   policy that uses it, but no JavaScript anywhere reads it. ROUND3.md says
   off means no tab, no mount and no network call; none of that exists on the
   client yet. The tab always renders, the student screen always mounts, and
   it always calls `join` and `watch`.

2. **`setEnabled(false)` stops every watch without telling a single screen.**
   oy-03 calls `onChange(null)` when a watch is *started* while disabled, but
   the watches it stops in `setEnabled` are just halted. A student mid
   question is left on a dead frame, tapping into nothing. The fix is one line
   for consistency with what `watch` already does, and it is oy-03's.

3. **A session deleted mid-watch produces no callback at all.** `snapshot()`
   returns null and `watch` simply does not wake the screen, so there is no
   signal to react to. Same student-visible result as 2 and there is nothing
   a screen can do about it from its side.

4. **The clock closes nothing.** `GeoLive.answer` accepts any `ms`: 999
   seconds into a 37 second question still scores the full 600, because the
   limit only scales the bonus. Only the teacher advancing actually closes a
   question. This matters because my screen blocks a tap once time is up, so
   a student on this client is *penalised* against one on a client that does
   not guard, who would still get 600. Either the rules should refuse
   `ms > limitMs`, which reads like "the question has closed", or every client
   has to guard identically. It should not be left to whoever remembers.

5. **`joinedAt` and `joined_at` mean opposite things.** oy-02's `joinedAt` is
   the question index a player arrived at, where `0` means "here from the
   start". oy-01's `joined_at` is a timestamp or null, where null means "never
   turned up". One letter apart, both go falsy, opposite meanings. Anything
   testing either for truthiness is wrong half the time.

6. **oy-09 never calls `destroy()`.** `wire()` mounts the student screen and
   discards the handle, so every re-render of the classroom leaves the old
   instance alive: still subscribed, still listening for keys, still drawing
   into the same container. Two instances answered twice from one keypress.

### Fixed here

- **A null snapshot is handled.** It was being ignored, which threw away the
  one signal oy-03 sends to say "switched off" or "not set up". The screen now
  says the game has stopped and that nothing tapped will count, drops the
  timer, and stops accepting keys.
- **Mounting twice is safe.** A second `mount()` on the same container takes
  the first one down. oy-09 should still call `destroy()`, but a module that
  cannot survive being mounted twice is fragile whatever the caller does.
- **The lobby says who is actually here.** `joined_at` is nullable now, so
  presence is real: it counts arrivals only, reads `joined_at` and never
  `joinedAt`, and falls back to the seated wording only when a snapshot
  carries no `joined_at` at all.
- **My own bug, and the 37 second test is what caught it.** Timing was read
  only when the question index changed, so a corrected `msLeft` for the
  question already on screen was thrown away. At the 20000 default nothing
  looked wrong. It now reads timing from every snapshot that carries it.

### One gap closes itself on apply

`live_now()` is in oy-01's SQL and oy-03 calls it, verified in both files. Once
the migration is applied, `clockSource` is `server` from the moment a student
joins, so the no-countdown fallback for a student's first question stops firing
on its own. Nothing to change here: this file already prefers server timing and
only falls back when the clock cannot be trusted. Until the migration is
applied, `watch()` never fires at all, so none of GeoLive runs end to end and
that is not a fault in any session's file.

### Verified working

`addPlayer` seats a mid-game joiner at 0 and their answers count. A rejoin
returns the same player with score and seat intact, adds nobody, and does not
duplicate them on the board. Both were silent failures last round.

## Round 4: the join screen in the screenshot. Measured 2026-09-12.

**My markup is not what puts the form in the corner.** Both causes are in
`geolive.css`. I proved it by simulating a CSS-only fix in a browser with my
markup untouched, and the form centred perfectly. So there is nothing to change
here, and changing the markup would only fight oy-06's fix.

Reproduced the reported screen: oy-06's real `geolive.css` and `app.css`, my
real `geolive-student.js`, mounted into a 1400 by 800 panel the way oy-09 does
it. Harness at `tools/`, served from my scratchpad.

Measured, all 2026-09-12:

| what | number |
| --- | --- |
| `.gl-join` width | 380px, its own `max-width` |
| its offset from the left edge | 16px, the container padding |
| white above the form, 1150px viewport | 448px |
| `.gl--student` height in a 798px panel | 1150px, overflowing |

**Cause 1, vertical.** `.gl--student` has `min-height: 100dvh`. Embedded in
oy-09's tab panel the screen does not own the viewport, so on any viewport
taller than the panel the column is sized to the wrong box, overflows, and
everything inside it centres against a box the student cannot see. At a 1150px
viewport that put 448px of white above the form, which is the "fell down a lift
shaft" effect. `min-height: 100%` fixes it.

**Cause 2, horizontal.** `.gl-join` is `width: 100%; max-width: 380px;
margin: auto 0`. The `0` is the inline margin, so there is no horizontal
centring at all, and in a column flex container the item falls to the cross
axis start, which is the left edge. `margin-inline: auto` fixes it.

**A warning for oy-06, because the obvious fix breaks the tiles.** Putting
`align-items: center` on `.gl--student` centres everything, and it collapses
`.gl-targets` from 1326px to **286px** and the prompt from 1326px to 247px,
measured. That shrinks the answer tiles, which is the one thing Master ruled
must stay big. Centre the narrow blocks individually with `margin-inline:
auto` on `.gl-join`, `.gl-wait` and `.gl-verdict`, and leave the stretch
default alone so the tiles and the prompt keep the full width.

Two lines, and it holds across every phase I can render:

```css
.gl--student { min-height: 100%; justify-content: center; }
.gl-join, .gl-wait, .gl-verdict { margin-inline: auto; }
```

**Not mine either:** "bigger" is `max-width: 380px` on `.gl-join` and the font
sizes, all in the stylesheet. I have not touched them and have not invented a
class. If a new one is wanted for a centred column, say the word and I will
take a name from Master rather than pick one.

**What I could not test.** No live game, because `live_players` has a
recursive SELECT policy and the migrations are not applied. Everything above is
static rendering of real markup against real CSS, which needs no database.

## Round 4 continued: ties and the two waiting states. Measured 2026-09-12.

154 checks pass: 90 behaviour, 14 integration, 50 for these rounds.

**An inconsistency with the teacher's board, found by reading oy-04 rather than
assuming.** My place was a competition rank, `1 + how many scored higher`, so
two students level on points both read "2nd". oy-04's board numbers rows by
position, `i + 1`, so the projector at the front of the room has them 2nd and
3rd. A student would have seen a better number on their phone than the class
saw on the wall, which is the exact "this is broken" moment the ruling is
trying to prevent. My place is now the position in the standings, so the two
agree.

**Ties now say why.** On the reveal, a short line naming who they are level
with. At the end, where there is time to read it, the rule as well: "Level with
Sam. Ties go on correct answers, then speed, then who joined first." Kept to
one line and no em dashes.

**Joining while an answer is on screen now has a design.** It had none, and
what it did was worse than nothing: it told a student who had just walked in
"You missed that one, nothing sent in time", which is both wrong and faintly
accusatory. The screen can tell the two apart because it records the question
it watched go live, so a student who was present and stayed silent still gets
"You missed that one", and one who was not in the room gets "You are in, next
question shortly" with no points claimed and a real place shown. Verified in a
browser, not only in the harness.

**Zero players holds.** An empty room renders the waiting screen, claims no
attendance count and invents no place from an empty board.

**A warning about my own preview harness.** It serves a copy, so it renders
whatever was last copied into the scratchpad, and the browser caches that copy
on top. I read a stale screen twice and nearly reported a working feature as
broken. Anything driving `tools/preview.html` should re-copy the file and bust
the cache before believing a screenshot. The browser checks above were taken
after fetching the source fresh and re-evaluating it.

## Round 5: god mode on the student screen. Measured 2026-09-12.

171 checks pass: 90 behaviour, 14 integration, 67 for rounds 3 to 5.

**Two call sites, one boolean.** `godOn()` reads `global.GodMode.on` and
returns false when GodMode is absent, so a page that never loaded it behaves
exactly as before. Nothing else in the file branches on it.

1. **The marking.** While a question is open, the correct target carries the
   words "god mode answer" and an aria-label saying so. Deliberately a written
   word and not the reveal's colouring, because in a test session "god mode is
   showing me the answer" and "the answer has been revealed" are one keystroke
   apart and must not look alike. Tested: no target carries `is-right` while
   the marker is up.
2. **The rewrite.** At the single point where a tap becomes an answer, the
   choice becomes `q.answer`. It never writes `correct` or `points`: a
   student's device is not allowed to grade itself and this is not the
   exception. The real answer goes to the server and the teacher's grader
   marks a genuinely correct answer. `S.choice` takes the rewritten value, so
   the lock, reveal, verdict, points and place all stay consistent with what
   was actually sent, which is what keeps god mode out of the rest of the file.

Survives every state, tested: a second tap still sends one answer, a closed
question stays closed, the keyboard goes through the same rewrite, the
mid-reveal walk-in state is unchanged, and a question with no `answer` field
marks nothing and submits the tap untouched.

### Two corrections to the brief

**`godmode.js` is oy-08's, not oy-09's**, and it is already merged at
`assets/js/godmode.js`. The gate is `global.Admin.unlocked` from
`assets/js/admin.js:290`. oy-09's folder holds no god mode file at all.

**The leaderboard worry is narrower than stated.** The brief says a god-mode
player must not end up on the class leaderboard, and cites that as why god mode
was kept out of GeoLive. Read rather than assumed: `leaderboard.js` ranks on
**level**, and its header says level comes from answered questions and
"deliberately not from GeoLive's points". Level comes from XP via `W.award()`,
which `godmode.js` patches to award nothing while it is on, and this screen has
never called `award()` at all. So god-mode play cannot move a student up the
term-long table.

What it does move is the **in-game standings**, which is the projector during a
lesson, and that is real: a god-mode player will beat the class in the live
game. That is inherent in the ruling that real points must land, and it looks
like the intended behaviour for a testing tool rather than a defect. Worth
saying out loud so nobody later reads it as an oversight.

### One thing I need ruled

A louder treatment for the marker wants a class, and I am not inventing one.
I propose `.gl-target--god` on the marked target so oy-06 can make it
unmistakable at a glance. Until then the marker is words in `.gl__eyebrow`,
which is defined and correct but small.

### What I could not exercise

No live game. `live_players` still has the recursive select policy and 0003 is
unapplied, so nothing here has been through a real join, a real grader or a
real `saveStandings`. Specifically unverified: that the teacher's grader does
mark a rewritten choice correct, and that the points land in `live_players`.
Both are the mechanism the ruling rests on and both are one round of real
testing away. Everything above is this screen against stubs, against the real
rules module, and rendered in a browser against the real stylesheet.

## Round 5 fix: the banner. Measured 2026-09-15.

181 checks pass: 90 behaviour, 14 integration, 77 for rounds 3 to 5.

**I did both of the two options, because neither one fixes it alone.** Reading
oy-09's file rather than the summary: `liveReveal` and `liveChoice` both call
`setLive(true)`, and **nothing anywhere calls `setLive(false)`**. So routing
through them, which was the suggested option 2, stops the banner under-claiming
and leaves it over-claiming for good: once any god-mode question has been on
screen the banner says a game is being recorded until the tab is closed. That
is the same lie pointing the other way, which is exactly what I was warned to
avoid.

So: the marking and the rewrite now go through `liveReveal` and `liveChoice`,
which removes the duplicated logic, **and** the screen calls `setLive(true)` at
mount and `setLive(false)` at unmount, which is the only thing that makes it
true at both ends.

It reports at mount even when god mode is off, because the operator can switch
god mode on without remounting, and then the banner needs to already know where
it is.

**Verified against the real `godmode.js`, not a stub**, in the order that was
broken:

| step | banner |
| --- | --- |
| god mode on, not yet in GeoLive | nothing is being recorded |
| walk into GeoLive | **this game IS recorded** |
| leave the tab | nothing is being recorded |

And in the same page: one target marked "Lima, god mode answer", tapped Buenos
Aires, `Lima` handed to the network, Lima shown as picked, no reveal colouring
while the marker is up.

**A screen thrown away without `destroy()` now takes itself down.** oy-09 still
never calls it, which I have reported three times. Until it does, a tab switch
left my watch polling and would now leave the banner claiming a live game after
Owen has left GeoLive. The screen checks on each render whether its container
is still in the page and destroys itself if not, which clears the watch, the
timer and the banner. It is a net, not a substitute: `destroy()` is still the
right call and the mount-time half of the banner fix depends on nothing else.

**An older godmode.js without the surface is off, not a crash.** Tested with
`liveReveal`, `liveChoice` and `setLive` all deleted: no marker, and the tap
goes through untouched.

**The grader link, mostly closed.** Not my measurement: LearnGeo Master queried
production on 2026-09-15 and reported 11 answers, 5 graded correct, 5 scored
with points, max 971, across 2 games, with zero correct-but-unscored rows. On
those numbers the teacher's grader is working in production and `applyRecorded`
is completing rather than half-writing. I have not re-run that query and cannot
from here, so treat it as Master's number with Master's date, not mine.

That closes the half I could not see. My rewrite happens before submission, on
the device, so what reaches the grader is an ordinary answer that happens to be
right and the server cannot tell the difference, which is the whole design.
Pair it with my own browser run, where Lima was handed to the network after
Buenos Aires was tapped, and the chain is evidenced in two halves that meet.

**What is still genuinely unproven**, and it is now one small thing rather than
a whole link: nobody has run a single god-mode answer through a real game and
read that row back. Until someone does, the two halves are joined by reasoning
rather than by one observation. It is a minute of work for whoever next opens a
real game.

## Round 6: class tags, the student side. Measured 2026-09-25.

224 checks pass: 90 behaviour, 14 integration, 77 rounds 3 to 5, 43 for tags.

### A student can only be in one class, so this is a toggle, not a picker

`core.js:125` is `enrolled: null, /* { code, className, name, classId? } once
joined */`. A single object or null. `cloud.js`'s `leaveClass()` takes no
argument because there is only ever one to leave, and a repo-wide search finds
no list of a student's classes anywhere.

So "if a student is in three classes they pick one or none" describes a state
this app cannot currently produce. The student side of the feature is: wear
your class's tag, or do not. Building a one-of-several picker would add a
branch no student can reach, which is the thing ruling 4 forbids.

I have built it so that becoming a list later changes one function,
`enrolled()`, and nothing else. The worn value is stored as a class id rather
than a boolean for the same reason.

### Every dependency is unbuilt, verified rather than assumed

No `tag_class_id` anywhere, no `0005` in `supabase/deployed/`, no cloud call,
and `cosmetics.js` has badge glyphs for shop items but nothing for tags. So
there is no tag data in this app today and nothing I write can be exercised
against real values yet.

That is fine for the half I built, because the correct behaviour with no data
is to render nothing, and that is testable now.

### What is in: `assets/js/classtag.js`, a new file

`ClassTag.mark(subject, size)` follows `verifiedMark(profile, size)`: markup or
an empty string, never anything between. Plus `adopt`, `drop`, `wear`,
`wearing`, `available`, `worn`, `clean`.

Against the four rulings:

- **Four letters, A to Z, upper case.** `clean()` refuses everything else.
  Lower case from a teacher is tidied rather than refused, since that should
  not be the reason a tag vanishes.
- **Never guess.** An unknown, malformed or absent tag renders as the empty
  string. No placeholder, no box, no spinner. A person object with no tag of
  its own renders nothing and never borrows the viewer's tag.
- **A tag is not a name.** Its own `<span class="ctag">` with
  `aria-label="Class tag GEOG"`, letters in their own child span, glyph marked
  `aria-hidden`. The name is never inside it.
- **Costs nothing when off.** Rendering and reading make no request and no
  save. With no class tag, which is the shipping case, the whole file is inert.

**Dropping is tested before adopting**, as instructed. Dropping twice does not
double-save, dropping when already bare does nothing, a drop reaches the
network as an explicit `null` rather than as a missing call, and a drop whose
network call fails still drops locally. Adopt and drop share one function so
the less-used path cannot rot.

### Seams I need named rather than invented

1. `CloudTag.setWornTag(classIdOrNull)`, oy-03's. Called if present, skipped if
   not, and the choice still lives in the student's own save either way.
2. `Cosmetics.tagGlyph()`, oy-02's, since the glyph names are not mine. Absent,
   a tag renders as four letters, which reads fine.
3. The class's tag has to arrive on `state.enrolled.tag`. Nothing puts it there
   yet.
4. `.ctag`, `.ctag__t` and `.ctag__g` need rules, and with oy-06 gone I do not
   know who owns the stylesheets now.

### What I have deliberately not done

I have not edited `classroom.js` or `ui.js` yet. With `0005` unapplied and no
tag data anywhere, wiring them now would add dead code to files that are live
and in front of real students, to render something that cannot yet exist. The
wiring is small and I would rather do it when there is a tag to show. I did
wire `geolive-student.js`, because that file is mine either way and the call
costs nothing: podium names ask for a tag and get an empty string today.

### A note on where the harnesses live

The scratchpad was wiped between sessions and took every test harness with it.
They survived only because they are also in `tools/`, which is where they
should be run from. Earlier notes pointing at a scratchpad path are stale.

### The adopt control, and why I cannot build its list reliably yet

242 checks pass: 90 behaviour, 14 integration, 77 rounds 3 to 5, 61 for tags.

The control is built from `ClassTag.choices()`, which is the student's own
memberships with "none" as the first entry and a real choice rather than an
escape hatch bolted on the end. `wear()` validates against the same list, so
the guard and the offer cannot disagree, and nothing outside it ever reaches
the network for the profiles policy to refuse. A class with no tag is left out
rather than shown greyed, because there is nothing to wear.

**But `state.enrolled` is not a reliable membership list, and here is the
mechanism.** `classroom.js:305` switches class by joining the new one and then
calling `leaveClass()`:

```js
if (e.classId) C.leaveClass().catch(function () {});
```

Fire and forget, with an empty catch. A leave that fails is swallowed, nothing
retries it, and the student is left a member of both classes in the database
while `state.enrolled` records only the new one. 0005's policy will happily let
them wear either tag, because they really are a member of both. My list would
show one.

That is exactly the failure named in the brief: a picker that silently shows
fewer classes than a student is in. So per the instruction I am routing it
rather than guessing: **oy-03 should expose the membership list**, and I read
it through `CloudTag.myClasses()` when it exists, tested with two memberships.
It needs to be a plain array read from already-loaded state rather than a
promise, so the control stays free when nobody is wearing a tag.

Until that lands the fallback is `state.enrolled`, which is correct for a
student in one class, which is every student who has never had a leave fail.
I would rather ship that than block, but it is a known under-report and not a
guess I am comfortable leaving unlabelled.

**Not fixed by me:** the swallowed `leaveClass()` is a real bug in its own
right, older than tags and nothing to do with them. A student who thinks they
left a class is still in it, still visible to that teacher, and still counted.
I have not touched it because it is live in front of students and changing
class membership behaviour is not what this round is for, but somebody should
own it.

## Round 6, corrected: the tag already exists. Measured 2026-09-25.

241 checks pass: 90 behaviour, 14 integration, 77 rounds 3 to 5, 60 for wearing.
Integration now runs against the live `assets/js/geolive.js`, because
`agents/oy-02/` has been cleared.

### `global.ClassTag` was already taken, by another file in the shared tree

`assets/js/class-tag.js` exists on disk. It owns the teacher's control,
the four letter rule, the markup, and exports:

```js
global.ClassTag = { mount, clean, length, html(text, mark) }
```

`html` is commented "so whoever renders a tag beside a name can use the same
markup". That is the seam, already built and already named, and I was about to
write a second one.

My file also defined `global.ClassTag`. Two scripts defining one global means
whichever loads second silently erases the other: either the teacher's control
stops mounting, or my wearing logic disappears, and neither throws. Renamed to
`WornTag`, which is what it actually is.

Three more things already existed that the brief told me to create:

- `assets/css/class-tag.css`, with `.ct-tag`, `.ct-tag__txt`, `.ct-tag__mark`.
  I was told to create `assets/css/classtag.css` and emit `.ctag`. Different
  names, so my tag would have rendered completely unstyled beside children's
  names. I did not create it.
- The `<link>` in `index.html`, already at line 18. I did not add one.
- The four letter rule. I now call `ClassTag.clean` when it is there rather
  than keeping a second copy.

So this file is only the half that genuinely did not exist: the student's
side. Wearing, adopting, dropping, and handing the shared renderer the right
text. It renders nothing at all when `class-tag.js` is absent, because
unstyled markup beside a child's name is worse than no tag.

### The seams, as actually built rather than as described

`Cloud.wearTag(classIdOrNull)`, `Cloud.myTag()` and `Cloud.classTag.read()`
exist in `agents/oy-03/assets/js/cloud.js`, not yet merged. Names confirmed by
reading them. `wearTag` **rejects** rather than resolving when offline, so both
outcomes are handled and neither changes what the student sees.

`state.enrolled.tag` is populated by oy-03's `applyEnrolledTag`, whose comment
names this file. Confirmed.

**But `applyEnrolledTag` keeps only `e.tag` and throws the glyph away**, while
`readClassTag` returns `{ tag, glyph }`. So a glyph can never reach a rendered
tag until oy-03 also caches `e.tagGlyph`. I read that key already, so it starts
working the day they add it. Letters only until then, which the brief says is
the permanent fallback anyway.

`Cosmetics.tagGlyph(name)` does not exist and I no longer call it. The live
`class-tag.js` owns the glyph set and resolves the mark itself, so a second
glyph source would be a second thing to drift.

### It is a toggle

Confirmed with Master: a student is in one class. `memberships()` is a list of
one and is the single function that changes if that ever stops being true. No
picker. `toggle()` is one call in both directions so the drop path cannot get
less use than the adopt path.

### Still not wired, deliberately

`classroom.js` and `ui.js` are untouched. 0005 is unapplied, so there is no tag
to show, and adding dead code to files running in front of real students is
worse than waiting. `geolive-student.js` is wired because it is mine anyway and
the call costs nothing. This gap is a decision, not an oversight.

## The leave bug, as its own item. Fixed 2026-09-25.

249 checks pass: 90 behaviour, 14 integration, 77 rounds 3 to 5, 68 for wearing.

### What was wrong

`classroom.js`, the class switch path:

```js
if (e.classId) C.leaveClass().catch(function () {});
```

A leave that failed was swallowed. The student believed they had switched, and
was still a member of the old class: still on that teacher's roster, still
counted, still a member for any rule that asks. Nothing said so, so nobody
found out.

### There were two silent paths, not one

The empty catch was the obvious one. The other is in `cloud.js`:

```js
function leaveClass() {
  var e = W.state.enrolled;
  if (!ready() || !e || !e.classId) return Promise.resolve();
  ...
}
```

It **resolves** when the connection is not ready. It reports success for
something it never attempted, so removing the catch alone would still have
left that path silent. Both are closed here: the rejection is reported, and
`C.ready` is checked before calling rather than waited on afterwards.

`cloud.js` is oy-03's. The honest fix is for `leaveClass()` to say whether it
actually left, and then the readiness check here can go. Routed.

### What I did not change

The join-first order stays, and the comment above it is still right: if the
new code turns out not to work, the class they are already in is still theirs.
No retry was added, because a retry that also gives up quietly is the same bug
with more code. Only the silence changed.

Scope check: the deliberate "leave class" path at `classroom.js:549` already
toasted on failure. Only the switch path was silent, so only the switch path
was touched.

### Namespace

Master's ruling crossed my turn. There are no `CloudTag` references: the file
is `worntag.js` now, exports `WornTag`, and calls `Cloud.wearTag`,
`Cloud.myTag` and `Cloud.myClasses`. `Cloud.myClasses()` is wired and tested
with two memberships; `state.enrolled` remains the labelled fallback until it
lands.

### One of my own tests was wrong

`{ tag: 'nope' }` as an example of an unusable tag. It uppercases to `NOPE`,
which is four letters A to Z and perfectly valid, so the test was asserting
the opposite of what it claimed. The failure was the code being right. Using
`GEOGRAPHY`, `GE0G`, `AB` and `null` instead.

## Correction: what I called live was not live. 2026-09-25.

I wrote that `assets/js/class-tag.js` and `assets/css/class-tag.css` were
merged and live. They are not. `origin/main` is `ad0287e` and contains
neither, and `index.html` is modified on disk and unmodified on main. They are
oy-04's in-flight work, written into the shared tree rather than into
`agents/oy-04/`.

I read files in a tree nine sessions share and inferred from their presence
that they had shipped. A file on disk in a shared tree has no state you can
infer from it being there: it is not main, it is not reviewed, and it may be
half-typed. Presence is not merge.

**What still stands**, and none of it depended on the file being merged:

- The `global.ClassTag` collision. Two files defining one global means
  whichever loads second silently erases the other, with no error anywhere.
  `WornTag` stays.
- The class name mismatch. oy-04 styles `.ct-tag`, `.ct-tag__mark`,
  `.ct-mark` and `.ct-tag--empty`; I was emitting `.ctag`. Unstyled markup
  beside a child's name.
- Not claiming `index.html` and not writing a second stylesheet.

**What was wrong, beyond the premise.** I concluded that `class-tag.js` owned
the glyph set, so a `Cosmetics` source would be a second thing to drift, and
recommended dropping that instruction. The file does the opposite, and says so
at line 43: "Built from Cosmetics.tagGlyphs, never from a copy of it." It
delegates the list and the mark to oy-02 deliberately. So there is exactly one
glyph source, it is oy-02's, and `Cosmetics.tagGlyph` exists with tests in
`agents/oy-02/`, correctly inside its own folder. The instruction should
stand and I was wrong to say otherwise.

No code changed for any of this. This file passes a glyph **name** through to
the shared renderer and never resolves one itself, which is right whichever
file owns the glyph set. Only my reasoning about it was wrong, and only the
notes needed fixing.

## classroom.js is no longer untouched

Worth stating plainly because two messages crossed: the leave fix above is in
`assets/js/classroom.js`, which was assigned to me as its own item. The tag
wiring in `classroom.js` and `ui.js` is still deliberately not done, which is
a different thing, and that is what "untouched on purpose" refers to.

## Correction: the leave fix is 26 lines, not 363. Measured 2026-09-25.

I wrote that `classroom.js` was 363 lines ahead with other sessions'
uncommitted work in it. That was wrong, and if the Organizer had believed it,
it would have held a clean 26-line fix while investigating something that does
not exist.

Measured properly:

```
HEAD         ade3a48   32 commits behind
origin/main  ad0287e
disk vs origin/main    25 insertions, 1 deletion, one hunk
disk vs HEAD          363 insertions, 35 deletions
```

The one hunk against `origin/main` is my leave fix and nothing else. The
`liveStudent` teardown handle and the `ClassFeatures` gating I mistook for
other people's work in progress are **already on main**, merged in `87349bd`,
which is my own round-5 teardown. They only looked uncommitted because this
clone's HEAD predates them by 32 commits.

**In this repo HEAD means nothing and `origin/main` is the only reference
point that does.** Any session diffing against HEAD here will see thirty-two
commits of shipped work as if it were uncommitted changes.

This is the same mistake as reading `class-tag.js` as merged, one layer along:
there I inferred shipped from present, here I inferred uncommitted from
differs-against-HEAD. Both times the fix was to check against `origin/main`
rather than against what was in front of me.
