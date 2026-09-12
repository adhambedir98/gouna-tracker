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
        window.posthog.init(key, { api_host: host, person_profiles: 'identified_only', capture_pageview: false, autocapture: true, disable_session_recording: false });
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

/* the mark: the reader's name and the time, tiled across the page, faint on screen and darker on paper */
function watermark() {
  if (!who || !who.signed_in) return;
  const stamp = `${who.name} · ${who.email} · ${new Date().toLocaleString('en-GB', { timeZone: 'Africa/Cairo', dateStyle: 'medium', timeStyle: 'short' })}`;
  const tile = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  tile.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  tile.setAttribute('width', '460'); tile.setAttribute('height', '240');
  tile.innerHTML = `<text x="0" y="120" transform="rotate(-24 0 120)" font-family="system-ui,sans-serif" font-size="15" fill="%INK%">${stamp.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</text>`;
  const url = ink => `url("data:image/svg+xml,${encodeURIComponent(tile.outerHTML.replace('%INK%', ink))}")`;
  let el = document.getElementById('wm');
  if (!el) { el = document.createElement('div'); el.id = 'wm'; el.setAttribute('aria-hidden', 'true'); document.body.appendChild(el); }
  el.style.setProperty('--wm', url('rgba(28,38,32,0.055)'));
  el.style.setProperty('--wm-print', url('rgba(28,38,32,0.14)'));
}

/* the signals a browser gives */
function wire() {
  // printing, and the print dialog opened with the keyboard
  window.addEventListener('beforeprint', () => send('print'));
  if (window.matchMedia) { try { window.matchMedia('print').addEventListener('change', e => { if (e.matches) send('print'); }); } catch {} }
  document.addEventListener('keydown', e => {
    const meta = e.ctrlKey || e.metaKey;
    if (meta && (e.key === 'p' || e.key === 'P')) send('print', { by: 'keyboard' });
    if (meta && (e.key === 's' || e.key === 'S')) send('save', { by: 'keyboard' });
    // Windows and Linux: the Print Screen key does reach the page. macOS keeps its own screenshot keys and never tells the page.
    if (e.key === 'PrintScreen' || e.code === 'PrintScreen') send('printscreen');
    if (meta && e.shiftKey && ['3', '4', '5'].includes(e.key)) send('printscreen', { by: 'shortcut' });
    if (e.key === 'F12' || (meta && e.shiftKey && ['I', 'i', 'J', 'j', 'C', 'c'].includes(e.key))) send('devtools', { by: 'keyboard' });
  }, true);
  document.addEventListener('keyup', e => { if (e.key === 'PrintScreen' || e.code === 'PrintScreen') send('printscreen'); }, true);
  // a copy that takes most of the page, not a phone number
  document.addEventListener('copy', () => {
    const n = String(window.getSelection() || '').length;
    if (n > 1200) send('copy-page', { characters: n });
    else if (n > 0) send('copy', { characters: n });
  });
  // this page asking to record the screen, the one capture a page is told about
  if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
    const real = navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getDisplayMedia = function (...a) { send('capture'); return real(...a); };
  }
  // The developer tools, by a panel opening inside a window that did not change size. Zooming, a sidebar, or a resized window
  // move the outside too, and those are not worth waking anybody for.
  let gap = 0, outer = window.outerWidth + 'x' + window.outerHeight;
  const look = () => {
    const now = window.outerWidth + 'x' + window.outerHeight;
    const g = Math.max(window.outerWidth - window.innerWidth, window.outerHeight - window.innerHeight);
    if (now === outer && g - gap > 240) send('devtools');
    gap = g; outer = now;
  };
  setInterval(look, 4000);
}

export async function guard(pageName) {
  page = String(pageName || '');
  who = await whoami();
  watermark();
  if (who && who.signed_in && who.posthog && who.posthog.key) posthog(who.posthog.key, who.posthog.host);
  wire();
  send('view');
  return who;
}
