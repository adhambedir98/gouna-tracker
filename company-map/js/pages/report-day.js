// The company report. Every site's morning check-in and daily report, added up into one page for management. It builds itself.
// Reading it takes the management code. The same page manages the codes, the deadlines, the targets, the posts, and shows the activity log.
import { mount, esc, labels, store, toast, fmt, initialHash, setHash, href } from '../app.js';
import { rpc, admin as adminCall, gate, loading, failed, friendly, clock, dayLabel, today, shift, kindLabel, CODE } from '../online.js';

const L = await labels('report-day');
const app = await mount({ page: 'report/day', title: L('Company report'), lede: L('Every site, added up into one page: who started by 9:00 AM, who reported by 6:00 PM, and what happened. Nobody collects anything.') });

const n = v => fmt(v ?? 0);
const TEAM = { direct: L('Our sites'), partner: L('Partner sites') };
const KIND = kindLabel(L);
let code = store.get(CODE, '');
let day = /^\d{4}-\d{2}-\d{2}$/.test(initialHash()) ? initialHash() : today();
let data = null;
const admin = (action, p = {}) => adminCall(code, action, p);
const ERR = { 'bad month': L('Pick a month.'), 'not a Slack webhook': L('That is not a Slack webhook address.') };

function open(c) { code = c; load(); }
async function load() {
  if (!code) return gate(app, L, open, '', L('Adham, Moharam, Mano, Ahmed Alaa, and Youssef Medhat have this code.'));
  loading(app, L);
  try {
    data = await rpc('dr_report', { p_day: day, p_code: code });
    store.set(CODE, code);
    setHash(day === today() ? '' : day);
    render();
  } catch (err) {
    if (err.message === 'wrong code') { store.remove(CODE); code = ''; return gate(app, L, open, L('That code is wrong.')); }
    failed(app, L, friendly(L, err.message), load);
  }
}

/* the page */
function render() {
  const d = data, t = d.totals, m = d.morning || {}, sites = d.sites || [], filed = d.incidents || [];
  const missing = sites.filter(s => s.active && !s.report);
  const notStarted = sites.filter(s => s.active && !s.checkin);
  const late = sites.filter(s => s.report && s.report.late);
  const problems = sites.filter(s => s.checkin && !s.checkin.ok);
  const noForm = sites.filter(s => s.report && s.report.incident && !filed.some(i => i.site_id === s.id));
  const target = Number(d.target_day) || 0;
  const teams = ['direct', 'partner'].filter(k => d.teams && d.teams[k]);
  const isToday = day === today();
  const names = list => list.map(s => s.lead ? `${s.name} (${s.lead})` : s.name).join(', ');
  const note = (key, title, only) => {
    const rows = sites.filter(s => s.report && String(s.report[key] || '').trim() && (!only || only(s.report)));
    if (!rows.length) return '';
    return `<section class="notes-block"><h3>${esc(title)}</h3><dl class="notes">${rows.map(s => `<dt>${esc(s.name)}</dt><dd>${esc(s.report[key])}</dd>`).join('')}</dl></section>`;
  };
  const stat = (v, label) => `<div><div class="big num">${v}</div><div class="lbl">${esc(label)}</div></div>`;
  const cell = s => `<td><b>${esc(s.name)}</b><span class="tiny mute" style="display:block">${esc(TEAM[s.team])}${s.book ? ', ' + esc(s.book) : ''}</span></td>`;
  app.content.innerHTML = `
    <div class="daybar no-print">
      <button type="button" class="btn" id="prev" aria-label="${esc(L('The day before'))}">&lsaquo;</button>
      <input type="date" id="day" value="${esc(day)}" max="${today()}">
      <button type="button" class="btn" id="next" aria-label="${esc(L('The day after'))}" ${day >= today() ? 'disabled' : ''}>&rsaquo;</button>
      <button type="button" class="btn" id="reload">${esc(L('Refresh'))}</button>
      <span class="grow"></span>
      <a class="btn" href="${href('report/incidents')}">${esc(L('Incidents'))}${Number(d.open_incidents) ? ` <span class="pill late">${n(d.open_incidents)}</span>` : ''}</a>
      <a class="btn" href="${href('sites')}">${esc(L('Site registry'))}</a>
      <a class="btn" href="${href('team')}">${esc(L('Team'))}</a>
      <button type="button" class="btn" id="copy">${esc(L('Copy as text'))}</button>
      <button type="button" class="btn" data-print="#rep" data-print-title="${esc(L('Company report'))}">${esc(L('Print or save a copy'))}</button>
    </div>
    <div id="rep">
      <h2>${esc(dayLabel(day))}</h2>
      <p class="mute small">${esc(L('Built at {time} Cairo time. Check-in by {morning}, report by {deadline}. A site with no report counts as zero.', { time: clock(L, String(d.built_at).slice(11)), morning: clock(L, d.checkin_deadline || '09:00'), deadline: clock(L, d.deadline) }))}</p>

      <h3>${esc(L('The morning'))}</h3>
      <div class="stat">
        ${stat(`${n(m.checked_in)}<span class="mute"> / ${n(d.expected)}</span>`, L('sites started'))}
        ${stat(n(m.phones_deployed), L('phones out'))}
        ${stat(`${n(m.wearers_present)}<span class="mute"> / ${n(m.wearers_scheduled)}</span>`, L('wearers present, of scheduled'))}
        ${stat(n(m.phones_out), L('phones down'))}
        ${stat(n(m.problems), L('sites with a problem'))}
      </div>
      ${notStarted.length ? `<p class="callout ${isToday ? 'late' : ''}"><b>${esc(L('No check-in: {n}', { n: notStarted.length }))}</b> ${esc(names(notStarted))}</p>` : `<p class="callout ontime">${esc(L('Every site checked in.'))}</p>`}
      ${problems.length ? `<dl class="notes">${problems.map(s => `<dt>${esc(s.name)}</dt><dd>${esc(s.checkin.note || L('A problem, no note.'))}</dd>`).join('')}</dl>` : ''}

      <h3>${esc(L('The day'))}</h3>
      <div class="stat">
        ${stat(n(t.hours), target ? L('hours recorded, of {target} target', { target: n(target) }) : L('hours recorded'))}
        ${stat(`${n(t.reported)}<span class="mute"> / ${n(d.expected)}</span>`, L('sites in'))}
        ${stat(n(t.hours_uploaded), L('hours uploaded'))}
        ${stat(`${n(t.phones_uploaded)}<span class="mute"> / ${n(t.phones_deployed)}</span>`, L('phones uploaded, of deployed'))}
        ${stat(n(t.backlog), L('phones still holding footage'))}
        ${stat(`${n(t.wearers_present)}<span class="mute"> / ${n(t.wearers_scheduled)}</span>`, L('wearers present, of scheduled'))}
        ${stat(n(t.phones_out), L('phones down'))}
        ${stat(n(t.flags), L('flags received'))}
        ${stat(n(filed.length), L('incidents filed'))}
        ${stat(n(d.month_hours), Number(d.target_month) ? L('hours this month, of {target}', { target: n(d.target_month) }) : L('hours this month'))}
      </div>
      ${missing.length ? `<p class="callout late"><b>${esc(L('Not in yet: {n}', { n: missing.length }))}</b> ${esc(names(missing))}</p>` : `<p class="callout ontime">${esc(L('Every site is in.'))}</p>`}
      ${late.length ? `<p class="mute small">${esc(L('Late: {list}', { list: late.map(s => `${s.name} ${clock(L, s.report.first_at)}`).join(', ') }))}</p>` : ''}

      <h3>${esc(L('By team'))}</h3>
      <div class="t-wrap"><table class="t rep"><thead><tr><th>${esc(L('Team'))}</th><th class="num">${esc(L('Started'))}</th><th class="num">${esc(L('Sites in'))}</th><th class="num">${esc(L('Hours'))}</th><th class="num">${esc(L('Uploaded'))}</th><th class="num">${esc(L('Phones'))}</th><th class="num">${esc(L('Wearers'))}</th><th class="num">${esc(L('Down'))}</th></tr></thead>
      <tbody>${teams.map(k => { const x = d.teams[k]; return `<tr><td>${esc(TEAM[k])}</td><td class="num">${n(x.checked_in)} / ${n(x.expected)}</td><td class="num">${n(x.reported)} / ${n(x.expected)}</td><td class="num">${n(x.hours)}</td><td class="num">${n(x.hours_uploaded)}</td><td class="num">${n(x.phones_deployed)}</td><td class="num">${n(x.wearers_present)}</td><td class="num">${n(x.phones_out)}</td></tr>`; }).join('')}</tbody></table></div>

      <h3>${esc(L('By site'))}</h3>
      <div class="t-wrap"><table class="t rep"><thead><tr><th>${esc(L('Site'))}</th><th>${esc(L('Started'))}</th><th>${esc(L('Who'))}</th><th>${esc(L('Sent'))}</th><th class="num">${esc(L('Hours'))}</th><th class="num">${esc(L('Uploaded'))}</th><th class="num">${esc(L('Phones'))}</th><th class="num">${esc(L('Holding'))}</th><th class="num">${esc(L('Wearers'))}</th><th class="num">${esc(L('Down'))}</th><th class="num">${esc(L('Flags'))}</th></tr></thead>
      <tbody>${sites.map(s => { const r = s.report, c = s.checkin;
        const started = c ? `${esc(clock(L, c.started_at) || clock(L, c.first_at))}${c.late ? `<span class="pill late">${esc(L('late'))}</span>` : ''}${c.ok ? '' : `<span class="pill late">${esc(L('problem'))}</span>`}` : `<span class="pill miss">${esc(L('not in'))}</span>`;
        return r
        ? `<tr>${cell(s)}<td>${started}</td><td>${esc(r.reporter)}</td><td>${esc(clock(L, r.first_at))}${r.late ? `<span class="pill late">${esc(L('late'))}</span>` : ''}${r.incident ? `<span class="pill late">${esc(L('incident'))}</span>` : ''}</td><td class="num">${n(r.hours)}</td><td class="num">${n(r.hours_uploaded)}</td><td class="num">${n(r.phones_uploaded)} / ${n(r.phones_deployed)}</td><td class="num">${n(r.backlog)}</td><td class="num">${n(r.wearers_present)} / ${n(r.wearers_scheduled)}</td><td class="num">${n(r.phones_out)}</td><td class="num">${n(r.flags)}</td></tr>`
        : `<tr class="mute">${cell(s)}<td>${started}</td><td>${esc(s.lead || '')}</td><td><span class="pill miss">${esc(L('not in'))}</span></td><td class="num">0</td><td class="num"></td><td class="num"></td><td class="num"></td><td class="num"></td><td class="num"></td><td class="num"></td></tr>`; }).join('')}</tbody></table></div>

      <h3>${esc(L('Incidents'))}</h3>
      ${filed.length ? `<div class="t-wrap"><table class="t rep"><thead><tr><th class="num">${esc(L('No'))}</th><th>${esc(L('Site'))}</th><th>${esc(L('Kind'))}</th><th>${esc(L('What happened'))}</th><th>${esc(L('Filed by'))}</th><th>${esc(L('Status'))}</th></tr></thead>
      <tbody>${filed.map(i => `<tr><td class="num">${n(i.no)}</td><td><b>${esc(i.site || '')}</b>${i.at ? `<span class="tiny mute" style="display:block">${esc(clock(L, i.at))}</span>` : ''}</td><td>${esc(KIND[i.kind] || i.kind)}</td><td class="txt">${esc(i.what)}</td><td>${esc(i.reporter)}</td><td><span class="pill st-${i.status === 'open' ? 'open' : 'closed'}">${esc(i.status === 'open' ? L('open') : L('closed'))}</span></td></tr>`).join('')}</tbody></table></div>` : `<p class="mute small">${esc(L('No incident form filed for this day.'))}</p>`}
      ${noForm.length ? `<p class="callout late">${esc(L('On the daily report but no incident form yet: {list}', { list: noForm.map(s => s.report.problems ? `${s.name}: ${s.report.problems}` : s.name).join('; ') }))}</p>` : ''}
      ${note('problems', L('Incident lines on the daily reports'), r => r.incident || r.problems)}
      ${note('gear_needed', L('Gear needed'))}
      ${note('other', L('Anything else'))}

      ${(d.days || []).length > 1 ? `<h3>${esc(L('The last two weeks'))}</h3>
      <div class="t-wrap"><table class="t rep"><thead><tr><th>${esc(L('Day'))}</th><th class="num">${esc(L('Started'))}</th><th class="num">${esc(L('Sites in'))}</th><th class="num">${esc(L('Hours'))}</th></tr></thead>
      <tbody>${d.days.slice().reverse().map(x => `<tr><td><a href="#${esc(x.day)}" data-day="${esc(x.day)}">${esc(dayLabel(x.day))}</a></td><td class="num">${n(x.checked_in)}</td><td class="num">${n(x.reported)}</td><td class="num">${n(x.hours)}</td></tr>`).join('')}</tbody></table></div>` : ''}
    </div>
    <details class="rep-admin no-print" id="admin"><summary>${esc(L('Codes, deadlines, targets, posts, and the activity log'))}</summary><div id="admin-body"><p class="mute">${esc(L('Loading'))}</p></div></details>`;

  document.getElementById('prev').addEventListener('click', () => { day = shift(day, -1); load(); });
  document.getElementById('next').addEventListener('click', () => { day = shift(day, 1); load(); });
  document.getElementById('reload').addEventListener('click', load);
  document.getElementById('day').addEventListener('change', e => { if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) { day = e.target.value; load(); } });
  app.content.addEventListener('click', e => { const a = e.target.closest('a[data-day]'); if (!a) return; e.preventDefault(); day = a.dataset.day; load(); });
  document.getElementById('copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(asText()); toast(L('Copied. Paste it into the group.')); } catch { toast(L('Could not copy on this device.')); }
  });
  const det = document.getElementById('admin');
  det.addEventListener('toggle', () => { if (det.open) renderAdmin(); }, { once: true });
}

/* the same report as plain text, for the management group */
function asText() {
  const d = data, t = d.totals, m = d.morning || {}, sites = d.sites || [], filed = d.incidents || [];
  const missing = sites.filter(s => s.active && !s.report);
  const notStarted = sites.filter(s => s.active && !s.checkin);
  const lines = [];
  lines.push(L('Company report, {day}', { day: dayLabel(day) }));
  lines.push(L('Started by {time}: {a} of {b} sites, {p} phones out, {w} wearers present', { time: clock(L, d.checkin_deadline || '09:00'), a: n(m.checked_in), b: n(d.expected), p: n(m.phones_deployed), w: n(m.wearers_present) }) + (notStarted.length ? '. ' + L('No check-in: {list}', { list: notStarted.map(s => s.name).join(', ') }) : ''));
  lines.push(L('Hours recorded: {n}', { n: n(t.hours) }) + (Number(d.target_day) ? ' ' + L('of {target} target', { target: n(d.target_day) }) : '') + '. ' + L('Hours uploaded: {n}', { n: n(t.hours_uploaded) }));
  lines.push(L('Sites in: {a} of {b}', { a: n(t.reported), b: n(d.expected) }) + (missing.length ? '. ' + L('Counted as zero: {list}', { list: missing.map(s => s.name).join(', ') }) : ''));
  lines.push(L('Phones uploaded {a} of {b} deployed. Still holding footage: {c}. Wearers present {d} of {e}. Phones down: {f}. Flags: {g}. Incidents filed: {h}, open in all: {i}', { a: n(t.phones_uploaded), b: n(t.phones_deployed), c: n(t.backlog), d: n(t.wearers_present), e: n(t.wearers_scheduled), f: n(t.phones_out), g: n(t.flags), h: n(filed.length), i: n(d.open_incidents) }));
  lines.push(L('This month: {a} hours', { a: n(d.month_hours) }) + (Number(d.target_month) ? ' ' + L('of {target}', { target: n(d.target_month) }) : ''));
  lines.push('');
  for (const s of sites) {
    const r = s.report;
    if (!r) { lines.push(`${s.name}: ${L('not in')}`); continue; }
    lines.push(`${s.name}, ${r.reporter}, ${clock(L, r.first_at)}${r.late ? ' (' + L('late') + ')' : ''}: ${L('{h} hours, {u} uploaded, {p} phones', { h: n(r.hours), u: n(r.hours_uploaded), p: n(r.phones_deployed) })}${r.phones_out ? ', ' + L('{n} down', { n: n(r.phones_out) }) : ''}${r.flags ? ', ' + L('{n} flags', { n: n(r.flags) }) : ''}${r.incident ? ', ' + L('incident') : ''}`);
  }
  if (filed.length) { lines.push('', L('Incidents') + ':'); for (const i of filed) lines.push(`${n(i.no)}. ${i.site || ''}, ${KIND[i.kind] || i.kind}, ${i.status === 'open' ? L('open') : L('closed')}: ${String(i.what).trim()}`); }
  const block = (key, title, only) => {
    const rows = sites.filter(s => s.report && String(s.report[key] || '').trim() && (!only || only(s.report)));
    if (!rows.length) return;
    lines.push('', title + ':');
    for (const s of rows) lines.push(`${s.name}: ${String(s.report[key]).trim()}`);
  };
  block('problems', L('Incident lines on the daily reports'), r => r.incident || r.problems);
  block('gear_needed', L('Gear needed'));
  block('other', L('Anything else'));
  return lines.join('\n');
}

/* management: the codes, the deadlines, the targets, the posts, and the activity log. The site list and the team have their own pages. */
async function renderAdmin() {
  const box = document.getElementById('admin-body');
  let settings, log = [];
  try { [settings, log] = await Promise.all([admin('settings'), admin('log', { limit: 40 })]); }
  catch (err) { box.innerHTML = `<p class="callout late">${esc(friendly(L, err.message, ERR))}</p>`; return; }
  let targets = {};
  try { targets = JSON.parse(settings.targets || '{}'); } catch {}
  const months = Object.keys(targets).sort();
  box.innerHTML = `
    <p class="mute small">${esc(L('The sites live on the site registry page. The people, and the name lists on the forms, live on the team page.'))} <a href="${href('sites')}">${esc(L('Site registry'))}</a>, <a href="${href('team')}">${esc(L('Team'))}</a></p>

    <h3>${esc(L('Monthly targets'))}</h3>
    <div class="t-wrap"><table class="t"><thead><tr><th>${esc(L('Month'))}</th><th class="num">${esc(L('Hours'))}</th></tr></thead><tbody>${months.map(m => `<tr><td>${esc(m)}</td><td class="num">${n(targets[m])}</td></tr>`).join('') || `<tr><td colspan="2" class="mute">${esc(L('No target set yet.'))}</td></tr>`}</tbody></table></div>
    <form id="target-form" class="fgrid" autocomplete="off">
      <div class="ff"><label class="fl" for="t-month">${esc(L('Month'))}</label><input type="month" id="t-month" value="${esc(today().slice(0, 7))}" required></div>
      <div class="ff"><label class="fl" for="t-hours">${esc(L('Hours for the month'))}</label><input type="number" id="t-hours" min="0" step="1" required></div>
      <div class="ff"><span class="fl">&nbsp;</span><button type="submit" class="btn primary">${esc(L('Set target'))}</button></div>
    </form>

    <h3 style="margin-top:28px">${esc(L('Codes and deadlines'))}</h3>
    <form id="settings-form" class="fgrid" autocomplete="off">
      <div class="ff"><label class="fl" for="s-team">${esc(L('Team code'))}<small>${esc(L('Everyone who sends a check-in, a daily report, or an incident types this once.'))}</small></label><input type="text" id="s-team" value="${esc(settings.team_code || '')}" minlength="3"></div>
      <div class="ff"><label class="fl" for="s-morning">${esc(L('Check-in deadline, Cairo time'))}</label><input type="time" id="s-morning" value="${esc(settings.checkin_deadline || '09:00')}"></div>
      <div class="ff"><label class="fl" for="s-deadline">${esc(L('Report deadline, Cairo time'))}</label><input type="time" id="s-deadline" value="${esc(settings.deadline || '18:00')}"></div>
      <div class="ff"><label class="fl" for="s-report">${esc(L('New management code'))}<small>${esc(L('Leave empty to keep the current one.'))}</small></label><input type="text" id="s-report" minlength="6" autocomplete="off"></div>
      <div class="ff"><span class="fl">&nbsp;</span><button type="submit" class="btn primary">${esc(L('Save'))}</button></div>
    </form>

    <h3 style="margin-top:28px">${esc(L('Automatic posts'))}</h3>
    <p class="mute small">${esc(L('With a Slack webhook here, the morning list posts at 9:15 AM, the chase list at 6:15 PM, and the number at 8:00 PM, Cairo time, every day.'))}</p>
    <form id="slack-form" class="fgrid" autocomplete="off">
      <div class="ff"><label class="fl" for="s-slack">${esc(L('Slack webhook address'))}<small>${esc(settings.slack_webhook === 'set' ? L('One is set. Paste a new one to replace it, or the word none to remove it.') : L('None yet. Slack, Apps, Incoming Webhooks, then paste the address.'))}</small></label><input type="url" id="s-slack" autocomplete="off"></div>
      <div class="ff"><span class="fl">&nbsp;</span><button type="submit" class="btn primary">${esc(L('Save'))}</button> <button type="button" class="btn" id="s-test" ${settings.slack_webhook === 'set' ? '' : 'disabled'}>${esc(L('Send a test post'))}</button></div>
    </form>

    <h3 style="margin-top:28px">${esc(L('Activity'))}</h3>
    <p class="mute small">${esc(L('Every check-in, report, incident, and change, newest first.'))}</p>
    <div class="t-wrap"><table class="t log"><tbody>${log.map(x => `<tr><td class="when">${esc(String(x.at).slice(5, 16).replace('T', ' '))}</td><td>${esc(x.what)}</td><td class="mute">${esc(x.who || '')}</td></tr>`).join('') || `<tr><td class="mute">${esc(L('Nothing yet.'))}</td></tr>`}</tbody></table></div>`;

  // opening the fresh details fires its toggle listener, which renders the settings once
  const after = () => { toast(L('Saved.')); load().then(() => { document.getElementById('admin').open = true; }); };
  box.querySelector('#target-form').addEventListener('submit', async e => {
    e.preventDefault();
    try { await admin('target', { month: document.getElementById('t-month').value, hours: document.getElementById('t-hours').value }); after(); }
    catch (err) { toast(friendly(L, err.message, ERR)); }
  });
  box.querySelector('#settings-form').addEventListener('submit', async e => {
    e.preventDefault();
    const team = document.getElementById('s-team').value.trim(), dl = document.getElementById('s-deadline').value, mo = document.getElementById('s-morning').value, rep = document.getElementById('s-report').value.trim();
    try {
      if (team && team !== settings.team_code) await admin('setting', { key: 'team_code', value: team });
      if (mo && mo !== settings.checkin_deadline) await admin('setting', { key: 'checkin_deadline', value: mo });
      if (dl && dl !== settings.deadline) await admin('setting', { key: 'deadline', value: dl });
      if (rep) {
        if (!confirm(L('Change the management code? Everyone who reads this page will need the new one.'))) return;
        await admin('setting', { key: 'report_code', value: rep });
        code = rep; store.set(CODE, code);
      }
      after();
    } catch (err) { toast(friendly(L, err.message, ERR)); }
  });
  box.querySelector('#slack-form').addEventListener('submit', async e => {
    e.preventDefault();
    const v = document.getElementById('s-slack').value.trim();
    if (!v) return;
    try { await admin('setting', { key: 'slack_webhook', value: v === 'none' ? '' : v }); after(); }
    catch (err) { toast(friendly(L, err.message, ERR)); }
  });
  box.querySelector('#s-test').addEventListener('click', async e => {
    e.target.disabled = true;
    try { const r = await admin('test_post', { kind: 'number' }); toast(r.sent ? L('Posted to Slack.') : L('Nothing sent. Check the webhook.')); }
    catch (err) { toast(friendly(L, err.message, ERR)); }
    e.target.disabled = false;
  });
}

load();
