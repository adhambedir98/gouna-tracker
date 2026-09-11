import { mount, loadJSON, esc, t, site, href, labels } from '../app.js';

const L = await labels('jobs');
const app = await mount({
  page: 'jobs',
  title: L('Jobs'),
  lede: L('One page per job: the handbook, the posting for job boards, and the offer letter.')
});
const index = await loadJSON('data/jobs/index.json');
const navItems = site.nav.flatMap(g => g.items);
const labelOf = path => t((navItems.find(i => i.path === path) || {}).label) || path;
const jobs = await Promise.all(index.groups.flatMap(g => g.jobs).map(async s => { try { return [s, await loadJSON(`data/jobs/${s}.json`)]; } catch { return [s, null]; } }));
const J = Object.fromEntries(jobs);

app.content.innerHTML = index.groups.map(g => `
  <section id="${esc(g.id)}">
    <h2>${esc(t(g.team))}</h2>
    ${g.note ? `<p class="mute">${esc(t(g.note))}</p>` : ''}
    <div class="cards two">${g.jobs.map(s => `<a class="card" href="${href('jobs/' + s)}"><h3>${esc(J[s] ? J[s].title : labelOf('jobs/' + s))}</h3>${J[s] ? `<p class="mute small" style="margin:6px 0 0">${esc(J[s].summary)}</p><p class="tiny accent" style="margin:auto 0 0;padding-top:8px">${L('Reports to')} ${esc(J[s].boss.replace(/^The /, 'the '))}</p>` : ''}</a>`).join('')}</div>
  </section>`).join('');
