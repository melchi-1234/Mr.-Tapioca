const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { resolve } = require("node:path");

const ROOT = resolve(__dirname, "..");
const STATES = ["idle", "mixing", "sleeping", "shocked"];

function probe(script, ...paths) {
  return JSON.parse(execFileSync("python3", [
    "-c",
    script,
    ...paths.map((path) => resolve(ROOT, path)),
  ], { encoding: "utf8" }));
}

test("Angel halos have a clean matte and stable resting geometry", () => {
  const paths = STATES.map((state) => `assets/poses/angel-${state}.png`);
  const rows = probe(String.raw`
from PIL import Image
import json, sys

rows = []
for path in sys.argv[1:]:
    image = Image.open(path).convert("RGBA")
    width, height = image.size
    pixels = image.load()
    magenta_edge = 0
    green_edge = 0
    halo_core = 0
    halo_matte = 0
    halo_off_warm = 0
    halo_visible = set()
    visible = set()
    for y in range(height):
        for x in range(width):
            red, green, blue, alpha = pixels[x, y]
            if alpha > 16:
                visible.add((x, y))
            if 0 < alpha < 230 and (red - 255) ** 2 + green ** 2 + (blue - 255) ** 2 < 70 ** 2:
                magenta_edge += 1
            if alpha > 0 and green >= red + 40 and green >= blue + 40:
                green_edge += 1
            if 200 <= x <= 300 and 52 <= y <= 68 and alpha > 0:
                halo_core += 1
            if (180 <= x <= 320 and 40 <= y <= 74 and 0 < alpha < 128
                    and red > green + 10 and blue > green + 10):
                halo_matte += 1
            if (158 <= x <= 342 and 30 <= y <= 91 and alpha > 0
                    and not (red >= green >= blue)):
                halo_off_warm += 1
            if 150 <= x <= 350 and 20 <= y <= 95 and alpha > 0:
                halo_visible.add((x, y))

    halo_components = []
    while halo_visible:
        start = halo_visible.pop()
        stack = [start]
        component = []
        while stack:
            x, y = stack.pop()
            component.append((x, y))
            for neighbor in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if neighbor in halo_visible:
                    halo_visible.remove(neighbor)
                    stack.append(neighbor)
        halo_components.append(component)

    components = []
    while visible:
        start = visible.pop()
        stack = [start]
        component = []
        while stack:
            x, y = stack.pop()
            component.append((x, y))
            for neighbor in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if neighbor in visible:
                    visible.remove(neighbor)
                    stack.append(neighbor)
        components.append(component)
    halo = min(
        (component for component in components if max(y for _, y in component) < 120),
        key=lambda component: min(y for _, y in component),
    )
    xs = [x for x, _ in halo]
    ys = [y for _, y in halo]
    rows.append({
        "magenta_edge": magenta_edge,
        "green_edge": green_edge,
        "halo_core": halo_core,
        "halo_matte": halo_matte,
        "halo_off_warm": halo_off_warm,
        "halo_fragments": sum(map(len, sorted(halo_components, key=len)[:-1])),
        "halo_bbox": [min(xs), min(ys), max(xs), max(ys)],
    })
print(json.dumps(rows))
`, ...paths);

  for (const [index, row] of rows.entries()) {
    assert.equal(row.magenta_edge, 0, `${paths[index]} retains magenta screen-key fringe`);
    assert.equal(row.green_edge, 0, `${paths[index]} retains green screen-key fringe`);
    assert.equal(row.halo_core, 0, `${paths[index]} has floating pixels inside the halo opening`);
    assert.equal(row.halo_matte, 0, `${paths[index]} retains a pink matte on the halo opening`);
    assert.equal(row.halo_off_warm, 0, `${paths[index]} retains green or magenta chroma in its gold halo`);
    assert.equal(row.halo_fragments, 0, `${paths[index]} has disconnected fragments around the halo`);
  }

  const widths = rows.map((row) => row.halo_bbox[2] - row.halo_bbox[0]);
  const tops = rows.map((row) => row.halo_bbox[1]);
  assert.ok(Math.max(...widths) - Math.min(...widths) <= 3,
    `Angel halo width changes across states: ${widths.join(", ")}`);
  assert.ok(Math.max(...tops) - Math.min(...tops) <= 3,
    `Angel halo moves vertically across states: ${tops.join(", ")}`);
});

test("Devil pose transparency has no cyan matte or hidden screen plate", () => {
  const paths = STATES.map((state) => `assets/poses/devil-${state}.png`);
  const rows = probe(String.raw`
from PIL import Image
import json, sys

rows = []
for path in sys.argv[1:]:
    pixels = Image.open(path).convert("RGBA").get_flattened_data()
    hidden_cyan = 0
    soft_cyan = 0
    for red, green, blue, alpha in pixels:
        if alpha == 0 and red ** 2 + (green - 255) ** 2 + (blue - 255) ** 2 < 70 ** 2:
            hidden_cyan += 1
        if (0 < alpha < 230 and green >= red + 15 and blue >= red + 15
                and green >= 40 and blue >= 40 and abs(green - blue) <= 80):
            soft_cyan += 1
    rows.append({"hidden_cyan": hidden_cyan, "soft_cyan": soft_cyan})
print(json.dumps(rows))
`, ...paths);

  for (const [index, row] of rows.entries()) {
    assert.equal(row.hidden_cyan, 0, `${paths[index]} retains a hidden cyan screen plate`);
    assert.ok(row.soft_cyan <= 24,
      `${paths[index]} retains a visible cyan edge matte (${row.soft_cyan} px)`);
  }
});

test("Scarf tail stays on the same side in every pose", () => {
  const paths = STATES.map((state) => `assets/poses/scarf-${state}.png`);
  const rows = probe(String.raw`
from PIL import Image
import json, sys

out = []
for path in sys.argv[1:]:
    image = Image.open(path).convert("RGBA")
    xs = []
    for y in range(360, image.height):
        for x in range(image.width):
            red, green, blue, alpha = image.getpixel((x, y))
            if alpha > 128 and red > 150 and red > green + 30 and red > blue + 20:
                xs.append(x)
    out.append({
        "count": len(xs),
        "right_fraction": sum(x > 250 for x in xs) / len(xs) if xs else 0,
    })
print(json.dumps(out))
`, ...paths);

  for (const [index, row] of rows.entries()) {
    assert.ok(row.count >= 700 && row.right_fraction >= 0.95,
      `${paths[index]} puts the hanging scarf tail on the wrong side (${row.count} px, ${(row.right_fraction * 100).toFixed(1)}% right)`);
  }
});

test("Shades lenses stay opaque instead of exposing eye whites", () => {
  // POSITION-INDEPENDENT ON PURPOSE. This used to compare against six hard-coded
  // polygons per pose, and commit cca30f4 ("mirrored mixing art") moved the face
  // out from under them: the test failed for two releases while the art was
  // perfect, which is the most expensive kind of test there is. Poses get
  // re-drawn and re-posed; the RULE is that the lenses are one solid dark mass
  // with no eye showing through, and that is what is asserted here.
  const paths = STATES.map((state) => `assets/poses/shades-${state}.png`);
  const rows = probe(String.raw`
from PIL import Image
import json, sys

def components(selected):
    seen = set(selected)
    out = []
    while seen:
        stack = [seen.pop()]
        pts = []
        while stack:
            x, y = stack.pop()
            pts.append((x, y))
            for nx in range(x - 1, x + 2):
                for ny in range(y - 1, y + 2):
                    point = (nx, ny)
                    if point in seen:
                        seen.remove(point)
                        stack.append(point)
        out.append(pts)
    out.sort(key=len, reverse=True)
    return out

rows = []
for path in sys.argv[1:]:
    image = Image.open(path).convert("RGBA")
    pixels = image.load()
    dark = set()
    # The head occupies the upper-middle band in every pose. Wide enough that a
    # mirrored or shifted face is still inside it.
    for y in range(110, 340):
        for x in range(image.width):
            red, green, blue, alpha = pixels[x, y]
            luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue
            if alpha >= 230 and max(red, green, blue) - min(red, green, blue) <= 12 and luma <= 80:
                dark.add((x, y))
    parts = components(dark)
    lens = parts[0] if parts else []
    xs = [p[0] for p in lens] or [0]
    ys = [p[1] for p in lens] or [0]
    bright = 0
    for y in range(min(ys), max(ys) + 1):
        for x in range(min(xs), max(xs) + 1):
            red, green, blue, alpha = pixels[x, y]
            if alpha >= 230 and min(red, green, blue) >= 200:
                bright += 1
    rows.append({
        "lens": len(lens),
        "width": max(xs) - min(xs) + 1,
        "height": max(ys) - min(ys) + 1,
        "bright": bright,
    })
print(json.dumps(rows))
`, ...paths);

  for (const [index, row] of rows.entries()) {
    // One connected dark mass: both lenses plus the bridge between them. ~9,100px
    // in every shipped pose. A lens that went translucent, or one that vanished,
    // drops this hard.
    assert.ok(row.lens >= 7500,
      `${paths[index]} has only ${row.lens}px of solid dark lens (both lenses and the bridge should be one mass)`);
    // And it is glasses-shaped: wide and shallow. A single round dark blob of the
    // right area would pass the count alone.
    assert.ok(row.width >= 180 && row.height <= 120,
      `${paths[index]} lens mass is ${row.width}x${row.height}, not the shape of a pair of glasses`);
    // Inside that mass, the only bright opaque pixels should be the two thin
    // specular streaks (~100px). An exposed eye white is an order of magnitude
    // more than that.
    assert.ok(row.bright <= 400,
      `${paths[index]} shows ${row.bright}px of bright pixels behind the lenses (eye whites are showing through)`);
  }
});

test("Ninja keeps a coherently placed silver shuriken in every pose", () => {
  // SIDE-INDEPENDENT ON PURPOSE, for the same reason as the Shades test above:
  // the old version required the shuriken to sit on the character's left (x<225)
  // and forbade silver in a central box, and commit cca30f4 mirrored the mixing
  // pose. The shuriken is still there, still coherent, still attached; it is on
  // the other side. What actually matters is that there is exactly ONE silver
  // accessory, it is shuriken-shaped rather than a spoon or a ladle, it is beside
  // the character rather than floating away from it, and it is roughly the same
  // object in all four poses.
  const paths = STATES.map((state) => `assets/poses/ninja-${state}.png`);
  const rows = probe(String.raw`
from PIL import Image
import json, sys

def components(selected):
    seen = set(selected)
    out = []
    while seen:
        stack = [seen.pop()]
        pts = []
        while stack:
            x, y = stack.pop()
            pts.append((x, y))
            for nx in range(x - 1, x + 2):
                for ny in range(y - 1, y + 2):
                    point = (nx, ny)
                    if point in seen:
                        seen.remove(point)
                        stack.append(point)
        out.append(pts)
    out.sort(key=len, reverse=True)
    return out

rows = []
for path in sys.argv[1:]:
    image = Image.open(path).convert("RGBA")
    pixels = image.load()
    silver = set()
    for y in range(200, 430):
        for x in range(image.width):
            red, green, blue, alpha = pixels[x, y]
            if (alpha >= 230 and (red + green + blue) / 3 >= 100
                    and max(red, green, blue) - min(red, green, blue) <= 35):
                silver.add((x, y))
    parts = components(silver)
    biggest = parts[0] if parts else []
    xs = [p[0] for p in biggest] or [0]
    ys = [p[1] for p in biggest] or [0]

    # Whole-figure alpha bounds, so "beside the character" can be measured
    # without assuming which side the character faces.
    visible = [(x, y) for y in range(image.height) for x in range(image.width)
               if pixels[x, y][3] > 16]
    fxs = [p[0] for p in visible] or [0]

    # Any silver blob that is NOT the shuriken and not a stray antialiased speck.
    others = sum(1 for part in parts[1:] if len(part) >= 150)

    # Is the shuriken attached to the character? Detached = its own alpha island.
    figure = components({(x, y) for x, y in visible})
    figure_sizes = sorted((len(f) for f in figure), reverse=True)

    rows.append({
        "silver": len(biggest),
        "width": max(xs) - min(xs) + 1,
        "height": max(ys) - min(ys) + 1,
        "cx": sum(xs) / len(xs),
        "fig_min": min(fxs), "fig_max": max(fxs),
        "others": others,
        "largest_detached": figure_sizes[1] if len(figure_sizes) > 1 else 0,
    })
print(json.dumps(rows))
`, ...paths);

  for (const [index, row] of rows.entries()) {
    const label = paths[index];
    // One shuriken, ~65px square, in every pose.
    assert.ok(row.silver >= 1200,
      `${label} is missing the silver shuriken (${row.silver}px of silver)`);
    const aspect = row.width / row.height;
    assert.ok(aspect >= 0.7 && aspect <= 1.45,
      `${label} silver accessory is ${row.width}x${row.height} (aspect ${aspect.toFixed(2)}); a shuriken is roughly square, a spoon or ladle is not`);
    assert.ok(row.width >= 45 && row.width <= 95,
      `${label} silver accessory is ${row.width}px across, not shuriken-sized`);
    assert.equal(row.others, 0,
      `${label} carries a second silver object as well as the shuriken`);
    // Beside the character, not planted over the middle of them.
    const mid = (row.fig_min + row.fig_max) / 2;
    const halfWidth = (row.fig_max - row.fig_min) / 2;
    assert.ok(Math.abs(row.cx - mid) >= halfWidth * 0.25,
      `${label} puts the shuriken over the character's centre line rather than beside them`);
    assert.ok(row.largest_detached <= 100,
      `${label} leaves a ${row.largest_detached}px accessory floating away from the character`);
  }
});

test("Strawberry shop portrait keeps opaque white eye glints", () => {
  const [alphas, mins, components] = probe(String.raw`
from PIL import Image
import json, sys

image = Image.open(sys.argv[1]).convert("RGBA")
anchors = ((196, 257), (295, 257), (305, 270), (206, 270))
pixels = [image.getpixel(point) for point in anchors]
transparent = {
    (x, y)
    for y in range(230, 290)
    for x in range(170, 330)
    if image.getpixel((x, y))[3] <= 16
}
components = []
while transparent:
    start = transparent.pop()
    stack = [start]
    size = 0
    while stack:
        x, y = stack.pop()
        size += 1
        for neighbor in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
            if neighbor in transparent:
                transparent.remove(neighbor)
                stack.append(neighbor)
    components.append(size)
print(json.dumps([[pixel[3] for pixel in pixels], [min(pixel[:3]) for pixel in pixels], components]))
`, "assets/Strawberry.png");

  assert.deepEqual(alphas, [255, 255, 255, 255],
    "Strawberry eye glints must be opaque white, not holes showing the scene background");
  assert.ok(mins.every((value) => value >= 220), "Strawberry eye glints must remain white");
  assert.ok(components.every((size) => size <= 16),
    `Strawberry face contains transparent holes of ${components.join(", ")} px`);
});

test("pose PNGs do not carry broad embedded floor shadows", () => {
  const skins = ["base", "grad-cap", "flower", "scarf", "shades", "strawberry", "astro-blue",
    "dragon", "cat-hoodie", "royal", "ninja", "angel", "devil", "wizard"];
  const paths = skins.flatMap((skin) => STATES.map((state) => `assets/poses/${skin}-${state}.png`));
  const rows = probe(String.raw`
from PIL import Image
import json, sys

rows = []
for path in sys.argv[1:]:
    image = Image.open(path).convert("RGBA")
    width = image.width
    pixels = list(image.get_flattened_data())
    solid_bottom = max(index // width for index, pixel in enumerate(pixels) if pixel[3] > 128)
    below = [
        (index % width, index // width, pixel[3])
        for index, pixel in enumerate(pixels)
        if index // width > solid_bottom and pixel[3] > 0
    ]
    depth = max((y for _, y, _ in below), default=solid_bottom) - solid_bottom
    xs = [x for x, _, _ in below]
    width = max(xs) - min(xs) + 1 if xs else 0
    rows.append({"count": len(below), "depth": depth, "width": width})
print(json.dumps(rows))
`, ...paths);

  for (const [index, row] of rows.entries()) {
    assert.ok(!(row.count > 80 && row.width >= 150 && row.depth >= 4),
      `${paths[index]} has a broad embedded floor shadow (${row.count} px, ${row.width}px wide, ${row.depth}px deep)`);
  }
});
