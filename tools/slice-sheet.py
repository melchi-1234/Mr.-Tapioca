#!/usr/bin/env python3
# Slice a rows x cols character sprite-sheet into individual, content-centered,
# transparent PNGs. Because all cells come from ONE generation, their color/style
# is identical — fixes the run-to-run drift of generating each pose separately.
#   python3 tools/slice-sheet.py <sheet.png> <out-prefix> <rows> <cols>
# writes <out-prefix>-cell0.png, -cell1.png, ... (left-to-right, top-to-bottom)
import sys
from PIL import Image

inp, prefix, rows, cols = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
im = Image.open(inp).convert("RGBA")
W, H = im.size
cw, ch = W // cols, H // rows
out = max(cw, ch)
idx = 0
for r in range(rows):
    for c in range(cols):
        cell = im.crop((c * cw, r * ch, c * cw + cw, r * ch + ch))
        bbox = cell.getbbox()                      # tight bounds of non-transparent pixels
        sub = cell.crop(bbox) if bbox else cell
        # scale down if the trimmed pose is bigger than the square canvas
        if sub.width > out or sub.height > out:
            s = min(out / sub.width, out / sub.height)
            sub = sub.resize((max(1, int(sub.width * s)), max(1, int(sub.height * s))), Image.LANCZOS)
        canvas = Image.new("RGBA", (out, out), (0, 0, 0, 0))
        canvas.paste(sub, ((out - sub.width) // 2, (out - sub.height) // 2), sub)
        canvas.save(f"{prefix}-cell{idx}.png")
        print(f"cell{idx}: bbox={bbox} -> {sub.width}x{sub.height} on {out}x{out}")
        idx += 1
