// Dictionary lookup for Milton's English: the curated lexicon (data/lexicon.json) first, then the
// English Wiktionary (CC BY-SA 4.0) through the MediaWiki action API. No dependencies.
//
// lookup(word) → { word, resolved, found, milton, via, entries:[{pos, senses:[string], old:n}], etymology:[string], url, license }
//   milton   the lexicon entry {word, milton, note?, root?} or null
//   via      { from, note } when the page only said "form of X" and we followed to X
//   senses   obsolete/archaic/dated/poetic/Latinism/rare senses first (old = how many), then modern ones
//   never contains HTML: every string is stripped of tags and angle brackets.
import fs from 'node:fs';
import path from 'node:path';

const UA = 'paradise-lost/1.0 (https://github.com/benmj/paradise-lost)';
const API = 'https://en.wiktionary.org/w/api.php';
const LICENSE = 'CC BY-SA 4.0';
const TTL = 24 * 3600 * 1000;
const MAX_CACHE = 2000;
const MAX_SENSES = 6, MAX_OLD = 4;

export class DictError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

// ---------- lexicon ----------
let LEX = new Map();
export function loadLexicon(file) {
  try {
    const arr = JSON.parse(fs.readFileSync(file, 'utf8'));
    LEX = new Map(arr.map((e) => [e.word.toLowerCase().replace(/’/g, "'"), e]));
  } catch (e) { console.warn(`[dict] no lexicon: ${e.message}`); }
  return LEX.size;
}
export const lexiconSize = () => LEX.size;

// ---------- word cleanup and variants ----------
const IRREGULAR = { "o'er": 'over', "e'er": 'ever', "ne'er": 'never', "ev'n": 'even', "ev'ry": 'every', "'gainst": 'against', "'twixt": 'betwixt', "'mid": 'amid', "'midst": 'amidst', "heav'n": 'heaven', "heav'ns": 'heavens', "th'": 'the', ye: 'you', "whate'er": 'whatever', "whene'er": 'whenever', "whither": 'whither' };

export function cleanWord(raw) {
  let w = String(raw || '').normalize('NFC').replace(/[’‘`´]/g, "'").trim();
  if (w.length === 0 || w.length > 40) return '';
  if (!/^[\p{L}'-]+$/u.test(w)) return '';
  w = w.replace(/^-+|-+$/g, '').replace(/'+$/, '');
  if (w.startsWith("'") && !IRREGULAR[w.toLowerCase()]) w = w.replace(/^'+/, '');
  if (!/\p{L}/u.test(w)) return '';
  return w.toLowerCase();
}

// Candidate spellings, most likely first (the word itself, elisions expanded, then stems).
export function variants(w) {
  const out = [];
  const add = (x) => { if (x && x.length > 1 && !out.includes(x)) out.push(x); };
  let base = w;
  if (/^th'/.test(base) && base.length > 3) { add(base.slice(3)); base = base.slice(3); }   // th'infernal
  add(base);
  if (IRREGULAR[base]) add(IRREGULAR[base]);
  if (base.includes("'")) {
    add(base.replace(/'d$/, 'ed'));
    add(base.replace(/'/g, 'e'));
    add(base.replace(/'/g, 'i'));
    add(base.replace(/'/g, 'o'));
    add(base.replace(/'/g, ''));
    add(base.replace(/'d$/, 'd'));
    add(base.replace(/'n$/, 'en'));
  }
  const plain = base.replace(/'/g, '');
  const stems = (s) => {
    const r = [];
    const undouble = (x) => (/(.)\1$/.test(x) ? x.slice(0, -1) : x);
    if (/(eth|est)$/.test(s)) r.push(s.slice(0, -3), s.slice(0, -3) + 'e', undouble(s.slice(0, -3)));
    if (/th$/.test(s) && !/eth$/.test(s)) r.push(s.slice(0, -2), s.slice(0, -2) + 'e');
    if (/ing$/.test(s)) r.push(s.slice(0, -3), s.slice(0, -3) + 'e', undouble(s.slice(0, -3)));
    if (/ed$/.test(s)) r.push(s.slice(0, -2), s.slice(0, -1), undouble(s.slice(0, -2)));
    if (/ies$/.test(s)) r.push(s.slice(0, -3) + 'y');
    if (/es$/.test(s)) r.push(s.slice(0, -2));
    if (/s$/.test(s) && !/ss$/.test(s)) r.push(s.slice(0, -1));
    if (/ly$/.test(s)) r.push(s.slice(0, -2));
    return r;
  };
  for (const c of [...out]) for (const s of stems(c)) add(s);
  for (const s of stems(plain)) add(s);
  return out;
}

// ---------- upstream: a few requests a second, never a pile-up ----------
const GAP_MS = 300, MAX_QUEUE = 12;
let nextAt = 0, queued = 0;
async function upstream(params) {
  if (queued >= MAX_QUEUE) throw new DictError(503, 'dictionary is busy');
  queued++;
  try {
    const wait = Math.max(0, nextAt - Date.now());
    nextAt = Math.max(nextAt, Date.now()) + GAP_MS;
    if (wait) await new Promise((r) => setTimeout(r, wait));
  } finally { queued--; }
  const url = `${API}?${new URLSearchParams({ format: 'json', formatversion: '2', redirects: '1', ...params })}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Api-User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new DictError(502, `wiktionary HTTP ${res.status}`);
  return res.json();
}

// ---------- HTML → text ----------
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s) => s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ''; }
  return ENT[e.toLowerCase()] ?? '';
});
const tidy = (s) => decode(s).replace(/[<>]/g, '').replace(/\[\d+\]|\[citation needed\]/g, '').replace(/\s+/g, ' ').replace(/\s+([,.;:)])/g, '$1').replace(/\(\s+/g, '(').trim();

const VOID = new Set(['br', 'img', 'hr', 'input', 'meta', 'link', 'wbr']);
const POS = new Set(['noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition', 'conjunction', 'interjection', 'determiner', 'article', 'numeral', 'particle', 'proper noun', 'contraction', 'participle', 'prefix', 'suffix', 'letter', 'symbol']);
const SKIP_IN_LI = new Set(['ul', 'dl', 'ol', 'div', 'table', 'style', 'script', 'sup']);
const OLD_LABEL = /\b(obsolete|archaic|poetic|poetically|literary|historical|latinism|now rare|rare|chiefly literary|biblical|old-fashioned)\b/i;
const CRUDE = /\b(slang|derogatory|offensive|vulgar|pejorative|ethnic slur|slur|colloquial|informal|dated)\b/i;

// Parse the English section's HTML into { entries:[{pos, senses:[{text, labels}]}], etymology:[string] }.
export function parseEnglish(html) {
  const start = html.search(/<h2[^>]*\bid="English"/);
  if (start < 0) return null;
  const rest = html.slice(start + 5);
  const nx = rest.search(/<h2[\s>]/);
  const sect = nx < 0 ? rest : rest.slice(0, nx);
  const entries = [], etymology = [];
  let pos = null, cur = null, ety = false;
  let heading = null;                // collecting heading text
  let para = null;                   // collecting etymology paragraph
  let li = null;                     // { depth, text }
  const stack = [];
  const re = /<(\/?)([a-z][a-z0-9]*)([^>]*)>|([^<]+)/gi;
  let m;
  while ((m = re.exec(sect))) {
    if (m[4] !== undefined) {
      const t = m[4];
      if (heading !== null) heading += t;
      else if (li && !stack.slice(li.depth).some((x) => SKIP_IN_LI.has(x))) li.text += t;
      else if (para !== null && !stack.some((x) => x === 'style' || x === 'sup')) para += t;
      continue;
    }
    const close = m[1] === '/', tag = m[2].toLowerCase();
    if (VOID.has(tag)) continue;
    if (!close) {
      if (/^h[2-6]$/.test(tag)) { heading = ''; }
      if (tag === 'li' && stack[stack.length - 1] === 'ol' && pos && !li && stack.filter((x) => x === 'li').length === 0) li = { depth: stack.length + 1, text: '' };
      if (tag === 'p' && ety && para === null && !li) para = '';
      stack.push(tag);
    } else {
      const i = stack.lastIndexOf(tag);
      if (i >= 0) stack.length = i;
      if (/^h[2-6]$/.test(tag) && heading !== null) {
        const h = tidy(heading).toLowerCase();
        heading = null; para = null;
        ety = /^etymology/.test(h);
        pos = POS.has(h) ? h : null;
        cur = null;
        if (pos) { cur = { pos: h, senses: [] }; entries.push(cur); }
      } else if (tag === 'p' && para !== null) {
        const t = tidy(para); para = null;
        if (t.length > 8 && etymology.length < 3) etymology.push(t.length > 700 ? `${t.slice(0, 697).replace(/\s+\S*$/, '')}…` : t);
      } else if (tag === 'li' && li && stack.length < li.depth) {
        const t = tidy(li.text); li = null;
        if (cur && t && cur.senses.length < 12) {
          const labels = [];
          let body = t;
          for (let g; (g = /^\(([^()]*)\)\s*/.exec(body));) { labels.push(g[1]); body = body.slice(g[0].length); }
          cur.senses.push({ text: t, labels: labels.join(', '), body });
        }
      }
    }
  }
  return { entries: entries.filter((e) => e.senses.length), etymology };
}

const FORM_OF = /\b(?:form|spelling|participle|tense|plural|singular|comparative|superlative|indicative|subjunctive|imperative|person|gerund|elision|contraction|variant|misspelling|abbreviation|nominative|accusative|genitive|dative|inflection|obsolete spelling)\b[^.]*?\bof\s+([\p{L}'’-]+)\s*(?:\(.*)?[.;]?$/iu;
const formOfTarget = (s) => { const m = FORM_OF.exec(s.body || s.text); return m ? m[1].replace(/[’]/g, "'") : null; };

// Order and trim: old senses first, at most MAX_OLD, six in all, modern kept in view.
function shape(entries, cap = 4) {
  return entries.slice(0, cap).map((e) => {
    const keep = e.senses.filter((s) => !/\b(derogatory|offensive|vulgar|slur)\b/i.test(s.labels));
    const isOld = (s) => OLD_LABEL.test(s.labels) && !CRUDE.test(s.labels);
    const old = keep.filter(isOld);
    const modern = keep.filter((s) => !isOld(s));
    const o = old.slice(0, modern.length ? Math.min(MAX_OLD, MAX_SENSES - 1) : MAX_SENSES);
    const mo = modern.slice(0, MAX_SENSES - o.length);
    return { pos: e.pos, senses: [...o, ...mo].map((s) => s.text.slice(0, 300)), old: o.length };
  });
}

async function fetchPage(title) {
  let j;
  try { j = await upstream({ action: 'parse', page: title, prop: 'text', disabletoc: '1', disableeditsection: '1', disablelimitreport: '1' }); }
  catch (e) { if (e instanceof DictError) throw e; throw new DictError(502, 'dictionary unreachable'); }
  if (j.error) { if (j.error.code === 'missingtitle' || j.error.code === 'invalidtitle') return null; throw new DictError(502, `wiktionary: ${j.error.code}`); }
  const html = j.parse && j.parse.text;
  return html ? { title: j.parse.title, parsed: parseEnglish(html) } : null;
}

const titleCases = (w) => [w, w[0].toUpperCase() + w.slice(1)];

// ---------- cache ----------
const cache = new Map();
const inflight = new Map();
const cget = (k) => { const v = cache.get(k); if (!v) return null; if (Date.now() - v.at > TTL) { cache.delete(k); return null; } cache.delete(k); cache.set(k, v); return v.val; };
const cset = (k, val) => { cache.set(k, { at: Date.now(), val }); while (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value); };

function lexiconFor(cands) {
  for (const c of cands) { const e = LEX.get(c) || LEX.get(c.replace(/'/g, '')); if (e) return { word: e.word, milton: e.milton, src: e.src, ...(e.note ? { note: e.note } : {}), ...(e.root ? { root: e.root } : {}) }; }
  return null;
}

export async function lookup(word) {
  const w = cleanWord(word);
  if (!w) throw new DictError(400, 'a word of letters, hyphens and apostrophes, up to 40 characters');
  const hit = cget(w);
  if (hit) return hit;
  if (inflight.has(w)) return inflight.get(w);
  const p = doLookup(w).then((v) => { cset(w, v); return v; }).finally(() => inflight.delete(w));
  inflight.set(w, p);
  return p;
}

async function doLookup(w) {
  const cands = variants(w);
  const milton = lexiconFor(cands);
  let page = null, tries = 0;
  for (const c of cands) {
    for (const t of titleCases(c)) {
      if (tries++ >= 6) break;
      const p = await fetchPage(t);
      if (p && p.parsed && p.parsed.entries.length) { page = p; break; }
    }
    if (page || tries >= 6) break;
  }
  let via = null;
  if (page) {
    const all = page.parsed.entries.flatMap((e) => e.senses);
    const tgt = all.length && all.every((s) => formOfTarget(s)) ? formOfTarget(all[0]) : null;
    if (tgt && tgt !== page.title) {
      let q = null;
      for (const t of [...new Set([tgt, ...titleCases(tgt.toLowerCase())])]) { q = await fetchPage(t); if (q && q.parsed && q.parsed.entries.length) break; q = null; }
      if (q) { via = { from: page.title, note: all[0].text.slice(0, 200) }; page = q; }
    }
  }
  const title = page ? page.title : cands[0];
  const out = {
    word: w, resolved: title, found: Boolean(page) || Boolean(milton), milton, via,
    entries: page ? shape(page.parsed.entries, via ? 2 : 4).filter((e) => e.senses.length) : [],
    etymology: page ? page.parsed.etymology : [],
    url: `https://en.wiktionary.org/wiki/${encodeURIComponent(title)}#English`,
    license: LICENSE,
  };
  return out;
}
