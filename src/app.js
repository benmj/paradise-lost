// Paradise Lost: a reading guide. Hash routes, all data in window.PL (built by scripts/build.py).
//   #/            title page and the twelve books
//   #/b/N         guide to Book N        #/b/N/listen  the same, at its recordings
//   #/r/N[/L]     the text of Book N, at line L
//   #/people[/id] characters             #/listen      recordings and audiobooks
//   #/plates      Doré's 1866 engravings, each linked to its lines
(function () {
  const PL = window.PL;
  const { DEFS, bookPlate, cosmos, fleuron, quill, LABELS } = window.ART;
  const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
  const ORD = ["", "First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth", "Ninth", "Tenth", "Eleventh", "Twelfth"];
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const ss = (k, v) => { try { return v === undefined ? sessionStorage.getItem(k) : sessionStorage.setItem(k, v); } catch { return null; } };
  // Per-viewer conveniences only (theme, place, progress); the app works without them.
  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };

  const book = (n) => PL.books[n - 1];
  const guide = (n) => PL.guide[n] || PL.guide[String(n)];
  const person = (id) => PL.characters.find((c) => c.id === id);
  const ref = (n, a, b) => `${ROMAN[n]}.${a}${b && b !== a ? `–${b}` : ""}`;
  const lines = (n, a, b) => book(n).lines.slice(a - 1, b);
  const verse = (ls) => ls.map((l) => `<span>${esc(l)}</span>`).join("");
  // Doré's plates (public domain), each tied to a book and line in art/plates.json.
  const PLATES = PL.plates || [];
  const platesOf = (n) => PLATES.filter((x) => x.book === n);
  const pimg = (x, cls = "", eager) => `<img class="dore-img ${cls}" src="art/${String(x.plate).padStart(2, "0")}.jpg" alt="Doré, plate ${x.plate}: ${esc(x.title)}" ${eager ? "" : 'loading="lazy" '}decoding="async" data-p="${x.plate}" tabindex="0">`;
  const pcap = (x) => `<b>${esc(x.title)}</b><span>Gustave Doré, 1866 · <a href="#/r/${x.book}/${x.line}">${ref(x.book, x.line)}</a></span>`;
  const quoteFor = (ls) => ls.map((l) => `> ${l}`).join("\n");

  // ── theme ──
  function applyTheme(t) {
    if (t === "auto") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
  }
  applyTheme(store.get("theme", "auto"));

  // ── account: Google sign-in, and reading place that follows the account ──
  const api = (path, opt = {}) => fetch(path, { credentials: "same-origin", headers: { "Content-Type": "application/json" }, ...opt });
  const localState = () => {
    const read = {};
    for (let n = 1; n <= 12; n++) { const v = store.get(`read:${n}`, 0); if (v) read[n] = v; }
    const p = store.get("pos", null);
    return { pos: p ? { n: p.n, l: p.l } : undefined, read, notes: NOTES.all(), nt: NOTES.stamp() };
  };
  let pushTimer = 0;
  function pushState() {
    if (!(window.ME && window.ME.user)) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      const st = localState();
      api("/api/state", { method: "PUT", body: JSON.stringify(st) }).then((r) => { if (r.ok) store.set("notes-s", st.nt); }).catch(() => {});
    }, 1500);
  }
  async function loadAccount() {
    let me;
    try { me = await (await api("/api/me")).json(); } catch { return; }
    window.ME = me;
    const signin = $("#signin"), acct = $("#acct");
    signin.hidden = !(me.signIn && !me.user);
    acct.hidden = !me.user || !me.signIn;
    if (!me.user) return;
    const initial = (me.user.name || me.user.email || "?").trim()[0].toUpperCase();
    acct.textContent = initial;
    if (!me.signIn) return;
    try {
      const s = await (await api("/api/state")).json();
      const mine = store.get("pos", null);
      for (let n = 1; n <= 12; n++) if ((s.read || {})[n] > store.get(`read:${n}`, 0)) store.set(`read:${n}`, s.read[n]);
      if (s.pos && (!mine || (s.t || 0) > (mine.t || 0))) store.set("pos", { ...s.pos, t: s.t || Date.now() });
      // Notes: the server's copy wins when only it changed since the last sync, both are merged when both changed.
      const synced = store.get("notes-s", 0), theirs = s.nt || 0;
      if (Array.isArray(s.notes) && theirs > synced) {
        if (NOTES.stamp() > synced) NOTES.replace(NOTES.merge(NOTES.all(), s.notes), Date.now());
        else { NOTES.replace(s.notes, theirs); store.set("notes-s", theirs); }
      }
      pushState();
      if (location.hash === "" || location.hash === "#/") route();
    } catch {}
  }
  $("#acct").addEventListener("click", () => { location.hash = "#/me"; });

  // ── shell ──
  const app = $("#app");
  document.body.insertAdjacentHTML("afterbegin", DEFS);
  const header = $(".topbar"), backBtn = $("#back"), titleEl = $("#title"), plainBtn = $("#plain"), layoutBtn = $("#layout"), listenBtn = $("#listen"), dictBtn = $("#dict"), layoutMenu = $("#layout-menu"), progress = $("#progress");
  // ── text size: scales the poem and note cards; cycles through five steps ──
  const TS = [0.9, 1, 1.15, 1.3, 1.5], TSN = ["small", "normal", "large", "larger", "largest"];
  let tsi = Math.min(TS.length - 1, Math.max(0, +store.get("ts", 1)));
  const applyTs = () => {
    document.documentElement.style.setProperty("--ts", TS[tsi]);
    const b = $("#textsize"); b.setAttribute("aria-label", `Text size: ${TSN[tsi]}`); b.title = `Text size: ${TSN[tsi]}`;
  };
  applyTs();
  function setTs(i, quiet) {
    tsi = i;
    store.set("ts", tsi); applyTs();
    if (!quiet) { const h = $("#dict-hint"); h.textContent = `Text size: ${TSN[tsi]}`; h.hidden = false; clearTimeout(h._t); h._t = setTimeout(() => { h.hidden = true; h.textContent = "Dictionary on · tap a word"; }, 1400); }
    requestAnimationFrame(() => { if (reader) { reader.paged ? route() : (measure(), track()); } });
  }
  const curTheme = () => document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  function setTheme(t) { store.set("theme", t); applyTheme(t); $("#theme").title = `Theme: ${t}`; }
  $("#textsize").addEventListener("click", () => setTs((tsi + 1) % TS.length));
  $("#theme").addEventListener("click", () => setTheme({ light: "dark", dark: "dim", dim: "light" }[curTheme()] || "dark"));

  // ── phone menu: one button opens one panel; looks first, then toggles ──
  const menuBtn = $("#menu"), mp = document.createElement("div");
  mp.id = "menu-panel"; mp.className = "menu-panel"; mp.hidden = true; mp.setAttribute("role", "dialog"); mp.setAttribute("aria-label", "Reading options");
  document.body.appendChild(mp);
  const seg = (label, key, opts, cur) => `<div class="mp-row"><div class="mp-label">${label}</div><div class="mp-seg" role="radiogroup" aria-label="${label}">${opts.map(([v, t, cls]) => `<button type="button" role="radio" data-k="${key}" data-v="${v}" class="${cls || ""}" aria-checked="${String(String(v) === String(cur))}">${t}</button>`).join("")}</div></div>`;
  const tog = (label, hint, key, on) => `<button type="button" class="mp-tog" role="switch" data-k="${key}" aria-checked="${on}"><span><b>${label}</b><small>${hint}</small></span><i class="mp-sw" aria-hidden="true"></i></button>`;
  function buildMenu() {
    const inReader = !plainBtn.hidden;
    let h = `<div class="mp-sec">Appearance</div>`;
    h += seg("Text size", "ts", TS.map((_, i) => [i, "A", `ts${i}`]), tsi);
    h += seg("Theme", "theme", [["light", "Light"], ["dark", "Dark"], ["dim", "Dim"]], curTheme());
    if (inReader) {
      h += seg("Layout", "mode", [["scroll", "Scroll"], ["page", "Page"], ...(innerWidth >= 820 ? [["spread", "Two pages"]] : [])], store.get("mode", "scroll"));
      h += `<div class="mp-sec">Features</div>`;
      h += tog("Plain text", "Hide the notes", "plain", plainBtn.getAttribute("aria-pressed") === "true");
      if (!listenBtn.hidden) h += tog("Read-along", "Listen and follow the words", "listen", listenBtn.getAttribute("aria-pressed") === "true");
      h += tog("Dictionary", "Tap any word for its meaning", "dict", dictBtn.getAttribute("aria-pressed") === "true");
    }
    const sg = $("#signin"), ac = $("#acct");
    if (!sg.hidden) h += `<a class="mp-link" href="${sg.getAttribute("href")}">Sign in</a>`;
    h += `<a class="mp-link" href="#/credits">Credits and copyright</a><a class="mp-link" href="#/privacy">Privacy</a>`;
    mp.innerHTML = h;
  }
  function setMP(open) {
    if (open) buildMenu();
    mp.hidden = !open; menuBtn.setAttribute("aria-expanded", String(open)); menuBtn.classList.toggle("on", open);
    if (open) header.classList.remove("hidden");
  }
  menuBtn.addEventListener("click", (e) => { e.stopPropagation(); setMP(mp.hidden); });
  mp.addEventListener("click", (e) => {
    e.stopPropagation();
    const b = e.target.closest("[data-k]"); if (!b) return;
    const k = b.dataset.k, v = b.dataset.v;
    if (k === "ts") setTs(+v, true);
    else if (k === "theme") setTheme(v);
    else if (k === "mode") { const t = layoutMenu.querySelector(`[data-mode="${v}"]`); if (t) { t.click(); } }
    else if (k === "plain") plainBtn.click();
    else if (k === "listen") listenBtn.click();
    else if (k === "dict") dictBtn.click();
    else if (k === "acct") { setMP(false); $("#acct").click(); return; }
    if (k === "listen" || k === "mode") { setMP(false); return; }
    buildMenu();
  });
  document.addEventListener("click", (e) => { if (e.isTrusted && !mp.hidden) setMP(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !mp.hidden) { setMP(false); menuBtn.focus(); } });
  addEventListener("hashchange", () => setMP(false));
  const dismissOnMove = (e) => { if (!mp.hidden && !mp.contains(e.target)) setMP(false); };
  addEventListener("touchmove", dismissOnMove, { passive: true });
  addEventListener("wheel", dismissOnMove, { passive: true });
  backBtn.addEventListener("click", () => {
    if (history.length > 1 && ss("inapp")) history.back();
    else location.hash = "#/";
  });
  function setPlain(on) {
    document.body.classList.toggle("plain", on);
    plainBtn.classList.toggle("on", on);
    plainBtn.setAttribute("aria-pressed", String(on));
  }
  setPlain(store.get("plain", false));
  function setMenu(open) {
    layoutMenu.hidden = !open;
    layoutBtn.setAttribute("aria-expanded", String(open));
    if (open) {
      const pref = store.get("mode", "scroll");
      layoutMenu.querySelectorAll("[data-mode]").forEach((b) => { b.classList.toggle("on", b.dataset.mode === pref); b.setAttribute("aria-checked", String(b.dataset.mode === pref)); });
    }
  }
  layoutBtn.addEventListener("click", (e) => { e.stopPropagation(); setMenu(layoutMenu.hidden); });
  layoutMenu.addEventListener("click", (e) => {
    const b = e.target.closest("[data-mode]");
    if (!b || !reader) return;
    setMenu(false);
    store.set("mode", b.dataset.mode);
    const l = reader.lastL || reader.target;
    history.replaceState(null, "", `#/r/${reader.n}${l > 1 ? `/${l}` : ""}`);
    route();
  });
  document.addEventListener("click", (e) => { if (!layoutMenu.hidden && !layoutMenu.contains(e.target)) setMenu(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !layoutMenu.hidden) { setMenu(false); layoutBtn.focus(); } });
  plainBtn.addEventListener("click", () => {
    const on = !document.body.classList.contains("plain");
    store.set("plain", on);
    setPlain(on);
    closeNote();
    if (reader) requestAnimationFrame(() => (reader && reader.paged ? layoutPaged() : measure()));
  });

  // header peeks back on scroll up (principle 5)
  let lastY = scrollY, ticking = false;
  addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const y = scrollY, dy = y - lastY;
      if (Math.abs(dy) > 6) {
        const hide = dy > 0 && y > header.offsetHeight && !header.contains(document.activeElement);
        header.classList.toggle("hidden", hide);
        lastY = y;
      }
      if (y < header.offsetHeight) header.classList.remove("hidden");
      if (reader) track();
      ticking = false;
    });
  }, { passive: true });

  // lazily engrave the book plates as they scroll into view
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.innerHTML = bookPlate(+e.target.dataset.n);
      io.unobserve(e.target);
    });
  }, { rootMargin: "300px" });
  const paintLazy = () => app.querySelectorAll(".lazy-art").forEach((el) => io.observe(el));

  // quill buttons: ask about this passage
  const askHere = (prompt, what) => `<button type="button" class="ask-here" data-ask="${esc(prompt)}" aria-label="Ask about ${esc(what)}" title="Ask about ${esc(what)}"><span aria-hidden="true">${quill()}</span></button>`;
  const head = (title, prompt, what) => `<div class="block-head"><h2 class="eyebrow">${title}</h2>${prompt ? askHere(prompt, what || title) : ""}</div>`;
  app.addEventListener("click", (e) => {
    const a = e.target.closest(".ask-here");
    if (a) { closeNote(); CHAT.ask(a.dataset.ask); return; }
    const play = e.target.closest(".yt-play");
    if (play) {
      const id = play.dataset.yt;
      play.parentElement.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0" title="${esc(play.dataset.title)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
    }
  });

  // ── the chat's context on each page ──
  const POEM = {
    key: "poem", label: "The whole poem", payload: { kind: "poem" }, placeholder: "Ask about the poem…",
    intro: "Ask anything about Paradise Lost: the story, a word, an allusion, Milton’s sources, or what readers argue over.",
    suggestions: ["Where should a first-time reader start?", "Is Satan the hero of the poem?", "Why did Milton write it in blank verse?"],
  };
  const bookChat = (n, l) => {
    const g = guide(n);
    return {
      key: `book:${n}`, label: `Book ${ROMAN[n]}${l ? ` · line ${l}` : ` · ${g.title}`}`, payload: { kind: "book", n, ...(l ? { l } : {}) },
      placeholder: `Ask about Book ${ROMAN[n]}…`,
      intro: `Ask about Book ${ROMAN[n]}: a line that puzzles you, a word, an allusion, or the argument. Select lines on the page to ask about them.`,
      suggestions: [`What happens in Book ${ROMAN[n]}, briefly?`, `What should I watch for as I read Book ${ROMAN[n]}?`, `Explain the hardest passage in Book ${ROMAN[n]}.`],
    };
  };
  const personChat = (c) => ({
    key: `person:${c.id}`, label: c.name, payload: { kind: "person", id: c.id }, placeholder: `Ask about ${c.name}…`,
    intro: `Ask about ${c.name}: what they want, how Milton draws them, and what readers make of them.`,
    suggestions: [`How does ${c.name} change over the poem?`, `What do critics argue about ${c.name}?`, `Show me ${c.name} at their most memorable.`],
  });

  // ── position and progress ──
  const readOf = (n) => store.get(`read:${n}`, 0);
  const pct = (n) => Math.min(100, Math.round((readOf(n) / book(n).lines.length) * 100));
  const tabs = (n, cur) => `<nav class="tabs" aria-label="Book ${ROMAN[n]}">
  <a href="#/b/${n}"${cur === "guide" ? ' aria-current="page"' : ""}>Guide</a>
  <a href="#/r/${n}${cur === "read" ? "" : readOf(n) > 20 ? `/${readOf(n)}` : ""}"${cur === "read" ? ' aria-current="page"' : ""}>Read</a>
  <a href="#/b/${n}/listen"${cur === "listen" ? ' aria-current="page"' : ""}>Listen</a>
</nav>`;

  // ── views ──
  function home() {
    setTitle("Paradise Lost", false);
    CHAT.set(POEM);
    const pos = store.get("pos", null);
    const pg = pos && guide(pos.n);
    const open = lines(1, 1, 5);
    app.innerHTML = `<div class="fade">
<section class="title-page">
  ${PLATES[0] ? `<div class="frontis title-plate">${pimg(PLATES[0], "nolb", true)}</div>` : `<div class="cosmos">${cosmos()}</div>`}
  <h1><b>A Poem in Twelve Books</b>Paradise Lost</h1>
  <p class="by">John Milton · 1674</p>
  <p class="opening">${verse(open)}<a href="#/r/1">Begin reading ›</a></p>
</section>
${pg ? `<section class="block"><a class="continue" href="#/r/${pos.n}/${pos.l}">
  <div><b>Continue</b><span>Book ${ROMAN[pos.n]} · ${esc(pg.title)}</span><small>at line ${pos.l} of ${book(pos.n).lines.length}</small></div><span class="go" aria-hidden="true">›</span></a></section>` : ""}
<hr class="rule">
<section class="block">
  ${head("The Twelve Books")}
  <div class="books">${PL.books.map((b) => {
    const g = guide(b.n), p = pct(b.n);
    return `<a class="book-card" href="#/b/${b.n}">${platesOf(b.n)[0] ? `<div class="art dore-art">${pimg(platesOf(b.n)[0], "nolb")}</div>` : `<div class="art lazy-art" data-n="${b.n}" role="img" aria-label="${esc(LABELS[b.n])}"></div>`}
  <span class="num">Book ${ROMAN[b.n]}</span><span class="t">${esc(g ? g.title : "")}</span>${p ? `<span class="bar" title="${p}% read"><i style="width:${p}%"></i></span>` : ""}</a>`;
  }).join("")}</div>
</section>
<section class="block links">
  ${PLATES.length ? `<a class="link-row" href="#/plates"><div><b>Doré’s plates</b><small>${PLATES.length} engravings from the 1866 edition, each at its lines</small></div><span class="go" aria-hidden="true">›</span></a>` : ""}
  <a class="link-row" href="#/notes"><div><b>Your notes</b><small>${NOTES.count() ? `${NOTES.count()} footnote${NOTES.count() === 1 ? "" : "s"} saved from Ask the Reader` : "Passages you ask the Reader about build up here as footnotes"}</small></div><span class="go" aria-hidden="true">›</span></a>
  <a class="link-row" href="#/people"><div><b>Characters</b><small>Satan, Adam and Eve, the angels, Sin and Death</small></div><span class="go" aria-hidden="true">›</span></a>
  <a class="link-row" href="#/listen"><div><b>Listen</b><small>The poem read aloud, recitations on YouTube, audiobooks</small></div><span class="go" aria-hidden="true">›</span></a>
</section>
<p class="credit">Text of the second edition (1674) from <a href="https://www.gutenberg.org/ebooks/26" rel="noopener">Project Gutenberg</a>, in the public domain. Readings from <a href="https://librivox.org/" rel="noopener">LibriVox</a> and YouTube.</p>
</div>`;
    paintLazy();
  }

  function bookView(n, sub) {
    const b = book(n), g = guide(n);
    if (!b || !g) return notFound();
    setTitle(`<i>${ROMAN[n]}</i> · ${esc(g.title)}`, true);
    CHAT.set(bookChat(n));
    const at = readOf(n);
    const people = g.characters.map(person).filter(Boolean);
    app.innerHTML = `<div class="fade">
${tabs(n, sub === "listen" ? "listen" : "guide")}
<section class="book-head">
  ${platesOf(n)[0] ? `<div class="frontis">${pimg(platesOf(n)[0], "", true)}</div>
  <p class="caption dore-cap">${pcap(platesOf(n)[0])}</p>
  ${platesOf(n).length > 1 ? `<div class="strip" aria-label="More plates in this book">${platesOf(n).slice(1).map((x) => pimg(x, "thumb")).join("")}</div>` : ""}` : `<div class="framed plate-box">${bookPlate(n)}</div>
  <p class="caption">${esc(LABELS[n])}</p>`}
  <span class="eyebrow" style="margin-top:26px">The ${ORD[n]} Book</span>
  <h1>${esc(g.title)}</h1>
  <p class="setting">${esc(g.setting)}</p>
  <p class="summary drop">${esc(g.summary)}</p>
  <div class="btn-row">
    <a class="btn primary" href="#/r/${n}">Read Book ${ROMAN[n]}</a>
    ${at > 20 && at < b.lines.length - 5 ? `<a class="btn" href="#/r/${n}/${at}">Continue at ${at}</a>` : ""}
  </div>
</section>
<section class="block">
  ${head("The Argument", `Give me the shape of Book ${ROMAN[n]} in a few sentences.`, `the shape of Book ${ROMAN[n]}`)}
  <ol class="argument">${g.sections.map((s) => `<li><a href="#/r/${n}/${s.from}"><span class="ln-ref">${s.from}–${s.to}</span><span class="st">${esc(s.title)}</span><span class="sn">${esc(s.note)}</span></a></li>`).join("")}</ol>
</section>
<section class="block">
  ${head("Famous passages", `Which passage in Book ${ROMAN[n]} matters most, and why?`, "the famous passages")}
  ${g.famous.map((f) => {
    const ls = lines(n, f.from, f.to), cut = ls.length > 6;
    return `<div class="famous"><blockquote>${verse(cut ? ls.slice(0, 5) : ls)}${cut ? "<span>…</span>" : ""}</blockquote>
  <p>${esc(f.why)}</p><a class="more" href="#/r/${n}/${f.from}">${ref(n, f.from, f.to)} · Read in context ›</a></div>`;
  }).join("")}
</section>
<section class="block">
  ${head("Themes", `What are the big ideas at work in Book ${ROMAN[n]}?`, "the themes")}
  <ul class="themes">${g.themes.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
</section>
${people.length ? `<section class="block">${head("Who is here")}<div class="chips">${people.map((c) => `<a class="tag" href="#/people/${c.id}">${esc(c.name)}</a>`).join("")}</div></section>` : ""}
<section class="block" id="listen">
  ${head("Listen")}
  ${librivoxBlock(n)}
  ${PL.listen.youtube.filter((v) => v.book === n).map(yt).join("")}
  <a class="more-link" href="#/listen">All recordings and audiobooks ›</a>
</section>
<nav class="pager">
  ${n > 1 ? `<a href="#/b/${n - 1}"><small>‹ Book ${ROMAN[n - 1]}</small><span>${esc(guide(n - 1).title)}</span></a>` : "<span></span>"}
  ${n < 12 ? `<a class="next" href="#/b/${n + 1}"><small>Book ${ROMAN[n + 1]} ›</small><span>${esc(guide(n + 1).title)}</span></a>` : "<span></span>"}
</nav>
</div>`;
    if (sub === "listen") after = () => $("#listen").scrollIntoView({ block: "start" });
  }

  // ── listening ──
  const KIND = { "full-book": "Full reading", passage: "Recitation", "full-poem": "The whole poem", lecture: "Lecture" };
  const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12.5-7.5z"/></svg>';
  function yt(v) {
    return `<div class="yt"><div class="yt-frame"><img loading="lazy" src="https://i.ytimg.com/vi/${encodeURIComponent(v.id)}/hqdefault.jpg" alt="">
  <button type="button" class="yt-play" data-yt="${esc(v.id)}" data-title="${esc(v.title)}" aria-label="Play ${esc(v.title)}"><span>${PLAY}</span></button></div>
  <span class="kind">${KIND[v.kind] || ""}${v.channel ? ` · ${esc(v.channel)}` : ""}</span><h3>${esc(v.title)}</h3><p>${esc(v.note)}</p></div>`;
  }
  function librivoxBlock(n) {
    const lv = PL.listen.librivox, t = lv.books.find((x) => x.book === n);
    if (!t) return "";
    return `<div class="audio"><b>Book ${ROMAN[n]}, read by ${esc(lv.reader)}</b>
  <small>LibriVox · ${t.minutes} min · public domain</small>
  <audio controls preload="none" src="${esc(t.mp3)}"></audio></div>`;
  }

  function listenView() {
    setTitle("Listen", true);
    CHAT.set({ ...POEM, label: "Listening", suggestions: ["Which recording should I start with?", "How should Milton’s verse sound read aloud?", "What did Milton’s blindness mean for how the poem was made?"] });
    const L = PL.listen, pos = store.get("pos", null);
    let sel = pos ? pos.n : 1;
    const byKind = (k) => L.youtube.filter((v) => v.kind === k);
    const seg = (name) => `<div class="seg" role="group" aria-label="Book" data-seg="${name}">${PL.books.map((b) => `<button type="button" data-n="${b.n}" aria-pressed="${b.n === sel}">${ROMAN[b.n]}</button>`).join("")}</div>`;
    app.innerHTML = `<div class="fade">
<section class="people-head">
  <span class="eyebrow">Recitation &amp; audiobooks</span>
  <h1>Listen</h1>
  <p class="note">Milton was blind when he made the poem and dictated it aloud, a few lines at a time. It was written for the ear.</p>
</section>
<section class="block">
  ${head("Book by book, free")}
  ${seg("lv")}
  <div id="lv-box">${librivoxBlock(sel)}</div>
  <p class="note">The whole 1674 poem read by ${esc(L.librivox.reader)} for <a href="${esc(L.librivox.page)}" rel="noopener">LibriVox</a>.</p>
</section>
<section class="block">
  ${head("Read aloud on YouTube")}
  ${seg("yt")}
  <div id="yt-box">${byKind("full-book").filter((v) => v.book === sel).map(yt).join("")}</div>
</section>
<section class="block">${head("Great voices, famous passages")}${byKind("passage").map(yt).join("")}</section>
<section class="block">${head("The whole poem")}${byKind("full-poem").map(yt).join("")}</section>
<section class="block">${head("Lectures")}${byKind("lecture").map(yt).join("")}</section>
<section class="block">
  ${head("Audiobooks worth buying", "Which audiobook of Paradise Lost should I get, and why?", "audiobooks")}
  ${L.audiobooks.map((a) => `<div class="rec"><h3>${esc(a.title)}, read by ${esc(a.narrator)}</h3>
  <p class="meta">${esc(a.publisher)} · ${a.year} · ${esc(a.length)}</p><p>${esc(a.note)}</p><a href="${esc(a.url)}" rel="noopener">See it ›</a></div>`).join("")}
</section>
<section class="block">
  ${head("Other free recordings")}
  ${L.librivoxOthers.map((o) => `<div class="rec"><h3>${esc(o.title)}</h3><p>${esc(o.note)}</p><a href="${esc(o.page)}" rel="noopener">LibriVox ›</a></div>`).join("")}
</section>
</div>`;
    app.querySelectorAll("[data-seg]").forEach((g) => g.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-n]");
      if (!btn) return;
      const n = +btn.dataset.n;
      g.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === btn)));
      if (g.dataset.seg === "lv") $("#lv-box").innerHTML = librivoxBlock(n);
      else $("#yt-box").innerHTML = byKind("full-book").filter((v) => v.book === n).map(yt).join("");
    }));
    requestAnimationFrame(() => app.querySelectorAll(".seg [aria-pressed=true]").forEach((b) => b.scrollIntoView({ block: "nearest", inline: "center" })));
  }

  // ── characters ──
  const GROUPS = [
    ["The fallen angels", ["Fallen angel"]],
    ["Sin, Death and Chaos", ["Allegorical figure"]],
    ["Heaven", ["Godhead"]],
    ["The loyal angels", ["Angel"]],
    ["Eden", ["Human"]],
    ["The voice of the poem", ["Divine inspiration", "Poet"]],
  ];
  function peopleView() {
    setTitle("Characters", true);
    CHAT.set({ ...POEM, label: "Characters", suggestions: ["Who are the main characters, in a sentence each?", "Is Milton’s God a character readers can like?", "How do Adam and Eve differ before the Fall?"] });
    app.innerHTML = `<div class="fade">
<section class="people-head"><span class="eyebrow">Dramatis personae</span><h1>Characters</h1></section>
${GROUPS.map(([label, kinds]) => {
  const cs = PL.characters.filter((c) => kinds.includes(c.kind));
  return cs.length ? `<section class="kind-group">${head(label)}${cs.map((c) => `<a class="person" href="#/people/${c.id}"><b>${esc(c.name)}</b><small>${esc(c.line)}</small></a>`).join("")}</section>` : "";
}).join("")}
</div>`;
  }
  function personView(id) {
    const c = person(id);
    if (!c) return notFound();
    setTitle(esc(c.name), true);
    CHAT.set(personChat(c));
    const q = c.quote, ql = lines(q.book, q.from, q.to);
    app.innerHTML = `<div class="fade person-page">
<span class="kind" style="display:block;margin-top:24px">${esc(c.kind)}</span>
<h1 style="margin-top:4px">${esc(c.name)}</h1>
<p class="lead">${esc(c.line)}</p>
<div class="famous"><blockquote>${verse(ql)}</blockquote><a class="more" href="#/r/${q.book}/${q.from}">${ref(q.book, q.from, q.to)} · Read in context ›</a></div>
<div class="block-head" style="margin-top:28px"><h2 class="eyebrow">About</h2>${askHere(`Tell me more about ${c.name}.`, c.name)}</div>
<p class="about">${esc(c.about)}</p>
<p><a class="more-link" href="#/r/${c.first.book}/${c.first.line}">First appears at ${ref(c.first.book, c.first.line)} ›</a></p>
<section class="block">${head("Where they appear")}
<ul class="appears">${c.books.map((n) => `<li><a href="#/b/${n}"><span class="num">${ROMAN[n]}</span><span class="t">${esc(guide(n).title)}</span></a></li>`).join("")}</ul></section>
<p style="margin-top:30px"><a class="more-link" href="#/people">‹ All characters</a></p>
</div>`;
  }

  // ── the reader's footnotes: a superscript mark (an empty span, its number drawn by CSS) at the end of a footnoted passage ──
  const fnMark = (fs) => `<span class="fn-mark" role="button" tabindex="0" data-fn="${fs.map((f) => f.id).join(" ")}" data-i="${fs.map((f) => f.i).join(",")}" aria-label="Your ${fs.length > 1 ? "footnotes" : "footnote"} ${fs.map((f) => f.i).join(", ")} on ${fs.map((f) => ref(f.book, f.line, f.to)).join(", ")}"></span>`;
  function refreshMarks() {
    const poem = reader && $("#poem");
    if (!poem) return;
    poem.querySelectorAll(".fn-mark").forEach((m) => m.remove());
    NOTES.ofBook(reader.n).forEach((fs, l) => { const el = $(`#l-${l}`, poem); if (el) el.insertAdjacentHTML("beforeend", fnMark(fs)); });
    if (reader.paged) layoutPaged();
    else measure();
  }
  let notesOpen = false;
  NOTES.subscribe(() => {
    pushState();
    refreshMarks();
    if (notesOpen) renderNotes();
    if (cardFn) showFootnotes(cardFn.filter((id) => NOTES.all().some((f) => f.id === id)));
  });

  // ── the reader ──
  let reader = null;   // { n, tops: [], els: [], secs, total, lastL }
  function readView(n, at) {
    const b = book(n), g = guide(n);
    if (!b || !g) return notFound();
    const total = b.lines.length;
    at = Math.min(Math.max(1, at || 1), total);
    setTitle(`<i>${ROMAN[n]}</i> · ${esc(g.title)}`, true);
    CHAT.set(bookChat(n, at > 1 ? at : 0));
    plainBtn.hidden = false;
    layoutBtn.hidden = false;
    progress.hidden = false;
    listenBtn.hidden = true;
    dictBtn.hidden = false;
    plAvail(n).then((ok) => { if (reader && reader.n === n) listenBtn.hidden = !ok; });

    const secAt = new Map(g.sections.map((s) => [s.from, s]));
    const glossAt = new Map();
    g.glosses.forEach((x, i) => { if (!glossAt.has(x.line)) glossAt.set(x.line, []); glossAt.get(x.line).push(i); });
    const famAt = new Map();
    g.famous.forEach((f, i) => { for (let l = f.from; l <= f.to; l++) if (!famAt.has(l)) famAt.set(l, i); });
    const paras = b.paras && b.paras.length > 5 ? new Set(b.paras) : new Set();
    const fnAt = NOTES.ofBook(n);

    // A line with its glossed words as buttons (first match of each word; the rest escaped).
    function lineHtml(l, text) {
      const ids = glossAt.get(l) || [];
      const hits = [];
      const lower = text.toLowerCase();
      const missing = [];
      ids.forEach((i) => {
        const w = g.glosses[i].word.toLowerCase();
        let p = lower.indexOf(w);
        while (p >= 0 && hits.some((h) => p < h.e && p + w.length > h.s)) p = lower.indexOf(w, p + 1);
        if (p >= 0) hits.push({ s: p, e: p + w.length, i });
        else missing.push(i);
      });
      hits.sort((a, c) => a.s - c.s);
      let out = "", k = 0;
      hits.forEach((h) => { out += esc(text.slice(k, h.s)) + `<span class="gl" role="button" tabindex="0" data-g="${h.i}">${esc(text.slice(h.s, h.e))}</span>`; k = h.e; });
      out += esc(text.slice(k));
      missing.forEach((i) => { out += ` <span class="gl gl-mark" role="button" tabindex="0" data-g="${i}" aria-label="Note on ${esc(g.glosses[i].word)}"></span>`; });
      return out;
    }

    const plateAt = new Map(platesOf(n).map((x) => [x.line, x]));
    let html = "";
    b.lines.forEach((text, i) => {
      const l = i + 1;
      const s = secAt.get(l);
      if (s) html += `<div class="sec"><div class="sec-head"><h2>${esc(s.title)}</h2><span class="lr">${s.from}–${s.to}</span>${askHere(`Walk me through ${ref(n, s.from, s.to)}, “${s.title}”.`, s.title)}</div><p class="sec-note">${esc(s.note)}</p></div>`;
      const f = famAt.get(l);
      const cls = ["ln"];
      if (l === 1) cls.push("first");
      else if (paras.has(l)) cls.push("para");
      if (f !== undefined) cls.push("famous-ln");
      const num = l % 10 === 0 || s ? ` data-n="${l}"` : "";
      const mark = f !== undefined && g.famous[f].from === l ? `<span class="fam-mark" role="button" tabindex="0" data-f="${f}" aria-label="Why this passage is famous" title="A famous passage"></span>` : "";
      html += `<span class="${cls.join(" ")}" id="l-${l}" data-l="${l}"${num}>${lineHtml(l, text)}${mark}${fnAt.has(l) ? fnMark(fnAt.get(l)) : ""}</span><br>`;
      if (plateAt.has(l)) html += `<figure class="dore">${pimg(plateAt.get(l))}<figcaption>${pcap(plateAt.get(l))}</figcaption></figure>`;
    });
    const next = n < 12 ? guide(n + 1) : null;
    const pref = store.get("mode", "scroll");
    const mode = pref === "spread" && innerWidth < 820 ? "page" : pref;
    document.body.classList.toggle("paged", mode !== "scroll");
    document.body.classList.toggle("mode-spread", mode === "spread");
    app.innerHTML = `<div class="fade">
${tabs(n, "read")}
<div class="paper${mode === "spread" ? " spread" : ""}"><div class="stage"><div class="flow" id="flow">
<header class="reader-head"><span class="eyebrow">The ${ORD[n]} Book</span><h1>${esc(g.title)}</h1>${fleuron()}</header>
<div class="poem" id="poem">${html}</div>
<div class="end-card">${fleuron()}
  <p class="finis">${n < 12 ? `The End of the ${ORD[n]} Book.` : "The End."}</p>
  <div class="btn-row" style="justify-content:center">
    ${next ? `<a class="btn primary" href="#/b/${n + 1}">Book ${ROMAN[n + 1]}: ${esc(next.title)}</a>` : `<a class="btn primary" href="#/">The title page</a>`}
    <a class="btn" href="#/b/${n}">Guide to Book ${ROMAN[n]}</a>
  </div>
</div>
</div></div>
<nav class="pager" aria-label="Pages"><button type="button" class="pg-btn" id="pg-prev" aria-label="Previous page"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button><span class="pg-count" id="pg-count" aria-live="polite"></span><button type="button" class="pg-btn" id="pg-next" aria-label="Next page"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button></nav>
</div>
</div>`;
    const poem = $("#poem");
    poem.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === " ") && e.target.matches(".gl, .fam-mark, .fn-mark")) { e.preventDefault(); e.target.click(); }
    });
    poem.addEventListener("click", (e) => {
      // Read-along open: a tap in the number margin of a line plays from there.
      if (pl.open && pl.n === n && e.target.classList.contains("ln") && e.clientX > e.target.getBoundingClientRect().right - 30) { e.stopPropagation(); return plSeekLine(+e.target.dataset.l); }
      if (dictLong) { dictLong = false; e.stopPropagation(); e.preventDefault(); return; }
      if (dictMode && !e.target.closest(".fam-mark")) {
        const hit = wordAtPoint(e.clientX, e.clientY), gl0 = e.target.closest(".gl");
        const w = hit ? hit.word : gl0 ? glossWord(g.glosses[+gl0.dataset.g]) : "";
        if (w) { e.stopPropagation(); return openDict(w, hit ? hit.line : g.glosses[+gl0.dataset.g].line, gl0); }
      }
      const gl = e.target.closest(".gl");
      if (gl) { e.stopPropagation(); const hit = wordAtPoint(e.clientX, e.clientY); return showGloss(n, g, +gl.dataset.g, gl, hit && gl.contains(hit.node) ? hit.word : ""); }
      const fn = e.target.closest(".fn-mark");
      if (fn) { e.stopPropagation(); return showFootnotes(fn.dataset.fn.split(" "), fn); }
      const fm = e.target.closest(".fam-mark");
      if (fm) { e.stopPropagation(); return showFamous(n, g, +fm.dataset.f, fm); }
    });
    dictPress(poem);
    // Pages are laid out by column: plates must have their size before the pages are counted.
    if (mode !== "scroll") poem.querySelectorAll("img[loading=lazy]").forEach((im) => { im.loading = "eager"; });
    reader = { n, total, els: [...poem.querySelectorAll(".ln")], tops: [], lastL: 0, g, target: at, t0: performance.now(), paged: mode !== "scroll", spread: mode === "spread" };
    if (reader.paged) { after = () => initPaged(at); return; }
    after = () => {
      measure();
      if (at > 1) {
        const el = $(`#l-${at}`);
        if (el) {
          el.scrollIntoView({ block: "start" });
          el.classList.add("hit");
        }
      }
      track();
    };
  }

  function measure() {
    if (!reader) return;
    reader.tops = reader.els.map((el) => el.getBoundingClientRect().top + scrollY);
  }
  addEventListener("resize", () => { if (reader && !reader.paged) { measure(); track(); } });
  // Web fonts change line heights: once they load, land on the asked-for line again.
  if (document.fonts) document.fonts.ready.then(() => {
    if (!reader) return;
    if (reader.paged) return layoutPaged();
    measure();
    const el = reader.target > 1 && performance.now() - reader.t0 < 4000 && $(`#l-${reader.target}`);
    if (el) { el.scrollIntoView({ block: "start" }); measure(); }
    track();
  });

  let saveTimer = 0;
  function track() {
    const r = reader;
    if (!r || !r.tops.length) return;
    const y = scrollY + 110;
    let lo = 0, hi = r.tops.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (r.tops[mid] <= y) lo = mid; else hi = mid - 1; }
    // At the very bottom of the page, the last line counts as read.
    const l = innerHeight + scrollY >= document.documentElement.scrollHeight - 4 ? r.total : lo + 1;
    setLine(l, scrollY > 200);
  }
  function setLine(l, deep) {
    const r = reader;
    if (!r || l === r.lastL) return;
    r.lastL = l;
    const sec = r.g.sections.find((s) => l >= s.from && l <= s.to);
    titleEl.innerHTML = `<i>${ROMAN[r.n]}</i> · ${esc(sec && deep ? sec.title : r.g.title)}`;
    progress.style.width = `${(l / r.total) * 100}%`;
    CHAT.update({ l }, `Book ${ROMAN[r.n]} · line ${l}`);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (!reader || reader.n !== r.n) return;
      if (deep || l > 1) store.set("pos", { n: r.n, l, t: Date.now() });
      if (l > readOf(r.n)) store.set(`read:${r.n}`, l);
      pushState();
    }, 400);
  }


  // ── page and two-page modes: the poem set in fixed-height columns, turned like a book ──
  let pagedKeys = false;
  function initPaged(at) {
    const r = reader;
    r.stage = $(".stage"); r.flow = $("#flow"); r.paper = $(".paper");
    r.prev = $("#pg-prev"); r.next = $("#pg-next"); r.count = $("#pg-count");
    r.cur = 0; r.stride = 1; r.pages = 1; r.lefts = [];
    r.prev.addEventListener("click", () => turn(-1));
    r.next.addEventListener("click", () => turn(1));
    let x0 = 0, y0 = 0;
    r.stage.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    r.stage.addEventListener("touchend", (e) => {
      const t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;
      if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.6) turn(dx < 0 ? 1 : -1);
    }, { passive: true });
    if (!pagedKeys) {
      pagedKeys = true;
      // Wheel and trackpad turn one page per gesture (the page itself no longer scrolls).
      let wheelAt = 0;
      addEventListener("wheel", (e) => {
        const q = reader;
        if (!q || !q.paged || e.ctrlKey || document.body.classList.contains("chat-sheet") || e.target.closest?.(".player, .note-card, .chat, dialog")) return;
        const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        if (Math.abs(d) < 12 || Date.now() - wheelAt < 450) return;
        wheelAt = Date.now(); turn(d > 0 ? 1 : -1);
      }, { passive: true });
      addEventListener("keydown", (e) => {
        const q = reader;
        if (!q || !q.paged || e.altKey || e.ctrlKey || e.metaKey) return;
        if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.body.classList.contains("chat-sheet")) return;
        const k = e.key;
        if (k === "ArrowRight" || k === "PageDown" || (k === " " && !e.shiftKey)) { e.preventDefault(); turn(1); }
        else if (k === "ArrowLeft" || k === "PageUp" || (k === " " && e.shiftKey)) { e.preventDefault(); turn(-1); }
        else if (k === "Home") { e.preventDefault(); goPage(0); }
        else if (k === "End") { e.preventDefault(); goPage(q.pages - 1); }
      });
    }
    // Plates load lazily and change the columns once they arrive: lay the pages out again.
    let imgT = 0;
    r.flow.addEventListener("load", (e) => { if (e.target.tagName === "IMG") { clearTimeout(imgT); imgT = setTimeout(() => layoutPaged(), 120); } }, true);
    r.ro = new ResizeObserver(() => layoutPaged());
    r.ro.observe(r.paper);
    r.ro.observe(document.body);
    layoutPaged(at);
    if (at > 1) { const el = $(`#l-${at}`); if (el) el.classList.add("hit"); }
  }
  function layoutPaged(atLine) {
    const r = reader;
    if (!r || !r.paged || !r.stage) return;
    // Re-layouts keep the line that was asked for (r.anchor) instead of sliding back to each page's first line.
    const line = atLine || r.anchor || r.lastL || r.target || 1;
    r.anchor = line;
    const title = line <= 1 && r.cur === 0;
    scrollTo(0, 0);
    const top = r.stage.getBoundingClientRect().top;
    const reserve = (innerWidth < 820 ? 78 : 22) + (pl.open ? pl.h : 0);
    const h = Math.max(280, Math.floor(innerHeight - top - 54 - reserve));
    r.stage.style.height = h + "px";
    r.paper.style.setProperty("--sh", h + "px");
    const W = r.stage.clientWidth, gap = r.spread ? Math.max(56, Math.min(96, Math.round(W * 0.07))) : 40;
    r.paper.style.setProperty("--gap", gap + "px");
    const cw = r.spread ? (W - gap) / 2 : W;
    r.flow.style.width = W + "px";
    r.flow.style.columnWidth = cw + "px";
    r.flow.style.columnGap = gap + "px";
    r.stride = r.spread ? 2 * (cw + gap) : cw + gap;
    r.lefts = r.els.map((el) => el.offsetLeft);
    r.pages = Math.max(1, Math.round((r.stage.scrollWidth + gap) / r.stride));
    r.laying = true;
    if (title) goPage(0, false); else goLine(line, false);
    r.laying = false;
  }
  const pageOfLeft = (left) => Math.max(0, Math.floor((left + 2) / reader.stride));
  function goLine(l, smooth) { const r = reader; goPage(pageOfLeft(r.lefts[Math.min(Math.max(l, 1), r.total) - 1] || 0), smooth); }
  function turn(d) { if (reader) { pl.lock = Date.now() + 5000; goPage(reader.cur + d, true); } }
  function goPage(p, smooth) {
    const r = reader;
    if (!r || !r.paged) return;
    p = Math.min(Math.max(p, 0), r.pages - 1);
    r.cur = p;
    if (!r.laying) r.anchor = 0;
    const left = Math.round(p * r.stride);
    if (smooth && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // A turn is a quick cross-fade, not a slide: the text never moves under the spine.
      const st = r.stage, tok = (r.fadeTok = (r.fadeTok || 0) + 1);
      st.style.transition = "opacity .11s ease"; st.style.opacity = "0";
      setTimeout(() => {
        if (r.fadeTok !== tok) return;
        st.scrollTo({ left, behavior: "auto" }); st.style.transition = "opacity .16s ease"; st.style.opacity = "1";
      }, 110);
    } else { r.stage.style.opacity = ""; r.stage.scrollTo({ left, behavior: "auto" }); }
    r.prev.disabled = p === 0;
    r.next.disabled = p === r.pages - 1;
    const first = r.lefts.findIndex((x) => x >= p * r.stride - 2) + 1 || r.total;
    const nextFirst = r.lefts.findIndex((x) => x >= (p + 1) * r.stride - 2);
    const last = nextFirst < 0 ? r.total : Math.max(first, nextFirst);
    const pg = r.spread ? `Pages ${p * 2 + 1}–${p * 2 + 2}` : `Page ${p + 1}`;
    const of = r.spread ? r.pages * 2 : r.pages;
    r.count.innerHTML = `<b>${pg}</b> of ${of}<small>${p === 0 && first <= 1 ? "Title" : `lines ${first}–${last}`}</small>`;
    setLine(p === r.pages - 1 ? r.total : first, p > 0);
    progress.style.width = `${(Math.min(last, r.total) / r.total) * 100}%`;
  }


  // ── read-along: Thomas A. Copeland's LibriVox reading, streamed from archive.org, lights the word being read ──
  // Word start times come from data/audio/book-NN.json (scripts/align.py). The poem's markup is never touched:
  // the current word is a Range over the line's text nodes, painted by the CSS Custom Highlight API.
  const AUDIO_URL = (n) => `https://archive.org/download/paradiselost_1411_librivox/paradiselost_${String(n).padStart(2, "0")}_milton_64kb.mp3`;
  const SPEEDS = [0.8, 1, 1.25];
  const hasHL = !!(window.CSS && CSS.highlights && typeof window.Highlight === "function");
  const pl = { n: 0, open: false, h: 0, data: null, T: null, L: null, W: null, idx: -2, line: -1, lock: 0, audio: null, bar: null, drag: false, force: false, raf: 0, sec: -1, avail: new Map() };
  const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
  const ICON = {
    play: '<path d="M8 5.5v13l11-6.5z" fill="currentColor"/>',
    pause: '<path d="M7 5h3.6v14H7zM13.4 5H17v14h-3.6z" fill="currentColor"/>',
    close: '<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  };
  const audioFile = (n) => `audio/book-${String(n).padStart(2, "0")}.json`;

  // Is there a reading of this book? (a HEAD request: the timing file itself is fetched only when the player opens)
  function plAvail(n) {
    if (!hasHL) return Promise.resolve(false);
    if (!pl.avail.has(n)) pl.avail.set(n, fetch(audioFile(n), { method: "HEAD" }).then((r) => r.ok).catch(() => false));
    return pl.avail.get(n);
  }

  function plBar() {
    if (pl.bar) return pl.bar;
    const el = document.createElement("div");
    el.className = "player";
    el.id = "player";
    el.setAttribute("role", "region");
    el.setAttribute("aria-label", "Read-along player");
    el.hidden = true;
    el.innerHTML = `<div class="pl-row">
  <button type="button" class="pl-btn pl-play" aria-label="Play" title="Play"><svg viewBox="0 0 24 24" aria-hidden="true">${ICON.play}</svg></button>
  <button type="button" class="pl-btn pl-skip" data-d="-15" aria-label="Back 15 seconds" title="Back 15 seconds">−15</button>
  <button type="button" class="pl-btn pl-skip" data-d="15" aria-label="Forward 15 seconds" title="Forward 15 seconds">+15</button>
  <input type="range" class="pl-scrub" min="0" max="1" step="1" value="0" aria-label="Position in the reading">
  <button type="button" class="pl-btn pl-speed" aria-label="Speed" title="Speed">1×</button>
</div>
<div class="pl-meta"><span class="pl-line">Line 1</span><span class="pl-credit">Read by Thomas A. Copeland · LibriVox (public domain)</span><button type="button" class="pl-btn pl-close" aria-label="Close player" title="Close player"><svg viewBox="0 0 24 24" aria-hidden="true">${ICON.close}</svg></button></div>`;
    document.body.appendChild(el);
    pl.bar = el;
    const q = (s) => el.querySelector(s);
    pl.playBtn = q(".pl-play"); pl.scrub = q(".pl-scrub"); pl.speedBtn = q(".pl-speed"); pl.lineEl = q(".pl-line");
    pl.playBtn.addEventListener("click", () => { const a = pl.audio; if (a) a.paused ? plPlay() : a.pause(); });
    el.querySelectorAll(".pl-skip").forEach((b) => b.addEventListener("click", () => plJump(+b.dataset.d)));
    pl.speedBtn.addEventListener("click", () => {
      store.set("speed", SPEEDS[(SPEEDS.indexOf(store.get("speed", 1)) + 1) % SPEEDS.length]);
      plSpeed();
    });
    q(".pl-close").addEventListener("click", () => plClose());
    pl.scrub.addEventListener("pointerdown", () => { pl.drag = true; });
    ["pointerup", "pointercancel", "change", "blur"].forEach((ev) => pl.scrub.addEventListener(ev, () => { pl.drag = false; }));
    pl.scrub.addEventListener("input", () => { pl.lock = 0; pl.audio.currentTime = +pl.scrub.value; pl.sec = -1; plTick(true); });
    // The bar's height (--pbar) lifts the Ask button and the note card, and shortens the pages.
    new ResizeObserver(() => {
      const h = pl.open ? Math.ceil(el.getBoundingClientRect().height) : 0;
      if (h === pl.h) return;
      pl.h = h;
      document.documentElement.style.setProperty("--pbar", h + "px");
      if (reader && reader.paged) layoutPaged();
    }).observe(el);
    return el;
  }

  function plAudio() {
    if (pl.audio) return pl.audio;
    const a = new Audio();
    a.preload = "metadata";
    ["timeupdate", "seeked", "loadedmetadata", "durationchange"].forEach((ev) => a.addEventListener(ev, () => plTick(false)));
    a.addEventListener("play", () => { plState(); plLoop(); });
    ["pause", "ended", "ratechange"].forEach((ev) => a.addEventListener(ev, plState));
    a.addEventListener("error", () => { if (a.getAttribute("src")) pl.lineEl.textContent = "Audio unavailable"; });
    pl.audio = a;
    return a;
  }

  function plSpeed() {
    const v = store.get("speed", 1), sp = SPEEDS.includes(v) ? v : 1;
    if (pl.audio) pl.audio.playbackRate = sp;
    pl.speedBtn.textContent = `${sp}×`;
    pl.speedBtn.setAttribute("aria-label", `Speed ${sp}×, change`);
  }
  function plPlay() {
    const a = pl.audio;
    if (a.ended) a.currentTime = 0;
    a.play().catch(() => { pl.lineEl.textContent = "Audio unavailable"; });
  }
  function plJump(d) {
    const a = pl.audio;
    if (!a || !pl.data) return;
    pl.lock = 0;
    a.currentTime = Math.max(0, Math.min((a.duration || pl.data.dur) - 0.5, a.currentTime + d));
  }
  function plState() {
    const a = pl.audio;
    if (!pl.bar || !a) return;
    const on = !a.paused && !a.ended;
    pl.bar.classList.toggle("is-playing", on);
    pl.playBtn.firstElementChild.innerHTML = on ? ICON.pause : ICON.play;
    pl.playBtn.setAttribute("aria-label", on ? "Pause" : "Play");
    pl.playBtn.title = on ? "Pause" : "Play";
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = on ? "playing" : "paused";
    if (!on) cancelAnimationFrame(pl.raf);
  }
  function plLoop() {
    cancelAnimationFrame(pl.raf);
    const step = () => { plTick(false); if (pl.audio && !pl.audio.paused) pl.raf = requestAnimationFrame(step); };
    pl.raf = requestAnimationFrame(step);
  }

  // The word under the playhead is the last one whose start time has passed.
  function plBuild(data) {
    const T = [], L = [], W = [];
    let last = 0;
    data.lines.forEach((ws, i) => (ws || []).forEach((t, k) => { last = Math.max(last, +t || 0); T.push(last); L.push(i + 1); W.push(k); }));
    Object.assign(pl, { data, T, L, W, idx: -2, line: -1 });
  }
  function plTick(force) {
    const a = pl.audio;
    if (!a || !pl.T || !pl.open) return;
    const t = a.currentTime, T = pl.T;
    let lo = 0, hi = T.length - 1, idx = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (T[m] <= t) { idx = m; lo = m + 1; } else hi = m - 1; }
    // A word held for seconds is a pause between sections, not a word: no highlight.
    const key = idx >= 0 && t - T[idx] > 3 ? -1 : idx;
    if (key !== pl.idx || pl.force || force) { const f = pl.force; pl.force = false; pl.idx = key; plWord(key, f); }
    const dur = a.duration && isFinite(a.duration) ? a.duration : pl.data.dur;
    if (+pl.scrub.max !== Math.floor(dur)) pl.scrub.max = Math.floor(dur);
    const s = Math.floor(t);
    if (s !== pl.sec && !pl.drag) {
      pl.sec = s;
      pl.scrub.value = s;
      const l = idx >= 0 ? pl.L[idx] : 0;
      pl.lineEl.textContent = `${l ? `Line ${l}` : "Intro"} · ${fmt(t)}`;
      pl.scrub.setAttribute("aria-valuetext", `${l ? `Line ${l}` : "Intro"}, ${fmt(t)}`);
      if ("mediaSession" in navigator && navigator.mediaSession.setPositionState && s % 5 === 0) {
        try { navigator.mediaSession.setPositionState({ duration: dur, playbackRate: a.playbackRate || 1, position: Math.min(t, dur) }); } catch {}
      }
    }
  }

  // Word k of line l as a Range over the line's text nodes (a word can run across gloss spans).
  function wordRange(l, k) {
    const el = reader && reader.els[l - 1];
    if (!el) return null;
    const wm = reader.wm || (reader.wm = new Map());
    let m = wm.get(l);
    if (!m) {
      const words = [], re = /\S+/g, text = el.textContent;
      let x;
      while ((x = re.exec(text))) words.push([x.index, x.index + x[0].length]);
      const nodes = [], tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let nd, pos = 0;
      while ((nd = tw.nextNode())) { nodes.push([nd, pos]); pos += nd.length; }
      m = { words, nodes };
      wm.set(l, m);
    }
    const w = m.words[Math.min(k, m.words.length - 1)];
    if (!w) return null;
    const at = (p, end) => {
      for (const [nd, s] of m.nodes) if (end ? p > s && p <= s + nd.length : p >= s && p < s + nd.length) return [nd, p - s];
      return null;
    };
    const a = at(w[0], false), b = at(w[1], true);
    if (!a || !b) return null;
    const r = document.createRange();
    r.setStart(a[0], a[1]);
    r.setEnd(b[0], b[1]);
    return r;
  }
  function plWord(key, force) {
    if (!reader || reader.n !== pl.n) return;
    if (key < 0) { CSS.highlights.delete("reading"); return; }
    const l = pl.L[key], r = wordRange(l, pl.W[key]);
    if (r) CSS.highlights.set("reading", new Highlight(r)); else CSS.highlights.delete("reading");
    pl.line = l;
    plFollow(l, force);
  }

  // Keep the current line in view: scroll only when it leaves the middle band, turn to the page that holds it,
  // and stand back for a few seconds after the reader scrolls or turns a page by hand.
  function plFollow(l, force) {
    const r = reader;
    if (!r || (!force && Date.now() < pl.lock)) return;
    const smooth = !force && !reduce && !matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (r.paged) {
      if (!r.lefts || !r.lefts.length) return;
      const p = pageOfLeft(r.lefts[l - 1] || 0);
      if (p !== r.cur) goPage(p, smooth);
      return;
    }
    const el = r.els[l - 1];
    if (!el) return;
    const rc = el.getBoundingClientRect(), vh = innerHeight - pl.h, hd = header.classList.contains("hidden") ? 0 : header.offsetHeight;
    const lo = hd + (vh - hd) * 0.2, hi = hd + (vh - hd) * 0.65;
    // A long jump (a seek) lands at once; the next line down glides.
    if (force || rc.top < lo || rc.bottom > hi) scrollTo({ top: scrollY + rc.top - (hd + (vh - hd) * 0.4), behavior: smooth && Math.abs(rc.top - vh / 2) < innerHeight * 1.2 ? "smooth" : "auto" });
  }
  const plManual = (e) => { if (pl.open && !(pl.bar && pl.bar.contains(e.target))) pl.lock = Date.now() + 5000; };
  ["wheel", "touchmove", "keydown"].forEach((ev) => addEventListener(ev, plManual, { passive: true }));

  function plSeekLine(l) {
    const t = pl.data && pl.data.lines[l - 1] && pl.data.lines[l - 1][0];
    if (t == null || !pl.audio) return;
    pl.lock = 0;
    pl.audio.currentTime = t;
    plPlay();
  }
  // Previous / next line, for the lock screen.
  function plStep(d) {
    const l = Math.max(1, Math.min(pl.data.lines.length, (pl.line > 0 ? pl.line : 1) + d));
    const t = pl.data.lines[l - 1] && pl.data.lines[l - 1][0];
    if (t != null) { pl.lock = 0; pl.audio.currentTime = t; }
  }

  async function plOpen() {
    if (!reader || !hasHL) return;
    const n = reader.n, bar = plBar(), a = plAudio();
    if (pl.n !== n) {
      a.pause();
      a.removeAttribute("src");
      Object.assign(pl, { n, data: null, T: null, idx: -2, line: -1 });
    }
    pl.open = true;
    pl.sec = -1;
    bar.hidden = false;
    document.body.classList.add("has-player");
    listenBtn.classList.add("on");
    listenBtn.setAttribute("aria-pressed", "true");
    plSpeed();
    plState();
    if (!pl.data) {
      pl.lineEl.textContent = "Loading…";
      try {
        const r = await fetch(audioFile(n));
        if (!r.ok) throw new Error(r.status);
        plBuild(await r.json());
      } catch { pl.lineEl.textContent = "Read-along unavailable"; return; }
      if (!pl.open || pl.n !== n) return;
      a.src = AUDIO_URL(n);
      a.playbackRate = SPEEDS.includes(store.get("speed", 1)) ? store.get("speed", 1) : 1;
      // Start where the reader is, not at the top of the recording.
      const l = reader && reader.lastL > 1 ? reader.lastL : reader && reader.target > 1 ? reader.target : 0;
      const t = l && pl.data.lines[l - 1] && pl.data.lines[l - 1][0];
      if (t) a.currentTime = Math.max(0, t - 0.3);
    }
    if ("mediaSession" in navigator) {
      const ms = navigator.mediaSession;
      ms.metadata = new MediaMetadata({ title: `Paradise Lost, Book ${n}`, artist: "John Milton, read by Thomas A. Copeland", album: "Paradise Lost · LibriVox" });
      const set = (k, f) => { try { ms.setActionHandler(k, f); } catch {} };
      set("play", plPlay);
      set("pause", () => a.pause());
      set("seekbackward", (d) => plJump(-((d && d.seekOffset) || 15)));
      set("seekforward", (d) => plJump((d && d.seekOffset) || 15));
      set("seekto", (d) => { if (d && d.seekTime != null) { pl.lock = 0; a.currentTime = d.seekTime; } });
      set("previoustrack", () => plStep(-1));
      set("nexttrack", () => plStep(1));
    }
    pl.force = true;
    plTick(true);
  }
  // leaving: the reader is going away, so the audio goes too
  function plClose(leaving) {
    pl.open = false;
    if (pl.audio) pl.audio.pause();
    if (leaving && pl.audio) { pl.audio.removeAttribute("src"); pl.n = 0; pl.data = null; pl.T = null; }
    if (hasHL) CSS.highlights.delete("reading");
    if (pl.bar) pl.bar.hidden = true;
    document.body.classList.remove("has-player");
    listenBtn.classList.remove("on");
    listenBtn.setAttribute("aria-pressed", "false");
    document.documentElement.style.setProperty("--pbar", "0px");
    pl.h = 0;
    if ("mediaSession" in navigator) { navigator.mediaSession.metadata = null; navigator.mediaSession.playbackState = "none"; }
    if (!leaving && reader && reader.paged) layoutPaged();
  }
  // After a layout change the view is rebuilt: pick the highlight and the place up again.
  function plRebind() {
    if (!pl.open || !reader || reader.n !== pl.n || !pl.T) return;
    listenBtn.classList.add("on");
    listenBtn.setAttribute("aria-pressed", "true");
    pl.force = true;
    plTick(true);
  }
  listenBtn.addEventListener("click", () => (pl.open ? plClose() : plOpen()));

  // ── note card: a gloss, or why a passage is famous ──
  const card = $("#note-card"), ncWord = $("#nc-word"), ncText = $("#nc-text"), ncAsk = $("#nc-ask"), ncFn = $("#nc-fn");
  const ncDict = $("#nc-dict"), ncDictBtn = $("#nc-dictbtn");
  let cardAsk = "", cardFrom = null, cardDict = null, cardFn = null;
  // dict: {word, line} shows the Dictionary button; html: the card holds the reader's footnotes instead of a one-paragraph note
  function openNote(word, text, ask, from, dict, html) {
    if (dictAbort) dictAbort.abort();
    cardDict = dict || null;
    ncDictBtn.hidden = !dict;
    ncDict.hidden = true;
    card.classList.remove("dict");
    if (cardFrom) cardFrom.classList.remove("open");
    cardFrom = from || null;
    cardFn = null;
    if (cardFrom) cardFrom.classList.add("open");
    ncWord.innerHTML = word;
    ncText.textContent = text || "";
    ncText.hidden = Boolean(html);
    ncAsk.hidden = Boolean(html);
    ncFn.hidden = !html;
    ncFn.innerHTML = html || "";
    cardAsk = ask;
    card.hidden = false;
    card.style.animation = "none";
    void card.offsetWidth;
    card.style.animation = "";
  }
  function closeNote() {
    if (card.hidden) return;
    if (dictAbort) dictAbort.abort();
    card.hidden = true;
    if (cardFrom) cardFrom.classList.remove("open");
    cardFrom = null;
    cardFn = null;
  }
  function showGloss(n, g, i, el, tapped) {
    const x = g.glosses[i];
    const line = book(n).lines[x.line - 1];
    openNote(`<small>${ref(n, x.line)}</small>${esc(x.word)}`, x.note, `> ${line}\n\nWhat does “${x.word}” mean here (${ref(n, x.line)})?`, el, { word: tapped || glossWord(x), line: x.line });
  }
  function showFamous(n, g, i, el) {
    const f = g.famous[i];
    const ls = lines(n, f.from, Math.min(f.to, f.from + 3));
    openNote(`<small>A famous passage · ${ref(n, f.from, f.to)}</small>${esc(ls[0].replace(/[,;:.]$/, ""))}…`, f.why, `${quoteFor(ls)}\n\nWhy is this passage (${ref(n, f.from, f.to)}) so admired? Walk me through it.`, el);
  }
  function showFootnotes(ids, from) {
    const fs = NOTES.sorted().filter((f) => ids.includes(f.id));
    if (!fs.length) return closeNote();
    const nums = new Map();
    NOTES.sorted().filter((f) => f.book === fs[0].book).forEach((f, i) => nums.set(f.id, i + 1));
    const many = fs.length > 1;
    const html = fs.map((f) => `<section class="fn-item" data-id="${esc(f.id)}">${many ? `<b class="fn-ref">${ref(f.book, f.line, f.to)}</b>` : ""}
<blockquote>${esc(f.quote)}</blockquote>
<ul>${f.notes.map((x) => `<li>${esc(x.note)}${x.question ? `<small>Asked: ${esc(x.question)}</small>` : ""}</li>`).join("")}</ul>
<div class="fn-actions"><button type="button" class="nc-ask" data-fn-ask="${esc(f.id)}">Ask the Reader about this passage ›</button><button type="button" class="nc-ask fn-rm" data-fn-rm="${esc(f.id)}">Remove</button></div></section>`).join("");
    const mark = from || (reader && $(`.fn-mark[data-fn~="${CSS.escape(fs[0].id)}"]`)) || null;
    const first = fs[0];
    openNote(`<small>Your notes · ${fs.map((f) => ref(f.book, f.line, f.to)).join(", ")}</small>Footnote${many ? "s" : ""} ${fs.map((f) => nums.get(f.id)).join(", ")}`, "", "", mark, null, html);
    cardFn = fs.map((f) => f.id);
    ncFn.scrollTop = 0;
    return first;
  }
  ncFn.addEventListener("click", (e) => {
    const rm = e.target.closest("[data-fn-rm]"), ask = e.target.closest("[data-fn-ask]");
    if (!rm && !ask) return;
    e.stopPropagation();
    if (rm) { NOTES.remove(rm.dataset.fnRm); return; }
    const f = NOTES.all().find((x) => x.id === ask.dataset.fnAsk);
    if (!f) return;
    const ls = lines(f.book, f.line, Math.min(f.to, f.line + 5));
    closeNote();
    CHAT.ask(`${quoteFor(ls)}\n\nWhat should I notice about this passage (${ref(f.book, f.line, f.to)})?`);
  });
  $("#nc-close").addEventListener("click", closeNote);
  ncAsk.addEventListener("click", () => { const a = cardAsk; closeNote(); CHAT.ask(a); });
  ncDictBtn.addEventListener("click", () => { if (cardDict) openDict(cardDict.word, cardDict.line, cardFrom); });

  document.addEventListener("click", (e) => { if (!card.hidden && !card.contains(e.target)) closeNote(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeNote(); });

  // ── dictionary: any word, from Wiktionary plus Milton's own senses (/api/dict) ──
  // Hit-testing uses caretPositionFromPoint / caretRangeFromPoint, so the poem's markup is never touched.
  let dictMode = false, dictAbort = null, dictLong = false;
  const hint = $("#dict-hint");
  const WORDCH = /[\p{L}'’-]/u;
  const letters = (t) => String(t).toLowerCase().replace(/[’‘]/g, "'").replace(/[^\p{L}']/gu, "");
  const glossWord = (x) => (x.word.split(/[\s-]+/).find((p) => letters(p).length > 1) || x.word).replace(/^[^\p{L}’']+|[^\p{L}]+$/gu, "");
  function setDictMode(on) {
    dictMode = on;
    document.body.classList.toggle("dict-mode", on);
    dictBtn.classList.toggle("on", on);
    dictBtn.setAttribute("aria-pressed", String(on));
    clearTimeout(setDictMode.t);
    hint.hidden = !on;
    if (on) setDictMode.t = setTimeout(() => { hint.hidden = true; }, 3500);
  }
  dictBtn.addEventListener("click", (e) => { e.stopPropagation(); setDictMode(!dictMode); });
  function wordAtPoint(x, y) {
    let node, off;
    if (document.caretPositionFromPoint) { const p = document.caretPositionFromPoint(x, y); if (!p) return null; node = p.offsetNode; off = p.offset; }
    else if (document.caretRangeFromPoint) { const r = document.caretRangeFromPoint(x, y); if (!r) return null; node = r.startContainer; off = r.startOffset; }
    else return null;
    if (!node || node.nodeType !== 3 || !node.parentElement) return null;
    const ln = node.parentElement.closest(".ln");
    if (!ln) return null;
    const t = node.data;
    let s = Math.min(off, t.length), e = s;
    while (s > 0 && WORDCH.test(t[s - 1])) s--;
    while (e < t.length && WORDCH.test(t[e])) e++;
    if (s === e) return null;
    const r = document.createRange();
    r.setStart(node, s); r.setEnd(node, e);
    const on = [...r.getClientRects()].some((b) => x >= b.left - 3 && x <= b.right + 3 && y >= b.top - 3 && y <= b.bottom + 3);
    const w = t.slice(s, e).replace(/^[-‘]+|[-'’‘]+$/g, "");
    return on && letters(w).length > 0 ? { word: w, line: +ln.dataset.l, node } : null;
  }
  // Press and hold on a word (about half a second, finger or mouse held still) opens it.
  function dictPress(poem) {
    let timer = 0, x0 = 0, y0 = 0;
    const stop = () => { clearTimeout(timer); timer = 0; };
    poem.addEventListener("pointerdown", (e) => {
      dictLong = false;
      if (e.button > 0 || e.target.closest(".gl, .fam-mark")) return;
      stop(); x0 = e.clientX; y0 = e.clientY;
      timer = setTimeout(() => {
        timer = 0;
        const h = wordAtPoint(x0, y0);
        if (!h) return;
        dictLong = true;
        setTimeout(() => { dictLong = false; }, 900);
        try { getSelection().removeAllRanges(); } catch {}
        openDict(h.word, h.line, null);
      }, 520);
    });
    poem.addEventListener("pointermove", (e) => { if (timer && Math.hypot(e.clientX - x0, e.clientY - y0) > 8) stop(); });
    ["pointerup", "pointercancel", "pointerleave", "scroll"].forEach((n) => poem.addEventListener(n, stop, { passive: true }));
    poem.addEventListener("contextmenu", (e) => { if (dictLong) e.preventDefault(); });
  }
  // Dictionary mode also follows a selected word (double-click, or Shift+arrows for keyboard users).
  let selTimer = 0;
  document.addEventListener("selectionchange", () => {
    clearTimeout(selTimer);
    if (!dictMode) return;
    selTimer = setTimeout(() => {
      const sel = getSelection();
      if (!sel || sel.isCollapsed || !sel.anchorNode) return;
      const w = sel.toString().trim();
      const el = sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode;
      const ln = el && el.closest && el.closest("#poem .ln");
      if (ln && /^[\p{L}'’-]{2,40}$/u.test(w)) openDict(w, +ln.dataset.l, null);
    }, 450);
  });
  const WIKI = "https://en.wiktionary.org/wiki/";
  function dictHtml(word, d, gloss) {
    const li = (a) => a.map((x) => `<li>${esc(x)}</li>`).join("");
    let h = "";
    if (gloss) h += `<div class="dc-m"><b>Milton’s sense here</b>${esc(gloss.note)}</div>`;
    const m = d && d.milton;
    if (m && !(gloss && m.src === "guide")) h += `<div class="dc-m"><b>Milton’s sense</b>${esc(m.milton)}${m.note ? `<span class="dc-n">${esc(m.note)}</span>` : ""}${m.root ? `<span class="dc-n">Root: ${esc(m.root)}</span>` : ""}</div>`;
    const entries = (d && d.entries) || [];
    if (d && d.via) h += `<p class="dc-via">“${esc(d.via.from)}”: ${esc(d.via.note)}. Showing “${esc(d.resolved)}”.</p>`;
    entries.forEach((e) => {
      const old = e.senses.slice(0, e.old), now = e.senses.slice(e.old);
      h += `<h4 class="dc-pos">${esc(e.pos)}</h4>`;
      if (old.length) h += `<div class="dc-sub">In Milton’s day</div><ol>${li(old)}</ol>`;
      if (now.length) h += `${old.length ? `<div class="dc-sub">Today</div>` : ""}<ol start="${old.length + 1}">${li(now)}</ol>`;
    });
    if (d && d.etymology && d.etymology.length) h += `<h4 class="dc-pos">Etymology</h4>${d.etymology.map((t) => `<p class="dc-ety">${esc(t)}</p>`).join("")}`;
    const url = d && /^https:\/\/en\.wiktionary\.org\/wiki\//.test(d.url || "") ? d.url : `${WIKI}${encodeURIComponent(word)}`;
    if (!entries.length) h += `<p class="dc-none">No dictionary entry found for “${esc(word)}”.</p>`;
    h += entries.length ? `<p class="dc-src"><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Wiktionary, CC BY-SA 4.0</a></p>` : `<p class="dc-src"><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Search Wiktionary</a></p>`;
    return h;
  }
  async function openDict(word, line, from) {
    const n = reader && reader.n, g = reader && reader.g;
    const lw = letters(word);
    const gloss = g && g.glosses.find((x) => x.line === line && (letters(x.word) === lw || x.word.split(/[\s-]+/).some((p) => letters(p) === lw)));
    const lineText = n ? book(n).lines[line - 1] : "";
    openNote(`<small>Dictionary${n ? ` · ${ref(n, line)}` : ""}</small>${esc(word)}`, "", `> ${lineText}\n\nWhat does “${word}” mean here (${ref(n, line)})?`, from, null);
    ncText.hidden = true;
    ncDict.hidden = false;
    card.classList.add("dict");
    const intro = gloss ? `<div class="dc-m"><b>Milton’s sense here</b>${esc(gloss.note)}</div>` : "";
    ncDict.innerHTML = `${intro}<p class="dc-wait">Looking up “${esc(word)}”…</p>`;
    const ctl = dictAbort = new AbortController();
    let d = null;
    try {
      const r = await fetch(`/api/dict?w=${encodeURIComponent(word)}`, { signal: ctl.signal });
      if (r.ok) d = await r.json();
    } catch (e) { if (ctl.signal.aborted) return; }
    if (ctl.signal.aborted) return;
    if (d && !d.found) d = { ...d, entries: [], etymology: [] };
    ncDict.innerHTML = dictHtml(word, d, gloss);
    ncDict.scrollTop = 0;
  }

  // ── the notebook: every footnote, by book in line order ──
  function notesView() {
    setTitle("Your notes", true);
    CHAT.set({ ...POEM, label: "Your notes" });
    notesOpen = true;
    renderNotes();
  }
  let sureClear = false;
  function renderNotes() {
    const fs = NOTES.sorted();
    const books = [...new Set(fs.map((f) => f.book))];
    const body = fs.length ? `<div class="btn-row fn-tools"><button type="button" class="btn primary" id="fn-copy">Copy as Markdown</button><button type="button" class="btn" id="fn-clear">${sureClear ? "Tap again to clear" : "Clear"}</button></div>
${books.map((n) => `<section class="block">${head(`Book ${ROMAN[n]} · ${esc(guide(n).title)}`)}<ol class="fnl">${fs.filter((f) => f.book === n).map((f) => `<li id="fn-${esc(f.id)}"><div class="fn-top"><a class="fn-ref" href="#/r/${f.book}/${f.line}">${ref(f.book, f.line, f.to)}</a></div>
<blockquote class="fn-quote">${esc(f.quote)}</blockquote>
<ul class="fn-notes">${f.notes.map((x) => `<li>${esc(x.note)}${x.question ? `<small>Asked: ${esc(x.question)}</small>` : ""}</li>`).join("")}</ul>
<div class="fn-row"><a class="fn-more" href="#/r/${f.book}/${f.line}">Read in context ›</a><button type="button" class="fn-del" data-rm="${esc(f.id)}" aria-label="Remove the footnote on ${ref(f.book, f.line, f.to)}">Remove</button></div></li>`).join("")}</ol></section>`).join("")}`
      : `<div class="fn-empty">${fleuron()}<p>Nothing here yet.</p><p class="note">When the Reader’s answer cites lines, such as (IV.288), the passage is saved here as a footnote with the sentence that mentions it. It also shows as a small mark in the text.</p><p><a class="btn" href="#/r/1">Start reading</a></p></div>`;
    app.innerHTML = `<div class="fade fn-page">
<section class="people-head"><span class="eyebrow">From Ask the Reader</span><h1>Your notes</h1>
<p class="sec-note" style="text-align:center">${fs.length ? `${fs.length} footnote${fs.length === 1 ? "" : "s"}, in the order of the poem. Kept in this browser${window.ME && window.ME.user ? " and in your account" : ""}.` : "Footnotes build up as you ask about lines."}</p></section>
${body}</div>`;
    const copy = $("#fn-copy");
    if (copy) copy.addEventListener("click", async () => {
      const text = NOTES.markdown();
      let ok = false;
      try { await navigator.clipboard.writeText(text); ok = true; } catch {
        const t = document.createElement("textarea");
        t.value = text; t.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(t); t.select();
        try { ok = document.execCommand("copy"); } catch {}
        t.remove();
      }
      copy.textContent = ok ? "Copied" : "Could not copy";
      setTimeout(() => { if (copy.isConnected) copy.textContent = "Copy as Markdown"; }, 2000);
    });
    const clr = $("#fn-clear");
    if (clr) clr.addEventListener("click", () => {
      if (!sureClear) { sureClear = true; renderNotes(); $("#fn-clear").focus(); return; }
      sureClear = false;
      NOTES.clear();
    });
    app.querySelectorAll("[data-rm]").forEach((b) => b.addEventListener("click", () => NOTES.remove(b.dataset.rm)));
  }

  function platesView() {
    setTitle("Doré’s plates", true);
    CHAT.set({ ...POEM, label: "Doré’s plates" });
    const by = [];
    PLATES.forEach((x) => { (by[x.book] = by[x.book] || []).push(x); });
    app.innerHTML = `<div class="fade">
<section class="people-head"><span class="eyebrow">Gustave Doré, 1866</span><h1>The Plates</h1>
<p class="sec-note" style="text-align:center">Doré’s fifty engravings for the Cassell edition, now in the public domain. Tap a plate to enlarge it; the line number takes you to the passage.</p></section>
${by.map((xs, n) => xs ? `<section class="block">${head(`Book ${ROMAN[n]} · ${esc(guide(n).title)}`)}<div class="gallery">${xs.map((x) => `<figure class="dore">${pimg(x)}<figcaption>${pcap(x)}</figcaption></figure>`).join("")}</div></section>` : "").join("")}
<p class="credit">Plates from Wikimedia Commons, scanned from the 1866 edition (public domain).</p>
</div>`;
  }
  function notFound() {
    setTitle("Not found", true);
    CHAT.set(POEM);
    app.innerHTML = `<div class="fade center" style="padding:60px 0">${fleuron()}<p class="finis" style="font:italic 22px/1.4 var(--display);margin:16px 0">“Which way I fly is Hell.”</p><p class="note">That page isn’t in the book.</p><p><a class="btn" href="#/">The title page</a></p></div>`;
  }

  function setTitle(html, back) {
    titleEl.innerHTML = html;
    backBtn.hidden = !back;
    document.title = html === "Paradise Lost" ? "Paradise Lost" : `${html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&")} · Paradise Lost`;
  }

  let after = null;
  function creditsView() {
    setTitle("Credits", true);
    CHAT.set({ ...POEM, label: "Credits" });
    app.innerHTML = `<article class="credits fade">
<h1>Credits and copyright</h1>
<p class="note">Made with love in New Orleans by <a href="https://benbybenjacobs.com" rel="noopener">Ben Jacobs</a>.</p>
<h2>Source and how it works</h2>
<ul><li>Open source (MIT): <a href="https://github.com/benmj/paradise-lost" rel="noopener">github.com/benmj/paradise-lost</a>. Plain HTML, CSS and JavaScript on a small Node server, no framework. The poem, notes and plates are static data; the reader chat sends your question and the open passage to Claude.</li></ul>
<h2>The poem</h2>
<ul><li>Text of the second edition (1674) from <a href="https://www.gutenberg.org/ebooks/26" rel="noopener">Project Gutenberg #26</a>. Public domain.</li></ul>
<h2>Plates</h2>
<ul><li>Fifty engravings by Gustave Doré (1866 Cassell edition), scans from <a href="https://commons.wikimedia.org/wiki/Category:Illustrations_of_Paradise_Lost_by_Gustave_Dor%C3%A9" rel="noopener">Wikimedia Commons</a>. Public domain; resized for the web.</li></ul>
<h2>Listening</h2>
<ul><li>The read-along uses the <a href="https://librivox.org/paradise-lost-by-john-milton/" rel="noopener">LibriVox</a> reading by Thomas A. Copeland (public domain), streamed from the Internet Archive. Word timings were made for this guide.</li>
<li>Recitations on the Listen pages are links to YouTube, LibriVox and the Internet Archive. Nothing is hosted here.</li></ul>
<h2>Dictionary and etymology</h2>
<ul><li>Definitions and etymologies come from <a href="https://en.wiktionary.org/" rel="noopener">Wiktionary</a>, text available under <a href="https://creativecommons.org/licenses/by-sa/4.0/" rel="noopener">CC BY-SA 4.0</a>. Each card links to the entry it came from.</li>
<li>The Milton lexicon (the senses shown first as "Milton's sense") and the guide's glosses were written for this guide.</li></ul>
<h2>Guide, notes and code</h2>
<ul><li>The guide notes, characters, glosses and software are © 2026 Ben Jacobs and the Paradise Lost contributors, under the <a href="https://github.com/benmj/paradise-lost/blob/main/LICENSE" rel="noopener">MIT License</a>. Source: <a href="https://github.com/benmj/paradise-lost" rel="noopener">github.com/benmj/paradise-lost</a>.</li>
<li>Fonts: IM Fell and EB Garamond, SIL Open Font License.</li></ul>
<h2>Ask the Reader</h2>
<ul><li>Answers are written by an AI model from the passage you have open and can be wrong. Check them against the poem.</li></ul>
</article>`;
  }
  async function meView() {
    setTitle("Profile", true);
    CHAT.set({ ...POEM, label: "Profile" });
    const u = window.ME && window.ME.user;
    if (!u) { app.innerHTML = `<div class="page"><p class="sec-note">Sign in to see your profile.</p><p style="text-align:center"><a class="btn" href="/auth/login?back=/">Sign in with Google</a></p></div>`; return; }
    let pr = {};
    try { pr = await (await api("/api/profile")).json(); } catch {}
    const rows = PL.books.map((b) => ({ n: b.n, p: pct(b.n) }));
    const total = PL.books.reduce((a, b) => a + b.lines.length, 0);
    const got = PL.books.reduce((a, b) => a + Math.min(readOf(b.n), b.lines.length), 0);
    const overall = Math.round((got / total) * 100);
    const finished = rows.filter((r) => r.p >= 99).length, started = rows.filter((r) => r.p > 0).length;
    const since = pr.first_seen ? new Date(pr.first_seen).toLocaleDateString(undefined, { month: "long", year: "numeric" }) : "";
    app.innerHTML = `<div class="page"><section class="people-head"><span class="eyebrow">${esc(u.email)}</span><h1>${esc(u.name || "You")}</h1>
<p class="sec-note" style="text-align:center">${since ? `Reading since ${since}` : ""}</p></section>
<div class="stats"><div><b>${overall}%</b><span>of the poem read</span></div><div><b>${finished}</b><span>books finished</span></div><div><b>${NOTES.count()}</b><span>footnotes</span></div><div><b>${pr.asks || 0}</b><span>questions asked</span></div></div>
<table class="adm"><tr><th>Book</th><th>Read</th></tr>${rows.map((r) => `<tr><td>${ROMAN[r.n]} · ${esc(guide(r.n) && guide(r.n).title || book(r.n).title || "")}</td><td>${r.p}%</td></tr>`).join("")}</table>
<div class="acct-actions" style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin:16px 0">
<a class="chip" href="#/notes">Your notes</a>${u.admin ? `<a class="chip" href="#/admin">Readers</a>` : ""}
<button type="button" class="chip" id="me-key" ${window.PLKey.get() ? "" : "hidden"}>Forget my API key</button>
<button type="button" class="chip" id="me-clear">Clear reading data</button>
<button type="button" class="chip" id="me-out">Sign out</button>
<button type="button" class="chip" id="me-del">Delete my account</button></div>
<p class="sec-note" style="text-align:center">Clearing reading data resets your place and progress and keeps your footnotes. Deleting your account removes everything.</p></div>`;
    $("#me-key").addEventListener("click", () => { window.PLKey.set(""); $("#me-key").hidden = true; });
    $("#me-out").addEventListener("click", async () => { await api("/auth/logout", { method: "POST" }).catch(() => {}); location.href = "/"; });
    const twice = (id, label, fn) => $(id).addEventListener("click", async () => {
      const el = $(id);
      if (el.dataset.sure !== "1") { el.dataset.sure = "1"; el.textContent = "Tap again to confirm"; return; }
      await fn(); });
    twice("#me-clear", "Clear reading data", async () => {
      clearTimeout(pushTimer);
      for (let n = 1; n <= 12; n++) { try { localStorage.removeItem(`read:${n}`); } catch {} }
      try { localStorage.removeItem("pos"); } catch {}
      await api("/api/state/clear-reading", { method: "POST" }).catch(() => {});
      location.hash = "#/"; location.reload();
    });
    twice("#me-del", "Delete my account", async () => {
      await api("/api/account/delete", { method: "POST" }).catch(() => {});
      NOTES.clear(); clearTimeout(pushTimer);
      try { localStorage.removeItem("notes-s"); } catch {}
      location.href = "/";
    });
  }
  async function adminView() {
    setTitle("Readers", true);
    CHAT.set({ ...POEM, label: "Readers" });
    app.innerHTML = `<div class="page"><section class="people-head"><span class="eyebrow">Admin</span><h1>Readers</h1></section><p class="sec-note" id="adm">Loading…</p></div>`;
    let d;
    try { const r = await api("/api/admin/analytics"); if (!r.ok) throw 0; d = await r.json(); }
    catch { $("#adm").textContent = "Admins only. Sign in with an admin account."; return; }
    const day = (t) => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    $("#adm").outerHTML = `<article class="prose">
<p>${d.signed_in} signed in · ${d.started} started reading</p>
<h2>Content</h2>
<table class="adm"><tr><th>Book</th><th>Readers</th><th>Avg</th><th>Done</th></tr>${d.books.map((b) => `<tr><td>${ROMAN[b.n]}</td><td>${b.readers}</td><td>${b.avg_pct}%</td><td>${b.finished}</td></tr>`).join("")}</table>
<h2>Readers</h2>
<table class="adm"><tr><th>Who</th><th>Done</th><th>Asks</th><th>Last</th></tr>${d.readers.map((r) => `<tr><td>${esc(r.name || r.email)}<small>${esc(r.email)} · ${r.logins} sign-in${r.logins === 1 ? "" : "s"} · ${r.notes} note${r.notes === 1 ? "" : "s"}</small></td><td>${r.pct}%</td><td>${r.asks}</td><td>${day(r.last_seen)}</td></tr>`).join("")}</table></article>`;
  }
  function privacyView() {
    setTitle("Privacy", true);
    CHAT.set({ ...POEM, label: "Privacy" });
    app.innerHTML = `<article class="credits fade">
<h1>Privacy</h1>
<p class="note">Paradise Lost, an illustrated reading guide by <a href="https://benbybenjacobs.com" rel="noopener">Ben Jacobs</a>. Last updated November 23, 2026.</p>
<h2>Signing in</h2>
<ul><li>Reading the guide needs a sign-in, with Google or with a code we email you. It is used to save your reading place and footnotes, to ask the Reader questions, and to see how many people read and how far they get.</li>
<li>With Google we receive your email address, name and Google account id, and nothing else; we never see your Google password. With a code we receive only the email address you type, and keep a code for 10 minutes.</li></ul>
<h2>What is stored</h2>
<ul><li>Per reader: email, name, sign-in count, last sign-in, how far you have read in each book, footnotes you save and daily usage counts.</li>
<li>Footnotes hold only passages of the public poem, a sentence of each answer and the question you asked.</li></ul>
<h2>Ask the Reader</h2>
<ul><li>Your question and the passage you have open are sent to Anthropic to write the answer. If you bring your own key, it stays in your browser and goes only to Anthropic.</li>
<li>Questions are not kept beyond the footnotes you choose to save.</li></ul>
<h2>Sharing</h2>
<ul><li>We do not sell or share your data, and we run no advertising or third-party analytics trackers. YouTube plays through youtube-nocookie.com and loads only when you tap play.</li></ul>
<h2>Deleting your data</h2>
<ul><li>"Delete my data" in the account menu removes your account and everything stored with it. You can also write to the address on <a href="https://benbybenjacobs.com" rel="noopener">benbybenjacobs.com</a>.</li></ul>
</article>`;
  }
  function route() {
    const parts = location.hash.replace(/^#/, "").split("?")[0].split("/").filter(Boolean);
    header.classList.remove("hidden");
    closeNote();
    notesOpen = false;
    sureClear = false;
    if (pl.open && !(parts[0] === "r" && +parts[1] === pl.n)) plClose(true);
    if (reader && reader.ro) reader.ro.disconnect();
    reader = null;
    after = null;
    document.body.classList.remove("paged", "mode-spread");
    plainBtn.hidden = true;
    layoutBtn.hidden = true;
    listenBtn.hidden = true;
    dictBtn.hidden = true;
    setDictMode(false);
    setMenu(false);
    progress.hidden = true;
    if (!parts.length) home();
    else if (parts[0] === "b") bookView(+parts[1], parts[2]);
    else if (parts[0] === "r") readView(+parts[1], +parts[2] || 0);
    else if (parts[0] === "people") parts[1] ? personView(parts[1]) : peopleView();
    else if (parts[0] === "listen") listenView();
    else if (parts[0] === "plates") platesView();
    else if (parts[0] === "notes") notesView();
    else if (parts[0] === "credits") creditsView();
    else if (parts[0] === "privacy") privacyView();
    else if (parts[0] === "admin") adminView();
    else if (parts[0] === "me") meView();
    else notFound();
    scrollTo(0, 0);
    if (after) requestAnimationFrame(after);
    if (pl.open) requestAnimationFrame(() => requestAnimationFrame(plRebind));
  }
  // A plate enlarges on click or Enter; click, Close or Escape puts it away.
  const lb = $("#lb");
  function openPlate(img) {
    const x = PLATES.find((q) => q.plate === +img.dataset.p);
    if (!x || !lb) return;
    $("#lb-img").src = img.src;
    $("#lb-img").alt = img.alt;
    $("#lb-cap").innerHTML = pcap(x);
    lb.showModal();
  }
  document.addEventListener("click", (e) => {
    const img = e.target.closest(".dore-img:not(.nolb)");
    if (img) openPlate(img);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.matches && e.target.matches(".dore-img:not(.nolb)")) openPlate(e.target);
  });
  if (lb) {
    lb.addEventListener("click", (e) => { if (!e.target.closest("a")) lb.close(); });
    $("#lb-close").addEventListener("click", () => lb.close());
    lb.addEventListener("click", (e) => { if (e.target.closest("a")) lb.close(); });
  }
  addEventListener("hashchange", () => { ss("inapp", "1"); route(); });
  route();
  loadAccount();

  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
})();
