// Offline copy of the app shell: serve from cache, refresh in the background.
const CACHE = "pl-v16";
const SHELL = ["./", "index.html", "styles.css", "art.js", "app.js", "chat.js", "notes.js", "data.js", "icon.svg", "manifest.webmanifest"];
self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.includes("/api/") || url.pathname.startsWith("/auth/") || /welcome\./.test(url.pathname) || url.pathname.startsWith("/art/")) return;
  if (e.request.mode === "navigate") return e.respondWith(fetch(e.request).catch(() => caches.match("./")));
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const hit = await c.match(e.request);
    const net = fetch(e.request).then((r) => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});
