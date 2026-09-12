// Who may open what. The database decides (dr_section and the roles setting); this is the same rule in the browser,
// so the rail only shows what a person can open and a page can say no before it asks for anything.
// A page that is open to everybody carries open: true here: the three site forms, which the people at the sites fill in with the team code and no account.

export const SECTIONS = ['company', 'everyday', 'training', 'forms', 'sops', 'manual', 'numbers', 'jobs', 'online'];
export const ROLES = ['founder', 'management', 'portfolio-manager', 'site-lead', 'operator', 'partner', 'candidate', 'none'];
export const OPEN = ['report', 'report/checkin', 'report/incident'];   // the daily forms, open with the team code
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
  manual: { en: 'How things work', ar: 'كيف تسير الأمور' },
  numbers: { en: 'Numbers', ar: 'الأرقام' },
  jobs: { en: 'Jobs', ar: 'الوظائف' },
  online: { en: 'Management pages', ar: 'صفحات الإدارة' }
};

// the section a page belongs to, from its path
export function pageSection(path) {
  const p = String(path || '');
  if (p === '') return 'company';
  if (p === 'login' || p === 'account') return 'public';
  if (OPEN.includes(p)) return 'forms';
  if (p.startsWith('sops')) return 'sops';
  if (p.startsWith('jobs')) return 'jobs';
  if (p === 'manual/money') return 'numbers';
  if (p.startsWith('manual') || p === 'systems') return 'manual';
  if (p.startsWith('training')) return 'training';
  if (p.startsWith('forms')) return 'forms';
  if (['report/day', 'report/incidents', 'sites', 'team', 'edits', 'dashboard', 'accounts'].includes(p)) return 'online';
  if (['metrics', 'risks', 'glossary'].includes(p)) return 'numbers';
  if (['rules', 'fraud', 'call', 'never', 'onboarding', 'incidents'].includes(p)) return 'everyday';
  return 'company';                                   // start, map, channels, day
}

// the section a data file belongs to, the same rule dr_section uses in the database
export function fileSection(path) {
  const p = String(path || '').startsWith('data/ar/') ? 'data/' + String(path).slice(8) : String(path || '');
  if (p === 'data/site.json' || p === 'data/report.json') return 'public';
  if (p === 'data/ui.json') return 'chrome';
  if (p === 'data/manual/money.json') return 'numbers';
  if (p === 'data/manual/quality.json') return 'everyday';   // the eight fraud patterns live here, and the fraud page is a worker page
  if (p.startsWith('data/sops/')) return 'sops';
  if (p.startsWith('data/jobs/')) return 'jobs';
  if (p.startsWith('data/manual/')) return 'manual';
  if (p.startsWith('data/forms/')) return 'forms';
  if (['data/systems.json', 'data/decisions.json'].includes(p)) return 'manual';
  if (p === 'data/channels.json') return 'company';   // the process page is a company page, and this is what it reads
  if (['data/metrics.json', 'data/risks.json', 'data/glossary.json'].includes(p)) return 'numbers';
  if (p === 'data/training.json') return 'training';
  if (['data/start.json', 'data/people.json', 'data/day.json'].includes(p)) return 'company';
  if (['data/rules.json', 'data/fraud.json', 'data/call.json', 'data/never.json', 'data/gate.json', 'data/incidents.json'].includes(p)) return 'everyday';
  return 'company';
}

export const mayOpen = (me, path) => OPEN.includes(String(path || '')) || pageSection(path) === 'public'
  || (!!me && me.status === 'active' && (me.sections || []).includes(pageSection(path)));
