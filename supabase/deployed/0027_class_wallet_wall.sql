/* ------------------------------------------------------------------
   0027: Class wallet wall for teachers (LEA-75).

   Teachers (and co-teachers) can see each student’s unlocked achievement
   wallet and a feed of recent unlocks — data view only. No screen
   mirroring, no Daily, no Stripe.

   sync_achievements mirrors the caller’s unlocked id list into
   achievement_unlock_events (insert-only for new ids) so the wall can
   show “recent” without inventing timestamps for old saves.

   class_wallet_wall reads member profiles’ save->achievements plus the
   events feed. Gated by public.app_teaches (owner or co-teacher).

   Uses private.ach_card_id_ok from 0023 and app_teaches from 0010.
   Authenticated-only. Safe to run twice. Apply after 0023 / 0025. Numbered 0027 so LEA-74 seasons can keep 0026.
   MCP apply name: class_wallet_wall_0027.
-------------------------------------------------------------------*/

begin;

/* ============================== tables ============================ */
create table if not exists public.achievement_unlock_events (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null references public.profiles(id) on delete cascade,
  achievement_id  text not null
                  check (achievement_id ~ '^[a-z0-9-]{2,40}$'),
  unlocked_at     timestamptz not null default now(),
  unique (student_id, achievement_id)
);
create index if not exists ach_unlock_events_student
  on public.achievement_unlock_events (student_id, unlocked_at desc);
create index if not exists ach_unlock_events_recent
  on public.achievement_unlock_events (unlocked_at desc);

alter table public.achievement_unlock_events enable row level security;
revoke all on public.achievement_unlock_events from anon, authenticated;

/* ======================== sync achievements ======================= */
/* Same spirit as sync_secrets: the student pushes their unlocked set;
   new ids get an event row. Existing rows are left alone (no fake
   re-timestamps). Returns how many new events were written. */
create or replace function public.sync_achievements(p_ids text[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  clean text[];
  n integer := 0;
begin
  if me is null then
    raise exception 'Sign in first' using errcode = '28000';
  end if;

  select coalesce(array_agg(distinct x order by x), '{}')
    into clean
    from (
      select x from unnest(coalesce(p_ids, '{}')) as x
       where private.ach_card_id_ok(x)
       limit 24
    ) t;

  insert into public.achievement_unlock_events (student_id, achievement_id)
  select me, a
    from unnest(clean) as a
  on conflict (student_id, achievement_id) do nothing;

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.sync_achievements(text[]) from public, anon;
grant execute on function public.sync_achievements(text[]) to authenticated;

/* ======================== class wallet wall ======================= */
create or replace function public.class_wallet_wall(p_class uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  students jsonb;
  feed jsonb;
begin
  if me is null then
    return jsonb_build_object('ok', false, 'error', 'signin');
  end if;
  if p_class is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if not exists (select 1 from public.classes c where c.id = p_class) then
    return jsonb_build_object('ok', false, 'error', 'missing');
  end if;
  if not public.app_teaches(p_class) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  select coalesce(jsonb_agg(row_to_json(s)::jsonb order by s.unlocked_count desc, s.name), '[]'::jsonb)
    into students
    from (
      select m.student_id as id,
             coalesce(
               nullif(m.display_name, ''),
               nullif(pr.save::jsonb -> 'profile' ->> 'displayName', ''),
               pr.display_name,
               'Explorer'
             ) as name,
             coalesce((
               select array_agg(x order by x)
                 from (
                   select jsonb_array_elements_text(
                     case when jsonb_typeof(pr.save::jsonb -> 'achievements') = 'array'
                          then pr.save::jsonb -> 'achievements'
                          else '[]'::jsonb end
                   ) as x
                 ) ids
                where private.ach_card_id_ok(ids.x)
             ), '{}'::text[]) as achievements,
             coalesce((
               select count(*)::int
                 from (
                   select jsonb_array_elements_text(
                     case when jsonb_typeof(pr.save::jsonb -> 'achievements') = 'array'
                          then pr.save::jsonb -> 'achievements'
                          else '[]'::jsonb end
                   ) as x
                 ) ids
                where private.ach_card_id_ok(ids.x)
             ), 0) as unlocked_count
        from public.class_members m
        left join public.profiles pr on pr.id = m.student_id
       where m.class_id = p_class
         and m.student_id is not null
    ) s;

  select coalesce(jsonb_agg(row_to_json(f)::jsonb order by f.unlocked_at desc), '[]'::jsonb)
    into feed
    from (
      select e.student_id,
             coalesce(
               nullif(m.display_name, ''),
               nullif(pr.save::jsonb -> 'profile' ->> 'displayName', ''),
               pr.display_name,
               'Explorer'
             ) as name,
             e.achievement_id,
             e.unlocked_at
        from public.achievement_unlock_events e
        join public.class_members m
          on m.student_id = e.student_id and m.class_id = p_class
        left join public.profiles pr on pr.id = e.student_id
       where private.ach_card_id_ok(e.achievement_id)
       order by e.unlocked_at desc
       limit 40
    ) f;

  return jsonb_build_object(
    'ok', true,
    'students', coalesce(students, '[]'::jsonb),
    'feed', coalesce(feed, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.class_wallet_wall(uuid) from public, anon;
grant execute on function public.class_wallet_wall(uuid) to authenticated;

commit;
