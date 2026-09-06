// The site registry: every site we run, every site we could film with, and where each one stands. Management only.
// The forms list the active ones. Portfolio Managers add the sites they find for their book. Each site shows its own history.
import { mount, esc, labels, store, toast, fmt, href } from '../app.js';
import { admin as adminCall, gate, loading, failed, friendly, clock, shortDay, kindLabel, CODE } from '../online.js';

const L = await labels('sites');
const app = await mount({ page: 'sites', title: L('Site registry'), lede: L('Every site we run, every site we could film with, and where each one stands. Keep it current: it is the list the forms use.') });

let code = store.get(CODE, '');
let sites = [];
let people = [];
let filter = store.get('vm.sites.filter', 'open');
let editing = null;   // the id being edited, 'new' for a new site, null for none
let history = null;   // the history of the site being edited
const admin = (action, p = {}) => adminCall(code, action, p);

const STATUS = { prospect: L('Prospect'), contacted: L('Contacted'), agreed: L('Agreed'), ready: L('Ready to film'), active: L('Active'), paused: L('Paused'), closed: L('Closed') };
const ORDER = ['active', 'ready', 'agreed', 'contacted', 'prospect', 'paused', 'closed'];
const FILTERS = { open: ['active', 'ready', 'agreed', 'contacted', 'prospect'], active: ['active'], ready: ['ready', 'agreed'], talks: ['contacted', 'prospect'], off: ['paused', 'closed'], all: ORDER };
const FILTER_LABEL = { open: L('Open'), active: L('Active'), ready: L('Ready or agreed'), talks: L('In talks'), off: L('Paused or closed'), all: L('All') };
const TEAM = { direct: L('Our site'), partner: L('Partner site') };
const AREA = { central: L('Central'), east: L('East'), west: L('West') };
const KIND = kindLabel(L);
const ERR = { 'name is missing': L('Write the site name.'), 'unknown site': L('That site is not on the list.'), 'duplicate': L('A site with that name is already on the list.') };
const n = v => fmt(v ?? 0);

function open(c) { code = c; load(); }
async function load() {
  if (!code) return gate(app, L, open);
  loading(app, L);
  try {
    [sites, people] = await Promise.all([admin('sites'), admin('people')]);
    store.set(CODE, code);
    render();
  } catch (err) {
    if (err.message === 'wrong code') { store.remove(CODE); code = ''; return gate(app, L, open, L('That code is wrong.')); }
    failed(app, L, friendly(L, err.message), load);
  }
}

const sel = (id, label, options, value, hint = '') => `<div class="ff"><label class="fl" for="e-${id}">${esc(label)}${hint ? `<small>${esc(hint)}</small>` : ''}</label><select id="e-${id}" data-k="${id}">${options.map(([v, l]) => `<option value="${esc(v)}"${String(value ?? '') === String(v) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
const inp = (id, label, value, type = 'text', extra = '') => `<div class="ff"><label class="fl" for="e-${id}">${esc(label)}</label><input type="${type}" id="e-${id}" data-k="${id}" value="${esc(value ?? '')}" ${extra}></div>`;
const peopleOf = roles => people.filter(p => p.active && roles.includes(p.role)).map(p => [p.id, p.name]);

function form(s) {
  const isNew = !s.id;
  const leads = peopleOf(['site-lead', 'partner', 'portfolio-manager']);
  const pms = peopleOf(['portfolio-manager', 'partner', 'management']);
  return `<form class="stdform card panel" id="site-form" autocomplete="off">
    <h3>${esc(isNew ? L('New site') : s.name)}</h3>
    <div class="fgrid">
      ${inp('name', L('Site name'), s.name, 'text', 'required')}
      ${sel('status', L('Status'), ORDER.map(k => [k, STATUS[k]]), s.status || (isNew ? 'prospect' : 'active'))}
      ${sel('team', L('Channel'), [['direct', TEAM.direct], ['partner', TEAM.partner]], s.team || 'direct')}
      ${sel('area', L('Hub area'), [['', L('Not set')], ['central', AREA.central], ['east', AREA.east], ['west', AREA.west]], s.area || '')}
      ${inp('city', L('City'), s.city)}
      ${inp('industry', L('Industry'), s.industry)}
      ${sel('pm_id', L('Book'), [['', L('Not set')], ...pms], s.pm_id || '', L('The Portfolio Manager, or the partner. Add people on the team page.'))}
      ${sel('lead_id', L('Site lead'), [['', L('Not set')], ...leads], s.lead_id || '')}
      ${inp('contact_name', L('Contact at the site'), s.contact_name)}
      ${inp('contact_phone', L('Contact phone'), s.contact_phone, 'tel')}
      ${inp('phones_capacity', L('Phones it can take'), s.phones_capacity, 'number', 'min="0" step="1" inputmode="numeric"')}
      ${inp('source', L('How we found it'), s.source, 'text', `placeholder="${esc(L('Referral, walk-in, a Portfolio Manager, a partner'))}"`)}
      ${inp('last_touch', L('Last contact'), s.last_touch, 'date')}
      <div class="ff"><label class="fl" for="e-notes">${esc(L('Notes'))}</label><textarea id="e-notes" data-k="notes" rows="3">${esc(s.notes || '')}</textarea></div>
    </div>
    <div class="btn-row"><button type="submit" class="btn primary">${esc(L('Save'))}</button><button type="button" class="btn" id="e-cancel">${esc(L('Cancel'))}</button><a class="btn" href="${href('team')}">${esc(L('Team'))}</a></div>
    ${isNew ? '' : `<div id="site-history">${history ? historyHTML(s, history) : `<p class="mute small">${esc(L('Loading'))}</p>`}</div>`}
  </form>`;
}

function historyHTML(s, h) {
  const reps = h.reports || [], cks = h.checkins || [], incs = h.incidents || [], ppl = h.people || [];
  const byDay = {};
  for (const c of cks) byDay[c.day] = { ...(byDay[c.day] || {}), c };
  for (const r of reps) byDay[r.day] = { ...(byDay[r.day] || {}), r };
  const days = Object.keys(byDay).sort().reverse().slice(0, 14);
  return `
    <h3 style="margin-top:22px">${esc(L('This site'))}</h3>
    <div class="stat">
      <div><div class="big num">${n(h.month_hours)}</div><div class="lbl">${esc(L('hours this month'))}</div></div>
      <div><div class="big num">${n(h.days_reported)}</div><div class="lbl">${esc(L('reports in the last 30 days'))}</div></div>
      <div><div class="big num">${n(incs.filter(i => i.status === 'open').length)}</div><div class="lbl">${esc(L('open incidents'))}</div></div>
      <div><div class="big num">${n(ppl.filter(p => p.active).length)}</div><div class="lbl">${esc(L('people at this site'))}</div></div>
    </div>
    ${ppl.length ? `<p class="small">${esc(L('People here: {list}', { list: ppl.filter(p => p.active).map(p => p.name).join(', ') }))}</p>` : ''}
    ${days.length ? `<div class="t-wrap"><table class="t rep"><thead><tr><th>${esc(L('Day'))}</th><th>${esc(L('Started'))}</th><th class="num">${esc(L('Phones out'))}</th><th>${esc(L('Sent'))}</th><th class="num">${esc(L('Hours'))}</th><th class="num">${esc(L('Uploaded'))}</th><th class="num">${esc(L('Wearers'))}</th><th class="num">${esc(L('Down'))}</th><th class="num">${esc(L('Flags'))}</th></tr></thead>
    <tbody>${days.map(d => { const { c, r } = byDay[d]; return `<tr><td>${esc(shortDay(d))}</td>
      <td>${c ? `${esc(clock(L, c.started_at))}${c.ok ? '' : `<span class="pill late">${esc(L('problem'))}</span>`}` : `<span class="pill miss">${esc(L('not in'))}</span>`}</td><td class="num">${c ? n(c.phones_deployed) : ''}</td>
      <td>${r ? `${esc(clock(L, r.first_at))}${r.late ? `<span class="pill late">${esc(L('late'))}</span>` : ''}${r.incident ? `<span class="pill late">${esc(L('incident'))}</span>` : ''}` : `<span class="pill miss">${esc(L('not in'))}</span>`}</td>
      <td class="num">${r ? n(r.hours) : ''}</td><td class="num">${r ? n(r.hours_uploaded) : ''}</td><td class="num">${r ? `${n(r.wearers_present)} / ${n(r.wearers_scheduled)}` : ''}</td><td class="num">${r ? n(r.phones_out) : ''}</td><td class="num">${r ? n(r.flags) : ''}</td></tr>`; }).join('')}</tbody></table></div>` : `<p class="mute small">${esc(L('No check-in or report yet for this site.'))}</p>`}
    ${incs.length ? `<h4>${esc(L('Incidents'))}</h4><dl class="notes">${incs.slice(0, 10).map(i => `<dt>${esc(L('{no}, {day}, {kind}', { no: i.no, day: shortDay(i.day), kind: KIND[i.kind] || i.kind }))} <span class="pill st-${i.status === 'open' ? 'open' : 'closed'}">${esc(i.status === 'open' ? L('open') : L('closed'))}</span></dt><dd>${esc(i.what)}</dd>`).join('')}</dl>` : ''}`;
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
      <a class="btn" href="${href('team')}">${esc(L('Team'))}</a>
      <a class="btn" href="${href('report/day')}">${esc(L('Company report'))}</a>
    </div>
    ${cur ? form(cur) : ''}
    <div class="t-wrap"><table class="t reg" id="reg"><thead><tr><th>${esc(L('Site'))}</th><th>${esc(L('Status'))}</th><th>${esc(L('Channel'))}</th><th>${esc(L('Area'))}</th><th>${esc(L('City'))}</th><th>${esc(L('Industry'))}</th><th>${esc(L('Book'))}</th><th>${esc(L('Site lead'))}</th><th>${esc(L('Contact'))}</th><th class="num">${esc(L('Phones'))}</th><th>${esc(L('Last contact'))}</th></tr></thead>
    <tbody>${rows.map(s => `<tr data-id="${esc(s.id)}"${s.id === editing ? ' class="on"' : ''}>
      <td><b>${esc(s.name)}</b>${s.notes ? `<span class="tiny mute" style="display:block">${esc(String(s.notes).slice(0, 80))}</span>` : ''}</td>
      <td><span class="pill st-${esc(s.status)}">${esc(STATUS[s.status] || s.status)}</span></td>
      <td>${esc(TEAM[s.team] || s.team)}</td><td>${esc(AREA[s.area] || '')}</td><td>${esc(s.city || '')}</td><td>${esc(s.industry || '')}</td>
      <td>${esc(s.book || '')}</td><td>${esc(s.lead || '')}</td><td>${esc([s.contact_name, s.contact_phone].filter(Boolean).join(', '))}</td>
      <td class="num">${s.phones_capacity == null ? '' : fmt(s.phones_capacity)}</td><td>${esc(s.last_touch || '')}</td></tr>`).join('') || `<tr><td colspan="11" class="mute">${esc(L('Nothing here yet.'))}</td></tr>`}</tbody></table></div>
    <p class="tiny dim">${esc(L('Click a row to edit it and see its history. Status: prospect (we know of it), contacted (we talked), agreed (they said yes), ready to film (gear and papers done), active (recording), paused, closed. Active sites are the ones on the forms.'))}</p>`;

  document.getElementById('filters').addEventListener('click', e => { const b = e.target.closest('[data-filter]'); if (!b) return; filter = b.dataset.filter; store.set('vm.sites.filter', filter); render(); });
  document.getElementById('add').addEventListener('click', () => { editing = 'new'; history = null; render(); document.getElementById('e-name')?.focus(); });
  document.getElementById('reg').addEventListener('click', e => { const tr = e.target.closest('tr[data-id]'); if (!tr) return; editing = tr.dataset.id; history = null; render(); document.getElementById('site-form')?.scrollIntoView({ block: 'start' }); loadHistory(editing); });
  const f = document.getElementById('site-form');
  if (f) {
    document.getElementById('e-cancel').addEventListener('click', () => { editing = null; history = null; render(); });
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const p = {};
      f.querySelectorAll('[data-k]').forEach(el => { p[el.dataset.k] = el.value; });
      if (editing !== 'new') p.id = editing;
      const btn = f.querySelector('button[type=submit]'); btn.disabled = true;
      try { await admin(editing === 'new' ? 'site_add' : 'site_set', p); toast(L('Saved.')); editing = null; history = null; await load(); }
      catch (err) { toast(friendly(L, err.message, ERR)); btn.disabled = false; }
    });
  }
}

async function loadHistory(id) {
  try {
    const h = await admin('site_history', { id });
    if (editing !== id) return;
    history = h;
    const box = document.getElementById('site-history');
    if (box) box.innerHTML = historyHTML(sites.find(s => s.id === id) || {}, h);
  } catch (err) {
    const box = document.getElementById('site-history');
    if (box) box.innerHTML = `<p class="mute small">${esc(friendly(L, err.message))}</p>`;
  }
}

load();

