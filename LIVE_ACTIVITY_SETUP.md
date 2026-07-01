# Lock-Screen Focus Countdown (Live Activity) — Xcode Setup

One guided Xcode session, ~10 minutes, same recipe as the shield extensions.
When done: starting a focus session puts a live countdown on the Lock Screen
and in the Dynamic Island (the pill around the notch) — no opening the app to
check time left. Pausing/finishing/resetting clears it.

Everything is already written and wired:
- `native-ios/FocusActivityPlugin.swift` — the app-side plugin (start/stop)
- `native-ios/FocusActivityAttributes.swift` — shared data (add to BOTH targets)
- `native-ios/FocusWidgetLiveActivity.swift` + `FocusWidgetBundle.swift` — the widget UI
- `app.js` already calls it on focus start/pause/complete/reset
- Info.plist already has `NSSupportsLiveActivities = YES`
- The plugin class is auto-registered by `tools/register-ios-plugins.mjs`

## The Xcode steps

1. **Create the widget target:** File → New → Target… → search `Widget` →
   **Widget Extension** → Next.
   - Product Name: **`FocusWidget`** (exactly)
   - Team: Melchior Goldfarb · Embed in Application: App
   - **Uncheck** "Include Configuration App Intent" if the checkbox exists.
   - Finish → if asked to activate the scheme: **Don't Activate**.

2. **Replace the template code:** Xcode created a `FocusWidget` folder with
   one or more `.swift` files. Delete the template `.swift` files in it
   (right-click → Delete → Move to Trash), then:
   - File → Add Files to "App"… → go to `native-ios/` → select
     **FocusWidgetLiveActivity.swift** and **FocusWidgetBundle.swift** →
     in the Add dialog, tick **Copy files** and set Targets: **FocusWidget
     ONLY** (untick App) → Finish/Add.

3. **Share the attributes file with both targets:** in the sidebar click
   `FocusActivityAttributes.swift`… it doesn't exist in the project yet, so:
   - File → Add Files to "App"… → `native-ios/` → select
     **FocusActivityAttributes.swift** AND **FocusActivityPlugin.swift** →
     Targets: tick **App** → Add.
   - Then click `FocusActivityAttributes.swift` in the sidebar → File
     Inspector (⌥⌘1) → Target Membership → tick **FocusWidget** too
     (so it's in BOTH App and FocusWidget).

4. **Match the widget's minimum iOS:** click the blue App project → TARGETS →
   **FocusWidget** → General → Minimum Deployments → set iOS **16.6**.

5. **Build check:** Product → Build (Cmd+B). Then run on your iPhone (▶),
   start a focus session, and lock the phone — the countdown banner should be
   on the Lock Screen, and the Dynamic Island shows 🧋 + the timer.

## Troubleshooting

- "Cannot find 'FocusActivityAttributes'" building the widget → the attributes
  file isn't ticked into the FocusWidget target (step 3).
- Cannot find it building the APP → it isn't ticked into the App target.
- No banner appears → iPhone Settings → Face ID & Passcode → make sure
  "Live Activities" is allowed on the Lock Screen; and Settings → Mr. Tapioca
  → Live Activities ON.
- The activity auto-dismisses when the countdown ends even if the app is
  closed (staleDate) — that's expected for v1; finishing IN the app ends it
  instantly.
