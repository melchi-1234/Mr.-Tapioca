const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");

function sourceBetween(startNeedle, endNeedle) {
  const start = appSource.indexOf(startNeedle);
  const end = appSource.indexOf(endNeedle, start + startNeedle.length);
  assert.notEqual(start, -1, `missing ${startNeedle}`);
  assert.notEqual(end, -1, `missing ${endNeedle}`);
  return appSource.slice(start, end);
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function loadAuthority({ enabled, ready, localRewards = 7, serverProgress, accountState } = {}) {
  const context = {
    window: {},
    earnedPerkCount: () => localRewards,
    perkProgress: () => ({ bar: 240, done: 239, left: 1 }),
    durationLabel: (minutes) => `${minutes} minutes`,
  };
  context.RewardV2 = {
    enabled,
    ready,
    available: () => [{ id: "server-reward" }],
    progress: () => serverProgress === undefined
      ? ({ bar: 240, done: 60, left: 180 })
      : serverProgress,
  };
  context.window.RewardV2 = context.RewardV2;
  if (accountState) {
    context.SquadCloud = { enabled: true, accountState: () => accountState };
    context.window.SquadCloud = context.SquadCloud;
  }
  vm.createContext(context);
  vm.runInContext(
    sourceBetween("// ── ONE QUESTION, TWO POSSIBLE ANSWERERS", "function perkProgress()"),
    context,
  );
  return context;
}

function loadCompletion({ running, abandonReward = false } = {}) {
  const events = [];
  const state = {
    running,
    elapsed: 1800,
    shieldWasUp: true,
    lastTick: 1,
    mode: "medium",
    base: "classic",
    sticker: "",
    shopTheme: "",
    collection: [],
    rewards: [],
    dailyGoal: 999,
    devMode: true,
    blockPenalty: 0,
  };
  const context = {
    window: {},
    state,
    Math,
    Date,
    Promise,
    REWARD_UNBLOCKED_FRACTION: 0.5,
    BASES: { classic: { color: "#fff" } },
    FocusBlocker: {
      available: () => true,
      wasActive: () => true,
      stop: () => events.push("shield-stop"),
    },
    FocusActivity: { stop() {} },
    RewardV2: {
      enabled: true,
      completeSession: () => { events.push("reward-complete"); return true; },
      abandonSession: () => { events.push("reward-abandon"); return true; },
    },
    stopTicker() { state.running = false; }, stopAmbience() {}, stopMusic() {},
    clearTimeout() {}, setTimeout() {}, setWalk() {}, setMakerState() {},
    walkTimer: null, currentMakerState: "",
    MrTNotify: null,
    trkOnce() {}, trk() {},
    modeDuration: () => 1800,
    modeLabel: () => "Medium",
    currentDrinkName: () => "Classic Milk Tea",
    uuid: (() => { let i = 0; return () => `id-${++i}`; })(),
    localDateKey: () => "2026-08-17",
    MrTMetrics: { drinkFinished() {} },
    totalMinutes: () => 0,
    awardPearls() {},
    todayMinutes: () => 0,
    rewardServerMode: () => true,
    cloudAccountRewardsOffCopy: () => null,
    perkMinMinutes: () => 240,
    durationLabel: (n) => `${n} minutes`,
    minuteLabel: (n) => `${n} minutes`,
    saveState() {}, renderAll() {}, bumpQuest() {}, sessionChime() {}, haptic() {},
    showReward() {}, serverRewardCompletionSummary: () => ({ partner: "done", partnerNext: false }),
    lastReward: null,
    els: { rewardDialog: { open: false } },
    renderRewardPartner() {},
    checkBadges: () => 0,
    showToast() {}, playSfx() {},
  };
  context.window.RewardV2 = context.RewardV2;
  vm.createContext(context);
  vm.runInContext(
    sourceBetween("function completeSession(options)", "// The one first-party install link"),
    context,
  );
  context.completeSession(abandonReward ? { abandonReward: true } : undefined);
  return { context, events, state };
}

function loadRedeemHarness({
  progress = { bar: 240, done: 60, left: 180 },
  accountState = "active",
  serverReady = true,
  heldReward = (partnerId) => ({ id: `held-${partnerId}`, policy_id: "pilot" }),
  policies = [{ id: "pilot", active: true, required_minutes: 240, progress_minutes: 60 }],
  shareConsent = true,
  leaseMode = "ok",
} = {}) {
  // ONE queue. 1.2.0 deleted the open/mint round trip, so the only network call
  // this card can make is the single atomic spend, and any test that still needs
  // to talk about "the open response" is describing a system that no longer runs.
  const spendRequests = [];
  const shares = [];
  const analytics = [];
  const toasts = [];
  const confirmations = [];
  let renders = 0;
  let lifecycle = accountState;
  let identity = 1;
  let client = { identity };
  const intervalCallbacks = [];
  const makeClassList = () => {
    const names = new Set();
    return {
      add: (...values) => values.forEach((value) => names.add(value)),
      remove: (...values) => values.forEach((value) => names.delete(value)),
      toggle(name, on) {
        if (on === undefined) on = !names.has(name);
        if (on) names.add(name); else names.delete(name);
      },
      contains: (name) => names.has(name),
    };
  };
  const makeElement = () => ({ textContent: "", classList: makeClassList() });
  let context;
  // A real <dialog> dispatches "close" to every listener, and app.js hangs two
  // things off that event: closeRedeem (wired at boot) and the deferred share
  // prompt (registered per redemption by onRedeemDialogClosed). Faking only the
  // first would make the share prompt unreachable and silently untested.
  const closeListeners = [];
  const dialog = {
    open: false,
    classList: makeClassList(),
    showModal() { this.open = true; },
    addEventListener(type, fn) { if (type === "close") closeListeners.push(fn); },
    removeEventListener(type, fn) {
      const at = closeListeners.indexOf(fn);
      if (at >= 0) closeListeners.splice(at, 1);
    },
    close() {
      this.open = false;
      closeListeners.slice().forEach((fn) => fn());
    },
  };
  context = {
    window: {},
    Promise,
    Date,
    playSfx() {},
    trk: (event, data) => analytics.push({ event, data }),
    showToast: (copy) => toasts.push(copy),
    rewardsInHand: () => serverReady ? 1 : 0,
    rewardProgressNow: () => typeof progress === "function" ? progress() : progress,
    rewardServerMode: () => true,
    rewardServerReady: () => serverReady,
    durationLabel: (n) => `${n} minutes`,
    clearInterval() {},
    setInterval(fn) { intervalCallbacks.push(fn); return intervalCallbacks.length; },
    // The share prompt is deferred behind the dialog's close with a 120 ms timer,
    // so the timer has to actually fire or no test could ever see the prompt.
    setTimeout(fn) { fn(); return 1; },
    RewardV2: {
      policies,
      // In-memory lookup, no network. Which shop a held reward belongs to is now
      // decided before the card paints, so the fixture has to answer per shop.
      rewardFor: (partnerId) =>
        typeof heldReward === "function" ? heldReward(partnerId) : heldReward,
      redeem(rewardId, partnerId) {
        return new Promise((resolve, reject) =>
          spendRequests.push({ rewardId, partnerId, resolve, reject }));
      },
    },
    askConfirm: async (copy, options) => {
      confirmations.push({ copy, options });
      return shareConsent;
    },
    shareRewardEarned: (value) => shares.push(value),
    renderAll: () => { renders++; },
    state: { perkRedemptions: [] },
    earnedPerkCount: () => 0,
    saveState() {},
    mapObj: null,
    els: {
      redeemShop: makeElement(),
      redeemAddress: makeElement(),
      redeemPerk: makeElement(),
      redeemConfirmBtn: { disabled: false },
      redeemNote: makeElement(),
      redeemStar: makeElement(),
      redeemEyebrow: makeElement(),
      redeemUsed: makeElement(),
      redeemDismissBtn: makeElement(),
      redeemStamp: makeElement(),
      redeemDialog: dialog,
    },
  };
  context.window.RewardV2 = context.RewardV2;
  const squad = {
    enabled: true,
    accountState: () => lifecycle,
    client: async () => {
      if (leaseMode === "throw-client") throw new Error("client unavailable");
      return leaseMode === "null-client" ? null : client;
    },
    captureAccountLease(candidate) {
      if (leaseMode === "throw-capture") throw new Error("capture unavailable");
      return lifecycle === "active" && candidate === client
        ? Object.freeze({ identity }) : null;
    },
    isAccountLeaseCurrent(lease) {
      if (leaseMode === "throw-check") throw new Error("lease check unavailable");
      return !!(lease && lifecycle === "active" && lease.identity === identity);
    },
  };
  if (leaseMode === "missing") {
    delete squad.client;
    delete squad.captureAccountLease;
    delete squad.isAccountLeaseCurrent;
  }
  context.SquadCloud = squad;
  context.window.SquadCloud = context.SquadCloud;
  vm.createContext(context);
  vm.runInContext(
    sourceBetween("function cloudAccountState()", "function rewardsInHand()"),
    context,
  );
  vm.runInContext(
    sourceBetween("let redeemPartner = null;", "// ── Study Squad (friends leaderboard"),
    context,
  );
  // Mirror app.js's own boot wiring (els.redeemDialog.addEventListener("close",
  // closeRedeem)) so a close in a test goes down the same path as a real one.
  dialog.addEventListener("close", context.closeRedeem);
  return {
    context,
    spendRequests,
    shares,
    analytics,
    toasts,
    confirmations,
    get renders() { return renders; },
    runLatestTick() {
      const tick = intervalCallbacks[intervalCallbacks.length - 1];
      if (tick) tick();
    },
    setAccountLifecycle(next) {
      if (lifecycle !== next) {
        lifecycle = next;
        identity++;
        client = { identity };
      }
    },
    rotateAccount(next = "active") {
      if (lifecycle === "active") {
        lifecycle = "pending_delete";
        identity++;
        client = { identity };
      }
      if (next === "active") {
        lifecycle = "active";
        identity++;
        client = { identity };
      } else {
        lifecycle = next;
      }
    },
  };
}

// Drain every queued microtask. The account lease resolves through a chain of
// four or five of them and the spend adds more, so counting ticks by hand is
// exactly how this file used to go flaky.
async function flushRedeem() {
  await new Promise((resolve) => setImmediate(resolve));
}

// A retired card is one the student can no longer spend. With the code element
// gone, what proves it is that the card never flipped to its stamped "Used"
// face — the only thing a barista reads as "this reward was honoured" — and that
// the action is dead with an honest reason under it.
function assertRedeemRetired(h, copy = /account.*changed|cloud.*off|couldn.t verify|unavailable|close.*open/i) {
  assert.equal(h.context.els.redeemDialog.classList.contains("is-used"), false);
  assert.equal(h.context.els.redeemUsed.textContent, "");
  assert.equal(h.context.els.redeemConfirmBtn.disabled, true);
  assert.equal(h.context.els.redeemDialog.classList.contains("not-ready"), true);
  assert.match(h.context.els.redeemNote.textContent, copy);
}

function loadRewardShareHarness({
  nativeShare = true,
  nativeResult = "success",
  clipboardResult = "success",
} = {}) {
  const card = deferred();
  const nativeGate = deferred();
  const clipboardGate = deferred();
  const analytics = [];
  const nativeShares = [];
  const downloads = [];
  const clipboard = [];
  const toasts = [];
  const objectUrls = [];
  const effects = [];
  const context = {
    Promise,
    buildRewardCard: () => card.promise,
    File: class File {
      constructor(parts, name, options) {
        this.parts = parts;
        this.name = name;
        this.type = options && options.type;
      }
    },
    durationLabel: (minutes) => `${minutes} minutes`,
    installLink: () => "https://mrtapioca.me/download?src=reward_share",
    trk: (event, data) => {
      analytics.push({ event, data });
      effects.push("analytics");
    },
    navigator: {
      canShare: () => nativeShare,
      share: async (payload) => {
        nativeShares.push(payload);
        effects.push("native-share-start");
        if (nativeResult === "deferred") await nativeGate.promise;
        if (nativeResult === "abort") {
          const error = new Error("share cancelled");
          error.name = "AbortError";
          throw error;
        }
        if (nativeResult === "error") throw new Error("share unavailable");
        effects.push("native-share-success");
      },
      clipboard: {
        writeText: async (value) => {
          clipboard.push(value);
          effects.push("clipboard");
          if (clipboardResult === "deferred") await clipboardGate.promise;
          if (clipboardResult === "reject") throw new Error("clipboard denied");
        },
      },
    },
    URL: {
      createObjectURL(blob) { objectUrls.push(blob); return "blob:reward-card"; },
      revokeObjectURL() {},
    },
    document: {
      body: { appendChild() {} },
      createElement() {
        return {
          click() {
            downloads.push(true);
            effects.push("download");
          },
          remove() {},
        };
      },
    },
    setTimeout() {},
    showToast: (copy) => {
      toasts.push(copy);
      effects.push("toast");
    },
  };
  vm.createContext(context);
  vm.runInContext(
    sourceBetween("async function shareRewardEarned(", "async function shareDrink(reward)"),
    context,
  );
  return {
    context, card, nativeGate, clipboardGate, analytics, nativeShares, downloads,
    clipboard, toasts, objectUrls, effects,
  };
}

function loadCloudAccountUI({
  accountState = "active",
  deleteResult = { ok: true, deleted: true, optedOut: true },
  cleanupResult = true,
  enableResult = true,
  enableActivatesButUnsynced = false,
  consent = true,
  deleteLifecycle,
  onConfirm,
  onCleanup,
  onEnable,
  onRewardInit,
  onDelete,
  onDeletionCleanup,
  onClient,
  clientMode = "ok",
  deletionIntentMode = "ok",
  deleteDeferred = null,
} = {}) {
  let lifecycle = accountState;
  let identity = 1;
  let client = { identity };
  const calls = [];
  const events = [];
  const toasts = [];
  const confirmations = [];
  const classes = new Set(["hidden"]);
  const label = { textContent: "" };
  const button = {
    textContent: "",
    disabled: false,
    classList: {
      toggle(name, on) { if (on) classes.add(name); else classes.delete(name); },
    },
  };
  const row = {
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      toggle(name, on) { if (on) classes.add(name); else classes.delete(name); },
    },
    querySelector: (selector) => selector === ".settings-row-label" ? label : null,
  };
  const setLifecycle = (next) => {
    if (lifecycle !== next) {
      lifecycle = next;
      identity++;
      client = { identity };
    }
  };
  const deletionIntents = new WeakMap();
  const context = {
    window: {},
    Promise,
    document: {
      querySelector(selector) {
        if (selector === "#deleteAccountRow") return row;
        if (selector === "#deleteAccountBtn") return button;
        return null;
      },
    },
    SquadCloud: {
      enabled: true,
      ready: accountState === "active",
      accountState: () => lifecycle,
      client: async () => {
        events.push("client");
        if (clientMode === "throw") throw new Error("client unavailable");
        const result = client;
        if (onClient) onClient({ setLifecycle, lifecycle });
        return clientMode === "null" ? null : result;
      },
      captureAccountLease(candidate) {
        return lifecycle === "active" && candidate === client
          ? Object.freeze({ identity }) : null;
      },
      isAccountLeaseCurrent(lease) {
        return !!(lease && lifecycle === "active" && lease.identity === identity);
      },
      captureDeletionIntent() {
        events.push("capture-intent");
        if (deletionIntentMode === "throw-capture") throw new Error("intent unavailable");
        if (deletionIntentMode === "null") return null;
        const intent = Object.freeze({});
        if (deletionIntentMode !== "forged" && lifecycle === "active") {
          deletionIntents.set(intent, identity);
        }
        return intent;
      },
      isDeletionIntentCurrent(intent) {
        events.push("check-intent");
        if (deletionIntentMode === "throw-check") throw new Error("intent check unavailable");
        return !!(intent && lifecycle === "active" && deletionIntents.get(intent) === identity);
      },
      init: async () => { calls.push("cloud-init"); return true; },
      deleteAccount: () => {
        events.push("delete");
        calls.push("delete");
        if (deleteLifecycle) setLifecycle(deleteLifecycle);
        else if (deleteResult.deleted) setLifecycle("opted_out");
        else if (!deleteResult.ok && accountState === "pending_delete") setLifecycle("pending_delete");
        if (onDelete) onDelete({ setLifecycle, lifecycle });
        return deleteDeferred ? deleteDeferred.promise : Promise.resolve(deleteResult);
      },
      enableAccountCreation: async () => {
        calls.push("enable");
        if (enableResult || enableActivatesButUnsynced) setLifecycle("active");
        if (onEnable) onEnable({ setLifecycle, lifecycle });
        return enableResult;
      },
    },
    RewardV2: {
      enabled: true,
      ready: false,
      resetAfterAccountDeletion: async () => {
        calls.push("cleanup");
        const hook = calls.includes("delete") ? onDeletionCleanup : onCleanup;
        if (hook) hook({ setLifecycle, lifecycle });
        return cleanupResult;
      },
      init: async () => {
        calls.push("reward-init");
        if (onRewardInit) onRewardInit({ setLifecycle, lifecycle });
        return true;
      },
      available: () => [],
      progress: () => null,
    },
    askConfirm: async (copy, options) => {
      events.push("confirm");
      confirmations.push({ copy, options });
      if (onConfirm) onConfirm({ setLifecycle, lifecycle });
      return consent;
    },
    showToast: (copy) => toasts.push(copy),
    renderSquad: () => calls.push("render-squad"),
    earnedPerkCount: () => 0,
    perkProgress: () => ({ bar: 240, done: 0, left: 240 }),
  };
  if (deletionIntentMode === "missing") {
    delete context.SquadCloud.captureDeletionIntent;
    delete context.SquadCloud.isDeletionIntentCurrent;
  }
  context.window.SquadCloud = context.SquadCloud;
  context.window.RewardV2 = context.RewardV2;
  vm.createContext(context);
  vm.runInContext(
    sourceBetween("// ── ONE QUESTION, TWO POSSIBLE ANSWERERS", "function perkProgress()"),
    context,
  );
  return {
    context, calls, events, toasts, confirmations, classes, label, button,
    setLifecycle,
    lifecycle: () => lifecycle,
  };
}

test("enabled Reward V2 stays the sole authority while its first sync is unavailable", () => {
  const context = loadAuthority({ enabled: true, ready: false, localRewards: 99 });

  assert.equal(context.rewardServerMode(), true,
    "native V2 must not switch back to the editable local ledger during an outage");
  assert.equal(context.rewardServerReady(), false);
  assert.equal(context.rewardsInHand(), 0,
    "unverified server state must expose no spendable reward");
  assert.equal(context.rewardProgressNow(), null,
    "unverified server progress must not be replaced by localStorage arithmetic");
});

test("ready Reward V2 reads only server rewards and progress", () => {
  const context = loadAuthority({ enabled: true, ready: true, localRewards: 99 });

  assert.equal(context.rewardServerMode(), true);
  assert.equal(context.rewardServerReady(), true);
  assert.equal(context.rewardsInHand(), 1);
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.rewardProgressNow())),
    { bar: 240, done: 60, left: 180 },
  );
});

test("implicit progress suppresses an inactive server policy", () => {
  const context = loadAuthority({
    enabled: true,
    ready: true,
    serverProgress: {
      bar: 240,
      done: 60,
      left: 180,
      policy: { id: "paused-pilot", active: false },
    },
  });

  assert.equal(context.rewardProgressNow(), null);
});

test("web/local mode keeps the existing local reward behavior", () => {
  const context = loadAuthority({ enabled: false, ready: false, localRewards: 3 });

  assert.equal(context.rewardServerMode(), false);
  assert.equal(context.rewardServerReady(), false);
  assert.equal(context.rewardsInHand(), 3);
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.rewardProgressNow())),
    { bar: 240, done: 239, left: 1 },
  );
});

// The reward bar is new in 1.2.0 and it has two homes (the drink-complete card
// and the Settings sheet), so it is a third surface that could quietly answer
// the reward question from the wrong authority.
function loadRewardBar(options) {
  const context = loadAuthority(options);
  const names = new Set();
  const wrap = {
    hidden: false,
    classList: {
      add: (name) => names.add(name),
      remove: (name) => names.delete(name),
      contains: (name) => names.has(name),
    },
  };
  vm.runInContext(
    sourceBetween("function renderRewardProgressBar(wrap, countEl, fillEl)",
                  "// Settings copy of the same bar."),
    context,
  );
  return {
    context, wrap, names,
    countEl: { textContent: "" },
    fillEl: { style: { width: "" } },
    render() { context.renderRewardProgressBar(this.wrap, this.countEl, this.fillEl); },
  };
}

test("the reward progress bar never quotes a number the server has not confirmed", () => {
  // Enabled-but-unsynced is UNKNOWN. This bar is the one number in the app tied
  // to something a real shop will be asked to honour, so it hides rather than
  // falling back to the editable local ledger's arithmetic.
  const unsynced = loadRewardBar({ enabled: true, ready: false, localRewards: 99 });
  unsynced.render();
  assert.equal(unsynced.wrap.hidden, true);
  assert.equal(unsynced.countEl.textContent, "");
  assert.equal(unsynced.names.has("is-full"), false);

  // A reward already in hand is a full bar, not progress toward one. "0m of 4h"
  // to someone holding a redeemable reward reads as if it had been spent.
  const held = loadRewardBar({ enabled: true, ready: true });
  held.render();
  assert.equal(held.wrap.hidden, false);
  assert.equal(held.names.has("is-full"), true);
  assert.equal(held.countEl.textContent, "1 ready to use");
  assert.equal(held.fillEl.style.width, "100%");

  // Mid-bar states both halves, because "2h to go" hides the 2h already done.
  const partway = loadRewardBar({
    enabled: true, ready: true, serverProgress: { bar: 240, done: 120, left: 120 },
  });
  partway.context.RewardV2.available = () => [];
  partway.render();
  assert.equal(partway.wrap.hidden, false);
  assert.equal(partway.names.has("is-full"), false);
  assert.equal(partway.countEl.textContent, "120 minutes of 240 minutes");
  assert.equal(partway.fillEl.style.width, "50%");
});

test("enabled-but-unsynced V2 cannot spend the editable local reward ledger", () => {
  const context = loadAuthority({ enabled: true, ready: false, localRewards: 99 });
  context.redeemPartner = { id: "u-tea", name: "U Tea", perk: "10% off" };
  // No redeemContext means no server-issued reward in hand. The server branch
  // must return there, and must NOT fall through to the v1 local ledger below it.
  context.redeemContext = null;
  context.state = { perkRedemptions: [] };
  context.saveCalls = 0;
  context.saveState = () => { context.saveCalls++; };
  vm.runInContext(
    sourceBetween("function confirmRedeem()", "// ── Study Squad (friends leaderboard"),
    context,
  );

  context.confirmRedeem();

  assert.deepEqual(context.state.perkRedemptions, []);
  assert.equal(context.saveCalls, 0,
    "server-authoritative failure must not fall through to a local redemption write");
});

test("the counter explains an unavailable server instead of quoting local progress", () => {
  const redeemSource = sourceBetween("let redeemPartner = null;", "// ── Study Squad (friends leaderboard");
  const classNames = new Set();
  const context = {
    redeemPartner: null,
    redeemClock: null,
    rewardsInHand: () => 0,
    rewardProgressNow: () => null,
    rewardServerMode: () => true,
    rewardServerReady: () => false,
    cloudAccountRewardsOffCopy: () => null,
    durationLabel: () => { throw new Error("local progress must not be rendered"); },
    playSfx() {},
    trk() {},
    clearInterval() {},
    setInterval() { return 1; },
    setTimeout(fn) { fn(); return 1; },
    showToast() {},
    Date,
    Promise,
    els: {
      redeemShop: { textContent: "" },
      redeemAddress: { textContent: "" },
      redeemPerk: { textContent: "" },
      redeemConfirmBtn: { disabled: false },
      redeemNote: { textContent: "" },
      redeemStar: { textContent: "" },
      redeemEyebrow: { textContent: "" },
      redeemUsed: { textContent: "" },
      redeemDismissBtn: { textContent: "" },
      redeemStamp: { textContent: "" },
      redeemDialog: {
        open: false,
        classList: {
          add: (name) => classNames.add(name),
          remove: (name) => classNames.delete(name),
          toggle: (name, on) => on ? classNames.add(name) : classNames.delete(name),
          contains: (name) => classNames.has(name),
        },
        showModal() { this.open = true; },
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(redeemSource, context);

  // There is deliberately no RewardV2 in this context. An unverified server must
  // not even reach for the in-memory reward lookup, let alone localStorage
  // arithmetic — a missing-global throw here would be a real regression.
  context.openRedeem({ id: "u-tea", name: "U Tea", address: "", perk: "10% off" });

  assert.equal(context.els.redeemConfirmBtn.disabled, true);
  assert.match(context.els.redeemNote.textContent, /couldn.t verify|could not verify|couldn.t sync/i);
  assert.equal(classNames.has("not-ready"), true);
});

test("opening a card paints the cached shop with no network call and arms the button in the same tick", () => {
  const h = loadRedeemHarness();

  h.context.openRedeem({ id: "shop-a", name: "Cached A", address: "12 A Street", perk: "10% off" });

  // Synchronously, in the tap's own tick. This is the whole 1.2.0 change: the
  // card is readable and spendable the instant it opens, because there is
  // nothing left to fetch. The old flow spent two round trips here behind the
  // words "Getting your code…", at a register, with a queue behind you.
  assert.equal(h.context.els.redeemShop.textContent, "Cached A");
  assert.equal(h.context.els.redeemAddress.textContent, "12 A Street");
  assert.equal(h.context.els.redeemPerk.textContent, "10% off");
  assert.equal(h.context.els.redeemConfirmBtn.disabled, false);
  assert.equal(h.context.els.redeemDialog.classList.contains("not-ready"), false);
  assert.equal(h.context.els.redeemNote.textContent, "You have 1 reward saved.");
  assert.equal(h.context.els.redeemDialog.open, true);
  assert.equal(h.spendRequests.length, 0, "opening a card must dispatch zero RPCs");
  assert.notEqual(h.context.els.redeemStamp.textContent, "",
    "the ticking stamp is the only live thing left on the card, so it must start at once");
});

test("a second shop replaces the first card's copy with its own cached snapshot", async () => {
  const h = loadRedeemHarness();

  h.context.openRedeem({ id: "shop-a", name: "Cached A", address: "A", perk: "Old A" });
  await flushRedeem();
  h.context.openRedeem({ id: "shop-b", name: "Cached B", address: "B", perk: "Old B" });
  await flushRedeem();

  assert.equal(h.context.els.redeemShop.textContent, "Cached B");
  assert.equal(h.context.els.redeemPerk.textContent, "Old B");
  assert.equal(h.context.els.redeemConfirmBtn.disabled, false);
  assert.equal(h.spendRequests.length, 0);
});

test("tapping the instant-on button before its background lease lands still spends", async () => {
  // openRedeem enables this button synchronously and warms the account lease in
  // the background, which IS the one-tap feature. A tap that beats the warm has
  // to capture a lease inline (confirmRedeem carries a branch for exactly that)
  // rather than retiring the card a student is already holding across a counter.
  const h = loadRedeemHarness();
  h.context.openRedeem({ id: "shop-a", name: "Shop A", address: "A", perk: "Offer A" });

  h.context.confirmRedeem();   // deliberately not flushed: no lease exists yet
  await flushRedeem();

  assert.equal(h.spendRequests.length, 1,
    "the inline captureRedeemAccountLease() fallback must be reachable");
});

test("a queued double tap spends the reward exactly once", async () => {
  const h = loadRedeemHarness();
  h.context.openRedeem({ id: "shop-a", name: "Shop A", address: "A", perk: "Offer A" });
  await flushRedeem();

  // Three taps in one tick is the real case: the later ones were dispatched
  // before the button's disable could land, so the disable cannot be the guard.
  // Clearing heldId before the RPC goes out is what actually latches this.
  h.context.confirmRedeem();
  h.context.confirmRedeem();
  h.context.confirmRedeem();
  await flushRedeem();
  assert.equal(h.spendRequests.length, 1, "one reward, one spend");

  h.context.confirmRedeem();
  await flushRedeem();
  assert.equal(h.spendRequests.length, 1,
    "a later tap finds no heldId left in the context and has nothing to spend");
});

test("successful server redemption shares only the issuance bar the spend response returned", async () => {
  let progress = { bar: 120, done: 30, left: 90 };
  const h = loadRedeemHarness({
    progress: () => progress,
    heldReward: { id: "held-1", policy_id: "held-policy" },
    policies: [
      { id: "active-policy", active: true, required_minutes: 120, progress_minutes: 30 },
      { id: "held-policy", active: false, required_minutes: 60, progress_minutes: 60 },
    ],
  });
  h.context.openRedeem({ id: "shop-a", name: "Cached Shop", address: "A", perk: "Cached offer" });
  await flushRedeem();

  h.context.confirmRedeem();
  await flushRedeem();
  assert.equal(h.spendRequests.length, 1);
  assert.deepEqual(
    { rewardId: h.spendRequests[0].rewardId, partnerId: h.spendRequests[0].partnerId },
    { rewardId: "held-1", partnerId: "shop-a" },
    "the spend names the reward and the shop, and nothing else identifies the student");

  progress = { bar: 60, done: 0, left: 60 };
  h.spendRequests[0].resolve({
    ok: true,
    partner_name: "Redeemed Server Shop",
    offer_text: "Redeemed server offer",
    cashier_note: "Enjoy",
    bar_minutes: 240,
    redeemed_at: "2026-08-17T20:01:00Z",
    server_time: "2026-08-17T20:01:00Z",
  });
  await flushRedeem();

  // The prompt waits until the card has been put away. A share sheet stacked on
  // the stamp mid-transaction is the last thing anyone wants, and on iOS Safari
  // it lands behind the backdrop anyway.
  assert.equal(h.confirmations.length, 0);
  h.context.els.redeemDialog.close();
  await flushRedeem();
  assert.equal(h.confirmations.length, 1);

  // 240 is the reward's own issuance bar off the spend response. Neither the
  // active policy (120) nor the live progress bar (60) may leak in as a stand-in.
  assert.deepEqual(JSON.parse(JSON.stringify(h.shares)), [{
    minutes: 240,
    shopName: "Redeemed Server Shop",
    offerText: "Redeemed server offer",
    redeemed: true,
  }]);
});

test("a completed redemption stamps the card in place instead of closing it", async () => {
  const h = loadRedeemHarness();
  const spend = await beginDeferredSpend(h,
    { id: "shop-a", name: "Shop A", address: "A", perk: "Offer A" });
  const stampBefore = h.context.els.redeemStamp.textContent;

  spend.resolve({
    ok: true, partner_name: "Authoritative A", offer_text: "Redeemed A",
    cashier_note: "Enjoy", bar_minutes: 240,
    redeemed_at: "2026-08-17T20:01:00Z", server_time: "2026-08-17T20:01:00Z",
  });
  await flushRedeem();

  // The barista is looking at this exact screen. Closing the sheet the instant
  // the reward is spent leaves them staring at a map, and a toast is gone in
  // three seconds, so the card itself has to say it.
  assert.equal(h.context.els.redeemDialog.open, true);
  assert.equal(h.context.els.redeemDialog.classList.contains("is-used"), true);
  assert.equal(h.context.els.redeemEyebrow.textContent, "Redeemed");
  assert.match(h.context.els.redeemUsed.textContent, /^Used .+Enjoy/);
  assert.equal(h.context.els.redeemDismissBtn.textContent, "Done");
  assert.equal(h.context.els.redeemShop.textContent, "Authoritative A");
  assert.equal(h.context.els.redeemPerk.textContent, "Redeemed A");
  assert.equal(h.context.els.redeemNote.textContent, "");
  assert.equal(h.context.els.redeemConfirmBtn.disabled, true);
  assert.equal(h.toasts.length, 0, "the card states it; a toast would only repeat it");
  assert.equal(h.renders, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(h.analytics[h.analytics.length - 1])),
    { event: "redemption_completed", data: { partner_id: "shop-a" } });

  // The stamp freezes once spent. A running clock on a used reward is a lie.
  h.runLatestTick();
  assert.equal(h.context.els.redeemStamp.textContent, stampBefore);
});

test("reopening after a redemption shows a fresh unspent face", async () => {
  const h = loadRedeemHarness();
  const spend = await beginDeferredSpend(h,
    { id: "shop-a", name: "Shop A", address: "A", perk: "Offer A" });
  spend.resolve({
    ok: true, partner_name: "Authoritative A", offer_text: "Redeemed A",
    cashier_note: "Enjoy", bar_minutes: 240,
    redeemed_at: "2026-08-17T20:01:00Z", server_time: "2026-08-17T20:01:00Z",
  });
  await flushRedeem();
  h.context.els.redeemDialog.close();
  await flushRedeem();

  h.context.openRedeem({ id: "shop-b", name: "Shop B", address: "B", perk: "Offer B" });

  assert.equal(h.context.els.redeemDialog.classList.contains("is-used"), false);
  assert.equal(h.context.els.redeemUsed.textContent, "");
  assert.equal(h.context.els.redeemEyebrow.textContent, "Show this at the counter");
  assert.equal(h.context.els.redeemDismissBtn.textContent, "Not now");
  assert.equal(h.context.els.redeemConfirmBtn.disabled, false,
    "the previous card's spent state must not carry over and kill a fresh one");
});

test("closing and reopening the same shop rejects the older spend response", async () => {
  const h = loadRedeemHarness();
  const shop = { id: "shop-a", name: "Cached A", address: "A", perk: "Old A" };

  const stale = await beginDeferredSpend(h, shop);
  h.context.els.redeemDialog.close();
  h.context.openRedeem(shop);
  await flushRedeem();

  stale.resolve({
    ok: true, partner_name: "Stale Server A", offer_text: "Stale offer",
    cashier_note: "Enjoy", bar_minutes: 240,
    redeemed_at: "2026-08-17T20:01:00Z", server_time: "2026-08-17T20:01:00Z",
  });
  await flushRedeem();

  // Same shop, same partner_id: only the generation counter tells the dead view
  // apart from the live one, and it has to, or a closed card's answer stamps the
  // card now on screen.
  assert.equal(h.context.els.redeemShop.textContent, "Cached A");
  assert.equal(h.context.els.redeemPerk.textContent, "Old A");
  assert.equal(h.context.els.redeemDialog.classList.contains("is-used"), false);
  assert.equal(h.context.els.redeemConfirmBtn.disabled, false);
  assert.equal(h.renders, 0);
  assert.equal(h.shares.length, 0);
});

test("an account lease invalidated while the card sits open cannot permit a spend", async () => {
  const h = loadRedeemHarness();
  h.context.openRedeem({ id: "shop-a", name: "Cached A", address: "A", perk: "Old A" });
  await flushRedeem();
  assert.equal(h.context.els.redeemConfirmBtn.disabled, false);

  h.rotateAccount("pending_delete");
  h.context.confirmRedeem();
  await flushRedeem();

  assert.equal(h.context.els.redeemShop.textContent, "Cached A");
  assert.equal(h.spendRequests.length, 0);
  assertRedeemRetired(h);
});

test("a card opened for account A cannot spend after account B replaces its lease", async () => {
  const h = loadRedeemHarness();
  h.context.openRedeem({ id: "shop-a", name: "Cached A", address: "A", perk: "Old A" });
  await flushRedeem();
  assert.equal(h.context.els.redeemConfirmBtn.disabled, false);

  // Still "active", but a different anonymous identity. The lifecycle word alone
  // is not enough — this is the case a bare accountState() check would wave through.
  h.rotateAccount("active");
  h.context.confirmRedeem();
  await flushRedeem();

  assert.equal(h.spendRequests.length, 0);
  assertRedeemRetired(h);
});

test("a broken account lease lets the card open instantly but still refuses the spend", async () => {
  // The lease no longer gates the card — that is the point of the rework — so the
  // failure has to land at the spend instead, and it has to fail closed there.
  for (const leaseMode of ["missing", "throw-client", "null-client", "throw-capture", "throw-check"]) {
    const h = loadRedeemHarness({ leaseMode });
    h.context.openRedeem({ id: "shop-a", name: "Cached A", address: "A", perk: "Old A" });
    assert.equal(h.context.els.redeemConfirmBtn.disabled, false,
      `${leaseMode} must not stall the card behind a lease it cannot get`);
    await flushRedeem();

    h.context.confirmRedeem();
    await flushRedeem();
    assert.equal(h.spendRequests.length, 0, `${leaseMode} must dispatch zero spend RPCs`);
    assertRedeemRetired(h);
  }
});

test("the next timer tick retires a live card whose account lease became stale", async () => {
  const h = loadRedeemHarness();
  h.context.openRedeem({ id: "shop-a", name: "Cached A", address: "A", perk: "Old A" });
  await flushRedeem();
  assert.notEqual(h.context.els.redeemStamp.textContent, "", "the card is live and ticking");

  h.rotateAccount("pending_delete");
  h.runLatestTick();
  assertRedeemRetired(h);

  h.context.confirmRedeem();
  await flushRedeem();
  assert.equal(h.spendRequests.length, 0);
});

async function beginDeferredSpend(h, shop) {
  h.context.openRedeem(shop);
  await flushRedeem();
  h.context.confirmRedeem();
  await flushRedeem();
  return h.spendRequests[h.spendRequests.length - 1];
}

test("a spend response cannot publish after its account lease is invalidated", async () => {
  const h = loadRedeemHarness();
  const spend = await beginDeferredSpend(h,
    { id: "shop-a", name: "Shop A", address: "A", perk: "Offer A" });
  h.rotateAccount("active");
  spend.resolve({
    ok: true, partner_name: "Authoritative A", offer_text: "Redeemed A",
    cashier_note: "Enjoy", bar_minutes: 240,
    redeemed_at: "2026-08-17T20:01:00Z", server_time: "2026-08-17T20:01:00Z",
  });
  await flushRedeem();

  assert.equal(h.context.els.redeemDialog.open, true);
  assertRedeemRetired(h);
  assert.equal(h.toasts.length, 0);
  assert.equal(h.renders, 0);
  assert.equal(h.confirmations.length, 0);
  assert.equal(h.shares.length, 0);
});

test("a rejected spend retires the card and cannot re-enable the dead action", async () => {
  const h = loadRedeemHarness();
  const spend = await beginDeferredSpend(h,
    { id: "shop-a", name: "Shop A", address: "A", perk: "Offer A" });
  spend.reject(new Error("network lost"));
  await flushRedeem();

  assertRedeemRetired(h, /close this and open it again when you have a signal/i);
  assert.equal(h.context.els.redeemDialog.open, true);

  h.context.confirmRedeem();
  await flushRedeem();
  assert.equal(h.spendRequests.length, 1, "a retired card cannot dispatch a second spend");
});

test("an old shop refusal cannot repaint or attribute a newer shop dialog", async () => {
  const h = loadRedeemHarness();
  const spendA = await beginDeferredSpend(h,
    { id: "shop-a", name: "Shop A", address: "A", perk: "Offer A" });
  h.context.openRedeem({ id: "shop-b", name: "Shop B", address: "B", perk: "Offer B" });
  await flushRedeem();
  const analyticsBefore = h.analytics.length;

  spendA.resolve({ ok: false, reason: "failed_already_redeemed" });
  await flushRedeem();

  assert.equal(h.context.els.redeemDialog.open, true);
  assert.equal(h.context.els.redeemShop.textContent, "Shop B");
  assert.equal(h.context.els.redeemNote.textContent, "You have 1 reward saved.");
  assert.equal(h.context.els.redeemConfirmBtn.disabled, false,
    "shop B's own card must stay spendable");
  assert.equal(h.analytics.length, analyticsBefore,
    "a dead view must not file redemption_failed against the shop now on screen");
  assert.equal(h.toasts.length, 0);
});

test("an old shop success cannot stamp, publish, or share over a newer shop dialog", async () => {
  const h = loadRedeemHarness();
  const spendA = await beginDeferredSpend(h,
    { id: "shop-a", name: "Shop A", address: "A", perk: "Offer A" });
  h.context.openRedeem({ id: "shop-b", name: "Shop B", address: "B", perk: "Offer B" });
  await flushRedeem();
  const analyticsBefore = h.analytics.length;

  spendA.resolve({
    ok: true, partner_name: "Authoritative A", offer_text: "Redeemed A",
    cashier_note: "Enjoy", bar_minutes: 240,
    redeemed_at: "2026-08-17T20:01:00Z", server_time: "2026-08-17T20:01:00Z",
  });
  await flushRedeem();

  assert.equal(h.context.els.redeemDialog.open, true);
  assert.equal(h.context.els.redeemShop.textContent, "Shop B");
  assert.equal(h.context.els.redeemDialog.classList.contains("is-used"), false,
    "shop A's redemption must not stamp shop B's card as used");
  assert.equal(h.context.els.redeemNote.textContent, "You have 1 reward saved.");
  assert.equal(h.analytics.length, analyticsBefore);
  assert.equal(h.toasts.length, 0);
  assert.equal(h.renders, 0);
  assert.equal(h.confirmations.length, 0);
  assert.equal(h.shares.length, 0);
});

test("every reachable refusal gets plain-English copy and leaves nothing spendable", async () => {
  // The complete reachable set for redeem_reward. failed_code_expired and
  // failed_code_unavailable are gone with the handoff table that produced them.
  const reasons = [
    ["failed_not_found", /couldn.t use this reward/i],
    ["failed_partner_paused", /not offering the reward right now/i],
    ["failed_already_redeemed", /already been used/i],
    ["failed_expired", /has expired/i],
    ["failed_wrong_partner", /different shop/i],
    ["failed_offer_changed", /changed its offer/i],
    ["failed_capped", /reached its limit/i],
    ["failed_outside_window", /not available at this time of day/i],
    // Anything the SDK could not prove — an unrecognised reason, a dispatch or
    // lease failure — arrives as this, and it must read as "unknown", not "no".
    ["ambiguous", /couldn.t use this reward/i],
  ];
  for (const [reason, copy] of reasons) {
    const h = loadRedeemHarness();
    const spend = await beginDeferredSpend(h,
      { id: "shop-a", name: "Shop A", address: "A", perk: "Offer A" });
    spend.resolve({ ok: false, reason });
    await flushRedeem();

    // A student reading "failed_offer_changed" at a counter learns nothing and
    // cannot act, so every one of these says what happened in words.
    assert.match(h.context.els.redeemNote.textContent, copy, reason);
    assert.equal(h.context.els.redeemDialog.classList.contains("is-used"), false,
      `${reason} must not stamp the card as used`);
    assert.equal(h.context.els.redeemConfirmBtn.disabled, true, reason);
    assert.deepEqual(JSON.parse(JSON.stringify(h.analytics[h.analytics.length - 1])),
      { event: "redemption_failed", data: { partner_id: "shop-a", reason } });

    h.context.confirmRedeem();
    await flushRedeem();
    assert.equal(h.spendRequests.length, 1, `${reason} must not leave a second spend available`);
    assert.equal(h.shares.length, 0);
    assert.deepEqual(h.context.state.perkRedemptions, [],
      "a server refusal must never fall through to the editable local ledger");
  }
});

test("a refusal cannot repaint the shop name, offer, or minutes onto the card", async () => {
  // The old redeem_by_code answered refusals with partner_name and offer_text,
  // and 1.2.0 tightened the server to `{ok:false, reason}` and nothing else. The
  // client is the second lock: a response carrying them must not be believed.
  const h = loadRedeemHarness();
  const spend = await beginDeferredSpend(h,
    { id: "shop-a", name: "Shop A", address: "12 A Street", perk: "Offer A" });
  spend.resolve({
    ok: false,
    reason: "failed_wrong_partner",
    partner_name: "Somebody Else's Shop",
    offer_text: "A free drink you did not earn",
    cashier_note: "Hand it over",
    bar_minutes: 240,
  });
  await flushRedeem();

  assert.equal(h.context.els.redeemShop.textContent, "Shop A");
  assert.equal(h.context.els.redeemAddress.textContent, "12 A Street");
  assert.equal(h.context.els.redeemPerk.textContent, "Offer A");
  assert.match(h.context.els.redeemNote.textContent, /different shop/i);

  h.context.els.redeemDialog.close();
  await flushRedeem();
  assert.equal(h.confirmations.length, 0, "a refusal has nothing to offer for sharing");
  assert.equal(h.shares.length, 0);
});

test("holding a reward for another shop keeps this shop's button dead and says so", async () => {
  // rewardsInHand() says 1, but rewardFor(shop-b) says none. Spending anyway
  // would earn a failed_wrong_partner from the server; refusing here means the
  // request never leaves the phone and the student is told why.
  const h = loadRedeemHarness({
    heldReward: (partnerId) =>
      partnerId === "shop-a" ? { id: "held-a", policy_id: "pilot" } : null,
  });
  h.context.openRedeem({ id: "shop-b", name: "Shop B", address: "B", perk: "Offer B" });
  await flushRedeem();

  assert.equal(h.context.els.redeemNote.textContent, "No reward for this shop yet.");
  assert.equal(h.context.els.redeemConfirmBtn.disabled, true);
  assert.equal(h.context.els.redeemDialog.classList.contains("not-ready"), true);

  h.context.confirmRedeem();
  await flushRedeem();
  assert.equal(h.spendRequests.length, 0);
  assert.deepEqual(h.context.state.perkRedemptions, []);
});

test("a malformed spend bar never falls back to current policy or implicit progress", async () => {
  // bar_minutes is the reward's OWN issuance bar and it reaches the client on
  // this response and nowhere else. Missing or out of range means the share card
  // is not offered at all, rather than quoting whatever bar happens to be current.
  for (const barMinutes of [null, undefined, 0, 14, 1441, "240", 240.5]) {
    const h = loadRedeemHarness({
      progress: { bar: 120, done: 30, left: 90 },
      heldReward: { id: "held-1", policy_id: "other-policy" },
      policies: [{ id: "other-policy", active: true, required_minutes: 120, progress_minutes: 30 }],
    });
    const spend = await beginDeferredSpend(h,
      { id: "shop-a", name: "Shop A", address: "A", perk: "Offer A" });
    spend.resolve({
      ok: true, partner_name: "Authoritative A", offer_text: "Redeemed A",
      cashier_note: "Enjoy", bar_minutes: barMinutes,
      redeemed_at: "2026-08-17T20:01:00Z", server_time: "2026-08-17T20:01:00Z",
    });
    await flushRedeem();

    // The redemption itself still lands and the card still stamps. Only the
    // shareable card, which cannot be drawn without a real bar, is withheld.
    assert.equal(h.context.els.redeemDialog.classList.contains("is-used"), true,
      `bar_minutes ${barMinutes} must not undo a committed redemption`);
    h.context.els.redeemDialog.close();
    await flushRedeem();
    assert.equal(h.confirmations.length, 0, `bar_minutes ${barMinutes} must not offer a card`);
    assert.equal(h.shares.length, 0);
  }
});

test("a newer open invalidates an older completed redemption's pending share choice", async () => {
  const consent = deferred();
  const h = loadRedeemHarness({ shareConsent: consent.promise });
  const spend = await beginDeferredSpend(h,
    { id: "shop-a", name: "Shop A", address: "A", perk: "Offer A" });
  spend.resolve({
    ok: true, partner_name: "Authoritative A", offer_text: "Redeemed A",
    cashier_note: "Enjoy", bar_minutes: 240,
    redeemed_at: "2026-08-17T20:01:00Z", server_time: "2026-08-17T20:01:00Z",
  });
  await flushRedeem();
  h.context.els.redeemDialog.close();
  await flushRedeem();
  assert.equal(h.confirmations.length, 1,
    "putting the stamped card away is what ASKS for the share, not what cancels it");

  h.context.openRedeem({ id: "shop-b", name: "Shop B", address: "B", perk: "Offer B" });
  consent.resolve(true);
  await flushRedeem();
  assert.equal(h.shares.length, 0,
    "a share answer from the old completed view cannot publish over a newer view");
});

test("no handoff-code machinery survives anywhere in the client", () => {
  // 1.2.0 deleted the six-character cashier code end to end: the SQL functions,
  // the SDK methods, the mock, the code element, and the page a cashier was
  // supposed to type it into (which was never deployed). These are the names
  // that would come back first if a merge restored the minting branch, and every
  // one of them costs a network round trip at a register.
  const live = appSource.replace(/^\s*\/\/.*$/gm, "");
  for (const gone of [
    "redeemCode", "Getting your code", "Show this code to the cashier",
    "openRedemption", "redeemByCode", "checkCode",
    "failed_code_expired", "failed_code_unavailable",
  ]) {
    assert.equal(live.includes(gone), false, `${gone} must not survive in app.js`);
  }
  // And what replaced them: one atomic call by the reward's own owner, and a
  // card that flips where it stands instead of closing.
  assert.match(appSource, /RewardV2\.redeem\(spend\.heldId, spend\.partnerId\)/,
    "the spend must be the single redeem_reward call");
  assert.match(appSource, /setRedeemUsedFace\(new Date\(\)\)/,
    "success must stamp the open card rather than dismissing it");
});

test("real reward sharing has no side effects after its captured account becomes stale", async () => {
  const scenarios = [
    { nativeShare: true, rejectCard: false },
    { nativeShare: false, rejectCard: false },
    { nativeShare: false, rejectCard: true },
  ];
  for (const scenario of scenarios) {
    const h = loadRewardShareHarness({ nativeShare: scenario.nativeShare });
    let current = true;
    const sharing = h.context.shareRewardEarned({
      minutes: 240,
      shopName: "Account A Shop",
      offerText: "Account A Offer",
      redeemed: true,
    }, () => current);
    current = false;
    if (scenario.rejectCard) h.card.reject(new Error("card generation failed"));
    else h.card.resolve({ type: "image/png" });
    await sharing;

    assert.equal(h.analytics.length, 0, "stale share must not publish analytics");
    assert.equal(h.nativeShares.length, 0, "stale share must not open the native sheet");
    assert.equal(h.downloads.length, 0, "stale share must not download a card");
    assert.equal(h.clipboard.length, 0, "stale share must not write the install link");
    assert.equal(h.toasts.length, 0, "stale share must not publish success or error copy");
  }

  const h = loadRewardShareHarness({ nativeShare: true, nativeResult: "deferred" });
  let current = true;
  const sharing = h.context.shareRewardEarned({
    minutes: 240,
    shopName: "Account A Shop",
    offerText: "Account A Offer",
    redeemed: true,
  }, () => current);
  h.card.resolve({ type: "image/png" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.nativeShares.length, 1, "the native share must be awaiting its result");
  current = false;
  h.nativeGate.resolve();
  await sharing;
  assert.equal(h.analytics.length, 0,
    "an account change while native share is pending suppresses later analytics");
  assert.equal(h.downloads.length, 0);
  assert.equal(h.clipboard.length, 0);
  assert.equal(h.toasts.length, 0);

  const web = loadRewardShareHarness({ nativeShare: false, clipboardResult: "deferred" });
  let webCurrent = true;
  const webSharing = web.context.shareRewardEarned({
    minutes: 240,
    shopName: "Account A Shop",
    offerText: "Account A Offer",
    redeemed: true,
  }, () => webCurrent);
  web.card.resolve({ type: "image/png" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(web.downloads.length, 1);
  assert.equal(web.analytics.length, 1);
  assert.equal(web.clipboard.length, 1, "clipboard write must be awaiting its result");
  webCurrent = false;
  web.clipboardGate.resolve();
  await webSharing;
  assert.equal(web.toasts.length, 0,
    "an account change while clipboard access is pending suppresses later copy");
});

test("reward share analytics records only successful native shares and initiated downloads", async () => {
  const successfulNative = loadRewardShareHarness({
    nativeShare: true,
    nativeResult: "deferred",
  });
  const nativeSharing = successfulNative.context.shareRewardEarned({
    minutes: 240, shopName: "U Tea", offerText: "10% off", redeemed: true,
  }, () => true);
  successfulNative.card.resolve({ type: "image/png" });
  await new Promise((resolve) => setImmediate(resolve));
  const analyticsBeforeNativeSuccess = successfulNative.analytics.length;
  successfulNative.nativeGate.resolve();
  await nativeSharing;
  assert.equal(analyticsBeforeNativeSuccess, 0,
    "opening the native share sheet is not a completed share");
  assert.deepEqual(successfulNative.effects,
    ["native-share-start", "native-share-success", "analytics"]);
  assert.equal(successfulNative.analytics.length, 1);

  for (const nativeResult of ["abort", "error"]) {
    const failedNative = loadRewardShareHarness({ nativeShare: true, nativeResult });
    const failedSharing = failedNative.context.shareRewardEarned({
      minutes: 240, shopName: "U Tea", offerText: "10% off", redeemed: true,
    }, () => true);
    failedNative.card.resolve({ type: "image/png" });
    await failedSharing;
    assert.equal(failedNative.analytics.length, 0,
      `${nativeResult} must not count as a shared reward card`);
    assert.equal(failedNative.toasts.length, nativeResult === "error" ? 1 : 0);
  }

  const web = loadRewardShareHarness({ nativeShare: false });
  const webSharing = web.context.shareRewardEarned({
    minutes: 240, shopName: "U Tea", offerText: "10% off", redeemed: true,
  }, () => true);
  web.card.resolve({ type: "image/png" });
  await webSharing;
  assert.deepEqual(web.effects, ["download", "analytics", "clipboard", "toast"]);
  assert.equal(web.downloads.length, 1);
  assert.equal(web.analytics.length, 1);
  assert.equal(web.toasts[0], "Saved your card. The link is on your clipboard 🧋");
});

test("web reward sharing does not claim a rejected clipboard write succeeded", async () => {
  const h = loadRewardShareHarness({ nativeShare: false, clipboardResult: "reject" });
  const sharing = h.context.shareRewardEarned({
    minutes: 240, shopName: "U Tea", offerText: "10% off", redeemed: true,
  }, () => true);
  h.card.resolve({ type: "image/png" });
  assert.equal(await sharing, true, "the initiated card download remains successful");

  assert.deepEqual(h.effects, ["download", "analytics", "clipboard", "toast"]);
  assert.equal(h.downloads.length, 1);
  assert.equal(h.analytics.length, 1);
  assert.equal(h.clipboard.length, 1);
  assert.equal(h.toasts[0], "Saved your card, but the link could not be copied.");
});

test("the existing Settings row stays visible and renders exact cloud lifecycle actions", () => {
  const cases = [
    ["active", "Delete My Account", "Delete", true],
    ["pending_delete", "Account Deletion Pending", "Retry", false],
    ["opted_out", "Cloud & Partner Rewards Off", "Turn On", false],
  ];
  for (const [state, wantLabel, wantButton, danger] of cases) {
    const h = loadCloudAccountUI({ accountState: state });
    h.context.renderCloudAccountSettings();
    assert.equal(h.classes.has("hidden"), false);
    assert.equal(h.label.textContent, wantLabel);
    assert.equal(h.button.textContent, wantButton);
    assert.equal(h.classes.has("danger"), danger);
  }
});

test("reload initializes only an active cloud account and never auto-enables pending or opted-out states", async () => {
  for (const state of ["active", "pending_delete", "opted_out"]) {
    const h = loadCloudAccountUI({ accountState: state });
    await h.context.initializeCloudAccount();
    assert.deepEqual(h.calls, state === "active" ? ["cloud-init"] : []);
    assert.equal(h.classes.has("hidden"), false);
  }
});

test("the real boot path keeps pending and opted-out cloud and Reward clients off while preserving the recovery row", async () => {
  for (const state of ["active", "pending_delete", "opted_out"]) {
    const h = loadCloudAccountUI({ accountState: state });
    vm.runInContext(
      sourceBetween("let cloudInit = Promise.resolve(false);", "// ── Notification settings"),
      h.context,
    );
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(h.calls, state === "active" ? ["cloud-init", "reward-init"] : []);
    assert.equal(h.classes.has("hidden"), false);
  }
});

test("pending deletion retries delete without creating a new identity", async () => {
  const h = loadCloudAccountUI({
    accountState: "pending_delete",
    deleteResult: { ok: false, deleted: false, reason: "delete_ambiguous" },
  });
  await h.context.handleCloudAccountAction();
  assert.deepEqual(h.calls, ["delete", "render-squad"]);
  assert.deepEqual(h.events, ["delete"],
    "pending retry must not capture an active-account deletion intent or ask for consent");
  assert.equal(h.confirmations.length, 0);
  assert.match(h.toasts[0], /deletion is still pending/i);
  assert.match(h.toasts[0], /cloud and partner rewards are off/i);
  assert.match(h.toasts[0], /retry when connected/i);
});

test("Turn On consent cannot clean or enable after opted-out changes to active", async () => {
  const h = loadCloudAccountUI({
    accountState: "opted_out",
    onConfirm: ({ setLifecycle }) => setLifecycle("active"),
  });
  const result = await h.context.handleCloudAccountAction();
  assert.equal(result, false);
  assert.deepEqual(h.calls, []);
  assert.equal(h.toasts.length, 0);
  assert.equal(h.label.textContent, "Delete My Account");
});

test("an active identity rotation during delete confirmation cannot delete the replacement account", async () => {
  const h = loadCloudAccountUI({
    accountState: "active",
    onConfirm: ({ setLifecycle }) => {
      setLifecycle("opted_out");
      setLifecycle("active");
    },
  });
  const result = await h.context.handleCloudAccountAction();
  assert.equal(result, false);
  assert.deepEqual(h.calls, []);
  assert.equal(h.toasts.length, 1);
  assert.equal(h.toasts[0],
    "Couldn’t verify that this is still the same cloud account, so nothing was deleted. Try again.");
});

test("a deletion confirmation that becomes pending publishes pending recovery copy", async () => {
  const h = loadCloudAccountUI({
    accountState: "active",
    onConfirm: ({ setLifecycle }) => setLifecycle("pending_delete"),
  });
  const result = await h.context.handleCloudAccountAction();
  assert.equal(result, false);
  assert.deepEqual(h.calls, []);
  assert.equal(h.toasts.length, 1);
  assert.equal(h.toasts[0],
    "Account deletion is still pending. Cloud and partner rewards are off. Retry when connected in Settings.");
  assert.equal(h.label.textContent, "Account Deletion Pending");
  assert.equal(h.button.textContent, "Retry");
});

test("a deletion confirmation that becomes opted out publishes off-until-Turn-On copy", async () => {
  const h = loadCloudAccountUI({
    accountState: "active",
    onConfirm: ({ setLifecycle }) => setLifecycle("opted_out"),
  });
  const result = await h.context.handleCloudAccountAction();
  assert.equal(result, false);
  assert.deepEqual(h.calls, []);
  assert.equal(h.toasts.length, 1);
  assert.equal(h.toasts[0],
    "Cloud and partner rewards are off on this device until you turn them on in Settings.");
  assert.equal(h.label.textContent, "Cloud & Partner Rewards Off");
  assert.equal(h.button.textContent, "Turn On");
});

test("active deletion latches pending immediately after consent without acquiring a client", async () => {
  const deletion = deferred();
  const h = loadCloudAccountUI({
    accountState: "active",
    clientMode: "throw",
    deleteLifecycle: "pending_delete",
    deleteResult: { ok: false, deleted: false, reason: "delete_ambiguous" },
    deleteDeferred: deletion,
  });

  const action = h.context.handleCloudAccountAction();
  assert.deepEqual(h.events.slice(0, 2), ["capture-intent", "confirm"],
    "deletion intent must be captured synchronously before the confirmation awaits");
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(h.events, ["capture-intent", "confirm", "check-intent", "delete"]);
  assert.equal(h.lifecycle(), "pending_delete",
    "deleteAccount must durably latch pending before its network promise settles");
  assert.deepEqual(h.calls, ["delete"]);

  deletion.resolve({ ok: false, deleted: false, reason: "delete_ambiguous" });
  await action;
  assert.deepEqual(h.calls, ["delete", "render-squad"]);
  assert.match(h.toasts[0], /deletion is still pending/i);
});

test("active deletion fails closed with truthful copy when deletion intent cannot be proven", async () => {
  for (const deletionIntentMode of ["missing", "null", "forged", "throw-capture", "throw-check"]) {
    const h = loadCloudAccountUI({ accountState: "active", deletionIntentMode });
    const result = await h.context.handleCloudAccountAction();
    assert.equal(result, false, deletionIntentMode);
    assert.deepEqual(h.calls, [], `${deletionIntentMode} must dispatch zero deletes`);
    assert.equal(h.toasts.length, 1, `${deletionIntentMode} needs truthful user feedback`);
    assert.match(h.toasts[0], /same cloud account|account changed|nothing was deleted/i);
  }
});

test("Turn On revalidates opted-out after cleanup and active after enable and client acquisition", async () => {
  const afterCleanup = loadCloudAccountUI({
    accountState: "opted_out",
    onCleanup: ({ setLifecycle }) => setLifecycle("active"),
  });
  assert.equal(await afterCleanup.context.handleCloudAccountAction(), false);
  assert.deepEqual(afterCleanup.calls, ["cleanup"]);

  const afterEnable = loadCloudAccountUI({
    accountState: "opted_out",
    onEnable: ({ setLifecycle }) => setLifecycle("pending_delete"),
  });
  assert.equal(await afterEnable.context.handleCloudAccountAction(), false);
  assert.deepEqual(afterEnable.calls, ["cleanup", "enable"]);

  const afterClient = loadCloudAccountUI({
    accountState: "opted_out",
    onClient: ({ setLifecycle, lifecycle }) => {
      if (lifecycle === "active") setLifecycle("pending_delete");
    },
  });
  assert.equal(await afterClient.context.handleCloudAccountAction(), false);
  assert.deepEqual(afterClient.calls, ["cleanup", "enable"]);
});

test("active becoming pending during Reward initialization cannot publish Turn On success", async () => {
  const h = loadCloudAccountUI({
    accountState: "opted_out",
    onRewardInit: ({ setLifecycle }) => setLifecycle("pending_delete"),
  });
  const result = await h.context.handleCloudAccountAction();
  assert.equal(result, false);
  assert.deepEqual(h.calls, ["cleanup", "enable", "reward-init"]);
  assert.equal(h.toasts.length, 0);
  assert.equal(h.label.textContent, "Account Deletion Pending");
  assert.equal(h.button.textContent, "Retry");
});

test("the same enabled-account lease must remain current through Reward initialization", async () => {
  const h = loadCloudAccountUI({
    accountState: "opted_out",
    onRewardInit: ({ setLifecycle }) => {
      setLifecycle("opted_out");
      setLifecycle("active");
    },
  });
  const result = await h.context.handleCloudAccountAction();
  assert.equal(result, false);
  assert.deepEqual(h.calls, ["cleanup", "enable", "reward-init"]);
  assert.equal(h.toasts.length, 0);
});

test("a newer cloud action owns the button while an older cleanup finishes", async () => {
  const h = loadCloudAccountUI({ accountState: "opted_out" });
  const firstCleanup = deferred();
  const secondConsent = deferred();
  let confirmations = 0;
  h.context.askConfirm = () => {
    confirmations++;
    return confirmations === 1 ? Promise.resolve(true) : secondConsent.promise;
  };
  h.context.RewardV2.resetAfterAccountDeletion = () => {
    h.calls.push("cleanup");
    return firstCleanup.promise;
  };

  const older = h.context.handleCloudAccountAction();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(h.button.disabled, true);
  const newer = h.context.handleCloudAccountAction();
  firstCleanup.resolve(false);
  await older;
  assert.equal(h.button.disabled, true,
    "an older finally path must not re-enable the button owned by a newer action");
  secondConsent.resolve(false);
  await newer;
  assert.equal(h.button.disabled, false);
});

test("explicit Turn On requires consent and a true Reward cleanup before enabling and initializing", async () => {
  const cancelled = loadCloudAccountUI({ accountState: "opted_out", consent: false });
  await cancelled.context.handleCloudAccountAction();
  assert.deepEqual(cancelled.calls, []);
  assert.match(cancelled.confirmations[0].copy, /new anonymous cloud account/i);
  assert.match(cancelled.confirmations[0].copy, /Study Squad and partner rewards/i);

  const blocked = loadCloudAccountUI({ accountState: "opted_out", cleanupResult: false });
  await blocked.context.handleCloudAccountAction();
  assert.deepEqual(blocked.calls, ["cleanup"]);
  assert.match(blocked.toasts[0], /stay off/i);

  const enableFailed = loadCloudAccountUI({ accountState: "opted_out", enableResult: false });
  await enableFailed.context.handleCloudAccountAction();
  assert.deepEqual(enableFailed.calls, ["cleanup", "enable"]);
  assert.match(enableFailed.toasts[0], /still off/i);

  const activeUnsynced = loadCloudAccountUI({
    accountState: "opted_out",
    enableResult: false,
    enableActivatesButUnsynced: true,
  });
  await activeUnsynced.context.handleCloudAccountAction();
  assert.deepEqual(activeUnsynced.calls, ["cleanup", "enable", "reward-init", "render-squad"]);
  assert.match(activeUnsynced.toasts[0], /on/i);
  assert.match(activeUnsynced.toasts[0], /couldn.t sync/i);
  assert.equal(activeUnsynced.label.textContent, "Delete My Account");

  const enabled = loadCloudAccountUI({ accountState: "opted_out" });
  await enabled.context.handleCloudAccountAction();
  assert.deepEqual(enabled.calls, ["cleanup", "enable", "reward-init", "render-squad"]);
});

test("confirmed deletion discloses all erased server data and preserves local drinks, pearls, and collection", async () => {
  const h = loadCloudAccountUI({ accountState: "active", cleanupResult: false });
  await h.context.handleCloudAccountAction();
  const copy = h.confirmations[0].copy;
  for (const phrase of ["cloud profile", "friends", "verified focus history", "minutes", "held partner rewards", "active redemption codes"]) {
    assert.match(copy, new RegExp(phrase, "i"));
  }
  assert.match(copy, /on-device drinks, pearls, and collection remain/i);
  assert.deepEqual(h.calls, ["delete", "cleanup", "render-squad"]);
  assert.match(h.toasts[0], /cleanup didn.t finish/i);
  assert.match(h.toasts[0], /stay off/i);
});

test("deleted true with pending lifecycle keeps Retry copy even when Reward cleanup fails", async () => {
  const h = loadCloudAccountUI({
    accountState: "active",
    deleteResult: { ok: false, deleted: true, optedOut: true, reason: "state_persist_failed" },
    deleteLifecycle: "pending_delete",
    cleanupResult: false,
  });
  const result = await h.context.handleCloudAccountAction();
  assert.equal(result, false);
  assert.deepEqual(h.calls, ["delete", "cleanup", "render-squad"]);
  assert.match(h.toasts[0], /deletion is still pending/i);
  assert.match(h.toasts[0], /retry when connected/i);
  assert.doesNotMatch(h.toasts[0], /turn on/i);
  assert.equal(h.label.textContent, "Account Deletion Pending");
  assert.equal(h.button.textContent, "Retry");
});

test("a deleted result in an active lifecycle is stale and cannot clear Reward artifacts", async () => {
  const h = loadCloudAccountUI({
    accountState: "active",
    deleteResult: { ok: true, deleted: true, optedOut: true },
    deleteLifecycle: "active",
  });
  const result = await h.context.handleCloudAccountAction();
  assert.equal(result, false);
  assert.deepEqual(h.calls, ["delete"]);
  assert.equal(h.toasts.length, 0);
});

test("a lifecycle change during post-delete cleanup suppresses stale deletion publication", async () => {
  const h = loadCloudAccountUI({
    accountState: "active",
    onDeletionCleanup: ({ setLifecycle }) => setLifecycle("active"),
  });
  const result = await h.context.handleCloudAccountAction();
  assert.equal(result, false);
  assert.deepEqual(h.calls, ["delete", "cleanup"]);
  assert.equal(h.toasts.length, 0);
});

test("deletion results distinguish refusal, confirmed deletion, and incomplete local sign-out", async () => {
  const refused = loadCloudAccountUI({
    accountState: "active",
    deleteResult: { ok: false, deleted: false, reason: "delete_failed" },
  });
  await refused.context.handleCloudAccountAction();
  assert.deepEqual(refused.calls, ["delete", "render-squad"]);
  assert.match(refused.toasts[0], /couldn.t delete/i);

  const deleted = loadCloudAccountUI({ accountState: "active" });
  await deleted.context.handleCloudAccountAction();
  assert.deepEqual(deleted.calls, ["delete", "cleanup", "render-squad"]);
  assert.match(deleted.toasts[0], /account deleted/i);
  assert.match(deleted.toasts[0], /until you turn them on/i);

  const signoutIncomplete = loadCloudAccountUI({
    accountState: "active",
    deleteResult: { ok: false, deleted: true, optedOut: true, reason: "signout_failed" },
  });
  await signoutIncomplete.context.handleCloudAccountAction();
  assert.deepEqual(signoutIncomplete.calls, ["delete", "cleanup", "render-squad"]);
  assert.match(signoutIncomplete.toasts[0], /cloud data was deleted/i);
  assert.match(signoutIncomplete.toasts[0], /until you turn them on/i);
});

test("pending and opted-out states stay truthful across completion, map, and counter copy", () => {
  const cases = [
    ["pending_delete", /deletion is still pending/i, /retry when connected/i],
    ["opted_out", /off on this device/i, /until you turn them on/i],
  ];
  for (const [state, stateCopy, actionCopy] of cases) {
    const authority = loadAuthority({ enabled: true, ready: false, accountState: state });
    const completion = authority.serverRewardCompletionSummary(false).partner;
    assert.match(completion, stateCopy);
    assert.match(completion, actionCopy);

    authority.els = { mapPerkBanner: { textContent: "", classList: { toggle() {} } } };
    vm.runInContext(
      sourceBetween("function renderPerkBanner(nearbyPartners)", "function renderShopList(items)"),
      authority,
    );
    authority.renderPerkBanner([]);
    assert.match(authority.els.mapPerkBanner.textContent, stateCopy);
    assert.match(authority.els.mapPerkBanner.textContent, actionCopy);

    const counter = loadRedeemHarness({ accountState: state, serverReady: false, progress: null });
    counter.context.openRedeem({ id: "shop-a", name: "Shop", address: "A", perk: "Offer" });
    assert.match(counter.context.els.redeemNote.textContent, stateCopy);
    assert.match(counter.context.els.redeemNote.textContent, actionCopy);
  }
});

test("pending and opted-out lifecycle overrides a stale ready Reward snapshot at the counter", async () => {
  for (const state of ["pending_delete", "opted_out"]) {
    const h = loadRedeemHarness({ accountState: state, serverReady: true });
    h.context.openRedeem({ id: "shop-a", name: "Shop", address: "A", perk: "Offer" });
    assert.equal(h.context.els.redeemConfirmBtn.disabled, true);
    // No reward is put in hand for an off account, so there is no heldId for a
    // tap to spend even if one somehow reaches confirmRedeem.
    h.context.confirmRedeem();
    await flushRedeem();
    assert.equal(h.spendRequests.length, 0, "an off account must not spend a reward");
  }
});

test("the drink-complete summary publishes only a delivered server snapshot", () => {
  const unavailable = loadAuthority({ enabled: true, ready: false, localRewards: 99 });
  assert.match(unavailable.serverRewardCompletionSummary(true).partner, /couldn.t sync/i);

  const ready = loadAuthority({ enabled: true, ready: true, localRewards: 99 });
  assert.match(ready.serverRewardCompletionSummary(true).partner, /^🌟 1 partner reward ready/);
  assert.match(ready.serverRewardCompletionSummary(false).partner, /couldn.t sync/i,
    "a failed close must not publish a stale previously-ready snapshot");

  const completion = sourceBetween("function completeSession(options)", "function installLink(");
  assert.match(completion,
    /if \(rewardServerMode\(\)\) \{[\s\S]*?Syncing your partner reward progress[\s\S]*?\} else \{[\s\S]*?const perkBar = perkMinMinutes\(\)/,
    "local reward arithmetic must exist only in the non-server branch");
});

test("reset abandons then releases the shield; pause abandons but KEEPS the shield up", () => {
  // Pause no longer lifts the Screen Time shield (only End/reset does), so a
  // paused session must NOT emit shield-stop — that is the whole anti-scroll fix.
  const expected = { pause: ["reward-abandon", "cancel-auto"], reset: ["reward-abandon", "shield-stop"] };
  for (const kind of ["pause", "reset"]) {
    const events = [];
    const context = {
      window: {}, Promise,
      state: {
        running: true, elapsed: 300, lastTick: 1, autoPaused: false,
        breakMakerCycleId: null, breakTimerId: null, breakElapsed: 0,
        phase: "focus", spillPending: false,
      },
      RewardV2: {
        enabled: true,
        abandonSession: () => { events.push("reward-abandon"); return true; },
        completeSession: () => { events.push("reward-complete"); return true; },
      },
      FocusBlocker: {
        stop: () => events.push("shield-stop"),
        available: () => true,
        cancelAutoUnblock: () => events.push("cancel-auto"),
      },
      FocusActivity: { stop() {} },
      updateCup() {}, refreshSessionChrome() {}, stopTicker() {}, stopAmbience() {}, stopMusic() {},
      MrTNotify: null, walkToStation() {}, saveState() {},
      closePlinko() {}, closePong() {}, stopGame() {}, clearTimeout() {}, clearInterval() {},
      setWalk() {}, setMakerState() {}, updatePhaseUI() {},
      walkTimer: null, currentMakerState: "",
      els: { shopScene: { classList: { remove() {} } } },
    };
    context.window.RewardV2 = context.RewardV2;
    vm.createContext(context);
    vm.runInContext(kind === "pause"
      ? sourceBetween("function pauseFocus()", "// ── App-blocking discoverability")
      : sourceBetween("function resetSession()", "function completeSession(options)"), context);
    context[kind === "pause" ? "pauseFocus" : "resetSession"]();
    assert.deepEqual(events, expected[kind]);
  }
});

test("the stopped 100 percent button routes through the non-running completion boundary", async () => {
  const calls = [];
  const context = {
    state: { autoPaused: true, running: false },
    progress: () => 1,
    completeSession: () => calls.push("complete"),
    pauseFocus: () => calls.push("pause"),
    FocusBlocker: {},
  };
  vm.createContext(context);
  vm.runInContext(
    sourceBetween("async function startPause()", "// The actual \"begin a running focus session\" body"),
    context,
  );
  await context.startPause();
  assert.deepEqual(calls, ["complete"]);
  assert.equal(context.state.running, false);
});

test("only an actively running finish earns server credit, while every completed local cup is banked", () => {
  for (const scenario of [
    { running: true, abandonReward: false, expected: "reward-complete" },
    { running: false, abandonReward: false, expected: "reward-abandon" },
    { running: false, abandonReward: true, expected: "reward-abandon" },
  ]) {
    const { events, state } = loadCompletion(scenario);
    assert.deepEqual(events, [scenario.expected, "shield-stop"]);
    assert.equal(state.collection.length, 1, "merchant-credit safety must not discard the local drink");
    assert.equal(state.rewards.length, 1);
  }

  const boot = sourceBetween("if (pendingResume && state.phase", "// First-time visitors");
  assert.match(boot, /completeSession\(\{ abandonReward: true \}\)/,
    "process downtime must not be turned into server reward credit on relaunch");
});
