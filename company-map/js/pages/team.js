// The team: everyone who touches the operation, with their role, their site, and their phone. Management only.
// The forms draw their name lists from here. The site registry picks site leads and Portfolio Managers from here.
import { mount, esc, labels, store, toast, fmt, href } from '../app.js';
import { admin, gate, loading, failed, friendly, roleLabel, roleLabels, CODE } from '../online.js';

const L = await labels('team');
const app = await mount({ page: 'team', title: L('Team'), lede: L('Everyone who touches the operation: who they are, what they do, and where. The forms take their name lists from here.') });

let code = store.get(CODE, '');
let people = [];
let sites = [];
let filter = store.get('vm.team.filter', 'active');
let editing = null;   // an id, 'new', or null

const ROLE = roleLabel(L);
const ROLES = roleLabels(L);
const ORDER = ['management', 'portfolio-manager', 'site-lead', 'partner', 'planning', 'operator', 'runner', 'hub-attendant', 'quality-reviewer'];
const REPORTS = new Set(['management', 'portfolio-manager', 'site-lead', 'partner', 'planning']);
const TEAM = { direct: L('Direct'), partner: L('Partner') };
const FILTERS = { active: L('Active'), reports: L('On the forms'), field: L('Operators and runners'), off: L('Not active'), all: L('All') };
const keep = p => filter === 'all' ? true : filter === 'off' ? !p.active : !p.active ? false : filter === 'reports' ? REPORTS.has(p.role) : filter === 'field' ? ['operator', 'runner', 'hub-attendant', 'quality-reviewer'].includes(p.role) : true;
const ERR = { 'unknown person': L('That person is not on the list.') };

function open(c) { code = c; load(); }
async function load() {
  if (!code) return gate(app, L, open);
  loading(app, L);
  try {
    [people, sites] = await Promise.all([admin(code, 'people'), admin(code, 'sites')]);
    store.set(CODE, code);
    render();
  } catch (err) {
    if (err.message === 'wrong code') { store.remove(CODE); code = ''; return gate(app, L, open, L('That code is wrong.')); }
    failed(app, L, friendly(L, err.message), load);
  }
}

const sel = (id, label, options, value) => `<div class="ff"><label class="fl" for="e-${id}">${esc(label)}</label><select id="e-${id}" data-k="${id}">${options.map(([v, l]) => `<option value="${esc(v)}"${String(value ?? '') === String(v) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
const inp = (id, label, value, type = 'text', extra = '') => `<div class="ff"><label class="fl" for="e-${id}">${esc(label)}</label><input type="${type}" id="e-${id}" data-k="${id}" value="${esc(value ?? '')}" ${extra}></div>`;

function form(p) {
  const isNew = !p.id;
  const siteRows = sites.filter(s => s.status !== 'closed').sort((a, b) => a.team.localeCompare(b.team) || a.name.localeCompare(b.name));
  return `<form class="stdform card panel" id="person-form" autocomplete="off">
    <h3>${esc(isNew ? L('New person') : p.name)}</h3>
    <div class="fgrid">
      ${inp('name', L('Name'), p.name, 'text', 'required')}
      ${sel('role', L('Role'), ORDER.map(k => [k, ROLE[k]]), p.role || 'site-lead')}
      ${sel('team', L('Channel'), [['direct', TEAM.direct], ['partner', TEAM.partner]], p.team || 'direct')}
      ${sel('site_id', L('Site'), [['', L('No fixed site')], ...siteRows.map(s => [s.id, s.name])], p.site_id || '')}
      ${inp('phone', L('Phone'), p.phone, 'tel')}
      ${isNew ? '' : sel('active', L('Active'), [['true', L('Yes')], ['false', L('No, left or paused')]], String(p.active !== false))}
      <div class="ff"><label class="fl" for="e-notes">${esc(L('Notes'))}</label><textarea id="e-notes" data-k="notes" rows="2">${esc(p.notes || '')}</textarea></div>
    </div>
    <div class="btn-row"><button type="submit" class="btn primary">${esc(L('Save'))}</button><button type="button" class="btn" id="e-cancel">${esc(L('Cancel'))}</button></div>
  </form>`;
}

function render() {
  const rows = people.filter(keep).sort((a, b) => (b.active - a.active) || ORDER.indexOf(a.role) - ORDER.indexOf(b.role) || a.name.localeCompare(b.name));
  const active = people.filter(p => p.active);
  const n = r => active.filter(p => p.role === r).length;
  const chip = k => `<button type="button" class="chip${filter === k ? ' on' : ''}" data-filter="${k}">${esc(FILTERS[k])}</button>`;
  const cur = editing === 'new' ? {} : (editing ? people.find(p => p.id === editing) : null);
  app.content.innerHTML = `
    <div class="stat">
      <div><div class="big num">${fmt(n('portfolio-manager'))}</div><div class="lbl">${esc(ROLES['portfolio-manager'])}</div></div>
      <div><div class="big num">${fmt(n('site-lead'))}</div><div class="lbl">${esc(ROLES['site-lead'])}</div></div>
      <div><div class="big num">${fmt(n('partner'))}</div><div class="lbl">${esc(ROLES.partner)}</div></div>
      <div><div class="big num">${fmt(n('operator'))}</div><div class="lbl">${esc(ROLES.operator)}</div></div>
      <div><div class="big num">${fmt(active.length)}</div><div class="lbl">${esc(L('people in all'))}</div></div>
    </div>
    <div class="daybar no-print">
      <div class="chips" id="filters">${Object.keys(FILTERS).map(chip).join('')}</div>
      <span class="grow"></span>
      <button type="button" class="btn primary" id="add">${esc(L('Add a person'))}</button>
      <a class="btn" href="${href('sites')}">${esc(L('Site registry'))}</a>
      <a class="btn" href="${href('report/day')}">${esc(L('Company report'))}</a>
    </div>
    ${cur ? form(cur) : ''}
    <div class="t-wrap"><table class="t reg" id="team"><thead><tr><th>${esc(L('Name'))}</th><th>${esc(L('Role'))}</th><th>${esc(L('Channel'))}</th><th>${esc(L('Site'))}</th><th>${esc(L('Phone'))}</th><th>${esc(L('Notes'))}</th></tr></thead>
    <tbody>${rows.map(p => `<tr data-id="${esc(p.id)}"${p.id === editing ? ' class="on"' : ''}${p.active ? '' : ' data-off'}>
      <td><b>${esc(p.name)}</b>${p.active ? '' : `<span class="pill miss">${esc(L('not active'))}</span>`}</td>
      <td>${esc(ROLE[p.role] || p.role)}</td><td>${esc(TEAM[p.team] || p.team)}</td><td>${esc(p.site || '')}</td>
      <td>${esc(p.phone || '')}</td><td class="txt">${esc(String(p.notes || '').slice(0, 80))}</td></tr>`).join('') || `<tr><td colspan="6" class="mute">${esc(L('Nobody here yet.'))}</td></tr>`}</tbody></table></div>
    <p class="tiny dim">${esc(L('Click a row to edit it. Management, Portfolio Managers, site leads, partners, and the Planning and Logistics Lead appear in the name list on the forms. Someone who leaves is set to not active, never deleted: their reports keep their name.'))}</p>`;

  document.getElementById('filters').addEventListener('click', e => { const b = e.target.closest('[data-filter]'); if (!b) return; filter = b.dataset.filter; store.set('vm.team.filter', filter); render(); });
  document.getElementById('add').addEventListener('click', () => { editing = 'new'; render(); document.getElementById('e-name')?.focus(); });
  document.getElementById('team').addEventListener('click', e => { const tr = e.target.closest('tr[data-id]'); if (!tr) return; editing = tr.dataset.id; render(); document.getElementById('person-form')?.scrollIntoView({ block: 'start' }); });
  const f = document.getElementById('person-form');
  if (f) {
    document.getElementById('e-cancel').addEventListener('click', () => { editing = null; render(); });
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const p = {};
      f.querySelectorAll('[data-k]').forEach(el => { p[el.dataset.k] = el.value; });
      if (editing !== 'new') p.id = editing;
      const btn = f.querySelector('button[type=submit]'); btn.disabled = true;
      try { await admin(code, editing === 'new' ? 'person_add' : 'person_set', p); toast(L('Saved.')); editing = null; await load(); }
      catch (err) { toast(friendly(L, err.message, ERR)); btn.disabled = false; }
    });
  }
}

load();
