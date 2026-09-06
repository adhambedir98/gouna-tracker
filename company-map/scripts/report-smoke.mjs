// Checks the daily report database from outside, with the public key only, the way the pages reach it.
//   node scripts/report-smoke.mjs
// With DR_REPORT_CODE set in the environment it also reads today's company report.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('../', import.meta.url).pathname);
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'data/report.json'), 'utf8'));
const H = { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key, 'Content-Type': 'application/json' };
const problems = [];
const check = (ok, msg) => { if (!ok) problems.push(msg); };

async function get(p) { const r = await fetch(cfg.url + p, { headers: H }); return { status: r.status, body: await r.json().catch(() => null) }; }
async function rpc(fn, body) { const r = await fetch(`${cfg.url}/rest/v1/rpc/${fn}`, { method: 'POST', headers: H, body: JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => null) }; }

// the site list is public, active sites only
const sites = await get('/rest/v1/dr_sites?select=id,name,team,lead,active&order=team.asc,sort.asc,name.asc');
check(sites.status === 200 && Array.isArray(sites.body), `sites: ${sites.status}`);
check(Array.isArray(sites.body) && sites.body.every(s => s.active), 'sites: an inactive site is visible');
console.log(`sites visible: ${Array.isArray(sites.body) ? sites.body.length : 0}`);

// the forms draw themselves from one call: active sites, the people who report, the two deadlines
const fo = await rpc('dr_form_options', {});
check(fo.status === 200 && fo.body && Array.isArray(fo.body.sites) && Array.isArray(fo.body.people) && /^\d\d:\d\d$/.test(fo.body.deadline || '') && /^\d\d:\d\d$/.test(fo.body.checkin_deadline || ''), `form options: ${fo.status} ${JSON.stringify(fo.body).slice(0, 200)}`);
check(fo.status === 200 && fo.body.people.every(p => p.id && p.name && p.role && !('phone' in p)), 'form options: the people carry more than id, name, role, team, and site');
if (fo.status === 200) console.log(`form options: ${fo.body.sites.length} sites, ${fo.body.people.length} people, check-in by ${fo.body.checkin_deadline}, report by ${fo.body.deadline}`);

// nothing else is readable or writable with the public key
for (const t of ['dr_reports', 'dr_settings', 'dr_daily', 'dr_people', 'dr_checkins', 'dr_incidents', 'dr_log']) { const r = await get(`/rest/v1/${t}?select=*`); check(r.status === 401 || r.status === 403 || r.status === 404, `${t} readable: ${r.status}`); }
const ins = await fetch(`${cfg.url}/rest/v1/dr_sites`, { method: 'POST', headers: H, body: JSON.stringify({ name: 'smoke test' }) });
check(ins.status >= 400, `dr_sites insert allowed: ${ins.status}`);

// the wrong code is refused with a message the form can show
const bad = await rpc('dr_submit', { p: { code: 'nope' } });
check(bad.status === 400 && bad.body && bad.body.message === 'wrong team code', `submit with wrong code: ${bad.status} ${JSON.stringify(bad.body)}`);
const badC = await rpc('dr_checkin', { p: { code: 'nope' } });
check(badC.status === 400 && badC.body && badC.body.message === 'wrong team code', `check-in with wrong code: ${badC.status} ${JSON.stringify(badC.body)}`);
const badI = await rpc('dr_incident', { p: { code: 'nope' } });
check(badI.status === 400 && badI.body && badI.body.message === 'wrong team code', `incident with wrong code: ${badI.status} ${JSON.stringify(badI.body)}`);
const badR = await rpc('dr_report', { p_day: '2026-09-06', p_code: 'nope' });
check(badR.status === 400 && badR.body && badR.body.message === 'wrong code', `report with wrong code: ${badR.status}`);
const badA = await rpc('dr_admin', { p_code: 'nope', p_action: 'sites' });
check(badA.status === 400 && badA.body && badA.body.message === 'wrong code', `admin with wrong code: ${badA.status}`);

// the internal functions are not callable from outside
for (const fn of ['dr_build', 'dr_snapshot', 'dr_target', 'dr_notify', 'dr_log_add', 'dr_reporter']) { const r = await rpc(fn, { p_day: '2026-09-06', p_kind: 'number' }); check(r.status >= 400, `${fn} callable: ${r.status}`); }

// with the management code, today's report reads
if (process.env.DR_REPORT_CODE) {
  const day = new Date().toLocaleDateString('en-CA', { timeZone: cfg.zone || 'Africa/Cairo' });
  const rep = await rpc('dr_report', { p_day: day, p_code: process.env.DR_REPORT_CODE });
  check(rep.status === 200 && rep.body && rep.body.day === day && Array.isArray(rep.body.sites), `report: ${rep.status} ${JSON.stringify(rep.body).slice(0, 200)}`);
  if (rep.status === 200) console.log(`report ${day}: ${rep.body.morning.checked_in} of ${rep.body.expected} sites started, ${rep.body.totals.reported} in, ${rep.body.totals.hours} hours, target ${rep.body.target_day} a day, ${rep.body.incidents.length} incidents filed, ${rep.body.open_incidents} open`);
  const ppl = await rpc('dr_admin', { p_code: process.env.DR_REPORT_CODE, p_action: 'people' });
  check(ppl.status === 200 && Array.isArray(ppl.body), `people: ${ppl.status}`);
  if (ppl.status === 200) console.log(`team: ${ppl.body.filter(p => p.active).length} active people`);
}

if (problems.length) { console.log(problems.join('\n')); console.log(`\n${problems.length} problem(s).`); process.exitCode = 1; }
else console.log('Report database clean.');
