import { mount, loadJSON, esc, href, labels } from '../app.js';
import { fraudPict } from '../fraud-pict.js';
const L = await labels('fraud');
const app = await mount({
  page: 'fraud',
  title: L('Fraud'),
  lede: L('The eight patterns the client flags. What each one looks like, how to spot it, and what to do.'),
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
      <div><b>${L('One flag')}</b><span>${L('No pay for that video. 100 EGP off for the operator, 200 EGP off for the Portfolio Manager.')}</span></div>
      <div><b>${L('Three flags')}</b><span>${L('The worker comes off the phone. A banned account or fraud that repeats costs 250 EGP and 500 EGP.')}</span></div>
      <div><b>${L('Filming a screen')}</b><span>${L('Done on purpose. Immediate dismissal, and the account is closed.')}</span></div>
    </div>
    <p><a class="chip" href="${href('rules')}#fraud">${L('Rules')}</a><a class="chip" href="${href('manual/quality')}">${L('Quality checks')}</a><a class="chip" href="${href('training/quizzes')}#operator">${L('The operator quiz')}</a></p>
  </section>`;
