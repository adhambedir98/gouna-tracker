// Bundles the whole site into one self-contained HTML file: every page, the data, the styles, and the fonts.
// Pages run inside an iframe from an in-page router, so nothing needs a server.
//   node scripts/bundle.mjs            writes dist/vound-company-map.html
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('../', import.meta.url).pathname);
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const site = JSON.parse(read('data/site.json'));
const routes = site.nav.flatMap(g => g.items.map(i => i.path));

const data = {};
(function walk(d) {
  for (const n of fs.readdirSync(path.join(root, d))) {
    const p = `${d}/${n}`;
    if (fs.statSync(path.join(root, p)).isDirectory()) walk(p);
    else if (n.endsWith('.json') && !n.startsWith('_')) data[p] = JSON.parse(read(p));
  }
})('data');

const css = read('css/site.css').replace(/url\("\.\.\/fonts\/([^"]+)"\)/g, (m, f) =>
  `url("data:font/woff2;base64,${fs.readFileSync(path.join(root, 'fonts', f)).toString('base64')}")`);

const mods = { app: read('js/app.js'), svg: read('js/svg.js'), blocks: read('js/manual-blocks.js'), sflow: read('js/sflow.js'), sop: read('js/sop-page.js'), form: read('js/form-page.js'), fpict: read('js/fraud-pict.js') };
const pages = {};
for (const r of routes) pages[r] = read(`js/pages/${r ? r.replace(/\//g, '-') : 'start'}.js`);

const J = v => JSON.stringify(v).replace(/<\//g, '<\\/');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Vound company map</title>
<style>html,body{margin:0;height:100%;background:#F4F1EA;overflow:hidden}iframe{border:0;width:100%;height:100%;display:block;background:#F4F1EA}
#ask-btn{position:fixed;right:18px;bottom:18px;z-index:9;border:1px solid #1F4D3A;background:#1F4D3A;color:#F4F1EA;font:600 14px system-ui,sans-serif;padding:10px 14px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.15)}
#ask-btn[hidden]{display:none}
#ask{position:fixed;right:18px;bottom:64px;z-index:10;width:min(420px,calc(100vw - 36px));max-height:min(70vh,640px);display:flex;flex-direction:column;background:#F4F1EA;border:1px solid #1F4D3A;box-shadow:0 6px 24px rgba(0,0,0,.18);font:15px system-ui,sans-serif;color:#1E1E1C}
#ask[hidden]{display:none}
#ask .hd{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid #D9D4C7;font-weight:600}
#ask .hd button{border:0;background:none;font:inherit;cursor:pointer;color:#6B6A66}
#ask .out{flex:1;overflow:auto;padding:12px 14px;white-space:pre-wrap;line-height:1.5;min-height:80px}
#ask .out .q{color:#6B6A66;margin-bottom:8px}
#ask .out .src{font-size:12px;color:#6B6A66;margin-top:10px}
#ask form{display:flex;gap:8px;padding:10px 14px;border-top:1px solid #D9D4C7}
#ask textarea{flex:1;font:inherit;border:1px solid #B8B3A6;padding:8px;background:#FBF9F4;resize:none;height:44px}
#ask form button{border:1px solid #1F4D3A;background:#1F4D3A;color:#F4F1EA;font:600 14px system-ui,sans-serif;padding:0 14px;cursor:pointer}
#ask .note{font-size:12px;color:#6B6A66;padding:0 14px 10px}
#ask[dir=rtl] .hd,#ask[dir=rtl] form,#ask[dir=rtl] .out,#ask[dir=rtl] .note{direction:rtl;text-align:right}
#ask[dir=rtl]{right:auto;left:18px}#ask-btn.rtl{right:auto;left:18px}
#toast{position:fixed;left:50%;bottom:24px;transform:translate(-50%,12px);background:#1E1E1C;color:#F4F1EA;padding:10px 16px;font:14px/1.4 system-ui,sans-serif;max-width:calc(100vw - 32px);opacity:0;transition:opacity .2s,transform .2s;pointer-events:none;z-index:12}
#toast.on{opacity:1;transform:translate(-50%,0)}</style>
</head>
<body>
<iframe id="f" title="Vound company map"></iframe>
<button type="button" id="ask-btn" hidden>Ask a question</button>
<div id="toast" role="status"></div>
<div id="ask" hidden><div class="hd"><span id="ask-title">Ask about how Vound works</span><button type="button" id="ask-close">Close</button></div><div class="out" id="ask-out"><span class="q" id="ask-intro">The answer comes from this site only. Money and personal questions go to Who to call.</span></div><form id="ask-form"><textarea id="ask-q" placeholder="Your question"></textarea><button type="submit" id="ask-send">Ask</button></form><div class="note" id="ask-note">Answers are made by Claude from the pages of this site. Check the page it points to.</div></div>
<script>
const DATA = ${J(data)};
const CSS = ${J(css)};
const MODS = ${J(mods)};
const PAGES = ${J(pages)};
const ROUTES = ${J(routes)};
const urls = {};
const blob = src => URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
urls.app = blob(MODS.app);
urls.svg = blob(MODS.svg.replace("from './app.js'", "from '" + urls.app + "'"));
urls.blocks = blob(MODS.blocks.replace("from './app.js'", "from '" + urls.app + "'"));
urls.sflow = blob(MODS.sflow.replace("from './app.js'", "from '" + urls.app + "'").replace("from './svg.js'", "from '" + urls.svg + "'"));
urls.sop = blob(MODS.sop.replace("from './app.js'", "from '" + urls.app + "'"));
urls.form = blob(MODS.form.replace("from './app.js'", "from '" + urls.app + "'"));
urls.fpict = blob(MODS.fpict.replace("from './svg.js'", "from '" + urls.svg + "'"));
const pageUrls = {};
function pageUrl(route) {
  if (!pageUrls[route]) pageUrls[route] = blob(PAGES[route]
    .replace(/from '\\.\\.\\/app\\.js'/g, "from '" + urls.app + "'")
    .replace(/from '\\.\\.\\/svg\\.js'/g, "from '" + urls.svg + "'")
    .replace(/from '\\.\\.\\/manual-blocks\\.js'/g, "from '" + urls.blocks + "'")
    .replace(/from '\\.\\.\\/sflow\\.js'/g, "from '" + urls.sflow + "'")
    .replace(/from '\\.\\.\\/sop-page\\.js'/g, "from '" + urls.sop + "'")
    .replace(/from '\\.\\.\\/form-page\\.js'/g, "from '" + urls.form + "'")
    .replace(/from '\\.\\.\\/fraud-pict\\.js'/g, "from '" + urls.fpict + "'"));
  return pageUrls[route];
}
function parse() {
  const h = decodeURIComponent(location.hash.replace(/^#\\/?/, ''));
  const i = h.indexOf('#');
  let route = (i >= 0 ? h.slice(0, i) : h).replace(/\\/+$/, '');
  const hash = i >= 0 ? h.slice(i + 1) : '';
  if (!ROUTES.includes(route)) route = '';
  return { route, hash };
}
window.__VM_DATA__ = DATA;
function build() {
  const { route, hash } = parse();
  const shim = "window.__VM_DATA__=parent.__VM_DATA__;window.__VM_PATH__=" + JSON.stringify(route) + ";window.__VM_HASH__=" + JSON.stringify(hash) + ";"
    + "window.__VM_HREF__=function(p){return '#/'+(p?p+'/':'')};"
    + "window.__VM_SETHASH__=function(h){parent.postMessage({hash:h||''},'*')};"
    + "window.__VM_RELOAD__=function(){parent.postMessage({rebuild:true},'*')};"
    + "window.__VM_SAVE__=function(o){parent.postMessage({save:o},'*')};"
    + "document.addEventListener('click',function(e){var a=e.target.closest('a[href]');if(!a)return;var h=a.getAttribute('href');if(h&&h.indexOf('#/')===0){e.preventDefault();parent.postMessage({route:h},'*');}});";
  const boot = "import(" + JSON.stringify(pageUrl(route)) + ").then(function(){parent.postMessage({title:document.title},'*');var h=" + JSON.stringify(hash) + ";var el=h&&document.getElementById(h);if(el)el.scrollIntoView();});";
  document.getElementById('f').srcdoc = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>' + CSS + '</style></head><body>'
    + '<div id="top"></div><div class="shell"><nav class="rail" id="rail" aria-label="Contents"></nav><main class="page" id="main"><header class="page-head" id="head"></header><div id="content"></div><footer class="foot" id="foot"></footer></main></div><div class="drawer" id="drawer" hidden></div>'
    + '<script>' + shim + '<\\/script><script type="module">' + boot + '<\\/script></body></html>';
}
window.addEventListener('hashchange', build);
window.addEventListener('message', e => {
  const m = e.data || {};
  if (m.route) { const next = String(m.route).replace(/^#/, ''); if ('#' + next === location.hash) build(); else location.hash = next; }
  else if ('hash' in m) { const { route } = parse(); history.replaceState(null, '', '#/' + (route ? route + '/' : '') + (m.hash ? '#' + m.hash : '')); }
  else if (m.rebuild) build();
  else if (m.title) document.title = m.title;
  else if (m.save) saveCopy(m.save);
});
build();
// ---- language of the site, kept by the pages in localStorage
const siteLang = () => { try { return JSON.parse(localStorage.getItem('vm.lang') || '"en"') === 'ar' ? 'ar' : 'en'; } catch (e) { return 'en'; } };
const MSG = { en: { saved: 'The copy is saved. Open it and print it.', noPrint: 'Printing is not available in this preview. Open the site outside the preview to print.' }, ar: { saved: 'تم حفظ النسخة. افتحها واطبعها.', noPrint: 'الطباعة غير متاحة في هذه المعاينة. افتح الموقع خارج المعاينة للطباعة.' } };
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.dir = siteLang() === 'ar' ? 'rtl' : 'ltr'; el.classList.add('on');
  clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 7000);
}
// ---- print: the browser refuses to print inside the preview, so the page hands its printable copy here to be saved as a file
async function saveCopy(o) {
  const x = MSG[siteLang()];
  let dl = null;
  try { dl = window.claude && typeof window.claude.use === 'function' ? await window.claude.use('downloads') : null; } catch (e) { dl = null; }
  if (!dl || !o || !o.html) { toast(x.noPrint); return; }
  try { await dl.save({ filename: String(o.filename || 'page.html'), data: String(o.html) }); toast(x.saved); }
  catch (e) { if (e && e.code === 'declined') return; toast(x.noPrint); }
}
// ---- ask a question: Claude answers from the pages of this site, inside the claude.ai preview only
(async function () {
  if (!window.claude || typeof window.claude.use !== 'function') return;
  let sample = null;
  try { sample = await window.claude.use('sample'); } catch (e) { sample = null; }
  if (!sample) return;
  const btn = document.getElementById('ask-btn'), panel = document.getElementById('ask'), out = document.getElementById('ask-out'), form = document.getElementById('ask-form'), qEl = document.getElementById('ask-q');
  const TXT = { en: { btn: 'Ask a question', title: 'Ask about how Vound works', close: 'Close', intro: 'The answer comes from this site only. Money and personal questions go to Who to call.', ph: 'Your question', send: 'Ask', note: 'Answers are made by Claude from the pages of this site. Check the page it points to.', think: 'Thinking' }, ar: { btn: 'اسأل سؤالًا', title: 'اسأل عن طريقة عملنا', close: 'إغلاق', intro: 'الإجابة من صفحات هذا الموقع فقط. أسئلة المال والأسئلة الشخصية تذهب إلى صفحة بمن تتصل.', ph: 'سؤالك', send: 'اسأل', note: 'الإجابات يكتبها Claude من صفحات هذا الموقع. راجع الصفحة التي يشير إليها.', think: 'جارٍ التفكير' } };
  let uiLang = 'en';
  const applyLang = () => { uiLang = siteLang(); const x = TXT[uiLang]; btn.textContent = x.btn; btn.classList.toggle('rtl', uiLang === 'ar'); document.getElementById('ask-title').textContent = x.title; document.getElementById('ask-close').textContent = x.close; const intro = document.getElementById('ask-intro'); if (intro) intro.textContent = x.intro; qEl.placeholder = x.ph; document.getElementById('ask-send').textContent = x.send; document.getElementById('ask-note').textContent = x.note; panel.dir = uiLang === 'ar' ? 'rtl' : 'ltr'; };
  applyLang();
  window.addEventListener('hashchange', applyLang); window.addEventListener('message', e => { if (e.data && (e.data.rebuild || e.data.title)) applyLang(); });
  btn.hidden = false;
  btn.addEventListener('click', () => { panel.hidden = !panel.hidden; if (!panel.hidden) qEl.focus(); });
  document.getElementById('ask-close').addEventListener('click', () => { panel.hidden = true; });
  // one text per English data file, with a name to cite
  const SKIP = new Set(['id', 'k', 'path', 'slug', 'route', 'ids', 'sub', 'hub', 'kind', 'reportsTo', 'manages', 'links', 'phase', 'nameAr', 'ar', 'picture', 'pict']);
  const flat = (x, acc, lang) => { if (typeof x === 'string') { if (x.length > 1) acc.push(x); } else if (Array.isArray(x)) x.forEach(v => flat(v, acc, lang)); else if (x && typeof x === 'object') { if (typeof x.en === 'string' && typeof x.ar === 'string') { if (x[lang].length > 1) acc.push(x[lang]); return acc; } for (const [k, v] of Object.entries(x)) { if (!SKIP.has(k)) flat(v, acc, lang); } } return acc; };
  const docs = Object.entries(DATA).filter(([p]) => !p.startsWith('data/ar/') && p !== 'data/ui.json' && p !== 'data/site.json').map(([p, j]) => { const name = (j && (j.title && (j.title.en || j.title))) || p.replace('data/', '').replace('.json', ''); const mirror = DATA['data/ar/' + p.slice(5)]; const en = flat(j, [], 'en').join('\\n'); const arList = mirror ? flat(mirror, [], 'ar') : flat(j, [], 'ar'); const ar = arList.join('\\n'); const nameAr = mirror && mirror.title ? (mirror.title.ar || mirror.title) : (j && j.title && j.title.ar) || name; return { p, name: String(name), nameAr: String(nameAr), en, ar: /[\\u0600-\\u06FF]/.test(ar) ? ar : '', enLow: en.toLowerCase(), bytesEn: new TextEncoder().encode(en).length, bytesAr: new TextEncoder().encode(ar).length }; });
  const words = s => (s.toLowerCase().match(/[\\p{L}\\p{N}]{3,}/gu) || []);
  function pick(q, arabic) {
    const ws = [...new Set(words(q))];
    const textOf = d => arabic && d.ar ? d.ar : d.en, bytesOf = d => arabic && d.ar ? d.bytesAr : d.bytesEn;
    const scored = docs.map(d => { const low = (arabic && d.ar ? d.ar : d.enLow); let s = 0; for (const w of ws) { const n = low.split(w).length - 1; if (n) s += 1 + Math.min(n, 8) * 0.15; } return { d, s }; }).sort((a, b) => b.s - a.s);
    const chosen = []; let bytes = 0; const cap = 50000;
    for (const { d, s } of scored) { if (s <= 0 && chosen.length >= 2) break; if (bytes + bytesOf(d) > cap) continue; chosen.push(d); bytes += bytesOf(d); if (chosen.length >= 6) break; }
    const call = docs.find(d => d.p === 'data/call.json'); if (call && !chosen.includes(call) && bytes + bytesOf(call) <= cap + 8000) chosen.push(call);
    return chosen.map(d => ({ name: arabic && d.ar ? d.nameAr : d.name, text: textOf(d) }));
  }
  let busy = false;
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const q = qEl.value.trim(); if (!q || busy) return;
    busy = true; out.innerHTML = ''; const qd = document.createElement('div'); qd.className = 'q'; qd.textContent = q; out.appendChild(qd);
    const ans = document.createElement('div'); ans.textContent = TXT[uiLang].think + '…'; out.appendChild(ans);
    const arabic = uiLang === 'ar' || /[\\u0600-\\u06FF]/.test(q);
    const src = pick(q, arabic);
    const ctx = src.map(d => '### ' + d.name + '\\n' + d.text).join('\\n\\n');
    const input = 'You answer questions from people who work at Vound, using ONLY the pages of the company map given below. Answer in ' + (arabic ? 'Arabic' : 'English') + ', in plain, short sentences, the way you would explain to a junior employee. Never name the client, the client\\'s app, or the parent company: say the client and the collection app. Do not give anyone\\'s pay. If the pages do not answer the question, say so in one sentence and tell the person to ask their Portfolio Manager, or to use the Who to call page. End with one line: "See: " and the names of the pages you used.\\n\\nPAGES:\\n' + ctx + '\\n\\nQUESTION: ' + q;
    try {
      const r = await sample(input, { cache: false, modelTier: 'default', onText: ({ text }) => { ans.textContent = text; out.scrollTop = out.scrollHeight; } });
      ans.textContent = r.text || ans.textContent;
    } catch (err) {
      ans.textContent = err && err.code === 'rate_limited' ? 'Too many questions right now. Try again in a minute.' : err && err.code === 'not_granted' ? 'Asking is not available for you here. Ask your Portfolio Manager.' : 'Something went wrong. Ask your Portfolio Manager, or try again.';
      if (err && err.code === 'not_granted') btn.hidden = true;
    }
    busy = false;
  });
})();
</script>
</body>
</html>
`;
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist', 'vound-company-map.html');
fs.writeFileSync(out, html);
console.log(`${out}  ${(html.length / 1024).toFixed(0)} KB, ${routes.length} pages, ${Object.keys(data).length} data files`);
