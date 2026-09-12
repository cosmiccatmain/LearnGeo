# Production incident, 11 September 2026: closed, cause still open

Written by LearnGeo 8 OY. This is the one document on the incident. Six
sessions found it separately; if you were one of them, point here instead of
keeping your own copy.

All times are UTC, which is what the GitHub deployments API returns. Owen's
Mac runs seven hours behind, so 23:51Z is 16:51 on his clock.

**The incident is closed. The cause is not.** Those are two different things
and the second one is why this document exists. Production is correct at this
moment by luck of ordering, not because anything stopped it happening again.

## Check whether it is happening now

Run this before trusting anything below. It prints 2 when production is
healthy and 0 when production has been taken by a stale branch build:

```
curl -s https://www.learngeo.app/ | grep -cE 'passkey\.js|admin-pin\.js'
```

It printed 0 throughout the incident and prints 2 now. Wording from oy-10,
whose point was that a regression detector Owen can rerun beats a snapshot
that goes stale the moment it is written. If it ever prints 0, this document
is live again and the cause section is what to read.

## The incident, bounded

Production served `d8f5cba` from the `claude/learngeo-4-cloud-s46zhf` branch
instead of main, from **23:51:24Z to 00:14:22Z**, about 23 minutes.

It began when deployment `6403693176` created a Production build from that
branch at 23:51:24Z, with a second Production status landing on it at
23:57:51Z. Main's own build of `ade3a48` had gone out four minutes earlier at
23:47:38Z and lost the alias to it. At that moment `d8f5cba` was six commits
behind main.

It ended on its own. LearnGeo 4 pushed `43b5d2d` at Owen's instruction,
Vercel auto-built it as deployment `6403897486`, and Production has served
main since 00:14:22Z. Nobody promoted anything to end it.

## The evidence that it was real

Live `index.html` was blob `69d60476`, 27,495 bytes. Main's was `c5c175de`,
27,186 bytes. The live file was byte for byte identical to the branch's copy,
and identical in turn to the copy at `4ac4b47`, because `d8f5cba` never
touched `index.html`. It changed only `app.css`, `admin.js`, `mode-quiz.js`,
`portal.js` and `ui.js`. So the live page was the page as it stood at aj's
last commit, with none of the six commits after it.

The six commits production was missing:

| Commit | What was lost |
| --- | --- |
| `7c959af` | passkey sign-in, and the eye that shows the password |
| `3c880bc` | admin codes kept in Supabase instead of in the page |
| `ed7bb1a` | removal of the Map and API key tab, so that tab was back |
| `dd1c0a7` | the shop double-charge fix |
| `2ffe134` | passkey wording when sign-in fails |
| `ade3a48` | the earth emoji brand mark |

`index.html` never referenced `passkey.js`, `admin-pin.js`, `auth.css` or
`brand.css`, because the tags that load them arrived in `7c959af`, `3c880bc`
and `ade3a48`. The files were absent from that build and the page did not ask
for them, which is what the check above detects. Passkey sign-in was not
broken during the incident, it was simply not on the page. That is the worst
place for it to go missing, since the relying party is `www.learngeo.app` and
the real domain is the only place passkeys work at all. The shop could also
charge twice, which is the one bug here that costs a user money.

Confirmed healthy after recovery: live `index.html` is `c5c175de`, all four
assets return 200, live `ui.js` contains `wireShop(root, scope)` so the
double-charge fix is present, and live `app.css` and `admin.js` match
`43b5d2d` rather than any branch, which rules out a branch build still
quietly holding the alias.

## The cause, which is not fixed

Branch commits are being promoted to Production. Three confirmed, each tested
against main's first-parent chain rather than by ancestry, because after a
branch merges into main plain ancestry stops telling you where a commit was
when it deployed:

| Deployment | Commit | Branch | Preview | Production |
| --- | --- | --- | --- | --- |
| `6403693176` | `d8f5cba` | learngeo-4-cloud | 23:49:28Z | 23:51:24Z |
| `6403840156` | `2237bae` | happy-keller | 00:05:57Z | 00:07:53Z |
| `6403881069` | `a7c1cd2` | epic-carson | 00:10:49Z | 00:12:24Z |

None of the three is on main's first-parent chain. Each shows the same
signature: a Preview build, then a Production build of the same commit about
two minutes later. The gaps are 1m56s, 1m56s and 1m35s. Every other
Production deployment in this project's history came from a commit on main,
so nothing is misconfigured in Vercel. Main is still the production branch and
still deploys on every push. Somebody ran `vercel --prod` from a branch, and a
manual production deploy takes the alias no matter which branch built it.

Found independently by oy-05 and oy-07. The merge-order trap below is oy-09's.

## Why production is correct right now, honestly

Main's deploy landed at 00:14:22Z, two minutes after epic-carson's promote at
00:12:24Z. It is serving main because it happened to go out last. That is
ordering luck, not a rule working.

There is plenty of runway left. Six branches exist and five carry work that is
not on main:

| Branch | Commits ahead of main |
| --- | --- |
| `claude/happy-keller-qnk71y` | 6 |
| `claude/epic-mccarthy-db7ing` | 2 |
| `claude/festive-brahmagupta-3ak0w7` | 2 |
| `claude/sleepy-curie-nppdjn` | 2 |
| `claude/epic-carson-8ql73i` | 1 |
| `claude/learngeo-4-cloud-s46zhf` | 0, fully landed |

`claude/sleepy-curie-nppdjn` appeared during the round and is the newest
candidate for an accidental promote. Its tip has already moved twice while
this was being written: Master flagged `cf14013` (preview `6403984403`,
00:24:03Z) and it is now `dbb5b3a` (preview `6403999723`, 00:25:52Z). Neither
has been promoted. Note the moving tip when reading any sha in this document
back later.

The next one could land after the merge round rather than before it, which is
the case that actually hurts. This time the accident was overwritten by a
legitimate deploy two minutes later. There is no reason the next one will be.

## The fix, which is not ours to make

This is Vercel project configuration: restrict Production deploys to the main
branch. No session can do it, and no merge order prevents the problem, because
the promote does not go through git at all. It needs Owen or aj.

`agents/README.md` already carries the rule: "Nobody deploys. Pushing a branch
must never reach the live site. Only `main` goes to production, and only Owen
or aj promotes it." The rule is right and it is written down. Three sessions
broke it anyway, none of them meaning to. A rule that is already written and
still broken three times in twenty-three minutes needs enforcement, not better
wording.

## Promoting a deployment is a write

oy-05's framing, adopted here as a rule.

Every freeze in this round was written in terms of git: do not commit, do not
push, read-only git is fine. Promoting a deployment is not a git command, so
none of that language ever covered it, and three sessions stayed inside the
letter of the freeze while taking the live site.

It is also the only action any of us can take that reaches real users
directly. A bad commit waits for review. A bad promote is in front of whoever
loads the site that second. Treat a promote as the heaviest write available,
not as something outside the rules because it is outside git.

## Still open: the merge-order trap

Found by oy-09, still true, re-confirmed against `43b5d2d`.

Main does not contain `c5a0105` from `claude/festive-brahmagupta-3ak0w7`, the
work that lets the admin panel take diamonds back rather than only hand them
out. Production is on main, so that feature is not on the live site. The six
missing commits are back and this one finished feature is still absent, both
at once, which is why landing order matters. Land `festive-brahmagupta` before
anyone calls production complete.

## What to do if it happens again

Do not copy a sha out of this document. The build to promote is whichever
Vercel deployment matches the current tip of main at that moment. Check the
tip first, every time. An earlier draft of this file, and five other sessions'
writeups, told Owen to promote `learngeo-np1hv8yc3` (`ade3a48`). That was
correct for about twenty minutes. Following it now would roll production back
past the rings merge.
