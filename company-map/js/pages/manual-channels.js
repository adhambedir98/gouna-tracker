import { mount, loadJSON, esc, fmt, href, labels } from '../app.js';
import { blocks, MANUAL_TOC } from '../manual-blocks.js';
import { svg, rect, text, line, figure } from '../svg.js';
const L = await labels('manual-channels');

const m = await loadJSON('data/manual/channels.json');
const app = await mount({
  page: 'manual-channels',
  title: { en: m.title },
  lede: { en: m.purpose },
  toc: [{ id: 'partners', label: L('The channels') }, { id: 'agreement', label: L('The agreement') }, ...MANUAL_TOC]
});

function phonesChart() {
  const W = 360, rowH = 34, left = 118, maxW = 150;
  const rows = m.partners;
  const max = Math.max(...rows.map(r => r.phones || 0));
  let s = '';
  rows.forEach((r, i) => {
    const y = 8 + i * rowH;
    s += text(0, y + 15, r.name, { cls: 'tx' });
    if (r.phones) {
      const w = Math.round(r.phones / max * maxW);
      s += rect(left, y + 3, w, 18, i === 0 ? 'bx-acc' : 'bx-acc-line');
      s += text(left + w + 8, y + 16, L('{n} phones', { n: fmt(r.phones) }), { cls: 'tx tx-m' });
    } else {
      s += rect(left, y + 3, 40, 18, 'bx', 'stroke-dasharray="3 3"');
      s += text(left + 48, y + 16, L('set per site'), { cls: 'tx tx-d' });
    }
  });
  return figure(svg({ w: W, h: 8 + rows.length * rowH + 4, label: L('Phones per channel'), inner: s }), { cls: 'narrow' });
}

function render() {
  app.content.innerHTML = `
    <section id="partners">
      <h2>${L('The channels')}</h2>
      ${phonesChart()}
      <ul class="rows">${m.partners.map(p => `<li><b>${esc(p.name)}</b><span class="d">${esc(p.where)}. ${esc(p.model)}</span></li>`).join('')}</ul>
      <p class="mute small"><a href="${href('channels')}">${L('The diagram: two channels, one spine')}</a></p>
    </section>
    <section id="agreement">
      <h2>${L('The standard partner agreement')}</h2>
      <p class="mute">${L('Seven terms, the same for every partner. Nobody edits a term in the field.')}</p>
      <ol class="steps">${m.agreement.map((a, i) => `<li><span class="n">${i + 1}</span><b>${esc(a.term)}</b><div class="d">${esc(a.text)}</div></li>`).join('')}</ol>
    </section>
    ${blocks(m)}`;
}
render();
