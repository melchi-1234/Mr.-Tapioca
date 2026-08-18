#!/usr/bin/env python3
"""Validate the complete 14-skin, four-state pose bundle with Pillow only."""

from pathlib import Path
import sys

from PIL import Image


SKINS = (
    "angel", "astro-blue", "base", "cat-hoodie", "devil", "dragon", "flower",
    "grad-cap", "ninja", "royal", "scarf", "shades", "strawberry", "wizard",
)
STATES = ("idle", "mixing", "sleeping", "shocked")
EXPECTED = {f"{skin}-{state}.png" for skin in SKINS for state in STATES}


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
        metrics[skin].append((state, solid_box, opaque))

    for skin, poses in metrics.items():
        if len(poses) != 4:
            continue
        bottoms = [box[3] - 1 for _, box, _ in poses]
        heights = [box[3] - box[1] for _, box, _ in poses]
        coverage = [opaque for _, _, opaque in poses]
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

    print("PASS: 56 RGBA poses, complete set, stable baselines and healthy coverage")
    return 0


if __name__ == "__main__":
    sys.exit(main())
