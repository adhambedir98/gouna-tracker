import { mount, loadJSON, esc, t, store, href } from '../app.js';
import { blocks, MANUAL_TOC } from '../manual-blocks.js';
import { svg, rect, text, line, figure } from '../svg.js';

const m = await loadJSON('data/manual/compliance.json');
const gate = await loadJSON('data/gate.json');
const app = await mount({
  page: 'manual-compliance',
  title: { en: m.title },
  lede: { en: m.purpose },
  toc: [{ id: 'gate', label: { en: 'The gate' } }, { id: 'calendar', label: { en: 'Legal calendar' } }, { id: 'breach', label: { en: 'Breach clocks' } }, ...MANUAL_TOC]
});

const KEY = 'vm.calendar';
const overrides = () => store.get(KEY, {});
const rows = () => m.calendar.map(r => ({ ...r, ...(overrides()[r.id] || {}) }));
const D = s => new Date(s + 'T00:00:00');
const fmtDate = s => D(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/* ---------- the Gantt ---------- */
function gantt() {
  const R = rows();
  const W = 360, left = 6, right = 354, rowH = 44, top = 30, id = 'gantt';
  const minS = new Date(Math.min(...R.map(r => D(r.start)))), maxD = new Date(Math.max(...R.map(r => D(r.due))));
  const t0 = new Date(minS.getFullYear(), minS.getMonth(), 1), t1 = new Date(maxD.getFullYear(), maxD.getMonth() + 1, 1);
  const X = dt => left + (dt - t0) / (t1 - t0) * (right - left);
  const bottom = top + R.length * rowH;
  let s = '';
  for (let dt = new Date(t0); dt < t1; dt.setMonth(dt.getMonth() + 1)) {
    const x = X(dt);
    s += line(x.toFixed(1), top - 6, x.toFixed(1), bottom, 'ln-soft');
    s += text((x + 3).toFixed(1), top - 10, dt.toLocaleDateString('en-US', { month: 'short' }) + (dt.getMonth() === 0 ? ' ' + dt.getFullYear() : ''), { cls: 'tx tx-d tx-s halo' });
  }
  const hard = R.find(r => r.hard);
  if (hard) {
    const x = X(D(hard.due));
    s += line(x.toFixed(1), top - 6, x.toFixed(1), bottom + 6, 'ln-acc dash');
    s += text((x - 5).toFixed(1), bottom + 20, fmtDate(hard.due) + ', does not move', { cls: 'tx tx-a tx-s tx-b', anchor: 'end' });
  }
  R.forEach((r, i) => {
    const y = top + i * rowH;
    s += text(left, y + 12, r.item, { cls: 'tx halo' + (r.hard ? ' tx-b' : '') });
    const x0 = X(D(r.start)), x1 = X(D(r.due));
    s += rect(x0.toFixed(1), y + 18, Math.max(4, x1 - x0).toFixed(1), 12, r.hard ? 'bx-acc' : 'bx-acc-line', r.placeholder ? 'stroke-dasharray="3 3"' : '');
  });
  return figure(svg({ w: W, h: bottom + 30, label: 'The legal calendar', inner: s, id }), { caption: 'Solid bars are the law\'s dates. Dashed bars are Mano\'s plan; edit them below and the chart follows.', cls: 'narrow' });
}

/* ---------- breach clocks ---------- */
function clocks() {
  const W = 360, id = 'clk';
  let s = '';
  s += text(8, 16, 'We know', { cls: 'tx tx-b' });
  s += line(8, 22, 8, 108, 'ln-ink');
  [24, 48, 72].forEach(h => { const x = 8 + h * 4.4; s += line(x, 22, x, 108, 'ln-soft'); s += text(x, 118, `${h} h`, { cls: 'tx tx-d tx-s', anchor: 'middle' }); });
  s += rect(8, 32, 24 * 4.4, 20, 'bx-acc');
  s += text(8 + 24 * 4.4 + 8, 46, 'The client, 24 hours. Adham.', { cls: 'tx tx-b' });
  s += rect(8, 70, 72 * 4.4, 20, 'bx-acc-line');
  s += text(14, 84, 'The regulator, 72 hours. Mano with counsel.', { cls: 'tx tx-b tx-a' });
  return figure(svg({ w: W, h: 126, label: 'Two breach clocks', inner: s, id }), { cls: 'narrow' });
}

function render() {
  const R = rows();
  app.content.innerHTML = `
    <section id="gate">
      <h2>The gate</h2>
      <p class="mute">${esc(m.gateNote)}</p>
      <ol class="rows">${gate.items.map(g => `<li>${esc(t(g.short))}<span class="d"> ${esc(t(g.s))}</span></li>`).join('')}</ol>
      <p><a class="btn" href="${href('onboarding')}">Open the onboarding gate</a></p>
    </section>
    <section id="calendar">
      <h2>Legal calendar</h2>
      ${gantt()}
      <h3 style="margin-top:20px">Owners and dates</h3>
      <p class="tiny dim no-print">Dates are saved on this device. The plan dates in the file are Mano's to change; November 1 is not.</p>
      <ul class="rows">${R.map(r => `<li class="cal-row"><b>${esc(r.item)}${r.hard ? ' <span class="accent tiny">hard date</span>' : ''}</b><span class="d">${esc(r.owner)}. ${esc(r.note)}</span>
        <div class="fields"><div class="field"><label for="c-${r.id}-s">Start</label><input type="date" id="c-${r.id}-s" data-cal="${r.id}" data-k="start" value="${esc(r.start)}"></div><div class="field"><label for="c-${r.id}-d">Due</label><input type="date" id="c-${r.id}-d" data-cal="${r.id}" data-k="due" value="${esc(r.due)}" ${r.hard ? 'disabled' : ''}></div></div></li>`).join('')}</ul>
      <div class="btn-row no-print"><button type="button" class="btn" id="cal-reset">Back to the plan dates</button></div>
    </section>
    <section id="breach">
      <h2>Breach clocks</h2>
      ${clocks()}
      <p>${esc(m.breach.text)}</p>
      <p class="mute small">${esc(m.breach.owner)}</p>
    </section>
    ${blocks(m)}`;
}
render();

document.addEventListener('change', e => {
  const inp = e.target.closest('[data-cal]'); if (!inp || !inp.value) return;
  const o = overrides(); o[inp.dataset.cal] = { ...(o[inp.dataset.cal] || {}), [inp.dataset.k]: inp.value }; store.set(KEY, o);
  const fig = document.querySelector('#calendar figure'); if (fig) fig.outerHTML = gantt();
});
document.addEventListener('click', e => { if (e.target.id === 'cal-reset') { store.remove(KEY); render(); } });
