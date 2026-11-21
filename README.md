# Paradise Lost

- **Purpose:** an illustrated reading guide to Milton's *Paradise Lost* (1674, twelve books), for reading the poem along with notes, Doré's plates, recitations and a tutor to ask. Open source (MIT); one hosted copy runs at `paradise.benbybenjacobs.com`.
- **Design:**
  - One page app (plain HTML, CSS and JS) in a restrained Doré-inspired print look: all fifty of Gustave Doré's 1866 engravings placed at their lines, IM Fell and EB Garamond, crimson accents.
  - For each book: a **Guide** (argument, setting, sections, people), **Read** (the full text with glosses, famous passages and line numbers) and **Listen** (YouTube recitations and audiobooks).
  - **Ask the Reader**: a chat about the passage you have open. `server.mjs` builds the context from the poem and streams the reply from the Anthropic API.
  - **Accounts** (public mode): Google sign-in, SQLite for users, reading place and usage. Reading needs no account; a saved place needs sign-in.
  - **Who pays for chat:** readers bring their own Anthropic API key (kept in their browser, sent per question, never stored). Only an allowlist and the admins use the host's key, capped per user per day and per month.
  - One Node process with no npm dependencies (Node 22.5+, Python 3 to build).
  ```
  browser ─► (proxy) ─► node server.mjs ─┬─► dist/ (static)
                                          ├─► /auth/* ─► Google
                                          ├─► /api/state, /api/me ─► SQLite
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
- Set a spend limit on the API key's workspace in the Anthropic Console as the hard backstop; the caps above are estimates.

## Layout

| Path | What |
|---|---|
| `source/pg26-1674.txt` | Project Gutenberg #26, the 1674 text (public domain) |
| `data/text.json` | The twelve books as numbered lines, from `scripts/text.py` |
| `data/guide/book-NN.json` | Notes per book: argument, setting, sections, glosses, famous passages |
| `data/characters.json` | 22 people of the poem, with first appearance and a key passage |
| `data/listen.json` | YouTube recitations, LibriVox readings and recommended audiobooks |
| `src/` | The app: `index.html`, `app.js` (routes, reader, account), `chat.js`, `art.js` (SVG fallback art), `styles.css`, service worker, icons |
| `art/web/NN.jpg`, `art/plates.json` | Doré's fifty plates (720 px JPEGs) and each one's book, line, title and mapping confidence |
| `lib/chat.mjs` | What the reader is told: system prompt, context per book, line or character, message checks |
| `lib/llm.mjs` | Chat backends: Anthropic API over fetch, or `claude -p` for local use; cost estimate |
| `lib/auth.mjs` | Google sign-in and signed session cookies |
| `lib/db.mjs` | SQLite: users, state, usage |
| `server.mjs` | Static files, `/auth/*`, `/api/*`, auth modes |
| `deploy/` | Examples for a reverse proxy and systemd |

## Routes

- `#/`: home, with the twelve books and where you left off.
- `#/b/N` and `#/b/N/listen`: a book's guide and its listening list.
- `#/r/N/L`: read book N at line L. Tap a dotted word for its gloss and ❦ for a famous passage; either note card can hand the passage to Ask the Reader.
- `#/people` and `#/people/<id>`: characters.
- `#/plates`: gallery of Doré's plates by book; tap to enlarge, the line number opens the passage.
- `#/listen`: all recitations and audiobooks.

## API

| Route | What |
|---|---|
| `GET /api/me` | Who is signed in, whether chat is on, share of today's allowance left |
| `GET`/`PUT /api/state` | Reading place and per-book progress (signed in) |
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

- Stored per signed-in user: email, name, last sign-in, reading place and daily token counts. "Delete my data" in the account menu removes all of it.
- Sessions are HMAC-signed, HTTP-only, SameSite=Lax cookies (Secure on https); writes from other sites are refused.
- The page sends only which book, line or character a question is about. The server builds the text the model sees, so a page can't change what the poem says.
- Messages are capped (60 messages, 8,000 characters each, 60,000 in all), and the last message must be the reader's. The model has no tools and no private data.
- YouTube plays through `youtube-nocookie.com` and loads only when you tap play.
- The service worker caches only same-origin GET requests and never `/api/` or `/auth/`.

## Credits

Milton's text from Project Gutenberg, Doré's plates from Wikimedia Commons, structure and interactions after the author's I Ching app. See `NOTICE.md`.
