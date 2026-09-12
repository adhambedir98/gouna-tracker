// Accounts: who has asked for one, what each one may read, and what the guard has seen. Management only.
import { mount, esc, labels, store, toast, fmt, href } from '../app.js';
import { rpc, gate, loading, failed, friendly, CODE } from '../online.js';
import { ROLES, ROLE_LABEL, SECTION_LABEL } from '../access.js';

const L = await labels('accounts');
const app = await mount({ page: 'accounts', title: L('Accounts'), lede: L('Everybody who has asked to read the map. An account opens nothing until it has a role. The list below it is what the guard has seen.') });

let code = store.get(CODE, '');
let users = [], events = [], roles = {};
let tab = 'people';
const call = (action, p = {}) => rpc('dr_accounts', { p_code: code, p_action: action, p });
const KIND = {
  view: L('read a page'), print: L('printed'), printscreen: L('pressed Print Screen'), capture: L('started a screen capture'),
  save: L('saved the page'), devtools: L('opened the developer tools'), 'copy-page': L('copied a whole page'), copy: L('copied a line'),
  denied: L('a page their role does not open'), 'sign-in': L('signed in'), 'sign-out': L('signed out')
};
const LOUD = ['print', 'printscreen', 'capture', 'save', 'devtools', 'copy-page'];

function open(c) { code = c; load(); }
async function load() {
  if (!code) return gate(app, L, open);
  loading(app, L);
  try {
    [users, roles] = await Promise.all([call('users'), call('roles')]);
    events = await call('events', { limit: '120' });
    store.set(CODE, code);
    render();
  } catch (err) {
    if (err.message === 'wrong code') { store.remove(CODE); code = ''; return gate(app, L, open, L('That code is wrong.')); }
    failed(app, L, friendly(L, err.message), load);
  }
}

const roleName = r => L(ROLE_LABEL[r] ? ROLE_LABEL[r].en : r);
const sectionsOf = r => (roles[r] || []).map(s => L(SECTION_LABEL[s] ? SECTION_LABEL[s].en : s)).join(', ');

function render() {
  const pending = users.filter(u => u.status === 'pending');
  const loud = events.filter(e => LOUD.includes(e.kind));
  app.content.innerHTML = `
    <div class="stat dash-stat">
      <div><div class="big num">${fmt(users.filter(u => u.status === 'active').length)}</div><div class="lbl">${esc(L('accounts open'))}</div></div>
      <div><div class="big num${pending.length ? ' warn' : ''}">${fmt(pending.length)}</div><div class="lbl">${esc(L('waiting for a role'))}</div></div>
      <div><div class="big num">${fmt(users.filter(u => u.status === 'blocked').length)}</div><div class="lbl">${esc(L('closed'))}</div></div>
      <div><div class="big num${loud.length ? ' bad' : ''}">${fmt(loud.length)}</div><div class="lbl">${esc(L('copy signals in the last 120'))}</div></div>
    </div>
    <div class="daybar no-print"><div class="chips" id="tabs">
      <button type="button" class="chip${tab === 'people' ? ' on' : ''}" data-tab="people">${esc(L('People'))}</button>
      <button type="button" class="chip${tab === 'watch' ? ' on' : ''}" data-tab="watch">${esc(L('What the guard saw'))}</button>
      <button type="button" class="chip${tab === 'roles' ? ' on' : ''}" data-tab="roles">${esc(L('What each role opens'))}</button>
    </div><span class="grow"></span><button type="button" class="btn" id="refresh">${esc(L('Refresh'))}</button></div>
    ${tab === 'people' ? people() : tab === 'watch' ? watch() : rolesTable()}`;
  document.getElementById('tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) { tab = b.dataset.tab; render(); } });
  document.getElementById('refresh').addEventListener('click', load);
  document.getElementById('users')?.addEventListener('change', save);
  document.getElementById('users')?.addEventListener('click', e => { const b = e.target.closest('[data-approve]'); if (b) approve(b.dataset.approve); });
}

const people = () => `<div class="t-wrap"><table class="t reg" id="users"><thead><tr><th>${esc(L('Person'))}</th><th>${esc(L('Role'))}</th><th>${esc(L('Account'))}</th><th>${esc(L('Asked'))}</th><th>${esc(L('Last read'))}</th></tr></thead>
  <tbody>${users.map(u => `<tr data-id="${esc(u.id)}"${u.status === 'pending' ? ' class="on"' : ''}>
    <td><b>${esc(u.name || u.email.split('@')[0])}</b><span class="tiny mute" style="display:block">${esc(u.email)}</span></td>
    <td><select data-k="role" data-id="${esc(u.id)}" aria-label="${esc(L('Role'))}">${ROLES.map(r => `<option value="${esc(r)}"${r === u.role ? ' selected' : ''}>${esc(roleName(r))}</option>`).join('')}</select></td>
    <td>${u.status === 'pending'
      ? `<button type="button" class="btn small" data-approve="${esc(u.id)}">${esc(L('Let them in'))}</button>`
      : `<select data-k="status" data-id="${esc(u.id)}" aria-label="${esc(L('Account'))}">${['active', 'pending', 'blocked'].map(s => `<option value="${s}"${s === u.status ? ' selected' : ''}>${esc(s === 'active' ? L('Open') : s === 'pending' ? L('Waiting') : L('Closed'))}</option>`).join('')}</select>`}</td>
    <td>${esc(u.created_at || '')}</td><td>${esc(u.last_seen || '')}${u.seen ? ` <span class="tiny mute">${fmt(u.seen)}</span>` : ''}</td></tr>`).join('')
    || `<tr><td colspan="5" class="mute">${esc(L('Nobody has asked yet.'))}</td></tr>`}</tbody></table></div>
  <p class="tiny dim">${esc(L('A new account waits with no role and opens nothing. Give it a role and the pages that role reads open, and only those.'))}</p>`;

const watch = () => `<div class="t-wrap"><table class="t reg"><thead><tr><th>${esc(L('When'))}</th><th>${esc(L('Person'))}</th><th>${esc(L('What'))}</th><th>${esc(L('Page'))}</th></tr></thead>
  <tbody>${events.map(e => `<tr${LOUD.includes(e.kind) ? ' class="on"' : ''}><td>${esc(e.at)}</td><td>${esc(e.name || L('not signed in'))}</td>
    <td>${LOUD.includes(e.kind) ? `<b class="bad-text">${esc(KIND[e.kind] || e.kind)}</b>` : esc(KIND[e.kind] || e.kind)}</td><td>${esc(e.page || '')}</td></tr>`).join('')
    || `<tr><td colspan="4" class="mute">${esc(L('Nothing yet.'))}</td></tr>`}</tbody></table></div>
  <p class="tiny dim">${esc(L('A browser is never told that a screenshot was taken, on any browser, and a photograph of the screen leaves no trace at all. These are the signals a browser does give, and each one is sent to Slack and to the report email the moment it happens. The name across every page is what makes a leaked picture traceable.'))}</p>`;

const rolesTable = () => `<div class="t-wrap"><table class="t reg"><thead><tr><th>${esc(L('Role'))}</th><th>${esc(L('Opens'))}</th><th class="num">${esc(L('People'))}</th></tr></thead>
  <tbody>${ROLES.map(r => `<tr><td><b>${esc(roleName(r))}</b></td><td>${esc(sectionsOf(r) || L('Nothing'))}</td><td class="num">${fmt(users.filter(u => u.role === r && u.status === 'active').length)}</td></tr>`).join('')}</tbody></table></div>
  <p class="tiny dim">${esc(L('The three site forms are open to everybody with the team code: the people at the sites have no accounts and their day must not stop.'))}</p>`;

async function save(e) {
  const el = e.target.closest('[data-k]'); if (!el) return;
  try { await call('user_set', { id: el.dataset.id, [el.dataset.k]: el.value, by: 'management' }); toast(L('Saved.')); await load(); }
  catch (err) { toast(friendly(L, err.message)); }
}
async function approve(id) {
  const u = users.find(x => x.id === id);
  try {
    await call('user_set', { id, status: 'active', role: u && u.role !== 'none' ? u.role : 'operator', by: 'management' });
    toast(L('Saved.')); await load();
  } catch (err) { toast(friendly(L, err.message)); }
}

load();
