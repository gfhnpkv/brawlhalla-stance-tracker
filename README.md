# Brawlhalla Stance Tracker

Tracks your level on all 70 legends and shows which stance you've unlocked:
- **v**: target (best) stance unlocked
- **!**: standard alternative stance unlocked
- **…**: played, but no stance unlocked yet
- **🔒**: locked: you haven't played this legend or don't own it (the API can't tell those apart)

## Use it
- **Online:** https://gfhnpkv.github.io/brawlhalla-stance-tracker/ (works from any computer or phone)
- **Phone:** https://gfhnpkv.github.io/brawlhalla-stance-tracker/app.html (mobile view; add it to your home screen)
- **Stance lab:** https://gfhnpkv.github.io/brawlhalla-stance-tracker/stances.html (what each stance does to every legend's stats, with your picks and notes)
- **Locally:** `python3 server.py`, then open http://localhost:8000

The card collection, stance matrix, roadmap, compare, legend select and terminal pages were removed in
November 2026. Old links to them show a "page not found" page that links to the three pages above.

## How data is fetched
dair.gg doesn't reliably allow direct browser requests, so it goes through a relay:
- locally, `server.py` (`/api/dair/{id}`, `/api/player/{id}`)
- online, the Cloudflare Worker in `worker/` (https://brawlhalla-tracker-relay.gfhnpkv.workers.dev). It only relays
  numeric player IDs and only answers requests from the GitHub Pages site and localhost (anything else gets a 403).

To redeploy the Worker after changing it: `cd worker && npx wrangler@4 deploy`

## Sync
Enter your numeric Brawlhalla ID and click **Sync API**. No API key needed. Sources, in order:
1. [dair.gg](https://api.dair.gg/) community API: returns per-legend levels for every account.
2. Official Brawlhalla API v1.0 (2000 requests / 5 min): fallback; omits levels for some accounts.

## Stance check after each match
Turn on **Live** (main page or phone view). When a match ends, the tracker looks at which legend you played and
compares the stance you have equipped in the **Stance lab** with the best stance unlocked at that legend's level.
If they don't match, you get an alert telling you which stance to switch to. It checks again when a level-up
unlocks a new best stance. The game's API doesn't say which stance is equipped, so keep the Stance lab up to date.

When a level is missing, your manually entered level is kept. Set levels with + / − on any legend.

Progress is saved in your browser (localStorage). Use Export/Import JSON for backups.

---
Data from the official Brawlhalla API and the dair.gg community API. Legend art © Blue Mammoth Games, used with permission. Not affiliated with Blue Mammoth Games or Ubisoft.
