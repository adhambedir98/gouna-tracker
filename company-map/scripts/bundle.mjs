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

const mods = { app: read('js/app.js'), svg: read('js/svg.js'), blocks: read('js/manual-blocks.js') };
const pages = {};
for (const r of routes) pages[r] = read(`js/pages/${r ? r.replace(/\//g, '-') : 'start'}.js`);

const J = v => JSON.stringify(v).replace(/<\//g, '<\\/');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Vound company map</title>
<style>html,body{margin:0;height:100%;background:#F4F1EA;overflow:hidden}iframe{border:0;width:100%;height:100%;display:block;background:#F4F1EA}</style>
</head>
<body>
<iframe id="f" title="Vound company map"></iframe>
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
const pageUrls = {};
function pageUrl(route) {
  if (!pageUrls[route]) pageUrls[route] = blob(PAGES[route]
    .replace(/from '\\.\\.\\/app\\.js'/g, "from '" + urls.app + "'")
    .replace(/from '\\.\\.\\/svg\\.js'/g, "from '" + urls.svg + "'")
    .replace(/from '\\.\\.\\/manual-blocks\\.js'/g, "from '" + urls.blocks + "'"));
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
  else if (m.title) document.title = m.title;
});
build();
</script>
</body>
</html>
`;
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist', 'vound-company-map.html');
fs.writeFileSync(out, html);
console.log(`${out}  ${(html.length / 1024).toFixed(0)} KB, ${routes.length} pages, ${Object.keys(data).length} data files`);
