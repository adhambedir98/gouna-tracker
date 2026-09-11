import { mount, loadJSON, esc, href, labels } from '../app.js';
import { fraudPict } from '../fraud-pict.js';
const L = await labels('fraud');
const app = await mount({
  page: 'fraud',
  title: L('Fraud'),
  lede: L('The eight patterns the client flags.'),
  toc: [{ id: 'patterns', label: L('The eight patterns') }, { id: 'cost', label: L('What a flag costs') }]
});
const m = await loadJSON('data/manual/quality.json');
app.content.innerHTML = `
  <section id="patterns">
    <h2>${L('The eight patterns')}</h2>
    <div class="cards two">${m.patterns.map((p, i) => `<div class="card pattern"><span class="pn">${i + 1}</span>${fraudPict(p.id, L)}<h3>${esc(p.name)}</h3><p>${esc(p.what)}</p><p class="small"><b>${L('How to spot it')}.</b> ${esc(p.tell)}</p><p class="small"><b>${L('What to do')}.</b> ${esc(p.fix)}</p></div>`).join('')}</div>
    <p class="callout done"><b>${L('Quality ratings protect nobody.')}</b> ${L('A video can be rated Great and still be flagged as fraud. Our own reviewers watch every video before the client sees it.')}</p>
  </section>
  <section id="cost">
    <h2>${L('What a flag costs')}</h2>
    <div class="rule-band">
      <div><b>${L('The video')}</b><span>${L('Nobody is paid for it. Not the worker, and not the company.')}</span></div>
      <div><b>${L('The operator')}</b><span>${L('A 100 EGP deduction for a flag. 250 EGP for a banned account, or fraud that repeats.')}</span></div>
      <div><b>${L('The Portfolio Manager')}</b><span>${L('A 200 EGP deduction for a flag. 500 EGP for a banned account, or fraud that repeats.')}</span></div>
    </div>
    <p><a class="chip" href="${href('rules')}#fraud">${L('Rules')}</a><a class="chip" href="${href('manual/quality')}">${L('Quality checks')}</a><a class="chip" href="${href('training/quizzes')}#operator">${L('The operator quiz')}</a></p>
  </section>`;
