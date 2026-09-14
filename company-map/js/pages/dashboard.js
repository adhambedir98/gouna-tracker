// The dashboard: the day in one page. The map of the sites, the businesses running today with their numbers, and the charts
// under them. It reads the morning check-ins and the evening check-outs through dr_report, and the phones through dr_map.
// It opens for management. The settings a founder keeps are at the foot of it.
import { mount, esc, labels, store, toast, fmt, initialHash, setHash, href, printPage, me } from '../app.js';
import { rpc, admin as adminCall, gate, loading, failed, friendly, clock, dayLabel, shortDay, nowTime, today, shift, kindLabel } from '../online.js';
import { bars, area, ring, sparkline, dumbbell, hbars, strip } from '../charts.js';
import { mapHTML } from '../sitemap.js';
import { place } from '../egypt.js';

const L = await labels('dashboard');
const app = await mount({ page: 'dashboard', title: L('Dashboard'), lede: L('Every site, added up into one page.') });

const n = v => fmt(v ?? 0);
const TEAM = { direct: L('Direct'), partner: L('Partner') };
const KIND = kindLabel(L);
let day = /^\d{4}-\d{2}-\d{2}$/.test(initialHash()) ? initialHash() : today();
let days = [7, 14, 30].includes(Number(store.get('vm.dash.days', 7))) ? Number(store.get('vm.dash.days', 7)) : 7;
let data = null;    // the day, from dr_report
let map = null;     // the phones and where they were last seen, from dr_map
let picked = null;  // the business whose phones are open, on the map and in the list
let updated = '';
let timer = null;
let lastMapW = 0;
const admin = (action, p = {}) => adminCall('', action, p);
const ERR = { 'bad month': L('Pick a month.'), 'not a Slack webhook': L('That is not a Slack webhook address.'), 'not a Resend key': L('That is not a Resend key.'), 'not an email address': L('That is not an email address.') };

async function load(quiet = false) {
  if (!quiet) loading(app, L);
  try {
    const [rep, phones] = await Promise.all([
      rpc('dr_report', { p_day: day, p_code: '' }),
      rpc('dr_map', { p_code: '', p_days: days, p_day: day })
    ]);
    data = rep; map = phones;
    if (picked && !(map.sites || []).some(s => s.id === picked)) picked = null;
    updated = clock(L, nowTime());
    setHash(day === today() ? '' : day);
    render();
    if (!timer) timer = setInterval(() => { if (!document.hidden && day === today()) load(true); }, 5 * 60 * 1000);
  } catch (err) {
    if (err.message === 'wrong code') { clearInterval(timer); timer = null; return gate(app, L); }
    if (quiet) return toast(friendly(L, err.message));
    failed(app, L, friendly(L, err.message), load);
  }
}

/* the phones, from the map call: what each business is carrying and what the check-in said it was carrying */
const DOT = { green: 'g', yellow: 'y', red: 'r', none: 'n' };
const phonesOf = id => ((map && map.phones) || []).filter(p => p.site_id === id);
const mapSite = id => ((map && map.sites) || []).find(s => s.id === id) || {};
const gap = s => s && s.said != null && Number(s.said) !== Number(s.phones);
const odd = p => p && p.local != null && p.total != null && Number(p.local) > Number(p.total);
const sane = rows => rows.filter(x => !odd(x));
const anyOf = (rows, k) => rows.some(r => r[k] != null);
const hrs = v => (num(v) >= 100 ? n(Math.round(num(v))) : one(num(v)));

/* the numbers everything else is built on: the day, the seven days before it, and the month so far */
const OPT_IN_FLOOR = 0.8;
const PRINT_W = { spark: 102, ring: 170, t: 324, siteBars: 324, siteDots: 324, sitePer: 324, siteOpt: 324, week: 48 };
const pct = (a, b) => (Number(b) ? Math.round(Number(a) / Number(b) * 100) + '%' : '');
const per = (h, p) => (Number(p) ? (Number(h) / Number(p)).toFixed(1) : '');
const one = v => (v == null ? '' : (Math.round(Number(v) * 10) / 10).toFixed(1));
const whole = v => (v == null ? '' : n(Math.round(Number(v))));
const rate = v => (v == null ? '' : Math.round(Number(v) * 100) + '%');
const num = v => Number(v) || 0;
// the footage a site recorded today that has not reached the hub yet: what the phones are still holding
const held = r => Math.max(num(r && r.hours) - num(r && r.hours_uploaded), 0);
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
window.addEventListener('resize', () => { requestAnimationFrame(() => {
  const w = app.content.clientWidth;
  if (Math.abs(w - lastW) > 8) { lastW = w; drawCharts(); }
  const host = document.getElementById('map');
  if (host && Math.abs(host.clientWidth - lastMapW) > 8) drawMap();
}); });

/* the map, and the business the reader has open. One business at a time: its dot fans out into its phones and its card opens. */
let bodyOf = () => '';
function drawMap() {
  const host = document.getElementById('map');
  if (!host) return;
  const W = Math.max(280, host.clientWidth || 720);
  lastMapW = W;
  host.innerHTML = mapHTML({ L, W, sites: (map && map.sites) || [], phones: (map && map.phones) || [], picked });
}
function pick(id, scroll = false) {
  picked = picked === id ? null : id;
  for (const card of app.content.querySelectorAll('.site-card[data-id]')) {
    const on = card.dataset.id === picked;
    card.classList.toggle('on', on);
    card.querySelector('.sc-head')?.setAttribute('aria-expanded', String(on));
    const body = card.querySelector('.sc-body');
    if (!body) continue;
    body.hidden = !on;
    body.innerHTML = on ? bodyOf(card.dataset.id) : '';
  }
  drawMap();
  if (scroll && picked) app.content.querySelector(`.site-card[data-id="${CSS.escape(picked)}"]`)?.scrollIntoView({ block: 'nearest' });
}

/* the page */
function render() {
  const d = data, t = d.totals || {}, m = d.morning || {}, sites = d.sites || [], filed = d.incidents || [], days = d.days || [], month = d.month || {};
  const founder = !!(me && me.role === 'founder');   // the settings panel, and every link into it, is a founder's
  const expected = num(d.expected), target = num(d.target_day), isToday = day === today();
  const hours = num(t.hours), phones = num(t.phones_deployed), present = num(t.wearers_present), uploaded = num(t.hours_uploaded), reported = num(t.reported);
  const perPhone = phones ? hours / phones : null, optIn = present ? phones / present : null;
  const missing = sites.filter(s => s.active && !s.report);
  const last = days.length - 1;
  const day7 = days.slice(Math.max(0, last - 7), last).filter(x => x.has);
  const monthDays = days.slice(0, last).filter(x => x.has && String(x.day).slice(0, 7) === day.slice(0, 7));
  const avg7 = pool(day7), avgM = pool(monthDays);
  const who = s => s.book || s.lead || '';
  const teamOf = s => (s.team === 'partner' ? L('Partner') : L('Direct'));
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

  /* the four numbers a day is judged by */
  const cmp = (a, b, f) => (a != null && b != null ? L('7 day average {a}, month {b}', { a: f(a), b: f(b) }) : a != null ? L('7 day average {a}', { a: f(a) }) : b != null ? L('month average {b}', { b: f(b) }) : L('no earlier days yet'));
  const has = x => x.has;
  const tile = (label, value, ctx, cmpLine, chart, cls = '') => `<div class="kpi${cls}"><div class="k-txt"><div class="lbl">${esc(label)}</div><div class="big num">${value}</div>${ctx ? `<div class="ctx">${esc(ctx)}</div>` : ''}${cmpLine ? `<div class="cmp">${esc(cmpLine)}</div>` : ''}</div>${chart}</div>`;
  const tiles = [
    tile(L('Hours today'), n(hours), '', cmp(avg7.n ? avg7.hours : null, avgM.n ? avgM.hours : null, whole), `<div class="chart" data-chart="spark:hours"></div>`),
    tile(L('Phones active'), n(phones), !reported ? L('no site is in yet') : num(t.phones_out) ? L('{m} recording this morning, {o} down', { m: n(m.phones_deployed), o: n(t.phones_out) }) : L('{m} recording this morning', { m: n(m.phones_deployed) }), '', `<div class="chart" data-chart="spark:phones"></div>`),
    tile(L('Hours per phone'), perPhone == null ? `<span class="mute">0</span>` : one(perPhone), !phones ? L('no phones reported') : target ? L('{x} needed for the target', { x: one(target / phones) }) : L('{hours} hours on {phones} phones', { hours: n(hours), phones: n(phones) }), '', `<div class="chart" data-chart="spark:perphone"></div>`),
    tile(L('Opt-in rate'), optIn == null ? '0%' : rate(optIn), !present ? L('no employee count yet') : L('{phones} phones for {present} present', { phones: n(phones), present: n(present) }) + (optIn > 1 ? L(', more phones than people') : ''), '', `<div class="chart" data-chart="spark:optin"></div>`)
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
  const monthBoxes = !monthTarget ? `<p class="mute small">${esc(L('No target set for this month.'))}${founder ? ` <a href="#admin" id="set-target">${esc(L('Set one'))}</a>` : ''}</p>`
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
  const teamLines = ['direct', 'partner'].filter(k => d.teams && d.teams[k]).map(k => { const x = d.teams[k]; return `${TEAM[k]}: ${L('{a} of {b} in', { a: n(x.reported), b: n(x.expected) })}, ${num(x.hours) ? L('{hours} hours, {phones} phones, {x} per phone, {o} opt-in', { hours: n(x.hours), phones: n(x.phones_deployed), x: per(x.hours, x.phones_deployed) || '0', o: pct(x.phones_deployed, x.wearers_present) || '0%' }) : L('{hours} hours', { hours: n(x.hours) })}.`; });

  /* the businesses: one card each, the day on the head, the phones inside */
  for (const s2 of order) charts['week:' + s2.id] = () => strip({ values: s2.week || [], label: L('Last 7 days: {list}', { list: (s2.week || []).map(v => n(v)).join(', ') }) });
  const chip = (k, v) => (Number(v) ? `<span class="cc ${DOT[k]}"><i class="sw ${DOT[k]}"></i>${n(v)}</span>` : '');
  const phoneTable = ph => {
    if (!ph.length) return `<p class="mute small">${esc(L('No phone seen at this site in the last 14 days.'))}</p>`;
    const sum2 = (rows, k) => rows.reduce((a, x) => a + num(x[k]), 0);
    const inHours = mm => (num(mm) ? `<span class="in-hours">${esc(L('{h} hours', { h: hrs(num(mm) / 60) }))}</span>` : '');
    const mins2 = (rows, k) => (anyOf(rows, k) ? n(Math.round(sum2(rows, k))) + inHours(sum2(rows, k)) : '');
    const leftOut = rows => { const k = rows.length - sane(rows).length; return k ? `<span class="in-hours">${esc(k === 1 ? L('one left out') : L('{n} left out', { n: n(k) }))}</span>` : ''; };
    return `<div class="t-wrap"><table class="t dash phones"><thead><tr><th>${esc(L('Phone'))}</th><th>${esc(L('Hours a day'))}</th><th class="num">${esc(L('Today'))}</th><th class="num">${esc(L('Days read'))}</th><th>${esc(L('Last seen'))}</th><th class="num">${esc(L('Minutes all time'))}</th><th class="num">${esc(L('Minutes saved locally'))}</th></tr></thead>
      <tbody>${ph.map(x => `<tr><td><b>${esc(x.tag)}</b></td><td><i class="sw ${DOT[x.status] || 'n'}"></i>${x.hours_day == null ? `<span class="mute">${esc(L('No evening reading yet'))}</span>` : esc(one(x.hours_day))}</td><td class="num">${esc(one(x.today))}</td><td class="num">${n(x.days)}</td><td>${x.last_day ? esc(shortDay(x.last_day)) + (x.last_kind === 'morning' ? ` <span class="pill">${esc(L('morning'))}</span>` : '') : ''}</td><td class="num">${x.total == null ? '' : n(x.total)}</td><td class="num${odd(x) ? ' warn' : ''}">${x.local == null ? '' : n(x.local)}${odd(x) ? `<span class="flag">${esc(L('more than all time'))}</span>` : ''}</td></tr>`).join('')}</tbody>
      <tfoot><tr><th scope="row">${esc(L('Total'))}</th><td class="hd">${anyOf(ph, 'hours_day') ? esc(hrs(sum2(ph, 'hours_day'))) : ''}</td><td class="num">${anyOf(ph, 'today') ? esc(hrs(sum2(ph, 'today'))) : ''}</td><td></td><td></td>
        <td class="num">${mins2(ph, 'total')}</td><td class="num">${mins2(sane(ph), 'local')}${leftOut(ph)}</td></tr></tfoot></table></div>`;
  };
  const bodyHTML = s2 => {
    const r = s2.report, c = s2.checkin, ms = mapSite(s2.id);
    const lines = [c ? L('Morning: started {t}, {p} phones, {w} present.', { t: clock(L, c.started_at) || clock(L, c.first_at), p: n(c.phones_deployed), w: n(c.wearers_present) }) : L('No morning check-in.'),
      r ? L('Evening: {h} hours, {u} uploaded, {k} still on the phones, {w} present, sent by {who}.', { h: n(r.hours), u: n(r.hours_uploaded), k: n(held(r)), w: n(r.wearers_present), who: r.reporter || '' }) : L('No evening check-out.')];
    return `<p class="tiny mute">${esc(lines.join(' '))}</p>
      ${gap(ms) ? `<p class="tiny warn">${esc(L('The check-in counted {said} phones and the list names {n}. The map can only draw the ones on the list.', { said: n(ms.said), n: n(ms.phones) }))}</p>` : ''}
      ${phoneTable(phonesOf(s2.id))}`;
  };
  const cardHTML = s2 => {
    const r = s2.report, c = s2.checkin, ms = mapSite(s2.id), open = s2.id === picked;
    const mark = (x, lateText) => (x ? `<span class="pill${x.late ? ' late' : ' ontime'}">${esc(x.late ? lateText : L('in'))}</span>` : `<span class="pill miss">${esc(L('not in'))}</span>`);
    return `<div class="site-card dash-card${open ? ' on' : ''}" data-id="${esc(s2.id)}">
      <button type="button" class="sc-head" aria-expanded="${open}">
        <span class="sc-name">${esc(s2.name)}<span class="sc-sub">${esc(teamOf(s2))}${ms.city ? ', ' + esc(ms.city) : ''}${!ms.id || place(ms) ? '' : ' , ' + esc(L('not on the map'))}</span></span>
        <span class="sc-when">${mark(c, L('late'))}${mark(r, L('late'))}${r && r.incident ? `<span class="pill late">${esc(L('incident'))}</span>` : ''}${c && c.ok === false ? `<span class="pill late">${esc(L('morning problem'))}</span>` : ''}</span>
        <span class="sc-hours"><b>${r ? n(r.hours) : '0'}</b> <span class="tiny mute">${esc(L('hours'))}</span><span class="chart week" data-chart="week:${esc(s2.id)}"></span></span>
        <span class="sc-counts">${chip('green', ms.green)}${chip('yellow', ms.yellow)}${chip('red', ms.red)}${chip('none', ms.none)}${gap(ms) ? `<span class="pill late">${esc(L('{said} said, {n} listed', { said: n(ms.said), n: n(ms.phones) }))}</span>` : ''}</span>
        <span class="sc-per">${r && num(r.phones_deployed) ? `<b>${esc(per(r.hours, r.phones_deployed))}</b> <span class="tiny mute">${esc(L('a phone'))}</span>` : ''}</span>
        <span class="sc-mark" aria-hidden="true"></span>
      </button>
      <div class="sc-body"${open ? '' : ' hidden'}>${open ? bodyHTML(s2) : ''}</div>
    </div>`;
  };
  const allPhones = (map && map.phones) || [];
  const totalCard = () => `<div class="site-card dash-card total"><div class="sc-head">
    <span class="sc-name">${esc(L('All businesses'))}<span class="sc-sub">${esc(plural(order.length, '1 site', '{n} sites'))}</span></span>
    <span class="sc-when"><span class="pill${num(reported) >= num(expected) ? ' ontime' : ' late'}">${esc(L('{a} of {b} in', { a: n(reported), b: n(expected) }))}</span></span>
    <span class="sc-hours"><b>${n(hours)}</b> <span class="tiny mute">${esc(L('hours'))}</span></span>
    <span class="sc-counts">${chip('green', allPhones.filter(x => x.status === 'green').length)}${chip('yellow', allPhones.filter(x => x.status === 'yellow').length)}${chip('red', allPhones.filter(x => x.status === 'red').length)}${chip('none', allPhones.filter(x => x.status === 'none').length)}<span class="cc">${esc(plural(allPhones.length, '1 phone', '{n} phones'))}</span></span>
    <span class="sc-per">${phones ? `<b>${esc(per(hours, phones))}</b> <span class="tiny mute">${esc(L('a phone'))}</span>` : ''}</span>
    <span class="sc-mark"></span>
  </div></div>`;

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
      <div class="chips" id="win">${[7, 14, 30].map(v => `<button type="button" class="chip${v === days ? ' on' : ''}" data-days="${v}">${esc(L(`${v} days`))}</button>`).join('')}</div>
      <span class="tiny mute">${esc(L('Updated {t}', { t: updated }))}</span>
      <button type="button" class="btn" id="copy">${esc(L('Copy as text'))}</button>
      <button type="button" class="btn" id="print">${esc(L('Print or save a copy'))}</button>
    </div>
    <div id="rep">
      <h2>${esc(dayLabel(day))}</h2>
      <p class="headline">${headline}</p>

      ${num(d.open_incidents) ? `<p class="small"><a href="${href('report/incidents')}">${esc(plural(d.open_incidents, '1 open incident in all', '{n} open incidents in all'))}</a></p>` : ''}

      <div class="hero">${tiles.join('')}</div>

      <h3>${esc(L('The month'))}</h3>
      <div class="month-grid"><div class="ring-host" data-chart="ring"></div><div>${monthBoxes}</div></div>

      <div class="map-wrap"><div class="map" id="map"></div>
        <div class="map-legend">${[['green', L('5 hours a day or more')], ['yellow', L('3 to 5 hours a day')], ['red', L('Under 3 hours a day')], ['none', L('No evening reading yet')]].map(([k, t]) => `<span><i class="sw ${DOT[k]}"></i>${esc(t)}</span>`).join('')}</div>
      </div>
      <p class="tiny dim">${esc(L('One dot for every business, the number on it is its phones. Click it to open that business, on the map and in the list.'))} <a href="${href('sites')}">${esc(L('Site database'))}</a></p>

      <h3>${esc(L('The businesses'))}</h3>
      <div class="site-cards" id="sites">${order.map(cardHTML).join('') || `<p class="mute">${esc(L('No site yet. Add one on the site database.'))}</p>`}${order.length ? totalCard() : ''}</div>

      ${filed.length || noForm.length ? `<h3>${esc(L('Incidents'))}</h3>` : ''}
      ${filed.length ? `<div class="t-wrap"><table class="t rep"><thead><tr><th class="num">${esc(L('No'))}</th><th>${esc(L('Site'))}</th><th>${esc(L('Kind'))}</th><th>${esc(L('What happened'))}</th><th>${esc(L('Filed by'))}</th><th>${esc(L('Status'))}</th></tr></thead>
      <tbody>${filed.map(i => `<tr><td class="num">${n(i.no)}</td><td><b>${esc(i.site || '')}</b>${i.at ? `<span class="tiny mute" style="display:block">${esc(clock(L, i.at))}</span>` : ''}</td><td>${esc(KIND[i.kind] || i.kind)}</td><td class="txt">${esc(i.what)}</td><td>${esc(i.reporter)}</td><td><span class="pill st-${i.status === 'open' ? 'open' : 'closed'}">${esc(i.status === 'open' ? L('open') : L('closed'))}</span></td></tr>`).join('')}</tbody></table></div>` : `<p class="mute small">${esc(L('No incident form filed for this day.'))}</p>`}
      ${noForm.length ? `<p class="callout late">${esc(L('On the evening check-out but no incident form yet: {list}', { list: noForm.map(s => s.report.problems ? `${s.name}: ${s.report.problems}` : s.name).join('; ') }))}</p>` : ''}
      ${note('problems', L('Incident lines on the evening check-outs'), r => r.incident || r.problems)}
      ${note('gear_needed', L('What the sites need'))}
      ${note('other', L('Anything else'))}

      <details class="more"><summary>${esc(L('The morning and the evening, number by number'))}</summary>
        <h4>${esc(L('The morning'))}</h4>${morningBoxes}
        <h4>${esc(L('The evening'))}</h4>${eveningBoxes}</details>
      <details class="more"><summary>${esc(L('The last 30 days'))}</summary>${trendsHTML}</details>
      <details class="more"><summary>${esc(L('Site against site'))}</summary>${bySiteHTML}</details>

      <p class="tiny mute">${esc(L('Built at {time} Cairo time. A site with no report counts as zero.', { time: clock(L, String(d.built_at).slice(11)) }))}</p>
    </div>
    ${founder ? `<details class="rep-admin no-print" id="admin"><summary>${esc(L('Codes, deadlines, targets, posts, and the activity log'))}</summary><div id="admin-body"><p class="mute">${esc(L('Loading'))}</p></div></details>` : ''}`;

  bodyOf = id => { const s2 = order.find(x => x.id === id); return s2 ? bodyHTML(s2) : ''; };
  drawCharts();
  drawMap();
  lastW = app.content.clientWidth;
  document.getElementById('win').addEventListener('click', e => { const b = e.target.closest('[data-days]'); if (!b) return; days = Number(b.dataset.days); store.set('vm.dash.days', days); load(true); });
  document.getElementById('sites')?.addEventListener('click', e => { const c = e.target.closest('.site-card[data-id]'); if (c) pick(c.dataset.id); });
  document.getElementById('map')?.addEventListener('click', e => { const g = e.target.closest('.site'); if (g && g.dataset.site !== picked) pick(g.dataset.site, true); });
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
    const folds = [...app.content.querySelectorAll('details.more')];
    const was = folds.map(f => f.open);
    folds.forEach(f => { f.open = true; });
    drawCharts(PRINT_W);
    const html = document.getElementById('rep').outerHTML;
    folds.forEach((f, i) => { f.open = was[i]; });
    drawCharts();
    printPage({ html, title: L('Company report') });
  });
  for (const more of app.content.querySelectorAll('details.more')) more.addEventListener('toggle', () => { if (more.open) drawCharts(); });
  const det = document.getElementById('admin');
  if (det) det.addEventListener('toggle', () => { if (det.open) renderAdmin(); }, { once: true });
  const setTarget = document.getElementById('set-target');
  if (setTarget && det) setTarget.addEventListener('click', e => { e.preventDefault(); det.open = true; det.scrollIntoView({ behavior: 'smooth' }); });
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

/* management: the deadlines, the targets, the posts, and the activity log. The site list and the team have their own pages. */
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
      <div class="ff"><label class="fl" for="s-host">${esc(L('Site address'))}<small>${esc(L('What the evening email and the alerts link to.'))}</small></label><input type="url" id="s-host" value="${esc(settings.host || '')}" autocomplete="off"></div>
      <div class="ff"><label class="fl" for="s-morning">${esc(L('Check-in deadline, Cairo time'))}</label><input type="time" id="s-morning" value="${esc(settings.checkin_deadline || '09:00')}"></div>
      <div class="ff"><label class="fl" for="s-deadline">${esc(L('Report deadline, Cairo time'))}</label><input type="time" id="s-deadline" value="${esc(settings.deadline || '18:00')}"></div>
      <div class="ff"><label class="fl" for="s-report">${esc(L('New management code'))}<small>${esc(L('The spare key the scripts use. No page asks for it. Leave empty to keep the current one.'))}</small></label><input type="text" id="s-report" minlength="6" autocomplete="off"></div>
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

    <h3 style="margin-top:28px">${esc(L('What people do on the map'))}</h3>
    <p class="mute small">${esc(L('With a PostHog key every page read, and every print, save, Print Screen, and whole-page copy, goes to PostHog under the person who did it. The words on the pages never do: no session recording, no autocapture. Without a key nothing loads and nothing leaves the browser. The alerts to Slack and to the address above do not need it.'))}
      <a href="${href('accounts')}">${esc(L('Accounts'))}</a></p>
    <form id="ph-form" class="fgrid" autocomplete="off">
      <div class="ff"><label class="fl" for="s-ph">${esc(L('PostHog key'))}<small>${esc(L('Starts with phc_. PostHog, project settings, project API key. The word none removes it.'))}</small></label><input type="text" id="s-ph" value="${esc(settings.posthog_key || '')}" autocomplete="off" placeholder="phc_..."></div>
      <div class="ff"><label class="fl" for="s-ph-host">${esc(L('PostHog address'))}<small>${esc(L('https://eu.i.posthog.com for the European cloud, https://us.i.posthog.com for the American one.'))}</small></label><input type="text" id="s-ph-host" value="${esc(settings.posthog_host || '')}" autocomplete="off"></div>
      <div class="ff"><span class="fl">&nbsp;</span><button type="submit" class="btn primary">${esc(L('Save'))}</button></div>
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
    const dl = document.getElementById('s-deadline').value, mo = document.getElementById('s-morning').value, rep = document.getElementById('s-report').value.trim();
    try {
      const host = document.getElementById('s-host').value.trim();
      if (host && host !== settings.host) await admin('setting', { key: 'host', value: host });
      if (mo && mo !== settings.checkin_deadline) await admin('setting', { key: 'checkin_deadline', value: mo });
      if (dl && dl !== settings.deadline) await admin('setting', { key: 'deadline', value: dl });
      if (rep) {
        if (!confirm(L('Change the management code? Anything that still uses it will need the new one.'))) return;
        await admin('setting', { key: 'report_code', value: rep });
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
  box.querySelector('#ph-form').addEventListener('submit', async e => {
    e.preventDefault();
    const key = document.getElementById('s-ph').value.trim(), host = document.getElementById('s-ph-host').value.trim();
    try {
      if (key !== (settings.posthog_key || '')) await admin('setting', { key: 'posthog_key', value: key === 'none' ? '' : key });
      if (host !== (settings.posthog_host || '')) await admin('setting', { key: 'posthog_host', value: host });
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
