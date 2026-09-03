// Content rules. Fails on em dashes, en dashes, emoji, forbidden names, all-caps labels.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('../', import.meta.url).pathname);
const skip = new Set(['node_modules', 'shots', 'fonts', 'dist', '.git', 'package-lock.json']);
const selfFiles = new Set(['scripts/lint-content.mjs', 'GUIDE.md', 'README.md']);
const exts = new Set(['.html', '.js', '.mjs', '.json', '.css', '.md']);
const ALLOW_CAPS = new Set(['KMSC', 'EGP', 'MDM', 'UPS', 'PPE', 'QC', 'ID', 'IDS', 'IMEI', 'GB', 'TB', 'MB', 'ITIDA', 'VAT', 'DPO', 'PIP', 'ISP', 'CEO', 'CTO', 'USB', 'SIM', 'PDF', 'A4', 'AM', 'PM', 'UTC', 'ABM', 'API', 'CSS', 'SVG', 'JSON', 'HTML', 'RTL', 'LTR', 'URL', 'PNG', 'HTTP', 'HTTPS', 'DNS', 'UTF', 'CLI', 'README', 'GUIDE', 'TODO', 'NS', 'EOF', 'EN', 'AR', 'US', 'OK', 'TV', 'GPS', 'NDA', 'SOP', 'SOPS', 'QA', 'UI', 'MIT', 'OFL', 'IBM', 'ISO', 'BOM', 'FAQ', 'SIL']);
const NAMES = new RegExp('\\b(M' + 'ustafa|M' + 'ostafa|M' + 'oustafa|Y' + 'ahia|Y' + 'ehia|Y' + 'ahya)\\b', 'i');
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}]/u;

const problems = [];
function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    if (skip.has(name)) continue;
    const f = path.join(dir, name);
    const st = fs.statSync(f);
    if (st.isDirectory()) { walk(f); continue; }
    if (!exts.has(path.extname(f))) continue;
    check(f);
  }
}
function check(file) {
  const rel = path.relative(root, file);
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const isContent = /\.(json|html|md)$/.test(file);
  lines.forEach((line, i) => {
    const where = `${rel}:${i + 1}`;
    if (line.includes('\u2014')) problems.push(`${where}: em dash`);
    if (line.includes('\u2013')) problems.push(`${where}: en dash`);
    if (EMOJI.test(line)) problems.push(`${where}: emoji`);
    if (!selfFiles.has(rel) && NAMES.test(line)) problems.push(`${where}: forbidden name`);
    if (isContent) {
      // Visible strings only: strip JSON keys, attribute names, and code-ish tokens.
      const visible = line.replace(/"[a-zA-Z0-9_-]+"\s*:/g, '').replace(/<[^>]+>/g, ' ').replace(/https?:\S+/g, ' ');
      for (const m of visible.matchAll(/\b[A-Z]{3,}\b/g)) {
        if (!ALLOW_CAPS.has(m[0])) problems.push(`${where}: all-caps "${m[0]}"`);
      }
    }
  });
}
walk(root);
if (problems.length) {
  console.log(problems.join('\n'));
  console.log(`\n${problems.length} problem(s).`);
  process.exitCode = 1;
} else console.log('Content clean.');
