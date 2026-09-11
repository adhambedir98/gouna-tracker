// Small drawings of the eight fraud patterns, drawn on the Fraud page.
import { line, rect, circle, path, text } from './svg.js';

export function fraudPict(kind, L) {
  const W = 132, H = 76;
  let s = line(4, 70, 128, 70, 'ln-soft');
  const person = (cx, cy, { hat = true, cam = true, arms = 'down' } = {}) => {
    let p = circle(cx, cy, 9, 'bx');
    if (hat) p += rect(cx - 12, cy - 13, 24, 5, 'bx-acc');
    if (hat && cam) p += rect(cx + 9, cy - 12, 6, 5, 'bx-acc');
    p += line(cx, cy + 9, cx, cy + 34, 'ln-ink');
    p += line(cx, cy + 34, cx - 8, cy + 52, 'ln-ink') + line(cx, cy + 34, cx + 8, cy + 52, 'ln-ink');
    if (arms === 'work') p += line(cx, cy + 16, cx + 16, cy + 22, 'ln-ink') + line(cx + 16, cy + 22, cx + 26, cy + 14, 'ln-ink');
    else if (arms === 'still') p += line(cx, cy + 16, cx - 2, cy + 32, 'ln-ink');
    else p += line(cx, cy + 16, cx + 6, cy + 30, 'ln-ink');
    return p;
  };
  const cone = (x, y, deg, len) => {
    const a = deg * Math.PI / 180, h = 13 * Math.PI / 180;
    const p1 = [x + len * Math.cos(a - h), y + len * Math.sin(a - h)], p2 = [x + len * Math.cos(a + h), y + len * Math.sin(a + h)];
    return path(`M${x} ${y}L${p1[0].toFixed(1)} ${p1[1].toFixed(1)}L${p2[0].toFixed(1)} ${p2[1].toFixed(1)}Z`, 'bx-soft');
  };
  switch (kind) {
    case 'idle': s += cone(46, 13, 0, 58) + person(34, 22, { arms: 'still' }) + rect(64, 3, 58, 22, 'bx', 'stroke-dasharray="3 3"') + text(93, 18, L('same frame'), { cls: 'tx tx-s tx-m', anchor: 'middle' }); break;
    case 'hat-off': s += person(34, 22, { hat: false }) + cone(101, 56, -90, 40) + rect(86, 60, 30, 5, 'bx-acc') + rect(98, 55, 6, 5, 'bx-acc') + text(101, 10, L('ceiling'), { cls: 'tx tx-s tx-m', anchor: 'middle' }); break;
    case 'torso': s += path('M48 13L20 64L52 66Z', 'bx-soft') + person(36, 22) + text(2, 46, L('body'), { cls: 'tx tx-s tx-m' }) + cone(106, 13, 66, 60) + person(94, 22) + text(128, 48, L('floor'), { cls: 'tx tx-s tx-m', anchor: 'end' }); break;
    case 'chest': s += cone(44, 39, 6, 58) + person(34, 22, { cam: false }) + rect(37, 36, 6, 5, 'bx-acc'); break;
    case 'other-person': s += cone(42, 13, 8, 54) + person(30, 22) + person(98, 22, { hat: false, arms: 'work' }); break;
    case 'staged': s += cone(46, 13, 0, 50) + person(34, 22, { arms: 'work' }) + path('M104 34 a 9 9 0 1 1 8 -12', 'ln-ink') + path('M112 16 l3 7 l-8 0 Z', 'bx-acc') + text(108, 58, L('again'), { cls: 'tx tx-s tx-m', anchor: 'middle' }); break;
    case 'screen': s += cone(42, 13, 0, 44) + person(30, 22) + rect(88, 4, 38, 28, 'bx-acc-line') + path('M102 11 L114 18 L102 25 Z', 'bx-acc'); break;
    case 'repeat': s += cone(46, 13, 0, 46) + person(34, 22) + line(96, 8, 96, 30, 'ln-ink') + path('M96 8 L110 13 L96 18 Z', 'bx-acc') + line(114, 8, 114, 30, 'ln-ink') + path('M114 8 L128 13 L114 18 Z', 'bx-acc') + text(104, 46, L('flag, flag'), { cls: 'tx tx-s tx-m', anchor: 'middle' }); break;
  }
  return `<svg viewBox="0 0 ${W} ${H}" class="pict" aria-hidden="true">${s}</svg>`;
}

