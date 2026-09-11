import { mount, loadJSON, esc, labels, initialHash, setHash } from '../app.js';
import { mountFlow } from '../sflow.js';
import { svg, text, line, circle, figure, wrap } from '../svg.js';
const L = await labels('day');

const app = await mount({
  page: 'day',
  title: L('What happens every day'),
  toc: [{ id: 'day', label: L('The day') }, { id: 'steps', label: L('Daily instructions for each phone') }, { id: 'rhythm', label: L('The week and the month') }, { id: 'always', label: L('Always') }]
});
const data = await loadJSON('data/day.json');

// below 820px the column is narrower than the strip, so the day is drawn top to bottom instead
const narrow = matchMedia('(max-width:819px)');
// the recording cycles run from the first cycle to clock-out
const arcA = data.day.findIndex(ev => ev.arc), arcB = data.day.findIndex((ev, i) => i > arcA && ev.hour === data.cycles.end);
// a numbered dot that can be tapped
const hit = (i, ev, x, y) => `<g class="tl-hit" data-i="${i}" role="button" tabindex="0" aria-label="${esc(ev.what)}">` + circle(x, y, 12, ev.solid ? 'dot' : 'dot-o') + text(x, y + 4, String(i + 1), { cls: 'tx tx-b ' + (ev.solid ? 'tx-p' : 'tx-a'), anchor: 'middle' }) + '</g>';

function strip() {
  // the day as one line, left to right: a numbered dot per moment, labels alternating above and below
  const n = data.day.length, W = 760, left = 70, right = 70, slot = (W - left - right) / (n - 1), lineY = 108, H = 208;
  const xAt = i => left + i * slot;
  let inner = line(left - 30, lineY, W - right + 30, lineY, 'ln');
  if (arcA >= 0 && arcB > arcA) inner += line(xAt(arcA), lineY, xAt(arcB), lineY, 'ln-acc');
  data.day.forEach((ev, i) => {
    const x = xAt(i).toFixed(1), above = i % 2 === 0;
    if (ev.via && i > 0) { const px = xAt(i - 1), cx = xAt(i); inner += line(px + 14, lineY, cx - 14, lineY, 'ln-acc') + text((px + cx) / 2 - 4, lineY - 12, ev.via, { cls: 'tx tx-a', anchor: 'middle' }); }
    inner += hit(i, ev, x, lineY);
    // two lines of even length rather than a lone short word on the second line
    let lines = wrap(ev.what, 20);
    if (lines.length === 2 && lines[1].length <= 4) { const m = wrap(ev.what, Math.ceil(ev.what.length / 2) + 2); if (m.length === 2) lines = m; }
    if (above) {
      const first = lineY - 32 - (lines.length - 1) * 15;
      inner += text(x, first - 17, ev.when, { cls: 'tx tx-a', anchor: 'middle' });
      inner += text(x, first, lines, { cls: 'tx', lh: 15, anchor: 'middle' });
    } else {
      const first = lineY + 32;
      inner += text(x, first, lines, { cls: 'tx', lh: 15, anchor: 'middle' });
      inner += text(x, first + lines.length * 15 + 2, ev.when, { cls: 'tx tx-a', anchor: 'middle' });
    }
  });
  return figure(svg({ w: W, h: H, label: L('The working day, left to right'), inner }), { cls: 'timeline' });
}
function stripPortrait() {
  // the same day top to bottom: the dots on one vertical line, the time and the moment to the right of each
  const W = 350, x0 = 28, tx = 52, ys = [];
  let y = 24;
  data.day.forEach(ev => { if (ev.via) y += 20; ys.push(y); y += 46; });
  const H = y - 46 + 30;
  let inner = line(x0, ys[0], x0, ys[ys.length - 1], 'ln');
  if (arcA >= 0 && arcB > arcA) inner += line(x0, ys[arcA], x0, ys[arcB], 'ln-acc');
  data.day.forEach((ev, i) => {
    const y = ys[i];
    if (ev.via && i > 0) { const py = ys[i - 1]; inner += line(x0, py + 14, x0, y - 14, 'ln-acc') + text(tx, (py + y) / 2 + 4, ev.via, { cls: 'tx tx-a' }); }
    inner += hit(i, ev, x0, y);
    inner += text(tx, y - 4, ev.when, { cls: 'tx tx-a' }) + text(tx, y + 13, ev.what, { cls: 'tx' });
  });
  return figure(svg({ w: W, h: H, label: L('The working day, top to bottom'), cls: 'portrait', inner }), { cls: 'timeline' });
}
const drawStrip = () => (narrow.matches ? stripPortrait() : strip());

// a short point: the first sentence in bold, the rest as text; a single sentence stays plain
function point(x) { const m = String(x).match(/^(.*?[.!?])\s+(.*)$/); return m ? `<div class="point"><b>${esc(m[1])}</b><span>${esc(m[2])}</span></div>` : `<div class="point"><span>${esc(x)}</span></div>`; }
function render() {
  app.content.innerHTML = `
    <section id="day">
      <h2>${L('The day')}</h2>
      ${drawStrip()}
      <div class="tl-detail" id="tl-detail" hidden></div>
    </section>
    <section id="steps">
      <h2>${L('Daily instructions for each phone')}</h2>
      <div class="rule-band where">${data.where.map(w => `<div><b>${esc(w.b)}</b><span>${esc(w.s)}</span></div>`).join('')}</div>
      <div id="flow"></div>
    </section>
    <section id="rhythm">
      <h2>${L('The week and the month')}</h2>
      <div class="points">${data.rhythm.map(point).join('')}</div>
    </section>
    <section id="always">
      <h2>${L('Always')}</h2>
      <div class="points">${data.always.map(point).join('')}</div>
    </section>`;
}
render();
// tapping a number on the line shows that moment
{
  const sec = document.getElementById('day'), panel = document.getElementById('tl-detail');
  let sel = -1;
  const mark = () => sec.querySelectorAll('.tl-hit').forEach(g => g.classList.toggle('on', Number(g.dataset.i) === sel));
  const pickMoment = i => {
    sel = sel === i ? -1 : i;
    mark();
    if (sel < 0) { panel.hidden = true; panel.innerHTML = ''; return; }
    const ev = data.day[sel];
    panel.innerHTML = `<p class="when">${esc(ev.when)}</p><p><b>${esc(ev.what)}</b> ${esc(ev.text)}${ev.route ? ` <a href="#${esc(ev.route)}">${L('See the steps')}</a>` : ''}</p>`;
    panel.hidden = false;
  };
  sec.addEventListener('click', e => { const g = e.target.closest('.tl-hit'); if (g) pickMoment(Number(g.dataset.i)); });
  sec.addEventListener('keydown', e => { const g = e.target.closest('.tl-hit'); if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); pickMoment(Number(g.dataset.i)); } });
  // the strip is redrawn when the screen crosses the portrait width
  narrow.addEventListener('change', () => { sec.querySelector('figure').outerHTML = drawStrip(); mark(); });
}
mountFlow({ host: document.getElementById('flow'), data: data.flow, L, initial: initialHash(), setHash });
