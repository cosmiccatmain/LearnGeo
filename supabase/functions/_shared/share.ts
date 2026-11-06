/* Identity for the screen-share functions.

   The caller is whoever the bearer JWT says they are. A user id in the
   JSON body is never trusted. Viewer permission is the SQL function
   screen_share_viewer_ok, which requires a live ultra session opened by
   the site owner — the same bar as Screen monitoring, and stricter than
   ultra_activity (any ultra session can see view names). */

import { createClient, SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { fail } from './cors.ts';
import { adminClient } from './auth.ts';

export type Caller = {
  id: string;
  email: string;
  metadata: Record<string, unknown>;
  asCaller: SupabaseClient;
  admin: SupabaseClient;
};

export function isCaller(v: Caller | Response): v is Caller {
  return !(v instanceof Response);
}

export async function requireCaller(req: Request): Promise<Caller | Response> {
  const header = req.headers.get('Authorization') ?? '';
  if (!header.toLowerCase().startsWith('bearer ')) {
    return fail('Sign in again and retry.', 401);
  }

  const asCaller = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    {
      global: { headers: { Authorization: header } },
      auth: { persistSession: false, autoRefreshToken: false }
    }
  );

  const { data, error } = await asCaller.auth.getUser();
  if (error || !data?.user) return fail('Sign in again and retry.', 401);

  const meta = data.user.user_metadata;
  return {
    id: data.user.id,
    email: (data.user.email || '').toLowerCase(),
    metadata: meta && typeof meta === 'object' ? meta as Record<string, unknown> : {},
    asCaller,
    admin: adminClient()
  };
}

export function missingFn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === 'PGRST202') return true;
  return /could not find the function|schema cache/i.test(error.message ?? '');
}

/* my_ban() returns a row only when this account is banned. Empty means
   not banned. A failure here refuses the share rather than guessing. */
export async function assertNotBanned(asCaller: SupabaseClient): Promise<Response | null> {
  const { data, error } = await asCaller.rpc('my_ban');
  if (error) {
    if (missingFn(error)) return null;
    return fail('Could not check whether this account is banned.', 500);
  }
  const rows = Array.isArray(data) ? data : data ? [data] : [];
  const banned = rows.some((row) => {
    if (!row || typeof row !== 'object') return false;
    return (row as { banned?: boolean }).banned === true;
  });
  if (banned) return fail('This account is banned.', 403);
  return null;
}

export async function displayName(caller: Caller): Promise<string> {
  const { data } = await caller.admin
    .from('profiles')
    .select('display_name')
    .eq('id', caller.id)
    .maybeSingle();
  const fromProfile = data && typeof data.display_name === 'string'
    ? data.display_name.trim()
    : '';
  const fromMeta = typeof caller.metadata.display_name === 'string'
    ? caller.metadata.display_name.trim()
    : '';
  const fromEmail = caller.email ? caller.email.split('@')[0] : '';
  return (fromProfile || fromMeta || fromEmail || 'Explorer').slice(0, 40);
}

export async function viewerAllowed(
  caller: Caller,
  sessionToken: string
): Promise<Response | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionToken)) {
    return fail('Open UltraAdmin again.', 401);
  }
  const { data, error } = await caller.asCaller.rpc('screen_share_viewer_ok', {
    p_token: sessionToken
  });
  if (error) {
    if (missingFn(error)) {
      return fail('Run supabase/deployed/0012_screen_shares.sql on the database.', 500);
    }
    return fail('Only the site owner can watch a share.', 403);
  }
  if (data !== true) return fail('Only the site owner can watch a share.', 403);
  return null;
}
