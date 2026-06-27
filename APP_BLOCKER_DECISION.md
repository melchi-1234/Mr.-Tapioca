<!-- Verified, source-cited research memo on building the iOS distraction-blocker. -->

I'll write this memo directly. The research is comprehensive and verified, so I'm synthesizing it into the advisory format requested.

# Mr. Tapioca — iOS App-Blocking: Architecture Memo

*For: Melchior (founder) · Scope: can the blocker be built, on Capacitor or native, and how to sequence it*

---

## TL;DR

Yes — the core app-blocking feature is buildable on iOS, and indie focus apps (Opal, one sec, Jomo, ScreenZen) ship exactly this. But the blocker is **irreducibly native Swift**, it relies on a **manually-approved Apple entitlement**, and it can only be a **"soft" deterrent**, never a hard phone lock. The catch for your stack: Capacitor *can* host it, but the blocker itself gets none of the "fast web iteration" benefit — that part is native engineering either way.

---

## 1. Can it be built, and what will it actually do?

**Yes, on iOS 16+.** Apple gives you exactly one sanctioned toolkit — the Screen Time API, which is three frameworks working together ([Apple docs](https://developer.apple.com/documentation/screentimeapidocumentation)):

- **FamilyControls** — asks the user for permission and shows the picker where they choose what to block.
- **ManagedSettings** — applies the actual "shield" (the block screen).
- **DeviceActivity** — controls *when* blocks turn on/off and watches usage.

**What it CAN do:**
- Block user-chosen apps, whole categories (Social, Games), and websites — on launch.
- Turn blocking on instantly for a study session (not just on a schedule) — exactly your use case.
- Show a **branded shield screen** with your boba styling.
- Run on schedules and fire on usage thresholds ("after 10 min").

**What it CANNOT do (hard limits, same for every competitor):**
- **It never learns which apps the user picked.** Selections come back as opaque tokens — no app names, no bundle IDs, no icons. You literally cannot show "you blocked TikTok" in your own UI. ([Apple forums](https://developer.apple.com/forums/thread/722618))
- **It can't lock the whole phone or force-quit apps.** It only intercepts launching/foregrounding a blocked app. ([state of the API, 2024](https://riedel.wtf/state-of-the-screen-time-api-2024/))
- **It can't stop the user from bypassing it.** Users can revoke Screen Time access in Settings anytime; third-party apps can't passcode-lock their own permission the way Apple's built-in Screen Time can.
- **It can't cleanly bounce the user back into Mr. Tapioca** from the shield (only `.none`/`.close`/`.defer` buttons; devs hack around this with local notifications).

**The honest framing:** the block is "deterrent-grade." Your differentiation is the *intervention UX* (the boba reward, friction, streaks), not a stronger lock — because every app hits the same OS ceiling.

---

## 2. Can Capacitor use it, and what must be native?

**Yes, Capacitor can host it** — but the blocking engine is **100% native Swift and cannot live in the web layer.** These frameworks have no JavaScript bridge, and key parts run in separate *app extensions* (own processes outside the WebView). ([Capacitor plugin docs](https://capacitorjs.com/docs/plugins/ios))

**Clear dividing line:**

| Stays in your existing web app (fast iteration ✅) | Must be native Swift (slow, finicky ⚠️) |
|---|---|
| Boba timer, session config, streaks | Permission request (FamilyControls auth) |
| Map, achievements, settings, onboarding | The app-picker UI (a SwiftUI view) |
| Calling plugin methods: `startSession()`, `stopSession()`, `showPicker()` | Writing the shield (ManagedSettings) |
| | DeviceActivityMonitor extension (start/stop block) |
| | ShieldConfiguration extension (the block screen) |
| | ShieldAction extension (handling taps) |

**The reality check:** There is **no off-the-shelf Capacitor plugin** for this as of 2026 — you'd build a custom one. The only mature precedent is React-Native-only ([kingstinct/react-native-device-activity](https://github.com/kingstinct/react-native-device-activity)), which proves the hybrid approach works but isn't reusable for you. A Capacitor build means: a **bespoke Swift plugin + ~3 native extension targets + App Groups plumbing** to pass data across processes. Capacitor saves you nothing on the one feature that defines the product.

---

## 3. Capacitor-hybrid vs full-native SwiftUI

**Key insight: the blocker is native in BOTH paths, and the Apple entitlement gauntlet is identical in both.** So the blocker alone does *not* justify throwing away your web app.

**Does Capacitor disadvantage the blocker?** Slightly, yes — be honest about it:
- It adds a JS↔native marshalling layer over the OS's *most fragile* API (unstable tokens, silent failures).
- It adds cross-process App Group plumbing you'd avoid in pure native.
- It's an extra failure surface on the finickiest part of the system.
- It does **not** reduce the native code you must write — the extensions are byte-for-byte the same.

**The case for each:**

- **Capacitor wins if** your real differentiator is the boba UX you've *already built in web*. You keep all of it, add a focused native plugin, ship faster to v1. This is the lower-effort path.
- **Native SwiftUI wins if** you expect to lean hard into deep iOS integration later — Live Activities, Focus Filters, usage-chart dashboards (DeviceActivityReport), tighter reliability on the blocker — and want to avoid maintaining a custom bridge over Apple's buggiest API.

**Recommendation:** Given the boba experience is the product and it's already web, **Capacitor + a custom Screen Time plugin is the smarter v1.** Accept that the blocker module is a native sub-project regardless. Don't expect to "iterate fast in the browser" on anything blocking-related — that part is real Xcode/Swift/device work.

---

## 4. Real-world catches (plan for these now)

- **Entitlement approval is the long pole.** Shipping needs the gated `com.apple.developer.family-controls` **Distribution** entitlement, requested via [Apple's form](https://developer.apple.com/contact/request/family-controls-distribution). Dev builds work instantly on your own device, but **TestFlight and App Store both require approval first.** Timeline is unpredictable: best case ~2–4 business days, but 2025–26 reports show **weeks to ~2 months of silence**, no status dashboard. **→ Submit this the day you have an App Store Connect listing, in parallel with building.**
- **Every bundle ID needs its own approval.** The main app *plus each extension* = ~4 separate entitlement requests (`com.app`, `.ActivityMonitor`, `.ShieldAction`, `.ShieldConfiguration`). Miss one and blocking *silently fails* outside dev builds. ([itsuki guide](https://medium.com/@itsuki.enjoy/swift-ios-take-family-control-to-production-distribution-83da9b3346c6))
- **No Simulator — ever.** Authorization, picker, shielding, and the monitor extension only work on a **physical device.** This changes your whole dev/test/CI workflow.
- **The "user picks apps" model is permanent.** You will never know what they chose. Design onboarding and copy around opaque selections — no per-app labels, no "you saved 2 hrs on Instagram."
- **Documented API bugs to budget native time for:** tokens randomly rotating, shields not updating across stores, ~6MB memory cap on the monitor extension, permission changes not seen until app restart, picker crashes. ([state of the API](https://riedel.wtf/state-of-the-screen-time-api-2024/))
- **App Store review:** keep all Screen Time data on-device (sending tokens off-device risks rejection), and justify the genuine self-control use case. The real blocking feature also *protects* you from the Guideline 4.2.2 "thin web wrapper" rejection — it's a substantial native feature.

**One lighter fallback worth knowing:** without the entitlement, you can only do **soft, honor-system accountability** — detect when the user leaves Mr. Tapioca (Page Visibility API) and forfeit the drink/streak. It works in web/Capacitor today but **can't see or block the distracting app**, and iOS freezes backgrounded web code after ~5s. Good as a *complement*, not the core promise. (Focus modes/DND don't block apps either — common misconception.)

---

## 5. Recommended path (phased)

**Phase 0 — De-risk the gate (week 1, do immediately).**
Create the App Store Connect listing and **submit the Family Controls Distribution request for all ~4 bundle IDs.** This clock runs while you build. Buy/dedicate a physical test device.

**Phase 1 — Soft accountability in web (fast, ships value now).**
Build the Page Visibility "leave = forfeit your boba" mechanic in your existing web app. This is real, on-brand, and gives you a usable product while the entitlement and native work proceed. Pure fast web iteration.

**Phase 2 — Native blocker plugin (the heavy lift).**
Build the custom Capacitor Swift plugin + the three extensions (Monitor, ShieldConfiguration, ShieldAction) + App Groups. Wire web → plugin (`requestAuth`, `showPicker`, `startSession`, `stopSession`). Use kingstinct's RN library as an architectural blueprint. **Expect this to be slow, device-only, Swift-heavy work — not web iteration.**

**Phase 3 — Integrate, polish, TestFlight (gated on approval).**
Brand the shield screen, handle the return-to-app flow (local notifications), harden against the known API bugs. Once the entitlement clears, push to TestFlight (impossible before approval).

**Phase 4 — Decision checkpoint.**
If you later want Live Activities, usage dashboards, or you're fighting the bridge over Apple's fragile API, *that's* when to weigh a native SwiftUI migration of the blocker module — not for v1.

---

**Bottom line:** Build it on Capacitor, keep your boba UX in web, and treat the blocker as a native sub-project you start de-risking (entitlement + device) on day one. The feature is real and approvable, but the parts that matter — the entitlement wait and the Swift extensions — are deliberately slow and won't feel like web development. Set that expectation now and sequence around it.
