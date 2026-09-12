-- ===================================================================
-- RLS EVALUATION HARNESS  (oy-10)
--
-- Why this exists. Every schema check this project ran was STRUCTURAL:
-- tables exist, functions exist, 12 policies present, 3 tables in the
-- publication. All true. All green. Not one of them ever asked the
-- database to EVALUATE a policy. A 12-policy count passes happily while
-- all 12 policies are unusable, and that is exactly what happened:
-- GeoLive was dead from the day it shipped and every check said fine.
--
-- "Present" and "works" are different questions. This asks the second.
--
-- HOW TO READ A RESULT
--   EVALUATED OK   the policy ran to completion. It does NOT mean the
--                  rows returned are the right rows.
--   FAILED 42P17   infinite recursion: a policy re-enters its own table.
--   FAILED 42501   refused. For anon on live_* that is a GRANT refusal,
--                  not a policy decision, because anon has no policies
--                  on those tables at all.
--
-- THE TRAP THIS HARNESS IS BUILT AROUND
--   anon has ZERO policies on live_*, so an anon run can never evaluate
--   a recursive policy and will pass on a totally broken database. Any
--   run that tests only anon certifies nothing. ALWAYS run the
--   authenticated rows too. That single mistake is why oy-10's own
--   "anonymous RLS passes" result was green on a dead feature.
-- ===================================================================


-- -------------------------------------------------------------------
-- STEP 0. Never trust a rollback you have not probed.
-- Run this FIRST, every session, before any write test below.
-- Expect rollback_is_honoured = true. If it is false, STOP: the write
-- tests would persist to the real database.
-- -------------------------------------------------------------------
begin;
  create table public._rbprobe(x int);
  insert into public._rbprobe values (1);
rollback;
select to_regclass('public._rbprobe') is null as rollback_is_honoured;


-- -------------------------------------------------------------------
-- STEP 1. READ MATRIX. Read-only, so safe on production as-is.
-- Exercises every policy once per role and catches per table, so one
-- recursive policy does not hide the state of the others.
-- -------------------------------------------------------------------
begin;
create temp table _out(role_tested text, tbl text, outcome text);
grant all on _out to authenticated, anon;

do $$
declare t text; r text; n bigint;
begin
  foreach r in array array['anon','authenticated'] loop
    foreach t in array array['live_sessions','live_players','live_answers'] loop
      begin
        perform set_config('role', r, true);
        perform set_config('request.jwt.claims',
          '{"sub":"11111111-1111-4111-8111-111111111111","role":"'||r||'"}', true);
        execute format('select count(*) from public.%I', t) into n;
        insert into _out values (r, t, 'EVALUATED OK, rows=' || n);
      exception when others then
        insert into _out values (r, t, 'FAILED ' || SQLSTATE || ': ' || left(SQLERRM, 60));
      end;
    end loop;
  end loop;
  perform set_config('role', 'postgres', true);
end $$;

select * from _out order by role_tested, tbl;
rollback;


-- -------------------------------------------------------------------
-- STEP 2. WRITE PATHS, as a real teacher and a real student.
-- Only run after STEP 0 reports true.
--
-- Needs two real uids and a real class, because live_sessions.class_id
-- is a foreign key: a fabricated uuid fails on 23503 before any policy
-- is ever consulted, which looks like a refusal and is not one. Fill in
-- the three values below from a class that actually exists.
--
-- Everything is inside begin/rollback, so a success writes nothing.
-- -------------------------------------------------------------------
/*
begin;
  create temp table _w(step text, outcome text);
  grant all on _w to authenticated;

  do $$
  declare
    v_class   uuid := '<a real classes.id>';
    v_teacher uuid := '<the uid that owns that class>';
    v_student uuid := '<a uid enrolled in that class>';
    v_session uuid; v_player uuid; n bigint;
  begin
    -- teacher opens a room
    begin
      perform set_config('role','authenticated',true);
      perform set_config('request.jwt.claims','{"sub":"'||v_teacher||'","role":"authenticated"}',true);
      insert into public.live_sessions(class_id, host_id, code, status, question_index)
      values (v_class, v_teacher, 'HARNES', 'lobby', 0)
      returning id into v_session;
      insert into _w values ('teacher opens session','OK '||v_session);
    exception when others then
      insert into _w values ('teacher opens session','FAILED '||SQLSTATE||': '||left(SQLERRM,70));
    end;

    -- teacher seats the student
    begin
      insert into public.live_players(session_id, student_id, name)
      values (v_session, v_student, 'Harness Student') returning id into v_player;
      insert into _w values ('teacher seats player','OK '||v_player);
    exception when others then
      insert into _w values ('teacher seats player','FAILED '||SQLSTATE||': '||left(SQLERRM,70));
    end;

    -- teacher reads back
    begin
      execute 'select count(*) from public.live_players where session_id=$1'
        into n using v_session;
      insert into _w values ('teacher reads players','OK rows='||n);
    exception when others then
      insert into _w values ('teacher reads players','FAILED '||SQLSTATE||': '||left(SQLERRM,70));
    end;

    -- now as the STUDENT. This path has never been exercised by anyone.
    perform set_config('request.jwt.claims','{"sub":"'||v_student||'","role":"authenticated"}',true);

    begin
      execute 'select count(*) from public.live_sessions where id=$1' into n using v_session;
      insert into _w values ('student reads own session','OK rows='||n);
    exception when others then
      insert into _w values ('student reads own session','FAILED '||SQLSTATE||': '||left(SQLERRM,70));
    end;

    -- a legal answer: correct=false, points=0, set by the server later
    begin
      insert into public.live_answers(session_id, player_id, question_index, choice, ms, correct, points)
      values (v_session, v_player, 0, 'A', 1200, false, 0);
      insert into _w values ('student posts legal answer','OK');
    exception when others then
      insert into _w values ('student posts legal answer','FAILED '||SQLSTATE||': '||left(SQLERRM,70));
    end;

    -- THE ONE THAT MUST FAIL: a student awarding themselves the points.
    -- An OK here is a security hole, not a pass.
    begin
      insert into public.live_answers(session_id, player_id, question_index, choice, ms, correct, points)
      values (v_session, v_player, 1, 'A', 5, true, 1000);
      insert into _w values ('student self-awards points','*** ALLOWED - SECURITY HOLE ***');
    exception when others then
      insert into _w values ('student self-awards points','correctly refused ('||SQLSTATE||')');
    end;

    perform set_config('role','postgres',true);
  end $$;

  select * from _w;
rollback;
*/
