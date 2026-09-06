// Screenshots every page at 390 and 1280 with Playwright. Flags horizontal overflow and console errors.
//   node scripts/shoot.mjs                    all pages, both widths
//   node scripts/shoot.mjs --page call        one page (slug from data/site.json nav, "start" for the home page)
//   node scripts/shoot.mjs --lang ar          Arabic mode
//   node scripts/shoot.mjs --print            print media at 794px (A4)
//   node scripts/shoot.mjs --width 390        one width
//   node scripts/shoot.mjs --page call --hash upload   open with a URL hash (a route, a person)
//   node scripts/shoot.mjs --page rules --width 390 --from 0 --maxh 3000   a slice of a tall page
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('../', import.meta.url).pathname);
const args = process.argv.slice(2);
const opt = (name, fb) => { const i = args.indexOf(`--${name}`); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : fb; };
const only = opt('page', null);
const langMode = opt('lang', 'en');
const printMode = opt('print', false) === true;
const hash = opt('hash', null);
const from = Number(opt('from', 0)) || 0;
const maxh = Number(opt('maxh', 0)) || 0;
const widths = opt('width', null) ? [Number(opt('width'))] : (printMode ? [794] : [390, 1280]);

const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.txt': 'text/plain', '.md': 'text/markdown' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let f = path.join(root, p);
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!fs.existsSync(f) && fs.existsSync(f + '.html')) f += '.html';
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}/`;

const site = JSON.parse(fs.readFileSync(path.join(root, 'data/site.json'), 'utf8'));
const pages = site.nav.flatMap(g => g.items.map(i => ({ path: i.path, slug: i.path ? i.path.replace(/\//g, '-') : 'start', online: !!i.online })));
const todo = pages.filter(p => !only || p.slug === only || p.path === only);
if (!todo.length) { console.error(`No page named ${only}. Known: ${pages.map(p => p.slug).join(', ')}`); process.exit(1); }

fs.mkdirSync(path.join(root, 'shots'), { recursive: true });
const browser = await chromium.launch();
const problems = [];
for (const page of todo) {
  for (const width of widths) {
    const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, deviceScaleFactor: 1 });
    if (langMode === 'ar') await ctx.addInitScript(() => { try { localStorage.setItem('vm.lang', JSON.stringify('ar')); } catch {} });
    const pg = await ctx.newPage();
    const errors = [];
    // every page reaches the company database for live edits; a machine with no route to it is not a page error
    pg.on('console', m => { if (m.type() === 'error' && !/net::ERR_/.test(m.text())) errors.push(m.text()); });
    pg.on('pageerror', e => errors.push(String(e)));
    const url = base + (page.path ? page.path + '/' : '') + (hash && hash !== true ? '#' + hash : '');
    try {
      await pg.goto(url, { waitUntil: 'networkidle' });
      await pg.evaluate(() => document.fonts.ready);
      if (printMode) await pg.emulateMedia({ media: 'print' });
      await pg.waitForTimeout(150);
      const m = await pg.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, h: document.documentElement.scrollHeight, title: document.title }));
      const name = `${page.slug}-${width}${langMode === 'ar' ? '-ar' : ''}${printMode ? '-print' : ''}${hash && hash !== true ? '-' + hash : ''}.png`;
      const clip = maxh ? { x: 0, y: from, width, height: Math.max(1, Math.min(maxh, m.h - from)) } : undefined;
      const outName = clip ? name.replace('.png', `-${from}-${from + clip.height}.png`) : name;
      await pg.screenshot({ path: path.join(root, 'shots', outName), fullPage: true, clip });
      const flags = [];
      if (m.sw > m.iw + 1) flags.push(`horizontal overflow ${m.sw}px in ${m.iw}px`);
      if (errors.length) flags.push(`console: ${errors.join(' | ')}`);
      console.log(`${name.padEnd(36)} ${String(m.h).padStart(6)}px tall${flags.length ? '   ' + flags.join('; ') : ''}`);
      if (flags.length) problems.push(`${name}: ${flags.join('; ')}`);
    } catch (e) {
      console.log(`${page.slug}-${width}: failed ${e.message}`);
      problems.push(`${page.slug}-${width}: ${e.message}`);
    }
    await ctx.close();
  }
}
await browser.close();
server.close();
if (problems.length) { console.log(`\n${problems.length} problem(s):\n${problems.map(p => '  ' + p).join('\n')}`); process.exitCode = 2; }
else console.log('\nClean.');
