// One standard procedure page: purpose, who and when, what you need, numbered steps with a check each, what goes wrong, escalation, sign-off.
// Every sops-<slug>.js page module calls sopPage('<slug>'); the content lives in data/sops/<slug>.json.
import { mount, loadJSON, esc, t, site, href, labels } from './app.js';

export async function sopPage(slug) {
  const L = await labels('sop');
  const sop = await loadJSON(`data/sops/${slug}.json`);
  const index = await loadJSON('data/sops/index.json');
  const ui = k => t(site.ui[k]);
  const app = await mount({
    page: `sops/${slug}`,
    title: sop.title,
    lede: sop.purpose,
    toc: [{ id: 'steps', label: L('Steps') }, { id: 'fails', label: L('If something goes wrong') }, { id: 'signoff', label: L('Sign-off') }]
  });
  const group = index.groups.find(g => g.sops.includes(slug));
  const others = group ? group.sops.filter(s => s !== slug) : [];
  const navItems = site.nav.flatMap(g => g.items);
  const labelOf = path => t((navItems.find(i => i.path === path) || {}).label) || path;
  app.content.innerHTML = `
    <section style="margin-top:0">
      <div class="glance">
        <div><span class="k">${L('Who')}</span><b>${esc(sop.owner)}</b>${sop.with ? `<span class="mute">with ${esc(sop.with)}</span>` : ''}</div>
        <div><span class="k">${L('When')}</span><b>${esc(sop.when)}</b></div>
        ${sop.takes ? `<div><span class="k">${L('Takes')}</span><b>${esc(sop.takes)}</b></div>` : ''}
      </div>
      ${(sop.needs || []).length ? `<p class="needs"><span class="k">${L('You need')}</span>${sop.needs.map(x => `<span class="chip still">${esc(x)}</span>`).join('')}</p>` : ''}
    </section>
    <section id="steps">
      <h2>${L('Steps')}</h2>
      <ol class="steps sop">${(sop.steps || []).map((s, i) => `<li><span class="n">${i + 1}</span><b>${esc(s.do)}</b>${s.who || s.time ? `<div class="meta">${s.who ? `<span class="who">${esc(s.who)}</span>` : ''}${s.time ? `<span class="clock">${esc(s.time)}</span>` : ''}</div>` : ''}${s.detail ? `<div class="d">${esc(s.detail)}</div>` : ''}${s.check ? `<div class="check"><span class="k">${L('Check')}</span>${esc(s.check)}</div>` : ''}</li>`).join('')}</ol>
      <p class="callout done"><b>${L('Done when')}.</b> ${esc(sop.done)}</p>
    </section>
    <section id="fails">
      <h2>${L('If something goes wrong')}</h2>
      <div class="fails"><div class="fail head"><span>${L('If this happens')}</span><span>${L('Do this')}</span></div>${(sop.fails || []).map(f => `<div class="fail"><span class="f">${esc(f.if)}</span><span class="r">${esc(f.then)}</span></div>`).join('')}</div>
      ${sop.escalate ? `<p><b>${L('Escalate')}.</b> ${esc(/[.!?]$/.test(sop.escalate.trim()) ? sop.escalate.trim() : sop.escalate.trim() + '.')}</p><p><a class="chip" href="${href('call')}">${esc(labelOf('call'))}</a></p>` : ''}
    </section>
    ${(sop.links || []).length ? `<section>
      <h2>${L('Where this is explained')}</h2>
      <div>${sop.links.filter((p, i, arr) => arr.findIndex(q => q.split('#')[0] === p.split('#')[0]) === i).map(p => { const [path, hash] = p.split('#'); return `<a class="chip" href="${href(path)}${hash ? '#' + hash : ''}">${esc(labelOf(path))}</a>`; }).join('')}</div>
    </section>` : ''}
    <section id="signoff">
      <h2>${L('Sign-off')}</h2>
      <p class="mute small">${L('Read it, do it once with your trainer, then both sign. The signed page goes to Mano.')}</p>
      <div class="signoff"><div>${esc(ui('trainee'))}</div><div>${esc(ui('trainer'))}</div><div>${esc(ui('date'))}</div><div>${esc(ui('signature'))}</div></div>
      <div class="btn-row no-print"><button type="button" class="btn primary" data-print>${L('Print this procedure')}</button></div>
    </section>
    ${others.length ? `<section class="no-print">
      <h2>${L('Related procedures')}</h2>
      <div>${others.map(s => `<a class="chip" href="${href('sops/' + s)}">${esc(labelOf('sops/' + s))}</a>`).join('')}</div>
    </section>` : ''}`;
}
