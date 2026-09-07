// Screenshots of edit mode: the code box answered, the section bars drawn, the top of the page at 1280 and 390.
// The database is mocked, so nothing is saved.   node scripts/shoot-edit.mjs [--page rules]
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('../', import.meta.url).pathname);
const args = process.argv.slice(2);
const only = args[args.indexOf('--page') + 1] && args.includes('--page') ? args[args.indexOf('--page') + 1] : null;
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let f = path.join(root, p);
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}/`;
const PAGES = only ? [only] : ['', 'map', 'channels', 'rules', 'never', 'forms', 'jobs', 'jobs/operator', 'sops/vet', 'manual/people', 'metrics', 'risks', 'incidents', 'training'];
fs.mkdirSync(path.join(root, 'shots'), { recursive: true });
const browser = await chromium.launch();
const problems = [];
for (const p of PAGES) for (const width of [1280, 390]) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 } });
  const pg = await ctx.newPage();
  const errors = [];
  pg.on('pageerror', e => errors.push(String(e)));
  await pg.route(u => /supabase\.co/.test(u.href), r => r.fulfill({ json: r.request().method() === 'GET' ? [] : { ok: true, id: 'x' } }));
  await pg.goto(base + (p ? p + '/' : ''), { waitUntil: 'networkidle' });
  await pg.click('#edit');
  await pg.waitForSelector('#ask-box input'); await pg.fill('#ask-box input', 'code'); await pg.keyboard.press('Enter');
  await pg.waitForSelector('#ask-box input'); await pg.fill('#ask-box input', 'Shots'); await pg.keyboard.press('Enter');
  await pg.waitForSelector('body.editing');
  await pg.waitForTimeout(300);
  const name = `edit-${p ? p.replace(/\//g, '-') : 'start'}-${width}.png`;
  const m = await pg.evaluate(() => ({ bars: document.querySelectorAll('.bk-bar').length, sw: document.documentElement.scrollWidth, iw: window.innerWidth, h: document.documentElement.scrollHeight }));
  await pg.screenshot({ path: path.join(root, 'shots', name), fullPage: false, clip: { x: 0, y: 0, width, height: Math.min(1400, m.h) } });
  const flags = [];
  if (m.sw > m.iw + 1) flags.push(`horizontal overflow ${m.sw}px in ${m.iw}px`);
  if (errors.length) flags.push(`errors: ${errors.join(' | ')}`);
  if (!m.bars) flags.push('no section bars');
  console.log(`${name.padEnd(34)} ${String(m.bars).padStart(3)} bars${flags.length ? '   ' + flags.join('; ') : ''}`);
  if (flags.length) problems.push(`${name}: ${flags.join('; ')}`);
  await ctx.close();
}
await browser.close();
server.close();
console.log(problems.length ? '\n' + problems.join('\n') : '\nClean.');
process.exit(problems.length ? 1 : 0);
