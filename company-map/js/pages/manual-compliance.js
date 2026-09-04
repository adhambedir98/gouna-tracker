import { mount, loadJSON, esc, t, href, labels } from '../app.js';
import { blocks, MANUAL_TOC } from '../manual-blocks.js';
import { svg, rect, text, line, figure } from '../svg.js';
const L = await labels('manual-compliance');

const m = await loadJSON('data/manual/compliance.json');
const gate = await loadJSON('data/gate.json');
const app = await mount({
  page: 'manual-compliance',
  title: { en: m.title },
  lede: { en: m.purpose },
  toc: [{ id: 'gate', label: L('The gate') }, { id: 'breach', label: L('Breach clocks') }, ...MANUAL_TOC]
});

/* ---------- breach clocks ---------- */
function clocks() {
  const W = 360, id = 'clk';
  let s = '';
  s += text(8, 16, L('We know'), { cls: 'tx tx-b' });
  s += line(8, 22, 8, 108, 'ln-ink');
  [24, 48, 72].forEach(h => { const x = 8 + h * 4.4; s += line(x, 22, x, 108, 'ln-soft'); s += text(x, 118, L('{h} h', { h }), { cls: 'tx tx-d tx-s', anchor: 'middle' }); });
  s += rect(8, 32, 24 * 4.4, 20, 'bx-acc');
  s += text(8 + 24 * 4.4 + 8, 46, L('The client, 24 hours. Adham.'), { cls: 'tx tx-b' });
  s += rect(8, 70, 72 * 4.4, 20, 'bx-acc-line');
  s += text(14, 84, L('The regulator, 72 hours. Mano with counsel.'), { cls: 'tx tx-b tx-a' });
  return figure(svg({ w: W, h: 126, label: L('Two breach clocks'), inner: s, id }), { cls: 'narrow' });
}

function render() {
  app.content.innerHTML = `
    <section id="gate">
      <h2>${L('The gate')}</h2>
      <p class="mute">${esc(m.gateNote)}</p>
      <ol class="rows">${gate.items.map(g => `<li>${esc(t(g.short))}<span class="d"> ${esc(t(g.s))}</span></li>`).join('')}</ol>
      <p><a class="btn" href="${href('onboarding')}">${L('Open onboarding screening')}</a></p>
    </section>
    <section id="breach">
      <h2>${L('Breach clocks')}</h2>
      ${clocks()}
      <p>${esc(m.breach.text)}</p>
      <p class="mute small">${esc(m.breach.owner)}</p>
    </section>
    ${blocks(m)}`;
}
render();

