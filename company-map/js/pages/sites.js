// The site registry: every site we run, every site we could film with, and where each one stands. Management only.
// The daily report form lists the active ones. Portfolio Managers add the sites they find for their book.
import { mount, loadJSON, esc, labels, store, toast, fmt, href } from '../app.js';

const L = await labels('sites');
const cfg = await loadJSON('data/report.json');
const app = await mount({ page: 'sites', title: L('Site registry'), lede: L('Every site we run, every site we could film with, and where each one stands. Keep it current: it is the list the daily report form uses.') });

const CODE = 'vm.report.code';
let code = store.get(CODE, '');
let sites = [];
let filter = store.get('vm.sites.filter', 'open');
let editing = null;   // the id being edited, 'new' for a new site, null for none

const STATUS = { prospect: L('Prospect'), contacted: L('Contacted'), agreed: L('Agreed'), ready: L('Ready to film'), active: L('Active'), paused: L('Paused'), closed: L('Closed') };
const ORDER = ['active', 'ready', 'agreed', 'contacted', 'prospect', 'paused', 'closed'];
const FILTERS = { open: ['active', 'ready', 'agreed', 'contacted', 'prospect'], active: ['active'], ready: ['ready', 'agreed'], talks: ['contacted', 'prospect'], off: ['paused', 'closed'], all: ORDER };
const FILTER_LABEL = { open: L('Open'), active: L('Active'), ready: L('Ready or agreed'), talks: L('In talks'), off: L('Paused or closed'), all: L('All') };
const TEAM = { direct: L('Our site'), partner: L('Partner site') };
const AREA = { central: L('Central'), east: L('East'), west: L('West') };

const H = { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key, 'Content-Type': 'application/json' };
async function rpc(fn, body) {
  const r = await fetch(`${cfg.url}/rest/v1/rpc/${fn}`, { method: 'POST', headers: H, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || j.hint || r.statusText || 'error');
  return j;
}
const admin = (action, p = {}) => rpc('dr_admin', { p_code: code, p_action: action, p });
function friendly(msg) {
  msg = String(msg || '');
  if (msg === 'wrong code') return L('That code is wrong.');
  if (msg === 'name is missing') return L('Write the site name.');
  if (msg === 'unknown site') return L('That site is not on the list.');
  if (msg.startsWith('not a number')) return L('That is not a number.');
  if (/duplicate|unique/i.test(msg)) return L('A site with that name is already on the list.');
  if (/fetch|network|load/i.test(msg)) return L('No connection. Try again when you have internet.');
  return msg;
}

function gate(msg) {
  app.content.innerHTML = `<form class="gate" id="gate">
    ${msg ? `<p class="callout late">${esc(msg)}</p>` : ''}
    <div class="ff"><label class="fl" for="g-code">${esc(L('Management code'))}</label><input type="password" id="g-code" autocomplete="current-password" required></div>
    <div class="btn-row"><button type="submit" class="btn primary">${esc(L('Open'))}</button></div>
  </form>`;
  document.getElementById('gate').addEventListener('submit', e => { e.preventDefault(); code = document.getElementById('g-code').value.trim(); load(); });
}

async function load() {
  if (!code) return gate();
  app.content.innerHTML = `<p class="mute">${esc(L('Loading'))}</p>`;
  try {
    sites = await admin('sites');
    store.set(CODE, code);
    render();
  } catch (err) {
    if (err.message === 'wrong code') { store.remove(CODE); code = ''; return gate(L('That code is wrong.')); }
    app.content.innerHTML = `<p class="callout late">${esc(friendly(err.message))}</p><div class="btn-row"><button type="button" class="btn primary" id="retry">${esc(L('Try again'))}</button></div>`;
    document.getElementById('retry').addEventListener('click', load);
  }
}

const sel = (id, label, options, value, extra = '') => `<div class="ff"><label class="fl" for="e-${id}">${esc(label)}</label><select id="e-${id}" data-k="${id}" ${extra}>${options.map(([v, l]) => `<option value="${esc(v)}"${String(value ?? '') === String(v) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
const inp = (id, label, value, type = 'text', extra = '') => `<div class="ff"><label class="fl" for="e-${id}">${esc(label)}</label><input type="${type}" id="e-${id}" data-k="${id}" value="${esc(value ?? '')}" ${extra}></div>`;

function form(s) {
  const isNew = !s.id;
  return `<form class="stdform card panel" id="site-form" autocomplete="off">
    <h3>${esc(isNew ? L('New site') : s.name)}</h3>
    <div class="fgrid">
      ${inp('name', L('Site name'), s.name, 'text', 'required')}
      ${sel('status', L('Status'), ORDER.map(k => [k, STATUS[k]]), s.status || (isNew ? 'prospect' : 'active'))}
      ${sel('team', L('Channel'), [['direct', TEAM.direct], ['partner', TEAM.partner]], s.team || 'direct')}
      ${sel('area', L('Hub area'), [['', L('Not set')], ['central', AREA.central], ['east', AREA.east], ['west', AREA.west]], s.area || '')}
      ${inp('city', L('City'), s.city)}
      ${inp('industry', L('Industry'), s.industry)}
      ${inp('book', L('Book'), s.book, 'text', `placeholder="${esc(L('The Portfolio Manager, or the partner'))}"`)}
      ${inp('lead', L('Site lead'), s.lead)}
      ${inp('contact_name', L('Contact at the site'), s.contact_name)}
      ${inp('contact_phone', L('Contact phone'), s.contact_phone, 'tel')}
      ${inp('phones_capacity', L('Phones it can take'), s.phones_capacity, 'number', 'min="0" step="1" inputmode="numeric"')}
      ${inp('source', L('How we found it'), s.source, 'text', `placeholder="${esc(L('Referral, walk-in, a Portfolio Manager, a partner'))}"`)}
      ${inp('last_touch', L('Last contact'), s.last_touch, 'date')}
      <div class="ff"><label class="fl" for="e-notes">${esc(L('Notes'))}</label><textarea id="e-notes" data-k="notes" rows="3">${esc(s.notes || '')}</textarea></div>
    </div>
    <div class="btn-row"><button type="submit" class="btn primary">${esc(L('Save'))}</button><button type="button" class="btn" id="e-cancel">${esc(L('Cancel'))}</button></div>
  </form>`;
}

function render() {
  const keep = FILTERS[filter] || FILTERS.open;
  const rows = sites.filter(s => keep.includes(s.status)).sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || a.team.localeCompare(b.team) || (a.sort - b.sort) || a.name.localeCompare(b.name));
  const count = k => sites.filter(s => s.status === k).length;
  const cap = k => sites.filter(s => s.status === k).reduce((a, s) => a + (Number(s.phones_capacity) || 0), 0);
  const chip = k => `<button type="button" class="chip${filter === k ? ' on' : ''}" data-filter="${k}">${esc(FILTER_LABEL[k])} <span class="mute">${fmt(sites.filter(s => FILTERS[k].includes(s.status)).length)}</span></button>`;
  const cur = editing === 'new' ? {} : (editing ? sites.find(s => s.id === editing) : null);
  app.content.innerHTML = `
    <div class="stat">
      <div><div class="big num">${fmt(count('active'))}</div><div class="lbl">${esc(L('active sites, {n} phones', { n: fmt(cap('active')) }))}</div></div>
      <div><div class="big num">${fmt(count('ready') + count('agreed'))}</div><div class="lbl">${esc(L('ready or agreed, {n} phones', { n: fmt(cap('ready') + cap('agreed')) }))}</div></div>
      <div><div class="big num">${fmt(count('contacted') + count('prospect'))}</div><div class="lbl">${esc(L('in talks'))}</div></div>
      <div><div class="big num">${fmt(count('paused') + count('closed'))}</div><div class="lbl">${esc(L('paused or closed'))}</div></div>
    </div>
    <div class="daybar no-print">
      <div class="chips" id="filters">${Object.keys(FILTERS).map(chip).join('')}</div>
      <span class="grow"></span>
      <button type="button" class="btn primary" id="add">${esc(L('Add a site'))}</button>
      <a class="btn" href="${href('report/day')}">${esc(L('Company report'))}</a>
    </div>
    ${cur ? form(cur) : ''}
    <div class="t-wrap"><table class="t reg" id="reg"><thead><tr><th>${esc(L('Site'))}</th><th>${esc(L('Status'))}</th><th>${esc(L('Channel'))}</th><th>${esc(L('Area'))}</th><th>${esc(L('City'))}</th><th>${esc(L('Industry'))}</th><th>${esc(L('Book'))}</th><th>${esc(L('Contact'))}</th><th class="num">${esc(L('Phones'))}</th><th>${esc(L('Last contact'))}</th></tr></thead>
    <tbody>${rows.map(s => `<tr data-id="${esc(s.id)}"${s.id === editing ? ' class="on"' : ''}>
      <td><b>${esc(s.name)}</b>${s.notes ? `<span class="tiny mute" style="display:block">${esc(String(s.notes).slice(0, 80))}</span>` : ''}</td>
      <td><span class="pill st-${esc(s.status)}">${esc(STATUS[s.status] || s.status)}</span></td>
      <td>${esc(TEAM[s.team] || s.team)}</td><td>${esc(AREA[s.area] || '')}</td><td>${esc(s.city || '')}</td><td>${esc(s.industry || '')}</td>
      <td>${esc(s.book || s.lead || '')}</td><td>${esc([s.contact_name, s.contact_phone].filter(Boolean).join(', '))}</td>
      <td class="num">${s.phones_capacity == null ? '' : fmt(s.phones_capacity)}</td><td>${esc(s.last_touch || '')}</td></tr>`).join('') || `<tr><td colspan="10" class="mute">${esc(L('Nothing here yet.'))}</td></tr>`}</tbody></table></div>
    <p class="tiny dim">${esc(L('Click a row to edit it. Status: prospect (we know of it), contacted (we talked), agreed (they said yes), ready to film (gear and papers done), active (recording), paused, closed.'))}</p>`;

  document.getElementById('filters').addEventListener('click', e => { const b = e.target.closest('[data-filter]'); if (!b) return; filter = b.dataset.filter; store.set('vm.sites.filter', filter); render(); });
  document.getElementById('add').addEventListener('click', () => { editing = 'new'; render(); document.getElementById('e-name')?.focus(); });
  document.getElementById('reg').addEventListener('click', e => { const tr = e.target.closest('tr[data-id]'); if (!tr) return; editing = tr.dataset.id; render(); document.getElementById('site-form')?.scrollIntoView({ block: 'start' }); });
  const f = document.getElementById('site-form');
  if (f) {
    document.getElementById('e-cancel').addEventListener('click', () => { editing = null; render(); });
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const p = {};
      f.querySelectorAll('[data-k]').forEach(el => { p[el.dataset.k] = el.value; });
      if (editing !== 'new') p.id = editing;
      const btn = f.querySelector('button[type=submit]'); btn.disabled = true;
      try { await admin(editing === 'new' ? 'site_add' : 'site_set', p); toast(L('Saved.')); editing = null; await load(); }
      catch (err) { toast(friendly(err.message)); btn.disabled = false; }
    });
  }
}

load();
