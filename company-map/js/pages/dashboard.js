// The dashboard: the day in one page. The map of the sites, the businesses running today with their numbers, and the charts
// under them. It reads the morning check-ins and the evening check-outs through dr_report, and the phones through dr_map.
// It opens for management. The settings a founder keeps are at the foot of it.
import { mount, esc, labels, store, toast, fmt, initialHash, setHash, href, printPage, me } from '../app.js';
import { rpc, admin as adminCall, gate, loading, failed, friendly, clock, dayLabel, shortDay, nowTime, today, shift, kindLabel } from '../online.js';
import { bars, area, ring, sparkline, dumbbell, hbars, strip } from '../charts.js';
import { mapHTML } from '../sitemap.js';
import { place } from '../egypt.js';

const L = await labels('dashboard');
const app = await mount({ page: 'dashboard', title: L('Dashboard'), lede: '' });

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
// the hours a site has recorded but not yet sent to a hub: what its phones were holding at the check-out
const held = r => num(r && r.hours_held);
const plural = (v, one, many) => (num(v) === 1 ? L(one) : L(many, { n: n(v) }));
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
  for (const row of app.content.querySelectorAll('tr.site-row')) {
    const on = row.dataset.id === picked;
    row.classList.toggle('on', on);
    row.setAttribute('aria-expanded', String(on));
    const det = app.content.querySelector(`tr.det[data-for="${CSS.escape(row.dataset.id)}"]`);
    if (!det) continue;
    det.hidden = !on;
    det.firstElementChild.innerHTML = on ? bodyOf(row.dataset.id) : '';
  }
  drawMap();
  if (scroll && picked) app.content.querySelector(`tr.site-row[data-id="${CSS.escape(picked)}"]`)?.scrollIntoView({ block: 'nearest' });
}

/* the page */
function render() {
  const d = data, t = d.totals || {}, m = d.morning || {}, sites = d.sites || [], filed = d.incidents || [], days = d.days || [], month = d.month || {};
  const founder = !!(me && me.role === 'founder');   // the settings panel, and every link into it, is a founder's
  const expected = num(d.expected), target = num(d.target_day), isToday = day === today();
  const hours = num(t.hours), phones = num(t.phones_deployed), present = num(t.wearers_present), reported = num(t.reported);
  const stillHeld = num(t.hours_held);   // the day's hours that have not reached a hub yet
  const perPhone = phones ? hours / phones : null, optIn = present ? phones / present : null;
  const missing = sites.filter(s => s.active && !s.report);
  const last = days.length - 1;
  const day7 = days.slice(Math.max(0, last - 7), last).filter(x => x.has);
  const monthDays = days.slice(0, last).filter(x => x.has && String(x.day).slice(0, 7) === day.slice(0, 7));
  const avg7 = pool(day7), avgM = pool(monthDays);
  const who = s => s.book || s.lead || '';
  const teamOf = s => (s.team === 'partner' ? L('Partner') : L('Direct'));
  // names two businesses at most: past that the headline turns into a list, and the list is the table below it
  const names = list => (list.length > 2 ? list.slice(0, 2).map(s => s.name).join(', ') + ' ' + L('and {n} more', { n: n(list.length - 2) }) : list.map(s => s.name).join(', '));

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
    else second = esc(!num(t.incidents) && !num(t.flags) ? L('Every site is in, no incidents, no flags.') : L('Every site is in.'));
    headline = esc(headline) + ' ' + second;
  }

  /* the four numbers a day is judged by */
  const cmp = (a, b, f) => (a != null && b != null ? L('7 day average {a}, month {b}', { a: f(a), b: f(b) }) : a != null ? L('7 day average {a}', { a: f(a) }) : b != null ? L('month average {b}', { b: f(b) }) : L('no earlier days yet'));
  const has = x => x.has;
  const tile = (label, value, ctx, chart) => `<div class="kpi"><div class="lbl">${esc(label)}</div><div class="big num">${value}</div><div class="ctx">${esc(ctx || '')}</div>${chart}</div>`;
  const tiles = [
    tile(L('Hours recorded today'), n(hours), avg7.n || avgM.n ? cmp(avg7.n ? avg7.hours : null, avgM.n ? avgM.hours : null, whole) : '', `<div class="chart" data-chart="spark:hours"></div>`),
    tile(L('Hours pending upload'), n(stillHeld), num(t.backlog) ? plural(t.backlog, 'on 1 phone', 'on {n} phones') : '', `<div class="chart" data-chart="spark:pending"></div>`),
    tile(L('Phones active'), n(phones), reported && num(t.phones_out) ? L('{m} this morning, {o} down', { m: n(m.phones_deployed), o: n(t.phones_out) }) : reported ? L('{m} this morning', { m: n(m.phones_deployed) }) : '', `<div class="chart" data-chart="spark:phones"></div>`),
    tile(L('Hours per phone'), perPhone == null ? `<span class="mute">0</span>` : one(perPhone), phones && target ? L('{x} needed for the target', { x: one(target / phones) }) : '', `<div class="chart" data-chart="spark:perphone"></div>`),
    tile(L('Opt-in rate'), optIn == null ? '0%' : rate(optIn), present ? L('{phones} phones for {present} present', { phones: n(phones), present: n(present) }) : '', `<div class="chart" data-chart="spark:optin"></div>`)
  ];
  charts = {};
  const series = f => days.map(x => (x.has ? f(x) : null));
  charts['spark:phones'] = w => sparkline({ values: series(x => x.phones_deployed), w, h: 44, label: L('{label}, the last 30 days', { label: L('Phones active') }) });
  charts['spark:hours'] = w => sparkline({ values: series(x => x.hours), w, h: 44, target, label: L('{label}, the last 30 days', { label: L('Hours recorded today') }) });
  charts['spark:pending'] = w => sparkline({ values: series(x => x.hours_held), w, h: 44, label: L('{label}, the last 30 days', { label: L('Hours pending upload') }) });
  charts['spark:perphone'] = w => sparkline({ values: series(x => (num(x.phones_deployed) ? num(x.hours) / num(x.phones_deployed) : null)), w, h: 44, label: L('{label}, the last 30 days', { label: L('Hours per phone') }) });
  charts['spark:optin'] = w => sparkline({ values: series(x => (num(x.wearers_present) ? 100 * num(x.phones_deployed) / num(x.wearers_present) : null)), w, h: 44, target: 100, label: L('{label}, the last 30 days', { label: L('Opt-in rate') }) });

  /* the morning and the evening, as boxes */
  const box = (v, label, cls = '') => `<div${cls ? ` class="${cls}"` : ''}><div class="big num">${v}</div><div class="lbl">${esc(label)}</div></div>`;
  const morningBoxes = `<div class="stat">${box(`<span class="frac">${n(m.checked_in)}<span class="mute"> / ${n(expected)}</span></span>`, L('sites started'))}${box(n(m.phones_deployed), L('phones recording'))}${box(n(m.phones_out), L('phones down'))}${box(n(m.wearers_present), L('employees present'))}${box(num(m.wearers_present) ? Math.round(100 * num(m.phones_deployed) / num(m.wearers_present)) + '%' : '0%', L('opt-in rate'))}${box(n(m.problems), L('sites with a problem'))}</div>`;
  const eveningBoxes = `<div class="stat">${box(`<span class="frac">${n(reported)}<span class="mute"> / ${n(expected)}</span></span>`, L('sites in'))}${box(n(hours), L('hours recorded'))}${box(n(stillHeld), L('hours pending upload'))}${box(n(t.backlog), L('phones still holding minutes'))}${box(n(t.flags), L('QC flags'))}${box(n(t.incidents), L('incident lines'))}</div>`;
  const morningLine = L('Morning: {a} of {b} sites started, {p} phones recording, {w} present, {o} down.', { a: n(m.checked_in), b: n(expected), p: n(m.phones_deployed), w: n(m.wearers_present), o: n(m.phones_out) });
  const eveningLine = (hours || stillHeld) ? [L('Evening: {h} hours recorded', { h: n(hours) }), stillHeld ? L('{h} hours pending upload', { h: n(stillHeld) }) : '', num(t.backlog) ? plural(t.backlog, '1 phone still holding minutes', '{n} phones still holding minutes') : '', num(t.flags) ? plural(t.flags, '1 flag', '{n} flags') : '', num(t.incidents) ? plural(t.incidents, '1 incident line', '{n} incident lines') : ''].filter(Boolean).join(', ') + '.' : L('Evening: nothing recorded yet.');

  /* the last 30 days: six charts, each drawn at its box's width */
  const dayLabels = days.map((x, i) => (i === last && isToday ? L('today') : shortDay(x.day)));
  const withData = days.filter(has).length;
  const optSeries = series(x => (num(x.wearers_present) ? 100 * num(x.phones_deployed) / num(x.wearers_present) : null));
  const cellsOf = days.map(x => (!x.has || !num(x.expected) ? null : num(x.reported) >= num(x.expected) ? 'all' : num(x.reported) ? 'some' : 'none'));
  charts['t:hours'] = w => bars({ values: days.map(x => x.hours), labels: dayLabels, hi: last, target, w, h: 190, fmt: n, unit: L('target'), highText: L('high'), cells: cellsOf,
    links: days.map(x => x.day), titles: days.map(x => L('{day}: {hours} hours recorded, {k} pending, {reported} of {expected} sites in, {phones} phones', { day: dayLabel(x.day), hours: n(x.hours), k: n(x.hours_held), reported: n(x.reported), expected: n(x.expected), phones: n(x.phones_deployed) })), label: L('Hours per day') });
  charts['t:phones'] = w => area({ series: [{ values: series(x => x.phones_deployed) }, { values: series(x => x.wearers_present) }], labels: dayLabels, hi: last, w, h: 170, fmt: n, label: L('Phones filming and employees present') });
  charts['t:perphone'] = w => area({ series: [{ values: series(x => (num(x.phones_deployed) ? Math.round(10 * num(x.hours) / num(x.phones_deployed)) / 10 : null)) }], labels: dayLabels, hi: last, w, h: 170, fmt: one, ref: phones && target ? Math.round(10 * target / phones) / 10 : 0, refText: L('{x} for the target', { x: phones && target ? one(target / phones) : '' }), label: L('Hours per phone per day') });
  charts['t:optin'] = w => area({ series: [{ values: optSeries }], labels: dayLabels, hi: last, w, h: 170, ymax: Math.max(110, ...optSeries.filter(v => v != null)), fmt: v => Math.round(v) + '%', ref: 100, refText: L('everyone filming'), label: L('Opt-in rate per day') });
  charts['t:sites'] = w => bars({ values: days.map(x => x.reported), labels: dayLabels, hi: last, target: expected, w, h: 150, fmt: n, unit: L('sites'), label: L('Sites in per day') });
  charts['t:morning'] = w => area({ series: [{ values: series(x => x.phones_morning) }, { values: series(x => x.phones_deployed) }], labels: dayLabels, hi: last, w, h: 170, fmt: n, label: L('Phones recording in the morning and filming by evening') });
  const trend = (kind, title, legend) => `<div class="trend"><h4>${esc(title)}</h4><div class="chart" data-chart="${kind}"></div>${legend ? `<p class="tiny mute">${esc(legend)}</p>` : ''}</div>`;
  const trendsHTML = withData < 2 ? `<p class="mute small">${esc(L('No earlier days yet.'))}</p>` : `<div class="trend-grid">
    ${trend('t:hours', L('Hours per day'), L('The hours that reached a hub that day. Under the bars: every site in, some, or none.'))}
    ${trend('t:phones', L('Phones filming against employees present'), L('Solid: phones filming. Dashed: employees present.'))}
    ${trend('t:perphone', L('Hours per phone'), '')}
    ${trend('t:optin', L('Opt-in rate'), '')}
    ${trend('t:sites', L('Sites in by the deadline'), '')}
    ${trend('t:morning', L('Phones: morning against evening'), L('Solid: recording at the morning check-in. Dashed: filming at the evening check-out.'))}
  </div>`;

  /* the month: a ring and three boxes */
  const monthTarget = num(month.target), monthHours = num(month.hours), gone = num(month.days_gone), inMonth = num(month.days_in);
  charts.ring = () => ring({ value: monthHours, total: monthTarget || Math.max(monthHours, 1), text: n(monthHours), sub: monthTarget ? L('of {target}', { target: n(monthTarget) }) : L('this month'), tick: inMonth ? gone / inMonth : null, tickText: L('day {n}', { n: n(gone) }), label: L('{hours} of {target} hours by day {g} of {n}', { hours: n(monthHours), target: n(monthTarget), g: n(gone), n: n(inMonth) }) });
  // the month in one line rather than a row of boxes: where it stands, and what a day still has to bring
  const monthLine = !monthTarget
    ? `${esc(L('{hours} hours so far this month.', { hours: n(monthHours) }))}${founder ? ` <a href="#admin" id="set-target">${esc(L('Set a target'))}</a>` : ''}`
    : [L('Day {g} of {n}.', { g: n(gone), n: n(inMonth) }),
       num(month.per_day_needed) ? L('{x} hours a day still needed.', { x: n(month.per_day_needed) }) : L('The target is already met.'),
       gone < 3 ? '' : num(month.projected) >= monthTarget ? L('On pace for {x}.', { x: n(month.projected) }) : L('On pace for {x}, short of {target}.', { x: n(month.projected), target: n(monthTarget) })
      ].filter(Boolean).map(esc).join(' ');

  /* by site: four charts in the same row order, then the team table */
  const order = sites.filter(s => s.active || s.report || s.checkin).slice().sort((a, b) => (b.report ? num(b.report.hours) : -1) - (a.report ? num(a.report.hours) : -1) || a.name.localeCompare(b.name));
  const top = order.find(s => s.report && num(s.report.hours) > 0);
  const rowOf = (s, f) => (s.report ? f(s.report) : { label: s.name, value: 0, empty: true, emptyText: L('not in') });
  charts.siteBars = w => hbars({ w, rowH: 30, rows: order.map(s => rowOf(s, r => ({ label: s.name, value: num(r.hours), text: n(r.hours) }))), fmt: n, label: L('Hours by site') });
  charts.siteDots = w => dumbbell({ w, rowH: 30, rows: order.map(s => { const r = s.report; if (!r) return { label: s.name, a: 0, b: 0, empty: true, emptyText: L('not in') }; const a = num(r.wearers_present), b = num(r.phones_deployed);
    return { label: s.name, a, b, text: b < a ? L('{gap} not filming', { gap: n(a - b) }) : b === a ? L('all filming') : plural(b - a, '1 phone over people', '{n} phones over people') }; }), fmt: n, label: L('Present against filming') });
  charts.sitePer = w => hbars({ w, rowH: 30, rows: order.map(s => rowOf(s, r => ({ label: s.name, value: num(r.phones_deployed) ? num(r.hours) / num(r.phones_deployed) : 0, text: per(r.hours, r.phones_deployed) || '0', hi: true, low: perPhone != null && num(r.phones_deployed) && num(r.hours) / num(r.phones_deployed) < perPhone * 0.7 }))), fmt: one, ref: perPhone || 0, refText: L('company {x}', { x: one(perPhone) }), label: L('Hours per phone by site') });
  charts.siteOpt = w => hbars({ w, rowH: 30, rows: order.map(s => rowOf(s, r => ({ label: s.name, value: num(r.wearers_present) ? 100 * num(r.phones_deployed) / num(r.wearers_present) : 0, text: pct(r.phones_deployed, r.wearers_present) || '0%', hi: true, low: num(r.wearers_present) && num(r.phones_deployed) / num(r.wearers_present) < OPT_IN_FLOOR }))), fmt: v => Math.round(v) + '%', max: 110, ref: 100, refText: L('everyone filming'), label: L('Opt-in by site') });
  const siteChart = (kind, title) => `<div class="trend"><h4>${esc(title)}</h4><div class="chart" data-chart="${kind}"></div></div>`;
  const bySiteHTML = !reported ? `<p class="mute small">${esc(L('No site is in.'))}</p>` : `<div class="trend-grid bysite">
    ${siteChart('siteBars', L('Hours recorded'))}
    ${siteChart('siteDots', L('Employees present (hollow) and phones filming (filled)'))}
    ${siteChart('sitePer', L('Hours per phone'))}
    ${siteChart('siteOpt', L('Opt-in rate'))}
  </div>`;
  const teamLines = ['direct', 'partner'].filter(k => d.teams && d.teams[k]).map(k => { const x = d.teams[k]; return `${TEAM[k]}: ${L('{a} of {b} in', { a: n(x.reported), b: n(x.expected) })}, ${num(x.hours) ? L('{hours} hours, {phones} phones, {x} per phone, {o} opt-in', { hours: n(x.hours), phones: n(x.phones_deployed), x: per(x.hours, x.phones_deployed) || '0', o: pct(x.phones_deployed, x.wearers_present) || '0%' }) : L('{hours} hours', { hours: n(x.hours) })}.`; });

  /* every business: a row each, and the row opens on its phones */
  const chip = (k, v) => (Number(v) ? `<span class="cc ${DOT[k]}"><i class="sw ${DOT[k]}"></i>${n(v)}</span>` : '');
  const phoneTable = ph => {
    if (!ph.length) return `<p class="mute small">${esc(L('No phone seen at this site in the last 14 days.'))}</p>`;
    const sum2 = (rows, k) => rows.reduce((a, x) => a + num(x[k]), 0);
    const inHours = mm => (num(mm) ? `<span class="in-hours">${esc(L('{h} hours', { h: hrs(num(mm) / 60) }))}</span>` : '');
    const mins2 = (rows, k) => (anyOf(rows, k) ? n(Math.round(sum2(rows, k))) + inHours(sum2(rows, k)) : '');
    return `<div class="t-wrap"><table class="t dash phones"><thead><tr><th>${esc(L('Phone'))}</th><th>${esc(L('Hours a day'))}</th><th class="num">${esc(L('Today'))}</th><th class="num">${esc(L('Days read'))}</th><th>${esc(L('Last seen'))}</th><th class="num">${esc(L('Minutes saved locally'))}<span class="th-hint">${esc(L('still on the phone tonight'))}</span></th></tr></thead>
      <tbody>${ph.map(x => `<tr><td><b>${esc(x.tag)}</b></td><td><i class="sw ${DOT[x.status] || 'n'}"></i>${x.hours_day == null ? `<span class="mute">${esc(L('No evening reading yet'))}</span>` : esc(one(x.hours_day))}</td><td class="num">${esc(one(x.today))}</td><td class="num">${n(x.days)}</td><td>${x.last_day ? esc(shortDay(x.last_day)) + (x.last_kind === 'morning' ? ` <span class="pill">${esc(L('morning'))}</span>` : '') : ''}</td><td class="num">${x.local == null ? '' : n(x.local)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><th scope="row">${esc(L('Total'))}</th><td class="hd">${anyOf(ph, 'hours_day') ? esc(hrs(sum2(ph, 'hours_day'))) : ''}</td><td class="num">${anyOf(ph, 'today') ? esc(hrs(sum2(ph, 'today'))) : ''}</td><td></td><td></td>
        <td class="num">${mins2(ph, 'local')}</td></tr></tfoot></table></div>`;
  };
  const bodyHTML = s2 => {
    const r = s2.report, c = s2.checkin, ms = mapSite(s2.id);
    const lines = [c ? L('Morning: started {t}, {p} phones, {w} present.', { t: clock(L, c.started_at) || clock(L, c.first_at), p: n(c.phones_deployed), w: n(c.wearers_present) }) : L('No morning check-in.'),
      r ? L('Evening: {h} hours recorded from {p} phones, {x} a phone, {k} pending upload, {w} present, sent by {who}.', { h: n(r.hours), p: n(r.phones_deployed), x: per(r.hours, r.phones_deployed) || '0', k: n(held(r)), w: n(r.wearers_present), who: r.reporter || '' }) : L('No evening check-out.')];
    return `<p class="tiny mute">${esc(lines.join(' '))}</p>
      ${gap(ms) ? `<p class="tiny warn">${esc(L('The check-in counted {said} phones and the list names {n}. The map can only draw the ones on the list.', { said: n(ms.said), n: n(ms.phones) }))}</p>` : ''}
      ${phoneTable(phonesOf(s2.id))}`;
  };
  // the name, who runs it, and a word when the map is holding fewer phones than the business is
  const fold = (title, body, cls, id) => `<details class="${esc(cls)}"${id ? ` id="${esc(id)}"` : ''}><summary data-open="${esc(L('Open'))}" data-close="${esc(L('Close'))}"><h3>${esc(title)}</h3></summary><div class="body">${body}</div></details>`;
  const cell = (s, short, listed, marks) => `<td><b>${esc(s.name)}</b><span class="tiny mute" style="display:block">${esc(teamOf(s))}${who(s) ? ', ' + esc(who(s)) : ''}</span>${short ? `<span class="tiny warn" style="display:block">${esc(plural(listed, '1 phone on the map', '{n} phones on the map'))}</span>` : ''}${marks ? `<span class="narrow-only marks">${marks}</span>` : ''}</td>`;
  for (const s of order) charts['week:' + s.id] = () => strip({ values: s.week || [], label: L('Last 7 days: {list}', { list: (s.week || []).map(v => n(v)).join(', ') }) });
  const rowsHTML = order.map(s => { const r = s.report, c = s.checkin;
    const morning = c ? `<span class="when">${esc(clock(L, c.started_at) || clock(L, c.first_at))}</span>${c.ok ? '' : `<span class="pill late">${esc(L('problem'))}</span>`}<span class="tiny mute" style="display:block">${esc(L('{n} phones', { n: n(c.phones_deployed) }))}</span>` : `<span class="pill miss">${esc(L('not in'))}</span>`;
    const evening = r ? `<span class="when">${esc(clock(L, r.first_at))}</span>${r.incident ? `<span class="pill late">${esc(L('incident'))}</span>` : ''}<span class="tiny mute" style="display:block">${esc(r.reporter)}</span>` : `<span class="pill miss">${esc(L('not in'))}</span>`;
    const ms = mapSite(s.id), open2 = s.id === picked;
    // the map can only draw the phones on its list. When this day's count says the business is carrying a different number, the row says so.
    const listed = ms.phones == null ? null : Number(ms.phones);
    const carrying = r ? num(r.phones_deployed) : c ? num(c.phones_deployed) : null;
    const short = listed != null && carrying != null && listed !== carrying;
    // the same marks the two time columns carry, for the widths where those columns are put away
    const marks = [c ? '' : L('no check-in'), c && !c.ok ? L('problem') : '', r ? '' : L('not in'), r && r.incident ? L('incident') : '']
      .filter(Boolean).map(x => `<span class="pill late">${esc(x)}</span>`).join('');
    return `<tr class="site-row${r ? '' : ' mute'}${open2 ? ' on' : ''}" data-id="${esc(s.id)}" tabindex="0" role="button" aria-expanded="${open2}">${cell(s, short, listed, marks)}<td class="when-col">${morning}</td><td class="when-col">${evening}</td><td class="num">${r ? n(r.hours) : '0'}<div class="chart" data-chart="week:${esc(s.id)}"></div></td><td class="num${r && held(r) ? ' late' : ''}">${r ? n(held(r)) + (num(r.backlog) ? `<span class="tiny mute" style="display:block">${esc(L('{n} phones', { n: n(r.backlog) }))}</span>` : '') : ''}</td><td class="num">${r ? n(r.phones_deployed) : ''}</td><td class="num wide-col">${r ? n(r.phones_out) : ''}</td><td class="num wide-col">${r ? n(r.wearers_present) : ''}</td><td class="num wide-col">${r ? pct(r.phones_deployed, r.wearers_present) : ''}</td><td class="num wide-col">${r ? per(r.hours, r.phones_deployed) : ''}</td></tr>
    <tr class="det" data-for="${esc(s.id)}"${open2 ? '' : ' hidden'}><td colspan="10" class="det-cell">${open2 ? bodyHTML(s) : ''}</td></tr>`; }).join('');
  // the foot of the table adds up the rows above it, so every column reads as its own sum: one row per channel when both
  // are running, then the day. Nothing here comes from anywhere but the rows on the page.
  const addUp = set => ({ expected: set.filter(s => s.active).length, checked_in: set.filter(s => s.checkin).length, reported: set.filter(s => s.report).length,
    hours: set.reduce((a, s) => a + (s.report ? num(s.report.hours) : 0), 0), held: set.reduce((a, s) => a + (s.report ? held(s.report) : 0), 0),
    phones: set.reduce((a, s) => a + (s.report ? num(s.report.phones_deployed) : 0), 0), present: set.reduce((a, s) => a + (s.report ? num(s.report.wearers_present) : 0), 0),
    down: set.reduce((a, s) => a + (s.report ? num(s.report.phones_out) : 0), 0) });
  const footRow = (label, x, cls) => `<tr${cls ? ` class="${cls}"` : ''}><th scope="row">${esc(label)}</th><td class="num when-col"><span class="frac">${n(x.checked_in)}<span class="mute"> / ${n(x.expected)}</span></span></td><td class="num when-col"><span class="frac">${n(x.reported)}<span class="mute"> / ${n(x.expected)}</span></span></td><td class="num">${n(x.hours)}</td><td class="num">${n(x.held)}</td><td class="num">${n(x.phones)}</td><td class="num wide-col">${n(x.down)}</td><td class="num wide-col">${n(x.present)}</td><td class="num wide-col">${pct(x.phones, x.present)}</td><td class="num wide-col">${per(x.hours, x.phones)}</td></tr>`;
  const teamKeys = ['direct', 'partner'].filter(k => order.some(s => s.team === k));
  const footHTML = `<tfoot>${teamKeys.length > 1 ? teamKeys.map(k => footRow(TEAM[k], addUp(order.filter(s => s.team === k)), 'sub')).join('') : ''}${footRow(L('The day'), addUp(order))}</tfoot>`;

  const noForm = sites.filter(s => s.report && s.report.incident && !filed.some(i => i.site_id === s.id));
  // what the sites wrote on their check-outs: one list, each line saying which box it came from
  const noteRows = (key, label, only) => sites.filter(s => s.report && String(s.report[key] || '').trim() && (!only || only(s.report)))
    .map(s => `<dt>${esc(s.name)} <span class="tag">${esc(label)}</span></dt><dd>${esc(s.report[key])}</dd>`);
  const notesHTML = () => {
    const rows = [...noteRows('problems', L('incident'), r => r.incident || r.problems), ...noteRows('gear_needed', L('needs')), ...noteRows('other', L('anything else'))];
    return rows.length ? `<h3>${esc(L('What the sites wrote'))}</h3><dl class="notes">${rows.join('')}</dl>` : '';
  };
  model = { headline, morningLine, eveningLine, order, avg7, top, teamLines, perPhone, optIn, hours, stillHeld, phones, present, reported, expected, target, month };

  app.content.innerHTML = `
    <div class="daybar no-print">
      <div class="seg">
        <button type="button" class="btn" id="prev" aria-label="${esc(L('The day before'))}">&lsaquo;</button>
        <input type="date" id="day" value="${esc(day)}" max="${today()}">
        <button type="button" class="btn" id="next" aria-label="${esc(L('The day after'))}" ${day >= today() ? 'disabled' : ''}>&rsaquo;</button>
      </div>
      <div class="chips seg" id="win" role="group" aria-label="${esc(L('How far back the phones are read'))}">${[7, 14, 30].map(v => `<button type="button" class="chip${v === days ? ' on' : ''}" data-days="${v}" aria-pressed="${v === days}">${esc(L(`${v} days`))}</button>`).join('')}</div>
      <span class="grow"></span>
      <div class="acts"><button type="button" class="btn" id="reload">${esc(L('Refresh'))}</button>
      <button type="button" class="btn" id="copy">${esc(L('Copy as text'))}</button>
      <button type="button" class="btn" id="print">${esc(L('Print'))}</button></div>
    </div>
    <div id="rep">
      <h2 class="print-only">${esc(dayLabel(day))}</h2>
      <p class="headline">${headline}</p>

      ${num(d.open_incidents) ? `<p class="small"><a href="${href('report/incidents')}">${esc(plural(d.open_incidents, '1 open incident in all', '{n} open incidents in all'))}</a></p>` : ''}

      <div class="hero">${tiles.join('')}</div>

      <div class="map-wrap"><div class="map" id="map"></div>
        <div class="map-legend">${[['green', L('5 hours a day or more')], ['yellow', L('3 to 5 hours a day')], ['red', L('Under 3 hours a day')], ['none', L('No evening reading yet')]].map(([k, t]) => `<span><i class="sw ${DOT[k]}"></i>${esc(t)}</span>`).join('')}</div>
      </div>
      <p class="tiny dim">${esc(L('The number on a dot is the phones at that business. Click a business, on the map or in the list, to see them.'))} <a href="${href('sites')}">${esc(L('Site database'))}</a></p>

      <h3>${esc(L('The businesses'))}</h3>
      <div class="t-wrap"><table class="t rep sites" id="sites"><thead><tr><th>${esc(L('Site'))}</th><th class="when-col">${esc(L('Morning'))}</th><th class="when-col">${esc(L('Evening'))}</th><th class="num">${esc(L('Recorded'))}</th><th class="num">${esc(L('Pending'))}</th><th class="num">${esc(L('Phones'))}</th><th class="num wide-col">${esc(L('Down'))}</th><th class="num wide-col">${esc(L('Present'))}</th><th class="num wide-col">${esc(L('Opt-in'))}</th><th class="num wide-col">${esc(L('Per phone'))}</th></tr></thead>
      <tbody>${rowsHTML}</tbody>${footHTML}</table></div>

      <h3>${esc(L('The month'))}</h3>
      <div class="month-grid"><div class="ring-host" data-chart="ring"></div><p class="month-line">${monthLine}</p></div>

      ${filed.length || noForm.length ? `<h3>${esc(L('Incidents'))}</h3>` : ''}
      ${filed.length ? `<div class="t-wrap"><table class="t rep"><thead><tr><th class="num">${esc(L('No'))}</th><th>${esc(L('Site'))}</th><th>${esc(L('Kind'))}</th><th>${esc(L('What happened'))}</th><th>${esc(L('Filed by'))}</th><th>${esc(L('Status'))}</th></tr></thead>
      <tbody>${filed.map(i => `<tr><td class="num">${n(i.no)}</td><td><b>${esc(i.site || '')}</b>${i.at ? `<span class="tiny mute" style="display:block">${esc(clock(L, i.at))}</span>` : ''}</td><td>${esc(KIND[i.kind] || i.kind)}</td><td class="txt">${esc(i.what)}</td><td>${esc(i.reporter)}</td><td><span class="pill st-${i.status === 'open' ? 'open' : 'closed'}">${esc(i.status === 'open' ? L('open') : L('closed'))}</span></td></tr>`).join('')}</tbody></table></div>` : noForm.length ? `<p class="mute small">${esc(L('No incident form filed for this day.'))}</p>` : ''}
      ${noForm.length ? `<p class="callout late">${esc(L('On the evening check-out but no incident form yet: {list}', { list: noForm.map(s => s.report.problems ? `${s.name}: ${s.report.problems}` : s.name).join('; ') }))}</p>` : ''}
      ${notesHTML()}

      ${fold(L('The morning and the evening, number by number'), `<h4>${esc(L('The morning'))}</h4>${morningBoxes}<h4>${esc(L('The evening'))}</h4>${eveningBoxes}`, 'more first')}
      ${fold(L('The last 30 days'), trendsHTML, 'more')}
      ${fold(L('Site against site'), bySiteHTML, 'more')}
      ${founder ? fold(L('Codes, deadlines, targets, posts, and the activity log'), `<div id="admin-body"><p class="mute">${esc(L('Loading'))}</p></div>`, 'no-print', 'admin') : ''}

      <p class="tiny mute built">${esc(L('Built at {time} Cairo time, read at {t}. A site with no report counts as zero.', { time: clock(L, String(d.built_at).slice(11)), t: updated }))}</p>
    </div>`;

  bodyOf = id => { const s2 = order.find(x => x.id === id); return s2 ? bodyHTML(s2) : ''; };
  drawCharts();
  drawMap();
  lastW = app.content.clientWidth;
  document.getElementById('win').addEventListener('click', e => { const b = e.target.closest('[data-days]'); if (!b) return; days = Number(b.dataset.days); store.set('vm.dash.days', days); load(true); });
  document.getElementById('sites')?.addEventListener('click', e => { const row = e.target.closest('tr.site-row'); if (row) pick(row.dataset.id); });
  document.getElementById('sites')?.addEventListener('keydown', e => { if (e.key !== 'Enter' && e.key !== ' ') return; const row = e.target.closest('tr.site-row'); if (!row) return; e.preventDefault(); pick(row.dataset.id); });
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
  for (const line of x.teamLines) lines.push(line);
  lines.push('');
  for (const s of x.order) {
    const r = s.report, c = s.checkin;
    if (!r) { lines.push(`${s.name}: ${L('not in')}`); continue; }
    lines.push(`${L('{site}, {reporter}, check-in {a}, report {b}', { site: s.name, reporter: r.reporter, a: c ? clock(L, c.started_at || c.first_at) : L('not in'), b: clock(L, r.first_at) })}: ${L('{h} hours recorded, {k} pending, {p} phones', { h: n(r.hours), k: n(held(r)), p: n(r.phones_deployed) })}${r.phones_out ? ', ' + L('{n} down', { n: n(r.phones_out) }) : ''}${r.flags ? ', ' + plural(r.flags, '1 flag', '{n} flags') : ''}${r.incident ? ', ' + L('incident') : ''}`);
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
