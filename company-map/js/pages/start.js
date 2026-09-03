import { mount, loadJSON, t, esc, fmt, href, site, labels } from '../app.js';
import { svg, rect, text, line, figure } from '../svg.js';
const L = await labels('start');

const app = await mount({
  page: 'start',
  title: L('How this company works')
});
const data = await loadJSON('data/start.json');
const navItems = site.nav.flatMap(g => g.items);
const labelOf = path => t((navItems.find(i => i.path === path) || {}).label) || path;

function hoursChart() {
  const W = 360, H = 170, left = 10, base = 128, maxH = 100;
  const max = Math.max(...data.months.map(m => m.hours));
  const colW = (W - left * 2) / data.months.length;
  let inner = line(left, base, W - left, base, 'ln');
  data.months.forEach((m, i) => {
    const h = Math.round(m.hours / max * maxH);
    const x = left + i * colW + 18, w = colW - 36;
    inner += rect(x, base - h, w, h, m.note === 'target' ? 'bx-acc-line' : 'bx-acc');
    inner += text(x + w / 2, base - h - 8, fmt(m.hours), { cls: 'tx tx-b tab', anchor: 'middle' });
    inner += text(x + w / 2, base + 18, m.label, { cls: 'tx tx-m', anchor: 'middle' });
    if (m.note) inner += text(x + w / 2, base + 34, m.note, { cls: 'tx tx-d tx-s', anchor: 'middle' });
  });
  return figure(svg({ w: W, h: H, label: L('Hours of footage by month'), inner }), { cls: 'narrow' });
}

function render() {
  app.content.innerHTML = `
    <section style="margin-top:0">
      <p class="big-rule" style="max-width:34ch;margin-top:0">${esc(data.mission)}</p>
    </section>
    <section>
      <h2>${L('Seven values')}</h2>
      <ul class="rows two values">${data.values.map(v => `<li><b>${esc(v.b)}</b><span class="d">${esc(v.s)}</span></li>`).join('')}</ul>
    </section>
    <section>
      <h2>${L('Start here')}</h2>
      <div class="cards">${data.starts.map(s => `<div class="card"><h3>${esc(s.who)}</h3><ol class="small" style="padding-inline-start:18px;margin:0">${s.pages.map(p => `<li><a href="${href(p)}">${esc(labelOf(p))}</a></li>`).join('')}</ol></div>`).join('')}</div>
    </section>
    <section>
      <h2>${L('The company in numbers')}</h2>
      ${hoursChart()}
    </section>
    <section>
      <h2>${L('What everyone shares')}</h2>
      <div class="cards">${['rules', 'never', 'call'].map(p => `<a class="card" href="${href(p)}"><h3>${p === 'call' ? '<span style="color:#B3261E" aria-hidden="true">\u2731</span> ' : ''}${esc(labelOf(p))}</h3></a>`).join('')}</div>
    </section>`;
}
render();
