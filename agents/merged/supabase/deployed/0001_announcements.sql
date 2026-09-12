/* ------------------------------------------------------------------
   LearnGeo — class announcements (the Stream tab).

   Runs against the schema the app actually talks to: classes with a
   teacher_id, and the two authorisation helpers in the private schema.
   See ../README.md for why this is not in ../migrations.

   A teacher writes, the class reads. Nothing here lets a student post,
   so the Stream is the teacher's voice and cannot be talked over.
-------------------------------------------------------------------*/

create table if not exists public.announcements (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid not null references public.classes(id) on delete cascade,
  body       text not null check (char_length(btrim(body)) between 1 and 2000),
  pinned     boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

/* Pinned first, then newest, which is the order the Stream renders in. */
create index if not exists announcements_class_idx
  on public.announcements (class_id, pinned desc, created_at desc);

drop trigger if exists announcements_touch on public.announcements;
create trigger announcements_touch before update on public.announcements
  for each row execute function private.touch_updated_at();

alter table public.announcements enable row level security;

/* Same shape as the assignments policies: the teacher who owns the class
   writes, the teacher and the students who joined read. */
drop policy if exists "announcements: class reads"     on public.announcements;
drop policy if exists "announcements: teacher posts"   on public.announcements;
drop policy if exists "announcements: teacher edits"   on public.announcements;
drop policy if exists "announcements: teacher deletes" on public.announcements;

create policy "announcements: class reads" on public.announcements
  for select to authenticated
  using (private.is_class_teacher(class_id) or private.is_class_member(class_id));

create policy "announcements: teacher posts" on public.announcements
  for insert to authenticated
  with check (private.is_class_teacher(class_id));

/* UPDATE is what pinning uses. */
create policy "announcements: teacher edits" on public.announcements
  for update to authenticated
  using (private.is_class_teacher(class_id))
  with check (private.is_class_teacher(class_id));

create policy "announcements: teacher deletes" on public.announcements
  for delete to authenticated
  using (private.is_class_teacher(class_id));
