#!/usr/bin/env python3
# Slice a rows x cols character sprite-sheet into individual transparent PNGs.
# Because all cells come from ONE generation, their color/style is identical —
# fixes the run-to-run drift of generating each pose separately.
#
#   python3 tools/slice-sheet.py <sheet.png> <out-prefix> <rows> <cols> [--uniform] [--size=500]
#
# writes <out-prefix>-cell0.png, -cell1.png, ... (left-to-right, top-to-bottom)
#
# --uniform  (use this for pose sets that feed SKIN_POSES)
#   Crops every cell with ONE shared box — the union of all cells' content —
#   instead of trimming each cell to its own bounds. The default per-cell trim
#   re-centres each pose independently, which throws away the alignment the
#   single render already got right: a pose whose arms are tucked in ends up
#   scaled and shifted differently from one whose arms are out, and the
#   character visibly pops when the app swaps states. The shipped base art has
#   exactly this fault (Mr. Tapioca.png bottom=428 / Mixing.png bottom=437 /
#   Sleeping.png bottom=402), so don't reintroduce it in the new art.
#
# --size=N   Normalise output to N x N (default 500, matching SKIN_IMAGES).
#            The generator's grid size isn't predictable — a 1024² sheet gives
#            512² cells — so the app would otherwise get inconsistent portraits.
#
# --match=<canonical.png>   (use this alongside --uniform)
#   Scales and seats the poses to match a canonical portrait, so a pose and the
#   shop art are the same character at the same size. Without it the generator's
#   own framing wins: the first wizard sheet came back 16% taller than
#   assets/Wizard.png, which would have made him grow every time the app fell
#   back to the portrait for a state with no pose. ONE scale factor and ONE
#   offset are applied to every cell, so the inter-cell alignment that --uniform
#   preserved survives intact.
import sys
import numpy as np
from PIL import Image


def content_box(img):
    a = np.array(img)[:, :, 3]
    ys, xs = np.where(a > 16)
    if len(xs) == 0:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())

args = [a for a in sys.argv[1:] if not a.startswith("--")]
flags = [a for a in sys.argv[1:] if a.startswith("--")]
if len(args) < 4:
    print("usage: slice-sheet.py <sheet.png> <out-prefix> <rows> <cols> "
          "[--uniform] [--size=500]")
    sys.exit(1)

inp, prefix, rows, cols = args[0], args[1], int(args[2]), int(args[3])
uniform = "--uniform" in flags
size = next((int(f.split("=", 1)[1]) for f in flags if f.startswith("--size=")), 500)
match = next((f.split("=", 1)[1] for f in flags if f.startswith("--match=")), None)

im = Image.open(inp).convert("RGBA")
W, H = im.size
cw, ch = W // cols, H // rows

cells = [im.crop((c * cw, r * ch, c * cw + cw, r * ch + ch))
         for r in range(rows) for c in range(cols)]

if uniform:
    # One box for every cell: the union of all content, in cell-local coords.
    boxes = [c.getbbox() for c in cells]
    present = [b for b in boxes if b]
    if not present:
        print("ERROR: every cell is empty — was the sheet keyed to transparency first?")
        sys.exit(2)
    shared = (min(b[0] for b in present), min(b[1] for b in present),
              max(b[2] for b in present), max(b[3] for b in present))
    print(f"uniform crop box {shared} applied to all {len(cells)} cells")

subs = [cell.crop(shared) if uniform else cell.crop(cell.getbbox() or (0, 0, cw, ch))
        for cell in cells]

if match:
    if not uniform:
        print("ERROR: --match requires --uniform (it relies on a shared crop box)")
        sys.exit(2)
    canon = Image.open(match).convert("RGBA")
    cbox = content_box(canon)
    if cbox is None:
        print(f"ERROR: {match} has no opaque pixels")
        sys.exit(2)
    canon_h = cbox[3] - cbox[1]
    boxes = [content_box(s) for s in subs]
    mean_h = sum(b[3] - b[1] for b in boxes) / len(boxes)
    scale = canon_h / mean_h
    subs = [s.resize((max(1, round(s.width * scale)), max(1, round(s.height * scale))),
                     Image.LANCZOS) for s in subs]
    # Horizontal offset is SHARED so he never slides sideways between states.
    # Vertical offset is PER CELL so every pose's lowest pixel lands on the same
    # floor — a feet anchor. A shared vertical offset looks right only while
    # every pose stands the same way: the sleeping pose settles lower, which put
    # its baseline 18px off the others and made him sink on entering break.
    boxes = [content_box(s) for s in subs]
    mean_cx = sum((b[0] + b[2]) / 2 for b in boxes) / len(boxes)
    off_x = round((cbox[0] + cbox[2]) / 2 - mean_cx)
    off_y = [round(cbox[3] - b[3]) for b in boxes]
    print(f"match: scaled by {scale:.3f} to canonical height {canon_h}px, "
          f"x offset {off_x:+d}, per-cell y offsets {off_y}")
else:
    off_x = off_y = None

for idx, sub in enumerate(subs):
    if off_x is None:
        # Fit into the square output canvas, preserving aspect.
        if sub.width > size or sub.height > size:
            s = min(size / sub.width, size / sub.height)
            sub = sub.resize((max(1, int(sub.width * s)), max(1, int(sub.height * s))),
                             Image.LANCZOS)
        px, py = (size - sub.width) // 2, (size - sub.height) // 2
    else:
        px, py = off_x, off_y[idx]
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.paste(sub, (px, py), sub)
    canvas.save(f"{prefix}-cell{idx}.png")
    print(f"cell{idx}: -> {sub.width}x{sub.height} at ({px},{py}) on {size}x{size}")
