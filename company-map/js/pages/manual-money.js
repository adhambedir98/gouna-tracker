import { mount, loadJSON, esc, labels } from '../app.js';
import { blocks, MANUAL_TOC } from '../manual-blocks.js';
import { svg, text, line, box, figure } from '../svg.js';
const L = await labels('manual-money');

const m = await loadJSON('data/manual/money.json');
const app = await mount({
  page: 'manual-money',
  title: { en: m.title },
  lede: { en: m.purpose },
  toc: [{ id: 'flow', label: L('The flow') }, { id: 'approval', label: L('Second approval') }, { id: 'monthend', label: L('Month end') }, ...MANUAL_TOC]
});

// drawn at 350 units so every label is a full 13px on a phone
function flow() {
  const W = 350, id = 'money', cx = 156;
  const [US, EG] = m.flow;
  let s = '';
  s += box(cx - 75, 8, 150, 44, [L('The client')], { cls: 'bx-acc', tcls: 'tx tx-b tx-p' });
  s += line(cx, 52, cx, 90, 'ln-acc', `marker-end="url(#${id}-arr-acc)"`);
  s += text(cx + 8, 66, US.what, { cls: 'tx' });
  s += text(cx + 8, 82, US.terms, { cls: 'tx tx-a tx-b' });
  s += box(cx - 75, 92, 150, 44, [L('The US company')], { cls: 'bx-acc-line', tcls: 'tx tx-b tx-a' });
  s += line(cx, 136, cx, 174, 'ln-acc', `marker-end="url(#${id}-arr-acc)"`);
  s += text(cx + 8, 150, EG.what, { cls: 'tx' });
  s += text(cx + 8, 166, EG.terms, { cls: 'tx tx-a' });
  s += box(cx - 75, 176, 150, 44, ['KMSC'], { cls: 'bx-acc-line', tcls: 'tx tx-b tx-a', sub: [L('Egypt')], scls: 'tx tx-m' });
  // bus to four
  s += line(cx, 220, cx, 244, 'ln');
  const xs = [43, 131, 219, 307];
  s += line(xs[0], 244, xs[3], 244, 'ln');
  xs.forEach(x => s += line(x, 244, x, 266, 'ln', `marker-end="url(#${id}-arr)"`));
  ['Sites', 'Workers', 'Staff', 'Partners'].forEach((n, i) => s += box(xs[i] - 40, 268, 80, 40, [L(n)]));
  return figure(svg({ w: W, h: 316, label: L('How money flows from the client to sites, workers, staff, and partners'), inner: s, id }), { cls: 'narrow' });
}

function render() {
  app.content.innerHTML = `
    <section id="flow">
      <h2>${L('The flow')}</h2>
      ${flow()}
      <p>${L('Every KMSC payment is on accepted hours, with the flagged hours taken out.')}</p>
      <ul class="rows">${m.flow.map(f => `<li><b>${L('{a} to {b}', { a: esc(f.from), b: esc(f.to) })}</b><span class="d">${esc(f.what)}.${f.terms ? ' ' + esc(f.terms) + '.' : ''}</span></li>`).join('')}</ul>
    </section>
    <section id="approval">
      <h2>${L('Second approval')}</h2>
      <div class="rule-band">
        <div><b>${esc(m.approval.rule)}</b></div>
        <div><b>${L('{a} prepares. {b} approves.', { a: esc(m.approval.prepares), b: esc(m.approval.approves) })}</b></div>
        <div><span>${esc(m.approval.note)}</span></div>
      </div>
    </section>
    <section id="monthend">
      <h2>${L('Month end, in this order')}</h2>
      <ol class="steps">${m.monthEnd.map((x, i) => `<li><span class="n${i === m.monthEnd.length - 1 ? ' end' : ''}">${i + 1}</span><b>${esc(x.step)}</b><span class="who">${esc(x.owner)}</span><div class="d">${esc(x.text)}</div></li>`).join('')}</ol>
    </section>
    ${blocks(m)}`;
}
render();
