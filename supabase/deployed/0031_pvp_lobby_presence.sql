/* ------------------------------------------------------------------
   0027: PvP lobby presence + short 1:1 lobby chat (LEA-83).

   While a player is in the Geo Duel or Geo Chess challenge lobby, their
   device heartbeats here so others in that lobby see floating profile
   circles. Clicking a circle can challenge (existing invite RPCs) or
   send a short school-safe whisper.

   Device-scoped like 0008/0014. No direct table access. Safe to run twice.
-------------------------------------------------------------------*/

begin;

create table if not exists public.pvp_lobby_presence (
  device_id   text primary key references public.gamertags(device_id) on delete cascade,
  lobby       text not null check (lobby in ('duel', 'chess')),
  accent      text not null default '#1B4DFF'
              check (accent ~ '^#[0-9A-Fa-f]{6}$'),
  initial     text not null default '?'
              check (char_length(initial) between 1 and 2),
  updated_at  timestamptz not null default now()
);
create index if not exists pvp_lobby_presence_lobby_fresh
  on public.pvp_lobby_presence (lobby, updated_at desc);

create table if not exists public.pvp_lobby_chats (
  id          uuid primary key default gen_random_uuid(),
  from_device text not null references public.gamertags(device_id) on delete cascade,
  to_device   text not null references public.gamertags(device_id) on delete cascade,
  lobby       text not null check (lobby in ('duel', 'chess')),
  body        text not null check (char_length(body) between 1 and 120),
  created_at  timestamptz not null default now(),
  check (from_device <> to_device)
);
create index if not exists pvp_lobby_chats_to_recent
  on public.pvp_lobby_chats (to_device, created_at desc);
create index if not exists pvp_lobby_chats_pair_recent
  on public.pvp_lobby_chats (from_device, to_device, created_at desc);

alter table public.pvp_lobby_presence enable row level security;
alter table public.pvp_lobby_chats enable row level security;
revoke all on public.pvp_lobby_presence, public.pvp_lobby_chats from anon, authenticated;

create or replace function private.pvp_lobby_clean()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.pvp_lobby_presence
   where updated_at < now() - interval '25 seconds';
  delete from public.pvp_lobby_chats
   where created_at < now() - interval '2 hours';
end;
$$;

create or replace function public.pvp_lobby_heartbeat(
  p_device text, p_lobby text, p_accent text default '#1B4DFF', p_initial text default '?')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me text;
  tag text;
  accent text;
  initial text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'auth');
  end if;
  perform private.pvp_lobby_clean();
  if p_device is null or char_length(p_device) not between 8 and 64 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if p_lobby is null or p_lobby not in ('duel', 'chess') then
    return jsonb_build_object('ok', false, 'error', 'bad_lobby');
  end if;

  select g.device_id, g.gamertag into me, tag
    from public.gamertags g where g.device_id = p_device;
  if me is null then
    return jsonb_build_object('ok', false, 'error', 'no_gamertag');
  end if;

  accent := coalesce(nullif(p_accent, ''), '#1B4DFF');
  if accent !~ '^#[0-9A-Fa-f]{6}$' then accent := '#1B4DFF'; end if;
  initial := upper(left(coalesce(nullif(trim(p_initial), ''), left(tag, 1), '?'), 2));

  insert into public.pvp_lobby_presence (device_id, lobby, accent, initial, updated_at)
  values (me, p_lobby, accent, initial, now())
  on conflict (device_id) do update
    set lobby = excluded.lobby,
        accent = excluded.accent,
        initial = excluded.initial,
        updated_at = now();

  return jsonb_build_object('ok', true, 'lobby', p_lobby, 'tag', tag);
end;
$$;

create or replace function public.pvp_lobby_leave(p_device text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_device is null or char_length(p_device) not between 8 and 64 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  delete from public.pvp_lobby_presence where device_id = p_device;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.pvp_lobby_list(p_device text, p_lobby text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me text;
  people jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'auth');
  end if;
  perform private.pvp_lobby_clean();
  if p_device is null or char_length(p_device) not between 8 and 64 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if p_lobby is null or p_lobby not in ('duel', 'chess') then
    return jsonb_build_object('ok', false, 'error', 'bad_lobby');
  end if;

  select g.device_id into me from public.gamertags g where g.device_id = p_device;
  if me is null then
    return jsonb_build_object('ok', true, 'people', '[]'::jsonb, 'lobby', p_lobby);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'tag', private.pvp_tag(p.device_id),
           'accent', p.accent,
           'initial', p.initial,
           'mine', (p.device_id = me),
           'updated_at', p.updated_at
         ) order by (p.device_id = me) desc, p.updated_at desc), '[]'::jsonb)
    into people
    from public.pvp_lobby_presence p
   where p.lobby = p_lobby
     and p.updated_at >= now() - interval '20 seconds';

  return jsonb_build_object('ok', true, 'lobby', p_lobby, 'people', people);
end;
$$;

create or replace function public.pvp_lobby_chat_send(
  p_device text, p_to_tag text, p_lobby text, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me text;
  them text;
  their_tag text;
  msg text;
  chat_id uuid;
  rude text := '(fuck|shit|cunt|nigg|fag|rape|nazi|hitler|whore|slut|dick|cock|bitch)';
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'auth');
  end if;
  if p_device is null or char_length(p_device) not between 8 and 64 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if p_lobby is null or p_lobby not in ('duel', 'chess') then
    return jsonb_build_object('ok', false, 'error', 'bad_lobby');
  end if;
  if p_to_tag is null or p_to_tag !~ '^[A-Za-z0-9_]{3,16}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_tag');
  end if;

  msg := trim(coalesce(p_body, ''));
  if char_length(msg) < 1 or char_length(msg) > 120 then
    return jsonb_build_object('ok', false, 'error', 'bad_body');
  end if;
  if lower(msg) ~ rude then
    return jsonb_build_object('ok', false, 'error', 'rude');
  end if;

  select g.device_id into me from public.gamertags g where g.device_id = p_device;
  if me is null then return jsonb_build_object('ok', false, 'error', 'no_gamertag'); end if;

  select g.device_id, g.gamertag into them, their_tag
    from public.gamertags g where g.tag_key = lower(p_to_tag);
  if them is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if them = me then return jsonb_build_object('ok', false, 'error', 'self'); end if;

  insert into public.pvp_lobby_chats (from_device, to_device, lobby, body)
  values (me, them, p_lobby, msg)
  returning id into chat_id;

  return jsonb_build_object(
    'ok', true,
    'id', chat_id,
    'to_tag', their_tag,
    'body', msg
  );
end;
$$;

create or replace function public.pvp_lobby_chat_inbox(p_device text, p_limit integer default 20)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me text;
  rows jsonb;
  lim integer;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'auth');
  end if;
  perform private.pvp_lobby_clean();
  if p_device is null or char_length(p_device) not between 8 and 64 then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  lim := least(greatest(coalesce(p_limit, 20), 1), 50);

  select g.device_id into me from public.gamertags g where g.device_id = p_device;
  if me is null then
    return jsonb_build_object('ok', true, 'messages', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(x.obj order by x.created_at desc), '[]'::jsonb)
    into rows
    from (
      select c.created_at,
             jsonb_build_object(
               'id', c.id,
               'from_tag', private.pvp_tag(c.from_device),
               'to_tag', private.pvp_tag(c.to_device),
               'lobby', c.lobby,
               'body', c.body,
               'mine', (c.from_device = me),
               'created_at', c.created_at
             ) as obj
        from public.pvp_lobby_chats c
       where c.to_device = me or c.from_device = me
       order by c.created_at desc
       limit lim
    ) x;

  return jsonb_build_object('ok', true, 'messages', rows);
end;
$$;

revoke execute on function public.pvp_lobby_heartbeat(text, text, text, text) from public;
revoke execute on function public.pvp_lobby_leave(text) from public;
revoke execute on function public.pvp_lobby_list(text, text) from public;
revoke execute on function public.pvp_lobby_chat_send(text, text, text, text) from public;
revoke execute on function public.pvp_lobby_chat_inbox(text, integer) from public;

grant execute on function public.pvp_lobby_heartbeat(text, text, text, text) to authenticated;
grant execute on function public.pvp_lobby_leave(text) to authenticated;
grant execute on function public.pvp_lobby_list(text, text) to authenticated;
grant execute on function public.pvp_lobby_chat_send(text, text, text, text) to authenticated;
grant execute on function public.pvp_lobby_chat_inbox(text, integer) to authenticated;

commit;
