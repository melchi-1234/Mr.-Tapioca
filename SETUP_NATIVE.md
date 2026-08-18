# Mr. Tapioca → real iPhone app with the Focus-Friend-style app blocker

This is the step-by-step to turn the web app into a real App-Store app whose
focus mode greys out other apps and shows a "Restricted" screen — exactly like
Focus Friend. That effect is Apple's **Screen Time / Family Controls** API; the
starter code for it is already in `native-ios/`.

**How the work splits:**
- 🟢 **You can do now (even from your phone):** Steps 1–2. These start Apple's
  slow approval clock, so do them first.
- 🔵 **We do together at your Mac (Claude writes the code, you run Xcode):** Steps 3–7.

---

## 🟢 Step 1 — Enroll in the Apple Developer Program ($99/yr)

Required to test on a real iPhone and to publish. From your phone or Mac:
**developer.apple.com → Account → Enroll.** It can take a day or two to activate.

## 🟢 Step 2 — Request the "Family Controls" entitlement (DO THIS EARLY)

App blocking needs a special Apple permission that a human at Apple must approve.
Approval can take **a few days to a few weeks**, so request it the moment your
account is active — don't wait until the app is built.

Go to: **developer.apple.com/contact/request/family-controls-distribution**

Paste something like this (edit the brackets):

> **App name:** Mr. Tapioca
> **What it does:** Mr. Tapioca is a personal focus/study timer. Users grow a
> virtual boba drink by studying; during a focus session the app uses the Screen
> Time API to shield distracting apps the *user themselves* selects, helping them
> stay off social media until their session ends.
> **Why we need Family Controls (Distribution):** to let users pick their own
> distracting apps via the FamilyActivityPicker and apply a ManagedSettings
> shield during focus sessions. All Screen Time data stays on-device; we never
> transmit or store the user's app selections off the device.
> **Audience:** individual users practicing self-control (not MDM / not
> parental control for others).

> Tip: you submit one request, but later each piece (main app + the 3 extensions)
> needs the entitlement too — same approval covers your team; you just add the
> capability to each target in Xcode (Step 5).

---

## 🔵 Step 3 — Install the toolchain (one time, on your Mac)

In Terminal, inside this project folder:

```
npm install
npx cap add ios
```

This downloads Capacitor and generates the native `ios/` Xcode project that wraps
your web app. (Needs Node, Xcode, and CocoaPods installed — we'll sort those out.)

## 🔵 Step 4 — Bundle the web app into the shell

```
npm run ios:open
```

That copies your web files into `www/`, syncs them into the iOS app, and opens
Xcode. From now on, any time I change the web app you just run this again — your
fast web iteration is preserved.

## 🔵 Step 5 — Add the native blocker (the part that makes the magic)

In Xcode we will:

1. Add the **Family Controls** capability to the app target (Signing &
   Capabilities → + → Family Controls), and an **App Group**
   (`group.com.melchior.mrtapioca`).
2. Add `native-ios/FocusShieldPlugin.swift`, `FocusShieldPlugin.m`, and
   `SharedSelection.swift` to the **app target**.
3. Create three **extension targets** (File → New → Target):
   - **Shield Configuration** → use `ShieldConfigurationExtension.swift` (the boba "Restricted" screen)
   - **Shield Action** → use `ShieldActionExtension.swift` (the buttons)
   - **Device Activity Monitor** → use `DeviceActivityMonitorExtension.swift`
   Add `SharedSelection.swift` + the App Group + Family Controls capability to **each** extension.

I'll walk you through every click — this is the fiddly part, but it's one-time.

## 🔵 Step 6 — Test on your real iPhone

Plug in your iPhone, pick it in Xcode, press ▶. (Screen Time **does not work in
the simulator** — it must be a real device.) In the app: Settings → **Choose apps
to block** → pick a couple → start a focus session → try to open one. It should
grey out and show your boba "Restricted" screen. 🎉

## 🔵 Step 7 — TestFlight → App Store

Once the entitlement (Step 2) is approved, use the repository's release gates—do
not archive or upload manually from Xcode Organizer:

1. Run `npm run ios:release-setup`, review the synchronized native files, and
   commit the exact release state.
2. Run `npm run ios:archive-release -- /absolute/path/Mr-Tapioca-1.1.1-9.xcarchive`.
3. Run `npm run ios:export-release -- /absolute/path/Mr-Tapioca-1.1.1-9.xcarchive /absolute/path/Mr-Tapioca-1.1.1-9.ipa`.
4. Run `npm run ios:upload-release -- /absolute/path/Mr-Tapioca-1.1.1-9.ipa`.
5. Install the processed build from TestFlight on a real iPhone. Recheck the
   Angel, full focus layout, Screen Time blocking, notification completion, and
   a real 15-minute Reward V2 session before submitting for App Review.

Build 8 is a rejected TestFlight candidate and must never be submitted. The next
candidate is version 1.1.1 build 9.

---

## What it will and won't do (so there are no surprises)

- ✅ Greys out + shows a custom "Restricted" screen for apps/categories the user picks.
- ✅ Turns on instantly when a focus session starts, off when it ends/pauses/breaks.
- ✅ You can paywall the app picker later (like Focus Friend) — it's just a UI gate.
- ❌ Can't lock the whole phone or force-quit apps (Apple allows no app to).
- ❌ Can't see *which* apps the user chose (Apple hides this for privacy) — so the
  UI can't say "you blocked TikTok," only "X apps blocked."
- ❌ A determined user can turn Screen Time permission off in iOS Settings.

This is the exact same capability and ceiling every focus app (Focus Friend, Opal,
one sec) works within. Our edge is the boba reward loop on top.

---

## How the web app already talks to it

`app.js` calls `window.Capacitor.Plugins.FocusShield` via the `FocusBlocker`
helper: `startBlocking()` on focus start, `stopBlocking()` on pause/break/finish,
and `pickApps()` from the Settings "Choose apps to block" button. On the plain
web build the plugin is absent, so those calls safely do nothing — the browser
version keeps working, and real blocking only kicks in inside the iPhone app.

---

## QA: Screen Time gotchas found in the field (Aug 2026)

Real bug from a filmed demo (Aug 6 2026): Instagram had a PERSONAL 1-hour Screen
Time limit set in iOS Settings. When that limit was hit, iOS showed its own
hourglass shield, the user tapped "Ignore Limit for today", and from that moment
Mr. Tapioca's boba shield no longer blocked Instagram for the rest of the day.
Deleting and reinstalling Instagram did not bring blocking back.

Two separate iOS behaviors stack up here:

1. **"Ignore Limit" is a day-scoped, OS-level allowance.** iOS's own limit
   shield takes over the app, and the "for today" exemption suppresses
   third-party shields too. CONFIRMED device-level the same evening: Focus
   Friend (an unrelated blocker) is bypassed identically, and the exemption
   survived deleting the limit, restarting the phone, AND a fresh re-pick.
   Other shielded apps (TikTok, YouTube) kept blocking, so it is scoped to
   the exempted bundle. Nothing in our code can veto it; the app re-asserts
   the shield every 5 minutes and on foreground, and a DeviceActivity
   usage-watchdog (1 min of real usage on a "blocked" app) detects the
   defeated state and warns the user honestly instead of pretending.
2. **App tokens die silently when the blocked app is reinstalled** (documented
   across Apple Developer Forums threads 788764 / 814571 / 771119; also seen
   after some iOS updates). There is NO API to detect a dead token, and
   re-confirming the old selection in the picker re-saves the same dead tokens.
   The only real fix is re-picking from scratch, which is what the new
   "Blocking Not Working? Re-pick Apps" button in Settings does (it opens the
   picker EMPTY via `pickApps({ fresh: true })`).

**QA checklist before each release (needs a real iPhone; Screen Time is dead in
the simulator):**

- Block an app that ALSO has a personal Screen Time limit. Hit the limit, tap
  "Ignore Limit for today", then confirm whether the boba shield still holds
  (record the result; this documents the OS behavior for support replies).
- After an Ignore Limit bypass, check again the NEXT day: blocking should
  self-heal once the day rolls over. If it does not, that is new information
  (the Aug 6 incident predicts midnight recovery; unverified until observed).
- During a session with a bypassed app, use it for over a minute, then reopen
  Mr. Tapioca: the "iOS is letting a blocked app through" warning toast should
  appear within about 5 minutes (the DeviceActivity watchdog check).
- Delete and reinstall a blocked app mid-selection. Expect blocking to silently
  skip it. Then run "Blocking Not Working? Re-pick Apps" and confirm blocking
  resumes.
- After any iOS update on the test phone, spot-check that blocking still fires
  before trusting a demo.
