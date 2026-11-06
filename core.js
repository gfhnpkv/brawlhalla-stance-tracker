// Shared tracker state and sync (needs legends.js loaded first).
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

  // Saved and imported data is checked before use, so a broken or hand-edited backup can't
  // crash the pages or put its own markup on them.
  const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const legendNamed = name => (typeof name === 'string' ? LEGENDS_DB.find(l => l.name === name) : undefined);
  const toLevel = v => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= 1 ? Math.min(100, n) : null; };
  const toNum = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const clean = {
    levels(v) {
      const out = {};
      if (isObj(v)) Object.keys(v).forEach(name => { const lvl = toLevel(v[name]); if (legendNamed(name) && lvl) out[name] = lvl; });
      return out;
    },
    // Entries are rebuilt from legends.js, so only the legend, levels and time come from the data
    log(v) {
      if (!Array.isArray(v)) return [];
      return v.filter(e => isObj(e) && legendNamed(e.legend) && toLevel(e.oldLvl) && toLevel(e.newLvl) && toNum(e.ts) != null)
        .map(e => ({ ...logEntry(legendNamed(e.legend), toLevel(e.oldLvl), toLevel(e.newLvl)), ts: e.ts }));
    },
    stats(v) {
      const out = {};
      if (isObj(v)) Object.keys(v).forEach(name => {
        const s = v[name];
        if (!legendNamed(name) || !isObj(s)) return;
        out[name] = {
          games: toNum(s.games) || 0, wins: toNum(s.wins) || 0, time: toNum(s.time) || 0, kos: toNum(s.kos), xpPct: toNum(s.xpPct),
          weapons: Array.isArray(s.weapons) ? s.weapons.filter(w => typeof w === 'string') : []
        };
      });
      return out;
    },
    profile(v) {
      if (!isObj(v) || !/^\d+$/.test(String(v.id))) return null;
      return {
        id: String(v.id), name: typeof v.name === 'string' ? v.name : 'Player', level: toNum(v.level),
        games: toNum(v.games), wins: toNum(v.wins), time: toNum(v.time), syncedAt: toNum(v.syncedAt) || 0
      };
    },
    id: v => (/^\d+$/.test(String(v || '')) ? String(v) : '')
  };
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (err) { /* storage unavailable */ }
  }

  const state = {};
  // (Re)reads everything from localStorage; pages call it when another tab saves
  function reload() {
    // Levels and stats go in first: rebuilding the log works out statuses, which read them
    state.levels = clean.levels(load(KEYS.levels, {}));
    state.stats = clean.stats(load(KEYS.stats, {}));
    Object.assign(state, {
      log: clean.log(load(KEYS.log, [])),
      profile: clean.profile(load(KEYS.profile, null)),
      id: clean.id((() => { try { return localStorage.getItem(KEYS.id); } catch (err) { return ''; } })())
    });
  }
  const isDataKey = key => key == null || Object.values(KEYS).includes(key);

  const normalizeName = str => (str || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  const getLevel = name => state.levels[name] || 1;
  // A legend counts as played once it has games in the synced stats or a level above 1.
  // The API can't tell owned from not owned, so an unplayed legend is shown as locked either way.
  function hasPlayed(name, lvl = getLevel(name)) {
    const stats = state.stats && state.stats[name];
    return lvl > 1 || !!(stats && stats.games > 0);
  }
  // 'v' best stance, '!' standard stance, 'p' played but no stance yet, 'x' locked (not played / not owned)
  function statusOf(legend, lvl) {
    if (lvl >= legend.vLvl) return 'v';
    if (lvl >= legend.bangLvl) return '!';
    return hasPlayed(legend.name, lvl) ? 'p' : 'x';
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

  // ---------- stance reminders ----------
  // The API can't tell which stance is equipped, so after a better stance unlocks the pages remind
  // the player to switch until they press Done. CONFIRMED_KEY holds, per legend, the stance key
  // confirmed last: 'base', a stat ('str') or 'super_' + stat.
  // The stance lab (stances.html) keeps its own equipped marking under LAB_KEY; reminders don't read it.
  const LAB_KEY = 'bh_stance_lab_v1';
  const CONFIRMED_KEY = 'bh_stance_confirmed_v1';
  const STAT_KEY = { Strength: 'str', Dexterity: 'dex', Dex: 'dex', Defense: 'def', Speed: 'spd' };
  const STAT_LABEL = { str: 'Strength', dex: 'Dexterity', def: 'Defense', spd: 'Speed' };
  const stanceLabel = key => (key === 'base' ? 'Base' : key.startsWith('super_') ? `Super ${STAT_LABEL[key.slice(6)]}` : STAT_LABEL[key]);
  function stanceKeyOf(name) {
    if (name === 'Base') return 'base';
    const sup = name.startsWith('Super ');
    return (sup ? 'super_' : '') + STAT_KEY[name.replace('Super ', '')];
  }
  function unlockLevel(legend, key) {
    if (key === 'base') return 1;
    const lvl = Object.keys(legend.stances).find(l => stanceKeyOf(legend.stances[l]) === key);
    return lvl ? Number(lvl) : Infinity;
  }
  // "Strength (takes Dex) or Speed" -> ['str', 'spd']; the "(takes …)" notes aren't options
  const stancesIn = text => [...text.replace(/\(takes [^)]*\)/g, '').matchAll(/\b(Super )?(Strength|Dexterity|Dex|Defense|Speed|Base)\b/g)]
    .map(m => stanceKeyOf(m[0]));
  // The stances worth equipping at a level: the best (target) ones once unlocked, else the standard
  // ones. { keys, label: 'Strength or Speed', kind: 'best' | 'standard' }, or null before any.
  function bestStances(legend, lvl) {
    const status = statusOf(legend, lvl);
    if (status !== 'v' && status !== '!') return null;
    const unlocked = key => unlockLevel(legend, key) <= lvl;
    let keys = status === 'v' ? stancesIn(legend.target).filter(unlocked) : [];
    let kind = 'best';
    if (!keys.length) { keys = stancesIn(legend.alt).filter(unlocked); kind = 'standard'; }
    if (!keys.length) return null;
    keys = [...new Set(keys)];
    return { keys, label: keys.map(stanceLabel).join(' or '), kind };
  }

  // Read fresh each time, so a Done pressed in another tab counts here too
  function loadConfirmed() {
    const v = load(CONFIRMED_KEY, null);
    if (!isObj(v)) return null;
    const out = {};
    Object.keys(v).forEach(name => { if (legendNamed(name) && typeof v[name] === 'string') out[name] = v[name]; });
    return out;
  }
  // Everything already unlocked counts as switched, so old unlocks never bring reminders.
  // Taken on the first run ever and after a first sync (or a sync of a different player).
  function baselineStances() {
    const out = {};
    LEGENDS_DB.forEach(l => { const b = bestStances(l, getLevel(l.name)); if (b) out[l.name] = b.keys[0]; });
    save(CONFIRMED_KEY, out);
  }
  // { legend, stance, kind } when a better stance is unlocked but not confirmed yet, else null
  function pendingStance(name) {
    const legend = legendNamed(name);
    const best = legend && bestStances(legend, getLevel(name));
    const confirmed = loadConfirmed() || {};
    if (!best || best.keys.includes(confirmed[name])) return null;
    return { legend: name, stance: best.label, kind: best.kind };
  }
  // The Done button: the player switched to the best stance unlocked now
  function confirmStance(name) {
    const legend = legendNamed(name);
    const best = legend && bestStances(legend, getLevel(name));
    if (!best) return;
    save(CONFIRMED_KEY, { ...(loadConfirmed() || {}), [name]: best.keys[0] });
  }

  reload();
  try {
    if (!loadConfirmed()) baselineStances();
  } catch (err) { /* reminders just won't show; the rest of the page still loads */ }

  // Syncing a different player replaces the saved levels, stats and log. True when that would
  // throw away something, so pages can ask first.
  function wouldReplace(bhId) {
    return !!state.profile && state.profile.id !== bhId && (Object.keys(state.levels).length > 0 || state.log.length > 0);
  }
  function replaceWarning(bhId) {
    const who = state.profile ? `${state.profile.name} (#${state.profile.id})` : 'the saved player';
    return `Sync player #${bhId}?\n\nThis replaces the levels and history saved for ${who} on this device. ` +
      'Export a backup first if you want to keep them.';
  }

  // Legend portraits listed in portraits/index.json, keyed by slug ("lord-vraxx")
  const portraitSlug = name => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  async function loadPortraits() {
    const out = {};
    try {
      const res = await fetch('portraits/index.json', { cache: 'no-cache' });
      if (!res.ok) return out;
      const files = await res.json();
      if (!Array.isArray(files)) return out;
      files.filter(f => typeof f === 'string' && /^[a-z0-9-]+\.(png|jpe?g|webp|avif)$/i.test(f))
        .forEach(f => { out[f.replace(/\.[a-z]+$/i, '').toLowerCase()] = `portraits/${f}`; });
    } catch (err) { /* no portraits folder, or opened as a file */ }
    return out;
  }
  // Small AVIF copies made by tools/make_avif.py: 'tiny' (96px, pictures shown at 48px or less),
  // 'small' (180px, tiles on 1x screens), 'mini' (~260px, tiles on 2x) or 'large' (720px, big art), each with a PNG for browsers without AVIF
  // (the large one's is the original). Pages still check loadPortraits() first to know the legend
  // has a picture.
  const portraitSrc = (name, size = 'mini') => `portraits/${size}/${portraitSlug(name)}.avif`;
  const portraitPng = (name, size = 'mini') => (size === 'large' ? `portraits/${portraitSlug(name)}.png` : `portraits/${size}/${portraitSlug(name)}.png`);
  // The same <picture> on every page: an AVIF <source> and the PNG <img>. The <picture> is
  // display:contents, so the <img> lays out and is styled as if it stood alone. Options:
  //   cls, width, height; lazy (default true); x2: a bigger size for 2x screens (e.g. small + 'mini');
  //   onload: code for the <img>; fallback: code run when even the PNG fails, with `el` as the
  //   <picture> (default: remove it).
  function portraitHtml(name, size = 'mini', { cls = '', width, height, lazy = true, x2, onload = '', fallback = 'el.remove()' } = {}) {
    const attr = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const set = src => (x2 ? `${src(name, size)} 1x, ${src(name, x2)} 2x` : src(name, size));
    // The <source> is hidden: with the <picture> display:contents, it would otherwise take a grid or flex slot
    return `<picture style="display:contents"><source type="image/avif" srcset="${attr(set(portraitSrc))}" style="display:none" />`
      + `<img${cls ? ` class="${attr(cls)}"` : ''} src="${attr(portraitPng(name, size))}"${x2 ? ` srcset="${attr(set(portraitPng))}"` : ''} alt=""`
      + `${width ? ` width="${width}"` : ''}${height ? ` height="${height}"` : ''}${lazy ? ' loading="lazy"' : ''} decoding="async"`
      + `${onload ? ` onload="${attr(onload)}"` : ''} onerror="if (!Tracker.portraitError(this)) { const el = this.parentNode; ${attr(fallback)} }" /></picture>`;
  }
  // The <img>'s onerror. <picture> only falls back to the PNG when the browser can't show AVIF,
  // not when the AVIF file itself fails (missing, or a blocked request), so that case drops the
  // <source> and the browser loads the PNG. Returns true while a PNG is still to try; false once
  // it failed too, so the page can do its own fallback. A plain <img> with an AVIF src (older
  // markup) gets its src swapped for the PNG.
  function portraitError(img) {
    const pic = img.parentNode;
    if (pic && pic.tagName === 'PICTURE') {
      const sources = pic.querySelectorAll('source');
      if (!sources.length) return false;
      sources.forEach(s => s.remove());
      return true;
    }
    const m = /portraits\/(tiny|mini|large)\/([a-z0-9-]+)\.avif$/.exec(img.getAttribute('src') || '');
    if (!m) return false;
    img.src = m[1] === 'large' ? `portraits/${m[2]}.png` : `portraits/${m[1]}/${m[2]}.png`;
    return true;
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

  // Total and per-legend games (and per-legend wins, for the game history) from the official API (seconds old, unlike dair.gg), so Live mode
  // can tell when a match ended and which legend it was on. Null when neither source answers.
  async function fetchGames(bhId) {
    for (const url of [`https://api.brawlhalla.com/v1/player/stats?brawlhalla_id=${bhId}&mode=all`, `${relayBase()}/player/${bhId}`]) {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) continue;
        const json = await res.json();
        if (!Number.isFinite(json.games)) continue;
        const legends = {}, wins = {};
        if (Array.isArray(json.legends)) parsePlayer(bhId, json).legends.forEach(l => { legends[l.name] = l.stats.games; wins[l.name] = l.stats.wins; });
        return { games: json.games, legends, wins };
      } catch (err) { /* try next source */ }
    }
    return null;
  }
  // Legends whose game count went up between two fetchGames results
  const playedSince = (before, after) => Object.keys(after.legends).filter(name => after.legends[name] > (before.legends[name] || 0));

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

  async function sync() {
    const bhId = state.id;
    if (!/^\d+$/.test(bhId)) return { error: 'Enter your Brawlhalla ID first.' };
    const { data, error } = await fetchPlayer(bhId);
    if (!data) return { error };
    const player = parsePlayer(bhId, data);

    // A first sync (or another player's) brings in levels earned long ago: not news, no reminders
    const firstSync = !state.profile || state.profile.id !== bhId;
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
      MILESTONES.filter(m => oldLvl < m && level >= m).forEach(m => {
        const statusUp = m === legend.vLvl ? 'v' : (m === legend.bangLvl ? '!' : null);
        // A better stance: say which one to switch to ({ stance, kind } from bestStances)
        const best = statusUp && bestStances(legend, m);
        unlocks.push({
          legend: name, lvl: m, what: milestoneName(legend, m), statusUp,
          stance: best ? best.label : null, kind: best ? best.kind : null
        });
      });
      if (level > oldLvl) state.log.push(logEntry(legend, oldLvl, level));
      updated++;
    });

    const { legends, ...profile } = player;
    state.profile = { ...profile, syncedAt: Date.now() };
    save(KEYS.levels, state.levels);
    save(KEYS.log, state.log);
    save(KEYS.stats, state.stats);
    save(KEYS.profile, state.profile);
    if (firstSync) {
      baselineStances();
      return { updated, missing, unlocks: [] };
    }
    return { updated, missing, unlocks };
  }

  return {
    KEYS, state, clean, reload, isDataKey, wouldReplace, replaceWarning, portraitSlug, loadPortraits, portraitSrc, portraitHtml, portraitError,
    getLevel, hasPlayed, statusOf, nextTarget, progressToNext, setLevel, setId, sync,
    LAB_KEY, pendingStance, confirmStance, fetchGames, playedSince
  };
})();
