const test = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const repo = path.join(__dirname, "..");

test("release checker accepts the live backend with native-only Reward V2", () => {
  const run = spawnSync(process.execPath, ["tools/check-release.mjs", "--quiet"], {
    cwd: repo,
    encoding: "utf8",
  });

  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  assert.match(run.stdout, /native-only/i);
  assert.doesNotMatch(run.stdout, /migration .*never been executed/i);
});
