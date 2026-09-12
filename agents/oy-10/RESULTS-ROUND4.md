# Round 4, oy-10: the RLS evaluation harness, and why every check passed

All measurements 2026-09-12 against the live LearnGeo database
(`envecwhnnktltfoypekk`). Timestamped, per the standing rule.

**Read-only unless stated.** The only write this round was a scratch table
created and rolled back to prove rollback works. Nothing was written to any
`live_` table, `classes`, or any real data.

## Confirmed independently: GeoLive is dead for every signed-in user

```
42P17: infinite recursion detected in policy for relation "live_players"
```

Reproduced on a plain `SELECT count(*) FROM live_players` as an authenticated
uid. No write involved. A basic read is enough.

## The role matrix, which is the whole point

| role | live_sessions | live_players | live_answers |
| --- | --- | --- | --- |
| `anon` | EVALUATED OK, 0 rows | EVALUATED OK, 0 rows | EVALUATED OK, 0 rows |
| `authenticated` | **FAILED 42P17** | **FAILED 42P17** | **FAILED 42P17** |

All three tables are dead for every signed-in user. All three look perfectly
healthy to `anon`.

**This is the explanation of my own false green, and I want it recorded as
mine.** Last round I tested RLS as an anonymous visitor, measured refusals and
empty reads, and reported "anonymous is properly locked out". That was true. It
was also worthless as evidence about this feature, because **`anon` holds zero
policies on the `live_` tables**, so an anonymous run can never evaluate the
recursive policy. My test passed on a completely dead feature. Same shape as the
12-policy count: I asked whether access was refused, never whether a policy
could run.

## The cause: one policy, one line

`live_players` SELECT, *"geolive: game reads players"*:

```sql
(student_id = auth.uid())
OR EXISTS (SELECT 1 FROM live_sessions s
           WHERE s.id = live_players.session_id
             AND (private.is_class_teacher(s.class_id)
                  OR EXISTS (SELECT 1 FROM live_players me      -- <-- HERE
                             WHERE me.session_id = s.id
                               AND me.student_id = auth.uid())))
```

The `me` subquery reads `live_players` from inside `live_players`' own SELECT
policy. Reading the table evaluates the policy, which reads the table. There is
no guard and no base case, so it is unconditional, not edge-case.

**Answering the question about `live_answers` directly: it does NOT have the
same defect.** Only `live_players` self-references. Everything else is
collateral, because it reads `live_players`:

- `live_sessions` SELECT reads `live_players` for the "or a player in it" arm.
- `live_answers` SELECT reads `live_players` for the "own answer" arm.
- `live_answers` INSERT reads `live_players` in its `WITH CHECK`.
- `live_players` INSERT reads `live_sessions`, whose SELECT reads
  `live_players`.

So **one fix in one policy should unblock all three tables.** Verify that rather
than assume it: re-run the matrix and expect six `EVALUATED OK`.

## The fix pattern is already in this schema

`private.is_class_teacher(cid uuid)` is `SECURITY DEFINER` with
`search_path=""`, which is exactly why the teacher arm does not recurse. The
same schema already ships `private.is_class_member(cid uuid)` on the same
pattern.

So the remedy is the house style, not an invention: add
`private.is_session_player(p_session uuid)` as `SECURITY DEFINER`,
`search_path=""`, and replace the inline `me` subquery with a call to it. A
definer function reads the table without re-entering the caller's policy, which
breaks the cycle.

One thing to re-check afterwards: `public.live_now()` is **`SECURITY INVOKER`**
(`prosecdef = false`), so it evaluates policies as its caller and will recurse
for an authenticated user today. It should come right once the policy is fixed,
but it is worth one call as a signed-in user rather than assuming.

## The harness: agents/oy-10/tools/rls-harness.sql

Three steps, documented in the file.

**Step 0, the rollback probe.** `begin; create table; insert; rollback;` then
check the table is gone. **Measured: rollback IS honoured** on this tool, so
write tests are safe. Never skip this: if rollback were ignored, step 2 would
write to the real database.

**Step 1, the read matrix.** Read-only, safe on production as-is. Per-table
exception handling, so one recursive policy does not mask the others. Runs both
roles, because an anon-only run is the trap described above.

**Step 2, the write paths**, commented out pending real ids. It drives teacher
opens, teacher seats a player, teacher reads back, student reads own session,
student posts a legal answer, and then the one that **must fail**: a student
inserting `correct = true, points = 1000` for themselves. An `OK` on that last
one is a security hole, not a pass.

Step 2 needs a real `classes.id` and two real uids, and that is a genuine
limitation rather than an oversight: `live_sessions.class_id` is a foreign key,
so a fabricated uuid dies on `23503` **before any policy is consulted**. I hit
that this round, and a `23503` reads like a refusal while proving nothing about
RLS. Anyone running step 2 must use ids that exist or the results are
meaningless.

## What I will check on 0003, before Owen runs it

1. Re-run the read matrix: all six cells `EVALUATED OK`.
2. No policy on any `live_` table references its own table; the replacement
   helper is `SECURITY DEFINER` with a pinned `search_path`.
3. Step 2 end to end: teacher can open, teacher can seat, student can read the
   session they joined, student can post a legal answer.
4. The refusals still refuse: a student cannot set their own `correct`/`points`,
   cannot read a session they did not join, and cannot open a session in a class
   with `geolive_enabled = false`.
5. `live_now()` called as an authenticated user.

Not "does it parse". Whether a policy can run, and whether the answers it gives
are the right ones.

---

# Attacking the candidate fix. A one-sided fix is NOT enough.

Measured 2026-09-12 against the live database. Rollback probed **before** the
run, not after. Cleanliness audited afterwards: `live_sessions`,
`live_players`, `live_answers` all 0 rows, no helper functions left behind, the
original recursive policy still in place, `classes` 1 and `class_members` 2
unchanged. Production untouched.

## The finding: the mutual cycle survives a live_players-only fix

I built the proposed shape as a hypothesis: one `SECURITY DEFINER` helper
`private.is_session_player()`, replacing the self-referential `me` subquery in
`live_players`' SELECT policy. Eleven steps passed. Then:

```
42P17: infinite recursion detected in policy for relation "live_sessions"
CONTEXT: update public.live_sessions set status='ended' ...
```

**Removing the self-reference in `live_players` does not break the cycle,
because the cycle is mutual:**

- `live_sessions` SELECT policy reads `live_players` (the "or a player in it" arm)
- `live_players` SELECT policy reads `live_sessions` (to find the class/teacher)

Each side is individually reasonable. Together they re-enter each other. The
definer helper only stops `live_players` reading *itself*; it does nothing about
`live_players` reading `live_sessions` which reads `live_players`.

**Why twelve green steps missed it.** The earlier 12-step run ended with
"teacher scores the answer", which is an UPDATE on `live_answers`. It never
issued an UPDATE on `live_sessions`. Advancing to the next question and ending
the game are both `UPDATE live_sessions`, and they are the two most common
operations in a live quiz. The first thing a teacher does after opening a room
is advance it.

## The shape that does work: one definer helper per side

Both policies must stop reading a policy-protected table at all:

```sql
private.is_session_player(p_session uuid)   -- SECURITY DEFINER, search_path=''
  -> exists(select 1 from live_players where session_id=p_session and student_id=auth.uid())

private.can_see_session(p_session uuid)     -- SECURITY DEFINER, search_path=''
  -> exists(select 1 from live_sessions s where s.id=p_session
            and (private.is_class_teacher(s.class_id)
                 or exists(select 1 from live_players p
                           where p.session_id=s.id and p.student_id=auth.uid())))

live_players  SELECT USING  student_id = auth.uid() OR private.can_see_session(session_id)
live_sessions SELECT USING  private.is_class_teacher(class_id) OR private.is_session_player(id)
```

With that in place all 16 cases below passed.

## The 16 cases, including the five that were missing

| # | kind | case | result |
| --- | --- | --- | --- |
| 1 | control | teacher opens room | ok |
| 2 | control | seat A (arrived) | ok |
| 3 | control | seat B, `joined_at` NULL | ok |
| 4 | control | teacher reads players | 2 |
| 5 | control | **teacher advances question** | ok (this killed hypothesis 1) |
| 6 | control | A reads own session | 1 |
| 7 | control | A posts legal answer | ok |
| 8 | must-refuse | A self-awards `correct`+1000 | refused 42501 |
| 9 | must-refuse | A opens a session | refused 42501 |
| 10 | isolation | B reads A's answers | 0 |
| 11 | isolation | B (`joined_at` NULL) reads session | 1 |
| 12 | isolation | signed-out reads session | 0 |
| 13 | control | teacher ends the game | ok |
| 14 | control | teacher scores the answer | ok |
| 15 | behaviour | A reads session after it ended | 1 |
| 16 | must-refuse | A answers after game ended | refused 42501 |

## The design rule that makes this suite trustworthy

A test that fails for the wrong reason is indistinguishable from a finding. Two
rules, both learned the hard way on this project:

**Every must-refuse case is paired with a positive control on the same path.**
Case 8 (A self-awards 1000 points, refused) is only meaningful because case 7
(A posts a legal answer, ok) succeeded immediately before it, through the same
policy, as the same uid. Without that pairing, a refusal caused by a broken
setup reads exactly like working anti-cheat. This is the specific trap that
nearly produced a phantom "second bug" when a test inserted
`correct=true, points=900` and read the resulting 42501 as a defect rather than
as the policy doing its job.

**Record the SQLSTATE, never just "refused".** On this schema 42501 is an RLS
decision, 23503 is a foreign key, 23502 is a NOT NULL, and 42P17 is the
recursion. They all look like failure and mean completely different things. A
fabricated `class_id` dies on 23503 *before any policy is consulted*, which is
a refusal that proves nothing about security.

## Two behaviours to decide on, not bugs

**Case 11: a student seated but never arrived (`joined_at` NULL) can read the
session.** Defensible, since they need to see the room to join it, and it is
how the invite works. But it means "seated" and "present" are the same thing to
RLS, which is the same gap noted in the lobby.

**Case 15: a player can still read the session after it ended.** Almost
certainly wanted, since the podium and the results need it. Recorded so it is a
decision rather than an accident.

## Still not verified

oy-01's real 0003 does not exist yet. Everything above tests a hypothesis I
built, which is not a migration. When 0003 lands, the five checks at the end of
the previous section apply, plus the one this round added: **issue an UPDATE on
`live_sessions` as the teacher.** A fix can pass every read and still deadlock
the moment a teacher clicks next.
