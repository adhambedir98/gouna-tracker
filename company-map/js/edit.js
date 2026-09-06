// Live edits. With the management code, any text on any page can be changed in place: click Edit, click the text, change it,
// click away. The change is kept in the database and applied for everyone on their next load, until it is written into the
// source files (node scripts/pull-edits.mjs). The single-file copy has no network, so it never loads this module.
import { loadJSON, store, toast, lang } from './app.js';

const CODE = 'vm.report.code', BY = 'vm.report.by';
const X = {
  en: { edit: 'Edit', done: 'Done', bar: 'Editing. Click any text, change it, click away. Everyone sees the change on their next load.', list: 'All edits', code: 'Management code', name: 'Your name, for the record', saved: 'Saved for everyone.', back: 'Back to the original.', wrong: 'That code is wrong. Click Edit again.', empty: 'The text cannot be empty.', svg: 'New text' },
  ar: { edit: 'تعديل', done: 'تم', bar: 'وضع التعديل. اضغط على أي نص، غيّره، ثم اضغط خارجه. الجميع يرون التغيير عند التحميل التالي.', list: 'كل التعديلات', code: 'كود الإدارة', name: 'اسمك، للسجل', saved: 'حُفظ للجميع.', back: 'عاد إلى الأصل.', wrong: 'الكود غير صحيح. اضغط تعديل مرة أخرى.', empty: 'لا يمكن أن يكون النص فارغًا.', svg: 'النص الجديد' }
};
const T = k => (X[lang] || X.en)[k];

let cfg, H, page, map = new Map(), on = false, timer = null;
const src = new WeakMap();   // a text node -> the text it had before an edit was applied to it

export async function init() {
  cfg = await loadJSON('data/report.json');
  H = { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key, 'Content-Type': 'application/json' };
  page = location.pathname.replace(/index\.html$/, '').replace(/^\/+|\/+$/g, '') || 'start';
  await load();
  apply();
  // pages fill their content after mount, so keep applying as the page changes
  new MutationObserver(() => { if (on) return; clearTimeout(timer); timer = setTimeout(apply, 40); }).observe(document.body, { childList: true, subtree: true, characterData: true });
  button();
}

async function load() {
  map = new Map();
  try {
    const q = `select=page,lang,before,after&applied=eq.false&lang=eq.${lang}&page=in.(all,${encodeURIComponent('"' + page + '"')})`;
    const r = await fetch(`${cfg.url}/rest/v1/dr_edits?${q}`, { headers: H });
    const rows = r.ok ? await r.json() : [];
    for (const e of rows) if (e.page === 'all') map.set(e.before, e.after);
    for (const e of rows) if (e.page !== 'all') map.set(e.before, e.after);   // the page's own edit wins
  } catch { /* no connection: the page shows its source text */ }
}

function* textNodes(root) {
  if (!root) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => {
    const p = n.parentElement;
    if (!p || p.closest('script, style, textarea, select, noscript, #edit-bar, #toast')) return NodeFilter.FILTER_REJECT;
    return n.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
  } });
  let n;
  while ((n = w.nextNode())) yield n;
}
const original = n => (src.has(n) ? src.get(n) : n.nodeValue.trim());

function apply() {
  if (!map.size) return;
  for (const n of textNodes(document.body)) {
    const before = original(n), after = map.get(before);
    if (after == null || n.nodeValue.trim() === after) continue;
    if (!src.has(n)) src.set(n, before);
    n.nodeValue = n.nodeValue.replace(n.nodeValue.trim(), after);
  }
}

/* the button in the top bar */
function button() {
  const top = document.querySelector('.top .in');
  if (!top || document.getElementById('edit')) return;
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'btn-text'; b.id = 'edit'; b.textContent = T('edit');
  top.insertBefore(b, document.getElementById('lang'));
  b.addEventListener('click', () => (on ? stop() : start()));
}

function start() {
  let code = store.get(CODE, '');
  if (!code) { code = (prompt(T('code')) || '').trim(); if (!code) return; store.set(CODE, code); }
  if (!store.get(BY, '')) { const who = (prompt(T('name')) || '').trim(); if (who) store.set(BY, who); }
  on = true;
  document.body.classList.add('editing');
  document.getElementById('edit').textContent = T('done');
  const bar = document.createElement('div');
  bar.id = 'edit-bar'; bar.className = 'no-print';
  bar.innerHTML = `<span>${T('bar')}</span><a href="${new URL('edits/', new URL('../', import.meta.url)).href}">${T('list')}</a>`;
  document.body.appendChild(bar);
  for (const root of [document.getElementById('main'), document.getElementById('rail')]) {
    const inNav = root && root.id === 'rail';
    for (const n of [...textNodes(root)]) {
      const p = n.parentElement;
      if (p.closest('svg, button, input, .no-edit, form.gate')) continue;
      const s = document.createElement('span');
      s.className = 'ed'; s.contentEditable = 'true'; s.spellcheck = false;
      s.dataset.before = original(n); s.dataset.current = n.nodeValue.trim(); s.dataset.page = inNav ? 'all' : page;
      p.insertBefore(s, n); s.appendChild(n);
    }
  }
}

function stop() {
  on = false;
  document.body.classList.remove('editing');
  const b = document.getElementById('edit'); if (b) b.textContent = T('edit');
  document.getElementById('edit-bar')?.remove();
  for (const s of [...document.querySelectorAll('.ed')]) {
    const t = document.createTextNode(s.textContent);
    if (s.firstChild && s.firstChild.nodeType === 3 && s.childNodes.length === 1) { s.replaceWith(s.firstChild); continue; }
    s.replaceWith(t);
  }
  apply();
}

async function save(pg, before, after, who) {
  const r = await fetch(`${cfg.url}/rest/v1/rpc/dr_edit`, { method: 'POST', headers: H, body: JSON.stringify({ p_code: store.get(CODE, ''), p_action: 'set', p: { page: pg, lang, before, after, who } }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || j.hint || 'error');
  if (after === before) map.delete(before); else map.set(before, after);
  return j;
}
async function commit(s) {
  const after = s.textContent.replace(/\s+/g, ' ').trim(), before = s.dataset.before;
  if (after === s.dataset.current) return;
  if (!after) { s.textContent = s.dataset.current; toast(T('empty')); return; }
  try {
    await save(s.dataset.page, before, after, store.get(BY, ''));
    s.dataset.current = after; s.textContent = after;
    toast(after === before ? T('back') : T('saved'));
  } catch (err) {
    s.textContent = s.dataset.current;
    if (err.message === 'wrong code') { store.remove(CODE); toast(T('wrong')); stop(); } else toast(err.message);
  }
}

document.addEventListener('focusout', e => { const s = e.target.closest && e.target.closest('.ed'); if (s && on) commit(s); });
document.addEventListener('keydown', e => {
  const s = e.target.closest && e.target.closest('.ed'); if (!s || !on) return;
  if (e.key === 'Enter') { e.preventDefault(); s.blur(); }
  if (e.key === 'Escape') { e.preventDefault(); s.textContent = s.dataset.current; s.blur(); }
});
document.addEventListener('click', e => {
  if (!on) return;
  const a = e.target.closest('a');
  if (a && !a.closest('#edit-bar')) e.preventDefault();      // links are for reading; in edit mode their text is for editing
  const t = e.target.closest('svg text');
  if (!t) return;
  // text drawn in a diagram: a small box instead of editing in place
  const node = [...textNodes(t)][0]; if (!node) return;
  const before = original(node), current = node.nodeValue.trim();
  const after = (prompt(T('svg'), current) || '').replace(/\s+/g, ' ').trim();
  if (!after || after === current) return;
  save(page, before, after, store.get(BY, '')).then(() => { if (!src.has(node)) src.set(node, before); node.nodeValue = after; toast(T('saved')); })
    .catch(err => { if (err.message === 'wrong code') { store.remove(CODE); toast(T('wrong')); stop(); } else toast(err.message); });
});
