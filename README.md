# Mr. Tapioca

A beginner-friendly prototype for a boba-themed focus app.

The first app loop is:

1. Pick a focus drink size.
2. Start a focus session.
3. Watch the boba cup fill over time.
4. Finish the drink.
5. Save a real-world treat reward.

## Open the prototype

Open `index.html` in a browser, or run a local server from this folder:

```sh
python3 -m http.server 4173
```

Then visit:

```text
http://localhost:4173
```

## Current prototype features

- Tasting, small, and large drink modes.
- Small drink maps to 3 hours of focus.
- Large drink maps to 6 hours of focus.
- A phone-shaped, one-screen boba shop UI.
- Mr. Tapioca, a cute tapioca maker character who idles, blinks, and moves while the timer runs.
- Counter, Mix, Shelf, and Treats buttons that open shop sections.
- Tea base, topping, sticker, and maker apron choices.
- Mr. Tapioca styles and shop themes, including mocked premium cosmetics.
- Animated drink details: steam, filling liquid, foam, jelly, pudding, and boba movement.
- Drink shelf saved in the browser.
- Treat jar rewards saved in the browser.
- A mock restricted-app message inspired by iOS Screen Time shielding.

## Later iPhone version

The real iOS app should be built in SwiftUI. App blocking should use Apple's Screen Time frameworks:

- FamilyControls for permission and app selection.
- ManagedSettings for shielding selected apps.
- DeviceActivity for focus sessions and schedules.

This web prototype is for proving the product loop before moving into native iOS work.
