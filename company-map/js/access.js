// Who may open what. The database decides (dr_section and the roles setting); this is the same rule in the browser,
// so the rail only shows what a person can open and a page can say no before it asks for anything.
// The three site forms are open to everybody, with no account and no code: the people at the sites have a day to run.

export const SECTIONS = ['company', 'everyday', 'training', 'forms', 'sops', 'manual', 'numbers', 'money', 'jobs', 'mine', 'command', 'admin', 'accounts'];
export const ROLES = ['founder', 'management', 'portfolio-manager', 'site-lead', 'operator', 'partner', 'candidate', 'none'];
export const OPEN = ['checkout', 'checkin', 'report/incident', 'report', 'report/checkin'];   // the daily forms, open to anybody at a site; the last two are the old addresses
export const ROLE_LABEL = {
  founder: { en: 'Founder', ar: 'مؤسس' },
  management: { en: 'Management', ar: 'إدارة' },
  'portfolio-manager': { en: 'Portfolio Manager', ar: 'مدير محفظة' },
  'site-lead': { en: 'Site lead', ar: 'مسؤول موقع' },
  operator: { en: 'Operator', ar: 'مشغّل' },
  partner: { en: 'Partner', ar: 'شريك' },
  candidate: { en: 'Candidate', ar: 'مرشح' },
  none: { en: 'No role yet', ar: 'بلا دور بعد' }
};
export const SECTION_LABEL = {
  company: { en: 'The company', ar: 'الشركة' },
  everyday: { en: 'Every day', ar: 'كل يوم' },
  training: { en: 'Training', ar: 'التدريب' },
  forms: { en: 'Forms', ar: 'النماذج' },
  sops: { en: 'Procedures', ar: 'الإجراءات' },
  manual: { en: 'How things work', ar: 'كيف تعمل الأمور' },
  numbers: { en: 'Numbers', ar: 'الأرقام' },
  money: { en: 'Money and risk', ar: 'المال والمخاطر' },
  jobs: { en: 'Jobs', ar: 'الوظائف' },
  mine: { en: 'My sites', ar: 'مواقعي' },
  command: { en: 'The whole operation', ar: 'العملية كاملة' },
  admin: { en: 'The company lists', ar: 'قوائم الشركة' },
  accounts: { en: 'Who may read', ar: 'من يقرأ' }
};

// the section a page belongs to, from its path
export function pageSection(path) {
  const p = String(path || '');
  if (p === '') return 'company';
  if (p === 'login' || p === 'account') return 'public';
  if (OPEN.includes(p)) return 'forms';
  if (p.startsWith('sops')) return 'sops';
  if (p.startsWith('jobs')) return 'jobs';
  if (p === 'manual/money' || p === 'risks') return 'money';
  if (p.startsWith('manual') || p === 'systems') return 'manual';
  if (p.startsWith('training')) return 'training';
  if (p.startsWith('forms')) return 'forms';
  if (p === 'mine') return 'mine';
  if (['report/day', 'report/incidents', 'dashboard', 'uploads'].includes(p)) return 'command';
  if (['sites', 'team', 'edits'].includes(p)) return 'admin';
  if (p === 'accounts') return 'accounts';
  if (['metrics', 'glossary'].includes(p)) return 'numbers';
  if (['rules', 'fraud', 'call', 'never', 'onboarding', 'incidents'].includes(p)) return 'everyday';
  return 'company';                                   // start, map, channels, day
}

// the section a data file belongs to, the same rule dr_section uses in the database
export function fileSection(path) {
  const p = String(path || '').startsWith('data/ar/') ? 'data/' + String(path).slice(8) : String(path || '');
  if (p === 'data/site.json' || p === 'data/report.json') return 'public';
  if (p === 'data/ui.json' || p === 'data/index.json') return 'chrome';   // the labels, and the list of which Arabic mirrors exist
  if (p === 'data/manual/money.json' || p === 'data/risks.json') return 'money';
  if (p === 'data/manual/quality.json') return 'everyday';   // the eight fraud patterns live here, and the fraud page is a worker page
  if (p.startsWith('data/sops/')) return 'sops';
  if (p.startsWith('data/jobs/')) return 'jobs';
  if (p.startsWith('data/manual/')) return 'manual';
  if (p.startsWith('data/forms/')) return 'forms';
  if (['data/systems.json', 'data/decisions.json'].includes(p)) return 'manual';
  if (p === 'data/channels.json') return 'company';   // the process page is a company page, and this is what it reads
  if (['data/metrics.json', 'data/glossary.json'].includes(p)) return 'numbers';
  if (p === 'data/training.json') return 'training';
  if (['data/start.json', 'data/people.json', 'data/day.json'].includes(p)) return 'company';
  if (['data/rules.json', 'data/fraud.json', 'data/call.json', 'data/never.json', 'data/gate.json', 'data/incidents.json'].includes(p)) return 'everyday';
  return 'company';
}

/* Where somebody belongs when they have just signed in. A founder or management starts at the start page, which is the whole
   map. A person who runs sites starts at their own sites. Anybody else starts at the first page their role opens. */
export function landing(me) {
  const secs = (me && me.sections) || [];
  if (secs.includes('company')) return '';
  if (secs.includes('mine')) return 'mine';
  if (secs.includes('everyday')) return 'rules';
  if (secs.includes('training')) return 'training';
  if (secs.includes('jobs')) return 'jobs';
  return 'account';
}

export const mayOpen = (me, path) => OPEN.includes(String(path || '')) || pageSection(path) === 'public'
  || (!!me && me.status === 'active' && (me.sections || []).includes(pageSection(path)));
