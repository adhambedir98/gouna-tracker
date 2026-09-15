// Checks the page-level labels: every L('...') key in the page modules has Arabic in data/ui.json,
// nothing in data/ui.json is unused, and no obvious English text is left unwrapped in the templates.
//   node scripts/check-ui.mjs
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('../', import.meta.url).pathname);
const ui = JSON.parse(fs.readFileSync(path.join(root, 'data/ui.json'), 'utf8'));
const common = ui.common || {};
const walk = (dir, ext) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
  (e.isDirectory() ? walk(path.join(dir, e.name), ext) : e.name.endsWith(ext) ? [path.join(dir, e.name)] : []));
const problems = [];
const used = new Map(); // page -> Set(keys)
const sources = new Map(); // page -> module source

// pages that carry their own {en, ar} objects and do not use labels()
const shared = []; // shared modules without a labels() call still carry L('...') keys; their keys live in common
const files = [...fs.readdirSync(path.join(root, 'js/pages')).map(f => 'js/pages/' + f), 'js/sflow.js', 'js/sop-page.js', 'js/fraud-pict.js', 'js/job-page.js', 'js/online.js'];
for (const f of files) {
  const src = fs.readFileSync(path.join(root, f), 'utf8');
  const m = src.match(/labels\('([^']+)'\)/);
  if (!m) { if (!f.startsWith('js/pages/')) shared.push(src); continue; }
  if (!m) continue;
  const page = m[1];
  const keys = new Set();
  for (const k of src.matchAll(/\bL\((?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g)) keys.add((k[1] ?? k[2]).replace(/\\'/g, "'"));
  used.set(page, keys);
  sources.set(page, src);
  const own = ui[page] || {};
  for (const k of keys) {
    const v = own[k] ?? common[k];
    if (v == null) problems.push(`${page}: no Arabic for ${JSON.stringify(k)}`);
    else if (!/[؀-ۿ]/.test(v) && /[a-zA-Z]{3,}/.test(k)) problems.push(`${page}: Arabic has no Arabic letters for ${JSON.stringify(k)}`);
    else if (/[\u2013\u2014]/.test(v)) problems.push(`${page}: em or en dash in the Arabic for ${JSON.stringify(k)}`);
    // every {name} in the key must survive in the Arabic
    for (const p of k.matchAll(/\{(\w+)\}/g)) if (v != null && !v.includes(p[0])) problems.push(`${page}: Arabic for ${JSON.stringify(k)} lost ${p[0]}`);
  }
  // English left in the templates: text between > and < that starts with a capital letter, outside ${}
  const lines = src.split('\n');
  lines.forEach((line, i) => {
    for (const t of line.matchAll(/>([A-Z][a-z][^<>{}$]*)</g)) problems.push(`${f}:${i + 1}: unwrapped text ${JSON.stringify(t[1].trim())}`);
  });
}
/* Unused keys. A page's labels are not all written in its own module: shared modules (the map, the charts, the
   ledger) and helpers that take a label as an argument carry them too, and a few come from the content files. So a
   key counts as used when its text appears anywhere in the runtime or the content, and is dead only when it appears
   nowhere at all. The old test let one L(variable) call in a module switch the whole page off, and 98 keys from
   earlier versions of the dashboard sat in the file behind it. */
const jsAll = walk(path.join(root, 'js'), '.js').map(f => fs.readFileSync(f, 'utf8')).join('\n');
const dataAll = walk(path.join(root, 'data'), '.json')
  .filter(f => !f.endsWith('data/ui.json') && !f.includes('/data/ar/')).map(f => fs.readFileSync(f, 'utf8')).join('\n');
const anywhere = jsAll + '\n' + dataAll;
for (const page of Object.keys(ui)) {
  if (page === 'common') continue;
  if (!used.has(page)) { problems.push(`data/ui.json: page ${page} has no module using labels('${page}')`); continue; }
  for (const k of Object.keys(ui[page])) if (!anywhere.includes(k)) problems.push(`data/ui.json: ${page} key ${JSON.stringify(k)} is not used`);
}
for (const src of shared) for (const k of src.matchAll(/\bL\((?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g)) { const key = (k[1] ?? k[2]).replace(/\\'/g, "'"); if (!(key in common)) problems.push(`shared module: no common Arabic for ${JSON.stringify(key)}`); }
const allUsed = new Set([...used.values()].flatMap(s => [...s]));
const allSrc = [...sources.values(), ...shared].join('\n');
for (const k of Object.keys(common)) if (!allUsed.has(k) && !anywhere.includes(k)) problems.push(`data/ui.json: common key ${JSON.stringify(k)} is not used`);

if (problems.length) { console.log(problems.join('\n')); console.log(`\n${problems.length} problem(s).`); process.exitCode = 1; }
else console.log(`Labels clean. ${allUsed.size} keys across ${used.size} pages.`);
