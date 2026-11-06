/* ------------------------------------------------------------------
   0014: Geo Duel — PvP invites by gamertag and simultaneous quiz matches.

   Device-scoped like 0008 (gamertags): no direct table access; every
   path is a security-definer RPC that checks the caller's device_id.
   Safe to run twice. Apply after 0008.
-------------------------------------------------------------------*/

begin;

/* ============================== tables ============================ */
create table if not exists public.pvp_invites (
  id           uuid primary key default gen_random_uuid(),
  from_device  text not null references public.gamertags(device_id) on delete cascade,
  to_device    text not null references public.gamertags(device_id) on delete cascade,
  status       text not null default 'pending'
               check (status in ('pending','accepted','declined','cancelled','expired')),
  match_id     uuid,
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  check (from_device <> to_device)
);
create index if not exists pvp_invites_to_pending
  on public.pvp_invites (to_device, created_at desc)
  where status = 'pending';
create index if not exists pvp_invites_from_pending
  on public.pvp_invites (from_device, created_at desc)
  where status = 'pending';

create table if not exists public.pvp_matches (
  id              uuid primary key default gen_random_uuid(),
  host_device     text not null references public.gamertags(device_id) on delete cascade,
  guest_device    text not null references public.gamertags(device_id) on delete cascade,
  status          text not null default 'seeding'
                  check (status in ('seeding','active','finished','cancelled')),
  kind            text not null default 'mix'
                  check (kind in ('flags','capitals','mix')),
  rounds          jsonb not null default '[]'::jsonb,
  round_count     integer not null default 5 check (round_count between 3 and 9),
  current_round   integer not null default 0 check (current_round >= 0),
  host_score      integer not null default 0,
  guest_score     integer not null default 0,
  host_choice     integer,          /* choice index for current round, null = waiting */
  guest_choice    integer,
  host_ms         integer,
  guest_ms        integer,
  round_started_at timestamptz,
  round_results   jsonb not null default '[]'::jsonb,
  winner_device   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (host_device <> guest_device)
);
create index if not exists pvp_matches_host on public.pvp_matches (host_device, updated_at desc);
create index if not exists pvp_matches_guest on public.pvp_matches (guest_device, updated_at desc);

do $$ begin
  alter table public.pvp_invites
    add constraint pvp_invites_match_fk
    foreign key (match_id) references public.pvp_matches(id) on delete set null;
exception when duplicate_object then null;
end $$;

alter table public.pvp_invites enable row level security;
alter table public.pvp_matches enable row level security;
revoke all on public.pvp_invites, public.pvp_matches from anon, authenticated;

/* ============================== helpers =========================== */
create or replace function private.pvp_tag(p_device text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select g.gamertag from public.gamertags g where g.device_id = p_device
$$;

create or replace function private.pvp_expire_stale()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.pvp_invites
     set status = 'expired', responded_at = now()
   where status = 'pending'
     and created_at < now() - interval '10 minutes';
end;
$$;

/* ========================= lookup a gamertag ====================== */
create or replace function public.pvp_lookup_tag(p_tag text)
returns table (found boolean, gamertag text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  t text;
begin
  if p_tag is null or p_tag !~ '^[A-Za-z0-9_]{3,16}$' then
    return query select false, null::text;
    return;
  end if;
  select g.gamertag into t from public.gamertags g where g.tag_key = lower(p_tag);
  if t is null then
    return query select false, null::text;
  else
    return query select true, t;
  end if;
end;
$$;

/* =========================== send invite ========================== */
create or replace function public.pvp_send_invite(p_device text, p_to_tag text)
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
  invite_id uuid;
begin
  perform private.pvp_expire_stale();
  if p_device is null or char_length(p_device) not between 8 and 64 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if p_to_tag is null or p_to_tag !~ '^[A-Za-z0-9_]{3,16}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_tag');
  end if;
  select g.device_id into me from public.gamertags g where g.device_id = p_device;
  if me is null then return jsonb_build_object('ok', false, 'error', 'no_gamertag'); end if;

  select g.device_id, g.gamertag into them, their_tag
    from public.gamertags g where g.tag_key = lower(p_to_tag);
  if them is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if them = me then return jsonb_build_object('ok', false, 'error', 'self'); end if;

  select count(*) into pending_n
    from public.pvp_invites i
   where i.from_device = me and i.status = 'pending';
  if pending_n >= 5 then
    return jsonb_build_object('ok', false, 'error', 'too_many');
  end if;

  if exists (
    select 1 from public.pvp_invites i
     where i.status = 'pending'
       and ((i.from_device = me and i.to_device = them)
         or (i.from_device = them and i.to_device = me))
  ) then
    return jsonb_build_object('ok', false, 'error', 'already_pending');
  end if;

  insert into public.pvp_invites (from_device, to_device)
  values (me, them)
  returning id into invite_id;

  return jsonb_build_object(
    'ok', true,
    'invite_id', invite_id,
    'to_tag', their_tag
  );
end;
$$;

/* =========================== list inbox =========================== */
create or replace function public.pvp_list_inbox(p_device text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me text;
  incoming jsonb;
  outgoing jsonb;
  active jsonb;
begin
  perform private.pvp_expire_stale();
  if p_device is null or char_length(p_device) not between 8 and 64 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  select g.device_id into me from public.gamertags g where g.device_id = p_device;
  if me is null then return jsonb_build_object('ok', true, 'incoming', '[]'::jsonb, 'outgoing', '[]'::jsonb, 'active', null); end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', i.id,
           'from_tag', private.pvp_tag(i.from_device),
           'to_tag', private.pvp_tag(i.to_device),
           'status', i.status,
           'created_at', i.created_at,
           'match_id', i.match_id
         ) order by i.created_at desc), '[]'::jsonb)
    into incoming
    from public.pvp_invites i
   where i.to_device = me and i.status = 'pending';

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', i.id,
           'from_tag', private.pvp_tag(i.from_device),
           'to_tag', private.pvp_tag(i.to_device),
           'status', i.status,
           'created_at', i.created_at,
           'match_id', i.match_id
         ) order by i.created_at desc), '[]'::jsonb)
    into outgoing
    from public.pvp_invites i
   where i.from_device = me and i.status = 'pending';

  select jsonb_build_object(
           'id', m.id,
           'status', m.status,
           'host_tag', private.pvp_tag(m.host_device),
           'guest_tag', private.pvp_tag(m.guest_device),
           'host_score', m.host_score,
           'guest_score', m.guest_score,
           'current_round', m.current_round,
           'round_count', m.round_count,
           'kind', m.kind,
           'updated_at', m.updated_at
         )
    into active
    from public.pvp_matches m
   where (m.host_device = me or m.guest_device = me)
     and m.status in ('seeding','active')
   order by m.updated_at desc
   limit 1;

  return jsonb_build_object(
    'ok', true,
    'incoming', incoming,
    'outgoing', outgoing,
    'active', active
  );
end;
$$;

/* ======================== cancel / respond ======================== */
create or replace function public.pvp_cancel_invite(p_device text, p_invite uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_device is null or p_invite is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  update public.pvp_invites
     set status = 'cancelled', responded_at = now()
   where id = p_invite and from_device = p_device and status = 'pending';
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.pvp_respond_invite(p_device text, p_invite uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.pvp_invites%rowtype;
  mid uuid;
  kind text := 'mix';
begin
  perform private.pvp_expire_stale();
  if p_device is null or p_invite is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  select * into inv from public.pvp_invites where id = p_invite for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if inv.to_device <> p_device then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if inv.status <> 'pending' then return jsonb_build_object('ok', false, 'error', 'gone'); end if;

  if not coalesce(p_accept, false) then
    update public.pvp_invites
       set status = 'declined', responded_at = now()
     where id = p_invite;
    return jsonb_build_object('ok', true, 'status', 'declined');
  end if;

  /* Refuse if either player already has an open match. */
  if exists (
    select 1 from public.pvp_matches m
     where m.status in ('seeding','active')
       and (m.host_device in (inv.from_device, inv.to_device)
         or m.guest_device in (inv.from_device, inv.to_device))
  ) then
    return jsonb_build_object('ok', false, 'error', 'busy');
  end if;

  insert into public.pvp_matches (host_device, guest_device, status, kind)
  values (inv.from_device, inv.to_device, 'seeding', kind)
  returning id into mid;

  update public.pvp_invites
     set status = 'accepted', responded_at = now(), match_id = mid
   where id = p_invite;

  /* Clear other pending invites between these two. */
  update public.pvp_invites
     set status = 'cancelled', responded_at = now()
   where status = 'pending'
     and id <> p_invite
     and ((from_device = inv.from_device and to_device = inv.to_device)
       or (from_device = inv.to_device and to_device = inv.from_device));

  return jsonb_build_object(
    'ok', true,
    'status', 'accepted',
    'match_id', mid,
    'host_tag', private.pvp_tag(inv.from_device),
    'guest_tag', private.pvp_tag(inv.to_device)
  );
end;
$$;

/* ============================ seed match ========================== */
/* Host only. p_rounds is a JSON array of objects with prompt fields and
   correct_idx. Clients never read correct_idx until the round is scored. */
create or replace function public.pvp_seed_match(p_device text, p_match uuid, p_kind text, p_rounds jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.pvp_matches%rowtype;
  n integer;
begin
  if p_device is null or p_match is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if p_kind is null or p_kind not in ('flags','capitals','mix') then p_kind := 'mix'; end if;
  if p_rounds is null or jsonb_typeof(p_rounds) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'bad_rounds');
  end if;
  n := jsonb_array_length(p_rounds);
  if n < 3 or n > 9 then
    return jsonb_build_object('ok', false, 'error', 'bad_rounds');
  end if;

  select * into m from public.pvp_matches where id = p_match for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if m.host_device <> p_device then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if m.status <> 'seeding' then return jsonb_build_object('ok', false, 'error', 'started'); end if;

  update public.pvp_matches
     set rounds = p_rounds,
         round_count = n,
         kind = p_kind,
         status = 'active',
         current_round = 0,
         host_choice = null,
         guest_choice = null,
         host_ms = null,
         guest_ms = null,
         round_started_at = now(),
         updated_at = now()
   where id = p_match;

  return jsonb_build_object('ok', true, 'status', 'active', 'round_count', n);
end;
$$;

/* ========================= public match view ====================== */
create or replace function private.pvp_public_round(r jsonb, reveal boolean)
returns jsonb
language sql
immutable
as $$
  select case when r is null then null
    else jsonb_build_object(
      'type', r->>'type',
      'country', r->>'country',
      'prompt', r->>'prompt',
      'subject', r->>'subject',
      'sub', r->>'sub',
      'flag', r->>'flag',
      'flag_choices', coalesce((r->>'flag_choices')::boolean, false),
      'choices', coalesce(r->'choices', '[]'::jsonb),
      'correct_idx', case when reveal then r->'correct_idx' else 'null'::jsonb end
    )
  end
$$;

create or replace function public.pvp_match_state(p_device text, p_match uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.pvp_matches%rowtype;
  role text;
  reveal boolean;
  cur jsonb;
  i integer;
  rounds_out jsonb := '[]'::jsonb;
  answered_me boolean;
  answered_them boolean;
  secs integer := 18;
begin
  if p_device is null or p_match is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  select * into m from public.pvp_matches where id = p_match;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if m.host_device <> p_device and m.guest_device <> p_device then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  role := case when m.host_device = p_device then 'host' else 'guest' end;

  /* Auto-resolve a timed-out round before returning state. */
  if m.status = 'active'
     and m.round_started_at is not null
     and m.round_started_at < now() - make_interval(secs => secs) then
    perform public.pvp_resolve_round(p_device, p_match);
    select * into m from public.pvp_matches where id = p_match;
  end if;

  for i in 0 .. greatest(m.round_count - 1, 0) loop
    reveal := (m.status = 'finished')
           or (i < m.current_round)
           or (i = m.current_round and m.status = 'active'
               and m.host_choice is not null and m.guest_choice is not null);
    rounds_out := rounds_out || jsonb_build_array(
      private.pvp_public_round(m.rounds->i, reveal)
    );
  end loop;

  cur := rounds_out->m.current_round;
  answered_me := case when role = 'host' then m.host_choice is not null else m.guest_choice is not null end;
  answered_them := case when role = 'host' then m.guest_choice is not null else m.host_choice is not null end;

  return jsonb_build_object(
    'ok', true,
    'id', m.id,
    'status', m.status,
    'role', role,
    'kind', m.kind,
    'host_tag', private.pvp_tag(m.host_device),
    'guest_tag', private.pvp_tag(m.guest_device),
    'host_score', m.host_score,
    'guest_score', m.guest_score,
    'my_score', case when role = 'host' then m.host_score else m.guest_score end,
    'their_score', case when role = 'host' then m.guest_score else m.host_score end,
    'current_round', m.current_round,
    'round_count', m.round_count,
    'round', cur,
    'rounds', rounds_out,
    'round_results', m.round_results,
    'answered_me', answered_me,
    'answered_them', answered_them,
    'round_started_at', m.round_started_at,
    'round_seconds', secs,
    'winner_tag', case when m.winner_device is null then null else private.pvp_tag(m.winner_device) end,
    'i_won', m.winner_device is not null and m.winner_device = p_device,
    'draw', m.status = 'finished' and m.winner_device is null,
    'updated_at', m.updated_at
  );
end;
$$;

/* ========================= resolve one round ====================== */
create or replace function public.pvp_resolve_round(p_device text, p_match uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.pvp_matches%rowtype;
  correct integer;
  host_ok boolean;
  guest_ok boolean;
  winner text;       /* 'host' | 'guest' | 'draw' | 'none' */
  result jsonb;
  next_r integer;
begin
  if p_device is null or p_match is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  select * into m from public.pvp_matches where id = p_match for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if m.host_device <> p_device and m.guest_device <> p_device then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if m.status <> 'active' then
    return jsonb_build_object('ok', true, 'status', m.status);
  end if;

  /* Wait until both answered, or the round timer has elapsed. */
  if (m.host_choice is null or m.guest_choice is null)
     and (m.round_started_at is null or m.round_started_at >= now() - interval '18 seconds') then
    return jsonb_build_object('ok', true, 'waiting', true);
  end if;

  /* Already past this round (idempotent). */
  if jsonb_array_length(m.round_results) > m.current_round then
    return jsonb_build_object('ok', true, 'status', m.status, 'current_round', m.current_round);
  end if;

  correct := coalesce((m.rounds->m.current_round->>'correct_idx')::integer, -1);
  host_ok := m.host_choice is not null and m.host_choice = correct;
  guest_ok := m.guest_choice is not null and m.guest_choice = correct;

  if host_ok and guest_ok then
    if coalesce(m.host_ms, 999999) < coalesce(m.guest_ms, 999999) then winner := 'host';
    elsif coalesce(m.guest_ms, 999999) < coalesce(m.host_ms, 999999) then winner := 'guest';
    else winner := 'draw'; end if;
  elsif host_ok then winner := 'host';
  elsif guest_ok then winner := 'guest';
  else winner := 'none';
  end if;

  result := jsonb_build_object(
    'round', m.current_round,
    'correct_idx', correct,
    'host_ok', host_ok,
    'guest_ok', guest_ok,
    'host_choice', m.host_choice,
    'guest_choice', m.guest_choice,
    'host_ms', m.host_ms,
    'guest_ms', m.guest_ms,
    'winner', winner
  );

  next_r := m.current_round + 1;

  if winner = 'host' then
    m.host_score := m.host_score + 1;
  elsif winner = 'guest' then
    m.guest_score := m.guest_score + 1;
  end if;

  if next_r >= m.round_count then
    update public.pvp_matches
       set host_score = m.host_score,
           guest_score = m.guest_score,
           round_results = round_results || jsonb_build_array(result),
           status = 'finished',
           winner_device = case
             when m.host_score > m.guest_score then host_device
             when m.guest_score > m.host_score then guest_device
             else null end,
           updated_at = now()
     where id = p_match;
  else
    update public.pvp_matches
       set host_score = m.host_score,
           guest_score = m.guest_score,
           round_results = round_results || jsonb_build_array(result),
           current_round = next_r,
           host_choice = null,
           guest_choice = null,
           host_ms = null,
           guest_ms = null,
           round_started_at = now(),
           updated_at = now()
     where id = p_match;
  end if;

  return jsonb_build_object('ok', true, 'resolved', true, 'result', result);
end;
$$;

/* =========================== submit answer ======================== */
create or replace function public.pvp_submit_answer(
  p_device text, p_match uuid, p_round integer, p_choice integer, p_ms integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.pvp_matches%rowtype;
  role text;
begin
  if p_device is null or p_match is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if p_choice is null or p_choice < 0 or p_choice > 7 then
    return jsonb_build_object('ok', false, 'error', 'bad_choice');
  end if;
  if p_ms is null or p_ms < 0 then p_ms := 0; end if;
  if p_ms > 60000 then p_ms := 60000; end if;

  select * into m from public.pvp_matches where id = p_match for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if m.host_device <> p_device and m.guest_device <> p_device then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if m.status <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'not_active');
  end if;
  if p_round is distinct from m.current_round then
    return jsonb_build_object('ok', false, 'error', 'wrong_round');
  end if;

  role := case when m.host_device = p_device then 'host' else 'guest' end;
  if role = 'host' then
    if m.host_choice is not null then
      return jsonb_build_object('ok', false, 'error', 'already');
    end if;
    update public.pvp_matches
       set host_choice = p_choice, host_ms = p_ms, updated_at = now()
     where id = p_match;
  else
    if m.guest_choice is not null then
      return jsonb_build_object('ok', false, 'error', 'already');
    end if;
    update public.pvp_matches
       set guest_choice = p_choice, guest_ms = p_ms, updated_at = now()
     where id = p_match;
  end if;

  return public.pvp_resolve_round(p_device, p_match);
end;
$$;

/* =========================== forfeit match ======================== */
create or replace function public.pvp_forfeit_match(p_device text, p_match uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.pvp_matches%rowtype;
  other text;
begin
  if p_device is null or p_match is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  select * into m from public.pvp_matches where id = p_match for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if m.host_device <> p_device and m.guest_device <> p_device then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if m.status not in ('seeding','active') then
    return jsonb_build_object('ok', true, 'status', m.status);
  end if;
  other := case when m.host_device = p_device then m.guest_device else m.host_device end;
  update public.pvp_matches
     set status = 'finished',
         winner_device = other,
         updated_at = now()
   where id = p_match;
  return jsonb_build_object('ok', true, 'status', 'finished', 'winner_tag', private.pvp_tag(other));
end;
$$;

/* ============================== realtime ========================== */
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pvp_invites'
    ) then
      alter publication supabase_realtime add table public.pvp_invites;
    end if;
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pvp_matches'
    ) then
      alter publication supabase_realtime add table public.pvp_matches;
    end if;
  end if;
end $$;

/* ============================== grants ============================ */
revoke execute on function public.pvp_lookup_tag(text) from public;
revoke execute on function public.pvp_send_invite(text, text) from public;
revoke execute on function public.pvp_list_inbox(text) from public;
revoke execute on function public.pvp_cancel_invite(text, uuid) from public;
revoke execute on function public.pvp_respond_invite(text, uuid, boolean) from public;
revoke execute on function public.pvp_seed_match(text, uuid, text, jsonb) from public;
revoke execute on function public.pvp_match_state(text, uuid) from public;
revoke execute on function public.pvp_resolve_round(text, uuid) from public;
revoke execute on function public.pvp_submit_answer(text, uuid, integer, integer, integer) from public;
revoke execute on function public.pvp_forfeit_match(text, uuid) from public;

grant execute on function public.pvp_lookup_tag(text) to anon, authenticated;
grant execute on function public.pvp_send_invite(text, text) to anon, authenticated;
grant execute on function public.pvp_list_inbox(text) to anon, authenticated;
grant execute on function public.pvp_cancel_invite(text, uuid) to anon, authenticated;
grant execute on function public.pvp_respond_invite(text, uuid, boolean) to anon, authenticated;
grant execute on function public.pvp_seed_match(text, uuid, text, jsonb) to anon, authenticated;
grant execute on function public.pvp_match_state(text, uuid) to anon, authenticated;
grant execute on function public.pvp_resolve_round(text, uuid) to anon, authenticated;
grant execute on function public.pvp_submit_answer(text, uuid, integer, integer, integer) to anon, authenticated;
grant execute on function public.pvp_forfeit_match(text, uuid) to anon, authenticated;

commit;
