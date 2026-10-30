// Draws a shareable 1200x630 PNG of the saved collection (needs legends.js loaded first).
// Reads straight from localStorage, so it always matches what every view has saved.
const ShareImage = (() => {
  const W = 1200, H = 630;
  const SITE = 'gfhnpkv.github.io/brawlhalla-stance-tracker';

  function read(key, fallback) {
    try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch (err) { return fallback; }
  }

  // Everything the picture shows, as plain data (kept separate from drawing so it can be tested)
  function collect() {
    const levels = read('bh_levels_v1', {});
    const profile = read('bh_profile_v1', null);
    const goals = read('bh_goals_v1', []);
    const lvl = name => levels[name] || 1;
    const status = l => (lvl(l.name) >= l.vLvl ? 'v' : lvl(l.name) >= l.bangLvl ? '!' : 'x');
    const counts = { v: 0, '!': 0, x: 0 };
    LEGENDS_DB.forEach(l => counts[status(l)]++);
    const top = LEGENDS_DB.map(l => ({ name: l.name, level: lvl(l.name) }))
      .sort((a, b) => b.level - a.level || a.name.localeCompare(b.name)).slice(0, 5);
    const goalRows = (Array.isArray(goals) ? goals : []).map(name => LEGENDS_DB.find(l => l.name === name)).filter(Boolean).slice(0, 3)
      .map(l => ({ name: l.name, level: lvl(l.name), target: lvl(l.name) >= l.vLvl ? null : l.vLvl }));
    return {
      name: profile ? profile.name : 'My collection',
      id: profile ? profile.id : null,
      accountLevel: profile ? profile.level : null,
      games: profile ? profile.games : null,
      counts, total: LEGENDS_DB.length, top, goals: goalRows,
      date: new Date().toLocaleDateString()
    };
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function draw(d) {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    const font = (w, s) => `${w} ${s}px system-ui, -apple-system, 'Segoe UI', sans-serif`;

    // background
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#0b101d'); bg.addColorStop(1, '#1b1240');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(260, 300, 20, 260, 300, 420);
    glow.addColorStop(0, 'rgba(6,182,212,0.22)'); glow.addColorStop(1, 'rgba(6,182,212,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);

    // header
    ctx.fillStyle = '#06b6d4'; ctx.font = font(800, 22); ctx.fillText('BRAWLHALLA STANCE TRACKER', 60, 70);
    ctx.fillStyle = '#f1f5f9'; ctx.font = font(900, 54);
    const name = d.name.length > 24 ? d.name.slice(0, 23) + '…' : d.name;
    ctx.fillText(name, 60, 135);
    ctx.fillStyle = '#94a3b8'; ctx.font = font(600, 24);
    ctx.fillText([d.accountLevel ? `Level ${d.accountLevel}` : null, d.games != null ? `${d.games.toLocaleString()} games` : null, d.id ? `#${d.id}` : null]
      .filter(Boolean).join('   ·   '), 60, 175);

    // completion ring
    const cx = 230, cy = 385, r = 125, pct = d.counts.v / d.total;
    ctx.lineWidth = 26; ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(148,163,184,0.18)'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    const ring = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    ring.addColorStop(0, '#22c55e'); ring.addColorStop(1, '#06b6d4');
    ctx.strokeStyle = ring; ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.001, pct)); ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f1f5f9'; ctx.font = font(900, 64); ctx.fillText(`${d.counts.v}`, cx, cy + 14);
    ctx.fillStyle = '#94a3b8'; ctx.font = font(700, 22); ctx.fillText(`of ${d.total} target stances`, cx, cy + 50);
    ctx.textAlign = 'left';

    // status chips
    [['v', 'Target', '#22c55e'], ['!', 'Standard', '#f59e0b'], ['x', 'Locked', '#f87171']].forEach(([k, label, col], i) => {
      const x = 450 + i * 235, y = 215;
      roundRect(ctx, x, y, 215, 84, 16); ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = col; ctx.font = font(900, 40); ctx.fillText(String(d.counts[k]), x + 22, y + 56);
      ctx.fillStyle = '#cbd5e1'; ctx.font = font(700, 20); ctx.fillText(`${k}  ${label}`, x + 92, y + 52);
    });

    // top legends
    ctx.fillStyle = '#94a3b8'; ctx.font = font(800, 18); ctx.fillText('TOP LEGENDS', 450, 345);
    const maxLvl = Math.max(1, ...d.top.map(t => t.level));
    d.top.forEach((t, i) => {
      const y = 372 + i * 38;
      ctx.fillStyle = '#f1f5f9'; ctx.font = font(700, 22); ctx.fillText(t.name.length > 16 ? t.name.slice(0, 15) + '…' : t.name, 450, y + 18);
      roundRect(ctx, 650, y + 3, 320, 16, 8); ctx.fillStyle = 'rgba(148,163,184,0.18)'; ctx.fill();
      roundRect(ctx, 650, y + 3, Math.max(16, 320 * (t.level / maxLvl)), 16, 8); ctx.fillStyle = '#06b6d4'; ctx.fill();
      ctx.fillStyle = '#f1f5f9'; ctx.font = font(800, 20); ctx.fillText(`Lv ${t.level}`, 990, y + 18);
    });

    // goals
    if (d.goals.length) {
      ctx.fillStyle = '#facc15'; ctx.font = font(800, 18);
      ctx.fillText('★ GOALS  ' + d.goals.map(g => g.target ? `${g.name} ${g.level}→${g.target}` : `${g.name} ✓`).join('   ·   '), 60, 575);
    }

    // footer
    ctx.fillStyle = '#64748b'; ctx.font = font(600, 18);
    ctx.textAlign = 'right'; ctx.fillText(`${SITE}  ·  ${d.date}`, W - 60, H - 30);
    ctx.textAlign = 'left';
    return c;
  }

  // Share the PNG where the browser supports sharing files (phones), otherwise download it
  async function share() {
    const data = collect();
    const canvas = draw(data);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Could not create the image.');
    const fileName = `brawlhalla-stances-${(data.id || 'collection')}.png`;
    const file = typeof File === 'function' ? new File([blob], fileName, { type: 'image/png' }) : null;
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'My Brawlhalla stances' });
        return 'shared';
      } catch (err) {
        if (err && err.name === 'AbortError') return 'cancelled';
      }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    return 'downloaded';
  }

  return { collect, draw, share };
})();
