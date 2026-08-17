const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));

test("iOS sync stops before plugin registration when Capacitor sync fails", () => {
  assert.match(pkg.scripts["ios:sync"], /cap sync ios && node tools\/register-ios-plugins\.mjs/);
  assert.doesNotMatch(pkg.scripts["ios:sync"], /cap sync ios\s*;/);
});

test("release setup reapplies the generated iOS version and portrait settings", () => {
  assert.match(pkg.scripts["ios:release-setup"], /npm run ios:sync && node tools\/set-ios-version\.mjs 1\.1\.1 8/);
});
