import { mount, loadJSON, esc, fmt, href, labels } from '../app.js';
import { svg, rect, text, line, box, figure, wrap } from '../svg.js';
const L = await labels('channels');

const app = await mount({
  page: 'channels',
  title: L('How we work with sites')
});
const data = await loadJSON('data/channels.json');

function diagram() {
  const W = 360, id = 'ch';
  let s = '';
  const n = data.channels.length, bw = 112;
  const xs = data.channels.map((c, i) => W / 2 + (i - (n - 1) / 2) * 180);
  const bh = 64, busY = 8 + bh + 22;
  data.channels.forEach((c, i) => {
    const x = xs[i] - bw / 2;
    s += rect(x, 8, bw, bh, i === 0 ? 'bx-acc-line' : 'bx');
    const nameLines = wrap(c.name, 14);
    s += text(xs[i], 26, nameLines, { cls: 'tx tx-b', anchor: 'middle', lh: 14 });
    let y = 26 + nameLines.length * 14 + 2;
    s += text(xs[i], y, c.phones ? L('{n} phones', { n: fmt(c.phones) }) : L('phones per site'), { cls: 'tx tx-a tx-s tx-b', anchor: 'middle' });
    s += line(xs[i], 8 + bh, xs[i], busY, 'ln');
  });
  s += line(xs[0], busY, xs[n - 1], busY, 'ln');
  s += line(180, busY, 180, busY + 24, 'ln-acc', `marker-end="url(#${id}-arr-acc)"`);
  // the spine
  const top = busY + 26, sh = 46, gap = 12;
  // the last step is the outcome: paid on accepted hours, net of fraud flags
  data.spine.forEach((st, i) => {
    const y = top + i * (sh + gap), last = i === data.spine.length - 1;
    s += rect(80, y, 200, sh, last ? 'bx-acc' : 'bx-acc-line');
    const ls = wrap(st.step, 26);
    s += text(180, y + sh / 2 + (ls.length > 1 ? -2 : 5), ls, { cls: 'tx tx-b ' + (last ? 'tx-p' : 'tx-a'), anchor: 'middle', lh: 14 });
    if (!last) s += line(180, y + sh, 180, y + sh + gap - 1, 'ln-acc', `marker-end="url(#${id}-arr-acc)"`);
  });
  const yEnd = top + data.spine.length * (sh + gap) - gap;
  return figure(svg({ w: W, h: yEnd + 8, label: L('Two channels feeding one spine to the client'), inner: s, id }), { cls: 'narrow' });
}

/* ---------- the decision path ---------- */
let node = data.decision.start;
const Q = Object.fromEntries(data.decision.questions.map(q => [q.id, q]));
const O = Object.fromEntries(data.decision.outcomes.map(o => [o.id, o]));
let trail = [];

function decide() {
  const q = Q[node], o = O[node];
  const crumbs = trail.map(([qid, ans]) => `<li><span class="mute">${esc(Q[qid].q)}</span> <b>${ans === 'yes' ? L('Yes') : L('No')}</b></li>`).join('');
  return `<div class="card panel" id="decide-card">
    ${crumbs ? `<ul class="small" style="padding-inline-start:18px;margin-bottom:12px">${crumbs}</ul>` : ''}
    ${q ? `<h3>${esc(q.q)}</h3><div class="btn-row"><button type="button" class="btn primary" data-ans="yes">${L('Yes')}</button><button type="button" class="btn" data-ans="no">${L('No')}</button></div>` : ''}
    ${o ? `<h3 class="accent">${esc(o.name)}</h3><p>${esc(o.text)}</p>` : ''}
    ${trail.length ? `<div class="btn-row no-print"><button type="button" class="btn" id="restart">${L('Start over')}</button></div>` : ''}
  </div>`;
}

function render() {
  app.content.innerHTML = `
    <section id="diagram" style="margin-top:0">
      ${diagram()}
      <div class="cards two">${data.channels.map(c => `<div class="card panel"><h3>${esc(c.name)}</h3><p class="accent small" style="margin:4px 0 8px">${L('Today, around {n} phones.', { n: fmt(c.phones) })}</p><p style="margin:0">${esc(c.text)}</p></div>`).join('')}</div>
      <p class="callout">${esc(data.shared)}</p>
      <ul class="rows">${data.spine.map(st => `<li><b>${esc(st.step)}</b><span class="d">${esc(st.text)}</span></li>`).join('')}</ul>
    </section>
    <section id="decide">
      <h2>${L('Which channel for a new site')}</h2>
      <div id="decide-wrap">${decide()}</div>
      <details class="print-only" open><summary><h3>${L('All the questions')}</h3></summary><div class="body">
        <ol>${data.decision.questions.map(q => `<li>${esc(q.q)} <span class="mute">${L('Yes')}: ${esc((O[q.yes] || Q[q.yes] || {}).name || L('next question'))}. ${L('No')}: ${esc((O[q.no] || Q[q.no] || {}).name || L('next question'))}.</span></li>`).join('')}</ol>
        <ul>${data.decision.outcomes.map(o => `<li><b>${esc(o.name)}.</b> ${esc(o.text)}</li>`).join('')}</ul>
      </div></details>
      <p class="small mute">${L('The terms every partner signs are on the {link} page.', { link: `<a href="${href('manual/channels')}">${L('channels and partners')}</a>` })}</p>
    </section>`;
}
render();
document.addEventListener('click', e => {
  const a = e.target.closest('[data-ans]');
  if (a) { const q = Q[node]; if (!q) return; trail.push([node, a.dataset.ans]); node = q[a.dataset.ans]; document.getElementById('decide-wrap').innerHTML = decide(); return; }
  if (e.target.id === 'restart') { trail = []; node = data.decision.start; document.getElementById('decide-wrap').innerHTML = decide(); }
});
