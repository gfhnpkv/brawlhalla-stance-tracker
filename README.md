# Brawlhalla Stance Tracker

Tracks your level on all 70 legends and shows which stance you've unlocked:
- **v**: target (best) stance unlocked
- **!**: standard alternative stance unlocked
- **…**: played, but no stance unlocked yet
- **🔒**: locked: you haven't played this legend or don't own it (the API can't tell those apart)

## Use it
- **Online:** https://gfhnpkv.github.io/brawlhalla-stance-tracker/ (`index.html`: Live status, stance reminders, game history and the legend roster; responsive on phones too — add it to your home screen)
- **Stats:** https://gfhnpkv.github.io/brawlhalla-stance-tracker/stats.html (best legends and weapons for any player; includes a Coach panel: ranked 1v1 weak spots from derived stats, weapon-based advice for random mains (a weapon is judged after 5 ranked games; each item suggests legends to practice it with, and weapons you have never played show up too) plus a training plan and a since-last-visit summary that update as you play)
- **Locally:** `python3 -m http.server`, then open http://localhost:8000

The card collection, stance matrix, roadmap, compare, legend select and terminal pages were removed in
November 2026. Old links to them show a "page not found" page that links to the pages above.

Backups (More → Export backup) use the same JSON on every page, so they import on any of them.

## File map
- `index.html`, `stats.html`, `404.html`: the pages (inline CSS and page script each)
- `core.js` (shared storage, levels, portraits), `legends.js`, `goals.js`, `history.js`, `summary.js`, `shareimage.js`, `coach.js`: shared scripts
- `theme-boot.js`: applies the saved theme before the page draws
- `sw.js`, `manifest.webmanifest`, `icon.svg`: offline support and install; bump `CACHE` in `sw.js` after changes
- `portraits/`, `weapons/`, `fonts/`: pictures and fonts; `tools/`: image scripts; `worker/`: the Cloudflare relay

## How data is fetched
dair.gg doesn't reliably allow direct browser requests, so it goes through a relay:
- the Cloudflare Worker in `worker/` (https://brawlhalla-tracker-relay.gfhnpkv.workers.dev). It only relays
  numeric player IDs and only answers requests from the GitHub Pages site and localhost (anything else gets a 403).
- The browser never calls the official Brawlhalla API directly: it needs an API key, and the key lives
  only as a Worker secret, never in this repo — set it with `cd worker && npx wrangler secret put BRAWLHALLA_API_KEY`,
  then redeploy (`npx wrangler deploy`). Until the secret is set, the Worker's `/player` route answers 503
  and the tracker syncs through dair.gg only (Live mode's fresh game counts need the official API, so
  they are unavailable until then).

Coach keeps daily stat snapshots in your browser's localStorage (`bh_coach_v1`) to show progress, including a per-weapon win/loss trend and an optional one-week weapon focus with its own progress counter (7 days, then it clears itself; Reset advice keeps it); nothing is sent anywhere. Weapon win rates are estimates, not measurements: the API doesn't report wins per weapon, so each legend's ranked games count for both of its weapons, and Coach labels them as estimates.

Real win/loss per weapon is not measurable from either data source, and that was verified, not assumed: against a live dair.gg response, every weapon's games and wins are exact sums over the legends carrying that weapon (e.g. Blasters: 786 games / 465 wins, exactly the sum of its legends). What *is* measured per weapon is KOs, damage, time held and mastery level (all-mode, from dair.gg), plus ranked win rate per legend — Coach anchors its weapon advice in those measured per-legend ranked records.

To redeploy the Worker after changing it: `cd worker && npx wrangler@4 deploy`

## Sync
Enter your numeric Brawlhalla ID and click **Sync API**. No API key needed from you — the relay holds it. Sources, in order:
1. [dair.gg](https://api.dair.gg/) community API: returns per-legend levels for every account.
2. Official Brawlhalla API v1.0 (2000 requests / 5 min), through the relay only: fallback; omits levels for some accounts. It works only once `BRAWLHALLA_API_KEY` is set as a Worker secret (see above); without it, sync uses dair.gg alone.

## Stance reminders
Turn on **Live** (main page, on desktop or phone). The game's API doesn't say which stance you have equipped, so the
tracker reminds you instead of checking:
- **On unlock:** when a level-up unlocks a better stance, a pop-up says which one to switch to, e.g.
  "🔓 Bödvar hit level 8: switch to Strength (best stance)".
- **After a match:** if you play that legend before confirming, you get one reminder, "Did you switch Bödvar
  to Strength?". Press **✓ Done** once it's equipped and that legend won't ask again until it unlocks something
  better. An ignored reminder doesn't repeat for that legend until Live is turned off and on again.
- Stances you had already unlocked before your first sync (or before reminders existed) count as switched, so
  old unlocks never bring reminders.

Confirmations are saved in your browser (`bh_stance_confirmed_v1`).

When a level is missing, your manually entered level is kept. Set levels with + / − on any legend.

Progress is saved in your browser (localStorage). Use Export/Import JSON for backups.

---
Data from the official Brawlhalla API and the dair.gg community API. Legend art © Blue Mammoth Games, used with permission. Not affiliated with Blue Mammoth Games or Ubisoft.
