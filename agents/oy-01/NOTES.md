# NOTES for LearnGeo 1 OY

## Built on

Commit: ade3a48 (local HEAD). origin/main is aa0ca26. The SQL is written against the
**live database as it actually is today**, which I read directly rather than
from supabase/migrations.

## What I changed

Round 2, GeoLive (this round):

- Added the database GeoLive runs on: three tables, `live_sessions`,
  `live_players`, `live_answers`, plus one helper function students use to
  join a game with a code. Nothing existing is touched.

Round 1, passkeys (already on main as 7c959af and 2ffe134, nothing to merge):

- Sign in with a passkey instead of a password, and an eye button on every
  password box.

## Files in this folder

- `supabase/deployed/0002_geolive.sql` — this round's work
- `assets/js/passkey.js`, `assets/css/auth.css` — round 1, byte-identical to
  what is already on main

I removed the `index.html` I copied here last round. It was a copy of the
shared working tree, it was already out of date against origin/main, and this
round says only oy-09 touches index.html. Leaving a stale copy in an agent
folder is exactly how the wrong index.html gets picked. Take index.html from
origin/main.

## The contract for oy-03

You are writing `cloud-geolive.js` against these. Names are final unless
Master says otherwise:

```
live_sessions   id, class_id, host_id, code, status, questions,
                question_index, time_limit_ms, asked_at, created_at,
                updated_at, ended_at
classes         + geolive_enabled (default true), leaderboard_enabled (default false)
class_members   + level, xp (both nullable, null = never synced), via sync_level()
live_players    id, session_id, student_id, name, score, streak,
                answered, correct, joined_at (null until they arrive)
live_answers    id, session_id, player_id, question_index, choice, correct,
                points, ms, created_at
```

- `status` is one of `lobby`, `asking`, `reveal`, `ended`.
- `questions` is the array of question objects from the spec, stored as jsonb.
- `live_now()` returns the server's time, for the clock offset.
- Joining: call `live_join(p_code text, p_name text)`. It returns
  `{ sessionId, playerId, code, status }`. **Do not insert into live_players
  from the client**; it is blocked on purpose (see below).
- `GeoLiveCloud.open` inserts the session row with `host_id` = the signed-in
  teacher. `setStatus` and `close` are updates to `status`, `question_index`
  and `ended_at`.
- **Answering, changed after Master's ruling:** a student's insert must carry
  `correct = false` and `points = 0`, or send neither and let the defaults
  apply. Sending anything else fails the policy and the insert is rejected.
  This matches `GeoLiveCloud.answer(sessionId, playerId, index, choice, ms)`
  as the spec already has it, which takes no score.
- The host marks answers afterwards: update `correct` and `points` on the
  answer row, and the running total on `live_players.score` and `.streak`.
  Students cannot write those either; `live_players` has a teacher-only
  update policy.
- Consequence worth designing for: marking only happens while the host's
  screen is open. If the teacher closes the tab mid-game, answers stay
  unmarked until they come back. Standings are computed from marked rows.
- Final standings at the end of a game (`saveStandings`) are an update to
  `live_players.score` and `.streak` by the host. Students cannot write
  either; same rule as `correct` and `points`, applied at the end instead of
  per answer.

### The two switches (round 3)

`classes.geolive_enabled` and `classes.leaderboard_enabled`, both
`boolean not null default true`.

**On the classes table, not a new one**, because the rules a class already
carries are exactly the rules these need: `classes` is readable by the teacher
and by everyone in the class, and writable only by the teacher. So no new
policy exists to get wrong, and the client already loads the class row, so
reading a switch costs no extra call.

**Defaults differ on purpose: GeoLive on, leaderboard off** (Owen's decision,
after oy-07 and I independently recommended the split). GeoLive is inert until
a teacher runs a game, so on costs nobody anything and off would hide it. The
leaderboard is not inert: it publishes a ranking of children to their class,
and switching that on for every existing class in an update nobody read means
a teacher finds out when a student asks why they are last. A teacher who wants
it turns it on, having decided to.

The original blanket reasoning, kept because it still applies to GeoLive: Neither feature exists yet: the
GeoLive tables are not in the database and no class has ever used either
feature, so nothing that works today can stop working, whichever way the
default goes. That leaves a straight choice between a feature that appears
when the code ships and one that stays invisible until a teacher finds a
setting nobody told them about. The second is how a working feature gets
reported as broken. A teacher who does not want either turns it off in one
click, and the switch is per class, so one teacher's choice does not reach
another's room.

The judgement worth revisiting: an all-time ranking of children, visible to
their classmates, is on unless a teacher turns it off. That is the product
Owen asked for and the teacher holds the switch, but if anyone wants the
opposite default, it is one word in this file and it should be changed before
the first class uses it, not after.

**What "off" actually enforces, and what it does not.** Be precise here,
because a tester is checking exactly this:

- GeoLive off is enforced in the database. The insert policy on
  `live_sessions` requires the class's `geolive_enabled`, so no new game can
  be created however the client behaves, and `live_join` refuses with "Live
  quizzes are switched off for this class" however someone came by the code.
- A game already running is deliberately left readable and answerable. Flipping
  the switch mid-lesson stops the next game, not the question thirty students
  are halfway through.
- The leaderboard switch is a display switch and the schema cannot make it
  more than that. The numbers behind it are rows in `results` and
  `live_players` that a student is already allowed to read for their own
  grades screen; revoking that to hide a ranking would break the grades
  screen. So "no network call when off" is oy-07's to honour in the client.
  Saying otherwise would be claiming an enforcement that is not there.

### level and xp, so the leaderboard can rank on level (round 3)

`class_members.level` and `class_members.xp`, **both nullable with no
default**.

**Empty means nobody has synced yet, and that is load-bearing.** With a default
of 1, a student who had never synced was indistinguishable from a student
genuinely on level 1, so applying this file would have shown Level 1 for
everyone and quietly demoted every student who had earned more, before a line
of new code shipped. Null says "not told yet", which lets the leaderboard fall
back to whatever it derived. oy-02 caught this; the alternative was oy-07
treating `level <= 1` as unsynced, which is a guess where a null is a fact.

For oy-07: `level is null` means never synced, so use your own derived figure.
Do not treat 1 as a sentinel; a real level 1 exists.
For oy-03: `sync_level` writes null if you pass null, so an unknown number
stays unknown rather than becoming 1.

**On class_members, not profiles, and the reason is access rather than
tidiness.** Level is global to a student, so `profiles` looks like its natural
home, but a teacher cannot read a student's profile row: the only policy on
`profiles` is read-your-own. Opening it to teachers would hand them the whole
`save` blob, everything the student owns, to expose one integer.
`class_members` is already readable by exactly the right people, the student
and that class's teacher, so nothing widens. The cost is that a student in two
classes carries the number twice, which is a fair price.

**Written through `sync_level(p_level, p_xp)`**, a security definer function
that updates the caller's rows in every class they are in and returns how many
rows it touched. Not an update policy on `class_members`, for two reasons: a
policy would also let a client rewrite `display_name`, and a row could be
pointed at a different `class_id`, which is a way into a class you were never
in. The function touches the two mirror columns and nothing else, and clamps
its input rather than rejecting it, so a bad sync lands as a wrong number the
next sync corrects instead of erroring mid-lesson.

Nothing in the schema ranks on these, constrains them against `results`, or
computes them. They mirror the student's own number and the student's device
remains the source of truth, which also means they are as trustworthy as the
save blob is, and no more.

### joined_at now means arrived, not invited (round 3)

`live_players.joined_at` is nullable with no default. A teacher picking names
in the lobby writes rows with it empty; `live_join` fills it in. So
`arrived = joined_at is not null`, and the lobby can honestly say who is in
the room.

Rejoining does not restamp it: the upsert keeps the first arrival with
`coalesce`, because a phone waking up is not a person arriving twice.

For a database that already ran the earlier version of this file, the guarded
alters drop the default and the not-null, so it changes behaviour there too
rather than only for a fresh install.

### live_now(), the clock every countdown is measured against

`select live_now()` returns the server's time as a timestamptz. Granted to
`authenticated`, revoked from `public` and `anon`, same as `live_join`. It
reads nothing and writes nothing, so it is not security definer.

A phone's own clock cannot run a countdown: a device 90 seconds out reads
about 104 seconds left on a 20 second question. The offset can usually be
worked out from a timestamp the server already stamped, but a student's first
question of the game has none yet, and the HTTP Date header cannot be read
across origins. So there has to be something to ask.

Uses `clock_timestamp()` rather than `now()`, because `now()` is the time the
transaction began and the point here is the instant. In JavaScript,
`Date.parse` handles the returned string; it carries a timezone.

### answered and correct, for the leaderboard

Counts on `live_players`, both default 0, written by the host in the same
update as `score` and `streak` under the existing teacher policy. No new
policy, and students still cannot write them.

Watch the name: `live_answers.correct` is true or false for one answer, while
`live_players.correct` is a running total. Same word, different shape.

I did **not** add a `correct <= answered` constraint, and that is deliberate.
It would catch an accuracy over 100%, but it would do so by making the write
fail, which during a live lesson means the teacher's screen breaks in front
of the class over a cosmetic wrong number. The two are always written
together in one update, so the ordering problem cannot arise; oy-07 should
still clamp when displaying, since a bad number should show as a wrong number
and never as a stopped game.

### asked_at, for the countdown

`asked_at` is when the current question opened, so a student joining or
reconnecting mid-question can be told how much time is left:
`time_limit_ms - (now - asked_at)`.

**The database stamps it, not the teacher's screen.** A trigger sets it
whenever a session moves into `asking` or advances `question_index` while
asking. oy-03 does not need to send it, and sending one is harmless because
the database's own time wins on the move into a question.

Two reasons it works this way. Every countdown in the room is then measured
against one clock, the database's, rather than against whatever time the
teacher's laptop believes it is. And it cannot be forgotten: if `setStatus`
ever advances the question without resending the field, students would
otherwise see a confident countdown left over from the previous question,
which is worse than the no-countdown fallback oy-05 has now.

Clients still have their own clock to reckon with when they compare `now`
against `asked_at`. Reading the server's time once and keeping the offset is
the usual fix, and it is oy-03's call, not something the schema can settle.

### Unique constraints, and their exact names for ON CONFLICT

- `live_players_session_student_key` on `(session_id, student_id)`
- `live_answers_session_player_question_key` on `(session_id, player_id, question_index)`

Both are plain unique indexes, so either can be named directly as an
`on conflict` target. The first one replaced a partial index
(`where student_id is not null`), which behaved identically but could not be
named without repeating its WHERE clause, so an ordinary upsert would have
errored at runtime. Multiple teacher-added players with no `student_id` are
still allowed, because Postgres counts NULLs as distinct.

`live_join` uses the first one itself: it is a single insert with
`on conflict ... do update set name`, so two devices joining at the same
instant cannot collide.

## Status

Status: complete as a file, **not applied anywhere, and never executed**.
There is no Postgres on this machine and no offline SQL parser, so nothing
here has been machine-checked; it has been read carefully and checked against
the live schema, which is not the same thing. The single transaction is the
mitigation: if any statement is wrong, the whole file undoes itself and Owen
sees an error instead of a half-built feature. If a tester has a scratch
database, running it there is worth more than another read-through, and I
would rather that happened before Owen pastes it.

Original note: **not applied anywhere**. I ran no migration
and touched no database. Owen pastes it into the Supabase SQL editor when the
round lands. Until then GeoLive has no tables, so `GeoLiveCloud.available()`
must return false and every other call must resolve empty. That is the
fail-soft rule in the spec and it matters more than usual here.

## Deviations from the spec, flagged

1. **Added a function, `live_join(code, name)`.** The spec says a student may
   only read the session they joined. Taken literally that makes joining
   impossible: you cannot look a game up by its code if you cannot read it
   until you are in it. So joining goes through one security-definer function,
   the same pattern the live database already uses for `join_class`. Students
   have no insert policy on `live_players`.
2. **Added `time_limit_ms` to a session** (default 20000). The spec's speed
   bonus is "scaled by how much of the time limit was left", but the spec
   never says where the time limit lives. Both screens need the same number,
   so it belongs on the session.
3. **Students can read the other players in their own game.** Strictly, the
   spec says a student reads only the session they joined. Standings are the
   point of the game, so the read is scoped to co-players in that one session.
4. **Students cannot score themselves** (settled by Master, tightened here).
   A student writes only what they tapped and how long they took: the insert
   policy rejects any row that does not arrive with `correct = false` and
   `points = 0`, and students have no update policy, so neither column can
   ever change by their hand. The host marks the row afterwards through
   "geolive: host marks answers", using the one scoring implementation in
   geolive.js. Scoring was deliberately not reimplemented in SQL, so the rules
   live in one file with one owner.

   How it is expressed, since it is not obvious: row level security cannot
   restrict columns. Column privileges can, but they are granted per role and
   the host is `authenticated` exactly like the class is, so they cannot tell
   the two apart. Checking the values on the way in achieves the same thing
   here, because the only values a student may write are the two defaults.

## Do not overwrite

GeoLive:

- **The three tables must be in the `supabase_realtime` publication.** The
  file adds them. That publication is currently **empty**, so nothing in this
  project has ever received a live update. Without it `GeoLiveCloud.watch()`
  silently never fires and the whole feature looks broken with no error.
- The unique index on `(player_id, question_index)` is what makes "first
  answer wins" true even if a phone double-taps. Do not drop it and do not
  turn the insert into an upsert.
- The insert policy on `live_answers` requires the session to be `asking`
  **and** the answer's `question_index` to match the session's. So the
  teacher's screen must set the status and index before students can answer.
  This is deliberate: it stops answers arriving for a question that is not on
  screen.
- The same insert policy requires `correct = false` and `points = 0`, and
  there is no student update policy on `live_answers` or `live_players`.
  Those two facts together are the whole reason a student cannot give
  themselves points. Loosening either one, or adding a student update policy
  for convenience, hands the leaderboard back to whoever tries hardest.
- The whole file is wrapped in one transaction, so a failure leaves nothing
  behind. Keep it that way: the person running it is not going to read SQL.
- `asked_at` is stamped by the `live_sessions_asked` trigger. If someone
  removes the trigger and lets clients set the field instead, every countdown
  in the room starts depending on one laptop's clock being right, and a
  missed field shows a stale countdown rather than none.

Passkeys, from round 1, still true:

- The relying party is **www.learngeo.app**, set on the Supabase project. Passkey
  sign-in only works on that exact domain, never on localhost, a preview URL,
  or learngeo.app without the www. It cannot be fixed in code, and changing it
  in Supabase invalidates every passkey already created.
- supabase-js returns passkey failures in `res.error` rather than throwing.
  Both paths are handled on purpose in passkey.js.

## One thing someone should know

`supabase/deployed/0001_announcements.sql` has never been applied: there is no
`announcements` table in the live database, though the folder's README lists
one. Anything written against `announcements` today will fail. Not mine to
fix, but whoever owns the Stream should know.

## Round 4: GeoLive was completely broken, and the fix

`supabase/deployed/0003_geolive_rls_recursion.sql`. Do not edit 0002; it is
applied. 0003 is a correction on top and only rewrites policies.

**The bug was mine.** The SELECT policy I wrote on `live_players` asked a
question about `live_players`, so evaluating the policy evaluated the policy.
Postgres refuses with `42P17: infinite recursion detected in policy for
relation "live_players"`. `live_sessions` and `live_answers` had it too by
another route: their policies read `live_players`, whose policy read them
back. Every GeoLive path was dead: opening, joining, reading, answering,
scoring. That is why `live_sessions` has never held a row.

**The fix, narrowed after Master measured it:** only the two SELECT policies
that were actually recursive are rewritten, `live_players` and
`live_sessions`, each calling a `security definer` function in `private`
instead of querying a `live_` table. Those functions look without going
through policies, so nothing can loop. Two of them: `is_in_session` and
`is_session_teacher`. Same pattern as `is_class_teacher` and
`is_class_member`, which never had the problem.

**The four `live_answers` policies are deliberately untouched.** They were
never wrong, only unreachable: their subqueries entered the two recursive
policies and died there. Once those two are sound the answer policies work
unchanged, which Master measured and I then reproduced myself with only this
file applied. My first draft rewrote all twelve; narrower is better for a
production fix, and it keeps the anti-cheat insert rule exactly as it was
rather than restating it.

**Residual coupling worth knowing.** Because the answer policies still read
`live_players` and `live_sessions` through RLS, the invariant "no policy reads
a live_ table" is not established repo-wide, only for the two rewritten. If
anyone ever adds a policy on `live_players` or `live_sessions` that reads
`live_answers`, the loop comes back by a new route. The rule to hold is: a
policy on a live_ table must not read a live_ table. Put the question in
`private` as a security definer function instead.

**Why every earlier check missed it, and this is the part worth keeping.**
Everything we ran was structural: tables exist, twelve policies present,
functions defined, three tables in the publication, the whole file executes
against a copy without error. All true. Not one of them ever asked the
database to *evaluate* a policy, and a policy that parses is not a policy that
runs. The first evaluation in the feature's life was a teacher clicking a
button in front of a class.

Master's rolled-back execution test was worth doing and could not have caught
this either, because the file applies perfectly. The recursion only exists at
query time, as a particular user.

**How this one was tested,** as the real teacher and the real students against
the live database, inside transactions rolled back afterwards (verified: zero
rows in all three tables, no helper functions left, the old policy still in
place):

- teacher opens a game: works, was `42P17` before
- teacher reads players and sessions: works, was `42P17` before
- student joins by code, sees the game and the players: works
- `joined_at` distinguishes seated from arrived; `asked_at` stamped by trigger
- student answers; student cannot score themselves (blocked, 42501); student
  updating their own mark changes 0 rows; teacher marks 1
- a class member who has not joined sees 0 sessions, 0 players, 0 answers
- teacher seats a roster name (`joined_at` null), student cannot insert a
  player row (blocked), student deletes nothing, teacher deletes its own

Re-tested after narrowing to two policies, all eighteen checks passing with
only this file applied: teacher opens a room and seats a player; student joins
by code and reads the game and both players; student answers unscored; a
student submitting an already-scored answer is refused (42501); a class member
who has not joined sees 0 sessions, 0 players, 0 answers; teacher reads and
scores the answer; student rescoring their own changes 0 rows; student
deleting a seat changes 0 rows; teacher removes the seat and deletes the game.
Verified afterwards that nothing persisted.

**If you touch these policies again:** never let a policy on a `live_` table
query a `live_` table, directly or through a view. Put the question in
`private` as a `security definer` function. And test by evaluating as a real
user, not by listing what exists.

## The comment on the session policy overstates what it does

Found by Master while verifying 0003, and it is a real mismatch in my file.

My comment says "a student who has not joined cannot read the game". The code
does not do that. `is_in_session` tests for a `live_players` row, and
`seatRoster` writes a row for every invited student when the room opens, with
`joined_at` null. So every invited student can read the session row, and the
session row carries `questions`, which include the answers.

**Why it did not hold the fix, checked rather than accepted.** I read the two
files rather than trusting the summary:

- `assets/js/cloud-geolive.js:370` reads the session with `select('*')`, the
  whole row including `questions`, on every poll, for every player.
- `assets/js/geolive-student.js:578` and `:732` decide right and wrong on the
  device from `q.answer`.

So a joined student has always had every remaining answer on their device.
That is architectural and predates 0002. An invited student reading the row
early is the same data slightly sooner, not a new capability, and the feature
was completely dead. Shipping was right.

**The follow-up is safe to make.** Gating `is_in_session` on
`joined_at is not null` will not break joining, because the join path never
reads the session: `cloud-geolive.js` joins only through the `live_join`
function, and oy-03's own comment at that call says so. Either make that
change or delete the sentence from the comment; do not leave the file
claiming a protection it does not provide.

**One consequence to know before that change, or before the leaderboard moves.**
`ClassLeaderboard` is mounted only in `teacher.js` today, and a teacher can
read every session in their class, so `totals()` works. On a student's screen
it would not: a student can only read sessions they were in, so an all-time
class table rendered from a student device would show only that student's own
games. That is true today and is not caused by 0003, but it will look like a
broken leaderboard the day it is put on the student screen. It needs a
class-scoped read policy for ended sessions, which is a deliberate change.

**The bigger one, for Owen not for a hotfix:** the client is trusted with the
answers. Anyone who opens devtools mid-game can read every remaining question.
Fixing it means the session stops shipping answers to students and the reveal
delivers them another way. That is a design decision with a cost, and it
should be decided rather than smuggled in.

## 0004: marking answers given with god mode on

`supabase/deployed/0004_geolive_assisted.sql`, 109 lines, one transaction,
re-runnable. Two columns and one trigger. No policy is touched.

- `live_answers.assisted` and `live_players.assisted`, both
  `not null default false`, so the eleven answers already recorded read as
  not assisted, which is what they were.
- `private.flag_assisted()` carries the marker from an answer up to its
  player row.

**Why the marker is on the answer, not the player:** god mode can be switched
on part way through a game, so a flag set at join would miss a student who
turns it on at question four.

**Why the trigger is security definer:** a student may write their own answer
but has no write access to `live_players` at all, and that is exactly what
stops anyone editing their own score. The marker still has to reach the player
row, so the database carries it there under its own privileges rather than a
policy being relaxed to let a client do it. It cannot be pointed at someone
else: the insert policy already forces the answer's player row to be the
caller's own.

**One deviation from the shape Master tested, flagged and kept:** their trigger
fires `after insert` only. Mine fires `after insert or update of assisted`,
with a `when (new.assisted)` guard so a normal answer never runs it. A teacher
can update an answer, so the marker becoming true by that route should reach
the player row too. My test's step 3 exercises exactly that and would have
passed silently as a gap in the insert-only version.

**Tested against the live database, as the teacher and both students, rolled
back, with the real data checked afterwards** (11 answers still present, none
marked assisted, 2 sessions, 3 players, no columns, function or trigger left
behind, rollback honoured by a probe first):

    1 normal answer omitting the column -> false
    2 player not flagged yet            -> false
    3 UPDATE path flags the player      -> true
    4 INSERT path flags the player      -> true
    5 student clears own player flag    -> 0 rows
    6 student clears own answer flag    -> 0 rows
    7 later clean answer does not clear -> true, no laundering
    8 student scoring themselves        -> still refused 42501
    9 real answers marked assisted      -> 0
   10 real answers still present        -> 11

**The honest limit, also written in the file:** this records the app's own god
mode being used. Someone editing the JavaScript can decline to send the
marker. It catches what a student would actually reach for, not a forger.

## 0005: class tags (round 6) — WRITTEN AND TESTED, NOT APPLIED

`supabase/deployed/0005_class_tags.sql`. Run against the live database inside a
transaction that was rolled back on purpose. Nothing in it has run for real, and
I re-checked afterwards: no columns, constraints, triggers or functions left
behind, `profiles_touch` back on the shared `touch_updated_at`, the profiles
policy back to its original check, counts still 2 classes / 9 members / 20
profiles / 11 answers, the test rows and keys all gone.

This is the second version. Master made two rulings after oy-03 found that the
first one, though it enforced every rule correctly, produced a tag **nobody
could see**: `profiles` is readable only by its owner and `classes` only by that
class's teacher and members. Both rulings are in.

### What it adds

| Thing | Where | Notes |
| --- | --- | --- |
| `tag` | `classes` | text, nullable, exactly `^[A-Z]{4}$`, stored upper case |
| `tag_glyph` | `classes` | text, nullable, glyph NAME, `^[A-Za-z0-9_-]{1,40}$` |
| `tag_class_id` | `profiles` | uuid, nullable, FK `classes(id)` `on delete set null` — the student's own single source of truth |
| `tag_class_id` | `class_members` | the same value mirrored onto every roster the student is on. Nullable, no default. Written by the database only |
| `class_tag(p_class uuid)` | RPC | one class id in, `(id, tag, tag_glyph)` out |

**The glyph column is `tag_glyph`, not `tag_icon`.** The first brief said
`tag_icon` and my first draft used it, but oy-03's `TAG_COLS` and oy-05's
`worntag.js` are both already written against `tag_glyph`. Two built layers beat
one name. It is also 40 characters, not 32, because that is oy-03's own slice
length in `writeClassTag()`, and the case is left **exactly as sent** — my first
draft lower-cased it, which was an unrequested change to a vocabulary that
belongs to the files that draw the glyph.

### The five rules and where each one lives

1. **Only the teacher sets the tag.** Already true: `classes` UPDATE is
   teacher-only and the new columns inherit it. No new policy.
2. **A student may only wear the tag of a class they are in.** The `profiles`
   UPDATE policy's WITH CHECK, as specified — and the INSERT policy too, since a
   PostgREST upsert is an insert with a fallback and both policies get a say.
   `cloud.js push()` is an upsert, so without that it was half enforced.
3. **Leaving takes the tag off.** An `after delete` trigger on `class_members`.
   `on delete set null` only covers a *deleted class*; it does nothing for the
   common case of a student leaving or being removed.
4. **The worn tag is mirrored onto `class_members`** by the database, the way
   0004 carries `assisted` to `live_players`. The client never writes it and has
   no policy that would let it.
5. **The four letters resolve outside the class that issued them**, through one
   function that answers about one class id.

### Why rule 3 is the load-bearing one

A WITH CHECK is evaluated against the **whole new row on every update**, not
only the update that sets the tag. A student left wearing the tag of a class
they are no longer in fails that check on their *next save* — and their save is
their profile row. They would stop syncing altogether over four cosmetic
letters. The `class_members` trigger closes the path that causes it, and
`private.clear_stale_tag()` is the backstop: a stale tag comes off quietly on
the next write instead of locking anyone out. It only ever writes null, only
acts when the tag is *not* the value being changed (so wearing a tag you are not
entitled to still errors rather than silently no-opping), and only acts on the
signed-in student's own row.

### The one that would have cost people their progress

`cloud.js adopt()` picks between the cloud save and the device's cached save by
comparing `profiles.updated_at` against the `syncedAt` the device recorded, and
**there is no merge on that path — the loser is dropped.** `touch_updated_at`
bumps `updated_at` on every update, so *any* write to a tag column moves the
sync clock without changing the save, and a student with unpushed offline
progress loses it at the next sign-in. Choosing a tag would do it. My own
cleanup trigger would do it.

So a tag-only change now leaves the clock alone; everything else still bumps it,
including a save and a tag changed together. It is a **profiles-only copy** of
the touch function with `profiles_touch` repointed at it, because
`touch_updated_at` is shared with `assignments`, `announcements` and
`live_sessions` and a reference to `new.tag_class_id` inside it would fail at
runtime on all three — plpgsql resolves that field when the trigger fires, not
when it is written.

This also means the UI can write `tag_class_id` with a plain `.update()` and
nobody has to remember to refresh `W.state.meta.syncedAt`.

### The trap in the mirror

`profiles_tag_mirror` is deliberately **not** `after update of tag_class_id`.
That clause fires on the columns named in the UPDATE statement, not on what the
row ended up holding. A plain save that the self-heal trigger quietly cleaned
would not have fired it, and the roster would have kept pointing at a class the
student had left — a stale tag visible to the whole class, from the one path
designed to prevent stale tags. A `when (new.tag_class_id is distinct from
old.tag_class_id)` clause is read *after* the BEFORE triggers run, so it catches
it. Test T14b is that exact case.

### What `class_tag()` exposes, and why it is narrower than the ruling

The ruling allowed "any signed-in user may ask about any class id". I went
narrower, which the ruling invited: you get an answer only if **you could
already read that class**, or if **somebody you can actually see is wearing it**
— sharing a class being the whole of "see", which is exactly the set of people
whose names can turn up beside a tag on your screen, on a roster, a leaderboard
or in a live game. A tag worn into another class therefore resolves for that
class's students, which is the point of rule 5, and a class you have no contact
with stays four letters you cannot read.

It returns `id`, `tag` and `tag_glyph`. Never the name, the code, the teacher,
the roster or the feature switches. It is **not enumerable**: it answers about
one id you already hold, and nothing here lists classes. That is the property to
keep if anyone widens this.

A class you are in that has chosen no tag returns one row with `tag` null, so
oy-03's layer can tell "definitely none" from "could not tell".

### oy-03 has to change one line, and it is not optional

`readClassTag()` currently does `sb.from('classes').select('*').eq('id', id)`.
That can **never** return a travelling tag: for a class you are not in, the
policy returns no row and the layer correctly reports `absent`. Making that call
work would mean opening the whole `classes` row — code, teacher, switches — to
every signed-in user, which is exactly what ruling 5 said not to do. A view
cannot fix it either, because a view can be listed and enumerability is the one
thing that must not leak; only a function can demand an argument.

So the read becomes:

```js
sb.rpc('class_tag', { p_class: classId }).maybeSingle()
```

Everything else in that function still works, including the `'tag' in r` test
for 0005 not being applied — with one thing to check: a missing *function* comes
back as `PGRST202` / `42883`, not the missing-column code, so `missingBit()`
needs to count those as absent or an unapplied 0005 will read as `refused`.

### Deviations from the brief, all reversible

- **A teacher may wear their own class's tag.** A teacher is not in
  `class_members` of their own class, so without this the person who owns the
  tag is the only one who cannot wear it. The clause only admits a class you
  already own; one line in each policy.
- **Tags are not unique across classes.** Two classes may both pick `MATH`. Not
  asked for either way. Uniqueness turns four letters into a land grab and gives
  teachers a confusing failure. One partial unique index if Owen ever wants it.
- **A glyph with no tag is allowed.** It draws nothing, and forbidding it breaks
  a UI that saves the two fields in separate calls.
- **`class_tag()` is narrower than the ruling permitted**, as above.

### Test log — 24 checks, all as real uids, rolled back

Probe first: made a table, forced the error, confirmed it was gone.

```
B-member f2cba2aa (in the other class, not in class A)   stranger 56cd225a (in no class at all)
T1   teacher sets ' math '/'Globe' -> MATH/Globe, glyph case kept   PASS
T2   the OTHER teacher tags class A -> 0 rows                       PASS
T3   MATHS, M4TH, '<img src=x>', 41-char glyph -> all 23514         PASS
     40-char glyph accepted; emptied box -> null not ''             PASS
T4   member wears it -> profile set AND roster mirrored             PASS
T5   NON-MEMBER wears it -> refused 42501                           PASS
T6   teacher wears own class tag -> allowed (the deviation)         PASS
T7   save bumps the clock; tag-only change does not     REDONE, see below
T8   cloud.js upsert while wearing a tag -> allowed                 PASS
T9   joins a second class -> tag carried onto that roster too       PASS
T10  TRAVELLING: a member of class B resolves class A's MATH        PASS
T11  a stranger sharing no class -> 0 rows                          PASS
T12  own class with no tag -> 1 row, tag null (known, none)         PASS
T13  removed from A -> profile null, other roster null, clock still PASS
T14  save with a stale tag forced on -> not locked out              PASS
T14b the self-heal reached the mirror as well                       PASS
T15  class deleted -> wearer's tag null                             PASS
T16  outsider reading that profile row -> still 0                   PASS
```

T15 used a throwaway class created inside the transaction, so no real class was
ever pointed at a delete.

**To apply:** run the file as it stands, it is idempotent. The one thing to know
is that it repoints `profiles_touch` at a profiles-only function; the shared
`touch_updated_at` stays where it is for the other three tables.

### The clock check, redone: the first one could not fail

Master caught this and it applies to my own test as well. `now()` is fixed for
an entire transaction, so once the first bump inside my test had set
`updated_at` to the transaction timestamp, a later update that *did* bump would
land on the identical value. T7b as I first wrote it compared two timestamps
that would have been equal either way. It passed, but it could not have failed,
which makes it worth nothing.

Redone properly by parking the clock in 1999 first, with `profiles_touch`
disabled for the parking write only — with the trigger live it overwrites the
parked value, which is the second way to get a meaningless answer here:

```
0  parked at            1999
A  tag only             1999    frozen  PASS
B  save + tag together  2026    bumps   PASS
C  save only            2026    bumps   PASS
```

So the fix does what it claims: a tag-only change leaves the save clock alone,
and anything touching the save still moves it. Rolled back, and re-checked that
`profiles_touch` is enabled and back on the shared `touch_updated_at`, that the
student's real clock still reads 2026-09-26 rather than 1999, and that no test
keys survived.

**The lesson, again, and it is the same one as the RLS recursion:** a check that
cannot fail is not a check. Structural ones ("the column is there", "the two
values match") pass on a broken build just as happily as on a working one. Both
times the real answer needed the thing driven under conditions where a wrong
result would have been visible.
