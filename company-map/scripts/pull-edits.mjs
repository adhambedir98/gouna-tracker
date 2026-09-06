// Writes the live edits into the source files, so they stay after the database rows are gone.
//   DR_REPORT_CODE=... node scripts/pull-edits.mjs          apply, then mark the rows applied
//   node scripts/pull-edits.mjs --dry                        show what would change, touch nothing
// English edits go into the JSON under data/ (not data/ar/), the page modules, and the label keys in data/ui.json.
// Arabic edits go into data/ar/ and the Arabic values in data/ui.json and the inline {en, ar} objects.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('../', import.meta.url).pathname);
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'data/report.json'), 'utf8'));
const H = { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key, 'Content-Type': 'application/json' };
const dry = process.argv.includes('--dry');
const code = process.env.DR_REPORT_CODE || '';

const r = await fetch(`${cfg.url}/rest/v1/dr_edits?select=id,page,lang,before,after,who&applied=eq.false&order=at.asc`, { headers: H });
const edits = await r.json();
if (!Array.isArray(edits) || !edits.length) { console.log('No live edits.'); process.exit(0); }

function jsonFiles(dir) {
  const out = [];
  (function walk(d) { for (const n of fs.readdirSync(d)) { const p = path.join(d, n); if (fs.statSync(p).isDirectory()) walk(p); else if (n.endsWith('.json')) out.push(p); } })(dir);
  return out;
}
const allJSON = jsonFiles(path.join(root, 'data'));
const enJSON = allJSON.filter(f => !f.includes(path.sep + 'ar' + path.sep));
const arJSON = allJSON.filter(f => f.includes(path.sep + 'ar' + path.sep));
const jsFiles = [...fs.readdirSync(path.join(root, 'js/pages')).map(f => path.join(root, 'js/pages', f)), ...fs.readdirSync(path.join(root, 'js')).filter(f => f.endsWith('.js')).map(f => path.join(root, 'js', f))];

// replace whole string values equal to `before`, in place, across a JSON tree. Returns how many.
function replaceIn(obj, before, after, wantLang) {
  let n = 0;
  const go = (o, key) => {
    if (Array.isArray(o)) { o.forEach((v, i) => { if (typeof v === 'string') { if (v === before) { o[i] = after; n++; } } else go(v, null); }); return; }
    if (o && typeof o === 'object') {
      for (const k of Object.keys(o)) {
        const v = o[k];
        if (typeof v === 'string') {
          // inside an {en, ar} object only the wanted language changes; plain strings count as English
          if (k === 'en' || k === 'ar') { if (k === wantLang && v === before) { o[k] = after; n++; } }
          else if (wantLang === 'en' && v === before) { o[k] = after; n++; }
        } else go(v, k);
      }
    }
  };
  go(obj, null);
  return n;
}
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const q = s => "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";

const touched = new Map();   // file -> parsed JSON or text
const read = f => { if (!touched.has(f)) touched.set(f, f.endsWith('.json') ? JSON.parse(fs.readFileSync(f, 'utf8')) : fs.readFileSync(f, 'utf8')); return touched.get(f); };
const applied = [], missed = [];

for (const e of edits) {
  let n = 0;
  const wantLang = e.lang === 'ar' ? 'ar' : 'en';
  // 1. the data files: plain strings and {en, ar} objects
  for (const f of (wantLang === 'ar' ? [...arJSON, ...enJSON] : enJSON)) {
    const d = read(f);
    if (f.endsWith('ui.json')) continue;
    const k = replaceIn(d, e.before, e.after, wantLang);
    n += k;
  }
  // 2. the label keys in data/ui.json: an English key renames, an Arabic value changes
  const ui = read(path.join(root, 'data/ui.json'));
  for (const block of Object.values(ui)) {
    if (wantLang === 'en' && Object.prototype.hasOwnProperty.call(block, e.before)) { block[e.after] = block[e.before]; delete block[e.before]; n++; }
    if (wantLang === 'ar') for (const k of Object.keys(block)) if (block[k] === e.before) { block[k] = e.after; n++; }
  }
  // 3. English literals in the page modules: L('...'), and en: '...' in inline objects
  if (wantLang === 'en') {
    for (const f of jsFiles) {
      let s = read(f);
      const re = new RegExp("(L\\(|en: |T\\()" + esc(q(e.before)), 'g');
      const k = (s.match(re) || []).length;
      if (k) { s = s.replace(re, (m, p) => p + q(e.after)); touched.set(f, s); n += k; }
    }
  } else {
    for (const f of jsFiles) {
      let s = read(f);
      const re = new RegExp("(ar: |, )" + esc(q(e.before)), 'g');
      const k = (s.match(re) || []).length;
      if (k) { s = s.replace(re, (m, p) => p + q(e.after)); touched.set(f, s); n += k; }
    }
  }
  (n ? applied : missed).push({ ...e, n });
}

for (const [f, v] of touched) {
  const out = typeof v === 'string' ? v : JSON.stringify(v, null, 2) + '\n';
  const cur = fs.readFileSync(f, 'utf8');
  if (out === cur) continue;
  console.log(`${dry ? 'would write' : 'wrote'} ${path.relative(root, f)}`);
  if (!dry) fs.writeFileSync(f, out);
}
for (const e of applied) console.log(`applied (${e.n}): [${e.page}/${e.lang}] ${e.before.slice(0, 70)} -> ${e.after.slice(0, 70)}`);
for (const e of missed) console.log(`NOT FOUND in the source: [${e.page}/${e.lang}] ${e.before.slice(0, 70)} -> ${e.after.slice(0, 70)}  (${e.who || ''})`);
console.log(`\n${applied.length} applied, ${missed.length} to do by hand.`);

if (!dry && applied.length) {
  if (!code) { console.log('Set DR_REPORT_CODE to mark the applied rows in the database.'); process.exit(0); }
  const m = await fetch(`${cfg.url}/rest/v1/rpc/dr_edit`, { method: 'POST', headers: H, body: JSON.stringify({ p_code: code, p_action: 'applied', p: { ids: applied.map(e => e.id) } }) });
  console.log(m.ok ? `marked ${applied.length} rows applied` : `could not mark the rows: ${m.status}`);
}
