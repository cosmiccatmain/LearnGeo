# NOTES for LearnGeo 8 OY

## Built on

Commit: aa0ca26 (origin/main)

Read for reference, edited none of them: `core.js`, `quiz.js`, `admin.js`,
`admin-pin.js`, `mode-learn.js`, `mode-test.js`, `mode-quiz.js`,
`mode-cards.js`, `data.js`, `map.js`.

## Files in this folder

- `assets/js/godmode.js` — **round 4, this round's deliverable.**
- `assets/js/geolive-questions.js` — round 3, still unmerged, still current.
  Nothing has changed in it this round.
- `PRODUCTION.md` — round 2. The write-up of the 11 September outage. Not
  GeoLive, not god mode, do not merge it into either. Worth keeping: the
  incident closed, its cause did not, and the Vercel setting that would stop
  branch builds reaching Production has still not been made.

No `index.html`, no copy of any existing file.

## God mode: what it does

Turn it on, every answer counts as right, walk any mode end to end without
knowing the capital of Kyrgyzstan.

```js
GodMode.available()      // is the admin panel unlocked
GodMode.enable()         // -> bool, refuses unless available()
GodMode.disable()
GodMode.toggle()
GodMode.on               // getter
GodMode.mountToggle(el)  // drops a wired button into the admin panel
```

Also `ctrl+shift+G`, so it is usable before oy-09 wires anything.

## The decision you asked me to make: it awards nothing

**God mode is purely navigational. No XP, no level, no gems, no streak, no
lifetime stats, no daily goal, no mastery.** Of your three options I took the
first, and the leaderboard is only half the reason.

The leaderboard half. It now ranks on level, and level is the one number in
this app that is supposed to only ever mean work actually done. Round 3 made
that explicit: rank on level and not gems, precisely because gems are
spendable and level cannot go backwards. A tool that hands out levels is the
one thing that breaks that, and it would break it on a table of children.

The half that decided it. `award()` is also where `state.mastery` is written,
one Leitner box per correct answer. A god mode that paid out would push every
country it touched up a box, so two or three walkthroughs would leave all 213
marked mastered. `weakFirst` reads those boxes to decide what to show first.
So paying out would not just inflate a leaderboard, it would quietly destroy
Owen's own record of what he is weak at, in the app he is testing because he
uses it. That cost lands on him personally and it is not recoverable.

Against that, what the conservative choice actually costs: nothing. He is
walking through screens, not farming XP. There is no part of "check the quiz
screen still works" that needs the XP to be real.

I did not take the "mark the session and let the leaderboard exclude it"
option because it puts the integrity of the table in a second session's hands.
oy-07 would have to honour a flag, for every code path, forever. A flag that
another file has to remember is a flag that eventually gets forgotten, and the
failure is silent when it does.

**The property this buys is worth stating plainly: the admin gate is not
load-bearing.** Someone who forces god mode on from the console gets a green
tick and zero points. You said to expect a tester to try turning it on as a
student. They can, and it earns them nothing. Verified: 200 forced correct
answers moved XP by 0 and level by 0.

If Owen would rather it just paid out, it is a small change and it is his app.
But it should be a decision someone makes on purpose, not the default.

## Making it obvious

A 4px orange ring around the whole viewport, plus a pill at the top with the
off switch in it. The ring takes no pointer events, so it covers nothing and
cannot be clicked through by accident; the pill is the only clickable part. I
did not use a bar across the top because it would have sat on the app's own
nav.

It is also legible from the numbers: a correct answer floats "+0 XP", which is
the receipt saying this one did not count.

And it cannot be left on by accident. `Admin.unlocked` lives until the tab
closes and does not persist, so god mode borrows exactly that lifetime.
Nothing is written to storage. A reload turns it off.

## How it works, and the three places correctness lives

It patches three exported functions while on and puts them back when off. It
edits no other file.

| Patched | Covers |
| --- | --- |
| `Quiz.grade` | typed answers in Learn, everything in Test |
| `W.matches` | the two typed halves of a class quiz |
| `Quiz.make` | multiple choice, where `correct` is baked into each option at build time |
| `W.award` | the integrity decision: returns a zeroed result, writes nothing |

Three separate places decide correctness and they are not the same place,
which is why this patches three rather than one. Worth knowing before anyone
simplifies it.

Two consequences to expect rather than report as bugs:

- **Learn mode's current question is not retroactive.** `Quiz.make` is asked
  at build time, so a multiple-choice question already on screen when you flip
  it on keeps its original options. The next question is the first fully
  god-moded one. Typed and Test answers take effect immediately.
- **All four options turn green** in Learn, because every option is marked
  correct. That is the mechanism showing through, and it makes the state
  obvious, so I left it.

## God mode does not reach the leaderboard, by two separate routes

Re-checked after the decision that the class leaderboard ranks on the
student's real level, mirrored into `class_members`. Both of the numbers that
table is built from are out of god mode's reach, and they are out of reach for
different reasons, so both are worth knowing.

**Level, via `sync_level`.** oy-03's `syncLevel()` reads
`W.state.economy.level` and `.xp` straight off the device and mirrors them.
God mode never lets those change, so the mirror copies the honest number. This
is the one that would have gone wrong: had god mode paid out, the inflation
would not have stayed on Owen's laptop, it would have been written into a
shared table that ranks children. That is worse than the local-only version of
the problem I was originally weighing, and it settles the question rather than
complicating it.

**GeoLive points, via `live_players.score`.** oy-02's `mark()` decides a live
answer with `picked === q.answer`, a direct comparison that goes through
neither `Quiz.grade` nor `W.matches`. So god mode has no effect inside a live
game at all.

**That second one is deliberate now, and must stay.** Somebody will eventually
notice that god mode does not work in GeoLive and read it as a gap. It is not.
GeoLive points feed the class leaderboard directly, so a god mode that worked
there would hand an admin a way to top a table of children by tapping any
option, which is the exact thing the award decision above exists to prevent.
If Owen wants to walk a live game through quickly, the honest tool is a
teacher-side skip, not a student-side one. Do not wire `GeoLive.answer` into
this file.

## The hooks I need from oy-09

1. **One line in the admin panel.** Where the panel builds its list of admin
   controls, call `GodMode.mountToggle(container)`. The button, its label and
   its disabled state are all handled here so the panel cannot drift out of
   step with the switch.
2. **`index.html`**: `<script src="assets/js/godmode.js"></script>` after
   `quiz.js` and after `admin.js`. It patches `Quiz` and reads `Admin`, so it
   must load after both. It patches lazily on enable, so load order only has
   to be right by the time someone turns it on, not at parse time.
3. **Optional, closes the one real gap.** Learn mode's `pickCountry()` decides
   a map click with `country.name === q.country.name`, which is internal and
   cannot be patched from outside. Until that is reachable, god mode swaps a
   "find it on the map" question for the shaded-country version of the same
   country, so a walkthrough is never blocked. If `pickCountry` took its
   verdict from something exported, or Learn exposed a `forceCorrect` hook,
   the swap could go and map-click screens would be walkable too. Not urgent:
   turning god mode off is a fine way to test that one screen.

## Status

Status: complete and tested. 0 failures across the gate, grading, state
integrity, the abuse case, 50 on/off cycles, idempotency and the locate swap.

What I could not test outside a browser: the banner, since the harness has no
real DOM, and the `ctrl+shift+G` handler. The logic around both is covered;
the rendering is not. Worth a tester's eye.

## Do not overwrite

- **`W.award` returning zeros.** This is the whole decision. If someone
  "fixes" god mode so it pays out, the leaderboard becomes something an admin
  can climb without answering anything, and Owen's mastery boxes fill with
  countries he never actually learned. If it is ever changed, it should be
  because he asked, and the mastery cost should be part of that conversation.
- **Patching all four functions.** Removing `Quiz.make` because "`Quiz.grade`
  already covers it" breaks multiple choice, which never goes through
  `grade()`. Removing `W.matches` breaks the class quiz, which never goes
  through `grade()` either.
- **The `saved` guard in `patch()` and the restore in `unpatch()`.** They are
  what stops wrappers stacking on each other across on/off cycles. Verified
  over 50 cycles that all four functions come back identical to the originals.
- **The gate reading `Admin.unlocked` rather than storage.** Persisting god
  mode across reloads would make it possible to leave on without noticing,
  which is the exact failure the brief asked me to design against.
