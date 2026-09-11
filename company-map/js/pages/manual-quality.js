import { mount, loadJSON, esc, labels, href } from '../app.js';
import { blocks, MANUAL_TOC } from '../manual-blocks.js';
import { svg, line, box, text, figure } from '../svg.js';
const L = await labels('manual-quality');

const m = await loadJSON('data/manual/quality.json');
const app = await mount({
  page: 'manual-quality',
  title: { en: m.title },
  lede: { en: m.purpose },
  toc: [{ id: 'funnel', label: L('The funnel') }, { id: 'rules', label: L('The four rules') }, ...MANUAL_TOC]
});

/* ---------- the funnel ---------- */
// drawn at 350 units so every label is a full 13px on a phone
function funnel() {
  const W = 350, id = 'fun', sub = 'tx tx-m';
  let s = '';
  s += box(15, 8, 320, 40, [L('Uploaded')], { sub: [L('everything the collection app sends')], scls: sub });
  s += line(175, 48, 175, 70, 'ln', `marker-end="url(#${id}-arr)"`);
  s += box(15, 72, 320, 40, [L('Reviewed')], { cls: 'bx-acc-line', tcls: 'tx tx-b tx-a', sub: [L('every video, by our own team')], scls: sub });
  // split into three verdicts
  s += line(175, 112, 175, 128, 'ln');
  s += line(60, 128, 286, 128, 'ln');
  [60, 171, 286].forEach(x => s += line(x, 128, x, 152, 'ln', `marker-end="url(#${id}-arr)"`));
  s += box(15, 154, 90, 44, [L('Kept')], { sub: [L('clean')], scls: sub });
  s += box(111, 154, 120, 44, [L('Feedback')], { sub: [L('kept, fixed in 24 h')], scls: sub });
  s += box(237, 154, 98, 44, [L('Fraud')], { cls: 'bx-panel', sub: [L('a flag')], scls: sub });
  // kept and feedback go to the client
  s += line(60, 198, 60, 228, 'ln-acc', `marker-end="url(#${id}-arr-acc)"`);
  s += line(171, 198, 171, 228, 'ln-acc', `marker-end="url(#${id}-arr-acc)"`);
  s += box(15, 230, 216, 40, [L('To the client')], { cls: 'bx-acc', tcls: 'tx tx-b tx-p', sub: [L('accepted hours')], scls: 'tx tx-p' });
  // fraud goes to deleted
  s += line(286, 198, 286, 228, 'ln', `marker-end="url(#${id}-arr)"`);
  s += box(237, 230, 98, 40, [L('Deleted')], { cls: 'bx-panel', sub: [L('never invoiced')], scls: sub });
  s += text(335, 290, L('three flags pulls the worker'), { cls: sub, anchor: 'end' });
  return figure(svg({ w: W, h: 300, label: L('The quality funnel from upload to the client or deletion'), inner: s, id }), { cls: 'narrow' });
}

function render() {
  const big = [['3', L('flags pull the worker')], ['2', L('strikes pause the device')], [L('24 hours'), L('flag to worker, with a fix')], [L('Week 4'), L('month-end second pass')]];
  app.content.innerHTML = `
    <section id="funnel">
      <h2>${L('The funnel')}</h2>
      ${funnel()}
      <ul class="rows">${m.funnel.map(f => `<li><b>${esc(f.stage)}</b><span class="d">${esc(f.text)}</span></li>`).join('')}</ul>
      <p><a class="chip" href="${href('fraud')}">${L('The eight fraud patterns, with pictures')}</a></p>
    </section>
    <section id="rules">
      <h2>${L('The four rules')}</h2>
      <div class="stat">${big.map(([n, l]) => `<div><div class="big">${esc(n)}</div><div class="lbl">${esc(l)}</div></div>`).join('')}</div>
      <ul class="rows">${m.rules.map(r => `<li><b>${esc(r.name)}</b><span class="d">${esc(r.text)}</span></li>`).join('')}</ul>
    </section>
    ${blocks(m)}`;
}
render();
