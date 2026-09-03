import { mount, loadJSON, esc, labels, initialHash, setHash } from '../app.js';
import { mountFlow } from '../sflow.js';
import { svg, rect, text, line, circle, figure, wrap } from '../svg.js';
const L = await labels('day');

const app = await mount({
  page: 'day',
  title: L('What happens every day'),
  toc: [{ id: 'day', label: L('The day') }, { id: 'steps', label: L('Daily instructions for each phone') }, { id: 'week', label: L('The week') }, { id: 'month', label: L('The month') }, { id: 'always', label: L('Always') }]
});
const data = await loadJSON('data/day.json');

function strip() {
  // the day as one line, left to right: a numbered dot per moment, labels alternating above and below
  const n = data.day.length, W = 960, left = 70, right = 70, slot = (W - left - right) / (n - 1), lineY = 100, H = 196;
  const xAt = i => left + i * slot;
  let inner = line(left - 30, lineY, W - right + 30, lineY, 'ln');
  // the recording cycles run from the first cycle to clock-out
  const a = data.day.findIndex(ev => ev.arc), b = data.day.findIndex((ev, i) => i > a && ev.hour === data.cycles.end);
  if (a >= 0 && b > a) inner += line(xAt(a), lineY, xAt(b), lineY, 'ln-acc');
  data.day.forEach((ev, i) => {
    const x = xAt(i).toFixed(1), solid = !!ev.solid, above = i % 2 === 0;
    inner += `<g class="tl-hit" data-i="${i}" role="button" tabindex="0" aria-label="${esc(ev.what)}">` + circle(x, lineY, 12, solid ? 'dot' : 'dot-o') + text(x, lineY + 4, String(i + 1), { cls: 'tx tx-b tx-s ' + (solid ? 'tx-p' : 'tx-a'), anchor: 'middle' }) + '</g>';
    const lines = wrap(ev.what, 20);
    if (above) {
      const first = lineY - 24 - (lines.length - 1) * 15;
      inner += text(x, first - 17, ev.when, { cls: 'tx tx-a tx-s', anchor: 'middle' });
      inner += text(x, first, lines, { cls: 'tx', lh: 15, anchor: 'middle' });
    } else {
      const first = lineY + 32;
      inner += text(x, first, lines, { cls: 'tx', lh: 15, anchor: 'middle' });
      inner += text(x, first + lines.length * 15 + 2, ev.when, { cls: 'tx tx-a tx-s', anchor: 'middle' });
    }
  });
  return figure(svg({ w: W, h: H, label: L('The working day, left to right'), inner }), { caption: data.shiftNote, cls: 'timeline' });
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
  return figure(svg({ w: W, h: Math.max(H, y), label: L('The week'), inner }), { cls: 'narrow' });
}

function monthStrip() {
  const W = 360, H = 130, left = 4, top = 10, w = W - left * 2, barH = 22;
  let inner = rect(left, top, w, barH, 'bx');
  for (let k = 1; k < 4; k++) inner += line(left + w * k / 4, top, left + w * k / 4, top + barH, 'ln-soft');
  [1, 2, 3, 4].forEach((n, k) => inner += text(left + w * (k + 0.5) / 4, top + 15, L('Week {n}', { n }), { cls: 'tx tx-d tx-s', anchor: 'middle' }));
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
  return figure(svg({ w: W, h: H, label: L('The month'), inner }), { cls: 'narrow' });
}

function render() {
  app.content.innerHTML = `
    <section id="day">
      <h2>${L('The day')}</h2>
      ${strip()}
      <div class="tl-detail" id="tl-detail" hidden></div>
    </section>
    <section id="steps">
      <h2>${L('Daily instructions for each phone')}</h2>
      <p class="mute">${L('The whole day for one phone, from the device room and back, and who does what along the way.')}</p>
      <div id="flow"></div>
    </section>
    <section id="week">
      <h2>${L('The week')}</h2>
      ${weekStrip()}
      <ul class="rows">${data.weekly.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
    </section>
    <section id="month">
      <h2>${L('The month')}</h2>
      ${monthStrip()}
      <ul class="rows">${data.month.map(m => `<li><b>${esc(m.what)}</b><span class="d">${esc(m.when)}. ${esc(m.text)}</span></li>`).join('')}</ul>
    </section>
    <section id="always">
      <h2>${L('Always')}</h2>
      <ul class="rows">${data.cadence.find(c => c.id === 'always').items.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
    </section>`;
}
render();
// tapping a number on the line shows that moment
{
  const fig = document.querySelector('#day figure'), panel = document.getElementById('tl-detail');
  let sel = -1;
  const pickMoment = i => {
    sel = sel === i ? -1 : i;
    fig.querySelectorAll('.tl-hit').forEach(g => g.classList.toggle('on', Number(g.dataset.i) === sel));
    if (sel < 0) { panel.hidden = true; panel.innerHTML = ''; return; }
    const ev = data.day[sel];
    panel.innerHTML = `<p class="when">${esc(ev.when)}</p><p><b>${esc(ev.what)}</b> ${esc(ev.text)}${ev.route ? ` <a href="#${esc(ev.route)}">${L('See the steps')}</a>` : ''}</p>`;
    panel.hidden = false;
  };
  fig.addEventListener('click', e => { const g = e.target.closest('.tl-hit'); if (g) pickMoment(Number(g.dataset.i)); });
  fig.addEventListener('keydown', e => { const g = e.target.closest('.tl-hit'); if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); pickMoment(Number(g.dataset.i)); } });
}
mountFlow({ host: document.getElementById('flow'), data: data.flow, L, initial: initialHash(), setHash });
