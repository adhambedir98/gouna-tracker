import { mount, loadJSON, t, esc, onLang, site } from '../app.js';

const app = await mount({
  page: 'never',
  title: { en: 'Things we never do', ar: 'أشياء لا نفعلها أبدًا' },
  lede: { en: 'Six lines. No exceptions.', ar: 'ستة بنود. بلا استثناء.' },
  ar: true
});
const data = await loadJSON('data/never.json');
const ui = k => t(site.ui[k]);

function render() {
  app.content.innerHTML = `
    ${t(data.intro) ? `<p class="mute">${esc(t(data.intro))}</p>` : ''}
    <div class="never-grid">${data.items.map((it, i) => `<div class="never-card${it.big ? ' big' : ''}"><span class="k">${i + 1}</span><b>${esc(t(it.never))}</b><span class="d">${esc(t(it.why))}</span></div>`).join('')}</div>
    <p class="callout" style="margin-top:24px">${esc(t(data.closing))}</p>
    <div class="btn-row no-print"><button type="button" class="btn" data-print>${esc(ui('print'))}</button></div>`;
}
render();
onLang(render);
