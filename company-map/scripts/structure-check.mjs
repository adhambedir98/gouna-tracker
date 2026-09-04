// Compares a JSON data file against the committed version: same keys, same array lengths, same protected values.
//   node scripts/structure-check.mjs data/manual/people.json [more files]
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
const root = path.resolve(new URL('../', import.meta.url).pathname);
const PROTECT = new Set(['id', 'k', 'path', 'slug', 'route', 'kind', 'hub', 'ids', 'sub', 'picture', 'loop', 'start', 'due', 'date', 'version', 'at', 'nameAr', 'pages', 'reportsTo', 'manages', 'peer', 'yes', 'no', 'links', 'phase', 'sops', 'training', 'hour', 'solid', 'arc', 'tier', 'big', 'open', 'under', 'groups', 'answer', 'options']);
let bad = 0;
function cmp(a, b, p, protectedHere) {
  if (Array.isArray(a)) {
    if (!Array.isArray(b)) { console.log(`${p}: was an array`); bad++; return; }
    if (a.length !== b.length) { console.log(`${p}: array length ${a.length} became ${b.length}`); bad++; return; }
    a.forEach((v, i) => cmp(v, b[i], `${p}[${i}]`, protectedHere));
  } else if (a && typeof a === 'object') {
    if (!b || typeof b !== 'object' || Array.isArray(b)) { console.log(`${p}: was an object`); bad++; return; }
    for (const k of Object.keys(a)) { if (!(k in b)) { console.log(`${p}.${k}: key removed`); bad++; } else cmp(a[k], b[k], `${p}.${k}`, PROTECT.has(k)); }
    for (const k of Object.keys(b)) if (!(k in a)) { console.log(`${p}.${k}: key added`); bad++; }
  } else if (protectedHere && a !== b) { console.log(`${p}: protected value "${a}" became "${b}"`); bad++; }
  else if (typeof a !== typeof b) { console.log(`${p}: type ${typeof a} became ${typeof b}`); bad++; }
}
for (const f of process.argv.slice(2)) {
  let before;
  try { before = JSON.parse(execSync(`git show HEAD:company-map/${f}`, { cwd: root, encoding: 'utf8' })); } catch (e) { console.log(`${f}: no committed version, skipped`); continue; }
  const after = JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
  cmp(before, after, f, false);
}
if (bad) { console.log(`\n${bad} structure problem(s).`); process.exitCode = 1; } else console.log('Structure unchanged.');
