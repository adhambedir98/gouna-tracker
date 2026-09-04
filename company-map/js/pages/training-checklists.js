import { mount, loadJSON, t, esc, store, onLang, site, initialHash, setHash, href } from '../app.js';

const app = await mount({
  page: 'training/checklists',
  title: { en: 'Checklists', ar: 'قوائم التحقق' },
  lede: { en: 'For the trainer. Tick each line when the trainee has shown it and done it. Then both sign.', ar: 'للمدرّب. ضع علامة على كل بند عندما يعرضه المتدرّب وينفّذه. ثم يوقّع الاثنان.' },
  ar: true
});
const data = await loadJSON('data/training.json');
const ui = k => t(site.ui[k]);
const L = { pick: { en: 'Pick the role', ar: 'اختر الدور' }, trainer: { en: 'Trainer', ar: 'المدرّب' }, passes: { en: 'Passes when', ar: 'ينجح عندما' }, print: { en: 'Print this checklist', ar: 'اطبع هذه القائمة' }, guide: { en: 'The guide', ar: 'الدليل' }, quiz: { en: 'The quiz', ar: 'الاختبار' } };
const h0 = initialHash();
let role = (h0 && data.roles.find(x => x.id === h0)) ? h0 : data.roles[0].id;
const KEY = id => `vm.train.${id}`;
function list(r) {
  const done = store.get(KEY(r.id), {});
  const count = r.checklist.filter((_, i) => done[i]).length;
  return `<section id="module" class="card panel">
    <h2>${esc(t(r.role))} <span class="mute" style="font-weight:400;font-size:16px">${count} / ${r.checklist.length}</span></h2>
    <p class="mute">${esc(t(L.trainer))}: ${esc(t(r.trainer))}</p>
    <ul class="check">${r.checklist.map((it, i) => `<li><label><input type="checkbox" data-item="${i}" ${done[i] ? 'checked' : ''}><span class="txt"><b>${i + 1}. ${esc(t(it))}</b></span></label></li>`).join('')}</ul>
    <p class="callout done"><b>${esc(t(L.passes))}.</b> ${esc(t(r.passes))}</p>
    <div class="signoff"><div>${esc(ui('trainee'))}</div><div>${esc(ui('trainer'))}</div><div>${esc(ui('date'))}</div><div>${esc(ui('signature'))}</div></div>
    <p class="tiny dim no-print" style="margin-top:12px">${esc(ui('progressSaved'))}</p>
    <div class="btn-row no-print"><button type="button" class="btn primary" data-print>${esc(t(L.print))}</button><button type="button" class="btn" id="reset-module">${esc(ui('reset'))}</button><a class="btn" href="${href('training')}#${esc(r.id)}">${esc(t(L.guide))}</a><a class="btn" href="${href('training/quizzes')}#${esc(r.id)}">${esc(t(L.quiz))}</a></div>
  </section>`;
}
function render() {
  const r = data.roles.find(x => x.id === role);
  app.content.innerHTML = `<section id="roles"><h2>${esc(t(L.pick))}</h2><div class="choices">${data.roles.map(x => `<button type="button" data-role="${x.id}" class="${x.id === role ? 'on' : ''}">${esc(t(x.role))}</button>`).join('')}</div></section>${list(r)}`;
}
render();
onLang(render);
document.addEventListener('click', e => {
  const rb = e.target.closest('[data-role]');
  if (rb) { role = rb.dataset.role; setHash(role); render(); return; }
  if (e.target.id === 'reset-module') { store.remove(KEY(role)); render(); }
});
document.addEventListener('change', e => {
  const cb = e.target.closest('[data-item]'); if (!cb) return;
  const d = store.get(KEY(role), {}); d[cb.dataset.item] = cb.checked; store.set(KEY(role), d); render();
});
