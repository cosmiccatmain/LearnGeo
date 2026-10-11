/* ------------------------------------------------------------------
   0008 — an admin can send a message that appears on somebody's screen.

   NOT YET APPLIED as of this commit. Needs 0007 (admin_actions,
   admin_scope_of) already in place, which it is.

   A message is one more row in admin_actions, action = 'message', with
   the text in detail. That keeps the one audit trail: the Administrator
   page's "recent admin actions" lists messages beside balance changes,
   written by the server and impossible to edit afterwards.

   WHY MESSAGES HAVE THEIR OWN CURSOR

   Balance and staff changes are pulled with my_admin_actions, against
   save -> flags -> adminAt, and the server writes that stamp into the
   save in the same update as the change. That is right for them,
   because a device that adopts the newer save already has the change.

   It would be wrong for a message. A message changes nothing in the
   save, so a device adopting a save stamped by a LATER balance change
   would ask for actions after that stamp and skip straight past an
   unread message sent before it. So messages are pulled separately,
   against flags.adminMsgAt, which only the device writes, and only
   once the message has been dismissed. The server never touches it.

   A message that is never dismissed — the tab closed with it on screen
   — comes back the next time the app opens. That is deliberate.

   The recipient is not told which admin sent it: the dialog says it is
   from a LearnGeo administrator. admin_actions keeps the sender for the
   audit trail, and my_admin_messages does not return that column.
-------------------------------------------------------------------*/

create index if not exists admin_actions_target
  on public.admin_actions (target, action, created_at);

create or replace function public.ultra_send_message(p_token uuid, p_target uuid, p_text text)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  body text := btrim(coalesce(p_text, ''));
  sent timestamptz;
begin
  if public.admin_scope_of(p_token) is distinct from 'ultra' then
    raise exception 'not authorised' using errcode = '42501';
  end if;
  if body = '' then
    raise exception 'the message is empty' using errcode = '22023';
  end if;
  if char_length(body) > 500 then
    raise exception 'a message is at most 500 characters' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_target) then
    raise exception 'no such account' using errcode = 'P0002';
  end if;

  insert into public.admin_actions (actor, actor_email, target, target_email, action, detail)
  values (auth.uid(),
          (select u.email from auth.users u where u.id = auth.uid()),
          p_target,
          (select u.email from auth.users u where u.id = p_target),
          'message', jsonb_build_object('text', body))
  returning created_at into sent;

  return sent;
end;
$$;
revoke execute on function public.ultra_send_message(uuid, uuid, text) from public, anon;
grant  execute on function public.ultra_send_message(uuid, uuid, text) to authenticated;

/* The caller's own messages, oldest first, newer than the cursor the
   device holds. Twenty at a time; the cursor moves past them once they
   are dismissed and the next check brings the rest. No sender. */
create or replace function public.my_admin_messages(p_since timestamptz)
returns table (id uuid, body text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  return query
    select a.id, a.detail ->> 'text', a.created_at
      from public.admin_actions a
     where a.target = auth.uid()
       and a.action = 'message'
       and (p_since is null or a.created_at > p_since)
     order by a.created_at asc
     limit 20;
end;
$$;
revoke execute on function public.my_admin_messages(timestamptz) from public, anon;
grant  execute on function public.my_admin_messages(timestamptz) to authenticated;
