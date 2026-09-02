import { mount, loadJSON, t, esc, fmt, href, site } from '../app.js';
import { svg, rect, text, line, figure } from '../svg.js';

const app = await mount({
  page: 'start',
  title: { en: 'How this company works' },
  lede: { en: 'One page per question. Start with yours.' }
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
    inner += rect(x, base - h, w, h, i === data.months.length - 1 ? 'bx-acc-line' : 'bx-acc');
    inner += text(x + w / 2, base - h - 8, fmt(m.hours), { cls: 'tx tx-b tab', anchor: 'middle' });
    inner += text(x + w / 2, base + 18, m.label, { cls: 'tx tx-m', anchor: 'middle' });
    if (i === data.months.length - 1) inner += text(x + w / 2, base + 34, 'target', { cls: 'tx tx-d tx-s', anchor: 'middle' });
  });
  return figure(svg({ w: W, h: H, label: 'Hours filmed by month', inner }), { caption: 'Hours of footage. The next month is the target.', cls: 'narrow' });
}

function render() {
  const n = site.numbers;
  app.content.innerHTML = `
    <section>
      <p class="big-rule" style="max-width:34ch">${esc(data.mission)}</p>
      <p class="mute measure">${esc(data.how)}</p>
    </section>
    <section>
      <h2>Seven values</h2>
      <ul class="rows two">${data.values.map(v => `<li><b>${esc(v.b)}</b><span class="d">${esc(v.s)}</span></li>`).join('')}</ul>
    </section>
    <section>
      <h2>Start here</h2>
      <div class="cards">${data.starts.map(s => `<div class="card"><h3>${esc(s.who)}</h3><p class="mute small">${esc(s.line)}</p><ol class="small" style="padding-inline-start:18px;margin:0">${s.pages.map(p => `<li><a href="${href(p)}">${esc(labelOf(p))}</a></li>`).join('')}</ol></div>`).join('')}</div>
    </section>
    <section>
      <h2>The company in numbers</h2>
      <div class="stat">
        <div><div class="big">${fmt(n.phones)}</div><div class="lbl">phones on heads</div></div>
        <div><div class="big">${fmt(n.people)}</div><div class="lbl">people involved</div></div>
        <div><div class="big">${fmt(n.gbPerHour)} GB</div><div class="lbl">per hour of footage</div></div>
      </div>
      ${hoursChart()}
    </section>
    <section>
      <h2>The rules everyone shares</h2>
      <div class="rule-band">
        <div><b>Operators start with their Portfolio Manager.</b><span>Every question, every time.</span></div>
        <div><b>Portfolio Managers start with Moharam.</b><span>Money and gear go to Mano.</span></div>
        <div><b>Nobody contacts the client.</b><span>Adham handles everything client-facing.</span></div>
      </div>
      <p><a href="${href('call')}">Who to call</a> turns any situation into a name and a time rule. <a href="${href('never')}">The never list</a> is one screen.</p>
    </section>`;
}
render();
