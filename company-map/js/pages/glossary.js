import { mount, loadJSON, esc, site, labels, lang } from '../app.js';
const L = await labels('glossary');

const app = await mount({
  page: 'glossary',
  title: L('Glossary and changelog'),
  lede: L('The words we use, what changed, and who owns this map.'),
  toc: [{ id: 'terms', label: L('Glossary') }, { id: 'ownership', label: L('Ownership') }, { id: 'changelog', label: L('Changelog') }]
});
const data = await loadJSON('data/glossary.json');
const dateLabel = d => new Date(d + 'T00:00:00').toLocaleDateString(lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' });

app.content.innerHTML = `
  <section id="terms">
    <h2>${L('Glossary')}</h2>
    <dl class="def cols" style="border-top:1px solid var(--line);padding-top:4px">${data.terms.map(x => `<div><dt>${esc(x.term)}</dt><dd>${esc(x.def)}</dd></div>`).join('')}</dl>
  </section>
  <section id="ownership">
    <h2>${L('Ownership')}</h2>
    <p>${esc(data.ownership)}</p>
    <p class="mute small">${L('Content lives in JSON files under {dir}. A name, a number, or a rule is a one-line edit. The site rebuilds itself on every push.', { dir: '<span class="num">data/</span>' })}</p>
  </section>
  <section id="changelog">
    <h2>${L('Changelog')}</h2>
    <div class="t-wrap"><table class="t"><thead><tr><th>${L('Version')}</th><th>${L('Date')}</th><th>${L('What changed')}</th></tr></thead><tbody>${data.changelog.map(c => `<tr><td class="num"><b>${esc(c.version)}</b></td><td style="white-space:nowrap">${esc(dateLabel(c.date))}</td><td>${esc(c.text)}</td></tr>`).join('')}</tbody></table></div>
    <p class="tiny dim">${L('Current: version {v}.', { v: esc(site.version) })}</p>
  </section>`;
