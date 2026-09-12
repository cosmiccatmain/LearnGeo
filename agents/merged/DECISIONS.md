# DECISIONS

What went into `merged/`, and for every place two sessions changed the same
thing, which one I kept and why.

Built by LearnGeo Organizer on 2026-09-11. Nothing here is committed, pushed
or deployed.

## Read this first

Three things need your decision. Everything else I resolved and checked.

1. **`epic-mccarthy` carries a database migration that has to be applied
   before its code runs.** `supabase/deployed/0001_announcements.sql` creates
   the `announcements` table. The merged `cloud.js` reads and writes that
   table. Apply the migration first, or the teacher dashboard queries a table
   that does not exist, on the live site.
2. **One feature from `epic-mccarthy` is not in here: the per-student view.**
   Clicking a student's name to see their work, their average against the
   class and what they keep missing. It could not be merged. Why, and what it
   needs, is under "What I held out" below.
3. **The admin panel cannot be opened offline.** Not my decision and not new,
   but LearnGeo 3 asked for it to be surfaced rather than buried. There is no
   code in the page any more. `AdminPin.verify()` asks Supabase and returns
   `null` when it cannot ask at all, which never unlocks. With no connection,
   the correct code shows "Can't check the code right now" and the panel stays
   shut, for you as much as for anyone. That is the trade for having no code
   sitting in a public repo. If you want it to work offline that needs a
   deliberate design, not a fallback code quietly added back.

## What went in

| Source | At | Carries |
| --- | --- | --- |
| `origin/main` | `43b5d2d` | rings, earth emoji, passkeys, admin PIN, motion, the shop fix |
| `claude/epic-carson-8ql73i` | `a7c1cd2` | three scoring and picking fixes |
| `claude/epic-mccarthy-db7ing` | `b90284b` | teacher stream and announcements (partly, see below) |
| `claude/festive-brahmagupta-3ak0w7` | `60538fa` | admin panel takes diamonds back |
| `claude/happy-keller-qnk71y` | `2237bae` | six fixes, class join, map cache |
| `claude/sleepy-curie-nppdjn` | `dbb5b3a` | landing demo map and keyboard |
| LearnGeo 3's uncommitted pass | `f018d49` | the bug-fix pass over the whole app |

Merged in that order, with LearnGeo 3 last. 35 conflicts across 11 files. The
set of conflicting files was the same in three different merge orders, so it
is not an artefact of the order I picked.

No file was taken from any `agents/oy-NN/` folder. Every folder copy of
`index.html` is a snapshot of the shared working tree taken while local `HEAD`
was a commit behind `origin/main`, so all of them are stale. The folders were
read for their `NOTES.md`, which is what they are good for.

## The resolutions

### assets/js/admin.js, 1 conflict

main against `festive-brahmagupta`. **Kept festive-brahmagupta**
(`style="flex:1;min-width:0"`). Its branch rewrites that whole block to add
the Take button and "Empty the balance", and the `min-width:0` belongs to that
layout.

LearnGeo 4 asked me to check that `min="1"` did not come back on
`#adm-amount`, because it would block negative amounts and silently stop
taking diamonds from working. It did not. There is no `min="1"` anywhere in
the merged `admin.js`, and the Take and Empty handlers are present.

This conflict did not exist while main was at `ade3a48`. The rings merge
created it, which LearnGeo 4 worked out and I confirmed.

### assets/js/assignments.js, 1 conflict

`epic-carson` against `happy-keller`. **Kept epic-carson.**

Both fixed the same bug independently: the country search listed matches in
dataset order instead of putting what you typed the start of first. Carson
ranks four ways (country starts with it, capital starts with it, country
contains it, capital contains it) and sorts, stably. Keller uses two buckets,
starts and contains.

Carson's is the finer of the two and it still covers Keller's own example.
Typing "guinea" puts Guinea ahead of Equatorial Guinea under Carson's
ranking, because Guinea's name starts with it and Equatorial Guinea's only
contains it. Nothing of Keller's behaviour is lost.

### assets/js/quiz.js, 1 conflict, three versions of it

`epic-carson` against `happy-keller` against LearnGeo 3. **Combined.**

All three fixed the same bug: a test set on a handful of countries quietly
became a random world test. All three split the pool in two, so the questions
come from what was asked for and only the wrong answers borrow a wider field.

What I took from each:

- The single-pool shape from Carson and Keller. LearnGeo 3's version calls
  `pool()` a second time to apply `weakFirst`, which the other two do in one
  call.
- **Keller's empty-pool guard, `if (!wanted.length)`, which neither Carson nor
  LearnGeo 3 has.** Without it a filter that matches nothing produces an empty
  quiz. This is the one line that a pick-a-side resolution would have dropped
  in silence.
- Carson's `!!config.weakFirst`.
- LearnGeo 3's explanation, which is the clearest of the three.

### assets/js/mode-quiz.js, 1 conflict

`epic-carson` against LearnGeo 3, both on the third argument of `pay()`.
**Combined, and this is the only place I changed a function signature.**

Carson added `quiet` so that skipping a question scores two wrong answers but
plays one sound instead of two. LearnGeo 3 changed the third argument to
`country` so `award()` is only handed the country name on the second half of
a question, because otherwise one question steps mastery two Leitner boxes.

Both are real fixes and both wanted the same parameter. `pay()` is now
`pay(correct, anchor, country, quiet)`, and Carson's two skip calls became:

    pay(false, skip, null, true);          /* the country half, and no second sound */
    pay(false, skip, it.country.name);     /* the capital half, which names it once */

If class quiz scoring looks wrong, look here first.

### assets/js/worldmap.js, 1 conflict

`happy-keller` against LearnGeo 3. **Kept LearnGeo 3.**

Same bug again, fixed twice: the home map cache keyed on how many countries
were mastered rather than which ones, so one country dropping out of box 4 as
another arrived left the map stale. Keller multiplies each character code by a
1-or-2 band. LearnGeo 3 appends a marker character to the key and uses a
shift-based hash, which collides less and says why in a comment. Keller's fix
is not lost, it is the same fix done better.

### assets/js/classroom.js, 1 conflict

`epic-mccarthy` against LearnGeo 3. **Combined**, as
`pendingNotice() + panel()`.

mccarthy's `panel()` dispatches to stream, grades or classwork, so it is a
superset of LearnGeo 3's grades-or-classwork choice. LearnGeo 3's
`pendingNotice()` is an independent banner for when a join link points at a
different class. Taking either side alone drops the other, either the Stream
tab or the wrong-class notice.

### assets/js/cloud.js, 2 conflicts

`epic-mccarthy` against LearnGeo 3. **Combined both.**

This is the file the brief told me to take whole from `origin/main`. I did
not, and the reason is under "Corrections" below.

- First conflict: LearnGeo 3's `sendResults()` and `retryLocal()`, so results
  come back carrying their ids and the offline pile is retried on reconnect,
  plus mccarthy's announcements insert.
- Second conflict: LearnGeo 3's merge-on-pull, so a teacher's offline edits
  are merged rather than overwritten by the next sync, plus mccarthy's
  announcements query.

These had to be combined rather than picked. The shared code after the second
conflict uses LearnGeo 3's `keptA`, `keptR` and `fresh` **and** mccarthy's
`ps`, so either side alone leaves undefined variables behind.

### assets/css/demo.css, 1 conflict

Not a real conflict. `sleepy-curie` added `.demo .option.is-tapped` and
LearnGeo 3 added `.demo .option__text`, and they landed on adjacent lines.
**Kept both.**

### assets/js/demo.js, 5 conflicts

`sleepy-curie` against LearnGeo 3. Both reworked the landing demo in the same
week. **Combined all five.**

- Declarations: LearnGeo 3's, which adds `popTimer` alongside `asked`.
- Question markup: LearnGeo 3's `tabindex="-1"` on the stage, plus
  sleepy-curie's country outline and its `demo__fact` div.
- Footer: LearnGeo 3's `aria-live="polite"`, which is where the right or wrong
  feedback is written, plus sleepy-curie's key hints.
  **Worth a look on the landing page:** the hints now print 1, 2, 3, 4 rather
  than A, B, C, D. LearnGeo 3 changed `KEYS` to match the real app, and
  sleepy-curie's hints read from `KEYS`. I think that is the right outcome,
  but it is a visible change neither session asked for on its own.
- Render tail: sleepy-curie's `fitShape()` call and LearnGeo 3's focus block,
  in that order, with `fitShape()` still defined after the render function.
- The sign-up nudge: LearnGeo 3's `popTimer`, because its `popup()` holds the
  guards that matter (ask once, only on the score screen, never over an open
  dialog). **Sleepy-curie's signed-in check lived only at the call site, so I
  moved it into `popup()` as one line.** Without it a signed-in visitor
  playing the demo gets asked to sign up.

### assets/js/teacher.js, 8 conflicts

`epic-mccarthy` against LearnGeo 3. **Took LearnGeo 3 in all eight.**

Not a close call, and not really a preference. LearnGeo 3 rewrote the
gradebook to key on the account rather than the display name, so two students
with the same name stop sharing one row and one average. That model is spread
right through the file: the code around the conflicts already passes a person
object `p` and calls `resultFor(p, id)`, `isTheirs(r, p)` and `who(p)`.
mccarthy's side keys on names and positions in an array. Taking mccarthy in
any of the eight leaves code calling the wrong shape of function.

Two things fell out of that which I had to put back by hand, both mccarthy's
and both sitting inside a conflict region for unrelated reasons:

- `scoreError()`, which keeps the score dialog open and explains a bad entry
  instead of closing on it. Its two call sites survived the merge but its
  definition did not. Restored.
- `shortDate()`, which mccarthy's stream uses for relative timestamps.
  Restored.

And one thing the merge produced that would have shipped broken: git combined
mccarthy's `personMap.push(n)` into LearnGeo 3's `roster.map(function (p)`.
That is valid JavaScript and it parses, but `n` does not exist in that scope,
so rendering the People panel would have thrown. It is gone along with the
rest of `personMap`.

## What I held out

**The per-student view from `epic-mccarthy`.** Clicking a name in People or
the gradebook to see one student's work, their average against the class, and
the countries they keep missing.

It is not in `merged/`. It could not be merged, for two reasons that point the
same way:

1. It is built on names. `openStudent(name)` filters results with
   `r.name === name` and calls `resultFor(name, id)`. LearnGeo 3 replaced that
   with account ids precisely because two students with the same name were
   sharing one row and one average. Porting the view is about a hundred lines
   of rewriting against a model I cannot run here, and a subtly wrong port
   would ship a teacher dashboard that renders and lies.
2. Its branch is gated behind a migration that has not been applied, so it
   cannot ship this round anyway.

Nothing is lost. It is on `claude/epic-mccarthy-db7ing` at `b90284b`, and what
it needs is a port onto LearnGeo 3's person model, not a merge. The rest of
that branch, the Stream and announcements, is in here.

## README.md, 12 conflicts

Rebuilt rather than resolved hunk by hunk. All five branches and LearnGeo 3
rewrote it, and the conflicts nested three deep, which is exactly the churn
the brief warned could hide a real code decision.

Base is LearnGeo 3's, which is the most current description of the app. Onto
it:

- **A correction from Carson and Keller.** LearnGeo 3's README still described
  the classroom as running on `LGC-`, `LG1-` and `LGR-` codes you copy and
  paste. Both branches record those as gone and the code agrees. Replaced with
  Keller's wording.
- mccarthy's Stream section and the CSV export note.
- mccarthy's `announcements` row in the database table, since the merged
  `cloud.js` now uses it.
- **mccarthy's warning that there are two schemas and only one is real.**
  `supabase/deployed/` is live and is what `cloud.js` talks to.
  `supabase/migrations/` describes a design that was never applied. This is
  worth keeping visible.
- festive-brahmagupta's line saying the admin panel removes diamonds as well
  as granting them.

I did not carry over mccarthy's paragraph about opening one student, because
that feature is not in here.

`merged/README.md` is the app's README, at the name it has at the top of the
repo. The note that used to describe this folder is now `merged/ABOUT.md`.

## Corrections to the brief

Told to me, and wrong. I would rather say so than have it inherited.

1. **Do not take `cloud.js` from `origin/main`.** The instruction was that the
   working copy holds 173 lines of another session's unfinished work.
   LearnGeo 3 owns those lines and its own `NOTES.md` says the pass is
   complete, tested, and lists the only two things it did not start, neither
   of them `cloud.js`. Taking main's copy would have dropped all of it:
   the offline merge, results coming back with ids, the account-scoped saves.
   LearnGeo 3's `cloud.js` already contains both of LearnGeo 1's passkey bits,
   so it is strictly the better base. Both are in the merged file and I
   checked them by hand.
2. **`index.html` from `origin/main` was right, for the right reason, but it
   is not the whole file.** sleepy-curie adds 61 lines of landing demo and
   LearnGeo 3 changes two, and they merge cleanly. The merged `index.html` is
   main plus both. It is not byte-identical to any folder copy, which is the
   check that matters.
3. **sleepy-curie was given to me as `cf14013`. It is `dbb5b3a`,** two commits
   ahead of main and level with it rather than three behind. LearnGeo 8 caught
   the same move. Everything I did uses `dbb5b3a`.
4. **Branch against branch was not "festive-brahmagupta and README only".**
   `epic-carson` and `happy-keller` collide in real code, in `assignments.js`
   and `quiz.js`, and both are places where the two branches fixed the same
   bug differently. Those are the two resolutions above where a pick-a-side
   would have quietly lost something.
5. **`epic-carson` against LearnGeo 3 collides in `mode-quiz.js` and
   `quiz.js`, not `assignments.js`.** `assignments.js` merges clean against
   LearnGeo 3. It conflicts against Keller instead.
6. **The shop double-charge fix was never at risk.** `dd1c0a7` is an ancestor
   of `origin/main`. `ui.js` is touched only by `happy-keller` and LearnGeo 3
   and they merge cleanly. All three parts of the fix are in the merged file.
   Production was serving a build without it, which is a deployment problem,
   not a merge problem.
7. **A block that looks deleted is not.** `epic-carson`, `happy-keller` and
   LearnGeo 3 all appear to delete the achievements check at the end of a
   class quiz. None of them did. The rings merge added it after they branched,
   so `git diff main branch` shows it as a removal. It is correctly kept. This
   is worth knowing generally: five of the six sources are behind main, so
   diffing them against main overstates what they change.

## What I checked

- All 26 JavaScript files pass `node --check`. No conflict markers anywhere.
- Every called name in the merged files resolves, compared against the same
  check run on `origin/main` so that anything the merge introduced stands out.
  That is how the `personMap.push(n)` and the missing `scoreError()` were
  found.
- LearnGeo 1's passkey work: `auth.css` and `passkey.js` linked in
  `index.html`, `experimental: { passkey: true }` and `get sb()` in
  `cloud.js`. All four present.
- LearnGeo 2's shop fix: all three parts present in `ui.js`.
- No literal `1357` anywhere under `assets/js/`, and `verify_admin_pin` is
  still what `admin-pin.js` asks.
- LearnGeo 4's brand mark: `brand.css` linked, four earth emoji in
  `index.html`, and no `min="1"` on the admin amount box.
- `index.html` is not byte-identical to any `agents/oy-NN/` copy.

What I could not check is behaviour. Nothing here was run in a browser. The
three places I would open first are the class quiz score, because `pay()`
changed shape; the landing demo, because two sessions rewrote it and the key
hints now read 1 to 4; and the teacher gradebook, because it moved from names
to account ids.

## What I did not touch

`repo/index.html` and everything else at the top of the repo are untouched.
Nothing was committed or pushed. No branch was checked out, merged, rebased or
pulled. The shared working copy still holds LearnGeo 3's uncommitted lines
exactly as they were, all 20 files byte-identical to the safety snapshot. The
whole merge was worked out with `git merge-tree` and in a clone of my own. I
did not run `vercel` and did not promote anything.

---

# Added after the merge was written to the top of the repo

Owen asked for the combined result to go to the real paths, not only to
`agents/merged/`. It is there now, and the two copies are byte-identical.
Verifying it in a browser turned up three more things.

## epic-carson against happy-keller, the pair that matters most

Its own section, because it is the one that survives a clean merge and ships
wrong behaviour, and because it is the one place where the tooling cannot help
you.

Two branches, working separately, fixed the same two bugs in the same week.
Neither knew about the other.

**The country search, in `assignments.js`.** Both found that results came out
in dataset order instead of putting what you typed the start of first. Carson
ranks four ways and sorts. Keller sorts into two buckets.

**The question pool, in `quiz.js`.** Both found that a test set on a handful of
countries quietly became a random world test. Both split the pool so the
questions stay on what was asked for and only the wrong answers borrow a wider
field.

Git flagged both files as conflicts, so nothing was hidden. **That is not the
problem.** The problem is that a conflict looks like it has two answers, and
here both answers were right and neither was complete. Taking Carson whole
loses Keller's `if (!wanted.length)` guard, which is the only thing standing
between a filter that matches nothing and an empty quiz. Taking Keller whole
loses Carson's finer ranking. Either choice compiles, passes every check, and
ships a quiz that is subtly wrong. **A human had to read both and decide.**

What went in: Carson's ranking, because it turned out to cover Keller's own
example as well as its own. Keller's empty-pool guard, because Carson does not
have one. Both are in, and both are now checked rather than assumed:

    a list matching nothing        -> 5 questions asked, not 0   PASS
    a 3-country list               -> asked only about those 3   PASS
    wrong answers for that list    -> 12 distinct options        PASS
    "ind"    -> India before Namibia                            PASS
    "port"   -> Portugal before Benin                           PASS
    "guinea" -> Guinea before Equatorial Guinea                  PASS

The last one is Keller's example passing under Carson's code, which is the
evidence that taking Carson's ranking cost nothing.

## The stream would have broken the live site, and now cannot

The brief said `epic-mccarthy`'s migration has to be applied before its code
runs. I checked the live database rather than taking it on trust. It holds
`profiles`, `classes`, `class_members`, `assignments`, `results`,
`arcade_scores` and `admin_pins`. **There is no `announcements` table.**

The merged `cloud.js` read that table inside the same `Promise.all` as
assignments, results and members, so a missing table would not have failed the
stream, it would have failed the whole class sync: the teacher dashboard and
every student's assignment list, live, the moment it deployed.

Rather than drop the stream or gamble on the migration landing first, the three
places that read or write it now tolerate the table not being there. A missing
table reads as "no posts". Every other error still throws, so a real failure is
still a failure. The site works now, and the stream switches itself on when the
migration is applied, with no second merge needed.

**This does not remove the job, it removes the risk.** Applying
`supabase/deployed/0001_announcements.sql` is still yours to do, and until you
do, the Stream tab will stay empty and anything a teacher posts will not sync.

## Two functions with the same name, and only one of them ran

`demo.js` ended up with `onKey` declared twice, once by sleepy-curie and once
by LearnGeo 3, because they sit in different parts of the file and git had no
reason to object. JavaScript does not object either: the second declaration
silently replaces the first. It was also registered on `keydown` twice, so
pressing Enter called `advance()` twice and could have skipped a question.

`node --check` passes on that file either way. It was found by opening the page
and pressing a key. Both are fixed, and no other file in the merge has a
function declared twice.

## What I checked in a browser

Served the merged copy and drove it.

- Landing page, app, Flashcards and Practice test all render. **No console
  errors anywhere.**
- The landing demo plays. The country outline draws, pressing `3` picks the
  third option, it marks correct, the fact line fills in, and Enter advances
  one question.
- The demo's key hints now read 1 to 4 rather than A to D, and they match what
  the keys actually do. That is sleepy-curie's hints reading LearnGeo 3's keys,
  and it is right, but it is a visible change neither session asked for alone.
- The home map draws with every country unseen and the counter at 0 of 213,
  which is correct for a fresh visitor.

**What I could not check.** The class quiz and the teacher gradebook both need
a signed-in teacher, a created class and an enrolled student, which is not
something I can set up here. So `pay()` in `mode-quiz.js`, where I changed the
signature to carry both Carson's `quiet` and LearnGeo 3's `country`, is checked
by reading and not by playing. Same for the gradebook moving from names to
account ids. Those two are the first things to try on the real site.

## What changed at the top of the repo

23 files modified and `supabase/deployed/` added:

    README.md
    index.html
    assets/css/app.css, demo.css
    assets/js/  admin-pin, admin, assignments, classroom, cloud, core, demo,
                globe, main, map, mode-cards, mode-learn, mode-quiz, mode-test,
                portal, quiz, teacher, ui, worldmap
    supabase/deployed/  0001_announcements.sql, README.md

`teachers.html` and `.gitignore` were already identical to the merged result
and were left alone. `agents/` is untouched apart from this folder.

Still not done by me, on purpose: no commit, no push, no `vercel`, nothing
promoted. LearnGeo 3's 867 uncommitted lines were overwritten at the top of the
repo, which is expected because LearnGeo 3 is one of the merge sources and its
work is in the result. The snapshot is at `refs/safety/wip-20260911-171154`
(`f018d49`) if any of it needs recovering.
