/* ------------------------------------------------------------------
   0016: Geo Dash trails + jumper skins entitlement strip (LEA-54).

   Extends enforce_entitlement_flags so Free accounts cannot keep a
   Premium-only Geo Dash trail or jumper equipped in profiles.save.
   Client gates still depend on the Development Premium preview switch
   (LEA-46). Safe to run twice.
-------------------------------------------------------------------*/

begin;

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
  trail_id text;
  jumper_id text;
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

    /* Geo Dash cosmetics (LEA-54). Keep in sync with cosmetics.js
       trails / jumpers that carry premium: true. */
    trail_id := coalesce(new_s #>> '{profile,dashTrail}', 'dust');
    if trail_id in ('ember', 'neon', 'aurora') then
      new_s := jsonb_set(new_s, '{profile,dashTrail}', '"dust"', true);
    end if;

    jumper_id := coalesce(new_s #>> '{profile,dashJumper}', 'classic');
    if jumper_id in ('aurora', 'gilded') then
      new_s := jsonb_set(new_s, '{profile,dashJumper}', '"classic"', true);
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

commit;
