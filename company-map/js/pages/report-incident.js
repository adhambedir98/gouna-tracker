// The incident form, online. Anything you think is an incident, small things too. It goes straight to management.
// The company report lists it the same day, and the incidents page keeps it open until it is closed.
import { mount, esc, labels, store, toast, href } from '../app.js';
import { rpc, today, shift, clock, dayLabel, friendly, peopleOptions, siteOptions, kindLabel, OTHER } from '../online.js';

const L = await labels('report-incident');
const app = await mount({ page: 'report/incident', title: L('Incident report'), lede: L('One form for anything you think is an incident. Small things too. Fill it in the same day. Call first, then write.') });

const KEY = 'vm.report';              // name, site, and team code: shared with the other forms
const DRAFT = 'vm.incident.draft';
let mem = store.get(KEY, {});
let draft = store.get(DRAFT, {});
let opts = { sites: [], people: [] };
const KIND = kindLabel(L);
const ERR = {
  'place is missing': L('Pick the site, or write where it happened.'),
  'kind is missing': L('Pick the kind of incident.'),
  'what is missing': L('Write what happened.'),
  'day is too far back': L('That date is more than a month ago. Ask Mano to enter it.')
};
const ELSEWHERE = '__elsewhere';

function field(id, label, type = 'text', extra = '', hint = '') {
  const v = draft[id] ?? '';
  const lab = `<label class="fl" for="f-${id}">${esc(label)}${hint ? `<small>${esc(hint)}</small>` : ''}</label>`;
  if (type === 'long') return `<div class="ff">${lab}<textarea id="f-${id}" data-f="${id}" rows="3">${esc(v)}</textarea></div>`;
  return `<div class="ff">${lab}<input type="${type}" id="f-${id}" data-f="${id}" value="${esc(v)}" ${extra}></div>`;
}

function render() {
  const now = today();
  const name = draft.reporter ?? mem.person ?? '';
  const known = opts.people.some(p => p.id === name);
  const site = draft.site ?? mem.site ?? '';
  const elsewhere = `<option value="${ELSEWHERE}"${site === ELSEWHERE ? ' selected' : ''}>${esc(L('Somewhere else: a hub, the road, the office'))}</option>`;
  app.content.innerHTML = `
    <p class="callout">${esc(L('An injury, a lost phone, or the police: call your Portfolio Manager first. The playbooks on When something goes wrong say what to do in the first 30 minutes. Then fill this in.'))}</p>
    <form class="stdform" id="iform" autocomplete="off">
      <section><h2>${esc(L('When and where'))}</h2><div class="fgrid">
        <div class="ff"><label class="fl" for="f-date">${esc(L('Date'))}</label><input type="date" id="f-date" data-f="date" value="${esc(draft.date || now)}" min="${shift(now, -30)}" max="${now}" required></div>
        ${field('at', L('Time'), 'time', '', L('When it happened, not when you wrote this.'))}
        <div class="ff"><label class="fl" for="f-site">${esc(L('Site'))}</label><select id="f-site" data-f="site" required>${siteOptions(L, opts.sites, site, elsewhere)}</select></div>
        <div class="ff" id="place-wrap" ${site === ELSEWHERE ? '' : 'hidden'}>${field('place', L('Where it happened'))}</div>
        <div class="ff"><label class="fl" for="f-reporter">${esc(L('Your name'))}</label><select id="f-reporter" data-f="reporter" required>${peopleOptions(L, opts.people, name)}</select></div>
        <div class="ff" id="other-wrap" ${name && !known ? '' : 'hidden'}><label class="fl" for="f-reporter_other">${esc(L('Write your name'))}</label><input type="text" id="f-reporter_other" data-f="reporter_other" value="${esc(name && !known && name !== OTHER ? name : (draft.reporter_other || ''))}"></div>
        ${field('role', L('Your role'), 'text', '', L('Operator, site lead, runner, Portfolio Manager.'))}
      </div></section>
      <section><h2>${esc(L('What happened'))}</h2><div class="fgrid">
        <div class="ff"><span class="fl">${esc(L('Kind of incident'))}</span><div class="choices small">${Object.keys(KIND).map(k => `<label class="opt"><input type="radio" name="f-kind" data-f="kind" value="${k}" ${draft.kind === k ? 'checked' : ''}> ${esc(KIND[k])}</label>`).join('')}</div></div>
        ${field('what', L('What happened, in plain words'), 'long')}
        ${field('people', L('People involved'))}
        ${field('phones', L('Phones involved, by device number'))}
      </div></section>
      <section><h2>${esc(L('What was done'))}</h2><div class="fgrid">
        ${field('actions', L('What you did, and when'), 'long')}
        ${field('told', L('Who you told, and when'), 'long')}
      </div></section>
      <section><h2>${esc(L('Follow-up'))}</h2><div class="fgrid">
        <div class="ff row"><input type="checkbox" id="f-open" data-f="open" ${draft.open === 'false' ? '' : 'checked'}> <label class="fl" for="f-open">${esc(L('Still open'))}</label></div>
        ${field('needs', L('What is needed now'), 'long')}
      </div></section>
      <section><h2>${esc(L('Send'))}</h2><div class="fgrid">
        <div class="ff"><label class="fl" for="f-code">${esc(L('Team code'))}<small>${esc(L('The same code as the evening check-out.'))}</small></label><input type="text" id="f-code" data-f="code" value="${esc(draft.code ?? mem.code ?? '')}" autocapitalize="off" required></div>
      </div>
      <div class="btn-row"><button type="submit" class="btn primary" id="send">${esc(L('Send'))}</button><button type="button" class="btn" id="f-clear">${esc(L('Clear'))}</button><a class="btn" href="${href('incidents')}">${esc(L('The playbooks'))}</a></div>
      </section>
    </form>
    <p class="tiny dim">${esc(L('Your name, site, and team code stay on this device. What you type stays until you send it.'))}</p>`;

  const form = document.getElementById('iform');
  const read = () => {
    const o = {};
    form.querySelectorAll('[data-f]').forEach(el => {
      if (el.type === 'radio') { if (el.checked) o[el.dataset.f] = el.value; }
      else if (el.type === 'checkbox') o[el.dataset.f] = el.checked ? 'true' : 'false';
      else o[el.dataset.f] = el.value;
    });
    return o;
  };
  const keep = () => { draft = read(); store.set(DRAFT, draft); };
  form.addEventListener('input', keep);
  form.addEventListener('change', e => {
    if (e.target.id === 'f-reporter') document.getElementById('other-wrap').hidden = e.target.value !== OTHER;
    if (e.target.id === 'f-site') document.getElementById('place-wrap').hidden = e.target.value !== ELSEWHERE;
    keep();
  });
  document.getElementById('f-clear').addEventListener('click', () => {
    if (!confirm(L('Clear everything on this form?'))) return;
    draft = {}; store.set(DRAFT, {}); render();
  });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const v = read();
    const btn = document.getElementById('send');
    const p = { code: v.code, site_id: v.site === ELSEWHERE ? '' : v.site, place: v.site === ELSEWHERE ? v.place : '', day: v.date, at: v.at,
      reporter_id: v.reporter === OTHER ? '' : v.reporter, reporter_other: v.reporter === OTHER ? v.reporter_other : '', role: v.role,
      kind: v.kind || '', what: v.what, people: v.people, phones: v.phones, actions: v.actions, told: v.told, open: v.open, needs: v.needs };
    btn.disabled = true; btn.textContent = L('Sending');
    try {
      const out = await rpc('dr_incident', { p });
      mem = { ...mem, person: v.reporter, code: v.code }; store.set(KEY, mem);
      draft = {}; store.set(DRAFT, {});
      done(out);
    } catch (err) {
      toast(friendly(L, err.message, ERR));
      btn.disabled = false; btn.textContent = L('Send');
    }
  });
}

function done(o) {
  app.content.innerHTML = `<section class="card panel sent" id="sent">
    <h2>${esc(L('Filed'))}</h2>
    <p class="big-rule">${esc(L('Incident {no}: {site}, {day}.', { no: o.no, site: o.site, day: dayLabel(o.day) }))}</p>
    <p>${esc(L('Sent at {time}. Moharam and Mano see it on the company report today. It stays open until management closes it.', { time: clock(L, o.sent_at) }))}</p>
    <p>${esc(L('If you have not called your Portfolio Manager yet, call now.'))}</p>
    <div class="btn-row"><button type="button" class="btn primary" id="again">${esc(L('File another'))}</button><a class="btn" href="${href('incidents')}">${esc(L('The playbooks'))}</a></div>
  </section>`;
  document.getElementById('again').addEventListener('click', () => { draft = {}; render(); });
}

try {
  const o = await rpc('dr_form_options', {});
  opts = { sites: o.sites || [], people: o.people || [] };
  render();
} catch (err) {
  app.content.innerHTML = `<p class="callout late">${esc(friendly(L, err.message))}</p><div class="btn-row"><button type="button" class="btn primary" id="retry">${esc(L('Try again'))}</button></div>`;
  document.getElementById('retry').addEventListener('click', () => location.reload());
}

