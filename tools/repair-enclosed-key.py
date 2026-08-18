#!/usr/bin/env python3
"""Remove one enclosed screen-key region without touching same-colour art.

This is the repair counterpart to check-key-color-art.py. It uses an explicit
seed point, so only the known enclosed backdrop region is changed; a green leaf
or blue gem elsewhere in the character cannot be selected accidentally.

Example:
    python3 tools/repair-enclosed-key.py --key 0,255,0 --seed 250,60 \
      --expect-count 3239 --expect-bbox 179,46,321,75 --in-place pose.png
"""

from argparse import ArgumentParser
from math import sqrt
from pathlib import Path
import sys

from PIL import Image


LOW_DISTANCE = 60.0
HIGH_DISTANCE = 155.0


def triplet(value, name):
    try:
        parts = tuple(int(part) for part in value.split(","))
    except ValueError as error:
        raise ValueError(f"{name} must be comma-separated integers") from error
    if len(parts) != 3 or any(part < 0 or part > 255 for part in parts):
        raise ValueError(f"{name} must be R,G,B values from 0 to 255")
    return parts


def point(value):
    try:
        parts = tuple(int(part) for part in value.split(","))
    except ValueError as error:
        raise ValueError("--seed must be X,Y integers") from error
    if len(parts) != 2:
        raise ValueError("--seed must be X,Y integers")
    return parts


def box(value):
    try:
        parts = tuple(int(part) for part in value.split(","))
    except ValueError as error:
        raise ValueError("--expect-bbox must be LEFT,TOP,RIGHT,BOTTOM integers") from error
    if len(parts) != 4:
        raise ValueError("--expect-bbox must be LEFT,TOP,RIGHT,BOTTOM integers")
    return parts


def repair(path, key, seed, expected_count, expected_bbox, destination):
    image = Image.open(path).convert("RGBA")
    pixels = image.load()
    width, height = image.size
    seed_x, seed_y = seed
    if not (0 <= seed_x < width and 0 <= seed_y < height):
        raise ValueError(f"{path}: seed {seed} lies outside {width}x{height}")

    def distance(x, y):
        red, green, blue, _ = pixels[x, y]
        return sqrt(
            (red - key[0]) ** 2
            + (green - key[1]) ** 2
            + (blue - key[2]) ** 2
        )

    stack = [seed]
    seen = {seed}
    component = []
    while stack:
        x, y = stack.pop()
        if pixels[x, y][3] <= 16 or distance(x, y) >= HIGH_DISTANCE:
            continue
        component.append((x, y))
        for neighbor in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            nx, ny = neighbor
            if 0 <= nx < width and 0 <= ny < height and neighbor not in seen:
                seen.add(neighbor)
                stack.append(neighbor)

    xs = [item[0] for item in component]
    ys = [item[1] for item in component]
    actual_bbox = (min(xs), min(ys), max(xs), max(ys)) if component else None
    if len(component) != expected_count or actual_bbox != expected_bbox:
        raise ValueError(
            f"{path}: seed selected count={len(component)}, bbox={actual_bbox}; expected "
            f"count={expected_count}, bbox={expected_bbox}, refusing to rewrite"
        )

    for x, y in component:
        red, green, blue, old_alpha = pixels[x, y]
        dist = distance(x, y)
        alpha = max(0.0, min(1.0, (dist - LOW_DISTANCE) / (HIGH_DISTANCE - LOW_DISTANCE)))
        if alpha <= 0.02:
            pixels[x, y] = (0, 0, 0, 0)
            continue

        # observed = alpha * true + (1-alpha) * key. Solving for true removes
        # the coloured fringe instead of merely making it translucent.
        restored = []
        for observed, key_channel in zip((red, green, blue), key):
            value = round((observed - (1.0 - alpha) * key_channel) / alpha)
            restored.append(max(0, min(255, value)))
        pixels[x, y] = (*restored, round(old_alpha * alpha))

    image.save(destination)
    print(
        f"{path} -> {destination}: repaired {len(component)} px "
        f"in x{min(xs)}..{max(xs)},y{min(ys)}..{max(ys)}"
    )


def main(argv=None):
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--key", required=True)
    parser.add_argument("--seed", required=True)
    parser.add_argument("--expect-count", type=int, required=True)
    parser.add_argument("--expect-bbox", required=True)
    parser.add_argument("--in-place", action="store_true")
    parser.add_argument("paths", nargs="+")
    args = parser.parse_args(argv)
    if not args.in_place:
        parser.error("--in-place is required; preview a copy before rewriting source art")

    try:
        key = triplet(args.key, "--key")
        seed = point(args.seed)
        expected_bbox = box(args.expect_bbox)
        for value in args.paths:
            path = Path(value)
            if not path.is_file():
                raise ValueError(f"missing PNG: {path}")
            repair(path, key, seed, args.expect_count, expected_bbox, path)
    except ValueError as error:
        parser.error(str(error))
    return 0


if __name__ == "__main__":
    sys.exit(main())
