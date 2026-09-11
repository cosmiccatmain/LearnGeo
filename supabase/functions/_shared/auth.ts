/* Both teacher-side functions need the same two steps: work out who is
   calling from their own JWT, then prove they own the class the member
   they named belongs to. Never trust a caller id from the body. */

import { createClient, SupabaseClient } from 'jsr:@supabase/supabase-js@2';

export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

/* The caller's own id, read from the bearer token they sent. */
export async function callerId(req: Request): Promise<string | null> {
  const header = req.headers.get('Authorization') ?? '';
  if (!header.toLowerCase().startsWith('bearer ')) return null;

  const asCaller = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    {
      global: { headers: { Authorization: header } },
      auth: { persistSession: false, autoRefreshToken: false }
    }
  );

  const { data, error } = await asCaller.auth.getUser();
  if (error || !data?.user) return null;
  return data.user.id;
}

export type Seat = {
  id: string;
  class_id: string;
  user_id: string | null;
  display_name: string;
  status: string;
  provisioned: boolean;
};

/* Resolve a member id to its seat, but only if `teacherId` owns the
   class it sits in. Returns null when they do not, which the caller
   should report as a plain not-found rather than a permission error —
   there is no reason to confirm that someone else's member id exists. */
export async function seatOwnedBy(
  admin: SupabaseClient,
  memberId: string,
  teacherId: string
): Promise<Seat | null> {
  const { data: seat } = await admin
    .from('class_members')
    .select('id, class_id, user_id, display_name, status, provisioned')
    .eq('id', memberId)
    .maybeSingle();
  if (!seat) return null;

  const { data: klass } = await admin
    .from('classes')
    .select('id')
    .eq('id', seat.class_id)
    .eq('owner_id', teacherId)
    .maybeSingle();
  if (!klass) return null;

  return seat as Seat;
}
