const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync, spawnSync } = require("node:child_process");
const { cpSync, mkdtempSync, readFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { createHash } = require("node:crypto");

const ROOT = resolve(__dirname, "..");
const CHECKER = resolve(ROOT, "tools", "check-pose-integrity.py");
const POSES = resolve(ROOT, "assets", "poses");

function inspectPoses() {
  const output = execFileSync("python3", [
    "-c",
    [
      "from pathlib import Path",
      "from PIL import Image",
      "import json, sys",
      "rows = []",
      "for path in sorted(Path(sys.argv[1]).glob('*.png')):",
      " im = Image.open(path).convert('RGBA')",
      " alpha = im.getchannel('A')",
      " solid = alpha.point(lambda value: 255 if value > 128 else 0)",
      " box = solid.getbbox()",
      " values = alpha.get_flattened_data()",
      " rows.append({'file': path.name, 'size': im.size, 'mode': im.mode, 'bbox': box, 'opaque': sum(value >= 230 for value in values), 'corners': [alpha.getpixel((0,0)), alpha.getpixel((im.width-1,0)), alpha.getpixel((0,im.height-1)), alpha.getpixel((im.width-1,im.height-1))]})",
      "print(json.dumps(rows))",
    ].join("\n"),
    resolve(ROOT, "assets", "poses"),
  ], { encoding: "utf8" });
  return JSON.parse(output);
}

test("all pose sets retain complete RGBA art and a stable baseline", () => {
  const rows = inspectPoses();
  assert.equal(rows.length, 56, "expected 14 skins with four poses each");

  const bySkin = new Map();
  for (const row of rows) {
    const match = row.file.match(/^(.*)-(idle|mixing|sleeping|shocked)\.png$/);
    assert.ok(match, `unexpected pose filename ${row.file}`);
    const [, skin, state] = match;
    if (!bySkin.has(skin)) bySkin.set(skin, []);
    bySkin.get(skin).push({ ...row, state });

    assert.deepEqual(row.size, [500, 500], `${row.file} is not a 500x500 pose`);
    assert.equal(row.mode, "RGBA", `${row.file} lost its alpha channel`);
    assert.ok(row.bbox, `${row.file} is empty`);
    assert.ok(Math.max(...row.corners) <= 16, `${row.file} has an opaque backdrop corner`);
    assert.ok(row.opaque >= 60_000, `${row.file} lost most of its character art`);
    assert.ok(row.opaque <= 160_000, `${row.file} contains suspiciously much opaque backdrop`);
  }

  assert.equal(bySkin.size, 14);
  for (const [skin, poses] of bySkin) {
    assert.deepEqual(poses.map((pose) => pose.state).sort(), ["idle", "mixing", "shocked", "sleeping"]);
    const bottoms = poses.map((pose) => pose.bbox[3] - 1);
    const heights = poses.map((pose) => pose.bbox[3] - pose.bbox[1]);
    const coverage = poses.map((pose) => pose.opaque);
    assert.ok(Math.max(...bottoms) - Math.min(...bottoms) <= 4, `${skin} jumps vertically between poses`);
    assert.ok(Math.max(...heights) - Math.min(...heights) <= 30, `${skin} changes scale between poses`);
    assert.ok(Math.min(...coverage) / Math.max(...coverage) >= 0.8, `${skin} loses too much art in one pose`);
  }
});

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

test("pose gate rejects byte-identical states even when geometry stays valid", () => {
  const dir = mkdtempSync(join(tmpdir(), "mr-tapioca-pose-duplicate-"));
  try {
    cpSync(POSES, dir, { recursive: true });
    cpSync(join(dir, "ninja-idle.png"), join(dir, "ninja-mixing.png"));
    const result = spawnSync("python3", [CHECKER, dir], { encoding: "utf8" });
    assert.notEqual(result.status, 0, "a mislabeled duplicate state must not pass the release gate");
    assert.match(result.stdout + result.stderr, /ninja-idle.*ninja-mixing|ninja-mixing.*ninja-idle/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("pose gate rejects pixel-identical states encoded with different PNG bytes", () => {
  const dir = mkdtempSync(join(tmpdir(), "mr-tapioca-pose-pixel-duplicate-"));
  try {
    cpSync(POSES, dir, { recursive: true });
    const idle = join(dir, "ninja-idle.png");
    const mixing = join(dir, "ninja-mixing.png");
    const reencoded = spawnSync("python3", [
      "-c",
      [
        "from PIL import Image, PngImagePlugin",
        "import sys",
        "with Image.open(sys.argv[1]) as source:",
        " im = source.convert('RGBA')",
        "info = PngImagePlugin.PngInfo()",
        "info.add_text('state', 'mixing-reencoded')",
        "im.save(sys.argv[2], compress_level=1, pnginfo=info)",
      ].join("\n"),
      idle,
      mixing,
    ], { encoding: "utf8" });
    assert.equal(reencoded.status, 0, reencoded.stderr);
    assert.notEqual(sha256(idle), sha256(mixing), "fixture must differ at the file-byte level");

    const samePixels = spawnSync("python3", [
      "-c",
      [
        "from PIL import Image",
        "import sys",
        "a = Image.open(sys.argv[1]).convert('RGBA')",
        "b = Image.open(sys.argv[2]).convert('RGBA')",
        "raise SystemExit(0 if a.tobytes() == b.tobytes() else 1)",
      ].join("\n"),
      idle,
      mixing,
    ], { encoding: "utf8" });
    assert.equal(samePixels.status, 0, "fixture must decode to identical RGBA pixels");

    const result = spawnSync("python3", [CHECKER, dir], { encoding: "utf8" });
    assert.notEqual(result.status, 0, "PNG metadata or compression must not bypass state uniqueness");
    assert.match(result.stdout + result.stderr, /ninja-idle.*ninja-mixing|ninja-mixing.*ninja-idle/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("pose gate rejects a correctly shaped file containing the wrong skin", () => {
  const dir = mkdtempSync(join(tmpdir(), "mr-tapioca-pose-wrong-skin-"));
  try {
    cpSync(POSES, dir, { recursive: true });
    cpSync(join(dir, "base-idle.png"), join(dir, "royal-idle.png"));
    const result = spawnSync("python3", [CHECKER, dir], { encoding: "utf8" });
    assert.notEqual(result.status, 0,
      "valid RGBA dimensions and geometry must not let Base art ship under a Royal filename");
    assert.match(result.stdout + result.stderr, /royal-idle.*(?:identity|accessory|off-model)/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("pose gate rejects green or magenta contamination in the Angel halo", () => {
  const dir = mkdtempSync(join(tmpdir(), "mr-tapioca-pose-angel-halo-"));
  try {
    cpSync(POSES, dir, { recursive: true });
    const pose = join(dir, "angel-idle.png");
    const contaminated = spawnSync("python3", [
      "-c",
      [
        "from PIL import Image",
        "import sys",
        "im = Image.open(sys.argv[1]).convert('RGBA')",
        "im.putpixel((250, 35), (30, 180, 80, 255))",
        "im.save(sys.argv[1])",
      ].join("\n"),
      pose,
    ], { encoding: "utf8" });
    assert.equal(contaminated.status, 0, contaminated.stderr);

    const result = spawnSync("python3", [CHECKER, dir], { encoding: "utf8" });
    assert.notEqual(result.status, 0,
      "a structurally valid pose must not ship a screen-color matte in the gold halo");
    assert.match(result.stdout + result.stderr, /angel-idle.*halo.*(?:green|magenta|chroma|gold)/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
