// The four blocks every manual subsystem page shares.
import { esc, t, site } from './app.js';

export const MANUAL_TOC = [
  { id: 'how', label: { en: 'How it works' } },
  { id: 'procedures', label: { en: 'Procedures' } },
  { id: 'breaks', label: { en: 'What breaks' } },
  { id: 'training', label: { en: 'Training' } },
  { id: 'questions', label: { en: 'Questions' } }
];

const ui = k => t(site.ui[k]);

export function blocks(m) {
  return `
    <section id="how">
      <h2>How it works</h2>
      <ul class="rows">${(m.how || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul>
    </section>
    <section id="procedures">
      <h2>Procedures</h2>
      ${(m.procedures || []).map((p, i) => `<details open class="${i === 0 ? 'first' : ''}">
        <summary data-open="${esc(ui('open'))}" data-close="${esc(ui('close'))}"><span><h3>${esc(p.name)}</h3><span class="tiny accent">${esc(p.owner)}</span></span></summary>
        <div class="body"><ol class="steps">${(p.steps || []).map((s, k) => `<li><span class="n">${k + 1}</span><span class="d" style="color:var(--ink);margin-top:6px">${esc(s)}</span></li>`).join('')}</ol></div>
      </details>`).join('')}
    </section>
    <section id="breaks">
      <h2>What breaks, what we do</h2>
      <div class="fails">${(m.breaks || []).map(b => `<div class="fail"><span class="f">${esc(b.what)}</span><span class="r">${esc(b.do)}</span></div>`).join('')}</div>
    </section>
    <section id="training">
      <h2>Training</h2>
      <ul class="rows">${(m.training || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul>
    </section>
    <section id="questions">
      <h2>Questions people ask</h2>
      <dl class="def">${(m.questions || []).map(q => `<dt>${esc(q.q)}</dt><dd>${esc(q.a)}</dd>`).join('')}</dl>
    </section>`;
}

export function otherPages(current) {
  const group = site.nav.find(g => g.items.some(i => i.path === 'manual'));
  return group.items.filter(i => i.path !== 'manual' && i.path !== current).map(i => i);
}
