// ── RewardMock: a reference implementation of the Reward V2 RPC contract ─────
// Not a stub. This is a second, independent implementation of exactly what
// supabase-reward-v2.sql promises, written so three things are possible without a
// live database:
//
//   1. The client (reward-v2.js) can be developed and tested end to end.
//   2. The nasty cases the SQL exists to survive — double redemption, two
//      simultaneous requests, a replayed code, a paused shop, a bumped offer
//      version — can be asserted in `node --test`.
//   3. Visual QA can screenshot a VALID card, a CONSUMED card and a REJECTED
//      card without anyone having run the migration.
//
// HONEST SCOPE: passing these tests proves the CONTRACT and the CLIENT are
// right. It does not execute the Postgres in supabase-reward-v2.sql, so it
// cannot prove that migration's SQL is semantically correct against a real
// catalog. That still needs one run in the Supabase SQL editor. Where the SQL
// leans on a database guarantee (a unique index, a conditional UPDATE), the
// comment here names it so the two can be read side by side.
//
// Loads in a browser (window.RewardMock) and in Node (require). package.json has
// no "type":"module", so a plain .js is CommonJS to Node and a script to the page.
(function (root, factory) {
  const api = factory();
  root.RewardMock = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";   // no 0/O/1/I, same as friend codes
  const HANDOFF_MS = 5 * 60 * 1000;
  const DAILY_CAP = 720;
  const MAX_SESSION_MIN = 480;
  const MIN_SESSION_MIN = 5;
  const STALE_SESSION_MS = 12 * 60 * 60 * 1000;

  function uuid() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  function fail(reason, extra) {
    return Object.assign({ ok: false, reason: reason }, extra || {});
  }

  function createBackend(opts) {
    opts = opts || {};
    // A settable clock. Every timestamp in here goes through it, exactly as every
    // timestamp in the SQL goes through now(), so a test can advance four hours
    // without waiting four hours — and so no code path can quietly read the
    // client's own clock, which is the whole point of the server ledger.
    let clock = opts.now || Date.now();
    const rnd = opts.random || Math.random;

    const db = {
      policies: new Map(),
      partners: new Map(),
      sessions: new Map(),
      rewards: [],            // reward_instances
      handoffs: new Map(),    // by code
      events: [],             // redemption_events
      user: opts.user || "user-anon-1",
    };

    const now = () => clock;

    function code6() {
      let out = "";
      while (out.length < 6) out += CODE_ALPHABET[Math.floor(rnd() * CODE_ALPHABET.length)];
      return out;
    }

    function logEvent(outcome, o) {
      db.events.push(Object.assign({ at: now(), outcome: outcome }, o || {}));
    }

    // ── config load ──────────────────────────────────────────────────────────
    // Mirrors what tools/partners-to-sql.mjs would have inserted. Validation
    // lives in reward-config.js so the client, the exporter and this all agree.
    function loadConfig(cfg) {
      db.policies.clear();
      db.partners.clear();
      (cfg.policies || []).forEach((p) => db.policies.set(p.id, Object.assign({ active: true }, p)));
      (cfg.partners || []).forEach((p) => db.partners.set(p.id, Object.assign({
        active: true, offer_version: 1, per_user_limit: null, pilot_cap: null,
        valid_days: null, valid_from_minute: null, valid_to_minute: null,
        cashier_note: "", address: "", market: "",
      }, p)));
    }

    function eligibleMinutes(user) {
      let sum = 0;
      for (const s of db.sessions.values()) {
        // platform === "ios" is the web-ineligibility rule. It is a client
        // assertion in both implementations; see the SQL header.
        if (s.user_id === user && s.state === "completed" && s.platform === "ios") {
          sum += s.credited_minutes || 0;
        }
      }
      return sum;
    }

    // ── sessions ─────────────────────────────────────────────────────────────
    function startSession(p) {
      const user = db.user;
      if (!p || !p.session_id) throw new Error("session_id required");
      if (["ios", "web"].indexOf(p.platform) < 0) return fail("bad_platform");
      const planned = p.planned_minutes;
      if (!Number.isFinite(planned) || planned < MIN_SESSION_MIN || planned > MAX_SESSION_MIN) {
        return fail("planned_out_of_range");
      }

      // Idempotency: same id returns the same row. The SQL gets this from the
      // primary key; here it is the Map lookup.
      const existing = db.sessions.get(p.session_id);
      if (existing) {
        if (existing.user_id !== user) return fail("not_your_session");
        return { ok: true, id: existing.id, started_at: existing.started_at,
                 state: existing.state, planned_minutes: existing.planned_minutes, replayed: true };
      }

      // Sweep our own stale active session, matching start_reward_session().
      for (const s of db.sessions.values()) {
        if (s.user_id === user && s.state === "active" && s.started_at < now() - STALE_SESSION_MS) {
          s.state = "abandoned"; s.ended_at = now(); s.credited_minutes = 0;
        }
      }

      // The one-active rule. In Postgres this is a partial unique index, so two
      // simultaneous starts cannot both win; single-threaded JS gets it for free,
      // which is why the SQL comment names the index explicitly.
      for (const s of db.sessions.values()) {
        if (s.user_id === user && s.state === "active") return fail("session_already_open");
      }

      const row = {
        id: p.session_id, user_id: user, started_at: now(), ended_at: null,
        planned_minutes: planned, credited_minutes: null, platform: p.platform,
        shield_claimed: !!p.shield_claimed, state: "active",
      };
      db.sessions.set(row.id, row);
      return { ok: true, id: row.id, started_at: row.started_at, state: row.state,
               planned_minutes: row.planned_minutes };
    }

    function completeSession(p) {
      const user = db.user;
      const s = db.sessions.get(p && p.session_id);
      if (!s) return fail("no_such_session");
      if (s.user_id !== user) return fail("not_your_session");

      // Already finished → same answer, no second credit. This is the branch a
      // double tap, a network retry and a replayed request all land in.
      if (s.state !== "active") {
        return { ok: true, id: s.id, state: s.state, credited_minutes: s.credited_minutes || 0,
                 eligible_minutes: eligibleMinutes(user), replayed: true };
      }

      const elapsed = Math.floor((now() - s.started_at) / 60000);
      if (elapsed < MIN_SESSION_MIN || elapsed > DAILY_CAP) {
        s.state = "abandoned"; s.ended_at = now(); s.credited_minutes = 0;
        return { ok: true, id: s.id, state: "abandoned", credited_minutes: 0,
                 eligible_minutes: eligibleMinutes(user) };
      }

      let credit = Math.min(elapsed, s.planned_minutes);

      // Daily ceiling, computed from calendar-day-start like date_trunc('day').
      const dayStart = new Date(now()); dayStart.setHours(0, 0, 0, 0);
      let used = 0;
      for (const o of db.sessions.values()) {
        if (o.user_id === user && o.state === "completed" && o.ended_at >= dayStart.getTime()) {
          used += o.credited_minutes || 0;
        }
      }
      credit = Math.max(0, Math.min(credit, DAILY_CAP - used));

      s.state = "completed"; s.ended_at = now(); s.credited_minutes = credit;
      if (p && typeof p.shield_held === "boolean") s.shield_claimed = p.shield_held;
      return { ok: true, id: s.id, state: "completed", credited_minutes: credit,
               eligible_minutes: eligibleMinutes(user) };
    }

    // ── issuance ─────────────────────────────────────────────────────────────
    function issueRewards() {
      const user = db.user;
      const minutes = eligibleMinutes(user);
      for (const pol of db.policies.values()) {
        if (!pol.active) continue;
        // Entitlement comes from minutes NOT ALREADY CONVERTED. Dividing the
        // lifetime total by today's bar re-mints history the moment a bar is
        // lowered: 240 minutes that already bought and spent one reward at a 240
        // bar produce three more the instant the bar drops to 60. Summing
        // bar_minutes spends each minute exactly once, whatever the bar was then.
        const mine = db.rewards.filter((r) => r.user_id === user && r.policy_id === pol.id);
        const spent = mine.reduce((n, r) => n + (r.bar_minutes || 0), 0);
        const held = mine.reduce((n, r) => Math.max(n, r.seq), 0);
        const entitled = Math.floor((minutes - spent) / pol.required_minutes);
        if (entitled < 1) continue;

        const partner = pol.partner_id ? db.partners.get(pol.partner_id) : null;
        const expires = pol.expires_days == null ? null : now() + pol.expires_days * 86400000;
        for (let i = held + 1; i <= held + entitled; i++) {
          // The (user, policy, seq) uniqueness is what makes a concurrent double
          // issue impossible in Postgres. Asserted here by the same guard.
          if (db.rewards.some((r) => r.user_id === user && r.policy_id === pol.id && r.seq === i)) continue;
          db.rewards.push({
            id: uuid(), user_id: user, policy_id: pol.id,
            partner_id: pol.partner_id || null, seq: i, minutes_basis: minutes,
            bar_minutes: pol.required_minutes,
            offer_version: partner ? partner.offer_version : null,
            issued_at: now(), expires_at: expires, status: "issued",
            redeemed_at: null, redeemed_partner_id: null, redeemed_offer_version: null,
            redeemed_offer_text: null,
          });
        }
      }
      return db.rewards.filter((r) => r.user_id === user)
                       .slice().sort((a, b) => b.issued_at - a.issued_at);
    }

    function myRewardState() {
      const user = db.user;
      return {
        eligible_minutes: eligibleMinutes(user),
        rewards: db.rewards.filter((r) => r.user_id === user)
                           .slice().sort((a, b) => b.issued_at - a.issued_at),
        policies: Array.from(db.policies.values()).filter((p) => p.active),
        partners: Array.from(db.partners.values()),
        server_time: now(),
      };
    }

    // ── redemption ───────────────────────────────────────────────────────────
    // Every reason a reward can be refused, checked before the cashier is
    // involved. Order matters and mirrors open_redemption().
    function validateFor(reward, partner) {
      if (!reward || reward.user_id !== db.user) return "failed_not_found";
      if (!partner) return "failed_not_found";
      if (!partner.active) return "failed_partner_paused";
      if (reward.status === "redeemed") return "failed_already_redeemed";
      if (reward.status !== "issued") return "failed_not_found";
      if (reward.expires_at != null && reward.expires_at <= now()) return "failed_expired";
      if (reward.partner_id != null && reward.partner_id !== partner.id) return "failed_wrong_partner";
      if (reward.partner_id == null && partner.policy_id !== reward.policy_id) return "failed_wrong_partner";
      if (reward.offer_version != null && reward.offer_version !== partner.offer_version) {
        return "failed_offer_changed";
      }
      return null;
    }

    // THE SHARED GATE. Caps and the agreed window, in one place, called by BOTH
    // openRedemption and redeemByCode.
    //
    // They used to be checked only at open, counted from rows already marked
    // redeemed. So opening every card FIRST, while that count was still zero,
    // passed the cap on all of them and then every one spent: per_user_limit 1
    // delivered two drinks. The cap is the only thing bounding a pilot shop's
    // exposure, so it has to hold at the moment value actually moves.
    // excludeReward lets the spend path avoid counting the reward being spent.
    function gate(user, partnerId, excludeReward) {
      const partner = db.partners.get(partnerId);
      if (!partner) return "failed_not_found";
      if (!partner.active) return "failed_partner_paused";

      const isCounted = (r) => r.status === "redeemed" &&
        r.redeemed_partner_id === partnerId &&
        (!excludeReward || r.id !== excludeReward);
      const usedHere = db.rewards.filter((r) => r.user_id === user && isCounted(r)).length;
      const totalHere = db.rewards.filter(isCounted).length;
      if ((partner.per_user_limit != null && usedHere >= partner.per_user_limit) ||
          (partner.pilot_cap != null && totalHere >= partner.pilot_cap)) {
        return "failed_capped";
      }

      const d = new Date(now());
      if (Array.isArray(partner.valid_days) && partner.valid_days.length &&
          partner.valid_days.indexOf(d.getDay()) < 0) return "failed_outside_window";

      const from = partner.valid_from_minute, to = partner.valid_to_minute;
      // A HALF-SET window is a misconfiguration, not "no restriction". Failing
      // open on it hands out a discount outside the hours the shop agreed to.
      if ((from == null) !== (to == null)) return "failed_outside_window";
      if (from != null) {
        const m = d.getHours() * 60 + d.getMinutes();
        if (from <= to) {
          if (m < from || m > to) return "failed_outside_window";
        } else {
          // WRAPS past midnight (22:00 to 02:00). The old single test was true at
          // every hour for a wrapping pair, so an overnight shop was unredeemable
          // around the clock and was told "failed_capped" for it.
          if (m < from && m > to) return "failed_outside_window";
        }
      }
      return null;
    }

    function openRedemption(rewardId, partnerId) {
      const reward = db.rewards.find((r) => r.id === rewardId);
      const partner = db.partners.get(partnerId);
      let reason = validateFor(reward, partner);

      if (!reason) reason = gate(db.user, partnerId, rewardId);

      if (reason) {
        logEvent(reason, { user_id: db.user, partner_id: partnerId, reward_id: rewardId });
        return fail(reason);
      }

      // Reuse a live handoff so a reopened sheet does not change the code the
      // cashier is mid-way through reading.
      let hit = null;
      for (const h of db.handoffs.values()) {
        if (h.reward_id === rewardId && h.partner_id === partnerId &&
            !h.consumed_at && h.expires_at > now() + 30000) { hit = h; break; }
      }
      if (!hit) {
        // Collision must be checked against EVERY row. The code is the primary
        // key, so a consumed or expired one is still taken.
        //
        // BOUNDED. Never reusing a code means a degenerate or exhausted RNG must
        // fail cleanly rather than spin: an unbounded retry here hangs the whole
        // process. With a real RNG over 32^6 (about 1.07 billion) codes, 60 misses
        // is not something that happens.
        let c = null;
        for (let n = 0; n < 60; n++) {
          const cand = code6();
          if (!db.handoffs.has(cand)) { c = cand; break; }
        }
        if (c === null) {
          logEvent("failed_code_unavailable", { user_id: db.user, partner_id: partnerId,
                                                reward_id: rewardId });
          return fail("failed_code_unavailable");
        }
        hit = { code: c, reward_id: rewardId, user_id: db.user, partner_id: partnerId,
                created_at: now(), expires_at: now() + HANDOFF_MS, consumed_at: null,
                // Pin the shop's offer version AT OPEN. A passport reward carries no
                // offer_version of its own, so without this every version check was
                // dead code for the passport model and a shop could change its offer
                // between the card opening and the student paying.
                offer_version: partner.offer_version };
        db.handoffs.set(c, hit);
      }

      logEvent("opened", { user_id: db.user, partner_id: partnerId, reward_id: rewardId,
                           offer_version: partner.offer_version });
      return { ok: true, code: hit.code, expires_at: hit.expires_at, server_time: now(),
               partner_name: partner.name, offer_text: partner.offer_text,
               offer_version: partner.offer_version, cashier_note: partner.cashier_note };
    }

    // Read-only. What the cashier's verification page shows before spending.
    function checkCode(code) {
      const h = db.handoffs.get(String(code || "").trim().toUpperCase());
      if (!h) return fail("failed_not_found");
      const partner = db.partners.get(h.partner_id);
      const reward = db.rewards.find((r) => r.id === h.reward_id);
      // Every refusal redeemByCode can raise must be reachable here too. If the
      // read-only check says VALID and the spend then refuses, the cashier finds
      // out in front of a queue. The reward's OWN expiry is the easy one to miss:
      // a fresh 5-minute code can sit in front of a reward that expired last week.
      let reason = null;
      if (h.consumed_at || reward.status === "redeemed") reason = "failed_already_redeemed";
      else if (h.expires_at <= now()) reason = "failed_code_expired";
      else if (reward.status !== "issued") reason = "failed_not_found";
      else if (reward.expires_at != null && reward.expires_at <= now()) reason = "failed_expired";
      else if (reward.offer_version != null && reward.offer_version !== partner.offer_version) {
        reason = "failed_offer_changed";
      }
      // The handoff's PINNED version, then the shared gate (caps + window). Both
      // were added to the spend path and not to this one, so the cashier's
      // read-only check said VALID and the spend then refused. Adding a refusal
      // to redeemByCode and not to checkCode is always a bug.
      else if (h.offer_version != null && h.offer_version !== partner.offer_version) {
        reason = "failed_offer_changed";
      }
      else reason = gate(h.user_id, h.partner_id, h.reward_id);
      return { ok: !reason, reason: reason, partner_name: partner.name,
               offer_text: partner.offer_text, cashier_note: partner.cashier_note,
               server_time: now(), expires_at: h.expires_at };
    }

    // The single consuming operation. Mirrors redeem_by_code(): the status check
    // and the write are one indivisible step, which is what makes two
    // simultaneous requests resolve to exactly one redemption.
    function redeemByCode(code) {
      const h = db.handoffs.get(String(code || "").trim().toUpperCase());
      if (!h) { logEvent("failed_not_found", {}); return fail("failed_not_found"); }
      const partner = db.partners.get(h.partner_id);
      const reward = db.rewards.find((r) => r.id === h.reward_id);

      let reason = null;
      if (h.consumed_at) reason = "failed_already_redeemed";
      else if (h.expires_at <= now()) reason = "failed_code_expired";
      else if (!partner.active) reason = "failed_partner_paused";
      else if (reward.status === "redeemed") reason = "failed_already_redeemed";
      else if (reward.status !== "issued") reason = "failed_not_found";
      else if (reward.expires_at != null && reward.expires_at <= now()) reason = "failed_expired";
      else if (reward.offer_version != null && reward.offer_version !== partner.offer_version) {
        reason = "failed_offer_changed";
      }
      else if (h.offer_version != null && h.offer_version !== partner.offer_version) {
        reason = "failed_offer_changed";
      }
      // Caps and window, re-checked AT SPEND.
      if (!reason) reason = gate(h.user_id, h.partner_id, h.reward_id);

      if (reason) {
        logEvent(reason, { user_id: h.user_id, partner_id: h.partner_id, reward_id: h.reward_id,
                           offer_version: partner.offer_version });
        return fail(reason, { partner_name: partner.name, offer_text: partner.offer_text });
      }

      reward.status = "redeemed";
      reward.redeemed_at = now();
      reward.redeemed_partner_id = partner.id;
      reward.redeemed_offer_version = partner.offer_version;
      // Snapshot the WORDING, not just the version. partners.offer_text is
      // mutable and holds only today's offer, so a report that joined to it
      // would relabel every historical redemption with the current wording.
      reward.redeemed_offer_text = partner.offer_text;
      h.consumed_at = now();

      logEvent("completed", { user_id: h.user_id, partner_id: h.partner_id,
                              reward_id: h.reward_id, offer_version: partner.offer_version });
      return { ok: true, partner_name: partner.name, offer_text: partner.offer_text,
               cashier_note: partner.cashier_note, redeemed_at: now(), server_time: now() };
    }

    // ── merchant report ──────────────────────────────────────────────────────
    // Same shape and the same refusals as partner_report(). No revenue, no order
    // value, no first-visit claim: none of that has ever been collected.
    function partnerReport(partnerId, days) {
      days = Math.max(1, Math.min(days || 30, 365));
      const since = now() - days * 86400000;
      const partner = db.partners.get(partnerId) || {};
      const red = db.rewards.filter((r) => r.redeemed_partner_id === partnerId &&
                                           r.status === "redeemed" && r.redeemed_at >= since);
      const perUser = new Map();
      red.forEach((r) => perUser.set(r.user_id, (perUser.get(r.user_id) || 0) + 1));
      const byDay = new Map();
      red.forEach((r) => {
        const d = new Date(r.redeemed_at); d.setHours(0, 0, 0, 0);
        const k = new Date(d).toISOString().slice(0, 10);
        byDay.set(k, (byDay.get(k) || 0) + 1);
      });
      const rejected = new Map();
      db.events.filter((e) => e.partner_id === partnerId && e.at >= since &&
                              String(e.outcome).startsWith("failed_"))
        .forEach((e) => rejected.set(e.outcome, (rejected.get(e.outcome) || 0) + 1));

      // Group by the wording that was actually honoured, so a shop that changed
      // its offer mid-pilot sees both lines rather than one relabelled line.
      const offers = new Map();
      red.forEach((r) => {
        const k = (r.redeemed_offer_text || "") + "\u0000" + r.redeemed_offer_version;
        const e = offers.get(k) || { offer_text: r.redeemed_offer_text,
          offer_version: r.redeemed_offer_version, n: 0, first: r.redeemed_at, last: r.redeemed_at };
        e.n++;
        e.first = Math.min(e.first, r.redeemed_at);
        e.last = Math.max(e.last, r.redeemed_at);
        offers.set(k, e);
      });

      return {
        partner_id: partnerId, partner_name: partner.name, window_days: days,
        offer_text: partner.offer_text, offer_version: partner.offer_version,
        offers_honoured: Array.from(offers.values()).sort((a, b) => a.first - b.first),
        active: partner.active,
        redemptions: red.length,
        unique_redeemers: perUser.size,
        repeat_redeemers: Array.from(perUser.values()).filter((n) => n > 1).length,
        first_redemption: red.length ? Math.min.apply(null, red.map((r) => r.redeemed_at)) : null,
        last_redemption: red.length ? Math.max.apply(null, red.map((r) => r.redeemed_at)) : null,
        by_day: Array.from(byDay, ([day, n]) => ({ day, n })).sort((a, b) => a.day < b.day ? -1 : 1),
        rejected: Array.from(rejected, ([reason, n]) => ({ reason, n })).sort((a, b) => b.n - a.n),
      };
    }

    return {
      db: db,
      loadConfig: loadConfig,
      now: now,
      setNow: (t) => { clock = t; },
      advance: (ms) => { clock += ms; return clock; },
      setUser: (u) => { db.user = u; },
      eligibleMinutes: () => eligibleMinutes(db.user),
      // The RPC surface, named exactly as the SQL functions are, so the client
      // can be pointed at either one.
      rpc: {
        start_reward_session: (p) => startSession(p),
        complete_reward_session: (p) => completeSession(p),
        issue_my_rewards: () => issueRewards(),
        my_reward_state: () => myRewardState(),
        open_redemption: (p) => openRedemption(p.reward_id, p.partner_id),
        check_code: (p) => checkCode(p.code),
        redeem_by_code: (p) => redeemByCode(p.code),
        partner_report: (p) => partnerReport(p.partner_id, p.days),
      },
    };
  }

  return { createBackend: createBackend, uuid: uuid };
});
