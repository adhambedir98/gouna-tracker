import { mount, loadJSON, t, esc, store, onLang, site, dir } from '../app.js';
import { svg, rect, text, line, circle, figure } from '../svg.js';

const app = await mount({
  page: 'onboarding',
  title: { en: 'Onboarding gate', ar: 'بوابة الانضمام' },
  lede: { en: 'Sites nominate. KMSC activates. Seven lines, in order, before a device goes on.', ar: 'الموقع يرشّح، وKMSC تفعّل. سبعة بنود بالترتيب قبل أن يوضع أي جهاز.' },
  ar: true
});
const data = await loadJSON('data/gate.json');
const ui = k => t(site.ui[k]);
const KEY = 'vm.gate';
const ticks = () => store.get(KEY, {});

function gate() {
  const W = 360, id = 'gate', rtl = dir() === 'rtl';
  const n = data.items.length, rowH = 40, top = 44, bw = 250, x = (W - bw) / 2;
  const H = top + n * rowH + 74;
  let s = '';
  s += text(W / 2, 18, t(data.nominate), { cls: 'tx tx-m', anchor: 'middle' });
  s += line(W / 2, 24, W / 2, top - 4, 'ln', `marker-end="url(#${id}-arr)"`);
  const done = ticks();
  data.items.forEach((it, i) => {
    const y = top + i * rowH;
    const ok = !!done[it.id];
    s += rect(x, y, bw, rowH - 8, ok ? 'bx-acc-line' : 'bx');
    s += circle(rtl ? x + bw - 18 : x + 18, y + (rowH - 8) / 2, 9, ok ? 'dot' : 'dot-o');
    s += text(rtl ? x + bw - 18 : x + 18, y + (rowH - 8) / 2 + 4, String(i + 1), { cls: 'tx tx-s tx-b ' + (ok ? 'tx-p' : 'tx-a'), anchor: 'middle' });
    s += text(rtl ? x + bw - 36 : x + 36, y + (rowH - 8) / 2 + 5, t(it.short), { cls: 'tx' + (ok ? ' tx-b' : ''), anchor: rtl ? 'end' : 'start' });
    if (i < n - 1) s += line(W / 2, y + rowH - 8, W / 2, y + rowH - 1, 'ln');
  });
  const yEnd = top + n * rowH;
  s += line(W / 2, yEnd - 8, W / 2, yEnd + 14, 'ln-acc', `marker-end="url(#${id}-arr-acc)"`);
  s += text(W / 2, yEnd + 30, t(data.activate), { cls: 'tx tx-m', anchor: 'middle' });
  s += rect(x, yEnd + 38, bw, 32, 'bx-acc');
  s += text(W / 2, yEnd + 58, t(data.result), { cls: 'tx tx-b tx-p', anchor: 'middle' });
  return figure(svg({ w: W, h: H, label: t({ en: 'The seven lines of the onboarding gate', ar: 'البنود السبعة لبوابة الانضمام' }), inner: s, id }), { cls: 'narrow' });
}

function render() {
  const done = ticks();
  const count = data.items.filter(i => done[i.id]).length;
  app.content.innerHTML = `
    ${gate()}
    <section id="list">
      <h2>${esc(t({ en: 'The checklist', ar: 'قائمة التحقق' }))} <span class="mute" style="font-weight:400;font-size:16px">${count} / ${data.items.length}</span></h2>
      <ul class="check">${data.items.map((it, i) => `<li><label><input type="checkbox" data-gate="${esc(it.id)}" ${done[it.id] ? 'checked' : ''}><span class="txt"><b>${i + 1}. ${esc(t(it.b))}</b><span>${esc(t(it.s))}</span></span></label></li>`).join('')}</ul>
      <div class="signoff">${data.signoff.map(f => `<div>${esc(t(f.label))}</div>`).join('')}</div>
      <p class="tiny dim no-print" style="margin-top:12px">${esc(ui('progressSaved'))}</p>
      <div class="btn-row no-print"><button type="button" class="btn primary" id="print">${esc(ui('print'))}</button><button type="button" class="btn" id="reset">${esc(ui('reset'))}</button></div>
    </section>`;
}
render();
onLang(render);
document.addEventListener('change', e => {
  const cb = e.target.closest('[data-gate]'); if (!cb) return;
  const d = ticks(); d[cb.dataset.gate] = cb.checked; store.set(KEY, d); render();
});
document.addEventListener('click', e => {
  if (e.target.id === 'print') window.print();
  if (e.target.id === 'reset') { store.remove(KEY); render(); }
});
