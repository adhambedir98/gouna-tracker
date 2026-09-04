import { mount, loadJSON, t, esc, onLang, site } from '../app.js';

const app = await mount({
  page: 'never',
  title: { en: 'Things we never do', ar: 'أشياء لا نفعلها أبدًا' },
  lede: { en: 'Eight lines. No exceptions.', ar: 'ثمانية بنود. بلا استثناء.' },
  ar: true
});
const data = await loadJSON('data/never.json');
const ui = k => t(site.ui[k]);

function render() {
  app.content.innerHTML = `
    ${t(data.intro) ? `<p class="mute">${esc(t(data.intro))}</p>` : ''}
    <ol class="rows never">${data.items.map((it, i) => `<li><b>${esc(t(it.never))}</b><span class="d">${esc(t(it.why))}</span></li>`).join('')}</ol>
    <p class="callout" style="margin-top:24px">${esc(t(data.closing))}</p>
    <div class="btn-row no-print"><button type="button" class="btn" data-print>${esc(ui('print'))}</button></div>`;
}
render();
onLang(render);
