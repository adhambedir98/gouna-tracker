// The dashboard: every phone on the map of Egypt, at its site, colored by the hours it records a day. Management only.
// It reads the morning check-ins and the evening check-outs through dr_map and draws itself again every five minutes while the page is open.
import { mount, esc, labels, store, toast, fmt, href } from '../app.js';
import { rpc, gate, loading, failed, friendly, shortDay, nowTime, CODE } from '../online.js';
import { OUTLINE, NILE, BRANCHES, CANAL, place, frame, pathOf } from '../egypt.js';

const L = await labels('dashboard');
const app = await mount({ page: 'dashboard', title: L('Dashboard'), lede: L('Every phone on the map, at its site, colored by the hours it records a day: green from 5 hours, yellow from 3, red under 3. It reads the morning check-ins and the evening check-outs.') });

let code = store.get(CODE, '');
let days = [7, 14, 30].includes(Number(store.get('vm.dash.days', 7))) ? Number(store.get('vm.dash.days', 7)) : 7;
let data = null;
let picked = null;      // the site whose phones are listed
let updated = '';
let timer = null;
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
  try {
    data = await rpc('dr_map', { p_code: code, p_days: days });
    store.set(CODE, code);
    updated = nowTime();
    if (picked && !data.sites.some(s => s.id === picked)) picked = null;
    render();
    if (!timer) timer = setInterval(() => { if (!document.hidden) load(true); }, 5 * 60 * 1000);
  } catch (err) {
    if (err.message === 'wrong code') { store.remove(CODE); code = ''; return gate(app, L, open, L('That code is wrong.')); }
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
  const water = `<path class="nile" d="${pathOf(NILE, f)}"/>${BRANCHES.map(b => `<path class="nile" d="${pathOf(b, f)}"/>`).join('')}<path class="canal" d="${pathOf(CANAL, f)}"/>`;
  const marks = placed.map(x => {
    const ph = phonesOf(x.s.id);
    const R = radiusOf(ph.length);
    const dots = ph.map((p, i) => { const [dx, dy] = spotOf(i); return `<circle class="dot ${DOT[p.status] || 'n'}" cx="${(x.x + dx).toFixed(1)}" cy="${(x.y + dy).toFixed(1)}" r="3.6"><title>${esc(L('Phone {n}: {h}', { n: p.tag, h: p.hours_day == null ? STATUS.none : L('{h} hours a day', { h: one(p.hours_day) }) }))}</title></circle>`; }).join('');
    const mark = ph.length ? '' : `<circle class="mark${x.s.status === 'active' ? '' : ' off'}" cx="${x.x.toFixed(1)}" cy="${x.y.toFixed(1)}" r="5"/>`;
    const far = Math.hypot(x.x - x.ox, x.y - x.oy) > 6;
    return `<g class="site${x.s.id === picked ? ' on' : ''}" data-site="${esc(x.s.id)}">
      ${far ? `<line class="lead" x1="${x.ox.toFixed(1)}" y1="${x.oy.toFixed(1)}" x2="${x.x.toFixed(1)}" y2="${x.y.toFixed(1)}"/><circle class="spot" cx="${x.ox.toFixed(1)}" cy="${x.oy.toFixed(1)}" r="1.6"/>` : ''}
      <circle class="halo" cx="${x.x.toFixed(1)}" cy="${x.y.toFixed(1)}" r="${R + 3}"/>
      ${mark}${dots}
      <text class="lab" x="${x.x.toFixed(1)}" y="${(x.y + R + 13).toFixed(1)}">${esc(x.s.name)}</text>
      <circle class="hit" cx="${x.x.toFixed(1)}" cy="${x.y.toFixed(1)}" r="${R + 8}"><title>${esc(x.s.name)}</title></circle>
    </g>`;
  }).join('');
  return `<svg class="egypt" viewBox="0 0 ${f.w} ${f.h}" width="${f.w}" height="${f.h}" role="img" aria-label="${esc(L('Map of the sites'))}">
    <path class="land" d="${pathOf(OUTLINE, f, true)}"/>${water}${marks}</svg>`;
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
  const s = (data.sites || []).find(x => x.id === id);
  if (!s) return '';
  const ph = phonesOf(id);
  return `<h3>${esc(s.name)}</h3>
    ${ph.length ? `<div class="t-wrap"><table class="t dash" id="phones"><thead><tr><th>${esc(L('Phone'))}</th><th>${esc(L('Hours a day'))}</th><th class="num">${esc(L('Today'))}</th><th class="num">${esc(L('Days read'))}</th><th>${esc(L('Last seen'))}</th><th class="num">${esc(L('Minutes all time'))}</th><th class="num">${esc(L('Saved locally'))}</th></tr></thead>
    <tbody>${ph.map(p => `<tr><td><b>${esc(p.tag)}</b></td><td><i class="sw ${DOT[p.status] || 'n'}"></i>${p.hours_day == null ? `<span class="mute">${esc(STATUS.none)}</span>` : esc(one(p.hours_day))}</td><td class="num">${esc(one(p.today))}</td><td class="num">${n(p.days)}</td><td>${p.last_day ? esc(shortDay(p.last_day)) + (p.last_kind === 'morning' ? ` <span class="pill">${esc(L('morning'))}</span>` : '') : ''}</td><td class="num">${p.total == null ? '' : n(p.total)}</td><td class="num">${p.local == null ? '' : n(p.local)}</td></tr>`).join('')}</tbody></table></div>`
    : `<p class="mute small">${esc(L('No phone seen at this site in the last 14 days.'))}</p>`}`;
}

function pick(id) {
  picked = id;
  document.querySelectorAll('#sites tr[data-id]').forEach(tr => tr.classList.toggle('on', tr.dataset.id === id));
  document.querySelectorAll('.egypt .site').forEach(g => g.classList.toggle('on', g.dataset.site === id));
  const box = document.getElementById('picked');
  if (box) box.innerHTML = phonesHTML(id);
}

function render() {
  const sites = data.sites || [], phones = data.phones || [];
  const count = st => phones.filter(p => p.status === st).length;
  const read = phones.filter(p => p.hours_day != null);
  const avg = read.length ? read.reduce((a, p) => a + Number(p.hours_day), 0) / read.length : null;
  const onMap = sites.filter(s => place(s));
  app.content.innerHTML = `
    <div class="stat dash-stat">
      <div><div class="big num">${n(phones.length)}</div><div class="lbl">${esc(L('phones on the map, {n} sites', { n: n(onMap.length) }))}</div></div>
      <div><div class="big num ok">${n(count('green'))}</div><div class="lbl">${esc(STATUS.green)}</div></div>
      <div><div class="big num warn">${n(count('yellow'))}</div><div class="lbl">${esc(STATUS.yellow)}</div></div>
      <div><div class="big num bad">${n(count('red'))}</div><div class="lbl">${esc(STATUS.red)}</div></div>
      <div><div class="big num">${avg == null ? '' : esc(one(avg))}</div><div class="lbl">${esc(L('hours a phone a day, last {n} days', { n: n(data.window || days) }))}</div></div>
    </div>
    <div class="daybar no-print">
      <div class="chips" id="win">${[7, 14, 30].map(d => `<button type="button" class="chip${d === days ? ' on' : ''}" data-days="${d}">${esc(L('{n} days', { n: d }))}</button>`).join('')}</div>
      <span class="grow"></span>
      <span class="tiny mute">${esc(L('Updated {t}', { t: updated }))}</span>
      <button type="button" class="btn" id="refresh">${esc(L('Refresh'))}</button>
    </div>
    <div class="map-wrap"><div class="map" id="map"></div>
      <div class="map-legend">${['green', 'yellow', 'red', 'none'].map(k => `<span><i class="sw ${DOT[k]}"></i>${esc(STATUS[k])}</span>`).join('')}</div>
    </div>
    <p class="tiny dim">${esc(L('A phone sits at the site of its latest check-in or check-out. A site sits on the map by its pin, else by its city. A site with neither is in the list only.'))} <a href="${href('sites')}">${esc(L('Site database'))}</a></p>
    <div class="t-wrap"><table class="t dash" id="sites"><thead><tr><th>${esc(L('Site'))}</th><th>${esc(L('Status'))}</th><th class="num">${esc(L('Phones'))}</th><th class="num">${esc(L('Green'))}</th><th class="num">${esc(L('Yellow'))}</th><th class="num">${esc(L('Red'))}</th><th class="num">${esc(L('Hours a phone a day'))}</th><th>${esc(L('Last check-in'))}</th><th>${esc(L('Last check-out'))}</th></tr></thead>
    <tbody>${sites.map(s => `<tr data-id="${esc(s.id)}"${s.id === picked ? ' class="on"' : ''}>
      <td><b>${esc(s.name)}</b>${place(s) ? '' : ` <span class="pill">${esc(L('not on the map'))}</span>`}<span class="tiny mute" style="display:block">${esc(TEAM[s.team] || s.team)}</span></td>
      <td><span class="pill st-${esc(s.status)}">${esc(SITE_ST[s.status] || s.status)}</span></td>
      <td class="num">${n(s.phones)}</td><td class="num cnt g">${Number(s.green) ? n(s.green) : ''}</td><td class="num cnt y">${Number(s.yellow) ? n(s.yellow) : ''}</td><td class="num cnt r">${Number(s.red) ? n(s.red) : ''}</td>
      <td class="num">${s.hours_day == null ? '' : esc(one(s.hours_day))}</td><td>${s.last_in ? esc(shortDay(s.last_in)) : ''}</td><td>${s.last_out ? esc(shortDay(s.last_out)) : ''}</td></tr>`).join('') || `<tr><td colspan="9" class="mute">${esc(L('No site yet. Add one on the site database.'))}</td></tr>`}</tbody></table></div>
    <div id="picked">${picked ? phonesHTML(picked) : `<p class="mute small">${esc(L('Pick a site on the map or in the list to see its phones.'))}</p>`}</div>`;
  drawMap();
  document.getElementById('win').addEventListener('click', e => { const b = e.target.closest('[data-days]'); if (!b) return; days = Number(b.dataset.days); store.set('vm.dash.days', days); load(true); });
  document.getElementById('refresh').addEventListener('click', () => load(true));
  document.getElementById('sites').addEventListener('click', e => { const tr = e.target.closest('tr[data-id]'); if (tr) pick(tr.dataset.id); });
  document.getElementById('map').addEventListener('click', e => { const g = e.target.closest('.site'); if (g) { pick(g.dataset.site); document.getElementById('picked')?.scrollIntoView({ block: 'nearest' }); } });
}

load();
