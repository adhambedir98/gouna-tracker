// The map of the sites: Egypt drawn from js/egypt.js, one dot for every site, and that site's phones fanned out around it
// when it is the one being looked at. The page hands in what it knows and gets back an SVG.
import { esc, fmt, lang } from './app.js';
import { OUTLINE, NILE, BRANCHES, CANAL, ROADS, SEAS, TOWNS, place, frame, pathOf } from './egypt.js';

const DOT = { green: 'g', yellow: 'y', red: 'r', none: 'n' };
const one = v => (v == null || v === '' ? '' : (Math.round(Number(v) * 10) / 10).toFixed(1));
// the ring a phone sits on around its site, and how wide a site grows when its phones are shown
const ringOf = i => { if (i === 0) return { k: 0, j: 0, of: 1 }; let k = 1, start = 1; while (i >= start + 6 * k) { start += 6 * k; k++; } return { k, j: i - start, of: 6 * k }; };
const spotOf = i => { const { k, j, of } = ringOf(i); if (!k) return [0, 0]; const a = (j / of) * Math.PI * 2 - Math.PI / 2; return [Math.cos(a) * k * 9, Math.sin(a) * k * 9]; };
const openR = count => (count <= 1 ? 6 : ringOf(count - 1).k * 9 + 5);
const shutR = count => (count > 99 ? 13 : count > 9 ? 11 : 9);
const stateOf = s => (s.hours_day == null ? 'none' : Number(s.hours_day) >= 5 ? 'green' : Number(s.hours_day) >= 3 ? 'yellow' : 'red');

export function mapHTML({ L, W, sites = [], phones = [], picked = null }) {
  const ar = lang === 'ar';   // the towns and the seas are named in the reader's language
  const phonesOf = id => phones.filter(p => p.site_id === id);
  const placed = sites.map(s => ({ s, at: place(s) })).filter(x => x.at);
  const f = frame(placed.map(x => x.at), W, { maxRatio: W < 520 ? 1.25 : 0.9 });
  // every site starts at its true spot; sites on one spot fan out a little; then the dots that overlap push each other apart
  // until none do, and a thin line leads back to the true spot when a site has moved
  const seen = {};
  for (const x of placed) {
    x.ox = f.x(x.at.lng); x.oy = f.y(x.at.lat);
    x.n = phonesOf(x.s.id).length;
    x.open = x.s.id === picked;
    x.R = x.open ? openR(x.n) : shutR(x.n);
    const key = `${Math.round(x.ox / 6)},${Math.round(x.oy / 6)}`;
    const i = (seen[key] = (seen[key] || 0) + 1) - 1;
    const a = (i * 2 * Math.PI) / 3 + Math.PI / 2;
    x.x = x.ox + (i ? Math.cos(a) * 2 : 0); x.y = x.oy + (i ? Math.sin(a) * 2 : 0);
  }
  for (let it = 0; it < 60; it++) {
    let moved = false;
    for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i], b = placed[j];
      let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      const need = a.R + b.R + 22;   // room for the two dots and a label
      if (d >= need) continue;
      if (d < 0.5) { dx = 1; dy = 0; d = 1; }
      const push = (need - d) / 2;
      a.x -= dx / d * push; a.y -= dy / d * push; b.x += dx / d * push; b.y += dy / d * push;
      moved = true;
    }
    for (const x of placed) { x.x = Math.min(Math.max(x.x, x.R + 4), f.w - x.R - 4); x.y = Math.min(Math.max(x.y, x.R + 4), f.h - x.R - 18); }
    if (!moved) break;
  }
  // the furniture of an operations map: a grid, the coast, the water, the roads, the towns, the seas, a scale bar
  const deg = f.lng1 - f.lng0;
  const step = deg > 9 ? 2 : deg > 4 ? 1 : 0.5;
  let grid = '';
  for (let v = Math.ceil(f.lng0 / step) * step; v <= f.lng1; v += step) grid += `<line class="grid" x1="${f.x(v).toFixed(1)}" y1="0" x2="${f.x(v).toFixed(1)}" y2="${f.h}"/>`;
  for (let v = Math.ceil(f.lat0 / step) * step; v <= f.lat1; v += step) grid += `<line class="grid" x1="0" y1="${f.y(v).toFixed(1)}" x2="${f.w}" y2="${f.y(v).toFixed(1)}"/>`;
  const roads = ROADS.map(r => `<path class="road" d="${pathOf(r, f)}"/>`).join('');
  const water = `<path class="nile" d="${pathOf(NILE, f)}"/>${BRANCHES.map(b => `<path class="nile" d="${pathOf(b, f)}"/>`).join('')}<path class="canal" d="${pathOf(CANAL, f)}"/>`;
  const inside = p => p.lng > f.lng0 && p.lng < f.lng1 && p.lat > f.lat0 && p.lat < f.lat1;
  const towns = TOWNS.filter(t => (t.rank === 1 || deg < 5) && inside(t)).map(t =>
    `<g class="town"><rect x="${(f.x(t.lng) - 2).toFixed(1)}" y="${(f.y(t.lat) - 2).toFixed(1)}" width="4" height="4"/><text x="${(f.x(t.lng) + 5).toFixed(1)}" y="${(f.y(t.lat) + 3.5).toFixed(1)}">${esc(ar && t.ar ? t.ar : t.name)}</text></g>`).join('');
  const seas = SEAS.filter(inside).map(x => `<text class="sea" x="${f.x(x.lng).toFixed(1)}" y="${f.y(x.lat).toFixed(1)}">${esc(ar && x.ar ? x.ar : x.name)}</text>`).join('');
  // the scale bar: a round number of kilometres, 60 to 150 px long
  const kmPerPx = 111 / f.pxPerDeg;
  const km = [10, 25, 50, 100, 200, 300, 500, 1000].find(v => v / kmPerPx >= 60) || 1000;
  const barW = km / kmPerPx;
  const scale = `<g class="scale" transform="translate(10 ${f.h - 12})"><line x1="0" y1="0" x2="${barW.toFixed(1)}" y2="0"/><line x1="0" y1="-3" x2="0" y2="3"/><line x1="${barW.toFixed(1)}" y1="-3" x2="${barW.toFixed(1)}" y2="3"/><text x="${(barW / 2).toFixed(1)}" y="-6">${esc(L('{n} km', { n: fmt(km) }))}</text></g>`;
  const north = `<g class="north" transform="translate(${f.w - 18} 18)"><path d="M0 8 L0 -8 M0 -8 L-3.5 -2 M0 -8 L3.5 -2"/><text y="20">${esc(L('N'))}</text></g>`;
  const marks = placed.map(x => {
    const ph = phonesOf(x.s.id);
    // shut: one dot for the site, with how many phones are at it. Open: one dot per phone, in rings around the spot
    const shut = `<circle class="site-dot ${DOT[stateOf(x.s)]}" cx="${x.x.toFixed(1)}" cy="${x.y.toFixed(1)}" r="${x.R}"/>`
      + (x.n ? `<text class="site-n" x="${x.x.toFixed(1)}" y="${(x.y + 3.2).toFixed(1)}">${esc(fmt(x.n))}</text>` : '');
    const open = ph.map((p, i) => { const [dx, dy] = spotOf(i); return `<circle class="dot ${DOT[p.status] || 'n'}" cx="${(x.x + dx).toFixed(1)}" cy="${(x.y + dy).toFixed(1)}" r="3.4"><title>${esc(L('Phone {n}: {h}', { n: p.tag, h: p.hours_day == null ? L('No evening reading yet') : L('{h} hours a day', { h: one(p.hours_day) }) }))}</title></circle>`; }).join('');
    const far = Math.hypot(x.x - x.ox, x.y - x.oy) > 6;
    const half = Math.min(f.w / 2, 5 + x.s.name.length * 3.5);
    const lx = Math.min(Math.max(x.x, half), f.w - half);
    return `<g class="site${x.open ? ' on' : ''}" data-site="${esc(x.s.id)}">
      ${far ? `<line class="lead" x1="${x.ox.toFixed(1)}" y1="${x.oy.toFixed(1)}" x2="${x.x.toFixed(1)}" y2="${x.y.toFixed(1)}"/><circle class="spot" cx="${x.ox.toFixed(1)}" cy="${x.oy.toFixed(1)}" r="1.8"/>` : ''}
      <circle class="halo" cx="${x.x.toFixed(1)}" cy="${x.y.toFixed(1)}" r="${x.R + 3}"/>
      <circle class="hit" cx="${x.x.toFixed(1)}" cy="${x.y.toFixed(1)}" r="${x.R + 8}"><title>${esc(x.s.name)}</title></circle>
      ${x.open ? open : shut}
      <text class="lab" x="${lx.toFixed(1)}" y="${(x.y + x.R + 13).toFixed(1)}">${esc(x.s.name)}</text>
    </g>`;
  }).join('');
  const defs = `<defs><filter id="dot-shadow" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="1" stdDeviation="1.1" flood-color="#1C2620" flood-opacity="0.3"/></filter></defs>`;
  return `<svg class="egypt" viewBox="0 0 ${f.w} ${f.h}" width="${f.w}" height="${f.h}" role="img" aria-label="${esc(L('Map of the sites'))}">
    ${defs}<rect class="sea-bg" x="0" y="0" width="${f.w}" height="${f.h}"/>${grid}
    <path class="land" d="${pathOf(OUTLINE, f, true)}"/>${water}${roads}${towns}${seas}${marks}${scale}${north}
    <rect class="edge" x="0.5" y="0.5" width="${f.w - 1}" height="${f.h - 1}"/></svg>`;
}
