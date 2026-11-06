/* ------------------------------------------------------------------
   0013: account Premium (not teacher-based) + server gates.

   Live schema only (see README.md in this folder). Safe to run twice.

   Premium is a boolean on profiles.save -> flags.premium, same home as
   flags.staff. It is account / player level: any learner can hold it.
   Classroom teacher role is not required and is never checked here.

   Client upserts of profiles.save cannot turn Premium (or staff) on or
   off. Only ultra_set_premium / ultra_set_staff may flip those flags,
   via set_config('app.admin_write','1', true) for the transaction.

   submit_game_score refuses Premium games when the signed-in caller
   does not hold Premium. Guests (no auth.uid) are not scored against
   this check — they still hit the client lock, and boards stay friendly.
-------------------------------------------------------------------*/

begin;

/* ========================= which games need it ==================== */
create or replace function public.premium_game_ids()
returns text[]
language sql
immutable
as $$
  select array['chess', 'dash', 'golf', 'orbit']::text[];
$$;

create or replace function public.account_has_premium(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select (p.save::jsonb -> 'flags' ->> 'premium') = 'true'
       from public.profiles p where p.id = p_uid),
    false
  );
$$;

revoke execute on function public.account_has_premium(uuid) from public, anon;
grant  execute on function public.account_has_premium(uuid) to authenticated;

/* ====================== protect entitlement flags ================= */
create or replace function public.enforce_entitlement_flags()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  old_s jsonb;
  new_s jsonb;
  allow_write boolean;
  old_prem boolean;
  new_prem boolean;
  old_staff boolean;
  new_staff boolean;
  effect_id text;
begin
  allow_write := current_setting('app.admin_write', true) = '1';

  old_s := coalesce(old.save::jsonb, '{}'::jsonb);
  new_s := coalesce(new.save::jsonb, '{}'::jsonb);
  if jsonb_typeof(new_s) <> 'object' then
    return new;
  end if;

  old_prem  := coalesce((old_s -> 'flags' ->> 'premium') = 'true', false);
  new_prem  := coalesce((new_s -> 'flags' ->> 'premium') = 'true', false);
  old_staff := coalesce((old_s -> 'flags' ->> 'staff') = 'true', false);
  new_staff := coalesce((new_s -> 'flags' ->> 'staff') = 'true', false);

  if not allow_write then
    if jsonb_typeof(new_s -> 'flags') is distinct from 'object' then
      new_s := new_s || '{"flags":{}}'::jsonb;
    end if;
    new_s := jsonb_set(new_s, '{flags,premium}', to_jsonb(old_prem), true);
    new_s := jsonb_set(new_s, '{flags,staff}',   to_jsonb(old_staff), true);
    new_prem := old_prem;
  end if;

  /* Free accounts cannot keep a Premium-only effect equipped. The client
     catalogues Premium effects; the server only knows the effect id list
     that must never stick without Premium. */
  if not new_prem then
    effect_id := coalesce(new_s #>> '{profile,effect}', 'none');
    if effect_id in ('embers', 'gambling', 'wings', 'rain', 'bubbles') then
      new_s := jsonb_set(new_s, '{profile,effect}', '"none"', true);
    end if;
  end if;

  new.save := new_s;
  return new;
end;
$$;

drop trigger if exists profiles_enforce_entitlements on public.profiles;
create trigger profiles_enforce_entitlements
  before insert or update on public.profiles
  for each row execute function public.enforce_entitlement_flags();

/* ======================== admin grant / revoke ==================== */
create or replace function public.ultra_set_premium(p_token uuid, p_target uuid, p_on boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  s   jsonb;
  on_ boolean := coalesce(p_on, false);
begin
  if public.admin_scope_of(p_token) is distinct from 'ultra' then
    raise exception 'not authorised' using errcode = '42501';
  end if;

  select coalesce(p.save::jsonb, '{}'::jsonb) into s
    from public.profiles p where p.id = p_target;
  if not found then
    raise exception 'no such account' using errcode = 'P0002';
  end if;
  if jsonb_typeof(s) <> 'object' then
    raise exception 'that account''s save is not an object; refusing to overwrite it'
      using errcode = '22023';
  end if;

  if jsonb_typeof(s -> 'flags') is distinct from 'object' then
    s := s || '{"flags":{}}'::jsonb;
  end if;
  s := jsonb_set(s, '{flags,premium}', to_jsonb(on_));
  s := jsonb_set(s, '{flags,adminAt}', to_jsonb(now()));
  if not on_ then
    if coalesce(s #>> '{profile,effect}', 'none') in ('embers', 'gambling', 'wings', 'rain', 'bubbles') then
      s := jsonb_set(s, '{profile,effect}', '"none"', true);
    end if;
  end if;

  perform set_config('app.admin_write', '1', true);
  update public.profiles p set save = s where p.id = p_target;

  insert into public.admin_actions (actor, actor_email, target, target_email, action, detail)
  values (auth.uid(),
          (select u.email from auth.users u where u.id = auth.uid()),
          p_target,
          (select u.email from auth.users u where u.id = p_target),
          'premium', jsonb_build_object('on', on_));

  return on_;
end;
$$;

revoke execute on function public.ultra_set_premium(uuid, uuid, boolean) from public, anon;
grant  execute on function public.ultra_set_premium(uuid, uuid, boolean) to authenticated;

/* Staff writes must also pass the entitlement trigger. */
create or replace function public.ultra_set_staff(p_token uuid, p_target uuid, p_on boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  s   jsonb;
  on_ boolean := coalesce(p_on, false);
begin
  if public.admin_scope_of(p_token) is distinct from 'ultra' then
    raise exception 'not authorised' using errcode = '42501';
  end if;

  select coalesce(p.save::jsonb, '{}'::jsonb) into s
    from public.profiles p where p.id = p_target;
  if not found then
    raise exception 'no such account' using errcode = 'P0002';
  end if;
  if jsonb_typeof(s) <> 'object' then
    raise exception 'that account''s save is not an object; refusing to overwrite it'
      using errcode = '22023';
  end if;

  if jsonb_typeof(s -> 'flags') is distinct from 'object' then s := s || '{"flags":{}}'::jsonb; end if;
  s := jsonb_set(s, '{flags,staff}',   to_jsonb(on_));
  s := jsonb_set(s, '{flags,adminAt}', to_jsonb(now()));

  perform set_config('app.admin_write', '1', true);
  update public.profiles p set save = s where p.id = p_target;

  insert into public.admin_actions (actor, actor_email, target, target_email, action, detail)
  values (auth.uid(),
          (select u.email from auth.users u where u.id = auth.uid()),
          p_target,
          (select u.email from auth.users u where u.id = p_target),
          'staff', jsonb_build_object('on', on_));

  return on_;
end;
$$;

revoke execute on function public.ultra_set_staff(uuid, uuid, boolean) from public, anon;
grant  execute on function public.ultra_set_staff(uuid, uuid, boolean) to authenticated;

/* ======================== score submit gate ======================= */
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
  if auth.uid() is not null
     and p_game = any (public.premium_game_ids())
     and not public.account_has_premium(auth.uid()) then
    raise exception 'premium';
  end if;

  insert into public.game_scores (game_id, device_id, score)
  values (p_game, p_device, p_score)
  on conflict (game_id, device_id) do update
    set score = case when coalesce(p_asc, false) then least(game_scores.score, excluded.score)
                     else greatest(game_scores.score, excluded.score) end,
        updated_at = now();
end;
$$;

commit;
