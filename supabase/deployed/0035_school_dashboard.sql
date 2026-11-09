/* ------------------------------------------------------------------
   0035: School dashboard (LEA-128).

   A Schools buyer (flags.plan = 'schools' or flags.school) gets a
   dashboard for their own students. This is not UltraAdmin: every
   function checks the caller's plan and only reads or writes rows
   tied to that account.

   school_roster is the seat list. flags.students (the Schools slider,
   1–400, default 25) is the paid cap. Creating an account past that
   cap fails. Removing an account frees a seat. Classroom membership
   does not.

   Journey level and lesson counts are read from profiles.save.roadtrip
   (the same object the Journey screen writes). Recent activity is the
   existing account_activity row (screen name + time, one row per
   account). Nothing here adds a second progress store.

   Student messaging stays off: new school accounts are saved with
   flags.schoolStudent, and joining a Schools class stamps the same
   flag. The client already refuses friend inbox, lobby chat, and
   game challenges when that flag or the Schools plan is set.

   Safe to run twice. Apply after 0034. MCP apply name:
   school_dashboard_0035. Do not apply from a branch deploy.
-------------------------------------------------------------------*/

begin;

create schema if not exists private;

/* ============================== seats ============================= */
create table if not exists public.school_roster (
  school_id   uuid not null references public.profiles(id) on delete cascade,
  student_id  uuid not null references public.profiles(id) on delete cascade,
  email       text not null,
  created_at  timestamptz not null default now(),
  rules       jsonb not null default '{"outsideMessaging": true}'::jsonb,
  primary key (school_id, student_id),
  constraint school_roster_not_self check (school_id <> student_id)
);

alter table public.school_roster
  add column if not exists rules jsonb not null default '{"outsideMessaging": true}'::jsonb;

create unique index if not exists school_roster_student_idx
  on public.school_roster (student_id);

create unique index if not exists school_roster_email_idx
  on public.school_roster (lower(email));

alter table public.school_roster enable row level security;
revoke all on public.school_roster from public, anon, authenticated;

/* The caller must be a Schools account. flags.plan / flags.school are
   frozen by enforce_entitlement_flags unless an admin write is set,
   so a student cannot flip this on from the browser. */
create or replace function private.school_buyer()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  s jsonb;
  plan text;
  school boolean;
begin
  if me is null then
    raise exception 'Sign in on the Schools account first' using errcode = '42501';
  end if;
  select coalesce(p.save::jsonb, '{}'::jsonb) into s
    from public.profiles p where p.id = me;
  if not found then
    raise exception 'Schools plan only' using errcode = '42501';
  end if;
  plan := lower(coalesce(s #>> '{flags,plan}', 'free'));
  school := coalesce((s #>> '{flags,school}') = 'true', false) or plan = 'schools';
  if not school then
    raise exception 'Schools plan only' using errcode = '42501';
  end if;
  return me;
end;
$$;

revoke all on function private.school_buyer() from public, anon, authenticated;

/* Same bounds as the Schools slider in subscription-dev.js. A missing
   or zero count is the slider's default of 25. */
create or replace function private.school_seat_cap(p_save jsonb)
returns integer
language plpgsql
immutable
as $$
declare
  n integer;
begin
  begin
    n := nullif(p_save #>> '{flags,students}', '')::integer;
  exception when others then
    n := null;
  end;
  if n is null or n < 1 then n := 25; end if;
  if n > 400 then n := 400; end if;
  return n;
end;
$$;

revoke all on function private.school_seat_cap(jsonb) from public, anon, authenticated;

/* Journey unit ids match assets/js/mode-roadtrip.js UNITS. Level is
   the unit number on that path, not a separate score. */
create or replace function private.journey_from_save(p_save jsonb)
returns jsonb
language sql
stable
as $$
  with u as (
    select coalesce(nullif(p_save #>> '{roadtrip,unitId}', ''), 'africa-north') as id
  )
  select jsonb_build_object(
    'journeyLevel', case (select id from u)
      when 'africa-north' then 1
      when 'africa-west' then 2
      when 'africa-east' then 3
      when 'africa-south' then 4
      when 'africa-central' then 5
      when 'europe' then 6
      when 'asia' then 7
      when 'americas' then 8
      when 'oceania' then 9
      else 1
    end,
    'journeyUnit', case (select id from u)
      when 'africa-north' then 'North Africa'
      when 'africa-west' then 'West Africa'
      when 'africa-east' then 'East Africa'
      when 'africa-south' then 'Southern Africa'
      when 'africa-central' then 'Central Africa'
      when 'europe' then 'Europe'
      when 'asia' then 'Asia'
      when 'americas' then 'The Americas'
      when 'oceania' then 'Oceania'
      else 'North Africa'
    end,
    'lessonsDone', (
      select count(*)::int
        from jsonb_object_keys(
          case when jsonb_typeof(p_save #> '{roadtrip,done}') = 'object'
               then p_save #> '{roadtrip,done}'
               else '{}'::jsonb end
        ) as k
    )
  );
$$;

revoke all on function private.journey_from_save(jsonb) from public, anon, authenticated;

create or replace function private.school_class_code()
returns text
language plpgsql
volatile
as $$
declare
  abc text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  out text := '';
  i int;
begin
  for i in 1..6 loop
    out := out || substr(abc, 1 + floor(random() * length(abc))::int, 1);
  end loop;
  return out;
end;
$$;

revoke all on function private.school_class_code() from public, anon, authenticated;

/* Joining a class taught by a Schools account turns messaging off for
   that student. flags.schoolStudent is not one of the frozen entitlement
   keys, so the existing profiles trigger leaves it in place. */
create or replace function private.stamp_school_student()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  teacher uuid;
  save jsonb;
  plan text;
  school boolean;
begin
  if new.student_id is null then
    return new;
  end if;
  select c.teacher_id into teacher from public.classes c where c.id = new.class_id;
  if teacher is null or teacher = new.student_id then
    return new;
  end if;
  select coalesce(p.save::jsonb, '{}'::jsonb) into save
    from public.profiles p where p.id = teacher;
  if not found then
    return new;
  end if;
  plan := lower(coalesce(save #>> '{flags,plan}', 'free'));
  school := coalesce((save #>> '{flags,school}') = 'true', false) or plan = 'schools';
  if not school then
    return new;
  end if;

  update public.profiles p
     set save = jsonb_set(
           case when jsonb_typeof(coalesce(p.save::jsonb, '{}'::jsonb)) = 'object'
                then coalesce(p.save::jsonb, '{}'::jsonb)
                else '{}'::jsonb end,
           '{flags,schoolStudent}',
           'true'::jsonb,
           true)
   where p.id = new.student_id;
  return new;
end;
$$;

revoke all on function private.stamp_school_student() from public, anon, authenticated;

drop trigger if exists class_members_school_student on public.class_members;
create trigger class_members_school_student
  after insert on public.class_members
  for each row execute function private.stamp_school_student();

/* ============================ read ================================ */
create or replace function public.school_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid;
  save jsonb;
  paid integer;
  used integer;
  students jsonb;
  classes jsonb;
begin
  me := private.school_buyer();
  select coalesce(p.save::jsonb, '{}'::jsonb) into save
    from public.profiles p where p.id = me;
  paid := private.school_seat_cap(save);
  select count(*)::int into used from public.school_roster r where r.school_id = me;

  select coalesce(jsonb_agg(row_to_json(s)::jsonb order by s.name), '[]'::jsonb)
    into students
    from (
      select r.student_id as id,
             coalesce(nullif(pr.display_name, ''), 'Student') as name,
             coalesce((select u.email::text from auth.users u where u.id = r.student_id), r.email) as email,
             coalesce((private.journey_from_save(coalesce(pr.save::jsonb, '{}'::jsonb)) ->> 'journeyLevel')::int, 1) as "journeyLevel",
             coalesce(private.journey_from_save(coalesce(pr.save::jsonb, '{}'::jsonb)) ->> 'journeyUnit', 'North Africa') as "journeyUnit",
             coalesce((private.journey_from_save(coalesce(pr.save::jsonb, '{}'::jsonb)) ->> 'lessonsDone')::int, 0) as "lessonsDone",
             nullif(a.screen, '') as screen,
             a.seen_at as "seenAt",
             coalesce(r.rules, '{"outsideMessaging": true}'::jsonb) as rules
        from public.school_roster r
        left join public.profiles pr on pr.id = r.student_id
        left join public.account_activity a on a.user_id = r.student_id
       where r.school_id = me
    ) s;

  select coalesce(jsonb_agg(c.row order by c.name), '[]'::jsonb)
    into classes
    from (
      select cl.name,
             jsonb_build_object(
               'id', cl.id,
               'name', cl.name,
               'code', cl.code,
               'students', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'id', m.student_id,
                          'name', coalesce(nullif(btrim(m.display_name), ''), pr.display_name, 'Student'),
                          'journeyLevel', case when m.student_id is null then null
                            else coalesce((private.journey_from_save(coalesce(pr.save::jsonb, '{}'::jsonb)) ->> 'journeyLevel')::int, 1) end,
                          'journeyUnit', case when m.student_id is null then null
                            else coalesce(private.journey_from_save(coalesce(pr.save::jsonb, '{}'::jsonb)) ->> 'journeyUnit', 'North Africa') end,
                          'lessonsDone', case when m.student_id is null then null
                            else coalesce((private.journey_from_save(coalesce(pr.save::jsonb, '{}'::jsonb)) ->> 'lessonsDone')::int, 0) end,
                          'screen', nullif(a.screen, ''),
                          'seenAt', a.seen_at
                        ) order by coalesce(nullif(btrim(m.display_name), ''), pr.display_name, 'Student'))
                   from public.class_members m
                   left join public.profiles pr on pr.id = m.student_id
                   left join public.account_activity a on a.user_id = m.student_id
                  where m.class_id = cl.id
               ), '[]'::jsonb)
             ) as row
        from public.classes cl
       where cl.teacher_id = me
    ) c;

  return jsonb_build_object(
    'ok', true,
    'paid', paid,
    'used', used,
    'messagingOff', true,
    'students', students,
    'classes', classes
  );
end;
$$;

revoke all on function public.school_dashboard() from public, anon;
grant execute on function public.school_dashboard() to authenticated;

/* ======================== create account ========================== */
create or replace function public.school_create_student(p_name text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
declare
  me uuid;
  buyer jsonb;
  paid integer;
  used integer;
  v_name text;
  v_pass text;
  v_id uuid;
  v_email text;
  local text;
  inst uuid;
  v_save jsonb;
begin
  me := private.school_buyer();
  select coalesce(p.save::jsonb, '{}'::jsonb) into buyer
    from public.profiles p where p.id = me for update;
  paid := private.school_seat_cap(buyer);
  select count(*)::int into used from public.school_roster r where r.school_id = me;
  if used >= paid then
    raise exception 'All % seats are in use', paid using errcode = 'P0001';
  end if;

  v_name := left(btrim(coalesce(p_name, '')), 60);
  v_pass := coalesce(p_password, '');
  if v_name = '' then
    raise exception 'A name is required' using errcode = '22023';
  end if;
  if char_length(v_pass) < 8 or char_length(v_pass) > 72 then
    raise exception 'Password must be 8 to 72 characters' using errcode = '22023';
  end if;

  v_id := gen_random_uuid();
  local := lower(regexp_replace(v_name, '[^a-zA-Z0-9]+', '', 'g'));
  if local = '' then local := 'student'; end if;
  local := left(local, 24);
  v_email := local || '.' || substr(replace(v_id::text, '-', ''), 1, 6) || '@students.learngeo.app';
  if exists (select 1 from auth.users u where lower(u.email) = lower(v_email)) then
    v_email := local || '.' || substr(md5(random()::text || v_id::text), 1, 8) || '@students.learngeo.app';
  end if;

  select u.instance_id into inst from auth.users u where u.instance_id is not null limit 1;
  if inst is null then
    inst := '00000000-0000-0000-0000-000000000000';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    inst, v_id, 'authenticated', 'authenticated', v_email,
    extensions.crypt(v_pass, extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('display_name', v_name),
    now(), now(),
    '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
  )
  select gen_random_uuid(), v_id,
         jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
         'email', v_id::text, now(), now(), now()
   where not exists (
     select 1 from auth.identities i
      where i.user_id = v_id and i.provider = 'email'
   );

  v_save := jsonb_build_object(
    'role', 'student',
    'roleChosen', true,
    'flags', jsonb_build_object(
      'schoolStudent', true,
      'plan', 'free',
      'premium', false,
      'school', false,
      'students', 0
    ),
    'profile', jsonb_build_object('displayName', v_name),
    'economy', jsonb_build_object('level', 1, 'xp', 0, 'diamonds', 150),
    'roadtrip', jsonb_build_object(
      'unitId', 'africa-north',
      'done', '{}'::jsonb,
      'claimed', '{}'::jsonb,
      'read', '{}'::jsonb
    )
  );

  insert into public.profiles (id, display_name, role, save)
  values (v_id, v_name, 'student', v_save)
  on conflict (id) do update
    set display_name = excluded.display_name,
        role = 'student',
        save = excluded.save;

  insert into public.school_roster (school_id, student_id, email, rules)
  values (me, v_id, v_email, '{"outsideMessaging": true}'::jsonb);

  used := used + 1;
  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'name', v_name,
    'email', v_email,
    'seatsUsed', used,
    'seatsPaid', paid
  );
end;
$$;

revoke all on function public.school_create_student(text, text) from public, anon;
grant execute on function public.school_create_student(text, text) to authenticated;

/* ======================== remove account ========================== */
create or replace function public.school_remove_account(p_student uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid;
  paid integer;
  used integer;
  save jsonb;
begin
  me := private.school_buyer();
  if p_student is null or p_student = me then
    raise exception 'That student is not in this school' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.school_roster r
     where r.school_id = me and r.student_id = p_student
  ) then
    raise exception 'That student is not in this school' using errcode = '42501';
  end if;

  delete from public.class_members where student_id = p_student;
  delete from public.school_roster where school_id = me and student_id = p_student;
  delete from auth.users where id = p_student;

  select coalesce(p.save::jsonb, '{}'::jsonb) into save
    from public.profiles p where p.id = me;
  paid := private.school_seat_cap(save);
  select count(*)::int into used from public.school_roster r where r.school_id = me;

  return jsonb_build_object('ok', true, 'seatsUsed', used, 'seatsPaid', paid);
end;
$$;

revoke all on function public.school_remove_account(uuid) from public, anon;
grant execute on function public.school_remove_account(uuid) to authenticated;

/* ======================== classrooms ============================== */
create or replace function public.school_create_class(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid;
  v_name text;
  v_id uuid;
  v_code text;
  i int;
begin
  me := private.school_buyer();
  v_name := left(btrim(coalesce(p_name, '')), 60);
  if v_name = '' then v_name := 'New class'; end if;

  for i in 1..8 loop
    begin
      insert into public.classes (code, name, teacher_id)
      values (private.school_class_code(), v_name, me)
      returning id, code into v_id, v_code;
      exit;
    exception
      when unique_violation then
        if i = 8 then
          raise exception 'Could not create a class code' using errcode = 'P0001';
        end if;
    end;
  end loop;

  return jsonb_build_object('ok', true, 'id', v_id, 'name', v_name, 'code', v_code);
end;
$$;

revoke all on function public.school_create_class(text) from public, anon;
grant execute on function public.school_create_class(text) to authenticated;

create or replace function public.school_rename_class(p_class uuid, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid;
  v_name text;
begin
  me := private.school_buyer();
  v_name := left(btrim(coalesce(p_name, '')), 60);
  if v_name = '' then
    raise exception 'A class name is required' using errcode = '22023';
  end if;
  update public.classes
     set name = v_name
   where id = p_class and teacher_id = me;
  if not found then
    raise exception 'That class is not in this school' using errcode = 'P0002';
  end if;
  return jsonb_build_object('ok', true, 'id', p_class, 'name', v_name);
end;
$$;

revoke all on function public.school_rename_class(uuid, text) from public, anon;
grant execute on function public.school_rename_class(uuid, text) to authenticated;

create or replace function public.school_class_add(p_class uuid, p_student uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid;
  v_name text;
begin
  me := private.school_buyer();
  if not exists (
    select 1 from public.classes c where c.id = p_class and c.teacher_id = me
  ) then
    raise exception 'That class is not in this school' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.school_roster r
     where r.school_id = me and r.student_id = p_student
  ) then
    raise exception 'That student is not in this school' using errcode = '42501';
  end if;

  select coalesce(nullif(pr.display_name, ''), 'Student') into v_name
    from public.profiles pr where pr.id = p_student;

  insert into public.class_members (class_id, student_id, display_name)
  values (p_class, p_student, left(coalesce(v_name, 'Student'), 60))
  on conflict (class_id, student_id) do update
    set display_name = excluded.display_name;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.school_class_add(uuid, uuid) from public, anon;
grant execute on function public.school_class_add(uuid, uuid) to authenticated;

create or replace function public.school_class_remove(p_class uuid, p_student uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid;
begin
  me := private.school_buyer();
  if not exists (
    select 1 from public.classes c where c.id = p_class and c.teacher_id = me
  ) then
    raise exception 'That class is not in this school' using errcode = 'P0002';
  end if;
  delete from public.class_members
   where class_id = p_class and student_id = p_student;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.school_class_remove(uuid, uuid) from public, anon;
grant execute on function public.school_class_remove(uuid, uuid) to authenticated;

/* ============================== rules =============================
   Per student, on the roster row the student cannot update.
   Booleans: profile, avatar, skins, frames, effects, nameplates,
   banners, themes, gameSkins, role, reset, messaging, outsideMessaging.
   games is a list of game ids (duel, dash, …). outsideMessaging means
   no messaging to accounts outside this school.
==================================================================== */
create or replace function private.school_flag(src jsonb, key text, fallback boolean)
returns boolean
language sql
immutable
as $$
  select case
    when src is null or jsonb_typeof(src) <> 'object' then fallback
    when not (src ? key) then fallback
    when jsonb_typeof(src -> key) = 'boolean' then (src ->> key)::boolean
    when jsonb_typeof(src -> key) = 'string' and lower(src ->> key) in ('true', 'false')
      then lower(src ->> key) = 'true'
    else fallback
  end;
$$;

revoke all on function private.school_flag(jsonb, text, boolean) from public, anon, authenticated;

create or replace function private.school_clean_rules(p jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  src jsonb := case when jsonb_typeof(p) = 'object' then p else '{}'::jsonb end;
  games jsonb := '[]'::jsonb;
  g text;
  n integer := 0;
begin
  if jsonb_typeof(src -> 'games') = 'array' then
    for g in select jsonb_array_elements_text(src -> 'games')
    loop
      exit when n >= 40;
      if g ~ '^[a-z0-9]{1,24}$' and not (games ? g) then
        games := games || to_jsonb(g);
        n := n + 1;
      end if;
    end loop;
  end if;
  return jsonb_build_object(
    'profile', private.school_flag(src, 'profile', false),
    'avatar', private.school_flag(src, 'avatar', false),
    'skins', private.school_flag(src, 'skins', false),
    'frames', private.school_flag(src, 'frames', false),
    'effects', private.school_flag(src, 'effects', false),
    'nameplates', private.school_flag(src, 'nameplates', false),
    'banners', private.school_flag(src, 'banners', false),
    'themes', private.school_flag(src, 'themes', false),
    'gameSkins', private.school_flag(src, 'gameSkins', false),
    'role', private.school_flag(src, 'role', false),
    'reset', private.school_flag(src, 'reset', false),
    'messaging', private.school_flag(src, 'messaging', false),
    'outsideMessaging', private.school_flag(src, 'outsideMessaging', true),
    'games', games
  );
end;
$$;

revoke all on function private.school_clean_rules(jsonb) from public, anon, authenticated;

create or replace function public.school_set_rules(p_student uuid, p_rules jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid;
  cleaned jsonb;
begin
  me := private.school_buyer();
  if p_student is null or p_student = me then
    raise exception 'That student is not in this school' using errcode = 'P0002';
  end if;
  cleaned := private.school_clean_rules(p_rules);
  update public.school_roster
     set rules = cleaned
   where school_id = me and student_id = p_student;
  if not found then
    raise exception 'That student is not in this school' using errcode = 'P0002';
  end if;
  return jsonb_build_object('ok', true, 'id', p_student, 'rules', cleaned);
end;
$$;

revoke all on function public.school_set_rules(uuid, jsonb) from public, anon;
grant execute on function public.school_set_rules(uuid, jsonb) to authenticated;

create or replace function public.my_school_rules()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  sid uuid;
  rules jsonb;
  tags jsonb;
begin
  if me is null then
    return jsonb_build_object('ok', false, 'message', 'Sign in first.');
  end if;
  select r.school_id, r.rules into sid, rules
    from public.school_roster r
   where r.student_id = me;
  if sid is null then
    return jsonb_build_object(
      'ok', true,
      'onRoster', false,
      'rules', '{}'::jsonb,
      'classmates', '[]'::jsonb
    );
  end if;
  select coalesce(jsonb_agg(lower(p.save ->> 'gamertag')) filter (
           where coalesce(p.save ->> 'gamertag', '') ~ '^[A-Za-z0-9_]{3,16}$'
         ), '[]'::jsonb)
    into tags
    from public.school_roster r
    join public.profiles p on p.id = r.student_id
   where r.school_id = sid
     and r.student_id <> me;
  return jsonb_build_object(
    'ok', true,
    'onRoster', true,
    'rules', private.school_clean_rules(rules),
    'classmates', tags
  );
end;
$$;

revoke all on function public.my_school_rules() from public, anon;
grant execute on function public.my_school_rules() to authenticated;

/* True when this student may message that gamertag. Unknown tags count
   as outside the school. Accounts with no roster row are not gated here. */
create or replace function public.school_may_message(p_tag text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  sid uuid;
  rules jsonb;
  them uuid;
begin
  if me is null then
    return jsonb_build_object('ok', true, 'allowed', false);
  end if;
  select r.school_id, r.rules into sid, rules
    from public.school_roster r
   where r.student_id = me;
  if sid is null then
    return jsonb_build_object('ok', true, 'allowed', true);
  end if;
  rules := private.school_clean_rules(rules);
  if private.school_flag(rules, 'messaging', false) then
    return jsonb_build_object('ok', true, 'allowed', false, 'reason', 'messaging');
  end if;
  if private.school_flag(rules, 'outsideMessaging', true) then
    them := private.profile_id_for_gamertag(coalesce(p_tag, ''));
    if them is not null and exists (
      select 1 from public.school_roster r
       where r.school_id = sid and r.student_id = them
    ) then
      return jsonb_build_object('ok', true, 'allowed', true);
    end if;
    return jsonb_build_object('ok', true, 'allowed', false, 'reason', 'outside');
  end if;
  return jsonb_build_object('ok', true, 'allowed', true);
end;
$$;

revoke all on function public.school_may_message(text) from public, anon;
grant execute on function public.school_may_message(text) to authenticated;

commit;
