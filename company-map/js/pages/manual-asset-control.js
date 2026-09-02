import { mount, loadJSON, esc, t, fmt } from '../app.js';
import { blocks, MANUAL_TOC } from '../manual-blocks.js';
import { svg, rect, text, line, circle, path, box, figure } from '../svg.js';

const m = await loadJSON('data/manual/asset-control.json');
const app = await mount({
  page: 'manual-asset-control',
  title: { en: m.title },
  lede: { en: m.purpose },
  toc: [{ id: 'life', label: { en: "The phone's life" } }, { id: 'kit', label: { en: 'The site kit' } }, { id: 'count', label: { en: 'The weekly count' } }, { id: 'fleets', label: { en: 'Fleets' } }, ...MANUAL_TOC]
});

/* ---------- the phone's life ---------- */
function lifecycle() {
  const W = 360, id = 'life', bw = 170, bh = 40, gap = 22, x = (W - bw) / 2;
  const steps = m.lifecycle;
  let s = '';
  const yOf = i => 8 + i * (bh + gap);
  steps.forEach((st, i) => {
    const y = yOf(i);
    const last = st.id === 'retire';
    s += rect(x, y, bw, bh, last ? 'bx-panel' : 'bx');
    s += circle(x + 20, y + bh / 2, 11, 'dot-o');
    s += text(x + 20, y + bh / 2 + 4, String(i + 1), { cls: 'tx tx-s tx-b tx-a', anchor: 'middle' });
    s += text(x + 40, y + bh / 2 + 5, st.name, { cls: 'tx tx-b' });
    if (i < steps.length - 1) s += line(W / 2, y + bh, W / 2, y + bh + gap - 2, 'ln', `marker-end="url(#${id}-arr)"`);
  });
  // loop: return back to issue, every shift
  const iIssue = steps.findIndex(s => s.id === m.loop.to), iReturn = steps.findIndex(s => s.id === m.loop.from);
  const yi = yOf(iIssue) + bh / 2, yr = yOf(iReturn) + bh / 2, lx = x - 26;
  s += path(`M${x} ${yr}H${lx}V${yi}H${x - 3}`, 'ln-acc', `marker-end="url(#${id}-arr-acc)"`);
  s += text(lx - 6, (yi + yr) / 2 + 4, m.loop.text, { cls: 'tx tx-a tx-s', anchor: 'end' });
  // repair back to issue
  const iRepair = steps.findIndex(s => s.id === 'repair');
  const yrep = yOf(iRepair) + bh / 2, rx = x + bw + 26;
  s += path(`M${x + bw} ${yrep}H${rx}V${yi}H${x + bw + 3}`, 'ln-acc dash', `marker-end="url(#${id}-arr-acc)"`);
  s += text(rx + 6, (yi + yrep) / 2 + 4, 'back in', { cls: 'tx tx-a tx-s' });
  s += text(rx + 6, (yi + yrep) / 2 + 18, 'service', { cls: 'tx tx-a tx-s' });
  const H = yOf(steps.length - 1) + bh + 8;
  return figure(svg({ w: W, h: H, label: "A phone's life from enrollment to retirement", inner: s, id }), { cls: 'narrow' });
}

/* ---------- the site kit as a tally ---------- */
function kit() {
  const W = 360, rowH = 30, left = 150, sq = 12, g = 4;
  const items = m.kit.items;
  let s = text(0, 14, `Per ${m.kit.per} phones`, { cls: 'tx tx-b' });
  s += text(left, 14, `${m.kit.per} phones`, { cls: 'tx tx-m tx-s' });
  for (let k = 0; k < m.kit.per; k++) s += rect(left + 70 + k * (sq + g), 4, sq, sq, 'bx-acc');
  items.forEach((it, i) => {
    const y = 34 + i * rowH;
    s += line(0, y - 8, W, y - 8, 'ln-soft');
    s += text(0, y + 10, it.item, { cls: 'tx' });
    const n = typeof it.qty === 'number' ? it.qty : 1;
    for (let k = 0; k < n; k++) s += rect(left + k * (sq + g), y, sq, sq, k >= m.kit.per ? 'bx-acc-line' : 'bx-acc');
    s += text(left + n * (sq + g) + 6, y + 10, typeof it.qty === 'number' ? String(it.qty) : `${it.qty} ${it.unit}`, { cls: 'tx tx-m tx-s' });
  });
  const H = 34 + items.length * rowH + 4;
  s += text(0, H - 2, 'Outlined squares are the spare in every kit.', { cls: 'tx tx-d tx-s' });
  return figure(svg({ w: W, h: H + 8, label: 'Bill of materials for a site kit', inner: s, cls: 'tally' }), { caption: m.kit.note, cls: 'narrow' });
}

/* ---------- the three-way count ---------- */
function count() {
  const W = 360, H = 300, id = 'cnt', r = 78;
  const c = [{ x: 145, y: 108 }, { x: 215, y: 108 }, { x: 180, y: 170 }];
  let s = '';
  c.forEach(p => s += circle(p.x, p.y, r, 'venn'));
  s += text(96, 70, m.count.sources[0].name, { cls: 'tx tx-b', anchor: 'middle' });
  s += text(96, 86, m.count.sources[0].text, { cls: 'tx tx-m tx-s', anchor: 'middle' });
  s += text(266, 70, m.count.sources[1].name, { cls: 'tx tx-b', anchor: 'middle' });
  s += text(266, 86, m.count.sources[1].text, { cls: 'tx tx-m tx-s', anchor: 'middle' });
  s += text(180, 262, m.count.sources[2].name, { cls: 'tx tx-b', anchor: 'middle' });
  s += text(180, 278, m.count.sources[2].text, { cls: 'tx tx-m tx-s', anchor: 'middle' });
  s += text(180, 132, 'Match', { cls: 'tx tx-b tx-a', anchor: 'middle' });
  s += text(180, 148, 'same count, three ways', { cls: 'tx tx-a tx-s', anchor: 'middle' });
  return figure(svg({ w: W, h: H, label: 'Registry, MDM, and physical counts must match', inner: s, id }), { caption: m.count.rule, cls: 'narrow' });
}

function render() {
  const total = m.fleets.reduce((a, f) => a + f.phones, 0);
  app.content.innerHTML = `
    <section id="life">
      <h2>The phone's life</h2>
      ${lifecycle()}
      <ol class="rows ring-list">${m.lifecycle.map((st, i) => `<li><span class="no">${i + 1}</span><span class="when">${esc(st.name)}</span><span class="what"><span>${esc(st.text)}</span></span></li>`).join('')}</ol>
    </section>
    <section id="kit">
      <h2>The site kit</h2>
      ${kit()}
    </section>
    <section id="count">
      <h2>The weekly count</h2>
      ${count()}
    </section>
    <section id="fleets">
      <h2>Fleets</h2>
      <div class="stat">${m.fleets.map(f => `<div><div class="big">${fmt(f.phones)}</div><div class="lbl">${esc(f.name)}. ${esc(f.where)}</div></div>`).join('')}<div><div class="big">${fmt(Math.round(total * m.spareRate))}</div><div class="lbl">spare pool, ${Math.round(m.spareRate * 100)}% of ${fmt(total)} deployed</div></div></div>
      <p class="mute small">Partner fleets are enrolled in the MDM like every other phone. They are Vound assets on someone else's premises.</p>
    </section>
    ${blocks(m)}`;
}
render();
