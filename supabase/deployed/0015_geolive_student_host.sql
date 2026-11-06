/* ------------------------------------------------------------------
   LearnGeo — GeoLive: students and explorers can host rounds.

   WHAT THIS FILE DOES:

     Teachers are no longer the only people who can open and run a
     GeoLive room. A signed-in class member can host a round for their
     class (still gated by the teacher's geolive_enabled switch). A
     signed-in explorer can host a friend round with no class at all:
     anyone with the join code can play.

     Teachers keep school-safe classroom control: turning Live quiz off
     for a class still blocks new class-tied rooms, and a teacher of
     the class can still run, score, and close any room in that class.

   Safe to run twice. Creates no tables beyond altering class_id nullability.
-------------------------------------------------------------------*/

begin;

/* Friend / explorer rounds have no class. Class rounds keep a class_id. */
alter table public.live_sessions
  alter column class_id drop not null;

/* ============================ helpers ============================= */

/* Am I the person who opened this room? */
create or replace function private.is_session_host(p_session uuid)
returns boolean language sql stable security definer set search_path = '' as $fn$
  select exists (
    select 1 from public.live_sessions s
    where s.id = p_session
      and s.host_id = (select auth.uid())
  );
$fn$;

/* May I drive this room (start, reveal, score, seat players)?
   Host always. Class teacher always, for classroom oversight. */
create or replace function private.can_run_session(p_session uuid)
returns boolean language sql stable security definer set search_path = '' as $fn$
  select exists (
    select 1 from public.live_sessions s
    where s.id = p_session
      and (
        s.host_id = (select auth.uid())
        or (s.class_id is not null and private.is_class_teacher(s.class_id))
      )
  );
$fn$;

revoke all on function private.is_session_host(uuid) from public;
revoke all on function private.can_run_session(uuid) from public;
grant execute on function private.is_session_host(uuid) to authenticated;
grant execute on function private.can_run_session(uuid) to authenticated;

/* ======================== live_sessions =========================== */

drop policy if exists "geolive: teacher or player reads session" on public.live_sessions;
drop policy if exists "geolive: teacher opens session"           on public.live_sessions;
drop policy if exists "geolive: host opens session"              on public.live_sessions;
drop policy if exists "geolive: teacher runs session"            on public.live_sessions;
drop policy if exists "geolive: host runs session"               on public.live_sessions;
drop policy if exists "geolive: teacher deletes session"         on public.live_sessions;
drop policy if exists "geolive: host deletes session"            on public.live_sessions;

/* Host needs to read their own lobby before anyone has joined. */
create policy "geolive: teacher or player reads session" on public.live_sessions
  for select to authenticated
  using (
    host_id = (select auth.uid())
    or (class_id is not null and private.is_class_teacher(class_id))
    or private.is_in_session(id)
  );

/* Class member or teacher may open a class room when Live quiz is on.
   Any signed-in user may open a friend room (class_id null). */
create policy "geolive: host opens session" on public.live_sessions
  for insert to authenticated
  with check (
    host_id = (select auth.uid())
    and (
      (
        class_id is not null
        and (
          private.is_class_teacher(class_id)
          or private.is_class_member(class_id)
        )
        and exists (
          select 1 from public.classes c
          where c.id = class_id and c.geolive_enabled
        )
      )
      or class_id is null
    )
  );

create policy "geolive: host runs session" on public.live_sessions
  for update to authenticated
  using (private.can_run_session(id))
  with check (private.can_run_session(id));

create policy "geolive: host deletes session" on public.live_sessions
  for delete to authenticated
  using (private.can_run_session(id));

/* ========================= live_players =========================== */

drop policy if exists "geolive: game reads players"     on public.live_players;
drop policy if exists "geolive: teacher adds player"    on public.live_players;
drop policy if exists "geolive: host adds player"       on public.live_players;
drop policy if exists "geolive: teacher edits player"   on public.live_players;
drop policy if exists "geolive: host edits player"      on public.live_players;
drop policy if exists "geolive: teacher removes player" on public.live_players;
drop policy if exists "geolive: host removes player"    on public.live_players;

create policy "geolive: game reads players" on public.live_players
  for select to authenticated
  using (
    student_id = (select auth.uid())
    or private.can_run_session(session_id)
    or private.is_in_session(session_id)
  );

create policy "geolive: host adds player" on public.live_players
  for insert to authenticated
  with check (private.can_run_session(session_id));

create policy "geolive: host edits player" on public.live_players
  for update to authenticated
  using (private.can_run_session(session_id))
  with check (private.can_run_session(session_id));

create policy "geolive: host removes player" on public.live_players
  for delete to authenticated
  using (private.can_run_session(session_id));

/* ========================= live_answers =========================== */

drop policy if exists "geolive: own answer or teacher reads" on public.live_answers;
drop policy if exists "geolive: host marks answers"          on public.live_answers;
drop policy if exists "geolive: teacher clears answers"      on public.live_answers;
drop policy if exists "geolive: host clears answers"         on public.live_answers;

create policy "geolive: own answer or teacher reads" on public.live_answers
  for select to authenticated
  using (
    exists (
      select 1 from public.live_players p
      where p.id = player_id and p.student_id = (select auth.uid())
    )
    or private.can_run_session(session_id)
  );

create policy "geolive: host marks answers" on public.live_answers
  for update to authenticated
  using (private.can_run_session(session_id))
  with check (private.can_run_session(session_id));

create policy "geolive: host clears answers" on public.live_answers
  for delete to authenticated
  using (private.can_run_session(session_id));

/* =========================== live_join ============================ */

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

  /* Friend rounds (no class): any signed-in player with the code may join.
     Class rounds: must be in that class, and Live quiz must still be on. */
  if v_session.class_id is null then
    null;
  else
    if not (private.is_class_member(v_session.class_id)
            or private.is_class_teacher(v_session.class_id)) then
      raise exception 'That game belongs to another class' using errcode = '42501';
    end if;
    if not exists (select 1 from public.classes c
                   where c.id = v_session.class_id and c.geolive_enabled) then
      raise exception 'Live quizzes are switched off for this class' using errcode = '42501';
    end if;
  end if;

  insert into public.live_players as p (session_id, student_id, name, joined_at)
  values (v_session.id, v_uid, v_name, now())
  on conflict (session_id, student_id) do update
    set name = excluded.name,
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

commit;
