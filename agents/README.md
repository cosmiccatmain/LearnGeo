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
