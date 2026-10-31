/* ------------------------------------------------------------------
   0008: gamertags, a leaderboard for every game, and per-class game
   blocks.

   Written against the LIVE schema (see README.md in this folder):
   classes.teacher_id, class_members.student_id, and the helpers in the
   private schema. Run this whole file as ONE transaction in the Supabase
   SQL editor. Nothing here touches an existing table, and it is safe to
   run twice.

   Who plays: anyone. A gamertag belongs to a device, not an account, so
   a visitor can pick the Games option on the first screen and be on a
   board a minute later without signing up. The device id is a random
   string the browser makes for itself. It is not a password: it stops a
   second browser overwriting your score by accident, not a determined
   person doing it on purpose. Treat these boards as friendly, not as a
   competition with prizes.

   Who can write: nobody, directly. Every table below has row level
   security on and no policies, and the grants are revoked, so the only
   way in or out is the functions, and the functions check their input.

   Teachers: a block is stored per class. A signed-in student in that
   class is refused by submit_game_score() too, so a blocked game cannot
   quietly keep posting scores. The client hides and refuses the game
   itself. That is courtesy, and this is the part that holds.
-------------------------------------------------------------------*/

begin;

/* ============================ gamertags =========================== */
create table if not exists public.gamertags (
  device_id  text primary key check (char_length(device_id) between 8 and 64),
  tag_key    text not null unique,                 -- lower(gamertag): "Ace" and "ace" are one name
  gamertag   text not null check (gamertag ~ '^[A-Za-z0-9_]{3,16}$'),
  created_at timestamptz not null default now()
);

/* ============================== scores ============================ */
create table if not exists public.game_scores (
  game_id    text not null check (game_id ~ '^[a-z0-9_]{2,24}$'),
  device_id  text not null references public.gamertags(device_id) on delete cascade,
  score      integer not null check (score between -1000000 and 100000000),
  updated_at timestamptz not null default now(),
  primary key (game_id, device_id)
);
create index if not exists game_scores_board on public.game_scores (game_id, score);

/* ============================== blocks ============================ */
create table if not exists public.class_game_blocks (
  class_id   uuid not null references public.classes(id) on delete cascade,
  game_id    text not null check (game_id ~ '^[a-z0-9_]{2,24}$'),
  blocked_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (class_id, game_id)
);

alter table public.gamertags         enable row level security;
alter table public.game_scores       enable row level security;
alter table public.class_game_blocks enable row level security;
revoke all on public.gamertags, public.game_scores, public.class_game_blocks from anon, authenticated;

/* ========================= claim a gamertag ======================= */
/* Returns 'ok', 'taken', 'invalid' or 'rude'. A device has one tag, and
   claiming again renames it. The blocklist is short on purpose: it
   catches the obvious, and the unique name makes the rest reportable. */
create or replace function public.claim_gamertag(p_device text, p_tag text)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_device is null or char_length(p_device) not between 8 and 64 then return 'invalid'; end if;
  if p_tag is null or p_tag !~ '^[A-Za-z0-9_]{3,16}$' then return 'invalid'; end if;
  if lower(p_tag) ~ '(fuck|shit|cunt|nigg|fag|rape|nazi|hitler|whore|slut|dick|cock|bitch)' then return 'rude'; end if;

  begin
    insert into public.gamertags (device_id, tag_key, gamertag)
    values (p_device, lower(p_tag), p_tag)
    on conflict (device_id) do update
      set tag_key = excluded.tag_key, gamertag = excluded.gamertag;
  exception when unique_violation then
    return 'taken';
  end;
  return 'ok';
end;
$$;

/* ============================ submit a score ====================== */
/* Keeps the better of the old and new score. p_asc is true for the games
   where lower is better (golf, strokes under par). Refuses a game that
   one of the signed-in caller's classes has blocked. */
create or replace function public.submit_game_score(
  p_game text, p_device text, p_score integer, p_asc boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_game is null or p_game !~ '^[a-z0-9_]{2,24}$' then raise exception 'bad game'; end if;
  if p_score is null or p_score not between -1000000 and 100000000 then raise exception 'bad score'; end if;
  if not exists (select 1 from public.gamertags g where g.device_id = p_device) then
    raise exception 'no gamertag';
  end if;
  if auth.uid() is not null and exists (
       select 1
         from public.class_game_blocks b
         join public.class_members m on m.class_id = b.class_id
        where b.game_id = p_game and m.student_id = auth.uid()) then
    raise exception 'blocked';
  end if;

  insert into public.game_scores (game_id, device_id, score)
  values (p_game, p_device, p_score)
  on conflict (game_id, device_id) do update
    set score = case when coalesce(p_asc, false) then least(game_scores.score, excluded.score)
                     else greatest(game_scores.score, excluded.score) end,
        updated_at = now();
end;
$$;

/* ============================ read a board ======================== */
/* The top p_limit, plus the caller's own row if they are further down.
   The device id never leaves the database: `mine` says which row is
   yours. */
create or replace function public.game_leaderboard(
  p_game text, p_asc boolean default false, p_device text default null, p_limit integer default 25)
returns table (rank bigint, gamertag text, score integer, mine boolean)
language sql
stable
security definer
set search_path = public
as $$
  with ranked as (
    select row_number() over (
             order by case when coalesce(p_asc, false) then s.score else -s.score end, s.updated_at) as rank,
           g.gamertag, s.score, (s.device_id = p_device) as mine
      from public.game_scores s
      join public.gamertags g on g.device_id = s.device_id
     where s.game_id = p_game
  )
  select r.rank, r.gamertag, r.score, r.mine
    from ranked r
   where r.rank <= least(greatest(coalesce(p_limit, 25), 1), 100) or r.mine
   order by r.rank
$$;

/* ============================= class blocks ======================= */
/* What a teacher sees for one class. */
create or replace function public.list_class_game_blocks(p_class uuid)
returns setof text
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not private.is_class_teacher(p_class) then raise exception 'not your class'; end if;
  return query select b.game_id from public.class_game_blocks b where b.class_id = p_class;
end;
$$;

create or replace function public.set_game_block(p_class uuid, p_game text, p_blocked boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not private.is_class_teacher(p_class) then raise exception 'not your class'; end if;
  if p_game is null or p_game !~ '^[a-z0-9_]{2,24}$' then raise exception 'bad game'; end if;
  if p_blocked then
    insert into public.class_game_blocks (class_id, game_id, blocked_by)
    values (p_class, p_game, auth.uid())
    on conflict do nothing;
  else
    delete from public.class_game_blocks where class_id = p_class and game_id = p_game;
  end if;
end;
$$;

/* What a student is not allowed to play, across every class they are in. */
create or replace function public.my_blocked_games()
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select distinct b.game_id
    from public.class_game_blocks b
    join public.class_members m on m.class_id = b.class_id
   where m.student_id = auth.uid()
$$;

revoke execute on function public.claim_gamertag(text, text)                         from public;
revoke execute on function public.submit_game_score(text, text, integer, boolean)    from public;
revoke execute on function public.game_leaderboard(text, boolean, text, integer)     from public;
revoke execute on function public.list_class_game_blocks(uuid)                            from public;
revoke execute on function public.set_game_block(uuid, text, boolean)                from public;
revoke execute on function public.my_blocked_games()                                 from public;

grant execute on function public.claim_gamertag(text, text)                          to anon, authenticated;
grant execute on function public.submit_game_score(text, text, integer, boolean)     to anon, authenticated;
grant execute on function public.game_leaderboard(text, boolean, text, integer)      to anon, authenticated;
grant execute on function public.list_class_game_blocks(uuid)                             to authenticated;
grant execute on function public.set_game_block(uuid, text, boolean)                 to authenticated;
grant execute on function public.my_blocked_games()                                  to authenticated;

commit;
