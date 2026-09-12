/* ------------------------------------------------------------------
   join-request

   The passwordless way into a class. A student types their school
   email, their name and a class code. No password field, no session
   issued. The teacher sets their password when they approve.

   Two modes on one endpoint, so the signup screen needs one function
   rather than two:

     { code }                         -> preview the class
     { code, email, full_name, seat } -> ask to join it

   Re-sending the same request is idempotent and returns the current
   status, which is also how the waiting screen checks back.

   One rule worth stating plainly: if the email already belongs to an
   account, this refuses and tells them to sign in instead. Attaching
   a seat to an account we did not create would let anyone type a
   stranger's address here and have a teacher set a password on it.
-------------------------------------------------------------------*/

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders, json, fail, preflight } from '../_shared/cors.ts';

Deno.serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return fail('POST only', 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail('expected a json body');
  }

  const code = String(body.code ?? '').trim().toUpperCase();
  if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) {
    return fail('That class code does not look right. It is six letters and numbers.');
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  /* ---- find the class ------------------------------------------- */
  const { data: klass, error: classErr } = await admin
    .from('classes')
    .select('id, name, code, join_open, archived_at, allowed_email_domains')
    .eq('code', code)
    .maybeSingle();

  if (classErr) return fail('Could not look that class up. Try again.', 500);
  if (!klass || klass.archived_at || !klass.join_open) {
    return fail('No open class has that code. Check it with your teacher.', 404);
  }

  /* ---- mode 1: preview ------------------------------------------ */
  const email = String(body.email ?? '').trim().toLowerCase();
  if (!email) {
    const { data: seats } = await admin
      .from('class_members')
      .select('id, display_name')
      .eq('class_id', klass.id)
      .eq('status', 'invited')
      .is('user_id', null)
      .order('display_name');

    return json({
      mode: 'preview',
      class_name: klass.name,
      allowed_email_domains: klass.allowed_email_domains ?? [],
      seats: (seats ?? []).map((s) => ({ id: s.id, name: s.display_name }))
    });
  }

  /* ---- mode 2: ask to join -------------------------------------- */
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return fail('That does not look like an email address.');
  }

  const domains: string[] = klass.allowed_email_domains ?? [];
  if (domains.length) {
    const theirs = email.split('@')[1] ?? '';
    const ok = domains.some((d) => String(d).trim().toLowerCase() === theirs);
    if (!ok) {
      return fail(
        `This class only accepts ${domains.join(' or ')} addresses. ` +
          'Use your school email.',
        403
      );
    }
  }

  const fullName = String(body.full_name ?? '').trim().slice(0, 60);
  const seatId = body.seat ? String(body.seat) : null;

  /* Already an account on this address? */
  const { data: existingId, error: lookupErr } = await admin
    .rpc('user_id_by_email', { p_email: email });
  if (lookupErr) return fail('Could not check that address. Try again.', 500);

  if (existingId) {
    /* Is it already a seat in this class? Then this is the student
       checking back, and we answer with where they stand. */
    const { data: seat } = await admin
      .from('class_members')
      .select('id, status, provisioned')
      .eq('class_id', klass.id)
      .eq('user_id', existingId)
      .maybeSingle();

    if (seat) {
      return json({
        mode: 'status',
        class_name: klass.name,
        status: seat.status,
        provisioned: seat.provisioned
      });
    }

    /* An account we did not create, with no seat here. Refuse. */
    return fail(
      'There is already an account on that email. Sign in first, then ' +
        'join the class from the Classroom tab.',
      409
    );
  }

  if (!fullName) {
    return fail('Your teacher needs a name to put next to your work.');
  }

  /* ---- create the account, with a password nobody will ever use --- */
  const throwaway = crypto.randomUUID() + crypto.randomUUID();
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: throwaway,
    email_confirm: true,
    user_metadata: { display_name: fullName }
  });

  if (createErr || !created?.user) {
    return fail('Could not create that account. Try again.', 500);
  }
  const userId = created.user.id;

  /* ---- open the seat -------------------------------------------- */
  let memberId: string | null = null;

  if (seatId) {
    /* claiming a name the teacher typed ahead of time */
    const { data: claimed, error: claimErr } = await admin
      .from('class_members')
      .update({
        user_id: userId,
        email,
        status: 'pending',
        provisioned: true,
        requested_at: new Date().toISOString()
      })
      .eq('id', seatId)
      .eq('class_id', klass.id)
      .eq('status', 'invited')
      .is('user_id', null)
      .select('id')
      .maybeSingle();

    if (claimErr) return fail('Could not claim that name. Try again.', 500);
    if (!claimed) {
      /* Someone got there first. Undo the account so the address is
         free to try again rather than stranded. */
      await admin.auth.admin.deleteUser(userId);
      return fail('Someone has already taken that name. Pick another.', 409);
    }
    memberId = claimed.id;
  } else {
    const { data: made, error: insErr } = await admin
      .from('class_members')
      .insert({
        class_id: klass.id,
        user_id: userId,
        display_name: fullName,
        email,
        status: 'pending',
        provisioned: true,
        requested_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (insErr || !made) {
      await admin.auth.admin.deleteUser(userId);
      return fail('Could not send your request. Try again.', 500);
    }
    memberId = made.id;
  }

  return json({
    mode: 'requested',
    class_name: klass.name,
    member_id: memberId,
    status: 'pending'
  });
});
