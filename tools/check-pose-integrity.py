#!/usr/bin/env python3
"""Validate the complete 14-skin, four-state pose bundle with Pillow only."""

from pathlib import Path
from hashlib import sha256
import sys

from PIL import Image


SKINS = (
    "angel", "astro-blue", "base", "cat-hoodie", "devil", "dragon", "flower",
    "grad-cap", "ninja", "royal", "scarf", "shades", "strawberry", "wizard",
)
STATES = ("idle", "mixing", "sleeping", "shocked")
EXPECTED = {f"{skin}-{state}.png" for skin in SKINS for state in STATES}
REPOSITORY_ROOT = Path(__file__).resolve().parent.parent
CANONICAL_ART = {
    "base": "assets/Mr. Tapioca.png",
    "grad-cap": "assets/Graduation Cap.png",
    "flower": "assets/Flower Crown.png",
    "scarf": "assets/Scarf.png",
    "shades": "assets/Sunglasses.png",
    "strawberry": "assets/Strawberry.png",
    "astro-blue": "assets/Astronaut, blue.png",
    "dragon": "assets/Dragon.png",
    "cat-hoodie": "assets/Cat Hoodie.png",
    "royal": "assets/Royal Crown.png",
    "ninja": "assets/Ninja.png",
    # The old standalone Angel portrait is a different costume. The equipped
    # idle pose is now the canonical shop/runtime design.
    "angel": "assets/poses/angel-idle.png",
    "devil": "assets/Devil.png",
    "wizard": "assets/Wizard.png",
}
NOVEL_MAX = 0.40
ACCESSORY_MIN = 0.70


def palette_histogram(image):
    """Return a normalized 5-bit RGB histogram of solid character pixels."""
    counts = [0] * 512
    total = 0
    for red, green, blue, alpha in image.convert("RGBA").get_flattened_data():
        if alpha <= 200:
            continue
        counts[(red // 32) * 64 + (green // 32) * 8 + blue // 32] += 1
        total += 1
    if total == 0:
        return None
    return [count / total for count in counts]


def identity_metrics(pose_histogram, canonical_histogram, base_histogram):
    """Measure new palette drift and survival of skin-specific accessory color."""
    novel = sum(
        pose_histogram[index]
        for index, canonical_share in enumerate(canonical_histogram)
        if canonical_share < 0.002
    )
    accessory_bins = [
        index
        for index, canonical_share in enumerate(canonical_histogram)
        if canonical_share > 0.004 and base_histogram[index] < 0.002
    ]
    if not accessory_bins:
        return novel, 1.0
    canonical_accessory = sum(canonical_histogram[index] for index in accessory_bins)
    retained = sum(pose_histogram[index] for index in accessory_bins) / max(canonical_accessory, 1e-9)
    return novel, min(retained, 1.0)


def main(argv=None):
    arguments = list(sys.argv[1:] if argv is None else argv)
    if len(arguments) != 1:
        print("usage: check-pose-integrity.py <pose-directory>", file=sys.stderr)
        return 2

    directory = Path(arguments[0])
    if not directory.is_dir():
        print(f"FAILED: pose directory is missing: {directory}")
        return 1

    actual = {path.name for path in directory.glob("*.png")}
    failures = []
    missing = sorted(EXPECTED - actual)
    extra = sorted(actual - EXPECTED)
    if missing:
        failures.append(f"missing {len(missing)} required pose(s): {', '.join(missing)}")
    if extra:
        failures.append(f"unexpected pose PNG(s): {', '.join(extra)}")

    canonical_histograms = {}
    try:
        for skin, relative_path in CANONICAL_ART.items():
            canonical_path = REPOSITORY_ROOT / relative_path
            with Image.open(canonical_path) as source:
                canonical_histograms[skin] = palette_histogram(source)
        base_histogram = canonical_histograms["base"]
    except (OSError, ValueError) as error:
        print(f"FAILED: canonical skin art could not be read: {error}")
        return 1

    metrics = {skin: [] for skin in SKINS}
    for name in sorted(EXPECTED & actual):
        path = directory / name
        with Image.open(path) as source:
            frame_count = getattr(source, "n_frames", 1)
            if frame_count != 1:
                failures.append(f"{name}: contains {frame_count} frames, expected one static pose")
                continue
            if source.mode != "RGBA":
                failures.append(f"{name}: mode is {source.mode}, expected RGBA")
            image = source.convert("RGBA")
        if image.size != (500, 500):
            failures.append(f"{name}: size is {image.width}x{image.height}, expected 500x500")
            continue

        alpha = image.getchannel("A")
        corners = (
            alpha.getpixel((0, 0)), alpha.getpixel((499, 0)),
            alpha.getpixel((0, 499)), alpha.getpixel((499, 499)),
        )
        if max(corners) > 16:
            failures.append(f"{name}: opaque backdrop corner (max alpha {max(corners)})")

        solid_box = alpha.point(lambda value: 255 if value > 128 else 0).getbbox()
        if solid_box is None:
            failures.append(f"{name}: no visible character art")
            continue
        opaque = sum(value >= 230 for value in alpha.get_flattened_data())
        if not 60_000 <= opaque <= 160_000:
            failures.append(f"{name}: opaque coverage {opaque} outside 60000..160000")

        skin, state = name[:-4].rsplit("-", 1)
        if skin == "angel":
            pixels = image.load()
            off_warm = 0
            halo_points = set()
            for y in range(30, 92):
                for x in range(158, 343):
                    red, green, blue, pixel_alpha = pixels[x, y]
                    if pixel_alpha > 0:
                        halo_points.add((x, y))
                        if not (red >= green >= blue):
                            off_warm += 1
            if off_warm:
                failures.append(
                    f"{name}: gold halo retains {off_warm} green or magenta chroma pixel(s)"
                )
            halo_core = sum(
                pixels[x, y][3] > 0
                for y in range(52, 69)
                for x in range(200, 301)
            )
            if halo_core:
                failures.append(f"{name}: halo opening contains {halo_core} visible pixel(s)")

            components = []
            while halo_points:
                start = halo_points.pop()
                stack = [start]
                component_size = 0
                while stack:
                    x, y = stack.pop()
                    component_size += 1
                    for neighbor in (
                        (x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)
                    ):
                        if neighbor in halo_points:
                            halo_points.remove(neighbor)
                            stack.append(neighbor)
                components.append(component_size)
            if len(components) != 1:
                failures.append(
                    f"{name}: halo has {len(components)} disconnected visible components"
                )

        pose_histogram = palette_histogram(image)
        novel, accessory = identity_metrics(
            pose_histogram, canonical_histograms[skin], base_histogram
        )
        if novel > NOVEL_MAX:
            failures.append(
                f"{name}: off-model identity drift {novel:.3f} exceeds {NOVEL_MAX:.2f}"
            )
        if accessory < ACCESSORY_MIN:
            failures.append(
                f"{name}: identity accessory retention {accessory:.3f} below {ACCESSORY_MIN:.2f}"
            )
        pixel_digest = sha256(
            image.width.to_bytes(4, "big")
            + image.height.to_bytes(4, "big")
            + image.tobytes()
        ).hexdigest()
        metrics[skin].append((state, solid_box, opaque, pixel_digest))

    for skin, poses in metrics.items():
        if len(poses) != 4:
            continue
        bottoms = [box[3] - 1 for _, box, _, _ in poses]
        heights = [box[3] - box[1] for _, box, _, _ in poses]
        coverage = [opaque for _, _, opaque, _ in poses]
        by_digest = {}
        for state, _, _, digest in poses:
            by_digest.setdefault(digest, []).append(state)
        for duplicate_states in by_digest.values():
            if len(duplicate_states) > 1:
                names = ", ".join(f"{skin}-{state}.png" for state in sorted(duplicate_states))
                failures.append(f"{skin}: pixel-identical pose states: {names}")
        if max(bottoms) - min(bottoms) > 4:
            failures.append(f"{skin}: baseline varies {max(bottoms) - min(bottoms)} px")
        if max(heights) - min(heights) > 30:
            failures.append(f"{skin}: visible height varies {max(heights) - min(heights)} px")
        if min(coverage) / max(coverage) < 0.8:
            failures.append(f"{skin}: one pose retains under 80% of its set's opaque coverage")

    if failures:
        print(f"FAILED ({len(failures)}):")
        for failure in failures:
            print(f"  - {failure}")
        return 1

    print("PASS: 56 RGBA poses, complete set, correct skin identity, stable baselines and healthy coverage")
    return 0


if __name__ == "__main__":
    sys.exit(main())
