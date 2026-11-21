// "Ask the Reader": a chat about the book, passage or character open.
// Phone: a sheet over the page that stays above the keyboard. Wide screens: a sidebar beside it.
// The server holds the text; this only says which book, line or character the talk is about.
window.PLKey = {
  get() { try { return localStorage.getItem("pl_key") || ""; } catch { return ""; } },
  set(k) { try { k ? localStorage.setItem("pl_key", k) : localStorage.removeItem("pl_key"); } catch {} },
};
(function () {
  const getKey = () => window.PLKey.get();
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };
  const wide = matchMedia("(min-width: 980px)");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const ICON = {
    ask: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12a7.5 7.5 0 1 1 3.3 6.2L4 19.5l1.2-3.6A7.4 7.4 0 0 1 4.5 12z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M8.5 10.5h7M8.5 13.5h4.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    fresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V6M6.5 11.5L12 6l5.5 5.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor"/></svg>',
  };

  // ── markdown, the small part of it the reader uses ──
  function inline(s) {
    return esc(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*\w])\*(?!\s)(.+?)\*(?!\w)/g, "$1<em>$2</em>")
      .replace(/(^|[^_\w])_(?!\s)(.+?)_(?!\w)/g, "$1<em>$2</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      // (IV.288) or IX.780–784 → a link into the reader
      .replace(/\b(XII|XI|X|IX|VIII|VII|VI|V|IV|III|II|I)\.(\d{1,4})((?:[–-]\d{1,4})?)\b/g, (m, r, l) => `<a class="ref" href="#/r/${ROMAN[r]}/${l}">${m}</a>`);
  }
  const ROMAN = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10, XI: 11, XII: 12 };
  // A citation footer adds nothing here (the text is on the page), so a trailing "Sources:" line is dropped.
  const noFooter = (text) => text.replace(/\n\s*\**Sources?\**:[^\n]*\s*$/i, "");
  function md(text) {
    return noFooter(text).trim().split(/\n{2,}/).map((block) => {
      const lines = block.split("\n");
      if (lines.every((l) => /^\s*[-*•]\s+/.test(l))) return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-*•]\s+/, ""))}</li>`).join("")}</ul>`;
      if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) return `<ol>${lines.map((l) => `<li>${inline(l.replace(/^\s*\d+[.)]\s+/, ""))}</li>`).join("")}</ol>`;
      if (/^#{1,6}\s/.test(lines[0])) return `<p><strong>${inline(lines[0].replace(/^#+\s*/, ""))}</strong>${lines.length > 1 ? "<br>" + lines.slice(1).map(inline).join("<br>") : ""}</p>`;
      if (lines.every((l) => /^>\s?/.test(l))) return `<blockquote>${lines.map((l) => inline(l.replace(/^>\s?/, ""))).join("<br>")}</blockquote>`;
      return `<p>${lines.map(inline).join("<br>")}</p>`;
    }).join("");
  }

  // ── shell ──
  document.body.insertAdjacentHTML("beforeend", `
<button class="ask-fab" id="ask-fab" hidden aria-haspopup="dialog" aria-controls="chat">${ICON.ask}<span>Ask</span></button>
<div class="chat-scrim" id="chat-scrim" hidden></div>
<aside class="chat" id="chat" role="dialog" aria-labelledby="chat-title" hidden>
  <div class="chat-grip" aria-hidden="true"><span></span></div>
  <header class="chat-head">
    <div class="chat-seal" aria-hidden="true">${window.ART.quill()}</div>
    <div class="chat-titles"><h2 id="chat-title">Ask the Reader</h2><p class="chat-sub" id="chat-sub"></p></div>
    <button class="icon-btn" id="chat-new" aria-label="New conversation" title="New conversation">${ICON.fresh}</button>
    <button class="icon-btn" id="chat-close" aria-label="Close" title="Close">${ICON.close}</button>
  </header>
  <div class="chat-log" id="chat-log"></div>
  <div class="chat-quote" id="chat-quote" hidden>
    <div class="chat-quote-body"><span class="chat-quote-label">Asking about</span><blockquote id="chat-quote-text"></blockquote></div>
    <button type="button" class="icon-btn" id="chat-quote-x" aria-label="Remove the passage" title="Remove the passage">${ICON.close}</button>
  </div>
  <form class="chat-compose" id="chat-form">
    <textarea id="chat-input" rows="1" placeholder="Ask about the poem…" enterkeyhint="send" aria-label="Your message"></textarea>
    <button class="chat-send" id="chat-send" type="submit" aria-label="Send">${ICON.send}</button>
  </form>
</aside>`);
  const fab = $("#ask-fab"), panel = $("#chat"), scrim = $("#chat-scrim"), log = $("#chat-log");
  const form = $("#chat-form"), input = $("#chat-input"), sendBtn = $("#chat-send"), sub = $("#chat-sub");
  const quoteBox = $("#chat-quote"), quoteText = $("#chat-quote-text"), appEl = document.getElementById("app");

  let ctx = null;          // { key, label, payload, placeholder, intro, suggestions }
  let messages = [];       // [{ role, content, error? }]
  let busy = null;         // AbortController while a reply streams
  let isOpen = false;
  let quote = "";          // a passage of the page, attached to the next message
  let selText = "";        // text selected on the page right now

  const storeKey = () => `chat:${ctx.key}`;
  const save = () => store.set(storeKey(), messages.filter((m) => !m.error).slice(-60));

  // ── rendering ──
  function renderEmpty() {
    log.innerHTML = `
<div class="chat-empty">
  <div class="chat-empty-mark" aria-hidden="true">${window.ART.fleuron()}</div>
  <p>${esc(ctx.intro)}</p>
  <div class="chat-chips">${ctx.suggestions.map((s) => `<button type="button" class="chip">${esc(s)}</button>`).join("")}</div>
</div>`;
    log.querySelectorAll(".chip").forEach((b) => b.addEventListener("click", () => ask(b.textContent)));
  }
  function msgHtml(m, i) {
    if (m.role === "user") return `<div class="msg user"><div class="bubble">${userHtml(m.content)}</div></div>`;
    if (m.needKey) return `<div class="msg error keybox"><p>${esc(m.error)}</p><form class="keyform" autocomplete="off"><input type="password" name="k" placeholder="sk-ant-…" aria-label="Anthropic API key" autocapitalize="off" autocorrect="off" spellcheck="false" required><button class="chip" type="submit">Save key and ask</button></form><p class="keynote">Your key is saved only in this browser and sent only to answer your questions; the server never stores it. A question costs about a cent. <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">Get a key</a>${getKey() ? ` · <button type="button" class="linkbtn" data-forget>Forget my key</button>` : ""}</p></div>`;
    if (m.error) return `<div class="msg error"><p>${esc(m.error)}</p><button type="button" class="chip" data-retry="${i}">Try again</button></div>`;
    return `<div class="msg reader"><div class="md">${md(m.content)}</div></div>`;
  }
  // A message about a passage starts with "> " lines: the passage shows as a quote inside the bubble.
  const br = (t) => esc(t).replace(/\n/g, "<br>");
  function userHtml(c) {
    const m = c.match(/^((?:>[^\n]*(?:\n|$))+)\s*([\s\S]*)$/);
    if (!m) return br(c);
    const q = m[1].split("\n").filter(Boolean).map((l) => l.replace(/^>\s?/, "")).join("\n");
    return `<blockquote>${br(q)}</blockquote>${m[2] ? br(m[2]) : ""}`;
  }
  function render() {
    if (!messages.length) return renderEmpty();
    log.innerHTML = messages.map(msgHtml).join("");
    log.querySelectorAll("[data-retry]").forEach((b) => b.addEventListener("click", retry));
    log.querySelectorAll(".keyform").forEach((f) => f.addEventListener("submit", (e) => {
      e.preventDefault();
      const k = f.k.value.trim();
      if (!/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(k)) { f.k.setCustomValidity("That doesn't look like an Anthropic key (sk-ant-…)"); f.k.reportValidity(); return; }
      window.PLKey.set(k);
      retry();
    }));
    log.querySelectorAll(".keyform input").forEach((i) => i.addEventListener("input", () => i.setCustomValidity("")));
    log.querySelectorAll("[data-forget]").forEach((b) => b.addEventListener("click", () => { window.PLKey.set(""); messages = messages.filter((m) => !m.error); render(); }));
  }
  const nearBottom = () => log.scrollHeight - log.scrollTop - log.clientHeight < 80;
  const toBottom = (smooth) => log.scrollTo({ top: log.scrollHeight, behavior: smooth && !reduce ? "smooth" : "auto" });

  function setBusy(on) {
    sendBtn.innerHTML = on ? ICON.stop : ICON.send;
    sendBtn.setAttribute("aria-label", on ? "Stop" : "Send");
    sendBtn.classList.toggle("stop", on);
    log.setAttribute("aria-busy", on ? "true" : "false");
    syncSend();
  }
  const syncSend = () => { sendBtn.disabled = !busy && !input.value.trim() && !quote; };
  function setQuote(text) {
    quote = text;
    quoteText.textContent = text;
    quoteBox.hidden = !text;
    input.placeholder = text ? "Ask about this passage, or just send…" : (ctx ? ctx.placeholder : "");
    syncSend();
  }
  $("#chat-quote-x").addEventListener("click", () => { setQuote(""); input.focus(); });

  // ── talking ──
  async function ask(text) {
    text = text.trim();
    if ((!text && !quote) || busy) return;
    if (quote) {
      text = `${quote.split("\n").map((l) => "> " + l).join("\n")}\n\n${text || "What does this passage mean?"}`;
      setQuote("");
    }
    messages = messages.filter((m) => !m.error);
    messages.push({ role: "user", content: text });
    input.value = "";
    autosize();
    if (window.ME && window.ME.chat === "byok" && !getKey()) {
      messages.push({ role: "assistant", content: "", error: "To ask the reader, add your own Anthropic API key. Reading, notes and plates need nothing.", needKey: true });
      render();
      toBottom(true);
      return;
    }
    render();
    toBottom(true);
    await stream();
  }
  function retry() {
    messages = messages.filter((m) => !m.error);
    if (messages.length && messages[messages.length - 1].role === "user") { render(); stream(); }
  }

  async function stream() {
    const history = messages.map(({ role, content }) => ({ role, content }));
    const reply = { role: "assistant", content: "" };
    log.insertAdjacentHTML("beforeend", `<div class="msg reader live"><div class="md"></div><div class="thinking" aria-label="The reader is thinking"><span></span><span></span><span></span></div></div>`);
    const live = log.lastElementChild, out = $(".md", live);
    toBottom(true);
    busy = new AbortController();
    setBusy(true);
    let frame = 0;
    const paint = () => {
      frame = 0;
      const stick = nearBottom();
      out.innerHTML = md(reply.content);
      live.classList.add("started");
      if (stick) toBottom(false);
    };
    try {
      const res = await fetch("api/chat", {
        method: "POST", signal: busy.signal, credentials: "same-origin",
        headers: { "Content-Type": "application/json", ...(getKey() ? { "X-User-Api-Key": getKey() } : {}) },
        body: JSON.stringify({ context: ctx.payload, messages: history }),
      });
      if (!res.ok || !res.body) {
        let msg = `The reader could not answer (${res.status}).`;
        let needKey = false;
        try { const j = await res.json(); msg = j.error || msg; needKey = Boolean(j.needKey); } catch {}
        throw Object.assign(new Error(msg), { needKey });
      }
      const reader = res.body.getReader(), dec = new TextDecoder();
      let buf = "", finished = false;
      while (!finished) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const data = chunk.split("\n").filter((l) => l.startsWith("data: ")).map((l) => l.slice(6)).join("");
          if (!data) continue;
          const ev = JSON.parse(data);
          if (ev.t) { reply.content += ev.t; if (!frame) frame = requestAnimationFrame(paint); }
          if (ev.error) throw Object.assign(new Error(ev.error), { needKey: Boolean(ev.needKey) });
          if (ev.done) finished = true;
        }
      }
      if (!reply.content.trim()) throw new Error("The reader had nothing to say. Try asking another way.");
      messages.push(reply);
    } catch (e) {
      if (e.name === "AbortError") {
        if (reply.content.trim()) messages.push({ role: "assistant", content: reply.content.trim() + " …" });
      } else {
        if (reply.content.trim()) messages.push(reply);
        messages.push({ role: "assistant", content: "", needKey: Boolean(e.needKey), error: e.message === "Failed to fetch" || e.message === "Load failed" ? "Couldn't reach the reader. Check the connection and try again." : e.message });
      }
    } finally {
      if (frame) cancelAnimationFrame(frame);
      busy = null;
      setBusy(false);
      save();
      const stick = nearBottom();
      render();
      if (stick) toBottom(false);
    }
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (busy) busy.abort();
    else ask(input.value);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
  });
  function autosize() {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 150) + "px";
    syncSend();
  }
  input.addEventListener("input", autosize);

  $("#chat-new").addEventListener("click", () => {
    if (busy) busy.abort();
    messages = [];
    store.del(storeKey());
    render();
    if (wide.matches) input.focus();
  });

  // ── open and close ──
  function layout() {
    const side = wide.matches;
    document.body.classList.toggle("chat-side", isOpen && side);
    document.body.classList.toggle("chat-sheet", isOpen && !side);
    panel.setAttribute("aria-modal", side ? "false" : "true");
    scrim.hidden = !isOpen || side;
    // The sidebar leaves the page visible, so a selection there still gets the button.
    fab.hidden = !ctx || (isOpen && !(side && selText));
    fab.classList.toggle("quote", !!selText);
    fab.lastElementChild.textContent = selText ? "Ask about this" : "Ask";
  }
  function open() {
    if (!ctx || isOpen) return;
    isOpen = true;
    panel.hidden = false;
    layout();
    requestAnimationFrame(() => panel.classList.add("in"));
    if (!wide.matches) history.pushState({ chat: 1 }, "");
    toBottom(false);
    if (wide.matches) input.focus();
    store.set("chat-open", wide.matches);
  }
  function close({ fromHistory = false } = {}) {
    if (!isOpen) return;
    isOpen = false;
    panel.classList.remove("in");
    input.blur();
    layout();
    const done = () => { if (!isOpen) panel.hidden = true; };
    reduce ? done() : setTimeout(done, 260);
    if (!fromHistory && history.state && history.state.chat) history.back();
    store.set("chat-open", false);
    fab.focus({ preventScroll: true });
  }
  fab.addEventListener("click", () => {
    const passage = selText;
    if (passage) {
      selText = "";
      try { getSelection().removeAllRanges(); } catch {}
      setQuote(passage);
    }
    open();
    layout();
    if (passage) input.focus();
  });

  // Select any text on the page and the Ask button becomes "Ask about this".
  let selTimer = 0;
  document.addEventListener("selectionchange", () => {
    const s = getSelection();
    const text = s && !s.isCollapsed && s.rangeCount && appEl && appEl.contains(s.getRangeAt(0).commonAncestorContainer)
      ? s.toString().replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim() : "";
    clearTimeout(selTimer);
    if (text.length >= 3) {
      selText = text.length > 1200 ? text.slice(0, 1200) + "…" : text;
      layout();
    } else if (selText) {
      // a tap on the button can clear the selection first, so let go a moment later
      selTimer = setTimeout(() => { selText = ""; layout(); }, 400);
    }
  });
  $("#chat-close").addEventListener("click", () => close());
  // A line reference in a reply opens the reader there; on the phone the sheet gets out of the way.
  log.addEventListener("click", (e) => {
    const a = e.target.closest("a.ref");
    if (!a) return;
    e.preventDefault();
    if (isOpen && !wide.matches) {
      if (history.state && history.state.chat) history.replaceState(null, "");
      close({ fromHistory: true });
    }
    location.hash = a.getAttribute("href").slice(1);
  });
  scrim.addEventListener("click", () => close());
  addEventListener("keydown", (e) => { if (e.key === "Escape" && isOpen) close(); });
  addEventListener("popstate", () => { if (isOpen && !wide.matches) close({ fromHistory: true }); });
  wide.addEventListener("change", layout);

  // drag the grip down to close the sheet
  (function grip() {
    const handle = $(".chat-head"), g = $(".chat-grip");
    let y0 = null, dy = 0;
    const startDrag = (e) => {
      if (wide.matches || e.target.closest("button")) return;
      y0 = e.clientY; dy = 0;
      panel.style.transition = "none";
      e.currentTarget.setPointerCapture(e.pointerId);
    };
    const move = (e) => {
      if (y0 === null) return;
      dy = Math.max(0, e.clientY - y0);
      panel.style.transform = `translateY(${dy}px)`;
    };
    const end = () => {
      if (y0 === null) return;
      y0 = null;
      panel.style.transition = "";
      panel.style.transform = "";
      if (dy > 90) close();
    };
    [handle, g].forEach((el) => {
      el.addEventListener("pointerdown", startDrag);
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", end);
      el.addEventListener("pointercancel", end);
    });
  })();

  // keep the sheet above the iPhone keyboard (principle 1: visualViewport lift)
  function lift() {
    const vv = window.visualViewport;
    if (!vv) return;
    const kb = Math.max(0, innerHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty("--kb", kb + "px");
    document.documentElement.style.setProperty("--vvh", vv.height + "px");
  }
  if (window.visualViewport) {
    visualViewport.addEventListener("resize", lift);
    visualViewport.addEventListener("scroll", lift);
  }
  lift();

  // ── context, set by the router on every page ──
  window.CHAT = {
    set(next) {
      if (busy && (!next || next.key !== (ctx && ctx.key))) busy.abort();
      if (!next || next.key !== (ctx && ctx.key)) setQuote("");
      selText = "";
      ctx = next;
      if (!ctx) { if (isOpen) close(); layout(); return; }
      if (isOpen && !wide.matches) close({ fromHistory: true });
      messages = store.get(storeKey(), []);
      sub.textContent = ctx.label;
      input.placeholder = quote ? input.placeholder : ctx.placeholder;
      render();
      layout();
      if (wide.matches && store.get("chat-open", false) && !isOpen) open();
      else if (isOpen) toBottom(false);
    },
    open,
    // The line the reader is at changes as they scroll: same conversation, fresher context.
    update(payload, label) {
      if (!ctx) return;
      Object.assign(ctx.payload, payload);
      if (label) { ctx.label = label; sub.textContent = label; }
    },
    // Ask about one passage right away (the quill buttons on the page).
    ask(text) {
      if (!ctx) return;
      open();
      if (busy) { input.value = text; autosize(); input.focus(); return; }
      ask(text);
    },
    has: () => messages.length > 0,
  };
})();
