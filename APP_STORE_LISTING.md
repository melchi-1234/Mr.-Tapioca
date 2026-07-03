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

**"Do you or your third-party partners collect data from this app?"** Yes (location queries for the map; Study Squad data only if the user turns it on).

### Data types to declare

**1. Location > Precise Location**
- Collected: Yes (coordinates are sent off-device to fetch nearby boba shops)
- Purpose: App Functionality (the nearby shop map)
- Linked to the user's identity: **No**
- Used for tracking: **No**

**2. User Content (display name + focus stats), only when Study Squad cloud sync is enabled**
- Collected: Yes, but only if the user opts into Study Squad cloud
- What: chosen display name, focus session stats (minutes, streaks, currently-focusing status)
- Purpose: App Functionality (showing squad members each other's progress)
- Linked to the user's identity: **Yes**, linked to an anonymous account id (no email, phone, or real name is ever required)
- Used for tracking: **No**
- Account deletion is available in-app (Settings), which Apple requires whenever account creation exists. It removes the cloud data.

**3. Identifiers > User ID (the anonymous account id itself), same condition as above**
- Collected: Yes, only with Study Squad cloud
- Purpose: App Functionality
- Linked: Yes (it is the account id) / Tracking: **No**

**4. Purchases > Purchase History**
- Purchases are processed entirely by Apple's In-App Purchase system; we never see payment details and run no purchase server.
- If declaring: Purpose: App Functionality, Linked: No, Tracking: No.

### The big one

**"Do you or your third-party partners use data for tracking?" No.** No third-party ads, no ad SDKs, no analytics brokers, no data sold, ever.

### How the label should read on the product page

- **Data Not Linked to You:** Precise Location, Purchase History
- **Data Linked to You** (only if Study Squad cloud is enabled): User Content, User ID
- **No "Data Used to Track You" section at all.**

If someone never touches Study Squad cloud, the only thing the app ever sends anywhere is a map query.

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

## 11. What's New in 1.0

```text
Mr. Tapioca 1.0 is here! This is the very first version, so everything is new: the timer, the real app blocking, the pearls, the boba map, the little guy himself. If something breaks, email me and I will fix it between classes. Now go start a drink. 🧋
```

(251 characters, limit is 4,000. Short is fine for a 1.0.)

---

## Last-mile checklist before hitting Submit

- [ ] Family Controls **distribution** entitlement approved by Apple for this App ID (blocking will not pass review without it)
- [ ] All 6 IAPs created in App Store Connect, named to match the in-app shop, and attached to the 1.0 version
- [ ] GitHub Pages live, privacy + support URLs actually resolve
- [ ] Screenshots: 6.9" and 6.5" iPhone sets (brewing screen, the shield in action, map, squad, shop)
- [ ] Age rating saved (4+), privacy answers saved, review notes pasted

---

*Char counts in this file were verified by script on 2026-07-02: names and subtitles all fit 30, promos fit 170, keywords line is 99/100, description is 1,881 of 4,000, and the file contains zero em-dashes.*
