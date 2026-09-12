# Test run results, oy-10

Run on 2026-09-12 against the integration as it stood: `agents/merged/` as the
base, plus oy-09's `index.html`, `classroom.js` and `teacher.js`, plus the seven
new files from oy-02 through oy-08 at their real paths.

## Update: the browser run happened after all

Master freed port 8770 and I ran the browser sections. What follows replaces the
note below about D, E, F and H not running. Sections A, B, C and the timer work
were re-run against the current files first, because the files had grown a lot
since my first pass (geolive.js went from 7212 to 13403 bytes) and my earlier
26 of 26 had certified a version that no longer existed. It still passes 26 of
26 on the current file.

**D1, tables absent, PASSED, and the pass is real rather than accidental.**
`available()` resolves false, and `open`, `join`, `answer`, `setStatus` and
`close` all resolve to null with none of them rejecting. `watch()` returns a
function and unsubscribes cleanly. The important part is that I checked the
pass was not free: `available()` begins `if (!sb()) return false`, so with no
Supabase client the whole thing would return false without ever testing the
missing-table path. It is not short-circuiting. The performance timeline shows
a real request to
`https://envecwhnnktltfoypekk.supabase.co/rest/v1/live_sessions?select=id&limit=1`
that came back missing, so false is being reached through the missing-table
branch against the real project.

**D2, the rest of the app is completely unaffected, PASSED on both sides.**
This is the one that nearly shipped last round, and it is clean. Teacher
dashboard: all seven tabs (Stream, Classwork, People, Analytics, GeoLive,
Leaderboard, Settings) render real content, none empty, none threw. Student
app: all six views (Home, Classroom, Learn, Practice test, Class quiz,
Flashcards) render with zero runtime errors and zero unhandled rejections
across the sweep. The student Classroom tab shows a proper "Join your class"
form. The map renders. Nothing about the missing `live_` tables leaks into any
existing screen.

**F1 and F5 PASSED.** The Leaderboard tab renders "No students in this class
yet. The leaderboard fills in as people join" with the `live_` tables absent.
Empty case handled, no NaN, no throw, and it does not depend on the new tables.

**The non-default time limit, 11 of 11.** Run deliberately away from 20000 as
Master asked. At `limitMs` 30000: ms=0 scores 1000, ms=15000 scores 800,
ms=30000 scores exactly 600, and ms=20000 scores **733**, which is the number
that proves scoring reads `session.limitMs` instead of a hardcoded 20000. A
hardcoded copy would have returned 600 there. At a 5000 limit, ms=20000 clamps
to exactly 600 with no negative bonus. The student file contains exactly one
`20000` literal, the named `FALLBACK_LIMIT`.

**A correction to my own earlier reading.** I first recorded the GeoLive tab as
rendering completely blank. That was wrong. The panel contains
`DIV.signin-hint` with "Sign in to put your class online", which is
`geolivePanel()` correctly answering the signed-out case. I had mistaken the
panel's own content for a page-level banner. Reading the DOM rather than the
screenshot is what caught it.

## Still not run, and this is now a database blocker rather than a choice

Sections E and G, most of F, and the standings DOM-identity check all need a
live game, which needs the `live_` tables. `0001_announcements.sql` and
`0002_geolive.sql` are both unapplied and the realtime publication is empty, so
a game cannot be opened, joined or advanced at all. Nobody can run these until
the SQL is applied. Specifically unverified: all eight classroom situations,
the row-level-security checks, the leaderboard with real data and ties, and the
requirement that standings row nodes are the same objects across two updates.
Treat every one of those as unknown.

---

## Original note, superseded above

**Sections D, E, F and H were not run.** They need a browser, the dev server cap
is 5 per folder, all 5 belong to other chats, and Owen chose not to free one.
None of the 5 running servers serves GeoLive at all, so there was nothing to
test against. This means the tables-absent case, the eight classroom
situations, the leaderboard and the regression sweep are all UNVERIFIED. Treat
them as unknown, not as passing.

## Ran and passed

**Section A, wiring.** All seven new files are referenced by oy-09's
`index.html`, in a working order (`core.js` at 559, the GeoLive files at 573 to
578). Every asset referenced by `index.html` resolves; no 404s. No orphans
among the new files. All six spec globals exist with every method the spec
names. No GeoLive file throws at load.

**Section B, the rules module, 26 of 26.** Ran against oy-02's real file. Wrong
answer is 0. Correct at ms=0 is exactly 1000. Correct at the full limit is
exactly 600. Every correct answer is a whole number in 600..1000, checked
across the whole range. ms of 999999, negative ms and NaN all handled without
going out of range. Right-then-wrong keeps the first answer, and wrong-then-
right correctly stays wrong, which is the direction people forget. Empty
question set ends immediately. `current()` after `ended` is null, not a crash.
`standings()` keeps players who never answered. It is genuinely pure and
genuinely deterministic: identical inputs give byte-identical sessions.

**Section C, question building.** Every premade set and every custom build
produced exactly four options, the answer always among them, and no duplicate
options anywhere. That last one matters more than it looks, because `reveal()`
returns `counts` keyed by option text and two identical options would collapse
into one key and corrupt the teacher's counts. Nothing hung; the slowest build
was 4ms against a 2000ms budget.

**J2 and J4 are resolved in the code.** All four files agree the time limit is
20000ms and read it off the session rather than hardcoding it, so the countdown
and the points cannot disagree. oy-02 added a `seat` field as the final
tie-break, so standings cannot reshuffle between renders.

## Found

**1. The teacher asks for 20 questions and gets 12, silently.** Confirmed.
`fromCodes(['Peru','Chile','Bolivia'], null, 20)` returns 12, because three
countries times four kinds is twelve and it will not repeat. Not telling the
teacher is the bug, not the capping. `buildQuestions()` returns whatever it
gets and `openRoom()` only checks `if (!view.questions.length)`, so it catches
empty but never compares `view.count` to `view.questions.length`. The count
button still shows 20 selected while the game runs 12. One comparison in
`openRoom` fixes it. Owner: oy-04.

**2. There is no ISO3 in this app, and the spec is written around it.** The
spec says `code: 'PER' // ISO3, so the map can shade it`. All 213 entries in
`GeoData.countries` have fields id, name, capital, lat, lon, region, status,
note, nameAliases, capitalAliases, and exactly zero have an `iso3`. So every
question's `code` is a country name. `fromCodes(['PER','CHL','BOL'], ...)`,
which is the call the spec tells you to write, silently builds a whole-world
quiz and only `console.warn`s, which no teacher will ever see. It works today
only because oy-04's `countryKey()` is `c.iso3 || c.code || c.name` and oy-08's
`resolve()` falls through to matching on name. Both guessed the same way. Fix
the spec line, or call `resolveCodes()` before the game starts so the teacher
is told which picks were not recognised.

**3. `geolive-teacher.js:18` is fragile.** `var W = global.WW, I = W.Icons;`
dereferences at load time, unguarded. If `WW` is ever missing this file dies at
load, `GeoLiveTeacher` never gets defined, and the symptom is a teacher screen
that is simply absent with nothing pointing at the cause. Safe today only
because of load order. `geolive-student.js` uses `global.WW || {}` and is fine.

## What I would run first if a slot ever frees

D2, tables absent and the rest of the app unaffected. It is the one that takes
down the teacher dashboard and every student's assignment list rather than just
this feature, and with nothing applied to the database it is the current state
of the world rather than a hypothetical.
