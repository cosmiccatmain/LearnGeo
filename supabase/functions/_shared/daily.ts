/* Daily REST, server-side only.

   DAILY_API_KEY is read from the Edge Function environment and sent as
   the Authorization header to api.daily.co. It is never returned, logged,
   or copied into a response. Callers must pass the meeting token Daily
   returns, and nothing else, back to the browser.

   DAILY_DOMAIN is the meeting hostname (learngeo.daily.co), not the
   REST host. Room URLs still prefer the url Daily itself returns. */

export const TOKEN_TTL_SEC = 2 * 60 * 60;
export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const ROOM_RE =
  /^lg-u-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const API = 'https://api.daily.co/v1';

export class DailyFault extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = 'DailyFault';
    this.status = status;
  }
}

export type DailyConfig = { key: string; domain: string };

export function dailyConfig(): DailyConfig {
  const key = (Deno.env.get('DAILY_API_KEY') ?? '').trim();
  const domain = normalizeDomain(Deno.env.get('DAILY_DOMAIN') ?? '');
  if (!key || !domain) {
    throw new DailyFault(
      'Screen sharing is not configured yet. Set the DAILY_API_KEY and DAILY_DOMAIN secrets on the Supabase project.',
      500
    );
  }
  return { key, domain };
}

export function normalizeDomain(raw: string): string {
  let d = raw.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, '').split('/')[0].replace(/\.$/, '');
  if (!d || d === 'api.daily.co' || !/^[a-z0-9.-]+$/.test(d)) return '';
  return d;
}

export function roomNameFor(userId: string): string {
  const id = userId.trim().toLowerCase();
  if (!UUID_RE.test(id)) {
    throw new DailyFault('This account cannot open a screen-share room.', 400);
  }
  return 'lg-u-' + id;
}

export function userIdFromRoom(room: string): string | null {
  if (!ROOM_RE.test(room)) return null;
  return room.slice(5);
}

export type DailyResult = { ok: boolean; status: number; body: Record<string, unknown> | null };

export async function dailyFetch(
  key: string,
  method: string,
  path: string,
  body?: unknown
): Promise<DailyResult> {
  let res: Response;
  try {
    res = await fetch(API + path, {
      method,
      headers: {
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json'
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch {
    throw new DailyFault('Could not reach Daily. Try again.', 502);
  }

  const text = await res.text();
  let parsed: Record<string, unknown> | null = null;
  if (text) {
    try {
      const value = JSON.parse(text);
      parsed = value && typeof value === 'object' ? value as Record<string, unknown> : null;
    } catch {
      parsed = null;
    }
  }
  return { ok: res.ok, status: res.status, body: parsed };
}

export function dailyFault(res: DailyResult): DailyFault {
  if (res.status === 429) return new DailyFault('Daily is busy. Try again in a minute.', 503);
  return new DailyFault(safeInfo(res.status, res.body), 502);
}

/* Daily's error text is safe to show only after anything that looks
   like a credential is stripped. The API key itself is never part of
   the body we send back. */
export function safeInfo(status: number, body: Record<string, unknown> | null): string {
  let info = '';
  if (body) info = String(body.info || body.error || '');
  info = info.replace(/bearer\s+\S+/gi, '').replace(/\s+/g, ' ').trim().slice(0, 160);
  if (/daily_api_key|api[_-]?key|sk_live|sk_test/i.test(info)) info = '';
  return info
    ? 'Daily refused that (' + status + '): ' + info
    : 'Daily refused that (' + status + ').';
}

export function roomProperties(exp: number): Record<string, unknown> {
  return {
    enable_screenshare: true,
    start_video_off: true,
    start_audio_off: true,
    enable_chat: false,
    enable_knocking: false,
    max_participants: 3,
    eject_at_room_exp: true,
    exp
  };
}

export function expIn(seconds = TOKEN_TTL_SEC): number {
  return Math.floor(Date.now() / 1000) + seconds;
}

export function urlOf(
  body: Record<string, unknown> | null,
  domain: string,
  room: string
): string {
  const url = body && typeof body.url === 'string' ? body.url : '';
  if (url.startsWith('https://')) return url;
  return 'https://' + domain + '/' + room;
}

/* Create the private room, or refresh one that is already private.
   A live meeting sometimes rejects property edits; the existing private
   room is still usable, so that failure does not block a new token. */
/* Free Daily accounts reject max_participants. Drop it and try once
   more so a new domain still opens a private room. */
function withoutCap(properties: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const key of Object.keys(properties)) {
    if (key !== 'max_participants') next[key] = properties[key];
  }
  return next;
}

function capRefused(res: DailyResult): boolean {
  const info = String((res.body && (res.body.info || res.body.error)) || '');
  return /max_participants|pay-as-you-go|upgrade/i.test(info);
}

export async function ensureRoom(
  key: string,
  domain: string,
  name: string,
  exp: number
): Promise<string> {
  const properties = roomProperties(exp);
  const existing = await dailyFetch(key, 'GET', '/rooms/' + name);
  if (existing.ok) {
    let updated = await dailyFetch(key, 'POST', '/rooms/' + name, {
      privacy: 'private',
      properties
    });
    if (!updated.ok && capRefused(updated)) {
      updated = await dailyFetch(key, 'POST', '/rooms/' + name, {
        privacy: 'private',
        properties: withoutCap(properties)
      });
    }
    if (updated.ok) return urlOf(updated.body, domain, name);
    if (existing.body && existing.body.privacy === 'private') {
      return urlOf(existing.body, domain, name);
    }
    throw dailyFault(updated);
  }
  if (existing.status !== 404) throw dailyFault(existing);

  let created = await dailyFetch(key, 'POST', '/rooms', {
    name,
    privacy: 'private',
    properties
  });
  if (!created.ok && capRefused(created)) {
    created = await dailyFetch(key, 'POST', '/rooms', {
      name,
      privacy: 'private',
      properties: withoutCap(properties)
    });
  }
  if (created.ok) return urlOf(created.body, domain, name);

  /* Lost a race with another request that created the same room. */
  const again = await dailyFetch(key, 'GET', '/rooms/' + name);
  if (again.ok && again.body && again.body.privacy === 'private') {
    return urlOf(again.body, domain, name);
  }
  throw dailyFault(created);
}

export async function mintToken(
  key: string,
  properties: Record<string, unknown>
): Promise<string> {
  const res = await dailyFetch(key, 'POST', '/meeting-tokens', { properties });
  if (!res.ok) throw dailyFault(res);
  const token = res.body && typeof res.body.token === 'string' ? res.body.token : '';
  if (!token) throw new DailyFault('Daily did not return a meeting token.', 502);
  return token;
}

export async function deleteRoom(key: string, name: string): Promise<boolean> {
  const res = await dailyFetch(key, 'DELETE', '/rooms/' + name);
  if (res.ok || res.status === 404) return true;
  return false;
}
