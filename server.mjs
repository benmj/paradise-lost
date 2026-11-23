// Paradise Lost: an illustrated reading guide to Milton, plus "Ask the Reader": a chat about the passage open.
//
// One node process, no npm dependencies (Node 22.5+, for node:sqlite):
//   - serves the built app from DIST_DIR (scripts/build.py writes it from data/; dist/ is not committed)
//   - GET /api/dict?w=word: the curated lexicon of Milton's senses plus the English Wiktionary (lib/dict.mjs); no sign-in
//   - POST /api/chat streams a reply as server-sent events (lib/llm.mjs). The server builds the context
//     from the poem itself; the client only says which book, line or character it is about.
//   - three auth modes, picked by which settings exist:
//       google  GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET: the site is public, reading needs no sign-in,
//               chat and saved progress need Google sign-in (lib/auth.mjs). Users and usage live in SQLite.
//       access  ACCESS_AUD: a Cloudflare Access app gates the whole site (private deployments); the JWT is re-checked.
//       dev     DEV_USER: localhost only, no sign-in.
//   - chat backend: the Anthropic API when ANTHROPIC_API_KEY is set (billed to that key, capped per user and
//     per month), otherwise headless `claude -p` on the host's own login (private use only).
//
// Config (env), all optional except as noted:
//   PORT=8107  HOST=127.0.0.1  BASE_URL=http://localhost:8107  DIST_DIR=./dist  DATA_DIR=./data-local
//   GOOGLE_CLIENT_ID  GOOGLE_CLIENT_SECRET  SESSION_SECRET (generated into DATA_DIR if absent)
//   ACCESS_TEAM  ACCESS_AUD  USERS=a@x.com,b@y.com  (access mode: who may enter)
//   ADMINS=you@example.com  (may read /api/admin/usage)
//   ALLOWLIST=a@x.com,b@y.com  (google mode: use the hosted ANTHROPIC_API_KEY; everyone else pastes their own)
//   ANTHROPIC_API_KEY  PL_MODEL=claude-haiku-5-5  PL_MAX_OUTPUT_TOKENS=700
//   OPEN_BETA=1  OPEN_BETA_DAILY_USD=5  (google mode: every signed-in reader uses the hosted key until their cap, the beta's daily cap or the month's budget is spent, then adds their own key)
//   USER_DAILY_USD=0.15  MONTHLY_USD=25   estimated spend caps (see lib/llm.mjs)
//   DEV_USER=someone@example.com   local testing only: refused unless BASE_URL is localhost
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createPublicKey, verify } from 'node:crypto';
import { loadBook, buildContext, checkMessages, SYSTEM, ChatError } from './lib/chat.mjs';
import { streamReply, MODEL, backend, costMicro } from './lib/llm.mjs';
import { openDb } from './lib/db.mjs';
import { makeAuth, sessionSecret } from './lib/auth.mjs';
import { lookup, loadLexicon, DictError } from './lib/dict.mjs';

const PORT = Number(process.env.PORT) || 8107;
const HOST = process.env.HOST || '127.0.0.1';
const BASE_URL = (process.env.BASE_URL || `http://localhost:${Number(process.env.PORT) || 8107}`).replace(/\/$/, '');
const ACCESS_TEAM = process.env.ACCESS_TEAM || '';
const ACCESS_AUD = process.env.ACCESS_AUD || '';
// Gmail ignores dots, +tags and googlemail.com, so Google may return a different spelling than the one listed.
const canon = (e) => { e = String(e || '').toLowerCase().trim(); const [l, d] = e.split('@'); return d === 'gmail.com' || d === 'googlemail.com' ? `${l.split('+')[0].replace(/\./g, '')}@gmail.com` : e; };
const list = (v) => new Set(String(v || '').toLowerCase().split(',').map((e) => e.trim()).filter(Boolean));
const canonList = (v) => new Set([...list(v)].map(canon));
const USERS = list(process.env.USERS);
const ADMINS = canonList(process.env.ADMINS);
const ALLOWLIST = canonList(process.env.ALLOWLIST);   // google mode: these users (and admins) chat on the hosted key; everyone else brings their own
const DIST = path.resolve(process.env.DIST_DIR || path.join(import.meta.dirname, 'dist'));
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(import.meta.dirname, 'data-local'));
const IS_LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE_URL);
const DEV_USER = (process.env.DEV_USER || '').toLowerCase();
const USER_DAILY_MICRO = (Number(process.env.USER_DAILY_USD) || 0.15) * 1e6;
const MONTHLY_MICRO = (Number(process.env.MONTHLY_USD) || 25) * 1e6;
if (DEV_USER && !IS_LOCAL) throw new Error('DEV_USER is only allowed with a localhost BASE_URL');
if (DEV_USER && !['127.0.0.1', '::1', 'localhost'].includes(HOST)) throw new Error('DEV_USER is only allowed when listening on localhost');

const db = openDb(DATA_DIR);
const auth = makeAuth({ secret: sessionSecret(DATA_DIR), baseUrl: BASE_URL, clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET });
const MODE = DEV_USER ? 'dev' : auth.enabled ? 'google' : ACCESS_AUD ? 'access' : '';
if (!MODE) throw new Error('set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (public), ACCESS_AUD (Cloudflare Access) or DEV_USER (local)');
if (MODE === 'access' && !ACCESS_TEAM) throw new Error('access mode needs ACCESS_TEAM');
if (MODE === 'google' && backend !== 'api') console.warn('[chat] no ANTHROPIC_API_KEY: only readers with their own key can chat in public (google) mode');
// Hosted key: everyone in dev/access mode, allowlisted users and admins in google mode.
const OPEN_BETA = /^(1|true|yes|on)$/i.test(process.env.OPEN_BETA || '');   // google mode: any signed-in reader uses the hosted key until a cap is hit, then brings their own
const BETA_DAILY_MICRO = (Number(process.env.OPEN_BETA_DAILY_USD) || 5) * 1e6;   // all open-beta readers together, per UTC day
const isSeat = (u) => Boolean(u) && (u.admin || ALLOWLIST.has(canon(u.email)));
const hostedFor = (u) => Boolean(u) && (MODE !== 'google' ? true : backend === 'api' && (isSeat(u) || OPEN_BETA));
// an open-beta reader (no seat) is out of hosted questions when their own cap, the beta's daily cap or the month's budget is spent
const betaCapped = (u) => OPEN_BETA && !isSeat(u) && MODE === 'google' && (db.spentToday(u.id, today()) >= USER_DAILY_MICRO || db.spentDay(today()) >= BETA_DAILY_MICRO || db.spentSince(monthStart()) >= MONTHLY_MICRO);
const ownKey = (req) => { const k = String(req.headers['x-user-api-key'] || '').trim(); return /^sk-ant-[A-Za-z0-9_-]{20,300}$/.test(k) ? k : ''; };

const book = loadBook(path.join(DIST, 'data.js'));
const LEXICON = loadLexicon(path.join(import.meta.dirname, 'data', 'lexicon.json'));
const MAX_RUNNING = 4;
let running = 0;
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => today().slice(0, 8) + '01';

// Small in-memory rate limiter: n events per window per key.
const hits = new Map();
function limited(key, n, windowMs) {
  const now = Date.now(), arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  arr.push(now); hits.set(key, arr);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > windowMs) hits.delete(k);
  return arr.length > n;
}
const clientIp = (req) => req.headers['cf-connecting-ip'] || req.socket.remoteAddress || '';

// ---------------- auth ----------------
const ISSUER = `https://${ACCESS_TEAM}.cloudflareaccess.com`;
const keys = { at: 0, byKid: new Map() };
async function accessKey(kid) {
  if (!keys.byKid.has(kid) && Date.now() - keys.at > 60_000) {
    keys.at = Date.now();
    const res = await fetch(`${ISSUER}/cdn-cgi/access/certs`);
    if (!res.ok) throw new Error(`access certs: HTTP ${res.status}`);
    const { keys: jwks } = await res.json();
    keys.byKid = new Map(jwks.map((k) => [k.kid, createPublicKey({ key: k, format: 'jwk' })]));
  }
  return keys.byKid.get(kid);
}
const cookies = (req) => Object.fromEntries(String(req.headers.cookie || '').split(';').map((c) => c.trim().split('='))
  .filter((p) => p[0]).map(([k, ...v]) => [k, v.join('=')]));
const withFlags = (u) => ({ ...u, admin: ADMINS.has(canon(u.email)) });
const known = (email, name) => withFlags(db.userByEmail(email) || db.login(email, name));

// → user, { denied: email } (access mode, not on the list), or null.
async function currentUser(req) {
  if (MODE === 'dev') return known(DEV_USER, 'Dev');
  if (MODE === 'google') {
    const id = auth.userId(cookies(req).pl_session);
    const u = id && db.user(id);
    if (u) { db.touch(u.id); return withFlags(u); }
    return null;
  }
  const token = req.headers['cf-access-jwt-assertion'] || cookies(req).CF_Authorization;
  if (!token) return null;
  try {
    const [h, p, s] = String(token).split('.');
    const header = JSON.parse(Buffer.from(h, 'base64url'));
    if (header.alg !== 'RS256') return null;
    const key = await accessKey(header.kid);
    if (!key || !verify('RSA-SHA256', Buffer.from(`${h}.${p}`), key, Buffer.from(s, 'base64url'))) return null;
    const c = JSON.parse(Buffer.from(p, 'base64url'));
    const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
    if (c.iss !== ISSUER || !aud.includes(ACCESS_AUD) || !(c.exp * 1000 > Date.now())) return null;
    const email = String(c.email || '').toLowerCase();
    return USERS.has(email) ? known(email, '') : { denied: email };
  } catch (e) {
    console.warn(`[auth] ${e.message}`);
    return null;
  }
}

// ---------------- http helpers ----------------
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https://i.ytimg.com; media-src https://archive.org https://*.archive.org https://*.us.archive.org; frame-src https://www.youtube-nocookie.com; connect-src 'self'; manifest-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};
function send(res, status, body, headers = {}) { res.writeHead(status, { ...SECURITY_HEADERS, ...headers }); res.end(body); }
const json = (res, status, obj) => send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
async function readJson(req, limit = 256 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > limit) throw new ChatError(413, 'too large'); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { throw new ChatError(400, 'bad JSON'); }
}
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
function serveStatic(res, rel) {
  const file = path.join(DIST, path.normalize('/' + (rel === '/' ? 'index.html' : rel)));
  if (!file.startsWith(DIST + path.sep)) return send(res, 404, 'not found');
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'not found');
    // no-cache keeps pages fresh; the service worker keeps the offline copy.
    res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': MODE === 'google' ? 'public, no-cache' : 'private, no-cache', 'Content-Length': st.size });
    fs.createReadStream(file).pipe(res);
  });
}
const gatePage = (msg) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Paradise Lost</title><style>body{font:18px/1.5 Georgia,serif;background:#f4eedf;color:#1c1712;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px}
main{max-width:26rem;text-align:center}a{color:#9b1c1c}</style></head><body><main><h1>Paradise Lost</h1><p>${msg}</p>
<p><a href="/cdn-cgi/access/logout">Sign out and try another account</a></p></main></body></html>`;

// Writes from another site are refused even with a valid session.
function sameOrigin(req) {
  if (MODE === 'dev') return true;
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin') return false;
  const origin = req.headers.origin;
  return !origin || origin === BASE_URL;
}

// ---------------- account, state, admin ----------------
const meInfo = (u) => {
  const hosted = hostedFor(u);
  const capped = hosted && u && betaCapped(u);
  const left = hosted && !capped && backend === 'api' ? Math.max(0, USER_DAILY_MICRO - db.spentToday(u.id, today())) / USER_DAILY_MICRO : 0;
  // chat: 'hosted' (our key, capped) or 'byok' (the reader pastes their own Anthropic key)
  return { user: u ? { email: u.email, name: u.name, admin: u.admin } : null, signIn: MODE === 'google', chat: hosted && !capped ? 'hosted' : 'byok', beta: OPEN_BETA && !isSeat(u), capped, chatLeft: Math.round(left * 100) / 100 };
};
// The reader's footnotes (src/notes.js): at most 200, every field length-limited and range-checked.
const NOTE_LIMITS = { quote: 240, note: 260, question: 160 };
const str = (v, n) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
function cleanNotes(arr) {
  const out = new Map();
  for (const f of Array.isArray(arr) ? arr.slice(0, 400) : []) {
    if (!f || !Number.isInteger(f.book) || f.book < 1 || f.book > 12) continue;
    const b = book.books[f.book - 1];
    if (!Number.isInteger(f.line) || !Number.isInteger(f.to) || f.line < 1 || f.line > b.lines.length || f.to < f.line || f.to > Math.min(b.lines.length, f.line + 40)) continue;
    const notes = (Array.isArray(f.notes) ? f.notes.slice(0, 3) : []).map((x) => ({
      note: str(x && x.note, NOTE_LIMITS.note), question: str(x && x.question, NOTE_LIMITS.question),
      when: Number.isInteger(x && x.when) && x.when >= 0 && x.when < 4e12 ? x.when : 0,
    })).filter((x) => x.note);
    if (!notes.length) continue;
    const id = `${f.book}.${f.line}-${f.to}`;
    if (out.has(id)) continue;
    out.set(id, { id, book: f.book, line: f.line, to: f.to, quote: str(f.quote, NOTE_LIMITS.quote), notes, when: Number.isInteger(f.when) && f.when >= 0 && f.when < 4e12 ? f.when : notes[0].when });
  }
  return [...out.values()].sort((a, c) => c.when - a.when).slice(0, 200);
}
function cleanState(b, old) {
  const out = { t: Date.now() };
  const p = b && b.pos;
  if (p && Number.isInteger(p.n) && p.n >= 1 && p.n <= 12 && Number.isInteger(p.l) && p.l >= 1 && p.l <= 9000) out.pos = { n: p.n, l: p.l };
  out.read = {};
  for (let n = 1; n <= 12; n++) { const v = b && b.read && b.read[n]; if (Number.isInteger(v) && v > 0 && v <= 9000) out.read[n] = v; }
  // notes: absent from an older client's PUT means "unchanged"
  if (b && Array.isArray(b.notes)) {
    out.notes = cleanNotes(b.notes);
    out.nt = Number.isInteger(b.nt) && b.nt >= 0 && b.nt <= Date.now() + 864e5 ? b.nt : Date.now();
  } else if (old && old.notes) { out.notes = old.notes; out.nt = old.nt || 0; }
  return out;
}
function redirect(res, url, setCookie) { send(res, 302, '', { Location: url, 'Cache-Control': 'no-store', ...(setCookie ? { 'Set-Cookie': setCookie } : {}) }); }

async function authRoutes(req, res, url) {
  if (MODE !== 'google') return json(res, 404, { error: 'not found' });
  if (limited(`auth:${clientIp(req)}`, 30, 60_000)) return json(res, 429, { error: 'too many sign-in attempts; wait a minute' });
  if (url.pathname === '/auth/login' && req.method === 'GET') {
    const { url: to, setCookie } = auth.start(url.searchParams.get('back'));
    return redirect(res, to, setCookie);
  }
  if (url.pathname === '/auth/callback' && req.method === 'GET') {
    try {
      if (url.searchParams.get('error')) return redirect(res, '/');
      const r = await auth.finish(url.searchParams.get('code') || '', url.searchParams.get('state') || '', cookies(req).pl_oauth);
      const u = db.login(r.email, r.name);
      console.log(`[auth] sign-in user ${u.id}`);
      return redirect(res, r.back, auth.sessionCookie(u.id));
    } catch (e) {
      console.warn(`[auth] ${e.message}`);
      return send(res, 400, gatePage('Sign-in did not complete. <a href="/auth/login">Try again</a>.'), { 'Content-Type': 'text/html; charset=utf-8' });
    }
  }
  if (url.pathname === '/auth/logout' && req.method === 'POST') {
    if (!sameOrigin(req)) return json(res, 403, { error: 'cross-site request refused' });
    return send(res, 204, '', { 'Set-Cookie': auth.clearCookie() });
  }
  return json(res, 404, { error: 'not found' });
}

async function apiRoutes(req, res, url, user) {
  if (url.pathname === '/api/me' && req.method === 'GET') return json(res, 200, meInfo(user));
  if (url.pathname === '/api/state') {
    if (!user) return json(res, 401, { error: 'sign in to save your place' });
    if (req.method === 'GET') return json(res, 200, db.getState(user.id));
    if (req.method === 'PUT') {
      if (!sameOrigin(req)) return json(res, 403, { error: 'cross-site request refused' });
      db.setState(user.id, cleanState(await readJson(req, 400 * 1024), db.getState(user.id)));
      return json(res, 200, { ok: true });
    }
  }
  if (url.pathname === '/api/account/delete' && req.method === 'POST') {
    if (!user) return json(res, 401, { error: 'not signed in' });
    if (!sameOrigin(req)) return json(res, 403, { error: 'cross-site request refused' });
    db.deleteUser(user.id);
    return send(res, 204, '', { 'Set-Cookie': auth.clearCookie() });
  }
  if (url.pathname === '/api/admin/usage' && req.method === 'GET') {
    if (!user || !user.admin) return json(res, 403, { error: 'admins only' });
    const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    const r = db.report(since);
    const usd = (m) => Math.round(m / 1e4) / 100;
    return json(res, 200, {
      mode: MODE, backend, model: MODEL, users: r.users, active_7d: r.active_7d,
      month_usd: usd(db.spentSince(monthStart())), month_cap_usd: MONTHLY_MICRO / 1e6, user_daily_cap_usd: USER_DAILY_MICRO / 1e6,
      days: r.days.map((d) => ({ ...d, cost_usd: usd(d.cost_micro) })), top: r.top.map((t) => ({ ...t, cost_usd: usd(t.cost_micro) })),
    });
  }
  if (url.pathname === '/api/dict' && req.method === 'GET') {
    if (limited(`dict:${clientIp(req)}`, 60, 60_000)) return json(res, 429, { error: 'too many lookups; wait a moment' });
    try { return json(res, 200, await lookup(url.searchParams.get('w'))); }
    catch (e) { if (e instanceof DictError) return json(res, e.status, { error: e.message }); throw e; }
  }
  if (url.pathname === '/api/chat' && req.method === 'POST') return chat(req, res, user);
  return json(res, 404, { error: 'not found' });
}

// ---------------- chat ----------------
async function chat(req, res, user) {
  if (!sameOrigin(req)) return json(res, 403, { error: 'cross-site request refused' });
  const key = ownKey(req);
  const hosted = !key && hostedFor(user);
  if (!key && !hosted) return json(res, 401, { error: 'Add your own Anthropic API key to ask the reader. It stays in this browser.', needKey: true });
  const body = await readJson(req);
  const ctx = buildContext(book, body.context);
  const messages = checkMessages(body.messages);
  const who = user ? `user:${user.id}` : `ip:${req.headers['cf-connecting-ip'] || req.socket.remoteAddress}`;
  if (limited(`chat:${who}`, 8, 60_000)) return json(res, 429, { error: 'A little slower: wait a moment before the next question.' });
  const meter = hosted && backend === 'api';   // only the hosted key is metered; a reader's own key is billed to them
  if (meter && betaCapped(user)) return json(res, 429, { error: "The free questions for the reader are used up for now (they reset at midnight UTC). Add your own Anthropic API key to keep asking; reading, notes and the dictionary stay free.", needKey: true });
  if (meter) {
    if (db.spentToday(user.id, today()) >= USER_DAILY_MICRO) return json(res, 429, { error: "You've used today's questions for the reader. They reset at midnight UTC." });
    if (db.spentSince(monthStart()) >= MONTHLY_MICRO) return json(res, 429, { error: "The reader has used this month's budget and is resting until next month. Reading and notes still work." });
  }
  if (running >= MAX_RUNNING) return json(res, 429, { error: 'The reader is busy with other questions. Try again in a moment.' });

  running++;
  res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no', Connection: 'keep-alive' });
  const event = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
  res.write(': open\n\n');
  const beat = setInterval(() => res.write(': beat\n\n'), 15_000);
  const started = Date.now();
  let chars = 0;
  const job = streamReply({ key, system: SYSTEM, context: ctx.text, messages, onText: (t) => { chars += t.length; event({ t }); } });
  res.on('close', () => job.cancel());
  try {
    const usage = await job.done;
    if (meter) db.addUsage(user.id, today(), usage, costMicro(usage));
    event({ done: true });
    console.log(`[chat] ${key ? 'byok' : 'hosted'} ${who} ${ctx.label} · ${messages.length} msg · ${chars} chars · in ${usage.input}+${usage.cacheWrite}w+${usage.cacheRead}r out ${usage.output} · ${((Date.now() - started) / 1000).toFixed(1)} s`);
  } catch (e) {
    console.warn(`[chat] ${ctx.label}: ${key ? `byok HTTP ${e.status || '?'}` : e.message}`);   // never log the key or the provider's body for a reader's key
    const bad = key && (e.status === 401 || e.status === 403);
    if (!res.destroyed) event({ error: e.cancelled ? 'stopped' : bad ? 'Anthropic rejected that key. Check it in the account menu.' : key && e.status === 429 ? 'Your Anthropic account is rate limited or out of credit.' : 'The reader could not answer just now. Try again.', ...(bad ? { needKey: true } : {}) });
  } finally {
    clearInterval(beat);
    running--;
    res.end();
  }
}

// ---------------- server ----------------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, BASE_URL);
  try {
    if (url.pathname === '/api/health') return json(res, 200, { ok: true, mode: MODE, backend, model: MODEL, books: book.books.length, lexicon: LEXICON, running });
    if (url.pathname.startsWith('/auth/')) return await authRoutes(req, res, url);
    const user = await currentUser(req);
    if (MODE === 'access') {
      if (!user) return send(res, 401, gatePage('Sign in through Cloudflare Access to open this page.'), { 'Content-Type': 'text/html; charset=utf-8' });
      if (user.denied) return send(res, 403, gatePage(`${user.denied} isn't on the list for this app.`), { 'Content-Type': 'text/html; charset=utf-8' });
    }
    if (url.pathname.startsWith('/api/')) return await apiRoutes(req, res, url, user);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method not allowed');
    return serveStatic(res, url.pathname);
  } catch (e) {
    const status = e instanceof ChatError ? e.status : 500;
    if (status === 500) console.error(e);
    if (!res.headersSent) json(res, status, { error: status === 500 ? 'server error' : e.message });
    else res.end();
  }
});
server.listen(PORT, HOST, () => console.log(`Paradise Lost on http://${HOST}:${PORT} · ${BASE_URL} · ${MODE} · ${backend} chat · model ${MODEL}`));
