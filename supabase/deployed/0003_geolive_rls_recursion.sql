/* ------------------------------------------------------------------
   LearnGeo — fix: GeoLive could not run at all.

   WHAT THIS FILE DOES, in plain words:

     GeoLive was completely broken. Opening a game, joining one,
     answering, scoring: all of it failed. This fixes it by rewriting
     two of the rules that decide who can see what. It creates no
     tables, deletes nothing, and touches no data of any kind.

     Run it like the last one: Supabase dashboard, SQL Editor, paste,
     Run. Safe to run twice. If anything goes wrong the whole file
     undoes itself and GeoLive is exactly as broken as before, which is
     to say no worse.

   WHAT WENT WRONG:

     The rule for who may see the players in a game asked a question
     about the players in a game. So checking the rule ran the rule,
     which ran the rule. Postgres refuses:

       42P17: infinite recursion detected in policy for relation
       "live_players"

     The rule for who may see a game had the mirror image of the same
     problem: it read the players table, whose rule read the games
     table back.

     Every check anyone ran before this was structural: do the tables
     exist, are the policies present, does the file apply. All of them
     passed, and none of them ever asked the database to USE a rule. A
     policy that parses is not a policy that runs. The first thing to
     actually evaluate one was a teacher clicking a button in front of
     a class.

   THE FIX:

     Two small functions in the private schema, and the two broken
     rules rewritten to call them.

     They are "security definer", and that word is the entire fix: it
     means the function looks at the table directly, without going
     through the rules again. That is what stops the loop. It is the
     same trick as is_class_teacher and is_class_member, which have
     worked since the classroom was built.

     Everything else is deliberately left alone. The four rules on the
     answers table were never wrong; they were only unreachable,
     because they lean on the two rules below. They come back to life
     on their own, which was measured rather than assumed.
-------------------------------------------------------------------*/

begin;

/* ==================== the two questions to ask ==================== */

/* Am I one of the players in this game?

   SECURITY DEFINER is load-bearing, not decoration. Without it this
   query would be filtered by the very policy that calls it, and asking
   the question would ask the question. With it, the lookup happens
   underneath the rules and returns a plain yes or no. It is STABLE so
   it can be called once per row rather than repeatedly, and its
   search_path is pinned empty so nothing can be resolved to another
   schema. It answers only about the caller: it takes no user id and
   will not tell you about anybody else. */
create or replace function private.is_in_session(p_session uuid)
returns boolean language sql stable security definer set search_path = '' as $fn$
  select exists (
    select 1 from public.live_players p
    where p.session_id = p_session
      and p.student_id = (select auth.uid())
  );
$fn$;

/* Do I teach the class this game belongs to?

   Same reasoning. This one exists so the players rule never has to read
   the games table, which is the other half of how the loop formed. */
create or replace function private.is_session_teacher(p_session uuid)
returns boolean language sql stable security definer set search_path = '' as $fn$
  select exists (
    select 1
    from public.live_sessions s
    join public.classes c on c.id = s.class_id
    where s.id = p_session
      and c.teacher_id = (select auth.uid())
  );
$fn$;

revoke all on function private.is_in_session(uuid)      from public;
revoke all on function private.is_session_teacher(uuid) from public;
grant execute on function private.is_in_session(uuid)      to authenticated;
grant execute on function private.is_session_teacher(uuid) to authenticated;

/* ======================== the two rules =========================== */
/* Who may see what is unchanged. Only the way the question is asked
   changes, so neither rule reads a live_ table any more. */

drop policy if exists "geolive: game reads players" on public.live_players;

/* Yourself, the teacher running the game, or anyone else playing in it,
   which is what the standings are. */
create policy "geolive: game reads players" on public.live_players
  for select to authenticated
  using (
    student_id = (select auth.uid())
    or private.is_session_teacher(session_id)
    or private.is_in_session(session_id)
  );

drop policy if exists "geolive: teacher or player reads session" on public.live_sessions;

/* The teacher of the class, and the people playing. A student who has
   not joined cannot read the game, which is what keeps the questions
   out of reach until they are asked. */
create policy "geolive: teacher or player reads session" on public.live_sessions
  for select to authenticated
  using (
    private.is_class_teacher(class_id)
    or private.is_in_session(id)
  );

commit;

/* If you see ERROR above, nothing changed. Send the message on. If you
   see COMMIT or Success, the teacher can open a game.

   One thing deliberately not changed, so nobody "fixes" it later: the
   rule that lets a student write an answer still insists the answer
   arrives unscored, correct false and points zero. A student records
   what they tapped; only the teacher's screen marks it. A test that
   submits a scored answer is supposed to be refused. */
