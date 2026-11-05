/* Secrets (assets/js/secrets.js): which hidden secrets a student has found,
   mirrored onto their class seats so the teacher's People list can show it.

   Same shape as sync_level: a security definer function that touches this
   one column on the caller's own rows and nothing else, rather than an
   update policy that would also let a client rewrite display_name. Ids are
   filtered to short lowercase slugs and capped, so a client cannot park
   anything else in the column. */
alter table public.class_members add column if not exists secrets text[];

create or replace function public.sync_secrets(p_ids text[])
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := auth.uid();
  v_ids  text[];
  v_rows integer;
begin
  if v_uid is null then
    raise exception 'Sign in first' using errcode = '28000';
  end if;

  select coalesce(array_agg(distinct x order by x), '{}')
    into v_ids
    from (select x from unnest(coalesce(p_ids, '{}')) as x
           where x ~ '^[a-z0-9-]{1,24}$' limit 32) t;

  update public.class_members m
     set secrets = v_ids
   where m.student_id = v_uid;

  get diagnostics v_rows = row_count;
  return v_rows;
end $$;

revoke all on function public.sync_secrets(text[]) from public, anon;
grant execute on function public.sync_secrets(text[]) to authenticated;
