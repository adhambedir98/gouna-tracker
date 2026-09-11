import { mount, loadJSON, esc, fmt, labels } from '../app.js';
import { blocks, MANUAL_TOC } from '../manual-blocks.js';
import { svg, rect, text, line, circle, figure } from '../svg.js';
const L = await labels('manual-control');

const m = await loadJSON('data/manual/control.json');
const app = await mount({
  page: 'manual-control',
  title: { en: m.title },
  lede: { en: m.purpose },
  toc: [{ id: 'dashboard', label: L('The dashboard') }, { id: 'alerts', label: L('Alerts') }, { id: 'calculator', label: L('Capacity calculator') }, ...MANUAL_TOC]
});
const R = m.ratios;

/* ---------- one dashboard, four feeds ---------- */
// drawn at 350 units so every label is a full 13px on a phone
function dashboard() {
  const W = 350, H = 338;
  let s = rect(1, 1, 348, 336, 'bx');
  s += rect(1, 1, 348, 26, 'bx-panel');
  s += text(11, 19, L('Control'), { cls: 'tx tx-b' });
  s += text(339, 19, L('8:00 PM number: on the plan'), { cls: 'tx tx-m', anchor: 'end' });
  // MDM map panel
  s += rect(9, 36, 164, 150, 'bx');
  s += text(17, 52, L('MDM map'), { cls: 'tx tx-b' });
  const dots = [[37, 78, 1], [55, 94, 1], [45, 116, 0], [87, 82, 1], [101, 102, 1], [117, 90, 1], [137, 118, 1], [69, 148, 1], [123, 152, 0], [153, 68, 1], [95, 138, 1], [147, 166, 1]];
  dots.forEach(([x, y, on]) => s += circle(x, y, 4, on ? 'dot' : 'dot-o'));
  // QC verdicts panel
  s += rect(181, 36, 160, 70, 'bx');
  s += text(189, 52, L('QC verdicts'), { cls: 'tx tx-b' });
  [['keep', 118], ['feedback', 28], ['fraud', 10]].forEach(([k, w], i) => {
    const y = 60 + i * 15;
    s += text(189, y + 10, L(k), { cls: 'tx tx-m' });
    s += rect(252, y + 1, w * 0.75, 9, i === 0 ? 'bx-acc' : i === 1 ? 'bx-acc-line' : 'bx-panel');
  });
  // hours panel
  s += rect(181, 116, 160, 70, 'bx');
  s += text(189, 132, L('Hours count'), { cls: 'tx tx-b' });
  const sites = [[0.95, 'A'], [1.05, 'B'], [0.6, 'C'], [0.9, 'D'], [1.0, 'E']];
  sites.forEach(([v, n], i) => {
    const x = 189 + i * 22, h = Math.round(v * 30);
    s += rect(x, 174 - h, 16, h, v < 0.8 ? 'bx-acc-line' : 'bx-acc');
    s += text(x + 8, 184, n, { cls: 'tx tx-d', anchor: 'middle' });
  });
  s += line(185, 144, 337, 144, 'ln-acc dash');
  s += text(337, 141, L('target'), { cls: 'tx tx-a', anchor: 'end' });
  // the join
  s += rect(9, 194, 332, 20, 'bx-soft');
  s += text(175, 208, L('joined by the device number and the wearer log'), { cls: 'tx tx-a', anchor: 'middle' });
  // alerts strip
  s += rect(9, 222, 332, 106, 'bx-panel');
  s += text(17, 238, L('Alerts'), { cls: 'tx tx-b' });
  [['12:04', 'Phone 214 dark since clock-in', 'operator'], ['16:40', 'Site C backlog, 1.3 device-days', 'Moharam'], ['17:12', 'Flag on session 8812, angle', 'Moharam, QC'], ['18:15', 'Site D, no evening check-out', 'Mano']].forEach(([tm, msg, to], i) => {
    const y = 256 + i * 18;
    s += text(17, y, tm, { cls: 'tx tx-d tab' });
    s += text(56, y, L(msg), { cls: 'tx' });
    s += text(333, y, L(to), { cls: 'tx tx-a', anchor: 'end' });
  });
  return figure(svg({ w: W, h: H, label: L('A sketch of the control dashboard: MDM map, QC verdicts, hours count, evening check-out form, alerts'), inner: s }), { caption: L('A sketch. The numbers are examples. Filled dots are uploading, hollow dots are dark.'), cls: 'narrow' });
}

/* ---------- calculator ---------- */
function calc(hours, partner) {
  const h = Math.max(0, Number(hours) || 0);
  const phones = Math.ceil(h * R.phones / R.per);
  const mbps = Math.round(h * R.gbPerHour * 8 * 1000 / 86400);
  return {
    hours: h,
    phones,
    operators: partner ? 0 : Math.ceil(phones / 10),
    reviewers: Math.ceil(h * R.reviewers / R.per),
    mbps,
    hats: Math.ceil(phones * R.hatsPerPhone),
    spares: Math.ceil(phones * R.spareRate),
    tb: Math.round(h * R.gbPerHour / 100) / 10
  };
}
// six cells every time, so the grid is two rows of three on a desktop and three rows of two on a phone
function cells(c) {
  const list = [[c.phones, L('phones')], [c.operators, L('operators')], [c.reviewers, L('reviewers')], [c.mbps, L('Mbps, {tb} TB a day', { tb: fmt(c.tb) })], [c.hats, L('hats')], [c.spares, L('spare phones')]];
  return `<div class="readout" style="max-width:480px">${list.map(([n, l]) => `<div><div class="big">${fmt(n)}</div><div class="lbl">${l}</div></div>`).join('')}</div>`;
}
const val = (id, def) => { const el = document.getElementById(id); return el ? el.value : def; };
// two parts: our own sites need operators; the delivery partners bring their own workers
function readout() {
  const d = calc(val('hours-direct', R.dayHours - R.partnerPer), false), p = calc(val('hours-partner', R.partnerPer), true);
  const tot = { phones: d.phones + p.phones, operators: d.operators, reviewers: Math.ceil((d.hours + p.hours) * R.reviewers / R.per), mbps: d.mbps + p.mbps, hats: d.hats + p.hats, spares: d.spares + p.spares, tb: Math.round((d.tb + p.tb) * 10) / 10 };
  return `<h3 style="margin-top:20px">${L('Direct operations')}</h3>${cells(d)}
    <h3 style="margin-top:20px">${L('Delivery partners')}</h3><p class="mute small">${L('The partner supplies the workers, so no operators.')}</p>${cells(p)}
    <h3 style="margin-top:20px">${L('Total')}</h3>${cells(tot)}`;
}

function render() {
  app.content.innerHTML = `
    <section id="dashboard">
      <h2>${L('One screen, four feeds')}</h2>
      ${dashboard()}
      <ul class="rows">${m.feeds.map(f => `<li><b>${esc(f.name)}</b><span class="d">${esc(f.shows)} <span class="accent">${esc(f.answers)}</span></span></li>`).join('')}</ul>
      <p class="callout">${esc(m.joins)}</p>
    </section>
    <section id="alerts">
      <h2>${L('Five alerts')}</h2>
      <ul class="rows">${m.alerts.map(a => `<li><b>${esc(a.trigger)}</b><span class="accent small" style="display:block">${esc(a.to)}. ${esc(a.when)}.</span><span class="d">${esc(a.then)}</span></li>`).join('')}</ul>
    </section>
    <section id="calculator">
      <h2>${L('Capacity calculator')}</h2>
      <h3>${L('Next month: {month} hours a month, about {day} a day', { month: fmt(R.monthHours), day: fmt(R.dayHours) })}</h3>
      <div class="fields" style="max-width:560px"><div class="field"><label for="hours-direct">${L('Direct operations, hours a day')}</label><input type="number" id="hours-direct" min="0" step="50" value="${R.dayHours - R.partnerPer}" inputmode="numeric"></div><div class="field"><label for="hours-partner">${L('Delivery partners, hours a day')}</label><input type="number" id="hours-partner" min="0" step="50" value="${R.partnerPer}" inputmode="numeric"></div></div>
      <div id="readout">${readout()}</div>
      <p class="mute small">${L('Per {per} hours a day: about {phones} phones, {operators} operators, {reviewers} reviewers, {mbps} Mbps. Hats are one per phone plus one spare per ten. Spares are {spare}% of deployed phones.', { per: fmt(R.per), phones: R.phones, operators: R.operators, reviewers: R.reviewers, mbps: R.mbps, spare: Math.round(R.spareRate * 100) })}</p>
    </section>
    ${blocks(m)}`;
}
render();
document.addEventListener('input', e => {
  if (e.target.id === 'hours-direct' || e.target.id === 'hours-partner') document.getElementById('readout').innerHTML = readout();
});
