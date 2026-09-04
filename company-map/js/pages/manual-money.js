import { mount, loadJSON, esc, labels } from '../app.js';
import { blocks, MANUAL_TOC } from '../manual-blocks.js';
import { svg, rect, text, line, box, figure, wrap } from '../svg.js';
const L = await labels('manual-money');

const m = await loadJSON('data/manual/money.json');
const app = await mount({
  page: 'manual-money',
  title: { en: m.title },
  lede: { en: m.purpose },
  toc: [{ id: 'flow', label: L('The flow') }, { id: 'approval', label: L('Second approval') }, { id: 'monthend', label: L('Month end') }, ...MANUAL_TOC]
});

function flow() {
  const W = 360, id = 'money';
  const [US, EG] = m.flow;
  let s = '';
  s += box(105, 8, 150, 44, [L('The client')], { cls: 'bx-acc', tcls: 'tx tx-b tx-p' });
  s += line(180, 52, 180, 90, 'ln-acc', `marker-end="url(#${id}-arr-acc)"`);
  s += text(190, 66, US.what, { cls: 'tx tx-s' });
  s += text(190, 80, US.terms, { cls: 'tx tx-s tx-a tx-b' });
  s += box(105, 92, 150, 44, [L('The US company')], { cls: 'bx-acc-line', tcls: 'tx tx-b tx-a' });
  s += line(180, 136, 180, 174, 'ln-acc', `marker-end="url(#${id}-arr-acc)"`);
  s += text(190, 150, EG.what, { cls: 'tx tx-s' });
  s += text(190, 164, EG.terms, { cls: 'tx tx-s tx-a' });
  s += box(105, 176, 150, 44, ['KMSC'], { cls: 'bx-acc-line', tcls: 'tx tx-b tx-a', sub: [L('Egypt')] });
  // the note sits beside the box, so it wraps to the space that is left
  s += text(262, 188, wrap(L('Ahmed Alaa prepares, Adham approves'), 15), { cls: 'tx tx-s tx-m', lh: 13 });
  // bus to four
  s += line(180, 220, 180, 244, 'ln');
  const xs = [46, 135, 225, 314];
  s += line(xs[0], 244, xs[3], 244, 'ln');
  xs.forEach(x => s += line(x, 244, x, 266, 'ln', `marker-end="url(#${id}-arr)"`));
  ['Sites', 'Workers', 'Staff', 'Partners'].forEach((n, i) => s += box(xs[i] - 40, 268, 80, 40, [L(n)]));
  // the band
  s += rect(6, 322, 348, 40, 'bx-soft');
  s += text(180, 339, L('All paid on accepted hours,'), { cls: 'tx tx-b tx-a', anchor: 'middle' });
  s += text(180, 354, L('net of fraud flags, the same way the company is paid'), { cls: 'tx tx-s tx-a', anchor: 'middle' });
  return figure(svg({ w: W, h: 370, label: L('How money flows from the client to sites, workers, staff, and partners'), inner: s, id }), { cls: 'narrow' });
}

function render() {
  app.content.innerHTML = `
    <section id="flow">
      <h2>${L('The flow')}</h2>
      ${flow()}
      <ul class="rows">${m.flow.map(f => `<li><b>${L('{a} to {b}', { a: esc(f.from), b: esc(f.to) })}</b><span class="d">${esc(f.what)}. ${esc(f.terms)}.</span></li>`).join('')}</ul>
      <p class="big-rule">${esc(m.principle)}</p>
    </section>
    <section id="approval">
      <h2>${L('Second approval')}</h2>
      <div class="rule-band">
        <div><b>${esc(m.approval.rule)}</b></div>
        <div><b>${L('{a} prepares. {b} approves.', { a: esc(m.approval.prepares), b: esc(m.approval.approves) })}</b><span>${L('Both names on the record before money moves.')}</span></div>
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
