# NOTES for LearnGeo 3 OY

## Built on

Commit: ade3a48

That was the tip of origin/main when this work started. origin/main has since
moved to 43b5d2d (the rings merge), so the Organizer will need to replay these
changes onto that. None of my files were touched by 43b5d2d as far as I can
tell, but check quiz.js, assignments.js and mode-quiz.js: the cloud branch
epic-carson-8ql73i touches those three too, and it is not merged yet.

## What I changed

A bug-fix pass over the whole app, from a four-part review Owen approved in
full. In plain terms:

- Tests set on four or fewer countries now ask about those countries. They
  used to quietly ask about random ones from the whole world instead, which
  hit every short teacher assignment and the "practice your weakest places"
  card on the home screen.
- The map blur now works at world zoom. Big countries (USA, Russia, Canada,
  France, Greenland) frame at a zoom the old guard ignored, so the map tiles
  printed the country name while the question was asking for it. Worst in the
  class quiz, where students type the name.
- Countries whose capital repeats their name (Singapore, Monaco, Vatican City,
  Djibouti and 13 more) no longer get asked a question that contains its own
  answer. They get a map question instead.
- Tuvalu and Gibraltar have no outline in our map data, so "which country is
  shaded?" was unanswerable for them. They now get a capital question.
- In exam mode, questions you never answered no longer count as wrong. They
  used to break your streak, push those countries down a level and pad your
  daily goal.
- The class quiz no longer moves mastery two steps per question, which was
  inflating how much you had "mastered".
- Answers that are also right are no longer marked wrong: Georgetown and
  George Town can no longer appear together, and Jerusalem is no longer used
  as a wrong answer for Palestine.
- Space and Enter on a focused button (Filters, Deck settings, Rebuild deck)
  now press the button instead of firing the study shortcut behind it.
- Three saved values were being thrown away on every page load, which made a
  teacher's edits silently do nothing until the next sync, then get overwritten
  by it, and could lose work done offline after signing in.
- Choosing Teacher when you sign up now sticks. Teachers were being turned back
  into students on their first sign-in, with no way to ask again.
- "Reset all progress" now actually clears your account, and says so honestly
  if it could only clear this device.
- If the browser cannot save (private mode, full storage), you get told once
  instead of losing the session silently. Unreadable saved data is backed up
  before it is replaced.
- The gradebook now keys on the account rather than the display name, so two
  students with the same name stop sharing one row and one average.
- Teacher edits made offline are merged instead of being wiped by the next
  sync, and a re-created class no longer duplicates every score.
- Scores read the same on both sides now: the student's screen and the
  teacher's gradebook both show the latest attempt.
- Signing out no longer deletes a save that never got uploaded, and a late
  reply from the server can no longer write into a different account's save.
- The landing page demo: the sign-up popup can no longer land on top of the
  app or a fresh question, it only asks once, the A/B/C/D badges are now real
  1-4 keys matching the app, keyboard focus stays on the question, and it says
  so plainly if accounts cannot load instead of pretending you signed up.
- The admin keypad no longer has a code built into the page (see below).
- The dead tile-provider and API-key code is gone, left over from the Map and
  API key tab Owen had me delete.
- README brought back in line with what the app actually is.

## Files in this folder

- `index.html`
- `README.md`
- `assets/css/demo.css`
- `assets/js/admin-pin.js`
- `assets/js/admin.js`
- `assets/js/assignments.js`
- `assets/js/classroom.js`
- `assets/js/cloud.js`
- `assets/js/core.js`
- `assets/js/demo.js`
- `assets/js/map.js`
- `assets/js/mode-cards.js`
- `assets/js/mode-learn.js`
- `assets/js/mode-quiz.js`
- `assets/js/mode-test.js`
- `assets/js/portal.js`
- `assets/js/quiz.js`
- `assets/js/teacher.js`
- `assets/js/ui.js`
- `assets/js/worldmap.js`

## Status

Status: Complete.

Every file passes `node --check`. I ran the built app before the freeze: no
errors in the console, all seven views render, Settings opens and saves, the
demo plays start to finish, and I checked four of the fixes directly in the
running page (short country lists, the giveaway swap, the Tuvalu fallback, and
the blur at zoom 2).

Two things are identified but NOT started, so they are not in these files.
Both are listed under "Do not overwrite" so they do not get lost.

## Do not overwrite

- **The admin code is no longer in the page, and it fails closed.** There is no
  literal `1357` anywhere in these files. The codes live in Supabase, hashed,
  and `AdminPin.verify()` asks `verify_admin_pin()` about one. It returns
  `null` when the question could not be asked at all (no Supabase client, an
  RPC error, or a failed request), which is deliberately different from a wrong
  code and never unlocks anything.
  **What this means offline: the admin panel cannot be opened at all.** With no
  internet, or if Supabase is unreachable or the script is blocked, typing the
  correct code shows "Can't check the code right now. Try again when you're
  online." and the panel stays shut, for Owen as much as for anyone else. That
  is the intended trade for having no code sitting in a public repo, but it is
  Owen's call to make knowingly. If he wants the panel to work offline, that
  needs a deliberate decision and a different design, not a fallback code
  quietly added back.
- **portal.js still shows "best" (identified, not started).** Around line 399
  the home screen's assignment row prints `· best N%`, while the student's
  Grades panel and the teacher's gradebook now both show the latest attempt.
  Until it is changed, the home screen can disagree with both. Its inbox
  buttons also carry a list position rather than an id, so a sync landing
  between drawing the row and clicking it can act on the wrong assignment.
- **ui.js openAuth() returns early when already signed in (identified, not
  started).** Around line 755 it shows an "Already signed in" toast and returns
  without calling the `then` callback it was given. Anything that opens sign-in
  and expects to carry on afterwards silently does nothing. The live case is
  `shareInvite()` in teacher.js: a signed-in teacher with no class code presses
  Sign in and nothing happens. classroom.js is already routed around it, so
  fixing openAuth must not undo that.
