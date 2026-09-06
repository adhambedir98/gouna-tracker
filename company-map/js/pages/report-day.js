// The company report. Every site's daily report, added up into one page for management. It builds itself.
// Reading it takes the management code. The same page manages the codes, the deadline, the reporters, the targets, and the posts.
import { mount, loadJSON, esc, labels, store, toast, fmt, lang, initialHash, setHash, href } from '../app.js';

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
  if (msg === 'value is too short') return L('Make it at least three characters.');
  if (msg === 'bad month') return L('Pick a month.');
  if (msg === 'not a Slack webhook') return L('That is not a Slack webhook address.');
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
  const note = (key, title, only) => {
    const rows = sites.filter(s => s.report && String(s.report[key] || '').trim() && (!only || only(s.report)));
    if (!rows.length) return '';
    return `<section class="notes-block"><h3>${esc(title)}</h3><dl class="notes">${rows.map(s => `<dt>${esc(s.name)}</dt><dd>${esc(s.report[key])}</dd>`).join('')}</dl></section>`;
  };
  const stat = (v, label) => `<div><div class="big num">${v}</div><div class="lbl">${esc(label)}</div></div>`;
  app.content.innerHTML = `
    <div class="daybar no-print">
      <button type="button" class="btn" id="prev" aria-label="${esc(L('The day before'))}">&lsaquo;</button>
      <input type="date" id="day" value="${esc(day)}" max="${today()}">
      <button type="button" class="btn" id="next" aria-label="${esc(L('The day after'))}" ${day >= today() ? 'disabled' : ''}>&rsaquo;</button>
      <button type="button" class="btn" id="reload">${esc(L('Refresh'))}</button>
      <span class="grow"></span>
      <a class="btn" href="${href('sites')}">${esc(L('Site registry'))}</a>
      <button type="button" class="btn" id="copy">${esc(L('Copy as text'))}</button>
      <button type="button" class="btn" data-print="#rep" data-print-title="${esc(L('Company report'))}">${esc(L('Print or save a copy'))}</button>
    </div>
    <div id="rep">
      <h2>${esc(dayLabel(day))}</h2>
      <p class="mute small">${esc(L('Built at {time} Cairo time. Due by {deadline}. A site with no report counts as zero.', { time: clock(String(d.built_at).slice(11)), deadline: clock(d.deadline) }))}</p>
      <div class="stat">
        ${stat(n(t.hours), target ? L('hours recorded, of {target} target', { target: n(target) }) : L('hours recorded'))}
        ${stat(`${n(t.reported)}<span class="mute"> / ${n(d.expected)}</span>`, L('sites in'))}
        ${stat(n(t.hours_uploaded), L('hours uploaded'))}
        ${stat(`${n(t.phones_uploaded)}<span class="mute"> / ${n(t.phones_deployed)}</span>`, L('phones uploaded, of deployed'))}
        ${stat(n(t.backlog), L('phones still holding footage'))}
        ${stat(`${n(t.wearers_present)}<span class="mute"> / ${n(t.wearers_scheduled)}</span>`, L('wearers present, of scheduled'))}
        ${stat(n(t.phones_out), L('phones down'))}
        ${stat(n(t.flags), L('flags received'))}
        ${stat(n(t.incidents), L('incidents'))}
        ${stat(n(d.month_hours), Number(d.target_month) ? L('hours this month, of {target}', { target: n(d.target_month) }) : L('hours this month'))}
      </div>
      ${missing.length ? `<p class="callout late"><b>${esc(L('Not in yet: {n}', { n: missing.length }))}</b> ${esc(missing.map(s => s.lead ? `${s.name} (${s.lead})` : s.name).join(', '))}</p>` : `<p class="callout ontime">${esc(L('Every site is in.'))}</p>`}
      ${late.length ? `<p class="mute small">${esc(L('Late: {list}', { list: late.map(s => `${s.name} ${clock(s.report.first_at)}`).join(', ') }))}</p>` : ''}

      <h3>${esc(L('By team'))}</h3>
      <div class="t-wrap"><table class="t rep"><thead><tr><th>${esc(L('Team'))}</th><th class="num">${esc(L('Sites in'))}</th><th class="num">${esc(L('Hours'))}</th><th class="num">${esc(L('Uploaded'))}</th><th class="num">${esc(L('Phones'))}</th><th class="num">${esc(L('Wearers'))}</th><th class="num">${esc(L('Down'))}</th></tr></thead>
      <tbody>${teams.map(k => { const x = d.teams[k]; return `<tr><td>${esc(TEAM[k])}</td><td class="num">${n(x.reported)} / ${n(x.expected)}</td><td class="num">${n(x.hours)}</td><td class="num">${n(x.hours_uploaded)}</td><td class="num">${n(x.phones_deployed)}</td><td class="num">${n(x.wearers_present)}</td><td class="num">${n(x.phones_out)}</td></tr>`; }).join('')}</tbody></table></div>

      <h3>${esc(L('By site'))}</h3>
      <div class="t-wrap"><table class="t rep"><thead><tr><th>${esc(L('Site'))}</th><th>${esc(L('Who'))}</th><th>${esc(L('Sent'))}</th><th class="num">${esc(L('Hours'))}</th><th class="num">${esc(L('Uploaded'))}</th><th class="num">${esc(L('Phones'))}</th><th class="num">${esc(L('Holding'))}</th><th class="num">${esc(L('Wearers'))}</th><th class="num">${esc(L('Down'))}</th><th class="num">${esc(L('Flags'))}</th></tr></thead>
      <tbody>${sites.map(s => { const r = s.report; return r
        ? `<tr><td><b>${esc(s.name)}</b><span class="tiny mute" style="display:block">${esc(TEAM[s.team])}</span></td><td>${esc(r.reporter)}</td><td>${esc(clock(r.first_at))}${r.late ? `<span class="pill late">${esc(L('late'))}</span>` : ''}${r.incident ? `<span class="pill late">${esc(L('incident'))}</span>` : ''}</td><td class="num">${n(r.hours)}</td><td class="num">${n(r.hours_uploaded)}</td><td class="num">${n(r.phones_uploaded)} / ${n(r.phones_deployed)}</td><td class="num">${n(r.backlog)}</td><td class="num">${n(r.wearers_present)} / ${n(r.wearers_scheduled)}</td><td class="num">${n(r.phones_out)}</td><td class="num">${n(r.flags)}</td></tr>`
        : `<tr class="mute"><td><b>${esc(s.name)}</b><span class="tiny mute" style="display:block">${esc(TEAM[s.team])}</span></td><td>${esc(s.lead || '')}</td><td><span class="pill miss">${esc(L('not in'))}</span></td><td class="num">0</td><td class="num"></td><td class="num"></td><td class="num"></td><td class="num"></td><td class="num"></td><td class="num"></td></tr>`; }).join('')}</tbody></table></div>

      ${note('problems', L('Incidents'), r => r.incident || r.problems)}
      ${note('gear_needed', L('Gear needed'))}
      ${note('other', L('Anything else'))}

      ${(d.days || []).length > 1 ? `<h3>${esc(L('The last two weeks'))}</h3>
      <div class="t-wrap"><table class="t rep"><thead><tr><th>${esc(L('Day'))}</th><th class="num">${esc(L('Sites in'))}</th><th class="num">${esc(L('Hours'))}</th></tr></thead>
      <tbody>${d.days.slice().reverse().map(x => `<tr><td>${esc(dayLabel(x.day))}</td><td class="num">${n(x.reported)}</td><td class="num">${n(x.hours)}</td></tr>`).join('')}</tbody></table></div>` : ''}
    </div>
    <details class="rep-admin no-print" id="admin"><summary>${esc(L('Codes, reporters, targets, and posts'))}</summary><div id="admin-body"><p class="mute">${esc(L('Loading'))}</p></div></details>`;

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
  lines.push(L('Hours recorded: {n}', { n: n(t.hours) }) + (Number(d.target_day) ? ' ' + L('of {target} target', { target: n(d.target_day) }) : '') + '. ' + L('Hours uploaded: {n}', { n: n(t.hours_uploaded) }));
  lines.push(L('Sites in: {a} of {b}', { a: n(t.reported), b: n(d.expected) }) + (missing.length ? '. ' + L('Counted as zero: {list}', { list: missing.map(s => s.name).join(', ') }) : ''));
  lines.push(L('Phones uploaded {a} of {b} deployed. Still holding footage: {c}. Wearers present {d} of {e}. Phones down: {f}. Flags: {g}. Incidents: {h}', { a: n(t.phones_uploaded), b: n(t.phones_deployed), c: n(t.backlog), d: n(t.wearers_present), e: n(t.wearers_scheduled), f: n(t.phones_out), g: n(t.flags), h: n(t.incidents) }));
  lines.push(L('This month: {a} hours', { a: n(d.month_hours) }) + (Number(d.target_month) ? ' ' + L('of {target}', { target: n(d.target_month) }) : ''));
  lines.push('');
  for (const s of sites) {
    const r = s.report;
    if (!r) { lines.push(`${s.name}: ${L('not in')}`); continue; }
    lines.push(`${s.name}, ${r.reporter}, ${clock(r.first_at)}${r.late ? ' (' + L('late') + ')' : ''}: ${L('{h} hours, {u} uploaded, {p} phones', { h: n(r.hours), u: n(r.hours_uploaded), p: n(r.phones_deployed) })}${r.phones_out ? ', ' + L('{n} down', { n: n(r.phones_out) }) : ''}${r.flags ? ', ' + L('{n} flags', { n: n(r.flags) }) : ''}${r.incident ? ', ' + L('incident') : ''}`);
  }
  const block = (key, title, only) => {
    const rows = sites.filter(s => s.report && String(s.report[key] || '').trim() && (!only || only(s.report)));
    if (!rows.length) return;
    lines.push('', title + ':');
    for (const s of rows) lines.push(`${s.name}: ${String(s.report[key]).trim()}`);
  };
  block('problems', L('Incidents'), r => r.incident || r.problems);
  block('gear_needed', L('Gear needed'));
  block('other', L('Anything else'));
  return lines.join('\n');
}

/* management: the codes, the deadline, the reporter names, the targets, the posts. The site list has its own page. */
async function renderAdmin() {
  const box = document.getElementById('admin-body');
  let settings;
  try { settings = await admin('settings'); }
  catch (err) { box.innerHTML = `<p class="callout late">${esc(friendly(err.message))}</p>`; return; }
  let targets = {};
  try { targets = JSON.parse(settings.targets || '{}'); } catch {}
  const months = Object.keys(targets).sort();
  box.innerHTML = `
    <p class="mute small">${esc(L('The site list, with every site we have and every site we could film with, lives on the site registry page.'))} <a href="${href('sites')}">${esc(L('Open the site registry'))}</a></p>

    <h3>${esc(L('Monthly targets'))}</h3>
    <div class="t-wrap"><table class="t"><thead><tr><th>${esc(L('Month'))}</th><th class="num">${esc(L('Hours'))}</th></tr></thead><tbody>${months.map(m => `<tr><td>${esc(m)}</td><td class="num">${n(targets[m])}</td></tr>`).join('') || `<tr><td colspan="2" class="mute">${esc(L('No target set yet.'))}</td></tr>`}</tbody></table></div>
    <form id="target-form" class="fgrid" autocomplete="off">
      <div class="ff"><label class="fl" for="t-month">${esc(L('Month'))}</label><input type="month" id="t-month" value="${esc(today().slice(0, 7))}" required></div>
      <div class="ff"><label class="fl" for="t-hours">${esc(L('Hours for the month'))}</label><input type="number" id="t-hours" min="0" step="1" required></div>
      <div class="ff"><span class="fl">&nbsp;</span><button type="submit" class="btn primary">${esc(L('Set target'))}</button></div>
    </form>

    <h3 style="margin-top:28px">${esc(L('Reporters'))}</h3>
    <form id="reporters-form" class="fgrid" autocomplete="off">
      <div class="ff"><label class="fl" for="s-reporters">${esc(L('Names on the form, separated by commas'))}<small>${esc(L('Site leads on the registry are added on their own.'))}</small></label><textarea id="s-reporters" rows="2">${esc(settings.reporters || '')}</textarea></div>
      <div class="ff"><span class="fl">&nbsp;</span><button type="submit" class="btn primary">${esc(L('Save'))}</button></div>
    </form>

    <h3 style="margin-top:28px">${esc(L('Codes and deadline'))}</h3>
    <form id="settings-form" class="fgrid" autocomplete="off">
      <div class="ff"><label class="fl" for="s-team">${esc(L('Team code'))}<small>${esc(L('Everyone who sends a daily report types this once.'))}</small></label><input type="text" id="s-team" value="${esc(settings.team_code || '')}" minlength="3"></div>
      <div class="ff"><label class="fl" for="s-deadline">${esc(L('Deadline, Cairo time'))}</label><input type="time" id="s-deadline" value="${esc(settings.deadline || '18:00')}"></div>
      <div class="ff"><label class="fl" for="s-report">${esc(L('New management code'))}<small>${esc(L('Leave empty to keep the current one.'))}</small></label><input type="text" id="s-report" minlength="6" autocomplete="off"></div>
      <div class="ff"><span class="fl">&nbsp;</span><button type="submit" class="btn primary">${esc(L('Save'))}</button></div>
    </form>

    <h3 style="margin-top:28px">${esc(L('Automatic posts'))}</h3>
    <p class="mute small">${esc(L('With a Slack webhook here, the chase list posts at 6:15 PM and the number posts at 8:00 PM, Cairo time, every day.'))}</p>
    <form id="slack-form" class="fgrid" autocomplete="off">
      <div class="ff"><label class="fl" for="s-slack">${esc(L('Slack webhook address'))}<small>${esc(settings.slack_webhook === 'set' ? L('One is set. Paste a new one to replace it, or the word none to remove it.') : L('None yet. Slack, Apps, Incoming Webhooks, then paste the address.'))}</small></label><input type="url" id="s-slack" autocomplete="off"></div>
      <div class="ff"><span class="fl">&nbsp;</span><button type="submit" class="btn primary">${esc(L('Save'))}</button> <button type="button" class="btn" id="s-test" ${settings.slack_webhook === 'set' ? '' : 'disabled'}>${esc(L('Send a test post'))}</button></div>
    </form>`;

  const after = () => { toast(L('Saved.')); load().then(() => { document.getElementById('admin').open = true; renderAdmin(); }); };
  box.querySelector('#target-form').addEventListener('submit', async e => {
    e.preventDefault();
    try { await admin('target', { month: document.getElementById('t-month').value, hours: document.getElementById('t-hours').value }); after(); }
    catch (err) { toast(friendly(err.message)); }
  });
  box.querySelector('#reporters-form').addEventListener('submit', async e => {
    e.preventDefault();
    try { await admin('setting', { key: 'reporters', value: document.getElementById('s-reporters').value }); after(); }
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
      after();
    } catch (err) { toast(friendly(err.message)); }
  });
  box.querySelector('#slack-form').addEventListener('submit', async e => {
    e.preventDefault();
    const v = document.getElementById('s-slack').value.trim();
    if (!v) return;
    try { await admin('setting', { key: 'slack_webhook', value: v === 'none' ? '' : v }); after(); }
    catch (err) { toast(friendly(err.message)); }
  });
  box.querySelector('#s-test').addEventListener('click', async e => {
    e.target.disabled = true;
    try { const r = await admin('test_post', { kind: 'number' }); toast(r.sent ? L('Posted to Slack.') : L('Nothing sent. Check the webhook.')); }
    catch (err) { toast(friendly(err.message)); }
    e.target.disabled = false;
  });
}

load();
