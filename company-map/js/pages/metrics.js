import { mount, loadJSON, esc, labels } from '../app.js';
const L = await labels('metrics');

const app = await mount({
  page: 'metrics',
  title: L('What the numbers mean'),
  lede: L('One definition each, so everyone means the same thing by a number.')
});
const data = await loadJSON('data/metrics.json');

app.content.innerHTML = `
  <ul class="rows">${data.metrics.map(x => `<li id="${esc(x.id)}">
    <b>${esc(x.name)}</b>
    <span class="d" style="display:block">${esc(x.def)}</span>
    <span class="tiny" style="display:block;margin-top:6px"><span class="accent">${esc(L('How it is counted'))}.</span> <span class="mute">${esc(x.how)}</span></span>
    <span class="tiny" style="display:block;margin-top:4px"><span class="accent">${esc(L('Where it lives'))}.</span> <span class="mute">${esc(x.owner.replace(/\.+$/, ''))}.</span></span>
    <span class="tiny" style="display:block;margin-top:4px"><span class="accent">${esc(L('How to read it'))}.</span> <span class="mute">${esc(x.read)}</span></span>
  </li>`).join('')}</ul>`;
