import { mount, loadJSON, esc, t, href, site, labels } from '../app.js';
const L = await labels('manual');

const app = await mount({
  page: 'manual',
  title: L('How things work'),
  lede: L('One page per subsystem: how it works, the procedures, problems and what to do, and questions.')
});
const group = site.nav.find(g => g.items.some(i => i.path === 'manual'));
const pages = group.items.filter(i => i.path !== 'manual');
const loaded = await Promise.all(pages.map(async p => {
  try { return { ...p, m: await loadJSON(`data/${p.path}.json`) }; } catch { return { ...p, m: null }; }
}));

const decisions = await loadJSON('data/decisions.json').catch(() => ({ items: [] }));

app.content.innerHTML = `
  <div class="cards two">${loaded.map(p => `<a class="card" href="${href(p.path)}"><h3>${esc(t(p.label))}</h3><p class="mute small">${esc(p.m ? p.m.purpose : L('Coming.'))}</p></a>`).join('')}</div>
  ${(decisions.items || []).length ? `<section class="callout" id="decisions" style="margin-top:28px"><h2 style="margin-bottom:4px">${esc(L('Open decisions'))}</h2><p class="mute small">${esc(L('Decided soon. Each one comes off this list when it is settled.'))}</p><ul>${decisions.items.map(d => `<li>${esc(t(d))}</li>`).join('')}</ul></section>` : ''}`;
