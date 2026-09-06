// End-to-end check of the live edit layer against the real database: the site is served from this folder, the browser's
// database calls are relayed through Node (so it works from a machine whose browser has no route out), and the flow is
// driven with real clicks and real typing, on a desktop and on a phone. Every row it writes is removed at the end.
//   DR_REPORT_CODE=... node scripts/live-edit.mjs
import { chromium, devices } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('../', import.meta.url).pathname);
const CODE = process.env.DR_REPORT_CODE || '';
if (!CODE) { console.error('Set DR_REPORT_CODE.'); process.exit(1); }
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'data/report.json'), 'utf8'));
const H = { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key, 'Content-Type': 'application/json' };

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

const written = new Set();
async function relay(r) {
  const q = r.request();
  const headers = {};
  for (const [k, v] of Object.entries(q.headers())) if (!['host', 'origin', 'referer', 'content-length', 'accept-encoding'].includes(k) && !k.startsWith(':')) headers[k] = v;
  try {
    const res = await fetch(q.url(), { method: q.method(), headers, body: q.postData() || undefined });
    const body = Buffer.from(await res.arrayBuffer());
    if (q.url().endsWith('/rpc/dr_edit') && res.ok) { try { const j = JSON.parse(body.toString()); if (j.id) written.add(j.id); } catch {} }
    const h = {}; res.headers.forEach((v, k) => { if (!['content-encoding', 'transfer-encoding', 'content-length'].includes(k)) h[k] = v; });
    await r.fulfill({ status: res.status, headers: h, body });
  } catch (e) { console.log('relay failed: ' + e.message); await r.abort(); }
}

const browser = await chromium.launch();
const problems = [];
async function run(name, ctxOpts, tap) {
  const ctx = await browser.newContext(ctxOpts);
  const pg = await ctx.newPage();
  const log = [];
  const say = s => { log.push(s); };
  pg.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') say(`console.${m.type()}: ${m.text()}`); });
  pg.on('pageerror', e => say(`pageerror: ${e.message}`));
  pg.on('dialog', async d => { say(`unexpected browser dialog: ${d.message()}`); await d.dismiss(); });
  // the code and the name are asked in a box on the page, not in a browser dialog
  const answer = async text => { await pg.waitForSelector('#ask-box input', { timeout: 5000 }); say(`box: ${await pg.$eval('#ask-box .t', e => e.textContent)}`); await pg.fill('#ask-box input', text); await pg.click('#ask-box [type=submit]'); };
  pg.on('response', r => { if (r.url().includes('supabase.co')) say(`net ${r.request().method()} ${r.status()} ${r.url().replace(/^https:\/\/[^/]+/, '').slice(0, 90)}`); });
  await pg.route(u => /\.supabase\.co\//.test(u.href), relay);
  const act = async el => (tap ? el.tap() : el.click());
  await pg.goto(base + 'rules/', { waitUntil: 'networkidle' });
  const original = await pg.$eval('#head h1', e => e.textContent.trim());
  say(`h1 at load: ${original}`);
  const btn = await pg.$('#edit');
  if (!btn) { problems.push(`${name}: no Edit button`); await ctx.close(); return log; }
  await act(btn);
  await answer(CODE);
  await answer('Probe');
  await pg.waitForSelector('body.editing', { timeout: 5000 }).catch(() => say('edit mode did not start'));
  await pg.waitForTimeout(300);
  say(`editing: ${await pg.evaluate(() => document.body.classList.contains('editing'))}, spans: ${await pg.$$eval('.ed', s => s.length)}, section bars: ${await pg.$$eval('.bk-bar', s => s.length)}`);
  const h1 = await pg.$('#head h1 .ed');
  if (!h1) { problems.push(`${name}: heading not wrapped`); await ctx.close(); return log; }
  await act(h1);
  await pg.waitForTimeout(150);
  say(`focused: ${await pg.evaluate(() => { const a = document.activeElement; return a ? a.tagName + '.' + a.className + ' editable=' + a.isContentEditable : 'none'; })}`);
  await pg.keyboard.press('End');
  await pg.keyboard.type(' Probe');
  say(`typed: ${await pg.$eval('#head h1', e => e.textContent.trim())}`);
  await pg.keyboard.press('Enter');
  await pg.waitForSelector('#toast.on', { timeout: 8000 }).catch(() => say('no toast'));
  say(`toast: ${await pg.evaluate(() => document.getElementById('toast')?.textContent || '')}`);
  // a second block of body text, committed by clicking away
  const li = await pg.$('#content .ed');
  const liBefore = await pg.evaluate(e => e.dataset.before, li);
  await act(li);
  await pg.keyboard.press('End');
  await pg.keyboard.type(' Probe');
  await act(await pg.$('#head p, #head'));
  await pg.waitForTimeout(1200);
  say(`toast 2: ${await pg.evaluate(() => document.getElementById('toast')?.textContent || '')}`);
  await pg.screenshot({ path: path.join(root, 'shots', `live-${name}.png`), fullPage: false });
  // everyone else: a fresh load shows the change
  await pg.reload({ waitUntil: 'networkidle' });
  await pg.waitForTimeout(400);
  const after = await pg.$eval('#head h1', e => e.textContent.trim());
  say(`h1 after reload: ${after}`);
  if (after !== original + ' Probe') problems.push(`${name}: the edit did not show after reload (${after})`);
  const liNow = await pg.evaluate(t => [...document.querySelectorAll('#content *')].some(e => e.childNodes.length && [...e.childNodes].some(n => n.nodeType === 3 && n.nodeValue.trim() === t + ' Probe')), liBefore);
  if (!liNow) problems.push(`${name}: the body edit did not show after reload`);
  // put it back through the same flow: same text as the source removes the row
  await act(await pg.$('#edit'));
  await pg.waitForTimeout(400);
  const h1b = await pg.$('#head h1 .ed');
  await act(h1b);
  await pg.keyboard.press('Control+A');
  await pg.keyboard.type(original);
  await pg.keyboard.press('Enter');
  await pg.waitForTimeout(1200);
  say(`toast 3: ${await pg.evaluate(() => document.getElementById('toast')?.textContent || '')}`);
  // and the body text: the same text as the source removes that row too
  for (const s of await pg.$$('#content .ed')) {
    if ((await pg.evaluate(e => e.dataset.before, s)) !== liBefore) continue;
    await act(s); await pg.keyboard.press('Control+A'); await pg.keyboard.type(liBefore); await pg.keyboard.press('Enter'); await pg.waitForTimeout(1000);
    break;
  }
  await ctx.close();
  return log;
}

console.log('== desktop');
console.log((await run('desktop', { viewport: { width: 1280, height: 900 } }, false)).join('\n'));
console.log('== phone');
console.log((await run('phone', { ...devices['iPhone 13'] }, true)).join('\n'));
await browser.close();
server.close();

// leave the database as it was
const r = await fetch(`${cfg.url}/rest/v1/dr_edits?select=id,page,before&page=eq.rules&after=like.*Probe*`, { headers: H });
const rows = r.ok ? await r.json() : [];
for (const row of rows) written.add(row.id);
for (const id of written) await fetch(`${cfg.url}/rest/v1/rpc/dr_edit`, { method: 'POST', headers: H, body: JSON.stringify({ p_code: CODE, p_action: 'delete', p: { id, who: 'live-edit check' } }) }).catch(() => {});
console.log(`\ncleaned ${written.size} rows`);
console.log(problems.length ? 'PROBLEMS:\n' + problems.join('\n') : 'Live edits clean.');
process.exit(problems.length ? 1 : 0);
