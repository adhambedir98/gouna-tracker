import { mount, loadJSON, esc, labels, href } from '../app.js';
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
      <p><a class="chip" href="${href('fraud')}">${L('The Fraud page, with pictures')}</a></p>
    </section>
    <section id="rules">
      <h2>${L('The four rules')}</h2>
      <div class="stat">${big.map(([n, l]) => `<div><div class="big">${esc(n)}</div><div class="lbl">${esc(l)}</div></div>`).join('')}</div>
      <ul class="rows">${m.rules.map(r => `<li><b>${esc(r.name)}</b><span class="d">${esc(r.text)}</span></li>`).join('')}</ul>
    </section>
    ${blocks(m)}`;
}
render();
