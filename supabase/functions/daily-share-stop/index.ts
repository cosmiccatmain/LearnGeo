/* ------------------------------------------------------------------
   daily-share-stop

   Ends a share. The signed-in account can stop only its own room
   (lg-u-{their user id}): the Daily room is deleted and the row is
   marked stopped.

   The site owner, with a live UltraAdmin session, may stop a room
   they were given the name of. Stopping a watch in the browser does
   not call this — leaving the call is enough, and deleting the room
   would cut off the student.

   A missing Daily room is success. The API key never leaves the
   function.
------------------------------------------------------------------- */

import { fail, json, preflight } from '../_shared/cors.ts';
import {
  DailyFault,
  ROOM_RE,
  dailyConfig,
  deleteRoom,
  roomNameFor
} from '../_shared/daily.ts';
import {
  Caller,
  assertNotBanned,
  isCaller,
  missingFn,
  requireCaller,
  viewerAllowed
} from '../_shared/share.ts';

Deno.serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return fail('POST only', 405);

  let body: Record<string, unknown> = {};
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return fail('expected a json body');
  }

  const callerOrFail = await requireCaller(req);
  if (!isCaller(callerOrFail)) return callerOrFail;

  const banned = await assertNotBanned(callerOrFail.asCaller);
  if (banned) return banned;

  try {
    return await stop(callerOrFail, body);
  } catch (err) {
    const status = err instanceof DailyFault ? err.status : 500;
    const message = err instanceof Error ? err.message : 'Could not stop that share.';
    return fail(message, status);
  }
});

async function stop(caller: Caller, body: Record<string, unknown>): Promise<Response> {
  const own = roomNameFor(caller.id);
  const requested = String(body.room_name ?? '').trim().toLowerCase();
  const room = !requested || requested === own ? own : requested;

  if (room !== own) {
    const denied = await viewerAllowed(caller, String(body.p_token ?? '').trim());
    if (denied) return denied;
    if (!ROOM_RE.test(room)) return fail('Unknown room.', 400);
  }

  const cfg = dailyConfig();
  const roomDeleted = await deleteRoom(cfg.key, room);
  const userId = room === own ? caller.id : room.slice('lg-u-'.length);

  if (room === own) {
    const { error } = await caller.asCaller.rpc('report_screen_share', {
      p_status: 'stopped',
      p_room_name: room
    });
    if (error && !missingFn(error)) {
      return fail('Could not mark that share stopped.', 500);
    }
  } else {
    const { error } = await caller.admin
      .from('screen_shares')
      .update({ status: 'stopped', last_seen_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('room_name', room);
    if (error) return fail('Could not mark that share stopped.', 500);
  }

  return json({ stopped: true, roomName: room, roomDeleted });
}
