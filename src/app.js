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
    return { pos: p ? { n: p.n, l: p.l } : undefined, read };
  };
  let pushTimer = 0;
  function pushState() {
    if (!(window.ME && window.ME.user)) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => api("/api/state", { method: "PUT", body: JSON.stringify(localState()) }).catch(() => {}), 1500);
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
      pushState();
      if (location.hash === "" || location.hash === "#/") route();
    } catch {}
  }
  const dlg = $("#acct-dlg");
  $("#acct").addEventListener("click", () => {
    $("#acct-key").hidden = !window.PLKey.get();
    $("#acct-who").textContent = window.ME && window.ME.user ? `${window.ME.user.name || "Signed in"} · ${window.ME.user.email}` : "";
    dlg.showModal();
  });
  $("#acct-key").addEventListener("click", () => { window.PLKey.set(""); $("#acct-key").hidden = true; });
  $("#acct-close").addEventListener("click", () => dlg.close());
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
  $("#acct-out").addEventListener("click", async () => { await api("/auth/logout", { method: "POST" }).catch(() => {}); location.reload(); });
  $("#acct-del").addEventListener("click", async () => {
    if ($("#acct-del").dataset.sure !== "1") { $("#acct-del").dataset.sure = "1"; $("#acct-del").textContent = "Tap again to delete"; return; }
    await api("/api/account/delete", { method: "POST" }).catch(() => {});
    location.reload();
  });

  // ── shell ──
  const app = $("#app");
  document.body.insertAdjacentHTML("afterbegin", DEFS);
  const header = $(".topbar"), backBtn = $("#back"), titleEl = $("#title"), plainBtn = $("#plain"), layoutBtn = $("#layout"), layoutMenu = $("#layout-menu"), progress = $("#progress");
  $("#theme").addEventListener("click", () => {
    const dark = document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme === "dark"
      : matchMedia("(prefers-color-scheme: dark)").matches;
    const next = dark ? "light" : "dark";
    store.set("theme", next);
    applyTheme(next);
  });
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

    const secAt = new Map(g.sections.map((s) => [s.from, s]));
    const glossAt = new Map();
    g.glosses.forEach((x, i) => { if (!glossAt.has(x.line)) glossAt.set(x.line, []); glossAt.get(x.line).push(i); });
    const famAt = new Map();
    g.famous.forEach((f, i) => { for (let l = f.from; l <= f.to; l++) if (!famAt.has(l)) famAt.set(l, i); });
    const paras = b.paras && b.paras.length > 5 ? new Set(b.paras) : new Set();

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
      hits.forEach((h) => { out += esc(text.slice(k, h.s)) + `<button type="button" class="gl" data-g="${h.i}">${esc(text.slice(h.s, h.e))}</button>`; k = h.e; });
      out += esc(text.slice(k));
      missing.forEach((i) => { out += ` <button type="button" class="gl gl-mark" data-g="${i}" aria-label="Note on ${esc(g.glosses[i].word)}">°</button>`; });
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
      const num = l % 10 === 0 || s ? `<span class="n" aria-hidden="true">${l}</span>` : "";
      const mark = f !== undefined && g.famous[f].from === l ? `<button type="button" class="fam-mark" data-f="${f}" aria-label="Why this passage is famous" title="A famous passage">❦</button>` : "";
      html += `<div class="${cls.join(" ")}" id="l-${l}" data-l="${l}">${lineHtml(l, text)}${mark}${num}</div>`;
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
    poem.addEventListener("click", (e) => {
      const gl = e.target.closest(".gl");
      if (gl) { e.stopPropagation(); return showGloss(n, g, +gl.dataset.g, gl); }
      const fm = e.target.closest(".fam-mark");
      if (fm) { e.stopPropagation(); return showFamous(n, g, +fm.dataset.f, fm); }
    });
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
    r.ro = new ResizeObserver(() => layoutPaged());
    r.ro.observe(r.paper);
    r.ro.observe(document.body);
    layoutPaged(at);
    if (at > 1) { const el = $(`#l-${at}`); if (el) el.classList.add("hit"); }
  }
  function layoutPaged(atLine) {
    const r = reader;
    if (!r || !r.paged || !r.stage) return;
    const line = atLine || r.lastL || r.target || 1;
    const title = line <= 1 && r.cur === 0;
    scrollTo(0, 0);
    const top = r.stage.getBoundingClientRect().top;
    const reserve = innerWidth < 820 ? 78 : 22;
    const h = Math.max(280, Math.floor(innerHeight - top - 54 - reserve));
    r.stage.style.height = h + "px";
    r.paper.style.setProperty("--sh", h + "px");
    const W = r.stage.clientWidth, gap = r.spread ? Math.min(72, Math.round(W * 0.06)) : 40;
    const cw = r.spread ? (W - gap) / 2 : W;
    r.flow.style.width = W + "px";
    r.flow.style.columnWidth = cw + "px";
    r.flow.style.columnGap = gap + "px";
    r.stride = r.spread ? 2 * (cw + gap) : cw + gap;
    r.lefts = r.els.map((el) => el.offsetLeft);
    r.pages = Math.max(1, Math.round((r.stage.scrollWidth + gap) / r.stride));
    if (title) goPage(0, false); else goLine(line, false);
  }
  const pageOfLeft = (left) => Math.max(0, Math.floor((left + 2) / reader.stride));
  function goLine(l, smooth) { const r = reader; goPage(pageOfLeft(r.lefts[Math.min(Math.max(l, 1), r.total) - 1] || 0), smooth); }
  function turn(d) { if (reader) goPage(reader.cur + d, true); }
  function goPage(p, smooth) {
    const r = reader;
    if (!r || !r.paged) return;
    p = Math.min(Math.max(p, 0), r.pages - 1);
    r.cur = p;
    r.stage.scrollTo({ left: Math.round(p * r.stride), behavior: smooth && !matchMedia("(prefers-reduced-motion: reduce)").matches ? "smooth" : "auto" });
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

  // ── note card: a gloss, or why a passage is famous ──
  const card = $("#note-card"), ncWord = $("#nc-word"), ncText = $("#nc-text"), ncAsk = $("#nc-ask");
  let cardAsk = "", cardFrom = null;
  function openNote(word, text, ask, from) {
    if (cardFrom) cardFrom.classList.remove("open");
    cardFrom = from || null;
    if (cardFrom) cardFrom.classList.add("open");
    ncWord.innerHTML = word;
    ncText.textContent = text;
    cardAsk = ask;
    card.hidden = false;
    card.style.animation = "none";
    void card.offsetWidth;
    card.style.animation = "";
  }
  function closeNote() {
    if (card.hidden) return;
    card.hidden = true;
    if (cardFrom) cardFrom.classList.remove("open");
    cardFrom = null;
  }
  function showGloss(n, g, i, el) {
    const x = g.glosses[i];
    const line = book(n).lines[x.line - 1];
    openNote(`<small>${ref(n, x.line)}</small>${esc(x.word)}`, x.note, `> ${line}\n\nWhat does “${x.word}” mean here (${ref(n, x.line)})?`, el);
  }
  function showFamous(n, g, i, el) {
    const f = g.famous[i];
    const ls = lines(n, f.from, Math.min(f.to, f.from + 3));
    openNote(`<small>A famous passage · ${ref(n, f.from, f.to)}</small>${esc(ls[0].replace(/[,;:.]$/, ""))}…`, f.why, `${quoteFor(ls)}\n\nWhy is this passage (${ref(n, f.from, f.to)}) so admired? Walk me through it.`, el);
  }
  $("#nc-close").addEventListener("click", closeNote);
  ncAsk.addEventListener("click", () => { const a = cardAsk; closeNote(); CHAT.ask(a); });
  document.addEventListener("click", (e) => { if (!card.hidden && !card.contains(e.target)) closeNote(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeNote(); });

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
  function route() {
    const parts = location.hash.replace(/^#/, "").split("?")[0].split("/").filter(Boolean);
    header.classList.remove("hidden");
    closeNote();
    if (reader && reader.ro) reader.ro.disconnect();
    reader = null;
    after = null;
    document.body.classList.remove("paged", "mode-spread");
    plainBtn.hidden = true;
    layoutBtn.hidden = true;
    setMenu(false);
    progress.hidden = true;
    if (!parts.length) home();
    else if (parts[0] === "b") bookView(+parts[1], parts[2]);
    else if (parts[0] === "r") readView(+parts[1], +parts[2] || 0);
    else if (parts[0] === "people") parts[1] ? personView(parts[1]) : peopleView();
    else if (parts[0] === "listen") listenView();
    else if (parts[0] === "plates") platesView();
    else notFound();
    scrollTo(0, 0);
    if (after) requestAnimationFrame(after);
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
