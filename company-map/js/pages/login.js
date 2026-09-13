// Signing in, and asking for an account. This page carries its own words: it is read before an account exists, and the rest of the map is closed until then.
import { mount, esc, toast, href, lang } from '../app.js';
import { signIn, signUp, resetPassword, whoami, signOut, recoveryToken, setPassword, linkProblem, tokenIn } from '../auth.js';
import { event } from '../guard.js';

const T = (en, ar) => (lang === 'ar' ? ar : en);
const app = await mount({
  page: 'login', noGate: true,
  title: T('Sign in', 'تسجيل الدخول'),
  lede: T('The map is for the people who run the operation. Ask for an account, management gives it a role, and the pages that role reads open. Nothing else does.',
    'الخريطة لمن يديرون العملية. اطلب حسابًا وتمنحه الإدارة دورًا، فتُفتح صفحات ذلك الدور، ولا شيء غيرها.')
});

let mode = 'in';   // in, up
let note = '', known = '';   // a line above the form, and the email already typed, kept when the form is drawn again
const box = app.content;
const head = document.getElementById('head');
const HEAD = head ? head.innerHTML : '';        // the page's own heading, put back when a screen hands the form over again
const heading = t => { if (head) head.innerHTML = t === null ? HEAD : `<h1>${esc(t)}</h1>`; };

function form() {
  heading(null);
  const up = mode === 'up';
  box.innerHTML = `
    <div class="chips no-print" id="tabs" role="tablist">
      <button type="button" class="chip${up ? '' : ' on'}" data-mode="in" role="tab" aria-selected="${!up}">${esc(T('I have an account', 'لدي حساب'))}</button>
      <button type="button" class="chip${up ? ' on' : ''}" data-mode="up" role="tab" aria-selected="${up}">${esc(T('Ask for an account', 'اطلب حسابًا'))}</button>
    </div>
    <form class="stdform card panel signin" id="f" autocomplete="on">
      ${note ? `<p class="callout small">${esc(note)}</p>` : ''}
      ${up ? `<div class="ff"><label class="fl" for="f-name">${esc(T('Your name', 'اسمك'))}</label><input type="text" id="f-name" autocomplete="name" required></div>` : ''}
      <div class="ff"><label class="fl" for="f-email">${esc(T('Work email', 'بريد العمل'))}</label><input type="email" id="f-email" autocomplete="username" value="${esc(known)}" required></div>
      <div class="ff"><label class="fl" for="f-pass">${esc(T('Password', 'كلمة المرور'))}${up ? `<small>${esc(T('Eight letters or more.', 'ثمانية أحرف أو أكثر.'))}</small>` : ''}</label>
        <input type="password" id="f-pass" autocomplete="${up ? 'new-password' : 'current-password'}" minlength="8" required></div>
      <div class="btn-row">
        <button type="submit" class="btn primary" id="go">${esc(up ? T('Ask for an account', 'اطلب حسابًا') : T('Sign in', 'تسجيل الدخول'))}</button>
        ${up ? '' : `<button type="button" class="btn" id="forgot">${esc(T('I forgot my password', 'نسيت كلمة المرور'))}</button>`}
      </div>
      <p class="tiny dim">${esc(T('Every page carries your name while you read it. The forms the sites fill in need no account.', 'كل صفحة تحمل اسمك أثناء قراءتك لها. النماذج التي تملؤها المواقع لا تحتاج حسابًا.'))}
        <a href="${href('report/checkin')}">${esc(T('Morning check-in', 'تسجيل الصباح'))}</a></p>
      ${up ? '' : `<p class="tiny dim"><button type="button" class="linky" id="stuck">${esc(T('My password link opens a page that will not load', 'رابط كلمة المرور يفتح صفحة لا تُحمّل'))}</button></p>`}
    </form>`;
  document.getElementById('tabs').addEventListener('click', e => {
    const b = e.target.closest('[data-mode]');
    if (b) { mode = b.dataset.mode; note = ''; known = document.getElementById('f-email').value.trim(); form(); }
  });
  document.getElementById('forgot')?.addEventListener('click', async e => {
    const email = document.getElementById('f-email').value.trim();
    if (!email) return toast(T('Write your email first.', 'اكتب بريدك أولًا.'));
    e.target.disabled = true;
    try { await resetPassword(email); sent(email); }
    catch (err) { toast(friendly(err)); e.target.disabled = false; }
  });
  document.getElementById('stuck')?.addEventListener('click', stuck);
  document.getElementById('f').addEventListener('submit', send);
}

const friendly = err => {
  const m = String(err && err.message || '').toLowerCase();
  if (m.includes('invalid login')) return T('That email and password do not match.', 'البريد وكلمة المرور غير متطابقين.');
  if (m.includes('already registered') || m.includes('already been registered')) return T('That email already has an account. Sign in.', 'هذا البريد له حساب. سجّل الدخول.');
  if (m.includes('password')) return T('The password is too short. Eight letters or more.', 'كلمة المرور قصيرة. ثمانية أحرف أو أكثر.');
  if (m.includes('email')) return T('Check the email address.', 'راجع البريد الإلكتروني.');
  if (m.includes('rate') || m.includes('many')) return T('Too many tries. Wait a minute.', 'محاولات كثيرة. انتظر دقيقة.');
  return T('That did not work. Try again.', 'لم ينجح ذلك. حاول مرة أخرى.');
};

async function send(e) {
  e.preventDefault();
  const btn = document.getElementById('go'); btn.disabled = true;
  const email = document.getElementById('f-email').value.trim();
  const pass = document.getElementById('f-pass').value;
  try {
    if (mode === 'up') {
      const name = document.getElementById('f-name').value.trim();
      const { confirm } = await signUp(email, pass, name);
      return waiting(email, confirm);
    }
    const who = await signIn(email, pass);
    event('sign-in', { role: who.role, status: who.status });
    if (who.status === 'active') { location.href = href(''); return; }
    waiting(email, false, who.status);
  } catch (err) {
    const m = String(err && err.message || '').toLowerCase();
    if (m.includes('already registered') || m.includes('already been registered')) return haveAccount(email);
    toast(friendly(err)); btn.disabled = false;
  }
}

// An address that already has an account is sent no sign-up message, so say that here rather than leave somebody waiting for one.
function haveAccount(email) {
  mode = 'in'; known = email;
  note = T('That email already has an account, so no message is sent for it. Sign in with your password, or use I forgot my password to set a new one.',
    'هذا البريد له حساب بالفعل، فلا تُرسل له رسالة. سجّل الدخول بكلمة مرورك، أو استخدم نسيت كلمة المرور لتعيين واحدة جديدة.');
  form();
  document.getElementById('f-pass').focus();
}

function waiting(email, confirm, status) {
  const title = confirm ? T('Check your email', 'راجع بريدك')
    : status === 'blocked' ? T('This account is closed', 'هذا الحساب مغلق')
      : T('Your account is waiting', 'حسابك في الانتظار');
  const line = confirm
    ? T('A message is on its way: open the link in it, then come back and sign in. Either way management has to let the account in before anything opens, so tell them it is waiting.',
        'رسالة في الطريق إليك: افتح الرابط فيها ثم عُد وسجّل الدخول. وفي الحالتين على الإدارة أن تفتح الحساب قبل أن يُفتح أي شيء، فأخبرهم أنه في الانتظار.')
    : status === 'blocked' ? T('Talk to management.', 'تحدّث مع الإدارة.')
      : T('The account is made. Management gives it a role, and then the pages you need open.', 'تم إنشاء الحساب. الإدارة تمنحه دورًا، وعندها تُفتح الصفحات التي تحتاجها.');
  heading(title);
  box.innerHTML = `<div class="card panel gate-note"><p>${esc(line)}</p><p class="mute small">${esc(email)}</p>
    <div class="btn-row"><button type="button" class="btn" id="again">${esc(T('Sign in as somebody else', 'سجّل الدخول بحساب آخر'))}</button></div></div>`;
  document.getElementById('again').addEventListener('click', async () => { await signOut(); location.reload(); });
}

/* A password link should land back on this page. A project still pointing at somebody's laptop sends it to an address that
   will not open, and the token is sitting in that address all the same: pasting the whole thing here gets past it. */
function linkBox(title, lead) {
  heading(title);
  box.innerHTML = `<div class="card panel gate-note">${lead}
    <form class="stdform" id="paste">
      <div class="ff"><label class="fl" for="p-link">${esc(T('The whole address', 'العنوان كاملًا'))}</label>
        <textarea id="p-link" rows="3" spellcheck="false"></textarea></div>
      <div class="btn-row">
        <button type="submit" class="btn primary">${esc(T('Set a new password', 'عيّن كلمة مرور جديدة'))}</button>
        <button type="button" class="btn" id="p-back">${esc(T('Back', 'رجوع'))}</button>
      </div>
    </form></div>`;
  document.getElementById('p-back').addEventListener('click', () => { note = ''; form(); });
  document.getElementById('paste').addEventListener('submit', ev => {
    ev.preventDefault();
    const t = tokenIn(document.getElementById('p-link').value);
    if (!t) return toast(T('That address carries no token. Copy the whole thing, from https to the end.', 'هذا العنوان لا يحمل رمزًا. انسخه كاملًا من https حتى آخره.'));
    newPassword(t);
  });
}
function sent(email) {
  known = email;
  linkBox(T('Check your email', 'راجع بريدك'), `<p>${esc(T('A link to set a new password is on its way to', 'رابط تعيين كلمة مرور جديدة في الطريق إلى'))} <b>${esc(email)}</b>.
    ${esc(T('Look in the spam folder too. Open it, and this page asks for the new password.', 'راجع مجلد الرسائل غير المرغوبة أيضًا. افتحه وستطلب هذه الصفحة كلمة المرور الجديدة.'))}</p>
    <p class="small">${esc(T('If it opens a page that will not load, copy the whole address from that page, from https to the end, and paste it here.',
      'إذا فتح صفحة لا تُحمّل، فانسخ العنوان كاملًا من تلك الصفحة، من https حتى آخره، والصقه هنا.'))}</p>`);
}
function stuck() {
  linkBox(T('Set a new password', 'عيّن كلمة مرور جديدة'), `<p>${esc(T('Open the link in your email. If it lands on a page that will not load, the address it landed on still carries what is needed.',
    'افتح الرابط في بريدك. إذا وصل إلى صفحة لا تُحمّل، فالعنوان الذي وصل إليه ما زال يحمل ما يلزم.'))}</p>
    <p class="small">${esc(T('Copy the whole address from that page, from https to the end, and paste it here.',
      'انسخ العنوان كاملًا من تلك الصفحة، من https حتى آخره، والصقه هنا.'))}</p>`);
}

// the link in a password email lands here with a token in the address: set a new one, then carry on as normal
function newPassword(token) {
  heading(T('Set a new password', 'عيّن كلمة مرور جديدة'));
  box.innerHTML = `<form class="stdform card panel signin" id="np">
    <div class="ff"><label class="fl" for="np-pass">${esc(T('New password', 'كلمة المرور الجديدة'))}<small>${esc(T('Eight letters or more.', 'ثمانية أحرف أو أكثر.'))}</small></label>
      <input type="password" id="np-pass" autocomplete="new-password" minlength="8" required></div>
    <div class="btn-row"><button type="submit" class="btn primary" id="np-go">${esc(T('Save it', 'احفظها'))}</button></div></form>`;
  document.getElementById('np').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = document.getElementById('np-go'); btn.disabled = true;
    try {
      await setPassword(document.getElementById('np-pass').value, token);
      toast(T('Saved. Sign in with it.', 'تم الحفظ. سجّل الدخول بها.'));
      mode = 'in';
      form();
    } catch (err) { toast(friendly(err)); btn.disabled = false; }
  });
}

const recovery = recoveryToken();
const problem = linkProblem();
if (recovery) newPassword(recovery);
else {
  if (problem) note = /expire|invalid|otp/i.test(problem)
    ? T('That link has been used already or has run out. Ask for a new one.', 'هذا الرابط استُخدم بالفعل أو انتهت صلاحيته. اطلب رابطًا جديدًا.')
    : T('That link did not work. Ask for a new one.', 'لم ينجح هذا الرابط. اطلب رابطًا جديدًا.');
  // somebody who is already in does not need this page
  const who = await whoami(true);
  if (!problem && who.signed_in && who.status === 'active') location.replace(href(''));
  else if (!problem && who.signed_in) waiting(who.email || '', false, who.status);
  else form();
}
