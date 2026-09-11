// Systems: the tools that run the operation, what each one does, who runs it, and where it stands. Content in data/systems.json.
import { mount, loadJSON, esc, labels, detailsHTML } from '../app.js';

const L = await labels('systems');
const data = await loadJSON('data/systems.json');
const app = await mount({ page: 'systems', title: L('Systems'), lede: data.purpose || L('The tools that run the operation: what each one does, who runs it, and where it stands.') });

const STATUS = { Live: L('Live'), 'Being built': L('Being built'), 'Rolling out': L('Rolling out') };
const cls = { Live: 'st-active', 'Being built': 'st-open', 'Rolling out': 'st-ready' };

app.content.innerHTML = `
  <div class="cards two">${(data.tools || []).map(t => `<div class="card" id="${esc(t.id)}">
    <h3>${esc(t.name)}</h3>
    <p>${esc(t.what)}</p>
    <ul>${(t.lines || []).map(l => `<li>${esc(l)}</li>`).join('')}</ul>
    <p class="tiny mute"><span>${esc(L('Runs it'))}: ${esc(t.owner)}</span> <span class="pill ${cls[t.status] || ''}">${esc(STATUS[t.status] || t.status)}</span></p>
  </div>`).join('')}</div>
  ${(data.rules || []).length ? `<section><h2>${esc(L('The rules'))}</h2><ul class="rows">${data.rules.map(r => `<li>${esc(r)}</li>`).join('')}</ul></section>` : ''}
  ${(data.faq || []).length ? `<section><h2>${esc(L('Frequently asked questions'))}</h2>${data.faq.map((q, i) => detailsHTML({ id: 'q' + i, title: q.q, body: `<p>${esc(q.a)}</p>` })).join('')}</section>` : ''}`;
