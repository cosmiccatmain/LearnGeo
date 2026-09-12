/* ------------------------------------------------------------------
   approve-enrollment

   A teacher lets a waiting student in, and sets the password that
   student will sign in with. Needs the service role, which is why it
   lives here and not in a SQL function.

   The password is only set for a seat this system provisioned — an
   account created by join-request because the student signed up
   without one. A student who already had their own account is simply
   approved; their password is theirs.
-------------------------------------------------------------------*/

import { json, fail, preflight, MIN_PASSWORD } from '../_shared/cors.ts';
import { adminClient, callerId, seatOwnedBy } from '../_shared/auth.ts';

Deno.serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return fail('POST only', 405);

  const teacherId = await callerId(req);
  if (!teacherId) return fail('Sign in again and retry.', 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail('expected a json body');
  }

  const memberId = String(body.member_id ?? '').trim();
  const password = String(body.password ?? '');
  if (!memberId) return fail('which student?');

  const admin = adminClient();
  const seat = await seatOwnedBy(admin, memberId, teacherId);
  if (!seat) return fail('No such student in a class you teach.', 404);

  if (seat.status === 'joined') {
    return json({ status: 'joined', display_name: seat.display_name, already: true });
  }
  if (!seat.user_id) {
    return fail('That name has not been claimed by anyone yet.', 409);
  }

  /* Set the password first. If it fails, the student stays pending and
     the teacher can try again, rather than being let in with no way in. */
  if (seat.provisioned) {
    if (password.length < MIN_PASSWORD) {
      return fail(`Give them a password of at least ${MIN_PASSWORD} characters.`);
    }
    const { error: pwErr } = await admin.auth.admin.updateUserById(seat.user_id, {
      password
    });
    if (pwErr) return fail('Could not set that password. Try a different one.', 500);
  }

  const { error: upErr } = await admin
    .from('class_members')
    .update({ status: 'joined', claimed_at: new Date().toISOString() })
    .eq('id', seat.id);

  if (upErr) return fail('Could not let them in. Try again.', 500);

  return json({
    status: 'joined',
    display_name: seat.display_name,
    password_set: seat.provisioned
  });
});
