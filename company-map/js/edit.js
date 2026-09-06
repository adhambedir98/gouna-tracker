// Live edits. With the management code, any text on any page can be changed in place, and any section can be moved up
// or down, hidden, or deleted: click Edit, then click the text, or use the small bar on a section. Every change is kept
// in the database and applied for everyone on their next load, until it is written into the source files
// (node scripts/pull-edits.mjs). The single-file copy has no network, so it never loads this module.
import { loadJSON, store, toast, lang, ask, esc, onLang } from './app.js';

const CODE = 'vm.report.code', BY = 'vm.report.by';
const X = {
  en: {
    edit: 'Edit', done: 'Done', list: 'All edits',
    bar: 'Editing. Click any text to change it, then click away. Use the small bar on a section to move, hide, or delete it. Everyone sees the changes on their next load.',
    codeT: 'Management code', code: 'The code, from Adham or Mano', nameT: 'Your name, for the record', name: 'Name', ok: 'Continue', cancel: 'Cancel',
    saved: 'Saved for everyone.', saving: 'Saving', back: 'Back to the original.', wrong: 'That code is wrong. Click Edit and try again.',
    empty: 'The text cannot be empty.', svg: 'New text', offline: 'No connection to the database. Nothing was saved.',
    up: 'Up', down: 'Down', hide: 'Hide', del: 'Delete', show: 'Show again', hidden: 'Hidden', deleted: 'Deleted', by: 'by',
    moved: 'Moved for everyone.', gone: 'Hidden for everyone. It stays here in edit mode, so it can come back.',
    deletedMsg: 'Deleted for everyone. It stays here in edit mode, so it can come back.', restored: 'Back on the page for everyone.'
  },
  ar: {
    edit: 'تعديل', done: 'تم', list: 'كل التعديلات',
    bar: 'وضع التعديل. اضغط على أي نص لتغييره، ثم اضغط خارجه. استخدم الشريط الصغير على أي قسم لنقله أو إخفائه أو حذفه. الجميع يرون التغييرات عند التحميل التالي.',
    codeT: 'كود الإدارة', code: 'الكود، من أدهم أو مانو', nameT: 'اسمك، للسجل', name: 'الاسم', ok: 'متابعة', cancel: 'إلغاء',
    saved: 'حُفظ للجميع.', saving: 'جارٍ الحفظ', back: 'عاد إلى الأصل.', wrong: 'الكود غير صحيح. اضغط تعديل وحاول مرة أخرى.',
    empty: 'لا يمكن أن يكون النص فارغًا.', svg: 'النص الجديد', offline: 'لا اتصال بقاعدة البيانات. لم يُحفظ شيء.',
    up: 'لأعلى', down: 'لأسفل', hide: 'إخفاء', del: 'حذف', show: 'إظهار من جديد', hidden: 'مخفي', deleted: 'محذوف', by: 'بواسطة',
    moved: 'نُقل للجميع.', gone: 'أُخفي عن الجميع. يبقى هنا في وضع التعديل ليمكن إرجاعه.',
    deletedMsg: 'حُذف للجميع. يبقى هنا في وضع التعديل ليمكن إرجاعه.', restored: 'عاد إلى الصفحة للجميع.'
  }
};
const T = k => (X[lang] || X.en)[k];

let cfg, H, page, on = false, timer = null, reachable = true, closedDetails = [];
let texts = new Map();          // source text -> new text, for this page and for every page
let hides = new Map();          // section key -> { id, kind, who, label }
let orders = new Map();         // container key -> { id, keys }
const src = new WeakMap();      // a text node -> the text it had before an edit was applied to it
const srcOrder = new WeakMap(); // a container -> its section keys in source order

export async function init() {
  cfg = await loadJSON('data/report.json');
  H = { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key, 'Content-Type': 'application/json' };
  page = location.pathname.replace(/index\.html$/, '').replace(/^\/+|\/+$/g, '') || 'start';
  await load();
  applyAll();
  // pages fill their content after mount, so keep applying as the page changes
  new MutationObserver(() => { if (on) return; clearTimeout(timer); timer = setTimeout(applyAll, 40); }).observe(document.body, { childList: true, subtree: true, characterData: true });
  button();
  onLang(() => setTimeout(button, 0));   // the top bar is drawn again when the language changes
}

async function load() {
  texts = new Map(); hides = new Map(); orders = new Map();
  try {
    const q = `select=id,page,lang,kind,before,after,who&applied=eq.false&lang=in.(${lang},all)&page=in.(all,${encodeURIComponent('"' + page + '"')})`;
    const r = await fetch(`${cfg.url}/rest/v1/dr_edits?${q}`, { headers: H, signal: AbortSignal.timeout(15000) });
    reachable = r.ok;
    const rows = r.ok ? await r.json() : [];
    for (const e of rows) if (e.kind === 'text' && e.page === 'all') texts.set(e.before, e.after);
    for (const e of rows) if (e.kind === 'text' && e.page !== 'all') texts.set(e.before, e.after);   // the page's own edit wins
    for (const e of rows) if ((e.kind === 'hide' || e.kind === 'delete') && e.page === page) hides.set(e.before, { id: e.id, kind: e.kind, who: e.who || '', label: e.after || '' });
    for (const e of rows) if (e.kind === 'order' && e.page === page) { try { orders.set(e.before, { id: e.id, keys: JSON.parse(e.after).keys || [] }); } catch { /* a bad row is ignored */ } }
  } catch { reachable = false; }   // no connection: the page shows its source text
}

function applyAll() { applyBlocks(); applyText(); }

/* ---- text ---- */
function* textNodes(root) {
  if (!root) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => {
    const p = n.parentElement;
    if (!p || p.closest('script, style, textarea, select, noscript, #edit-bar, #toast, #ask-box, .bk-bar')) return NodeFilter.FILTER_REJECT;
    return n.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
  } });
  let n;
  while ((n = w.nextNode())) yield n;
}
const original = n => (src.has(n) ? src.get(n) : n.nodeValue.trim());

function applyText() {
  if (!texts.size) return;
  for (const n of textNodes(document.body)) {
    const before = original(n), after = texts.get(before);
    if (after == null || n.nodeValue.trim() === after) continue;
    if (!src.has(n)) src.set(n, before);
    n.nodeValue = n.nodeValue.replace(n.nodeValue.trim(), after);
  }
}

/* ---- sections ----
   A section is a block of the page: the direct children of the content, the cards in a grid, and the parts of a block
   that has several. Its key is its id, or its place in the source: tag and position, level by level. */
const SKIP = 'script, style, template, hr, br, .bk-bar, nav.toc, .print-only, .btn-row.no-print, .no-edit, h1, h2, h3, h4, h5, h6';
const root = () => document.getElementById('content');
const isBlock = el => el.nodeType === 1 && !el.matches(SKIP) && (el.textContent.trim() !== '' || !!el.querySelector('svg, img, table'));
const blocks = c => [...c.children].filter(isBlock);
function containers() {
  const r = root(); if (!r) return [];
  const out = [r];
  for (const b of blocks(r)) if (blocks(b).length > 1) out.push(b);
  for (const g of r.querySelectorAll('.cards, .never-grid, .grid-2, .lead-grid, .rows, ol.steps')) if (!out.includes(g) && blocks(g).length > 1) out.push(g);
  return out;
}
function keyOf(el) {
  if (el.dataset.bk) return el.dataset.bk;
  const parts = [];
  let e = el;
  while (e && e.id !== 'content') {
    if (e.id) { parts.unshift('#' + e.id); break; }
    const p = e.parentElement; if (!p) break;
    parts.unshift(e.tagName.toLowerCase() + ':' + [...p.children].filter(x => !x.classList.contains('bk-bar')).indexOf(e));
    e = p;
  }
  el.dataset.bk = parts.join('/');
  return el.dataset.bk;
}
const ckey = c => (c.id === 'content' ? 'root' : keyOf(c));
function label(b) {
  const h = b.querySelector('h1, h2, h3, h4, summary, legend, .k, strong, b, a');
  const node = [...textNodes(h || b)][0];
  return (node ? original(node) : '').replace(/\s+/g, ' ').slice(0, 60);
}

function applyBlocks() {
  if (!root()) return;
  for (const c of containers()) {
    const bs = blocks(c);
    bs.forEach(keyOf);
    if (!srcOrder.has(c)) srcOrder.set(c, bs.map(keyOf));
    const o = orders.get(ckey(c));
    if (o) reorder(c, o.keys);
  }
  for (const c of containers()) for (const b of blocks(c)) {
    const h = hides.get(keyOf(b));
    b.classList.toggle('bk-off', !!h);
  }
}
function reorder(c, want) {
  const kids = [...c.children].filter(x => !x.classList.contains('bk-bar'));
  const pos = [], els = [];
  kids.forEach((el, i) => { if (isBlock(el) && want.includes(keyOf(el))) { pos.push(i); els.push(el); } });
  els.sort((a, b) => want.indexOf(keyOf(a)) - want.indexOf(keyOf(b)));
  const next = kids.slice();
  pos.forEach((p, i) => { next[p] = els[i]; });
  if (next.every((el, i) => el === kids[i])) return;
  for (const el of next) c.appendChild(el);
}

function bars() {
  for (const c of containers()) {
    const deep = c.id !== 'content';
    for (const b of blocks(c)) {
      if (b.querySelector(':scope > .bk-bar')) continue;
      const bar = document.createElement('div');
      bar.className = 'bk-bar'; bar.dataset.label = label(b);
      b.classList.add('bk'); if (deep) b.classList.add('bk-deep');
      renderBar(bar, b);
      b.prepend(bar);
    }
  }
}
function renderBar(bar, b) {
  const h = hides.get(keyOf(b));
  const name = `<span class="bk-name">${esc(bar.dataset.label)}</span>`;
  bar.innerHTML = h
    ? `${name}<span class="bk-state">${T(h.kind === 'delete' ? 'deleted' : 'hidden')}${h.who ? ' ' + T('by') + ' ' + esc(h.who) : ''}</span><button type="button" data-act="show">${T('show')}</button>`
    : `${name}<button type="button" data-act="up">${T('up')}</button><button type="button" data-act="down">${T('down')}</button><button type="button" data-act="hide">${T('hide')}</button><button type="button" class="warn" data-act="delete">${T('del')}</button>`;
}
async function saveOrder(c) {
  const bs = blocks(c), keys = bs.map(keyOf), labels = bs.map(b => b.querySelector(':scope > .bk-bar')?.dataset.label || '');
  const same = JSON.stringify(keys) === JSON.stringify(srcOrder.get(c) || []);
  const j = await save({ kind: 'order', page, before: ckey(c), after: same ? '' : JSON.stringify({ keys, labels }) });
  if (same) orders.delete(ckey(c)); else orders.set(ckey(c), { id: j.id, keys });
}

/* ---- the button in the top bar ---- */
function button() {
  const top = document.querySelector('.top .in');
  if (!top || document.getElementById('edit')) return;
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'btn-text'; b.id = 'edit'; b.textContent = T(on ? 'done' : 'edit');
  top.insertBefore(b, document.getElementById('lang'));
  b.addEventListener('click', () => (on ? stop() : start()));
}

async function start() {
  let code = store.get(CODE, '');
  if (!code) { code = await ask({ title: T('codeT'), label: T('code'), secret: true, ok: T('ok'), cancel: T('cancel') }); if (!code) return; store.set(CODE, code); }
  if (!store.get(BY, '')) { const who = await ask({ title: T('nameT'), label: T('name'), ok: T('ok'), cancel: T('cancel') }); if (who) store.set(BY, who); }
  on = true;
  document.body.classList.add('editing');
  const btn = document.getElementById('edit'); if (btn) btn.textContent = T('done');
  const bar = document.createElement('div');
  bar.id = 'edit-bar'; bar.className = 'no-print';
  bar.innerHTML = `<span class="hint">${T('bar')}</span><a href="${new URL('edits/', new URL('../', import.meta.url)).href}">${T('list')}</a>`;
  document.body.appendChild(bar);
  // links are for reading: in edit mode their text is for editing, so they stop being links until Done
  for (const a of document.querySelectorAll('#main a[href], #rail a[href]')) { a.dataset.edHref = a.getAttribute('href'); a.removeAttribute('href'); }
  closedDetails = [...document.querySelectorAll('#main details:not([open])')];
  closedDetails.forEach(d => { d.open = true; });
  bars();
  for (const r of [document.getElementById('main'), document.getElementById('rail')]) {
    const inNav = r && r.id === 'rail';
    for (const n of [...textNodes(r)]) {
      const p = n.parentElement;
      if (p.closest('svg, button, input, .no-edit, form.gate')) continue;
      const s = document.createElement('span');
      s.className = 'ed'; s.contentEditable = 'true'; s.spellcheck = false;
      s.dataset.before = original(n); s.dataset.current = n.nodeValue.trim(); s.dataset.page = inNav ? 'all' : page;
      p.insertBefore(s, n); s.appendChild(n);
    }
  }
  if (!reachable) toast(T('offline'));
}

function stop() {
  on = false;
  document.body.classList.remove('editing');
  const b = document.getElementById('edit'); if (b) b.textContent = T('edit');
  document.getElementById('edit-bar')?.remove();
  for (const s of [...document.querySelectorAll('.ed')]) {
    if (s.firstChild && s.firstChild.nodeType === 3 && s.childNodes.length === 1) { s.replaceWith(s.firstChild); continue; }
    s.replaceWith(document.createTextNode(s.textContent));
  }
  for (const bar of document.querySelectorAll('.bk-bar')) bar.remove();
  for (const el of document.querySelectorAll('.bk')) el.classList.remove('bk', 'bk-deep');
  for (const a of document.querySelectorAll('[data-ed-href]')) { a.setAttribute('href', a.dataset.edHref); delete a.dataset.edHref; }
  closedDetails.forEach(d => { d.open = false; }); closedDetails = [];
  applyAll();
}

/* ---- the database ---- */
async function call(body) {
  let r;
  try { r = await fetch(`${cfg.url}/rest/v1/rpc/dr_edit`, { method: 'POST', headers: H, body: JSON.stringify({ p_code: store.get(CODE, ''), ...body }), signal: AbortSignal.timeout(15000) }); }
  catch { throw new Error('offline'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || j.hint || 'error');
  reachable = true;
  return j;
}
const save = p => call({ p_action: 'set', p: { lang, who: store.get(BY, ''), ...p } });
function fail(err) {
  if (err.message === 'wrong code') { store.remove(CODE); toast(T('wrong')); stop(); }
  else toast(err.message === 'offline' ? T('offline') : err.message);
}
async function commit(s) {
  const after = s.textContent.replace(/\s+/g, ' ').trim(), before = s.dataset.before;
  if (after === s.dataset.current) return;
  if (!after) { s.textContent = s.dataset.current; toast(T('empty')); return; }
  const slow = setTimeout(() => toast(T('saving')), 700);
  try {
    await save({ page: s.dataset.page, before, after });
    if (after === before) texts.delete(before); else texts.set(before, after);
    s.dataset.current = after; s.textContent = after;
    toast(after === before ? T('back') : T('saved'));
  } catch (err) {
    s.textContent = s.dataset.current;
    fail(err);
  } finally { clearTimeout(slow); }
}

document.addEventListener('focusout', e => { const s = e.target.closest && e.target.closest('.ed'); if (s && on) commit(s); });
document.addEventListener('keydown', e => {
  const s = e.target.closest && e.target.closest('.ed'); if (!s || !on) return;
  if (e.key === 'Enter') { e.preventDefault(); s.blur(); }
  if (e.key === 'Escape') { e.preventDefault(); s.textContent = s.dataset.current; s.blur(); }
});
// in edit mode a summary's text is for editing, not for opening and closing
document.addEventListener('click', e => { if (on && e.target.closest('summary')) e.preventDefault(); }, true);
document.addEventListener('click', async e => {
  if (!on) return;
  const btn = e.target.closest('.bk-bar button');
  if (btn) {
    e.preventDefault();
    const b = btn.closest('.bk'), c = b.parentElement, bar = btn.closest('.bk-bar'), act = btn.dataset.act, key = keyOf(b);
    if (act === 'up' || act === 'down') {
      const bs = blocks(c), i = bs.indexOf(b), j = act === 'up' ? i - 1 : i + 1;
      if (j < 0 || j >= bs.length) return;
      if (act === 'up') c.insertBefore(b, bs[j]); else c.insertBefore(bs[j], b);
      b.scrollIntoView({ block: 'nearest' });
      try { await saveOrder(c); toast(T('moved')); } catch (err) { fail(err); }
    } else if (act === 'hide' || act === 'delete') {
      btn.disabled = true;
      try {
        const j = await save({ kind: act, page, before: key, after: bar.dataset.label });
        hides.set(key, { id: j.id, kind: act, who: store.get(BY, ''), label: bar.dataset.label });
        b.classList.add('bk-off'); renderBar(bar, b); toast(T(act === 'hide' ? 'gone' : 'deletedMsg'));
      } catch (err) { fail(err); btn.disabled = false; }
    } else if (act === 'show') {
      const h = hides.get(key); if (!h) return;
      btn.disabled = true;
      try {
        await call({ p_action: 'delete', p: { id: h.id, who: store.get(BY, '') } });
        hides.delete(key); b.classList.remove('bk-off'); renderBar(bar, b); toast(T('restored'));
      } catch (err) { fail(err); btn.disabled = false; }
    }
    return;
  }
  const t = e.target.closest('svg text');
  if (!t) return;
  // text drawn in a diagram: a small box instead of editing in place
  const node = [...textNodes(t)][0]; if (!node) return;
  const before = original(node), current = node.nodeValue.trim();
  const after = (await ask({ title: T('svg'), value: current, ok: T('ok'), cancel: T('cancel') })).replace(/\s+/g, ' ').trim();
  if (!after || after === current) return;
  save({ page, before, after }).then(() => { if (!src.has(node)) src.set(node, before); node.nodeValue = after; texts.set(before, after); toast(T('saved')); }).catch(fail);
});
