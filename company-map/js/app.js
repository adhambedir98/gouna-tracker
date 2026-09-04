// Vound company map. Shared runtime: data loading, language, chrome, storage, print.

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

async function fetchJSON(path, optional) {
  const pre = globalThis.__VM_DATA__;
  if (pre) return Object.prototype.hasOwnProperty.call(pre, path) ? pre[path] : (optional ? null : Promise.reject(new Error(`Could not load ${path}`)));
  const r = await fetch(new URL(path, ROOT));
  if (!r.ok) { if (optional) return null; throw new Error(`Could not load ${path}`); }
  return r.json();
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

export async function mount(o) {
  opts = o || {};
  listeners.clear();
  if (!document.querySelector('link[rel=icon]')) { const l = document.createElement('link'); l.rel = 'icon'; l.href = FAVICON; document.head.appendChild(l); }
  site = await loadJSON('data/site.json');
  document.body.dataset.page = opts.page || '';
  if (opts.wide) document.getElementById('main')?.classList.add('wide');
  applyLang();
  wireChrome();
  wirePrint();
  return { site, content: document.getElementById('content'), lang: () => lang };
}

function here() { return location.pathname.replace(/index\.html$/, '').replace(/\/?$/, '/'); }
function isOn(path) {
  const p = String(path || '').replace(/^\/+/, '').replace(/\/+$/, '');
  if (globalThis.__VM_PATH__ !== undefined) return globalThis.__VM_PATH__ === p;
  return new URL(href(path)).pathname.replace(/\/?$/, '/') === here();
}

function navHTML() {
  return site.nav.map(g => `<div class="g">${esc(t(g.group))}</div>${g.items.map(i =>
    `<a href="${href(i.path)}"${isOn(i.path) ? ' class="on" aria-current="page"' : ''}>${esc(t(i.label))}</a>`).join('')}`).join('');
}

function renderTop() {
  const top = document.getElementById('top'); if (!top) return;
  const other = lang === 'ar' ? 'en' : 'ar';
  const langBtn = `<button class="btn-text" id="lang" type="button" lang="${other}" dir="${other === 'ar' ? 'rtl' : 'ltr'}" aria-label="${other === 'ar' ? 'العربية' : 'English'}">${other === 'ar' ? 'عربي' : 'English'}</button>`;
  top.innerHTML = `<a class="skip" href="#main">${esc(ui('skip'))}</a>
  <div class="top"><div class="in">
    <a class="wordmark" href="${href('')}">Vound</a><span class="tag">${esc(t(site.tag))}</span><span class="grow"></span>
    ${langBtn}
    <button class="btn-text menu-btn" id="menu" type="button" aria-expanded="false" aria-controls="drawer">${esc(ui('contents'))}</button>
  </div></div>`;
}

function renderNav() {
  const rail = document.getElementById('rail');
  const drawer = document.getElementById('drawer');
  const nav = navHTML();
  if (rail) rail.innerHTML = nav;
  if (drawer) drawer.innerHTML = `<div class="in"><div class="drawer-top"><span class="wordmark">Vound</span><button class="btn-text" id="menu-close" type="button">${esc(ui('close'))}</button></div>${nav}</div>`;
}

function renderHead() {
  const head = document.getElementById('head'); if (!head) return;
  const title = t(opts.title);
  const lede = t(opts.lede);
  const toc = (opts.toc || []).length ? `<nav class="toc no-print" aria-label="${esc(ui('onThisPage'))}">${opts.toc.map(x => `<a href="#${esc(x.id)}">${esc(t(x.label))}</a>`).join('')}</nav>` : '';
  head.innerHTML = `<h1>${esc(title)}</h1>${lede ? `<p class="lede">${esc(lede)}</p>` : ''}${toc}`;
  if (title) document.title = `${title}. ${t(site.name)} ${t(site.tag).toLowerCase()}`;
}

function renderFoot() {
  const foot = document.getElementById('foot'); if (!foot) return;
  const call = site.nav.flatMap(g => g.items).find(i => i.path === 'call');
  foot.innerHTML = `<span></span><span>${call && opts.page !== 'call' ? `<a href="${href('call')}" class="no-print">${esc(t(call.label))}</a> · ` : ''}<a href="${href('glossary')}#changelog">${esc(ui('changelog'))}</a></span>`;
}

let wired = false;
// print buttons: window.print() where the browser allows it; inside the claude.ai preview, a printable copy to save instead
function printableMain() {
  const live = document.querySelector('main') || document.body, copy = live.cloneNode(true);
  const src = [...live.querySelectorAll('input, textarea, select')], dst = [...copy.querySelectorAll('input, textarea, select')];
  dst.forEach((el, i) => { const s = src[i]; if (!s) return; if (el.tagName === 'TEXTAREA') el.textContent = s.value; else if (el.type === 'checkbox' || el.type === 'radio') { if (s.checked) el.setAttribute('checked', ''); else el.removeAttribute('checked'); } else el.setAttribute('value', s.value); });
  return copy.outerHTML;
}
async function printPage(btn) {
  const dl = window.claude && await window.claude.use('downloads').catch(() => null);
  if (dl) {
    const title = document.title.split('.')[0];
    const html = '<!doctype html><html lang="' + document.documentElement.lang + '" dir="' + (document.dir || 'ltr') + '"><head><meta charset="utf-8"><title>' + esc(title) + '</title><style>' + [...document.querySelectorAll('style')].map(s => s.textContent).join('\n') + ' .rail,.topbar,.no-print,.btn-row{display:none!important} main{max-width:none;padding:24px}</style></head><body class="printing">' + printableMain() + '</body></html>';
    try { await dl.save({ filename: title.replace(/[^\w\u0600-\u06FF]+/g, '-').replace(/^-|-$/g, '') + '.html', data: html }); return; } catch (e) { /* the viewer declined, or saving is not available here: fall through to print */ }
  }
  window.print();
}
document.addEventListener('click', e => { const b = e.target.closest('[data-print]'); if (b) { e.preventDefault(); printPage(b); } });
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
