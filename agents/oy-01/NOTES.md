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
