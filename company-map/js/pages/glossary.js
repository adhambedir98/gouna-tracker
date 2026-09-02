import { mount, loadJSON, esc, site } from '../app.js';

const app = await mount({
  page: 'glossary',
  title: { en: 'Glossary and changelog' },
  lede: { en: 'The words we use, what changed, and who owns this map.' },
  toc: [{ id: 'terms', label: { en: 'Glossary' } }, { id: 'ownership', label: { en: 'Ownership' } }, { id: 'changelog', label: { en: 'Changelog' } }]
});
const data = await loadJSON('data/glossary.json');
const dateLabel = d => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

app.content.innerHTML = `
  <section id="terms">
    <h2>Glossary</h2>
    <dl class="def cols" style="border-top:1px solid var(--line);padding-top:4px">${data.terms.map(x => `<div><dt>${esc(x.term)}</dt><dd>${esc(x.def)}</dd></div>`).join('')}</dl>
  </section>
  <section id="ownership">
    <h2>Ownership</h2>
    <p>${esc(data.ownership)}</p>
    <p class="mute small">Content lives in JSON files under <span class="num">data/</span>. A name, a number, or a rule is a one-line edit. The site rebuilds itself on every push.</p>
  </section>
  <section id="changelog">
    <h2>Changelog</h2>
    <div class="t-wrap"><table class="t"><thead><tr><th>Version</th><th>Date</th><th>What changed</th></tr></thead><tbody>${data.changelog.map(c => `<tr><td class="num"><b>${esc(c.version)}</b></td><td style="white-space:nowrap">${esc(dateLabel(c.date))}</td><td>${esc(c.text)}</td></tr>`).join('')}</tbody></table></div>
    <p class="tiny dim">Current: version ${esc(site.version)}.</p>
  </section>`;
