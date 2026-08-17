#!/usr/bin/env node
// ── Visual QA sweep for the reward-aware app states ──────────────────────────
// Drives the real app in headless Chrome and photographs the 14 states that the
// partner-reward work touches, at BOTH widths CLAUDE.md requires (375x812 and
// 1280x900). Re-runnable: `node tools/qa/capture-network-v1.mjs`.
//
// Why a script and not a person with a phone: the reward states need 4 hours of
// banked focus and a fix inside 40 m of a real shop. Nobody re-checks those by
// hand before a release, so they never get re-checked. This does.
//
//   node tools/qa/capture-network-v1.mjs                 # everything
//   node tools/qa/capture-network-v1.mjs --only 07,08,09 # one flow
//   node tools/qa/capture-network-v1.mjs --phone-only
//
// ── THE THREE RULES THIS FILE EXISTS TO ENFORCE ─────────────────────────────
//
// 1. NEVER PHOTOGRAPH THE WRONG SCREEN. Every state carries an `assert` that
//    reads the live DOM and must return `ok:true` before the shutter fires. A
//    failed assert records the state as NOT CAPTURED with the reason; it never
//    falls back to "whatever was on screen". A sweep that quietly shoots the
//    San Francisco demo city and files it as "Ithaca, both partners" is worse
//    than a sweep with a hole in it, because the hole is visible and the lie
//    is not.
// 2. NO LIVE-SERVICE TRAFFIC. Every request is intercepted (CDP Fetch domain).
//    Same-origin (the local QA server) continues; `mrtapioca.me/partners.json`
//    is fulfilled from the copy on disk; OSM basemap tiles are fulfilled with a
//    locally drawn placeholder that says so on its face; everything else is
//    blocked and logged. `window.MRTAP_CLOUD` is frozen empty before config.js
//    runs, which is what keeps squad-cloud.js from minting an anonymous account
//    in the live Supabase project and metrics.js from posting a drink row. The
//    per-state blocked-URL log is printed at the end so this claim is auditable
//    rather than asserted.
// 3. A JS ERROR FAILS THE RUN. Console errors and page exceptions are collected
//    per state and the process exits non-zero if any state produced one.
//
// Owned-file guard: `docs/qa-screenshots-network-v1/` also holds PNGs captured
// by other work (cashier-, landing-, merchant-pilot-, privacy-policy-). This
// script refuses to write a filename starting with any of those prefixes.
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "./serve.mjs";
import { launchChrome, Page, sleep } from "./cdp.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const OUT = join(ROOT, "docs", "qa-screenshots-network-v1");

// Filenames another work stream owns. Writing one of these would silently
// destroy a capture nobody re-runs.
const OWNED_PREFIXES = ["cashier-", "landing-", "merchant-pilot-", "privacy-policy-"];

// ── Fixtures ────────────────────────────────────────────────────────────────
// Ithaca: the corner of Collegetown that both live partner shops sit in, so a
// 6 km radius reaches U Tea (205 Dryden Rd) and Dream Tea & Poké (130 E Seneca).
const ITHACA = { lat: 42.4440, lng: -76.5019, label: "Ithaca, NY" };
// Honolulu: real CURATED_SHOPS coverage, zero partners. That is the honest way
// to shoot the no-partner state — a real neighbourhood with real boba in it and
// no deal, not an empty map in the middle of nowhere, which only proves the
// map can fail to load.
const HONOLULU = { lat: 21.2969, lng: -157.8583, label: "Honolulu, HI" };

const PHONE = { id: "", w: 375, h: 812, scale: 2 };
const DESKTOP = { id: "-desktop", w: 1280, h: 900, scale: 2 };

// ── CLI ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const onlyArg = (() => {
  const i = argv.indexOf("--only");
  return i >= 0 && argv[i + 1] ? argv[i + 1].split(",").map((s) => s.trim()) : null;
})();
const VIEWPORTS = argv.includes("--phone-only") ? [PHONE]
  : argv.includes("--desktop-only") ? [DESKTOP]
  : [PHONE, DESKTOP];

// ── Boot-time page hooks ────────────────────────────────────────────────────
// Runs BEFORE config.js / app.js on every navigation. Two of the three things
// here are safety, not convenience.
function bootHook(seed) {
  return `
(() => {
  try {
    // (1) Kill the cloud before config.js can turn it on. config.js does a plain
    //     \`window.MRTAP_CLOUD = {...}\` in sloppy mode, so a non-writable own
    //     property makes that assignment a silent no-op. squad-cloud.js and
    //     metrics.js both gate on \`!!(CLOUD.url && CLOUD.anonKey)\` and go inert,
    //     which is the whole reason no anonymous account is created and no
    //     drink_events row is POSTed by a QA run.
    Object.defineProperty(window, "MRTAP_CLOUD", {
      value: {}, writable: false, configurable: false,
    });
  } catch (e) {}
  try {
    // (2) No service worker. CLAUDE.md gotcha #2: the worker will happily serve
    //     a stale app.js back to you and you photograph last week's build. The
    //     app's own call is \`register("sw.js").catch(() => {})\`, so a rejected
    //     promise is swallowed and produces no console error.
    if (navigator.serviceWorker) {
      Object.defineProperty(navigator.serviceWorker, "register", {
        value: () => Promise.reject(new Error("QA: service worker disabled")),
        configurable: true,
      });
    }
  } catch (e) {}
  try {
    // (3) Seed. Cleared first so a previous state cannot bleed into this one —
    //     the tabs share one profile and localStorage is per-origin, not per-tab.
    localStorage.clear();
    const seed = ${JSON.stringify(seed || {})};
    for (const k of Object.keys(seed)) localStorage.setItem(k, seed[k]);
  } catch (e) {}
})();`;
}

// ── Network policy ──────────────────────────────────────────────────────────
// One handler, three outcomes, everything logged. Attached before Fetch.enable
// so no request can slip past while we are still wiring up.
function installNetworkPolicy(page, origin, partnersJson, tileB64) {
  const blocked = [];
  const fulfilled = [];

  page.on("Fetch.requestPaused", async (p) => {
    const url = p.request.url || "";
    const done = (fn, args) => page.send(fn, { requestId: p.requestId, ...args }).catch(() => {});
    try {
      if (url.startsWith(origin) || url.startsWith("data:") || url.startsWith("blob:")) {
        return done("Fetch.continueRequest");
      }
      if (url.includes("mrtapioca.me/partners.json")) {
        // The file under test, served from disk. Fetched cross-origin by the
        // app (app.js hardcodes the absolute URL so the capacitor:// origin can
        // reach it), so the CORS header is required or the fetch rejects and
        // the app silently falls back to its bundled single-shop floor — which
        // would drop Dream Tea & Poké off the map and out of this sweep.
        fulfilled.push("partners.json <- local file");
        return done("Fetch.fulfillRequest", {
          responseCode: 200,
          responseHeaders: [
            { name: "content-type", value: "application/json; charset=utf-8" },
            { name: "access-control-allow-origin", value: "*" },
          ],
          body: Buffer.from(partnersJson, "utf8").toString("base64"),
        });
      }
      if (/tile\.openstreetmap\.org/.test(url)) {
        fulfilled.push("osm tile <- placeholder");
        return done("Fetch.fulfillRequest", {
          responseCode: 200,
          responseHeaders: [
            { name: "content-type", value: "image/png" },
            { name: "access-control-allow-origin", value: "*" },
          ],
          body: tileB64,
        });
      }
      blocked.push(url.split("?")[0]);
      return done("Fetch.failRequest", { errorReason: "BlockedByClient" });
    } catch (e) {
      return done("Fetch.continueRequest");
    }
  });

  return { blocked, fulfilled, enable: () => page.send("Fetch.enable", { patterns: [{ urlPattern: "*" }] }) };
}

// ── Helpers ─────────────────────────────────────────────────────────────────
async function settle(page, ms = 700) {
  // Fonts first: Inter loading late reflows every label, and a screenshot taken
  // mid-swap shows the fallback face, which reads as a design regression that
  // is not there.
  await page.eval(`(async () => { try { await document.fonts.ready; } catch (e) {} return true; })()`);
  await sleep(ms);
}

// Wait for a page-side predicate. Returns true, or false on timeout — callers
// turn that into a NOT CAPTURED, never into a screenshot.
async function waitFor(page, expr, { timeout = 15000, step = 200 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    let v = false;
    try { v = await page.eval(`!!(${expr})`); } catch (e) { v = false; }
    if (v) return true;
    await sleep(step);
  }
  return false;
}

// cdp.mjs's page.click() takes an element's rect and clicks its centre. That is
// fine for anything already on screen and WRONG for anything inside a scrolled
// sheet: the redeem button sits under the map in #mapSheet .sheet-body, its
// centre lands off the bottom of a 375x812 viewport, and the synthetic click
// silently hits nothing (that is exactly how states 09 and 10 first failed).
//
// So: scroll the element's own scroll container, then refuse to click unless
// the point we are about to press really belongs to that element. A misclick
// that opens the wrong thing is the failure mode this whole file is built
// against, so it has to be an error, not a shrug.
async function clickIn(page, selector) {
  const info = await page.eval(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return { found: false };
    // Nearest scrollable ancestor. scrollIntoView is not usable here: it also
    // scrolls .scene-wrap and shoves the whole app out of the phone frame
    // (the trap app.js documents next to scrollSheetTo).
    let sc = el.parentElement;
    while (sc && sc !== document.body) {
      const st = getComputedStyle(sc);
      if (/(auto|scroll)/.test(st.overflowY) && sc.scrollHeight > sc.clientHeight + 4) break;
      sc = sc.parentElement;
    }
    if (sc && sc !== document.body) {
      const er = el.getBoundingClientRect(), cr = sc.getBoundingClientRect();
      sc.scrollTop += (er.top - cr.top) - (cr.height / 2 - er.height / 2);
    }
    return { found: true };
  })()`);
  if (!info.found) throw new Error(`click target not found: ${selector}`);
  await sleep(250);
  const hit = await page.eval(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return { ok: false, why: "vanished" };
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) {
      return { ok: false, why: "off-viewport at (" + Math.round(x) + "," + Math.round(y) + ")" };
    }
    const at = document.elementFromPoint(x, y);
    if (!at || !(at === el || el.contains(at) || at.contains(el))) {
      return { ok: false, why: "point covered by <" + (at ? at.tagName.toLowerCase() + "." + at.className : "nothing") + ">" };
    }
    return { ok: true, x, y };
  })()`);
  if (!hit.ok) throw new Error(`unclickable ${selector}: ${hit.why}`);
  for (const type of ["mousePressed", "mouseReleased"]) {
    await page.send("Input.dispatchMouseEvent", { type, x: hit.x, y: hit.y, button: "left", buttons: 1, clickCount: 1 });
  }
  await sleep(180);
}

function guardName(file) {
  for (const p of OWNED_PREFIXES) {
    if (file.startsWith(p)) {
      throw new Error(`refusing to write ${file}: "${p}" files are owned by other work`);
    }
  }
}

// ── The states ──────────────────────────────────────────────────────────────
// Each entry: what to seed, what to do, and the assertion that has to hold
// before the shutter fires. `evidence` is echoed into the run log and the
// README so a reader can check the claim without re-running anything.
//
// `seed` is a function of the fixtures built in the prelude, because faithful
// drink/reward objects can only come from the app's own builders.
function buildStates(fx) {
  const onboarded = {
    bobaFocusOnboarded: "true",
    bobaFocusTourDone: "1",
    bobaFocusTourOffered: "1",
    bobaFocusName: "Melchi",
  };
  const withHistory = (h) => ({
    ...onboarded,
    bobaFocusCollection: JSON.stringify(h.drinks),
    bobaFocusRewards: JSON.stringify(h.rewards),
  });
  const withShops = (fixKey) => ({ [fx.cacheKey[fixKey]]: fx.cacheValue[fixKey] });

  return [
    {
      id: "01",
      slug: "onboarding-first-slide",
      what: "First run, slide 1 of 7 of the story onboarding.",
      how: "Storage cleared. No bobaFocusOnboarded, so app.js shows onboarding on its own.",
      seed: {},
      async run(page) {
        if (!await waitFor(page, `document.querySelector("#onboarding") && !document.querySelector("#onboarding").classList.contains("hidden")`)) {
          return { ok: false, why: "onboarding never appeared" };
        }
        await settle(page);
        const title = await page.eval(`document.querySelector("#onboardTitle").textContent`);
        return { ok: title === "Say Hello to Mr. Tapioca!", why: `title was ${JSON.stringify(title)}`, evidence: `#onboardTitle = ${JSON.stringify(title)}` };
      },
    },
    {
      id: "02",
      slug: "onboarding-real-boba",
      what: 'The reward-aware onboarding slide, "Real Rewards Await!" (slide 6 of 7).',
      how: "Storage cleared, then #onboardNext clicked 5 times with real mouse events.",
      seed: {},
      async run(page) {
        if (!await waitFor(page, `document.querySelector("#onboarding") && !document.querySelector("#onboarding").classList.contains("hidden")`)) {
          return { ok: false, why: "onboarding never appeared" };
        }
        for (let i = 0; i < 5; i++) { await clickIn(page, "#onboardNext"); await sleep(220); }
        await settle(page);
        const title = await page.eval(`document.querySelector("#onboardTitle").textContent`);
        const body = await page.eval(`document.querySelector("#onboardBody").textContent`);
        return {
          ok: title === "Real Rewards Await!",
          why: `title was ${JSON.stringify(title)}`,
          evidence: `#onboardTitle = ${JSON.stringify(title)}; body starts ${JSON.stringify(body.slice(0, 44))}`,
        };
      },
    },
    {
      id: "03",
      slug: "screen-time-block-prompt",
      what: "#blockPrompt, the app's only Screen Time explanation surface.",
      how:
        "Onboarding + tour skipped, then showBlockingPrompt() called directly. " +
        "It cannot be reached by pressing Start on this build: startPause() gates it " +
        "behind FocusBlocker.available(), which is false with no Capacitor plugin " +
        "(app.js:2143). The dialog, its copy and its three buttons are the shipped ones.",
      seed: { ...onboarded },
      async run(page) {
        await settle(page, 400);
        await page.eval(`showBlockingPrompt(); true`);
        if (!await waitFor(page, `document.querySelector("#blockPrompt").open`, { timeout: 4000 })) {
          return { ok: false, why: "#blockPrompt never opened" };
        }
        await settle(page);
        const copy = await page.eval(`document.querySelector("#blockPromptCopy").textContent.replace(/\\s+/g," ").trim()`);
        return {
          ok: copy.includes("shield your distracting apps"),
          why: `copy was ${JSON.stringify(copy.slice(0, 60))}`,
          evidence: `#blockPromptCopy = ${JSON.stringify(copy)}`,
        };
      },
    },
    {
      id: "04",
      slug: "home-ready",
      what: "Home screen, idle, ready to start a focus session.",
      how: "bobaFocusOnboarded + bobaFocusTourDone seeded, nothing else.",
      seed: { ...onboarded },
      async run(page) {
        if (!await waitFor(page, `document.querySelector("#startPauseBtn")`)) {
          return { ok: false, why: "#startPauseBtn missing" };
        }
        await settle(page, 1000);
        const label = await page.eval(`document.querySelector("#startPauseBtn").textContent.trim()`);
        const running = await page.eval(`!!state.running`);
        return {
          ok: label === "Start Focus" && running === false,
          why: `button was ${JSON.stringify(label)}, state.running=${running}`,
          evidence: `#startPauseBtn = ${JSON.stringify(label)}, state.running = ${running}`,
        };
      },
    },
    {
      id: "05",
      slug: "focus-running",
      what: "A focus session actually running, roughly 40% through a 30-minute Custom Cup.",
      how:
        "Start Focus clicked for real, then state.elapsed fast-forwarded to 40% and the " +
        "app's own 250 ms tick left to run. The session is genuinely running (state.running " +
        "true, timer interval live); only the clock was moved.",
      seed: { ...onboarded },
      async run(page) {
        await settle(page, 500);
        await clickIn(page, "#startPauseBtn");
        if (!await waitFor(page, `state.running === true`, { timeout: 5000 })) {
          return { ok: false, why: "session never started" };
        }
        await page.eval(`state.elapsed = modeDuration() * 0.4; state.lastTick = Date.now(); true`);
        await sleep(1400);
        await settle(page);
        const running = await page.eval(`state.running === true`);
        const label = await page.eval(`document.querySelector("#startPauseBtn").textContent.trim()`);
        const pct = await page.eval(`Math.round(progress() * 100)`);
        return {
          ok: running && pct > 30 && pct < 60,
          why: `running=${running}, progress=${pct}%`,
          evidence: `state.running = ${running}, progress = ${pct}%, #startPauseBtn = ${JSON.stringify(label)}`,
        };
      },
    },
    {
      id: "06",
      slug: "reward-dialog",
      what:
        "The drink-complete reward dialog on a first drink, i.e. the partner line in its " +
        '"not yet" state ("… of focus until your next partner perk").',
      how:
        "Session started for real, then state.elapsed pushed to just under the finish line " +
        "so the app's own tick() calls completeSession(). Nothing is faked past the clock: " +
        "the drink, the pearls and the dialog all come from the real completion path.",
      seed: { ...onboarded },
      async run(page) {
        await settle(page, 500);
        await clickIn(page, "#startPauseBtn");
        if (!await waitFor(page, `state.running === true`, { timeout: 5000 })) {
          return { ok: false, why: "session never started" };
        }
        await page.eval(`state.elapsed = modeDuration() - 0.2; state.lastTick = Date.now(); true`);
        if (!await waitFor(page, `document.querySelector("#rewardDialog").open`, { timeout: 8000 })) {
          return { ok: false, why: "#rewardDialog never opened" };
        }
        await settle(page, 1200);
        const partner = await page.eval(`document.querySelector("#partnerReward").textContent`);
        const pearls = await page.eval(`document.querySelector("#rewardPearls").textContent`);
        return {
          ok: /until your next partner perk$/.test(partner),
          why: `partner line was ${JSON.stringify(partner)}`,
          evidence: `#partnerReward = ${JSON.stringify(partner)}, #rewardPearls = ${JSON.stringify(pearls)}`,
        };
      },
    },
    {
      id: "06b",
      slug: "reward-dialog-perk-unlocked",
      what:
        "The same dialog when THIS drink crossed the 240-minute bar: the partner line " +
        "renders as a coupon instead of a next-goal line.",
      how:
        "220 minutes of history seeded (built by the app's own drink builder), then a real " +
        "30-minute session completed on top, so 250 minutes crosses the bar exactly once. " +
        "Bar is 240 because livePartners is still the bundled floor until the map is opened.",
      seed: () => withHistory(fx.history220),
      async run(page) {
        await settle(page, 500);
        await clickIn(page, "#startPauseBtn");
        if (!await waitFor(page, `state.running === true`, { timeout: 5000 })) {
          return { ok: false, why: "session never started" };
        }
        await page.eval(`state.elapsed = modeDuration() - 0.2; state.lastTick = Date.now(); true`);
        if (!await waitFor(page, `document.querySelector("#rewardDialog").open`, { timeout: 8000 })) {
          return { ok: false, why: "#rewardDialog never opened" };
        }
        await settle(page, 1200);
        const partner = await page.eval(`document.querySelector("#partnerReward").textContent`);
        const hasPerk = await page.eval(`document.querySelector("#partnerReward").classList.contains("has-perk")`);
        return {
          ok: partner.startsWith("\u{1F31F}") && hasPerk === true,
          why: `partner line was ${JSON.stringify(partner)}, has-perk=${hasPerk}`,
          evidence: `#partnerReward = ${JSON.stringify(partner)}, .has-perk = ${hasPerk}`,
        };
      },
    },
    {
      id: "07",
      slug: "map-perk-progress",
      what:
        "Reward PROGRESS on the Boba Map banner: partner nearby, nothing earned yet, so the " +
        "banner quotes what is left rather than the whole bar.",
      how: "150 minutes of history seeded, geolocation Ithaca, Boba Map opened.",
      geo: ITHACA,
      seed: () => ({ ...withHistory(fx.history150), ...withShops("ithaca") }),
      run: (page) => openMapAndAssert(page, {
        wantPartners: 2,
        bannerTest: (t) => /is a partner shop\..*more focus to earn/.test(t),
        bannerWhy: "expected the progress line",
      }),
    },
    {
      id: "08",
      slug: "map-partner-shops",
      what: "The Boba Map with BOTH live partner shops starred and in frame, holding one earned reward.",
      how:
        "240 minutes seeded (exactly one bar), geolocation Ithaca, Boba Map opened, then the map " +
        "panned/zoomed to fit both partner pins (a drag-and-pinch, no data changed).",
      geo: ITHACA,
      seed: () => ({ ...withHistory(fx.history240), ...withShops("ithaca") }),
      run: (page) => openMapAndAssert(page, {
        wantPartners: 2,
        wantNames: ["U Tea", "Dream Tea & Poké"],
        framePartners: true,
        bannerTest: (t) => /reward.*ready/.test(t),
        bannerWhy: "expected a rewards-ready banner",
      }),
    },
    {
      id: "09",
      slug: "counter-card-ready",
      what:
        "The counter card (#redeemDialog) in its READY state for U Tea: real perk text, " +
        "live ticking timestamp, Use one reward enabled.",
      how: "Same seed as 08, then U Tea's “Show at the counter” button clicked in the shop list.",
      geo: ITHACA,
      seed: () => ({ ...withHistory(fx.history240), ...withShops("ithaca") }),
      async run(page) {
        const map = await openMapAndAssert(page, { wantPartners: 2 });
        if (!map.ok) return map;
        const clicked = await clickPartnerRedeem(page, "U Tea");
        if (!clicked) return { ok: false, why: "no “Show at the counter” button for U Tea" };
        if (!await waitFor(page, `document.querySelector("#redeemDialog").open`, { timeout: 5000 })) {
          return { ok: false, why: "#redeemDialog never opened" };
        }
        await settle(page, 900);
        const d = await page.eval(`(() => ({
          shop: document.querySelector("#redeemShop").textContent,
          perk: document.querySelector("#redeemPerk").textContent,
          note: document.querySelector("#redeemNote").textContent,
          stamp: document.querySelector("#redeemStamp").textContent,
          disabled: document.querySelector("#redeemConfirmBtn").disabled,
          notReady: document.querySelector("#redeemDialog").classList.contains("not-ready")
        }))()`);
        return {
          ok: d.shop === "U Tea" && d.perk === "10% off your drink" && d.disabled === false && d.notReady === false,
          why: `got ${JSON.stringify(d)}`,
          evidence: `shop=${JSON.stringify(d.shop)}, perk=${JSON.stringify(d.perk)}, note=${JSON.stringify(d.note)}, confirm.disabled=${d.disabled}`,
        };
      },
    },
    {
      id: "10",
      slug: "counter-card-not-ready",
      what:
        "The same counter card at a ZERO balance: greyed confirm, “4 hrs of focus to go.” " +
        "Note the shop name, the perk and the ticking clock still render at full strength " +
        "(GROUNDING.md §1 row 12).",
      how: "No history at all, geolocation Ithaca, Boba Map opened, U Tea's counter button tapped.",
      geo: ITHACA,
      seed: () => ({ ...onboarded, ...withShops("ithaca") }),
      async run(page) {
        const map = await openMapAndAssert(page, { wantPartners: 2 });
        if (!map.ok) return map;
        const clicked = await clickPartnerRedeem(page, "U Tea");
        if (!clicked) return { ok: false, why: "no “Show at the counter” button for U Tea" };
        if (!await waitFor(page, `document.querySelector("#redeemDialog").open`, { timeout: 5000 })) {
          return { ok: false, why: "#redeemDialog never opened" };
        }
        await settle(page, 900);
        const d = await page.eval(`(() => ({
          shop: document.querySelector("#redeemShop").textContent,
          note: document.querySelector("#redeemNote").textContent,
          disabled: document.querySelector("#redeemConfirmBtn").disabled,
          notReady: document.querySelector("#redeemDialog").classList.contains("not-ready"),
          earned: earnedPerkCount()
        }))()`);
        return {
          ok: d.disabled === true && d.notReady === true && d.earned === 0,
          why: `got ${JSON.stringify(d)}`,
          evidence: `earnedPerkCount() = ${d.earned}, confirm.disabled = ${d.disabled}, #redeemNote = ${JSON.stringify(d.note)}`,
        };
      },
    },
    {
      id: "11",
      slug: "map-no-partner",
      what:
        "The no-partner state: a real neighbourhood full of real boba shops and no deal " +
        "anywhere, holding a reward that cannot be spent here.",
      how:
        "240 minutes seeded, geolocation Honolulu (13 hand-verified CURATED_SHOPS, zero " +
        "partners), Boba Map opened.",
      geo: HONOLULU,
      seed: () => ({ ...withHistory(fx.history240), ...withShops("honolulu") }),
      run: (page) => openMapAndAssert(page, {
        wantPartners: 0,
        bannerTest: (t) => /No partner shop near you yet/.test(t),
        bannerWhy: "expected the no-partner banner",
      }),
    },
    {
      id: "12",
      slug: "collection-treats",
      what: "The shelf on its Treats tab: the jar of earned treats behind the reward loop.",
      how: "4 drinks + 4 treats seeded, shelf chip tapped, Treats tab tapped. (Drinks is the sheet's default tab.)",
      seed: () => withHistory(fx.history240),
      async run(page) {
        await settle(page, 500);
        await clickIn(page, "#shelfChip");
        if (!await waitFor(page, `!document.querySelector("#collectionSheet").classList.contains("hidden")`, { timeout: 5000 })) {
          return { ok: false, why: "#collectionSheet never opened" };
        }
        await clickIn(page, "#collTabTreats");
        await settle(page, 700);
        const d = await page.eval(`(() => ({
          treatsVisible: !document.querySelector("#collTreats").classList.contains("hidden"),
          treats: document.querySelectorAll("#collTreats .coll-treat").length,
          first: (document.querySelector("#collTreats .coll-treat-copy") || {}).textContent || ""
        }))()`);
        return {
          ok: d.treatsVisible && d.treats === 4,
          why: `treatsVisible=${d.treatsVisible}, .coll-treat count=${d.treats}`,
          evidence: `.coll-treat x${d.treats}, first copy = ${JSON.stringify(d.first)}`,
        };
      },
    },
    {
      id: "13",
      slug: "squad",
      what:
        "The Study Squad screen. NOTE: captured with the cloud deliberately disabled, so " +
        "this is the on-device Squad (rule 2 above). A live-cloud Squad is NOT captured here.",
      how: "4 drinks seeded so the “You” row has real stats, then the Squad button tapped.",
      seed: () => withHistory(fx.history240),
      async run(page) {
        await settle(page, 500);
        await clickIn(page, "#friendsBtn");
        if (!await waitFor(page, `!document.querySelector("#friendsSheet").classList.contains("hidden")`, { timeout: 5000 })) {
          return { ok: false, why: "#friendsSheet never opened" };
        }
        await settle(page, 800);
        const d = await page.eval(`(() => ({
          stats: document.querySelector("#squadMeStats").textContent.replace(/\\s+/g," ").trim(),
          cloud: !!(window.SquadCloud && window.SquadCloud.enabled)
        }))()`);
        return {
          ok: d.cloud === false,
          why: `SquadCloud.enabled=${d.cloud} (the sweep requires it OFF)`,
          evidence: `SquadCloud.enabled = ${d.cloud}, #squadMeStats = ${JSON.stringify(d.stats)}`,
        };
      },
    },
    {
      id: "14",
      slug: "settings",
      what: "Settings, top of the sheet. (The sheet scrolls internally; this is what opens.)",
      how: "4 drinks seeded so the stats rows are not all zero, then the Settings button tapped.",
      seed: () => withHistory(fx.history240),
      async run(page) {
        await settle(page, 500);
        await clickIn(page, "#settingsBtn");
        if (!await waitFor(page, `!document.querySelector("#settingsSheet").classList.contains("hidden")`, { timeout: 5000 })) {
          return { ok: false, why: "#settingsSheet never opened" };
        }
        await settle(page, 800);
        const d = await page.eval(`(() => ({
          name: document.querySelector("#yourNameValue").textContent,
          total: document.querySelector("#statTotalTime").textContent
        }))()`);
        return { ok: !!d.name, why: `name row was ${JSON.stringify(d.name)}`, evidence: `#yourNameValue = ${JSON.stringify(d.name)}, #statTotalTime = ${JSON.stringify(d.total)}` };
      },
    },
  ];
}

// ── Shared map drive ────────────────────────────────────────────────────────
// Opens the Boba Map and refuses to return ok unless the map is centred on the
// fix we asked for. `lastFix.real === false` means geolocation failed and the
// app fell back to its San Francisco demo city (app.js:4292) — that screen
// looks like a working map and is the single most likely way this sweep could
// file a lie.
async function openMapAndAssert(page, { wantPartners, wantNames, bannerTest, bannerWhy, framePartners } = {}) {
  await settle(page, 500);
  await clickIn(page, "#mapBtn");
  if (!await waitFor(page, `typeof lastFix !== "undefined" && lastFix && lastFix.real === true`, { timeout: 20000 })) {
    const fix = await page.eval(`(typeof lastFix !== "undefined" && lastFix) ? JSON.stringify(lastFix) : "null"`);
    return { ok: false, why: `map never got a real fix (lastFix=${fix}) - it would be showing the demo city` };
  }
  if (!await waitFor(page, `document.querySelectorAll("#mapShopList .map-shop-row").length > 0`, { timeout: 20000 })) {
    return { ok: false, why: "shop list never rendered" };
  }
  // A shot captioned "both partner shops" has to actually SHOW both. The app
  // opens centred on the user at zoom 15, and from a fix in Ithaca that puts
  // U Tea (Dryden Rd) just off the right edge of a 375 px viewport — so the
  // frame held one star and the caption was being carried by the shop list.
  // Tapping zoom-out fixes the bounds and ruins the picture a different way:
  // at zoom 13 the pins pile on top of each other and the second star is
  // occluded, which is still not a photograph of two partner shops.
  //
  // So pan/zoom to fit the partners, which is what a user does by dragging and
  // pinching, and then require BOTH that the pins are in bounds and that they
  // are far enough apart on screen to be told apart. Nothing but the viewport
  // moves; no data is touched.
  let framed = null;
  if (framePartners) {
    await page.eval(`(() => {
      const b = L.latLngBounds(livePartners.map(p => [p.lat, p.lng]));
      mapObj.fitBounds(b, { padding: [56, 56], maxZoom: 16, animate: false });
      return true;
    })()`);
    await sleep(700);
    framed = await page.eval(`(() => {
      const b = mapObj.getBounds();
      const pts = livePartners.map(p => mapObj.latLngToContainerPoint([p.lat, p.lng]));
      let minSep = Infinity;
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
        minSep = Math.min(minSep, Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y));
      }
      return {
        allIn: livePartners.every(p => b.contains([p.lat, p.lng])),
        minSep: Math.round(minSep), zoom: mapObj.getZoom()
      };
    })()`);
    if (!framed.allIn) return { ok: false, why: "could not fit both partner pins in the map viewport" };
    if (framed.minSep < 60) {
      return { ok: false, why: `partner pins only ${framed.minSep}px apart on screen - they would read as one` };
    }
  }

  // Leaflet fades tiles in and the sheet animates; give both time to land.
  await settle(page, 1600);
  const d = await page.eval(`(() => ({
    fix: lastFix,
    partners: [...document.querySelectorAll("#mapShopList .map-shop-row.is-partner .map-shop-name")].map(e => e.textContent),
    rows: document.querySelectorAll("#mapShopList .map-shop-row").length,
    banner: document.querySelector("#mapPerkBanner").textContent,
    bannerHidden: document.querySelector("#mapPerkBanner").classList.contains("hidden"),
    inFrame: livePartners.filter(p => mapObj.getBounds().contains([p.lat, p.lng])).map(p => p.name),
    zoom: mapObj.getZoom(),
    status: document.querySelector("#mapStatus").classList.contains("hidden") ? "" : document.querySelector("#mapStatus").textContent
  }))()`);

  if (wantPartners != null && d.partners.length !== wantPartners) {
    return { ok: false, why: `expected ${wantPartners} partner rows, found ${d.partners.length} (${JSON.stringify(d.partners)})` };
  }
  if (wantNames) {
    for (const n of wantNames) {
      if (!d.partners.includes(n)) return { ok: false, why: `partner ${JSON.stringify(n)} missing from ${JSON.stringify(d.partners)}` };
    }
  }
  if (bannerTest && !bannerTest(d.banner)) {
    return { ok: false, why: `${bannerWhy}, banner was ${JSON.stringify(d.banner)}` };
  }
  return {
    ok: true,
    evidence:
      `lastFix = ${JSON.stringify(d.fix)}; ${d.rows} shop rows, ` +
      `partner rows = ${JSON.stringify(d.partners)}; ` +
      `partner pins in frame = ${JSON.stringify(d.inFrame)} at zoom ${d.zoom}` +
      (framed ? ` (framed by fitBounds, pins ${framed.minSep}px apart)` : "") +
      `; #mapPerkBanner = ${JSON.stringify(d.banner)}` +
      (d.status ? `; #mapStatus = ${JSON.stringify(d.status)}` : ""),
  };
}

async function clickPartnerRedeem(page, shopName) {
  const idx = await page.eval(`(() => {
    const rows = [...document.querySelectorAll("#mapShopList .map-shop-row.is-partner")];
    const i = rows.findIndex(r => (r.querySelector(".map-shop-name") || {}).textContent === ${JSON.stringify(shopName)});
    if (i < 0) return -1;
    const btn = rows[i].querySelector(".map-shop-redeem");
    return btn ? +btn.dataset.p : -1;
  })()`);
  if (idx < 0) return false;
  await clickIn(page, `#mapShopList .map-shop-redeem[data-p="${idx}"]`);
  return true;
}

// ── Prelude ─────────────────────────────────────────────────────────────────
// One throwaway page that hands back three things only the app itself can give
// honestly: the placeholder basemap tile, the app's own curated shop lists for
// the two fixes, and drink/reward objects built by the app's own code paths.
//
// Seeding hand-written drink objects is how a QA sweep drifts: you invent a
// shape, the app changes, and the screenshots quietly show a state the app can
// no longer produce. These come out of currentDrinkName(), modeLabel(),
// minuteLabel(), durationLabel(), localDateKey() and BASES.
async function prelude(port, origin) {
  const page = await Page.open(port, { width: 375, height: 812, scale: 1 });
  page.port = port;   // cdp.mjs's Page.open never sets this and close() needs it
  const partnersJson = readFileSync(join(ROOT, "partners.json"), "utf8");

  // Draw the tile before the policy is installed — it needs no network.
  await page.goto("about:blank");
  const tileB64 = await page.eval(`(() => {
    const c = document.createElement("canvas"); c.width = 256; c.height = 256;
    const x = c.getContext("2d");
    x.fillStyle = "#ece5da"; x.fillRect(0, 0, 256, 256);
    x.strokeStyle = "#ddd3c4"; x.lineWidth = 1;
    for (let i = 0; i <= 256; i += 32) {
      x.beginPath(); x.moveTo(i + .5, 0); x.lineTo(i + .5, 256); x.stroke();
      x.beginPath(); x.moveTo(0, i + .5); x.lineTo(256, i + .5); x.stroke();
    }
    // Labelled on its face so nobody can mistake this for a real map: the
    // sweep runs offline and the basemap is drawn here, not fetched from OSM.
    x.fillStyle = "#b3a794";
    x.font = "11px system-ui, sans-serif"; x.textAlign = "center";
    x.fillText("QA offline basemap", 128, 130);
    x.fillText("(not real geography)", 128, 146);
    return c.toDataURL("image/png").split(",")[1];
  })()`);

  const net = installNetworkPolicy(page, origin, partnersJson, tileB64);
  await net.enable();
  await page.send("Page.addScriptToEvaluateOnNewDocument", {
    source: bootHook({ bobaFocusOnboarded: "true", bobaFocusTourDone: "1" }),
  });
  await page.goto(origin + "/index.html", { waitMs: 1500 });

  const curatedFor = async (fix) => page.eval(`(() => {
    const la = ${fix.lat}, ln = ${fix.lng};
    const list = curatedNear(la, ln, 6000);
    list.sort((a, b) => haversine(la, ln, a.lat, a.lng) - haversine(la, ln, b.lat, b.lng));
    return list;
  })()`);

  const historyFor = async (minsList) => page.eval(`(() => {
    const mins = ${JSON.stringify(minsList)};
    const drinks = [], rewards = [];
    const bar = perkMinMinutes();
    const DAY = 86400000, now = Date.now();
    let total = 0;
    mins.forEach((m, i) => {
      const when = new Date(now - (mins.length - 1 - i) * DAY);
      const size = modeLabel();
      const before = total; total += m;
      // Mirrors completeSession() (app.js:2434-2446) exactly, including which of
      // the two partner lines a drink of this size would have printed.
      const partner = (bar > 0 && Math.floor(total / bar) > Math.floor(before / bar))
        ? "\\u{1F31F} Partner perk unlocked. Check the Boba Map"
        : durationLabel(bar > 0 ? bar - (total % bar) : 0) + " of focus until your next partner perk";
      drinks.unshift({
        id: uuid(), name: currentDrinkName(), size, color: BASES[state.base].color,
        minutes: m, sticker: state.sticker, dateKey: localDateKey(when)
      });
      rewards.unshift({
        id: uuid(), title: "You deserve to go get one in-person!",
        copy: size + " earned from " + minuteLabel(m) + ".",
        size, name: currentDrinkName(), minutes: m,
        pearls: Math.floor(m / 15), partner, partnerNext: !partner.startsWith("\\u{1F31F}")
      });
    });
    return { drinks, rewards, bar };
  })()`);

  const shops = { ithaca: await curatedFor(ITHACA), honolulu: await curatedFor(HONOLULU) };
  const fx = {
    tileB64,
    partnersJson,
    shops,
    // fetchRealBobaShops() keys its 24h cache by ~1 km cell (app.js:4699). Seeding
    // it is what keeps this sweep off the live Overpass API while still going
    // through the app's real cache-hit path with the app's own shop data.
    cacheKey: {
      ithaca: `bobaShops2:${ITHACA.lat.toFixed(2)},${ITHACA.lng.toFixed(2)}`,
      honolulu: `bobaShops2:${HONOLULU.lat.toFixed(2)},${HONOLULU.lng.toFixed(2)}`,
    },
    cacheValue: {
      ithaca: JSON.stringify({ t: Date.now(), shops: shops.ithaca }),
      honolulu: JSON.stringify({ t: Date.now(), shops: shops.honolulu }),
    },
    history150: await historyFor([90, 60]),
    history220: await historyFor([120, 100]),
    history240: await historyFor([60, 60, 60, 60]),
  };
  await page.close();
  return fx;
}

// ── Runner ──────────────────────────────────────────────────────────────────
async function main() {
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
  const before = new Set(readdirSync(OUT));

  const server = await serve(ROOT);
  const chrome = await launchChrome({ port: 9334, width: 1280, height: 900 });
  const origin = server.origin;

  // Browser-level connection. Browser.grantPermissions is not available on a
  // page session, and without it headless Chrome auto-DENIES geolocation, which
  // silently drops every map state onto the demo city.
  const info = await (await fetch(`http://127.0.0.1:${chrome.port}/json/version`)).json();
  const bws = new WebSocket(info.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    bws.addEventListener("open", res, { once: true });
    bws.addEventListener("error", rej, { once: true });
  });
  const browser = new Page(bws);   // Page is just JSON-RPC over a websocket
  await browser.send("Browser.grantPermissions", { origin, permissions: ["geolocation"] });

  const results = [];
  try {
    const fx = await prelude(chrome.port, origin);
    const states = buildStates(fx).filter((s) => !onlyArg || onlyArg.includes(s.id));

    for (const vp of VIEWPORTS) {
      for (const st of states) {
        const file = `${st.id}-${st.slug}${vp.id}.png`;
        guardName(file);
        const rec = { id: st.id, slug: st.slug, file, viewport: `${vp.w}x${vp.h}`, errors: [], blocked: [] };
        let page = null;
        try {
          page = await Page.open(chrome.port, { width: vp.w, height: vp.h, scale: vp.scale });
          page.port = chrome.port;
          const errors = page.collectErrors();
          rec.errors = errors;
          const net = installNetworkPolicy(page, origin, fx.partnersJson, fx.tileB64);
          rec.blocked = net.blocked;
          rec.fulfilled = net.fulfilled;
          await net.enable();
          if (st.geo) {
            await page.send("Emulation.setGeolocationOverride", {
              latitude: st.geo.lat, longitude: st.geo.lng, accuracy: 20,
            });
          }
          const seed = typeof st.seed === "function" ? st.seed() : st.seed;
          await page.send("Page.addScriptToEvaluateOnNewDocument", { source: bootHook(seed) });
          await page.goto(origin + "/index.html", { waitMs: 900 });

          const out = await st.run(page);
          if (!out.ok) {
            rec.captured = false;
            rec.why = out.why || "assertion failed";
            console.log(`  ✗ ${file}  NOT CAPTURED: ${rec.why}`);
          } else {
            const bytes = await page.screenshot(join(OUT, file));
            rec.captured = true;
            rec.bytes = bytes;
            rec.evidence = out.evidence || "";
            console.log(`  ✓ ${file}  ${(bytes / 1024).toFixed(0)} KB  ${rec.evidence}`);
          }
        } catch (e) {
          rec.captured = false;
          rec.why = `threw: ${e.message}`;
          console.log(`  ✗ ${file}  NOT CAPTURED: ${rec.why}`);
        } finally {
          if (page) await page.close();
        }
        results.push(rec);
      }
    }
  } finally {
    try { bws.close(); } catch (e) {}
    chrome.close();
    await server.close();
  }

  // ── Report ────────────────────────────────────────────────────────────────
  const captured = results.filter((r) => r.captured);
  const missing = results.filter((r) => !r.captured);
  const withErrors = results.filter((r) => r.errors.length);
  const blockedAll = new Set();
  for (const r of results) for (const u of r.blocked) blockedAll.add(u);

  console.log("\n── console errors, per state ─────────────────────────────────");
  for (const r of results) console.log(`  ${r.file}: ${JSON.stringify(r.errors)}`);

  console.log("\n── external requests blocked (no live service was contacted) ──");
  if (!blockedAll.size) console.log("  (none attempted)");
  for (const u of blockedAll) console.log(`  ${u}`);

  console.log("\n── external requests served locally instead ───────────────────");
  const served = {};
  for (const r of results) for (const f of (r.fulfilled || [])) served[f] = (served[f] || 0) + 1;
  if (!Object.keys(served).length) console.log("  (none)");
  for (const k of Object.keys(served)) console.log(`  ${k}  x${served[k]}`);

  console.log(`\n── summary ───────────────────────────────────────────────────`);
  console.log(`  captured: ${captured.length}/${results.length}`);
  for (const r of missing) console.log(`  NOT CAPTURED  ${r.file}: ${r.why}`);
  const after = readdirSync(OUT);
  const clobbered = [...before].filter((f) => f.endsWith(".png") && OWNED_PREFIXES.some((p) => f.startsWith(p)) && !after.includes(f));
  console.log(`  pre-existing owned PNGs still present: ${clobbered.length === 0 ? "yes (none removed)" : "NO - " + clobbered.join(", ")}`);

  if (withErrors.length) {
    console.log(`\nFAIL: ${withErrors.length} state(s) produced JS errors.`);
    process.exit(1);
  }
  if (missing.length) {
    console.log(`\nFAIL: ${missing.length} state(s) not captured (recorded above, nothing substituted).`);
    process.exit(2);
  }
  console.log("\nPASS: every state captured, zero JS errors.");
}

main().catch((e) => { console.error(e); process.exit(1); });
