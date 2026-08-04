#!/usr/bin/env python3
# Gate a generated pose set before it is allowed near the app.
#
#   python3 tools/check-poses.py <canonical.png> <pose1.png> <pose2.png> ...
#
# Exits non-zero if anything fails. It fails loudly on purpose: the two defects
# it exists to catch both shipped once already because nothing was watching.
#
#   - OFF-MODEL ART. assets/poses/ holds 36 per-skin poses that are unused
#     because they came back wrong ("the astronaut's helmet is totally
#     different", app.js). Nobody noticed until the art was already made, so
#     SKIN_POSES was left empty instead. PALETTE catches that automatically.
#   - MISALIGNED CELLS. The shipped base poses sit at bottom=428 / 437 / 402,
#     so the character pops whenever the app changes state. ALIGN catches that.
#
# Thresholds are calibrated in docs/superpowers/specs/ — see the design doc.
import sys
import numpy as np
from PIL import Image

# Alignment is judged on the BOTTOM EDGE. That one is real: the poses are
# composited on a floor, so a baseline that wanders makes him hop between states.
#
# Height is only a loose sanity check, and the tolerance is deliberately wide.
# Both stricter ideas failed against real art. Width went first: arms raised to
# stir or thrown up in surprise widened the silhouette 56px with nothing wrong.
# Height went the same way on the 13-skin batch — it failed dragon, cat-hoodie,
# ninja and royal, all four of which are correct, because sleeping curls him up
# and mixing raises an arm. Observed spread on sets that look right runs to 23px
# (cat-hoodie), so this now only catches gross scale errors. The checks that
# actually earn their keep are OFF-MODEL and ACCESSORY below; on that same batch
# they ranked the two genuinely bad skins first and second.
BOTTOM_TOL = 4      # px, across cells — stops him jumping vertically
HEIGHT_TOL = 30     # px, across cells — gross scale errors only, see above
SCALE_TOL = 0.10    # fraction, height vs the canonical portrait
KEY_HUES = [(0, 255, 0), (0, 255, 255), (255, 0, 255), (0, 0, 255)]
KEY_DIST = 70       # residual backdrop colour this close to a key hue = spill

# Identity thresholds, calibrated against art already in this repo rather than
# guessed. Measured on the abandoned assets/poses/ set (known bad) and on base's
# own shipped poses (known good):
#
#   NOVEL — share of the pose's pixels using colours the canonical doesn't have.
#     astro-blue-happy 0.465 (the wrong helmet) · wizard-vs-angel 0.463
#     vs. Sleeping.png 0.038 · Startled.png 0.043 · canonical-vs-itself 0.03
#     Mixing.png sits at 0.344 ONLY because it draws its own boba cup. Generated
#     poses must not include a cup — the app draws it separately in .cup-stage —
#     so the real ceiling for good art is ~0.05.
#
#   ACCESSORY — how much of the skin's identifying colour (what it has and the
#     base character doesn't: hat, halo, helmet) survives into the pose.
#     wizard-happy 0.485 · wizard-sleepy 0.421 · wizard-vs-angel 0.233
#     vs. every known-good pose 1.000
#
# Known limit: colour cannot separate two dark characters. ninja-vs-devil scores
# 0.103 / 1.000 and passes. This is a gate against grossly off-model output, not
# an identity classifier — the pilot review in the design doc is the backstop.
NOVEL_MAX = 0.40
ACCESSORY_MIN = 0.70


def load(path):
    return np.array(Image.open(path).convert("RGBA"))


def bbox(im, thresh=128):
    """Solid content only — see the note in tools/slice-sheet.py: a soft contact
    shadow tapers to alpha ~17 and would otherwise be measured as the baseline."""
    ys, xs = np.where(im[:, :, 3] > thresh)
    if len(xs) == 0:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())


def palette_hist(im):
    """Alpha-weighted, quantised colour histogram of the opaque character."""
    opaque = im[im[:, :, 3] > 200][:, :3]
    if len(opaque) == 0:
        return None
    q = (opaque // 32).astype(np.int32)
    idx = q[:, 0] * 64 + q[:, 1] * 8 + q[:, 2]
    h = np.bincount(idx, minlength=512).astype(np.float64)
    return h / h.sum()


def identity(pose_h, canon_h, base_h):
    """How far the pose has drifted from the character it claims to be.

    Plain histogram intersection can't do this: it scores a legitimate pose
    change (0.61 for base's own Mixing.png) below a wrong character
    (0.58 for ninja vs devil). These two split them properly."""
    novel = float(pose_h[canon_h < 0.002].sum())
    accessory = (canon_h > 0.004) & (base_h < 0.002)
    if accessory.sum() == 0:            # the base character has no accessory
        return novel, 1.0
    kept = pose_h[accessory].sum() / max(canon_h[accessory].sum(), 1e-9)
    return novel, float(min(kept, 1.0))


def key_spill(im):
    """Semi-transparent edge pixels still carrying a backdrop colour."""
    a = im[:, :, 3]
    edge = (a > 16) & (a < 240)
    if edge.sum() == 0:
        return 0
    px = im[:, :, :3][edge].astype(np.float32)
    worst = 0
    for k in KEY_HUES:
        worst = max(worst, int((np.linalg.norm(px - np.array(k), axis=1) < KEY_DIST).sum()))
    return worst


def main():
    if len(sys.argv) < 3:
        print("usage: check-poses.py <canonical.png> <pose.png> [pose.png ...]")
        return 2

    canon_path, pose_paths = sys.argv[1], sys.argv[2:]
    canon = load(canon_path)
    canon_box = bbox(canon)
    canon_hist = palette_hist(canon)
    canon_w = canon_box[2] - canon_box[0]
    canon_h = canon_box[3] - canon_box[1]

    # The base character defines what counts as "accessory" for every skin.
    base_ref = "/Users/melchiorgoldfarb/generations/refs/mr-tapioca-skins/base.png"
    try:
        base_hist = palette_hist(load(base_ref))
    except OSError:
        print(f"note: base reference missing ({base_ref}); accessory check disabled")
        base_hist = np.ones(512)

    failures, metrics = [], []

    for p in pose_paths:
        im = load(p)

        if im.shape[2] != 4 or im[:, :, 3].max() == 0:
            failures.append(f"{p}: ALPHA — no usable alpha channel")
            continue
        corners = [im[0, 0, 3], im[0, -1, 3], im[-1, 0, 3], im[-1, -1, 3]]
        if max(corners) > 16:
            failures.append(f"{p}: ALPHA — corners are opaque (background not keyed)")

        b = bbox(im)
        if b is None:
            failures.append(f"{p}: EMPTY — no opaque pixels")
            continue

        w = b[2] - b[0]
        ht = b[3] - b[1]
        scale_delta = abs(ht - canon_h) / canon_h
        if scale_delta > SCALE_TOL:
            failures.append(f"{p}: SCALE — {ht}px tall vs canonical {canon_h}px "
                            f"({scale_delta*100:.0f}% off, limit {SCALE_TOL*100:.0f}%); "
                            f"slice with --match to normalise")

        h = palette_hist(im)
        novel, accessory = identity(h, canon_hist, base_hist)
        if novel > NOVEL_MAX:
            failures.append(f"{p}: OFF-MODEL — {novel:.2f} of the art uses colours the "
                            f"canonical doesn't have (max {NOVEL_MAX}); wrong character, "
                            f"or it drew a cup it shouldn't have")
        if accessory < ACCESSORY_MIN:
            failures.append(f"{p}: ACCESSORY — only {accessory:.2f} of the skin's "
                            f"identifying colour survived (min {ACCESSORY_MIN}); "
                            f"the hat/halo/helmet came back wrong")

        spill = key_spill(im)
        if spill > 50:
            failures.append(f"{p}: SPILL — {spill} edge px still carry backdrop colour")

        metrics.append((p, b, w, novel, accessory, spill))

    # Cross-cell alignment: these must agree with EACH OTHER, not the canonical.
    if len(metrics) > 1:
        bottoms = [m[1][3] for m in metrics]
        heights = [m[1][3] - m[1][1] for m in metrics]
        if max(bottoms) - min(bottoms) > BOTTOM_TOL:
            failures.append(f"ALIGN — bottom edge varies {max(bottoms)-min(bottoms)}px "
                            f"across cells (limit {BOTTOM_TOL}); he will jump on state change")
        if max(heights) - min(heights) > HEIGHT_TOL:
            failures.append(f"ALIGN — height varies {max(heights)-min(heights)}px "
                            f"across cells (limit {HEIGHT_TOL}); he changes size on state change")

    print(f"canonical: {canon_path}  width={canon_w}px")
    print(f"  {'file':28} {'w':>4} {'bottom':>7} {'cx':>4} {'novel':>7} {'access':>7} {'spill':>6}")
    for p, b, w, novel, accessory, spill in metrics:
        print(f"  {p.split('/')[-1]:28} {w:4d} {b[3]:7d} {(b[0]+b[2])//2:4d} "
              f"{novel:7.3f} {accessory:7.3f} {spill:6d}")

    if failures:
        print(f"\nFAILED ({len(failures)}):")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("\nPASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
