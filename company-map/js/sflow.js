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
  const rows = [...box.querySelectorAll('.sstep')].map(row => {
    const nodes = [...row.querySelectorAll('.snode')].map(rel);
    const d = row.querySelector('.sdetail');
    const bottom = d ? rel(d).y + rel(d).h : Math.max(...nodes.map(k => k.y + k.h));
    return { id: row.dataset.row, nodes, bottom };
  });
  let s = defs('sf');
  const arrow = 'marker-end="url(#sf-arr)"';
  for (let i = 0; i < rows.length - 1; i++) {
    const a = rows[i], b = rows[i + 1];
    const ay = a.bottom, by = b.nodes[0].y;
    const mid = ay + (by - ay) / 2;
    if (a.nodes.length === 1 && b.nodes.length === 1) {
      const x = a.nodes[0].x + a.nodes[0].w / 2;
      s += `<line x1="${x}" y1="${ay}" x2="${x}" y2="${by - 2}" class="ln" ${arrow}/>`;
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
