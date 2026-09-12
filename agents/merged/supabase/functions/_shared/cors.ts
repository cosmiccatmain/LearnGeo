/* Shared by all three functions. The app is a static site on a
   different origin from the functions, so every response needs these
   and every function needs to answer the preflight. */

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

export function fail(message: string, status = 400): Response {
  return json({ error: message }, status);
}

export function preflight(req: Request): Response | null {
  return req.method === 'OPTIONS'
    ? new Response('ok', { headers: corsHeaders })
    : null;
}

/* A password a teacher can read aloud without spelling it out.
   No lookalike characters, no punctuation. */
export function suggestPassword(): string {
  const abc = 'abcdefghjkmnpqrstuvwxyz';
  const num = '23456789';
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += abc[Math.floor(Math.random() * abc.length)];
  }
  for (let i = 0; i < 3; i++) {
    out += num[Math.floor(Math.random() * num.length)];
  }
  return out;
}

export const MIN_PASSWORD = 8;
