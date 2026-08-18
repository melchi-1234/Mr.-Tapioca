#!/usr/bin/env python3
"""Reject visible connected islands of generation backdrop colour in PNG art.

Usage:
    python3 tools/check-key-color-art.py [--max-component 100] [--max-edge-total 0] <png-or-directory> [...]

The pose generator uses one of four screen-key colours. A few isolated pixels
can legitimately occur in an accessory, but a connected island is a keyed
background leak. The default ceiling is calibrated against every shipped pose:
the largest legitimate component is 47 pixels; the broken Angel halo was over
2,200 pixels in every state.
"""

from argparse import ArgumentParser
from pathlib import Path
import sys

from PIL import Image, ImageMath


KEY_HUES = {
    "green": (0, 255, 0),
    "cyan": (0, 255, 255),
    "magenta": (255, 0, 255),
    "blue": (0, 0, 255),
}
KEY_DISTANCE = 70
VISIBLE_ALPHA = 0
DEFAULT_MAX_COMPONENT = 100
DEFAULT_MAX_EDGE_TOTAL = 0


def png_paths(arguments):
    found = []
    for argument in arguments:
        path = Path(argument)
        if path.is_dir():
            found.extend(sorted(path.rglob("*.png")))
        elif path.is_file() and path.suffix.lower() == ".png":
            found.append(path)
        else:
            raise ValueError(f"not a PNG file or directory: {path}")
    return found


def largest_component(mask):
    width, height = mask.size
    remaining = {index for index, value in enumerate(mask.convert("L").tobytes()) if value}
    largest = 0

    while remaining:
        start = remaining.pop()
        stack = [start]
        size = 0
        while stack:
            index = stack.pop()
            size += 1
            x, y = index % width, index // width
            if x and index - 1 in remaining:
                remaining.remove(index - 1)
                stack.append(index - 1)
            if x + 1 < width and index + 1 in remaining:
                remaining.remove(index + 1)
                stack.append(index + 1)
            if y and index - width in remaining:
                remaining.remove(index - width)
                stack.append(index - width)
            if y + 1 < height and index + width in remaining:
                remaining.remove(index + width)
                stack.append(index + width)
        largest = max(largest, size)

    return largest


def inspect(path):
    with Image.open(path) as source:
        frame_count = getattr(source, "n_frames", 1)
        if frame_count != 1:
            raise ValueError(f"contains {frame_count} frames, expected one static PNG")
        image = source.convert("RGBA")
    red, green, blue, alpha = image.split()
    largest = (0, "none")
    edge_total = (0, "none")

    for name, (key_red, key_green, key_blue) in KEY_HUES.items():
        mask = ImageMath.lambda_eval(
            lambda channels: (
                (channels["red"] - key_red) * (channels["red"] - key_red)
                + (channels["green"] - key_green) * (channels["green"] - key_green)
                + (channels["blue"] - key_blue) * (channels["blue"] - key_blue)
                < KEY_DISTANCE * KEY_DISTANCE
            )
            & (channels["alpha"] > VISIBLE_ALPHA),
            red=red,
            green=green,
            blue=blue,
            alpha=alpha,
        )
        size = largest_component(mask)
        if size > largest[0]:
            largest = (size, name)

        edge_mask = ImageMath.lambda_eval(
            lambda channels: (
                (channels["red"] - key_red) * (channels["red"] - key_red)
                + (channels["green"] - key_green) * (channels["green"] - key_green)
                + (channels["blue"] - key_blue) * (channels["blue"] - key_blue)
                < KEY_DISTANCE * KEY_DISTANCE
            )
            & (channels["alpha"] > VISIBLE_ALPHA)
            & (channels["alpha"] < 240),
            red=red,
            green=green,
            blue=blue,
            alpha=alpha,
        )
        total = sum(value != 0 for value in edge_mask.convert("L").tobytes())
        if total > edge_total[0]:
            edge_total = (total, name)

    return largest, edge_total


def main(argv=None):
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("--max-component", type=int, default=DEFAULT_MAX_COMPONENT)
    parser.add_argument("--max-edge-total", type=int, default=DEFAULT_MAX_EDGE_TOTAL)
    parser.add_argument("paths", nargs="+")
    args = parser.parse_args(argv)

    try:
        paths = png_paths(args.paths)
    except ValueError as error:
        parser.error(str(error))
    if not paths:
        parser.error("no PNG files found")
    if args.max_component < 0:
        parser.error("--max-component must be non-negative")
    if args.max_edge_total < 0:
        parser.error("--max-edge-total must be non-negative")

    failures = []
    for path in paths:
        try:
            (size, key_name), (edge_size, edge_key_name) = inspect(path)
        except ValueError as error:
            failures.append(f"{path}: {error}")
            print(f"{path}: invalid ({error})")
            continue
        print(
            f"{path}: largest={size} px key={key_name}; "
            f"semi-transparent-total={edge_size} px key={edge_key_name}"
        )
        if size > args.max_component:
            failures.append(
                f"{path}: {size} px {key_name} key-color component exceeds "
                f"{args.max_component} px"
            )
        if edge_size > args.max_edge_total:
            failures.append(
                f"{path}: {edge_size} px {edge_key_name} semi-transparent key-color "
                f"total exceeds {args.max_edge_total} px"
            )

    if failures:
        print(f"\nFAILED ({len(failures)}):")
        for failure in failures:
            print(f"  - {failure}")
        return 1

    print(
        f"\nPASS: {len(paths)} PNG(s), no key-color component over "
        f"{args.max_component} px or semi-transparent total over {args.max_edge_total} px"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
