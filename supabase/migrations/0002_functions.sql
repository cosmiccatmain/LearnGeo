/* ------------------------------------------------------------------
   LearnGeo classroom — functions.

   Two groups:

   1. app.*  authorisation helpers. These are SECURITY DEFINER on
      purpose: they read a table without evaluating that table's own
      policies, which is what breaks the mutual recursion between the
      classes and class_members policies in 0003.

   2. public.*  the RPCs the client calls. Students get no INSERT
      policy on submissions at all, so submit_assignment is the only
      way a score can exist, and it derives the counts itself.

   Every SECURITY DEFINER function pins search_path = ''. Without it
   the security advisor flags them and they are genuinely hijackable,
   so every reference below is schema-qualified.
-------------------------------------------------------------------*/

/* ====================== authorisation helpers ===================== */

create or replace function app.is_class_owner(p_class uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.classes c
     where c.id = p_class and c.owner_id = (select auth.uid())
  );
$$;

/* Approved seats only. This is the one that gates assignments and work. */
create or replace function app.my_class_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select m.class_id from public.class_members m
   where m.user_id = (select auth.uid()) and m.status = 'joined';
$$;

/* Any live seat, approved or still waiting. Used by the classes policy
   and nowhere else, so a student on the waiting screen can see the
   name of the class they asked to join without being able to see a
   single piece of its work. */
create or replace function app.my_seat_class_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select m.class_id from public.class_members m
   where m.user_id = (select auth.uid())
     and m.status in ('pending','joined');
$$;

create or replace function app.can_read_submission(p_sub uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.submissions s
     where s.id = p_sub
       and ( s.user_id = (select auth.uid())
             or exists (select 1 from public.classes c
                         where c.id = s.class_id
                           and c.owner_id = (select auth.uid())) )
  );
$$;

/* ============================ class codes ========================= */
/* Same alphabet as the old client-side generator, but checked against
   the table, so two teachers can no longer mint the same code. */
create or replace function app.gen_class_code()
returns text language plpgsql security definer set search_path = '' as $$
declare
  abc constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  i integer;
begin
  for attempt in 1..40 loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(abc, 1 + floor(random() * length(abc))::integer, 1);
    end loop;
    if not exists (select 1 from public.classes c where c.code = v_code) then
      return v_code;
    end if;
  end loop;
  raise exception 'could not allocate a unique class code';
end;
$$;

/* ============================ create_class =======================
   The only thing in the system that sets role = 'teacher'. You become
   a teacher by doing something, never by claiming to be one.
------------------------------------------------------------------ */
create or replace function public.create_class(p_name text)
returns public.classes language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := (select auth.uid());
  v_name text := left(btrim(coalesce(p_name, '')), 60);
  v_row  public.classes;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if v_name = '' then v_name := 'My class'; end if;

  insert into public.classes (owner_id, name, code)
  values (v_uid, v_name, app.gen_class_code())
  returning * into v_row;

  update public.profiles set role = 'teacher' where id = v_uid;
  return v_row;
end;
$$;

/* =========================== class_preview =======================
   What a student sees after typing a class code and before asking to
   join: the class name, the domains it accepts, and the seats the
   teacher has already typed but nobody has claimed. Deliberately
   never exposes joined students — a student cannot list classmates.
------------------------------------------------------------------ */
create or replace function public.class_preview(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_class public.classes;
  v_seats jsonb;
begin
  select * into v_class from public.classes
   where code = upper(btrim(coalesce(p_code, '')))
     and archived_at is null
     and join_open;
  if not found then
    raise exception 'no open class with that code' using errcode = 'P0002';
  end if;

  select coalesce(
           jsonb_agg(jsonb_build_object('id', m.id, 'name', m.display_name)
                     order by m.display_name),
           '[]'::jsonb)
    into v_seats
    from public.class_members m
   where m.class_id = v_class.id
     and m.user_id is null
     and m.status = 'invited';

  return jsonb_build_object(
    'class_id', v_class.id,
    'name', v_class.name,
    'allowed_email_domains', v_class.allowed_email_domains,
    'seats', v_seats
  );
end;
$$;

/* ============================ request_join =======================
   For a student who already has a session: a solo learner joining
   their first class, or a student joining a second one. The
   passwordless signup path does not come through here — it has no
   session at all and goes through the join-request Edge Function.

   Either way the result is a `pending` seat. Nothing here can make
   a seat `joined`; only a teacher can, through approve-enrollment.
------------------------------------------------------------------ */
create or replace function public.request_join(
  p_code text, p_member uuid default null, p_name text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := (select auth.uid());
  v_class  public.classes;
  v_member public.class_members;
  v_email  text;
  v_name   text;
  v_domain text;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  select * into v_class from public.classes
   where code = upper(btrim(coalesce(p_code, '')))
     and archived_at is null
     and join_open;
  if not found then
    raise exception 'no open class with that code' using errcode = 'P0002';
  end if;

  /* already known to this class? say so rather than making a second seat */
  select * into v_member from public.class_members
   where class_id = v_class.id and user_id = v_uid;
  if found then
    return jsonb_build_object('class_id', v_class.id,
                              'class_name', v_class.name,
                              'member_id', v_member.id,
                              'status', v_member.status);
  end if;

  select u.email into v_email from auth.users u where u.id = v_uid;
  v_domain := lower(split_part(coalesce(v_email, ''), '@', 2));

  if array_length(v_class.allowed_email_domains, 1) is not null then
    if not exists (
      select 1 from unnest(v_class.allowed_email_domains) d
       where lower(d) = v_domain
    ) then
      raise exception 'that email address is not accepted by this class'
        using errcode = '42501';
    end if;
  end if;

  v_name := left(btrim(coalesce(
              nullif(btrim(coalesce(p_name, '')), ''),
              (select p.display_name from public.profiles p where p.id = v_uid),
              'Student')), 60);

  if p_member is not null then
    /* claiming a seat the teacher typed */
    update public.class_members
       set user_id = v_uid, email = v_email,
           status = 'pending', requested_at = now()
     where id = p_member
       and class_id = v_class.id
       and user_id is null
       and status = 'invited'
     returning * into v_member;
    if not found then
      raise exception 'that name has already been taken' using errcode = '23505';
    end if;
  else
    insert into public.class_members
      (class_id, user_id, display_name, email, status, requested_at)
    values (v_class.id, v_uid, v_name, v_email, 'pending', now())
    returning * into v_member;
  end if;

  return jsonb_build_object('class_id', v_class.id,
                            'class_name', v_class.name,
                            'member_id', v_member.id,
                            'status', 'pending');
end;
$$;

/* ========================== submit_assignment ====================
   The only write path to submissions. The client sends what it asked
   and what the student answered; the counts are derived here. That
   removes the forged-percentage hole the old LGR- codes had.

   It does not stop a determined student from posting correct:true for
   every answer. Fixing that needs server-side question generation,
   which is out of scope. Say so in the README rather than overclaim.
------------------------------------------------------------------ */
create or replace function public.submit_assignment(
  p_assignment uuid, p_answers jsonb, p_elapsed integer default null)
returns public.submissions language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := (select auth.uid());
  v_a      public.assignments;
  v_m      public.class_members;
  v_s      public.submissions;
  v_total  integer;
  v_ok     integer;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  select * into v_a from public.assignments
   where id = p_assignment and status = 'published';
  if not found then
    raise exception 'no such assignment' using errcode = 'P0002';
  end if;

  select * into v_m from public.class_members
   where class_id = v_a.class_id and user_id = v_uid and status = 'joined';
  if not found then
    raise exception 'not a member of that class' using errcode = '42501';
  end if;

  if jsonb_typeof(p_answers) is distinct from 'array' then
    raise exception 'answers must be a json array' using errcode = '22023';
  end if;

  v_total := jsonb_array_length(p_answers);
  if v_total > 400 then
    raise exception 'too many answers' using errcode = '22023';
  end if;

  select count(*) filter (where e ->> 'correct' = 'true')
    into v_ok
    from jsonb_array_elements(p_answers) e;

  insert into public.submissions
    (assignment_id, class_id, member_id, user_id,
     correct_count, total_count, elapsed_sec, source)
  values (v_a.id, v_a.class_id, v_m.id, v_uid,
          coalesce(v_ok, 0), v_total,
          case when p_elapsed is null then null else greatest(0, p_elapsed) end,
          'app')
  returning * into v_s;

  insert into public.submission_answers
    (submission_id, position, country_name, question_type, correct, given)
  select v_s.id,
         t.ord::integer,
         left(coalesce(t.e ->> 'country', '?'), 80),
         case when t.e ->> 'type' in ('capital','country','locate','identify','card')
              then t.e ->> 'type' else 'unknown' end,
         coalesce(t.e ->> 'correct' = 'true', false),
         left(nullif(t.e ->> 'given', ''), 80)
    from jsonb_array_elements(p_answers) with ordinality as t(e, ord);

  return v_s;
end;
$$;

/* ============================== analytics ========================
   Owner-checked rollups. These exist as functions rather than views
   because the teacher dashboard wants them aggregated server-side,
   and because the check belongs next to the query.
------------------------------------------------------------------ */
create or replace function public.class_hardest(p_class uuid, p_limit integer default 8)
returns table (country text, miss_count bigint)
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_class_owner(p_class) then
    raise exception 'not your class' using errcode = '42501';
  end if;
  return query
    select sa.country_name, count(*)::bigint
      from public.submission_answers sa
      join public.submissions s on s.id = sa.submission_id
     where s.class_id = p_class and sa.correct = false
     group by sa.country_name
     order by count(*) desc, sa.country_name
     limit greatest(1, least(coalesce(p_limit, 8), 50));
end;
$$;

create or replace function public.class_gradebook(p_class uuid)
returns table (
  member_id     uuid,
  member_name   text,
  member_status text,
  assignment_id uuid,
  best_pct      integer,
  last_pct      integer,
  last_at       timestamptz,
  attempts      bigint
)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not app.is_class_owner(p_class) then
    raise exception 'not your class' using errcode = '42501';
  end if;
  return query
    select m.id, m.display_name, m.status, a.id,
           agg.best_pct, agg.last_pct, agg.last_at, coalesce(agg.attempts, 0)
      from public.class_members m
      cross join public.assignments a
      left join lateral (
        select max(s.score_pct)                                         as best_pct,
               (array_agg(s.score_pct order by s.submitted_at desc))[1] as last_pct,
               max(s.submitted_at)                                      as last_at,
               count(*)                                                 as attempts
          from public.submissions s
         where s.member_id = m.id and s.assignment_id = a.id
      ) agg on true
     where m.class_id = p_class and m.status <> 'removed'
       and a.class_id = p_class and a.status = 'published';
end;
$$;

/* ===================== service-role only helper ==================
   PostgREST does not expose the auth schema, so the join-request
   Edge Function cannot look a student up by email without this.
   Granted to service_role and nobody else.
------------------------------------------------------------------ */
create or replace function public.user_id_by_email(p_email text)
returns uuid language sql stable security definer set search_path = '' as $$
  select u.id from auth.users u
   where lower(u.email) = lower(btrim(coalesce(p_email, '')))
   limit 1;
$$;

/* ================================ grants =========================
   EXECUTE on functions in public defaults to PUBLIC, which would
   hand anon every RPC above. Revoke, then grant back by name.
   Any function added later needs the same treatment.
------------------------------------------------------------------ */
revoke execute on all functions in schema public from public, anon;

grant execute on function public.create_class(text)                        to authenticated;
grant execute on function public.class_preview(text)                       to authenticated;
grant execute on function public.request_join(text, uuid, text)            to authenticated;
grant execute on function public.submit_assignment(uuid, jsonb, integer)   to authenticated;
grant execute on function public.class_hardest(uuid, integer)              to authenticated;
grant execute on function public.class_gradebook(uuid)                     to authenticated;

grant execute on function public.user_id_by_email(text)                    to service_role;

/* The blanket revoke above also stripped handle_new_user, which the
   auth service calls when a user signs up. Hand it back, but only if
   that role exists — a plain Postgres restore of this file will not
   have it, and the migration should still apply there. */
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant execute on function public.handle_new_user() to supabase_auth_admin;
  end if;
end;
$$;
