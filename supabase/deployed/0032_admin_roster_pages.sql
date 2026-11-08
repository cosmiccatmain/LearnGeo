/* ------------------------------------------------------------------
   0032: Admin Accounts roster can reach every profile (LEA-103).

   Live `ultra_find_accounts` hard-capped at 60 rows. With the client
   page size of 12 that only yielded about five pages, so ~400+
   accounts past the newest 60 were unreachable.

   Raises the server cap to 2000 (well above today's ~500 profiles)
   while keeping the same signature and search behaviour. The
   Administrator UI still slices the result into pages of 25.

   Written against the LIVE schema. Safe to run twice. Apply after
   0031. Does not change Premium / Development preview.
------------------------------------------------------------------ */

begin;

drop function if exists public.ultra_find_accounts(uuid, text);

create function public.ultra_find_accounts(p_token uuid, p_query text)
returns table (
  id           uuid,
  display_name text,
  email        text,
  role         text,
  diamonds     numeric,
  level        integer,
  staff        boolean,
  updated_at   timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare q text := nullif(btrim(coalesce(p_query, '')), '');
begin
  if public.admin_scope_of(p_token) is distinct from 'ultra' then
    raise exception 'not authorised' using errcode = '42501';
  end if;

  return query
    select p.id,
           p.display_name,
           u.email::text,
           p.role,
           public.app_save_num(p.save::jsonb, 'diamonds', 0),
           public.app_save_int(p.save::jsonb, 'level', 1),
           coalesce((p.save::jsonb -> 'flags' ->> 'staff') = 'true', false),
           p.updated_at
      from public.profiles p
      left join auth.users u on u.id = p.id
     where q is null
        or p.display_name ilike '%' || q || '%'
        or u.email         ilike '%' || q || '%'
     order by p.updated_at desc nulls last
     limit 2000;
end;
$$;

revoke execute on function public.ultra_find_accounts(uuid, text) from public, anon;
grant  execute on function public.ultra_find_accounts(uuid, text) to authenticated;

comment on function public.ultra_find_accounts(uuid, text) is
  'UltraAdmin account search. Empty query = newest actives. Cap 2000 (LEA-103).';

commit;
