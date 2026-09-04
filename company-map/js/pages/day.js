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
    if (ev.via && i > 0) { const px = xAt(i - 1), cx = xAt(i); inner += line(px + 14, lineY, cx - 14, lineY, 'ln-acc') + text((px + cx) / 2, lineY - 8, ev.via, { cls: 'tx tx-a tx-s', anchor: 'middle' }); }
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
  return figure(svg({ w: W, h: H, label: L('The working day, left to right'), inner }), { cls: 'timeline' });
}

// a short point: the first sentence in bold, the rest as text
function point(x) { const m = String(x).match(/^(.*?[.!?])\s+(.*)$/); return `<div class="point"><b>${esc(m ? m[1] : x)}</b>${m ? `<span>${esc(m[2])}</span>` : ''}</div>`; }
function render() {
  app.content.innerHTML = `
    <section id="day">
      <h2>${L('The day')}</h2>
      ${strip()}
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
