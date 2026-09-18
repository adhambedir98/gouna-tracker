// Uploads: the client's export of every uploaded session, kept under the dashboard and judged against the check-outs.
// The file is the ground truth for hours. It comes in daily through dr_upload_ingest, whole or in slices, and lands on
// its session id, so the same rows twice change nothing but the verdicts. A session belongs to a site by the check-out
// that listed its phone that day, else by the account's name, else by the phone list. It opens for management.
import { mount, esc, labels, store, toast, fmt, initialHash, setHash } from '../app.js';
import { cfg, rpc, gate, loading, failed, friendly, dayLabel, shortDay, today, shift } from '../online.js';
import { bars, area, hbars } from '../charts.js';

const L = await labels('uploads');
const app = await mount({ page: 'uploads', title: L('Uploads'), lede: '' });

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

/* one sentence each: the things on this day that somebody should look at */
function alerts(d) {
  const out = [];
  const sites = d.sites || [];
  for (const s of sites) {
    const typed = num(s.typed), uploaded = num(s.uploaded), pending = num(s.pending);
    if (s.typed != null && uploaded === 0) out.push(L('{site} typed {typed} hours and nothing from it has uploaded.', { site: s.name, typed: n(typed) }));
    else if (d.settled && s.typed != null && typed > 1.2 * uploaded) out.push(L('{site} typed {typed} hours. Three days on, only {uploaded} have uploaded. The count looks high, or footage is stuck on the phones.', { site: s.name, typed: n(typed), uploaded: n(uploaded) }));
    if (s.typed == null && uploaded > 0) out.push(L('{site} uploaded {uploaded} hours but sent no check-out.', { site: s.name, uploaded: n(uploaded) }));
    const wrong = s.wrong_on_ledger || [];
    if (wrong.length) out.push(L('{site} listed phones the phone list gives to another site: {list}.', { site: s.name, list: wrong.slice(0, 8).map(w => `${w.tag} (${w.home})`).join(', ') + (wrong.length > 8 ? ', ' + L('and more') : '') }));
    if (num(s.unlisted)) out.push(L('Phones that uploaded for {site} without being on its check-out: {n}.', { n: n(s.unlisted), site: s.name }));
    if (num(s.fraud)) out.push(L('Sessions marked fraud at {site}: {n}.', { site: s.name, n: n(s.fraud) }));
  }
  const f = d.flags || {};
  if ((f.shared || []).length) { const t = f.shared[0]; out.push(L('{account} recorded {h} hours on {day}: one login on several phones at once. The hours are real, but they cannot be followed phone by phone.', { account: t.account, h: n(t.hours), day: shortDay(t.day) })); }
  if ((f.clock || []).length) out.push(L('Accounts that upload before they record, so their clocks are wrong: {list}.', { list: f.clock.slice(0, 8).map(c => c.account).join(', ') + (f.clock.length > 8 ? ', ' + L('and more') : '') }));
  if (num(d.unplaced && d.unplaced.hours)) out.push(L('{h} hours on this day belong to no site the rules know. See the accounts below.', { h: n(d.unplaced.hours) }));
  return out;
}

function render() {
  const d = data, t = d.totals || {}, file = d.file || {}, sites = d.sites || [];
  const isToday = day === today();
  const days = d.days || [];
  charts = {};
  const labels30 = days.map(x => shortDay(x.day));
  charts.days = w => area({ series: [{ values: days.map(x => num(x.uploaded)) }, { values: days.map(x => (x.typed == null ? null : num(x.typed))) }], labels: labels30, hi: days.length - 1, w, h: 190, fmt: n, label: L('Hours per day: uploaded, and typed on the check-outs') });
  charts.weekdays = w => bars({ values: (d.weekdays || []).map(num), labels: [L('Mon'), L('Tue'), L('Wed'), L('Thu'), L('Fri'), L('Sat'), L('Sun')], w, h: 160, fmt: n, label: L('Hours by weekday') });
  charts.hours = w => bars({ values: (d.hours_of_day || []).map(num), labels: Array.from({ length: 24 }, (_, i) => (i % 3 ? '' : String(i))), w, h: 160, fmt: n, label: L('Sessions by hour of the day') });
  charts.lag = w => hbars({ w, rowH: 28, rows: sites.filter(s => s.lag_median != null).map(s => ({ label: s.name, value: num(s.lag_median), text: one(s.lag_median) })), fmt: one, ref: 24, refText: L('a day'), label: L('Hours from recording to upload, the middle phone') });

  const head = d.settled
    ? L('{day}: the sites typed {typed} hours and {uploaded} have uploaded. The day is settled.', { day: dayLabel(day), typed: n(t.typed), uploaded: n(t.uploaded) })
    : L('{day}: the sites typed {typed} hours and {uploaded} have uploaded so far. A quarter of footage lands more than a day later, so this day is not settled until {until}.', { day: dayLabel(day), typed: n(t.typed), uploaded: n(t.uploaded), until: shortDay(shift(day, 3)) });
  const tile = (label, value, ctx) => `<div class="kpi"><div class="lbl">${esc(label)}</div><div class="big num">${value}</div><div class="ctx">${esc(ctx || '')}</div></div>`;
  const alertList = alerts(d);
  const cell = (v, cls = 'num') => `<td class="${cls}">${v}</td>`;
  const gapOf = s => (s.typed == null ? null : num(s.typed) - num(s.uploaded));
  const row = s => {
    const gap = gapOf(s);
    const marks = [s.estimated ? `<span class="pill est">${esc(L('estimated'))}</span>` : '', (s.wrong_on_ledger || []).length ? `<span class="pill late">${esc(L('{n} on another list', { n: n(s.wrong_on_ledger.length) }))}</span>` : ''].join('');
    return `<tr><td><b>${esc(s.name)}</b>${marks}</td>${cell(s.typed == null ? `<span class="mute">${esc(L('no check-out'))}</span>` : n(s.typed))}${cell(n(s.uploaded))}${cell(s.pending == null ? '' : n(s.pending))}${cell(gap == null ? '' : (gap > 0 ? '+' : '') + n(Math.round(gap)), 'num' + (d.settled && gap != null && gap > 0.2 * num(s.typed) ? ' late' : ''))}${cell(`${n(s.accounts)}<span class="tiny mute" style="display:block">${esc(s.listed ? L('{a} listed', { a: n(s.listed) }) : '')}</span>`)}${cell(num(s.fraud) ? `<span class="late">${n(s.fraud)}</span>` : '0')}${cell(n(s.flagged))}${cell(n(s.unreviewed))}${cell(s.lag_median == null ? '' : one(s.lag_median), 'num wide-col')}</tr>`;
  };
  const sum = k => sites.reduce((a, s) => a + num(s[k]), 0);
  const gapAll = sites.reduce((a, s) => a + (gapOf(s) || 0), 0);
  const foot = `<tfoot><tr><th scope="row">${esc(L('The day'))}</th>${cell(n(t.typed))}${cell(n(t.uploaded))}${cell(n(t.pending))}${cell((gapAll > 0 ? '+' : '') + n(Math.round(gapAll)))}${cell(n(sum('accounts')))}${cell(n(t.fraud))}${cell(n(t.flagged))}${cell(n(t.unreviewed))}${cell('', 'num wide-col')}</tr></tfoot>`;

  const ruleRow = r => `<tr data-id="${esc(r.id)}"><td><code>${esc(r.pattern)}</code></td><td>${r.site ? esc(r.site) : `<span class="mute">${esc(L('legacy, not counted'))}</span>`}</td><td class="num">${n(r.accounts)}</td><td class="num">${n(r.hours)}</td><td class="mute">${esc(r.note || '')}</td><td><button type="button" class="btn small" data-edit="${esc(r.id)}">${esc(L('Edit'))}</button> <button type="button" class="btn small" data-delete="${esc(r.id)}">${esc(L('Remove'))}</button></td></tr>`;
  const siteOpts = (chosen = '') => `<option value="">${esc(L('No site: legacy'))}</option>` + (d.sites_list || []).map(s => `<option value="${esc(s.id)}"${s.id === chosen ? ' selected' : ''}>${esc(s.name)}</option>`).join('');
  const lengths = d.lengths || {};

  app.content.innerHTML = `<div id="rep">
    <div class="daybar">
      <div class="chip"><button type="button" class="btn small" id="prev" aria-label="${esc(L('The day before'))}">&lsaquo;</button><input type="date" id="day" value="${esc(day)}" max="${esc(today())}"><button type="button" class="btn small" id="next" ${isToday ? 'disabled' : ''} aria-label="${esc(L('The day after'))}">&rsaquo;</button></div>
      <div class="chip"><label for="win">${esc(L('Window'))}</label><select id="win">${[30, 60, 90].map(w => `<option value="${w}"${w === win ? ' selected' : ''}>${esc(L('{n} days', { n: n(w) }))}</option>`).join('')}</select></div>
      <div class="chip"><label class="btn small" for="file">${esc(L('Upload the file'))}</label><input type="file" id="file" accept=".csv,text/csv" hidden></div>
      <span class="tiny mute grow" id="file-note">${esc(file.imported_at ? L('Last file {when}, {sessions} sessions, {first} to {last}.', { when: file.imported_at, sessions: n(file.sessions), first: shortDay(file.first_day), last: shortDay(file.last_day) }) : L('No file yet.'))}</span>
    </div>
    <p class="headline">${esc(head)}</p>
    <div class="hero">
      ${tile(L('Uploaded that day'), n(t.uploaded), L('{s} sessions from {a} accounts', { s: n(t.sessions), a: n(sum('accounts')) }))}
      ${tile(L('Typed on the check-outs'), n(t.typed), t.typed ? L('uploaded is {p} of it', { p: pct(t.uploaded, t.typed) }) : '')}
      ${tile(L('Pending, by the check-outs'), n(t.pending), L('what the phones were still holding'))}
      ${tile(L('Unreviewed'), n(t.unreviewed), L('sessions with no verdict yet'))}
      ${tile(L('Fraud'), n(t.fraud), L('sessions marked fraud that day'))}
    </div>
    ${alertList.length ? `<section><h3>${esc(L('Look at'))}</h3><ul class="lines">${alertList.map(a => `<li>${esc(a)}</li>`).join('')}</ul></section>` : ''}
    <section>
      <h3>${esc(L('Typed against uploaded'))}</h3>
      <div class="t-wrap"><table class="t rep" id="up-sites"><thead><tr><th>${esc(L('Site'))}</th><th class="num">${esc(L('Typed'))}</th><th class="num">${esc(L('Uploaded'))}</th><th class="num">${esc(L('Pending'))}</th><th class="num">${esc(L('Gap'))}</th><th class="num">${esc(L('Accounts'))}</th><th class="num">${esc(L('Fraud'))}</th><th class="num">${esc(L('Flags'))}</th><th class="num">${esc(L('Unreviewed'))}</th><th class="num wide-col">${esc(L('Lag, hours'))}</th></tr></thead>
        <tbody>${sites.map(row).join('')}</tbody>${foot}</table></div>
      <p class="tiny mute">${esc(L('Gap is typed minus uploaded. Until a day is settled, part of it is still on the phones: the pending column is what the check-outs saw there. Legacy accounts and accounts the rules cannot place are in no row.'))}${num(d.legacy && d.legacy.hours) ? ' ' + esc(L('Legacy accounts uploaded {h} hours this day.', { h: n(d.legacy.hours) })) : ''}</p>
    </section>
    <section>
      <h3>${esc(L('The last {n} days', { n: n(win) }))}</h3>
      <div class="trend-grid">
        <div class="trend"><div class="chart" data-chart="days"></div></div>
        <div class="trend"><div class="chart" data-chart="weekdays"></div></div>
        <div class="trend"><div class="chart" data-chart="hours"></div></div>
        <div class="trend"><div class="chart" data-chart="lag"></div></div>
      </div>
      <p class="tiny mute">${esc(L('Sessions in the window: {full} of 30 minutes, {mid} between 10 and 30, {short} under 10, {over} longer than the app allows.', { full: n(lengths.full), mid: n(lengths.mid), short: n(lengths.short), over: n(lengths.over) }))}</p>
    </section>
    <details class="more first" id="accounts"><summary data-open="${esc(L('Open'))}" data-close="${esc(L('Close'))}"><h3>${esc(L('Accounts and phones'))}</h3></summary><div class="body">
      <p class="tiny mute">${esc(L('A session belongs to a site by the check-out that listed its phone that day, else by the first rule below that matches the part of its email before the @, else by the phone list. {placed} of {phones} phones on the list have a site.', { placed: n(d.phones && d.phones.placed), phones: n(d.phones && d.phones.listed) }))}</p>
      <div class="t-wrap"><table class="t" id="rules"><thead><tr><th>${esc(L('Pattern'))}</th><th>${esc(L('Site'))}</th><th class="num">${esc(L('Accounts'))}</th><th class="num">${esc(L('Hours'))}</th><th>${esc(L('Note'))}</th><th></th></tr></thead><tbody>${(d.rules || []).map(ruleRow).join('')}</tbody></table></div>
      <form class="stdform" id="rule-form"><input type="hidden" id="r-id" value=""><div class="fgrid">
        <div class="ff"><label class="fl" for="r-pattern">${esc(L('Pattern'))}<small>${esc(L('A regular expression. ^ahm matches ahm01, ahm02 and the rest.'))}</small></label><input type="text" id="r-pattern"></div>
        <div class="ff"><label class="fl" for="r-site">${esc(L('Site'))}</label><select id="r-site">${siteOpts()}</select></div>
        <div class="ff"><label class="fl" for="r-note">${esc(L('Note'))}</label><input type="text" id="r-note"></div>
      </div><div class="btn-row"><button type="submit" class="btn primary">${esc(L('Save the rule'))}</button><button type="button" class="btn" id="r-clear">${esc(L('Clear'))}</button></div></form>
      ${(d.unassigned || []).length ? `<h4>${esc(L('Accounts no rule places'))}</h4><div class="t-wrap"><table class="t"><thead><tr><th>${esc(L('Account family'))}</th><th class="num">${esc(L('Accounts'))}</th><th class="num">${esc(L('Hours'))}</th><th>${esc(L('Last upload'))}</th><th></th></tr></thead><tbody>${d.unassigned.map(u => `<tr><td><code>${esc(u.family || L('numbered, not on the phone list'))}</code></td><td class="num">${n(u.accounts)}</td><td class="num">${n(u.hours)}</td><td>${esc(shortDay(u.last_day))}</td><td>${u.family ? `<button type="button" class="btn small" data-assign="${esc(u.family)}">${esc(L('Write a rule'))}</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : ''}
      <form class="stdform" id="phone-form"><h4>${esc(L('Move a phone on the list'))}</h4><div class="fgrid">
        <div class="ff"><label class="fl" for="p-phone">${esc(L('Phone number'))}</label><input type="number" id="p-phone" min="1" max="9999" inputmode="numeric"></div>
        <div class="ff"><label class="fl" for="p-site">${esc(L('Site'))}</label><select id="p-site">${siteOpts()}</select></div>
        <div class="ff"><label class="fl" for="p-status">${esc(L('Status'))}</label><select id="p-status"><option value="active">${esc(L('active'))}</option><option value="inactive">${esc(L('inactive'))}</option><option value="lost">${esc(L('lost'))}</option></select></div>
      </div><div class="btn-row"><button type="submit" class="btn primary">${esc(L('Save the phone'))}</button></div></form>
    </div></details>
    <details class="more" id="agent"><summary data-open="${esc(L('Open'))}" data-close="${esc(L('Close'))}"><h3>${esc(L('Sending the file every day'))}</h3></summary><div class="body">
      <p>${esc(L('Post the export as text to the address below, with the management code. The whole file or only the new days: rows that are already in change nothing but their verdicts. A file over a few thousand lines goes in slices, the way the button above sends it.'))}</p>
      <pre class="code">${esc(`curl -X POST '${cfg.url}/rest/v1/rpc/dr_upload_ingest' \\\n  -H 'apikey: ${cfg.key}' -H 'Authorization: Bearer ${cfg.key}' -H 'Content-Type: application/json' \\\n  -d "$(jq -n --arg csv \"$(cat uploads.csv)\" --arg code MANAGEMENT_CODE '{p_code: $code, p_csv: $csv}')"`)}</pre>
      <p class="tiny mute">${esc(L('The key above is the public one every page of this site carries. The management code is the one on the settings panel of the dashboard.'))}</p>
    </div></details>
  </div>`;

  drawCharts();
  document.getElementById('day').addEventListener('change', e => { if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value) && e.target.value <= today()) { day = e.target.value; load(); } });
  document.getElementById('prev').addEventListener('click', () => { day = shift(day, -1); load(); });
  document.getElementById('next').addEventListener('click', () => { if (day < today()) { day = shift(day, 1); load(); } });
  document.getElementById('win').addEventListener('change', e => { win = Number(e.target.value); store.set('vm.up.days', win); load(); });
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
      toast(L('Saved. {n} sessions placed again.', { n: n(r.rows) })); load(true);
    } catch (err) { toast(friendly(L, err.message, ERR)); }
  });
  document.getElementById('phone-form').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const r = await up('phone_set', { phone: document.getElementById('p-phone').value, site_id: document.getElementById('p-site').value, status: document.getElementById('p-status').value });
      toast(L('Saved. {n} sessions placed again.', { n: n(r.rows) })); load(true);
    } catch (err) { toast(friendly(L, err.message, ERR)); }
  });
}

function drawCharts() {
  for (const el of app.content.querySelectorAll('.chart[data-chart]')) { const f = charts[el.dataset.chart]; if (f) el.innerHTML = f(Math.max(160, el.clientWidth || 320)); }
}
window.addEventListener('resize', () => { if (data) drawCharts(); });

/* the file, sent in slices of four thousand lines so no one call runs long; every slice carries the header */
async function sendFile(f) {
  const note = document.getElementById('file-note');
  const text = await f.text();
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return toast(L('That file is empty.'));
  const header = lines.shift();
  const SIZE = 4000; const tot = { lines: 0, new: 0, updated: 0, rejected: 0 };
  try {
    for (let i = 0; i < lines.length; i += SIZE) {
      note.textContent = L('Sending {a} of {b} lines', { a: n(Math.min(i + SIZE, lines.length)), b: n(lines.length) });
      const r = await rpc('dr_upload_ingest', { p_code: '', p_csv: header + '\n' + lines.slice(i, i + SIZE).join('\n') });
      for (const k of Object.keys(tot)) tot[k] += Number(r[k] || 0);
    }
    toast(L('{lines} lines: {added} new sessions, {updated} already in, {rejected} refused.', { lines: n(tot.lines), added: n(tot.new), updated: n(tot.updated), rejected: n(tot.rejected) }));
    load(true);
  } catch (err) { note.textContent = ''; toast(friendly(L, err.message, ERR)); }
}

load();
