// ── RewardV2: the client half of the server-backed merchant reward ───────────
//
// Loads after config.js and squad-cloud.js. Feature flagged and OFF by default:
// with the flag down this file does nothing at all and the v1 local perk system
// is untouched. That is deliberate. v1 is live with two real signed shops, and
// tonight's job is to build the trustworthy version beside it, not to swap the
// engine under two businesses in the dark.
//
// WHAT IT CHANGES WHEN IT IS ON.
//   v1: perks are floor(lifetime local minutes / bar) minus the length of a local
//       array, both in unsigned localStorage. One line in devtools mints 416
//       rewards (measured; see docs/network-v1/GROUNDING.md D2).
//   v2: merchant reward eligibility comes from an append-only server ledger keyed
//       to the SERVER's clock. The client cannot add a minute to it.
//
// WHAT IT DOES NOT CHANGE. Pearls, cosmetics, streaks, achievements, quests, the
// drink shelf and the Goal Cup all keep running off local state exactly as they
// do today. Cosmetic progression and merchant-reward eligibility are two
// different currencies on purpose, and only the second one has to be defensible
// to a business owner.
//
// HONEST LIMIT: `platform` is a client assertion. Refusing web sessions removes
// the easy forgery, not the determined one. See the header of supabase-reward-v2.sql.
(function () {
  "use strict";

  const CLOUD = window.MRTAP_CLOUD || {};
  const FLAGS = window.MRTAP_FLAGS || {};

  // Three things must all be true, and the flag is the one a human controls.
  // The localStorage override exists so this can be exercised in QA and on a dev
  // build without editing config.js; it can only turn the flag ON for a client
  // that already has cloud keys, so it cannot conjure a backend that isn't there.
  function flagOn() {
    if (FLAGS.rewardV2 === true) return true;
    try { return localStorage.getItem("bobaRewardV2") === "on"; } catch (e) { return false; }
  }

  const RewardV2 = {
    enabled: false,        // flag + keys present
    ready: false,          // authenticated and first fetch succeeded
    eligibleMinutes: 0,    // server-credited native focus minutes
    rewards: [],           // reward_instances for this account
    policies: [],
    lastError: null,
    lastSyncAt: 0,
  };
  window.RewardV2 = RewardV2;

  function isNative() {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform &&
              window.Capacitor.isNativePlatform());
  }

  const HAS_KEYS = !!(CLOUD.url && CLOUD.anonKey);
  // The shared bundle also powers mrtapioca.me. Browser sessions cannot block
  // apps and are deliberately ineligible on the server, so exposing the V2 bar
  // there would be a progress meter that can never move. The production flag
  // therefore enables V2 only inside the native shell. The QA override obeys
  // the same boundary so localStorage cannot accidentally regress the web app.
  RewardV2.enabled = HAS_KEYS && flagOn() && isNative();
  if (!RewardV2.enabled) return;   // flag down: this file is inert, v1 stands

  // ── storage ────────────────────────────────────────────────────────────────
  const K_SESSION = "bobaRewardSession";   // the session currently open, if any
  const K_QUEUE = "bobaRewardQueue";       // calls that have not reached the server
  const QUEUE_MAX = 50;                    // bounded: a dead network must not grow forever

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const v = JSON.parse(raw);
      return v == null ? fallback : v;
    } catch (e) { return fallback; }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  function platform() { return isNative() ? "ios" : "web"; }

  // ── transport ──────────────────────────────────────────────────────────────
  // Reuses the anonymous session SquadCloud already established rather than
  // signing in a second time: two signInAnonymously() calls racing on a cold
  // start would mint two accounts and split one student's focus minutes across
  // both, which is the kind of bug that surfaces as "my reward disappeared".
  let sb = null, sbPromise = null;

  function loadSupabase() {
    if (sbPromise) return sbPromise;
    if (window.SquadCloud && typeof SquadCloud.client === "function") {
      sbPromise = Promise.resolve(SquadCloud.client()).then(function (c) {
        if (c) return c;
        return ownClient();
      });
    } else {
      sbPromise = ownClient();
    }
    return sbPromise;
  }

  function ownClient() {
    // Same pinned version and the same localStorage session store, so this
    // restores the SAME anonymous user rather than creating another.
    return import("https://esm.sh/@supabase/supabase-js@2.110.0")
      .then(function (m) {
        const c = m.createClient(CLOUD.url, CLOUD.anonKey, {
          auth: { persistSession: true, autoRefreshToken: true, storage: window.localStorage },
        });
        return c.auth.getSession().then(function (r) {
          if (r && r.data && r.data.session) return c;
          return c.auth.signInAnonymously().then(function (res) {
            return res && res.error ? null : c;
          });
        });
      })
      .catch(function (e) {
        console.warn("[rewardv2] supabase load failed", e);
        sbPromise = null;
        return null;
      });
  }

  async function ensureAuth() {
    if (sb) return sb;
    sb = await loadSupabase();
    return sb;
  }

  // Every server call funnels through here so failures are uniform: an RPC that
  // cannot be reached NEVER throws into the app and never silently succeeds.
  async function rpc(fn, args) {
    const client = await ensureAuth();
    if (!client) return { ok: false, offline: true, reason: "no_client" };
    try {
      const { data, error } = await client.rpc(fn, args || {});
      if (error) {
        RewardV2.lastError = error.message || String(error);
        return { ok: false, reason: "rpc_error", message: RewardV2.lastError };
      }
      return { ok: true, data: data };
    } catch (e) {
      RewardV2.lastError = e && e.message ? e.message : String(e);
      return { ok: false, offline: true, reason: "network", message: RewardV2.lastError };
    }
  }

  // ── the offline queue ──────────────────────────────────────────────────────
  // Only two calls are ever queued, and the asymmetry between them is the whole
  // integrity story:
  //
  //   complete_reward_session  SAFE to replay late. The server credits
  //     least(planned_minutes, elapsed since ITS OWN started_at), so a completion
  //     that arrives three hours after the fact still credits at most the minutes
  //     the session asked for. Arriving late cannot inflate anything.
  //
  //   start_reward_session     NOT safe to fake. The server stamps started_at on
  //     ARRIVAL, so a start queued offline and flushed an hour later would begin
  //     counting from the flush. We therefore do not backdate: if the start never
  //     reached the server before the session ended, that session earns NO
  //     merchant credit. The user still gets their drink, their pearls, their
  //     streak and their shelf entry. Only the real-world discount, the one a
  //     business pays for, requires the server to have watched the clock.
  function queue() { return readJSON(K_QUEUE, []); }

  function enqueue(item) {
    const q = queue();
    // Idempotency is per (fn, session_id), so a retry loop can never stack.
    if (q.some((x) => x.fn === item.fn && x.key === item.key)) return;
    q.push(item);
    while (q.length > QUEUE_MAX) q.shift();
    writeJSON(K_QUEUE, q);
  }

  async function flush() {
    const q = queue();
    if (!q.length) return { sent: 0, left: 0 };
    const left = [];
    let sent = 0;
    for (const item of q) {
      const res = await rpc(item.fn, item.args);
      if (res.ok) { sent++; continue; }
      // A network failure is retried. A server REFUSAL is not: replaying a call
      // the server already rejected just burns battery and floods the log.
      if (res.offline) left.push(item);
    }
    writeJSON(K_QUEUE, left);
    return { sent: sent, left: left.length };
  }

  // ── session lifecycle ──────────────────────────────────────────────────────
  /**
   * Open a reward session. Call this when a focus session actually begins.
   * Returns false when the session will not earn merchant credit, so the UI can
   * say so honestly rather than promising progress that will not appear.
   */
  RewardV2.startSession = async function (plannedMinutes) {
    const planned = Math.round(plannedMinutes);
    if (!isFinite(planned) || planned < 5 || planned > 480) return false;

    // A session already open locally means the last one was never closed (app
    // kill mid-session). Close it out first so the server's one-active rule does
    // not refuse the new one.
    const open = readJSON(K_SESSION, null);
    if (open && open.id) await RewardV2.completeSession({ abandoned: true });

    const id = uuid();
    const row = {
      id: id, planned: planned, platform: platform(),
      startedLocal: Date.now(), serverAck: false,
    };
    writeJSON(K_SESSION, row);

    const res = await rpc("start_reward_session", {
      p_session_id: id,
      p_planned_minutes: planned,
      p_platform: row.platform,
      p_shield: !!(window.FocusBlocker && FocusBlocker._active),
    });

    if (res.ok) {
      row.serverAck = true;
      writeJSON(K_SESSION, row);
      return true;
    }
    // No server start, no merchant credit. Recorded so the UI can explain it.
    RewardV2.lastError = res.message || res.reason;
    return false;
  };

  /**
   * Close the open reward session. Safe to call more than once, safe to call
   * after a relaunch, and safe to call with no network (it queues).
   */
  RewardV2.completeSession = async function (opts) {
    const row = readJSON(K_SESSION, null);
    if (!row || !row.id) return false;
    localStorage.removeItem(K_SESSION);

    // Never opened on the server: nothing to close and nothing was ever credited.
    if (!row.serverAck) return false;

    const args = {
      p_session_id: row.id,
      p_shield_held: !!(window.FocusBlocker && FocusBlocker._active),
    };
    const res = await rpc("complete_reward_session", args);
    if (!res.ok) {
      if (res.offline) enqueue({ fn: "complete_reward_session", key: row.id, args: args });
      return false;
    }
    await RewardV2.refresh();
    return true;
  };

  // ── reward state ───────────────────────────────────────────────────────────
  /** Pull eligibility + held rewards, issuing anything newly earned. */
  RewardV2.refresh = async function () {
    await flush();
    // issue first, then read, so a threshold crossed by the completion that just
    // landed is already a held reward by the time the UI renders.
    await rpc("issue_my_rewards", {});
    const res = await rpc("my_reward_state", {});
    if (!res.ok || !res.data) return false;
    const d = res.data;
    RewardV2.eligibleMinutes = d.eligible_minutes || 0;
    RewardV2.rewards = Array.isArray(d.rewards) ? d.rewards : [];
    RewardV2.policies = Array.isArray(d.policies) ? d.policies : [];
    RewardV2.ready = true;
    RewardV2.lastSyncAt = Date.now();
    if (typeof window.onRewardV2Sync === "function") {
      try { window.onRewardV2Sync(RewardV2); } catch (e) {}
    }
    return true;
  };

  /** Rewards in hand: issued, unredeemed, unexpired. */
  RewardV2.available = function () {
    const now = Date.now();
    return RewardV2.rewards.filter(function (r) {
      if (r.status !== "issued") return false;
      if (r.expires_at && new Date(r.expires_at).getTime() <= now) return false;
      return true;
    });
  };

  /** Progress toward the next reward under a policy. Display only. */
  RewardV2.progress = function (policyId) {
    const pol = RewardV2.policies.find(function (p) {
      return policyId ? p.id === policyId : true;
    });
    if (!pol) return null;
    const bar = pol.required_minutes;
    const done = RewardV2.eligibleMinutes % bar;
    return { bar: bar, done: done, left: Math.max(0, bar - done), policy: pol };
  };

  /** The first reward in hand that this shop can actually honour. */
  RewardV2.rewardFor = function (partnerId) {
    return RewardV2.available().find(function (r) {
      if (r.partner_id) return r.partner_id === partnerId;
      return true;   // a passport reward; the server does the final scope check
    }) || null;
  };

  // ── redemption ─────────────────────────────────────────────────────────────
  /**
   * Ask the server for a short-lived code to show at the counter.
   *
   * This does NOT consume the reward. Every reason it can be refused is checked
   * here, before a queue is standing behind the student, and the refusal reason
   * comes back verbatim so the UI can say what to do rather than "error".
   */
  RewardV2.openRedemption = async function (rewardId, partnerId) {
    const res = await rpc("open_redemption", { p_reward_id: rewardId, p_partner_id: partnerId });
    if (!res.ok) {
      // Failing CLOSED is the point. If we cannot reach the server we do not know
      // whether this reward is still unspent, so we must not draw a valid card.
      return { ok: false, reason: res.offline ? "offline" : (res.reason || "failed"),
               message: res.message || null };
    }
    return res.data || { ok: false, reason: "failed" };
  };

  /**
   * Spend it. Normally the CASHIER does this from the verification page on their
   * own device, which is what makes it a merchant action rather than a student
   * self-declaration. This exists for the fallback where the shop would rather
   * the student tap it, and it hits the identical atomic RPC either way.
   */
  RewardV2.redeemByCode = async function (code) {
    const res = await rpc("redeem_by_code", { p_code: String(code || "").trim().toUpperCase() });
    if (!res.ok) return { ok: false, reason: res.offline ? "offline" : (res.reason || "failed") };
    await RewardV2.refresh();
    return res.data || { ok: false, reason: "failed" };
  };

  /** Read-only check, for showing VALID/USED without spending. */
  RewardV2.checkCode = async function (code) {
    const res = await rpc("check_code", { p_code: String(code || "").trim().toUpperCase() });
    if (!res.ok) return { ok: false, reason: res.offline ? "offline" : (res.reason || "failed") };
    return res.data || { ok: false, reason: "failed" };
  };

  // ── boot ───────────────────────────────────────────────────────────────────
  RewardV2.init = async function () {
    if (!(await ensureAuth())) return;
    // A session left open by an app kill is closed on the next boot. The server
    // caps its credit at the minutes it asked for, so this cannot over-credit,
    // and leaving it open would block the next session via the one-active rule.
    const open = readJSON(K_SESSION, null);
    if (open && open.id && open.serverAck) await RewardV2.completeSession({ abandoned: true });
    await RewardV2.refresh();
  };

  // Retry the queue whenever the network comes back or the app returns to the
  // foreground. Both are cheap and both are the moment a stuck completion can
  // finally land.
  window.addEventListener("online", function () { flush().then(function (r) {
    if (r.sent) RewardV2.refresh();
  }); });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && RewardV2.ready) {
      flush().then(function (r) { if (r.sent) RewardV2.refresh(); });
    }
  });

  // Exposed for tests and QA.
  RewardV2._queue = queue;
  RewardV2._flush = flush;
})();
