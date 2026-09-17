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
// Every page is read by somebody. These tests read as a founder, whose role opens the whole map; a test that needs another role
// routes dr_me itself, and a page route always wins over this one.
const ME = { signed_in: true, id: 'u1', email: 'test@example.com', name: 'Test Founder', role: 'founder', status: 'active',
  sections: ['company', 'everyday', 'training', 'forms', 'sops', 'manual', 'numbers', 'money', 'jobs', 'mine', 'command', 'admin', 'accounts'], posthog: { key: '', host: '' } };
const newContext = browser.newContext.bind(browser);
browser.newContext = async (...a) => {
  const ctx = await newContext(...a);
  await ctx.addInitScript(() => { try { localStorage.setItem('vm.session', JSON.stringify({ access_token: 'test', refresh_token: 'test', expires_at: 9e9 })); } catch {} });
  await ctx.route('**/rest/v1/rpc/dr_me', r => r.fulfill({ json: ME }));
  await ctx.route('**/rest/v1/rpc/dr_event', r => r.fulfill({ json: { ok: true } }));
  // every page asks the database for the live edits. A machine with no route out sits on that call for twelve seconds before
  // giving up, on every page load, which is the whole running time of this suite. No edits is the honest default; a test that
  // wants edits routes this itself, and a page route always wins over this one.
  await ctx.route('**/rest/v1/rpc/dr_edits_read', r => r.fulfill({ json: [] }));
  // Every screenshot this suite takes is a state somebody will look at, so every screenshot is also a layout check.
  // Hanging it off the screenshot rather than off the page means a test cannot forget to ask for it.
  const newPage = ctx.newPage.bind(ctx);
  ctx.newPage = async (...b) => {
    const pg = await newPage(...b);
    const shot = pg.screenshot.bind(pg);
    pg.screenshot = async (o = {}) => { await barLevel(pg, path.basename(String(o.path || 'a screen'))); return shot(o); };
    return pg;
  };
  return ctx;
};
const out = n => path.join(root, 'shots', n);
const problems = [];

async function page(ctx, url) {
  const pg = await ctx.newPage();
  pg.on('pageerror', e => problems.push(`${url}: ${e}`));
  // the live-edit layer reaches the company database on every page; a machine with no route to it is not a page error
  pg.on('console', m => { if (m.type() === 'error' && !/net::ERR_/.test(m.text())) problems.push(`${url}: ${m.text()}`); });
  await pg.goto(base + url, { waitUntil: 'networkidle' });
  await pg.evaluate(() => document.fonts.ready);
  await barLevel(pg, url);
  return pg;
}

// Every control in a toolbar stands the same height. One rule, checked on every page that has one, so a new button
// cannot quietly sit a few pixels off the ones beside it.
async function barLevel(pg, where) {
  const bars = await pg.evaluate(() => [...document.querySelectorAll('.daybar')].map(bar => {
    const kids = [...bar.querySelectorAll(':scope > .btn, :scope > input, :scope > select, :scope > .chips > .chip, :scope > .seg > *, :scope > .acts > .btn')];
    const seen = kids.filter(k => k.offsetParent !== null).map(k => [k.id || k.className || k.tagName, Math.round(k.getBoundingClientRect().height)]);
    return seen;
  }));
  for (const bar of bars) {
    const hs = [...new Set(bar.map(x => x[1]))];
    if (hs.length > 1) problems.push(`${where}: the toolbar controls are not the same height: ${JSON.stringify(bar)}`);
  }
  // A control whose label is followed by a count must still show the space between them. A flex container drops a
  // whitespace-only text node, and "Open 3" silently becomes "Open3", which no test of the DOM would ever see.
  const tight = await pg.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('.daybar .chip, .daybar .btn')) {
      const span = el.querySelector('span');
      if (!span || el.offsetParent === null) continue;
      const prev = span.previousSibling;
      if (!prev || prev.nodeType !== 3 || !/\s$/.test(prev.textContent)) continue;
      // measure the label without its trailing space, so what is left between them is the space itself
      const bare = prev.textContent.replace(/\s+$/, '').length;
      if (!bare) continue;
      const r = document.createRange(); r.setStart(prev, 0); r.setEnd(prev, bare);
      const a = r.getBoundingClientRect(), b = span.getBoundingClientRect();
      const gap = document.documentElement.dir === 'rtl' ? a.left - b.right : b.left - a.right;
      if (gap < 2) out.push([el.textContent.replace(/\s+/g, ' ').trim(), Math.round(gap)]);
    }
    return out;
  });
  if (tight.length) problems.push(`${where}: a label and its count are touching, the space between them was dropped: ${JSON.stringify(tight)}`);
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
  await pg.fill('#hours-direct', '2000');
  await pg.dispatchEvent('#hours-direct', 'input');
  await pg.fill('#hours-partner', '1000');
  await pg.dispatchEvent('#hours-partner', 'input');
  await pg.waitForTimeout(50);
  const bigs = await pg.$$eval('#readout .readout', els => els.map(e => [...e.querySelectorAll('.big')].map(b => b.textContent)));
  // direct: 600 phones and 60 operators; partners: 300 phones and no operator cell; total: 900 phones, 60 operators
  if (bigs[0][0] !== '600' || bigs[0][1] !== '60') problems.push(`calculator: direct operations gave ${bigs[0].join(',')}`);
  if (bigs[1][0] !== '300' || bigs[1][1] !== '0' || bigs[1].length !== bigs[0].length) problems.push(`calculator: delivery partners gave ${bigs[1].join(',')}`);
  if (bigs[2][0] !== '900' || bigs[2][1] !== '60') problems.push(`calculator: total gave ${bigs[2].join(',')}`);
  const el = await pg.$('#calculator');
  await el.screenshot({ path: out('x-calculator-390.png') });
  await ctx.close();
}
// 5. training checklist persistence and role switch
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pg = await page(ctx, 'training/checklists/');
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
// 7. sites flowchart: a step opens its card, one at a time
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pg = await page(ctx, 'channels/');
  await pg.click('[data-step="review"]');
  await pg.waitForTimeout(50);
  if (!(await pg.$('#d-review'))) problems.push('sites flowchart: the review card did not open');
  await pg.click('[data-step="film"]');
  await pg.waitForTimeout(50);
  const cards = await pg.$$eval('.sdetail', els => els.length);
  if (cards !== 1) problems.push(`sites flowchart: ${cards} cards open, expected 1`);
  const ov = await pg.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  if (ov) problems.push('sites flowchart: horizontal overflow at 390');
  await pg.screenshot({ path: out('x-sites-390.png'), fullPage: true });
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
// 9. day page: a number on the line shows its moment, and its "See the steps" link opens that step in the flowchart below
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pg = await page(ctx, 'day/');
  await pg.click('.tl-hit[data-i="4"]');
  await pg.waitForTimeout(100);
  const shown = await pg.$eval('#tl-detail', e => !e.hidden && e.textContent.includes('6:00 PM'));
  if (!shown) problems.push('day page: the daily report moment did not show when its number was tapped');
  await pg.click('#tl-detail a[href="#review"]');
  // the scroll is smooth, so wait for it to settle
  for (let i = 0, last = -1; i < 20; i++) { await pg.waitForTimeout(100); const y = await pg.evaluate(() => window.scrollY); if (y === last && i > 2) break; last = y; }
  if (!(await pg.$('#d-review'))) problems.push('day page: the review step did not open from the moment card');
  const on = await pg.$$eval('.snode.on', els => els.map(e => e.dataset.step).join(','));
  if (on !== 'review') problems.push(`day page: open steps were "${on}", expected review`);
  const y = await pg.evaluate(() => window.scrollY);
  if (y < 500) problems.push('day page: the page did not scroll to the open step (scrollY ' + y + ')');
  await ctx.close();
}
// 10. print buttons, standalone site: a printable copy of the page is printed from a hidden frame, collapsibles open and typed values kept
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  // every frame gets a print() that behaves like a browser that allows printing
  await ctx.addInitScript(() => { window.print = () => { window.dispatchEvent(new Event('beforeprint')); window.top.__printed = (window.top.__printed || 0) + 1; window.dispatchEvent(new Event('afterprint')); }; });
  const pg = await page(ctx, 'forms/incident/');
  await pg.fill('#f-site', 'Site 12');
  await pg.click('[data-print]');
  await pg.waitForTimeout(400);
  const printed = await pg.evaluate(() => window.__printed || 0);
  if (printed !== 1) problems.push('print: the incident form did not print from a hidden frame (' + printed + ')');
  const copy = pg.frames().find(f => f !== pg.mainFrame());
  if (!copy) problems.push('print: no hidden print frame');
  else {
    const info = await copy.evaluate(() => ({ cls: document.body.className, val: document.querySelector('#f-site') && document.querySelector('#f-site').getAttribute('value'), buttons: document.querySelectorAll('.btn-row').length, main: !!document.querySelector('main.page') }));
    if (info.cls !== 'printing') problems.push('print: copy body class was "' + info.cls + '"');
    if (info.val !== 'Site 12') problems.push('print: typed value was not kept in the copy (' + info.val + ')');
    if (info.buttons) problems.push('print: the copy still shows buttons');
    if (!info.main) problems.push('print: the copy has no main');
  }
  // the pocket cards print alone, and the runner letter prints both languages
  await pg.goto(base + 'training/', { waitUntil: 'networkidle' });
  await pg.click('[data-print="#cards"]');
  await pg.waitForTimeout(400);
  const cards = pg.frames().find(f => f !== pg.mainFrame());
  const cardInfo = cards ? await cards.evaluate(() => ({ pockets: document.querySelectorAll('.pocket').length, roles: !!document.querySelector('#roles') })) : null;
  if (!cardInfo || cardInfo.pockets < 2 || cardInfo.roles) problems.push('print: the pocket cards copy was wrong ' + JSON.stringify(cardInfo));
  await pg.goto(base + 'manual/data-logistics/', { waitUntil: 'networkidle' });
  await pg.click('#letter-print');
  await pg.waitForTimeout(400);
  const letter = pg.frames().find(f => f !== pg.mainFrame());
  const letters = letter ? await letter.evaluate(() => [...document.querySelectorAll('.letter')].map(l => l.getAttribute('dir')).join(',')) : '';
  if (letters !== 'rtl,ltr') problems.push('print: the runner letter copy had letters "' + letters + '"');
  await ctx.close();
}
// 11. print buttons inside the claude.ai preview: printing is blocked there, so the copy goes to the outer page, which offers it to save
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  // the outer bundle page gets a stand-in for the viewer's downloads capability
  await ctx.addInitScript(() => { if (location.pathname.endsWith('company-map.html')) window.claude = { use: n => Promise.resolve(n === 'downloads' ? { save: async r => { window.__saved = r; return { status: 'saved' }; } } : null) }; });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => problems.push('bundle: ' + e));
  // a sandbox without allow-modals is what makes print() a silent no-op in the preview
  await pg.setContent('<iframe id="host" style="width:1200px;height:800px" sandbox="allow-scripts allow-same-origin" src="' + base + 'dist/company-map.html#/never/"></iframe>');
  const host = pg.frames().find(f => f.url().includes('company-map.html'));
  if (!host) { problems.push('bundle: outer frame not found'); }
  else {
    await host.waitForFunction(() => { const f = document.getElementById('f'); return f && f.contentDocument && f.contentDocument.querySelector('[data-print]'); }, null, { timeout: 15000 });
    const inner = pg.frames().find(f => f.parentFrame() === host);
    await inner.click('[data-print]');
    await host.waitForFunction(() => !!window.__saved, null, { timeout: 5000 }).catch(() => {});
    const saved = await host.evaluate(() => window.__saved ? { filename: window.__saved.filename, ok: /class="printing"/.test(window.__saved.data) && /never-grid/.test(window.__saved.data), bytes: window.__saved.data.length } : null);
    if (!saved) problems.push('bundle: the print button did not hand a copy to the outer page');
    else { if (!saved.ok) problems.push('bundle: the saved copy is not the printable page'); if (!/\.html$/.test(saved.filename)) problems.push('bundle: filename ' + saved.filename); }
    const toastText = await host.evaluate(() => document.getElementById('toast').textContent);
    if (!/saved/.test(toastText)) problems.push('bundle: no saved toast ("' + toastText + '")');
    await pg.screenshot({ path: out('x-print-bundle.png') });
  }
  await ctx.close();
}
// 12. job page: tabs switch and keep in the hash, offer letter fields fill the letter and persist, the posting prints alone
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => { window.print = () => { window.dispatchEvent(new Event('beforeprint')); window.top.__printed = (window.top.__printed || 0) + 1; window.dispatchEvent(new Event('afterprint')); }; });
  const pg = await page(ctx, 'jobs/operator/');
  if (!(await pg.$eval('#tab-handbook', e => !e.hidden))) problems.push('job: the handbook tab is not open by default');
  await pg.click('[data-tab="offer"]');
  if (!(await pg.$eval('#tab-offer', e => !e.hidden)) || (await pg.$eval('#tab-handbook', e => !e.hidden))) problems.push('job: the offer tab did not open');
  if (!/#offer$/.test(await pg.evaluate(() => location.hash))) problems.push('job: the hash did not follow the tab');
  await pg.fill('#of-name', 'Test Person');
  await pg.dispatchEvent('#of-name', 'input');
  if (!(await pg.$eval('#offer-out', e => e.textContent.includes('Test Person')))) problems.push('job: the letter did not fill from the field');
  await pg.reload({ waitUntil: 'networkidle' });
  if (!(await pg.$eval('#tab-offer', e => !e.hidden))) problems.push('job: the offer tab did not reopen from the hash');
  if (!(await pg.$eval('#offer-out', e => e.textContent.includes('Test Person')))) problems.push('job: the letter did not persist');
  await pg.click('[data-tab="posting"]');
  await pg.click('[data-print="#tab-posting"]');
  await pg.waitForTimeout(400);
  const copy = pg.frames().find(f => f !== pg.mainFrame());
  const info = copy ? await copy.evaluate(() => ({ posting: !!document.querySelector('#tab-posting'), handbook: !!document.querySelector('#tab-handbook'), title: document.title })) : null;
  if (!info || !info.posting || info.handbook) problems.push('job: the posting did not print alone ' + JSON.stringify(info));
  await pg.screenshot({ path: out('x-job-posting.png'), fullPage: true });
  await ctx.close();
}
// 13. reading progress: the line follows the scroll, a page counts as read at its end, and the counts persist
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pg = await page(ctx, 'rules/');
  const count = () => pg.$eval('.prog span', e => e.textContent);
  const bar = () => pg.$eval('.scrollbar > i', e => parseFloat(e.style.width) || 0);
  if (!/^0 of \d+ pages read$/.test(await count())) problems.push('progress: a fresh visitor did not start at zero (' + await count() + ')');
  if (await bar() !== 0) problems.push('progress: the line did not start empty (' + await bar() + ')');
  await pg.waitForTimeout(1800);
  if (!/^0 of/.test(await count())) problems.push('progress: a tall page counted as read without scrolling');
  await pg.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo(0, document.documentElement.scrollHeight); });
  await pg.waitForTimeout(300);
  if (await bar() < 99) problems.push('progress: the line did not fill at the end (' + await bar() + ')');
  if (!/^1 of/.test(await count())) problems.push('progress: reaching the end did not count the page (' + await count() + ')');
  if (!(await pg.$('.rail a[data-read]'))) problems.push('progress: the read page has no mark in the contents');
  // the numbers stay on the sections, the subsections have none, and the count follows to the next page
  const nums = await pg.$$eval('.rail .g .gn', els => els.map(e => e.textContent).join(','));
  if (nums !== '1,2,3,4,5,6,7,8,9') problems.push('progress: the sections are numbered "' + nums + '"');
  if (await pg.$('.rail .sg .gn')) problems.push('progress: a subsection was numbered');
  await pg.goto(base + 'call/', { waitUntil: 'networkidle' });
  await pg.waitForTimeout(1800);
  await pg.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo(0, document.documentElement.scrollHeight); });
  await pg.waitForTimeout(300);
  if (!/^2 of/.test(await count())) problems.push('progress: the second page did not count once read (' + await count() + ')');
  await pg.screenshot({ path: out('x-progress.png') });
  await ctx.close();
}
// 14. daily report form: the site list comes from the database, the form sends one JSON, the answer shows, and a wrong code is explained
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => problems.push(`report/: ${e}`));
  const A = '11111111-1111-1111-1111-111111111111', B = '22222222-2222-2222-2222-222222222222';
  let sent = null;
  const P1 = 'aaaaaaaa-1111-1111-1111-111111111111', P2 = 'aaaaaaaa-2222-2222-2222-222222222222', P3 = 'aaaaaaaa-3333-3333-3333-333333333333';
  const OPTS = { sites: [{ id: A, name: 'Test factory', team: 'direct', lead: 'Karim', lead_id: null, pm_id: P1 }, { id: B, name: 'Partner farm', team: 'partner', lead: 'Shady', lead_id: P3, pm_id: null }],
    people: [{ id: P1, name: 'Eyad', role: 'portfolio-manager', team: 'direct', site_id: null }, { id: P2, name: 'Hazem', role: 'portfolio-manager', team: 'direct', site_id: null }, { id: P3, name: 'Shady', role: 'partner', team: 'partner', site_id: B }],
    reporters: ['Eyad', 'Hazem', 'Shady'], deadline: '18:00', checkin_deadline: '09:00', phones_max: 270, phones: { [A]: { day: '2026-09-06', kind: 'morning', tags: ['12', '13'] } } };
  await pg.route('**/rest/v1/rpc/dr_form_options', r => r.fulfill({ json: OPTS }));
  await pg.route('**/rest/v1/rpc/dr_submit', r => { sent = r.request().postDataJSON(); r.fulfill({ json: { ok: true, site: 'Test factory', day: '2026-09-06', hours: 10.2, phones: 2, late: false, sent_at: '17:40', updated: false } }); });
  await pg.goto(base + 'report/', { waitUntil: 'networkidle' });
  const groups = await pg.$$eval('#f-site optgroup', els => els.map(e => e.label).join(','));
  if (groups !== 'Direct,Partner') problems.push('report: the site groups are "' + groups + '"');
  const names = await pg.$$eval('#f-reporter option', els => els.map(e => e.value).join(','));
  if (names !== `,${P1},${P2},${P3}`) problems.push('report: the reporter list is "' + names + '" (Portfolio Managers and partners only, nobody else)');
  // a partner tied to one site: picking the name picks the site
  await pg.selectOption('#f-reporter', P3);
  if ((await pg.inputValue('#f-site')) !== B) problems.push('report: picking Shady did not pick the partner farm');
  await pg.selectOption('#f-reporter', P1);
  await pg.selectOption('#f-site', A);
  if (await pg.$('#f-channel, #f-hours, #f-hours_uploaded, #f-phones_uploaded, #f-backlog, #f-wearers_scheduled, #f-flags, #f-phones_deployed')) problems.push('report: a removed field is still on the form');
  await pg.fill('#f-wearers_present', '78');
  // the ledger: the phones from the site's last check-out are already listed as a dropdown of 1 to 270; Enter on the last cell adds a row
  if ((await pg.$$eval('#phones tbody tr', r => r.length)) !== 2 || (await pg.inputValue('#phones tbody tr:nth-child(1) [data-ph=tag]')) !== '12' || (await pg.$$eval('#phones tbody tr:nth-child(1) [data-ph=tag] option', o => o.length)) !== 271) problems.push('report: the phones from the last check-out were not listed for the site');
  await pg.fill('#phones tbody tr:nth-child(1) [data-ph=recorded]', '210');
  await pg.fill('#phones tbody tr:nth-child(1) [data-ph=local]', '35');
  await pg.fill('#phones tbody tr:nth-child(2) [data-ph=recorded]', '190');
  await pg.fill('#phones tbody tr:nth-child(2) [data-ph=local]', '0');
  await pg.press('#phones tbody tr:nth-child(2) [data-ph=local]', 'Enter');
  // a phone picked twice is refused; the empty third row is dropped when sending
  await pg.selectOption('#phones tbody tr:nth-child(3) [data-ph=tag]', '12');
  await pg.waitForSelector('#toast.on');
  if ((await pg.inputValue('#phones tbody tr:nth-child(3) [data-ph=tag]')) !== '') problems.push('report: a phone could be listed twice');
  await pg.check('input[name="f-incident"][value="true"]');
  await pg.fill('#f-incident_text', 'Power cut 11:10 to 11:40.');
  if (await pg.$('#f-code')) problems.push('report: the evening check-out still asks for a team code');
  await pg.reload({ waitUntil: 'networkidle' });
  if ((await pg.$$eval('#phones tbody tr', r => r.length)) !== 2 || (await pg.inputValue('#phones tbody tr:nth-child(2) [data-ph=tag]')) !== '13') problems.push('report: the draft or the phone rows did not survive a reload');
  if (!(await pg.isChecked('input[name="f-incident"][value="true"]'))) problems.push('report: the incident choice did not survive a reload');
  await pg.screenshot({ path: out('x-report-390.png'), fullPage: true });
  await pg.click('#send');
  await pg.waitForSelector('#sent');
  if (!sent || !sent.p || sent.p.phones_deployed !== '2' || !Array.isArray(sent.p.phones) || sent.p.phones.length !== 2 || sent.p.phones[0].tag !== '12' || sent.p.phones[0].recorded !== '210' || sent.p.phones[0].local !== '35' || sent.p.wearers_present !== '78' || sent.p.site_id !== A || 'code' in sent.p || sent.p.reporter_id !== P1 || sent.p.reporter_other !== '' || sent.p.incident !== 'true' || sent.p.incident_text !== 'Power cut 11:10 to 11:40.') problems.push('report: the form sent ' + JSON.stringify(sent));
  const txt = await pg.$eval('#sent', e => e.textContent);
  if (!/Test factory/.test(txt) || !/2 phones/.test(txt) || !/10.2 hours/.test(txt) || !/5:40 PM/.test(txt) || /\blate\b|on time/i.test(txt)) problems.push('report: the confirmation reads "' + txt.trim().slice(0, 160) + '"');
  await pg.screenshot({ path: out('x-report-sent-390.png'), fullPage: true });
  // the name and site are remembered; the numbers are not
  await pg.click('#again');
  if ((await pg.inputValue('#f-reporter')) !== P1 || (await pg.inputValue('#f-site')) !== A) problems.push('report: the name or the site were not remembered');
  if ((await pg.$$eval('#phones tbody tr', r => r.length)) !== 2 || (await pg.inputValue('#phones tbody tr:nth-child(1) [data-ph=recorded]')) !== '') problems.push('report: the numbers stayed, or the phones were not offered again, after sending');
  await pg.selectOption('#f-reporter', P1);
  // a refusal from the database is explained in plain words and the button comes back
  await pg.unroute('**/rest/v1/rpc/dr_submit');
  await pg.route('**/rest/v1/rpc/dr_submit', r => r.fulfill({ status: 400, json: { message: 'unknown site' } }));
  await pg.fill('#phones tbody tr:nth-child(1) [data-ph=recorded]', '240');
  await pg.fill('#phones tbody tr:nth-child(2) [data-ph=recorded]', '200');
  await pg.click('#send');
  await pg.waitForSelector('#toast.on');
  const toastText = await pg.$eval('#toast', e => e.textContent);
  if (!/Pick the site/.test(toastText)) problems.push('report: the refusal reads "' + toastText + '"');
  if (await pg.$eval('#send', e => e.disabled)) problems.push('report: the send button stayed disabled after an error');
  await ctx.close();
}
// 15. the dashboard: the day, the four numbers, the map with one dot per business, the business table with a row that opens
//     on its phones, the month, the folds, the text copy, and the settings a founder keeps
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  const pg = await ctx.newPage();
  pg.on('pageerror', e => problems.push(`dashboard/: ${e}`));
  const site = (id, name, team, lead, report, checkin) => ({ id, name, team, lead, book: lead, active: true, report, checkin: checkin || null });
  const rep = { day: '2026-09-06', built_at: '2026-09-06 18:10', deadline: '18:00', checkin_deadline: '09:00', target_month: 25000, target_day: 833, month_hours: 4120, expected: 3, open_incidents: 2,
    morning: { checked_in: 2, late: 0, problems: 1, phones_deployed: 160, wearers_present: 158, wearers_scheduled: 165, phones_out: 1 },
    incidents: [{ id: 'i1', no: 1, site_id: 'a', site: 'Test factory', at: '11:10', kind: 'power', what: 'Power cut 11:10 to 11:40.', reporter: 'Karim', status: 'open', needs: null }],
    totals: { reported: 2, late: 1, hours: 940, hours_uploaded: 880, hours_held: 73, phones_new: 2, phones_deployed: 160, phones_uploaded: 150, backlog: 6, wearers_scheduled: 165, wearers_present: 158, phones_out: 3, flags: 2, incidents: 1 },
    teams: { direct: { expected: 2, reported: 2, checked_in: 2, hours: 940, hours_uploaded: 880, hours_held: 73, phones_deployed: 160, wearers_present: 158, phones_out: 3 }, partner: { expected: 1, reported: 0, checked_in: 0, hours: 0, hours_uploaded: 0, hours_held: 0, phones_deployed: 0, wearers_present: 0, phones_out: 0 } },
    sites: [
      site('a', 'Test factory', 'direct', 'Eyad', { reporter: 'Eyad', hours: 612, hours_uploaded: 580, hours_held: 45, phones_new: 0, hours_estimated: false, phones_deployed: 80, phones_uploaded: 76, backlog: 4, wearers_scheduled: 80, wearers_present: 78, phones_out: 2, flags: 2, incident: true, problems: 'Power cut 11:10 to 11:40.', gear_needed: '3 caps', other: null, late: false, sent_at: '17:40', first_at: '17:40' }, { reporter: 'Eyad', started_at: '08:05', phones_deployed: 80, wearers_scheduled: 80, wearers_present: 78, phones_out: 1, ok: false, note: 'One charger dead.', late: false, first_at: '08:20' }),
      site('b', 'Test warehouse', 'direct', 'Hazem', { reporter: 'Hazem', hours: 328, hours_uploaded: 300, hours_held: 28, phones_new: 2, hours_estimated: true, phones_deployed: 80, phones_uploaded: 74, backlog: 2, wearers_scheduled: 85, wearers_present: 80, phones_out: 1, flags: 0, incident: false, problems: null, gear_needed: null, other: 'One wearer out tomorrow.', late: true, sent_at: '18:25', first_at: '18:25' }, { reporter: 'Hazem', started_at: '08:00', phones_deployed: 80, wearers_scheduled: 85, wearers_present: 80, phones_out: 0, ok: true, note: null, late: false, first_at: '08:30' }),
      site('c', 'Partner farm', 'partner', 'Shady', null)
    ],
    month: { hours: 4120, base: 0, target: 25000, days_in: 30, days_gone: 6, per_day_needed: 870, per_day: 900, projected: 20600 },
    days: Array.from({ length: 30 }, (_, i) => { const dd = new Date('2026-08-08T12:00:00'); dd.setDate(dd.getDate() + i); const day = dd.toISOString().slice(0, 10); const has = i >= 24 && i !== 27;
      const hours = !has ? 0 : i === 29 ? 940 : i === 28 ? 900 : 700 + i * 8; const phones = !has ? 0 : i === 29 ? 160 : 150; const present = !has ? 0 : i === 29 ? 158 : 160;
      return { day, has, checked_in: has ? (i === 29 ? 2 : 3) : 0, reported: has ? (i === 29 ? 2 : 3) : 0, expected: 3, hours, hours_uploaded: has ? hours - 60 : 0, hours_held: has ? 60 : 0, phones_deployed: phones, wearers_present: present, phones_out: has ? 1 : 0, flags: i === 29 ? 2 : 0, incidents: i === 29 ? 1 : 0, problems: i === 29 ? 1 : 0, phones_morning: phones, wearers_morning: present }; }) };
  const mapSite = (id, name, extra) => ({ id, name, team: 'direct', status: 'active', city: null, area: null, lat: null, lng: null, phones: 0, green: 0, yellow: 0, red: 0, none: 0, hours_day: null, said: null, last_in: null, last_out: null, ...extra });
  const mapPhone = (tag, site_id, hours_day, extra) => ({ tag, site_id, hours_day, days: hours_day == null ? 0 : 5, today: hours_day, last_day: '2026-09-06', last_kind: hours_day == null ? 'morning' : 'evening', total: 4120, local: 35, status: hours_day == null ? 'none' : hours_day >= 5 ? 'green' : hours_day >= 3 ? 'yellow' : 'red', ...extra });
  const mapBody = { day: '2026-09-06', window: 7,
    sites: [mapSite('a', 'Test factory', { city: 'Cairo', phones: 4, green: 2, yellow: 1, red: 1, hours_day: 3.9, said: 80, last_in: '2026-09-06', last_out: '2026-09-06' }),
      mapSite('b', 'Test warehouse', { name: 'Test warehouse, Tanta', phones: 3, none: 3, said: 4, last_in: '2026-09-06' }),
      mapSite('c', 'Partner farm', { team: 'partner' })],
    phones: [mapPhone('12', 'a', 5.4), mapPhone('13', 'a', 5.0), mapPhone('14', 'a', 3.2), mapPhone('15', 'a', 1.9),
      mapPhone('7', 'b', null), mapPhone('9', 'b', null, { local: 5000 }), mapPhone('99', 'b', null, { total: null, local: null })] };
  rep.sites[0].week = [0, 0, 600, 610, 0, 600, 612]; rep.sites[0].phones_week = [0, 0, 80, 80, 0, 80, 80];
  rep.sites[1].week = [0, 0, 300, 320, 0, 300, 328]; rep.sites[1].phones_week = [0, 0, 70, 70, 0, 70, 80];
  rep.sites[2].week = [0, 0, 0, 0, 0, 0, 0]; rep.sites[2].phones_week = [0, 0, 0, 0, 0, 0, 0];
  const calls = [];
  await pg.route('**/rest/v1/rpc/dr_report', r => { const b = r.request().postDataJSON(); calls.push(b); r.fulfill({ json: rep }); });
  await pg.route('**/rest/v1/rpc/dr_map', r => { const b = r.request().postDataJSON(); calls.push(b); r.fulfill({ json: { ...mapBody, window: b.p_days } }); });
  await pg.route('**/rest/v1/rpc/dr_admin', r => { const b = r.request().postDataJSON(); calls.push(b);
    if (b.p_action === 'sites') return r.fulfill({ json: rep.sites.map(s => ({ id: s.id, name: s.name, team: s.team, lead: s.lead, active: s.active, status: s.active ? 'active' : 'paused', sort: 0 })) });
    if (b.p_action === 'settings') return r.fulfill({ json: { team_code: 'kmsc', deadline: '18:00', checkin_deadline: '09:00', targets: '{"2026-09":25000}', month_base: '{"2026-09":19500}', slack_webhook: '' } });
    if (b.p_action === 'log') return r.fulfill({ json: [{ at: '2026-09-06 17:40', kind: 'report', what: 'Daily report, Test factory, 06 Sep: 612 hours, incident', who: 'Eyad', site: 'Test factory' }] });
    r.fulfill({ json: { ok: true } }); });
  await pg.goto(base + 'dashboard/#2026-09-06', { waitUntil: 'networkidle' });
  await pg.waitForSelector('#rep');
  await pg.waitForSelector('#map svg');
  if (await pg.$('#gate')) problems.push('company report: the page asked for a code');
  if (calls.some(c => c.p_code)) problems.push('company report: a code was sent with the call');
  if (!calls.some(c => c.p_day === '2026-09-06' && c.p_days === 7)) problems.push('company report: the map was not asked for that day: ' + JSON.stringify(calls));
  // the five: hours recorded, hours pending upload, phones active, per phone, opt-in; each with its own sparkline
  const big = await pg.$$eval('.kpi .big', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  if (big.join('|') !== '940|73|160|5.9|101%') problems.push('company report: the five read ' + JSON.stringify(big));
  // a tile with nothing to add says nothing: only the three with context carry a line, and only the hours carry a comparison
  const ctxLines = await pg.$$eval('.kpi .ctx', els => els.map(e => e.textContent.trim()));
  if (ctxLines.join('|') !== '7 day average 900, month 900|on 6 phones|160 this morning, 3 down|5.2 needed for the target|160 phones for 158 present') problems.push('company report: the tile context lines read ' + JSON.stringify(ctxLines));
  if ((await pg.$$eval('.kpi svg.ch-spark', els => els.length)) !== 5) problems.push('company report: the tiles have no sparklines');
  const sparkW = await pg.$eval('.kpi svg.ch-spark', e => e.getAttribute('viewBox').split(' ')[2]);
  if (Number(sparkW) < 90 || Number(sparkW) > 200) problems.push('company report: the sparkline is not drawn at the tile width (' + sparkW + ')');
  const headline = await pg.$eval('.headline', e => e.textContent.trim());
  if (headline !== '940 hours from 160 phones at 2 of 3 sites. Partner farm did not report and counts as zero.') problems.push('company report: the headline reads "' + headline + '"');
  // the morning and the evening are folded away now: every number is still there, under the fold
  const folds = await pg.$$eval('#rep details.more', els => els.map(e => ({ open: e.open, title: e.querySelector('summary').textContent.trim() })));
  if (folds.length !== 3 || folds.some(f => f.open)) problems.push('company report: the folds read ' + JSON.stringify(folds));
  const boxes = await pg.$$eval('#rep details.more .stat .big', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  if (boxes.join('|') !== '2 / 3|160|1|158|101%|1|2 / 3|940|73|6|2|1') problems.push('company report: the morning and evening boxes read ' + JSON.stringify(boxes));
  /* Five numbers lead the page and the morning and the evening stand on six each, so at every width each row has to
     split into full rows with no empty track left at the end. Measured with the folds open, not assumed: a closed
     fold measures nothing and would pass whatever the rule said. The tiles sharing a line must fill that line. */
  await pg.$$eval('#rep details.more', els => els.forEach(e => { e.open = true; }));
  for (const w of [1280, 900, 820, 560, 390]) {
    await pg.setViewportSize({ width: w, height: 900 });
    await pg.waitForFunction(() => { const g = document.querySelector('#rep .stat'); return g && g.clientWidth > 0; });
    await pg.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    const grids = await pg.evaluate(() => [...document.querySelectorAll('#rep .stat, #rep .hero')].map((grid, gi) => {
      const cs = getComputedStyle(grid), gap = parseFloat(cs.columnGap) || 0;
      const inner = grid.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
      const box = { width: inner }, rows = new Map();
      for (const d of grid.children) { const b = d.getBoundingClientRect(), k = Math.round(b.top); const p = rows.get(k) || { wide: 0, n: 0 }; rows.set(k, { wide: p.wide + b.width, n: p.n + 1 }); }
      for (const [, v] of rows) v.wide += gap * (v.n - 1);
      return { gi, tiles: grid.children.length, width: Math.round(box.width),
        cols: getComputedStyle(grid).gridTemplateColumns,
        each: [...grid.children].map(d => Math.round(d.getBoundingClientRect().width) + ':' + getComputedStyle(d).gridColumn).join(' '),
        ragged: [...rows.entries()].filter(([, v]) => Math.abs(v.wide - box.width) > 2).map(([top, v]) => `row at ${top} fills ${Math.round(v.wide)} of ${Math.round(box.width)}`) };
    }));
    if (!grids.length || grids.some(g => !g.width)) problems.push(`company report: the boxes could not be measured at ${w}px`);
    for (const g of grids) if (g.ragged.length) problems.push(`company report: the ${g.tiles} boxes leave a gap at ${w}px: ${g.ragged.join(', ')} [tracks ${g.cols}] [boxes ${g.each}]`);
  }
  await pg.setViewportSize({ width: 1280, height: 900 });
  await pg.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  await pg.$$eval('#rep details.more', els => els.forEach(e => { e.open = false; }));
  if ((await pg.$$eval('.trend-grid:not(.bysite) .trend svg.ch', els => els.length)) !== 6) problems.push('company report: the six trend charts are not drawn');
  if ((await pg.$$eval('.trend-grid.bysite .trend svg.ch', els => els.length)) !== 4) problems.push('company report: the four by-site charts are not drawn');
  if ((await pg.$$eval('#rep p', els => els.filter(e => !e.closest('.trend') && e.textContent.trim().length > 140).length)) !== 0) problems.push('company report: a long paragraph is back on the page');
  // a business wears its own marks: an incident, a problem in the morning, a day with nothing sent
  const marks = await pg.$eval('tr.site-row[data-id="a"]', e => e.textContent.replace(/\s+/g, ' ').trim());
  if (!/incident/.test(marks)) problems.push('company report: the site with an incident has no mark: ' + marks);
  /* Sites send when their day allows, so nothing on this page calls a check-in or a check-out late. Test warehouse
     is sent as late in the data above and must still wear no mark for it, and no count of late forms is on the page. */
  const lateWords = await pg.$$eval('#rep .pill, #rep .stat .lbl, #rep .kpi .lbl',
    els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()).filter(t => /\blate\b/i.test(t)));
  if (lateWords.length) problems.push('company report: a form is still called late: ' + JSON.stringify(lateWords));
  if (/\blate\b/i.test(await pg.$eval('#rep', e => e.textContent))) problems.push('company report: the word late is still on the page');
  if (!(await pg.$eval('tr.site-row[data-id="c"]', e => /not in/.test(e.textContent)))) problems.push('company report: the site that did not report has no mark');
  if ((await pg.$$eval('tr.site-row td.when-col .pill', els => els.filter(e => e.textContent === 'problem').length)) !== 1) problems.push('company report: the site with a morning problem has no mark');
  // the month: the ring and thirty bars, every day a link
  if (!(await pg.$('.ring-host svg.ch-ring'))) problems.push('company report: no month ring');
  const monthLine = await pg.$eval('.month-line', e => e.textContent.replace(/\s+/g, ' ').trim());
  if (monthLine !== 'Day 6 of 30. 870 hours a day still needed. On pace for 20,600, short of 25,000.') problems.push('company report: the month line reads ' + JSON.stringify(monthLine));
  if ((await pg.$$eval('[data-chart="t:hours"] a[data-day]', els => els.length)) !== 30) problems.push('company report: the hours-per-day bars are not thirty day links');
  if ((await pg.$$eval('[data-chart="t:hours"] .ch-cell.none', els => els.length)) !== 0 || (await pg.$$eval('[data-chart="t:hours"] .ch-cell.some', els => els.length)) !== 1) problems.push('company report: the sites-in cells are wrong');
  // by site: two charts with the same rows, uploaded solid and recorded outlined, present against filming
  if ((await pg.$$eval('[data-chart=siteBars] .ch-bar', els => els.length)) !== 2 || (await pg.$$eval('[data-chart=siteBars] .ch-bar.outline', els => els.length)) !== 0) problems.push('company report: the hours by site are not one bar each');
  const hollow = await pg.$$eval('[data-chart=siteDots] .ch-dot.hollow', els => els.length);
  if (hollow !== 2) problems.push('company report: the employees present dots read ' + hollow);
  const bySite = await pg.$eval('.bysite', e => e.textContent.replace(/\s+/g, ' '));
  if (!/Test factory/.test(bySite) || !/612/.test(bySite) || !/7\.7/.test(bySite) || !/103%/.test(bySite) || !/2 phones over people/.test(bySite) || !/not in/.test(bySite)) problems.push('company report: the by-site charts read ' + JSON.stringify(bySite.slice(0, 300)));
  if ((await pg.$$eval('tr.site-row .chart svg.ch-strip', els => els.length)) !== 3) problems.push('company report: the business rows have no week strips');
  // the map: one dot for every business it can place, with its phone count on it, and none for the one it cannot
  const dots = await pg.evaluate(() => ['.site-dot', '.site-dot.g', '.site-dot.y', '.site-dot.r', '.site-dot.n', '.dot', '.site'].map(c => document.querySelectorAll('.egypt ' + c).length).join(','));
  if (dots !== '2,0,1,0,1,0,2') problems.push('company report: the map holds ' + dots + ' (site dots, green, yellow, red, grey, phone dots, sites)');
  if (await pg.$('.egypt .site[data-site="c"]')) problems.push('company report: a business with no place was drawn on the map');
  if ((await pg.$$eval('.egypt .site-n', els => els.map(e => e.textContent).join(','))) !== '4,3') problems.push('company report: the dots do not carry their phone count');
  // the businesses, one row each, then the day added up in the foot of the table
  const rows = await pg.$$eval('tr.site-row[data-id]', els => els.map(e => e.dataset.id));
  if (rows.join(',') !== 'a,b,c') problems.push('company report: the business rows read ' + rows.join(','));
  const row = await pg.$$eval('tr.site-row[data-id="a"] td', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  if (row.length !== 10) problems.push('company report: the business row has ' + row.length + ' cells');
  for (const need of ['Test factory', '8:05 AM', 'problem', 'incident', '612', '80', '78', '7.7']) if (!row.join(' ').includes(need)) problems.push(`company report: the business row "${row.join(' | ')}" has no ${need}`);
  if (!row.join(' ').includes('4 phones on the map')) problems.push('company report: the row does not say how many of its phones the map has: ' + row.join(' | '));
  const foot = await pg.$$eval('#sites tfoot tr', els => els.map(tr => [...tr.children].map(c => c.textContent.replace(/\s+/g, ' ').trim()).join('|')));
  if (foot.length !== 3 || foot[0] !== 'Direct|2 / 2|2 / 2|940|73|160|3|158|101%|5.9' || foot[1] !== 'Partner|0 / 1|0 / 1|0|0|0|0|0||' || foot[2] !== 'The day|2 / 3|2 / 3|940|73|160|3|158|101%|5.9') problems.push('company report: the foot of the table reads ' + JSON.stringify(foot));
  // every number in the foot is the sum of the column above it: read the rows off the page and add them up here
  const sums = await pg.evaluate(() => {
    const num = t => { const m = String(t).replace(/,/g, '').match(/-?\d+(\.\d+)?/); return m ? Number(m[0]) : 0; };
    const col = i => [...document.querySelectorAll('#sites tbody tr.site-row')].map(tr => num(tr.children[i].firstChild ? tr.children[i].textContent.split('\n')[0] : ''));
    const cellNum = (tr, i) => num(tr.children[i].childNodes[0] ? tr.children[i].childNodes[0].textContent : '');
    const rows = [...document.querySelectorAll('#sites tbody tr.site-row')];
    const add = i => rows.reduce((a, tr) => a + cellNum(tr, i), 0);
    const foot = [...document.querySelectorAll('#sites tfoot tr')];
    const day = foot[foot.length - 1], subs = foot.slice(0, -1);
    const footNum = (tr, i) => num(tr.children[i].childNodes[0] ? tr.children[i].childNodes[0].textContent : '');
    return { col: col(3).length, rows: [3, 4, 5, 6, 7].map(i => add(i)), day: [3, 4, 5, 6, 7].map(i => footNum(day, i)),
      subs: [3, 4, 5, 6, 7].map(i => subs.reduce((a, tr) => a + footNum(tr, i), 0)),
      counts: [1, 2].map(i => [rows.filter(tr => !/not in/.test(tr.children[i].textContent)).length, footNum(day, i)]) };
  });
  if (sums.rows.join(',') !== sums.day.join(',')) problems.push('company report: the foot does not add the rows up: rows ' + sums.rows.join(',') + ' foot ' + sums.day.join(','));
  if (sums.subs.join(',') !== sums.day.join(',')) problems.push('company report: the channel rows do not add up to the day: ' + sums.subs.join(',') + ' against ' + sums.day.join(','));
  if (sums.counts.some(([a, b]) => a !== b)) problems.push('company report: the sites in and started counts do not match the rows: ' + JSON.stringify(sums.counts));
  // and the page agrees with what the database sent
  if (sums.day.join(',') !== [rep.totals.hours, rep.totals.hours_held, rep.totals.phones_deployed, rep.totals.phones_out, rep.totals.wearers_present].join(',')) problems.push('company report: the foot does not match the totals the database sent: ' + sums.day.join(','));
  // opening a business fans its dot out into its phones and lists them under the row, with every reading in the total
  await pg.click('tr.site-row[data-id="b"]');
  await pg.waitForSelector('tr.det[data-for="b"] .phones');
  if ((await pg.$$('.egypt .dot')).length !== 3) problems.push('company report: the open business did not fan out into its phones');
  if ((await pg.$$('tr.det[data-for="b"] .phones tbody tr')).length !== 3) problems.push('company report: the open business does not list its phones');
  const cells = await pg.$$eval('tr.det[data-for="b"] .phones tfoot td', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  if (cells.length !== 5 || !/^5,035/.test(cells[4] || '')) problems.push('company report: the phone total row reads ' + JSON.stringify(cells));
  if (/left out/.test(cells[5] || '') || (await pg.$('tr.det[data-for="b"] .phones tbody td.warn'))) problems.push('company report: a phone holding more than it has sent is still marked wrong');
  // and each of the two minute columns says what it holds, so nobody has to guess
  const hints = await pg.$$eval('tr.det[data-for="b"] .phones thead .th-hint', els => els.map(e => e.textContent.trim()));
  if (hints.join('|') !== 'still on the phone tonight') problems.push('company report: the minute column has no hint: ' + JSON.stringify(hints));
  if (!(await pg.$eval('tr.det[data-for="b"]', e => /The check-in counted 4 phones and the list names 3/.test(e.textContent)))) problems.push('company report: the open row does not say the check-in counted something else');
  // a day whose hours came from the phone readings rather than the site's count wears the word, and the open row says what to do
  if (!(await pg.$('tr.site-row[data-id="b"] .pill.est'))) problems.push('company report: the estimated day has no mark');
  if (await pg.$('tr.site-row[data-id="a"] .pill.est')) problems.push('company report: a counted day is marked estimated');
  if (!(await pg.$eval('tr.det[data-for="b"]', e => /estimated from the phone readings/.test(e.textContent) && /Reload the check-out page/.test(e.textContent)))) problems.push('company report: the estimated day does not say what to do');
  if (!(await pg.$eval('tr.site-row[data-id="b"]', e => e.getAttribute('aria-expanded') === 'true'))) problems.push('company report: the open row is not marked open');
  await pg.click('tr.site-row[data-id="b"]');
  if ((await pg.$$('.egypt .dot')).length !== 0) problems.push('company report: closing the business left its phones on the map');
  if (!(await pg.$eval('tr.det[data-for="b"]', e => e.hidden))) problems.push('company report: closing the business left its row open');

  if ((await pg.$$eval('#rep table.t.rep', els => els.length)) !== 2) problems.push('company report: expected the business table and the incident table');
  if (!(await pg.$('#rep .pill.st-open'))) problems.push('company report: the filed incident is not listed');
  // what the sites wrote: one heading and one list, each line saying which box on the check-out it came from
  const notes = await pg.$$eval('#rep .notes dt', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  if (notes.join('|') !== 'Test factory incident|Test factory needs|Test warehouse anything else') problems.push('company report: the notes read ' + JSON.stringify(notes));
  if ((await pg.$$eval('#rep h3', els => els.map(e => e.textContent.trim()))).join('|') !== 'The businesses|The month|Incidents|What the sites wrote|The morning and the evening, number by number|The last 30 days|Site against site|Codes, deadlines, targets, posts, and the activity log') problems.push('company report: the headings read ' + JSON.stringify(await pg.$$eval('#rep h3', els => els.map(e => e.textContent.trim()))));
  // every fold on the page is the site's own fold: a heading, and the word that opens it on the far side
  const folds2 = await pg.$$eval('#rep details > summary', els => els.map(e => [e.querySelector('h3') ? 'h3' : 'bare', e.dataset.open || '', e.dataset.close || ''].join(':')));
  if (folds2.length !== 4 || folds2.some(f => f !== 'h3:Open:Close')) problems.push('company report: the folds are not the page folds: ' + JSON.stringify(folds2));
  await pg.screenshot({ path: out('x-company-report.png'), fullPage: true });
  // the same page on a phone: the tiles go two across, the table scrolls sideways, nothing runs off the side
  await pg.setViewportSize({ width: 390, height: 844 });
  await pg.waitForFunction(() => document.querySelector('.egypt') && document.querySelector('.egypt').clientWidth < 380);
  const wide = await pg.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  if (wide) problems.push('company report: the page runs off the side of a phone');
  await pg.screenshot({ path: out('x-company-report-390.png'), fullPage: true });
  await pg.setViewportSize({ width: 1280, height: 900 });
  // and the same page read right to left: the table, the foot and the map all turn round, and nothing runs off the side
  await pg.click('#lang');
  await pg.waitForFunction(() => document.documentElement.dir === 'rtl');
  await pg.waitForSelector('#sites');
  if (await pg.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) problems.push('company report: the Arabic page runs off the side');
  const arHead = await pg.$$eval('#sites thead th', els => els.map(e => e.textContent.trim()));
  if (arHead.some(h => /[A-Za-z]/.test(h))) problems.push('company report: an Arabic table heading is still in English: ' + JSON.stringify(arHead));
  if ((await pg.$$eval('.egypt .town text', els => els.map(e => e.textContent).join(''))).match(/[A-Za-z]/)) problems.push('company report: the map towns are still in English when the page is Arabic');
  // a count written as "2 / 3" must still read 2 then 3 when the page runs right to left
  const fr = await pg.$$eval('#sites tfoot .frac', els => els.map(e => {
    const r = document.createRange(); r.selectNodeContents(e.firstChild);
    return [e.textContent.replace(/\s+/g, ' ').trim(), Math.round(r.getBoundingClientRect().left - e.getBoundingClientRect().left)];
  }));
  if (!fr.length || fr.some(([, left]) => left > 4)) problems.push('company report: a count reads backwards right to left: ' + JSON.stringify(fr));
  const arFolds = await pg.$$eval('#rep details > summary', els => els.map(e => e.dataset.open));
  if (arFolds.some(f => /[A-Za-z]/.test(f || 'x'))) problems.push('company report: a fold still says Open in English: ' + JSON.stringify(arFolds));
  await pg.screenshot({ path: out('x-company-report-ar.png'), fullPage: true });
  await pg.click('#lang');
  await pg.waitForFunction(() => document.documentElement.dir === 'ltr');
  await pg.waitForSelector('#sites');
  // the code is kept, so a reload opens straight away; the day before goes into the hash
  await pg.reload({ waitUntil: 'networkidle' });
  await pg.waitForSelector('#rep');
  const y = '2026-09-05';
  await pg.click('#prev');
  await pg.waitForFunction(v => document.querySelector('#day') && document.querySelector('#day').value === v, y);
  if (calls[calls.length - 1].p_day !== y) problems.push('company report: the day before asked for ' + calls[calls.length - 1].p_day);
  if ((await pg.evaluate(() => location.hash)) !== '#' + y) problems.push('company report: the hash did not follow the day');
  // the text copy for the management group
  await pg.click('#copy');
  const text = await pg.evaluate(() => navigator.clipboard.readText());
  if (!/^Company report, /.test(text) || !/^940 hours from 160 phones at 2 of 3 sites\. Partner farm did not report and counts as zero\.$/m.test(text) || !/^Phones active 160 \(160 this morning\)\. Hours 940 of 833 target \(113%\)\. Per phone 5\.9\. Opt-in 101%, 158 present, 160 filming\. Sites in 2 of 3\.$/m.test(text) || !/^This month: 4,120 of 25,000, day 6 of 30, need 870 a day, on pace for 20,600\.$/m.test(text) || !/^Partner farm: not in$/m.test(text) || !/^Test factory, Eyad, check-in 8:05 AM, report 5:40 PM: 612 hours recorded, 45 pending, 80 phones, 2 down, 2 flags, incident$/m.test(text) || /Needs attention/.test(text) || !/Incidents:\n1\. Test factory, Power or internet down, open: Power cut/.test(text) || !/Incident lines on the evening check-outs:\nTest factory: Power cut/.test(text)) problems.push('company report: the text copy reads "' + text.slice(0, 400).replace(/\n/g, ' | ') + '"');
  // the settings open: the two deadlines, the codes, the Slack webhook, the activity log
  await pg.click('#admin summary');
  await pg.waitForSelector('#settings-form');
  if ((await pg.inputValue('#s-morning')) !== '09:00' || (await pg.inputValue('#s-deadline')) !== '18:00') problems.push('company report: the deadlines did not load');
  if (!(await pg.$eval('.t.log', e => /Daily report, Test factory/.test(e.textContent)))) problems.push('company report: the activity log did not load');
  await pg.fill('#s-morning', '09:30');
  await pg.click('#settings-form button[type=submit]');
  await pg.waitForSelector('#toast.on');
  const savedMo = calls.find(c => c.p_action === 'setting' && c.p.key === 'checkin_deadline');
  if (!savedMo || savedMo.p.value !== '09:30') problems.push('company report: saving the check-in deadline sent ' + JSON.stringify(savedMo));
  await pg.waitForFunction(() => { const b = document.querySelector('#s-test'); return !!b && b.disabled; }, null, { timeout: 10000 }).catch(() => problems.push('company report: the test post button is live with no webhook'));
  await pg.screenshot({ path: out('x-company-report-admin.png'), fullPage: true });
  await ctx.close();
}
// 16. site registry: the code opens it, the filters and counts read the list, a row opens its form, a save sends the fields, a new site is added
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => problems.push(`sites/: ${e}`));
  const calls = [];
  const list = [
    { id: 'a', name: 'Test factory', team: 'direct', lead: 'Karim', status: 'active', area: 'central', city: 'Cairo', industry: 'Food', book: 'Eyad', phones_capacity: 80, sort: 1, active: true },
    { id: 'b', name: 'Partner farm', team: 'partner', lead: 'Shady', status: 'active', area: null, city: 'Tanta', industry: 'Farm', book: 'Shady', phones_capacity: 40, sort: 2, active: true },
    { id: 'c', name: 'New warehouse', team: 'direct', lead: null, status: 'agreed', area: 'east', city: 'Cairo', industry: 'Logistics', book: 'Hazem', phones_capacity: 60, sort: 3, active: false, contact_name: 'Omar', contact_phone: '0100', notes: 'Launch next week.' },
    { id: 'd', name: 'Old shop', team: 'direct', lead: null, status: 'closed', area: 'central', city: 'Cairo', industry: 'Retail', book: null, phones_capacity: 4, sort: 4, active: false }
  ];
  await pg.route('**/rest/v1/rpc/dr_admin', r => { const b = r.request().postDataJSON(); calls.push(b);
    if (b.p_action === 'sites') return r.fulfill({ json: list });
    if (b.p_action === 'people') return r.fulfill({ json: [{ id: 'p1', name: 'Eyad', role: 'portfolio-manager', team: 'direct', site_id: null, active: true }, { id: 'p2', name: 'Karim', role: 'site-lead', team: 'direct', site_id: 'a', active: true }, { id: 'p3', name: 'Old Sam', role: 'site-lead', team: 'direct', site_id: null, active: false }] });
    if (b.p_action === 'site_history') return r.fulfill({ json: { month_hours: 3120, days_reported: 5, reports: [{ day: '2026-09-06', reporter: 'Karim', hours: 612, hours_uploaded: 580, phones_deployed: 80, phones_uploaded: 76, backlog: 4, wearers_present: 78, wearers_scheduled: 80, phones_out: 2, flags: 1, incident: true, late: false, first_at: '17:40' }], checkins: [{ day: '2026-09-06', reporter: 'Karim', started_at: '08:05', phones_deployed: 80, wearers_present: 78, ok: true, note: null, late: false }], incidents: [{ no: 1, day: '2026-09-06', kind: 'power', what: 'Power cut.', status: 'open', reporter: 'Karim' }], people: [{ id: 'p2', name: 'Karim', role: 'site-lead', phone: null, active: true }] } });
    r.fulfill({ json: { ok: true } }); });
  await pg.goto(base + 'sites/', { waitUntil: 'networkidle' });
  await pg.waitForSelector('#reg');
  if (await pg.$('#gate')) problems.push('sites: the page asked for a code');
  const big = await pg.$$eval('.stat .big', els => els.map(e => e.textContent.trim()));
  if (big.join(',') !== '2,1,0,1') problems.push('sites: the counts read ' + big.join(','));
  if ((await pg.$$('#reg tbody tr[data-id]')).length !== 3) problems.push('sites: the open filter did not hide the closed site');
  // the channel column reads Direct or Partner; a partner site shows no site lead
  const chan = await pg.$$eval('#reg tbody tr[data-id] td:nth-child(3)', els => els.map(e => e.textContent.trim()).join(','));
  if (chan !== 'Direct,Partner,Direct') problems.push('sites: the channel column reads ' + chan);
  if ((await pg.$eval('#reg tr[data-id="b"] td:nth-child(7)', e => e.textContent.trim())) !== '') problems.push('sites: a partner site shows a site lead');
  await pg.click('[data-filter="all"]');
  if ((await pg.$$('#reg tbody tr[data-id]')).length !== 4) problems.push('sites: the all filter did not show every site');
  await pg.click('#reg tr[data-id="c"]');
  await pg.waitForSelector('#site-form');
  if ((await pg.inputValue('#e-name')) !== 'New warehouse' || (await pg.inputValue('#e-status')) !== 'agreed' || (await pg.inputValue('#e-contact_name')) !== 'Omar') problems.push('sites: the form did not fill from the row');
  // the people come from the directory, active ones only; the history loads under the form
  const leads = await pg.$$eval('#e-lead_id option', els => els.map(e => e.textContent).join(','));
  if (leads !== 'Pick,Eyad,Karim') problems.push('sites: the site lead list is "' + leads + '"');
  await pg.waitForSelector('#site-history .stat');
  const hist = await pg.$$eval('#site-history .stat .big', els => els.map(e => e.textContent.trim()).join(','));
  if (hist !== '3,120,5,1,1') problems.push('sites: the history reads ' + hist);
  if (!(await pg.$eval('#site-history', e => /Power cut\./.test(e.textContent)))) problems.push('sites: the history has no incident');
  await pg.selectOption('#e-lead_id', 'p2');
  await pg.selectOption('#e-pm_id', 'p1');
  await pg.selectOption('#e-status', 'ready');
  await pg.fill('#e-last_touch', '2026-09-06');
  await pg.click('#site-form button[type=submit]');
  await pg.waitForSelector('#toast.on');
  const set = calls.find(c => c.p_action === 'site_set');
  if (!set || set.p.id !== 'c' || set.p.status !== 'ready' || set.p.last_touch !== '2026-09-06' || set.p.name !== 'New warehouse' || set.p.lead_id !== 'p2' || set.p.pm_id !== 'p1') problems.push('sites: saving sent ' + JSON.stringify(set));
  await pg.click('#add');
  await pg.waitForSelector('#site-form');
  // a partner site: the site lead field goes away and nothing is sent for it; a Portfolio Manager is always required
  await pg.selectOption('#e-team', 'partner');
  if (!(await pg.$eval('#lead-wrap', e => e.hidden))) problems.push('sites: the site lead field stayed for a partner site');
  await pg.selectOption('#e-team', 'direct');
  if (await pg.$eval('#lead-wrap', e => e.hidden)) problems.push('sites: the site lead field did not come back for a Direct site');
  await pg.selectOption('#e-team', 'partner');
  await pg.fill('#e-name', 'Bakery, Nasr City');
  await pg.selectOption('#e-status', 'contacted');
  await pg.click('#site-form button[type=submit]');
  if (calls.some(c => c.p_action === 'site_add')) problems.push('sites: a site saved without a Portfolio Manager');
  await pg.selectOption('#e-pm_id', 'p1');
  await pg.fill('#e-city', 'Cairo');
  await pg.fill('#e-phones_capacity', '12');
  await pg.click('#site-form button[type=submit]');
  await pg.waitForSelector('#toast.on');
  const add = calls.find(c => c.p_action === 'site_add');
  if (!add || add.p.name !== 'Bakery, Nasr City' || add.p.status !== 'contacted' || add.p.phones_capacity !== '12' || add.p.team !== 'partner' || add.p.pm_id !== 'p1' || add.p.lead_id !== '' || 'id' in add.p) problems.push('sites: adding sent ' + JSON.stringify(add));
  await pg.screenshot({ path: out('x-sites.png'), fullPage: true });
  await ctx.close();
}
// 17. morning check-in: four questions and no phone readings, the opt-in rate as it is typed, one JSON out
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => problems.push(`report/checkin/: ${e}`));
  const A = '11111111-1111-1111-1111-111111111111', B = '22222222-2222-2222-2222-222222222222', P3 = 'aaaaaaaa-3333-3333-3333-333333333333';
  let sent = null;
  await pg.route('**/rest/v1/rpc/dr_form_options', r => r.fulfill({ json: { sites: [{ id: A, name: 'Test factory', team: 'direct', lead: 'Karim' }, { id: B, name: 'Partner farm', team: 'partner', lead: 'Shady' }], people: [{ id: P3, name: 'Shady', role: 'partner', team: 'partner', site_id: B }, { id: 'lead-1', name: 'Karim', role: 'site-lead', team: 'direct', site_id: A }], deadline: '18:00', checkin_deadline: '09:00', phones_max: 270, phones: {} } }));
  await pg.route('**/rest/v1/rpc/dr_checkin', r => { sent = r.request().postDataJSON(); r.fulfill({ json: { ok: true, site: 'Partner farm', day: '2026-09-06', phones_deployed: 2, phones: 2, late: false, problem: true, sent_at: '08:20', updated: false } }); });
  await pg.goto(base + 'report/checkin/', { waitUntil: 'networkidle' });
  if (!/9:00 AM/.test(await pg.$eval('#clockline', e => e.textContent))) problems.push('check-in: the deadline line does not say 9:00 AM');
  if ((await pg.$$eval('#f-reporter option', els => els.map(e => e.value).join(','))) !== `,${P3}`) problems.push('check-in: the name list is not Portfolio Managers and partners only');
  await pg.selectOption('#f-reporter', P3);
  if ((await pg.inputValue('#f-site')) !== B) problems.push('check-in: picking Shady did not pick the partner farm');
  // the phone readings belong to the evening check-out: nothing here asks for a tag or a minute
  if (await pg.$('#phones, [data-ph=tag], [data-ph=recorded], [data-ph=local], #add-phone')) problems.push('check-in: the phone ledger is still on the morning check-in');
  if (await pg.$('#f-code, #f-channel, #f-wearers_scheduled')) problems.push('check-in: the form still asks for a code, a channel, or scheduled wearers');
  // the four questions, and nothing else that takes a number
  const asks = await pg.$$eval('#cform [data-f]', els => [...new Set(els.map(e => e.dataset.f))].join(','));
  if (asks !== 'reporter,reporter_other,site,date,started_at,phones_deployed,phones_out,wearers_present,problem,note') problems.push('check-in: the form asks ' + asks);
  await pg.fill('#f-started_at', '08:05');
  await pg.fill('#f-phones_deployed', '39');
  await pg.fill('#f-phones_out', '1');
  if ((await pg.$eval('#optin', e => e.textContent.trim())) !== 'Fill in the two numbers above.') problems.push('check-in: the opt-in line shows a rate before there is one');
  await pg.fill('#f-wearers_present', '52');
  // 39 phones for 52 people present is 75 per cent, worked out on the form so the dashboard is never a surprise
  if ((await pg.$eval('#optin', e => e.textContent.trim())) !== '75%, 39 of 52') problems.push('check-in: the opt-in line reads "' + (await pg.$eval('#optin', e => e.textContent.trim())) + '"');
  await pg.check('input[name="f-problem"][value="true"]');
  await pg.fill('#f-note', 'One charger dead.');
  await pg.screenshot({ path: out('x-checkin-390.png'), fullPage: true });
  await pg.click('#send');
  await pg.waitForSelector('#sent');
  if (!sent || !sent.p || sent.p.site_id !== B || sent.p.reporter_id !== P3 || sent.p.started_at !== '08:05' || sent.p.phones_deployed !== '39' || sent.p.phones_out !== '1' || sent.p.wearers_present !== '52' || 'phones' in sent.p || sent.p.problem !== 'true' || sent.p.note !== 'One charger dead.' || 'code' in sent.p) problems.push('check-in: the form sent ' + JSON.stringify(sent));
  const txt = await pg.$eval('#sent', e => e.textContent);
  if (!/Partner farm/.test(txt) || !/2 phones recording/.test(txt) || /\blate\b|on time/i.test(txt) || !/The problem is on the company report/.test(txt)) problems.push('check-in: the confirmation reads "' + txt.trim().slice(0, 200) + '"');
  await pg.click('#again');
  if ((await pg.inputValue('#f-reporter')) !== P3) problems.push('check-in: the name was not remembered');
  await ctx.close();
}
// 17b. a phone that last ran an older version reloads once on the new one and then stays put
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => problems.push(`version reload: ${e}`));
  await ctx.addInitScript(() => { try { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('vm.version', JSON.stringify('0.0')); sessionStorage.setItem('seeded', '1'); } } catch {} });
  let loads = 0;
  pg.on('load', () => { loads += 1; });
  await pg.goto(base + 'day/', { waitUntil: 'networkidle' });
  await pg.waitForFunction(() => document.querySelector('#main') && document.querySelector('#main').children.length > 0);
  const live = JSON.parse(fs.readFileSync(path.join(root, 'data/site.json'), 'utf8')).version;
  const stored = await pg.evaluate(() => JSON.parse(localStorage.getItem('vm.version') || 'null'));
  if (loads !== 2) problems.push(`version reload: the page loaded ${loads} times, not twice`);
  if (stored !== live) problems.push(`version reload: the stored version is ${stored}, the live one ${live}`);
  loads = 0;
  await pg.goto(base + 'day/', { waitUntil: 'networkidle' });
  if (loads !== 1) problems.push(`version reload: a page on the live version loaded ${loads} times`);
  await ctx.close();
}
// 18. incident form: somewhere else opens a place box, the kind and the text send, the answer gives the number
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => problems.push(`report/incident/: ${e}`));
  const A = '11111111-1111-1111-1111-111111111111';
  let sent = null;
  await pg.route('**/rest/v1/rpc/dr_form_options', r => r.fulfill({ json: { sites: [{ id: A, name: 'Test factory', team: 'direct', lead: 'Karim' }], people: [], deadline: '18:00', checkin_deadline: '09:00' } }));
  await pg.route('**/rest/v1/rpc/dr_incident', r => { sent = r.request().postDataJSON(); r.fulfill({ json: { ok: true, no: 7, site: 'Hub 1', day: '2026-09-06', kind: 'power', status: 'open', sent_at: '11:30' } }); });
  await pg.goto(base + 'report/incident/', { waitUntil: 'networkidle' });
  if (!(await pg.$eval('#place-wrap', e => e.hidden))) problems.push('incident: the place box shows before somewhere else is picked');
  await pg.selectOption('#f-site', '__elsewhere');
  if (await pg.$eval('#place-wrap', e => e.hidden)) problems.push('incident: the place box did not open');
  await pg.fill('#f-place', 'Hub 1');
  await pg.selectOption('#f-reporter', '__other');
  await pg.fill('#f-reporter_other', 'Karim');
  await pg.fill('#f-role', 'Hub attendant');
  await pg.check('input[name="f-kind"][value="power"]');
  await pg.fill('#f-what', 'Power cut 11:10 to 11:40. Upload paused.');
  await pg.fill('#f-told', 'Moharam at 11:15');
  if (await pg.$('#f-code')) problems.push('incident: the form still asks for a team code');
  await pg.screenshot({ path: out('x-incident-390.png'), fullPage: true });
  await pg.click('#send');
  await pg.waitForSelector('#sent');
  if (!sent || !sent.p || sent.p.site_id !== '' || sent.p.place !== 'Hub 1' || sent.p.reporter_other !== 'Karim' || sent.p.kind !== 'power' || sent.p.what !== 'Power cut 11:10 to 11:40. Upload paused.' || sent.p.open !== 'true' || 'code' in sent.p) problems.push('incident: the form sent ' + JSON.stringify(sent));
  const txt = await pg.$eval('#sent', e => e.textContent);
  if (!/Incident 7/.test(txt) || !/Hub 1/.test(txt) || !/call now/.test(txt)) problems.push('incident: the confirmation reads "' + txt.trim().slice(0, 200) + '"');
  await ctx.close();
}
// 19. incidents list: open ones first, a row opens its detail, closing it sends the note and the name
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => problems.push(`report/incidents/: ${e}`));
  const calls = [];
  const todayCairo = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
  const rows = [
    { id: 'i2', no: 2, day: todayCairo, at: '11:10', site_id: 'a', site: 'Test factory', reporter: 'Karim', role: 'Site lead', kind: 'power', what: 'Power cut 11:10 to 11:40.', people: null, phones: null, actions: 'Waited.', told: 'Eyad at 11:15', needs: 'A generator test', status: 'open', resolution: null, closed_by: null, closed_at: null, sent_at: todayCairo + ' 11:30' },
    { id: 'i1', no: 1, day: '2026-08-20', at: null, site_id: null, site: 'Hub 1', reporter: 'Sam', role: null, kind: 'gear', what: 'A dock died.', people: null, phones: '14', actions: null, told: null, needs: null, status: 'closed', resolution: 'Replaced.', closed_by: 'Moharam', closed_at: '2026-08-21 10:00', sent_at: '2026-08-20 20:00' }
  ];
  await pg.route('**/rest/v1/rpc/dr_admin', r => { const b = r.request().postDataJSON(); calls.push(b);
    if (b.p_action === 'incidents') return r.fulfill({ json: rows });
    r.fulfill({ json: { ok: true } }); });
  await pg.goto(base + 'report/incidents/', { waitUntil: 'networkidle' });
  await pg.waitForSelector('#inc');
  if (await pg.$('#gate')) problems.push('incidents: the page asked for a code');
  const big = await pg.$$eval('.stat .big', els => els.map(e => e.textContent.trim()));
  if (big[0] !== '1' || big[1] !== '1') problems.push('incidents: the counts read ' + big.join(','));
  if ((await pg.$$('#inc tbody tr[data-id]')).length !== 1) problems.push('incidents: the open filter did not hide the closed one');
  await pg.click('[data-filter="all"]');
  if ((await pg.$$('#inc tbody tr[data-id]')).length !== 2) problems.push('incidents: the all filter did not show both');
  await pg.click('#inc tr[data-id="i2"]');
  await pg.waitForSelector('#inc-detail');
  const det = await pg.$eval('#inc-detail', e => e.textContent);
  if (!/Incident 2: Test factory/.test(det) || !/A generator test/.test(det) || !/Eyad at 11:15/.test(det)) problems.push('incidents: the detail reads "' + det.trim().slice(0, 200) + '"');
  await pg.screenshot({ path: out('x-incidents.png'), fullPage: true });
  await pg.fill('#c-res', 'Generator tested, fine.');
  await pg.fill('#c-by', 'Moharam');
  await pg.click('#close-form button[data-status="closed"]');
  await pg.waitForSelector('#toast.on');
  const set = calls.find(c => c.p_action === 'incident_set');
  if (!set || set.p.id !== 'i2' || set.p.status !== 'closed' || set.p.resolution !== 'Generator tested, fine.' || set.p.by !== 'Moharam') problems.push('incidents: closing sent ' + JSON.stringify(set));
  await ctx.close();
}
// 20. team: it opens for the account, the counts and filters read the list, a row opens its form, a save and an add send the fields
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => problems.push(`team/: ${e}`));
  const calls = [];
  const people = [
    { id: 'p1', name: 'Eyad', role: 'portfolio-manager', team: 'direct', site_id: null, site: null, email: 'eyad@example.com', phone: '0100', notes: null, active: true, sort: 1 },
    { id: 'p2', name: 'Karim', role: 'site-lead', team: 'direct', site_id: 'a', site: 'Test factory', phone: null, notes: 'Started in August.', active: true, sort: 2 },
    { id: 'p3', name: 'Shady', role: 'partner', team: 'partner', site_id: 'b', site: 'Partner farm', phone: null, notes: null, active: true, sort: 3 },
    { id: 'p4', name: 'Sam', role: 'operator', team: 'direct', site_id: 'a', site: 'Test factory', phone: null, notes: null, active: false, sort: 4 }
  ];
  await pg.route('**/rest/v1/rpc/dr_admin', r => { const b = r.request().postDataJSON(); calls.push(b);
    if (b.p_action === 'people') return r.fulfill({ json: people });
    if (b.p_action === 'sites') return r.fulfill({ json: [{ id: 'a', name: 'Test factory', team: 'direct', status: 'active' }, { id: 'b', name: 'Partner farm', team: 'partner', status: 'active' }, { id: 'd', name: 'Old shop', team: 'direct', status: 'closed' }] });
    r.fulfill({ json: { ok: true } }); });
  await pg.goto(base + 'team/', { waitUntil: 'networkidle' });
  await pg.waitForSelector('#team');
  if (await pg.$('#gate')) problems.push('team: the page asked for a code');
  const big = await pg.$$eval('.stat .big', els => els.map(e => e.textContent.trim()));
  if (big.join(',') !== '1,1,1,0,3') problems.push('team: the counts read ' + big.join(','));
  // the work email is the thing that lets a person make their own account, so it is on the page
  const teamText = await pg.$eval('#team', e => e.textContent);
  if (!/eyad@example\.com/.test(teamText)) problems.push('team: the work email is not on the list');
  if (!/no email/.test(teamText)) problems.push('team: a person with no work email is not marked');
  if ((await pg.$$('#team tbody tr[data-id]')).length !== 3) problems.push('team: the active filter did not hide the person who left');
  await pg.click('[data-filter="off"]');
  if ((await pg.$$('#team tbody tr[data-id]')).length !== 1) problems.push('team: the not active filter did not show the one who left');
  await pg.click('[data-filter="all"]');
  await pg.click('#team tr[data-id="p2"]');
  await pg.waitForSelector('#person-form');
  if ((await pg.inputValue('#e-name')) !== 'Karim' || (await pg.inputValue('#e-role')) !== 'site-lead' || (await pg.inputValue('#e-site_id')) !== 'a') problems.push('team: the form did not fill from the row');
  const siteOpts = await pg.$$eval('#e-site_id option', els => els.map(e => e.textContent).join(','));
  if (siteOpts !== 'No fixed site,Test factory,Partner farm') problems.push('team: the site list is "' + siteOpts + '"');
  await pg.fill('#e-phone', '0111');
  await pg.click('#person-form button[type=submit]');
  await pg.waitForSelector('#toast.on');
  const set = calls.find(c => c.p_action === 'person_set');
  if (!set || set.p.id !== 'p2' || set.p.phone !== '0111' || set.p.role !== 'site-lead' || set.p.active !== 'true') problems.push('team: saving sent ' + JSON.stringify(set));
  await pg.click('#add');
  await pg.waitForSelector('#person-form');
  await pg.fill('#e-name', 'Nour');
  await pg.selectOption('#e-role', 'operator');
  await pg.selectOption('#e-site_id', 'a');
  await pg.click('#person-form button[type=submit]');
  await pg.waitForSelector('#toast.on');
  const add = calls.find(c => c.p_action === 'person_add');
  if (!add || add.p.name !== 'Nour' || add.p.role !== 'operator' || add.p.site_id !== 'a' || 'id' in add.p) problems.push('team: adding sent ' + JSON.stringify(add));
  await pg.screenshot({ path: out('x-team.png'), fullPage: true });
  await ctx.close();
}
// 21. live edits: an edit in the database shows on the page, Edit mode wraps the text, a change sends one row, Done unwraps
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => problems.push(`edit: ${e}`));
  pg.on('dialog', d => { problems.push('edit: a browser dialog opened: ' + d.message()); d.dismiss(); });
  const calls = [];
  await pg.route('**/rest/v1/rpc/dr_edits_read', r => r.fulfill({ json: [{ id: 'e1', page: 'rules', lang: 'en', kind: 'text', before: 'Rules', after: 'House rules' }] }));
  let refuse = false;   // the database turning the account down, further down the test
  await pg.route('**/rest/v1/rpc/dr_edit', r => { const b = r.request().postDataJSON(); calls.push(b); if (refuse) return r.fulfill({ status: 400, json: { message: 'wrong code' } }); r.fulfill({ json: { ok: true, id: 'e2' } }); });
  await pg.goto(base + 'rules/?edit=1', { waitUntil: 'networkidle' });
  await pg.waitForFunction(() => document.querySelector('#head h1') && document.querySelector('#head h1').textContent === 'House rules');
  // the account is the way in: nothing is asked for, and the name on the change is the name on the account
  await pg.click('#edit');
  await pg.waitForSelector('body.editing');
  if (await pg.$('#ask-box')) problems.push('edit: a founder was asked for something before editing');
  if (!(await pg.$('#edit-bar'))) problems.push('edit: no bar in edit mode');
  const span = await pg.$('#head h1 .ed');
  if (!span) problems.push('edit: the heading is not editable');
  await span.click();
  await pg.keyboard.press('Control+A');
  await pg.keyboard.type('The rules');
  await pg.keyboard.press('Enter');
  await pg.waitForSelector('#toast.on');
  // the edit is keyed by the source text, not by the text already changed in the database
  const sent = calls.find(c => c.p_action === 'set');
  if (!sent || sent.p.page !== 'rules' || sent.p.lang !== 'en' || sent.p.before !== 'Rules' || sent.p.after !== 'The rules' || sent.p.who !== 'Test Founder' || sent.p_code !== '') problems.push('edit: the change sent ' + JSON.stringify(sent));
  if (!(await pg.$('#content .ed'))) problems.push('edit: the body text is not editable');
  // links rest while editing, so their text can be clicked into, and come back on Done
  if (await pg.$('#rail a[href]')) problems.push('edit: nav links still live in edit mode');
  const bars = await pg.$$eval('#content > .bk > .bk-bar', b => b.length);
  if (bars < 4) problems.push(`edit: ${bars} section bars on the rules page, expected one per section`);
  await pg.screenshot({ path: out('x-edit.png') });
  await pg.click('#edit');
  if (await pg.$('.ed')) problems.push('edit: spans stayed after Done');
  if (await pg.$('.bk-bar')) problems.push('edit: section bars stayed after Done');
  if (!(await pg.$('#rail a[href]'))) problems.push('edit: nav links did not come back after Done');
  if ((await pg.$eval('#head h1', e => e.textContent.trim())) !== 'The rules') problems.push('edit: the new text did not stay after Done');
  // a second change in the same session is still keyed to the source text
  await pg.click('#edit');
  await pg.waitForSelector('body.editing');
  await (await pg.$('#head h1 .ed')).click();
  await pg.keyboard.press('Control+A');
  await pg.keyboard.type('Our rules');
  await pg.keyboard.press('Enter');
  await pg.waitForFunction(n => document.querySelectorAll('#toast.on').length && n, calls.length + 1);
  const second = calls.filter(c => c.p_action === 'set').pop();
  if (!second || second.p.before !== 'Rules' || second.p.after !== 'Our rules') problems.push('edit: the second change sent ' + JSON.stringify(second));
  // Done while the text is still focused: the change is saved, then the page is left as readers see it
  await (await pg.$('#head h1 .ed')).click();
  await pg.keyboard.press('Control+A');
  await pg.keyboard.type('House rules');
  await pg.click('#edit');
  await pg.waitForFunction(() => !document.body.classList.contains('editing'));
  await pg.waitForTimeout(300);
  const third = calls.filter(c => c.p_action === 'set').pop();
  if (!third || third.p.before !== 'Rules' || third.p.after !== 'House rules') problems.push('edit: Done did not save the change being typed: ' + JSON.stringify(third));
  if ((await pg.$eval('#head h1', e => e.textContent.trim())) !== 'House rules') problems.push('edit: the text typed before Done is not on the page');
  // the database turns the account down: the change is thrown back, edit mode ends, and the page says whose fault it is
  refuse = true;
  await pg.click('#edit');
  await pg.waitForSelector('body.editing');
  await (await pg.$('#head h1 .ed')).click();
  await pg.keyboard.press('Control+A');
  await pg.keyboard.type('Nope');
  await pg.keyboard.press('Enter');
  await pg.waitForFunction(() => !document.body.classList.contains('editing'));
  if (!/account/i.test(await pg.evaluate(() => document.getElementById('toast').textContent))) problems.push('edit: no message when the database turned the account down');
  if ((await pg.$eval('#head h1', e => e.textContent.trim())) === 'Nope') problems.push('edit: the rejected change stayed on the page');
  await ctx.close();
}
// 22. sections: a hidden section is gone for readers and hatched in edit mode, an order row moves sections, the bar's
//     buttons send the right rows, Show again undoes a hide, and Done leaves the page as readers see it
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => problems.push(`sections: ${e}`));
  pg.on('dialog', d => { problems.push('sections: a browser dialog opened'); d.dismiss(); });
  const calls = [];
  const rows = [
    { id: 'h1', page: 'rules', lang: 'all', kind: 'hide', before: '#integrity', after: 'Integrity', who: 'Youssif' },
    { id: 'o1', page: 'rules', lang: 'all', kind: 'order', before: 'root', after: JSON.stringify({ keys: ['section:3', '#floor'], labels: ['Pay, rewards, and penalties', 'At the site'] }) }
  ];
  await pg.route('**/rest/v1/rpc/dr_edits_read', r => r.fulfill({ json: rows }));
  await pg.route('**/rest/v1/rpc/dr_edit', r => { const b = r.request().postDataJSON(); calls.push(b); r.fulfill({ json: { ok: true, id: 'n' + calls.length } }); });
  await pg.goto(base + 'rules/?edit=1', { waitUntil: 'networkidle' });
  await pg.waitForFunction(() => document.querySelector('#integrity') && document.querySelector('#integrity').classList.contains('bk-off'));
  if (await pg.$eval('#integrity', e => e.offsetParent !== null)) problems.push('sections: the hidden section still shows to readers');
  const order = () => pg.$$eval('#content > section', s => s.map(e => e.id));
  if (JSON.stringify(await order()) !== JSON.stringify(['pay', 'integrity', 'conduct', 'floor'])) problems.push('sections: the order row did not apply: ' + (await order()).join(','));
  await pg.click('#edit');
  await pg.waitForSelector('body.editing');
  if (!(await pg.$eval('#integrity', e => e.offsetParent !== null))) problems.push('sections: the hidden section is not shown in edit mode');
  if (!(await pg.$('#integrity > .bk-bar [data-act=show]'))) problems.push('sections: no Show again on the hidden section');
  await pg.screenshot({ path: out('x-sections.png') });
  await pg.click('#integrity > .bk-bar [data-act=show]');
  await pg.waitForSelector('#toast.on');
  const undo = calls.find(c => c.p_action === 'delete');
  if (!undo || undo.p.id !== 'h1') problems.push('sections: Show again did not remove the hide row: ' + JSON.stringify(undo));
  if (await pg.$eval('#integrity', e => e.classList.contains('bk-off'))) problems.push('sections: the section is still marked hidden after Show again');
  await pg.click('#conduct > .bk-bar [data-act=hide]');
  await pg.waitForFunction(() => document.querySelector('#conduct').classList.contains('bk-off'));
  const hid = calls.find(c => c.p_action === 'set' && c.p.kind === 'hide');
  if (!hid || hid.p.page !== 'rules' || hid.p.before !== '#conduct' || hid.p.after !== 'Attendance and behavior' || hid.p.who !== 'Test Founder') problems.push('sections: the hide row sent ' + JSON.stringify(hid));
  if (!(await pg.$('#conduct > .bk-bar [data-act=show]'))) problems.push('sections: the bar did not switch to Show again after Hide');
  await pg.click('#floor > .bk-bar [data-act=up]');
  await pg.waitForFunction(n => document.querySelectorAll('#content > section')[2].id === 'floor', null);
  const moved = calls.find(c => c.p_action === 'set' && c.p.kind === 'order');
  let keys = [];
  try { keys = JSON.parse(moved.p.after).keys; } catch { /* reported below */ }
  if (!moved || moved.p.before !== 'root' || JSON.stringify(keys) !== JSON.stringify(['section:3', '#integrity', '#floor', '#conduct'])) problems.push('sections: the order row sent ' + JSON.stringify(moved));
  await pg.click('#edit');
  if (await pg.$('.bk, .bk-bar')) problems.push('sections: bars or marks stayed after Done');
  if (await pg.$eval('#conduct', e => e.offsetParent !== null)) problems.push('sections: the section hidden in this session still shows after Done');
  if (!(await pg.$eval('#integrity', e => e.offsetParent !== null))) problems.push('sections: the section shown again is hidden after Done');
  await ctx.close();
}
// 24. sections without ids: keys count from the source order even after a move, so a hide row finds its card under a
//     moved grid; a row whose key now points at another section is matched by its label instead
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => problems.push(`keys: ${e}`));
  const rows = [
    { id: 'o2', page: 'forms', lang: 'all', kind: 'order', before: 'root', after: JSON.stringify({ keys: ['section:1', 'section:0'], labels: ['For management', 'Every day, from the site'] }) },
    { id: 'h2', page: 'forms', lang: 'all', kind: 'hide', before: 'section:0/div:2/a:0', after: 'Morning check-in', who: 'Adham' },
    { id: 'h3', page: 'forms', lang: 'all', kind: 'hide', before: 'section:2/div:2/a:0', after: 'Daily report', who: 'Adham' }
  ];
  await pg.route('**/rest/v1/rpc/dr_edits_read', r => r.fulfill({ json: rows }));
  await pg.route('**/rest/v1/rpc/dr_edit', r => r.fulfill({ json: { ok: true, id: 'x' } }));
  await pg.goto(base + 'forms/?edit=1', { waitUntil: 'networkidle' });
  await pg.waitForFunction(() => document.querySelector('#content .bk-off'));
  const hidden = await pg.$$eval('#content .bk-off', els => els.map(e => e.querySelector('h3, h2, b, strong')?.textContent.trim()));
  if (!hidden.includes('Morning check-in')) problems.push('keys: the card under the moved grid was not found: ' + hidden.join(','));
  if (hidden.includes('Incident report')) problems.push('keys: a stale key hid the wrong card');
  const grids = await pg.$$eval('#content .cards', g => g.map(e => e.querySelector('h3')?.textContent.trim()));
  if (grids[0] !== 'Dashboard') problems.push('keys: the sections did not swap: ' + grids.join(','));
  await ctx.close();
}
// 23. the edits page: every kind of row reads in words, and Undo goes through the account
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => problems.push(`edits page: ${e}`));
  pg.on('dialog', d => { problems.push('edits page: a browser dialog opened'); d.dismiss(); });
  const calls = [];
  const edits = [
    { id: 'a', page: 'rules', lang: 'en', kind: 'text', before: 'Rules', after: 'The rules', who: 'Adham', at: '2026-09-07T10:00:00Z', applied: false },
    { id: 'b', page: 'rules', lang: 'all', kind: 'hide', before: '#integrity', after: 'Integrity', who: 'Youssif', at: '2026-09-07T09:00:00Z', applied: false },
    { id: 'c', page: 'jobs', lang: 'all', kind: 'delete', before: 'section:2', after: 'Quality', who: 'Youssif', at: '2026-09-07T08:00:00Z', applied: false },
    { id: 'd', page: 'rules', lang: 'all', kind: 'order', before: 'root', after: JSON.stringify({ keys: ['section:4', '#floor'], labels: ['Pay, rewards, and penalties', 'At the site'] }), who: 'Adham', at: '2026-09-07T07:00:00Z', applied: true }
  ];
  await pg.route('**/rest/v1/rpc/dr_edit', r => {
    const b = r.request().postDataJSON();
    if (b.p_action === 'list') return r.fulfill({ json: edits });
    calls.push(b);
    r.fulfill({ json: { ok: true } });
  });
  await pg.goto(base + 'edits/', { waitUntil: 'networkidle' });
  await pg.waitForSelector('#edits tbody tr');
  const text = await pg.$eval('#edits tbody', e => e.textContent);
  for (const need of ['The rules', 'Section hidden', 'Integrity', 'Section deleted', 'Quality', 'Sections moved', 'Pay, rewards, and penalties, At the site']) if (!text.includes(need)) problems.push(`edits page: "${need}" is not on the page`);
  if ((await pg.$$eval('[data-undo]', b => b.length)) !== 3) problems.push('edits page: Undo should show on the three live rows only');
  await pg.click('[data-undo="b"]');
  await pg.waitForSelector('#toast.on');
  if (await pg.$('#ask-box')) problems.push('edits page: Undo asked for something');
  if (!calls.find(c => c.p_action === 'delete' && c.p.id === 'b' && c.p_code === '' && c.p.who === 'Test Founder')) problems.push('edits page: Undo did not send the delete: ' + JSON.stringify(calls));
  await pg.waitForSelector('[data-undo="c"]');
  await pg.click('[data-undo="c"]');
  await pg.waitForFunction(() => document.querySelectorAll('[data-undo="c"]').length === 1 && !document.querySelector('[data-undo="c"]').disabled);
  if (calls.filter(c => c.p_action === 'delete' && c.p.id === 'c').length !== 1) problems.push('edits page: the second Undo sent ' + calls.filter(c => c.p_action === 'delete' && c.p.id === 'c').length + ' deletes');
  if (await pg.$('[data-done="a"]')) problems.push('edits page: a text row offers Done in the source');
  await pg.click('[data-done="b"]');
  await pg.waitForFunction(() => /done/i.test(document.getElementById('toast')?.textContent || ''));
  if (!calls.find(c => c.p_action === 'applied' && c.p.ids && c.p.ids[0] === 'b')) problems.push('edits page: Done in the source did not mark the row: ' + JSON.stringify(calls.slice(-1)));
  await ctx.close();
}
// 26. the account layer: a page asks who is reading, a role opens some pages and not others, the rail drops what it cannot open,
//     the reader's name sits on every page, the site forms need no account, and the signals a browser gives are sent as they happen
{
  const who = (over = {}) => ({ signed_in: true, id: 'u2', email: 'sam@example.com', name: 'Sam Reader', role: 'operator', status: 'active', sections: ['everyday', 'training', 'forms'], posthog: { key: '', host: '' }, ...over });
  const open = async (me, path) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const pg = await ctx.newPage();
    const events = [];
    pg.on('pageerror', e => problems.push(`${path} (account): ${e}`));
    await pg.route('**/rest/v1/rpc/dr_me', r => r.fulfill({ json: me }));
    await pg.route('**/rest/v1/rpc/dr_event', r => { events.push(r.request().postDataJSON()); r.fulfill({ json: { ok: true } }); });
    await pg.goto(base + (path ? path + '/' : ''), { waitUntil: 'networkidle' });
    return { ctx, pg, events };
  };
  // signed out: nothing opens, and the page says how to get in
  let s = await open({ signed_in: false }, 'rules');
  let text = await s.pg.$eval('#main', e => e.textContent);
  if (!/Sign in to read the map/.test(text)) problems.push('account: a signed-out reader was not asked to sign in on the rules page');
  if (await s.pg.$('#wm')) problems.push('account: a signed-out reader was given a watermark');
  if (/30-minute recording cycle/.test(text)) problems.push('account: the rules were rendered for a signed-out reader');
  await s.ctx.close();
  // an account with no role yet
  s = await open(who({ status: 'pending', role: 'none', sections: [] }), 'rules');
  if (!/account is waiting/.test(await s.pg.$eval('#main', e => e.textContent))) problems.push('account: a pending account was not told it is waiting');
  await s.ctx.close();
  // an operator: the rules open, the numbers do not, and the rail carries only what the role opens
  s = await open(who(), 'rules');
  if (!/30-minute recording cycle/.test(await s.pg.$eval('#content', e => e.textContent))) problems.push('account: an operator could not read the rules');
  const rail = await s.pg.$$eval('#rail a', els => els.map(e => e.getAttribute('href')));
  if (rail.some(h => /\/(metrics|sops|jobs|report\/day|sites)\//.test(h))) problems.push('account: the rail offers pages the role cannot open: ' + rail.join(' '));
  if (!rail.some(h => /\/rules\//.test(h))) problems.push('account: the rail lost a page the role can open');
  // the name on the page, on the screen and on paper
  const wm = await s.pg.$eval('#wm', e => getComputedStyle(e).getPropertyValue('--wm'));
  if (!/Sam%20Reader|Sam Reader/.test(decodeURIComponent(wm))) problems.push('account: the watermark does not carry the reader');
  if (!(await s.pg.$eval('.top .who', e => e.textContent.trim())) .includes('Sam')) problems.push('account: the top bar does not say who is reading');
  // the signals: a view on arrival, and a print the moment it is asked for
  if (!s.events.some(e => e.p_kind === 'view' && e.p_page === 'rules')) problems.push('account: the page view was not logged: ' + JSON.stringify(s.events));
  await s.pg.keyboard.press('Control+p').catch(() => {});
  await s.pg.waitForFunction(() => true);
  await s.pg.waitForTimeout(200);
  if (!s.events.some(e => e.p_kind === 'print')) problems.push('account: printing was not sent');
  await s.pg.screenshot({ path: out('x-account-operator.png'), fullPage: true });
  await s.ctx.close();
  // a page outside the role
  s = await open(who(), 'metrics');
  if (!/Not for your role/.test(await s.pg.$eval('#main', e => e.textContent))) problems.push('account: a page outside the role opened');
  if (!s.events.some(e => e.p_kind === 'denied')) problems.push('account: the refusal was not logged');
  await s.ctx.close();
  // the site forms need no account at all
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const pg = await ctx.newPage();
    pg.on('pageerror', e => problems.push(`report/checkin (no account): ${e}`));
    await pg.route('**/rest/v1/rpc/dr_me', r => r.fulfill({ json: { signed_in: false } }));
    await pg.route('**/rest/v1/rpc/dr_event', r => r.fulfill({ json: { ok: true } }));
    await pg.route('**/rest/v1/rpc/dr_form_options', r => r.fulfill({ json: { sites: [{ id: 'a', name: 'Test factory', team: 'direct' }], people: [], deadline: '18:00', checkin_deadline: '09:00', phones_max: 270, phones: {} } }));
    await pg.goto(base + 'report/checkin/', { waitUntil: 'networkidle' });
    if (!(await pg.$('#f-site'))) problems.push('account: the morning check-in asked for an account');
    if (/Sign in to read the map/.test(await pg.$eval('#main', e => e.textContent))) problems.push('account: the morning check-in was gated');
    await ctx.close();
  }
  // the deployed shape: no content files on the server at all, every page reading through the database, answered by role
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const pg = await ctx.newPage();
    pg.on('pageerror', e => problems.push(`deployed shape: ${e}`));
    const files = {};
    for (const f of ['ui', 'site', 'report', 'rules', 'metrics', 'manual/quality', 'ar/index'])
      files['data/' + f + '.json'] = JSON.parse(fs.readFileSync(path.join(root, 'data', f + '.json'), 'utf8'));
    const OPEN = ['data/site.json', 'data/report.json', 'data/ui.json', 'data/ar/index.json'];
    let me = who();                       // an operator: every day, training, forms
    const sectionOf = p => (p.startsWith('data/ar/') ? 'data/' + p.slice(8) : p) === 'data/metrics.json' ? 'numbers'
      : ['data/rules.json', 'data/manual/quality.json'].includes(p) ? 'everyday' : 'chrome';
    let asked = [];
    // the web server carries the navigation and the address of the database, and nothing else from data/
    await pg.route('**/data/**', r => {
      const p = 'data/' + r.request().url().split('/data/')[1].split('?')[0];
      return OPEN.slice(0, 2).includes(p) ? r.continue() : r.fulfill({ status: 404, body: 'not found' });
    });
    await pg.route('**/rest/v1/rpc/dr_content', r => {
      const paths = r.request().postDataJSON().p_paths || [];
      asked = asked.concat(paths);
      const out = {};
      for (const p of paths) {
        if (!files[p]) continue;
        const sec = sectionOf(p);
        if (OPEN.includes(p) || (me.sections || []).includes(sec)) out[p] = files[p];
      }
      if (!Object.keys(out).length && !me.signed_in) return r.fulfill({ status: 400, json: { message: 'sign in' } });
      r.fulfill({ json: out });
    });
    await pg.route('**/rest/v1/rpc/dr_me', r => r.fulfill({ json: me }));
    await pg.route('**/rest/v1/rpc/dr_event', r => r.fulfill({ json: { ok: true } }));
    // a page the role opens, with its content coming only from the database
    await pg.goto(base + 'rules/', { waitUntil: 'networkidle' });
    if (!/30-minute recording cycle/.test(await pg.$eval('#content', e => e.textContent))) problems.push('deployed shape: the rules did not come from the database');
    if (!asked.includes('data/rules.json')) problems.push('deployed shape: the page never asked the database for its content: ' + asked.join(','));
    if (!(await pg.$('#wm'))) problems.push('deployed shape: no watermark');
    // a page the role does not open: the content is refused and the reader is told, not left with a blank page
    await pg.goto(base + 'metrics/', { waitUntil: 'networkidle' });
    await pg.waitForFunction(() => /Not for your role|Sign in to read the map/.test(document.getElementById('main').textContent));
    if (!/Not for your role/.test(await pg.$eval('#main', e => e.textContent))) problems.push('deployed shape: a refused page did not say why');
    // signed out, the same page asks for a sign-in rather than breaking
    me = { signed_in: false };
    await pg.goto(base + 'rules/', { waitUntil: 'networkidle' });
    await pg.waitForFunction(() => /Sign in to read the map/.test(document.getElementById('main').textContent));
    await ctx.close();
  }
  // signing in: the token comes back, the page asks who that is, and it moves on
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const pg = await ctx.newPage();
    // a call cut off as the page is closed is the line going away, not a fault on the page
    pg.on('pageerror', e => { if (!/Failed to fetch/.test(String(e))) problems.push(`login: ${e}`); });
    let asked = null, me = { signed_in: false };
    await ctx.addInitScript(() => { try { localStorage.removeItem('vm.session'); } catch {} });
    await pg.route('**/auth/v1/token**', r => { asked = r.request().postDataJSON(); r.fulfill({ json: { access_token: 'a', refresh_token: 'b', expires_in: 3600 } }); });
    await pg.route('**/auth/v1/signup**', r => r.fulfill({ json: { id: 'u9' } }));
    await pg.route('**/rest/v1/rpc/dr_me', r => r.fulfill({ json: me }));
    await pg.route('**/rest/v1/rpc/dr_event', r => r.fulfill({ json: { ok: true } }));
    await pg.goto(base + 'login/', { waitUntil: 'networkidle' });
    await pg.waitForSelector('#f-email');
    await pg.fill('#f-email', 'sam@example.com');
    await pg.fill('#f-pass', 'longenough');
    me = who();
    await Promise.all([pg.waitForURL(u => !/login/.test(u.toString()), { timeout: 8000 }).catch(() => {}), pg.click('#go')]);
    if (!asked || asked.email !== 'sam@example.com') problems.push('login: the password was not sent to the database: ' + JSON.stringify(asked));
    if (/login/.test(pg.url())) problems.push('login: signing in did not move on, still at ' + pg.url());
    // asking for an account lands on the waiting screen, not inside
    await pg.goto(base + 'login/', { waitUntil: 'networkidle' }).catch(() => {});
    await ctx.close();
  }
  // an address that already has an account gets the same answer as a new one and no message at all, so the page has to say so
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const pg = await ctx.newPage();
    pg.on('pageerror', e => { if (!/Failed to fetch/.test(String(e))) problems.push(`login (already an account): ${e}`); });
    await ctx.addInitScript(() => { try { localStorage.removeItem('vm.session'); } catch {} });
    let signupUrl = '';
    await pg.route('**/auth/v1/signup**', r => { signupUrl = r.request().url(); r.fulfill({ json: { id: '0', email: 'old@example.com', identities: [], confirmation_sent_at: '2026-09-13T00:00:00Z' } }); });
    await pg.route('**/rest/v1/rpc/dr_me', r => r.fulfill({ json: { signed_in: false } }));
    await pg.route('**/rest/v1/rpc/dr_event', r => r.fulfill({ json: { ok: true } }));
    await pg.goto(base + 'login/', { waitUntil: 'networkidle' });
    await pg.waitForSelector('#f-email');
    await pg.click('[data-mode="up"]');
    await pg.fill('#f-name', 'Old Hand');
    await pg.fill('#f-email', 'old@example.com');
    await pg.fill('#f-pass', 'longenough');
    await pg.click('#go');
    const said = await pg.waitForFunction(() => /already has an account/.test(document.getElementById('main').textContent), { timeout: 8000 }).then(() => true).catch(() => false);
    if (!said) problems.push('login: an address that already has an account was left waiting for a message that is never sent');
    if (await pg.$eval('#f-email', e => e.value) !== 'old@example.com') problems.push('login: the email was dropped when the form went back to signing in');
    if (!(await pg.$('#f-pass[autocomplete="current-password"]'))) problems.push('login: the form did not go back to signing in');
    if (!/redirect_to=/.test(signupUrl) || !/login/.test(decodeURIComponent(signupUrl))) problems.push('login: the sign-up link was not asked to come back to the sign-in page: ' + signupUrl);
    await ctx.close();
  }
  // the password email: the link is asked to come back to this page, and a link that landed somewhere unreachable can be pasted whole
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const pg = await ctx.newPage();
    pg.on('pageerror', e => { if (!/Failed to fetch/.test(String(e))) problems.push(`login (password link): ${e}`); });
    await ctx.addInitScript(() => { try { localStorage.removeItem('vm.session'); } catch {} });
    let recoverUrl = '', put = null;
    await pg.route('**/auth/v1/recover**', r => { recoverUrl = r.request().url(); r.fulfill({ json: {} }); });
    await pg.route('**/auth/v1/user', r => { put = { method: r.request().method(), auth: r.request().headers().authorization, body: r.request().postDataJSON() }; r.fulfill({ json: { id: 'u1' } }); });
    await pg.route('**/rest/v1/rpc/dr_me', r => r.fulfill({ json: { signed_in: false } }));
    await pg.route('**/rest/v1/rpc/dr_event', r => r.fulfill({ json: { ok: true } }));
    await pg.goto(base + 'login/', { waitUntil: 'networkidle' });
    await pg.waitForSelector('#f-email');
    await pg.fill('#f-email', 'sam@example.com');
    await pg.click('#forgot');
    await pg.waitForSelector('#p-link', { timeout: 8000 }).catch(() => problems.push('login: asking for a new password did not say what happens next'));
    if (!/redirect_to=/.test(recoverUrl) || !/login/.test(decodeURIComponent(recoverUrl))) problems.push('login: the password link was not asked to come back to the sign-in page: ' + recoverUrl);
    // the link landed on a page that will not open: paste the whole address
    await pg.fill('#p-link', 'http://localhost:3000/#access_token=aa.bb-cc_dd&expires_in=3600&refresh_token=x&token_type=bearer&type=recovery');
    await pg.click('#paste button[type=submit]');
    await pg.waitForSelector('#np-pass', { timeout: 8000 }).catch(() => problems.push('login: a pasted link did not open the new password form'));
    await pg.fill('#np-pass', 'a-new-password');
    await pg.click('#np-go');
    await pg.waitForFunction(() => !document.getElementById('np-pass') || document.getElementById('np-pass').value === '', { timeout: 8000 }).catch(() => {});
    await pg.waitForTimeout(300);
    if (!put || put.method !== 'PUT' || !/aa\.bb-cc_dd/.test(put.auth || '') || put.body.password !== 'a-new-password')
      problems.push('login: the new password was not set with the token from the pasted link: ' + JSON.stringify(put));
    // a link that has already been used says so instead of showing a bare form
    // the same box is reachable without asking for another message, for a link that is already sitting in another tab
    await pg.goto('about:blank');
    await pg.goto(base + 'login/', { waitUntil: 'networkidle' });
    await pg.click('#stuck');
    if (!(await pg.$('#p-link'))) problems.push('login: there is no way to a link that will not open without asking for another one');
    // a link that has been used already lands on the same dead address, carrying the reason instead of a token
    await pg.goto('about:blank');
    await pg.goto(base + 'login/', { waitUntil: 'networkidle' });
    await pg.click('#stuck');
    await pg.fill('#p-link', 'http://localhost:3000/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
    await pg.click('#paste button[type=submit]');
    const said = await pg.waitForFunction(() => /used already or has run out/.test(document.getElementById('main').textContent), { timeout: 8000 }).then(() => true).catch(() => false);
    if (!said) problems.push('login: a spent link pasted in was answered as if the address had been copied wrongly');
    // the token does not stay in the address bar once the page has it
    await pg.goto('about:blank');
    await pg.goto(base + 'login/#access_token=aa.bb-cc&type=recovery&refresh_token=r', { waitUntil: 'networkidle' });
    await pg.waitForSelector('#np-pass', { timeout: 8000 }).catch(() => problems.push('login: a recovery link did not open the new password form'));
    if (await pg.evaluate(() => location.hash)) problems.push('login: the token was left in the address bar');
    // a sign-up confirmation lands here signed in already: the session in the address is kept, so the page knows who it is
    await pg.unroute('**/rest/v1/rpc/dr_me');
    await pg.route('**/rest/v1/rpc/dr_me', r => r.fulfill({ json: { signed_in: true, id: 'u3', email: 'new@example.com', name: 'New Hand', role: 'none', status: 'pending', sections: [], posthog: { key: '', host: '' } } }));
    await pg.goto('about:blank');
    await pg.goto(base + 'login/#access_token=cc.dd-ee&refresh_token=rr&expires_in=3600&token_type=bearer&type=signup', { waitUntil: 'networkidle' });
    const known = await pg.waitForFunction(() => /account is waiting/.test(document.getElementById('main').textContent), { timeout: 8000 }).then(() => true).catch(() => false);
    if (!known) problems.push('login: the session in a sign-up confirmation was thrown away');
    if (await pg.evaluate(() => location.hash)) problems.push('login: the sign-up session was left in the address bar');
    await pg.evaluate(() => { try { localStorage.removeItem('vm.session'); } catch {} });
    await pg.goto('about:blank');   // a hash on its own is not a new page: the module has to be loaded again for this one
    await pg.goto(base + 'login/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired', { waitUntil: 'networkidle' });
    await pg.waitForFunction(() => /used already or has run out/.test(document.getElementById('main').textContent), { timeout: 8000 })
      .catch(() => problems.push('login: a link that has run out was not explained'));
    if (/error=/.test(await pg.evaluate(() => location.hash))) problems.push('login: the failed link was left in the address');
    await ctx.close();
  }
}
// 27. the chrome: no editor is offered on a page, and the two site forms carry neither the name of the map nor a reading counter
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => problems.push(`chrome: ${e}`));
  await pg.route('**/rest/v1/rpc/dr_form_options', r => r.fulfill({ json: { sites: [{ id: 'a', name: 'Test factory', team: 'direct' }], people: [], deadline: '18:00', checkin_deadline: '09:00', phones_max: 270, phones: {} } }));
  await pg.goto(base + 'rules/', { waitUntil: 'networkidle' });
  if (await pg.$('#edit')) problems.push('chrome: a page still offers the editor to whoever opens it');
  if (!(await pg.$('.wordmark'))) problems.push('chrome: an ordinary page lost the name of the map');
  if (!(await pg.$('#rail .prog'))) problems.push('chrome: an ordinary page lost the reading counter');
  await pg.goto(base + 'rules/?edit=1', { waitUntil: 'networkidle' });
  await pg.waitForSelector('#edit', { timeout: 8000 }).catch(() => problems.push('chrome: management cannot reach the editor with edit=1 in the address'));
  // the editor belongs to a founder or a manager: another role asking for it by hand gets nothing
  const reader = { signed_in: true, id: 'u5', email: 'pm@example.com', name: 'Eyad', role: 'portfolio-manager', status: 'active',
    sections: ['company', 'everyday', 'training', 'forms', 'sops', 'numbers', 'mine'], posthog: { key: '', host: '' } };
  await pg.route('**/rest/v1/rpc/dr_me', r => r.fulfill({ json: reader }));
  await pg.goto(base + 'rules/?edit=1', { waitUntil: 'networkidle' });
  await pg.waitForTimeout(400);
  if (await pg.$('#edit')) problems.push('chrome: a role that cannot edit was offered the editor');
  await pg.unroute('**/rest/v1/rpc/dr_me');
  for (const form of ['report/checkin/', 'report/']) {
    await pg.goto(base + form, { waitUntil: 'networkidle' });
    if (await pg.$('.wordmark')) problems.push(`chrome: ${form} still carries the name of the map`);
    if (await pg.$('#rail .prog') || await pg.$('#rail .gc')) problems.push(`chrome: ${form} still carries a reading counter`);
    if (await pg.$('#top .scrollbar')) problems.push(`chrome: ${form} still carries the reading line`);
    if (!(await pg.$('#rail a'))) problems.push(`chrome: ${form} lost the list of the other forms`);
  }
  await ctx.close();
}
// 28b. a management page the database turns this account down for: it says so and offers nothing to type
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => problems.push(`refused: ${e}`));
  await pg.route('**/rest/v1/rpc/dr_report', r => r.fulfill({ status: 400, json: { message: 'wrong code' } }));
  await pg.route('**/rest/v1/rpc/dr_map', r => r.fulfill({ status: 400, json: { message: 'wrong code' } }));
  await pg.goto(base + 'dashboard/', { waitUntil: 'networkidle' });
  await pg.waitForSelector('#gate');
  if (await pg.$('#gate input')) problems.push('refused: the page still asks for a code');
  if (!(await pg.$('#gate a[href*="login"]'))) problems.push('refused: the page does not offer a way to sign in');
  await ctx.close();
}
// 28. my sites: a person sees their own sites and nothing else, and a form they open already knows who they are
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => problems.push(`mine: ${e}`));
  const lead = { signed_in: true, id: 'u4', email: 'karim@example.com', name: 'Karim', role: 'site-lead', status: 'active',
    sections: ['everyday', 'training', 'forms', 'sops', 'mine'], posthog: { key: '', host: '' } };
  await pg.route('**/rest/v1/rpc/dr_me', r => r.fulfill({ json: lead }));
  await pg.route('**/rest/v1/rpc/dr_mine', r => r.fulfill({ json: {
    day: '2026-09-13', today: '2026-09-13', now: '08:40', name: 'Karim', role: 'site-lead', deadline: '18:00', checkin_deadline: '09:00',
    sites: [
      { id: 'a', name: 'Test factory', team: 'direct', city: 'Cairo', open_incidents: 1, week: [600, 610, 0, 620, 615, 612, 0],
        checkin: { at: '08:05', sent: '08:06', phones: 80, present: 78, down: 2, ok: true, note: null, late: false, reporter: 'Karim' }, report: null },
      { id: 'b', name: 'Second factory', team: 'direct', city: 'Tanta', open_incidents: 0, week: [0, 0, 0, 0, 0, 0, 0], checkin: null, report: null }] } }));
  await pg.goto(base + 'mine/', { waitUntil: 'networkidle' });
  await pg.waitForSelector('.site-card');
  const text = await pg.$eval('#main', e => e.textContent.replace(/\s+/g, ' '));
  if (!/Test factory/.test(text) || !/Second factory/.test(text)) problems.push('mine: a site is missing from the page');
  if ((await pg.$$('.site-card')).length !== 2) problems.push('mine: the page drew ' + (await pg.$$('.site-card')).length + ' cards');
  if (!/no morning check-in/.test(text) || !/no evening check-out/.test(text)) problems.push('mine: the line at the top does not say what is missing: ' + text.slice(0, 200));
  if (!/1 open/.test(text)) problems.push('mine: an open incident was not shown');
  // the rail carries nothing a site lead cannot open
  const rail = await pg.$$eval('#rail a', els => els.map(e => e.getAttribute('href')));
  if (rail.some(h => /\/(report\/day|dashboard|sites|team|accounts|metrics|risks|map)\//.test(h))) problems.push('mine: the rail offers a page this role cannot open: ' + rail.join(' '));
  if (!rail.some(h => /\/mine\//.test(h))) problems.push('mine: the rail lost the page itself');
  if (await pg.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)) problems.push('mine: the page scrolls sideways on a phone');
  await pg.screenshot({ path: out('x-mine-390.png'), fullPage: true });
  await ctx.close();
}
// 29. the morning check-in, signed in: no name to pick, the site already chosen, and the account goes with the form
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => problems.push(`checkin (signed in): ${e}`));
  let sent = null;
  await pg.route('**/rest/v1/rpc/dr_me', r => r.fulfill({ json: { signed_in: true, id: 'u4', email: 'karim@example.com', name: 'Karim',
    role: 'site-lead', status: 'active', sections: ['everyday', 'training', 'forms', 'sops', 'mine'], posthog: { key: '', host: '' } } }));
  await pg.route('**/rest/v1/rpc/dr_form_options', r => r.fulfill({ json: {
    sites: [{ id: 'a', name: 'Test factory', team: 'direct' }, { id: 'b', name: 'Partner farm', team: 'partner' }],
    people: [{ id: 'p2', name: 'Karim', role: 'site-lead', team: 'direct', site_id: 'a' }],
    deadline: '18:00', checkin_deadline: '09:00', phones_max: 270, phones: {},
    me: { signed_in: true, role: 'site-lead', person_id: 'p2', name: 'Karim', sites: ['a'] } } }));
  await pg.route('**/rest/v1/rpc/dr_checkin', r => { sent = r.request().postDataJSON(); r.fulfill({ json: { ok: true, site: 'Test factory', day: '2026-09-13', phones_deployed: 1, phones: 1, late: false, problem: false, sent_at: '08:05', updated: false } }); });
  await pg.goto(base + 'report/checkin/', { waitUntil: 'networkidle' });
  await pg.waitForSelector('#f-site');
  if (await pg.$('#f-reporter')) problems.push('check-in: a signed-in person was still asked to pick their name');
  if (!/Karim/.test(await pg.$eval('#cform', e => e.textContent))) problems.push('check-in: the form does not say who is sending it');
  if ((await pg.inputValue('#f-site')) !== 'a') problems.push('check-in: the site a person covers was not already chosen');
  await pg.fill('#f-started_at', '08:00');
  await pg.fill('#f-phones_deployed', '16');
  await pg.fill('#f-wearers_present', '20');
  await pg.click('#send');
  await pg.waitForSelector('#sent');
  if (!sent || sent.p.reporter_id !== 'p2' || sent.p.site_id !== 'a') problems.push('check-in: the form sent ' + JSON.stringify(sent));
  await ctx.close();
}
// 30. signing in takes a person to a page their own role opens, not to the start page they would be refused
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => { if (!/Failed to fetch/.test(String(e))) problems.push(`login (landing): ${e}`); });
  await ctx.addInitScript(() => { try { localStorage.removeItem('vm.session'); } catch {} });
  let me = { signed_in: false };
  await pg.route('**/auth/v1/token**', r => r.fulfill({ json: { access_token: 'a', refresh_token: 'b', expires_in: 3600 } }));
  await pg.route('**/rest/v1/rpc/dr_me', r => r.fulfill({ json: me }));
  await pg.route('**/rest/v1/rpc/dr_mine', r => r.fulfill({ json: { day: '2026-09-13', today: '2026-09-13', now: '08:40', name: 'Karim', role: 'site-lead', deadline: '18:00', checkin_deadline: '09:00', sites: [] } }));
  await pg.goto(base + 'login/', { waitUntil: 'networkidle' });
  await pg.waitForSelector('#f-email');
  await pg.fill('#f-email', 'karim@example.com');
  await pg.fill('#f-pass', 'longenough');
  me = { signed_in: true, id: 'u4', email: 'karim@example.com', name: 'Karim', role: 'site-lead', status: 'active',
    sections: ['everyday', 'training', 'forms', 'sops', 'mine'], posthog: { key: '', host: '' } };
  await Promise.all([pg.waitForURL(u => /\/mine\//.test(u.toString()), { timeout: 8000 }).catch(() => {}), pg.click('#go')]);
  if (!/\/mine\//.test(pg.url())) problems.push('login: a site lead was sent to ' + pg.url() + ' instead of their own sites');
  await ctx.close();
}
await browser.close();
server.close();
if (problems.length) { console.log(problems.join('\n')); process.exitCode = 1; } else console.log('Interactions clean.');
