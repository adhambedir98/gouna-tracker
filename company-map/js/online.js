// Shared by the online pages: the database calls, the Cairo clock, the management gate, and the plain-words errors.
// The pages are report (the daily report), report/checkin, report/incident, report/day, report/incidents, sites, and team.
import { loadJSON, esc, store, lang } from './app.js';

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
export function peopleOptions(L, people, chosen) {
  const known = people.some(p => p.id === chosen);
  const ROLE = roleLabels(L);
  const group = (title, rows) => rows.length ? `<optgroup label="${esc(title)}">${rows.map(p => `<option value="${esc(p.id)}"${p.id === chosen ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</optgroup>` : '';
  const by = r => people.filter(p => p.role === r);
  return `<option value="">${esc(L('Pick your name'))}</option>`
    + group(ROLE['site-lead'], by('site-lead')) + group(ROLE['portfolio-manager'], by('portfolio-manager')) + group(ROLE.partner, by('partner'))
    + group(ROLE.management, [...by('management'), ...by('planning')])
    + `<option value="${OTHER}"${chosen && !known && chosen !== '' ? ' selected' : ''}>${esc(L('Someone else'))}</option>`;
}
export function siteOptions(L, sites, chosen, extra = '') {
  const names = { direct: L('Our sites'), partner: L('Partner sites') };
  const groups = ['direct', 'partner'].map(team => {
    const rows = sites.filter(s => s.team === team);
    if (!rows.length) return '';
    return `<optgroup label="${esc(names[team])}">${rows.map(s => `<option value="${esc(s.id)}"${s.id === chosen ? ' selected' : ''}>${esc(s.name)}${s.lead ? ` (${esc(s.lead)})` : ''}</option>`).join('')}</optgroup>`;
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
