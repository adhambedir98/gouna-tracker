import { mount, loadJSON, esc, fmt, href, labels } from '../app.js';
import { blocks, MANUAL_TOC } from '../manual-blocks.js';
import { svg, rect, text, line, circle, figure } from '../svg.js';
const L = await labels('manual-people');

const m = await loadJSON('data/manual/people.json');
const app = await mount({
  page: 'manual-people',
  title: { en: m.title },
  lede: { en: m.purpose },
  toc: [{ id: 'ratios', label: L('Ratios') }, { id: 'pipeline', label: L('Hiring') }, { id: 'dayone', label: L('Day one') }, { id: 'attendance', label: L('Attendance') }, { id: 'deputies', label: L('Deputies') }, ...MANUAL_TOC]
});

/* ---------- ratios as a tally ---------- */
function ratios() {
  const W = 360;
  const sq = 10, g = 3, cap = 234, gx = 348;
  const person = (x, y, outline = false) => circle(x, y, 4, outline ? 'dot-o' : 'dot') + line(x, y + 4, x, y + 15, outline ? 'ln-acc' : 'ln-ink') + line(x, y + 15, x - 4, y + 22, outline ? 'ln-acc' : 'ln-ink') + line(x, y + 15, x + 4, y + 22, outline ? 'ln-acc' : 'ln-ink');
  let s = '';
  // 10 phones, one anchor
  s += text(0, 14, L('10 phones'), { cls: 'tx tx-b' });
  for (let k = 0; k < 10; k++) s += rect(96 + k * (sq + g), 4, sq, sq, 'bx-acc');
  s += text(cap, 14, L('one anchor'), { cls: 'tx tx-m tx-s' });
  s += person(gx, 6);
  // 50 phones, five anchors, one supervisor
  s += text(0, 52, L('50 phones'), { cls: 'tx tx-b' });
  for (let r = 0; r < 5; r++) for (let k = 0; k < 10; k++) s += rect(96 + k * (sq + g), 40 + r * (sq + g), sq, sq, 'bx-acc');
  s += text(cap, 52, L('five anchors'), { cls: 'tx tx-m tx-s' });
  for (let k = 0; k < 5; k++) s += person(gx - 6 + (k % 2) * 13, 44 + Math.floor(k / 2) * 26);
  s += text(cap, 130, L('one supervisor'), { cls: 'tx tx-m tx-s' });
  s += person(gx, 122);
  s += circle(gx, 126, 8, 'ring-acc');
  // the bench
  s += text(0, 176, L('10 people'), { cls: 'tx tx-b' });
  for (let k = 0; k < 10; k++) s += person(100 + k * 13, 168);
  s += text(cap, 176, L('one on the bench'), { cls: 'tx tx-m tx-s' });
  s += person(gx, 168, true);
  s += text(0, 212, L('Same idea as the 10% spare pool of phones.'), { cls: 'tx tx-d tx-s' });
  return figure(svg({ w: W, h: 220, label: L('One anchor per ten phones, one supervisor per fifty, a ten percent bench'), inner: s }), { cls: 'narrow' });
}

function render() {
  app.content.innerHTML = `
    <section id="ratios">
      <h2>${L('Ratios')}</h2>
      ${ratios()}
      <ul class="rows">${m.ratios.map(r => `<li><b>${esc(r.what)}. ${esc(r.rule)}</b><span class="d">${esc(r.why)}</span></li>`).join('')}</ul>
      <div class="stat">${[[300, 'phones'], [30, 'anchors'], [6, 'supervisors'], [5, 'reviewers']].map(([n, l]) => `<div><div class="big">${fmt(n)}</div><div class="lbl">${L(l)}</div></div>`).join('')}</div>
      <p class="mute small">${L('Per 1,000 hours a day. The capacity calculator on the control page scales it.')}</p>
    </section>
    <section id="pipeline">
      <h2>${L('Hiring, through Mano')}</h2>
      <ol class="steps">${m.pipeline.map((p, i) => `<li><span class="n">${i + 1}</span><b>${esc(p.stage)}</b><span class="who">${esc(p.owner)}</span><div class="d">${esc(p.text)}</div></li>`).join('')}</ol>
    </section>
    <section id="dayone">
      <h2>${L('Day one, per role')}</h2>
      <div class="cards two">${m.dayOne.map(d => `<div class="card"><h3>${esc(d.role)}</h3><p class="accent small">${esc(d.length)}. ${esc(d.trainer)}.</p><p class="small mute">${d.topics.map(esc).join(L(', '))}.</p></div>`).join('')}</div>
      <p class="small mute">${L('Every module has a checklist and a sign-off line on the {link}.', { link: `<a href="${href('training')}">${L('training page')}</a>` })}</p>
    </section>
    <section id="attendance">
      <h2>${L('Attendance')}</h2>
      <div class="rule-band">
        <div><b>${esc(m.attendance.rule)}</b></div>
        <div><b>${esc(m.attendance.backup)}</b></div>
        <div><b>${esc(m.attendance.noShow)}</b></div>
      </div>
      <h3 style="margin-top:24px">${L('Housing, a bridge')}</h3>
      <div class="callout"><p>${esc(m.housing.what)}</p><p class="mute">${L('Ends:')} ${esc(m.housing.ends)}</p></div>
    </section>
    <section id="deputies">
      <h2>${L('Every seat has a deputy')}</h2>
      <div class="t-wrap"><table class="t"><thead><tr><th>${L('Seat')}</th><th>${L('Deputy')}</th></tr></thead><tbody>${m.deputies.map(d => `<tr><td><b>${esc(d.role)}</b></td><td>${esc(d.deputy)}</td></tr>`).join('')}</tbody></table></div>
    </section>
    ${blocks(m)}`;
}
render();
