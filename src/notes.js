// The reader's notebook: line citations in Ask the Reader's answers, kept as footnotes.
// Client-side only (no AI calls). Stored in localStorage ("notes"); signed-in readers also sync it
// through /api/state (see app.js). One footnote per passage (book + line range), up to 3 notes each.
//   footnote = { id: "4.288-290", book, line, to, quote, notes: [{ note, question, when }], when }
window.NOTES = (function () {
  const KEY = "notes", TKEY = "notes-t";
  const MAX = 200, MAX_NOTES = 3, MAX_RANGE = 40;
  const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
  const R2N = Object.fromEntries(ROMAN.map((r, i) => [r, i]));
  const LIM = { quote: 240, note: 260, question: 160 };

  const ls = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  const book = (n) => (window.PL && window.PL.books[n - 1]) || null;
  const idOf = (n, a, b) => `${n}.${a}-${b}`;
  const label = (f) => `${ROMAN[f.book]}.${f.line}${f.to > f.line ? `–${f.to}` : ""}`;
  const clip = (s, n) => {
    s = String(s || "").replace(/\s+/g, " ").trim();
    if (s.length <= n) return s;
    const cut = s.slice(0, n - 1);
    return cut.replace(/\s+\S*$/, "") + "…";
  };

  // Keep only well-formed footnotes whose lines exist in the poem (also used on what the server sends back).
  function sanitize(arr) {
    const out = new Map();
    (Array.isArray(arr) ? arr : []).forEach((f) => {
      if (!f || !Number.isInteger(f.book) || !Number.isInteger(f.line) || !Number.isInteger(f.to)) return;
      const b = book(f.book);
      if (!b || f.line < 1 || f.line > b.lines.length || f.to < f.line || f.to > Math.min(b.lines.length, f.line + MAX_RANGE)) return;
      const notes = (Array.isArray(f.notes) ? f.notes : []).slice(0, MAX_NOTES).map((x) => ({
        note: clip(x && x.note, LIM.note), question: clip(x && x.question, LIM.question), when: Number.isFinite(x && x.when) ? x.when : 0,
      })).filter((x) => x.note);
      if (!notes.length) return;
      const id = idOf(f.book, f.line, f.to);
      if (out.has(id)) return;
      out.set(id, { id, book: f.book, line: f.line, to: f.to, quote: clip(f.quote, LIM.quote), notes, when: Number.isFinite(f.when) ? f.when : notes[0].when });
    });
    return [...out.values()].sort((a, b) => b.when - a.when).slice(0, MAX);
  }

  let list = sanitize(ls.get(KEY, []));
  const subs = new Set();
  const emit = () => subs.forEach((fn) => { try { fn(); } catch {} });
  function commit(next, stamp = Date.now()) {
    list = next;
    ls.set(KEY, list);
    ls.set(TKEY, stamp);
    emit();
  }
  window.addEventListener("storage", (e) => { if (e.key === KEY) { list = sanitize(ls.get(KEY, [])); emit(); } });

  // ── reading a reply ──
  const plain = (text) => String(text || "")
    .replace(/\n\s*\**Sources?\**:[^\n]*\s*$/i, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/(^|[^*\w])\*(?!\s)(.+?)\*(?!\w)/g, "$1$2")
    .replace(/(^|[^_\w])_(?!\s)(.+?)_(?!\w)/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*(?:[-*•]|\d+[.)])\s+/gm, "")
    .replace(/^>\s?/gm, "");

  // Cited lines, as { book, line, to, at } with the offset where the citation sits in the text.
  const CITE = new RegExp(
    "\\b(XII|XI|X|IX|VIII|VII|VI|V|IV|III|II|I)\\.(\\d{1,4})(?:\\s?[–—-]\\s?(\\d{1,4}))?\\b" +
    "|\\bBook\\s+(XII|XI|X|IX|VIII|VII|VI|V|IV|III|II|I|\\d{1,2})\\s*,?\\s+lines?\\s+(\\d{1,4})(?:\\s?[–—-]\\s?(\\d{1,4}))?", "g");
  function citations(text) {
    const out = [];
    let m;
    CITE.lastIndex = 0;
    while ((m = CITE.exec(text))) {
      const n = m[1] ? R2N[m[1]] : (R2N[m[4]] || Number(m[4]));
      const a = Number(m[2] || m[5]), z = Number(m[3] || m[6] || 0);
      out.push({ book: n, line: a, to: z, at: m.index });
    }
    return out;
  }
  // A cited range clamped to the book; null when the line is not in the poem.
  function resolve(c) {
    const b = book(c.book);
    if (!b || !(c.line >= 1 && c.line <= b.lines.length)) return null;
    let to = c.to >= c.line ? c.to : c.line;
    to = Math.min(to, b.lines.length, c.line + MAX_RANGE - 1);
    return { book: c.book, line: c.line, to };
  }
  const STOP = new Set("the and for was are that with this his her its from has have into than but not you your they them their there which who what when where while also then only just such very more most some any can could would should will may might did does done been being were had how why our out too yet say says said here again".split(" "));
  const stem = (w) => w.replace(/(?:ing|ed|es|s)$/, "");
  const words = (s) => String(s).toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)).map(stem);
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean).join(" ");
  // Two sentences about the same thing: most of the shorter one's content words are in the other.
  function similar(a, b) {
    const x = new Set(words(a)), y = new Set(words(b));
    if (!x.size || !y.size) return false;
    let k = 0;
    x.forEach((w) => { if (y.has(w)) k++; });
    return k / (x.size + y.size - k) >= 0.5 || (Math.min(x.size, y.size) >= 4 && k / Math.min(x.size, y.size) >= 0.7);
  }
  function quoteOf(r) {
    const ls = book(r.book).lines.slice(r.line - 1, r.to);
    const w = ls.join(" / ").split(/\s+/);
    return w.length > 25 ? w.slice(0, 25).join(" ").replace(/[,;:.\s/]+$/, "") + "…" : w.join(" ");
  }
  // The sentence of the answer holding the citation (with the one before it when that is only a stub).
  function sentenceAt(text, at) {
    let start = 0, end = text.length;
    const sep = /\n+|(?<=[.!?”"])\s+(?=[A-Z“"(])/g;
    const parts = [];
    let m, last = 0;
    while ((m = sep.exec(text))) { parts.push([last, m.index]); last = m.index + m[0].length; }
    parts.push([last, text.length]);
    let i = parts.findIndex(([a, b]) => at >= a && at < Math.max(b, a + 1));
    if (i < 0) i = parts.length - 1;
    [start, end] = parts[i];
    let s = text.slice(start, end);
    const bare = s.replace(CITE, " ").replace(/[()\[\].,;:\s]/g, "");
    if (bare.split(/\s+/).join("").length < 14 && i > 0) s = text.slice(parts[i - 1][0], parts[i - 1][1]) + " " + s;
    return clip(s, LIM.note);
  }
  const questionParts = (q) => {
    const lines = String(q || "").split("\n");
    const quoted = lines.filter((l) => l.startsWith(">")).map((l) => l.replace(/^>\s?/, "")).join(" ");
    const ask = lines.filter((l) => !l.startsWith(">")).join(" ").trim();
    return { quoted: norm(quoted), ask: clip(ask, LIM.question) };
  };

  // Turn a finished answer into footnotes. Returns what was added, for the chips under the answer:
  //   [{ id, label, created, when }]   (nothing when there was nothing new to keep)
  function capture(answer, question) {
    const text = plain(answer);
    const { quoted, ask } = questionParts(question);
    const found = new Map();
    citations(text).forEach((c) => {
      const r = resolve(c);
      if (!r) return;
      const cn = norm(book(r.book).lines.slice(r.line - 1, r.to).join(" "));
      // the reader pasted this very passage: citing it back adds nothing
      if (quoted && cn && (quoted.includes(cn) || (r.to === r.line && cn.includes(quoted) && quoted.length > 12))) return;
      const id = idOf(r.book, r.line, r.to);
      const sentence = sentenceAt(text, c.at);
      const e = found.get(id) || { ...r, id, sentences: [] };
      if (sentence && !e.sentences.some((s) => similar(s, sentence))) e.sentences.push(sentence);
      found.set(id, e);
    });
    if (!found.size) return [];
    const when = Date.now();
    const next = list.map((f) => ({ ...f, notes: f.notes.slice() }));
    const added = [];
    found.forEach((e) => {
      let f = next.find((x) => x.id === e.id);
      const created = !f;
      if (!f) { f = { id: e.id, book: e.book, line: e.line, to: e.to, quote: quoteOf(e), notes: [], when }; next.push(f); }
      let kept = 0;
      e.sentences.forEach((s) => {
        if (f.notes.some((x) => similar(x.note, s))) return;
        f.notes.unshift({ note: s, question: ask, when });
        kept++;
      });
      f.notes = f.notes.slice(0, MAX_NOTES);
      if (kept) { f.when = when; added.push({ id: e.id, label: label(f), created, when }); }
      else if (created) next.splice(next.indexOf(f), 1);
    });
    if (!added.length) return [];
    commit(sanitize(next), when);
    return added;
  }
  // Take back what one answer added: its note, and the footnote too when it came with that answer.
  function undo(rec) {
    const next = list.map((f) => ({ ...f, notes: f.notes.slice() }));
    const f = next.find((x) => x.id === rec.id);
    if (!f) return false;
    f.notes = f.notes.filter((x) => x.when !== rec.when);
    if (!f.notes.length) next.splice(next.indexOf(f), 1);
    commit(next);
    return true;
  }
  // Two copies that both changed: keep every passage, and for a shared one the newest notes of both.
  function merge(a, b) {
    const out = new Map();
    [...sanitize(a), ...sanitize(b)].forEach((f) => {
      const o = out.get(f.id);
      if (!o) { out.set(f.id, { ...f, notes: f.notes.slice() }); return; }
      const seen = new Set(o.notes.map((x) => `${x.when}|${x.note}`));
      f.notes.forEach((x) => { if (!seen.has(`${x.when}|${x.note}`) && !o.notes.some((y) => similar(y.note, x.note))) o.notes.push(x); });
      o.notes = o.notes.sort((p, q) => q.when - p.when).slice(0, MAX_NOTES);
      o.when = Math.max(o.when, f.when);
    });
    return [...out.values()];
  }
  const remove = (id) => commit(list.filter((f) => f.id !== id));
  const clear = () => commit([]);

  const byPlace = (a, b) => a.book - b.book || a.line - b.line || a.to - b.to;
  const sorted = () => list.slice().sort(byPlace);

  // Footnotes of one book ending at each line: Map line → [footnote], and each one's number in the book.
  function ofBook(n) {
    const fs = sorted().filter((f) => f.book === n);
    const at = new Map();
    fs.forEach((f, i) => { const k = { ...f, i: i + 1 }; if (!at.has(f.to)) at.set(f.to, []); at.get(f.to).push(k); });
    return at;
  }

  function markdown() {
    const out = ["# Notes on Paradise Lost", ""];
    let cur = 0, k = 0;
    sorted().forEach((f) => {
      if (f.book !== cur) { cur = f.book; k = 0; out.push(`## Book ${ROMAN[cur]}`, ""); }
      out.push(`${++k}. **${label(f)}** “${f.quote.replace(/\s*\/\s*/g, " / ")}”`);
      f.notes.forEach((x) => out.push(`   - ${x.note}${x.question ? ` (asked: “${x.question}”)` : ""}`));
      out.push("");
    });
    return out.join("\n").replace(/\n+$/, "\n");
  }

  return {
    all: () => list.slice(),
    sorted, ofBook, markdown, capture, undo, remove, clear, merge, sanitize, citations, label,
    count: () => list.length,
    stamp: () => ls.get(TKEY, 0),
    // The server's copy replaces ours when it is newer (last write wins; see README).
    replace(arr, stamp) { commit(sanitize(arr), stamp); },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
})();
