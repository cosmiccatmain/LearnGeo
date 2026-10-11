/* ------------------------------------------------------------------
   0010 — classmates you can see, admin classrooms, and co-teachers.

   NOT YET APPLIED as of this commit.

   Written against the LIVE schema (supabase/deployed/README.md), not
   migrations/0001: classes(id, code, name, teacher_id, created_at),
   class_members(class_id, student_id, display_name, joined_at). Every
   one of those columns was probed against the API on 2026-10-11.

   1. WHO IS IN THE CLASS
      class_roster(class) answers the class's teachers and students
      with each person's PUBLIC profile — name, avatar, decoration,
      effect, nameplate, banner, theme, pronouns, about, badges, level
      and three stats — read from their own save. Only to somebody in
      the class or teaching it. Nothing else in a save leaves: not the
      balance, the progress, the classes or the email.

   2. ADMIN CLASSROOMS
      classes.is_admin, set only from UltraAdmin. A class marked admin
      cannot be joined with its own code: a trigger on class_members
      refuses the insert however it arrives, including through
      join_class, which lives only in the live project and is not
      edited here. The way in is join_admin_class, which takes the
      UltraAdmin code and an account on the admin list.

   3. MORE THAN ONE TEACHER
      class_teachers holds co-teachers. Every policy on the class
      tables already goes through private.is_class_teacher, so that one
      helper is widened and every permission follows. It is defined
      only in the live project, so instead of rewriting it from a
      guess, its exact current definition is COPIED to
      private.is_class_owner (pg_get_functiondef), and is_class_teacher
      becomes "is_class_owner, or a co-teacher". The copy happens once;
      running this file again does not copy the wrapper over the
      original. The wrapper can only add co-teachers to what the helper
      already allowed; it cannot narrow or replace it.
-------------------------------------------------------------------*/

/* ================================================================
   PART 1 — admin classrooms
   ================================================================ */

alter table public.classes add column if not exists is_admin boolean not null default false;

/* Created first: functions below in Part 1 already read it. */
create table if not exists public.class_teachers (
  class_id   uuid not null references public.classes(id) on delete cascade,
  teacher_id uuid not null references auth.users(id) on delete cascade,
  added_by   uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (class_id, teacher_id)
);
alter table public.class_teachers enable row level security;
/* No policies: only the functions below read or write it. */

create or replace function private.guard_admin_class_join()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.classes c where c.id = new.class_id and c.is_admin)
     and coalesce(current_setting('learngeo.admin_join', true), '') <> 'on' then
    /* Worded exactly as an unknown code, on purpose. */
    raise exception 'No class has that code' using errcode = 'P0002';
  end if;
  return new;
end;
$$;

drop trigger if exists class_members_admin_guard on public.class_members;
create trigger class_members_admin_guard
  before insert on public.class_members
  for each row execute function private.guard_admin_class_join();

create or replace function public.join_admin_class(p_code text, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me    text;
  nm    text;
  chosen jsonb;
  r     record;
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '28000';
  end if;
  select u.email into me from auth.users u where u.id = auth.uid();
  if not exists (select 1 from public.admin_allow a where lower(a.email) = lower(coalesce(me, ''))) then
    raise exception 'No class has that code' using errcode = 'P0002';
  end if;
  if public.verify_admin_pin_scope(coalesce(p_code, '')) is distinct from 'ultra' then
    raise exception 'No class has that code' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.classes c where c.is_admin) then
    raise exception 'There is no admin classroom yet' using errcode = 'P0002';
  end if;

  nm := left(coalesce(nullif(btrim(p_name), ''),
                      (select p.display_name from public.profiles p where p.id = auth.uid()),
                      'Explorer'), 40);

  perform set_config('learngeo.admin_join', 'on', true);
  for r in select c.id, c.code, c.name from public.classes c where c.is_admin order by c.created_at loop
    if not exists (select 1 from public.class_members m
                    where m.class_id = r.id and m.student_id = auth.uid()) then
      insert into public.class_members (class_id, student_id, display_name)
      values (r.id, auth.uid(), nm);
    end if;
    if chosen is null then
      chosen := jsonb_build_object('id', r.id, 'code', r.code, 'name', r.name);
    end if;
  end loop;
  perform set_config('learngeo.admin_join', 'off', true);

  return chosen;
end;
$$;
revoke execute on function public.join_admin_class(text, text) from public, anon;
grant  execute on function public.join_admin_class(text, text) to authenticated;

/* The admin classes the caller sits in or teaches, so a device can
   dress them differently and keep their code off the screen. */
create or replace function public.my_admin_class_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct c.id), '{}')
    from public.classes c
   where c.is_admin
     and (c.teacher_id = auth.uid()
          or exists (select 1 from public.class_members m where m.class_id = c.id and m.student_id = auth.uid())
          or exists (select 1 from public.class_teachers t where t.class_id = c.id and t.teacher_id = auth.uid()))
$$;
revoke execute on function public.my_admin_class_ids() from public, anon;
grant  execute on function public.my_admin_class_ids() to authenticated;

create or replace function public.ultra_list_classes(p_token uuid, p_query text)
returns table (id uuid, name text, code text, teacher_email text, members bigint,
               is_admin boolean, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare q text := nullif(btrim(coalesce(p_query, '')), '');
begin
  if public.admin_scope_of(p_token) is distinct from 'ultra' then
    raise exception 'not authorised' using errcode = '42501';
  end if;
  return query
    select c.id, c.name::text, c.code::text, u.email::text,
           (select count(*) from public.class_members m where m.class_id = c.id),
           c.is_admin, c.created_at::timestamptz
      from public.classes c
      left join auth.users u on u.id = c.teacher_id
     where q is null or c.name ilike '%' || q || '%' or c.code ilike '%' || q || '%'
                     or u.email ilike '%' || q || '%'
     order by c.is_admin desc, c.created_at desc
     limit 80;
end;
$$;
revoke execute on function public.ultra_list_classes(uuid, text) from public, anon;
grant  execute on function public.ultra_list_classes(uuid, text) to authenticated;

create or replace function public.ultra_set_admin_class(p_token uuid, p_class uuid, p_on boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.admin_scope_of(p_token) is distinct from 'ultra' then
    raise exception 'not authorised' using errcode = '42501';
  end if;
  update public.classes c set is_admin = coalesce(p_on, false) where c.id = p_class;
  if not found then
    raise exception 'no such class' using errcode = 'P0002';
  end if;
  insert into public.admin_actions (actor, actor_email, action, detail)
  values (auth.uid(), (select u.email from auth.users u where u.id = auth.uid()),
          'admin-class', jsonb_build_object('class', p_class, 'on', coalesce(p_on, false),
                                            'name', (select c.name from public.classes c where c.id = p_class)));
  return coalesce(p_on, false);
end;
$$;
revoke execute on function public.ultra_set_admin_class(uuid, uuid, boolean) from public, anon;
grant  execute on function public.ultra_set_admin_class(uuid, uuid, boolean) to authenticated;

/* ================================================================
   PART 2 — more than one teacher
   ================================================================ */


do $$
declare
  fn   oid;
  n    int;
  def  text;
  args text;
  ret  text;
begin
  select count(*) into n
    from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'private' and p.proname = 'is_class_teacher';
  if n <> 1 then
    raise exception 'expected exactly one private.is_class_teacher, found %', n;
  end if;
  select p.oid into fn
    from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'private' and p.proname = 'is_class_teacher';

  args := pg_get_function_identity_arguments(fn);
  ret  := pg_get_function_result(fn);

  /* Copy the original exactly, once. A second run finds the copy and
     leaves it, so the wrapper below is never copied over it. */
  if not exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
                  where s.nspname = 'private' and p.proname = 'is_class_owner') then
    def := regexp_replace(pg_get_functiondef(fn),
                          'FUNCTION private\.is_class_teacher\(', 'FUNCTION private.is_class_owner(');
    execute def;
  end if;

  execute format($f$
    create or replace function private.is_class_teacher(%s)
    returns %s
    language sql
    stable
    security definer
    set search_path = ''
    as $b$
      select coalesce(private.is_class_owner($1), false)
          or exists (select 1 from public.class_teachers t
                      where t.class_id = $1 and t.teacher_id = (select auth.uid()))
    $b$
  $f$, args, ret);
end;
$$;

create or replace function public.app_teaches(p_class uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.classes c where c.id = p_class and c.teacher_id = auth.uid())
      or exists (select 1 from public.class_teachers t where t.class_id = p_class and t.teacher_id = auth.uid())
$$;
revoke execute on function public.app_teaches(uuid) from public, anon, authenticated;

/* Every class the caller teaches, owned or shared. `owned` matters to
   the client: only an owned row may be adopted by a local class that
   has lost its id, so a new class never attaches to somebody else's. */
create or replace function public.my_teaching_classes()
returns table (id uuid, code text, name text, created_at timestamptz, owned boolean, is_admin boolean)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.code::text, c.name::text, c.created_at::timestamptz, true, c.is_admin
    from public.classes c
   where c.teacher_id = auth.uid()
  union all
  select c.id, c.code::text, c.name::text, c.created_at::timestamptz, false, c.is_admin
    from public.class_teachers t
    join public.classes c on c.id = t.class_id
   where t.teacher_id = auth.uid() and c.teacher_id is distinct from auth.uid()
   order by 4
$$;
revoke execute on function public.my_teaching_classes() from public, anon;
grant  execute on function public.my_teaching_classes() to authenticated;

create or replace function public.class_teachers_list(p_class uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.app_teaches(p_class) then
    raise exception 'not authorised' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', x.uid, 'owner', x.owner, 'email', u.email,
             'name', coalesce(nullif(pr.save::jsonb -> 'profile' ->> 'displayName', ''), pr.display_name, u.email))
           order by x.owner desc, x.t_at)
      from (select c.teacher_id as uid, true as owner, c.created_at::timestamptz as t_at
              from public.classes c where c.id = p_class
            union all
            select t.teacher_id, false, t.created_at
              from public.class_teachers t where t.class_id = p_class) x
      left join auth.users u on u.id = x.uid
      left join public.profiles pr on pr.id = x.uid), '[]'::jsonb);
end;
$$;
revoke execute on function public.class_teachers_list(uuid) from public, anon;
grant  execute on function public.class_teachers_list(uuid) to authenticated;

create or replace function public.class_add_teacher(p_class uuid, p_email text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid;
  owner_id uuid;
begin
  if not public.app_teaches(p_class) then
    raise exception 'not authorised' using errcode = '42501';
  end if;
  select u.id into uid from auth.users u where lower(u.email) = lower(btrim(coalesce(p_email, '')));
  if uid is null then
    raise exception 'No LearnGeo account uses that email' using errcode = 'P0002';
  end if;
  select c.teacher_id into owner_id from public.classes c where c.id = p_class;
  if uid = owner_id then
    raise exception 'That teacher already owns this class' using errcode = '23505';
  end if;
  insert into public.class_teachers (class_id, teacher_id, added_by)
  values (p_class, uid, auth.uid())
  on conflict do nothing;
  return true;
end;
$$;
revoke execute on function public.class_add_teacher(uuid, text) from public, anon;
grant  execute on function public.class_add_teacher(uuid, text) to authenticated;

/* The owner can remove any co-teacher; a co-teacher can remove only
   themselves. Nobody can remove the owner, who is not in this table. */
create or replace function public.class_remove_teacher(p_class uuid, p_teacher uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (exists (select 1 from public.classes c where c.id = p_class and c.teacher_id = auth.uid())
          or p_teacher = auth.uid()) then
    raise exception 'not authorised' using errcode = '42501';
  end if;
  delete from public.class_teachers t where t.class_id = p_class and t.teacher_id = p_teacher;
  return true;
end;
$$;
revoke execute on function public.class_remove_teacher(uuid, uuid) from public, anon;
grant  execute on function public.class_remove_teacher(uuid, uuid) to authenticated;

/* ================================================================
   PART 3 — who is in the class, with their real profiles
   ================================================================ */

/* One person's public profile. Callable only by the functions here,
   never by a client: given any user id it would answer anybody. */
create or replace function public.app_public_profile(p_user uuid, p_class_name text,
                                                     p_owner boolean, p_admin_class boolean)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', q.uid,
    'owner', p_owner,
    'class_name', p_class_name,
    'name', coalesce(nullif(pr.save::jsonb -> 'profile' ->> 'displayName', ''), pr.display_name, p_class_name, 'Explorer'),
    'profile', coalesce((select jsonb_object_agg(e.k, e.v)
                           from jsonb_each(case when jsonb_typeof(pr.save::jsonb -> 'profile') = 'object'
                                                then pr.save::jsonb -> 'profile' else '{}'::jsonb end) as e(k, v)
                          where e.k in ('displayName', 'pronouns', 'about', 'avatar', 'decoration', 'effect',
                                        'nameplate', 'banner', 'theme', 'status', 'verified', 'badgeSlots')),
                        '{}'::jsonb),
    'badges', case when jsonb_typeof(pr.save::jsonb -> 'badges') = 'array' then pr.save::jsonb -> 'badges' else '[]'::jsonb end,
    'level', public.app_save_int(pr.save::jsonb, 'level', 1),
    'answered', case when pr.save::jsonb -> 'stats' ->> 'answered' ~ '^[0-9]{1,9}$'
                     then (pr.save::jsonb -> 'stats' ->> 'answered')::int else 0 end,
    'correct',  case when pr.save::jsonb -> 'stats' ->> 'correct' ~ '^[0-9]{1,9}$'
                     then (pr.save::jsonb -> 'stats' ->> 'correct')::int else 0 end,
    'mastered', (select count(*) from jsonb_each(case when jsonb_typeof(pr.save::jsonb -> 'mastery') = 'object'
                                                      then pr.save::jsonb -> 'mastery' else '{}'::jsonb end) as m(k, v)
                  where m.v ->> 'box' ~ '^[0-9]{1,3}$' and (m.v ->> 'box')::int >= 4),
    'admin', case when p_admin_class then exists (
               select 1 from public.admin_allow a join auth.users u on lower(u.email) = lower(a.email)
                where u.id = q.uid) else false end
  )
  from (select p_user as uid) q
  left join public.profiles pr on pr.id = q.uid
$$;
revoke execute on function public.app_public_profile(uuid, text, boolean, boolean) from public, anon, authenticated;

create or replace function public.class_roster(p_class uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me  uuid := auth.uid();
  adm boolean;
begin
  if me is null then
    return null;
  end if;
  select c.is_admin into adm from public.classes c where c.id = p_class;
  if not found then
    return null;
  end if;
  if not (exists (select 1 from public.class_members m where m.class_id = p_class and m.student_id = me)
          or public.app_teaches(p_class)) then
    return null;
  end if;

  return jsonb_build_object(
    'is_admin', coalesce(adm, false),
    'teachers', coalesce((
       select jsonb_agg(public.app_public_profile(x.uid, null, x.owner, coalesce(adm, false)) order by x.owner desc, x.t_at)
         from (select c.teacher_id as uid, true as owner, c.created_at::timestamptz as t_at
                 from public.classes c where c.id = p_class
               union all
               select t.teacher_id, false, t.created_at
                 from public.class_teachers t where t.class_id = p_class) x), '[]'::jsonb),
    'students', coalesce((
       select jsonb_agg(public.app_public_profile(m.student_id, m.display_name, false, coalesce(adm, false))
                        order by m.joined_at)
         from public.class_members m
        where m.class_id = p_class and m.student_id is not null), '[]'::jsonb)
  );
end;
$$;
revoke execute on function public.class_roster(uuid) from public, anon;
grant  execute on function public.class_roster(uuid) to authenticated;
