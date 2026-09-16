# agents/

A drop box for parallel agent work on LearnGeo.

Ten chat sessions work on this project at once. They share one folder on
Owen's Mac, which means they can quietly overwrite each other: one session
reads `index.html`, another rewrites it, and the first one saves an edit
built on a page that no longer exists. That is what this folder is here to
stop.

Instead of ten sessions editing one file, each session drops its own copy
here. Nothing is overwritten, because no two sessions ever write to the
same path. Then one session, LearnGeo Organizer, reads all of them and
builds a single combined version.

## Who owns what

| Folder | Session |
| --- | --- |
| `oy-01/` | LearnGeo 1 OY |
| `oy-02/` | LearnGeo 2 OY |
| `oy-03/` | LearnGeo 3 OY |
| `oy-04/` | LearnGeo 4 OY |
| `oy-05/` | LearnGeo 5 OY |
| `oy-06/` | LearnGeo 6 OY |
| `oy-07/` | LearnGeo 7 OY |
| `oy-08/` | LearnGeo 8 OY |
| `oy-09/` | LearnGeo 9 OY |
| `oy-10/` | LearnGeo 10 OY |
| `merged/` | LearnGeo Organizer, output only |

Write only inside your own folder. Never edit another session's folder,
and never edit `merged/`, which belongs to the Organizer.

## How a round works

1. Owen asks for something. LearnGeo Master briefs all ten sessions.
2. Every session copies its version of each file it changed into its own
   folder, keeping the original path, so `assets/js/quiz.js` becomes
   `agents/oy-NN/assets/js/quiz.js`. Then it fills in `NOTES.md`.
3. Sessions run no git at all. Master makes one commit and one push for the
   whole round.
4. The Organizer reads all ten `NOTES.md` files, compares the copies against
   git, and writes one combined version into `merged/`.
5. Owen reviews `merged/`. If it is good, the combined files replace the real
   ones at the top of the repo in a single commit.
6. The round is over. Session folders are cleared for the next one.

## Rules

**Write only inside your own folder.** During a round, `agents/oy-NN/` is the
one place you may write. Everything else under the repo is off limits,
including the real `index.html` and anything under `assets/`. This is the
whole point: your folder cannot collide with anyone else's, so you never need
to worry about what another session is doing.

**Run no git that writes.** No add, commit, push, checkout, restore, stash,
reset, clean, merge, rebase or pull. Ten sessions share one working copy and
concurrent commits collide on `index.lock`. Read-only git is fine and
encouraged: `status`, `log`, `diff`, `show`, `merge-tree`. Master does the
single commit and the single push.

**Never take a file from another session's folder as current.** Folder copies
go stale within minutes, because local `HEAD` lags `origin/main` and because
the shared working copy mixes several sessions' unfinished edits into the same
file. Take the base from `origin/main` and use folders for what they are good
at, which is knowing what changed and why.

**Say what is unfinished.** If a change is half-done, write that in `NOTES.md`.
A half-done change described as finished is the one thing that can break the
merged version.

**Record the commit you built on.** `NOTES.md` asks for it. Without it nobody
can tell new work from old work that was already replaced.

**Timestamp every measured claim.** When you write down a number or a verdict
that came from looking at a file, a build or the database, put the time beside
it. Measurements go stale inside a single round, and a reader cannot tell a
stale one from a current one unless you say when you looked.

This is not bookkeeping. It happened twice in round 3. A session counted the
styling and reported that GeoLive shipped essentially unstyled. Another found
the off switch broken in three places. Both were measuring honestly, both were
correct at the moment they looked, and both were overtaken by files that moved
afterwards. Read later as present tense, each report would have sent someone to
repair something already repaired. What caught them was a third session
re-measuring rather than repeating, which is luck rather than process. A
timestamp makes staleness visible at a glance instead.

**Re-measure before you act on somebody else's number.** If a report says a
thing is broken, confirm it is still broken before you fix it. Decisions travel
between sessions safely. Measurements do not, because the file can move after
the measurement and the number carries no sign that it did.

**Separate the number from what you think it means, and mark the second one as
a guess.** Re-measuring catches a wrong number. It cannot catch a right number
read wrong, because measuring it again returns the same correct number and the
wrong conclusion survives untouched.

This is not theoretical. In round 4 a session compared the shipped stylesheet
against another session's copy, found the shipped one older and smaller, and
concluded a file had been dropped during the merge. Every byte size and
timestamp in that report was correct. The conclusion was wrong: the newer file
was written after the merge, for the round then in progress, and was sitting
where unmerged work is supposed to sit. Filed as it stood, it would have sent
the Organizer hunting an integration failure that never happened and put a
dropped-file accusation on a session that never had the file.

Nothing in the measurement could have revealed that. It needed the commit
history and the times the round's briefs went out, which live with Master. So
when you write down what a number MEANS, say that you are inferring it, and
route causal claims rather than filing them as findings. Numbers are yours to
measure. Causes usually are not.

**To ask whether a branch was merged, look for its own added lines, not for a
name it happens to mention.** Grepping for an identifier tells you the
identifier exists somewhere. It does not tell you that the change which
introduced it ever landed, because the name may have predated the branch
entirely.

This cost a wrong report to Owen. A branch was called half-merged on the
strength of three names, two of which already lived in the file before that
branch was written. Nothing had been half-merged and nothing was lost: it had
simply never been merged at all.

Two sessions ran that same flawed check independently and reached the same
answer, and the agreement was mistaken for confirmation. It is not. Two people
making the same mistake is one mistake, twice. What answers the question is
whether the branch's own added lines are present in the target, or a virtual
merge with `git merge-tree`, and that is the check to run first.

**Nobody deploys, and promoting counts as deploying.** Only `main` reaches
production, and only Owen or aj promotes it. Promoting a deployment is a
write, not a read: it is not a git command, so "read-only git is fine" does
not cover it, and it is the only thing any of us can do that reaches real
users directly. Never run `vercel`, never run `vercel --prod`, and never
promote a build in the dashboard.

Branch builds reaching production is a real failure here, not a hypothetical.
On 2026-09-11 three separate branch commits were promoted to Production inside
twenty minutes, and one of them took passkey sign-in off the live site for
twenty-three minutes. Restricting Production to the `main` branch is a Vercel
project setting, and until someone changes it this can happen again.
