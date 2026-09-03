# Vound company map

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

Strings on the pages workers use (who to call, rules, the never list, onboarding gate, training) are objects with `en` and `ar`. Change both.

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
```

The screenshot tool flags horizontal overflow and console errors. Open the images and look.

## One file

```
npm run bundle       # dist/vound-company-map.html
```

Every page, the data, the styles, and the fonts in one HTML file with an in-page router. Open it anywhere a single page can be hosted or previewed; no server needed. It is a preview format, not the deployment: it does not update when the JSON changes until you rebuild it.

## Deploy it

Vercel. Create a project from this repository and set the root directory to `company-map`. No build command, no output directory. `vercel.json` turns on clean URLs and caches the fonts.

## How it is built

- `css/site.css` is the design system: tokens, type, layout, components, SVG classes, print, and right-to-left rules.
- `js/app.js` is the runtime: loads JSON, renders the header, rail, and footer from `site.json`, runs the Arabic toggle, persists checklists with `localStorage` (or `window.storage` where it exists), opens every collapsible for print.
- `js/svg.js` draws diagrams in code. Every diagram is an SVG with a `viewBox`, designed at 360 units wide so it reads at 390px.
- `js/pages/*.js` is one module per page.
- `GUIDE.md` is the voice, the hard rules, and the design system, for anyone who edits or extends the site.

Fonts are self-hosted: Bricolage Grotesque and IBM Plex Sans Arabic, both under the SIL Open Font License.
