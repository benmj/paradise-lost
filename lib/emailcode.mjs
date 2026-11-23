// Sign in with an emailed 6-digit code. Codes are kept only as HMACs, in memory, for 10 minutes, with 5 tries each.
// Mail goes out through Brevo's transactional API; the key is BREVO_API_KEY or DATA_DIR/brevo.key (never in git).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const EMAIL = /^[^\s@<>"',;:\\]{1,64}@[^\s@<>"',;:\\]{1,255}\.[A-Za-z]{2,}$/;

export function makeEmailCode({ secret, dataDir, from, fromName = 'Paradise Lost' }) {
  const keyFile = path.join(dataDir, 'brevo.key');
  const apiKey = () => process.env.BREVO_API_KEY || (() => { try { return fs.readFileSync(keyFile, 'utf8').trim(); } catch { return ''; } })();
  const pending = new Map(); // email → { h, exp, tries }
  const mac = (email, code) => crypto.createHmac('sha256', secret).update(`${email}\n${code}`).digest('hex');
  const sweep = () => { const n = Date.now(); for (const [k, v] of pending) if (v.exp < n) pending.delete(k); };
  return {
    enabled: () => Boolean(apiKey() && from),
    valid: (e) => EMAIL.test(e),
    // Sends a fresh code (replacing any earlier one). Throws if the mail was not accepted.
    async start(email) {
      sweep();
      const code = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST', headers: { 'api-key': apiKey(), 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          sender: { email: from, name: fromName }, to: [{ email }],
          subject: `${code} is your Paradise Lost sign-in code`,
          textContent: `Your Paradise Lost sign-in code is ${code}.\n\nIt works for 10 minutes. If you did not ask for it, ignore this email.\n`,
          htmlContent: `<div style="font:16px/1.5 Georgia,serif;color:#1c1712"><p>Your Paradise Lost sign-in code:</p><p style="font-size:34px;letter-spacing:.25em;margin:.4em 0"><b>${code}</b></p><p style="color:#6b5f50">It works for 10 minutes. If you did not ask for it, ignore this email.</p></div>`,
        }),
      });
      if (!res.ok) throw new Error(`brevo: HTTP ${res.status}`);
      pending.set(email, { h: mac(email, code), exp: Date.now() + 10 * 60e3, tries: 0 });
    },
    // → true when the code matches; a wrong code costs a try, and 5 wrong ones burn it.
    check(email, code) {
      const p = pending.get(email);
      if (!p || p.exp < Date.now()) { pending.delete(email); return false; }
      if (++p.tries > 5) { pending.delete(email); return false; }
      const want = Buffer.from(p.h), got = Buffer.from(mac(email, String(code).replace(/\D/g, '')));
      if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return false;
      pending.delete(email);
      return true;
    },
  };
}
