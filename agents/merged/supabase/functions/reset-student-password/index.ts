/* ------------------------------------------------------------------
   reset-student-password

   For the student who has forgotten theirs. Email confirmations are
   off and school addresses are often unreachable during a lesson, so
   the teacher is the reset path.

   Same limit as approve-enrollment: only for an account this system
   created. A student who signed up on their own keeps control of
   their own password and uses the emailed reset link.
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
  if (password.length < MIN_PASSWORD) {
    return fail(`Give them a password of at least ${MIN_PASSWORD} characters.`);
  }

  const admin = adminClient();
  const seat = await seatOwnedBy(admin, memberId, teacherId);
  if (!seat) return fail('No such student in a class you teach.', 404);
  if (!seat.user_id) return fail('That name has not been claimed by anyone yet.', 409);

  if (!seat.provisioned) {
    return fail(
      'They made this account themselves, so only they can change its ' +
        'password. Send them to the forgotten-password link on the sign-in screen.',
      403
    );
  }

  const { error } = await admin.auth.admin.updateUserById(seat.user_id, { password });
  if (error) return fail('Could not set that password. Try a different one.', 500);

  return json({ status: 'ok', display_name: seat.display_name });
});
