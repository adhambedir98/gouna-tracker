// Every live edit made in place on the site: what changed, where, by whom, and whether it is in the source yet.
// Text changes, sections hidden or deleted, and sections moved. Anyone can read the list. Undoing one takes the management code.
import { mount, esc, labels, store, toast, fmt, href, ask } from '../app.js';
import { cfg, rpc, friendly, CODE } from '../online.js';

const L = await labels('edits');
const app = await mount({ page: 'edits', title: L('Edits'), lede: L('Text changed in place with the Edit button, and sections moved, hidden, or deleted, newest first. A live edit shows for everyone now. A text edit stays for good once it is written into the source. A section change is done by hand in the source, then marked done here.'), noEdit: true });

let rows = [];
const H = { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key };
const PAGE = { all: L('every page'), start: L('Start') };

async function load() {
  app.content.innerHTML = `<p class="mute">${esc(L('Loading'))}</p>`;
  try {
    const r = await fetch(`${cfg.url}/rest/v1/dr_edits?select=id,page,lang,kind,before,after,who,at,applied&order=at.desc&limit=500`, { headers: H });
    if (!r.ok) throw new Error('load');
    rows = await r.json();
    render();
  } catch (err) {
    app.content.innerHTML = `<p class="callout late">${esc(friendly(L, err.message))}</p><div class="btn-row"><button type="button" class="btn primary" id="retry">${esc(L('Try again'))}</button></div>`;
    document.getElementById('retry').addEventListener('click', load);
  }
}

function change(r) {
  const kind = r.kind || 'text';
  if (kind === 'text') return `<s class="mute">${esc(r.before)}</s><span style="display:block">${esc(r.after)}</span>`;
  if (kind === 'hide') return `<span class="pill">${esc(L('Section hidden'))}</span> ${esc(r.after || r.before)}`;
  if (kind === 'delete') return `<span class="pill late">${esc(L('Section deleted'))}</span> ${esc(r.after || r.before)}`;
  let order = '';
  try { order = (JSON.parse(r.after).labels || []).filter(Boolean).join(', '); } catch { /* an old row */ }
  return `<span class="pill">${esc(L('Sections moved'))}</span> <span class="small">${esc(L('New order'))}: ${esc(order || r.before)}</span>`;
}

function render() {
  const live = rows.filter(r => !r.applied), done = rows.filter(r => r.applied);
  const row = r => `<tr${r.applied ? ' class="mute"' : ''}>
    <td class="when">${esc(String(r.at).slice(0, 16).replace('T', ' '))}<span class="tiny mute" style="display:block">${esc(r.who || '')}</span></td>
    <td>${r.page === 'all' ? esc(PAGE.all) : `<a href="${href(r.page === 'start' ? '' : r.page)}">${esc(PAGE[r.page] || r.page)}</a>`}${r.lang === 'ar' ? ` <span class="pill">${esc(L('Arabic'))}</span>` : ''}</td>
    <td class="txt">${change(r)}</td>
    <td>${r.applied ? `<span class="pill st-closed">${esc(L('in the source'))}</span>` : `<span class="pill st-open">${esc(L('live'))}</span> <button type="button" class="btn small" data-undo="${esc(r.id)}">${esc(L('Undo'))}</button>${(r.kind || 'text') !== 'text' ? ` <button type="button" class="btn small" data-done="${esc(r.id)}">${esc(L('Done in the source'))}</button>` : ''}`}</td></tr>`;
  app.content.innerHTML = `
    <div class="stat">
      <div><div class="big num">${fmt(live.length)}</div><div class="lbl">${esc(L('live, not yet in the source'))}</div></div>
      <div><div class="big num">${fmt(done.length)}</div><div class="lbl">${esc(L('written into the source'))}</div></div>
    </div>
    <p class="mute small">${esc(L('To change text: open any page, click Edit at the top, click the text, change it, and click away. To move, hide, or delete a section, use the small bar on it. The management code is asked once.'))}</p>
    <div class="t-wrap"><table class="t reg" id="edits"><thead><tr><th>${esc(L('When'))}</th><th>${esc(L('Page'))}</th><th>${esc(L('Change'))}</th><th>${esc(L('Status'))}</th></tr></thead>
    <tbody>${rows.map(row).join('') || `<tr><td colspan="4" class="mute">${esc(L('No edits yet.'))}</td></tr>`}</tbody></table></div>`;
}

// one listener for the whole list: Undo removes a row, Done in the source marks a section change applied
app.content.addEventListener('click', async e => {
  const b = e.target.closest('[data-undo], [data-done]'); if (!b) return;
  let code = store.get(CODE, '');
  if (!code) { code = await ask({ title: L('Management code'), secret: true, ok: L('Continue'), cancel: L('Cancel') }); if (!code) return; store.set(CODE, code); }
  b.disabled = true;
  try {
    if (b.dataset.undo) { await rpc('dr_edit', { p_code: code, p_action: 'delete', p: { id: b.dataset.undo, who: store.get('vm.report.by', '') } }); toast(L('Undone. Reload the page to see the original.')); }
    else { await rpc('dr_edit', { p_code: code, p_action: 'applied', p: { ids: [b.dataset.done] } }); toast(L('Marked as done in the source.')); }
    await load();
  } catch (err) { if (err.message === 'wrong code') store.remove(CODE); toast(friendly(L, err.message)); b.disabled = false; }
});

load();
