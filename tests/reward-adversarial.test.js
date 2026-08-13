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
// CLOSED since the red-team pass: 1, 2 (mid-handoff half), 4, 5, 6, 7, 8, 9, 10,
// 11, 12, 13, 14 and 15. Each has a test above renamed to the invariant it now
// defends, keeping its finding number in the comment so the history stays
// traceable. Twelve of the fourteen original holes are shut.
//
// STILL OPEN. Both are BUSINESS CALLS, not code defects, which is why they are
// still here: closing either one decides something about the product that is not
// mine to decide. Each has a green test asserting the true current behaviour, so
// closing one will turn its test red on purpose.
//
//   FINDING 2  (RESIDUE ONLY) the mid-handoff half is FIXED: the handoff pins the
//              shop's offer_version at open and spend checks it, so a shop that
//              changes its offer while a card is live is caught. A passport reward
//              still carries offer_version NULL of its own, so an offer changed
//              BEFORE the card is opened is honoured at the NEW wording.
//              THE QUESTION: a global passport promises "a perk at any partner",
//              not "this exact perk". If that is the intent, this is correct
//              behaviour and not a bug. If a passport should freeze the wording it
//              was earned against, issue_my_rewards has to record a version, and
//              then it needs a shop, which a passport does not have until the card
//              is opened. That is a product decision.
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

test("a reward minted while a code is live does not ride that code to the counter", () => {
  // Issue lands BETWEEN open and redeem. The handoff names one reward id, so the
  // spend must consume that one and leave the new one in hand.
  //
  // The second reward has to be REAL for this to test anything. It comes from a
  // second honest 240 minutes banked but not yet issued when the card is opened,
  // so issue_my_rewards mints it mid-handoff. (This setup used to lower the
  // policy bar to 120 to conjure the extra reward out of the same 240 minutes.
  // That was FINDING 4 and it is fixed, so it conjures nothing now.)
  const b = backend();
  const first = earn(b, 1)[0];
  creditMinutes(b, 240);                                         // banked, deliberately not issued yet
  const open = b.rpc.open_redemption({ reward_id: first.id, partner_id: U_TEA });
  const all = b.rpc.issue_my_rewards();                          // a second reward appears
  assert.equal(all.length, 2, "the setup needs a genuinely new reward mid-handoff");
  b.advance(MIN);
  assert.equal(b.rpc.redeem_by_code({ code: open.code }).ok, true);
  assert.equal(b.db.rewards.filter((r) => r.status === "redeemed").length, 1);
  assert.equal(b.db.rewards.filter((r) => r.status === "issued").length, 1);
  assert.equal(b.db.rewards.find((r) => r.status === "redeemed").id, first.id,
    "the code spent the reward it names, not the one minted after it");
});

test("one reward opened at two shops at once still buys exactly one drink", () => {
  // Two live codes, two counters, both reading VALID at the same instant. This is
  // the queue-jumping attack: get both baristas to look at a valid screen, then
  // hope both honour it. Exactly one spend may succeed.
  const b = backend();
  const r = earn(b, 1)[0];
  const atUTea = b.rpc.open_redemption({ reward_id: r.id, partner_id: U_TEA });
  const atDream = b.rpc.open_redemption({ reward_id: r.id, partner_id: DREAM });
  assert.notEqual(atUTea.code, atDream.code, "a different shop gets its own code");
  assert.equal(b.rpc.check_code({ code: atUTea.code }).ok, true);
  assert.equal(b.rpc.check_code({ code: atDream.code }).ok, true, "both screens read VALID at once");
  assert.equal(b.rpc.redeem_by_code({ code: atUTea.code }).ok, true);
  const second = b.rpc.redeem_by_code({ code: atDream.code });
  assert.equal(second.ok, false);
  assert.equal(second.reason, "failed_already_redeemed");
  assert.equal(b.db.rewards.filter((r2) => r2.status === "redeemed").length, 1);
});

test("eight racing spends of two live codes for one reward resolve to one redemption", () => {
  const b = backend();
  const r = earn(b, 1)[0];
  const a = b.rpc.open_redemption({ reward_id: r.id, partner_id: U_TEA });
  const c = b.rpc.open_redemption({ reward_id: r.id, partner_id: DREAM });
  const codes = [a.code, c.code, a.code, c.code, a.code, c.code, a.code, c.code];
  const wins = codes.map((code) => b.rpc.redeem_by_code({ code })).filter((x) => x.ok);
  assert.equal(wins.length, 1);
});

test("a reward that expires between opening the card and paying is refused at the counter", () => {
  // The handoff code is only five minutes old and perfectly valid. The reward
  // behind it is not. Checking only the code is how a cashier honours a dead reward.
  const b = backend({
    policies: [{ id: "short", kind: "global_passport", required_minutes: 240, expires_days: 1 }],
    partners: [{ id: U_TEA, name: "U Tea", offer_text: "10% off your drink", policy_id: "short" }],
  });
  const r = earn(b, 1, 240)[0];
  assert.ok(r.expires_at, "the setup needs an expiring policy");
  b.setNow(r.expires_at - 60000);                       // one minute of life left
  const open = b.rpc.open_redemption({ reward_id: r.id, partner_id: U_TEA });
  assert.equal(open.ok, true);
  b.advance(2 * MIN);                                   // reward dies, code does not
  assert.ok(open.expires_at > b.now(), "the code must still be inside its own window");
  assert.equal(b.rpc.check_code({ code: open.code }).reason, "failed_expired");
  assert.equal(b.rpc.redeem_by_code({ code: open.code }).reason, "failed_expired");
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

test("reopening after a refusal does not resurrect the old code", () => {
  const b = backend();
  const r = earn(b, 1)[0];
  const first = b.rpc.open_redemption({ reward_id: r.id, partner_id: U_TEA });
  b.advance(6 * MIN);
  assert.equal(b.rpc.redeem_by_code({ code: first.code }).reason, "failed_code_expired");
  const second = b.rpc.open_redemption({ reward_id: r.id, partner_id: U_TEA });
  assert.notEqual(second.code, first.code, "a dead code must not be handed back as live");
  assert.equal(b.rpc.redeem_by_code({ code: first.code }).reason, "failed_code_expired");
  assert.equal(b.rpc.redeem_by_code({ code: second.code }).ok, true);
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. IDENTITY
// Switch users between every pair of calls. A refusal must not leak whose it is.
// ═════════════════════════════════════════════════════════════════════════════

test("a stolen reward id and an invented one produce byte-identical refusals", () => {
  // The oracle test. If refusing someone else's real reward looks different from
  // refusing a uuid that never existed, an attacker can enumerate which ids are
  // real, and a real id plus a shop name is enough to tell a barista a story.
  const b = backend();
  const r = earn(b, 1)[0];
  b.setUser("attacker");
  const stolen = b.rpc.open_redemption({ reward_id: r.id, partner_id: U_TEA });
  const invented = b.rpc.open_redemption({ reward_id: uuid(), partner_id: U_TEA });
  assert.equal(stolen.ok, false);
  assert.deepEqual(stolen, invented, "a real id must be indistinguishable from a fake one");
  assert.equal(stolen.reason, "failed_not_found");
});

test("a refusal carries no shop name, offer text or expiry to learn from", () => {
  const b = backend();
  const r = earn(b, 1)[0];
  b.setUser("attacker");
  const stolen = b.rpc.open_redemption({ reward_id: r.id, partner_id: U_TEA });
  assert.deepEqual(Object.keys(stolen).sort(), ["ok", "reason"]);
  b.setUser("user-anon-1");
  b.db.partners.get(U_TEA).active = false;
  const paused = b.rpc.open_redemption({ reward_id: r.id, partner_id: U_TEA });
  assert.deepEqual(Object.keys(paused).sort(), ["ok", "reason"], "even our own refusal stays terse");
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

test("switching users between issue and open cannot move a reward", () => {
  const b = backend();
  creditMinutes(b, 240);
  b.setUser("attacker");
  assert.equal(b.rpc.issue_my_rewards().length, 0, "our minutes are not theirs to issue against");
  b.setUser("user-anon-1");
  const mine = b.rpc.issue_my_rewards();
  assert.equal(mine.length, 1);
  assert.equal(mine[0].user_id, "user-anon-1");
});

test("a friend holding the six-character code CAN spend it, and it is still one drink", () => {
  // Documented, not a defect: supabase-reward-v2.sql's closing block says a live
  // screen share inside the five minutes works. redeem_by_code is deliberately
  // callable by anon, because the cashier has no account and installs nothing.
  // Pinned here so nobody later "fixes" it by adding an auth check that would
  // break every real counter.
  const b = backend();
  const r = earn(b, 1)[0];
  const open = b.rpc.open_redemption({ reward_id: r.id, partner_id: U_TEA });
  b.setUser("some-friend");
  assert.equal(b.rpc.redeem_by_code({ code: open.code }).ok, true);
  assert.equal(b.db.rewards[0].user_id, "user-anon-1", "it is still the owner's reward that burned");
  assert.equal(b.db.rewards.filter((x) => x.status === "redeemed").length, 1);
});

test("one account's spend does not touch another account's identical reward", () => {
  const b = backend();
  const mine = earn(b, 1)[0];
  b.setUser("student-2");
  const theirs = earn(b, 1)[0];
  b.setUser("user-anon-1");
  const open = b.rpc.open_redemption({ reward_id: mine.id, partner_id: U_TEA });
  b.rpc.redeem_by_code({ code: open.code });
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
  const open = b.rpc.open_redemption({ reward_id: r.id, partner_id: U_TEA });
  b.rpc.redeem_by_code({ code: open.code });
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
  assert.equal(b.rpc.open_redemption({ reward_id: r.id, partner_id: U_TEA }).reason, "failed_not_found");
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
  const open = b.rpc.open_redemption({ reward_id: r.id, partner_id: U_TEA });
  b.rpc.redeem_by_code({ code: open.code });
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
  assert.equal(b.rpc.open_redemption({ reward_id: before.id, partner_id: U_TEA }).ok, true);
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

// ═════════════════════════════════════════════════════════════════════════════
// 5. POLICY CONFUSION
// A reward presented under terms that no longer describe it.
// ═════════════════════════════════════════════════════════════════════════════

test("a passport reward is refused at a shop moved onto a different policy", () => {
  const b = backend();
  const r = earn(b, 1)[0];
  b.db.partners.get(DREAM).policy_id = "some-other-policy";
  const bad = b.rpc.open_redemption({ reward_id: r.id, partner_id: DREAM });
  assert.equal(bad.ok, false);
  assert.equal(bad.reason, "failed_wrong_partner");
  assert.equal(b.rpc.open_redemption({ reward_id: r.id, partner_id: U_TEA }).ok, true,
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
  assert.equal(b.rpc.open_redemption({ reward_id: r.id, partner_id: U_TEA }).ok, true);
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

  const open = b.rpc.open_redemption({ reward_id: r.id, partner_id: U_TEA });
  assert.equal(open.ok, true, "and the held reward is still spendable at the counter");
  assert.equal(b.rpc.redeem_by_code({ code: open.code }).ok, true);

  // Once it is spent, the retired policy drops out again: nothing is held under it.
  assert.equal(b.rpc.my_reward_state().policies.length, 0);
});

test("STILL OPEN — FINDING 2 residue: an offer changed BEFORE the card is opened is honoured", () => {
  // FINDING 2 IS ONLY HALF CLOSED, so this test still asserts the broken half as
  // it stands today.
  //
  // The original finding: issue_my_rewards only records an offer_version when the
  // POLICY names a partner (supabase-reward-v2.sql section 7), so every
  // global_passport reward is issued with offer_version NULL, and every version
  // check is guarded by `if offer_version is not null`. The check was dead code
  // under the passport model.
  //
  // WHAT IS FIXED: the handoff now pins the shop's offer_version at open, and
  // redeem_by_code checks it, so a shop that changes its offer while a card is
  // live is protected. The test below that one proves it.
  //
  // WHAT IS NOT: the reward itself still carries offer_version NULL, so a change
  // that lands BEFORE the card is opened is invisible. U Tea changes its offer,
  // bumps offer_version to be careful, and every reward every student is already
  // holding is honoured against the NEW wording. Below, a reward earned when the
  // offer was "10% off your drink" is spent as "one free large drink" and the
  // ledger records the shop as having agreed to give one away.
  //
  // Whether that is a HOLE or the intended meaning of a passport is a business
  // question, not a code one: a passport promises "a perk at any partner", not
  // "this exact perk". It is recorded here either way, because it is the version
  // of the finding that survives the fix, and it matters NOW — global_passport is
  // one of the two models the founder is being asked to choose between
  // (docs/network-v1/LEDGER.md, open decision 1) and the one matching v1 today.
  const b = backend();
  const r = earn(b, 1)[0];
  assert.equal(r.offer_version, null, "the passport reward carries no version of its own");

  const uTea = b.db.partners.get(U_TEA);
  uTea.offer_text = "one free large drink";
  uTea.offer_version = 9;

  const open = b.rpc.open_redemption({ reward_id: r.id, partner_id: U_TEA });
  assert.equal(open.ok, true, "the bump landed before the open, so the handoff pins 9 and agrees");
  assert.equal(b.rpc.redeem_by_code({ code: open.code }).ok, true);
  assert.equal(b.db.rewards[0].redeemed_offer_text, "one free large drink",
    "the shop is recorded as honouring an offer this reward never earned");

  // The contrast that proves it is the passport model and not a general failure:
  // the identical move under a partner_specific policy is correctly refused.
  const p = backend(PARTNER_ONLY());
  const pr = earn(p, 1)[0];
  assert.equal(pr.offer_version, 1);
  p.db.partners.get(U_TEA).offer_version = 2;
  assert.equal(p.rpc.open_redemption({ reward_id: pr.id, partner_id: U_TEA }).reason, "failed_offer_changed");
});

test("a passport shop that changes its offer mid-handoff is protected too", () => {
  // The half of FINDING 2 that IS closed, and the reason the fix exists: a
  // passport reward carries offer_version NULL, so before this the shop had no
  // moment at which a change could be caught at all. The handoff now pins the
  // shop's offer_version AT OPEN (supabase-reward-v2.sql section 9, the
  // redemption_handoffs insert; `offer_version: partner.offer_version` in
  // reward-mock.js openRedemption) and redeem_by_code compares against it.
  //
  // The attack: open the card while the offer reads "10% off your drink", then
  // change the offer and bump the version before walking to the counter. The
  // student would otherwise be handed a free large drink the reward never earned.
  const b = backend();
  const r = earn(b, 1)[0];
  assert.equal(r.offer_version, null, "still no version on the reward itself");

  const open = b.rpc.open_redemption({ reward_id: r.id, partner_id: U_TEA });
  assert.equal(open.offer_version, 1, "the card was opened against version 1");

  const uTea = b.db.partners.get(U_TEA);
  uTea.offer_text = "one free large drink";
  uTea.offer_version = 9;

  const spend = b.rpc.redeem_by_code({ code: open.code });
  assert.equal(spend.ok, false, "the pinned version catches the change");
  assert.equal(spend.reason, "failed_offer_changed");
  assert.equal(b.db.rewards[0].status, "issued", "and the student keeps the reward");
  assert.equal(b.db.rewards[0].redeemed_offer_text, null,
    "nothing is recorded against an offer the shop did not agree to honour here");
});

test("check_code refuses everything redeem_by_code refuses, so no cashier is surprised", () => {
  // CLOSED — was FINDING 15, found while flipping FINDINGS 1, 2, 7 and 8 and
  // caused by those very fixes.
  //
  // Both implementations state the invariant in a comment above the function:
  // "Every refusal redeem_by_code can raise must be reachable here too. If the
  // read-only check says VALID and the spend then refuses, the cashier finds out
  // in front of a queue." (reward-mock.js checkCode; the same words at
  // supabase-reward-v2.sql section 9.)
  //
  // Moving caps and the window into the shared gate, and pinning offer_version on
  // the handoff, added THREE refusals to redeem_by_code. check_code had learned
  // none of them, so the verification page read VALID on cards the spend was
  // about to refuse. Both now call redemption_gate() and compare the handoff's
  // pinned version.
  //
  // This test is the standing guard on that parity: any future refusal added to
  // the spend path and not to the check will redden it.

  // (a) failed_capped
  const capped = backend({
    policies: [{ id: "ithaca-passport", kind: "global_passport", required_minutes: 240 }],
    partners: [{ id: U_TEA, name: "U Tea", offer_text: "10% off your drink",
                 policy_id: "ithaca-passport", per_user_limit: 1 }],
  });
  const two = earn(capped, 2);
  const capA = capped.rpc.open_redemption({ reward_id: two[0].id, partner_id: U_TEA });
  const capB = capped.rpc.open_redemption({ reward_id: two[1].id, partner_id: U_TEA });
  assert.equal(capped.rpc.redeem_by_code({ code: capA.code }).ok, true);
  const cappedPeek = capped.rpc.check_code({ code: capB.code });
  assert.equal(cappedPeek.ok, false, "the cap is visible BEFORE the cashier acts");
  assert.equal(cappedPeek.reason, "failed_capped");
  assert.equal(capped.rpc.redeem_by_code({ code: capB.code }).reason, "failed_capped",
    "and the spend agrees with the check");

  // (b) failed_outside_window
  const shut = backend({
    policies: [{ id: "ithaca-passport", kind: "global_passport", required_minutes: 240 }],
    partners: [{ id: U_TEA, name: "U Tea", offer_text: "10% off your drink", policy_id: "ithaca-passport",
                 valid_from_minute: 14 * 60, valid_to_minute: 17 * 60 }],
  });
  const sr = earn(shut, 1)[0];
  const at1658 = new Date(shut.now());
  at1658.setHours(16, 58, 0, 0);
  shut.setNow(at1658.getTime());
  const late = shut.rpc.open_redemption({ reward_id: sr.id, partner_id: U_TEA });
  shut.advance(4 * MIN);                                    // 17:02, past the cutoff
  const shutPeek = shut.rpc.check_code({ code: late.code });
  assert.equal(shutPeek.ok, false, "the closed window is visible at 17:02");
  assert.equal(shutPeek.reason, "failed_outside_window");
  assert.equal(shut.rpc.redeem_by_code({ code: late.code }).reason, "failed_outside_window",
    "and the spend agrees with the check");

  // (c) failed_offer_changed, via the newly pinned handoff version
  const moved = backend();
  const mr = earn(moved, 1)[0];
  const mopen = moved.rpc.open_redemption({ reward_id: mr.id, partner_id: U_TEA });
  moved.db.partners.get(U_TEA).offer_version = 9;
  const peek = moved.rpc.check_code({ code: mopen.code });
  assert.equal(peek.ok, false, "the moved offer is visible via the handoff's pinned version");
  assert.equal(peek.reason, "failed_offer_changed");
  assert.equal(moved.rpc.redeem_by_code({ code: mopen.code }).reason, "failed_offer_changed",
    "and the spend agrees with the check");
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
    const open = b.rpc.open_redemption({ reward_id: r.id, partner_id: "newcomer-tea" });
    if (open.ok && b.rpc.redeem_by_code({ code: open.code }).ok) honoured++;
    b.advance(MIN);
  }
  assert.equal(honoured, 3, "day one at the new shop, three drinks it never earned the traffic for");
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. CAPS
// The only thing bounding a pilot shop's exposure.
// ═════════════════════════════════════════════════════════════════════════════

test("per_user_limit holds even when every card is opened before any is spent", () => {
  // THE ATTACK (was FINDING 1, the highest-severity finding in this file): the cap
  // used to be counted in open_redemption ONLY, from rows that were ALREADY
  // status='redeemed'. redeem_by_code never looked at per_user_limit or pilot_cap:
  // its refusal ladder was consumed_at, code expiry, partner active, reward status,
  // reward expiry, offer_version, and that was the complete list.
  //
  // So the check and the write were separated by the whole life of a handoff code.
  // Open one card per reward FIRST, while the redeemed count is still zero, every
  // one passes the cap, then spend them all and nothing recounts. No tooling
  // needed: tapping "show at the counter" on two rewards before paying for either
  // is a thing an ordinary student does by accident.
  //
  // NOW REFUSED. Caps live in the shared redemption_gate() (supabase-reward-v2.sql
  // section 9; `gate` in reward-mock.js), called by BOTH open and spend, so the
  // count happens under the same row lock that already makes double redemption
  // impossible. The attack still gets two live codes; the second one is refused
  // at the counter, which is where value actually moves.
  const b = backend({
    policies: [{ id: "ithaca-passport", kind: "global_passport", required_minutes: 240 }],
    partners: [{ id: U_TEA, name: "U Tea", offer_text: "10% off your drink",
                 policy_id: "ithaca-passport", per_user_limit: 1 }],
  });
  const rewards = earn(b, 2);
  assert.equal(rewards.length, 2);

  const first = b.rpc.open_redemption({ reward_id: rewards[0].id, partner_id: U_TEA });
  const second = b.rpc.open_redemption({ reward_id: rewards[1].id, partner_id: U_TEA });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true, "both opens still pass, because nothing is redeemed yet");

  assert.equal(b.rpc.redeem_by_code({ code: first.code }).ok, true);
  const twice = b.rpc.redeem_by_code({ code: second.code });
  assert.equal(twice.ok, false, "the spend recounts the cap");
  assert.equal(twice.reason, "failed_capped");

  const usedHere = b.db.rewards.filter((r) => r.status === "redeemed" && r.redeemed_partner_id === U_TEA);
  assert.equal(usedHere.length, 1, "the shop agreed to one per user and honoured one");
  assert.equal(b.db.rewards.filter((r) => r.status === "issued").length, 1,
    "and the refused reward is still in hand, not burned");
});

test("pilot_cap holds against the same open-everything-first order, across accounts", () => {
  // The pilot-wide cap is the number a shop is told bounds the whole trial. Same
  // attack shape as above (was FINDING 1): both students open their card while the
  // redeemed total is still zero, so both opens pass. The second SPEND is refused,
  // because redemption_gate() counts across every account, not just the caller's.
  const b = backend({
    policies: [{ id: "ithaca-passport", kind: "global_passport", required_minutes: 240 }],
    partners: [{ id: U_TEA, name: "U Tea", offer_text: "10% off your drink",
                 policy_id: "ithaca-passport", pilot_cap: 1 }],
  });
  const mine = earn(b, 1)[0];
  b.setUser("student-2");
  const theirs = earn(b, 1)[0];

  b.setUser("user-anon-1");
  const a = b.rpc.open_redemption({ reward_id: mine.id, partner_id: U_TEA });
  b.setUser("student-2");
  const c = b.rpc.open_redemption({ reward_id: theirs.id, partner_id: U_TEA });
  assert.equal(a.ok, true);
  assert.equal(c.ok, true);

  assert.equal(b.rpc.redeem_by_code({ code: a.code }).ok, true);
  const over = b.rpc.redeem_by_code({ code: c.code });
  assert.equal(over.ok, false, "the second account's spend is refused");
  assert.equal(over.reason, "failed_capped");
  assert.equal(b.db.rewards.filter((r) => r.status === "redeemed").length, 1,
    "pilot_cap was 1 and the pilot delivered 1");
});

test("caps DO hold when cards are opened one at a time, which is the honest path", () => {
  // The honest path, which was correct even before FINDING 1 was closed and must
  // stay correct after it: open, pay, open, pay is refused at the limit, and the
  // refusal happens at OPEN, before the student is standing at a counter. Moving
  // the cap into the shared gate must not have cost that early warning.
  const b = backend({
    policies: [{ id: "ithaca-passport", kind: "global_passport", required_minutes: 240 }],
    partners: [{ id: U_TEA, name: "U Tea", offer_text: "10% off your drink",
                 policy_id: "ithaca-passport", per_user_limit: 2 }],
  });
  const rewards = earn(b, 3);
  const outcomes = rewards.map((r) => {
    const open = b.rpc.open_redemption({ reward_id: r.id, partner_id: U_TEA });
    return open.ok ? (b.rpc.redeem_by_code({ code: open.code }).ok ? "spent" : "spend refused")
                   : "open refused: " + open.reason;
  });
  assert.deepEqual(outcomes, ["spent", "spent", "open refused: failed_capped"]);
});

test("a FAILED redemption must not consume cap headroom", () => {
  // A dead code, a paused shop or a bumped offer are all things that happen at the
  // counter through nobody's fault. If a refusal ate a slot, one flaky moment
  // would silently cost the student a reward the shop never gave them.
  const b = backend({
    policies: [{ id: "ithaca-passport", kind: "global_passport", required_minutes: 240 }],
    partners: [{ id: U_TEA, name: "U Tea", offer_text: "10% off your drink",
                 policy_id: "ithaca-passport", per_user_limit: 2 }],
  });
  const rewards = earn(b, 2);

  const doomed = b.rpc.open_redemption({ reward_id: rewards[0].id, partner_id: U_TEA });
  b.advance(6 * MIN);
  assert.equal(b.rpc.redeem_by_code({ code: doomed.code }).reason, "failed_code_expired");
  b.rpc.redeem_by_code({ code: "AAAAAA" });                     // a guessed code, also a failure
  b.setUser("attacker");
  b.rpc.open_redemption({ reward_id: rewards[1].id, partner_id: U_TEA });   // a refused probe
  b.setUser("user-anon-1");

  for (const r of rewards) {
    const open = b.rpc.open_redemption({ reward_id: r.id, partner_id: U_TEA });
    assert.equal(open.ok, true, "headroom must be intact after three failures");
    assert.equal(b.rpc.redeem_by_code({ code: open.code }).ok, true);
  }
  assert.equal(b.db.rewards.filter((r) => r.status === "redeemed").length, 2);
});

test("a code opened inside the window cannot be spent after the window closes", () => {
  // THE ATTACK (was FINDING 7, smaller than the cap hole but the same shape):
  // valid_days and the valid_from/valid_to window used to be checked ONLY in
  // open_redemption. Open a card at 16:58 and the five-minute code carried it to
  // 17:03, past the 17:00 the shop agreed to, so "afternoons only" was not what it
  // said on the tin and a shop that set a window for a staffing reason would notice.
  //
  // NOW REFUSED. The window is inside the shared redemption_gate()
  // (supabase-reward-v2.sql section 9; `gate` in reward-mock.js), so it is
  // re-checked at spend with a reason that names the clock.
  const b = backend({
    policies: [{ id: "ithaca-passport", kind: "global_passport", required_minutes: 240 }],
    partners: [{ id: U_TEA, name: "U Tea", offer_text: "10% off your drink", policy_id: "ithaca-passport",
                 valid_from_minute: 14 * 60, valid_to_minute: 17 * 60 }],
  });
  const r = earn(b, 1)[0];
  const inside = new Date(b.now());
  inside.setHours(16, 58, 0, 0);
  b.setNow(inside.getTime());

  const open = b.rpc.open_redemption({ reward_id: r.id, partner_id: U_TEA });
  assert.equal(open.ok, true, "16:58 is inside the agreed window");
  b.advance(4 * MIN);
  assert.equal(new Date(b.now()).getHours(), 17);
  assert.equal(new Date(b.now()).getMinutes(), 2, "17:02, outside the window");
  const late = b.rpc.redeem_by_code({ code: open.code });
  assert.equal(late.ok, false, "the still-live code does not outlive the window");
  assert.equal(late.reason, "failed_outside_window");
  assert.equal(b.db.rewards[0].status, "issued", "and the student keeps the reward for tomorrow");

  // The same code inside the hours still works, so this refuses the clock and not
  // the code: 16:59 is one minute before the cutoff.
  const ok = new Date(b.now());
  ok.setHours(16, 59, 0, 0);
  b.setNow(ok.getTime());
  assert.equal(b.rpc.redeem_by_code({ code: open.code }).ok, true);
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
  const b = backend({
    policies: [{ id: "ithaca-passport", kind: "global_passport", required_minutes: 240 }],
    partners: [{ id: U_TEA, name: "U Tea", offer_text: "10% off your drink", policy_id: "ithaca-passport",
                 valid_from_minute: 22 * 60, valid_to_minute: 2 * 60 }],
  });
  const r = earn(b, 1)[0];
  const at = (hour) => {
    const t = new Date(b.now());
    t.setHours(hour, 30, 0, 0);
    b.setNow(t.getTime());
    return b.rpc.open_redemption({ reward_id: r.id, partner_id: U_TEA });
  };
  for (const hour of [22, 23, 0, 1]) {
    assert.equal(at(hour).ok, true, hour + ":30 is inside the 22:00-to-02:00 window");
  }
  for (const hour of [2, 12, 21]) {
    const shut = at(hour);
    assert.equal(shut.ok, false, hour + ":30 is outside the window and must be refused");
    assert.equal(shut.reason, "failed_outside_window", "and the reason names the clock, not caps");
  }
  // End to end at an hour the shop is actually open.
  const open = at(23);
  assert.equal(b.rpc.redeem_by_code({ code: open.code }).ok, true);
});

test("pulling a shop refuses cleanly at every surface, and never crashes the counter", () => {
  // CLOSED — was FINDING 5, which contradicted the operating instructions.
  //
  // CLAUDE.md documents removal as the kill switch: "Pulling a shop is the same
  // edit in reverse, which is what lets us keep the promise the pitch makes: they
  // come off the app the day they ask." Under Reward V2 that used to break twice:
  //
  //   Server side: redemption_handoffs.partner_id referenced partners(id) with no
  //   ON DELETE, so once anybody had opened a card there the DELETE failed on a
  //   foreign key violation and the shop could not be removed at all. It now
  //   CASCADEs: a handoff lives five minutes and must never be the reason a shop
  //   cannot be pulled.
  //
  //   Mock side: a vanished partner left the handoff dangling, and check_code and
  //   redeem_by_code dereferenced an undefined partner and THREW, so a cashier
  //   page showed a crash rather than "this shop is no longer a partner". Both now
  //   refuse with failed_not_found.
  //
  // STILL TRUE BY DESIGN, and it is the right trade: a shop that has actually had
  // a redemption cannot be DELETEd, because reward_instances.redeemed_partner_id
  // is deliberately not cascaded. Deleting it would erase the merchant report that
  // proves what was honoured. active = false is the correct pull for a shop that
  // has traded, it refuses cleanly, it keeps the history, and it is reversible.
  // reward-config.js already models it that way ("active:false is a PAUSE").
  const b = backend();
  const r = earn(b, 1)[0];
  const open = b.rpc.open_redemption({ reward_id: r.id, partner_id: U_TEA });

  b.loadConfig({
    policies: [{ id: "ithaca-passport", kind: "global_passport", required_minutes: 240 }],
    partners: [{ id: DREAM, name: "Dream Tea & Poké", offer_text: "5% off your drink",
                 policy_id: "ithaca-passport" }],
  });

  // Every surface refuses, and nothing throws.
  const gone = b.rpc.check_code({ code: open.code });
  assert.equal(gone.ok, false, "the cashier's read-only check refuses instead of crashing");
  assert.equal(gone.reason, "failed_not_found");
  const spend = b.rpc.redeem_by_code({ code: open.code });
  assert.equal(spend.ok, false, "and so does the spend");
  assert.equal(spend.reason, "failed_not_found");
  assert.equal(b.db.rewards[0].status, "issued", "and the reward is not burned by a pulled shop");
  assert.equal(b.rpc.open_redemption({ reward_id: r.id, partner_id: U_TEA }).reason, "failed_not_found");

  // The safe pull, for contrast: everything refuses with a reason a human can read.
  const paused = backend();
  const pr = earn(paused, 1)[0];
  const popen = paused.rpc.open_redemption({ reward_id: pr.id, partner_id: U_TEA });
  paused.db.partners.get(U_TEA).active = false;
  assert.equal(paused.rpc.check_code({ code: popen.code }).reason, "failed_partner_paused");
  assert.equal(paused.rpc.redeem_by_code({ code: popen.code }).reason, "failed_partner_paused");
  assert.equal(paused.db.rewards[0].status, "issued", "and the student keeps the reward");
});

test("a consumed handoff code is never minted again, and exhaustion fails cleanly", () => {
  // THE ATTACK (was FINDING 12, vanishingly unlikely but unhandled in both
  // implementations): gen_handoff_code used to loop until the candidate was not an
  // UNCONSUMED, UNEXPIRED handoff. Consumed and expired rows are invisible to that
  // test but still present, because `code` is the table's PRIMARY KEY and the
  // section 12 cleanup only deletes rows expired more than seven days ago. So a
  // collision with a consumed row returned happily and then exploded on the INSERT
  // with an unhandled unique_violation; the mock was worse in its own way, because
  // Map.set silently OVERWROTE the consumed row and destroyed the audit trail of
  // the redemption it had recorded.
  //
  // NOW REFUSED, and the loop is BOUNDED at 60 tries (supabase-reward-v2.sql
  // section 9 gen_handoff_code; the same 60 in reward-mock.js openRedemption), so
  // a degenerate RNG fails cleanly instead of spinning forever inside a
  // transaction. This test forces exactly that: random() is pinned to 0, so every
  // one of the 60 draws is "AAAAAA", the taken code is correctly rejected all 60
  // times, and the open returns failed_code_unavailable.
  const b = createBackend({ now: T0, random: () => 0 });   // every draw is "A"
  b.loadConfig(PASSPORT());
  creditMinutes(b, 480);
  const rewards = b.rpc.issue_my_rewards();

  const first = b.rpc.open_redemption({ reward_id: rewards[0].id, partner_id: U_TEA });
  assert.equal(first.code, "AAAAAA");
  assert.equal(b.rpc.redeem_by_code({ code: first.code }).ok, true);
  assert.ok(b.db.handoffs.get("AAAAAA").consumed_at, "the row is consumed, not gone");

  const second = b.rpc.open_redemption({ reward_id: rewards[1].id, partner_id: U_TEA });
  assert.equal(second.ok, false, "the taken code is not handed out a second time");
  assert.equal(second.reason, "failed_code_unavailable");
  assert.equal(b.db.handoffs.size, 1, "and the consumed audit row survives untouched");
  assert.equal(b.db.handoffs.get("AAAAAA").reward_id, rewards[0].id);
  assert.ok(b.db.handoffs.get("AAAAAA").consumed_at);
  assert.equal(b.db.rewards.find((r) => r.id === rewards[1].id).status, "issued",
    "the second reward is untouched, so a working RNG spends it later");

  // NOTE — the mock and the SQL do NOT agree on the SHAPE of this refusal. The
  // mock returns { ok:false, reason:'failed_code_unavailable' } and logs an event
  // with that outcome; supabase-reward-v2.sql raises errcode P0004 out of
  // gen_handoff_code with no handler in open_redemption, and
  // 'failed_code_unavailable' is not one of the values redemption_events.outcome's
  // CHECK constraint allows (section 6). Both refuse rather than re-mint, which is
  // the invariant under test and is what this test pins, but the client sees a
  // reason string in one and a raised exception in the other. Recorded here as a
  // STILL-OPEN mock/SQL divergence rather than silently asserted away.
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
  const night = half.rpc.open_redemption({ reward_id: hr.id, partner_id: U_TEA });
  assert.equal(night.ok, false, "from=14:00 with no to= must not redeem at 3am");
  assert.equal(night.reason, "failed_outside_window");

  // And it is the half-set pair that is refused, not the hour: 15:00 is squarely
  // inside what the shop meant and is refused too, because the rule is unreadable.
  const threePm = new Date(half.now());
  threePm.setHours(15, 0, 0, 0);
  half.setNow(threePm.getTime());
  assert.equal(half.rpc.open_redemption({ reward_id: hr.id, partner_id: U_TEA }).reason,
    "failed_outside_window", "a half-set window is refused at every hour, on purpose");

  // The mirror: the other half missing is refused the same way.
  const other = backend({
    policies: [{ id: "ithaca-passport", kind: "global_passport", required_minutes: 240 }],
    partners: [{ id: U_TEA, name: "U Tea", offer_text: "10% off your drink",
                 policy_id: "ithaca-passport", valid_from_minute: null, valid_to_minute: 17 * 60 }],
  });
  const or = earn(other, 1)[0];
  assert.equal(other.rpc.open_redemption({ reward_id: or.id, partner_id: U_TEA }).reason,
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
  assert.equal(whole.rpc.open_redemption({ reward_id: wr.id, partner_id: U_TEA }).ok, true);
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
  const open = b.rpc.open_redemption({ reward_id: r.id, partner_id: U_TEA });
  b.rpc.redeem_by_code({ code: open.code });
  assert.equal(b.db.rewards[0].status, "redeemed");

  // Everything the contract exposes, fired at the spent reward.
  for (let i = 0; i < 5; i++) {
    b.rpc.issue_my_rewards();
    b.rpc.my_reward_state();
    b.rpc.open_redemption({ reward_id: r.id, partner_id: U_TEA });
    b.rpc.open_redemption({ reward_id: r.id, partner_id: DREAM });
    b.rpc.check_code({ code: open.code });
    b.rpc.redeem_by_code({ code: open.code });
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
  const open = b.rpc.open_redemption({ reward_id: r.id, partner_id: U_TEA });
  b.rpc.redeem_by_code({ code: open.code });
  const snapshot = JSON.stringify(b.db.rewards.find((x) => x.id === r.id));

  const uTea = b.db.partners.get(U_TEA);
  uTea.offer_text = "one free large drink";
  uTea.offer_version = 5;
  uTea.name = "U Tea (renamed)";
  b.advance(30 * DAY);
  creditMinutes(b, 480);
  b.rpc.issue_my_rewards();
  b.rpc.open_redemption({ reward_id: r.id, partner_id: U_TEA });
  b.rpc.redeem_by_code({ code: open.code });
  b.rpc.check_code({ code: open.code });

  assert.equal(JSON.stringify(b.db.rewards.find((x) => x.id === r.id)), snapshot,
    "the whole redeemed row is frozen");
  assert.equal(b.db.rewards.find((x) => x.id === r.id).redeemed_offer_text, "10% off your drink");
});

test("a failed second spend does not overwrite when or where the first one happened", () => {
  const b = backend();
  const r = earn(b, 1)[0];
  const open = b.rpc.open_redemption({ reward_id: r.id, partner_id: U_TEA });
  b.rpc.redeem_by_code({ code: open.code });
  const at = b.db.rewards[0].redeemed_at;
  b.advance(2 * DAY);
  b.rpc.redeem_by_code({ code: open.code });
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
  const open = b.rpc.open_redemption({ reward_id: r.id, partner_id: U_TEA });
  b.rpc.redeem_by_code({ code: open.code });
  const report = b.rpc.partner_report({ partner_id: U_TEA, days: 30 });
  const serialised = JSON.stringify(report);

  assert.equal(serialised.indexOf("user-anon-1"), -1, "no account id reaches a shop");
  assert.equal(serialised.indexOf(r.id), -1, "no reward id either");
  assert.equal(serialised.indexOf(open.code), -1, "and no handoff code");
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
  const open = b.rpc.open_redemption({ reward_id: r.id, partner_id: U_TEA });
  b.rpc.redeem_by_code({ code: open.code });
  for (const days of [NaN, Infinity, -Infinity, -1, 0, null, undefined, "30", 1e9, 365, 366]) {
    const report = b.rpc.partner_report({ partner_id: U_TEA, days });
    assert.ok(report.window_days >= 1 && report.window_days <= 365,
      "days=" + String(days) + " gave window " + report.window_days);
  }
});

test("one shop's report never counts another shop's redemptions or refusals", () => {
  const b = backend();
  const rewards = earn(b, 2);
  const atUTea = b.rpc.open_redemption({ reward_id: rewards[0].id, partner_id: U_TEA });
  b.rpc.redeem_by_code({ code: atUTea.code });
  const atDream = b.rpc.open_redemption({ reward_id: rewards[1].id, partner_id: DREAM });
  b.rpc.redeem_by_code({ code: atDream.code });
  b.rpc.redeem_by_code({ code: atDream.code });        // a refusal, at Dream only

  const uTea = b.rpc.partner_report({ partner_id: U_TEA, days: 30 });
  const dream = b.rpc.partner_report({ partner_id: DREAM, days: 30 });
  assert.equal(uTea.redemptions, 1);
  assert.equal(dream.redemptions, 1);
  assert.deepEqual(uTea.rejected, [], "U Tea did not cause Dream's refusal and is not shown it");
  assert.equal(dream.rejected.find((x) => x.reason === "failed_already_redeemed").n, 1);
});

test("guessing codes at random cannot pollute a specific shop's report", () => {
  // redeem_by_code is anon-callable by design, so anyone can hammer it. A miss
  // logs with no partner_id, so a shop's rejection list stays a record of what
  // happened at ITS counter rather than of internet noise.
  const b = backend();
  const r = earn(b, 1)[0];
  const open = b.rpc.open_redemption({ reward_id: r.id, partner_id: U_TEA });
  b.rpc.redeem_by_code({ code: open.code });
  for (let i = 0; i < 200; i++) b.rpc.redeem_by_code({ code: "ZZZZZ" + "23456789"[i % 8] });
  const report = b.rpc.partner_report({ partner_id: U_TEA, days: 30 });
  assert.equal(report.redemptions, 1);
  assert.deepEqual(report.rejected, []);
});
