// Pearl economy — regression lock.
//
// The economy rule in CLAUDE.md is: "pearls come from real focus time (~4/hour).
// Never introduce a way to farm or double-credit pearls." This suite pins the
// exact arithmetic that keeps that promise so a future refactor can't silently
// change the rate, drop the blocked/unblocked penalty, or re-open a farm.
//
// It runs the REAL logic out of app.js — the functions are text-extracted from
// the source and evaluated in a vm sandbox against a plain `state` object, the
// same "extract and run a real function" approach the other app.js tests use
// (see map-marker-priority / reward-native-gate). Nothing here is a copy of the
// math: if the formula in app.js changes, the extracted code changes with it and
// these tests move, which is the point.
//
// Run: node --test tests/
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const APP = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");

// ── Extraction ───────────────────────────────────────────────────────────────
// Pull a top-level `function NAME(...) {...}` out of the source by brace-matching
// from its declaration to the matching close. The target functions carry no
// unbalanced brace inside a string/comment, so a plain depth counter is exact.
function extractFn(src, name) {
  const start = src.indexOf("function " + name + "(");
  if (start < 0) throw new Error("function not found in app.js: " + name);
  let depth = 0;
  let i = src.indexOf("{", start);
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(start, i);
}

// The unblocked multiplier constant, read from source (not hard-coded here).
const FRACTION_LIT = APP.match(/const REWARD_UNBLOCKED_FRACTION = ([0-9.]+);/)[1];

// The NaN/negative healer that loadState() runs over every economy field.
const NUM_EXPR = APP.match(/const num = (\(v, d, min = 0\) => [^;]+);/)[1];

// The session-banking arithmetic is inline in doneFocus(), not a named function.
// Lift the exact block (oldTotal → the blockPenalty reconcile) and wrap it, so
// the real formula runs with `minutes`/`wasBlocked` as inputs.
const BANK_BLOCK = APP.match(
  /const oldTotal = totalMinutes\(\);[\s\S]*?else if \(pearlDelta < 0\) state\.blockPenalty \+= -pearlDelta;/
)[0];
const BANK_SRC =
  "function bankSession(minutes, wasBlocked) {\n" + BANK_BLOCK +
  "\n  return { oldTotal, fullPearls, share, awardedExact, pearlsEarned, pearlDelta };\n}";

// Load the whole economy toolkit bound to one `state` object. Each test builds a
// fresh state and gets its own sandbox, so tests never bleed into each other.
function loadEconomy(state) {
  const ctx = {
    state,
    console,
    setTimeout: () => {},   // reconcileStreakFreezes defers a toast; no-op it
    saveState: () => {},
    showToast: () => {},
    playSfx: () => {},
  };
  const script = [
    "const REWARD_UNBLOCKED_FRACTION = " + FRACTION_LIT + ";",
    "const num = " + NUM_EXPR + ";",
    extractFn(APP, "keyToOrdinal"),
    extractFn(APP, "localDateKey"),
    extractFn(APP, "totalMinutes"),
    extractFn(APP, "currentPearls"),
    extractFn(APP, "awardPearls"),
    extractFn(APP, "computeStats"),
    extractFn(APP, "reconcileStreakFreezes"),
    BANK_SRC,
    "this.__econ = { keyToOrdinal, localDateKey, totalMinutes, currentPearls, " +
      "awardPearls, computeStats, reconcileStreakFreezes, bankSession, num, " +
      "REWARD_UNBLOCKED_FRACTION };",
  ].join("\n\n");
  vm.runInNewContext(script, ctx);
  return ctx.__econ;
}

function freshState(over) {
  return Object.assign({
    collection: [], bonusPearls: 0, spent: 0, blockPenalty: 0,
    devMode: false, frozenDays: [], freezes: 0,
  }, over || {});
}

// A calendar day N days before today, at local noon (noon dodges DST midnight
// rollover so "N days ago" is always exactly N ordinals back).
function dayKey(e, offset) {
  const base = new Date(); base.setHours(12, 0, 0, 0);
  return e.localDateKey(new Date(base.getTime() - offset * 86400000));
}

// Simulate a completed drink the way doneFocus does: bank first (oldTotal is the
// total BEFORE this drink), THEN add the drink to the collection.
function completeCup(e, state, minutes, wasBlocked) {
  const res = e.bankSession(minutes, wasBlocked);
  state.collection.unshift({ minutes, dateKey: e.localDateKey(new Date()) });
  return res;
}

// ── The constant itself ──────────────────────────────────────────────────────
test("REWARD_UNBLOCKED_FRACTION is a 1/10 (90%-fewer) multiplier", () => {
  const e = loadEconomy(freshState());
  assert.equal(e.REWARD_UNBLOCKED_FRACTION, 0.1);
});

// ── Rate: floor((oldTotal+minutes)/15) − floor(oldTotal/15), i.e. ~4/hour ─────
test("a finished drink pays floor((old+min)/15) − floor(old/15) at full rate", () => {
  const e = loadEconomy(freshState());
  const cases = [
    [0, 15, 1], [0, 30, 2], [0, 60, 4], [0, 240, 16],
    [20, 20, 1],            // 20→40 crosses one multiple of 15
    [15, 15, 1], [30, 45, 3], [10, 5, 1],  // 10→15 crosses exactly 15
    [14, 1, 1], [14, 0, 0],
  ];
  for (const [old, min, expect] of cases) {
    const st = freshState({ collection: [{ minutes: old, dateKey: "2026-01-01" }] });
    const ee = loadEconomy(st);
    const expectFormula = Math.floor((old + min) / 15) - Math.floor(old / 15);
    assert.equal(expectFormula, expect, `formula sanity for (${old},${min})`);
    assert.equal(ee.bankSession(min, true).fullPearls, expect,
      `fullPearls for old=${old} min=${min}`);
  }
});

test("one focused hour is worth 4 pearls (the ~4/hour headline rate)", () => {
  const st = freshState();
  const e = loadEconomy(st);
  completeCup(e, st, 60, true);
  assert.equal(e.currentPearls(), 4);
});

test("four hours blocked banks 16 pearls, nothing withheld", () => {
  const st = freshState();
  const e = loadEconomy(st);
  const res = completeCup(e, st, 240, true);
  assert.equal(res.fullPearls, 16);
  assert.equal(res.pearlsEarned, 16);
  assert.equal(st.blockPenalty, 0);
  assert.equal(e.currentPearls(), 16);
});

// ── Blocked vs unblocked multiplier + blockPenalty accumulation ───────────────
test("a blocked (or web) session pays the full rate", () => {
  const st = freshState();
  const e = loadEconomy(st);
  const res = completeCup(e, st, 60, true);
  assert.equal(res.share, 1);
  assert.equal(res.pearlsEarned, 4);
  assert.equal(st.blockPenalty, 0);
});

test("web falls back to full rate: doneFocus sets wasBlocked=true with no blocker", () => {
  // On web FocusBlocker.available() is false, so wasBlocked is the `: true` arm.
  // Locking the source here keeps "web can't block, so web pays full" honest.
  assert.match(APP, /const wasBlocked = FocusBlocker\.available\(\)\s*\?\s*\(FocusBlocker\.wasActive\(\)[\s\S]*?:\s*true;/);
});

test("an iPhone session that blocked NOTHING pays ~1/10 and withholds the rest", () => {
  const st = freshState();
  const e = loadEconomy(st);
  const res = completeCup(e, st, 60, false);
  assert.equal(res.share, 0.1);
  assert.equal(res.awardedExact, 0.4);         // 4 full pearls × 0.1
  assert.equal(res.pearlsEarned, 0);           // round(0.4) → 0 shown
  assert.equal(st.blockPenalty, 3.6);          // the 90% shortfall is withheld
  assert.equal(e.currentPearls(), 0);          // floor(4 − 3.6) = 0
});

test("the unblocked shortfall accumulates as fractions, not rounded up per session", () => {
  // The bug this guards: rounding the withheld share UP per session let a 15-min
  // unblocked cup (fullPearls 1) pay ceil(0.5)=1, so back-to-back short cups
  // earned the full blocked rate and the penalty never bit. Correct behaviour:
  // each 15-min unblocked cup shows +0 and withholds ~0.9, and they add up.
  const st = freshState();
  const e = loadEconomy(st);
  for (let i = 0; i < 10; i++) {
    const res = completeCup(e, st, 15, false);
    assert.equal(res.pearlsEarned, 0, "each short unblocked cup shows +0");
  }
  // Ten cups: penalty accumulated to ~9, never discarded session by session.
  assert.ok(Math.abs(st.blockPenalty - 9) < 1e-9, "withheld share summed to ~9");
  // 150 focused minutes yields ~1/10 of what the same time blocked earns. (The
  // balance floors to 0 here rather than 1: ten `+= 0.9` sum a hair over 9, so
  // floor(10 − 9.0000…) = 0. That drift is conservative — it withholds slightly
  // MORE, never over-credits — so it is safe, not a farm.)
  assert.ok(e.currentPearls() <= 1, "≤1 pearl for 150 unblocked minutes");

  // Contrast: the same ten cups WITH blocking pay the full 10.
  const stBlocked = freshState();
  const eb = loadEconomy(stBlocked);
  for (let i = 0; i < 10; i++) completeCup(eb, stBlocked, 15, true);
  assert.equal(eb.currentPearls(), 10, "blocked pays full; unblocked pays ~1/10");
});

// ── "Always at least 1 pearl" at full rate, without re-opening a farm ─────────
test("the smallest real cup pays at least 1 pearl when blocked (full rate)", () => {
  // 15 min is the app's minimum Custom cup. Blocked, it must never show +0.
  const st = freshState();
  const e = loadEconomy(st);
  const res = completeCup(e, st, 15, true);
  assert.equal(res.fullPearls, 1);
  assert.equal(res.pearlsEarned, 1);
  assert.equal(e.currentPearls(), 1);
});

test("the min-1 guarantee does NOT apply at the unblocked rate (no farm)", () => {
  // If the min-1 were restored for unblocked sessions, a 15-min unblocked cup
  // would pay 1 — the full blocked rate — and short unblocked cups become a farm.
  // Correct: unblocked pays round(share), so a 15-min unblocked cup pays 0.
  const st = freshState();
  const e = loadEconomy(st);
  const res = completeCup(e, st, 15, false);
  assert.equal(res.pearlsEarned, 0);
  assert.equal(e.currentPearls(), 0);
  assert.equal(st.bonusPearls, 0, "no top-up pearl was banked");
});

test("dev mode cannot farm pearls through the min-1 top-up door", () => {
  // Dev mode drops sessions to seconds and removes every gate; the fix was to
  // make awardPearls() a no-op there. bankSession still computes a min-1 top-up
  // for a sub-bar cup, but awardPearls swallows it, so the wallet never moves.
  const st = freshState({ devMode: true });
  const e = loadEconomy(st);
  const res = e.bankSession(10, false);   // a sub-15 "cup" only dev mode produces
  assert.equal(res.pearlDelta, 1);        // the top-up is computed…
  assert.equal(st.bonusPearls, 0);        // …and banked as nothing in dev mode
  assert.equal(e.currentPearls(), 0);
});

// ── currentPearls(): floors, never negative, never NaN ────────────────────────
test("currentPearls floors a fractional blockPenalty rather than showing a fraction", () => {
  const st = freshState({
    collection: [{ minutes: 30, dateKey: "2026-01-01" }],   // 2 base pearls
    blockPenalty: 0.9,
  });
  const e = loadEconomy(st);
  assert.equal(e.currentPearls(), 1);     // floor(2 − 0.9)
});

test("a fresh wallet is exactly 0 — not NaN, not negative", () => {
  const e = loadEconomy(freshState());
  const p = e.currentPearls();
  assert.equal(p, 0);
  assert.ok(Number.isFinite(p));
});

test("the loadState healer coerces NaN / negative / infinite economy fields to a safe floor", () => {
  const e = loadEconomy(freshState());
  assert.equal(e.num(NaN, 0), 0);
  assert.equal(e.num(-5, 0), 0);
  assert.equal(e.num(Infinity, 0), 0);
  assert.equal(e.num("7", 0), 0, "a non-number is replaced, never parsed");
  assert.equal(e.num(3, 0), 3);
  assert.equal(e.num(30 * 60, 30 * 60, 1), 1800, "a valid duration survives");
  assert.equal(e.num(0, 60, 1), 60, "below the min floor is replaced");
});

test("healed fields keep currentPearls finite and non-negative", () => {
  // Mirror the healing loadState applies, then confirm the balance is sane.
  const raw = freshState({ spent: NaN, bonusPearls: -3, blockPenalty: Infinity,
    collection: [{ minutes: 60, dateKey: "2026-01-01" }] });
  const e = loadEconomy(raw);
  raw.spent = e.num(raw.spent, 0);
  raw.bonusPearls = e.num(raw.bonusPearls, 0);
  raw.blockPenalty = e.num(raw.blockPenalty, 0);
  const p = e.currentPearls();
  assert.ok(Number.isFinite(p), "balance is a real number after healing");
  assert.equal(p, 4);
});

// ── Spends: guarded, and can't drop the wallet below 0 ────────────────────────
test("a spend is refused when it exceeds the balance, and never goes negative", () => {
  // Use the REAL currentPearls() as the affordability gate (exactly what buyItem
  // and buyConsumable do), so the guard math under test is the shipped math.
  const st = freshState();
  const e = loadEconomy(st);
  completeCup(e, st, 60, true);           // 4 pearls
  const trySpend = (price) => {
    if (e.currentPearls() < price) return false;
    st.spent += price;
    return true;
  };
  assert.equal(trySpend(5), false, "can't buy above balance");
  assert.equal(e.currentPearls(), 4, "a refused buy leaves the wallet untouched");
  assert.equal(trySpend(3), true);
  assert.equal(e.currentPearls(), 1);
  assert.equal(trySpend(2), false, "1 pearl can't afford a 2-pearl item");
  assert.equal(trySpend(1), true);
  assert.equal(e.currentPearls(), 0);
  assert.ok(e.currentPearls() >= 0, "wallet floors at 0, never negative");
});

test("both spend paths gate on currentPearls() before charging state.spent", () => {
  // The non-negativity above is an invariant, not a clamp — it holds only while
  // every spender checks affordability first. Lock that in the source.
  assert.match(APP, /function buyItem\([\s\S]*?currentPearls\(\) < item\.price\) return;[\s\S]*?state\.spent \+= item\.price;/);
  assert.match(APP, /function buyConsumable\([\s\S]*?currentPearls\(\) < item\.price\)[\s\S]*?state\.spent \+= item\.price;/);
});

// ── Streak + streak-freeze bridging (current and longest agree) ───────────────
test("consecutive focused days give a matching current and longest streak", () => {
  const e0 = loadEconomy(freshState());
  const st = freshState({ collection: [
    { minutes: 30, dateKey: dayKey(e0, 0) },
    { minutes: 30, dateKey: dayKey(e0, 1) },
    { minutes: 30, dateKey: dayKey(e0, 2) },
  ] });
  const e = loadEconomy(st);
  const s = e.computeStats();
  assert.equal(s.current, 3);
  assert.equal(s.longest, 3);
});

test("a break in the calendar ends the current streak (baseline for the freeze)", () => {
  const e0 = loadEconomy(freshState());
  const st = freshState({ collection: [
    { minutes: 30, dateKey: dayKey(e0, 2) },
    { minutes: 30, dateKey: dayKey(e0, 3) },
  ] });   // focused 2 and 3 days ago; yesterday missed; today not yet
  const e = loadEconomy(st);
  e.reconcileStreakFreezes();             // no freezes to spend
  const s = e.computeStats();
  assert.equal(s.current, 0, "the missed day breaks the chain");
  assert.equal(s.longest, 2);
});

test("a Brain Freeze bridges the missed day so the streak survives", () => {
  const e0 = loadEconomy(freshState());
  const st = freshState({
    collection: [
      { minutes: 30, dateKey: dayKey(e0, 2) },
      { minutes: 30, dateKey: dayKey(e0, 3) },
    ],
    freezes: 1,
  });
  const e = loadEconomy(st);
  assert.equal(e.computeStats().current, 0, "broken before reconcile");
  e.reconcileStreakFreezes();
  assert.equal(st.freezes, 0, "the freeze was spent to bridge the gap");
  assert.equal(st.frozenDays.length, 1, "yesterday is now a protected day");
  const s = e.computeStats();
  // The bridge keeps the chain alive; current counts only the focused days it
  // rescued (2), and the longest focused run is also 2 — they agree.
  assert.equal(s.current, 2);
  assert.equal(s.longest, 2);
});

test("a frozen bridge day does NOT itself count toward the streak number", () => {
  // Only days you actually focused increment the count; the freeze just keeps the
  // chain unbroken across a gap. Seed the bridge day directly (frozenDays holds
  // day ORDINALS) and confirm current counts the 2 focused days, not the bridge.
  const e0 = loadEconomy(freshState());
  const k1 = dayKey(e0, 1), k3 = dayKey(e0, 3);   // focused yesterday and 3 days ago
  const bridge = e0.keyToOrdinal(dayKey(e0, 2));  // the missed day, protected
  const st = freshState({
    collection: [{ minutes: 30, dateKey: k1 }, { minutes: 30, dateKey: k3 }],
    frozenDays: [bridge],
  });
  const e = loadEconomy(st);
  const s = e.computeStats();
  assert.equal(s.current, 2, "counts the 2 focused days, not the frozen bridge");
  assert.equal(s.current, st.collection.length, "streak equals focused days");
  // The chain spans 3 calendar days (yesterday, the bridge, 3-days-ago) but the
  // number is 2 — the bridge kept the chain alive without inflating the count.
});

test("a gap too wide for the freezes on hand is not bridged", () => {
  // reconcile only bridges when it can cover the WHOLE gap. Two missed days with
  // one freeze must leave the streak broken rather than half-bridge it.
  const e0 = loadEconomy(freshState());
  const st = freshState({
    collection: [{ minutes: 30, dateKey: dayKey(e0, 3) }],  // last focus 3 days ago
    freezes: 1,                                             // need 2 to reach today
  });
  const e = loadEconomy(st);
  e.reconcileStreakFreezes();
  assert.equal(st.freezes, 1, "the freeze is preserved, not wasted on a partial bridge");
  assert.equal(e.computeStats().current, 0);
});
