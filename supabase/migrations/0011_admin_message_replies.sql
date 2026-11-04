/* ------------------------------------------------------------------
   0011 — the person an admin messaged can reply, and the admin can
   read the thread.

   Needs 0008 (ultra_send_message, my_admin_messages, the
   admin_actions_target index) already in place, which it is.

   A reply is one more row in admin_actions, action = 'reply'. The
   actor is the account that was messaged; the target is that same
   account, so a thread for one person is every message and reply
   aimed at them. detail holds the text and the id of the admin
   message being answered (parent), so the audit trail stays one
   table and the Administrator page's recent-actions list can show
   replies beside the messages that prompted them.

   WHY THE USER CALL HAS NO ADMIN TOKEN

   ultra_send_message is an admin reaching out. A reply is the other
   direction: the recipient answering something already on their
   screen. The only check that matters is that the caller is the
   target of the parent message. An admin token would let anybody
   holding one forge a reply as somebody else, which is worse.

   Permissions stay tight:
     - reply_to_admin_message only inserts when auth.uid() is the
       parent message's target, and only for action = 'message'
     - ultra_message_thread needs a live UltraAdmin session, and
       only returns rows for the named account
     - my_admin_messages is unchanged: a user still only sees
       messages aimed at them, never anyone else's
-------------------------------------------------------------------*/

/* The recipient answers one of their own admin messages. */
create or replace function public.reply_to_admin_message(p_message uuid, p_text text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  body text := btrim(coalesce(p_text, ''));
  parent public.admin_actions%rowtype;
  reply_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authorised' using errcode = '42501';
  end if;
  if body = '' then
    raise exception 'the message is empty' using errcode = '22023';
  end if;
  if char_length(body) > 500 then
    raise exception 'a message is at most 500 characters' using errcode = '22023';
  end if;

  select * into parent
    from public.admin_actions a
   where a.id = p_message
     and a.action = 'message'
     and a.target = auth.uid();

  if not found then
    raise exception 'no such message' using errcode = 'P0002';
  end if;

  insert into public.admin_actions (actor, actor_email, target, target_email, action, detail)
  values (auth.uid(),
          (select u.email from auth.users u where u.id = auth.uid()),
          parent.target,
          parent.target_email,
          'reply',
          jsonb_build_object('text', body, 'parent', parent.id))
  returning id into reply_id;

  return reply_id;
end;
$$;
revoke execute on function public.reply_to_admin_message(uuid, text) from public, anon;
grant  execute on function public.reply_to_admin_message(uuid, text) to authenticated;

/* The conversation with one account: admin messages to them and
   their replies, oldest first. Fifty is enough for the selected-
   account panel; older lines stay in the recent-actions log. */
create or replace function public.ultra_message_thread(p_token uuid, p_target uuid)
returns table (
  id           uuid,
  actor_email  text,
  action       text,
  body         text,
  parent       uuid,
  created_at   timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.admin_scope_of(p_token) is distinct from 'ultra' then
    raise exception 'not authorised' using errcode = '42501';
  end if;
  if p_target is null then
    return;
  end if;

  return query
    select a.id,
           a.actor_email,
           a.action,
           a.detail ->> 'text',
           nullif(a.detail ->> 'parent', '')::uuid,
           a.created_at
      from public.admin_actions a
     where a.target = p_target
       and a.action in ('message', 'reply')
     order by a.created_at asc
     limit 50;
end;
$$;
revoke execute on function public.ultra_message_thread(uuid, uuid) from public, anon;
grant  execute on function public.ultra_message_thread(uuid, uuid) to authenticated;
