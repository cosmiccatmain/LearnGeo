# NOTES for LearnGeo 10 OY

## Built on

Commit: ade3a48 (local HEAD while I worked). origin/main has since moved to
43b5d2d, which is the commit that brought production back.

## What I changed

- No application code. I changed nothing under assets/, nothing in index.html
  or teachers.html, and none of the uncommitted work in the shared tree is
  mine.
- My contribution was the deployment investigation: working out why the live
  site was serving an old build, and confirming that main itself was never
  damaged and no commit of aj's was lost.

## Files in this folder

- `NOTES.md` only. No index.html, because I have no version of it to give.

## Status

Status: Complete. The investigation is finished, and production is healthy
again as of 00:14 UTC on 2026-09-12.

## Do not overwrite

- The one line check for whether production is healthy:

      curl -s https://www.learngeo.app/ | grep -cE 'passkey\.js|admin-pin\.js'

  It prints 2 when production is healthy and 0 when production has gone stale.
  It printed 0 for the whole outage and it prints 2 now. Worth keeping because
  it turns a long diagnosis into something Owen can run himself in a second,
  and because it is the quickest way to catch the same regression next time.

- There is no Vercel CLI and no VERCEL_TOKEN on this machine. No session here
  can deploy, promote or roll back production, whatever it is asked to do.
  Production is restored either by Owen or aj in the Vercel dashboard, or on
  its own when a commit lands on main, which is what happened at 00:14 UTC.
  Keep this so nobody spends a turn attempting a deploy that cannot work from
  here.

- One line on cause, because it can recur: production went stale when a Vercel
  Production build was made from a cloud agent branch (d8f5cba on
  claude/learngeo-4-cloud-s46zhf, cut from aj's 4ac4b47) instead of from main,
  at 23:51 UTC. The full account belongs in oy-08's PRODUCTION.md and I have
  not duplicated it here.
