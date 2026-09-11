// The evening check-out. One form for every site, in by 6:00 PM, for the Portfolio Manager or the site lead on direct and partner sites alike.
// Employees present, a ledger with one row per phone (its tag, minutes all time, minutes still on it), and what the site needs.
// It sends straight to the company database. The company report page adds every site up on its own.
import { mount, esc, labels, store, toast, fmt, href } from '../app.js';
import { rpc, today, shift, nowTime, clock, shortDay, friendly, peopleOptions, siteOptions, OTHER, PHONES, ledgerHTML, ledgerRead, ledgerWire, ledgerStart, ledgerBad } from '../online.js';

const L = await labels('report');
const app = await mount({ page: 'report', title: L('Evening check-out'), lede: L('One form for every site, in by 6:00 PM: who was there, every phone with its minutes, and what you need. The company report builds itself from these.') });

const KEY = 'vm.report';          // name, site, and team code: remembered on this device, shared with the other forms
const DRAFT = 'vm.report.draft';  // what is typed, until it is sent
let mem = store.get(KEY, {});
let draft = store.get(DRAFT, {});
let last = null;
let opts = { sites: [], people: [], deadline: '18:00', phones: {}, phones_max: 270 };
let phoneMem = store.get(PHONES, {});   // the tags each site used last, on this device
const ERR = {
  'minutes all time are missing': L('Every phone row needs its minutes all time.'),
  'unknown phone': L('A phone number on the list does not exist.'),
  'phone listed twice': L('A phone is on the list twice.'),
  'day is too far back': L('That date is more than a week ago. Ask Mano to enter it.')
};

function field(id, label, type = 'text', extra = '', hint = '') {
  const v = draft[id] ?? '';
  const lab = `<label class="fl" for="f-${id}">${esc(label)}${hint ? `<small>${esc(hint)}</small>` : ''}</label>`;
  if (type === 'long') return `<div class="ff">${lab}<textarea id="f-${id}" data-f="${id}" rows="3">${esc(v)}</textarea></div>`;
  return `<div class="ff">${lab}<input type="${type}" id="f-${id}" data-f="${id}" value="${esc(v)}" ${extra}></div>`;
}
const num = (id, label, hint = '') => field(id, label, 'number', 'inputmode="decimal" min="0" step="0.5"', hint);
const count = (id, label, hint = '') => field(id, label, 'number', 'inputmode="numeric" min="0" step="1"', hint);

function render() {
  const now = today();
  const deadline = clock(L, opts.deadline);
  const name = draft.reporter ?? mem.person ?? '';
  const known = opts.people.some(p => p.id === name && ['portfolio-manager', 'partner'].includes(p.role));
  const site = draft.site ?? mem.site ?? '';
  app.content.innerHTML = `
    <p class="callout" id="clockline">${esc(L('Due by {deadline}. It is now {time} in Cairo.', { deadline, time: clock(L, nowTime()) }))}</p>
    ${opts.sites.length ? '' : `<p class="callout late">${esc(L('No sites on the list yet. Management adds them on the site registry page.'))}</p>`}
    <form class="stdform" id="rform" autocomplete="off">
      <section><h2>${esc(L('You and the site'))}</h2><div class="fgrid">
        <div class="ff"><label class="fl" for="f-reporter">${esc(L('Your name'))}</label><select id="f-reporter" data-f="reporter" required>${peopleOptions(L, opts.people, name, { roles: ['portfolio-manager', 'partner'], other: false })}</select></div>
        <div class="ff" id="other-wrap" hidden><label class="fl" for="f-reporter_other">${esc(L('Write your name'))}</label><input type="text" id="f-reporter_other" data-f="reporter_other" value="${esc(name && !known && name !== OTHER ? name : (draft.reporter_other || ''))}"></div>
        <div class="ff"><label class="fl" for="f-site">${esc(L('Site'))}</label><select id="f-site" data-f="site" required>${siteOptions(L, opts.sites, site)}</select></div>
        <div class="ff"><label class="fl" for="f-date">${esc(L('Date'))}</label><input type="date" id="f-date" data-f="date" value="${esc(draft.date || now)}" min="${shift(now, -7)}" max="${now}" required></div>
      </div></section>
      <section><h2>${esc(L('The numbers'))}</h2><div class="fgrid">
        ${count('phones_deployed', L('Phones deployed'))}
        ${count('wearers_present', L('Employees present'))}
        ${count('phones_out', L('Phones down'), L('Phones that did not go out: dead, missing, or broken.'))}
      </div></section>
      <section><h2>${esc(L('The phones'))}</h2>
        <p class="mute small">${esc(L('One row per phone: its number, the minutes it shows all time, and the minutes still saved on it. The phones from this morning are already listed.'))}</p>
        ${ledgerHTML(L, ledgerStart(draft, site, opts, phoneMem), opts.phones_max, L('Enter on the last cell adds a row.'))}
      </section>
      <section><h2>${esc(L('Incident and needs'))}</h2><div class="fgrid">
        <div class="ff"><span class="fl">${esc(L('Incident today'))}</span><div class="choices small"><label class="opt"><input type="radio" name="f-incident" data-f="incident" value="false" ${draft.incident === 'true' ? '' : 'checked'}> ${esc(L('No'))}</label><label class="opt"><input type="radio" name="f-incident" data-f="incident" value="true" ${draft.incident === 'true' ? 'checked' : ''}> ${esc(L('Yes'))}</label></div></div>
        ${field('incident_text', L('Incident, in one line'), 'text', '', L('What happened, when, and what you did. Then file the incident form.'))}
        ${field('gear_needed', L('What do you need?'), 'text', '', L('Phones, caps, people, money.'))}
        ${field('other', L('Anything else'), 'long')}
      </div></section>
      <section><h2>${esc(L('Send'))}</h2><div class="fgrid">
        <div class="ff"><label class="fl" for="f-code">${esc(L('Team code'))}<small>${esc(L('Your Portfolio Manager or Mano gives you this once.'))}</small></label><input type="text" id="f-code" data-f="code" value="${esc(draft.code ?? mem.code ?? '')}" autocapitalize="off" required></div>
      </div>
      <div class="btn-row"><button type="submit" class="btn primary" id="send">${esc(L('Send'))}</button><button type="button" class="btn" id="f-clear">${esc(L('Clear'))}</button></div>
      </section>
    </form>
    <p class="tiny dim">${esc(L('Your name, site, and team code stay on this device. What you type stays until you send it.'))}</p>`;

  const form = document.getElementById('rform');
  const read = () => {
    const o = {};
    form.querySelectorAll('[data-f]').forEach(el => { if (el.type === 'radio') { if (el.checked) o[el.dataset.f] = el.value; } else o[el.dataset.f] = el.value; });
    o.phones = ledgerRead(form);
    return o;
  };
  const keep = () => { draft = read(); store.set(DRAFT, draft); };
  ledgerWire(form, L, opts.phones_max, keep);
  form.addEventListener('input', keep);
  form.addEventListener('change', e => {
    if (e.target.id === 'f-reporter') {
      document.getElementById('other-wrap').hidden = e.target.value !== OTHER;
      // a person tied to one site: that site fills itself in
      const p = opts.people.find(x => x.id === e.target.value);
      if (p && p.site_id && opts.sites.some(s => s.id === p.site_id)) { document.getElementById('f-site').value = p.site_id; document.getElementById('f-site').dispatchEvent(new Event('change', { bubbles: true })); return; }
    }
    if (e.target.id === 'f-site' && !ledgerRead(form).some(r => r.total || r.local)) { document.querySelector('#phones tbody').innerHTML = ledgerHTML(L, ledgerStart({}, e.target.value, opts, phoneMem), opts.phones_max).match(/<tbody>([\s\S]*)<\/tbody>/)[1]; }
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
    if (ledgerBad(v.phones)) { toast(L('Every phone row needs its number and its minutes all time.')); return; }
    const p = { code: v.code, site_id: v.site, reporter_id: v.reporter === OTHER ? '' : v.reporter, reporter_other: v.reporter === OTHER ? v.reporter_other : '', day: v.date,
      phones_deployed: v.phones_deployed, wearers_present: v.wearers_present, phones_out: v.phones_out, phones: v.phones,
      incident: v.incident === 'true' ? 'true' : 'false', incident_text: v.incident_text, gear_needed: v.gear_needed, other: v.other };
    btn.disabled = true; btn.textContent = L('Sending');
    try {
      const out = await rpc('dr_submit', { p });
      mem = { ...mem, person: v.reporter, name: v.reporter === OTHER ? v.reporter_other : (opts.people.find(x => x.id === v.reporter) || {}).name, site: v.site, code: v.code }; store.set(KEY, mem);
      phoneMem = { ...phoneMem, [v.site]: v.phones.map(r => r.tag) }; store.set(PHONES, phoneMem);
      last = v; draft = {}; store.set(DRAFT, {});
      done(out);
    } catch (err) {
      toast(friendly(L, err.message, ERR));
      btn.disabled = false; btn.textContent = L('Send');
    }
  });
}

function done(o) {
  const deadline = clock(L, opts.deadline);
  app.content.innerHTML = `<div class="card panel sent" id="sent">
    <h2>${esc(L('Sent'))}</h2>
    <p class="big-rule">${esc(L('{site}, {day}: {n} phones.', { site: o.site, day: shortDay(o.day), n: fmt(o.phones || 0) }))}${o.hours != null ? ' ' + esc(L('{hours} hours recorded today, from the phones.', { hours: fmt(o.hours) })) : ''}</p>
    <p>${esc(L('Sent at {time}.', { time: clock(L, o.sent_at) }))} <span class="${o.late ? 'late' : 'ontime'}">${esc(o.late ? L('This came in after {deadline}. It counts as late.', { deadline }) : L('In on time.'))}</span>${o.updated ? ' ' + esc(L('This replaces what was sent earlier for this site and day.')) : ''}</p>
    ${o.incident ? `<p class="callout">${esc(L('You marked an incident. File the incident form now, so management has the whole story.'))} <a href="${href('report/incident')}">${esc(L('Open the incident form'))}</a></p>` : ''}
    <div class="btn-row"><button type="button" class="btn primary" id="again">${esc(L('Send another site'))}</button><button type="button" class="btn" id="fix">${esc(L('Fix this check-out'))}</button></div>
  </div>`;
  document.getElementById('again').addEventListener('click', () => { draft = {}; render(); });
  document.getElementById('fix').addEventListener('click', () => { draft = { ...(last || {}) }; store.set(DRAFT, draft); render(); });
}

try {
  const o = await rpc('dr_form_options', {});
  opts = { sites: o.sites || [], people: o.people || [], deadline: o.deadline || '18:00', phones: o.phones || {}, phones_max: Number(o.phones_max) || 270 };
  render();
  setInterval(() => { const el = document.getElementById('clockline'); if (el) el.textContent = L('Due by {deadline}. It is now {time} in Cairo.', { deadline: clock(L, opts.deadline), time: clock(L, nowTime()) }); }, 30000);
} catch (err) {
  app.content.innerHTML = `<p class="callout late">${esc(friendly(L, err.message))}</p><div class="btn-row"><button type="button" class="btn primary" id="retry">${esc(L('Try again'))}</button></div>`;
  document.getElementById('retry').addEventListener('click', () => location.reload());
}
