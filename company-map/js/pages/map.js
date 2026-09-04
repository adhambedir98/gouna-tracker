import { mount, loadJSON, t, esc, site, initialHash, setHash, labels } from '../app.js';
import { defs } from '../svg.js';
const L = await labels('map');

const app = await mount({
  page: 'map',
  title: L('Who does what'),
  wide: true
});
const data = await loadJSON('data/people.json');
const P = Object.fromEntries(data.people.map(p => [p.id, p]));
const ui = k => t(site.ui[k]);

/* ---------- layout constants ---------- */
const NODE_W = 132, GAP = 8, PAD = 10, BUCKET_GAP = 20, TITLE_H = 24, LEVEL = 36, SIB = 28, SUB_GAP = 30, INDENT = 26, VGAP = 10, BUS = 14, STACK_INDENT = 24, STACK_GAP = 10;

function nodeHTML(id, cls = '') {
  const p = P[id];
  return `<button type="button" class="node ${cls}${p.open ? ' open' : ''}${p.bucket ? ' bucket' : ''}" data-person="${p.id}" data-id="${p.id}"><span class="n">${esc(p.name)}</span><span class="r">${esc(p.title)}</span></button>`;
}

function collectIds(n, out = []) {
  out.push(n.id);
  (n.kids || []).forEach(k => collectIds(k, out));
  for (const g of n.groups || (n.group ? [n.group] : [])) { g.ids.forEach(id => out.push(id)); if (g.sub) out.push(g.sub); }
  return out;
}

/* ---------- wide layout: siblings side by side ---------- */
function layoutWide(root0, els, cw, alignX, sib = SIB) {
  const H = id => els[id].offsetHeight;
  let cols = 5, root, pos, groups, paths, dashes;

  // siblings side by side with one gap between subtrees; a dashed sibling sits lower, so it lands centred between its neighbours
  function arrange(n) {
    const xs = []; let x = 0;
    n.kids.forEach((k, i) => {
      if (i > 0) x += sib;
      xs.push(x); x += k.subW;
    });
    return { xs, total: x };
  }

  // the node's centre, measured from the left edge of its subtree
  function cOff(k) {
    if (k.stack) return k.w / 2;
    if (k.kids && k.kids.length) { const u = k.kids.findIndex(c => c.under); if (u >= 0) return arrange(k).xs[u] + (k.symL || 0) + cOff(k.kids[u]); }
    return k.subW / 2;
  }
  function size(n) {
    n.w = NODE_W; n.h = H(n.id);
    if (n.group && !n.groups) n.groups = [n.group];
    if (n.groups) {
      // one or more buckets side by side under the node
      for (const g of n.groups) {
        const c = Math.min(g.perRow || cols, g.ids.length); // perRow in the data pins the grid
        const rows = Math.ceil(g.ids.length / c);
        const rowH = Math.max(...g.ids.map(H));
        g.rowH = rowH; g.cols = c;
        g.w = c * NODE_W + (c - 1) * GAP + PAD * 2;
        g.h = PAD + TITLE_H + rows * rowH + (rows - 1) * GAP + (g.sub ? SUB_GAP + H(g.sub) : 0) + PAD;
      }
      n.groupsW = n.groups.reduce((s, g) => s + g.w, 0) + (n.groups.length - 1) * BUCKET_GAP;
      n.subW = Math.max(n.w, n.groupsW); n.subH = n.h + LEVEL + Math.max(...n.groups.map(g => g.h));
    } else if (n.kids && n.kids.length) {
      n.kids.forEach(size);
      if (n.stack) {
        n.subW = Math.max(n.w, NODE_W);
        n.subH = n.h + LEVEL + n.kids.reduce((s, k) => s + k.subH, 0) + (n.kids.length - 1) * STACK_GAP;
      } else {
        // one row of boxes, then everything below them starts on one shared level
        const { xs, total: tot } = arrange(n);
        n.kidsW = tot; n.symL = 0; n.symR = 0;
        const u = n.kids.findIndex(k => k.under);
        if (u >= 0) {
          const uc = xs[u] + cOff(n.kids[u]);
          const lc = u > 0 ? xs[u - 1] + cOff(n.kids[u - 1]) : null;
          const rc = u < n.kids.length - 1 ? xs[u + 1] + cOff(n.kids[u + 1]) : null;
          const dl = lc == null ? 0 : uc - lc, dr = rc == null ? 0 : rc - uc, D = Math.max(dl, dr);
          n.symL = lc == null ? 0 : D - dl; n.symR = rc == null ? 0 : D - dr;
          n.kidsW = tot + n.symL + n.symR;
        }
        n.rowH = Math.max(...n.kids.map(k => k.h));
        const below = Math.max(0, ...n.kids.map(k => k.subH - k.h));
        n.subW = Math.max(n.w, n.kidsW); n.subH = n.h + LEVEL + n.rowH + below;
      }
    } else { n.subW = n.w; n.subH = n.h; }
  }
  function place(n, x0, y, top) {
    n.x = x0 + (n.subW - n.w) / 2; n.y = y;
    pos[n.id] = { x: n.x, y: n.y, w: n.w, h: n.h };
    const cx = n.x + n.w / 2, by = n.y + n.h;
    const ct = top ?? (by + LEVEL); // where this node's children start
    if (n.groups) {
      const gy = ct;
      let gx = x0 + (n.subW - n.groupsW) / 2;
      const tops = [];
      for (const g of n.groups) {
        g.x = gx; tops.push(gx + g.w / 2); gx += g.w + BUCKET_GAP;
      }
      if (n.groups.length === 1) paths.push(`M${cx} ${by}V${gy}`);
      else {
        const busY = by + BUS;
        paths.push(`M${cx} ${by}V${busY}`, `M${Math.min(...tops, cx)} ${busY}H${Math.max(...tops, cx)}`);
        tops.forEach(tx => paths.push(`M${tx} ${busY}V${gy}`));
      }
      for (const g of n.groups) placeGroup(g, g.x, gy);
    } else placeRest(n, x0, y, top);
  }
  // a bucket: its title box, a grid of members, and an optional row under the grid
  function placeGroup(g, gx, gy) {
    groups.push({ x: gx, y: gy, w: g.w, h: g.h, title: g.title });
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
  }
  function placeRest(n, x0, y, top) {
    const cx = n.x + n.w / 2, by = n.y + n.h;
    const ct = top ?? (by + LEVEL);
    if (n.kids && n.kids.length && n.stack) {
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
      const un = n.kids.findIndex(k => k.under);
      n.kids.forEach((k, i) => {
        const dx = un >= 0 ? (i >= un ? n.symL : 0) + (i > un ? n.symR : 0) : 0;
        place(k, kx + xs[i] + dx, rowTop, nextTop);
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
      const u = n.kids.findIndex(k => k.under);
      const mid = u >= 0 ? centers[u] : (solid[0] + solid[solid.length - 1]) / 2;
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
  const wantX = alignX != null ? alignX : cw / 2;
  let left = Math.min(Math.max(wantX - rc, 0), Math.max(0, cw - root.subW));
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
    for (const g of n.groups || (n.group ? [n.group] : [])) {
      kids.push({ label: true, fn: () => {
        const lx = (depth + 1) * INDENT;
        labels.push({ x: lx, y, text: g.title });
        const ly = y; y += 22;
        const members = [...g.ids, ...(g.sub ? [g.sub] : [])];
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
  const lay = narrow ? layoutNarrow(structuredClone(tree.root), els, cw) : layoutWide(structuredClone(tree.root), els, cw, alignX, tree.sib || SIB);
  box.style.height = lay.H + 'px';
  box.classList.toggle('scrolls', lay.W > cw);
  box.querySelector('svg').style.width = lay.W + 'px';
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
  // the connectors are computed left to right; in Arabic the whole drawing is mirrored to match the boxes
  const lines = lay.paths.map(d => `<path d="${d}" class="ln"/>`).join('') + (lay.dashes || []).map(d => `<path d="${d}" class="ln dash"/>`).join('');
  svg.innerHTML = dirRtl ? `<g transform="translate(${lay.W} 0) scale(-1 1)">${lines}</g>` : lines;
  return lay.rootX;
}

/* ---------- reporting lines as a flowchart: arrows from every seat to the seat it reports to, founders at the end ---------- */
const REP_GAP = 64, REP_AIR = 12, REP_TITLE = 30;
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
  // reports in the order the links list them: the first one gets the straight arrow
  const kidsOf = id => C.links.filter(([k, p, kind]) => p === id && kind !== 'dashed').map(([k]) => nodes.find(n => n.id === k)).filter(Boolean);
  // a seat sits on the row of its first report, so that arrow is a straight line; the other reports join it through one vertical bus
  function assign(id) { const ks = kidsOf(id); if (!ks.length) row[id] = next++; else { ks.forEach(k => assign(k.id)); row[id] = row[ks[0].id]; } }
  const roots = nodes.filter(n => !parentOf[n.id]);
  const panels = [];
  roots.forEach((r, i) => { const from = next; next += REP_TITLE / rowH; assign(r.id); panels.push({ from, to: next, title: (data.trees[i] || {}).title || '' }); if (i < roots.length - 1) next += 0.6; });
  const W = (maxL + 1) * NODE_W + maxL * REP_GAP, H = next * rowH;
  const rtl = document.dir === 'rtl';
  const X = id => (maxL - level(id)) * (NODE_W + REP_GAP);
  const fx = x => rtl ? W - x : x;
  const mid = id => row[id] * rowH + rowH / 2;
  for (const n of nodes) { const e = els[n.id]; e.style.width = NODE_W + 'px'; e.style.left = (rtl ? W - X(n.id) - NODE_W : X(n.id)) + 'px'; e.style.top = (row[n.id] * rowH + (rowH - e.offsetHeight) / 2) + 'px'; }
  box.style.width = W + 'px'; box.style.height = (H + 10) + 'px';
  box.insertAdjacentHTML('afterbegin', panels.map(p => `<div class="rep-panel" style="top:${p.from * rowH - 8}px;height:${(p.to - p.from) * rowH + 14}px"><span class="gt">${esc(p.title)}</span></div>`).join(''));
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
// on a phone the reporting lines are a list: who reports to whom, tree by tree
function linesList() {
  const C = data.chart, N = Object.fromEntries(C.nodes.map(n => [n.id, n]));
  const parentOf = {}; C.links.forEach(([a, b]) => { parentOf[a] = b; });
  const roots = C.nodes.filter(n => !parentOf[n.id]);
  const name = id => { const n = N[id]; return n ? (n.line ? `${n.title} (${n.line})` : n.title) : id; };
  const walk = (id, depth, out) => { C.nodes.filter(n => parentOf[n.id] === id).forEach(k => { out.push(`<li style="padding-inline-start:${depth * 16}px">${esc(name(k.id))} <span class="mute">${L('reports to')}</span> ${esc(name(id))}</li>`); walk(k.id, depth + 1, out); }); return out; };
  return roots.map((r, i) => `<div class="card panel" style="margin-bottom:12px"><h3>${esc((data.trees[i] || {}).title || '')}</h3><ul class="plain">${walk(r.id, 0, []).join('')}</ul></div>`).join('');
}
const FIRST = ['adham', 'youssif', 'aly', 'moharam', 'mano', 'joe', 'ahmed-alaa', 'mazen'];
function orderPeople(list) { const rank = id => { const i = FIRST.indexOf(id); return i < 0 ? FIRST.length : i; }; return [...list].sort((a, b) => rank(a.id) - rank(b.id)); }
function render() {
  app.content.innerHTML = `
    <section id="trees">${data.trees.map((tr, i) => `<div class="org-title">${esc(tr.title)}</div><div class="org" data-tree="${i}"></div>`).join('')}
    </section>
    <hr class="sep">
    <section id="lines">
      <h2>${L('Reporting lines')}</h2>
      ${window.innerWidth < 640 ? linesList() : `<div class="scroll-x"><div class="org chart" id="chart"></div></div>`}
    </section>
    <section id="everyone">
      <h2>${L('Everyone')}</h2>
      <div class="choices">${orderPeople(data.people.filter(p => !p.bucket && !p.open && !p.group)).map(p => `<button type="button" data-person="${p.id}">${esc(p.name)}<small>${esc(p.title)}</small></button>`).join('')}</div>
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
