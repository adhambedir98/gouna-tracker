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
  await pg.fill('#hours-direct', '2000');
  await pg.dispatchEvent('#hours-direct', 'input');
  await pg.fill('#hours-partner', '1000');
  await pg.dispatchEvent('#hours-partner', 'input');
  await pg.waitForTimeout(50);
  const bigs = await pg.$$eval('#readout .readout', els => els.map(e => [...e.querySelectorAll('.big')].map(b => b.textContent)));
  // direct: 600 phones and 60 operators; partners: 300 phones and no operator cell; total: 900 phones, 60 operators
  if (bigs[0][0] !== '600' || bigs[0][1] !== '60') problems.push(`calculator: direct operations gave ${bigs[0].join(',')}`);
  if (bigs[1][0] !== '300' || bigs[1].length !== bigs[0].length - 1) problems.push(`calculator: delivery partners gave ${bigs[1].join(',')}`);
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
  if (nums !== '1,2,3,4,5,6,7,8') problems.push('progress: the sections are numbered "' + nums + '"');
  if (await pg.$('.rail .sg .gn')) problems.push('progress: a subsection was numbered');
  await pg.goto(base + 'call/', { waitUntil: 'networkidle' });
  await pg.waitForTimeout(1800);
  if (!/^2 of/.test(await count())) problems.push('progress: a short page did not count once it was on screen (' + await count() + ')');
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
  await pg.route('**/rest/v1/dr_sites*', r => r.fulfill({ json: [{ id: A, name: 'Test factory', team: 'direct', lead: 'Eyad' }, { id: B, name: 'Partner farm', team: 'partner', lead: 'Shady' }] }));
  await pg.route('**/rest/v1/rpc/dr_submit', r => { sent = r.request().postDataJSON(); r.fulfill({ json: { ok: true, site: 'Test factory', day: '2026-09-06', hours: 612, late: false, sent_at: '17:40', updated: false } }); });
  await pg.goto(base + 'report/', { waitUntil: 'networkidle' });
  const groups = await pg.$$eval('#f-site optgroup', els => els.map(e => e.label).join(','));
  if (groups !== 'Our sites,Partner sites') problems.push('report: the site groups are "' + groups + '"');
  await pg.fill('#f-name', 'Eyad');
  await pg.selectOption('#f-site', A);
  await pg.fill('#f-hours', '612');
  await pg.fill('#f-phones_recording', '78');
  await pg.fill('#f-problems', 'Power cut 11:10 to 11:40.');
  await pg.fill('#f-code', 'testcode');
  await pg.reload({ waitUntil: 'networkidle' });
  if ((await pg.inputValue('#f-hours')) !== '612') problems.push('report: the draft did not survive a reload');
  await pg.screenshot({ path: out('x-report-390.png'), fullPage: true });
  await pg.click('#send');
  await pg.waitForSelector('#sent');
  if (!sent || !sent.p || sent.p.hours !== '612' || sent.p.site_id !== A || sent.p.code !== 'testcode' || sent.p.reporter !== 'Eyad' || sent.p.problems !== 'Power cut 11:10 to 11:40.') problems.push('report: the form sent ' + JSON.stringify(sent));
  const txt = await pg.$eval('#sent', e => e.textContent);
  if (!/Test factory/.test(txt) || !/612/.test(txt) || !/5:40 PM/.test(txt) || !/In on time/.test(txt)) problems.push('report: the confirmation reads "' + txt.trim().slice(0, 160) + '"');
  await pg.screenshot({ path: out('x-report-sent-390.png'), fullPage: true });
  // the name, site, and code are remembered; the numbers are not
  await pg.click('#again');
  if ((await pg.inputValue('#f-name')) !== 'Eyad' || (await pg.inputValue('#f-code')) !== 'testcode' || (await pg.inputValue('#f-site')) !== A) problems.push('report: the name, site, or code were not remembered');
  if ((await pg.inputValue('#f-hours')) !== '') problems.push('report: the hours stayed after sending');
  // a wrong code is explained in plain words and the button comes back
  await pg.unroute('**/rest/v1/rpc/dr_submit');
  await pg.route('**/rest/v1/rpc/dr_submit', r => r.fulfill({ status: 400, json: { message: 'wrong team code' } }));
  await pg.fill('#f-hours', '10');
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
  const site = (id, name, team, lead, report) => ({ id, name, team, lead, active: true, report });
  const rep = { day: '2026-09-06', built_at: '2026-09-06 18:10', deadline: '18:00', target_month: 25000, target_day: 833, month_hours: 4120, expected: 3,
    totals: { reported: 2, late: 1, hours: 940, phones_recording: 150, phones_out: 3, workers: 160, backlog: 2, flags: 2 },
    teams: { direct: { expected: 2, reported: 2, hours: 940, phones_recording: 150, phones_out: 3, workers: 160 }, partner: { expected: 1, reported: 0, hours: 0, phones_recording: 0, phones_out: 0, workers: 0 } },
    sites: [
      site('a', 'Test factory', 'direct', 'Eyad', { reporter: 'Eyad', hours: 612, phones_recording: 78, phones_out: 2, out_why: 'device 41 cracked', workers: 80, backlog: 0, flags: 2, flags_note: 'camera angle', problems: 'Power cut 11:10 to 11:40.', hardware: null, fixes: 'Charging strip moved.', absences: '1, covered', operators: null, late: false, sent_at: '17:40', first_at: '17:40' }),
      site('b', 'Test warehouse', 'direct', 'Hazem', { reporter: 'Hazem', hours: 328, phones_recording: 72, phones_out: 1, out_why: null, workers: 80, backlog: 2, flags: 0, flags_note: null, problems: null, hardware: '2 caps swapped', fixes: null, absences: null, operators: null, late: true, sent_at: '18:25', first_at: '18:25' }),
      site('c', 'Partner farm', 'partner', 'Shady', null)
    ],
    days: [{ day: '2026-09-05', hours: 900, reported: 3 }, { day: '2026-09-06', hours: 940, reported: 2 }] };
  const calls = [];
  await pg.route('**/rest/v1/rpc/dr_report', r => { const b = r.request().postDataJSON(); calls.push(b); if (b.p_code !== 'goodcode') return r.fulfill({ status: 400, json: { message: 'wrong code' } }); r.fulfill({ json: rep }); });
  await pg.route('**/rest/v1/rpc/dr_admin', r => { const b = r.request().postDataJSON(); calls.push(b);
    if (b.p_action === 'sites') return r.fulfill({ json: rep.sites.map(s => ({ id: s.id, name: s.name, team: s.team, lead: s.lead, active: s.active })) });
    if (b.p_action === 'settings') return r.fulfill({ json: { team_code: 'kmsc', deadline: '18:00', targets: '{"2026-09":25000}' } });
    r.fulfill({ json: { ok: true } }); });
  await pg.goto(base + 'report/day/', { waitUntil: 'networkidle' });
  if (!(await pg.$('#gate'))) problems.push('company report: no code gate');
  await pg.fill('#g-code', 'badcode');
  await pg.click('#gate button');
  await pg.waitForSelector('#gate .callout');
  await pg.fill('#g-code', 'goodcode');
  await pg.click('#gate button');
  await pg.waitForSelector('#rep');
  const big = await pg.$$eval('.stat .big', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  if (big[0] !== '940' || big[1] !== '2 / 3') problems.push('company report: the totals read ' + JSON.stringify(big));
  const miss = await pg.$eval('.callout.late', e => e.textContent);
  if (!/Not in yet: 1/.test(miss) || !/Partner farm \(Shady\)/.test(miss)) problems.push('company report: the missing line reads "' + miss + '"');
  if (!(await pg.$('.pill.late'))) problems.push('company report: the late site has no mark');
  const notes = await pg.$$eval('.notes-block h3', els => els.map(e => e.textContent));
  if (!notes.includes('Problems') || !notes.includes('Hardware') || notes.includes('Hours per operator')) problems.push('company report: the note blocks are ' + notes.join(','));
  await pg.screenshot({ path: out('x-company-report.png'), fullPage: true });
  // the code is kept, so a reload opens straight away; the day before goes into the hash
  await pg.reload({ waitUntil: 'networkidle' });
  await pg.waitForSelector('#rep');
  const todayCairo = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
  const y = (() => { const d = new Date(todayCairo + 'T12:00:00'); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); })();
  await pg.click('#prev');
  await pg.waitForFunction(v => document.querySelector('#day') && document.querySelector('#day').value === v, y);
  if (calls[calls.length - 1].p_day !== y) problems.push('company report: the day before asked for ' + calls[calls.length - 1].p_day);
  if ((await pg.evaluate(() => location.hash)) !== '#' + y) problems.push('company report: the hash did not follow the day');
  // the text copy for the management group
  await pg.click('#copy');
  const text = await pg.evaluate(() => navigator.clipboard.readText());
  if (!/^Company report, /.test(text) || !/Hours: 940 of 833 target/.test(text) || !/Partner farm: not in/.test(text) || !/Problems:\nTest factory: Power cut/.test(text)) problems.push('company report: the text copy reads "' + text.slice(0, 200).replace(/\n/g, ' | ') + '"');
  // the site list opens and a site can be paused
  await pg.click('#admin summary');
  await pg.waitForSelector('#site-rows tr');
  const rows = await pg.$$('#site-rows tr');
  if (rows.length !== 3) problems.push('company report: the site list has ' + rows.length + ' rows');
  await pg.uncheck('#site-rows tr:nth-child(3) [data-k="active"]');
  await pg.click('#site-rows tr:nth-child(3) [data-save]');
  await pg.waitForSelector('#toast.on');
  const saved = calls.find(c => c.p_action === 'site_set');
  if (!saved || saved.p.id !== 'c' || saved.p.active !== false || saved.p.name !== 'Partner farm') problems.push('company report: pausing a site sent ' + JSON.stringify(saved));
  await pg.screenshot({ path: out('x-company-report-admin.png'), fullPage: true });
  await ctx.close();
}
await browser.close();
server.close();
if (problems.length) { console.log(problems.join('\n')); process.exitCode = 1; } else console.log('Interactions clean.');
