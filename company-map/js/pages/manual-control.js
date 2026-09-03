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

/* ---------- one dashboard, three feeds ---------- */
function dashboard() {
  const W = 360, H = 318;
  let s = rect(4, 4, 352, 310, 'bx');
  s += rect(4, 4, 352, 26, 'bx-panel');
  s += text(14, 21, L('Control'), { cls: 'tx tx-b' });
  s += text(346, 21, L('8 PM number: on the plan'), { cls: 'tx tx-s tx-m', anchor: 'end' });
  // MDM map panel
  s += rect(12, 38, 166, 150, 'bx');
  s += text(20, 54, L('MDM map'), { cls: 'tx tx-b tx-s' });
  const dots = [[40, 80, 1], [58, 96, 1], [48, 118, 0], [90, 84, 1], [104, 104, 1], [120, 92, 1], [140, 120, 1], [72, 150, 1], [126, 154, 0], [156, 70, 1], [98, 140, 1], [150, 160, 1]];
  dots.forEach(([x, y, on]) => s += circle(x, y, 4, on ? 'dot' : 'dot-o'));
  s += text(20, 180, L('filled: uploading. hollow: dark'), { cls: 'tx tx-d tx-s' });
  // QC verdicts panel
  s += rect(186, 38, 162, 70, 'bx');
  s += text(194, 54, L('QC verdicts'), { cls: 'tx tx-b tx-s' });
  [['keep', 118], ['feedback', 28], ['fraud', 10]].forEach(([k, w], i) => {
    const y = 62 + i * 13;
    s += text(194, y + 9, L(k), { cls: 'tx tx-s tx-m' });
    s += rect(246, y + 1, w * 0.8, 9, i === 0 ? 'bx-acc' : i === 1 ? 'bx-acc-line' : 'bx-panel');
  });
  // hours panel
  s += rect(186, 118, 162, 70, 'bx');
  s += text(194, 134, L('Hours against quota'), { cls: 'tx tx-b tx-s' });
  const sites = [[0.95, 'A'], [1.05, 'B'], [0.6, 'C'], [0.9, 'D'], [1.0, 'E']];
  sites.forEach(([v, n], i) => {
    const x = 196 + i * 30, h = Math.round(v * 34);
    s += rect(x, 178 - h, 18, h, v < 0.8 ? 'bx-acc-line' : 'bx-acc');
    s += text(x + 9, 186, n, { cls: 'tx tx-s tx-d', anchor: 'middle' });
  });
  s += line(190, 144, 344, 144, 'ln-acc dash');
  s += text(344, 141, L('quota'), { cls: 'tx tx-s tx-a', anchor: 'end' });
  // the join
  s += rect(12, 196, 336, 20, 'bx-soft');
  s += text(180, 210, L('joined by the device number and the wearer log'), { cls: 'tx tx-s tx-a', anchor: 'middle' });
  // alerts strip
  s += rect(12, 224, 336, 82, 'bx-panel');
  s += text(20, 240, L('Alerts'), { cls: 'tx tx-b tx-s' });
  [['12:04', 'Phone 214 dark since clock-in', 'anchor'], ['16:40', 'Site C, 1.3 device-days of backlog', 'Moharam'], ['17:12', 'Flag on session 8812, torso angle', 'Moharam, QC']].forEach(([tm, msg, to], i) => {
    const y = 258 + i * 16;
    s += text(20, y, tm, { cls: 'tx tx-s tx-d tab' });
    s += text(56, y, L(msg), { cls: 'tx tx-s' });
    s += text(340, y, L(to), { cls: 'tx tx-s tx-a', anchor: 'end' });
  });
  return figure(svg({ w: W, h: H, label: L('A sketch of the control dashboard: MDM map, QC verdicts, hours count, alerts'), inner: s }), { caption: L('A sketch. The numbers are examples.'), cls: 'narrow' });
}

/* ---------- calculator ---------- */
function calc(hours) {
  const h = Math.max(0, Number(hours) || 0);
  const phones = Math.ceil(h * R.phones / R.per);
  const mbps = Math.round(h * R.gbPerHour * 8 * 1000 / 86400);
  return {
    phones,
    anchors: Math.ceil(phones / 10),
    supervisors: Math.ceil(phones / 50),
    reviewers: Math.ceil(h * R.reviewers / R.per),
    mbps,
    hubs: h ? Math.max(2, Math.ceil(mbps / R.hubMbps)) : 0,
    hats: Math.ceil(phones * R.hatsPerPhone),
    spares: Math.ceil(phones * R.spareRate),
    tb: Math.round(h * R.gbPerHour / 100) / 10
  };
}
function readout(hours) {
  const c = calc(hours);
  const cells = [[c.phones, 'phones'], [c.anchors, 'anchors'], [c.supervisors, 'supervisors'], [c.reviewers, 'reviewers'], [c.mbps, 'Mbps sustained'], [c.hubs, 'hubs at 300 Mbps'], [c.hats, 'hats'], [c.spares, 'spare phones'], [c.tb, 'TB a day']];
  return cells.map(([n, l]) => `<div><div class="big">${fmt(n)}</div><div class="lbl">${L(l)}</div></div>`).join('');
}

function render() {
  app.content.innerHTML = `
    <section id="dashboard">
      <h2>${L('One screen, three feeds')}</h2>
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
      <div class="field" style="max-width:260px"><label for="hours">${L('Hours a day')}</label><input type="number" id="hours" min="0" step="50" value="${R.per}" inputmode="numeric"></div>
      <div class="readout" id="readout">${readout(R.per)}</div>
      <p class="mute small">${L('Per {per} hours a day: about {phones} phones, {anchors} anchors, {supervisors} supervisors, {reviewers} reviewers, {mbps} Mbps. A hub passes at {hub} Mbps, always at least two. Hats are one per phone plus one spare per ten. Spares are {spare}% of deployed phones.', { per: fmt(R.per), phones: R.phones, anchors: R.anchors, supervisors: R.supervisors, reviewers: R.reviewers, mbps: R.mbps, hub: R.hubMbps, spare: Math.round(R.spareRate * 100) })}</p>
    </section>
    ${blocks(m)}`;
}
render();
document.addEventListener('input', e => {
  if (e.target.id === 'hours') document.getElementById('readout').innerHTML = readout(e.target.value);
});
