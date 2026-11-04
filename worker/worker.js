// Cloudflare Worker: relays Brawlhalla player data for the tracker page.
// dair.gg doesn't reliably send CORS headers, so browsers can't call it directly.
// Only numeric player IDs are relayed (not an open proxy), and only requests from the tracker's
// origins are answered; anything else (other sites, scripts, sandboxed pages) gets a 403.
//   GET /dair/{id}    -> https://api.dair.gg/v1/brawlhalla/players/{id}   (has legend levels)
//   GET /player/{id}  -> https://api.brawlhalla.com/v1/player/stats?...    (official, fresh games count)
// The Origin check stops other websites, but scripts can fake it, so each IP is also rate limited
// (the LIMITER binding in wrangler.toml) to keep the free daily request quota from being used up.

const ALLOWED_ORIGINS = ['https://gfhnpkv.github.io'];
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

const ROUTES = {
  dair: { url: id => `https://api.dair.gg/v1/brawlhalla/players/${id}`, cacheTtl: 120 },
  player: { url: id => `https://api.brawlhalla.com/v1/player/stats?brawlhalla_id=${id}&mode=all`, cacheTtl: 30 },
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
    try {
      const upstream = await fetch(route.url(match[2]), {
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
