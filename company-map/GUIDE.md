# How this site is built, and how to edit it

The company map is a static site. No build step. Every page is a folder with an `index.html`, a shared stylesheet, and a small page script that reads JSON from `data/` and draws the page.

Mano owns the map. To change a name, a number, a rule, or a route, edit the JSON in `data/`. Push. Vercel serves it.

## Folders

```
company-map/
  index.html            Start page
  map/index.html        One folder per page
  manual/quality/…      Manual subsystem pages
  css/site.css          The design system. Tokens, type, layout, components, SVG classes, print, RTL
  js/app.js             Runtime: JSON loading, language toggle, header and rail, storage, print
  js/svg.js             Helpers for drawing SVG diagrams in code
  js/pages/*.js         One module per page
  data/*.json           All content
  data/manual/*.json    One file per manual subsystem
  fonts/                Bricolage Grotesque and IBM Plex Sans Arabic, self-hosted
  scripts/shoot.mjs     Screenshots every page at 390 and 1280 with Playwright
  scripts/lint-content.mjs  Fails on em dashes, emoji, forbidden names, all-caps labels
```

## Voice. Non-negotiable.

Short sentences. Plain words. Every word earns its place or it goes. No preambles, no "in this section", no explaining what a diagram already shows. Never use an em dash anywhere, in any language. Never use an en dash either; write "to" or a comma. Sentence case everywhere; no all-caps labels (KMSC, EGP, MDM, UPS, PPE, QC, ID, IMEI, GB, TB, Mbps, ITIDA, VAT, DPO, PIP, UPS are the only exceptions). No icons, no emoji, no decorative boxes. If a sentence can be a picture, make the picture.

## Hard rules about content

- Never name the client, the client's app, or the client's parent company. Say "the client" and "the collection app".
- No individual pay, no equity, no ban counts, no partner pricing. Company-wide penalties and referral rewards from the handbook are fine.
- No one named Mustafa or Yahia. The org is exactly: Adham (CEO), Youssif (CTO), Aly (Hardware); Moharam (Director of Operations) and Mano (Chief of Staff) under Adham; five Portfolio Managers (Mazen, also Head of Activation; Eyad; Ahmed Sabry; Manhal; Hazem) under Moharam; operators under them; Youssef Medhat (QC Lead) under Youssif; Ali (hardware design, Egypt) under Aly; open seats for China procurement and the tech team.
- Facts come from `data/`. Do not invent new numbers. The numbers that exist: about 270 phones, 1,500 people, 12,000 hours last month, 15,000 this month, 25,000 next. Direct operations about 120 phones. Shedi about 110 phones across hotels in four cities. Mansoura partner about 30. 5.4 GB per hour. 1,000 hours a day is 5.4 TB, about 500 Mbps sustained. A hub passes at 20 phones, 8 hours, 300 Mbps sustained. Per 1,000 hours a day: about 300 phones, 30 operators, 5 reviewers, 500 Mbps. One operator per 10 phones, a 10% trained bench, a 10% spare pool. Data-protection licensing hard deadline November 1, 2026.

## Design

Warm paper, deep green-black ink, one dark green accent. Hairlines, not shadows. No border radius except circles. Bricolage Grotesque for everything Latin; IBM Plex Sans Arabic for Arabic. Mobile first: every page must read at 390px wide. Diagrams are SVG drawn in code with a `viewBox`, responsive, readable at 390px. Design diagrams at a 360 to 400 unit width in portrait or square, then let them scale up to a capped max-width, or provide a second layout for wide screens. Text inside SVG is 13px or larger at 390px rendered width.

Tokens and classes live in `css/site.css`. Use them. Do not invent colors.

### Page skeleton

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Who to call. Company map</title>
<link rel="stylesheet" href="../css/site.css">
<script type="module" src="../js/pages/call.js"></script>
</head>
<body>
<div id="top"></div>
<div class="shell">
  <nav class="rail" id="rail" aria-label="Contents"></nav>
  <main class="page" id="main">
    <header class="page-head" id="head"></header>
    <div id="content"></div>
    <footer class="foot" id="foot"></footer>
  </main>
</div>
<div class="drawer" id="drawer" hidden></div>
</body>
</html>
```

Pages two folders deep (`manual/quality/`) use `../../` paths.

### Page module

```js
import { mount, loadJSON, t, esc, fmt, onLang, store } from '../app.js';
import { svg, wrap, tspans } from '../svg.js';

const app = await mount({
  page: 'call',
  title: { en: 'Who to call', ar: 'بمن تتصل' },
  lede: { en: 'Pick the situation.', ar: 'اختر الموقف.' },
  ar: true,               // only pages with Arabic content
  wide: false,            // true for the org chart
  toc: [{ id: 'x', label: { en: '…' } }]   // optional "On this page"
});
const data = await loadJSON('data/call.json');

function render() {
  app.content.innerHTML = `…`;
}
render();
onLang(render);
```

`t(value)` returns a string for either a plain string or `{ en, ar }`, falling back to English. `esc()` escapes HTML. `fmt(n)` formats numbers with commas. `store.get(key, fallback)` and `store.set(key, value)` persist checklists; they degrade to memory when storage is blocked.

### Components in site.css

- `.rows` bordered list rows; `.kv` key and value rows; `.cards` grid of `.card`
- `.choices` grid of tappable buttons (add `.on` to the active one)
- `.btn`, `.btn.primary`, `.chip`, `.btn-text`
- `.steps` numbered flow with a spine, `.n` for the number, `.who` for the owner, `.clock` for the time
- `.check` persisted checklist rows; `.signoff` two signature lines
- `.t-wrap > table.t` hairline tables
- `.rule-band` three universal rules; `.callout` accent-edged note
- `.diagram` wraps an SVG (`figure.diagram > svg + figcaption`); `.diagram.wide` removes the cap
- `details > summary` collapsibles; set `data-open` and `data-close` on the summary for the toggle words
- `.print-only`, `.no-print`, `.pocket` (one printed page per card)

### SVG classes

Lines: `.ln` hairline, `.ln-ink`, `.ln-acc` accent, `.dash`. Shapes: `.bx` paper box, `.bx-panel`, `.bx-acc` filled accent, `.bx-acc-line` accent outline, `.dot`, `.dot-o`. Text: `.tx` ink 13px, `.tx-b` bold, `.tx-m` mute, `.tx-d` dim, `.tx-a` accent, `.tx-p` paper, `.tx-s` 11px, `.tx-l` 16px, `.tx-xl` 22px. Arrowheads: include `defs(uid)` from svg.js and reference `marker-end="url(#uid-arr)"` or `#uid-arr-acc`.

### Arabic

Pages workers use (who to call, rules, the never list, onboarding gate, training) carry `ar: true`. Their JSON stores every visible string as `{ "en": "…", "ar": "…" }`. The toggle sets `html[lang=ar][dir=rtl]` and re-renders. Use logical CSS properties (`inset-inline-start`, `margin-inline-end`) so layouts flip. SVG diagrams on those pages must draw labels from `t()` and mirror positions when `document.dir === 'rtl'`.

### Print

Every page prints. Hidden: header, rail, drawer, `.no-print`. All `details` open on print. Pocket cards use `.pocket` and `.print-only`.

## Self-check

```
npm run shoot                 # every page, 390 and 1280, into shots/
node scripts/shoot.mjs --page call --lang ar
node scripts/shoot.mjs --page training --print
npm run lint                  # content rules
```

Open the PNGs and look. Fix what is wrong. Repeat. Do not ship a diagram you have not looked at.
