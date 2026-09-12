/* ------------------------------------------------------------------
   LearnGeo classroom — core tables.

   Apply in order: 0001 tables, 0002 functions, 0003 policies,
   0004 realtime. Nothing here grants access on its own; every table
   gets row level security in 0003 and is unreachable until then.

   Solo study (XP, diamonds, mastery, streaks, cosmetics) never touches
   this database. It stays in localStorage, by design.
-------------------------------------------------------------------*/

create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to authenticated, service_role;

/* Shared: keep updated_at honest without the client having to. */
create or replace function app.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

/* ============================== profiles ==========================
   One row per auth user. `role` decides which tabs you see and
   nothing else — every authorisation check in 0003 keys off
   classes.owner_id, never off this column. See 0003 for why.
------------------------------------------------------------------ */
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Explorer'
               check (char_length(display_name) between 1 and 60),
  role         text not null default 'student'
               check (role in ('student','teacher')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger profiles_touch before update on public.profiles
  for each row execute function app.touch_updated_at();

/* Every new auth user gets a profile, including the ones the
   join-request Edge Function creates on a student's behalf. */
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), 'Explorer')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

/* Role is set by an action (create_class), never by a claim. A direct
   PATCH from the browser runs as `authenticated` and is silently
   reverted; a SECURITY DEFINER function runs as the owner and passes. */
create or replace function app.guard_profile_role()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.role is distinct from old.role and current_user = 'authenticated' then
    new.role = old.role;
  end if;
  return new;
end;
$$;

create trigger profiles_guard_role before update on public.profiles
  for each row execute function app.guard_profile_role();

/* =============================== classes ==========================
   `code` is the six characters a student types. The charset matches
   the old client-side generator (no I, O, 0 or 1) and the UNIQUE
   constraint closes the collision hole that generator had.
------------------------------------------------------------------ */
create table public.classes (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid not null references auth.users(id) on delete cascade,
  name                  text not null check (char_length(name) between 1 and 60),
  code                  text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  join_open             boolean not null default true,
  allowed_email_domains text[] not null default '{}',
  archived_at           timestamptz,
  legacy_id             text,        /* old localStorage class code, for the importer */
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index classes_owner_idx on public.classes (owner_id) where archived_at is null;

create trigger classes_touch before update on public.classes
  for each row execute function app.touch_updated_at();

/* ============================ class_members =======================
   A seat in a class. Four states, and each one earns its place:

     invited  a seat the teacher typed. No account behind it. This is
              what lets the localStorage importer land a roster, and
              what a student claims when they request to join.
     pending  a student has asked to join and is waiting. Has user_id.
     joined   approved. Only this state grants any read access.
     removed  kept so their submissions still have a home.

   user_id is nullable so an unclaimed seat can exist, which is why
   the one-seat-per-person index is partial: two unclaimed students
   called Sam are fine, two accounts on one seat are not.
------------------------------------------------------------------ */
create table public.class_members (
  id           uuid primary key default gen_random_uuid(),
  class_id     uuid not null references public.classes(id) on delete cascade,
  user_id      uuid references auth.users(id) on delete set null,
  display_name text not null check (char_length(display_name) between 1 and 60),
  email        text,
  status       text not null default 'invited'
               check (status in ('invited','pending','joined','removed')),
  /* true only when the join-request Edge Function created the auth
     user itself, for a student who signed up with no password. It is
     the only thing that lets a teacher set or reset that student's
     password. Without it, anyone could type a colleague's address
     into a join form and have their own teacher account seize it. */
  provisioned  boolean not null default false,
  requested_at timestamptz,
  claimed_at   timestamptz,
  created_at   timestamptz not null default now()
);

create unique index class_members_one_seat
  on public.class_members (class_id, user_id) where user_id is not null;
create index class_members_class_idx on public.class_members (class_id, status);
create index class_members_user_idx  on public.class_members (user_id);

/* ============================= assignments ========================
   config stays jsonb: it is a four-way union (test uses count/types/
   timed/instant/typed/fill, cards uses face/size, quiz uses length,
   learn uses weakFirst) and the builder already serialises exactly
   this blob. Columns would mean a migration per builder option.
   `mode` is a real column because queries and policies care about it.
------------------------------------------------------------------ */
create table public.assignments (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid not null references public.classes(id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 80),
  mode       text not null check (mode in ('test','learn','cards','quiz')),
  config     jsonb not null default '{}'::jsonb
             check (jsonb_typeof(config) = 'object'),
  status     text not null default 'published'
             check (status in ('draft','published','archived')),
  due_at     timestamptz,
  position   integer not null default 0,
  created_by uuid not null references auth.users(id),
  legacy_id  text,        /* old 'a1lz4k…' assignment id, for the importer */
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index assignments_class_idx
  on public.assignments (class_id, status, created_at desc);
create unique index assignments_legacy_idx
  on public.assignments (class_id, legacy_id) where legacy_id is not null;

create trigger assignments_touch before update on public.assignments
  for each row execute function app.touch_updated_at();

/* ============================== submissions =======================
   class_id is denormalised so RLS and the Realtime filter both work
   without a join. score_pct is generated, so nobody can post a
   percentage that disagrees with the counts.
------------------------------------------------------------------ */
create table public.submissions (
  id            uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  class_id      uuid not null references public.classes(id) on delete cascade,
  member_id     uuid not null references public.class_members(id) on delete cascade,
  user_id       uuid references auth.users(id) on delete set null,
  correct_count integer not null check (correct_count >= 0),
  total_count   integer not null check (total_count >= 0),
  score_pct     integer generated always as (
                  case when total_count > 0
                       then (round((correct_count::numeric * 100) / total_count))::integer
                       else null end
                ) stored,
  source        text not null default 'app'
                check (source in ('app','manual','import')),
  elapsed_sec   integer check (elapsed_sec is null or elapsed_sec >= 0),
  legacy_id     text,
  submitted_at  timestamptz not null default now()
);

create index submissions_class_idx      on public.submissions (class_id, submitted_at desc);
create index submissions_assignment_idx on public.submissions (assignment_id, member_id);
create index submissions_member_idx     on public.submissions (member_id);
create unique index submissions_legacy_idx
  on public.submissions (class_id, legacy_id) where legacy_id is not null;

/* =========================== submission_answers ===================
   One row per question. This is what the old LGR- result code could
   never carry: not just which countries were missed, but which kind
   of question was missed on each. Serves both the class rollup and
   the per-student drill-down from the same rows.
------------------------------------------------------------------ */
create table public.submission_answers (
  id            bigint generated always as identity primary key,
  submission_id uuid not null references public.submissions(id) on delete cascade,
  position      integer not null,
  country_name  text not null,
  question_type text not null
                check (question_type in ('capital','country','locate','identify','card','unknown')),
  correct       boolean not null,
  given         text
);

create index submission_answers_sub_idx  on public.submission_answers (submission_id);
create index submission_answers_miss_idx on public.submission_answers (country_name)
  where correct = false;
