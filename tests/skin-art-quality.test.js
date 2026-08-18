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
  const paths = STATES.map((state) => `assets/poses/shades-${state}.png`);
  const rows = probe(String.raw`
from PIL import Image, ImageDraw
import json, sys

polygons = [
    [
        [(151,202),(222,203),(219,235),(205,246),(177,245),(157,232)],
        [(278,203),(346,201),(341,232),(325,245),(296,244),(280,231)],
    ],
    [
        [(174,187),(245,201),(238,230),(220,242),(195,237),(181,222)],
        [(281,211),(350,225),(343,254),(325,265),(299,260),(284,246)],
    ],
    [
        [(151,211),(226,216),(221,244),(206,256),(178,252),(158,240)],
        [(275,216),(351,211),(344,243),(327,254),(299,253),(280,241)],
    ],
    [
        [(153,205),(228,209),(223,239),(207,251),(179,247),(159,236)],
        [(274,211),(348,207),(341,239),(325,250),(298,249),(280,238)],
    ],
]
out = []
for path, pair in zip(sys.argv[1:], polygons):
    image = Image.open(path).convert("RGBA")
    mask = Image.new("1", image.size)
    draw = ImageDraw.Draw(mask)
    for polygon in pair:
        draw.polygon(polygon, fill=1)
    total = good = 0
    for (red, green, blue, alpha), selected in zip(image.get_flattened_data(), mask.get_flattened_data()):
        if not selected:
            continue
        total += 1
        luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue
        if alpha >= 230 and max(red, green, blue) - min(red, green, blue) <= 10 and luma <= 80:
            good += 1
    out.append({"total": total, "ratio": good / total})
print(json.dumps(out))
`, ...paths);

  for (const [index, row] of rows.entries()) {
    assert.ok(row.ratio >= 0.8,
      `${paths[index]} has only ${(row.ratio * 100).toFixed(1)}% opaque neutral-dark lens coverage`);
  }
});

test("Ninja keeps a coherently placed silver shuriken in every pose", () => {
  const paths = STATES.map((state) => `assets/poses/ninja-${state}.png`);
  const rows = probe(String.raw`
from PIL import Image
import json, sys

rows = []
for path in sys.argv[1:]:
    image = Image.open(path).convert("RGBA")
    left = center = 0
    for y in range(230, 410):
        for x in range(0, 320):
            red, green, blue, alpha = image.getpixel((x, y))
            light_neutral = (
                alpha >= 230
                and (red + green + blue) / 3 >= 100
                and max(red, green, blue) - min(red, green, blue) <= 35
            )
            if not light_neutral:
                continue
            if x < 225:
                left += 1
            if 220 <= x <= 319 and 250 <= y <= 359:
                center += 1
    visible = {
        (x, y)
        for y in range(image.height)
        for x in range(image.width)
        if image.getpixel((x, y))[3] > 16
    }
    components = []
    while visible:
        start = visible.pop()
        stack = [start]
        size = 0
        while stack:
            x, y = stack.pop()
            size += 1
            for nx in range(max(0, x - 1), min(image.width, x + 2)):
                for ny in range(max(0, y - 1), min(image.height, y + 2)):
                    point = (nx, ny)
                    if point in visible:
                        visible.remove(point)
                        stack.append(point)
        components.append(size)
    components.sort(reverse=True)
    rows.append({"left": left, "center": center, "largest_detached": components[1] if len(components) > 1 else 0})
print(json.dumps(rows))
`, ...paths);

  for (const [index, row] of rows.entries()) {
    assert.ok(row.left >= 300,
      `${paths[index]} is missing the silver shuriken on the character's left (${row.left} px)`);
    assert.ok(row.center <= 32,
      `${paths[index]} substitutes a central silver spoon/ladle (${row.center} px)`);
    assert.ok(row.largest_detached <= 100,
      `${paths[index]} leaves a ${row.largest_detached}px accessory floating away from the character`);
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
