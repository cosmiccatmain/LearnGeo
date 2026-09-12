# NOTES for LearnGeo 6 OY

## Built on

Commit: 43b5d2d. The tokens and the component language come from
`assets/css/app.css` and `assets/css/brand.css` as they stand on that commit.

## What I changed

- All the styling for GeoLive and the class leaderboard, in one new file.
  The teacher's projector screen and the student's phone screen are the same
  components with a different set of local tokens, rather than two sets of
  rules that drift apart.
- The four answer targets use the app's own accent, success, gold and diamond.
  No new palette. GeoLive should look like a part of LearnGeo, not a quiz-show
  skin bolted to the side.
- Nothing existing was touched. No edit to app.css, brand.css, auth.css,
  demo.css or motion.css.

## Files in this folder

- `assets/css/geolive.css`

Round three: styled everything oy-04 emits, added `.gl-alert`, `.gl-prompt`
and the `.gl-place` rank classes, fixed the reveal and end layouts on the
phone, and made `.gl-pick.is-out` read as unavailable rather than faint.

Round two: added `.gl__steps` and `.gl__step` for oy-04's setup
progress row, removed the `.clb` leaderboard block as dead, and grouped
`.gl-place` with `.gl-verdict` so the place line stops stranding itself at
the bottom of the phone.

**Checked against oy-05 as it stands.** It emits 26 classes and this file
styles 25 of them. The one it does not, `gl-go`, needs nothing: it is a
modifier on the app's own `btn btn--accent btn--lg btn--block` and exists
only as a JS hook for `closest('.gl-go')`. oy-05 also drives `--gl-secs` on
the timer and `--gl-i` on the place line, so the contract below is being
used as written. I rendered its real markup at 375 wide, all three phases.

## Status

Status: complete. I rendered it against the real app.css at 1440, 1200 and
375 wide and fixed three things that were broken, listed below. What I cannot
check on my own is how it looks with markup the other sessions actually write,
because none of it exists yet. The class list below is the contract.

Fixed while testing, so nobody reintroduces them:

1. `--gl-step` was a `clamp()` containing `.55 + .55vw`. Adding a unitless
   number to a length is invalid CSS, so the whole token failed, and every
   `calc(px * var(--gl-step))` in the file fell back. The teacher screen
   rendered at phone size with no bar heights and no grid columns. It is a
   plain number now, stepped at 1100, 1500 and 1900 wide. If you ever want it
   fluid, it cannot be done this way.
2. The correct answer's ring on the reveal was an inset `box-shadow` on the
   bar. Inset shadows paint under a box's children, so the fill covered the
   left of it and the answer row looked ringed only around its empty part.
   The ring is on an `::after` overlay now.
3. The leaderboard hid one of six columns at phone width and left five in a
   four column grid, so every streak number wrapped onto its own line under
   the name. Quizzes and streak both hide now.

## The class names

The ruling was reversed part way through this round: the screens win and this
stylesheet follows their markup. oy-04 and oy-05 rename nothing. So the list
below is not a contract I am asking anyone to adopt, it is a record of what
they render and what I style.

Measured against both screens as they stand, every class either of them
renders has a rule here, and every rule here is rendered by one of them. I
check that by extracting the class strings from their two files rather than
by reading anyone's summary, because both files moved three times during this
round and every summary I was given was stale by the time it arrived.

Teacher, oy-04. Shell: `.gl__steps` > `.gl__step` (`.is-now`, `.is-done`) and
`.gl__steps-note`; `.gl__head` > `.gl__h` (`--mid`) and `.gl__sub` (`--mid`);
`.gl__warn`; `.gl__bar` > `.gl__count`; `.gl__foot` > `.gl__note`;
`.gl__empty`; `.gl__none`. Players: `.gl__roster` > `.gl-pick` (`.is-on`,
`.is-out`) > `.gl-pick__av` `.gl-pick__n` `.gl-pick__tick`. Questions:
`.gl__sets` > `.gl-set` (`.is-on`); `.gl__picker` > `.gl__regions`,
`.gl__countries` > `.gl-country` (`.is-on`). Joining: `.gl__code`,
`.gl__joined` > `.gl-joined` (`.is-in`) > `.gl-joined__av`. Live: `.gl-live` >
`.gl-live__top` > `.gl-live__n` and `.gl-live__clock`; `.gl-live__q`;
`.gl-live__opts` > `.gl-opt` with `--0 --1 --2 --3` (`.is-right`, `.is-dim`) >
`.gl-opt__n`; `.gl-live__foot` > `.gl-live__answered`. Standings: `.gl-stand` >
`.gl-stand__row` (`.is-below`) > `.gl-stand__pl` `.gl-stand__n`
`.gl-stand__streak` `.gl-stand__s`. End: `.gl-end`, `.gl-podium` >
`.gl-podium__col` with `--1 --2 --3` > `.gl-podium__av` `.gl-podium__n`
`.gl-podium__s` `.gl-podium__pl`.

Student, oy-05. `.gl-join` > `.gl-join__field` and the app's own
`.btn.btn--accent.btn--lg.btn--block.gl-go`; `.gl-wait` > `.gl-wait__dots`;
`.gl-timer` > `.gl-timer__bar`; `.gl__head` > `.gl-qcount` and `.gl__eyebrow`;
`.gl-live__q`; `.gl-targets` > `.gl-target` with `--a --b --c --d`
(`.is-picked`, `.is-right`, `.is-wrong`, `.is-dimmed`, `.is-locked`) >
`.gl-target__key` `.gl-target__text`; `.gl-verdict` (`--right --wrong --miss
--wait`) > `.gl-verdict__head` `.gl-verdict__points` `.gl-verdict__note`;
`.gl-place` > `.gl-place__n`; `.gl-podium` > `.gl-podium__place` (`.is-first`
`.is-second` `.is-third` `.is-me`) > `.gl-podium__medal` `.gl-podium__name`
`.gl-podium__score`.

Leaderboard, oy-07: nothing from me. It uses the app's own gradebook classes,
`cr-card`, `gb-wrap`, `gb`, `gb__name`, `gb__score`, `mono`, `t-sm`,
`t-muted` and `empty`, all of which are already defined in app.css, and `.gb`
is a real table inside a scrolling wrapper, so six columns on a phone already
work. I wrote a `.clb` block for this and removed it rather than leave it
unused.

Three classes are rendered by both screens and mean different things, so they
are scoped rather than shared: `.gl__head` is a two item row on the phone and
a heading block on the projector; `.gl-live__q` is 32px times the projector
step and a flat 21px on the phone; `.gl-podium` is one block with two
different sets of children.

Four values the screens set, which nothing in CSS can provide:

- `--gl-i` on each standings row, `--gl-n` for how many there are, `--gl-max`
  for how many should show. This is how standings stop jumping. oy-04 builds
  one row per player in creation order and never reorders them, so a row
  going from third to first slides, because the only thing that changed is a
  number. Rebuilding the list in rank order is what makes every row below a
  change snap a whole row height in one frame.
- `--gl-secs` on `.gl-timer__bar` with `.is-running`, and `.is-low` on
  `.gl-timer` to turn it red. oy-05 also sets a negative `animation-delay` to
  resume a question already in progress, which works because the inline style
  beats the shorthand here.
- `--gl-pct` on a `.gl-opt`, 0 to 100, is optional. Set it and the share of
  the room that chose that answer appears as a fill behind the text. Leave it
  and the option is a plain card. Nothing moves either way.


## The audit is in tools/, and it does not cover everything

`tools/classcheck-teacher.js` is oy-05's class audit pointed at oy-04's
screen. Both of its fixes are kept, because without either it finds nothing
and says so confidently. It needed one change to oy-05's fake DOM: `className`
was a getter only and the teacher module assigns to it, so the module threw at
mount.

Run from `tools/`:

    node classcheck-teacher.js ../../oy-04/assets/js/geolive-teacher.js \
      ../assets/css/geolive.css ../../../assets/css/app.css

Today both pass: 52 classes on the teacher screen, 49 on the student, none
undefined. What the teacher run does **not** reach is the ended screen and its
podium, the standings board, the joined chips and the country rows, because
the stubs do not fake session shapes close enough to oy-03's real ones. Those
are styled and were checked by rendering their real markup in a browser, but
the harness does not prove them, and a clean pass should not be read as
covering them. `tools/README.md` says the same thing next to the code.

## How I check this file, and how the check was wrong

Audit both directions, on every change: every class either screen renders
has a rule, every rule has something that renders it.

**Strip CSS comments before matching.** This file names classes in prose
throughout, so a plain text search finds a class that was only ever
discussed and scores it as styled. oy-05 hit exactly that: its audit passed
clean while a real break existed. Mine had the same shape of flaw. With
comments stripped and only selector preludes matched, the answer today is
zero classes named only in comments and zero unstyled on either screen, but
the number is only worth anything if the method is right.

Second thing that check must survive, and it is the exact opposite failure
to the first, which is why both belong here: `@media` and `@keyframes`
preludes are not selectors. My first corrected version stripped at-rules
with a greedy pattern on an already joined string. There were no braces
left in that string, so the pattern ran to the end and ate every selector
after the first `@media`. It then reported all 83 classes unstyled and I
nearly acted on it.

One version of this check scored everything as styled. The next scored
nothing as styled. **A checker that says everything is broken is exactly as
useless as one that says everything is fine, and neither announces itself.**
Both times the output looked like a result. Whenever this check changes,
run it once against a file you know is fine and once against a class you
have deliberately removed, because a checker nobody has seen fail is a
checker nobody has tested.

Modifiers built by concatenation (`'gl-opt--' + i`) never appear whole in
the source, so extraction sees `gl-opt--` and nothing else. Those are not
gaps. Check them by reading the line that builds them.


## Round 3: the class leaderboard

`assets/css/leaderboard.css` is a new file, and it is **additive**. oy-07's
table is the app's own gradebook, `.cr-card`, `.gb-wrap`, `.gb`, `.gb__name`,
`.gb__score`, and that is why it looks like part of LearnGeo rather than a
widget dropped into it. Nothing here restyles any of them.

These rules cover only what the gradebook cannot say, which is everything the
level ranking introduced. Round 2 is why it is shaped this way: I wrote a whole
`.clb` table for this screen, oy-07 sensibly used the app's classes instead,
and the block was dead. So these are **offered**, not assumed.

**For oy-07.** Put `.lb` on the wrapper. Everything below is optional and
degrades: no class, no change to the table you already have.

- `.lb-level` > `.lb-level__word` + `.lb-level__n`. The badge. Level leads the
  table, so it is the only thing here with weight.
- `.lb-xp`, the XP inside the level. Quiet on purpose: it breaks ties, it is
  not a second score, and a bold number next to the level would read as a rival.
- `.lb-prog` > `.lb-prog__fill`, with `--lb-pct` 0 to 100 on the track, from
  `levelProgress()` in core.js. Optional: with no value it renders an empty
  track rather than breaking, so the column can ship before the number does.
- `.lb-rank`, plus `.is-1` `.is-2` `.is-3` for the top three, and `.is-tied`
  for a shared rank. The equals sign is drawn by CSS, so you add one class and
  nothing else, and a screen reader still hears the number. It sits in its own
  space so a tie never shifts the column.
- `.lb-none` for a student who has not started. Not a zero: a zero says they
  did the work and scored nothing, which is a worse thing to tell a class than
  the truth.
- `.lb-empty` with a `<b>` first line, for a class with nobody in it.
- `.lb.is-solo` on the wrapper hides the rank column, plus `.lb-solo-note`. A
  one row ranking table is a podium with an audience of nobody.
- `.lb-me` on the viewer's row. Tinted, not outlined, because a border would
  fight the row rules the gradebook already draws.

Three kinds of nothing, and they deliberately do not look alike: no students,
one student, and a student who has not started.

Rendered against the app's real `gb` table markup at 1100 wide, all three
states. One bug that only showed there: `.lb-prog` was a plain `<span>`, and
width and height do nothing on an inline box, so the whole progress column
rendered empty. It is `inline-block` now.

## The two way check, tools/cssmatch.js

Master asked whether the guard oy-07 built between its markup and this
stylesheet belongs between this stylesheet and the other screens too. It does,
and it is in `tools/cssmatch.js`, run across all three screens and both files.
Clean in both directions today.

It found nothing on the first run because it was wrong four separate ways, and
each one is written next to the code in `tools/README.md`. The one worth
repeating here: I validated it by deleting a rule a screen uses, and it failed
to notice. I assumed the tool was broken. The test was: the class I deleted
also appeared inside an `@media` block, so it was still defined and the tool
was right. Check the test before the thing it tests.

## Round 4: the layout, measured 2026-09-12 08:37

aj ran a real game and said the formatting sucked, huge buttons, ugly. Owen
said make it bigger and centred. Three causes, all in this file, all
reproduced in a 1400x800 stand-in for the classroom panel before touching
anything.

**It thought it owned the viewport.** Both containers had `min-height: 100dvh`.
They mount into `#cl-geolive`, a bare div inside the classroom panel, so the
container came out taller than the space it was given and pushed its own
content below the fold. That is the 400px of white above the join form.
`min(100dvh, 560px)` plus `justify-content: center` now.

**`margin: auto 0` is not centring.** It is auto top and bottom and ZERO left
and right, so every card centred vertically and sat hard against the left
edge. On a phone the container is the width of the screen and nobody notices;
in a 1400px panel it is the whole complaint. `margin-inline: auto` now.

**The projector scale was being applied to ordinary buttons.** `--gl-step`
exists so a class can read the question from the back row, and it was sizing
the Back button too. At 1.6x the note under a set label came out LARGER than
the label above it. Controls are on their own `--gl-ctl` now, which does not
follow the projector. Display type scales; controls stay control sized.

**The student screen is capped to 560px and centred.** Stretched across the
panel each answer tile was 678 by 331, which is the "enormously large buttons"
complaint. 259 by 331 now, and unchanged on a phone, where the viewport is
narrower than the cap.

`height: 100%` is on both containers. It resolves to auto against a bare div,
so it costs nothing today, and it fills the moment the host has a height.

### Still needs markup, not CSS

To truly fill the panel, `#cl-geolive` in `classroom.js` needs a height. CSS
cannot fill a parent that has none. I proved the rest works by rendering the
same page with `style="height:100%"` on that div: the form then centres in
the full 800px. One line, and it is oy-09's file, not mine.

## Round 4 addition: the feature switches, measured 2026-09-12 08:45

`assets/css/class-features.css` is new. Ten class names are rendered by
`class-features.js` and not one of them had a rule anywhere in the repo,
checked across every css file including every agent folder. With no rules the
two switches collapse into one run-on line:

> "Live quizRun a quiz the class answers together, on their own devices.On"

That is the GeoLive switch and the leaderboard switch rendered as a paragraph.
A toggle that does not look like a toggle does not get toggled, which is why
Owen and his teacher both went looking for a leaderboard they could not find.

Every name comes from `class-features.js`, which oy-09 owns. Nothing invented,
nothing renamed. The host sits inside the app's `.cr-card`, which already
supplies border, radius, white and 18px padding, so this draws no second card.

**The switch carries two signals, not one.** The knob moves 4px to 56px across
an 84px track, and the track goes from `--line` to `--success`. Position alone
is easy to miss at a glance; colour alone fails for a colour blind teacher.
Both together is what a physical switch does.

`.clf__warn` is the offline state and is amber, not red: nothing is broken and
nothing was lost, the control just is not available yet. The row's label dims
with its disabled switch, so a feature reads as unavailable rather than leaving
a live looking label beside a dead control.

`tools/cssmatch.js` now covers `clf` as well as `gl` and `lb`. All four screens
against all three stylesheets: clean both directions at 08:45.

### Two stylesheets are not linked, and that is the whole bug repeating

`index.html` links `geolive.css` only. `leaderboard.css` and
`class-features.css` are not linked. Until oy-09 adds them, this fix renders
exactly as the bug it fixes: correct rules that no page loads. That is one line
each in a file I do not own.

## Round 4, the three measured faults. All numbers 2026-09-12 08:54

Measured on a 390x844 phone and a 1400x758 panel, before and after.

**Answer tiles were 21% ink.** 174x300 around 63px of content. `.gl-targets`
was `flex: 1` with `grid-auto-rows: minmax(88px, 1fr)`, so the grid absorbed
every spare pixel and the tiles inflated to fill it. Nobody chose 300px. Rows
cap at 168px now and the grid no longer stretches: **174x168, 40% ink**. The
spare height became space between the question and the answers, which reads as
layout, rather than padding inside a button, which reads as a button sized
wrong. The timer and question count are pinned to the top and the question and
its four answers centre together as one group.

**The teacher reveal was clipping, and not for the reason it looked.** Eight
players, three rows past the bottom. Two separate causes:

1. `--gl-row-h` was `clamp(42px, 5.4vh, 76px)`. The board's height is
   `calc(--gl-max * --gl-row-h)` and each row is `translateY(--gl-i *
   --gl-row-h)`, and with a clamp in there the two disagreed. **This is the
   same mistake as `--gl-step` in round 2.** A variable that is multiplied in
   one place and used raw in another must be a plain length. Steps, not fluid.
2. `.gl-stand` is a flex item in a column, so it shrank: from the 512px its
   rows occupy to 310px. Its rows are absolutely positioned inside
   `overflow: hidden`, so shrinking did not compress the board, it **clipped**
   it. Rows five to eight were simply not drawn, with no scrollbar and no sign
   anything was missing. `flex: none` now, and the panel scrolls instead.

`justify-content` is `safe center` on both containers. With plain `center`,
content taller than the box overflows both ends and the top can never be
scrolled to. After: box 512 = rows 512, panel scrollable, all eight reachable.

**The join button was smaller than its own inputs.** 358x48 at 15px under two
358x56 fields at 24px: the one thing a student is trying to do was the least
prominent thing on screen. **358x56 at 17px** now.

### The guard earned itself back this round

My first join fix targeted `.gl-go`. oy-05 had moved that from a class to a
`data-gl-go` attribute, so the rule silently matched nothing and the button
kept the app's 48px. `cssmatch` reported it as a dead rule and that is the
only reason I noticed. A rule that matches nothing looks exactly like a rule
that works.

### Two states I could not measure and did not style blind

Teacher game-over podium and student answer-locked. Both need a live game and
GeoLive is dead in production on the 42P17 recursion. The podium and the
locked tiles share their rules with states I did render, so they inherit the
same proportions, but I have not seen either and am not claiming them.

## Do not overwrite

- There is no dark mode here on purpose. I checked app.css, brand.css,
  auth.css, demo.css, motion.css and every js and html file in the repo: there
  is no `prefers-color-scheme` block and no theme attribute anywhere in
  LearnGeo. Adding one only to GeoLive would make it the single dark-capable
  screen in the app. If dark mode is ever wanted it is a whole-app job, not
  this file's.
- The teacher screen deliberately breaks the app's hairline look. `--line` at
  1px is invisible on a projector from the back of a room, and `--muted` at
  #6B7280 is comfortable at a desk and gone at eight metres. So `.gl--teacher`
  overrides `--gl-line` to #C9CFD9 at 2px and `--gl-second` to `--ink-2`.
  That is not an oversight and please do not tidy it back to the hairlines.
- `--gl-step` must stay a plain unitless number. See the note above.
- The reduced-motion block at the end deliberately restores two things that
  app.css flattens globally. The timer is the only sign of how long is left,
  and the tally bar is the answer distribution itself. Neither is decoration,
  so neither should be frozen to .001ms.
- `.gl-join__field` is 24px on purpose. Any font size under 16px makes iOS
  Safari zoom the page when the field takes focus, which on a phone in a live
  game is the difference between joining and not.
