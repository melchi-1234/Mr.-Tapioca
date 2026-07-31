# Mr. Tapioca — Sprite Sheet Guide 🧋

This is the **one page** your sprite pipeline needs. Drop a PNG strip into `assets/sprites/…`, add one line to `sprites.json`, reload the app, and Mr. Tapioca animates with real frames.

**If you do nothing, or make a mistake, nothing breaks** — the app just keeps using the current single-picture art. Sprites are purely an upgrade layered on top.

---

## 1. The 6 golden rules (get these exactly right)

1. **Transparent background.** No white box, no halo. (AI tools output a solid background — key it out to true transparency first.)
2. **One horizontal strip.** All frames in a single row, left → right. One PNG per animation.
3. **Every frame is exactly `410 × 460` px, edge-to-edge, NO gaps.** The whole strip is `(frames × 410) × 460`. A single stray pixel of gutter makes every frame jitter.
4. **Feet on the bottom edge, centered the same way in every frame.** The character must not drift or change size between frames (except on purpose, like a breathing squash). Drift reads as shaking.
5. **Frame 1 = the calm resting pose.** It's shown as the still poster the instant the animation loads, and it's the frame shown when a user has "reduce motion" on.
6. **Loop cleanly.** The last frame should lead naturally back into frame 1. For "back-and-forth" motions (breathing, stirring) draw the *full* forward-and-return cycle in the strip so a plain loop looks natural.

---

## 2. Frame size — why `410 × 460`

That's **2× the on-screen size** (the character shows at ~205 × 230), so it stays crisp on retina phones. It is illustrated art, not pixel art — normal smooth scaling.

```
┌──────────── 410 px ────────────┐
│        ~7% safe margin         │   ← leave a little room top/sides so a
│                                │      squash/stretch never clips
│           (character)          │  460 px
│                                │
│════════ feet on this line ═════│   ← bottom edge = the floor. Same in every frame.
└────────────────────────────────┘
```

A strip of 6 frames is therefore `2460 × 460`. Keep each strip under ~1.5 MB and ≤ 12 frames (mobile-GPU safe).

---

## 3. The states + how many frames

Make these as you like — you don't need all of them. Recommended frames @ fps:

| State      | Frames | fps | Loops?         | When it shows |
|------------|--------|-----|----------------|---------------|
| `idle`     | 6      | 8   | yes            | standing at the counter |
| `walking`  | 6      | 12  | yes            | walking to the cup / wandering on break |
| `mixing`   | 8      | 10  | yes            | making the drink during focus |
| `sleeping` | 4      | 3   | yes            | napping in bed on break |
| `shocked`  | 4      | 12  | **no** (holds last) | reactions |

`drinking` exists but is currently unused — skip it.

---

## 4. Where the files go

```
assets/sprites/<skin>/<state>.png      ← lowercase, no spaces
```

Examples: `assets/sprites/base/walking.png`, `assets/sprites/wizard/mixing.png`.

**`base`** is the default character (no skin equipped). Each skin animates **only with its own sheets** — a skin never borrows another character's frames (that would make it look off-model). If a skin has no sheet for a state, that state just uses the skin's normal still picture. So you can do `base` first and it looks great with no skin equipped; add per-skin sheets whenever you want those skins to animate too.

The skin keys (use these exact names):

```
base   grad-cap   flower   scarf   shades   strawberry
astro-blue   dragon   ninja   wizard   angel   devil
```

---

## 5. `sprites.json` — the on/off switch

This file (`assets/sprites/sprites.json`) is the **single source of truth**. A strip that isn't listed here is ignored. Add one block per strip:

```json
{
  "version": 1,
  "frameWidth": 410,
  "frameHeight": 460,
  "defaults": { "fps": 10, "loop": true },
  "skins": {
    "base": {
      "idle":     { "sheet": "base/idle.png",     "frames": 6, "fps": 8 },
      "walking":  { "sheet": "base/walking.png",  "frames": 6, "fps": 12 },
      "mixing":   { "sheet": "base/mixing.png",   "frames": 8, "fps": 10 },
      "sleeping": { "sheet": "base/sleeping.png", "frames": 4, "fps": 3 },
      "shocked":  { "sheet": "base/shocked.png",  "frames": 4, "fps": 12, "loop": false }
    },
    "wizard": {
      "mixing":   { "sheet": "wizard/mixing.png", "frames": 8 }
    }
  }
}
```

- `sheet` is the path **relative to `assets/sprites/`**.
- `frames` is **required** and must match the strip exactly.
- `fps` and `loop` are optional — they inherit from `defaults` if you leave them out.
- If this file is missing or has a typo, the app behaves exactly like it does today.

---

## 6. The 60-second drop checklist

1. Generate the strip (all frames in **one** generation pass so colors/shape stay identical).
2. Key out the background to transparent.
3. Confirm the strip is `(frames × 410) × 460` with **no gaps**.
4. Save it to `assets/sprites/<skin>/<state>.png`.
5. Paste one block into `sprites.json` (and make sure `frames` is right).
6. Reload the app.

**Minimum first drop:** just `base/idle`, `base/walking`, and `base/sleeping` already makes the focus screen and the break nap look great. Everything else can come later.

---

## 7. Telling ChatGPT how to keep frames consistent

The old per-pose art drifted off-model because each pose was a separate generation. To avoid that:

- Generate **all frames of one strip in a single image / single prompt**, side by side.
- Pin the **same scale, same camera, same colors, feet on the same line** for every frame.
- Give it the existing portrait (`assets/Mr. Tapioca.png`) as the reference for the look.

---

## 8. Troubleshooting

| Symptom | Cause |
|---|---|
| Nothing animates | Not listed in `sprites.json`, or the path/`frames` is wrong |
| Character shakes / jumps | Frames aren't all the same size, or feet aren't aligned. Run the cleanup tool (section 10) |
| Green fringe where the outline should be | Chroma key spill on a video-derived sheet. Run the cleanup tool |
| Outline looks crunchy on some frames only | Those frames were hard-keyed with no anti-aliasing. Run the cleanup tool |
| A sliver of the next frame flickers in | There are gaps between frames, or `frames` is too low |
| Looks washed-out / has a box | Background wasn't keyed to transparent |
| Frozen on one frame | The user has "reduce motion" on (this is intentional) |

---

## 9. Offline note

Sprites work online immediately (they're cached on first load). They only need a service-worker tweak if they must work **offline on the very first launch** — if you want that, tell Claude and it'll add the paths to `sw.js` and bump the cache version.

---

## 10. Cleaning a sheet after you make it

`tools/clean-sprites.py` repairs the damage a video-to-sprite pipeline leaves
behind. It measures first and only touches what is actually broken, so it is
safe to re-run: a second run on cleaned sheets does nothing at all.

It needs Pillow, numpy and scipy, which the system python does not have. Once:

```bash
python3 -m venv .venv && .venv/bin/pip install pillow numpy scipy
```

Then:

```bash
.venv/bin/python tools/clean-sprites.py            # report only, writes nothing
.venv/bin/python tools/clean-sprites.py --apply    # do it
```

What it fixes:

- **Green rim.** A chroma key leaves a bright green fringe sitting exactly where
  the black outline should be, and it catches a different amount on every frame,
  so the outline looks like it changes thickness while the loop plays. The art's
  real outline survives underneath, so the tool cuts the contaminated band and
  lets it show rather than painting a fake one. Gated tightly enough that the
  strawberry's green leaf is provably untouchable.
- **Hard-keyed frames.** A frame that came in without anti-aliasing has a ragged
  near-black crust instead of a clean outline. That damage is baked several
  pixels deep, so those frames are **dropped** and `sprites.json` is rewritten to
  match, rather than smoothed into something fake.
- **Drift.** AI video redraws the character every frame, so it wanders. Frames
  are pinned to the sheet's median using the tapioca pearl as the anchor. Only
  sheets that measurably drift are touched, and the tool checks that its own
  correction actually helped before keeping it.

It also nudges each character toward the family size (sheet height ≈ 0.82 × its
portrait height), which is what keeps the skins reading as the same character.
