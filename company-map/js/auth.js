// The account: signing in, signing up, the session on this device, and every call to the database made as the person who is signed in.
// The session is a Supabase Auth token pair. It is refreshed when it is close to running out, and thrown away on sign out.
// This module talks to the database directly and imports nothing from app.js, so app.js can use it to load the content of the map.

const ROOT = (() => { try { return new URL('../', import.meta.url); } catch { return new URL(location.href); } })();
const KEY = 'vm.session';
const SKEW = 60;                      // seconds before it runs out that a refresh starts

let cfg = null, me = null, refreshing = null;

export async function config() {
  if (!cfg) cfg = await (await fetch(new URL('data/report.json', ROOT))).json();
  return cfg;
}
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } };
const write = s => { try { s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY); } catch {} };
const keep = j => {
  if (!j || !j.access_token) return null;
  const s = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Math.floor(Date.now() / 1000) + (Number(j.expires_in) || 3600) };
  write(s); me = null; return s;
};
export const session = () => read();
export const signedIn = () => !!read();

async function auth(path, body, token) {
  const c = await config();
  const r = await fetch(`${c.url}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: c.key, Authorization: 'Bearer ' + (token || c.key), 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error_description || j.msg || j.message || j.error || 'error');
  return j;
}

/* the token to call the database with, refreshed when it is nearly out of time */
async function token() {
  const s = read();
  if (!s) return null;
  if (s.expires_at - SKEW > Math.floor(Date.now() / 1000)) return s.access_token;
  if (!refreshing) refreshing = auth('token?grant_type=refresh_token', { refresh_token: s.refresh_token })
    .then(j => keep(j)).catch(() => { write(null); me = null; return null; }).finally(() => { refreshing = null; });
  const next = await refreshing;
  return next ? next.access_token : null;
}

// Every database call goes through here: the anon key names the project, the person's token says who is asking.
export async function api(fn, body) {
  const c = await config();
  const t = await token();
  const r = await fetch(`${c.url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: c.key, Authorization: 'Bearer ' + (t || c.key), 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.message || j.hint || r.statusText || 'error');
  return j;
}

export async function signUp(email, password, name) {
  const j = await auth('signup', { email: String(email || '').trim().toLowerCase(), password, data: { name: String(name || '').trim() } });
  const s = keep(j);                 // a project that asks for an email confirmation sends no token back
  return { session: s, confirm: !s };
}
export async function signIn(email, password) {
  keep(await auth('token?grant_type=password', { email: String(email || '').trim().toLowerCase(), password }));
  return whoami(true);
}
export async function resetPassword(email) {
  await auth('recover', { email: String(email || '').trim().toLowerCase() });
}
export async function signOut() {
  const t = await token().catch(() => null);
  try { if (t) await auth('logout', {}, t); } catch {}
  write(null); me = null;
}

// The person, their role, and the sections they may open. The database is the one that decides; this is only what it said.
export async function whoami(fresh = false) {
  if (me && !fresh) return me;
  if (!read()) { me = { signed_in: false }; return me; }
  try { me = await api('dr_me', {}); } catch { me = { signed_in: false }; }
  if (!me.signed_in) write(null);
  return me;
}
export const cached = () => me;
