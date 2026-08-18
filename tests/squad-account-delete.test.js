const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const originalSource = fs.readFileSync(path.join(root, "squad-cloud.js"), "utf8");

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function deleteRpcError(message) {
  return { code: "P0001", details: "", hint: "", message };
}

function sessionEnvelope(session) {
  return { data: { session }, error: null };
}

function createStorage(initial = {}, behavior = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      if (behavior.getItem) return behavior.getItem(key, values);
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      if (behavior.setItem) return behavior.setItem(key, value, values);
      values.set(key, String(value));
    },
    removeItem(key) {
      if (behavior.removeItem) return behavior.removeItem(key, values);
      values.delete(key);
    },
    snapshot() { return Object.fromEntries(values); },
  };
}

async function waitFor(predicate, message) {
  for (let i = 0; i < 30; i++) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail(message);
}

async function loadCloud({
  clientMutator = null,
  cloudConfig,
  deleteError = null,
  enabled = true,
  getSessionOverride = null,
  signInOverride = null,
  signOutError = null,
  signOutOverride = null,
  signOutThrows = null,
  initialSession = { access_token: "test-token" },
  rpcErrors = {},
  rpcOverrides = {},
  storage = createStorage(),
  eventLog = [],
  skipInit = false,
} = {}) {
  let session = initialSession;
  const calls = {
    delete: 0,
    signOut: [],
    getSession: 0,
    signInAnonymously: 0,
    friendCode: 0,
    setProfile: 0,
    friends: 0,
    render: 0,
    createClient: 0,
    events: eventLog,
  };
  const client = {
    auth: {
      async getSession() {
        calls.getSession++;
        if (getSessionOverride) return getSessionOverride({ calls, session });
        return { data: { session }, error: null };
      },
      async signInAnonymously() {
        calls.signInAnonymously++;
        if (signInOverride) {
          const result = await signInOverride({ calls, session });
          if (result && !result.error && result.data && result.data.session) {
            session = result.data.session;
          }
          return result;
        }
        session = { access_token: "new-test-token-" + calls.signInAnonymously };
        return { data: { session }, error: null };
      },
      async signOut(options) {
        calls.signOut.push(options);
        calls.events.push("sign_out");
        if (signOutThrows) throw signOutThrows;
        if (signOutOverride) {
          const result = await signOutOverride({ calls, session });
          if (result && !result.error) session = null;
          return result;
        }
        if (!signOutError) session = null;
        return { error: signOutError };
      },
    },
    async rpc(name, args) {
      if (name === "get_my_friend_code") calls.friendCode++;
      if (name === "set_my_profile") calls.setProfile++;
      if (name === "get_my_friends") calls.friends++;
      if (name === "delete_my_account") {
        calls.delete++;
        calls.events.push("delete_rpc");
      }
      if (Object.prototype.hasOwnProperty.call(rpcOverrides, name)) {
        return rpcOverrides[name]({ name, args, calls, session });
      }
      if (name === "get_my_friend_code") {
        return { data: "ABC234", error: rpcErrors[name] || null };
      }
      if (name === "get_my_friends") {
        return { data: [], error: rpcErrors[name] || null };
      }
      if (name === "set_my_profile") {
        return { data: null, error: rpcErrors[name] || null };
      }
      if (name === "delete_my_account") {
        return { data: null, error: deleteError };
      }
      return { data: null, error: rpcErrors[name] || null };
    },
    from() {
      return { delete() { return { async eq() { return { error: null }; } }; } };
    },
  };
  if (clientMutator) clientMutator(client);

  const source = originalSource.replace(
    'import("https://esm.sh/@supabase/supabase-js@2.110.0")',
    "Promise.resolve({ createClient: function () { window.__recordClientCreate(); return window.__fakeCloudClient; } })",
  );
  const context = {
    window: {
      MRTAP_CLOUD: cloudConfig === undefined
        ? (enabled ? { url: "https://example.supabase.co", anonKey: "public-test-key" } : {})
        : cloudConfig,
      localStorage: storage,
      __fakeCloudClient: client,
      __recordClientCreate() { calls.createClient++; },
    },
    localStorage: storage,
    console: { log() {}, warn() {}, error() {} },
    setTimeout,
    clearTimeout,
    Object,
    URL,
    mySquadStats: () => ({ name: "Test", mins: 0, drinks: 0, streak: 0, status: "idle" }),
    renderSquad() { calls.render++; },
  };
  vm.runInNewContext(source, context);
  if (!skipInit) await context.window.SquadCloud.init();
  return { cloud: context.window.SquadCloud, calls, client, storage };
}

test("cold-start init and client calls share one anonymous sign-in", async () => {
  const { cloud, calls } = await loadCloud({ initialSession: null, skipInit: true });

  const [initResult, clientA, clientB] = await Promise.all([
    cloud.init(),
    cloud.client(),
    cloud.client(),
  ]);

  assert.equal(initResult, true);
  assert.ok(clientA);
  assert.equal(clientA, clientB);
  assert.equal(calls.signInAnonymously, 1, "one cold start must mint exactly one anonymous account");
  assert.equal(cloud.ready, true);
  assert.equal(cloud.accountState(), "active");
});

test("cold-start accepts the real anonymous sign-in data shape", async () => {
  const { cloud, calls } = await loadCloud({
    initialSession: null,
    signInOverride() {
      return {
        data: {
          user: { id: "anonymous-user" },
          session: { access_token: "real-shape-token" },
        },
        error: null,
      };
    },
    skipInit: true,
  });

  assert.ok(await cloud.client());
  assert.equal(calls.signInAnonymously, 1);
  assert.equal(cloud.accountState(), "active");
});

test("the active current client receives fresh opaque current account leases", async () => {
  const { cloud } = await loadCloud();
  const client = await cloud.client();

  const first = cloud.captureAccountLease(client);
  const second = cloud.captureAccountLease(client);

  assert.ok(first);
  assert.ok(second);
  assert.notEqual(first, second);
  assert.equal(Object.isFrozen(first), true);
  assert.deepEqual(Reflect.ownKeys(first), []);
  assert.equal(cloud.isAccountLeaseCurrent(first), true);
  assert.equal(cloud.isAccountLeaseCurrent(second), true);
});

test("null and non-current clients cannot capture an account lease", async () => {
  const { cloud } = await loadCloud({ skipInit: true });

  assert.equal(cloud.captureAccountLease(null), null);
  assert.equal(cloud.captureAccountLease({}), null);

  const currentClient = await cloud.client();
  assert.equal(cloud.captureAccountLease(null), null);
  assert.equal(cloud.captureAccountLease({}), null);
  assert.ok(cloud.captureAccountLease(currentClient));
});

test("forged objects and objects inheriting from a real lease are never current", async () => {
  const { cloud } = await loadCloud();
  const lease = cloud.captureAccountLease(await cloud.client());

  assert.equal(cloud.isAccountLeaseCurrent({}), false);
  assert.equal(cloud.isAccountLeaseCurrent(Object.create(null)), false);
  assert.equal(cloud.isAccountLeaseCurrent(Object.create(lease)), false);
  assert.equal(cloud.isAccountLeaseCurrent(null), false);
});

test("beginning deletion synchronously invalidates a lease before the delete RPC settles", async () => {
  const response = deferred();
  const { cloud, calls } = await loadCloud({
    rpcOverrides: {
      delete_my_account: () => response.promise,
    },
  });
  const client = await cloud.client();
  const lease = cloud.captureAccountLease(client);

  const deleting = cloud.deleteAccount();

  assert.equal(cloud.isAccountLeaseCurrent(lease), false);
  assert.equal(cloud.captureAccountLease(client), null);
  await waitFor(() => calls.delete === 1, "delete RPC never started");
  assert.equal(cloud.isAccountLeaseCurrent(lease), false);

  response.resolve({ data: null, error: null });
  assert.equal((await deleting).deleted, true);
  assert.equal(cloud.accountState(), "opted_out");
  assert.equal(cloud.isAccountLeaseCurrent(lease), false);
});

test("a deletion attempt invalidates leases even when pending cannot be persisted", async () => {
  let failPendingWrite = false;
  const storage = createStorage({}, {
    setItem(key, value, values) {
      if (failPendingWrite && key === "bobaCloudAccountOptOutV1") return;
      values.set(key, String(value));
    },
  });
  const { cloud, calls } = await loadCloud({ storage });
  const client = await cloud.client();
  const lease = cloud.captureAccountLease(client);
  failPendingWrite = true;

  const result = await cloud.deleteAccount();

  assert.equal(result.reason, "state_persist_failed");
  assert.equal(calls.delete, 0);
  assert.equal(cloud.accountState(), "active");
  assert.equal(cloud.isAccountLeaseCurrent(lease), false);
  const replacement = cloud.captureAccountLease(client);
  assert.ok(replacement);
  assert.equal(cloud.isAccountLeaseCurrent(replacement), true);
});

test("re-enabling after deletion keeps old leases stale and issues a new current lease", async () => {
  const { cloud } = await loadCloud();
  const oldClient = await cloud.client();
  const oldLease = cloud.captureAccountLease(oldClient);

  assert.equal((await cloud.deleteAccount()).deleted, true);
  assert.equal(cloud.isAccountLeaseCurrent(oldLease), false);
  assert.equal(cloud.captureAccountLease(oldClient), null);

  assert.equal(await cloud.enableAccountCreation(), true);
  const currentClient = await cloud.client();
  const newLease = cloud.captureAccountLease(currentClient);
  assert.ok(newLease);
  assert.notEqual(newLease, oldLease);
  assert.equal(cloud.isAccountLeaseCurrent(oldLease), false);
  assert.equal(cloud.isAccountLeaseCurrent(newLease), true);
});

test("the no-cloud module exposes stable fail-closed lease functions", async () => {
  const { cloud } = await loadCloud({ enabled: false, skipInit: true });

  assert.equal(typeof cloud.captureAccountLease, "function");
  assert.equal(typeof cloud.isAccountLeaseCurrent, "function");
  assert.equal(cloud.captureAccountLease({}), null);
  assert.equal(cloud.isAccountLeaseCurrent({}), false);
});

test("active deletion intent is synchronous and does not load or authenticate a client", async () => {
  const { cloud, calls } = await loadCloud({ initialSession: null, skipInit: true });

  const intent = cloud.captureDeletionIntent();

  assert.ok(intent);
  assert.equal(Object.isFrozen(intent), true);
  assert.deepEqual(Reflect.ownKeys(intent), []);
  assert.equal(cloud.isDeletionIntentCurrent(intent), true);
  assert.equal(calls.createClient, 0);
  assert.equal(calls.getSession, 0);
  assert.equal(calls.signInAnonymously, 0);
  assert.equal(calls.friendCode, 0);
  assert.equal(calls.setProfile, 0);
  assert.equal(calls.friends, 0);
});

test("deletion intents reject forged, inherited, cross-instance and throwing values", async () => {
  const left = await loadCloud({ skipInit: true });
  const right = await loadCloud({ skipInit: true });
  const intent = left.cloud.captureDeletionIntent();
  const revoked = Proxy.revocable({}, {});
  revoked.revoke();

  assert.equal(left.cloud.isDeletionIntentCurrent(null), false);
  assert.equal(left.cloud.isDeletionIntentCurrent({}), false);
  assert.equal(left.cloud.isDeletionIntentCurrent(Object.create(intent)), false);
  assert.equal(left.cloud.isDeletionIntentCurrent(revoked.proxy), false);
  assert.equal(right.cloud.isDeletionIntentCurrent(intent), false);
  assert.equal(left.cloud.isAccountLeaseCurrent(intent), false);
  assert.doesNotThrow(() => left.cloud.isDeletionIntentCurrent(revoked.proxy));
});

test("a no-client deletion attempt invalidates intent synchronously and retries without signup", async () => {
  const { cloud, calls } = await loadCloud({ initialSession: null, skipInit: true });
  const intent = cloud.captureDeletionIntent();

  const firstDeletion = cloud.deleteAccount();

  assert.equal(cloud.isDeletionIntentCurrent(intent), false);
  assert.equal(cloud.captureDeletionIntent(), null);
  assert.equal((await firstDeletion).reason, "no_client");
  assert.equal(cloud.accountState(), "pending_delete");
  assert.equal(calls.createClient, 1);
  assert.equal(calls.getSession, 1);
  assert.equal(calls.signInAnonymously, 0);
  assert.equal((await cloud.deleteAccount()).reason, "no_client");
  assert.equal(calls.createClient, 1, "retry should reuse the loader rather than recreate a client");
  assert.equal(calls.getSession, 2);
  assert.equal(calls.signInAnonymously, 0, "deletion retry must never mint a replacement account");
  assert.equal(calls.delete, 0);
});

test("every deletion attempt rotates intent generation without weakening account leases", async () => {
  const { cloud } = await loadCloud({ deleteError: deleteRpcError("refused") });
  const client = await cloud.client();
  const intent = cloud.captureDeletionIntent();
  const accountLease = cloud.captureAccountLease(client);

  const result = await cloud.deleteAccount();

  assert.equal(result.reason, "delete_failed");
  assert.equal(cloud.accountState(), "active");
  assert.equal(cloud.isDeletionIntentCurrent(intent), false);
  assert.equal(cloud.isAccountLeaseCurrent(accountLease), false);
  const replacementIntent = cloud.captureDeletionIntent();
  const replacementLease = cloud.captureAccountLease(client);
  assert.ok(replacementIntent);
  assert.ok(replacementLease);
  assert.equal(cloud.isDeletionIntentCurrent(replacementIntent), true);
  assert.equal(cloud.isAccountLeaseCurrent(replacementLease), true);
  assert.equal(cloud.isDeletionIntentCurrent(replacementLease), false);
  assert.equal(cloud.isAccountLeaseCurrent(replacementIntent), false);
});

test("opt-out and explicit recreation keep old deletion intents stale", async () => {
  const { cloud } = await loadCloud();
  const oldIntent = cloud.captureDeletionIntent();

  assert.equal((await cloud.deleteAccount()).deleted, true);
  assert.equal(cloud.isDeletionIntentCurrent(oldIntent), false);
  assert.equal(cloud.captureDeletionIntent(), null);
  assert.equal(await cloud.enableAccountCreation(), true);
  assert.equal(cloud.isDeletionIntentCurrent(oldIntent), false);
  const replacement = cloud.captureDeletionIntent();
  assert.ok(replacement);
  assert.equal(cloud.isDeletionIntentCurrent(replacement), true);
});

test("disabled and malformed cloud configs expose fail-closed deletion-intent stubs", async (t) => {
  for (const [name, options] of [
    ["disabled", { enabled: false }],
    ["null", { cloudConfig: null }],
    ["primitive", { cloudConfig: "malformed" }],
    ["empty fields", { cloudConfig: { url: "", anonKey: "" } }],
    ["non-string URL", { cloudConfig: { url: {}, anonKey: "public-test-key" } }],
    ["non-string key", { cloudConfig: { url: "https://example.supabase.co", anonKey: 42 } }],
  ]) {
    await t.test(name, async () => {
      const { cloud, calls } = await loadCloud({ ...options, skipInit: true });
      assert.equal(typeof cloud.captureDeletionIntent, "function");
      assert.equal(typeof cloud.isDeletionIntentCurrent, "function");
      assert.equal(cloud.captureDeletionIntent(), null);
      assert.equal(cloud.isDeletionIntentCurrent({}), false);
      assert.equal(calls.createClient, 0);
      assert.equal(calls.getSession, 0);
      assert.equal(calls.signInAnonymously, 0);
    });
  }
});

test("cloud deletion reports success only after server deletion and local sign-out", async () => {
  const { cloud, calls, storage } = await loadCloud();
  assert.equal(cloud.ready, true);

  const result = await cloud.deleteAccount();

  assert.equal(result.ok, true);
  assert.equal(result.deleted, true);
  assert.equal(result.optedOut, true);
  assert.equal(calls.delete, 1);
  assert.equal(calls.signOut.length, 1);
  assert.equal(calls.signOut[0].scope, "local");
  assert.ok(calls.getSession >= 2, "deletion must verify that no local auth session remains");
  assert.equal(cloud.ready, false);
  assert.equal(cloud.friends.length, 0);
  assert.equal(cloud.myCode(), null);
  assert.equal(cloud.isOptedOut(), true);
  assert.equal(cloud.accountState(), "opted_out");
  assert.equal(storage.snapshot().bobaCloudAccountOptOutV1, "opted_out");
  assert.equal(await cloud.client(), null, "the deleted account must not be recreated in the same app run");
});

test("deletion opt-out survives reload and only an explicit enable can create a new account", async () => {
  const storage = createStorage();
  const first = await loadCloud({ storage });
  assert.equal((await first.cloud.deleteAccount()).deleted, true);

  const reloaded = await loadCloud({ storage, initialSession: null, skipInit: true });
  assert.equal(await reloaded.cloud.init(), false);
  assert.equal(await reloaded.cloud.client(), null);
  assert.equal(reloaded.calls.getSession, 0, "opt-out must stop before reading auth state");
  assert.equal(reloaded.calls.signInAnonymously, 0, "reload must not silently mint a replacement account");
  assert.equal(reloaded.cloud.ready, false);

  assert.equal(await reloaded.cloud.enableAccountCreation(), true);
  assert.equal(reloaded.calls.signInAnonymously, 1);
  assert.equal(reloaded.cloud.isOptedOut(), false);
  assert.equal(reloaded.cloud.accountState(), "active");
  assert.equal(reloaded.cloud.ready, true);
});

test("explicit enable preserves opt-out when future lifecycle writes cannot be proved", async () => {
  const storage = createStorage({ bobaCloudAccountOptOutV1: "opted_out" }, {
    setItem() {},
  });
  const { cloud, calls } = await loadCloud({ storage, initialSession: null, skipInit: true });

  assert.equal(await cloud.enableAccountCreation(), false);
  assert.equal(cloud.accountState(), "opted_out");
  assert.equal(storage.snapshot().bobaCloudAccountOptOutV1, "opted_out");
  assert.equal(calls.getSession, 0);
  assert.equal(calls.signInAnonymously, 0);
});

test("throwing storage writes block startup and deletion before the server", async () => {
  const storage = createStorage({}, {
    setItem() { throw new Error("disk full"); },
  });
  const { cloud, calls } = await loadCloud({ storage });

  const result = await cloud.deleteAccount();

  assert.equal(result.ok, false);
  assert.equal(result.reason, "state_persist_failed");
  assert.equal(calls.delete, 0);
  assert.equal(calls.signInAnonymously, 0);
  assert.equal(cloud.accountState(), "pending_delete");
  assert.equal(cloud.isOptedOut(), true);
});

test("deletion does not reach the server when pending state cannot be read back", async () => {
  let pendingWasWritten = false;
  const storage = createStorage({}, {
    setItem(key, value, values) {
      values.set(key, String(value));
      if (value === "pending_delete") pendingWasWritten = true;
    },
    getItem(key, values) {
      if (pendingWasWritten) return null;
      return values.has(key) ? values.get(key) : null;
    },
  });
  const { cloud, calls } = await loadCloud({ storage });

  const result = await cloud.deleteAccount();

  assert.equal(result.reason, "state_persist_failed");
  assert.equal(calls.delete, 0);
  assert.equal(cloud.accountState(), "active");
});

test("startup storage read failure blocks normal auth and anonymous signup", async () => {
  const storage = createStorage({}, {
    getItem() { throw new Error("storage unavailable"); },
  });
  const { cloud, calls } = await loadCloud({
    storage,
    initialSession: null,
    skipInit: true,
  });

  assert.equal(cloud.accountState(), "pending_delete");
  assert.equal(cloud.isOptedOut(), true);
  assert.equal(await cloud.init(), false);
  assert.equal(await cloud.client(), null);
  assert.equal(calls.getSession, 0);
  assert.equal(calls.signInAnonymously, 0);
});

for (const [label, unusableStorage] of [
  ["missing storage", null],
  ["storage with no methods", {}],
  ["storage without setItem", { getItem() { return null; } }],
  ["storage without getItem", { setItem() {} }],
  ["storage without removeItem", { getItem() { return null; }, setItem() {} }],
]) {
  test(`${label} blocks normal auth and anonymous signup`, async () => {
    const { cloud, calls } = await loadCloud({
      storage: unusableStorage,
      initialSession: null,
      skipInit: true,
    });

    assert.equal(cloud.accountState(), "pending_delete");
    assert.equal(cloud.isOptedOut(), true);
    assert.equal(await cloud.init(), false);
    assert.equal(await cloud.client(), null);
    assert.equal(calls.getSession, 0);
    assert.equal(calls.signInAnonymously, 0);
  });
}

for (const [label, behavior] of [
  ["silent setItem", { setItem() {} }],
  ["throwing removeItem", {
    removeItem() { throw new Error("remove failed"); },
  }],
  ["silent removeItem", {
    removeItem() {},
  }],
]) {
  test(`${label} fails the startup durability probe and blocks auth`, async () => {
    const storage = createStorage({}, behavior);
    const { cloud, calls } = await loadCloud({
      storage,
      initialSession: null,
      skipInit: true,
    });

    assert.equal(cloud.accountState(), "pending_delete");
    assert.equal(cloud.isOptedOut(), true);
    assert.equal(await cloud.init(), false);
    assert.equal(await cloud.client(), null);
    assert.equal(calls.getSession, 0);
    assert.equal(calls.signInAnonymously, 0);
  });
}

test("the startup durability probe never writes the real lifecycle key", async () => {
  const lifecycleKey = "bobaCloudAccountOptOutV1";
  const operations = [];
  const storage = createStorage({}, {
    setItem(key, value, values) {
      operations.push(["set", key, String(value)]);
      values.set(key, String(value));
    },
    removeItem(key, values) {
      operations.push(["remove", key]);
      values.delete(key);
    },
  });

  const { cloud } = await loadCloud({ storage, skipInit: true });

  assert.equal(cloud.accountState(), "active");
  assert.ok(operations.some(([operation]) => operation === "set"));
  assert.ok(operations.some(([operation]) => operation === "remove"));
  assert.equal(operations.some(([, key]) => key === lifecycleKey), false);
  assert.equal(storage.snapshot()[lifecycleKey], undefined);
});

for (const persistedState of ["pending_delete", "opted_out"]) {
  test(`startup preserves the real ${persistedState} lifecycle value`, async () => {
    const lifecycleKey = "bobaCloudAccountOptOutV1";
    const lifecycleMutations = [];
    const storage = createStorage({ [lifecycleKey]: persistedState }, {
      setItem(key, value, values) {
        if (key === lifecycleKey) lifecycleMutations.push(["set", value]);
        values.set(key, String(value));
      },
      removeItem(key, values) {
        if (key === lifecycleKey) lifecycleMutations.push(["remove"]);
        values.delete(key);
      },
    });

    const { cloud, calls } = await loadCloud({ storage, skipInit: true });

    assert.equal(cloud.accountState(), persistedState);
    assert.deepEqual(lifecycleMutations, []);
    assert.equal(storage.snapshot()[lifecycleKey], persistedState);
    assert.equal(await cloud.client(), null);
    assert.equal(calls.getSession, 0);
    assert.equal(calls.signInAnonymously, 0);
  });
}

test("an unrecognized persisted lifecycle value fails closed", async () => {
  const storage = createStorage({ bobaCloudAccountOptOutV1: "unexpected-state" });
  const { cloud, calls } = await loadCloud({
    storage,
    initialSession: null,
    skipInit: true,
  });

  assert.equal(cloud.accountState(), "pending_delete");
  assert.equal(cloud.isOptedOut(), true);
  assert.equal(await cloud.client(), null);
  assert.equal(calls.getSession, 0);
  assert.equal(calls.signInAnonymously, 0);
});

test("isOptedOut means account creation is blocked for pending and confirmed states", async () => {
  const active = await loadCloud({ skipInit: true });
  const pending = await loadCloud({
    storage: createStorage({ bobaCloudAccountOptOutV1: "pending_delete" }),
    initialSession: null,
    skipInit: true,
  });
  const confirmed = await loadCloud({
    storage: createStorage({ bobaCloudAccountOptOutV1: "opted_out" }),
    initialSession: null,
    skipInit: true,
  });

  assert.equal(active.cloud.accountState(), "active");
  assert.equal(active.cloud.isOptedOut(), false);
  assert.equal(pending.cloud.accountState(), "pending_delete");
  assert.equal(pending.cloud.isOptedOut(), true);
  assert.equal(confirmed.cloud.accountState(), "opted_out");
  assert.equal(confirmed.cloud.isOptedOut(), true);
  assert.equal(await pending.cloud.client(), null);
  assert.equal(await confirmed.cloud.client(), null);
  assert.equal(pending.calls.signInAnonymously, 0);
  assert.equal(confirmed.calls.signInAnonymously, 0);
});

const inheritedSessionEnvelope = Object.create({
  data: { session: null },
  error: null,
});
const inheritedSessionData = Object.create({ session: null });
const invalidSessionResponses = [
  ["null response", () => null],
  ["empty response", () => ({})],
  ["data-only response", () => ({ data: { session: null } })],
  ["error-only response", () => ({ error: null })],
  ["missing session", () => ({ data: {}, error: null })],
  ["inherited envelope fields", () => inheritedSessionEnvelope],
  ["inherited session field", () => ({ data: inheritedSessionData, error: null })],
  ["status-shaped response", () => ({ data: { session: null }, error: null, status: 200 })],
  ["explicit auth error", () => ({ data: { session: null }, error: { message: "auth failed" } })],
  ["lost response", () => { throw new Error("getSession lost"); }],
  ["invalid restored session", () => sessionEnvelope({})],
  ["empty restored access token", () => sessionEnvelope({ access_token: "" })],
];

for (const [label, response] of invalidSessionResponses) {
  test(`startup blocks signup for ${label}`, async () => {
    const { cloud, calls } = await loadCloud({
      getSessionOverride: response,
      initialSession: null,
      skipInit: true,
    });

    assert.equal(await cloud.client(), null);
    assert.equal(calls.getSession, 1);
    assert.equal(calls.signInAnonymously, 0);
  });

  test(`pending reload blocks deletion for ${label}`, async () => {
    const storage = createStorage({ bobaCloudAccountOptOutV1: "pending_delete" });
    const { cloud, calls } = await loadCloud({
      getSessionOverride: response,
      storage,
      skipInit: true,
    });

    const result = await cloud.deleteAccount();

    assert.equal(result.reason, "no_client");
    assert.equal(cloud.accountState(), "pending_delete");
    assert.equal(calls.delete, 0);
    assert.equal(calls.signInAnonymously, 0);
  });
}

test("startup rejects a client missing required cloud methods", async () => {
  const { cloud, calls } = await loadCloud({
    clientMutator(client) { delete client.rpc; },
    skipInit: true,
  });

  assert.equal(await cloud.client(), null);
  assert.equal(calls.getSession, 0);
  assert.equal(calls.signInAnonymously, 0);
});

test("pending reload rejects a client missing deletion methods", async () => {
  const storage = createStorage({ bobaCloudAccountOptOutV1: "pending_delete" });
  const { cloud, calls } = await loadCloud({
    clientMutator(client) { delete client.auth.signOut; },
    storage,
    skipInit: true,
  });

  const result = await cloud.deleteAccount();

  assert.equal(result.reason, "no_client");
  assert.equal(cloud.accountState(), "pending_delete");
  assert.equal(calls.getSession, 0);
  assert.equal(calls.delete, 0);
});

test("cloud deletion surfaces an RPC refusal and keeps the signed-in state", async () => {
  const { cloud, calls } = await loadCloud({ deleteError: deleteRpcError("database refused deletion") });

  const result = await cloud.deleteAccount();

  assert.equal(result.ok, false);
  assert.equal(result.deleted, false);
  assert.equal(result.reason, "delete_failed");
  assert.equal(calls.delete, 1);
  assert.equal(calls.signOut.length, 0, "a failed deletion must not sign out and hide the account");
  assert.equal(cloud.ready, true);
  assert.equal(cloud.isOptedOut(), false);
  assert.equal(cloud.accountState(), "active");
  assert.ok(await cloud.client(), "failed deletion must not disable the existing account");
});

test("a real PostgREST refusal may use null details and hint", async () => {
  const { cloud, calls } = await loadCloud({
    deleteError: {
      code: "P0001",
      details: null,
      hint: null,
      message: "database refused deletion",
    },
  });

  const result = await cloud.deleteAccount();

  assert.equal(result.reason, "delete_failed");
  assert.equal(cloud.accountState(), "active");
  assert.equal(calls.delete, 1);
  assert.equal(calls.signOut.length, 0);
});

test("a thrown deletion response stays pending and retries without creating an identity", async () => {
  let attempt = 0;
  const { cloud, calls } = await loadCloud({
    rpcOverrides: {
      delete_my_account: () => {
        attempt++;
        if (attempt === 1) throw new Error("connection lost");
        return { data: null, error: null };
      },
    },
  });

  const first = await cloud.deleteAccount();
  assert.equal(first.reason, "delete_ambiguous");
  assert.equal(cloud.accountState(), "pending_delete");
  assert.equal(cloud.isOptedOut(), true);
  assert.equal(await cloud.init(), false);
  assert.equal(await cloud.client(), null);
  assert.equal(await cloud.enableAccountCreation(), false);

  const retry = await cloud.deleteAccount();
  assert.equal(retry.deleted, true);
  assert.equal(cloud.accountState(), "opted_out");
  assert.equal(calls.delete, 2);
  assert.equal(calls.signInAnonymously, 0);
});

for (const malformed of [null, {}, { data: null }, { error: null }, "lost"] ) {
  test(`a malformed deletion response stays pending: ${JSON.stringify(malformed)}`, async () => {
    const { cloud, calls } = await loadCloud({
      rpcOverrides: { delete_my_account: () => malformed },
    });

    const result = await cloud.deleteAccount();

    assert.equal(result.reason, "delete_ambiguous");
    assert.equal(cloud.accountState(), "pending_delete");
    assert.equal(cloud.isOptedOut(), true);
    assert.equal(calls.signOut.length, 0);
    assert.equal(await cloud.client(), null);
  });
}

for (const [label, malformedEnvelope] of [
  ["array envelope", Object.assign([], { data: null, error: null })],
  ["Date envelope", Object.assign(new Date(0), { data: null, error: null })],
  ["error envelope with non-null data", { data: true, error: deleteRpcError("refused") }],
]) {
  test(`a deletion response using ${label} stays pending`, async () => {
    const { cloud, calls } = await loadCloud({
      rpcOverrides: { delete_my_account: () => malformedEnvelope },
    });

    const result = await cloud.deleteAccount();

    assert.equal(result.reason, "delete_ambiguous");
    assert.equal(cloud.accountState(), "pending_delete");
    assert.equal(calls.signOut.length, 0);
  });
}

test("a custom-class delete envelope is ambiguous", async () => {
  class DeleteEnvelope {
    constructor() {
      this.data = null;
      this.error = null;
    }
  }
  const { cloud, calls } = await loadCloud({
    rpcOverrides: { delete_my_account: () => new DeleteEnvelope() },
  });

  const result = await cloud.deleteAccount();

  assert.equal(result.reason, "delete_ambiguous");
  assert.equal(cloud.accountState(), "pending_delete");
  assert.equal(calls.signOut.length, 0);
});

test("a custom-class nested delete error is ambiguous", async () => {
  class DeleteError {
    constructor() {
      this.code = "P0001";
      this.details = "";
      this.hint = "";
      this.message = "refused";
    }
  }
  const { cloud, calls } = await loadCloud({
    rpcOverrides: {
      delete_my_account: () => ({ data: null, error: new DeleteError() }),
    },
  });

  const result = await cloud.deleteAccount();

  assert.equal(result.reason, "delete_ambiguous");
  assert.equal(cloud.accountState(), "pending_delete");
  assert.equal(calls.signOut.length, 0);
});

for (const [label, malformedError] of [
  ["empty object", {}],
  ["array", []],
  ["arbitrary object", { code: "42501" }],
  ["message-only object", { message: "refused" }],
  ["empty message", { message: "" }],
  ["Error instance", new Error("refused")],
]) {
  test(`a deletion response with ${label} as error stays pending`, async () => {
    const { cloud, calls } = await loadCloud({
      rpcOverrides: {
        delete_my_account: () => ({ data: null, error: malformedError }),
      },
    });

    const result = await cloud.deleteAccount();

    assert.equal(result.reason, "delete_ambiguous");
    assert.equal(cloud.accountState(), "pending_delete");
    assert.equal(calls.signOut.length, 0);
  });
}

test("a deterministic refusal after an ambiguous attempt preserves pending deletion", async () => {
  let attempt = 0;
  const { cloud, calls, storage } = await loadCloud({
    rpcOverrides: {
      delete_my_account: () => {
        attempt++;
        if (attempt === 1) return null;
        return { data: null, error: deleteRpcError("refused on retry") };
      },
    },
  });

  assert.equal((await cloud.deleteAccount()).reason, "delete_ambiguous");
  const retry = await cloud.deleteAccount();

  assert.equal(retry.reason, "delete_failed");
  assert.equal(cloud.accountState(), "pending_delete");
  assert.equal(cloud.isOptedOut(), true);
  assert.equal(storage.snapshot().bobaCloudAccountOptOutV1, "pending_delete");
  assert.equal(calls.delete, 2);
  assert.equal(await cloud.client(), null);
});

test("a refusal after confirmed deletion with failed opt-out persistence preserves pending", async () => {
  let attempt = 0;
  const storage = createStorage({}, {
    setItem(key, value, values) {
      if (value === "opted_out") return;
      values.set(key, String(value));
    },
  });
  const { cloud, calls } = await loadCloud({
    storage,
    rpcOverrides: {
      delete_my_account: () => {
        attempt++;
        if (attempt === 1) return { data: null, error: null };
        return { data: null, error: deleteRpcError("account already gone") };
      },
    },
  });

  const first = await cloud.deleteAccount();
  assert.equal(first.deleted, true);
  assert.equal(first.reason, "state_persist_failed");
  const retry = await cloud.deleteAccount();

  assert.equal(retry.reason, "delete_failed");
  assert.equal(cloud.accountState(), "pending_delete");
  assert.equal(storage.snapshot().bobaCloudAccountOptOutV1, "pending_delete");
  assert.equal(calls.delete, 2);
});

test("deletion waits for an already-started anonymous signup and deletes that identity", async () => {
  const signup = deferred();
  const { cloud, calls } = await loadCloud({
    initialSession: null,
    signInOverride: () => signup.promise,
    skipInit: true,
  });

  const authenticating = cloud.client();
  await waitFor(() => calls.signInAnonymously === 1, "anonymous signup never started");
  const deleting = cloud.deleteAccount();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.delete, 0, "delete must wait for the identity signup already in flight");

  signup.resolve({ data: { session: { access_token: "race-token" } }, error: null });

  assert.equal(await authenticating, null, "the normal client must not publish after pending begins");
  const result = await deleting;
  assert.equal(result.deleted, true);
  assert.equal(calls.delete, 1);
  assert.equal(calls.signInAnonymously, 1);
  assert.equal(calls.signOut.length, 1);
  assert.equal(cloud.accountState(), "opted_out");
});

test("a cleared pending latch immediately before the delete RPC blocks destruction", async () => {
  const storage = createStorage();
  const { cloud, calls } = await loadCloud({ storage });

  const deleting = cloud.deleteAccount();
  storage.removeItem("bobaCloudAccountOptOutV1");
  const result = await deleting;

  assert.equal(result.reason, "state_persist_failed");
  assert.equal(calls.delete, 0);
  assert.equal(cloud.accountState(), "pending_delete");
  assert.equal(cloud.isOptedOut(), true);
});

test("an unreadable pending latch immediately before a retry RPC blocks destruction", async () => {
  let readsThrow = false;
  const storage = createStorage({ bobaCloudAccountOptOutV1: "pending_delete" }, {
    getItem(key, values) {
      if (readsThrow) throw new Error("storage disappeared");
      return values.has(key) ? values.get(key) : null;
    },
  });
  const { cloud, calls } = await loadCloud({ storage, skipInit: true });

  const deleting = cloud.deleteAccount();
  readsThrow = true;
  const result = await deleting;

  assert.equal(result.reason, "state_persist_failed");
  assert.equal(calls.delete, 0);
  assert.equal(cloud.accountState(), "pending_delete");
});

test("a mismatched pending latch immediately before the delete RPC blocks destruction", async () => {
  const storage = createStorage();
  const { cloud, calls } = await loadCloud({ storage });

  const deleting = cloud.deleteAccount();
  storage.setItem("bobaCloudAccountOptOutV1", "opted_out");
  const result = await deleting;

  assert.equal(result.reason, "state_persist_failed");
  assert.equal(calls.delete, 0);
  assert.equal(cloud.accountState(), "pending_delete");
});

test("pending deletion survives reload and retries the restored session without signup", async () => {
  const storage = createStorage({ bobaCloudAccountOptOutV1: "pending_delete" });
  const { cloud, calls } = await loadCloud({ storage, skipInit: true });

  assert.equal(cloud.accountState(), "pending_delete");
  assert.equal(await cloud.init(), false);
  assert.equal(await cloud.client(), null);
  assert.equal(calls.getSession, 0, "normal APIs must not touch auth while pending");
  assert.equal(calls.signInAnonymously, 0);

  const result = await cloud.deleteAccount();

  assert.equal(result.deleted, true);
  assert.equal(calls.getSession, 2, "retry restores once and verifies sign-out once");
  assert.equal(calls.signInAnonymously, 0, "retry must never mint a replacement identity");
  assert.equal(cloud.accountState(), "opted_out");
});

test("a pending reload with no restored session remains pending without signup", async () => {
  const storage = createStorage({ bobaCloudAccountOptOutV1: "pending_delete" });
  const { cloud, calls } = await loadCloud({ storage, initialSession: null, skipInit: true });

  const result = await cloud.deleteAccount();

  assert.equal(result.reason, "no_client");
  assert.equal(cloud.accountState(), "pending_delete");
  assert.equal(calls.delete, 0);
  assert.equal(calls.signInAnonymously, 0);
});

test("confirmed deletion persists opt-out before local sign-out", async () => {
  const events = [];
  const storage = createStorage({}, {
    setItem(key, value, values) {
      values.set(key, String(value));
      events.push(`store:${value}`);
    },
  });
  const { cloud } = await loadCloud({ storage, eventLog: events });

  const result = await cloud.deleteAccount();

  assert.equal(result.deleted, true);
  assert.equal(storage.snapshot().bobaCloudAccountOptOutV1, "opted_out");
  assert.deepEqual(events.slice(-4), [
    "store:pending_delete",
    "delete_rpc",
    "store:opted_out",
    "sign_out",
  ]);
});

test("confirmed deletion does not sign out when permanent opt-out cannot be persisted", async () => {
  const storage = createStorage({}, {
    setItem(key, value, values) {
      if (value === "opted_out") return;
      values.set(key, String(value));
    },
  });
  const { cloud, calls } = await loadCloud({ storage });

  const result = await cloud.deleteAccount();

  assert.equal(result.deleted, true);
  assert.equal(result.reason, "state_persist_failed");
  assert.equal(calls.signOut.length, 0);
  assert.equal(storage.snapshot().bobaCloudAccountOptOutV1, "pending_delete");
  assert.equal(cloud.accountState(), "pending_delete");
  assert.equal(cloud.isOptedOut(), true);
  assert.equal(await cloud.client(), null);
});

test("account creation cannot be enabled while confirmed deletion is still signing out", async () => {
  const signOut = deferred();
  const { cloud, calls, storage } = await loadCloud({
    initialSession: { access_token: "deleting-token" },
    signOutOverride: () => signOut.promise,
  });

  const deleting = cloud.deleteAccount();
  await waitFor(() => calls.signOut.length === 1, "local sign-out never started");
  assert.equal(cloud.accountState(), "opted_out");
  assert.equal(await cloud.enableAccountCreation(), false);
  assert.equal(storage.snapshot().bobaCloudAccountOptOutV1, "opted_out");
  assert.equal(calls.signInAnonymously, 0);

  signOut.resolve({ error: null });
  assert.equal((await deleting).deleted, true);
  assert.equal(await cloud.enableAccountCreation(), true);
  assert.equal(calls.signInAnonymously, 1);
});

test("cloud deletion distinguishes deleted data from an incomplete local sign-out", async () => {
  const { cloud } = await loadCloud({ signOutError: { message: "local sign-out failed" } });

  const result = await cloud.deleteAccount();

  assert.equal(result.ok, false);
  assert.equal(result.deleted, true);
  assert.equal(result.optedOut, true);
  assert.equal(result.reason, "signout_failed");
  assert.equal(cloud.ready, false, "a deleted account must never remain live in the UI");
  assert.equal(cloud.isOptedOut(), true);
  assert.equal(await cloud.client(), null);
});

test("cloud deletion stays truthful when local sign-out throws", async () => {
  const { cloud } = await loadCloud({ signOutThrows: new Error("sign-out crashed") });

  const result = await cloud.deleteAccount();

  assert.equal(result.ok, false);
  assert.equal(result.deleted, true);
  assert.equal(result.optedOut, true);
  assert.equal(result.reason, "signout_failed");
  assert.equal(cloud.ready, false);
  assert.equal(await cloud.client(), null);
});

test("cloud deletion treats a malformed post-sign-out session envelope as incomplete", async () => {
  const { cloud } = await loadCloud({
    getSessionOverride({ calls, session }) {
      if (calls.getSession === 1) return sessionEnvelope(session);
      return null;
    },
  });

  const result = await cloud.deleteAccount();

  assert.equal(result.ok, false);
  assert.equal(result.deleted, true);
  assert.equal(result.optedOut, true);
  assert.equal(result.reason, "signout_failed");
  assert.equal(cloud.accountState(), "opted_out");
});

test("a late friends response cannot repopulate state after account deletion", async () => {
  const friendsResponse = deferred();
  const { cloud, calls } = await loadCloud({
    skipInit: true,
    rpcOverrides: {
      get_my_friends: () => friendsResponse.promise,
    },
  });

  const initializing = cloud.init();
  await waitFor(() => calls.friends === 1, "init never reached get_my_friends");
  const deletion = await cloud.deleteAccount();
  assert.equal(deletion.deleted, true);

  friendsResponse.resolve({
    data: [{ id: "stale", display_name: "Old friend", focus_minutes: 99 }],
    error: null,
  });
  assert.equal(await initializing, false);
  assert.equal(cloud.ready, false);
  assert.equal(cloud.friends.length, 0);
  assert.equal(cloud.myCode(), null);
});

test("a late standalone fetch cannot repopulate friends after account deletion", async () => {
  let lateFriends = null;
  const { cloud, calls } = await loadCloud({
    rpcOverrides: {
      get_my_friends: () => lateFriends ? lateFriends.promise : Promise.resolve({ data: [], error: null }),
    },
  });
  lateFriends = deferred();

  const fetching = cloud.fetchFriends();
  await waitFor(() => calls.friends === 2, "standalone fetch never reached get_my_friends");
  assert.equal((await cloud.deleteAccount()).deleted, true);
  lateFriends.resolve({
    data: [{ id: "stale", display_name: "Old friend", focus_minutes: 99 }],
    error: null,
  });

  assert.equal(await fetching, false);
  assert.equal(cloud.friends.length, 0);
  assert.equal(cloud.ready, false);
});

for (const rpcName of ["get_my_friend_code", "set_my_profile", "get_my_friends"]) {
  test(`init stays unready when ${rpcName} returns an error`, async () => {
    const { cloud } = await loadCloud({
      skipInit: true,
      rpcErrors: { [rpcName]: { message: `${rpcName} failed` } },
    });

    assert.equal(await cloud.init(), false);
    assert.equal(cloud.ready, false);
  });
}

for (const [rpcName, response] of [
  ["get_my_friend_code", { data: "ABC234" }],
  ["get_my_friend_code", { error: null }],
  ["set_my_profile", { data: null }],
  ["set_my_profile", { error: null }],
  ["get_my_friends", { data: [] }],
  ["get_my_friends", { error: null }],
]) {
  test(`init stays unready when ${rpcName} omits an envelope field`, async () => {
    const { cloud } = await loadCloud({
      skipInit: true,
      rpcOverrides: { [rpcName]: () => response },
    });

    assert.equal(await cloud.init(), false);
    assert.equal(cloud.ready, false);
  });
}

for (const malformedProfile of [{}, { data: null }]) {
  test(`init stays unready for malformed profile sync ${JSON.stringify(malformedProfile)}`, async () => {
    const { cloud } = await loadCloud({
      skipInit: true,
      rpcOverrides: {
        set_my_profile: () => malformedProfile,
      },
    });

    assert.equal(await cloud.init(), false);
    assert.equal(cloud.ready, false);
  });
}

for (const invalidCode of [null, "", "ABCDE", "ABCDEF7", "ABC01Z", "abc234"]) {
  test(`init stays unready for invalid friend code ${JSON.stringify(invalidCode)}`, async () => {
    const { cloud } = await loadCloud({
      skipInit: true,
      rpcOverrides: {
        get_my_friend_code: () => ({ data: invalidCode, error: null }),
      },
    });

    assert.equal(await cloud.init(), false);
    assert.equal(cloud.ready, false);
    assert.equal(cloud.myCode(), null);
  });
}

for (const invalidFriends of [null, {}, "not-an-array"]) {
  test(`init stays unready for non-array friends ${JSON.stringify(invalidFriends)}`, async () => {
    const { cloud } = await loadCloud({
      skipInit: true,
      rpcOverrides: {
        get_my_friends: () => ({ data: invalidFriends, error: null }),
      },
    });

    assert.equal(await cloud.init(), false);
    assert.equal(cloud.ready, false);
  });
}
