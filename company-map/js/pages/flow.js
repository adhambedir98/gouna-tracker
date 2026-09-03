import { mount, loadJSON, t, esc, site, labels } from '../app.js';
const L = await labels('flow');

const app = await mount({
  page: 'flow',
  title: L('Opening and running a site'),
  lede: L('Eight stages. The first four open a site. The last four run it, starting with Day 0.')
});
const data = await loadJSON('data/flow.json');
const ui = k => t(site.ui[k]);
const loopOf = n => data.loops.find(l => l.a === n || l.b === n);

function stageHTML(s) {
  const loop = loopOf(s.n);
  return `<div class="stage${loop ? ' loop' : ''}" data-n="${s.n}" id="stage-${s.n}">
    <div class="dot" aria-hidden="true">${s.n}</div>
    <h3>${esc(s.title)}</h3>
    <div class="owner">${esc(s.owner)}</div>
    <p class="done">${esc(s.done)}</p>
    <details><summary data-open="" data-close=""><span>${esc(ui('whatHappens'))}</span></summary>
      <div class="body"><p>${esc(s.why)}</p><ul>${s.do.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div></details>
    ${loop && loop.a === s.n ? `<div class="pair">${esc(loop.text)}</div>` : ''}
  </div>`;
}

function render() {
  app.content.innerHTML = data.phases.map((ph, i) => `
    <div class="phase"><h2>${esc(ph.title)}</h2><p>${esc(ph.sub)}</p></div>
    <div class="flow" data-phase="${i}">
      <svg class="spine" aria-hidden="true"></svg>
      ${ph.stages.map(n => stageHTML(data.stages[n - 1])).join('')}
      ${i === data.phases.length - 1 && data.back ? `<div class="ret"><b>${esc(data.back.text.split('. ')[0])}.</b> ${esc(data.back.text.split('. ').slice(1).join('. '))}</div>` : ''}
    </div>`).join('');
  drawSpines();
}

function drawSpines() {
  document.querySelectorAll('.flow').forEach(flow => {
    const svg = flow.querySelector('svg.spine');
    const fr = flow.getBoundingClientRect();
    const W = fr.width, H = fr.height;
    svg.setAttribute('width', W); svg.setAttribute('height', H);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const dots = [...flow.querySelectorAll('.stage')].map(st => {
      const d = st.querySelector('.dot').getBoundingClientRect();
      return { n: Number(st.dataset.n), cx: d.left - fr.left + d.width / 2, cy: d.top - fr.top + d.height / 2, r: d.width / 2 };
    });
    if (!dots.length) return;
    const uid = `sp${flow.dataset.phase}`;
    let out = `<defs>
      <marker id="${uid}-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#1E4D3B"/></marker>
      <marker id="${uid}-g" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#A9A395"/></marker>
    </defs>`;
    const first = dots[0], last = dots[dots.length - 1];
    const ret = flow.querySelector('.ret');
    const endY = ret ? (ret.getBoundingClientRect().top - fr.top + 12) : last.cy;
    out += `<line x1="${first.cx}" y1="${first.cy + first.r}" x2="${last.cx}" y2="${endY}" class="ln"/>`;
    for (let i = 1; i < dots.length; i++) {
      const d = dots[i];
      out += `<line x1="${d.cx}" y1="${d.cy - d.r - 14}" x2="${d.cx}" y2="${d.cy - d.r - 2}" class="ln" marker-end="url(#${uid}-g)"/>`;
    }
    data.loops.forEach(l => {
      const a = dots.find(d => d.n === l.a), b = dots.find(d => d.n === l.b);
      if (!a || !b) return;
      const x = a.cx - a.r - 18;
      out += `<path d="M${a.cx - a.r - 3} ${a.cy}H${x}V${b.cy}H${b.cx - b.r - 3}" class="ln-acc" marker-start="url(#${uid}-a)" marker-end="url(#${uid}-a)"/>`;
    });
    if (ret && data.back) {
      const from = dots.find(d => d.n === data.back.from), to = dots.find(d => d.n === data.back.to);
      if (from && to) {
        const x = from.cx - from.r - 30;
        out += `<path d="M${from.cx} ${endY}V${endY}H${x}V${to.cy}H${to.cx - to.r - 3}" class="ln-acc dash" marker-end="url(#${uid}-a)"/>`;
      }
    }
    svg.innerHTML = out;
  });
}

let raf = 0;
const redraw = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(drawSpines); };
window.addEventListener('resize', redraw);
document.addEventListener('toggle', redraw, true);
window.addEventListener('beforeprint', drawSpines);
render();
document.fonts?.ready.then(drawSpines);
