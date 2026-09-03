import { mount, loadJSON, esc, t, href, site, labels } from '../app.js';
const L = await labels('manual');

const app = await mount({
  page: 'manual',
  title: L('How things work'),
  lede: L('One page per subsystem. Same four blocks each: how it works, procedures with an owner, what breaks and what we do, training and questions.')
});
const group = site.nav.find(g => g.items.some(i => i.path === 'manual'));
const pages = group.items.filter(i => i.path !== 'manual');
const loaded = await Promise.all(pages.map(async p => {
  try { return { ...p, m: await loadJSON(`data/${p.path}.json`) }; } catch { return { ...p, m: null }; }
}));

app.content.innerHTML = `
  <div class="cards two">${loaded.map(p => `<a class="card" href="${href(p.path)}"><h3>${esc(t(p.label))}</h3><p class="mute small">${esc(p.m ? p.m.purpose : L('Coming.'))}</p>${p.m ? `<p class="tiny dim">${L('{p} procedures, {b} failure modes', { p: p.m.procedures.length, b: p.m.breaks.length })}</p>` : ''}</a>`).join('')}</div>
  <section>
    <h2>${L('How to read a page')}</h2>
    <ul class="rows">
      <li><b>${L('How it works')}</b><span class="d">${L('The mechanism and its numbers. If you only read one block, read this.')}</span></li>
      <li><b>${L('Procedures')}</b><span class="d">${L('Numbered steps with one owner each. Do them in order.')}</span></li>
      <li><b>${L('What breaks, what we do')}</b><span class="d">${L('The failure you are looking at and the response, with the owner and the clock.')}</span></li>
      <li><b>${L('Training and questions')}</b><span class="d">${L('Who learns what, and the questions people actually ask.')}</span></li>
    </ul>
  </section>`;
