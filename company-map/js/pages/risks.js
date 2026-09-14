import { mount, loadJSON, esc, labels } from '../app.js';
const L = await labels('risks');

const app = await mount({
  page: 'risks',
  title: L('What could go wrong'),
  lede: L('The ten risks that can lose the client. Each has the control that prevents it, an owner, and the signal that shows it early.')
});
const data = await loadJSON('data/risks.json');

// a date reads as one word: the spaces inside it are made non-breaking so a line never ends on the month
const keepDates = t => String(t).replace(/([A-Za-z\u0600-\u06FF]+) (\d{1,2}), (\d{4})/g, '$1\u00a0$2,\u00a0$3');

app.content.innerHTML = `
  <ol class="steps">${data.risks.map(r => `<li id="${esc(r.id)}">
    <span class="n">${r.n}</span>
    <b>${keepDates(esc(r.risk))}</b>
    <span class="who">${esc(r.owner)}</span>
    <div class="d"><span class="mute">${esc(r.ends)}</span></div>
    <div class="d" style="color:var(--ink);margin-top:6px"><b style="display:inline;padding:0">${L('Control.')}</b> ${esc(r.control)}</div>
    <div class="d" style="margin-top:4px"><b style="display:inline;padding:0">${L('Signal.')}</b> ${esc(r.signal)}</div>
  </li>`).join('')}</ol>`;
