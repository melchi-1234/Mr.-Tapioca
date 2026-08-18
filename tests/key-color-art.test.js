const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");

const ROOT = resolve(__dirname, "..");
const CHECKER = resolve(ROOT, "tools", "check-key-color-art.py");

function makeFixture(path, greenSize) {
  const result = spawnSync("python3", [
    "-c",
    [
      "from PIL import Image",
      "import sys",
      "size = int(sys.argv[2])",
      "im = Image.new('RGBA', (24, 24), (92, 61, 46, 255))",
      "for y in range(2, 2 + size):",
      " for x in range(2, 2 + size): im.putpixel((x, y), (0, 255, 0, 255))",
      "im.save(sys.argv[1])",
    ].join("\n"),
    path,
    String(greenSize),
  ], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
}

test("key-color art gate allows tiny accents and rejects large opaque backdrop islands", () => {
  const dir = mkdtempSync(join(tmpdir(), "mr-tapioca-key-art-"));
  try {
    const good = join(dir, "good.png");
    const bad = join(dir, "bad.png");
    makeFixture(good, 9);   // 81 connected pixels: under the calibrated 100px ceiling
    makeFixture(bad, 11);   // 121 connected pixels: unmistakable trapped backdrop

    const allowed = spawnSync("python3", [CHECKER, good], { encoding: "utf8" });
    assert.equal(allowed.status, 0, allowed.stdout + allowed.stderr);

    const rejected = spawnSync("python3", [CHECKER, bad], { encoding: "utf8" });
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stdout + rejected.stderr, /121.*green|green.*121/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("every shipped pose is free of a large opaque key-color component", () => {
  const result = spawnSync("python3", [CHECKER, resolve(ROOT, "assets", "poses")], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test("key-color art gate rejects animated PNGs instead of checking frame zero only", () => {
  const dir = mkdtempSync(join(tmpdir(), "mr-tapioca-key-art-animated-"));
  try {
    const animated = join(dir, "animated.png");
    const made = spawnSync("python3", [
      "-c",
      [
        "from PIL import Image",
        "import sys",
        "first = Image.new('RGBA', (24, 24), (92, 61, 46, 255))",
        "second = Image.new('RGBA', (24, 24), (0, 255, 0, 255))",
        "first.save(sys.argv[1], save_all=True, append_images=[second], duration=100, loop=0, format='PNG')",
      ].join("\n"),
      animated,
    ], { encoding: "utf8" });
    assert.equal(made.status, 0, made.stderr);

    const rejected = spawnSync("python3", [CHECKER, animated], { encoding: "utf8" });
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stdout + rejected.stderr, /2 frames|static PNG/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("key-color art gate rejects dispersed semi-transparent screen-key fringe", () => {
  const dir = mkdtempSync(join(tmpdir(), "mr-tapioca-key-art-dispersed-"));
  try {
    const bad = join(dir, "dispersed.png");
    const made = spawnSync("python3", [
      "-c",
      [
        "from PIL import Image",
        "import sys",
        "im = Image.new('RGBA', (64, 64), (92, 61, 46, 255))",
        "for i in range(60):",
        " x = 1 + (i % 10) * 6",
        " y = 1 + (i // 10) * 6",
        " im.putpixel((x, y), (255, 0, 255, 64))",
        "im.save(sys.argv[1])",
      ].join("\n"),
      bad,
    ], { encoding: "utf8" });
    assert.equal(made.status, 0, made.stderr);

    const rejected = spawnSync("python3", [CHECKER, bad], { encoding: "utf8" });
    assert.notEqual(rejected.status, 0,
      "60 disconnected matte pixels are still a visible fringe even though every component is one pixel");
    assert.match(rejected.stdout + rejected.stderr, /60.*magenta|magenta.*60/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("key-color art gate rejects faint low-alpha screen-key residue", () => {
  const dir = mkdtempSync(join(tmpdir(), "mr-tapioca-key-art-faint-"));
  try {
    const bad = join(dir, "faint.png");
    const made = spawnSync("python3", [
      "-c",
      [
        "from PIL import Image",
        "import sys",
        "im = Image.new('RGBA', (64, 64), (92, 61, 46, 255))",
        "for i in range(25):",
        " x = 1 + (i % 5) * 10",
        " y = 1 + (i // 5) * 10",
        " im.putpixel((x, y), (255, 0, 255, 8))",
        "im.save(sys.argv[1])",
      ].join("\n"),
      bad,
    ], { encoding: "utf8" });
    assert.equal(made.status, 0, made.stderr);

    const rejected = spawnSync("python3", [CHECKER, bad], { encoding: "utf8" });
    assert.notEqual(rejected.status, 0,
      "low-alpha matte still composites visibly on dark backgrounds");
    assert.match(rejected.stdout + rejected.stderr, /25.*magenta|magenta.*25/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
