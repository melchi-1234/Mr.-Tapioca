# Mr. Tapioca Roadmap

> **Status note (2026-08-04): this is now mostly a historical document.**
> Phases 1 through 5 are **done and shipped** — the app is live on the App Store
> (https://apps.apple.com/app/id6786023560) and on the web at https://mrtapioca.me.
> Two things below did not land the way they were planned:
> - **Phase 2 was built with Capacitor, not SwiftUI.** The web app is the app; it is
>   wrapped natively, with custom Swift plugins only for Screen Time blocking, the
>   Live Activity, and StoreKit purchases.
> - **Step 3, the spill mechanic, was built and then removed.** Leaving mid-session
>   now pauses and banks your progress instead, because long drinks are meant to be
>   filled across several sittings.
>
> **Phase 6 (boba shop partnerships) is the one section still genuinely ahead.**
> Everything above it is kept for context, not as a to-do list.

## Prototype build order

These were the features built into the web prototype, in order. All shipped.

### Step 1: Break timer mode
After you finish a focus session and your drink is complete, a short break timer kicks in before your next session starts. This gives you a proper rest period and makes the app feel like a full study routine, not just a one-shot timer.

### Step 2: Tapioca currency shop
You earn tapioca pearls as you study, and you can actually spend them in a shop to unlock customizations like new cup colors, apron styles, and shop decorations. Right now the pearl count goes up but does nothing — this step makes it a real in-game economy.

### Step 3: Spill mechanic
If you quit or abandon a focus session early, your boba drink dramatically spills and the session is lost. This is the core "consequence" that keeps you honest, like how your tree dies in Forest if you leave.

### Step 4: Mini game — Catch the Pearls
A simple break-time game where tapioca pearls fall from the top of the screen and you tap or move the cup to catch them. Earn bonus tapioca currency for good catches. Gives you something fun to do during your break without pulling you away from the app.

### Step 5: Mini game — Boba Plinko
A second break-time game where you drop a pearl down a Plinko-style board and it bounces into prize slots at the bottom. Each slot gives you a different tapioca reward. Adds variety to the break experience so it doesn't feel repetitive.

### Step 6: Polish pass
A full review of everything — smoother animations, tighter sounds, better transitions between states, and any small visual fixes that make the app feel finished and delightful rather than prototype-rough.

---

## Phase 2: Turn the prototype into an iPhone app

Goal: rebuild the proven experience in SwiftUI (Apple's language for building iPhone apps).

Needed tools:

- A Mac.
- Xcode from the Mac App Store.
- An Apple ID.

Core screens:

- Focus.
- Boba Maker / Shop.
- Drink Shelf.
- Treat Jar.
- Settings.

Maker ideas:

- Customize the maker's apron, hair, outfit, and shop counter.
- Show the maker preparing the drink while focus time fills the cup.
- Add small idle animations, mixing animations, and reward celebrations.
- Unlock shop decorations through streaks and total study time.
- Let finished drinks appear on the shop shelf.
- Use non-consumable in-app purchases for premium digital cosmetics in the future.

## Phase 3: Add real focus restrictions

Goal: make the app actually block selected distracting apps during a focus session (this only works on a real iPhone, not a website).

Likely Apple frameworks:

- FamilyControls: asks permission and lets the user choose apps.
- ManagedSettings: shields selected apps.
- DeviceActivity: manages focus activity windows.

First native version:

- Ask for Screen Time permission.
- Let users pick apps to block.
- Start the boba timer.
- Shield selected apps until the timer ends.
- Unshield apps when the session completes or is cancelled.

## Phase 4: Beta test

Goal: let friends and early users try it before launch.

- Create an Apple Developer account.
- Add the app to App Store Connect.
- Upload a build from Xcode.
- Invite testers through TestFlight.
- Watch where people get confused.
- Improve the app before launch.

## Phase 5: App Store launch

Goal: publish a simple, polished first version.

Needed:

- App name.
- App icon.
- Screenshots.
- Privacy details.
- Age rating.
- App review notes.
- Support URL.
- Marketing URL if needed.

## Phase 6: Boba shop partnerships

Goal: add real-world rewards after the app has traction.

Start small:

- Local boba shops near colleges.
- Finals week promos.
- Student discount codes.
- "Study Sip Pass" reward cards.

Pitch:

"Mr. Tapioca helps students complete protected study sessions. After they finish, they can unlock a treat card that sends them to a nearby boba shop."
