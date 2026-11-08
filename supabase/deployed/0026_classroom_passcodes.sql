/* ------------------------------------------------------------------
   0026: iPad classroom passcodes (LEA-81).

   Teachers mint a short passcode (same alphabet as class / GeoLive
   codes, four characters). Students type passcode + name on an iPad
   to join Games / Geo Live without walking through email signup.

   Live schema only (teacher_id on classes). Safe to run twice.
   Apply after 0025. MCP name: classroom_passcodes_0026.
-------------------------------------------------------------------*/

begin;

/* ========================= column ================================ */
alter table public.classes
  add column if not exists classroom_pass text;

alter table public.classes
  drop constraint if exists classes_classroom_pass_shape;

alter table public.classes
  add constraint classes_classroom_pass_shape
  check (
    classroom_pass is null
    or classroom_pass ~ '^[A-HJ-NP-Z2-9]{4}$'
  );

comment on column public.classes.classroom_pass is
  'Short LEA-81 passcode for iPad classroom join. Null means off.';

/* One active passcode per class is enough; two classes must not share
   a live pass so a board code cannot land a student in the wrong room. */
drop index if exists public.classes_classroom_pass_uidx;
create unique index classes_classroom_pass_uidx
  on public.classes (classroom_pass)
  where classroom_pass is not null;

/* ========================= helpers =============================== */
create or replace function private.gen_classroom_pass()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  abc text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  out text;
  n int;
  i int;
begin
  for n in 1..24 loop
    out := '';
    for i in 1..4 loop
      out := out || substr(abc, 1 + floor(random() * length(abc))::int, 1);
    end loop;
    if not exists (
      select 1 from public.classes c where c.classroom_pass = out
    ) then
      return out;
    end if;
  end loop;
  raise exception 'could not allocate a classroom passcode' using errcode = 'P0001';
end;
$$;

revoke all on function private.gen_classroom_pass() from public;
grant execute on function private.gen_classroom_pass() to authenticated;

/* Owner or co-teacher (private.is_class_teacher already covers both). */
create or replace function private.can_manage_class(p_class uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.is_class_teacher(p_class), false);
$$;

revoke all on function private.can_manage_class(uuid) from public;
grant execute on function private.can_manage_class(uuid) to authenticated;

/* ========================= teacher: set / clear / read =========== */
create or replace function public.set_classroom_pass(p_class_id uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_class public.classes;
  v_pass text;
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '28000';
  end if;
  if p_class_id is null or not private.can_manage_class(p_class_id) then
    raise exception 'That is not your class' using errcode = '42501';
  end if;

  v_pass := private.gen_classroom_pass();
  update public.classes
     set classroom_pass = v_pass
   where id = p_class_id
   returning * into v_class;

  return json_build_object(
    'id', v_class.id,
    'code', v_class.code,
    'name', v_class.name,
    'pass', v_class.classroom_pass
  );
end;
$$;

create or replace function public.clear_classroom_pass(p_class_id uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_class public.classes;
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '28000';
  end if;
  if p_class_id is null or not private.can_manage_class(p_class_id) then
    raise exception 'That is not your class' using errcode = '42501';
  end if;

  update public.classes
     set classroom_pass = null
   where id = p_class_id
   returning * into v_class;

  return json_build_object(
    'id', v_class.id,
    'code', v_class.code,
    'name', v_class.name,
    'pass', null
  );
end;
$$;

create or replace function public.read_classroom_pass(p_class_id uuid)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_class public.classes;
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '28000';
  end if;
  if p_class_id is null or not private.can_manage_class(p_class_id) then
    raise exception 'That is not your class' using errcode = '42501';
  end if;

  select * into v_class from public.classes c where c.id = p_class_id;
  if not found then
    raise exception 'That is not your class' using errcode = '42501';
  end if;

  return json_build_object(
    'id', v_class.id,
    'code', v_class.code,
    'name', v_class.name,
    'pass', v_class.classroom_pass
  );
end;
$$;

revoke all on function public.set_classroom_pass(uuid) from public, anon;
revoke all on function public.clear_classroom_pass(uuid) from public, anon;
revoke all on function public.read_classroom_pass(uuid) from public, anon;
grant execute on function public.set_classroom_pass(uuid) to authenticated;
grant execute on function public.clear_classroom_pass(uuid) to authenticated;
grant execute on function public.read_classroom_pass(uuid) to authenticated;

/* ========================= student: lookup + join ================ */
/* Preview only — no membership change. Callable signed-out so an iPad
   can confirm the pass before minting a throwaway session. */
create or replace function public.classroom_pass_lookup(p_pass text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pass text := upper(btrim(coalesce(p_pass, '')));
  v_class public.classes;
begin
  if v_pass !~ '^[A-HJ-NP-Z2-9]{4}$' then
    raise exception 'That passcode does not look right' using errcode = '22023';
  end if;

  select * into v_class
  from public.classes c
  where c.classroom_pass = v_pass
  limit 1;

  if not found then
    raise exception 'No class has that passcode' using errcode = 'P0002';
  end if;

  return json_build_object(
    'id', v_class.id,
    'code', v_class.code,
    'name', v_class.name
  );
end;
$$;

/* Join by passcode. Requires auth.uid() — the client mints a silent
   session first (anonymous if enabled, otherwise a throwaway email). */
create or replace function public.join_class_by_pass(p_pass text, p_name text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_name text := left(btrim(coalesce(p_name, '')), 40);
  v_pass text := upper(btrim(coalesce(p_pass, '')));
  v_class public.classes;
begin
  if v_uid is null then
    raise exception 'Sign in first' using errcode = '28000';
  end if;
  if v_name = '' then
    raise exception 'Your name is needed' using errcode = '22023';
  end if;
  if v_pass !~ '^[A-HJ-NP-Z2-9]{4}$' then
    raise exception 'That passcode does not look right' using errcode = '22023';
  end if;

  select * into v_class
  from public.classes c
  where c.classroom_pass = v_pass
  limit 1;

  if not found then
    raise exception 'No class has that passcode' using errcode = 'P0002';
  end if;
  if v_class.teacher_id = v_uid then
    raise exception 'That is your own class' using errcode = '22023';
  end if;

  insert into public.class_members (class_id, student_id, display_name)
  values (v_class.id, v_uid, v_name)
  on conflict (class_id, student_id) do update
    set display_name = excluded.display_name;

  update public.profiles
     set display_name = v_name
   where id = v_uid
     and (display_name is null or display_name = '' or display_name = 'Explorer');

  return json_build_object(
    'id', v_class.id,
    'code', v_class.code,
    'name', v_class.name,
    'via', 'classroom_pass'
  );
end;
$$;

revoke all on function public.classroom_pass_lookup(text) from public;
revoke all on function public.join_class_by_pass(text, text) from public;
grant execute on function public.classroom_pass_lookup(text) to anon, authenticated;
grant execute on function public.join_class_by_pass(text, text) to authenticated;

commit;
