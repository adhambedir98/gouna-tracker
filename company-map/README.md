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

Seven pages talk to a database instead of JSON files. They are not part of the single-file copy; there, they link to the hosted site.

Everyone at a site (the evening check-out and the incident form take the team code, typed once; the check-in takes none):

- `report/checkin/` is the morning check-in, by 9:00 AM: your name (a Portfolio Manager or a partner, from the team directory), the site (a person tied to one site picks it), recording started at, employees present, phones down, any problem with one line, and a ledger with one row per phone that is recording: the phone picked from a list of 1 to 270 (`phones_max` setting), its minutes all time, the minutes still saved on it. Phones active is typed; left empty, the number of rows stands in.
- `report/` is the evening check-out, by 6:00 PM: phones deployed, employees present, phones down, the same ledger (the rows start from the morning's phones for that site, or from the phones this device used last for it, with the minutes left empty), incident yes or no with one line, what the site needs, anything else. The day's hours are the rise in each phone's all-time minutes since that morning's row, or since its last row when there was no morning (`dr_phone_log`, kind morning or evening). A phone listed twice, or a number outside the list, is refused. A second send for the same site and day replaces the first. Marking an incident points to the incident form.
- `report/incident/` is the incident form: date, time, site or another place, who, role, kind, what happened, people, phones, what was done, who was told, still open, what is needed now. Each one gets a number.

Management, with the management code:

- `report/day/` is the company report: a headline in plain words, then the five numbers (phones active, hours today, hours per phone, opt-in rate, present against filming) each with its last 30 days as a sparkline and a 7 day and month comparison, the morning and the evening as rows of boxes, the sites that need attention tonight with the reason, six charts for the last 30 days (hours per day with uploaded and still on the phones and a cell per day for sites in, phones filming against employees present, hours per phone, opt-in rate, sites in by the deadline, phones in the morning against the evening), the month as a ring with three boxes (days gone, hours a day still needed, on pace for), four charts by site (hours, present against filming, hours per phone, opt-in), a by-team table, the site table with a week strip per site, the incidents filed that day, and the incident lines from the check-outs. Every chart is SVG drawn in code (`js/charts.js`) at the width it is shown at. "Copy as text" makes a plain version for the management group; "Print" redraws the charts at paper width first. The same page manages the codes, the two deadlines, the monthly targets, the Slack webhook, the evening email, and shows the activity log.
- `report/incidents/` lists everything filed, open first. Read one, close it with a line on how it ended, or reopen it.
- `sites/` is the site database: every site we run and every site we could film with, with a status pipeline (prospect, contacted, agreed, ready to film, active, paused, closed), channel (Direct or Partner), hub area (the three Cairo areas, Alexandria, Mansoura, New Mansoura, Damietta), city, industry, the Portfolio Manager picked from the team (every site has one; a partner puts their own name) and, on Direct sites only, the site lead, contact, phones it can take, source, last contact, notes. Opening a site shows its history: hours this month, check-ins, reports, incidents, and the people at it. Active sites are the ones on the forms.
- `team/` is the team directory: name, role, channel, site, phone, notes, active. The forms take their name lists from it. Someone who leaves is set to not active, never deleted.

Automatic posts: with a Slack incoming webhook saved on the company report page, the database posts the morning list at 9:15 AM, the chase list of missing sites at 6:15 PM, and the day's number at 8:00 PM, Cairo time. With a Resend key and an address saved on the same page, the whole report goes out as an HTML email at 8:05 PM (the five numbers, the month pace, a bar strip of the last two weeks, the site table, incidents, and needs). Without a webhook or a key, nothing posts and nothing breaks.

The database is the Supabase project `zvotevxrebkqjncuyjlw`, tables and functions named `dr_*`: `dr_sites`, `dr_people`, `dr_checkins`, `dr_reports`, `dr_incidents`, `dr_log`, `dr_settings`, `dr_daily`. `data/report.json` holds the project URL and the public key, which can only call the functions: `dr_form_options` (the lists the forms need), `dr_checkin` (no code), `dr_submit` and `dr_incident` (each checks the team code), `dr_report` and `dr_admin` (each checks the management code). Every table has row level security on and no policies, so nothing is readable or writable except through those functions. The codes live in the `dr_settings` table, not in this repository. A job takes a snapshot of the report at 6:10 PM Cairo time every day into `dr_daily`, for the record. The schema is in `scripts/report-schema.sql`, with the history and email additions in `scripts/report-schema-v4.sql` and the two-ended phone ledger in `scripts/report-schema-v5.sql`; `node scripts/report-smoke.mjs` checks the live database from outside with the public key.

## Live edits

Every page has an Edit button in the top bar. The management code and a name are asked once, in a box on the page (never in a browser dialog: embedded views and some desktop apps drop those without a word). Then click any text, change it, and click away: the change is saved to the database (`dr_edits`) and everyone sees it on their next load. Text inside a diagram opens a small box instead. In edit mode every section also gets a small bar: Up and Down move it among its neighbours, Hide and Delete take it off the page for everyone (it stays visible in edit mode, hatched, with a Show again button). A section is keyed by its id when that id is the only one on the page, or by its tag and position in the source (counted from the source order, so a moved section keeps its key), and the row also carries the section's label, so a row whose key has drifted to another section is matched by its label or left alone. The same row applies in both languages. Numbered lists renumber after a move or a hide. `edits/` lists every edit, newest first, with an Undo. The edits sit on top of the source files until `node scripts/pull-edits.mjs` writes the text rows into the JSON, the page modules, and the label keys (`--dry` to preview; with `DR_REPORT_CODE` set it marks the rows applied). It looks in the page's own files first, and a text found in several other files is listed instead of written. Section rows are printed for a hand edit; once they are in the source, `--sections-done` marks them applied, or the Edits page's "Done in the source" button does it one row at a time. `scripts/edits-schema.sql` is the table and the function. `DR_REPORT_CODE=... node scripts/live-edit.mjs` drives the whole flow against the real database with real typing, desktop and phone, and removes what it wrote. `node scripts/shoot-edit.mjs` screenshots edit mode, bars drawn, on fourteen pages at two widths (`--page rules` for one), with the database mocked. The single-file copy has no network, so its Edit button opens the same page on the live site.

## Deploy it

Vercel, from the root of this repository. The root `vercel.json` serves the `company-map` folder as it is: no build command, clean URLs, and a no-index header. Every push to `main` deploys.

## How it is built

- `css/site.css` is the design system: tokens, type, layout, components, SVG classes, print, and right-to-left rules.
- `js/app.js` is the runtime: loads JSON, renders the header, rail, and footer from `site.json`, runs the Arabic toggle, persists checklists with `localStorage` (or `window.storage` where it exists), opens every collapsible for print.
- `js/svg.js` draws diagrams in code. Every diagram is an SVG with a `viewBox`, designed at 360 units wide so it reads at 390px.
- `js/pages/*.js` is one module per page.
- `GUIDE.md` is the voice, the hard rules, and the design system, for anyone who edits or extends the site.

Fonts are self-hosted: Bricolage Grotesque and IBM Plex Sans Arabic, both under the SIL Open Font License.
