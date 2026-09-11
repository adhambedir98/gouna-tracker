// One job page: the job handbook, the job posting for job boards, and the offer letter, on three tabs.
// Every jobs-<slug>.js page module calls jobPage('<slug>'); the content lives in data/jobs/<slug>.json.
import { mount, loadJSON, esc, t, site, href, labels, store, initialHash, setHash, toast, list } from './app.js';

export async function jobPage(slug) {
  const L = await labels('job');
  const job = await loadJSON(`data/jobs/${slug}.json`);
  const index = await loadJSON('data/jobs/index.json');
  const ui = k => t(site.ui[k]);
  const app = await mount({ page: `jobs/${slug}`, title: job.title, lede: job.summary });
  const navItems = site.nav.flatMap(g => g.items);
  const labelOf = path => t((navItems.find(i => i.path === path) || {}).label) || path;
  const TABS = ['handbook', 'posting', 'offer'];
  const TAB_LABEL = { handbook: L('Job handbook'), posting: L('Job posting'), offer: L('Offer letter') };
  let tab = TABS.includes(initialHash()) ? initialHash() : 'handbook';
  const group = index.groups.find(g => g.jobs.includes(slug));
  const others = group ? group.jobs.filter(s => s !== slug) : [];
  const H = job.handbook, P = job.posting, O = job.offer;

  /* the offer letter: fields saved on this device, filled into the letter as you type */
  const KEY = 'vm.offer.' + slug;
  const FIELDS = [['name', L('Candidate name')], ['manager', L('Manager')], ['site', L('Place of work')], ['start', L('Start date')], ['pay', L('Pay')], ['probation', L('Probation')], ['date', L('Letter date')]];
  const vals = () => store.get(KEY, {});
  const fill = s => esc(s).replace(/\{(\w+)\}/g, (_, k) => { const v = vals()[k]; return v ? `<b>${esc(v)}</b>` : '<span class="dim">________</span>'; });
  const letter = () => `<div class="letter jobletter">
    <h3>${esc(O.heading)}</h3>
    <p class="mute small">${fill(L('Date: {date}'))}</p>
    <p>${fill(O.opening)}</p>
    ${O.paragraphs.map(p => `<p>${fill(p)}</p>`).join('')}
    <table class="t terms"><tbody>${O.terms.map(x => `<tr><td><b>${esc(x.label ?? x.k)}</b></td><td>${fill(x.v)}</td></tr>`).join('')}</tbody></table>
    <p><b>${L('This offer depends on')}</b></p><ul>${(O.conditions || []).map(x => `<li>${fill(t(x))}</li>`).join('')}</ul>
    <p><b>${L('What we expect from you')}</b></p><ul>${(O.expect || []).map(x => `<li>${fill(t(x))}</li>`).join('')}</ul>
    <p>${fill(O.closing)}</p>
    <div class="sig"><div>${L('Candidate signature')}</div><div>${esc(O.signer)}</div></div>
  </div>`;

  /* the posting as plain text, for a job board */
  const plain = () => [P.headline, '', P.about, '', L('What you will do'), ...P.do.map(x => '- ' + x), '', L('What you need'), ...P.need.map(x => '- ' + x), '', L('Nice to have'), ...(P.plus || []).map(x => '- ' + x), '', L('What we offer'), ...P.offer.map(x => '- ' + x), '', L('How to apply'), P.apply].join('\n');

  const fm = x => `<tr><td><b>${esc(x.when)}</b></td><td>${esc(x.what)}</td></tr>`;
  const render = () => {
    app.content.innerHTML = `
    <section style="margin-top:0">
      <div class="glance four">
        <div><span class="k">${L('Reports to')}</span><b>${esc(job.boss)}</b></div>
        <div><span class="k">${L('Team')}</span><b>${esc(job.team)}</b><span class="mute">${esc(job.type)}</span></div>
        <div><span class="k">${L('Where')}</span><b>${esc(job.where)}</b></div>
        <div><span class="k">${L('Hours')}</span><b>${esc(job.hours)}</b></div>
      </div>
      <div class="tabs no-print" role="tablist">${TABS.map(x => `<button type="button" role="tab" class="tab${x === tab ? ' on' : ''}" aria-selected="${x === tab}" data-tab="${x}">${TAB_LABEL[x]}</button>`).join('')}</div>
    </section>
    <section id="tab-handbook" class="tabpanel jb" ${tab === 'handbook' ? '' : 'hidden'}>
      <h2 class="print-only">${esc(job.title)}: ${L('Job handbook')}</h2>
      <h2>${L('What this job is for')}</h2>
      <p>${esc(H.purpose)}</p>
      <p class="mute small"><b>${L('You manage')}.</b> ${esc(job.leads)}</p>
      <h2>${L('You are responsible for')}</h2>${list(H.outcomes, 'marks')}
      <h2>${L('Every day')}</h2>${list(H.daily)}
      ${(H.weekly || []).length ? `<h3>${L('Every week')}</h3>${list(H.weekly)}` : ''}
      ${(H.monthly || []).length ? `<h3>${L('Every month')}</h3>${list(H.monthly)}` : ''}
      <h2>${L('The standard')}</h2>${list(H.standards)}
      <h2>${L('What ends the job')}</h2>${list(H.never, 'never')}
      <h2>${L('Your first month')}</h2>
      <div class="t-wrap"><table class="t"><tbody>${H.firstMonth.map(fm).join('')}</tbody></table></div>
      <h2>${L('How you are measured')}</h2>${list(H.measures)}
      <h2>${L('Who you call')}</h2>
      <p>${esc(H.call)}</p>
      ${(H.sops || []).length || H.training ? `<h2>${L('Procedures and training')}</h2><div class="chips no-print">${(H.sops || []).map(s => `<a class="chip" href="${href('sops/' + s)}">${esc(labelOf('sops/' + s))}</a>`).join('')}${H.training ? `<a class="chip" href="${href('training')}#${esc(H.training)}">${L('Training')}</a><a class="chip" href="${href('training/checklists')}#${esc(H.training)}">${esc(labelOf('training/checklists'))}</a>` : ''}</div><p class="print-only small">${(H.sops || []).map(s => esc(labelOf('sops/' + s))).join(', ')}</p>` : ''}
      <h2>${L('Read and understood')}</h2>
      <div class="signoff"><div>${L('Employee')}</div><div>${L('Manager')}</div><div>${esc(ui('date'))}</div><div>${esc(ui('signature'))}</div></div>
      <div class="btn-row no-print"><button type="button" class="btn primary" data-print="#tab-handbook" data-print-title="${esc(job.title)}: ${L('Job handbook')}">${L('Print this handbook')}</button></div>
    </section>
    <section id="tab-posting" class="tabpanel jb posting" ${tab === 'posting' ? '' : 'hidden'}>
      <h2>${esc(P.headline)}</h2>
      <p>${esc(P.about)}</p>
      <h3>${L('What you will do')}</h3>${list(P.do)}
      <h3>${L('What you need')}</h3>${list(P.need)}
      ${(P.plus || []).length ? `<h3>${L('Nice to have')}</h3>${list(P.plus)}` : ''}
      <h3>${L('What we offer')}</h3>${list(P.offer)}
      <h3>${L('How to apply')}</h3>
      <p>${esc(P.apply)}</p>
      <div class="btn-row no-print"><button type="button" class="btn primary" id="copy-posting">${L('Copy the text')}</button><button type="button" class="btn" data-print="#tab-posting" data-print-title="${esc(P.headline)}">${L('Print the posting')}</button></div>
    </section>
    <section id="tab-offer" class="tabpanel jb" ${tab === 'offer' ? '' : 'hidden'}>
      <p class="mute no-print">${L('Fill the fields once. They are saved on this device. The letter below updates as you type.')}</p>
      <form id="offer-form" class="fields two no-print" autocomplete="off">${FIELDS.map(([id, lab]) => `<div class="field"><label for="of-${id}">${lab}</label><input id="of-${id}" name="${id}" value="${esc(vals()[id] || '')}"></div>`).join('')}</form>
      <div class="btn-row no-print"><button type="button" class="btn primary" data-print="#offer-out" data-print-title="${esc(O.heading)}: ${esc(job.title)}">${L('Print the letter')}</button><button type="button" class="btn" id="offer-clear">${L('Clear')}</button></div>
      <div id="offer-out">${letter()}</div>
    </section>
    ${others.length ? `<section class="no-print">
      <h2>${L('Other jobs on this team')}</h2>
      <div class="chips">${others.map(s => `<a class="chip" href="${href('jobs/' + s)}">${esc(labelOf('jobs/' + s))}</a>`).join('')}</div>
    </section>` : ''}`;
  };
  render();

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-tab]');
    if (b) { tab = b.dataset.tab; setHash(tab === 'handbook' ? '' : tab); document.querySelectorAll('.tabpanel').forEach(p => { p.hidden = p.id !== 'tab-' + tab; }); document.querySelectorAll('[data-tab]').forEach(x => { const on = x.dataset.tab === tab; x.classList.toggle('on', on); x.setAttribute('aria-selected', String(on)); }); return; }
    if (e.target.id === 'offer-clear') { store.remove(KEY); render(); return; }
    if (e.target.id === 'copy-posting') {
      const text = plain();
      const ok = () => toast(L('Copied.'));
      const fail = () => toast(L('Copy did not work here. Select the text and copy it.'));
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, fail); else fail();
    }
  });
  document.addEventListener('input', e => {
    const f = e.target.closest('#offer-form'); if (!f) return;
    const v = vals(); v[e.target.name] = e.target.value; store.set(KEY, v);
    document.getElementById('offer-out').innerHTML = letter();
  });
}
