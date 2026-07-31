# Mr. Tapioca — project guide for Claude Code

A cozy boba-themed focus/study timer. Pick a drink size, start a session, and a
round tapioca-pearl mascot brews your bubble tea while you work. Finishing a
session adds the drink to your collection and earns pearls. The headline iPhone
feature is real app blocking during focus sessions via Apple's Screen Time
(Family Controls). Built as a web app first, then wrapped natively with Capacitor.

## Stack + layout

- **Plain HTML/CSS/JS, no build step.** The whole app is:
  - `index.html` — markup + all dialogs/sheets
  - `app.js` — ~5400 lines, all logic (timer, economy, games, squad, audio, map, sprite engine, native bridges)
  - `styles.css` — all styling + themes + animations
  - `sw.js` — service worker (offline + install). `const CACHE = "mr-tapioca-vNN"` MUST be bumped on every release or installed users keep the old shell.
  - `config.js` — optional Supabase keys for the live Study Squad (feature-flagged; app works fully without them). The key in here is the PUBLIC anon/publishable key by design.
  - `squad-cloud.js` — Study Squad cloud sync.
- **Assets:** `assets/` (lowercase). Character art is 500x500 PNGs; shop backgrounds 768x1344; sprite sheets under `assets/sprites/<skin>/<state>.png` with a manifest `assets/sprites/sprites.json` (each frame cell is 410x460, sheet width = frames * 410).
- **Native iOS:** Capacitor. `ios/App/` is the Xcode project. Custom Swift plugins in `ios/App/*.swift` (also mirrored in `native-ios/` as source-of-truth copies): FocusShieldPlugin (Screen Time blocking), FocusActivityPlugin (Live Activity countdown), IAPPlugin (StoreKit 2 purchases). `tools/register-ios-plugins.mjs` re-registers them after `cap copy`.

## How to run / preview

- Serve the folder and open in a browser: `python3 -m http.server 4173` then visit `http://127.0.0.1:4173`. (The app registers a service worker; clear it + caches when testing CSS/JS edits, or serve from a fresh port.)
- Visual QC is done headless with puppeteer-core driving system Chrome at iPhone viewport (see scratchpad scripts from past sessions). Point it at your local server, seed `localStorage.bobaFocusOnboarded="true"` + `bobaFocusTourDone="1"` to skip onboarding.

## Where it lives

- **LIVE ON THE APP STORE:** https://apps.apple.com/app/id6786023560
  Apple ID `6786023560`, bundle `com.melchior.mrtapioca`, SKU `mrtapioca001`.
  That short `/app/id…` form is the one to share: it redirects and localizes to
  the visitor's own country store.

## How to deploy

- **Web app is LIVE via GitHub Pages** from the `feature-work` branch:
  https://melchi-1234.github.io/Mr.-Tapioca/ — **every push to `feature-work` auto-deploys** within a few minutes. Bump the `sw.js` CACHE version so clients pick it up.
- **Landing page** (separate, Higgsfield-hosted): https://icy-plaza-859.higgsfield.app
- **iOS:** bump build number in Xcode → Archive → Upload to App Store Connect. Run `npm run copyweb && npx cap copy ios && node tools/register-ios-plugins.mjs` first to sync the web bundle + plugins into the native project.

## Conventions

- **User-facing copy avoids em-dashes** (house style — they read as AI-generated). Use periods, commas, or parentheses.
- Keep the cozy kawaii tone: warm, friendly, boba puns welcome.
- Match existing comment density and naming when editing.
- The economy must stay fair: pearls come from real focus time (~4/hour). Never introduce a way to farm or double-credit pearls.

## Collaboration

- Two people work on this repo (both push to `feature-work`). **Pull/rebase before you start** to avoid conflicts. If you see uncommitted changes that aren't yours (e.g. outreach tracking files), stash around them rather than committing them.
- Prefer separate branches for big parallel work, then merge.

## Current status (as of early July 2026)

- Submitted to the App Store; first submission (Build 4) was rejected on standard first-timer checklist items (support URL, IAPs not attached to the submission, iPad UI, Screen Time discoverability). All four are fixed in code. **Build 5 is the resubmission** and also carries: iPhone-only, a prominent app-blocking prompt at Start Focus, new skins/themes, real frame animations, and fixes from two multi-agent regression audits.
- `REJECTION_RESPONSE.md` has the exact resubmission steps + the reply to Apple.
- `IAP_SETUP.md` documents the 6 in-app purchases. `APP_STORE_LISTING.md` has all store copy.
- TestFlight beta is live (public link in the Business/TestFlight section of App Store Connect).
