/* ------------------------------------------------------------------
   0025: Achievement wallet share by gamertag (LEA-67).

   Kids can share a snapshot of their unlocked achievement wallet with
   a classmate by gamertag (school-safe; no money). Accepting lets the
   friend flip through those cards in a Friends tray — it does NOT
   unlock achievements or award diamonds on their save.

   Uses private.pvp_tag from 0014 and private.ach_card_id_ok from 0023.
   Authenticated-only like Games PvP (0019). Safe to run twice.
   Apply after 0023.
-------------------------------------------------------------------*/

begin;

/* ============================== tables ============================ */
create table if not exists public.achievement_wallet_shares (
  id              uuid primary key default gen_random_uuid(),
  from_device     text not null references public.gamertags(device_id) on delete cascade,
  to_device       text not null references public.gamertags(device_id) on delete cascade,
  card_ids        text[] not null
                  check (cardinality(card_ids) between 1 and 24),
  status          text not null default 'pending'
                  check (status in ('pending','accepted','declined','cancelled','expired')),
  created_at      timestamptz not null default now(),
  responded_at    timestamptz,
  check (from_device <> to_device)
);
create index if not exists ach_wallet_shares_to_pending
  on public.achievement_wallet_shares (to_device, created_at desc)
  where status = 'pending';
create index if not exists ach_wallet_shares_from_pending
  on public.achievement_wallet_shares (from_device, created_at desc)
  where status = 'pending';
create index if not exists ach_wallet_shares_accepted
  on public.achievement_wallet_shares (to_device, responded_at desc)
  where status = 'accepted';

alter table public.achievement_wallet_shares enable row level security;
revoke all on public.achievement_wallet_shares from anon, authenticated;

create or replace function private.ach_wallet_ids_ok(p text[])
returns boolean
language plpgsql
immutable
as $$
declare
  i integer;
begin
  if p is null or cardinality(p) < 1 or cardinality(p) > 24 then
    return false;
  end if;
  for i in 1 .. cardinality(p) loop
    if not private.ach_card_id_ok(p[i]) then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

create or replace function private.ach_wallet_expire_stale()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.achievement_wallet_shares
     set status = 'expired', responded_at = now()
   where status = 'pending'
     and created_at < now() - interval '7 days';
end;
$$;

/* =========================== share wallet ========================= */
create or replace function public.ach_wallet_share(
  p_device text,
  p_to_tag text,
  p_card_ids text[]
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
  share_id uuid;
  clean text[];
begin
  perform private.ach_wallet_expire_stale();
  if p_device is null or char_length(p_device) not between 8 and 64 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if p_to_tag is null or p_to_tag !~ '^[A-Za-z0-9_]{3,16}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_tag');
  end if;
  if not private.ach_wallet_ids_ok(p_card_ids) then
    return jsonb_build_object('ok', false, 'error', 'invalid_wallet');
  end if;

  /* de-dupe while preserving first-seen order */
  select array_agg(x order by ord)
    into clean
    from (
      select v as x, min(ord) as ord
        from unnest(p_card_ids) with ordinality as t(v, ord)
       group by v
    ) q;

  if clean is null or cardinality(clean) < 1 then
    return jsonb_build_object('ok', false, 'error', 'invalid_wallet');
  end if;

  select g.device_id into me from public.gamertags g where g.device_id = p_device;
  if me is null then return jsonb_build_object('ok', false, 'error', 'no_gamertag'); end if;

  select g.device_id, g.gamertag into them, their_tag
    from public.gamertags g where g.tag_key = lower(p_to_tag);
  if them is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if them = me then return jsonb_build_object('ok', false, 'error', 'self'); end if;

  select count(*) into pending_n
    from public.achievement_wallet_shares s
   where s.from_device = me and s.status = 'pending';
  if pending_n >= 6 then
    return jsonb_build_object('ok', false, 'error', 'too_many');
  end if;

  if exists (
    select 1 from public.achievement_wallet_shares s
     where s.status = 'pending'
       and s.from_device = me and s.to_device = them
  ) then
    return jsonb_build_object('ok', false, 'error', 'already_pending');
  end if;

  insert into public.achievement_wallet_shares (from_device, to_device, card_ids)
  values (me, them, clean)
  returning id into share_id;

  return jsonb_build_object(
    'ok', true,
    'share_id', share_id,
    'to_tag', their_tag,
    'card_count', cardinality(clean)
  );
end;
$$;

/* =========================== list shares ========================== */
create or replace function public.ach_wallet_list(p_device text)
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
  shared jsonb;
begin
  perform private.ach_wallet_expire_stale();
  if p_device is null or char_length(p_device) not between 8 and 64 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  select g.device_id into me from public.gamertags g where g.device_id = p_device;
  if me is null then
    return jsonb_build_object(
      'ok', true,
      'incoming', '[]'::jsonb,
      'outgoing', '[]'::jsonb,
      'shared', '[]'::jsonb
    );
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id,
           'from_tag', private.pvp_tag(s.from_device),
           'card_ids', to_jsonb(s.card_ids),
           'created_at', s.created_at
         ) order by s.created_at desc), '[]'::jsonb)
    into incoming
    from public.achievement_wallet_shares s
   where s.to_device = me and s.status = 'pending';

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id,
           'to_tag', private.pvp_tag(s.to_device),
           'card_ids', to_jsonb(s.card_ids),
           'created_at', s.created_at
         ) order by s.created_at desc), '[]'::jsonb)
    into outgoing
    from public.achievement_wallet_shares s
   where s.from_device = me and s.status = 'pending';

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id,
           'from_tag', private.pvp_tag(s.from_device),
           'card_ids', to_jsonb(s.card_ids),
           'received_at', s.responded_at
         ) order by s.responded_at desc), '[]'::jsonb)
    into shared
    from public.achievement_wallet_shares s
   where s.to_device = me and s.status = 'accepted';

  return jsonb_build_object(
    'ok', true,
    'incoming', incoming,
    'outgoing', outgoing,
    'shared', shared
  );
end;
$$;

/* =========================== cancel =============================== */
create or replace function public.ach_wallet_cancel(p_device text, p_share uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me text;
begin
  if p_device is null or p_share is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  select g.device_id into me from public.gamertags g where g.device_id = p_device;
  if me is null then return jsonb_build_object('ok', false, 'error', 'no_gamertag'); end if;

  update public.achievement_wallet_shares s
     set status = 'cancelled', responded_at = now()
   where s.id = p_share
     and s.from_device = me
     and s.status = 'pending';
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

/* =========================== respond ============================== */
create or replace function public.ach_wallet_respond(
  p_device text,
  p_share uuid,
  p_accept boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me text;
  r public.achievement_wallet_shares%rowtype;
begin
  perform private.ach_wallet_expire_stale();
  if p_device is null or p_share is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  select g.device_id into me from public.gamertags g where g.device_id = p_device;
  if me is null then return jsonb_build_object('ok', false, 'error', 'no_gamertag'); end if;

  select * into r from public.achievement_wallet_shares s
   where s.id = p_share and s.to_device = me and s.status = 'pending'
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  update public.achievement_wallet_shares
     set status = case when p_accept then 'accepted' else 'declined' end,
         responded_at = now()
   where id = r.id;

  return jsonb_build_object(
    'ok', true,
    'status', case when p_accept then 'accepted' else 'declined' end,
    'card_ids', to_jsonb(r.card_ids),
    'from_tag', private.pvp_tag(r.from_device)
  );
end;
$$;

/* ============================== grants ============================ */
revoke all on function public.ach_wallet_share(text, text, text[]) from public, anon;
revoke all on function public.ach_wallet_list(text) from public, anon;
revoke all on function public.ach_wallet_cancel(text, uuid) from public, anon;
revoke all on function public.ach_wallet_respond(text, uuid, boolean) from public, anon;

grant execute on function public.ach_wallet_share(text, text, text[]) to authenticated;
grant execute on function public.ach_wallet_list(text) to authenticated;
grant execute on function public.ach_wallet_cancel(text, uuid) to authenticated;
grant execute on function public.ach_wallet_respond(text, uuid, boolean) to authenticated;

commit;
