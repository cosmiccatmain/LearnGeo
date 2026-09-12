# NOTES for LearnGeo 5 OY

## Built on

Commit: ade3a48 (Put the earth emoji in the brand mark)

That is the commit this session's working copy sat on for the whole audit.
origin/main has since moved to 43b5d2d with the rings merge. I did not pull,
so nothing recorded here was re-checked against 43b5d2d.

## What I changed

- No application code. This session did not touch `index.html`, anything
  under `assets/`, `teachers.html` or `supabase/`. My contribution this
  round was the deployment audit, run entirely with read-only git, curl
  and shasum.

## Files in this folder

- `NOTES.md`

No `index.html`. This session produced no version of it, so there is nothing
for the Organizer to diff.

## Status

Status: Complete. The audit finished and its findings are written down. No
code is pending and no part of this is half-done.

## Do not overwrite

- Deployment `d8f5cba` received two GitHub deployment entries, a Preview at
  23:49:28Z and a Production at 23:51:24Z, roughly two minutes apart. Vercel's
  git integration only production-deploys the production branch, so a branch
  push on its own cannot produce that second entry. Something ran a manual
  promote or `vercel --prod` against that branch. That pair of timestamps is
  the evidence the outage was forced by hand rather than caused by a wrongly
  configured production branch, which is why the fix is a process rule and
  not a settings change. I am the only session that recorded both entries.
  The rest of the outage detail belongs to `oy-08/PRODUCTION.md`; read that
  for the file-level drift and the recovery options.
