// Your account: who the map thinks you are, what your role opens, and the way out.
import { mount, esc, href, lang, me } from '../app.js';
import { signOut } from '../auth.js';
import { event } from '../guard.js';
import { ROLE_LABEL, SECTION_LABEL } from '../access.js';

const T = (en, ar) => (lang === 'ar' ? ar : en);
const app = await mount({ page: 'account', title: T('Your account', 'حسابك'), lede: T('Who the map knows you as, and what it opens for you.', 'من تكون بالنسبة للخريطة، وما الذي تفتحه لك.') });

const who = me || { signed_in: false };
const role = ROLE_LABEL[who.role] || { en: who.role || '', ar: who.role || '' };
const rows = [
  [T('Name', 'الاسم'), who.name],
  [T('Email', 'البريد'), who.email],
  [T('Role', 'الدور'), (lang === 'ar' ? role.ar : role.en)],
  [T('Account', 'الحساب'), who.status === 'active' ? T('Open', 'مفتوح') : who.status === 'pending' ? T('Waiting for a role', 'في انتظار دور') : T('Closed', 'مغلق')]
].filter(r => r[1]);

app.content.innerHTML = `
  <div class="card panel">
    <dl class="kv">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
  </div>
  <h2>${esc(T('What your role opens', 'ما يفتحه دورك'))}</h2>
  <p class="mute small">${esc(T('A page your role does not open is not in your list at all.', 'الصفحة التي لا يفتحها دورك ليست في قائمتك أصلًا.'))}</p>
  <div class="chips">${(who.sections || []).map(s => `<span class="chip on">${esc(lang === 'ar' ? (SECTION_LABEL[s] || {}).ar || s : (SECTION_LABEL[s] || {}).en || s)}</span>`).join('') || `<span class="mute">${esc(T('Nothing yet.', 'لا شيء بعد.'))}</span>`}</div>
  <h2>${esc(T('While you read', 'أثناء قراءتك'))}</h2>
  <p>${esc(T('Your name and the time sit faintly across every page you open, so a picture of one says where it came from. Printing, saving, Print Screen and copying a whole page are told to management as they happen.', 'اسمك والوقت يظهران بخفة عبر كل صفحة تفتحها، فصورة الصفحة تقول من أين جاءت. الطباعة والحفظ وطباعة الشاشة ونسخ صفحة كاملة تُبلَّغ للإدارة فور حدوثها.'))}</p>
  <div class="btn-row"><button type="button" class="btn" id="out">${esc(T('Sign out', 'تسجيل الخروج'))}</button>
    <a class="btn" href="${href('')}">${esc(T('Start', 'البداية'))}</a></div>`;

document.getElementById('out').addEventListener('click', async () => { event('sign-out', {}); await signOut(); location.href = href('login'); });
