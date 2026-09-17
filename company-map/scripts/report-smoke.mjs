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

// a refusal comes back with a message the form can show
// the evening check-out asks for no code either: the sites fill it in on a phone at the gate
const bad = await rpc('dr_submit', { p: { site_id: 'nope' } });
check(bad.status === 400 && bad.body && bad.body.message === 'unknown site', `check-out with an unknown site: ${bad.status} ${JSON.stringify(bad.body)}`);
// the morning check-in asks for no code at all: the sites open it on a phone at the gate. It still refuses a site it does not know.
const badC = await rpc('dr_checkin', { p: { site_id: 'nope' } });
check(badC.status === 400 && badC.body && badC.body.message === 'unknown site', `check-in with an unknown site: ${badC.status} ${JSON.stringify(badC.body)}`);
// the incident form asks for no code either: a person at a site reports what happened, and stopping them is worse than a stray line
const badI = await rpc('dr_incident', { p: { site_id: 'nope', place: '' } });
check(badI.status === 400 && badI.body && /place|site/.test(badI.body.message || ''), `incident with an unknown site: ${badI.status} ${JSON.stringify(badI.body)}`);
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

/* The three forms, for real, against the live database, the way a site fills them in. The hours for a day are the rise
   in minutes all time since the phone's last check-out, and the pending hours are what it is holding tonight, so the
   round trip needs two check-outs on two days to see the overnight upload cancel out. The morning check-in is sent as
   well, to prove it changes nothing about the hours: it carries no phone readings any more. It writes to a site that has sent nothing
   on either day and takes all of it off again, so the days are left exactly as they were found. Management code only. */
if (process.env.DR_REPORT_CODE) {
  const code = process.env.DR_REPORT_CODE;
  const day = new Date().toLocaleDateString('en-CA', { timeZone: cfg.zone || 'Africa/Cairo' });
  const back = n => { const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
  const yesterday = back(1);
  const admin = (action, p = {}) => rpc('dr_admin', { p_code: code, p_action: action, p });
  const today0 = await rpc('dr_report', { p_day: day, p_code: code });
  const prev0 = await rpc('dr_report', { p_day: yesterday, p_code: code });
  const busyYesterday = new Set(((prev0.body && prev0.body.sites) || []).filter(s => s.checkin || s.report).map(s => s.id));
  const free = ((today0.body && today0.body.sites) || []).find(s => s.active && !s.checkin && !s.report && !busyYesterday.has(s.id));
  if (!free) console.log('round trip: skipped, every site has already sent something on one of the two days');
  else {
    const who = 'Smoke test, not a real day';
    const rows = (a, b, la = 0, lb = 0) => [{ tag: '269', recorded: String(a), local: String(la) }, { tag: '270', recorded: String(b), local: String(lb) }];
    // the day is the minutes each phone recorded, added up: 120 and 60 is three hours, with 90 and 30 still on them
    const first = await rpc('dr_submit', { p: { site_id: free.id, reporter_other: who, day: yesterday,
      phones: rows(120, 60, 90, 30), wearers_present: '2', phones_out: '0', incident: 'false' } });
    check(first.status === 200 && first.body && first.body.ok && Number(first.body.hours) === 3,
      `the check-out did not add the phones up: ${first.status} ${JSON.stringify(first.body).slice(0, 200)}`);
    // the morning check-in: four numbers, no phone readings, and no effect on any count
    const morning = await rpc('dr_checkin', { p: { site_id: free.id, reporter_other: who, day, started_at: '08:00',
      phones_deployed: '2', wearers_present: '4', phones_out: '1', problem: 'false', note: '' } });
    check(morning.status === 200 && morning.body && morning.body.ok && Number(morning.body.phones_deployed) === 2,
      `morning check-in: ${morning.status} ${JSON.stringify(morning.body).slice(0, 200)}`);
    const noRows = await rpc('dr_checkin', { p: { site_id: free.id, reporter_other: who, day, started_at: '08:00',
      phones_deployed: '2', wearers_present: '4', phones_out: '1', phones: rows(9999, 9999), problem: 'false', note: '' } });
    check(noRows.status === 200, `the check-in refused a stale form carrying phone rows: ${noRows.status} ${JSON.stringify(noRows.body).slice(0, 200)}`);
    // tonight: 300 and 180 minutes recorded is eight hours, and nothing is read off the phone but that and what is still on it
    const evening = await rpc('dr_submit', { p: { site_id: free.id, reporter_other: who, day,
      phones: rows(300, 180, 45, 15), wearers_present: '4', phones_out: '1', flags: '0', incident: 'false' } });
    check(evening.status === 200 && evening.body && evening.body.ok && Number(evening.body.hours) === 8,
      `the check-out did not add the phones up: ${evening.status} ${JSON.stringify(evening.body).slice(0, 200)}`);
    const mid = await rpc('dr_report', { p_day: day, p_code: code });
    const line = ((mid.body && mid.body.sites) || []).find(s => s.id === free.id);
    check(line && line.report && Number(line.report.hours) === 8 && Number(line.report.hours_held) === 1 && Number(line.report.backlog) === 2,
      `the day does not read eight hours recorded and one pending on two phones: ${JSON.stringify(line && line.report)}`);
    check(line && line.checkin && Number(line.checkin.phones_deployed) === 2 && Number(line.checkin.wearers_present) === 4 && Number(line.checkin.phones_out) === 1,
      `the morning check-in did not carry its four numbers: ${JSON.stringify(line && line.checkin)}`);
    // a phone still on the old form sends the two readings and no minutes recorded: it goes through, and because the
    // site already sent its count for today, the count stays and only what is pending tonight moves
    const oldForm = await rpc('dr_submit', { p: { site_id: free.id, reporter_other: who, day,
      phones: [{ tag: '269', total: '5000', local: '120' }, { tag: '270', total: '6000', local: '60' }], wearers_present: '4', phones_out: '1', incident: 'false' } });
    check(oldForm.status === 200 && oldForm.body && oldForm.body.ok, `the old form was refused: ${oldForm.status} ${JSON.stringify(oldForm.body).slice(0, 200)}`);
    const after2 = await rpc('dr_report', { p_day: day, p_code: code });
    const line2 = ((after2.body && after2.body.sites) || []).find(s => s.id === free.id);
    check(line2 && line2.report && Number(line2.report.hours) === 8 && line2.report.hours_estimated === false && Number(line2.report.hours_held) === 3,
      `an old-form resend changed the count or lost the pending figure: ${JSON.stringify(line2 && line2.report)}`);
    // a row without the minutes it recorded is refused, by name
    const bare = await rpc('dr_submit', { p: { site_id: free.id, reporter_other: who, day,
      phones: [{ tag: '269', local: '5' }], wearers_present: '4', phones_out: '1', incident: 'false' } });
    check(bare.status !== 200 && /minutes recorded are missing/.test(JSON.stringify(bare.body)), `a row with no minutes recorded was accepted: ${bare.status} ${JSON.stringify(bare.body).slice(0, 200)}`);
    const inc = await rpc('dr_incident', { p: { site_id: free.id, reporter_other: who, day,
      kind: 'other', what: 'Smoke test, not a real incident.', action: 'none' } });
    check(inc.status === 200 && inc.body && inc.body.ok, `incident: ${inc.status} ${JSON.stringify(inc.body).slice(0, 200)}`);
    for (const what of ['checkin', 'report', 'incident']) {
      const off = await admin('day_undo', { site_id: free.id, day, what, by: 'smoke test' });
      check(off.status === 200 && off.body && off.body.ok, `taking the ${what} off again: ${off.status} ${JSON.stringify(off.body).slice(0, 200)}`);
    }
    const offPrev = await admin('day_undo', { site_id: free.id, day: yesterday, what: 'report', by: 'smoke test' });
    check(offPrev.status === 200 && offPrev.body && offPrev.body.ok, `taking yesterday's check-out off again: ${offPrev.status} ${JSON.stringify(offPrev.body).slice(0, 200)}`);
    const after = await rpc('dr_report', { p_day: day, p_code: code });
    const afterPrev = await rpc('dr_report', { p_day: yesterday, p_code: code });
    const left = ((after.body && after.body.sites) || []).find(s => s.id === free.id);
    const leftPrev = ((afterPrev.body && afterPrev.body.sites) || []).find(s => s.id === free.id);
    check(left && !left.checkin && !left.report, `the round trip left something behind on ${free.name} today`);
    check(leftPrev && !leftPrev.report, `the round trip left something behind on ${free.name} yesterday`);
    check(!((after.body && after.body.incidents) || []).some(i => i.reporter === who), 'the round trip left an incident behind');
    console.log(`round trip on ${free.name}: a check-out added its phones up to ${first.body && first.body.hours} hours, the morning check-in sent four numbers and no phone rows, the next check-out added up to ${evening.body && evening.body.hours}, a row with no minutes was refused, incident filed, all of it taken off again`);
  }
}

if (problems.length) { console.log(problems.join('\n')); console.log(`\n${problems.length} problem(s).`); process.exitCode = 1; }
else console.log('Report database clean.');
