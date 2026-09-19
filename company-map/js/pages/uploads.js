// Uploads: the client's export of every uploaded session, kept under the dashboard and judged against the check-outs.
// The file is the ground truth for hours. It comes in daily through dr_upload_ingest, whole or in slices, and lands on
// its session id, so the same rows twice change nothing but the verdicts. A session belongs to a site by the check-out
// that listed its phone that day, else by the account's name, else by the phone list. It opens for management.
import { mount, esc, labels, store, toast, fmt, initialHash, setHash } from '../app.js';
import { cfg, rpc, gate, loading, failed, friendly, clock, dayLabel, shortDay, today, shift } from '../online.js';
import { bars, area, hbars } from '../charts.js';

const L = await labels('uploads');
const app = await mount({ page: 'uploads', title: L('Uploads'), lede: L('What the file says was uploaded each day, next to the hours the sites reported on their evening check-outs. The file is the ground truth.') });

let day = /^\d{4}-\d{2}-\d{2}$/.test(initialHash()) ? initialHash() : today();
let win = [30, 60, 90].includes(Number(store.get('vm.up.days', 30))) ? Number(store.get('vm.up.days', 30)) : 30;
let data = null;
let charts = {};
const ERR = {
  'the file is empty': L('That file is empty.'),
  'pattern is missing': L('Write the pattern first.'),
  'pattern is not a valid expression': L('That pattern is not a valid expression.'),
  'phone is missing': L('Write the phone number first.')
};
const n = v => fmt(Number(v) || 0);
const num = v => Number(v) || 0;
const one = v => (v == null ? '' : (Math.round(Number(v) * 10) / 10).toFixed(1));
const pct = (a, b) => (num(b) ? Math.round(100 * num(a) / num(b)) + '%' : '');
const up = (action, p = {}) => rpc('dr_upload_admin', { p_code: '', p_action: action, p });
const plural = (v, one, many) => (num(v) === 1 ? L(one) : L(many, { n: n(v) }));
// a Latin name inside an Arabic sentence keeps its place and its order when it is isolated
const iso = s => '⁨' + s + '⁩';

async function load(quiet = false) {
  if (!quiet) loading(app, L);
  try {
    data = await rpc('dr_uploads', { p_code: '', p_day: day, p_days: win });
    setHash(day === today() ? '' : day);
    render();
  } catch (err) {
    if (err.message === 'wrong code') return gate(app, L);
    if (quiet) return toast(friendly(L, err.message, ERR));
    failed(app, L, friendly(L, err.message, ERR), load);
  }
}

/* the things on this day that somebody should look at: who, and one sentence each */
function alerts(d) {
  const out = [];
  const say = (who, text) => out.push({ who, text });
  const sep = L(', ');
  const more = (list, k) => list.slice(0, k).join(sep) + (list.length > k ? sep + L('and more') : '');
  for (const s of d.sites || []) {
    const typed = num(s.typed), uploaded = num(s.uploaded), site = iso(s.name);
    if (s.typed != null && typed > 0 && uploaded === 0) say(s.name, L('{site} recorded {typed} hours on its check-out and nothing from it is in the file.', { site, typed: n(typed) }));
    else if (d.settled && s.typed != null && typed > 1.2 * uploaded) say(s.name, L('{site} recorded {typed} hours on its check-out. Three days on, only {uploaded} are in the file. The count looks high, or footage is stuck on the phones.', { site, typed: n(typed), uploaded: n(uploaded) }));
    if (s.typed == null && uploaded > 0) say(s.name, L('{uploaded} hours are in the file for {site}, but it sent no check-out.', { uploaded: n(uploaded), site }));
    const wrong = s.wrong_on_ledger || [];
    if (wrong.length) say(s.name, L('{site} listed phones the phone list gives to another site: {list}.', { site, list: more(wrong.map(w => L('phone {tag} ({home})', { tag: w.tag, home: iso(w.home) })), 8) }));
    if (num(s.unlisted)) say(s.name, L('Phones that uploaded for {site} without being on its check-out: {n}.', { n: n(s.unlisted), site }));
    if (s.typed != null && num(s.listed) > 0 && num(s.accounts) >= 2 * num(s.listed)) say(s.name, L('Phones listed on the check-out of {site}: {listed}. Accounts that uploaded for it: {accounts}.', { site, listed: n(s.listed), accounts: n(s.accounts) }));
    if (num(s.fraud)) say(s.name, L('Sessions marked fraud at {site}: {n}.', { site, n: n(s.fraud) }));
  }
  const f = d.flags || {};
  if ((f.shared || []).length) { const t = f.shared[0]; say(t.account, L('In the last {days} days, {account} recorded {h} hours on {day}: one login on several phones at once. The hours are real, but they cannot be followed phone by phone.', { days: n(d.window), account: iso(t.account), h: n(t.hours), day: shortDay(t.day) })); }
  if ((f.clock || []).length) say(L('Clocks'), L('Accounts that upload before they record, so their clocks are wrong: {list}.', { list: more(f.clock.map(c => iso(c.account)), 8) }));
  if (num(d.unplaced && d.unplaced.hours)) say(L('No site'), L('{h} hours on this day belong to no site the rules know. See the accounts below.', { h: n(d.unplaced.hours) }));
  return out;
}

function render() {
  const d = data, t = d.totals || {}, file = d.file || {}, sites = d.sites || [];
  const wasOpen = [...app.content.querySelectorAll('details[open]')].map(x => x.id);
  const isToday = day === today();
  const days = d.days || [];
  const lagRows = sites.filter(s => s.lag_median != null).map(s => ({ label: s.name, value: num(s.lag_median), text: one(s.lag_median) }));
  const tall = Math.max(160, 20 + lagRows.length * 28);   // the two charts of a row stand the same height
  charts = {};
  charts.days = w => area({ series: [{ values: days.map(x => num(x.uploaded)) }, { values: days.map(x => (x.typed == null ? null : num(x.typed))) }], labels: days.map(x => shortDay(x.day)), hi: days.length - 1, w, h: 190, fmt: n, label: L('Hours per day') });
  charts.weekdays = w => bars({ values: (d.weekdays || []).map(num), labels: [L('Mon'), L('Tue'), L('Wed'), L('Thu'), L('Fri'), L('Sat'), L('Sun')], w, h: 190, fmt: n, label: L('Hours by weekday') });
  charts.hours = w => bars({ values: (d.hours_of_day || []).map(num), labels: Array.from({ length: 24 }, (_, i) => String(i)), w, h: tall, fmt: n, label: L('Sessions by hour of the day') });
  charts.lag = w => hbars({ w, rowH: 28, rows: lagRows, fmt: one, ref: 24, refText: L('a day'), label: L('Hours from recording to upload') });

  const head = d.settled
    ? L('The sites recorded {typed} hours on their check-outs and {uploaded} are in the file. The day is settled.', { typed: n(t.typed), uploaded: n(t.uploaded) })
    : L('The sites recorded {typed} hours on their check-outs and {uploaded} are in the file so far. A quarter of footage lands more than a day later, so this day is not settled until {until}.', { typed: n(t.typed), uploaded: n(t.uploaded), until: shortDay(shift(day, 3)) });
  const tile = (label, value, ctx) => `<div class="kpi"><div class="lbl">${esc(label)}</div><div class="big num">${value}</div><div class="ctx">${esc(ctx || '')}</div></div>`;
  const trend = (kind, title, legend) => `<div class="trend"><h4>${esc(title)}</h4><div class="chart" data-chart="${kind}"></div>${legend ? `<p class="tiny mute">${esc(legend)}</p>` : ''}</div>`;
  const cell = (v, cls = 'num') => `<td class="${cls}">${v}</td>`;
  const th = (label, hint, cls = 'num') => `<th class="${cls}">${esc(label)}${hint ? `<span class="th-hint">${esc(hint)}</span>` : ''}</th>`;
  const gapOf = s => (s.typed == null ? null : num(s.typed) - num(s.uploaded));
  const signed = g => (g < 0 ? '-' : '') + n(Math.abs(Math.round(g)));
  // one row per site: the check-out's numbers, the file's numbers, and the gap between them
  const row = s => {
    const gap = gapOf(s), none = s.typed == null;
    const marks = [s.estimated ? `<span class="pill est">${esc(L('hours estimated'))}</span>` : '', (s.wrong_on_ledger || []).length ? `<span class="pill late">${esc(L('{n} phones of another site', { n: n(s.wrong_on_ledger.length) }))}</span>` : ''].join('');
    return `<tr><td><b>${esc(s.name)}</b>${marks ? `<span class="marks">${marks}</span>` : ''}</td>${cell(none ? `<span class="mute">${esc(L('no check-out'))}</span>` : n(s.typed))}${cell(n(s.uploaded))}${cell(none ? '' : n(s.pending))}${cell(gap == null ? '' : signed(gap), 'num' + (d.settled && gap != null && gap > 0.2 * num(s.typed) ? ' late' : ''))}${cell(n(s.accounts), 'num wide-col')}${cell(num(s.fraud) ? `<span class="late">${n(s.fraud)}</span>` : '0', 'num wide-col')}${cell(n(s.unreviewed))}${cell(s.lag_median == null ? '' : one(s.lag_median), 'num wide-col')}</tr>`;
  };
  const sum = k => sites.reduce((a, s) => a + num(s[k]), 0);
  const thead = `<thead>
    <tr><th rowspan="2">${esc(L('Site'))}</th><th class="grp" colspan="4">${esc(L('Hours'))}</th><th rowspan="2" class="num wide-col">${esc(L('Accounts'))}<span class="th-hint">${esc(L('logins in the file'))}</span></th><th class="grp" colspan="2">${esc(L('Sessions'))}</th><th rowspan="2" class="num wide-col">${esc(L('Lag'))}<span class="th-hint">${esc(L('typical hours to upload'))}</span></th></tr>
    <tr>${th(L('Recorded'), L('by the site'))}${th(L('Uploaded'), L('in the file'))}${th(L('Pending'), L('on the phones'))}${th(L('Gap'), L('not in the file'))}${th(L('Fraud'), L('by reviewers'), 'num wide-col')}${th(L('Unreviewed'), L('no verdict yet'))}</tr>
  </thead>`;
  const foot = `<tfoot><tr><th scope="row">${esc(L('All sites'))}</th>${cell(n(t.typed))}${cell(n(t.uploaded))}${cell(n(t.pending))}${cell(signed(num(t.typed) - num(t.uploaded)))}${cell(n(sum('accounts')), 'num wide-col')}${cell(n(t.fraud), 'num wide-col')}${cell(n(t.unreviewed))}${cell('', 'num wide-col')}</tr></tfoot>`;

  // the list of things to look at, grouped by who, the way the dashboard lists what the sites wrote
  const notes = [];
  for (const a of alerts(d)) { const last = notes[notes.length - 1]; if (last && last.who === a.who) last.items.push(a.text); else notes.push({ who: a.who, items: [a.text] }); }
  const notesHTML = notes.map(g => `<dt>${esc(g.who)}</dt>${g.items.map(x => `<dd>${esc(x)}</dd>`).join('')}`).join('');

  const ruleRow = r => `<tr data-id="${esc(r.id)}"><td><code>${esc(r.pattern)}</code></td><td>${r.site ? esc(r.site) : `<span class="mute">${esc(L('old accounts, not counted'))}</span>`}</td><td class="num">${n(r.accounts)}</td><td class="num">${n(r.hours)}</td><td class="mute">${esc(r.note || '')}</td><td class="acts"><button type="button" class="btn small" data-edit="${esc(r.id)}">${esc(L('Edit'))}</button> <button type="button" class="btn small" data-delete="${esc(r.id)}">${esc(L('Remove'))}</button></td></tr>`;
  const siteOpts = (chosen = '') => `<option value="">${esc(L('No site: old accounts, not counted'))}</option>` + (d.sites_list || []).map(s => `<option value="${esc(s.id)}"${s.id === chosen ? ' selected' : ''}>${esc(s.name)}</option>`).join('');
  const lengths = d.lengths || {};
  const accounts = sum('accounts');
  const fileNote = file.imported_at
    ? L('Last import {day} at {time}, {sessions} sessions, {first} to {last}.', { day: shortDay(file.imported_at.slice(0, 10)), time: clock(L, file.imported_at.slice(11, 16)), sessions: n(file.sessions), first: shortDay(file.first_day), last: shortDay(file.last_day) })
    : L('No file yet.');

  app.content.innerHTML = `
    <div class="daybar no-print">
      <div class="seg">
        <button type="button" class="btn" id="prev" aria-label="${esc(L('The day before'))}">&lsaquo;</button>
        <input type="date" id="day" value="${esc(day)}" max="${esc(today())}">
        <button type="button" class="btn" id="next" aria-label="${esc(L('The day after'))}" ${isToday ? 'disabled' : ''}>&rsaquo;</button>
      </div>
      <div class="chips seg" id="win" role="group" aria-label="${esc(L('How many days the charts cover'))}">${[30, 60, 90].map(v => `<button type="button" class="chip${v === win ? ' on' : ''}" data-days="${v}" aria-pressed="${v === win}">${esc(L('{n} days', { n: n(v) }))}</button>`).join('')}</div>
      <span class="grow"></span>
      <div class="acts"><button type="button" class="btn" id="reload">${esc(L('Refresh'))}</button><label class="btn" for="file">${esc(L('Upload the file'))}</label><input type="file" id="file" accept=".csv,text/csv" hidden></div>
    </div>
    <p class="tiny mute" id="file-note">${esc(fileNote)}</p>
    <div id="rep">
    <h2 class="print-only">${esc(dayLabel(day))}</h2>
    <p class="headline">${esc(head)}</p>
    <div class="hero">
      ${tile(L('Hours recorded'), n(t.typed), t.typed ? L('on the check-outs. {p} of it is in the file', { p: pct(t.uploaded, t.typed) }) : L('on the check-outs'))}
      ${tile(L('Hours uploaded'), n(t.uploaded), num(t.sessions) > 1 && accounts > 1 ? L('in the file: {s} sessions from {a} accounts', { s: n(t.sessions), a: n(accounts) }) : L('in the file. Sessions: {s}, accounts: {a}', { s: n(t.sessions), a: n(accounts) }))}
      ${tile(L('Hours pending upload'), n(t.pending), L('on the phones at check-out, from any day'))}
      ${tile(L('Unreviewed'), n(t.unreviewed), L('sessions with no verdict from the reviewers yet'))}
      ${tile(L('Marked fraud'), n(t.fraud), L('sessions the reviewers marked, that day'))}
    </div>
    ${notes.length ? `<h3>${esc(L('Worth a look'))}</h3><dl class="notes">${notesHTML}</dl>` : ''}
    <h3>${esc(L('Site by site'))}</h3>
    <p class="tiny mute">${esc(L('Recorded is what the site reported on its evening check-out. Uploaded is what the file holds for that day. Pending is what the site read off its phones at check-out, from any day, so it is not the gap.'))}</p>
    <div class="t-wrap"><table class="t rep" id="up-sites">${thead}<tbody>${sites.map(row).join('')}</tbody>${foot}</table></div>
    <p class="tiny mute">${num(d.legacy && d.legacy.hours) ? esc(L('Old accounts with no site uploaded {h} hours this day.', { h: n(d.legacy.hours) })) + ' ' : ''}${esc(L('Accounts the rules cannot place are in no row.'))}</p>
    <details class="more first" id="trends"><summary data-open="${esc(L('Open'))}" data-close="${esc(L('Close'))}"><h3>${esc(L('The last {n} days', { n: n(win) }))}</h3></summary><div class="body">
      <div class="trend-grid">
        ${trend('days', L('Hours per day'), L('Solid: uploaded, by the day it was recorded. Dashed: recorded on the check-outs.'))}
        ${trend('weekdays', L('Hours by weekday'), L('Added up over the window. Friday is the half day.'))}
        ${trend('hours', L('Sessions by hour of the day'), L('The hour recording started, Cairo time.'))}
        ${trend('lag', L('Hours from recording to upload'), L('The middle session of each site. The dotted line is one day.'))}
      </div>
      <h4>${esc(L('Session lengths'))}</h4>
      <p class="small">${esc(L('{full} sessions ran the full 30 minutes, {mid} ran 10 to 30, {short} ran under 10, and {over} ran longer than the app allows.', { full: n(lengths.full), mid: n(lengths.mid), short: n(lengths.short), over: n(lengths.over) }))}</p>
    </div></details>
    <details class="more" id="accounts"><summary data-open="${esc(L('Open'))}" data-close="${esc(L('Close'))}"><h3>${esc(L('Which account belongs to which site'))}</h3></summary><div class="body">
      <p class="tiny mute">${esc(L('A session belongs to a site by the check-out that listed its phone that day, else by the first rule below whose pattern matches the account name, the part of the email before the @, else by the phone list. {placed} of {phones} phones on the list have a site.', { placed: n(d.phones && d.phones.placed), phones: n(d.phones && d.phones.listed) }))}</p>
      <div class="t-wrap"><table class="t" id="rules"><thead><tr><th>${esc(L('Account name matches'))}</th><th>${esc(L('Belongs to'))}</th>${th(L('Accounts'), L('in the file'))}${th(L('Hours'), L('all days in the file'))}<th>${esc(L('Note'))}</th><th></th></tr></thead><tbody>${(d.rules || []).map(ruleRow).join('')}</tbody></table></div>
      <form class="stdform" id="rule-form"><h4>${esc(L('Add or change a rule'))}</h4><input type="hidden" id="r-id" value=""><div class="fgrid">
        <div class="ff"><label class="fl" for="r-pattern">${esc(L('Pattern'))}</label><input type="text" id="r-pattern"><small class="tiny mute">${esc(L('A regular expression. ^ahm matches ahm01, ahm02 and the rest.'))}</small></div>
        <div class="ff"><label class="fl" for="r-site">${esc(L('Belongs to'))}</label><select id="r-site">${siteOpts()}</select></div>
        <div class="ff"><label class="fl" for="r-note">${esc(L('Note'))}</label><input type="text" id="r-note"></div>
        <div class="ff"><span class="fl">&nbsp;</span><span><button type="submit" class="btn primary">${esc(L('Save the rule'))}</button> <button type="button" class="btn" id="r-clear">${esc(L('Clear'))}</button></span></div>
      </div></form>
      ${(d.unassigned || []).length ? `<h4>${esc(L('Accounts no rule places'))}</h4><div class="t-wrap"><table class="t"><thead><tr><th>${esc(L('Account family'))}</th>${th(L('Accounts'), L('in the file'))}${th(L('Hours'), L('all days in the file'))}<th>${esc(L('Last upload'))}</th><th></th></tr></thead><tbody>${d.unassigned.map(u => `<tr><td><code>${esc(u.family || L('numbered, not on the phone list'))}</code></td><td class="num">${n(u.accounts)}</td><td class="num">${n(u.hours)}</td><td class="date">${esc(shortDay(u.last_day))}</td><td class="acts">${u.family ? `<button type="button" class="btn small" data-assign="${esc(u.family)}">${esc(L('Write a rule'))}</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : ''}
      <form class="stdform" id="phone-form"><h4>${esc(L('Move a phone on the list'))}</h4><div class="fgrid">
        <div class="ff"><label class="fl" for="p-phone">${esc(L('Phone number'))}</label><input type="number" id="p-phone" min="1" max="9999" inputmode="numeric"></div>
        <div class="ff"><label class="fl" for="p-site">${esc(L('Belongs to'))}</label><select id="p-site">${siteOpts()}</select></div>
        <div class="ff"><label class="fl" for="p-status">${esc(L('Status'))}</label><select id="p-status"><option value="active">${esc(L('active'))}</option><option value="inactive">${esc(L('inactive'))}</option><option value="lost">${esc(L('lost'))}</option></select></div>
        <div class="ff"><span class="fl">&nbsp;</span><span><button type="submit" class="btn primary">${esc(L('Save the phone'))}</button></span></div>
      </div></form>
    </div></details>
    <details class="more" id="agent"><summary data-open="${esc(L('Open'))}" data-close="${esc(L('Close'))}"><h3>${esc(L('Sending the file every day'))}</h3></summary><div class="body">
      <p class="small">${esc(L('Post the export as text to the address below, with the management code, in slices of a few thousand lines, the way the button above sends it. The whole file or only the new days: rows that are already in change nothing but their verdicts. Only the first slice carries the header, and that is fine.'))}</p>
      <pre class="code">${esc(`split -l 4000 uploads.csv part-\nfor f in part-*; do\n  jq -n --rawfile csv "$f" --arg code MANAGEMENT_CODE '{p_code: $code, p_csv: $csv}' |\n  curl -s -X POST '${cfg.url}/rest/v1/rpc/dr_upload_ingest' \\\n    -H 'apikey: ${cfg.key}' -H 'Authorization: Bearer ${cfg.key}' \\\n    -H 'Content-Type: application/json' --data-binary @-\ndone`)}</pre>
      <p class="tiny mute">${esc(L('The key above is the public one every page of this site carries. The management code is the one on the settings panel of the dashboard.'))}</p>
    </div></details>
    </div>`;
  for (const id of wasOpen) { const x = document.getElementById(id); if (x) x.open = true; }

  drawCharts();
  for (const more of app.content.querySelectorAll('details.more')) more.addEventListener('toggle', () => { if (more.open) drawCharts(); });
  document.getElementById('day').addEventListener('change', e => { if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value) && e.target.value <= today()) { day = e.target.value; load(); } });
  document.getElementById('prev').addEventListener('click', () => { day = shift(day, -1); load(); });
  document.getElementById('next').addEventListener('click', () => { if (day < today()) { day = shift(day, 1); load(); } });
  document.getElementById('win').addEventListener('click', e => { const b = e.target.closest('[data-days]'); if (!b) return; win = Number(b.dataset.days); store.set('vm.up.days', win); load(true); });
  document.getElementById('reload').addEventListener('click', () => load(true));
  document.getElementById('file').addEventListener('change', e => { const f = e.target.files && e.target.files[0]; if (f) sendFile(f); e.target.value = ''; });
  // the rules: edit fills the form, remove asks first, a family from the list below fills the pattern
  const form = document.getElementById('rule-form');
  app.content.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => {
    const r = (d.rules || []).find(x => x.id === b.dataset.edit); if (!r) return;
    document.getElementById('r-id').value = r.id; document.getElementById('r-pattern').value = r.pattern; document.getElementById('r-site').value = r.site_id || ''; document.getElementById('r-note').value = r.note || '';
    document.getElementById('r-pattern').focus();
  }));
  app.content.querySelectorAll('[data-delete]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm(L('Remove this rule? The sessions it placed go back to the phone list, or to nobody.'))) return;
    try { await up('rule_delete', { id: b.dataset.delete }); toast(L('Removed.')); load(true); } catch (err) { toast(friendly(L, err.message, ERR)); }
  }));
  app.content.querySelectorAll('[data-assign]').forEach(b => b.addEventListener('click', () => {
    document.getElementById('r-id').value = ''; document.getElementById('r-pattern').value = '^' + b.dataset.assign.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); document.getElementById('r-site').focus();
  }));
  document.getElementById('r-clear').addEventListener('click', () => { form.reset(); document.getElementById('r-id').value = ''; });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const r = await up('rule_set', { id: document.getElementById('r-id').value, pattern: document.getElementById('r-pattern').value, site_id: document.getElementById('r-site').value, note: document.getElementById('r-note').value });
      toast(plural(r.rows, 'Saved. 1 session placed again.', 'Saved. {n} sessions placed again.')); load(true);
    } catch (err) { toast(friendly(L, err.message, ERR)); }
  });
  document.getElementById('phone-form').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const r = await up('phone_set', { phone: document.getElementById('p-phone').value, site_id: document.getElementById('p-site').value, status: document.getElementById('p-status').value });
      toast(plural(r.rows, 'Saved. 1 session placed again.', 'Saved. {n} sessions placed again.')); load(true);
    } catch (err) { toast(friendly(L, err.message, ERR)); }
  });
}

function drawCharts() {
  for (const el of app.content.querySelectorAll('.chart[data-chart]')) { const f = charts[el.dataset.chart]; if (f) el.innerHTML = f(Math.max(160, el.clientWidth || 320)); }
}
window.addEventListener('resize', () => { if (data) drawCharts(); });

/* the file, sent in slices of four thousand lines so no one call runs long; the header, when there is one, goes on every slice */
async function sendFile(f) {
  const note = document.getElementById('file-note');
  const text = (await f.text()).replace(/^﻿/, '');
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const header = /^user_key,/i.test(lines[0] || '') ? lines.shift() : '';
  if (!lines.length) return toast(L('That file is empty.'));
  const SIZE = 4000; const tot = { lines: 0, new: 0, updated: 0, rejected: 0 };
  try {
    for (let i = 0; i < lines.length; i += SIZE) {
      note.textContent = L('Sending {a} of {b} lines', { a: n(Math.min(i + SIZE, lines.length)), b: n(lines.length) });
      const r = await rpc('dr_upload_ingest', { p_code: '', p_csv: (header ? header + '\n' : '') + lines.slice(i, i + SIZE).join('\n') });
      for (const k of Object.keys(tot)) tot[k] += Number(r[k] || 0);
    }
    toast(L('Lines read: {lines}. New: {added}. Already in: {updated}. Refused: {rejected}.', { lines: n(tot.lines), added: n(tot.new), updated: n(tot.updated), rejected: n(tot.rejected) }));
    load(true);
  } catch (err) { toast(friendly(L, err.message, ERR)); load(true); }
}

load();
