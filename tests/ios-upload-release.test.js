const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const uploaderUrl = pathToFileURL(path.join(root, "tools", "upload-ios-release.mjs")).href;

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mrtap-upload-workflow-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const ipa = path.join(directory, "Mr-Tapioca-1.2.0-14.ipa");
  const key = path.join(directory, "AuthKey_TESTKEY123.p8");
  fs.writeFileSync(ipa, "verified ipa fixture");
  fs.writeFileSync(key, "private key fixture");
  return { ipa, key };
}

test("controlled upload re-verifies the exact IPA immediately before altool", async (t) => {
  const { uploadIosRelease } = await import(uploaderUrl);
  const { ipa, key } = fixture(t);
  const commands = [];
  const result = uploadIosRelease({
    ipaArgument: ipa,
    loadConfig: () => ({
      key_id: "TESTKEY123",
      issuer_id: "11111111-2222-3333-4444-555555555555",
      key_path: key,
    }),
    runCommand(command, args, label) {
      commands.push({ command, args: [...args], label });
    },
    logger: { log() {} },
  });

  assert.deepEqual(commands.map(({ label }) => label), [
    "IPA verification",
    "App Store Connect upload",
  ]);
  assert.equal(commands[0].command, process.execPath);
  assert.match(commands[0].args[0], /verify-ios-ipa\.mjs$/);
  assert.equal(commands[0].args[1], ipa);
  assert.equal(commands[1].command, "/usr/bin/xcrun");
  assert.deepEqual(commands[1].args.slice(0, 4), ["altool", "--upload-app", "-f", ipa]);
  assert.ok(commands[1].args.includes("--api-key"));
  assert.ok(commands[1].args.includes("--api-issuer"));
  assert.ok(commands[1].args.includes("--show-progress"));
  assert.equal(commands[1].args.includes("--upload-package"), false);
  assert.equal(result.ipaPath, ipa);
  assert.match(result.sha256, /^[a-f0-9]{64}$/);
});

test("a failed IPA verifier prevents any upload", async (t) => {
  const { uploadIosRelease } = await import(uploaderUrl);
  const { ipa, key } = fixture(t);
  const labels = [];

  assert.throws(() => uploadIosRelease({
    ipaArgument: ipa,
    loadConfig: () => ({ key_id: "TESTKEY123", issuer_id: "issuer", key_path: key }),
    runCommand(_command, _args, label) {
      labels.push(label);
      if (label === "IPA verification") throw new Error("fixture verifier refusal");
    },
    logger: { log() {} },
  }), /fixture verifier refusal/);
  assert.deepEqual(labels, ["IPA verification"]);
});

test("controlled upload rejects relative, symlinked, or ambiguous CLI inputs", async (t) => {
  const { uploadIosRelease } = await import(uploaderUrl);
  const { ipa } = fixture(t);
  const link = path.join(path.dirname(ipa), "linked.ipa");
  fs.symlinkSync(ipa, link);

  assert.throws(() => uploadIosRelease({ ipaArgument: "App.ipa" }), /absolute path/);
  assert.throws(() => uploadIosRelease({ ipaArgument: link }), /symbolic link/);

  const invoked = spawnSync(process.execPath, [
    path.join(root, "tools", "upload-ios-release.mjs"),
    ipa,
    "/tmp/extra.ipa",
  ], { cwd: root, encoding: "utf8" });
  assert.equal(invoked.status, 2);
  assert.match(invoked.stderr, /Usage:/);
});

test("controlled upload refuses missing App Store Connect credentials before verification", async (t) => {
  const { uploadIosRelease } = await import(uploaderUrl);
  const { ipa } = fixture(t);
  let commandCount = 0;

  assert.throws(() => uploadIosRelease({
    ipaArgument: ipa,
    loadConfig: () => ({ key_id: "", issuer_id: "", key_path: "" }),
    runCommand() { commandCount++; },
  }), /credentials|key_id|issuer_id/i);
  assert.equal(commandCount, 0);
});
