const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

// Guards the fix for: a streak-freeze-bridged run kept the VISIBLE (current)
// streak alive but never counted toward longest, so the "On a Roll" (>=3) and
// "Unstoppable" (>=7) badges could not unlock even while the app showed the
// user hitting that streak. We extract the real current+longest math out of
// computeStats (rather than copying it) so a future regression is caught here.
const src = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const start = src.indexOf("let current = 0;");
const end = src.indexOf("const todayCount", start);
assert.ok(start !== -1 && end !== -1 && end > start,
  "could not locate the streak math in app.js");
const body = src.slice(start, end);

const computeStreak = new Function("ordinals", "frozen", "todayOrd",
  body + "\n return { current, longest };");

function run(focused, frozenDays, todayOrd) {
  return computeStreak(new Set(focused), new Set(frozenDays), todayOrd);
}

test("a streak-freeze-bridged run counts toward the longest streak", () => {
  // Focus day A, a Brain Freeze bridges the miss on A+1, then focus A+2..A+7.
  const A = 20000;
  const focused = [A, A + 2, A + 3, A + 4, A + 5, A + 6, A + 7];
  const frozen = [A + 1];
  const { current, longest } = run(focused, frozen, A + 7);
  assert.equal(current, 7, "the visible streak bridges the frozen day");
  assert.ok(longest >= 7, `longest must count the bridged run (got ${longest})`);
});

test("longest is never below current when a freeze bridges a gap", () => {
  const A = 20000;
  const focused = [A, A + 2, A + 3];
  const frozen = [A + 1];
  const { current, longest } = run(focused, frozen, A + 3);
  assert.ok(longest >= current, `longest (${longest}) must be >= current (${current})`);
});

test("an UNprotected gap still breaks the longest streak", () => {
  // A+1 is missing with no freeze: the run must reset, so longest stays short.
  const A = 20000;
  const focused = [A, A + 2, A + 3];
  const { longest } = run(focused, [], A + 3);
  assert.equal(longest, 2, "an unprotected gap breaks the run");
});
