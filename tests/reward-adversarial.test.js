// Reward V2, red-teamed. Every test here is an attack, not a feature check.
//
// The other three tests/reward-*.test.js files ask "does the contract do what it
// says". This one asks "what can a student, a friend of a student, a bored script
// or a mistyped config get out of it that nobody agreed to". A real business pays
// when one of these is wrong, so the bar is: interleave the calls in orders no
// honest client would ever produce, and see what survives.
//
// SAME HONEST SCOPE as the other three: these run against reward-mock.js, the
// reference implementation of the contract in supabase-reward-v2.sql. Passing
// proves the CONTRACT. It does not execute the Postgres. Where a finding also
// exists in the SQL (or exists ONLY in the SQL, or only in the mock), the test
// comment says so with the section it lives in, so the two can be read together.
//
// ── HOW TO READ THIS FILE ────────────────────────────────────────────────────
// Tests whose NAME still carries `FINDING N` document behaviour that is CURRENTLY
// WRONG. They are green because they assert what the code really does today, not
// what it should do. Do not "fix the test" if one starts failing after a change to
// the contract: a red FINDING test means somebody closed the hole, and the right
// move is to rewrite the assertion to the new, better behaviour, rename the test
// to the invariant it now defends, and strike the finding here — keeping the
// finding number in the test's comment so the history stays traceable.
//
// ── WHAT 1.2.0 DID TO THIS FILE ──────────────────────────────────────────────
// The six-character cashier handoff is gone: open_redemption, check_code and
// redeem_by_code went with the redemption_handoffs table and the cashier page, and
// public.redeem_reward(reward_id, partner_id) is the only consuming call left. It
// is authenticated-only, and rendering the card now touches no server at all.
//
// Whole attacks in here existed ONLY because a code existed: a five-minute window
// a reward could die inside, two screens both reading VALID, a code colliding with
// a consumed row, the read-only check disagreeing with the spend. Those are struck.
// Every attack that was about the REWARD — caps, windows, the wrong shop, a paused
// shop, a reworded offer, expiry, ownership, double spend — survives here re-aimed
// at redeem_reward, because not one of them ever depended on the code.
//
// And the merge OPENS surface, which is the more interesting half. The tap now
// carries a reward id and a partner id, both attacker-chosen, over the caller's own
// authenticated session. Ownership and the shop match are the only things between
// a signed-in stranger and somebody else's drink, so they are attacked below from
// every direction: a stolen id, an invented id, a friend reading a shared screen, a
// partner id that names another shop, and a partner id that names nothing.
//
// CLOSED since the red-team pass: 1, 4, 5, 6, 7, 8, 9, 10, 11, 13 and 14. Each has
// a test above renamed to the invariant it now defends, keeping its finding number
// in the comment so the history stays traceable.
//
// STRUCK BY THE MERGE rather than fixed: 12 (a handoff code colliding with a
// consumed row) and 15 (the read-only check disagreeing with the spend). Both were
// properties of the code table. There is no code table. Finding 15's successor is
// the completeness guard in section 5: one refusal ladder, all eight reasons.
//
// STILL OPEN. All three are BUSINESS CALLS, not code defects, which is why they are
// still here: closing any one of them decides something about the product that is
// not mine to decide. Each has a green test asserting the true current behaviour,
// so closing one will turn its test red on purpose.
//
//   FINDING 2  a passport reward carries offer_version NULL of its own, so it is
//              honoured at whatever wording the shop's row says AT THE TAP. The
//              mid-handoff half of this finding is not so much fixed as gone: the
//              shop row is read under the same lock as the write, so there is no
//              gap left for a reword to land in. What survives is the original
//              question. A global passport promises "a perk at any partner", not
//              "this exact perk". If that is the intent, this is correct behaviour
//              and not a bug. If a passport should freeze the wording it was earned
//              against, issue_my_rewards has to record a version, and then it needs
//              a shop, which a passport does not have until the tap. That is a
//              product decision.
//
//   FINDING 3  a shop joining a passport policy is instantly liable for every
//              reward every existing user has already banked. There is no join
//              date on either side, so a shop signing on a Tuesday can be handed a
//              stack of rewards earned over months by students who have never
//              walked in. pilot_cap is the brake, and it now genuinely holds
//              (FINDING 1). THE QUESTION: should a new partner inherit the
//              backlog, or only rewards earned after it joined? Inheriting is
//              friendlier to students and riskier for the shop. It is the same
//              decision as global_passport vs partner_specific, which is
//              LEDGER.md's open decision 1, and it should be answered once.
//
//   FINDING 16 FOUND BY THIS SUITE DURING THE MERGE, AND FIXED. The first version
//              of redeem_reward logged every refusal against the partner the tap
//              named, including a refusal for a reward id that resolved to nothing,
//              so a signed-in account could push failed_not_found rows into one
//              shop's rejection list by tapping garbage at it. Nothing of value
//              moved, but the merchant report is the one artifact a shop is handed
//              as a factual account of its own counter. A refusal is now attributed
//              to a shop only when the tap actually reached one of its offers;
//              unresolvable taps are still logged, with no partner attached.
//
// HOW TO READ A RED TEST HERE: a failing test in this file usually means somebody
// CLOSED a hole, not that they broke something. Do not "fix the test" by weakening
// the attack. Rewrite the assertion to the new, better behaviour, rename the test
// to the invariant it now defends, keep the finding number in the comment, and
// move it from STILL OPEN to CLOSED above.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { createBackend, uuid } = require("../reward-mock.js");
const RC = require("../reward-config.js");
// The REAL file, so any hardening here is checked against the two shops that
// actually signed before it is checked against anything invented.
const LIVE_PARTNERS = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "partners.json"), "utf8"));
// Read for ONE assertion, in the racing test below. reward-mock.js is
// single-threaded, so it cannot execute the thing that decides a real race; the
// conditional UPDATE that does is a database guarantee and lives only here.
const REWARD_SQL = fs.readFileSync(
  path.join(__dirname, "..", "supabase-reward-v2.sql"), "utf8");

const T0 = Date.UTC(2026, 7, 12, 14, 0, 0);   // 2026-08-12 14:00 UTC, a Wednesday
const MIN = 60000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const U_TEA = "u-tea-collegetown";
const DREAM = "dream-tea-poke-ithaca";

// The two shops that actually signed. Their real offers, verbatim. A test that
// invents a third discount is a test that teaches the wrong number to whoever
// reads it next, so fictional shops here are named obviously fictional.
const PASSPORT = () => ({
  policies: [{ id: "ithaca-passport", kind: "global_passport", required_minutes: 240 }],
  partners: [
    { id: U_TEA, name: "U Tea", offer_text: "10% off your drink", policy_id: "ithaca-passport" },
    { id: DREAM, name: "Dream Tea & Poké", offer_text: "5% off your drink", policy_id: "ithaca-passport" },
  ],
});

const PARTNER_ONLY = () => ({
  policies: [{ id: "u-tea-only", kind: "partner_specific", required_minutes: 240, partner_id: U_TEA }],
  partners: [{ id: U_TEA, name: "U Tea", offer_text: "10% off your drink", policy_id: "u-tea-only" }],
});

function backend(cfg) {
  const b = createBackend({ now: T0 });
  b.loadConfig(cfg || PASSPORT());
  return b;
}

/** Jump the settable clock to 01:00 local tomorrow, to clear the 720/day ceiling. */
function nextDay(b) {
  const d = new Date(b.now());
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  d.setHours(1, 0, 0, 0);
  b.setNow(d.getTime());
}

/**
 * Credit EXACTLY `total` eligible minutes using honest, non-overlapping sessions.
 *
 * Chunked so it never trips a limit it is not testing: 480 is the per-session
 * ceiling, 720 the daily one, and 5 the floor below which a session is abandoned.
 * That last one is the trap: a naive loop that takes 480 out of 481 leaves a
 * 1-minute stub, the stub is abandoned, and the test silently measures 480.
 */
function creditMinutes(b, total) {
  let left = total;
  let usedToday = 0;
  while (left > 0) {
    if (usedToday >= 720) { nextDay(b); usedToday = 0; continue; }
    let take = Math.min(left, 480, 720 - usedToday);
    if (left - take > 0 && left - take < 5) take = left - 5;
    if (take < 5) { nextDay(b); usedToday = 0; continue; }
    const id = uuid();
    b.rpc.start_reward_session({ session_id: id, planned_minutes: take, platform: "ios" });
    b.advance(take * MIN);
    const done = b.rpc.complete_reward_session({ session_id: id });
    left -= done.credited_minutes;
    usedToday += done.credited_minutes;
  }
}

/** Bank `n` whole thresholds' worth of minutes and issue. */
function earn(b, thresholds, bar) {
  creditMinutes(b, (bar || 240) * (thresholds || 1));
  return b.rpc.issue_my_rewards();
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. SEQUENCE AND TOCTOU
// Calls in orders no honest client produces.
// ═════════════════════════════════════════════════════════════════════════════

test("a completion that lands before its start is refused, and the later start still works", () => {
  // Out-of-order delivery on a flaky network. The completion must not conjure a
  // session row, because a conjured row would have no server start time to
  // measure elapsed wall clock against.
  const b = backend();
  const id = uuid();
  const early = b.rpc.complete_reward_session({ session_id: id });
  assert.equal(early.ok, false);
  assert.equal(early.reason, "no_such_session");
  assert.equal(b.db.sessions.size, 0, "a stray completion must not create a session");
  assert.equal(b.rpc.start_reward_session({ session_id: id, planned_minutes: 60, platform: "ios" }).ok, true);
});

test("a reward minted between the card opening and the tap is not the one spent", () => {
  // Issue lands BETWEEN the card being rendered and the tap. A redemption is
  // addressed by reward id, so the tap must consume the id the card was built from
  // and leave the new one in hand. This attack used to ride a live handoff code;
  // the code is gone and the id it named is passed directly now, which is the same
  // attack with one fewer indirection.
  //
  // The second reward has to be REAL for this to test anything. It comes from a
  // second honest 240 minutes banked but not yet issued when the card opens, so
  // issue_my_rewards mints it while the student is still walking to the counter.
  // (This setup used to lower the policy bar to 120 to conjure the extra reward out
  // of the same 240 minutes. That was FINDING 4 and it is fixed, so it conjures
  // nothing now.)
  const b = backend();
  const first = earn(b, 1)[0];
  creditMinutes(b, 240);                                         // banked, deliberately not issued yet
  const held = first.id;                                         // what the open card is holding
  assert.equal(b.db.events.length, 0,
    "openRedeem makes no network call, so there is no pre-tap server state to race");
  const all = b.rpc.issue_my_rewards();                          // a second reward appears
  assert.equal(all.length, 2, "the setup needs a genuinely new reward mid-walk");
  b.advance(MIN);
  assert.equal(b.rpc.redeem_reward({ reward_id: held, partner_id: U_TEA }).ok, true);
  assert.equal(b.db.rewards.filter((r) => r.status === "redeemed").length, 1);
  assert.equal(b.db.rewards.filter((r) => r.status === "issued").length, 1);
  assert.equal(b.db.rewards.find((r) => r.status === "redeemed").id, first.id,
    "the tap spent the reward the card named, not the one minted after it");
});

test("one reward tapped at two shops still buys exactly one drink", () => {
  // The queue-jumping attack: get two counters to honour one reward. It used to
  // need two live codes and two baristas looking at a valid screen at the same
  // instant; now the app can simply be pointed at the second shop after the first
  // tap, which is easier to do by accident, not harder. Exactly one spend may win.
  const b = backend();
  const r = earn(b, 1)[0];
  assert.equal(b.rpc.redeem_reward({ reward_id: r.id, partner_id: U_TEA }).ok, true);
  const second = b.rpc.redeem_reward({ reward_id: r.id, partner_id: DREAM });
  assert.equal(second.ok, false);
  assert.equal(second.reason, "failed_already_redeemed");
  assert.deepEqual(Object.keys(second).sort(), ["ok", "reason"],
    "and the second shop's own wording is not read back to a tap it refused");
  assert.equal(b.db.rewards.filter((r2) => r2.status === "redeemed").length, 1);
  assert.equal(b.db.rewards[0].redeemed_partner_id, U_TEA, "the first shop is the one on the ledger");
});

test("eight racing taps of one reward, alternating shops, resolve to one redemption", () => {
  // Two taps landing in the same instant is exactly what the conditional UPDATE is
  // for: `where r.id = ... and r.status = 'issued'` with `get diagnostics row_count`
  // deciding which caller actually wrote (supabase-reward-v2.sql section 9; the
  // status re-read in reward-mock.js redeemReward). Eight of them, alternating
  // shops, so a per-partner lock cannot be what is saving it.
  const b = backend();
  const r = earn(b, 1)[0];
  const shops = [U_TEA, DREAM, U_TEA, DREAM, U_TEA, DREAM, U_TEA, DREAM];
  const results = shops.map((partner_id) => b.rpc.redeem_reward({ reward_id: r.id, partner_id }));
  assert.equal(results.filter((x) => x.ok).length, 1);
  assert.equal(results.filter((x) => x.reason === "failed_already_redeemed").length, 7,
    "every loser is told the same true thing, not a different story per shop");
  assert.equal(b.db.rewards.filter((x) => x.status === "redeemed").length, 1);

  // HONEST SCOPE, and it is worth being blunt about here of all places: the eight
  // taps above ran one after another, because JS is single-threaded. The mock
  // re-reads the status before writing purely to MIRROR the SQL, and deleting that
  // re-read does not redden a single test in this file, because validateFor has
  // already seen 'redeemed' by then. Eight genuinely simultaneous taps are decided
  // by Postgres, so the guarantee is asserted against the statement that carries
  // it: the write is conditional on the row still being 'issued', and row_count
  // tells the loser it lost.
  const spend = REWARD_SQL.slice(
    REWARD_SQL.indexOf("create or replace function public.redeem_reward("));
  assert.match(spend, /update\s+public\.reward_instances\s+r[\s\S]*?where\s+r\.id\s*=\s*p_reward_id\s+and\s+r\.status\s*=\s*'issued'/i,
    "the spend must be conditional on the reward still being issued");
  assert.match(spend, /get\s+diagnostics\s+v_hit\s*=\s*row_count[\s\S]*?if\s+v_hit\s*=\s*0\s+then[\s\S]*?'failed_already_redeemed'/i,
    "and the caller that wrote nothing must be told it redeemed nothing");
});

test("a reward that expires between the card opening and the tap is refused at the counter", () => {
  // The card is rendered from the local partner snapshot with no network call, so
  // it can sit on a screen in a queue while the reward behind it dies. The tap is
  // the only thing that talks to the server, so the tap is where expiry has to be
  // caught. (Before 1.2.0 the same test read "the handoff code is only five minutes
  // old and perfectly valid; the reward behind it is not".)
  const b = backend({
    policies: [{ id: "short", kind: "global_passport", required_minutes: 240, expires_days: 1 }],
    partners: [{ id: U_TEA, name: "U Tea", offer_text: "10% off your drink", policy_id: "short" }],
  });
  const r = earn(b, 1, 240)[0];
  assert.ok(r.expires_at, "the setup needs an expiring policy");
  b.setNow(r.expires_at - 60000);                       // one minute of life left, card goes on screen
  b.advance(2 * MIN);                                   // the queue is slow and the reward dies in it
  const late = b.rpc.redeem_reward({ reward_id: r.id, partner_id: U_TEA });
  assert.equal(late.ok, false);
  assert.equal(late.reason, "failed_expired");
  assert.equal(b.db.rewards[0].status, "issued", "a refusal must not burn the reward");
});

test("minutes still inside an unfinished session cannot be spent", () => {
  // Redeem while a second session is mid-flight. An active session has no
  // ended_at and no credited_minutes, so it must contribute nothing until the
  // server has actually seen it close.
  const b = backend();
  creditMinutes(b, 180);
  const id = uuid();
  b.rpc.start_reward_session({ session_id: id, planned_minutes: 60, platform: "ios" });
  b.advance(HOUR);
  assert.equal(b.eligibleMinutes(), 180, "an open session is not credit");
  assert.equal(b.rpc.issue_my_rewards().length, 0, "and it cannot cross a threshold");
  b.rpc.complete_reward_session({ session_id: id });
  assert.equal(b.eligibleMinutes(), 240);
  assert.equal(b.rpc.issue_my_rewards().length, 1);
});

test("a refusal is not sticky: the reward still spends once the reason for it clears", () => {
  // What survives of "a dead code must not be handed back as live". The five-minute
  // code that test was about is gone, so the attack is now the other shape: a
  // refusal must not quietly consume, poison or half-spend the reward, and the same
  // reward id must work again the moment the reason goes away. A shop pausing for
  // an hour must not cost a student the reward.
  const b = backend();
  const r = earn(b, 1)[0];
  b.db.partners.get(U_TEA).active = false;
  assert.equal(b.rpc.redeem_reward({ reward_id: r.id, partner_id: U_TEA }).reason,
    "failed_partner_paused");
  assert.equal(b.rpc.redeem_reward({ reward_id: r.id, partner_id: U_TEA }).reason,
    "failed_partner_paused", "and hammering it changes nothing");
  assert.equal(b.db.rewards[0].status, "issued");

  b.db.partners.get(U_TEA).active = true;
  assert.equal(b.rpc.redeem_reward({ reward_id: r.id, partner_id: U_TEA }).ok, true);
  assert.equal(b.rpc.redeem_reward({ reward_id: r.id, partner_id: U_TEA }).reason,
    "failed_already_redeemed", "and once it is spent it stays spent");
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. IDENTITY
// Switch users between every pair of calls. A refusal must not leak whose it is.
// ═════════════════════════════════════════════════════════════════════════════

test("a stolen reward id and an invented one produce byte-identical refusals", () => {
  // The oracle test, and it matters MORE since 1.2.0 than it did before. The spend
  // is addressed by reward id over the caller's own authenticated session, so
  // naming somebody else's id is the first thing anyone will try. If refusing a
  // real id looked different from refusing a uuid that never existed, an attacker
  // could enumerate which ids are real, and a real id plus a shop name is enough to
  // tell a barista a story.
  const b = backend();
  const r = earn(b, 1)[0];
  b.setUser("attacker");
  const stolen = b.rpc.redeem_reward({ reward_id: r.id, partner_id: U_TEA });
  const invented = b.rpc.redeem_reward({ reward_id: uuid(), partner_id: U_TEA });
  assert.equal(stolen.ok, false);
  assert.deepEqual(stolen, invented, "a real id must be indistinguishable from a fake one");
  assert.equal(stolen.reason, "failed_not_found");
  // And the probe spends nothing: ownership is checked before anything is written
  // (supabase-reward-v2.sql section 9, `if not found or v_r.user_id <> v_me`).
  assert.equal(b.db.rewards[0].status, "issued");
  assert.equal(b.db.rewards[0].user_id, "user-anon-1");
});

test("a refusal carries no shop name or offer text, and a success carries exactly seven fields", () => {
  // The old redeem_by_code answered some refusals with partner_name and offer_text
  // still attached, which handed a shop's wording to a tap that was never valid
  // there. redeem_reward returns the reason and nothing else
  // (supabase-reward-v2.sql section 9, the jsonb_build_object on the refusal path;
  // `return fail(reason)` in reward-mock.js redeemReward), and that tightening is
  // deliberate, so a test asserting the old leak would now be asserting a bug.
  const b = backend();
  const r = earn(b, 1)[0];
  b.setUser("attacker");
  assert.deepEqual(Object.keys(b.rpc.redeem_reward({ reward_id: r.id, partner_id: U_TEA })).sort(),
    ["ok", "reason"], "someone else's reward teaches the attacker nothing about the shop");

  b.setUser("user-anon-1");
  b.db.partners.get(U_TEA).active = false;
  const paused = b.rpc.redeem_reward({ reward_id: r.id, partner_id: U_TEA });
  assert.deepEqual(Object.keys(paused).sort(), ["ok", "reason"], "even our own refusal stays terse");

  // The riskiest refusal of the lot: one that happens AFTER the partner row has
  // been read and locked, so the shop's wording is sitting right there in a
  // variable, one careless jsonb_build_object away from the response.
  b.db.partners.get(U_TEA).active = true;
  b.db.partners.get(DREAM).policy_id = "some-other-policy";
  const wrong = b.rpc.redeem_reward({ reward_id: r.id, partner_id: DREAM });
  assert.equal(wrong.reason, "failed_wrong_partner");
  assert.deepEqual(Object.keys(wrong).sort(), ["ok", "reason"]);
  assert.equal(JSON.stringify(wrong).indexOf("Dream"), -1, "not even the shop's name");

  // The contrast, and the whole input to the share card: a SUCCESS carries the shop
  // details and the minutes, and only those. Nothing here identifies the student.
  const ok = b.rpc.redeem_reward({ reward_id: r.id, partner_id: U_TEA });
  assert.equal(ok.ok, true);
  assert.deepEqual(Object.keys(ok).sort(),
    ["bar_minutes", "cashier_note", "offer_text", "ok", "partner_name", "redeemed_at", "server_time"]);
  assert.equal(ok.partner_name, "U Tea");
  assert.equal(ok.offer_text, "10% off your drink");
  assert.equal(JSON.stringify(ok).indexOf("user-anon-1"), -1);
});

test("another account sees nothing of ours in my_reward_state", () => {
  const b = backend();
  earn(b, 2);
  assert.equal(b.rpc.my_reward_state().rewards.length, 2);
  b.setUser("nosy");
  const theirs = b.rpc.my_reward_state();
  assert.equal(theirs.rewards.length, 0);
  assert.equal(theirs.eligible_minutes, 0);
  assert.equal(JSON.stringify(theirs).indexOf("user-anon-1"), -1, "no other account id leaks");
});

test("switching users between issue and redeem cannot move a reward", () => {
  const b = backend();
  creditMinutes(b, 240);
  b.setUser("attacker");
  assert.equal(b.rpc.issue_my_rewards().length, 0, "our minutes are not theirs to issue against");
  b.setUser("user-anon-1");
  const mine = b.rpc.issue_my_rewards();
  assert.equal(mine.length, 1);
  assert.equal(mine[0].user_id, "user-anon-1");

  // And they cannot spend it either. That half used to be structurally
  // uncheckable, because redeem_by_code was anon and the code was the credential.
  b.setUser("attacker");
  assert.equal(b.rpc.redeem_reward({ reward_id: mine[0].id, partner_id: U_TEA }).reason,
    "failed_not_found");
  assert.equal(b.db.rewards[0].status, "issued");
});

test("a friend who can see the card CANNOT spend it any more, and that is the 1.2.0 change", () => {
  // THIS TEST USED TO ASSERT THE OPPOSITE, and it was right then:
  // supabase-reward-v2.sql's closing block said a live screen share inside the five
  // minutes worked, redeem_by_code was deliberately anon-callable because the
  // cashier has no account and installs nothing, and holding the code WAS the
  // credential. Ownership could not be checked on that path at all.
  //
  // Removing the code made the system stricter, not looser: the spend runs over the
  // owner's own authenticated session and `v_r.user_id <> v_me` is the first thing
  // redeem_reward looks at. Anyone reading a shared screen now sees a card they
  // cannot spend. Pinned here so the inversion is a decision on the record rather
  // than something that quietly happened.
  const b = backend();
  const r = earn(b, 1)[0];
  b.setUser("some-friend");
  const shared = b.rpc.redeem_reward({ reward_id: r.id, partner_id: U_TEA });
  assert.equal(shared.ok, false);
  assert.equal(shared.reason, "failed_not_found");
  assert.equal(b.db.rewards[0].status, "issued", "the owner still has their reward");
  assert.equal(b.db.rewards[0].user_id, "user-anon-1");

  b.setUser("user-anon-1");
  assert.equal(b.rpc.redeem_reward({ reward_id: r.id, partner_id: U_TEA }).ok, true,
    "and the owner can still spend it, so this refuses the friend and not the reward");
  assert.equal(b.db.rewards.filter((x) => x.status === "redeemed").length, 1);
});

test("one account's spend does not touch another account's identical reward", () => {
  const b = backend();
  const mine = earn(b, 1)[0];
  b.setUser("student-2");
  const theirs = earn(b, 1)[0];
  b.setUser("user-anon-1");
  b.rpc.redeem_reward({ reward_id: mine.id, partner_id: U_TEA });
  assert.equal(b.db.rewards.find((r) => r.id === mine.id).status, "redeemed");
  assert.equal(b.db.rewards.find((r) => r.id === theirs.id).status, "issued");
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. ARITHMETIC
// The core invariant first: credited minutes may never exceed real wall clock.
// ═════════════════════════════════════════════════════════════════════════════

test("CORE INVARIANT: no sequence credits more minutes than really elapsed", () => {
  // The one thing a merchant reward absolutely rests on. Six hundred steps of
  // starts, completes, replayed starts, replayed completes and clock jumps, in a
  // deterministic order, with the clock read before and after. Credit that
  // outruns wall clock is a printing press.
  for (const seed0 of [7, 1337, 20260812]) {
    const b = backend();
    const startedAt = b.now();
    const ids = [];
    let seed = seed0;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

    for (let step = 0; step < 600; step++) {
      const pick = Math.floor(rnd() * 5);
      if (pick === 0) {
        const id = uuid();
        ids.push(id);
        b.rpc.start_reward_session({ session_id: id, planned_minutes: 5 + Math.floor(rnd() * 476),
                                     platform: rnd() < 0.85 ? "ios" : "web" });
      } else if (pick === 1 && ids.length) {
        b.rpc.complete_reward_session({ session_id: ids[Math.floor(rnd() * ids.length)] });
      } else if (pick === 2 && ids.length) {
        // A replayed start on an id the server already knows.
        b.rpc.start_reward_session({ session_id: ids[Math.floor(rnd() * ids.length)],
                                     planned_minutes: 480, platform: "ios" });
      } else if (pick === 3 && ids.length) {
        // A replayed completion, sometimes long after the fact.
        b.rpc.complete_reward_session({ session_id: ids[Math.floor(rnd() * ids.length)] });
      } else {
        b.advance(Math.floor(rnd() * 90) * MIN);
      }
    }
    ids.forEach((id) => b.rpc.complete_reward_session({ session_id: id }));

    let credited = 0;
    for (const s of b.db.sessions.values()) if (s.state === "completed") credited += s.credited_minutes || 0;
    const elapsed = Math.floor((b.now() - startedAt) / 60000);
    assert.ok(credited <= elapsed,
      "seed " + seed0 + ": credited " + credited + " minutes against " + elapsed + " real minutes");
    assert.ok(b.eligibleMinutes() <= credited, "eligible minutes cannot exceed credited minutes");
  }
});

test("back-to-back sessions credit the elapsed time exactly, never a minute more", () => {
  // The tightest form of the invariant: no gaps, no overlap, nothing to round up.
  const b = backend();
  const startedAt = b.now();
  for (let i = 0; i < 6; i++) {
    const id = uuid();
    b.rpc.start_reward_session({ session_id: id, planned_minutes: 60, platform: "ios" });
    b.advance(HOUR);
    b.rpc.complete_reward_session({ session_id: id });
  }
  assert.equal(b.eligibleMinutes(), 360);
  assert.equal(Math.floor((b.now() - startedAt) / 60000), 360);
});

test("a session spanning local midnight cannot double-dip the daily ceiling", () => {
  // The ceiling is computed from date_trunc('day', now()) at COMPLETION, so a
  // session that crosses midnight books against the new day. The question is
  // whether that lets 720 plus 720 land inside one real day. It does not: the
  // wall clock still has to pass.
  const b = backend();
  const midnight = new Date(T0);
  midnight.setHours(0, 0, 0, 0);
  b.setNow(midnight.getTime());
  const dayStart = b.now();

  for (let i = 0; i < 12; i++) {                      // 00:00 to 12:00, ceiling reached
    const id = uuid();
    b.rpc.start_reward_session({ session_id: id, planned_minutes: 60, platform: "ios" });
    b.advance(HOUR);
    b.rpc.complete_reward_session({ session_id: id });
  }
  assert.equal(b.eligibleMinutes(), 720);

  b.advance(11 * HOUR);                                // 23:00
  const spanning = uuid();
  b.rpc.start_reward_session({ session_id: spanning, planned_minutes: 120, platform: "ios" });
  b.advance(2 * HOUR);                                 // ends 01:00 the next day
  const done = b.rpc.complete_reward_session({ session_id: spanning });
  assert.equal(done.credited_minutes, 120, "the new day's ceiling is genuinely fresh");
  const elapsed = Math.floor((b.now() - dayStart) / 60000);
  assert.ok(b.eligibleMinutes() <= elapsed,
    "840 minutes of credit needed " + elapsed + " real minutes, which is more than one day");
  assert.ok(elapsed > 1440, "and it took longer than a calendar day to get there");
});

test("the daily ceiling lands exactly on 720 and not one minute past", () => {
  const b = backend();
  const midnight = new Date(T0);
  midnight.setHours(1, 0, 0, 0);
  b.setNow(midnight.getTime());
  let total = 0;
  for (let i = 0; i < 5; i++) {                        // 5 x 180 = 900 attempted
    const id = uuid();
    b.rpc.start_reward_session({ session_id: id, planned_minutes: 180, platform: "ios" });
    b.advance(180 * MIN);
    total += b.rpc.complete_reward_session({ session_id: id }).credited_minutes;
  }
  assert.equal(total, 720);
  assert.equal(b.eligibleMinutes(), 720);
  // The session that hit the wall is still a completed row, credited zero. It must
  // not be an error the client retries, and it must not credit later.
  const capped = Array.from(b.db.sessions.values()).filter((s) => s.credited_minutes === 0);
  assert.equal(capped.length, 1);
  assert.equal(capped[0].state, "completed");
});

test("session duration bounds hold at 4, 5, 480, 720 and 721 real minutes", () => {
  const cases = [[4, 0, "abandoned"], [5, 5, "completed"], [480, 480, "completed"],
                 [720, 480, "completed"], [721, 0, "abandoned"]];
  for (const [elapsed, expectCredit, expectState] of cases) {
    const b = backend();
    const id = uuid();
    b.rpc.start_reward_session({ session_id: id, planned_minutes: 480, platform: "ios" });
    b.advance(elapsed * MIN);
    const done = b.rpc.complete_reward_session({ session_id: id });
    assert.equal(done.state, expectState, elapsed + " elapsed minutes");
    assert.equal(done.credited_minutes, expectCredit, elapsed + " elapsed minutes");
  }
});

test("threshold arithmetic is exact at 239, 240, 241, 479, 480 and 481 minutes", () => {
  const expected = { 239: 0, 240: 1, 241: 1, 479: 1, 480: 2, 481: 2 };
  for (const minutes of Object.keys(expected).map(Number)) {
    const b = backend();
    creditMinutes(b, minutes);
    assert.equal(b.eligibleMinutes(), minutes, "setup must bank exactly " + minutes);
    assert.equal(b.rpc.issue_my_rewards().length, expected[minutes],
      minutes + " minutes at a 240-minute bar");
  }
});

test("a server clock that jumps backwards abandons the session instead of crediting it", () => {
  // Not an attack a client can mount, but an NTP correction is real, and a
  // negative elapsed must never become negative credit or an exception.
  const b = backend();
  const id = uuid();
  b.rpc.start_reward_session({ session_id: id, planned_minutes: 60, platform: "ios" });
  b.setNow(T0 - HOUR);
  const done = b.rpc.complete_reward_session({ session_id: id });
  assert.equal(done.state, "abandoned");
  assert.equal(done.credited_minutes, 0);
  assert.equal(b.eligibleMinutes(), 0);
});

test("a fractional planned_minutes is refused, because the column is an integer", () => {
  // CLOSED — was FINDING 13. reward_sessions.planned_minutes and credited_minutes
  // are `integer` (supabase-reward-v2.sql section 3), but the range check here was
  // Number.isFinite, so 60.7 sailed through and credited 60.7 minutes against a
  // column that cannot hold it.
  //
  // It was never exploitable (credit is least(elapsed, planned) and elapsed is
  // floored, so a fraction could only LOSE the student time). It is closed anyway,
  // so the client can never be written to send a float.
  const b = backend();
  for (const bad of [60.7, 60.0001, 0.5, Math.PI * 20]) {
    const r = b.rpc.start_reward_session({ session_id: uuid(), planned_minutes: bad, platform: "ios" });
    assert.equal(r.ok, false, bad + " must be refused");
    assert.equal(r.reason, "planned_out_of_range");
  }
  // A whole number at the same magnitude is still fine, so this refuses floats
  // and not the value.
  const ok = b.rpc.start_reward_session({ session_id: uuid(), planned_minutes: 61, platform: "ios" });
  assert.equal(ok.ok, true);
  b.advance(90 * MIN);
  const done = b.rpc.complete_reward_session({ session_id: ok.id });
  assert.equal(done.credited_minutes, 61);
  assert.ok(Number.isInteger(done.credited_minutes), "credit is a whole number of minutes");
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. ISSUANCE
// Two rewards for one threshold, or a reward the minutes do not support.
// ═════════════════════════════════════════════════════════════════════════════

test("hammering issue from many directions never mints a second reward for one threshold", () => {
  const b = backend();
  creditMinutes(b, 240);
  for (let i = 0; i < 50; i++) {
    b.rpc.issue_my_rewards();
    b.rpc.my_reward_state();
    if (i % 7 === 0) b.rpc.issue_my_rewards();
  }
  assert.equal(b.db.rewards.length, 1);
  assert.equal(b.db.rewards[0].seq, 1);
});

test("issuing after a redemption does not refill the slot that was spent", () => {
  // The counting rule is "rewards HELD under this policy", and a redeemed reward
  // still counts as held. If it did not, every redemption would immediately mint
  // its own replacement and one threshold would buy unlimited drinks.
  const b = backend();
  const r = earn(b, 1)[0];
  b.rpc.redeem_reward({ reward_id: r.id, partner_id: U_TEA });
  for (let i = 0; i < 10; i++) b.rpc.issue_my_rewards();
  assert.equal(b.db.rewards.length, 1);
  assert.equal(b.db.rewards.filter((x) => x.status === "issued").length, 0);
});

test("a voided reward is not reissued and cannot be spent", () => {
  const b = backend();
  const r = earn(b, 1)[0];
  b.db.rewards[0].status = "void";
  const after = b.rpc.issue_my_rewards();
  assert.equal(after.length, 1, "void still occupies its seq, so no replacement is minted");
  assert.equal(b.rpc.redeem_reward({ reward_id: r.id, partner_id: U_TEA }).reason, "failed_not_found");
});

test("web minutes cannot be laundered into a reward by mixing them with native ones", () => {
  const b = backend();
  for (let i = 0; i < 4; i++) {                       // 240 web minutes
    const id = uuid();
    b.rpc.start_reward_session({ session_id: id, planned_minutes: 60, platform: "web" });
    b.advance(HOUR);
    b.rpc.complete_reward_session({ session_id: id });
  }
  creditMinutes(b, 239);                              // plus 239 native
  assert.equal(b.eligibleMinutes(), 239);
  assert.equal(b.rpc.issue_my_rewards().length, 0, "479 total minutes, 239 of them redeemable");
});

test("lowering a policy's bar cannot re-mint rewards out of minutes already spent", () => {
  // THE ATTACK (was FINDING 4, and it was defect D6 from GROUNDING.md reappearing
  // one layer up): bank 240 minutes, spend the reward at U Tea, then drop the
  // policy bar to 60 the way the founder would after signing a cheaper shop. The
  // old entitlement was recomputed from scratch on every call as
  //     entitled = eligible_minutes / policy.required_minutes
  // with count(*) as the number already held, so the SAME 240 minutes immediately
  // produced three more spendable rewards. U Tea honoured one and owed three.
  //
  // NOW REFUSED. Each reward records bar_minutes, the bar it was actually bought
  // at, and entitlement is (eligible - sum(bar_minutes)) / required
  // (supabase-reward-v2.sql section 7; `spent` in reward-mock.js issueRewards).
  // Every minute is spent exactly once, whatever the bar was at the time.
  const b = backend();
  const r = earn(b, 1)[0];
  b.rpc.redeem_reward({ reward_id: r.id, partner_id: U_TEA });
  assert.equal(b.eligibleMinutes(), 240);

  b.db.policies.get("ithaca-passport").required_minutes = 60;
  const after = b.rpc.issue_my_rewards();
  assert.equal(after.length, 1, "the 240 already-spent minutes carry no second reward");
  assert.equal(after.filter((x) => x.status === "issued").length, 0,
    "nothing new is mintable out of minutes that already bought a drink");

  // Scoping it: the lower bar is not ignored, it just cannot reach backwards.
  // Genuinely unspent minutes still pay out, at the new bar.
  creditMinutes(b, 60);
  const later = b.rpc.issue_my_rewards();
  assert.equal(later.length, 2, "60 fresh minutes at a 60 bar earn one new reward");
  assert.equal(later.filter((x) => x.status === "issued").length, 1);
  assert.equal(b.rpc.issue_my_rewards().length, 2, "and hammering issue adds no more");
});

test("raising a policy's bar never revokes a reward already in hand", () => {
  // The mirror image, and this one is right. A student who banked a reward keeps
  // it. v1 clamped a negative balance to zero and silently erased banked rewards
  // (GROUNDING.md D6); the instance table cannot do that, because a reward is a
  // row and not a subtraction.
  const b = backend();
  const before = earn(b, 1)[0];
  b.db.policies.get("ithaca-passport").required_minutes = 480;
  const after = b.rpc.issue_my_rewards();
  assert.equal(after.length, 1);
  assert.equal(after[0].id, before.id);
  assert.equal(after[0].status, "issued");
  assert.equal(b.rpc.redeem_reward({ reward_id: before.id, partner_id: U_TEA }).ok, true,
    "and it is still spendable at the bar it was earned at");
});

test("a policy added later issues against minutes banked before it existed", () => {
  // Worth knowing before signing shop three: a new policy is retroactive by
  // construction, because eligibility is a running total with no start date.
  const b = backend();
  creditMinutes(b, 480);
  assert.equal(b.rpc.issue_my_rewards().length, 2);
  b.db.policies.set("second-policy", { id: "second-policy", kind: "global_passport",
                                       required_minutes: 240, active: true });
  const after = b.rpc.issue_my_rewards();
  assert.equal(after.filter((r) => r.policy_id === "second-policy").length, 2,
    "the new policy pays out on history from day one");
});

test("the minutes on the share card are the reward's own bar, not today's policy bar", () => {
  // bar_minutes reaches the client exactly once, in the success payload of the one
  // spend (supabase-reward-v2.sql section 9, `'bar_minutes', v_r.bar_minutes`;
  // the same field in reward-mock.js redeemReward), and the share card renders its
  // headline off it. It is read from the REWARD, never from the policy, so a bar
  // that moves cannot retroactively relabel what an old reward was worth: a card
  // claiming one hour of focus for something that took four is a lie a shop's own
  // customers can read.
  //
  // This is also the same defence as FINDING 4 one layer along. That one stopped a
  // lowered bar re-minting rewards; this one stops it rewriting their history.
  const b = backend();
  const r = earn(b, 1)[0];
  assert.equal(r.bar_minutes, 240);
  b.db.policies.get("ithaca-passport").required_minutes = 60;    // the founder signs a cheaper shop
  const spend = b.rpc.redeem_reward({ reward_id: r.id, partner_id: U_TEA });
  assert.equal(spend.ok, true);
  assert.equal(spend.bar_minutes, 240, "the bar this reward was actually bought at");
  assert.ok(Number.isInteger(spend.bar_minutes), "and a whole number of minutes");
  // The client validates this to 15..1440 and drops anything outside, so a bar the
  // config can legally produce has to land inside that range or the share card
  // loses its headline number with no error anywhere.
  assert.ok(spend.bar_minutes >= RC.MIN_BAR && spend.bar_minutes <= RC.MAX_BAR);
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. POLICY CONFUSION
// A reward presented under terms that no longer describe it.
// ═════════════════════════════════════════════════════════════════════════════

test("a passport reward is refused at a shop moved onto a different policy", () => {
  const b = backend();
  const r = earn(b, 1)[0];
  b.db.partners.get(DREAM).policy_id = "some-other-policy";
  const bad = b.rpc.redeem_reward({ reward_id: r.id, partner_id: DREAM });
  assert.equal(bad.ok, false);
  assert.equal(bad.reason, "failed_wrong_partner");
  assert.equal(b.db.rewards[0].status, "issued", "and the refusal did not burn it");
  assert.equal(b.rpc.redeem_reward({ reward_id: r.id, partner_id: U_TEA }).ok, true,
    "the shop still on the policy is unaffected");
});

test("a partner-scoped reward survives its shop being moved to another policy", () => {
  // Defensible, and worth pinning either way: for a partner_specific reward the
  // binding that matters is reward.partner_id, and the policy is never re-read at
  // redemption (supabase-reward-v2.sql section 9, lines 481 to 484). So a shop
  // that renegotiates its terms and moves policy still owes every reward already
  // issued under the old one. Bumping offer_version is the lever that refuses
  // those, and moving policy alone does not bump it.
  const b = backend(PARTNER_ONLY());
  const r = earn(b, 1)[0];
  assert.equal(r.partner_id, U_TEA);
  b.db.partners.get(U_TEA).policy_id = "a-completely-different-policy";
  assert.equal(b.rpc.redeem_reward({ reward_id: r.id, partner_id: U_TEA }).ok, true);
});

test("a partner id that does not match the reward buys nothing, whatever it names", () => {
  // NEW SURFACE IN 1.2.0. The tap carries BOTH ids and both are attacker-chosen, so
  // every way of pairing them has to have an answer. A partner_specific reward is
  // good at its own shop and nowhere else, not even at a shop sharing its policy,
  // and a partner id that names nothing at all must refuse rather than throw or
  // reveal which ids are real. (The mock used to dereference an absent partner and
  // crash the cashier page; see FINDING 5 in section 6.)
  const b = backend({
    policies: [{ id: "u-tea-only", kind: "partner_specific", required_minutes: 240, partner_id: U_TEA }],
    partners: [
      { id: U_TEA, name: "U Tea", offer_text: "10% off your drink", policy_id: "u-tea-only" },
      { id: DREAM, name: "Dream Tea & Poké", offer_text: "5% off your drink", policy_id: "u-tea-only" },
    ],
  });
  const r = earn(b, 1)[0];
  assert.equal(r.partner_id, U_TEA, "the reward is bound to one shop");

  const elsewhere = b.rpc.redeem_reward({ reward_id: r.id, partner_id: DREAM });
  assert.equal(elsewhere.reason, "failed_wrong_partner", "even a shop on the same policy");

  for (const nonsense of ["", "not-a-shop", "__proto__", "constructor", null, undefined, 0]) {
    const out = b.rpc.redeem_reward({ reward_id: r.id, partner_id: nonsense });
    assert.equal(out.ok, false, "partner_id " + String(nonsense) + " must refuse");
    assert.equal(out.reason, "failed_not_found", "and must not say which shops exist");
  }
  for (const nonsense of [null, undefined, "", "__proto__", 0, {}]) {
    const out = b.rpc.redeem_reward({ reward_id: nonsense, partner_id: U_TEA });
    assert.equal(out.ok, false, "reward_id " + String(nonsense) + " must refuse");
    assert.equal(out.reason, "failed_not_found");
  }

  assert.equal(b.db.rewards[0].status, "issued", "nothing was burned along the way");
  assert.equal(b.rpc.redeem_reward({ reward_id: r.id, partner_id: U_TEA }).ok, true,
    "and the one correct pairing still works");
});

test("a retired policy is still honoured, and a held reward can still describe itself", () => {
  // CLOSED — was FINDING 6. Retiring a policy stops issuance (correct) but not
  // redemption, which is the kind thing to do for a reward someone already earned.
  // The problem was the second half: my_reward_state filtered policies to
  // `where active`, so the client was handed a live, spendable reward whose policy
  // it could not look up, and so could not render its bar, its expiry rule or its
  // name. There was no "retired but honoured" state.
  //
  // my_reward_state now returns active policies PLUS any policy a reward still in
  // hand was issued under, and marks each with its own active flag.
  const b = backend();
  const r = earn(b, 1)[0];
  b.db.policies.get("ithaca-passport").active = false;

  const state = b.rpc.my_reward_state();
  assert.equal(state.rewards.length, 1, "the reward is still listed");
  assert.equal(state.policies.length, 1, "and its policy comes with it, so it can be described");
  assert.equal(state.policies[0].id, "ithaca-passport");
  assert.equal(state.policies[0].active, false, "flagged retired, so the UI can say so");
  assert.equal(state.policies[0].required_minutes, 240, "the bar is still readable");
  assert.equal(b.rpc.issue_my_rewards().length, 1, "no NEW rewards are issued");

  assert.equal(b.rpc.redeem_reward({ reward_id: r.id, partner_id: U_TEA }).ok, true,
    "and the held reward is still spendable at the counter");

  // Once it is spent, the retired policy drops out again: nothing is held under it.
  assert.equal(b.rpc.my_reward_state().policies.length, 0);
});

test("STILL OPEN — FINDING 2: a passport reward is honoured at whatever the offer says at the tap", () => {
  // THIS IS THE HALF OF FINDING 2 THAT SURVIVED THE MERGE, so the test still
  // asserts the behaviour as it stands today.
  //
  // The original finding: issue_my_rewards only records an offer_version when the
  // POLICY names a partner (supabase-reward-v2.sql section 7), so every
  // global_passport reward is issued with offer_version NULL and every version
  // check is guarded by `if offer_version is not null`. The check is dead code
  // under the passport model.
  //
  // WHAT USED TO PATCH IT: the handoff pinned the shop's offer_version at open, so
  // a reword landing DURING the five minutes was caught. That mechanism is gone
  // with the handoff, and it is not missed, because the gap it covered is gone too:
  // the shop row is read under the same lock as the write. What it never covered,
  // and what is still true, is a reword landing BEFORE the tap.
  //
  // So U Tea changes its offer, bumps offer_version to be careful, and every reward
  // every student is already holding is honoured at the NEW wording. Below, a
  // reward earned when the offer read "10% off your drink" is spent as "one free
  // large drink" and the ledger records the shop as having agreed to give one away.
  //
  // Whether that is a HOLE or the intended meaning of a passport is a business
  // question, not a code one: a passport promises "a perk at any partner", not
  // "this exact perk". It is recorded here either way, and it matters NOW, because
  // global_passport is one of the two models the founder is being asked to choose
  // between (docs/network-v1/LEDGER.md, open decision 1) and the one matching v1.
  const b = backend();
  const r = earn(b, 1)[0];
  assert.equal(r.offer_version, null, "the passport reward carries no version of its own");

  const uTea = b.db.partners.get(U_TEA);
  uTea.offer_text = "one free large drink";
  uTea.offer_version = 9;

  const spend = b.rpc.redeem_reward({ reward_id: r.id, partner_id: U_TEA });
  assert.equal(spend.ok, true, "nothing on the reward can refuse a version it never recorded");
  assert.equal(b.db.rewards[0].redeemed_offer_text, "one free large drink",
    "the shop is recorded as honouring an offer this reward never earned");
  assert.equal(b.db.rewards[0].redeemed_offer_version, 9);

  // The contrast that proves it is the passport model and not a general failure:
  // the identical move under a partner_specific policy is correctly refused.
  const p = backend(PARTNER_ONLY());
  const pr = earn(p, 1)[0];
  assert.equal(pr.offer_version, 1);
  p.db.partners.get(U_TEA).offer_version = 2;
  assert.equal(p.rpc.redeem_reward({ reward_id: pr.id, partner_id: U_TEA }).reason,
    "failed_offer_changed");
  assert.equal(p.db.rewards[0].status, "issued", "and the student keeps the reward");
});

test("what is honoured is the wording read at the tap, never the wording the card showed", () => {
  // The half of FINDING 2 that IS closed, and 1.2.0 closed it by construction
  // rather than by pinning. The handoff used to snapshot the shop's offer_version
  // at open so the spend could compare against it. There is no gap left to snapshot
  // across: the partner row is read FOR UPDATE in the same transaction that writes
  // (supabase-reward-v2.sql section 9), so the wording honoured is by construction
  // the wording current at the tap.
  //
  // Why it still needs a test, and a sharper one than before: openRedeem() renders
  // the card from the LOCAL partner snapshot with zero network calls, so the perk
  // on screen can be hours or days stale. What the shop is recorded as having
  // honoured, and what the client is handed to put on the share card, must both
  // come from the server read. Neither may come from the card.
  const b = backend();
  const r = earn(b, 1)[0];
  const cardSaid = b.db.partners.get(U_TEA).offer_text;      // what the student is looking at
  assert.equal(cardSaid, "10% off your drink");

  const uTea = b.db.partners.get(U_TEA);
  uTea.offer_text = "one free large drink";
  uTea.offer_version = 9;

  const spend = b.rpc.redeem_reward({ reward_id: r.id, partner_id: U_TEA });
  assert.equal(spend.ok, true);
  assert.equal(spend.offer_text, "one free large drink", "the payload is the wording at the tap");
  assert.notEqual(spend.offer_text, cardSaid, "and never the stale wording the card was built from");
  assert.equal(spend.partner_name, "U Tea");
  // The ledger and the payload have to agree, or the shop's report and the
  // student's share card describe two different drinks.
  assert.equal(b.db.rewards[0].redeemed_offer_text, spend.offer_text);
  assert.equal(b.db.rewards[0].redeemed_offer_version, uTea.offer_version);
});

test("every refusal the contract documents is reachable, and no retired one is", () => {
  // CLOSED BY REMOVAL — was FINDING 15. The finding was that check_code, the
  // read-only cashier peek, had not learned three refusals redeem_by_code had, so
  // the verification page read VALID on cards the spend was about to refuse and the
  // cashier found out in front of a queue. Both functions are gone. There is one
  // consuming call and no second surface left to disagree with it, which is a
  // better fix than parity ever was.
  //
  // What replaces the parity guard is a COMPLETENESS guard, because the failure it
  // was really protecting against is a refusal nobody has thought about. These
  // eight reasons are the whole documented set: each one is reachable, each one is
  // terse, and none of them changes what the reward is worth. A ninth reason
  // appearing without a test here is what this is watching for, and the two
  // code-era reasons must never come back at all.
  const CAPPED = {
    policies: [{ id: "ithaca-passport", kind: "global_passport", required_minutes: 240 }],
    partners: [{ id: U_TEA, name: "U Tea", offer_text: "10% off your drink",
                 policy_id: "ithaca-passport", per_user_limit: 1 }],
  };
  const WINDOWED = {
    policies: [{ id: "ithaca-passport", kind: "global_passport", required_minutes: 240 }],
    partners: [{ id: U_TEA, name: "U Tea", offer_text: "10% off your drink", policy_id: "ithaca-passport",
                 valid_from_minute: 14 * 60, valid_to_minute: 17 * 60 }],
  };
  const EXPIRING = {
    policies: [{ id: "short", kind: "global_passport", required_minutes: 240, expires_days: 1 }],
    partners: [{ id: U_TEA, name: "U Tea", offer_text: "10% off your drink", policy_id: "short" }],
  };

  const cases = [
    ["failed_not_found", () => {                       // a reward that is not the caller's
      const b = backend();
      const r = earn(b, 1)[0];
      b.setUser("attacker");
      return [b, r.id, U_TEA];
    }],
    ["failed_partner_paused", () => {
      const b = backend();
      const r = earn(b, 1)[0];
      b.db.partners.get(U_TEA).active = false;
      return [b, r.id, U_TEA];
    }],
    ["failed_already_redeemed", () => {
      const b = backend();
      const r = earn(b, 1)[0];
      b.rpc.redeem_reward({ reward_id: r.id, partner_id: U_TEA });
      return [b, r.id, U_TEA];
    }],
    ["failed_expired", () => {
      const b = backend(EXPIRING);
      const r = earn(b, 1)[0];
      b.setNow(r.expires_at + MIN);
      return [b, r.id, U_TEA];
    }],
    ["failed_wrong_partner", () => {
      const b = backend();
      const r = earn(b, 1)[0];
      b.db.partners.get(DREAM).policy_id = "some-other-policy";
      return [b, r.id, DREAM];
    }],
    ["failed_offer_changed", () => {
      const b = backend(PARTNER_ONLY());
      const r = earn(b, 1)[0];
      b.db.partners.get(U_TEA).offer_version = 2;
      return [b, r.id, U_TEA];
    }],
    ["failed_capped", () => {
      const b = backend(CAPPED);
      const two = earn(b, 2);
      b.rpc.redeem_reward({ reward_id: two[0].id, partner_id: U_TEA });
      return [b, two[1].id, U_TEA];
    }],
    ["failed_outside_window", () => {
      const b = backend(WINDOWED);
      const r = earn(b, 1)[0];
      const shut = new Date(b.now());
      shut.setHours(3, 0, 0, 0);                       // the shop opens at 14:00
      b.setNow(shut.getTime());
      return [b, r.id, U_TEA];
    }],
  ];

  const seen = [];
  for (const [reason, build] of cases) {
    const [b, rewardId, partnerId] = build();
    const before = b.db.rewards.find((r) => r.id === rewardId).status;
    const out = b.rpc.redeem_reward({ reward_id: rewardId, partner_id: partnerId });
    assert.equal(out.ok, false, reason + " must refuse");
    assert.equal(out.reason, reason);
    assert.deepEqual(Object.keys(out).sort(), ["ok", "reason"], reason + " must stay terse");
    assert.equal(b.db.rewards.find((r) => r.id === rewardId).status, before,
      reason + " must leave the reward exactly as it found it");
    seen.push(out.reason);
  }
  assert.deepEqual(seen.slice().sort(), [
    "failed_already_redeemed", "failed_capped", "failed_expired", "failed_not_found",
    "failed_offer_changed", "failed_outside_window", "failed_partner_paused", "failed_wrong_partner",
  ], "the documented set, all of it and nothing else");

  // The two reasons that died with the handoff. Neither is reachable any more, and
  // 'failed_code_unavailable' was never even a legal redemption_events.outcome
  // (supabase-reward-v2.sql section 6's CHECK), which was its own quiet divergence.
  const live = backend();
  const lr = earn(live, 1)[0];
  live.rpc.redeem_reward({ reward_id: lr.id, partner_id: U_TEA });
  live.rpc.redeem_reward({ reward_id: lr.id, partner_id: U_TEA });
  live.rpc.redeem_reward({ reward_id: uuid(), partner_id: U_TEA });
  const outcomes = live.db.events.map((e) => e.outcome);
  assert.equal(outcomes.indexOf("failed_code_expired"), -1);
  assert.equal(outcomes.indexOf("failed_code_unavailable"), -1);
  assert.ok(outcomes.indexOf("completed") >= 0, "and the log still records what did happen");
});

test("FINDING 3: a shop joining a passport is instantly liable for everyone's banked rewards", () => {
  // REAL FINDING, and it is the business question behind LEDGER.md's open
  // decision 1. Under global_passport a reward is spendable at ANY partner on the
  // policy, and there is no join date on either side. A shop that signs on a
  // Tuesday can be handed a stack of rewards earned over the preceding months by
  // students who have never walked in.
  //
  // pilot_cap is the intended brake. FINDING 1 below shows the brake is bypassable.
  const b = backend({
    policies: [{ id: "ithaca-passport", kind: "global_passport", required_minutes: 240 }],
    partners: [{ id: U_TEA, name: "U Tea", offer_text: "10% off your drink", policy_id: "ithaca-passport" }],
  });
  const rewards = earn(b, 3);
  assert.equal(rewards.length, 3, "three rewards banked before the new shop existed");

  b.db.partners.set("newcomer-tea", {
    id: "newcomer-tea", name: "Newcomer Tea (fictional)", offer_text: "test offer, not a real deal",
    policy_id: "ithaca-passport", active: true, offer_version: 1, per_user_limit: null,
    pilot_cap: null, valid_days: null, valid_from_minute: null, valid_to_minute: null,
    cashier_note: "", address: "", market: "",
  });

  let honoured = 0;
  for (const r of rewards) {
    if (b.rpc.redeem_reward({ reward_id: r.id, partner_id: "newcomer-tea" }).ok) honoured++;
    b.advance(MIN);
  }
  assert.equal(honoured, 3, "day one at the new shop, three drinks it never earned the traffic for");
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. CAPS
// The only thing bounding a pilot shop's exposure.
// ═════════════════════════════════════════════════════════════════════════════

test("per_user_limit holds when a second reward is tapped at the same shop", () => {
  // THE ATTACK (was FINDING 1, the highest-severity finding in this file): the cap
  // used to be counted in open_redemption ONLY, and from rows that were ALREADY
  // status='redeemed'. redeem_by_code never looked at per_user_limit or pilot_cap
  // at all: its refusal ladder was consumed_at, code expiry, partner active, reward
  // status, reward expiry, offer_version, and that was the complete list. So the
  // check and the write were separated by the whole life of a handoff code. Open
  // one card per reward first, while the redeemed count is still zero, every one
  // passes the cap, then spend them all and nothing recounts.
  //
  // 1.2.0 removed the separation along with the code, but the cap is the thing that
  // matters and it is still counted inside the one call, by the shared
  // redemption_gate(), under the partner row lock that is taken before it
  // (supabase-reward-v2.sql section 9; `gate` in reward-mock.js). This is the same
  // attack in the only order left: spend, then spend again with the second reward.
  const b = backend({
    policies: [{ id: "ithaca-passport", kind: "global_passport", required_minutes: 240 }],
    partners: [{ id: U_TEA, name: "U Tea", offer_text: "10% off your drink",
                 policy_id: "ithaca-passport", per_user_limit: 1 }],
  });
  const rewards = earn(b, 2);
  assert.equal(rewards.length, 2);

  assert.equal(b.rpc.redeem_reward({ reward_id: rewards[0].id, partner_id: U_TEA }).ok, true);
  const twice = b.rpc.redeem_reward({ reward_id: rewards[1].id, partner_id: U_TEA });
  assert.equal(twice.ok, false, "the second spend recounts the cap");
  assert.equal(twice.reason, "failed_capped");

  const usedHere = b.db.rewards.filter((r) => r.status === "redeemed" && r.redeemed_partner_id === U_TEA);
  assert.equal(usedHere.length, 1, "the shop agreed to one per user and honoured one");
  assert.equal(b.db.rewards.filter((r) => r.status === "issued").length, 1,
    "and the refused reward is still in hand, not burned");

  // The other side of the count, and the reason the gate takes an exclude argument:
  // the reward being spent must not count itself toward the cap it is about to
  // fill. Raise the cap to two and the same tap goes through, so this refuses the
  // cap and not the second reward.
  b.db.partners.get(U_TEA).per_user_limit = 2;
  assert.equal(b.rpc.redeem_reward({ reward_id: rewards[1].id, partner_id: U_TEA }).ok, true);
});

test("pilot_cap holds across accounts, not just within one", () => {
  // The pilot-wide cap is the number a shop is told bounds the whole trial, so it
  // has to count every account's spends and not only the caller's. Same finding as
  // above (was FINDING 1): the count used to happen at open, from already-redeemed
  // rows, so two students who both had a card up before either paid both got a
  // drink out of a pilot_cap of 1.
  //
  // redemption_gate() counts rows at this shop regardless of user_id, and the
  // partner row is locked FOR UPDATE before it runs, which is what stops two
  // simultaneous taps both reading the last slot as free.
  const b = backend({
    policies: [{ id: "ithaca-passport", kind: "global_passport", required_minutes: 240 }],
    partners: [{ id: U_TEA, name: "U Tea", offer_text: "10% off your drink",
                 policy_id: "ithaca-passport", pilot_cap: 1 }],
  });
  const mine = earn(b, 1)[0];
  b.setUser("student-2");
  const theirs = earn(b, 1)[0];

  b.setUser("user-anon-1");
  assert.equal(b.rpc.redeem_reward({ reward_id: mine.id, partner_id: U_TEA }).ok, true);
  b.setUser("student-2");
  const over = b.rpc.redeem_reward({ reward_id: theirs.id, partner_id: U_TEA });
  assert.equal(over.ok, false, "the second account's spend is refused");
  assert.equal(over.reason, "failed_capped");
  assert.equal(b.db.rewards.filter((r) => r.status === "redeemed").length, 1,
    "pilot_cap was 1 and the pilot delivered 1");
  assert.equal(b.db.rewards.find((r) => r.id === theirs.id).status, "issued",
    "and the student who missed out still holds their reward");
});

test("caps hold across a run of honest taps, and a capped reward is refused rather than eaten", () => {
  // The honest path, which was correct even before FINDING 1 was closed and must
  // stay correct now the handoff is gone. It used to be worth its own test because
  // the refusal arrived at OPEN, before the student was standing at a counter, and
  // moving the cap into the shared gate must not cost that early warning.
  //
  // 1.2.0 removed the early server surface entirely: opening the card makes no
  // network call, so the cap is answered at the tap and nowhere else. What has to
  // survive is the arithmetic, the fact that the refused reward is not consumed,
  // and that the cap is scoped to the shop that set it.
  const b = backend({
    policies: [{ id: "ithaca-passport", kind: "global_passport", required_minutes: 240 }],
    partners: [
      { id: U_TEA, name: "U Tea", offer_text: "10% off your drink",
        policy_id: "ithaca-passport", per_user_limit: 2 },
      { id: DREAM, name: "Dream Tea & Poké", offer_text: "5% off your drink",
        policy_id: "ithaca-passport" },
    ],
  });
  const rewards = earn(b, 3);
  const outcomes = rewards.map((r) => {
    const out = b.rpc.redeem_reward({ reward_id: r.id, partner_id: U_TEA });
    return out.ok ? "spent" : "refused: " + out.reason;
  });
  assert.deepEqual(outcomes, ["spent", "spent", "refused: failed_capped"]);
  assert.equal(b.db.rewards.filter((r) => r.status === "issued").length, 1,
    "the third reward survives the refusal");
  assert.equal(b.rpc.redeem_reward({ reward_id: rewards[2].id, partner_id: DREAM }).ok, true,
    "and spends at the shop that did not set a cap, because a cap is one shop's number");
});

test("a FAILED redemption must not consume cap headroom", () => {
  // A shop pausing mid-queue, a mistyped tap, somebody else probing our ids: all
  // things that happen through nobody's fault. If a refusal ate a slot, one flaky
  // moment would silently cost the student a reward the shop never gave them. The
  // gate counts rows with status='redeemed' only, so a refusal is invisible to it,
  // and that is the property under test. (The old version of this test spent its
  // failures on an expired code and a guessed one; neither exists any more, so the
  // failures below are the ones a one-tap redemption can actually produce.)
  const b = backend({
    policies: [{ id: "ithaca-passport", kind: "global_passport", required_minutes: 240 }],
    partners: [{ id: U_TEA, name: "U Tea", offer_text: "10% off your drink",
                 policy_id: "ithaca-passport", per_user_limit: 2 }],
  });
  const rewards = earn(b, 2);

  b.db.partners.get(U_TEA).active = false;                                 // paused mid-queue
  assert.equal(b.rpc.redeem_reward({ reward_id: rewards[0].id, partner_id: U_TEA }).reason,
    "failed_partner_paused");
  b.db.partners.get(U_TEA).active = true;
  b.rpc.redeem_reward({ reward_id: uuid(), partner_id: U_TEA });           // a guessed reward id
  b.setUser("attacker");
  b.rpc.redeem_reward({ reward_id: rewards[1].id, partner_id: U_TEA });    // a refused probe
  b.setUser("user-anon-1");

  for (const r of rewards) {
    assert.equal(b.rpc.redeem_reward({ reward_id: r.id, partner_id: U_TEA }).ok, true,
      "headroom must be intact after three failures");
  }
  assert.equal(b.db.rewards.filter((r) => r.status === "redeemed").length, 2);
});

test("a card rendered inside the window cannot be spent after the window closes", () => {
  // THE ATTACK (was FINDING 7, smaller than the cap hole but the same shape):
  // valid_days and the valid_from/valid_to window used to be checked ONLY in
  // open_redemption, and the five-minute code carried a 16:58 open through to
  // 17:03, past the 17:00 the shop agreed to. "Afternoons only" was not what it
  // said on the tin, and a shop that set a window for a staffing reason would
  // notice.
  //
  // The code is gone; the gap is not, and it is wider. openRedeem() renders the
  // card from the local snapshot with NO network call, so a card put on screen at
  // 16:58 can be tapped at any hour at all, five minutes later or the next morning.
  // The window is only meaningful where value moves, which is the shared
  // redemption_gate() inside the one spend (supabase-reward-v2.sql section 9;
  // `gate` in reward-mock.js).
  const b = backend({
    policies: [{ id: "ithaca-passport", kind: "global_passport", required_minutes: 240 }],
    partners: [{ id: U_TEA, name: "U Tea", offer_text: "10% off your drink", policy_id: "ithaca-passport",
                 valid_from_minute: 14 * 60, valid_to_minute: 17 * 60 }],
  });
  const r = earn(b, 1)[0];
  const inside = new Date(b.now());
  inside.setHours(16, 58, 0, 0);
  b.setNow(inside.getTime());                          // the card goes on screen, inside the hours

  b.advance(4 * MIN);
  assert.equal(new Date(b.now()).getHours(), 17);
  assert.equal(new Date(b.now()).getMinutes(), 2, "17:02, outside the window");
  const late = b.rpc.redeem_reward({ reward_id: r.id, partner_id: U_TEA });
  assert.equal(late.ok, false, "a card that was opened in time does not outlive the window");
  assert.equal(late.reason, "failed_outside_window");
  assert.equal(b.db.rewards[0].status, "issued", "and the student keeps the reward for tomorrow");

  // The same tap inside the hours still works, so this refuses the clock and not
  // the reward: 16:59 is one minute before the cutoff.
  const ok = new Date(b.now());
  ok.setHours(16, 59, 0, 0);
  b.setNow(ok.getTime());
  assert.equal(b.rpc.redeem_reward({ reward_id: r.id, partner_id: U_TEA }).ok, true);
});

test("an overnight window wraps past midnight instead of refusing every hour", () => {
  // THE ATTACK, or really the config trap (was FINDING 8): the check used to be
  //     v_minute < valid_from_minute or v_minute > valid_to_minute
  // which is true at EVERY hour of the day for a pair that crosses midnight. A
  // late-night boba shop that said "10pm to 2am" got a reward that never worked at
  // any hour, and the refusal read failed_capped, pointing the founder at caps
  // rather than at the clock.
  //
  // NOW HANDLED. The wrapping pair is its own branch (supabase-reward-v2.sql
  // section 9; `gate` in reward-mock.js), and every window refusal returns the
  // distinct failed_outside_window.
  //
  // The probe used to be open_redemption, which read the window without consuming
  // anything. There is no read-only surface left, so the shut hours are probed with
  // one reward (a refusal spends nothing, which is itself asserted) and the open
  // hours get one banked reward each.
  const b = backend({
    policies: [{ id: "ithaca-passport", kind: "global_passport", required_minutes: 240 }],
    partners: [{ id: U_TEA, name: "U Tea", offer_text: "10% off your drink", policy_id: "ithaca-passport",
                 valid_from_minute: 22 * 60, valid_to_minute: 2 * 60 }],
  });
  const rewards = earn(b, 4);
  const at = (hour) => {
    const t = new Date(b.now());
    t.setHours(hour, 30, 0, 0);
    b.setNow(t.getTime());
  };

  for (const hour of [2, 12, 21]) {
    at(hour);
    const shut = b.rpc.redeem_reward({ reward_id: rewards[0].id, partner_id: U_TEA });
    assert.equal(shut.ok, false, hour + ":30 is outside the window and must be refused");
    assert.equal(shut.reason, "failed_outside_window", "and the reason names the clock, not caps");
  }
  assert.equal(b.db.rewards.filter((r) => r.status === "issued").length, 4,
    "three refusals cost the student nothing");

  const open = [22, 23, 0, 1];
  open.forEach((hour, i) => {
    at(hour);
    assert.equal(b.rpc.redeem_reward({ reward_id: rewards[i].id, partner_id: U_TEA }).ok, true,
      hour + ":30 is inside the 22:00-to-02:00 window");
  });
  assert.equal(b.db.rewards.filter((r) => r.status === "redeemed").length, 4);
});

test("pulling a shop refuses cleanly instead of crashing, and never burns a reward", () => {
  // CLOSED — was FINDING 5, which contradicted the operating instructions.
  //
  // CLAUDE.md documents removal as the kill switch: "Pulling a shop is the same
  // edit in reverse, which is what lets us keep the promise the pitch makes: they
  // come off the app the day they ask." Under Reward V2 that used to break twice.
  //
  //   Server side: redemption_handoffs.partner_id referenced partners(id) with no
  //   ON DELETE, so once anybody had opened a card there the DELETE failed on a
  //   foreign key violation and the shop could not be removed at all. That half is
  //   not fixed so much as deleted: 1.2.0 dropped the table, so no five-minute row
  //   can be the reason a shop cannot be pulled.
  //
  //   Mock side, and this half is still live: a vanished partner used to be
  //   dereferenced and THROW, so a cashier saw a crash rather than "this shop is no
  //   longer a partner". It refuses with failed_not_found. It matters more now, not
  //   less, because the client renders the card from a local snapshot that can be a
  //   day old, so tapping a shop the config no longer has is an ordinary thing to
  //   do and must never be a crash in front of a queue.
  //
  // STILL TRUE BY DESIGN, and it is the right trade: a shop that has actually had a
  // redemption cannot be DELETEd, because reward_instances.redeemed_partner_id is
  // deliberately not cascaded. Deleting it would erase the merchant report that
  // proves what was honoured. active = false is the correct pull for a shop that
  // has traded, it refuses cleanly, it keeps the history, and it is reversible.
  // reward-config.js already models it that way ("active:false is a PAUSE").
  const b = backend();
  const r = earn(b, 1)[0];

  b.loadConfig({
    policies: [{ id: "ithaca-passport", kind: "global_passport", required_minutes: 240 }],
    partners: [{ id: DREAM, name: "Dream Tea & Poké", offer_text: "5% off your drink",
                 policy_id: "ithaca-passport" }],
  });

  const gone = b.rpc.redeem_reward({ reward_id: r.id, partner_id: U_TEA });
  assert.equal(gone.ok, false, "the tap refuses instead of crashing");
  assert.equal(gone.reason, "failed_not_found");
  assert.equal(b.db.rewards[0].status, "issued", "and the reward is not burned by a pulled shop");
  assert.equal(b.rpc.redeem_reward({ reward_id: r.id, partner_id: DREAM }).ok, true,
    "the shop still on the policy is unaffected");

  // The safe pull, for contrast: a pause refuses with a reason a human can read.
  const paused = backend();
  const pr = earn(paused, 1)[0];
  paused.db.partners.get(U_TEA).active = false;
  assert.equal(paused.rpc.redeem_reward({ reward_id: pr.id, partner_id: U_TEA }).reason,
    "failed_partner_paused");
  assert.equal(paused.db.rewards[0].status, "issued", "and the student keeps the reward");
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. CONFIG
// Hostile partners.json payloads. Nothing may throw, and nothing malformed may
// ever produce a redeemable shop.
// ═════════════════════════════════════════════════════════════════════════════

const SHOP = (over) => Object.assign({
  id: "test-shop", name: "Test Shop", address: "1 Main St",
  lat: 42.44, lng: -76.49, perk: "10% off your drink", minMinutes: 240,
}, over || {});

test("prototype-pollution payloads never pollute and never yield a redeemable shop", () => {
  const before = Object.prototype.hasOwnProperty.call(Object.prototype, "pwned");
  const payloads = [
    JSON.parse('{"shops":[{"__proto__":{"pwned":1},"name":"X","perk":"p","lat":1,"lng":1,"minMinutes":240}]}'),
    JSON.parse('{"__proto__":{"pwned":1},"shops":[]}'),
    JSON.parse('{"shops":{"__proto__":{"pwned":1}}}'),
    { shops: [SHOP({ id: "__proto__" })] },
    { shops: [SHOP({ id: "constructor" })] },
    { shops: [{ constructor: { prototype: { pwned: 1 } }, name: "X", perk: "p", lat: 1, lng: 1, minMinutes: 240 }] },
    { rewardPolicy: JSON.parse('{"policies":[{"__proto__":{"pwned":1},"id":"p","kind":"global_passport","requiredMinutes":240}]}'), shops: [] },
  ];
  for (const payload of payloads) {
    const cfg = RC.parse(payload);
    assert.ok(Array.isArray(cfg.shops));
    assert.equal(Object.prototype.hasOwnProperty.call(Object.prototype, "pwned"), before,
      "Object.prototype must be untouched");
    assert.equal({}.pwned, undefined);
    for (const s of cfg.shops) {
      // A shop that survived must still be a real, bounded record.
      assert.equal(typeof s.name, "string");
      assert.ok(s.minMinutes >= RC.MIN_BAR && s.minMinutes <= RC.MAX_BAR);
      assert.equal(s.offerVersion, 1);
    }
  }
});

test("every non-finite or wrong-typed number is dropped rather than coerced", () => {
  // The nightmare here is a bar that reads as zero or NaN, because Math.floor of
  // anything over it is either Infinity or NaN and the user is instantly holding
  // rewards nobody agreed to.
  const poison = [NaN, Infinity, -Infinity, "240", "", null, undefined, {}, [], true, 0, -0, -240, 14, 1441];
  for (const bar of poison) {
    const cfg = RC.parse({ shops: [SHOP({ minMinutes: bar })] });
    assert.equal(cfg.shops.length, 0, "minMinutes " + String(bar) + " must never produce a shop");
    assert.equal(RC.nextBarAcross(cfg.shops, 180), 180, "and must never move the displayed bar");
  }
  assert.equal(RC.parse({ shops: [SHOP({ minMinutes: 15 })] }).shops.length, 1, "15 is the floor and is valid");
  assert.equal(RC.parse({ shops: [SHOP({ minMinutes: 1440 })] }).shops.length, 1, "1440 is the ceiling and is valid");
});

test("non-finite coordinates and negative zero cannot smuggle a shop through", () => {
  for (const bad of [NaN, Infinity, "42.44", null, 91, -91, undefined]) {
    assert.equal(RC.parse({ shops: [SHOP({ lat: bad })] }).shops.length, 0, "lat " + String(bad));
  }
  for (const bad of [NaN, Infinity, "-76.49", null, 181, -181]) {
    assert.equal(RC.parse({ shops: [SHOP({ lng: bad })] }).shops.length, 0, "lng " + String(bad));
  }
  // -0 is a finite, in-range coordinate. It is allowed, and must not become NaN.
  const zero = RC.parse({ shops: [SHOP({ lat: -0, lng: -0 })] });
  assert.equal(zero.shops.length, 1);
  assert.ok(Number.isFinite(zero.shops[0].lat) && Number.isFinite(zero.shops[0].lng));
});

test("junk of every shape parses to an empty, non-throwing result", () => {
  const junk = [null, undefined, 0, -0, NaN, Infinity, "", "nope", true, false, {}, [],
                { shops: null }, { shops: "no" }, { shops: 42 }, { shops: [null, undefined, 0, "x", []] },
                { shops: [SHOP()], rewardPolicy: null }, { shops: [SHOP()], rewardPolicy: "yes" },
                { shops: [SHOP()], rewardPolicy: { policies: null } },
                { shops: [SHOP()], rewardPolicy: { policies: [null, undefined, 0, "x"] } }];
  for (const payload of junk) {
    let cfg;
    assert.doesNotThrow(() => { cfg = RC.parse(payload); }, "must not throw on " + JSON.stringify(payload));
    assert.ok(Array.isArray(cfg.shops));
    assert.ok(Array.isArray(cfg.policies));
    assert.ok(["undeclared", "declared", "ambiguous"].indexOf(cfg.policyState) >= 0);
  }
});

test("a deeply nested and a very large payload are handled without throwing", () => {
  let nested = [];
  const root = nested;
  for (let i = 0; i < 5000; i++) { const next = []; nested.push(next); nested = next; }
  assert.doesNotThrow(() => RC.parse({ shops: [SHOP({ validDays: root })] }));

  const big = { shops: [] };
  for (let i = 0; i < 50000; i++) big.shops.push(SHOP({ id: "shop-" + i, name: "Shop " + i }));
  const cfg = RC.parse(big);
  assert.equal(cfg.shops.length, 50000);
  assert.equal(RC.nextBarAcross(cfg.shops), 240);
});

test("nextBarAcross survives a shop list far larger than any real one", () => {
  // CLOSED — was FINDING 14. Math.min.apply spreads the whole list onto the call
  // stack and threw RangeError somewhere above ~124k entries. Unreachable in
  // practice (partners.json is hand-edited and has two shops), but "the config
  // parser never throws" is worth keeping true, so it is a reduce() now.
  const many = [];
  for (let i = 0; i < 200000; i++) many.push({ minMinutes: 240, active: true });
  many.push({ minMinutes: 90, active: true });
  assert.equal(RC.nextBarAcross(many), 90, "and it still finds the real minimum");
  // The size that actually matters still works.
  assert.equal(RC.nextBarAcross([{ minMinutes: 240, active: true }, { minMinutes: 300, active: true }]), 240);
});

test("a shop id the server could not store is an error, not a clean parse", () => {
  // CLOSED — was FINDING 10. reward-config.js applied its slug regex to POLICY
  // ids only; validShop never looked at id at all. The server declares
  //     id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{1,62}$')
  // so all of these parsed with zero errors and then failed at seed time, one
  // CHECK violation at a time.
  const SERVER_ID_RE = /^[a-z0-9][a-z0-9-]{1,62}$/;
  const unseedable = ["U Tea Collegetown!", "U-TEA", "__proto__", "-leading",
                      "with_underscore", "u", "x".repeat(64), "\u00fctea"];
  for (const id of unseedable) {
    const cfg = RC.parse({ shops: [SHOP({ id })] });
    assert.equal(SERVER_ID_RE.test(id), false, JSON.stringify(id) + " fails the server CHECK");
    assert.ok(cfg.errors.length > 0, JSON.stringify(id) + " must now raise an error");
    assert.match(cfg.errors.join(" "), /not a valid slug/);
  }

  // Whitespace is trimmed rather than rejected, because " u-tea" and "u-tea " are
  // the same shop to a human AND to the server's primary key.
  for (const id of ["u-tea ", " u-tea", "  u-tea  "]) {
    const cfg = RC.parse({ shops: [SHOP({ id })] });
    assert.deepEqual(cfg.errors, [], JSON.stringify(id) + " is just untidy, not invalid");
    assert.equal(cfg.shops[0].id, "u-tea");
  }

  // THE POINT OF THE TRIM: three ids a human reads as one shop now collide, so the
  // duplicate-id error that exists to stop colliding server rows finally fires.
  const collide = RC.parse({ shops: [SHOP({ id: "u-tea" }), SHOP({ id: "u-tea " }), SHOP({ id: " u-tea" })] });
  assert.equal(collide.shops.length, 1);
  assert.equal(collide.errors.filter((e) => /duplicate shop id/.test(e)).length, 2);

  // A shop with no id at all is refused: the server needs one as a primary key,
  // and without it two shops are indistinguishable (v1 defect D14's shape).
  const anonymous = RC.parse({ shops: [SHOP({ id: undefined })] });
  assert.match(anonymous.errors.join(" "), /has no id/);

  // The two REAL shops are unaffected. This is the line that matters most.
  const live = RC.parse(LIVE_PARTNERS);
  assert.deepEqual(live.errors, []);
  assert.deepEqual(live.shops.map((x) => x.id).sort(),
    ["dream-tea-poke-ithaca", "u-tea-collegetown"]);
});

test("a cap larger than the server's CHECK allows is an error", () => {
  // CLOSED — was FINDING 11, same class as 10 and the same consequence: the config
  // called the file fine and the migration then refused it.
  //   per_user_limit check (... between 1 and 1000)
  //   pilot_cap      check (... between 1 and 1000000)
  // reward-config only required >= 1. Refused, not clamped: silently lowering a
  // cap would change what the shop agreed to without anyone deciding it.
  const wide = RC.parse({ shops: [SHOP({ perUserLimit: 5000, pilotCap: 900000000 })] });
  assert.match(wide.errors.join(" "), /perUserLimit 5000; the server allows at most 1000/);
  assert.match(wide.errors.join(" "), /pilotCap 900000000; the server allows at most 1000000/);
  // The boundary values themselves are legal.
  const edge = RC.parse({ shops: [SHOP({ perUserLimit: 1000, pilotCap: 1000000 })] });
  assert.deepEqual(edge.errors, []);
  // The values it does normalise correctly, for contrast.
  const tidy = RC.parse({ shops: [SHOP({ perUserLimit: 2.9, pilotCap: 0, offerVersion: 0 })] });
  assert.equal(tidy.shops[0].perUserLimit, 2, "fractions floor");
  assert.equal(tidy.shops[0].pilotCap, null, "zero means no cap, not a cap of zero");
  assert.equal(tidy.shops[0].offerVersion, 1, "version never drops below 1");
});

test("a day list that cannot be read is refused, not treated as no restriction", () => {
  // CLOSED — was the config half of FINDING 9. normaliseShop turned validDays into
  // [] when its entries were invalid, and an empty array means "no day
  // restriction" in both reward-mock.js `gate` and supabase-reward-v2.sql section
  // 9. So a shop that asked for weekdays and got the numbers wrong was open every
  // day, with no warning and no error. It failed OPEN, which is the wrong
  // direction for a rule a shop actually asked for.
  //
  // Nothing could distinguish "the shop set no day rule" from "the shop set one
  // and every entry was thrown away". The raw length is now carried through
  // normalisation so the validator can tell those apart.
  const junk = RC.parse({ shops: [SHOP({ validDays: [7, -1, "mon", NaN, null] })] });
  assert.match(junk.errors.join(" "), /validDays entry that is not a whole number 0-6/);

  // A PARTLY valid list is refused too. Honouring half a day rule is guessing.
  const partial = RC.parse({ shops: [SHOP({ validDays: [1, 2, 9] })] });
  assert.match(partial.errors.join(" "), /validDays entry that is not a whole number 0-6/);

  // A well-formed list is kept exactly.
  const good = RC.parse({ shops: [SHOP({ validDays: [1, 2, 3, 4, 5] })] });
  assert.deepEqual(good.errors, []);
  assert.deepEqual(good.shops[0].validDays, [1, 2, 3, 4, 5]);

  // No day rule at all stays null, and stays legal.
  const none = RC.parse({ shops: [SHOP({})] });
  assert.deepEqual(none.errors, []);
  assert.equal(none.shops[0].validDays, null);

  // An explicitly EMPTY list is not a restriction and is not an error either.
  const empty = RC.parse({ shops: [SHOP({ validDays: [] })] });
  assert.deepEqual(empty.errors, []);
  assert.equal(empty.shops[0].validDays, null);
});

test("a half-set redemption window is refused rather than treated as no restriction", () => {
  // THE ATTACK (was the window half of FINDING 9): the hours rule used to be
  // applied only when BOTH ends were set, so setting valid_from and forgetting
  // valid_to disabled the window entirely and the shop's "from 2pm" ran at 3am.
  //
  // NOW REFUSED. A half-set pair is read as a misconfiguration, not as an absence
  // of one, and returns failed_outside_window (supabase-reward-v2.sql section 9,
  // `(v_from is null) <> (v_to is null)`; the same test in reward-mock.js `gate`).
  // Failing shut costs a student a drink until the config is corrected; failing
  // open hands out a discount outside the hours the shop agreed to.
  const half = backend({
    policies: [{ id: "ithaca-passport", kind: "global_passport", required_minutes: 240 }],
    partners: [{ id: U_TEA, name: "U Tea", offer_text: "10% off your drink",
                 policy_id: "ithaca-passport", valid_from_minute: 14 * 60, valid_to_minute: null }],
  });
  const hr = earn(half, 1)[0];
  const threeAm = new Date(half.now());
  threeAm.setHours(3, 0, 0, 0);
  half.setNow(threeAm.getTime());
  const night = half.rpc.redeem_reward({ reward_id: hr.id, partner_id: U_TEA });
  assert.equal(night.ok, false, "from=14:00 with no to= must not redeem at 3am");
  assert.equal(night.reason, "failed_outside_window");

  // And it is the half-set pair that is refused, not the hour: 15:00 is squarely
  // inside what the shop meant and is refused too, because the rule is unreadable.
  const threePm = new Date(half.now());
  threePm.setHours(15, 0, 0, 0);
  half.setNow(threePm.getTime());
  assert.equal(half.rpc.redeem_reward({ reward_id: hr.id, partner_id: U_TEA }).reason,
    "failed_outside_window", "a half-set window is refused at every hour, on purpose");
  assert.equal(half.db.rewards[0].status, "issued", "and failing shut never burns the reward");

  // The mirror: the other half missing is refused the same way.
  const other = backend({
    policies: [{ id: "ithaca-passport", kind: "global_passport", required_minutes: 240 }],
    partners: [{ id: U_TEA, name: "U Tea", offer_text: "10% off your drink",
                 policy_id: "ithaca-passport", valid_from_minute: null, valid_to_minute: 17 * 60 }],
  });
  const or = earn(other, 1)[0];
  assert.equal(other.rpc.redeem_reward({ reward_id: or.id, partner_id: U_TEA }).reason,
    "failed_outside_window");

  // A fully-set window is unaffected, so this is not a blanket refusal.
  const whole = backend({
    policies: [{ id: "ithaca-passport", kind: "global_passport", required_minutes: 240 }],
    partners: [{ id: U_TEA, name: "U Tea", offer_text: "10% off your drink",
                 policy_id: "ithaca-passport", valid_from_minute: 14 * 60, valid_to_minute: 17 * 60 }],
  });
  const wr = earn(whole, 1)[0];
  const inside = new Date(whole.now());
  inside.setHours(15, 0, 0, 0);
  whole.setNow(inside.getTime());
  assert.equal(whole.rpc.redeem_reward({ reward_id: wr.id, partner_id: U_TEA }).ok, true);
});

test("unicode and bidi text in a shop name survives parsing without throwing", () => {
  // Not injection: every render path uses textContent (GROUNDING.md section 3).
  // The honest risk is display, not execution. A right-to-left override inside a
  // name or a perk reverses what a barista reads on the card, and normaliseShop
  // does not strip bidi controls. Recorded so nobody assumes it does.
  const RLO = "‮";
  const cfg = RC.parse({ shops: [SHOP({ id: "rtl-shop", name: "U Tea " + RLO + "ffo %01",
                                        perk: RLO + "kcabhsac 5$" })] });
  assert.equal(cfg.shops.length, 1);
  assert.ok(cfg.shops[0].name.indexOf(RLO) >= 0, "the override character is carried through as-is");
  assert.ok(cfg.shops[0].perk.indexOf(RLO) >= 0);
  // A name long enough to blow the limit is still dropped rather than truncated.
  assert.equal(RC.parse({ shops: [SHOP({ name: "\u{1F9CB}".repeat(41) })] }).shops.length, 0,
    "the 80-unit name limit is counted in UTF-16 units, so emoji names are stricter than the server's");
  assert.equal(RC.parse({ shops: [SHOP({ name: "  " })] }).shops.length, 0, "whitespace is not a name");
});

test("the live partners.json parses clean and matches what the shops were told", () => {
  // The regression rail for everything above. Whatever else changes, the two real
  // shops keep their agreed numbers and the shared 240-minute bar the managers
  // were actually given: study 4 cumulative hours, redeem at their shop.
  const LIVE = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "partners.json"), "utf8"));
  const cfg = RC.parse(LIVE);
  assert.deepEqual(cfg.errors, []);
  assert.equal(cfg.policyState, "declared");
  assert.equal(cfg.policies[0].kind, "global_passport");
  assert.equal(cfg.policies[0].requiredMinutes, 240);
  assert.equal(cfg.shops.length, 2);
  const u = cfg.shops.find((s) => s.id === "u-tea-collegetown");
  const d = cfg.shops.find((s) => s.id === "dream-tea-poke-ithaca");
  assert.equal(u.perk, "10% off your drink");
  assert.equal(d.perk, "5% off your drink");
  assert.equal(RC.barFor(u), 240);
  assert.equal(RC.barFor(d), 240);
  assert.equal(u.perUserLimit, null, "no cap was ever agreed, so none may be invented");
  assert.equal(d.perUserLimit, null);
});

// ═════════════════════════════════════════════════════════════════════════════
// 8. MONOTONICITY
// A redeemed reward is a fact about the past. Nothing may edit it.
// ═════════════════════════════════════════════════════════════════════════════

test("no operation walks a redeemed reward back to issued", () => {
  const b = backend();
  const r = earn(b, 1)[0];
  b.rpc.redeem_reward({ reward_id: r.id, partner_id: U_TEA });
  assert.equal(b.db.rewards[0].status, "redeemed");

  // Everything the contract exposes, fired at the spent reward.
  for (let i = 0; i < 5; i++) {
    b.rpc.issue_my_rewards();
    b.rpc.my_reward_state();
    b.rpc.redeem_reward({ reward_id: r.id, partner_id: U_TEA });
    b.rpc.redeem_reward({ reward_id: r.id, partner_id: DREAM });
    b.rpc.partner_report({ partner_id: U_TEA, days: 30 });
    creditMinutes(b, 240);
    b.rpc.issue_my_rewards();
  }
  assert.equal(b.db.rewards.find((x) => x.id === r.id).status, "redeemed");
});

test("redeemed_offer_text is never rewritten after the fact", () => {
  // The pilot report's only honest answer to "what was I giving away in
  // September". partners.offer_text is mutable and holds today's wording only, so
  // if anything reached back and refreshed this column the report would relabel
  // history with the current offer.
  const b = backend();
  const r = earn(b, 1)[0];
  b.rpc.redeem_reward({ reward_id: r.id, partner_id: U_TEA });
  const snapshot = JSON.stringify(b.db.rewards.find((x) => x.id === r.id));

  const uTea = b.db.partners.get(U_TEA);
  uTea.offer_text = "one free large drink";
  uTea.offer_version = 5;
  uTea.name = "U Tea (renamed)";
  b.advance(30 * DAY);
  creditMinutes(b, 480);
  b.rpc.issue_my_rewards();
  b.rpc.redeem_reward({ reward_id: r.id, partner_id: U_TEA });
  b.rpc.redeem_reward({ reward_id: r.id, partner_id: DREAM });

  assert.equal(JSON.stringify(b.db.rewards.find((x) => x.id === r.id)), snapshot,
    "the whole redeemed row is frozen");
  assert.equal(b.db.rewards.find((x) => x.id === r.id).redeemed_offer_text, "10% off your drink");
});

test("a failed second spend does not overwrite when or where the first one happened", () => {
  const b = backend();
  const r = earn(b, 1)[0];
  b.rpc.redeem_reward({ reward_id: r.id, partner_id: U_TEA });
  const at = b.db.rewards[0].redeemed_at;
  b.advance(2 * DAY);
  b.rpc.redeem_reward({ reward_id: r.id, partner_id: U_TEA });
  b.rpc.redeem_reward({ reward_id: r.id, partner_id: DREAM });
  assert.equal(b.db.rewards[0].redeemed_at, at, "the timestamp is the first spend, not the last attempt");
  assert.equal(b.db.rewards[0].redeemed_partner_id, U_TEA);
  assert.equal(b.db.rewards[0].redeemed_offer_version, 1);
});

test("a session's credited minutes are frozen once it completes", () => {
  const b = backend();
  const id = uuid();
  b.rpc.start_reward_session({ session_id: id, planned_minutes: 60, platform: "ios" });
  b.advance(HOUR);
  b.rpc.complete_reward_session({ session_id: id });
  for (let i = 0; i < 5; i++) {
    b.advance(3 * HOUR);
    b.rpc.complete_reward_session({ session_id: id });
    b.rpc.start_reward_session({ session_id: id, planned_minutes: 480, platform: "ios" });
  }
  assert.equal(b.db.sessions.get(id).credited_minutes, 60);
  assert.equal(b.db.sessions.get(id).planned_minutes, 60, "a replayed start cannot raise the plan");
  assert.equal(b.eligibleMinutes(), 60);
});

// ═════════════════════════════════════════════════════════════════════════════
// 9. THE MERCHANT REPORT
// It may only answer what was actually collected.
// ═════════════════════════════════════════════════════════════════════════════

test("the report carries no account id, no reward id and no revenue vocabulary", () => {
  const b = backend();
  const r = earn(b, 1)[0];
  b.rpc.redeem_reward({ reward_id: r.id, partner_id: U_TEA });
  const report = b.rpc.partner_report({ partner_id: U_TEA, days: 30 });
  const serialised = JSON.stringify(report);

  assert.equal(serialised.indexOf("user-anon-1"), -1, "no account id reaches a shop");
  assert.equal(serialised.indexOf(r.id), -1, "no reward id either");
  for (const banned of ["revenue", "sales", "order_value", "average_order", "first_visit",
                        "first_time", "new_customer", "roi", "incremental", "verified"]) {
    assert.equal(serialised.toLowerCase().indexOf(banned), -1, "the report must never claim " + banned);
  }
  assert.equal(report.redemptions, 1);
  assert.equal(report.unique_redeemers, 1);
});

test("a hostile days argument cannot widen the report or crash it", () => {
  const b = backend();
  const r = earn(b, 1)[0];
  b.rpc.redeem_reward({ reward_id: r.id, partner_id: U_TEA });
  for (const days of [NaN, Infinity, -Infinity, -1, 0, null, undefined, "30", 1e9, 365, 366]) {
    const report = b.rpc.partner_report({ partner_id: U_TEA, days });
    assert.ok(report.window_days >= 1 && report.window_days <= 365,
      "days=" + String(days) + " gave window " + report.window_days);
  }
});

test("one shop's report never counts another shop's redemptions or refusals", () => {
  const b = backend();
  const rewards = earn(b, 2);
  b.rpc.redeem_reward({ reward_id: rewards[0].id, partner_id: U_TEA });
  b.rpc.redeem_reward({ reward_id: rewards[1].id, partner_id: DREAM });
  b.rpc.redeem_reward({ reward_id: rewards[1].id, partner_id: DREAM });   // a refusal, at Dream only

  const uTea = b.rpc.partner_report({ partner_id: U_TEA, days: 30 });
  const dream = b.rpc.partner_report({ partner_id: DREAM, days: 30 });
  assert.equal(uTea.redemptions, 1);
  assert.equal(dream.redemptions, 1);
  assert.deepEqual(uTea.rejected, [], "U Tea did not cause Dream's refusal and is not shown it");
  assert.equal(dream.rejected.find((x) => x.reason === "failed_already_redeemed").n, 1);
});

test("FINDING 16: guessing reward ids at a shop stays OUT of that shop's rejection list", () => {
  // THIS TEST ASSERTED THE OPPOSITE TWICE, and the history is the point.
  //
  // Before 1.2.0 a guessed six-character code resolved to no handoff and therefore
  // to no partner, so the miss was logged with partner_id NULL and a shop's
  // rejection list stayed a record of what happened at ITS counter.
  //
  // The merge briefly broke that. Every tap now names a partner id directly, and
  // the first version of redeem_reward logged its refusal against that partner
  // whatever the reward id turned out to be, so a signed-in account could push
  // failed_not_found rows into one shop's report by tapping garbage at it. Nothing
  // of value moved, but the merchant report is the one artifact a shop is handed as
  // a factual account of its own counter, and noise in it is a lie of exactly the
  // kind the report exists to prevent.
  //
  // The rule now: a refusal is attributed to a shop only when the tap actually
  // reached one of ITS offers. An unknown reward id, somebody else's reward id, and
  // an unknown partner id are all logged with partner_id NULL — the event is still
  // recorded, it is simply not blamed on a business that had nothing to do with it.
  // (supabase-reward-v2.sql section 9, `case when v_p.id is null then null else
  // p_partner_id end`; mirrored by `attributable` in reward-mock.js redeemReward.)
  const b = backend();
  const r = earn(b, 1)[0];
  b.rpc.redeem_reward({ reward_id: r.id, partner_id: U_TEA });
  for (let i = 0; i < 200; i++) b.rpc.redeem_reward({ reward_id: uuid(), partner_id: U_TEA });

  const report = b.rpc.partner_report({ partner_id: U_TEA, days: 30 });
  assert.equal(report.redemptions, 1, "the noise buys nothing");
  assert.equal(report.unique_redeemers, 1);
  assert.deepEqual(report.rejected, [],
    "and it does not reach the shop's report at all");

  // The events are still recorded — they are simply unattributed. Losing them
  // outright would blind us to someone actually probing the system.
  const misses = b.db.events.filter((e) => e.outcome === "failed_not_found");
  assert.equal(misses.length, 200, "every refusal is still logged");
  assert.ok(misses.every((e) => e.partner_id === null),
    "every one of them with no partner attached");

  const serialised = JSON.stringify(report);
  assert.equal(serialised.indexOf("user-anon-1"), -1, "no account id rides along with it");
  assert.equal(serialised.indexOf(r.id), -1, "and no reward id");
  assert.equal(b.db.rewards.length, 1, "no reward was created or destroyed by the noise");
  assert.equal(b.rpc.partner_report({ partner_id: DREAM, days: 30 }).rejected.length, 0,
    "and nothing lands at any other shop either");

  // A REAL refusal at a real shop still reaches that shop, or the report would be
  // useless in the other direction: a paused offer or an exhausted cap is exactly
  // what a shop needs to see.
  const b2 = backend();
  const r2 = earn(b2, 1)[0];
  b2.db.partners.get(U_TEA).active = false;
  assert.equal(b2.rpc.redeem_reward({ reward_id: r2.id, partner_id: U_TEA }).reason,
    "failed_partner_paused");
  assert.deepEqual(b2.rpc.partner_report({ partner_id: U_TEA, days: 30 }).rejected,
    [{ reason: "failed_partner_paused", n: 1 }],
    "a refusal of a REAL reward at a REAL shop is still that shop's business");
});
