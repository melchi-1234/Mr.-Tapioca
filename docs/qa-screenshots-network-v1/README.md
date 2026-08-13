# Visual QA sweep, reward-aware app states

Produced by `tools/qa/capture-network-v1.mjs`. Re-runnable, and re-running is the point:
the reward states need 4 hours of banked focus and a GPS fix inside 40 m of a real shop,
which is why nobody re-checks them by hand before a release.

```bash
node tools/qa/capture-network-v1.mjs                 # all 15 states, both widths
node tools/qa/capture-network-v1.mjs --only 07,08,09 # one flow
node tools/qa/capture-network-v1.mjs --phone-only
```

**This run:** 2026-08-13. Chrome 151.0.7922.109 headless, Node v22.18.0, macOS 26.5.1.
**Result: 30 of 30 captured, zero JS errors, nothing NOT CAPTURED.** Full per-state
console-error arrays and the network log are printed by the script itself; this run
printed `[]` for all 30 states.

Widths are 375x812 (phone, `deviceScaleFactor` 2, mobile emulation on) and 1280x900
(desktop, same scale), per the CLAUDE.md rule that every visual change is checked at
both. Desktop files carry the `-desktop` suffix. The desktop layout really does differ:
above 1180px `.site-rail` returns, so the app sits in a phone frame between a marketing
card and the QR panel.

## What the script refuses to do

1. **It will not photograph the wrong screen.** Every state asserts against the live DOM
   before the shutter fires. A failed assertion is recorded as NOT CAPTURED with the
   reason; it never falls back to whatever happened to be on screen. This is not
   theoretical: states 09 and 10 failed on the first run because the redeem button was
   below the fold in the map sheet and the synthetic click hit nothing. The map states
   additionally require `lastFix.real === true`, because a denied geolocation drops the
   app onto its San Francisco demo city, which looks exactly like a working map.
2. **It makes no live-service requests.** Every request is intercepted at the CDP Fetch
   layer. Same-origin continues, `mrtapioca.me/partners.json` is fulfilled from the copy
   on disk, OSM tiles are fulfilled with a locally drawn placeholder, and everything else
   is blocked and logged. On this run the blocked list was empty (nothing else was even
   attempted) and the served list was `partners.json x10`, `osm tile x90`.
3. **A JS error fails the run.** Console errors and page exceptions are collected per
   state; the process exits non-zero if any state produced one.

It also refuses to write any filename starting with `cashier-`, `landing-`,
`merchant-pilot-` or `privacy-policy-`. Those 23 PNGs belong to other work and are
untouched.

## How the states are reached

- **Seeding** runs in `Page.addScriptToEvaluateOnNewDocument`, so it lands before
  `config.js` and `app.js` rather than needing a throwaway first boot. It clears
  localStorage, then writes that state's keys.
- **The cloud is off on purpose.** `window.MRTAP_CLOUD` is defined as a frozen empty
  object before `config.js` can assign to it, so `squad-cloud.js` and `metrics.js` both
  go inert. No anonymous Supabase account is created and no `drink_events` row is posted
  by a QA run. The visible cost is state 13, which is therefore the on-device Squad.
- **The service worker is disabled** (`navigator.serviceWorker.register` returns a
  rejected promise, which the app already swallows). CLAUDE.md gotcha #2: the worker will
  serve you a stale `app.js` and you will photograph last week's build.
- **Geolocation** is `Emulation.setGeolocationOverride` plus a browser-level
  `Browser.grantPermissions`. Without the grant, headless Chrome auto-denies.
- **Shop data** comes from the app's own `CURATED_SHOPS`, computed in-page with the app's
  own `curatedNear()` and `haversine()`, then written into the app's real 24-hour shop
  cache (`bobaShops2:<cell>`). That takes the genuine cache-hit path and keeps the sweep
  off the live Overpass API. No shop was invented.
- **Drink and treat history** is likewise built by the app's own `currentDrinkName()`,
  `modeLabel()`, `minuteLabel()`, `durationLabel()`, `localDateKey()` and `BASES`, with
  the partner line mirroring `completeSession()` (app.js:2434-2446). Hand-written fixture
  objects are how a sweep drifts into showing states the app can no longer produce.

## The images

Each row lists the phone file; the `-desktop` twin is the same state at 1280x900.

| # | File | What it shows | How it was seeded |
|---|---|---|---|
| 01 | `01-onboarding-first-slide.png` | Slide 1 of 7, "Say Hello to Mr. Tapioca!" | Storage cleared. No `bobaFocusOnboarded`, so the app opens onboarding itself. |
| 02 | `02-onboarding-real-boba.png` | The reward-aware slide, "Real boba, not just points" (slide 6 of 7) | Same, then `#onboardNext` clicked 5 times with real mouse events. |
| 03 | `03-screen-time-block-prompt.png` | `#blockPrompt`, the app's only Screen Time explanation surface | Onboarding + tour skipped, then `showBlockingPrompt()` called directly. See caveat 1. |
| 04 | `04-home-ready.png` | Home, idle, 30:00 Custom Cup, Start Focus | `bobaFocusOnboarded` + `bobaFocusTourDone` + a name. |
| 05 | `05-focus-running.png` | A session genuinely running at 40% (17:58 left, cup part-filled, Pause) | Start Focus clicked for real, then `state.elapsed` moved to 40% and the app's own 250 ms tick left to run. |
| 06 | `06-reward-dialog.png` | Drink-complete dialog, first drink: "3 hr 30 min of focus until your next partner perk", +2 pearls | Real session, `state.elapsed` pushed to just under the line so `tick()` calls `completeSession()`. |
| 06b | `06b-reward-dialog-perk-unlocked.png` | The same dialog when the drink crossed the bar: the partner line renders as a coupon | 220 minutes of history seeded, then a real 30-minute session on top (250 crosses 240 once). |
| 07 | `07-map-perk-progress.png` | Reward PROGRESS on the Boba Map banner: "Dream Tea & Poké is a partner shop. 1 hr 30 min more focus to earn 5% off your drink." | 150 minutes seeded, geolocation Ithaca, map opened. |
| 08 | `08-map-partner-shops.png` | Both live partner shops starred and in frame, holding one earned reward | 240 minutes seeded, geolocation Ithaca, then the map panned/zoomed to fit both pins. |
| 09 | `09-counter-card-ready.png` | The counter card READY for U Tea: "10% off your drink", live ticking stamp, "You have 1 reward saved.", Use one reward enabled | Same as 08, then U Tea's "Show at the counter" tapped. |
| 10 | `10-counter-card-not-ready.png` | The same card at a zero balance: greyed perk, faded button, "4 hrs of focus to go." | No history, geolocation Ithaca, U Tea's counter button tapped. |
| 11 | `11-map-no-partner.png` | No-partner state: 12 real Honolulu boba shops, no stars, "1 reward saved. No partner shop near you yet." | 240 minutes seeded, geolocation Honolulu (13 curated shops, zero partners). |
| 12 | `12-collection-treats.png` | The shelf on its Treats tab, 4 treats | 4 drinks + 4 treats seeded, shelf chip tapped, Treats tab tapped. Drinks is the sheet's default tab. |
| 13 | `13-squad.png` | The Study Squad screen | 4 drinks seeded, Squad button tapped. Cloud deliberately off, see caveat 2. |
| 14 | `14-settings.png` | Settings, top of the sheet | 4 drinks seeded, Settings button tapped. The sheet scrolls internally; this is what opens. |

## Not captured

**None.** Every state in the brief was reached and asserted. Two states are captured with
a stated caveat rather than a gap, below.

## Caveats, stated rather than hidden

1. **State 03 is invoked, not walked into.** `startPause()` gates the block prompt behind
   `FocusBlocker.available()` (app.js:2143), which is false on any build without the
   Capacitor plugin, so pressing Start on this build can never open it. The script calls
   `showBlockingPrompt()` directly. The dialog, its copy and its three buttons are the
   shipped ones and are not modified. What this sweep does NOT show is the prompt on a
   real device, where it is preceded by Apple's Family Controls authorization sheet and
   the system app picker. Neither of those can be photographed here.
2. **State 13 is the on-device Squad, not a live-cloud Squad.** The cloud is off by design
   (see rule 2 above). This sweep says nothing about live Squad data.
3. **The basemap is a locally drawn placeholder**, labelled "QA offline basemap (not real
   geography)" on every tile. Pin positions, distances, the shop list, the banner and the
   counter card are all real; the streets behind them are not, because the sweep does not
   call OSM. Distances shown in the shop list are computed by the app from the real
   coordinates and are correct (Dream Tea & Poké 540 m, U Tea 1.4 km from the fixture
   fix).
4. **The Overpass query is not exercised.** The shop cache is pre-seeded, so this sweep
   covers the cache-hit path only. The live query, its four mirrors, the partial-result
   banner and the curated fallback are untested here.
5. **The PWA install banner is in frame on most shots.** That is a genuine element of the
   web build in Chrome, not an artifact of the harness. It does not appear in the native
   iOS app.
6. **These are not pixel-stable.** CSS animations are left running, and the counter card
   deliberately ticks a live timestamp once a second, so two runs will not be
   byte-identical. Compare content, not hashes.
7. **The sweep runs the web build.** Anything native (the real Screen Time shield, the
   Live Activity, StoreKit) is out of reach by construction.

## Things worth a second look

Not defects the script found; things visible in the images that a human should judge.

- **08: partner star pins sit under neighbouring shop pins.** In Collegetown the partner
  markers are only tens of metres from non-partner shops, so at the zoom that fits both
  partners the gold star discs are partly occluded by ordinary boba pins. The phone shot
  shows this more than the desktop one. The map is legible, but the star is the entire
  signal for "this shop honours a reward", and at phone width it is partly hidden.
- **07-desktop: the Daily Quest toast covers the first shop row.** Opening the map credits
  the "Peek at the boba map" quest, and its toast lands over the top of the shop list for
  a couple of seconds. Cosmetic, but it lands on the one row that carries the perk.
- **10 confirms GROUNDING.md section 1, row 12 visually.** At a zero balance the shop
  name, the address, the perk and the ticking timestamp all still render at full
  strength; only the chip and the button dim. Read across from 09 to 10: the two cards are
  close enough that a barista glancing at a phone would not obviously tell them apart.
