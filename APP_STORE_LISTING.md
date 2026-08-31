# Mr. Tapioca: App Store Submission Kit (v1.0)

Everything to paste into App Store Connect, in order. Copy blocks are fenced so nothing weird sneaks in when copying. Character counts were machine-checked, not eyeballed. No em-dashes anywhere in this file, on purpose.

---

## 1. App Name (30 character limit)

| Option | Name | Count |
|---|---|---|
| **A (recommended)** | `Mr. Tapioca: Boba Focus Timer` | 29/30 |
| B | `Mr. Tapioca: Boba Study Timer` | 29/30 |
| C | `Mr. Tapioca: Focus App Blocker` | 30/30 |

Why A: it carries the three strongest search words (boba, focus, timer) and says exactly what the app is. B trades "focus" for "study" if we ever want to lean harder into students. C is the aggressive ASO play (people search "app blocker" a lot) but drops "boba", which is kind of the whole personality.

The keywords line in section 5 assumes option A. If you pick C instead, see the swap note there.

---

## 2. Subtitle (30 character limit)

| Option | Subtitle | Count |
|---|---|---|
| **A (recommended)** | `Block apps. Brew a drink.` | 25/30 |
| B | `The cozy study app blocker` | 26/30 |
| C | `App blocking, but make it cozy` | 30/30 |

All three avoid repeating words from name option A, so they add fresh search terms (block, apps, brew, drink, cozy, study, blocker). Pairing note: if you go with name C, don't use subtitle B (it would double up "app blocker"); A or C pair fine.

---

## 3. Promotional Text (170 character limit)

This one you can change anytime without a new build, so don't agonize.

**Option A (166/170):**

```text
Pick a drink, hit start, and your distracting apps stay blocked while Mr. Tapioca brews your boba. Finish the session, earn the drink. Free, no ads, no subscriptions.
```

**Option B (162/170):**

```text
A cozy focus timer with real app blocking, a Lock Screen countdown, and a little pearl guy who is very proud of you. Made by a college student and his girlfriend.
```

---

## 4. Description (4,000 char limit; this is 1,881)

```text
Your phone has a tiny boba shop in it now. The guy who runs it is a round tapioca pearl, and he would really love it if you put your phone down for a bit.

Mr. Tapioca is a cozy focus timer. Pick a drink size (a 5 minute taste, a 2 hour small, a 6 hour large, or a custom brew), start the session, and he brews your boba while you work. Finish and the drink goes in your collection. Big drinks are resumable, so you can chip away at a large across a few study sessions.

The part that keeps you honest: real app blocking. Mr. Tapioca uses Apple's Screen Time technology to shield your distracting apps while you focus. Pick them once, and during a session they are simply unavailable. Focus with blocking on and you earn full pearls. Skip it and you earn half. Your call, no judgment. (Some judgment.)

What's inside:

- A drink collection with bases, toppings, and multi-session drinks
- Real app blocking, not just a guilt trip
- Live Activity countdown on your Lock Screen and Dynamic Island
- Pearls, about 4 per focused hour, to spend on skins, toppings, and shop backgrounds
- A boba map with actual bubble tea shops near you
- Study Squad: share a code, see friends focusing live, keep streaks together (optional)
- Break games between sessions: Catch the Pearls, Boba Plinko, Cup Pong
- Daily quests, achievements, and streaks with streak freezes
- Lo-fi generative music and ambient soundscapes

I'm Melchior. I'm a college student, this is my first app, and I built it with my girlfriend Dasha because every focus app we tried was either a spreadsheet with a timer attached or a subscription in a trench coat. A few extra skins and backgrounds are small one-time purchases if you ever feel like supporting us. Everything else you earn by focusing.

Free to download. No ads. No subscriptions. No tracking. Just you, a proud little pearl, and the thing you've been putting off.
```

Note: no dollar amounts in the description on purpose. Apple discourages specific prices in metadata (they vary by region), so the IAP price lives in the IAP listings and the review notes, not here.

---

## 5. Keywords (100 character limit, one line)

```text
study,pomodoro,app,blocker,screen,time,bubble,tea,cute,cozy,adhd,flow,habit,streak,widget,exam,lofi
```

**Count: 99/100.** Rules followed:

- No spaces after commas (spaces waste characters).
- No words repeated from name option A (mr, tapioca, boba, focus, timer). Search already indexes the name, so repeating it here throws characters away. "time" is fine; it is a different word than "timer" and we need it for "screen time".
- Apple combines terms across commas, so `app,blocker` matches "app blocker" and `bubble,tea` matches "bubble tea" without spending a space.
- No "free", no plurals of words already present; Apple ignores or dedupes those.

**If you pick name option C** ("Focus App Blocker"): drop `app,blocker` (now in the name) and use this instead, 97/100:

```text
study,pomodoro,screen,time,bubble,tea,cute,cozy,adhd,flow,habit,streak,widget,exam,lofi,deep,work
```

---

## 6. Category

- **Primary: Productivity.** It is a focus timer and app blocker; that is the job people download it for, and it is where the focus/study/blocker search traffic lives.
- **Secondary: Lifestyle.** The cozy half (collection, character, boba map) fits Lifestyle. Not Games: the minigames are between-session garnish, and filing under Games would set the wrong expectations for both users and reviewers.

---

## 7. Age Rating Questionnaire (expected answers)

| Question | Answer |
|---|---|
| Cartoon or Fantasy Violence | None |
| Realistic Violence | None |
| Prolonged Graphic or Sadistic Realistic Violence | None |
| Profanity or Crude Humor | None |
| Mature/Suggestive Themes | None |
| Horror/Fear Themes | None |
| Medical/Treatment Information | None |
| Alcohol, Tobacco, or Drug Use or References | None |
| Simulated Gambling | None |
| Sexual Content or Nudity | None |
| Graphic Sexual Content and Nudity | None |
| Contests | None |
| Unrestricted Web Access | No |
| Gambling with Real Money | No |
| Made for Kids category | No (do not opt in) |

**Expected result: 4+.**

A few clarifications in case a question gives you pause:

- Boba Plinko is an arcade minigame. Nothing is wagered, pearls are never staked, so "Simulated Gambling" is honestly None.
- There is no in-app browser. The map renders OpenStreetMap data inside the app, so "Unrestricted Web Access" is No.
- If the newer questionnaire asks about user-generated content or user communication: Study Squad shows display names inside private invite-code groups only. No chat, no public feed, no content sharing. Still 4+.

---

## 8. App Privacy (questionnaire answers)

**"Do you or your third-party partners collect data from this app?"** Yes. On iOS the app
collects more than the map query, and it is NOT gated on Study Squad. At first launch it creates
an anonymous cloud account (verified: squad-cloud.js defaults a fresh install to an active account,
and boot runs `signInAnonymously()` + pushes a profile), and the drink counter (metrics.js, on
because config.js carries the Supabase keys) sends a row on every finished drink. Declare all of
the below. Nothing is used for tracking.

### Data types to declare

**1. Identifiers > User ID** — the anonymous Supabase account id (plus its 6-char friend code), shared by Study Squad and partner rewards.
- Collected: Yes. Created automatically at first launch (default), NOT only when Study Squad is used. Absent only if the user deletes the cloud account.
- Purpose: App Functionality
- Linked to identity: **Yes** (it is the account id) / Tracking: **No**

**2. Identifiers > Device ID** — the drink counter's random per-install id (metrics.js `device`, localStorage `bobaMetricsDevice`).
- Collected: Yes, on every finished drink.
- Purpose: Analytics (counting how many drinks the app has brewed)
- Linked to identity: **No** (its row carries no name or account) / Tracking: **No**

**3. Usage Data > Product Interaction**
- Collected: Yes. (a) The drink counter sends size + minutes + platform on every finished drink (unlinked, Analytics). (b) The Study Squad profile sends focus minutes, minutes focused this calendar week, drinks, streak, skin (linked to the account). (c) Partner rewards send planned session minutes, platform, blocking-on flags, session start/stop timing, the chosen partner shop, and the moment a reward was used (linked to the account). (d) **New in 1.2.0:** if and only if the user turns on "Let friends see when I'm brewing", the profile also carries a live status of focusing / break / idle and the time it last changed. It is OPT-IN and **off by default**; while it is off the record stores "idle" and no timing.
- Purpose: App Functionality + Analytics
- Linked to identity: **Yes** (App Store Connect takes one linked answer per type; the squad + reward portions tie it to the account) / Tracking: **No**

**4. User Content** — the chosen display name (`bobaFocusName`, or the literal "You" if unset), pushed to the account profile at first launch by default.
- Collected: Yes. Can contain a real first name; usually left as "You".
- Purpose: App Functionality
- Linked to identity: **Yes** / Tracking: **No**
- (Conservative alternative: Contact Info > Name. User Content is the better fit for a chosen display handle.)
- Account deletion is available in-app (Settings > Delete account), which Apple requires whenever account creation exists. It removes the cloud data.

**5. Location > Precise Location**
- Collected: Yes, only if the user opens the Boba Map AND grants permission. Coordinates go to third-party OpenStreetMap/Overpass services to find nearby shops; never sent to our backend, cached only on-device.
- Purpose: App Functionality
- Linked to identity: **No** / Tracking: **No**

**6. Purchases > Purchase History** — answer **Not collected**.
- The six cosmetic IAPs are pure Apple StoreKit 2. No purchase, transaction, receipt, or Apple ID is ever sent to our backend. Apple handles it under its own terms.

**7. Presence — declared under Usage Data > Product Interaction above, not as its own type.**
- New in 1.2.0. Apple has no "presence" data type; a focusing/break/idle flag with a timestamp is
  Product Interaction, and it is linked to the account, so it rides on entry 3.
- It is opt-in and off by default, but the App Privacy questionnaire asks whether data CAN be
  collected, not whether it usually is. Answer yes.
- Matching disclosure lives in privacy.html section 2 and in ios/App/App/PrivacyInfo.xcprivacy
  (NSPrivacyCollectedDataTypeProductInteraction). All three have to agree.

### The big one

**"Do you or your third-party partners use data for tracking?" No.** No third-party ads, no ad SDKs, no analytics brokers, no IDFA, no data sold, ever. There is no "Data Used to Track You" section.

### How the label reads on the product page

- **Data Linked to You:** User ID, User Content (display name), Usage Data.
- **Data Not Linked to You:** Device ID, Usage Data (the drink-counter portion), Precise Location.
- **No "Data Used to Track You" section.**

⚠️ Updated Aug 29 2026 for 1.2.0: opt-in Study Squad presence and the weekly leaderboard total were
added to entry 3, and the handoff redemption code was removed from it (1.2.0 deleted the code
entirely; redemption is now one authenticated tap, so no code is minted, stored or transmitted).

⚠️ Rewritten Aug 25 2026 after a verified data-flow audit. The earlier version was WRONG: it omitted
the drink counter (Device ID + Usage Data, on by default) and claimed the account, display name, and
stats are collected "only if the user opts into Study Squad." They are created and pushed at first
launch by default (verified in squad-cloud.js + app.js boot). Do not restore the "only a map query" framing.

---

## 9. App Review Notes (paste into the Notes box)

```text
Hi! First submission, small student project. Thank you for reviewing. Everything below can be tested without any account or login.

1) APP BLOCKING (the main feature). The app uses the Family Controls / Screen Time entitlement (distribution entitlement approved for this bundle ID). It requires a physical device and shows the standard iOS Screen Time permission prompt on first use. Demo path: Settings > "Choose apps to block" > approve the permission prompt > pick any app (Safari works) > go back > Start Focus with any drink size. Open the chosen app: it now shows the Screen Time shield. End the session and it unblocks immediately. Blocking is optional; sessions without it simply earn half pearls instead of full.

2) LIVE ACTIVITY. Start a focus session, then lock the device. The countdown appears on the Lock Screen, and in the Dynamic Island on supported devices.

3) IN-APP PURCHASES. Six non-consumable cosmetics at $1.99 each: Ninja, Wizard, Angel, and Devil (character skins), plus Winter Cocoa and Galaxy Dream (shop backgrounds). No subscriptions, no consumables, no paywalled functionality; all purchases are purely cosmetic. Restore Purchases is in Settings > Purchases > Restore.

4) STUDY SQUAD. Optional social feature. The whole app works offline with no account. Enabling cloud sync creates an anonymous account (no email or password); account deletion is in Settings and removes all cloud data.

5) LOCATION. Used only by the boba map tab to show nearby bubble tea shops (OpenStreetMap data). The app is fully functional if location permission is denied.

Contact: mrtapioca.app@gmail.com
```

---

## 10. URLs

App Store Connect wants real http(s) URLs here (it will not accept a mailto: in the URL fields), so the plan is one small GitHub Pages site.

| Field | Value (placeholder until Pages is live) |
|---|---|
| Privacy Policy URL (required) | `https://YOUR-GITHUB-USERNAME.github.io/mr-tapioca/privacy.html` |
| Support URL (required) | `https://YOUR-GITHUB-USERNAME.github.io/mr-tapioca/` |
| Marketing URL (optional) | same as Support URL, or leave blank for 1.0 |

Notes:

- `privacy.html` already ships in this repo. It just needs a public URL before submission. Fastest path: push the repo (or a tiny site folder) to a public GitHub repo, then repo Settings > Pages > Deploy from branch. Takes about two minutes.
- Put the support contact on that page as a mailto link: `mailto:mrtapioca.app@gmail.com`. The page satisfies the URL field; the mailto satisfies actual humans.

---

## 11. What's New in 1.2.0 ("Brew Together")

```text
One tap at the counter. Your partner reward used to make you wait for a code and read it out to the cashier. Now the card shows the shop and the perk instantly, you tap once, and it stamps itself. Your progress toward the next real reward shows on the finish screen and in Settings too, instead of being buried in the map.

Pomodoro. A third timer preset that runs work and breaks back to back inside one session. Your blocked apps stay locked through the breaks, so a five minute rest is a rest and not an escape hatch.

Study Squad went live. Turn on "let friends see when I'm brewing" and your squad can see you studying right now, and you can see them. The leaderboard resets every Monday, so a bad week is only ever a week. And sharing your code finally sends a real link your friend can just tap.

Your week in boba. A share card with your hours, your best day, your streak and the shape of your week.

He reacts now. End a session and your little guy is genuinely sad about the drink. Not about you.

Seasonal flavours. Pumpkin spice, peppermint mocha, cherry blossom and a finals week espresso, each around for its own part of the year and yours forever once you unlock one. Plus a weekly quest and seven new badges.

Thanks for using this thing. Email me if anything breaks.
```

(1,283 characters, limit is 4,000.)

⚠️ **No 🧋 in this field.** App Store Connect rejects the bubble tea emoji in
"What's New in This Version" outright: `ENTITY_ERROR.ATTRIBUTE.INVALID.INVALID_CHARACTERS`,
naming U+1F9CB. It is fine in the description and in the promo text; it is only this field.
Verified against the live API on 2026-08-29 while publishing 1.2.0.

### What's New in 1.0 (kept for reference)

```text
Mr. Tapioca 1.0 is here! This is the very first version, so everything is new: the timer, the real app blocking, the pearls, the boba map, the little guy himself. If something breaks, email me and I will fix it between classes. Now go start a drink. 🧋
```

---

## Last-mile checklist before hitting Submit

### 1.2.0 / build 14 only

- [x] **App Groups enabled on `com.melchior.mrtapioca.FocusWidget`** — done Aug 30 2026. See the
      three-part playbook in CLAUDE.md before adding another extension that needs one.
- [x] **App Privacy answers: NO CHANGE NEEDED, verified.** Presence and the weekly total are both
      Usage Data > Product Interaction, linked to the account, not tracking, which is exactly what
      entry 3 above already declares and what Apple already approved for build 12. Removing the
      redemption code does not retire a type either. The SET of declared data types is identical, so
      there is nothing to re-answer in App Store Connect. (Section 8's wording was updated so the repo
      still describes reality; the questionnaire itself does not move.)
- [x] **The widget verified end to end on an iOS 26 Simulator** — renders on a real Home Screen, reads
      the App Group, says "Reward progress syncing" rather than a fabricated 0 when Reward V2 has not
      synced, and `mrtapioca://start` opens the app into the start-focus flow.
- [ ] **A Pomodoro cycle on a REAL iPhone with apps blocked.** This is the one gate a Simulator cannot
      stand in for: Screen Time does not work there at all. What must hold is that the blocked apps stay
      locked THROUGH a five-minute break and free themselves only at the very end of the cycle.
- [ ] Presence checked with a second account: off by default, and turning it off clears it

### Every build

- [ ] Family Controls **distribution** entitlement approved by Apple for this App ID (blocking will not pass review without it)
- [ ] All 6 IAPs created in App Store Connect, named to match the in-app shop, and attached to the 1.0 version
- [ ] GitHub Pages live, privacy + support URLs actually resolve
- [ ] Screenshots: 6.9" and 6.5" iPhone sets (brewing screen, the shield in action, map, squad, shop)
- [ ] Age rating saved (4+), privacy answers saved, review notes pasted

---

*Char counts in this file were verified by script on 2026-07-02: names and subtitles all fit 30, promos fit 170, keywords line is 99/100, description is 1,881 of 4,000, and the file contains zero em-dashes.*
