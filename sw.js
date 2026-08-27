// Mr. Tapioca service worker — makes the app installable and usable offline.
// Bump CACHE on every release so installed users get the new app shell
// (cache-first would otherwise serve them the old index/app.js/styles forever).
//
// EVERY PATH IN SHELL MUST EXIST. install has no catch on purpose (see below),
// so one missing file makes cache.addAll reject, the new worker never activates,
// and every user silently keeps the OLD cache — updates stop shipping with no
// error anywhere. That happened: assets/Bed.png was deleted and left listed
// here, which pinned clients to pre-rebuild art. tools/check-shell.py guards it.
const CACHE = "mr-tapioca-v223";

// Focus-tune audio lives in its OWN cache, on purpose, and is deliberately NOT
// in SHELL below. Two reasons, both learned the hard way:
//   1. SHELL is precached on install with no catch. 23 MB of music in there
//      means every fresh install blocks on a 23 MB download, and one bad file
//      makes cache.addAll reject and stops updates shipping app-wide.
//   2. This cache is never version-stamped, so a release that bumps CACHE does
//      not throw the music away and make every user redownload it. Tracks land
//      here the first time they are played and stay offline-ready after that.
// Bump MUSIC_CACHE only if a track's CONTENTS change under the same filename.
const MUSIC_CACHE = "mr-tapioca-music-v1";

// Core app shell precached on install so the app boots with no network.
const SHELL = [
  "app.html",
  "styles.css",
  "config.js",
  "squad-cloud.js",
  "metrics.js",
  "analytics.js",
  "notifications.js",
  "reward-config.js",
  "reward-v2.js",
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
  /* Animated window layers (Taro Galaxy). The room plate has its glass cut
     out and the spiral turns behind it. */
  "assets/bg-galaxy-front.webp",
  "assets/win-galaxy.webp",
  "assets/win-galaxy.mp4",
  "assets/win-mask-galaxy.webp",
  /* Animated window layers (Winter/Library/Sunset, Aug 2026). Winter and
     library are CSS-only (no video, no poster webp — .win-fx reuses the
     fx-snow/fx-dust sheets already listed above), so only their front plate +
     mask are new files. Sunset has a real video like galaxy. */
  "assets/bg-winter-front.webp",
  "assets/win-mask-winter.webp",
  "assets/bg-library-front.webp",
  "assets/win-mask-library.webp",
  "assets/bg-sunset-front.webp",
  "assets/win-mask-sunset.webp",
  "assets/win-sunset.webp",
  "assets/win-sunset.mp4",
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
  "assets/poses/grad-cap-idle.png",
  "assets/poses/grad-cap-mixing.png",
  "assets/poses/grad-cap-sleeping.png",
  "assets/poses/grad-cap-shocked.png",
  "assets/poses/flower-idle.png",
  "assets/poses/flower-mixing.png",
  "assets/poses/flower-sleeping.png",
  "assets/poses/flower-shocked.png",
  "assets/poses/scarf-idle.png",
  "assets/poses/scarf-mixing.png",
  "assets/poses/scarf-sleeping.png",
  "assets/poses/scarf-shocked.png",
  "assets/poses/shades-idle.png",
  "assets/poses/shades-mixing.png",
  "assets/poses/shades-sleeping.png",
  "assets/poses/shades-shocked.png",
  "assets/poses/strawberry-idle.png",
  "assets/poses/strawberry-mixing.png",
  "assets/poses/strawberry-sleeping.png",
  "assets/poses/strawberry-shocked.png",
  "assets/poses/astro-blue-idle.png",
  "assets/poses/astro-blue-mixing.png",
  "assets/poses/astro-blue-sleeping.png",
  "assets/poses/astro-blue-shocked.png",
  "assets/poses/dragon-idle.png",
  "assets/poses/dragon-mixing.png",
  "assets/poses/dragon-sleeping.png",
  "assets/poses/dragon-shocked.png",
  "assets/poses/cat-hoodie-idle.png",
  "assets/poses/cat-hoodie-mixing.png",
  "assets/poses/cat-hoodie-sleeping.png",
  "assets/poses/cat-hoodie-shocked.png",
  "assets/poses/royal-idle.png",
  "assets/poses/royal-mixing.png",
  "assets/poses/royal-sleeping.png",
  "assets/poses/royal-shocked.png",
  "assets/poses/ninja-idle.png",
  "assets/poses/ninja-mixing.png",
  "assets/poses/ninja-sleeping.png",
  "assets/poses/ninja-shocked.png",
  "assets/poses/angel-idle.png",
  "assets/poses/angel-mixing.png",
  "assets/poses/angel-sleeping.png",
  "assets/poses/angel-shocked.png",
  "assets/poses/devil-idle.png",
  "assets/poses/devil-mixing.png",
  "assets/poses/devil-sleeping.png",
  "assets/poses/devil-shocked.png",
  "assets/poses/wizard-idle.png",
  "assets/poses/wizard-mixing.png",
  "assets/poses/wizard-sleeping.png",
  "assets/poses/wizard-shocked.png",
  "assets/pong-board.jpg",
  "assets/catch-board.jpg",
  "assets/plinko-board.png",
  "assets/icon-192.png",
  "assets/icon-512.png",
  "assets/apple-touch-icon.png",
  "assets/vendor/leaflet/leaflet.js",
  "assets/vendor/leaflet/leaflet.css",
];

// Media elements ask for BYTE RANGES, and that breaks the ordinary cache-first
// shape in two separate ways:
//   - the Cache API refuses to store a 206 (cache.put throws a TypeError), so
//     caching the response we were handed is not an option; and
//   - cache.match ignores the Range header, so a cached full copy would answer
//     a range request with the whole file and a 200, which Safari rejects while
//     seeking.
// So: always fetch and cache the WHOLE file once, then cut ranges out of that
// copy by hand and answer with a real 206.
async function musicResponse(req) {
  const whole = new Request(req.url);   // strip Range so we cache a full copy
  let cache, full;
  try {
    cache = await caches.open(MUSIC_CACHE);
    full = await cache.match(whole);
  } catch (e) { /* storage unavailable — fall through to the network */ }
  if (!full) {
    let res;
    try { res = await fetch(whole); } catch (e) { return fetch(req); }
    if (!res || res.status !== 200) return fetch(req);
    if (cache) { try { await cache.put(whole, res.clone()); } catch (e) {} }
    full = res;
  }
  const range = req.headers.get("range");
  if (!range) return full;
  const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  const buf = await full.arrayBuffer();
  if (!m) return new Response(buf, { status: 200, headers: full.headers });
  const size  = buf.byteLength;
  const start = m[1] ? parseInt(m[1], 10) : (m[2] ? size - parseInt(m[2], 10) : 0);
  const end   = (m[1] && m[2]) ? parseInt(m[2], 10) : size - 1;
  if (!(start >= 0 && start < size)) {
    return new Response(null, { status: 416, headers: { "Content-Range": "bytes */" + size } });
  }
  const stop = Math.min(end, size - 1);
  return new Response(buf.slice(start, stop + 1), {
    status: 206,
    headers: {
      "Content-Type":   full.headers.get("Content-Type") || "audio/mp4",
      "Content-Length": String(stop - start + 1),
      "Content-Range":  "bytes " + start + "-" + stop + "/" + size,
      "Accept-Ranges":  "bytes",
    },
  });
}

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
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE && k !== MUSIC_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Same-origin GETs only, cache-first from the versioned precache; misses are
// fetched and cached as used. Release updates arrive atomically via the CACHE
// version bump (see the fetch comment below).
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  // partners.json is LIVE DATA, not shell. Everything below is cache-first with
  // ignoreSearch, which would pin the first copy forever and make a cache-buster
  // useless, so a shop signed today would never reach anyone already installed.
  // Leave it to the network (GitHub Pages serves it with max-age=600).
  if (url.pathname.endsWith("/partners.json")) return;

  // The landing + download pages are marketing, and privacy.html / support.html
  // are legal pages that MUST match the published App Privacy labels. None are
  // app shell, so serve them fresh from the network so edits appear immediately,
  // with no cache-bump dance and no stale copy pinned in the cache. Otherwise a
  // returning visitor who already cached one keeps the old text until an
  // unrelated release bumps CACHE. Same reasoning as partners.json.
  if (url.pathname === "/" || url.pathname.endsWith("/index.html")
      || url.pathname.endsWith("/chrome.html")
      || url.pathname.endsWith("/privacy.html")
      || url.pathname.endsWith("/support.html")) return;

  // Focus tunes: cache-first out of the long-lived music cache, stored on first
  // play, so the second session onward has music with no network. Kept out of
  // the versioned shell cache so a release does not evict 23 MB of audio.
  if (url.pathname.includes("/assets/music/")) {
    event.respondWith(musicResponse(req));
    return;
  }

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
