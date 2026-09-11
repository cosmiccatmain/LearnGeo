# LearnGeo classroom backend

Everything the LearnGeo classroom needs on the server side. The app
itself is a zero-build static site and stays that way — nothing here
is compiled into it.

Solo study never touches this database. XP, diamonds, mastery,
streaks and cosmetics stay in `localStorage`, so a signed-out visitor
gets the whole trainer and loses nothing.

## What to apply, in order

| File | Contains |
|---|---|
| `migrations/0001_classroom_core.sql` | Six tables, their indexes and two triggers |
| `migrations/0002_functions.sql` | Authorisation helpers and the six RPCs the client calls |
| `migrations/0003_rls.sql` | Row level security on every table |
| `migrations/0004_realtime.sql` | Publishes two tables for the live dashboard |

Order matters: 0003 references helpers defined in 0002, and 0002
references tables defined in 0001.

Via the CLI:

```bash
supabase link --project-ref <ref> && supabase db push
```

Or paste each file into the SQL editor in sequence.

## Edge Functions

Three, because each one needs the service role key, which can never
live in a static site.

| Function | Called by | Does |
|---|---|---|
| `join-request` | A student with no account | Previews a class, or creates the account and opens a pending seat |
| `approve-enrollment` | The teacher | Lets a student in and sets their password |
| `reset-student-password` | The teacher | Sets a new password for a student who forgot theirs |

```bash
supabase functions deploy join-request approve-enrollment reset-student-password
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`
are injected automatically. Nothing else needs setting.

`join-request` is deliberately callable without a JWT, since the
student has no session yet. It is gated by requiring a valid open
class code. The other two read the caller's identity from the bearer
token and verify class ownership before touching anything.

## Dashboard settings

Under Authentication:

- **Site URL** — the Vercel production URL.
- **Redirect URLs** — add `http://localhost:8765` and `http://localhost:8765/**` so password recovery works against the dev server.
- **Email confirmations — off.** A confirmation wall makes a forty-minute lesson impossible, and the real gate is the class code plus teacher approval. The cost is that addresses are unverified and self-serve password reset only works for a real inbox, which is why the teacher can reset a student's password.

Then send back the project URL and the publishable key
(`sb_publishable_…`). Those two values go in `assets/js/config.js` on
the client side. The secret key must never leave the dashboard.

## How the model works

**Authorisation never keys off a role.** Every teacher-side policy
keys off `classes.owner_id = auth.uid()`. `profiles.role` only decides
which tabs someone sees. Anyone can create a class, and will only ever
see their own — which is the right amount of power for an unverified
claim, and closes the old hole where a button on the landing page made
you a teacher.

**Four seat states.** `class_members.status` is `invited` (a name the
teacher typed, no account behind it), `pending` (asked to join,
waiting), `joined` (approved, the only state that grants any read
access), or `removed`.

**Passwords.** A student joining a class signs up with a school email
and no password; the teacher sets it on approval. `provisioned` marks
the seats where this system created the account, and it is the only
thing that lets a teacher set or reset that password. Without it,
anyone could type a colleague's address into a join form and have
their own teacher account seize it.

**Scores are derived server-side.** `submit_assignment` takes the
answers and computes the counts itself, and students have no INSERT
policy on `submissions` at all. That removes the forged-percentage
hole the old share codes had. It does **not** stop a determined
student from posting `correct: true` for every answer — grading still
happens in the browser, and fixing that would need server-side
question generation. Worth saying out loud rather than overclaiming.

## Checking it worked

Run the security advisor first and expect zero findings. It catches
exactly the two failure modes here: a table with RLS left off, and a
`SECURITY DEFINER` function with a mutable `search_path`.

Then prove the isolation by hand. With two throwaway users, A owning a
class and B in no class:

```sql
set local role authenticated;
set local request.jwt.claims to '{"role":"authenticated","sub":"<user-B-uuid>"}';

select count(*) from public.classes;      -- 0
select count(*) from public.submissions;  -- 0
select public.class_preview('<A-code>');  -- the class name and its open seats
```

B seeing anything but zero on the first two means a policy is wrong.
The third should still work: a valid code is how a student finds a
class to ask to join.
