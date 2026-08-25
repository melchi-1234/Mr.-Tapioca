# Mr. Tapioca — project guide for Claude Code

A cozy boba-themed focus/study timer. Set a Custom Cup (15 min to 4 hr) or your
Goal Cup, start a session, and a round tapioca-pearl mascot brews your bubble tea
while you work. Finishing a
session adds the drink to your collection and earns pearls. The headline iPhone
feature is real app blocking during focus sessions via Apple's Screen Time
(Family Controls). Built as a web app first, then wrapped natively with Capacitor.

## Stack + layout

- **Plain HTML/CSS/JS, no build step.** The whole app is:
  - `app.html` — the app itself (markup + all dialogs/sheets). NOTE (front-door flip, Aug 2026):
    on the web, `index.html` is the marketing LANDING page (the front door of mrtapioca.me) and
    the app lives at `app.html`. The native/Capacitor bundle is built with app.html copied in AS
    index.html, because Capacitor loads index.html as its entry (see `tools/copy-web.mjs` +
    `PUBLIC_ENTRY` in `tools/public-bundle-manifest.mjs`; the verifiers/check-release know this
    mapping). So do NOT assume `index.html` is the app.
  - `app.js` — ~5800 lines, all logic (timer, economy, games, squad, audio, map, poses, icons, native bridges)
  - `styles.css` — all styling + themes + animations
  - `sw.js` — service worker (offline + install). `const CACHE = "mr-tapioca-vNN"` MUST be bumped on every release or installed users keep the old shell.
  - `config.js` — optional Supabase keys for the live Study Squad (feature-flagged; app works fully without them). The key in here is the PUBLIC anon/publishable key by design.
  - `squad-cloud.js` — Study Squad cloud sync.
- **Assets:** `assets/` (lowercase). Character art is 500x500 PNGs; shop backgrounds 768x1344.
  - **Character poses live in `assets/poses/<skin>-<state>.png`**, 500x500, 14 skins x 4 states
    (`idle`, `mixing`, `sleeping`, `shocked`) = 56 files. `const SKIN_POSES` in `app.js` builds the
    lookup. There is **no sprite sheet system** — it was deleted in Aug 2026. Poses are still
    drawings; all motion on top of them is CSS keyframes, not frame flipping. Adding a skin means
    adding all four PNGs, listing them in the `sw.js` SHELL, and bumping the cache.
  - Scene art (drawn, not CSS gradients): `counter-*.png` for the shop counter, `bed-back.png` +
    `bed-front.png` for the two-layer break-mode bedroom (he tucks between the layers), and
    `catch-board.png` / `plinko-board.png` / `pong-board.png` for the three game boards.
- **Native iOS:** Capacitor. `ios/App/` is the Xcode project. Custom Swift plugins in `ios/App/*.swift` (also mirrored in `native-ios/` as source-of-truth copies): FocusShieldPlugin (Screen Time blocking), FocusActivityPlugin (Live Activity countdown), IAPPlugin (StoreKit 2 purchases). `tools/register-ios-plugins.mjs` re-registers them after `cap copy`.

## How to run / preview

- Serve the folder and open in a browser: `python3 -m http.server 4173` then visit `http://127.0.0.1:4173`. (The app registers a service worker; clear it + caches when testing CSS/JS edits, or serve from a fresh port.)
- Visual QC is done headless with puppeteer-core driving system Chrome at iPhone viewport (see scratchpad scripts from past sessions). Point it at your local server, seed `localStorage.bobaFocusOnboarded="true"` + `bobaFocusTourDone="1"` to skip onboarding.
- **Verify every visual change at BOTH 375x812 and 1280x900** before calling it done. A change that
  was only checked at phone width has shipped a desktop regression before.

## Gotchas that have already cost real time

These are all things that fail *silently*. Do not rediscover them.

1. **Run `python3 tools/check-shell.py` before every release.** One missing path in the `sw.js`
   SHELL list blocks ALL updates app-wide, with no error anywhere. Bumping
   `const CACHE = "mr-tapioca-vNN"` is also required, but the bump alone is not enough.
2. **The browser will serve you stale `app.js` / `styles.css`.** To actually see an edit: unregister
   all service workers AND delete all caches, THEN navigate twice. One reload is not enough.
3. **`.hidden { display:none }` sits ABOVE several component rules that set `display`**, so a later
   `display:inline-flex` silently defeats it. Any component that sets its own `display` needs its
   own `.foo.hidden { display:none }` rule.
4. **Never write `textContent` on a button that carries an inline SVG icon.** It wipes the icon out.
   Rebuild the icon and the label together.
5. **Screen Time shields can die silently on-device.** A user tapping "Ignore Limit" on their OWN
   iOS app limit can suppress our shield for the day, and reinstalling a blocked app kills its
   stored token permanently (no API detects this). The app re-asserts the shield every 5 min +
   on foreground, and Settings has a "Blocking Not Working? Re-pick Apps" recovery button that
   re-picks from scratch. QA details in SETUP_NATIVE.md. Test blocking against apps that have
   personal Screen Time limits.
6. **The focus music is REAL FILES now, and the licence is the constraint.** `assets/music/`
   holds 12 tracks (23 MB, AAC 96k, all loudness-matched to −16 LUFS so no track jumps out).
   The generative Web Audio scheduler that used to make its own lo-fi is gone: it wandered
   forever and got grating over a long session. **Every track is either CC0 (Loyalty Freak
   Music) or CC BY (Broke For Free), both cleared for commercial use.** CC BY only holds if
   the artist is named where a user can reach it, which is the Music Credits list in Settings
   — do not remove it, and do not add a track without adding its credit row. **Do not add
   music from Pixabay, Uppbeat, or a "free to use" YouTube channel.** Those licences permit
   *videos*; shipping the file inside a paid app is redistributing someone's master.
   Playback is two `<audio>` decks through `MediaElementSource` → per-deck gain → the music
   bus, crossfading on equal-power (sin/cos) curves. Two things there look optional and are
   not: linear ramps would dip ~3 dB mid-blend (audible as ducking every few minutes), and
   the gain **must** live in Web Audio because **iOS ignores writes to
   `HTMLAudioElement.volume`** — a `.volume` crossfade is a hard cut on every iPhone and the
   volume slider does nothing. The tracks are deliberately NOT in the `sw.js` SHELL; they
   live in their own unversioned `MUSIC_CACHE` so a release does not evict 23 MB, and the
   worker hand-cuts byte ranges out of a cached full copy (the Cache API cannot store a 206,
   and Safari will not seek against a 200). `tests/sw-music-range.test.js` guards that.
7. **`<video preload="none">` never fetches just because `.src` changed.** Setting `.src` alone
   produces zero network activity — confirmed live, no request for the mp4 even after several
   seconds. `preload="none"` defers loading until something explicitly requests it, so any code
   that sets `.src` then waits for `canplay`/`readyState` before calling `play()` (see
   `renderWindowLoop()` in `app.js`, the animated theme windows) will wait forever: nothing was
   ever asked to load. Call `v.load()` right after setting `.src` — that's a script-requested
   load and the browser honors it immediately regardless of `preload`. This is exactly what made
   the galaxy theme's window load with the duller static CSS spin and only switch to the real
   animated video after tapping a button: a click's own `play()` call was the only thing in the
   whole flow that ever forced a load. Fixed 2026-08-12.

## Where it lives

- **LIVE ON THE APP STORE:** https://apps.apple.com/app/id6786023560
  Apple ID `6786023560`, bundle `com.melchior.mrtapioca`, SKU `mrtapioca001`.
  That short `/app/id…` form is the one to share: it redirects and localizes to
  the visitor's own country store.

## How to deploy

- **Web app is LIVE via GitHub Pages** from the `feature-work` branch at
  **https://mrtapioca.me** (custom domain via the root CNAME file; free first
  year through the GitHub Student Pack Namecheap offer, registered Aug 2026 on
  the owner's Namecheap account, DNS = 4 GitHub Pages A records + www CNAME).
  The old https://melchi-1234.github.io/Mr.-Tapioca/ URL redirects there.
  **Every push to `feature-work` auto-deploys** within a few minutes. Bump the
  `sw.js` CACHE version so clients pick it up.
- **Landing page** (separate, Higgsfield-hosted): https://icy-plaza-859.higgsfield.app
- **iOS:** release only through the checked-in wrappers; do not use Product →
  Archive or Organizer Upload as the release path. From a clean, committed tree,
  first run `npm run ios:release-setup`, review and commit the synchronized build,
  then run `npm run ios:archive-release -- /absolute/path/Mr-Tapioca-1.1.1-9.xcarchive`
  then `npm run ios:export-release -- /absolute/path/Mr-Tapioca-1.1.1-9.xcarchive /absolute/path/Mr-Tapioca-1.1.1-9.ipa`,
  then `npm run ios:upload-release -- /absolute/path/Mr-Tapioca-1.1.1-9.ipa`.
  The wrappers run the complete tests and parity checks, archive the App scheme
  with fresh build data, verify the archive, export without letting Xcode change
  the build number, verify the exact IPA, and re-verify that same file immediately
  before its controlled App Store Connect upload.
  Install it from TestFlight on a real iPhone and approve the visual, focus-blocking,
  notification, and Reward V2 checks before submitting it for App Review.

## Adding or removing a partner shop

**Edit `partners.json`, push. That is the whole job. Never ship an app build for
this.** GitHub Pages redeploys mrtapioca.me about a minute later and every client
picks the new list up on the next Boba Map open.

⚠️ **"Every client" means every client that HAS the partner system.** The live App
Store release was archived before the partner code existed, so it ignores
`partners.json` entirely. Build 8 was rejected, and builds 9, 10 and 11 are
superseded; none of them must ever be submitted. The corrected code reaches App
Store phones with **1.1.1 / build 12** (the auto-unblock + End-spills fixes;
uploaded to App Store Connect, not yet submitted). Until that ships, a shop added here is live
on mrtapioca.me and invisible on the current App Store iPhone build. Do not tell anyone a new shop is on their
phone before checking `CURRENT_PROJECT_VERSION` against the build that has partners.
Pulling a shop is the same edit in reverse, which is what lets us keep the promise
the pitch makes: they come off the app the day they ask.

- `PARTNER_SHOPS` in `app.js` is only the **bundled offline floor** for a fresh
  install with no signal. It is not the live list. `livePartners` is.
- A shop goes in only after it has agreed **in writing**, and `perk` is that
  shop's own words. Perks are per shop and will not look alike (a percentage,
  a free topping, a whole drink). **Never invent a perk or a number.**
- `minMinutes` is floored at 15 by `validPartner()`. A zero would make every user
  instantly holding a redeemable perk.
- `sw.js` deliberately exempts `partners.json` from the cache-first handler. Do
  not "fix" that: the worker uses `ignoreSearch`, so it would pin the first copy
  forever and no new shop would ever reach an installed client.

## Conventions

- **User-facing copy avoids em-dashes** (house style — they read as AI-generated). Use periods, commas, or parentheses.
- Keep the cozy kawaii tone: warm, friendly, boba puns welcome.
- Match existing comment density and naming when editing.
- The economy must stay fair: pearls come from real focus time (~4/hour). Never introduce a way to farm or double-credit pearls.

### Design system (added Aug 2026, do not drift from it)

- **The font is Inter** (`font-family: Inter, ui-sans-serif, system-ui, …`). A rounded face
  (`ui-rounded` / SF Pro Rounded) was tried and **rejected** — the blockier text reads better here.
  Do not re-propose a rounded font.
- **One UI material.** Panels, cards, and sheets are built from four `:root` custom properties in
  `styles.css`: `--ui-paper` (the warm paper gradient), `--ui-edge` (2px border), `--ui-sheen`
  (inset top highlight), `--ui-lift` (the layered drop shadow). New surfaces use these, not
  one-off gradients and shadows. They are on `:root` on purpose: the controls and the nav live
  outside `.scene-wrap`, so scoping them there left those elements with no background at all.
- **One icon family.** All icons are inline SVG: `viewBox="0 0 24 24"`, `fill="none"`,
  `stroke="currentColor"`, `stroke-width="2"`, round caps and joins. `const ICON = {…}` in `app.js`
  is the shared map for JS-built icons; `.ico` sizes them to `1em` inside a label and `.nav-svg`
  fills the nav slot. **No emoji is ever used AS AN ICON** — do not reintroduce one as a shortcut.
  (A few emoji do survive inside body copy: the reward dialog, the pong hint and the two
  "Made with" lines. Those are decoration, not structure. The break-panel titles had them and
  they were removed in Aug 2026.)
- **Break mode has a near plane.** `.fg-desk` draws a desk in FRONT of the room, its top edge
  `--desk-rise` above the floor line, so it occludes the bedroom art's own drawn floorboards.
  That is the fix for the double-floor seam: the room's floor and any code-drawn floor are in
  different perspectives and can never be matched, only hidden. Do not "restore" the floor there.
- Interactive targets have a **44px minimum hit area**.

## Collaboration

- Two people work on this repo (both push to `feature-work`). **Pull/rebase before you start** to avoid conflicts. If you see uncommitted changes that aren't yours (e.g. outreach tracking files), stash around them rather than committing them.
- Prefer separate branches for big parallel work, then merge.

## Current status (as of 2026-08-21)

- **Shipped and live.** v1.0 (~Jul 30 2026), v1.0.1 (build 6) live Aug 4, v1.1.0 (build 7)
  approved. The web app is live at https://mrtapioca.me and auto-deploys from `feature-work`.
- **1.1.1 / build 11 is UPLOADED to App Store Connect (Aug 20 2026), VALID, on TestFlight, and
  ATTACHED to the 1.1.1 version (state PREPARE_FOR_SUBMISSION — not yet submitted).** It is the
  candidate. **Builds 8, 9 and 10 are SUPERSEDED — never submit them.** Build 11 carries: the
  music/Spotify audio-session fix (AppDelegate `.playback + .mixWithOthers`), pause now keeps
  blocked apps locked with a deliberate "End", 90%-fewer-pearls when a session blocks nothing,
  the native auto-unblock at session end (a scheduled DeviceActivity clears the shield with the
  app closed), and ~30 review/audit bug fixes. Remaining before it ships, all owner steps: run
  the physical-iPhone gates, set the App Privacy labels, tap Submit.
- **The release wrapper signs headlessly via the App Store Connect API key.**
  `tools/export-ios-release.mjs` passes `-authenticationKey*` read from
  `~/.appstoreconnect/config.json`, so a build exports + uploads with NO Xcode account signed in
  (that is how build 11 shipped). ⚠️ `verify-ios-archive.mjs` and `verify-ios-ipa.mjs` each hard-code
  `expectedBuild` — bump it (and the fixtures in the ios-* tests) every build, or the archive
  verifier rejects the new build.
- The generated web and iOS bundles are release inputs, not hand-edited source.
  `npm run ios:release-setup` regenerates them; the archive wrapper refuses stale
  source → www → iOS parity or a dirty worktree (untracked files included — stash them).
- Aug 4 2026 was a large visual overhaul: sprite sheets deleted in favor of poses, break mode
  rebuilt as a real bedroom, drawn art for the counter and all three game boards, the `--ui-*`
  material system, and one inline-SVG icon family replacing every last emoji in UI chrome.
- The old Build 4 rejection (support URL, IAPs not attached, iPad UI, Screen Time discoverability)
  is fully resolved and shipped. `REJECTION_RESPONSE.md` is kept for reference only.
- `IAP_SETUP.md` documents the 6 in-app purchases. `APP_STORE_LISTING.md` has all store copy.
- TestFlight beta is live (public link in the Business/TestFlight section of App Store Connect).
- Traction is still early: friends and family plus a small number of test purchases. Do not describe
  the userbase as large or as an established customer base.
