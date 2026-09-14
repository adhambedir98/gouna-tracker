// Screenshots every page at 390 and 1280 with Playwright. Flags horizontal overflow and console errors.
//   node scripts/shoot.mjs                    all pages, both widths
//   node scripts/shoot.mjs --page call        one page (slug from data/site.json nav, "start" for the home page)
//   node scripts/shoot.mjs --lang ar          Arabic mode
//   node scripts/shoot.mjs --print            print media at 794px (A4)
//   node scripts/shoot.mjs --width 390        one width
//   node scripts/shoot.mjs --page call --hash upload   open with a URL hash (a route, a person)
//   node scripts/shoot.mjs --page map --store vm.map.view=scale   set a stored value first (the At scale view)
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
const stored = args.filter((a, i) => args[i - 1] === '--store'); // --store vm.map.view=scale   set a localStorage key before the page loads (repeatable)
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
    for (const kv of stored) { const [k, v] = kv.split('='); await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }, [k, v]); }
    const pg = await ctx.newPage();
    // the shots are taken as a founder, whose role opens the whole map
    await ctx.addInitScript(() => { try { localStorage.setItem('vm.session', JSON.stringify({ access_token: 'shot', refresh_token: 'shot', expires_at: 9e9 })); } catch {} });
    // the database is not reachable from every machine; a request that hangs would only slow the screenshots down.
    // This goes on first so the two below, added later, are checked first and win.
    await pg.route('**supabase.co/**', r => r.abort());
    await pg.route('**/rest/v1/rpc/dr_me', r => r.fulfill({ json: { signed_in: true, id: 'u1', email: 'shots@example.com', name: 'Karim Fouad', role: 'founder', status: 'active', sections: ['company', 'everyday', 'training', 'forms', 'sops', 'manual', 'numbers', 'money', 'jobs', 'mine', 'command', 'admin', 'accounts'], posthog: { key: '', host: '' } } }));
    await pg.route('**/rest/v1/rpc/dr_event', r => r.fulfill({ json: { ok: true } }));
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
      // Text nobody can read is a layout fault like any other. Every run of text on the page is measured against the
      // paper behind it, at the threshold its own size asks for: 3:1 once it is large, 4.5:1 below that.
      const faint = await pg.evaluate(() => {
        const lin = v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
        const lum = c => { const [r, g, b] = c; return 0.2126 * lin(r / 255) + 0.7152 * lin(g / 255) + 0.0722 * lin(b / 255); };
        const parse = s => { const m2 = String(s).match(/[\d.]+/g); return m2 ? m2.slice(0, 4).map(Number) : null; };
        const behind = el => { for (let n = el; n; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c && (c[3] === undefined || c[3] > 0.9)) return c; } return [255, 255, 255]; };
        const out = [];
        for (const el of document.body.querySelectorAll('*')) {
          if (el.closest('.mark, svg, [aria-hidden="true"]')) continue;
          const own = [...el.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim().length > 2);
          if (!own.length) continue;
          const s2 = getComputedStyle(el);
          if (s2.visibility === 'hidden' || s2.display === 'none' || Number(s2.opacity) < 0.95) continue;
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height) continue;
          const fg = parse(s2.color); if (!fg) continue;
          if (fg[3] !== undefined && fg[3] < 0.95) continue;
          const px = parseFloat(s2.fontSize), bold = Number(s2.fontWeight) >= 700;
          const need = (px >= 24 || (px >= 18.66 && bold)) ? 3 : 4.5;
          const a = lum(fg), b = lum(behind(el));
          const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
          if (ratio + 0.02 < need) out.push({ text: own.map(n => n.textContent.trim()).join(' ').slice(0, 30), ratio: Math.round(ratio * 100) / 100, px: Math.round(px), colour: s2.color, bg: 'paper' });
        }
        const seen = new Set();
        return out.filter(f => { const k = f.text + f.ratio; if (seen.has(k)) return false; seen.add(k); return true; });
      });
      const name = `${page.slug}-${width}${langMode === 'ar' ? '-ar' : ''}${printMode ? '-print' : ''}${hash && hash !== true ? '-' + hash : ''}${stored.length ? '-' + stored.map(kv => kv.split('=')[1]).join('-') : ''}.png`;
      const clip = maxh ? { x: 0, y: from, width, height: Math.max(1, Math.min(maxh, m.h - from)) } : undefined;
      const outName = clip ? name.replace('.png', `-${from}-${from + clip.height}.png`) : name;
      await pg.screenshot({ path: path.join(root, 'shots', outName), fullPage: true, clip });
      const flags = [];
      if (m.sw > m.iw + 1) flags.push(`horizontal overflow ${m.sw}px in ${m.iw}px`);
      if (faint.length) flags.push(`text too faint to read: ${faint.slice(0, 3).map(f => `"${f.text}" ${f.ratio}:1 (${f.px}px, ${f.colour} on ${f.bg})`).join(', ')}${faint.length > 3 ? ` and ${faint.length - 3} more` : ''}`);
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
