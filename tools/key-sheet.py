#!/usr/bin/env python3
# Cut a generated sheet off its solid background and give it real transparency.
#
#   python3 tools/key-sheet.py <in.png> <out.png> [--key=R,G,B] [--report]
#                              [--strip-islands] [--despill-ref=<canonical.png>]
#
# Image models don't return alpha, so poses have to be generated on a solid
# backdrop and keyed out afterwards. The LAST time this repo did that (via a
# video pipeline) it left a bright rim sitting exactly where the outline should
# be, and the rim caught a different amount on every frame — see the "green rim"
# section of tools/clean-sprites.py. Three things here prevent that:
#
#   1. Background is found by FLOOD FILL FROM THE BORDER, not by colour alone.
#      A white eye highlight or a green strawberry leaf is never background,
#      because it isn't connected to the edge. Colour-only keying punches holes.
#   2. Edge pixels get FRACTIONAL alpha from their distance to the key colour,
#      so the anti-aliased outline survives instead of being cut to a crust.
#   3. Those same edge pixels are UNMIXED: the key colour's contribution is
#      algebraically removed rather than left tinting the outline. This is what
#      actually kills the rim, and it's the step the old pipeline skipped.
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

# Candidates the generator is allowed to use as a backdrop. Per skin we pick
# whichever sits furthest from that character's own palette, so the strawberry's
# leaf never gets keyed on green and the astronaut never gets keyed on blue.
KEY_CANDIDATES = {
    "green":   (0, 255, 0),
    "cyan":    (0, 255, 255),
    "magenta": (255, 0, 255),
    "blue":    (0, 0, 255),
}

T_LOW = 60.0        # distance <= this  → certainly backdrop
T_HIGH = 140.0      # distance >= this  → certainly character
ISLAND_FRAC = 0.015  # blob smaller than this share of the biggest = stray mark


def pick_key_colour(ref_path):
    """Best backdrop colour for one character: the candidate furthest from any
    colour the character actually uses. Returns (name, rgb, margin)."""
    im = np.array(Image.open(ref_path).convert("RGBA")).astype(np.int16)
    opaque = im[im[:, :, 3] > 200][:, :3]
    palette = np.unique(opaque // 24 * 24, axis=0)
    scored = [
        (name, rgb, float(np.min(np.linalg.norm(palette - np.array(rgb), axis=1))))
        for name, rgb in KEY_CANDIDATES.items()
    ]
    scored.sort(key=lambda s: -s[2])
    return scored[0]


def detect_key_colour(rgb):
    """Infer the backdrop from the image's own corners."""
    h, w, _ = rgb.shape
    p = 6
    corners = np.concatenate([
        rgb[:p, :p].reshape(-1, 3), rgb[:p, -p:].reshape(-1, 3),
        rgb[-p:, :p].reshape(-1, 3), rgb[-p:, -p:].reshape(-1, 3),
    ])
    return np.median(corners, axis=0)


def despill_to_palette(rgb, alpha, key, ref_path, report=False):
    """Pull backdrop contamination out of SOLID pixels, using the character's
    own reference art as the answer key.

    The edge unmix in key_out() only touches pixels it knows are part-backdrop.
    It can't help a feature that is small enough to be mostly edge: the wizard's
    wand sparkles are ~20px each, so the generator drew them already blended
    with the backdrop, and they came out mint green (152,218,164) where the
    canonical art has gold (225,194,131). No threshold fixes that, because the
    contaminated pixels genuinely aren't near the key colour any more.

    So instead of guessing, ask the reference. Flat kawaii art uses a dozen or so
    colours. For each solid pixel, find the reference colour C that best explains
    it as C blended with the key colour, and if the fit is good and the implied
    contamination is real, restore C. Pixels that aren't explainable that way are
    left exactly as they are."""
    ref = np.array(Image.open(ref_path).convert("RGBA"))
    op = ref[ref[:, :, 3] > 200][:, :3]
    q = (op // 8 * 8)
    cols, counts = np.unique(q, axis=0, return_counts=True)
    pal = cols[counts > len(op) * 0.001].astype(np.float32)   # colours that matter
    if len(pal) == 0:
        return rgb, 0

    solid = alpha > 0.9
    P = rgb[solid]                                            # (N,3)
    KC = key[None, :] - pal                                   # (M,3)
    denom = (KC * KC).sum(1)                                  # (M,)
    diff = P[:, None, :] - pal[None, :, :]                    # (N,M,3)
    c = np.clip((diff * KC[None]).sum(2) / np.maximum(denom, 1e-6), 0, 1)
    model = pal[None] + c[:, :, None] * KC[None]              # (N,M,3)
    resid = np.linalg.norm(P[:, None, :] - model, axis=2)     # (N,M)
    best = resid.argmin(1)
    rows = np.arange(len(P))
    fixable = (resid[rows, best] < 26) & (c[rows, best] > 0.10)
    out = P.copy()
    out[fixable] = pal[best[fixable]]
    rgb = rgb.copy()
    rgb[solid] = out
    if report and fixable.sum():
        print(f"  de-spilled {int(fixable.sum())} solid px back to reference colours")
    return rgb, int(fixable.sum())


def key_out(path_in, path_out, key=None, report=False, strip_islands=False,
            despill_ref=None):
    src = Image.open(path_in).convert("RGB")
    rgb = np.array(src).astype(np.float32)
    key = np.array(detect_key_colour(rgb) if key is None else key, dtype=np.float32)

    dist = np.linalg.norm(rgb - key, axis=2)

    # Connectivity: only backdrop-ish pixels reachable from the border count.
    # Interior pixels that merely resemble the key colour stay opaque.
    backdropish = dist < T_HIGH
    labels, _ = ndimage.label(backdropish)
    border = np.concatenate([labels[0, :], labels[-1, :], labels[:, 0], labels[:, -1]])
    outside_ids = set(int(v) for v in np.unique(border) if v != 0)
    outside = np.isin(labels, list(outside_ids)) if outside_ids else np.zeros_like(backdropish)

    alpha = np.ones_like(dist)
    ramp = np.clip((dist - T_LOW) / (T_HIGH - T_LOW), 0.0, 1.0)
    alpha[outside] = ramp[outside]

    # Unmix: observed = a*true + (1-a)*key  →  true = (observed - (1-a)*key)/a.
    # Without this the semi-transparent outline keeps a wash of the backdrop and
    # reads as a coloured rim that shimmers as the pose changes.
    out_rgb = rgb.copy()
    band = outside & (alpha > 0.02) & (alpha < 0.999)
    a = alpha[band][:, None]
    out_rgb[band] = np.clip((rgb[band] - (1.0 - a) * key) / a, 0, 255)

    # Strip stray marks — OPT-IN, and for good reason. Generators add motion
    # arrows and stray dots nobody asked for, which survive keying as little
    # islands beside the character. But "small floating blob" also describes
    # things that belong: this ran on by default exactly once, and it deleted
    # all sixteen sparkles off the wizard's wand while leaving the wand. An
    # angel's halo would go the same way. So it stays off unless asked for, and
    # every removal is printed either way.
    solid = alpha > 0.5
    blobs, n = ndimage.label(solid)
    removed = []
    if strip_islands and n > 1:
        sizes = ndimage.sum(solid, blobs, range(1, n + 1))
        biggest = sizes.max()
        for i, sz in enumerate(sizes, start=1):
            if sz < biggest * ISLAND_FRAC:
                ys, xs = np.where(blobs == i)
                removed.append((int(sz), int(xs.mean()), int(ys.mean())))
                alpha[blobs == i] = 0.0

    if despill_ref:
        out_rgb, _ = despill_to_palette(out_rgb, alpha, key, despill_ref, report)

    rgba = np.dstack([out_rgb, alpha * 255.0]).astype(np.uint8)
    Image.fromarray(rgba, "RGBA").save(path_out)

    if report:
        pct = 100.0 * (alpha < 0.06).mean()
        edge = int(band.sum())
        print(f"{path_in} -> {path_out}")
        print(f"  key rgb=({key[0]:.0f},{key[1]:.0f},{key[2]:.0f})  "
              f"transparent={pct:.1f}%  soft-edge px={edge}  unmixed={edge}")
        for sz, x, y in removed:
            print(f"  removed stray mark: {sz}px at ({x},{y})")
        if pct < 5:
            print("  WARNING: almost nothing was keyed — wrong backdrop colour?")
    return alpha


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    flags = [a for a in sys.argv[1:] if a.startswith("--")]
    key = None
    for f in flags:
        if f.startswith("--key=") and f.split("=", 1)[1] != "auto":
            key = [int(x) for x in f.split("=", 1)[1].split(",")]
    if len(args) < 2:
        print(__doc__ or "usage: key-sheet.py <in.png> <out.png> [--key=R,G,B] [--report]")
        sys.exit(1)
    despill = next((f.split("=", 1)[1] for f in flags if f.startswith("--despill-ref=")), None)
    key_out(args[0], args[1], key, report="--report" in flags,
            strip_islands="--strip-islands" in flags, despill_ref=despill)
