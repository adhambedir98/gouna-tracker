import { mount, loadJSON, esc, labels } from '../app.js';
const L = await labels('risks');

const app = await mount({
  page: 'risks',
  title: L('What could go wrong'),
  lede: L('The ten risks that can lose the client. Each has the control that prevents it, an owner, and the signal that shows it early.')
});
const data = await loadJSON('data/risks.json');

app.content.innerHTML = `
  <ol class="steps" style="max-width:none">${data.risks.map(r => `<li id="${esc(r.id)}">
    <span class="n">${r.n}</span>
    <b>${esc(r.risk)}</b>
    <span class="who">${esc(r.owner)}</span>
    <div class="d"><span class="mute">${esc(r.ends)}</span></div>
    <div class="d" style="color:var(--ink);margin-top:6px"><b style="display:inline;padding:0">${L('Control.')}</b> ${esc(r.control)}</div>
    <div class="d tiny accent" style="margin-top:4px">${L('Signal:')} ${esc(r.signal)}</div>
  </li>`).join('')}</ol>`;
