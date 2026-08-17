const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const privacy = fs.readFileSync(path.join(__dirname, "..", "privacy.html"), "utf8");

test("privacy policy discloses anonymous server-backed reward records", () => {
  assert.match(privacy, /Partner rewards/);
  assert.match(privacy, /session start and end times/i);
  assert.match(privacy, /redemption code/i);
  assert.match(privacy, /not.*advertising/i);
});

test("privacy policy says account deletion removes reward records too", () => {
  assert.match(privacy, /reward history[\s\S]*deleted/i);
});
