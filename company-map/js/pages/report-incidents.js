// Incidents: everything filed on the incident form, open ones first. Management reads, closes, and reopens. Management only.
import { mount, esc, labels, store, toast, fmt, href } from '../app.js';
import { admin, gate, loading, failed, friendly, clock, dayLabel, shortDay, today, kindLabel, CODE } from '../online.js';

const L = await labels('report-incidents');
const app = await mount({ page: 'report/incidents', title: L('Incidents'), lede: L('Everything filed on the incident form. Open ones first. Close each one with a line on how it ended.') });

let code = store.get(CODE, '');
let rows = [];
let filter = store.get('vm.incidents.filter', 'open');
let openId = null;
const KIND = kindLabel(L);
const FILTERS = { open: L('Open'), week: L('This week'), all: L('The last two months') };
const ERR = { 'unknown incident': L('That incident is not on the list.') };

function open(c) { code = c; load(); }
async function load() {
  if (!code) return gate(app, L, open);
  loading(app, L);
  try {
    rows = await admin(code, 'incidents', { days: 60 });
    store.set(CODE, code);
    render();
  } catch (err) {
    if (err.message === 'wrong code') { store.remove(CODE); code = ''; return gate(app, L, open, L('That code is wrong.')); }
    failed(app, L, friendly(L, err.message), load);
  }
}

const keepBy = (f, i) => f === 'open' ? i.status === 'open' : f === 'week' ? i.day >= weekAgo() : true;
const keep = i => keepBy(filter, i);
function weekAgo() { const d = new Date(today() + 'T12:00:00'); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10); }
function monthStart() { return today().slice(0, 8) + '01'; }

function detail(i) {
  const line = (label, v) => v ? `<dt>${esc(label)}</dt><dd>${esc(v)}</dd>` : '';
  return `<section class="card panel" id="inc-detail">
    <h3>${esc(L('Incident {no}: {site}, {day}', { no: i.no, site: i.site || '', day: dayLabel(i.day) }))}${i.at ? ', ' + esc(clock(L, i.at)) : ''}</h3>
    <p class="mute small">${esc(L('{kind}. Filed by {who}{role} at {time}.', { kind: KIND[i.kind] || i.kind, who: i.reporter, role: i.role ? ', ' + i.role : '', time: i.sent_at ? clock(L, String(i.sent_at).slice(11)) : '' }))}${i.status === 'closed' ? ' ' + esc(L('Closed by {who} on {day}.', { who: i.closed_by || '', day: i.closed_at ? dayLabel(String(i.closed_at).slice(0, 10)) : '' })) : ''}</p>
    <dl class="notes">
      ${line(L('What happened'), i.what)}${line(L('People involved'), i.people)}${line(L('Phones involved'), i.phones)}
      ${line(L('What was done'), i.actions)}${line(L('Who was told'), i.told)}${line(L('What is needed now'), i.needs)}${line(L('How it ended'), i.resolution)}
    </dl>
    <form id="close-form" class="no-print" autocomplete="off">
      <div class="fgrid">
      <div class="ff"><label class="fl" for="c-res">${esc(i.status === 'open' ? L('How it ended, in one or two lines') : L('Change the closing note'))}</label><textarea id="c-res" rows="2">${esc(i.resolution || '')}</textarea></div>
      <div class="ff"><label class="fl" for="c-by">${esc(L('Your name'))}</label><input type="text" id="c-by" value="${esc(store.get('vm.report.by', ''))}"></div>
      </div>
      <div class="btn-row">${i.status === 'open' ? `<button type="submit" class="btn primary" data-status="closed">${esc(L('Close it'))}</button>` : `<button type="submit" class="btn" data-status="open">${esc(L('Reopen'))}</button><button type="submit" class="btn primary" data-status="">${esc(L('Save the note'))}</button>`}<button type="button" class="btn" id="c-cancel">${esc(L('Back to the list'))}</button></div>
    </form>
  </section>`;
}

function render() {
  const list = rows.filter(keep);
  const openRows = rows.filter(i => i.status === 'open');
  const cur = openId ? rows.find(i => i.id === openId) : null;
  const chip = k => `<button type="button" class="chip${filter === k ? ' on' : ''}" data-filter="${k}">${esc(FILTERS[k])} <span class="mute">${fmt(rows.filter(i => keepBy(k, i)).length)}</span></button>`;
  app.content.innerHTML = `
    <div class="stat">
      <div><div class="big num">${fmt(openRows.length)}</div><div class="lbl">${esc(L('open'))}</div></div>
      <div><div class="big num">${fmt(rows.filter(i => i.day >= weekAgo()).length)}</div><div class="lbl">${esc(L('filed this week'))}</div></div>
      <div><div class="big num">${fmt(rows.filter(i => i.day >= monthStart()).length)}</div><div class="lbl">${esc(L('filed this month'))}</div></div>
      <div><div class="big num">${fmt(rows.filter(i => i.day >= monthStart() && i.kind === 'injury').length)}</div><div class="lbl">${esc(L('injuries this month'))}</div></div>
    </div>
    <div class="daybar no-print">
      <div class="chips" id="filters">${Object.keys(FILTERS).map(chip).join('')}</div>
      <span class="grow"></span>
      <a class="btn primary" href="${href('report/incident')}">${esc(L('File an incident'))}</a>
      <button type="button" class="btn" data-print="#inc-list" data-print-title="${esc(L('Incidents'))}">${esc(L('Print or save a copy'))}</button>
    </div>
    ${cur ? detail(cur) : ''}
    <div id="inc-list"><div class="t-wrap"><table class="t reg" id="inc"><thead><tr><th class="num">${esc(L('No'))}</th><th>${esc(L('Day'))}</th><th>${esc(L('Site'))}</th><th>${esc(L('Kind'))}</th><th>${esc(L('What happened'))}</th><th>${esc(L('Filed by'))}</th><th>${esc(L('Status'))}</th></tr></thead>
    <tbody>${list.map(i => `<tr data-id="${esc(i.id)}"${i.id === openId ? ' class="on"' : ''}>
      <td class="num">${fmt(i.no)}</td><td>${esc(shortDay(i.day))}${i.at ? `<span class="tiny mute" style="display:block">${esc(clock(L, i.at))}</span>` : ''}</td><td><b>${esc(i.site || '')}</b></td>
      <td>${esc(KIND[i.kind] || i.kind)}</td><td class="txt">${esc(String(i.what || '').slice(0, 120))}</td><td>${esc(i.reporter)}</td>
      <td><span class="pill st-${i.status === 'open' ? 'open' : 'closed'}">${esc(i.status === 'open' ? L('open') : L('closed'))}</span></td></tr>`).join('') || `<tr><td colspan="7" class="mute">${esc(filter === 'open' ? L('Nothing open.') : L('Nothing here.'))}</td></tr>`}</tbody></table></div></div>
    <p class="tiny dim">${esc(L('Click a row to read it and close it. An incident on an evening check-out with no form behind it shows on the company report until the form is filed.'))}</p>`;

  document.getElementById('filters').addEventListener('click', e => { const b = e.target.closest('[data-filter]'); if (!b) return; filter = b.dataset.filter; store.set('vm.incidents.filter', filter); render(); });
  document.getElementById('inc').addEventListener('click', e => { const tr = e.target.closest('tr[data-id]'); if (!tr) return; openId = tr.dataset.id === openId ? null : tr.dataset.id; render(); document.getElementById('inc-detail')?.scrollIntoView({ block: 'start' }); });
  const f = document.getElementById('close-form');
  if (f) {
    document.getElementById('c-cancel').addEventListener('click', () => { openId = null; render(); });
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const status = e.submitter ? e.submitter.dataset.status : '';
      const by = document.getElementById('c-by').value.trim();
      store.set('vm.report.by', by);
      const p = { id: openId, resolution: document.getElementById('c-res').value, by };
      if (status) p.status = status;
      try { await admin(code, 'incident_set', p); toast(L('Saved.')); await load(); }
      catch (err) { toast(friendly(L, err.message, ERR)); }
    });
  }
}

load();
