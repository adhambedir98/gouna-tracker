// Drives the interactive parts of the site and screenshots each state into shots/.
//   node scripts/interact.mjs
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('../', import.meta.url).pathname);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  let f = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();
const out = n => path.join(root, 'shots', n);
const problems = [];

async function page(ctx, url) {
  const pg = await ctx.newPage();
  pg.on('pageerror', e => problems.push(`${url}: ${e}`));
  pg.on('console', m => { if (m.type() === 'error') problems.push(`${url}: ${m.text()}`); });
  await pg.goto(base + url, { waitUntil: 'networkidle' });
  await pg.evaluate(() => document.fonts.ready);
  return pg;
}

// 1. mobile drawer
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pg = await page(ctx, 'call/');
  await pg.click('#menu');
  await pg.waitForTimeout(100);
  await pg.screenshot({ path: out('x-drawer-390.png') });
  const hidden = await pg.$eval('#drawer', d => d.hidden);
  if (hidden) problems.push('drawer did not open');
  await pg.keyboard.press('Escape');
  if (!(await pg.$eval('#drawer', d => d.hidden))) problems.push('drawer did not close on Escape');
  await ctx.close();
}
// 2. language toggle persists across pages
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pg = await page(ctx, 'rules/');
  await pg.click('#lang');
  await pg.waitForTimeout(100);
  const dir = await pg.evaluate(() => document.documentElement.dir);
  if (dir !== 'rtl') problems.push('toggle did not switch to rtl');
  await pg.goto(base + 'never/', { waitUntil: 'networkidle' });
  const dir2 = await pg.evaluate(() => document.documentElement.dir);
  if (dir2 !== 'rtl') problems.push('language did not persist to the never page');
  await pg.screenshot({ path: out('x-never-390-ar.png'), fullPage: true });
  await pg.goto(base + 'map/', { waitUntil: 'networkidle' });
  const dir3 = await pg.evaluate(() => document.documentElement.dir);
  if (dir3 !== 'rtl') problems.push('language did not persist to the map page');
  await pg.click('#lang');
  await pg.waitForTimeout(400);
  const dir4 = await pg.evaluate(() => document.documentElement.dir);
  if (dir4 !== 'ltr') problems.push('toggle did not switch back to English');
  await ctx.close();
}
// 3. capacity calculator
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pg = await page(ctx, 'manual/control/');
  await pg.fill('#hours', '2000');
  await pg.dispatchEvent('#hours', 'input');
  await pg.waitForTimeout(50);
  const phones = await pg.$eval('#readout .big', e => e.textContent);
  if (phones !== '600') problems.push(`calculator: 2000 hours gave ${phones} phones, expected 600`);
  const el = await pg.$('#calculator');
  await el.screenshot({ path: out('x-calculator-390.png') });
  await ctx.close();
}
// 4. gantt date edit
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pg = await page(ctx, 'manual/compliance/');
  await pg.fill('#c-tax-card-d', '2026-12-15');
  await pg.dispatchEvent('#c-tax-card-d', 'change');
  await pg.waitForTimeout(50);
  await pg.reload({ waitUntil: 'networkidle' });
  const v = await pg.$eval('#c-tax-card-d', e => e.value);
  if (v !== '2026-12-15') problems.push(`gantt date did not persist: ${v}`);
  const fig = await pg.$('#calendar figure');
  await fig.screenshot({ path: out('x-gantt-390.png') });
  await ctx.close();
}
// 5. training checklist persistence and role switch
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pg = await page(ctx, 'training/');
  await pg.check('input[data-item="0"]');
  await pg.check('input[data-item="1"]');
  await pg.reload({ waitUntil: 'networkidle' });
  const n = await pg.$$eval('input[data-item]:checked', els => els.length);
  if (n !== 2) problems.push(`training ticks did not persist: ${n}`);
  await pg.click('[data-role="runner"]');
  await pg.waitForTimeout(50);
  const h = await pg.$eval('#module h2', e => e.textContent);
  if (!/Runner/.test(h)) problems.push(`role switch failed: ${h}`);
  await pg.screenshot({ path: out('x-training-runner-390.png'), fullPage: true });
  await ctx.close();
}
// 6. letter form
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pg = await page(ctx, 'manual/data-logistics/');
  await pg.fill('#lf-register', '123456');
  await pg.dispatchEvent('#lf-register', 'input');
  await pg.fill('#lf-runner', 'Ahmed');
  await pg.dispatchEvent('#lf-runner', 'input');
  await pg.fill('#lf-devices', '30');
  await pg.dispatchEvent('#lf-devices', 'input');
  await pg.waitForTimeout(50);
  const txt = await pg.$eval('#letters', e => e.textContent);
  if (!txt.includes('123456') || !txt.includes('Ahmed') || !txt.includes('30')) problems.push('letter did not fill');
  const el = await pg.$('#letters');
  await el.screenshot({ path: out('x-letter-390.png') });
  await ctx.close();
}
// 7. decision path
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pg = await page(ctx, 'channels/');
  await pg.click('[data-ans="no"]');
  await pg.click('[data-ans="yes"]');
  await pg.click('[data-ans="yes"]');
  await pg.waitForTimeout(50);
  const txt = await pg.$eval('#decide-card', e => e.textContent);
  if (!/Direct operations/.test(txt)) problems.push(`decision path did not reach direct: ${txt.slice(0, 80)}`);
  const el = await pg.$('#decide-card');
  await el.screenshot({ path: out('x-decide-390.png') });
  await ctx.close();
}
// 8. org chart role card and chips
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pg = await page(ctx, 'map/');
  await pg.click('.org .node[data-id="mano"]');
  await pg.waitForTimeout(50);
  await pg.click('#side .chip[data-person="adham"]');
  await pg.waitForTimeout(50);
  const name = await pg.$eval('#side h2', e => e.textContent);
  if (name !== 'Adham Bedir') problems.push(`role card chip failed: ${name}`);
  await pg.screenshot({ path: out('x-rolecard-390.png') });
  await ctx.close();
}
await browser.close();
server.close();
if (problems.length) { console.log(problems.join('\n')); process.exitCode = 1; } else console.log('Interactions clean.');
