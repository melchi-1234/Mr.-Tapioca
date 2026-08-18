// Reward V2 session ledger: idempotency, overlap, impossible durations, the
// daily ceiling, and the web-ineligibility rule.
//
// These run against reward-mock.js, the reference implementation of the same
// contract supabase-reward-v2.sql implements. Passing here proves the CONTRACT
// and anything built on it. It does NOT execute the Postgres — see the header of
// reward-mock.js. Where a guarantee comes from the database (a partial unique
// index, a conditional UPDATE) the assertion below names it.
const test = require("node:test");
const assert = require("node:assert");
const { createBackend, uuid } = require("../reward-mock.js");

const T0 = Date.UTC(2026, 7, 12, 9, 0, 0);   // fixed clock: 2026-08-12 09:00 UTC
const MIN = 60000;

function backend() {
  const b = createBackend({ now: T0 });
  b.loadConfig({
    policies: [{ id: "ithaca-passport", kind: "global_passport", required_minutes: 240, expires_days: null }],
    partners: [
      { id: "u-tea-collegetown", name: "U Tea", offer_text: "10% off your drink", policy_id: "ithaca-passport" },
      { id: "dream-tea-poke-ithaca", name: "Dream Tea & Poké", offer_text: "5% off your drink", policy_id: "ithaca-passport" },
    ],
  });
  return b;
}

// Run a full session of `mins` real minutes on the server clock.
function runSession(b, mins, over) {
  const id = uuid();
  const start = b.rpc.start_reward_session(Object.assign(
    { session_id: id, planned_minutes: mins, platform: "ios" }, over || {}));
  b.advance(mins * MIN);
  const done = b.rpc.complete_reward_session({ session_id: id });
  return { id, start, done };
}

// ── idempotency ──────────────────────────────────────────────────────────────
test("starting the same session id twice returns the same session", () => {
  const b = backend();
  const id = uuid();
  const a = b.rpc.start_reward_session({ session_id: id, planned_minutes: 60, platform: "ios" });
  const c = b.rpc.start_reward_session({ session_id: id, planned_minutes: 60, platform: "ios" });
  assert.equal(a.ok, true);
  assert.equal(c.ok, true);
  assert.equal(c.id, a.id);
  assert.equal(c.started_at, a.started_at, "the server clock is not restarted by a retry");
  assert.equal(c.replayed, true);
  assert.equal(b.db.sessions.size, 1, "a retry must not open a second session");
});

test("completing the same session twice credits once", () => {
  const b = backend();
  const id = uuid();
  b.rpc.start_reward_session({ session_id: id, planned_minutes: 60, platform: "ios" });
  b.advance(60 * MIN);
  const first = b.rpc.complete_reward_session({ session_id: id });
  const second = b.rpc.complete_reward_session({ session_id: id });
  assert.equal(first.credited_minutes, 60);
  assert.equal(second.credited_minutes, 60);
  assert.equal(second.replayed, true);
  assert.equal(b.eligibleMinutes(), 60, "double completion must not double credit");
});

test("a replayed completion much later still credits nothing extra", () => {
  const b = backend();
  const id = uuid();
  b.rpc.start_reward_session({ session_id: id, planned_minutes: 60, platform: "ios" });
  b.advance(60 * MIN);
  b.rpc.complete_reward_session({ session_id: id });
  b.advance(6 * 60 * MIN);
  b.rpc.complete_reward_session({ session_id: id });
  assert.equal(b.eligibleMinutes(), 60);
});

// ── overlap ──────────────────────────────────────────────────────────────────
test("a second session cannot open while one is active", () => {
  // In Postgres this is the partial unique index reward_sessions_one_active,
  // so two simultaneous starts cannot both win.
  const b = backend();
  b.rpc.start_reward_session({ session_id: uuid(), planned_minutes: 60, platform: "ios" });
  const second = b.rpc.start_reward_session({ session_id: uuid(), planned_minutes: 60, platform: "ios" });
  assert.equal(second.ok, false);
  assert.equal(second.reason, "session_already_open");
});

test("overlapping sessions cannot be used to farm minutes", () => {
  const b = backend();
  // Try to open ten sessions and let one hour of real time credit all of them.
  const ids = [];
  for (let i = 0; i < 10; i++) {
    const id = uuid();
    ids.push(id);
    b.rpc.start_reward_session({ session_id: id, planned_minutes: 60, platform: "ios" });
  }
  b.advance(60 * MIN);
  ids.forEach((id) => b.rpc.complete_reward_session({ session_id: id }));
  assert.equal(b.eligibleMinutes(), 60, "one hour of wall clock is one hour of credit");
});

test("a session that follows a completed one is allowed", () => {
  const b = backend();
  runSession(b, 60);
  const second = b.rpc.start_reward_session({ session_id: uuid(), planned_minutes: 60, platform: "ios" });
  assert.equal(second.ok, true);
});

test("explicit abandonment credits zero even after the entire planned time elapsed", () => {
  const b = backend();
  const id = uuid();
  b.rpc.start_reward_session({ session_id: id, planned_minutes: 60, platform: "ios" });
  b.advance(60 * MIN);

  const abandoned = b.rpc.abandon_reward_session({ session_id: id });

  assert.equal(abandoned.ok, true);
  assert.equal(abandoned.state, "abandoned");
  assert.equal(abandoned.credited_minutes, 0);
  assert.equal(abandoned.eligible_minutes, 0);
  assert.equal(b.eligibleMinutes(), 0,
    "pause/reset must never convert elapsed server wall time into merchant credit");
});

test("abandonment is idempotent and releases the one-active-session lock", () => {
  const b = backend();
  const id = uuid();
  b.rpc.start_reward_session({ session_id: id, planned_minutes: 60, platform: "ios" });

  const first = b.rpc.abandon_reward_session({ session_id: id });
  const replay = b.rpc.abandon_reward_session({ session_id: id });
  const next = b.rpc.start_reward_session({ session_id: uuid(), planned_minutes: 60, platform: "ios" });

  assert.deepEqual(replay, { ...first, replayed: true });
  assert.equal(next.ok, true);
  assert.equal(b.eligibleMinutes(), 0);
});

test("abandon and complete preserve whichever terminal transition won first", () => {
  const abandonedFirst = backend();
  const abandonedId = uuid();
  abandonedFirst.rpc.start_reward_session({ session_id: abandonedId, planned_minutes: 60, platform: "ios" });
  abandonedFirst.advance(60 * MIN);
  abandonedFirst.rpc.abandon_reward_session({ session_id: abandonedId });
  const completionReplay = abandonedFirst.rpc.complete_reward_session({ session_id: abandonedId });
  assert.equal(completionReplay.state, "abandoned");
  assert.equal(completionReplay.credited_minutes, 0);
  assert.equal(abandonedFirst.eligibleMinutes(), 0);

  const completedFirst = backend();
  const completedId = uuid();
  completedFirst.rpc.start_reward_session({ session_id: completedId, planned_minutes: 60, platform: "ios" });
  completedFirst.advance(60 * MIN);
  completedFirst.rpc.complete_reward_session({ session_id: completedId });
  const abandonReplay = completedFirst.rpc.abandon_reward_session({ session_id: completedId });
  assert.equal(abandonReplay.state, "completed");
  assert.equal(abandonReplay.credited_minutes, 60,
    "a late abandon retry must not erase credit already committed by completion");
  assert.equal(completedFirst.eligibleMinutes(), 60);
});

test("abandonment does not reveal whether a guessed session belongs to someone else", () => {
  const b = backend();
  const mine = uuid();
  b.rpc.start_reward_session({ session_id: mine, planned_minutes: 60, platform: "ios" });
  b.setUser("attacker");

  const stolen = b.rpc.abandon_reward_session({ session_id: mine });
  const missing = b.rpc.abandon_reward_session({ session_id: uuid() });

  assert.deepEqual(stolen, missing);
  assert.equal(stolen.reason, "no_such_session");
});

test("a stale active session is swept so it cannot block forever", () => {
  const b = backend();
  b.rpc.start_reward_session({ session_id: uuid(), planned_minutes: 60, platform: "ios" });
  b.advance(13 * 60 * MIN);                       // app killed, row left open
  const next = b.rpc.start_reward_session({ session_id: uuid(), planned_minutes: 60, platform: "ios" });
  assert.equal(next.ok, true, "a killed app must not lock the user out of rewards");
});

// ── impossible durations ─────────────────────────────────────────────────────
test("completing instantly credits nothing", () => {
  const b = backend();
  const id = uuid();
  b.rpc.start_reward_session({ session_id: id, planned_minutes: 240, platform: "ios" });
  const done = b.rpc.complete_reward_session({ session_id: id });   // zero elapsed
  assert.equal(done.state, "abandoned");
  assert.equal(done.credited_minutes, 0);
  assert.equal(b.eligibleMinutes(), 0);
});

test("a four-hour session completed after one minute credits nothing", () => {
  // The whole attack in one line: ask for the reward threshold, finish at once.
  const b = backend();
  const id = uuid();
  b.rpc.start_reward_session({ session_id: id, planned_minutes: 240, platform: "ios" });
  b.advance(1 * MIN);
  const done = b.rpc.complete_reward_session({ session_id: id });
  assert.equal(done.credited_minutes, 0);
});

test("credit is capped at the elapsed wall clock, not the planned time", () => {
  const b = backend();
  const id = uuid();
  b.rpc.start_reward_session({ session_id: id, planned_minutes: 240, platform: "ios" });
  b.advance(30 * MIN);
  const done = b.rpc.complete_reward_session({ session_id: id });
  assert.equal(done.credited_minutes, 30);
});

test("credit is also capped at the planned time, not the elapsed clock", () => {
  // Leaving a 30-minute session open for six hours must not bank six hours.
  const b = backend();
  const id = uuid();
  b.rpc.start_reward_session({ session_id: id, planned_minutes: 30, platform: "ios" });
  b.advance(6 * 60 * MIN);
  const done = b.rpc.complete_reward_session({ session_id: id });
  assert.equal(done.credited_minutes, 30);
});

test("planned minutes outside 5..480 are refused at start", () => {
  const b = backend();
  for (const bad of [0, 1, 4, 481, 10000, -60, NaN, null, undefined, "60"]) {
    const r = b.rpc.start_reward_session({ session_id: uuid(), planned_minutes: bad, platform: "ios" });
    assert.equal(r.ok, false, "planned_minutes " + bad + " must be refused");
    assert.equal(r.reason, "planned_out_of_range");
  }
});

test("a session left open past 12 hours is abandoned, not credited", () => {
  const b = backend();
  const id = uuid();
  b.rpc.start_reward_session({ session_id: id, planned_minutes: 480, platform: "ios" });
  b.advance(13 * 60 * MIN);
  const done = b.rpc.complete_reward_session({ session_id: id });
  assert.equal(done.state, "abandoned");
  assert.equal(done.credited_minutes, 0);
});

test("the daily ceiling stops an impossible day", () => {
  const b = backend();
  let total = 0;
  // Sixteen back-to-back 60-minute sessions in one calendar day.
  for (let i = 0; i < 16; i++) {
    const r = runSession(b, 60);
    total += r.done.credited_minutes;
  }
  assert.equal(b.eligibleMinutes(), 720, "12 h/day is the ceiling");
  assert.equal(total, 720);
});

test("the ceiling resets on the next calendar day", () => {
  const b = backend();
  for (let i = 0; i < 13; i++) runSession(b, 60);
  assert.equal(b.eligibleMinutes(), 720);
  b.setNow(T0 + 26 * 60 * MIN);                    // next day
  runSession(b, 60);
  assert.equal(b.eligibleMinutes(), 780);
});

// ── unknown / stolen sessions ────────────────────────────────────────────────
test("completing an unknown session id fails", () => {
  const b = backend();
  const r = b.rpc.complete_reward_session({ session_id: uuid() });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "no_such_session");
});

test("another account's session cannot be started or completed", () => {
  const b = backend();
  const id = uuid();
  b.rpc.start_reward_session({ session_id: id, planned_minutes: 60, platform: "ios" });
  b.setUser("attacker");
  const s = b.rpc.start_reward_session({ session_id: id, planned_minutes: 60, platform: "ios" });
  assert.equal(s.ok, false);
  assert.equal(s.reason, "not_your_session");
  const c = b.rpc.complete_reward_session({ session_id: id });
  assert.equal(c.ok, false);
  assert.equal(c.reason, "not_your_session");
});

// ── the web rule ─────────────────────────────────────────────────────────────
test("web sessions never create redeemable minutes", () => {
  const b = backend();
  runSession(b, 240, { platform: "web" });
  assert.equal(b.eligibleMinutes(), 0, "a browser tab cannot block anything");
  assert.equal(b.rpc.issue_my_rewards().length, 0);
});

test("web sessions are still recorded, just not redeemable", () => {
  const b = backend();
  const r = runSession(b, 240, { platform: "web" });
  assert.equal(r.done.state, "completed");
  assert.equal(r.done.credited_minutes, 240, "the session is real, the reward eligibility is not");
  assert.equal(b.eligibleMinutes(), 0);
});

test("a bad platform string is refused rather than defaulted", () => {
  const b = backend();
  for (const p of ["android", "IOS", "", null, undefined, "native"]) {
    const r = b.rpc.start_reward_session({ session_id: uuid(), planned_minutes: 60, platform: p });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "bad_platform");
  }
});

test("mixing web and native only counts the native half", () => {
  const b = backend();
  runSession(b, 120, { platform: "web" });
  runSession(b, 120, { platform: "ios" });
  assert.equal(b.eligibleMinutes(), 120);
});

// ── the shield claim is evidence, never proof ────────────────────────────────
test("shield_claimed is recorded but does not gate eligibility", () => {
  // Recording it is useful. Treating it as proof would be a lie: it is a client
  // assertion and nothing here can verify Screen Time was enforcing anything.
  const b = backend();
  const r = runSession(b, 60, { shield_claimed: false });
  assert.equal(b.eligibleMinutes(), 60);
  assert.equal(b.db.sessions.get(r.id).shield_claimed, false);
});
