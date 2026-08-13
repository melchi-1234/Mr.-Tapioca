# App Store materials that match the code (Network V1)

**Status:** proposed replacement copy. Nothing here has been pasted into App Store
Connect and nothing in the repo was edited to produce it.

**What this replaces:** `APP_STORE_LISTING.md` (headed "v1.0", written 2026-07-02)
and the store-facing half of `privacy.html` (dated June 29, 2026). Both predate
`metrics.js`, both predate the two partner shops, and both describe a four-size
timer the app no longer has.

**Why it exists:** `docs/network-v1/GROUNDING.md` §8 lists 20 claims that are false
against the shipped code. Seven of them are in store metadata or the privacy policy,
which is the one category where being wrong is a review risk and not just bad copy.
`GROUNDING.md` §9 D8 ranks it Tier 2: "This is an App Store review-risk surface, not
marketing copy."

Every factual claim below was re-verified against the code by reading it, not by
trusting GROUNDING. The verification log is at the end.

**Line numbers were verified against the tree on 2026-08-13, and the tree is moving.**
Other Network V1 work is landing in parallel; `squad-cloud.js` gained seven lines
partway through this document being written, and `config.js` gained a feature-flag
block. Every citation here was re-checked after those landed. Treat a citation that
does not match what you see as drift, not as a claim, and re-grep before acting on it.
The behavioural facts (what is sent, when, and by which module) were re-confirmed last;
see §5.1 for the two modules that landed and what they would change.

**A second pass on 2026-08-13 re-read every cited line and fixed what it found.** One
claim was wrong about behaviour, not just about a line number: the web build does
render a price button on locked premium tiles, and §1 frame 5 said it renders none.
Four citations were off by a line or by one line of a range (the redeem CSS, the
`partners.json` quote, the premium-backgrounds range, and the review-notes character
count), one network path was missing from a table headed "complete" (§5.1 row 6), and
two staleness figures inherited from `GROUNDING.md` §7 had moved. Nothing in §2's copy
blocks changed except the one shop name in §4.

**`app.js` was then edited by parallel work while this pass was running, and most
line numbers in it moved.** It is 6,656 lines as of its 00:23 mtime on 2026-08-13.
The first thousand lines held (`CUSTOM_MIN` is still `:6`, `REWARD_UNBLOCKED_FRACTION`
still `:129`, `currentPearls()` still `:900`); everything after shifted by roughly 22
to 37 lines. The telemetry call site went `:2365` to `:2393`, the Squad board render
`:5229-5241` to `:5266-5278`, the launch-time `SquadCloud.init()` block `:6443-6447`
to `:6479-6483`. **All 35 `app.js` citations in this document were re-anchored against
the 00:23 tree**, each one located by its surrounding code rather than by adding an
offset, because the offset is not uniform. `index.html`, `styles.css`,
`squad-cloud.js`, `metrics.js`, `config.js` and `partners.json` were re-checked at the
same moment and none of their cited lines had moved.

Two things follow, and the second is the important one. Every `app.js` number here is
correct as of 00:23 and will be wrong again the next time somebody inserts a function,
so **check the quoted code, not the number**: each citation names what should be on
that line. And nothing in the privacy answers depends on a line number. What is sent,
by which module, and under what condition are the load-bearing facts, and those did
not change across either edit.

**Rules this copy follows**

- No em-dashes in anything written here (house style, `CLAUDE.md`). Exactly one
  em-dash survives in this file, at §6.1 row 1, and it is inside a verbatim quote of
  live `privacy.html` copy. Removing it would stop that row being a quote, which is
  the whole point of the "Current wording" column. Machine-checked: one hit for
  U+2014 in this file, on that line.
- Character counts are machine-counted, not eyeballed. Counts are shown per block.
- No claim of fraud prevention, merchant ROI, revenue, incremental sales, average
  order value, first-time visitors, or "verified study time". `GROUNDING.md` §8
  items 1, 2 and 3 establish that the code cannot support any of them.
- Perk wording and numbers come from `partners.json` only. Never invented.
- No claim of live Squad presence. The status pipeline is inert (§6 of GROUNDING,
  re-verified below).

---

## 0. The three facts that drive every rewrite

Read these first, because most of the copy changes follow from them.

**Fact 1. The app is not offline-only, and never was after `metrics.js` shipped.**
`metrics.js:46` POSTs `{device, size, minutes, platform}` to `drink_events` on every
finished session, fired from `app.js:2393`. `device` is a persistent per-install
UUID minted at `metrics.js:23-33` under key `bobaMetricsDevice`. This runs whenever
`config.js` has keys, and `config.js:10-13` has them. `metrics.js:9-10` flags its own
consequence: "The iOS privacy label must declare Usage Data (not linked to identity)
on the next submission."

**Fact 2. The anonymous account is created at launch, not on opt-in.**
`app.js:6479-6483`, quoted verbatim including the inline comment on `:6481`:

```js
if (window.SquadCloud && SquadCloud.enabled) {
  const delRow = document.querySelector("#deleteAccountRow");
  if (delRow) delRow.classList.remove("hidden");   // account deletion is reachable when cloud is on
  SquadCloud.init();
}
```

`SquadCloud.enabled` is `!!(CLOUD.url && CLOUD.anonKey)` (`squad-cloud.js:10`), which
is true. `init()` calls `ensureAuth()` (`squad-cloud.js:48`), which calls
`sb.auth.signInAnonymously()` (`squad-cloud.js:39`), then pushes a profile row
(`squad-cloud.js:52`) before the user has opened anything. There is no toggle: grep
of `app.js` and `index.html` for `optIn|consent|squadToggle|cloudEnabled|useCloud`
returns nothing.

**Fact 3. The partner reward is real, small, and local.**
Two shops, both in Ithaca, both at 240 cumulative minutes, verbatim from
`partners.json:27-44`:

| id | name | address | perk | minMinutes | since |
|---|---|---|---|---|---|
| `u-tea-collegetown` | U Tea | 205 Dryden Rd, Collegetown | 10% off your drink | 240 | 2026-08-09 |
| `dream-tea-poke-ithaca` | Dream Tea & Poké | 130 E Seneca St, Ithaca | 5% off your drink | 240 | 2026-08-10 |

Both perks are percentage discounts, not free drinks. Both shops are in one town.
Any copy that says "earn real boba" without a scope is promising a free drink to a
user in another city. That shapes several decisions below.

---

## 1. Screenshot storyboard

Six frames, in order. The caption is the text burned into the image. The subcaption
is the smaller line under it, and it is where the honesty work happens: several of
these headline captions are true only because the subcaption scopes them.

### Global capture rules (read before frame 1)

1. **Sync the native bundle first, or you will screenshot the Aug 9 app.**
   `GROUNDING.md` §7 measured `ios/App/App/public` as three days stale and named
   root `sw.js` as `v185`. Both numbers have moved since, and the gap only widens
   while nobody syncs, so re-measure rather than quoting either figure. Measured on
   2026-08-13: staged `ios/App/App/public/app.js` and `sw.js` are still Aug 9 16:48
   against a root `app.js` of Aug 12 20:55, which is **four days**, and root `sw.js:10`
   is now `mr-tapioca-v186` against a staged `v181`. Run
   `npm run copyweb && npx cap copy ios && node tools/register-ios-plugins.mjs`
   before building the capture build.
2. **Capture on device or Simulator at the real pixel size.** The repo's QA harness
   renders at 375x812 CSS pixels, which is correct for visual QC and far too small
   for store assets. `APP_STORE_LISTING.md:234` names 6.9" and 6.5" iPhone sets;
   confirm the currently required set in App Store Connect before capturing, because
   that line was written in July 2026.
3. **Frame 2 needs a physical iPhone.** Family Controls does not shield anything in
   the Simulator, so the shield shot cannot be faked or simulated.
4. **If you capture from the web build, clear service workers AND caches first, then
   navigate twice.** One reload serves you a stale `app.js` (`CLAUDE.md` gotcha 2).
5. **Never burn a perk number into caption text.** Screenshots are version metadata;
   changing them means a new version submission. `partners.json` changes in a minute.
   If a percentage appears in a shot, it must appear as app UI rendered from the live
   file, so an outdated shot is a stale screenshot rather than a false promise. This
   is the same reason the description below does not name the percentages either.
6. **Seeding trap, and it is not reversible.** Several frames need a populated state.
   Seeding `bobaFocusCollection` calls `saveState()` on the next write, which ends at
   `app.js:815` with `SquadCloud.pushProfile()`, which pushes `focus_minutes` through
   `set_my_profile`. That value is monotonic in the database
   (`supabase-setup.sql:214-217`, `least(greatest(p_focus_minutes, v_fm), v_fm + 1440)`),
   so **fabricated minutes can never be lowered again** on that account. Seed only on
   a scratch browser profile or a fresh Simulator, or delete the account afterwards
   via Settings > Delete account.
7. Well-formed seed drink (a bare `{minutes: N}` boots into a crash at
   `keyToOrdinal`, `app.js:1080-1083`, because `dateKey` is missing):

   ```js
   localStorage.setItem("bobaFocusCollection", JSON.stringify([
     { id: "seed-1", name: "Brown Sugar Milk Tea", size: "Custom Cup",
       color: "#8b4513", minutes: 240, sticker: null, dateKey: "2026-08-12" }
   ]));
   localStorage.setItem("bobaFocusOnboarded", "true");
   localStorage.setItem("bobaFocusTourDone", "1");
   ```

---

### Frame 1

**Caption:** `STUDY. EARN REAL BOBA.` (22 chars)
**Subcaption:** `Real discounts at partner boba shops.` (37 chars)

**What must be on screen:** the home screen with a session running. Mr. Tapioca in
his `mixing` pose, the cup roughly 60% filled, the timer showing a real remaining
time (not 00:00, not a dev-mode 5-second cup), and the pearl and streak chips
populated. The Custom / Goal picker visible at the bottom.

**How to capture:** seed as above, start a 60-minute Custom Cup, wait until the cup
fill is unmistakably partial, screenshot.

**Caption honesty flag.** "EARN REAL BOBA" reads as a free drink, and both live
perks are percentage discounts (10% and 5%). The subcaption is what keeps the frame
honest, so it is not optional here. If you want the headline itself to carry the
scope, `STUDY. EARN REAL BOBA PERKS.` (28 chars) is the same line without the
implied freebie. Your call, but the frame cannot ship with the headline alone.

---

### Frame 2

**Caption:** `BLOCK DISTRACTING APPS.` (23 chars)
**Subcaption:** `Apple Screen Time shields them until you finish.` (48 chars)

**What must be on screen:** the app's own blocking surface as the main image, with
the real iOS shield as a smaller inset. Main image: the running session with
`#blockPill` reading "App blocking: On" (`index.html:289`, label set at
`app.js:2315`). Inset: an actual Screen Time shield captured from a blocked app.

**How to capture:** physical iPhone. Settings > "Choose Apps to Block while
Focusing" (`index.html:478`), approve the Screen Time prompt, pick an app, start a
session, open that app, screenshot the shield. Then return and screenshot the home
screen with the pill lit.

**Traps:**
- Pick a test app that has **no personal Screen Time limit of its own**. A user
  tapping "Ignore Limit" on their own limit suppresses our shield for the day
  (`CLAUDE.md` gotcha 5), and you will burn an hour thinking the build is broken.
- Do not use the system shield full-bleed as the whole frame. It is Apple's UI, not
  yours, and a screenshot that is mostly system UI invites a metadata question. The
  inset composition shows the payoff while keeping your app the subject.
- `#blockPill` is `hidden` unless the Screen Time plugin is present, so this frame
  cannot be captured from the web build at all.

---

### Frame 3

**Caption:** `FOCUS FILLS YOUR CUP.` (21 chars)
**Subcaption:** `15 minutes to 4 hours. Long ones are resumable.` (47 chars)

**What must be on screen:** the same brewing screen as frame 1 but composed around
the cup, not the character. Ideally a two-state composition: the cup near-empty at
the start and near-full at the end, side by side in one frame.

**How to capture:** start a Custom Cup, screenshot at the beginning, screenshot again
near the end, compose the two.

**Traps:**
- Do not use dev mode's 5-second cup (`DEV_MIN = 5` seconds, `app.js:9`). Its
  `minutes` rounds to 0 (`app.js:2371`), so the shelf entry and the reward card both
  come out wrong, and the fill animation does not read.
- The subcaption numbers are the real bounds: `CUSTOM_MIN = 15 * 60` and
  `CUSTOM_MAX = 240 * 60` (`app.js:6-7`), `GOAL_MIN = 15` / `GOAL_MAX = 240`
  (`app.js:1152-1153`). Do not write "6 hour large" here or anywhere. That size does
  not exist and has not since the two-mode redesign.

---

### Frame 4

**Caption:** `REDEEM AT PARTNER SHOPS.` (24 chars)
**Subcaption:** `Show the card at the counter. No app for them to install.` (57 chars)

**What must be on screen:** the counter card, `#redeemDialog` (`index.html:725-741`),
in its **ready** state. Star icon, the eyebrow "Show this at the counter", the shop
name, the address, the perk chip carrying that shop's exact words from
`partners.json`, the live ticking timestamp, the note "You have 1 reward saved.",
and the "Use one reward" button **enabled**.

**How to capture:** seed 240 minutes as in rule 7, set device location to
42.4415, -76.4849, open the Boba Map tab, allow location, then tap "Show at the
counter" on a starred partner row (`app.js:4916`).

**Traps:**
- Do **not** capture the not-ready state. At a zero balance the card still renders at
  full strength; only the button dims to 45% and the perk chip greys
  (`styles.css:3124-3125`). That state looks almost identical and is the wrong story.
- The shop name, address and perk must be whatever `partners.json` says at capture
  time. Never mock up a shop or a number. If you capture U Tea, the chip must read
  "10% off your drink" because that is what the file says.
- The timestamp bakes the capture date into the asset forever. Set the device date
  and locale sensibly before shooting.
- The partner only appears within 6 km. `withPartners()` skips anything farther
  (`app.js:4651`, `if (haversine(lat, lng, p.lat, p.lng) > radius) continue;`), and
  `loadNearbyShops` passes 6000. Without the location override you will get an empty
  partner list and no button to tap.

---

### Frame 5

**Caption:** `BUILD STREAKS. UNLOCK YOUR STYLE.` (33 chars)
**Subcaption:** `Pearls come from focused time, about 4 an hour.` (47 chars)

**What must be on screen:** the Shop sheet (`#shopSheet`, `index.html:370`) with a
grid of skins and backgrounds, several already owned, the pearl balance chip
populated, and the HUD streak chip (`index.html:232`) showing a real streak number.

**How to capture:** on device, and only on device. `app.js:1722-1725` is a ternary,
not a guard, so both platforms draw a button and the web one is a decoy:

```js
} else if (item.premium && !owned) {
  action = IAP.available()
    ? `<button class="shop-preview-btn" data-iap="${item.id}">✦ ${IAP.prices[item.id] || "$1.99"}</button>`
    : `<button class="shop-preview-btn" data-premium="${item.id}">✦ $1.99</button>`;
```

On device `IAP.available()` is true and the tile carries the real localized StoreKit
price, falling back to `"$1.99"` only if the product ids have not loaded yet. On the
web build it is false and the tile carries a **hardcoded** `✦ $1.99` that is not a
price lookup and not a buy button: it opens a preview
(`app.js:1812-1816`, `showPremiumPreview(item.name, "$1.99")`). That is the reason to
capture on device, and it is a better reason than "the shop looks incomplete", which
is what this rule used to say and which is simply wrong. The web tile looks complete.
It just prints a hardcoded USD string with no storefront behind it, and a screenshot
is version metadata shown on every country's product page, so burning `$1.99` into
one hands a German or Japanese visitor a price the app will never quote them. Capture
the device tiles and let StoreKit fill in the number.

**Traps:**
- The subcaption rate is only true with blocking on. `REWARD_UNBLOCKED_FRACTION = 0.5`
  (`app.js:129`) halves pearls on an unblocked native session, so "about 4 an hour"
  is the blocked rate. The description below carries the qualifier; the subcaption is
  short enough that "about 4 an hour" is acceptable shorthand only because the
  description states the condition. If you drop the qualifier from the description,
  this subcaption becomes a false claim.
- Do not imply pearls buy anything at a real shop. Pearls are cosmetics-only; the
  partner perk is bought with focus minutes, not pearls, and the two currencies are
  unrelated in code (`app.js:900` vs `app.js:4362-4373`).

---

### Frame 6

**Caption:** `STUDY WITH FRIENDS.` (19 chars)
**Subcaption:** `A shared leaderboard. Share a code, compare totals.` (51 chars)

**What must be on screen:** the Study Squad sheet with `#squadBoard` populated, three
or four rows. Each row is exactly: rank number, avatar, display name (with the "YOU"
badge on your own row), cumulative focus total, and a streak count with the flame
icon. That is the complete render (`app.js:5266-5278`).

**How to capture:** two real accounts exchanging friend codes is cleanest. Otherwise
seed `state.friends` on the offline path (`app.js:5262-5263`). Use obviously demo
names.

**This is the frame most likely to ship a false claim, so it gets its own list of
bans.** Presence is not live. It has never been live in any shipped build.

- The board renders no status. `app.js:5259` re-maps server rows to
  `{id, name, mins, drinks, streak, skin, ts, me}` and drops `status` on the floor.
- The value being sent is always the literal string `"idle"`. `mySquadStats()`
  (`app.js:5143-5148`) returns `{name, mins, drinks, streak, skin}` with no `status`
  key, so `squad-cloud.js:81` `p_status: me.status || "idle"` always takes the
  fallback. The producer's own comment says so: "activity presence is deliberately
  NOT broadcast".
- Therefore: **no green dot, no "focusing now", no "on a break", no "Online", no
  pulsing avatar ring, no live-updating anything.** Do not add one in the mockup
  "just for the screenshot". `catch-up.html:168` and `support.html:106` already make
  this claim in prose and both are listed for correction in section 6.
- The given headline "STUDY WITH FRIENDS." is true of a leaderboard, so it stays. If
  you want it even tighter to what the screen shows, `COMPARE FOCUS TOTALS.`
  (21 chars) is unambiguous. A headline like "SEE FRIENDS FOCUSING LIVE" would be
  false and is the exact wording to avoid.

---

## 2. Store copy, with counts

All counts machine-counted. All blocks contain zero em-dashes.

### 2.1 Subtitle (30 character limit)

| Option | Subtitle | Count |
|---|---|---|
| **A (recommended)** | `Block apps. Brew a drink.` | 25/30 |
| B | `Focus timer with app blocking` | 29/30 |
| C | `Cozy focus timer + app blocker` | 30/30 |

**Recommendation: keep A unchanged.** It is the current subtitle
(`APP_STORE_LISTING.md:25`) and, unusually for this file, it contains nothing false.

**Why not put the partner perk in the subtitle.** A subtitle has no room to say
"in Ithaca, New York", and both live shops are in one town. `Block apps. Earn boba
perks.` fits at 28/30 and would be a promise the app cannot keep for a user in
Chicago. Geography-dependent claims belong in promotional text, which can be
rewritten the same day a shop signs or pulls out. B and C are ASO alternatives if
you want the search terms; neither adds a claim.

### 2.2 Promotional text (170 character limit)

Promotional text is the only store field that updates without a new build, which
makes it the correct home for anything tied to `partners.json`. That file is
designed to change in a minute (`partners.json:9`: "the promise made in the pitch:
it comes off the app the day they ask"; the redeploy mechanics are `:5-8` above it).
Description and screenshots cannot keep that pace. Promotional text can.

**Option A (recommended), 150/170:**

```text
Two boba shops in Ithaca, NY now give a real discount for focus you actually put in. Block your apps, brew a drink, then show the card at the counter.
```

**Option B (safe fallback with no geographic claim), 162/170:**

```text
Pick a cup, hit start, and Mr. Tapioca shields your distracting apps while he brews your boba. Finish the session, keep the drink. Free, no ads, no subscriptions.
```

Use A while both shops are live. Switch to B the day the partner list is empty. That
switch takes about a minute and needs no build, which is the whole point of putting
the claim here.

### 2.3 Description (4,000 character limit)

**2,427 / 4,000. Zero em-dashes.**

```text
Your phone has a tiny boba shop in it now. The guy who runs it is a round tapioca pearl, and he would really love it if you put your phone down for a bit.

Mr. Tapioca is a cozy focus timer. Set a Custom Cup anywhere from 15 minutes to 4 hours, or brew your daily Goal Cup, hit start, and he makes your boba while you work. Finish the session and the drink goes on your shelf. Long sessions are resumable, so you can chip away at one across a few sittings.

The part that keeps you honest: real app blocking. Mr. Tapioca uses Apple's Screen Time technology to shield your distracting apps while you focus. Pick them once, and during a session they are simply unavailable. Focus with blocking on and you earn full pearls. Skip it and you earn half. Your call, no judgment. (Some judgment.)

Real boba, not just pixels. Mr. Tapioca partners with actual bubble tea shops, and right now that means two shops in Ithaca, New York. Put in four hours of focus, added up across as many sittings as you like, and the app gives you a card to show at the counter. Every shop writes its own offer and the app shows you that shop's exact words. This is a small, real, growing list and not a nationwide rewards program, so the map will tell you plainly when there is no partner shop near you yet.

What's inside:

- A drink collection with tea bases, toppings, and resumable long sessions
- Real app blocking, not just a guilt trip
- Live Activity countdown on your Lock Screen and Dynamic Island
- Pearls, about 4 per focused hour with blocking on, to spend on skins, toppings, and shop backgrounds
- A boba map of real bubble tea shops near you, with a star on the partner ones
- Study Squad: share a code and compare focus totals with friends on a leaderboard. No email, no password
- Break games between sessions: Catch the Pearls, Boba Plinko, Cup Pong
- Daily quests, achievements, and day streaks with streak freezes
- Lo-fi generative music and ambient soundscapes

I'm Melchior. I'm a college student, this is my first app, and I built it with my girlfriend Dasha because every focus app we tried was either a spreadsheet with a timer attached or a subscription in a trench coat. A few extra skins and backgrounds are small one-time purchases if you ever feel like supporting us. Everything else you earn by focusing.

Free to download. No ads. No subscriptions. Just you, a proud little pearl, and the thing you've been putting off.
```

**What changed from the current description, and why:**

| Change | Reason |
|---|---|
| "a 5 minute taste, a 2 hour small, a 6 hour large, or a custom brew" becomes "a Custom Cup anywhere from 15 minutes to 4 hours, or your daily Goal Cup" | `app.js:1-4` defines two modes. `index.html:257-262` renders two buttons. Bounds are 15 to 240 minutes on both paths. The only 5-minute path is `DEV_MIN = 5` **seconds**. |
| "Big drinks are resumable ... chip away at a large" becomes "Long sessions are resumable" | The resumability claim holds (`app.js:661`, `:669-684`). Only the word "large" was wrong. |
| New partner paragraph, scoped to Ithaca, with no percentage named | `partners.json` is the source of truth and moves faster than store metadata. Naming "10%" here would outlive the agreement. |
| "see friends focusing live" becomes "compare focus totals with friends on a leaderboard" | No status is rendered anywhere (`app.js:5259`, `:5266-5278`) and the value sent is always `"idle"` (`squad-cloud.js:81`). |
| "(optional)" dropped from the Study Squad bullet, replaced with "No email, no password" | An anonymous account is created at launch (`app.js:6482`). Following a friend is optional; the account is not. The old wording implied both. |
| "Pearls, about 4 per focused hour" gains "with blocking on" | `REWARD_UNBLOCKED_FRACTION = 0.5` (`app.js:129`) halves the rate on an unblocked native session. |
| "No tracking." removed from the closing line | Defensible under Apple's definition, but the app does send a persistent per-install id with usage data. A claim that needs a footnote does not belong in a closing line. "No ads. No subscriptions." are both plainly true and stay. |

**One maintenance dependency to accept knowingly:** the description names "four
hours". That is `minMinutes: 240` on both shops today, surfaced through
`perkMinMinutes()` (`app.js:4615-4619`), which returns the **minimum** across live
partners. If a third shop ever signs below 240, the global bar drops and this
sentence becomes wrong on the same day. Treat "sign a shop below 240" and "update
the App Store description" as one change, not two. This is `GROUNDING.md` D6.

---

## 3. Caption sheet

The six captions on their own, for whoever builds the images.

| # | Caption (burned in) | Chars | Subcaption | Chars |
|---|---|---|---|---|
| 1 | STUDY. EARN REAL BOBA. | 22 | Real discounts at partner boba shops. | 37 |
| 2 | BLOCK DISTRACTING APPS. | 23 | Apple Screen Time shields them until you finish. | 48 |
| 3 | FOCUS FILLS YOUR CUP. | 21 | 15 minutes to 4 hours. Long ones are resumable. | 47 |
| 4 | REDEEM AT PARTNER SHOPS. | 24 | Show the card at the counter. No app for them to install. | 57 |
| 5 | BUILD STREAKS. UNLOCK YOUR STYLE. | 33 | Pearls come from focused time, about 4 an hour. | 47 |
| 6 | STUDY WITH FRIENDS. | 19 | A shared leaderboard. Share a code, compare totals. | 51 |

Set in Inter, per the design system. No em-dashes. No emoji used as an icon; if a
frame needs a mark, it is an inline SVG at `viewBox="0 0 24 24"`, `fill="none"`,
`stroke="currentColor"`, `stroke-width="2"`, round caps and joins.

**Alternates on file, if a headline needs to be tightened:** frame 1
`STUDY. EARN REAL BOBA PERKS.` (28), frame 6 `COMPARE FOCUS TOTALS.` (21).

---

## 4. App Review notes

Paste-ready. **3,782 characters.** Confirm the field's current limit in App Store
Connect before pasting; it was 4,000 at last check, and this is sized to leave room.

```text
Hi, and thank you for reviewing. Mr. Tapioca is a focus timer made by a college student. Everything below can be tested with no account and no login.

1) APP BLOCKING (the main feature)
Uses the Family Controls / Screen Time entitlement (distribution entitlement approved for this bundle ID). It needs a physical device and shows the standard iOS Screen Time prompt the first time. Demo path: Settings > "Choose Apps to Block while Focusing" > approve the prompt > pick any app (Safari works) > go back > start a focus session. Open the app you picked and the Screen Time shield appears. End the session and it unblocks right away. Blocking is optional; a session without it earns half pearls instead of full.

2) LIVE ACTIVITY
Start a session and lock the device. The countdown appears on the Lock Screen, and in the Dynamic Island on supported devices.

3) IN-APP PURCHASES
All purchases are non-consumable cosmetics at $1.99 each: character skins and shop backgrounds. No subscriptions, no consumables, no app functionality behind a paywall. Restore Purchases is in Settings > Purchases > Restore.

4) PARTNER SHOP REWARDS (the unusual part, please read)
The app has real agreements with two bubble tea shops in Ithaca, New York: U Tea (205 Dryden Rd) and Dream Tea & Poké (130 E Seneca St). Each shop chose its own offer and the app shows that shop's exact wording. Four hours of cumulative focus time earns one reward.

The flow: the user opens the Boba Map tab, where a partner shop is starred and carries a "Show at the counter" button. That opens a card with the shop name, the shop's offer, and a timestamp ticking every second so a screenshot cannot stand in for the live app. The user shows the phone to the barista and taps "Use one reward", which decrements the balance on the device. There is no scanner and no merchant login; nothing for the shop to install. The reward is a discount on a physical drink at a physical business. No money changes hands inside the app, and nothing digital is unlocked by it.

To see the flow without traveling to Ithaca: set the device location to 42.4415, -76.4849 (Xcode > Debug > Simulate Location, or a custom GPX file), open the Boba Map tab and allow location. Both partner shops appear with a star and the button. The card opens at any balance, so the whole surface is visible immediately; the "Use one reward" button enables only after four hours of accumulated focus. A screen recording of the full flow is attached.

5) STUDY SQUAD AND THE ANONYMOUS ACCOUNT
On first launch the app creates an anonymous account on our Supabase backend. No email, no password, no real name, no sign-in screen. It exists so the Study Squad leaderboard works. Study Squad shows a display name and focus totals to people who exchange a 6-character code. No chat, no public feed, no content sharing. Account deletion is in Settings > Delete account and removes the cloud row.

6) LOCATION
Used only by the Boba Map tab, to find bubble tea shops nearby from OpenStreetMap data. The app is fully functional if location is denied.

7) EVERYTHING THE APP SENDS OFF THE DEVICE (this matches our privacy answers)
- Boba Map: coordinates go to public OpenStreetMap Overpass servers to find nearby shops. We do not store them.
- Drink counter: on a finished session, one row carrying a random per-install id, the cup label, the minutes, and "ios" or "web". No name, no email, no location, and it links to nothing else.
- Study Squad: display name, skin, focus minutes, drinks and day streak, on the anonymous account above. Adding a friend sends the 6-character code they handed you. Removing one sends that friend's account id so the row can be deleted.
That is the complete list. Reward redemptions never leave the device.

Contact: melchiorjgg@gmail.com
```

**Deliberate changes from the current notes (`APP_STORE_LISTING.md:184-198`), and
things to check before pasting:**

| Item | Note |
|---|---|
| Section 4 is entirely new | The current notes never mention partner rewards. A reviewer hitting a "Show at the counter" button with no explanation is a rejection waiting to happen, and the honest framing (a discount on a physical drink, no money in-app, nothing digital unlocked) is the framing that makes it uncontroversial. |
| Section 5 rewritten | The current notes say "Enabling cloud sync creates an anonymous account". It is created at launch (`app.js:6482`). Telling a reviewer the wrong account-creation trigger while filing a privacy label built on the same wrong assumption is the compounding version of this mistake. |
| Section 7 is new | Volunteering the full egress list costs nothing and pre-empts a label mismatch, which is the actual risk here. Its Study Squad bullet names the friend-code exchange and the friend-removal delete so it matches §5.1 row by row. |
| Shop name spelling | "Dream Tea & Poké" carries the accent because that is byte-for-byte what `partners.json:38` says, and the same string is what the app renders on the counter card. Do not ASCII-fold it while pasting. If App Store Connect ever mangles the character, say so here rather than quietly renaming the shop. |
| The Family Controls sentence | Section 1 says the distribution entitlement is approved for this bundle ID. The repo can only show that the entitlements files **declare** `com.apple.developer.family-controls` (`GROUNDING.md` §7); approval lives in Apple's records, not the tree. It is almost certainly true, since the shipped app blocks apps. Confirm it in the developer account before pasting, and see §9 item 2. |
| IAP count | The current notes say "Six non-consumable cosmetics" and name four skins plus Winter Cocoa and Galaxy Dream. `app.js:75-78` and `:85-88` carry **eight** `premium: true` items (adding Honeymilk Library and Mango Sunset), and `IAP.init()` requests product ids for all of them via `premiumItems()` (`app.js:2054, 2058`). `IAP_SETUP.md:19-24` documents only six product ids. The block above deliberately states no count. **Confirm what is actually attached in App Store Connect and make all three agree.** |
| Attachment | The block says a screen recording is attached. Attach one, or delete that sentence. Do not ship the claim without the file. |
| Contact address | The current notes use `mrtapioca.app@gmail.com` (`APP_STORE_LISTING.md:197`); live `privacy.html:112` uses `melchiorjgg@gmail.com`. The block above uses the one on the live page. Pick one, make both agree. |
| Dev unlock | The notes deliberately do not mention the 7-tap dev unlock (`app.js:6069-6086`). It is `GROUNDING.md` D10, it mints pearls, drinks and telemetry rows, and it should be gated out of the production build rather than documented to Apple. |

---

## 5. Privacy checklist

Reconciled against `metrics.js`, `squad-cloud.js` and `config.js` line by line. Every
"Yes" row names the code that does the collecting. Every "No" row was confirmed by a
repo-wide grep that returned nothing.

`config.js:10-13` is populated, so **every conditional in this table resolves to the
"keys present" branch.** There is no shipped configuration in which the telemetry and
the anonymous account are off.

### 5.1 The complete network egress surface

Six endpoints. Counting them by `fetch()` alone undercounts, and that is how row 6
went missing from the first draft of this document: `app.js` contains exactly two
`fetch()` calls (verified by grep, `:4596` and `:4681`) but `squad-cloud.js` reaches
the network through the supabase-js client instead, which issues its own requests.
Enumerate `squad-cloud.js` call by call, not by grepping for `fetch`.

| # | Endpoint | Payload | Code |
|---|---|---|---|
| 1 | `https://mrtapioca.me/partners.json` | none (GET) | `app.js:4596` |
| 2 | 4 public Overpass mirrors | a bounding box computed from the user's exact coordinates | `app.js:4681`, query built `app.js:4433-4446`, mirrors `app.js:4416-4421` |
| 3 | Supabase `/rest/v1/drink_events` | `{device, size, minutes, platform}` | `metrics.js:46`, row `metrics.js:37-43`, fired `app.js:2393` |
| 4 | Supabase RPCs (`set_my_profile`, `get_my_friends`, `add_friend_by_code`, `get_my_friend_code`, `delete_my_account`) | display name, skin, focus minutes, drinks, streak, status | `squad-cloud.js:76-81`, `:95`, `:107`, `:50`, `:121` |
| 5 | `https://esm.sh/@supabase/supabase-js@2.110.0` | none (module import; IP-level only) | `squad-cloud.js:26` |
| 6 | Supabase `/rest/v1/friendships` (**DELETE**, not an RPC) | one uuid: the account id of the friend being removed | `squad-cloud.js:116` `sb.from("friendships").delete().eq("friend_id", id)`, from `SquadCloud.unfollow()` |

Row 6 is the only direct PostgREST table write in the app; everything else Study
Squad does goes through an RPC. It changes no answer in the §5.2 table (it is the
same Study Squad account, the same App Functionality purpose, and it sends less
than row 4 does), but it is a distinct path at the granularity this table uses,
which already separates `/rest/v1/drink_events` from the RPC paths. Listing it is
what makes the word "complete" true.

There is no seventh **today**. `XMLHttpRequest`, `navigator.sendBeacon`, Crashlytics,
Sentry, Firebase, Amplitude, Mixpanel, PostHog, Google Analytics, `AdSupport`,
`ASIdentifierManager` and `ATTrackingManager` all return **zero hits** repo-wide.

#### Two modules that would add a seventh, both currently off

Parallel Network V1 work landed these while this document was being written. Neither
sends anything as the tree stands, and both are checked here rather than assumed.

| Module | Status right now | What it would add |
|---|---|---|
| `reward-v2.js` | **Loaded** (`index.html:796`) but **inert**. `RewardV2.enabled = HAS_KEYS && flagOn()` and `if (!RewardV2.enabled) return;` (`reward-v2.js:51-52`); the flag is `window.MRTAP_FLAGS = { rewardV2: false }` (`config.js:30-32`) | A second anonymous Supabase account and eight new RPCs: `start_reward_session`, `complete_reward_session`, `issue_my_rewards`, `my_reward_state`, `open_redemption`, `redeem_by_code`, `check_code` (`reward-v2.js:217, 250, 265, 266, 318, 335, 343`). Server-side session and redemption records are exactly the data the current privacy policy says never leaves the device. |
| `analytics.js` | **Present but not loaded.** `grep -rn "analytics.js" index.html sw.js package.json` returns nothing; the script list at `index.html:788-797` does not include it | Batched product-analytics rows to `/rest/v1/app_events` (`analytics.js:76, 445`), reusing the same `bobaMetricsDevice` id (`analytics.js:81`). Its own header already states the gate (`analytics.js:62-63`): the privacy copy and the App Privacy answers "have to land in the SAME release. That is a hard gate, not a nice-to-have." |

**Consequence for this document:** flipping `rewardV2` to `true`, or adding
`analytics.js` to `index.html`, invalidates the §5.2 table and the review notes'
section 7. Either change and the privacy copy must ship together, in one release.
Put that on the submission checklist, not in someone's memory.

### 5.2 The table

| Apple data type | Collected? | Linked to identity? | Used for tracking? | Exact collecting code | App Store Connect answer |
|---|---|---|---|---|---|
| **Location > Precise Location** | **Yes** | No | No | `app.js:4280` `getCurrentPosition`; coordinates become a bbox at `app.js:4433-4446` and are POSTed at `app.js:4681` | Declare. Purpose: **App Functionality**. Not linked, not tracking. Nothing is stored server-side by us; the only persistence is a local 24h cache keyed to ~1km (`app.js:4659`). |
| **Usage Data > Product Interaction** | **Yes** | No | No | `metrics.js:37-43` builds `{size, minutes, platform}`; POSTed `metrics.js:46`; fired `app.js:2393` on every finished session | **Declare. This is the omission that must be fixed.** Purpose: **Analytics**. Not linked, not tracking. `metrics.js:9-10` says so itself. |
| **Identifiers > Device ID** | **Yes** | No (see note) | No | `metrics.js:23-33` mints a `crypto.randomUUID()` under `bobaMetricsDevice`; sent as `device` at `metrics.js:38` | **Declare. Currently missing entirely.** Purpose: **Analytics**. See the judgment-call note below. |
| **Identifiers > User ID** | **Yes** | Yes | No | `squad-cloud.js:39` `signInAnonymously()`, reached unconditionally from `app.js:6482`; the uid is mirrored as `profiles.id` (`supabase-setup.sql:20`) | Declare. Purpose: **App Functionality**. **Remove the "only with Study Squad cloud" condition** currently at `APP_STORE_LISTING.md:159-160`. It is created at first launch. |
| **User Content > Other User Content** | **Yes** | Yes | No | `squad-cloud.js:76-80`: `p_display_name`, `p_skin`, `p_focus_minutes`, `p_drinks`, `p_streak` | Declare. Purpose: **App Functionality**. **Remove "currently-focusing status"** from the declared contents (`APP_STORE_LISTING.md:153`); it is never sent. **Remove the opt-in condition**; the row is written at launch by `squad-cloud.js:52`. |
| **Purchases > Purchase History** | **No** (by us) | n/a | n/a | Handled entirely by StoreKit. Ownership lives in `state.owned` in localStorage; `grep -n "owned" squad-cloud.js metrics.js` returns nothing, so it is never uploaded | Answer **No**, or declare Not Linked / No tracking if you prefer to be conservative. Do not claim we run a purchase server; we do not. |
| **Contact Info** (name, email, phone, address, other) | No | n/a | n/a | No email, no password, no real-name field anywhere. `signInAnonymously()` only; no `signUp`, no OTP, no OAuth, no `linkIdentity` in `squad-cloud.js` | No |
| **Health & Fitness** | No | n/a | n/a | zero hits for `HealthKit`/`HKHealth` | No |
| **Financial Info** | No | n/a | n/a | no payment handling of any kind | No |
| **Sensitive Info** | No | n/a | n/a | none collected | No |
| **Contacts** | No | n/a | n/a | zero hits for `Contacts`/`CNContact`/`addressBook`. Friends are added by a 6-character code only (`squad-cloud.js:107`) | No |
| **Browsing History** | No | n/a | n/a | no in-app browser; the map renders OpenStreetMap data in-app | No |
| **Search History** | No | n/a | n/a | no search feature | No |
| **Diagnostics** (crash, performance, other) | No | n/a | n/a | no crash or performance SDK; zero hits for Crashlytics / Sentry / Firebase | No |
| **Identifiers > Advertising Identifier** | No | n/a | n/a | zero hits for `AdSupport` / `ASIdentifierManager` / `ATTrackingManager`. No ads, no ad SDK | No |
| **Other Data** | No | n/a | n/a | the six endpoints in 5.1 are the complete surface | No |

**"Do you or your third-party partners use data for tracking?"** → **No.** No ad
SDKs, no ad identifiers, no data brokers, no cross-app or cross-site linking. This
answer is unchanged and still correct.

### 5.3 How the label should read on the product page

- **Data Not Linked to You:** Precise Location, Product Interaction, Device ID
- **Data Linked to You:** User ID, Other User Content
- **No "Data Used to Track You" section at all.**

Note what changed from `APP_STORE_LISTING.md:174-176`: Product Interaction and Device
ID are added, Purchase History is dropped unless you choose to declare it, and the
"only if Study Squad cloud is enabled" qualifier is gone from the linked group,
because the account exists from first launch.

### 5.4 The one judgment call, stated plainly

`bobaMetricsDevice` is persistent for the life of the install and rides on every
`drink_events` row. `metrics.js:7-10` argues it is unlinked: "it links to nothing
else", and that is literally true in the schema. `drink_events`
(`supabase-setup.sql:279-293`) has no foreign key, and there is no join key between
`device` and `profiles.id`. Declaring it **Not Linked** is the position this document
recommends.

The counter-argument a cautious reviewer could make is that a persistent per-install
identifier attached to a stream of usage events builds a per-device history whether or
not a name is attached. If you want zero argument on this, the fix is in code, not in
copy: rotate or drop `device` and count sessions without it. That is a Priority 4
decision (`LEDGER.md`), not a metadata decision, and it is out of scope here. Flagging
it so nobody is surprised.

---

## 6. Copy that must change before the next submission

Grouped by file. **"Current" is the verbatim sentence or clause that has to change,
not the whole physical line.** The line number is where that text starts. Most of
these sit inside HTML tags or run on into text that is fine as it is, and several
wrap across two source lines, so **do not paste a "Current" cell into a
find-and-replace box and expect a hit.** Open the line, read what surrounds it,
change only the quoted words. Where the surrounding text is easy to lose, the row
says so.

### 6.1 `privacy.html` (live today, dated June 29, 2026)

| # | Line | Current wording | Replace with | Why |
|---|---|---|---|---|
| 1 | `:69` | "2. Study Squad (optional social feature — off unless you turn it on)" | "2. Your anonymous account and Study Squad" | `app.js:6479-6483` calls `SquadCloud.init()` unconditionally; `squad-cloud.js:39` signs in anonymously. There is no toggle. Also drops an em-dash. |
| 2 | `:70-71` | "If you choose to use Study Squad, the app creates an anonymous account (no email, password, or real name required)." Wraps across two source lines, with `<strong>` tags around "anonymous account" on `:70`, and `:71` runs on into "Only the following is stored on our backend so" which stays. | "When you first open the app it creates an anonymous account for you (no email, password, or real name). It exists so the Study Squad leaderboard can work. Nobody can see your stats until you give someone your friend code." | Same reason. The second sentence preserves the true reassurance the old wording was reaching for. |
| 3 | `:59` | "The following never leaves your iPhone and is not sent to us:" | "The following never leaves your iPhone:" and remove focus sessions from the list beneath it, then add the new section in row 4 | `metrics.js:46` sends `{device, size, minutes, platform}` for every finished session. The blocked-app bullet at `:62-66` is accurate and stays exactly as written. |
| 4 | new section after `:67` | (nothing today; `grep -i drink privacy.html` returns one hit at `:76`, scoped to Study Squad) | "**Anonymous drink counter.** When you finish a session, the app sends one row: a random id created on this install, the cup you brewed, how many minutes it ran, and whether you are on iPhone or the web. No name, no email, no location. It exists so we can answer 'how many drinks has the app brewed?' and it links to nothing else about you." | §4 "What we do NOT collect" (`:87-93`) reads as an exhaustive negative today, which makes the omission worse than a gap. |
| 5 | `:77` | "and your current status (e.g. \"focusing,\" \"on a break\")." The line ends `</li>`; keep the tag and re-punctuate the item above it so the list still reads. | delete the clause | The policy claims collection of data the code does not collect. `mySquadStats()` (`app.js:5143-5148`) has no status key, so `squad-cloud.js:81` always sends the literal `"idle"`. |
| 6 | `:91` | "No third-party analytics or tracking SDKs." | "No third-party analytics or tracking SDKs. The only thing we count is the anonymous drink counter above." | Technically true (the POST is first-party) and therefore misleading beside an exhaustive negative list. |
| 7 | `:46` | "Last updated: June 29, 2026" | the date this actually ships | It predates `metrics.js` (mtime Aug 3) and both partner shops. |

### 6.2 `APP_STORE_LISTING.md`

| # | Line | Current wording | Replace with | Why |
|---|---|---|---|---|
| 8 | `:178` | "If someone never touches Study Squad cloud, the only thing the app ever sends anywhere is a map query." | delete, and replace with the six-endpoint table in §5.1 above | False as shipped. `metrics.js:17` reads `window.MRTAP_CLOUD` directly with no reference to squad state in either direction. This sentence is the source for Apple's privacy questionnaire, which is why it is the most expensive wrong line in the repo. |
| 9 | `:143-176` | §8 declares four data types: Precise Location, User Content, Identifiers > User ID, Purchases | the table in §5.2 above | Usage Data is absent entirely, Device ID is absent entirely, and the User ID declaration is scoped to "only with Study Squad cloud" while `bobaMetricsDevice` is minted regardless. |
| 10 | `:153` | "focus session stats (minutes, streaks, currently-focusing status)" | "focus session stats (minutes, drinks, day streak)" | No status is ever sent. |
| 11 | `:141` | "Yes (location queries for the map; Study Squad data only if the user turns it on)." | "Yes (location for the map, an anonymous drink counter, and the anonymous account that Study Squad runs on)." | The opt-in framing is wrong at the top of the questionnaire, which is where it does the most damage. |
| 12 | `:56` | "Pick a drink size (a 5 minute taste, a 2 hour small, a 6 hour large, or a custom brew)". `:56` is one long paragraph carrying both this row and row 13; between them sits ", start the session, and he brews your boba while you work. Finish and the drink goes in your collection." which is accurate and stays. | "Set a Custom Cup anywhere from 15 minutes to 4 hours, or brew your daily Goal Cup" | `app.js:1-4`: two modes. `index.html:257-262`: two buttons. Bounds 15 to 240 minutes (`app.js:6-7`, `:1152-1153`). The only 5-minute path is `DEV_MIN = 5` seconds (`app.js:9`). |
| 13 | `:56` | "Big drinks are resumable, so you can chip away at a large across a few study sessions." (the last sentence of the same paragraph as row 12) | "Long sessions are resumable, so you can chip away at one across a few sittings." | Resumability is real (`app.js:661`, `:669-684`); the size name is not. |
| 14 | `:67` | "Study Squad: share a code, see friends focusing live, keep streaks together (optional)" | "Study Squad: share a code and compare focus totals with friends on a leaderboard. No email, no password" | `app.js:5259` drops `status`; `app.js:5266-5278` renders rank, avatar, name, minutes, streak only. |
| 15 | `:65` | "Pearls, about 4 per focused hour, to spend on skins, toppings, and shop backgrounds" | "Pearls, about 4 per focused hour with blocking on, to spend on skins, toppings, and shop backgrounds" | `REWARD_UNBLOCKED_FRACTION = 0.5` (`app.js:129`) halves it on an unblocked native session. |
| 16 | `:74` | the whole line is "Free to download. No ads. No subscriptions. No tracking. Just you, a proud little pearl, and the thing you've been putting off." Only the fourth sentence changes. | delete " No tracking." and leave the rest of the line exactly as it is | A persistent per-install id ships with usage data. The claim survives Apple's narrow definition of tracking but not a plain-English reading, and the closing line is the wrong place for a claim that needs a footnote. |
| 17 | `:193` | the whole line: "4) STUDY SQUAD. Optional social feature. The whole app works offline with no account. Enabling cloud sync creates an anonymous account (no email or password); account deletion is in Settings and removes all cloud data." Replace all of it, not just up to "anonymous account". | section 5 of the review notes in §4 above | Same account-creation error, now in the text a reviewer reads. |
| 18 | `:191` | "Six non-consumable cosmetics at $1.99 each: Ninja, Wizard, Angel, and Devil (character skins), plus Winter Cocoa and Galaxy Dream (shop backgrounds)." The line opens "3) IN-APP PURCHASES. " and runs on into "No subscriptions, no consumables, no paywalled functionality..."; both stay. | reconcile against App Store Connect first, then state the true count | `app.js:75-78` and `:85-88` carry **eight** `premium: true` items; `IAP.init()` requests ids for all eight (`app.js:2054, 2058`); `IAP_SETUP.md:19-24` documents six. One of these three is wrong and the repo cannot tell you which. |
| 19 | `:197` | "Contact: mrtapioca.app@gmail.com" | whichever address is actually monitored | `privacy.html:112`, which is the live page, uses `melchiorjgg@gmail.com`. |
| 20 | `:1` | "# Mr. Tapioca: App Store Submission Kit (v1.0)" | retitle for the version actually being submitted | The file is a v1.0 artifact being used for a 1.1.x submission. |

### 6.3 Other shipped surfaces making the same false presence claim

| # | File:line | Current wording | Replace with |
|---|---|---|---|
| 21 | `support.html:105-106` | "If you turn on the optional Study Squad, your display name and focus stats sync so friends can see you focusing." Starts mid-line on `:105` and finishes on `:106` before `</p>`; the two sentences before it on `:104-105` are accurate and stay. | "If you share your friend code, your display name and focus totals appear on your friends' Study Squad leaderboard." |
| 22 | `catch-up.html:168` | "Add friends by code and see each other's live focus stats &amp; status (🟢 focusing / 🌸 on a break). Optional &amp; anonymous." Note the ampersands are HTML-escaped in the file, and the string sits inside `<div class="f"><b>👥 Study Squad</b><span>…</span></div>`. Replace the `<span>` text only. | "Add friends by code and compare focus totals on a shared leaderboard. Anonymous, no email needed." |
| 23 | `app.js:5411-5415` (onboarding slide 6), body string on `:5414` | the whole `body` is "Mr. Tapioca wants to work at real shops. Stay tuned to unlock discounts at boba shops near you. Check out the in-app map to locate shops to visit." The third sentence stays true; the first two are the problem. | Two shops are already signed (`partners.json:26-45`). "Stay tuned" tells a new user the feature is not built yet, which is now the opposite of the store description. Owned by another agent; listed here so it is not missed. |

Rows 21 and 22 are the same defect as row 14 and `GROUNDING.md` §8 items 17 and 18.
All three surfaces have to move together or the app contradicts itself in public.

---

## 7. Pre-submission checklist

- [ ] `npm run copyweb && npx cap copy ios && node tools/register-ios-plugins.mjs` (the staged bundle was four days stale on 2026-08-13, and gets staler on its own; measure it, do not quote a figure. `GROUNDING.md` §7 and §1 rule 1)
- [ ] `python3 tools/check-shell.py` passes, and root `sw.js` CACHE is ahead of whatever the last release shipped. Root `sw.js:10` was bumped to `mr-tapioca-v186` on Aug 12; read the line rather than trusting this number, because it moves on its own. The staged copy is what an archive actually ships, and `ios/App/App/public/sw.js:10` is still `v181`, so the sync in the row above is what closes this one
- [ ] All 23 copy rows in §6 applied
- [ ] Privacy questionnaire re-answered from the §5.2 table, including the two new declarations
- [ ] Six screenshots captured per §1, at the size App Store Connect currently asks for
- [ ] Screen recording of the redemption flow attached to the review notes, or that sentence deleted
- [ ] IAP count reconciled across App Store Connect, `app.js` and `IAP_SETUP.md`
- [ ] Support contact address reconciled between the review notes and `privacy.html`
- [ ] Family Controls **distribution** entitlement confirmed approved for `com.melchior.mrtapioca` in the developer account, or that parenthetical struck from section 1 of the review notes. The repo can only show the entitlement is declared (§9 item 2)
- [ ] 7-tap dev unlock gated out of the production build (`GROUNDING.md` D10)
- [ ] `partners.json` still lists exactly the shops that have agreed, on the day of submission
- [ ] `config.js` `MRTAP_FLAGS.rewardV2` is still `false`, **or** the §5.2 table and review-notes section 7 were rewritten for it (see §5.1)
- [ ] `analytics.js` is still absent from `index.html`, **or** the same rewrite happened. Its own header makes this a hard gate, not a preference
- [ ] Re-grep the egress surface on submission day: `grep -n "fetch(" app.js`, `grep -n "sb\.rpc\|sb\.from" squad-cloud.js reward-v2.js`, and the `<script>` list at `index.html:788-797`. Grepping `fetch(` alone is what missed row 6 the first time; the supabase-js client does not go through it. This document's six-endpoint claim is dated

---

## 8. Verification log

Commands run, and what they returned. Everything above traces to one of these or to
a file read in full.

| Check | Result |
|---|---|
| `grep -n "SquadCloud.init\|SquadCloud.pushProfile" app.js` | 3 hits: `:815`, `:5480`, `:6482`. Read `app.js:6475-6495`: `SquadCloud.init()` is inside `if (window.SquadCloud && SquadCloud.enabled)`, top level, no user gate. Fact 2 confirmed. |
| `grep -n "MrTMetrics" app.js index.html` | one call site, `app.js:2393`, inside `completeSession()`, unguarded. Fact 1 confirmed. |
| `metrics.js` read in full (59 lines) | `deviceId()` at `:23-33`, row at `:37-43`, POST at `:46`. Self-documented label requirement at `:9-10`. |
| `config.js` read in full (32 lines) | `url` and `anonKey` both populated at `:11-12`, so `ENABLED` is true in `squad-cloud.js:10` and `metrics.js:18`. |
| `squad-cloud.js` read in full (124 lines) | `signInAnonymously()` `:39`; `set_my_profile` params `:76-81` incl. `p_status: me.status \|\| "idle"`; `fetchFriends` `:93-102`. |
| `sed -n '5143,5148p' app.js` | `mySquadStats()` returns `{name, mins, drinks, streak, skin}`. No `status` key. Comment: "activity presence is deliberately NOT broadcast". |
| `sed -n '5248,5282p' app.js` | Squad board renders rank, avatar, name, focus total, streak flame. `status` never read. Presence ban confirmed. |
| `sed -n '1,12p' app.js` | `MODES = { custom, goal }`. Two modes. `CUSTOM_MIN = 15*60`, `CUSTOM_MAX = 240*60`, `DEV_MIN = 5` seconds. |
| `grep -n "GOAL_MIN\|GOAL_MAX" app.js` | `:1152-1153`, 15 and 240. |
| `cat partners.json` | Two shops, both `minMinutes: 240`, perks "10% off your drink" and "5% off your drink". |
| `sed -n '4952,5012p' app.js` | `openRedeem()` gates only on `earnedPerkCount() > 0`; `confirmRedeem()` pushes `{at, shop, perk}` and issues no fetch. |
| `sed -n '4645,4665p' app.js` | `withPartners()` skips partners beyond `radius`; `loadNearbyShops` passes 6000. Confirms the reviewer needs a location override. |
| `grep -n "fetch(" app.js` | exactly two: `:4596` (partners.json) and `:4681` (Overpass). |
| `grep -rIn -E "XMLHttpRequest\|navigator.sendBeacon"` | zero hits |
| `grep -rIn -E "Crashlytics\|Sentry\|firebase\|amplitude\|mixpanel\|posthog\|gtag\|google-analytics"` | zero hits |
| `grep -rIn -E "AdSupport\|ASIdentifier\|advertisingIdentifier\|AppTrackingTransparency\|ATTrackingManager"` | zero hits |
| `grep -rIn -E "Contacts\|CNContact\|addressBook"` | zero hits |
| `grep -rIn -E "HealthKit\|HKHealth"` | zero hits |
| `grep -n "owned" squad-cloud.js metrics.js` | zero hits. Purchase ownership never leaves the device. |
| `sed -n '2033,2075p' app.js` | `IAP.premiumItems()` filters all `premium: true` items and `init()` requests a product id for each. With eight such items, eight ids are requested. |
| `grep -n "com.melchior" IAP_SETUP.md` | six product ids documented. Mismatch with the eight above. |
| `sed -n '3120,3128p' styles.css` | `#redeemDialog.not-ready .redeem-perk` greys the chip; `#redeemConfirmBtn:disabled { opacity: 0.45 }`. Confirms the frame 4 trap. |
| `grep -n -A1 "UsageDescription" ios/App/App/Info.plist` | one string, `NSLocationWhenInUseUsageDescription`. No other permission strings. |
| `grep -n "sb.rpc\|sb.from" squad-cloud.js` | six calls, and one of them is not an RPC: `:116` `sb.from("friendships").delete().eq("friend_id", id)`. This is §5.1 row 6, and it is the reason the egress surface cannot be counted by grepping `fetch(`. |
| `sed -n '1718,1734p' app.js` | the premium-tile branch is a ternary at `:1722-1725`, not a guard. Web renders a hardcoded `✦ $1.99` preview button, handler at `:1812-1816` calling `showPremiumPreview(item.name, "$1.99")`. Frame 5 rewritten against this. |
| `sed -n '3118,3126p' styles.css` | `:3123` is the closing brace of `#redeemDialog .secondary`; the not-ready rules are `:3124-3125`. In-text citation corrected to match `GROUNDING.md` §1 row 12. |
| `ls -lT ios/App/App/public/{app,sw}.js app.js sw.js` and `sed -n '10p'` on both `sw.js` | staged Aug 9 16:48 vs root `app.js` Aug 12 20:55 (four days as of Aug 13); root CACHE `mr-tapioca-v186`, staged `mr-tapioca-v181`. Both figures in `GROUNDING.md` §7 have since moved. |
| `awk 'NR>=74 && NR<=90' app.js` | premium backgrounds are `:85` winter, `:86` galaxy, `:87` library, `:88` sunset. `:89` is blank, so the range is `85-88`. `grep -c "premium: true" app.js` = 8, so the count of eight is unaffected. |
| Every `file:line` in this document extracted and re-resolved by script, twice | 82 distinct citations. Final run, against the `app.js` of 00:23: all 82 in range, and each printed line matched the claim made about it. This is the check that caught the `app.js` re-numbering; before it, 35 citations pointed into shifted code. Re-run it rather than trusting this row. |
| Character counts | `python3` `len()` on each block: subtitle A 25, B 29, C 30; promo A 150, promo B 162; description 2,427; review notes 3,782; all six captions and subcaptions as tabled in §3. Em-dash count on every block: 0. Whole-file U+2014 count: 1, the quoted `privacy.html` line in §6.1 row 1. |

---

## 9. Limitations a reader must know

1. **Nothing here was submitted or pasted anywhere.** This is a proposal. No file in
   the repo was edited to produce it.
2. **Four things live in Apple's records rather than in this repo, and all four
   appear in the copy above.** `GROUNDING.md` §10 items 2 and 3 name two of them: the
   App Privacy label actually filed in App Store Connect is not recorded anywhere in
   the tree, and the live product page was not fetched, so the four-drink-size
   description may or may not still be live. The third is the IAP catalog: the repo
   disagrees with itself (eight items in `app.js`, six in `IAP_SETUP.md`) and only
   App Store Connect can settle it. The fourth is the parenthetical in section 1 of
   the review notes, "distribution entitlement approved for this bundle ID". The
   repo shows only that the entitlements files **declare**
   `com.apple.developer.family-controls` (`GROUNDING.md` §7). Declaring is not
   approval, and approval is a row in the developer account. It is almost certainly
   true, because a build with unapproved Family Controls would not have shipped and
   blocking works on shipped devices, but it is the one sentence in a paste-ready
   block that this repo cannot check. Confirm it, or drop the parenthetical and let
   the entitlement speak for itself. Every one of these four is a checklist row in
   §7 rather than an assertion.
3. **The character limits are asserted from the current listing file, not from a live
   App Store Connect session.** 30 for subtitle, 170 for promotional text, 4,000 for
   description are stable and long-standing; the review-notes limit of 4,000 is the
   one I am least certain of, which is why that block is sized at 3,782. Confirm in
   the UI.
4. **The screenshot size guidance is inherited, not verified.**
   `APP_STORE_LISTING.md:234` names 6.9" and 6.5" sets and was written 2026-07-02.
   Apple changes required sizes. Check before capturing.
5. **The "four hours" figure in the description is a live dependency, not a
   constant.** `perkMinMinutes()` returns the minimum `minMinutes` across live
   partners (`app.js:4615-4619`). It is 240 today only because both shops are 240. A
   third shop at a lower number silently changes it, and store metadata will not
   follow automatically. This is `GROUNDING.md` D6.
6. **This document proposes no code change and fixes no defect.** It stops the store
   copy and the privacy policy from describing an app that does not exist. The
   underlying issues the copy is now honest about (the counter card can be shown
   unlimited times, one localStorage write mints unlimited perks, redemptions never
   leave the device) are D1 through D5 and remain open. Honest copy is not a fix for
   them.
7. **This document has a shelf life, because the code it describes is being changed
   right now.** Two modules landed in the tree while it was being written
   (`reward-v2.js`, wired but flag-off; `analytics.js`, present but not loaded), and
   `squad-cloud.js` line numbers shifted mid-write. Everything here was re-verified
   afterwards, and re-verified again on the second pass described at the top, but the
   privacy table is a snapshot of a moving target. The re-grep rows at the end of §7
   exist so nobody submits against a stale reading. Two lessons from the second pass
   are worth keeping: a table headed "complete" earns that word only if it was built
   by enumerating a module call by call rather than by grepping for one function name,
   and a figure copied out of `GROUNDING.md` ages independently of the sentence around
   it, so cite the check rather than the number wherever the number can move.
8. **I did not evaluate whether the perk arrangement raises any App Store business-model
   question beyond describing it accurately.** The review-notes framing states the
   facts (a discount on a physical drink at a physical business, no money in-app,
   nothing digital unlocked) and lets a reviewer judge. If that framing is wrong, it
   is wrong in a direction that gets asked about rather than rejected silently.
