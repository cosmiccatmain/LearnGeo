/* ------------------------------------------------------------------
   0036: Retire the Chicken Wings profile effect (LEA-131).

   The client no longer catalogues effect id `wings`. This clears it
   from saves that still have it equipped or owned, and refuses to
   store it again if an old client uploads it.

   Equipped `profile.effect = wings` becomes `none`. The id is removed
   from `owned.effects`. Every other cosmetic is left as it was.

   Safe to run twice. Apply after 0035. MCP apply name:
   retire_chicken_wings_0036. Do not apply from a branch deploy.
-------------------------------------------------------------------*/

begin;

create or replace function public.retire_chicken_wings()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  s jsonb;
  effects jsonb;
begin
  s := coalesce(new.save::jsonb, '{}'::jsonb);
  if jsonb_typeof(s) <> 'object' then
    return new;
  end if;

  if coalesce(s #>> '{profile,effect}', 'none') = 'wings' then
    s := jsonb_set(s, '{profile,effect}', '"none"', true);
  end if;

  if jsonb_typeof(s -> 'owned' -> 'effects') = 'array'
     and (s -> 'owned' -> 'effects') ? 'wings' then
    select coalesce(jsonb_agg(elem order by ord), '[]'::jsonb)
      into effects
      from jsonb_array_elements(s -> 'owned' -> 'effects') with ordinality as t(elem, ord)
     where elem <> '"wings"'::jsonb;
    s := jsonb_set(s, '{owned,effects}', effects, true);
  end if;

  new.save := s;
  return new;
end;
$$;

drop trigger if exists profiles_retire_chicken_wings on public.profiles;
create trigger profiles_retire_chicken_wings
  before insert or update of save on public.profiles
  for each row execute function public.retire_chicken_wings();

/* Backfill. The trigger above rewrites NEW.save, so touching the
   column is enough. Runs after profiles_enforce_entitlements (name
   order): that trigger may already clear wings for Free, and this one
   clears it for Plus and Schools too. */
update public.profiles
   set save = save
 where coalesce(save::jsonb #>> '{profile,effect}', 'none') = 'wings'
    or (
      jsonb_typeof(save::jsonb -> 'owned' -> 'effects') = 'array'
      and (save::jsonb -> 'owned' -> 'effects') ? 'wings'
    );

commit;
