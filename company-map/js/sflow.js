// A long flowchart: one step under another, an optional two-way split, a detail card under the tapped step.
// Used by the sites page and the phone's day page. Data: { phases: [{id, title, sub}], steps: [{id, phase, title, who, done, lines, split, outcome}], channels: [...] }
import { esc } from './app.js';
import { defs } from './svg.js';

export function detailHTML(x, L) {
  return `<div class="sdetail" id="d-${esc(x.id)}">
    ${x.who ? `<p><b>${L('Who')}:</b> ${esc(x.who)}</p>` : ''}
    ${x.done ? `<p><b>${L('Done when')}:</b> ${esc(x.done)}</p>` : ''}
    <ul>${(x.lines || []).map(l => `<li>${esc(l)}</li>`).join('')}</ul>
  </div>`;
}
export function nodeHTML(x, n, open, cls = '') {
  const on = open === x.id;
  return `<button type="button" class="snode ${cls}${on ? ' on' : ''}" data-step="${esc(x.id)}" aria-expanded="${on}" aria-controls="d-${esc(x.id)}">${n ? `<span class="k">${n}</span>` : ''}<span class="n">${esc(x.title || x.name)}</span>${x.tag || x.sub || x.who ? `<span class="r">${esc(x.tag || x.sub || x.who)}</span>` : ''}</button>`;
}
export function flowchartHTML(data, open, L) {
  let n = 0, out = '';
  for (const ph of data.phases) {
    out += `<div class="sphase"><div><h2>${esc(ph.title)}</h2>${(ph.note ?? ph.sub) ? `<p class="mute small">${esc(ph.note ?? ph.sub)}</p>` : ''}</div></div>`;
    for (const st of data.steps.filter(s => s.phase === ph.id)) {
      if (st.aside) {
        // beside the chain, not a step in it
        out += `<div class="sstep aside" data-row="${esc(st.id)}" data-aside="1">${nodeHTML(st, 0, open, 'aside')}${open === st.id ? detailHTML(st, L) : ''}</div>`;
        continue;
      }
      n++;
      if (st.split) {
        const chosen = (data.channels || []).find(c => c.id === open);
        out += `<div class="sstep split" data-row="${esc(st.id)}">
          <div class="slabel"><span class="k">${n}</span>${esc(st.title)}</div>
          <div class="ssplit">${(data.channels || []).map(c => nodeHTML(c, 0, open)).join('')}</div>
          ${chosen ? detailHTML(chosen, L) : ''}
        </div>`;
      } else {
        out += `<div class="sstep" data-row="${esc(st.id)}">${nodeHTML(st, n, open, st.outcome ? 'outcome' : '')}${open === st.id ? detailHTML(st, L) : ''}</div>`;
      }
    }
  }
  return `<div class="sflow" id="sflow"><svg class="spine" aria-hidden="true"></svg>${out}</div>`;
}

// connectors, drawn from where the boxes actually are; call again after anything moves
export function drawSpine() {
  const box = document.getElementById('sflow'); if (!box) return;
  const svg = box.querySelector('svg.spine');
  const br = box.getBoundingClientRect();
  const W = br.width, H = br.height;
  svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const rel = el => { const r = el.getBoundingClientRect(); return { x: r.left - br.left, y: r.top - br.top, w: r.width, h: r.height }; };
  const all = [...box.querySelectorAll('.sstep')].map(row => {
    const nodes = [...row.querySelectorAll('.snode')].map(rel);
    const d = row.querySelector('.sdetail');
    const bottom = d ? rel(d).y + rel(d).h : Math.max(...nodes.map(k => k.y + k.h));
    const aside = !!row.dataset.aside, floating = aside && getComputedStyle(row).position === 'absolute';
    return { id: row.dataset.row, el: row, nodes, bottom, aside, floating };
  });
  // a floating aside sits beside the chain, level with the gap between its neighbours
  const rows = all.filter(r => !r.floating);
  let s = defs('sf');
  const arrow = 'marker-end="url(#sf-arr)"';
  all.forEach((r, i) => {
    if (!r.floating) return;
    const prev = all.slice(0, i).reverse().find(x => !x.floating), next = all.slice(i + 1).find(x => !x.floating);
    if (!prev || !next) return;
    const cn = prev.nodes[prev.nodes.length - 1];
    const rtl = getComputedStyle(box).direction === 'rtl';
    const h = r.el.offsetHeight, top = Math.max(prev.nodes[0].y, (prev.bottom + next.nodes[0].y) / 2 - h / 2);
    r.el.style.top = top + 'px';
    if (rtl) { r.el.style.right = (W - cn.x + 24) + 'px'; r.el.style.left = 'auto'; } else { r.el.style.left = (cn.x + cn.w + 24) + 'px'; r.el.style.right = 'auto'; }
    const x = cn.x + cn.w / 2, y = top + Math.min(h, r.nodes[0].h) / 2;
    const bx = rtl ? cn.x - 24 : cn.x + cn.w + 24;
    s += `<line x1="${x}" y1="${y}" x2="${bx}" y2="${y}" class="ln dash"/>`;
  });
  for (let i = 0; i < rows.length - 1; i++) {
    const a = rows[i], b = rows[i + 1];
    const ay = a.bottom, by = b.nodes[0].y;
    const mid = ay + (by - ay) / 2;
    const cls = a.aside || b.aside ? 'ln dash' : 'ln';
    if (a.nodes.length === 1 && b.nodes.length === 1) {
      const x = a.nodes[0].x + a.nodes[0].w / 2;
      s += `<line x1="${x}" y1="${ay}" x2="${x}" y2="${by - 2}" class="${cls}" ${arrow}/>`;
    } else if (a.nodes.length === 1) {
      const x = a.nodes[0].x + a.nodes[0].w / 2;
      const xs = b.nodes.map(k => k.x + k.w / 2);
      s += `<line x1="${x}" y1="${ay}" x2="${x}" y2="${mid}" class="ln"/>`;
      s += `<line x1="${Math.min(...xs)}" y1="${mid}" x2="${Math.max(...xs)}" y2="${mid}" class="ln"/>`;
      xs.forEach(bx => s += `<line x1="${bx}" y1="${mid}" x2="${bx}" y2="${by - 2}" class="ln" ${arrow}/>`);
    } else {
      const xs = a.nodes.map(k => k.x + k.w / 2);
      const x = b.nodes[0].x + b.nodes[0].w / 2;
      xs.forEach(ax => s += `<line x1="${ax}" y1="${ay}" x2="${ax}" y2="${mid}" class="ln"/>`);
      s += `<line x1="${Math.min(...xs)}" y1="${mid}" x2="${Math.max(...xs)}" y2="${mid}" class="ln"/>`;
      s += `<line x1="${x}" y1="${mid}" x2="${x}" y2="${by - 2}" class="ln" ${arrow}/>`;
    }
  }
  svg.innerHTML = s;
}

// wires a page: renders into `host`, keeps one card open, deep-links with the hash, redraws on resize
export function mountFlow({ host, data, L, initial, setHash }) {
  const S = Object.fromEntries(data.steps.map(s => [s.id, s]));
  const C = Object.fromEntries((data.channels || []).map(c => [c.id, c]));
  let open = initial && (S[initial] || C[initial]) ? initial : null;
  const paint = () => { host.innerHTML = flowchartHTML(data, open, L); drawSpine(); };
  paint();
  let raf = 0;
  const redraw = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(drawSpine); };
  window.addEventListener('resize', redraw);
  window.addEventListener('beforeprint', drawSpine);
  document.fonts?.ready.then(drawSpine);
  // a link elsewhere on the page can open a step by its hash
  window.addEventListener('hashchange', () => {
    const id = location.hash.slice(1);
    if (!(S[id] || C[id]) || id === open) return;
    open = id; paint();
    document.getElementById('d-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  document.addEventListener('click', e => {
    const sb = e.target.closest('[data-step]'); if (!sb || !host.contains(sb)) return;
    const id = sb.dataset.step;
    open = open === id ? null : id;
    if (setHash) setHash(open || '');
    paint();
    const d = open && document.getElementById('d-' + open);
    if (d && window.innerWidth < 1024) d.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  return { redraw: paint };
}
