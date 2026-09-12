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
