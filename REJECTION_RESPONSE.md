# Responding to the 1.0 (4) rejection — copy-paste kit

Four issues, all fixable. Two are already fixed in code (support page + iPhone-only).
You do the App Store Connect steps below, upload Build 5, and reply to Apple.

---

## REPLY TO APPLE (paste into the message thread in App Store Connect)

> Hi, thank you for the detailed review. We have addressed all four points:
>
> **1.5 Support URL:** The Support URL has been updated to a dedicated support
> page with contact information and an FAQ:
> https://melchi-1234.github.io/Mr.-Tapioca/support.html
>
> **2.1 In-App Purchases:** The six non-consumable cosmetic In-App Purchases are
> now included in this submission alongside the new build. Each has an App Review
> screenshot attached.
>
> **4 Design (iPad):** The app is designed for iPhone. We have set it to iPhone
> only so it presents its intended layout. An iPad-native layout may come in a
> later update.
>
> **2.1 Screen Time functionality:**
> 1. Yes, the app includes Screen Time functionality. It uses the Family Controls
> framework to let users shield their own distracting apps during a focus session.
> 2. Steps to reach it (two ways, the first is unmissable):
> (a) On the main screen just tap "Start Focus." If app blocking is not set up
> yet, the app immediately presents a "Block distractions?" prompt with a
> "Choose apps to block" button, which opens the Screen Time permission prompt
> and then Apple's app picker. There is also an "App blocking: On/Off" button
> directly under the Start Focus button.
> (b) Or tap the "Settings" tab in the bottom bar, then tap "Choose Apps to
> Block while Focusing."
> After granting permission and picking any app, go back, choose a drink size,
> and tap "Start Focus." The chosen app is then shielded by Screen Time until
> the session is paused or finished. Blocking is optional; sessions work
> without it.
>
> Thank you again, and please let us know if anything else is needed.

---

## UPDATED REVIEW NOTES (replace the App Review Information > Notes field)

> Thanks for reviewing! No account or sign-in is needed for anything below.
> This app is iPhone only.
>
> SCREEN TIME / APP BLOCKING (Family Controls): the app uses the Family Controls
> entitlement. Fastest demo: on the main screen tap "Start Focus" and the app
> immediately shows a "Block distractions?" prompt > tap "Choose apps to block"
> > allow the Screen Time permission prompt > pick any app > the session starts
> with that app shielded. There is also an "App blocking: On/Off" button under
> the Start Focus button, and the same picker lives at the "Settings" tab
> (bottom bar) > "Choose Apps to Block while Focusing." The shield lifts when
> you pause or finish. Blocking is optional; sessions work without it.
>
> LIVE ACTIVITY: start a focus session and lock the phone. The countdown appears
> on the Lock Screen / Dynamic Island.
>
> IN-APP PURCHASES: 6 non-consumable cosmetics ($1.99 each). In the Shop tab they
> appear as the skins "Black Tea," "Magical Taste," "Holy Moly," and "Evil Brew,"
> plus the backgrounds "Frosted Milk Tea" and "Taro Galaxy." (These map to the
> App Store Connect products Ninja/Wizard/Angel/Devil Skin and Winter Cocoa/
> Galaxy Dream Background.) Restore Purchases is at the "Settings" tab >
> Purchases > Restore.
>
> STUDY SQUAD: optional social feature using an anonymous account (no email or
> phone collected). Account deletion is at the "Settings" tab.
>
> MAP: uses location (permission prompt) to show nearby bubble tea shops from
> OpenStreetMap data.

---

## THE STEPS (in order)

1. **Support URL** — App Store Connect > App Information (or the version's General
   area) > Support URL > set to:
   `https://melchi-1234.github.io/Mr.-Tapioca/support.html`

2. **Build 5 in Xcode** — the iPhone-only change is already in the project.
   Bump build number to 5, Archive, upload (same flow as Build 4).

3. **Attach the build + IAPs** — on the 1.0 version page, add Build 5. Then, when
   you press "Add for Review," the submission summary lets you add items: add all
   6 In-App Purchases to the submission so they review together with the build.
   (This is the step that was missed last time — the IAPs must be IN the
   submission, not just "Ready to Submit" on their own.)

4. **Review Notes** — paste the updated notes above into App Review Information.

5. **Reply to Apple** — paste the reply message above into the message thread.

6. **Resubmit for Review.**
