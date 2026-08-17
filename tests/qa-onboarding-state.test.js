const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "tools", "qa", "capture-network-v1.mjs"), "utf8");

test("visual QA recognizes the authored reward onboarding title", () => {
  assert.match(source, /title === "Real Rewards Await!"/);
  assert.doesNotMatch(source, /title === "Real boba, not just points"/);
});
