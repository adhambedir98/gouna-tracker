import { mount, loadJSON, esc, t, href } from '../app.js';
const app = await mount({ page: 'forms', title: { en: 'Forms', ar: 'النماذج' }, lede: { en: 'The standard forms. Fill one in on a phone or print it.', ar: 'النماذج القياسية. املأ النموذج على الهاتف أو اطبعه.' }, ar: true });
const slugs = ['incident', 'daily-wrap', 'nightly-wrap'];
const forms = await Promise.all(slugs.map(s => loadJSON('data/forms/' + s + '.json')));
app.content.innerHTML = '<div class="grid-2">' + forms.map(f => `<a class="card" href="${href('forms/' + f.slug)}"><h3>${esc(t(f.title))}</h3><p class="mute">${esc(t(f.purpose))}</p></a>`).join('') + '</div>';
