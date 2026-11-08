/* ------------------------------------------------------------------
   0033: Admin-granted Journey chests (LEA-111).

   UltraAdmin can grant one or more Journey path chests to a player
   by account id or gamertag. Grants live in journey_chest_grants so
   the receiver can pick them up instantly via realtime + short poll
   while on Journey — without waiting for a full profiles.save sync.

   Opening uses the existing multi-tap LEA-110 chest overlay on the
   client; claim_journey_chest marks the row opened server-side.

   Safe to run twice. Apply after 0032. No Stripe / mirroring.
-------------------------------------------------------------------*/

begin;

/* ============================== table ============================= */
create table if not exists public.journey_chest_grants (
  id           uuid primary key default gen_random_uuid(),
  target_id    uuid not null references public.profiles(id) on delete cascade,
  unit_id      text,                         /* null = show on any unit */
  status       text not null default 'pending'
               check (status in ('pending', 'opened')),
  granted_by   uuid references auth.users(id) on delete set null,
  granted_by_email text,
  created_at   timestamptz not null default now(),
  opened_at    timestamptz
);

create index if not exists journey_chest_grants_target_pending
  on public.journey_chest_grants (target_id, created_at desc)
  where status = 'pending';

create index if not exists journey_chest_grants_created
  on public.journey_chest_grants (created_at desc);

alter table public.journey_chest_grants enable row level security;
revoke all on public.journey_chest_grants from anon, authenticated;

/* Receivers may SELECT their own rows so realtime postgres_changes
   can deliver INSERTs. Writes stay on security-definer RPCs only. */
drop policy if exists journey_chest_grants_select_own on public.journey_chest_grants;
create policy journey_chest_grants_select_own
  on public.journey_chest_grants
  for select
  to authenticated
  using (target_id = auth.uid());
grant select on public.journey_chest_grants to authenticated;

/* Realtime so Journey can wake immediately when a grant lands. */
do $$
begin
  begin
    alter publication supabase_realtime add table public.journey_chest_grants;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;

/* ======================== resolve by gamertag ===================== */
create or replace function private.profile_id_for_gamertag(p_tag text)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  t text := lower(btrim(coalesce(p_tag, '')));
  uid uuid;
  dev text;
begin
  if t = '' or t !~ '^[a-z0-9_]{3,16}$' then
    return null;
  end if;

  /* Prefer the signed-in profile that last synced this gamertag. */
  select p.id into uid
    from public.profiles p
   where lower(coalesce(p.save->>'gamertag', '')) = t
   order by p.updated_at desc nulls last
   limit 1;
  if uid is not null then return uid; end if;

  /* Fall back: gamertags.device_id → profiles.save.deviceId. */
  select g.device_id into dev
    from public.gamertags g
   where g.tag_key = t
   limit 1;
  if dev is null then return null; end if;

  select p.id into uid
    from public.profiles p
   where coalesce(p.save->>'deviceId', '') = dev
   order by p.updated_at desc nulls last
   limit 1;
  return uid;
end;
$$;

revoke execute on function private.profile_id_for_gamertag(text) from public, anon, authenticated;

/* ======================== admin grant RPC ========================= */
create or replace function public.ultra_grant_journey_chests(
  p_token   uuid,
  p_target  uuid default null,
  p_tag     text default null,
  p_count   integer default 1,
  p_unit_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  who   uuid;
  n     integer := greatest(1, least(coalesce(p_count, 1), 10));
  i     integer;
  ids   uuid[] := '{}';
  new_id uuid;
  t_mail text;
  unit  text := nullif(btrim(coalesce(p_unit_id, '')), '');
  actor_mail text;
begin
  if public.admin_scope_of(p_token) is distinct from 'ultra' then
    raise exception 'not authorised' using errcode = '42501';
  end if;

  who := p_target;
  if who is null and p_tag is not null then
    who := private.profile_id_for_gamertag(p_tag);
  end if;
  if who is null then
    return jsonb_build_object('ok', false, 'error', 'not_found',
      'message', 'No account matched that id or gamertag.');
  end if;

  if not exists (select 1 from public.profiles p where p.id = who) then
    return jsonb_build_object('ok', false, 'error', 'not_found',
      'message', 'No such account.');
  end if;

  /* Optional unit must look like a known Journey unit id. */
  if unit is not null and unit !~ '^[a-z0-9-]{2,40}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_unit');
  end if;

  select u.email into actor_mail from auth.users u where u.id = auth.uid();
  select u.email into t_mail from auth.users u where u.id = who;

  for i in 1..n loop
    insert into public.journey_chest_grants
      (target_id, unit_id, granted_by, granted_by_email)
    values (who, unit, auth.uid(), actor_mail)
    returning id into new_id;
    ids := ids || new_id;
  end loop;

  insert into public.admin_actions (actor, actor_email, target, target_email, action, detail)
  values (
    auth.uid(), actor_mail, who, t_mail, 'journey_chest',
    jsonb_build_object(
      'count', n,
      'unit_id', unit,
      'grant_ids', to_jsonb(ids),
      'tag', nullif(btrim(coalesce(p_tag, '')), '')
    )
  );

  return jsonb_build_object(
    'ok', true,
    'count', n,
    'target_id', who,
    'grant_ids', to_jsonb(ids),
    'unit_id', unit
  );
end;
$$;

revoke execute on function public.ultra_grant_journey_chests(uuid, uuid, text, integer, text)
  from public, anon;
grant  execute on function public.ultra_grant_journey_chests(uuid, uuid, text, integer, text)
  to authenticated;

comment on function public.ultra_grant_journey_chests(uuid, uuid, text, integer, text) is
  'UltraAdmin: grant 1–10 Journey chests to a profile (by id or gamertag). LEA-111.';

/* ======================== receiver list / claim =================== */
create or replace function public.my_journey_chest_grants()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  rows jsonb;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'auth');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', g.id,
           'unit_id', g.unit_id,
           'created_at', g.created_at
         ) order by g.created_at asc), '[]'::jsonb)
    into rows
    from public.journey_chest_grants g
   where g.target_id = uid
     and g.status = 'pending';

  return jsonb_build_object('ok', true, 'grants', rows);
end;
$$;

revoke execute on function public.my_journey_chest_grants() from public, anon;
grant  execute on function public.my_journey_chest_grants() to authenticated;

create or replace function public.claim_journey_chest(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  g   public.journey_chest_grants%rowtype;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'auth');
  end if;
  if p_id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  select * into g from public.journey_chest_grants where id = p_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if g.target_id is distinct from uid then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if g.status = 'opened' then
    return jsonb_build_object('ok', true, 'already', true, 'id', g.id);
  end if;

  update public.journey_chest_grants
     set status = 'opened', opened_at = now()
   where id = g.id;

  return jsonb_build_object('ok', true, 'id', g.id);
end;
$$;

revoke execute on function public.claim_journey_chest(uuid) from public, anon;
grant  execute on function public.claim_journey_chest(uuid) to authenticated;

commit;
