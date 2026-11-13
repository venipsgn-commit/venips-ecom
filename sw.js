/* Venips – service worker
   Rend le site installable comme une application et permet de l'ouvrir même avec une connexion faible.
   Stratégie « réseau d'abord » : la version en ligne est toujours prioritaire, la copie locale
   ne sert que si le réseau ne répond pas. Les appels à la base de données ne sont jamais mis en cache. */
const CACHE = "venips-v7";
const CORE = ["/", "/index.html", "/css/style.css", "/js/config.js", "/js/products.js", "/js/app.js", "/js/assistant.js", "/js/facture.js", "/images/logo.jpg", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // Uniquement les fichiers du site lui-même (pas la base de données, ni les images externes)
  if (req.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/admin")) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || (req.mode === "navigate" ? caches.match("/") : undefined)))
  );
});
