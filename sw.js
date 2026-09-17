// Reach service worker: lets the app open without internet.
// Bump VERSION whenever you upload new app files.
const VERSION = "reach-1.1.0";
const SHARE_CACHE = "reach-share";
const SHELL = ["./", "./index.html", "./config.js", "./supabase.js", "./qrcode.js", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== SHARE_CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  const reqUrl = new URL(req.url);
  if (req.method === "POST" && reqUrl.origin === self.location.origin && reqUrl.pathname.endsWith("/share-target")) {
    e.respondWith(handleShare(req));
    return;
  }
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never cache your Supabase data
  e.respondWith(
    fetch(req)
      .then((res) => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); } return res; })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || (req.mode === "navigate" ? caches.match("./index.html") : Response.error())))
  );
});

// Receives things shared from other apps (WhatsApp contact cards, photos, text)
async function handleShare(req) {
  const scope = self.registration.scope;
  try {
    const form = await req.formData();
    const files = form.getAll("files").filter((f) => f && typeof f === "object" && f.size > 0).slice(0, 5);
    const stamp = Date.now();
    const payload = { title: String(form.get("title") || ""), text: String(form.get("text") || ""), url: String(form.get("url") || ""), files: files.map((f, i) => ({ name: f.name || "shared", type: f.type || "", key: new URL(`__shared/${stamp}-${i}`, scope).href })) };
    const cache = await caches.open(SHARE_CACHE);
    await Promise.all(files.map((f, i) => cache.put(payload.files[i].key, new Response(f, { headers: { "content-type": f.type || "application/octet-stream" } }))));
    await cache.put(new URL("__shared/payload", scope).href, new Response(JSON.stringify(payload), { headers: { "content-type": "application/json" } }));
  } catch (err) { /* open the app anyway */ }
  return Response.redirect(new URL("./?shared=1", scope).href, 303);
}
