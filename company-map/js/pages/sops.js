import { mount, loadJSON, esc, t, site, href, labels } from '../app.js';

const L = await labels('sops');
const app = await mount({
  page: 'sops',
  title: L('Standard procedures'),
  lede: L('One page per job that has to be done the same way every time. Read it, do it once with your trainer, sign it.')
});
const index = await loadJSON('data/sops/index.json');
const navItems = site.nav.flatMap(g => g.items);
const labelOf = path => t((navItems.find(i => i.path === path) || {}).label) || path;
const sops = await Promise.all(index.groups.flatMap(g => g.sops).map(async s => { try { return [s, await loadJSON(`data/sops/${s}.json`)]; } catch { return [s, null]; } }));
const S = Object.fromEntries(sops);

app.content.innerHTML = index.groups.map(g => `
  <section id="${esc(g.id)}">
    <h2>${esc(g.role)}</h2>
    ${g.note ? `<p class="mute">${esc(g.note)}</p>` : ''}
    <div class="cards two">${g.sops.map(s => `<a class="card" href="${href('sops/' + s)}"><h3>${esc(S[s] ? S[s].title : labelOf('sops/' + s))}</h3>${S[s] ? `<p class="mute small purpose">${esc(S[s].purpose)}</p><p class="tiny accent when">${esc(S[s].when)}</p>` : ''}</a>`).join('')}</div>
  </section>`).join('');
