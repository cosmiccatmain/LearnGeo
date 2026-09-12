# NOTES for LearnGeo 9 OY

## Built on

Commit: 43b5d2d (origin/main, "Merge the rings rebuild into main").

I never checked out a working copy of my own. Everything below was derived
read-only against fetched refs and against the live site, so it is current as
of 43b5d2d rather than the older ade3a48 that several other sessions recorded.

## What I changed

- No application code. I did not touch `index.html`, `teachers.html`, anything
  under `assets/`, or anything under `supabase/`. None of the uncommitted work
  in the shared tree is mine, and I ran no git command that writes.
- My contribution was deployment fingerprinting: pulling each file off the live
  site and hashing it with `git hash-object` to identify exactly which commit
  production was built from, rather than guessing from timestamps.
- My second contribution was the merge-order analysis, re-derived for 43b5d2d
  and written out under "Do not overwrite" below.

## Files in this folder

- `NOTES.md` only.

No `index.html`. I have no version of it, and a copy of the shared working file
would only give the Organizer a stale diff to resolve for no reason.

## Status

Status: Complete. Nothing here is half-done and no code is pending.

## Do not overwrite

**1. The original merge-order trap is now void. Do not act on it.**

I am the session that raised it, so I am the one retiring it. It said: repoint
Vercel at main before the unlanded branches land, and production gains the
missing commits but loses the rings and diamonds work. That no longer holds,
for two separate reasons, and either one alone is enough:

- The rings work `d8f5cba` is now an ancestor of main `43b5d2d`. It cannot be
  lost by anything.
- No repoint was ever needed. Vercel tracks `main` and always did. Production
  restored itself the moment `43b5d2d` landed, with no dashboard change by
  anyone. If the old warning survives into the merge, someone will go looking
  for a Vercel setting to change and there is no such setting to change.

Verified against the live site at 43b5d2d, not assumed: `index.html` and all of
`portal.js`, `app.css`, `ui.js`, `admin.js`, `mode-quiz.js`, `core.js` and
`quiz.js` are byte-identical to main. `passkey.js`, `admin-pin.js`, `auth.css`
and `brand.css` all return 200 where they returned 404 during the outage. The
Map and API key tab is gone from the live `ui.js`. The page etag moved from
`4cad7b99879e4685584621b2c6c8a5eb` to `f33eb8d28cc3bbe59e828439f2d13fd2`.

**2. What replaces it, and this is the part that matters going forward.**

Because `main` auto-deploys, the merge order is a production release order.
There is no staging gate between a merge and the live site. Every branch the
Organizer lands is public within minutes, so a half-done branch merged to tidy
up the round goes straight to real users.

**3. For `index.html` specifically, which is what this round is about.**

Of the five unlanded branches, exactly one touches `index.html`:
`claude/sleepy-curie-nppdjn` at `cf14013`, which adds 61 lines for the landing
demo map and its keyboard support. The other four leave the file alone.

So the correct merged `index.html` is main's current `c5c175d` plus
sleepy-curie's additions, and nothing else. Any session folder containing a
whole-file `index.html` copy is a working copy of the shared tree, not an
authored version, and diffing one over that result will reintroduce other
sessions' uncommitted edits. This is the concrete reason the "do not copy
index.html" rule is right.

**4. One genuine ordering constraint, the only one I found.**

`claude/epic-mccarthy-db7ing` carries `supabase/deployed/0001_announcements.sql`
alongside the teacher stream code that reads it. The migration has to be applied
to Supabase before or with that merge. Land the code first and the teacher
dashboard queries a table that does not exist, live. Every other branch is
code-only and can land in any order.

**5. Branch inventory at 43b5d2d. There are five unlanded, not four.**

| Branch | Tip | Carries |
| --- | --- | --- |
| `claude/epic-carson-8ql73i` | `a7c1cd2` | three scoring and picking fixes |
| `claude/epic-mccarthy-db7ing` | `b90284b` | teacher stream, plus the SQL migration |
| `claude/festive-brahmagupta-3ak0w7` | `c5a0105` | admin panel can take diamonds back |
| `claude/happy-keller-qnk71y` | `2237bae` | six fixes, class join and map cache |
| `claude/sleepy-curie-nppdjn` | `cf14013` | landing demo map, the only index.html |

`claude/learngeo-4-cloud-s46zhf` has landed and needs nothing.

**6. Where the unlanded branches collide. Worth reading before merging.**

- `assets/css/app.css`: four ways, epic-mccarthy, festive-brahmagupta,
  happy-keller and sleepy-curie.
- `README.md`: four ways, epic-carson, epic-mccarthy, festive-brahmagupta and
  happy-keller.
- `assets/js/quiz.js`, `assets/js/mode-quiz.js` and `assets/js/assignments.js`:
  two ways each, epic-carson and happy-keller. These two branches overlap on
  three files and both change quiz scoring, so they are the pair most likely to
  produce a merge that compiles and still scores wrong. Merge them adjacently
  and check the result rather than trusting a clean merge.
- `assets/js/classroom.js`: two ways, epic-mccarthy and happy-keller.

Everything else is single-owner.
