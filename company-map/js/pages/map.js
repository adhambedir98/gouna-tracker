import { mount, loadJSON, t, esc, site, initialHash, setHash, labels } from '../app.js';
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
function layoutWide(root, els, cw) {
  const H = id => els[id].offsetHeight;
  const cols = cw >= 1100 ? 5 : 3;
  const pos = {}, groups = [], paths = [], dashes = [];

  function size(n) {
    n.w = NODE_W; n.h = H(n.id);
    if (n.group) {
      const g = n.group;
      const c = Math.min(cols, g.ids.length);
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
        const tot = n.kids.reduce((s, k) => s + k.subW, 0) + (n.kids.length - 1) * SIB;
        n.kidsW = tot;
        n.subW = Math.max(n.w, tot); n.subH = n.h + LEVEL + Math.max(...n.kids.map(k => k.subH));
      }
    } else { n.subW = n.w; n.subH = n.h; }
  }
  function place(n, x0, y) {
    n.x = x0 + (n.subW - n.w) / 2; n.y = y;
    pos[n.id] = { x: n.x, y: n.y, w: n.w, h: n.h };
    const cx = n.x + n.w / 2, by = n.y + n.h;
    if (n.group) {
      const g = n.group;
      const gx = x0 + (n.subW - g.w) / 2, gy = by + LEVEL;
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
      let ky = by + LEVEL, prevBottom = by;
      n.kids.forEach(k => { place(k, x0, ky); paths.push(`M${cxs} ${prevBottom}V${k.y}`); prevBottom = k.y + k.h; ky += k.subH + STACK_GAP; });
    } else if (n.kids && n.kids.length) {
      let kx = x0 + (n.subW - n.kidsW) / 2;
      const busY = by + BUS;
      const centers = [];
      n.kids.forEach(k => {
        place(k, kx, by + LEVEL);
        centers.push(k.x + k.w / 2);
        kx += k.subW + SIB;
      });
      // the parent sits over the middle of its children, not over the middle of the subtree
      const mid = (centers[0] + centers[centers.length - 1]) / 2;
      n.x = Math.min(Math.max(mid - n.w / 2, x0), x0 + n.subW - n.w); pos[n.id].x = n.x;
      const px = n.x + n.w / 2;
      // a dashed child hangs off its neighbours, not off the bus
      const solid = centers.filter((c, i) => !n.kids[i].dashed);
      paths.push(`M${px} ${by}V${busY}`);
      if (solid.length > 1) paths.push(`M${Math.min(...solid, px)} ${busY}H${Math.max(...solid, px)}`);
      solid.forEach(c => paths.push(`M${c} ${busY}V${by + LEVEL}`));
      n.kids.forEach((k, i) => {
        if (!k.dashed) return;
        const y = k.y + k.h / 2, prev = n.kids[i - 1], next = n.kids[i + 1];
        if (prev && next) { k.x = (prev.x + prev.w + next.x) / 2 - k.w / 2; pos[k.id].x = k.x; centers[i] = k.x + k.w / 2; }
        if (prev) dashes.push(`M${prev.x + prev.w} ${y}H${k.x}`);
        if (next) dashes.push(`M${k.x + k.w} ${y}H${next.x}`);
      });
    }
  }
  size(root);
  const left = Math.max(0, (cw - root.subW) / 2);
  place(root, left, 0);
  return { pos, groups, paths, dashes, W: Math.max(cw, root.subW), H: root.subH };
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

function renderTree(tree, box) {
  const ids = collectIds(tree.root);
  box.innerHTML = `<svg aria-hidden="true"></svg>` + ids.map(id => nodeHTML(id, id === tree.root.id ? 'founder' : '')).join('');
  const els = Object.fromEntries([...box.querySelectorAll('.node')].map(e => [e.dataset.id, e]));
  const cw = box.clientWidth;
  const narrow = cw < 640;
  box.classList.toggle('narrow', narrow);
  Object.values(els).forEach(e => { e.style.width = narrow ? '' : NODE_W + 'px'; e.style.visibility = 'hidden'; });
  const lay = narrow ? layoutNarrow(structuredClone(tree.root), els, cw) : layoutWide(structuredClone(tree.root), els, cw);
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
      <ul class="rows two">${data.lines.map(([b, s]) => `<li><b>${esc(b)}</b><span class="d">${esc(s)}</span></li>`).join('')}</ul>
    </section>
    <section id="everyone">
      <h2>${L('Everyone')}</h2>
      <div class="choices">${data.people.map(p => `<button type="button" data-person="${p.id}">${esc(p.name)}<small>${esc(p.title)}${p.target ? ', ' + esc(p.target) : ''}</small></button>`).join('')}</div>
    </section>`;
  layoutAll();
}
function layoutAll() {
  document.querySelectorAll('.org').forEach(box => renderTree(data.trees[Number(box.dataset.tree)], box));
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
