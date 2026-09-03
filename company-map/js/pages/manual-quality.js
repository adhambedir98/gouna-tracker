import { mount, loadJSON, esc, labels } from '../app.js';
import { blocks, MANUAL_TOC } from '../manual-blocks.js';
import { svg, rect, text, line, circle, path, box, figure } from '../svg.js';
const L = await labels('manual-quality');

const m = await loadJSON('data/manual/quality.json');
const app = await mount({
  page: 'manual-quality',
  title: { en: m.title },
  lede: { en: m.purpose },
  toc: [{ id: 'funnel', label: L('The funnel') }, { id: 'patterns', label: L('Fraud patterns') }, { id: 'rules', label: L('The four rules') }, ...MANUAL_TOC]
});

/* ---------- the funnel ---------- */
function funnel() {
  const W = 360, id = 'fun';
  const st = Object.fromEntries(m.funnel.map(f => [f.stage.toLowerCase(), f]));
  let s = '';
  s += box(20, 8, 320, 40, [L('Uploaded')], { sub: [L('everything the collection app sends')] });
  s += line(180, 48, 180, 70, 'ln', `marker-end="url(#${id}-arr)"`);
  s += box(20, 72, 320, 40, [L('Reviewed')], { cls: 'bx-acc-line', tcls: 'tx tx-b tx-a', sub: [L('every video, by our own team')] });
  // split into three verdicts
  s += line(180, 112, 180, 128, 'ln');
  s += line(80, 128, 300, 128, 'ln');
  [80, 200, 300].forEach(x => s += line(x, 128, x, 152, 'ln', `marker-end="url(#${id}-arr)"`));
  s += box(20, 154, 120, 44, [L('Kept')], { sub: [L('clean')] });
  s += box(150, 154, 100, 44, [L('Feedback')], { sub: [L('kept, fixed in 24 h')] });
  s += box(260, 154, 80, 44, [L('Fraud')], { cls: 'bx-panel', sub: [L('a flag')] });
  // kept and feedback go to the client
  s += line(80, 198, 80, 228, 'ln-acc', `marker-end="url(#${id}-arr-acc)"`);
  s += line(200, 198, 200, 228, 'ln-acc', `marker-end="url(#${id}-arr-acc)"`);
  s += box(20, 230, 230, 40, [L('To the client')], { cls: 'bx-acc', tcls: 'tx tx-b tx-p', sub: [L('accepted hours')], scls: 'tx tx-p tx-s' });
  // fraud goes to deleted
  s += line(300, 198, 300, 228, 'ln', `marker-end="url(#${id}-arr)"`);
  s += box(260, 230, 80, 40, [L('Deleted')], { cls: 'bx-panel', sub: [L('never invoiced')] });
  s += text(300, 290, L('three flags pulls the worker'), { cls: 'tx tx-m tx-s', anchor: 'middle' });
  return figure(svg({ w: W, h: 300, label: L('The quality funnel from upload to the client or deletion'), inner: s, id }), { cls: 'narrow' });
}

/* ---------- pictograms for the fraud patterns ---------- */
function pict(kind) {
  const W = 132, H = 76;
  let s = line(4, 70, 128, 70, 'ln-soft');
  const person = (cx, cy, { hat = true, cam = true, arms = 'down' } = {}) => {
    let p = circle(cx, cy, 9, 'bx');
    if (hat) p += rect(cx - 12, cy - 13, 24, 5, 'bx-acc');
    if (hat && cam) p += rect(cx + 9, cy - 12, 6, 5, 'bx-acc');
    p += line(cx, cy + 9, cx, cy + 34, 'ln-ink');
    p += line(cx, cy + 34, cx - 8, cy + 52, 'ln-ink') + line(cx, cy + 34, cx + 8, cy + 52, 'ln-ink');
    if (arms === 'work') p += line(cx, cy + 16, cx + 16, cy + 22, 'ln-ink') + line(cx + 16, cy + 22, cx + 26, cy + 14, 'ln-ink');
    else if (arms === 'still') p += line(cx, cy + 16, cx - 2, cy + 32, 'ln-ink');
    else p += line(cx, cy + 16, cx + 6, cy + 30, 'ln-ink');
    return p;
  };
  const cone = (x, y, deg, len) => {
    const a = deg * Math.PI / 180, h = 13 * Math.PI / 180;
    const p1 = [x + len * Math.cos(a - h), y + len * Math.sin(a - h)], p2 = [x + len * Math.cos(a + h), y + len * Math.sin(a + h)];
    return path(`M${x} ${y}L${p1[0].toFixed(1)} ${p1[1].toFixed(1)}L${p2[0].toFixed(1)} ${p2[1].toFixed(1)}Z`, 'bx-soft');
  };
  switch (kind) {
    case 'idle': s += cone(46, 13, 0, 58) + person(34, 22, { arms: 'still' }) + rect(72, 3, 42, 22, 'bx', 'stroke-dasharray="3 3"') + text(93, 18, L('same frame'), { cls: 'tx tx-s tx-m', anchor: 'middle' }); break;
    case 'hat-off': s += person(34, 22, { hat: false }) + cone(101, 56, -90, 40) + rect(86, 60, 30, 5, 'bx-acc') + rect(98, 55, 6, 5, 'bx-acc') + text(101, 10, L('ceiling'), { cls: 'tx tx-s tx-m', anchor: 'middle' }); break;
    case 'torso': s += cone(46, 13, 58, 62) + person(34, 22) + text(96, 64, L('floor'), { cls: 'tx tx-s tx-m' }); break;
    case 'chest': s += cone(44, 39, 6, 58) + person(34, 22, { cam: false }) + rect(37, 36, 6, 5, 'bx-acc'); break;
    case 'other-person': s += cone(42, 13, 8, 54) + person(30, 22) + person(98, 22, { hat: false, arms: 'work' }); break;
    case 'staged': s += cone(46, 13, 0, 50) + person(34, 22, { arms: 'work' }) + path('M104 34 a 9 9 0 1 1 8 -12', 'ln-ink') + path('M112 16 l3 7 l-8 0 Z', 'bx-acc') + text(108, 58, L('again'), { cls: 'tx tx-s tx-m', anchor: 'middle' }); break;
    case 'screen': s += cone(42, 13, 0, 44) + person(30, 22) + rect(88, 4, 38, 28, 'bx-acc-line') + path('M102 11 L114 18 L102 25 Z', 'bx-acc'); break;
    case 'repeat': s += cone(46, 13, 0, 46) + person(34, 22) + line(96, 8, 96, 30, 'ln-ink') + path('M96 8 L110 13 L96 18 Z', 'bx-acc') + line(114, 8, 114, 30, 'ln-ink') + path('M114 8 L128 13 L114 18 Z', 'bx-acc') + text(112, 46, L('flag, flag'), { cls: 'tx tx-s tx-m', anchor: 'middle' }); break;
  }
  return `<svg viewBox="0 0 ${W} ${H}" class="pict" aria-hidden="true">${s}</svg>`;
}

function render() {
  const big = [['3', L('flags pulls the worker')], ['2', L('strikes pauses the device')], [L('24 h'), L('flag to worker, with a fix')], [L('Last week'), L('of the month, the audit')]];
  app.content.innerHTML = `
    <section id="funnel">
      <h2>${L('The funnel')}</h2>
      ${funnel()}
      <ul class="rows">${m.funnel.map(f => `<li><b>${esc(f.stage)}</b><span class="d">${esc(f.text)}</span></li>`).join('')}</ul>
    </section>
    <section id="patterns">
      <h2>${L('The eight fraud patterns')}</h2>
      <p class="mute">${L("Every wearer signs off on these at the onboarding gate. The client's reviewers flag them; ours catch them first.")}</p>
      <div class="cards">${m.patterns.map(p => `<div class="card pattern">${pict(p.id)}<h3>${esc(p.name)}</h3><p class="small">${esc(p.what)}</p><p class="tiny mute"><b>${L('Tell.')}</b> ${esc(p.tell)}</p><p class="tiny"><b>${L('Fix.')}</b> ${esc(p.fix)}</p></div>`).join('')}</div>
    </section>
    <section id="rules">
      <h2>${L('The four rules')}</h2>
      <div class="stat">${big.map(([n, l]) => `<div><div class="big">${esc(n)}</div><div class="lbl">${esc(l)}</div></div>`).join('')}</div>
      <ul class="rows">${m.rules.map(r => `<li><b>${esc(r.name)}</b><span class="d">${esc(r.text)}</span></li>`).join('')}</ul>
    </section>
    ${blocks(m)}`;
}
render();
