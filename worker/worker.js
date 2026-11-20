// Cloudflare Worker: relays Brawlhalla player data for the tracker page.
// dair.gg doesn't reliably send CORS headers, so browsers can't call it directly.
// Only numeric player IDs are relayed (not an open proxy), and only requests from the tracker's
// origins are answered; anything else (other sites, scripts, sandboxed pages) gets a 403.
//   GET /dair/{id}    -> https://api.dair.gg/v1/brawlhalla/players/{id}   (has legend levels)
//   GET /player/{id}  -> https://api.brawlhalla.com/v1/player/stats?...    (official, fresh games count)
// The official API needs a key, so the browser never calls it directly: the key lives only as a
// Worker secret — `cd worker && npx wrangler secret put BRAWLHALLA_API_KEY` — and is never
// committed to the repo. Until that secret is set, /player answers 503 (the tracker still syncs
// through /dair) instead of passing the official API's 401 through.
// The Origin check stops other websites, but scripts can fake it, so each IP is also rate limited
// (the LIMITER binding in wrangler.toml) to keep the free daily request quota from being used up.

const ALLOWED_ORIGINS = ['https://gfhnpkv.github.io'];
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

const ROUTES = {
  dair: { url: id => `https://api.dair.gg/v1/brawlhalla/players/${id}`, cacheTtl: 120 },
  player: {
    url: (id, apiKey) => `https://api.brawlhalla.com/v1/player/stats?brawlhalla_id=${id}&mode=all&api_key=${encodeURIComponent(apiKey)}`,
    cacheTtl: 30,
    needsKey: true,
  },
};

const isAllowed = origin => !!origin && (ALLOWED_ORIGINS.includes(origin) || LOCAL_ORIGIN.test(origin));

function corsHeaders(origin) {
  return isAllowed(origin)
    ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Vary': 'Origin' }
    : { 'Vary': 'Origin' };
}

function json(status, payload, headers) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const cors = corsHeaders(origin);
    if (!isAllowed(origin)) return json(403, { error: 'Only the Brawlhalla Stance Tracker can use this relay' }, cors);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (env.LIMITER && !(await env.LIMITER.limit({ key: ip })).success) {
      return json(429, { error: 'Too many requests, try again in a minute' }, { ...cors, 'Retry-After': '60' });
    }
    if (request.method !== 'GET') return json(405, { error: 'Method not allowed' }, cors);

    const match = new URL(request.url).pathname.match(/^\/(dair|player)\/(\d{1,12})$/);
    if (!match) return json(404, { error: 'Use /dair/{brawlhalla_id} or /player/{brawlhalla_id}' }, cors);

    const route = ROUTES[match[1]];
    // The official API needs a key: without the Worker secret there is no point calling it —
    // it would just answer 401. Say so plainly instead of passing the 401 through.
    if (route.needsKey && !(env && env.BRAWLHALLA_API_KEY)) {
      return json(503, { error: 'Official Brawlhalla API key is not configured on this relay (set BRAWLHALLA_API_KEY as a Worker secret)' }, cors);
    }
    try {
      const upstream = await fetch(route.url(match[2], env && env.BRAWLHALLA_API_KEY), {
        headers: { 'User-Agent': 'BrawlhallaStanceTracker/1.0 (+https://github.com/gfhnpkv/brawlhalla-stance-tracker)' },
        // Only successful answers are cached, so one upstream error isn't replayed to everyone
        cf: { cacheEverything: true, cacheTtlByStatus: { '200-299': route.cacheTtl, '300-599': 0 } },
      });
      const body = await upstream.text();
      return new Response(body, {
        status: upstream.status,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${route.cacheTtl}`, ...cors },
      });
    } catch (err) {
      return json(502, { error: 'Could not reach upstream API' }, cors);
    }
  },
};
