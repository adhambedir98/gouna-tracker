import { mount, loadJSON, esc, href, labels, initialHash, setHash } from '../app.js';
import { defs } from '../svg.js';

const L = await labels('channels');
const app = await mount({
  page: 'channels',
  title: L('How we work with sites')
});
const data = await loadJSON('data/channels.json');
const C = Object.fromEntries(data.channels.map(c => [c.id, c]));
const S = Object.fromEntries(data.steps.map(s => [s.id, s]));

/* ---------- state: one open step at a time ---------- */
let open = null;
const h0 = initialHash();
if (h0 && (S[h0] || C[h0])) open = h0;

/* ---------- the long flowchart: one step under another, two channels side by side, details on tap ---------- */
function detail(x) {
  return `<div class="sdetail" id="d-${esc(x.id)}">
    ${x.who ? `<p><b>${L('Who')}.</b> ${esc(x.who)}</p>` : ''}
    ${x.done ? `<p><b>${L('Done when')}.</b> ${esc(x.done)}</p>` : ''}
    <ul>${(x.lines || []).map(l => `<li>${esc(l)}</li>`).join('')}</ul>
  </div>`;
}
function node(x, n, cls = '') {
  const on = open === x.id;
  return `<button type="button" class="snode ${cls}${on ? ' on' : ''}" data-step="${esc(x.id)}" aria-expanded="${on}" aria-controls="d-${esc(x.id)}">${n ? `<span class="k">${n}</span>` : ''}<span class="n">${esc(x.title || x.name)}</span>${x.sub || x.who ? `<span class="r">${esc(x.sub || x.who)}</span>` : ''}</button>`;
}
function flowchart() {
  let n = 0, out = '';
  for (const ph of data.phases) {
    out += `<div class="sphase"><div><h2>${esc(ph.title)}</h2>${ph.sub ? `<p class="mute small">${esc(ph.sub)}</p>` : ''}</div></div>`;
    for (const st of data.steps.filter(s => s.phase === ph.id)) {
      n++;
      if (st.split) {
        const chosen = data.channels.find(c => c.id === open);
        out += `<div class="sstep split" data-row="${esc(st.id)}">
          <div class="slabel"><span class="k">${n}</span>${esc(st.title)}</div>
          <div class="ssplit">${data.channels.map(c => node(c)).join('')}</div>
          ${chosen ? detail(chosen) : ''}
        </div>`;
      } else {
        out += `<div class="sstep" data-row="${esc(st.id)}">${node(st, n, st.outcome ? 'outcome' : '')}${open === st.id ? detail(st) : ''}</div>`;
      }
    }
  }
  return `<div class="sflow" id="sflow"><svg class="spine" aria-hidden="true"></svg>${out}</div>`;
}

/* connectors, drawn from where the boxes actually are */
function drawSpine() {
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

/* ---------- the decision path ---------- */
let node_ = data.decision.start;
const Q = Object.fromEntries(data.decision.questions.map(q => [q.id, q]));
const O = Object.fromEntries(data.decision.outcomes.map(o => [o.id, o]));
let trail = [];
function decide() {
  const q = Q[node_], o = O[node_];
  const crumbs = trail.map(([qid, ans]) => `<li><span class="mute">${esc(Q[qid].q)}</span> <b>${ans === 'yes' ? L('Yes') : L('No')}</b></li>`).join('');
  return `<div class="card panel" id="decide-card">
    ${crumbs ? `<ul class="small" style="padding-inline-start:18px;margin-bottom:12px">${crumbs}</ul>` : ''}
    ${q ? `<h3>${esc(q.q)}</h3><div class="btn-row"><button type="button" class="btn primary" data-ans="yes">${L('Yes')}</button><button type="button" class="btn" data-ans="no">${L('No')}</button></div>` : ''}
    ${o ? `<h3 class="accent">${esc(o.name)}</h3><p>${esc(o.text)}</p>` : ''}
    ${trail.length ? `<div class="btn-row no-print"><button type="button" class="btn" id="restart">${L('Start over')}</button></div>` : ''}
  </div>`;
}

function render() {
  app.content.innerHTML = `
    <section id="flow" style="margin-top:0">
      ${flowchart()}
    </section>
    <section id="decide">
      <h2>${L('Which channel for a new site')}</h2>
      <div id="decide-wrap">${decide()}</div>
      <details class="print-only" open><summary><h3>${L('All the questions')}</h3></summary><div class="body">
        <ol>${data.decision.questions.map(q => `<li>${esc(q.q)} <span class="mute">${L('Yes')}: ${esc((O[q.yes] || Q[q.yes] || {}).name || L('next question'))}. ${L('No')}: ${esc((O[q.no] || Q[q.no] || {}).name || L('next question'))}.</span></li>`).join('')}</ol>
        <ul>${data.decision.outcomes.map(o => `<li><b>${esc(o.name)}.</b> ${esc(o.text)}</li>`).join('')}</ul>
      </div></details>
      <p class="small mute">${L('The terms every partner signs are on the {link} page.', { link: `<a href="${href('manual/channels')}">${L('channels and partners')}</a>` })}</p>
    </section>`;
  drawSpine();
}
render();

let raf = 0;
const redraw = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(drawSpine); };
window.addEventListener('resize', redraw);
window.addEventListener('beforeprint', drawSpine);
document.fonts?.ready.then(drawSpine);

document.addEventListener('click', e => {
  const sb = e.target.closest('[data-step]');
  if (sb) {
    const id = sb.dataset.step;
    open = open === id ? null : id;
    setHash(open || '');
    const flow = document.getElementById('flow');
    flow.innerHTML = flowchart();
    drawSpine();
    const d = open && document.getElementById('d-' + open);
    if (d && window.innerWidth < 1024) d.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return;
  }
  const a = e.target.closest('[data-ans]');
  if (a) { const q = Q[node_]; if (!q) return; trail.push([node_, a.dataset.ans]); node_ = q[a.dataset.ans]; document.getElementById('decide-wrap').innerHTML = decide(); return; }
  if (e.target.id === 'restart') { trail = []; node_ = data.decision.start; document.getElementById('decide-wrap').innerHTML = decide(); }
});
