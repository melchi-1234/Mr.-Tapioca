# Chrome Web Store listing — Mr. Tapioca Focus

Everything below is ready to paste into the Chrome Web Store developer dashboard.
Upload file: `mr-tapioca-focus.zip` (in the repo root). Screenshots: the two
1280x800 PNGs in `chrome-store/screenshots/`.

---

## Item name
Mr. Tapioca Focus

## Summary (short description, max 132 chars)
Block distracting sites while you focus. A cozy boba mascot brews your drink until your session is done.

## Category
Workflow & Planning

## Language
English

## Detailed description
Mr. Tapioca Focus keeps you off the sites that eat your time, so you can actually get things done.

Pick a focus length, 25, 50, or 90 minutes, and hit start. While your session runs, the sites you find distracting (YouTube, Instagram, TikTok, Reddit and more) are locked behind a cozy "stay focused" page, with a little tapioca-pearl mascot mixing your bubble tea and a countdown until you are free. When the time is up, everything unlocks and you get a gentle "your drink is ready" nudge.

What you get:
• Choose your own list of sites to block
• Simple 25 / 50 / 90 minute sessions
• A calm, cozy block screen instead of a harsh wall
• No account, no sign-up, no ads
• Works in Chrome, Edge, Brave and other Chromium browsers

Everything stays on your device. Mr. Tapioca Focus does not collect or send any of your data.

Part of Mr. Tapioca, a cozy focus app. The iPhone app blocks whole apps with Apple Screen Time; this extension blocks distracting sites in your browser.

## Single purpose (required by Chrome)
Mr. Tapioca Focus blocks a user-chosen list of distracting websites for the length of a focus timer, then unblocks them when the timer ends.

## Permission justifications (required by Chrome)
- declarativeNetRequest: Redirects the sites the user chose to block to the extension's focus page while a session is running. The rules are added when a session starts and removed when it ends.
- storage: Saves the user's chosen focus length and their blocked-site list locally on their own device.
- alarms: Ends the focus session at the scheduled time and keeps the toolbar countdown badge current.
- notifications: Shows a single notification when a focus session finishes.
- host permissions (all sites): The user can block any site they choose, so the redirect rules must be able to match any host. The extension only redirects the sites the user explicitly added to their block list, and never reads page content.

## Data usage / privacy disclosures (answer in the "Privacy practices" tab)
- Does this item collect user data? No.
- The extension stores the focus length and block list locally via chrome.storage. Nothing is transmitted to any server, and there are no analytics or trackers.
- Privacy policy URL: https://mrtapioca.me/chrome.html#privacy

## Notes for review
- The extension makes no network requests of its own. Blocking is done entirely with Chrome's declarativeNetRequest redirect rules.
- No remote code, no external scripts. All logic ships in the package.
