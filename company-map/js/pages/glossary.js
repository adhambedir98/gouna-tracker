import { mount, loadJSON, esc, site, labels, lang } from '../app.js';
const L = await labels('glossary');

const app = await mount({
  page: 'glossary',
  title: L('Words and changes'),
  lede: L('The words we use, what changed, and who owns this map.'),
  toc: [{ id: 'terms', label: L('Glossary') }, { id: 'ownership', label: L('Ownership') }, { id: 'changelog', label: L('Changelog') }]
});
const data = await loadJSON('data/glossary.json');
const dateLabel = d => new Date(d + 'T00:00:00').toLocaleDateString(lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' });

app.content.innerHTML = `
  <section id="terms">
    <h2>${L('Glossary')}</h2>
    <dl class="def cols" style="border-top:1px solid var(--line)">${data.terms.map(x => `<div style="padding-top:14px"><dt style="margin-top:0">${esc(x.term)}</dt><dd>${esc(x.def)}</dd></div>`).join('')}</dl>
  </section>
  <section id="ownership">
    <h2>${L('Ownership')}</h2>
    <p>${esc(data.ownership)}</p>
    <p class="mute small">${L('Content lives in JSON files under {dir}. A name, a number, or a rule is a one-line edit. The site rebuilds itself on every push.', { dir: '<span class="num">data/</span>' })}</p>
  </section>
  <section id="changelog">
    <h2>${L('Changelog')}</h2>
    <dl class="changes">${data.changelog.map(c => `<dt><b>${esc(c.version)}</b> <span class="mute">${esc(dateLabel(c.date))}</span></dt><dd>${esc(c.text)}</dd>`).join('')}</dl>
    <p class="tiny dim">${L('Current: version {v}.', { v: esc(site.version) })}</p>
  </section>`;
