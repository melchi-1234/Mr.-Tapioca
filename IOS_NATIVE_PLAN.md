# Mr. Tapioca → Native iOS with real App Blocking

The MAIN feature: while a focus session runs, **block distracting apps** (Instagram,
TikTok, etc.) on the user's phone. This requires a **native iOS app** — a web app /
PWA cannot block other apps (browser sandbox). This plan reuses everything we've
built and adds the native blocking layer on top.

## How blocking actually works on iOS
Apple's **Screen Time API** (iOS 16+), three frameworks:
- **FamilyControls** — `FamilyActivityPicker`: the user picks which apps/categories to
  block. (Privacy: Apple never tells us *which* apps — we get opaque tokens. Good for
  App Store approval.)
- **ManagedSettings** — `ManagedSettingsStore`: applies the "shield" that blocks the
  chosen apps.
- **DeviceActivity** — `DeviceActivityMonitor`: schedules the shield to turn on for the
  focus session window and off when it ends/breaks.

This is exactly how Opal, Jomo, one sec, and Brick work.

## Architecture (reuse the web app, add native blocking)
```
┌─ Native iOS app (Swift, Xcode) ───────────────────────────┐
│  • Capacitor WebView → runs our EXISTING web app           │
│    (cozy UI, cup, games, Squad, quests — all reused)       │
│  • Capacitor plugin (Swift) ↔ JS bridge:                   │
│      startBlocking(sessionEndsAt) / stopBlocking()         │
│      pickAppsToBlock()                                      │
│  • DeviceActivityMonitor extension (separate target) that  │
│    shields the picked apps for the session window          │
└────────────────────────────────────────────────────────────┘
```
- The web app calls `MrTapBlocker.startBlocking()` when a focus session starts and
  `stopBlocking()` when it ends/breaks. On the web (no native bridge) these are no-ops,
  so the same codebase keeps working in the browser.

## Prerequisites (the gating items)
| Item | Who | Cost | Notes |
|---|---|---|---|
| Mac + Xcode | you (have Mac) | free | install Xcode from the App Store |
| Apple Developer Program | you | **$99/yr** | required to build entitled features + ship |
| **Family Controls entitlement** | you (I draft it) | free | **request from Apple — the long pole; start EARLY.** Apple approves legit focus apps, days–weeks |
| Real iPhone for testing | you | — | Screen Time API doesn't fully run in the simulator |
| Node + CocoaPods | (toolchain) | free | for the Capacitor build |

## Phases (who does what)
- **Phase 0 — interim (web, free, now):** add "leave during a session → your drink
  spills / streak at risk" soft accountability to the web app. Not real blocking, but
  gives stakes today while the native path spins up. *(I can do this now.)*
- **Phase 1 — Capacitor wrapper:** scaffold the iOS project that runs our existing web
  app as a native app. Output: the app builds + launches on your iPhone (no blocking
  yet). *(I scaffold + write config; you run the Xcode build/sign once.)*
- **Phase 2 — accounts + entitlement:** you sign up for Apple Developer ($99) and submit
  the Family Controls entitlement request. *(I draft the request text + walk you
  through it.)* ← start this in parallel with Phase 1; it's the slowest step.
- **Phase 3 — native blocking:** I write the Swift plugin + DeviceActivityMonitor
  extension (FamilyActivityPicker → ManagedSettingsStore shield, tied to the focus
  timer). Wire the web app's start/stop to it. Test on your real device.
- **Phase 4 — ship:** screenshots, App Store metadata, privacy nutrition label,
  submission + review.

## What changes about how we work
Up to now I could write code + verify it for you in the browser preview. Native adds
steps only you can do on your Mac: **Xcode build, code-signing, and on-device testing.**
I write all the Swift/config and give exact commands, but you'll be clicking Run/sign in
Xcode and approving the Screen Time permission on your phone.

## Cost + timeline reality
- **$99/yr** Apple (the only new hard cost). Hosting/backend stay $0.
- The **entitlement approval** is the unknown (days–weeks) — everything blocking-related
  is blocked until Apple grants it, so request it first.
- Realistic: a working on-device blocking prototype within ~1–2 focused weeks *after* the
  entitlement is granted + account is set up.

## Bottom line
Right direction, doesn't touch the working web app, but it's a real project with a $99
cost and an Apple approval gate. Best start: **(1)** I add the soft accountability +
scaffold the Capacitor wrapper now, **(2)** you get the Apple Developer account and we
file the Family Controls entitlement request immediately (longest lead time).
