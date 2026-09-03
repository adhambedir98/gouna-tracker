// Crops one element of a page to shots/<name>.png at 2x.
//   node scripts/crop.mjs <route> "<css selector>" <name> [en|ar] [width]
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root = '/home/user/gouna-tracker/company-map';
const [,, route, sel, name, lang = 'en', width = '1280'] = process.argv;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const server = http.createServer((q, s) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(root, p); fs.readFile(f, (e, d) => { if (e) { s.statusCode = 404; s.end(); return; } s.setHeader('content-type', types[path.extname(f)] || 'application/octet-stream'); s.end(d); }); }).listen(0);
const port = server.address().port;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: Number(width), height: 900 }, deviceScaleFactor: 2 });
if (lang === 'ar') await ctx.addInitScript(() => { try { localStorage.setItem('vm.lang', JSON.stringify('ar')); } catch {} });
const pg = await ctx.newPage();
await pg.goto(`http://127.0.0.1:${port}/${route}/`, { waitUntil: 'networkidle' });
await pg.waitForSelector(sel); await pg.waitForTimeout(300);
const el = await pg.$(sel);
await el.screenshot({ path: path.join(root, 'shots', name + '.png') });
await browser.close(); server.close(); console.log('ok ' + name);
