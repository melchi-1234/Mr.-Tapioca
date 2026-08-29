const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");

async function loadArchiveRelease() {
  return import(pathToFileURL(path.join(root, "tools", "archive-ios-release-lib.mjs")));
}

function harness(failingLabel = "") {
  const events = [];
  return {
    events,
    dependencies: {
      repositoryRoot: root,
      archivePath: "/tmp/Mr-Tapioca-1.2.0-13.xcarchive",
      capture(command, args, label) {
        events.push(label);
        if (label === "Git release-state check") return "";
        if (label === "Git commit lookup") return "0123456789abcdef";
        throw new Error(`unexpected capture: ${label}`);
      },
      run(command, args, label) {
        events.push(label);
        if (label === failingLabel) throw new Error(`${label} failed`);
      },
      makeDerivedData() {
        events.push("Create isolated DerivedData");
        return "/tmp/mrtap-release-derived-test";
      },
      removeDerivedData(pathname) {
        events.push(`Remove ${pathname}`);
      },
      log() {},
    },
  };
}

test("archive workflow stops before Xcode when automated tests or preflight fail", async () => {
  const { archiveRelease } = await loadArchiveRelease();
  for (const failingLabel of ["Full automated test suite", "Release preflight"]) {
    const { dependencies, events } = harness(failingLabel);
    await assert.rejects(archiveRelease(dependencies), new RegExp(`${failingLabel} failed`));
    assert.equal(events.includes("Signed iOS archive"), false);
    assert.equal(events.includes("Archive verification"), false);
  }
});

test("archive workflow stops before verification when Xcode archive fails", async () => {
  const { archiveRelease } = await loadArchiveRelease();
  const { dependencies, events } = harness("Signed iOS archive");
  await assert.rejects(archiveRelease(dependencies), /Signed iOS archive failed/);
  assert.equal(events.includes("Archive verification"), false);
  assert.ok(events.includes("Remove /tmp/mrtap-release-derived-test"));
});

test("archive workflow propagates verifier failure and cleans DerivedData", async () => {
  const { archiveRelease } = await loadArchiveRelease();
  const { dependencies, events } = harness("Archive verification");
  await assert.rejects(archiveRelease(dependencies), /Archive verification failed/);
  assert.deepEqual(events.slice(0, 8), [
    "Git release-state check",
    "Git commit lookup",
    "Full automated test suite",
    "Release preflight",
    "Create isolated DerivedData",
    "Signed iOS archive",
    "Archive verification",
    "Remove /tmp/mrtap-release-derived-test",
  ]);
});

test("archive workflow returns the verified commit only after every gate passes", async () => {
  const { archiveRelease } = await loadArchiveRelease();
  const { dependencies, events } = harness();
  const result = await archiveRelease(dependencies);
  assert.equal(result.commit, "0123456789abcdef");
  assert.equal(result.archivePath, dependencies.archivePath);
  assert.ok(events.indexOf("Release preflight") < events.indexOf("Signed iOS archive"));
  assert.ok(events.indexOf("Signed iOS archive") < events.indexOf("Archive verification"));
});
