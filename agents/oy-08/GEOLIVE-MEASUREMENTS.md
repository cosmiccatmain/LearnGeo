# GeoLive, measured

oy-08. Measured in a real browser, desktop and phone. Times are UTC.
**Measurement run: 2026-09-12T15:40Z to 15:47Z.**

Re-measure before acting. All three GeoLive files changed *during* this run.

## The headline: aj is right about what is live, and oy-06's round-4 fix answers it

Both complaints reproduce **in the integrated top-level files**, which is what
anyone running the app sees today. Neither reproduces in **oy-06's current
stylesheet**, which is round-4 work in progress.

`assets/css/geolive.css` at the top level is byte-identical to
`agents/merged/`: blob `3261d8fb`, 35,373 bytes, dated 2026-09-11 21:47 local.
oy-06's own file is 2026-09-12 08:36 local, 37,611 bytes, with the fix in it.

**Nothing was dropped and nobody integrated a stale copy.** An earlier draft of
this file said otherwise and was wrong; the correction is at the end. The
shipped stylesheet is exactly what commit `82da322` put there at 2026-09-11
21:52 local, which was the round-3 build and was correct at the time. oy-06's
file is dated after that commit, so it could not have been in it. The two are
a round apart, not an integration failure. Work sitting unmerged in
`agents/oy-NN/` is the workflow running normally: the Organizer merges at the
end of a round, and round 4 is not finished.

What that means in practice: the fix is real and measured, and it reaches
users when round 4 merges. Nobody needs to go looking for a lost file.

What is missing from the *currently shipping* stylesheet:

| Token in oy-06's file | Occurrences in oy-06 | In the build |
| --- | --- | --- |
| `--gl-ctl` (stops controls scaling) | 16 | **0** |
| `min(100dvh, 560px)` (the height fix) | 2 | **0** |
| the "400px of white" comment | 1 | **0** |

Read that as "round 3 shipped without these and round 4 adds them", not as
"these went missing".

### The screenshot, reproduced exactly

Student join, in a 1400x800 panel, on the **integrated build**, 15:46:39Z:

| | Measured |
| --- | --- |
| Host box | 1358 x **900** |
| Panel it sits in | 1400 x 800 |
| Form | **380 x 250** |
| Space to its left | 16px |
| Space to its right | **962px** |
| Space above it | 325px |

A 380px form hard against the left edge with 962px of white beside it, in a
container 100px taller than the panel holding it. That is the screenshot:
small form, low and to one side, a field of white around it. The cause is
`min-height: 100dvh` resolving to 900px inside an 800px host, with no
horizontal centring.

Same state on **oy-06's current file**, 15:43:42Z, phone at 390x844:
content 316x250, 244px above, 244px below, 16px each side. Centred.

### The inverted hierarchy, reproduced and measured

The specific claim was that ordinary controls compete with the answer tiles.
On the teacher's setup screen at viewport 1440, `--gl-step` is 1.6 in both
builds:

| | Integrated build | oy-06 current |
| --- | --- | --- |
| `--gl-ctl` | unset | 1 |
| Control heights | 32, 40, 48, **108** | 32, 40, 48, 77 |
| Control fonts | 13, 14, 15, **24** | 13, 14, 15, **15** |
| Host `display` | **block** | flex |
| Host `min-height` | **900px** | 560px |

In the build, a question-set card is 108px tall at 24px type, scaling with the
projector multiplier. In oy-06's file it is 77px at 15px and does not scale.
So the claim was true, and is already answered.

### Centring, both builds, teacher

Gap above the content against gap below, 1358x758 host, 1440 viewport:

| Stage | Integrated (above/below) | oy-06 current (above/below) |
| --- | --- | --- |
| Who is playing | 35 / **324** | 116 / 117 |
| What gets asked | 35 / **291** | 157 / 156 |
| Joining | 35 / **389** | 126 / 127 |

## Measured on oy-06's current file: what is still wrong

These are the faults that survive the fix and are worth someone's time.

### 1. Answer tiles are 22% ink and 78% white

Phone, 390x844, host 348x738:

| | Value |
| --- | --- |
| Tile box | 153 x 265 (304 at the moment the question opens) |
| Content inside it (key badge + label) | 59px tall |
| Fill | **22%** |
| White above the label | 103px |
| White below the label | 103px |
| The 2x2 grid | 316 x 540 of a 738 host |

Nobody set the tiles large. `.gl-targets` is `flex: 1 1 0%` with
`grid-auto-rows: minmax(88px, 1fr)`, so the grid swallows all leftover height
and the rows split it. An 18px label ends up centred in a 265px box.

That is the measurable part of "enormously large buttons": not the tap target,
which should be big, but the ratio of box to content. For oy-06.

### 2. Teacher reveal overflows its host with 8 players

| | Value |
| --- | --- |
| Host | 1358 x 758 |
| Content | 1289 x **796** |
| Gap above / below | 4 / **-42** |

Three standings rows render 28 to 30px past the bottom of the host, in normal
flow. `overflow-y` is `visible`, so `scrollHeight` never grows and nothing
scrolls: the rows just leave the box, and the classroom panel clips them.
Eight players is an ordinary class. For oy-04 and oy-06.

### 3. The Join button is set smaller than the fields above it

Phone join screen: inputs 316x56 at **24px**, Join button 316x48 at **15px**.
The 24px is deliberate and correct, since under 16px iOS zooms the page. The
side effect is that the control you press carries smaller type than the boxes
you type into. For oy-05 and oy-06.

## Not measured, honestly

- **Teacher, game over (the podium).** The teacher runs its rules locally and
  would not leave `reveal` on a pushed snapshot. Needs a working database or a
  hook I do not own. Not guessed.
- **Student, answer locked.** Tapping a tile re-rendered, tiles going 304 to
  265px, but the phase stayed `asking` because the lock waits on an accepted
  answer from the network. The 265px figure is real; the locked layout is not
  measured.

## How this was measured, and what it is worth

The database is dead (`42P17`, infinite recursion on `live_players`,
`live_sessions` empty for its whole history), so no state was reached by
playing. `GeoLiveCloud` was replaced with a stub emitting oy-03's real
snapshot shape and both screens were driven through their own code paths. The
teacher needs `mount(el, {roster, members})` with ids matching, or every
player reads as "0 invited" and the game will not start.

Exact files measured, since all three moved during the run:

| File | Copy measured | Size | Moved to, by 08:46 local |
| --- | --- | --- | --- |
| `geolive.css` | oy-06, 08:34 | 36,595 | 37,611 |
| `geolive-teacher.js` | oy-04, 08:34 | 53,820 | 54,364 |
| `geolive-student.js` | oy-05, 21:15 (11 Sep) | 34,971 | 36,803 |

## Corrections to my own first pass

My first run reported the teacher top-anchored with 241 to 322px of dead space,
which matched the complaint. **That was my harness, not the app.** The test
page carried `#t-host,#s-host{display:block}`, which overrode
`.gl--teacher { display:flex }` and killed `justify-content:center`. Removing
it moved the teacher from 35/304 to 116/117.

Two other first-pass numbers were wrong: `innerWidth` read 0 before a viewport
was set, so `--gl-step` measured 1.35 instead of the real 1.6; and a
union-of-descendants box reported overflow on the players screen where
`scrollWidth === clientWidth` proved there was none. That one was an inline
`<small>` whose rect spans wrapped lines.

Three wrong numbers in the first pass, all caught by checking them a second
way. Treat any single number here the same.

### And one wrong cause, caught by Master rather than by me

The first version of this report said the shipped stylesheet was a stale
merged copy that oy-09 had integrated in place of oy-06's fix, and that the
fix had sat unintegrated for about eleven hours. **Every measurement behind
that was right and the conclusion drawn from it was wrong.**

I read two timestamps 10h44m apart and assumed the later one had been passed
over. Checking it against the history instead: commit `82da322`, 2026-09-11
21:52 local, introduced `assets/css/geolive.css` as blob `3261d8fb`, which is
byte for byte what is in the tree now. oy-06's file is dated 2026-09-12 08:36,
after that commit, so it did not exist when the round-3 build was made. The
eleven hours is the gap between two rounds, which is just the time between
rounds.

Had that framing gone out unchecked it would have sent the Organizer hunting
an integration failure that never happened, and put a dropped-file accusation
on oy-09 for a file it never had. The measurements were sound and the story I
told about them was not, which is a different failure from the three above and
worth naming separately: a number can be right and still be read wrong.
