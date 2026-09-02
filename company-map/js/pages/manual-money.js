import { mount, loadJSON, esc } from '../app.js';
import { blocks, MANUAL_TOC } from '../manual-blocks.js';
import { svg, rect, text, line, box, figure } from '../svg.js';

const m = await loadJSON('data/manual/money.json');
const app = await mount({
  page: 'manual-money',
  title: { en: m.title },
  lede: { en: m.purpose },
  toc: [{ id: 'flow', label: { en: 'The flow' } }, { id: 'approval', label: { en: 'Second approval' } }, { id: 'monthend', label: { en: 'Month end' } }, ...MANUAL_TOC]
});

function flow() {
  const W = 360, id = 'money';
  const F = Object.fromEntries(m.flow.map(f => [f.to, f]));
  let s = '';
  s += box(105, 8, 150, 44, ['The client'], { cls: 'bx-acc', tcls: 'tx tx-b tx-p' });
  s += line(180, 52, 180, 90, 'ln-acc', `marker-end="url(#${id}-arr-acc)"`);
  s += text(190, 66, F.Vound.what, { cls: 'tx tx-s' });
  s += text(190, 80, F.Vound.terms, { cls: 'tx tx-s tx-a tx-b' });
  s += box(105, 92, 150, 44, ['Vound'], { cls: 'bx-acc-line', tcls: 'tx tx-b tx-a', sub: ['United States'] });
  s += line(180, 136, 180, 174, 'ln-acc', `marker-end="url(#${id}-arr-acc)"`);
  s += text(190, 150, F.KMSC.what, { cls: 'tx tx-s' });
  s += text(190, 164, F.KMSC.terms, { cls: 'tx tx-s tx-a' });
  s += box(105, 176, 150, 44, ['KMSC'], { cls: 'bx-acc-line', tcls: 'tx tx-b tx-a', sub: ['Egypt'] });
  s += text(98, 200, 'Mano prepares', { cls: 'tx tx-s tx-m', anchor: 'end' });
  s += text(98, 213, 'Adham signs second', { cls: 'tx tx-s tx-m', anchor: 'end' });
  // bus to four
  s += line(180, 220, 180, 244, 'ln');
  const xs = [46, 135, 225, 314];
  s += line(xs[0], 244, xs[3], 244, 'ln');
  xs.forEach(x => s += line(x, 244, x, 266, 'ln', `marker-end="url(#${id}-arr)"`));
  ['Sites', 'Workers', 'Staff', 'Partners'].forEach((n, i) => s += box(xs[i] - 40, 268, 80, 40, [n]));
  // the band
  s += rect(6, 322, 348, 40, 'bx-soft');
  s += text(180, 339, 'All paid on accepted hours,', { cls: 'tx tx-b tx-a', anchor: 'middle' });
  s += text(180, 354, 'net of fraud flags, the same way the company is paid', { cls: 'tx tx-s tx-a', anchor: 'middle' });
  return figure(svg({ w: W, h: 370, label: 'How money flows from the client to sites, workers, staff, and partners', inner: s, id }), { cls: 'narrow' });
}

function render() {
  app.content.innerHTML = `
    <section id="flow">
      <h2>The flow</h2>
      ${flow()}
      <ul class="rows">${m.flow.map(f => `<li><b>${esc(f.from)} to ${esc(f.to)}</b><span class="d">${esc(f.what)}. ${esc(f.terms)}.</span></li>`).join('')}</ul>
      <p class="big-rule">${esc(m.principle)}</p>
    </section>
    <section id="approval">
      <h2>Second approval</h2>
      <div class="rule-band">
        <div><b>${esc(m.approval.rule)}</b></div>
        <div><b>${esc(m.approval.prepares)} prepares. ${esc(m.approval.approves)} approves.</b><span>Both names on the record before money moves.</span></div>
        <div><span>${esc(m.approval.note)}</span></div>
      </div>
    </section>
    <section id="monthend">
      <h2>Month end, in this order</h2>
      <ol class="steps">${m.monthEnd.map((x, i) => `<li><span class="n${i === m.monthEnd.length - 1 ? ' end' : ''}">${i + 1}</span><b>${esc(x.step)}</b><span class="who">${esc(x.owner)}</span><div class="d">${esc(x.text)}</div></li>`).join('')}</ol>
    </section>
    ${blocks(m)}`;
}
render();
