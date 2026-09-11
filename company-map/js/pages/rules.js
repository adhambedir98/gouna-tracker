import { mount, loadJSON, t, esc, onLang, href, site } from '../app.js';

const data = await loadJSON('data/rules.json');
const app = await mount({
  page: 'rules',
  title: { en: 'Rules', ar: 'القواعد' },
  lede: data.source,
  ar: true,
  toc: data.groups.map(g => ({ id: g.id, label: g.title }))
});
const ruleOf = id => data.rules.find(r => r.id === id);

function item(x) {
  if (x && typeof x === 'object' && x.lead) return `<li><b>${esc(t(x.lead))}.</b> ${esc(t(x.text))}</li>`;
  if (x && typeof x === 'object' && x.link) return `<li><a href="${href(x.link)}">${esc(t(x))}</a></li>`;
  return `<li>${esc(t(x))}</li>`;
}
// small drawings for right and wrong
const P = {
  hat: '<circle cx="32" cy="18" r="7"/><path d="M22 14h20"/><circle cx="32" cy="9" r="2.5" fill="currentColor"/><path d="M32 25v16M32 30l10 6M32 30l-10 6M32 41l-6 12M32 41l6 12"/><rect x="40" y="35" width="10" height="7"/>',
  stop: '<circle cx="32" cy="18" r="7"/><path d="M22 14h20"/><circle cx="32" cy="9" r="2.5" fill="currentColor"/><path d="M32 25v16M32 41l-6 12M32 41l6 12M32 30l-11 4"/><rect x="40" y="26" width="14" height="14"/><rect x="45" y="31" width="4" height="4" fill="currentColor"/>',
  restart: '<path d="M44 32a12 12 0 1 1-4-9"/><path d="M40 16l4 7-8 1"/><text x="32" y="36" font-size="10" text-anchor="middle" fill="currentColor" stroke="none" font-weight="600">30</text>',
  still: '<circle cx="32" cy="18" r="7"/><path d="M22 14h20"/><circle cx="32" cy="9" r="2.5" fill="currentColor"/><path d="M32 25v18M32 43l-5 12M32 43l5 12M32 29l-7 12M32 29l7 12"/><path d="M48 24v10M53 24v10"/>',
  chest: '<circle cx="32" cy="18" r="7"/><path d="M32 25v18M32 43l-5 12M32 43l5 12M32 29l-8 10M32 29l8 10"/><circle cx="32" cy="33" r="3" fill="currentColor"/><path d="M14 46v-4l8-6M14 46h-3M14 46h3" stroke-width="1.5"/>',
  screen: '<rect x="16" y="16" width="32" height="22"/><path d="M32 38v8M24 46h16"/><path d="M22 26l6 5 8-9"/>'
};
const pict = (k, good) => `<svg class="rwpict ${good ? 'good' : 'bad'}" viewBox="0 0 64 64" aria-hidden="true">${P[k] || ''}<g class="mark">${good ? '<circle cx="54" cy="54" r="8"/><path d="M50 54l3 3 5-6"/>' : '<circle cx="54" cy="54" r="8"/><path d="M50.5 50.5l7 7M57.5 50.5l-7 7"/>'}</g></svg>`;
function visual(v) {
  const col = (list, good, title) => `<div class="rw ${good ? 'right' : 'wrong'}"><h4>${esc(t(title))}</h4>${list.map(x => `<div class="rw-item">${pict(x.pict, good)}<span>${esc(t(x))}</span></div>`).join('')}</div>`;
  return `<div class="rightwrong">${col(v.right, true, { en: 'Right', ar: 'صحيح' })}${col(v.wrong, false, { en: 'Wrong', ar: 'خطأ' })}</div>`;
}
function table(tb) {
  // the first column is text, the rest are amounts; a row with one value fewer than the columns puts that value across the remaining columns, centred
  const cell = (c, i, row) => (i === row.length - 1 && row.length < tb.columns.length) ? `<td colspan="${tb.columns.length - row.length + 1}" class="center">${esc(t(c))}</td>` : `<td${i ? ' class="num"' : ''}>${esc(t(c))}</td>`;
  return `<div class="t-wrap"><table class="t"><thead><tr>${tb.columns.map((c, i) => `<th${i ? ' class="num"' : ''}>${esc(t(c))}</th>`).join('')}</tr></thead><tbody>${tb.rows.map(row => `<tr>${row.map((c, i) => cell(c, i, row)).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function rule(r, hideTitle, wide) {
  return `<article class="rule card${wide ? ' wide' : ''}" id="${esc(r.id)}">
    ${hideTitle ? '' : `<h3>${esc(t(r.title))}</h3>`}
    ${r.intro ? `<p class="mute">${esc(t(r.intro))}</p>` : ''}
    ${r.visual ? visual(r.visual) : ''}
    ${r.sub ? `<p><b>${esc(t(r.sub))}</b></p>` : ''}
    ${r.items ? `<ul>${r.items.map(item).join('')}</ul>` : ''}
    ${r.table ? table(r.table) : ''}
    ${r.outro ? `<p class="mute">${esc(t(r.outro))}</p>` : ''}
  </article>`;
}
function group(g) {
  const rules = g.rules.map(ruleOf);
  // a card with a table or a drawing spans the row; so does a half-width card left alone on the last row
  let half = 0;
  const cards = rules.map((r, i) => {
    const wide = !!(r.table || r.visual);
    half = wide ? 0 : half + 1;
    return rule(r, rules.length === 1 && t(r.title) === t(g.title), wide || (i === rules.length - 1 && half % 2 === 1));
  });
  return `<section id="${esc(g.id)}"><h2>${esc(t(g.title))}</h2><div class="rules grid-2">${cards.join('')}</div></section>`;
}

function render() {
  app.content.innerHTML = `
    ${data.groups.map(group).join('')}
    <div class="btn-row no-print"><button type="button" class="btn primary" data-print>${esc(t(site.ui.print))}</button></div>`;
}
render();
onLang(render);
