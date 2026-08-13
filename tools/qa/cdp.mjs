// ── A tiny Chrome DevTools Protocol client ───────────────────────────────────
// Visual QC used to mean "install puppeteer". This does the same job with zero
// dependencies: Node 22 ships a WebSocket client, and Chrome ships a debugging
// endpoint, so the whole driver is one file. Nothing here is Mr. Tapioca
// specific — capture.mjs holds the scenarios.
//
// Why not puppeteer-core: adding a dependency to a repo that has deliberately
// never had a build step is a cost that outlives the screenshots.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME =
  process.env.CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Chrome writes the debugging port to stdout, but polling /json/version is the
// version-proof way to know it is actually accepting connections.
async function waitForPort(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) return await r.json();
    } catch (e) {
      /* not up yet */
    }
    await sleep(120);
  }
  throw new Error(`Chrome debugging port ${port} never opened`);
}

export async function launchChrome({ port = 9333, width = 375, height = 812 } = {}) {
  const profile = mkdtempSync(join(tmpdir(), "mrtap-qa-"));
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "--headless=new",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-background-networking",
    // A deterministic clock is not available, but a deterministic viewport is.
    `--window-size=${width},${height}`,
    "about:blank",
  ];
  const proc = spawn(CHROME, args, { stdio: "ignore", detached: false });
  await waitForPort(port);
  return {
    port,
    close() {
      try { proc.kill("SIGTERM"); } catch (e) {}
      try { rmSync(profile, { recursive: true, force: true }); } catch (e) {}
    },
  };
}

// One page = one websocket. Commands are id-matched; events are dispatched to
// listeners so callers can await things like Page.loadEventFired.
export class Page {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Map();
    ws.addEventListener("message", (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (msg.id != null && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        else resolve(msg.result);
      } else if (msg.method) {
        const ls = this.listeners.get(msg.method);
        if (ls) for (const fn of ls.slice()) fn(msg.params);
      }
    });
  }

  static async open(port, { width = 375, height = 812, scale = 2 } = {}) {
    const r = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" });
    const target = await r.json();
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve, { once: true });
      ws.addEventListener("error", reject, { once: true });
    });
    const page = new Page(ws);
    page.targetId = target.id;
    await page.send("Page.enable");
    await page.send("Runtime.enable");
    await page.setViewport(width, height, scale);
    return page;
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, fn) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(fn);
    return () => {
      const ls = this.listeners.get(method) || [];
      const i = ls.indexOf(fn);
      if (i >= 0) ls.splice(i, 1);
    };
  }

  // deviceScaleFactor 2 gives retina-sharp screenshots; mobile:true makes media
  // queries and touch behave like the phone the app is actually used on.
  setViewport(width, height, scale = 2, mobile = width < 768) {
    return this.send("Emulation.setDeviceMetricsOverride", {
      width, height, deviceScaleFactor: scale, mobile,
      screenWidth: width, screenHeight: height,
    });
  }

  async goto(url, { waitMs = 0 } = {}) {
    const loaded = new Promise((resolve) => {
      const off = this.on("Page.loadEventFired", () => { off(); resolve(); });
    });
    await this.send("Page.navigate", { url });
    await loaded;
    if (waitMs) await sleep(waitMs);
  }

  // Runs in the page and returns a JSON-safe value. Throws page exceptions
  // rather than swallowing them: a silently failing seed script is how a QA run
  // ends up screenshotting the wrong state and calling it a pass.
  async eval(fn, ...args) {
    const src = typeof fn === "string"
      ? fn
      : `(${fn.toString()})(${args.map((a) => JSON.stringify(a)).join(",")})`;
    const res = await this.send("Runtime.evaluate", {
      expression: src,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (res.exceptionDetails) {
      const e = res.exceptionDetails;
      throw new Error(
        `page exception: ${e.exception?.description || e.text || "unknown"}`
      );
    }
    return res.result?.value;
  }

  // Console + page errors, so a screenshot run can fail loudly on a JS error
  // instead of quietly capturing a half-rendered screen.
  collectErrors() {
    const errors = [];
    this.send("Log.enable").catch(() => {});
    this.on("Runtime.exceptionThrown", (p) => {
      errors.push(p?.exceptionDetails?.exception?.description || p?.exceptionDetails?.text || "exception");
    });
    this.on("Runtime.consoleAPICalled", (p) => {
      if (p.type === "error") {
        errors.push("console.error: " + (p.args || []).map((a) => a.value ?? a.description ?? "").join(" "));
      }
    });
    return errors;
  }

  async screenshot(path, { fullPage = false } = {}) {
    const params = { format: "png", captureBeyondViewport: fullPage };
    const res = await this.send("Page.captureScreenshot", params);
    const { writeFileSync } = await import("node:fs");
    const buf = Buffer.from(res.data, "base64");
    writeFileSync(path, buf);
    return buf.length;
  }

  async click(selector) {
    const box = await this.eval(
      `(() => { const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return null; const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`
    );
    if (!box) throw new Error(`click target not found: ${selector}`);
    for (const type of ["mousePressed", "mouseReleased"]) {
      await this.send("Input.dispatchMouseEvent", {
        type, x: box.x, y: box.y, button: "left", clickCount: 1,
      });
    }
    await sleep(120);
  }

  async close() {
    try { await fetch(`http://127.0.0.1:${this.port}/json/close/${this.targetId}`); } catch (e) {}
    try { this.ws.close(); } catch (e) {}
  }
}

export { sleep };
