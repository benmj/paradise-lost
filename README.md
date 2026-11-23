# Paradise Lost

- **Purpose:** an illustrated reading guide to Milton's *Paradise Lost* (1674, twelve books), for reading the poem along with notes, Doré's plates, recitations and a tutor to ask. Open source (MIT); one hosted copy runs at `paradise.benbybenjacobs.com`.
- **Design:**
  - One page app (plain HTML, CSS and JS) in a restrained Doré-inspired print look: all fifty of Gustave Doré's 1866 engravings placed at their lines, IM Fell and EB Garamond, crimson accents.
  - For each book: a **Guide** (argument, setting, sections, people), **Read** (the full text with glosses, famous passages and line numbers) and **Listen** (YouTube recitations and audiobooks).
  - **Three ways to read:** Scroll, Page (one book-style page at a time) and Two pages (a spread with a spine, on screens 820 px and wider). Turn pages with the arrows, space, swipe or the buttons; the layout and your place carry over when you switch.
  - **Read-along:** a Listen button in the Read view plays the LibriVox reading inline and lights the word being read. See "Read-along".
  - **Ask the Reader**: the only AI in the app, a chat about the passage you have open. `server.mjs` builds the context from the poem and streams the reply from the Anthropic API.
  - **Dictionary:** an online dictionary with etymology. Tap any word (Dictionary button in the Read bar, or press and hold) for Milton's sense first, then Wiktionary senses ranked "In Milton's day" before "Today". See "Dictionary".
  - **Reader's notebook:** line citations in an answer become curated footnotes, marked in the poem and collected at `#/notes`. No extra AI calls. See "Notes".
  - **Accounts** (public mode): Google sign-in, SQLite for users, reading place and usage. Reading needs no account; a saved place needs sign-in.
  - **Everything else is free and open to the public:** the guide, text, glosses, plates and listening list use no AI and need no account. Only chat is limited (own key, or the host's allowlist).
  - **Who pays for chat:** readers bring their own Anthropic API key (kept in their browser, sent per question, never stored). Only an allowlist and the admins use the host's key, capped per user per day and per month.
  - One Node process with no npm dependencies (Node 22.5+, Python 3 to build).
  ```
  browser ─► (proxy) ─► node server.mjs ─┬─► dist/ (static)
                                          ├─► /auth/* ─► Google
                                          ├─► /api/state (place, notes), /api/me ─► SQLite
                                          ├─► /api/dict ─► en.wiktionary.org (cached)
                                          └─► /api/chat ─► Anthropic API (key's owner pays)
  ```
- **Documents:** this README, `NOTICE.md` (licenses of the text and plates), `.env.example` (every setting). Screenshots: `node scripts/shots.mjs` writes them to `shots/`.

## Self-host

```sh
git clone <this repo> && cd paradise-lost
python3 scripts/build.py                    # data/ + src/ → dist/
cp .env.example .env                        # fill in, then export the variables
node --disable-warning=ExperimentalWarning server.mjs
```

- **Try it locally:** `DEV_USER=you@example.com node server.mjs`, then open `http://localhost:8107`. Chat uses `claude -p` on your own login if you have Claude Code, or the API if `ANTHROPIC_API_KEY` is set.
- **Public:** set `BASE_URL` (https), `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Readers chat with their own key. To cover some people yourself, also set `ANTHROPIC_API_KEY` and `ALLOWLIST=a@x.com,b@y.com`. Put any reverse proxy in front (`deploy/Caddyfile.example`; keep streaming on). Docker: `Dockerfile`; systemd: `deploy/paradise.service.example`.
- **Bring your own key:** a reader without a hosted-key seat sees a key box in the chat. The key goes in `localStorage` and an `X-User-Api-Key` header on each question; the server uses it for that request only and never logs or stores it. Its cost is billed to the reader's own Anthropic account and is not counted against your caps.
- **Admin:** `ADMINS=you@example.com`, then `/api/admin/usage` shows users, daily spend and top users.
- **Private mode:** `ACCESS_AUD` and `ACCESS_TEAM` gate the whole site behind Cloudflare Access instead of Google sign-in (the author's setup before going public).

## Cost control

Applies to the hosted key only (allowlist and admins); readers using their own key are not metered.

- Chat spend is estimated from the API's token counts (`PL_PRICE_IN`, `PL_PRICE_OUT` in USD per million tokens) and stored per user per day.
- `USER_DAILY_USD` (default 0.15) stops one user; `MONTHLY_USD` (default 25) pauses chat for everyone until next month.
- The book text is sent as a cached prompt block, so follow-up questions about a book cost a fraction of the first.
- Output is capped (`PL_MAX_OUTPUT_TOKENS`, default 700); a user can send 8 questions a minute.
- **Open beta** (`OPEN_BETA=1`, public mode): every signed-in reader uses the hosted key, capped by `USER_DAILY_USD` each, `OPEN_BETA_DAILY_USD` (default 5) for all beta readers per UTC day, and `MONTHLY_USD`. When any cap is spent the reader sees the bring-your-own-key box instead of a pause; allowlist and admins are not held to the beta cap.
- Set a spend limit on the API key's workspace in the Anthropic Console as the hard backstop; the caps above are estimates.

## Layout

| Path | What |
|---|---|
| `source/pg26-1674.txt` | Project Gutenberg #26, the 1674 text (public domain) |
| `data/text.json` | The twelve books as numbered lines, from `scripts/text.py` |
| `data/guide/book-NN.json` | Notes per book: argument, setting, sections, glosses, famous passages |
| `data/characters.json` | 22 people of the poem, with first appearance and a key passage |
| `data/audio/book-NN.json` | Read-along word timings per book, from `scripts/align.py`; copied to `dist/audio/` |
| `data/listen.json` | YouTube recitations, LibriVox readings and recommended audiobooks |
| `src/` | The app: `index.html`, `app.js` (routes, reader, account), `chat.js`, `notes.js` (footnote capture, curation, export), `art.js` (SVG fallback art), `styles.css`, service worker, icons |
| `art/web/NN.jpg`, `art/hi/NN.jpg`, `art/plates.json` | Doré's fifty plates (720 px copies for the page, best available scans in `hi/` for big screens and enlarging) and each one's book, line, title and mapping confidence |
| `lib/dict.mjs` | Dictionary lookup: Milton spellings, Wiktionary parse, sense ranking, cache |
| `data/lexicon.json` | Curated Milton lexicon (354 entries), from `scripts/lexicon.py` |
| `scripts/lexicon.py` | Builds the lexicon: about 150 hand entries plus single-word guide glosses |
| `lib/chat.mjs` | What the reader is told: system prompt, context per book, line or character, message checks |
| `lib/llm.mjs` | Chat backends: Anthropic API over fetch, or `claude -p` for local use; cost estimate |
| `lib/auth.mjs` | Google sign-in and signed session cookies |
| `lib/db.mjs` | SQLite: users, state, usage |
| `server.mjs` | Static files, `/auth/*`, `/api/*`, auth modes |
| `deploy/` | Examples for a reverse proxy and systemd |

## Notes

The reader's notebook: what people ask about builds into footnotes likely to help the next reader.

- **Capture:** when an answer finishes streaming, `src/notes.js` finds line citations in it, client side, with no AI call. Forms: `(IV.288)`, `IX.780–784`, `Book IV, line 288`, `Book II, lines 1–5`.
- **Footnote:** `{id, book, line, to, quote, notes:[{note, question, when}], when}`. `id` is `book.line-to`. `quote` is the first 25 words of the passage. Each `note` is the sentence of the answer that holds the citation, markdown stripped, with `question` the reader's ask. (A flat note/question/when is stored as the first entry of `notes`.)
- **Curation:**
  - One footnote per book and line range; later answers add notes, newest first, at most 3 per footnote.
  - A sentence that nearly repeats a stored one is dropped (word overlap after stop words and stemming).
  - Lines that do not exist are ignored; ranges are capped at 40 lines.
  - A citation of a passage the reader pasted into the question is ignored.
- **Chat:** under the answer, a "Saved to notes · IV.288" chip for each footnote touched, with Undo, and a link to the notebook.
- **Read view:** a superscript number at the end of a footnoted line in Scroll, Page and Two pages. It is an empty `span.fn-mark` drawn by CSS, after the line's text inside `span.ln`; the line stays one block with its `br`, so Safari Reader and the read-along word count are unchanged. Tap or Enter opens the note card: quote, notes, "Ask the Reader about this passage" and Remove.
- **`#/notes`:** footnotes by book in line order; Copy as Markdown (numbered per book, with book and line references), Clear (tap again to confirm), Remove and Read in context per footnote.
- **Storage and sync:** `localStorage` key `notes` with stamp `notes-t`. Signed in, the notes ride in `/api/state` (`notes`, `nt`). On load: if only the server changed since the last sync (`notes-s`), the server copy wins; if only this device changed, it pushes; if both, footnotes are union-merged by id.

## Read-along

The Read view has a headphones button in the top bar. It opens a compact player (play, back and forward 15 s, speed 0.8x / 1x / 1.25x, a scrubber with the current line) and lights the word being read.

- **Audio:** Thomas A. Copeland's LibriVox reading (public domain), streamed from `archive.org`. It is not stored in the repo and the service worker does not cache it.
- **Timings:** `data/audio/book-NN.json` is `{n, dur, lines: [[word start seconds per line]]}`. `scripts/build.py` copies them to `dist/audio/`; the player fetches a book's file when it opens. A book without a file has no button.
- **Highlight:** the CSS Custom Highlight API (`::highlight(reading)`) over a Range on the word's text. Word k of a line is the k-th whitespace-separated word of its text. Browsers without the API hide the player. The poem markup is unchanged.
- **Follow:** the page scrolls (or turns) to the current line when it leaves the middle of the view. Scrolling by hand pauses following for five seconds. Tapping a line number seeks there.
- **Lock screen:** `navigator.mediaSession` shows the title and artist and wires play, pause and seek.

### Making the timings

`scripts/align.py <book 1-12> <audio.mp3>` writes `data/audio/book-NN.json` by forced alignment of the reading to `data/text.json`, with the MMS forced-aligner from torchaudio (`MMS_FA`).

- **Needs:** a Python venv (`.venv-align/`, ignored by git) with `torch`, `torchaudio` and `soundfile`, plus `ffmpeg` on the path.
- **Audio files:** download the book's mp3 from the LibriVox item on archive.org (`paradiselost_1411_librivox`); keep it outside the repo.

## Dictionary

`GET /api/dict?w=<word>` returns `{word, resolved, found, milton, via, entries:[{pos, senses, old}], etymology, url, license}`.

- **Source:** the English section of en.wiktionary.org through the MediaWiki action API (`node` fetch, a descriptive User-Agent). Text is CC BY-SA 4.0; the card links to the page. Raw HTML is never returned.
- **Milton spellings:** lowercase, curly apostrophes, elisions (`th'` to the, `'d` to ed, `Heav'nly` to heavenly), irregulars (`o'er`, `ev'n`), stems (`-eth`, `-est`, `-ing`, `-ed`, `-s`), `ye` to you, and one "form of X" hop (`hath` to have).
- **Ranking:** senses labelled obsolete, archaic, poetic, literary, Latinism or rare come first under "In Milton's day"; modern ones follow under "Today". Offensive senses are dropped.
- **Lexicon:** `data/lexicon.json` has `{word, milton, note?, root}` per word, shown first as "Milton's sense", and also when Wiktionary has no sense (Pandemonium, Mammon, Belial). Rebuild with `python3 scripts/lexicon.py`.
- **Here:** a tapped word with a guide gloss also shows "Milton's sense here" from that line.
- **Limits:** in-memory LRU of 2000 words for 24 hours; upstream calls are spaced 300 ms apart; the service worker never caches `/api/`.

## Routes

- `#/`: home, with the twelve books and where you left off.
- `#/b/N` and `#/b/N/listen`: a book's guide and its listening list.
- `#/r/N/L`: read book N at line L (in Page and Two pages, the page that holds it). Tap a dotted word for its gloss and ❦ for a famous passage; either note card can hand the passage to Ask the Reader.
- `#/people` and `#/people/<id>`: characters.
- `#/plates`: gallery of Doré's plates by book; tap to enlarge, the line number opens the passage.
- `#/listen`: all recitations and audiobooks.
- `#/notes`: your footnotes by book, with Copy as Markdown and Clear.

## API

| Route | What |
|---|---|
| `GET /api/dict?w=<word>` | Dictionary entry with etymology (no sign-in; 60 a minute per IP; word of 40 letters, hyphen or apostrophe) |
| `GET /api/me` | Who is signed in, whether chat is on, share of today's allowance left |
| `GET`/`PUT /api/state` | Reading place, per-book progress and footnotes `notes` with change stamp `nt` (signed in). A PUT without `notes` leaves stored notes unchanged. |
| `POST /api/chat` | Server-sent events: `{t}` text, `{done}`, `{error}` (signed in) |
| `POST /api/account/delete` | Deletes the user, state and usage |
| `GET /api/admin/usage` | Totals and top users (admins) |
| `GET /auth/login`, `/auth/callback`, `POST /auth/logout` | Google sign-in |
| `GET /api/health` | Mode, backend, model |

## Checks

```sh
python3 scripts/check-guide.py    # data/guide/ against the text: sections in order, glosses in their line, passages in range
node scripts/shots.mjs            # phone light + dark plus a wide reader (needs a running dev server; npm i for playwright)
```

## Plates

- **Source:** Wikimedia Commons, scans of the 1866 Cassell edition (public domain). Fetch with `Special:FilePath/Paradise_Lost_N.jpg?width=800` and a custom User-Agent.
- **Mapping:** `art/plates.json` places each plate at the line it illustrates. Low-confidence placements: plates 7, 14, 15, 27, 28, 30, 37, 45, 46, 49.
- **Treatment:** light mode multiplies the plate into the paper with a slight sepia; dark mode dims it. Plain-reading mode hides in-text plates.

## Privacy and safety

- Stored per signed-in user: email, name, last sign-in, reading place, footnotes and daily token counts. "Delete my data" in the account menu removes all of it, notes included. Footnotes hold only passages of the public poem, a sentence of each answer and the question asked; the server accepts at most 200 footnotes, validates every field (book, line range, string lengths) and rejects bodies over 400 KB.
- Sessions are HMAC-signed, HTTP-only, SameSite=Lax cookies (Secure on https); writes from other sites are refused.
- The page sends only which book, line or character a question is about. The server builds the text the model sees, so a page can't change what the poem says.
- Messages are capped (60 messages, 8,000 characters each, 60,000 in all), and the last message must be the reader's. The model has no tools and no private data.
- YouTube plays through `youtube-nocookie.com` and loads only when you tap play.
- The service worker caches only same-origin GET requests and never `/api/` or `/auth/`.

## Credits

Milton's text from Project Gutenberg, Doré's plates from Wikimedia Commons, structure and interactions after the author's I Ching app. See `NOTICE.md`.
