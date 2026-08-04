# Mr. Tapioca visual overhaul — design

Date: 2026-08-04
Status: approved in brainstorm, pending spec review

## 1. Goal

Make the app feel finished. Four surfaces, in priority order:

1. The mascot, all 14 skins, in every state he can be in.
2. Break mode, which currently reads as a bed floating on a wall.
3. The three games, which have no art direction.
4. The system emoji still standing in for art in onboarding and the map.

Constraint set by the owner: **be right on take one.** Generation costs real money and
re-rolls are the main way that money gets wasted. Every section below is written to
make the first attempt land.

## 2. Root cause

Every defect catalogued in §3 has the same cause, and it is not model quality:

> **Things that appear together were generated separately, then composited by CSS.**

A single generation shares one palette, one light direction, one scale and one
perspective by construction. Two generations share nothing, and CSS cannot invent the
agreement afterwards. This produced, in order: a mascot that wobbles, a pose library
that had to be abandoned, a bed nailed to a wall, and three games with seams through
them.

The design rule that follows, and that every workstream obeys:

> **One render per group of things that share a frame. Uniform crop, never per-cell
> re-centering. The character is passed in as a file, never described in words.**

The repo already half-knows this. [app.js:394](../../../app.js) records that the pose
sets were made as a single 2×2 sheet *"one render, so the 4 poses share the exact same
color."* That part worked. The reference discipline is what failed, and that is the
part the current pipeline fixes.

## 3. What is broken, measured

All measurements taken from the running app at a 375 × 812 viewport, DPR 2.

### 3.0 The stage

| Thing | Value |
|---|---|
| Scene element | 375 × 812, `inset: 0` |
| Controls top edge | y = 425 |
| Floor line (`--floor-y` = 390px) | y = 422 |
| `--floor-rest` | `clamp(408px, 56vh, 470px)` |
| Character (`.maker-wrap`) | 205 × 230 at (88, 146) |
| Bed (`.break-bed`) | 240 × 157 at (68, 253) |
| Backgrounds | 768 × 1344, `top center / cover` |

At this viewport a background scales by `max(375/768, 812/1344)` = **0.604**, renders at
464 × 812, and loses **44px off each side**. This matters in §3.2 and §3.3.

### 3.1 The mascot

- `sprites.json` maps `mixing` to `idle.png` for **all 14 skins**. During a focus
  session, the app's entire reason to exist, he is not mixing. He is standing.
- Only `base` has `walking` and `sleeping`. The other 13 skins have `idle` only.
  `shocked` is called at [app.js:2908](../../../app.js) and no skin has a sheet for it.
- The sheets came from a video-to-sprite pipeline. `tools/clean-sprites.py` exists to
  repair the damage it leaves (green chroma rim, hard-keyed frames, drift) and it fixes
  drift by *dropping frames*, which is why counts are 13, 15, 16 and 14 rather than
  clean loops.
- Measured on `base/idle.png`: 13 frames, body height varies 283–307px (**24px, ~8%**),
  bottom edge varies 13px, eyes closed on 8 of 13 frames in no pattern, head gloss
  redrawn every frame. It runs at 4fps because 8fps would make that unbearable.
- `base/walking.png` has the opposite fault: 0px drift, 0px size change, and legs that
  barely move, so it reads as a still image rather than a walk.

**The sprites also switch off better animation.** Every state has hand-tuned CSS
keyframes (breathing, crouch-and-hop with squash-and-stretch and a landing squash, a
waddle with tilt, a lean toward the cup). `SpriteEngine.apply()` sets `animation`
inline on the same element, and the comment at [app.js:569](../../../app.js) says so
outright: it *"would override (i.e. silently kill) any class-based animation on the img
itself."* Every skin with a sheet traded 60fps squash-and-stretch for a 4fps wobble.

**`SKIN_POSES` is an empty object** at [app.js:403](../../../app.js). 36 per-skin pose
files sit unused in `assets/poses/` because they came back off-model. The comment names
the failure: *"the astronaut's helmet is totally different."*

**The base poses that are wired up do not align with each other:**

| File | bbox width | centre x | bottom y |
|---|---|---|---|
| `Mr. Tapioca.png` | 373 | 250 | 428 |
| `Sleeping.png` | 353 | 262 | 402 |
| `Mixing.png` | 316 | 242 | 437 |

So idle → mixing drops him 9px and narrows him 57px. Idle → sleeping lifts him 26px and
shifts him 12px right. That pop ships today, and naive slicing would bake it into the
new art too. See §8.3.

Payload: `assets/sprites/` is **15MB of a 44MB** asset folder.

### 3.2 Break mode

`.scene.is-on-break` at [styles.css:412](../../../styles.css) sets `background:` to the
break room image **without `var(--floor-grad)`**. Every other theme includes it first.
The `.scene` comment explains exactly why that matters:

> *"Every theme MUST keep a floor under the counter. The themed rules below layer this
> gradient over their art — without it, tall windows crop the art's baked-in floor away
> and the counter looks like it floats mid-air."*

Break mode is the one rule that violates its own warning. Consequences, measured:

- `Shop Background Break.png` bakes its floor at ~82% of image height. After `cover`
  scaling that lands at **screen y ≈ 667**. The app's floor line is at **y = 422**.
  They are **245px apart**, and there is no CSS floor stripe drawn to cover the gap.
- So the bed, correctly anchored to `--floor-y`, sits 245px up the wall, inside the
  window arch. It is not a floating-bed illusion. The bed is genuinely on the wall.
- The character is **205 × 230**; the bed is **240 × 157**. He is 1.46× taller than the
  entire bed including headboard and legs, and 85% as wide as it. His art begins 107px
  above the bed's top edge, so he can only ever sit on top of it.
- The bed is drawn in 3/4 view (receding mattress top, side rail, foot board); he is
  drawn flat front-on. A flat sprite pasted onto a 3/4 object.
- Because the baked floor position depends on viewport, the required floor position in
  the art ranges **44%–52%** across iPhone sizes. No single baked value can be correct.
  This is why `--floor-grad` exists, and why the new art must not bake a hard floor.

### 3.3 The games

- **Plinko.** No art direction at all. Flat dot pegs on an empty tan field, a hard
  horizontal seam where the background image stops, a cropped plant bleeding in from
  the top-left, system-font score slots, no boba identity.
- **Pearl toss.** Better: a wall, a window, a hanging plant, a cup with a contact
  shadow. But the bottom **45%** of the screen is a dead pink void.
- **Catch.** The worst. The background is over-scaled to the point that two clouds are
  cropped at the edges with outlines heavier than the catcher's, ~60% of the screen is
  empty, and two hard double-line seams cross the field looking like render artifacts.
- **Mr. Tapioca does not appear in any of the three.** They feel like separate mini-apps
  rather than things happening in his shop.

All three share the §3.0 cause: art authored at 768 × 1344 and displayed `cover` into a
viewport it was not authored for.

### 3.4 Placeholders

Onboarding steps use 🎮 🏆 🗺️ and the boba map uses a 🧋 pin. System emoji render
differently per OS version and match nothing else in the app.

## 4. Workstream A — mascot poses

**Deliverable:** four on-model poses per skin — `idle`, `mixing`, `sleeping`, `shocked`
— for 14 skins. Those are the exact state names `setMakerState()` passes, so they are
the exact keys `SKIN_POSES[skin]` must use. (`walking` and `drinking` are covered in
§11.)

**Method:** one 2×2 render per skin. Each generated with that skin's own file from
`~/generations/refs/mr-tapioca-skins/` passed in as an image reference. Never a word
description of the character.

**Format:** 500 × 500 RGBA PNGs with transparency, matching the existing portraits and
`SKIN_IMAGES`. Not 410 × 460 sprite cells — sprites are being retired.

**Wiring:** populate `SKIN_POSES` at [app.js:403](../../../app.js), which is already
read by `setMakerState()` and already falls back to the skin's single portrait for any
missing state. Motion continues to come from the CSS keyframes keyed off `data-state`.

**Retirement:** delete `assets/sprites/`, the `SpriteEngine` block
([app.js:425–540](../../../app.js)), and its call in `setMakerState()`. This drops 15MB
and returns every skin to 60fps squash-and-stretch. `assets/SPRITES.md`,
`tools/clean-sprites.py` and the `sprites.json` manifest go with it.

**Cost:** 14 renders.

## 5. Workstream B — break mode

The owner's requirement: *an actual bedroom, not a floating bed; substantial enough to
fill the screen.* Three parts.

### 5.1 Fix the floor (code, free)

Add `var(--floor-grad)` back to `.scene.is-on-break` and give it bedroom floor colours,
the same way `[data-theme="night"]` overrides `--floor-a` / `--floor-b`. This alone puts
a real floor at y = 422 and stops the bed being on a wall.

### 5.2 The room (1 render)

`assets/Bedroom Background.png`, 768 × 1344, drawn as a member of the existing
Shop Background family (same line weight, same palette temperature, same flat kawaii
style).

Hard constraints, derived from §3.0 and §3.2:

- **No baked hard floor line.** The floor must be a soft, ambiguous transition low in
  the frame; the CSS `--floor-grad` draws the real floor. A baked line cannot be right
  across the 44%–52% range.
- **Nothing load-bearing in the outer 44px of each side** — it gets cropped.
- **Nothing load-bearing below 52% of image height** — the CSS floor covers it.
- Content: bedroom, not empty wall. Nightstand, small lamp, rug, a window with a dusk
  sky, soft string lights. It must read as a room he sleeps in even before the bed is
  composited in.

### 5.3 The bed (1 render, two layers)

One generation producing a **1 × 2 sheet**: cell 0 = bed without blanket (headboard,
frame, mattress, pillow), cell 1 = the blanket/duvet alone, in the same position. One
render means the two layers align perfectly with no cutting or masking.

Sliced with the uniform-crop tool from §8.3 into `assets/bed-back.png` and
`assets/bed-front.png`.

Composition, front-on elevation to match how the character is drawn:

| Element | z-index | Target |
|---|---|---|
| Bedroom background | scene bg | — |
| `bed-back` | 4 | width ~340px (≈91% of the 375 stage), bottom on `--floor-y` |
| Character | 9 | scaled ~0.75 in break mode (205 → ~154 wide) |
| `bed-front` (blanket) | 10 | overlaps his lower body |

Result: the bed is 2.2× his width instead of 1.17×, he is tucked under the blanket
instead of resting on it, and the blanket holds still while `maker-sleep` breathes him.
Exact CSS offsets get tuned live against the preview; the ratios above are the target.

Skin-independent, so one bed serves all 14.

**Decision:** one bedroom for all themes in v1. Per-theme bedrooms (10 more renders) are
deliberately deferred.

## 6. Workstream C — games

Common fix first: each game's background must stop being a `cover`-scaled full-bleed
image with baked features. Authored to the play area, or replaced by a drawn board.

- **Plinko (1 render).** A board illustration: frame, felt/wood field, slot troughs at
  the bottom styled as boba cups. **Pegs stay code-drawn** and get restyled as pearls
  with a highlight and soft shadow — baking peg positions into art would desync them
  from the physics. Kill the seam in CSS.
- **Pearl toss (1 render).** Turn the dead lower 45% into the shop counter you are
  throwing across.
- **Catch (1 render).** Re-author the background to the play area so clouds stop being
  cropped at giant scale, and remove the two seam lines.
- **Mr. Tapioca goes into all three**, reusing poses from workstream A at no extra
  generation cost. He watches, reacts on score, and the games start feeling like they
  happen in his shop.

**Cost:** 3 renders.

## 7. Workstream D — placeholders

One render, 2 × 2 grid: onboarding's game / trophy / map icons plus the map's boba pin.
One generation so all four match. Sliced to 4 PNGs, swapped in for the emoji in
`index.html` and the `bobaPin()` helper at [app.js:3907](../../../app.js).

**Cost:** 1 render.

## 8. Generation protocol

### 8.1 Routing

Per the `/generate` skill: read the recipe file before each call, cheapest capable
provider first, never call from memory. These are **still images**, so the quality image
tier ($0.05–0.15) applies, not the video tier ($0.20–0.35 per second). Text-bearing art
(none expected here) would route to GPT Image 2.

### 8.2 Prompt template (workstream A)

```
[reference image: refs/mr-tapioca-skins/<skin>.png]

A 2x2 grid, 4 cells, transparent background, on a single canvas.
The SAME character from the reference image in all 4 cells, identical
proportions, identical colours, identical outline weight, identical accessory.

Cell 1 (top-left):     standing calmly, front-on, eyes open, gentle smile
Cell 2 (top-right):    stirring a drink, leaning slightly to his right
Cell 3 (bottom-left):  asleep, eyes closed, peaceful
Cell 4 (bottom-right): startled, eyes wide, arms up

Every cell: same camera distance, same scale, character centred the same way,
feet on the same horizontal line. Flat kawaii style, clean dark outlines,
no background, no shadow, no text.
```

The reference file is passed through the API's image-to-image / edit route. The
character is never described in words. This is the specific discipline whose absence
produced the wrong helmet and killed `SKIN_POSES`.

### 8.3 Slicing — uniform crop

`tools/slice-sheet.py` currently calls `getbbox()` **per cell** and re-centres each one
independently. That would reintroduce exactly the misalignment measured in §3.1: cells
whose content differs in size would land at different screen positions, making him pop
on every state change.

**Required change:** add a uniform mode that computes one crop box from the union of all
cells and applies it to every cell, preserving the relative placement the single render
already got right. It must also **normalise output to exactly 500 × 500**, since the
model's grid size is not predictable (a 1024² grid yields 512² cells) and `SKIN_IMAGES`
portraits are 500 × 500. The existing per-cell behaviour stays available behind the
current flags so nothing that depends on it breaks.

### 8.4 Pilot before batch

Generate **one skin only** (wizard), slice it, wire it into `SKIN_POSES`, and look at it
in the running app. Only after it passes §9 does the remaining batch run. If the
pipeline is wrong, this costs ~$0.15 to discover instead of ~$2.

## 9. Validation harness

`tools/check-poses.py`, run on every sheet before it is accepted. It fails loudly rather
than warning, because a warning is what got ignored last time.

| Check | Threshold | Catches |
|---|---|---|
| Alpha channel present, corners transparent | exact | solid-background output |
| Cell alignment: bottom edge across cells | ±4px | the state-change pop in §3.1 |
| Cell alignment: centre x across cells | ±4px | horizontal jump |
| Cell alignment: bbox width across cells | ±8px | size flicker |
| Silhouette width vs the skin's canonical portrait | ±10% | wrong scale |
| Accessory-region palette vs canonical portrait | dominant colours present in similar proportion | **the wrong-helmet failure** |
| No near-pure-green pixels on the outline band | zero | chroma-key spill |

The last two exist specifically because they are the failures this repo has already
suffered and absorbed silently.

## 10. Sequencing and budget

| # | Stage | Renders | Est. |
|---|---|---|---|
| 1 | Validator + uniform slicing (code, no generation) | 0 | $0 |
| 2 | Pilot: wizard 2×2, wired and reviewed in-app | 1 | ~$0.15 |
| 3 | Remaining 13 skins | 13 | ~$2.00 |
| 4 | Retire sprites, wire `SKIN_POSES` (code) | 0 | $0 |
| 5 | Break mode: floor fix (code) | 0 | $0 |
| 6 | Break mode: bedroom + bed layers | 2 | ~$0.30 |
| 7 | Games: 3 boards + mascot placement | 3 | ~$0.45 |
| 8 | Placeholder icons | 1 | ~$0.15 |
| | **Total, take-one** | **20** | **~$3.05** |
| | **With a 1-in-3 re-roll rate** | ~27 | **~$4.10** |

Lower than the $5–8 quoted in the brainstorm, because one render covers four poses
rather than one. Budget cap for the whole project: **$15**, a hard stop, reported after
every stage.

Each stage lands in the app and is verified in the preview before the next one spends.

## 11. Out of scope

- App Store screenshots, marketing renders, eLab deck art.
- Per-theme bedrooms (10 extra renders).
- Redesigning the base character. The current art ships to paying users and stays.
- The 10 existing shop backgrounds.
- Walking as a distinct animation. Reinstated only if the CSS waddle proves insufficient.

## 12. Risks

| Risk | Mitigation |
|---|---|
| Generated poses come back off-model anyway | §9 palette check fails them automatically; pilot limits exposure to one skin |
| Retiring sprites regresses something | The static path is the original shipped behaviour and is still exercised by every skin without a sheet today; git revert is one commit |
| Break-mode CSS tuning fights `--floor-y` across devices | Ratios in §5.3 are relative to `--floor-y`, and the art bakes no floor |
| 15MB deletion breaks the service worker cache | Bump `CACHE` in `sw.js`, which is already mandatory on every release |
| Collaborator conflict | Two people push to `feature-work`; pull/rebase before starting, and keep art commits separate from code commits |
