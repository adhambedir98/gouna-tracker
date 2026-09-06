// Checks an Arabic data file against its English original: same shape, identifiers untouched, nothing left in English.
//   node scripts/check-ar.mjs data/flow.json            checks data/ar/flow.json
//   node scripts/check-ar.mjs                           checks every data/ar file that exists
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('../', import.meta.url).pathname);
const PROTECT = new Set(['id', 'k', 'path', 'slug', 'route', 'kind', 'status', 'hub', 'ids', 'sub', 'picture', 'loop', 'start', 'due', 'date', 'version', 'at', 'nameAr', 'pages', 'reportsTo', 'manages', 'peer', 'yes', 'no', 'links', 'phase', 'sops', 'training']);
// "sub" is an identifier only when it points at another item (a group's sub in people.json); elsewhere it is a visible subtitle
const isId = v => typeof v === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(v);
const protectedKey = (k, v) => PROTECT.has(k) && !(k === 'sub' && !(isId(v) || (Array.isArray(v) && v.length > 0 && v.every(isId))));
const LATIN_OK = /^(KMSC|MDM|ID|QC|IMEI|EGP|UPS|PPE|ITIDA|VAT|DPO|PIP|Hexnode|Apple Business Manager|Shedi|GB|TB|Mbps|A|B|\{[a-z]+\}|[0-9.,:%\s/-]+)$/;

function check(enFile) {
  const arFile = enFile.replace(/^data\//, 'data/ar/');
  const problems = [];
  if (!fs.existsSync(path.join(root, arFile))) return [`${arFile}: missing`];
  const en = JSON.parse(fs.readFileSync(path.join(root, enFile), 'utf8'));
  let ar;
  try { ar = JSON.parse(fs.readFileSync(path.join(root, arFile), 'utf8')); } catch (e) { return [`${arFile}: invalid JSON (${e.message})`]; }
  let strings = 0, translated = 0;
  function walk(a, b, p) {
    if (Array.isArray(a)) {
      if (!Array.isArray(b)) return problems.push(`${p}: array expected`);
      if (a.length !== b.length) return problems.push(`${p}: ${a.length} items in English, ${b.length} in Arabic`);
      a.forEach((v, i) => walk(v, b[i], `${p}[${i}]`));
      return;
    }
    if (a && typeof a === 'object') {
      if ('en' in a && 'ar' in a) return; // already bilingual, a string pair or an object pair
      if (!b || typeof b !== 'object' || Array.isArray(b)) return problems.push(`${p}: object expected`);
      for (const k of Object.keys(a)) {
        if (!(k in b)) { problems.push(`${p}.${k}: missing in Arabic`); continue; }
        if (protectedKey(k, a[k])) { if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) problems.push(`${p}.${k}: identifier changed (${JSON.stringify(a[k])} became ${JSON.stringify(b[k])})`); continue; }
        walk(a[k], b[k], `${p}.${k}`);
      }
      for (const k of Object.keys(b)) if (!(k in a)) problems.push(`${p}.${k}: extra key in Arabic`);
      return;
    }
    if (typeof a === 'string') {
      if (typeof b !== 'string') return problems.push(`${p}: string expected`);
      if (/[\u2013\u2014]/.test(b)) problems.push(`${p}: em or en dash in Arabic`);
      if (!/[a-zA-Z]/.test(a)) return; // numbers, codes
      strings++;
      if (b === a) { if (!LATIN_OK.test(a.trim())) problems.push(`${p}: left in English: "${a.slice(0, 60)}"`); return; }
      if (!/[؀-ۿ]/.test(b)) problems.push(`${p}: no Arabic letters: "${b.slice(0, 60)}"`);
      translated++;
      return;
    }
    if (a !== b) problems.push(`${p}: ${JSON.stringify(a)} became ${JSON.stringify(b)}`);
  }
  walk(en, ar, enFile);
  problems.push(`${arFile}: ${translated} of ${strings} strings translated`);
  return problems;
}

// data/ar/index.json must list exactly the Arabic files that exist
function checkIndex() {
  const found = [];
  (function w(d) { if (!fs.existsSync(path.join(root, d))) return; for (const n of fs.readdirSync(path.join(root, d))) { const p = `${d}/${n}`; if (fs.statSync(path.join(root, p)).isDirectory()) w(p); else if (n.endsWith('.json') && p !== 'data/ar/index.json') found.push(p.replace(/^data\/ar\//, '')); } })('data/ar');
  let listed = [];
  try { listed = JSON.parse(fs.readFileSync(path.join(root, 'data/ar/index.json'), 'utf8')).files || []; } catch { return ['data/ar/index.json: missing or invalid']; }
  const out = [];
  for (const f of found) if (!listed.includes(f)) out.push(`data/ar/index.json: ${f} exists but is not listed`);
  for (const f of listed) if (!found.includes(f)) out.push(`data/ar/index.json: ${f} is listed but does not exist`);
  return out;
}

const args = process.argv.slice(2);
let files = args;
if (!files.length) {
  files = [];
  (function w(d) { for (const n of fs.readdirSync(path.join(root, d))) { const p = `${d}/${n}`; if (fs.statSync(path.join(root, p)).isDirectory()) { if (p !== 'data/ar') w(p); } else if (n.endsWith('.json')) files.push(p); } })('data');
  files = files.filter(f => fs.existsSync(path.join(root, f.replace(/^data\//, 'data/ar/'))));
}
let bad = 0;
for (const line of checkIndex()) { console.log(line); bad++; }
for (const f of files) {
  const out = check(f);
  for (const line of out) { console.log(line); if (!/ of \d+ strings translated$/.test(line)) bad++; }
}
if (bad) { console.log(`\n${bad} problem(s).`); process.exitCode = 1; } else console.log('\nArabic data clean.');
