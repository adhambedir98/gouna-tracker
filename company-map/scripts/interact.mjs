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
  // the live-edit layer reaches the company database on every page; a machine with no route to it is not a page error
  pg.on('console', m => { if (m.type() === 'error' && !/net::ERR_/.test(m.text())) problems.push(`${url}: ${m.text()}`); });
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
  if (await pg.$('#f-channel, #f-hours, #f-hours_uploaded, #f-phones_uploaded, #f-backlog, #f-wearers_scheduled, #f-flags')) problems.push('report: a removed field is still on the form');
  await pg.fill('#f-phones_deployed', '80');
  await pg.fill('#f-wearers_present', '78');
  // the ledger: the morning's phones are already listed as a dropdown of 1 to 270; Enter on the last cell adds a row
  if ((await pg.$$eval('#phones tbody tr', r => r.length)) !== 2 || (await pg.inputValue('#phones tbody tr:nth-child(1) [data-ph=tag]')) !== '12' || (await pg.$$eval('#phones tbody tr:nth-child(1) [data-ph=tag] option', o => o.length)) !== 271) problems.push('report: the morning phones were not listed for the site');
  await pg.fill('#phones tbody tr:nth-child(1) [data-ph=total]', '4120');
  await pg.fill('#phones tbody tr:nth-child(1) [data-ph=local]', '35');
  await pg.fill('#phones tbody tr:nth-child(2) [data-ph=total]', '3980');
  await pg.fill('#phones tbody tr:nth-child(2) [data-ph=local]', '0');
  await pg.press('#phones tbody tr:nth-child(2) [data-ph=local]', 'Enter');
  // a phone picked twice is refused; the empty third row is dropped when sending
  await pg.selectOption('#phones tbody tr:nth-child(3) [data-ph=tag]', '12');
  await pg.waitForSelector('#toast.on');
  if ((await pg.inputValue('#phones tbody tr:nth-child(3) [data-ph=tag]')) !== '') problems.push('report: a phone could be listed twice');
  await pg.check('input[name="f-incident"][value="true"]');
  await pg.fill('#f-incident_text', 'Power cut 11:10 to 11:40.');
  await pg.fill('#f-code', 'testcode');
  await pg.reload({ waitUntil: 'networkidle' });
  if ((await pg.inputValue('#f-phones_deployed')) !== '80' || (await pg.$$eval('#phones tbody tr', r => r.length)) !== 2 || (await pg.inputValue('#phones tbody tr:nth-child(2) [data-ph=tag]')) !== '13') problems.push('report: the draft or the phone rows did not survive a reload');
  if (!(await pg.isChecked('input[name="f-incident"][value="true"]'))) problems.push('report: the incident choice did not survive a reload');
  await pg.screenshot({ path: out('x-report-390.png'), fullPage: true });
  await pg.click('#send');
  await pg.waitForSelector('#sent');
  if (!sent || !sent.p || !Array.isArray(sent.p.phones) || sent.p.phones.length !== 2 || sent.p.phones[0].tag !== '12' || sent.p.phones[0].total !== '4120' || sent.p.phones[0].local !== '35' || sent.p.wearers_present !== '78' || sent.p.phones_deployed !== '80' || sent.p.site_id !== A || sent.p.code !== 'testcode' || sent.p.reporter_id !== P1 || sent.p.reporter_other !== '' || sent.p.incident !== 'true' || sent.p.incident_text !== 'Power cut 11:10 to 11:40.') problems.push('report: the form sent ' + JSON.stringify(sent));
  const txt = await pg.$eval('#sent', e => e.textContent);
  if (!/Test factory/.test(txt) || !/2 phones/.test(txt) || !/10.2 hours/.test(txt) || !/5:40 PM/.test(txt) || !/In on time/.test(txt)) problems.push('report: the confirmation reads "' + txt.trim().slice(0, 160) + '"');
  await pg.screenshot({ path: out('x-report-sent-390.png'), fullPage: true });
  // the name, site, and code are remembered; the numbers are not
  await pg.click('#again');
  if ((await pg.inputValue('#f-reporter')) !== P1 || (await pg.inputValue('#f-code')) !== 'testcode' || (await pg.inputValue('#f-site')) !== A) problems.push('report: the name, site, or code were not remembered');
  if ((await pg.inputValue('#f-phones_deployed')) !== '' || (await pg.$$eval('#phones tbody tr', r => r.length)) !== 2 || (await pg.inputValue('#phones tbody tr:nth-child(1) [data-ph=total]')) !== '') problems.push('report: the numbers stayed, or the phones were not offered again, after sending');
  await pg.selectOption('#f-reporter', P1);
  // a wrong code is explained in plain words and the button comes back
  await pg.unroute('**/rest/v1/rpc/dr_submit');
  await pg.route('**/rest/v1/rpc/dr_submit', r => r.fulfill({ status: 400, json: { message: 'wrong team code' } }));
  await pg.fill('#f-phones_deployed', '10');
  await pg.fill('#phones tbody tr:nth-child(1) [data-ph=total]', '4200');
  await pg.fill('#phones tbody tr:nth-child(2) [data-ph=total]', '4000');
  await pg.click('#send');
  await pg.waitForSelector('#toast.on');
  const toastText = await pg.$eval('#toast', e => e.textContent);
  if (!/team code is wrong/.test(toastText)) problems.push('report: the wrong-code message reads "' + toastText + '"');
  if (await pg.$eval('#send', e => e.disabled)) problems.push('report: the send button stayed disabled after an error');
  await ctx.close();
}
// 15. company report: the code opens it, the totals and the missing list read from the database, the day moves, the text copy and the site list work
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  const pg = await ctx.newPage();
  pg.on('pageerror', e => problems.push(`report/day/: ${e}`));
  const site = (id, name, team, lead, report, checkin) => ({ id, name, team, lead, book: lead, active: true, report, checkin: checkin || null });
  const rep = { day: '2026-09-06', built_at: '2026-09-06 18:10', deadline: '18:00', checkin_deadline: '09:00', target_month: 25000, target_day: 833, month_hours: 4120, expected: 3, open_incidents: 2,
    morning: { checked_in: 2, late: 0, problems: 1, phones_deployed: 160, wearers_present: 158, wearers_scheduled: 165, phones_out: 1 },
    incidents: [{ id: 'i1', no: 1, site_id: 'a', site: 'Test factory', at: '11:10', kind: 'power', what: 'Power cut 11:10 to 11:40.', reporter: 'Karim', status: 'open', needs: null }],
    totals: { reported: 2, late: 1, hours: 940, hours_uploaded: 880, phones_deployed: 160, phones_uploaded: 150, backlog: 6, wearers_scheduled: 165, wearers_present: 158, phones_out: 3, flags: 2, incidents: 1 },
    teams: { direct: { expected: 2, reported: 2, checked_in: 2, hours: 940, hours_uploaded: 880, phones_deployed: 160, wearers_present: 158, phones_out: 3 }, partner: { expected: 1, reported: 0, checked_in: 0, hours: 0, hours_uploaded: 0, phones_deployed: 0, wearers_present: 0, phones_out: 0 } },
    sites: [
      site('a', 'Test factory', 'direct', 'Eyad', { reporter: 'Eyad', hours: 612, hours_uploaded: 580, phones_deployed: 80, phones_uploaded: 76, backlog: 4, wearers_scheduled: 80, wearers_present: 78, phones_out: 2, flags: 2, incident: true, problems: 'Power cut 11:10 to 11:40.', gear_needed: '3 caps', other: null, late: false, sent_at: '17:40', first_at: '17:40' }, { reporter: 'Eyad', started_at: '08:05', phones_deployed: 80, wearers_scheduled: 80, wearers_present: 78, phones_out: 1, ok: false, note: 'One charger dead.', late: false, first_at: '08:20' }),
      site('b', 'Test warehouse', 'direct', 'Hazem', { reporter: 'Hazem', hours: 328, hours_uploaded: 300, phones_deployed: 80, phones_uploaded: 74, backlog: 2, wearers_scheduled: 85, wearers_present: 80, phones_out: 1, flags: 0, incident: false, problems: null, gear_needed: null, other: 'One wearer out tomorrow.', late: true, sent_at: '18:25', first_at: '18:25' }, { reporter: 'Hazem', started_at: '08:00', phones_deployed: 80, wearers_scheduled: 85, wearers_present: 80, phones_out: 0, ok: true, note: null, late: false, first_at: '08:30' }),
      site('c', 'Partner farm', 'partner', 'Shady', null)
    ],
    month: { hours: 4120, base: 0, target: 25000, days_in: 30, days_gone: 6, per_day_needed: 870, per_day: 900, projected: 20600 },
    days: Array.from({ length: 30 }, (_, i) => { const dd = new Date('2026-08-08T12:00:00'); dd.setDate(dd.getDate() + i); const day = dd.toISOString().slice(0, 10); const has = i >= 24 && i !== 27;
      const hours = !has ? 0 : i === 29 ? 940 : i === 28 ? 900 : 700 + i * 8; const phones = !has ? 0 : i === 29 ? 160 : 150; const present = !has ? 0 : i === 29 ? 158 : 160;
      return { day, has, checked_in: has ? (i === 29 ? 2 : 3) : 0, reported: has ? (i === 29 ? 2 : 3) : 0, expected: 3, hours, hours_uploaded: has ? hours - 60 : 0, phones_deployed: phones, wearers_present: present, phones_out: has ? 1 : 0, flags: i === 29 ? 2 : 0, incidents: i === 29 ? 1 : 0, problems: i === 29 ? 1 : 0, phones_morning: phones, wearers_morning: present }; }) };
  rep.sites[0].week = [0, 0, 600, 610, 0, 600, 612]; rep.sites[0].phones_week = [0, 0, 80, 80, 0, 80, 80];
  rep.sites[1].week = [0, 0, 300, 320, 0, 300, 328]; rep.sites[1].phones_week = [0, 0, 70, 70, 0, 70, 80];
  rep.sites[2].week = [0, 0, 0, 0, 0, 0, 0]; rep.sites[2].phones_week = [0, 0, 0, 0, 0, 0, 0];
  const calls = [];
  await pg.route('**/rest/v1/rpc/dr_report', r => { const b = r.request().postDataJSON(); calls.push(b); if (b.p_code !== 'goodcode') return r.fulfill({ status: 400, json: { message: 'wrong code' } }); r.fulfill({ json: rep }); });
  await pg.route('**/rest/v1/rpc/dr_admin', r => { const b = r.request().postDataJSON(); calls.push(b);
    if (b.p_action === 'sites') return r.fulfill({ json: rep.sites.map(s => ({ id: s.id, name: s.name, team: s.team, lead: s.lead, active: s.active, status: s.active ? 'active' : 'paused', sort: 0 })) });
    if (b.p_action === 'settings') return r.fulfill({ json: { team_code: 'kmsc', deadline: '18:00', checkin_deadline: '09:00', targets: '{"2026-09":25000}', month_base: '{"2026-09":19500}', slack_webhook: '' } });
    if (b.p_action === 'log') return r.fulfill({ json: [{ at: '2026-09-06 17:40', kind: 'report', what: 'Daily report, Test factory, 06 Sep: 612 hours, incident', who: 'Eyad', site: 'Test factory' }] });
    r.fulfill({ json: { ok: true } }); });
  await pg.goto(base + 'report/day/#2026-09-06', { waitUntil: 'networkidle' });
  if (!(await pg.$('#gate'))) problems.push('company report: no code gate');
  await pg.fill('#g-code', 'badcode');
  await pg.click('#gate button');
  await pg.waitForSelector('#gate .callout');
  await pg.fill('#g-code', 'goodcode');
  await pg.click('#gate button');
  await pg.waitForSelector('#rep');
  // the five: phones active, hours, per phone, opt-in, present against filming; each with a sparkline drawn at the tile's width
  const big = await pg.$$eval('.kpi .big', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  if (big.join('|') !== '160|940|5.9|101%|158 present160 filming') problems.push('company report: the five read ' + JSON.stringify(big));
  const ctxLines = await pg.$$eval('.kpi .ctx', els => els.map(e => e.textContent.trim()));
  if (ctxLines[1] !== '' || ctxLines[2] !== '5.2 needed for the target' || ctxLines[4] !== '2 more phones than people') problems.push('company report: the tile context lines read ' + JSON.stringify(ctxLines));
  const cmp = await pg.$$eval('.kpi .cmp', els => els.map(e => e.textContent.trim()));
  if (!/^7 day average 900, month 900$/.test(cmp[1]) || !/^last 7 days: 150 of 160 filming$/.test(cmp[4])) problems.push('company report: the comparison lines read ' + JSON.stringify(cmp));
  if ((await pg.$$eval('.kpi svg.ch-spark', els => els.length)) !== 4) problems.push('company report: the tiles have no sparklines');
  const sparkW = await pg.$eval('.kpi svg.ch-spark', e => e.getAttribute('viewBox').split(' ')[2]);
  if (Number(sparkW) < 90 || Number(sparkW) > 200) problems.push('company report: the sparkline is not drawn at the tile width (' + sparkW + ')');
  const headline = await pg.$eval('.headline', e => e.textContent.trim());
  if (headline !== '940 hours from 160 phones at 2 of 3 sites. Partner farm did not report and counts as zero.') problems.push('company report: the headline reads "' + headline + '"');
  const boxes = await pg.$$eval('.stat .big', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  if (boxes.slice(0, 12).join('|') !== '2 / 3|160|158|1|1|0|2 / 3|880|6|2|1|1') problems.push('company report: the morning and evening boxes read ' + JSON.stringify(boxes));
  if ((await pg.$$eval('.trend-grid:not(.bysite) .trend svg.ch', els => els.length)) !== 6) problems.push('company report: the six trend charts are not drawn');
  if ((await pg.$$eval('.trend-grid.bysite .trend svg.ch', els => els.length)) !== 4) problems.push('company report: the four by-site charts are not drawn');
  if ((await pg.$$eval('#rep p', els => els.filter(e => !e.closest('.trend') && e.textContent.trim().length > 140).length)) !== 0) problems.push('company report: a long paragraph is back on the page');
  // needs attention: the missing site first, then the late one, then the site with the incident (a past day, so nothing is softened to "not in yet")
  const attn = await pg.$$eval('.attn > li', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  if (attn.length !== 3 || !/^Partner farm/.test(attn[0]) || !/Counted as zero, call Shady\./.test(attn[0]) || !/no check-in/.test(attn[0]) || !/^Test warehouse/.test(attn[1]) || !/Report at 6:25 PM, 25 minutes late\./.test(attn[1]) || !/1 phone down\./.test(attn[1]) || !/^Test factory/.test(attn[2]) || !/incident/.test(attn[2]) || !/Power cut/.test(attn[2]) || !/morning problem/.test(attn[2]) || !/One charger dead/.test(attn[2]) || !/2 QC flags/.test(attn[2]) || !/Needs: 3 caps\./.test(attn[2])) problems.push('company report: needs attention reads ' + JSON.stringify(attn));
  if ((await pg.$$eval('.attn .pill', els => els.filter(e => e.textContent === 'morning problem').length)) !== 1) problems.push('company report: the site with a morning problem has no mark');
  // the month: the ring and thirty bars, every day a link
  if (!(await pg.$('.ring-host svg.ch-ring'))) problems.push('company report: no month ring');
  const monthBoxes = await pg.$$eval('.month-stat .big', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  if (monthBoxes.join('|') !== '6 / 30|870|20,600|900') problems.push('company report: the month boxes read ' + JSON.stringify(monthBoxes));
  if ((await pg.$$eval('[data-chart="t:hours"] a[data-day]', els => els.length)) !== 30) problems.push('company report: the hours-per-day bars are not thirty day links');
  if ((await pg.$$eval('[data-chart="t:hours"] .ch-cell.none', els => els.length)) !== 0 || (await pg.$$eval('[data-chart="t:hours"] .ch-cell.some', els => els.length)) !== 1) problems.push('company report: the sites-in cells are wrong');
  // by site: two charts with the same rows, uploaded solid and recorded outlined, present against filming
  if ((await pg.$$eval('[data-chart=siteBars] .ch-bar.outline', els => els.length)) !== 2 || (await pg.$$eval('[data-chart=siteDots] .ch-dot.hollow', els => els.length)) !== 2) problems.push('company report: the by-site charts are not drawn');
  const bySite = await pg.$eval('.bysite', e => e.textContent.replace(/\s+/g, ' '));
  if (!/Test factory/.test(bySite) || !/612/.test(bySite) || !/7\.7/.test(bySite) || !/103%/.test(bySite) || !/2 phones over people/.test(bySite) || !/not in/.test(bySite)) problems.push('company report: the by-site charts read ' + JSON.stringify(bySite.slice(0, 300)));
  if ((await pg.$$eval('.t.rep td .chart svg.ch-strip', els => els.length)) !== 3) problems.push('company report: the site rows have no week strips');
  if ((await pg.$$eval('.t.rep td.flags', els => els.map(e => e.textContent.trim()).join('|'))) !== '2||') problems.push('company report: the flags column is wrong');
  if ((await pg.$$eval('#rep table.t.rep', els => els.length)) !== 3) problems.push('company report: expected the team, site, and incident tables');
  if (!(await pg.$('#rep .pill.st-open'))) problems.push('company report: the filed incident is not listed');
  if (!(await pg.$('.pill.late'))) problems.push('company report: the late site has no mark');
  if ((await pg.$$eval('.pill', els => els.filter(e => e.textContent === 'incident').length)) !== 2) problems.push('company report: the incident site has no mark');
  const notes = await pg.$$eval('.notes-block h3', els => els.map(e => e.textContent));
  if (notes.join(',') !== 'Incident lines on the evening check-outs,What the sites need,Anything else') problems.push('company report: the note blocks are ' + notes.join(','));
  await pg.screenshot({ path: out('x-company-report.png'), fullPage: true });
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
  if (!/^Company report, /.test(text) || !/^940 hours from 160 phones at 2 of 3 sites\. Partner farm did not report and counts as zero\.$/m.test(text) || !/^Phones active 160 \(160 this morning\)\. Hours 940 of 833 target \(113%\)\. Per phone 5\.9\. Opt-in 101%, 158 present, 160 filming\. Sites in 2 of 3\.$/m.test(text) || !/^This month: 4,120 of 25,000, day 6 of 30, need 870 a day, on pace for 20,600\.$/m.test(text) || !/^Partner farm: not in, no check-in, counted as zero, call Shady$/m.test(text) || !/^Test factory, Eyad, check-in 8:05 AM, report 5:40 PM: 612 hours, 580 uploaded, 80 phones, 2 down, 2 flags, incident$/m.test(text) || !/Incidents:\n1\. Test factory, Power or internet down, open: Power cut/.test(text) || !/Incident lines on the evening check-outs:\nTest factory: Power cut/.test(text)) problems.push('company report: the text copy reads "' + text.slice(0, 400).replace(/\n/g, ' | ') + '"');
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
    if (b.p_code !== 'goodcode') return r.fulfill({ status: 400, json: { message: 'wrong code' } });
    if (b.p_action === 'sites') return r.fulfill({ json: list });
    if (b.p_action === 'people') return r.fulfill({ json: [{ id: 'p1', name: 'Eyad', role: 'portfolio-manager', team: 'direct', site_id: null, active: true }, { id: 'p2', name: 'Karim', role: 'site-lead', team: 'direct', site_id: 'a', active: true }, { id: 'p3', name: 'Old Sam', role: 'site-lead', team: 'direct', site_id: null, active: false }] });
    if (b.p_action === 'site_history') return r.fulfill({ json: { month_hours: 3120, days_reported: 5, reports: [{ day: '2026-09-06', reporter: 'Karim', hours: 612, hours_uploaded: 580, phones_deployed: 80, phones_uploaded: 76, backlog: 4, wearers_present: 78, wearers_scheduled: 80, phones_out: 2, flags: 1, incident: true, late: false, first_at: '17:40' }], checkins: [{ day: '2026-09-06', reporter: 'Karim', started_at: '08:05', phones_deployed: 80, wearers_present: 78, ok: true, note: null, late: false }], incidents: [{ no: 1, day: '2026-09-06', kind: 'power', what: 'Power cut.', status: 'open', reporter: 'Karim' }], people: [{ id: 'p2', name: 'Karim', role: 'site-lead', phone: null, active: true }] } });
    r.fulfill({ json: { ok: true } }); });
  await pg.goto(base + 'sites/', { waitUntil: 'networkidle' });
  await pg.fill('#g-code', 'goodcode');
  await pg.click('#gate button');
  await pg.waitForSelector('#reg');
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
// 17. morning check-in: picking a partner picks the site, the form sends one JSON, the answer shows the phones and the problem
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
  if (await pg.$('#f-code, #f-channel, #f-wearers_scheduled')) problems.push('check-in: the form still asks for a code, a channel, or scheduled wearers');
  await pg.fill('#f-started_at', '08:05');
  if (await pg.$('#f-phones_deployed')) problems.push('check-in: the phones count is still typed instead of listed');
  await pg.selectOption('#phones tbody tr:nth-child(1) [data-ph=tag]', '7');
  await pg.fill('#phones tbody tr:nth-child(1) [data-ph=total]', '4000');
  await pg.fill('#phones tbody tr:nth-child(1) [data-ph=local]', '0');
  await pg.press('#phones tbody tr:nth-child(1) [data-ph=local]', 'Enter');
  await pg.selectOption('#phones tbody tr:nth-child(2) [data-ph=tag]', '9');
  await pg.fill('#phones tbody tr:nth-child(2) [data-ph=total]', '3900');
  await pg.fill('#phones tbody tr:nth-child(2) [data-ph=local]', '10');
  await pg.fill('#f-wearers_present', '38');
  await pg.fill('#f-phones_active', '3');   // the typed count stands, even with two phones listed
  await pg.check('input[name="f-problem"][value="true"]');
  await pg.fill('#f-note', 'One charger dead.');
  await pg.screenshot({ path: out('x-checkin-390.png'), fullPage: true });
  await pg.click('#send');
  await pg.waitForSelector('#sent');
  if (!sent || !sent.p || sent.p.site_id !== B || sent.p.reporter_id !== P3 || sent.p.started_at !== '08:05' || sent.p.phones_deployed !== '3' || !Array.isArray(sent.p.phones) || sent.p.phones.length !== 2 || sent.p.phones[1].tag !== '9' || sent.p.phones[1].local !== '10' || sent.p.problem !== 'true' || sent.p.note !== 'One charger dead.' || 'code' in sent.p) problems.push('check-in: the form sent ' + JSON.stringify(sent));
  const txt = await pg.$eval('#sent', e => e.textContent);
  if (!/Partner farm/.test(txt) || !/2 phones recording/.test(txt) || !/In on time/.test(txt) || !/The problem is on the company report/.test(txt)) problems.push('check-in: the confirmation reads "' + txt.trim().slice(0, 200) + '"');
  await pg.click('#again');
  if ((await pg.inputValue('#f-reporter')) !== P3) problems.push('check-in: the name was not remembered');
  // the phones the site used are offered again, without their minutes; the evening form on this device sees the same list
  if ((await pg.$$eval('#phones tbody tr', r => r.length)) !== 2 || (await pg.inputValue('#phones tbody tr:nth-child(2) [data-ph=tag]')) !== '9' || (await pg.inputValue('#phones tbody tr:nth-child(2) [data-ph=total]')) !== '') problems.push('check-in: the phones were not offered again after sending');
  const remembered = await pg.evaluate(() => JSON.parse(localStorage.getItem('vm.report.phones') || '{}'));
  if (!remembered[B] || remembered[B].join(',') !== '7,9') problems.push('check-in: the phones were not remembered on the device: ' + JSON.stringify(remembered));
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
  await pg.fill('#f-code', 'testcode');
  await pg.screenshot({ path: out('x-incident-390.png'), fullPage: true });
  await pg.click('#send');
  await pg.waitForSelector('#sent');
  if (!sent || !sent.p || sent.p.site_id !== '' || sent.p.place !== 'Hub 1' || sent.p.reporter_other !== 'Karim' || sent.p.kind !== 'power' || sent.p.what !== 'Power cut 11:10 to 11:40. Upload paused.' || sent.p.open !== 'true' || sent.p.code !== 'testcode') problems.push('incident: the form sent ' + JSON.stringify(sent));
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
    if (b.p_code !== 'goodcode') return r.fulfill({ status: 400, json: { message: 'wrong code' } });
    if (b.p_action === 'incidents') return r.fulfill({ json: rows });
    r.fulfill({ json: { ok: true } }); });
  await pg.goto(base + 'report/incidents/', { waitUntil: 'networkidle' });
  await pg.fill('#g-code', 'goodcode');
  await pg.click('#gate button');
  await pg.waitForSelector('#inc');
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
// 20. team: the code opens it, the counts and filters read the list, a row opens its form, a save and an add send the fields
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => problems.push(`team/: ${e}`));
  const calls = [];
  const people = [
    { id: 'p1', name: 'Eyad', role: 'portfolio-manager', team: 'direct', site_id: null, site: null, phone: '0100', notes: null, active: true, sort: 1 },
    { id: 'p2', name: 'Karim', role: 'site-lead', team: 'direct', site_id: 'a', site: 'Test factory', phone: null, notes: 'Started in August.', active: true, sort: 2 },
    { id: 'p3', name: 'Shady', role: 'partner', team: 'partner', site_id: 'b', site: 'Partner farm', phone: null, notes: null, active: true, sort: 3 },
    { id: 'p4', name: 'Sam', role: 'operator', team: 'direct', site_id: 'a', site: 'Test factory', phone: null, notes: null, active: false, sort: 4 }
  ];
  await pg.route('**/rest/v1/rpc/dr_admin', r => { const b = r.request().postDataJSON(); calls.push(b);
    if (b.p_code !== 'goodcode') return r.fulfill({ status: 400, json: { message: 'wrong code' } });
    if (b.p_action === 'people') return r.fulfill({ json: people });
    if (b.p_action === 'sites') return r.fulfill({ json: [{ id: 'a', name: 'Test factory', team: 'direct', status: 'active' }, { id: 'b', name: 'Partner farm', team: 'partner', status: 'active' }, { id: 'd', name: 'Old shop', team: 'direct', status: 'closed' }] });
    r.fulfill({ json: { ok: true } }); });
  await pg.goto(base + 'team/', { waitUntil: 'networkidle' });
  await pg.fill('#g-code', 'goodcode');
  await pg.click('#gate button');
  await pg.waitForSelector('#team');
  const big = await pg.$$eval('.stat .big', els => els.map(e => e.textContent.trim()));
  if (big.join(',') !== '1,1,1,0,3') problems.push('team: the counts read ' + big.join(','));
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
  await pg.route('**/rest/v1/dr_edits?*', r => r.fulfill({ json: [{ id: 'e1', page: 'rules', lang: 'en', kind: 'text', before: 'Rules', after: 'House rules' }] }));
  await pg.route('**/rest/v1/rpc/dr_edit', r => { const b = r.request().postDataJSON(); calls.push(b); if (b.p_code !== 'goodcode') return r.fulfill({ status: 400, json: { message: 'wrong code' } }); r.fulfill({ json: { ok: true, id: 'e2' } }); });
  await pg.goto(base + 'rules/', { waitUntil: 'networkidle' });
  await pg.waitForFunction(() => document.querySelector('#head h1') && document.querySelector('#head h1').textContent === 'House rules');
  await pg.click('#edit');
  // the code and the name are asked in a box on the page, never in a browser dialog
  await pg.waitForSelector('#ask-box input');
  if ((await pg.$eval('#ask-box input', e => e.type)) !== 'password') problems.push('edit: the code box is not a password field');
  await pg.fill('#ask-box input', 'goodcode');
  await pg.keyboard.press('Enter');
  await pg.waitForSelector('#ask-box input');
  await pg.fill('#ask-box input', 'Adham');
  await pg.click('#ask-box [type=submit]');
  await pg.waitForSelector('body.editing');
  if (await pg.$('#ask-box')) problems.push('edit: the box stayed open');
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
  if (!sent || sent.p.page !== 'rules' || sent.p.lang !== 'en' || sent.p.before !== 'Rules' || sent.p.after !== 'The rules' || sent.p.who !== 'Adham') problems.push('edit: the change sent ' + JSON.stringify(sent));
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
  // a wrong code: the change is thrown back, edit mode ends, and the box asks again next time
  await pg.evaluate(() => localStorage.removeItem('vm.report.code'));
  await pg.click('#edit');
  await pg.waitForSelector('#ask-box input'); await pg.fill('#ask-box input', 'badcode'); await pg.keyboard.press('Enter');
  await pg.waitForSelector('body.editing');
  await (await pg.$('#head h1 .ed')).click();
  await pg.keyboard.press('Control+A');
  await pg.keyboard.type('Nope');
  await pg.keyboard.press('Enter');
  await pg.waitForFunction(() => !document.body.classList.contains('editing'));
  if (!/wrong/i.test(await pg.evaluate(() => document.getElementById('toast').textContent))) problems.push('edit: no wrong-code message');
  if ((await pg.$eval('#head h1', e => e.textContent.trim())) === 'Nope') problems.push('edit: the rejected change stayed on the page');
  await pg.click('#edit');
  if (!(await pg.$('#ask-box input'))) problems.push('edit: the code box did not come back after a wrong code');
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
  await pg.route('**/rest/v1/dr_edits?*', r => r.fulfill({ json: rows }));
  await pg.route('**/rest/v1/rpc/dr_edit', r => { const b = r.request().postDataJSON(); calls.push(b); r.fulfill({ json: { ok: true, id: 'n' + calls.length } }); });
  await pg.goto(base + 'rules/', { waitUntil: 'networkidle' });
  await pg.waitForFunction(() => document.querySelector('#integrity') && document.querySelector('#integrity').classList.contains('bk-off'));
  if (await pg.$eval('#integrity', e => e.offsetParent !== null)) problems.push('sections: the hidden section still shows to readers');
  const order = () => pg.$$eval('#content > section', s => s.map(e => e.id));
  if (JSON.stringify(await order()) !== JSON.stringify(['pay', 'integrity', 'conduct', 'floor'])) problems.push('sections: the order row did not apply: ' + (await order()).join(','));
  await pg.click('#edit');
  await pg.waitForSelector('#ask-box input'); await pg.fill('#ask-box input', 'goodcode'); await pg.keyboard.press('Enter');
  await pg.waitForSelector('#ask-box input'); await pg.fill('#ask-box input', 'Adham'); await pg.keyboard.press('Enter');
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
  if (!hid || hid.p.page !== 'rules' || hid.p.before !== '#conduct' || hid.p.after !== 'Attendance and behavior' || hid.p.who !== 'Adham') problems.push('sections: the hide row sent ' + JSON.stringify(hid));
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
  await pg.route('**/rest/v1/dr_edits?*', r => r.fulfill({ json: rows }));
  await pg.route('**/rest/v1/rpc/dr_edit', r => r.fulfill({ json: { ok: true, id: 'x' } }));
  await pg.goto(base + 'forms/', { waitUntil: 'networkidle' });
  await pg.waitForFunction(() => document.querySelector('#content .bk-off'));
  const hidden = await pg.$$eval('#content .bk-off', els => els.map(e => e.querySelector('h3, h2, b, strong')?.textContent.trim()));
  if (!hidden.includes('Morning check-in')) problems.push('keys: the card under the moved grid was not found: ' + hidden.join(','));
  if (hidden.includes('Incident report')) problems.push('keys: a stale key hid the wrong card');
  const grids = await pg.$$eval('#content .cards', g => g.map(e => e.querySelector('h3')?.textContent.trim()));
  if (grids[0] !== 'Company report') problems.push('keys: the sections did not swap: ' + grids.join(','));
  await ctx.close();
}
// 23. the edits page: every kind of row reads in words, and Undo asks for the code in a box on the page
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => problems.push(`edits page: ${e}`));
  pg.on('dialog', d => { problems.push('edits page: a browser dialog opened'); d.dismiss(); });
  const calls = [];
  await pg.route('**/rest/v1/dr_edits?*', r => r.fulfill({ json: [
    { id: 'a', page: 'rules', lang: 'en', kind: 'text', before: 'Rules', after: 'The rules', who: 'Adham', at: '2026-09-07T10:00:00Z', applied: false },
    { id: 'b', page: 'rules', lang: 'all', kind: 'hide', before: '#integrity', after: 'Integrity', who: 'Youssif', at: '2026-09-07T09:00:00Z', applied: false },
    { id: 'c', page: 'jobs', lang: 'all', kind: 'delete', before: 'section:2', after: 'Quality', who: 'Youssif', at: '2026-09-07T08:00:00Z', applied: false },
    { id: 'd', page: 'rules', lang: 'all', kind: 'order', before: 'root', after: JSON.stringify({ keys: ['section:4', '#floor'], labels: ['Pay, rewards, and penalties', 'At the site'] }), who: 'Adham', at: '2026-09-07T07:00:00Z', applied: true }
  ] }));
  await pg.route('**/rest/v1/rpc/dr_edit', r => { calls.push(r.request().postDataJSON()); r.fulfill({ json: { ok: true } }); });
  await pg.goto(base + 'edits/', { waitUntil: 'networkidle' });
  await pg.waitForSelector('#edits tbody tr');
  const text = await pg.$eval('#edits tbody', e => e.textContent);
  for (const need of ['The rules', 'Section hidden', 'Integrity', 'Section deleted', 'Quality', 'Sections moved', 'Pay, rewards, and penalties, At the site']) if (!text.includes(need)) problems.push(`edits page: "${need}" is not on the page`);
  if ((await pg.$$eval('[data-undo]', b => b.length)) !== 3) problems.push('edits page: Undo should show on the three live rows only');
  await pg.click('[data-undo="b"]');
  await pg.waitForSelector('#ask-box input'); await pg.fill('#ask-box input', 'goodcode'); await pg.keyboard.press('Enter');
  await pg.waitForSelector('#toast.on');
  if (!calls.find(c => c.p_action === 'delete' && c.p.id === 'b' && c.p_code === 'goodcode')) problems.push('edits page: Undo did not send the delete: ' + JSON.stringify(calls));
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
// 25. dashboard: the code opens it, every phone is a dot at its site in its color, a site without a place stays in the list, a row or a marker lists the site's phones, a window chip asks the database again
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => problems.push(`dashboard/: ${e}`));
  const calls = [];
  const site = (id, name, team, status, extra) => ({ id, name, team, status, city: null, area: null, lat: null, lng: null, phones: 0, green: 0, yellow: 0, red: 0, none: 0, hours_day: null, last_in: null, last_out: null, ...extra });
  const phone = (tag, site_id, hours_day, extra) => ({ tag, site_id, hours_day, days: hours_day == null ? 0 : 5, today: hours_day, last_day: '2026-09-06', last_kind: hours_day == null ? 'morning' : 'evening', total: 4120, local: 35, status: hours_day == null ? 'none' : hours_day >= 5 ? 'green' : hours_day >= 3 ? 'yellow' : 'red', ...extra });
  const body = { day: '2026-09-06', window: 7,
    sites: [site('a', 'Test factory', 'direct', 'active', { city: 'Cairo', phones: 4, green: 2, yellow: 1, red: 1, hours_day: 3.9, last_in: '2026-09-06', last_out: '2026-09-06' }),
      site('b', 'Partner farm', 'partner', 'active', { name: 'Partner farm, Tanta', phones: 2, none: 2, last_in: '2026-09-06' }),
      site('c', 'Nowhere yet', 'direct', 'agreed', {}),
      site('d', 'Pinned plant', 'direct', 'active', { lat: 27.9, lng: 34.33, phones: 1, green: 1, hours_day: 6.2, last_in: '2026-09-06', last_out: '2026-09-06' })],
    phones: [phone('12', 'a', 5.4), phone('13', 'a', 5.0), phone('14', 'a', 3.2), phone('15', 'a', 1.9), phone('7', 'b', null), phone('9', 'b', null), phone('200', 'd', 6.2)] };
  await pg.route('**/rest/v1/rpc/dr_map', r => { const b = r.request().postDataJSON(); calls.push(b); if (b.p_code !== 'goodcode') return r.fulfill({ status: 400, json: { message: 'wrong code' } }); r.fulfill({ json: body }); });
  await pg.goto(base + 'dashboard/', { waitUntil: 'networkidle' });
  await pg.fill('#g-code', 'goodcode');
  await pg.click('#gate button');
  await pg.waitForSelector('#map svg');
  if (calls[0].p_days !== 7) problems.push('dashboard: the first call asked for ' + calls[0].p_days + ' days');
  const big = await pg.$$eval('.stat .big', els => els.map(e => e.textContent.trim()).join(','));
  if (big !== '7,3,1,1,4.3') problems.push('dashboard: the numbers read ' + big);
  const dots = await pg.evaluate(() => ['.dot', '.dot.g', '.dot.y', '.dot.r', '.dot.n', '.site'].map(c => document.querySelectorAll('.egypt ' + c).length).join(','));
  if (dots !== '7,3,1,1,2,3') problems.push('dashboard: the map holds ' + dots + ' (dots, green, yellow, red, grey, sites)');
  if ((await pg.$$('.site-card')).length !== 4) problems.push('dashboard: there is not one card per open site');
  if (!(await pg.$eval('.site-card[data-id="c"]', e => /not on the map/.test(e.textContent)))) problems.push('dashboard: a site with no place is not marked on its card');
  if (await pg.$('.egypt .site[data-site="c"]')) problems.push('dashboard: a site with no place was drawn');
  const cnt = await pg.$eval('.site-card[data-id="a"] .sc-head', e => e.textContent.replace(/\s+/g, ' ').trim());
  for (const need of ['Test factory', 'Direct', 'Cairo', 'Active', '2', '1', '3.9']) if (!cnt.includes(need)) problems.push(`dashboard: the card summary "${cnt}" has no ${need}`);
  // a card opens on a click, shows its phones, and marks its site on the map; a second click closes it
  if (await pg.$('.site-card.on')) problems.push('dashboard: a card is open before anything is clicked');
  await pg.click('.site-card[data-id="a"] .sc-head');
  if ((await pg.$$('.site-card.on .phones tbody tr')).length !== 4) problems.push('dashboard: opening a card did not list its phones');
  if (!(await pg.$eval('.site-card.on .phones tbody tr:nth-child(4)', e => /15/.test(e.textContent) && /1\.9/.test(e.textContent)))) problems.push('dashboard: the phone rows do not carry the tag and the hours');
  if ((await pg.$eval('.site-card[data-id="a"] .sc-head', e => e.getAttribute('aria-expanded'))) !== 'true') problems.push('dashboard: the open card is not marked open for a screen reader');
  if (!(await pg.$eval('.egypt .site[data-site="a"]', e => e.classList.contains('on')))) problems.push('dashboard: the picked site is not marked on the map');
  await pg.click('.site-card[data-id="a"] .sc-head');
  if (await pg.$('.site-card.on')) problems.push('dashboard: clicking the open card again did not close it');
  await pg.click('.egypt .site[data-site="b"] .dot');   // a click on a phone dot counts as a click on its site
  if ((await pg.$$('.site-card.on .phones tbody tr')).length !== 2) problems.push('dashboard: clicking a marker did not open that site\'s card');
  if ((await pg.$eval('.site-card.on', e => e.dataset.id)) !== 'b') problems.push('dashboard: the marker opened the wrong card');
  if (!(await pg.$eval('.site-card.on', e => /No evening reading yet/.test(e.textContent)))) problems.push('dashboard: a phone with no evening reading is not said so');
  // the map carries its furniture: a scale bar, a north arrow, the grid, the roads, the towns
  const furniture = await pg.evaluate(() => ['.scale', '.north', '.grid', '.road', '.town', '.sea'].map(c => document.querySelectorAll('.egypt ' + c).length));
  if (furniture.some(v => !v)) problems.push('dashboard: the map is missing furniture (scale, north, grid, road, town, sea): ' + furniture.join(','));
  await pg.click('[data-days="14"]');
  await pg.waitForFunction(() => document.querySelector('[data-days="14"]')?.classList.contains('on'));
  if (calls[calls.length - 1].p_days !== 14) problems.push('dashboard: the 14 day chip sent ' + JSON.stringify(calls[calls.length - 1]));
  await pg.screenshot({ path: out('x-dashboard-1280.png'), fullPage: true });
  await ctx.close();
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pg2 = await ctx2.newPage();
  pg2.on('pageerror', e => problems.push(`dashboard/ (phone): ${e}`));
  await pg2.route('**/rest/v1/rpc/dr_map', r => r.fulfill({ json: body }));
  await pg2.goto(base + 'dashboard/', { waitUntil: 'networkidle' });
  await pg2.fill('#g-code', 'goodcode');
  await pg2.click('#gate button');
  await pg2.waitForSelector('#map svg');
  if (await pg2.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)) problems.push('dashboard: the phone view scrolls sideways');
  await pg2.screenshot({ path: out('x-dashboard-390.png'), fullPage: true });
  await ctx2.close();
}
await browser.close();
server.close();
if (problems.length) { console.log(problems.join('\n')); process.exitCode = 1; } else console.log('Interactions clean.');
