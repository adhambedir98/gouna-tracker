// Exports the site's content as Markdown documents for a Claude project, English only.
//   node scripts/export-md.mjs            writes dist/knowledge/*.md
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('../', import.meta.url).pathname);
const out = path.join(root, 'dist', 'knowledge');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const J = f => JSON.parse(fs.readFileSync(path.join(root, 'data', f + '.json'), 'utf8'));
const site = J('site');
const stamp = `Source: the company map, version ${site.version}, ${site.date}. English only. Regenerate with node scripts/export-md.mjs after any change to the site.`;

/* ---------- small helpers ---------- */
const t = v => v == null ? '' : typeof v === 'string' ? v : typeof v === 'number' ? String(v) : typeof v.en === 'string' ? v.en : '';
const clean = s => String(s).replace(/\s+/g, ' ').trim();
const ul = (arr, f = t) => (arr || []).map(x => `- ${clean(f(x))}`).join('\n');
const ol = (arr, f = t) => (arr || []).map((x, i) => `${i + 1}. ${clean(f(x))}`).join('\n');
const kv = (label, v) => t(v) ? `**${label}.** ${clean(t(v))}` : '';
const para = arr => (arr || []).map(x => clean(t(x))).filter(Boolean).join('\n\n');
const table = (head, rows) => { const w = head.map(h => `| ${h} `).join('') + '|'; const sep = head.map(() => '| --- ').join('') + '|'; const body = rows.map(r => r.map(c => `| ${clean(t(c)).replace(/\|/g, '/')} `).join('') + '|').join('\n'); return `${w}\n${sep}\n${body}`; };
const cardTable = tb => {
  if (!tb) return '';
  const cols = (tb.columns || tb.head || []).map(t);
  const rows = (tb.rows || []).map(r => { const cells = r.map(c => c && c.text != null ? t(c.text) : t(c)); while (cells.length && cells.length < cols.length) cells.push(cells[cells.length - 1]); return cells; });
  return cols.length ? table(cols, rows) : '';
};
const sopTitle = Object.fromEntries(site.nav.flatMap(g => g.items).map(i => [i.path, t(i.label)]));
const block = (...parts) => parts.filter(Boolean).join('\n\n');
const write = (name, title, body) => { fs.writeFileSync(path.join(out, name), `# ${title}\n\n_${stamp}_\n\n${body.trim()}\n`); console.log('  ' + name); };

/* ---------- 00 instructions ---------- */
write('00-project-instructions.md', 'Project instructions', `Paste this into the project's custom instructions.

---

You help the people who run a video data collection operation in Egypt. The Egyptian company is KMSC. It has a parent company in the United States. The client is never named: say "the client" and "the collection app". Never write the name of the client, the client's app, or the parent company, even if a document in this project mentions it.

Answer from the documents in this project first. If they do not cover something, say so plainly rather than guessing.

Write the way the company map is written. Plain, simple English that a junior employee who does not read English well can follow. Short sentences, one idea each. Everyday words. No jargon. Sentence case for titles and headings. No em dashes or en dashes, no semicolons, no emoji.

Use the company's own words. The people at the sites who look after ten phones each are "operators", never anchors. There are no supervisors. The senior operator on a floor with 20 or more phones is the "site lead". New workers go through "onboarding screening". The first day at a site is "launch day". The list that travels with the phones is the "phone list". The phones travel in "the provided bag". The 6:00 PM form is "the daily report", and the page that adds every site up is "the company report". A Portfolio Manager's book follows a "hub area": Central or East. Names: Manhal, Youssef Medhat (Director of Quality Control and Central Planning), Ahmed Alaa (Head of Finance), Moharam (Director of Operations), Mano (Chief of Staff), Mazen (Head of Deployment).

Who owns what. Adham Bedir (CEO) owns the client, contracts, prices, and the second signature on large payments. Moharam (Director of Operations) owns the field: every site, shift, and daily target, the Portfolio Managers, the Planning and Logistics Lead, the delivery partners, and tier 2 incidents. Mano (Chief of Staff) owns people: recruiting, onboarding screening and paperwork, wearer files, the handbook, legal filings, site paperwork, and the map. He chases the sites on the 6:15 PM missing list. The Planning and Logistics Lead (open seat, under Moharam) owns the dispatch schedule, site plans, procurement demand, the store at the Central Cairo warehouse, the two hubs (Central and East, with West planned), the runners and hub attendants, the internet lines, the kits, gear buying in Egypt, the phone registry, and the weekly count. Ahmed Alaa (Head of Finance) owns all money: payroll, payments, the invoice, and month end. Everyone is paid on our own audit, about 30 days before the client's money arrives. Youssef Medhat owns quality: the daily audit and the month-end second pass. Mazen (Head of Deployment) opens every new site and keeps a book of running sites until the first new Portfolio Manager signs off. Site leads run the floor between Portfolio Manager visits and submit the daily report by 6:00 PM. Youssif Siessa (CTO) owns technology and quality. Aly Siessa (CPO) owns hardware.

Never state a pay figure, an equity figure, a partner price, or a ban count. Pay is always a placeholder. Never use the names Mustafa or Yahia.

When asked to write a procedure, a job posting, an offer letter, or an incident playbook, follow the shape of the ones in this project exactly.`);

/* ---------- 01 start ---------- */
{
  const s = J('start');
  write('01-start.md', 'Start: mission, values, targets', block(
    `## Mission\n\n${clean(s.mission)}`,
    `## Values\n\n${s.values.map(v => `**${clean(v.b)}.** ${clean(v.s)}`).join('\n\n')}`,
    `## Monthly targets\n\n${table(['Month', 'Hours', 'Note'], s.months.map(m => [m.label, m.hours.toLocaleString('en-US'), m.note]))}`,
    `## Where to start, by role\n\n${s.starts.map(x => `**${clean(x.who)}.** ${x.pages.map(p => sopTitle[p] || p).join(', ')}`).join('\n\n')}`
  ));
}

/* ---------- 02 who does what ---------- */
{
  const p = J('people');
  const name = id => (p.people.find(x => x.id === id) || {}).name || id;
  const person = x => block(
    `## ${clean(x.name)}${x.title && x.title !== x.name ? `, ${clean(x.title)}` : ''}`,
    [x.org, x.division].filter(Boolean).map(clean).join(', '),
    kv('Reports to', typeof x.reportsTo === 'string' ? name(x.reportsTo) : t(x.reportsTo)),
    (x.manages || []).length ? kv('Manages', x.manages.map(name).join(', ')) : '',
    (x.owns || []).length ? `**Owns.**\n${ul(x.owns)}` : '',
    kv('Where and when', x.whereWhen),
    (x.contactFor || []).length ? `**Contact for.**\n${ul(x.contactFor)}` : '',
    kv('Escalate to', x.escalateTo),
    kv('Note', x.note)
  );
  write('02-who-does-what.md', 'Who does what', block(
    `## The three charts\n\n${p.trees.map(tr => `- ${clean(tr.title)}: rooted at ${name(tr.root.id)}`).join('\n')}`,
    p.people.map(person).join('\n\n')
  ));
}

/* ---------- 03 process ---------- */
{
  const c = J('channels');
  const steps = ph => c.steps.filter(s => s.phase === ph.id);
  write('03-how-the-process-works.md', 'How the process works', block(
    `## Two channels\n\n${c.channels.map(ch => block(`### ${clean(ch.name)}${ch.tag ? ` (${clean(ch.tag)})` : ''}`, kv('Who', ch.who), kv('Phones', ch.phones), ul(ch.lines))).join('\n\n')}`,
    `## The steps, in order`,
    c.phases.map(ph => block(ph.title ? `### ${clean(ph.title)}` : '', ph.note ? clean(ph.note) : '', steps(ph).map((s, i) => block(`#### ${clean(s.title)}`, kv('Who', s.who), kv('Done when', s.done), ul(s.lines))).join('\n\n'))).join('\n\n')
  ));
}

/* ---------- 04 the day ---------- */
{
  const d = J('day');
  const steps = ph => d.flow.steps.filter(s => s.phase === ph.id);
  write('04-what-happens-every-day.md', 'What happens every day', block(
    `## Where the phones are\n\n${d.where.map(w => `**${clean(w.b)}.** ${clean(w.s)}`).join('\n\n')}`,
    `## The day, moment by moment\n\n${table(['When', 'What', 'Detail'], d.day.map(m => [m.when, m.what, m.text]))}`,
    `## Daily instructions for each phone`,
    d.flow.phases.map(ph => block(`### ${clean(ph.title)}`, clean(ph.note || ''), steps(ph).map(s => block(`#### ${clean(s.title)}`, kv('Who', s.who), kv('Done when', s.done), ul(s.lines))).join('\n\n'))).join('\n\n'),
    `## The week and the month\n\n${ul(d.rhythm)}`,
    `## Always\n\n${ul(d.always)}`
  ));
}

/* ---------- 05 rules ---------- */
{
  const r = J('rules');
  const byId = Object.fromEntries(r.rules.map(x => [x.id, x]));
  const item = x => typeof x === 'string' ? x : x.lead ? `**${clean(t(x.lead))}** ${clean(t(x.text))}` : t(x);
  const card = x => block(
    `### ${clean(t(x.title))}`,
    clean(t(x.intro)),
    clean(t(x.sub)),
    x.visual ? `**Right.**\n${ul(x.visual.right)}\n\n**Wrong.**\n${ul(x.visual.wrong)}` : '',
    ul(x.items, item),
    cardTable(x.table),
    clean(t(x.outro))
  );
  write('05-rules.md', 'Rules', block(
    clean(t(r.source)),
    r.groups.map(g => block(`## ${clean(t(g.title))}`, g.rules.map(id => card(byId[id])).join('\n\n'))).join('\n\n')
  ));
}

/* ---------- 06 fraud ---------- */
{
  const q = J('manual/quality');
  write('06-fraud.md', 'Fraud: the eight patterns', block(
    'Every video is watched before the client sees it. These are the eight ways a recording is not real work, how to spot each one, and what to do.',
    q.patterns.map((p, i) => block(`## ${i + 1}. ${clean(p.name)}`, clean(p.what), kv('How to spot it', p.tell), kv('What to do', p.fix))).join('\n\n')
  ));
}

/* ---------- 07 who to call ---------- */
{
  const c = J('call');
  const byK = Object.fromEntries(c.issues.map(x => [x.k, x]));
  const issue = x => block(`#### ${clean(t(x.label))}`, kv('First', x.first), kv('Backup', x.backup), kv('Time limit', x.sla), (x.include || []).length ? `**Say or bring.**\n${ul(x.include)}` : '');
  write('07-who-to-call.md', 'Who to call', block(
    `## The rules\n\n${c.rules.map(x => `**${clean(t(x.b))}** ${clean(t(x.s))}`).join('\n\n')}`,
    `## Every situation`,
    c.groups.map(g => block(`### ${clean(t(g.label))}`, clean(t(g.hint)), g.issues.map(k => issue(byK[k])).join('\n\n'))).join('\n\n')
  ));
}

/* ---------- 08 never ---------- */
{
  const n = J('never');
  write('08-things-we-never-do.md', 'Things we never do', block(clean(t(n.intro)), n.items.map((x, i) => block(`## ${i + 1}. ${clean(t(x.never))}`, clean(t(x.why)))).join('\n\n'), clean(t(n.closing))));
}

/* ---------- 09 onboarding screening ---------- */
{
  const g = J('gate');
  write('09-before-a-worker-starts.md', 'Before a worker starts: onboarding screening', block(
    clean(t(g.intro)),
    g.items.map((x, i) => block(`## ${i + 1}. ${clean(t(x.b))}`, clean(t(x.s)))).join('\n\n'),
    `**When all seven are done.** ${clean(t(g.result))}`,
    `**The sign-off sheet has.** ${g.signoff.map(x => clean(t(x.label))).join(', ')}.`
  ));
}

/* ---------- 10 incidents ---------- */
{
  const i = J('incidents');
  write('10-when-something-goes-wrong.md', 'When something goes wrong: incident playbooks', block(
    `## The three tiers\n\n${i.tiers.map(x => `**Tier ${x.n}: ${clean(x.who)}.** ${clean(x.what)}`).join('\n\n')}`,
    i.playbooks.map(p => block(
      `## ${clean(p.title)} (tier ${p.tier})`,
      kv('First', p.first),
      ol(p.steps, s => `${s.do} (${s.owner}, ${s.clock})`),
      (p.tell || []).length ? `**Who is told.**\n${ul(p.tell, x => `${x.who}: ${x.by}`)}` : '',
      kv('Never', p.never)
    )).join('\n\n')
  ));
}

/* ---------- 11 training ---------- */
{
  const tr = J('training');
  const quiz = qs => qs.map((q, i) => `${i + 1}. ${clean(t(q.q))}\n${q.options.map((o, j) => `   - ${clean(t(o))}${j === q.answer ? ' (correct)' : ''}`).join('\n')}`).join('\n');
  write('11-training.md', 'Training', block(
    clean(t(tr.intro)),
    tr.roles.map(r => block(
      `## ${clean(t(r.role))}`,
      kv('Trainer', r.trainer), kv('Length', r.length), kv('Passes when', r.passes),
      `### Guide\n\n${r.guide.map(g => `**${clean(t(g.h))}**\n${ul(g.lines)}`).join('\n\n')}`,
      `### Checklist\n\n${ul(r.checklist)}`,
      `### Quiz\n\n${quiz(r.quiz)}`
    )).join('\n\n'),
    `## ${clean(t(tr.handbook.title))}\n\n${clean(t(tr.handbook.note))}\n\n${quiz(tr.handbook.quiz)}`,
    `## Pocket cards\n\n${tr.cards.map(c => block(`### ${clean(t(c.title))}`, c.sections.map(s => `**${clean(t(s.h))}**\n${ul(s.lines)}`).join('\n\n'), kv('Who to call', c.call))).join('\n\n')}`
  ));
}

/* ---------- 12 manuals ---------- */
{
  const SKIP = new Set(['slug', 'title', 'purpose', 'how', 'breaks', 'questions', 'sops', 'id', 'sites', 'patterns']);
  const LABEL = { gbPerHour: 'GB per hour', exampleHoursPerDay: 'Example hours a day', tbPerDay: 'TB a day', mbps: 'Mbps needed', hubMbps: 'A hub passes at (Mbps)', hubTest: 'The hub test', spareRate: 'Spare rate', hatsPerPhone: 'Hats per phone', partnerPer: 'Delivery partners, example hours a day', per: 'Hours a day', tb: 'TB a day', hours: 'Hours a day', noShow: 'No show', monthEnd: 'Month end, in this order', gateNote: 'Onboarding screening', qty: 'Quantity', map: 'The hubs', hubs: 'Hubs', transport: 'Transport rules', serves: 'Used by', shows: 'Shows', answers: 'Answers the question', to: 'To', then: 'Then', v: 'Detail' };
  const label = k => LABEL[k] || (k.charAt(0).toUpperCase() + k.slice(1).replace(/([A-Z])/g, c => ' ' + c.toLowerCase()));
  const prim = v => typeof v === 'string' || typeof v === 'number';
  const long = v => typeof v === 'string' && v.length > 60;
  const fmtv = (k, v) => typeof v === 'number' ? (/rate/i.test(k) && v > 0 && v < 1 ? Math.round(v * 100) + '%' : v.toLocaleString('en-US')) : clean(t(v));
  function generic(k, v, depth = 0) {
    const h = depth === 0 ? `### ${label(k)}` : `**${label(k)}.**`;
    if (prim(v)) return `**${label(k)}.** ${fmtv(k, v)}`;
    if (Array.isArray(v)) {
      if (!v.length) return '';
      if (prim(v[0])) return `${h}\n\n${ul(v, x => fmtv(k, x))}`;
      if (Array.isArray(v[0])) return `${h}\n\n${ul(v, r => r.map(t).join(', '))}`;
      const keys = [...new Set(v.flatMap(o => Object.keys(o).filter(kk => !SKIP.has(kk) && prim(o[kk]))))];
      return `${h}\n\n${table(keys.map(label), v.map(o => keys.map(kk => fmtv(kk, o[kk] ?? ''))))}`;
    }
    if (v && typeof v === 'object') {
      if (k === 'letter') return `### The runner letter\n\n**${clean(v.en.title)}**\n\n${v.en.body.map(clean).join('\n\n')}\n\n${clean(v.en.date)}\n\n${clean(v.en.sign)}`;
      const entries = Object.entries(v).filter(([kk]) => !SKIP.has(kk));
      const prims = entries.filter(([, x]) => prim(x)), rest = entries.filter(([, x]) => !prim(x));
      if (!prims.length && rest.length === 1) return generic(k, rest[0][1], depth);  // a wrapper with one thing inside takes its name
      const primsOut = !prims.length ? '' : prims.some(([, x]) => long(x)) ? prims.map(([kk, x]) => `**${label(kk)}.** ${fmtv(kk, x)}`).join('\n\n') : table(['Setting', 'Value'], prims.map(([kk, x]) => [label(kk), fmtv(kk, x)]));
      return [h, primsOut, ...rest.map(([kk, x]) => generic(kk, x, depth + 1))].filter(Boolean).join('\n\n');
    }
    return '';
  }
  const manuals = site.nav.find(g => g.items.some(i => i.path === 'manual')).items.filter(i => i.path !== 'manual');
  manuals.forEach((it, n) => {
    const m = J(it.path);
    const rest = Object.entries(m).filter(([k]) => !SKIP.has(k)).map(([k, v]) => generic(k, v)).filter(Boolean).join('\n\n');
    write(`12-${String(n + 1).padStart(2, '0')}-how-things-work-${m.slug}.md`, `How things work: ${clean(m.title)}`, block(
      clean(m.purpose),
      `## How it works\n\n${para(m.how)}`,
      rest,
      m.patterns ? '**The eight fraud patterns** are in 06-fraud.md.' : '',
      m.breaks?.length ? `## Problems and what to do\n\n${table(['If this happens', 'Do this'], m.breaks.map(b => [b.what, b.do]))}` : '',
      m.questions?.length ? `## Questions\n\n${m.questions.map(q => `**${clean(q.q)}** ${clean(q.a)}`).join('\n\n')}` : '',
      m.sops?.length ? `**Procedures for this page.** ${m.sops.map(s => sopTitle['sops/' + s] || s).join('. ')}.` : ''
    ));
  });
}

/* ---------- 13 procedures ---------- */
{
  const idx = J('sops/index');
  write('13-standard-procedures.md', 'Standard procedures', idx.groups.map(g => block(
    `## ${clean(g.role)}`, clean(g.note || ''),
    g.sops.map(slug => { const s = J('sops/' + slug); return block(
      `### ${clean(s.title)}`, clean(s.purpose),
      kv('Owner', s.owner), kv('With', s.with), kv('When', s.when), kv('Takes', s.takes),
      s.needs?.length ? `**You need.** ${s.needs.map(clean).join(', ')}.` : '',
      `**Steps.**\n${ol(s.steps, x => `${x.do}${x.detail ? ' ' + x.detail : ''}${x.check ? ` Check: ${x.check}` : ''}`)}`,
      kv('Done when', s.done),
      s.fails?.length ? `**If something goes wrong.**\n\n${table(['If this happens', 'Do this'], s.fails.map(f => [f.if, f.then]))}` : '',
      kv('Escalate', s.escalate)
    ); }).join('\n\n')
  )).join('\n\n'));
}

/* ---------- 14 jobs ---------- */
{
  const idx = J('jobs/index');
  write('14-jobs.md', 'Jobs: handbook, posting, and offer letter for every role', idx.groups.map(g => block(
    `## ${clean(t(g.team))}`, clean(t(g.note)),
    g.jobs.map(slug => { const j = J('jobs/' + slug), H = j.handbook, P = j.posting, O = j.offer; return block(
      `### ${clean(j.title)}`, clean(j.summary),
      kv('Reports to', j.boss), kv('Team', `${j.team}, ${j.type}`), kv('Manages', j.leads), kv('Where', j.where), kv('Hours', j.hours),
      `#### Job handbook`,
      clean(H.purpose),
      `**Responsible for.**\n${ul(H.outcomes)}`, `**Every day.**\n${ul(H.daily)}`,
      H.weekly?.length ? `**Every week.**\n${ul(H.weekly)}` : '', H.monthly?.length ? `**Every month.**\n${ul(H.monthly)}` : '',
      `**The standard.**\n${ul(H.standards)}`, `**What ends the job.**\n${ul(H.never)}`,
      `**The first month.**\n${ul(H.firstMonth, x => `${x.when}: ${x.what}`)}`, `**How you are measured.**\n${ul(H.measures)}`,
      kv('Who you call', H.call), H.sops?.length ? `**Procedures.** ${H.sops.map(s => sopTitle['sops/' + s] || s).join('. ')}.` : '',
      `#### Job posting (public: says nothing about what the footage is for)`,
      `**${clean(P.headline)}**`, clean(P.about),
      `**What you will do.**\n${ul(P.do)}`, `**What you need.**\n${ul(P.need)}`, P.plus?.length ? `**Nice to have.**\n${ul(P.plus)}` : '', `**What we offer.**\n${ul(P.offer)}`, kv('How to apply', P.apply),
      `#### Offer letter (placeholders in braces are filled per candidate)`,
      `**${clean(O.heading)}**`, clean(O.opening), para(O.paragraphs),
      table(['Term', 'Detail'], O.terms.map(x => [x.label, x.v])),
      `**This offer depends on.**\n${ul(O.conditions)}`, `**What we expect from you.**\n${ul(O.expect)}`, clean(O.closing), `Signed: ${clean(O.signer)}`
    ); }).join('\n\n')
  )).join('\n\n'));
}

/* ---------- 15 reference ---------- */
{
  const m = J('metrics'), r = J('risks'), g = J('glossary');
  write('15-reference.md', 'Reference: metrics, risks, glossary', block(
    `## Metrics\n\n${m.metrics.map(x => block(`### ${clean(x.name)}`, clean(x.def), kv('How it is measured', x.how), kv('Owner', x.owner), kv('How to read it', x.read))).join('\n\n')}`,
    `## Risk register\n\n${r.risks.map(x => block(`### ${x.n}. ${clean(x.risk)}`, kv('How it ends', x.ends), kv('Control', x.control), kv('Owner', x.owner), kv('Signal', x.signal))).join('\n\n')}`,
    `## Glossary\n\n${g.terms.map(x => `**${clean(x.term)}.** ${clean(x.def)}`).join('\n\n')}`,
    `## Changelog\n\n${clean(g.ownership)}\n\n${ul(g.changelog, c => `${c.version}, ${c.date}: ${c.text}`)}`
  ));
}

/* ---------- 16 forms ---------- */
{
  const forms = site.nav.find(g => g.items.some(i => i.path === 'forms')).items.filter(i => i.path !== 'forms');
  write('16-standard-forms.md', 'Standard forms', forms.map(it => { const f = J(it.path); return block(
    `## ${clean(t(f.title))}`, clean(t(f.purpose)), kv('When', f.when),
    f.sections.map(s => `**${clean(t(s.title))}.**\n${ul(s.fields, x => `${t(x.label)}${x.type && x.type !== 'text' ? ` (${x.type})` : ''}`)}`).join('\n\n'),
    f.example ? `**Example.** ${clean(t(f.example.note))}\n\n${table(['Field', 'Example'], f.example.rows)}` : '',
    f.signoff?.length ? `**Sign-off.** ${f.signoff.map(x => clean(t(x))).join(', ')}.` : ''
  ); }).join('\n\n'));
}

/* ---------- 17 parent company template ---------- */
write('17-parent-company-TEMPLATE.md', 'The parent company and the client (fill this in, then remove TEMPLATE from the name)', `The company map deliberately says nothing about the parent company, the client, contract terms, targets, or investors. This project is internal, so this is where those facts live. Fill each section in the same plain style. Delete any section that should stay out of Claude.

## The two companies

- The US company: legal name, where it is registered, who owns it, what it does.
- KMSC, Egypt: legal name, commercial register number, who owns it, what it does.
- How money and data flow between them, and what each one signs.

## The client

- Who the client is, and the one sentence that describes what they do with the footage.
- The contract: start date, term, what is paid for, the rate basis, net terms, the approval threshold.
- What the client's system flags as fraud, what a strike means, and what ends the contract.
- Who at the client we talk to, and who on our side is allowed to (Adham only, today).
- What the cover phrase is when someone outside asks: an AI project.

## Targets

- Hours per month for the next three months, and the number of phones and sites that implies.
- Which task categories the client wants more of.
- Where the numbers come from and who updates them.

## Money

- Pay bands per role (never shown to workers).
- The referral rewards and how they are paid.
- The approval threshold and who signs.
- Banking, invoicing, and month-end dates.

## The people in the United States

- Founders, roles, and what each one decides.
- Investors and the board, if any.
- Advisers and the lawyer.

## What may never leave the company

- The client's name and app.
- Individual pay.
- Anything else you want Claude to refuse to write into a public document.`);

/* ---------- README ---------- */
fs.writeFileSync(path.join(out, 'README.md'), `# Knowledge pack for the Claude project

${stamp}

## How to use it

1. Create a project in Claude for Teams and share it with the organization.
2. Paste the text of 00-project-instructions.md into the project's instructions.
3. Upload every other file as project knowledge. Fill in 17-parent-company-TEMPLATE.md first, or leave it out.
4. When the site changes, run node scripts/export-md.mjs, then replace the files in the project.

## What is in it

${fs.readdirSync(out).filter(f => f !== 'README.md').sort().map(f => `- ${f}`).join('\n')}
`);
console.log('done:', fs.readdirSync(out).length, 'files in dist/knowledge');
