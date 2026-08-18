const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { resolve } = require("node:path");

const ROOT = resolve(__dirname, "..");

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
