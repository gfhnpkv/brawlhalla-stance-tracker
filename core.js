// Shared tracker state and sync for cards.html (needs legends.js loaded first).
// Uses the same localStorage keys as index.html and app.html, so all views share data.
const Tracker = (() => {
  const KEYS = {
    levels: 'bh_levels_v1', log: 'bh_improvements_v1', id: 'bh_player_id_v1',
    stats: 'bh_legend_stats_v1', profile: 'bh_profile_v1'
  };
  const RELAY_URL = 'https://brawlhalla-tracker-relay.gfhnpkv.workers.dev';
  const MILESTONES = [3, 4, 6, 8, 11, 13, 15, 17, 40, 100];

  function load(key, fallback) {
    try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch (err) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (err) { /* storage unavailable */ }
  }

  const state = {
    levels: load(KEYS.levels, {}),
    log: load(KEYS.log, []),
    stats: load(KEYS.stats, {}),
    profile: load(KEYS.profile, null),
    id: (() => { try { return localStorage.getItem(KEYS.id) || ''; } catch (err) { return ''; } })()
  };

  const normalizeName = str => (str || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  const getLevel = name => state.levels[name] || 1;
  function statusOf(legend, lvl) {
    if (lvl >= legend.vLvl) return 'v';
    if (lvl >= legend.bangLvl) return '!';
    return 'x';
  }
  function nextTarget(legend, lvl) {
    if (lvl < legend.bangLvl) return { lvl: legend.bangLvl, status: '!', what: legend.alt };
    if (lvl < legend.vLvl) return { lvl: legend.vLvl, status: 'v', what: legend.target };
    return null;
  }
  function progressToNext(legend, lvl) {
    const next = nextTarget(legend, lvl);
    if (!next) return 1;
    const xpPct = (state.stats[legend.name] && state.stats[legend.name].xpPct) || 0;
    return Math.min(1, Math.max(0, (lvl - 1 + xpPct) / Math.max(1, next.lvl - 1)));
  }
  function milestoneName(legend, lvl) {
    if (lvl === 40) return 'Challenge Stance';
    if (lvl === 100) return 'Gold Name';
    return `${legend.stances[lvl]} stance`;
  }
  function logEntry(legend, oldLvl, newLvl) {
    const newStatus = statusOf(legend, newLvl);
    return {
      legend: legend.name, oldLvl, newLvl, oldStatus: statusOf(legend, oldLvl), newStatus,
      stanceUnlocked: newStatus === 'v' ? legend.target : (newStatus === '!' ? legend.alt : 'Level Up'),
      ts: Date.now()
    };
  }

  function setLevel(name, value) {
    const legend = LEGENDS_DB.find(l => l.name === name);
    if (!legend) return;
    const newLvl = Math.max(1, Math.min(100, parseInt(value, 10) || 1));
    const oldLvl = getLevel(name);
    if (newLvl === oldLvl) return;
    state.levels[name] = newLvl;
    if (newLvl > oldLvl) {
      state.log.push(logEntry(legend, oldLvl, newLvl));
      save(KEYS.log, state.log);
    }
    save(KEYS.levels, state.levels);
  }

  function setId(id) {
    state.id = id;
    try { localStorage.setItem(KEYS.id, id); } catch (err) { /* storage unavailable */ }
  }

  // dair.gg has per-legend levels for every account (through the relay, since it doesn't
  // reliably allow browser requests); the official API is the fallback.
  function relayBase() {
    return /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? '/api' : RELAY_URL;
  }
  function fromDair(json) {
    const d = json && json.data;
    if (!d || !Array.isArray(d.legends)) return null;
    return {
      name: d.name, level: d.stats && d.stats.level, games: d.stats && d.stats.games,
      wins: d.stats && d.stats.wins, time: d.stats && d.stats.matchtime,
      legends: d.legends.map(l => {
        const st = l.stats || {};
        return {
          legend_id: l.id, legend_name_key: l.name, level: st.level, games: st.games, wins: st.wins,
          match_time: st.matchtime, kos: st.kos, xp_percentage: st.xp_percentage,
          weapons: [l.weapon_one && l.weapon_one.name, l.weapon_two && l.weapon_two.name]
        };
      })
    };
  }
  async function fetchPlayer(bhId) {
    const relay = relayBase();
    const sources = [
      { url: `${relay}/dair/${bhId}`, transform: fromDair },
      { url: `https://api.brawlhalla.com/v1/player/stats?brawlhalla_id=${bhId}&mode=all` },
      { url: `${relay}/player/${bhId}` }
    ];
    let error = 'Could not reach the Brawlhalla API.';
    for (const { url, transform } of sources) {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) {
          error = res.status === 429 ? 'Rate limited, try again in a minute.'
            : res.status === 404 ? 'No player found with that ID.'
            : `API returned HTTP ${res.status}`;
          continue;
        }
        const json = await res.json();
        const data = transform ? transform(json) : json;
        if (data && Array.isArray(data.legends) && data.legends.length) return { data };
        // The official API answers unknown IDs with an empty result
        error = 'No player found with that ID.';
      } catch (err) { /* try next source */ }
    }
    return { error };
  }

  // Turn an API response into { profile fields, legends: [{ name, legend, level (or null), stats }] }
  function parsePlayer(bhId, data) {
    const legends = [];
    data.legends.forEach(apiLeg => {
      let name = null;
      if (apiLeg.legend_name_key) {
        const found = LEGENDS_DB.find(l => normalizeName(l.name) === normalizeName(apiLeg.legend_name_key));
        if (found) name = found.name;
      }
      if (!name) name = BRAWLHALLA_ID_MAP[apiLeg.legend_id];
      const legend = LEGENDS_DB.find(l => l.name === name);
      if (!legend) return;
      const lvl = parseInt(apiLeg.level, 10);
      legends.push({
        name, legend,
        level: Number.isFinite(lvl) && lvl >= 1 ? Math.min(100, lvl) : null,
        stats: {
          games: apiLeg.games || 0, wins: apiLeg.wins || 0, time: apiLeg.match_time || 0,
          kos: apiLeg.kos != null ? apiLeg.kos : null,
          xpPct: apiLeg.xp_percentage != null ? apiLeg.xp_percentage : null,
          weapons: apiLeg.weapons || null
        }
      });
    });
    return {
      id: bhId, name: data.name || 'Player', level: data.level || null, games: data.games, wins: data.wins,
      time: data.time || data.legends.reduce((sum, l) => sum + (l.match_time || 0), 0),
      legends
    };
  }

  // Load any player without touching saved data (used by compare.html)
  async function lookup(bhId) {
    if (!/^\d+$/.test(bhId || '')) return { error: 'Brawlhalla ID must be a number.' };
    const { data, error } = await fetchPlayer(bhId);
    if (!data) return { error };
    return { player: parsePlayer(bhId, data) };
  }

  async function sync() {
    const bhId = state.id;
    if (!/^\d+$/.test(bhId)) return { error: 'Enter your Brawlhalla ID first.' };
    const { data, error } = await fetchPlayer(bhId);
    if (!data) return { error };
    const player = parsePlayer(bhId, data);

    if (state.profile && state.profile.id !== bhId) {
      // Different player: start fresh so data doesn't mix between accounts
      state.levels = {}; state.stats = {}; state.log = [];
    }
    let updated = 0, missing = 0;
    const unlocks = [];
    player.legends.forEach(({ name, legend, level, stats }) => {
      state.stats[name] = { ...stats, weapons: stats.weapons || (state.stats[name] && state.stats[name].weapons) || [] };
      if (level === null) { missing++; return; }
      const oldLvl = getLevel(name);
      state.levels[name] = level;
      MILESTONES.filter(m => oldLvl < m && level >= m).forEach(m => unlocks.push({ legend: name, lvl: m, what: milestoneName(legend, m) }));
      if (level > oldLvl) state.log.push(logEntry(legend, oldLvl, level));
      updated++;
    });

    const { legends, ...profile } = player;
    state.profile = { ...profile, syncedAt: Date.now() };
    save(KEYS.levels, state.levels);
    save(KEYS.log, state.log);
    save(KEYS.stats, state.stats);
    save(KEYS.profile, state.profile);
    return { updated, missing, unlocks };
  }

  return { state, getLevel, statusOf, nextTarget, progressToNext, setLevel, setId, sync, lookup };
})();
