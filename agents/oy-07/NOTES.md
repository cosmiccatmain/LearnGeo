# NOTES for LearnGeo 7 OY

## Built on

Commit: 43b5d2d (session opened at ade3a48; main moved three times while I worked)

## What I changed

- No application code. I wrote nothing under `assets/`, nothing in
  `index.html`, and nothing in any other session's folder. None of the
  uncommitted lines in the shared working tree are mine.
- My contribution this round was an audit: every branch against main, and
  every Vercel deployment against what is actually being served on the live
  domain.

## Files in this folder

- `NOTES.md` only.

No `index.html` copy on purpose. I have no version of it, and a duplicate
would only give the Organizer a file to diff for nothing.

## Status

Status: Complete. Nothing here is half-done, because nothing here is code.
The findings below are verified, not guesses. Every one was checked against
git objects or a live HTTP fetch, not inferred from a commit message.

## Do not overwrite

**1. There are six cloud branches, not four.** The count in the original
freeze was four. I found a fifth, and a sixth appeared while I was writing
this. `epic-carson` is the one that matters most: it carries real work in
`assignments.js`, `mode-quiz.js`, `quiz.js` and `README.md`, which collides
with LearnGeo 3's uncommitted bug-fix pass in all three code files. The
Organizer has to reconcile those, not pick one.

Tips as of 2026-09-12T00:24Z, all measured against main at 43b5d2d:

| Branch | Tip | Behind | Ahead |
| --- | --- | --- | --- |
| `claude/epic-carson-8ql73i` | `a7c1cd2` | 3 | 1 |
| `claude/epic-mccarthy-db7ing` | `b90284b` | 3 | 2 |
| `claude/festive-brahmagupta-3ak0w7` | `60538fa` | 3 | 2 |
| `claude/happy-keller-qnk71y` | `2237bae` | 3 | 6 |
| `claude/learngeo-4-cloud-s46zhf` | `5ab7f72` | 1 | 0 |
| `claude/sleepy-curie-nppdjn` | `cf14013` | 3 | 1 |

**2. Branch builds are reaching production. This is still happening.**
The rule in `agents/README.md` is that only `main` goes to production. That
rule is being broken by the pipeline itself, not by one careless session.
Three branch commits have been deployed to Production in twenty-five
minutes:

| Deployment | Commit | Branch | Time |
| --- | --- | --- | --- |
| `6403693176` | `d8f5cba` | `learngeo-4-cloud` | 23:51:24Z |
| `6403840156` | `2237bae` | `happy-keller` | 00:07:53Z |
| `6403881069` | `a7c1cd2` | `epic-carson` | 00:12:24Z |

The first one took the live site backwards for twenty-three minutes.
`www.learngeo.app` served `index.html` blob `69d6047`, which is byte for
byte aj's `4ac4b47` version, with `passkey.js`, `admin-pin.js`, `auth.css`
and `brand.css` absent from the build entirely. Passkey sign-in was dead on
the real domain for that whole window, and passkeys only work there, so
there was no fallback.

The live site is correct again as I write this. It serves blob `c5c175de`,
which matches `43b5d2d:index.html`, and all four files are back. But it is
correct by ordering luck: main's deploy landed at 00:14:22Z, two minutes
after `epic-carson` went out. The next branch push to production breaks it
again, and merging branches in the right order does not fix that. Somebody
has to stop branches from producing Production deployments.

**3. Treat every list above as a snapshot, including mine.** Branch tips
moved twice mid-audit and main moved three times. `learngeo-4-cloud` went
`d8f5cba` to `5ab7f72` under me, and `sleepy-curie` did not exist when I
started this file. Re-run the tips at merge time rather than trusting this
table.
