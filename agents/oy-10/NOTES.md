# NOTES for LearnGeo 10 OY

## Built on

Commit: ade3a48 was my local HEAD; origin/main has since moved past it to
43b5d2d and beyond. Nothing in this folder depends on a particular commit.

## What I changed

- No application code, in either round. I have never edited a file outside
  `agents/oy-10/`, and none of the uncommitted work in the shared tree is mine.
- Round 1: the deployment investigation. Found that production was serving a
  stale build because a Vercel Production build was made from a cloud agent
  branch instead of from main, and confirmed main itself was never damaged and
  none of aj's commits were lost.
- Round 2 (GeoLive): wrote `TESTPLAN.md`, the test plan for GeoLive and the
  class leaderboard, written from `agents/GEOLIVE-SPEC.md` before any of the
  code existed.

## Files in this folder

- `NOTES.md`
- `TESTPLAN.md`

No `index.html` and no application files. I own no code this round.

## Status

Status: Complete for what I own. The test plan is written and ready to run.
The tests themselves have not been run, because at the time of writing the
files they test did not exist yet. I run them when Master says pieces have
landed, and report what actually happens.

## Do not overwrite

- `TESTPLAN.md` section J, the list of gaps in the spec. Those are eight places
  where two sessions can each follow the spec correctly and still not fit
  together. They need answers from Master before the code that depends on them
  is written, not after. J2 in particular, the time limit, is needed by oy-02
  to score and by oy-04 and oy-05 to draw a countdown, and if they each pick
  their own number the points will not match the bar the student watched.

- The one line check for whether production is healthy:

      curl -s https://www.learngeo.app/ | grep -cE 'passkey\.js|admin-pin\.js'

  It prints 2 when production is healthy and 0 when production has gone stale.
  It printed 0 for the whole outage and it prints 2 now. Worth keeping because
  it turns a long diagnosis into something Owen can run himself in a second,
  and because it is the quickest way to catch the same regression next time.

- There is no Vercel CLI and no VERCEL_TOKEN on this machine. No session here
  can deploy, promote or roll back production, whatever it is asked to do.
  Production is restored either by Owen or aj in the Vercel dashboard, or on
  its own when a commit lands on main, which is what happened at 00:14 UTC on
  2026-09-12.

- One line on cause, because it can recur: production went stale when a Vercel
  Production build was made from a cloud agent branch (d8f5cba on
  claude/learngeo-4-cloud-s46zhf, cut from aj's 4ac4b47) instead of from main,
  at 23:51 UTC. The full account belongs in oy-08's PRODUCTION.md and I have
  not duplicated it here. The root cause was never identified, so the same
  thing can happen again.
