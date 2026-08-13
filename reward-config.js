// ── Reward configuration: partners, offers, and the explicit threshold policy ─
//
// One module, three consumers, so they cannot drift: the app reads it to decide
// what bar a shop sets, tools/partners-to-sql.mjs reads it to seed the server, and
// reward-mock.js / the tests read it to build fixtures.
//
// WHAT THIS FIXES. v1 answers "how much focus buys a reward?" with
//
//     Math.min(...livePartners.map(p => p.minMinutes))          // app.js perkMinMinutes()
//
// a single global bar, taken from whichever shop happens to ask for the least.
// With two shops both at 240 that is correct by accident. It stops being correct
// the moment a third shop signs at a lower number: every OTHER shop's bar silently
// drops to the new minimum too, for every user, and a student walks into U Tea
// holding a reward U Tea never agreed to. That is the single worst failure this
// feature has, and the repo's own comments say so.
//
// The replacement is not a cleverer default. It is a written-down policy:
//   global_passport    one shared bar; a reward earned anywhere is spendable at
//                      any shop on that policy. (What v1 behaves like today.)
//   partner_specific   the bar belongs to one shop and so does the reward.
//
// partners.json may declare policies. If it does NOT, the answer is "undeclared",
// and Reward V2 issuance stays off rather than guessing which business model the
// founder meant. Declaring it is a decision, not a migration detail.
(function (root, factory) {
  const api = factory();
  root.RewardConfig = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MIN_BAR = 15;      // matches validPartner() in app.js; a 0 would make every user instantly redeemable
  const MAX_BAR = 1440;

  // The SERVER's own rule, copied from supabase-reward-v2.sql sections 1 and 2:
  //     id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{1,62}$')
  // Shop ids used to go unchecked here, so "U Tea Collegetown!", "U-TEA" and
  // "u-tea " all parsed with zero errors and then failed at seed time one CHECK
  // violation at a time. The trailing-space and case variants were the dangerous
  // ones: this file saw three distinct shops where a human sees one, so the
  // duplicate-id error that exists to stop colliding server rows never fired.
  const ID_RE = /^[a-z0-9][a-z0-9-]{1,62}$/;

  // Caps must fit the server's CHECKs too, or the migration refuses a file this
  // parser called clean.
  const MAX_PER_USER = 1000;      // per_user_limit check (... between 1 and 1000)
  const MAX_PILOT = 1000000;      // pilot_cap      check (... between 1 and 1000000)

  function isStr(v, max) {
    return typeof v === "string" && v.trim().length > 0 && v.length <= (max || 200);
  }
  function isNum(v) { return typeof v === "number" && isFinite(v); }

  // Exactly the v1 rules, kept byte-for-byte compatible so a shop that is valid
  // today cannot become invalid under the new parser. New fields are all optional.
  function validShop(p) {
    return !!p && isStr(p.name, 80)
      && isStr(p.perk, 200)
      && isNum(p.lat) && Math.abs(p.lat) <= 90
      && isNum(p.lng) && Math.abs(p.lng) <= 180
      && isNum(p.minMinutes) && p.minMinutes >= MIN_BAR && p.minMinutes <= MAX_BAR;
  }

  function validPolicy(pol) {
    if (!pol || !isStr(pol.id) || !ID_RE.test(pol.id)) return "policy id must be a slug";
    if (["global_passport", "partner_specific"].indexOf(pol.kind) < 0) {
      return "policy kind must be global_passport or partner_specific";
    }
    if (!isNum(pol.requiredMinutes) || pol.requiredMinutes < MIN_BAR || pol.requiredMinutes > MAX_BAR) {
      return "requiredMinutes must be between " + MIN_BAR + " and " + MAX_BAR;
    }
    if (pol.expiresDays != null && (!isNum(pol.expiresDays) || pol.expiresDays < 1 || pol.expiresDays > 3650)) {
      return "expiresDays must be 1..3650 or null";
    }
    return null;
  }

  // Normalise one shop into the fuller partner record. Every added field is
  // optional and every default preserves what the shop already agreed to: an
  // entry with none of them behaves exactly as it does in v1.
  function normaliseShop(p) {
    return {
      // Trimmed, because " u-tea" and "u-tea " are the same shop to a human and
      // to the server's primary key, and treating them as different is how two
      // colliding rows get seeded.
      id: isStr(p.id) ? p.id.trim() : null,
      name: p.name.trim(),
      address: isStr(p.address) ? p.address.trim() : "",
      market: isStr(p.market) ? p.market.trim() : "",
      lat: p.lat, lng: p.lng,
      perk: p.perk.trim(),                       // the student-facing wording
      offerText: isStr(p.offerText) ? p.offerText.trim() : p.perk.trim(),  // what staff honour
      offerVersion: isNum(p.offerVersion) && p.offerVersion >= 1 ? Math.floor(p.offerVersion) : 1,
      minMinutes: p.minMinutes,
      policyId: isStr(p.policyId) ? p.policyId : null,
      // `active:false` is a PAUSE, not a removal: the shop stays on the map with
      // its offer greyed rather than vanishing mid-pilot. Absent means active.
      active: p.active === false ? false : true,
      perUserLimit: isNum(p.perUserLimit) && p.perUserLimit >= 1 ? Math.floor(p.perUserLimit) : null,
      pilotCap: isNum(p.pilotCap) && p.pilotCap >= 1 ? Math.floor(p.pilotCap) : null,
      validDays: Array.isArray(p.validDays) && p.validDays.length
        ? p.validDays.filter((d) => isNum(d) && Number.isInteger(d) && d >= 0 && d <= 6) : null,
      // Kept so the validator can tell "no day rule" from "a day rule whose
      // entries were all thrown away". Without it those two are indistinguishable
      // and a mistyped rule fails OPEN, which is the wrong direction for a
      // restriction a shop actually asked for.
      _rawValidDays: Array.isArray(p.validDays) ? p.validDays.length : 0,
      validFromMinute: isNum(p.validFromMinute) && p.validFromMinute >= 0 && p.validFromMinute <= 1439
        ? Math.floor(p.validFromMinute) : null,
      validToMinute: isNum(p.validToMinute) && p.validToMinute >= 0 && p.validToMinute <= 1439
        ? Math.floor(p.validToMinute) : null,
      terms: isStr(p.terms, 400) ? p.terms.trim() : "",
      cashierNote: isStr(p.cashierNote, 300) ? p.cashierNote.trim() : "",
      verification: isStr(p.verification) ? p.verification : "code",
      since: isStr(p.since) ? p.since : "",
      updatedAt: isStr(p.updatedAt) ? p.updatedAt : "",
    };
  }

  /**
   * Parse a partners.json payload.
   *
   * Returns { shops, policies, policyState, errors, warnings }.
   *
   * policyState is the important field:
   *   "undeclared"  no rewardPolicy block. v1 display behaviour is unchanged and
   *                 Reward V2 issuance MUST stay off.
   *   "declared"    every shop maps to a valid policy. V2 may issue.
   *   "ambiguous"   the config contradicts itself (a shop's own minMinutes fights
   *                 its policy's bar, a policy is missing, two shops share a
   *                 global bar but disagree about it). V2 MUST stay off and the
   *                 map must not imply a reward that nobody agreed to.
   *
   * A malformed shop is DROPPED, never guessed at — the v1 rule, kept.
   */
  function parse(payload) {
    const errors = [];
    const warnings = [];
    const raw = payload && Array.isArray(payload) ? { shops: payload } : (payload || {});
    const rawShops = Array.isArray(raw.shops) ? raw.shops : [];

    const kept = [];
    rawShops.forEach((s, i) => {
      if (!validShop(s)) {
        warnings.push("shop[" + i + "] dropped: malformed or minMinutes outside " + MIN_BAR + "-" + MAX_BAR);
        return;
      }
      kept.push(normaliseShop(s));
    });

    // Every shop must carry an id the server can actually store, a day list that
    // survived parsing, and caps inside the server's CHECKs. These are ERRORS, not
    // warnings: each one means the migration would refuse the file, and a config
    // that cannot be seeded must not be allowed to look healthy.
    kept.forEach((sh) => {
      const label = sh.id || sh.name;
      if (!sh.id) {
        errors.push("shop " + label + " has no id. The server needs one as a primary key, " +
          "and without it two shops are indistinguishable.");
      } else if (!ID_RE.test(sh.id)) {
        errors.push("shop id " + JSON.stringify(sh.id) + " is not a valid slug " +
          "(lowercase a-z, 0-9 and hyphens, 2 to 63 characters). The server would reject it.");
      }
      if (sh._rawValidDays > 0 && (!sh.validDays || sh.validDays.length !== sh._rawValidDays)) {
        errors.push("shop " + label + " has a validDays entry that is not a whole number 0-6. " +
          "A day rule that cannot be read is not the same as no day rule, so it is refused " +
          "rather than silently ignored.");
      }
      if (sh.perUserLimit != null && sh.perUserLimit > MAX_PER_USER) {
        errors.push("shop " + label + " sets perUserLimit " + sh.perUserLimit +
          "; the server allows at most " + MAX_PER_USER + ".");
      }
      if (sh.pilotCap != null && sh.pilotCap > MAX_PILOT) {
        errors.push("shop " + label + " sets pilotCap " + sh.pilotCap +
          "; the server allows at most " + MAX_PILOT + ".");
      }
      delete sh._rawValidDays;
    });

    // Duplicate ids would make server rows collide and a report meaningless.
    const seen = new Set();
    const shops = kept.filter((s) => {
      if (s.id && seen.has(s.id)) {
        errors.push("duplicate shop id: " + s.id);
        return false;
      }
      if (s.id) seen.add(s.id);
      return true;
    });

    const block = raw.rewardPolicy;
    if (!block || !Array.isArray(block.policies) || !block.policies.length) {
      if (shops.length > 1) {
        const bars = Array.from(new Set(shops.map((s) => s.minMinutes)));
        if (bars.length > 1) {
          // The exact case the global Math.min silently mishandles. Named here so
          // it can never be a surprise: it is now a warning today and a hard
          // refusal for anything that issues a real reward.
          warnings.push("shops disagree on minMinutes (" + bars.join(", ") +
            ") and no rewardPolicy is declared. v1 applies the LOWEST bar to every " +
            "shop, which can hand a shop a reward it never agreed to. Declare a rewardPolicy.");
          return { shops, policies: [], policyState: "ambiguous", errors, warnings };
        }
      }
      return { shops, policies: [], policyState: "undeclared", errors, warnings };
    }

    const policies = [];
    const byId = new Map();
    block.policies.forEach((pol, i) => {
      const bad = validPolicy(pol);
      if (bad) { errors.push("policy[" + i + "] rejected: " + bad); return; }
      if (byId.has(pol.id)) { errors.push("duplicate policy id: " + pol.id); return; }
      const norm = {
        id: pol.id,
        kind: pol.kind,
        requiredMinutes: pol.requiredMinutes,
        expiresDays: pol.expiresDays == null ? null : pol.expiresDays,
        partnerId: isStr(pol.partnerId) ? pol.partnerId : null,
        active: pol.active === false ? false : true,
      };
      if (norm.kind === "partner_specific" && !norm.partnerId) {
        errors.push("policy " + norm.id + " is partner_specific but names no partnerId");
        return;
      }
      if (norm.kind === "global_passport" && norm.partnerId) {
        errors.push("policy " + norm.id + " is global_passport but names a partnerId");
        return;
      }
      byId.set(norm.id, norm);
      policies.push(norm);
    });

    // Every shop must map to a policy, and its own bar must AGREE with that
    // policy's bar. Two numbers that disagree is exactly the ambiguity that has
    // to be refused rather than resolved by picking one.
    shops.forEach((s) => {
      if (!s.policyId) { errors.push("shop " + (s.id || s.name) + " declares no policyId"); return; }
      const pol = byId.get(s.policyId);
      if (!pol) { errors.push("shop " + (s.id || s.name) + " references unknown policy " + s.policyId); return; }
      if (pol.kind === "partner_specific" && pol.partnerId !== s.id) {
        errors.push("policy " + pol.id + " belongs to " + pol.partnerId + " but " + s.id + " references it");
      }
      if (s.minMinutes !== pol.requiredMinutes) {
        errors.push("shop " + (s.id || s.name) + " sets minMinutes " + s.minMinutes +
          " but policy " + pol.id + " requires " + pol.requiredMinutes +
          ". One of the two is wrong; the config will not guess.");
      }
    });

    // A partner_specific policy naming a shop that is not in the list would issue
    // rewards nobody can spend.
    policies.forEach((pol) => {
      if (pol.kind === "partner_specific" && !shops.some((s) => s.id === pol.partnerId)) {
        errors.push("policy " + pol.id + " names partner " + pol.partnerId + ", which is not in shops[]");
      }
    });

    return {
      shops, policies,
      policyState: errors.length ? "ambiguous" : "declared",
      errors, warnings,
    };
  }

  /**
   * The bar THIS shop actually sets, in minutes.
   *
   * Deliberately per-shop. On the live config (both shops at 240) it returns the
   * same number the global Math.min returns, so today's behaviour is unchanged;
   * on any config where the shops disagree it returns the truth instead of the
   * lowest bid.
   */
  function barFor(shop) {
    return shop && isNum(shop.minMinutes) ? shop.minMinutes : MAX_BAR;
  }

  /**
   * The bar to show when no single shop is in view (the drink-complete card, the
   * map banner). The LOWEST bar of the shops on the map is the honest answer to
   * "how far until I unlock something somewhere", and it is only ever used for a
   * progress line, never to decide that a specific shop owes anything.
   *
   * The distinction matters: v1 used one number for both, which is how a display
   * default became an eligibility rule.
   */
  function nextBarAcross(shops, fallback) {
    const live = (shops || []).filter((s) => s && s.active !== false && isNum(s.minMinutes));
    if (!live.length) return isNum(fallback) ? fallback : 180;
    // reduce, not Math.min.apply: apply spreads the array across the argument
    // stack and throws RangeError somewhere above ~124k entries. A partner list
    // that long is absurd, but a crash in the map's progress line is a worse
    // outcome than an unnecessary loop.
    return live.reduce((lo, s) => (s.minMinutes < lo ? s.minMinutes : lo), Infinity);
  }

  /** Is a reward earned under `policy` spendable at `shop` right now? */
  function eligibleAt(reward, shop, policies) {
    if (!reward || !shop) return "failed_not_found";
    if (shop.active === false) return "failed_partner_paused";
    if (reward.partner_id != null && reward.partner_id !== shop.id) return "failed_wrong_partner";
    if (reward.partner_id == null) {
      const pol = (policies || []).find((p) => p.id === reward.policy_id);
      if (!pol || shop.policyId !== pol.id) return "failed_wrong_partner";
    }
    if (reward.offer_version != null && reward.offer_version !== shop.offerVersion) {
      return "failed_offer_changed";
    }
    return null;
  }

  return {
    MIN_BAR, MAX_BAR,
    validShop, validPolicy, normaliseShop,
    parse, barFor, nextBarAcross, eligibleAt,
  };
});
