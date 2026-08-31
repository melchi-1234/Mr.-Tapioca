const test = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));

test("iOS sync stops before plugin registration when Capacitor sync fails", () => {
  assert.equal(pkg.scripts.copyweb, "node tools/copy-web.mjs");
  assert.match(pkg.scripts["ios:sync"], /^node tools\/check-capacitor-versions\.mjs && node tools\/patch-capacitor-tar\.mjs &&/);
  assert.match(pkg.scripts["ios:sync"], /node_modules\/\.bin\/cap sync ios && node tools\/register-ios-plugins\.mjs/);
  assert.doesNotMatch(pkg.scripts["ios:sync"], /cap sync ios\s*;/);
  assert.doesNotMatch(pkg.scripts["ios:sync"], /\bnpx\b/);
  assert.equal(pkg.scripts["ios:open"], "npm run ios:sync && node_modules/.bin/cap open ios");
});

test("release setup reapplies the generated iOS version and portrait settings", () => {
  assert.match(pkg.scripts["ios:release-setup"], /^npm ci --ignore-scripts && npm run ios:sync && node tools\/set-ios-version\.mjs 1\.2\.0 14$/);
  const source = fs.readFileSync(path.join(root, "tools", "set-ios-version.mjs"), "utf8");
  assert.match(source, /currentVersionSettings\.length !== 10/);
  assert.match(source, /marketingVersionSettings\.length !== 10/);
});

test("documented archive wrapper wires sync, preflight, archive, and verification", () => {
  assert.equal(
    pkg.scripts["ios:archive-release"],
    "npm run ios:release-setup && node tools/archive-ios-release.mjs",
  );
  const cliSource = fs.readFileSync(path.join(root, "tools", "archive-ios-release.mjs"), "utf8");
  const source = fs.readFileSync(path.join(root, "tools", "archive-ios-release-lib.mjs"), "utf8");
  assert.match(cliSource, /archiveRelease/);
  const preflight = source.indexOf("check-release.mjs");
  const archive = source.indexOf('"/usr/bin/xcodebuild"');
  const verifier = source.indexOf("verify-ios-archive.mjs");
  assert.ok(preflight >= 0, "archive wrapper must run the release preflight");
  assert.ok(archive > preflight, "xcodebuild must run only after the preflight");
  assert.ok(verifier > archive, "archive verification must run after xcodebuild");
  assert.match(source, /-archivePath/);
  assert.match(source, /-derivedDataPath/);
  assert.match(source, /generic\/platform=iOS/);
  assert.match(source, /--porcelain/);
  assert.match(source, /"\/usr\/bin\/env", \["npm", "test"\]/);
});

test("release scripts expose controlled export, IPA verification, and upload", () => {
  assert.equal(pkg.scripts["ios:export-release"], "node tools/export-ios-release.mjs");
  assert.equal(pkg.scripts["ios:verify-ipa"], "node tools/verify-ios-ipa.mjs");
  assert.equal(pkg.scripts["ios:upload-release"], "node tools/upload-ios-release.mjs");
});

test("the release uses an exact local-notifications version", () => {
  assert.equal(pkg.dependencies["@capacitor/local-notifications"], "6.1.3");
});

test("Capacitor tooling is pinned to the versions locked by CocoaPods", () => {
  assert.equal(pkg.dependencies["@capacitor/core"], "6.2.1");
  assert.equal(pkg.dependencies["@capacitor/ios"], "6.2.1");
  assert.equal(pkg.devDependencies["@capacitor/cli"], "6.2.1");
  assert.ok(fs.existsSync(path.join(root, "tools", "check-capacitor-versions.mjs")));
  assert.equal(pkg.overrides.tar, "7.5.22");
  assert.equal(lock.packages[""].dependencies["@capacitor/core"], "6.2.1");
  assert.equal(lock.packages[""].dependencies["@capacitor/ios"], "6.2.1");
  assert.equal(lock.packages[""].dependencies["@capacitor/local-notifications"], "6.1.3");
  assert.equal(lock.packages[""].devDependencies["@capacitor/cli"], "6.2.1");
  assert.equal(lock.packages["node_modules/@capacitor/core"].version, "6.2.1");
  assert.equal(lock.packages["node_modules/@capacitor/ios"].version, "6.2.1");
  assert.equal(lock.packages["node_modules/@capacitor/local-notifications"].version, "6.1.3");
  assert.equal(lock.packages["node_modules/@capacitor/cli"].version, "6.2.1");
});

test("release documentation requires verified wrappers and rejects TestFlight build 8", () => {
  for (const pathname of ["CLAUDE.md", "SETUP_NATIVE.md"]) {
    const source = fs.readFileSync(path.join(root, pathname), "utf8");
    assert.match(source, /ios:archive-release/);
    assert.match(source, /ios:export-release/);
    assert.match(source, /ios:upload-release/);
    assert.match(source, /Build 8[\s\S]{0,120}(rejected|never be submitted)/i);
  }
});

test("hand-authored native release inputs are tracked while generated bundles stay ignored", () => {
  const required = [
    "package-lock.json",
    "ios/App/App/App.entitlements",
    "ios/App/App/AppDelegate.swift",
    "ios/App/App/Info.plist",
    "ios/App/Podfile",
    "ios/App/Podfile.lock",
    "ios/App/DeviceActivityMonitor/DeviceActivityMonitor.entitlements",
    "ios/App/ShieldAction/ShieldActionExtension.swift",
    "ios/App/ShieldConfiguration/ShieldConfigurationExtension.swift",
    "ios/App/FocusWidget/FocusWidgetBundle.swift",
  ];
  for (const pathname of required) {
    const tracked = spawnSync("git", ["ls-files", "--error-unmatch", pathname], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(tracked.status, 0, `${pathname} is not tracked`);
  }
  const generated = spawnSync("git", ["check-ignore", "ios/App/App/public/app.js"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(generated.status, 0, "generated native public bundle should stay ignored");
  const generatedCordovaConfig = spawnSync(
    "git",
    ["check-ignore", "--no-index", "ios/App/App/config.xml"],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(generatedCordovaConfig.status, 0, "Capacitor-generated config.xml should stay ignored");
  const trackedCordovaConfig = spawnSync(
    "git",
    ["ls-files", "--error-unmatch", "ios/App/App/config.xml"],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(trackedCordovaConfig.status, 1, "Capacitor-generated config.xml must not enter the index");
});
