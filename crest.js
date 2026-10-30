// Original heraldic crests for legends, drawn as SVG (needs legends.js loaded first).
// A crest is a shield in the legend's own color, split with its target-stance color, with its
// two weapon types crossed in the middle, its initials on a banner, and a frame by status.
const Crest = (() => {
  // Simple weapon icons on a 24x24 grid, pointing up; drawn as strokes
  const ICONS = {
    Sword: 'M12 2 L12 16 M8 16 L16 16 M12 16 L12 21 M10.5 21 L13.5 21',
    Greatsword: 'M12 1 L14 4 L14 15 L10 15 L10 4 Z M6 15 L18 15 M12 15 L12 21 M10.5 21.5 L13.5 21.5',
    Hammer: 'M12 7 L12 22 M6 2 L18 2 L18 8 L6 8 Z',
    Axe: 'M10 3 L10 22 M10 4 C16 4 19 7 19 11 C15 11 12 10 10 9',
    Spear: 'M12 22 L12 7 M12 1 L15 7 L12 9 L9 7 Z',
    RocketLance: 'M12 1 L15 15 L9 15 Z M12 15 L12 21 M10 21 L14 21 M10 18 L8 22 M14 18 L16 22',
    Katar: 'M12 1 L15 11 L9 11 Z M8 11 L16 11 M9 11 L9 16 M15 11 L15 16 M9 16 L15 16',
    Bow: 'M8 2 C18 7 18 17 8 22 M8 2 L8 22 M6 12 L20 12 M17 10 L20 12 L17 14',
    Fists: 'M7 9 L17 9 L17 19 C17 21 15 22 12 22 C9 22 7 21 7 19 Z M7 13 L17 13 M10 9 L10 13 M13 9 L13 13 M9 5 L15 5 L17 9 L7 9 Z',
    Scythe: 'M12 22 L12 4 M12 4 C16 2 21 4 22 9 C18 6 15 6 12 7',
    Cannon: 'M5 18 L17 4 L20 7 L8 21 Z M6 17 A3 3 0 1 0 6.01 17',
    Orb: 'M12 7 A5 5 0 1 0 12.01 7 M5 12 C5 6 19 6 19 12 C19 18 5 18 5 12 M12 3 L12 5 M12 19 L12 21',
    Pistol: 'M4 7 L19 7 L19 11 L11 11 L10 18 L6 18 L7 11 L4 11 Z M12 11 L12 14 L14 14',
    Boots: 'M8 2 L14 2 L14 14 L20 17 L20 21 L8 21 Z M8 9 L14 9',
    Chakram: 'M12 6 A6 6 0 1 0 12.01 6 M12 9 A3 3 0 1 0 12.01 9 M12 2 L12 6 M12 18 L12 22 M2 12 L6 12 M18 12 L22 12'
  };
  const STANCE_COLOR = { Strength: '#e5484d', Dexterity: '#a855f7', Defense: '#3b82f6', Speed: '#f5a524' };
  const FRAME = { v: ['#f3cf7a', '#b9842a'], '!': ['#b8c7e0', '#5d6f8f'], x: ['#5b6478', '#2c3344'] };
  const SHIELD = 'M50 4 L92 16 L92 50 C92 78 72 94 50 104 C28 94 8 78 8 50 L8 16 Z';

  function hueOf(name) {
    let h = 0;
    for (const ch of name) h = (h * 31 + ch.codePointAt(0)) % 360;
    return h;
  }
  function initials(name) {
    const parts = name.normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[\s&]+/).filter(Boolean);
    return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : name.slice(0, 2)).toUpperCase();
  }
  const idOf = name => 'c' + name.normalize('NFD').replace(/[^A-Za-z0-9]/g, '');
  // First stance named in the target text, e.g. "Super Speed or Strength" -> "Speed"
  const targetType = legend => (legend.target.match(/Strength|Dexterity|Defense|Speed/) || ['Strength'])[0];

  // Each weapon is drawn on its own side, leaning in, so the pair crosses like a saltire
  function icon(weapon, side) {
    const d = ICONS[weapon] || ICONS.Sword;
    const x = 50 + side * 11, angle = side * 32;
    return `<g transform="translate(${x} 54) rotate(${angle}) translate(-14.4 -14.4) scale(1.2)">
      <path d="${d}" fill="none" stroke="#0b0f18" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="${d}" fill="none" stroke="#f4f1ea" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </g>`;
  }

  // legend: an entry from LEGENDS_DB; status: 'v' | '!' | 'x'.
  // opts.banner: false leaves off the initials banner (for places that already show the name)
  function svg(legend, status = 'x', opts = {}) {
    const banner = opts.banner !== false;
    const id = idOf(legend.name);
    const hue = hueOf(legend.name);
    const stance = STANCE_COLOR[targetType(legend)];
    const [frameA, frameB] = FRAME[status] || FRAME.x;
    const [w1, w2] = (typeof LEGEND_WEAPONS !== 'undefined' && LEGEND_WEAPONS[legend.name]) || ['Sword', 'Sword'];
    return `<svg class="crest" viewBox="0 0 100 ${banner ? 120 : 108}" role="img" aria-label="${legend.name.replace(/[&<>"]/g, '')} crest: ${w1} and ${w2}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="${id}f" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="hsl(${hue} 48% 38%)"/><stop offset="1" stop-color="hsl(${hue} 45% 18%)"/>
        </linearGradient>
        <linearGradient id="${id}r" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="${frameA}"/><stop offset="1" stop-color="${frameB}"/>
        </linearGradient>
        <clipPath id="${id}c"><path d="${SHIELD}"/></clipPath>
      </defs>
      <path d="${SHIELD}" fill="url(#${id}f)"/>
      <g clip-path="url(#${id}c)">
        <path d="M8 104 L92 20 L92 104 Z" fill="${stance}" opacity="0.42"/>
        <path d="M50 4 L50 104" stroke="rgba(255,255,255,0.08)" stroke-width="1.5"/>
        <circle cx="50" cy="54" r="30" fill="rgba(0,0,0,0.22)"/>
      </g>
      ${icon(w1, -1)}
      ${icon(w2, 1)}
      <path d="${SHIELD}" fill="none" stroke="url(#${id}r)" stroke-width="5" stroke-linejoin="round"/>
      ${banner ? `<path d="M14 98 L86 98 L80 108 L86 118 L14 118 L20 108 Z" fill="#0f1420" stroke="url(#${id}r)" stroke-width="2.5" stroke-linejoin="round"/>
      <text x="50" y="112.5" text-anchor="middle" font-family="'Barlow Condensed', Inter, system-ui, sans-serif" font-weight="800" font-size="13" letter-spacing="1.5" fill="${frameA}">${initials(legend.name)}</text>` : ''}
    </svg>`;
  }

  return { svg, ICONS, targetType };
})();
