/* ------------------------------------------------------------------
   0034: Free / Plus / Schools (LEA-122).

   Narrows premium_game_ids() to the four Plus games and strips only
   the Plus cosmetics a Free save must not keep equipped:
     effects  embers, wings, bubbles
     trail    ember
     jumper   gilded
     board    meridian

   flags.plan ('free' | 'plus' | 'schools'), flags.school, and
   flags.students are frozen the same way as flags.premium unless
   app.admin_write is set. ultra_set_plan grants a TEST / admin plan
   and seat count. ultra_set_premium still flips the paid bit and now
   records plan plus or free so an older admin grant stays a Plus.

   Client gates still depend on the Development preview switch.
   ADS_ENABLED stays a separate switch. Safe to run twice.
   MCP apply name: plus_schools_plans_0034.
-------------------------------------------------------------------*/

begin;

create or replace function public.premium_game_ids()
returns text[]
language sql
immutable
as $$
  select array['invaders', 'breakout', 'typer', 'echo']::text[];
$$;

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
  old_plan text;
  old_school boolean;
  old_students int;
  effect_id text;
  trail_id text;
  jumper_id text;
  board_id text;
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
  old_plan  := coalesce(old_s -> 'flags' ->> 'plan', 'free');
  if old_plan not in ('free', 'plus', 'schools') then
    old_plan := 'free';
  end if;
  old_school := coalesce((old_s -> 'flags' ->> 'school') = 'true', false) or old_plan = 'schools';
  old_students := coalesce((old_s -> 'flags' ->> 'students')::int, 0);

  if not allow_write then
    if jsonb_typeof(new_s -> 'flags') is distinct from 'object' then
      new_s := new_s || '{"flags":{}}'::jsonb;
    end if;
    new_s := jsonb_set(new_s, '{flags,premium}', to_jsonb(old_prem), true);
    new_s := jsonb_set(new_s, '{flags,staff}', to_jsonb(old_staff), true);
    new_s := jsonb_set(new_s, '{flags,plan}', to_jsonb(old_plan), true);
    new_s := jsonb_set(new_s, '{flags,school}', to_jsonb(old_school), true);
    new_s := jsonb_set(new_s, '{flags,students}', to_jsonb(old_students), true);
    new_prem := old_prem;
  end if;

  /* Free accounts cannot keep a Plus-only look equipped. */
  if not new_prem then
    effect_id := coalesce(new_s #>> '{profile,effect}', 'none');
    if effect_id in ('embers', 'wings', 'bubbles') then
      new_s := jsonb_set(new_s, '{profile,effect}', '"none"', true);
    end if;

    trail_id := coalesce(new_s #>> '{profile,dashTrail}', 'dust');
    if trail_id = 'ember' then
      new_s := jsonb_set(new_s, '{profile,dashTrail}', '"dust"', true);
    end if;

    jumper_id := coalesce(new_s #>> '{profile,dashJumper}', 'classic');
    if jumper_id = 'gilded' then
      new_s := jsonb_set(new_s, '{profile,dashJumper}', '"classic"', true);
    end if;

    board_id := coalesce(new_s #>> '{profile,chessBoard}', 'classic');
    if board_id = 'meridian' then
      new_s := jsonb_set(new_s, '{profile,chessBoard}', '"classic"', true);
    end if;
  end if;

  new.save := new_s;
  return new;
end;
$$;

drop trigger if exists profiles_enforce_entitlements on public.profiles;
create trigger profiles_enforce_entitlements
  before insert or update of save on public.profiles
  for each row execute function public.enforce_entitlement_flags();

create or replace function public.ultra_set_plan(
  p_token uuid,
  p_target uuid,
  p_plan text,
  p_students integer
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  s     jsonb;
  plan_ text := lower(coalesce(p_plan, 'free'));
  n     integer := coalesce(p_students, 0);
begin
  if public.admin_scope_of(p_token) is distinct from 'ultra' then
    raise exception 'not authorised' using errcode = '42501';
  end if;
  if plan_ not in ('free', 'plus', 'schools') then
    raise exception 'bad plan' using errcode = '22023';
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

  if plan_ = 'schools' then
    if n < 1 then n := 1; end if;
    if n > 400 then n := 400; end if;
  else
    n := 0;
  end if;

  s := jsonb_set(s, '{flags,plan}', to_jsonb(plan_), true);
  s := jsonb_set(s, '{flags,premium}', to_jsonb(plan_ <> 'free'), true);
  s := jsonb_set(s, '{flags,school}', to_jsonb(plan_ = 'schools'), true);
  s := jsonb_set(s, '{flags,students}', to_jsonb(n), true);
  s := jsonb_set(s, '{flags,adminAt}', to_jsonb(now()), true);

  if plan_ = 'free' then
    if coalesce(s #>> '{profile,effect}', 'none') in ('embers', 'wings', 'bubbles') then
      s := jsonb_set(s, '{profile,effect}', '"none"', true);
    end if;
    if coalesce(s #>> '{profile,dashTrail}', 'dust') = 'ember' then
      s := jsonb_set(s, '{profile,dashTrail}', '"dust"', true);
    end if;
    if coalesce(s #>> '{profile,dashJumper}', 'classic') = 'gilded' then
      s := jsonb_set(s, '{profile,dashJumper}', '"classic"', true);
    end if;
    if coalesce(s #>> '{profile,chessBoard}', 'classic') = 'meridian' then
      s := jsonb_set(s, '{profile,chessBoard}', '"classic"', true);
    end if;
  end if;

  perform set_config('app.admin_write', '1', true);
  update public.profiles p set save = s where p.id = p_target;

  insert into public.admin_actions (actor, actor_email, target, target_email, action, detail)
  values (auth.uid(),
          (select u.email from auth.users u where u.id = auth.uid()),
          p_target,
          (select u.email from auth.users u where u.id = p_target),
          'plan', jsonb_build_object('plan', plan_, 'students', n));

  return plan_;
end;
$$;

revoke execute on function public.ultra_set_plan(uuid, uuid, text, integer) from public, anon;
grant  execute on function public.ultra_set_plan(uuid, uuid, text, integer) to authenticated;

commit;
