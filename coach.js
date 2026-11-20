// Ranked 1v1 coach: turns the stats page's shaped data into metrics, a short practice plan and
// a small per-player history. Pure logic, no DOM; the page renders what this returns.
const Coach = (() => {
  const KEY = 'bh_coach_v1';
  const MAX_SNAPS = 60;
  const DAY = 86400000;
  const DONE_HIDE_DAYS = 7; // a done item is shown as done for this long, then comes back
  const DISMISS_DAYS = 14;  // a dismissed item stays hidden this long
  const TREND_MIN_DAYS = 7;
  const TREND_MIN_GAMES = 10;
  const MAX_ITEMS = 5;

  // Rough rules of thumb from general play experience, NOT official numbers and not from
  // Blue Mammoth. `tol` is how far past the target (as a fraction of it) still counts as "ok".
  // `min` is the games needed before a metric is trusted (ranked games or all-mode games).
  const RULES = {
    fallsPerGame:  { label: 'Falls per game',        scope: 'all',    target: 2.5,  better: 'lower',  tol: 0.2, min: 100 },
    kosPerGame:    { label: 'KOs per game',          scope: 'all',    target: 2.5,  better: 'higher', tol: 0.2, min: 100 },
    koFall:        { label: 'KO / fall ratio',       scope: 'all',    target: 1.2,  better: 'higher', tol: 0.2, min: 100 },
    dmgPerKo:      { label: 'Damage per KO',         scope: 'all',    target: 450,  better: 'lower',  tol: 0.2, min: 100 },
    takenPerGame:  { label: 'Damage taken per game', scope: 'all',    target: 1000, better: 'lower',  tol: 0.2, min: 100 },
    kosPerMin:     { label: 'KOs per minute',        scope: 'all',    target: 0.5,  better: 'higher', tol: 0.2, min: 100 },
    unarmedShare:  { label: 'Unarmed KO share',      scope: 'all',    target: 0.05, better: 'higher', tol: 0.5, min: 100 },
    rankedWr:      { label: 'Ranked win rate',       scope: 'ranked', target: 0.52, better: 'higher', tol: 0.05, min: 30 }
  };
  const KEYS = Object.keys(RULES);
  const LEGEND_MIN_GAMES = 1;  // ranked games before a legend counts at all (random mains play each one rarely)
  const WEAPON_MIN_GAMES = 5;  // ranked games (across the legends using it) before a weapon is judged
  const WEAPON_EARLY_GAMES = 10; // below this a weapon read is only an "early read"
  const WEAPON_GAP = 0.05;     // win rate this far under the overall ranked win rate makes a weapon "needs work"
  const UNFAMILIAR_GAMES = 20; // all-mode games with a weapon below this count as unfamiliar
  const MAX_WEAPON_ITEMS = 3;
  const RECOVER_GAP = 150;     // peak minus rating that makes a legend worth recovering
  const LOW_SAMPLE_WEIGHT = 0.3;

  const DRILLS = {
    fallsPerGame: 'Training room: practice recovery routes and off-stage survival with each of your legends, then play a few ranked games only trying not to die off the side.',
    kosPerGame: 'Pick one legend and drill your best 2 or 3 KO setups on a training dummy until they are automatic, then look for them in every stock.',
    koFall: 'Play a few games on a single stock mindset: take only trades you are sure about, and never give up a KO for free just to get one back.',
    dmgPerKo: 'Training room: drill combo strings that end in an edgeguard or a gravity-cancelled finisher, so each opening ends in a KO instead of a reset.',
    takenPerGame: 'Review replays for the hits you take most. Practice dodging and spacing against one specific habit at a time.',
    kosPerMin: 'Play more proactively: pressure from neutral instead of waiting. Aim to start the next exchange as soon as the last one ends.',
    unarmedShare: 'Add unarmed and weapon-throw finishers to your edgeguards in the training room, so you keep dealing damage when you drop your weapons.',
    rankedWr: 'Queue ranked with your two best legends only, and review one lost game each session for the single mistake that cost the most.'
  };

  const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const n = v => (Number.isFinite(v) ? v : 0);
  const div = (a, b) => (b > 0 && Number.isFinite(a) ? a / b : null);
  const round = (v, d = 2) => (Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : null);
  const empty = () => ({ snaps: [], marks: {} });

  // ---------- storage ----------
  function readAll() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) || '{}');
      return isObj(v) ? v : {};
    } catch (err) {
      return {};
    }
  }
  const NUM_FIELDS = ['rating', 'peak', 'games', 'wins', 'kos', 'falls', 'damage', 'taken', 'time', 'rkGames', 'rkWins'];
  function cleanSnap(s) {
    if (!isObj(s) || typeof s.d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s.d)) return null;
    const out = { d: s.d };
    NUM_FIELDS.forEach(k => { out[k] = n(s[k]); });
    return out;
  }
  function cleanMarks(m) {
    const out = {};
    if (!isObj(m)) return out;
    Object.keys(m).forEach(k => {
      const v = m[k];
      if (isObj(v) && (v.s === 'done' || v.s === 'dismissed') && Number.isFinite(v.at)) out[k] = { s: v.s, at: v.at };
    });
    return out;
  }
  function load(id) {
    const e = readAll()[String(id)];
    if (!isObj(e)) return empty();
    const snaps = (Array.isArray(e.snaps) ? e.snaps : []).map(cleanSnap).filter(Boolean)
      .sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
    return { snaps: snaps.slice(-MAX_SNAPS), marks: cleanMarks(e.marks) };
  }
  function save(id, entry) {
    try {
      const all = readAll();
      all[String(id)] = entry;
      localStorage.setItem(KEY, JSON.stringify(all));
    } catch (err) { /* storage unavailable */ }
  }

  const dayKey = now => {
    const t = new Date(now);
    const p = x => String(x).padStart(2, '0');
    return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
  };
  const dayNum = d => Date.parse(`${d}T00:00:00Z`) / DAY;

  // One snapshot per day (a same-day one is replaced), newest 60 kept. Partial data is skipped.
  function record(id, data, now = Date.now()) {
    const cur = load(id);
    if (!data || data.partial || !data.stats) return cur.snaps;
    const st = data.stats, solo = data.ranked && data.ranked.solo;
    const snap = {
      d: dayKey(now), rating: n(solo && solo.rating), peak: n(solo && solo.peak), games: n(st.games), wins: n(st.wins),
      kos: n(st.kos), falls: n(st.falls), damage: n(st.damage), taken: n(st.taken), time: n(st.time),
      rkGames: n(solo && solo.games), rkWins: n(solo && solo.wins)
    };
    const snaps = cur.snaps.filter(s => s.d !== snap.d).concat(snap)
      .sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0)).slice(-MAX_SNAPS);
    save(id, { snaps, marks: cur.marks });
    return snaps;
  }

  // state 'done' | 'dismissed' sets a mark, null clears it
  function mark(id, itemId, state, now = Date.now()) {
    const cur = load(id);
    if (state === 'done' || state === 'dismissed') cur.marks[itemId] = { s: state, at: now };
    else delete cur.marks[itemId];
    save(id, cur);
    return cur.marks;
  }

  // ---------- analysis ----------
  function statusOf(rule, value, games) {
    if (value == null) return 'low-sample';
    const t = rule.target;
    const miss = rule.better === 'higher' ? (t - value) / t : (value - t) / t; // > 0 means short of target
    if (miss <= 0) return 'good'; // meeting the target is good whatever the sample size
    if (games < rule.min) return 'low-sample';
    return miss <= rule.tol ? 'ok' : 'weak';
  }

  function analyze(data) {
    const out = { ok: false, reason: null, solo: null, metrics: [], pool: [], weaponPool: [] };
    if (!data || !data.stats || !Array.isArray(data.legends)) { out.reason = 'no-data'; return out; }
    if (data.partial) { out.reason = 'partial'; return out; }
    const st = data.stats, rs = data.ranked && data.ranked.solo;
    if (rs && rs.games > 0) {
      out.solo = { rating: n(rs.rating), peak: n(rs.peak), tier: String(rs.tier || ''), games: n(rs.games), wins: n(rs.wins), placement: !!rs.placement };
    } else {
      out.reason = 'no-ranked';
    }
    out.ok = true;

    const values = {
      fallsPerGame: div(st.falls, st.games),
      kosPerGame: div(st.kos, st.games),
      koFall: div(st.kos, st.falls),
      dmgPerKo: div(st.damage, st.kos),
      takenPerGame: div(st.taken, st.games),
      kosPerMin: div(st.kos, n(st.time) / 60),
      unarmedShare: data.unarmed ? div(data.unarmed.kos, st.kos) : null,
      rankedWr: out.solo ? div(out.solo.wins, out.solo.games) : null
    };
    out.metrics = KEYS.map(key => {
      const r = RULES[key];
      const games = r.scope === 'ranked' ? (out.solo ? out.solo.games : 0) : n(st.games);
      const value = values[key];
      return {
        key, label: r.label, value: value == null ? null : round(value, 4), scope: r.scope, games,
        target: r.target, better: r.better, status: statusOf(r, value, games)
      };
    });

    out.pool = data.legends.filter(l => l.rk && l.rk.games > 0).map(l => ({
      name: l.name, rating: n(l.rk.rating), peak: n(l.rk.peak), gap: Math.max(0, n(l.rk.peak) - n(l.rk.rating)),
      games: n(l.rk.games), wins: n(l.rk.wins), wr: div(l.rk.wins, l.rk.games), sample: l.rk.games < LEGEND_MIN_GAMES ? 'low' : 'ok'
    })).filter(p => p.games >= LEGEND_MIN_GAMES).sort((a, b) => a.rating - b.rating);

    // Ranked 1v1 per weapon: each legend's ranked games and wins count for both its weapons.
    // Weapons of legends with no ranked games are listed too (0 games) so blind spots show up.
    const lifetime = {};
    (Array.isArray(data.weapons) ? data.weapons : []).forEach(w => { if (w && w.name) lifetime[w.name] = n(w.games); });
    const by = {};
    data.legends.forEach(l => (Array.isArray(l.weapons) ? l.weapons : []).forEach(w => {
      if (!w) return;
      const e = by[w] = by[w] || { name: w, games: 0, wins: 0, ratingSum: 0 };
      if (l.rk && l.rk.games > 0) { e.games += n(l.rk.games); e.wins += n(l.rk.wins); e.ratingSum += n(l.rk.rating) * n(l.rk.games); }
    }));
    out.weaponPool = Object.values(by).map(e => ({
      name: e.name, games: e.games, wins: e.wins, wr: div(e.wins, e.games), rating: e.games ? Math.round(e.ratingSum / e.games) : null,
      allGames: lifetime[e.name] || 0, sample: e.games >= WEAPON_MIN_GAMES ? (e.games < WEAPON_EARLY_GAMES ? 'early' : 'ok') : 'none'
    })).sort((a, b) => (a.wr == null) - (b.wr == null) || a.wr - b.wr || a.name.localeCompare(b.name));
    return out;
  }

  // ---------- plan ----------
  // Change in a metric between two snapshots, from the deltas; null when too little was played.
  function deltaValue(key, a, b) {
    const d = k => b[k] - a[k];
    switch (key) {
      case 'fallsPerGame': return d('games') >= TREND_MIN_GAMES ? div(d('falls'), d('games')) : null;
      case 'kosPerGame': return d('games') >= TREND_MIN_GAMES ? div(d('kos'), d('games')) : null;
      case 'koFall': return d('games') >= TREND_MIN_GAMES ? div(d('kos'), d('falls')) : null;
      case 'dmgPerKo': return d('games') >= TREND_MIN_GAMES ? div(d('damage'), d('kos')) : null;
      case 'takenPerGame': return d('games') >= TREND_MIN_GAMES ? div(d('taken'), d('games')) : null;
      case 'kosPerMin': return d('games') >= TREND_MIN_GAMES ? div(d('kos'), d('time') / 60) : null;
      case 'rankedWr': return d('rkGames') >= TREND_MIN_GAMES ? div(d('rkWins'), d('rkGames')) : null;
      default: return null;
    }
  }
  // Newest snapshot against the oldest one at least 7 days before it
  function trendFor(key, snaps) {
    if (!Array.isArray(snaps) || snaps.length < 2) return null;
    const newest = snaps[snaps.length - 1];
    const base = snaps.find(s => dayNum(newest.d) - dayNum(s.d) >= TREND_MIN_DAYS);
    if (!base) return null;
    const to = deltaValue(key, base, newest);
    if (to == null) return null;
    // "from" is the lifetime value at the earlier snapshot, "to" the value over the period since
    const zero = Object.fromEntries(NUM_FIELDS.map(k => [k, 0]));
    const from = deltaValue(key, zero, base);
    return { from: from == null ? null : round(from, 4), to: round(to, 4), days: Math.round(dayNum(newest.d) - dayNum(base.d)) };
  }

  function plan(analysis, snaps, marks, now = Date.now()) {
    if (!analysis || !analysis.ok) return [];
    const mk = isObj(marks) ? marks : {};
    const items = [];
    analysis.metrics.forEach(m => {
      if (m.value == null || m.status === 'good') return;
      const dist = Math.min(1, Math.abs(m.target - m.value) / m.target);
      items.push({
        id: `m:${m.key}`, key: m.key, title: `Improve ${m.label.toLowerCase()}`, current: m.value, target: m.target,
        trend: trendFor(m.key, snaps), drill: DRILLS[m.key],
        why: m.status === 'low-sample'
          ? `${m.label} is off the rough target, but only ${m.games} games back it up, so treat it as a hint.`
          : `${m.label} is ${m.better === 'lower' ? 'above' : 'below'} the rough target.`,
        priority: dist * (m.status === 'low-sample' ? LOW_SAMPLE_WEIGHT : 1)
      });
    });
    // Weapons drive the advice: with a new legend most games, per-legend samples stay tiny
    const overall = analysis.solo ? div(analysis.solo.wins, analysis.solo.games) : null;
    const pct = v => `${Math.round(v * 100)}%`;
    const wItems = [];
    (analysis.weaponPool || []).forEach(w => {
      if (overall == null) return;
      if (w.games >= WEAPON_MIN_GAMES) {
        const gap = overall - w.wr;
        if (gap < WEAPON_GAP) return;
        const early = w.games < WEAPON_EARLY_GAMES;
        wItems.push({
          id: `weapon:${w.name}`, key: 'weapon', title: `Work on ${w.name}`, current: round(w.wr, 4), target: round(overall, 4), trend: null,
          curText: `${pct(w.wr)} win rate with ${w.name} → ${pct(overall)} overall ranked`,
          why: `${w.name} wins ${pct(w.wr)} of your ranked games (${w.wins}W ${w.games - w.wins}L over ${w.games} games${early ? ', early read' : ''}), against ${pct(overall)} overall.`,
          drill: `Play your next ranked games as usual and, when random gives you a ${w.name} legend, play it on purpose instead of drifting. In the training room practice its core combos: one string, one finisher and one recovery.`,
          priority: Math.min(1, gap / 0.25) * (early ? 0.6 : 1)
        });
      } else {
        const unfamiliar = w.allGames < UNFAMILIAR_GAMES;
        wItems.push({
          id: `explore:${w.name}`, key: 'explore', title: `Get comfortable with ${w.name}`, current: w.games, target: WEAPON_MIN_GAMES, trend: null,
          curText: `${w.games} of ${WEAPON_MIN_GAMES} ranked games with ${w.name}`,
          why: `You have only ${w.games} ranked 1v1 game${w.games === 1 ? '' : 's'} with ${w.name}${unfamiliar ? ` and ${w.allGames} in all modes` : ''}, so it is a blind spot when random hands it to you.`,
          drill: `Spend a few minutes in the training room with a ${w.name} legend: one combo string, one finisher and one recovery. Then play your next ranked games and use it whenever random gives it to you.`,
          priority: 0.25 + 0.15 * (1 - w.games / WEAPON_MIN_GAMES) + (unfamiliar ? 0.1 : 0)
        });
      }
    });
    items.push(...wItems.sort((a, b) => b.priority - a.priority).slice(0, MAX_WEAPON_ITEMS));
    const rec = analysis.pool.filter(p => p.gap >= RECOVER_GAP).sort((a, b) => b.gap - a.gap)[0];
    if (rec) {
      items.push({
        id: `recover:${rec.name}`, key: 'recover', title: `Recover ${rec.name}`, current: rec.rating, target: rec.peak, trend: null,
        drill: `Go back to what worked when ${rec.name} peaked: replay old matches if you have them and re-drill your best setups.`,
        why: `${rec.name} is ${rec.gap} below its peak this season.`,
        priority: Math.min(1, rec.gap / 400)
      });
    }
    const out = [];
    items.forEach(it => {
      const m = mk[it.id];
      let state = 'open';
      if (m && m.s === 'dismissed' && now - m.at < DISMISS_DAYS * DAY) return;
      if (m && m.s === 'done' && now - m.at < DONE_HIDE_DAYS * DAY) state = 'done';
      out.push({ ...it, priority: round(it.priority, 4), state });
    });
    return out.sort((a, b) => b.priority - a.priority).slice(0, MAX_ITEMS);
  }

  return { RULES, analyze, plan, load, record, mark };
})();
