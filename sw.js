// Mr. Tapioca service worker — makes the app installable and usable offline.
// Bump CACHE on every release so installed users get the new app shell
// (cache-first would otherwise serve them the old index/app.js/styles forever).
//
// EVERY PATH IN SHELL MUST EXIST. install has no catch on purpose (see below),
// so one missing file makes cache.addAll reject, the new worker never activates,
// and every user silently keeps the OLD cache — updates stop shipping with no
// error anywhere. That happened: assets/Bed.png was deleted and left listed
// here, which pinned clients to pre-rebuild art. tools/check-shell.py guards it.
const CACHE = "mr-tapioca-v168";

// Core app shell precached on install so the app boots with no network.
const SHELL = [
  "./",
  "index.html",
  "styles.css",
  "config.js",
  "squad-cloud.js",
  "metrics.js",
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
  "assets/Bedroom Background.png",
  "assets/bed-back.png",
  "assets/bed-front.png",
  /* Ambient weather + window light (drawn, Aug 2026). Precached with the
     rest of the shell: they are part of how the app LOOKS at rest, so a
     cold offline launch must not fall back to a dead scene. 155KB total. */
  "assets/fx-rays.webp",
  "assets/fx-dust.webp",
  "assets/fx-sparkle.webp",
  "assets/fx-bokeh.webp",
  "assets/fx-steam.webp",
  "assets/fx-rain.webp",
  "assets/fx-petals.webp",
  "assets/fx-leaves.webp",
  "assets/fx-snow.webp",
  "assets/counter-wood.png",
  "assets/floor-boards.png",
  "assets/break-desk.png",
  "assets/tile-catch.jpg",
  "assets/tile-plinko.jpg",
  "assets/tile-pong.jpg",
  "assets/counter-straws.png",
  "assets/counter-plant.png",
  "assets/poses/base-idle.png",
  "assets/poses/base-mixing.png",
  "assets/poses/base-sleeping.png",
  "assets/poses/base-shocked.png",
  "assets/pong-board.jpg",
  "assets/catch-board.jpg",
  "assets/plinko-board.png",
  "assets/icon-192.png",
  "assets/icon-512.png",
  "assets/apple-touch-icon.png",
  "assets/vendor/leaflet/leaflet.js",
  "assets/vendor/leaflet/leaflet.css",
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

// Same-origin GETs only, cache-first from the versioned precache; misses are
// fetched and cached as used. Release updates arrive atomically via the CACHE
// version bump (see the fetch comment below).
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;

  const cacheCopy = (res) => {
    if (res && res.status === 200 && res.type === "basic") {
      const copy = res.clone();
      caches.open(CACHE).then((cache) => cache.put(req, copy));
    }
    return res;
  };

  // Cache-first for EVERYTHING, no background rewrites. Why: refreshing shell
  // files one-at-a-time into a live cache created a MIXED-VERSION app (new
  // index.html + old app.js) that then boots offline forever. Updates ship
  // atomically instead: every release bumps CACHE, install precaches the whole
  // shell fresh (cache:"no-cache"), activate swaps it in one piece.
  // ignoreSearch: an app URL carrying a query string (?utm=..., share-link
  // redirects) must still hit the cached shell when offline.
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cached) =>
      cached || fetch(req).then(cacheCopy).catch(() => cached))
  );
});
