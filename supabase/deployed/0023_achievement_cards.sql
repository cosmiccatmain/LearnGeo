/* ------------------------------------------------------------------
   0023: Achievement cards — school-safe send by gamertag (LEA-64).

   Kids flip through credit-card-style achievement cards and can send
   an unlocked card to a classmate by gamertag (no money, no email).
   Accepting adds the card to the friend’s received tray; it does NOT
   unlock the achievement or award diamonds on their save.

   Uses private.pvp_tag from 0014. Authenticated-only like Games PvP
   (0019). Safe to run twice. Apply after 0014 / 0019.
-------------------------------------------------------------------*/

begin;

/* ============================== tables ============================ */
create table if not exists public.achievement_card_sends (
  id              uuid primary key default gen_random_uuid(),
  from_device     text not null references public.gamertags(device_id) on delete cascade,
  to_device       text not null references public.gamertags(device_id) on delete cascade,
  achievement_id  text not null
                  check (achievement_id ~ '^[a-z0-9-]{2,40}$'),
  status          text not null default 'pending'
                  check (status in ('pending','accepted','declined','cancelled','expired')),
  created_at      timestamptz not null default now(),
  responded_at    timestamptz,
  check (from_device <> to_device)
);
create index if not exists ach_card_sends_to_pending
  on public.achievement_card_sends (to_device, created_at desc)
  where status = 'pending';
create index if not exists ach_card_sends_from_pending
  on public.achievement_card_sends (from_device, created_at desc)
  where status = 'pending';
create index if not exists ach_card_sends_received
  on public.achievement_card_sends (to_device, responded_at desc)
  where status = 'accepted';

alter table public.achievement_card_sends enable row level security;
revoke all on public.achievement_card_sends from anon, authenticated;

/* Known diamond-achievement ids (cosmetics.js ACHIEVEMENTS). */
create or replace function private.ach_card_id_ok(p text)
returns boolean
language sql
immutable
as $$
  select p in (
    'first-steps','streak-10','streak-25','perfect-test','test-5',
    'cards-100','region-master','level-10','answers-500','globetrotter'
  );
$$;

create or replace function private.ach_card_expire_stale()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.achievement_card_sends
     set status = 'expired', responded_at = now()
   where status = 'pending'
     and created_at < now() - interval '7 days';
end;
$$;

/* =========================== send card ============================ */
create or replace function public.ach_card_send(
  p_device text,
  p_to_tag text,
  p_achievement_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me text;
  them text;
  their_tag text;
  pending_n integer;
  send_id uuid;
begin
  perform private.ach_card_expire_stale();
  if p_device is null or char_length(p_device) not between 8 and 64 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if p_to_tag is null or p_to_tag !~ '^[A-Za-z0-9_]{3,16}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_tag');
  end if;
  if not private.ach_card_id_ok(p_achievement_id) then
    return jsonb_build_object('ok', false, 'error', 'invalid_card');
  end if;

  select g.device_id into me from public.gamertags g where g.device_id = p_device;
  if me is null then return jsonb_build_object('ok', false, 'error', 'no_gamertag'); end if;

  select g.device_id, g.gamertag into them, their_tag
    from public.gamertags g where g.tag_key = lower(p_to_tag);
  if them is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if them = me then return jsonb_build_object('ok', false, 'error', 'self'); end if;

  select count(*) into pending_n
    from public.achievement_card_sends s
   where s.from_device = me and s.status = 'pending';
  if pending_n >= 8 then
    return jsonb_build_object('ok', false, 'error', 'too_many');
  end if;

  if exists (
    select 1 from public.achievement_card_sends s
     where s.status = 'pending'
       and s.from_device = me and s.to_device = them
       and s.achievement_id = p_achievement_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'already_pending');
  end if;

  insert into public.achievement_card_sends (from_device, to_device, achievement_id)
  values (me, them, p_achievement_id)
  returning id into send_id;

  return jsonb_build_object(
    'ok', true,
    'send_id', send_id,
    'to_tag', their_tag,
    'achievement_id', p_achievement_id
  );
end;
$$;

/* =========================== list inbox =========================== */
create or replace function public.ach_card_list_inbox(p_device text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me text;
  incoming jsonb;
  outgoing jsonb;
  received jsonb;
begin
  perform private.ach_card_expire_stale();
  if p_device is null or char_length(p_device) not between 8 and 64 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  select g.device_id into me from public.gamertags g where g.device_id = p_device;
  if me is null then
    return jsonb_build_object(
      'ok', true,
      'incoming', '[]'::jsonb,
      'outgoing', '[]'::jsonb,
      'received', '[]'::jsonb
    );
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id,
           'from_tag', private.pvp_tag(s.from_device),
           'achievement_id', s.achievement_id,
           'created_at', s.created_at
         ) order by s.created_at desc), '[]'::jsonb)
    into incoming
    from public.achievement_card_sends s
   where s.to_device = me and s.status = 'pending';

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id,
           'to_tag', private.pvp_tag(s.to_device),
           'achievement_id', s.achievement_id,
           'created_at', s.created_at
         ) order by s.created_at desc), '[]'::jsonb)
    into outgoing
    from public.achievement_card_sends s
   where s.from_device = me and s.status = 'pending';

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id,
           'from_tag', private.pvp_tag(s.from_device),
           'achievement_id', s.achievement_id,
           'received_at', s.responded_at
         ) order by s.responded_at desc), '[]'::jsonb)
    into received
    from public.achievement_card_sends s
   where s.to_device = me and s.status = 'accepted';

  return jsonb_build_object(
    'ok', true,
    'incoming', incoming,
    'outgoing', outgoing,
    'received', received
  );
end;
$$;

/* =========================== cancel send ========================== */
create or replace function public.ach_card_cancel(p_device text, p_send uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me text;
begin
  if p_device is null or p_send is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  select g.device_id into me from public.gamertags g where g.device_id = p_device;
  if me is null then return jsonb_build_object('ok', false, 'error', 'no_gamertag'); end if;

  update public.achievement_card_sends s
     set status = 'cancelled', responded_at = now()
   where s.id = p_send
     and s.from_device = me
     and s.status = 'pending';
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

/* =========================== respond ============================== */
create or replace function public.ach_card_respond(
  p_device text,
  p_send uuid,
  p_accept boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me text;
  r public.achievement_card_sends%rowtype;
begin
  perform private.ach_card_expire_stale();
  if p_device is null or p_send is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  select g.device_id into me from public.gamertags g where g.device_id = p_device;
  if me is null then return jsonb_build_object('ok', false, 'error', 'no_gamertag'); end if;

  select * into r from public.achievement_card_sends s
   where s.id = p_send and s.to_device = me and s.status = 'pending'
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  update public.achievement_card_sends
     set status = case when p_accept then 'accepted' else 'declined' end,
         responded_at = now()
   where id = r.id;

  return jsonb_build_object(
    'ok', true,
    'status', case when p_accept then 'accepted' else 'declined' end,
    'achievement_id', r.achievement_id,
    'from_tag', private.pvp_tag(r.from_device)
  );
end;
$$;

/* ============================== grants ============================ */
revoke all on function public.ach_card_send(text, text, text) from public, anon;
revoke all on function public.ach_card_list_inbox(text) from public, anon;
revoke all on function public.ach_card_cancel(text, uuid) from public, anon;
revoke all on function public.ach_card_respond(text, uuid, boolean) from public, anon;

grant execute on function public.ach_card_send(text, text, text) to authenticated;
grant execute on function public.ach_card_list_inbox(text) to authenticated;
grant execute on function public.ach_card_cancel(text, uuid) to authenticated;
grant execute on function public.ach_card_respond(text, uuid, boolean) to authenticated;

commit;
