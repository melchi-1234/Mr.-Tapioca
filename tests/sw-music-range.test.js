// The service worker's music range handler, exercised for real.
//
// WHY THIS FILE EXISTS: nothing else can see this code. A service worker only
// runs inside a registered worker on a secure origin, it has no console the app
// surfaces, and when it gets a media response wrong the symptom is "the music
// just doesn't play" with no error anywhere. That is the same class of silent
// failure as the SHELL trap in sw.js, and it deserves the same kind of guard.
//
// What makes the handler non-obvious: <audio> asks for BYTE RANGES, and
//   - the Cache API refuses to store a 206 (cache.put throws), so the response
//     handed to us cannot be the one we cache; and
//   - cache.match IGNORES the Range header, so a cached full copy would answer
//     a range request with the whole file and a 200, which Safari rejects while
//     seeking.
// So the worker caches one whole copy and cuts ranges out of it by hand. These
// tests are about that hand-cut arithmetic and the caching side effects.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SW_SRC = fs.readFileSync(path.join(__dirname, "..", "sw.js"), "utf8");
const BODY = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 251));

// A cache that behaves like the real one in the two ways that matter: it keys
// on URL, and it REFUSES a 206 exactly as the Cache API does.
function makeCache() {
  const store = new Map();
  return {
    store,
    puts: 0,
    async match(req) {
      const hit = store.get(typeof req === "string" ? req : req.url);
      return hit ? hit.clone() : undefined;
    },
    async put(req, res) {
      if (res.status === 206) throw new TypeError("Cannot cache response with status 206");
      this.puts++;
      store.set(typeof req === "string" ? req : req.url, res.clone());
    },
  };
}

// Load sw.js into a sandbox with just enough worker globals to evaluate. The
// addEventListener calls at the top level become no-ops; we only want the
// functions the file declares.
function loadSW({ cache, fetchImpl }) {
  const listeners = {};
  const sandbox = {
    self: {
      addEventListener: (t, fn) => { listeners[t] = fn; },
      location: { origin: "https://mrtapioca.me" },
      skipWaiting: () => {},
      clients: { claim: () => {} },
    },
    caches: { open: async () => cache, keys: async () => [], delete: async () => true },
    fetch: fetchImpl,
    Request, Response, Headers, URL, TypeError, console,
  };
  sandbox.self.caches = sandbox.caches;
  vm.createContext(sandbox);
  vm.runInContext(SW_SRC, sandbox);
  // musicResponse is a top-level function declaration, so it is on the context.
  return { musicResponse: sandbox.musicResponse, listeners, sandbox };
}

const URL_M4A = "https://mrtapioca.me/assets/music/night-owl.m4a";
const okBody = () => new Response(BODY, {
  status: 200,
  headers: { "Content-Type": "audio/mp4", "Content-Length": String(BODY.length) },
});

test("a plain (no Range) request is served whole and cached once", async () => {
  const cache = makeCache();
  let fetches = 0;
  const { musicResponse } = loadSW({ cache, fetchImpl: async () => { fetches++; return okBody(); } });

  const first = await musicResponse(new Request(URL_M4A));
  assert.equal(first.status, 200);
  assert.equal(Buffer.from(await first.arrayBuffer()).length, BODY.length);
  assert.equal(fetches, 1);
  assert.equal(cache.puts, 1);

  // Second time it must come out of the cache, not the network. This is the
  // whole point: session two has music with no signal.
  const second = await musicResponse(new Request(URL_M4A));
  assert.equal(second.status, 200);
  assert.equal(fetches, 1, "a cached track must not be refetched");
});

test("a Range request gets a real 206 with the right slice and headers", async () => {
  const cache = makeCache();
  const { musicResponse } = loadSW({ cache, fetchImpl: async () => okBody() });

  const res = await musicResponse(new Request(URL_M4A, { headers: { Range: "bytes=100-199" } }));
  assert.equal(res.status, 206, "Safari will not seek against a 200");
  assert.equal(res.headers.get("Content-Range"), `bytes 100-199/${BODY.length}`);
  assert.equal(res.headers.get("Content-Length"), "100");
  assert.equal(res.headers.get("Accept-Ranges"), "bytes");
  const got = Buffer.from(await res.arrayBuffer());
  assert.equal(got.length, 100);
  assert.deepEqual(got, BODY.subarray(100, 200), "wrong bytes = audible corruption, not an error");
});

test("an open-ended range runs to the last byte", async () => {
  const cache = makeCache();
  const { musicResponse } = loadSW({ cache, fetchImpl: async () => okBody() });

  // This is the shape a media element actually opens with: bytes=0-
  const res = await musicResponse(new Request(URL_M4A, { headers: { Range: "bytes=0-" } }));
  assert.equal(res.status, 206);
  assert.equal(res.headers.get("Content-Range"), `bytes 0-${BODY.length - 1}/${BODY.length}`);
  assert.equal(Buffer.from(await res.arrayBuffer()).length, BODY.length);
});

test("a suffix range (bytes=-N) returns the LAST N bytes", async () => {
  const cache = makeCache();
  const { musicResponse } = loadSW({ cache, fetchImpl: async () => okBody() });

  const res = await musicResponse(new Request(URL_M4A, { headers: { Range: "bytes=-50" } }));
  assert.equal(res.status, 206);
  assert.equal(res.headers.get("Content-Range"), `bytes 950-999/${BODY.length}`);
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), BODY.subarray(950));
});

test("a range past the end is a 416, not a truncated body", async () => {
  const cache = makeCache();
  const { musicResponse } = loadSW({ cache, fetchImpl: async () => okBody() });

  const res = await musicResponse(new Request(URL_M4A, { headers: { Range: "bytes=5000-6000" } }));
  assert.equal(res.status, 416);
  assert.equal(res.headers.get("Content-Range"), `bytes */${BODY.length}`);
});

test("an end past EOF is clamped instead of over-reporting the length", async () => {
  const cache = makeCache();
  const { musicResponse } = loadSW({ cache, fetchImpl: async () => okBody() });

  const res = await musicResponse(new Request(URL_M4A, { headers: { Range: "bytes=900-99999" } }));
  assert.equal(res.status, 206);
  assert.equal(res.headers.get("Content-Range"), `bytes 900-999/${BODY.length}`);
  assert.equal(res.headers.get("Content-Length"), "100");
});

test("the cached copy is a FULL 200, never the 206 we answered with", async () => {
  // The trap: caching the response we hand back would throw, and swallowing
  // that throw would mean the track is refetched on every single range request.
  const cache = makeCache();
  let fetches = 0;
  const { musicResponse } = loadSW({ cache, fetchImpl: async () => { fetches++; return okBody(); } });

  await musicResponse(new Request(URL_M4A, { headers: { Range: "bytes=0-9" } }));
  await musicResponse(new Request(URL_M4A, { headers: { Range: "bytes=10-19" } }));
  await musicResponse(new Request(URL_M4A, { headers: { Range: "bytes=20-29" } }));

  assert.equal(fetches, 1, "one network fetch should serve every later range");
  assert.equal(cache.store.size, 1);
  assert.equal(cache.store.get(URL_M4A).status, 200);
});

test("a 404 falls through to the network and poisons nothing", async () => {
  const cache = makeCache();
  const { musicResponse } = loadSW({
    cache,
    fetchImpl: async () => new Response("nope", { status: 404 }),
  });

  const res = await musicResponse(new Request(URL_M4A));
  assert.equal(res.status, 404);
  assert.equal(cache.store.size, 0, "a missing track must never be cached as if it were real");
});

test("a network failure surfaces rather than hanging the element", async () => {
  const cache = makeCache();
  let call = 0;
  const { musicResponse } = loadSW({
    cache,
    fetchImpl: async () => { if (++call === 1) throw new Error("offline"); return okBody(); },
  });

  // First fetch throws (offline, nothing cached); the handler retries the
  // original request so the element gets a real answer either way.
  const res = await musicResponse(new Request(URL_M4A));
  assert.equal(res.status, 200);
});

test("MUSIC_CACHE survives an activate that clears old shell caches", async () => {
  // The release path deletes every cache that is not the current CACHE. If the
  // music cache is not exempted, every release throws 23 MB of audio away and
  // the next session redownloads all of it.
  const deleted = [];
  const sandbox = {
    self: { addEventListener: (t, fn) => { sandbox._on = sandbox._on || {}; sandbox._on[t] = fn; },
            location: { origin: "https://mrtapioca.me" }, skipWaiting: () => {},
            clients: { claim: () => {} } },
    caches: {
      open: async () => makeCache(),
      keys: async () => ["mr-tapioca-v9", "mr-tapioca-v193", "mr-tapioca-v194", "mr-tapioca-v195", "mr-tapioca-music-v1"],
      delete: async (k) => { deleted.push(k); return true; },
    },
    fetch: async () => okBody(),
    Request, Response, Headers, URL, TypeError, console,
  };
  vm.createContext(sandbox);
  vm.runInContext(SW_SRC, sandbox);

  let waited;
  await sandbox._on.activate({ waitUntil: (p) => { waited = p; } });
  await waited;

  // `const` at a script's top level does NOT land on the context object, so
  // read the value back through the context or this assertion is vacuous.
  const musicCache = vm.runInContext("MUSIC_CACHE", sandbox);
  assert.equal(musicCache, "mr-tapioca-music-v1");
  assert.deepEqual(deleted, ["mr-tapioca-v9", "mr-tapioca-v193", "mr-tapioca-v195"],
    "only stale shell caches should be dropped");
  assert.ok(!deleted.includes(musicCache), "the music cache must survive a release");
});

test("no music file is listed in SHELL", async () => {
  // SHELL is precached on install with no catch, on purpose. Putting 23 MB of
  // audio in there would block every fresh install on a 23 MB download and turn
  // one bad track into an app-wide update freeze.
  const cache = makeCache();
  const { sandbox } = loadSW({ cache, fetchImpl: async () => okBody() });
  const shell = vm.runInContext("SHELL", sandbox);   // `const`, so read it back out
  assert.ok(Array.isArray(shell) && shell.length > 10, "SHELL should be the real precache list");
  const music = shell.filter((p) => p.includes("assets/music/"));
  assert.deepEqual(music, [], "focus tunes belong in MUSIC_CACHE, never in SHELL");
});
