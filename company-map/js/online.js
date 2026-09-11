// Shared by the online pages: the database calls, the Cairo clock, the management gate, and the plain-words errors.
// The pages are report (the evening check-out), report/checkin, report/incident, report/day, report/incidents, sites, and team.
import { loadJSON, esc, store, lang, toast } from './app.js';

export const cfg = await loadJSON('data/report.json');
export const ZONE = cfg.zone || 'Africa/Cairo';
export const CODE = 'vm.report.code';   // the management code, kept on this device
export const OTHER = '__other';         // the "someone else" choice in a name list

const H = { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key, 'Content-Type': 'application/json' };
export async function rpc(fn, body) {
  const r = await fetch(`${cfg.url}/rest/v1/rpc/${fn}`, { method: 'POST', headers: H, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || j.hint || r.statusText || 'error');
  return j;
}
export const admin = (code, action, p = {}) => rpc('dr_admin', { p_code: code, p_action: action, p });

/* the clock, always Cairo time */
export const today = () => new Date().toLocaleDateString('en-CA', { timeZone: ZONE });
export const shift = (d, n) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
export const nowTime = () => new Date().toLocaleTimeString('en-GB', { timeZone: ZONE, hour: '2-digit', minute: '2-digit' });
export const clock = (L, t) => {
  if (!t) return '';
  const [h, m] = String(t).split(':').map(Number);
  const hh = ((h + 11) % 12) + 1, mm = String(m || 0).padStart(2, '0');
  return h >= 12 ? L('{t} PM', { t: `${hh}:${mm}` }) : L('{t} AM', { t: `${hh}:${mm}` });
};
export const dayLabel = d => new Date(d + 'T12:00:00').toLocaleDateString(lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
export const shortDay = d => new Date(d + 'T12:00:00').toLocaleDateString(lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short' });

/* what the database says when something is wrong, in plain words. Each page adds its own lines. */
export function friendly(L, msg, own = {}) {
  msg = String(msg || '');
  if (own[msg]) return own[msg];
  if (msg === 'wrong code') return L('That code is wrong.');
  if (msg === 'wrong team code') return L('The team code is wrong. Ask your Portfolio Manager or Mano.');
  if (msg === 'unknown site') return L('Pick the site from the list.');
  if (msg === 'name is missing') return L('Pick your name, or write it.');
  if (msg === 'day is in the future') return L('That date has not happened yet.');
  if (msg === 'bad date') return L('Check the date.');
  if (msg === 'bad time') return L('Check the time.');
  if (msg === 'value is too short') return L('Make it at least three characters.');
  if (msg.startsWith('not a number')) return L('One of the numbers is not a number.');
  if (msg.startsWith('out of range')) return L('One of the numbers is too big.');
  if (/duplicate|unique/i.test(msg)) return L('That name is already on the list.');
  if (/fetch|network|load/i.test(msg)) return L('No connection. Try again when you have internet.');
  return msg;
}

/* the management gate: one code, kept on this device. onOpen(code) loads the page. */
export function gate(app, L, onOpen, msg, note) {
  app.content.innerHTML = `<form class="gate" id="gate">
    ${msg ? `<p class="callout late">${esc(msg)}</p>` : ''}
    <div class="ff"><label class="fl" for="g-code">${esc(L('Management code'))}</label><input type="password" id="g-code" autocomplete="current-password" required></div>
    <div class="btn-row"><button type="submit" class="btn primary">${esc(L('Open'))}</button></div>
    ${note ? `<p class="tiny dim">${esc(note)}</p>` : ''}
  </form>`;
  document.getElementById('gate').addEventListener('submit', e => { e.preventDefault(); onOpen(document.getElementById('g-code').value.trim()); });
}
export const loading = (app, L) => { app.content.innerHTML = `<p class="mute">${esc(L('Loading'))}</p>`; };
export function failed(app, L, msg, retry) {
  app.content.innerHTML = `<p class="callout late">${esc(msg)}</p><div class="btn-row"><button type="button" class="btn primary" id="retry">${esc(L('Try again'))}</button></div>`;
  document.getElementById('retry').addEventListener('click', retry);
}

/* a name list from the people directory: the person's id, or "someone else" with a typed name */
export function peopleOptions(L, people, chosen, { roles = null, other = true } = {}) {
  // roles: only these roles are listed (the check-ins take Portfolio Managers and partners); other: whether "someone else" is offered
  if (roles) people = people.filter(p => roles.includes(p.role));
  const known = people.some(p => p.id === chosen);
  const ROLE = roleLabels(L);
  const group = (title, rows) => rows.length ? `<optgroup label="${esc(title)}">${rows.map(p => `<option value="${esc(p.id)}"${p.id === chosen ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</optgroup>` : '';
  const by = r => people.filter(p => p.role === r);
  return `<option value="">${esc(L('Pick your name'))}</option>`
    + group(ROLE['site-lead'], by('site-lead')) + group(ROLE['portfolio-manager'], by('portfolio-manager')) + group(ROLE.partner, by('partner'))
    + group(ROLE.management, [...by('management'), ...by('planning')])
    + (other ? `<option value="${OTHER}"${chosen && !known && chosen !== '' ? ' selected' : ''}>${esc(L('Someone else'))}</option>` : '');
}
export function siteOptions(L, sites, chosen, extra = '', { lead = true } = {}) {
  // lead: whether the site lead's name follows the site's (never when it is the site's own name, as on partner sites named after the partner)
  const names = { direct: L('Direct'), partner: L('Partner') };
  const groups = ['direct', 'partner'].map(team => {
    const rows = sites.filter(s => s.team === team);
    if (!rows.length) return '';
    return `<optgroup label="${esc(names[team])}">${rows.map(s => `<option value="${esc(s.id)}"${s.id === chosen ? ' selected' : ''}>${esc(s.name)}${lead && s.lead && s.lead !== s.name ? ` (${esc(s.lead)})` : ''}</option>`).join('')}</optgroup>`;
  }).join('');
  return `<option value="">${esc(L('Pick the site'))}</option>${groups}${extra}`;
}
export const roleLabels = L => ({
  management: L('Management'), 'portfolio-manager': L('Portfolio Managers'), 'site-lead': L('Site leads'), operator: L('Operators'), partner: L('Partners'),
  runner: L('Runners'), 'hub-attendant': L('Hub attendants'), 'quality-reviewer': L('Quality reviewers'), planning: L('Planning and logistics')
});
export const roleLabel = L => ({
  management: L('Management'), 'portfolio-manager': L('Portfolio Manager'), 'site-lead': L('Site lead'), operator: L('Operator'), partner: L('Partner'),
  runner: L('Runner'), 'hub-attendant': L('Hub attendant'), 'quality-reviewer': L('Quality reviewer'), planning: L('Planning and logistics')
});
export const kindLabel = L => ({ injury: L('Injury'), theft: L('Theft or a lost phone'), checkpoint: L('Police checkpoint'), power: L('Power or internet down'), gear: L('A phone or gear problem'), other: L('Something else') });

/* the phone ledger shared by the morning check-in and the evening check-out: one row per phone, the tag picked from a list
   (1 to phones_max, nothing else exists), minutes all time, minutes still saved on it. The tags a site used last are remembered
   on this device and offered again, and the evening form starts from the morning rows the database holds for that site. */
export const PHONES = 'vm.report.phones';   // { site_id: [tags] } on this device
export function ledgerHTML(L, rows, max, hint) {
  return `<div class="t-wrap"><table class="t reg ledger" id="phones"><thead><tr><th>${esc(L('Phone'))}</th><th>${esc(L('Minutes all time'))}</th><th>${esc(L('Minutes saved locally'))}</th><th></th></tr></thead>
    <tbody>${(rows && rows.length ? rows : [{}]).map(r => ledgerRow(L, r, max)).join('')}</tbody></table></div>
    <div class="btn-row"><button type="button" class="btn" id="add-phone">${esc(L('Add a phone'))}</button>${hint ? `<span class="tiny mute">${esc(hint)}</span>` : ''}</div>`;
}
export function ledgerRow(L, r = {}, max = 270) {
  const opts = [`<option value="">${esc(L('Pick'))}</option>`];
  for (let i = 1; i <= max; i++) opts.push(`<option value="${i}"${String(r.tag) === String(i) ? ' selected' : ''}>${i}</option>`);
  return `<tr><td><select data-ph="tag" aria-label="${esc(L('Phone'))}">${opts.join('')}</select></td><td><input type="number" inputmode="numeric" min="0" step="1" data-ph="total" value="${esc(r.total ?? '')}" aria-label="${esc(L('Minutes all time'))}"></td><td><input type="number" inputmode="numeric" min="0" step="1" data-ph="local" value="${esc(r.local ?? '')}" aria-label="${esc(L('Minutes saved locally'))}"></td><td><button type="button" class="btn small" data-remove>${esc(L('Remove'))}</button></td></tr>`;
}
export const ledgerRead = form => [...form.querySelectorAll('#phones tbody tr')].map(tr => ({ tag: tr.querySelector('[data-ph=tag]').value, total: tr.querySelector('[data-ph=total]').value, local: tr.querySelector('[data-ph=local]').value })).filter(r => r.tag || r.total || r.local);
export function ledgerWire(form, L, max, keep) {
  const body = () => form.querySelector('#phones tbody');
  form.querySelector('#add-phone').addEventListener('click', () => { body().insertAdjacentHTML('beforeend', ledgerRow(L, {}, max)); body().querySelector('tr:last-child select').focus(); keep(); });
  form.addEventListener('click', e => { const b = e.target.closest('[data-remove]'); if (!b) return; b.closest('tr').remove(); if (!body().children.length) body().insertAdjacentHTML('beforeend', ledgerRow(L, {}, max)); keep(); });
  // Enter in the last cell of the last row adds a row, so a long list types straight through
  form.addEventListener('keydown', e => { if (e.key !== 'Enter' || !e.target.matches('#phones [data-ph=local]')) return; e.preventDefault(); if (e.target.closest('tr') === body().querySelector('tr:last-child')) form.querySelector('#add-phone').click(); });
  // a phone picked twice: the second pick is cleared and said so
  form.addEventListener('change', e => { if (!e.target.matches('#phones [data-ph=tag]') || !e.target.value) return; const same = [...form.querySelectorAll('#phones [data-ph=tag]')].filter(s => s !== e.target && s.value === e.target.value); if (same.length) { e.target.value = ''; toast(L('Phone {n} is already on the list.', { n: e.target.selectedOptions?.[0]?.text || same[0].value })); } });
}
/* the rows to start a form with: what is typed (the draft), else the tags known for the site, minutes empty */
export function ledgerStart(draft, site, opts, mem) {
  if (draft.phones && draft.phones.length) return draft.phones;
  const known = (opts.phones && opts.phones[site] && opts.phones[site].tags) || (mem[site]) || [];
  return known.map(tag => ({ tag: String(tag) }));
}
/* a check before sending: every row complete */
export const ledgerBad = rows => rows.find(r => !r.tag || r.total === '');
