const test = require("node:test");
const assert = require("node:assert/strict");
const { createServer } = require("node:net");
const { resolve } = require("node:path");
const { pathToFileURL } = require("node:url");

const ROOT = resolve(__dirname, "..");

function freePort() {
  return new Promise((resolvePort, reject) => {
    const socket = createServer();
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", () => {
      const { port } = socket.address();
      socket.close((error) => error ? reject(error) : resolvePort(port));
    });
  });
}

test("secondary phone controls keep a 44-point target and the page declares an icon", { timeout: 30_000 }, async () => {
  const { serve } = await import(pathToFileURL(resolve(ROOT, "tools", "qa", "serve.mjs")));
  const { launchChrome, Page } = await import(pathToFileURL(resolve(ROOT, "tools", "qa", "cdp.mjs")));
  const server = await serve(ROOT);
  const port = await freePort();
  const chrome = await launchChrome({ port, width: 375, height: 667 });
  let page;

  try {
    page = await Page.open(chrome.port, { width: 375, height: 667, scale: 1 });
    page.port = chrome.port;
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: "localStorage.clear();" });
    await page.goto(`${server.origin}/index.html`, { waitMs: 350 });
    const metrics = await page.eval(`(() => {
      const rect = (selector) => {
        const r = document.querySelector(selector).getBoundingClientRect();
        return { width:r.width, height:r.height };
      };
      const prompt = document.querySelector("#blockPrompt");
      prompt.showModal();
      const never = rect("#blockNeverBtn");
      prompt.close();
      document.querySelector("#settingsSheet").classList.remove("hidden");
      document.querySelector("#notifyRow").classList.remove("hidden");
      const toggle = document.querySelector("#notifyDoneToggle");
      const toggleTarget = getComputedStyle(toggle, "::after");
      return {
        onboardSkip: rect("#onboardSkip"),
        blockNever: never,
        notifyToggle: rect("#notifyDoneToggle"),
        notifyTarget: {
          width: parseFloat(toggleTarget.width),
          height: parseFloat(toggleTarget.height),
        },
        icon: document.querySelector('link[rel="icon"]')?.getAttribute("href") || "",
      };
    })()`);

    assert.ok(metrics.onboardSkip.height >= 44, `onboarding Skip is ${metrics.onboardSkip.height}px high`);
    assert.ok(metrics.blockNever.height >= 44, `Don't ask again is ${metrics.blockNever.height}px high`);
    assert.ok(metrics.notifyTarget.width >= 44 && metrics.notifyTarget.height >= 44,
      `notification toggle target is ${metrics.notifyTarget.width}x${metrics.notifyTarget.height}px`);
    assert.equal(metrics.icon, "assets/icon-192.png");
  } finally {
    if (page) await page.close();
    chrome.close();
    await server.close();
  }
});
