import { mount, loadJSON, esc, t, fmt, store, ROOT } from '../app.js';
import { blocks, MANUAL_TOC } from '../manual-blocks.js';
import { svg, rect, text, line, circle, path, box, figure, wrap } from '../svg.js';

const m = await loadJSON('data/manual/data-logistics.json');
const app = await mount({
  page: 'manual-data-logistics',
  title: { en: m.title },
  lede: { en: m.purpose },
  toc: [{ id: 'pipeline', label: { en: 'The pipeline' } }, { id: 'hubs', label: { en: 'The hub network' } }, { id: 'transport', label: { en: 'Transport' } }, { id: 'letter', label: { en: 'The runner letter' } }, ...MANUAL_TOC]
});
const P = m.pipeline, H = m.hubs;

/* ---------- the pipeline ---------- */
function pipeline() {
  const W = 360, id = 'pipe';
  let s = '';
  // phone
  s += box(105, 10, 150, 46, ['Phone'], { cls: 'bx-acc-line', sub: [`${P.gbPerHour} GB per hour`] });
  // bus to three paths
  s += line(180, 56, 180, 84, 'ln-acc');
  s += line(65, 84, 295, 84, 'ln');
  [65, 180, 295].forEach(x => s += line(x, 84, x, 110, 'ln', `marker-end="url(#${id}-arr)"`));
  // three path boxes
  s += box(10, 112, 110, 54, ['Site fiber'], { sub: ['phones stay'] });
  s += box(125, 112, 110, 54, ['Runner'], { sub: ['a third per run'] });
  s += rect(240, 112, 110, 54, 'bx', 'stroke-dasharray="4 4"');
  s += text(295, 132, 'Router island', { cls: 'tx tx-b', anchor: 'middle' });
  s += text(295, 148, 'Thursdays, emergencies', { cls: 'tx tx-m tx-s', anchor: 'middle' });
  // hub below the runner
  s += line(180, 166, 180, 196, 'ln', `marker-end="url(#${id}-arr)"`);
  s += box(125, 198, 110, 54, ['Hub'], { sub: ['passes at 300 Mbps'] });
  s += text(242, 222, 'two hubs,', { cls: 'tx tx-m tx-s' });
  s += text(242, 235, 'two districts', { cls: 'tx tx-m tx-s' });
  // converge
  s += line(65, 166, 65, 290, 'ln');
  s += line(295, 166, 295, 290, 'ln dash');
  s += line(180, 252, 180, 290, 'ln');
  s += line(65, 290, 295, 290, 'ln');
  s += line(180, 290, 180, 318, 'ln-acc', `marker-end="url(#${id}-arr-acc)"`);
  s += box(105, 320, 150, 46, ['The client'], { cls: 'bx-acc', tcls: 'tx tx-b tx-p' });
  // physics
  s += rect(10, 392, 340, 96, 'bx-panel');
  s += text(24, 416, `${fmt(P.exampleHoursPerDay)} hours a day`, { cls: 'tx tx-l tx-b' });
  s += text(24, 440, `is ${P.tbPerDay} TB a day,`, { cls: 'tx' });
  s += text(24, 460, `about ${P.mbps} Mbps sustained, around the clock.`, { cls: 'tx' });
  s += text(24, 480, 'Consumer routers cannot carry it. Fiber can.', { cls: 'tx tx-m tx-s' });
  s += text(10, 516, P.rule, { cls: 'tx tx-b tx-a' });
  return figure(svg({ w: W, h: 526, label: 'Footage moving from the phone to the client', inner: s, id }), { cls: 'narrow' });
}

/* ---------- the hub network, a schematic ---------- */
function hubMap() {
  const W = 360, Hh = 372, id = 'hub';
  let s = '';
  // the river, stylized
  s += path('M190 0 C 175 60, 205 120, 185 180 S 170 290, 195 330', 'ln-soft', 'stroke-width="18" stroke-linecap="round" opacity="0.7"');
  s += text(200, 52, 'the Nile', { cls: 'tx tx-d tx-s' });
  // the client at the top edge
  s += rect(120, 6, 120, 26, 'bx-acc');
  s += text(180, 23, 'to the client', { cls: 'tx tx-s tx-p', anchor: 'middle' });
  const hubs = { A: { x: 82, y: 170 }, B: { x: 286, y: 170 } };
  const sites = [
    { name: 'Factory', kind: 'hub', hub: 'A', x: 40, y: 90 },
    { name: 'Warehouse', kind: 'hub', hub: 'A', x: 60, y: 262 },
    { name: 'Construction', kind: 'hub', hub: 'B', x: 318, y: 90 },
    { name: 'Farm', kind: 'hub', hub: 'B', x: 300, y: 268 },
    { name: 'Hotel', kind: 'fiber', x: 150, y: 96 },
    { name: 'Hotel', kind: 'fiber', x: 236, y: 224 }
  ];
  // hubs to the client
  Object.values(hubs).forEach(h => s += line(h.x, h.y - 16, h.x, 34, 'ln-acc', `marker-end="url(#${id}-arr-acc)"`));
  // runs: sites to hubs
  sites.filter(x => x.kind === 'hub').forEach(x => {
    const h = hubs[x.hub];
    const dx = h.x - x.x, dy = h.y - x.y, L = Math.hypot(dx, dy);
    const ux = dx / L, uy = dy / L;
    s += line((x.x + ux * 10).toFixed(1), (x.y + uy * 10).toFixed(1), (h.x - ux * 20).toFixed(1), (h.y - uy * 20).toFixed(1), 'ln dash', `marker-end="url(#${id}-arr)"`);
  });
  // fiber sites straight up
  sites.filter(x => x.kind === 'fiber').forEach(x => s += line(x.x, x.y - 8, x.x, 34, 'ln-acc', `marker-end="url(#${id}-arr-acc)"`));
  // hubs
  Object.entries(hubs).forEach(([k, h]) => {
    s += rect(h.x - 30, h.y - 16, 60, 32, 'bx-acc-line');
    s += text(h.x, h.y + 5, `Hub ${k}`, { cls: 'tx tx-b tx-a', anchor: 'middle' });
  });
  // sites
  sites.forEach(x => {
    s += circle(x.x, x.y, 6, x.kind === 'fiber' ? 'dot' : 'dot-m');
    s += text(x.x, x.y + 20, x.name, { cls: 'tx tx-s', anchor: 'middle' });
    if (x.kind === 'fiber') s += text(x.x, x.y + 32, 'own fiber', { cls: 'tx tx-d tx-s', anchor: 'middle' });
  });
  // legend
  s += line(0, 318, W, 318, 'ln-soft');
  s += circle(14, 338, 5, 'dot'); s += text(26, 342, 'site with its own line, phones stay', { cls: 'tx tx-s tx-m' });
  s += circle(14, 358, 5, 'dot-m'); s += text(26, 362, 'hub site, runner at shift end, dashed run', { cls: 'tx tx-s tx-m' });
  return figure(svg({ w: W, h: Hh, label: 'Schematic of sites, two hubs, and runs', inner: s, id }), { caption: 'Abstract, not a real map. Two hubs in different districts so one landlord or one fiber cut cannot stop the company.', cls: 'narrow' });
}

/* ---------- the letter ---------- */
const KEY = 'vm.letter';
const fieldValues = () => ({ ...Object.fromEntries(H.letter.fields.map(f => [f.id, f.value])), ...store.get(KEY, {}) });
function fill(s, v) { return s.replace(/\{(\w+)\}/g, (_, k) => v[k] ? esc(v[k]) : '<span class="dim">________</span>'); }
function letterHTML(lang, v) {
  const L = H.letter[lang];
  return `<div class="letter" dir="${lang === 'ar' ? 'rtl' : 'ltr'}" lang="${lang}">
    <h3>${esc(L.title)}</h3>
    ${L.body.map(p => `<p>${fill(p, v)}</p>`).join('')}
    <p>${fill(L.date, v)}</p>
    <div class="sig"><div>${esc(L.sign)}</div><div>${lang === 'ar' ? 'اسم المندوب وتوقيعه' : 'Runner name and signature'}</div></div>
  </div>`;
}
function letterSection() {
  const v = fieldValues();
  return `<section id="letter">
    <h2>The runner letter</h2>
    <p class="mute">Fill it once. It is saved on this device. Print both pages; the runner carries them with a copy of the commercial register and the manifest.</p>
    <form id="letter-form" class="fields no-print">${H.letter.fields.map(f => `<div class="field"><label for="lf-${f.id}">${esc(t(f.label))}</label><input id="lf-${f.id}" name="${f.id}" value="${esc(v[f.id] || '')}" autocomplete="off"></div>`).join('')}</form>
    <div class="btn-row no-print"><button type="button" class="btn primary" id="letter-print">Print the letter</button><button type="button" class="btn" id="letter-reset">Clear</button></div>
    <div id="letters">${letterHTML('ar', v)}${letterHTML('en', v)}</div>
  </section>`;
}
function printLetter() {
  const v = fieldValues();
  const w = window.open('', '_blank');
  if (!w) { window.print(); return; }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Runner letter</title>
    <link rel="stylesheet" href="${new URL('css/site.css', ROOT).href}">
    <style>body{background:#fff;display:block;padding:0}.letter{border:0;max-width:none;padding:22mm 18mm;break-after:page;font-size:16px}.letter:last-child{break-after:auto}@page{size:A4;margin:0}</style>
    </head><body>${letterHTML('ar', v)}${letterHTML('en', v)}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 400);
}

/* ---------- page ---------- */
function render() {
  app.content.innerHTML = `
    <section id="pipeline">
      <h2>The pipeline</h2>
      ${pipeline()}
      <ul class="rows">${P.paths.map(p => `<li><b>${esc(p.name)}</b><span class="d">${esc(p.text)}</span></li>`).join('')}</ul>
      <h3 style="margin-top:28px">Three layers</h3>
      <div class="t-wrap"><table class="t"><thead><tr><th>Layer</th><th>Where</th><th>Rule</th></tr></thead><tbody>${P.layers.map(l => `<tr><td><b>${esc(l.name)}</b></td><td>${esc(l.where)}</td><td>${esc(l.rule)}</td></tr>`).join('')}</tbody></table></div>
      <h3 style="margin-top:28px">The physics</h3>
      <div class="t-wrap"><table class="t"><thead><tr><th>Hours a day</th><th class="num">TB a day</th><th class="num">Mbps</th><th class="num">Hubs</th></tr></thead><tbody>${P.capacity.map(c => `<tr><td>${fmt(c.hours)}</td><td class="num">${c.tb}</td><td class="num">${fmt(c.mbps)}</td><td class="num">${Math.max(2, Math.ceil(c.mbps / P.hubMbps))}</td></tr>`).join('')}</tbody></table></div>
      <p class="mute small">An hour is ${P.gbPerHour} GB. A hub passes only when ${P.hubTest}. Always at least two hubs.</p>
    </section>
    <section id="hubs">
      <h2>The hub network</h2>
      ${hubMap()}
    </section>
    <section id="transport">
      <h2>Transport rules</h2>
      <div class="cards">${H.transport.map(r => `<div class="card"><h3>${esc(r.rule)}</h3><p class="mute small">${esc(r.text)}</p></div>`).join('')}</div>
    </section>
    ${letterSection()}
    ${blocks(m)}`;
}
render();

document.addEventListener('input', e => {
  const f = e.target.closest('#letter-form'); if (!f) return;
  const v = fieldValues(); v[e.target.name] = e.target.value; store.set(KEY, v);
  document.getElementById('letters').innerHTML = letterHTML('ar', v) + letterHTML('en', v);
});
document.addEventListener('click', e => {
  if (e.target.id === 'letter-print') printLetter();
  if (e.target.id === 'letter-reset') { store.remove(KEY); render(); }
});
