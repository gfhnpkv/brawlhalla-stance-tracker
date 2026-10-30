// Pinned goal legends, shared by every view (needs legends.js loaded first).
const Goals = (() => {
  const KEY = 'bh_goals_v1';
  const MAX = 8;

  function load() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) || '[]');
      if (!Array.isArray(v)) return [];
      const valid = v.filter(n => typeof n === 'string' && LEGENDS_DB.some(l => l.name === n));
      return [...new Set(valid)].slice(0, MAX);
    } catch (err) {
      return [];
    }
  }
  let list = load();
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (err) { /* storage unavailable */ }
  }

  return {
    MAX,
    list: () => list.slice(),
    has: name => list.includes(name),
    // Returns false when the list is already full
    toggle(name) {
      if (list.includes(name)) list = list.filter(n => n !== name);
      else if (list.length >= MAX) return false;
      else list.push(name);
      save();
      return true;
    },
    remove(name) {
      list = list.filter(n => n !== name);
      save();
    },
    reload() { list = load(); },
    // Pinned goals that just got 1 level from their target stance, or reached it, between two
    // level snapshots. Legends with no earlier level (first sync, new player) never alert.
    alerts(before, after) {
      return list.map(name => {
        const l = LEGENDS_DB.find(x => x.name === name);
        const b = before[name], a = after[name] || 1;
        if (!l || b == null || a <= b) return null;
        if (b < l.vLvl && a >= l.vLvl) return { type: 'reached', legend: name, what: l.target, lvl: l.vLvl };
        if (l.vLvl - a === 1 && l.vLvl - b > 1) return { type: 'close', legend: name, what: l.target, lvl: l.vLvl };
        return null;
      }).filter(Boolean);
    },
    describe(alert) {
      return alert.type === 'reached'
        ? { title: `🎯 Goal reached: ${alert.legend}!`, body: `${alert.what} unlocked at level ${alert.lvl}.` }
        : { title: `🎯 ${alert.legend} is 1 level away`, body: `One more level unlocks ${alert.what}.` };
    }
  };
})();
