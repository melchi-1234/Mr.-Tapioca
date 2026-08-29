// Reward V2 issuance and redemption: the adversarial half.
//
// Every test here is a way a student, a friend of a student, or a script could
// try to get a second drink out of one reward. If any of these ever goes green
// the wrong way, a real business is paying for it.
//
// 1.2.0 removed the six-character cashier handoff, so the tests that lived on it
// are gone with it: there is no code to screenshot, to reopen, to type in lower
// case, or to check ahead of the spend. What is left is stricter, not looser.
// A redemption is now one authenticated call naming a reward id and a shop, and
// the id is only spendable by the account that owns it, which the code path
// structurally could not check (holding the code WAS the credential, and anon
// could call it). Everything the two old functions checked between them —
// ownership, paused shop, expiry, wrong shop, a reworded offer, the caps and the
// agreed window — is checked here, in the one operation that moves value.
const test = require("node:test");
const assert = require("node:assert");
const { createBackend, uuid } = require("../reward-mock.js");

const T0 = Date.UTC(2026, 7, 12, 14, 0, 0);   // 2026-08-12 14:00 UTC — a Wednesday afternoon
const MIN = 60000;
const HOUR = 60 * MIN;
const U_TEA = "u-tea-collegetown";
const DREAM = "dream-tea-poke-ithaca";

// The complete set of reasons redeem_reward can answer with. failed_code_expired
// and failed_code_unavailable were the handoff's own two and are unreachable now;
// nothing may quietly grow this list either, because the client only has fail
// copy for what is in it and maps anything else to "ambiguous".
const REASONS = [
  "failed_not_found",
  "failed_partner_paused",
  "failed_already_redeemed",
  "failed_expired",
  "failed_wrong_partner",
  "failed_offer_changed",
  "failed_capped",
  "failed_outside_window",
];

function backend(cfg) {
  const b = createBackend({ now: T0 });
  b.loadConfig(cfg || {
    policies: [{ id: "ithaca-passport", kind: "global_passport", required_minutes: 240, expires_days: null }],
    partners: [
      { id: U_TEA, name: "U Tea", offer_text: "10% off your drink", policy_id: "ithaca-passport",
        cashier_note: "Ring up 10% off. Nothing to scan." },
      { id: DREAM, name: "Dream Tea & Poké", offer_text: "5% off your drink", policy_id: "ithaca-passport" },
    ],
  });
  return b;
}

/** Bank `hours` of eligible native focus, respecting the 12 h/day ceiling. */
function bank(b, hours) {
  for (let i = 0; i < hours; i++) {
    const id = uuid();
    b.rpc.start_reward_session({ session_id: id, planned_minutes: 60, platform: "ios" });
    b.advance(HOUR);
    b.rpc.complete_reward_session({ session_id: id });
    if ((i + 1) % 12 === 0) b.advance(13 * HOUR);   // roll to the next day
  }
}

function earnOne(b) {
  bank(b, 4);
  const rewards = b.rpc.issue_my_rewards();
  return rewards.find((r) => r.status === "issued");
}

/** The one consuming call, spelled the way the client spells it. */
function spend(b, rewardId, partnerId) {
  return b.rpc.redeem_reward({ reward_id: rewardId, partner_id: partnerId });
}

// ── issuance ─────────────────────────────────────────────────────────────────
test("no reward before the threshold", () => {
  const b = backend();
  bank(b, 3);
  assert.equal(b.eligibleMinutes(), 180);
  assert.equal(b.rpc.issue_my_rewards().length, 0);
});

test("exactly one reward at the threshold", () => {
  const b = backend();
  bank(b, 4);
  const r = b.rpc.issue_my_rewards();
  assert.equal(r.length, 1);
  assert.equal(r[0].status, "issued");
  assert.equal(r[0].seq, 1);
  assert.equal(r[0].policy_id, "ithaca-passport");
  assert.equal(r[0].partner_id, null, "a passport reward is not tied to one shop");
});

test("issuance is idempotent however many times it is called", () => {
  const b = backend();
  bank(b, 4);
  for (let i = 0; i < 25; i++) b.rpc.issue_my_rewards();
  assert.equal(b.db.rewards.length, 1, "calling issue in a loop must not mint a pile");
});

test("eight hours issues two rewards, not one and not three", () => {
  const b = backend();
  bank(b, 8);
  assert.equal(b.rpc.issue_my_rewards().length, 2);
});

test("partial progress past a threshold does not round up", () => {
  const b = backend();
  bank(b, 7);
  assert.equal(b.rpc.issue_my_rewards().length, 1);
});

test("a partner-specific policy issues a reward bound to that shop", () => {
  const b = backend({
    policies: [{ id: "u-tea-only", kind: "partner_specific", required_minutes: 240, partner_id: U_TEA }],
    partners: [{ id: U_TEA, name: "U Tea", offer_text: "10% off your drink", policy_id: "u-tea-only", offer_version: 3 }],
  });
  bank(b, 4);
  const r = b.rpc.issue_my_rewards()[0];
  assert.equal(r.partner_id, U_TEA);
  assert.equal(r.offer_version, 3, "the reward remembers the offer it was earned against");
});

test("web minutes never issue a reward however many there are", () => {
  const b = backend();
  for (let i = 0; i < 6; i++) {
    const id = uuid();
    b.rpc.start_reward_session({ session_id: id, planned_minutes: 60, platform: "web" });
    b.advance(HOUR);
    b.rpc.complete_reward_session({ session_id: id });
  }
  assert.equal(b.rpc.issue_my_rewards().length, 0);
});

// ── the happy path ───────────────────────────────────────────────────────────
test("a valid reward redeems in one tap", () => {
  const b = backend();
  const r = earnOne(b);
  const done = spend(b, r.id, U_TEA);
  assert.equal(done.ok, true);
  assert.equal(done.partner_name, "U Tea");
  assert.equal(done.offer_text, "10% off your drink");
  assert.equal(done.cashier_note, "Ring up 10% off. Nothing to scan.");
  assert.ok(done.server_time, "the client trusts the server's clock, never the phone's");
  assert.equal(b.db.rewards[0].status, "redeemed");
  assert.equal(b.db.rewards[0].redeemed_partner_id, U_TEA);
});

test("success returns the minutes the share card is built from", () => {
  // bar_minutes reaches the client here and nowhere else, and it is the reward's
  // OWN issuance bar rather than whatever the policy asks for today. A pilot that
  // lowers its bar must not retroactively relabel what an old reward was worth.
  // The client validates it to 15..1440 and drops the number otherwise, so a
  // missing field is a silently minutes-less share card, not a crash.
  const b = backend();
  const r = earnOne(b);
  b.db.policies.get("ithaca-passport").required_minutes = 60;
  const done = spend(b, r.id, U_TEA);
  assert.equal(done.ok, true);
  assert.equal(done.bar_minutes, 240, "the bar it was earned against, not today's");
});

test("looking at the card does not consume it", () => {
  // openRedeem() makes ZERO network calls now: the card is drawn from the local
  // partner snapshot and the in-memory reward, and redeem_reward is the only
  // thing that touches the ledger. Reading state, however often, changes nothing.
  const b = backend();
  earnOne(b);
  for (let i = 0; i < 10; i++) b.rpc.my_reward_state();
  assert.equal(b.db.rewards[0].status, "issued", "walking away must not burn the reward");
});

// ── double redemption ────────────────────────────────────────────────────────
test("the same reward cannot be redeemed twice", () => {
  const b = backend();
  const r = earnOne(b);
  assert.equal(spend(b, r.id, U_TEA).ok, true);
  const second = spend(b, r.id, U_TEA);
  assert.equal(second.ok, false);
  assert.equal(second.reason, "failed_already_redeemed");
});

test("a double tap on redeem spends exactly one reward", () => {
  // The client also latches this: confirmRedeem() clears heldId from
  // redeemContext BEFORE it dispatches, so the second tap has nothing to send.
  // That is a courtesy. This is the guarantee.
  const b = backend();
  bank(b, 8);
  b.rpc.issue_my_rewards();
  const first = b.db.rewards[0];
  spend(b, first.id, U_TEA);
  spend(b, first.id, U_TEA);
  const redeemed = b.db.rewards.filter((x) => x.status === "redeemed");
  assert.equal(redeemed.length, 1, "the second reward must still be in hand");
});

test("simultaneous requests for one reward resolve to exactly one redemption", () => {
  // In Postgres this is redeem_reward's single conditional UPDATE:
  //   update ... where r.id = p_reward_id and r.status = 'issued'
  // Row-locked, so of N racing callers exactly one gets row_count = 1. This is
  // the one-time guarantee, and it never lived in the handoff code.
  const b = backend();
  const r = earnOne(b);
  const results = [];
  for (let i = 0; i < 8; i++) results.push(spend(b, r.id, U_TEA));
  assert.equal(results.filter((x) => x.ok).length, 1);
  assert.equal(results.filter((x) => !x.ok && x.reason === "failed_already_redeemed").length, 7);
  assert.equal(b.db.rewards.filter((x) => x.status === "redeemed").length, 1);
});

test("a reward id that does not exist is refused and spends nothing", () => {
  const b = backend();
  earnOne(b);
  assert.equal(spend(b, uuid(), U_TEA).reason, "failed_not_found");
  assert.equal(spend(b, "", U_TEA).reason, "failed_not_found");
  assert.equal(spend(b, null, U_TEA).reason, "failed_not_found");
  assert.equal(b.db.rewards[0].status, "issued");
});

// ── wrong shop ───────────────────────────────────────────────────────────────
test("a partner-scoped reward is refused at the other shop", () => {
  const b = backend({
    policies: [{ id: "u-tea-only", kind: "partner_specific", required_minutes: 240, partner_id: U_TEA }],
    partners: [
      { id: U_TEA, name: "U Tea", offer_text: "10% off", policy_id: "u-tea-only" },
      { id: DREAM, name: "Dream Tea & Poké", offer_text: "5% off", policy_id: "u-tea-only" },
    ],
  });
  bank(b, 4);
  const r = b.rpc.issue_my_rewards()[0];
  const bad = spend(b, r.id, DREAM);
  assert.equal(bad.ok, false);
  assert.equal(bad.reason, "failed_wrong_partner");
  assert.equal(b.db.rewards[0].status, "issued");
});

test("a passport reward works at either shop on that policy", () => {
  const b = backend();
  bank(b, 8);
  const rewards = b.rpc.issue_my_rewards();
  assert.equal(spend(b, rewards[0].id, U_TEA).ok, true);
  assert.equal(spend(b, rewards[1].id, DREAM).ok, true);
});

test("an unknown partner id is refused", () => {
  const b = backend();
  const r = earnOne(b);
  const bad = spend(b, r.id, "not-a-shop");
  assert.equal(bad.ok, false);
  assert.equal(bad.reason, "failed_not_found");
});

// ── paused shop ──────────────────────────────────────────────────────────────
test("a paused shop refuses new redemptions", () => {
  const b = backend();
  const r = earnOne(b);
  b.db.partners.get(U_TEA).active = false;
  assert.equal(spend(b, r.id, U_TEA).reason, "failed_partner_paused");
});

test("a shop paused between the card opening and the tap refuses at the counter", () => {
  // The promise made to every shop: they come off the app the day they ask.
  // The card the student is looking at was drawn from a LOCAL snapshot of the
  // shop, so it can go stale while it sits on screen. The spend reads the
  // partner row FOR UPDATE, so it is the live row that decides, not the snapshot.
  const b = backend();
  const r = earnOne(b);
  const shown = Object.assign({}, b.db.partners.get(U_TEA));
  b.db.partners.get(U_TEA).active = false;
  assert.equal(shown.active, true, "the open card still shows the shop as live");
  const late = spend(b, r.id, U_TEA);
  assert.equal(late.ok, false);
  assert.equal(late.reason, "failed_partner_paused");
  assert.equal(b.db.rewards[0].status, "issued", "the student keeps the reward");
});

// ── offer version ────────────────────────────────────────────────────────────
test("a bumped offer refuses an old reward rather than honouring new terms", () => {
  const b = backend({
    policies: [{ id: "u-tea-only", kind: "partner_specific", required_minutes: 240, partner_id: U_TEA }],
    partners: [{ id: U_TEA, name: "U Tea", offer_text: "10% off your drink", policy_id: "u-tea-only", offer_version: 1 }],
  });
  bank(b, 4);
  const r = b.rpc.issue_my_rewards()[0];
  const p = b.db.partners.get(U_TEA);
  p.offer_version = 2;
  p.offer_text = "free topping";
  assert.equal(spend(b, r.id, U_TEA).reason, "failed_offer_changed");
});

test("an offer bumped while the card is open refuses at the counter too", () => {
  const b = backend({
    policies: [{ id: "u-tea-only", kind: "partner_specific", required_minutes: 240, partner_id: U_TEA }],
    partners: [{ id: U_TEA, name: "U Tea", offer_text: "10% off your drink", policy_id: "u-tea-only", offer_version: 1 }],
  });
  bank(b, 4);
  const r = b.rpc.issue_my_rewards()[0];
  const shown = Object.assign({}, b.db.partners.get(U_TEA));   // what the card is showing
  b.db.partners.get(U_TEA).offer_version = 2;
  assert.equal(shown.offer_version, 1);
  assert.equal(spend(b, r.id, U_TEA).reason, "failed_offer_changed");
  assert.equal(b.db.rewards[0].status, "issued", "the student keeps the reward");
});

// ── expiry ───────────────────────────────────────────────────────────────────
test("an expired reward is refused", () => {
  const b = backend({
    policies: [{ id: "short", kind: "global_passport", required_minutes: 240, expires_days: 7 }],
    partners: [{ id: U_TEA, name: "U Tea", offer_text: "10% off", policy_id: "short" }],
  });
  bank(b, 4);
  const r = b.rpc.issue_my_rewards()[0];
  assert.ok(r.expires_at, "an expiring policy sets an expiry");
  b.advance(8 * 24 * HOUR);
  assert.equal(spend(b, r.id, U_TEA).reason, "failed_expired");
});

test("a reward with no expiry policy never expires", () => {
  const b = backend();
  const r = earnOne(b);
  assert.equal(r.expires_at, null);
  b.advance(365 * 24 * HOUR);
  assert.equal(spend(b, r.id, U_TEA).ok, true);
});

// ── caps ─────────────────────────────────────────────────────────────────────
test("a per-user limit is enforced", () => {
  // The cap used to be checked only when a card was opened, counting rows already
  // redeemed. Opening both cards first, while that count was still zero, passed
  // the cap on both and then both spent: per_user_limit 1 delivered two drinks.
  // There is no open step any more, and the gate runs inside the spend.
  const b = backend({
    policies: [{ id: "ithaca-passport", kind: "global_passport", required_minutes: 240 }],
    partners: [{ id: U_TEA, name: "U Tea", offer_text: "10% off", policy_id: "ithaca-passport", per_user_limit: 1 }],
  });
  bank(b, 8);
  const rewards = b.rpc.issue_my_rewards();
  assert.equal(spend(b, rewards[0].id, U_TEA).ok, true);
  const second = spend(b, rewards[1].id, U_TEA);
  assert.equal(second.ok, false);
  assert.equal(second.reason, "failed_capped");
  assert.equal(b.db.rewards.filter((x) => x.status === "redeemed").length, 1);
});

test("a pilot-wide cap is enforced across users", () => {
  const b = backend({
    policies: [{ id: "ithaca-passport", kind: "global_passport", required_minutes: 240 }],
    partners: [{ id: U_TEA, name: "U Tea", offer_text: "10% off", policy_id: "ithaca-passport", pilot_cap: 1 }],
  });
  bank(b, 4);
  const r1 = b.rpc.issue_my_rewards()[0];
  assert.equal(spend(b, r1.id, U_TEA).ok, true);

  b.setUser("student-2");
  bank(b, 4);
  const r2 = b.rpc.issue_my_rewards()[0];
  assert.equal(spend(b, r2.id, U_TEA).reason, "failed_capped");
});

test("a redemption outside the agreed hours is refused", () => {
  const b = backend({
    policies: [{ id: "ithaca-passport", kind: "global_passport", required_minutes: 240 }],
    partners: [{ id: U_TEA, name: "U Tea", offer_text: "10% off", policy_id: "ithaca-passport",
                 valid_from_minute: 14 * 60, valid_to_minute: 17 * 60 }],
  });
  const r = earnOne(b);
  const d = new Date(b.now());
  d.setHours(9, 0, 0, 0);                       // 9am local, outside the 2-5pm window
  b.setNow(d.getTime());
  // A window refusal has its own reason now. It used to report failed_capped,
  // which pointed whoever read the log at caps rather than at the clock.
  assert.equal(spend(b, r.id, U_TEA).reason, "failed_outside_window");
  assert.equal(b.db.rewards[0].status, "issued");
  d.setHours(15, 0, 0, 0);
  b.setNow(d.getTime());
  assert.equal(spend(b, r.id, U_TEA).ok, true);
});

// ── another account's reward ─────────────────────────────────────────────────
test("a reward id belonging to someone else cannot be spent", () => {
  // Signed OUT there is nothing to test at this layer: redeem_reward raises
  // 28000 on a null auth.uid() (pinned in reward-helper-privileges-sql.test.js)
  // and is granted to `authenticated` only, never anon (pinned in
  // reward-cap-concurrency-sql.test.js). Signed IN as somebody else is the case
  // the ledger has to answer, and its answer must be indistinguishable from a
  // reward that does not exist. "Already redeemed" would confirm that a guessed
  // id belongs to a real account.
  const b = backend();
  const r = earnOne(b);
  b.setUser("attacker");
  const bad = spend(b, r.id, U_TEA);
  assert.equal(bad.ok, false);
  assert.equal(bad.reason, "failed_not_found");
  assert.deepEqual(Object.keys(bad), ["ok", "reason"], "and it tells them nothing else");
  assert.equal(b.db.rewards[0].status, "issued", "someone else's tap spends nothing");
});

// ── the refusal ladder ───────────────────────────────────────────────────────
// There used to be two entry points, a read-only check_code and the spend, and a
// test that the two agreed on every reason, because a cashier finding out in
// front of a queue was the failure mode. There is one entry point now, so what is
// worth pinning is different: every reason in the ladder is still REACHABLE, a
// refusal never moves a reward, and a refusal says nothing but the reason.
test("every refusal reason is reachable, spends nothing, and leaks nothing", () => {
  const ladder = [
    ["failed_not_found", (b, r) => ({ reward_id: uuid(), partner_id: U_TEA })],
    ["failed_partner_paused", (b, r) => {
      b.db.partners.get(U_TEA).active = false;
      return { reward_id: r.id, partner_id: U_TEA };
    }],
    ["failed_already_redeemed", (b, r) => {
      r.status = "redeemed";
      return { reward_id: r.id, partner_id: U_TEA };
    }],
    ["failed_expired", (b, r) => {
      r.expires_at = b.now() - 1000;
      return { reward_id: r.id, partner_id: U_TEA };
    }],
    ["failed_wrong_partner", (b, r) => {
      r.partner_id = DREAM;                      // scoped to the other shop
      return { reward_id: r.id, partner_id: U_TEA };
    }],
    ["failed_offer_changed", (b, r) => {
      r.offer_version = 1;
      b.db.partners.get(U_TEA).offer_version = 2;
      return { reward_id: r.id, partner_id: U_TEA };
    }],
    ["failed_capped", (b, r) => {
      // A cap value a shop could really be configured with (reward-config.js
      // allows 1..1000), with the one drink it allows already collected here.
      b.db.partners.get(U_TEA).per_user_limit = 1;
      b.db.rewards.push(Object.assign({}, r, { id: uuid(), seq: 99, status: "redeemed",
        redeemed_at: b.now(), redeemed_partner_id: U_TEA }));
      return { reward_id: r.id, partner_id: U_TEA };
    }],
    ["failed_outside_window", (b, r) => {
      // The day-of-week half of the window, which the hours test does not reach:
      // a shop that only honours the offer tomorrow.
      const tomorrow = (new Date(b.now()).getDay() + 1) % 7;
      b.db.partners.get(U_TEA).valid_days = [tomorrow];
      return { reward_id: r.id, partner_id: U_TEA };
    }],
  ];

  const seen = [];
  for (const [expected, arrange] of ladder) {
    const b = backend();
    const r = earnOne(b);
    const args = arrange(b, r);
    const before = b.db.rewards.filter((x) => x.status === "redeemed").length;
    const res = b.rpc.redeem_reward(args);
    assert.equal(res.ok, false, expected + ": must refuse");
    assert.equal(res.reason, expected);
    assert.deepEqual(Object.keys(res), ["ok", "reason"], expected + ": refusals carry the reason only");
    assert.equal(b.db.rewards.filter((x) => x.status === "redeemed").length, before,
                 expected + ": a refusal must not spend");
    seen.push(expected);
  }
  assert.deepEqual(seen.slice().sort(), REASONS.slice().sort(),
                   "the ladder is exactly these reasons, no more and no fewer");
});

test("a refusal never carries the shop's wording or cashier note", () => {
  // redeem_by_code answered a refusal with partner_name and offer_text attached,
  // so a stranger's tap read back a shop's terms. Tightened deliberately in
  // 1.2.0: the client already holds the wording it needs from its local snapshot,
  // and a tap that was never valid here is owed nothing.
  const b = backend();
  const r = earnOne(b);
  b.db.partners.get(U_TEA).active = false;
  const bad = spend(b, r.id, U_TEA);
  assert.deepEqual(Object.keys(bad), ["ok", "reason"]);
  for (const leak of ["partner_name", "offer_text", "cashier_note", "bar_minutes"]) {
    assert.equal(bad[leak], undefined, "a refusal must not carry " + leak);
  }
});

// ── the merchant report ──────────────────────────────────────────────────────
test("the pilot report counts redemptions, unique and repeat redeemers", () => {
  const b = backend();
  // one student redeems twice
  bank(b, 8);
  const mine = b.rpc.issue_my_rewards();
  for (const r of mine) {
    spend(b, r.id, U_TEA);
    b.advance(10 * MIN);
  }
  // a second student redeems once
  b.setUser("student-2");
  bank(b, 4);
  const theirs = b.rpc.issue_my_rewards()[0];
  spend(b, theirs.id, U_TEA);

  const rep = b.rpc.partner_report({ partner_id: U_TEA, days: 30 });
  assert.equal(rep.redemptions, 3);
  assert.equal(rep.unique_redeemers, 2);
  assert.equal(rep.repeat_redeemers, 1);
  assert.equal(rep.offer_text, "10% off your drink");
  assert.ok(rep.first_redemption <= rep.last_redemption);
});

test("the pilot report counts rejected attempts with their reasons", () => {
  const b = backend();
  const r = earnOne(b);
  spend(b, r.id, U_TEA);
  spend(b, r.id, U_TEA);          // already redeemed
  spend(b, r.id, U_TEA);          // and again
  const rep = b.rpc.partner_report({ partner_id: U_TEA, days: 30 });
  assert.equal(rep.redemptions, 1);
  const already = rep.rejected.find((x) => x.reason === "failed_already_redeemed");
  assert.equal(already.n, 2);
});

test("the pilot report exposes no revenue, order value or first-visit claim", () => {
  // These are the four things the merchant one-pager must never promise, because
  // the product has never collected any of them.
  const b = backend();
  const r = earnOne(b);
  spend(b, r.id, U_TEA);
  const rep = b.rpc.partner_report({ partner_id: U_TEA, days: 30 });
  const keys = Object.keys(rep).join(" ");
  for (const forbidden of ["revenue", "sales", "order_value", "first_visit", "roi", "incremental"]) {
    assert.ok(keys.indexOf(forbidden) < 0, "report must not claim " + forbidden);
  }
});

test("an empty report is zeroes, not an error", () => {
  const b = backend();
  const rep = b.rpc.partner_report({ partner_id: DREAM, days: 30 });
  assert.equal(rep.redemptions, 0);
  assert.equal(rep.unique_redeemers, 0);
  assert.equal(rep.repeat_redeemers, 0);
  assert.deepEqual(rep.by_day, []);
});

// ── the offer wording is snapshotted, not joined ─────────────────────────────
// The pilot report promises a shop "the exact wording that was running when each
// redemption happened". partners.offer_text is mutable and holds only TODAY's
// wording, so a report built by joining to it would silently relabel every
// historical redemption with the current offer. That is a promise to a business
// that the schema has to actually keep.
test("a redemption records the offer wording that was honoured", () => {
  const b = backend();
  const r = earnOne(b);
  spend(b, r.id, U_TEA);
  assert.equal(b.db.rewards[0].redeemed_offer_text, "10% off your drink");
  assert.equal(b.db.rewards[0].redeemed_offer_version, 1);
});

test("changing the offer does not rewrite what past redemptions honoured", () => {
  const b = backend();
  bank(b, 8);
  const rewards = b.rpc.issue_my_rewards();
  spend(b, rewards[0].id, U_TEA);

  // The shop changes its offer and bumps the version.
  const p = b.db.partners.get(U_TEA);
  p.offer_text = "free topping";
  p.offer_version = 2;
  b.advance(24 * HOUR);

  // A passport reward carries no offer version of its own, so pin the second one
  // to v2 to make this the same shape as a reward earned after the change.
  b.db.rewards[1].offer_version = 2;
  spend(b, rewards[1].id, U_TEA);

  const rep = b.rpc.partner_report({ partner_id: U_TEA, days: 30 });
  assert.equal(rep.redemptions, 2);
  assert.equal(rep.offers_honoured.length, 2, "two distinct offers were honoured");
  const texts = rep.offers_honoured.map((x) => x.offer_text);
  assert.ok(texts.includes("10% off your drink"), "the OLD wording survives the change");
  assert.ok(texts.includes("free topping"));
  assert.equal(rep.offers_honoured.find((x) => x.offer_text === "free topping").n, 1);
});
