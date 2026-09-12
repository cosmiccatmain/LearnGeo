# NOTES for LearnGeo 8 OY

## Built on

Commit: 43b5d2d (origin/main, "Merge the rings rebuild into main")

That is what I checked the live site against. The shared working copy is still
sitting on ade3a48 with other sessions' uncommitted work in it, so do not read
my folder as having been produced from ade3a48. I checked against fetched refs
and against the live domain, never against the working copy.

## What I changed

I changed no application code. Not one line of `index.html`, and nothing under
`assets/`. My deliverable is the document.

- `PRODUCTION.md`: the single writeup of the 11 September production incident.
  Written as a closed incident with an open cause, because the incident ended
  at 00:14:22Z but nothing prevents the next one. Six sessions found this
  separately. This is meant to be the one that survives so the other five can
  be deleted rather than merged.

## Files in this folder

- `PRODUCTION.md`
- `NOTES.md`

No `index.html`. I have no version of it and never edited one, so copying the
repo's file in would only hand the Organizer a file to diff for no reason.

## Status

Status: complete. Rewritten once, after Master's correction that the incident
had already recovered. Both the outage framing and the stale remediation are
gone.

Credits carried in the document, please keep them attached: oy-05 and oy-07
found the forced promotes independently, oy-09 found the merge-order trap,
oy-10 wrote the health check and made the case for a rerunnable detector over
a snapshot, and the "promoting a deployment is a write" rule is oy-05's
framing.

## Do not overwrite

- **The closed-incident framing.** The incident ended at 00:14:22Z. If the
  Organizer merges my document with the five earlier writeups and any of them
  still describes production as down, the merged file is wrong on its first
  line.
- **The correction about `ade3a48`.** Five writeups say to promote
  `learngeo-np1hv8yc3` (`ade3a48`). That was right for about twenty minutes
  and is now wrong: it predates the rings merge, so following it would roll
  production backwards. If the old instruction survives the merge someone will
  act on it. The corrected version has to win.
- **The cause section and its table.** Three branch commits were promoted to
  Production inside twenty-three minutes, each tested against main's
  first-parent chain rather than plain ancestry, which matters because
  `d8f5cba` became an ancestor of main once the rings branch merged and plain
  ancestry stops telling you where a commit was when it deployed. This is the
  part that predicts the next incident, so it should not be trimmed as
  history.
- **oy-09's merge-order trap.** Main still does not contain `c5a0105`, the
  admin-diamonds work on `claude/festive-brahmagupta-3ak0w7`. Re-confirmed
  against `43b5d2d`. Drop that paragraph and production gets called complete
  while a finished feature is missing from it.
- **The "do not copy a sha out of this document" close.** Every specific sha
  in here has a short shelf life. `sleepy-curie`'s tip moved twice while I was
  writing, from `cf14013` to `dbb5b3a`. The instruction to check the current
  tip of main rather than reuse a sha is the part that stays true.

## One thing that is not in the document, for Owen

The fix is a Vercel setting, restricting Production deploys to main. No
session can make it and no merge order substitutes for it. Until it is set,
the next `vercel --prod` from any of the five branches with unlanded work
takes the live site again.
