// The daily report. One form for every site, in by 6:00 PM, for Portfolio Managers and partner site leads alike.
// It sends straight to the company database. The company report page adds every site up on its own.
import { mount, loadJSON, esc, labels, store, toast, fmt, lang } from '../app.js';

const L = await labels('report');
const cfg = await loadJSON('data/report.json');
const app = await mount({ page: 'report', title: L('Daily report'), lede: L('One form for every site, in by 6:00 PM. The company report builds itself from these.') });

const KEY = 'vm.report';          // name, site, and team code: remembered on this device
const DRAFT = 'vm.report.draft';  // what is typed, until it is sent
let mem = store.get(KEY, {});
let draft = store.get(DRAFT, {});
let last = null;

const ZONE = cfg.zone || 'Africa/Cairo';
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: ZONE });
const clock = t => { const [h, m] = String(t).split(':').map(Number); const hh = ((h + 11) % 12) + 1, mm = String(m || 0).padStart(2, '0'); return h >= 12 ? L('{t} PM', { t: `${hh}:${mm}` }) : L('{t} AM', { t: `${hh}:${mm}` }); };
const nowClock = () => clock(new Date().toLocaleTimeString('en-GB', { timeZone: ZONE, hour: '2-digit', minute: '2-digit' }));
const dayLabel = d => new Date(d + 'T12:00:00').toLocaleDateString(lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const deadline = clock(cfg.deadline || '18:00');

const H = { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key, 'Content-Type': 'application/json' };
async function rpc(fn, body) {
  const r = await fetch(`${cfg.url}/rest/v1/rpc/${fn}`, { method: 'POST', headers: H, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || j.hint || r.statusText || 'error');
  return j;
}
async function loadSites() {
  const r = await fetch(`${cfg.url}/rest/v1/dr_sites?select=id,name,team,lead&active=eq.true&order=team.asc,sort.asc,name.asc`, { headers: H });
  if (!r.ok) throw new Error('sites');
  return r.json();
}

// what the database says when something is wrong, in plain words
const ERR = {
  'wrong team code': L('The team code is wrong. Ask your Portfolio Manager or Mano.'),
  'unknown site': L('Pick your site from the list.'),
  'name is missing': L('Write your name.'),
  'hours are missing': L('Write the hours recorded today.'),
  'day is in the future': L('That date has not happened yet.'),
  'day is too far back': L('That date is more than a week ago. Ask Mano to enter it.'),
  'bad date': L('Check the date.')
};
function friendly(msg) {
  msg = String(msg || '');
  if (ERR[msg]) return ERR[msg];
  if (msg.startsWith('not a number')) return L('One of the numbers is not a number.');
  if (msg.startsWith('out of range')) return L('One of the numbers is too big.');
  if (/fetch|network|sites|load/i.test(msg)) return L('No connection. Try again when you have internet.');
  return msg;
}

function field(id, label, type = 'text', extra = '', hint = '') {
  const v = draft[id] ?? '';
  const lab = `<label class="fl" for="f-${id}">${esc(label)}${hint ? `<small>${esc(hint)}</small>` : ''}</label>`;
  if (type === 'long') return `<div class="ff">${lab}<textarea id="f-${id}" data-f="${id}" rows="3">${esc(v)}</textarea></div>`;
  return `<div class="ff">${lab}<input type="${type}" id="f-${id}" data-f="${id}" value="${esc(v)}" ${extra}></div>`;
}
const num = (id, label, hint = '') => field(id, label, 'number', 'inputmode="decimal" min="0" step="0.5"', hint);
const count = (id, label, hint = '') => field(id, label, 'number', 'inputmode="numeric" min="0" step="1"', hint);

function siteOptions(list, chosen) {
  const names = { direct: L('Our sites'), partner: L('Partner sites') };
  const groups = ['direct', 'partner'].map(team => {
    const rows = list.filter(s => s.team === team);
    if (!rows.length) return '';
    return `<optgroup label="${esc(names[team])}">${rows.map(s => `<option value="${esc(s.id)}"${s.id === chosen ? ' selected' : ''}>${esc(s.name)}${s.lead ? ` (${esc(s.lead)})` : ''}</option>`).join('')}</optgroup>`;
  }).join('');
  return `<option value="">${esc(L('Pick your site'))}</option>${groups}`;
}

let sites = [];
function render() {
  const now = today();
  app.content.innerHTML = `
    <p class="callout" id="clockline">${esc(L('Due by {deadline}. It is now {time} in Cairo.', { deadline, time: nowClock() }))}</p>
    ${sites.length ? '' : `<p class="callout late">${esc(L('No sites on the list yet. Mano adds them on the company report page.'))}</p>`}
    <form class="stdform" id="rform" autocomplete="off">
      <section><h2>${esc(L('You and the site'))}</h2><div class="fgrid">
        <div class="ff"><label class="fl" for="f-name">${esc(L('Your name'))}</label><input type="text" id="f-name" data-f="name" value="${esc(draft.name ?? mem.name ?? '')}" required></div>
        <div class="ff"><label class="fl" for="f-site">${esc(L('Site'))}</label><select id="f-site" data-f="site" required>${siteOptions(sites, draft.site ?? mem.site)}</select></div>
        <div class="ff"><label class="fl" for="f-date">${esc(L('Date'))}</label><input type="date" id="f-date" data-f="date" value="${esc(draft.date || now)}" max="${now}" required></div>
      </div></section>
      <section><h2>${esc(L('The numbers'))}</h2><div class="fgrid">
        ${num('hours', L('Hours recorded today'))}
        ${count('phones_recording', L('Phones that recorded today'))}
        ${count('phones_out', L('Phones out of service'))}
        ${field('out_why', L('Out of service: which ones, and why'))}
        ${count('workers', L('Workers who wore a phone'))}
        ${num('backlog', L('Not yet uploaded, in device-days'), L('One phone with one day of video still on it is one device-day.'))}
        ${count('flags', L('Flags received today'))}
        ${field('flags_note', L('Flags: what was fixed'))}
      </div></section>
      <section><h2>${esc(L('Problems and fixes'))}</h2><div class="fgrid">
        ${field('problems', L('Problems today'), 'long')}
        ${field('hardware', L('Hardware: what broke, what was swapped'), 'long')}
        ${field('fixes', L('Fixes worth copying'), 'long')}
        ${field('absences', L('Absences tomorrow, and who covers'))}
        ${field('operators', L('Hours per operator, one line each'), 'long', '', L('Our sites only. Partner sites leave this empty.'))}
      </div></section>
      <section><h2>${esc(L('Send'))}</h2><div class="fgrid">
        <div class="ff"><label class="fl" for="f-code">${esc(L('Team code'))}<small>${esc(L('Your Portfolio Manager or Mano gives you this once.'))}</small></label><input type="text" id="f-code" data-f="code" value="${esc(draft.code ?? mem.code ?? '')}" autocapitalize="off" required></div>
      </div>
      <div class="btn-row"><button type="submit" class="btn primary" id="send">${esc(L('Send'))}</button><button type="button" class="btn" id="f-clear">${esc(L('Clear'))}</button></div>
      </section>
    </form>
    <p class="tiny dim">${esc(L('Your name, site, and team code stay on this device. What you type stays until you send it.'))}</p>`;

  const form = document.getElementById('rform');
  const read = () => { const o = {}; form.querySelectorAll('[data-f]').forEach(el => { o[el.dataset.f] = el.value; }); return o; };
  const keep = () => { draft = read(); store.set(DRAFT, draft); };
  form.addEventListener('input', keep);
  form.addEventListener('change', keep);
  document.getElementById('f-clear').addEventListener('click', () => {
    if (!confirm(L('Clear everything on this form?'))) return;
    draft = {}; store.set(DRAFT, {}); render();
  });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const v = read();
    const btn = document.getElementById('send');
    const p = { code: v.code, site_id: v.site, reporter: v.name, day: v.date, hours: v.hours, phones_recording: v.phones_recording, phones_out: v.phones_out, out_why: v.out_why,
      workers: v.workers, backlog: v.backlog, flags: v.flags, flags_note: v.flags_note, problems: v.problems, hardware: v.hardware, fixes: v.fixes, absences: v.absences, operators: v.operators };
    btn.disabled = true; btn.textContent = L('Sending');
    try {
      const out = await rpc('dr_submit', { p });
      mem = { name: v.name, site: v.site, code: v.code }; store.set(KEY, mem);
      last = v; draft = {}; store.set(DRAFT, {});
      done(out);
    } catch (err) {
      toast(friendly(err.message));
      btn.disabled = false; btn.textContent = L('Send');
    }
  });
}

function done(o) {
  app.content.innerHTML = `<section class="card panel sent" id="sent">
    <h2>${esc(L('Sent'))}</h2>
    <p class="big-rule">${esc(L('{site}, {day}: {hours} hours.', { site: o.site, day: dayLabel(o.day), hours: fmt(o.hours) }))}</p>
    <p>${esc(L('Sent at {time}.', { time: clock(o.sent_at) }))}${o.updated ? ' ' + esc(L('This replaces what was sent earlier for this site and day.')) : ''}</p>
    <p class="${o.late ? 'late' : 'ontime'}">${esc(o.late ? L('This came in after {deadline}. It counts as late.', { deadline }) : L('In on time.'))}</p>
    <div class="btn-row"><button type="button" class="btn primary" id="again">${esc(L('Send another site'))}</button><button type="button" class="btn" id="fix">${esc(L('Fix this report'))}</button></div>
  </section>`;
  document.getElementById('again').addEventListener('click', () => { draft = {}; render(); });
  document.getElementById('fix').addEventListener('click', () => { draft = { ...(last || {}) }; store.set(DRAFT, draft); render(); });
}

try {
  sites = await loadSites();
  render();
  setInterval(() => { const el = document.getElementById('clockline'); if (el) el.textContent = L('Due by {deadline}. It is now {time} in Cairo.', { deadline, time: nowClock() }); }, 30000);
} catch (err) {
  app.content.innerHTML = `<p class="callout late">${esc(friendly(err.message))}</p><div class="btn-row"><button type="button" class="btn primary" id="retry">${esc(L('Try again'))}</button></div>`;
  document.getElementById('retry').addEventListener('click', () => location.reload());
}
