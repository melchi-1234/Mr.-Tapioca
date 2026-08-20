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

function nativeBootHook() {
  return `
    (() => {
      Object.defineProperty(window, "MRTAP_CLOUD", { value: {}, configurable: false });
      Object.defineProperty(window, "Capacitor", {
        value: {
          isNativePlatform: () => true,
          registerPlugin: () => null,
          Plugins: {},
        },
        configurable: false,
      });
      try {
        Object.defineProperty(navigator.serviceWorker, "register", {
          value: () => Promise.reject(new Error("QA: service worker disabled")),
          configurable: true,
        });
      } catch (_) {}
      localStorage.clear();
      const seed = {
        bobaFocusOnboarded: "true",
        bobaFocusTourDone: "1",
        bobaFocusTourOffered: "1",
        bobaFocusSkin: "angel",
        bobaFocusName: "Melchi",
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

async function withPage(width, height, run) {
  const { serve } = await import(pathToFileURL(resolve(ROOT, "tools", "qa", "serve.mjs")));
  const { launchChrome, Page } = await import(pathToFileURL(resolve(ROOT, "tools", "qa", "cdp.mjs")));
  const server = await serve(ROOT);
  const port = await freePort();
  const chrome = await launchChrome({ port, width, height });
  let page;
  try {
    page = await Page.open(chrome.port, { width, height, scale: 1 });
    page.port = chrome.port;
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: nativeBootHook() });
    await page.goto(`${server.origin}/app.html`, { waitMs: 500 });
    return await run(page);
  } finally {
    if (page) await page.close();
    chrome.close();
    await server.close();
  }
}

test("short-phone break scenes retire the HUD instead of drawing skins through it", { timeout: 60_000 }, async () => {
  const cases = [
    { width: 375, height: 667, hidden: true },
    { width: 375, height: 812, hidden: true },
    { width: 393, height: 852, hidden: false },
  ];
  const issues = [];

  for (const item of cases) {
    const result = await withPage(item.width, item.height, (page) => page.eval(`(() => {
      state.skin = "angel";
      currentMakerState = "";
      setMakerState("sleeping");
      els.shopScene.classList.add("is-on-break");
      const hud = document.querySelector(".top-hud");
      const name = document.querySelector("#hudName");
      const chips = document.querySelector(".hud-chips");
      const drink = document.querySelector(".drink-label");
      const shelf = document.querySelector("#shelfChip");
      const style = getComputedStyle(hud);
      return {
        display: style.display,
        visibility: style.visibility,
        opacity: Number(style.opacity),
        pointerEvents: style.pointerEvents,
        nameVisibility: getComputedStyle(name).visibility,
        chipsVisibility: getComputedStyle(chips).visibility,
        drinkVisibility: getComputedStyle(drink).visibility,
        shelfVisibility: getComputedStyle(shelf).visibility,
        shelfOpacity: Number(getComputedStyle(shelf).opacity),
        shelfPointerEvents: getComputedStyle(shelf).pointerEvents,
      };
    })()`));
    const unsafeHidden = result.nameVisibility === "hidden"
      && result.chipsVisibility === "hidden"
      && result.drinkVisibility === "hidden";
    if (unsafeHidden !== item.hidden) {
      issues.push(`${item.width}x${item.height}: overlapping HUD groups hidden=${unsafeHidden}, expected ${item.hidden}; ${JSON.stringify(result)}`);
    }
    if (item.hidden && (result.shelfVisibility === "hidden" || result.shelfOpacity === 0
        || result.shelfPointerEvents === "none")) {
      issues.push(`${item.width}x${item.height}: compact break removed the only Shelf control`);
    }
  }

  assert.deepEqual(issues, [], `break-scene HUD regressions:\n- ${issues.join("\n- ")}`);
});

test("cross-tab sync and premium revocation immediately repaint the equipped skin", { timeout: 60_000 }, async () => {
  const result = await withPage(393, 852, async (page) => {
    const before = await page.eval(`(() => {
      state.skin = "angel";
      state.owned = [...new Set([...(state.owned || []), "skin-angel"])];
      refreshMaker();
      localStorage.setItem("bobaFocusSkin", "devil");
      window.dispatchEvent(new StorageEvent("storage", {
        key: "bobaFocusSaveStamp",
        newValue: Date.now() + ":other-tab",
      }));
      return true;
    })()`);
    assert.equal(before, true);
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
    const synced = await page.eval(`(() => ({
      skin: state.skin,
      src: document.querySelector("#focusMakerCharacter").getAttribute("src"),
      sceneSkin: document.querySelector("#shopScene").dataset.skin,
    }))()`);

    const revoked = await page.eval(`(async () => {
      state.skin = "angel";
      state.owned = [...new Set([...(state.owned || []), "skin-angel"])];
      refreshMaker();
      const originalPlugin = IAP.plugin;
      IAP.plugin = () => ({ restore: async () => ({ owned: [] }) });
      try { await IAP.restoreAll(false); } finally { IAP.plugin = originalPlugin; }
      return {
        skin: state.skin,
        src: document.querySelector("#focusMakerCharacter").getAttribute("src"),
        sceneSkin: document.querySelector("#shopScene").dataset.skin,
      };
    })()`);
    return { synced, revoked };
  });

  assert.deepEqual(result.synced, {
    skin: "devil",
    src: "assets/poses/devil-idle.png",
    sceneSkin: "devil",
  });
  assert.deepEqual(result.revoked, {
    skin: "",
    src: "assets/poses/base-idle.png",
    sceneSkin: "base",
  });
});

test("393x852 Angel reward hop retires only the HUD groups it intersects", { timeout: 60_000 }, async () => {
  const result = await withPage(393, 852, (page) => page.eval(`(() => {
    state.skin = "angel";
    currentMakerState = "";
    setMakerState("sleeping");
    els.shopScene.classList.add("is-on-break", "celebrating");
    els.makerWrap.classList.add("celebrate");
    const style = (selector) => {
      const value = getComputedStyle(document.querySelector(selector));
      return { visibility: value.visibility, opacity: Number(value.opacity), pointerEvents: value.pointerEvents };
    };
    return {
      name: style("#hudName"),
      chips: style(".hud-chips"),
      drink: style(".drink-label"),
      shelf: style("#shelfChip"),
    };
  })()`));

  for (const key of ["name", "chips", "drink"]) {
    assert.equal(result[key].visibility, "hidden", `${key} overlaps Angel's reward-hop peak`);
    assert.equal(result[key].pointerEvents, "none", `${key} must not retain an invisible tap target`);
  }
  assert.notEqual(result.shelf.visibility, "hidden", "the only Shelf control must remain visible");
  assert.notEqual(result.shelf.opacity, 0, "the only Shelf control must remain painted");
  assert.notEqual(result.shelf.pointerEvents, "none", "the only Shelf control must remain tappable");
});

test("Angel remains inside the viewport at the combined idle-hop and pop peak", { timeout: 60_000 }, async () => {
  const cases = [
    { width: 375, height: 812 },
    { width: 393, height: 852 },
    { width: 440, height: 956 },
  ];
  const issues = [];

  for (const item of cases) {
    const result = await withPage(item.width, item.height, (page) => page.eval(`(async () => {
      state.skin = "angel";
      currentMakerState = "";
      setMakerState("idle");
      const img = document.querySelector("#focusMakerCharacter");
      await img.decode();

      const style = document.createElement("style");
      style.textContent = [
        "#makerWrap{transition:none!important;transform:translateX(var(--walk)) translateY(-10px) scale(1.12,.92)!important}",
        "#focusMakerCharacter{animation:none!important;transform:translateY(0) scaleX(1.05) scaleY(.95)!important}",
      ].join("");
      document.head.append(style);

      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let minX = canvas.width;
      let maxX = -1;
      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          if (data[(y * canvas.width + x) * 4 + 3] > 16) {
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
          }
        }
      }
      const rect = img.getBoundingClientRect();
      return {
        sceneSkin: document.querySelector("#shopScene").dataset.skin || "",
        visibleLeft: rect.left + minX / canvas.width * rect.width,
        visibleRight: rect.left + (maxX + 1) / canvas.width * rect.width,
        viewportWidth: innerWidth,
      };
    })()`));
    if (result.sceneSkin !== "angel") {
      issues.push(`${item.width}x${item.height}: scene is not tagged with the equipped Angel skin`);
    }
    if (result.visibleLeft < 0.5 || result.visibleRight > result.viewportWidth - 0.5) {
      issues.push(`${item.width}x${item.height}: Angel alpha spans ${result.visibleLeft.toFixed(2)}..${result.visibleRight.toFixed(2)} inside ${result.viewportWidth}px`);
    }
  }

  assert.deepEqual(issues, [], `Angel pop crop regression(s):\n- ${issues.join("\n- ")}`);
});

test("all 14 skins map every runtime state to decoded, honestly previewed art", { timeout: 60_000 }, async () => {
  const rows = await withPage(393, 852, (page) => page.eval(`(async () => {
    const skins = ["", "grad-cap", "flower", "scarf", "shades", "strawberry", "astro-blue",
      "dragon", "cat-hoodie", "royal", "ninja", "angel", "devil", "wizard"];
    const aliases = {
      idle: "idle", walking: "idle", mixing: "mixing", sleeping: "sleeping",
      drinking: "idle", shocked: "shocked",
    };
    const rows = [];
    for (const skin of skins) {
      for (const [stateName, fileState] of Object.entries(aliases)) {
        state.skin = skin;
        currentMakerState = "";
        setMakerState(stateName);
        const image = document.querySelector("#focusMakerCharacter");
        let decoded = true;
        try { await image.decode(); } catch (_) { decoded = false; }
        rows.push({
          skin: skin || "base",
          stateName,
          fileState,
          src: image.getAttribute("src"),
          dataState: image.dataset.state,
          sceneSkin: document.querySelector("#shopScene").dataset.skin,
          decoded,
        });
      }
    }
    const angelItem = SHOP_ITEMS.find((item) => item.value === "angel");
    rows.push({ skin: "angel-catalog", src: angelItem && angelItem.img });
    return rows;
  })()`));

  const issues = [];
  for (const row of rows) {
    if (row.skin === "angel-catalog") {
      if (row.src !== "assets/poses/angel-idle.png") {
        issues.push(`Angel shop preview ${row.src} does not match the equipped idle skin`);
      }
      continue;
    }
    const expected = `assets/poses/${row.skin}-${row.fileState}.png`;
    if (row.src !== expected) issues.push(`${row.skin}/${row.stateName}: ${row.src}, expected ${expected}`);
    if (row.dataState !== row.stateName) issues.push(`${row.skin}/${row.stateName}: data-state=${row.dataState}`);
    if (row.sceneSkin !== row.skin) issues.push(`${row.skin}/${row.stateName}: scene skin=${row.sceneSkin}`);
    if (!row.decoded) issues.push(`${row.skin}/${row.stateName}: image did not decode`);
  }

  assert.deepEqual(issues, [], `skin runtime mapping regression(s):\n- ${issues.join("\n- ")}`);
});
