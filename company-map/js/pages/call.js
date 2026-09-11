import { mount, loadJSON, t, esc, site, onLang, dir, href, initialHash, setHash } from '../app.js';
import { svg, rect, text, line, figure } from '../svg.js';

const app = await mount({
  page: 'call',
  title: { en: 'Who to call', ar: 'بمن تتصل' },
  lede: { en: 'Pick the situation.', ar: 'اختر الموقف.' },
  ar: true
});
const data = await loadJSON('data/call.json');
const ui = k => t(site.ui[k]);
const L = k => t(data.labels[k]);
const issueOf = k => data.issues.find(i => i.k === k);
const groupOfIssue = k => data.groups.find(g => g.issues.includes(k));

const SEE = {
  upload: ['incidents#hub-outage', 'manual/data-logistics'], device: ['manual/asset-control', 'training#operator'], injury: ['incidents#injury'],
  minor: ['incidents#minor', 'onboarding'], client: ['incidents#client-complaint', 'never'], partner: ['incidents#partner-dispute'],
  legal: ['incidents#checkpoint', 'manual/data-logistics#letter'], flag: ['manual/quality'], absence: ['rules#absences'], safety: ['rules#safety'],
  pay: ['manual/money'], gear: ['manual/asset-control#kit'], lead: ['manual/people#pipeline'], hire: ['manual/people#pipeline'], idea: ['rules#speak'], unknown: ['map']
};
const SEE_LABEL = { en: 'See also', ar: 'انظر أيضًا' };
const navItems = site.nav.flatMap(g => g.items);
function seeAlso(k) {
  const paths = SEE[k] || [];
  if (!paths.length) return '';
  const chips = paths.map(p => { const [path, hash] = p.split('#'); const item = navItems.find(i => i.path === path); return `<a class="chip" href="${href(path)}${hash ? '#' + hash : ''}">${esc(item ? t(item.label) : path)}</a>`; }).join('');
  return `<div class="small mute" style="margin-top:14px">${esc(t(SEE_LABEL))}</div><div style="margin-top:6px">${chips}</div>`;
}
let group = null, issue = null;
const initial = initialHash();
if (initial && issueOf(initial)) { issue = initial; group = groupOfIssue(initial)?.id || null; }

function ladder(i) {
  const ids = ['you', ...i.route];
  const W = 316, rowH = 66, boxW = W, boxH = 40, x = 0;
  const H = ids.length * rowH - (rowH - boxH);
  const rtl = dir() === 'rtl';
  let inner = '';
  ids.forEach((id, k) => {
    const y = k * rowH;
    inner += rect(x, y, boxW, boxH, k === 0 ? 'bx-panel' : k === 1 ? 'bx-acc-line' : 'bx');
    inner += text(W / 2, y + boxH / 2 + 5, t(data.nodes[id]), { cls: 'tx tx-b' + (k === 1 ? ' tx-a' : ''), anchor: 'middle' });
    if (k < ids.length - 1) {
      inner += line(W / 2, y + boxH, W / 2, y + rowH - 2, 'ln-acc', 'marker-end="url(#lad-arr-acc)"');
      const label = k === 0 ? ui('call') : (ids.length === 3 && k === 1 ? ui('ifNoAnswer') : L('then'));
      inner += text(rtl ? W / 2 - 10 : W / 2 + 10, y + boxH + 17, label, { cls: 'tx tx-m', anchor: rtl ? 'end' : 'start' });
    }
  });
  return figure(svg({ w: W, h: H, label: t(i.label), inner, id: 'lad' }), { cls: 'narrow' });
}

function routeCard(i) {
  // the ladder carries the names, so a row that only repeats its box is left out
  const first = t(i.first), backup = t(i.backup);
  return `<section class="card panel" id="route" aria-live="polite">
    <h2>${esc(t(i.label))}</h2>
    ${ladder(i)}
    <dl class="kv">
      ${first !== t(data.nodes[i.route[0]]) ? `<dt class="k">${esc(ui('call'))}</dt><dd class="v"><b>${esc(first)}</b></dd>` : ''}
      ${backup !== t(data.nodes[i.route[1]]) ? `<dt class="k">${esc(ui('ifNoAnswer'))}</dt><dd class="v">${esc(backup)}</dd>` : ''}
      <dt class="k">${esc(ui('timeRule'))}</dt><dd class="v">${esc(t(i.sla))}</dd>
      <dt class="k">${esc(ui('bring'))}</dt><dd class="v"><ul style="margin:0">${i.include.map(x => `<li>${esc(t(x))}</li>`).join('')}</ul></dd>
    </dl>
    ${seeAlso(i.k)}
  </section>`;
}

function render(scroll) {
  const g = data.groups.find(x => x.id === group);
  const i = issue ? issueOf(issue) : null;
  app.content.innerHTML = `
    <div class="rule-band">${data.rules.map(r => `<div><b>${esc(t(r.b))}</b><span>${esc(t(r.s))}</span></div>`).join('')}</div>
    <section id="pick">
      <h2>${esc(L('step1'))}</h2>
      <div class="choices">${data.groups.map(x => `<button type="button" data-group="${x.id}" class="${x.id === group ? 'on' : ''}">${esc(t(x.label))}<small>${esc(t(x.hint))}</small></button>`).join('')}</div>
    </section>
    ${g ? `<section id="which">
      <h2>${esc(t(g.label))}. ${esc(L('step2'))}</h2>
      <div class="choices">${g.issues.map(k => { const it = issueOf(k); return `<button type="button" data-issue="${k}" class="${k === issue ? 'on' : ''}">${esc(t(it.label))}</button>`; }).join('')}</div>
    </section>` : ''}
    ${i ? routeCard(i) : ''}
    <section id="all">
      <details open><summary data-open="${esc(ui('open'))}" data-close="${esc(ui('close'))}"><h2>${esc(L('all'))}</h2></summary>
      <div class="body" style="max-width:none"><div class="choices">${data.issues.map(it => `<button type="button" data-issue="${it.k}" class="${it.k === issue ? 'on' : ''}">${esc(t(it.label))}</button>`).join('')}</div></div></details>
    </section>`;
  if (scroll) {
    const target = document.getElementById(i ? 'route' : 'which');
    if (target && window.innerWidth < 1024) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

document.addEventListener('click', e => {
  const gb = e.target.closest('[data-group]');
  if (gb) { group = gb.dataset.group; issue = null; setHash(''); render(true); return; }
  const ib = e.target.closest('[data-issue]');
  if (ib) { issue = ib.dataset.issue; group = groupOfIssue(issue)?.id || group; setHash(issue); render(true); }
});
render(false);
onLang(() => render(false));
