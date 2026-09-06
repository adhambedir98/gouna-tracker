// Every live edit made in place on the site: what changed, where, by whom, and whether it is in the source yet.
// Anyone can read the list. Undoing one takes the management code.
import { mount, esc, labels, store, toast, fmt, href } from '../app.js';
import { cfg, rpc, friendly, CODE } from '../online.js';

const L = await labels('edits');
const app = await mount({ page: 'edits', title: L('Edits'), lede: L('Text changed in place with the Edit button, newest first. A live edit shows for everyone now. Once it is written into the source it stays for good.'), noEdit: true });

let rows = [];
const H = { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key };
const PAGE = { all: L('every page'), start: L('Start') };

async function load() {
  app.content.innerHTML = `<p class="mute">${esc(L('Loading'))}</p>`;
  try {
    const r = await fetch(`${cfg.url}/rest/v1/dr_edits?select=id,page,lang,before,after,who,at,applied&order=at.desc&limit=500`, { headers: H });
    if (!r.ok) throw new Error('load');
    rows = await r.json();
    render();
  } catch (err) {
    app.content.innerHTML = `<p class="callout late">${esc(friendly(L, err.message))}</p><div class="btn-row"><button type="button" class="btn primary" id="retry">${esc(L('Try again'))}</button></div>`;
    document.getElementById('retry').addEventListener('click', load);
  }
}

function render() {
  const live = rows.filter(r => !r.applied), done = rows.filter(r => r.applied);
  const row = r => `<tr${r.applied ? ' class="mute"' : ''}>
    <td class="when">${esc(String(r.at).slice(0, 16).replace('T', ' '))}<span class="tiny mute" style="display:block">${esc(r.who || '')}</span></td>
    <td>${r.page === 'all' ? esc(PAGE.all) : `<a href="${href(r.page === 'start' ? '' : r.page)}">${esc(PAGE[r.page] || r.page)}</a>`}${r.lang === 'ar' ? ` <span class="pill">${esc(L('Arabic'))}</span>` : ''}</td>
    <td class="txt"><s class="mute">${esc(r.before)}</s><span style="display:block">${esc(r.after)}</span></td>
    <td>${r.applied ? `<span class="pill st-closed">${esc(L('in the source'))}</span>` : `<span class="pill st-open">${esc(L('live'))}</span> <button type="button" class="btn small" data-undo="${esc(r.id)}">${esc(L('Undo'))}</button>`}</td></tr>`;
  app.content.innerHTML = `
    <div class="stat">
      <div><div class="big num">${fmt(live.length)}</div><div class="lbl">${esc(L('live, not yet in the source'))}</div></div>
      <div><div class="big num">${fmt(done.length)}</div><div class="lbl">${esc(L('written into the source'))}</div></div>
    </div>
    <p class="mute small">${esc(L('To change text: open any page, click Edit at the top, click the text, change it, and click away. The management code is asked once.'))}</p>
    <div class="t-wrap"><table class="t reg" id="edits"><thead><tr><th>${esc(L('When'))}</th><th>${esc(L('Page'))}</th><th>${esc(L('Before and after'))}</th><th>${esc(L('Status'))}</th></tr></thead>
    <tbody>${rows.map(row).join('') || `<tr><td colspan="4" class="mute">${esc(L('No edits yet.'))}</td></tr>`}</tbody></table></div>`;
  app.content.addEventListener('click', async e => {
    const b = e.target.closest('[data-undo]'); if (!b) return;
    let code = store.get(CODE, '');
    if (!code) { code = (prompt(L('Management code')) || '').trim(); if (!code) return; store.set(CODE, code); }
    b.disabled = true;
    try { await rpc('dr_edit', { p_code: code, p_action: 'delete', p: { id: b.dataset.undo, who: store.get('vm.report.by', '') } }); toast(L('Undone. Reload the page to see the original.')); await load(); }
    catch (err) { if (err.message === 'wrong code') store.remove(CODE); toast(friendly(L, err.message)); b.disabled = false; }
  });
}

load();
