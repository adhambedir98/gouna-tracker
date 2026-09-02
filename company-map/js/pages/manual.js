import { mount, loadJSON, esc, t, href, site } from '../app.js';

const app = await mount({
  page: 'manual',
  title: { en: 'Operating manual' },
  lede: { en: 'One page per subsystem. Same four blocks each: how it works, procedures with an owner, what breaks and what we do, training and questions.' }
});
const group = site.nav.find(g => g.items.some(i => i.path === 'manual'));
const pages = group.items.filter(i => i.path !== 'manual');
const loaded = await Promise.all(pages.map(async p => {
  try { return { ...p, m: await loadJSON(`data/${p.path}.json`) }; } catch { return { ...p, m: null }; }
}));

app.content.innerHTML = `
  <div class="cards two">${loaded.map(p => `<a class="card" href="${href(p.path)}"><h3>${esc(t(p.label))}</h3><p class="mute small">${esc(p.m ? p.m.purpose : 'Coming.')}</p>${p.m ? `<p class="tiny dim">${p.m.procedures.length} procedures, ${p.m.breaks.length} failure modes</p>` : ''}</a>`).join('')}</div>
  <section>
    <h2>How to read a page</h2>
    <ul class="rows">
      <li><b>How it works</b><span class="d">The mechanism and its numbers. If you only read one block, read this.</span></li>
      <li><b>Procedures</b><span class="d">Numbered steps with one owner each. Do them in order.</span></li>
      <li><b>What breaks, what we do</b><span class="d">The failure you are looking at and the response, with the owner and the clock.</span></li>
      <li><b>Training and questions</b><span class="d">Who learns what, and the questions people actually ask.</span></li>
    </ul>
  </section>`;
