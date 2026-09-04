import { mount, loadJSON, t, esc, onLang } from '../app.js';

const app = await mount({
  page: 'rules',
  title: { en: 'Rules', ar: 'القواعد' },
  lede: { en: 'From the KMSC Employee Handbook. Everyone signs it.', ar: 'من دليل موظفي KMSC. الجميع يوقّع عليه.' },
  ar: true,
  toc: []
});
const data = await loadJSON('data/rules.json');
const ruleOf = id => data.rules.find(r => r.id === id);

function item(x) {
  if (x && typeof x === 'object' && x.lead) return `<li><b>${esc(t(x.lead))}.</b> ${esc(t(x.text))}</li>`;
  return `<li>${esc(t(x))}</li>`;
}
function table(tb) {
  return `<div class="t-wrap"><table class="t"><thead><tr>${tb.columns.map(c => `<th>${esc(t(c))}</th>`).join('')}</tr></thead><tbody>${tb.rows.map(r => `<tr>${r.map((c, i) => `<td>${i === 0 ? '' : ''}${esc(t(c))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
// a rule whose items all carry a lead (the fraud list) becomes a grid of small cards
function leadGrid(items) {
  return `<div class="lead-grid">${items.map(x => `<div><b>${esc(t(x.lead))}</b><span>${esc(t(x.text))}</span></div>`).join('')}</div>`;
}
function rule(r, hideTitle) {
  const leads = r.items && r.items.length > 2 && r.items.every(x => x && typeof x === 'object' && x.lead);
  const wide = leads || r.table;
  return `<article class="rule card${wide ? ' wide' : ''}" id="${esc(r.id)}">
    ${hideTitle ? '' : `<h3>${esc(t(r.title))}</h3>`}
    ${r.intro ? `<p class="mute">${esc(t(r.intro))}</p>` : ''}
    ${r.sub ? `<p><b>${esc(t(r.sub))}</b></p>` : ''}
    ${r.items ? (leads ? leadGrid(r.items) : `<ul>${r.items.map(item).join('')}</ul>`) : ''}
    ${r.table ? table(r.table) : ''}
    ${r.outro ? `<p class="mute">${esc(t(r.outro))}</p>` : ''}
  </article>`;
}

function render() {
  app.content.innerHTML = `
    <nav class="toc no-print" aria-label="Groups">${data.groups.map(g => `<a href="#${esc(g.id)}">${esc(t(g.title))}</a>`).join('')}</nav>
    ${data.groups.map(g => `<section id="${esc(g.id)}"><h2>${esc(t(g.title))}</h2><div class="rules grid-2">${g.rules.map(id => { const r = ruleOf(id); return rule(r, g.rules.length === 1 && t(r.title) === t(g.title)); }).join('')}</div></section>`).join('')}
    <div class="btn-row no-print"><button type="button" class="btn" data-print>${esc(t({ en: 'Print', ar: 'اطبع' }))}</button></div>`;
}
render();
onLang(render);
