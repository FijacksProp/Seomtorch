const CACHE = "seomtorch-v50";
const APP_ASSETS = [
  "./",
  "index.html",
  "styles.css",
  "app.js",
  "calculator.js",
  "api-client.js",
  "manifest.webmanifest",
  "assets/seomtorch_logo.png",
  "config.js",
  "data/manifest.json",
  "data/university/index.json",
  "data/university/anatomy/meta.json",
  "data/university/anatomy/200/courses.json",
  "data/university/anatomy/200/ana201.json",
  "data/university/anatomy/200/ana202.json",
  "data/university/anatomy/200/ana203.json",
  "data/university/physiology/meta.json",
  "data/university/physiology/200/courses.json",
  "data/university/physiology/200/pio201.json",
  "data/questions.json",
  "data/questions-biology.json",
  "data/questions-chemistry.json",
  "data/questions-civic-education.json",
  "data/questions-computer-studies.json",
  "data/questions-economics.json",
  "data/questions-english.json",
  "data/questions-general-paper.json",
  "data/questions-government.json",
  "data/questions-history.json",
  "data/questions-literature-in-english.json",
  "data/questions-marketing.json",
  "data/questions-mathematics.json",
  "data/questions-music.json",
  "data/questions-physics.json"
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

  const isKaTeX = url.href.startsWith("https://cdn.jsdelivr.net/npm/katex");

  // Account data is private and changes frequently. Never put cross-origin API
  // responses in the shared application cache (cache keys ignore auth headers).
  if (!isKaTeX && (url.origin !== self.location.origin || url.pathname.startsWith("/api/"))) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Fetch application code and configuration first so deployments reach users
  // promptly, with the existing cache retained as an offline fallback.
  if (["/", "/index.html", "/styles.css", "/app.js", "/api-client.js", "/config.js", "/sw.js", "/manifest.webmanifest", "/data/manifest.json"].includes(url.pathname) || isKaTeX) {
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
