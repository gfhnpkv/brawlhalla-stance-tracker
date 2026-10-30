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
    reload() { list = load(); }
  };
})();
