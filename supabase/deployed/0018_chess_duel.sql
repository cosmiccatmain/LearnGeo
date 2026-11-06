/* ------------------------------------------------------------------
   0018: Geo Chess PvP duel — invite by gamertag, turn-based board.

   Mirrors 0014 Geo Duel invite/inbox/match patterns, but stores a
   shared FEN + move list instead of quiz rounds. Legal moves are
   enforced by chess.js on both clients; the server checks turn,
   square format, FEN continuity, and end flags. Opening display
   columns (eco / name) are nullable hooks for LEA-57.

   Inbox RPC is VOLATILE (see 0017): it expires stale rows.

   File number is 0018 because 0016/0017 are reserved (admin logins /
   geo-dash cosmetics / pvp join flow). Safe to run twice. Apply after
   0014 (uses private.pvp_tag).
-------------------------------------------------------------------*/

begin;

/* ============================== tables ============================ */
create table if not exists public.chess_duel_invites (
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
create index if not exists chess_duel_invites_to_pending
  on public.chess_duel_invites (to_device, created_at desc)
  where status = 'pending';
create index if not exists chess_duel_invites_from_pending
  on public.chess_duel_invites (from_device, created_at desc)
  where status = 'pending';

create table if not exists public.chess_duel_matches (
  id              uuid primary key default gen_random_uuid(),
  host_device     text not null references public.gamertags(device_id) on delete cascade,
  guest_device    text not null references public.gamertags(device_id) on delete cascade,
  /* Host always plays White; guest plays Black. */
  status          text not null default 'active'
                  check (status in ('active','finished','cancelled')),
  fen             text not null
                  default 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  moves           jsonb not null default '[]'::jsonb,
  last_move       jsonb,
  winner_device   text,
  end_reason      text,          /* checkmate | stalemate | resign | draw | timeout | abandoned */
  /* LEA-57 hooks — opening book may fill these later. */
  opening_eco     text,
  opening_name    text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (host_device <> guest_device)
);
create index if not exists chess_duel_matches_host
  on public.chess_duel_matches (host_device, updated_at desc);
create index if not exists chess_duel_matches_guest
  on public.chess_duel_matches (guest_device, updated_at desc);

do $$ begin
  alter table public.chess_duel_invites
    add constraint chess_duel_invites_match_fk
    foreign key (match_id) references public.chess_duel_matches(id) on delete set null;
exception when duplicate_object then null;
end $$;

alter table public.chess_duel_invites enable row level security;
alter table public.chess_duel_matches enable row level security;
revoke all on public.chess_duel_invites, public.chess_duel_matches from anon, authenticated;

/* ============================== helpers =========================== */
create or replace function private.chess_duel_expire_stale()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.chess_duel_invites
     set status = 'expired', responded_at = now()
   where status = 'pending'
     and created_at < now() - interval '10 minutes';

  update public.chess_duel_matches
     set status = 'cancelled',
         end_reason = coalesce(end_reason, 'abandoned'),
         updated_at = now()
   where status = 'active'
     and updated_at < now() - interval '30 minutes';
end;
$$;

create or replace function private.chess_duel_fen_turn(p_fen text)
returns text
language sql
immutable
as $$
  select nullif(split_part(coalesce(p_fen, ''), ' ', 2), '');
$$;

create or replace function private.chess_duel_sq_ok(p text)
returns boolean
language sql
immutable
as $$
  select p is not null and p ~ '^[a-h][1-8]$';
$$;

/* =========================== send invite ========================== */
create or replace function public.chess_duel_send_invite(p_device text, p_to_tag text)
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
  perform private.chess_duel_expire_stale();
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
    from public.chess_duel_invites i
   where i.from_device = me and i.status = 'pending';
  if pending_n >= 5 then
    return jsonb_build_object('ok', false, 'error', 'too_many');
  end if;

  if exists (
    select 1 from public.chess_duel_invites i
     where i.status = 'pending'
       and ((i.from_device = me and i.to_device = them)
         or (i.from_device = them and i.to_device = me))
  ) then
    return jsonb_build_object('ok', false, 'error', 'already_pending');
  end if;

  if exists (
    select 1 from public.chess_duel_matches m
     where m.status = 'active'
       and (m.host_device in (me, them) or m.guest_device in (me, them))
  ) then
    return jsonb_build_object('ok', false, 'error', 'busy');
  end if;

  insert into public.chess_duel_invites (from_device, to_device)
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
create or replace function public.chess_duel_list_inbox(p_device text)
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
  active jsonb;
begin
  perform private.chess_duel_expire_stale();
  if p_device is null or char_length(p_device) not between 8 and 64 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  select g.device_id into me from public.gamertags g where g.device_id = p_device;
  if me is null then
    return jsonb_build_object('ok', true, 'incoming', '[]'::jsonb, 'outgoing', '[]'::jsonb, 'active', null);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', i.id,
           'from_tag', private.pvp_tag(i.from_device),
           'to_tag', private.pvp_tag(i.to_device),
           'status', i.status,
           'created_at', i.created_at,
           'match_id', i.match_id
         ) order by i.created_at desc), '[]'::jsonb)
    into incoming
    from public.chess_duel_invites i
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
    from public.chess_duel_invites i
   where i.from_device = me and i.status = 'pending';

  select jsonb_build_object(
           'id', m.id,
           'status', m.status,
           'host_tag', private.pvp_tag(m.host_device),
           'guest_tag', private.pvp_tag(m.guest_device),
           'fen', m.fen,
           'my_color', case when m.host_device = me then 'w' else 'b' end,
           'updated_at', m.updated_at
         )
    into active
    from public.chess_duel_matches m
   where (m.host_device = me or m.guest_device = me)
     and m.status = 'active'
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
create or replace function public.chess_duel_cancel_invite(p_device text, p_invite uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_device is null or p_invite is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  update public.chess_duel_invites
     set status = 'cancelled', responded_at = now()
   where id = p_invite and from_device = p_device and status = 'pending';
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.chess_duel_respond_invite(p_device text, p_invite uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.chess_duel_invites%rowtype;
  mid uuid;
begin
  perform private.chess_duel_expire_stale();
  if p_device is null or p_invite is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  select * into inv from public.chess_duel_invites where id = p_invite for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if inv.to_device <> p_device then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if inv.status <> 'pending' then return jsonb_build_object('ok', false, 'error', 'gone'); end if;

  if not coalesce(p_accept, false) then
    update public.chess_duel_invites
       set status = 'declined', responded_at = now()
     where id = p_invite;
    return jsonb_build_object('ok', true, 'status', 'declined');
  end if;

  if exists (
    select 1 from public.chess_duel_matches m
     where m.status = 'active'
       and (m.host_device in (inv.from_device, inv.to_device)
         or m.guest_device in (inv.from_device, inv.to_device))
  ) then
    return jsonb_build_object('ok', false, 'error', 'busy');
  end if;

  insert into public.chess_duel_matches (host_device, guest_device, status)
  values (inv.from_device, inv.to_device, 'active')
  returning id into mid;

  update public.chess_duel_invites
     set status = 'accepted', responded_at = now(), match_id = mid
   where id = p_invite;

  update public.chess_duel_invites
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

/* ========================= public match view ====================== */
create or replace function public.chess_duel_match_state(p_device text, p_match uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.chess_duel_matches%rowtype;
  role text;
  my_color text;
  turn text;
begin
  if p_device is null or p_match is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  select * into m from public.chess_duel_matches where id = p_match;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if m.host_device <> p_device and m.guest_device <> p_device then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  role := case when m.host_device = p_device then 'host' else 'guest' end;
  my_color := case when role = 'host' then 'w' else 'b' end;
  turn := private.chess_duel_fen_turn(m.fen);

  return jsonb_build_object(
    'ok', true,
    'id', m.id,
    'status', m.status,
    'role', role,
    'my_color', my_color,
    'turn', turn,
    'my_turn', m.status = 'active' and turn = my_color,
    'fen', m.fen,
    'moves', m.moves,
    'last_move', m.last_move,
    'host_tag', private.pvp_tag(m.host_device),
    'guest_tag', private.pvp_tag(m.guest_device),
    'white_tag', private.pvp_tag(m.host_device),
    'black_tag', private.pvp_tag(m.guest_device),
    'opening_eco', m.opening_eco,
    'opening_name', m.opening_name,
    'winner_tag', case when m.winner_device is null then null else private.pvp_tag(m.winner_device) end,
    'i_won', m.winner_device is not null and m.winner_device = p_device,
    'draw', m.status = 'finished' and m.winner_device is null,
    'end_reason', m.end_reason,
    'updated_at', m.updated_at
  );
end;
$$;

/* =========================== submit move ========================== */
/* Client validates with chess.js, then sends from/to/promotion plus
   the resulting FEN and SAN. Server enforces turn + FEN continuity. */
create or replace function public.chess_duel_submit_move(
  p_device text,
  p_match uuid,
  p_from text,
  p_to text,
  p_promotion text default null,
  p_fen_before text default null,
  p_fen_after text default null,
  p_san text default null,
  p_end_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.chess_duel_matches%rowtype;
  my_color text;
  turn text;
  promo text;
  entry jsonb;
  winner text;
begin
  if p_device is null or p_match is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if not private.chess_duel_sq_ok(p_from) or not private.chess_duel_sq_ok(p_to) then
    return jsonb_build_object('ok', false, 'error', 'bad_square');
  end if;
  if p_fen_after is null or char_length(p_fen_after) < 10 or char_length(p_fen_after) > 120 then
    return jsonb_build_object('ok', false, 'error', 'bad_fen');
  end if;
  if p_fen_after !~ '^[rnbqkpRNBQKP1-8/]+ [wb] [KQkq\-]+ [a-h1-8\-]+ \d+ \d+$' then
    return jsonb_build_object('ok', false, 'error', 'bad_fen');
  end if;

  promo := nullif(lower(coalesce(p_promotion, '')), '');
  if promo is not null and promo !~ '^[qrbn]$' then
    return jsonb_build_object('ok', false, 'error', 'bad_promotion');
  end if;
  if p_end_reason is not null and p_end_reason not in (
    'checkmate','stalemate','draw','insufficient','repetition','fifty'
  ) then
    return jsonb_build_object('ok', false, 'error', 'bad_end');
  end if;

  select * into m from public.chess_duel_matches where id = p_match for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if m.host_device <> p_device and m.guest_device <> p_device then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if m.status <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'not_active');
  end if;

  my_color := case when m.host_device = p_device then 'w' else 'b' end;
  turn := private.chess_duel_fen_turn(m.fen);
  if turn is distinct from my_color then
    return jsonb_build_object('ok', false, 'error', 'not_your_turn');
  end if;

  if p_fen_before is not null and p_fen_before is distinct from m.fen then
    return jsonb_build_object('ok', false, 'error', 'stale');
  end if;

  entry := jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'promotion', promo,
    'san', left(coalesce(p_san, p_from || p_to), 16),
    'by', my_color,
    'fen', p_fen_after,
    'at', now()
  );

  winner := null;
  if p_end_reason = 'checkmate' then
    winner := p_device;
  end if;

  update public.chess_duel_matches
     set fen = p_fen_after,
         moves = moves || jsonb_build_array(entry),
         last_move = entry,
         status = case when p_end_reason is null then 'active' else 'finished' end,
         end_reason = p_end_reason,
         winner_device = winner,
         updated_at = now()
   where id = p_match;

  return public.chess_duel_match_state(p_device, p_match);
end;
$$;

/* =========================== forfeit / resign ===================== */
create or replace function public.chess_duel_forfeit_match(p_device text, p_match uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.chess_duel_matches%rowtype;
  other text;
begin
  if p_device is null or p_match is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  select * into m from public.chess_duel_matches where id = p_match for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if m.host_device <> p_device and m.guest_device <> p_device then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if m.status <> 'active' then
    return jsonb_build_object('ok', true, 'status', m.status);
  end if;
  other := case when m.host_device = p_device then m.guest_device else m.host_device end;
  update public.chess_duel_matches
     set status = 'finished',
         winner_device = other,
         end_reason = 'resign',
         updated_at = now()
   where id = p_match;
  return jsonb_build_object('ok', true, 'status', 'finished', 'winner_tag', private.pvp_tag(other));
end;
$$;

/* Optional mutual draw offer acceptance — both must call with p_accept true
   while the same fen is live. Lightweight: either player may propose; the
   other confirms by calling again with p_accept true within the turn window
   stored in last_move.meta — kept simple: immediate draw if both agree via
   this RPC in sequence is handled client-side by both calling forfeit-free
   draw. Single-shot: any player can request draw; second call from opponent
   with same fen finishes as draw. */
create or replace function public.chess_duel_offer_draw(p_device text, p_match uuid, p_accept boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.chess_duel_matches%rowtype;
  offerer text;
begin
  if p_device is null or p_match is null then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  select * into m from public.chess_duel_matches where id = p_match for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if m.host_device <> p_device and m.guest_device <> p_device then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if m.status <> 'active' then
    return jsonb_build_object('ok', true, 'status', m.status);
  end if;

  offerer := coalesce(m.last_move->>'draw_offer', '');
  if not coalesce(p_accept, false) then
    update public.chess_duel_matches
       set last_move = coalesce(last_move, '{}'::jsonb) || jsonb_build_object('draw_offer', p_device),
           updated_at = now()
     where id = p_match;
    return jsonb_build_object('ok', true, 'offered', true);
  end if;

  if offerer = '' or offerer = p_device then
    return jsonb_build_object('ok', false, 'error', 'no_offer');
  end if;

  update public.chess_duel_matches
     set status = 'finished',
         winner_device = null,
         end_reason = 'draw',
         updated_at = now()
   where id = p_match;
  return jsonb_build_object('ok', true, 'status', 'finished', 'draw', true);
end;
$$;

/* ============================== realtime ========================== */
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chess_duel_invites'
    ) then
      alter publication supabase_realtime add table public.chess_duel_invites;
    end if;
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chess_duel_matches'
    ) then
      alter publication supabase_realtime add table public.chess_duel_matches;
    end if;
  end if;
end $$;

/* ============================== grants ============================ */
revoke execute on function public.chess_duel_send_invite(text, text) from public;
revoke execute on function public.chess_duel_list_inbox(text) from public;
revoke execute on function public.chess_duel_cancel_invite(text, uuid) from public;
revoke execute on function public.chess_duel_respond_invite(text, uuid, boolean) from public;
revoke execute on function public.chess_duel_match_state(text, uuid) from public;
revoke execute on function public.chess_duel_submit_move(text, uuid, text, text, text, text, text, text, text) from public;
revoke execute on function public.chess_duel_forfeit_match(text, uuid) from public;
revoke execute on function public.chess_duel_offer_draw(text, uuid, boolean) from public;

/* Authenticated only — matches live Geo Duel grants after LEA-55 account gate. */
grant execute on function public.chess_duel_send_invite(text, text) to authenticated;
grant execute on function public.chess_duel_list_inbox(text) to authenticated;
grant execute on function public.chess_duel_cancel_invite(text, uuid) to authenticated;
grant execute on function public.chess_duel_respond_invite(text, uuid, boolean) to authenticated;
grant execute on function public.chess_duel_match_state(text, uuid) to authenticated;
grant execute on function public.chess_duel_submit_move(text, uuid, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.chess_duel_forfeit_match(text, uuid) to authenticated;
grant execute on function public.chess_duel_offer_draw(text, uuid, boolean) to authenticated;

commit;
