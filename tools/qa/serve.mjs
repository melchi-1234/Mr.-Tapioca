// ── Static file server for QA runs ───────────────────────────────────────────
// Zero dependencies. Serves the repo root so the app runs against real relative
// paths, and serves it on an ephemeral port so a stale service worker from a
// previous run on the same port cannot leak in (that trap is documented in
// CLAUDE.md gotcha #2 and has cost real time here before).
import { createServer } from "node:http";
import { createReadStream, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};

export function serve(root, { port = 0 } = {}) {
  const server = createServer((req, res) => {
    let path = decodeURIComponent((req.url || "/").split("?")[0]);
    if (path.endsWith("/")) path += "index.html";
    // normalize + the prefix check together are what keep ".." out of the repo.
    const file = normalize(join(root, path));
    if (!file.startsWith(normalize(root))) {
      res.writeHead(403).end("forbidden");
      return;
    }
    let st;
    try {
      st = statSync(file);
    } catch (e) {
      res.writeHead(404, { "content-type": "text/plain" }).end("not found");
      return;
    }
    if (st.isDirectory()) {
      res.writeHead(302, { location: path + "/" }).end();
      return;
    }
    res.writeHead(200, {
      "content-type": TYPES[extname(file).toLowerCase()] || "application/octet-stream",
      "content-length": st.size,
      // No caching at all: a QA run must see the file on disk right now.
      "cache-control": "no-store, no-cache, must-revalidate",
    });
    createReadStream(file).pipe(res);
  });

  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      const addr = server.address();
      resolve({
        port: addr.port,
        origin: `http://127.0.0.1:${addr.port}`,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}
