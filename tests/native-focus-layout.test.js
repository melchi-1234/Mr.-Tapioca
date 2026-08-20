const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { createServer } = require("node:net");
const { resolve } = require("node:path");
const { pathToFileURL } = require("node:url");

const ROOT = resolve(__dirname, "..");
const SCREENSHOT = "/tmp/mr-tapioca-native-focus-layout.png";
const CHECKER = resolve(ROOT, "tools", "check-key-color-art.py");

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

function near(actual, expected, tolerance = 2) {
  return Math.abs(actual - expected) <= tolerance;
}

function nativeBootHook({ name = "Melchi", safeBottom = 0 } = {}) {
  return `
    (() => {
      const shield = {
        starts: 0,
        async status() { return { authorized: true, hasSelection: true, defeated: false }; },
        async startBlocking() { this.starts++; return { active: true }; },
        async stopBlocking() { return {}; },
      };
      Object.defineProperty(window, "MRTAP_CLOUD", {
        value: {}, writable: false, configurable: false,
      });
      Object.defineProperty(window, "Capacitor", {
        value: {
          isNativePlatform: () => true,
          registerPlugin: (pluginName) => pluginName === "FocusShield" ? shield : null,
          Plugins: {},
        },
        configurable: false,
      });
      Object.defineProperty(window, "__qaFocusShield", { value: shield });
      try {
        if (navigator.serviceWorker) {
          Object.defineProperty(navigator.serviceWorker, "register", {
            value: () => Promise.reject(new Error("QA: service worker disabled")),
            configurable: true,
          });
        }
      } catch (_) {}
      localStorage.clear();
      const seed = {
        bobaFocusOnboarded: "true",
        bobaFocusTourDone: "1",
        bobaFocusTourOffered: "1",
        bobaFocusSkin: "angel",
        bobaFocusName: ${JSON.stringify(name)},
        bobaFocusMode: "custom",
        bobaFocusCustomDuration: "1800",
        bobaFocusBase: "classic",
        bobaFocusTopping: "pearls",
        bobaFocusTheme: "cozy",
        bobaFocusMusicVol: "0",
        bobaFocusSfxVol: "0",
      };
      for (const [key, value] of Object.entries(seed)) localStorage.setItem(key, value);
    })();
  `;
}

test("440x956 native Angel focus scene is composed and aligned", { timeout: 30_000 }, async () => {
  const { serve } = await import(pathToFileURL(resolve(ROOT, "tools", "qa", "serve.mjs")));
  const { launchChrome, Page, sleep } = await import(pathToFileURL(resolve(ROOT, "tools", "qa", "cdp.mjs")));
  const server = await serve(ROOT);
  const port = await freePort();
  const chrome = await launchChrome({ port, width: 440, height: 956 });
  let page;

  try {
    page = await Page.open(chrome.port, { width: 440, height: 956, scale: 3 });
    page.port = chrome.port;
    const errors = page.collectErrors();
    const bootHook = nativeBootHook();
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: bootHook });
    await page.goto(`${server.origin}/app.html`, { waitMs: 600 });
    await page.eval(`(() => {
      const style = document.createElement("style");
      style.textContent = "*,*::before,*::after{animation:none!important;transition:none!important}";
      document.head.append(style);
      return true;
    })()`);

    await page.click("#startPauseBtn");
    await sleep(1_350);
    await page.eval(`(() => {
      state.elapsed = modeDuration() * 0.4;
      state.lastTick = Date.now();
      updateCup();
      return document.fonts.ready.then(() => true);
    })()`);
    await sleep(250);

    const layout = await page.eval(`(() => {
      const rect = (selector) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const r = element.getBoundingClientRect();
        return {
          left: r.left, top: r.top, right: r.right, bottom: r.bottom,
          width: r.width, height: r.height,
          cx: r.left + r.width / 2,
        };
      };
      const nav = [...document.querySelectorAll(".bottom-bar .icon-pill")];
      return {
        viewport: { width: innerWidth, height: innerHeight },
        running: state.running,
        skin: state.skin,
        progress: progress(),
        sceneClasses: document.querySelector("#shopScene").className,
        controlClasses: document.querySelector("#focusControls").className,
        makerState: document.querySelector("#focusMakerCharacter").dataset.state,
        makerSrc: document.querySelector("#focusMakerCharacter").getAttribute("src"),
        startLabel: document.querySelector("#startPauseBtn").textContent.trim(),
        blockLabel: document.querySelector("#blockPillLabel").textContent.trim(),
        shieldStarts: window.__qaFocusShield.starts,
        hudName: rect("#hudName"),
        timer: rect("#timerCard"),
        start: rect("#startPauseBtn"),
        reset: rect("#resetBtn"),
        block: rect("#blockPill"),
        blockIcon: rect("#blockPill .block-pill-ico"),
        blockText: rect("#blockPillLabel"),
        blockChevron: rect("#blockPill .block-pill-chev"),
        counter: rect(".work-counter"),
        firstNav: nav.length ? rect(".bottom-bar .icon-pill:first-of-type") : null,
        lastNav: nav.length ? (() => {
          const r = nav[nav.length - 1].getBoundingClientRect();
          return { left:r.left, top:r.top, right:r.right, bottom:r.bottom, width:r.width, height:r.height, cx:r.left+r.width/2 };
        })() : null,
      };
    })()`);
    await page.screenshot(SCREENSHOT);

    const issues = [];
    if (!layout.running || layout.skin !== "angel" || layout.progress < 0.35 || layout.progress > 0.45) {
      issues.push(`wrong running state: ${JSON.stringify({ running: layout.running, skin: layout.skin, progress: layout.progress })}`);
    }
    for (const required of ["is-focusing", "is-brewing", "is-session"]) {
      if (!layout.sceneClasses.split(/\s+/).includes(required)) issues.push(`#shopScene missing ${required}`);
    }
    for (const required of ["has-pill", "session-on"]) {
      if (!layout.controlClasses.split(/\s+/).includes(required)) issues.push(`#focusControls missing ${required}`);
    }
    if (layout.makerState !== "mixing" || !/assets\/poses\/angel-mixing\.png$/.test(layout.makerSrc)) {
      issues.push(`wrong Angel pose: state=${layout.makerState}, src=${layout.makerSrc}`);
    }
    if (layout.startLabel !== "Pause" || layout.blockLabel !== "App blocking: On" || layout.shieldStarts < 1) {
      issues.push(`native controls not active: ${layout.startLabel}, ${layout.blockLabel}, starts=${layout.shieldStarts}`);
    }

    if (!near(layout.hudName.cx, 220)) issues.push(`HUD name center ${layout.hudName.cx.toFixed(1)} is not viewport center 220`);
    if (!near(layout.timer.left, 20) || !near(layout.timer.right, 420)) issues.push(`timer rail is ${layout.timer.left.toFixed(1)}..${layout.timer.right.toFixed(1)}`);
    if (!near(layout.start.left, 20) || !near(layout.reset.right, 420)) issues.push(`action rail is ${layout.start.left.toFixed(1)}..${layout.reset.right.toFixed(1)}`);
    if (!near(layout.reset.left - layout.start.right, 8, 0.75)) issues.push(`action gap is ${(layout.reset.left - layout.start.right).toFixed(1)}`);
    if (!near(layout.reset.width, 56, 0.75)) issues.push(`reset width is ${layout.reset.width.toFixed(1)}`);
    if (!near(layout.firstNav.left, 20, 1) || !near(layout.lastNav.right, 420, 1)) issues.push(`nav rail is ${layout.firstNav.left.toFixed(1)}..${layout.lastNav.right.toFixed(1)}`);
    if (!near(layout.block.cx, 220)) issues.push(`blocking pill center is ${layout.block.cx.toFixed(1)}`);
    if (!near(layout.blockText.cx, layout.block.cx, 1)) issues.push(`blocking label is optically ${Math.abs(layout.blockText.cx - layout.block.cx).toFixed(1)}px off-center`);

    // Chrome has no iPhone safe-area inset. At zero inset the stack must still
    // clear the nav; the max() anchor in production lets a notched iPhone move
    // it down another 26px without sacrificing this zero-inset composition.
    if (layout.timer.top < 628 || layout.timer.top > 632) issues.push(`timer top is ${layout.timer.top.toFixed(1)}, expected 628..632`);
    if (layout.counter.bottom < 606 || layout.counter.bottom > 610) issues.push(`counter bottom is ${layout.counter.bottom.toFixed(1)}, expected 606..610`);
    if (layout.timer.top - layout.counter.bottom < 10) issues.push(`counter-to-timer clearance is ${(layout.timer.top - layout.counter.bottom).toFixed(1)}px`);
    if (layout.firstNav.top - layout.block.bottom < 24) issues.push(`blocking-to-nav clearance is ${(layout.firstNav.top - layout.block.bottom).toFixed(1)}px`);

    const art = spawnSync("python3", [CHECKER, SCREENSHOT], { encoding: "utf8" });
    if (art.status !== 0) issues.push(`composed screenshot contains keyed backdrop: ${art.stdout.trim()}`);
    if (errors.length) issues.push(`page errors: ${errors.join(" | ")}`);

    assert.deepEqual(issues, [], `native layout regression(s):\n- ${issues.join("\n- ")}\nlayout=${JSON.stringify(layout)}`);
  } finally {
    if (page) await page.close();
    chrome.close();
    await server.close();
  }
});

test("native focus layout clears controls on every supported phone size", { timeout: 120_000 }, async () => {
  const { serve } = await import(pathToFileURL(resolve(ROOT, "tools", "qa", "serve.mjs")));
  const { launchChrome, Page, sleep } = await import(pathToFileURL(resolve(ROOT, "tools", "qa", "cdp.mjs")));
  const server = await serve(ROOT);
  const viewports = [
    { width: 375, height: 667 },
    { width: 375, height: 812 },
    { width: 390, height: 844 },
    { width: 393, height: 852 },
    { width: 402, height: 874 },
    { width: 430, height: 932 },
    { width: 440, height: 956 },
  ];
  const cases = viewports.flatMap((viewport) => [0, 34].map((safeBottom) => ({
    ...viewport,
    safeBottom,
    // The UI allows 24 characters; every supported width must remain balanced
    // at that actual upper bound, not only with a short developer name.
    name: "ABCDEFGHIJKLMNOPQRSTUVWX",
  })));
  const issues = [];

  try {
    for (const viewport of cases) {
      const port = await freePort();
      const chrome = await launchChrome({ port, width: viewport.width, height: viewport.height });
      let page;
      try {
        page = await Page.open(chrome.port, { width: viewport.width, height: viewport.height, scale: 1 });
        page.port = chrome.port;
        const errors = page.collectErrors();
        await page.send("Emulation.setSafeAreaInsetsOverride", {
          insets: { top: 0, left: 0, right: 0, bottom: viewport.safeBottom },
        });
        await page.send("Page.addScriptToEvaluateOnNewDocument", {
          source: nativeBootHook(viewport),
        });
        await page.goto(`${server.origin}/app.html`, { waitMs: 450 });
        await page.eval(`(() => {
          const style = document.createElement("style");
          style.textContent = "*,*::before,*::after{animation:none!important;transition:none!important}";
          document.head.append(style);
          return document.fonts.ready.then(() => true);
        })()`);
        await page.click("#startPauseBtn");
        await sleep(1_150);

        const layout = await page.eval(`(() => {
          const rect = (selector) => {
            const element = document.querySelector(selector);
            const r = element.getBoundingClientRect();
            return { left:r.left, top:r.top, right:r.right, bottom:r.bottom, width:r.width, height:r.height, cx:r.left+r.width/2 };
          };
          const blockTarget = getComputedStyle(document.querySelector("#blockPill"), "::after");
          return {
            counter: rect(".work-counter"),
            timer: rect("#timerCard"),
            block: rect("#blockPill"),
            nav: rect(".bottom-bar .icon-pill"),
            hudChips: rect(".hud-chips"),
            hudName: rect("#hudName"),
            shelf: rect("#shelfChip"),
            hudTag: document.querySelector("#hudName").tagName,
            hudAria: document.querySelector("#hudName").getAttribute("aria-label"),
            blockTarget: { width: parseFloat(blockTarget.width), height: parseFloat(blockTarget.height) },
          };
        })()`);

        const label = `${viewport.width}x${viewport.height} safe${viewport.safeBottom}`;
        const counterGap = layout.timer.top - layout.counter.bottom;
        const navGap = layout.nav.top - layout.block.bottom;
        const nameGap = layout.hudName.left - layout.hudChips.right;
        const shelfGap = layout.shelf.left - layout.hudName.right;
        if (counterGap < 9.5) issues.push(`${label}: counter-to-timer clearance ${counterGap.toFixed(1)}px`);
        if (navGap < 23.5) issues.push(`${label}: blocking-to-nav clearance ${navGap.toFixed(1)}px`);
        if (!near(layout.hudName.cx, viewport.width / 2, 1)) issues.push(`${label}: HUD name center ${layout.hudName.cx.toFixed(1)}px`);
        if (nameGap < 8) issues.push(`${label}: HUD name-to-stats clearance ${nameGap.toFixed(1)}px`);
        if (shelfGap < 8) issues.push(`${label}: HUD name-to-shelf clearance ${shelfGap.toFixed(1)}px`);
        if (layout.hudTag !== "BUTTON") issues.push(`${label}: HUD name is ${layout.hudTag}, not a semantic button`);
        if (layout.hudAria !== "Change your name") issues.push(`${label}: HUD name accessible label is ${layout.hudAria}`);
        if (layout.blockTarget.width < 44 || layout.blockTarget.height < 44) {
          issues.push(`${label}: blocking hit target ${layout.blockTarget.width}x${layout.blockTarget.height}px`);
        }
        const focused = await page.eval(`(() => {
          const button = document.querySelector("#hudName");
          button.focus();
          return document.activeElement === button;
        })()`);
        if (!focused) issues.push(`${label}: HUD name cannot receive keyboard focus`);
        if (errors.length) issues.push(`${label}: page errors ${errors.join(" | ")}`);
      } finally {
        if (page) await page.close();
        chrome.close();
      }
    }
  } finally {
    await server.close();
  }

  assert.deepEqual(issues, [], `responsive native layout regression(s):\n- ${issues.join("\n- ")}`);
});
