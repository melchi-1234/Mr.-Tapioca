const test = require("node:test");
const assert = require("node:assert");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.join(__dirname, "..");
const manifestPath = path.join(root, "ios", "App", "App", "PrivacyInfo.xcprivacy");
const projectPath = path.join(root, "ios", "App", "App.xcodeproj", "project.pbxproj");
const verifierPath = path.join(root, "tools", "verify-ios-archive.mjs");

function resourcePhase(project, id) {
  const start = project.indexOf(`\t\t${id} /* Resources */ = {`);
  assert.notEqual(start, -1, `missing ${id} resources phase`);
  const end = project.indexOf("\n\t\t};", start);
  assert.notEqual(end, -1, `unterminated ${id} resources phase`);
  return project.slice(start, end);
}

test("iOS bundles declare App Group UserDefaults required-reason access", () => {
  const manifest = fs.readFileSync(manifestPath, "utf8");
  assert.match(manifest, /NSPrivacyAccessedAPICategoryUserDefaults/);
  assert.match(manifest, /<string>1C8F\.1<\/string>/);

  const project = fs.readFileSync(projectPath, "utf8");
  assert.match(resourcePhase(project, "504EC3021FED79650016851F"), /D4612D330001000000000002/);
  assert.match(resourcePhase(project, "BC11125C2FF34D5000A82015"), /D4612D330001000000000003/);
});

test("archive verifier requires valid manifests in the app and monitor extension", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  assert.equal(pkg.scripts["ios:verify-archive"], "node tools/verify-ios-archive.mjs");

  const archive = fs.mkdtempSync(path.join(os.tmpdir(), "mr-tapioca-archive-test-"));
  const appBundle = path.join(archive, "Products", "Applications", "App.app");
  const monitorBundle = path.join(appBundle, "PlugIns", "DeviceActivityMonitor.appex");
  fs.mkdirSync(monitorBundle, { recursive: true });
  fs.copyFileSync(manifestPath, path.join(appBundle, "PrivacyInfo.xcprivacy"));

  try {
    const missingMonitor = childProcess.spawnSync(process.execPath, [verifierPath, archive], {
      encoding: "utf8",
    });
    assert.notEqual(missingMonitor.status, 0);
    assert.match(missingMonitor.stderr, /DeviceActivityMonitor/);

    fs.copyFileSync(manifestPath, path.join(monitorBundle, "PrivacyInfo.xcprivacy"));
    const complete = childProcess.spawnSync(process.execPath, [verifierPath, archive], {
      encoding: "utf8",
    });
    assert.equal(complete.status, 0, complete.stderr);
  } finally {
    fs.rmSync(archive, { recursive: true, force: true });
  }
});
