/* ------------------------------------------------------------------
   One-time pet level reset (glitched Play XP).

   Pet levels are not a table. They live inside public.profiles.save,
   the jsonb blob the client uploads:
     save.pets.owned[].level
     save.pets.owned[].xp
     save.pets.owned[].skinStage
     save.pets.xpBank
   There is no pets table. Guests never reach this database; the client
   resets their local save on its own.

   This file is for the LIVE project (the schema in supabase/deployed).
   Do not apply the rest of supabase/migrations/ to that project.
   Paste this file alone into the SQL editor. The same statement is
   supabase/deployed/0010_pets_level_reset.sql.

   Order: deploy the client that stamps save.pets.resetVersion and
   confirm production is serving that build, THEN run this script.
   The trigger repairs any later upload that still has no stamp, which
   is how a stale device is stopped from writing the glitched levels
   back. A save already at resetVersion >= 1 is stored as sent, so
   levels earned after the wipe are kept.

   Account xp, level and diamonds sit beside pets on the save and are
   not read or written here. Care, cosmetics and mutations are not
   either. Running this again is a no-op once every row is stamped.
-------------------------------------------------------------------*/

create or replace function public.pets_level_reset_save(save jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $fn$
declare
  pets jsonb;
  ver int := 0;
  ver_text text;
  pet jsonb;
  next_owned jsonb := '[]'::jsonb;
begin
  if save is null or jsonb_typeof(save) <> 'object' then
    return save;
  end if;
  pets := save -> 'pets';
  if pets is null or jsonb_typeof(pets) <> 'object' then
    return save;
  end if;

  ver_text := pets ->> 'resetVersion';
  if ver_text ~ '^[0-9]+$' then
    ver := ver_text::int;
  end if;
  if ver >= 1 then
    return save;
  end if;

  if jsonb_typeof(pets -> 'owned') = 'array' then
    for pet in
      select t.value
      from jsonb_array_elements(pets -> 'owned') with ordinality as t(value, ord)
      order by t.ord
    loop
      if jsonb_typeof(pet) = 'object' then
        pet := pet || jsonb_build_object('level', 1, 'xp', 0, 'skinStage', 'A');
      end if;
      next_owned := next_owned || jsonb_build_array(pet);
    end loop;
    pets := jsonb_set(pets, '{owned}', next_owned, true);
  end if;

  pets := jsonb_set(pets, '{xpBank}', '0'::jsonb, true);
  pets := jsonb_set(pets, '{resetVersion}', '1'::jsonb, true);
  return jsonb_set(save, '{pets}', pets, true);
end
$fn$;

create or replace function public.enforce_pets_level_reset()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  new.save := public.pets_level_reset_save(new.save);
  return new;
end
$fn$;

drop trigger if exists profiles_pets_level_reset on public.profiles;
create trigger profiles_pets_level_reset
  before insert or update on public.profiles
  for each row execute function public.enforce_pets_level_reset();

/* Backfill. profiles_touch bumps updated_at because save changes, so a
   device that still has the old copy treats the server as newer. */
update public.profiles
   set save = public.pets_level_reset_save(save)
 where public.pets_level_reset_save(save) is distinct from save;
