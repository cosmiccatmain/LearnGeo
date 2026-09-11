/* ------------------------------------------------------------------
   LearnGeo classroom — realtime.

   Two tables, for two things on the teacher's dashboard: the live
   hand-in feed, and the pending-approval badge.

   Changes are RLS-evaluated per subscriber, so the client must always
   subscribe with a class_id filter. An unfiltered subscription makes
   the server evaluate every teacher's policy against every row.
-------------------------------------------------------------------*/

alter publication supabase_realtime add table public.submissions;
alter publication supabase_realtime add table public.class_members;
