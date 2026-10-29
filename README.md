# Brawlhalla Stance Tracker

Tracks your level on all 70 legends and shows which stance you've unlocked:
- **v**: target (best) stance unlocked
- **!**: standard alternative stance unlocked
- **x**: still locked

## Use it
- **Online:** https://gfhnpkv.github.io/brawlhalla-stance-tracker/ (works from any computer or phone)
- **Phone:** https://gfhnpkv.github.io/brawlhalla-stance-tracker/app.html (mobile view; add it to your home screen)
- **Locally:** `python3 server.py`, then open http://localhost:8000

## How data is fetched
dair.gg doesn't reliably allow direct browser requests, so it goes through a relay:
- locally, `server.py` (`/api/dair/{id}`, `/api/player/{id}`)
- online, the Cloudflare Worker in `worker/` (https://brawlhalla-tracker-relay.gfhnpkv.workers.dev). It only relays
  numeric player IDs and only allows requests from the GitHub Pages site and localhost.

To redeploy the Worker after changing it: `cd worker && npx wrangler@4 deploy`

## Sync
Enter your numeric Brawlhalla ID and click **Sync API**. No API key needed. Sources, in order:
1. [dair.gg](https://api.dair.gg/) community API: returns per-legend levels for every account.
2. Official Brawlhalla API v1.0 (2000 requests / 5 min): fallback; omits levels for some accounts.

When a level is missing, your manually entered level is kept. Set levels with + / − on any legend.

Progress is saved in your browser (localStorage). Use Export/Import JSON for backups.

---
Data from the official Brawlhalla API and the dair.gg community API. Not affiliated with Blue Mammoth Games or Ubisoft.
