/* ------------------------------------------------------------------
   LearnGeo classroom — row level security.

   The whole authorisation model in one sentence: a teacher can reach
   exactly the classes where classes.owner_id = auth.uid(), and a
   student can reach exactly the classes where they hold a `joined`
   seat. Nothing keys off profiles.role.

   That is deliberate. In the old app anyone could become a teacher by
   clicking a button on the landing page. They still can — and it now
   gets them an empty view of their own zero classes, which is the
   correct amount of power for an unverified claim.

   Two things to keep in mind when editing this file:

   1. Recursion. A classes policy that reads class_members while the
      class_members policy reads classes gives you
      "infinite recursion detected in policy for relation classes".
      Both directions are broken by the app.* helpers from 0002, which
      are SECURITY DEFINER and so read the other table without
      evaluating its policies. Do not inline those subqueries.

   2. Per-row evaluation. Every helper call is wrapped as
      (select app.is_class_owner(...)) so Postgres builds an initPlan
      and runs it once per statement instead of once per row. Dropping
      the wrapper is the difference between milliseconds and seconds
      on a class-sized table.

   Every policy names `to authenticated`, so anon short-circuits
   before the expression is evaluated at all.
-------------------------------------------------------------------*/

alter table public.profiles           enable row level security;
alter table public.classes            enable row level security;
alter table public.class_members      enable row level security;
alter table public.assignments        enable row level security;
alter table public.submissions        enable row level security;
alter table public.submission_answers enable row level security;

/* ============================== profiles ==========================
   Your own row, and only ever your own. A teacher never reads a
   student profile: the gradebook name and email live on
   class_members, so there is nothing here they need.
------------------------------------------------------------------ */
create policy profiles_self_read on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

create policy profiles_self_write on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

/* No insert policy: the on_auth_user_created trigger creates the row.
   No delete policy: profiles go when the auth user goes. */

/* =============================== classes ==========================
   Owner does everything. A joined student can read the class they are
   in, which is what puts its name on their Classroom banner.

   There is no policy that permits changing owner_id, so ownership is
   immutable once set.
------------------------------------------------------------------ */
create policy classes_read on public.classes
  for select to authenticated
  using ( (select auth.uid()) = owner_id
          or id in (select app.my_seat_class_ids()) );

create policy classes_insert on public.classes
  for insert to authenticated
  with check ((select auth.uid()) = owner_id);

create policy classes_update on public.classes
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy classes_delete on public.classes
  for delete to authenticated
  using ((select auth.uid()) = owner_id);

/* ============================ class_members =======================
   You see your own seat. The owner sees every seat. A student cannot
   list their classmates, which is the whole reason this is not a
   simple "members of my classes" policy.

   Students get no INSERT and no UPDATE. Asking to join goes through
   request_join (or the join-request Edge Function), and approving a
   request is the teacher's UPDATE — so nobody can approve themselves.
------------------------------------------------------------------ */
create policy members_read on public.class_members
  for select to authenticated
  using ( user_id = (select auth.uid())
          or (select app.is_class_owner(class_id)) );

create policy members_teacher_write on public.class_members
  for all to authenticated
  using ((select app.is_class_owner(class_id)))
  with check ((select app.is_class_owner(class_id)));

/* ============================= assignments ========================
   The owner sees drafts too. A joined student sees published work in
   their own classes and nothing else.
------------------------------------------------------------------ */
create policy assignments_read on public.assignments
  for select to authenticated
  using ( (select app.is_class_owner(class_id))
          or ( status = 'published'
               and class_id in (select app.my_class_ids()) ) );

create policy assignments_teacher_write on public.assignments
  for all to authenticated
  using ((select app.is_class_owner(class_id)))
  with check ((select app.is_class_owner(class_id)));

/* ============================== submissions =======================
   Read your own, or any in a class you own.

   Note what is missing: students have no INSERT and no UPDATE here.
   submit_assignment is SECURITY DEFINER and is the only way a row
   gets created from the student side. A teacher can still write
   directly, which is what manual score entry uses.
------------------------------------------------------------------ */
create policy submissions_read on public.submissions
  for select to authenticated
  using ( user_id = (select auth.uid())
          or (select app.is_class_owner(class_id)) );

create policy submissions_teacher_write on public.submissions
  for all to authenticated
  using ((select app.is_class_owner(class_id)))
  with check ((select app.is_class_owner(class_id)));

/* =========================== submission_answers ===================
   Reachable exactly when the parent submission is. Same definer
   helper rather than a join, for the same two reasons as above.
------------------------------------------------------------------ */
create policy answers_read on public.submission_answers
  for select to authenticated
  using ((select app.can_read_submission(submission_id)));

create policy answers_teacher_write on public.submission_answers
  for all to authenticated
  using ((select app.can_read_submission(submission_id)))
  with check ((select app.can_read_submission(submission_id)));

/* anon gets no policy on any table, so it reads nothing anywhere.
   A signed-out visitor still gets the whole solo app: study progress
   never leaves localStorage. */
