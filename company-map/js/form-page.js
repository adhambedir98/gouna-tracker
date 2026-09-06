// A standard form: fields to fill in, saved on this device, printed or saved as a copy.
// Every forms-<slug>.js page calls formPage('<slug>'); the fields live in data/forms/<slug>.json.
import { mount, loadJSON, esc, t, store, href } from './app.js';

const T = (en, ar) => t({ en, ar });
export async function formPage(slug) {
  const f = await loadJSON(`data/forms/${slug}.json`);
  const app = await mount({ page: `forms/${slug}`, title: t(f.title), lede: t(f.purpose) });
  const KEY = 'vm.form.' + slug;
  const saved = store.get(KEY, {});
  // the daily report and the company report live online; the paper form links there. The single-file copy links to the hosted site.
  const onlineHref = f.online ? (globalThis.__VM_DATA__ ? `${(await loadJSON('data/report.json')).host}/${f.online}/` : href(f.online)) : '';
  const field = x => {
    const v = saved[x.id];
    const label = `<label class="fl" for="f-${x.id}">${esc(t(x.label))}${x.hint ? `<small>${esc(t(x.hint))}</small>` : ''}</label>`;
    if (x.type === 'long') return `<div class="ff">${label}<textarea id="f-${x.id}" data-f="${x.id}" rows="3">${esc(v || '')}</textarea></div>`;
    if (x.type === 'check') return `<div class="ff row"><input type="checkbox" id="f-${x.id}" data-f="${x.id}" ${v ? 'checked' : ''}> ${label}</div>`;
    if (x.type === 'choice') return `<div class="ff"><span class="fl">${esc(t(x.label))}</span><div class="choices small">${x.options.map((o, i) => `<label class="opt"><input type="radio" name="f-${x.id}" data-f="${x.id}" value="${i}" ${String(v) === String(i) ? 'checked' : ''}> ${esc(t(o))}</label>`).join('')}</div></div>`;
    if (x.type === 'table') return `<div class="ff"><span class="fl">${esc(t(x.label))}</span><div class="t-wrap"><table class="t form"><thead><tr>${x.columns.map(c => `<th>${esc(t(c))}</th>`).join('')}</tr></thead><tbody>${Array.from({ length: x.count }, (_, r) => `<tr>${x.columns.map((c, ci) => `<td><input type="text" data-f="${x.id}.${r}.${ci}" value="${esc((v && v[`${r}.${ci}`]) || '')}"></td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
    const type = x.type === 'date' || x.type === 'time' || x.type === 'number' ? x.type : 'text';
    return `<div class="ff">${label}<input type="${type}" id="f-${x.id}" data-f="${x.id}" value="${esc(v || '')}"></div>`;
  };
  app.content.innerHTML = `
    ${f.when ? `<p class="callout">${esc(t(f.when))}</p>` : ''}
    ${onlineHref ? `<div class="btn-row no-print"><a class="btn primary" href="${onlineHref}">${f.online === 'report/day' ? T('Open the company report', 'افتح تقرير الشركة') : T('Fill it in online', 'املأه على الإنترنت')}</a></div>` : ''}
    ${f.example ? `<section class="card panel example"><h3>${T('Example', 'مثال')}</h3>${f.example.note ? `<p class="mute small">${esc(t(f.example.note))}</p>` : ''}<dl class="kv">${f.example.rows.map(([k, v]) => `<dt class="k">${esc(t(k))}</dt><dd class="v">${esc(t(v))}</dd>`).join('')}</dl></section>` : ''}
    <form class="stdform" id="stdform" autocomplete="off">
      ${f.sections.map(s => `<section><h2>${esc(t(s.title))}</h2><div class="fgrid">${s.fields.map(field).join('')}</div></section>`).join('')}
      <section><div class="signoff">${(f.signoff || []).map(x => `<div>${esc(t(x))}</div>`).join('')}</div></section>
    </form>
    <p class="tiny dim">${T('What you type is saved on this device until you clear it.', 'ما تكتبه يُحفظ على هذا الجهاز حتى تمسحه.')}</p>
    <div class="btn-row no-print"><button type="button" class="btn primary" data-print>${T('Print or save a copy', 'اطبع أو احفظ نسخة')}</button><button type="button" class="btn" id="f-clear">${T('Clear', 'مسح')}</button><a class="btn" href="${href('forms')}">${T('All forms', 'كل النماذج')}</a></div>`;
  const form = document.getElementById('stdform');
  const read = () => {
    const out = {};
    form.querySelectorAll('[data-f]').forEach(el => {
      const k = el.dataset.f;
      if (el.type === 'checkbox') out[k] = el.checked;
      else if (el.type === 'radio') { if (el.checked) out[k] = el.value; }
      else if (k.includes('.')) { const [id, r, c] = k.split('.'); (out[id] = out[id] || {})[`${r}.${c}`] = el.value; }
      else out[k] = el.value;
    });
    return out;
  };
  form.addEventListener('input', () => store.set(KEY, read()));
  form.addEventListener('change', () => store.set(KEY, read()));
  document.getElementById('f-clear').addEventListener('click', () => { if (confirm(T('Clear everything on this form?', 'مسح كل ما في هذا النموذج؟'))) { store.set(KEY, {}); location.reload(); } });
}
