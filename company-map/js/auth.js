// The account: signing in, signing up, the session on this device, and every call to the database made as the person who is signed in.
// The session is a Supabase Auth token pair. It is refreshed when it is close to running out, and thrown away on sign out.
// This module talks to the database directly and imports nothing from app.js, so app.js can use it to load the content of the map.

const ROOT = (() => { try { return new URL('../', import.meta.url); } catch { return new URL(location.href); } })();
const KEY = 'vm.session';
const SKEW = 60;                      // seconds before it runs out that a refresh starts

let cfg = null, me = null, refreshing = null;

export async function config() {
  if (cfg) return cfg;
  const r = await fetch(new URL('data/report.json', ROOT));
  if (!r.ok) throw new Error('Could not reach the database');   // not cached: a page that loads later should try again
  cfg = await r.json();
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

async function auth(path, body, token, method = 'POST') {
  const c = await config();
  const r = await fetch(`${c.url}/auth/v1/${path}`, {
    method,
    headers: { apikey: c.key, Authorization: 'Bearer ' + (token || c.key), 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error_description || j.msg || j.message || j.error || 'error'); e.status = r.status; throw e; }
  return j;
}

/* the token to call the database with, refreshed when it is nearly out of time.
   A refresh the server refuses ends the session. A refresh that never arrived, on a train or a dead line, leaves it alone: losing the
   session because the line dropped for a second would sign somebody out in the middle of their work. */
async function token(force = false) {
  const s = read();
  if (!s) return null;
  if (!force && s.expires_at - SKEW > Math.floor(Date.now() / 1000)) return s.access_token;
  if (!refreshing) refreshing = auth('token?grant_type=refresh_token', { refresh_token: s.refresh_token })
    .then(j => keep(j))
    .catch(err => { if (err && err.status >= 400 && err.status < 500) { write(null); me = null; } return null; })
    .finally(() => { refreshing = null; });
  const next = await refreshing;
  return next ? next.access_token : (read() ? read().access_token : null);
}

// Every database call goes through here: the anon key names the project, the person's token says who is asking.
// A token the server turns down is refreshed once and the call is made again, so a tab left open overnight carries on working.
export async function api(fn, body, retried = false) {
  const c = await config();
  const t = await token();
  const r = await fetch(`${c.url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: c.key, Authorization: 'Bearer ' + (t || c.key), 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if ((r.status === 401 || r.status === 403) && t && !retried) {
    const fresh = await token(true);
    if (fresh) return api(fn, body, true);
  }
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
  const back = new URL('login/', ROOT).href;
  await auth('recover', { email: String(email || '').trim().toLowerCase(), gotrue_meta_security: {} }, null, 'POST')
    .catch(err => { if (err.status === 422) return auth('recover', { email: String(email || '').trim().toLowerCase() }); throw err; });
  return back;
}

// The link in a password email comes back to the site with a token in the address. This turns that into a new password.
export function recoveryToken() {
  const h = new URLSearchParams(String(location.hash || '').replace(/^#/, ''));
  return h.get('type') === 'recovery' && h.get('access_token') ? h.get('access_token') : null;
}
export async function setPassword(password, token) {
  const j = await auth('user', { password }, token, 'PUT');
  try { history.replaceState(null, '', location.pathname); } catch {}
  return j;
}
export async function signOut() {
  const t = await token().catch(() => null);
  try { if (t) await auth('logout', {}, t); } catch {}
  write(null); me = null;
}

// The person, their role, and the sections they may open. The database is the one that decides; this is only what it said.
// A line that is down is not an answer: the session stays, and the page says it could not reach the database.
export async function whoami(fresh = false) {
  if (me && !fresh) return me;
  if (!read()) { me = { signed_in: false }; return me; }
  try {
    const got = await api('dr_me', {});
    me = got;
    if (!me.signed_in) write(null);            // the server itself says this token is nobody
  } catch (err) {
    me = { signed_in: false, offline: true, error: String(err && err.message || '') };
  }
  return me;
}
export const cached = () => me;

// Signing out in one tab signs out the others on their next look.
try { addEventListener('storage', e => { if (e.key === KEY && !e.newValue) { me = null; location.reload(); } }); } catch {}
