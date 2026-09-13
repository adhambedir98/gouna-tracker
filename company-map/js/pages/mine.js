// My sites: the whole of one person's day and none of anybody else's. A portfolio manager sees the sites they hold the book for,
// a site lead sees theirs, a partner sees theirs. The database decides which those are; this page only draws them.
import { mount, esc, labels, fmt, href } from '../app.js';
import { rpc, loading, failed, friendly, clock } from '../online.js';
import { strip } from '../charts.js';

const L = await labels('mine');
const app = await mount({ page: 'mine', title: L('My sites'), lede: L('Where your sites stand today.') });

let d = null;

async function load() {
  loading(app, L);
  try { d = await rpc('dr_mine', {}); render(); }
  catch (err) { failed(app, L, friendly(L, err.message), load); }
}

const n = v => fmt(Number(v) || 0);
const has = v => v !== null && v !== undefined && v !== '';
const plural = (v, one, many) => (Number(v) === 1 ? L(one) : L(many, { n: fmt(v) }));

// what is not in yet, in one line, because that is the whole job of this page before the deadlines
function missing() {
  const sites = d.sites || [];
  const noMorning = sites.filter(s => !s.checkin);
  const noEvening = sites.filter(s => s.checkin && !s.report);
  const open = sites.reduce((a, s) => a + (Number(s.open_incidents) || 0), 0);
  const held = sites.reduce((a, s) => a + (Number(s.report && s.report.held) || 0), 0);
  const bits = [];
  if (noMorning.length) bits.push(plural(noMorning.length, 'one site with no morning check-in', '{n} sites with no morning check-in'));
  if (noEvening.length) bits.push(plural(noEvening.length, 'one site with no evening check-out', '{n} sites with no evening check-out'));
  if (held) bits.push(L('{n} hours still on the phones', { n: n(held) }));
  if (open) bits.push(plural(open, 'one open incident', '{n} open incidents'));
  if (!bits.length) return { text: L('Everything is in.'), good: true };
  return { text: bits.join(', ') + '.', good: false };
}

function card(s) {
  const c = s.checkin, r = s.report;
  const morning = c
    ? `<b>${esc(clock(L, c.at) || clock(L, c.sent))}</b>${c.late ? ` <span class="pill late">${esc(L('late'))}</span>` : ''}${c.ok ? '' : ` <span class="pill late">${esc(L('problem'))}</span>`}
       <span class="tiny mute" style="display:block">${esc(L('{n} phones, {p} present', { n: n(c.phones), p: n(c.present) }))}${c.note ? ' · ' + esc(c.note) : ''}</span>`
    : `<span class="pill miss">${esc(L('not in'))}</span><span class="tiny mute" style="display:block">${esc(L('due by {time}', { time: clock(L, d.checkin_deadline) }))}</span>`;
  const evening = r
    ? `<b>${esc(has(r.hours) ? L('{n} hours', { n: n(r.hours) }) : L('no hours yet'))}</b>${r.late ? ` <span class="pill late">${esc(L('late'))}</span>` : ''}
       <span class="tiny mute" style="display:block">${esc(has(r.held) ? L('{u} uploaded, {h} on the phones', { u: n(r.uploaded), h: n(r.held) }) : L('sent at {time}', { time: clock(L, r.sent) }))}</span>`
    : `<span class="pill miss">${esc(L('not in'))}</span><span class="tiny mute" style="display:block">${esc(L('due by {time}', { time: clock(L, d.deadline) }))}</span>`;
  return `<article class="card panel site-card">
    <h3>${esc(s.name)}${s.city ? ` <span class="tiny mute">${esc(s.city)}</span>` : ''}${Number(s.open_incidents) ? ` <span class="pill late">${esc(L('{n} open', { n: fmt(s.open_incidents) }))}</span>` : ''}</h3>
    <dl class="kv">
      <dt>${esc(L('Morning'))}</dt><dd>${morning}</dd>
      <dt>${esc(L('Evening'))}</dt><dd>${evening}</dd>
      <dt>${esc(L('Last 7 days'))}</dt><dd>${strip({ values: (s.week || []).map(v => Number(v) || 0), w: 90, h: 22, label: L('Last 7 days') })}</dd>
    </dl>
    <div class="btn-row">
      ${c ? '' : `<a class="btn primary" href="${href('report/checkin')}">${esc(L('Morning check-in'))}</a>`}
      ${c && !r ? `<a class="btn primary" href="${href('report')}">${esc(L('Evening check-out'))}</a>` : ''}
      <a class="btn" href="${href('report/incident')}">${esc(L('Incident report'))}</a>
    </div>
  </article>`;
}

function render() {
  const m = missing();
  app.content.innerHTML = `
    <p class="callout${m.good ? '' : ' late'}">${esc(m.text)} <span class="mute">${esc(L('It is {time} in Cairo.', { time: clock(L, d.now) }))}</span></p>
    ${(d.sites || []).length ? `<div class="cards">${(d.sites || []).map(card).join('')}</div>`
      : `<p class="mute">${esc(L('No sites are on your name yet. Management puts them there on the site database page.'))}</p>`}
    <div class="btn-row no-print"><button type="button" class="btn" id="refresh">${esc(L('Refresh'))}</button></div>`;
  document.getElementById('refresh').addEventListener('click', load);
}

load();
