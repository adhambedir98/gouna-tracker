// Pushes the content of the map into the database, where the pages read it from once the site is deployed.
// The files in data/ stay the source of truth and are edited as before; this copies them up.
//   DR_REPORT_CODE=... node scripts/push-content.mjs           every file that has changed
//   DR_REPORT_CODE=... node scripts/push-content.mjs --all     every file, changed or not
//   DR_REPORT_CODE=... node scripts/push-content.mjs --dry     say what would go, send nothing
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(new URL('../', import.meta.url).pathname);
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'data/report.json'), 'utf8'));
const code = process.env.DR_REPORT_CODE || '';
const all = process.argv.includes('--all');
const dry = process.argv.includes('--dry');
if (!code && !dry) { console.error('Set DR_REPORT_CODE to the management code.'); process.exit(1); }

const files = [];
(function walk(dir) {
  for (const name of fs.readdirSync(path.join(root, dir))) {
    const rel = dir + '/' + name;
    if (name.startsWith('.')) continue;                 // this script's own stamp file, and anything else hidden
    if (fs.statSync(path.join(root, rel)).isDirectory()) walk(rel);
    else if (name.endsWith('.json')) files.push(rel);
  }
})('data');
files.sort();

const stampFile = path.join(root, 'data/.pushed.json');
const stamp = (() => { try { return JSON.parse(fs.readFileSync(stampFile, 'utf8')); } catch { return {}; } })();

async function rpc(fn, body) {
  const r = await fetch(`${cfg.url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || j.hint || r.statusText);
  return j;
}

let sent = 0, same = 0, bytes = 0;
const bySection = {};
for (const rel of files) {
  const text = fs.readFileSync(path.join(root, rel), 'utf8');
  const sum = crypto.createHash('sha1').update(text).digest('hex').slice(0, 16);
  if (!all && stamp[rel] === sum) { same++; continue; }
  let body;
  try { body = JSON.parse(text); } catch (err) { console.error(`${rel}: not JSON, ${err.message}`); process.exitCode = 1; continue; }
  if (dry) { console.log('would send ' + rel); sent++; continue; }
  for (let tries = 1; ; tries++) {
    try {
      const out = await rpc('dr_content_put', { p_code: code, p_path: rel, p_body: body });
      bySection[out.section] = (bySection[out.section] || 0) + 1;
      stamp[rel] = sum; sent++; bytes += text.length;
      break;
    } catch (err) {
      if (tries >= 4) { console.error(`${rel}: ${err.message}`); process.exitCode = 1; break; }
      await new Promise(r => setTimeout(r, tries * 1500));
    }
  }
}
if (!dry) fs.writeFileSync(stampFile, JSON.stringify(stamp, null, 2) + '\n');
console.log(`${sent} sent, ${same} unchanged, ${Math.round(bytes / 1024)} KB` + (Object.keys(bySection).length ? ', ' + Object.entries(bySection).map(([s, n]) => `${s} ${n}`).join(', ') : ''));
