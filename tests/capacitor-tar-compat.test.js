const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.join(__dirname, "..");
const originalTemplate = `"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractTemplate = void 0;
const tslib_1 = require("tslib");
const utils_fs_1 = require("@ionic/utils-fs");
const tar_1 = tslib_1.__importDefault(require("tar"));
async function extractTemplate(src, dir) {
    await (0, utils_fs_1.mkdirp)(dir);
    await tar_1.default.extract({ file: src, cwd: dir });
}
exports.extractTemplate = extractTemplate;
`;

function write(rootDir, relative, value) {
  const target = path.join(rootDir, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, value);
}

function makeFixture() {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "mrtap-capacitor-tar-"));
  write(fixture, "node_modules/@capacitor/cli/package.json", JSON.stringify({ version: "6.2.1" }));
  write(fixture, "node_modules/@capacitor/cli/dist/util/template.js", originalTemplate);
  write(fixture, "node_modules/tar/package.json", JSON.stringify({ version: "7.5.22", main: "index.js" }));
  write(fixture, "node_modules/tar/index.js", `
Object.defineProperty(exports, "__esModule", { value: true });
exports.extract = async ({ file, cwd }) => require("node:fs").writeFileSync(file + ".used", cwd);
`);
  write(fixture, "node_modules/tslib/package.json", JSON.stringify({ main: "index.js" }));
  write(fixture, "node_modules/tslib/index.js", `
exports.__importDefault = (mod) => mod && mod.__esModule ? mod : { default: mod };
`);
  write(fixture, "node_modules/@ionic/utils-fs/package.json", JSON.stringify({ main: "index.js" }));
  write(fixture, "node_modules/@ionic/utils-fs/index.js", "exports.mkdirp = async () => {};\n");
  return fixture;
}

test("the pinned Capacitor 6 extractor runs with the audited tar 7 override", async (t) => {
  const fixture = makeFixture();
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const tool = await import(pathToFileURL(path.join(root, "tools", "patch-capacitor-tar.mjs")));

  assert.equal(tool.patchCapacitorTar(fixture), "patched");
  assert.equal(tool.patchCapacitorTar(fixture), "already-patched");

  const extractor = require(path.join(fixture, "node_modules/@capacitor/cli/dist/util/template.js"));
  const archive = path.join(fixture, "fixture.tar.gz");
  const destination = path.join(fixture, "output");
  await extractor.extractTemplate(archive, destination);
  assert.equal(fs.readFileSync(archive + ".used", "utf8"), destination);
});

test("the compatibility patch refuses version or source drift without rewriting", async (t) => {
  const fixture = makeFixture();
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const tool = await import(pathToFileURL(path.join(root, "tools", "patch-capacitor-tar.mjs")));
  const template = path.join(fixture, "node_modules/@capacitor/cli/dist/util/template.js");

  write(fixture, "node_modules/tar/package.json", JSON.stringify({ version: "7.5.23" }));
  assert.throws(() => tool.patchCapacitorTar(fixture), /expected tar 7\.5\.22/);
  assert.equal(fs.readFileSync(template, "utf8"), originalTemplate);

  write(fixture, "node_modules/tar/package.json", JSON.stringify({ version: "7.5.22" }));
  fs.appendFileSync(template, "// unexpected drift\n");
  assert.throws(() => tool.patchCapacitorTar(fixture), /unexpected Capacitor extractor bytes/);
});
