# Company map

The single answer to "how does this company work". One page per question. Built for a floor worker in Cairo on a phone, a Portfolio Manager between sites, and a founder.

Static site. No build step. Plain HTML, CSS, and JavaScript. Content lives in JSON.

## Run it

```
cd company-map
npm install          # once, for the screenshot tool
npm run dev          # http://localhost:4173
```

Or open it with any static server pointed at this folder. The pages fetch `data/*.json`, so a server is needed; `file://` will not work.

## Edit it

Mano owns the map. Changes go through him.

| To change | Edit |
| --- | --- |
| A name, a title, who reports to whom, a role card | `data/people.json` |
| A who-to-call route, backup, time rule, or what to bring | `data/call.json` |
| The day, week, or month | `data/day.json` |
| A rule or the penalty table | `data/rules.json` |
| The onboarding gate | `data/gate.json` |
| Training modules and pocket cards | `data/training.json` |
| The never list | `data/never.json` |
| An incident playbook | `data/incidents.json` |
| A manual subsystem (how it works, procedures, what breaks, training, questions, and its diagrams) | `data/manual/<slug>.json` |
| Metrics, risks, glossary, changelog | `data/metrics.json`, `data/risks.json`, `data/glossary.json` |
| Company numbers, navigation, version and date, chrome labels | `data/site.json` |
| The channels diagram and the decision path | `data/channels.json` |
| Mission, values, start-here cards | `data/start.json` |
| The systems page and the open decisions box | `data/systems.json`, `data/decisions.json` |
| A standard procedure (steps, what goes wrong, sign-off) | `data/sops/<slug>.json`, grouped by role in `data/sops/index.json`. A process step lists its procedures in `sops` in `data/channels.json` |
| A standard form | `data/forms/<slug>.json` |
| A job: its handbook, the posting for job boards, and the offer letter | `data/jobs/<slug>.json`, grouped by team in `data/jobs/index.json`, Arabic in `data/ar/jobs/<slug>.json` |

Strings on the pages workers use (who to call, rules, the never list, onboarding gate, training) are objects with `en` and `ar`. Change both. Larger files have an Arabic mirror under `data/ar/` with the same shape, listed in `data/ar/index.json`; edit both files and keep every array the same length.

Add a line to `changelog` in `data/glossary.json` and bump `version` and `date` in `data/site.json` with every change.

## Check it

```
npm run shoot                                   # screenshots of every page at 390 and 1280 into shots/
node scripts/shoot.mjs --page call --lang ar    # one page, in Arabic
node scripts/shoot.mjs --page training --print  # print layout
node scripts/shoot.mjs --page rules --width 390 --from 0 --maxh 3000   # a slice of a tall page
npm run lint                                    # em dashes, emoji, forbidden names, all-caps labels
npm run interact                                # drives the drawer, toggle, calculator, checklists, letter, decision path, and every online page against a mocked database
npm run check                                   # all three
node scripts/check-ar.mjs                       # every Arabic mirror matches its English file
node scripts/check-ui.mjs                       # every label a page uses has an Arabic string
node scripts/structure-check.mjs data/people.json data/ar/people.json   # after a content edit: same keys, same array lengths, ids untouched
node scripts/export-md.mjs                      # the site as Markdown, into dist/knowledge, for a Claude project
node scripts/report-smoke.mjs                   # the evening check-out database, reached with the public key the way the pages reach it
```

The screenshot tool flags horizontal overflow and console errors. Open the images and look.

## One file

```
npm run bundle       # dist/company-map.html
```

Every page, the data, the styles, and the fonts in one HTML file with an in-page router. Open it anywhere a single page can be hosted or previewed; no server needed. It is a preview format, not the deployment: it does not update when the JSON changes until you rebuild it.

## The online pages

Nine pages talk to a database instead of JSON files. They are not part of the single-file copy; there, they link to the hosted site.

Everyone at a site, with no account and no code. A person who is signed in is not asked their name, and the site they cover is already chosen:

- `report/checkin/` is the morning check-in, by 9:00 AM: your name (a Portfolio Manager or a partner, from the team directory), the site (a person tied to one site picks it), recording started at, employees present, phones down, any problem with one line, and a ledger with one row per phone that is recording: the phone picked from a list of 1 to 270 (`phones_max` setting), its minutes all time, the minutes still saved on it. Phones active is typed; left empty, the number of rows stands in.
- `report/` is the evening check-out, by 6:00 PM: phones deployed, employees present, phones down, the same ledger (the rows start from the morning's phones for that site, or from the phones this device used last for it, with the minutes left empty), incident yes or no with one line, what the site needs, anything else. The day's hours are the rise in each phone's all-time minutes since that morning's row, or since its last row when there was no morning (`dr_phone_log`, kind morning or evening). A phone listed twice, or a number outside the list, is refused. A second send for the same site and day replaces the first. Marking an incident points to the incident form.
- `report/incident/` is the incident form: date, time, site or another place, who, role, kind, what happened, people, phones, what was done, who was told, still open, what is needed now. Each one gets a number.

Management, with an account. No page asks for a code:

- `dashboard/` is the day in one page, and the only management page the operation needs open: a headline in plain words, four numbers (hours today, phones active, hours per phone, opt-in rate) each with its last 30 days as a sparkline, the map of Egypt drawn in code (`js/sitemap.js` over `js/egypt.js`, with the coast and borders, the Nile and its Delta branches, the canal, the main roads, the towns, a degree grid, a scale bar and a north arrow) carrying one dot per business with its phone count on it, and under it the business table: a row per business with its morning, its evening, its hours, the hours still on its phones, its phones, its people present and its hours a phone, footed by each channel and then the day. Click a dot or a row and that business opens: its dot fans out into one dot per phone, and its phone ledger opens under the row with a total row. Under the table the month reads as a ring and one sentence. The dot is green when the business records 5 hours a day or more over the window (7, 14, or 30 days), yellow from 3, red under 3, grey when the window holds no evening reading. A phone's day is the rise in its all-time minutes since that morning's row, or since its last row when there was no morning, the same sum the evening check-out uses. A business sits on the map by its pin (latitude and longitude on the site database), else by its city, else by a place in its name, else by its hub area, and otherwise in the list only. Only the businesses that are running are drawn or listed. The day picker reads any day, the same way the company report did, and the page redraws itself every five minutes while it is on today. Three folds hold the rest: the morning and the evening number by number, six charts for the last 30 days, and four charts putting business against business. "Copy as text" makes a plain version for the management group; "Print" redraws the charts at paper width and opens every fold first. `report/day/` is the old address and redirects here.
- `report/incidents/` lists everything filed, open first. Read one, close it with a line on how it ended, or reopen it.
- `sites/` is the site database: every site we run and every site we could film with, with a status pipeline (prospect, contacted, agreed, ready to film, active, paused, closed), channel (Direct or Partner), hub area (the three Cairo areas, Alexandria, Mansoura, New Mansoura, Damietta), city, industry, the Portfolio Manager picked from the team (every site has one; a partner puts their own name) and, on Direct sites only, the site lead, contact, phones it can take, source, last contact, notes. Opening a site shows its history: hours this month, check-ins, reports, incidents, and the people at it. Active sites are the ones on the forms.
- `team/` is the team directory: name, role, channel, site, work email, phone, notes, active. The forms take their name lists from it, and the work email is what lets that person make their own account. Someone who leaves is set to not active, never deleted.
- `mine/` is My sites, for a Portfolio Manager, a site lead or a partner: their own sites and nobody else's, with what is missing right now, what the phones are still holding, and the buttons to send what is due.

Automatic posts: with a Slack incoming webhook saved on the company report page, the database posts the morning list at 9:15 AM, the chase list of missing sites at 6:15 PM, and the day's number at 8:00 PM, Cairo time. With a Resend key and an address saved on the same page, the whole report goes out as an HTML email at 8:05 PM (the five numbers, the month pace, a bar strip of the last two weeks, the site table, incidents, and needs). Without a webhook or a key, nothing posts and nothing breaks.

The database is the Supabase project `zvotevxrebkqjncuyjlw`, tables and functions named `dr_*`: `dr_sites`, `dr_people`, `dr_checkins`, `dr_reports`, `dr_incidents`, `dr_phone_log`, `dr_log`, `dr_settings`, `dr_daily`, `dr_users`, `dr_content`, `dr_events`. `data/report.json` holds the project URL and the public key, which can only call the functions. The three site forms (`dr_checkin`, `dr_submit`, `dr_incident`) take no code and no account. The phone count for a day is the ledger: neither form asks anybody to type a number of phones, because a typed number and a list of phones are two answers to one question and they drifted apart. The management functions (`dr_report`, `dr_map`, `dr_admin`, `dr_content_put`, `dr_edit`, `dr_accounts`) go through `dr_may`, which lets through an active account with the right role. The management code is a spare key for the scripts, and a manager's: it opens what management opens and never a founder's page, so the accounts page and the settings take an account and nothing else. No page in the browser asks for it. `dr_mine` hands a person their own sites. Every table has row level security on and no policies and no privileges, so nothing is readable or writable except through those functions. The codes live in `dr_settings`, not in this repository. A job takes a snapshot of the report at 6:10 PM Cairo time every day into `dr_daily`, for the record. The schema files under `scripts/` are the written record, newest last: `report-schema.sql` through `report-schema-v9.sql`, plus `edits-schema.sql`; `node scripts/report-smoke.mjs` checks the live database from outside with the public key, and with `DR_REPORT_CODE` set it also sends a whole day for real and takes it off again.

## Live edits

A founder or a manager who puts `?edit=1` in the address gets an Edit button in the top bar. Nothing is asked for: the account says who is making the change. Then click any text, change it, and click away: the change is saved to the database (`dr_edits`) and everyone sees it on their next load. Text inside a diagram opens a small box instead. In edit mode every section also gets a small bar: Up and Down move it among its neighbours, Hide and Delete take it off the page for everyone (it stays visible in edit mode, hatched, with a Show again button). A section is keyed by its id when that id is the only one on the page, or by its tag and position in the source (counted from the source order, so a moved section keeps its key), and the row also carries the section's label, so a row whose key has drifted to another section is matched by its label or left alone. The same row applies in both languages. Numbered lists renumber after a move or a hide. `edits/` lists every edit, newest first, with an Undo. The edits sit on top of the source files until `node scripts/pull-edits.mjs` writes the text rows into the JSON, the page modules, and the label keys (`--dry` to preview; with `DR_REPORT_CODE` set it marks the rows applied). It looks in the page's own files first, and a text found in several other files is listed instead of written. Section rows are printed for a hand edit; once they are in the source, `--sections-done` marks them applied, or the Edits page's "Done in the source" button does it one row at a time. `scripts/edits-schema.sql` is the table and the function. `DR_REPORT_CODE=... node scripts/live-edit.mjs` drives the whole flow against the real database with real typing, desktop and phone, and removes what it wrote. `node scripts/shoot-edit.mjs` screenshots edit mode, bars drawn, on fourteen pages at two widths (`--page rules` for one), with the database mocked. The single-file copy has no network, so its Edit button opens the same page on the live site.

## Deploy it

Vercel, from the root of this repository. The root `vercel.json` serves the `company-map` folder as it is: no build command, clean URLs, and a no-index header. Every push to `main` deploys.

## How it is built

- `css/site.css` is the design system: tokens, type, layout, components, SVG classes, print, and right-to-left rules.
- `js/app.js` is the runtime: loads JSON, renders the header, rail, and footer from `site.json`, runs the Arabic toggle, persists checklists with `localStorage` (or `window.storage` where it exists), opens every collapsible for print.
- `js/svg.js` draws diagrams in code. Every diagram is an SVG with a `viewBox`, designed at 360 units wide so it reads at 390px.
- `js/pages/*.js` is one module per page.
- `GUIDE.md` is the voice, the hard rules, and the design system, for anyone who edits or extends the site.

Fonts are self-hosted: Bricolage Grotesque and IBM Plex Sans Arabic, both under the SIL Open Font License.

## Who may read it

Everything except the three site forms is behind an account. The team list decides who may have one: put a person's work email on `team/`, and signing up with it opens their account at that person's role, with nobody approving anything by hand. An email the list does not know waits with no role until a founder gives it one on `accounts/`. The role decides which sections open, and the rail only shows what the reader can open.

| Role | Opens |
| --- | --- |
| Founder | everything, and only the three of them: money and the risk register, the accounts page, and the settings are theirs alone |
| Management | everything except money, the accounts page and the settings |
| Portfolio Manager | the company, every day, training, forms, procedures, numbers, and My sites |
| Site lead | every day, training, forms, procedures, and My sites |
| Partner | every day, forms, and My sites |
| Operator | every day, training, forms |
| Candidate | the jobs |

My sites, the company report, the dashboard and the incidents list are scoped: a Portfolio Manager, a site lead and a partner see their own sites through `mine/`, and the company-wide pages are management and founders.

The three site forms (`report/checkin/`, `report/`, `report/incident/`) ask for no account and no code: the people at the sites have a day to run and it must not stop.

The content is not on the web server. `company-map/data/*.json` is left out of the deployment (`.vercelignore`), and the pages read it through `dr_content`, which returns only the files the reader's role may open. The two files a closed page still needs, the navigation and the address of the database, are the exception. The files in `data/` stay the source of truth; `DR_REPORT_CODE=... node scripts/push-content.mjs` copies what has changed into the database, and that is the step that publishes a content edit.

`accounts/` is for founders: everybody who has an account, what each role opens, and what the guard has seen. Most people never appear here waiting, because the team list opened their account for them.

## What the guard can and cannot see

A browser is never told that a screenshot was taken. There is no such event, on any browser, and a photograph of the screen with a second phone leaves no trace at all. Two things do work, and both are in place:

- **The mark.** Every page carries the reader's name, their email, and the time, tiled faintly across it and darker on paper. A picture of a page says where it came from.
- **The signals a browser does give**, sent the moment they happen and posted straight to Slack and the report email: the Print Screen key (Windows and Linux; macOS keeps its screenshot keys and never tells the page), printing, saving the page, the developer tools, this page starting a screen capture, and a copy of more than about a page of text. `dr_event` writes them to `dr_events` and calls `dr_alert`, at most one alert a minute per person and kind.

With a PostHog key saved on the company report page, the same events go to PostHog as well, identified by the person, with autocapture on. Without a key nothing loads and nothing leaves the browser.

The schema is in `scripts/report-schema-v7.sql`: `dr_users`, `dr_content`, `dr_events`, and the functions `dr_me`, `dr_content`, `dr_content_put`, `dr_event`, `dr_alert`, `dr_accounts`.
