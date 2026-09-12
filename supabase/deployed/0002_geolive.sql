/* ------------------------------------------------------------------
   LearnGeo — GeoLive, the live class quiz.

   WHAT THIS FILE DOES, in plain words:

     It adds three new tables to the database, all named with a live_
     prefix, and two small helpers: one for when a student types a join
     code, one that answers "what time is it" so every countdown in the
     room agrees.

     It also adds two on/off switches to your existing classes table,
     one for the live quiz and one for the leaderboard, so a teacher can
     turn either off for their class. The live quiz starts on, the
     leaderboard starts off.

     And it adds two columns to your existing class_members table, so a
     teacher can see the level and XP of the students in their class,
     which is what the leaderboard ranks on. Those four columns are the
     only changes to anything that already exists, and no existing row,
     class, score or answer is read, moved or altered. Your profiles, classes, assignments, results, arcade
     scores and admin pins are not touched, read, or moved.

       live_sessions  one row per game a teacher runs
       live_players   one row per person playing in that game
       live_answers   one row per answer tapped in

     Students can write down what they tapped, but they cannot mark
     their own answer right, give themselves points, or set their own
     score or totals. Only the teacher running the game can do that.

     It is safe to run twice. Every statement checks first, so running
     it again on a database that already has these tables does nothing
     and loses nothing.

     Where to run it: the Supabase dashboard, SQL Editor, paste and
     Run. Nothing else needs doing afterwards.

   Written against the live schema (classes with teacher_id, and the
   two helpers in the private schema), not against ../migrations,
   which was never applied. See ../README.md.
-------------------------------------------------------------------*/

/* Everything below runs as one piece. If any single statement fails,
   Postgres undoes the whole file and your database is left exactly as
   it was. There is no half-applied state to clean up. */
begin;

/* ========================= the two switches ======================= */
/* On the classes table rather than in a new one, because the rules that
   already guard a class are exactly the rules these need: a teacher may
   change their own class, and everyone in the class may read it. Nothing
   new to grant, nothing new to get wrong, and the client already loads
   the class row so reading them costs no extra call.

   They default differently, and the difference is the point.

   The live quiz starts ON. Nothing happens until a teacher runs a game,
   so an unused switch costs nobody anything, while starting it off means
   the feature is invisible until a teacher finds a setting they were
   never told about, which is how a working feature gets reported broken.

   The leaderboard starts OFF. It is not inert: it publishes a ranking of
   children to their classmates. Turning that on for every class that
   already exists, in an update whose notes nobody read, means a teacher
   finds out about it when a student asks why they are last. A teacher who
   wants it turns it on, having decided to, which is the right way round
   for a thing that ranks children by name. */
alter table public.classes
  add column if not exists geolive_enabled boolean not null default true;
alter table public.classes
  add column if not exists leaderboard_enabled boolean not null default false;

comment on column public.classes.geolive_enabled is
  'Teacher switch: can this class run live quizzes.';
comment on column public.classes.leaderboard_enabled is
  'Teacher switch: does this class show the all-time leaderboard. Off by default.';

/* ==================== the level a teacher can see =================
   The leaderboard ranks on level, and until now no level existed
   anywhere a teacher could read: a student's level lives inside their
   own save, which only they can read, by design.

   These two columns are a mirror of that number, kept next to the
   membership rather than on the profile. profiles would be the natural
   home for something global to a student, but a teacher cannot read a
   student's profile row today, and opening it up would hand the teacher
   the whole save blob to expose one integer. class_members is already
   readable by exactly the right people: the student, and the teacher of
   that class. The cost is that a student in two classes has the number
   twice, which is a fair price for not widening access to everything
   else they own.

   The student's own device stays the source of truth. Nothing here
   computes, checks or ranks on these; they are written on sync.

   Both are empty until a device actually syncs, and that is the whole
   point of them being empty rather than starting at level 1. A student
   who has never synced and a student genuinely on level 1 would
   otherwise look identical, so the leaderboard would read "1" for
   everybody the moment this file was applied and quietly demote every
   student who had earned more. Empty says "nobody has told us yet",
   which is a fact rather than a guess, and the reader can fall back to
   whatever it worked out for itself. */
alter table public.class_members
  add column if not exists level integer check (level between 1 and 1000);
alter table public.class_members
  add column if not exists xp integer check (xp >= 0);

comment on column public.class_members.level is
  'Mirror of the student''s level, written on sync so the class leaderboard can rank on it.';
comment on column public.class_members.xp is
  'Mirror of the student''s XP, for breaking ties within a level. Null until synced.';

/* These two started out as "not null default 1" and "not null default 0" in an
   earlier version of this file. For a database that already ran that version:
   stop filling them in, so a row nobody has synced stops claiming to be level
   one. Existing rows keep whatever they hold; this changes what happens next,
   not what already happened. */
alter table public.class_members alter column level drop default;
alter table public.class_members alter column level drop not null;
alter table public.class_members alter column xp    drop default;
alter table public.class_members alter column xp    drop not null;

/* ============================== tables ============================ */

/* One game. The teacher owns it, the class it belongs to decides who
   may see it, and the questions travel with it so a student's device
   never has to be told what the quiz is in advance. */
create table if not exists public.live_sessions (
  id             uuid primary key default gen_random_uuid(),
  class_id       uuid not null references public.classes(id) on delete cascade,
  host_id        uuid not null references public.profiles(id) on delete cascade,
  code           text not null check (code ~ '^[A-Z0-9]{4,10}$'),
  status         text not null default 'lobby'
                   check (status in ('lobby', 'asking', 'reveal', 'ended')),
  questions      jsonb not null default '[]'::jsonb
                   check (jsonb_typeof(questions) = 'array'
                          and octet_length(questions::text) < 200000),
  question_index integer not null default 0 check (question_index >= 0),
  time_limit_ms  integer not null default 20000
                   check (time_limit_ms between 1000 and 300000),
  /* when the current question opened, so a student who joins or reconnects
     mid-question can be told how much time is actually left */
  asked_at       timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  ended_at       timestamptz
);

/* A join code only has to be unique among games still running, so the
   same six characters can come round again next lesson. */
create unique index if not exists live_sessions_active_code_idx
  on public.live_sessions (code) where status <> 'ended';

create index if not exists live_sessions_class_idx
  on public.live_sessions (class_id, created_at desc);

/* Added after the first version of this file, so a database that already
   has the table gains the column rather than missing it. */
alter table public.live_sessions add column if not exists asked_at timestamptz;

/* One player in one game. student_id is who they are signed in as, and
   is left empty for a player the teacher adds by hand. */
create table if not exists public.live_players (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  student_id uuid references public.profiles(id) on delete set null,
  name       text not null check (char_length(name) between 1 and 40),
  score      integer not null default 0 check (score >= 0 and score <= 1000000),
  streak     integer not null default 0 check (streak >= 0),
  /* how many questions this player answered, and how many they got right,
     so the class leaderboard can show accuracy for someone who only ever
     plays live games. Counts, not flags: live_answers.correct is a
     true/false for one answer, live_players.correct is a total. */
  answered   integer not null default 0 check (answered >= 0),
  correct    integer not null default 0 check (correct >= 0),
  /* Empty until the person actually turns up. A teacher picking names in
     the lobby writes rows with this left empty, and live_join fills it
     in, so "is this player in the room" is joined_at is not null rather
     than a guess. It used to be stamped when the row was made, which
     made invited and arrived look identical. */
  joined_at  timestamptz
);

/* Nobody joins the same game twice. A phone that sleeps, wakes and rejoins
   comes back as the same player rather than a second one, which in a
   classroom is the normal case and not the edge case.

   This is a plain unique index, not a partial one, on purpose: a partial
   index can only be named as an ON CONFLICT target by repeating its WHERE
   clause, so an ordinary upsert on (session_id, student_id) would fail to
   find it and error at runtime. Behaviour is the same either way, because
   Postgres already counts NULLs as distinct, so the teacher can still add
   several players by hand with no student_id. */
drop index if exists public.live_players_session_student_idx;
create unique index if not exists live_players_session_student_key
  on public.live_players (session_id, student_id);

create index if not exists live_players_session_idx
  on public.live_players (session_id, score desc);

/* Added after the first version of this file, so a database that already has
   the table gains these rather than missing them. */
alter table public.live_players add column if not exists answered integer not null default 0;
alter table public.live_players add column if not exists correct  integer not null default 0;

/* joined_at was "not null default now()" in the first version of this file.
   For a database that already ran it: stop stamping it on the way in, so an
   invited player and an arrived one stop looking the same. */
alter table public.live_players alter column joined_at drop default;
alter table public.live_players alter column joined_at drop not null;

/* One tap. */
create table if not exists public.live_answers (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references public.live_sessions(id) on delete cascade,
  player_id      uuid not null references public.live_players(id) on delete cascade,
  question_index integer not null check (question_index >= 0),
  choice         text not null check (char_length(choice) between 1 and 120),
  correct        boolean not null default false,
  points         integer not null default 0 check (points >= 0 and points <= 1000),
  ms             integer not null default 0 check (ms >= 0 and ms <= 3600000),
  created_at     timestamptz not null default now()
);

/* Answering twice on the same question keeps the first answer: the second
   one cannot be written at all. A retried tap, a double tap, or a phone
   that reconnects and sends again all hit this and stop here.

   On (session_id, player_id, question_index) as oy-03 asked, so it can be
   named directly as an ON CONFLICT target. The narrower (player_id,
   question_index) it replaces was equivalent in practice, since a player
   belongs to exactly one game, but it could not be named that way. */
drop index if exists public.live_answers_player_question_idx;
create unique index if not exists live_answers_session_player_question_key
  on public.live_answers (session_id, player_id, question_index);

create index if not exists live_answers_session_idx
  on public.live_answers (session_id, question_index);

drop trigger if exists live_sessions_touch on public.live_sessions;
create trigger live_sessions_touch before update on public.live_sessions
  for each row execute function private.touch_updated_at();

/* asked_at is stamped here rather than sent by the teacher's screen, for
   two reasons. Every countdown in the room is then measured against one
   clock, the database's, instead of against whatever time the teacher's
   laptop believes it is. And it cannot be forgotten: moving to the next
   question restamps it even if the screen sends nothing, so a student can
   never be shown a confident countdown left over from the previous
   question. Sending a value is allowed and harmless; on the move into a
   question the database's own time wins. */
create or replace function private.stamp_asked_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status = 'asking'
     and (tg_op = 'INSERT'
          or old.status is distinct from 'asking'
          or old.question_index is distinct from new.question_index) then
    new.asked_at := now();
  end if;
  return new;
end $$;

drop trigger if exists live_sessions_asked on public.live_sessions;
create trigger live_sessions_asked before insert or update on public.live_sessions
  for each row execute function private.stamp_asked_at();

/* ============================ who sees what ======================= */

alter table public.live_sessions enable row level security;
alter table public.live_players  enable row level security;
alter table public.live_answers  enable row level security;

drop policy if exists "geolive: teacher or player reads session" on public.live_sessions;
drop policy if exists "geolive: teacher opens session"           on public.live_sessions;
drop policy if exists "geolive: teacher runs session"            on public.live_sessions;
drop policy if exists "geolive: teacher deletes session"         on public.live_sessions;

/* The teacher of the class, and anyone actually playing. A student who
   has not joined cannot read the game, which is what keeps the
   questions and answers out of reach until they are asked. */
create policy "geolive: teacher or player reads session" on public.live_sessions
  for select to authenticated
  using (
    private.is_class_teacher(class_id)
    or exists (
      select 1 from public.live_players p
      where p.session_id = live_sessions.id
        and p.student_id = (select auth.uid())
    )
  );

/* Off is enforced here, not only in the app: with the switch off, no new
   game can be created for this class at all, whatever the client does.
   A game already running is deliberately left alone, so flipping the
   switch mid-lesson does not strand a room full of students halfway
   through a question. */
create policy "geolive: teacher opens session" on public.live_sessions
  for insert to authenticated
  with check (
    private.is_class_teacher(class_id)
    and host_id = (select auth.uid())
    and exists (select 1 from public.classes c
                where c.id = class_id and c.geolive_enabled)
  );

/* Moving from lobby to asking to reveal to ended is the teacher driving
   the game from the front of the room. */
create policy "geolive: teacher runs session" on public.live_sessions
  for update to authenticated
  using (private.is_class_teacher(class_id))
  with check (private.is_class_teacher(class_id));

create policy "geolive: teacher deletes session" on public.live_sessions
  for delete to authenticated
  using (private.is_class_teacher(class_id));

drop policy if exists "geolive: game reads players"      on public.live_players;
drop policy if exists "geolive: teacher adds player"     on public.live_players;
drop policy if exists "geolive: teacher edits player"    on public.live_players;
drop policy if exists "geolive: teacher removes player"  on public.live_players;

/* Everyone in the game can see the other players, because that is what
   the standings are. It stays inside the one game. */
create policy "geolive: game reads players" on public.live_players
  for select to authenticated
  using (
    student_id = (select auth.uid())
    or exists (
      select 1 from public.live_sessions s
      where s.id = live_players.session_id
        and (
          private.is_class_teacher(s.class_id)
          or exists (
            select 1 from public.live_players me
            where me.session_id = s.id and me.student_id = (select auth.uid())
          )
        )
    )
  );

/* Students join through live_join() below, not by inserting directly. */
create policy "geolive: teacher adds player" on public.live_players
  for insert to authenticated
  with check (
    exists (select 1 from public.live_sessions s
            where s.id = session_id and private.is_class_teacher(s.class_id))
  );

/* Scores are written by the teacher's screen as the game runs. */
create policy "geolive: teacher edits player" on public.live_players
  for update to authenticated
  using (
    exists (select 1 from public.live_sessions s
            where s.id = session_id and private.is_class_teacher(s.class_id))
  )
  with check (
    exists (select 1 from public.live_sessions s
            where s.id = session_id and private.is_class_teacher(s.class_id))
  );

create policy "geolive: teacher removes player" on public.live_players
  for delete to authenticated
  using (
    exists (select 1 from public.live_sessions s
            where s.id = session_id and private.is_class_teacher(s.class_id))
  );

drop policy if exists "geolive: own answer or teacher reads" on public.live_answers;
drop policy if exists "geolive: player answers"              on public.live_answers;
drop policy if exists "geolive: host marks answers"          on public.live_answers;
drop policy if exists "geolive: teacher clears answers"      on public.live_answers;

/* A student sees their own answers. The teacher sees the room's, which
   is where the count under each option comes from. */
create policy "geolive: own answer or teacher reads" on public.live_answers
  for select to authenticated
  using (
    exists (select 1 from public.live_players p
            where p.id = player_id and p.student_id = (select auth.uid()))
    or exists (select 1 from public.live_sessions s
               where s.id = session_id and private.is_class_teacher(s.class_id))
  );

/* You may write an answer as yourself, in a game you joined, only while
   the question is actually open, and you may only write what you tapped
   and how long you took.

   Students do not score themselves. A row a student writes has to arrive
   unmarked: correct false, points zero. The host's screen marks it
   afterwards with the update policy below, using the one scoring
   implementation in geolive.js. There is no way for a student to write
   any other value, because a row that says otherwise fails this check.

   Note on how this is expressed: row level security cannot say "these
   columns only". Column privileges could, but they are granted per role
   and the host is 'authenticated' the same as the class is, so they
   cannot tell the two apart. Checking the values on the way in does the
   same job here, because the only values a student is allowed to write
   are the two defaults. */
create policy "geolive: player answers" on public.live_answers
  for insert to authenticated
  with check (
    correct = false
    and points = 0
    and exists (
      select 1
      from public.live_players p
      join public.live_sessions s on s.id = p.session_id
      where p.id = player_id
        and p.session_id = live_answers.session_id
        and p.student_id = (select auth.uid())
        and s.status = 'asking'
        and s.question_index = live_answers.question_index
    )
  );

/* Marking. Only the teacher who owns the class may set correct and
   points, and students have no update policy at all, so this is the
   only route by which either column can ever change. */
create policy "geolive: host marks answers" on public.live_answers
  for update to authenticated
  using (
    exists (select 1 from public.live_sessions s
            where s.id = session_id and private.is_class_teacher(s.class_id))
  )
  with check (
    exists (select 1 from public.live_sessions s
            where s.id = session_id and private.is_class_teacher(s.class_id))
  );

create policy "geolive: teacher clears answers" on public.live_answers
  for delete to authenticated
  using (
    exists (select 1 from public.live_sessions s
            where s.id = session_id and private.is_class_teacher(s.class_id))
  );

/* ======================== joining with a code ===================== */
/* A student cannot look a game up by its code, because reading a game
   is limited to the people already in it. So joining goes through this
   one function, the same way joining a class goes through join_class.
   It checks the code, checks they are in the class, and puts them in
   the game. Rejoining from a second device returns the same player
   rather than a duplicate. */
create or replace function public.live_join(p_code text, p_name text)
returns json language plpgsql security definer set search_path = '' as $$
declare
  v_uid     uuid := auth.uid();
  v_name    text := left(btrim(coalesce(p_name, '')), 40);
  v_session public.live_sessions;
  v_player  public.live_players;
begin
  if v_uid is null then
    raise exception 'Sign in first' using errcode = '28000';
  end if;
  if v_name = '' then
    raise exception 'Your name is needed' using errcode = '22023';
  end if;

  select * into v_session
  from public.live_sessions s
  where s.code = upper(btrim(coalesce(p_code, '')))
    and s.status <> 'ended'
  order by s.created_at desc
  limit 1;

  if not found then
    raise exception 'No game has that code' using errcode = 'P0002';
  end if;
  if not (private.is_class_member(v_session.class_id)
          or private.is_class_teacher(v_session.class_id)) then
    raise exception 'That game belongs to another class' using errcode = '42501';
  end if;
  /* the switch again, so nobody can join a game in a class that has live
     quizzes turned off, however they got hold of the code */
  if not exists (select 1 from public.classes c
                 where c.id = v_session.class_id and c.geolive_enabled) then
    raise exception 'Live quizzes are switched off for this class' using errcode = '42501';
  end if;

  /* One statement, so two devices joining at the same instant cannot both
     pass a "do they exist yet" check and then collide. Rejoining updates
     the name and returns the player they already are. */
  insert into public.live_players as p (session_id, student_id, name, joined_at)
  values (v_session.id, v_uid, v_name, now())
  on conflict (session_id, student_id) do update
    set name = excluded.name,
        /* first arrival stands: rejoining after a phone sleeps is not
           arriving again */
        joined_at = coalesce(p.joined_at, excluded.joined_at)
  returning * into v_player;

  return json_build_object(
    'sessionId', v_session.id,
    'playerId',  v_player.id,
    'code',      v_session.code,
    'status',    v_session.status
  );
end $$;

revoke all on function public.live_join(text, text) from public, anon;
grant execute on function public.live_join(text, text) to authenticated;

/* ===================== keeping the mirror fresh =================== */
/* A student updates their own level in every class they are in, with one
   call. It is a function rather than an update policy on class_members
   for two reasons: an update policy would also let a client rewrite
   display_name, and worse, a row could be pointed at a different class,
   which is a way into a class you were never in. This touches the two
   mirror columns and nothing else.

   The values are clamped rather than rejected. A sync arriving with
   nonsense should not error in the middle of a lesson; it should land as
   a wrong number that the next sync corrects. */
create or replace function public.sync_level(p_level integer, p_xp integer)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := auth.uid();
  v_rows integer;
begin
  if v_uid is null then
    raise exception 'Sign in first' using errcode = '28000';
  end if;

  /* A sync that does not know the number leaves it unknown. Writing 1 here
     would be the same lie the default used to tell. */
  update public.class_members m
     set level = case when p_level is null then null
                      else greatest(1, least(1000, p_level)) end,
         xp    = case when p_xp is null then null
                      else greatest(0, least(100000000, p_xp)) end
   where m.student_id = v_uid;

  get diagnostics v_rows = row_count;
  return v_rows;
end $$;

revoke all on function public.sync_level(integer, integer) from public, anon;
grant execute on function public.sync_level(integer, integer) to authenticated;

/* ========================= what time is it ======================== */
/* A phone's own clock cannot be trusted to run a countdown. A device 90
   seconds out will happily show a minute and a half left on a twenty
   second question. Every countdown is therefore measured against this
   clock, the same one that stamps asked_at.

   The app can usually work the offset out from a timestamp the server
   has already stamped, but a student's first question of the game has
   none yet, and the HTTP Date header cannot be read across origins. So
   there has to be something to ask. This is it: it reads nothing, it
   writes nothing, it just answers.

   clock_timestamp() rather than now(), because now() is the time the
   transaction began, and the point here is the instant. */
create or replace function public.live_now()
returns timestamptz language sql set search_path = '' as $$
  select clock_timestamp();
$$;

revoke all on function public.live_now() from public, anon;
grant execute on function public.live_now() to authenticated;

/* ===================== live updates for the room ================== */
/* Without this, a student's screen would have to keep asking the
   server whether anything changed. Adding the tables to the realtime
   publication is what lets the server push instead. */
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime'
                     and schemaname = 'public' and tablename = 'live_sessions') then
      alter publication supabase_realtime add table public.live_sessions;
    end if;
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime'
                     and schemaname = 'public' and tablename = 'live_players') then
      alter publication supabase_realtime add table public.live_players;
    end if;
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime'
                     and schemaname = 'public' and tablename = 'live_answers') then
      alter publication supabase_realtime add table public.live_answers;
    end if;
  end if;
end $$;

/* Done. Three tables, one join function, nothing else changed. */

commit;

/* If you see ERROR above, nothing was created. Send the message to the
   person who gave you this file. If you see COMMIT or Success, GeoLive
   has what it needs. */
