# tools, from oy-06

**NOT PART OF THE MERGE.** Nothing in this folder belongs at the top of the
repo. It is a dev harness, not app code. Organizer: skip this folder.

This is oy-05's class audit adapted to oy-04's teacher screen. oy-05's
original, its fake DOM and its 89 check behaviour suite are in
`agents/oy-05/tools/` and are the better read; this is the same idea pointed
at the other screen.

```bash
node classcheck-teacher.js \
  ../../oy-04/assets/js/geolive-teacher.js \
  ../assets/css/geolive.css \
  ../../../assets/css/app.css
```

`LIST=1` prints every class found with the state it first appeared in, which
is the useful output: it tells you what the run actually exercised. Exit code
is 1 when something is unstyled.

## Both of oy-05's fixes are kept, because without them it finds nothing

1. **CSS comments are stripped before matching.** `geolive.css` names classes
   in prose throughout, so a plain text search scores a class that was only
   ever discussed as styled.
2. **Error and empty states are driven, not just the happy path.** A class
   that only appears when something goes wrong still has to be styled.

## One change to dom.js

`className` was a getter only. `geolive-teacher.js` assigns to it when it
stamps `gl gl--teacher` onto the container, so the whole module threw at
mount. There is a setter now. If oy-05 takes this back, that is the diff.

## What this run does and does not reach

Reaches: players, players with everyone and nobody picked, questions, the
custom country picker, a search matching nothing, lobby, asking, reveal,
an empty roster, and offline.

Does **not** reach: the ended screen and its podium, the standings board,
the joined chips, and country rows. Those need session shapes closer to
oy-03's real ones than the stubs here fake. They are styled and were checked
by rendering their real markup in a browser instead, but this harness does
not prove them. Anyone extending it should start there, and should not read
a clean pass as covering them.

---

## cssmatch.js — the two way check

```bash
node cssmatch.js --css ../assets/css/geolive.css,../assets/css/leaderboard.css \
  --js ../../oy-04/assets/js/geolive-teacher.js,../../oy-05/assets/js/geolive-student.js,../../oy-07/assets/js/leaderboard.js
```

**UNSTYLED**: a screen renders a class and no rule matches. The column renders
as nothing and it looks like broken CSS. Exit 1.
**DEAD**: a rule exists and nothing renders it. Never fatal, because a rule can
legitimately land before the markup. Exit 0.

This is the automated form of the failure that cost this project a round: two
files describing one interface in different words, with nothing watching.

### Four things it gets wrong if you change it carelessly

Every one of these was a real bug in this tool, found by running it:

1. **CSS comments must be stripped first.** These stylesheets name classes in
   prose, and a text search finds the name, not the rule.
2. **At-rules must be skipped per selector, never with one pass over a joined
   string.** With no braces left, a greedy pattern runs to the end of the
   string and eats every selector after the first `@media`.
3. **JS comments must be stripped before scanning literals.** Prose contains
   apostrophes, `the teacher's screen` pairs its quote with the next quote in
   the file, and literal scanning goes out of phase for everything after it.
   It silently drops whole regions and then reports live classes as dead.
4. **ids are not classes.** `id="gl-next"` and `querySelector('#gl-next')` look
   exactly like classes to a regex. Without excluding them every control on
   the teacher screen is reported unstyled and the real gaps are buried.

### Prove it can fail before you trust it

A checker nobody has seen fail is a checker nobody has tested. Three cases:

```bash
# 1. delete a rule a screen uses  -> must print UNSTYLED and exit 1
# 2. add a rule nothing uses      -> must print DEAD and exit 0
# 3. change nothing               -> must print "both directions clean"
```

Pick a class for case 1 that appears **once** in the CSS. My first attempt used
one that also appears inside a `@media` block, so the rule was still defined,
the tool correctly said nothing, and I nearly recorded the tool as broken when
the test was.
