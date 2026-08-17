const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const project = fs.readFileSync(path.join(__dirname, "..", "ios", "App", "App.xcodeproj", "project.pbxproj"), "utf8");
const versionScript = fs.readFileSync(path.join(__dirname, "..", "tools", "set-ios-version.mjs"), "utf8");

test("iOS project format remains readable by the CocoaPods project library", () => {
  const match = project.match(/\bobjectVersion = (\d+);/);
  assert.ok(match, "objectVersion is missing");
  assert.ok(Number(match[1]) <= 63, `objectVersion ${match[1]} is unsupported by xcodeproj 1.27`);
});

test("the release setup script reapplies the CocoaPods-compatible project format", () => {
  assert.match(versionScript, /objectVersion = 60/);
});
