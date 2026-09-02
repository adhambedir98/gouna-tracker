import { mount, loadJSON, esc, fmt, href } from '../app.js';
import { svg, rect, text, line, box, figure, wrap } from '../svg.js';

const app = await mount({
  page: 'channels',
  title: { en: 'Three channels, one spine' },
  lede: { en: 'Three ways to reach a floor. One set of rules every hour passes through.' },
  toc: [{ id: 'diagram', label: { en: 'The diagram' } }, { id: 'decide', label: { en: 'Which channel for a new site' } }]
});
const data = await loadJSON('data/channels.json');

function diagram() {
  const W = 360, id = 'ch';
  let s = '';
  const xs = [62, 180, 298], bw = 112;
  const bh = 92;
  data.channels.forEach((c, i) => {
    const x = xs[i] - bw / 2;
    s += rect(x, 8, bw, bh, i === 0 ? 'bx-acc-line' : 'bx');
    const nameLines = wrap(c.name, 14);
    s += text(xs[i], 26, nameLines, { cls: 'tx tx-b', anchor: 'middle', lh: 14 });
    let y = 26 + nameLines.length * 14 + 2;
    s += text(xs[i], y, c.phones ? `${fmt(c.phones)} phones` : 'phones per site', { cls: 'tx tx-a tx-s tx-b', anchor: 'middle' });
    const whereLines = wrap(c.where, 19).slice(0, 2);
    s += text(xs[i], y + 14, whereLines, { cls: 'tx tx-m tx-s', anchor: 'middle', lh: 12 });
    s += line(xs[i], 8 + bh, xs[i], 118, 'ln');
  });
  s += line(xs[0], 118, xs[2], 118, 'ln');
  s += line(180, 118, 180, 142, 'ln-acc', `marker-end="url(#${id}-arr-acc)"`);
  // the spine
  const top = 144, sh = 46, gap = 12;
  data.spine.forEach((st, i) => {
    const y = top + i * (sh + gap);
    s += rect(80, y, 200, sh, 'bx-acc-line');
    const ls = wrap(st.step, 26);
    s += text(180, y + sh / 2 + (ls.length > 1 ? -2 : 5), ls, { cls: 'tx tx-b tx-a', anchor: 'middle', lh: 14 });
    if (i < data.spine.length - 1) s += line(180, y + sh, 180, y + sh + gap - 1, 'ln-acc', `marker-end="url(#${id}-arr-acc)"`);
  });
  const yEnd = top + data.spine.length * (sh + gap) - gap;
  s += text(292, top + 60, 'the spine', { cls: 'tx tx-s tx-m' });
  s += text(292, top + 74, 'a condition', { cls: 'tx tx-s tx-m' });
  s += text(292, top + 88, 'of payment', { cls: 'tx tx-s tx-m' });
  s += line(180, yEnd, 180, yEnd + 26, 'ln-acc', `marker-end="url(#${id}-arr-acc)"`);
  s += box(105, yEnd + 28, 150, 40, ['The client'], { cls: 'bx-acc', tcls: 'tx tx-b tx-p' });
  return figure(svg({ w: W, h: yEnd + 76, label: 'Three channels feeding one spine to the client', inner: s, id }), { cls: 'narrow' });
}

/* ---------- the decision path ---------- */
let node = data.decision.start;
const Q = Object.fromEntries(data.decision.questions.map(q => [q.id, q]));
const O = Object.fromEntries(data.decision.outcomes.map(o => [o.id, o]));
let trail = [];

function decide() {
  const q = Q[node], o = O[node];
  const crumbs = trail.map(([qid, ans]) => `<li><span class="mute">${esc(Q[qid].q)}</span> <b>${ans === 'yes' ? 'Yes' : 'No'}</b></li>`).join('');
  return `<div class="card panel" id="decide-card">
    ${crumbs ? `<ul class="small" style="padding-inline-start:18px;margin-bottom:12px">${crumbs}</ul>` : ''}
    ${q ? `<h3>${esc(q.q)}</h3><div class="btn-row"><button type="button" class="btn primary" data-ans="yes">Yes</button><button type="button" class="btn" data-ans="no">No</button></div>` : ''}
    ${o ? `<h3 class="accent">${esc(o.name)}</h3><p>${esc(o.text)}</p>` : ''}
    ${trail.length ? `<div class="btn-row no-print"><button type="button" class="btn" id="restart">Start over</button></div>` : ''}
  </div>`;
}

function render() {
  app.content.innerHTML = `
    <section id="diagram">
      ${diagram()}
      <ul class="rows">${data.channels.map(c => `<li><b>${esc(c.name)}</b><span class="d">${esc(c.who)}. ${esc(c.where)}. ${esc(c.runs)}. ${esc(c.text)}</span></li>`).join('')}</ul>
      <p class="callout">${esc(data.shared)}</p>
      <ul class="rows">${data.spine.map(st => `<li><b>${esc(st.step)}</b><span class="d">${esc(st.text)}</span></li>`).join('')}</ul>
    </section>
    <section id="decide">
      <h2>Which channel for a new site</h2>
      <div id="decide-wrap">${decide()}</div>
      <details class="print-only" open><summary><h3>All the questions</h3></summary><div class="body">
        <ol>${data.decision.questions.map(q => `<li>${esc(q.q)} <span class="mute">Yes: ${esc((O[q.yes] || Q[q.yes] || {}).name || 'next question')}. No: ${esc((O[q.no] || Q[q.no] || {}).name || 'next question')}.</span></li>`).join('')}</ol>
        <ul>${data.decision.outcomes.map(o => `<li><b>${esc(o.name)}.</b> ${esc(o.text)}</li>`).join('')}</ul>
      </div></details>
      <p class="small mute">The terms every partner signs are on the <a href="${href('manual/channels')}">channels and partners</a> page.</p>
    </section>`;
}
render();
document.addEventListener('click', e => {
  const a = e.target.closest('[data-ans]');
  if (a) { const q = Q[node]; if (!q) return; trail.push([node, a.dataset.ans]); node = q[a.dataset.ans]; document.getElementById('decide-wrap').innerHTML = decide(); return; }
  if (e.target.id === 'restart') { trail = []; node = data.decision.start; document.getElementById('decide-wrap').innerHTML = decide(); }
});
