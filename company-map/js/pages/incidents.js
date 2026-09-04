import { mount, loadJSON, esc, site, t, initialHash, setHash, labels } from '../app.js';
const L = await labels('incidents');

const app = await mount({
  page: 'incidents',
  title: L('When something goes wrong'),
  lede: L('Pick the incident. Do the steps in order. Every playbook ends with who is told and by when.')
});
const data = await loadJSON('data/incidents.json');
const ui = k => t(site.ui[k]);
const h0 = initialHash();
let id = (h0 && data.playbooks.find(p => p.id === h0)) ? h0 : null;

function playbook(p) {
  return `<section id="playbook" class="card panel" aria-live="polite">
    <h2>${esc(p.title)}</h2>
    <p class="big-rule" style="margin-top:8px">${esc(p.first)}</p>
    <ol class="steps">${p.steps.map((s, i) => `<li><span class="n">${i + 1}</span><b>${esc(s.do)}</b><span class="who">${esc(s.owner)}</span><span class="clock">${esc(s.clock)}</span></li>`).join('')}</ol>
    <h3>${L('Who is told, by when')}</h3>
    <dl class="kv">${p.tell.map(x => `<dt class="k">${esc(x.by)}</dt><dd class="v"><b>${esc(x.who)}</b></dd>`).join('')}</dl>
    ${p.never ? `<p class="callout" style="margin-top:18px"><b>${L('Never.')}</b> ${esc(p.never)}</p>` : ''}
    <div class="btn-row no-print"><button type="button" class="btn" data-print>${esc(ui('print'))}</button></div>
  </section>`;
}

function render(scroll) {
  const p = id ? data.playbooks.find(x => x.id === id) : null;
  app.content.innerHTML = `
    <section id="pick">
      <div class="choices">${data.playbooks.map(x => `<button type="button" data-pb="${x.id}" class="${x.id === id ? 'on' : ''}">${esc(x.title)}</button>`).join('')}</div>
    </section>
    ${p ? playbook(p) : `<p class="mute" style="margin-top:20px">${L('Nine playbooks. Each one: the first thing to do, the steps with an owner and a clock, and who is told.')}</p>`}
    <div class="print-only">${data.playbooks.filter(x => x.id !== id).map(playbook).join('')}</div>`;
  if (scroll && p && window.innerWidth < 1024) document.getElementById('playbook')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
render(false);
document.addEventListener('click', e => {
  const b = e.target.closest('[data-pb]'); if (!b) return;
  id = b.dataset.pb; setHash(id); render(true);
});
