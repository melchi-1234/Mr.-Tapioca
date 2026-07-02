// Mr. Tapioca service worker — makes the app installable and usable offline.
// Bump CACHE on every release so installed users get the new app shell
// (cache-first would otherwise serve them the old index/app.js/styles forever).
const CACHE = "mr-tapioca-v78";

// Core app shell precached on install so the app boots with no network.
const SHELL = [
  "./",
  "index.html",
  "styles.css",
  "config.js",
  "squad-cloud.js",
  "app.js",
  "manifest.json",
  "assets/Mr. Tapioca.png",
  "assets/Cup.png",
  "assets/Tapioca Currency.png",
  "assets/Background.png",
  "assets/Shop Background.png",
  "assets/Shop Background Night.png",
  "assets/Shop Background Sakura.png",
  "assets/Shop Background Autumn.png",
  "assets/Shop Background Rainy.png",
  "assets/Shop Background Winter.png",
  "assets/Shop Background Galaxy.png",
  "assets/Shop Background Break.png",
  "assets/Bed.png",
  "assets/sprites/sprites.json",
  "assets/sprites/base/idle.png",
  "assets/sprites/base/sleeping.png",
  "assets/Pong Background.png",
  "assets/Catch Background.png",
  "assets/Plinko Background.png",
  "assets/icon-192.png",
  "assets/icon-512.png",
  "assets/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  // NO trailing catch here — that's load-bearing. If any SHELL fetch fails,
  // the install must FAIL so the browser keeps the old worker + old complete
  // cache and retries later. Swallowing the error would mark a broken worker
  // "installed", and activate would then delete the last good cache — bricking
  // offline boot. cache:"no-cache" skips the HTTP cache so a fresh deploy
  // can't bake stale mixed-version files into a new cache.
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL.map((u) => new Request(u, { cache: "no-cache" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Same-origin GETs only. The app shell (navigations + html/js/css) uses
// stale-while-revalidate so it loads instantly from cache yet refreshes in the
// background — installed users pick up new releases without a hard reload.
// Everything else (images, etc.) is cache-first and cached as used.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;

  const path = new URL(req.url).pathname;
  const isShell = req.mode === "navigate" || path.endsWith("/") || /\.(html|js|css)$/.test(path);

  const cacheCopy = (res) => {
    if (res && res.status === 200 && res.type === "basic") {
      const copy = res.clone();
      caches.open(CACHE).then((cache) => cache.put(req, copy));
    }
    return res;
  };

  if (isShell) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req).then(cacheCopy).catch(() => cached);
        return cached || network;   // instant cache, refresh behind the scenes
      })
    );
  } else {
    event.respondWith(
      caches.match(req).then((cached) =>
        cached || fetch(req).then(cacheCopy).catch(() => cached))
    );
  }
});
