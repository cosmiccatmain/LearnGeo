/* ------------------------------------------------------------------
   daily-share-token

   Mints a short Daily meeting token. Two roles, one endpoint:

     { role: "publisher" }
       Signed-in account, not banned. Ensures a private room named
       lg-u-{their user id} and a token that can share a screen.
       Camera and microphone stay off. is_owner is false, so this
       token cannot start a recording.

     { role: "viewer", room_name, p_token }
       The site owner, with the same live UltraAdmin session
       list_screen_shares requires. Subscribe only. The room must
       already be a live share — this does not create one.

   The Daily API key stays in the function environment. The JSON
   answer is the room url, the room name, and the meeting token.
------------------------------------------------------------------- */

import { fail, json, preflight } from '../_shared/cors.ts';
import {
  DailyFault,
  TOKEN_TTL_SEC,
  ROOM_RE,
  dailyConfig,
  dailyFault,
  dailyFetch,
  deleteRoom,
  ensureRoom,
  expIn,
  mintToken,
  roomNameFor,
  urlOf
} from '../_shared/daily.ts';
import {
  Caller,
  assertNotBanned,
  displayName,
  isCaller,
  missingFn,
  requireCaller,
  viewerAllowed
} from '../_shared/share.ts';

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

  const callerOrFail = await requireCaller(req);
  if (!isCaller(callerOrFail)) return callerOrFail;

  const banned = await assertNotBanned(callerOrFail.asCaller);
  if (banned) return banned;

  const role = String(body.role ?? '');
  try {
    if (role === 'publisher') return await publisher(callerOrFail);
    if (role === 'viewer') return await viewer(callerOrFail, body);
    return fail('role must be publisher or viewer');
  } catch (err) {
    const status = err instanceof DailyFault ? err.status : 500;
    const message = err instanceof Error ? err.message : 'Could not open a screen share.';
    return fail(message, status);
  }
});

async function publisher(caller: Caller): Promise<Response> {
  const cfg = dailyConfig();
  const room = roomNameFor(caller.id);
  const exp = expIn();
  const roomUrl = await ensureRoom(cfg.key, cfg.domain, room, exp);
  const name = await displayName(caller);

  const token = await mintToken(cfg.key, {
    room_name: room,
    user_id: caller.id,
    user_name: name,
    is_owner: false,
    enable_screenshare: true,
    start_video_off: true,
    start_audio_off: true,
    eject_at_token_exp: true,
    exp,
    permissions: {
      hasPresence: true,
      canSend: ['screenVideo'],
      canReceive: { base: true },
      canAdmin: false
    }
  });

  const { error } = await caller.asCaller.rpc('report_screen_share', {
    p_status: 'live',
    p_room_name: room
  });
  if (error) {
    if (missingFn(error)) {
      await deleteRoom(cfg.key, room);
      return fail('Run supabase/deployed/0012_screen_shares.sql on the database.', 500);
    }
    return fail('Could not record that this share is live.', 500);
  }

  return json({ roomUrl, token, roomName: room, exp });
}

async function viewer(caller: Caller, body: Record<string, unknown>): Promise<Response> {
  const denied = await viewerAllowed(caller, String(body.p_token ?? '').trim());
  if (denied) return denied;

  const room = String(body.room_name ?? '').trim().toLowerCase();
  if (!ROOM_RE.test(room)) return fail('Unknown room.', 400);

  const userId = room.slice('lg-u-'.length);
  const { data: row, error } = await caller.admin
    .from('screen_shares')
    .select('user_id, room_name, status, last_seen_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return fail('Could not look up that share.', 500);
  if (!row || row.room_name !== room || row.status !== 'live' || !fresh(row.last_seen_at)) {
    return fail('That share is not live.', 404);
  }

  const cfg = dailyConfig();
  const existing = await dailyFetch(cfg.key, 'GET', '/rooms/' + room);
  if (existing.status === 404) return fail('That share is not live.', 404);
  if (!existing.ok) throw dailyFault(existing);

  const exp = expIn(TOKEN_TTL_SEC);
  const name = await displayName(caller);
  const token = await mintToken(cfg.key, {
    room_name: room,
    user_id: caller.id,
    user_name: name,
    is_owner: false,
    enable_screenshare: false,
    start_video_off: true,
    start_audio_off: true,
    eject_at_token_exp: true,
    exp,
    permissions: {
      hasPresence: true,
      canSend: false,
      canReceive: { base: true },
      canAdmin: false
    }
  });

  return json({
    roomUrl: urlOf(existing.body, cfg.domain, room),
    token,
    roomName: room,
    exp
  });
}

function fresh(seen: unknown): boolean {
  const t = typeof seen === 'string' ? Date.parse(seen) : NaN;
  if (!t) return false;
  return Date.now() - t < 2 * 60 * 1000;
}
