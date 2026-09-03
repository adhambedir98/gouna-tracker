import { mount, loadJSON, t, esc, store, onLang, site, initialHash, setHash } from '../app.js';

const app = await mount({
  page: 'training',
  title: { en: 'Training', ar: 'التدريب' },
  lede: { en: 'One module per role. Tick each line as it is shown and done, then both sign.', ar: 'وحدة لكل دور. ضع علامة على كل بند بعد عرضه وتنفيذه، ثم يوقّع الاثنان.' },
  ar: true
});
const data = await loadJSON('data/training.json');
const ui = k => t(site.ui[k]);
const L = {
  pick: { en: 'Pick the role', ar: 'اختر الدور' },
  length: { en: 'Length', ar: 'المدة' },
  trainer: { en: 'Trainer', ar: 'المدرّب' },
  passes: { en: 'Passes when', ar: 'ينجح عندما' },
  checklist: { en: 'Checklist', ar: 'قائمة التحقق' },
  cards: { en: 'Pocket cards', ar: 'بطاقات الجيب' },
  cardsNote: { en: 'One printed page each. Anchors and runners carry them.', ar: 'صفحة مطبوعة لكل بطاقة. يحملها المشرفون والمندوبون.' },
  printModule: { en: 'Print this module', ar: 'اطبع هذه الوحدة' },
  printCards: { en: 'Print the pocket cards', ar: 'اطبع بطاقات الجيب' },
  call: { en: 'Call', ar: 'اتصل' }
};
const h0 = initialHash();
let role = (h0 && data.modules.find(x => x.id === h0)) ? h0 : data.modules[0].id;
const KEY = id => `vm.train.${id}`;

function module(mod) {
  const done = store.get(KEY(mod.id), {});
  const count = mod.items.filter((_, i) => done[i]).length;
  return `<section id="module" class="card panel">
    <h2>${esc(t(mod.role))} <span class="mute" style="font-weight:400;font-size:16px">${count} / ${mod.items.length}</span></h2>
    <dl class="kv">
      <dt class="k">${esc(t(L.length))}</dt><dd class="v">${esc(t(mod.length))}</dd>
      <dt class="k">${esc(t(L.trainer))}</dt><dd class="v">${esc(t(mod.trainer))}</dd>
      <dt class="k">${esc(t(L.passes))}</dt><dd class="v">${esc(t(mod.passes))}</dd>
    </dl>
    <h3 style="margin-top:20px">${esc(t(L.checklist))}</h3>
    <ul class="check">${mod.items.map((it, i) => `<li><label><input type="checkbox" data-item="${i}" ${done[i] ? 'checked' : ''}><span class="txt"><b>${i + 1}. ${esc(t(it))}</b></span></label></li>`).join('')}</ul>
    <div class="signoff"><div>${esc(ui('trainee'))}</div><div>${esc(ui('trainer'))}</div><div>${esc(ui('date'))}</div><div>${esc(ui('signature'))}</div></div>
    <p class="tiny dim no-print" style="margin-top:12px">${esc(ui('progressSaved'))}</p>
    <div class="btn-row no-print"><button type="button" class="btn primary" id="print-module">${esc(t(L.printModule))}</button><button type="button" class="btn" id="reset-module">${esc(ui('reset'))}</button></div>
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
  const mod = data.modules.find(x => x.id === role);
  app.content.innerHTML = `
    <section id="roles">
      <h2>${esc(t(L.pick))}</h2>
      <div class="choices">${data.modules.map(x => `<button type="button" data-role="${x.id}" class="${x.id === role ? 'on' : ''}">${esc(t(x.role))}<small>${esc(t(x.length))}</small></button>`).join('')}</div>
    </section>
    ${module(mod)}
    <section id="cards">
      <h2>${esc(t(L.cards))}</h2>
      <p class="mute">${esc(t(L.cardsNote))}</p>
      <div class="btn-row no-print"><button type="button" class="btn" id="print-cards">${esc(t(L.printCards))}</button></div>
      ${data.cards.map(card).join('')}
    </section>`;
}
render();
onLang(render);

function printWith(cls) {
  document.body.classList.add(cls);
  const off = () => { document.body.classList.remove(cls); window.removeEventListener('afterprint', off); };
  window.addEventListener('afterprint', off);
  window.print();
  setTimeout(off, 2000);
}
document.addEventListener('click', e => {
  const rb = e.target.closest('[data-role]');
  if (rb) { role = rb.dataset.role; setHash(role); render(); return; }
  if (e.target.id === 'print-module') printWith('print-module');
  if (e.target.id === 'print-cards') printWith('print-cards');
  if (e.target.id === 'reset-module') { store.remove(KEY(role)); render(); }
});
document.addEventListener('change', e => {
  const cb = e.target.closest('[data-item]'); if (!cb) return;
  const d = store.get(KEY(role), {}); d[cb.dataset.item] = cb.checked; store.set(KEY(role), d); render();
});
