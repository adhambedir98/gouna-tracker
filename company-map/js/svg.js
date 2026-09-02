// Helpers for SVG diagrams drawn in code. Pure string builders.
import { esc } from './app.js';

let n = 0;
export function uid(prefix = 'd') { n += 1; return `${prefix}${n}`; }

// Arrowhead markers. Reference with marker-end="url(#<id>-arr)" or "#<id>-arr-acc".
export function defs(id) {
  const m = (name, cls) => `<marker id="${id}-${name}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse" class="${cls}"><path d="M0 0L10 5L0 10z" fill="currentColor" stroke="none"/></marker>`;
  return `<defs>${m('arr', 'ln')}${m('arr-acc', 'ln-acc')}${m('arr-ink', 'ln-ink')}</defs>`;
}

export function svg({ w, h, label, cls = '', inner = '', id }) {
  const mid = id || uid();
  return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label || '')}" class="${cls}" data-id="${mid}">${defs(mid)}${inner}</svg>`;
}

// Greedy word wrap by character count.
export function wrap(text, maxChars) {
  const words = String(text ?? '').split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > maxChars && cur) { lines.push(cur); cur = w; } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

// Text with tspans, one per line. anchor: start, middle, end. dy in px.
export function text(x, y, lines, { cls = 'tx', lh = 16, anchor } = {}) {
  const arr = Array.isArray(lines) ? lines : [lines];
  const a = anchor ? ` text-anchor="${anchor}"` : '';
  return `<text x="${x}" y="${y}" class="${cls}"${a}>${arr.map((l, i) => `<tspan x="${x}" dy="${i === 0 ? 0 : lh}">${esc(l)}</tspan>`).join('')}</text>`;
}

export function rect(x, y, w, h, cls = 'bx', extra = '') { return `<rect x="${x}" y="${y}" width="${w}" height="${h}" class="${cls}" ${extra}/>`; }
export function line(x1, y1, x2, y2, cls = 'ln', extra = '') { return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${cls}" ${extra}/>`; }
export function circle(cx, cy, r, cls = 'dot', extra = '') { return `<circle cx="${cx}" cy="${cy}" r="${r}" class="${cls}" ${extra}/>`; }
export function path(d, cls = 'ln', extra = '') { return `<path d="${d}" class="${cls}" ${extra}/>`; }

// Arrow from a to b with an optional elbow. Uses the marker of the given id.
export function arrow(x1, y1, x2, y2, { id, cls = 'ln', acc = false, ink = false } = {}) {
  const m = acc ? 'arr-acc' : ink ? 'arr-ink' : 'arr';
  return line(x1, y1, x2, y2, cls, `marker-end="url(#${id}-${m})"`);
}

// A boxed label: rect plus centered text lines.
export function box(x, y, w, h, lines, { cls = 'bx', tcls = 'tx tx-b', lh = 15, sub, scls = 'tx tx-m tx-s' } = {}) {
  const arr = Array.isArray(lines) ? lines : [lines];
  const subArr = sub ? (Array.isArray(sub) ? sub : [sub]) : [];
  const total = arr.length * lh + (subArr.length ? subArr.length * 13 + 3 : 0);
  const y0 = y + h / 2 - total / 2 + lh * 0.75;
  let out = rect(x, y, w, h, cls);
  out += text(x + w / 2, y0, arr, { cls: tcls, lh, anchor: 'middle' });
  if (subArr.length) out += text(x + w / 2, y0 + arr.length * lh - lh + 15, subArr, { cls: scls, lh: 13, anchor: 'middle' });
  return out;
}

export function polar(cx, cy, r, deg) {
  const a = (deg - 90) * Math.PI / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

export function arc(cx, cy, r, a0, a1, cls = 'ln') {
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a1);
  const large = (a1 - a0) % 360 > 180 ? 1 : 0;
  return path(`M${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 ${large} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`, cls);
}

export function figure(inner, { caption = '', cls = '' } = {}) {
  return `<figure class="diagram ${cls}">${inner}${caption ? `<figcaption>${esc(caption)}</figcaption>` : ''}</figure>`;
}
