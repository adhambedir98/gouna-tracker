// What the map can and cannot see, and the mark it leaves on every page.
//
// A browser is never told that a screenshot was taken. There is no such event, on any browser, on purpose: a page is not allowed to know
// what the rest of the screen is doing. Anyone can also photograph the screen with a second phone, and nothing on this side will ever see that.
// So this file does the two things that do work:
//   1. Every page carries the reader's name, the time, and the page, tiled faintly across it and printed on every copy. A picture of the map
//      says who it came from. That is what stops a leak, not a detector.
//   2. The signals a browser does give are sent the moment they happen, and the database posts them to Slack and to the email address at once:
//      the Print Screen key, printing, saving the page, the developer tools, this page starting a screen capture, and a copy of the whole page.
// Everything sent here also goes to PostHog when a key is saved on the company report page.

import { api, whoami } from './auth.js';

let who = null, page = '', ph = null;
const seen = new Map();                          // kind -> the last time it was sent, so a held key does not flood

function send(kind, detail = {}) {
  const last = seen.get(kind) || 0;
  if (Date.now() - last < 20000) return;
  seen.set(kind, Date.now());
  api('dr_event', { p_kind: kind, p_page: page, p_detail: detail }).catch(() => {});
  track(kind === 'view' ? '$pageview' : kind, detail);
}
export const event = (kind, detail) => send(kind, detail);

/* PostHog, when a key is saved. Without a key nothing loads and nothing leaves the browser. */
function posthog(key, host) {
  if (!key || ph) return;
  ph = new Promise(done => {
    const s = document.createElement('script');
    s.async = true;
    s.src = host.replace(/\/$/, '') + '/static/array.js';
    s.onload = () => {
      try {
        // What PostHog is told: who, which page, and what the guard saw. Not the words on the page.
        // Autocapture and session replay would ship the text of gated pages to somebody else's server, which is the thing this layer exists to stop.
        window.posthog.init(key, { api_host: host, person_profiles: 'identified_only', capture_pageview: false, autocapture: false, disable_session_recording: true });
        if (who && who.id) window.posthog.identify(who.id, { email: who.email, name: who.name, role: who.role });
        done(window.posthog);
      } catch { done(null); }
    };
    s.onerror = () => done(null);
    document.head.appendChild(s);
  });
}
function track(name, props) {
  if (!ph) return;
  ph.then(p => { try { p && p.capture(name, { ...props, page, role: who && who.role }); } catch {} });
}

/* the mark: the reader's name and the time, tiled across the page, faint on screen and darker on paper.
   Two short lines rather than one long one, so nothing is cut off at the edge of the tile. */
function watermark() {
  if (!who || !who.signed_in) return;
  const safe = s => String(s || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const when = new Date().toLocaleString('en-GB', { timeZone: 'Africa/Cairo', dateStyle: 'medium', timeStyle: 'short' });
  const line1 = safe(who.name), line2 = safe(who.email + ' · ' + when);
  const W = 520, H = 260;
  const tile = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  tile.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  tile.setAttribute('width', String(W)); tile.setAttribute('height', String(H));
  tile.innerHTML = `<g transform="rotate(-24 40 170)" font-family="system-ui,sans-serif" fill="%INK%">`
    + `<text x="40" y="170" font-size="15" font-weight="600">${line1}</text>`
    + `<text x="40" y="188" font-size="11.5">${line2}</text></g>`;
  const url = ink => `url("data:image/svg+xml,${encodeURIComponent(tile.outerHTML.replace('%INK%', ink))}")`;
  let el = document.getElementById('wm');
  if (!el) { el = document.createElement('div'); el.id = 'wm'; el.setAttribute('aria-hidden', 'true'); document.body.appendChild(el); }
  el.style.setProperty('--wm', url('rgba(28,38,32,0.055)'));
  el.style.setProperty('--wm-print', url('rgba(28,38,32,0.14)'));
}

/* the signals a browser gives. Only a reader with an account is watched this way: the three site forms are filled in by people
   with no account, and waking management because somebody at a site printed the check-out form is noise, not a signal. */
function wire() {
  // printing, and the print dialog opened with the keyboard
  window.addEventListener('beforeprint', () => send('print'));
  if (window.matchMedia) { try { window.matchMedia('print').addEventListener('change', e => { if (e.matches) send('print'); }); } catch {} }
  // the physical key as well as the letter, so a reader on an Arabic layout is seen the same way
  document.addEventListener('keydown', e => {
    const meta = e.ctrlKey || e.metaKey;
    const is = (letter, code) => e.key === letter || e.key === letter.toUpperCase() || e.code === code;
    if (meta && is('p', 'KeyP')) send('print', { by: 'keyboard' });
    if (meta && is('s', 'KeyS')) send('save', { by: 'keyboard' });
    // Windows and Linux: the Print Screen key does reach the page. macOS keeps its own screenshot keys and never tells the page.
    if (e.key === 'PrintScreen' || e.code === 'PrintScreen') send('printscreen');
    if (meta && e.shiftKey && ['3', '4', '5'].includes(e.key)) send('printscreen', { by: 'shortcut' });
    if (e.key === 'F12' || e.code === 'F12' || (meta && e.shiftKey && (is('i', 'KeyI') || is('j', 'KeyJ') || is('c', 'KeyC')))) send('devtools', { by: 'keyboard' });
  }, true);
  document.addEventListener('keyup', e => { if (e.key === 'PrintScreen' || e.code === 'PrintScreen') send('printscreen'); }, true);
  // a copy that takes most of the page, not a phone number
  document.addEventListener('copy', () => {
    const n = String(window.getSelection() || '').length;
    if (n > 1200) send('copy-page', { characters: n });
    else if (n > 0) send('copy', { characters: n });
  });
  // this page asking to record the screen, and only once the person has said yes. Nothing on this site asks, so this is for a page
  // that is ever built to. A capture started by any other program is not something a browser will say a word about.
  if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
    const real = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getDisplayMedia = (...a) => real(...a).then(s => { send('capture'); return s; });
  }
  // The developer tools, by a panel opening inside a window that did not change size. Zooming, a sidebar, or a resized window move the
  // outside too, and a phone has neither, so this watches a mouse and keyboard machine only. It is the noisiest signal here by far.
  if (!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches)) {
    let gap = 0, outer = window.outerWidth + 'x' + window.outerHeight;
    const look = () => {
      const now = window.outerWidth + 'x' + window.outerHeight;
      const g = Math.max(window.outerWidth - window.innerWidth, window.outerHeight - window.innerHeight);
      if (now === outer && g - gap > 240) send('devtools');
      gap = g; outer = now;
    };
    setTimeout(() => { gap = Math.max(window.outerWidth - window.innerWidth, window.outerHeight - window.innerHeight); setInterval(look, 4000); }, 3000);
  }
}

export async function guard(pageName) {
  page = String(pageName || '');
  who = await whoami();
  watermark();
  if (who && who.signed_in && who.posthog && who.posthog.key) posthog(who.posthog.key, who.posthog.host);
  if (who && who.signed_in) wire();     // the open site forms are read by people with no account: they are counted, not watched
  send('view');
  return who;
}
