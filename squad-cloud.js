// ── SquadCloud: optional Supabase backend for a LIVE Study Squad ──────────────
// Loads ONLY when config.js has Supabase keys. With no keys, this module stays
// inert and the app uses the on-device Study Squad (app.js) unchanged.
//
// Security note: the anon key is public by design — every read/write is gated by
// Row-Level Security in the database (see supabase-setup.sql). This file never
// throws into the app; any failure just leaves the offline Squad in place.
(function () {
  let CLOUD = {};
  let ENABLED = false;
  try {
    const configured = window.MRTAP_CLOUD;
    if (configured && typeof configured === "object" &&
        typeof configured.url === "string" && configured.url.trim() &&
        typeof configured.anonKey === "string" && configured.anonKey.trim()) {
      CLOUD = configured;
      ENABLED = true;
    }
  } catch (_) {}
  const ACCOUNT_OPT_OUT_KEY = "bobaCloudAccountOptOutV1";
  const STATE_ACTIVE = "active";
  const STATE_PENDING_DELETE = "pending_delete";
  const STATE_OPTED_OUT = "opted_out";

  function localStore() {
    try {
      if (window.localStorage) return window.localStorage;
      if (typeof localStorage !== "undefined") return localStorage;
    } catch (_) {}
    return null;
  }

  function storagePassesDurabilityProbe(store) {
    const nonce = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
    const probeKey = ACCOUNT_OPT_OUT_KEY + ":probe:" + nonce;
    const probeValue = "probe:" + nonce;
    try {
      store.setItem(probeKey, probeValue);
      if (store.getItem(probeKey) !== probeValue) {
        try { store.removeItem(probeKey); } catch (_) {}
        return false;
      }
      store.removeItem(probeKey);
      return store.getItem(probeKey) === null;
    } catch (_) {
      try { store.removeItem(probeKey); } catch (_) {}
      return false;
    }
  }

  function readPersistedAccountState() {
    const store = localStore();
    if (!store || typeof store.getItem !== "function") return STATE_PENDING_DELETE;
    try {
      const value = store.getItem(ACCOUNT_OPT_OUT_KEY);
      if (value === STATE_PENDING_DELETE) return STATE_PENDING_DELETE;
      if (value === STATE_OPTED_OUT || value === "1") return STATE_OPTED_OUT;
      if (value !== null) return STATE_PENDING_DELETE;
    } catch (_) {
      // An unreadable latch could be a pending deletion. Fail closed so a
      // transient storage fault cannot mint a replacement identity.
      return STATE_PENDING_DELETE;
    }
    if (typeof store.setItem !== "function" || typeof store.removeItem !== "function") {
      return STATE_PENDING_DELETE;
    }
    return storagePassesDurabilityProbe(store) ? STATE_ACTIVE : STATE_PENDING_DELETE;
  }

  let lifecycleState = readPersistedAccountState();

  function accountState() {
    return lifecycleState;
  }

  function isOptedOut() {
    // Compatibility API: true means automatic cloud-account creation is
    // blocked. Use accountState() when pending vs confirmed matters.
    return lifecycleState !== STATE_ACTIVE;
  }

  function persistAccountState(nextState) {
    const store = localStore();
    if (!store || typeof store.getItem !== "function") return false;
    try {
      if (nextState === STATE_ACTIVE && typeof store.setItem === "function" &&
          typeof store.removeItem === "function" && storagePassesDurabilityProbe(store)) {
        store.removeItem(ACCOUNT_OPT_OUT_KEY);
      } else if (nextState !== STATE_ACTIVE && typeof store.setItem === "function") {
        store.setItem(ACCOUNT_OPT_OUT_KEY, nextState);
      } else {
        return false;
      }

      const stored = store.getItem(ACCOUNT_OPT_OUT_KEY);
      const verified = nextState === STATE_ACTIVE
        ? stored === null
        : stored === nextState;
      if (!verified) return false;
      lifecycleState = nextState;
      return true;
    } catch (_) {}
    return false;
  }

  function pendingDeletionIsPersisted() {
    const store = localStore();
    if (!store || typeof store.getItem !== "function") return false;
    try {
      return store.getItem(ACCOUNT_OPT_OUT_KEY) === STATE_PENDING_DELETE;
    } catch (_) {
      return false;
    }
  }

  function isPlainRecord(value) {
    if (!value || typeof value !== "object") return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function isCloudClient(client) {
    return !!(client && (typeof client === "object" || typeof client === "function") &&
      client.auth && typeof client.auth.getSession === "function" &&
      typeof client.auth.signInAnonymously === "function" &&
      typeof client.auth.signOut === "function" && typeof client.rpc === "function" &&
      typeof client.from === "function");
  }

  function parseSession(value) {
    if (!isPlainRecord(value) ||
        !Object.prototype.hasOwnProperty.call(value, "access_token") ||
        typeof value.access_token !== "string" || value.access_token.trim().length === 0) {
      return null;
    }
    return value;
  }

  function parseSessionEnvelope(value) {
    if (!isPlainRecord(value) || Object.keys(value).length !== 2 ||
        !Object.prototype.hasOwnProperty.call(value, "data") ||
        !Object.prototype.hasOwnProperty.call(value, "error") || value.error !== null ||
        !isPlainRecord(value.data) || Object.keys(value.data).length !== 1 ||
        !Object.prototype.hasOwnProperty.call(value.data, "session")) {
      return { valid: false, session: null };
    }
    const session = value.data.session;
    if (session === null) return { valid: true, session: null };
    const parsedSession = parseSession(session);
    return { valid: !!parsedSession, session: parsedSession };
  }

  function parseAnonymousSignInEnvelope(value) {
    if (!isPlainRecord(value) ||
        !Object.prototype.hasOwnProperty.call(value, "data") ||
        !Object.prototype.hasOwnProperty.call(value, "error") || value.error !== null ||
        !isPlainRecord(value.data) ||
        !Object.prototype.hasOwnProperty.call(value.data, "session")) {
      return { valid: false, session: null };
    }
    const session = parseSession(value.data.session);
    return { valid: !!session, session };
  }

  function isSuccessfulRpcEnvelope(value) {
    return !!(isPlainRecord(value) &&
      Object.prototype.hasOwnProperty.call(value, "data") &&
      Object.prototype.hasOwnProperty.call(value, "error") && value.error === null);
  }

  const SquadCloud = {
    enabled: ENABLED,   // keys are present
    ready: false,       // signed in + every first-fetch prerequisite succeeded
    friends: [],        // [{id,name,mins,drinks,streak,skin,ts,me}]
    accountState,
    isOptedOut,
    captureAccountLease: () => null,
    isAccountLeaseCurrent: () => false,
    captureDeletionIntent: () => null,
    isDeletionIntentCurrent: () => false,
  };
  window.SquadCloud = SquadCloud;

  // Keep this API stable even in the no-cloud web build. Consumers use
  // accountState() for the exact lifecycle and isOptedOut() as a compatibility
  // check for whether automatic account creation is blocked.
  if (!ENABLED) {
    SquadCloud.client = async () => null;
    SquadCloud.init = async () => false;
    SquadCloud.enableAccountCreation = async () => false;
    return;
  }

  let sb = null;
  let myCode = null;
  let sbPromise = null;
  let authPromise = null;
  let initPromise = null;
  let deletePromise = null;
  let deletionClient = null;
  let readyBeforeDeletion = false;
  let lifecycleGeneration = 0;
  let deleting = false;
  let pushT = null;
  const accountLeaseBindings = new WeakMap();
  const deletionIntentBindings = new WeakMap();

  function generationIsCurrent(generation) {
    return generation === lifecycleGeneration && !deleting && !isOptedOut();
  }

  function clientIsCurrent(generation, client) {
    return !!client && generationIsCurrent(generation) && sb === client;
  }

  SquadCloud.captureAccountLease = function (client) {
    const generation = lifecycleGeneration;
    if (!clientIsCurrent(generation, client)) return null;
    const lease = Object.freeze(Object.create(null));
    accountLeaseBindings.set(lease, { client, generation });
    return lease;
  };

  SquadCloud.isAccountLeaseCurrent = function (lease) {
    if (!lease || (typeof lease !== "object" && typeof lease !== "function")) return false;
    const binding = accountLeaseBindings.get(lease);
    return !!(binding && clientIsCurrent(binding.generation, binding.client));
  };

  function deletionIntentGenerationIsCurrent(generation) {
    return generation === lifecycleGeneration && lifecycleState === STATE_ACTIVE &&
      !deleting && !deletePromise;
  }

  // The UI captures this before showing its destructive confirmation. It proves
  // only that the same active account lifecycle still exists when the answer
  // comes back; deleteAccount() remains the sole deletion authority.
  SquadCloud.captureDeletionIntent = function () {
    const generation = lifecycleGeneration;
    if (!deletionIntentGenerationIsCurrent(generation)) return null;
    try {
      const intent = Object.freeze(Object.create(null));
      deletionIntentBindings.set(intent, generation);
      return deletionIntentGenerationIsCurrent(generation) ? intent : null;
    } catch (_) {
      return null;
    }
  };

  SquadCloud.isDeletionIntentCurrent = function (intent) {
    try {
      if (!intent || (typeof intent !== "object" && typeof intent !== "function")) return false;
      const generation = deletionIntentBindings.get(intent);
      return Number.isInteger(generation) && deletionIntentGenerationIsCurrent(generation);
    } catch (_) {
      return false;
    }
  };

  function loadSupabase() {
    if (sbPromise) return sbPromise;
    // Pinned exact version so an upstream release can't silently change the
    // code we run; bump deliberately.
    const pending = import("https://esm.sh/@supabase/supabase-js@2.110.0")
      .then((m) => m.createClient(CLOUD.url, CLOUD.anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, storage: window.localStorage },
      }))
      .catch((e) => {
        console.warn("[squad] supabase load failed — staying offline", e);
        if (sbPromise === pending) sbPromise = null;
        return null;
      });
    sbPromise = pending;
    return pending;
  }

  function ensureAuth() {
    if (isOptedOut() || deleting) return Promise.resolve(null);
    if (sb) return Promise.resolve(sb);
    if (authPromise) return authPromise;

    const generation = lifecycleGeneration;
    const pending = (async function () {
      try {
        const client = await loadSupabase();
        if (!isCloudClient(client) || !generationIsCurrent(generation)) return null;

        const restored = await client.auth.getSession();
        if (!generationIsCurrent(generation)) return null;
        const restoredEnvelope = parseSessionEnvelope(restored);
        if (!restoredEnvelope.valid) return null;
        let session = restoredEnvelope.session;

        if (session === null) {
          const signedIn = await client.auth.signInAnonymously();
          const signedInEnvelope = parseAnonymousSignInEnvelope(signedIn);
          if (!signedInEnvelope.valid) {
            if (signedIn && signedIn.error) console.warn("[squad] anon sign-in failed", signedIn.error);
            return null;
          }
          session = signedInEnvelope.session;
        }

        if (!session) return null;
        if (!generationIsCurrent(generation)) {
          // A signup already dispatched before deletion cannot be cancelled.
          // Retain its authenticated client privately so deletion consumes that
          // identity instead of leaving a newly minted session behind.
          if (accountState() === STATE_PENDING_DELETE) deletionClient = client;
          return null;
        }
        sb = client;
        return client;
      } catch (e) {
        console.warn("[squad] auth failed — staying offline", e);
        return null;
      }
    })();

    authPromise = pending;
    pending.finally(() => { if (authPromise === pending) authPromise = null; });
    return pending;
  }

  async function runInit(generation) {
    if (!generationIsCurrent(generation)) return false;
    SquadCloud.ready = false;

    const client = await ensureAuth();
    if (!clientIsCurrent(generation, client)) return false;

    try {
      const codeResult = await client.rpc("get_my_friend_code");
      if (!clientIsCurrent(generation, client)) return false;
      if (!isSuccessfulRpcEnvelope(codeResult)) {
        throw (codeResult && codeResult.error) || new Error("friend code unavailable");
      }
      const nextCode = codeResult.data || null;
      if (typeof nextCode !== "string" || !/^[A-Z2-9]{6}$/.test(nextCode)) {
        throw new Error("invalid friend code");
      }

      if (!(await SquadCloud.pushProfileNow(generation, client))) {
        if (!clientIsCurrent(generation, client)) return false;
        throw new Error("profile sync unavailable");
      }
      if (!(await SquadCloud.fetchFriends(generation, client))) {
        if (!clientIsCurrent(generation, client)) return false;
        throw new Error("friends unavailable");
      }
      if (!clientIsCurrent(generation, client)) return false;

      myCode = nextCode;
      SquadCloud.ready = true;
      if (typeof renderSquad === "function") renderSquad();
      return true;
    } catch (e) {
      if (clientIsCurrent(generation, client)) SquadCloud.ready = false;
      console.warn("[squad] init failed — offline", e);
      return false;
    }
  }

  SquadCloud.init = function () {
    if (isOptedOut() || deleting) {
      SquadCloud.ready = false;
      return Promise.resolve(false);
    }
    if (initPromise) return initPromise;

    const generation = lifecycleGeneration;
    const pending = runInit(generation);
    initPromise = pending;
    pending.finally(() => { if (initPromise === pending) initPromise = null; });
    return pending;
  };

  SquadCloud.myCode = () => myCode;

  // The signed-in client, for other modules that must use the SAME anonymous
  // account. A shared in-flight promise prevents init() and RewardV2 from
  // concurrently minting two users on a cold start. Deliberate account deletion
  // resolves to null until enableAccountCreation() is explicitly called.
  SquadCloud.client = () => ensureAuth();

  // Push our cosmetic + soft stats (incl. focus minutes — server clamps to a sane
  // increase). For real partner-discount redemption later, swap focus_minutes to
  // the validated focus_sessions model (see supabase-setup.sql notes).
  SquadCloud.pushProfileNow = async function (expectedGeneration, expectedClient) {
    const generation = Number.isInteger(expectedGeneration) ? expectedGeneration : lifecycleGeneration;
    const client = expectedClient || sb;
    if (!client || !clientIsCurrent(generation, client) || typeof mySquadStats !== "function") return false;
    const me = mySquadStats();
    try {
      const result = await client.rpc("set_my_profile", {
        p_display_name: String(me.name || "").slice(0, 24),
        p_skin: me.skin || "",
        p_focus_minutes: Math.max(0, Math.round(me.mins) || 0),
        p_drinks: Math.max(0, me.drinks || 0),
        p_streak: Math.max(0, me.streak || 0),
        p_status: me.status || "idle",
        // The opt-in switch travels with every push, so flipping it off reaches the
        // server on the very next sync rather than waiting for a status change.
        // The server treats false as "force status to idle", which is what makes
        // opting out mid-session actually stop the broadcast.
        p_share_presence: me.sharePresence === true,
        // This calendar week only. The board resets weekly and the server rolls the
        // number over on write, so a stale client that keeps pushing last week's
        // figure gets it replaced rather than clamped upward.
        p_week_minutes: Math.max(0, Math.round(me.weekMins) || 0),
      });
      return !!(clientIsCurrent(generation, client) && isSuccessfulRpcEnvelope(result));
    } catch (_) { return false; }
  };

  // Debounced version for frequent callers.
  SquadCloud.pushProfile = function () {
    if (!SquadCloud.ready || isOptedOut() || deleting) return;
    clearTimeout(pushT);
    const generation = lifecycleGeneration;
    const client = sb;
    pushT = setTimeout(() => {
      pushT = null;
      SquadCloud.pushProfileNow(generation, client).then((ok) => {
        if (ok && clientIsCurrent(generation, client)) SquadCloud.fetchFriends(generation, client);
      });
    }, 1500);
  };

  SquadCloud.fetchFriends = async function (expectedGeneration, expectedClient) {
    const generation = Number.isInteger(expectedGeneration) ? expectedGeneration : lifecycleGeneration;
    const client = expectedClient || sb;
    if (!client || !clientIsCurrent(generation, client)) return false;
    try {
      const result = await client.rpc("get_my_friends");
      if (!clientIsCurrent(generation, client) || !isSuccessfulRpcEnvelope(result) ||
          !Array.isArray(result.data)) return false;
      SquadCloud.friends = result.data.map((r) => ({
        id: r.id, name: r.display_name, mins: r.focus_minutes,
        drinks: r.drinks, streak: r.streak, skin: r.skin, ts: r.updated_at,
        // weekMins is what the board sorts on. status_at is the freshness stamp for
        // presence and is null for anyone who has not opted in, which is how the
        // renderer tells "idle because they are idle" from "idle because they are
        // not sharing" without the server ever disclosing the difference.
        weekMins: Number.isFinite(r.week_minutes) ? r.week_minutes : 0,
        status: r.status, statusAt: r.status_at || null,
        me: !!r.is_me,
      }));
      if (typeof renderSquad === "function") renderSquad();
      return true;
    } catch (_) { return false; }
  };

  SquadCloud.follow = async function (code) {
    const generation = lifecycleGeneration;
    const client = sb;
    if (!client || !clientIsCurrent(generation, client)) return false;
    try {
      const { data, error } = await client.rpc("add_friend_by_code", { p_code: String(code || "").toUpperCase() });
      if (!clientIsCurrent(generation, client) || error || !data || !data.length) return false;
      return SquadCloud.fetchFriends(generation, client);
    } catch (_) { return false; }
  };

  SquadCloud.unfollow = async function (id) {
    const generation = lifecycleGeneration;
    const client = sb;
    if (!client || !clientIsCurrent(generation, client)) return false;
    try {
      const result = await client.from("friendships").delete().eq("friend_id", id);
      if (!clientIsCurrent(generation, client) || (result && result.error)) return false;
      return SquadCloud.fetchFriends(generation, client);
    } catch (_) { return false; }
  };

  function markCloudAccountInactive() {
    lifecycleGeneration++;
    deleting = false;
    clearTimeout(pushT);
    pushT = null;
    SquadCloud.ready = false;
    SquadCloud.friends = [];
    myCode = null;
    sb = null;
    deletionClient = null;
    sbPromise = null;
    authPromise = null;
    initPromise = null;
    if (typeof renderSquad === "function") renderSquad();
  }

  function clearPersistedAuthFallback() {
    // Supabase's local sign-out normally removes this itself. If that call fails
    // after the server has already deleted the account, remove the one app-owned
    // session key so a dead token cannot be restored on the next launch.
    const store = localStore();
    if (!store || typeof store.removeItem !== "function") return;
    try {
      const projectRef = new URL(CLOUD.url).hostname.split(".")[0];
      store.removeItem("sb-" + projectRef + "-auth-token");
    } catch (_) {}
  }

  async function restoreDeletionClient() {
    if (deletionClient) return deletionClient;
    if (sb) {
      deletionClient = sb;
      return deletionClient;
    }
    try {
      const client = await loadSupabase();
      if (!isCloudClient(client)) return null;
      const restored = await client.auth.getSession();
      const restoredEnvelope = parseSessionEnvelope(restored);
      if (!restoredEnvelope.valid || restoredEnvelope.session === null) return null;
      deletionClient = client;
      return client;
    } catch (_) {
      return null;
    }
  }

  function beginPendingDeletion() {
    if (accountState() === STATE_PENDING_DELETE) {
      deleting = true;
      SquadCloud.ready = false;
      return true;
    }
    if (!persistAccountState(STATE_PENDING_DELETE)) return false;

    readyBeforeDeletion = SquadCloud.ready;
    deletionClient = sb;
    deleting = true;
    SquadCloud.ready = false;
    initPromise = null;
    clearTimeout(pushT);
    pushT = null;
    return true;
  }

  function isDeleteEnvelope(value) {
    if (!isPlainRecord(value)) return false;
    if (!Object.prototype.hasOwnProperty.call(value, "data") ||
        !Object.prototype.hasOwnProperty.call(value, "error")) return false;
    if (value.data !== null) return false;
    if (value.error === null) return true;
    if (!isPlainRecord(value.error)) return false;
    const fields = ["code", "details", "hint", "message"];
    if (!fields.every((field) => Object.prototype.hasOwnProperty.call(value.error, field))) return false;
    if (typeof value.error.code !== "string" || typeof value.error.message !== "string" ||
        !["string", "object"].includes(typeof value.error.details) ||
        !["string", "object"].includes(typeof value.error.hint) ||
        (typeof value.error.details === "object" && value.error.details !== null) ||
        (typeof value.error.hint === "object" && value.error.hint !== null)) return false;
    return value.error.code.trim().length > 0 && value.error.message.trim().length > 0;
  }

  SquadCloud.deleteAccount = function () {
    if (deletePromise) return deletePromise;

    const pending = (async function () {
      if (accountState() === STATE_OPTED_OUT) {
        markCloudAccountInactive();
        return { ok: true, deleted: true, optedOut: true, alreadyDeleted: true };
      }

      const startedFromActive = accountState() === STATE_ACTIVE;
      const authAlreadyInFlight = authPromise;
      // Invalidate authority held by other modules at the start of every
      // deletion attempt, even if the durable pending write then fails.
      lifecycleGeneration++;
      if (!beginPendingDeletion()) {
        return { ok: false, deleted: false, reason: "state_persist_failed" };
      }

      // If normal auth had already dispatched an anonymous signup, let it
      // finish and capture its client privately before choosing a retry client.
      if (authAlreadyInFlight) await authAlreadyInFlight;
      const client = await restoreDeletionClient();
      if (!client) return { ok: false, deleted: false, reason: "no_client" };

      let deleted = false;
      try {
        // This is intentionally adjacent to the destructive call. Every retry
        // must prove the durable latch still says pending immediately beforehand.
        if (!pendingDeletionIsPersisted()) {
          console.warn("[squad] pending deletion latch is not durable");
          return { ok: false, deleted: false, reason: "state_persist_failed" };
        }
        const deletion = await client.rpc("delete_my_account");
        if (!isDeleteEnvelope(deletion)) {
          console.warn("[squad] account deletion response was ambiguous");
          return { ok: false, deleted: false, reason: "delete_ambiguous" };
        }
        if (deletion.error) {
          if (!startedFromActive) {
            console.warn("[squad] account deletion retry was refused; staying pending", deletion.error);
            return { ok: false, deleted: false, reason: "delete_failed" };
          }
          if (!persistAccountState(STATE_ACTIVE)) {
            console.warn("[squad] account deletion refused; pending state could not be cleared", deletion.error);
            return { ok: false, deleted: false, reason: "state_persist_failed" };
          }
          deleting = false;
          sb = client;
          deletionClient = null;
          SquadCloud.ready = readyBeforeDeletion;
          console.warn("[squad] account deletion refused", deletion.error);
          return { ok: false, deleted: false, reason: "delete_failed" };
        }
        deleted = true;

        // Make permanent opt-out durable before removing the only local session.
        // If this upgrade fails, the already-durable pending latch stays in place
        // and the retained client remains available only to deleteAccount().
        if (!persistAccountState(STATE_OPTED_OUT)) {
          console.warn("[squad] account deleted but permanent opt-out was not persisted");
          return { ok: false, deleted: true, optedOut: true, reason: "state_persist_failed" };
        }
        markCloudAccountInactive();

        // The account no longer exists on the server. Clear only this device's
        // session: a global sign-out can make a second network call with the now
        // invalid token and leave the local session behind.
        const signOut = await client.auth.signOut({ scope: "local" });
        const sessionResult = await client.auth.getSession();
        const sessionEnvelope = parseSessionEnvelope(sessionResult);
        if ((signOut && signOut.error) || !sessionEnvelope.valid || sessionEnvelope.session !== null) {
          clearPersistedAuthFallback();
          console.warn("[squad] account deleted but local sign-out did not finish",
            (signOut && signOut.error) || (!sessionEnvelope.valid ? "session check failed" : "session still present"));
          return { ok: false, deleted: true, optedOut: true, reason: "signout_failed" };
        }

        return { ok: true, deleted: true, optedOut: true };
      } catch (e) {
        if (deleted) {
          clearPersistedAuthFallback();
          markCloudAccountInactive();
          console.warn("[squad] account deleted but local sign-out threw", e);
          return { ok: false, deleted: true, optedOut: true, reason: "signout_failed" };
        }
        console.warn("[squad] account deletion response was lost", e);
        return { ok: false, deleted: false, reason: "delete_ambiguous" };
      }
    })();

    deletePromise = pending;
    pending.finally(() => { if (deletePromise === pending) deletePromise = null; });
    return pending;
  };

  // Deletion is intentionally sticky. A future UI may call this only after the
  // person explicitly asks to turn cloud features back on and accepts that a
  // new anonymous account will be created.
  SquadCloud.enableAccountCreation = async function () {
    if (!ENABLED || deletePromise || deleting || accountState() !== STATE_OPTED_OUT) return false;
    if (!persistAccountState(STATE_ACTIVE)) return false;
    markCloudAccountInactive();
    return SquadCloud.init();
  };
})();
