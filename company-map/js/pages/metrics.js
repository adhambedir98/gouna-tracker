import { mount, loadJSON, esc } from '../app.js';

const app = await mount({
  page: 'metrics',
  title: { en: 'Metrics and definitions' },
  lede: { en: 'One line each, so everyone means the same thing by a number.' }
});
const data = await loadJSON('data/metrics.json');

app.content.innerHTML = `
  <ul class="rows">${data.metrics.map(x => `<li id="${esc(x.id)}">
    <b>${esc(x.name)}</b>
    <span class="d" style="display:block">${esc(x.def)}</span>
    <span class="tiny accent" style="display:block;margin-top:4px">${esc(x.how)}</span>
    <span class="tiny mute" style="display:block;margin-top:2px">${esc(x.owner.replace(/\.+$/, ''))}.</span>
    <span class="tiny mute" style="display:block;margin-top:2px">${esc(x.read)}</span>
  </li>`).join('')}</ul>`;
