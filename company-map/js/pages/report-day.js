// The company report. Every site's morning check-in and evening check-out, added up into one page for management. It builds itself.
// Reading it takes the management code. The same page manages the codes, the deadlines, the targets, the posts, and shows the activity log.
import { mount, esc, labels, store, toast, fmt, initialHash, setHash, href, printPage } from '../app.js';
import { rpc, admin as adminCall, gate, loading, failed, friendly, clock, dayLabel, shortDay, nowTime, today, shift, kindLabel, CODE } from '../online.js';
import { bars, area, ring, sparkline, dumbbell, hbars, strip } from '../charts.js';

const L = await labels('report-day');
const app = await mount({ page: 'report/day', title: L('Company report'), lede: L('Every site, added up into one page: who started by 9:00 AM, who reported by 6:00 PM, and what happened. Nobody collects anything.') });

const n = v => fmt(v ?? 0);
const TEAM = { direct: L('Direct Ops'), partner: L('Channel') };
const KIND = kindLabel(L);
let code = store.get(CODE, '');
let day = /^\d{4}-\d{2}-\d{2}$/.test(initialHash()) ? initialHash() : today();
let data = null;
const admin = (action, p = {}) => adminCall(code, action, p);
const ERR = { 'bad month': L('Pick a month.'), 'not a Slack webhook': L('That is not a Slack webhook address.'), 'not a Resend key': L('That is not a Resend key.'), 'not an email address': L('That is not an email address.') };

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

/* the numbers everything else is built on: the day, the seven days before it, and the month so far */
const OPT_IN_FLOOR = 0.8;
const PRINT_W = { spark: 102, ring: 170, t: 324, siteBars: 324, siteDots: 324, sitePer: 324, siteOpt: 324, week: 48 };
const pct = (a, b) => (Number(b) ? Math.round(Number(a) / Number(b) * 100) + '%' : '');
const per = (h, p) => (Number(p) ? (Number(h) / Number(p)).toFixed(1) : '');
const one = v => (v == null ? '' : (Math.round(Number(v) * 10) / 10).toFixed(1));
const whole = v => (v == null ? '' : n(Math.round(Number(v))));
const rate = v => (v == null ? '' : Math.round(Number(v) * 100) + '%');
const num = v => Number(v) || 0;
const plural = (v, one, many) => (num(v) === 1 ? L(one) : L(many, { n: n(v) }));
const minutesLate = (at, deadline) => { const [h1, m1] = String(at).split(':').map(Number), [h2, m2] = String(deadline).split(':').map(Number); return Math.max(0, (h1 * 60 + m1) - (h2 * 60 + m2)); };
const sum = (set, k) => set.reduce((a, x) => a + num(x[k]), 0);
const pool = set => { const h = sum(set, 'hours'), p = sum(set, 'phones_deployed'), w = sum(set, 'wearers_present'); const m = k => (set.length ? sum(set, k) / set.length : null);
  return { n: set.length, hours: m('hours'), phones: m('phones_deployed'), present: m('wearers_present'), perPhone: p ? h / p : null, optIn: w ? p / w : null }; };
let charts = {};   // chart kind -> (width) => svg string, filled by render(); drawn at the host's real width so text stays 13px
let model = null;  // what render() worked out, reused by the text copy

/* draws every chart at its host's width (or a fixed width for print) without touching the rest of the page */
function drawCharts(fixed) {
  for (const host of app.content.querySelectorAll('[data-chart]')) {
    const [kind] = host.dataset.chart.split(':');
    const fn = charts[host.dataset.chart];
    if (!fn) continue;
    const w = fixed ? (fixed[kind] || fixed.spark) : Math.max(60, Math.round(host.clientWidth || host.parentElement.clientWidth || 300));
    host.innerHTML = fn(w);
  }
}
let lastW = 0;
window.addEventListener('resize', () => { requestAnimationFrame(() => { const w = app.content.clientWidth; if (Math.abs(w - lastW) > 8) { lastW = w; drawCharts(); } }); });

/* the page */
function render() {
  const d = data, t = d.totals || {}, m = d.morning || {}, sites = d.sites || [], filed = d.incidents || [], days = d.days || [], month = d.month || {};
  const expected = num(d.expected), target = num(d.target_day), isToday = day === today();
  const hours = num(t.hours), phones = num(t.phones_deployed), present = num(t.wearers_present), uploaded = num(t.hours_uploaded), reported = num(t.reported);
  const perPhone = phones ? hours / phones : null, optIn = present ? phones / present : null;
  const missing = sites.filter(s => s.active && !s.report);
  const last = days.length - 1;
  const day7 = days.slice(Math.max(0, last - 7), last).filter(x => x.has);
  const monthDays = days.slice(0, last).filter(x => x.has && String(x.day).slice(0, 7) === day.slice(0, 7));
  const avg7 = pool(day7), avgM = pool(monthDays);
  const who = s => s.book || s.lead || '';
  const teamOf = s => (s.team === 'partner' ? L('Channel') : L('Direct Ops'));
  const names = list => list.map(s => s.name).join(', ');

  /* the headline: what happened, in two sentences */
  let headline = '';
  if (!reported) headline = isToday ? L('No site has reported yet.') : L('No report for this day. Every site counts as zero.');
  else {
    headline = L('{hours} hours from {phones} phones at {reported} of {expected} sites.', { hours: n(hours), phones: n(phones), reported: n(reported), expected: n(expected) });
    let second = '';
    if (missing.length) second = `<span class="late">${esc(missing.length === 1 ? L('{names} did not report and counts as zero.', { names: names(missing) }) : L('{names} did not report and count as zero.', { names: names(missing) }))}</span>`;
    else if (target) second = esc(hours >= target ? L('That beats the {target} target.', { target: n(target) }) : L('{shortfall} short of the {target} target.', { shortfall: n(target - hours), target: n(target) }));
    else if (perPhone != null && avg7.perPhone != null && Math.abs(perPhone - avg7.perPhone) >= avg7.perPhone * 0.1) second = esc(L(perPhone > avg7.perPhone ? 'Hours per phone rose to {x} from {y} over the last 7 days.' : 'Hours per phone fell to {x} from {y} over the last 7 days.', { x: one(perPhone), y: one(avg7.perPhone) }));
    else if (optIn != null && optIn < 0.9) second = esc(L('{gap} people were present but not filming.', { gap: n(present - phones) }));
    else second = esc(!num(t.late) && !num(t.incidents) && !num(t.flags) ? L('Every site in on time, no incidents, no flags.') : L('Every site is in.'));
    headline = esc(headline) + ' ' + second;
  }

  /* the five */
  const cmp = (a, b, f) => (a != null && b != null ? L('7 day average {a}, month {b}', { a: f(a), b: f(b) }) : a != null ? L('7 day average {a}', { a: f(a) }) : b != null ? L('month average {b}', { b: f(b) }) : L('no earlier days yet'));
  const has = x => x.has;
  const tile = (label, value, ctx, cmpLine, chart, cls = '') => `<div class="kpi${cls}"><div class="k-txt"><div class="lbl">${esc(label)}</div><div class="big num">${value}</div><div class="ctx">${esc(ctx)}</div><div class="cmp">${esc(cmpLine)}</div></div>${chart}</div>`;
  const tiles = [
    tile(L('Phones active'), n(phones), !reported ? L('no site is in yet') : num(t.phones_out) ? L('{m} recording this morning, {o} down', { m: n(m.phones_deployed), o: n(t.phones_out) }) : L('{m} recording this morning', { m: n(m.phones_deployed) }), cmp(avg7.n ? avg7.phones : null, avgM.n ? avgM.phones : null, whole), `<div class="chart" data-chart="spark:phones"></div>`),
    tile(L('Hours today'), n(hours), '', cmp(avg7.n ? avg7.hours : null, avgM.n ? avgM.hours : null, whole), `<div class="chart" data-chart="spark:hours"></div>`),
    tile(L('Hours per phone'), perPhone == null ? `<span class="mute">0</span>` : one(perPhone), !phones ? L('no phones reported') : target ? L('{x} needed for the target', { x: one(target / phones) }) : L('{hours} hours on {phones} phones', { hours: n(hours), phones: n(phones) }), cmp(avg7.perPhone, avgM.perPhone, one), `<div class="chart" data-chart="spark:perphone"></div>`),
    tile(L('Opt-in rate'), optIn == null ? '0%' : rate(optIn), !present ? L('no employee count yet') : L('{phones} phones for {present} present', { phones: n(phones), present: n(present) }) + (optIn > 1 ? L(', more phones than people') : ''), cmp(avg7.optIn, avgM.optIn, rate), `<div class="chart" data-chart="spark:optin"></div>`),
    tile(L('Present vs filming'), `<span class="two">${esc(L('{n} present', { n: n(present) }))}</span><span class="two">${esc(L('{n} filming', { n: n(phones) }))}</span>`,
      !present && !phones ? L('no counts yet') : phones < present ? L('{gap} present but not filming', { gap: n(present - phones) }) : phones === present ? L('everyone present is filming') : plural(phones - present, '1 more phone than people', '{n} more phones than people'),
      avg7.n ? L('last 7 days: {f} of {p} filming', { f: whole(avg7.phones), p: whole(avg7.present) }) : L('no earlier days yet'),
      present || phones ? `<div class="k-bars"><div class="bar o" style="width:${Math.round(100 * present / Math.max(present, phones))}%"></div><div class="bar f" style="width:${Math.round(100 * phones / Math.max(present, phones))}%"></div></div>` : '', ' five')
  ];
  charts = {};
  const series = f => days.map(x => (x.has ? f(x) : null));
  charts['spark:phones'] = w => sparkline({ values: series(x => x.phones_deployed), w, h: 44, label: L('{label}, the last 30 days', { label: L('Phones active') }) });
  charts['spark:hours'] = w => sparkline({ values: series(x => x.hours), w, h: 44, target, label: L('{label}, the last 30 days', { label: L('Hours today') }) });
  charts['spark:perphone'] = w => sparkline({ values: series(x => (num(x.phones_deployed) ? num(x.hours) / num(x.phones_deployed) : null)), w, h: 44, label: L('{label}, the last 30 days', { label: L('Hours per phone') }) });
  charts['spark:optin'] = w => sparkline({ values: series(x => (num(x.wearers_present) ? 100 * num(x.phones_deployed) / num(x.wearers_present) : null)), w, h: 44, target: 100, label: L('{label}, the last 30 days', { label: L('Opt-in rate') }) });

  /* the morning and the evening, as boxes */
  const box = (v, label, cls = '') => `<div${cls ? ` class="${cls}"` : ''}><div class="big num">${v}</div><div class="lbl">${esc(label)}</div></div>`;
  const morningBoxes = `<div class="stat">${box(`${n(m.checked_in)}<span class="mute"> / ${n(expected)}</span>`, L('sites started by {time}', { time: clock(L, d.checkin_deadline || '09:00') }))}${box(n(m.phones_deployed), L('phones recording'))}${box(n(m.wearers_present), L('employees present'))}${box(n(m.phones_out), L('phones down'))}${box(n(m.problems), L('sites with a problem'))}${box(n(m.late), L('late check-ins'))}</div>`;
  const eveningBoxes = `<div class="stat">${box(`${n(reported)}<span class="mute"> / ${n(expected)}</span>`, L('sites in by {time}', { time: clock(L, d.deadline || '18:00') }))}${box(n(uploaded), hours ? L('hours uploaded, {pct}%', { pct: Math.round(100 * uploaded / hours) }) : L('hours uploaded'))}${box(n(t.backlog), L('phones still holding minutes'))}${box(n(t.flags), L('QC flags'))}${box(n(t.incidents), L('incident lines'))}${box(n(t.late), L('late check-outs'))}</div>`;
  const morningLine = L('Morning: {a} of {b} sites started by {time}, {p} phones recording, {w} present, {o} down.', { a: n(m.checked_in), b: n(expected), time: clock(L, d.checkin_deadline || '09:00'), p: n(m.phones_deployed), w: n(m.wearers_present), o: n(m.phones_out) });
  const eveningLine = hours ? [L('Evening: {u} of {h} uploaded ({pct}%)', { u: n(uploaded), h: n(hours), pct: Math.round(100 * uploaded / hours) }), num(t.backlog) ? plural(t.backlog, '1 phone still holding minutes', '{n} phones still holding minutes') : '', num(t.flags) ? plural(t.flags, '1 flag', '{n} flags') : '', num(t.incidents) ? plural(t.incidents, '1 incident line', '{n} incident lines') : ''].filter(Boolean).join(', ') + '.' : L('Evening: nothing recorded yet.');

  /* needs attention: one row per site with something to act on, the most urgent rule first */
  const now = nowTime();
  const beforeReport = isToday && now < (d.deadline || '18:00'), beforeCheckin = isToday && now < (d.checkin_deadline || '09:00');
  const attn = sites.filter(s => s.active || s.report || s.checkin).map(s => {
    const r = s.report, c = s.checkin, pills = [], lines = []; let rank = 99;
    const fire = (k, pill, cls, line) => { rank = Math.min(rank, k); if (pill) pills.push({ text: pill, cls }); if (line) lines.push(line); };
    if (!r) { if (beforeReport) fire(1, L('not in yet'), '', L('no report yet')); else fire(1, L('not in'), 'late', L('counted as zero, call {who}', { who: who(s) || teamOf(s) })); }
    if (!c) { if (beforeCheckin) fire(2, L('not started yet'), '', ''); else fire(2, L('no check-in'), 'late', ''); }
    if ((c && c.late) || (r && r.late)) fire(3, L('late'), 'late', [c && c.late ? L('check-in at {time}', { time: clock(L, c.first_at) }) : '', r && r.late ? L('report at {time}, {m} minutes late', { time: clock(L, r.first_at), m: n(minutesLate(r.first_at, d.deadline || '18:00')) }) : ''].filter(Boolean).join(', '));
    if (r && r.incident) fire(4, L('incident'), 'late', `${r.problems || ''}${filed.some(i => i.site_id === s.id) ? '' : ' <span class="late">' + esc(L('no form yet')) + '</span>'}`.trim());
    if (c && c.ok === false) fire(5, L('morning problem'), '', c.note || L('a problem, no note'));
    const down = r ? num(r.phones_out) : c ? num(c.phones_out) : 0;
    if (down) fire(6, '', '', plural(down, '1 phone down', '{n} phones down'));
    if (r && num(r.backlog)) fire(7, '', '', plural(r.backlog, '1 phone still holding minutes', '{n} phones still holding minutes'));
    if (r && num(r.wearers_present) && num(r.phones_deployed) / num(r.wearers_present) < OPT_IN_FLOOR) fire(8, '', '', L('opt-in {p}%, {gap} present but not filming', { p: Math.round(100 * num(r.phones_deployed) / num(r.wearers_present)), gap: n(num(r.wearers_present) - num(r.phones_deployed)) }));
    if (r && num(r.phones_deployed) > num(r.wearers_present) && num(r.wearers_present)) fire(9, '', '', L('more phones than people, check the count'));
    if (r && perPhone != null && num(r.phones_deployed) && num(r.hours) / num(r.phones_deployed) < perPhone * 0.7) fire(10, '', '', L('{x} hours per phone, company {y}', { x: one(num(r.hours) / num(r.phones_deployed)), y: one(perPhone) }));
    if (r && num(r.flags)) fire(11, '', '', plural(r.flags, '1 QC flag', '{n} QC flags'));
    if (r && String(r.gear_needed || '').trim()) fire(12, '', '', L('needs: {gear}', { gear: r.gear_needed.trim() }));
    return { s, rank, pills, lines };
  }).filter(x => x.rank < 99).sort((a, b) => a.rank - b.rank || a.s.name.localeCompare(b.s.name));
  const attnHTML = !expected && !sites.length ? `<p class="callout">${esc(L('No active site. Add one on the site database.'))} <a href="${href('sites')}">${esc(L('Site database'))}</a></p>`
    : !attn.length ? `<p class="callout ontime">${esc(L('Nothing needs attention. Every site is in, on time, no phones down, no incidents, no flags.'))}</p>`
    : `<ul class="rows attn">${attn.map(x => `<li><b class="${x.rank <= 2 && x.pills[0].cls ? 'late' : ''}">${esc(x.s.name)}<span class="d">${esc(teamOf(x.s))}${who(x.s) ? ', ' + esc(who(x.s)) : ''}</span></b>${x.pills.map(p => `<span class="pill ${p.cls}">${esc(p.text)}</span>`).join('')} <span class="attn-lines">${x.lines.map(l => { const h = l.includes('<span') ? l : esc(l); return h.charAt(0).toUpperCase() + h.slice(1) + (/[.!?]$/.test(h.replace(/<[^>]+>/g, '').trim()) ? '' : '.'); }).join(' ')}</span></li>`).join('')}</ul>`;

  /* the last 30 days: six charts, each drawn at its box's width */
  const dayLabels = days.map((x, i) => (i === last && isToday ? L('today') : shortDay(x.day)));
  const withData = days.filter(has).length;
  const optSeries = series(x => (num(x.wearers_present) ? 100 * num(x.phones_deployed) / num(x.wearers_present) : null));
  const cellsOf = days.map(x => (!x.has || !num(x.expected) ? null : num(x.reported) >= num(x.expected) ? 'all' : num(x.reported) ? 'some' : 'none'));
  charts['t:hours'] = w => bars({ values: days.map(x => x.hours), solid: days.map(x => x.hours_uploaded), labels: dayLabels, hi: last, target, w, h: 190, fmt: n, unit: L('target'), highText: L('high'), cells: cellsOf,
    links: days.map(x => x.day), titles: days.map(x => L('{day}: {hours} hours, {u} uploaded, {reported} of {expected} sites in, {phones} phones', { day: dayLabel(x.day), hours: n(x.hours), u: n(x.hours_uploaded), reported: n(x.reported), expected: n(x.expected), phones: n(x.phones_deployed) })), label: L('Hours per day') });
  charts['t:phones'] = w => area({ series: [{ values: series(x => x.phones_deployed) }, { values: series(x => x.wearers_present) }], labels: dayLabels, hi: last, w, h: 170, fmt: n, label: L('Phones filming and employees present') });
  charts['t:perphone'] = w => area({ series: [{ values: series(x => (num(x.phones_deployed) ? Math.round(10 * num(x.hours) / num(x.phones_deployed)) / 10 : null)) }], labels: dayLabels, hi: last, w, h: 170, fmt: one, ref: phones && target ? Math.round(10 * target / phones) / 10 : 0, refText: L('{x} for the target', { x: phones && target ? one(target / phones) : '' }), label: L('Hours per phone per day') });
  charts['t:optin'] = w => area({ series: [{ values: optSeries }], labels: dayLabels, hi: last, w, h: 170, ymax: Math.max(110, ...optSeries.filter(v => v != null)), fmt: v => Math.round(v) + '%', ref: 100, refText: L('everyone filming'), label: L('Opt-in rate per day') });
  charts['t:sites'] = w => bars({ values: days.map(x => x.reported), labels: dayLabels, hi: last, target: expected, w, h: 150, fmt: n, unit: L('sites'), label: L('Sites in per day') });
  charts['t:morning'] = w => area({ series: [{ values: series(x => x.phones_morning) }, { values: series(x => x.phones_deployed) }], labels: dayLabels, hi: last, w, h: 170, fmt: n, label: L('Phones recording in the morning and filming by evening') });
  const trend = (kind, title, legend) => `<div class="trend"><h4>${esc(title)}</h4><div class="chart" data-chart="${kind}"></div>${legend ? `<p class="tiny mute">${esc(legend)}</p>` : ''}</div>`;
  const trendsHTML = withData < 2 ? `<p class="mute small">${esc(L('No earlier days yet.'))}</p>` : `<div class="trend-grid">
    ${trend('t:hours', L('Hours per day'), L('Filled: uploaded. Outlined: still on the phones. Under the bars: every site in, some, or none.'))}
    ${trend('t:phones', L('Phones filming against employees present'), L('Solid: phones filming. Dashed: employees present.'))}
    ${trend('t:perphone', L('Hours per phone'), '')}
    ${trend('t:optin', L('Opt-in rate'), '')}
    ${trend('t:sites', L('Sites in by the deadline'), '')}
    ${trend('t:morning', L('Phones: morning against evening'), L('Solid: recording at the morning check-in. Dashed: filming at the evening check-out.'))}
  </div>`;

  /* the month: a ring and three boxes */
  const monthTarget = num(month.target), monthHours = num(month.hours), gone = num(month.days_gone), inMonth = num(month.days_in);
  charts.ring = () => ring({ value: monthHours, total: monthTarget || Math.max(monthHours, 1), text: n(monthHours), sub: monthTarget ? L('of {target}', { target: n(monthTarget) }) : L('this month'), tick: inMonth ? gone / inMonth : null, tickText: L('day {n}', { n: n(gone) }), label: L('{hours} of {target} hours by day {g} of {n}', { hours: n(monthHours), target: n(monthTarget), g: n(gone), n: n(inMonth) }) });
  const monthBoxes = !monthTarget ? `<p class="mute small">${esc(L('No target set for this month.'))} <a href="#admin" id="set-target">${esc(L('Set one'))}</a></p>`
    : `<div class="stat month-stat">${box(`${n(gone)}<span class="mute"> / ${n(inMonth)}</span>`, L('days gone'))}${box(num(month.per_day_needed) ? n(month.per_day_needed) : '0', num(month.per_day_needed) ? L('hours a day still needed') : L('target already met'))}${box(gone < 3 ? '' : n(month.projected), gone < 3 ? L('too early to project') : num(month.projected) >= monthTarget ? L('on pace for, over the target') : L('on pace for'))}${box(n(month.per_day), L('hours a day so far'))}</div>`;

  /* by site: four charts in the same row order, then the team table */
  const order = sites.filter(s => s.active || s.report || s.checkin).slice().sort((a, b) => (b.report ? num(b.report.hours) : -1) - (a.report ? num(a.report.hours) : -1) || a.name.localeCompare(b.name));
  const top = order.find(s => s.report && num(s.report.hours) > 0);
  const rowOf = (s, f) => (s.report ? f(s.report) : { label: s.name, value: 0, empty: true, emptyText: L('not in') });
  charts.siteBars = w => hbars({ w, rowH: 30, rows: order.map(s => rowOf(s, r => ({ label: s.name, value: num(r.hours), solid: num(r.hours_uploaded), text: n(r.hours) }))), fmt: n, label: L('Hours by site') });
  charts.siteDots = w => dumbbell({ w, rowH: 30, rows: order.map(s => { const r = s.report; if (!r) return { label: s.name, a: 0, b: 0, empty: true, emptyText: L('not in') }; const a = num(r.wearers_present), b = num(r.phones_deployed);
    return { label: s.name, a, b, text: b < a ? L('{gap} not filming', { gap: n(a - b) }) : b === a ? L('all filming') : plural(b - a, '1 phone over people', '{n} phones over people') }; }), fmt: n, label: L('Present against filming') });
  charts.sitePer = w => hbars({ w, rowH: 30, rows: order.map(s => rowOf(s, r => ({ label: s.name, value: num(r.phones_deployed) ? num(r.hours) / num(r.phones_deployed) : 0, text: per(r.hours, r.phones_deployed) || '0', hi: true, low: perPhone != null && num(r.phones_deployed) && num(r.hours) / num(r.phones_deployed) < perPhone * 0.7 }))), fmt: one, ref: perPhone || 0, refText: L('company {x}', { x: one(perPhone) }), label: L('Hours per phone by site') });
  charts.siteOpt = w => hbars({ w, rowH: 30, rows: order.map(s => rowOf(s, r => ({ label: s.name, value: num(r.wearers_present) ? 100 * num(r.phones_deployed) / num(r.wearers_present) : 0, text: pct(r.phones_deployed, r.wearers_present) || '0%', hi: true, low: num(r.wearers_present) && num(r.phones_deployed) / num(r.wearers_present) < OPT_IN_FLOOR }))), fmt: v => Math.round(v) + '%', max: 110, ref: 100, refText: L('everyone filming'), label: L('Opt-in by site') });
  const siteChart = (kind, title) => `<div class="trend"><h4>${esc(title)}</h4><div class="chart" data-chart="${kind}"></div></div>`;
  const bySiteHTML = !reported ? `<p class="mute small">${esc(L('No site is in.'))}</p>` : `<div class="trend-grid bysite">
    ${siteChart('siteBars', L('Hours, uploaded and still on the phones'))}
    ${siteChart('siteDots', L('Employees present (hollow) and phones filming (filled)'))}
    ${siteChart('sitePer', L('Hours per phone'))}
    ${siteChart('siteOpt', L('Opt-in rate'))}
  </div>`;
  const teamRows = ['direct', 'partner'].filter(k => d.teams && d.teams[k]).map(k => { const x = d.teams[k]; return `<tr><td><b>${esc(TEAM[k])}</b></td><td class="num">${n(x.checked_in)} / ${n(x.expected)}</td><td class="num${!num(x.reported) && num(x.expected) ? ' late' : ''}">${n(x.reported)} / ${n(x.expected)}</td><td class="num">${n(x.hours)}</td><td class="num">${n(x.hours_uploaded)}</td><td class="num">${n(x.phones_deployed)}</td><td class="num">${n(x.wearers_present)}</td><td class="num">${per(x.hours, x.phones_deployed)}</td><td class="num">${pct(x.phones_deployed, x.wearers_present)}</td><td class="num">${n(x.flags)}</td></tr>`; }).join('');
  const teamHTML = teamRows ? `<div class="t-wrap"><table class="t rep"><thead><tr><th>${esc(L('Team'))}</th><th class="num">${esc(L('Started'))}</th><th class="num">${esc(L('Sites in'))}</th><th class="num">${esc(L('Hours'))}</th><th class="num">${esc(L('Uploaded'))}</th><th class="num">${esc(L('Phones'))}</th><th class="num">${esc(L('Present'))}</th><th class="num">${esc(L('Per phone'))}</th><th class="num">${esc(L('Opt-in'))}</th><th class="num">${esc(L('Flags'))}</th></tr></thead><tbody>${teamRows}</tbody></table></div>` : '';
  const teamLines = ['direct', 'partner'].filter(k => d.teams && d.teams[k]).map(k => { const x = d.teams[k]; return `${TEAM[k]}: ${L('{a} of {b} in', { a: n(x.reported), b: n(x.expected) })}, ${num(x.hours) ? L('{hours} hours, {phones} phones, {x} per phone, {o} opt-in', { hours: n(x.hours), phones: n(x.phones_deployed), x: per(x.hours, x.phones_deployed) || '0', o: pct(x.phones_deployed, x.wearers_present) || '0%' }) : L('{hours} hours', { hours: n(x.hours) })}.`; });

  /* every site: the table */
  const cell = s => `<td><b>${esc(s.name)}</b><span class="tiny mute" style="display:block">${esc(teamOf(s))}${who(s) ? ', ' + esc(who(s)) : ''}</span></td>`;
  for (const s of order) charts['week:' + s.id] = () => strip({ values: s.week || [], label: L('Last 7 days: {list}', { list: (s.week || []).map(v => n(v)).join(', ') }) });
  const rowsHTML = order.map(s => { const r = s.report, c = s.checkin;
    const morning = c ? `<span class="when">${esc(clock(L, c.started_at) || clock(L, c.first_at))}</span>${c.late ? `<span class="pill late">${esc(L('late'))}</span>` : ''}${c.ok ? '' : `<span class="pill late">${esc(L('problem'))}</span>`}<span class="tiny mute" style="display:block">${esc(L('{n} phones', { n: n(c.phones_deployed) }))}</span>` : `<span class="pill miss">${esc(L('not in'))}</span>`;
    const evening = r ? `<span class="when">${esc(clock(L, r.first_at))}</span>${r.late ? `<span class="pill late">${esc(L('late'))}</span>` : ''}${r.incident ? `<span class="pill late">${esc(L('incident'))}</span>` : ''}<span class="tiny mute" style="display:block">${esc(r.reporter)}</span>` : `<span class="pill miss">${esc(L('not in'))}</span>`;
    return `<tr${r ? '' : ' class="mute"'}>${cell(s)}<td>${morning}</td><td>${evening}</td><td class="num">${r ? n(r.hours) : '0'}<div class="chart" data-chart="week:${esc(s.id)}"></div></td><td class="num">${r ? n(r.hours_uploaded) + (num(r.hours) ? `<span class="tiny mute" style="display:block">${Math.round(100 * num(r.hours_uploaded) / num(r.hours))}%</span>` : '') : ''}</td><td class="num">${r ? n(r.phones_deployed) + (num(r.phones_out) ? `<span class="tiny mute" style="display:block">${esc(L('{n} down', { n: n(r.phones_out) }))}</span>` : '') : ''}</td><td class="num">${r ? n(r.wearers_present) : ''}</td><td class="num">${r ? per(r.hours, r.phones_deployed) : ''}</td><td class="num">${r ? pct(r.phones_deployed, r.wearers_present) : ''}</td><td class="num flags">${r && num(r.flags) ? n(r.flags) : ''}</td></tr>`; }).join('');

  const noForm = sites.filter(s => s.report && s.report.incident && !filed.some(i => i.site_id === s.id));
  const note = (key, title, only) => {
    const rows = sites.filter(s => s.report && String(s.report[key] || '').trim() && (!only || only(s.report)));
    if (!rows.length) return '';
    return `<section class="notes-block"><h3>${esc(title)}</h3><dl class="notes">${rows.map(s => `<dt>${esc(s.name)}</dt><dd>${esc(s.report[key])}</dd>`).join('')}</dl></section>`;
  };
  model = { headline, morningLine, eveningLine, attn, order, avg7, top, teamLines, perPhone, optIn, hours, phones, present, uploaded, reported, expected, target, month };

  app.content.innerHTML = `
    <div class="daybar no-print">
      <button type="button" class="btn" id="prev" aria-label="${esc(L('The day before'))}">&lsaquo;</button>
      <input type="date" id="day" value="${esc(day)}" max="${today()}">
      <button type="button" class="btn" id="next" aria-label="${esc(L('The day after'))}" ${day >= today() ? 'disabled' : ''}>&rsaquo;</button>
      <button type="button" class="btn" id="reload">${esc(L('Refresh'))}</button>
      <span class="grow"></span>
      <a class="btn" href="${href('report/incidents')}">${esc(L('Incidents'))}${num(d.open_incidents) ? ` <span class="pill late">${n(d.open_incidents)}</span>` : ''}</a>
      <a class="btn" href="${href('sites')}">${esc(L('Site database'))}</a>
      <a class="btn" href="${href('team')}">${esc(L('Team'))}</a>
      <button type="button" class="btn" id="copy">${esc(L('Copy as text'))}</button>
      <button type="button" class="btn" id="print">${esc(L('Print or save a copy'))}</button>
    </div>
    <div id="rep">
      <h2>${esc(dayLabel(day))}</h2>
      <p class="headline">${headline}</p>
      <p class="mute small">${esc(L('Built at {time} Cairo time. A site with no report counts as zero.', { time: clock(L, String(d.built_at).slice(11)) }))}</p>

      <h3>${esc(L('The five'))}</h3>
      <div class="hero">${tiles.join('')}</div>

      <h3>${esc(L('The morning'))}</h3>
      ${morningBoxes}
      <h3>${esc(L('The evening'))}</h3>
      ${eveningBoxes}

      <h3>${esc(L('Needs attention'))} <span class="mute small">${esc(plural(attn.length, '1 site', '{n} sites'))}</span></h3>
      ${attnHTML}
      ${num(d.open_incidents) ? `<p class="small"><a href="${href('report/incidents')}">${esc(plural(d.open_incidents, '1 open incident in all', '{n} open incidents in all'))}</a></p>` : ''}

      <h3>${esc(L('The last 30 days'))}</h3>
      ${trendsHTML}

      <h3>${esc(L('The month'))}</h3>
      <div class="month-grid"><div class="ring-host" data-chart="ring"></div><div>${monthBoxes}</div></div>

      <h3>${esc(L('By site'))}</h3>
      ${bySiteHTML}
      <h3>${esc(L('By team'))}</h3>
      ${teamHTML}

      <h3>${esc(L('Every site'))}</h3>
      <div class="t-wrap"><table class="t rep"><thead><tr><th>${esc(L('Site'))}</th><th>${esc(L('Morning'))}</th><th>${esc(L('Evening'))}</th><th class="num">${esc(L('Hours'))}</th><th class="num">${esc(L('Uploaded'))}</th><th class="num">${esc(L('Phones'))}</th><th class="num">${esc(L('Present'))}</th><th class="num">${esc(L('Per phone'))}</th><th class="num">${esc(L('Opt-in'))}</th><th class="num flags">${esc(L('Flags'))}</th></tr></thead>
      <tbody>${rowsHTML}</tbody></table></div>

      <h3>${esc(L('Incidents'))}</h3>
      ${filed.length ? `<div class="t-wrap"><table class="t rep"><thead><tr><th class="num">${esc(L('No'))}</th><th>${esc(L('Site'))}</th><th>${esc(L('Kind'))}</th><th>${esc(L('What happened'))}</th><th>${esc(L('Filed by'))}</th><th>${esc(L('Status'))}</th></tr></thead>
      <tbody>${filed.map(i => `<tr><td class="num">${n(i.no)}</td><td><b>${esc(i.site || '')}</b>${i.at ? `<span class="tiny mute" style="display:block">${esc(clock(L, i.at))}</span>` : ''}</td><td>${esc(KIND[i.kind] || i.kind)}</td><td class="txt">${esc(i.what)}</td><td>${esc(i.reporter)}</td><td><span class="pill st-${i.status === 'open' ? 'open' : 'closed'}">${esc(i.status === 'open' ? L('open') : L('closed'))}</span></td></tr>`).join('')}</tbody></table></div>` : `<p class="mute small">${esc(L('No incident form filed for this day.'))}</p>`}
      ${noForm.length ? `<p class="callout late">${esc(L('On the evening check-out but no incident form yet: {list}', { list: noForm.map(s => s.report.problems ? `${s.name}: ${s.report.problems}` : s.name).join('; ') }))}</p>` : ''}
      ${note('problems', L('Incident lines on the evening check-outs'), r => r.incident || r.problems)}
      ${note('gear_needed', L('What the sites need'))}
      ${note('other', L('Anything else'))}
    </div>
    <details class="rep-admin no-print" id="admin"><summary>${esc(L('Codes, deadlines, targets, posts, and the activity log'))}</summary><div id="admin-body"><p class="mute">${esc(L('Loading'))}</p></div></details>`;

  drawCharts();
  lastW = app.content.clientWidth;
  document.getElementById('prev').addEventListener('click', () => { day = shift(day, -1); load(); });
  document.getElementById('next').addEventListener('click', () => { day = shift(day, 1); load(); });
  document.getElementById('reload').addEventListener('click', load);
  document.getElementById('day').addEventListener('change', e => { if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) { day = e.target.value; load(); } });
  app.content.addEventListener('click', e => { const a = e.target.closest('a[data-day]'); if (!a) return; e.preventDefault(); day = a.dataset.day; load(); });
  document.getElementById('copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(asText()); toast(L('Copied. Paste it into the group.')); } catch { toast(L('Could not copy on this device.')); }
  });
  // the print frame is a static copy, so the charts are drawn at paper width first, then put back
  document.getElementById('print').addEventListener('click', () => {
    drawCharts(PRINT_W);
    const html = document.getElementById('rep').outerHTML;
    drawCharts();
    printPage({ html, title: L('Company report') });
  });
  const det = document.getElementById('admin');
  det.addEventListener('toggle', () => { if (det.open) renderAdmin(); }, { once: true });
  const setTarget = document.getElementById('set-target');
  if (setTarget) setTarget.addEventListener('click', e => { e.preventDefault(); det.open = true; det.scrollIntoView({ behavior: 'smooth' }); });
}

/* the same report as plain text, for the management group: the numbers are the text, no chart is described */
function asText() {
  const d = data, t = d.totals || {}, m = d.morning || {}, sites = d.sites || [], filed = d.incidents || [], x = model;
  const lines = [];
  lines.push(L('Company report, {day}', { day: dayLabel(day) }));
  lines.push(x.headline.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"'));
  lines.push(L('Phones active {p} ({m} this morning). Hours {h}{target}. Per phone {x}. Opt-in {o}, {present} present, {filming} filming. Sites in {a} of {b}.', { p: n(x.phones), m: n(m.phones_deployed), h: n(x.hours), target: x.target ? ' ' + L('of {t} target ({pct}%)', { t: n(x.target), pct: Math.round(100 * x.hours / x.target) }) : '', x: x.perPhone == null ? '0' : one(x.perPhone), o: x.optIn == null ? '0%' : rate(x.optIn), present: n(x.present), filming: n(x.phones), a: n(x.reported), b: n(x.expected) }));
  if (x.avg7.n) lines.push(L('Last 7 days: {h} hours a day, {x} per phone, {o} opt-in.', { h: whole(x.avg7.hours), x: x.avg7.perPhone == null ? '0' : one(x.avg7.perPhone), o: x.avg7.optIn == null ? '0%' : rate(x.avg7.optIn) }));
  const mo = x.month || {};
  if (Number(mo.target)) lines.push(L('This month: {mh} of {mt}, day {g} of {n}, need {per_day} a day{pace}.', { mh: n(mo.hours), mt: n(mo.target), g: n(mo.days_gone), n: n(mo.days_in), per_day: n(mo.per_day_needed), pace: Number(mo.days_gone) >= 3 ? ', ' + L('on pace for {n}', { n: n(mo.projected) }) : '' }));
  else lines.push(L('This month: {mh} hours.', { mh: n(mo.hours) }));
  lines.push(x.morningLine + ' ' + x.eveningLine);
  lines.push('', L('Needs attention:'));
  if (!x.attn.length) lines.push(L('Nothing needs attention.'));
  for (const a of x.attn) lines.push(`${a.s.name}: ${[...a.pills.map(p => p.text), ...a.lines.map(l => l.replace(/<[^>]+>/g, ''))].join(', ')}`);
  lines.push('');
  for (const line of x.teamLines) lines.push(line);
  lines.push('');
  for (const s of x.order) {
    const r = s.report, c = s.checkin;
    if (!r) { lines.push(`${s.name}: ${L('not in')}`); continue; }
    lines.push(`${L('{site}, {reporter}, check-in {a}, report {b}', { site: s.name, reporter: r.reporter, a: c ? clock(L, c.started_at || c.first_at) : L('not in'), b: clock(L, r.first_at) })}${r.late ? ' (' + L('late') + ')' : ''}: ${L('{h} hours, {u} uploaded, {p} phones', { h: n(r.hours), u: n(r.hours_uploaded), p: n(r.phones_deployed) })}${r.phones_out ? ', ' + L('{n} down', { n: n(r.phones_out) }) : ''}${r.flags ? ', ' + plural(r.flags, '1 flag', '{n} flags') : ''}${r.incident ? ', ' + L('incident') : ''}`);
  }
  if (filed.length) { lines.push('', L('Incidents') + ':'); for (const i of filed) lines.push(`${n(i.no)}. ${i.site || ''}, ${KIND[i.kind] || i.kind}, ${i.status === 'open' ? L('open') : L('closed')}: ${String(i.what).trim()}`); }
  const block = (key, title, only) => {
    const rows = sites.filter(s => s.report && String(s.report[key] || '').trim() && (!only || only(s.report)));
    if (!rows.length) return;
    lines.push('', title + ':');
    for (const s of rows) lines.push(`${s.name}: ${String(s.report[key]).trim()}`);
  };
  block('problems', L('Incident lines on the evening check-outs'), r => r.incident || r.problems);
  block('gear_needed', L('What the sites need'));
  block('other', L('Anything else'));
  return lines.join('\n');
}

/* management: the codes, the deadlines, the targets, the posts, and the activity log. The site list and the team have their own pages. */
async function renderAdmin() {
  const box = document.getElementById('admin-body');
  let settings, log = [];
  try { [settings, log] = await Promise.all([admin('settings'), admin('log', { limit: 40 })]); }
  catch (err) { box.innerHTML = `<p class="callout late">${esc(friendly(L, err.message, ERR))}</p>`; return; }
  let targets = {}, bases = {};
  try { targets = JSON.parse(settings.targets || '{}'); } catch {}
  try { bases = JSON.parse(settings.month_base || '{}'); } catch {}
  const months = Object.keys(targets).sort();
  box.innerHTML = `
    <p class="mute small">${esc(L('The sites live on the site database page. The people, and the name lists on the forms, live on the team page.'))} <a href="${href('sites')}">${esc(L('Site database'))}</a>, <a href="${href('team')}">${esc(L('Team'))}</a></p>

    <h3>${esc(L('Monthly targets'))}</h3>
    <div class="t-wrap"><table class="t"><thead><tr><th>${esc(L('Month'))}</th><th class="num">${esc(L('Hours'))}</th></tr></thead><tbody>${months.map(m => `<tr><td>${esc(m)}</td><td class="num">${n(targets[m])}</td></tr>`).join('') || `<tr><td colspan="2" class="mute">${esc(L('No target set yet.'))}</td></tr>`}</tbody></table></div>
    <form id="target-form" class="fgrid" autocomplete="off">
      <div class="ff"><label class="fl" for="t-month">${esc(L('Month'))}</label><input type="month" id="t-month" value="${esc(today().slice(0, 7))}" required></div>
      <div class="ff"><label class="fl" for="t-hours">${esc(L('Hours for the month'))}</label><input type="number" id="t-hours" min="0" step="1" required></div>
      <div class="ff"><span class="fl">&nbsp;</span><button type="submit" class="btn primary">${esc(L('Set target'))}</button></div>
    </form>

    <h3 style="margin-top:28px">${esc(L('Hours already counted'))}</h3>
    <p class="mute small">${esc(L('Hours a month had before the forms started, or from anywhere else. The month adds them to what the forms send.'))}</p>
    <div class="t-wrap"><table class="t"><thead><tr><th>${esc(L('Month'))}</th><th class="num">${esc(L('Hours'))}</th></tr></thead><tbody>${Object.keys(bases).sort().map(m => `<tr><td>${esc(m)}</td><td class="num">${n(bases[m])}</td></tr>`).join('') || `<tr><td colspan="2" class="mute">${esc(L('Nothing yet.'))}</td></tr>`}</tbody></table></div>
    <form id="base-form" class="fgrid" autocomplete="off">
      <div class="ff"><label class="fl" for="b-month">${esc(L('Month'))}</label><input type="month" id="b-month" value="${esc(today().slice(0, 7))}" required></div>
      <div class="ff"><label class="fl" for="b-hours">${esc(L('Hours already counted'))}</label><input type="number" id="b-hours" min="0" step="1" required></div>
      <div class="ff"><span class="fl">&nbsp;</span><button type="submit" class="btn primary">${esc(L('Save'))}</button></div>
    </form>

    <h3 style="margin-top:28px">${esc(L('Codes and deadlines'))}</h3>
    <form id="settings-form" class="fgrid" autocomplete="off">
      <div class="ff"><label class="fl" for="s-team">${esc(L('Team code'))}<small>${esc(L('Everyone who sends a check-in, an evening check-out, or an incident types this once.'))}</small></label><input type="text" id="s-team" value="${esc(settings.team_code || '')}" minlength="3"></div>
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

    <h3 style="margin-top:28px">${esc(L('The evening email'))}</h3>
    <p class="mute small">${esc(L('With a Resend key and an address here, the whole report goes out by email at 8:05 PM Cairo time, every day.'))}</p>
    <form id="email-form" class="fgrid" autocomplete="off">
      <div class="ff"><label class="fl" for="s-email">${esc(L('Send to'))}<small>${esc(L('One address, or several separated by commas.'))}</small></label><input type="text" id="s-email" value="${esc(settings.report_email || '')}" autocomplete="off"></div>
      <div class="ff"><label class="fl" for="s-resend">${esc(L('Resend key'))}<small>${esc(settings.resend_key === 'set' ? L('One is set. Paste a new one to replace it, or the word none to remove it.') : L('None yet. resend.com, API keys, create one, then paste it here.'))}</small></label><input type="text" id="s-resend" autocomplete="off"></div>
      <div class="ff"><label class="fl" for="s-from">${esc(L('Sent from'))}<small>${esc(L('Optional. A sender on a domain verified in Resend. Empty uses the Resend test sender, which only reaches the account owner.'))}</small></label><input type="text" id="s-from" value="${esc(settings.email_from || '')}" autocomplete="off" placeholder="Company map <reports@example.com>"></div>
      <div class="ff"><span class="fl">&nbsp;</span><button type="submit" class="btn primary">${esc(L('Save'))}</button> <button type="button" class="btn" id="s-mail-test" ${settings.resend_key === 'set' && settings.report_email ? '' : 'disabled'}>${esc(L('Send a test email'))}</button></div>
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
  box.querySelector('#base-form').addEventListener('submit', async e => {
    e.preventDefault();
    try { await admin('month_base', { month: document.getElementById('b-month').value, hours: document.getElementById('b-hours').value }); after(); }
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
  box.querySelector('#email-form').addEventListener('submit', async e => {
    e.preventDefault();
    const to = document.getElementById('s-email').value.trim(), key = document.getElementById('s-resend').value.trim(), from = document.getElementById('s-from').value.trim();
    try {
      if (to !== (settings.report_email || '')) await admin('setting', { key: 'report_email', value: to });
      if (key) await admin('setting', { key: 'resend_key', value: key === 'none' ? '' : key });
      if (from !== (settings.email_from || '')) await admin('setting', { key: 'email_from', value: from });
      after();
    } catch (err) { toast(friendly(L, err.message, ERR)); }
  });
  box.querySelector('#s-mail-test').addEventListener('click', async e => {
    e.target.disabled = true;
    try { const r = await admin('test_post', { kind: 'email' }); toast(r.sent ? L('Sent. Check the inbox in a minute.') : L('Nothing sent. Set the key and the address first.')); }
    catch (err) { toast(friendly(L, err.message, ERR)); }
    e.target.disabled = false;
  });
}

load();
