// Charts drawn in code, as SVG strings, for the company report. No library, no network.
// Every chart is a viewBox drawing that scales to its container; the classes (.ch-*) live in css/site.css.
// Time runs left to right in both languages, so the drawings set direction:ltr and the labels stay put.
import { esc } from './app.js';

const r1 = v => Math.round(v * 10) / 10;
const nz = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
const open = (w, h, label, cls = '', extra = '') => `<svg viewBox="0 0 ${w} ${h}" class="ch ${cls}" role="img" aria-label="${esc(label || '')}" style="direction:ltr" preserveAspectRatio="xMidYMid meet"${extra}>`;
const AR = /[\u0600-\u06FF]/;
const T = (x, y, s, cls = 'ch-lbl', anchor = 'middle') => { const rtl = AR.test(String(s)); const a = rtl ? (anchor === 'start' ? 'end' : anchor === 'end' ? 'start' : anchor) : anchor; return `<text x="${r1(x)}" y="${r1(y)}" class="${cls}" text-anchor="${a}"${rtl ? ' direction="rtl" style="unicode-bidi:embed"' : ''}>${esc(s)}</text>`; };
// room at the end of a row for its label
const endRoom = (rows, fmt, least) => Math.max(least, ...rows.map(r => (r.empty ? String(r.emptyText || '') : String(r.text ?? fmt(r.value ?? r.b))).length * 6.6 + 14));
// which of n x labels to draw: the first, then every step, and the last only when it is not on top of the one before it
function ticks(n, most = 8) {
  const step = Math.max(1, Math.ceil(n / most));
  const set = new Set();
  for (let i = 0; i < n; i += step) set.add(i);
  const last = Math.max(...set);
  if (n - 1 - last >= step / 2) set.add(n - 1); else if (n > 1) { set.delete(last); set.add(n - 1); }
  return set;
}
// a row label that fits its column, cut with a dot when it does not
const fit = (s, max) => { s = String(s ?? ''); return s.length > max ? s.slice(0, Math.max(1, max - 1)).trimEnd() + '.' : s; };

/* Vertical bars over time. hi: the index drawn in the accent (the chosen day). target: a dashed line with its label.
   Labels are thinned so they never collide: the first, the last, and every nth. */
export function bars({ values, labels = [], hi = -1, target = 0, w = 360, h = 150, fmt = String, label = '', unit = '', cells = null, links = null, titles = null, highText = '', solid = null }) {
  const vals = values.map(nz);
  const n = vals.length || 1;
  const padT = 20, padB = cells ? 34 : 20, padL = 6, padR = 6;
  const max = Math.max(1, ...vals, target);
  const ih = h - padT - padB, iw = w - padL - padR;
  const bw = iw / n, gap = Math.min(4, bw * 0.25);
  const y = v => padT + ih - (v / max) * ih;
  let out = open(w, h, label);
  // the target line first, so the bars sit over it
  if (target > 0) out += `<line x1="${padL}" x2="${w - padR}" y1="${r1(y(target))}" y2="${r1(y(target))}" class="ch-target"/>` + T(padL, y(target) - 4, `${fmt(target)} ${unit}`.trim(), 'ch-lbl ch-target-lbl', 'start');
  out += `<line x1="${padL}" x2="${w - padR}" y1="${r1(padT + ih)}" y2="${r1(padT + ih)}" class="ch-base"/>`;
  vals.forEach((v, i) => {
    const x = padL + i * bw + gap / 2, bh = Math.max(v > 0 ? 1.5 : 0, ih * v / max);
    let col = `<rect x="${r1(x)}" y="${r1(padT + ih - bh)}" width="${r1(bw - gap)}" height="${r1(bh)}" class="ch-bar${i === hi ? ' hi' : ''}${v === 0 ? ' zero' : ''}${solid ? ' faint' : ''}"/>`;
    // a solid part inside the bar (what was uploaded), the rest of the bar reads as still on the phones
    if (solid && v > 0) { const sh = Math.min(bh, ih * Math.max(0, nz(solid[i])) / max); if (sh > 0) col += `<rect x="${r1(x)}" y="${r1(padT + ih - sh)}" width="${r1(bw - gap)}" height="${r1(sh)}" class="ch-bar${i === hi ? ' hi' : ''}"/>`; }
    // a cell under the baseline: every site in (filled), some (outline), none (red outline)
    if (cells && cells[i]) col += `<rect x="${r1(x)}" y="${r1(padT + ih + 6)}" width="${r1(bw - gap)}" height="8" class="ch-cell ${cells[i]}"/>`;
    if (links && links[i]) col = `<a href="#${esc(links[i])}" data-day="${esc(links[i])}"><rect x="${r1(x)}" y="${padT}" width="${r1(bw - gap)}" height="${r1(ih + 14)}" class="ch-hit"/>${titles && titles[i] ? `<title>${esc(titles[i])}</title>` : ''}${col}</a>`;
    out += col;
  });
  // value on the highlighted bar, and the high when it stands clear of it
  const peak = vals.indexOf(Math.max(...vals));
  if (hi >= 0 && vals[hi] > 0) out += T(Math.min(Math.max(padL + hi * bw + bw / 2, 20), w - 20), y(vals[hi]) - 5, fmt(vals[hi]), 'ch-val');
  if (peak >= 0 && vals[peak] > 0 && Math.abs(peak - hi) >= 3 && vals[peak] > (hi >= 0 ? vals[hi] : 0)) out += T(Math.min(Math.max(padL + peak * bw + bw / 2, 30), w - 30), y(vals[peak]) - 5, `${highText ? highText + ' ' : ''}${fmt(vals[peak])}`, 'ch-lbl');
  const show = ticks(n, Math.max(3, Math.floor(w / 72)));
  labels.forEach((s, i) => { if (show.has(i)) out += T(padL + i * bw + bw / 2, h - 5, s); });
  return out + '</svg>';
}

/* One or two series over time as lines, the first with a soft area under it. ymax fixes the scale (100 for a rate).
   A null value is a day with nothing to say: the line breaks there instead of dropping to zero. */
export function area({ series, labels = [], hi = -1, w = 360, h = 150, ymax = 0, fmt = String, label = '', ref = 0, refText = '' }) {
  const padT = 20, padB = 20, padL = 6, padR = 6;
  const all = series.flatMap(s => s.values.filter(v => v != null).map(nz));
  const max = Math.max(1, ymax || Math.max(...all, ref));
  const n = Math.max(2, ...series.map(s => s.values.length));
  const ih = h - padT - padB, iw = w - padL - padR;
  const X = i => padL + (i / (n - 1)) * iw, Y = v => padT + ih - (nz(v) / max) * ih;
  let out = open(w, h, label);
  if (ref > 0) out += `<line x1="${padL}" x2="${w - padR}" y1="${r1(Y(ref))}" y2="${r1(Y(ref))}" class="ch-target"/>` + T(padL, Y(ref) - 4, refText || fmt(ref), 'ch-lbl ch-target-lbl', 'start');
  series.forEach((s, k) => {
    const cls = s.cls || (k === 0 ? 'a' : 'b');
    // runs of days with a value
    const runs = []; let run = [];
    s.values.forEach((v, i) => { if (v == null) { if (run.length) runs.push(run); run = []; } else run.push(i); });
    if (run.length) runs.push(run);
    for (const r of runs) {
      const pts = r.map(i => `${r1(X(i))},${r1(Y(s.values[i]))}`);
      if (k === 0 && r.length > 1) out += `<path d="M${pts[0]} L${pts.join(' L')} L${r1(X(r[r.length - 1]))},${r1(padT + ih)} L${r1(X(r[0]))},${r1(padT + ih)} Z" class="ch-area"/>`;
      if (r.length > 1) out += `<polyline points="${pts.join(' ')}" class="ch-line ${cls}"/>`;
      else out += `<circle cx="${r1(X(r[0]))}" cy="${r1(Y(s.values[r[0]]))}" r="2.5" class="ch-dot ${cls}"/>`;
    }
    if (hi >= 0 && hi < s.values.length && s.values[hi] != null) out += `<circle cx="${r1(X(hi))}" cy="${r1(Y(s.values[hi]))}" r="3.5" class="ch-dot ${cls}"/>` + T(X(hi) + (hi > n / 2 ? -8 : 8), Y(s.values[hi]) - 6 - (k ? 0 : 0), fmt(s.values[hi]), 'ch-val', hi > n / 2 ? 'end' : 'start');
  });
  const show = ticks(n, Math.max(3, Math.floor(w / 72)));
  labels.forEach((s, i) => { if (show.has(i)) out += T(X(i), h - 5, s, 'ch-lbl', i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'); });
  return out + '</svg>';
}

/* A ring: value of total, the number in the middle. */
export function ring({ value, total, size = 170, r = 60, text, sub = '', label = '', tick = null, tickText = '' }) {
  const v = nz(value), t = Math.max(nz(total), 0);
  const share = t > 0 ? Math.min(1, v / t) : 0;
  const c = size / 2, len = 2 * Math.PI * r;
  let out = open(size, size, label, 'ch-ring', ` width="${size}" height="${size}"`);
  out += `<circle cx="${c}" cy="${c}" r="${r}" class="ch-track"/>`;
  if (share > 0) out += `<circle cx="${c}" cy="${c}" r="${r}" class="ch-arc${share >= 1 ? ' full' : ''}" stroke-dasharray="${r1(len * share)} ${r1(len)}" transform="rotate(-90 ${c} ${c})"/>`;
  // a tick on the outside for where the month stands, so the arc can be read against the calendar
  if (tick != null) {
    const a = (Math.min(1, Math.max(0, tick)) * 360 - 90) * Math.PI / 180, deg = Math.min(1, Math.max(0, tick)) * 360;
    const p = k => [r1(c + k * Math.cos(a)), r1(c + k * Math.sin(a))];
    const [x1, y1] = p(r + 6), [x2, y2] = p(r + 13), [tx, ty] = p(r + 18);
    out += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="ch-tick"/>`;
    if (tickText) out += `<text x="${tx}" y="${ty}" class="ch-lbl" text-anchor="${deg < 20 || deg > 340 || (deg > 160 && deg < 200) ? 'middle' : deg < 180 ? 'start' : 'end'}" dominant-baseline="middle">${esc(tickText)}</text>`;
  }
  out += T(c, c + (sub ? 2 : 8), text ?? `${Math.round(share * 100)}%`, 'ch-big');
  if (sub) out += T(c, c + 20, sub, 'ch-lbl');
  return out + '</svg>';
}

/* A sparkline for a table cell or next to a number: the last seven days, the last point marked. */
export function spark({ values, w = 84, h = 26, label = '' }) {
  const vals = values.map(nz);
  if (!vals.length) return '';
  const max = Math.max(1, ...vals), n = vals.length;
  const X = i => 3 + (n > 1 ? (i / (n - 1)) * (w - 6) : (w - 6) / 2), Y = v => h - 4 - (v / max) * (h - 8);
  const pts = vals.map((v, i) => `${r1(X(i))},${r1(Y(v))}`).join(' ');
  return open(w, h, label, 'spark') + `<polyline points="${pts}" class="ch-line a"/><circle cx="${r1(X(n - 1))}" cy="${r1(Y(vals[n - 1]))}" r="2.5" class="ch-dot a"/></svg>`;
}

/* Two values per row on one scale, joined by a line: employees present (hollow) against phones filming (filled). */
export function dumbbell({ rows, w = 360, rowH = 30, max = 0, fmt = String, label = '', aName = '', bName = '' }) {
  const m = Math.max(1, max || Math.max(...rows.flatMap(r => [nz(r.a), nz(r.b)])));
  const labW = Math.min(150, Math.round(w * 0.36)), padR = Math.min(w * 0.45, endRoom(rows, fmt, 60)), top = aName ? 20 : 6;
  const h = top + rows.length * rowH + 4;
  const X = v => labW + (nz(v) / m) * (w - labW - padR);
  let out = open(w, h, label);
  if (aName) { const x2 = labW + 16 + aName.length * 6.6 + 14; out += `<circle cx="${labW + 6}" cy="9" r="4" class="ch-dot hollow"/>` + T(labW + 14, 13, aName, 'ch-lbl', 'start') + `<circle cx="${r1(x2)}" cy="9" r="4" class="ch-dot a"/>` + T(x2 + 8, 13, bName, 'ch-lbl', 'start'); }
  rows.forEach((r, i) => {
    const y = top + i * rowH + rowH / 2, xa = X(r.a), xb = X(r.b);
    out += T(labW - 10, y + 4, fit(r.label, Math.floor(labW / 7.2)), 'ch-row', 'end');
    if (r.empty) { out += T(labW, y + 4, r.emptyText || '', 'ch-lbl', 'start'); return; }
    out += `<line x1="${r1(Math.min(xa, xb))}" x2="${r1(Math.max(xa, xb))}" y1="${r1(y)}" y2="${r1(y)}" class="ch-join${nz(r.b) < nz(r.a) ? ' short' : ''}"/>`;
    out += `<circle cx="${r1(xa)}" cy="${r1(y)}" r="5" class="ch-dot hollow"/><circle cx="${r1(xb)}" cy="${r1(y)}" r="5" class="ch-dot a"/>`;
    out += T(Math.max(xa, xb) + 10, y + 4, r.text ?? `${fmt(r.b)} of ${fmt(r.a)}`, 'ch-val', 'start');
  });
  return out + '</svg>';
}

/* Horizontal bars, one per row, with the value at the end and an optional reference line. */
export function hbars({ rows, w = 360, rowH = 28, max = 0, fmt = String, label = '', ref = 0, refText = '' }) {
  const m = Math.max(1, max || Math.max(...rows.map(r => nz(r.value)), ref));
  const labW = Math.min(150, Math.round(w * 0.36)), padR = Math.min(w * 0.45, endRoom(rows, fmt, 48)), top = ref ? 16 : 4;
  const h = top + rows.length * rowH + 4;
  const X = v => labW + (nz(v) / m) * (w - labW - padR);
  let out = open(w, h, label);
  if (ref > 0) out += `<line x1="${r1(X(ref))}" x2="${r1(X(ref))}" y1="${top - 2}" y2="${h - 2}" class="ch-target"/>` + T(X(ref), 11, refText || fmt(ref), 'ch-lbl ch-target-lbl');
  rows.forEach((r, i) => {
    const y = top + i * rowH;
    out += T(labW - 10, y + rowH / 2 + 4, fit(r.label, Math.floor(labW / 7.2)), 'ch-row', 'end');
    if (r.empty) { out += T(labW, y + rowH / 2 + 4, r.emptyText || '', 'ch-lbl', 'start'); return; }
    const bw = Math.max(nz(r.value) > 0 ? 1.5 : 0, X(r.value) - labW);
    if (r.solid != null) {
      const sw = Math.max(0, X(Math.min(nz(r.solid), nz(r.value))) - labW);
      if (sw > 0) out += `<rect x="${labW}" y="${r1(y + 5)}" width="${r1(sw)}" height="${r1(rowH - 10)}" class="ch-bar hi"/>`;
      if (bw - sw > 1) out += `<rect x="${r1(labW + sw)}" y="${r1(y + 5.75)}" width="${r1(bw - sw - 0.75)}" height="${r1(rowH - 11.5)}" class="ch-bar outline"/>`;
      if (bw <= 1.5) out += `<rect x="${labW}" y="${r1(y + 5)}" width="1.5" height="${r1(rowH - 10)}" class="ch-bar hi"/>`;
    } else out += `<rect x="${labW}" y="${r1(y + 5)}" width="${r1(bw)}" height="${r1(rowH - 10)}" class="ch-bar${r.hi ? ' hi' : ''}${r.low ? ' low' : ''}"/>`;
    out += T(labW + bw + 6, y + rowH / 2 + 4, r.text ?? fmt(r.value), 'ch-val', 'start');
  });
  return out + '</svg>';
}

/* The month as a grid of days, seven to a row like a calendar, shaded by value. The chosen day is outlined. */
export function heat({ days, w = 360, max = 0, fmt = String, hi = '', label = '', weekday = [] }) {
  const m = Math.max(1, max || Math.max(...days.map(d => nz(d.value))));
  const cols = 7, cell = Math.floor((w - 6 * 4) / cols), gap = 4, top = weekday.length ? 16 : 0;
  // start the grid on the weekday of the first day, so columns are weekdays
  const first = new Date(days[0].day + 'T12:00:00');
  const offset = (first.getDay() + 1) % 7; // Saturday first, the Egyptian week
  const rows = Math.ceil((offset + days.length) / cols);
  const h = top + rows * (cell + gap);
  let out = open(w, h, label);
  weekday.forEach((s, i) => { out += T(i * (cell + gap) + cell / 2, 11, s, 'ch-lbl'); });
  days.forEach((d, i) => {
    const k = i + offset, c = k % cols, r = Math.floor(k / cols);
    const x = c * (cell + gap), y = top + r * (cell + gap);
    const v = nz(d.value), lvl = v <= 0 ? 0 : v < m * 0.34 ? 1 : v < m * 0.67 ? 2 : 3;
    out += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" class="ch-cell l${lvl}${d.day === hi ? ' hi' : ''}${d.has === false ? ' none' : ''}"><title>${esc(d.day)}: ${esc(fmt(v))}</title></rect>`;
    out += T(x + 4, y + 12, String(Number(d.day.slice(8, 10))), `ch-day${lvl === 3 ? ' on' : ''}`, 'start');
  });
  return out + '</svg>';
}

/* A sparkline for a tile: up to 30 points, a gap where the value is null, an optional dashed target, the last point marked. No text. */
export function sparkline({ values, target = 0, w = 120, h = 36, label = '' }) {
  const vals = values.map(v => (v == null ? null : nz(v)));
  const defined = vals.filter(v => v != null);
  const max = Math.max(1, ...defined, target);
  const n = Math.max(2, vals.length);
  const X = i => 4 + (i * (w - 8)) / (n - 1), Y = v => h - 3 - (v / max) * (h - 8);
  let out = open(w, h, label, 'ch-spark', ` height="${h}"`);
  out += `<line x1="0" x2="${w}" y1="${h - 2}" y2="${h - 2}" class="ch-base"/>`;
  if (target > 0) out += `<line x1="0" x2="${w}" y1="${r1(Y(target))}" y2="${r1(Y(target))}" class="ch-target"/>`;
  if (!defined.length) return out + '</svg>';
  const runs = []; let run = [];
  vals.forEach((v, i) => { if (v == null) { if (run.length) runs.push(run); run = []; } else run.push(i); });
  if (run.length) runs.push(run);
  for (const r of runs) {
    if (r.length === 1) out += `<circle cx="${r1(X(r[0]))}" cy="${r1(Y(vals[r[0]]))}" r="1.5" class="ch-dot b"/>`;
    else out += `<polyline points="${r.map(i => `${r1(X(i))},${r1(Y(vals[i]))}`).join(' ')}" class="ch-thin"/>`;
  }
  if (vals[n - 1] != null) out += `<circle cx="${r1(X(n - 1))}" cy="${r1(Y(vals[n - 1]))}" r="3.5" class="ch-dot a"/>`;
  return out + '</svg>';
}

/* Seven small bars for a table cell: the last one is the chosen day. */
export function strip({ values, w = 48, h = 20, label = '' }) {
  const vals = values.map(nz), max = Math.max(1, ...vals), n = vals.length || 7;
  const bw = Math.max(2, Math.floor((w - (n - 1) * 2) / n));
  let out = open(w, h, label, 'ch-strip', ` width="${w}" height="${h}"`);
  out += `<line x1="0" x2="${w}" y1="${h - 0.5}" y2="${h - 0.5}" class="ch-base"/>`;
  vals.forEach((v, i) => { const bh = (v / max) * (h - 2); if (bh > 0) out += `<rect x="${i * (bw + 2)}" y="${r1(h - 1 - bh)}" width="${bw}" height="${r1(bh)}" class="ch-bar${i === n - 1 ? ' hi' : ''}"/>`; });
  return out + '</svg>';
}
