// The four blocks every manual subsystem page shares.
import { esc, t, site, href } from './app.js';

const H = {
  how: { en: 'How it works', ar: 'كيف يعمل' },
  procedures: { en: 'Procedures', ar: 'الإجراءات' },
  proceduresNote: { en: 'The step-by-step procedures live on their own pages.', ar: 'الإجراءات خطوة بخطوة لها صفحاتها الخاصة.' },
  breaks: { en: 'Problems and what to do', ar: 'المشكلات وما نفعله' },
  breaksShort: { en: 'Problems', ar: 'المشكلات' },
  training: { en: 'Training', ar: 'التدريب' },
  questions: { en: 'Frequently asked questions', ar: 'أسئلة يسألها الناس' },
  questionsShort: { en: 'Questions', ar: 'الأسئلة' }
};
export const MANUAL_TOC = [
  { id: 'how', label: H.how },
  { id: 'procedures', label: H.procedures },
  { id: 'breaks', label: H.breaksShort },
  { id: 'questions', label: H.questionsShort }
];

const ui = k => t(site.ui[k]);
const navItem = path => site.nav.flatMap(g => g.items).find(i => i.path === path);

export function blocks(m) {
  return `
    <section id="how">
      <h2>${esc(t(H.how))}</h2>
      <ul class="rows">${(m.how || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul>
    </section>
    <section id="procedures">
      <h2>${esc(t(H.procedures))}</h2>
      <p class="mute">${esc(t(H.proceduresNote))}</p>
      <div>${(m.sops || []).map(s => { const it = navItem('sops/' + s); return it ? `<a class="chip" href="${href('sops/' + s)}">${esc(t(it.label))}</a>` : ''; }).join('')}</div>
    </section>
    <section id="breaks">
      <h2>${esc(t(H.breaks))}</h2>
      <div class="fails">${(m.breaks || []).map(b => `<div class="fail"><span class="f">${esc(b.what)}</span><span class="r">${esc(b.do)}</span></div>`).join('')}</div>
    </section>
    <section id="questions">
      <h2>${esc(t(H.questions))}</h2>
      <div class="fails">${(m.questions || []).map(q => `<div class="fail"><span class="f">${esc(q.q)}</span><span class="r">${esc(q.a)}</span></div>`).join('')}</div>
    </section>`;
}

export function otherPages(current) {
  const group = site.nav.find(g => g.items.some(i => i.path === 'manual'));
  return group.items.filter(i => i.path !== 'manual' && i.path !== current).map(i => i);
}
