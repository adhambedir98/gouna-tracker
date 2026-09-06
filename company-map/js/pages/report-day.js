// The company report. Every site's daily report, added up into one page for management. It builds itself.
// Reading it takes the management code. The same page manages the site list, the codes, and the monthly targets.
import { mount, loadJSON, esc, labels, store, toast, fmt, lang, initialHash, setHash } from '../app.js';

const L = await labels('report-day');
const cfg = await loadJSON('data/report.json');
const app = await mount({ page: 'report/day', title: L('Company report'), lede: L('Every site, added up into one page by 6:00 PM. Nobody collects anything.') });

const ZONE = cfg.zone || 'Africa/Cairo';
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: ZONE });
const clock = t => { if (!t) return ''; const [h, m] = String(t).split(':').map(Number); const hh = ((h + 11) % 12) + 1, mm = String(m || 0).padStart(2, '0'); return h >= 12 ? L('{t} PM', { t: `${hh}:${mm}` }) : L('{t} AM', { t: `${hh}:${mm}` }); };
const dayLabel = d => new Date(d + 'T12:00:00').toLocaleDateString(lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const shift = (d, n) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
const n = v => fmt(v ?? 0);
const TEAM = { direct: L('Our sites'), partner: L('Partner sites') };

const CODE = 'vm.report.code';
let code = store.get(CODE, '');
let day = /^\d{4}-\d{2}-\d{2}$/.test(initialHash()) ? initialHash() : today();
let data = null;

const H = { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key, 'Content-Type': 'application/json' };
async function rpc(fn, body) {
  const r = await fetch(`${cfg.url}/rest/v1/rpc/${fn}`, { method: 'POST', headers: H, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || j.hint || r.statusText || 'error');
  return j;
}
const admin = (action, p = {}) => rpc('dr_admin', { p_code: code, p_action: action, p });
function friendly(msg) {
  msg = String(msg || '');
  if (msg === 'wrong code') return L('That code is wrong.');
  if (msg === 'name is missing') return L('Write the site name.');
  if (msg === 'unknown site') return L('That site is not on the list.');
  if (msg === 'value is too short') return L('Make it at least three characters.');
  if (msg === 'bad month') return L('Pick a month.');
  if (msg.startsWith('not a number')) return L('That is not a number.');
  if (/fetch|network|load/i.test(msg)) return L('No connection. Try again when you have internet.');
  return msg;
}

/* the gate: one code, kept on this device */
function gate(msg) {
  app.content.innerHTML = `<form class="gate" id="gate">
    ${msg ? `<p class="callout late">${esc(msg)}</p>` : ''}
    <div class="ff"><label class="fl" for="g-code">${esc(L('Management code'))}</label><input type="password" id="g-code" autocomplete="current-password" required></div>
    <div class="btn-row"><button type="submit" class="btn primary">${esc(L('Open'))}</button></div>
    <p class="tiny dim">${esc(L('Adham, Moharam, Mano, Ahmed Alaa, and Youssef Medhat have this code.'))}</p>
  </form>`;
  document.getElementById('gate').addEventListener('submit', e => { e.preventDefault(); code = document.getElementById('g-code').value.trim(); load(); });
}

async function load() {
  if (!code) return gate();
  app.content.innerHTML = `<p class="mute">${esc(L('Loading'))}</p>`;
  try {
    data = await rpc('dr_report', { p_day: day, p_code: code });
    store.set(CODE, code);
    setHash(day === today() ? '' : day);
    render();
  } catch (err) {
    if (err.message === 'wrong code') { store.remove(CODE); code = ''; return gate(L('That code is wrong.')); }
    app.content.innerHTML = `<p class="callout late">${esc(friendly(err.message))}</p><div class="btn-row"><button type="button" class="btn primary" id="retry">${esc(L('Try again'))}</button></div>`;
    document.getElementById('retry').addEventListener('click', load);
  }
}

/* the page */
function render() {
  const d = data, t = d.totals, sites = d.sites || [];
  const missing = sites.filter(s => s.active && !s.report);
  const late = sites.filter(s => s.report && s.report.late);
  const target = Number(d.target_day) || 0;
  const teams = ['direct', 'partner'].filter(k => d.teams && d.teams[k]);
  const note = (key, title) => {
    const rows = sites.filter(s => s.report && String(s.report[key] || '').trim());
    if (!rows.length) return '';
    return `<section class="notes-block"><h3>${esc(title)}</h3><dl class="notes">${rows.map(s => `<dt>${esc(s.name)}</dt><dd>${esc(s.report[key])}</dd>`).join('')}</dl></section>`;
  };
  app.content.innerHTML = `
    <div class="daybar no-print">
      <button type="button" class="btn" id="prev" aria-label="${esc(L('The day before'))}">&lsaquo;</button>
      <input type="date" id="day" value="${esc(day)}" max="${today()}">
      <button type="button" class="btn" id="next" aria-label="${esc(L('The day after'))}" ${day >= today() ? 'disabled' : ''}>&rsaquo;</button>
      <button type="button" class="btn" id="reload">${esc(L('Refresh'))}</button>
      <span class="grow"></span>
      <button type="button" class="btn" id="copy">${esc(L('Copy as text'))}</button>
      <button type="button" class="btn" data-print="#rep" data-print-title="${esc(L('Company report'))}">${esc(L('Print or save a copy'))}</button>
    </div>
    <div id="rep">
      <h2>${esc(dayLabel(day))}</h2>
      <p class="mute small">${esc(L('Built at {time} Cairo time. Due by {deadline}.', { time: clock(String(d.built_at).slice(11)), deadline: clock(d.deadline) }))}</p>
      <div class="stat">
        <div><div class="big num">${n(t.hours)}</div><div class="lbl">${esc(target ? L('hours today, of {target} target', { target: n(target) }) : L('hours today'))}</div></div>
        <div><div class="big num">${n(t.reported)}<span class="mute"> / ${n(d.expected)}</span></div><div class="lbl">${esc(L('sites in'))}</div></div>
        <div><div class="big num">${n(t.phones_recording)}</div><div class="lbl">${esc(L('phones that recorded'))}</div></div>
        <div><div class="big num">${n(t.phones_out)}</div><div class="lbl">${esc(L('phones out of service'))}</div></div>
        <div><div class="big num">${n(t.workers)}</div><div class="lbl">${esc(L('workers who wore a phone'))}</div></div>
        <div><div class="big num">${n(t.flags)}</div><div class="lbl">${esc(L('flags received'))}</div></div>
        <div><div class="big num">${n(t.backlog)}</div><div class="lbl">${esc(L('device-days not yet uploaded'))}</div></div>
        <div><div class="big num">${n(d.month_hours)}</div><div class="lbl">${esc(Number(d.target_month) ? L('hours this month, of {target}', { target: n(d.target_month) }) : L('hours this month'))}</div></div>
      </div>
      ${missing.length ? `<p class="callout late"><b>${esc(L('Not in yet: {n}', { n: missing.length }))}</b> ${esc(missing.map(s => s.lead ? `${s.name} (${s.lead})` : s.name).join(', '))}</p>` : `<p class="callout ontime">${esc(L('Every site is in.'))}</p>`}
      ${late.length ? `<p class="mute small">${esc(L('Late: {list}', { list: late.map(s => `${s.name} ${clock(s.report.first_at)}`).join(', ') }))}</p>` : ''}

      <h3>${esc(L('By team'))}</h3>
      <div class="t-wrap"><table class="t rep"><thead><tr><th>${esc(L('Team'))}</th><th class="num">${esc(L('Sites in'))}</th><th class="num">${esc(L('Hours'))}</th><th class="num">${esc(L('Phones'))}</th><th class="num">${esc(L('Out'))}</th><th class="num">${esc(L('Workers'))}</th></tr></thead>
      <tbody>${teams.map(k => { const x = d.teams[k]; return `<tr><td>${esc(TEAM[k])}</td><td class="num">${n(x.reported)} / ${n(x.expected)}</td><td class="num">${n(x.hours)}</td><td class="num">${n(x.phones_recording)}</td><td class="num">${n(x.phones_out)}</td><td class="num">${n(x.workers)}</td></tr>`; }).join('')}</tbody></table></div>

      <h3>${esc(L('By site'))}</h3>
      <div class="t-wrap"><table class="t rep"><thead><tr><th>${esc(L('Site'))}</th><th>${esc(L('Who'))}</th><th>${esc(L('Sent'))}</th><th class="num">${esc(L('Hours'))}</th><th class="num">${esc(L('Phones'))}</th><th class="num">${esc(L('Out'))}</th><th class="num">${esc(L('Workers'))}</th><th class="num">${esc(L('Backlog'))}</th><th class="num">${esc(L('Flags'))}</th></tr></thead>
      <tbody>${sites.map(s => { const r = s.report; return r
        ? `<tr><td><b>${esc(s.name)}</b><span class="tiny mute" style="display:block">${esc(TEAM[s.team])}</span></td><td>${esc(r.reporter)}</td><td>${esc(clock(r.first_at))}${r.late ? `<span class="pill late">${esc(L('late'))}</span>` : ''}</td><td class="num">${n(r.hours)}</td><td class="num">${n(r.phones_recording)}</td><td class="num">${n(r.phones_out)}</td><td class="num">${n(r.workers)}</td><td class="num">${n(r.backlog)}</td><td class="num">${n(r.flags)}</td></tr>`
        : `<tr class="mute"><td><b>${esc(s.name)}</b><span class="tiny mute" style="display:block">${esc(TEAM[s.team])}</span></td><td>${esc(s.lead || '')}</td><td><span class="pill miss">${esc(L('not in'))}</span></td><td class="num"></td><td class="num"></td><td class="num"></td><td class="num"></td><td class="num"></td><td class="num"></td></tr>`; }).join('')}</tbody></table></div>

      ${note('problems', L('Problems'))}
      ${note('out_why', L('Out of service'))}
      ${note('hardware', L('Hardware'))}
      ${note('flags_note', L('Flags: what was fixed'))}
      ${note('absences', L('Absences tomorrow'))}
      ${note('fixes', L('Fixes worth copying'))}
      ${note('operators', L('Hours per operator'))}

      ${(d.days || []).length > 1 ? `<h3>${esc(L('The last two weeks'))}</h3>
      <div class="t-wrap"><table class="t rep"><thead><tr><th>${esc(L('Day'))}</th><th class="num">${esc(L('Sites in'))}</th><th class="num">${esc(L('Hours'))}</th></tr></thead>
      <tbody>${d.days.slice().reverse().map(x => `<tr><td>${esc(dayLabel(x.day))}</td><td class="num">${n(x.reported)}</td><td class="num">${n(x.hours)}</td></tr>`).join('')}</tbody></table></div>` : ''}
    </div>
    <details class="rep-admin no-print" id="admin"><summary>${esc(L('Sites, codes, and targets'))}</summary><div id="admin-body"><p class="mute">${esc(L('Loading'))}</p></div></details>`;

  document.getElementById('prev').addEventListener('click', () => { day = shift(day, -1); load(); });
  document.getElementById('next').addEventListener('click', () => { day = shift(day, 1); load(); });
  document.getElementById('reload').addEventListener('click', load);
  document.getElementById('day').addEventListener('change', e => { if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) { day = e.target.value; load(); } });
  document.getElementById('copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(asText()); toast(L('Copied. Paste it into the group.')); } catch { toast(L('Could not copy on this device.')); }
  });
  const det = document.getElementById('admin');
  det.addEventListener('toggle', () => { if (det.open) renderAdmin(); }, { once: true });
}

/* the same report as plain text, for the management group */
function asText() {
  const d = data, t = d.totals, sites = d.sites || [];
  const missing = sites.filter(s => s.active && !s.report);
  const lines = [];
  lines.push(L('Company report, {day}', { day: dayLabel(day) }));
  lines.push(L('Hours: {n}', { n: n(t.hours) }) + (Number(d.target_day) ? ' ' + L('of {target} target', { target: n(d.target_day) }) : ''));
  lines.push(L('Sites in: {a} of {b}', { a: n(t.reported), b: n(d.expected) }) + (missing.length ? '. ' + L('Not in: {list}', { list: missing.map(s => s.name).join(', ') }) : ''));
  lines.push(L('Phones that recorded: {a}. Out of service: {b}. Workers: {c}. Flags: {d}. Not yet uploaded: {e} device-days', { a: n(t.phones_recording), b: n(t.phones_out), c: n(t.workers), d: n(t.flags), e: n(t.backlog) }));
  lines.push(L('This month: {a} hours', { a: n(d.month_hours) }) + (Number(d.target_month) ? ' ' + L('of {target}', { target: n(d.target_month) }) : ''));
  lines.push('');
  for (const s of sites) {
    const r = s.report;
    if (!r) { lines.push(`${s.name}: ${L('not in')}`); continue; }
    lines.push(`${s.name}, ${r.reporter}, ${clock(r.first_at)}${r.late ? ' (' + L('late') + ')' : ''}: ${L('{h} hours, {p} phones', { h: n(r.hours), p: n(r.phones_recording) })}${r.phones_out ? ', ' + L('{n} out', { n: n(r.phones_out) }) : ''}${r.flags ? ', ' + L('{n} flags', { n: n(r.flags) }) : ''}`);
  }
  const block = (key, title) => {
    const rows = sites.filter(s => s.report && String(s.report[key] || '').trim());
    if (!rows.length) return;
    lines.push('', title + ':');
    for (const s of rows) lines.push(`${s.name}: ${String(s.report[key]).trim()}`);
  };
  block('problems', L('Problems'));
  block('hardware', L('Hardware'));
  block('absences', L('Absences tomorrow'));
  block('fixes', L('Fixes worth copying'));
  return lines.join('\n');
}

/* management: the site list, the codes, the deadline, the targets */
async function renderAdmin() {
  const box = document.getElementById('admin-body');
  let sites, settings;
  try { [sites, settings] = await Promise.all([admin('sites'), admin('settings')]); }
  catch (err) { box.innerHTML = `<p class="callout late">${esc(friendly(err.message))}</p>`; return; }
  let targets = {};
  try { targets = JSON.parse(settings.targets || '{}'); } catch {}
  const months = Object.keys(targets).sort();
  const row = s => `<tr data-id="${esc(s.id)}">
    <td><input type="text" data-k="name" value="${esc(s.name)}"></td>
    <td><select data-k="team"><option value="direct"${s.team === 'direct' ? ' selected' : ''}>${esc(TEAM.direct)}</option><option value="partner"${s.team === 'partner' ? ' selected' : ''}>${esc(TEAM.partner)}</option></select></td>
    <td><input type="text" data-k="lead" value="${esc(s.lead || '')}"></td>
    <td><label class="opt"><input type="checkbox" data-k="active"${s.active ? ' checked' : ''}> ${esc(L('reports daily'))}</label></td>
    <td><button type="button" class="btn" data-save>${esc(L('Save'))}</button></td></tr>`;
  box.innerHTML = `
    <h3>${esc(L('Sites'))}</h3>
    <p class="mute small">${esc(L('Every site that reports daily is expected by 6:00 PM. Untick a site when it closes, and it drops off the missing list.'))}</p>
    <div class="t-wrap"><table class="t sites"><thead><tr><th>${esc(L('Site'))}</th><th>${esc(L('Team'))}</th><th>${esc(L('Lead'))}</th><th></th><th></th></tr></thead><tbody id="site-rows">${sites.map(row).join('')}</tbody></table></div>
    <form id="site-add" class="fgrid" autocomplete="off">
      <div class="ff"><label class="fl" for="a-name">${esc(L('New site'))}</label><input type="text" id="a-name" required></div>
      <div class="ff"><label class="fl" for="a-team">${esc(L('Team'))}</label><select id="a-team"><option value="direct">${esc(TEAM.direct)}</option><option value="partner">${esc(TEAM.partner)}</option></select></div>
      <div class="ff"><label class="fl" for="a-lead">${esc(L('Lead'))}</label><input type="text" id="a-lead"></div>
      <div class="ff"><span class="fl">&nbsp;</span><button type="submit" class="btn primary">${esc(L('Add site'))}</button></div>
    </form>

    <h3 style="margin-top:28px">${esc(L('Monthly targets'))}</h3>
    <div class="t-wrap"><table class="t"><thead><tr><th>${esc(L('Month'))}</th><th class="num">${esc(L('Hours'))}</th></tr></thead><tbody>${months.map(m => `<tr><td>${esc(m)}</td><td class="num">${n(targets[m])}</td></tr>`).join('') || `<tr><td colspan="2" class="mute">${esc(L('No target set yet.'))}</td></tr>`}</tbody></table></div>
    <form id="target-form" class="fgrid" autocomplete="off">
      <div class="ff"><label class="fl" for="t-month">${esc(L('Month'))}</label><input type="month" id="t-month" value="${esc(today().slice(0, 7))}" required></div>
      <div class="ff"><label class="fl" for="t-hours">${esc(L('Hours for the month'))}</label><input type="number" id="t-hours" min="0" step="1" required></div>
      <div class="ff"><span class="fl">&nbsp;</span><button type="submit" class="btn primary">${esc(L('Set target'))}</button></div>
    </form>

    <h3 style="margin-top:28px">${esc(L('Codes and deadline'))}</h3>
    <form id="settings-form" class="fgrid" autocomplete="off">
      <div class="ff"><label class="fl" for="s-team">${esc(L('Team code'))}<small>${esc(L('Everyone who sends a daily report types this once.'))}</small></label><input type="text" id="s-team" value="${esc(settings.team_code || '')}" minlength="3"></div>
      <div class="ff"><label class="fl" for="s-deadline">${esc(L('Deadline, Cairo time'))}</label><input type="time" id="s-deadline" value="${esc(settings.deadline || '18:00')}"></div>
      <div class="ff"><label class="fl" for="s-report">${esc(L('New management code'))}<small>${esc(L('Leave empty to keep the current one.'))}</small></label><input type="text" id="s-report" minlength="6" autocomplete="off"></div>
      <div class="ff"><span class="fl">&nbsp;</span><button type="submit" class="btn primary">${esc(L('Save'))}</button></div>
    </form>`;

  box.querySelector('#site-rows').addEventListener('click', async e => {
    const b = e.target.closest('[data-save]'); if (!b) return;
    const tr = b.closest('tr');
    const p = { id: tr.dataset.id };
    tr.querySelectorAll('[data-k]').forEach(el => { p[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.value; });
    b.disabled = true;
    try { await admin('site_set', p); toast(L('Saved.')); await load(); document.getElementById('admin').open = true; renderAdmin(); }
    catch (err) { toast(friendly(err.message)); b.disabled = false; }
  });
  box.querySelector('#site-add').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await admin('site_add', { name: document.getElementById('a-name').value, team: document.getElementById('a-team').value, lead: document.getElementById('a-lead').value });
      toast(L('Saved.')); await load(); document.getElementById('admin').open = true; renderAdmin();
    } catch (err) { toast(friendly(err.message)); }
  });
  box.querySelector('#target-form').addEventListener('submit', async e => {
    e.preventDefault();
    try { await admin('target', { month: document.getElementById('t-month').value, hours: document.getElementById('t-hours').value }); toast(L('Saved.')); await load(); document.getElementById('admin').open = true; renderAdmin(); }
    catch (err) { toast(friendly(err.message)); }
  });
  box.querySelector('#settings-form').addEventListener('submit', async e => {
    e.preventDefault();
    const team = document.getElementById('s-team').value.trim(), dl = document.getElementById('s-deadline').value, rep = document.getElementById('s-report').value.trim();
    try {
      if (team && team !== settings.team_code) await admin('setting', { key: 'team_code', value: team });
      if (dl && dl !== settings.deadline) await admin('setting', { key: 'deadline', value: dl });
      if (rep) {
        if (!confirm(L('Change the management code? Everyone who reads this page will need the new one.'))) return;
        await admin('setting', { key: 'report_code', value: rep });
        code = rep; store.set(CODE, code);
      }
      toast(L('Saved.')); await load(); document.getElementById('admin').open = true; renderAdmin();
    } catch (err) { toast(friendly(err.message)); }
  });
}

load();
