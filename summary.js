// Progress summary from the improvements log, shared by the views.
// Entries that start at level 1 are skipped: those come from the first sync filling in
// levels, not from new progress.
const ProgressSummary = (() => {
  const UNLOCK_LEVELS = [3, 4, 6, 8, 11, 13, 15, 17, 40, 100];
  const DAY = 24 * 60 * 60 * 1000;

  function startOfToday(now = new Date()) {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  }

  function since(log, fromTs) {
    const perLegend = {};
    let levels = 0, unlocks = 0, statusUps = 0;
    (log || []).forEach(e => {
      if (!e || e.ts < fromTs || !(e.oldLvl > 1) || !(e.newLvl > e.oldLvl)) return;
      const gained = e.newLvl - e.oldLvl;
      levels += gained;
      unlocks += UNLOCK_LEVELS.filter(m => e.oldLvl < m && e.newLvl >= m).length;
      if (e.oldStatus !== e.newStatus) statusUps++;
      perLegend[e.legend] = (perLegend[e.legend] || 0) + gained;
    });
    const top = Object.entries(perLegend).sort((a, b) => b[1] - a[1])[0];
    return {
      levels, unlocks, statusUps,
      legends: Object.keys(perLegend).length,
      top: top ? { legend: top[0], levels: top[1] } : null
    };
  }

  // Short text like "+5 levels on 3 legends · 2 stances unlocked"
  function describe(s) {
    if (!s.levels) return 'No new levels yet';
    const parts = [`+${s.levels} level${s.levels === 1 ? '' : 's'} on ${s.legends} legend${s.legends === 1 ? '' : 's'}`];
    if (s.unlocks) parts.push(`${s.unlocks} stance${s.unlocks === 1 ? '' : 's'} unlocked`);
    return parts.join(' · ');
  }

  return {
    today: log => since(log, startOfToday()),
    week: log => since(log, Date.now() - 7 * DAY),
    since,
    describe
  };
})();
