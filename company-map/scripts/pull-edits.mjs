// Writes the live edits into the source files, so they stay after the database rows are gone.
//   DR_REPORT_CODE=... node scripts/pull-edits.mjs                 apply the text rows, then mark them applied
//   node scripts/pull-edits.mjs --dry                               show what would change, touch nothing
//   DR_REPORT_CODE=... node scripts/pull-edits.mjs --sections-done  also mark the section rows applied, once a person has done them by hand
// A text row is applied to the files of its page first: data/<page>.json and its Arabic mirror, the page module, the shared
// modules, and the page's block (plus common) in data/ui.json. A row whose text lives only elsewhere is applied when it
// matches exactly one file, and skipped (listed) when it matches several. English changes go into plain strings of the
// English files and the en side of {en, ar} objects; Arabic changes into the data/ar mirrors and the ar side.
// Sections hidden, deleted, or moved are listed for a hand edit in the page's data or module.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('../', import.meta.url).pathname);
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'data/report.json'), 'utf8'));
const H = { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key, 'Content-Type': 'application/json' };
const dry = process.argv.includes('--dry');
const sectionsDone = process.argv.includes('--sections-done');
const code = process.env.DR_REPORT_CODE || '';

const r = await fetch(`${cfg.url}/rest/v1/dr_edits?select=id,page,lang,kind,before,after,who&applied=eq.false&order=at.asc`, { headers: H });
const all = await r.json();
if (!Array.isArray(all) || !all.length) { console.log('No live edits.'); process.exit(0); }
const sections = all.filter(e => e.kind && e.kind !== 'text');
const edits = all.filter(e => !e.kind || e.kind === 'text');
for (const s of sections) {
  let what = s.after;
  if (s.kind === 'order') { try { what = 'new order: ' + (JSON.parse(s.after).labels || []).join(', '); } catch { what = s.after; } }
  console.log(`BY HAND: [${s.page}] section ${s.kind === 'order' ? 'order' : s.kind} (${s.before}): ${what}  (${s.who || ''})`);
}

function jsonFiles(dir) {
  const out = [];
  (function walk(d) { for (const n of fs.readdirSync(d)) { const p = path.join(d, n); if (fs.statSync(p).isDirectory()) walk(p); else if (n.endsWith('.json')) out.push(p); } })(dir);
  return out;
}
const isAr = f => f.includes(path.sep + 'ar' + path.sep);
const allJSON = jsonFiles(path.join(root, 'data')).filter(f => !f.endsWith('ui.json'));
const pageJS = fs.readdirSync(path.join(root, 'js/pages')).map(f => path.join(root, 'js/pages', f));
const sharedJS = fs.readdirSync(path.join(root, 'js')).filter(f => f.endsWith('.js')).map(f => path.join(root, 'js', f));
const uiPath = path.join(root, 'data/ui.json');

// the files a page's text is most likely to live in
function filesFor(page) {
  if (page === 'all') return { data: [path.join(root, 'data/site.json'), path.join(root, 'data/ar/site.json')].filter(f => fs.existsSync(f)), js: sharedJS, ui: ['common'] };
  const slug = page.replace(/\//g, '-');
  const data = allJSON.filter(f => { const rel = path.relative(path.join(root, 'data'), f).replace(/\\/g, '/').replace(/^ar\//, ''); return rel === page + '.json' || rel.startsWith(page + '/'); });
  const js = [...pageJS.filter(f => path.basename(f, '.js') === slug), ...sharedJS];
  return { data, js, ui: [page, slug, 'common'] };
}

// replace whole string values equal to `before`, in place, across a JSON tree. Returns how many.
function replaceIn(obj, before, after, wantLang, plainLang) {
  let n = 0;
  const go = o => {
    if (Array.isArray(o)) { o.forEach((v, i) => { if (typeof v === 'string') { if (plainLang === wantLang && v === before) { o[i] = after; n++; } } else go(v); }); return; }
    if (o && typeof o === 'object') {
      for (const k of Object.keys(o)) {
        const v = o[k];
        if (typeof v === 'string') {
          // inside an {en, ar} object only the wanted language changes; a plain string is in the file's language
          if (k === 'en' || k === 'ar') { if (k === wantLang && v === before) { o[k] = after; n++; } }
          else if (plainLang === wantLang && v === before) { o[k] = after; n++; }
        } else go(v);
      }
    }
  };
  go(obj);
  return n;
}
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const q = s => "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";

const touched = new Map();   // file -> parsed JSON or text
const read = f => { if (!touched.has(f)) touched.set(f, f.endsWith('.json') ? JSON.parse(fs.readFileSync(f, 'utf8')) : fs.readFileSync(f, 'utf8')); return touched.get(f); };
const applied = [], missed = [], ambiguous = [];

// one edit against one set of files; `commit` false only counts
function apply(e, files, uiBlocks, commit) {
  const wantLang = e.lang === 'ar' ? 'ar' : 'en';
  const hits = [];
  for (const f of files.data) {
    const d = commit ? read(f) : JSON.parse(fs.readFileSync(f, 'utf8'));
    const k = replaceIn(d, e.before, e.after, wantLang, isAr(f) ? 'ar' : 'en');
    if (k) hits.push([f, k]);
  }
  const ui = commit ? read(uiPath) : JSON.parse(fs.readFileSync(uiPath, 'utf8'));
  for (const name of uiBlocks) {
    const block = ui[name]; if (!block) continue;
    let k = 0;
    if (wantLang === 'en' && Object.prototype.hasOwnProperty.call(block, e.before)) { if (commit) { block[e.after] = block[e.before]; delete block[e.before]; } k++; }
    if (wantLang === 'ar') for (const key of Object.keys(block)) if (block[key] === e.before) { if (commit) block[key] = e.after; k++; }
    if (k) hits.push([uiPath + ':' + name, k]);
  }
  const re = wantLang === 'en' ? new RegExp("(L\\(|en: |T\\()" + escRe(q(e.before)), 'g') : new RegExp("(ar: |, )" + escRe(q(e.before)), 'g');
  for (const f of files.js) {
    const s = commit ? read(f) : fs.readFileSync(f, 'utf8');
    const k = (s.match(re) || []).length;
    if (k) { if (commit) touched.set(f, s.replace(re, (m, p) => p + q(e.after))); hits.push([f, k]); }
  }
  return hits;
}

for (const e of edits) {
  const scoped = filesFor(e.page);
  let hits = apply(e, scoped, scoped.ui, false);
  if (hits.length) { hits = apply(e, scoped, scoped.ui, true); applied.push({ ...e, hits }); continue; }
  // not in the page's own files: anywhere, but only when the text lives in exactly one place
  const wide = { data: allJSON, js: [...pageJS, ...sharedJS] };
  const uiAll = Object.keys(JSON.parse(fs.readFileSync(uiPath, 'utf8')));
  hits = apply(e, wide, uiAll, false);
  if (hits.length === 1) { hits = apply(e, { data: wide.data.filter(f => f === hits[0][0]), js: wide.js.filter(f => f === hits[0][0]) }, uiAll.filter(n => uiPath + ':' + n === hits[0][0]), true); applied.push({ ...e, hits, wide: true }); }
  else if (hits.length > 1) ambiguous.push({ ...e, hits });
  else missed.push(e);
}

for (const [f, v] of touched) {
  const out = typeof v === 'string' ? v : JSON.stringify(v, null, 2) + '\n';
  const cur = fs.readFileSync(f, 'utf8');
  if (out === cur) continue;
  console.log(`${dry ? 'would write' : 'wrote'} ${path.relative(root, f)}`);
  if (!dry) fs.writeFileSync(f, out);
}
const where = h => h.map(([f, k]) => `${path.relative(root, f)}${k > 1 ? ' x' + k : ''}`).join(', ');
for (const e of applied) console.log(`applied: [${e.page}/${e.lang}] ${e.before.slice(0, 60)} -> ${e.after.slice(0, 60)}  in ${where(e.hits)}${e.wide ? '  (outside the page\'s own files)' : ''}`);
for (const e of ambiguous) console.log(`SEVERAL PLACES, skipped: [${e.page}/${e.lang}] ${e.before.slice(0, 60)} -> ${e.after.slice(0, 60)}  in ${where(e.hits)}`);
for (const e of missed) console.log(`NOT FOUND in the source: [${e.page}/${e.lang}] ${e.before.slice(0, 70)} -> ${e.after.slice(0, 70)}  (${e.who || ''})`);
console.log(`\n${applied.length} applied, ${ambiguous.length + missed.length} to do by hand, ${sections.length} section change${sections.length === 1 ? '' : 's'} by hand${sections.length && !sectionsDone ? ' (run again with --sections-done once they are in the source)' : ''}.`);

if (dry) process.exit(0);
const ids = [...applied.map(e => e.id), ...(sectionsDone ? sections.map(e => e.id) : [])];
if (!ids.length) process.exit(0);
if (!code) { console.log('Set DR_REPORT_CODE to mark the applied rows in the database.'); process.exit(0); }
const m = await fetch(`${cfg.url}/rest/v1/rpc/dr_edit`, { method: 'POST', headers: H, body: JSON.stringify({ p_code: code, p_action: 'applied', p: { ids } }) });
console.log(m.ok ? `marked ${ids.length} rows applied` : `could not mark the rows: ${m.status}`);
