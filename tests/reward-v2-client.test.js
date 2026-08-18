const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const RewardMock = require("../reward-mock.js");

const source = fs.readFileSync(path.join(__dirname, "..", "reward-v2.js"), "utf8");
const K_SESSION = "bobaRewardSession";
const K_QUEUE = "bobaRewardQueue";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function waitFor(predicate, message) {
  for (let i = 0; i < 50; i++) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail(message || "condition was not reached");
}

function ok(data = null) {
  return { data, error: null, status: 200 };
}

function startRow(id, planned = 25, state = "active") {
  return { id, started_at: "2026-08-17T12:00:00.000Z", state, planned_minutes: planned };
}

function closeRow(id, state = "completed", credited = state === "completed" ? 25 : 0) {
  return { id, state, credited_minutes: credited, eligible_minutes: credited };
}

function rewardRow(overrides = {}) {
  return Object.assign({
    id: "00000000-0000-4000-8000-000000000101",
    policy_id: "passport",
    partner_id: null,
    seq: 1,
    status: "issued",
    issued_at: "2026-08-17T12:00:00.000Z",
    expires_at: null,
    offer_version: null,
    redeemed_at: null,
    redeemed_partner_id: null,
  }, overrides);
}

function policyRow(overrides = {}) {
  return Object.assign({
    id: "passport",
    kind: "global_passport",
    required_minutes: 240,
    partner_id: null,
    expires_days: null,
    active: true,
    spent_minutes: 0,
    unspent_minutes: 0,
    progress_minutes: 0,
  }, overrides);
}

function rewardState(eligibleMinutes = 0) {
  return {
    eligible_minutes: eligibleMinutes,
    rewards: [],
    policies: [],
  };
}

function openRow(overrides = {}) {
  return Object.assign({
    ok: true,
    code: "ABC234",
    expires_at: "2026-08-17T12:05:00.000Z",
    server_time: "2026-08-17T12:00:00.000Z",
    partner_name: "U Tea",
    offer_text: "10% off",
    offer_version: 1,
    cashier_note: "Show before paying",
    bar_minutes: 240,
  }, overrides);
}

function acknowledgedSession(id, overrides = {}) {
  return Object.assign({
    id,
    planned: 25,
    platform: "ios",
    startedLocal: 1,
    serverAck: true,
  }, overrides);
}

function responseFor(name, args = {}) {
  if (name === "start_reward_session") {
    return ok([startRow(args.p_session_id, args.p_planned_minutes)]);
  }
  if (name === "complete_reward_session") return ok([closeRow(args.p_session_id)]);
  if (name === "abandon_reward_session") return ok([closeRow(args.p_session_id, "abandoned", 0)]);
  if (name === "issue_my_rewards") return ok([]);
  if (name === "my_reward_state") return ok(rewardState());
  throw new Error(`no canonical response fixture for ${name}`);
}

function loadRewardV2({
  initial = {},
  rpc,
  failQueueWrites = false,
  ids = ["00000000-0000-4000-8000-000000000001"],
  optedOut = false,
  focusActive = true,
  storageMap = null,
  squadClientReturnsNull = false,
  ownClientResolvesNull = false,
  accountState = optedOut ? "opted_out" : "active",
  squadPresent = true,
  malformedSquadModule,
  native = true,
  flag = true,
  cloudKeys = true,
  failSessionWrites = false,
  failSessionWriteAt = [],
  silentWriteKeys = [],
  readThrowKeys = [],
  failRemoveKeys = [],
  silentRemoveKeys = [],
  clientOverride = null,
  trackClientOverride = true,
} = {}) {
  const storage = storageMap || new Map();
  for (const [key, value] of Object.entries(initial)) {
    storage.set(key, typeof value === "string" ? value : JSON.stringify(value));
  }
  const calls = [];
  let idIndex = 0;
  let cloudAccountState = accountState;
  let squadClientCalls = 0;
  let ownClientLoads = 0;
  let sessionWriteCount = 0;
  let accountGeneration = 0;
  const accountLeaseBindings = new WeakMap();
  const nextReadFailures = new Set();
  const failedRemovals = new Set(failRemoveKeys);
  const silentRemovals = new Set(silentRemoveKeys);
  const client = clientOverride || {
    async rpc(name, args) {
      calls.push({ name, args: JSON.parse(JSON.stringify(args || {})) });
      if (rpc) return rpc(name, args || {}, calls);
      return responseFor(name, args || {});
    },
  };
  if (clientOverride && trackClientOverride) {
    const realRpc = clientOverride.rpc.bind(clientOverride);
    clientOverride.rpc = async (name, args) => {
      calls.push({ name, args: JSON.parse(JSON.stringify(args || {})) });
      return realRpc(name, args || {});
    };
  }
  let currentSquadClient = client;
  const squadCloud = {
    accountState: () => cloudAccountState,
    isOptedOut: () => cloudAccountState !== "active",
    async client() {
      squadClientCalls++;
      return cloudAccountState !== "active" || squadClientReturnsNull ? null : currentSquadClient;
    },
    captureAccountLease(candidate) {
      if (cloudAccountState !== "active" || candidate !== currentSquadClient) return null;
      const lease = Object.freeze(Object.create(null));
      accountLeaseBindings.set(lease, { client: candidate, generation: accountGeneration });
      return lease;
    },
    isAccountLeaseCurrent(lease) {
      const binding = lease && (typeof lease === "object" || typeof lease === "function")
        ? accountLeaseBindings.get(lease)
        : null;
      return !!(binding && cloudAccountState === "active" &&
        binding.client === currentSquadClient && binding.generation === accountGeneration);
    },
  };
  const focusBlocker = { _active: focusActive };
  const localStorage = {
    getItem(key) {
      if (nextReadFailures.has(key)) {
        nextReadFailures.delete(key);
        throw new Error("storage unreadable once");
      }
      if (readThrowKeys.includes(key)) throw new Error("storage unreadable");
      return storage.has(key) ? storage.get(key) : null;
    },
    setItem(key, value) {
      if (failQueueWrites && key === K_QUEUE) throw new Error("storage full");
      if (failSessionWrites && key === K_SESSION) throw new Error("storage full");
      if (key === K_SESSION) {
        sessionWriteCount++;
        if (failSessionWriteAt.includes(sessionWriteCount)) throw new Error("storage full");
      }
      if (silentWriteKeys.includes(key)) return;
      storage.set(key, String(value));
    },
    removeItem(key) {
      if (failedRemovals.has(key)) throw new Error("storage removal failed");
      if (silentRemovals.has(key)) return;
      storage.delete(key);
    },
  };
  const windowListeners = new Map();
  const documentListeners = new Map();
  const window = {
    MRTAP_CLOUD: cloudKeys ? { url: "https://example.supabase.co", anonKey: "public-test-key" } : {},
    MRTAP_FLAGS: { rewardV2: flag },
    Capacitor: { isNativePlatform: () => native },
    FocusBlocker: focusBlocker,
    crypto: {
      randomUUID() {
        const id = ids[idIndex] || `00000000-0000-4000-8000-${String(idIndex + 1).padStart(12, "0")}`;
        idIndex++;
        return id;
      },
    },
    __loadSupabaseModule() {
      ownClientLoads++;
      if (ownClientResolvesNull) {
        return Promise.resolve({
          createClient() {
            return {
              auth: {
                async getSession() {
                  return { data: { session: null }, error: null };
                },
                async signInAnonymously() {
                  return { data: { session: null }, error: { message: "anonymous sign-in unavailable" } };
                },
              },
            };
          },
        });
      }
      return Promise.reject(new Error("own client fallback should not run in these tests"));
    },
    addEventListener(name, fn) { windowListeners.set(name, fn); },
  };
  if (malformedSquadModule !== undefined) window.SquadCloud = malformedSquadModule;
  else if (squadPresent) window.SquadCloud = squadCloud;
  const document = {
    visibilityState: "visible",
    addEventListener(name, fn) { documentListeners.set(name, fn); },
  };
  const context = {
    window,
    FocusBlocker: focusBlocker,
    crypto: window.crypto,
    localStorage,
    console: { log() {}, warn() {}, error() {} },
    document,
    setTimeout,
    clearTimeout,
  };
  if (malformedSquadModule !== undefined) context.SquadCloud = malformedSquadModule;
  else if (squadPresent) context.SquadCloud = squadCloud;
  const executableSource = source.replace(
    'import("https://esm.sh/@supabase/supabase-js@2.110.0")',
    "window.__loadSupabaseModule()",
  );
  vm.runInNewContext(executableSource, context);
  return {
    reward: window.RewardV2,
    window,
    calls,
    storage,
    localStorage,
    setOptedOut(value) {
      const next = value ? "opted_out" : "active";
      if (next !== cloudAccountState) accountGeneration++;
      cloudAccountState = next;
    },
    setAccountState(value) {
      if (value !== cloudAccountState) accountGeneration++;
      cloudAccountState = value;
    },
    setSquadClient(value) {
      if (value !== currentSquadClient) accountGeneration++;
      currentSquadClient = value;
    },
    failNextRead(key) {
      nextReadFailures.add(key);
    },
    setRemoveFailure(key, value) {
      if (value) failedRemovals.add(key);
      else failedRemovals.delete(key);
    },
    setSilentRemove(key, value) {
      if (value) silentRemovals.add(key);
      else silentRemovals.delete(key);
    },
    squadClientCalls() {
      return squadClientCalls;
    },
    ownClientLoads() {
      return ownClientLoads;
    },
    read(key, fallback = null) {
      const raw = storage.get(key);
      return raw == null ? fallback : JSON.parse(raw);
    },
    async fireWindow(name) {
      const fn = windowListeners.get(name);
      if (fn) await fn();
      await new Promise((resolve) => setImmediate(resolve));
    },
    async fireDocument(name) {
      const fn = documentListeners.get(name);
      if (fn) await fn();
      await new Promise((resolve) => setImmediate(resolve));
    },
  };
}

test("a status-zero completion failure is retained for replay", async () => {
  const session = acknowledgedSession("session-complete");
  const h = loadRewardV2({
    initial: { [K_SESSION]: session },
    rpc(name, args) {
      if (name === "complete_reward_session") {
        return { data: null, error: { message: "Failed to fetch" }, status: 0 };
      }
      return ok(name === "my_reward_state" ? rewardState() : []);
    },
  });

  assert.equal(await h.reward.completeSession(), false);

  assert.deepEqual(h.read(K_SESSION), {
    id: "session-complete",
    pendingClose: "complete",
    shieldHeld: false,
  });
  assert.deepEqual(h.read(K_QUEUE).map((item) => ({ fn: item.fn, key: item.key })), [
    { fn: "complete_reward_session", key: "session-complete" },
  ]);
});

test("transient HTTP completion failures are retained for replay", async (t) => {
  for (const status of [408, 429, 500, 503]) {
    await t.test(String(status), async () => {
      const id = `session-complete-${status}`;
      const h = loadRewardV2({
        initial: {
          [K_SESSION]: acknowledgedSession(id),
        },
        rpc(name) {
          if (name === "complete_reward_session") {
            return { data: null, error: { message: "temporary upstream failure" }, status };
          }
          return ok(name === "my_reward_state" ? rewardState() : []);
        },
      });

      assert.equal(await h.reward.completeSession(), false);
      assert.deepEqual(h.read(K_SESSION), {
        id,
        pendingClose: "complete",
        shieldHeld: false,
      });
      assert.deepEqual(h.read(K_QUEUE).map((item) => ({ fn: item.fn, key: item.key })), [
        { fn: "complete_reward_session", key: id },
      ]);
    });
  }
});

test("a status-zero start response remains eligible for later zero-credit cleanup", async () => {
  let offline = true;
  const h = loadRewardV2({
    rpc(name, args) {
      if (name === "start_reward_session" && offline) {
        return { data: null, error: { message: "Failed to fetch" }, status: 0 };
      }
      return responseFor(name, args);
    },
  });

  assert.equal(await h.reward.startSession(25), false);
  assert.equal(h.read(K_SESSION).serverAck, "unknown");

  offline = false;
  assert.equal(await h.reward.abandonSession(), true);
  assert.deepEqual(h.calls.map((call) => call.name), [
    "start_reward_session",
    "start_reward_session",
    "abandon_reward_session",
  ]);
  assert.equal(h.read(K_SESSION), null);
});

test("transient HTTP start failures remain eligible for later zero-credit cleanup", async (t) => {
  for (const status of [408, 429, 500, 503]) {
    await t.test(String(status), async () => {
      let transient = true;
      const h = loadRewardV2({
        rpc(name, args) {
          if (name === "start_reward_session" && transient) {
            return { data: null, error: { message: "temporary upstream failure" }, status };
          }
          return responseFor(name, args);
        },
      });

      assert.equal(await h.reward.startSession(25), false);
      assert.equal(h.read(K_SESSION).serverAck, "unknown");

      transient = false;
      assert.equal(await h.reward.abandonSession(), true);
      assert.deepEqual(h.calls.map((call) => call.name), [
        "start_reward_session",
        "start_reward_session",
        "abandon_reward_session",
      ]);
      assert.equal(h.read(K_SESSION), null);
    });
  }
});

test("a start marker is crash-safe before the server response resolves", async () => {
  const startCall = deferred();
  const firstRun = loadRewardV2({
    rpc(name, args) {
      if (name === "start_reward_session") return startCall.promise;
      return responseFor(name, args);
    },
  });

  // Deliberately do not await this promise: an unresolved response followed by
  // process death is the crash window this regression models.
  firstRun.reward.startSession(25);
  await waitFor(() => firstRun.calls.some((call) => call.name === "start_reward_session"));
  assert.deepEqual(firstRun.read(K_SESSION), {
    id: "00000000-0000-4000-8000-000000000001",
    planned: 25,
    platform: "ios",
    shield: true,
    startedLocal: firstRun.read(K_SESSION).startedLocal,
    serverAck: "unknown",
  });

  const relaunched = loadRewardV2({ storageMap: firstRun.storage });
  assert.equal(await relaunched.reward.init(), true);
  assert.deepEqual(relaunched.calls.map((call) => call.name), [
    "start_reward_session",
    "abandon_reward_session",
    "issue_my_rewards",
    "my_reward_state",
  ]);
  assert.deepEqual(relaunched.calls[0].args, {
    p_session_id: "00000000-0000-4000-8000-000000000001",
    p_planned_minutes: 25,
    p_platform: "ios",
    p_shield: true,
  });
  assert.equal(relaunched.read(K_SESSION), null);
});

test("a completion marker survives when an offline replay cannot be persisted", async () => {
  const session = acknowledgedSession("session-storage-full");
  const h = loadRewardV2({
    initial: { [K_SESSION]: session },
    failQueueWrites: true,
    rpc(name, args) {
      if (name === "complete_reward_session") {
        return { data: null, error: { message: "Load failed" }, status: 0 };
      }
      return responseFor(name, args);
    },
  });

  assert.equal(await h.reward.completeSession(), false);

  assert.equal(h.read(K_SESSION).id, "session-storage-full");
  assert.equal(h.read(K_QUEUE), null);
});

test("a queue flush preserves work enqueued while its network call is pending", async () => {
  const firstCall = deferred();
  const h = loadRewardV2({
    initial: {
      [K_SESSION]: acknowledgedSession("session-new"),
      [K_QUEUE]: [{
        fn: "complete_reward_session",
        key: "session-old",
        args: { p_session_id: "session-old", p_shield_held: true },
      }],
    },
    rpc(name, args) {
      if (name === "complete_reward_session" && args.p_session_id === "session-old") {
        return firstCall.promise;
      }
      if (name === "complete_reward_session" && args.p_session_id === "session-new") {
        throw new Error("network disconnected");
      }
      return ok(name === "my_reward_state" ? rewardState() : []);
    },
  });

  const flushing = h.reward._flush();
  await waitFor(
    () => h.calls.some((call) => call.name === "complete_reward_session" && call.args.p_session_id === "session-old"),
    "the queued completion never began",
  );
  assert.equal(await h.reward.completeSession(), false);
  assert.deepEqual(h.read(K_QUEUE).map((item) => item.key), ["session-old", "session-new"]);

  firstCall.resolve(ok([closeRow("session-old")]));
  await flushing;

  assert.deepEqual(h.read(K_QUEUE).map((item) => item.key), ["session-new"]);
});

test("abandonSession closes an acknowledged session without crediting it", async () => {
  const h = loadRewardV2({
    initial: {
      [K_SESSION]: acknowledgedSession("session-abandon"),
    },
  });

  assert.equal(await h.reward.abandonSession(), true);

  assert.equal(h.read(K_SESSION), null);
  assert.deepEqual(h.calls.map((call) => call.name), ["abandon_reward_session"]);
  assert.equal(h.calls[0].args.p_session_id, "session-abandon");
});

test("an offline abandon is retained for replay before its local marker is removed", async () => {
  const h = loadRewardV2({
    initial: {
      [K_SESSION]: acknowledgedSession("session-abandon-offline"),
    },
    rpc(name, args) {
      if (name === "abandon_reward_session") {
        return { data: null, error: { message: "Network request failed" }, status: 0 };
      }
      return responseFor(name, args);
    },
  });

  assert.equal(await h.reward.abandonSession(), false);

  assert.deepEqual(h.read(K_SESSION), {
    id: "session-abandon-offline",
    pendingClose: "abandon",
  });
  assert.deepEqual(h.read(K_QUEUE).map((item) => ({ fn: item.fn, key: item.key })), [
    { fn: "abandon_reward_session", key: "session-abandon-offline" },
  ]);
});

test("the legacy abandoned completion option uses the zero-credit endpoint", async () => {
  const h = loadRewardV2({
    initial: {
      [K_SESSION]: acknowledgedSession("session-legacy-abandon"),
    },
  });

  assert.equal(await h.reward.completeSession({ abandoned: true }), true);

  assert.deepEqual(h.calls.map((call) => call.name), ["abandon_reward_session"]);
});

test("completion uses the shield state captured by its caller", async () => {
  const held = loadRewardV2({
    focusActive: false,
    initial: {
      [K_SESSION]: acknowledgedSession("session-shield-held"),
    },
  });
  assert.equal(await held.reward.completeSession({ shieldHeld: true }), true);
  assert.equal(held.calls[0].args.p_shield_held, true);

  const notHeld = loadRewardV2({
    focusActive: true,
    initial: {
      [K_SESSION]: acknowledgedSession("session-shield-not-held"),
    },
  });
  assert.equal(await notHeld.reward.completeSession({ shieldHeld: false }), true);
  assert.equal(notHeld.calls[0].args.p_shield_held, false);
});

test("initialization abandons a session left open by a prior process", async () => {
  const h = loadRewardV2({
    initial: {
      [K_SESSION]: acknowledgedSession("session-stale-boot"),
    },
  });

  await h.reward.init();

  assert.deepEqual(h.calls.map((call) => call.name), [
    "abandon_reward_session",
    "issue_my_rewards",
    "my_reward_state",
  ]);
});

test("starting a new session abandons a stale local session first", async () => {
  const h = loadRewardV2({
    initial: {
      [K_SESSION]: acknowledgedSession("session-stale-start"),
    },
    ids: ["00000000-0000-4000-8000-000000000009"],
  });

  assert.equal(await h.reward.startSession(30), true);

  assert.deepEqual(h.calls.map((call) => call.name), [
    "abandon_reward_session",
    "start_reward_session",
  ]);
  assert.equal(h.calls[0].args.p_session_id, "session-stale-start");
  assert.equal(h.calls[1].args.p_session_id, "00000000-0000-4000-8000-000000000009");
});

test("an abandon requested during start waits for the start acknowledgement", async () => {
  const startCall = deferred();
  const h = loadRewardV2({
    rpc(name, args) {
      if (name === "start_reward_session") return startCall.promise;
      return responseFor(name, args);
    },
  });

  const starting = h.reward.startSession(25);
  await waitFor(() => h.calls.some((call) => call.name === "start_reward_session"));
  const abandoning = h.reward.abandonSession();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(h.calls.map((call) => call.name), ["start_reward_session"]);

  startCall.resolve(ok([startRow("00000000-0000-4000-8000-000000000001", 25)]));
  assert.equal(await starting, true);
  assert.equal(await abandoning, true);
  assert.deepEqual(h.calls.map((call) => call.name), [
    "start_reward_session",
    "abandon_reward_session",
  ]);
});

test("a start requested during completion waits until the old session is closed", async () => {
  const completeCall = deferred();
  const h = loadRewardV2({
    initial: {
      [K_SESSION]: acknowledgedSession("session-finishing"),
    },
    rpc(name, args) {
      if (name === "complete_reward_session") return completeCall.promise;
      return responseFor(name, args);
    },
  });

  const completing = h.reward.completeSession();
  await waitFor(() => h.calls.some((call) => call.name === "complete_reward_session"));
  const starting = h.reward.startSession(25);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(h.calls.map((call) => call.name), ["complete_reward_session"]);

  completeCall.resolve(ok([closeRow("session-finishing")]));
  assert.equal(await completing, true);
  assert.equal(await starting, true);
  assert.deepEqual(h.calls.map((call) => call.name), [
    "complete_reward_session",
    "issue_my_rewards",
    "my_reward_state",
    "start_reward_session",
  ]);
});

test("refresh revokes readiness when reward issuance fails before state fetch", async () => {
  let issueFails = false;
  let syncEvents = 0;
  const h = loadRewardV2({
    rpc(name, args) {
      if (name === "issue_my_rewards" && issueFails) {
        return { data: null, error: { message: "issue refused", code: "42501" }, status: 403 };
      }
      if (name === "my_reward_state") return ok(rewardState(125));
      return responseFor(name, args);
    },
  });
  h.window.onRewardV2Sync = () => { syncEvents++; };
  assert.equal(await h.reward.refresh(), true);
  assert.equal(h.reward.ready, true);
  assert.equal(h.reward.eligibleMinutes, 125);
  assert.equal(syncEvents, 1);

  issueFails = true;
  assert.equal(await h.reward.refresh(), false);
  assert.equal(h.reward.ready, false);
  assert.equal(h.reward.eligibleMinutes, 125, "a partial refresh must not replace the last complete snapshot");
  assert.equal(syncEvents, 1, "partial state must not be published to the UI");
});

test("an account-deletion opt-out never falls back to creating another account", async () => {
  const h = loadRewardV2({ optedOut: true });

  await h.reward.init();

  assert.equal(h.reward.ready, false);
  assert.equal(h.squadClientCalls(), 0, "Reward V2 should honor opt-out before requesting a client");
  assert.equal(h.ownClientLoads(), 0, "Reward V2 must not create its own anonymous replacement");
  assert.deepEqual(h.calls, []);
});

test("a null shared client is retried without ever creating a second identity", async () => {
  const h = loadRewardV2({
    squadClientReturnsNull: true,
    ownClientResolvesNull: true,
  });

  assert.equal(await h.reward.refresh(), false);
  assert.equal(await h.reward.refresh(), false);

  assert.equal(h.squadClientCalls(), 2);
  assert.equal(h.ownClientLoads(), 0);
});

test("malformed and throwing shared clients fail closed without independent signup", async (t) => {
  for (const mode of ["malformed", "throws"]) {
    await t.test(mode, async () => {
      const h = loadRewardV2();
      h.window.SquadCloud.client = async () => {
        if (mode === "throws") throw new Error("shared auth unavailable");
        return { notRpc: true };
      };
      assert.equal(await h.reward.refresh(), false);
      assert.equal(h.ownClientLoads(), 0);
      assert.deepEqual(h.calls, []);
    });
  }
});

test("a present but malformed Squad module never enables the own-account fallback", async () => {
  for (const malformedSquadModule of [null, 7, "SquadCloud", () => {}]) {
    const h = loadRewardV2({ malformedSquadModule, ownClientResolvesNull: true });
    assert.equal(await h.reward.refresh(), false);
    assert.equal(h.ownClientLoads(), 0);
    assert.deepEqual(h.calls, []);
  }
});

test("resetAfterAccountDeletion clears every cached reward and replay artifact", async () => {
  const h = loadRewardV2({
    initial: {
      [K_SESSION]: acknowledgedSession("session-delete"),
      [K_QUEUE]: [{
        fn: "complete_reward_session",
        key: "queued-delete",
        args: { p_session_id: "queued-delete", p_shield_held: true },
      }],
    },
    rpc(name, args) {
      if (name === "my_reward_state") {
        return ok({
          eligible_minutes: 245,
          rewards: [rewardRow({ id: "reward-stale", policy_id: "policy-stale" })],
          policies: [policyRow({
            id: "policy-stale",
            required_minutes: 120,
            spent_minutes: 240,
            unspent_minutes: 5,
            progress_minutes: 5,
          })],
        });
      }
      return responseFor(name, args);
    },
  });
  await h.reward.init();
  assert.equal(h.reward.ready, true);
  const clientChecksBeforeDelete = h.squadClientCalls();
  assert.ok(clientChecksBeforeDelete > 0);

  h.setOptedOut(true);
  h.reward.resetAfterAccountDeletion();

  assert.equal(h.reward.ready, false);
  assert.equal(h.reward.eligibleMinutes, 0);
  assert.deepEqual(Array.from(h.reward.rewards), []);
  assert.deepEqual(Array.from(h.reward.policies), []);
  assert.equal(h.reward.lastSyncAt, 0);
  assert.equal(h.reward.lastError, null);
  assert.equal(h.read(K_SESSION), null);
  assert.deepEqual(Array.from(h.reward._queue()), []);
  await h.reward.init();
  assert.equal(h.squadClientCalls(), clientChecksBeforeDelete,
    "the reset client cache must still remain behind opt-out");
  assert.equal(h.ownClientLoads(), 0);
});

test("resetAfterAccountDeletion prevents an in-flight refresh from restoring stale state", async () => {
  const stateCall = deferred();
  const h = loadRewardV2({
    rpc(name, args) {
      if (name === "my_reward_state") return stateCall.promise;
      return responseFor(name, args);
    },
  });

  const refreshing = h.reward.refresh();
  await waitFor(() => h.calls.some((call) => call.name === "my_reward_state"));
  h.setOptedOut(true);
  h.reward.resetAfterAccountDeletion();
  stateCall.resolve(ok({
    eligible_minutes: 999,
    rewards: [rewardRow({ id: "reward-after-delete", policy_id: "policy-after-delete" })],
    policies: [policyRow({ id: "policy-after-delete", required_minutes: 120 })],
  }));

  assert.equal(await refreshing, false);
  assert.equal(h.reward.ready, false);
  assert.equal(h.reward.eligibleMinutes, 0);
  assert.deepEqual(Array.from(h.reward.rewards), []);
  assert.deepEqual(Array.from(h.reward.policies), []);
});

test("native flag selects V2 authority even when backend configuration is missing", async () => {
  const h = loadRewardV2({ cloudKeys: false });

  assert.equal(h.reward.enabled, true);
  assert.equal(h.reward.ready, false);
  assert.equal(await h.reward.init(), false);
  assert.deepEqual(h.calls, []);
});

test("the shared web bundle stays inert even when the V2 flag and keys are present", () => {
  const h = loadRewardV2({ native: false });
  assert.equal(h.reward.enabled, false);
  assert.equal(h.reward.ready, false);
});

test("a pending or malformed Squad lifecycle blocks auth before and after awaits", async (t) => {
  for (const lifecycle of ["pending_delete", "opted_out", "garbled"]) {
    await t.test(lifecycle, async () => {
      const h = loadRewardV2({ accountState: lifecycle });
      assert.equal(await h.reward.refresh(), false);
      assert.equal(h.ownClientLoads(), 0);
      assert.deepEqual(h.calls, []);
    });
  }

  for (const nextLifecycle of ["pending_delete", "opted_out"]) {
    await t.test(`lifecycle changes to ${nextLifecycle} while shared auth is pending`, async () => {
      const auth = deferred();
      const h = loadRewardV2({
        clientOverride: { rpc: (...args) => responseFor(...args) },
      });
      h.window.SquadCloud.client = async () => {
        await auth.promise;
        return {
          rpc(name, args) {
            h.calls.push({ name, args });
            return responseFor(name, args);
          },
        };
      };
      const refreshing = h.reward.refresh();
      await new Promise((resolve) => setImmediate(resolve));
      h.setAccountState(nextLifecycle);
      auth.resolve();
      assert.equal(await refreshing, false);
      assert.deepEqual(h.calls, []);
      assert.equal(h.ownClientLoads(), 0);
    });
  }
});

test("a close intent is durable before the first network await", async () => {
  const close = deferred();
  const h = loadRewardV2({
    initial: { [K_SESSION]: acknowledgedSession("session-intent") },
    rpc(name) {
      if (name === "complete_reward_session") return close.promise;
      return responseFor(name);
    },
  });

  h.reward.completeSession({ shieldHeld: true });
  await waitFor(() => h.calls.some((call) => call.name === "complete_reward_session"));
  assert.deepEqual(h.read(K_SESSION), {
    id: "session-intent",
    pendingClose: "complete",
    shieldHeld: true,
  });
});

test("crash recovery replays a recorded completion and never converts it to abandon", async () => {
  const h = loadRewardV2({
    initial: {
      [K_SESSION]: { id: "session-pending-complete", pendingClose: "complete", shieldHeld: false },
    },
  });

  assert.equal(await h.reward.init(), true);
  assert.equal(h.calls[0].name, "complete_reward_session");
  assert.deepEqual(h.calls[0].args, {
    p_session_id: "session-pending-complete",
    p_shield_held: false,
  });
  assert.equal(h.calls.some((call) => call.name === "abandon_reward_session"), false);
});

test("an explicit abandon cannot overwrite an already-recorded completion", async () => {
  const h = loadRewardV2({
    initial: {
      [K_SESSION]: { id: "session-recorded-complete", pendingClose: "complete", shieldHeld: true },
    },
  });

  assert.equal(await h.reward.abandonSession(), true);
  assert.equal(h.calls[0].name, "complete_reward_session");
  assert.equal(h.calls.some((call) => call.name === "abandon_reward_session"), false);
});

test("an unknown legacy crash marker recovers with zero-credit abandon", async () => {
  const h = loadRewardV2({
    initial: {
      [K_SESSION]: acknowledgedSession("session-legacy-crash"),
    },
  });

  assert.equal(await h.reward.init(), true);
  assert.equal(h.calls[0].name, "abandon_reward_session");
});

test("close marker write and readback failures prevent the network call and revoke readiness", async (t) => {
  for (const options of [{ failSessionWrites: true }, { silentWriteKeys: [K_SESSION] }]) {
    await t.test(options.failSessionWrites ? "write throws" : "readback disagrees", async () => {
      const h = loadRewardV2(Object.assign({
        initial: { [K_SESSION]: acknowledgedSession("session-no-marker") },
      }, options));
      h.reward.ready = true;

      assert.equal(await h.reward.completeSession(), false);
      assert.deepEqual(h.calls, []);
      assert.equal(h.reward.ready, false);
      assert.equal(h.read(K_SESSION).pendingClose, undefined);
    });
  }
});

test("queue readback failure retains the pending marker without evicting anything", async () => {
  const h = loadRewardV2({
    initial: { [K_SESSION]: acknowledgedSession("session-queue-readback") },
    silentWriteKeys: [K_QUEUE],
    rpc(name) {
      if (name === "complete_reward_session") {
        return { data: null, error: { code: "08006", message: "lost" }, status: 0 };
      }
      return responseFor(name);
    },
  });

  assert.equal(await h.reward.completeSession(), false);
  assert.equal(h.read(K_SESSION).pendingClose, "complete");
  assert.equal(h.read(K_QUEUE), null);
});

test("a full queue never evicts old close work and retains the pending marker", async () => {
  const oldQueue = Array.from({ length: 50 }, (_, index) => ({
    fn: "complete_reward_session",
    key: `old-${index}`,
    args: { p_session_id: `old-${index}`, p_shield_held: true },
  }));
  const h = loadRewardV2({
    initial: {
      [K_SESSION]: acknowledgedSession("session-overflow"),
      [K_QUEUE]: oldQueue,
    },
    rpc(name, args) {
      if (name === "complete_reward_session" && args.p_session_id === "session-overflow") {
        return { data: null, error: { code: "08006", message: "connection lost" }, status: 0 };
      }
      return { data: null, error: { code: "08006", message: "still offline" }, status: 0 };
    },
  });

  assert.equal(await h.reward.completeSession(), false);
  assert.deepEqual(h.read(K_QUEUE), oldQueue);
  assert.equal(h.read(K_SESSION).id, "session-overflow");
  assert.equal(h.read(K_SESSION).pendingClose, "complete");
  assert.equal(h.reward.ready, false);
});

test("start refuses to overwrite an unresolved marker after drain fails", async () => {
  const h = loadRewardV2({
    initial: { [K_SESSION]: { id: "session-unresolved", pendingClose: "complete", shieldHeld: true } },
    rpc(name) {
      if (name === "complete_reward_session") {
        return { data: null, error: { code: "08006", message: "lost" }, status: 0 };
      }
      throw new Error(`unexpected ${name}`);
    },
  });

  assert.equal(await h.reward.startSession(30), false);
  assert.equal(h.calls.some((call) => call.name === "start_reward_session"), false);
  assert.deepEqual(h.read(K_SESSION), {
    id: "session-unresolved",
    pendingClose: "complete",
    shieldHeld: true,
  });
});

test("all ambiguous close responses preserve work and their error metadata", async (t) => {
  const cases = [
    ["null envelope", null],
    ["primitive envelope", 7],
    ["missing data", { error: null, status: 200 }],
    ["missing error", { data: [closeRow("session-ambiguous")], status: 200 }],
    ["missing status", { data: [closeRow("session-ambiguous")], error: null }],
    ["status zero without error", { data: [closeRow("session-ambiguous")], error: null, status: 0 }],
    ["401", { data: null, error: { code: "PGRST301", message: "jwt expired" }, status: 401 }],
    ["auth code", { data: null, error: { code: "28000", message: "not authenticated" }, status: 401 }],
    ["403", { data: null, error: { code: "42501", message: "denied" }, status: 403 }],
    ["408", { data: null, error: { code: "57014", message: "timeout" }, status: 408 }],
    ["425", { data: null, error: { code: "P0000", message: "too early" }, status: 425 }],
    ["429", { data: null, error: { code: "PGRST003", message: "rate" }, status: 429 }],
    ["500", { data: null, error: { code: "XX000", message: "server" }, status: 500 }],
    ["deployment code", { data: null, error: { code: "PGRST202", message: "function missing" }, status: 404 }],
    ["schema code", { data: null, error: { code: "42P01", message: "relation missing" }, status: 400 }],
    ["unknown code", { data: null, error: { code: "ZZ999", message: "unknown" }, status: 400 }],
  ];
  for (const [label, response] of cases) {
    await t.test(label, async () => {
      const h = loadRewardV2({
        initial: {
          [K_SESSION]: acknowledgedSession("session-ambiguous"),
        },
        rpc(name) {
          if (name === "complete_reward_session") return response;
          return responseFor(name);
        },
      });
      assert.equal(await h.reward.completeSession(), false);
      const marker = h.read(K_SESSION);
      assert.deepEqual(marker, {
        id: "session-ambiguous",
        pendingClose: "complete",
        shieldHeld: false,
      });
      if (response && response.error) {
        assert.equal(h.reward.lastError.code, response.error.code);
        assert.equal(h.reward.lastError.status, response.status);
      }
    });
  }
});

test("RPC-specific success shapes are validated before state or markers change", async (t) => {
  await t.test("start requires exactly one matching canonical row", async () => {
    for (const data of [null, [], [startRow("wrong")], [Object.assign(startRow("00000000-0000-4000-8000-000000000001"), { state: "invented" })]]) {
      const h = loadRewardV2({ rpc(name) {
        if (name === "start_reward_session") return ok(data);
        return responseFor(name);
      } });
      assert.equal(await h.reward.startSession(25), false);
      assert.equal(h.read(K_SESSION).serverAck, "unknown");
    }
  });

  await t.test("close requires one matching terminal numeric row", async () => {
    for (const data of [[], [closeRow("wrong")], [{ id: "session-shape", state: "completed", credited_minutes: "25", eligible_minutes: 25 }]]) {
      const h = loadRewardV2({
        initial: { [K_SESSION]: acknowledgedSession("session-shape") },
        rpc(name) {
          if (name === "complete_reward_session") return ok(data);
          return responseFor(name);
        },
      });
      assert.equal(await h.reward.completeSession(), false);
      assert.deepEqual(h.read(K_SESSION), {
        id: "session-shape",
        pendingClose: "complete",
        shieldHeld: false,
      });
    }
  });

  await t.test("issue validates every returned row", async () => {
    const h = loadRewardV2({ rpc(name) {
      if (name === "issue_my_rewards") return ok([{ id: "partial" }]);
      return responseFor(name);
    } });
    assert.equal(await h.reward.refresh(), false);
    assert.equal(h.reward.ready, false);
  });

  await t.test("state validates every nested field consumed by the UI", async () => {
    const h = loadRewardV2({ rpc(name, args) {
      if (name === "my_reward_state") return ok({
        eligible_minutes: 240,
        rewards: [{ id: "partial", status: "issued" }],
        policies: [policyRow()],
      });
      return responseFor(name, args);
    } });
    assert.equal(await h.reward.refresh(), false);
    assert.equal(h.reward.ready, false);
  });
});

test("readiness requires an empty queue and no unresolved session marker", async () => {
  const h = loadRewardV2({
    initial: {
      [K_QUEUE]: [{
        fn: "complete_reward_session",
        key: "queued-ready-gate",
        args: { p_session_id: "queued-ready-gate", p_shield_held: true },
      }],
    },
    rpc(name, args) {
      if (name === "complete_reward_session") {
        return { data: null, error: { code: "08006", message: "offline" }, status: 0 };
      }
      return responseFor(name, args);
    },
  });

  assert.equal(await h.reward.refresh(), false);
  assert.equal(h.reward.ready, false);
  assert.equal(h.calls.some((call) => call.name === "issue_my_rewards"), false);
});

test("overlapping refreshes share one current snapshot and cannot publish out of order", async () => {
  const state = deferred();
  let issueCalls = 0;
  const h = loadRewardV2({ rpc(name, args) {
    if (name === "issue_my_rewards") { issueCalls++; return ok([]); }
    if (name === "my_reward_state") return state.promise;
    return responseFor(name, args);
  } });

  const first = h.reward.refresh();
  await waitFor(() => h.calls.some((call) => call.name === "my_reward_state"));
  const second = h.reward.refresh();
  state.resolve(ok(rewardState(240)));
  assert.equal(await first, true);
  assert.equal(await second, true);
  assert.equal(issueCalls, 1);
  assert.equal(h.calls.filter((call) => call.name === "my_reward_state").length, 1);
  assert.equal(h.reward.eligibleMinutes, 240);
});

test("cold sync failures retry on online and foreground without abandoning this process session", async () => {
  let issueAttempts = 0;
  const h = loadRewardV2({ rpc(name, args) {
    if (name === "issue_my_rewards") {
      issueAttempts++;
      if (issueAttempts === 1) return { data: null, error: { code: "08006", message: "offline" }, status: 0 };
    }
    return responseFor(name, args);
  } });

  assert.equal(await h.reward.startSession(25), true);
  assert.equal(await h.reward.refresh(), false);
  assert.equal(h.reward.ready, false);
  await h.fireWindow("online");
  await waitFor(() => h.reward.ready, "online retry did not recover readiness");
  await h.fireDocument("visibilitychange");
  assert.equal(h.calls.some((call) => call.name === "abandon_reward_session"), false);
  assert.equal(h.read(K_SESSION).serverAck, true);
});

test("online retry does not boot-recover an ambiguous start from this process", async () => {
  const h = loadRewardV2({ rpc(name, args) {
    if (name === "start_reward_session") {
      return { data: null, error: { code: "08006", message: "reply lost" }, status: 0 };
    }
    return responseFor(name, args);
  } });

  assert.equal(await h.reward.startSession(25), false);
  await h.fireWindow("online");

  assert.deepEqual(h.calls.map((call) => call.name), ["start_reward_session"]);
  assert.equal(h.read(K_SESSION).serverAck, "unknown");
  assert.equal(h.reward.ready, false);
});

test("redemption methods reject malformed objects and accept canonical domain refusals", async () => {
  const h = loadRewardV2({ rpc(name) {
    if (name === "open_redemption") return ok({ ok: true, code: "ABC234" });
    if (name === "check_code") return ok({ ok: false, reason: "invented_reason" });
    if (name === "redeem_by_code") return ok({ ok: false, reason: "failed_already_redeemed" });
    return responseFor(name);
  } });

  assert.deepEqual(JSON.parse(JSON.stringify(await h.reward.openRedemption("reward", "partner"))), {
    ok: false, reason: "ambiguous", message: null,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(await h.reward.checkCode("ABC234"))),
    { ok: false, reason: "ambiguous" });
  assert.equal((await h.reward.redeemByCode("ABC234")).reason, "failed_already_redeemed");
});

test("redemption methods accept complete canonical success objects", async () => {
  const timestamp = "2026-08-17T12:05:00.000Z";
  const h = loadRewardV2({ rpc(name, args) {
    if (name === "open_redemption") return ok({
      ok: true,
      code: "ABC234",
      expires_at: timestamp,
      server_time: timestamp,
      partner_name: "U Tea",
      offer_text: "10% off",
      offer_version: 1,
      cashier_note: "Show before paying",
      bar_minutes: 240,
    });
    if (name === "check_code") return ok({
      ok: true,
      reason: null,
      partner_name: "U Tea",
      offer_text: "10% off",
      cashier_note: "Show before paying",
      server_time: timestamp,
      expires_at: timestamp,
    });
    if (name === "redeem_by_code") return ok({
      ok: true,
      partner_name: "U Tea",
      offer_text: "10% off",
      cashier_note: "Show before paying",
      redeemed_at: timestamp,
      server_time: timestamp,
    });
    return responseFor(name, args);
  } });

  assert.equal((await h.reward.openRedemption("reward", "u-tea")).code, "ABC234");
  assert.equal((await h.reward.checkCode("ABC234")).ok, true);
  assert.equal((await h.reward.redeemByCode("ABC234")).ok, true);
  assert.equal(h.reward.ready, true);
});

test("open redemption requires its own canonical issuance-time bar and publishes no malformed payload", async (t) => {
  const missing = openRow();
  delete missing.bar_minutes;
  const invalid = [
    ["missing", missing],
    ["null", openRow({ bar_minutes: null })],
    ["string", openRow({ bar_minutes: "240" })],
    ["fraction", openRow({ bar_minutes: 240.5 })],
    ["below minimum", openRow({ bar_minutes: 14 })],
    ["above maximum", openRow({ bar_minutes: 1441 })],
  ];

  for (const [label, value] of invalid) {
    await t.test(label, async () => {
      const h = loadRewardV2({ rpc(name, args) {
        if (name === "open_redemption") return ok(value);
        if (name === "my_reward_state") return ok(rewardState(25));
        return responseFor(name, args);
      } });
      assert.equal(await h.reward.refresh(), true);
      const beforeRewards = h.reward.rewards;
      const beforePolicies = h.reward.policies;

      const result = await h.reward.openRedemption("reward", "partner");

      assert.deepEqual(JSON.parse(JSON.stringify(result)), {
        ok: false, reason: "ambiguous", message: null,
      });
      assert.equal(h.reward.ready, true);
      assert.equal(h.reward.eligibleMinutes, 25);
      assert.equal(h.reward.rewards, beforeRewards);
      assert.equal(h.reward.policies, beforePolicies);
    });
  }

  await t.test("accessor", async () => {
    let reads = 0;
    const value = openRow();
    Object.defineProperty(value, "bar_minutes", {
      enumerable: true,
      get() {
        reads++;
        return 240;
      },
    });
    const h = loadRewardV2({ rpc(name, args) {
      if (name === "open_redemption") return ok(value);
      if (name === "my_reward_state") return ok(rewardState(25));
      return responseFor(name, args);
    } });
    assert.equal(await h.reward.refresh(), true);
    const beforeRewards = h.reward.rewards;
    const beforePolicies = h.reward.policies;

    const result = await h.reward.openRedemption("reward", "partner");

    assert.deepEqual(JSON.parse(JSON.stringify(result)), {
      ok: false, reason: "ambiguous", message: null,
    });
    assert.equal(reads, 0, "response normalization must reject the getter without invoking it");
    assert.equal(h.reward.ready, true);
    assert.equal(h.reward.eligibleMinutes, 25);
    assert.equal(h.reward.rewards, beforeRewards);
    assert.equal(h.reward.policies, beforePolicies);
  });
});

test("open redemption snapshots the canonical issuance-time bar", async () => {
  const live = openRow({ bar_minutes: 240 });
  const h = loadRewardV2({ rpc(name, args) {
    if (name === "open_redemption") return ok(live);
    return responseFor(name, args);
  } });

  const opened = await h.reward.openRedemption("reward", "partner");
  live.bar_minutes = 60;
  live.offer_text = "forged later";

  assert.notEqual(opened, live);
  assert.equal(opened.bar_minutes, 240);
  assert.equal(opened.offer_text, "10% off");
  assert.equal(Object.prototype.hasOwnProperty.call(opened, "bar_minutes"), true);
});

test("a canonical void reward remains valid history without becoming available", async () => {
  const h = loadRewardV2({ rpc(name, args) {
    if (name === "my_reward_state") return ok({
      eligible_minutes: 240,
      rewards: [rewardRow({ status: "void" })],
      policies: [policyRow({ spent_minutes: 240 })],
    });
    return responseFor(name, args);
  } });

  assert.equal(await h.reward.refresh(), true);
  assert.equal(h.reward.ready, true);
  assert.deepEqual(Array.from(h.reward.available()), []);
});

test("the real client uses the Supabase-shaped reference adapter for start, close, abandon, issue, and state", async () => {
  const backend = RewardMock.createBackend({ now: Date.parse("2026-08-17T12:00:00.000Z") });
  backend.loadConfig({
    policies: [{
      id: "adapter-passport",
      kind: "global_passport",
      required_minutes: 15,
      expires_days: null,
    }],
    partners: [],
  });
  const client = RewardMock.createSupabaseClient(backend);
  const h = loadRewardV2({
    clientOverride: client,
    ids: [
      "00000000-0000-4000-8000-000000000201",
      "00000000-0000-4000-8000-000000000202",
    ],
  });

  assert.equal(await h.reward.startSession(25), true);
  backend.advance(25 * 60 * 1000);
  assert.equal(await h.reward.completeSession({ shieldHeld: true }), true);
  assert.equal(h.reward.ready, true);
  assert.equal(h.reward.eligibleMinutes, 25);
  assert.deepEqual(JSON.parse(JSON.stringify(h.reward.policies[0])), {
    id: "adapter-passport",
    kind: "global_passport",
    required_minutes: 15,
    partner_id: null,
    expires_days: null,
    active: true,
    spent_minutes: 15,
    unspent_minutes: 10,
    progress_minutes: 10,
  });

  assert.equal(await h.reward.startSession(30), true);
  assert.equal(await h.reward.abandonSession(), true);

  assert.deepEqual(h.calls.map((call) => call.name), [
    "start_reward_session",
    "complete_reward_session",
    "issue_my_rewards",
    "my_reward_state",
    "start_reward_session",
    "abandon_reward_session",
  ]);
  assert.deepEqual(h.calls[0].args, {
    p_session_id: "00000000-0000-4000-8000-000000000201",
    p_planned_minutes: 25,
    p_platform: "ios",
    p_shield: true,
  });
  assert.deepEqual(h.calls[1].args, {
    p_session_id: "00000000-0000-4000-8000-000000000201",
    p_shield_held: true,
  });
  assert.deepEqual(h.calls[5].args, {
    p_session_id: "00000000-0000-4000-8000-000000000202",
  });

  assert.deepEqual(
    JSON.parse(JSON.stringify(await h.reward.openRedemption("missing-reward", "missing-partner"))),
    { ok: false, reason: "failed_not_found" },
    "JSON RPC results must retain the canonical ok/refusal discriminator",
  );
});

test("an RPC response is discarded if Squad enters pending deletion while it is in flight", async () => {
  const stateCall = deferred();
  const h = loadRewardV2({ rpc(name, args) {
    if (name === "my_reward_state") return stateCall.promise;
    return responseFor(name, args);
  } });

  const refreshing = h.reward.refresh();
  await waitFor(() => h.calls.some((call) => call.name === "my_reward_state"));
  h.setAccountState("pending_delete");
  stateCall.resolve(ok(rewardState(321)));

  assert.equal(await refreshing, false);
  assert.equal(h.reward.ready, false);
  assert.equal(h.reward.eligibleMinutes, 0, "the old identity must never publish its reply");
});

test("delete then re-enable with a new Squad client invalidates the old identity reply", async () => {
  const oldState = deferred();
  const h = loadRewardV2({ rpc(name, args) {
    if (name === "my_reward_state") return oldState.promise;
    return responseFor(name, args);
  } });
  const newCalls = [];
  const newClient = {
    async rpc(name, args) {
      newCalls.push({ name, args });
      if (name === "my_reward_state") return ok(rewardState(45));
      return responseFor(name, args);
    },
  };

  const staleRefresh = h.reward.refresh();
  await waitFor(() => h.calls.some((call) => call.name === "my_reward_state"));
  h.setAccountState("pending_delete");
  h.setSquadClient(newClient);
  h.setAccountState("active");
  oldState.resolve(ok(rewardState(999)));

  assert.equal(await staleRefresh, false);
  assert.equal(h.reward.eligibleMinutes, 0);
  assert.equal(await h.reward.refresh(), true);
  assert.equal(h.reward.eligibleMinutes, 45);
  assert.deepEqual(newCalls.map((call) => call.name), ["issue_my_rewards", "my_reward_state"]);
});

test("an identity change after a close reply never clears its durable work", async () => {
  const closeCall = deferred();
  const h = loadRewardV2({
    initial: { [K_SESSION]: acknowledgedSession("session-account-change") },
    rpc(name, args) {
      if (name === "complete_reward_session") return closeCall.promise;
      return responseFor(name, args);
    },
  });
  const closing = h.reward.completeSession({ shieldHeld: true });
  await waitFor(() => h.calls.some((call) => call.name === "complete_reward_session"));
  h.setSquadClient({ rpc: async (name, args) => responseFor(name, args) });
  closeCall.resolve(ok([closeRow("session-account-change")]));

  assert.equal(await closing, false);
  assert.deepEqual(h.read(K_SESSION), {
    id: "session-account-change",
    pendingClose: "complete",
    shieldHeld: true,
  });
  assert.deepEqual(h.read(K_QUEUE, []), []);
});

test("terminal close rows enforce canonical credit semantics", async (t) => {
  for (const [label, rpcName, row] of [
    ["abandoned cannot carry credit", "abandon_reward_session", closeRow("semantic-close", "abandoned", 1)],
    ["completed credit cannot exceed a session", "complete_reward_session", closeRow("semantic-close", "completed", 481)],
  ]) {
    await t.test(label, async () => {
      const h = loadRewardV2({
        initial: { [K_SESSION]: acknowledgedSession("semantic-close") },
        rpc(name, args) {
          if (name === rpcName) return ok([row]);
          return responseFor(name, args);
        },
      });
      const result = rpcName === "abandon_reward_session"
        ? await h.reward.abandonSession()
        : await h.reward.completeSession({ shieldHeld: false });
      assert.equal(result, false);
      assert.deepEqual(h.read(K_SESSION), rpcName === "abandon_reward_session"
        ? { id: "semantic-close", pendingClose: "abandon" }
        : { id: "semantic-close", pendingClose: "complete", shieldHeld: false });
    });
  }
});

test("a validated start remains opened in this process when serverAck persistence fails", async () => {
  const h = loadRewardV2({ failSessionWriteAt: [2] });

  assert.equal(await h.reward.startSession(25), false);
  assert.equal(h.read(K_SESSION).serverAck, "unknown");
  assert.equal(await h.reward.init(), false);
  assert.equal(h.calls.some((call) => call.name === "abandon_reward_session"), false);

  assert.equal(await h.reward.completeSession({ shieldHeld: true }), true);
  assert.equal(h.calls.filter((call) => call.name === "complete_reward_session").length, 1);
  assert.equal(h.read(K_SESSION), null);
});

test("ambiguous-start recovery retries the exact start before deciding how to close", async () => {
  const marker = {
    id: "00000000-0000-4000-8000-000000000301",
    planned: 37,
    platform: "ios",
    shield: false,
    startedLocal: 123,
    serverAck: "unknown",
  };
  const h = loadRewardV2({ initial: { [K_SESSION]: marker } });

  assert.equal(await h.reward.init(), true);
  assert.deepEqual(h.calls.slice(0, 2).map((call) => call.name), [
    "start_reward_session",
    "abandon_reward_session",
  ]);
  assert.deepEqual(h.calls[0].args, {
    p_session_id: marker.id,
    p_planned_minutes: 37,
    p_platform: "ios",
    p_shield: false,
  });
  assert.equal(h.read(K_SESSION), null);
});

test("a terminal start replay resolves an ambiguous marker without an abandon", async () => {
  const marker = {
    id: "00000000-0000-4000-8000-000000000302",
    planned: 25,
    platform: "ios",
    shield: true,
    serverAck: "unknown",
  };
  const h = loadRewardV2({
    initial: { [K_SESSION]: marker },
    rpc(name, args) {
      if (name === "start_reward_session") return ok([startRow(marker.id, 25, "completed")]);
      return responseFor(name, args);
    },
  });

  assert.equal(await h.reward.init(), true);
  assert.equal(h.calls.some((call) => call.name === "abandon_reward_session"), false);
  assert.equal(h.read(K_SESSION), null);
});

test("an ambiguous recovery error retains the marker and never queues a blind abandon", async () => {
  const marker = {
    id: "00000000-0000-4000-8000-000000000303",
    planned: 25,
    platform: "ios",
    shield: true,
    serverAck: "unknown",
  };
  const h = loadRewardV2({
    initial: { [K_SESSION]: marker },
    rpc(name) {
      if (name === "start_reward_session") {
        return { data: null, error: { code: "P0002", message: "no such session" }, status: 400 };
      }
      throw new Error(`unexpected ${name}`);
    },
  });

  assert.equal(await h.reward.init(), false);
  assert.deepEqual(h.read(K_SESSION), Object.assign({}, marker, { pendingClose: "abandon" }));
  assert.deepEqual(h.read(K_QUEUE, []), []);
  assert.deepEqual(h.calls.map((call) => call.name), ["start_reward_session"]);
});

test("a close requested after ambiguous start is durable before the start-retry await", async () => {
  const retry = deferred();
  let startCalls = 0;
  const firstRun = loadRewardV2({ rpc(name, args) {
    if (name === "start_reward_session") {
      startCalls++;
      if (startCalls === 1) {
        return { data: null, error: { code: "08006", message: "reply lost" }, status: 0 };
      }
      return retry.promise;
    }
    return responseFor(name, args);
  } });
  assert.equal(await firstRun.reward.startSession(25), false);

  firstRun.reward.completeSession({ shieldHeld: true });
  await waitFor(() => firstRun.calls.filter((call) => call.name === "start_reward_session").length === 2);
  assert.deepEqual(firstRun.read(K_SESSION), {
    id: "00000000-0000-4000-8000-000000000001",
    planned: 25,
    platform: "ios",
    shield: true,
    serverAck: "unknown",
    pendingClose: "complete",
    shieldHeld: true,
  });

  const relaunched = loadRewardV2({ storageMap: firstRun.storage });
  assert.equal(await relaunched.reward.init(), true);
  assert.deepEqual(relaunched.calls.slice(0, 2).map((call) => call.name), [
    "start_reward_session",
    "complete_reward_session",
  ]);
  assert.equal(relaunched.calls.some((call) => call.name === "abandon_reward_session"), false);
});

test("an unknown legacy marker without exact start arguments remains fail closed", async () => {
  const marker = {
    id: "00000000-0000-4000-8000-000000000304",
    planned: 25,
    platform: "ios",
    serverAck: "unknown",
  };
  const h = loadRewardV2({ initial: { [K_SESSION]: marker } });

  assert.equal(await h.reward.init(), false);
  assert.deepEqual(h.read(K_SESSION), marker);
  assert.deepEqual(h.calls, []);
});

test("a normal start handles a canonical terminal replay without claiming an active session", async () => {
  const id = "00000000-0000-4000-8000-000000000001";
  const h = loadRewardV2({ rpc(name, args) {
    if (name === "start_reward_session") return ok([startRow(id, 25, "abandoned")]);
    return responseFor(name, args);
  } });

  assert.equal(await h.reward.startSession(25), false);
  assert.equal(h.read(K_SESSION), null);
  assert.deepEqual(h.read(K_QUEUE, []), []);
});

test("start rejects coercible and fractional planned minutes instead of changing the exact arguments", async () => {
  for (const value of ["25", 25.5, Infinity, NaN]) {
    const h = loadRewardV2();
    assert.equal(await h.reward.startSession(value), false);
    assert.deepEqual(h.calls, []);
    assert.equal(h.read(K_SESSION), null);
  }
});

test("account deletion cleanup stays blocked until both durable keys are proven removed", async (t) => {
  for (const key of [K_SESSION, K_QUEUE]) {
    await t.test(key, async () => {
      const h = loadRewardV2({
        initial: {
          [K_SESSION]: acknowledgedSession("session-delete-cleanup"),
          [K_QUEUE]: [{
            fn: "abandon_reward_session",
            key: "queued-delete-cleanup",
            args: { p_session_id: "queued-delete-cleanup" },
          }],
        },
        failRemoveKeys: [key],
      });
      h.setAccountState("pending_delete");
      assert.equal(h.reward.resetAfterAccountDeletion(), false);
      assert.equal(h.reward.cleanupBlocked, true);
      h.setAccountState("active");
      assert.equal(await h.reward.init(), false);
      assert.deepEqual(h.calls, []);

      h.setRemoveFailure(key, false);
      assert.equal(h.reward.resetAfterAccountDeletion(), true);
      assert.equal(h.reward.cleanupBlocked, false);
      assert.equal(h.read(K_SESSION), null);
      assert.equal(h.read(K_QUEUE), null);
      assert.equal(await h.reward.init(), true);
    });
  }
});

test("silent deletion-key removal is detected by readback and remains cleanup-blocked", () => {
  const h = loadRewardV2({
    initial: {
      [K_SESSION]: acknowledgedSession("session-silent-delete"),
      [K_QUEUE]: [{
        fn: "abandon_reward_session",
        key: "queued-silent-delete",
        args: { p_session_id: "queued-silent-delete" },
      }],
    },
    silentRemoveKeys: [K_QUEUE],
  });

  assert.equal(h.reward.resetAfterAccountDeletion(), false);
  assert.equal(h.reward.cleanupBlocked, true);
  assert.notEqual(h.read(K_QUEUE), null);
  h.setSilentRemove(K_QUEUE, false);
  assert.equal(h.reward.resetAfterAccountDeletion(), true);
  assert.equal(h.reward.cleanupBlocked, false);
});

test("strict state validation matches canonical policy fields and relationships", async (t) => {
  const invalidPolicies = [
    policyRow({ kind: "passport" }),
    policyRow({ partner_id: "shop" }),
    policyRow({ kind: "partner_specific", partner_id: null }),
    policyRow({ required_minutes: 14, progress_minutes: 0 }),
    policyRow({ required_minutes: 1441, progress_minutes: 0 }),
    policyRow({ expires_days: 0 }),
    policyRow({ expires_days: 3651 }),
    policyRow({ active: 1 }),
    policyRow({ spent_minutes: -1 }),
    policyRow({ unspent_minutes: -1 }),
    policyRow({ progress_minutes: 240 }),
    policyRow({ unspent_minutes: 31, progress_minutes: 30 }),
  ];
  const missingProgress = policyRow();
  delete missingProgress.progress_minutes;
  invalidPolicies.push(missingProgress);

  for (const policy of invalidPolicies) {
    await t.test(JSON.stringify(policy), async () => {
      const h = loadRewardV2({ rpc(name, args) {
        if (name === "my_reward_state") return ok({
          eligible_minutes: 0,
          rewards: [],
          policies: [policy],
        });
        return responseFor(name, args);
      } });
      assert.equal(await h.reward.refresh(), false);
      assert.equal(h.reward.ready, false);
    });
  }
});

test("timestamps must be owned PostgREST strings and check success requires null reason", async (t) => {
  await t.test("numeric reward timestamp", async () => {
    const h = loadRewardV2({ rpc(name, args) {
      if (name === "my_reward_state") return ok({
        eligible_minutes: 0,
        rewards: [rewardRow({ issued_at: Date.now() })],
        policies: [policyRow()],
      });
      return responseFor(name, args);
    } });
    assert.equal(await h.reward.refresh(), false);
  });

  await t.test("inherited refusal fields", async () => {
    const inherited = Object.create({ ok: false, reason: "failed_not_found" });
    const h = loadRewardV2({ rpc(name, args) {
      if (name === "check_code") return ok(inherited);
      return responseFor(name, args);
    } });
    assert.equal((await h.reward.checkCode("ABC234")).reason, "ambiguous");
  });

  for (const invalidReason of [undefined, "failed_not_found"]) {
    await t.test(`check ok reason ${String(invalidReason)}`, async () => {
      const value = {
        ok: true,
        partner_name: "U Tea",
        offer_text: "10% off",
        cashier_note: "Show before paying",
        server_time: "2026-08-17T12:00:00.000Z",
        expires_at: "2026-08-17T12:05:00.000Z",
      };
      if (invalidReason !== undefined) value.reason = invalidReason;
      const h = loadRewardV2({ rpc(name, args) {
        if (name === "check_code") return ok(value);
        return responseFor(name, args);
      } });
      assert.equal((await h.reward.checkCode("ABC234")).reason, "ambiguous");
    });
  }
});

test("progress uses the authoritative policy remainder and prefers an active policy", async () => {
  const inactive = policyRow({
    id: "a-held-old",
    active: false,
    required_minutes: 100,
    spent_minutes: 100,
    unspent_minutes: 30,
    progress_minutes: 30,
  });
  const active = policyRow({
    id: "z-current",
    required_minutes: 60,
    spent_minutes: 100,
    unspent_minutes: 30,
    progress_minutes: 30,
  });
  const h = loadRewardV2({ rpc(name, args) {
    if (name === "my_reward_state") return ok({
      eligible_minutes: 130,
      rewards: [],
      policies: [inactive, active],
    });
    return responseFor(name, args);
  } });

  assert.equal(await h.reward.refresh(), true);
  assert.deepEqual(JSON.parse(JSON.stringify(h.reward.progress())), {
    bar: 60,
    done: 30,
    left: 30,
    policy: active,
  });
  assert.equal(h.reward.progress("a-held-old").done, 30);
});

test("the Supabase-shaped adapter supports exact ambiguous-start recovery", async () => {
  const id = "00000000-0000-4000-8000-000000000401";
  const backend = RewardMock.createBackend({ now: Date.parse("2026-08-17T12:00:00.000Z") });
  backend.loadConfig({ policies: [], partners: [] });
  const client = RewardMock.createSupabaseClient(backend);
  assert.equal((await client.rpc("start_reward_session", {
    p_session_id: id,
    p_planned_minutes: 25,
    p_platform: "ios",
    p_shield: true,
  })).data[0].state, "active");

  const h = loadRewardV2({
    initial: { [K_SESSION]: {
      id,
      planned: 25,
      platform: "ios",
      shield: true,
      serverAck: "unknown",
    } },
    clientOverride: client,
  });
  assert.equal(await h.reward.init(), true);
  assert.deepEqual(h.calls.map((call) => call.name), [
    "start_reward_session",
    "abandon_reward_session",
    "issue_my_rewards",
    "my_reward_state",
  ]);
});

test("RewardMock state accounting keeps historical bars across policy changes and void status", () => {
  const backend = RewardMock.createBackend({ now: Date.parse("2026-08-17T12:00:00.000Z") });
  backend.loadConfig({
    policies: [{ id: "changing-bar", kind: "global_passport", required_minutes: 100 }],
    partners: [],
  });
  assert.equal(backend.rpc.start_reward_session({
    session_id: "00000000-0000-4000-8000-000000000501",
    planned_minutes: 130,
    platform: "ios",
    shield_claimed: true,
  }).ok, true);
  backend.advance(130 * 60 * 1000);
  assert.equal(backend.rpc.complete_reward_session({
    session_id: "00000000-0000-4000-8000-000000000501",
    shield_held: true,
  }).credited_minutes, 130);
  const issued = backend.rpc.issue_my_rewards();
  assert.equal(issued.length, 1);
  issued[0].status = "void";
  backend.db.policies.get("changing-bar").required_minutes = 60;

  backend.rpc.issue_my_rewards();
  assert.deepEqual(backend.rpc.my_reward_state().policies[0], {
    id: "changing-bar",
    kind: "global_passport",
    required_minutes: 60,
    partner_id: null,
    expires_days: null,
    active: true,
    spent_minutes: 100,
    unspent_minutes: 30,
    progress_minutes: 30,
  });
});

test("RewardMock Supabase adapter projects the canonical issue and state JSON fields", async () => {
  const backend = RewardMock.createBackend({ now: Date.parse("2026-08-17T12:00:00.000Z") });
  backend.loadConfig({
    policies: [{ id: "adapter-shape", kind: "global_passport", required_minutes: 15 }],
    partners: [],
  });
  backend.rpc.start_reward_session({
    session_id: "00000000-0000-4000-8000-000000000502",
    planned_minutes: 15,
    platform: "ios",
    shield_claimed: true,
  });
  backend.advance(15 * 60 * 1000);
  backend.rpc.complete_reward_session({
    session_id: "00000000-0000-4000-8000-000000000502",
    shield_held: true,
  });
  const client = RewardMock.createSupabaseClient(backend);
  const issue = await client.rpc("issue_my_rewards", {});
  assert.deepEqual(Object.keys(issue.data[0]).sort(), [
    "expires_at", "id", "issued_at", "offer_version", "partner_id", "policy_id", "seq", "status",
  ]);
  const state = await client.rpc("my_reward_state", {});
  assert.deepEqual(Object.keys(state.data).sort(), ["eligible_minutes", "policies", "rewards"]);
  assert.deepEqual(Object.keys(state.data.rewards[0]).sort(), [
    "expires_at", "id", "issued_at", "offer_version", "partner_id", "policy_id",
    "redeemed_at", "redeemed_partner_id", "seq", "status",
  ]);
  assert.deepEqual(Object.keys(state.data.policies[0]).sort(), [
    "active", "expires_days", "id", "kind", "partner_id", "progress_minutes",
    "required_minutes", "spent_minutes", "unspent_minutes",
  ]);
});

test("RewardMock Supabase open contract preserves the issuance bar after a policy change", async () => {
  const backend = RewardMock.createBackend({ now: Date.parse("2026-08-17T12:00:00.000Z") });
  backend.loadConfig({
    policies: [{
      id: "historical-open-bar",
      kind: "global_passport",
      required_minutes: 240,
      expires_days: null,
    }],
    partners: [{
      id: "adapter-shop",
      name: "Adapter Shop",
      offer_text: "Historical reward",
      policy_id: "historical-open-bar",
      cashier_note: "Show before paying",
    }],
  });
  backend.rpc.start_reward_session({
    session_id: "00000000-0000-4000-8000-000000000503",
    planned_minutes: 240,
    platform: "ios",
    shield_claimed: true,
  });
  backend.advance(240 * 60 * 1000);
  backend.rpc.complete_reward_session({
    session_id: "00000000-0000-4000-8000-000000000503",
    shield_held: true,
  });
  const client = RewardMock.createSupabaseClient(backend);
  const issue = await client.rpc("issue_my_rewards", {});
  assert.equal(issue.error, null);
  assert.equal(issue.status, 200);
  assert.equal(issue.data.length, 1);
  backend.db.policies.get("historical-open-bar").required_minutes = 60;

  const direct = await client.rpc("open_redemption", {
    p_reward_id: issue.data[0].id,
    p_partner_id: "adapter-shop",
  });
  assert.equal(direct.error, null);
  assert.equal(direct.status, 200);
  assert.equal(direct.data.ok, true);
  assert.equal(direct.data.bar_minutes, 240);

  const h = loadRewardV2({ clientOverride: client });
  const opened = await h.reward.openRedemption(issue.data[0].id, "adapter-shop");
  assert.equal(opened.ok, true);
  assert.equal(opened.bar_minutes, 240);
  assert.deepEqual(h.calls[0], {
    name: "open_redemption",
    args: {
      p_reward_id: issue.data[0].id,
      p_partner_id: "adapter-shop",
    },
  });
});

test("a state lease is revalidated synchronously after payload validation and before publication", async () => {
  let h;
  let switched = false;
  const state = {
    rewards: [],
    policies: [],
  };
  Object.defineProperty(state, "eligible_minutes", {
    enumerable: true,
    get() {
      if (!switched) {
        switched = true;
        h.setAccountState("pending_delete");
        h.setAccountState("active");
      }
      return 321;
    },
  });
  h = loadRewardV2({ rpc(name, args) {
    if (name === "my_reward_state") return ok(state);
    return responseFor(name, args);
  } });

  assert.equal(await h.reward.refresh(), false);
  assert.equal(h.reward.ready, false);
  assert.equal(h.reward.eligibleMinutes, 0);
});

test("state values are captured before the final lease check so publication has no identity-changing getter", async () => {
  let h;
  let reads = 0;
  const state = {
    rewards: [],
    policies: [],
  };
  Object.defineProperty(state, "eligible_minutes", {
    enumerable: true,
    get() {
      reads++;
      if (reads === 2) {
        h.setAccountState("pending_delete");
        h.setAccountState("active");
      }
      return 654;
    },
  });
  h = loadRewardV2({ rpc(name, args) {
    if (name === "my_reward_state") return ok(state);
    return responseFor(name, args);
  } });

  assert.equal(await h.reward.refresh(), false);
  assert.equal(h.reward.ready, false);
  assert.equal(h.reward.eligibleMinutes, 0);
});

test("a close lease is revalidated synchronously after payload snapshot and before marker removal", async () => {
  const id = "session-final-lease-race";
  let h;
  let switched = false;
  const row = new Proxy({
    id,
    state: "completed",
    credited_minutes: 25,
    eligible_minutes: 25,
  }, {
    ownKeys(target) {
      if (!switched) {
        switched = true;
        h.setAccountState("pending_delete");
        h.setAccountState("active");
      }
      return Reflect.ownKeys(target);
    },
  });
  h = loadRewardV2({
    initial: { [K_SESSION]: acknowledgedSession(id) },
    rpc(name, args) {
      if (name === "complete_reward_session") return ok([row]);
      return responseFor(name, args);
    },
  });

  assert.equal(await h.reward.completeSession({ shieldHeld: true }), false);
  assert.deepEqual(h.read(K_SESSION), {
    id,
    pendingClose: "complete",
    shieldHeld: true,
  });
  assert.deepEqual(h.read(K_QUEUE, []), []);
});

test("issue and state stay on one lease across active-delete-reenable", async () => {
  let h;
  let switched = false;
  let stateCalls = 0;
  const issued = rewardRow();
  Object.defineProperty(issued, "id", {
    enumerable: true,
    configurable: true,
    get() {
      if (!switched) {
        switched = true;
        h.setAccountState("pending_delete");
        h.setAccountState("active");
      }
      return "00000000-0000-4000-8000-000000000701";
    },
  });
  h = loadRewardV2({ rpc(name, args) {
    if (name === "issue_my_rewards") return ok([issued]);
    if (name === "my_reward_state") {
      stateCalls++;
      return ok(rewardState(999));
    }
    return responseFor(name, args);
  } });

  assert.equal(await h.reward.refresh(), false);
  assert.equal(stateCalls, 0, "a new account generation must not receive the old refresh's state call");
  assert.equal(h.reward.eligibleMinutes, 0);
});

test("a successful queued close keeps its item when its lease changes during row validation", async () => {
  const id = "queued-final-lease-race";
  let h;
  let switched = false;
  const row = {
    state: "abandoned",
    credited_minutes: 0,
    eligible_minutes: 25,
  };
  Object.defineProperty(row, "id", {
    enumerable: true,
    get() {
      if (!switched) {
        switched = true;
        h.setAccountState("pending_delete");
        h.setAccountState("active");
      }
      return id;
    },
  });
  h = loadRewardV2({
    initial: { [K_QUEUE]: [{
      fn: "abandon_reward_session",
      key: id,
      args: { p_session_id: id },
    }] },
    rpc(name, args) {
      if (name === "abandon_reward_session") return ok([row]);
      return responseFor(name, args);
    },
  });

  const result = await h.reward._flush();
  assert.equal(result.sent, 0);
  assert.deepEqual(h.read(K_QUEUE).map((item) => item.key), [id]);
});

test("a present Squad module without the synchronous lease API fails before RPC dispatch", async () => {
  const h = loadRewardV2();
  delete h.window.SquadCloud.captureAccountLease;
  delete h.window.SquadCloud.isAccountLeaseCurrent;

  assert.equal(await h.reward.refresh(), false);
  assert.deepEqual(h.calls, []);
  assert.equal(h.reward.ready, false);
});

test("validated active start provenance survives a one-time post-response session read fault", async () => {
  let h;
  h = loadRewardV2({ rpc(name, args) {
    if (name === "start_reward_session") {
      h.failNextRead(K_SESSION);
      return responseFor(name, args);
    }
    return responseFor(name, args);
  } });

  assert.equal(await h.reward.startSession(25), false);
  assert.equal(h.read(K_SESSION).serverAck, "unknown");
  assert.equal(await h.reward.init(), false);
  assert.equal(h.calls.filter((call) => call.name === "start_reward_session").length, 1);
  assert.equal(h.calls.some((call) => call.name === "abandon_reward_session"), false);

  assert.equal(await h.reward.completeSession({ shieldHeld: true }), true);
  assert.equal(h.calls.filter((call) => call.name === "complete_reward_session").length, 1);
  assert.equal(h.read(K_SESSION), null);
});

test("account deletion cleanup remains available behind every Reward feature gate", () => {
  for (const options of [
    { flag: false },
    { native: false },
    { cloudKeys: false },
  ]) {
    const h = loadRewardV2(Object.assign({
      initial: {
        [K_SESSION]: acknowledgedSession("disabled-cleanup"),
        [K_QUEUE]: [{
          fn: "abandon_reward_session",
          key: "disabled-cleanup",
          args: { p_session_id: "disabled-cleanup" },
        }],
      },
    }, options));

    assert.equal(typeof h.reward.resetAfterAccountDeletion, "function");
    assert.equal(h.reward.resetAfterAccountDeletion(), true);
    assert.equal(h.read(K_SESSION), null);
    assert.equal(h.read(K_QUEUE), null);
    assert.equal(h.reward.cleanupBlocked, false);
    assert.equal(h.reward.ready, false);
  }
});

test("feature-gated cleanup reports denied and silent removal until a verified retry", () => {
  for (const options of [
    { flag: false, failRemoveKeys: [K_SESSION] },
    { native: false, silentRemoveKeys: [K_QUEUE] },
  ]) {
    const h = loadRewardV2(Object.assign({
      initial: {
        [K_SESSION]: acknowledgedSession("disabled-cleanup-failure"),
        [K_QUEUE]: [{
          fn: "abandon_reward_session",
          key: "disabled-cleanup-failure",
          args: { p_session_id: "disabled-cleanup-failure" },
        }],
      },
    }, options));

    assert.equal(h.reward.resetAfterAccountDeletion(), false);
    assert.equal(h.reward.cleanupBlocked, true);
    h.setRemoveFailure(K_SESSION, false);
    h.setSilentRemove(K_QUEUE, false);
    assert.equal(h.reward.resetAfterAccountDeletion(), true);
    assert.equal(h.reward.cleanupBlocked, false);
    assert.equal(h.read(K_SESSION), null);
    assert.equal(h.read(K_QUEUE), null);
  }
});

test("state validation enforces authoritative accounting and cross-row invariants", async (t) => {
  const invalidStates = [
    {
      eligible_minutes: 130,
      rewards: [],
      policies: [policyRow({ spent_minutes: 100, unspent_minutes: 31, progress_minutes: 31 })],
    },
    {
      eligible_minutes: 90,
      rewards: [],
      policies: [policyRow({ spent_minutes: 100, unspent_minutes: 1, progress_minutes: 1 })],
    },
    {
      eligible_minutes: 0,
      rewards: [],
      policies: [policyRow(), policyRow()],
    },
    {
      eligible_minutes: 0,
      rewards: [rewardRow({ policy_id: "missing-policy" })],
      policies: [policyRow()],
    },
    {
      eligible_minutes: 0,
      rewards: [rewardRow({ partner_id: "shop-a" })],
      policies: [policyRow()],
    },
    {
      eligible_minutes: 0,
      rewards: [rewardRow({ policy_id: "shop-policy", partner_id: "shop-b" })],
      policies: [policyRow({
        id: "shop-policy",
        kind: "partner_specific",
        partner_id: "shop-a",
      })],
    },
  ];

  for (const [index, state] of invalidStates.entries()) {
    await t.test(`invalid cross-row snapshot ${index + 1}`, async () => {
      const h = loadRewardV2({ rpc(name, args) {
        if (name === "my_reward_state") return ok(state);
        return responseFor(name, args);
      } });
      assert.equal(await h.reward.refresh(), false);
      assert.equal(h.reward.ready, false);
    });
  }

  await t.test("an inactive redeemed reward may outlive the returned policy list", async () => {
    const h = loadRewardV2({ rpc(name, args) {
      if (name === "my_reward_state") return ok({
        eligible_minutes: 0,
        rewards: [rewardRow({
          policy_id: "retired-policy",
          status: "redeemed",
          redeemed_at: "2026-08-17T12:10:00.000Z",
          redeemed_partner_id: "shop-a",
        })],
        policies: [],
      });
      return responseFor(name, args);
    } });
    assert.equal(await h.reward.refresh(), true);
  });
});

test("redemption refusal reasons are restricted to each canonical SQL endpoint", async (t) => {
  const contracts = [
    {
      name: "open_redemption",
      invoke: (reward) => reward.openRedemption("reward", "partner"),
      allowed: ["failed_not_found", "failed_partner_paused", "failed_already_redeemed",
        "failed_expired", "failed_wrong_partner", "failed_offer_changed", "failed_capped",
        "failed_outside_window", "failed_code_unavailable"],
      impossible: ["failed_code_expired"],
    },
    {
      name: "redeem_by_code",
      invoke: (reward) => reward.redeemByCode("ABC234"),
      allowed: ["failed_not_found", "failed_already_redeemed", "failed_code_expired",
        "failed_partner_paused", "failed_expired", "failed_offer_changed", "failed_capped",
        "failed_outside_window"],
      impossible: ["failed_wrong_partner", "failed_code_unavailable"],
    },
    {
      name: "check_code",
      invoke: (reward) => reward.checkCode("ABC234"),
      allowed: ["failed_not_found", "failed_already_redeemed", "failed_code_expired",
        "failed_partner_paused", "failed_expired", "failed_offer_changed", "failed_capped",
        "failed_outside_window"],
      impossible: ["failed_wrong_partner", "failed_code_unavailable"],
    },
  ];

  for (const contract of contracts) {
    for (const reason of contract.allowed) {
      await t.test(`${contract.name} accepts ${reason}`, async () => {
        const h = loadRewardV2({ rpc(name, args) {
          if (name === contract.name) return ok({ ok: false, reason });
          return responseFor(name, args);
        } });
        assert.equal((await contract.invoke(h.reward)).reason, reason);
      });
    }
    for (const reason of contract.impossible) {
      await t.test(`${contract.name} rejects ${reason}`, async () => {
        const h = loadRewardV2({ rpc(name, args) {
          if (name === contract.name) return ok({ ok: false, reason });
          return responseFor(name, args);
        } });
        assert.equal((await contract.invoke(h.reward)).reason, "ambiguous");
      });
    }
  }
});

test("an account rotation in the rpc getter prevents dispatch", async () => {
  let h;
  let armed = false;
  let readsAfterCapture = 0;
  let dispatches = 0;
  const client = {};
  Object.defineProperty(client, "rpc", {
    configurable: true,
    get() {
      if (armed) {
        readsAfterCapture++;
        if (readsAfterCapture === 1) {
          h.setAccountState("pending_delete");
          h.setAccountState("active");
        }
      }
      return function (name, args) {
        dispatches++;
        return responseFor(name, args);
      };
    },
  });
  h = loadRewardV2({ clientOverride: client, trackClientOverride: false });
  const capture = h.window.SquadCloud.captureAccountLease.bind(h.window.SquadCloud);
  h.window.SquadCloud.captureAccountLease = function (candidate) {
    const lease = capture(candidate);
    if (lease) armed = true;
    return lease;
  };

  assert.equal(await h.reward.refresh(), false);
  assert.equal(readsAfterCapture, 1);
  assert.equal(dispatches, 0);
  assert.equal(h.reward.ready, false);
});

test("an account rotation in the session removeItem getter prevents close-marker deletion", async () => {
  const id = "remove-getter-race";
  let h;
  let armed = false;
  let removals = 0;
  h = loadRewardV2({
    initial: { [K_SESSION]: acknowledgedSession(id) },
    rpc(name, args) {
      if (name === "complete_reward_session") {
        armed = true;
        return ok([closeRow(id)]);
      }
      return responseFor(name, args);
    },
  });
  const removeItem = h.localStorage.removeItem;
  Object.defineProperty(h.localStorage, "removeItem", {
    configurable: true,
    get() {
      if (armed) {
        h.setAccountState("pending_delete");
        h.setAccountState("active");
      }
      return function (key) {
        removals++;
        return removeItem.call(this, key);
      };
    },
  });

  assert.equal(await h.reward.completeSession({ shieldHeld: true }), false);
  assert.equal(removals, 0);
  assert.deepEqual(h.read(K_SESSION), { id, pendingClose: "complete", shieldHeld: true });
});

test("an account rotation in the queue setItem getter prevents a post-RPC rewrite", async () => {
  const id = "queue-set-getter-race";
  const queued = [{
    fn: "abandon_reward_session",
    key: id,
    args: { p_session_id: id },
  }];
  let h;
  let armed = false;
  let writes = 0;
  h = loadRewardV2({
    initial: { [K_QUEUE]: queued },
    rpc(name, args) {
      if (name === "abandon_reward_session") {
        armed = true;
        return ok([closeRow(id, "abandoned", 0)]);
      }
      return responseFor(name, args);
    },
  });
  const setItem = h.localStorage.setItem;
  Object.defineProperty(h.localStorage, "setItem", {
    configurable: true,
    get() {
      if (armed) {
        h.setAccountState("pending_delete");
        h.setAccountState("active");
      }
      return function (key, value) {
        writes++;
        return setItem.call(this, key, value);
      };
    },
  });

  const result = await h.reward._flush();
  assert.equal(result.sent, 0);
  assert.equal(writes, 0);
  assert.deepEqual(h.read(K_QUEUE), queued);
});

test("snapshot validation rejects accessor-backed data before publication", async () => {
  let eligibleReads = 0;
  const state = { rewards: [], policies: [] };
  Object.defineProperty(state, "eligible_minutes", {
    enumerable: true,
    get() {
      eligibleReads++;
      return eligibleReads === 1 ? 0 : 999;
    },
  });
  const h = loadRewardV2({ rpc(name, args) {
    if (name === "my_reward_state") return ok(state);
    return responseFor(name, args);
  } });

  assert.equal(await h.reward.refresh(), false);
  assert.equal(h.reward.ready, false);
  assert.equal(h.reward.eligibleMinutes, 0);
  assert.equal(eligibleReads, 0);
});

test("snapshot validation rejects symbols, array extras, cycles, exotic prototypes, and unsupported values", async (t) => {
  const cases = [
    ["symbol property", () => {
      const state = rewardState();
      state[Symbol("unexpected")] = true;
      return state;
    }],
    ["array extra property", () => {
      const state = rewardState();
      state.rewards.extra = true;
      return state;
    }],
    ["cycle", () => {
      const state = rewardState();
      state.self = state;
      return state;
    }],
    ["exotic prototype", () => Object.assign(Object.create({ inherited: true }), rewardState())],
    ["unsupported value", () => Object.assign(rewardState(), { unexpected: undefined })],
  ];

  for (const [name, makeState] of cases) {
    await t.test(name, async () => {
      const state = makeState();
      const h = loadRewardV2({ rpc(rpcName, args) {
        if (rpcName === "my_reward_state") return ok(state);
        return responseFor(rpcName, args);
      } });
      assert.equal(await h.reward.refresh(), false);
      assert.equal(h.reward.ready, false);
    });
  }
});

test("snapshot publication remains writable after accessor installation is rejected", async () => {
  const h = loadRewardV2({ rpc(name, args) {
    if (name === "my_reward_state") return ok(rewardState(25));
    return responseFor(name, args);
  } });
  let setterCalls = 0;
  assert.throws(() => Object.defineProperty(h.reward, "eligibleMinutes", {
    get() { return 0; },
    set() { setterCalls++; },
  }), TypeError);

  assert.equal(await h.reward.refresh(), true);
  assert.equal(setterCalls, 0);
  assert.equal(h.reward.ready, true);
  assert.equal(h.reward.eligibleMinutes, 25);
});

test("malformed persisted close intents remain byte-for-byte untouched and send no RPC", async (t) => {
  const cases = [
    ["completion missing shield", { id: "bad-complete", pendingClose: "complete" }],
    ["unknown close intent", { id: "bad-intent", pendingClose: "mystery" }],
    ["abandon with completion argument", {
      id: "bad-abandon", pendingClose: "abandon", shieldHeld: true,
    }],
    ["completion with contradictory acknowledgement", {
      id: "bad-complete-extra", pendingClose: "complete", shieldHeld: true, serverAck: true,
    }],
  ];

  for (const [name, marker] of cases) {
    await t.test(name, async () => {
      const raw = JSON.stringify(marker);
      const storageMap = new Map([[K_SESSION, raw]]);
      const h = loadRewardV2({ storageMap });
      assert.equal(await h.reward.init(), false);
      assert.deepEqual(h.calls, []);
      assert.equal(h.storage.get(K_SESSION), raw);
    });
  }
});

test("enqueue refuses a conflicting completion without removing the source marker", async () => {
  const id = "conflicting-completion";
  const queued = [{
    fn: "complete_reward_session",
    key: id,
    args: { p_session_id: id, p_shield_held: false },
  }];
  const h = loadRewardV2({
    initial: {
      [K_SESSION]: acknowledgedSession(id),
      [K_QUEUE]: queued,
    },
    rpc(name, args) {
      if (name === "complete_reward_session") {
        return { data: null, error: { message: "Failed to fetch" }, status: 0 };
      }
      return responseFor(name, args);
    },
  });

  assert.equal(await h.reward.completeSession({ shieldHeld: true }), false);
  assert.deepEqual(h.read(K_QUEUE), queued);
  assert.deepEqual(h.read(K_SESSION), { id, pendingClose: "complete", shieldHeld: true });
  assert.deepEqual(h.calls, [{
    name: "complete_reward_session",
    args: { p_session_id: id, p_shield_held: true },
  }]);
});

test("persisted queue conflicts are retained untouched and never flushed", async (t) => {
  const id = "corrupt-queue-session";
  const cases = [
    [
      "complete plus abandon",
      [
        { fn: "complete_reward_session", key: id,
          args: { p_session_id: id, p_shield_held: true } },
        { fn: "abandon_reward_session", key: id, args: { p_session_id: id } },
      ],
    ],
    [
      "conflicting completion arguments",
      [
        { fn: "complete_reward_session", key: id,
          args: { p_session_id: id, p_shield_held: false } },
        { fn: "complete_reward_session", key: id,
          args: { p_session_id: id, p_shield_held: true } },
      ],
    ],
  ];

  for (const [name, queue] of cases) {
    await t.test(name, async () => {
      const raw = JSON.stringify(queue);
      const storageMap = new Map([[K_QUEUE, raw]]);
      const h = loadRewardV2({ storageMap });
      const result = await h.reward._flush();
      assert.equal(result.sent, 0);
      assert.equal(result.storageFailed, true);
      assert.deepEqual(h.calls, []);
      assert.equal(h.storage.get(K_QUEUE), raw);
    });
  }
});

test("a nonwritable public state field blocks snapshot publication without partial updates", async () => {
  const h = loadRewardV2({ rpc(name, args) {
    if (name === "my_reward_state") return ok(rewardState(25));
    return responseFor(name, args);
  } });
  h.reward.eligibleMinutes = 7;
  const rewardsBefore = h.reward.rewards;
  const policiesBefore = h.reward.policies;
  Object.defineProperty(h.reward, "eligibleMinutes", {
    writable: false,
  });

  assert.equal(await h.reward.refresh(), false);
  assert.equal(h.reward.ready, false);
  assert.equal(h.reward.eligibleMinutes, 7);
  assert.equal(h.reward.rewards, rewardsBefore);
  assert.equal(h.reward.policies, policiesBefore);
  assert.equal(h.reward.lastSyncAt, 0);
});

test("an exactly equivalent queued close deduplicates without losing durable work", async () => {
  const id = "equivalent-completion";
  const queued = [{
    fn: "complete_reward_session",
    key: id,
    args: { p_session_id: id, p_shield_held: true },
  }];
  const h = loadRewardV2({
    initial: {
      [K_SESSION]: acknowledgedSession(id),
      [K_QUEUE]: queued,
    },
    rpc(name, args) {
      if (name === "complete_reward_session") {
        return { data: null, error: { code: "08006", message: "lost" }, status: 0 };
      }
      return responseFor(name, args);
    },
  });

  assert.equal(await h.reward.completeSession({ shieldHeld: true }), false);
  assert.deepEqual(h.read(K_QUEUE), queued);
  assert.deepEqual(h.read(K_SESSION), { id, pendingClose: "complete", shieldHeld: true });
});

test("thrown transport errors preserve own code and status while retaining close work", async () => {
  const id = "thrown-close";
  const h = loadRewardV2({
    initial: { [K_SESSION]: acknowledgedSession(id) },
    rpc(name, args) {
      if (name === "complete_reward_session") {
        const error = new Error("connection lost");
        error.code = "08006";
        error.status = 0;
        throw error;
      }
      return responseFor(name, args);
    },
  });

  assert.equal(await h.reward.completeSession({ shieldHeld: true }), false);
  assert.equal(h.reward.lastError.code, "08006");
  assert.equal(h.reward.lastError.status, 0);
  assert.deepEqual(h.read(K_SESSION), { id, pendingClose: "complete", shieldHeld: true });
});

test("the RPC method getter is consulted exactly once after account-lease capture", async () => {
  let h;
  let armed = false;
  let getterReads = 0;
  let dispatches = 0;
  const client = {};
  Object.defineProperty(client, "rpc", {
    configurable: true,
    get() {
      if (armed) getterReads++;
      return function (name) {
        dispatches++;
        if (name === "check_code") return ok({ ok: false, reason: "failed_not_found" });
        return responseFor(name);
      };
    },
  });
  h = loadRewardV2({ clientOverride: client, trackClientOverride: false });
  const capture = h.window.SquadCloud.captureAccountLease.bind(h.window.SquadCloud);
  h.window.SquadCloud.captureAccountLease = function (candidate) {
    const lease = capture(candidate);
    if (lease) armed = true;
    return lease;
  };

  assert.deepEqual(JSON.parse(JSON.stringify(await h.reward.checkCode("ABC234"))), {
    ok: false,
    reason: "failed_not_found",
  });
  assert.equal(dispatches, 1);
  assert.equal(getterReads, 1);
});

test("a throwing RPC getter after lease capture resolves as ambiguous instead of rejecting", async () => {
  let h;
  let armed = false;
  const client = {};
  Object.defineProperty(client, "rpc", {
    configurable: true,
    get() {
      if (armed) {
        const error = new Error("RPC getter failed");
        error.code = "rpc_getter_failed";
        error.status = 0;
        throw error;
      }
      return function (name, args) { return responseFor(name, args); };
    },
  });
  h = loadRewardV2({ clientOverride: client, trackClientOverride: false });
  const capture = h.window.SquadCloud.captureAccountLease.bind(h.window.SquadCloud);
  h.window.SquadCloud.captureAccountLease = function (candidate) {
    const lease = capture(candidate);
    if (lease) armed = true;
    return lease;
  };

  let result;
  await assert.doesNotReject(async () => {
    result = await h.reward.checkCode("ABC234");
  });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { ok: false, reason: "ambiguous" });
  assert.equal(h.reward.lastError.code, "rpc_getter_failed");
  assert.equal(h.reward.lastError.status, 0);
});

test("a queue rewrite never consults the RPC getter after dispatch", async () => {
  const oldItem = {
    fn: "abandon_reward_session",
    key: "rpc-getter-old",
    args: { p_session_id: "rpc-getter-old" },
  };
  const injectedItem = {
    fn: "abandon_reward_session",
    key: "rpc-getter-injected",
    args: { p_session_id: "rpc-getter-injected" },
  };
  let h;
  let rewriteGuard = false;
  let injected = false;
  const client = {};
  Object.defineProperty(client, "rpc", {
    configurable: true,
    get() {
      if (rewriteGuard && !injected) {
        injected = true;
        h.storage.set(K_QUEUE, JSON.stringify([oldItem, injectedItem]));
      }
      return function (name, args) { return responseFor(name, args); };
    },
  });
  h = loadRewardV2({
    initial: { [K_QUEUE]: [oldItem] },
    clientOverride: client,
    trackClientOverride: false,
  });
  const setItem = h.localStorage.setItem;
  Object.defineProperty(h.localStorage, "setItem", {
    configurable: true,
    get() {
      rewriteGuard = true;
      return setItem;
    },
  });

  const result = await h.reward._flush();
  assert.equal(result.sent, 1);
  assert.equal(injected, false);
  assert.deepEqual(h.read(K_QUEUE), []);
});

test("queue preimage mismatch from a setItem getter preserves both old and injected work", async () => {
  const oldItem = {
    fn: "abandon_reward_session",
    key: "set-getter-old",
    args: { p_session_id: "set-getter-old" },
  };
  const injectedItem = {
    fn: "complete_reward_session",
    key: "set-getter-new",
    args: { p_session_id: "set-getter-new", p_shield_held: true },
  };
  let h;
  let armed = false;
  let mutationCalls = 0;
  let injected = false;
  h = loadRewardV2({
    initial: { [K_QUEUE]: [oldItem] },
    rpc(name, args) {
      if (name === "abandon_reward_session") armed = true;
      return responseFor(name, args);
    },
  });
  const setItem = h.localStorage.setItem;
  Object.defineProperty(h.localStorage, "setItem", {
    configurable: true,
    get() {
      if (armed && !injected) {
        injected = true;
        h.storage.set(K_QUEUE, JSON.stringify([oldItem, injectedItem]));
      }
      return function (key, value) {
        mutationCalls++;
        return setItem.call(this, key, value);
      };
    },
  });

  const result = await h.reward._flush();
  assert.equal(result.sent, 0);
  assert.equal(result.storageFailed, true);
  assert.equal(mutationCalls, 0);
  assert.deepEqual(h.read(K_QUEUE), [oldItem, injectedItem]);
});

test("session preimage mismatch from a removeItem getter preserves the newer marker", async () => {
  const oldId = "remove-preimage-old";
  const newer = acknowledgedSession("remove-preimage-new");
  let h;
  let armed = false;
  let mutationCalls = 0;
  let swapped = false;
  h = loadRewardV2({
    initial: { [K_SESSION]: acknowledgedSession(oldId) },
    rpc(name, args) {
      if (name === "complete_reward_session") armed = true;
      return responseFor(name, args);
    },
  });
  const removeItem = h.localStorage.removeItem;
  Object.defineProperty(h.localStorage, "removeItem", {
    configurable: true,
    get() {
      if (armed && !swapped) {
        swapped = true;
        h.storage.set(K_SESSION, JSON.stringify(newer));
      }
      return function (key) {
        mutationCalls++;
        return removeItem.call(this, key);
      };
    },
  });

  assert.equal(await h.reward.completeSession({ shieldHeld: true }), false);
  assert.equal(mutationCalls, 0);
  assert.equal(h.storage.get(K_SESSION), JSON.stringify(newer));
});

test("direct close APIs preserve a corrupt queue and session without dispatch", async (t) => {
  for (const intent of ["complete", "abandon"]) {
    await t.test(intent, async () => {
      const id = `corrupt-direct-${intent}`;
      const sessionRaw = JSON.stringify(acknowledgedSession(id));
      const queueRaw = JSON.stringify([
        { fn: "complete_reward_session", key: id,
          args: { p_session_id: id, p_shield_held: true } },
        { fn: "abandon_reward_session", key: id, args: { p_session_id: id } },
      ]);
      const storageMap = new Map([[K_SESSION, sessionRaw], [K_QUEUE, queueRaw]]);
      const h = loadRewardV2({ storageMap });

      const result = intent === "complete"
        ? await h.reward.completeSession({ shieldHeld: true })
        : await h.reward.abandonSession();
      assert.equal(result, false);
      assert.deepEqual(h.calls, []);
      assert.equal(h.storage.get(K_SESSION), sessionRaw);
      assert.equal(h.storage.get(K_QUEUE), queueRaw);
    });
  }
});

test("public Reward state fields reject accessor installation but remain writable data", () => {
  const h = loadRewardV2();
  const fields = ["ready", "eligibleMinutes", "rewards", "policies", "lastError",
    "lastSyncAt", "cleanupBlocked"];
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(h.reward, field);
    assert.equal(descriptor.configurable, false, field);
    assert.equal(descriptor.writable, true, field);
    assert.equal(Object.hasOwn(descriptor, "value"), true, field);
    assert.throws(() => {
      Object.defineProperty(h.reward, field, { get() { return "forged"; } });
    }, TypeError);
  }
  h.reward.eligibleMinutes = 17;
  assert.equal(h.reward.eligibleMinutes, 17);
});

test("cleanup removes durable work but blocks safely when a public reset field is nonwritable", async () => {
  const id = "cleanup-nonwritable";
  const h = loadRewardV2({
    initial: {
      [K_SESSION]: acknowledgedSession(id),
      [K_QUEUE]: [{ fn: "abandon_reward_session", key: id, args: { p_session_id: id } }],
    },
  });
  h.reward.ready = true;
  h.reward.eligibleMinutes = 999;
  Object.defineProperty(h.reward, "eligibleMinutes", { writable: false });

  let result;
  assert.doesNotThrow(() => { result = h.reward.resetAfterAccountDeletion(); });
  assert.equal(result, false);
  assert.equal(h.read(K_SESSION), null);
  assert.equal(h.read(K_QUEUE), null);
  assert.equal(h.reward.cleanupBlocked, true);
  assert.equal(h.reward.eligibleMinutes, 999);
  assert.equal(await h.reward.refresh(), false);
  assert.deepEqual(h.calls, []);
});

test("cleanup captures throwing callback getters and callbacks without ever throwing", async (t) => {
  for (const mode of ["getter", "callback"]) {
    await t.test(mode, () => {
      const h = loadRewardV2({ initial: {
        [K_SESSION]: acknowledgedSession(`callback-${mode}`),
      } });
      let getterReads = 0;
      Object.defineProperty(h.window, "onRewardV2Sync", {
        configurable: true,
        get() {
          getterReads++;
          if (mode === "getter") throw new Error("callback getter failed");
          return function () { throw new Error("callback failed"); };
        },
      });

      let result;
      assert.doesNotThrow(() => { result = h.reward.resetAfterAccountDeletion(); });
      assert.equal(result, true);
      assert.equal(getterReads, 1);
      assert.equal(h.reward.ready, false);
      assert.equal(h.reward.eligibleMinutes, 0);
      assert.equal(h.reward.cleanupBlocked, false);
    });
  }
});

test("publication performs no getter-capable lease work between descriptor preflight and update", async () => {
  let h;
  let publicationArmed = false;
  let injected = false;
  const client = {};
  Object.defineProperty(client, "rpc", {
    configurable: true,
    get() {
      if (publicationArmed && !injected) {
        injected = true;
        Object.defineProperty(h.reward, "lastSyncAt", {
          configurable: false,
          enumerable: true,
          get() { return 444; },
        });
      }
      return function (name, args) {
        if (name === "my_reward_state") return ok(rewardState(88));
        return responseFor(name, args);
      };
    },
  });
  h = loadRewardV2({ clientOverride: client, trackClientOverride: false });
  Object.defineProperty(h.window, "onRewardV2Sync", {
    configurable: true,
    get() {
      publicationArmed = true;
      return null;
    },
  });

  assert.equal(await h.reward.refresh(), true);
  assert.equal(injected, false);
  assert.equal(h.reward.ready, true);
  assert.equal(h.reward.eligibleMinutes, 88);
  const descriptor = Object.getOwnPropertyDescriptor(h.reward, "lastSyncAt");
  assert.equal(Object.hasOwn(descriptor, "value"), true);
  assert.equal(typeof descriptor.value, "number");
});

test("a flush preserves replacement work for the same session when its arguments changed", async () => {
  const id = "same-session-replacement";
  const first = deferred();
  const oldQueue = [{
    fn: "complete_reward_session",
    key: id,
    args: { p_session_id: id, p_shield_held: false },
  }];
  const replacement = [{
    fn: "complete_reward_session",
    key: id,
    args: { p_session_id: id, p_shield_held: true },
  }];
  const h = loadRewardV2({
    initial: { [K_QUEUE]: oldQueue },
    rpc(name, args) {
      if (name === "complete_reward_session") return first.promise;
      return responseFor(name, args);
    },
  });

  const flushing = h.reward._flush();
  await waitFor(() => h.calls.length === 1, "queued close did not dispatch");
  const replacementRaw = JSON.stringify(replacement);
  h.storage.set(K_QUEUE, replacementRaw);
  first.resolve(ok([closeRow(id)]));

  const result = await flushing;
  assert.equal(result.sent, 0);
  assert.equal(h.storage.get(K_QUEUE), replacementRaw);
  assert.deepEqual(h.read(K_QUEUE), replacement);
});

test("post-dispatch lease checks never reacquire Squad or RPC properties", async () => {
  const response = deferred();
  let dispatches = 0;
  let rpcGetterReads = 0;
  let squadGetterReads = 0;
  const client = {
    rpc() {
      dispatches++;
      return response.promise;
    },
  };
  const h = loadRewardV2({ clientOverride: client, trackClientOverride: false });
  const checking = h.reward.checkCode("ABC234");
  await waitFor(() => dispatches === 1, "code check did not dispatch");
  Object.defineProperty(client, "rpc", {
    configurable: true,
    get() {
      rpcGetterReads++;
      throw new Error("post-dispatch RPC lookup");
    },
  });
  Object.defineProperty(h.window, "SquadCloud", {
    configurable: true,
    get() {
      squadGetterReads++;
      throw new Error("post-dispatch Squad lookup");
    },
  });
  response.resolve(ok({ ok: false, reason: "failed_not_found" }));

  const result = await checking;
  assert.equal(result.ok, false);
  assert.equal(result.reason, "failed_not_found");
  assert.equal(rpcGetterReads, 0);
  assert.equal(squadGetterReads, 0);
});

test("failed cleanup never exposes a stale ready snapshot through reward readers", async () => {
  const snapshot = {
    eligible_minutes: 25,
    rewards: [rewardRow()],
    policies: [policyRow({ unspent_minutes: 25, progress_minutes: 25 })],
  };
  const h = loadRewardV2({ rpc(name, args) {
    if (name === "my_reward_state") return ok(snapshot);
    return responseFor(name, args);
  } });
  assert.equal(await h.reward.refresh(), true);
  assert.equal(h.reward.available().length, 1);
  assert.notEqual(h.reward.progress(), null);
  h.storage.set(K_SESSION, JSON.stringify(acknowledgedSession("cleanup-stale-reader")));
  Object.defineProperty(h.reward, "eligibleMinutes", { writable: false });

  assert.equal(h.reward.resetAfterAccountDeletion(), false);
  assert.equal(h.reward.ready, true);
  assert.equal(h.reward.cleanupBlocked, true);
  assert.equal(h.reward.available().length, 0);
  assert.equal(h.reward.progress(), null);
});

test("failed refresh with nonwritable ready never rejects or exposes the old snapshot", async () => {
  let failIssue = false;
  const snapshot = {
    eligible_minutes: 25,
    rewards: [rewardRow()],
    policies: [policyRow({ unspent_minutes: 25, progress_minutes: 25 })],
  };
  const h = loadRewardV2({ rpc(name, args) {
    if (name === "issue_my_rewards" && failIssue) {
      return { data: null, error: { code: "08006", message: "offline" }, status: 503 };
    }
    if (name === "my_reward_state") return ok(snapshot);
    return responseFor(name, args);
  } });
  assert.equal(await h.reward.refresh(), true);
  assert.equal(h.reward.available().length, 1);
  Object.defineProperty(h.reward, "ready", { writable: false });
  failIssue = true;

  let result;
  await assert.doesNotReject(async () => { result = await h.reward.refresh(); });
  assert.equal(result, false);
  assert.equal(h.reward.ready, true);
  assert.equal(h.reward.available().length, 0);
  assert.equal(h.reward.progress(), null);
});

test("ambiguous close keeps the session marker and never attempts queue handoff removal", async () => {
  const id = "marker-remains-authority";
  const h = loadRewardV2({
    initial: { [K_SESSION]: acknowledgedSession(id) },
    rpc(name, args) {
      if (name === "complete_reward_session") {
        return { data: null, error: { code: "08006", message: "lost" }, status: 0 };
      }
      return responseFor(name, args);
    },
  });
  const realRemove = h.localStorage.removeItem;
  let removeGetterReads = 0;
  let sessionRemovals = 0;
  Object.defineProperty(h.localStorage, "removeItem", {
    configurable: true,
    get() {
      removeGetterReads++;
      h.storage.delete(K_QUEUE);
      return function (key) {
        if (key === K_SESSION) sessionRemovals++;
        return Reflect.apply(realRemove, this, [key]);
      };
    },
  });

  assert.equal(await h.reward.completeSession({ shieldHeld: true }), false);
  assert.equal(removeGetterReads, 0);
  assert.equal(sessionRemovals, 0);
  assert.deepEqual(h.read(K_SESSION), {
    id,
    pendingClose: "complete",
    shieldHeld: true,
  });
  assert.deepEqual(h.read(K_QUEUE), [{
    fn: "complete_reward_session",
    key: id,
    args: { p_session_id: id, p_shield_held: true },
  }]);
});

test("a queued close can disappear on relaunch because the session marker remains authoritative", async () => {
  const id = "marker-only-relaunch";
  const storage = new Map();
  const first = loadRewardV2({
    storageMap: storage,
    initial: { [K_SESSION]: acknowledgedSession(id) },
    rpc(name, args) {
      if (name === "complete_reward_session") {
        return { data: null, error: { code: "08006", message: "lost" }, status: 0 };
      }
      return responseFor(name, args);
    },
  });
  assert.equal(await first.reward.completeSession({ shieldHeld: false }), false);
  assert.equal(first.read(K_SESSION).pendingClose, "complete");
  storage.delete(K_QUEUE);

  const relaunched = loadRewardV2({ storageMap: storage });
  assert.equal(await relaunched.reward.init(), true);
  assert.deepEqual(relaunched.calls.map((call) => call.name), [
    "complete_reward_session",
    "issue_my_rewards",
    "my_reward_state",
  ]);
  assert.deepEqual(relaunched.calls[0].args, {
    p_session_id: id,
    p_shield_held: false,
  });
  assert.equal(relaunched.read(K_SESSION), null);
  assert.equal(relaunched.read(K_QUEUE), null);
});

test("successful queue flush then terminal marker replay converges without deadlock", async () => {
  const id = "queue-then-marker-converges";
  let closeAttempts = 0;
  const h = loadRewardV2({
    initial: { [K_SESSION]: acknowledgedSession(id) },
    rpc(name, args) {
      if (name === "complete_reward_session") {
        closeAttempts++;
        if (closeAttempts === 1) {
          return { data: null, error: { code: "08006", message: "lost" }, status: 0 };
        }
        return ok([closeRow(id)]);
      }
      return responseFor(name, args);
    },
  });
  assert.equal(await h.reward.completeSession({ shieldHeld: true }), false);
  assert.equal(h.read(K_SESSION).pendingClose, "complete");
  assert.equal(h.read(K_QUEUE).length, 1);

  assert.equal(await h.reward.init(), true);
  assert.equal(closeAttempts, 3);
  assert.deepEqual(h.calls.filter((call) => call.name === "complete_reward_session")
    .map((call) => call.args.p_shield_held), [true, true, true]);
  assert.equal(h.read(K_SESSION), null);
  assert.deepEqual(h.read(K_QUEUE), []);
  assert.equal(h.reward.ready, true);
});

test("deletion cleanup captures storage primitives once and verifies both keys together", async (t) => {
  for (const runtime of [
    ["enabled native", { native: true, flag: true }],
    ["disabled native", { native: true, flag: false }],
    ["web", { native: false, flag: true }],
  ]) {
    await t.test(runtime[0], () => {
      const id = `paired-cleanup-${runtime[0]}`;
      const sessionRaw = JSON.stringify(acknowledgedSession(id));
      const h = loadRewardV2(Object.assign({}, runtime[1], {
        initial: {
          [K_SESSION]: sessionRaw,
          [K_QUEUE]: [{ fn: "abandon_reward_session", key: id,
            args: { p_session_id: id } }],
        },
      }));
      const realRemove = h.localStorage.removeItem;
      let removeGetterReads = 0;
      Object.defineProperty(h.localStorage, "removeItem", {
        configurable: true,
        get() {
          removeGetterReads++;
          if (removeGetterReads === 2) h.storage.set(K_SESSION, sessionRaw);
          return realRemove;
        },
      });

      assert.equal(h.reward.resetAfterAccountDeletion(), true);
      assert.equal(removeGetterReads, 1);
      assert.equal(h.storage.has(K_SESSION), false);
      assert.equal(h.storage.has(K_QUEUE), false);
      assert.equal(h.reward.cleanupBlocked, false);
    });
  }
});

test("a close RPC getter cannot dispatch after changing either durable precondition", async () => {
  const id = "close-post-getter-guard";
  const conflict = [{
    fn: "abandon_reward_session",
    key: id,
    args: { p_session_id: id },
  }];
  const conflictRaw = JSON.stringify(conflict);
  let dispatches = 0;
  let h;
  const client = {};
  Object.defineProperty(client, "rpc", {
    configurable: true,
    get() {
      h.storage.set(K_QUEUE, conflictRaw);
      return function () {
        dispatches++;
        return ok([closeRow(id)]);
      };
    },
  });
  h = loadRewardV2({
    initial: { [K_SESSION]: acknowledgedSession(id) },
    clientOverride: client,
    trackClientOverride: false,
  });

  assert.equal(await h.reward.completeSession({ shieldHeld: true }), false);
  assert.equal(dispatches, 0);
  assert.deepEqual(h.read(K_SESSION), {
    id,
    pendingClose: "complete",
    shieldHeld: true,
  });
  assert.equal(h.storage.get(K_QUEUE), conflictRaw);
});

test("durable dispatch guards cover new start, replay start, and queued flush", async (t) => {
  await t.test("new start", async () => {
    const injectedRaw = JSON.stringify([{ fn: "abandon_reward_session", key: "other",
      args: { p_session_id: "other" } }]);
    let dispatches = 0;
    let h;
    const client = {};
    Object.defineProperty(client, "rpc", {
      configurable: true,
      get() {
        h.storage.set(K_QUEUE, injectedRaw);
        return function () {
          dispatches++;
          return ok([startRow("00000000-0000-4000-8000-000000000001")]);
        };
      },
    });
    h = loadRewardV2({ clientOverride: client, trackClientOverride: false });

    assert.equal(await h.reward.startSession(25), false);
    assert.equal(dispatches, 0);
    assert.equal(h.read(K_SESSION).serverAck, "unknown");
    assert.equal(h.storage.get(K_QUEUE), injectedRaw);
  });

  await t.test("replay start", async () => {
    const id = "00000000-0000-4000-8000-000000000902";
    const marker = {
      id,
      planned: 25,
      platform: "ios",
      shield: true,
      serverAck: "unknown",
    };
    const injectedRaw = JSON.stringify([{ fn: "abandon_reward_session", key: "other",
      args: { p_session_id: "other" } }]);
    let dispatches = 0;
    let h;
    const client = {};
    Object.defineProperty(client, "rpc", {
      configurable: true,
      get() {
        h.storage.set(K_QUEUE, injectedRaw);
        return function () {
          dispatches++;
          return ok([startRow(id)]);
        };
      },
    });
    h = loadRewardV2({
      initial: { [K_SESSION]: marker },
      clientOverride: client,
      trackClientOverride: false,
    });

    assert.equal(await h.reward.init(), false);
    assert.equal(dispatches, 0);
    assert.equal(h.read(K_SESSION).pendingClose, "abandon");
    assert.equal(h.storage.get(K_QUEUE), injectedRaw);
  });

  await t.test("queued flush", async () => {
    const id = "guarded-queued-flush";
    const queue = [{ fn: "complete_reward_session", key: id,
      args: { p_session_id: id, p_shield_held: true } }];
    const injected = acknowledgedSession("injected-session");
    let dispatches = 0;
    let h;
    const client = {};
    Object.defineProperty(client, "rpc", {
      configurable: true,
      get() {
        h.storage.set(K_SESSION, JSON.stringify(injected));
        return function () {
          dispatches++;
          return ok([closeRow(id)]);
        };
      },
    });
    h = loadRewardV2({
      initial: { [K_QUEUE]: queue },
      clientOverride: client,
      trackClientOverride: false,
    });

    const result = await h.reward._flush();
    assert.equal(dispatches, 0);
    assert.equal(result.sent, 0);
    assert.deepEqual(h.read(K_QUEUE), queue);
    assert.deepEqual(h.read(K_SESSION), injected);
  });
});

test("a pending close opened in this process still converges through queue then marker replay", async () => {
  let closeAttempts = 0;
  const h = loadRewardV2({ rpc(name, args) {
    if (name === "complete_reward_session") {
      closeAttempts++;
      if (closeAttempts === 1) {
        return { data: null, error: { code: "08006", message: "lost" }, status: 0 };
      }
    }
    return responseFor(name, args);
  } });

  assert.equal(await h.reward.startSession(25), true);
  const id = h.calls.find((call) => call.name === "start_reward_session").args.p_session_id;
  assert.equal(await h.reward.completeSession({ shieldHeld: true }), false);
  assert.deepEqual(h.read(K_SESSION), { id, pendingClose: "complete", shieldHeld: true });

  assert.equal(await h.reward.init(), true);
  assert.equal(closeAttempts, 3);
  assert.deepEqual(h.calls.filter((call) => call.name === "complete_reward_session")
    .map((call) => call.args.p_shield_held), [true, true, true]);
  assert.equal(h.read(K_SESSION), null);
  assert.deepEqual(h.read(K_QUEUE), []);
});

test("the authoritative marker closes before a conflicting queue accelerator converges", async () => {
  const id = "marker-wins-conflicting-accelerator";
  const marker = { id, pendingClose: "complete", shieldHeld: true };
  const queue = [{
    fn: "abandon_reward_session",
    key: id,
    args: { p_session_id: id },
  }];
  let terminalState = null;
  const h = loadRewardV2({
    initial: { [K_SESSION]: marker, [K_QUEUE]: queue },
    rpc(name, args) {
      if (name === "complete_reward_session") {
        terminalState = "completed";
        return ok([closeRow(id, "completed", 25)]);
      }
      if (name === "abandon_reward_session") {
        assert.equal(terminalState, "completed");
        return ok([closeRow(id, "completed", 25)]);
      }
      return responseFor(name, args);
    },
  });

  assert.equal(await h.reward.init(), true);
  assert.deepEqual(h.calls.slice(0, 2).map((call) => call.name), [
    "complete_reward_session",
    "abandon_reward_session",
  ]);
  assert.equal(h.calls[0].args.p_shield_held, true);
  assert.equal(h.read(K_SESSION), null);
  assert.deepEqual(h.read(K_QUEUE), []);
  assert.equal(h.reward.ready, true);
});

test("grouped deletion attempts both removals and both readbacks with captured primitives", () => {
  const id = "grouped-cleanup-order";
  const h = loadRewardV2({
    initial: {
      [K_SESSION]: acknowledgedSession(id),
      [K_QUEUE]: [{ fn: "abandon_reward_session", key: id,
        args: { p_session_id: id } }],
    },
  });
  const realGet = h.localStorage.getItem;
  const realRemove = h.localStorage.removeItem;
  const events = [];
  Object.defineProperty(h.localStorage, "getItem", {
    configurable: true,
    get() {
      events.push("capture:get");
      return function (key) {
        events.push(`get:${key}`);
        return Reflect.apply(realGet, this, [key]);
      };
    },
  });
  Object.defineProperty(h.localStorage, "removeItem", {
    configurable: true,
    get() {
      events.push("capture:remove");
      return function (key) {
        events.push(`remove:${key}`);
        return Reflect.apply(realRemove, this, [key]);
      };
    },
  });

  assert.equal(h.reward.resetAfterAccountDeletion(), true);
  assert.deepEqual(events, [
    "capture:get",
    "capture:remove",
    `remove:${K_SESSION}`,
    `remove:${K_QUEUE}`,
    `get:${K_SESSION}`,
    `get:${K_QUEUE}`,
  ]);
});

test("grouped deletion continues after a first removal throws and reports blocked", () => {
  const id = "grouped-cleanup-throw";
  const h = loadRewardV2({
    initial: {
      [K_SESSION]: acknowledgedSession(id),
      [K_QUEUE]: [{ fn: "abandon_reward_session", key: id,
        args: { p_session_id: id } }],
    },
  });
  const realGet = h.localStorage.getItem;
  const realRemove = h.localStorage.removeItem;
  const events = [];
  h.localStorage.getItem = function (key) {
    events.push(`get:${key}`);
    return Reflect.apply(realGet, this, [key]);
  };
  h.localStorage.removeItem = function (key) {
    events.push(`remove:${key}`);
    if (key === K_SESSION) throw new Error("first removal denied");
    return Reflect.apply(realRemove, this, [key]);
  };

  assert.equal(h.reward.resetAfterAccountDeletion(), false);
  assert.deepEqual(events, [
    `remove:${K_SESSION}`,
    `remove:${K_QUEUE}`,
    `get:${K_SESSION}`,
    `get:${K_QUEUE}`,
  ]);
  assert.equal(h.storage.has(K_SESSION), true);
  assert.equal(h.storage.has(K_QUEUE), false);
  assert.equal(h.reward.cleanupBlocked, true);
});

test("durable guard identity rotation wins over durable-change publication", async () => {
  const id = "guard-identity-rotation";
  let h;
  let armed = false;
  let rotated = false;
  let dispatches = 0;
  const client = {};
  Object.defineProperty(client, "rpc", {
    configurable: true,
    get() {
      armed = true;
      return function () {
        dispatches++;
        return ok([closeRow(id)]);
      };
    },
  });
  h = loadRewardV2({
    initial: { [K_SESSION]: acknowledgedSession(id) },
    clientOverride: client,
    trackClientOverride: false,
  });
  const realGet = h.localStorage.getItem;
  h.localStorage.getItem = function (key) {
    if (armed && !rotated) {
      rotated = true;
      h.storage.set(K_QUEUE, JSON.stringify([{ fn: "abandon_reward_session", key: id,
        args: { p_session_id: id } }]));
      h.setAccountState("pending_delete");
      h.setAccountState("active");
    }
    return Reflect.apply(realGet, this, [key]);
  };

  assert.equal(await h.reward.completeSession({ shieldHeld: true }), false);
  assert.equal(dispatches, 0);
  assert.equal(h.reward.lastError.code, "account_changed");
  assert.deepEqual(h.read(K_SESSION), { id, pendingClose: "complete", shieldHeld: true });
});

test("a guarded new-start refusal is recoverable in the same process", async () => {
  const injectedQueue = [{ fn: "abandon_reward_session", key: "other",
    args: { p_session_id: "other" } }];
  let h;
  let inject = true;
  const dispatched = [];
  const client = {};
  Object.defineProperty(client, "rpc", {
    configurable: true,
    get() {
      if (inject) h.storage.set(K_QUEUE, JSON.stringify(injectedQueue));
      return function (name, args) {
        dispatched.push(name);
        return responseFor(name, args);
      };
    },
  });
  h = loadRewardV2({ clientOverride: client, trackClientOverride: false });

  assert.equal(await h.reward.startSession(25), false);
  assert.deepEqual(dispatched, []);
  assert.equal(h.read(K_SESSION).serverAck, "unknown");
  inject = false;
  h.storage.delete(K_QUEUE);

  assert.equal(await h.reward.init(), true);
  assert.deepEqual(dispatched.slice(0, 2), [
    "start_reward_session",
    "abandon_reward_session",
  ]);
  assert.equal(h.read(K_SESSION), null);
  assert.equal(h.reward.ready, true);
});
