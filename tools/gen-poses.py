#!/usr/bin/env python3
# Generate a skin's four pose portraits, end to end.
#
#   python3 tools/gen-poses.py <skin> [<skin> ...]      # named skins
#   python3 tools/gen-poses.py --all                    # every skin below
#
# One render per skin (a 2x2 grid), because four poses drawn together share a
# palette, a scale and a line weight, and four poses drawn separately do not.
# That was the whole reason the first attempt at per-skin poses was abandoned
# unused in assets/poses/ — see the SKIN_POSES comment in app.js.
#
# Pipeline per skin: pick backdrop → generate → key → slice → validate.
# Nothing is installed automatically; cells land in build/poses/ for review.
#
# Prompt rules learned from the wizard pilot, all of which cost money to find:
#   - ONE reference image. Adding a second (an expression reference) fixed the
#     face but loosened geometry: height drifted 17px and centre 39px across
#     the four cells. Describe expressions in words instead.
#   - Name every held object explicitly. The first wizard sheet quietly dropped
#     his magic wand, and the colour checks passed it because the wand's gold is
#     the same gold as his hat band.
#   - Never prescribe eye colour globally. The devil's eyes are red; an
#     instruction to keep them "dark" would break him.
import json
import os
import subprocess
import sys
import time
import urllib.request


REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REFS = "/Users/melchiorgoldfarb/generations/refs/mr-tapioca-skins"
GENS = "/Users/melchiorgoldfarb/generations"
BUILD = os.path.join(REPO, "build", "poses")
MODEL = "gemini-3.1-flash-image-preview"
PY = sys.executable

# skin key → (reference file stem, what the reference actually shows).
# The descriptions exist ONLY to stop props being dropped. Identity comes from
# the reference image; never describe the character itself in words.
SKINS = {
    "base":       ("base",            "no hat, no costume and no held object at all. Just the plain character."),
    "grad-cap":   ("graduation-cap",  "a black graduation mortarboard cap with a gold tassel hanging from it."),
    "flower":     ("flower-crown",    "a flower crown of small pink, peach, yellow and purple flowers with green leaves."),
    "scarf":      ("scarf",           "a chunky knitted salmon-pink scarf wrapped around him, with a fringed end hanging down."),
    "shades":     ("sunglasses",      "thick OPAQUE BLACK SUNGLASSES with solid dark lenses. The sunglasses stay ON and stay solid black in every pose INCLUDING while he is asleep. Never draw clear lenses, thin wire frames or reading glasses."),
    "strawberry": ("strawberry",      "a full red strawberry costume hood with pale yellow seed dots and a green leafy stem on top, his face showing through the opening."),
    "astro-blue": ("astronaut-blue",  "a white astronaut suit with a clear round helmet over his head, a chest control panel with small coloured buttons, and an air hose."),
    "dragon":     ("dragon",          "a pink dragon onesie hood with cream horns, cream belly scales, small pink bat wings and a tail."),
    "cat-hoodie": ("cat-hoodie",      "a cream cat hoodie with rounded cat ears and a small paw print on the chest."),
    "royal":      ("royal-crown",     "a small gold crown on his head and a red cape with white fur trim."),
    "ninja":      ("ninja",           "a black ninja outfit with a black headband whose tails trail behind, a red sash belt, a katana sword on his back, and he HOLDS A SILVER SHURIKEN throwing star in one hand."),
    "angel":      ("angel",           "large white and gold feathered wings, a jewelled gold crown, white and gold robes, and he HOLDS A TALL GOLD SCEPTRE with a glowing orb at its top in one hand. Above his crown floats A SINGLE THIN DELICATE GOLDEN RING HALO with a few small sparkles — a simple clean thin ring, never a thick, layered or cluttered gold ornament."),
    "devil":      ("devil",           "a dark purple and black cape with a high collar, red horns, a black spiked crown, a red gem brooch, and a red pointed devil tail."),
    "wizard":     ("wizard",          "a purple star-patterned wizard hat, a purple star-patterned cloak with a gold star clasp, and he HOLDS A GOLD STAR-TIPPED MAGIC WAND with small sparkles in one hand."),
}

KEY_COLOURS = {"green": (0, 255, 0), "cyan": (0, 255, 255),
               "magenta": (255, 0, 255), "blue": (0, 0, 255)}


def pick_backdrop(ref_path):
    """Furthest candidate from anything the character actually uses, so the
    strawberry's leaf is never keyed on green and the astronaut never on blue."""
    import numpy as np
    from PIL import Image
    im = np.array(Image.open(ref_path).convert("RGBA")).astype(np.int16)
    opaque = im[im[:, :, 3] > 200][:, :3]
    pal = np.unique(opaque // 24 * 24, axis=0)
    best = max(KEY_COLOURS.items(),
               key=lambda kv: float(np.min(np.linalg.norm(pal - np.array(kv[1]), axis=1))))
    margin = float(np.min(np.linalg.norm(pal - np.array(best[1]), axis=1)))
    return best[0], best[1], margin


def build_prompt(skin, accessories, colour_name, rgb):
    held = ("\n\nCRITICAL: reproduce EVERY accessory and held object from the reference "
            f"image in ALL FOUR cells. This character has {accessories} All of it must be "
            "present and clearly visible in all four poses, in the same hand and on the "
            "same side each time. Do not drop, replace or redesign any of it."
            ) if skin != "base" else (
            "\n\nThis character wears nothing and holds nothing. Do not add a hat, "
            "clothing, props or accessories of any kind.")
    return f"""Using the character in the reference image, draw a 2x2 grid of exactly 4 poses of that SAME character. Square 1:1 image.

The character must be IDENTICAL in all four cells: same body shape, same size, same colours, same outline weight, same face style.{held}

EYES: in every cell his eyes keep the reference character's exact eye design — the same shape, the same colour and the same small white highlight dots as the reference. NEVER replace them with white eyeballs and small dark pupils. NEVER draw a wide white sclera.

Top-left: standing calmly, facing forward, eyes open, small friendly smile, arms relaxed.
Top-right: stirring, leaning slightly to his right, his free arm raised and bent as if stirring. No cup, no drink, no spoon.
Bottom-left: fast asleep, eyes closed in soft downward curves, body settled and calm.
Bottom-right: mildly startled. His normal eyes opened just a little wider, still their own colour and highlights. Small worried angled eyebrows above them. A small open worried mouth. He is gently surprised, NOT shocked, NOT scared, NOT alarmed. Free arm raised slightly.

Rules for every cell:
- Exactly the same camera distance and the same character size in all four cells. He must not get bigger or smaller between cells.
- Centred identically in every cell, feet resting on the same horizontal line.
- Flat kawaii illustration, clean dark outlines, flat colours.
- No cup, no furniture, no shadow, no text, no labels, no motion arrows, no grid lines, no borders.
- Background: solid pure {colour_name} RGB({rgb[0]},{rgb[1]},{rgb[2]}), completely flat, edge to edge."""


def generate(prompt, ref_path, out_path, api_key):
    import base64
    body = {"contents": [{"parts": [
        {"text": prompt},
        {"inline_data": {"mime_type": "image/png",
                         "data": base64.b64encode(open(ref_path, "rb").read()).decode()}}]}]}
    req = urllib.request.Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent",
        data=json.dumps(body).encode(),
        headers={"x-goog-api-key": api_key, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=180) as r:
        reply = json.load(r)
    if "error" in reply:
        raise RuntimeError(reply["error"].get("message", "unknown")[:200])
    for part in reply["candidates"][0]["content"]["parts"]:
        if "inlineData" in part:
            open(out_path, "wb").write(base64.b64decode(part["inlineData"]["data"]))
            return
    raise RuntimeError("reply carried no image")


def run(skin, api_key, stamp):
    stem, accessories = SKINS[skin]
    ref = os.path.join(REFS, f"{stem}.png")
    name, rgb, margin = pick_backdrop(ref)
    prompt = build_prompt(skin, accessories, name, rgb)

    raw = os.path.join(GENS, f"tapioca_{skin}-poses-2x2_{stamp}.png")
    print(f"\n=== {skin} ===  backdrop {name} (margin {margin:.0f})")
    generate(prompt, ref, raw, api_key)

    json.dump({"model": MODEL, "provider": "google", "prompt": prompt,
               "refs": [f"refs/mr-tapioca-skins/{stem}.png"],
               "params": {"grid": "2x2", "backdrop": f"{name} RGB{rgb}"},
               "cost_usd": 0.034, "created": stamp, "note": f"{skin} pose set"},
              open(raw.replace(".png", ".json"), "w"), indent=2)

    os.makedirs(BUILD, exist_ok=True)
    keyed = os.path.join(BUILD, f"{skin}-keyed.png")
    subprocess.run([PY, os.path.join(REPO, "tools", "key-sheet.py"), raw, keyed,
                    f"--despill-ref={ref}"], check=True, capture_output=True)
    subprocess.run([PY, os.path.join(REPO, "tools", "slice-sheet.py"), keyed,
                    os.path.join(BUILD, skin), "2", "2",
                    "--uniform", "--size=500", f"--match={ref}"],
                   check=True, capture_output=True)
    cells = [os.path.join(BUILD, f"{skin}-cell{i}.png") for i in range(4)]
    res = subprocess.run([PY, os.path.join(REPO, "tools", "check-poses.py"), ref] + cells,
                         capture_output=True, text=True)
    print(res.stdout.strip())
    return res.returncode == 0


if __name__ == "__main__":
    args = sys.argv[1:]
    targets = list(SKINS) if "--all" in args else [a for a in args if a in SKINS]
    if not targets:
        print("usage: gen-poses.py <skin> [...] | --all\nskins: " + ", ".join(SKINS))
        sys.exit(1)

    api_key = None
    for line in open("/Users/melchiorgoldfarb/.env"):
        if line.startswith("GOOGLE_KEY="):
            api_key = line.split("=", 1)[1].strip()
    if not api_key or api_key == "your_key_here":
        print("GOOGLE_KEY missing from ~/.env")
        sys.exit(2)

    stamp = str(int(time.time()))
    results = {}
    for i, skin in enumerate(targets):
        try:
            results[skin] = run(skin, api_key, f"{stamp}-{i}")
        except Exception as exc:
            print(f"  {skin}: ERROR {exc}")
            results[skin] = False
        time.sleep(3)          # one at a time; the free tier rate-limits hard

    print("\n" + "=" * 52)
    ok = [s for s, v in results.items() if v]
    bad = [s for s, v in results.items() if not v]
    print(f"passed {len(ok)}/{len(results)}: {', '.join(ok) if ok else '-'}")
    if bad:
        print(f"NEEDS ATTENTION: {', '.join(bad)}")
    print(f"cells in {BUILD} — nothing installed yet")
