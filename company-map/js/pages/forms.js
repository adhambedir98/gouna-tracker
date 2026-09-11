// Forms and tools: the online forms everyone sends, the management pages that read them, and the paper copies.
import { mount, loadJSON, esc, t, href } from '../app.js';
const app = await mount({ page: 'forms', title: { en: 'Forms and tools', ar: 'النماذج والأدوات' }, lede: { en: 'The morning check-in, the evening check-out, and the incident form go in online and add themselves up. The paper copies are for a day with no internet.', ar: 'تسجيل الصباح وتسجيل الخروج المسائي ونموذج الحادث تُرسل على الإنترنت وتُجمع تلقائيًا. النسخ الورقية ليوم بلا إنترنت.' }, ar: true });
const rep = await loadJSON('data/report.json');
// the online pages live on the hosted site; the single-file copy cannot reach the network, so it links there
const online = p => globalThis.__VM_DATA__ ? `${rep.host}/${p}/` : href(p);
const slugs = ['incident', 'daily-wrap', 'nightly-wrap'];
const forms = await Promise.all(slugs.map(s => loadJSON('data/forms/' + s + '.json')));
const T = (en, ar) => t({ en, ar });
const card = (path, title, text) => `<a class="card" href="${online(path)}"><h3>${title}</h3><p class="mute">${text}</p></a>`;
app.content.innerHTML = `
  <h2>${T('Every day, from the site', 'كل يوم، من الموقع')}</h2>
  <p class="mute small">${T('The site lead sends these. They need the team code, typed once.', 'مسؤول الموقع يرسل هذه. تحتاج كود الفريق، يُكتب مرة واحدة.')}</p>
  <div class="cards">
    ${card('report/checkin', T('Morning check-in', 'تسجيل الصباح'), T('By 9:00 AM. Recording started, phones out, wearers present, any problem. One line per site.', 'قبل 9:00 صباحًا. بدأ التسجيل، الهواتف الموزعة، المرتدون الحاضرون، أي مشكلة. سطر لكل موقع.'))}
    ${card('report', T('Evening check-out', 'تسجيل الخروج المسائي'), T('By 6:00 PM. The hours, the phones, the wearers, the flags, the incident line, and what the site needs. It goes straight into the company report.', 'قبل 6:00 مساءً. الساعات والهواتف والمرتدون والعلامات وسطر الحادث وما يحتاجه الموقع. يدخل مباشرة في تقرير الشركة.'))}
    ${card('report/incident', T('Incident report', 'بلاغ حادث'), T('Anything you think is an incident, small things too, the same day. Management sees it at once and keeps it open until it is closed.', 'أي شيء تظنه حادثًا، الأشياء الصغيرة أيضًا، في اليوم نفسه. الإدارة تراه فورًا ويبقى مفتوحًا حتى يُغلق.'))}
  </div>
  <h2 style="margin-top:28px">${T('For management', 'للإدارة')}</h2>
  <p class="mute small">${T('These need the management code.', 'هذه تحتاج كود الإدارة.')}</p>
  <div class="cards two">
    ${card('report/day', T('Company report', 'تقرير الشركة'), T('Every site added up into one page, morning and evening: who started, who reported, the numbers against the target, the incidents, and the activity log.', 'كل المواقع مجموعة في صفحة واحدة، صباحًا ومساءً: من بدأ، من أرسل، الأرقام مقابل الهدف، الحوادث، وسجل النشاط.'))}
    ${card('report/incidents', T('Incidents', 'الحوادث'), T('Everything filed on the incident form, open ones first. Read each one and close it with a line on how it ended.', 'كل ما أُرسل على نموذج الحادث، المفتوح أولًا. اقرأ كل واحد وأغلقه بسطر عن كيف انتهى.'))}
    ${card('sites', T('Site registry', 'سجل المواقع'), T('Every site we run and every site we could film with, where each one stands, and its own history of check-ins, reports, and incidents.', 'كل موقع نعمل فيه وكل موقع يمكننا التصوير فيه، وحالة كل واحد، وسجله من تسجيلات الصباح والتقارير والحوادث.'))}
    ${card('team', T('Team', 'الفريق'), T('Everyone who touches the operation: role, site, phone. The forms take their name lists from here.', 'كل من يعمل في العملية: الدور والموقع والهاتف. النماذج تأخذ قوائم الأسماء من هنا.'))}
  </div>
  <h2 style="margin-top:28px">${T('Paper copies', 'النسخ الورقية')}</h2>
  <p class="mute small">${T('The same forms to print or fill in on a phone with no internet. Message the numbers to your Portfolio Manager, who enters them online.', 'النماذج نفسها للطباعة أو الملء على هاتف بلا إنترنت. أرسل الأرقام إلى مدير المحفظة ليدخلها على الإنترنت.')}</p>
  <div class="cards">${forms.map(f => `<a class="card" href="${href('forms/' + f.slug)}"><h3>${esc(t(f.title))}</h3><p class="mute">${esc(t(f.purpose))}</p></a>`).join('')}</div>`;
