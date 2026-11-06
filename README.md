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

## Stance reminders
Turn on **Live** (main page or phone view). The game's API doesn't say which stance you have equipped, so the
tracker reminds you instead of checking:
- **On unlock:** when a level-up unlocks a better stance, a pop-up says which one to switch to, e.g.
  "🔓 Bödvar hit level 8: switch to Strength (best stance)".
- **After a match:** if you play that legend before confirming, you get one reminder, "Did you switch Bödvar
  to Strength?". Press **✓ Done** once it's equipped and that legend won't ask again until it unlocks something
  better. An ignored reminder doesn't repeat for that legend until Live is turned off and on again.
- Stances you had already unlocked before your first sync (or before reminders existed) count as switched, so
  old unlocks never bring reminders.

Confirmations are saved in your browser (`bh_stance_confirmed_v1`). The equipped stance you mark in the
**Stance lab** is only for your notes; reminders don't use it.

When a level is missing, your manually entered level is kept. Set levels with + / − on any legend.

Progress is saved in your browser (localStorage). Use Export/Import JSON for backups.

---
Data from the official Brawlhalla API and the dair.gg community API. Legend art © Blue Mammoth Games, used with permission. Not affiliated with Blue Mammoth Games or Ubisoft.
