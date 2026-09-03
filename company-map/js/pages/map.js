import { mount, loadJSON, t, esc, site, initialHash, setHash, labels } from '../app.js';
import { defs } from '../svg.js';
const L = await labels('map');

const app = await mount({
  page: 'map',
  title: L('Who does what'),
  lede: L('Three founder trees. Tap any box for the role card.'),
  wide: true
});
const data = await loadJSON('data/people.json');
const P = Object.fromEntries(data.people.map(p => [p.id, p]));
const ui = k => t(site.ui[k]);

/* ---------- layout constants ---------- */
const NODE_W = 150, GAP = 8, PAD = 14, TITLE_H = 24, LEVEL = 36, SIB = 28, SUB_GAP = 30, INDENT = 26, VGAP = 10, BUS = 14, STACK_INDENT = 24, STACK_GAP = 10;

function nodeHTML(id, cls = '') {
  const p = P[id];
  return `<button type="button" class="node ${cls}${p.open ? ' open' : ''}${p.bucket ? ' bucket' : ''}" data-person="${p.id}" data-id="${p.id}"><span class="n">${esc(p.name)}</span><span class="r">${esc(p.title)}</span></button>`;
}

function collectIds(n, out = []) {
  out.push(n.id);
  (n.kids || []).forEach(k => collectIds(k, out));
  if (n.group) { n.group.ids.forEach(id => out.push(id)); if (n.group.sub) out.push(n.group.sub); }
  return out;
}

/* ---------- wide layout: siblings side by side ---------- */
function layoutWide(root0, els, cw, alignX) {
  const H = id => els[id].offsetHeight;
  let cols = 5, root, pos, groups, paths, dashes;

  // siblings side by side with one gap between subtrees; a dashed sibling sits lower, so it lands centred between its neighbours
  function arrange(n) {
    const xs = []; let x = 0;
    n.kids.forEach((k, i) => {
      if (i > 0) x += SIB;
      xs.push(x); x += k.subW;
    });
    return { xs, total: x };
  }

  function size(n) {
    n.w = NODE_W; n.h = H(n.id);
    if (n.group) {
      const g = n.group;
      const c = Math.min(g.perRow || cols, g.ids.length); // perRow in the data pins the grid
      const rows = Math.ceil(g.ids.length / c);
      const rowH = Math.max(...g.ids.map(H));
      g.rowH = rowH; g.cols = c;
      g.w = c * NODE_W + (c - 1) * GAP + PAD * 2;
      g.h = PAD + TITLE_H + rows * rowH + (rows - 1) * GAP + (g.sub ? SUB_GAP + H(g.sub) : 0) + PAD;
      n.subW = Math.max(n.w, g.w); n.subH = n.h + LEVEL + g.h;
    } else if (n.kids && n.kids.length) {
      n.kids.forEach(size);
      if (n.stack) {
        n.subW = Math.max(n.w, NODE_W);
        n.subH = n.h + LEVEL + n.kids.reduce((s, k) => s + k.subH, 0) + (n.kids.length - 1) * STACK_GAP;
      } else {
        // one row of boxes, then everything below them starts on one shared level
        const tot = arrange(n).total;
        n.kidsW = tot;
        n.rowH = Math.max(...n.kids.map(k => k.h));
        const below = Math.max(0, ...n.kids.map(k => k.subH - k.h));
        n.subW = Math.max(n.w, tot); n.subH = n.h + LEVEL + n.rowH + below;
      }
    } else { n.subW = n.w; n.subH = n.h; }
  }
  function place(n, x0, y, top) {
    n.x = x0 + (n.subW - n.w) / 2; n.y = y;
    pos[n.id] = { x: n.x, y: n.y, w: n.w, h: n.h };
    const cx = n.x + n.w / 2, by = n.y + n.h;
    const ct = top ?? (by + LEVEL); // where this node's children start
    if (n.group) {
      const g = n.group;
      const gx = x0 + (n.subW - g.w) / 2, gy = ct;
      groups.push({ x: gx, y: gy, w: g.w, h: g.h, title: g.title });
      paths.push(`M${cx} ${by}V${gy}`);
      g.ids.forEach((id, i) => {
        const r = Math.floor(i / g.cols), c = i % g.cols;
        const inRow = Math.min(g.cols, g.ids.length - r * g.cols);
        const rowW = inRow * NODE_W + (inRow - 1) * GAP;
        const rx = gx + (g.w - rowW) / 2;
        pos[id] = { x: rx + c * (NODE_W + GAP), y: gy + PAD + TITLE_H + r * (g.rowH + GAP), w: NODE_W, h: H(id) };
      });
      if (g.sub) {
        const rows = Math.ceil(g.ids.length / g.cols);
        const gridBottom = gy + PAD + TITLE_H + rows * g.rowH + (rows - 1) * GAP;
        const sy = gridBottom + SUB_GAP, sx = gx + (g.w - NODE_W) / 2;
        pos[g.sub] = { x: sx, y: sy, w: NODE_W, h: H(g.sub) };
        const bx1 = gx + g.w * 0.12, bx2 = gx + g.w * 0.88, byy = sy - SUB_GAP / 2;
        paths.push(`M${bx1} ${byy}H${bx2}`, `M${gx + g.w / 2} ${byy}V${sy}`);
      }
    } else if (n.kids && n.kids.length && n.stack) {
      // children sit directly under the node, same width, one clean column
      n.x = x0; pos[n.id].x = n.x;
      const cxs = n.x + n.w / 2;
      let ky = ct, prevBottom = by;
      n.kids.forEach(k => { place(k, x0, ky); paths.push(`M${cxs} ${prevBottom}V${k.y}`); prevBottom = k.y + k.h; ky += k.subH + STACK_GAP; });
    } else if (n.kids && n.kids.length) {
      let kx = x0 + (n.subW - n.kidsW) / 2;
      const busY = by + BUS;
      const centers = [];
      const { xs } = arrange(n);
      const rowTop = ct, nextTop = ct + n.rowH + LEVEL;
      n.kids.forEach((k, i) => {
        place(k, kx + xs[i], rowTop, nextTop);
        centers.push(k.x + k.w / 2);
      });
      // a peer child sits exactly midway between the two boxes beside it
      n.kids.forEach((k, i) => {
        const prev = n.kids[i - 1], next = n.kids[i + 1];
        if (!k.peer || !prev || !next) return;
        k.x = (prev.x + prev.w + next.x) / 2 - k.w / 2; pos[k.id].x = k.x; centers[i] = k.x + k.w / 2;
      });
      // the parent sits over the middle of the children on its bus; a peer child hangs off a sibling instead
      const solid = centers.filter((c, i) => !n.kids[i].peer);
      const mid = (solid[0] + solid[solid.length - 1]) / 2;
      n.x = Math.min(Math.max(mid - n.w / 2, x0), x0 + n.subW - n.w); pos[n.id].x = n.x;
      const px = n.x + n.w / 2;
      paths.push(`M${px} ${by}V${busY}`);
      if (solid.length > 1) paths.push(`M${Math.min(...solid, px)} ${busY}H${Math.max(...solid, px)}`);
      solid.forEach(c => paths.push(`M${c} ${busY}V${rowTop}`));
      // a peer child: a straight line from the side of the sibling it reports to, at mid height
      n.kids.forEach(k => {
        if (!k.peer) return;
        const p = n.kids.find(o => o.id === k.peer); if (!p) return;
        const ry = rowTop + Math.min(p.h, k.h) / 2;
        paths.push(p.x < k.x ? `M${p.x + p.w} ${ry}H${k.x}` : `M${k.x + k.w} ${ry}H${p.x}`);
      });
    }
  }
  // the widest group grid that still fits
  for (cols of [5, 4, 3, 2, 1]) {
    root = structuredClone(root0); pos = {}; groups = []; paths = []; dashes = [];
    size(root);
    if (root.subW <= cw) break;
  }
  // dry run to learn where the root lands, then place for real: centred, or with the root over alignX
  place(root, 0, 0);
  const rc = root.x + root.w / 2;
  pos = {}; groups = []; paths = []; dashes = [];
  let left = (cw - root.subW) / 2;
  if (alignX != null) left = Math.min(Math.max(alignX - rc, 0), Math.max(0, cw - root.subW));
  left = Math.max(0, left);
  place(root, left, 0);
  return { pos, groups, paths, dashes, rootX: root.x + root.w / 2, W: Math.max(cw, root.subW), H: root.subH };
}

/* ---------- narrow layout: an indented outline ---------- */
function layoutNarrow(root, els, cw) {
  const pos = {}, groups = [], paths = [], dashes = [], labels = [];
  let y = 0;
  function row(n, depth) {
    const x = depth * INDENT;
    const el = els[n.id];
    const w = cw - x;
    el.style.width = w + 'px';
    const h = el.offsetHeight;
    pos[n.id] = { x, y, w, h };
    const my = y; y += h + VGAP;
    const kids = [];
    (n.kids || []).forEach(k => kids.push({ id: k.id, dashed: !!k.dashed, fn: () => row(k, depth + 1) }));
    if (n.group) {
      kids.push({ label: true, fn: () => {
        const lx = (depth + 1) * INDENT;
        labels.push({ x: lx, y, text: n.group.title });
        const ly = y; y += 22;
        const members = [...n.group.ids, ...(n.group.sub ? [n.group.sub] : [])];
        const mids = members.map(id => row({ id }, depth + 2));
        // bracket for the label's children
        const lastMid = mids[mids.length - 1];
        paths.push(`M${lx + 12} ${ly + 20}V${lastMid}`);
        mids.forEach((m, i) => paths.push(`M${lx + 12} ${m}H${(depth + 2) * INDENT}`));
        return ly + 10;
      } });
    }
    if (kids.length) {
      const mids = kids.map(k => k.fn());
      const sx = x + 14;
      paths.push(`M${sx} ${my + h}V${mids[mids.length - 1]}`);
      mids.forEach((m, i) => (kids[i].dashed ? dashes : paths).push(`M${sx} ${m}H${(depth + 1) * INDENT}`));
    }
    return my + h / 2;
  }
  row(root, 0);
  return { pos, groups, paths, dashes, labels, W: cw, H: y - VGAP };
}

function renderTree(tree, box, alignX) {
  const ids = collectIds(tree.root);
  box.innerHTML = `<svg aria-hidden="true"></svg>` + ids.map(id => nodeHTML(id, id === tree.root.id ? 'founder' : '')).join('');
  const els = Object.fromEntries([...box.querySelectorAll('.node')].map(e => [e.dataset.id, e]));
  const cw = box.clientWidth;
  const narrow = cw < 640;
  box.classList.toggle('narrow', narrow);
  Object.values(els).forEach(e => { e.style.width = narrow ? '' : NODE_W + 'px'; e.style.visibility = 'hidden'; });
  const lay = narrow ? layoutNarrow(structuredClone(tree.root), els, cw) : layoutWide(structuredClone(tree.root), els, cw, alignX);
  box.style.height = lay.H + 'px';
  const dirRtl = document.dir === 'rtl';
  const X = (x, w) => dirRtl ? lay.W - x - w : x;
  for (const [id, p] of Object.entries(lay.pos)) {
    const e = els[id];
    e.style.left = X(p.x, p.w) + 'px'; e.style.top = p.y + 'px'; e.style.visibility = '';
  }
  const gHTML = (lay.groups || []).map(g => `<div class="grp" style="left:${X(g.x, g.w)}px;top:${g.y}px;width:${g.w}px;height:${g.h}px"><span class="gt">${esc(g.title)}</span></div>`).join('');
  const lHTML = (lay.labels || []).map(l => `<div class="glabel" style="left:${l.x}px;top:${l.y}px">${esc(l.text)}</div>`).join('');
  box.insertAdjacentHTML('afterbegin', gHTML + lHTML);
  const svg = box.querySelector('svg');
  svg.setAttribute('viewBox', `0 0 ${lay.W} ${lay.H}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.innerHTML = lay.paths.map(d => `<path d="${d}" class="ln"/>`).join('') + (lay.dashes || []).map(d => `<path d="${d}" class="ln dash"/>`).join('');
  return lay.rootX;
}

/* ---------- reporting lines as a flowchart: arrows from every seat to the seat it reports to, founders at the end ---------- */
const REP_GAP = 64, REP_AIR = 12;
function renderChart(box) {
  const C = data.chart;
  const nodes = C.nodes;
  box.innerHTML = `<svg aria-hidden="true"></svg>` + nodes.map(n => {
    const person = !!P[n.id];
    const cls = `node${n.open ? ' open' : ''}${person ? '' : ' plain'}`;
    const inner = `<span class="n">${esc(n.title)}</span>${n.line ? `<span class="r">${esc(n.line)}</span>` : ''}`;
    return person ? `<button type="button" class="${cls}" data-id="${n.id}" data-person="${n.id}">${inner}</button>` : `<div class="${cls}" data-id="${n.id}">${inner}</div>`;
  }).join('');
  const els = Object.fromEntries([...box.querySelectorAll('.node')].map(e => [e.dataset.id, e]));
  const parentOf = {};
  C.links.forEach(([a, b, kind]) => { if (kind !== 'dashed') parentOf[a] = b; });
  const level = id => parentOf[id] ? level(parentOf[id]) + 1 : 0;
  const maxL = Math.max(...nodes.map(n => level(n.id)));
  const rowH = Math.max(...Object.values(els).map(e => e.offsetHeight)) + REP_AIR;
  // rows: reporters first, a seat centred on the seats that report to it, a little air between founder trees
  const row = {}; let next = 0;
  const kidsOf = id => nodes.filter(n => parentOf[n.id] === id);
  function assign(id) { const ks = kidsOf(id); if (!ks.length) row[id] = next++; else { ks.forEach(k => assign(k.id)); row[id] = ks.reduce((a, k) => a + row[k.id], 0) / ks.length; } }
  nodes.filter(n => !parentOf[n.id]).forEach((r, i, arr) => { assign(r.id); if (i < arr.length - 1) next += 0.5; });
  const W = (maxL + 1) * NODE_W + maxL * REP_GAP, H = next * rowH;
  const rtl = document.dir === 'rtl';
  const X = id => (maxL - level(id)) * (NODE_W + REP_GAP);
  const fx = x => rtl ? W - x : x;
  const mid = id => row[id] * rowH + els[id].offsetHeight / 2;
  for (const n of nodes) { const e = els[n.id]; e.style.width = NODE_W + 'px'; e.style.left = (rtl ? W - X(n.id) - NODE_W : X(n.id)) + 'px'; e.style.top = row[n.id] * rowH + 'px'; }
  box.style.width = W + 'px'; box.style.height = H + 'px';
  const svg = box.querySelector('svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.innerHTML = defs('rep') + C.links.map(([a, b, kind]) => {
    const x1 = X(a) + NODE_W, x2 = X(b) - 4, xm = X(b) - REP_GAP / 2, y1 = mid(a), y2 = mid(b);
    const d = `M${fx(x1)} ${y1}H${fx(xm)}V${y2}H${fx(x2)}`;
    return `<path d="${d}" class="ln${kind === 'dashed' ? ' dash' : ''}" marker-end="url(#rep-arr)"/>`;
  }).join('');
}

/* ---------- role card ---------- */
function chip(id) { const p = P[id]; return p ? `<button type="button" class="chip${p.open ? ' open' : ''}" data-person="${id}">${esc(p.name)}</button>` : ''; }
function openPerson(id) {
  const p = P[id]; if (!p) return;
  closeSide();
  const reports = p.reportsTo ? chip(p.reportsTo) : `<p class="mute">${esc(ui('founder'))}</p>`;
  const manages = (p.manages || []).length ? p.manages.map(chip).join('') : `<p class="mute">${esc(ui('noReports'))}</p>`;
  const li = a => (a || []).map(x => `<li>${esc(x)}</li>`).join('');
  document.body.insertAdjacentHTML('beforeend', `<div class="side-scrim" id="side-scrim"></div>
  <aside class="side" id="side" role="dialog" aria-modal="true" aria-labelledby="side-name">
    <button type="button" class="btn-text close" id="side-close">${esc(ui('close'))}</button>
    <div class="d-org">${esc(p.org)}, ${esc(p.division)}</div>
    <h2 id="side-name">${esc(p.name)}</h2>
    <div class="d-title">${esc(p.title)}${p.target ? ', ' + esc(p.target) : ''}</div>
    <h4>${esc(ui('owns'))}</h4><ul>${li(p.owns)}</ul>
    <h4>${esc(ui('whereWhen'))}</h4><p>${esc(p.whereWhen || '')}</p>
    <h4>${esc(ui('contactFor'))}</h4><ul>${li(p.contactFor)}</ul>
    <h4>${esc(ui('reportsTo'))}</h4>${reports}
    <h4>${esc(ui('manages'))}</h4>${manages}
    <h4>${esc(ui('escalatesTo'))}</h4><p>${esc(p.escalateTo || '')}</p>
    ${p.note ? `<h4>${esc(ui('note'))}</h4><p>${esc(p.note)}</p>` : ''}
  </aside>`);
  document.body.classList.add('side-open');
  document.querySelectorAll('.org .node').forEach(n => n.classList.toggle('on', n.dataset.id === id));
  setHash(id);
  document.getElementById('side-close').focus();
}
function closeSide() {
  document.getElementById('side')?.remove();
  document.getElementById('side-scrim')?.remove();
  document.body.classList.remove('side-open');
  document.querySelectorAll('.org .node.on').forEach(n => n.classList.remove('on'));
}

/* ---------- page ---------- */
function render() {
  app.content.innerHTML = `
    <section id="trees">${data.trees.map((tr, i) => `<div class="org-title">${esc(tr.title)}</div><div class="org" data-tree="${i}"></div>`).join('')}
    </section>
    <section id="lines">
      <h2>${L('Reporting lines')}</h2>
      <p class="mute">${L('Every seat and the seat it reports to. The founders are at the end.')}</p>
      <div class="scroll-x"><div class="org chart" id="chart"></div></div>
    </section>
    <section id="everyone">
      <h2>${L('Everyone')}</h2>
      <div class="choices">${data.people.filter(p => !p.bucket && !p.open && !p.group).map(p => `<button type="button" data-person="${p.id}">${esc(p.name)}<small>${esc(p.title)}</small></button>`).join('')}</div>
    </section>`;
  layoutAll();
}
function layoutAll() {
  // every founder box lines up under the first tree's root
  let alignX = null;
  document.querySelectorAll('.org[data-tree]').forEach(box => { const rx = renderTree(data.trees[Number(box.dataset.tree)], box, alignX); if (alignX == null && rx != null) alignX = rx; });
  const chart = document.getElementById('chart');
  if (chart) renderChart(chart);
}

let raf = 0;
window.addEventListener('resize', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(layoutAll); });
document.addEventListener('click', e => {
  const b = e.target.closest('[data-person]'); if (b) { openPerson(b.dataset.person); return; }
  if (e.target.id === 'side-close' || e.target.id === 'side-scrim') closeSide();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSide(); });

render();
document.fonts?.ready.then(layoutAll);
const h0 = initialHash();
if (h0 && P[h0]) openPerson(h0);
