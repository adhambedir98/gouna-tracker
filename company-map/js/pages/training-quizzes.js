import { mount, loadJSON, t, esc, store, onLang, initialHash, setHash, href } from '../app.js';

const app = await mount({
  page: 'training/quizzes',
  title: { en: 'Quizzes', ar: 'الاختبارات' },
  lede: { en: 'For the trainee. One quiz per role, and one for the whole handbook. Answer, then check.', ar: 'للمتدرّب. اختبار لكل دور، واختبار لدليل الموظف كله. أجب، ثم تحقق.' },
  ar: true
});
const data = await loadJSON('data/training.json');
const L = { pick: { en: 'Pick the quiz', ar: 'اختر الاختبار' }, check: { en: 'Check my answers', ar: 'تحقق من إجاباتي' }, again: { en: 'Start again', ar: 'ابدأ من جديد' }, score: { en: '{n} of {m} right.', ar: '{n} من {m} صحيحة.' }, all: { en: 'All right. Show the trainer and both sign.', ar: 'كلها صحيحة. أرِ المدرّب ويوقّع الاثنان.' }, some: { en: 'Read the guide again for the ones marked, then try again.', ar: 'اقرأ الدليل مرة أخرى للأسئلة المعلّمة، ثم حاول من جديد.' }, key: { en: 'Show the answer key', ar: 'أظهر مفتاح الإجابات' }, hide: { en: 'Hide the answer key', ar: 'أخفِ مفتاح الإجابات' }, print: { en: 'Print this quiz', ar: 'اطبع هذا الاختبار' }, guide: { en: 'The guide', ar: 'الدليل' } };
const sets = [...data.roles.map(r => ({ id: r.id, title: r.role, quiz: r.quiz })), { id: 'handbook', title: data.handbook.title, note: data.handbook.note, quiz: data.handbook.quiz }];
const h0 = initialHash();
let cur = (h0 && sets.find(x => x.id === h0)) ? h0 : sets[0].id;
let checked = false, key = false;
const KEY = id => `vm.quiz.${id}`;
function quiz(s) {
  const ans = store.get(KEY(s.id), {});
  const right = s.quiz.filter((q, i) => String(ans[i]) === String(q.answer)).length;
  return `<section id="quiz" class="card panel qz">
    <h2>${esc(t(s.title))}</h2>
    ${s.note ? `<p class="mute">${esc(t(s.note))}</p>` : ''}
    <ol class="qs">${s.quiz.map((q, i) => { const mine = ans[i], ok = String(mine) === String(q.answer); return `<li class="q${checked ? (ok ? ' ok' : ' bad') : ''}"><b>${esc(t(q.q))}</b><div class="opts">${q.options.map((o, oi) => `<label class="opt${key && oi === q.answer ? ' key' : ''}${checked && oi === q.answer && !ok ? ' key' : ''}"><input type="radio" name="q${i}" data-q="${i}" value="${oi}" ${String(mine) === String(oi) ? 'checked' : ''}> ${esc(t(o))}</label>`).join('')}</div></li>`; }).join('')}</ol>
    ${checked ? `<p class="callout done"><b>${esc(t(L.score).replace('{n}', right).replace('{m}', s.quiz.length))}</b> ${esc(t(right === s.quiz.length ? L.all : L.some))}</p>` : ''}
    <div class="signoff"><div>${esc(t({ en: 'Trainee', ar: 'المتدرّب' }))}</div><div>${esc(t({ en: 'Trainer', ar: 'المدرّب' }))}</div><div>${esc(t({ en: 'Date', ar: 'التاريخ' }))}</div><div>${esc(t({ en: 'Score', ar: 'النتيجة' }))}</div></div>
    <div class="btn-row no-print"><button type="button" class="btn primary" id="q-check">${esc(t(L.check))}</button><button type="button" class="btn" id="q-again">${esc(t(L.again))}</button><button type="button" class="btn" id="q-key">${esc(t(key ? L.hide : L.key))}</button><button type="button" class="btn" data-print>${esc(t(L.print))}</button>${s.id !== 'handbook' ? `<a class="btn" href="${href('training')}#${esc(s.id)}">${esc(t(L.guide))}</a>` : ''}</div>
  </section>`;
}
function render() {
  const s = sets.find(x => x.id === cur);
  app.content.innerHTML = `<section id="pick"><h2>${esc(t(L.pick))}</h2><div class="choices">${sets.map(x => `<button type="button" data-set="${x.id}" class="${x.id === cur ? 'on' : ''}">${esc(t(x.title))}</button>`).join('')}</div></section>${quiz(s)}`;
}
render();
onLang(render);
document.addEventListener('click', e => {
  const b = e.target.closest('[data-set]');
  if (b) { cur = b.dataset.set; checked = false; key = false; setHash(cur); render(); return; }
  if (e.target.id === 'q-check') { checked = true; render(); document.getElementById('quiz').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  if (e.target.id === 'q-again') { store.remove(KEY(cur)); checked = false; render(); }
  if (e.target.id === 'q-key') { key = !key; render(); }
});
document.addEventListener('change', e => {
  const r = e.target.closest('[data-q]'); if (!r) return;
  const a = store.get(KEY(cur), {}); a[r.dataset.q] = r.value; store.set(KEY(cur), a);
});
