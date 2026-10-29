# Brawlhalla Stance Tracker

Tracks your level on all 70 legends and shows which stance you've unlocked:
- **v**: target (best) stance unlocked
- **!**: standard alternative stance unlocked
- **x**: still locked

## Run
Just double-click `index.html`. No server or API key needed.

(Optional) `python3 server.py` serves it at http://localhost:8000 and adds a fallback API relay.

## Sync
Enter your numeric Brawlhalla ID and click **Sync API**. No API key needed. Sources, in order:
1. [dair.gg](https://api.dair.gg/) community API: returns per-legend levels for every account.
2. Official Brawlhalla API v1.0 (2000 requests / 5 min): fallback; omits levels for some accounts.

When a level is missing, your manually entered level is kept. Set levels with + / − on any legend.

Progress is saved in your browser (localStorage). Use Export/Import JSON for backups.

---
Data from the official Brawlhalla API and the dair.gg community API. Not affiliated with Blue Mammoth Games or Ubisoft.
