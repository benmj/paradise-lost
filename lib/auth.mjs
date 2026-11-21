// Sign-in with Google (authorization-code flow over fetch, no dependencies) and signed session cookies.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const b64 = (b) => Buffer.from(b).toString('base64url');

export function sessionSecret(dir) {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const f = path.join(dir, 'session.secret');
  try { return fs.readFileSync(f, 'utf8').trim(); } catch {}
  const s = crypto.randomBytes(32).toString('hex');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(f, s, { mode: 0o600 });
  return s;
}

export function makeAuth({ secret, baseUrl, clientId, clientSecret }) {
  const secure = baseUrl.startsWith('https:');
  const sign = (s) => crypto.createHmac('sha256', secret).update(s).digest('base64url');
  const pack = (obj) => { const p = b64(JSON.stringify(obj)); return `${p}.${sign(p)}`; };
  const unpack = (tok) => {
    const [p, s] = String(tok || '').split('.');
    if (!p || !s) return null;
    const want = Buffer.from(sign(p)), got = Buffer.from(s);
    if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
    try { const o = JSON.parse(Buffer.from(p, 'base64url')); return o.exp > Date.now() ? o : null; } catch { return null; }
  };
  const cookie = (name, value, maxAge) =>
    `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
  const redirectUri = `${baseUrl}/auth/callback`;
  return {
    enabled: Boolean(clientId && clientSecret),
    sessionCookie: (uid) => cookie('pl_session', pack({ uid, exp: Date.now() + 30 * 864e5 }), 30 * 864e5 / 1000),
    clearCookie: () => cookie('pl_session', '', 0),
    userId: (token) => unpack(token)?.uid ?? null,
    // → { url, setCookie } to send the browser to Google. `back` is a same-site path to return to.
    start(back) {
      const state = crypto.randomBytes(16).toString('base64url');
      const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
        client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: 'openid email profile',
        state, prompt: 'select_account',
      });
      return { url, setCookie: cookie('pl_oauth', pack({ state, back: /^\/[^/\\]*$/.test(back || '') ? back : '/', exp: Date.now() + 10 * 60e3 }), 600) };
    },
    // → { email, name, back } or throws.
    async finish(code, state, oauthCookie) {
      const o = unpack(oauthCookie);
      if (!o || o.state !== state) throw new Error('sign-in expired or mismatched; try again');
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
      });
      if (!res.ok) throw new Error(`google token: HTTP ${res.status}`);
      // The id_token came straight from Google over TLS in this response, so reading its claims is safe.
      const { id_token } = await res.json();
      const c = JSON.parse(Buffer.from(String(id_token).split('.')[1], 'base64url'));
      if (c.aud !== clientId || !String(c.iss).endsWith('accounts.google.com') || !c.email || c.email_verified === false) throw new Error('google sign-in not accepted');
      return { email: String(c.email).toLowerCase(), name: String(c.name || '').slice(0, 100), back: o.back };
    },
  };
}
