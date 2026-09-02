import { mount, loadJSON, t, esc } from '../app.js';
import { svg, rect, text, line, circle, polar, arc, figure, wrap } from '../svg.js';

const app = await mount({
  page: 'day',
  title: { en: 'A working day and week' },
  lede: { en: 'The day is a ring. The week ends on Thursday with a full flush. The month ends with an audit.' },
  toc: [{ id: 'day', label: { en: 'The day' } }, { id: 'week', label: { en: 'The week' } }, { id: 'month', label: { en: 'The month' } }, { id: 'always', label: { en: 'Always' } }]
});
const data = await loadJSON('data/day.json');

function ring() {
  const W = 360, H = 360, cx = 180, cy = 180, r = 128;
  let inner = circle(cx, cy, r, 'ring-line');
  for (let h = 0; h < 24; h++) {
    const [x1, y1] = polar(cx, cy, r, h * 15), [x2, y2] = polar(cx, cy, r - (h % 6 === 0 ? 10 : 5), h * 15);
    inner += line(x1.toFixed(1), y1.toFixed(1), x2.toFixed(1), y2.toFixed(1), 'ln');
  }
  const lab = (h, s) => { const [x, y] = polar(cx, cy, r - 38, h * 15); return text(x.toFixed(1), (y + 4).toFixed(1), s, { cls: 'tx tx-d tx-s', anchor: 'middle' }); };
  inner += lab(0, '12 AM') + lab(6, '6 AM') + lab(12, '12 PM') + lab(18, '6 PM');
  // the cycles arc, just outside the ring
  const c = data.cycles;
  inner += arc(cx, cy, r + 14, c.start * 15, c.end * 15, 'ln-acc');
  const midA = ((c.start + c.end) / 2) * 15;
  const arcIdx = data.day.findIndex(ev => ev.arc);
  const [ax, ay] = polar(cx, cy, r + 14, (c.start + 2) * 15);
  if (arcIdx >= 0) {
    inner += circle(ax.toFixed(1), ay.toFixed(1), 12, 'dot-o');
    inner += text(ax.toFixed(1), (ay + 4).toFixed(1), String(arcIdx + 1), { cls: 'tx tx-b tx-s tx-a', anchor: 'middle' });
  }
  const [mx, my] = polar(cx, cy, r + 38, midA);
  inner += text(mx.toFixed(1), (my + 4).toFixed(1), `${c.minutes}-minute cycles, ${c.start}:00 to ${c.end}:00`, { cls: 'tx tx-a tx-s', anchor: 'middle' });
  // events
  data.day.forEach((ev, i) => {
    if (ev.hour == null) return;
    const [x, y] = polar(cx, cy, r, ev.hour * 15);
    const solid = /number|deadline/i.test(ev.what);
    inner += circle(x.toFixed(1), y.toFixed(1), 12, solid ? 'dot' : 'dot-o');
    inner += text(x.toFixed(1), (y + 4).toFixed(1), String(i + 1), { cls: 'tx tx-b tx-s ' + (solid ? 'tx-p' : 'tx-a'), anchor: 'middle' });
  });
  inner += text(cx, cy - 6, '24 hours', { cls: 'tx tx-l tx-b', anchor: 'middle' });
  inner += text(cx, cy + 12, 'one shift', { cls: 'tx tx-m', anchor: 'middle' });
  return figure(svg({ w: W, h: H, label: 'The working day as a 24-hour ring', inner }), { caption: data.shiftNote, cls: 'narrow' });
}

function weekStrip() {
  const W = 360, H = 150, left = 4, top = 10, colW = (W - left * 2) / 7, boxH = 44;
  let inner = '';
  data.week.forEach((d, i) => {
    const x = left + i * colW;
    inner += rect(x, top, colW, boxH, d.work ? 'bx' : 'bx-panel');
    inner += text(x + colW / 2, top + 27, d.short, { cls: 'tx tx-b' + (d.work ? '' : ' tx-m'), anchor: 'middle' });
    if (d.note) {
      inner += line(x + colW / 2, top + boxH, x + colW / 2, top + boxH + 14, 'ln-acc');
      inner += circle(x + colW / 2, top + boxH + 16, 3, 'dot');
    }
  });
  const notes = data.week.filter(d => d.note || !d.work);
  let y = top + boxH + 40;
  notes.forEach(d => {
    const lines = wrap(`${d.day}: ${d.note}`, 46);
    inner += text(left + 2, y, lines, { cls: 'tx', lh: 16 });
    y += lines.length * 16 + 8;
  });
  return figure(svg({ w: W, h: Math.max(H, y), label: 'The week', inner }), { cls: 'narrow' });
}

function monthStrip() {
  const W = 360, H = 130, left = 4, top = 10, w = W - left * 2, barH = 22;
  let inner = rect(left, top, w, barH, 'bx');
  for (let k = 1; k < 4; k++) inner += line(left + w * k / 4, top, left + w * k / 4, top + barH, 'ln-soft');
  ['Week 1', 'Week 2', 'Week 3', 'Week 4'].forEach((s, k) => inner += text(left + w * (k + 0.5) / 4, top + 15, s, { cls: 'tx tx-d tx-s', anchor: 'middle' }));
  const marks = [
    { at: 0.01, row: 0, anchor: 'start', label: data.month[0].what },
    { at: 0.78, row: 1, anchor: 'end', label: data.month[1].what },
    { at: 0.9, row: 0, anchor: 'middle', label: data.month[2].what },
    { at: 0.99, row: 1, anchor: 'end', label: data.month[3].what }
  ];
  marks.forEach(m => {
    const x = left + w * m.at;
    inner += circle(x, top + barH, 4, 'dot');
    inner += line(x, top + barH + 4, x, top + barH + 18 + m.row * 22, 'ln-acc');
    inner += text(m.anchor === 'end' ? x - 5 : m.anchor === 'start' ? x + 5 : x, top + barH + 32 + m.row * 22, m.label, { cls: 'tx tx-a', anchor: m.anchor });
  });
  return figure(svg({ w: W, h: H, label: 'The month', inner }), { cls: 'narrow' });
}

function render() {
  app.content.innerHTML = `
    <section id="day">
      <h2>The day</h2>
      ${ring()}
      <ol class="rows ring-list">${data.day.map((ev, i) => `<li><span class="no ${ev.hour == null && !ev.arc ? 'none' : (/number|deadline/i.test(ev.what) ? 'solid' : '')}">${i + 1}</span><span class="when">${esc(ev.when)}</span><span class="what"><b>${esc(ev.what)}</b><span>${esc(ev.text)}</span></span></li>`).join('')}</ol>
    </section>
    <section id="week">
      <h2>The week</h2>
      ${weekStrip()}
      <ul class="rows">${data.weekly.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
    </section>
    <section id="month">
      <h2>The month</h2>
      ${monthStrip()}
      <ul class="rows">${data.month.map(m => `<li><b>${esc(m.what)}</b><span class="d">${esc(m.when)}. ${esc(m.text)}</span></li>`).join('')}</ul>
    </section>
    <section id="always">
      <h2>Always</h2>
      <ul class="rows">${data.cadence.find(c => c.h === 'Always').items.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
    </section>`;
}
render();
