#!/usr/bin/env python3
"""Repair the three visual defects the sprite sheets picked up from the
video-to-sprite pipeline. Re-runnable and idempotent: every stage measures
first and no-ops on frames that are already clean.

  A. CHROMA RIM. The green-screen key left a 2-3px bright green rim on the
     silhouette of the AI-video frames. It reads as a fringe where the black
     outline should be, and because the key caught a different amount on every
     frame, the outline visibly changes thickness as the sprite plays. The art's
     own dark outline survives UNDERNEATH the rim (measured: green at depths
     1-3, genuine luma-30 brown at depth 4+), so the repair is to cut the
     contaminated band and let the real outline show, never to paint a fake one.

     Gated hard: only pixels with green-excess >= 60 AND r < 110 are cut, and
     the softer despill only runs in the neighbourhood of a cut pixel. The
     strawberry's leaf peaks at green-excess 53 with r=153, so it cannot be
     touched. (A previous global despill turned that leaf olive.)

  B. DEBRIS. Key residue left specks floating off the silhouette. This pass is
     deliberately timid: the angel's halo sparkles and the wizard's wand
     sparkles are DRAWN ART that is also small and detached, so only
     sub-visible flecks and provably green residue go. Anything that could be
     a sparkle stays.

  C. RAGGED FRAMES. A few frames were keyed with a hard threshold instead of
     coming through the video path, so they carry no anti-aliasing at all
     (0.3% soft alpha against 2.0% on their neighbours) and their outline is a
     ragged near-black crust about 6px deep where the video frames carry a
     clean 3px brown one. That is exactly why the outline looks like it
     changes thickness as the loop plays. Against the app's cream background
     the crust is unmistakable.

     These frames are DROPPED, not repaired. The damage is baked several
     pixels deep into the RGB, so eroding or medianing it only thins the crust
     rather than removing it (tried and measured), and anything further would
     be inventing pixels. Dropping costs a few frames of a subtle idle loop and
     leaves every remaining frame genuinely clean. The sheet is repacked and
     sprites.json is rewritten to match. If too few frames would survive, the
     salvage path smooths them in place instead.

  D. DRIFT. Seedance redrew the character every frame, so scale and position
     wander: the base's feet hop 26px between frames and the devil's 41px, and
     the angel's head swings 10% in width. Frames are registered to the sheet's
     median using the tapioca pearl (the head) as the anchor, which is stable
     to ~2% on a well-behaved sheet while the full bounding box is not (the
     drawn feet change size frame to frame and drag the bbox with them).

     Only sheets that measurably drift are touched. Sheets already pinned
     within DRIFT_PX stay byte-identical.

Usage:
    python3 tools/clean-sprites.py            # report only, writes nothing
    python3 tools/clean-sprites.py --apply    # rewrite the sheets in place
    python3 tools/clean-sprites.py --apply --out DIR   # write elsewhere
"""
import argparse
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPRITES = os.path.join(REPO, "assets", "sprites")
ART = os.path.join(REPO, "assets")

CELL_W, CELL_H = 410, 460

# --- chroma rim -------------------------------------------------------------
CHROMA_HARD = 60      # green-excess that is unambiguously key spill
CHROMA_SOFT = 20      # partial contamination, only cleaned next to a hard pixel
CHROMA_R_MAX = 110    # key spill is dark in red; the strawberry leaf is r=153
CHROMA_NEAR = 3       # px around a hard pixel that the soft pass may touch
CHROMA_MIN_PX = 40    # fewer than this on a frame means there is no rim

# --- debris -----------------------------------------------------------------
DEBRIS_MAX = 12       # detached flecks this small cannot be intentional art
DEBRIS_GREEN_MAX = 150   # bigger green-tinted residue is still key spill
DEBRIS_GREEN = 15        # ...if it is this green on average

# --- ragged frames ----------------------------------------------------------
RAGGED_SOFT = 1.0     # % of edge pixels with partial alpha; healthy frames ~2%
RAGGED_SPECK = 25     # stray edge pixels; healthy frames sit under 15
RAGGED_BAND = 3       # px inward from the edge that the median may rewrite
RAGGED_FEATHER = 0.6  # gaussian sigma used to put anti-aliasing back
SPECK_DELTA = 45      # colour distance from the local median that marks damage
MIN_FRAMES = 8        # never drop a sheet below this; salvage in place instead

# --- drift ------------------------------------------------------------------
DRIFT_PX = 6          # sheets whose silhouette moves less than this are left alone
DRIFT_SCALE = 0.05    # ...and whose head width varies less than this
ANCHOR_MAX_VAR = 0.15  # head width swinging more than this means a bad mask
SCALE_CLAMP = 0.14    # never rescale a frame by more than +/-14%
EDGE_MARGIN = 6       # keep this many px of clear space at the cell edges

# skin -> portrait, mirroring SKIN_ART in app.js
SKIN_ART = {
    "base": "Mr. Tapioca.png", "grad-cap": "Graduation Cap.png",
    "flower": "Flower Crown.png", "scarf": "Scarf.png", "shades": "Sunglasses.png",
    "angel": "Angel.png", "devil": "Devil.png", "dragon": "Dragon.png",
    "astro-blue": "Astronaut, blue.png", "ninja": "Ninja.png",
    "strawberry": "Strawberry.png", "wizard": "Wizard.png",
    "cat-hoodie": "Cat Hoodie.png", "royal": "Royal Crown.png",
}
# 11 of the 14 sheets were built at this sheet-height / portrait-height ratio.
# The AI-video ones drifted off it, which is why some characters read as
# smaller than the rest of the family.
FAMILY_RATIO = 0.82
RATIO_FIX_MIN = 0.05  # only correct a skin that is more than 5% off the family


def green_excess(rgb):
    return rgb[..., 1] - np.maximum(rgb[..., 0], rgb[..., 2])


def pearl_mask(rgb, a):
    """The tapioca pearl: warm mid-dark brown, opaque. Present on every skin."""
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    return (a >= 200) & (r > g + 10) & (g >= b - 8) & (r > 50) & (r < 170) & (g < 135)


def largest(mask):
    lab, n = ndimage.label(mask)
    if n == 0:
        return None, 0
    sizes = ndimage.sum(mask, lab, range(1, n + 1))
    k = int(np.argmax(sizes)) + 1
    return lab == k, float(sizes.max())


def anchor(cell):
    """Centroid + size of the frame's anchor, or None when undetectable."""
    rgb, a = cell[..., :3], cell[..., 3]
    m, size = largest(pearl_mask(rgb, a))
    if m is None or size < 400:
        return None
    ys, xs = np.nonzero(m)
    return dict(cx=float(xs.mean()), cy=float(ys.mean()), size=float(np.sqrt(size)),
                w=float(xs.max() - xs.min() + 1))


def head_var(cells):
    """Spread of the head width across a sheet, the reading that matches what
    a player actually notices: the face growing and shrinking."""
    ws = [anchor(c) for c in cells]
    if any(w is None for w in ws):
        return None
    w = np.array([x["w"] for x in ws])
    return float((w.max() - w.min()) / w.mean())


def silhouette(cell):
    a = cell[..., 3]
    m, _ = largest(a >= 40)
    if m is None:
        return None
    ys, xs = np.nonzero(m)
    return dict(x0=int(xs.min()), x1=int(xs.max()), y0=int(ys.min()), y1=int(ys.max()))


# ---------------------------------------------------------------------------
# stage A + B: rim + debris
# ---------------------------------------------------------------------------
def clean_cell(cell):
    """Cut the chroma rim and drop key debris. Returns (cell, stats)."""
    out = cell.astype(np.float64).copy()
    rgb, a = out[..., :3], out[..., 3]
    on = a >= 40
    ge = green_excess(rgb)

    hard = on & (ge >= CHROMA_HARD) & (rgb[..., 0] < CHROMA_R_MAX)
    cut = int(hard.sum())
    softened = 0
    if cut >= CHROMA_MIN_PX:
        near = ndimage.binary_dilation(hard, iterations=CHROMA_NEAR)
        # Kill the definite spill outright.
        a[hard] = 0
        # Ramp the partly-contaminated pixels beside it instead of hard-cutting,
        # so the silhouette keeps an anti-aliased edge rather than a stair.
        soft = near & on & ~hard & (ge >= CHROMA_SOFT)
        if soft.any():
            t = np.clip((ge[soft] - CHROMA_SOFT) / float(CHROMA_HARD - CHROMA_SOFT), 0, 1)
            a[soft] *= (1.0 - 0.85 * t)
            softened = int(soft.sum())
        # Pull the remaining green cast out of everything the key touched.
        band = near & (a > 0) & (ge > 0)
        if band.any():
            g = rgb[..., 1]
            g[band] = np.minimum(g[band], np.maximum(rgb[..., 0][band], rgb[..., 2][band]))

    # Debris: detached specks left behind by the key. Drawn sparkles are also
    # small and detached, so drop only what cannot be art.
    solid = a >= 40
    lab, n = ndimage.label(solid)
    dropped = 0
    if n > 1:
        sizes = ndimage.sum(solid, lab, range(1, n + 1))
        main = int(np.argmax(sizes)) + 1
        for i, s in enumerate(sizes, start=1):
            if i == main:
                continue
            m = lab == i
            green = float(np.mean(green_excess(rgb)[m]))
            if s <= DEBRIS_MAX or (s <= DEBRIS_GREEN_MAX and green >= DEBRIS_GREEN):
                a[m] = 0
                dropped += int(s)

    out[..., 3] = np.clip(a, 0, 255)
    return out, dict(cut=cut, soft=softened, debris=dropped)


def raggedness(cell):
    """How aliased + speckled this frame's silhouette edge is."""
    a = cell[..., 3]
    on = a >= 40
    area = int(on.sum())
    if area < 100:
        return None
    nb = ndimage.uniform_filter(on.astype(float), 3)
    speck = int((on & (nb < 0.45)).sum())
    soft = 100.0 * float(((a > 8) & (a < 248)).sum()) / area
    return dict(speck=speck, soft=soft)


def deragged(cell):
    """Median the stray pixels out of a hard-keyed edge and feather the alpha
    back, so the outline reads at the same weight as the rest of the sheet."""
    out = cell.copy()
    a = out[..., 3]
    on = a >= 40

    # Knock the single-pixel spurs and pinholes off the silhouette first, so
    # the median has a sane edge to work along.
    solid = ndimage.binary_closing(ndimage.binary_opening(on, iterations=1), iterations=1)
    band = solid & ~ndimage.binary_erosion(solid, iterations=RAGGED_BAND)

    # Clustered flecks sit in the outline. Replace only band pixels that
    # deviate hard from their own local median: conditional so the outline and
    # any genuine detail survive, and judged against the neighbourhood rather
    # than a fixed hue so the wizard's purple and the ninja's blue-black are
    # not mistaken for damage.
    med = np.dstack([ndimage.median_filter(out[..., ch], size=5) for ch in range(3)])
    dev = np.sqrt(((out[..., :3] - med) ** 2).sum(axis=2))
    fleck = band & (dev > SPECK_DELTA)
    for ch in range(3):
        out[..., ch] = np.where(fleck, med[..., ch], out[..., ch])

    # Feather: these frames were thresholded, so they have no anti-aliasing at
    # all. Blur the alpha and keep it only where it softens the staircase.
    af = ndimage.gaussian_filter(np.where(solid, 255.0, 0.0), RAGGED_FEATHER)
    out[..., 3] = np.clip(np.where(band | ~solid, np.minimum(af, np.maximum(a, af)), a), 0, 255)
    return out


# ---------------------------------------------------------------------------
# stage C: registration
# ---------------------------------------------------------------------------
def transform(cell, scale, dx, dy):
    """Scale about the origin then translate, in premultiplied alpha so the
    transparent black background cannot bleed a dark halo into the edges."""
    a = cell[..., 3:4] / 255.0
    pm = np.concatenate([cell[..., :3] * a, cell[..., 3:4]], axis=2)
    im = Image.fromarray(np.clip(pm, 0, 255).astype(np.uint8), "RGBA")
    inv = 1.0 / scale
    im = im.transform((CELL_W, CELL_H), Image.AFFINE,
                      (inv, 0, -dx * inv, 0, inv, -dy * inv), resample=Image.BICUBIC)
    arr = np.asarray(im).astype(np.float64)
    al = arr[..., 3:4] / 255.0
    rgb = np.divide(arr[..., :3], al, out=np.zeros_like(arr[..., :3]), where=al > 0.004)
    return np.concatenate([np.clip(rgb, 0, 255), arr[..., 3:4]], axis=2)


def plan_sheet(cells, target_scale=1.0):
    """Work out the per-frame similarity transform that removes drift."""
    anc = [anchor(c) for c in cells]
    sil = [silhouette(c) for c in cells]
    if any(x is None for x in anc) or any(x is None for x in sil):
        return None, "anchor not detectable on every frame"

    cxs = np.array([x["cx"] for x in anc])
    cys = np.array([x["cy"] for x in anc])
    widths = np.array([x["w"] for x in anc])

    # Reliability. The head mask is a covered sliver on the ninja and is broken
    # up by the hood on the cat, where its area reading swings wildly while the
    # silhouette is provably rock steady. Width is the trustworthy reading of
    # the two, and a width that swings this hard means the mask is wrong.
    var = float((widths.max() - widths.min()) / widths.mean())
    if var > ANCHOR_MAX_VAR:
        return None, "anchor unstable (%.0f%% head width)" % (100 * var)

    # Corroboration. Trigger only on where the feet sit, which is the one
    # reading no appendage can fake: the bbox centre slides when the ninja
    # swings his sword arm, and the head mask breaks up under the cat's hood,
    # so either alone would "correct" a sheet that is provably steady and give
    # it a wobble it never had. Head width still drives the scale correction
    # once a sheet has qualified, but it cannot qualify one on its own.
    bottoms = np.array([s["y1"] for s in sil])
    centres = np.array([(s["x0"] + s["x1"]) / 2.0 for s in sil])
    foot_span = float(bottoms.max() - bottoms.min())
    centre_span = float(centres.max() - centres.min())
    need_ratio = abs(target_scale - 1.0) >= RATIO_FIX_MIN

    # Both conditions must hold. The head drift is what actually gets corrected,
    # so testing it is what lets the tool converge: trigger on the feet alone and
    # a sheet whose drawn feet differ frame to frame (the base's do) would
    # re-register and be resampled on every single run, never settling. The feet
    # still have to agree, because a colour mask alone misfires on the cat and
    # the ninja and would invent motion on a sheet that is provably steady.
    head_drift = max(cxs.max() - cxs.min(), cys.max() - cys.min())
    if (head_drift < DRIFT_PX or foot_span < DRIFT_PX) and not need_ratio:
        return None, "already stable (head moves %.0fpx, feet %.0fpx, head %.1f%%)" % (
            head_drift, foot_span, 100 * var)

    ref_size = float(np.median(widths))
    ref_cx, ref_cy = float(np.median(cxs)), float(np.median(cys))

    # A frame may not grow past the cell; the angel's wings already fill it.
    headroom = 99.0
    for s, a_ in zip(sil, anc):
        want = (ref_size / a_["w"]) * target_scale
        w = (s["x1"] - s["x0"] + 1) * want
        h = (s["y1"] - s["y0"] + 1) * want
        headroom = min(headroom, (CELL_W - 2 * EDGE_MARGIN) / max(1.0, w) * want,
                       (CELL_H - 2 * EDGE_MARGIN) / max(1.0, h) * want)
    fit = min(target_scale, headroom / 1.0) if headroom < target_scale else target_scale

    plan, flat = [], []
    for a_ in anc:
        s = (ref_size / a_["w"]) * fit
        s = float(np.clip(s, 1 - SCALE_CLAMP, 1 + SCALE_CLAMP))
        # place the anchor centroid at the reference spot, scaled about origin
        plan.append((s, ref_cx * fit - a_["cx"] * s, ref_cy * fit - a_["cy"] * s))
        # the same pinning with the per-frame scale correction dropped, kept as
        # a fallback for when that correction turns out to make things worse
        flat.append((fit, ref_cx * fit - a_["cx"] * fit, ref_cy * fit - a_["cy"] * fit))
    note = "feet %.0fpx, centre %.0fpx, head %.1f%%" % (foot_span, centre_span, 100 * var)
    if abs(fit - 1.0) > 0.001:
        note += ", family scale x%.3f" % fit
    if fit < target_scale - 0.001:
        note += " (capped by cell width)"
    return (plan, flat), note


# ---------------------------------------------------------------------------
def portrait_height(skin):
    p = os.path.join(ART, SKIN_ART.get(skin, ""))
    if not os.path.exists(p):
        return None
    a = np.asarray(Image.open(p).convert("RGBA"))
    ys, _ = np.nonzero(a[..., 3] >= 40)
    return int(ys.max() - ys.min() + 1) if ys.size else None


def process_sheet(path, apply, outdir):
    skin = os.path.basename(os.path.dirname(path))
    state = os.path.splitext(os.path.basename(path))[0]
    im = Image.open(path).convert("RGBA")
    n = im.size[0] // CELL_W
    arr = np.asarray(im).astype(np.float64)
    cells = [arr[:, i * CELL_W:(i + 1) * CELL_W].copy() for i in range(n)]

    stats = dict(cut=0, soft=0, debris=0)
    cleaned = []
    ragged = []
    for i, c in enumerate(cells):
        c2, st = clean_cell(c)
        for k in stats:
            stats[k] += st[k]
        r = raggedness(c2)
        if r and r["soft"] < RAGGED_SOFT and r["speck"] > RAGGED_SPECK:
            ragged.append(i)
        cleaned.append(c2)

    # Damaged frames come out of the strip entirely. Smoothing them only thins
    # the crust, so the honest repair is to keep the frames that are genuinely
    # clean rather than to invent pixels for the ones that are not.
    kept = list(range(len(cleaned)))
    if ragged and len(cleaned) - len(ragged) >= MIN_FRAMES:
        drop = set(ragged)
        kept = [i for i in kept if i not in drop]
        cleaned = [cleaned[i] for i in kept]
    elif ragged:
        cleaned = [deragged(c) if i in set(ragged) else c for i, c in enumerate(cleaned)]
        ragged = []   # salvaged in place, frame count unchanged

    # family ratio: only idle sheets define the character's on-screen size
    target = 1.0
    ratio_note = ""
    if state == "idle":
        ph = portrait_height(skin)
        sil = [silhouette(c) for c in cleaned]
        if ph and all(s is not None for s in sil):
            cur = float(np.median([s["y1"] - s["y0"] + 1 for s in sil]))
            want = FAMILY_RATIO * ph
            if abs(want / cur - 1.0) > RATIO_FIX_MIN:
                target = want / cur
                ratio_note = " ratio %.2f->%.2f" % (cur / ph, FAMILY_RATIO)

    plan, why = plan_sheet(cleaned, target)
    if plan:
        full, flat = plan
        out = [transform(c, s, dx, dy) for c, (s, dx, dy) in zip(cleaned, full)]
        base_out = [transform(c, s, dx, dy) for c, (s, dx, dy) in zip(cleaned, flat)]
        # Verify the scale correction actually helped before keeping it, because
        # on a heavily costumed skin the head mask is half hidden behind wings
        # and hands and correcting by a noisy estimate amplifies the very wobble
        # it is meant to remove.
        #
        # Both sides must be measured AFTER resampling. The mask is a hard
        # colour threshold, so a subpixel shift alone moves the reading by 10
        # points (measured) even though the picture is unchanged; comparing a
        # resampled result against the untouched original would therefore
        # reject every correction on principle.
        b, a2 = head_var(base_out), head_var(out)
        if b is not None and a2 is not None and a2 > b:
            out = base_out
            why += ", scale pass rejected (head %.0f%% vs %.0f%% pinned-only)" % (
                100 * a2, 100 * b)
        elif b is not None and a2 is not None:
            why += ", scale pass kept (head %.0f%% vs %.0f%% pinned-only)" % (
                100 * a2, 100 * b)
        cleaned = out

    rag = ("  DROPPED f" + ",".join(str(i) for i in ragged) +
           f" ({n}->{len(cleaned)}f)") if ragged else ""
    print(f"  {skin}/{state}.png  {n:>2}f  rim {stats['cut']:>5}px  soft {stats['soft']:>5}px"
          f"  debris {stats['debris']:>4}px{rag}  | "
          f"{'REGISTERED: ' if plan else 'skip: '}{why}{ratio_note}")

    if not apply:
        return len(cleaned) if ragged else None
    # Nothing to do means nothing to write. Re-encoding a PNG changes its bytes
    # even when every pixel is identical, which would churn every untouched
    # sheet in the repo and hide the real change in the diff.
    if not (stats["cut"] or stats["debris"] or ragged or plan):
        return None
    out = np.concatenate(cleaned, axis=1)
    dst = path if not outdir else os.path.join(outdir, skin, state + ".png")
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA").save(dst, optimize=True)
    return len(cleaned) if ragged else None


def process_portrait(path, apply):
    im = Image.open(path).convert("RGBA")
    arr = np.asarray(im).astype(np.float64)
    rgb, a = arr[..., :3], arr[..., 3]
    ge = green_excess(rgb)
    hard = (a >= 40) & (ge >= CHROMA_HARD) & (rgb[..., 0] < CHROMA_R_MAX)
    if hard.sum() < CHROMA_MIN_PX:
        return
    cleaned, st = clean_cell(arr)
    print(f"  {os.path.basename(path):<24} rim {st['cut']:>5}px  soft {st['soft']:>5}px"
          f"  debris {st['debris']:>4}px")
    if apply:
        Image.fromarray(np.clip(cleaned, 0, 255).astype(np.uint8), "RGBA").save(path, optimize=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--out", default="")
    ap.add_argument("--only", default="")
    args = ap.parse_args()

    manifest = os.path.join(SPRITES, "sprites.json")
    man = json.load(open(manifest))
    seen = {}
    print("sheets:")
    for skin, states in sorted(man.get("skins", {}).items()):
        if args.only and args.only != skin:
            continue
        for st in states.values():
            rel = st.get("sheet")
            if not rel or rel in seen:
                continue
            seen[rel] = process_sheet(os.path.join(SPRITES, rel), args.apply, args.out)

    # A repacked strip is shorter, so every state pointing at it needs its
    # frame count corrected or the engine scrolls past the end of the sheet.
    # Several states share one sheet (base idle and mixing both use idle.png).
    changed = {rel: nf for rel, nf in seen.items() if nf}
    if changed:
        for skin, states in man.get("skins", {}).items():
            for name, st in states.items():
                nf = changed.get(st.get("sheet"))
                if nf and st.get("frames") != nf:
                    print(f"  sprites.json: {skin}/{name} frames {st['frames']} -> {nf}")
                    st["frames"] = nf
        if args.apply and not args.out:
            with open(manifest, "w") as fh:
                json.dump(man, fh, indent=2)
                fh.write("\n")

    if not args.only:
        print("portraits:")
        for f in sorted(SKIN_ART.values()):
            p = os.path.join(ART, f)
            if os.path.exists(p):
                process_portrait(p, args.apply and not args.out)
    if not args.apply:
        print("\n(report only; pass --apply to write)")


if __name__ == "__main__":
    sys.exit(main())
