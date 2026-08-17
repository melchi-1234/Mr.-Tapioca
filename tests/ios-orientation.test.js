const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const plist = fs.readFileSync(path.join(__dirname, "..", "ios", "App", "App", "Info.plist"), "utf8");
const versionScript = fs.readFileSync(path.join(__dirname, "..", "tools", "set-ios-version.mjs"), "utf8");

test("the iPhone app stays portrait-only because its scene is designed for a tall phone", () => {
  const phoneBlock = plist.match(/<key>UISupportedInterfaceOrientations<\/key>\s*<array>([\s\S]*?)<\/array>/);
  assert.ok(phoneBlock, "iPhone orientation block is missing");
  assert.match(phoneBlock[1], /UIInterfaceOrientationPortrait/);
  assert.doesNotMatch(phoneBlock[1], /UIInterfaceOrientationLandscape/);
});

test("the release setup script reapplies portrait-only mode to generated iOS files", () => {
  assert.match(versionScript, /UISupportedInterfaceOrientations/);
  assert.match(versionScript, /UIInterfaceOrientationPortrait/);
});
