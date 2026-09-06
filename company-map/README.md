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
| A standard procedure (steps, what goes wrong, sign-off) | `data/sops/<slug>.json`, grouped by role in `data/sops/index.json` |
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
npm run interact                                # drives the drawer, toggle, calculator, checklists, letter, decision path
npm run check                                   # all three
node scripts/check-ar.mjs                       # every Arabic mirror matches its English file
node scripts/check-ui.mjs                       # every label a page uses has an Arabic string
node scripts/structure-check.mjs data/people.json data/ar/people.json   # after a content edit: same keys, same array lengths, ids untouched
node scripts/export-md.mjs                      # the site as Markdown, into dist/knowledge, for a Claude project
node scripts/report-smoke.mjs                   # the daily report database, reached with the public key the way the pages reach it
```

The screenshot tool flags horizontal overflow and console errors. Open the images and look.

## One file

```
npm run bundle       # dist/company-map.html
```

Every page, the data, the styles, and the fonts in one HTML file with an in-page router. Open it anywhere a single page can be hosted or previewed; no server needed. It is a preview format, not the deployment: it does not update when the JSON changes until you rebuild it.

## Daily report

Two pages talk to a database instead of JSON files. They are not part of the single-file copy; there, the forms page links to the hosted site.

- `report/` is the daily report form. One form for every site, in by 6:00 PM, filled in by the site lead on direct and partner sites alike. Fifteen fields: date, reporter (a dropdown, or a typed name), site, channel (automatic), phones deployed, phones uploaded, hours recorded, hours uploaded, phones still holding footage, wearers scheduled, wearers present, phones down, flags received, incident yes or no with one line, gear needed, anything else. It needs the team code, typed once and kept on the phone. A second send for the same site and day replaces the first.
- `report/day/` is the company report. Every site's report added up into one page, with the missing sites (counted as zero), the late ones, the totals against the monthly target, the incidents, the gear needed, and the last two weeks. It needs the management code. The same page manages the codes, the deadline, the reporter names, the monthly targets, and the Slack webhook. "Copy as text" makes a version for the management group.
- `sites/` is the site registry, the sourcing list: every site we run and every site we could film with, with a status (prospect, contacted, agreed, ready to film, active, paused, closed), channel, hub area, city, industry, book, site lead, contact, phones it can take, source, last contact, and notes. Active sites are the ones the daily report form lists. Management code.
- Automatic posts: with a Slack incoming webhook saved on the company report page, the database posts the chase list of missing sites at 6:15 PM and the day's number at 8:00 PM, Cairo time. Without one, nothing posts and nothing breaks.

The database is the Supabase project `zvotevxrebkqjncuyjlw`, the one that already holds the August tracker, tables and functions named `dr_*`. `data/report.json` holds the project URL and the public key, which can only read the list of active sites. Every write and every read of a report goes through a database function that checks a code. The codes live in the `dr_settings` table, not in this repository. A job in the database takes a snapshot of the report at 6:10 PM Cairo time every day into `dr_daily`, for the record. The schema is in `scripts/report-schema.sql`.

## Deploy it

Vercel, from the root of this repository. The root `vercel.json` serves the `company-map` folder as it is: no build command, clean URLs, and a no-index header. Every push to `main` deploys.

## How it is built

- `css/site.css` is the design system: tokens, type, layout, components, SVG classes, print, and right-to-left rules.
- `js/app.js` is the runtime: loads JSON, renders the header, rail, and footer from `site.json`, runs the Arabic toggle, persists checklists with `localStorage` (or `window.storage` where it exists), opens every collapsible for print.
- `js/svg.js` draws diagrams in code. Every diagram is an SVG with a `viewBox`, designed at 360 units wide so it reads at 390px.
- `js/pages/*.js` is one module per page.
- `GUIDE.md` is the voice, the hard rules, and the design system, for anyone who edits or extends the site.

Fonts are self-hosted: Bricolage Grotesque and IBM Plex Sans Arabic, both under the SIL Open Font License.
