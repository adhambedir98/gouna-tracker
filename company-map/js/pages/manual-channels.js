import { mount, loadJSON, esc, fmt, href } from '../app.js';
import { blocks, MANUAL_TOC } from '../manual-blocks.js';
import { svg, rect, text, line, figure } from '../svg.js';

const m = await loadJSON('data/manual/channels.json');
const app = await mount({
  page: 'manual-channels',
  title: { en: m.title },
  lede: { en: m.purpose },
  toc: [{ id: 'partners', label: { en: 'The channels' } }, { id: 'agreement', label: { en: 'The agreement' } }, ...MANUAL_TOC]
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
      s += text(left + w + 8, y + 16, `${fmt(r.phones)} phones`, { cls: 'tx tx-m tx-s' });
    } else {
      s += rect(left, y + 3, 40, 18, 'bx', 'stroke-dasharray="3 3"');
      s += text(left + 48, y + 16, 'set per site', { cls: 'tx tx-d tx-s' });
    }
  });
  return figure(svg({ w: W, h: 8 + rows.length * rowH + 4, label: 'Phones per channel', inner: s }), { cls: 'narrow' });
}

function render() {
  app.content.innerHTML = `
    <section id="partners">
      <h2>The channels</h2>
      ${phonesChart()}
      <ul class="rows">${m.partners.map(p => `<li><b>${esc(p.name)}</b><span class="d">${esc(p.who)}. ${esc(p.where)}. ${esc(p.model)}.</span></li>`).join('')}</ul>
      <p><a class="btn" href="${href('channels')}">The diagram: three channels, one spine</a></p>
    </section>
    <section id="agreement">
      <h2>The standard partner agreement</h2>
      <p class="mute">Seven terms, the same for every partner. Nobody edits a term in the field.</p>
      <ol class="steps">${m.agreement.map((a, i) => `<li><span class="n">${i + 1}</span><b>${esc(a.term)}</b><div class="d">${esc(a.text)}</div></li>`).join('')}</ol>
    </section>
    ${blocks(m)}`;
}
render();
