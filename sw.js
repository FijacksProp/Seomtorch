const CACHE = "seomtorch-v10";
const APP_ASSETS = [
  "./",
  "index.html",
  "styles.css",
  "app.js",
  "api-client.js",
  "manifest.webmanifest",
  "assets/mark.svg",
  "config.js",
  "data/questions.json"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);

  // Account data is private and changes frequently. Never put cross-origin API
  // responses in the shared application cache (cache keys ignore auth headers).
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Fetch application code and configuration first so deployments reach users
  // promptly, with the existing cache retained as an offline fallback.
  if (["/", "/index.html", "/app.js", "/api-client.js", "/config.js", "/sw.js"].includes(url.pathname)) {
    event.respondWith(fetch(event.request).then(response => {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match(event.request)));
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match("index.html")))
  );
});
