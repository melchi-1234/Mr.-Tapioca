// RewardV2 is the native, server-authoritative merchant reward client.
// The native flag selects authority. Connectivity only controls availability:
// an outage must never expose the editable local reward ledger as a fallback.
(function () {
  "use strict";

  const CLOUD = window.MRTAP_CLOUD || {};
  const FLAGS = window.MRTAP_FLAGS || {};
  const K_SESSION = "bobaRewardSession";
  const K_QUEUE = "bobaRewardQueue";
  const QUEUE_MAX = 50;
  const APPLY = Reflect.apply;
  const ARRAY_IS_ARRAY = Array.isArray;
  const CREATE = Object.create;
  const DEFINE_PROPERTIES = Object.defineProperties;
  const DEFINE_PROPERTY = Object.defineProperty;
  const FREEZE = Object.freeze;
  const GET_OWN_DESCRIPTOR = Object.getOwnPropertyDescriptor;
  const GET_OWN_DESCRIPTORS = Object.getOwnPropertyDescriptors;
  const GET_PROTOTYPE = Object.getPrototypeOf;
  const HAS_OWN = Object.prototype.hasOwnProperty;
  const JSON_PARSE = JSON.parse;
  const JSON_STRINGIFY = JSON.stringify;
  const OWN_KEYS = Reflect.ownKeys;
  const SET_ADD = Set.prototype.add;
  const SET_CLEAR = Set.prototype.clear;
  const SET_DELETE = Set.prototype.delete;
  const SET_HAS = Set.prototype.has;
  // Every refusal the single redeem_reward RPC can return, and nothing else. An
  // unlisted reason is treated as a malformed response rather than passed through,
  // so a server that starts saying something new is caught here instead of putting
  // an untranslated slug in front of a student at a counter.
  //
  // The 1.2.0 handoff-code removal took two reasons with it: failed_code_expired
  // (there is no five-minute code to time out) and failed_code_unavailable (nothing
  // is minted). failed_wrong_partner moves the other way — with no separate open
  // step it is now reachable at the tap.
  const REDEEM_REFUSALS = new Set([
    "failed_not_found", "failed_partner_paused", "failed_already_redeemed",
    "failed_expired", "failed_wrong_partner", "failed_offer_changed",
    "failed_capped", "failed_outside_window",
  ]);

  function isNative() {
    return !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === "function" &&
      window.Capacitor.isNativePlatform());
  }

  function flagOn() {
    if (FLAGS.rewardV2 === true) return true;
    try { return localStorage.getItem("bobaRewardV2") === "on"; } catch (_) { return false; }
  }

  const RewardV2 = {
    enabled: isNative() && flagOn(),
    ready: false,
    eligibleMinutes: 0,
    rewards: [],
    policies: [],
    lastError: null,
    lastSyncAt: 0,
    cleanupBlocked: false,
  };
  const PUBLIC_STATE_KEYS = [
    "ready", "eligibleMinutes", "rewards", "policies", "lastError", "lastSyncAt",
    "cleanupBlocked",
  ];
  const initialStateDescriptors = CREATE(null);
  for (const key of PUBLIC_STATE_KEYS) {
    initialStateDescriptors[key] = {
      value: RewardV2[key],
      writable: true,
      enumerable: true,
      configurable: false,
    };
  }
  DEFINE_PROPERTIES(RewardV2, initialStateDescriptors);
  let accountEpoch = 0;
  let cleanupBlocked = false;
  let readyTrusted = false;

  function removeDeletionArtifactsTogether() {
    let storage;
    let getItem;
    let removeItem;
    try {
      storage = localStorage;
      getItem = storage.getItem;
      removeItem = storage.removeItem;
      if (typeof getItem !== "function" || typeof removeItem !== "function") return false;
    } catch (_) {
      return false;
    }
    let operationsSucceeded = true;
    let sessionRaw;
    let queueRaw;
    try { APPLY(removeItem, storage, [K_SESSION]); } catch (_) { operationsSucceeded = false; }
    try { APPLY(removeItem, storage, [K_QUEUE]); } catch (_) { operationsSucceeded = false; }
    try { sessionRaw = APPLY(getItem, storage, [K_SESSION]); } catch (_) { operationsSucceeded = false; }
    try { queueRaw = APPLY(getItem, storage, [K_QUEUE]); } catch (_) { operationsSucceeded = false; }
    return operationsSucceeded && sessionRaw === null && queueRaw === null;
  }

  function clearDeletionArtifacts() {
    readyTrusted = false;
    let callback = null;
    try {
      const candidate = window.onRewardV2Sync;
      if (typeof candidate === "function") callback = candidate;
    } catch (_) {}
    const storageBlocked = !removeDeletionArtifactsTogether();
    const reset = safePublicUpdate({
      ready: false,
      eligibleMinutes: 0,
      rewards: [],
      policies: [],
      lastError: null,
      lastSyncAt: 0,
      cleanupBlocked: storageBlocked,
    });
    cleanupBlocked = storageBlocked || !reset;
    if (!reset) {
      safePublicUpdate({ cleanupBlocked: true });
      return false;
    }
    if (cleanupBlocked) safePublicUpdate({ cleanupBlocked: true });
    if (callback) {
      try { APPLY(callback, window, [RewardV2]); } catch (_) {}
    }
    return !cleanupBlocked;
  }

  RewardV2.resetAfterAccountDeletion = clearDeletionArtifacts;
  window.RewardV2 = RewardV2;
  if (!RewardV2.enabled) return;

  const HAS_KEYS = !!(CLOUD.url && CLOUD.anonKey);
  let sb = null;
  let sbPromise = null;
  let lifecycleTail = Promise.resolve();
  let flushPromise = null;
  let refreshPromise = null;
  const openedHere = new Set();
  const startedHere = new Set();

  function own(value, key) {
    return APPLY(HAS_OWN, value, [key]);
  }

  function setAdd(target, value) {
    return APPLY(SET_ADD, target, [value]);
  }

  function setDelete(target, value) {
    return APPLY(SET_DELETE, target, [value]);
  }

  function setHas(target, value) {
    return APPLY(SET_HAS, target, [value]);
  }

  function setClear(target) {
    return APPLY(SET_CLEAR, target, []);
  }

  function plainPrototype(prototype, constructorName) {
    if (!prototype || GET_PROTOTYPE(prototype) !== null) return false;
    const descriptor = GET_OWN_DESCRIPTOR(prototype, "constructor");
    return !!(descriptor && own(descriptor, "value") &&
      typeof descriptor.value === "function" && descriptor.value.name === constructorName);
  }

  function isPlainRecord(value) {
    if (!value || typeof value !== "object" || ARRAY_IS_ARRAY(value)) return false;
    const prototype = GET_PROTOTYPE(value);
    return prototype === null || plainPrototype(prototype, "Object");
  }

  function owns(value, keys) {
    return isPlainRecord(value) && keys.every(function (key) { return own(value, key); });
  }

  function finiteInteger(value, minimum) {
    return Number.isInteger(value) && isFinite(value) && value >= minimum;
  }

  function nullableString(value) {
    return value === null || typeof value === "string";
  }

  function validDate(value, nullable) {
    if (nullable && value === null) return true;
    return typeof value === "string" && isFinite(new Date(value).getTime());
  }

  function validId(value) {
    return typeof value === "string" && value.length > 0;
  }

  function sameJSON(left, right) {
    try { return JSON_STRINGIFY(left) === JSON_STRINGIFY(right); } catch (_) { return false; }
  }

  function exactOwnKeys(value, expected) {
    if (!isPlainRecord(value)) return false;
    let keys;
    try { keys = OWN_KEYS(value); } catch (_) { return false; }
    if (keys.length !== expected.length || keys.some(function (key) { return typeof key !== "string"; })) {
      return false;
    }
    return expected.every(function (key) { return own(value, key); });
  }

  function requireStorageAuthority(authority, fn, attempted) {
    if (!authority) return true;
    const leases = ARRAY_IS_ARRAY(authority) ? authority : [authority];
    for (let index = 0; index < leases.length; index++) {
      const lease = leases[index];
      if (!rpcLeaseCurrent(lease)) {
        identityFailure(fn || "reward_storage", lease && lease.epoch !== accountEpoch
          ? "account_reset"
          : "account_changed", attempted);
        return false;
      }
    }
    return true;
  }

  function readStored(key, authority, fn, attempted) {
    let raw;
    try {
      const storage = localStorage;
      const getItem = storage.getItem;
      if (typeof getItem !== "function" ||
          !requireStorageAuthority(authority, fn, attempted)) {
        return { ok: false, exists: false, value: null, raw: undefined, stale: !!authority };
      }
      raw = APPLY(getItem, storage, [key]);
      if (!requireStorageAuthority(authority, fn, attempted)) {
        return { ok: false, exists: false, value: null, raw: raw, stale: true };
      }
      if (raw === null) return { ok: true, exists: false, value: null, raw: null };
      const value = JSON_PARSE(raw);
      if (value === null) return { ok: false, exists: true, value: null, raw: raw };
      return { ok: true, exists: true, value: value, raw: raw };
    } catch (_) {
      if (authority) requireStorageAuthority(authority, fn, attempted);
      return { ok: false, exists: false, value: null, raw: raw };
    }
  }

  function writeStored(key, value, authority, fn, attempted, expectedRaw) {
    try {
      const encoded = JSON_STRINGIFY(value);
      const storage = localStorage;
      const setItem = storage.setItem;
      const getItem = storage.getItem;
      if (typeof setItem !== "function" || typeof getItem !== "function") return false;
      const currentRaw = APPLY(getItem, storage, [key]);
      if (expectedRaw !== undefined && currentRaw !== expectedRaw) return false;
      if (!requireStorageAuthority(authority, fn, attempted)) return false;
      APPLY(setItem, storage, [key, encoded]);
      if (!requireStorageAuthority(authority, fn, attempted)) return false;
      const verified = APPLY(getItem, storage, [key]);
      if (!requireStorageAuthority(authority, fn, attempted)) return false;
      return verified === encoded;
    } catch (_) {
      if (authority) requireStorageAuthority(authority, fn, attempted);
      return false;
    }
  }

  function removeStored(key, authority, fn, attempted, expectedRaw) {
    try {
      const storage = localStorage;
      const removeItem = storage.removeItem;
      const getItem = storage.getItem;
      if (typeof removeItem !== "function" || typeof getItem !== "function") return false;
      const currentRaw = APPLY(getItem, storage, [key]);
      if (expectedRaw !== undefined && currentRaw !== expectedRaw) return false;
      if (!requireStorageAuthority(authority, fn, attempted)) return false;
      APPLY(removeItem, storage, [key]);
      if (!requireStorageAuthority(authority, fn, attempted)) return false;
      const verified = APPLY(getItem, storage, [key]);
      if (!requireStorageAuthority(authority, fn, attempted)) return false;
      return verified === null;
    } catch (_) {
      if (authority) requireStorageAuthority(authority, fn, attempted);
      return false;
    }
  }

  function exactStorageRaw(value) {
    return value === null || typeof value === "string";
  }

  function captureDurableGuard(sessionRaw, queueRaw) {
    if (!exactStorageRaw(sessionRaw) || !exactStorageRaw(queueRaw)) return null;
    try {
      const storage = localStorage;
      const getItem = storage.getItem;
      if (typeof getItem !== "function") return null;
      return FREEZE({
        storage: storage,
        getItem: getItem,
        sessionRaw: sessionRaw,
        queueRaw: queueRaw,
      });
    } catch (_) {
      return null;
    }
  }

  function durableGuardCurrent(guard) {
    if (!guard) return false;
    try {
      const storage = guard.storage;
      const getItem = guard.getItem;
      const expectedSessionRaw = guard.sessionRaw;
      const expectedQueueRaw = guard.queueRaw;
      const sessionRaw = APPLY(getItem, storage, [K_SESSION]);
      const queueRaw = APPLY(getItem, storage, [K_QUEUE]);
      return sessionRaw === expectedSessionRaw && queueRaw === expectedQueueRaw;
    } catch (_) {
      return false;
    }
  }

  function validStartFields(row) {
    return validId(row.id) && finiteInteger(row.planned, 5) && row.planned <= 480 &&
      (row.platform === "ios" || row.platform === "web");
  }

  function validStartedLocal(value) {
    return finiteInteger(value, 0);
  }

  function sessionKind(row) {
    if (exactOwnKeys(row, ["id", "pendingClose"]) && validId(row.id) &&
        row.pendingClose === "abandon") return "close_abandon";
    if (exactOwnKeys(row, ["id", "pendingClose", "shieldHeld"]) && validId(row.id) &&
        row.pendingClose === "complete" && typeof row.shieldHeld === "boolean") {
      return "close_complete";
    }

    const legacyKeys = ["id", "planned", "platform", "startedLocal", "serverAck"];
    if (exactOwnKeys(row, legacyKeys) && validStartFields(row) &&
        validStartedLocal(row.startedLocal) && typeof row.serverAck === "boolean") {
      return row.serverAck ? "legacy_acknowledged" : "legacy_unacknowledged";
    }

    const currentKeys = ["id", "planned", "platform", "shield", "startedLocal", "serverAck"];
    if (exactOwnKeys(row, currentKeys) && validStartFields(row) &&
        typeof row.shield === "boolean" && validStartedLocal(row.startedLocal) &&
        (typeof row.serverAck === "boolean" || row.serverAck === "unknown")) {
      if (row.serverAck === "unknown") return "unknown_start";
      return row.serverAck ? "acknowledged" : "unacknowledged";
    }

    const unknownKeys = ["id", "planned", "platform", "shield", "serverAck"];
    const unknownWithTimeKeys = unknownKeys.concat(["startedLocal"]);
    const unknownBase = (exactOwnKeys(row, unknownKeys) ||
      (exactOwnKeys(row, unknownWithTimeKeys) && validStartedLocal(row.startedLocal))) &&
      validStartFields(row) && typeof row.shield === "boolean" && row.serverAck === "unknown";
    if (unknownBase) return "unknown_start";

    for (const withTime of [false, true]) {
      const base = withTime ? unknownWithTimeKeys : unknownKeys;
      const abandonKeys = base.concat(["pendingClose"]);
      if (exactOwnKeys(row, abandonKeys) && validStartFields(row) &&
          typeof row.shield === "boolean" && row.serverAck === "unknown" &&
          (!withTime || validStartedLocal(row.startedLocal)) && row.pendingClose === "abandon") {
        return "unknown_close_abandon";
      }
      const completeKeys = base.concat(["pendingClose", "shieldHeld"]);
      if (exactOwnKeys(row, completeKeys) && validStartFields(row) &&
          typeof row.shield === "boolean" && row.serverAck === "unknown" &&
          (!withTime || validStartedLocal(row.startedLocal)) && row.pendingClose === "complete" &&
          typeof row.shieldHeld === "boolean") return "unknown_close_complete";
    }
    return null;
  }

  function readSession(authority, fn, attempted) {
    const stored = readStored(K_SESSION, authority, fn, attempted);
    if (!stored.ok) return { ok: false, row: null, raw: stored.raw };
    if (!stored.exists) return { ok: true, row: null, raw: stored.raw };
    const kind = sessionKind(stored.value);
    return { ok: !!kind, row: stored.value, kind: kind, raw: stored.raw };
  }

  function validQueueItem(item) {
    if (!exactOwnKeys(item, ["fn", "key", "args"]) || !validId(item.key)) return false;
    if (item.fn === "complete_reward_session") {
      return exactOwnKeys(item.args, ["p_session_id", "p_shield_held"]) &&
        item.args.p_session_id === item.key && typeof item.args.p_shield_held === "boolean";
    }
    if (item.fn === "abandon_reward_session") {
      return exactOwnKeys(item.args, ["p_session_id"]) && item.args.p_session_id === item.key;
    }
    return false;
  }

  function readQueue(authority, fn, attempted) {
    const stored = readStored(K_QUEUE, authority, fn, attempted);
    if (!stored.ok) return { ok: false, items: [], raw: stored.raw };
    if (!stored.exists) return { ok: true, items: [], raw: stored.raw };
    if (!ARRAY_IS_ARRAY(stored.value) || stored.value.length > QUEUE_MAX ||
        !stored.value.every(validQueueItem)) {
      return { ok: false, items: [], raw: stored.raw };
    }
    const sessionIds = new Set();
    for (const item of stored.value) {
      if (sessionIds.has(item.key)) return { ok: false, items: [], raw: stored.raw };
      sessionIds.add(item.key);
    }
    return { ok: true, items: stored.value, raw: stored.raw };
  }

  function publicQueue() {
    const result = readQueue();
    return result.ok ? result.items : [];
  }

  function queueIdentity(item) {
    return item.fn + "\u0000" + item.key;
  }

  function sameQueueWork(left, right) {
    return left.fn === right.fn && left.key === right.key &&
      (left.fn === "abandon_reward_session" ||
        left.args.p_shield_held === right.args.p_shield_held);
  }

  function markerQueueWork(row) {
    if (!row || row.pendingClose === "abandon") {
      return row && validId(row.id)
        ? { fn: "abandon_reward_session", key: row.id, args: { p_session_id: row.id } }
        : null;
    }
    if (row.pendingClose === "complete" && validId(row.id) &&
        typeof row.shieldHeld === "boolean") {
      return {
        fn: "complete_reward_session",
        key: row.id,
        args: { p_session_id: row.id, p_shield_held: row.shieldHeld },
      };
    }
    return null;
  }

  function queueCompatibleWithSession(row, items) {
    if (!row) return true;
    const queued = items.find(function (item) { return item.key === row.id; });
    if (!queued) return true;
    const expected = markerQueueWork(row);
    return !!expected && sameQueueWork(queued, expected);
  }

  function enqueue(item, authority, fn, attempted) {
    const current = readQueue(authority, fn, attempted);
    if (!current.ok || !validQueueItem(item)) return false;
    const existing = current.items.find(function (entry) { return entry.key === item.key; });
    if (existing) return sameQueueWork(existing, item);
    if (current.items.length >= QUEUE_MAX) return false;
    const next = current.items.concat([item]);
    if (!writeStored(K_QUEUE, next, authority, fn, attempted, current.raw)) return false;
    const verified = readQueue(authority, fn, attempted);
    return verified.ok && verified.items.length === next.length &&
      verified.items.some(function (entry) { return sameQueueWork(entry, item); });
  }

  function uuid() {
    if (window.crypto && typeof crypto.randomUUID === "function") return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      const random = (Math.random() * 16) | 0;
      return (c === "x" ? random : (random & 0x3) | 0x8).toString(16);
    });
  }

  function platform() {
    return isNative() ? "ios" : "web";
  }

  function sharedModulePresent() {
    try { return "SquadCloud" in window; } catch (_) { return true; }
  }

  function sharedCloud() {
    if (!sharedModulePresent()) return null;
    const cloud = window.SquadCloud;
    return cloud && (typeof cloud === "object" || typeof cloud === "function")
      ? cloud
      : null;
  }

  function sharedLifecycle() {
    if (!sharedModulePresent()) return "absent";
    const cloud = sharedCloud();
    if (!cloud) return "blocked";
    if (typeof cloud.accountState !== "function") return "blocked";
    try { return cloud.accountState() === "active" ? "active" : "blocked"; } catch (_) { return "blocked"; }
  }

  function validClient(client) {
    return !!(client && (typeof client === "object" || typeof client === "function"));
  }

  function strictSessionEnvelope(value) {
    if (!isPlainRecord(value) || !own(value, "data") || !own(value, "error") || value.error !== null) {
      return null;
    }
    if (!isPlainRecord(value.data) || !own(value.data, "session")) return null;
    const session = value.data.session;
    if (session === null) return { session: null };
    if (!isPlainRecord(session) || !own(session, "access_token") ||
        typeof session.access_token !== "string" || !session.access_token) return null;
    return { session: session };
  }

  async function ownClient() {
    if (!HAS_KEYS) return null;
    try {
      const module = await import("https://esm.sh/@supabase/supabase-js@2.110.0");
      const client = module.createClient(CLOUD.url, CLOUD.anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, storage: window.localStorage },
      });
      if (!validClient(client) || !client.auth || typeof client.auth.getSession !== "function" ||
          typeof client.auth.signInAnonymously !== "function") return null;
      let envelope = strictSessionEnvelope(await client.auth.getSession());
      if (!envelope) return null;
      if (envelope.session === null) envelope = strictSessionEnvelope(await client.auth.signInAnonymously());
      return envelope && envelope.session ? client : null;
    } catch (_) {
      return null;
    }
  }

  function loadSupabase() {
    if (!HAS_KEYS) return Promise.resolve(null);
    if (sharedLifecycle() === "blocked") return Promise.resolve(null);
    if (sbPromise) return sbPromise;
    const cloud = sharedCloud();
    const pending = sharedModulePresent()
      ? Promise.resolve().then(function () {
          if (!cloud) return null;
          if (sharedLifecycle() !== "active" || typeof cloud.client !== "function") return null;
          return cloud.client();
        }).then(function (client) {
          if (sharedLifecycle() !== "active") return null;
          return validClient(client) ? client : null;
        })
      : ownClient();
    let active;
    active = Promise.resolve(pending).then(function (client) {
      if (!client && sbPromise === active) sbPromise = null;
      return client;
    }, function () {
      if (sbPromise === active) sbPromise = null;
      return null;
    });
    sbPromise = active;
    return active;
  }

  async function ensureAuth() {
    if (cleanupBlocked || !HAS_KEYS || sharedLifecycle() === "blocked") {
      sb = null;
      sbPromise = null;
      return null;
    }
    if (sb && (sharedLifecycle() === "active" || sharedLifecycle() === "absent")) return sb;
    const epoch = accountEpoch;
    const client = await loadSupabase();
    if (epoch !== accountEpoch || sharedLifecycle() === "blocked" || !validClient(client)) return null;
    sb = client;
    return sb;
  }

  function identityFailure(fn, reason, attempted) {
    sb = null;
    sbPromise = null;
    setReadyFalseSafely();
    if (reason === "account_reset") {
      return { ok: false, stale: true, attempted: !!attempted, reason: reason };
    }
    setPublicLastError({
      rpc: fn,
      code: "account_changed",
      status: null,
      message: "Reward account changed during the request",
      details: null,
      hint: null,
    });
    return { ok: false, stale: true, attempted: !!attempted, reason: reason };
  }

  function rpcLeaseCurrent(lease) {
    if (!lease || lease.epoch !== accountEpoch || cleanupBlocked || sb !== lease.client) {
      return false;
    }
    if (!lease.shared) return true;
    try { return APPLY(lease.check, lease.cloud, [lease.token]) === true; } catch (_) { return false; }
  }

  function requireRpcLease(lease, fn, attempted) {
    if (rpcLeaseCurrent(lease)) return true;
    identityFailure(fn, lease && lease.epoch !== accountEpoch ? "account_reset" : "account_changed", attempted);
    return false;
  }

  function captureRpcLease(client, epoch, fn) {
    if (epoch !== accountEpoch || cleanupBlocked || !validClient(client)) {
      identityFailure(fn, epoch !== accountEpoch ? "account_reset" : "account_changed", false);
      return null;
    }
    const cloud = sharedCloud();
    if (!cloud) {
      if (sharedModulePresent()) {
        identityFailure(fn, "account_changed", false);
        return null;
      }
      return FREEZE({ shared: false, client: client, epoch: epoch });
    }
    let capture;
    let check;
    try {
      capture = cloud.captureAccountLease;
      check = cloud.isAccountLeaseCurrent;
    } catch (_) {
      capture = null;
      check = null;
    }
    if (sharedLifecycle() !== "active" || typeof capture !== "function" ||
        typeof check !== "function") {
      identityFailure(fn, "account_changed", false);
      return null;
    }
    let token;
    try { token = APPLY(capture, cloud, [client]); } catch (_) { token = null; }
    const lease = token === null || token === undefined
      ? null
      : FREEZE({
          shared: true,
          cloud: cloud,
          check: check,
          client: client,
          epoch: epoch,
          token: token,
        });
    if (!lease || !rpcLeaseCurrent(lease)) {
      identityFailure(fn, "account_changed", false);
      return null;
    }
    return lease;
  }

  function arrayPrototype(prototype) {
    if (!prototype) return false;
    const parent = GET_PROTOTYPE(prototype);
    if (!plainPrototype(parent, "Object")) return false;
    const descriptor = GET_OWN_DESCRIPTOR(prototype, "constructor");
    return !!(descriptor && own(descriptor, "value") &&
      typeof descriptor.value === "function" && descriptor.value.name === "Array");
  }

  function snapshotValue(value, ancestors) {
    if (value === null || typeof value === "string" || typeof value === "boolean") {
      return { ok: true, value: value };
    }
    if (typeof value === "number") {
      return isFinite(value) ? { ok: true, value: value } : { ok: false };
    }
    if (typeof value !== "object") return { ok: false };
    for (let cursor = ancestors; cursor; cursor = cursor.parent) {
      if (cursor.value === value) return { ok: false };
    }

    let descriptors;
    let keys;
    let prototype;
    try {
      descriptors = GET_OWN_DESCRIPTORS(value);
      keys = OWN_KEYS(descriptors);
      prototype = GET_PROTOTYPE(value);
    } catch (_) {
      return { ok: false };
    }
    if (keys.some(function (key) { return typeof key !== "string"; })) return { ok: false };
    const nextAncestors = { value: value, parent: ancestors || null };

    if (ARRAY_IS_ARRAY(value)) {
      if (!arrayPrototype(prototype) || !own(descriptors, "length")) return { ok: false };
      const lengthDescriptor = descriptors.length;
      if (!own(lengthDescriptor, "value") || !finiteInteger(lengthDescriptor.value, 0) ||
          keys.length !== lengthDescriptor.value + 1) return { ok: false };
      const copy = new Array(lengthDescriptor.value);
      for (let index = 0; index < lengthDescriptor.value; index++) {
        const key = String(index);
        if (!own(descriptors, key)) return { ok: false };
        const descriptor = descriptors[key];
        if (!own(descriptor, "value") || own(descriptor, "get") || own(descriptor, "set")) {
          return { ok: false };
        }
        const child = snapshotValue(descriptor.value, nextAncestors);
        if (!child.ok) return { ok: false };
        DEFINE_PROPERTY(copy, key, {
          value: child.value,
          enumerable: true,
          configurable: true,
          writable: true,
        });
      }
      return { ok: true, value: copy };
    }

    if (!(prototype === null || plainPrototype(prototype, "Object"))) return { ok: false };
    const copy = CREATE(null);
    for (const key of keys) {
      const descriptor = descriptors[key];
      if (!own(descriptor, "value") || own(descriptor, "get") || own(descriptor, "set")) {
        return { ok: false };
      }
      const child = snapshotValue(descriptor.value, nextAncestors);
      if (!child.ok) return { ok: false };
      DEFINE_PROPERTY(copy, key, {
        value: child.value,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    return { ok: true, value: copy };
  }

  function snapshotThrownError(error) {
    if (!error || (typeof error !== "object" && typeof error !== "function")) return null;
    let descriptors;
    try { descriptors = GET_OWN_DESCRIPTORS(error); } catch (_) { return null; }
    const copy = CREATE(null);
    for (const key of ["code", "status", "message", "details", "hint"]) {
      if (!own(descriptors, key)) continue;
      const descriptor = descriptors[key];
      if (!own(descriptor, "value") || own(descriptor, "get") || own(descriptor, "set")) continue;
      const snapped = snapshotValue(descriptor.value, null);
      if (snapped.ok) copy[key] = snapped.value;
    }
    return copy;
  }

  function errorDetail(fn, response, error, fallback) {
    const status = response && typeof response.status === "number" ? response.status :
      (error && typeof error.status === "number" ? error.status : null);
    return {
      rpc: fn,
      code: error && typeof error.code === "string" ? error.code : "ambiguous_response",
      status: status,
      message: error && typeof error.message === "string" ? error.message : fallback,
      details: error && own(error, "details") ? error.details : null,
      hint: error && own(error, "hint") ? error.hint : null,
    };
  }

  function validIssueRow(row) {
    return owns(row, ["id", "policy_id", "partner_id", "seq", "offer_version",
      "issued_at", "expires_at", "status"]) &&
      validId(row.id) && validId(row.policy_id) &&
      nullableString(row.partner_id) && finiteInteger(row.seq, 1) &&
      (row.offer_version === null || finiteInteger(row.offer_version, 1)) &&
      validDate(row.issued_at, false) && validDate(row.expires_at, true) &&
      ["issued", "redeemed", "void"].includes(row.status);
  }

  function validStateReward(row) {
    return validIssueRow(row) && own(row, "redeemed_at") && validDate(row.redeemed_at, true) &&
      own(row, "redeemed_partner_id") && nullableString(row.redeemed_partner_id);
  }

  function validPolicy(row, eligibleMinutes) {
    if (!owns(row, ["id", "kind", "required_minutes", "partner_id", "expires_days",
      "active", "spent_minutes", "unspent_minutes", "progress_minutes"])) return false;
    if (!validId(row.id) || !["global_passport", "partner_specific"].includes(row.kind) ||
        !finiteInteger(row.required_minutes, 15) || row.required_minutes > 1440 ||
        !nullableString(row.partner_id) ||
        (row.expires_days !== null && (!finiteInteger(row.expires_days, 1) || row.expires_days > 3650)) ||
        typeof row.active !== "boolean" || !finiteInteger(row.spent_minutes, 0) ||
        !finiteInteger(row.unspent_minutes, 0) || !finiteInteger(row.progress_minutes, 0) ||
        row.progress_minutes >= row.required_minutes ||
        row.unspent_minutes !== Math.max(eligibleMinutes - row.spent_minutes, 0) ||
        row.progress_minutes !== row.unspent_minutes % row.required_minutes) return false;
    return row.kind === "global_passport"
      ? row.partner_id === null
      : validId(row.partner_id);
  }

  function validState(value) {
    if (!owns(value, ["eligible_minutes", "rewards", "policies"]) ||
        !finiteInteger(value.eligible_minutes, 0) ||
        !Array.isArray(value.rewards) || !value.rewards.every(validStateReward) ||
        !Array.isArray(value.policies)) return false;
    const policies = new Map();
    for (const policy of value.policies) {
      if (!validPolicy(policy, value.eligible_minutes) || policies.has(policy.id)) return false;
      policies.set(policy.id, policy);
    }
    return value.rewards.every(function (reward) {
      if (reward.status !== "issued") return true;
      const policy = policies.get(reward.policy_id);
      return !!policy && reward.partner_id === policy.partner_id;
    });
  }

  function validStart(value, args) {
    if (!Array.isArray(value) || value.length !== 1) return false;
    const row = value[0];
    return owns(row, ["id", "started_at", "state", "planned_minutes"]) &&
      row.id === args.p_session_id && ["active", "completed", "abandoned"].includes(row.state) &&
      finiteInteger(row.planned_minutes, 5) && row.planned_minutes === args.p_planned_minutes &&
      validDate(row.started_at, false);
  }

  function validClose(value, args) {
    if (!Array.isArray(value) || value.length !== 1) return false;
    const row = value[0];
    if (!owns(row, ["id", "state", "credited_minutes", "eligible_minutes"]) ||
        row.id !== args.p_session_id ||
        !["completed", "abandoned"].includes(row.state) ||
        !finiteInteger(row.credited_minutes, 0) ||
        !finiteInteger(row.eligible_minutes, 0)) return false;
    return row.state === "abandoned"
      ? row.credited_minutes === 0
      : row.credited_minutes <= 480;
  }

  function domainRefusal(value, allowed) {
    return owns(value, ["ok", "reason"]) && value.ok === false &&
      typeof value.reason === "string" && allowed.has(value.reason);
  }

  // The one redemption response shape.
  //
  // exactOwnKeys, NOT owns. owns() only checks the listed keys are PRESENT, so a
  // refusal carrying an extra partner_name and offer_text would sail through it —
  // which is precisely the leak the server was tightened to stop, and a rule
  // enforced only on the server is a rule the client is not actually holding.
  // Exact keys in both directions means a server that starts adding a field is
  // caught here rather than half-trusted.
  //
  // bar_minutes is required on success and is the reason this validator cares: it
  // is the reward's own issuance bar, it reaches the client ONLY here, and the
  // post-redemption share card refuses to render without a finite positive number.
  function validRedeem(value) {
    if (exactOwnKeys(value, ["ok", "reason"]) && domainRefusal(value, REDEEM_REFUSALS)) return true;
    return exactOwnKeys(value, ["ok", "partner_name", "offer_text", "cashier_note", "bar_minutes",
      "redeemed_at", "server_time"]) && value.ok === true &&
      typeof value.partner_name === "string" &&
      typeof value.offer_text === "string" && typeof value.cashier_note === "string" &&
      finiteInteger(value.bar_minutes, 15) && value.bar_minutes <= 1440 &&
      validDate(value.redeemed_at, false) && validDate(value.server_time, false);
  }

  function validRpcData(fn, data, args) {
    if (fn === "start_reward_session") return validStart(data, args);
    if (fn === "complete_reward_session" || fn === "abandon_reward_session") return validClose(data, args);
    if (fn === "issue_my_rewards") return Array.isArray(data) && data.every(validIssueRow);
    if (fn === "my_reward_state") return validState(data);
    if (fn === "redeem_reward") return validRedeem(data);
    return false;
  }

  function durableDispatchFailure(fn, lease) {
    setReadyFalseSafely();
    setPublicLastError({
      rpc: fn,
      code: "durable_changed",
      status: null,
      message: "Reward work changed before the request was sent",
      details: null,
      hint: null,
    });
    return {
      ok: false,
      stale: true,
      attempted: false,
      reason: "durable_changed",
      lease: lease,
    };
  }

  async function rpc(fn, args, carriedLease, durableGuard) {
    const rpcArgs = args || {};
    let lease = carriedLease || null;
    let client;
    if (lease) {
      client = lease.client;
    } else {
      const epoch = accountEpoch;
      client = await ensureAuth();
      if (epoch !== accountEpoch) return identityFailure(fn, "account_reset", false);
      if (!client) {
        setPublicLastError({
          rpc: fn,
          code: "no_client",
          status: null,
          message: "Reward service unavailable",
        });
        return { ok: false, ambiguous: true, attempted: false, reason: "no_client" };
      }
      lease = captureRpcLease(client, epoch, fn);
      if (!lease) return { ok: false, stale: true, attempted: false, reason: "account_changed" };
    }
    let dispatch;
    try {
      dispatch = client.rpc;
    } catch (error) {
      if (!requireRpcLease(lease, fn, false)) {
        return { ok: false, stale: true, attempted: false, reason: "account_changed", lease: lease };
      }
      const detail = errorDetail(fn, null, snapshotThrownError(error),
        "Reward RPC method unavailable");
      if (!requireRpcLease(lease, fn, false)) {
        return { ok: false, stale: true, attempted: false, reason: "account_changed", lease: lease };
      }
      setPublicLastError(detail);
      return { ok: false, ambiguous: true, attempted: false, reason: "no_rpc", lease: lease };
    }
    if (typeof dispatch !== "function") {
      if (!requireRpcLease(lease, fn, false)) {
        return { ok: false, stale: true, attempted: false, reason: "account_changed", lease: lease };
      }
      setPublicLastError(errorDetail(fn, null, null, "Reward RPC method unavailable"));
      return { ok: false, ambiguous: true, attempted: false, reason: "no_rpc", lease: lease };
    }
    const durableCurrent = !durableGuard || durableGuardCurrent(durableGuard);
    if (!requireRpcLease(lease, fn, false)) {
      return { ok: false, stale: true, attempted: false, reason: "account_changed", lease: lease };
    }
    if (!durableCurrent) return durableDispatchFailure(fn, lease);
    let pending;
    try {
      pending = APPLY(dispatch, client, [fn, rpcArgs]);
    } catch (error) {
      if (!requireRpcLease(lease, fn, true)) {
        return { ok: false, stale: true, attempted: true, reason: "account_changed", lease: lease };
      }
      const detail = errorDetail(fn, null, snapshotThrownError(error),
        "Network request failed");
      if (!requireRpcLease(lease, fn, true)) {
        return { ok: false, stale: true, attempted: true, reason: "account_changed", lease: lease };
      }
      setPublicLastError(detail);
      return { ok: false, ambiguous: true, attempted: true, reason: "network", lease: lease };
    }
    try {
      const liveResponse = await pending;
      if (!requireRpcLease(lease, fn, true)) {
        return { ok: false, stale: true, attempted: true, reason: "account_changed", lease: lease };
      }
      const copied = snapshotValue(liveResponse, null);
      if (!requireRpcLease(lease, fn, true)) {
        return { ok: false, stale: true, attempted: true, reason: "account_changed", lease: lease };
      }
      if (!copied.ok) {
        const detail = errorDetail(fn, null, null, "Malformed server response");
        if (!requireRpcLease(lease, fn, true)) {
          return { ok: false, stale: true, attempted: true, reason: "account_changed", lease: lease };
        }
        setPublicLastError(detail);
        return { ok: false, ambiguous: true, attempted: true, reason: "ambiguous", lease: lease };
      }
      const response = copied.value;
      const envelopeValid = isPlainRecord(response) && own(response, "data") &&
        own(response, "error") && own(response, "status");
      if (!requireRpcLease(lease, fn, true)) {
        return { ok: false, stale: true, attempted: true, reason: "account_changed", lease: lease };
      }
      if (!envelopeValid) {
        const detail = errorDetail(fn, response, null, "Malformed server response");
        if (!requireRpcLease(lease, fn, true)) {
          return { ok: false, stale: true, attempted: true, reason: "account_changed", lease: lease };
        }
        setPublicLastError(detail);
        return { ok: false, ambiguous: true, attempted: true, reason: "ambiguous", lease: lease };
      }
      if (response.error !== null) {
        const detail = errorDetail(fn, response,
          isPlainRecord(response.error) ? response.error : null, "Server error response");
        if (!requireRpcLease(lease, fn, true)) {
          return { ok: false, stale: true, attempted: true, reason: "account_changed", lease: lease };
        }
        setPublicLastError(detail);
        return { ok: false, ambiguous: true, attempted: true, reason: "rpc_error", lease: lease };
      }
      const dataValid = finiteInteger(response.status, 100) && response.status >= 200 &&
        response.status < 300 && validRpcData(fn, response.data, rpcArgs);
      if (!requireRpcLease(lease, fn, true)) {
        return { ok: false, stale: true, attempted: true, reason: "account_changed", lease: lease };
      }
      if (!dataValid) {
        const detail = errorDetail(fn, response, null, "Ambiguous server response");
        if (!requireRpcLease(lease, fn, true)) {
          return { ok: false, stale: true, attempted: true, reason: "account_changed", lease: lease };
        }
        setPublicLastError(detail);
        return { ok: false, ambiguous: true, attempted: true, reason: "ambiguous", lease: lease };
      }
      if (!requireRpcLease(lease, fn, true)) {
        return { ok: false, stale: true, attempted: true, reason: "account_changed", lease: lease };
      }
      return { ok: true, data: response.data, status: response.status, lease: lease };
    } catch (error) {
      if (!requireRpcLease(lease, fn, true)) {
        return { ok: false, stale: true, attempted: true, reason: "account_changed", lease: lease };
      }
      const detail = errorDetail(fn, null, snapshotThrownError(error),
        "Network request failed");
      if (!requireRpcLease(lease, fn, true)) {
        return { ok: false, stale: true, attempted: true, reason: "account_changed", lease: lease };
      }
      setPublicLastError(detail);
      return { ok: false, ambiguous: true, attempted: true, reason: "network", lease: lease };
    }
  }

  async function flushSnapshot(epoch) {
    if (cleanupBlocked) return { sent: 0, left: QUEUE_MAX, cleanupBlocked: true };
    const initial = readQueue();
    if (!initial.ok) return { sent: 0, left: QUEUE_MAX, storageFailed: true };
    if (!initial.items.length) return { sent: 0, left: 0 };
    const sessionAtDispatch = readSession();
    if (!sessionAtDispatch.ok) {
      return { sent: 0, left: initial.items.length, storageFailed: true };
    }
    if (!queueCompatibleWithSession(sessionAtDispatch.row, initial.items)) {
      return { sent: 0, left: initial.items.length, storageFailed: true };
    }
    const durableGuard = captureDurableGuard(sessionAtDispatch.raw, initial.raw);
    if (!durableGuard) {
      return { sent: 0, left: initial.items.length, storageFailed: true };
    }
    const successful = new Map();
    for (const item of initial.items) {
      const result = await rpc(item.fn, item.args, null, durableGuard);
      if (result.lease && !requireRpcLease(result.lease, item.fn, !!result.attempted)) {
        return { sent: 0, left: initial.items.length, stale: true };
      }
      if (epoch !== accountEpoch || result.stale) return { sent: 0, left: initial.items.length, stale: true };
      if (result.ok) {
        successful.set(queueIdentity(item), { item: item, lease: result.lease });
      }
    }
    if (!successful.size) return { sent: 0, left: initial.items.length };
    const leases = Array.from(successful.values()).map(function (entry) { return entry.lease; });
    const current = readQueue(leases, "flush_reward_queue", true);
    if (!current.ok) return { sent: 0, left: initial.items.length, storageFailed: true };
    const next = current.items.filter(function (item) {
      const entry = successful.get(queueIdentity(item));
      return !entry || !sameQueueWork(entry.item, item);
    });
    const removed = current.items.length - next.length;
    if (!removed) return { sent: 0, left: current.items.length };
    if (!requireStorageAuthority(leases, "flush_reward_queue", true)) {
      return { sent: 0, left: current.items.length, stale: true };
    }
    if (!writeStored(K_QUEUE, next, leases, "flush_reward_queue", true, current.raw)) {
      return { sent: 0, left: current.items.length, storageFailed: true };
    }
    if (!requireStorageAuthority(leases, "flush_reward_queue", true)) {
      return { sent: 0, left: next.length, stale: true };
    }
    return { sent: removed, left: next.length };
  }

  function flush() {
    if (flushPromise) return flushPromise;
    const epoch = accountEpoch;
    let active;
    active = flushSnapshot(epoch).then(function (result) {
      if (flushPromise === active) flushPromise = null;
      return result;
    }, function (error) {
      if (flushPromise === active) flushPromise = null;
      throw error;
    });
    flushPromise = active;
    return active;
  }

  function serializeLifecycle(work) {
    const epoch = accountEpoch;
    const run = lifecycleTail.then(function () {
      return epoch === accountEpoch ? work(epoch) : false;
    }, function () {
      return epoch === accountEpoch ? work(epoch) : false;
    });
    lifecycleTail = run.then(function () {}, function () {});
    return run;
  }

  function closeMarker(row, requested, shieldHeld) {
    let recorded = requested;
    if (own(row, "pendingClose")) {
      if (row.pendingClose !== "complete" && row.pendingClose !== "abandon") return null;
      recorded = row.pendingClose;
    }
    if (recorded === "complete") {
      if (own(row, "shieldHeld") && typeof row.shieldHeld !== "boolean") return null;
      const shield = own(row, "shieldHeld") ? row.shieldHeld : !!shieldHeld;
      return { id: row.id, pendingClose: "complete", shieldHeld: shield };
    }
    if (own(row, "shieldHeld")) return null;
    return { id: row.id, pendingClose: "abandon" };
  }

  function exactUnknownStart(row) {
    return ["unknown_start", "unknown_close_complete", "unknown_close_abandon"]
      .includes(sessionKind(row));
  }

  function startArgs(row) {
    return {
      p_session_id: row.id,
      p_planned_minutes: row.planned,
      p_platform: row.platform,
      p_shield: row.shield,
    };
  }

  function unknownCloseMarker(row, requested, shieldHeld) {
    if (!exactUnknownStart(row)) return null;
    if (own(row, "pendingClose") && !["complete", "abandon"].includes(row.pendingClose)) return null;
    if (row.pendingClose === "complete" && typeof row.shieldHeld !== "boolean") return null;
    if (row.pendingClose === "abandon" && own(row, "shieldHeld")) return null;
    const recorded = row.pendingClose === "complete" || row.pendingClose === "abandon"
      ? row.pendingClose
      : requested;
    const marker = {
      id: row.id,
      planned: row.planned,
      platform: row.platform,
      shield: row.shield,
      serverAck: "unknown",
      pendingClose: recorded,
    };
    if (recorded === "complete") {
      marker.shieldHeld = typeof row.shieldHeld === "boolean" ? row.shieldHeld : !!shieldHeld;
    }
    return marker;
  }

  async function replayUnknownStart(row, epoch) {
    if (!exactUnknownStart(row)) return { ok: false, unresolved: true };
    const sessionAtDispatch = readSession();
    const queueAtDispatch = readQueue();
    if (!sessionAtDispatch.ok || !sessionAtDispatch.row ||
        !sameJSON(sessionAtDispatch.row, row) || !queueAtDispatch.ok) {
      return { ok: false, unresolved: true };
    }
    const durableGuard = captureDurableGuard(sessionAtDispatch.raw, queueAtDispatch.raw);
    if (!durableGuard) return { ok: false, unresolved: true };
    const result = await rpc("start_reward_session", startArgs(row), null, durableGuard);
    if (result.lease && !requireRpcLease(result.lease, "start_reward_session", !!result.attempted)) {
      return { ok: false, stale: true, unresolved: true };
    }
    if (epoch !== accountEpoch || result.stale || !result.ok) {
      return { ok: false, stale: !!result.stale, unresolved: true };
    }
    const current = readSession(result.lease, "start_reward_session", true);
    if (!current.ok || !current.row || current.row.id !== row.id ||
        !sameJSON(current.row, row)) return { ok: false, unresolved: true };
    if (!requireRpcLease(result.lease, "start_reward_session", true)) {
      return { ok: false, stale: true, unresolved: true };
    }
    return {
      ok: true,
      state: result.data[0].state,
      lease: result.lease,
      raw: current.raw,
    };
  }

  async function closeCurrent(requested, options, epoch) {
    if (cleanupBlocked) {
      setReadyFalseSafely();
      return false;
    }
    const queueBefore = readQueue();
    if (!queueBefore.ok) {
      setReadyFalseSafely();
      return false;
    }
    let stored = readSession();
    if (!stored.ok || !stored.row) {
      setReadyFalseSafely();
      return false;
    }
    let row = stored.row;
    let replayLease = null;
    if (row.serverAck === false && !row.pendingClose) {
      setDelete(openedHere, row.id);
      setDelete(startedHere, row.id);
      if (!removeStored(K_SESSION, null, null, false, stored.raw)) setReadyFalseSafely();
      return false;
    }
    if (row.serverAck === "unknown" && !setHas(openedHere, row.id)) {
      if (!exactUnknownStart(row)) {
        setReadyFalseSafely();
        return false;
      }
      const durableUnknown = unknownCloseMarker(row, requested, options && options.shieldHeld);
      if (!durableUnknown) {
        setReadyFalseSafely();
        return false;
      }
      if (!sameJSON(row, durableUnknown) &&
          !writeStored(K_SESSION, durableUnknown, null, null, false, stored.raw)) {
        setReadyFalseSafely();
        return false;
      }
      row = durableUnknown;
      const replay = await replayUnknownStart(row, epoch);
      if (replay.lease && !requireRpcLease(replay.lease, "start_reward_session", true)) {
        setReadyFalseSafely();
        return false;
      }
      if (!replay.ok) {
        setReadyFalseSafely();
        return false;
      }
      replayLease = replay.lease;
      if (replay.state !== "active") {
        if (!requireRpcLease(replayLease, "start_reward_session", true)) {
          setReadyFalseSafely();
          return false;
        }
        if (!removeStored(K_SESSION, replayLease, "start_reward_session", true, replay.raw)) {
          setReadyFalseSafely();
          return false;
        }
        if (!requireRpcLease(replayLease, "start_reward_session", true)) {
          setReadyFalseSafely();
          return false;
        }
        setDelete(openedHere, row.id);
        if (!requireRpcLease(replayLease, "start_reward_session", true)) return false;
        setDelete(startedHere, row.id);
        if (!requireRpcLease(replayLease, "start_reward_session", true)) return false;
        return true;
      }
      stored = readSession(replayLease, "start_reward_session", true);
      if (!stored.ok || !stored.row || stored.row.id !== row.id) {
        setReadyFalseSafely();
        return false;
      }
      if (!requireRpcLease(replayLease, "start_reward_session", true)) {
        setReadyFalseSafely();
        return false;
      }
      row = stored.row;
    } else if (!row.pendingClose && row.serverAck !== true &&
        !(row.serverAck === "unknown" && setHas(openedHere, row.id))) {
      setReadyFalseSafely();
      return false;
    }
    const marker = closeMarker(row, requested, options && options.shieldHeld);
    if (!marker) {
      setReadyFalseSafely();
      return false;
    }
    if (replayLease && !requireRpcLease(replayLease, "start_reward_session", true)) {
      setReadyFalseSafely();
      return false;
    }
    if (!sameJSON(row, marker) &&
        !writeStored(K_SESSION, marker, replayLease, "start_reward_session", !!replayLease,
          stored.raw)) {
      setReadyFalseSafely();
      return false;
    }
    const sessionAtDispatch = readSession(replayLease, "start_reward_session", !!replayLease);
    const queueAtDispatch = readQueue(replayLease, "start_reward_session", !!replayLease);
    if (!sessionAtDispatch.ok || !sessionAtDispatch.row ||
        !sameJSON(sessionAtDispatch.row, marker) || !queueAtDispatch.ok) {
      setReadyFalseSafely();
      return false;
    }
    const durableGuard = captureDurableGuard(sessionAtDispatch.raw, queueAtDispatch.raw);
    if (!durableGuard) {
      setReadyFalseSafely();
      return false;
    }
    const fn = marker.pendingClose === "complete"
      ? "complete_reward_session"
      : "abandon_reward_session";
    const args = marker.pendingClose === "complete"
      ? { p_session_id: marker.id, p_shield_held: marker.shieldHeld }
      : { p_session_id: marker.id };
    const result = await rpc(fn, args, replayLease, durableGuard);
    if (result.lease && !requireRpcLease(result.lease, fn, !!result.attempted)) return false;
    if (epoch !== accountEpoch || result.stale) return false;
    const current = readSession(result.lease, fn, !!result.attempted);
    if (!current.ok || !current.row || !sameJSON(current.row, marker)) {
      setReadyFalseSafely();
      return false;
    }
    if (result.ok) {
      if (!requireRpcLease(result.lease, fn, true)) return false;
      if (!removeStored(K_SESSION, result.lease, fn, true, current.raw)) {
        setReadyFalseSafely();
        return false;
      }
      if (!requireRpcLease(result.lease, fn, true)) return false;
      setDelete(openedHere, marker.id);
      if (!requireRpcLease(result.lease, fn, true)) return false;
      setDelete(startedHere, marker.id);
      if (!requireRpcLease(result.lease, fn, true)) return false;
      return true;
    }
    if (!result.lease || !requireRpcLease(result.lease, fn, !!result.attempted)) return false;
    enqueue({ fn: fn, key: marker.id, args: args },
      result.lease, fn, !!result.attempted);
    setReadyFalseSafely();
    return false;
  }

  async function drainCloseWork(epoch) {
    if (cleanupBlocked) return false;
    await flush();
    if (epoch !== accountEpoch) return false;
    let stored = readSession();
    if (!stored.ok) return false;
    if (stored.row && (stored.row.pendingClose || !setHas(startedHere, stored.row.id))) {
      if (stored.row.serverAck === false && !stored.row.pendingClose) {
        removeStored(K_SESSION, null, null, false, stored.raw);
      } else {
        const requested = stored.row.pendingClose === "complete" ? "complete" : "abandon";
        await closeCurrent(requested, {}, epoch);
      }
    }
    stored = readSession();
    if (!stored.ok || stored.row) return false;
    const queued = readQueue();
    return queued.ok && queued.items.length === 0;
  }

  async function startCurrent(plannedMinutes, epoch) {
    if (cleanupBlocked) return false;
    if (!finiteInteger(plannedMinutes, 5) || plannedMinutes > 480) return false;
    const planned = plannedMinutes;
    if (!(await drainCloseWork(epoch)) || epoch !== accountEpoch) {
      setReadyFalseSafely();
      return false;
    }
    const emptySession = readSession();
    if (!emptySession.ok || emptySession.row) {
      setReadyFalseSafely();
      return false;
    }
    const id = uuid();
    const row = {
      id: id,
      planned: planned,
      platform: platform(),
      shield: !!(window.FocusBlocker && FocusBlocker._active),
      startedLocal: Date.now(),
      serverAck: "unknown",
    };
    if (!writeStored(K_SESSION, row, null, null, false, emptySession.raw)) {
      setReadyFalseSafely();
      return false;
    }
    const sessionAtDispatch = readSession();
    const queueAtDispatch = readQueue();
    if (!sessionAtDispatch.ok || !sessionAtDispatch.row ||
        !sameJSON(sessionAtDispatch.row, row) || !queueAtDispatch.ok ||
        queueAtDispatch.items.length) {
      setReadyFalseSafely();
      return false;
    }
    const durableGuard = captureDurableGuard(sessionAtDispatch.raw, queueAtDispatch.raw);
    if (!durableGuard) {
      setReadyFalseSafely();
      return false;
    }
    setAdd(startedHere, id);
    const result = await rpc("start_reward_session", startArgs(row), null, durableGuard);
    if (result.lease && !requireRpcLease(result.lease, "start_reward_session", !!result.attempted)) {
      setReadyFalseSafely();
      return false;
    }
    if (epoch !== accountEpoch) return false;
    if (result.stale) {
      if (result.reason === "durable_changed") setDelete(startedHere, id);
      return false;
    }
    if (!result.ok) {
      if (!result.attempted && result.lease &&
          requireRpcLease(result.lease, "start_reward_session", false)) {
        const current = readSession(result.lease, "start_reward_session", false);
        const failedRow = {
          id: row.id,
          planned: row.planned,
          platform: row.platform,
          shield: row.shield,
          startedLocal: row.startedLocal,
          serverAck: false,
        };
        if (current.ok && current.row && sameJSON(current.row, row) &&
            writeStored(K_SESSION, failedRow, result.lease, "start_reward_session", false,
              current.raw) && requireRpcLease(result.lease, "start_reward_session", false)) {
          setDelete(startedHere, id);
        }
      }
      setReadyFalseSafely();
      return false;
    }
    const state = result.data[0].state;
    if (state === "active") {
      if (!requireRpcLease(result.lease, "start_reward_session", true)) {
        setReadyFalseSafely();
        return false;
      }
      setAdd(openedHere, id);
    }
    const current = readSession(result.lease, "start_reward_session", true);
    if (!current.ok || !current.row || !sameJSON(current.row, row)) {
      setReadyFalseSafely();
      return false;
    }
    if (!requireRpcLease(result.lease, "start_reward_session", true)) {
      setReadyFalseSafely();
      return false;
    }
    if (state !== "active") {
      if (!removeStored(K_SESSION, result.lease, "start_reward_session", true, current.raw)) {
        setReadyFalseSafely();
        return false;
      }
      if (!requireRpcLease(result.lease, "start_reward_session", true)) return false;
      setDelete(openedHere, id);
      if (!requireRpcLease(result.lease, "start_reward_session", true)) return false;
      setDelete(startedHere, id);
      return false;
    }
    row.serverAck = true;
    if (!writeStored(K_SESSION, row, result.lease, "start_reward_session", true, current.raw)) {
      setReadyFalseSafely();
      return false;
    }
    if (!requireRpcLease(result.lease, "start_reward_session", true)) {
      setReadyFalseSafely();
      return false;
    }
    return true;
  }

  RewardV2.startSession = function (plannedMinutes) {
    return serializeLifecycle(function (epoch) { return startCurrent(plannedMinutes, epoch); });
  };

  RewardV2.completeSession = function (options) {
    return serializeLifecycle(async function (epoch) {
      const opts = options || {};
      if (opts.abandoned) return closeCurrent("abandon", opts, epoch);
      const closed = await closeCurrent("complete", opts, epoch);
      if (!closed) return false;
      return refreshCurrent(epoch);
    });
  };

  RewardV2.abandonSession = function () {
    return serializeLifecycle(function (epoch) { return closeCurrent("abandon", {}, epoch); });
  };

  function markerBlocksReadiness(authority, fn, attempted) {
    const stored = readSession(authority, fn, attempted);
    if (!stored.ok) return true;
    if (!stored.row) return false;
    return !(setHas(openedHere, stored.row.id) && stored.row.serverAck === true && !stored.row.pendingClose);
  }

  function safePublicUpdate(values, lease) {
    let source;
    let current;
    let keys;
    let definitions;
    try {
      source = GET_OWN_DESCRIPTORS(values);
      keys = OWN_KEYS(source);
      current = GET_OWN_DESCRIPTORS(RewardV2);
      definitions = CREATE(null);
      for (const key of keys) {
        const next = source[key];
        const descriptor = current[key];
        if (typeof key !== "string" || !own(initialStateDescriptors, key) ||
            !next || !own(next, "value") || !descriptor || !own(descriptor, "value") ||
            descriptor.configurable || !descriptor.writable) return false;
        definitions[key] = {
          value: next.value,
          writable: true,
          enumerable: descriptor.enumerable,
          configurable: false,
        };
      }
    } catch (_) {
      return false;
    }
    if (lease && !rpcLeaseCurrent(lease)) return false;
    try { DEFINE_PROPERTIES(RewardV2, definitions); } catch (_) { return false; }
    return !lease || rpcLeaseCurrent(lease);
  }

  function setReadyFalseSafely() {
    readyTrusted = false;
    return safePublicUpdate({ ready: false });
  }

  function setPublicLastError(value) {
    return safePublicUpdate({ lastError: value });
  }

  function publishStateSnapshot(state, lease, syncedAt) {
    readyTrusted = false;
    if (safePublicUpdate({
      eligibleMinutes: state.eligible_minutes,
      rewards: state.rewards,
      policies: state.policies,
      ready: true,
      lastError: null,
      lastSyncAt: syncedAt,
    }, lease)) {
      readyTrusted = true;
      return true;
    }
    setReadyFalseSafely();
    return false;
  }

  async function refreshRun(epoch) {
    if (cleanupBlocked) {
      setReadyFalseSafely();
      return false;
    }
    const flushed = await flush();
    if (epoch !== accountEpoch || flushed.stale) return false;
    const queued = readQueue();
    if (!queued.ok || queued.items.length || markerBlocksReadiness()) {
      setReadyFalseSafely();
      return false;
    }
    const issued = await rpc("issue_my_rewards", {});
    if (issued.lease && !requireRpcLease(issued.lease, "issue_my_rewards", !!issued.attempted)) {
      setReadyFalseSafely();
      return false;
    }
    if (epoch !== accountEpoch || !issued.ok) {
      if (epoch === accountEpoch) setReadyFalseSafely();
      return false;
    }
    const state = await rpc("my_reward_state", {}, issued.lease);
    if (state.lease && !requireRpcLease(state.lease, "my_reward_state", !!state.attempted)) {
      setReadyFalseSafely();
      return false;
    }
    if (epoch !== accountEpoch || !state.ok) {
      if (epoch === accountEpoch) setReadyFalseSafely();
      return false;
    }
    if (state.lease !== issued.lease) {
      identityFailure("my_reward_state", "account_changed", true);
      return false;
    }
    const queuedAfter = readQueue(issued.lease, "my_reward_state", true);
    if (!queuedAfter.ok || queuedAfter.items.length ||
        markerBlocksReadiness(issued.lease, "my_reward_state", true)) {
      setReadyFalseSafely();
      return false;
    }
    let nextEligible;
    let nextRewards;
    let nextPolicies;
    try {
      nextEligible = state.data.eligible_minutes;
      nextRewards = state.data.rewards;
      nextPolicies = state.data.policies;
    } catch (_) {
      setReadyFalseSafely();
      return false;
    }
    let callback = null;
    try { callback = window.onRewardV2Sync; } catch (_) { callback = null; }
    const syncedAt = Date.now();
    const snapshot = {
      eligible_minutes: nextEligible,
      rewards: nextRewards,
      policies: nextPolicies,
    };
    if (!publishStateSnapshot(snapshot, issued.lease, syncedAt)) return false;
    if (typeof callback === "function") {
      try { APPLY(callback, window, [RewardV2]); } catch (_) {}
    }
    if (!requireRpcLease(issued.lease, "my_reward_state", true)) {
      setReadyFalseSafely();
      return false;
    }
    return true;
  }

  function refreshCurrent(epoch) {
    if (refreshPromise) return refreshPromise;
    let active;
    active = refreshRun(epoch).then(function (result) {
      if (refreshPromise === active) refreshPromise = null;
      return result;
    }, function () {
      if (refreshPromise === active) refreshPromise = null;
      setReadyFalseSafely();
      return false;
    });
    refreshPromise = active;
    return active;
  }

  RewardV2.refresh = function () {
    return refreshCurrent(accountEpoch);
  };

  RewardV2.available = function () {
    const now = Date.now();
    if (cleanupBlocked || !readyTrusted || !RewardV2.ready) return [];
    return RewardV2.rewards.filter(function (reward) {
      return reward.status === "issued" &&
        (!reward.expires_at || new Date(reward.expires_at).getTime() > now);
    });
  };

  RewardV2.progress = function (policyId) {
    if (cleanupBlocked || !readyTrusted || !RewardV2.ready) return null;
    const ordered = RewardV2.policies.slice().sort(function (left, right) {
      return left.id < right.id ? -1 : (left.id > right.id ? 1 : 0);
    });
    const policy = policyId
      ? ordered.find(function (entry) { return entry.id === policyId; })
      : ordered.find(function (entry) { return entry.active; }) || ordered[0];
    if (!policy) return null;
    const done = policy.progress_minutes;
    return {
      bar: policy.required_minutes,
      done: done,
      left: Math.max(0, policy.required_minutes - done),
      policy: policy,
    };
  };

  RewardV2.rewardFor = function (partnerId) {
    return RewardV2.available().find(function (reward) {
      return reward.partner_id === null || reward.partner_id === partnerId;
    }) || null;
  };

  function ambiguousRedemption(message) {
    return { ok: false, reason: "ambiguous", message: message || null };
  }

  // ONE call. 1.2.0 collapsed openRedemption + redeemByCode + checkCode into this,
  // and with them the six-character cashier handoff. There is nothing to open and
  // nothing to check: the reward's owner taps once and the server either spends it
  // or says why not, in a single transaction.
  //
  // Every lease re-check below is load-bearing and is copied deliberately from the
  // old redeemByCode. `refresh()` awaits, and an await is exactly where the
  // anonymous account underneath us can be replaced (account deletion, a sign-out).
  // Publishing a success against a replaced account would credit the wrong person's
  // ledger, so the lease is re-checked before the refresh, after it, and again
  // before the value is handed back.
  RewardV2.redeem = async function (rewardId, partnerId) {
    const result = await rpc("redeem_reward", {
      p_reward_id: rewardId,
      p_partner_id: partnerId,
    });
    if (result.lease && !requireRpcLease(result.lease, "redeem_reward", !!result.attempted)) {
      return ambiguousRedemption(null);
    }
    if (!result.ok) return ambiguousRedemption(null);
    if (!requireRpcLease(result.lease, "redeem_reward", true)) return ambiguousRedemption(null);
    if (result.data.ok) {
      await RewardV2.refresh();
      if (!requireRpcLease(result.lease, "redeem_reward", true)) return ambiguousRedemption(null);
    }
    if (!requireRpcLease(result.lease, "redeem_reward", true)) return ambiguousRedemption(null);
    return result.data;
  };

  RewardV2.init = function () {
    return serializeLifecycle(async function (epoch) {
      if (cleanupBlocked || !(await ensureAuth()) || epoch !== accountEpoch) {
        if (epoch === accountEpoch) setReadyFalseSafely();
        return false;
      }
      await drainCloseWork(epoch);
      const after = readSession();
      if (!after.ok || (after.row && !setHas(startedHere, after.row.id))) {
        setReadyFalseSafely();
        return false;
      }
      return refreshCurrent(epoch);
    });
  };

  RewardV2.resetAfterAccountDeletion = function () {
    accountEpoch++;
    sb = null;
    sbPromise = null;
    flushPromise = null;
    refreshPromise = null;
    lifecycleTail = Promise.resolve();
    setClear(openedHere);
    setClear(startedHere);
    return clearDeletionArtifacts();
  };

  function retrySync() {
    Promise.resolve(RewardV2.init()).catch(function () { setReadyFalseSafely(); });
  }

  window.addEventListener("online", retrySync);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") retrySync();
  });

  RewardV2._queue = publicQueue;
  RewardV2._flush = flush;
})();
