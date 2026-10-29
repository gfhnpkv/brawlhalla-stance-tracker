// Cloudflare Worker: relays Brawlhalla player data for the tracker page.
// dair.gg doesn't reliably send CORS headers, so browsers can't call it directly.
// Only numeric player IDs are relayed (not an open proxy), and only the tracker's origins get CORS.
//   GET /dair/{id}    -> https://api.dair.gg/v1/brawlhalla/players/{id}   (has legend levels)
//   GET /player/{id}  -> https://api.brawlhalla.com/v1/player/stats?...    (official, fresh games count)

const ALLOWED_ORIGINS = [
  'https://gfhnpkv.github.io',
  'null', // index.html opened directly from disk
];
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

const ROUTES = {
  dair: { url: id => `https://api.dair.gg/v1/brawlhalla/players/${id}`, cacheTtl: 120 },
  player: { url: id => `https://api.brawlhalla.com/v1/player/stats?brawlhalla_id=${id}&mode=all`, cacheTtl: 30 },
};

function corsHeaders(origin) {
  const ok = origin && (ALLOWED_ORIGINS.includes(origin) || LOCAL_ORIGIN.test(origin));
  return ok
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
  async fetch(request) {
    const cors = corsHeaders(request.headers.get('Origin'));
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET') return json(405, { error: 'Method not allowed' }, cors);

    const match = new URL(request.url).pathname.match(/^\/(dair|player)\/(\d{1,12})$/);
    if (!match) return json(404, { error: 'Use /dair/{brawlhalla_id} or /player/{brawlhalla_id}' }, cors);

    const route = ROUTES[match[1]];
    try {
      const upstream = await fetch(route.url(match[2]), {
        headers: { 'User-Agent': 'BrawlhallaStanceTracker/1.0 (+https://github.com/gfhnpkv/brawlhalla-stance-tracker)' },
        cf: { cacheTtl: route.cacheTtl, cacheEverything: true },
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
