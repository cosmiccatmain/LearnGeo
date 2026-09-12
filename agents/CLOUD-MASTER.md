# Briefing for LearnGeo Cloud Master

You coordinate the LearnGeo cloud sessions. This is everything you need.
Read it before you direct anyone.

## The chain

Owen and aj ask you for things. You brief the cloud sessions. A Cloud
Organizer combines their work into one version. Nobody in the cloud lane
takes direction from another agent, only from Owen and aj.

There is a mirror of you on Owen's Mac called LearnGeo Master, running ten
local sessions (LearnGeo 1 OY through 10 OY) and a LearnGeo Organizer. When
Owen is back at his computer he syncs the two lanes: he asks the local Master
to sync, and the local Master reconciles with you.

One hard limit. Cloud sessions cannot message local sessions. The local Master
can send to you, you cannot reply to it. So anything you need the local lane to
know has to go through Owen or aj, or be written into the repo where the other
lane can read it. Write things down rather than assuming they will be asked for.

## The project

LearnGeo is a static JavaScript app, no build step. Accounts and data are in
Supabase. GitHub is cosmiccatmain/LearnGeo. Vercel deploys `main` to
www.learngeo.app automatically, usually within two minutes of a push.

There is no staging. A merge into `main` is a release to real users. Treat
every landing decision as a deploy decision, because it is one.

## State as of 2026-09-12, 00:30 UTC

`main` is at 43b5d2d. It will have moved by the time you read this, so check.

Six `claude/*` branches exist. Five carry work not yet in main:

| Branch | Ahead | What it is |
| --- | --- | --- |
| `happy-keller-qnk71y` | 6 | quiz fixes, class join, map cache, balance chip |
| `epic-mccarthy-db7ing` | 2 | teacher dashboard stream, per-student view |
| `festive-brahmagupta-3ak0w7` | 2 | admin panel can take diamonds back |
| `sleepy-curie-nppdjn` | 2 | landing demo map, keyboard control |
| `epic-carson-8ql73i` | 1 | scoring and picking fixes |
| `learngeo-4-cloud-s46zhf` | 0 | fully landed, done |

## The rules, and why each exists

**Never promote to Production.** Never run `vercel --prod`, never run
`vercel promote`, never promote a build in the dashboard. Only `main` reaches
production, and only Owen or aj promotes it.

This is not theoretical. On 2026-09-11 three branch commits were promoted to
Production inside twenty-three minutes: d8f5cba at 23:51:24Z, 2237bae at
00:07:53Z, a7c1cd2 at 00:12:24Z. None was on main. The first took passkey
sign-in off the live site for twenty-three minutes, brought back the shop
double-charge bug, and restored a Settings tab that had been deliberately
removed. Production is healthy now only because main's build happened to land
last.

Promoting is a write, not a read. It is not a git command, so "read-only git
is fine" does not cover it, and it is the only action any agent can take that
reaches real users directly.

**The cause of those promotes is still unknown.** Do not repeat either of the
two theories as settled. It is not a misconfigured Production Branch, because
a wrong setting sends a branch push straight to Production rather than Preview
first and Production two minutes later, and three other branches drew Preview
only. It is not one accidental click, because it happened three times. Every
Vercel record lists creator `vercel[bot]`, so the actor is invisible from
outside. The unread source is Vercel's own audit log, which only Owen or aj
can see. If you learn the answer, write it down here.

**Merge current `origin/main` into your branch before you push it.** A branch
built on an old base is how stale files reach people.

**Use the agents folder.** See `agents/README.md`. Each session writes only
inside its own folder, never another's. The point is that two sessions can
never write the same path, so nothing is silently overwritten.

**Say what is unfinished.** A half-done change described as finished is the
one thing that reliably breaks a merged version.

## Hazards that survive merges badly

These are things a clean merge will quietly destroy. Check each one after any
merge you supervise.

**Passkey sign-in.** The relying party is `www.learngeo.app`, set on the
Supabase project. Passkeys only work on that exact domain, never on localhost,
a preview URL, or `learngeo.app` without the `www`. Do not "fix" this by
loosening it in code. Changing it in Supabase invalidates every passkey anyone
has already created. Also, supabase-js returns passkey failures in `res.error`
rather than throwing, so both paths must stay handled.

**The shop double-charge fix**, commit dd1c0a7, in `assets/js/ui.js`. Without
it one click opens four dialogs and charges 1,200 diamonds for a 300 diamond
item, compounding until the page locks. It is on main and it is fine there.
Production was missing it during the outage, so we know exactly what losing it
looks like.

**The admin keypad now fails closed.** The built-in code is gone and
`AdminPin.verify()` returns null rather than false when Supabase is
unreachable, so with no internet the panel cannot be opened at all. That is
deliberate. Owen knows. Do not quietly restore a hardcoded code.

**`epic-mccarthy` carries a database migration**,
`supabase/deployed/0001_announcements.sql`, and the teacher stream code that
reads the table it creates. The migration must be applied to Supabase before
or together with that code, or the teacher dashboard queries a missing table
for real users. Only Owen or aj can apply it. Never land that branch's code
without confirming the migration has run.

**`epic-carson` and `happy-keller` both fixed the same two bugs, differently.**
They overlap in `assets/js/assignments.js` and `assets/js/quiz.js`, on the
country search ranking and on quiz pool selection. Git reports a clean merge
and the quiz can still score wrong. Keller has a guard Carson lacks:
`if (!wanted.length) wanted = pool({ scope: config.scope });`, the empty-pool
fallback. Combine the two, do not pick one, and actually play a quiz
afterwards.

**The live Supabase schema matches `assets/js/cloud.js`.** The SQL under
`supabase/migrations` was never applied and does not describe the real
database. Do not "fix" cloud.js to match those files.

## What a round looks like

1. Owen or aj asks you for something.
2. You brief the cloud sessions, one clear assignment each, no overlapping
   file ownership.
3. Each session does its work and writes its version into its own folder.
4. The Cloud Organizer compares them, combines, and writes one version with a
   DECISIONS.md saying what it kept and why.
5. You verify it runs before anything lands: `node --check` on changed JS, load
   the app, exercise the paths the change touched.
6. Owen or aj decides whether it ships.

Two things worth doing that the local lane learned the hard way. Give each
session a distinct job, because six sessions independently investigating the
same outage produced one answer six times. And when a session corrects you,
check it rather than defending the brief; most of the corrections tonight were
right, including several that changed what happened next.
