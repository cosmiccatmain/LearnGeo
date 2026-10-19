/* ------------------------------------------------------------------
   LearnGeo — authoritative Geo Kart class races

   ADDITIVE ONLY. This file creates four kart_* tables and kart_* RPCs.
   It does not update or delete existing classroom, GeoLive, progress,
   result, admin or profile data. Run only after review in the Supabase
   SQL editor used by the live schema described in deployed/README.

   Authority boundary:
   - clients broadcast positions only for animation;
   - the database stamps starts and finish times;
   - kart_checkpoint accepts only the next ordered checkpoint;
   - kart_answer validates the hidden correct choice and awards boosts;
   - kart_use_boost is the only way a class client spends a charge.
-------------------------------------------------------------------*/
begin;

create table if not exists public.kart_sessions (
  id             uuid primary key default gen_random_uuid(),
  class_id       uuid not null references public.classes(id) on delete cascade,
  host_id        uuid not null references auth.users(id) on delete cascade,
  code           text not null check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  status         text not null default 'lobby'
                   check (status in ('lobby','countdown','racing','finished','cancelled')),
  settings       jsonb not null default '{}'::jsonb
                   check (jsonb_typeof(settings) = 'object'),
  starts_at      timestamptz,
  final_deadline timestamptz,
  created_at     timestamptz not null default now(),
  finished_at    timestamptz
);

create unique index if not exists kart_sessions_active_code_idx
  on public.kart_sessions (code) where status in ('lobby','countdown','racing');
create index if not exists kart_sessions_class_idx
  on public.kart_sessions (class_id, created_at desc);

create table if not exists public.kart_questions (
  session_id     uuid not null references public.kart_sessions(id) on delete cascade,
  position       integer not null check (position >= 0),
  prompt         text not null check (char_length(prompt) between 1 and 160),
  subject        text not null check (char_length(subject) between 1 and 160),
  choices        jsonb not null check (
                   jsonb_typeof(choices) = 'array'
                   and jsonb_array_length(choices) = 4
                   and octet_length(choices::text) < 2000
                 ),
  correct_choice integer not null check (correct_choice between 0 and 3),
  primary key (session_id, position)
);

create table if not exists public.kart_players (
  id                 uuid primary key default gen_random_uuid(),
  session_id         uuid not null references public.kart_sessions(id) on delete cascade,
  user_id            uuid not null references auth.users(id) on delete cascade,
  name               text not null check (char_length(name) between 1 and 40),
  ready              boolean not null default false,
  boost_charges      integer not null default 0 check (boost_charges between 0 and 3),
  question_index     integer not null default 0 check (question_index >= 0),
  answered           integer not null default 0 check (answered >= 0),
  correct            integer not null default 0 check (correct >= 0 and correct <= answered),
  checkpoint_no      integer not null default 0 check (checkpoint_no between 0 and 24),
  last_checkpoint_at timestamptz,
  finish_ms          integer check (finish_ms is null or finish_ms between 0 and 3600000),
  finished_at        timestamptz,
  joined_at          timestamptz not null default now(),
  last_seen          timestamptz not null default now(),
  unique (session_id, user_id)
);

create index if not exists kart_players_session_idx
  on public.kart_players (session_id, finish_ms, checkpoint_no desc);

create table if not exists public.kart_answers (
  session_id      uuid not null references public.kart_sessions(id) on delete cascade,
  player_id       uuid not null references public.kart_players(id) on delete cascade,
  question_index  integer not null check (question_index >= 0),
  choice          integer not null check (choice between 0 and 3),
  correct         boolean not null,
  answered_at     timestamptz not null default now(),
  primary key (session_id, player_id, question_index)
);

/* SECURITY DEFINER helpers keep policies from recursively selecting the
   same protected table, the failure fixed for GeoLive in 0003. */
create or replace function private.kart_in_session(p_session uuid)
returns boolean
language sql stable security definer set search_path = ''
as $fn$
  select exists (
    select 1 from public.kart_players p
    where p.session_id = p_session and p.user_id = (select auth.uid())
  );
$fn$;

create or replace function private.kart_session_teacher(p_session uuid)
returns boolean
language sql stable security definer set search_path = ''
as $fn$
  select exists (
    select 1
    from public.kart_sessions s
    where s.id = p_session and private.is_class_teacher(s.class_id)
  );
$fn$;

revoke all on function private.kart_in_session(uuid) from public;
revoke all on function private.kart_session_teacher(uuid) from public;
grant execute on function private.kart_in_session(uuid) to authenticated;
grant execute on function private.kart_session_teacher(uuid) to authenticated;

alter table public.kart_sessions  enable row level security;
alter table public.kart_questions enable row level security;
alter table public.kart_players   enable row level security;
alter table public.kart_answers   enable row level security;

drop policy if exists "geokart: participants read session" on public.kart_sessions;
create policy "geokart: participants read session" on public.kart_sessions
  for select to authenticated
  using (private.kart_session_teacher(id) or private.kart_in_session(id));

drop policy if exists "geokart: participants read players" on public.kart_players;
create policy "geokart: participants read players" on public.kart_players
  for select to authenticated
  using (private.kart_session_teacher(session_id) or private.kart_in_session(session_id));

/* There is deliberately no SELECT policy on kart_questions: a direct query
   must never reveal correct_choice before an answer. kart_state returns only
   prompt/subject/choices, and kart_answer reveals the correct index afterward. */
drop policy if exists "geokart: own answers" on public.kart_answers;
create policy "geokart: own answers" on public.kart_answers
  for select to authenticated
  using (
    exists (
      select 1 from public.kart_players p
      where p.id = player_id and p.user_id = (select auth.uid())
    )
    or private.kart_session_teacher(session_id)
  );

revoke all on public.kart_sessions, public.kart_questions,
  public.kart_players, public.kart_answers from anon;
revoke all on public.kart_questions from authenticated;
grant select on public.kart_sessions, public.kart_players, public.kart_answers to authenticated;

create or replace function public.kart_now()
returns timestamptz language sql stable set search_path = ''
as $fn$ select now(); $fn$;

create or replace function public.kart_open(
  p_class uuid,
  p_settings jsonb,
  p_questions jsonb
)
returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_session public.kart_sessions;
  v_code text;
  v_chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_try integer;
  v_item record;
  v_choice integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in first' using errcode = '28000';
  end if;
  if not private.is_class_teacher(p_class) then
    raise exception 'Only a teacher of this class can open a race' using errcode = '42501';
  end if;
  if p_questions is null or jsonb_typeof(p_questions) <> 'array'
     or jsonb_array_length(p_questions) < 8
     or jsonb_array_length(p_questions) > 200
     or octet_length(p_questions::text) > 250000 then
    raise exception 'A race needs 8 to 200 valid questions' using errcode = '22023';
  end if;
  if p_settings is null or jsonb_typeof(p_settings) <> 'object'
     or coalesce((p_settings ->> 'laps')::integer, 3) <> 3
     or coalesce(p_settings ->> 'circuit', 'atlas-ridge') <> 'atlas-ridge' then
    raise exception 'Unsupported race settings' using errcode = '22023';
  end if;

  for v_try in 1..12 loop
    select string_agg(substr(v_chars, 1 + floor(random() * length(v_chars))::integer, 1), '')
      into v_code from generate_series(1, 6);
    exit when not exists (
      select 1 from public.kart_sessions
      where code = v_code and status in ('lobby','countdown','racing')
    );
  end loop;

  insert into public.kart_sessions (class_id, host_id, code, settings)
  values (p_class, (select auth.uid()), v_code, p_settings)
  returning * into v_session;

  for v_item in
    select value, ordinality - 1 as position
    from jsonb_array_elements(p_questions) with ordinality
  loop
    if jsonb_typeof(v_item.value -> 'choices') <> 'array'
       or jsonb_array_length(v_item.value -> 'choices') <> 4 then
      raise exception 'Every question needs four choices' using errcode = '22023';
    end if;
    v_choice := (v_item.value ->> 'correctChoice')::integer;
    insert into public.kart_questions
      (session_id, position, prompt, subject, choices, correct_choice)
    values (
      v_session.id,
      v_item.position,
      left(coalesce(v_item.value ->> 'prompt', ''), 160),
      left(coalesce(v_item.value ->> 'subject', ''), 160),
      v_item.value -> 'choices',
      v_choice
    );
  end loop;

  return jsonb_build_object(
    'sessionId', v_session.id,
    'code', v_session.code,
    'status', v_session.status,
    'settings', v_session.settings
  );
end
$fn$;

create or replace function public.kart_join(p_code text, p_name text)
returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_session public.kart_sessions;
  v_player public.kart_players;
  v_name text := left(btrim(coalesce(p_name, '')), 40);
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in first' using errcode = '28000';
  end if;
  if v_name = '' then
    raise exception 'Your name is needed' using errcode = '22023';
  end if;

  select * into v_session
  from public.kart_sessions s
  where s.code = upper(btrim(coalesce(p_code, '')))
    and s.status in ('lobby','countdown','racing')
  order by s.created_at desc limit 1;
  if not found then
    raise exception 'No open race has that code' using errcode = 'P0002';
  end if;
  if not (private.is_class_member(v_session.class_id)
          or private.is_class_teacher(v_session.class_id)) then
    raise exception 'That race belongs to another class' using errcode = '42501';
  end if;

  insert into public.kart_players as p (session_id, user_id, name)
  values (v_session.id, (select auth.uid()), v_name)
  on conflict (session_id, user_id) do update
    set name = excluded.name, last_seen = now()
  returning * into v_player;

  return jsonb_build_object(
    'sessionId', v_session.id,
    'playerId', v_player.id,
    'code', v_session.code,
    'status', v_session.status
  );
end
$fn$;

create or replace function public.kart_find(p_class uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare v_session public.kart_sessions;
begin
  if not (private.is_class_member(p_class) or private.is_class_teacher(p_class)) then
    raise exception 'That class is not yours' using errcode = '42501';
  end if;
  select * into v_session from public.kart_sessions
  where class_id = p_class and status in ('lobby','countdown','racing')
  order by created_at desc limit 1;
  if not found then return null; end if;
  return jsonb_build_object(
    'sessionId', v_session.id, 'code', v_session.code, 'status', v_session.status
  );
end
$fn$;

create or replace function public.kart_ready(p_session uuid, p_ready boolean)
returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare v_player public.kart_players;
begin
  update public.kart_players
  set ready = coalesce(p_ready, true), last_seen = now()
  where session_id = p_session and user_id = (select auth.uid())
  returning * into v_player;
  if not found then
    raise exception 'Join the race first' using errcode = '42501';
  end if;
  if not exists (select 1 from public.kart_sessions where id = p_session and status = 'lobby') then
    raise exception 'The lobby is already closed' using errcode = '55000';
  end if;
  return jsonb_build_object('ready', v_player.ready);
end
$fn$;

create or replace function public.kart_start(p_session uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare v_session public.kart_sessions;
begin
  select * into v_session from public.kart_sessions where id = p_session for update;
  if not found or not private.is_class_teacher(v_session.class_id) then
    raise exception 'Only the class teacher can start this race' using errcode = '42501';
  end if;
  if v_session.status <> 'lobby' then
    raise exception 'This race has already started' using errcode = '55000';
  end if;
  if not exists (
    select 1 from public.kart_players where session_id = p_session and ready
  ) then
    raise exception 'At least one racer must be ready' using errcode = '55000';
  end if;

  update public.kart_sessions
  set status = 'countdown',
      starts_at = now() + interval '4 seconds',
      final_deadline = now() + interval '10 minutes 4 seconds'
  where id = p_session returning * into v_session;

  return jsonb_build_object(
    'status', v_session.status,
    'startsAt', v_session.starts_at,
    'finalDeadline', v_session.final_deadline
  );
end
$fn$;

create or replace function public.kart_cancel(p_session uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $fn$
declare v_class uuid;
begin
  select class_id into v_class from public.kart_sessions where id = p_session;
  if v_class is null or not private.is_class_teacher(v_class) then
    raise exception 'Only the class teacher can cancel this race' using errcode = '42501';
  end if;
  update public.kart_sessions
  set status = 'cancelled', finished_at = now()
  where id = p_session and status <> 'finished';
  return found;
end
$fn$;

create or replace function public.kart_state(p_session uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_session public.kart_sessions;
  v_player public.kart_players;
  v_question public.kart_questions;
  v_count integer;
  v_players jsonb;
begin
  select * into v_session from public.kart_sessions where id = p_session for update;
  if not found or not (
    private.is_class_teacher(v_session.class_id) or private.kart_in_session(p_session)
  ) then
    raise exception 'Race not found' using errcode = '42501';
  end if;

  if v_session.status = 'countdown' and v_session.starts_at <= now() then
    update public.kart_sessions set status = 'racing' where id = p_session
    returning * into v_session;
  end if;
  if v_session.status in ('countdown','racing')
     and v_session.final_deadline is not null
     and v_session.final_deadline <= now() then
    update public.kart_sessions set status = 'finished', finished_at = now()
    where id = p_session returning * into v_session;
  end if;

  update public.kart_players set last_seen = now()
  where session_id = p_session and user_id = (select auth.uid())
  returning * into v_player;

  select count(*) into v_count from public.kart_questions where session_id = p_session;
  if v_player.id is not null and v_count > 0 then
    select * into v_question from public.kart_questions
    where session_id = p_session and position = mod(v_player.question_index, v_count);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'userId', p.user_id,
    'name', p.name,
    'ready', p.ready,
    'boosts', p.boost_charges,
    'answered', p.answered,
    'correct', p.correct,
    'checkpoint', p.checkpoint_no,
    'finishMs', p.finish_ms,
    'connected', p.last_seen > now() - interval '15 seconds'
  ) order by p.finish_ms nulls last, p.checkpoint_no desc, p.joined_at), '[]'::jsonb)
  into v_players from public.kart_players p where p.session_id = p_session;

  return jsonb_build_object(
    'session', jsonb_build_object(
      'id', v_session.id, 'code', v_session.code, 'settings', v_session.settings,
      'startsAt', v_session.starts_at, 'finalDeadline', v_session.final_deadline
    ),
    'status', v_session.status,
    'settings', v_session.settings,
    'startsAt', v_session.starts_at,
    'finalDeadline', v_session.final_deadline,
    'players', v_players,
    'me', case when v_player.id is null then null else jsonb_build_object(
      'userId', v_player.user_id, 'boosts', v_player.boost_charges,
      'answered', v_player.answered, 'correct', v_player.correct,
      'checkpoint', v_player.checkpoint_no, 'finishMs', v_player.finish_ms
    ) end,
    'question', case when v_question.session_id is null then null else jsonb_build_object(
      'index', v_question.position,
      'prompt', v_question.prompt,
      'subject', v_question.subject,
      'choices', v_question.choices
    ) end
  );
end
$fn$;

create or replace function public.kart_answer(
  p_session uuid,
  p_question integer,
  p_choice integer
)
returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_session public.kart_sessions;
  v_player public.kart_players;
  v_question public.kart_questions;
  v_next public.kart_questions;
  v_count integer;
  v_right boolean;
begin
  select * into v_session from public.kart_sessions where id = p_session for update;
  if not found then raise exception 'Race not found' using errcode = 'P0002'; end if;
  if v_session.status = 'countdown' and v_session.starts_at <= now() then
    update public.kart_sessions set status = 'racing' where id = p_session
    returning * into v_session;
  end if;
  if v_session.status <> 'racing' or v_session.starts_at > now()
     or v_session.final_deadline <= now() then
    raise exception 'The race is not accepting answers' using errcode = '55000';
  end if;

  select * into v_player from public.kart_players
  where session_id = p_session and user_id = (select auth.uid()) for update;
  if not found then raise exception 'Join the race first' using errcode = '42501'; end if;
  if v_player.question_index <> p_question then
    raise exception 'That question is no longer active' using errcode = '55000';
  end if;
  select * into v_question from public.kart_questions
  where session_id = p_session and position = p_question;
  if not found or p_choice not between 0 and 3 then
    raise exception 'Invalid answer' using errcode = '22023';
  end if;

  v_right := p_choice = v_question.correct_choice;
  insert into public.kart_answers
    (session_id, player_id, question_index, choice, correct)
  values (p_session, v_player.id, p_question, p_choice, v_right);

  update public.kart_players
  set answered = answered + 1,
      correct = correct + case when v_right then 1 else 0 end,
      boost_charges = least(3, boost_charges + case when v_right then 1 else 0 end),
      question_index = question_index + 1,
      last_seen = now()
  where id = v_player.id returning * into v_player;

  select count(*) into v_count from public.kart_questions where session_id = p_session;
  select * into v_next from public.kart_questions
  where session_id = p_session and position = mod(v_player.question_index, v_count);

  return jsonb_build_object(
    'correct', v_right,
    'correctChoice', v_question.correct_choice,
    'boosts', v_player.boost_charges,
    'question', jsonb_build_object(
      'index', v_next.position, 'prompt', v_next.prompt,
      'subject', v_next.subject, 'choices', v_next.choices
    )
  );
exception
  when unique_violation then
    raise exception 'That question was already answered' using errcode = '23505';
end
$fn$;

create or replace function public.kart_use_boost(p_session uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare v_player public.kart_players;
begin
  if not exists (
    select 1 from public.kart_sessions
    where id = p_session and status = 'racing'
      and starts_at <= now() and final_deadline > now()
  ) then
    raise exception 'The race is not running' using errcode = '55000';
  end if;
  update public.kart_players
  set boost_charges = boost_charges - 1, last_seen = now()
  where session_id = p_session
    and user_id = (select auth.uid())
    and boost_charges > 0
  returning * into v_player;
  if not found then
    raise exception 'No boost charge is available' using errcode = '55000';
  end if;
  return jsonb_build_object('boosts', v_player.boost_charges);
end
$fn$;

create or replace function public.kart_checkpoint(p_session uuid, p_sequence integer)
returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_session public.kart_sessions;
  v_player public.kart_players;
begin
  select * into v_session from public.kart_sessions where id = p_session;
  if not found or v_session.status <> 'racing'
     or v_session.starts_at > now() or v_session.final_deadline <= now() then
    raise exception 'The race is not running' using errcode = '55000';
  end if;
  select * into v_player from public.kart_players
  where session_id = p_session and user_id = (select auth.uid()) for update;
  if not found then raise exception 'Join the race first' using errcode = '42501'; end if;
  if p_sequence <> v_player.checkpoint_no + 1 or p_sequence not between 1 and 24 then
    raise exception 'Checkpoints must be submitted in order' using errcode = '22023';
  end if;
  if v_player.last_checkpoint_at is not null
     and now() - v_player.last_checkpoint_at < interval '450 milliseconds' then
    raise exception 'Checkpoint arrived impossibly fast' using errcode = '22023';
  end if;
  update public.kart_players
  set checkpoint_no = p_sequence, last_checkpoint_at = now(), last_seen = now()
  where id = v_player.id returning * into v_player;
  return jsonb_build_object('checkpoint', v_player.checkpoint_no);
end
$fn$;

create or replace function public.kart_finish(p_session uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_session public.kart_sessions;
  v_player public.kart_players;
  v_ms integer;
  v_all_done boolean;
begin
  select * into v_session from public.kart_sessions where id = p_session for update;
  if not found or v_session.status <> 'racing' or v_session.final_deadline <= now() then
    raise exception 'The race is not accepting finishes' using errcode = '55000';
  end if;
  select * into v_player from public.kart_players
  where session_id = p_session and user_id = (select auth.uid()) for update;
  if not found or v_player.checkpoint_no < 24 then
    raise exception 'Complete every ordered checkpoint first' using errcode = '22023';
  end if;
  if v_player.finished_at is not null then
    return jsonb_build_object('finishMs', v_player.finish_ms);
  end if;
  if now() - v_session.starts_at < interval '35 seconds' then
    raise exception 'Finish time is not physically valid' using errcode = '22023';
  end if;

  v_ms := floor(extract(epoch from (now() - v_session.starts_at)) * 1000)::integer;
  update public.kart_players
  set finished_at = now(), finish_ms = v_ms, last_seen = now()
  where id = v_player.id returning * into v_player;

  /* The first finisher starts a visible 90-second window. */
  update public.kart_sessions
  set final_deadline = least(final_deadline, now() + interval '90 seconds')
  where id = p_session returning * into v_session;

  select not exists (
    select 1 from public.kart_players
    where session_id = p_session and ready and finished_at is null
  ) into v_all_done;
  if v_all_done then
    update public.kart_sessions
    set status = 'finished', finished_at = now()
    where id = p_session;
  end if;

  return jsonb_build_object(
    'finishMs', v_ms,
    'finalDeadline', v_session.final_deadline
  );
end
$fn$;

revoke all on function public.kart_now() from public, anon;
revoke all on function public.kart_open(uuid, jsonb, jsonb) from public, anon;
revoke all on function public.kart_join(text, text) from public, anon;
revoke all on function public.kart_find(uuid) from public, anon;
revoke all on function public.kart_ready(uuid, boolean) from public, anon;
revoke all on function public.kart_start(uuid) from public, anon;
revoke all on function public.kart_cancel(uuid) from public, anon;
revoke all on function public.kart_state(uuid) from public, anon;
revoke all on function public.kart_answer(uuid, integer, integer) from public, anon;
revoke all on function public.kart_use_boost(uuid) from public, anon;
revoke all on function public.kart_checkpoint(uuid, integer) from public, anon;
revoke all on function public.kart_finish(uuid) from public, anon;

grant execute on function public.kart_now() to authenticated;
grant execute on function public.kart_open(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.kart_join(text, text) to authenticated;
grant execute on function public.kart_find(uuid) to authenticated;
grant execute on function public.kart_ready(uuid, boolean) to authenticated;
grant execute on function public.kart_start(uuid) to authenticated;
grant execute on function public.kart_cancel(uuid) to authenticated;
grant execute on function public.kart_state(uuid) to authenticated;
grant execute on function public.kart_answer(uuid, integer, integer) to authenticated;
grant execute on function public.kart_use_boost(uuid) to authenticated;
grant execute on function public.kart_checkpoint(uuid, integer) to authenticated;
grant execute on function public.kart_finish(uuid) to authenticated;

do $block$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'kart_sessions'
  ) then
    alter publication supabase_realtime add table public.kart_sessions;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'kart_players'
  ) then
    alter publication supabase_realtime add table public.kart_players;
  end if;
end
$block$;

commit;
