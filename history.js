// Game history, shared by every view (needs legends.js loaded first).
// Neither API lists matches, so the history is built here: each time fresh per-legend counts arrive
// (a sync, or Live mode's check) they're compared with the last counts seen for that player, and
// only the increase is recorded. Counts never move the baseline down, so a slower source (dair.gg
// caches for a few minutes) can't make the same match count twice. The first counts seen for a
// player only set the baseline.
const MatchHistory = (() => {
  const KEY = 'bh_match_history_v1';
  const SNAP_KEY = 'bh_match_snapshot_v1';
  const MAX = 500;

  const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const isLegend = name => typeof name === 'string' && LEGENDS_DB.some(l => l.name === name);
  const count = v => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : null);
  const isId = v => typeof v === 'string' && /^\d+$/.test(v);

  // Saved and imported data is checked before use, like Tracker.clean
  function clean(v) {
    if (!Array.isArray(v)) return [];
    return v.filter(e => isObj(e) && isId(e.id) && isLegend(e.legend) && Number.isFinite(e.ts)
      && count(e.games) >= 1 && count(e.wins) != null && count(e.wins) <= e.games)
      .map(e => ({
        id: e.id, ts: e.ts, legend: e.legend, games: count(e.games), wins: count(e.wins),
        total: count(e.total), level: count(e.level) >= 1 ? Math.min(100, count(e.level)) : null
      }))
      .sort((a, b) => a.ts - b.ts).slice(-MAX);
  }
  function cleanSnap(v) {
    if (!isObj(v) || !isId(v.id) || !isObj(v.legends)) return null;
    const legends = {};
    Object.keys(v.legends).forEach(name => {
      const c = v.legends[name];
      if (isLegend(name) && isObj(c) && count(c.games) != null) legends[name] = { games: count(c.games), wins: count(c.wins) || 0 };
    });
    return { id: v.id, legends };
  }
  function load(key, fallback) {
    try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch (err) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (err) { /* storage unavailable */ }
  }

  let entries = clean(load(KEY, []));
  function reload() { entries = clean(load(KEY, [])); }

  // { name: { games, wins } } from the synced legend stats, or from a Tracker.fetchGames result
  function fromStats(stats) {
    const out = {};
    Object.keys(stats || {}).forEach(name => { out[name] = { games: stats[name].games, wins: stats[name].wins }; });
    return out;
  }
  function fromGames(g) {
    const out = {};
    Object.keys(g.legends).forEach(name => { out[name] = { games: g.legends[name], wins: (g.wins && g.wins[name]) || 0 }; });
    return out;
  }

  // Compares fresh counts with the baseline and adds an entry per legend that got new games.
  // levelOf (optional) gives the level that goes with these counts. Returns the new entries.
  function record(bhId, counts, levelOf) {
    if (!isId(bhId)) return [];
    reload(); // another tab may have recorded since
    const snap = cleanSnap(load(SNAP_KEY, null));
    const first = !snap || snap.id !== bhId;
    const base = first ? {} : snap.legends;
    const added = [];
    const now = Date.now();
    Object.keys(counts).forEach(name => {
      const games = count(counts[name].games), wins = count(counts[name].wins) || 0;
      if (!isLegend(name) || games == null) return;
      const before = base[name] || { games: 0, wins: 0 };
      if (!first && games > before.games) {
        const n = games - before.games;
        const level = levelOf ? levelOf(name) : null;
        added.push({ id: bhId, ts: now, legend: name, games: n, wins: Math.max(0, Math.min(n, wins - before.wins)), total: games, level: count(level) >= 1 ? level : null });
      }
      base[name] = { games: Math.max(games, before.games), wins: Math.max(wins, before.wins) };
    });
    save(SNAP_KEY, { id: bhId, legends: base });
    if (added.length) {
      entries = entries.concat(added).slice(-MAX);
      save(KEY, entries);
    }
    return added;
  }

  // Live mode records matches before dair.gg has the new level. When a sync later returns exactly
  // the games count an entry ended on, that sync's level is the one after that match.
  function fillLevels(bhId, counts, levelOf) {
    let changed = false;
    entries.forEach(e => {
      if (e.id !== bhId || e.level != null || e.total == null || !counts[e.legend] || counts[e.legend].games !== e.total) return;
      const lvl = levelOf(e.legend);
      if (count(lvl) >= 1) { e.level = lvl; changed = true; }
    });
    if (changed) save(KEY, entries);
  }

  const forPlayer = bhId => entries.filter(e => e.id === bhId).reverse();

  function today(bhId) {
    const start = new Date().setHours(0, 0, 0, 0);
    return forPlayer(bhId).filter(e => e.ts >= start)
      .reduce((t, e) => ({ games: t.games + e.games, wins: t.wins + e.wins }), { games: 0, wins: 0 });
  }

  const escHtml = str => String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function when(ts) {
    const d = new Date(ts);
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toDateString() === new Date().toDateString() ? time : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`;
  }
  const result = e => (e.games === 1 ? (e.wins ? 'W' : 'L') : `${e.wins}W ${e.games - e.wins}L`);

  // The history section's markup: today's summary, then the newest `limit` entries and a
  // "Show more" button (data-hist-more) when there are more. portraitOf(name) is true when the
  // legend has a portrait; it's drawn with Tracker.portraitHtml at the tiny size.
  function html(bhId, { limit = 20, portraitOf = () => '' } = {}) {
    const list = forPlayer(bhId);
    const t = today(bhId);
    const summary = t.games
      ? `Today: <b>${t.games} game${t.games === 1 ? '' : 's'}</b>, <b>${Math.round(100 * t.wins / t.games)}% wins</b>`
      : 'Today: no games yet';
    const rows = list.slice(0, limit).map(e => {
      const src = portraitOf(e.legend);
      const tone = e.wins === e.games ? 'win' : e.wins === 0 ? 'loss' : 'mixed';
      return `<div class="hist-row">
          <span class="hist-when">${when(e.ts)}</span>
          ${src && typeof Tracker !== 'undefined' ? Tracker.portraitHtml(e.legend, 'tiny', { cls: 'hist-art', width: 32, height: 32 }) : ''}
          <span class="hist-legend">${escHtml(e.legend)}</span>
          <span class="hist-result ${tone}">${result(e)}</span>
          <span class="hist-lvl">${e.level ? `Lv.${e.level}` : ''}</span>
        </div>`;
    }).join('');
    return `<div class="hist-today">${summary}</div>
      <div class="hist-note">Recorded from your synced stats, starting when this was added. Earlier matches aren't available.</div>
      ${rows || '<div class="hist-empty">No games recorded yet. Sync or turn on Live, then play a match.</div>'}
      ${list.length > limit ? `<button class="hist-more" data-hist-more>Show more (${list.length - limit})</button>` : ''}`;
  }

  return {
    KEY, SNAP_KEY,
    isKey: key => key == null || key === KEY || key === SNAP_KEY,
    clean, reload, record, fillLevels, fromStats, fromGames, today, html,
    all: () => entries.slice(),
    // Backup import: replaces the history. The baseline is left alone, so the next counts only
    // add matches played after it.
    replace(v) { entries = clean(v); save(KEY, entries); }
  };
})();
