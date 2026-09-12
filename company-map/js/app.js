// Company map. Shared runtime: data loading, language, chrome, storage, print.

export const ROOT = (() => { try { return new URL('../', import.meta.url); } catch { return new URL(location.href); } })();
export let site = null;
const PROTECT = new Set(['id', 'k', 'path', 'slug', 'route', 'kind', 'hub', 'ids', 'sub', 'picture', 'loop', 'start', 'due', 'date', 'version', 'at', 'nameAr', 'pages']);

const cache = new Map();
const listeners = new Set();
let opts = {};

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Returns the current-language string for a plain string or an {en, ar} object.
export function t(v) {
  if (v == null) return '';
  if (typeof v !== 'object') return String(v);
  const s = v[lang] ?? v.en;
  return s == null ? '' : String(s);
}

export function fmt(n) {
  const x = Number(n);
  return Number.isFinite(x) ? x.toLocaleString('en-US', { maximumFractionDigits: 1 }) : String(n);
}

export function href(path) {
  const p = String(path || '').replace(/^\/+/, '').replace(/\/+$/, '');
  if (globalThis.__VM_HREF__) return globalThis.__VM_HREF__(p);
  return p ? new URL(p + '/', ROOT).href : ROOT.href;
}

// The current page's state hash. A bundled build supplies it; a served site reads the URL.
export function initialHash() {
  const h = globalThis.__VM_HASH__;
  return h != null ? String(h) : location.hash.slice(1);
}
export function setHash(h) {
  if (globalThis.__VM_SETHASH__) { globalThis.__VM_SETHASH__(h || ''); return; }
  try { history.replaceState(null, '', h ? '#' + h : location.pathname + location.search); } catch {}
}

// Where the content comes from. On a machine it is the files in data/. On the deployed site those files are not there at all:
// every page asks the database for them and gets back only what the reader's role may open. A file that is missing on a machine
// falls through to the database too, so a half-built copy still works.
const LOCAL = ['', 'localhost', '127.0.0.1', '::1'].includes(location.hostname) || location.hostname.endsWith('.local') || location.protocol === 'file:';
let fromFiles = LOCAL;
let want = new Map();       // path -> the promise waiting for it, so one round trip carries every file a page asks for
let waiting = null;

function fromDatabase(path, optional) {
  if (!want.has(path)) {
    let settle;
    const p = new Promise((res, rej) => { settle = { res, rej }; });
    want.set(path, { p, settle, optional });
    if (!waiting) waiting = Promise.resolve().then(async () => {
      const batch = want; want = new Map(); waiting = null;
      const paths = [...batch.keys()];
      try {
        const { api } = await import('./auth.js');
        const got = await api('dr_content', { p_paths: paths });
        for (const [k, v] of batch) {
          const body = got && Object.prototype.hasOwnProperty.call(got, k) ? got[k] : null;
          if (body != null) v.settle.res(body);
          else if (v.optional) v.settle.res(null);
          else v.settle.rej(new Error(`Could not load ${k}`));
        }
      } catch (err) {
        for (const [, v] of batch) v.optional ? v.settle.res(null) : v.settle.rej(err);
      }
    });
  }
  return want.get(path).p;
}

async function fetchJSON(path, optional) {
  const pre = globalThis.__VM_DATA__;
  if (pre) return Object.prototype.hasOwnProperty.call(pre, path) ? pre[path] : (optional ? null : Promise.reject(new Error(`Could not load ${path}`)));
  if (fromFiles) {
    const r = await fetch(new URL(path, ROOT)).catch(() => null);
    if (r && r.ok) return r.json();
    if (r && r.status === 404 && optional) return null;
  }
  return fromDatabase(path, optional);
}
export async function loadJSON(path) {
  const key = lang + ':' + path;
  if (cache.has(key)) return cache.get(key);
  const p = (async () => {
    const en = await fetchJSON(path, false);
    if (lang !== 'ar' || path.startsWith('data/ar/')) return en;
    if (!(await arFiles()).has(arPath(path))) return en;
    const ar = await fetchJSON(arPath(path), true).catch(() => null);
    return ar ? mergeAr(en, ar) : en;
  })();
  cache.set(key, p);
  return p;
}

// Page-level labels. The English string is the key; data/ui.json maps it to Arabic per page, with a shared "common" block.
// const L = await labels('map'); L('Reporting lines') gives the Arabic in Arabic mode and the English otherwise.
export async function labels(page) {
  const ui = await loadJSON('data/ui.json');
  const own = ui[page] || {}, common = ui.common || {};
  return (s, vars) => {
    s = String(s ?? '');
    let out = s;
    if (lang === 'ar') { const v = own[s] ?? common[s]; if (v != null) out = String(v); }
    return vars ? out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : out;
  };
}

/* storage: window.storage if it exists, then localStorage, then memory */
const mem = new Map();
function backend() {
  try {
    const w = window.storage;
    if (w && typeof w.getItem === 'function' && typeof w.setItem === 'function') return w;
  } catch {}
  try {
    localStorage.setItem('vm.probe', '1');
    localStorage.removeItem('vm.probe');
    return localStorage;
  } catch { return null; }
}
export const store = {
  get(key, fallback) {
    try {
      const b = backend();
      const raw = b ? b.getItem(key) : mem.get(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  },
  set(key, value) {
    try {
      const b = backend();
      const raw = JSON.stringify(value);
      if (b) b.setItem(key, raw); else mem.set(key, raw);
    } catch {}
  },
  remove(key) {
    try {
      const b = backend();
      if (b) b.removeItem(key); else mem.delete(key);
    } catch {}
  }
};

/* language: read once at load so every page, and every JSON it loads, uses it */
export let lang = store.get('vm.lang', 'en') === 'ar' ? 'ar' : 'en';
export function onLang(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// Switching language reloads the page so every data file comes back in the new language.
export function setLang(next) {
  const l = next === 'ar' ? 'ar' : 'en';
  store.set('vm.lang', l);
  if (globalThis.__VM_RELOAD__) { globalThis.__VM_RELOAD__(); return; }
  location.reload();
}

// Arabic data lives beside the English in data/ar/, same shape. Strings are swapped in; identifiers are kept.
function arPath(path) { return path.replace(/^data\//, 'data/ar/'); }
// data/ar/index.json lists the Arabic files that exist, so nothing is requested blindly.
let arList = null;
function arFiles() {
  if (!arList) arList = fetchJSON('data/ar/index.json', true).catch(() => null).then(m => new Set(((m && m.files) || []).map(f => 'data/ar/' + f)));
  return arList;
}
function mergeAr(en, ar) {
  if (Array.isArray(en)) return en.map((v, i) => (Array.isArray(ar) && i < ar.length) ? mergeAr(v, ar[i]) : v);
  if (en && typeof en === 'object') {
    if (typeof en.en === 'string') return en;
    const out = {};
    for (const [k, v] of Object.entries(en)) out[k] = (ar && typeof ar === 'object' && k in ar && !PROTECT.has(k)) ? mergeAr(v, ar[k]) : v;
    return out;
  }
  if (typeof en === 'string' && typeof ar === 'string') return ar;
  return en;
}

function applyLang() {
  const d = document.documentElement;
  d.lang = lang;
  d.dir = lang === 'ar' ? 'rtl' : 'ltr';
  renderTop();
  renderNav();
  renderHead();
  renderFoot();
}

function ui(key) { return t((site.ui || {})[key]) || key; }

/* mount */
const FAVICON = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#1E4D3B"/><path d="M8 9l8 15 8-15" fill="none" stroke="#F4F1EA" stroke-width="3.2" stroke-linejoin="round"/></svg>');

export let me = null;

export async function mount(o) {
  opts = o || {};
  listeners.clear();
  if (!document.querySelector('link[rel=icon]')) { const l = document.createElement('link'); l.rel = 'icon'; l.href = FAVICON; document.head.appendChild(l); }
  // Who is reading, before anything is loaded, so the list only ever offers what they can open.
  // The single-file copy has no network and no accounts: it is the whole map in one file, on purpose.
  if (!globalThis.__VM_DATA__) {
    const [{ guard }, { mayOpen }] = await Promise.all([import('./guard.js'), import('./access.js')]);
    mayOpenSync = mayOpen;
    me = await guard(opts.page);
    // noGate: a page guarded by the management code instead of a role, so the first account can be let in before any account exists
    if (!opts.noGate && !mayOpen(me, opts.page)) { await denied(me); return new Promise(() => {}); }
  }
  site = await loadJSON('data/site.json');
  document.body.dataset.page = opts.page || '';
  if (opts.wide) document.getElementById('main')?.classList.add('wide');
  applyLang();
  wireChrome();
  wirePrint();
  wireProgress();
  // live edits: text changed in place by management, kept in the database. Not in the single-file copy, which has no network.
  if (!globalThis.__VM_DATA__ && !opts.noEdit) import('./edit.js').then(m => m.init()).catch(() => {});
  if (globalThis.__VM_DATA__ && !opts.noEdit) { liveEditLink(); onLang(() => setTimeout(liveEditLink, 0)); }
  return { site, content: document.getElementById('content'), lang: () => lang };
}

/* the single-file copy cannot save edits: its Edit button opens the same page on the live site */
async function liveEditLink() {
  const rep = await loadJSON('data/report.json').catch(() => null);
  const top = document.querySelector('.top .in');
  if (!rep || !rep.host || !top || document.getElementById('edit')) return;
  const a = document.createElement('a');
  a.className = 'btn-text'; a.id = 'edit'; a.target = '_blank'; a.rel = 'noopener';
  a.href = rep.host.replace(/\/$/, '') + '/' + (globalThis.__VM_PATH__ ? globalThis.__VM_PATH__ + '/' : '');
  a.textContent = lang === 'ar' ? 'التعديل على الموقع المباشر' : 'Edit on the live site';
  top.insertBefore(a, document.getElementById('lang'));
}

function here() { return location.pathname.replace(/index\.html$/, '').replace(/\/?$/, '/'); }
function isOn(path) {
  const p = String(path || '').replace(/^\/+/, '').replace(/\/+$/, '');
  if (globalThis.__VM_PATH__ !== undefined) return globalThis.__VM_PATH__ === p;
  return new URL(href(path)).pathname.replace(/\/?$/, '/') === here();
}

const canOpen = i => !me || !mayOpenSync || mayOpenSync(me, i.path);
let mayOpenSync = null;
function navHTML() {
  const read = readMap();
  const groups = site.nav.map(g => ({ ...g, items: g.items.filter(canOpen) })).filter(g => g.items.length);
  const all = groups.flatMap(g => g.items);
  const doneAll = all.filter(i => read[i.path]).length;
  const pct = all.length ? Math.round(doneAll / all.length * 100) : 0;
  const head = `<div class="prog"><div class="bar"><i style="width:${pct}%"></i></div><span>${esc(ui('readCount').replace('{n}', fmt(doneAll)).replace('{all}', fmt(all.length)))}</span></div>`;
  return head + groups.map((g, gi) => {
    const done = g.items.filter(i => read[i.path]).length;
    const head = `<div class="g"><span class="gn">${gi + 1}</span>${esc(t(g.group))}<span class="gc${done === g.items.length ? ' full' : ''}">${fmt(done)}/${fmt(g.items.length)}</span></div>`;
    return head + g.items.map(i =>
      `${i.sub ? `<div class="sg">${esc(t(i.sub))}</div>` : ''}<a href="${href(i.path)}"${isOn(i.path) ? ' class="on" aria-current="page"' : ''}${read[i.path] ? ' data-read' : ''}>${esc(t(i.label))}</a>`).join('');
  }).join('');
}

/* reading progress: the line under the top bar follows the scroll, and a page counts as read once you reach its end */
const READ_KEY = 'vm.read';
const readMap = () => store.get(READ_KEY, {});
function markRead(path) {
  const m = readMap();
  if (m[path]) return;
  m[path] = 1;
  store.set(READ_KEY, m);
  renderNav();
}
function wireProgress() {
  const fill = document.querySelector('.scrollbar > i');
  // the page's own nav entry, so the start page counts too: its path is empty, not "start"
  const item = site.nav.flatMap(g => g.items).find(i => isOn(i.path));
  const path = item ? item.path : null;
  const known = !!item;
  let armed = false;  // the page module fills the content after mount, so nothing counts as read until it is on screen
  const update = () => {
    const doc = document.documentElement;
    const room = doc.scrollHeight - doc.clientHeight;
    const seen = room > 40 ? Math.min(1, doc.scrollTop / room) : (armed ? 1 : 0);  // an unrendered page is not a finished one
    if (fill) fill.style.width = (seen * 100).toFixed(1) + '%';
    if (armed && known && seen > 0.985) markRead(path);
  };
  addEventListener('scroll', update, { passive: true });
  addEventListener('resize', update);
  setTimeout(() => { armed = true; update(); }, 1500);
  update();
}

// A page this reader may not open, or a page at all before they have signed in. It says which, and nothing else loads.
async function denied(who) {
  const T = (en, ar) => (lang === 'ar' ? ar : en);
  const { ROLE_LABEL } = await import('./access.js');
  site = await loadJSON('data/site.json').catch(() => ({ tag: { en: 'Company map', ar: 'خريطة الشركة' }, nav: [] }));
  document.body.dataset.page = 'denied';
  applyLang(); renderTop(); renderNav();
  const head = document.getElementById('head'), box = document.getElementById('content');
  const signIn = `<p class="btn-row"><a class="btn primary" href="${href('login')}">${esc(T('Sign in', 'تسجيل الدخول'))}</a></p>`;
  let title, body;
  if (!who || !who.signed_in) {
    title = T('Sign in to read the map', 'سجّل الدخول لقراءة الخريطة');
    body = `<p>${esc(T('This map is for the people who run the operation. Sign in, or ask for an account and management will let you in.', 'هذه الخريطة لمن يديرون العملية. سجّل الدخول، أو اطلب حسابًا وتفتح لك الإدارة الباب.'))}</p>${signIn}`;
  } else if (who.status === 'pending') {
    title = T('Your account is waiting', 'حسابك في الانتظار');
    body = `<p>${esc(T('The account is made. Management gives it a role, and then the pages you need open. Nothing opens before that.', 'تم إنشاء الحساب. الإدارة تمنحه دورًا، وعندها تُفتح الصفحات التي تحتاجها. لا شيء يُفتح قبل ذلك.'))}</p>
      <p class="mute small">${esc(who.email || '')}</p>${signIn}`;
  } else if (who.status === 'blocked') {
    title = T('This account is closed', 'هذا الحساب مغلق');
    body = `<p>${esc(T('Talk to management.', 'تحدّث مع الإدارة.'))}</p>`;
  } else {
    const role = ROLE_LABEL[who.role] || { en: who.role, ar: who.role };
    title = T('Not for your role', 'ليست لدورك');
    body = `<p>${esc(T('This page is not part of what a ' + (role.en || '').toLowerCase() + ' reads. The pages that are, are in the list.', 'هذه الصفحة ليست ضمن ما يقرأه ' + (role.ar || '') + '. الصفحات التي تخصك في القائمة.'))}</p>
      <p class="btn-row"><a class="btn" href="${href('')}">${esc(T('Start', 'البداية'))}</a></p>`;
  }
  if (head) head.innerHTML = `<h1>${esc(title)}</h1>`;
  if (box) box.innerHTML = `<div class="card panel gate-note">${body}</div>`;
  document.title = title + '. ' + t(site.tag);
  renderFoot();
  if (who && who.signed_in) { const { event } = await import('./guard.js'); event('denied', { page: opts.page || '' }); }
}

function renderTop() {
  const top = document.getElementById('top'); if (!top) return;
  const other = lang === 'ar' ? 'en' : 'ar';
  const langBtn = `<button class="btn-text" id="lang" type="button" lang="${other}" dir="${other === 'ar' ? 'rtl' : 'ltr'}" aria-label="${other === 'ar' ? 'العربية' : 'English'}">${other === 'ar' ? 'عربي' : 'English'}</button>`;
  top.innerHTML = `<a class="skip" href="#main">${esc(ui('skip'))}</a>
  <div class="top"><div class="in">
    <a class="wordmark" href="${href('')}">${esc(t(site.tag))}</a><span class="grow"></span>
    ${me && me.signed_in ? `<a class="btn-text who" id="who" href="${href('account')}" title="${esc(me.email || '')}">${esc(me.name || '')}</a>` : ''}
    ${langBtn}
    <button class="btn-text menu-btn" id="menu" type="button" aria-expanded="false" aria-controls="drawer">${esc(ui('contents'))}</button>
  </div></div><div class="scrollbar no-print" aria-hidden="true"><i></i></div>`;
}

function renderNav() {
  const rail = document.getElementById('rail');
  const drawer = document.getElementById('drawer');
  const nav = navHTML();
  if (rail) rail.innerHTML = nav;
  if (drawer) drawer.innerHTML = `<div class="in"><div class="drawer-top"><span class="wordmark">${esc(t(site.tag))}</span><button class="btn-text" id="menu-close" type="button">${esc(ui('close'))}</button></div>${nav}</div>`;
}

function renderHead() {
  const head = document.getElementById('head'); if (!head) return;
  const title = t(opts.title);
  const lede = t(opts.lede);
  const toc = (opts.toc || []).length ? `<nav class="toc no-print" aria-label="${esc(ui('onThisPage'))}">${opts.toc.map(x => `<a href="#${esc(x.id)}">${esc(t(x.label))}</a>`).join('')}</nav>` : '';
  head.innerHTML = `<h1>${esc(title)}</h1>${lede ? `<p class="lede">${esc(lede)}</p>` : ''}${toc}`;
  if (title) document.title = `${title}. ${t(site.tag)}`;
}

function renderFoot() {
  const foot = document.getElementById('foot'); if (!foot) return;
  const call = site.nav.flatMap(g => g.items).find(i => i.path === 'call');
  foot.innerHTML = `<span></span><span>${call && opts.page !== 'call' ? `<a href="${href('call')}" class="no-print">${esc(t(call.label))}</a> · ` : ''}<a href="${href('glossary')}#changelog">${esc(ui('changelog'))}</a></span>`;
}

let wired = false;
// print. Every print button builds a printable copy of the page (collapsibles open, typed values kept) and prints it
// from a hidden frame. Inside the claude.ai preview the browser silently refuses to print, so the copy is handed to the
// outer page (window.__VM_SAVE__), which offers it to the viewer as a file to save and print.
function printableMain(only) {
  const live = (only && document.querySelector(only)) || document.querySelector('main') || document.body, copy = live.cloneNode(true);
  const src = [...live.querySelectorAll('input, textarea, select')], dst = [...copy.querySelectorAll('input, textarea, select')];
  dst.forEach((el, i) => {
    const s = src[i]; if (!s) return;
    if (el.tagName === 'TEXTAREA') el.textContent = s.value;
    else if (el.tagName === 'SELECT') [...el.options].forEach(op => op.toggleAttribute('selected', op.value === s.value));
    else if (el.type === 'checkbox' || el.type === 'radio') el.toggleAttribute('checked', s.checked);
    else el.setAttribute('value', s.value);
  });
  copy.removeAttribute('hidden');
  copy.querySelectorAll('details').forEach(d => d.setAttribute('open', ''));
  copy.querySelectorAll('.no-print').forEach(n => n.remove());
  return copy.outerHTML;
}
export function printableHTML(o = {}) {
  const title = o.title || document.title.split('.')[0];
  const styles = [...document.querySelectorAll('style')].map(s => '<style>' + s.textContent + '</style>').join('')
    + [...document.querySelectorAll('link[rel="stylesheet"]')].map(l => '<link rel="stylesheet" href="' + esc(l.href) + '">').join('');
  const inner = o.html != null ? o.html : printableMain(o.only);
  const body = /^<main[\s>]/i.test(inner.trim()) ? inner : '<main class="page">' + inner + '</main>';
  return '<!doctype html><html lang="' + esc(document.documentElement.lang || 'en') + '" dir="' + dir() + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + esc(title) + '</title>' + styles + '</head><body class="printing' + (o.cls ? ' ' + esc(o.cls) : '') + '">' + body + '</body></html>';
}
// prints a document from a hidden frame. Resolves true when the browser opened its print dialog, false when it refused silently
function printDoc(html) {
  return new Promise(res => {
    const f = document.createElement('iframe');
    f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1; f.className = 'print-frame';
    f.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;border:0;opacity:0;pointer-events:none';
    let fired = false, done = false, started = false;
    const finish = ok => { if (done) return; done = true; res(ok); setTimeout(() => f.remove(), ok ? 60000 : 0); };
    f.addEventListener('load', () => {
      const w = f.contentWindow;
      if (!w) return finish(false);
      w.addEventListener('beforeprint', () => { fired = true; });
      w.addEventListener('afterprint', () => finish(true));
      if (started) return;  // the blank document fires load too; only the real one counts
      started = true;
      const go = () => { try { w.focus(); w.print(); } catch (e) { /* refused */ } setTimeout(() => finish(fired), 700); };
      const ready = w.document.fonts && w.document.fonts.ready;
      if (ready) Promise.race([ready, new Promise(r => setTimeout(r, 1500))]).then(() => setTimeout(go, 50)); else setTimeout(go, 150);
    });
    f.srcdoc = html;
    document.body.appendChild(f);
  });
}
export async function printPage(o = {}) {
  const title = o.title || document.title.split('.')[0];
  const html = printableHTML({ ...o, title });
  if (await printDoc(html)) return;
  const filename = (title.replace(/[^\w\u0600-\u06FF]+/g, '-').replace(/^-|-$/g, '') || 'page') + '.html';
  if (typeof window.__VM_SAVE__ === 'function') { window.__VM_SAVE__({ filename, html }); return; }
  toast(ui('printBlocked'));
}
export function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.textContent = msg; el.classList.add('on');
  clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 7000);
}
/* a small question box on the page: a title, one input, OK and Cancel. Resolves with the text, or '' when cancelled.
   The browser's own prompt dialog is never used: embedded views and some desktop apps drop it without a word. */
export function ask({ title = '', label = '', value = '', secret = false, ok = 'OK', cancel = 'Cancel' } = {}) {
  return new Promise(resolve => {
    document.getElementById('ask-box')?.remove();
    const box = document.createElement('div');
    box.id = 'ask-box'; box.className = 'no-print';
    box.innerHTML = `<form class="in" role="dialog" aria-modal="true" aria-labelledby="ask-box-t"><div class="t" id="ask-box-t"></div>
      <label><span></span><input type="${secret ? 'password' : 'text'}" autocomplete="${secret ? 'current-password' : 'off'}" autocapitalize="off" spellcheck="false"></label>
      <div class="btn-row"><button type="submit" class="btn primary"></button><button type="button" class="btn" data-cancel></button></div></form>`;
    box.querySelector('.t').textContent = title; box.querySelector('.t').hidden = !title;
    box.querySelector('label span').textContent = label; box.querySelector('label span').hidden = !label;
    const input = box.querySelector('input'); input.value = value;
    box.querySelector('[type=submit]').textContent = ok; box.querySelector('[data-cancel]').textContent = cancel;
    const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); done(''); } };
    const done = v => { document.removeEventListener('keydown', onKey, true); box.remove(); resolve(v); };
    box.querySelector('form').addEventListener('submit', e => { e.preventDefault(); done(input.value.trim()); });
    box.querySelector('[data-cancel]').addEventListener('click', () => done(''));
    box.addEventListener('mousedown', e => { if (e.target === box) done(''); });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(box);
    input.focus(); input.select();
  });
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-print]'); if (!b) return;
  e.preventDefault();
  printPage({ only: b.dataset.print || '', cls: b.dataset.printClass || '', title: b.dataset.printTitle || '' });
});
function wireChrome() {
  if (wired) return;
  wired = true;
  document.addEventListener('click', e => {
    const tgt = e.target.closest('#menu, #menu-close, #lang, .drawer a');
    if (!tgt) return;
    if (tgt.id === 'lang') { setLang(lang === 'ar' ? 'en' : 'ar'); return; }
    const drawer = document.getElementById('drawer');
    const open = tgt.id === 'menu';
    drawer.hidden = !open;
    document.body.classList.toggle('menu', open);
    document.getElementById('menu')?.setAttribute('aria-expanded', String(open));
    if (open) drawer.querySelector('a, button')?.focus(); else document.getElementById('menu')?.focus();
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const drawer = document.getElementById('drawer');
    if (drawer && !drawer.hidden) { drawer.hidden = true; document.body.classList.remove('menu'); }
  });
}

/* print: open every collapsible while printing */
function wirePrint() {
  let touched = [];
  window.addEventListener('beforeprint', () => {
    touched = [...document.querySelectorAll('details:not([open])')];
    touched.forEach(d => d.open = true);
  });
  window.addEventListener('afterprint', () => { touched.forEach(d => d.open = false); touched = []; });
}

/* small helpers pages share */
export function detailsHTML({ id, title, body, open = false, level = 'h3', cls = '' }) {
  return `<details${id ? ` id="${esc(id)}"` : ''}${open ? ' open' : ''} class="${cls}"><summary data-open="${esc(ui('open'))}" data-close="${esc(ui('close'))}"><${level}>${esc(title)}</${level}></summary><div class="body">${body}</div></details>`;
}

export function list(items, cls = '') {
  return `<ul${cls ? ` class="${cls}"` : ''}>${(items || []).map(x => `<li>${esc(t(x))}</li>`).join('')}</ul>`;
}

export function dir() { return document.documentElement.dir === 'rtl' ? 'rtl' : 'ltr'; }
