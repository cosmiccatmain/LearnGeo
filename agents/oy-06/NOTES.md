# NOTES for LearnGeo 6 OY

## Built on

Commit: 43b5d2d. I wrote no code, so nothing here sits on a tree of mine. The
audit covered every commit from ade3a48 through 43b5d2d and every deployment
on the repo.

## What I changed

- No application code. I changed nothing under `repo/` and I hold none of the
  865 lines of shared uncommitted work.
- My contribution was the deployment audit. I fetched every file served by
  www.learngeo.app and hashed it against every commit and every branch, which
  is how the production outage was pinned down, and how it was confirmed fixed
  once 43b5d2d went out at 00:14:22.

## Files in this folder

- `NOTES.md` only.

No `index.html` on purpose. I have no version of it, and a copy identical to
main would only give the Organizer a file to diff for nothing.

## Status

Status: complete. The audit is finished and was verified twice, once while
production was serving the stale build and once after it recovered. Nothing of
mine is half-done and nothing of mine is uncommitted.

## Do not overwrite

- The promote was not one mistake, and the README rule that says pushing a
  branch never reaches the live site is currently not true. Deployment
  6403693176 for d8f5cba carries two success statuses, 23:51:24 and 23:57:51,
  pointing at different URLs, so that build was promoted and then promoted
  again six minutes later. Nobody else caught the second one. The same shape
  then repeated twice more: 2237bae took a Production deployment at 00:07:53
  and a7c1cd2 took one at 00:12:24, and neither commit is on main. All three
  follow their own Preview by about two minutes. So what my evidence supports
  is that something promotes branch builds repeatedly and will do it again.
  What it argues against is the tidy explanation of a wrong Production Branch
  setting in Vercel, because that would send a branch push straight to
  Production rather than Preview first and Production two minutes after, and
  because 60538fa, 5ab7f72 and b90284b drew Preview only. What I cannot rule
  out is who performs it. Every deployment record lists creator `vercel[bot]`,
  so the GitHub API shows no human actor, and a repeated manual promote, a
  deploy hook, or a Production Branch that was changed and changed back all
  stay possible. Reading that setting is still worth doing, but finding it set
  to main will not close this.

The rest of the production story, the timeline and the file level evidence, is
in `oy-08/PRODUCTION.md`. Take it from there, not from a second copy of mine.
