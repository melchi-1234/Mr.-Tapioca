const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");

const ROOT = resolve(__dirname, "..");

function pngProbe(...paths) {
  const out = execFileSync("python3", [
    "-c",
    `from PIL import Image\nimport json, sys\nout = {}\nanchors = ((250,200),(100,350),(400,350))\nfor p in sys.argv[1:]:\n im = Image.open(p).convert("RGBA")\n pixels = list(im.getdata())\n cyan = [(i % im.width, i // im.width) for i,(r,g,b,a) in enumerate(pixels) if a >= 230 and r <= 40 and g >= 220 and b >= 220]\n opaque = sum(a >= 230 for r,g,b,a in pixels)\n out[p] = {"opaque": opaque, "opaque_cyan": len(cyan), "anchor_alpha": [im.getpixel(xy)[3] for xy in anchors]}\nprint(json.dumps(out))`,
    ...paths.map((p) => resolve(ROOT, p)),
  ], { encoding: "utf8" });
  return JSON.parse(out);
}

test("Devil pose art removes trapped cyan without erasing the character", () => {
  const paths = ["idle", "mixing", "sleeping", "shocked"].map((s) => `assets/poses/devil-${s}.png`);
  const probe = pngProbe(...paths);
  for (const p of paths) {
    const art = probe[resolve(ROOT, p)];
    assert.ok(art.opaque >= 90_000, `${p} lost most of its opaque character art`);
    assert.equal(art.opaque_cyan, 0, `${p} still contains the trapped cyan key color`);
    assert.deepEqual(art.anchor_alpha, [255, 255, 255], `${p} erased stable character pixels`);
  }
});

test("phone focus tableau uses the shared stage shift and raised floor", () => {
  const css = readFileSync(resolve(ROOT, "styles.css"), "utf8");
  assert.match(css, /--stage-shift:\s*-8px/);
  assert.match(css, /--floor-rest:\s*clamp\(272px,\s*37vh,\s*312px\)/);
  assert.match(css, /left:\s*calc\(18px \+ var\(--stage-shift\)\)/);
  assert.match(css, /right:\s*calc\(22px \* var\(--fig\) - var\(--stage-shift\)\)/);
});
