const CACHE = "seomtorch-v122";
const APP_ASSETS = [
  "./",
  "index.html",
  "styles.css",
  "app.js",
  "calculator.js",
  "api-client.js",
  "manifest.webmanifest",
  "assets/avatars/varsity-male.webp",
  "assets/avatars/varsity-female.webp",
  "assets/avatars/scholar-female.webp",
  "assets/avatars/scholar-male.webp",
  "assets/avatars/audio-male.webp",
  "assets/avatars/audio-female.webp",
  "assets/avatars/medic-female.webp",
  "assets/avatars/medic-male.webp",
  "assets/avatars/hijab-female.webp",
  "assets/seomtorch_logo.png",
  "config.js",
  "data/manifest.json",
  "data/university/index.json",
  "data/university/anatomy/meta.json",
  "data/university/anatomy/200/courses.json",
  "data/university/anatomy/200/ana201.json",
  "data/university/anatomy/200/notes-ana201-upper-limb.json",
  "assets/notes/ana201-upper-limb/block-01.webp",
  "assets/notes/ana201-upper-limb/block-02.webp",
  "assets/notes/ana201-upper-limb/block-03.webp",
  "assets/notes/ana201-upper-limb/block-04.webp",
  "assets/notes/ana201-upper-limb/block-05.webp",
  "assets/notes/ana201-upper-limb/block-06.webp",
  "assets/notes/ana201-upper-limb/block-07.webp",
  "assets/notes/ana201-upper-limb/block-08.webp",
  "assets/notes/ana201-upper-limb/block-09.webp",
  "assets/notes/ana201-upper-limb/block-10.webp",
  "assets/notes/ana201-upper-limb/block-11.webp",
  "assets/notes/ana201-upper-limb/block-12.webp",
  "assets/notes/ana201-upper-limb/block-13.webp",
  "assets/notes/ana201-upper-limb/block-14.webp",
  "assets/notes/ana201-upper-limb/block-15.webp",
  "assets/notes/ana201-upper-limb/block-16.webp",
  "assets/notes/ana201-upper-limb/block-17.webp",
  "data/university/anatomy/200/questions-ana201-muscles.json",
  "data/university/anatomy/200/questions-ana201-bones.json",
  "data/university/anatomy/200/questions-ana201-brachial-plexus.json",
  "data/university/anatomy/200/questions-ana201-joints.json",
  "data/university/anatomy/200/questions-ana201-anatomical-snuffbox.json",
  "data/university/anatomy/200/questions-ana201-cubital-carpal.json",
  "data/university/anatomy/200/questions-ana201-blood-supply.json",
  "data/university/anatomy/200/questions-ana201-axilla.json",
  "data/university/anatomy/200/questions-ana201-bones-lower-limb.json",
  "data/university/anatomy/200/questions-ana201-joints-lower-limb.json",
  "data/university/anatomy/200/questions-ana201-muscles-lower-limb.json",
  "data/university/anatomy/200/questions-ana201-popliteal-fossa.json",
  "data/university/anatomy/200/questions-ana201-femoral-triangle.json",
  "data/university/anatomy/200/questions-ana201-arches-walking-gait.json",
  "data/university/anatomy/200/questions-ana201-innervations-lower-limb.json",
  "data/university/anatomy/200/questions-ana201-blood-supply-lower-limb.json",
  "data/university/anatomy/200/ana202.json",
  "data/university/anatomy/200/ana203.json",
  "data/university/anatomy/200/questions-ana203-male-female-gamete.json",
  "data/university/anatomy/200/questions-ana203-spermatogenesis.json",
  "data/university/anatomy/200/questions-ana203-oogenesis.json",
  "data/university/anatomy/200/questions-ana203-ovarian-menstrual-cycle.json",
  "data/university/anatomy/200/questions-ana203-week-one.json",
  "data/university/anatomy/200/questions-ana203-week-two.json",
  "data/university/anatomy/200/questions-ana203-week-three.json",
  "data/university/anatomy/200/questions-ana203-week-four-to-eight.json",
  "data/university/anatomy/200/questions-ana203-cardiovascular-system.json",
  "data/university/anatomy/200/questions-ana203-urogenital-system.json",
  "data/university/anatomy/200/questions-ana203-gastrointestinal-system.json",
  "data/university/physiology/meta.json",
  "data/university/physiology/200/courses.json",
  "data/university/physiology/200/pio201.json",
  "data/university/physiology/200/questions-pio201-transport-homeostasis.json",
  "data/questions.json",
  "data/questions-biology.json",
  "data/questions-chemistry.json",
  "data/questions-civic-education.json",
  "data/questions-computer-studies.json",
  "data/questions-economics.json",
  "data/questions-english.json",
  "data/questions-further-mathematics.json",
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
