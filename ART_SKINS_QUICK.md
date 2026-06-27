<!-- The lean kit. Open ART_SKINS_QUICK.html in a browser for copy buttons.
     The big 77-prompt ART_PROMPTS file is the "someday everything" wishlist —
     ignore it for now. THIS is all you actually need. -->

# Mr. Tapioca — Quick Skin Kit (the shortcut)

**Read this first — it saves hours:**

1. **Each skin is ONE image.** You never draw animation frames per skin. The app animates every skin in code (bobbing, walking, the mixing squish) from a single still picture.
2. **You already have the base character** (`assets/Mr. Tapioca.png`). You don't regenerate him — you *reuse* him as a reference so every skin comes out matching.
3. So a skin = **one paste, swap one word, generate.** ~30 seconds each.

---

## The whole workflow (per skin)

1. In Leonardo, upload `assets/Mr. Tapioca.png` under **Image Guidance → Character Reference** (strength ~**0.5**). This locks his face, body, colors, and style so you never have to describe them.
2. Paste **The Template** below and replace `[[ACCESSORY]]` with one row from the table.
3. Turn **transparency / background removal ON**, generate, and save with the filename from the table into `assets/`.

That's the entire job. No style paragraph to rewrite, no per-skin animation.

---

## Paste these two once and keep them

**Style line** (already baked into the template below):

```
kawaii chibi sticker illustration, soft pastel palette of cream, milk-tea brown, blush pink and mint accents, clean semi-flat vector with smooth cel shading and rounded dark-brown outlines, subtle soft gloss, even soft lighting, plain white background
```

**Negative prompt** (paste into the negative field every time):

```
text, letters, watermark, signature, realistic photo, 3d render, harsh shadows, busy background, extra characters, duplicate, blurry, low quality, off-model, deformed
```

---

## ⭐ The Template (this is the trick — reuse it for EVERY skin)

```
The exact same round glossy dark-brown tapioca boba pearl character from the reference image — identical kawaii face, small dot eyes, pink cheek blush, tiny smile, short stub arms, same round proportions and same upright front-facing pose — now [[ACCESSORY]]. One single character, centered, full body, friendly and cute. kawaii chibi sticker illustration, soft pastel palette of cream, milk-tea brown, blush pink and mint accents, clean semi-flat vector with smooth cel shading and rounded dark-brown outlines, subtle soft gloss, even soft lighting, plain white background.
```

---

## Swap-in list — replace `[[ACCESSORY]]`, one image each

You already have most of these from before, so **only (re)generate the ones you want to improve or add.** The first three are the "doing too much" ones, rewritten simpler so they read at small size.

| Save as | Replace `[[ACCESSORY]]` with |
|---|---|
| `Angel.png` | wearing a simple thin gold halo floating above his head and two small soft white feather wings (kept small and tidy, not huge) |
| `Wizard.png` | wearing one cute pointed midnight-blue wizard hat with a small star (no staff, no extra robes) |
| `Dragon.png` | wearing a cozy green dragon-hood with two tiny rounded horns and little wing nubs (cute, not fierce) |
| `Graduation Cap.png` | wearing a small black graduation cap with a gold tassel |
| `Flower Crown.png` | wearing a delicate crown of small pastel flowers |
| `Scarf.png` | wearing a chunky knitted cream-and-pink scarf |
| `Sunglasses.png` | wearing small round dark sunglasses |
| `Strawberry.png` | wearing a little red strawberry hat with a green leaf top |
| `Astronaut, blue.png` | wearing a rounded white astronaut helmet with a soft blue visor |
| `Ninja.png` | wearing a charcoal ninja headband and face wrap with just the eyes showing |
| `Cozy Sweater.png` | wearing a soft oversized knit sweater in cream and sage |
| `Headphones.png` | wearing big cushioned over-ear headphones in blush pink |
| `Barista Hat.png` | wearing a tiny tan barista cap and a small apron |
| `Nightcap.png` | wearing a soft droopy sleeping nightcap with a pom-pom, eyes gently closed |
| `Cat Ears Hoodie.png` | wearing a pastel hoodie with two little cat ears on the hood |

> Tip: keep the **same seed** off, but the same **Character Reference image + strength** on, for every skin. That's what keeps them looking like one set.

---

## Optional polish (skip this to ship faster)

You **don't need any of these** — the app already has a cup, currency, and background, and it draws the drink/foam/pearls in code. Only do these if you're feeling ambitious. Same reference image + style line.

### `Mixing.png` — replace `[[ACCESSORY]]` style with a pose
```
The exact same boba pearl character from the reference image, happily shaking a boba shaker cup with both stub arms, a little motion, same face and proportions. kawaii chibi sticker illustration, soft pastel palette of cream, milk-tea brown, blush pink and mint accents, clean semi-flat vector with smooth cel shading and rounded dark-brown outlines, subtle soft gloss, even soft lighting, plain white background.
```

### `Surprised-Happy.png` — celebration pose
```
The exact same boba pearl character from the reference image, jumping with joy, stub arms raised, big happy sparkly eyes, same face and proportions. kawaii chibi sticker illustration, soft pastel palette of cream, milk-tea brown, blush pink and mint accents, clean semi-flat vector with smooth cel shading and rounded dark-brown outlines, subtle soft gloss, even soft lighting, plain white background.
```

### `Shop Background.png` — illustrated shop wall (full-bleed, transparency OFF, 3:4 tall)
```
A cozy boba tea shop interior backdrop: a warm wooden back wall with a shelf of cute pastel tea jars, a soft daylight window, and a few warm hanging string lights, gentle and uncluttered with empty floor space in the lower third. No characters. kawaii chibi illustration, soft pastel palette of cream, milk-tea brown, blush pink and mint accents, clean semi-flat vector with smooth cel shading and rounded outlines, soft even lighting.
```

---

**Bottom line:** the only thing worth mass-producing is skins, and they're one template + one word each. Everything else is already handled in code or optional.
