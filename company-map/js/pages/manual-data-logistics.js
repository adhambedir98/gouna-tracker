import { mount, loadJSON, esc, t, fmt, store, labels, printPage } from '../app.js';
import { blocks, MANUAL_TOC } from '../manual-blocks.js';
import { svg, rect, text, line, circle, path, box, figure, wrap } from '../svg.js';
const L = await labels('manual-data-logistics');

const m = await loadJSON('data/manual/data-logistics.json');
const app = await mount({
  page: 'manual-data-logistics',
  title: { en: m.title },
  lede: { en: m.purpose },
  toc: [{ id: 'pipeline', label: L('The pipeline') }, { id: 'hubs', label: L('The hub network') }, { id: 'transport', label: L('Transport') }, { id: 'letter', label: L('The runner letter') }, ...MANUAL_TOC]
});
const P = m.pipeline, H = m.hubs;

/* ---------- the pipeline ---------- */
function pipeline() {
  const W = 360, id = 'pipe';
  let s = '';
  // phone
  s += box(105, 10, 150, 46, [L('Phone')], { cls: 'bx-acc-line', sub: [L('{n} GB per hour', { n: P.gbPerHour })] });
  // bus to the two ways
  s += line(180, 56, 180, 84, 'ln-acc');
  s += line(92, 84, 268, 84, 'ln');
  [92, 268].forEach(x => s += line(x, 84, x, 110, 'ln', `marker-end="url(#${id}-arr)"`));
  s += box(10, 112, 164, 54, [L('Site wireless internet')], { sub: [L('phones stay')] });
  s += box(186, 112, 164, 54, [L('Runner')], { sub: [L('one run per site')] });
  // hub below the runner
  s += line(268, 166, 268, 196, 'ln', `marker-end="url(#${id}-arr)"`);
  s += box(186, 198, 164, 66, [L('Hub')], { sub: [L('passes at 300 Mbps'), L('Central and East')] });
  // converge
  s += line(92, 166, 92, 290, 'ln');
  s += line(268, 264, 268, 290, 'ln');
  s += line(92, 290, 268, 290, 'ln');
  s += line(180, 290, 180, 318, 'ln-acc', `marker-end="url(#${id}-arr-acc)"`);
  s += box(105, 320, 150, 46, [L('The client')], { cls: 'bx-acc', tcls: 'tx tx-b tx-p' });
  // physics
  s += rect(10, 392, 340, 96, 'bx-panel');
  s += text(24, 416, L('{n} hours a day', { n: fmt(P.exampleHoursPerDay) }), { cls: 'tx tx-l tx-b' });
  s += text(24, 440, L('is {n} TB a day,', { n: P.tbPerDay }), { cls: 'tx' });
  s += text(24, 460, L('about {n} Mbps sustained, around the clock.', { n: P.mbps }), { cls: 'tx' });
  s += text(24, 480, L('Mobile data cannot carry it. Fiber can.'), { cls: 'tx tx-m tx-s' });
  s += text(10, 516, P.rule, { cls: 'tx tx-b tx-a' });
  return figure(svg({ w: W, h: 526, label: L('Footage moving from the phone to the client'), inner: s, id }), { cls: 'narrow' });
}

/* ---------- the hub network, a schematic ---------- */
function hubMap() {
  const W = 360, Hh = 392, id = 'hub';
  let s = '';
  // west to east: the planned West hub, then the two live hubs, Central and East
  const byId = Object.fromEntries(H.map.hubs.map(h => [h.id, h]));
  const hubs = { B: { x: 58, y: 190, w: 96, h: 40 }, A: { x: 180, y: 190, w: 100, h: 32 }, C: { x: 298, y: 190, w: 100, h: 32 } };
  // every hub site sends its phones to the nearest live hub. West-side sites run to Central until the West hub opens
  const sites = [
    { name: L('Factory'), hub: 'A', x: 40, y: 72 },
    { name: L('Warehouse'), hub: 'A', x: 70, y: 296 },
    { name: L('Warehouse'), hub: 'A', x: 150, y: 72 },
    { name: L('Farm'), hub: 'C', x: 215, y: 296 },
    { name: L('Construction'), hub: 'C', x: 300, y: 72 },
    { name: L('Factory'), hub: 'C', x: 330, y: 296 }
  ];
  // a run stops at the edge of the hub box, not at its center
  const toEdge = (h, ux, uy) => Math.min(Math.abs(ux) > 0.001 ? h.w / 2 / Math.abs(ux) : Infinity, Math.abs(uy) > 0.001 ? h.h / 2 / Math.abs(uy) : Infinity) + 3;
  sites.forEach(x => {
    const h = hubs[x.hub];
    const dx = h.x - x.x, dy = h.y - x.y, len = Math.hypot(dx, dy);
    const ux = dx / len, uy = dy / len, d = toEdge(h, ux, uy);
    s += line((x.x + ux * 10).toFixed(1), (x.y + uy * 10).toFixed(1), (h.x - ux * d).toFixed(1), (h.y - uy * d).toFixed(1), 'ln dash', `marker-end="url(#${id}-arr)"`);
  });
  Object.entries(hubs).forEach(([k, h]) => {
    const hub = byId[k] || { name: k };
    if (hub.planned) {
      s += rect(h.x - h.w / 2, h.y - h.h / 2, h.w, h.h, 'bx dash');
      s += text(h.x, h.y - 2, hub.name, { cls: 'tx tx-b tx-m tx-s', anchor: 'middle' });
      s += text(h.x, h.y + 12, L('planned'), { cls: 'tx tx-m tx-s', anchor: 'middle' });
    } else {
      s += rect(h.x - h.w / 2, h.y - h.h / 2, h.w, h.h, 'bx-acc-line');
      s += text(h.x, h.y + 5, hub.name, { cls: 'tx tx-b tx-a tx-s', anchor: 'middle' });
    }
  });
  sites.forEach(x => {
    s += circle(x.x, x.y, 6, 'dot-m');
    s += text(x.x, x.y < 190 ? x.y - 14 : x.y + 20, x.name, { cls: 'tx tx-s', anchor: 'middle' });
  });
  // legend
  s += line(0, 338, W, 338, 'ln-soft');
  s += circle(14, 356, 5, 'dot-m'); s += text(26, 360, L('hub site, runner at shift end, dashed run'), { cls: 'tx tx-s tx-m' });
  s += rect(8, 372, 12, 12, 'bx dash'); s += text(26, 382, L('planned hub, not live yet'), { cls: 'tx tx-s tx-m' });
  return figure(svg({ w: W, h: Hh, label: L('Schematic of sites, two hubs, and runs'), inner: s, id }), { caption: L('Abstract, not a real map. Every hub site sends its phones to the nearest live hub every night. The West hub is planned: until it opens, sites on that side upload on site or run to Central.'), cls: 'narrow' });
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
    <h2>${L('The runner letter')}</h2>
    <p class="mute">${L('Fill it once. It is saved on this device. Print both pages. The runner carries them with a copy of the commercial register and the phone list.')}</p>
    <form id="letter-form" class="fields no-print">${H.letter.fields.map(f => `<div class="field"><label for="lf-${f.id}">${esc(t(f.label))}</label><input id="lf-${f.id}" name="${f.id}" value="${esc(v[f.id] || '')}" autocomplete="off"></div>`).join('')}</form>
    <div class="btn-row no-print"><button type="button" class="btn primary" id="letter-print">${L('Print the letter')}</button><button type="button" class="btn" id="letter-reset">${L('Clear')}</button></div>
    <div id="letters">${letterHTML('ar', v)}${letterHTML('en', v)}</div>
  </section>`;
}
function printLetter() {
  const v = fieldValues();
  printPage({ html: letterHTML('ar', v) + letterHTML('en', v), title: L('Runner letter') });
}

/* ---------- page ---------- */
function render() {
  app.content.innerHTML = `
    <section id="pipeline">
      <h2>${L('The pipeline')}</h2>
      ${pipeline()}
      <h3 style="margin-top:28px">${L('The two ways to upload')}</h3>
      <ul class="rows">${P.paths.map(p => `<li><b>${esc(p.name)}</b><span class="d">${esc(p.text)}</span></li>`).join('')}</ul>
      <h3 style="margin-top:28px">${L('The hubs')}</h3>
      <div class="t-wrap"><table class="t"><thead><tr><th>${L('Hub')}</th><th>${L('Where')}</th><th>${L('Used by')}</th></tr></thead><tbody>${H.map.hubs.map(h => `<tr${h.planned ? ' class="mute"' : ''}><td><b>${esc(h.name)}</b></td><td>${esc(h.where)}</td><td>${esc(h.serves)}</td></tr>`).join('')}</tbody></table></div>
      <h3 style="margin-top:28px">${L('The physics')}</h3>
      <div class="t-wrap"><table class="t"><thead><tr><th>${L('Hours a day')}</th><th class="num">${L('TB a day')}</th><th class="num">${L('Mbps')}</th></tr></thead><tbody>${P.capacity.map(c => `<tr><td>${fmt(c.hours)}</td><td class="num">${c.tb}</td><td class="num">${fmt(c.mbps)}</td></tr>`).join('')}</tbody></table></div>
      <p class="mute small">${L('An hour is {gb} GB. A hub passes only when {test}.', { gb: P.gbPerHour, test: esc(P.hubTest) })}</p>
    </section>
    <section id="hubs">
      <h2>${L('The hub network')}</h2>
      ${hubMap()}
    </section>
    <section id="transport">
      <h2>${L('Transport rules')}</h2>
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
