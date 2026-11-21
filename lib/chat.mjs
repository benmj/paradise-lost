// "Ask the Reader": what the reader knows and how it is asked.
// The context comes from the poem on this server; the client only names a book (and the line the reader
// is at), the whole poem, or a character, so nothing the page sends can change what the text says.
import fs from 'node:fs';

export class ChatError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

export function loadBook(file) {
  const s = fs.readFileSync(file, 'utf8');
  const data = JSON.parse(s.slice(s.indexOf('{'), s.lastIndexOf('}') + 1));
  if (!data.books || data.books.length !== 12) throw new Error(`expected 12 books in ${file}`);
  return data;
}

export const SYSTEM = `You are the reader inside a Paradise Lost reading guide: someone who knows Milton's poem (the 1674 text in twelve books), its sources and its critics well, talking with a reader about the part he has open.

How to answer:
- Ground what you say in the text below. Quote short phrases, and cite lines as book and line in roman and arabic numerals, like (IV.288) or (IX.780–784). Only cite lines you can see in the text below.
- Explain the language when it helps: Latinate syntax, double meanings, classical and biblical allusions, Milton's theology and politics.
- Where readers disagree (is Satan heroic? is Eve to blame? does God sound like a school divine?), say so and give the strongest version of each side briefly.
- Don't give away what happens in later books unless the reader asks or already knows it; first-time readers are often reading along.
- Plain, warm and direct, like a good tutor who loves the poem. No purple prose.
- Short by default: about 120 to 250 words. Go longer only when the reader asks.
- Light Markdown only: short paragraphs, **bold** for a key phrase, a short list when it helps. No headings, no tables.
- No "Sources" line, sign-off or citation footer: the text is already open in front of the reader.`;

const numbered = (b) => b.lines.map((l, i) => `${i + 1}  ${l}`).join('\n');
const sectionsList = (g) => (g ? g.sections.map((s) => `- ${s.from}–${s.to} ${s.title}: ${s.note}`).join('\n') : '');
const index = (data) => data.books.map((b) => {
  const g = data.guide[b.n];
  return `Book ${ROMAN[b.n]}${g ? ` · ${g.title}: ${g.summary}` : ''}`;
}).join('\n');

// → { label, text } for the system prompt.
export function buildContext(data, ctx) {
  const kind = ctx && ctx.kind;
  if (kind === 'book') {
    const n = Number(ctx.n);
    const b = data.books[n - 1];
    if (!b || !Number.isInteger(n)) throw new ChatError(400, 'bad book');
    const g = data.guide[n];
    const l = Number(ctx.l);
    const at = Number.isInteger(l) && l >= 1 && l <= b.lines.length ? l : 0;
    const sec = at && g ? g.sections.find((s) => at >= s.from && at <= s.to) : null;
    const text = [
      `## Where the reader is`,
      at ? `The reader is at Book ${ROMAN[n]} around line ${at}${sec ? `, in "${sec.title}" (${sec.from}–${sec.to})` : ''}.` : `The reader has Book ${ROMAN[n]} open.`,
      '',
      '## The twelve books',
      index(data),
      '',
      g ? `## Guide to Book ${ROMAN[n]}: ${g.title}\nSetting: ${g.setting}\n${g.summary}\n\nSections:\n${sectionsList(g)}\n` : '',
      `## The text of Book ${ROMAN[n]} (1674), numbered`,
      numbered(b),
    ].join('\n');
    return { label: `book ${n}${at ? `.${at}` : ''}`, text };
  }
  if (kind === 'person') {
    const c = data.characters.find((x) => x.id === String(ctx.id || ''));
    if (!c) throw new ChatError(400, 'bad character');
    const q = data.books[c.quote.book - 1].lines.slice(c.quote.from - 1, c.quote.to).join('\n');
    const appears = c.books.map((n) => {
      const g = data.guide[n];
      if (!g) return `Book ${ROMAN[n]}`;
      const lc = c.name.toLowerCase().replace(/^the /, '');
      const where = g.sections.filter((s) => (s.title + ' ' + s.note).toLowerCase().includes(lc)).map((s) => `${ROMAN[n]}.${s.from}–${s.to} ${s.title}`);
      return `Book ${ROMAN[n]} · ${g.title}${where.length ? `: ${where.join('; ')}` : ''}`;
    }).join('\n');
    const text = [
      `## The character the reader is looking at: ${c.name} (${c.kind})`,
      c.line, c.about,
      `First appears at ${ROMAN[c.first.book]}.${c.first.line}.`,
      `A key passage (${ROMAN[c.quote.book]}.${c.quote.from}–${c.quote.to}):\n${q}`,
      '', '## Where they appear', appears,
      '', '## The twelve books', index(data),
    ].join('\n');
    return { label: `character ${c.id}`, text };
  }
  const all = data.books.map((b) => {
    const g = data.guide[b.n];
    return g ? `### Book ${ROMAN[b.n]}: ${g.title}\nSetting: ${g.setting}\n${g.summary}\n${sectionsList(g)}` : `### Book ${ROMAN[b.n]}`;
  }).join('\n\n');
  const people = data.characters.map((c) => `- ${c.name} (${c.kind}): ${c.line}`).join('\n');
  return { label: 'the poem', text: `## The poem\nThe reader is on the home page, with no book open. Line counts by book: ${data.books.map((b) => b.lines.length).join(', ')}.\n\n${all}\n\n## Characters\n${people}` };
}

export function checkMessages(messages) {
  if (!Array.isArray(messages) || !messages.length || messages.length > 60) throw new ChatError(400, 'bad messages');
  let total = 0;
  const out = messages.map((m) => {
    const role = m && m.role;
    const content = String((m && m.content) || '').trim();
    if ((role !== 'user' && role !== 'assistant') || !content) throw new ChatError(400, 'bad message');
    if (content.length > 8000) throw new ChatError(413, 'message too long');
    total += content.length;
    return { role, content };
  });
  if (total > 60_000) throw new ChatError(413, 'conversation too long; start a new one');
  if (out[out.length - 1].role !== 'user') throw new ChatError(400, 'last message must be from the reader');
  return out;
}

// The whole conversation goes in one prompt: no sessions are kept on the server.
export function transcript(messages) {
  if (messages.length === 1) return messages[0].content;
  const past = messages.slice(0, -1).map((m) => `${m.role === 'user' ? 'Reader' : 'You'}: ${m.content}`).join('\n\n');
  return `The conversation so far:\n\n${past}\n\nThe reader now says:\n${messages[messages.length - 1].content}`;
}
