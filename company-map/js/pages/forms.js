import { mount, loadJSON, esc, t, href } from '../app.js';
const app = await mount({ page: 'forms', title: { en: 'Forms', ar: 'النماذج' }, lede: { en: 'The standard forms. The daily report goes in online. The rest you fill in on a phone or print.', ar: 'النماذج القياسية. التقرير اليومي يُرسل على الإنترنت. والباقي تملؤه على الهاتف أو تطبعه.' }, ar: true });
const rep = await loadJSON('data/report.json');
// the online pages live on the hosted site; the single-file copy cannot reach the network, so it links there
const online = p => globalThis.__VM_DATA__ ? `${rep.host}/${p}/` : href(p);
const slugs = ['incident', 'daily-wrap', 'nightly-wrap'];
const forms = await Promise.all(slugs.map(s => loadJSON('data/forms/' + s + '.json')));
const T = (en, ar) => t({ en, ar });
app.content.innerHTML = `<h2>${T('Online', 'على الإنترنت')}</h2><div class="grid-2">
  <a class="card" href="${online('report')}"><h3>${T('Daily report', 'التقرير اليومي')}</h3><p class="mute">${T('One form for every site, in by 6:00 PM. The site lead fills it in. It goes straight into the company report.', 'نموذج واحد لكل موقع، قبل 6:00 مساءً. يملؤه مسؤول الموقع. يدخل مباشرة في تقرير الشركة.')}</p></a>
  <a class="card" href="${online('report/day')}"><h3>${T('Company report', 'تقرير الشركة')}</h3><p class="mute">${T('Every site added up into one page. Needs the management code.', 'كل المواقع مجموعة في صفحة واحدة. يحتاج كود الإدارة.')}</p></a>
  <a class="card" href="${online('sites')}"><h3>${T('Site registry', 'سجل المواقع')}</h3><p class="mute">${T('Every site we run and every site we could film with, and where each one stands. Needs the management code.', 'كل موقع نعمل فيه وكل موقع يمكننا التصوير فيه، وحالة كل واحد. يحتاج كود الإدارة.')}</p></a>
</div><h2 style="margin-top:28px">${T('On paper', 'على الورق')}</h2><div class="grid-2">${forms.map(f => `<a class="card" href="${href('forms/' + f.slug)}"><h3>${esc(t(f.title))}</h3><p class="mute">${esc(t(f.purpose))}</p></a>`).join('')}</div>`;
