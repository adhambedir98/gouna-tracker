import { mount, loadJSON, t, esc, onLang, initialHash, setHash, href } from '../app.js';

const app = await mount({
  page: 'training',
  title: { en: 'Training', ar: 'التدريب' },
  lede: { en: 'One short guide per role, in plain words. The trainer works from the checklist. The trainee takes the quiz.', ar: 'دليل قصير لكل دور، بكلمات بسيطة. المدرّب يعمل من قائمة التحقق. والمتدرّب يؤدي الاختبار.' },
  ar: true
});
const data = await loadJSON('data/training.json');
const L = {
  pick: { en: 'Pick the role', ar: 'اختر الدور' },
  trainer: { en: 'Trainer', ar: 'المدرّب' },
  length: { en: 'How long', ar: 'المدة' },
  passes: { en: 'Passes when', ar: 'ينجح عندما' },
  checklist: { en: 'The trainer\'s checklist', ar: 'قائمة تحقق المدرّب' },
  quiz: { en: 'The quiz', ar: 'الاختبار' },
  cards: { en: 'Pocket cards', ar: 'بطاقات الجيب' },
  cardsNote: { en: 'One printed page each. Operators and runners carry them.', ar: 'صفحة مطبوعة لكل بطاقة. يحملها المشغّلون والمندوبون.' },
  printCards: { en: 'Print the pocket cards', ar: 'اطبع بطاقات الجيب' },
  call: { en: 'Call', ar: 'اتصل' }
};
const h0 = initialHash();
let role = (h0 && data.roles.find(x => x.id === h0)) ? h0 : data.roles[0].id;

function guide(r) {
  return `<section id="guide" class="card panel">
    <h2>${esc(t(r.role))}</h2>
    <div class="glance"><div><span class="k">${esc(t(L.trainer))}</span><b>${esc(t(r.trainer))}</b></div><div><span class="k">${esc(t(L.length))}</span><b>${esc(t(r.length))}</b></div></div>
    ${r.guide.map(g => `<h3>${esc(t(g.h))}</h3><ul class="plain">${g.lines.map(l => `<li>${esc(t(l))}</li>`).join('')}</ul>`).join('')}
    <p class="callout done"><b>${esc(t(L.passes))}.</b> ${esc(t(r.passes))}</p>
    <div class="btn-row no-print"><a class="btn primary" href="${href('training/checklists')}#${esc(r.id)}">${esc(t(L.checklist))}</a><a class="btn" href="${href('training/quizzes')}#${esc(r.id)}">${esc(t(L.quiz))}</a></div>
  </section>`;
}
function card(c) {
  return `<div class="pocket" id="card-${esc(c.id)}">
    <div class="wm">Vound</div>
    <h3>${esc(t(c.title))}</h3>
    ${c.sections.map(sec => `<div class="sec"><b>${esc(t(sec.h))}</b><ul>${sec.lines.map(l => `<li>${esc(t(l))}</li>`).join('')}</ul></div>`).join('')}
    <div class="call">${esc(t(L.call))}: ${esc(t(c.call))}</div>
  </div>`;
}
function render() {
  const r = data.roles.find(x => x.id === role);
  app.content.innerHTML = `
    <section id="roles">
      <h2>${esc(t(L.pick))}</h2>
      <div class="choices">${data.roles.map(x => `<button type="button" data-role="${x.id}" class="${x.id === role ? 'on' : ''}">${esc(t(x.role))}</button>`).join('')}</div>
    </section>
    ${guide(r)}
    <section id="cards">
      <h2>${esc(t(L.cards))}</h2>
      <p class="mute">${esc(t(L.cardsNote))}</p>
      <div class="btn-row no-print"><button type="button" class="btn" data-print="#cards">${esc(t(L.printCards))}</button></div>
      ${data.cards.map(card).join('')}
    </section>`;
}
render();
onLang(render);
document.addEventListener('click', e => {
  const rb = e.target.closest('[data-role]');
  if (rb) { role = rb.dataset.role; setHash(role); render(); return; }
});
