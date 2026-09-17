// The morning check-in. Five things by 9:00 AM: what time recording started, how many phones are recording, how many
// are down, how many employees are present, and any incident or issue for the day. No phone readings: those belong to
// the evening check-out, which is where the hours are counted from. No code: the site and the name are enough.
import { mount, esc, labels, store, toast, fmt } from '../app.js';
import { rpc, today, shift, nowTime, clock, shortDay, friendly, peopleOptions, siteOptions, OTHER } from '../online.js';

const L = await labels('report-checkin');
const app = await mount({ plain: true, page: 'report/checkin', title: L('Morning check-in'), lede: '' });

const KEY = 'vm.report';            // name and site: shared with the evening check-out form
const DRAFT = 'vm.checkin.draft';   // what is typed, until it is sent
let mem = store.get(KEY, {});
let draft = store.get(DRAFT, {});
let last = null;
let opts = { sites: [], people: [], deadline: '09:00', phones_max: 270 };
const ERR = {
  'phones are missing': L('Say how many phones are recording.'),
  'day is too far back': L('That date is more than two days ago. Ask Mano to enter it.')
};

function field(id, label, type = 'text', extra = '', hint = '') {
  const v = draft[id] ?? '';
  const lab = `<label class="fl" for="f-${id}">${esc(label)}${hint ? `<small>${esc(hint)}</small>` : ''}</label>`;
  if (type === 'long') return `<div class="ff">${lab}<textarea id="f-${id}" data-f="${id}" rows="3">${esc(v)}</textarea></div>`;
  return `<div class="ff">${lab}<input type="${type}" id="f-${id}" data-f="${id}" value="${esc(v)}" ${extra}></div>`;
}
const count = (id, label, hint = '') => field(id, label, 'number', 'inputmode="numeric" min="0" step="1"', hint);

function render() {
  const now = today();
  const deadline = clock(L, opts.deadline);
  const name = draft.reporter ?? mem.person ?? '';
  const known = opts.people.some(p => p.id === name && ['portfolio-manager', 'partner'].includes(p.role));
  // signed in: the page already knows who this is and which sites are theirs, so it asks for neither
  const mine = (opts.me && opts.me.signed_in) ? opts.me : {};
  const ours = (mine.sites || []).filter(id => opts.sites.some(s => s.id === id));
  const site = draft.site ?? (ours.length === 1 ? ours[0] : (mem.site ?? ''));
  app.content.innerHTML = `
    <p class="callout" id="clockline">${esc(L('Due by {deadline}. It is now {time} in Cairo.', { deadline, time: clock(L, nowTime()) }))}</p>
    ${opts.sites.length ? '' : `<p class="callout late">${esc(L('No sites on the list yet. Management adds them on the site database page.'))}</p>`}
    <form class="stdform" id="cform" autocomplete="off">
      <section><h2>${esc(L('You and the site'))}</h2><div class="fgrid">
        ${mine.person_id
          ? `<div class="ff"><span class="fl">${esc(L('Your name'))}</span><p class="said">${esc(mine.name)}</p><input type="hidden" data-f="reporter" value="${esc(mine.person_id)}"></div>`
          : `<div class="ff"><label class="fl" for="f-reporter">${esc(L('Your name'))}</label><select id="f-reporter" data-f="reporter" required>${peopleOptions(L, opts.people, name, { roles: ['portfolio-manager', 'partner'], other: false })}</select></div>`}
        <div class="ff" id="other-wrap" hidden><label class="fl" for="f-reporter_other">${esc(L('Write your name'))}</label><input type="text" id="f-reporter_other" data-f="reporter_other" value="${esc(name && !known && name !== OTHER ? name : (draft.reporter_other || ''))}"></div>
        <div class="ff"><label class="fl" for="f-site">${esc(L('Site'))}</label><select id="f-site" data-f="site" required>${siteOptions(L, opts.sites, site, '', { lead: false })}</select></div>
        <div class="ff"><label class="fl" for="f-date">${esc(L('Date'))}</label><input type="date" id="f-date" data-f="date" value="${esc(draft.date || now)}" min="${shift(now, -2)}" max="${now}" required></div>
      </div></section>
      <section><h2>${esc(L('The start'))}</h2><div class="fgrid">
        ${field('started_at', L('Recording started at'), 'time', 'required', L('The time the first phone started. 8:00 AM is the rule.'))}
        ${count('phones_deployed', L('Phones recording'), L('How many phones went out and are filming today.'))}
        ${count('phones_out', L('Phones down'), L('Phones that did not go out: dead, missing, or broken.'))}
        ${count('wearers_present', L('Employees present'))}
        <div class="ff"><span class="fl">${esc(L('Opt-in rate'))}<small>${esc(L('The phones recording against the employees present.'))}</small></span><p class="said" id="optin">${esc(L('Fill in the two numbers above.'))}</p></div>
        ${field('note', L('Incidents or issues today'), 'long', '', L('Leave it empty if there are none. A late start, a phone short, no power, a wearer missing: what it is and what you did.'))}
      </div></section>
      <section><h2>${esc(L('Send'))}</h2>
      <div class="btn-row"><button type="submit" class="btn primary" id="send">${esc(L('Send'))}</button><button type="button" class="btn" id="f-clear">${esc(L('Clear'))}</button></div>
      </section>
    </form>
    <p class="tiny dim">${esc(L('What you type stays until you send it.'))}</p>`;

  const form = document.getElementById('cform');
  const read = () => {
    const o = {};
    form.querySelectorAll('[data-f]').forEach(el => { if (el.type === 'radio') { if (el.checked) o[el.dataset.f] = el.value; } else o[el.dataset.f] = el.value; });
    return o;
  };
  // the rate as it is typed, so the number on the dashboard is never a surprise
  const showOptIn = () => {
    const el = document.getElementById('optin'); if (!el) return;
    const v = read(), ph = Number(v.phones_deployed), pr = Number(v.wearers_present);
    el.textContent = (ph >= 0 && pr > 0 && v.phones_deployed !== '' && v.wearers_present !== '')
      ? L('{pct}%, {a} of {b}', { pct: Math.round(100 * ph / pr), a: fmt(ph), b: fmt(pr) })
      : L('Fill in the two numbers above.');
  };
  const keep = () => { draft = read(); store.set(DRAFT, draft); showOptIn(); };
  showOptIn();
  form.addEventListener('input', keep);
  form.addEventListener('change', e => {
    if (e.target.id === 'f-reporter') {
      document.getElementById('other-wrap').hidden = e.target.value !== OTHER;
      // a person tied to one site: that site fills itself in
      const p = opts.people.find(x => x.id === e.target.value);
      if (p && p.site_id && opts.sites.some(s => s.id === p.site_id)) { document.getElementById('f-site').value = p.site_id; document.getElementById('f-site').dispatchEvent(new Event('change', { bubbles: true })); return; }
    }
    keep();
  });
  document.getElementById('f-clear').addEventListener('click', () => {
    if (!confirm(L('Clear everything on this form?'))) return;
    draft = {}; store.set(DRAFT, {}); render();
  });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const v = read();
    const btn = document.getElementById('send');
    if (v.phones_deployed === '') { toast(L('Say how many phones are recording.')); return; }
    const p = { site_id: v.site, reporter_id: v.reporter === OTHER ? '' : v.reporter, reporter_other: v.reporter === OTHER ? v.reporter_other : '', day: v.date,
      started_at: v.started_at, phones_deployed: v.phones_deployed, wearers_present: v.wearers_present, phones_out: v.phones_out,
      problem: (v.note || '').trim() ? 'true' : 'false', note: v.note };   // anything written here is a problem for the day
    btn.disabled = true; btn.textContent = L('Sending');
    try {
      const out = await rpc('dr_checkin', { p });
      mem = { ...mem, person: v.reporter, name: mine.name || (v.reporter === OTHER ? v.reporter_other : (opts.people.find(x => x.id === v.reporter) || {}).name), site: v.site }; store.set(KEY, mem);
      last = v; draft = {}; store.set(DRAFT, {});
      done(out);
    } catch (err) {
      toast(friendly(L, err.message, ERR));
      btn.disabled = false; btn.textContent = L('Send');
    }
  });
}

function done(o) {
  app.content.innerHTML = `<div class="card panel sent" id="sent">
    <h2>${esc(L('Sent'))}</h2>
    <p class="big-rule">${esc(Number(o.phones_deployed) === 1 ? L('{site}, {day}: one phone recording.', { site: o.site, day: shortDay(o.day) }) : L('{site}, {day}: {n} phones recording.', { site: o.site, day: shortDay(o.day), n: fmt(o.phones_deployed) }))}</p>
    <p>${esc(L('Sent at {time}.', { time: clock(L, o.sent_at) }))}${o.updated ? ' ' + esc(L('This replaces what was sent earlier for this site and day.')) : ''}${o.problem ? ' ' + esc(L('The problem is on the company report. Call your Portfolio Manager if it is not solved.')) : ''}</p>
    <div class="btn-row"><button type="button" class="btn primary" id="again">${esc(L('Send another site'))}</button><button type="button" class="btn" id="fix">${esc(L('Fix this check-in'))}</button></div>
    <p class="mute small">${esc(L('The evening check-out is due by 6:00 PM, on the evening check-out page.'))}</p>
  </div>`;
  document.getElementById('again').addEventListener('click', () => { draft = {}; render(); });
  document.getElementById('fix').addEventListener('click', () => { draft = { ...(last || {}) }; store.set(DRAFT, draft); render(); });
}

try {
  const o = await rpc('dr_form_options', {});
  opts = { sites: o.sites || [], people: o.people || [], deadline: o.checkin_deadline || '09:00', phones: o.phones || {}, phones_max: Number(o.phones_max) || 270, me: o.me || { signed_in: false } };
  render();
  setInterval(() => { const el = document.getElementById('clockline'); if (el) el.textContent = L('Due by {deadline}. It is now {time} in Cairo.', { deadline: clock(L, opts.deadline), time: clock(L, nowTime()) }); }, 30000);
} catch (err) {
  app.content.innerHTML = `<p class="callout late">${esc(friendly(L, err.message))}</p><div class="btn-row"><button type="button" class="btn primary" id="retry">${esc(L('Try again'))}</button></div>`;
  document.getElementById('retry').addEventListener('click', () => location.reload());
}

