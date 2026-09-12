// The dashboard: every phone on the map of Egypt, at its site, colored by the hours it records a day. Management only.
// It reads the morning check-ins and the evening check-outs through dr_map and draws itself again every five minutes while the page is open.
import { mount, esc, labels, store, toast, fmt, href } from '../app.js';
import { rpc, gate, loading, failed, friendly, clock, shortDay, nowTime, CODE } from '../online.js';
import { OUTLINE, NILE, BRANCHES, CANAL, ROADS, SEAS, TOWNS, place, frame, pathOf } from '../egypt.js';

const L = await labels('dashboard');
const app = await mount({ page: 'dashboard', title: L('Dashboard'), lede: L('Every phone on the map, at its site, colored by the hours it records a day: green from 5 hours, yellow from 3, red under 3. It reads the morning check-ins and the evening check-outs.') });

let code = store.get(CODE, '');
let days = [7, 14, 30].includes(Number(store.get('vm.dash.days', 7))) ? Number(store.get('vm.dash.days', 7)) : 7;
let data = null;
let picked = null;      // the site whose phones are listed
let updated = '';
let timer = null;
let seq = 0;         // the number of the latest request, so a slow older reply is dropped
let lastW = 0;

const n = v => fmt(v ?? 0);
const one = v => (v == null || v === '' ? '' : (Math.round(Number(v) * 10) / 10).toFixed(1));
const DOT = { green: 'g', yellow: 'y', red: 'r', none: 'n' };
const STATUS = { green: L('5 hours a day or more'), yellow: L('3 to 5 hours a day'), red: L('Under 3 hours a day'), none: L('No evening reading yet') };
const SITE_ST = { active: L('Active'), ready: L('Ready to film'), agreed: L('Agreed'), contacted: L('Contacted'), prospect: L('Prospect'), paused: L('Paused') };
const TEAM = { direct: L('Direct'), partner: L('Partner') };

function open(c) { code = c; load(); }
async function load(quiet = false) {
  if (!code) return gate(app, L, open, '', L('The same code as the company report.'));
  if (!quiet) loading(app, L);
  const my = ++seq;
  try {
    const got = await rpc('dr_map', { p_code: code, p_days: days });
    if (my !== seq) return;
    data = got;
    store.set(CODE, code);
    updated = clock(L, nowTime());
    if (picked && !data.sites.some(s => s.id === picked)) picked = null;
    render();
    if (!timer) timer = setInterval(() => { if (!document.hidden && code) load(true); }, 5 * 60 * 1000);
  } catch (err) {
    if (my !== seq) return;
    if (err.message === 'wrong code') { clearInterval(timer); timer = null; store.remove(CODE); code = ''; return gate(app, L, open, L('That code is wrong.')); }
    if (quiet) return toast(friendly(L, err.message));
    failed(app, L, friendly(L, err.message), load);
  }
}

/* the phones of a site, in tag order, and the ring each one sits on around the site's point */
const phonesOf = id => (data.phones || []).filter(p => p.site_id === id);
const ringOf = i => { if (i === 0) return { k: 0, j: 0, of: 1 }; let k = 1, start = 1; while (i >= start + 6 * k) { start += 6 * k; k++; } return { k, j: i - start, of: 6 * k }; };
const spotOf = i => { const { k, j, of } = ringOf(i); if (!k) return [0, 0]; const a = (j / of) * Math.PI * 2 - Math.PI / 2; return [Math.cos(a) * k * 9, Math.sin(a) * k * 9]; };
const radiusOf = count => (count <= 1 ? 6 : ringOf(count - 1).k * 9 + 5);

function mapHTML(W) {
  const sites = data.sites || [];
  const placed = sites.map(s => ({ s, at: place(s) })).filter(x => x.at);
  const f = frame(placed.map(x => x.at), W, { maxRatio: W < 520 ? 1.25 : 0.9 });
  // every site starts at its true spot; sites on one spot fan out a little; then rings that overlap push each other apart
  // until none do, and a thin line leads back to the true spot when a site has moved
  const seen = {};
  for (const x of placed) {
    x.ox = f.x(x.at.lng); x.oy = f.y(x.at.lat);
    x.R = radiusOf(phonesOf(x.s.id).length);
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
      const need = a.R + b.R + 22;   // room for the two rings and a label
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
    `<g class="town"><rect x="${(f.x(t.lng) - 2).toFixed(1)}" y="${(f.y(t.lat) - 2).toFixed(1)}" width="4" height="4"/><text x="${(f.x(t.lng) + 5).toFixed(1)}" y="${(f.y(t.lat) + 3.5).toFixed(1)}">${esc(t.name)}</text></g>`).join('');
  const seas = SEAS.filter(inside).map(x => `<text class="sea" x="${f.x(x.lng).toFixed(1)}" y="${f.y(x.lat).toFixed(1)}">${esc(L(x.name))}</text>`).join('');
  // the scale bar: a round number of kilometres, 60 to 150 px long
  const kmPerPx = 111 / f.pxPerDeg;
  const km = [10, 25, 50, 100, 200, 300, 500, 1000].find(v => v / kmPerPx >= 60) || 1000;
  const barW = km / kmPerPx;
  const scale = `<g class="scale" transform="translate(10 ${f.h - 12})"><line x1="0" y1="0" x2="${barW.toFixed(1)}" y2="0"/><line x1="0" y1="-3" x2="0" y2="3"/><line x1="${barW.toFixed(1)}" y1="-3" x2="${barW.toFixed(1)}" y2="3"/><text x="${(barW / 2).toFixed(1)}" y="-6">${esc(L('{n} km', { n: fmt(km) }))}</text></g>`;
  const north = `<g class="north" transform="translate(${f.w - 18} 18)"><path d="M0 8 L0 -8 M0 -8 L-3.5 -2 M0 -8 L3.5 -2"/><text y="20">${esc(L('N'))}</text></g>`;
  const marks = placed.map(x => {
    const ph = phonesOf(x.s.id);
    const R = radiusOf(ph.length);
    const dots = ph.map((p, i) => { const [dx, dy] = spotOf(i); return `<circle class="dot ${DOT[p.status] || 'n'}" cx="${(x.x + dx).toFixed(1)}" cy="${(x.y + dy).toFixed(1)}" r="3.4"><title>${esc(L('Phone {n}: {h}', { n: p.tag, h: p.hours_day == null ? STATUS.none : L('{h} hours a day', { h: one(p.hours_day) }) }))}</title></circle>`; }).join('');
    const mark = ph.length ? '' : `<rect class="mark${x.s.status === 'active' ? '' : ' off'}" x="${(x.x - 4).toFixed(1)}" y="${(x.y - 4).toFixed(1)}" width="8" height="8"/>`;
    const far = Math.hypot(x.x - x.ox, x.y - x.oy) > 6;
    const half = Math.min(f.w / 2, 5 + x.s.name.length * 3.5);
    const lx = Math.min(Math.max(x.x, half), f.w - half);
    return `<g class="site${x.s.id === picked ? ' on' : ''}" data-site="${esc(x.s.id)}">
      ${far ? `<line class="lead" x1="${x.ox.toFixed(1)}" y1="${x.oy.toFixed(1)}" x2="${x.x.toFixed(1)}" y2="${x.y.toFixed(1)}"/><circle class="spot" cx="${x.ox.toFixed(1)}" cy="${x.oy.toFixed(1)}" r="1.8"/>` : ''}
      <circle class="halo" cx="${x.x.toFixed(1)}" cy="${x.y.toFixed(1)}" r="${R + 3}"/>
      <circle class="hit" cx="${x.x.toFixed(1)}" cy="${x.y.toFixed(1)}" r="${R + 8}"><title>${esc(x.s.name)}</title></circle>
      ${mark}${dots}
      <text class="lab" x="${lx.toFixed(1)}" y="${(x.y + R + 13).toFixed(1)}">${esc(x.s.name)}</text>
    </g>`;
  }).join('');
  return `<svg class="egypt" viewBox="0 0 ${f.w} ${f.h}" width="${f.w}" height="${f.h}" role="img" aria-label="${esc(L('Map of the sites'))}">
    <rect class="sea-bg" x="0" y="0" width="${f.w}" height="${f.h}"/>${grid}
    <path class="land" d="${pathOf(OUTLINE, f, true)}"/>${water}${roads}${towns}${seas}${marks}${scale}${north}
    <rect class="edge" x="0.5" y="0.5" width="${f.w - 1}" height="${f.h - 1}"/></svg>`;
}

function drawMap() {
  const host = document.getElementById('map');
  if (!host) return;
  const W = Math.max(280, host.clientWidth || 720);
  lastW = W;
  host.innerHTML = mapHTML(W);
}
window.addEventListener('resize', () => { requestAnimationFrame(() => { const host = document.getElementById('map'); if (host && Math.abs(host.clientWidth - lastW) > 8) drawMap(); }); });

function phonesHTML(id) {
  const ph = phonesOf(id);
  if (!ph.length) return `<p class="mute small">${esc(L('No phone seen at this site in the last 14 days.'))}</p>`;
  return `<div class="t-wrap"><table class="t dash phones"><thead><tr><th>${esc(L('Phone'))}</th><th>${esc(L('Hours a day'))}</th><th class="num">${esc(L('Today'))}</th><th class="num">${esc(L('Days read'))}</th><th>${esc(L('Last seen'))}</th><th class="num">${esc(L('Minutes all time'))}</th><th class="num">${esc(L('Minutes saved locally'))}</th></tr></thead>
    <tbody>${ph.map(p => `<tr><td><b>${esc(p.tag)}</b></td><td><i class="sw ${DOT[p.status] || 'n'}"></i>${p.hours_day == null ? `<span class="mute">${esc(STATUS.none)}</span>` : esc(one(p.hours_day))}</td><td class="num">${esc(one(p.today))}</td><td class="num">${n(p.days)}</td><td>${p.last_day ? esc(shortDay(p.last_day)) + (p.last_kind === 'morning' ? ` <span class="pill">${esc(L('morning'))}</span>` : '') : ''}</td><td class="num">${p.total == null ? '' : n(p.total)}</td><td class="num">${p.local == null ? '' : n(p.local)}</td></tr>`).join('')}</tbody></table></div>`;
}

/* one card per site: the summary line always, the phones when it is open */
function cardHTML(s) {
  const open = s.id === picked;
  const chip = (k, v) => (Number(v) ? `<span class="cc ${DOT[k]}"><i class="sw ${DOT[k]}"></i>${n(v)}</span>` : '');
  return `<div class="site-card${open ? ' on' : ''}" data-id="${esc(s.id)}">
    <button type="button" class="sc-head" aria-expanded="${open}">
      <span class="sc-name">${esc(s.name)}<span class="sc-sub">${esc(TEAM[s.team] || s.team)}${s.city ? ', ' + esc(s.city) : ''}${place(s) ? '' : ' , ' + esc(L('not on the map'))}</span></span>
      <span class="sc-pills"><span class="pill st-${esc(s.status)}">${esc(SITE_ST[s.status] || s.status)}</span></span>
      <span class="sc-counts">${chip('green', s.green)}${chip('yellow', s.yellow)}${chip('red', s.red)}${chip('none', s.none)}${Number(s.phones) ? '' : `<span class="mute tiny">${esc(L('no phones'))}</span>`}</span>
      <span class="sc-hours">${s.hours_day == null ? '' : `<b>${esc(one(s.hours_day))}</b> <span class="tiny mute">${esc(L('hours a phone a day'))}</span>`}</span>
      <span class="sc-mark" aria-hidden="true"></span>
    </button>
    <div class="sc-body"${open ? '' : ' hidden'}>
      <p class="tiny mute">${esc(L('Last check-in'))}: ${s.last_in ? esc(shortDay(s.last_in)) : esc(L('none'))} , ${esc(L('Last check-out'))}: ${s.last_out ? esc(shortDay(s.last_out)) : esc(L('none'))}</p>
      ${open ? phonesHTML(s.id) : ''}
    </div>
  </div>`;
}

function pick(id, scroll = false) {
  picked = picked === id ? null : id;
  document.querySelectorAll('.site-card').forEach(c => {
    const on = c.dataset.id === picked;
    c.classList.toggle('on', on);
    c.querySelector('.sc-head').setAttribute('aria-expanded', String(on));
    const body = c.querySelector('.sc-body');
    body.hidden = !on;
    if (on && !body.querySelector('.t-wrap, .mute')) body.insertAdjacentHTML('beforeend', phonesHTML(picked));
    else if (on) { const old = body.querySelector('.t-wrap, p.mute.small'); if (old) old.remove(); body.insertAdjacentHTML('beforeend', phonesHTML(picked)); }
  });
  document.querySelectorAll('.egypt .site').forEach(g => g.classList.toggle('on', g.dataset.site === picked));
  if (scroll && picked) document.querySelector(`.site-card[data-id="${CSS.escape(picked)}"]`)?.scrollIntoView({ block: 'nearest' });
}

function render() {
  const sites = data.sites || [], all = data.phones || [];
  const onMap = sites.filter(s => place(s));
  const phones = all.filter(p => onMap.some(s => s.id === p.site_id));   // the tiles describe what is drawn
  const count = st => phones.filter(p => p.status === st).length;
  const read = phones.filter(p => p.hours_day != null);
  const avg = read.length ? read.reduce((a, p) => a + Number(p.hours_day), 0) / read.length : null;
  const off = all.length - phones.length;
  app.content.innerHTML = `
    <div class="stat dash-stat">
      <div><div class="big num">${n(phones.length)}</div><div class="lbl">${esc(L('phones on the map, {n} sites', { n: n(onMap.length) }))}</div></div>
      <div><div class="big num ok">${n(count('green'))}</div><div class="lbl">${esc(STATUS.green)}</div></div>
      <div><div class="big num warn">${n(count('yellow'))}</div><div class="lbl">${esc(STATUS.yellow)}</div></div>
      <div><div class="big num bad">${n(count('red'))}</div><div class="lbl">${esc(STATUS.red)}</div></div>
      <div><div class="big num">${avg == null ? '' : esc(one(avg))}</div><div class="lbl">${esc(L('hours a phone a day, last {w}', { w: L(`${data.window || days} days`) }))}</div></div>
    </div>
    <div class="daybar no-print">
      <div class="chips" id="win">${[7, 14, 30].map(d => `<button type="button" class="chip${d === days ? ' on' : ''}" data-days="${d}">${esc(L(`${d} days`))}</button>`).join('')}</div>
      <span class="grow"></span>
      <span class="tiny mute">${esc(L('Updated {t}', { t: updated }))}</span>
      <button type="button" class="btn" id="refresh">${esc(L('Refresh'))}</button>
    </div>
    <div class="map-wrap"><div class="map" id="map"></div>
      <div class="map-legend">${['green', 'yellow', 'red', 'none'].map(k => `<span><i class="sw ${DOT[k]}"></i>${esc(STATUS[k])}</span>`).join('')}</div>
    </div>
    <p class="tiny dim">${esc(L('A phone sits at the site of its latest check-in or check-out. A site sits on the map by its pin, else by its city, else by its hub area. A site with none of these is in the list only.'))}${off ? ' ' + esc(L('{n} phones are at a site that is not on the map.', { n: n(off) })) : ''} <a href="${href('sites')}">${esc(L('Site database'))}</a></p>
    <div class="site-cards" id="sites">${sites.map(cardHTML).join('') || `<p class="mute">${esc(L('No site yet. Add one on the site database.'))}</p>`}</div>`;
  drawMap();
  document.getElementById('win').addEventListener('click', e => { const b = e.target.closest('[data-days]'); if (!b) return; days = Number(b.dataset.days); store.set('vm.dash.days', days); load(true); });
  document.getElementById('refresh').addEventListener('click', () => load(true));
  document.getElementById('sites').addEventListener('click', e => { const c = e.target.closest('.site-card'); if (c) pick(c.dataset.id); });
  document.getElementById('map').addEventListener('click', e => { const g = e.target.closest('.site'); if (g && g.dataset.site !== picked) pick(g.dataset.site, true); });
}

load();
